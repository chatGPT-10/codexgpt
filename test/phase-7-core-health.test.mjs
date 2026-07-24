import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createTypeScriptWorkerClient } from "../dist/semantic/builtin/typescriptProvider.js";
import { semanticCoreStatus } from "../dist/semantic/status.js";

test("semantic status distinguishes configured, actual, quality, and one recovery action", async () => {
  const ready = semanticCoreStatus("builtin");
  assert.equal(ready.configuredProvider, "builtin");
  assert.equal(ready.actualProvider, "builtin-typescript");
  assert.equal(ready.state, "ready");
  assert.equal(ready.resultQuality, "semantic");
  assert.equal(ready.nextAction, "No setup is required.");

  const base = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-no-typescript-"));
  try {
    const unavailable = semanticCoreStatus("builtin", pathToFileURL(path.join(base, "status.js")).href);
    assert.equal(unavailable.state, "unavailable");
    assert.equal(unavailable.actualProvider, "none");
    assert.match(unavailable.nextAction, /^Run `npm install`/);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }

  const disabled = semanticCoreStatus("none");
  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.resultQuality, "lexical");
  assert.match(disabled.nextAction, /semantic use builtin/);
});

test("user-level semantic errors do not open the infrastructure cooldown", async () => {
  const worker = createTypeScriptWorkerClient({
    timeoutMs: 5_000,
    maxQueue: 2,
    maxResponseBytes: 1024 * 1024
  });
  assert.equal(worker.status().state, "idle");
  const invalid = {
    scopeId: "ws_invalid_request",
    operation: "definition",
    files: [],
    target: { path: "missing.ts", line: 1, column: 1 }
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(() => worker.request(invalid));
  }
  assert.notEqual(worker.status("ws_invalid_request").state, "cooldown");
  await worker.dispose();
  assert.equal(worker.status().state, "disposed");
});
