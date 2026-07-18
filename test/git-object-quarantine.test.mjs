import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { GitObjectQuarantine } from "../dist/git/objectQuarantine.js";

async function looseObject(root, content, objectFormat = "sha1") {
  const body = Buffer.from(content, "utf8");
  const loose = Buffer.concat([Buffer.from(`blob ${body.length}\0`, "utf8"), body]);
  const oid = createHash(objectFormat).update(loose).digest("hex");
  const file = path.join(root, oid.slice(0, 2), oid.slice(2));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, deflateSync(loose));
  return oid;
}

async function withRoots(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-git-quarantine-"));
  const quarantineRoot = path.join(root, "quarantine");
  const commonDir = path.join(root, "repo.git");
  await fs.mkdir(path.join(commonDir, "objects"), { recursive: true });
  try {
    await callback({ root, quarantineRoot, commonDir });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("object promotion journals each immutable object and is idempotent", async () => {
  await withRoots(async ({ quarantineRoot, commonDir }) => {
    const oid = await looseObject(quarantineRoot, "safe content\n");
    const transitions = [];
    const quarantine = new GitObjectQuarantine({
      journal: async (event) => transitions.push(`${event.transition}:${event.oid}`)
    });
    const first = await quarantine.promote({
      repository: { commonDir, objectFormat: "sha1" },
      quarantineRoot,
      objects: [{ oid }]
    });
    assert.deepEqual(first, [{ oid, status: "promoted" }]);
    assert.deepEqual(transitions, [`promotion_planned:${oid}`, `promoted:${oid}`]);
    await fs.rm(path.join(quarantineRoot, oid.slice(0, 2), oid.slice(2)));
    const second = await quarantine.promote({
      repository: { commonDir, objectFormat: "sha1" },
      quarantineRoot,
      objects: [{ oid }]
    });
    assert.deepEqual(second, [{ oid, status: "already_present" }]);
    assert.equal((await fs.stat(path.join(commonDir, "objects", oid.slice(0, 2), oid.slice(2)))).isFile(), true);
  });
});

test("object promotion never overwrites a mismatched existing destination", async () => {
  await withRoots(async ({ quarantineRoot, commonDir }) => {
    const oid = await looseObject(quarantineRoot, "expected\n");
    const destination = path.join(commonDir, "objects", oid.slice(0, 2), oid.slice(2));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, deflateSync(Buffer.from("blob 6\0wrong\n", "utf8")));
    const before = await fs.readFile(destination);
    const quarantine = new GitObjectQuarantine({ journal: async () => {} });
    await assert.rejects(
      quarantine.promote({ repository: { commonDir, objectFormat: "sha1" }, quarantineRoot, objects: [{ oid }] }),
      /GIT_RECOVERY_REQUIRED/
    );
    assert.deepEqual(await fs.readFile(destination), before);
    assert.equal((await fs.stat(path.join(quarantineRoot, oid.slice(0, 2), oid.slice(2)))).isFile(), true);
  });
});

test("object promotion rejects a symlinked object directory without writing outside the repository", async () => {
  await withRoots(async ({ root, quarantineRoot, commonDir }) => {
    const oid = await looseObject(quarantineRoot, "outside escape\n");
    const objectRoot = path.join(commonDir, "objects");
    const outside = path.join(root, "outside-objects");
    await fs.rm(objectRoot, { recursive: true, force: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.symlink(outside, objectRoot, process.platform === "win32" ? "junction" : "dir");
    const quarantine = new GitObjectQuarantine({ journal: async () => {} });
    await assert.rejects(
      quarantine.promote({ repository: { commonDir, objectFormat: "sha1" }, quarantineRoot, objects: [{ oid }] }),
      /GIT_RECOVERY_REQUIRED/
    );
    await assert.rejects(
      fs.stat(path.join(outside, oid.slice(0, 2), oid.slice(2))),
      { code: "ENOENT" }
    );
  });
});
