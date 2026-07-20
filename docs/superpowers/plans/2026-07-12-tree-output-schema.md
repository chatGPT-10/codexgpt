# Exact `tree` Output Schema Implementation Plan

> **Execution record:** This plan was executed task-by-task with the `executing-plans` workflow. All 41 tracked steps are marked complete; detailed evidence is recorded in `docs/memory/archive/phase-1.md` STEP-093 through STEP-096.

**Status:** Fully executed through Task 4, published in implementation commit `6aaeda4`, and cross-platform CI-validated; closeout records published in commits `2ecd4af` and `e7c1646`.

**Goal:** Migrate only `tree` to an exact advertised output schema with strict success/failure envelopes, six stable safe error codes, preserved readable output, and complete contract tests.

**Architecture:** Add a tool-specific Zod contract in `src/tools/schemas/tree.ts`, then integrate it into the existing `tree` registration without changing global error behavior. A local classifier maps current workspace/path/filesystem failures into the approved public contract, while a constructor-only `treeResultProvider` seam verifies unexpected failures through the real MCP handler. A dedicated tool-card renderer reads only the nested `data` shape.

**Tech Stack:** TypeScript 5.8, Zod 3.25, MCP TypeScript SDK 1.17, Node.js 20+, `node:test`, `tsx/esm/api`, existing CodexGPT path guards and redaction helpers.

## Global Constraints

