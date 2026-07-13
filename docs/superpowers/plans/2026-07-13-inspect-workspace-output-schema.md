# `inspect_workspace` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Migrate only direct `inspect_workspace` to the exact Phase 1 schema-v1 envelope with strict nested repository-analysis data, five stable redacted failures, validated full-workspace provider output, exact scoped/capped result semantics, Tool Card and supertool compatibility, protected Smoke compatibility, and unchanged analysis-cache behavior.

**Architecture:** Add one tool-owned schema module and one injectable provider boundary around the existing `inspectWorkspace(config, guard, workspace)` operation. Validate the full provider result first, preserve full-workspace analysis and cache semantics, then filter and cap returned records for the normalized requested scope. Construct the exact nested result and migrate consumers to nested data while retaining historical Tool Card fallback and protected-source fail-closed compatibility.

**Tech Stack:** TypeScript, Node.js 20/24, Zod 3, MCP SDK in-memory transport, `node:test`, existing built-in analysis engine, existing CodexPro Tool Card, exact in-memory Smoke compatibility loader, Git Bash verification backend on native Windows.

## Global Constraints

- Implement one direct tool only: `inspect_workspace`.
- Follow `AGENTS.md` and the approved design at `docs/superpowers/specs/2026-07-13-inspect-workspace-output-schema-design.md`.
- Preserve the existing built-in analysis engine, inventory, classifier, extractor, relationship graph, cache key, LRU size, and cache invalidation behavior.
- Preserve standard/full registration when analysis is enabled; keep the tool absent in minimal mode and when `CODEXPRO_ANALYSIS=0`.
- Preserve optional `workspace_id` and current default-workspace fallback; do not begin Phase 2 explicit-ID work.
- Normalize omitted, empty, or whitespace-only scope to `.`; preserve safe nonexistent-scope success.
- Preserve full-workspace coverage and cache state while filtering only returned entrypoints, important files, areas, files, symbols, and relationships.
- Preserve normal caps of 300 files, 500 symbols, and 800 relationships.
- Preserve Tool Card caps of 120 files, 80 symbols, and 120 relationships.
- Preserve `include_symbols=false` and `include_relationships=false` as intentional omission, not output truncation.
- Keep provider coverage warnings in `data`; keep `meta.warnings` empty.
- Do not migrate `search`, `codexpro_inventory`, `load_skill`, `.ai-bridge`, Pro-context, handoff, or any other direct tool.
- Do not add Serena, LSP, external semantic providers, or new analysis heuristics.
- Do not change workspace ownership, expiry, close, persistence, random IDs, or client isolation.
- Do not add dependencies or modify `package.json` or `package-lock.json`.
- Do not edit `scripts/smoke.mjs` or `scripts/http-smoke.mjs` directly.
- Use exact-count, fail-closed, in-memory migration for protected main-Smoke accesses.
- Do not add a production test mode, hidden MCP argument, environment switch, or global mutable fixture.
- Do not expose raw exceptions, stacks, provider diagnostics, malformed records, failed absolute paths, allowed roots, fingerprints, file contents, tokens, or secret-looking values in public failures.
- Keep query-token, Host/Origin, Cloudflare, profile, credential, allowed-root, path-policy, and authentication behavior unchanged.
- Run the narrowest relevant test first after every behavior change.
- After each completed task, append exact verification evidence to the active Phase 1 archive and update `Memory.md` concisely.
- Check archive rollover after each completed task; continue in `docs/memory/archive/phase-1-part-4.md` only while it remains below the configured threshold.
- Stop before staging, commit, push, destructive Git operations, history rewrites, or Phase 2 unless the user explicitly authorizes publication.

---

## Planned file map

### Create

- `src/tools/schemas/inspectWorkspace.ts` — strict provider and public result schemas, warning rules, constructors, and exported types.
- `test/inspect-workspace-contract.test.mjs` — focused contract, handler, failure, cache, consumer, and compatibility tests.

### Modify during implementation

- `src/server.ts` — schema import, provider dependency, validation helpers, failure classification, descriptor, and staged handler.
- `src/toolCardWidget.ts` — nested-first analysis data normalizer and failure-aware renderer.
- `scripts/smoke-platform-compat.mjs` — exact in-memory migration of protected main-Smoke analysis accesses.
- `scripts/stress.mjs` — nested analysis result consumers.
- `test/write-contract.test.mjs` — nested analysis cache/file consumers.
- `test/edit-contract.test.mjs` — nested analysis cache consumers.
- `test/apply-patch-contract.test.mjs` — nested analysis cache consumers.
- `CHANGELOG.md` — Slice 16 implementation summary after code is locally complete.
- `AGENTS.md` — documentation map and current stopping point.
- `Memory.md` — concise current state and fresh verification evidence.
- `docs/memory/archive/phase-1-part-4.md` — append-only detailed task history.
- `docs/superpowers/specs/2026-07-13-inspect-workspace-output-schema-design.md` — implementation/publication status only.
- `docs/superpowers/plans/2026-07-13-inspect-workspace-output-schema.md` — checkbox/status reconciliation only.

### Must remain unchanged

- `src/analysis/index.ts`.
- `src/analysis/types.ts`.
- `src/analysis/inventory.ts`.
- `src/analysis/extract.ts`.
- `src/analysis/graph.ts`.
- `src/analysis/cache.ts`.
- `scripts/smoke.mjs`.
- `scripts/http-smoke.mjs`.
- `package.json`.
- `package-lock.json`.

---

## Task 1: Establish the complete RED contract and schema-only GREEN

**Files:**

- Create: `test/inspect-workspace-contract.test.mjs`
- Create: `src/tools/schemas/inspectWorkspace.ts`
- Reference: `src/tools/schemas/common.ts`
- Reference: `src/tools/schemas/search.ts`
- Reference: `src/analysis/types.ts`
- Reference: `test/search-contract.test.mjs`

**Interfaces:**

- Consumes: `createToolMeta(durationMs)` and `toolMetaSchema` from `src/tools/schemas/common.ts`.
- Produces: `INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING`, `INSPECT_WORKSPACE_ERROR_MESSAGES`, `inspectWorkspaceProviderWarningSchema`, `inspectWorkspaceProviderSchema`, `inspectWorkspaceDataSchema`, `inspectWorkspaceOutputShape`, `inspectWorkspaceOutputSchema`, `createInspectWorkspaceSuccess`, `createInspectWorkspaceFailure`, `InspectWorkspaceProviderResult`, `InspectWorkspaceData`, and `InspectWorkspaceFailureInput`.

- [x] **Step 1.1: Create the focused test harness in an intentional RED state**

Create `test/inspect-workspace-contract.test.mjs` with these imports and guarded schema-module load:

```js
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexProServer } = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const schemaModule = await tsImport(
  "../src/tools/schemas/inspectWorkspace.ts",
  import.meta.url
).catch(() => null);

const {
  INSPECT_WORKSPACE_ERROR_MESSAGES,
  INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING,
  createInspectWorkspaceFailure,
  createInspectWorkspaceSuccess,
  inspectWorkspaceDataSchema,
  inspectWorkspaceOutputSchema,
  inspectWorkspaceProviderSchema
} = schemaModule ?? {};
```

Add a complete config helper using the same current `CodexProConfig` fixture shape as adjacent contract tests:

```js
function createTestConfig(root, overrides = {}) {
  return {
    defaultRoot: root,
    allowedRoots: [root],
    host: "127.0.0.1",
    port: 8787,
    widgetDomain: "https://example.invalid",
    authToken: undefined,
    requireHttpToken: false,
    allowedHosts: ["127.0.0.1:8787"],
    allowedOrigins: [],
    allowQueryToken: false,
    bashMode: "off",
    bashTranscript: "compact",
    bashSessionId: undefined,
    requireBashSession: false,
    codexSessions: "off",
    codexDir: path.join(root, ".codex-test"),
    writeMode: "workspace",
    toolMode: "standard",
    inheritEnv: false,
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    maxHttpSessions: 16,
    httpSessionTtlMs: 60_000,
    blockedGlobs: [".git", ".git/**", ".env", ".env.*", "node_modules/**"],
    contextDir: ".ai-bridge",
    toolCards: false,
    connectionTest: false,
    analysisEnabled: true,
    analysisLimits: {
      maxInventoryFiles: 20_000,
      maxAnalyzedFiles: 5_000,
      maxScannedBytes: 67_108_864,
      maxSymbols: 100_000,
      maxRelationships: 250_000
    },
    ...overrides
  };
}

async function withConfigClient(config, dependencies, callback) {
  const server = createCodexProServer(config, dependencies ?? {});
  const client = new Client({ name: "inspect-workspace-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function withTempWorkspace(files, callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-inspect-contract-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, "utf8");
    }
    await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function callTool(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}
```

- [x] **Step 1.2: Add exact sample-provider and sample-public-data builders**

Use a provider fixture whose counts and path relationships are internally consistent:

```js
function sampleProvider(root, workspaceId = "ws_0123456789abcdef01234567", overrides = {}) {
  const warnings = [];
  const files = [
    {
      path: "package.json",
      bytes: 32,
      modifiedMs: 1_783_944_000_000,
      language: "json",
      role: "config",
      generated: false,
      entrypoint: false
    },
    {
      path: "src/index.ts",
      bytes: 80,
      modifiedMs: 1_783_944_000_001.5,
      language: "typescript",
      role: "source",
      generated: false,
      entrypoint: true
    },
    {
      path: "src/service.ts",
      bytes: 64,
      modifiedMs: 1_783_944_000_002,
      language: "typescript",
      role: "source",
      generated: false,
      entrypoint: false
    }
  ];
  const symbols = [
    {
      name: "main",
      kind: "function",
      path: "src/index.ts",
      line: 1,
      exported: true,
      confidence: "strong"
    }
  ];
  const relationships = [
    {
      from: "src/index.ts",
      to: "src/service.ts",
      kind: "imports",
      confidence: "strong",
      source: "built-in import extraction"
    }
  ];
  return {
    schemaVersion: 1,
    workspaceId,
    root,
    languages: ["json", "typescript"],
    projectTypes: ["node"],
    entrypoints: ["src/index.ts"],
    importantFiles: ["package.json"],
    areas: [
      { path: "src", role: "source", files: 2 },
      { path: ".", role: "config", files: 1 }
    ],
    files,
    symbols,
    relationships,
    coverage: {
      inventoryFiles: files.length,
      analyzedFiles: 2,
      scannedBytes: 144,
      symbolCount: symbols.length,
      relationshipCount: relationships.length,
      truncated: false,
      warnings
    },
    warnings,
    fingerprint: "a".repeat(64),
    cache: { hit: false, key: `${workspaceId}:${"a".repeat(64)}:{}` },
    ...overrides
  };
}

function sampleData(root, overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef01234567",
    root,
    path: ".",
    languages: ["json", "typescript"],
    project_types: ["node"],
    entrypoints: ["src/index.ts"],
    important_files: ["package.json"],
    areas: [
      { path: "src", role: "source", files: 2 },
      { path: ".", role: "config", files: 1 }
    ],
    files: sampleProvider(root).files,
    symbols: sampleProvider(root).symbols,
    relationships: sampleProvider(root).relationships,
    coverage: sampleProvider(root).coverage,
    warnings: [],
    output_limited: false,
    returned: { files: 3, symbols: 1, relationships: 1 },
    cache: sampleProvider(root).cache,
    ...overrides
  };
}
```

- [x] **Step 1.3: Add pure schema tests before production code exists**

Add tests that require:

```js
const topKeys = ["codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"];
const dataKeys = [
  "areas",
  "cache",
  "coverage",
  "entrypoints",
  "files",
  "important_files",
  "languages",
  "output_limited",
  "path",
  "project_types",
  "relationships",
  "returned",
  "root",
  "symbols",
  "warnings",
  "workspace_id"
];
const fileKeys = ["bytes", "entrypoint", "generated", "language", "modifiedMs", "path", "role"];
const areaKeys = ["files", "path", "role"];
const symbolKeys = ["confidence", "exported", "kind", "line", "name", "path"];
const relationshipKeys = ["confidence", "from", "kind", "source", "to"];
const coverageKeys = [
  "analyzedFiles",
  "inventoryFiles",
  "relationshipCount",
  "scannedBytes",
  "symbolCount",
  "truncated",
  "warnings"
];
```

Test exact constructors:

```js
test("inspect_workspace success constructor is exact", () => {
  assert.equal(typeof createInspectWorkspaceSuccess, "function");
  const result = createInspectWorkspaceSuccess(sampleData("D:\\Dev\\project"), 7);
  assert.deepEqual(Object.keys(result).sort(), topKeys);
  assert.equal(result.codexpro_tool, "inspect_workspace");
  assert.equal(result.codexpro_title, "Inspect Workspace");
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.deepEqual(result.meta, { schemaVersion: 1, durationMs: 7, warnings: [] });
  assert.deepEqual(Object.keys(result.data).sort(), dataKeys);
  assert.deepEqual(Object.keys(result.data.files[0]).sort(), fileKeys);
  assert.deepEqual(Object.keys(result.data.areas[0]).sort(), areaKeys);
  assert.deepEqual(Object.keys(result.data.symbols[0]).sort(), symbolKeys);
  assert.deepEqual(Object.keys(result.data.relationships[0]).sort(), relationshipKeys);
  assert.deepEqual(Object.keys(result.data.coverage).sort(), coverageKeys);
  assert.equal("schema_version" in result.data, false);
});
```

Use these exact failure fixtures:

```js
const failureCases = [
  {
    code: "WORKSPACE_NOT_FOUND",
    details: { workspace_id: "missing-workspace" },
    message: "The requested workspace is not available. Open the workspace before retrying."
  },
  {
    code: "PATH_OUTSIDE_WORKSPACE",
    details: { path: "[unsafe path omitted]" },
    message: "The requested analysis path is outside the permitted workspace boundary."
  },
  {
    code: "PATH_BLOCKED",
    details: { path: ".env" },
    message: "The requested analysis path is blocked by safety rules."
  },
  {
    code: "ANALYSIS_FAILED",
    details: {},
    message: "The workspace analysis could not be completed."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The workspace analysis failed because of an internal error."
  }
];
```

For each fixture, assert exact message, `retryable: false`, exact details, null data, and empty meta warnings.

Add rejection tests for:

- any extra top-level, data, file, area, symbol, relationship, coverage, returned, cache, error-detail, or meta field;
- flat current fields such as top-level `coverage`, `files`, `cache`, or `schema_version`;
- success with null data or non-null error;
- failure with non-null data or null error;
- unknown language, role, symbol kind, relationship kind, or confidence;
- negative/non-finite bytes or timestamp;
- non-positive symbol line;
- empty path/name/source/cache key;
- returned counts that do not equal returned arrays;
- `output_limited=false` with the output-limit warning;
- `output_limited=true` without the output-limit warning;
- data warnings that do not equal coverage warnings plus the optional output-limit warning;
- provider fingerprint not matching lowercase 64-character SHA-256;
- provider duplicate file paths or area paths;
- provider coverage counts that do not match full arrays;
- provider `coverage.warnings` that differ from provider `warnings`;
- unknown provider warning text.

