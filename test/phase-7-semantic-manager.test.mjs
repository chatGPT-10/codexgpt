import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { loadConfig } = await tsImport("../src/config.ts", import.meta.url);
const { PathGuard, WorkspaceManager } = await tsImport("../src/guard.ts", import.meta.url);
const { SemanticProviderManager } = await tsImport("../src/semantic/manager.ts", import.meta.url);
const { createSemanticWorkerHealthRegistry } = await tsImport(
  "../src/semantic/builtin/typescriptProvider.ts",
  import.meta.url
);

function withEnv(changes, action) {
  const previous = new Map();
  for (const [name, value] of Object.entries(changes)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return action();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function withProject(callback) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-semantic-manager-")));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "src", "value.ts"), "export const value = 1;\n");
  await fs.writeFile(path.join(root, "src", "main.ts"), "import { value } from \"./value.js\";\nconsole.log(value);\n");
  try {
    return await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function configFor(root, env = {}) {
  return withEnv({
    CODEXGPT_SEMANTIC_MODE: "standard",
    CODEXGPT_TOOL_CONTRACT_VERSION: undefined,
    CODEXGPT_ALLOWED_ROOTS: root,
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "enforce",
    ...env
  }, () => loadConfig([
    "--root", root,
    "--bash", "off",
    "--write", "off",
    "--tool-mode", "standard"
  ]));
}

test("per-server semantic manager resolves a unique symbol without provider setup", async () => {
  await withProject(async (root) => {
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-session" });
    const workspace = workspaces.defaultWorkspace();
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    try {
      const definition = await manager.execute(workspace, {
        operation: "definition",
        locator: { kind: "symbol", symbol: "value" }
      });
      assert.equal(definition.actual_provider, "builtin-typescript");
      assert.equal(definition.result_quality, "semantic");
      assert.equal(definition.result.locations[0].path, "src/value.ts");

      const references = await manager.execute(workspace, {
        operation: "references",
        locator: { kind: "symbol", symbol: "value" },
        include_declaration: true
      });
      assert.equal(references.result.locations.some((location) => location.path === "src/main.ts"), true);
    } finally {
      await manager.dispose();
    }
  });
});

test("ambiguous symbol lookup returns candidates and creates no preview", async () => {
  await withProject(async (root) => {
    await fs.writeFile(path.join(root, "src", "other.ts"), "export const value = 2;\n");
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-ambiguous" });
    const workspace = workspaces.defaultWorkspace();
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    try {
      const result = await manager.execute(workspace, {
        operation: "rename_preview",
        locator: { kind: "symbol", symbol: "value" },
        new_name: "renamed"
      });
      assert.equal(result.reason_code, "NEEDS_DISAMBIGUATION");
      assert.equal(result.result.needs_disambiguation, true);
      assert.equal(result.result.candidates.length, 2);
      assert.equal("preview_id" in result.result, false);
    } finally {
      await manager.dispose();
    }
  });
});

test("partial projects still return rename disambiguation before completeness gating", async () => {
  await withProject(async (root) => {
    await fs.writeFile(path.join(root, "src", "other.ts"), "export const value = 2;\n");
    for (let index = 0; index < 105; index += 1) {
      await fs.writeFile(
        path.join(root, "src", `z-filler-${String(index).padStart(3, "0")}.ts`),
        `export const filler${index} = ${index};\n`
      );
    }
    const config = configFor(root, { CODEXGPT_ANALYSIS_MAX_ANALYZED_FILES: "100" });
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-partial-ambiguous" });
    const workspace = workspaces.defaultWorkspace();
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    try {
      const result = await manager.execute(workspace, {
        operation: "rename_preview",
        locator: { kind: "symbol", symbol: "value" },
        new_name: "renamed"
      });
      assert.equal(result.partial, true);
      assert.equal(result.reason_code, "NEEDS_DISAMBIGUATION");
      assert.equal(result.result.needs_disambiguation, true);
      assert.ok(result.result.candidates.length >= 2);
      assert.equal("preview_id" in result.result, false);
    } finally {
      await manager.dispose();
    }
  });
});

test("cached projects revalidate external source changes before the next result", async () => {
  await withProject(async (root) => {
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-revalidate" });
    const workspace = workspaces.defaultWorkspace();
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    try {
      const clean = await manager.execute(workspace, {
        operation: "diagnostics",
        path: "src/value.ts"
      });
      assert.equal(clean.result.diagnostics.length, 0);

      await fs.writeFile(path.join(root, "src", "value.ts"), "export const value: number = \"wrong\";\n");
      const changed = await manager.execute(workspace, {
        operation: "diagnostics",
        path: "src/value.ts"
      });
      assert.equal(changed.result.diagnostics.some((diagnostic) => diagnostic.severity === "error"), true);
    } finally {
      await manager.dispose();
    }
  });
});

test("cached projects invalidate when a complete dependency declaration inventory changes", async () => {
  await withProject(async (root) => {
    await fs.mkdir(path.join(root, "node_modules", "dep"), { recursive: true });
    await fs.writeFile(path.join(root, "node_modules", "dep", "package.json"), JSON.stringify({
      name: "dep",
      types: "index.d.ts"
    }));
    await fs.writeFile(path.join(root, "node_modules", "dep", "index.d.ts"), "export declare const depValue: number;\n");
    await fs.writeFile(
      path.join(root, "src", "main.ts"),
      "import { depValue } from \"dep\";\nconst typed: Missing = { value: depValue };\n"
    );
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-dependency-inventory" });
    const workspace = workspaces.defaultWorkspace();
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    try {
      const missing = await manager.execute(workspace, {
        operation: "diagnostics",
        path: "src/main.ts"
      });
      assert.equal(missing.result.diagnostics.some((diagnostic) => diagnostic.code === "2304"), true);

      await fs.writeFile(
        path.join(root, "node_modules", "dep", "global.d.ts"),
        "interface Missing { value: number }\n"
      );
      const refreshed = await manager.execute(workspace, {
        operation: "diagnostics",
        path: "src/main.ts"
      });
      assert.equal(refreshed.result.diagnostics.some((diagnostic) => diagnostic.code === "2304"), false);
    } finally {
      await manager.dispose();
    }
  });
});

test("unsupported symbol path hints use honest lexical fallback instead of TypeScript certainty", async () => {
  await withProject(async (root) => {
    await fs.writeFile(path.join(root, "src", "sample.py"), "python_only_value = 7\nprint(python_only_value)\n");
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-python-fallback" });
    const workspace = workspaces.defaultWorkspace();
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    try {
      const result = await manager.execute(workspace, {
        operation: "definition",
        locator: {
          kind: "symbol",
          symbol: "python_only_value",
          path_hint: "src/sample.py"
        }
      });
      assert.equal(result.state, "fallback");
      assert.equal(result.reason_code, "SEMANTIC_UNSUPPORTED");
      assert.equal(result.actual_provider, "builtin-lexical");
      assert.equal(result.result_quality, "lexical");
      assert.equal(result.language, "python");
      assert.equal(result.result.locations.length, 2);
      assert.equal(result.result.locations.every((location) => location.path === "src/sample.py"), true);
    } finally {
      await manager.dispose();
    }
  });
});

test("hostile Provider paths outside snapshots are rejected without disclosing the supplied path", async () => {
  await withProject(async (root) => {
    await fs.writeFile(path.join(root, ".env"), "U5_SECRET=do-not-disclose\n");
    await fs.writeFile(path.join(root, "src", "linked-source.ts"), "export const linkedValue = 1;\n");
    await fs.link(path.join(root, "src", "linked-source.ts"), path.join(root, "src", "linked.ts"));
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-hostile-paths" });
    const workspace = workspaces.defaultWorkspace();
    let returnedPath = "../outside/u5-secret.ts";
    const worker = {
      generation: 1,
      async request() {
        return {
          provider: "builtin-typescript",
          engineVersion: "fixture",
          locations: [{
            path: returnedPath,
            range: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 2 }
            }
          }]
        };
      },
      status() {
        return { state: "ready", generation: 1, pending: 0, retryAfterMs: 0 };
      },
      async dispose() {}
    };
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces, { worker });
    try {
      for (const maliciousPath of ["../outside/u5-secret.ts", ".env", "src/linked.ts"]) {
        returnedPath = maliciousPath;
        await assert.rejects(
          () => manager.execute(workspace, {
            operation: "definition",
            locator: { kind: "symbol", symbol: "value", path_hint: "src/value.ts" }
          }),
          (error) => {
            assert.match(error.message, /outside the authorized project/i);
            assert.equal(error.message.includes(maliciousPath), false);
            return true;
          }
        );
      }
    } finally {
      await manager.dispose();
    }
  });
});

