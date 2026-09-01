import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { NavigationService } = await tsImport("../src/navigation/service.ts", import.meta.url);
const { loadConfig } = await tsImport("../src/config.ts", import.meta.url);
const { PathGuard, WorkspaceManager } = await tsImport("../src/guard.ts", import.meta.url);
const { SemanticProviderManager } = await tsImport("../src/semantic/manager.ts", import.meta.url);

const workspace = { id: "ws_navigation", root: "D:/repo" };

function semanticEnvelope(overrides = {}) {
  return {
    requested_provider: "builtin",
    actual_provider: "builtin-typescript",
    state: "ready",
    capability: "definition",
    language: "typescript",
    partial: false,
    omitted_count: 0,
    returned_count: 1,
    result_quality: "semantic",
    next_action: "Continue with the returned semantic locations.",
    result: {
      locations: [{
        path: "src/value.ts",
        range: { start: { line: 1, column: 14 }, end: { line: 1, column: 19 } },
        preview: "export const value = 1;",
        declaration: true
      }]
    },
    ...overrides
  };
}

function lexicalResult(overrides = {}) {
  return {
    text: "src/value.py:1: value = 1",
    matches: [{ path: "src/value.py", line: 1, text: "value = 1" }],
    truncated: false,
    used: "node",
    ...overrides
  };
}

function serviceWith({ semantic, search, list } = {}) {
  const calls = { semantic: [], search: [], list: [] };
  const manager = {
    async execute(_workspace, request) {
      calls.semantic.push(request);
      if (semantic instanceof Error) throw semantic;
      return typeof semantic === "function" ? semantic(request) : semantic ?? semanticEnvelope();
    }
  };
  const service = new NavigationService(
    { semanticProvider: "builtin", maxSearchResults: 200 },
    {},
    manager,
    {
      search: async (_config, _guard, _workspace, options) => {
        calls.search.push(options);
        if (search instanceof Error) throw search;
        return typeof search === "function" ? search(options) : search ?? lexicalResult();
      },
      listFiles: async (_guard, _workspace, options) => {
        calls.list.push(options);
        return typeof list === "function" ? list(options) : list ?? [];
      }
    }
  );
  return { service, calls };
}

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