- Native Windows remains the primary platform; WSL must not become mandatory.
- Migrate only `tree`; no other MCP tool may change structured output in this slice.
- Preserve the existing snake_case successful fields exactly: `workspace_id`, `root`, `text`, `entries`, and `truncated`.
- Keep all five successful fields only under `structuredContent.data`; do not duplicate them at the top level.
- Preserve readable MCP `content` on success.
- Preserve MCP `isError: true` and readable safe `content` on failure.
- The top-level result is exactly `codexgpt_tool`, `codexgpt_title`, `ok`, `data`, `error`, and `meta`.
- Metadata is exactly `schemaVersion`, `durationMs`, and `warnings`; do not add `requestId`.
- The only error codes are `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `FILE_NOT_FOUND`, `NOT_A_DIRECTORY`, and `INTERNAL_ERROR`.
- Every approved error uses `retryable: false`.
- `WORKSPACE_NOT_FOUND.details` is exactly `{ workspace_id: string }`, sanitized and bounded to 160 characters.
- Path-error details are exactly `{ path: string }`, sanitized and bounded to 240 characters.
- `INTERNAL_ERROR.details` is exactly `{}` and its public message is fixed.
- Do not return raw exception messages, stack traces, tokens, secrets, environment values, or internal absolute paths.
- Preserve current optional `workspace_id` and default-workspace fallback behavior.
- Do not add workspace close, expiry, ownership, session binding, or random session IDs; those remain Phase 2 work.
- Do not refactor the global `CodexGPTError` class or change path-policy behavior.
- Do not change authentication, Cloudflare, profiles, shell, process, Git, dependencies, or public configuration.
- Do not fix the separate native-Windows Stress fixture containing `visible:123:file.txt`.
- No environment variable, CLI flag, hidden MCP argument, HTTP route, or public test switch may expose the injected failure seam.
- After each task, update `Memory.md` and append actual evidence to `docs/memory/archive/phase-1.md`.
- Stop for user review after every task. Do not stage, commit, or push without separate explicit approval.

---

## File map

### Create

- `src/tools/schemas/tree.ts` — exact successful data schema, six strict error variants, complete output schema, inferred types, stable messages, and result constructors.
- `test/tree-contract.test.mjs` — constructor, schema, registration, real MCP success/failure, redaction, duration, and tool-card contract tests.

### Modify

- `src/server.ts:1-26` — import `TreeOptions`, `TreeResult`, and the tree-schema exports.
- `src/server.ts:30-108` — add narrowly scoped detail sanitation and error classification helpers.
- `src/server.ts:209-213` — add the constructor-only `treeResultProvider` dependency seam.
- `src/server.ts:993-1003` — bind the production provider.
- `src/server.ts:1713-1744` — advertise the exact schema and return strict success/failure envelopes.
- `src/toolCardWidget.ts:506-541` — make the `tree` subtitle read nested successful data or the stable failure code.
- `src/toolCardWidget.ts:960-980` — add a dedicated `renderTree` function.
- `src/toolCardWidget.ts:1002-1038` — route `tree` results to the dedicated renderer.
- `Memory.md` — record actual task state, checks, risks, and the next approval boundary.
- `docs/memory/archive/phase-1.md` — append complete task records with actual commands and results.

### Must not change

- `src/tools/schemas/common.ts`, unless a minimal tool-agnostic correction is proven necessary and the completed `server_config` contract remains unchanged.
- `src/guard.ts`, `src/fsOps.ts`, `src/http.ts`, `src/stdio.ts`, package dependencies, authentication, Cloudflare scripts, profiles, or other tool handlers.
- `scripts/stress.mjs` and its invalid Windows fixture.

---

### Task 1: Add the exact `tree` Zod contract

**Files:**
- Create: `src/tools/schemas/tree.ts`
- Create: `test/tree-contract.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-1.md`

**Interfaces:**
- Consumes: `createToolMeta` and `toolMetaSchema` from `src/tools/schemas/common.ts`.
- Produces: `TREE_ERROR_MESSAGES`, `treeDataSchema`, `treeErrorSchema`, `treeOutputShape`, `treeOutputSchema`, `TreeData`, `TreeFailureInput`, `TreeStructuredResult`, `createTreeSuccess`, and `createTreeFailure`.
- Later tasks import these exact names.

- [x] **Step 1: Create the failing constructor and strict-schema tests**

Create `test/tree-contract.test.mjs` with this complete initial content:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  TREE_ERROR_MESSAGES,
  createTreeFailure,
  createTreeSuccess,
  treeOutputSchema
} = await tsImport("../src/tools/schemas/tree.ts", import.meta.url);

function sampleTreeData() {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexgpt",
    text: ".\n├── src/\n└── test/",
    entries: 2,
    truncated: false
  };
}

const failureCases = [
  {
    code: "WORKSPACE_NOT_FOUND",
    details: { workspace_id: "ws_missing" },
    message: "The requested workspace is not available. Open the workspace before retrying."
  },
  {
    code: "PATH_OUTSIDE_WORKSPACE",
    details: { path: "../outside" },
    message: "The requested path is outside the permitted workspace boundary."
  },
  {
    code: "PATH_BLOCKED",
    details: { path: ".git" },
    message: "The requested path is blocked by safety rules."
  },
  {
    code: "FILE_NOT_FOUND",
    details: { path: "missing-directory" },
    message: "The requested path does not exist."
  },
  {
    code: "NOT_A_DIRECTORY",
    details: { path: "src/server.ts" },
    message: "The requested path is not a directory."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The file tree could not be generated because of an internal error."
  }
];

test("tree success constructor produces the strict schema-v1 envelope", () => {
  const result = createTreeSuccess(sampleTreeData(), 7);
  const parsed = treeOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexgpt_title",
    "codexgpt_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexgpt_tool, "tree");
  assert.equal(parsed.codexgpt_title, "File Tree");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.data, sampleTreeData());
  assert.equal("workspace_id" in parsed, false);
  assert.equal("text" in parsed, false);
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 7,
    warnings: []
  });
});

test("tree failure constructor produces each approved strict error", () => {
  for (const expected of failureCases) {
    const result = createTreeFailure({ code: expected.code, details: expected.details }, 3);
    const parsed = treeOutputSchema.parse(result);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(TREE_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("tree schema rejects unknown codes, wrong details, and additional fields", () => {
  const success = createTreeSuccess(sampleTreeData(), 0);
  const workspaceFailure = createTreeFailure(
    { code: "WORKSPACE_NOT_FOUND", details: { workspace_id: "ws_missing" } },
    0
  );
  const internalFailure = createTreeFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => treeOutputSchema.parse({ ...success, extra: true }));
  assert.throws(() =>
    treeOutputSchema.parse({ ...success, data: { ...success.data, extra: true } })
  );
  assert.throws(() =>
    treeOutputSchema.parse({
      ...workspaceFailure,
      error: { ...workspaceFailure.error, details: { path: "wrong-shape" } }
    })
  );
  assert.throws(() =>
    treeOutputSchema.parse({
      ...internalFailure,
      error: { ...internalFailure.error, code: "UNAPPROVED_ERROR" }
    })
  );
});

test("tree schema rejects inconsistent success and failure states", () => {
  const success = createTreeSuccess(sampleTreeData(), 0);
  const failure = createTreeFailure({ code: "INTERNAL_ERROR", details: {} }, 0);

  assert.throws(() => treeOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => treeOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => treeOutputSchema.parse({ ...failure, data: sampleTreeData() }));
  assert.throws(() => treeOutputSchema.parse({ ...failure, error: null }));
});
```

- [x] **Step 2: Run the new test and verify the expected failure**

Run:

