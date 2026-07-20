import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runDoctor(args, env = {}) {
  return spawnSync(process.execPath, ["scripts/doctor.mjs", "--shell-check-only", ...args], {
    cwd: path.resolve("."),
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true
  });
}

function runFullDoctor(args, env = {}) {
  return spawnSync(process.execPath, ["scripts/doctor.mjs", ...args], {
    cwd: path.resolve("."),
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => port ? resolve(port) : reject(new Error("No free port available")));
    });
  });
}

test("doctor reports an unavailable Bash executable before command execution", () => {
  const result = runDoctor(["--no-profile"], {
    CODEXGPT_DOCTOR_BASH_COMMAND: "codexgpt-definitely-missing-bash-command"
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /FAIL Bash executable/);
  assert.match(output, /Bash was not found/);
  if (process.platform === "win32") {
    assert.match(output, /Git Bash/);
    assert.match(output, /PowerShell backend/);
  }
});

test("doctor does not require a Bash executable when Bash mode is off", () => {
  const result = runDoctor(["--no-bash"], {
    CODEXGPT_DOCTOR_BASH_COMMAND: "codexgpt-definitely-missing-bash-command"
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /not required because Bash mode is off/);
});

test("doctor inherits Bash off from the saved workspace profile", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-doctor-root-"));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-doctor-home-"));

  try {
    const realRoot = fsSync.realpathSync.native(root);
    const profileId = createHash("sha256").update(realRoot).digest("hex").slice(0, 24);
    const profileDir = path.join(home, "profiles");
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(path.join(profileDir, `${profileId}.json`), JSON.stringify({
      version: 1,
      root: realRoot,
      bash: "off",
      write: "off",
      toolMode: "standard"
    }), "utf8");

    const result = runDoctor(["--root", realRoot], {
      CODEXGPT_HOME: home,
      CODEXGPT_DOCTOR_BASH_COMMAND: "codexgpt-definitely-missing-bash-command"
    });
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0);
    assert.match(output, /not required because Bash mode is off/);
    assert.doesNotMatch(output, /FAIL Bash executable/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("full doctor --no-profile skips saved profile validation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-doctor-no-profile-root-"));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-doctor-no-profile-home-"));

  try {
    const realRoot = fsSync.realpathSync.native(root);
    const profileId = createHash("sha256").update(realRoot).digest("hex").slice(0, 24);
    const profileDir = path.join(home, "profiles");
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(path.join(profileDir, `${profileId}.json`), JSON.stringify({
      version: 1,
      root: realRoot,
      bash: "banana",
      write: "banana",
      toolMode: "banana"
    }), "utf8");

    const result = runFullDoctor([
      "--no-profile",
      "--root", realRoot,
      "--port", String(await freePort()),
      "--tunnel", "none",
      "--no-bash"
    ], {
      CODEXGPT_HOME: home,
      CODEXGPT_DOCTOR_BASH_COMMAND: "codexgpt-definitely-missing-bash-command"
    });
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0);
    assert.doesNotMatch(output, /invalid saved value/);
    assert.doesNotMatch(output, /FAIL Saved profile/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("full doctor preserves the caller workspace when --root is omitted", async () => {
  const callerRoot = fsSync.realpathSync.native(path.resolve("test"));
  const result = spawnSync(process.execPath, [
    path.resolve("scripts/doctor.mjs"),
    "--no-profile",
    "--port", String(await freePort()),
    "--tunnel", "none",
    "--no-bash"
  ], {
    cwd: callerRoot,
    env: {
      ...process.env,
      CODEXGPT_DOCTOR_BASH_COMMAND: "codexgpt-definitely-missing-bash-command"
    },
    encoding: "utf8",
    windowsHide: true
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.ok(output.includes(callerRoot), output);
});
