import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createWorkspaceControlSettings } from "../dist/control/workspaceControlSettings.js";

test("browser workspace settings require exact confirmation and project safe permission presets", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-control-root-"));
  const additional = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-control-additional-"));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-control-state-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(additional, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  });
  const service = createWorkspaceControlSettings(root, stateRoot);
  const preview = service.previewRoot(additional);
  assert.equal(preview.alreadyAllowed, false);
  assert.throws(() => service.addRoot(additional, "different"), { code: "CONTROL_WORKSPACE_CONFIRMATION_REQUIRED" });
  const added = service.addRoot(additional, preview.confirmation);
  assert.deepEqual(added.allowedRoots, [fs.realpathSync.native(root), fs.realpathSync.native(additional)]);
  assert.deepEqual(service.setPermissionMode("read_only"), {
    workspaceRoot: fs.realpathSync.native(root),
    allowedRoots: [fs.realpathSync.native(root), fs.realpathSync.native(additional)],
    permissionMode: "read_only",
    effectiveToolMode: "minimal",
    effectiveWriteMode: "off",
    effectiveBashMode: "off",
    executionProfile: "off"
  });
  const safeRun = service.setPermissionMode("run_safe");
  assert.equal(safeRun.effectiveToolMode, "full");
  assert.equal(safeRun.effectiveBashMode, "safe");
  assert.equal(safeRun.executionProfile, "off");
  assert.throws(() => service.removeRoot(root), { code: "CONTROL_WORKSPACE_ROOT_REQUIRED" });
  assert.equal(service.removeRoot(additional).allowedRoots.length, 1);
});