```bash
node --test test/tree-contract.test.mjs
```

Expected result: FAIL with `ERR_MODULE_NOT_FOUND` for `src/tools/schemas/tree.ts`.

- [x] **Step 3: Implement the exact schema and constructors**

Create `src/tools/schemas/tree.ts` with this complete content:

```ts
import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const TREE_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  PATH_OUTSIDE_WORKSPACE: "The requested path is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested path is blocked by safety rules.",
  FILE_NOT_FOUND: "The requested path does not exist.",
  NOT_A_DIRECTORY: "The requested path is not a directory.",
  INTERNAL_ERROR: "The file tree could not be generated because of an internal error."
} as const;

export const treeDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  text: z.string(),
  entries: z.number().int().nonnegative(),
  truncated: z.boolean()
}).strict();

const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(TREE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(TREE_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(TREE_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const fileNotFoundErrorSchema = z.object({
  code: z.literal("FILE_NOT_FOUND"),
  message: z.literal(TREE_ERROR_MESSAGES.FILE_NOT_FOUND),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const notADirectoryErrorSchema = z.object({
  code: z.literal("NOT_A_DIRECTORY"),
  message: z.literal(TREE_ERROR_MESSAGES.NOT_A_DIRECTORY),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(TREE_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const treeErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  fileNotFoundErrorSchema,
  notADirectoryErrorSchema,
  internalErrorSchema
]);

export const treeOutputShape = {
  codexgpt_tool: z.literal("tree"),
  codexgpt_title: z.literal("File Tree"),
  ok: z.boolean(),
  data: treeDataSchema.nullable(),
  error: treeErrorSchema.nullable(),
  meta: toolMetaSchema
};

const treeOutputBaseSchema = z.object(treeOutputShape).strict();

export const treeOutputSchema = treeOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful tree results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful tree results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed tree results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed tree results require an error object."
    });
  }
});

export type TreeData = z.infer<typeof treeDataSchema>;
export type TreeStructuredResult = z.infer<typeof treeOutputBaseSchema>;

export type TreeFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "FILE_NOT_FOUND"; details: { path: string } }
  | { code: "NOT_A_DIRECTORY"; details: { path: string } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createTreeSuccess(
  data: TreeData,
  durationMs = 0
): TreeStructuredResult {
  return treeOutputSchema.parse({
    codexgpt_tool: "tree",
    codexgpt_title: "File Tree",
    ok: true,
    data: treeDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createTreeFailure(
  failure: TreeFailureInput,
  durationMs = 0
): TreeStructuredResult {
  return treeOutputSchema.parse({
    codexgpt_tool: "tree",
    codexgpt_title: "File Tree",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: TREE_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}
```

- [x] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
node --test test/tree-contract.test.mjs
```

Expected result: 4 tests passed, 0 failed.

- [x] **Step 5: Run TypeScript validation**

Run:

```bash
npm run build
```

Expected result: exit code 0.

- [x] **Step 6: Record Task 1 in both Memory layers**

Append the actual command outputs, files, four-test result, risks, rollback, and next gate to the Phase 1 archive. Update root Memory to state that only schema constructors exist; the real MCP `tree` tool is not yet migrated.

- [x] **Step 7: Review only Task 1 changes and stop**

Use `show_changes` and confirm the change set contains only:

```text
src/tools/schemas/tree.ts
test/tree-contract.test.mjs
Memory.md
docs/memory/archive/phase-1.md
```

Expected state: no staged files. Stop for user approval before Task 2.

---

### Task 2: Integrate the real MCP `tree` handler and stable errors

**Files:**
- Modify: `src/server.ts:1-26`
- Modify: `src/server.ts:30-108`
- Modify: `src/server.ts:209-213`
- Modify: `src/server.ts:993-1003`
- Modify: `src/server.ts:1713-1744`
- Modify: `test/tree-contract.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-1.md`

**Interfaces:**
- Consumes: all Task 1 exports.
- Consumes: existing `TreeOptions`, `TreeResult`, `repoTree`, `Workspace`, `PathGuard`, and `CodexGPTConfig`.
- Produces: constructor-only `treeResultProvider?: (context: TreeProviderContext) => Promise<TreeResult>`.
- Produces: a direct `tree` MCP result that uses the approved exact envelope for success and every handled failure.
- Does not alter the legacy wrapper behavior for any other tool.

- [x] **Step 1: Extend the test file with real MCP integration setup**

Replace the import/setup section at the top of `test/tree-contract.test.mjs` with this complete block, retaining the four Task 1 tests below it:

```js
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexGPTServer } = await tsImport("../src/server.ts", import.meta.url);
const {
  TREE_ERROR_MESSAGES,
  createTreeFailure,
  createTreeSuccess,
  treeOutputSchema
} = await tsImport("../src/tools/schemas/tree.ts", import.meta.url);

