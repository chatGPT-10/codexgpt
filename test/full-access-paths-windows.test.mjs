import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { PathGuard, ProtectedRootPolicy, WorkspaceManager, assertConfirmedRootPathInput } = await tsImport("../fixtures/ts-imports/full-access-imports.ts", import.meta.url);

test("Windows confirmed roots reject device, UNC, ADS, reserved, and protected stores", () => {
  for (const value of ["\\\\?\\C:\\Data", "\\\\server\\share", "C:relative", "C:\\Data\\x.txt:ads", "C:\\Data\\CON.txt"]) {
    assert.throws(() => assertConfirmedRootPathInput(value, "win32"));
  }
  const policy = new ProtectedRootPolicy({
    platform: "win32",
    protectedRoots: ["C:\\Users\\Noah\\.codex", "C:\\Users\\Noah\\AppData\\Local\\CodexPro"]
  });
  for (const value of [
    "C:\\Users\\Noah\\.ssh\\id_ed25519",
    "C:\\Users\\Noah\\.git\\config",
    "C:\\Users\\Noah\\.codex\\auth.json",
    "C:\\Users\\Noah\\AppData\\Local\\CodexPro\\state.json",
    "C:\\Windows\\System32\\config\\SAM"
  ]) assert.equal(policy.classify(value).blocked, true, value);
  assert.equal(policy.classify("C:\\Users\\Noah\\Documents\\note.txt").blocked, false);
});

test("blocked policy stays anchored above an approved .ssh or .git root", () => {
  const policy = new ProtectedRootPolicy({ platform: "win32" });
  assert.equal(policy.classify("C:\\Users\\Noah\\.ssh").blocked, true);
  assert.equal(policy.classify("C:\\repo\\.git\\config").blocked, true);
});

test("WorkspaceManager resolves, lists, and closes process-local confirmed roots without changing allowedRoots", () => {
  const originalAllowedRoots = ["C:\\Configured"];
  let active = true;
  const confirmed = {
    getWorkspace(id) {
      if (!active || id !== "ws_confirmed") throw new Error("unknown");
      return { id, root: "C:\\Data", openedAt: new Date(0).toISOString(), accessClass: "confirmed_root", access: "read_only" };
    },
    listWorkspaces() { return active ? [this.getWorkspace("ws_confirmed")] : []; },
    closeWorkspace(id) {
      if (!active || id !== "ws_confirmed") return null;
      active = false;
      return { workspaceId: id, closedAt: new Date(0).toISOString(), state: "closed" };
    }
  };
  const manager = new WorkspaceManager({
    defaultRoot: "C:\\Configured",
    allowedRoots: originalAllowedRoots,
    workspaceTtlMs: 60_000,
    httpSessionTtlMs: 60_000
  }, { confirmedRoots: confirmed, transportSessionId: () => "transport-test", identityBinding: "identity-test" });
  assert.equal(manager.getWorkspace("ws_confirmed").accessClass, "confirmed_root");
  assert.equal(manager.listWorkspaces().length, 1);
  assert.deepEqual(originalAllowedRoots, ["C:\\Configured"]);
  assert.equal(manager.closeWorkspace("ws_confirmed").state, "closed");
  assert.throws(() => manager.getWorkspace("ws_confirmed"), /unknown workspace/i);
});

test("PathGuard enforces read-only and hard-link rules for confirmed roots", (t) => {
  if (process.platform !== "win32") return t.skip("Windows hard-link contract");
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-confirmed-root-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source.txt");
  const linked = path.join(root, "linked.txt");
  fs.writeFileSync(source, "safe", "utf8");
  try { fs.linkSync(source, linked); } catch (error) { return t.skip(`hard links unavailable: ${error.code ?? error}`); }
  const guard = new PathGuard({ blockedGlobs: [] }, "win32");
  const readOnly = { id: "ws_ro", root, openedAt: new Date().toISOString(), accessClass: "confirmed_root", access: "read_only" };
  assert.throws(() => guard.resolve(readOnly, "new.txt", { forWrite: true }), /read-only/i);
  assert.throws(() => guard.resolve(readOnly, "linked.txt"), /exactly one hard link/i);
});