- [x] **Step 1.4: Add future handler and consumer tests while still RED**

Prepare focused tests for:

1. exact descriptor `outputSchema`;
2. standard/full registration;
3. minimal and analysis-disabled absence;
4. real root, directory, file, blank, and nonexistent scopes;
5. include flags;
6. explicit limits and Tool Card caps;
7. full coverage retained after scope filtering;
8. provider call count and exact input;
9. provider order preservation;
10. provider throw/rejection;
11. provider identity, path, warning, coverage, fingerprint, and cache rejection;
12. unknown workspace and path policy classification;
13. nested Tool Card success/failure plus historical flat fallback;
14. direct `codexpro` supertool success/failure;
15. protected Smoke compatibility exact-source assertions.

Use exact assertions against `result.structuredContent.data`, not permissive fallback reads.

- [x] **Step 1.5: Run focused RED and record the evidence**

Run:

```text
node --test test/inspect-workspace-contract.test.mjs
```

Expected:

- source-shape assertions about current registration may pass;
- schema imports, exact descriptor, nested handler, provider injection, failures, Tool Card, and compatibility assertions fail for planned missing-feature reasons;
- no failure is caused by a syntax error in the test.

Record exact pass/fail counts and representative expected reasons in `Memory.md` and the active Phase 1 archive.

- [x] **Step 1.6: Create `src/tools/schemas/inspectWorkspace.ts`**

Implement the module beginning with exact constants and shared enums:

```ts
import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING =
  "Structured output was limited. Use path or max_* arguments to request a narrower or larger result." as const;

export const INSPECT_WORKSPACE_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested analysis path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested analysis path is blocked by safety rules.",
  ANALYSIS_FAILED: "The workspace analysis could not be completed.",
  INTERNAL_ERROR: "The workspace analysis failed because of an internal error."
} as const;

export const inspectAnalysisLanguageSchema = z.enum([
  "typescript", "javascript", "python", "go", "rust", "swift", "java",
  "csharp", "c", "cpp", "json", "yaml", "toml", "markdown", "shell", "unknown"
]);

export const inspectFileRoleSchema = z.enum([
  "source", "test", "config", "docs", "generated", "infrastructure", "other"
]);

export const inspectSymbolKindSchema = z.enum([
  "function", "class", "interface", "enum", "struct", "trait", "protocol", "type", "variable"
]);

export const inspectRelationshipKindSchema = z.enum([
  "imports", "references", "tests", "package"
]);

export const inspectConfidenceSchema = z.enum(["exact", "strong", "inferred"]);
```

Add the exact provider-warning validator:

```ts
function isKnownProviderWarning(value: string): boolean {
  return value === "Source analysis reached its file or byte limit." ||
    value === "Symbol extraction reached its configured limit." ||
    /^Inventory truncated at [1-9]\d* files\.$/.test(value) ||
    /^Skipped [1-9]\d* source file(?:s)? that changed or became unreadable during analysis\.$/.test(value);
}

export const inspectWorkspaceProviderWarningSchema = z.string()
  .max(240)
  .refine(isKnownProviderWarning, "Unknown workspace analysis warning.");
```

Add strict nested schemas:

```ts
export const inspectInventoryFileSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  modifiedMs: z.number().finite().nonnegative(),
  language: inspectAnalysisLanguageSchema,
  role: inspectFileRoleSchema,
  generated: z.boolean(),
  entrypoint: z.boolean()
}).strict();

export const inspectAreaSchema = z.object({
  path: z.string().min(1),
  role: inspectFileRoleSchema,
  files: z.number().int().positive()
}).strict();

export const inspectSymbolSchema = z.object({
  name: z.string().min(1).max(240),
  kind: inspectSymbolKindSchema,
  path: z.string().min(1),
  line: z.number().int().positive(),
  exported: z.boolean(),
  confidence: inspectConfidenceSchema
}).strict();

export const inspectRelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: inspectRelationshipKindSchema,
  confidence: inspectConfidenceSchema,
  source: z.string().min(1).max(160).refine(
    (value) => !/[\r\n\u0000-\u001f\u007f]/.test(value),
    "Relationship source must be one bounded line."
  )
}).strict();

export const inspectCoverageSchema = z.object({
  inventoryFiles: z.number().int().nonnegative(),
  analyzedFiles: z.number().int().nonnegative(),
  scannedBytes: z.number().int().nonnegative(),
  symbolCount: z.number().int().nonnegative(),
  relationshipCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  warnings: z.array(inspectWorkspaceProviderWarningSchema)
}).strict();

export const inspectCacheSchema = z.object({
  hit: z.boolean(),
  key: z.string().min(1).max(2_000)
}).strict();
```

Add helpers used by schema refinements:

```ts
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function duplicateIndexes(values: readonly string[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  values.forEach((value, index) => {
    if (seen.has(value)) duplicates.push(index);
    seen.add(value);
  });
  return duplicates;
}
```

Add the complete provider schema and internal invariants:

```ts
export const inspectWorkspaceProviderSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  root: z.string().min(1),
  languages: z.array(inspectAnalysisLanguageSchema),
  projectTypes: z.array(z.string().min(1).max(64)),
  entrypoints: z.array(z.string().min(1)),
  importantFiles: z.array(z.string().min(1)),
  areas: z.array(inspectAreaSchema),
  files: z.array(inspectInventoryFileSchema),
  symbols: z.array(inspectSymbolSchema),
  relationships: z.array(inspectRelationshipSchema),
  coverage: inspectCoverageSchema,
  warnings: z.array(inspectWorkspaceProviderWarningSchema),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  cache: inspectCacheSchema
}).strict().superRefine((value, context) => {
  duplicateIndexes(value.languages).forEach((index) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["languages", index],
    message: "Languages must be unique."
  }));
  duplicateIndexes(value.projectTypes).forEach((index) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["projectTypes", index],
    message: "Project types must be unique."
  }));
  duplicateIndexes(value.files.map((file) => file.path)).forEach((index) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["files", index, "path"],
    message: "Inventory paths must be unique."
  }));
  duplicateIndexes(value.areas.map((area) => area.path)).forEach((index) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["areas", index, "path"],
    message: "Area paths must be unique."
  }));
  if (value.coverage.analyzedFiles > value.coverage.inventoryFiles) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "analyzedFiles"],
      message: "analyzedFiles cannot exceed inventoryFiles."
    });
  }
  if (value.coverage.inventoryFiles !== value.files.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "inventoryFiles"],
      message: "inventoryFiles must equal files.length."
    });
  }
  if (value.coverage.symbolCount !== value.symbols.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "symbolCount"],
      message: "symbolCount must equal symbols.length."
    });
  }
  if (value.coverage.relationshipCount !== value.relationships.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "relationshipCount"],
      message: "relationshipCount must equal relationships.length."
    });
  }
  if (!sameStrings(value.coverage.warnings, value.warnings)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "warnings"],
      message: "Coverage warnings must equal provider warnings."
    });
  }
  const areaFiles = value.areas.reduce((total, area) => total + area.files, 0);
  if (areaFiles !== value.coverage.inventoryFiles) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["areas"],
      message: "Area file counts must cover the full inventory."
    });
  }
});
```

