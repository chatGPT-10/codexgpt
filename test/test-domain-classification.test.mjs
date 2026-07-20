import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repositoryRoot, "scripts", "test-domains.mjs");
const expectedControl = [
  "conpty-close-order-windows-control.test.mjs",
  "git-execution-windows-control.test.mjs",
  "handoff-to-agent-contract.test.mjs",
  "handoff-to-codex-contract.test.mjs",
  "local-control-pipe-windows-control.test.mjs",
  "persistent-process-production-windows-control.test.mjs",
  "phase-3d-child-crash-oracle.test.mjs",
  "phase-3d-multiprocess-lock.test.mjs",
  "process-lifecycle-windows-control.test.mjs",
  "process-local-control-cli.test.mjs",
  "run-command-windows-control.test.mjs",
  "runner-stop-identity-windows-control.test.mjs",
  "task-worktree-windows-locks.test.mjs",
  "wait-for-handoff-contract.test.mjs",
  "windows-process-host-control.test.mjs",
  "windows-process-host-integration-windows-control.test.mjs",
  "windows-sandbox-control.test.mjs",
  "worktree-windows-control.test.mjs"
];

async function execute(args, env = process.env) {
  return await execFileAsync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    env,
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024
  });
}

async function list(domain) {
  const { stdout } = await execute(["list", "--domain", domain]);
  return JSON.parse(stdout);
}

test("test domains partition every discovered test and freeze the connector-hostile set", async () => {
  const [all, ordinary, control] = await Promise.all([
    list("all"),
    list("ordinary"),
    list("control")
  ]);
  const discovered = (await fs.readdir(path.join(repositoryRoot, "test"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(all.tests, discovered);
  assert.deepEqual(control.tests, expectedControl);
  assert.equal(all.count, ordinary.count + control.count);
  assert.deepEqual(
    [...ordinary.tests, ...control.tests].sort(),
    all.tests
  );
  assert.deepEqual(
    ordinary.tests.filter((name) => expectedControl.includes(name)),
    []
  );
});

test("Windows all-domain execution is serialized while other platforms retain runtime concurrency", async () => {
  const source = await fs.readFile(script, "utf8");
  assert.match(source, /process\.platform === "win32" \? "1" : undefined/);
  assert.match(source, /nodeArgs\.push\(`--test-concurrency=\$\{concurrency\}`\)/);
});

test("connector-backed local execution fails closed for control and all domains", async () => {
  const env = { ...process.env };
  delete env.GITHUB_ACTIONS;
  delete env.CI_CONTROL_DOMAIN;
  delete env.CODEXGPT_ALLOW_CONTROL_DOMAIN_TESTS;

  for (const domain of ["control", "all"]) {
    await assert.rejects(
      execute(["run", "--domain", domain], env),
      (error) => error.code === 2 && /control-domain tests|control-domain/i.test(error.stderr)
    );
  }
});
