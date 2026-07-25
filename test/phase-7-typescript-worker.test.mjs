import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const workerModule = await tsImport("../src/semantic/builtin/typescriptProvider.ts", import.meta.url).catch(() => null);

const files = Object.freeze([
  Object.freeze({
    path: "src/value.ts",
    text: "export const value = 1;\n"
  }),
  Object.freeze({
    path: "src/main.ts",
    text: "import { value } from \"./value.js\";\nconsole.log(value);\n"
  }),
  Object.freeze({
    path: "src/broken.ts",
    text: "const count: number = \"wrong\";\n"
  })
]);

test("owned TypeScript worker returns definitions, references, and diagnostics from virtual snapshots", async () => {
  assert.ok(workerModule);
  const client = workerModule.createTypeScriptWorkerClient({
    timeoutMs: 5_000,
    maxQueue: 4,
    maxResponseBytes: 512_000
  });
  try {
    const definition = await client.request({
      scopeId: "ws_worker_definition",
      operation: "definition",
      files,
      target: { path: "src/main.ts", line: 2, column: 13 }
    });
    assert.equal(definition.provider, "builtin-typescript");
    assert.equal(definition.locations[0].path, "src/value.ts");
    assert.equal(definition.locations[0].range.start.line, 1);

    const references = await client.request({
      scopeId: "ws_worker_references",
      operation: "references",
      files,
      target: { path: "src/value.ts", line: 1, column: 14 },
      includeDeclaration: true
    });
    assert.equal(references.locations.some((location) => location.path === "src/main.ts"), true);
    assert.equal(references.locations.some((location) => location.path === "src/value.ts"), true);

    const diagnostics = await client.request({
      scopeId: "ws_worker_diagnostics",
      operation: "diagnostics",
      files,
      target: { path: "src/broken.ts", line: 1, column: 1 }
    });
    assert.equal(diagnostics.diagnostics.some((diagnostic) => diagnostic.severity === "error"), true);
    assert.equal(diagnostics.diagnostics.every((diagnostic) => diagnostic.path === "src/broken.ts"), true);
  } finally {
    await client.dispose();
  }
});

test("worker reuses one exact immutable project snapshot", async () => {
  assert.ok(workerModule);
  const client = workerModule.createTypeScriptWorkerClient({
    timeoutMs: 5_000,
    maxQueue: 4,
    maxResponseBytes: 512_000
  });
  try {
    const first = await client.request({
      scopeId: "ws_worker_cache",
      operation: "definition",
      files,
      target: { path: "src/main.ts", line: 2, column: 13 }
    });
    const second = await client.request({
      scopeId: "ws_worker_cache",
      operation: "definition",
      files,
      target: { path: "src/main.ts", line: 2, column: 13 }
    });
    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.equal(second.locations[0].path, "src/value.ts");
  } finally {
    await client.dispose();
  }
});

test("worker rename output is a non-mutating complete text-edit plan", async () => {
  assert.ok(workerModule);
  const client = workerModule.createTypeScriptWorkerClient({
    timeoutMs: 5_000,
    maxQueue: 4,
    maxResponseBytes: 512_000
  });
  try {
    const rename = await client.request({
      scopeId: "ws_worker_rename",
      operation: "rename_preview",
      files,
      target: { path: "src/value.ts", line: 1, column: 14 },
      newName: "renamedValue"
    });
    assert.equal(rename.oldName, "value");
    assert.equal(rename.edits.length >= 2, true);
    assert.equal(rename.edits.some((edit) => edit.path === "src/value.ts"), true);
    assert.equal(rename.edits.some((edit) => edit.path === "src/main.ts"), true);
    await assert.rejects(
      () => client.request({
        scopeId: "ws_worker_keyword",
        operation: "rename_preview",
        files,
        target: { path: "src/value.ts", line: 1, column: 14 },
        newName: "class"
      }),
      /identifier is invalid/
    );
  } finally {
    await client.dispose();
  }
});

test("cancelling one workspace scope preserves unrelated queued requests", async () => {
  assert.ok(workerModule);
  const client = workerModule.createTypeScriptWorkerClient({
    timeoutMs: 10_000,
    maxQueue: 4,
    maxResponseBytes: 512_000
  });
  try {
    const cancelled = client.request({
      scopeId: "ws_worker_cancelled",
      operation: "diagnostics",
      files: Array.from({ length: 1_000 }, (_, index) => ({
        path: `src/cancel-${index}.ts`,
        text: `export const cancelValue${index}: number = ${index};\n`
      })),
      target: { path: "src/cancel-0.ts", line: 1, column: 1 }
    });
    const unrelated = client.request({
      scopeId: "ws_worker_unrelated",
      operation: "definition",
      files,
      target: { path: "src/main.ts", line: 2, column: 13 }
    });
    client.cancelScope("ws_worker_cancelled");

    await assert.rejects(cancelled, /cancelled|revoked/i);
    const definition = await unrelated;
    assert.equal(definition.locations[0].path, "src/value.ts");
  } finally {
    await client.dispose();
  }
});

test("shared worker health survives transient client recreation and opens one cooldown", async () => {
  assert.ok(workerModule);
  const healthRegistry = workerModule.createSemanticWorkerHealthRegistry();
  const healthScopeId = "sha256:shared-workspace-authority";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const client = workerModule.createTypeScriptWorkerClient({
      timeoutMs: 1,
      maxQueue: 1,
      maxResponseBytes: 512_000,
      healthRegistry
    });
    await assert.rejects(
      client.request({
        scopeId: `transport-${attempt}`,
        healthScopeId,
        operation: "diagnostics",
        files: Array.from({ length: 500 }, (_, index) => ({
          path: `src/reconnect-${attempt}-${index}.ts`,
          text: `export const reconnectValue${index}: number = ${index};\n`
        })),
        target: { path: `src/reconnect-${attempt}-0.ts`, line: 1, column: 1 }
      }),
      /timeout|deadline/i
    );
    await client.dispose();
  }

  const nextTransport = workerModule.createTypeScriptWorkerClient({
    timeoutMs: 5_000,
    maxQueue: 1,
    maxResponseBytes: 512_000,
    healthRegistry
  });
  try {
    const status = nextTransport.status(healthScopeId);
    assert.equal(status.state, "cooldown");
    assert.ok(status.retryAfterMs > 0);
    await assert.rejects(
      nextTransport.request({
        scopeId: "transport-after-reconnect",
        healthScopeId,
        operation: "definition",
        files,
        target: { path: "src/main.ts", line: 2, column: 13 }
      }),
      /cooling down; retry after/i
    );
  } finally {
    await nextTransport.dispose();
  }
});

test("worker deadlines and exact disposal are bounded", async () => {
  assert.ok(workerModule);
  const client = workerModule.createTypeScriptWorkerClient({
    timeoutMs: 1,
    maxQueue: 1,
    maxResponseBytes: 512_000
  });
  await assert.rejects(
    client.request({
      scopeId: "ws_worker_deadline",
      operation: "diagnostics",
      files: Array.from({ length: 500 }, (_, index) => ({
        path: `src/file-${index}.ts`,
        text: `export const value${index}: number = ${index};\n`
      })),
      target: { path: "src/file-0.ts", line: 1, column: 1 }
    }),
    /timeout|deadline/i
  );
  await client.dispose();
  await assert.rejects(
    client.request({
      scopeId: "ws_worker_dispose",
      operation: "diagnostics",
      files,
      target: { path: "src/broken.ts", line: 1, column: 1 }
    }),
    /disposed/i
  );
});