test("Provider results are rejected when a source object is replaced during analysis", async () => {
  await withProject(async (root) => {
    const sourcePath = path.join(root, "src", "value.ts");
    const oldPath = path.join(root, "src", "value.ts.u5-old");
    const replacementPath = path.join(root, "src", "value.ts.u5-replacement");
    await fs.writeFile(replacementPath, "export const value = 1;\n");
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-replaced-result" });
    const workspace = workspaces.defaultWorkspace();
    const worker = {
      generation: 1,
      async request() {
        await fs.rename(sourcePath, oldPath);
        await fs.rename(replacementPath, sourcePath);
        return {
          provider: "builtin-typescript",
          engineVersion: "fixture",
          locations: [{
            path: "src/value.ts",
            range: {
              start: { line: 1, column: 14 },
              end: { line: 1, column: 19 }
            }
          }]
        };
      },
      status() {
        return { state: "ready", generation: 1, pending: 0, retryAfterMs: 0 };
      },
      async dispose() {}
    };
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces, { worker });
    try {
      await assert.rejects(
        () => manager.execute(workspace, {
          operation: "definition",
          locator: { kind: "symbol", symbol: "value", path_hint: "src/value.ts" }
        }),
        /changed during analysis/i
      );
    } finally {
      await manager.dispose();
    }
  });
});

