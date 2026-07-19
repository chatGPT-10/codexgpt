import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

import { runGitCapabilityProbe } from "../scripts/git-capability-spike.mjs";
import { WindowsHostGitExecutor } from "../dist/git/execution.js";

const {
  WindowsProcessHostClient,
  WindowsProcessHostRuntime
} = await tsImport("../fixtures/ts-imports/process-host-imports.ts", import.meta.url);
const windowsOnly = process.platform === "win32" ? test : test.skip;

function git(root, args, input) {
  const result = spawnSync("git", args, {
    cwd: root,
    input,
    encoding: null,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
  return result.stdout ?? Buffer.alloc(0);
}

windowsOnly("Gate G0 proves the exact Git executable and safe native-host capsule", async (t) => {
  const host = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(() => host.close());

  const evidence = await runGitCapabilityProbe({
    host,
    repositoryRoot: path.resolve("."),
    scriptsRoot: path.resolve("scripts"),
    fixturesRoot: path.resolve("fixtures")
  });

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.gate, "G0");
  assert.equal(evidence.status, "passed");
  assert.match(evidence.capabilityRevision, /^[a-f0-9]{64}$/);
  assert.match(evidence.git.sha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.git.identity, /^sha256:[a-f0-9]{64}:dev:\d+:ino:\d+$/);
  assert.match(evidence.git.version, /^git version \d+\.\d+\.\d+/);
  assert.equal(path.basename(evidence.git.path).toLocaleLowerCase("en-US"), "git.exe");
  assert.equal(evidence.git.path.toLocaleLowerCase("en-US").includes("\\git\\cmd\\git.exe"), true);

  assert.deepEqual(evidence.features, {
    objectFormat: "sha1",
    worktreeListPorcelainZ: true,
    statusPorcelainV2: true,
    externalConfigIsolation: true,
    externalDiffAndTextconvDisabled: true,
    rawHashObject: true,
    privateIndex: true,
    commitTree: true,
    expectedOldRefUpdate: true,
    objectOnlyMerge: true,
    mergeConflictStatus: true,
    quarantineRejectedObjectsPromoted: 0
  });
  assert.deepEqual(evidence.canaries, {
    positiveControlExecutions: 1,
    safeModeExecutions: 0
  });
  assert.equal(evidence.host.jobAssignedAtCreation, true);
  assert.equal(evidence.host.exactHandleList, true);
  assert.equal(evidence.host.imageIdentityVerified, true);
  assert.equal(evidence.host.processTreeControl, "job_object_members_only");
  assert.equal(evidence.host.brokerEscapeResistance, "none");
  assert.equal(evidence.executionIsolation, "none");
  assert.equal(evidence.repositoryIntegrations, "disabled");
  assert.equal(evidence.remotePolicy, "deny_all");
  assert.equal(evidence.promptPolicy, "fail_closed");
});

windowsOnly("the real Windows host carries large Git output and a typed Gate X private stage", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-git-host-control-"));
  const runtime = new WindowsProcessHostRuntime({ scriptsRoot: path.resolve("scripts") });
  let executor;
  t.after(async () => {
    await executor?.dispose().catch(() => {});
    await runtime.close().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  });
  git(root, ["init"]);
  git(root, ["config", "user.name", "CodexPro Test"]);
  git(root, ["config", "user.email", "codexpro@example.invalid"]);
  const large = Buffer.alloc(2 * 1024 * 1024, 0x71);
  await fs.writeFile(path.join(root, "tracked.bin"), large);
  await fs.writeFile(path.join(root, "tracked.txt"), "first\n", "utf8");
  git(root, ["add", "tracked.bin", "tracked.txt"]);
  git(root, ["commit", "-m", "initial"]);
  const gitPath = spawnSync("where.exe", ["git.exe"], { encoding: "utf8", windowsHide: true }).stdout
    .split(/\r?\n/u).map((entry) => entry.trim()).find((entry) => /\\Git\\cmd\\git\.exe$/iu.test(entry));
  assert.ok(gitPath);
  executor = await WindowsHostGitExecutor.start({ hostRuntime: runtime, explicitGitPath: gitPath });
  const gitDir = path.join(root, ".git");
  const repository = {
    worktreeRoot: root,
    gitDir,
    commonDir: gitDir,
    objectFormat: "sha1"
  };
  const oid = git(root, ["rev-parse", "HEAD:tracked.bin"]).toString("ascii").trim();
  const read = await executor.run(repository, ["cat-file", "blob", oid], {
    stdoutLimitBytes: large.length
  });
  assert.equal(read.status, 0);
  assert.deepEqual(read.stdout, large);

  await fs.writeFile(path.join(root, "tracked.txt"), "second\n", "utf8");
  const privateRoot = await executor.createPrivateDirectory("gate-x-control");
  const privateIndexPath = path.join(privateRoot, "index");
  const objectDirectoryPath = path.join(privateRoot, "objects");
  const integrationGitDir = path.join(privateRoot, "integration.git");
  const hooksPath = path.join(privateRoot, "hooks");
  await fs.copyFile(path.join(gitDir, "index"), privateIndexPath);
  await fs.mkdir(objectDirectoryPath);
  await fs.mkdir(hooksPath);
  await fs.mkdir(path.join(integrationGitDir, "objects"), { recursive: true });
  await fs.mkdir(path.join(integrationGitDir, "refs"), { recursive: true });
  await fs.writeFile(path.join(integrationGitDir, "HEAD"), "ref: refs/heads/main\n", "utf8");
  await fs.writeFile(path.join(integrationGitDir, "config"), "[core]\n\trepositoryformatversion = 0\n\tbare = false\n", "utf8");
  const liveIndexBefore = await fs.readFile(path.join(gitDir, "index"));
  const staged = await executor.runApprovedIntegration(repository, {
    operation: "stage",
    paths: ["tracked.txt"],
    privateIndexPath,
    objectDirectoryPath,
    integrationGitDir,
    integrationConfigOverrides: [],
    hooksPath
  });
  assert.equal(staged.status, 0, staged.stderr.toString("utf8"));
  assert.notDeepEqual(await fs.readFile(privateIndexPath), liveIndexBefore);
  assert.deepEqual(await fs.readFile(path.join(gitDir, "index")), liveIndexBefore);
});