function createTestConfig() {
  const root = process.cwd();
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
    blockedGlobs: [".git", ".git/**", "node_modules/**"],
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
    }
  };
}

async function withInMemoryClient(dependencies, callback) {
  const server = createCodexGPTServer(createTestConfig(), dependencies);
  const client = new Client({ name: "tree-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);

  try {
    return await callback(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

function parseTreeResult(result) {
  return treeOutputSchema.parse(result.structuredContent);
}

function assertTreeFailure(result, code, details) {
  const parsed = parseTreeResult(result);
  assert.equal(result.isError, true);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code,
    message: TREE_ERROR_MESSAGES[code],
    retryable: false,
    details
  });
  assert.equal(parsed.meta.schemaVersion, 1);
  assert.ok(parsed.meta.durationMs >= 0);
  assert.deepEqual(parsed.meta.warnings, []);
  assert.ok(result.content.some((item) => item.type === "text"));
}
```

Append these seven complete tests after the Task 1 tests:

```js
test("tree advertises the exact output schema and returns a valid real success envelope", async () => {
  await withInMemoryClient({}, async (client) => {
    const listed = await client.listTools();
    const descriptor = listed.tools.find((tool) => tool.name === "tree");

    assert.ok(descriptor, "tree must be registered");
    assert.ok(descriptor.outputSchema, "tree must advertise outputSchema");
    assert.equal(descriptor.outputSchema.type, "object");
    assert.deepEqual(
      new Set(descriptor.outputSchema.required),
      new Set(["codexgpt_tool", "codexgpt_title", "ok", "data", "error", "meta"])
    );

    const result = await client.callTool({
      name: "tree",
      arguments: { path: "src/tools/schemas", max_depth: 1, max_entries: 20 }
    });
    const parsed = parseTreeResult(result);

    assert.equal(result.isError, undefined);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.error, null);
    assert.ok(parsed.data);
    assert.equal(parsed.data.workspace_id.startsWith("ws_"), true);
    assert.equal(parsed.data.root, process.cwd());
    assert.match(parsed.data.text, /tree\.ts/);
    assert.ok(parsed.data.entries >= 1);
    assert.equal(typeof parsed.data.truncated, "boolean");
    assert.equal("workspace_id" in parsed, false);
    assert.equal("text" in parsed, false);
    assert.equal(parsed.meta.schemaVersion, 1);
    assert.ok(parsed.meta.durationMs >= 0);
    assert.deepEqual(parsed.meta.warnings, []);
    assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("tree.ts")));
  });
});

test("tree maps an unknown explicit workspace to WORKSPACE_NOT_FOUND", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { workspace_id: "ws_missing_tree_contract" }
    });

    assertTreeFailure(result, "WORKSPACE_NOT_FOUND", {
      workspace_id: "ws_missing_tree_contract"
    });
  });
});

test("tree maps a relative escape to PATH_OUTSIDE_WORKSPACE", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { path: "../outside" }
    });

    assertTreeFailure(result, "PATH_OUTSIDE_WORKSPACE", { path: "../outside" });
  });
});

test("tree maps a configured blocked path to PATH_BLOCKED", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { path: ".git" }
    });

    assertTreeFailure(result, "PATH_BLOCKED", { path: ".git" });
  });
});

test("tree maps a missing target to FILE_NOT_FOUND", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { path: "__tree_contract_missing_directory__" }
    });

    assertTreeFailure(result, "FILE_NOT_FOUND", {
      path: "__tree_contract_missing_directory__"
    });
  });
});

test("tree maps an existing file to NOT_A_DIRECTORY", async () => {
  await withInMemoryClient({}, async (client) => {
    const result = await client.callTool({
      name: "tree",
      arguments: { path: "package.json" }
    });

    assertTreeFailure(result, "NOT_A_DIRECTORY", { path: "package.json" });
  });
});

