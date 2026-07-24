import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { loadConfig } = await tsImport("../src/config.ts", import.meta.url);
const { PathGuard, WorkspaceManager } = await tsImport("../src/guard.ts", import.meta.url);
const { SemanticProviderManager } = await tsImport("../src/semantic/manager.ts", import.meta.url);

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

function configFor(root) {
  return withEnv({
    CODEXGPT_SEMANTIC_MODE: "standard",
    CODEXGPT_TOOL_CONTRACT_VERSION: undefined,
    CODEXGPT_ALLOWED_ROOTS: root,
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "enforce"
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
