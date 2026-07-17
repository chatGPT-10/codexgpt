import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { processCreationTime } from "../scripts/long-task-runner.mjs";
import {
  readLocalControlState,
  validateServerId
} from "../scripts/windows-local-control-spike.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repositoryRoot, "scripts", "windows-local-control-spike.mjs");

async function temporaryRoot(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-control-state-test-"));
  t.after(async () => fsp.rm(root, { recursive: true, force: true }));
  return root;
}

async function stateRecord(serverId, overrides = {}) {
  const creation = await processCreationTime(process.pid);
  assert.ok(creation);
  return {
    schemaVersion: 1,
    serverId,
    nonce: randomBytes(32).toString("hex"),
    keyDigest: createHash("sha256").update(randomBytes(32)).digest("hex"),
    pid: process.pid,
    processCreationTime: creation,
    pipePath: `\\\\.\\pipe\\codexpro-control-${serverId}`,
    ...overrides
  };
}

async function writeState(root, serverId, overrides = {}) {
  const state = await stateRecord(serverId, overrides);
  const statePath = path.join(root, `${serverId}.json`);
  await fsp.writeFile(statePath, `${JSON.stringify(state)}\n`, { flag: "wx" });
  return { state, statePath };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code, `expected ${code}`);
}

test("local control discovery requires an explicit random server selector and never chooses latest", async (t) => {
  const root = await temporaryRoot(t);
  const firstId = randomBytes(16).toString("hex");
  const secondId = randomBytes(16).toString("hex");
  await writeState(root, firstId);
  await writeState(root, secondId);

  assert.equal(validateServerId(firstId.toUpperCase()), firstId);
  await rejectsCode(Promise.resolve().then(() => validateServerId("latest")), "INVALID_SERVER_ID");
  await rejectsCode(Promise.resolve().then(() => validateServerId("")), "INVALID_SERVER_ID");

  const first = await readLocalControlState(root, firstId);
  const second = await readLocalControlState(root, secondId);
  assert.equal(first.state.serverId, firstId);
  assert.equal(second.state.serverId, secondId);
  await assert.rejects(readLocalControlState(root, randomBytes(16).toString("hex")), { code: "ENOENT" });
});

test("local control state binds PID creation time, nonce, server id, and exact pipe name", async (t) => {
  const variants = [
    ["CONTROL_SERVER_STALE", { processCreationTime: "2000-01-01T00:00:00.0000000Z" }],
    ["CONTROL_STATE_INVALID", { nonce: "not-a-nonce" }],
    ["CONTROL_STATE_MISMATCH", { serverId: randomBytes(16).toString("hex") }],
    ["CONTROL_STATE_INVALID", { pipePath: "\\\\.\\pipe\\codexpro-control-wrong" }]
  ];
  for (const [expected, override] of variants) {
    const root = await temporaryRoot(t);
    const serverId = randomBytes(16).toString("hex");
    await writeState(root, serverId, override);
    await rejectsCode(readLocalControlState(root, serverId), expected);
  }
});

test("local control state rejects hard links and state-file reparse replacement", async (t) => {
  const hardlinkRoot = await temporaryRoot(t);
  const hardlinkId = randomBytes(16).toString("hex");
  const { statePath } = await writeState(hardlinkRoot, hardlinkId);
  await fsp.link(statePath, path.join(hardlinkRoot, "attacker-link.json"));
  await rejectsCode(readLocalControlState(hardlinkRoot, hardlinkId), "CONTROL_STATE_FILE_UNSAFE");

  const symlinkRoot = await temporaryRoot(t);
  const symlinkId = randomBytes(16).toString("hex");
  const target = path.join(symlinkRoot, "attacker-state.json");
  await fsp.writeFile(target, `${JSON.stringify(await stateRecord(symlinkId))}\n`);
  const stateLink = path.join(symlinkRoot, `${symlinkId}.json`);
  try {
    await fsp.symlink(target, stateLink, "file");
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") return;
    throw error;
  }
  await rejectsCode(readLocalControlState(symlinkRoot, symlinkId), "CONTROL_STATE_REPLACED");
});

test("local control state rejects a reparse-point discovery root", async (t) => {
  const parent = await temporaryRoot(t);
  const realRoot = path.join(parent, "real");
  const linkedRoot = path.join(parent, "linked");
  await fsp.mkdir(realRoot);
  const serverId = randomBytes(16).toString("hex");
  await writeState(realRoot, serverId);
  try {
    await fsp.symlink(realRoot, linkedRoot, "junction");
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") return;
    throw error;
  }
  await rejectsCode(readLocalControlState(linkedRoot, serverId), "CONTROL_STATE_ROOT_UNSAFE");
});

test("state discovery reads through one bound file handle and revalidates the path identity", async () => {
  const source = await fsp.readFile(sourcePath, "utf8");
  assert.match(source, /fsp\.open\(statePath, "r"\)/);
  assert.match(source, /before = await handle\.stat\(\)/);
  assert.match(source, /raw = await handle\.readFile/);
  assert.match(source, /after = await handle\.stat\(\)/);
  assert.match(source, /pathAfter = await fsp\.lstat\(statePath\)/);
  assert.match(source, /CONTROL_STATE_ROOT_REPLACED/);
});
