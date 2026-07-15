import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const childScript = fileURLToPath(new URL("../fixtures/phase-3d-move-lock-child.mjs", import.meta.url));

function startChild(input) {
  const child = spawn(process.execPath, [childScript, JSON.stringify(input)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return { child, exited };
}

async function waitFor(file, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fsp.stat(file);
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${path.basename(file)}.`);
}

async function runLockContention(aliasTransform = (value) => value) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-phase3d-lock-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  const readyPath = path.join(root, "holder.ready");
  const releasePath = path.join(root, "holder.release");
  await fsp.mkdir(workspaceRoot);
  await fsp.writeFile(path.join(workspaceRoot, "a.txt"), "alpha");
  const holder = startChild({
    mode: "holder",
    stateRoot,
    workspaceRoot,
    readyPath,
    releasePath
  });
  try {
    await waitFor(readyPath);
    const contender = startChild({
      mode: "contender",
      stateRoot,
      workspaceRoot: aliasTransform(workspaceRoot),
      readyPath,
      releasePath
    });
    const contenderExit = await contender.exited;
    assert.equal(contenderExit.code, 73, contenderExit.stderr || contenderExit.stdout);
    assert.deepEqual(JSON.parse(contenderExit.stdout), { code: "TRANSACTION_BUSY" });
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "a.txt"), "utf8"), "alpha");
    await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "b.txt")), { code: "ENOENT" });

    await fsp.writeFile(releasePath, "release");
    const holderExit = await holder.exited;
    assert.equal(holderExit.code, 0, holderExit.stderr || holderExit.stdout);
    await assert.rejects(() => fsp.stat(path.join(workspaceRoot, "a.txt")), { code: "ENOENT" });
    assert.equal(await fsp.readFile(path.join(workspaceRoot, "b.txt"), "utf8"), "alpha");
    assert.deepEqual(
      (await fsp.readdir(workspaceRoot)).filter((name) => name.startsWith(".codexpro-txn-")),
      []
    );
  } finally {
    if (holder.child.exitCode === null) holder.child.kill();
    await Promise.allSettled([holder.exited]);
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test("independent processes sharing one root and state root serialize move ownership", () =>
  runLockContention());

test("native Windows path aliases resolve to one process lock identity", {
  skip: process.platform !== "win32"
}, () => runLockContention((value) => value.toLocaleLowerCase("en-US")));