async function withMixedProject(callback) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-navigation-")));
  await fs.mkdir(path.join(root, "src"));
  await fs.mkdir(path.join(root, "python"));
  await fs.writeFile(path.join(root, "src", "value.ts"), "export const value = 1;\n");
  await fs.writeFile(path.join(root, "src", "main.ts"), "import { value } from './value.js';\nconsole.log(value);\n");
  await fs.writeFile(path.join(root, "python", "value.py"), "def py_value():\n    return 1\n");
  await fs.writeFile(path.join(root, "README.md"), "Exact navigation error text.\n");
  try {
    return await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function configFor(root) {
  return withEnv({
    CODEXGPT_SEMANTIC_MODE: "standard",
    CODEXGPT_TOOL_CONTRACT_VERSION: "5",
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

test("definition and references prefer the owned semantic provider", async () => {
  const { service, calls } = serviceWith();
  const definition = await service.execute(workspace, {
    intent: "definition",
    query: "value",
    path: "src"
  });
  assert.equal(definition.actual_provider, "builtin-typescript");
  assert.equal(definition.result.quality, "semantic");
  assert.equal(definition.result.fallback, false);
  assert.equal(definition.result.matches[0].kind, "definition");
  assert.deepEqual(calls.semantic[0].locator, {
    kind: "symbol",
    symbol: "value",
    path_hint: "src"
  });
  assert.equal(calls.search.length, 0);

  await service.execute(workspace, {
    intent: "references",
    query: "value",
    include_declaration: false
  });
  assert.equal(calls.semantic[1].operation, "references");
  assert.equal(calls.semantic[1].include_declaration, false);
});

test("implementation uses semantic definition capability but preserves the requested intent", async () => {
  const { service, calls } = serviceWith();
  const result = await service.execute(workspace, { intent: "implementation", query: "value" });
  assert.equal(calls.semantic[0].operation, "definition");
  assert.equal(result.result.intent, "implementation");
  assert.equal(result.result.matches[0].kind, "implementation");
});

test("Python and mixed-repository path hints keep lexical fallback honest", async () => {
  const semantic = semanticEnvelope({
    actual_provider: "builtin-lexical",
    state: "fallback",
    language: "python",
    result_quality: "lexical",
    reason_code: "SEMANTIC_UNSUPPORTED"
  });
  const { service, calls } = serviceWith({ semantic });
  const result = await service.execute(workspace, {
    intent: "definition",
    query: "value",
    path: "python"
  });
  assert.equal(calls.semantic[0].locator.path_hint, "python");
  assert.equal(result.actual_provider, "builtin-lexical");
  assert.equal(result.result.quality, "lexical_fallback");
  assert.equal(result.result.fallback, true);
  assert.equal(result.reason_code, "SEMANTIC_UNSUPPORTED");
});

test("disabled, unavailable, and empty semantic results fall back to fresh lexical search", async () => {
  for (const semantic of [
    semanticEnvelope({
      actual_provider: "none",
      state: "unsupported",
      returned_count: 0,
      result_quality: "lexical",
      reason_code: "PROVIDER_DISABLED",
      result: { locations: [] }
    }),
    semanticEnvelope({
      state: "unavailable",
      returned_count: 0,
      reason_code: "WORKER_UNAVAILABLE",
      result: { locations: [] }
    }),
    semanticEnvelope({
      returned_count: 0,
      reason_code: "SYMBOL_NOT_FOUND",
      result: { locations: [] }
    })
  ]) {
    const { service, calls } = serviceWith({ semantic });
    const result = await service.execute(workspace, { intent: "references", query: "value" });
    assert.equal(calls.search.length, 1);
    assert.equal(calls.search[0].intent, "references");
    assert.equal(result.actual_provider, "node");
    assert.equal(result.result.quality, "lexical_fallback");
    assert.equal(result.result.fallback, true);
    assert.equal(result.result.matches[0].kind, "references");
  }
});

test("worker crashes and stale sources degrade to labelled lexical evidence", async () => {
  for (const [error, reason] of [
    [new Error("owned worker crashed"), "SEMANTIC_ERROR"],
    [new Error("Semantic source changed during analysis."), "SEMANTIC_SOURCE_CHANGED"]
  ]) {
    const { service } = serviceWith({ semantic: error });
    const result = await service.execute(workspace, { intent: "definition", query: "value" });
    assert.equal(result.reason_code, reason);
    assert.equal(result.result.quality, "lexical_fallback");
    assert.equal(result.result.fallback, true);
  }
});

test("diagnostics never invent a lexical fallback", async () => {
  const semantic = semanticEnvelope({
    state: "cooldown",
    returned_count: 0,
    reason_code: "WORKER_COOLDOWN",
    result: { diagnostics: [] }
  });
  const { service, calls } = serviceWith({ semantic });
  const result = await service.execute(workspace, {
    intent: "diagnostics",
    path: "src/value.ts",
    severity: "error"
  });
  assert.equal(calls.semantic[0].operation, "diagnostics");
  assert.equal(calls.search.length, 0);
  assert.equal(result.result.quality, "unavailable");
  assert.equal(result.result.fallback, false);
  assert.deepEqual(result.result.matches, []);
});

test("text intent routes directly to lexical search without calling semantic", async () => {
  const { service, calls } = serviceWith();
  const result = await service.execute(workspace, {
    intent: "text",
    query: "exact error",
    path: "src"
  });
  assert.equal(calls.semantic.length, 0);
  assert.equal(calls.search.length, 1);
  assert.equal(calls.search[0].root, "src");
  assert.equal(result.result.quality, "lexical");
  assert.equal(result.result.fallback, false);
  assert.equal(result.result.matches[0].kind, "text");
});

test("unavailable lexical and file backends return stable unavailable evidence", async () => {
  const lexical = serviceWith({ search: new Error("search failed") });
  const lexicalResult = await lexical.service.execute(workspace, { intent: "text", query: "value" });
  assert.equal(lexicalResult.result.provider, "none");
  assert.equal(lexicalResult.result.quality, "unavailable");
  assert.equal(lexicalResult.reason_code, "LEXICAL_UNAVAILABLE");

  const files = serviceWith({ list: () => { throw new Error("file index failed"); } });
  const fileResult = await files.service.execute(workspace, { intent: "file", query: "value" });
  assert.equal(fileResult.result.provider, "none");
  assert.equal(fileResult.result.quality, "unavailable");
  assert.equal(fileResult.reason_code, "FILE_INDEX_UNAVAILABLE");
});

test("file intent uses bounded stable filename discovery and reports truncation", async () => {
  const { service, calls } = serviceWith({
    list: ["src/value.ts", "src/value.test.ts", "docs/value.md", "src/other.ts"]
  });
  const result = await service.execute(workspace, {
    intent: "file",
    query: "value",
    path: "src",
    max_results: 1
  });
  assert.equal(calls.semantic.length, 0);
  assert.equal(calls.search.length, 0);
  assert.equal(calls.list[0].root, "src");
  assert.equal(calls.list[0].maxFiles, 20_000);
  assert.equal(result.actual_provider, "builtin-file-index");
  assert.equal(result.result.matches.length, 1);
  assert.equal(result.result.matches[0].kind, "file");
  assert.equal(result.result.truncated, true);
});

test("semantic partial and omitted counts become explicit navigation truncation", async () => {
  const { service } = serviceWith({
    semantic: semanticEnvelope({ partial: true, omitted_count: 12 })
  });
  const result = await service.execute(workspace, { intent: "definition", query: "value" });
  assert.equal(result.partial, true);
  assert.equal(result.omitted_count, 12);
  assert.equal(result.result.truncated, true);
});

test("large semantic results obey the requested public result limit", async () => {
  const locations = [1, 2, 3].map((line) => ({
    path: "src/value.ts",
    range: { start: { line, column: 1 }, end: { line, column: 6 } },
    preview: `value ${line}`
  }));
  const { service } = serviceWith({
    semantic: semanticEnvelope({
      returned_count: locations.length,
      result: { locations }
    })
  });
  const result = await service.execute(workspace, {
    intent: "references",
    query: "value",
    max_results: 1
  });
  assert.equal(result.result.matches.length, 1);
  assert.equal(result.result.truncated, true);
  assert.equal(result.omitted_count, 2);
});

test("overlong lexical paths are omitted instead of invalidating the whole result", async () => {
  const { service } = serviceWith({
    search: lexicalResult({
      matches: [
        { path: `${"a".repeat(241)}.ts`, line: 1, text: "value" },
        { path: "src/value.ts", line: 2, text: "value" }
      ]
    })
  });
  const result = await service.execute(workspace, { intent: "text", query: "value" });
  assert.deepEqual(result.result.matches.map((match) => match.path), ["src/value.ts"]);
  assert.equal(result.result.truncated, true);
  assert.equal(result.omitted_count, 1);
});

test("real mixed fixture routes TypeScript, Python, text, and filenames through one service", async () => {
  await withMixedProject(async (root) => {
    const config = configFor(root);
    const workspaces = new WorkspaceManager(config, { transportSessionId: () => "navigation-mixed" });
    const realWorkspace = workspaces.defaultWorkspace();
    const guard = new PathGuard(config);
    const manager = new SemanticProviderManager(config, guard, workspaces);
    const service = new NavigationService(config, guard, manager);
    try {
      const typescript = await service.execute(realWorkspace, {
        intent: "definition",
        query: "value",
        path: "src/value.ts"
      });
      assert.equal(typescript.result.quality, "semantic");
      assert.equal(typescript.result.matches[0].path, "src/value.ts");

      const python = await service.execute(realWorkspace, {
        intent: "definition",
        query: "py_value",
        path: "python/value.py"
      });
      assert.equal(python.result.quality, "lexical_fallback");
      assert.equal(python.result.matches.some((match) => match.path === "python/value.py"), true);

      const text = await service.execute(realWorkspace, {
        intent: "text",
        query: "Exact navigation error text"
      });
      assert.equal(text.result.quality, "lexical");
      assert.equal(text.result.matches[0].path, "README.md");

      const file = await service.execute(realWorkspace, {
        intent: "file",
        query: "value.py"
      });
      assert.equal(file.result.provider, "builtin-file-index");
      assert.equal(file.result.matches[0].path, "python/value.py");
    } finally {
      await manager.dispose();
    }
  });
});