test("tree converts an injected provider failure into a fixed redacted INTERNAL_ERROR", async () => {
  const secret = ["gh", "p_", "b".repeat(32)].join("");

  await withInMemoryClient(
    {
      treeResultProvider: async () => {
        throw new Error(`tree provider failed with ${secret}`);
      }
    },
    async (client) => {
      const result = await client.callTool({ name: "tree", arguments: {} });
      const serialized = JSON.stringify(result);

      assertTreeFailure(result, "INTERNAL_ERROR", {});
      assert.doesNotMatch(serialized, new RegExp(secret));
      assert.doesNotMatch(serialized, /tree provider failed/);
      assert.doesNotMatch(serialized, /\n\s*at\s/);
    }
  );
});
```

- [x] **Step 2: Run the focused tests and verify the expected RED state**

Run:

```bash
node --test test/tree-contract.test.mjs
```

Expected result: the original 4 constructor tests pass, while the 7 new MCP tests fail because `tree` has no advertised schema, still returns the old top-level data, and the dependency seam does not exist.

- [x] **Step 3: Add the exact server imports and dependency interface**

Change the `fsOps` import in `src/server.ts` to:

```ts
import {
  repoTree,
  readTextFile,
  writeTextFile,
  editTextFile,
  ensureAiBridge,
  type TreeOptions,
  type TreeResult
} from "./fsOps.js";
```

Add this import after the existing `serverConfig` schema import:

```ts
import {
  TREE_ERROR_MESSAGES,
  createTreeFailure,
  createTreeSuccess,
  treeDataSchema,
  treeOutputShape,
  type TreeFailureInput
} from "./tools/schemas/tree.js";
```

Add this type immediately before `CodexGPTServerDependencies`:

```ts
export interface TreeProviderContext {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: TreeOptions;
}
```

Change the dependency interface to:

```ts
export interface CodexGPTServerDependencies {
  serverConfigDataProvider?: () => ServerConfigData | Promise<ServerConfigData>;
  treeResultProvider?: (context: TreeProviderContext) => Promise<TreeResult>;
}
```

- [x] **Step 4: Add the local sanitation and classification helpers**

Insert this complete block after `errorText` in `src/server.ts`:

```ts
const TREE_WINDOWS_RESERVED_SEGMENT = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

function cleanTreeDetail(value: unknown, maxLength: number, fallback: string): string {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, maxLength);
}

function safeTreeWorkspaceIdDetail(value: unknown): string {
  return cleanTreeDetail(value, 160, "[workspace id omitted]");
}

function treePathLooksUnsafeForDetails(value: string): boolean {
  const windows = value.replace(/\//g, "\\");
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return true;
  if (/^\\\\/.test(windows) || /^[A-Za-z]:/.test(windows)) return true;
  if (windows.includes(":")) return true;

  return windows
    .split(/\\+/)
    .filter(Boolean)
    .some((segment) =>
      segment !== "." &&
      segment !== ".." &&
      (segment.endsWith(".") ||
        segment.endsWith(" ") ||
        TREE_WINDOWS_RESERVED_SEGMENT.test(segment))
    );
}

function safeTreePathDetail(value: unknown): string {
  const raw = String(value ?? ".");
  if (treePathLooksUnsafeForDetails(raw)) return "[unsafe path omitted]";
  return cleanTreeDetail(raw, 240, "[path omitted]");
}

function nodeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function classifyTreeFailure(error: unknown, args: Record<string, unknown>): TreeFailureInput {
  const message = error instanceof Error ? error.message : String(error);

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  if (nodeErrorCode(error) === "ENOENT") {
    return {
      code: "FILE_NOT_FOUND",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }

  if (message.startsWith("Path is blocked by safety rules:")) {
    return {
      code: "PATH_BLOCKED",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }

  if (message.startsWith("Not a directory:")) {
    return {
      code: "NOT_A_DIRECTORY",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }

  const outsidePrefixes = [
    "Path contains a null byte.",
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];

  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}
```

This adapter remains local to `tree`. Do not move it into `guard.ts` or apply it to another tool.

- [x] **Step 5: Bind the production provider inside `createCodexGPTServer`**

Immediately after the existing `serverConfigDataProvider` binding, add:

```ts
  const treeResultProvider =
    dependencies.treeResultProvider ??
    ((context: TreeProviderContext) =>
      repoTree(context.config, context.guard, context.workspace, context.options));
```

- [x] **Step 6: Replace only the `tree` registration with the exact handler**

Replace the current `tree` registration block with:

```ts
  registerCodexTool(
    config,
    server,
    "tree",
    {
      title: "File Tree",
      description: "List files and directories inside the workspace, excluding blocked paths.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        path: z.string().optional().describe("Directory relative to workspace root. Default: ."),
        max_depth: z.number().int().min(1).max(12).optional().describe("Maximum depth. Default: 4."),
        include_hidden: z.boolean().optional().describe("Include dotfiles/dotfolders that are not blocked. Default: false."),
        max_entries: z.number().int().min(1).max(3000).optional().describe("Maximum entries. Default: 800.")
      },
      outputSchema: treeOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Listing workspace files...",
        "openai/toolInvocation/invoked": "Workspace files listed"
      }
    },
    async (args) => {
      try {
        const workspace = workspaces.getWorkspace(args.workspace_id);
        const options: TreeOptions = {
          path: args.path ?? ".",
          maxDepth: limitInt(args.max_depth, 4, 1, 12),
          includeHidden: parseBool(args.include_hidden, false),
          maxEntries: limitInt(args.max_entries, 800, 1, 3000)
        };
        const result = await treeResultProvider({ config, guard, workspace, options });
        const data = treeDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          ...result
        });

        return textResult(result.text, createTreeSuccess(data));
      } catch (error) {
        const failure = classifyTreeFailure(error, args);
        const structured = createTreeFailure(failure);
        const text = [
          "# File Tree Error",
          "",
          `Code: ${failure.code}`,
          TREE_ERROR_MESSAGES[failure.code]
        ].join("\n");

        return {
          ...textResult(text, structured),
          isError: true
        };
      }
    }
  );
