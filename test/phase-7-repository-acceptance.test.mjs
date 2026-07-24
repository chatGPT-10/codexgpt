import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../dist/config.js";
import { PathGuard, WorkspaceManager } from "../dist/guard.js";
import { SemanticProviderManager } from "../dist/semantic/index.js";

test("builtin resolves the Phase 7 live journey and repository-scale diagnostics", { timeout: 30_000 }, async () => {
  const previousMode = process.env.CODEXGPT_SEMANTIC_MODE;
  const previousRoots = process.env.CODEXGPT_ALLOWED_ROOTS;
  process.env.CODEXGPT_SEMANTIC_MODE = "standard";
  process.env.CODEXGPT_ALLOWED_ROOTS = process.cwd();
  try {
    const config = loadConfig([
      "--root", process.cwd(),
      "--bash", "off",
      "--write", "off",
      "--tool-mode", "standard"
    ]);
    const workspaces = new WorkspaceManager(config);
    const workspace = workspaces.openWorkspace(process.cwd());
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    const started = performance.now();
    try {
      const result = await manager.execute(workspace, {
        operation: "definition",
        locator: { kind: "symbol", symbol: "startWorkerLeaseRenewal" },
        max_results: 10
      });
      assert.equal(result.state, "ready");
      assert.equal(result.actual_provider, "builtin-typescript");
      assert.equal(result.result.locations[0].path, "scripts/long-task-runner.mjs");
      const latencyLimitMs = process.env.CODEXGPT_SEMANTIC_LATENCY_GATE === "1"
        ? 5_000
        : 12_000;
      assert.ok(
        performance.now() - started <= latencyLimitMs,
        `cold repository definition exceeded ${latencyLimitMs} ms`
      );
      const warmStarted = performance.now();
      const warm = await manager.execute(workspace, {
        operation: "definition",
        locator: { kind: "symbol", symbol: "startWorkerLeaseRenewal" },
        max_results: 10
      });
      assert.equal(warm.result.locations[0].path, "scripts/long-task-runner.mjs");
      const warmLimitMs = process.env.CODEXGPT_SEMANTIC_LATENCY_GATE === "1" ? 1_000 : 2_000;
      assert.ok(
        performance.now() - warmStarted <= warmLimitMs,
        `warm repository definition exceeded ${warmLimitMs} ms`
      );

      const definition = result.result.locations[0];
      const references = await manager.execute(workspace, {
        operation: "references",
        locator: {
          kind: "position",
          path: definition.path,
          line: definition.range.start.line,
          column: definition.range.start.column
        },
        include_declaration: true,
        max_results: 20
      });
      assert.equal(references.state, "ready");
      assert.equal(references.actual_provider, "builtin-typescript");
      assert.equal(references.result.locations.some((location) => location.path === definition.path), true);

      const diagnostics = await manager.execute(workspace, {
        operation: "diagnostics",
        path: "scripts/long-task-runner.mjs",
        severity: "hint",
        max_results: 20
      });
      assert.equal(diagnostics.state, "ready");
      assert.equal(diagnostics.actual_provider, "builtin-typescript");
      assert.equal(Array.isArray(diagnostics.result.diagnostics), true);
    } finally {
      await manager.dispose();
    }
  } finally {
    if (previousMode === undefined) delete process.env.CODEXGPT_SEMANTIC_MODE;
    else process.env.CODEXGPT_SEMANTIC_MODE = previousMode;
    if (previousRoots === undefined) delete process.env.CODEXGPT_ALLOWED_ROOTS;
    else process.env.CODEXGPT_ALLOWED_ROOTS = previousRoots;
  }
});