Add public data and response-limit invariants:

```ts
export const inspectReturnedSchema = z.object({
  files: z.number().int().nonnegative(),
  symbols: z.number().int().nonnegative(),
  relationships: z.number().int().nonnegative()
}).strict();

const inspectPublicWarningSchema = z.union([
  inspectWorkspaceProviderWarningSchema,
  z.literal(INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING)
]);

export const inspectWorkspaceDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string().min(1),
  path: z.string().min(1),
  languages: z.array(inspectAnalysisLanguageSchema),
  project_types: z.array(z.string().min(1).max(64)),
  entrypoints: z.array(z.string().min(1)),
  important_files: z.array(z.string().min(1)),
  areas: z.array(inspectAreaSchema),
  files: z.array(inspectInventoryFileSchema),
  symbols: z.array(inspectSymbolSchema),
  relationships: z.array(inspectRelationshipSchema),
  coverage: inspectCoverageSchema,
  warnings: z.array(inspectPublicWarningSchema),
  output_limited: z.boolean(),
  returned: inspectReturnedSchema,
  cache: inspectCacheSchema
}).strict().superRefine((value, context) => {
  if (value.returned.files !== value.files.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["returned", "files"], message: "Returned file count must equal files.length." });
  }
  if (value.returned.symbols !== value.symbols.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["returned", "symbols"], message: "Returned symbol count must equal symbols.length." });
  }
  if (value.returned.relationships !== value.relationships.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["returned", "relationships"], message: "Returned relationship count must equal relationships.length." });
  }
  const expectedWarnings = value.output_limited
    ? [...value.coverage.warnings, INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING]
    : [...value.coverage.warnings];
  if (!sameStrings(value.warnings, expectedWarnings)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["warnings"],
      message: "Data warnings must equal coverage warnings plus the optional output-limit warning."
    });
  }
});
```

Add the exact error union, output shape, envelope invariant, types, and constructors following the established modules:

```ts
const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();
const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();
const emptyDetailsSchema = z.object({}).strict();

function exactErrorSchema<Code extends keyof typeof INSPECT_WORKSPACE_ERROR_MESSAGES>(
  code: Code,
  details: z.ZodTypeAny
) {
  return z.object({
    code: z.literal(code),
    message: z.literal(INSPECT_WORKSPACE_ERROR_MESSAGES[code]),
    retryable: z.literal(false),
    details
  }).strict();
}

export const inspectWorkspaceErrorSchema = z.discriminatedUnion("code", [
  exactErrorSchema("WORKSPACE_NOT_FOUND", workspaceDetailsSchema),
  exactErrorSchema("PATH_OUTSIDE_WORKSPACE", pathDetailsSchema),
  exactErrorSchema("PATH_BLOCKED", pathDetailsSchema),
  exactErrorSchema("ANALYSIS_FAILED", emptyDetailsSchema),
  exactErrorSchema("INTERNAL_ERROR", emptyDetailsSchema)
]);

export const inspectWorkspaceOutputShape = {
  codexpro_tool: z.literal("inspect_workspace"),
  codexpro_title: z.literal("Inspect Workspace"),
  ok: z.boolean(),
  data: inspectWorkspaceDataSchema.nullable(),
  error: inspectWorkspaceErrorSchema.nullable(),
  meta: toolMetaSchema
};

const inspectWorkspaceOutputBaseSchema = z.object(inspectWorkspaceOutputShape).strict();

export const inspectWorkspaceOutputSchema = inspectWorkspaceOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful inspect_workspace results require data." });
    if (value.error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful inspect_workspace results require error to be null." });
  } else {
    if (value.data !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed inspect_workspace results require data to be null." });
    if (value.error === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed inspect_workspace results require an error object." });
  }
  if (value.meta.warnings.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["meta", "warnings"], message: "inspect_workspace meta warnings must remain empty." });
  }
});

export type InspectWorkspaceProviderResult = z.infer<typeof inspectWorkspaceProviderSchema>;
export type InspectWorkspaceData = z.infer<typeof inspectWorkspaceDataSchema>;
export type InspectWorkspaceStructuredResult = z.infer<typeof inspectWorkspaceOutputBaseSchema>;

export type InspectWorkspaceFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "ANALYSIS_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createInspectWorkspaceSuccess(
  data: InspectWorkspaceData,
  durationMs = 0
): InspectWorkspaceStructuredResult {
  return inspectWorkspaceOutputSchema.parse({
    codexpro_tool: "inspect_workspace",
    codexpro_title: "Inspect Workspace",
    ok: true,
    data: inspectWorkspaceDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createInspectWorkspaceFailure(
  failure: InspectWorkspaceFailureInput,
  durationMs = 0
): InspectWorkspaceStructuredResult {
  return inspectWorkspaceOutputSchema.parse({
    codexpro_tool: "inspect_workspace",
    codexpro_title: "Inspect Workspace",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: INSPECT_WORKSPACE_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}
```

If TypeScript rejects the generic `exactErrorSchema` inference inside the discriminated union, replace only that helper with five explicit strict error schemas. Do not weaken the union to a generic string code.

- [x] **Step 1.7: Run schema-only GREEN and retain planned handler RED**

Run:

```text
node --test test/inspect-workspace-contract.test.mjs
npm run build
```

Expected:

- pure schema, constructor, and invariant tests pass;
- descriptor, handler, provider-injection, failure-classification, Tool Card, supertool, and compatibility tests remain RED for planned reasons;
- Build passes with the new unused schema module.

- [x] **Step 1.8: Record Task 1 and stop at the review gate**

Append one complete task record to the active Phase 1 archive and update `Memory.md` with:

- exact initial RED counts;
- exact schema-only GREEN counts;
- files created;
- no production handler or consumer changes;
- no staging, commit, push, or Phase 2 work.

Run:

```text
git diff --check
```

Review with `show_changes(include_diff=true)`.

---

## Task 2: Implement the provider boundary, strict validation, and exact direct handler

**Files:**

- Modify: `src/server.ts`
- Modify: `test/inspect-workspace-contract.test.mjs`
- Reference: `src/tools/schemas/inspectWorkspace.ts`
- Reference: `src/guard.ts`
- Reference: `src/analysis/index.ts`

**Interfaces:**

- Consumes: all Task 1 schema exports.
- Produces: optional `inspectWorkspaceProvider` dependency, strict provider/path validation helpers, exact failure classifier/text helper, advertised descriptor `outputSchema`, and exact nested direct handler.

- [x] **Step 2.1: Import the Slice 16 schema and types**

Add one import block adjacent to the other tool schema imports:

```ts
import {
  INSPECT_WORKSPACE_ERROR_MESSAGES,
  INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING,
  createInspectWorkspaceFailure,
  createInspectWorkspaceSuccess,
  inspectWorkspaceDataSchema,
  inspectWorkspaceOutputShape,
  inspectWorkspaceProviderSchema,
  type InspectWorkspaceFailureInput,
  type InspectWorkspaceProviderResult
} from "./tools/schemas/inspectWorkspace.js";
```

Do not move unrelated imports or refactor adjacent schema blocks.

- [x] **Step 2.2: Add the exact dependency boundary**

Extend `CodexProServerDependencies` with:

```ts
inspectWorkspaceProvider?: (input: {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
}) => WorkspaceAnalysis | Promise<WorkspaceAnalysis>;
```