test("invalid or non-renamable requests remain user errors instead of worker outages", async () => {
  await withProject(async (root) => {
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-user-error" });
    const workspace = workspaces.defaultWorkspace();
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    try {
      await assert.rejects(
        () => manager.execute(workspace, {
          operation: "rename_preview",
          locator: { kind: "symbol", symbol: "value" },
          new_name: "class"
        }),
        /identifier is invalid/i
      );
      assert.notEqual(manager.runtimeStatus().state, "unavailable");
    } finally {
      await manager.dispose();
    }
  });
});

test("workspace revocation invalidates semantic previews in only that manager", async () => {
  await withProject(async (root) => {
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-revoke" });
    const workspace = workspaces.defaultWorkspace();
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    try {
      const preview = await manager.execute(workspace, {
        operation: "rename_preview",
        locator: { kind: "position", path: "src/value.ts", line: 1, column: 14 },
        new_name: "renamed"
      });
      assert.ok(preview.result.preview_id);
      assert.doesNotThrow(() => manager.previews.resolve(preview.result.preview_id, workspace.id));
      workspaces.closeWorkspace(workspace.id);
      assert.throws(() => manager.previews.resolve(preview.result.preview_id, workspace.id), /unavailable/i);
    } finally {
      await manager.dispose();
    }
  });
});

test("workspace revocation releases an in-flight semantic request without stopping unrelated processes", async () => {
  await withProject(async (root) => {
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-cancel" });
    const workspace = workspaces.defaultWorkspace();
    let requestStarted;
    const started = new Promise((resolve) => { requestStarted = resolve; });
    const worker = {
      generation: 1,
      request() {
        requestStarted();
        return new Promise(() => {});
      },
      status() {
        return { state: "ready", generation: 1, pending: 1, retryAfterMs: 0 };
      },
      async dispose() {}
    };
    const manager = new SemanticProviderManager(
      config,
      new PathGuard(config),
      workspaces,
      { worker }
    );
    try {
      const pending = manager.execute(workspace, {
        operation: "definition",
        locator: { kind: "symbol", symbol: "value" }
      });
      await started;
      const revokedAt = performance.now();
      workspaces.closeWorkspace(workspace.id);
      const result = await pending;
      assert.equal(result.state, "unavailable");
      assert.ok(performance.now() - revokedAt < 500);
    } finally {
      await manager.dispose();
    }
  });
});

test("a fresh transport reports shared cooldown through runtime status", async () => {
  await withProject(async (root) => {
    const config = configFor(root);
    const workerHealth = createSemanticWorkerHealthRegistry();
    const scopeId = "sha256:shared-runtime-status";
    workerHealth.recordFailure(scopeId);
    workerHealth.recordFailure(scopeId);
    workerHealth.recordFailure(scopeId);
    const workspaces = new WorkspaceManager(config, {
      transportSessionId: () => "semantic-status-reconnect",
      identityBinding: "same-http-identity"
    });
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces, { workerHealth });
    try {
      const status = manager.runtimeStatus();
      assert.equal(status.state, "cooldown");
      assert.ok(status.retryAfterMs > 0);
      assert.match(status.nextAction, /^Retry after \d+ ms; ordinary tools remain available\.$/);
    } finally {
      await manager.dispose();
    }
  });
});

