import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PathGuard } from "../dist/guard.js";
import { AtomicWorkspaceFs } from "../dist/transactions/index.js";

async function withWorkspace(action) {
  const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-atomic-fs-"));
  const root = await fsp.realpath(temporaryRoot);
  const workspace = { id: "ws_fixture", root, openedAt: "2026-07-14T00:00:00.000Z" };
  const config = { blockedGlobs: ["**/blocked/**"], maxWriteBytes: 1024 * 1024 };
  const atomicFs = new AtomicWorkspaceFs(config, new PathGuard(config), workspace);
  try {
    return await action({ root, workspace, atomicFs, config });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test("inspection hashes exact bytes and rejects unsafe target kinds", () => withWorkspace(async ({ root, atomicFs }) => {
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a\r\nb\r\n", "utf8")]);
  await fsp.writeFile(path.join(root, "exact.txt"), bytes);
  const inspected = await atomicFs.inspect("exact.txt");
  assert.equal(inspected.before.exists, true);
  assert.equal(inspected.before.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(inspected.before.bytes, bytes.length);

  await fsp.mkdir(path.join(root, "directory"));
  await assert.rejects(() => atomicFs.inspect("directory"));
  await assert.rejects(() => atomicFs.inspect(".codexgpt-txn-aaaaaaaaaaaaaaaa.stage"));
  await fsp.mkdir(path.join(root, "blocked"));
  await fsp.writeFile(path.join(root, "blocked", "x.txt"), "x");
  await assert.rejects(() => atomicFs.inspect("blocked/x.txt"));

  const symlink = path.join(root, "link.txt");
  try {
    await fsp.symlink(path.join(root, "exact.txt"), symlink);
    await assert.rejects(() => atomicFs.inspect("link.txt"));
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
  }
}));

test("create staging is synced, verified, installed with no-clobber, and rolled back safely", () => withWorkspace(async ({ root, atomicFs }) => {
  const prepared = await atomicFs.stageCreate("op_create_a", "new.txt", Buffer.from("new\r\n", "utf8"));
  assert.match(path.basename(prepared.stageAbsPath), /^\.codexgpt-txn-[a-f0-9]{16}\.stage$/);
  assert.equal(await fsp.readFile(prepared.stageAbsPath, "utf8"), "new\r\n");
  const installed = await atomicFs.install(prepared);
  assert.equal(await fsp.readFile(path.join(root, "new.txt"), "utf8"), "new\r\n");
  await atomicFs.rollback(installed);
  await assert.rejects(() => fsp.stat(path.join(root, "new.txt")), { code: "ENOENT" });
  await atomicFs.finalize(installed);

  const noClobber = await atomicFs.stageCreate("op_create_b", "raced.txt", Buffer.from("ours"));
  await fsp.writeFile(path.join(root, "raced.txt"), "external", "utf8");
  await assert.rejects(
    () => atomicFs.install(noClobber),
    (error) => error.code === "FILE_VERSION_CONFLICT"
  );
  assert.equal(await fsp.readFile(path.join(root, "raced.txt"), "utf8"), "external");
  await atomicFs.finalize(noClobber);
}));

test("replace creates a hard-link backup and rollback restores exact old bytes", () => withWorkspace(async ({ root, atomicFs }) => {
  const target = path.join(root, "replace.txt");
  const oldBytes = Buffer.from([0, 1, 2, 3, 13, 10]);
  await fsp.writeFile(target, oldBytes);
  const before = await atomicFs.inspect("replace.txt");
  const prepared = await atomicFs.stageReplace(
    "op_replace_a",
    "replace.txt",
    Buffer.from("replacement", "utf8"),
    before.before.sha256
  );
  assert.ok(prepared.backupAbsPath);
  assert.deepEqual(await fsp.readFile(prepared.backupAbsPath), oldBytes);
  const installed = await atomicFs.install(prepared);
  assert.equal(await fsp.readFile(target, "utf8"), "replacement");
  await atomicFs.rollback(installed);
  assert.deepEqual(await fsp.readFile(target), oldBytes);
  await atomicFs.finalize(installed);
}));

test("guarded delete backs up, unlinks, and restores without clobber", () => withWorkspace(async ({ root, atomicFs }) => {
  const target = path.join(root, "delete.txt");
  await fsp.writeFile(target, "old", "utf8");
  const before = await atomicFs.inspect("delete.txt");
  const prepared = await atomicFs.stageDelete("op_delete_a", "delete.txt", before.before.sha256);
  const installed = await atomicFs.install(prepared);
  await assert.rejects(() => fsp.stat(target), { code: "ENOENT" });
  await atomicFs.rollback(installed);
  assert.equal(await fsp.readFile(target, "utf8"), "old");
  await atomicFs.finalize(installed);
}));

test("hard-link capability failures never fall back to direct writes", () => withWorkspace(async ({ workspace, config }) => {
  const injected = new AtomicWorkspaceFs(config, new PathGuard(config), workspace, {
    async link() {
      const error = new Error("unsupported");
      error.code = "EXDEV";
      throw error;
    }
  });
  await assert.rejects(
    () => injected.stageCreate("op_create_a", "x.txt", Buffer.from("x")),
    (error) => error.code === "ATOMIC_BACKEND_UNAVAILABLE"
  );
  assert.equal(fs.existsSync(path.join(workspace.root, "x.txt")), false);
}));