```

Do not change `registerToolCompat`, `errorResult`, `tagToolResult`, or any other tool registration.

- [x] **Step 7: Run the focused tests and verify GREEN**

Run:

```bash
node --test test/tree-contract.test.mjs
```

Expected result: 11 tests passed, 0 failed.

- [x] **Step 8: Run the existing first-slice contract regression**

Run:

```bash
node --test test/server-config-contract.test.mjs
```

Expected result: 6 tests passed, 0 failed.

- [x] **Step 9: Run TypeScript validation**

Run:

```bash
npm run build
```

Expected result: exit code 0.

- [x] **Step 10: Perform a targeted internal-consumer check**

Use CodexGPT `search` for all of these patterns:

```text
name: "tree"
structuredContent.tree
structuredContent.entries
structuredContent.truncated
codexgpt_tool === "tree"
```

Expected finding: the direct tool registration and Tool Card routing are the only relevant consumers. Do not alter the `codexgpt` supertool wrapper because it is not migrated in this slice.

- [x] **Step 11: Record Task 2 in both Memory layers**

Record the exact 11-test result, 6-test regression, build result, files changed, local-classifier limitation, provider-seam boundary, and next approval gate. Root Memory must say the real MCP handler is migrated locally but the Tool Card is not yet migrated.

- [x] **Step 12: Review only Task 2 changes and stop**

Use `show_changes`. Confirm no changes to `guard.ts`, `fsOps.ts`, `common.ts`, other handlers, dependencies, profiles, or Cloudflare files. Expected state: no staged files. Stop for user approval before Task 3.

---

### Task 3: Migrate the `tree` Tool Card to nested data

**Files:**
- Modify: `src/toolCardWidget.ts:506-541`
- Modify: `src/toolCardWidget.ts:960-980`
- Modify: `src/toolCardWidget.ts:1002-1038`
- Modify: `test/tree-contract.test.mjs`
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-1.md`

**Interfaces:**
- Consumes: top-level identity plus `ok`, `data`, and `error` from the exact tree contract.
- Produces: `renderTree(data)` inside the generated widget source.
- Does not change renderers for any other tool.

- [x] **Step 1: Add the failing Tool Card source contract test**

Add this import beside the existing server import in `test/tree-contract.test.mjs`:

```js
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
```

Append this complete test:

```js
test("tree tool card reads successful fields only from nested data", () => {
  assert.match(
    toolCardWidgetHtml,
    /else if \(tool === "tree"\) \{\s*root\.innerHTML = renderTree\(data\);/
  );

  const rendererMatch = toolCardWidgetHtml.match(
    /function renderTree\(data\) \{[\s\S]*?\n  \}/
  );
  assert.ok(rendererMatch, "renderTree must exist");

  const renderer = rendererMatch[0];
  assert.match(
    toolCardWidgetHtml,
    /if \(data\?\.codexgpt_tool === "tree"\) \{\s*if \(data\?\.ok === false\)[\s\S]*?const tree = data\?\.data \?\? \{\};/
  );
  assert.match(renderer, /const tree = data\?\.data \?\? \{\};/);
  assert.match(renderer, /tree\.text/);
  assert.match(renderer, /tree\.entries/);
  assert.match(renderer, /tree\.truncated/);
  assert.match(renderer, /tree\.root/);
  assert.doesNotMatch(renderer, /data\?\.(?:text|entries|truncated|root)/);
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test test/tree-contract.test.mjs
```