Ensure `WorkspaceAnalysis` is imported as a type from `src/analysis/types.ts` or the existing analysis barrel.

Initialize the production default once inside `createCodexProServer` beside other provider defaults:

```ts
const inspectWorkspaceProvider = dependencies.inspectWorkspaceProvider ??
  ((input: { config: CodexProConfig; guard: PathGuard; workspace: Workspace }) =>
    inspectWorkspace(input.config, input.guard, input.workspace));
```

Focused test:

```js
test("inspect provider receives exact workspace context once", async () => {
  await withTempWorkspace({ "src/index.ts": "export function main() {}\n" }, async (root) => {
    let calls = 0;
    let seen;
    await withConfigClient(createTestConfig(root), {
      inspectWorkspaceProvider: async (input) => {
        calls += 1;
        seen = input;
        return sampleProvider(input.workspace.root, input.workspace.id);
      }
    }, async (client) => {
      const result = await callTool(client, "inspect_workspace", { path: "src" });
      assert.equal(result.structuredContent.ok, true);
    });
    assert.equal(calls, 1);
    assert.equal(seen.config.defaultRoot, root);
    assert.equal(seen.workspace.root, await fs.realpath(root));
    assert.equal(typeof seen.guard.resolve, "function");
  });
});
```

Run the focused test and expect this test to remain RED until the handler uses the dependency.

- [x] **Step 2.3: Add safe failure-detail and classifier helpers**

Reuse the existing bounded path/workspace detail helpers in `src/server.ts`; do not introduce a shared refactor. Add:

```ts
const INSPECT_OUTSIDE_PATH_PREFIXES = [
  "Path contains a null byte.",
  "Path escapes workspace root:",
  "Path resolves outside workspace root through a symlink:",
  "Windows device paths are not allowed:",
  "UNC paths are not allowed:",
  "Drive-relative Windows paths are not allowed:",
  "NTFS alternate data stream paths are not allowed:",
  "Windows path segments may not end with a dot or space:",
  "Windows reserved device name is not allowed:"
] as const;

function classifyInspectWorkspaceFailure(
  error: unknown,
  args: Record<string, unknown>
): InspectWorkspaceFailureInput {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }
  if (message.startsWith("Path is blocked by safety rules:")) {
    return {
      code: "PATH_BLOCKED",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }
  if (INSPECT_OUTSIDE_PATH_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }
  return { code: "INTERNAL_ERROR", details: {} };
}

function inspectWorkspaceFailureText(failure: InspectWorkspaceFailureInput): string {
  return [
    "# Inspect Workspace Error",
    "",
    `Code: ${failure.code}`,
    INSPECT_WORKSPACE_ERROR_MESSAGES[failure.code]
  ].join("\n");
}
```

Add tests for unknown IDs, `../outside`, `.env`, device/UNC/ADS/reserved names, and redaction. Assert that returned JSON does not contain raw exception text or unsafe caller values.

- [x] **Step 2.4: Add strict provider path and identity validation**

Add a helper that validates the parsed provider result against the selected workspace and guard:

```ts
function validateInspectProviderResult(
  result: InspectWorkspaceProviderResult,
  workspace: Workspace,
  guard: PathGuard
): InspectWorkspaceProviderResult {
  if (result.workspaceId !== workspace.id || result.root !== workspace.root) {
    throw new CodexProError("Invalid inspect provider workspace identity.");
  }

  const canonicalPath = (value: string): string => {
    const resolved = guard.resolve(workspace, value);
    const normalized = resolved.relPath.replace(/^\.\/?$/, ".");
    if (normalized !== value) {
      throw new CodexProError("Invalid inspect provider path normalization.");
    }
    return normalized;
  };

  const filePaths = new Set(result.files.map((file) => canonicalPath(file.path)));
  for (const entrypoint of result.entrypoints) {
    if (!filePaths.has(canonicalPath(entrypoint))) {
      throw new CodexProError("Invalid inspect provider entrypoint.");
    }
  }
  for (const importantFile of result.importantFiles) {
    if (!filePaths.has(canonicalPath(importantFile))) {
      throw new CodexProError("Invalid inspect provider important file.");
    }
  }
  for (const area of result.areas) canonicalPath(area.path);
  for (const symbol of result.symbols) {
    if (!filePaths.has(canonicalPath(symbol.path))) {
      throw new CodexProError("Invalid inspect provider symbol path.");
    }
  }
  for (const relationship of result.relationships) {
    if (!filePaths.has(canonicalPath(relationship.from)) ||
        !filePaths.has(canonicalPath(relationship.to))) {
      throw new CodexProError("Invalid inspect provider relationship path.");
    }
  }
  return result;
}
```

Use `.` as valid area path. If `guard.resolve(workspace, ".").relPath` is `.`, the helper already preserves it. Do not stat requested scope or provider paths separately.

Tests must inject:

- mismatched workspace ID;
- mismatched root;
- `../outside.ts`;
- `.env`;
- an entrypoint absent from files;
- a symbol absent from files;
- a relationship endpoint absent from files.

Each must return exact `INTERNAL_ERROR` with `{}` and no injected value in the public result.

- [x] **Step 2.5: Add exact descriptor output schema**

In the existing direct registration, add only:

```ts
outputSchema: inspectWorkspaceOutputShape,
```

Keep title, description, input schema, annotations, Tool Card metadata, and tool-mode membership unchanged.

Focused descriptor assertions:

```js
const listed = await client.listTools();
const descriptor = listed.tools.find((tool) => tool.name === "inspect_workspace");
assert.ok(descriptor?.outputSchema);
assert.deepEqual(Object.keys(descriptor.outputSchema.properties).sort(), [
  "codexpro_title", "codexpro_tool", "data", "error", "meta", "ok"
]);
assert.equal(descriptor.outputSchema.additionalProperties, false);
```

Also verify absent tool behavior under `toolMode: "minimal"` and `analysisEnabled: false`.

- [x] **Step 2.6: Replace the flat handler with four explicit stages**

Use this exact control flow.

Stage 1 — workspace and scope:

```ts
const startedAt = Date.now();
let workspace: Workspace;
let scopePath: string;
try {
  workspace = workspaces.getWorkspace(args.workspace_id);
  const requestedPath = typeof args.path === "string" && args.path.trim()
    ? args.path
    : ".";
  const resolved = guard.resolve(workspace, requestedPath);
  scopePath = resolved.relPath.replace(/^\.\/?$/, ".");
} catch (error) {
  const failure = classifyInspectWorkspaceFailure(error, args);
  return {
    ...textResult(
      inspectWorkspaceFailureText(failure),
      createInspectWorkspaceFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}
```

Stage 2 — provider execution:

```ts
let rawAnalysis: unknown;
try {
  rawAnalysis = await inspectWorkspaceProvider({ config, guard, workspace });
} catch {
  const failure: InspectWorkspaceFailureInput = {
    code: "ANALYSIS_FAILED",
    details: {}
  };
  return {
    ...textResult(
      inspectWorkspaceFailureText(failure),
      createInspectWorkspaceFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}
```

Stage 3 — strict validation and output construction:

```ts
try {
  const analysis = validateInspectProviderResult(
    inspectWorkspaceProviderSchema.parse(rawAnalysis),
    workspace,
    guard
  );
  const inScope = (filePath: string) =>
    scopePath === "." ||
    filePath === scopePath ||
    filePath.startsWith(`${scopePath}/`);
  const areaInScope = (areaPath: string) =>
    scopePath === "." ||
    areaPath === "." ||
    inScope(areaPath) ||
    scopePath.startsWith(`${areaPath}/`);

  const fileLimit = config.toolCards
    ? 120
    : limitInt(args.max_files, 300, 1, config.analysisLimits.maxInventoryFiles);
  const symbolLimit = config.toolCards
    ? 80
    : limitInt(args.max_symbols, 500, 1, config.analysisLimits.maxSymbols);
  const relationshipLimit = config.toolCards
    ? 120
    : limitInt(args.max_relationships, 800, 1, config.analysisLimits.maxRelationships);

  const scopedFiles = analysis.files.filter((file) => inScope(file.path));
  const scopedSymbols = analysis.symbols.filter((symbol) => inScope(symbol.path));
  const scopedRelationships = analysis.relationships.filter(
    (relationship) => inScope(relationship.from) || inScope(relationship.to)
  );

  const files = scopedFiles.slice(0, fileLimit);
  const symbols = args.include_symbols === false
    ? []
    : scopedSymbols.slice(0, symbolLimit);
  const relationships = args.include_relationships === false
    ? []
    : scopedRelationships.slice(0, relationshipLimit);

  const outputLimited =
    files.length < scopedFiles.length ||
    (args.include_symbols !== false && symbols.length < scopedSymbols.length) ||
    (args.include_relationships !== false && relationships.length < scopedRelationships.length);

  const warnings = outputLimited
    ? [...analysis.warnings, INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING]
    : [...analysis.warnings];

  const data = inspectWorkspaceDataSchema.parse({
    workspace_id: workspace.id,
    root: workspace.root,
    path: scopePath,
    languages: analysis.languages,
    project_types: analysis.projectTypes,
    entrypoints: analysis.entrypoints.filter(inScope),
    important_files: analysis.importantFiles.filter(inScope),
    areas: analysis.areas.filter((area) => areaInScope(area.path)),
    files,
    symbols,
    relationships,
    coverage: analysis.coverage,
    warnings,
    output_limited: outputLimited,
    returned: {
      files: files.length,
      symbols: symbols.length,
      relationships: relationships.length
    },
    cache: analysis.cache
  });
```

Build the readable text from validated values only:

```ts
  const text = [
    "# Workspace Analysis",
    "",
    `Workspace: ${workspace.root}`,
    `Scope: ${scopePath}`,
    `Projects: ${analysis.projectTypes.join(", ") || "unknown"}`,
    `Languages: ${analysis.languages.join(", ") || "unknown"}`,
    `Entrypoints: ${data.entrypoints.join(", ") || "none detected"}`,
    `Coverage: ${analysis.coverage.analyzedFiles}/${analysis.coverage.inventoryFiles} files analyzed, ${analysis.coverage.symbolCount} symbols, ${analysis.coverage.relationshipCount} relationships${analysis.coverage.truncated ? " (partial)" : ""}`,
    `Returned: ${files.length} files, ${symbols.length} symbols, ${relationships.length} relationships`,
    ...(warnings.length ? ["", "## Warnings", "", ...warnings.map((warning) => `- ${warning}`)] : [])
  ].join("\n");

  return textResult(
    text,
    createInspectWorkspaceSuccess(data, Date.now() - startedAt)
  );
```

Stage 4 — validation/construction failure:

```ts
} catch {
  const failure: InspectWorkspaceFailureInput = {
    code: "INTERNAL_ERROR",
    details: {}
  };
  return {
    ...textResult(
      inspectWorkspaceFailureText(failure),
      createInspectWorkspaceFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}
```

Remove the old flat `schema_version` and flat result object entirely.

- [x] **Step 2.7: Make focused handler tests GREEN**

Run after each narrow change:

```text
node --test test/inspect-workspace-contract.test.mjs
```

The focused handler set must prove:

- current nested fields only;
- normalized scope;
- safe nonexistent scope;
- full coverage retained after scoping;
- provider output order retained;
- limits and include flags exact;
- cache hit/miss exact;
- all five fixed failures;
- no raw diagnostics.

Expected remaining failures after Task 2: Tool Card and external consumer migration only.

- [x] **Step 2.8: Run adjacent analysis/cache gates**

Run:

```text
node --test test/inspect-workspace-contract.test.mjs test/search-contract.test.mjs test/show-changes-contract.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs test/apply-patch-contract.test.mjs
npm run build
```

Expected:

- focused handler tests pass except planned consumer assertions;
- search/show-changes contracts remain green;
- write/edit/apply cache tests may fail only because they still read historical flat analysis fields;
- Build passes.

- [x] **Step 2.9: Record Task 2 and review exact scope**

Append exact counts, changed production file, failure staging, and remaining consumer RED to the archive and `Memory.md`.

Run:

```text
git diff --check
```

Review with `show_changes(include_diff=true)`. Confirm no analysis-engine file changed.

---

## Task 3: Migrate Tool Card, protected Smoke compatibility, Stress, and adjacent cache consumers

**Files:**

- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/smoke-platform-compat.mjs`
- Modify: `scripts/stress.mjs`
- Modify: `test/write-contract.test.mjs`
- Modify: `test/edit-contract.test.mjs`
- Modify: `test/apply-patch-contract.test.mjs`
- Modify: `test/inspect-workspace-contract.test.mjs`
- Must not modify: `scripts/smoke.mjs`
- Must not modify: `scripts/http-smoke.mjs`

**Interfaces:**

- Consumes: exact nested handler from Task 2.
- Produces: nested-first Tool Card behavior, fail-closed in-memory protected Smoke migration, and current nested test/Stress consumers.

- [x] **Step 3.1: Add a dedicated nested-first Tool Card normalizer**

Insert beside the existing workspace/list normalizers:

```js
function inspectWorkspaceResultData(data) {
  const nested =
    data?.codexpro_tool === "inspect_workspace" &&
    data?.data &&
    typeof data.data === "object";
  return nested ? data.data : (data ?? {});
}
```

Do not fold it into a generic normalizer in this slice.

- [x] **Step 3.2: Make the subtitle failure-aware and nested-first**

Replace the current direct flat branch with:

```js
if (data?.codexpro_tool === "inspect_workspace") {
  if (data?.ok === false) return data?.error?.code || "Workspace analysis unavailable";
  const analysis = inspectWorkspaceResultData(data);
  const coverage = analysis?.coverage || {};
  return (coverage.analyzedFiles ?? coverage.analyzed_files ?? 0) +
    " files analyzed, " +
    (coverage.symbolCount ?? coverage.symbol_count ?? 0) +
    " symbols";
}
```

- [x] **Step 3.3: Make `renderWorkspaceAnalysis` nested-first with exact failure rendering**

Start the renderer with:

```js
function renderWorkspaceAnalysis(data) {
  const failed = data?.ok === false;
  const error = data?.error ?? {};
  const analysis = inspectWorkspaceResultData(data);
  const coverage = analysis.coverage || {};
  const languages = Array.isArray(analysis.languages) ? analysis.languages : [];
  const projects = Array.isArray(analysis.project_types) ? analysis.project_types : [];
  const entrypoints = Array.isArray(analysis.entrypoints) ? analysis.entrypoints : [];
  const areas = Array.isArray(analysis.areas) ? analysis.areas : [];
  const symbols = Array.isArray(analysis.symbols) ? analysis.symbols : [];
  const relationships = Array.isArray(analysis.relationships) ? analysis.relationships : [];
  const warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
  const partial = Boolean(coverage.truncated || analysis.output_limited);
  const pills = failed
    ? pill(error.code || "error", "bad")
    : [
        pill(projects.join(", ") || "project", "info"),
        pill(languages.length + " languages"),
        partial ? pill("limited", "warn") : pill("complete", "good")
      ].join("");
```

Before rendering success sections, add:

```js
  if (failed) {
    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="empty">' + esc(error.message || "Workspace analysis unavailable.") + '</div>' +
      '</div></article>';
  }
```

Keep the existing successful visual sections and use only `analysis` fields. Historical flat results continue through the normalizer.

Focused Tool Card tests must assert:

- source contains `inspectWorkspaceResultData`;
- nested success uses `data.data`;
- nested failure uses `data.error`;
- renderer does not read `data.coverage`, `data.files`, or other current fields directly;
- a historical flat fixture still contains expected coverage text.

- [x] **Step 3.4: Extend the protected main-Smoke compatibility loader exactly**

In `scripts/smoke-platform-compat.mjs`, add these exact replacements after existing workspace migrations:

```js
source = replaceExactCount(
  source,
  'cardInspect.structuredContent.coverage',
  'cardInspect.structuredContent.data?.coverage',
  1
);
source = replaceExactCount(
  source,
  'workspaceAnalysis.structuredContent.languages',
  'workspaceAnalysis.structuredContent.data?.languages',
  1
);
source = replaceExactCount(
  source,
  'workspaceAnalysis.structuredContent.coverage',
  'workspaceAnalysis.structuredContent.data?.coverage',
  1
);
source = replaceExactCount(
  source,
  'inspectAfterWrite.structuredContent.cache',
  'inspectAfterWrite.structuredContent.data?.cache',
  2
);
source = replaceExactCount(
  source,
  'inspectAfterWrite.structuredContent.files',
  'inspectAfterWrite.structuredContent.data?.files',
  1
);
source = replaceExactCount(
  source,
  'inspectAfterEdit.structuredContent.cache',
  'inspectAfterEdit.structuredContent.data?.cache',
  2
);
source = replaceExactCount(
  source,
  'inspectAfterPatch.structuredContent.cache',
  'inspectAfterPatch.structuredContent.data?.cache',
  2
);
```

Do not add broad regular expressions or optional chaining fallbacks to protected source. The exact counts are the drift detector.

Add a focused source test that reads both files and asserts:

- protected source still contains all historical flat strings;
- compatibility loader contains every exact replacement and expected count;
- compatibility loader does not write transformed source to disk.

- [x] **Step 3.5: Migrate normal Stress consumers directly**

In `scripts/stress.mjs`, bind nested data once for each result:

```js
const inspectedData = inspected.structuredContent.data;
assert(inspectedData.files.length <= 120, `workspace card file inventory was not compacted: ${inspectedData.files.length}`);
```

For budget stress:

```js
const inspectedData = inspected.structuredContent.data;
assert(inspectedData.coverage.truncated === true, `analysis inventory did not report truncation: ${JSON.stringify(inspectedData.coverage)}`);
assert(inspectedData.files.length === 100, `expected 100 bounded inventory files, got ${inspectedData.files.length}`);
assert(!inspectedData.files.some((file) => file.path === '.env'), 'analysis inventory exposed blocked .env');

const limitedData = limitedOutput.structuredContent.data;
assert(limitedData.files.length === 25, `inspect max_files returned ${limitedData.files.length} records`);
assert(limitedData.symbols.length === 10, `inspect max_symbols returned ${limitedData.symbols.length} records`);
assert(limitedData.returned.files === 25 && limitedData.returned.symbols === 10, `inspect returned counts were incorrect: ${JSON.stringify(limitedData.returned)}`);
assert(limitedData.output_limited === true, 'inspect output limit was not exposed in structured content');
assert(limitedData.warnings.some((warning) => warning.includes('Structured output was limited')), 'inspect output limit did not report a warning');
```

Do not import the schema constant into Stress solely for one assertion unless the script already supports TypeScript-source imports. The substring assertion is acceptable in Stress; exact warning identity is owned by the focused contract.

- [x] **Step 3.6: Migrate adjacent cache-invalidation tests to nested current data**

In each of:

```text
test/write-contract.test.mjs
test/edit-contract.test.mjs
test/apply-patch-contract.test.mjs
```

Replace current analysis reads:

```js
warm.structuredContent.cache.hit
afterResult.structuredContent.cache.hit
afterResult.structuredContent.files
```

with exact nested reads:

```js
warm.structuredContent.data.cache.hit
afterResult.structuredContent.data.cache.hit
afterResult.structuredContent.data.files
```

Do not add historical fallback to active contract tests.

- [x] **Step 3.7: Run focused and adjacent GREEN**

Run:

```text
node --test test/inspect-workspace-contract.test.mjs
node --test test/inspect-workspace-contract.test.mjs test/search-contract.test.mjs test/show-changes-contract.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs test/apply-patch-contract.test.mjs
npm run build
```

Expected: all focused and adjacent tests pass.

- [x] **Step 3.8: Run consumer integration gates**

Run:

```text
node scripts/smoke-platform-compat.mjs
node scripts/http-smoke-compat.mjs
npm run stress
```

Expected:

- transformed protected Smoke runs without writing transformed source;
- standalone HTTP Smoke remains green;
- Tool Card caps, analysis budgets, blocked `.env`, output limits, and nested result reads pass in Stress.

- [x] **Step 3.9: Confirm protected sources are byte-unchanged**

Use `show_changes(path="scripts/smoke.mjs", include_diff=true)` and `show_changes(path="scripts/http-smoke.mjs", include_diff=true)`.

Expected: no changes.

- [x] **Step 3.10: Record Task 3 and review the consumer boundary**

Update `Memory.md` and append the archive record with exact focused, adjacent, Build, protected Smoke, HTTP Smoke, and Stress results.

Run:

```text
git diff --check
```

Review with `show_changes(include_diff=true)`.

---

## Task 4: Complete full verification, durable documentation, and implementation review

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-1-part-4.md`
- Modify: `docs/superpowers/specs/2026-07-13-inspect-workspace-output-schema-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-inspect-workspace-output-schema.md`
- Review: every Slice 16 source/test/consumer file

**Interfaces:**

- Consumes: locally complete Tasks 1–3.
- Produces: fresh complete verification evidence and a publication-ready, independently reversible Slice 16 change set.

- [x] **Step 4.1: Run focused and adjacent tests from a fresh process**

Run:

```text
node --test test/inspect-workspace-contract.test.mjs
node --test test/inspect-workspace-contract.test.mjs test/search-contract.test.mjs test/show-changes-contract.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs test/apply-patch-contract.test.mjs
```

Record exact totals and duration.

- [x] **Step 4.2: Run the complete Node regression**

Run:

```text
node --test test/*.test.mjs
```

Expected: all tests pass with zero skips introduced for Slice 16.

- [x] **Step 4.3: Run Build and analysis-specific integration gates**

Run separately:

```text
npm run build
npm run analysis:smoke
npm run analysis:cli-smoke
```

Expected: all pass on native Windows through the configured Git Bash backend.

- [x] **Step 4.4: Run transport and complete Smoke gates**

Run:

```text
node scripts/http-smoke-compat.mjs
npm run smoke
```

Expected:

- standalone HTTP Smoke passes;
- all complete Smoke sections pass;
- protected source compatibility remains exact and fail-closed.

- [x] **Step 4.5: Run native-Windows Stress and package dry-run**

Run:

```text
npm run stress
npm pack --dry-run
```

Record:

- Stress result including internal Build;
- package file count;
- compressed size;
- unpacked size;
- confirmation that internal Memory/spec/plan files remain excluded.

- [x] **Step 4.6: Update `CHANGELOG.md` with the exact local implementation**

Add one concise unreleased entry stating:

```markdown
- Added an exact schema-v1 result contract for direct `inspect_workspace`, including strict nested analysis data, scoped returned-count and output-limit invariants, validated cache/coverage/path records, five fixed redacted failures, nested Tool Card compatibility, and preserved built-in analysis/cache behavior.
```

Do not claim publication or CI before Task 5.

- [x] **Step 4.7: Reconcile durable project records**

Update:

- `AGENTS.md` documentation map with Slice 16 design and plan;
- `AGENTS.md` current stopping point to locally complete/awaiting publication only after all local gates pass;
- `Memory.md` with concise Slice 16 status and exact evidence;
- active archive with complete Task 4 evidence, decisions, risks, rollback, and next step;
- design status to `Implemented and locally verified; publication pending`;
- plan checkboxes for completed Tasks 1–4.

Keep `Memory.md` within practical limits. Move detailed command output to the archive rather than expanding the root index.

- [x] **Step 4.8: Run documentation consistency and unfinished-marker checks**

Search the Slice 16 design, plan, Memory, AGENTS, CHANGELOG, and active archive for:

```text
implementation has not started
implementation pending
publication complete
CI passed
```

At local-complete status:

- the first two must be absent except in historical archive wording;
- publication/CI success claims must be absent;
- Task 5 must remain unchecked.

Also search new Slice 16 files for unfinished planning markers and replace any accidental marker with exact content.

- [x] **Step 4.9: Run final local diff and scope checks**

Run:

```text
git diff --check
```

Then use `show_changes(include_diff=true)` and verify:

- only planned Slice 16 files changed;
- no `src/analysis/*` file changed;
- no protected Smoke source changed;
- no dependency, auth, profile, credential, Cloudflare, allowed-root, or workspace-lifecycle change exists;
- no staged changes exist;
- no commit or push occurred.

- [x] **Step 4.10: Stop at the publication approval gate**

Report:

- exact implemented contract;
- complete local verification evidence;
- exact changed-file list;
- remaining known limitations;
- rollback method;
- explicit statement that staging, commit, push, and CI have not occurred.

Do not begin Task 5 without explicit user approval.

---

## Task 5: Approval-gated publication and exact-head CI verification

**Files:**

- Stage only the reviewed Slice 16 files.
- Modify after implementation publication: `Memory.md`, active Phase 1 archive, design status, and plan status for the separate publication record.

**Interfaces:**

- Consumes: explicit user approval plus locally complete Task 4.
- Produces: published implementation commit, exact-head Ubuntu/Windows Node 20/24 CI evidence, and a separately published durable publication record.

- [x] **Step 5.1: Confirm the user explicitly approved publication**

Approval must cover staging, commit, push, and CI verification. Prior approval to design or implement Tasks 1–4 is insufficient.

- [x] **Step 5.2: Run `neat-freak` review without broad cleanup**

Load the `neat-freak` Skill and apply only directly related improvements. Do not format or rewrite unrelated files.

After any edit, repeat the narrowest affected test immediately.

- [x] **Step 5.3: Re-run every local gate after final review edits**

Run fresh:

```text
node --test test/inspect-workspace-contract.test.mjs
node --test test/inspect-workspace-contract.test.mjs test/search-contract.test.mjs test/show-changes-contract.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs test/apply-patch-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run analysis:smoke
npm run analysis:cli-smoke
node scripts/http-smoke-compat.mjs
npm run smoke
npm run stress
npm pack --dry-run
git diff --check
```

Record fresh exact results.

- [x] **Step 5.4: Precisely stage only reviewed files**

Do not use `git add .` or `git add -A`.

Stage the exact reviewed list one path at a time. Before staging, derive the final list from `show_changes(include_diff=false)` and compare it with Task 4's approved list.

Run:

```text
git diff --cached --check
```

Expected: pass.

- [ ] **Step 5.5: Create and push the implementation commit**

Recommended commit message:

```text
feat(schema): add exact inspect_workspace result contract
```

Push `main` to `origin/main` only after the commit succeeds and the staged diff is exact.

- [ ] **Step 5.6: Verify exact implementation-head CI**

Identify the public GitHub Actions run whose `head_sha` exactly equals the full implementation commit SHA.

Require success for:

```text
Ubuntu / Node 20
Ubuntu / Node 24
Windows / Node 20
Windows / Node 24
```

Do not accept a run for an earlier or later commit as implementation evidence.

- [ ] **Step 5.7: Write the separate durable publication record**

Update:

- `Memory.md` with implementation SHA, run ID, and four-job success;
- active Phase 1 archive with full publication evidence;
- design status to published implementation and exact-head CI success;
- plan Task 5 status except the record publication substep;
- `AGENTS.md` current stopping point to design-review the next remaining Phase 1 direct tool.

This record commit must not change production behavior.

- [ ] **Step 5.8: Commit, push, and verify the publication-record head**

Use a documentation-only commit message such as:

```text
docs(memory): record inspect_workspace publication
```

Push it and verify that its exact-head Ubuntu/Windows Node 20/24 matrix also succeeds.

- [ ] **Step 5.9: Confirm final clean synchronized state**

Use `show_changes(include_diff=false)` and the repository/CI tools to confirm:

- working tree clean;
- no staged changes;
- local `main` equals `origin/main`;
- implementation and publication-record SHAs are recorded;
- exact-head CI evidence is recorded;
- no token or credential appears in durable records.

- [ ] **Step 5.10: Report the next approved stopping point**

State that Slice 16 is published and CI-validated. Recommend design-reviewing the next remaining Phase 1 direct tool, with `codexpro_inventory` as the default candidate unless fresh inventory shows a smaller prerequisite.

Keep Phase 2 closed.

---

## Self-review checklist

Before executing this plan, verify:

1. Every approved design requirement maps to a task.
2. Task 1 owns schema and RED evidence only.
3. Task 2 owns direct production handler behavior only.
4. Task 3 owns consumers only.
5. Task 4 owns full local review and durable local-complete records.
6. Task 5 remains separately publication-gated.
7. Provider signatures and exported names are identical across all tasks.
8. Public data contains exactly sixteen approved fields.
9. Provider-only `schemaVersion` and `fingerprint` never enter public data.
10. Coverage remains full-workspace while returned arrays are scoped/capped.
11. Include flags do not create false output-limit warnings.
12. All provider paths are validated before public construction.
13. Unknown provider warnings fail internally rather than being reflected.
14. Tool Card keeps historical flat fallback but current tests use nested data only.
15. Protected Smoke sources remain unchanged.
16. No analysis engine, dependency, auth, Cloudflare, profile, allowed-root, cache-engine, workspace-lifecycle, or Phase 2 change is included.
17. Every command has an explicit expected result.
18. `Memory.md` remains a concise index and the archive carries detailed evidence.

## Execution handoff

The recommended execution method is subagent-driven task execution with a fresh review gate after each task. In this project, execute only Task 1 first after explicit implementation approval, record it in `Memory.md` and the active archive, then continue according to the user's granted execution scope. Publication remains a separate approval even when Tasks 1–4 are approved for continuous execution.
