import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("managed remover rejects a junction escape and preserves the external canary", {
  skip: process.platform !== "win32" ? "Windows junction control only" : false
}, () => {
  const result = spawnSync(process.execPath, ["scripts/worktree-delete-control.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout.trim());
  if (!evidence.supported) return;
  assert.equal(evidence.unsafeRemovalRejected, true);
  assert.equal(evidence.outsideCanarySurvived, true);
});