Expected result: 11 tests pass and the new Tool Card test fails because `renderTree` and the dedicated routing branch do not exist.

- [x] **Step 3: Update the `tree` subtitle path**

Insert this branch in `subtitleFor(data)` immediately before the `workspace_snapshot` branch:

```js
    if (data?.codexgpt_tool === "tree") {
      if (data?.ok === false) return data?.error?.code || "File tree unavailable";
      const tree = data?.data ?? {};
      return tree.root || "File tree";
    }
```

- [x] **Step 4: Add the dedicated renderer**

Insert this complete function immediately before `renderGeneric(data)`:

```js
  function renderTree(data) {
    const tree = data?.data ?? {};
    const error = data?.error ?? {};

    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "File tree unavailable.") +
        '</div></div></article>';
    }

    const entries = Number.isFinite(tree.entries) ? tree.entries : 0;
    const truncated = tree.truncated === true;
    const text = typeof tree.text === "string" ? tree.text : "";
    const pills = [
      pill(entries + " entries", "info"),
      truncated ? pill("truncated", "warn") : pill("complete", "good")
    ].join("");

    return '<article class="card">' +
      header(data, pills) +
      '<div class="body">' +
      '<div class="metrics">' + metric("root", tree.root || "-") + '</div>' +
      fold(
        "Tree",
        countLines(text) + " lines",
        codebox("tree", esc(previewLines(text, 40)), ""),
        false
      ) +
      '</div></article>';
  }
```

- [x] **Step 5: Route `tree` to the dedicated renderer**

Insert this branch in `render(data)` immediately after the workspace/open branch and before `inspect_workspace`:

```js
    } else if (tool === "tree") {
      root.innerHTML = renderTree(data);
```

- [x] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
node --test test/tree-contract.test.mjs
```

Expected result: 12 tests passed, 0 failed.

- [x] **Step 7: Run TypeScript validation**

Run:

```bash
npm run build
```

Expected result: exit code 0.

- [x] **Step 8: Record Task 3 in both Memory layers**

Record the exact 12-test result, build result, nested-data renderer behavior, source-based card-test limitation, files changed, rollback, and next gate. Root Memory must say all planned feature code is locally implemented, but full regression and closeout are still pending.

- [x] **Step 9: Review only Task 3 changes and stop**

Use `show_changes`. Confirm only the dedicated `tree` subtitle, renderer, route, test, and Memory records were added. Expected state: no staged files. Stop for user approval before Task 4.

---

### Task 4: Run complete regression gates and close the local slice

**Files:**
- Modify only if required by a verified direct consumer: existing Smoke scripts that read direct `tree` structured output.
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-1.md`
- Do not modify source behavior unless a failing approved gate proves a defect in Tasks 1-3.

**Interfaces:**
- Consumes: the completed exact `tree` contract and dedicated card renderer.
- Produces: verified local evidence and a clean approval boundary for staging.

- [x] **Step 1: Run the focused `tree` contract suite from a fresh process**

Run:

```bash
node --test test/tree-contract.test.mjs
```

Expected result: 12 tests passed, 0 failed.

- [x] **Step 2: Run the complete Node test suite**

Run:

```bash
node --test
```

Expected result from the current 44-test baseline plus the 12 new tests: 56 tests passed, 0 failed.

- [x] **Step 3: Run the TypeScript build**

Run:

```bash
npm run build
```

Expected result: exit code 0.

- [x] **Step 4: Run the complete Smoke suite**

Run:

```bash
npm run smoke
```

Expected result: all 8 sequential Smoke sections pass.

If a Smoke consumer reads direct `tree` fields from the old top level, update only that consumer to read `structuredContent.data`, then rerun the narrow failing section and the complete Smoke command. Do not change unrelated script behavior.

- [x] **Step 5: Run the high-severity dependency audit**

Run:

```bash
npm audit --audit-level=high
```

Expected result: 0 high-severity vulnerabilities and exit code 0.

- [x] **Step 6: Run the package-content check**

Run:

```bash
npm pack --dry-run
```

Expected result: exit code 0; internal Memory archives, design specifications, implementation plans, and tests remain excluded from the published package. The new compiled tree-schema files may appear as expected build output.

- [x] **Step 7: Run the documentation regression**

Run:

```bash
node --test test/auth-documentation.test.mjs
```

Expected result: 5 tests passed, 0 failed.

- [x] **Step 8: Validate the separately blocked Stress script without changing its fixture**

Run:

```bash
node --check scripts/stress.mjs
```

Expected result: exit code 0.

