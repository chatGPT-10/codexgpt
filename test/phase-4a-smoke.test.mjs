import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("registered Phase 4A smoke freezes contracts and manifest-bound native sources", () => {
  const result = spawnSync(process.execPath, ["scripts/phase-4a-smoke.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 1,
    ok: true,
    contracts: { v1: 28, v2: 31, v3: 39 },
    nativeHost: "manifest_verified",
    conptyWorker: "manifest_verified",
    conptyProbeChild: "manifest_verified"
  });
});
