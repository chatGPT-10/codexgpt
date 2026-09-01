import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  deleteWorkspaceProfileFilesSync,
  saveWorkspaceProfileFileSync,
  workspaceProfileMigrationBackupPath
} from "../scripts/workspace-profile-persistence.mjs";

const publicLauncher = path.resolve("scripts", "codexgpt-entry.mjs");

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-profile-persistence-"));
  const profiles = path.join(base, "profiles");
  const root = fs.realpathSync.native(fs.mkdirSync(path.join(base, "workspace"), { recursive: true }));
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profilePath = path.join(profiles, `${profileId}.json`);
  return { base, profiles, root, profilePath };
}

function writeRawProfile(item, text) {
  fs.mkdirSync(item.profiles, { recursive: true });
  fs.writeFileSync(item.profilePath, text, { encoding: "utf8", mode: 0o600 });
}

function v1(root, overrides = {}) {
  return {
    version: 1,
    root,
    updatedAt: "2026-08-26T12:00:00.000Z",
    tunnel: "none",
    port: "8787",
    mode: "agent",
    bash: "off",
    write: "off",
    ...overrides
  };
}

function save(item, profile, options = {}) {
  return saveWorkspaceProfileFileSync(item.profilePath, item.root, profile, {
    now: () => new Date("2026-08-27T10:00:00.000Z"),
    ...options
  });
}