Do not require `npm run stress` on native Windows and do not modify `visible:123:file.txt`. If Stress is attempted for evidence, record that the pre-existing invalid filename blocks it before the migrated path.

- [x] **Step 9: Run whitespace, conflict-marker, Memory-limit, and secret-pattern checks**

Run:

```bash
git diff --check
```

Expected result: no output and exit code 0.

Run this check. The credential-like patterns are assembled from fragments so no usable-looking value appears in source or logs:

```bash
node -e "const fs=require('fs');const files=['src/tools/schemas/tree.ts','src/server.ts','src/toolCardWidget.ts','test/tree-contract.test.mjs','Memory.md','docs/memory/archive/phase-1.md'];const patterns=[new RegExp(['gh','p_','[A-Za-z0-9]{20,}'].join('')),new RegExp(['github','_pat_','[A-Za-z0-9_]{20,}'].join('')),new RegExp(['s','k-','[A-Za-z0-9_-]{20,}'].join(''))];for(const p of files){const s=fs.readFileSync(p,'utf8');if(/^(<<<<<<<|=======|>>>>>>>)/m.test(s))throw new Error('conflict marker in '+p);if(patterns.some((pattern)=>pattern.test(s)))throw new Error('secret-like value in '+p);}const m=fs.readFileSync('Memory.md','utf8');const lines=m.split(/\r?\n/).length;const bytes=Buffer.byteLength(m);if(lines>200||bytes>25000)throw new Error('Memory hard limit exceeded');console.log(JSON.stringify({MemoryLines:lines,MemoryBytes:bytes,filesChecked:files.length}));"
```

Expected result: JSON summary, no conflict marker, no secret-like value, and Memory below 200 lines and 25 KB.

- [x] **Step 10: Verify no stale direct top-level `tree` consumers remain**

Use CodexGPT `search` for:

```text
structuredContent.text
structuredContent.entries
structuredContent.truncated
codexgpt_tool === "tree"
renderTree(data)
```

Inspect every match. Direct `tree` consumers must read tool fields from `structuredContent.data`. Top-level `codexgpt_tool`, `codexgpt_title`, `ok`, `error`, and `meta` remain valid.

- [x] **Step 11: Review the complete intended file set**

Use `show_changes` with the unified diff. Expected implementation scope:

```text
src/tools/schemas/tree.ts
src/server.ts
src/toolCardWidget.ts
test/tree-contract.test.mjs
Memory.md
docs/memory/archive/phase-1.md
```

Additional Smoke script changes are permitted only when Step 4 proves an actual direct consumer. Any other file requires a separate scope decision.

Confirm:

- no staged files;
- no dependency changes;
- no credential, profile, or Cloudflare changes;
- no Phase 2 behavior;
- no other tool output migration;
- no change to the native-Windows Stress fixture.

- [x] **Step 12: Record complete local closeout in both Memory layers**

The Phase 1 archive entry must include:

- exact files changed;
- TDD RED/GREEN sequence for Tasks 1-3;
- exact focused/full/build/Smoke/audit/package/documentation/syntax/check results;
- stable contract summary;
- compatibility impact;
- local-classifier and absolute-success-root limitations;
- native-Windows Stress limitation;
- rollback method;
- explicit statement that no stage, commit, push, dependency, credential, profile, or Cloudflare operation occurred;
- next step: user reviews the complete local slice and separately approves staging.

Update root Memory current state, evidence, open items, and recent summary while remaining below its limits.

- [x] **Step 13: Stop at the Git approval boundary**

Do not stage, commit, or push. Present the verified result and wait for explicit user approval for staging.

---

## Rollback map

Before staging, rollback is file-local:

1. Restore the former `tree` registration and remove `tree.outputSchema`.
2. Remove the `treeResultProvider` dependency seam and local classifier helpers if unused.
3. Restore the former generic Tool Card handling for `tree`.
4. Remove `src/tools/schemas/tree.ts`.
5. Remove `test/tree-contract.test.mjs`.
6. Restore the root Memory state and append an explicit rollback record to the Phase 1 archive.
7. Rebuild `dist` from the restored source.

No user configuration, credentials, profiles, workspaces, dependencies, remote branches, or Cloudflare state require rollback.

## Execution protocol

- Execute one task at a time.
- Use TDD exactly in the written order.
- After each task, update both Memory layers and show the complete task diff.
- Wait for user approval before the next task.
- After Task 4, wait for separate approval before staging.
- Staging, committing, pushing, and CI review remain separately approved operations.
- Do not begin Phase 2 after this slice; Phase 1 remains active until its agreed tool-migration scope is formally closed.