test("transport-local managers use one stable workspace authority health scope", async () => {
  await withProject(async (root) => {
    const config = configFor(root);
    const requests = [];
    const statusScopes = [];
    const createFailingWorker = () => ({
      generation: 1,
      request(request) {
        requests.push(request);
        return Promise.reject(new Error("Semantic worker crashed for reconnect regression."));
      },
      status(scopeId) {
        statusScopes.push(scopeId);
        return { state: "unavailable", generation: 1, pending: 0, retryAfterMs: 0 };
      },
      cancelScope() {},
      async dispose() {}
    });
    const workspacesA = new WorkspaceManager(config, {
      transportSessionId: () => "semantic-reconnect-a",
      identityBinding: "same-http-identity"
    });
    const workspacesB = new WorkspaceManager(config, {
      transportSessionId: () => "semantic-reconnect-b",
      identityBinding: "same-http-identity"
    });
    const workspaceA = workspacesA.defaultWorkspace();
    const workspaceB = workspacesB.defaultWorkspace();
    const managerA = new SemanticProviderManager(config, new PathGuard(config), workspacesA, {
      worker: createFailingWorker()
    });
    const managerB = new SemanticProviderManager(config, new PathGuard(config), workspacesB, {
      worker: createFailingWorker()
    });
    try {
      const resultA = await managerA.execute(workspaceA, {
        operation: "definition",
        locator: { kind: "symbol", symbol: "value" }
      });
      const resultB = await managerB.execute(workspaceB, {
        operation: "definition",
        locator: { kind: "symbol", symbol: "value" }
      });
      assert.equal(resultA.reason_code, "WORKER_UNAVAILABLE");
      assert.equal(resultB.reason_code, "WORKER_UNAVAILABLE");
      assert.notEqual(requests[0].scopeId, requests[1].scopeId);
      assert.equal(requests[0].healthScopeId, requests[1].healthScopeId);
      assert.match(requests[0].healthScopeId, /^sha256:[a-f0-9]{64}$/);
      assert.deepEqual(statusScopes, [requests[0].healthScopeId, requests[1].healthScopeId]);
    } finally {
      await Promise.all([managerA.dispose(), managerB.dispose()]);
    }
  });
});

test("builtin project graph resolves package declarations and tsconfig path aliases without filesystem access in the worker", async () => {
  await withProject(async (root) => {
    await fs.mkdir(path.join(root, "node_modules", "dep"), { recursive: true });
    await fs.writeFile(path.join(root, "node_modules", "dep", "package.json"), JSON.stringify({
      name: "dep",
      type: "module",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } }
    }));
    await fs.writeFile(path.join(root, "node_modules", "dep", "index.d.ts"), "export declare const depValue: number;\n");
    await fs.writeFile(path.join(root, "src", "alias.ts"), "export const aliasValue = 3;\n");
    await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        baseUrl: ".",
        paths: { "@alias/*": ["src/*"] }
      }
    }));
    await fs.writeFile(
      path.join(root, "src", "graph.ts"),
      "import { depValue } from \"dep\";\nimport { aliasValue } from \"@alias/alias.js\";\nconsole.log(depValue, aliasValue);\n"
    );
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "semantic-project-graph" });
    const workspace = workspaces.defaultWorkspace();
    const manager = new SemanticProviderManager(config, new PathGuard(config), workspaces);
    try {
      const dependency = await manager.execute(workspace, {
        operation: "definition",
        locator: { kind: "position", path: "src/graph.ts", line: 3, column: 13 }
      });
      assert.equal(
        dependency.result.locations.some((location) => location.path === "node_modules/dep/index.d.ts"),
        true
      );
      const alias = await manager.execute(workspace, {
        operation: "definition",
        locator: { kind: "position", path: "src/graph.ts", line: 3, column: 23 }
      });
      assert.equal(alias.result.locations.some((location) => location.path === "src/alias.ts"), true);
    } finally {
      await manager.dispose();
    }
  });
});