test("an explicit save migrates v1 to v2 only after preserving exact source bytes", () => {
  const item = fixture();
  try {
    const original = `${JSON.stringify(v1(item.root), null, 4)}\n`;
    writeRawProfile(item, original);

    const result = save(item, { tunnel: "none", port: "8788", mode: "agent", bash: "off", write: "off" });
    const backupPath = workspaceProfileMigrationBackupPath(item.profilePath, 1);

    assert.equal(result.migratedFrom, 1);
    assert.equal(result.backupPath, backupPath);
    assert.equal(fs.readFileSync(backupPath, "utf8"), original);
    assert.deepEqual(JSON.parse(fs.readFileSync(item.profilePath, "utf8")), {
      version: 2,
      updatedAt: "2026-08-27T10:00:00.000Z",
      tunnel: "none",
      port: "8788",
      mode: "agent",
      bash: "off",
      write: "off",
      root: item.root
    });
    assert.deepEqual(
      fs.readdirSync(item.profiles).sort(),
      [path.basename(item.profilePath), "backups"].sort()
    );
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("a failure after backup leaves v1 current, retains recovery bytes, and a retry completes", () => {
  const item = fixture();
  try {
    const original = `${JSON.stringify(v1(item.root), null, 2)}\n`;
    writeRawProfile(item, original);

    assert.throws(
      () => save(item, { tunnel: "none", port: "8788" }, {
        injectFailure(stage) {
          if (stage === "after_backup") {
            const error = new Error("injected failure after backup");
            error.code = "INJECTED_PROFILE_FAILURE";
            throw error;
          }
        }
      }),
      (error) => error?.code === "INJECTED_PROFILE_FAILURE"
    );

    const backupPath = workspaceProfileMigrationBackupPath(item.profilePath, 1);
    assert.equal(fs.readFileSync(item.profilePath, "utf8"), original);
    assert.equal(fs.readFileSync(backupPath, "utf8"), original);
    const primaryStat = fs.statSync(item.profilePath);
    const backupStat = fs.statSync(backupPath);
    assert.notDeepEqual(
      { dev: primaryStat.dev, ino: primaryStat.ino },
      { dev: backupStat.dev, ino: backupStat.ino },
      "a recovery backup must be an independent file before the primary is replaced"
    );
    assert.deepEqual(
      fs.readdirSync(item.profiles).sort(),
      [path.basename(item.profilePath), "backups"].sort()
    );

    const retry = save(item, { tunnel: "none", port: "8788" });
    assert.equal(retry.backupPath, backupPath);
    assert.equal(JSON.parse(fs.readFileSync(item.profilePath, "utf8")).version, 2);
    assert.equal(fs.readFileSync(backupPath, "utf8"), original);
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("an atomic replacement failure preserves the old profile and removes its temporary file", () => {
  const item = fixture();
  try {
    const original = `${JSON.stringify({ ...v1(item.root), version: 2 }, null, 2)}\n`;
    writeRawProfile(item, original);

    assert.throws(
      () => save(item, { tunnel: "none", port: "8788" }, {
        rename() {
          const error = new Error("injected replace failure");
          error.code = "EXDEV";
          throw error;
        }
      }),
      (error) => error?.code === "EXDEV"
    );

    assert.equal(fs.readFileSync(item.profilePath, "utf8"), original);
    assert.deepEqual(fs.readdirSync(item.profiles), [path.basename(item.profilePath)]);
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("current saves refuse malformed, mismatched, or future profiles instead of overwriting them", () => {
  const item = fixture();
  try {
    for (const current of [
      "{ invalid-json\n",
      `${JSON.stringify(v1(path.join(item.root, "other")))}\n`,
      `${JSON.stringify({ ...v1(item.root), version: 3 })}\n`
    ]) {
      writeRawProfile(item, current);
      assert.throws(
        () => save(item, { tunnel: "none", port: "8788" }),
        (error) => error?.code === "WORKSPACE_PROFILE_INVALID"
      );
      assert.equal(fs.readFileSync(item.profilePath, "utf8"), current);
      assert.deepEqual(fs.readdirSync(item.profiles), [path.basename(item.profilePath)]);
    }
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("a conflicting migration backup fails closed without replacing either profile", () => {
  const item = fixture();
  try {
    const current = `${JSON.stringify(v1(item.root), null, 2)}\n`;
    const conflicting = `${JSON.stringify(v1(item.root, { port: "9797" }), null, 2)}\n`;
    writeRawProfile(item, current);
    const backupPath = workspaceProfileMigrationBackupPath(item.profilePath, 1);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, conflicting, "utf8");

    assert.throws(
      () => save(item, { tunnel: "none", port: "8788" }),
      (error) => error?.code === "WORKSPACE_PROFILE_BACKUP_CONFLICT"
    );
    assert.equal(fs.readFileSync(item.profilePath, "utf8"), current);
    assert.equal(fs.readFileSync(backupPath, "utf8"), conflicting);
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("a changed current profile fails the commit precondition without losing either writer", () => {
  const item = fixture();
  try {
    const original = `${JSON.stringify({ ...v1(item.root), version: 2 }, null, 2)}\n`;
    const competing = `${JSON.stringify({ ...v1(item.root), version: 2, port: "9797" }, null, 2)}\n`;
    writeRawProfile(item, original);

    assert.throws(
      () => save(item, { tunnel: "none", port: "8788" }, {
        injectFailure(stage) {
          if (stage === "before_replace") fs.writeFileSync(item.profilePath, competing, "utf8");
        }
      }),
      (error) => error?.code === "WORKSPACE_PROFILE_CONFLICT"
    );

    assert.equal(fs.readFileSync(item.profilePath, "utf8"), competing);
    assert.deepEqual(fs.readdirSync(item.profiles), [path.basename(item.profilePath)]);
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("settings deletion removes the primary profile and its exact migration backups", () => {
  const item = fixture();
  try {
    const original = `${JSON.stringify(v1(item.root), null, 2)}\n`;
    writeRawProfile(item, original);
    save(item, { tunnel: "none", port: "8788" });
    const unrelated = path.join(item.profiles, "backups", "fedcba9876543210fedcba98.v1.json");
    fs.writeFileSync(unrelated, original, "utf8");

    assert.equal(deleteWorkspaceProfileFilesSync(item.profilePath), true);
    assert.equal(fs.existsSync(item.profilePath), false);
    assert.equal(fs.existsSync(workspaceProfileMigrationBackupPath(item.profilePath, 1)), false);
    assert.equal(fs.existsSync(unrelated), true, "another workspace backup must remain untouched");
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("the supported public CLI migrates on settings set and deletes its retained backup", () => {
  const item = fixture();
  try {
    writeRawProfile(item, `${JSON.stringify(v1(item.root), null, 2)}\n`);
    const environment = { ...process.env, CODEXGPT_HOME: item.base, NO_COLOR: "1" };
    const update = spawnSync(process.execPath, [
      publicLauncher,
      "settings",
      "set",
      "--root", item.root,
      "--tunnel", "none",
      "--port", "8788",
      "--mode", "agent",
      "--bash", "off",
      "--write", "off"
    ], { cwd: path.resolve("."), env: environment, encoding: "utf8" });
    assert.equal(update.status, 0, update.stderr || update.stdout);
    const backupPath = workspaceProfileMigrationBackupPath(item.profilePath, 1);
    assert.equal(fs.existsSync(backupPath), true);
    assert.equal(JSON.parse(fs.readFileSync(item.profilePath, "utf8")).version, 2);

    const deletion = spawnSync(process.execPath, [
      publicLauncher,
      "settings",
      "delete",
      "--root", item.root,
      "--yes"
    ], { cwd: path.resolve("."), env: environment, encoding: "utf8" });
    assert.equal(deletion.status, 0, deletion.stderr || deletion.stdout);
    assert.equal(fs.existsSync(item.profilePath), false);
    assert.equal(fs.existsSync(backupPath), false);
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});
