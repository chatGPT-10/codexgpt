import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

async function fixture(action) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-semantic-cli-"));
  const root = path.join(base, "workspace");
  const home = path.join(base, "home");
  await fs.mkdir(root);
  try {
    return await action({ root: await fs.realpath(root), home });
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}

function run(root, home, args, extraEnv = {}) {
  return spawnSync(process.execPath, ["scripts/codexgpt-entry.mjs", "semantic", ...args, "--root", root], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      CODEXGPT_HOME: home,
      CODEXGPT_SEMANTIC_MODE: undefined,
      CODEXGPT_SEMANTIC_PROVIDER: undefined,
      ...extraEnv
    },
    encoding: "utf8",
    windowsHide: true
  });
}

function runStart(root, home, extraEnv = {}) {
  return spawnSync(process.execPath, [
    "scripts/codexgpt-entry.mjs",
    "start",
    "--root", root,
    "--tunnel", "none",
    "--no-auth",
    "--print-env-only"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      CODEXGPT_HOME: home,
      CODEXGPT_SEMANTIC_MODE: undefined,
      CODEXGPT_SEMANTIC_PROVIDER: undefined,
      ...extraEnv
    },
    encoding: "utf8",
    windowsHide: true
  });
}

test("semantic use persists only the bounded Provider selector and status gives one action", () => fixture(async ({ root, home }) => {
  const enabled = run(root, home, ["use", "builtin"]);
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.match(enabled.stdout, /restart/i);
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profile = JSON.parse(await fs.readFile(path.join(home, "profiles", `${profileId}.json`), "utf8"));
  assert.equal(profile.semanticProvider, "builtin");
  assert.equal("token" in profile, false);
  assert.equal("semanticHealth" in profile, false);

  const status = run(root, home, ["status", "--verbose"]);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /builtin-typescript/);
  assert.match(status.stdout, /No setup is required/);
  assert.match(status.stdout, /execution\/filesystem\/network: none/);
  assert.doesNotMatch(status.stdout, /CODEXGPT_HTTP_TOKEN|Bearer /);
}));

test("semantic disable is one persisted restart rollback and rejects unknown Providers", () => fixture(async ({ root, home }) => {
  const disabled = run(root, home, ["disable"]);
  assert.equal(disabled.status, 0, disabled.stderr);
  const status = run(root, home, ["status"]);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /disabled/);
  assert.match(status.stdout, /semantic use builtin/);

  const invalid = run(root, home, ["use", "serena"]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /builtin\|none/);
}));

test("explicit legacy wins over a saved builtin selector and minimal disable remains launchable", () => fixture(async ({ root, home }) => {
  assert.equal(run(root, home, ["use", "builtin"]).status, 0);
  const rollback = runStart(root, home, { CODEXGPT_SEMANTIC_MODE: "legacy" });
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.match(rollback.stdout, /"CODEXGPT_SEMANTIC_MODE": "legacy"/);
  assert.doesNotMatch(rollback.stdout, /Semantic V5 exposes 52 tools/);

  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profilePath = path.join(home, "profiles", `${profileId}.json`);
  const profile = JSON.parse(await fs.readFile(profilePath, "utf8"));
  await fs.writeFile(profilePath, `${JSON.stringify({ ...profile, toolMode: "minimal" }, null, 2)}\n`);
  assert.equal(run(root, home, ["disable"]).status, 0);
  const minimal = runStart(root, home);
  assert.equal(minimal.status, 0, minimal.stderr);
  assert.match(minimal.stdout, /"CODEXGPT_TOOL_MODE": "minimal"/);
  assert.match(minimal.stdout, /"CODEXGPT_SEMANTIC_MODE": "legacy"/);
}));
