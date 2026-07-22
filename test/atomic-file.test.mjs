import assert from "node:assert/strict";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeJsonAtomicFile, writeJsonAtomicFileSync } from "../scripts/atomic-file.mjs";

test("an atomic JSON rename failure removes its exact adjacent temporary file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-atomic-file-"));
  try {
    const target = path.join(directory, "state.json");
    await fs.writeFile(target, "{\"old\":true}\n", "utf8");
    let temporary;
    await assert.rejects(
      writeJsonAtomicFile(target, { next: true }, {
        rename: async (source) => {
          temporary = source;
          const error = new Error("injected rename failure");
          error.code = "EACCES";
          throw error;
        }
      }),
      (error) => error?.code === "EACCES"
    );
    assert.equal(await fs.readFile(target, "utf8"), "{\"old\":true}\n");
    assert.ok(temporary?.startsWith(`${target}.`));
    assert.equal(temporary?.endsWith(".tmp"), true);
    assert.deepEqual(await fs.readdir(directory), ["state.json"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("asynchronous atomic JSON replacement retries transient sharing failures", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-atomic-file-async-"));
  try {
    const target = path.join(directory, "state.json");
    await fs.writeFile(target, "{\"old\":true}\n", "utf8");
    let attempts = 0;
    await writeJsonAtomicFile(target, { next: true }, {
      rename: async (source, destination) => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error("injected sharing violation");
          error.code = "EPERM";
          throw error;
        }
        await fs.rename(source, destination);
      }
    });
    assert.equal(attempts, 3);
    assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { next: true });
    assert.deepEqual(await fs.readdir(directory), ["state.json"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("synchronous atomic JSON writes replace the target without leaving adjacent temporary files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-atomic-file-sync-"));
  try {
    const target = path.join(directory, "state.json");
    await fs.writeFile(target, "{\"old\":true}\n", "utf8");
    writeJsonAtomicFileSync(target, { next: true });
    assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { next: true });
    assert.deepEqual(await fs.readdir(directory), ["state.json"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("synchronous atomic JSON replacement retries transient sharing failures", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-atomic-file-sync-"));
  try {
    const target = path.join(directory, "state.json");
    await fs.writeFile(target, "{\"old\":true}\n", "utf8");
    let attempts = 0;
    writeJsonAtomicFileSync(target, { next: true }, {
      rename: (source, destination) => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error("injected sharing violation");
          error.code = "EPERM";
          throw error;
        }
        fsSync.renameSync(source, destination);
      }
    });
    assert.equal(attempts, 3);
    assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { next: true });
    assert.deepEqual(await fs.readdir(directory), ["state.json"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("synchronous atomic JSON rename failure removes its exact adjacent temporary file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-atomic-file-sync-"));
  try {
    const target = path.join(directory, "state.json");
    await fs.writeFile(target, "{\"old\":true}\n", "utf8");
    let temporary;
    assert.throws(
      () => writeJsonAtomicFileSync(target, { next: true }, {
        rename: (source) => {
          temporary = source;
          const error = new Error("injected rename failure");
          error.code = "EXDEV";
          throw error;
        }
      }),
      (error) => error?.code === "EXDEV"
    );
    assert.equal(await fs.readFile(target, "utf8"), "{\"old\":true}\n");
    assert.ok(temporary?.startsWith(`${target}.`));
    assert.equal(temporary?.endsWith(".tmp"), true);
    assert.deepEqual(await fs.readdir(directory), ["state.json"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("atomic JSON writes replace the target without leaving adjacent temporary files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-atomic-file-"));
  try {
    const target = path.join(directory, "state.json");
    await fs.writeFile(target, "{\"old\":true}\n", "utf8");
    await writeJsonAtomicFile(target, { next: true });
    assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { next: true });
    assert.deepEqual(await fs.readdir(directory), ["state.json"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
