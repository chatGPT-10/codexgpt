# `list_workspaces` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate only direct `list_workspaces` to the exact Phase 1 schema-v1 envelope with strict nested workspace inventory data, two stable redacted failures, validated provider output, Tool Card and supertool compatibility, and fail-closed protected HTTP Smoke compatibility.

**Architecture:** Add one tool-owned schema module and one injectable read-provider boundary around the existing `WorkspaceManager.listWorkspaces()` operation. Invoke the provider in its own failure stage, strictly validate each workspace record and list invariants, preserve provider order, derive `count`, construct the exact nested result, and keep the existing readable text. Update consumers to read nested results first while preserving historical flat Tool Card fallback.

**Tech Stack:** TypeScript, Node.js 20/24, Zod 3, MCP SDK in-memory transport, `node:test`, existing CodexGPT Tool Card, exact in-memory Smoke compatibility loaders, Git Bash verification backend on Windows.

## Global Constraints

- Implement one direct tool only: `list_workspaces`.
- Follow `AGENTS.md` and the approved design at `docs/superpowers/specs/2026-07-13-list-workspaces-output-schema-design.md`.
- Preserve item field names exactly as `id`, `root`, and `openedAt`.
- Preserve empty-list success, provider insertion order, deterministic IDs, canonical roots, and shared process-local cross-session inventory.
- Do not migrate `inspect_workspace`, `codexgpt_inventory`, `load_skill`, `read_handoff`, `codex_context`, or Pro-context tools.
- Do not begin Phase 2 workspace ownership, expiry, persistence, close, random-session-ID, or explicit-ID work.
- Do not change tool-mode membership; `list_workspaces` remains full-mode only.
- Do not add filesystem existence checks, sorting, deduplication by mutation, or automatic workspace opening.
- Do not add dependencies or modify `package.json` or `package-lock.json`.
- Do not edit `scripts/smoke.mjs` or `scripts/http-smoke.mjs` directly.
- Use one exact fail-closed in-memory HTTP Smoke compatibility substitution only.
- Do not add a production test mode, hidden MCP argument, environment switch, or global mutable fixture.
- Do not expose raw exceptions, malformed provider records, roots from failed data, stacks, tokens, secret-looking values, or provider diagnostics in public failures.
- Keep query-token, Host/Origin, Cloudflare, profile, credential, allowed-root, and path-policy behavior unchanged.
- Run the narrowest relevant test first after every behavior change.
- After each completed task, append exact verification evidence to the active Phase 1 archive and update `Memory.md` concisely.
- Check archive rollover after each complete task; continue in active `docs/memory/archive/phase-1-part-4.md` only while it remains below the configured threshold.
- Stop before staging, commit, push, destructive Git operations, history rewrites, or Phase 2 unless the user explicitly authorizes them.

---

## Task 1: Add the RED contract and exact schema module

**Files:**

- Create: `test/list-workspaces-contract.test.mjs`
- Create: `src/tools/schemas/listWorkspaces.ts`
- Reference: `src/tools/schemas/common.ts`
- Reference: `src/tools/schemas/workspaceSnapshot.ts`
- Reference: `test/workspace-snapshot-contract.test.mjs`

**Interfaces:**

- Consumes: `createToolMeta(durationMs)` and `toolMetaSchema` from `src/tools/schemas/common.ts`.
- Produces: `LIST_WORKSPACES_ERROR_MESSAGES`, `listWorkspaceItemSchema`, `listWorkspacesDataSchema`, `listWorkspacesOutputShape`, `listWorkspacesOutputSchema`, `createListWorkspacesSuccess`, `createListWorkspacesFailure`, `ListWorkspacesData`, `ListWorkspacesFailureInput`.

- [x] **Step 1.1: Create the focused contract test in an intentional RED state**

Create `test/list-workspaces-contract.test.mjs` with the established in-memory MCP imports:

```js
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tsImport } from "tsx/esm/api";

const { createCodexGPTServer } = await tsImport("../src/server.ts", import.meta.url);
const { toolCardWidgetHtml } = await tsImport("../src/toolCardWidget.ts", import.meta.url);
const schemaModule = await tsImport(
  "../src/tools/schemas/listWorkspaces.ts",
  import.meta.url
).catch(() => null);

const {
  LIST_WORKSPACES_ERROR_MESSAGES,
  createListWorkspacesFailure,
  createListWorkspacesSuccess,
  listWorkspacesOutputSchema
} = schemaModule ?? {};
```

Use this exact sample data helper:

```js
function sampleListData(overrides = {}) {
  return {
    workspaces: [
      {
        id: "ws_0123456789abcdef01234567",
        root: "D:\\Dev\\project",
        openedAt: "2026-07-13T12:34:56.789Z"
      }
    ],
    count: 1,
    ...overrides
  };
}
```

Use these fixed public failure fixtures:

```js
const failureCases = [
  {
    code: "WORKSPACE_LIST_FAILED",
    details: {},
    message: "The open workspace list could not be collected."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The workspace list failed because of an internal error."
  }
];
```

Add pure schema tests that assert:

1. The schema module and all required exports exist.
2. Success has exactly the top-level keys `codexgpt_title`, `codexgpt_tool`, `data`, `error`, `meta`, `ok`.
3. Success data has exactly `count` and `workspaces`.
4. Each workspace has exactly `id`, `openedAt`, and `root`.
5. Tool identity is exactly `list_workspaces`; title is exactly `List Workspaces`.
6. `meta` is exactly `{ schemaVersion: 1, durationMs: 7, warnings: [] }` for duration 7.
7. Empty-list success is valid with `{ workspaces: [], count: 0 }`.
8. Every approved failure has the exact code, message, `retryable: false`, empty details, and duration.
9. Reject all of the following:
   - flat top-level `workspaces` or `count`;
   - any additional top-level, data, item, error-detail, or meta field;
   - wrong tool identity or title;
   - success with `data: null` or non-null `error`;
   - failure with non-null `data` or null `error`;
   - empty `id`, empty `root`, or invalid `openedAt`;
   - timestamps without UTC `Z` or without millisecond precision;
   - negative or non-integer `count`;
   - `count !== workspaces.length`;
   - duplicate workspace IDs;
   - duplicate workspace roots;
   - private diagnostic fields in error details.

Use this exact timestamp rule in tests:

```js
const validOpenedAt = "2026-07-13T12:34:56.789Z";
const invalidOpenedAt = [
  "2026-07-13",
  "2026-07-13T12:34:56Z",
  "2026-07-13T12:34:56.789+02:00",
  "not-a-timestamp"
];
```

- [x] **Step 1.2: Add in-memory test helpers and future handler cases**

Use the same full `CodexGPTConfig` fixture shape as the adjacent workspace tests. The helper must set `toolMode: "full"`, disable authentication for in-memory tests, and keep paths in temporary allowed roots.

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
    toolMode: "full",
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
  const server = createCodexGPTServer(config, dependencies ?? {});
  const client = new Client({ name: "list-workspaces-contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client, server);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

async function callTool(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}
```

Prepare focused handler tests now, even though they remain RED until Tasks 2 and 3:

- empty inventory before opening;
- real inventory after `open_current_workspace`;
- two-root insertion order;
- exact output descriptor in full mode;
- tool absent in standard/minimal modes;
- injected provider order;
- provider throw and rejection;
- malformed array, item, timestamp, duplicate ID, duplicate root;
- redaction of provider diagnostics;
- nested Tool Card success/failure and flat fallback;
- supertool wrapping;
- protected HTTP compatibility source assertion.

- [x] **Step 1.3: Run the complete focused test and record RED evidence**

Run:

```text
node --test test/list-workspaces-contract.test.mjs
```

Expected result:

- the source-shape tests that inspect existing registration may pass;
- schema/descriptor/handler/consumer tests fail because the schema module and migrated behavior do not exist;
- no failure should be caused by a syntax error in the test itself.

Record exact passed/failed counts and representative expected failure reasons in `Memory.md` and the active Phase 1 archive after Task 1 is complete.

- [x] **Step 1.4: Create `src/tools/schemas/listWorkspaces.ts`**

Implement the schema module with this structure:

```ts
import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const LIST_WORKSPACES_ERROR_MESSAGES = {
  WORKSPACE_LIST_FAILED: "The open workspace list could not be collected.",
  INTERNAL_ERROR: "The workspace list failed because of an internal error."
} as const;

const openedAtSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}, "openedAt must be an exact UTC ISO-8601 timestamp.");

export const listWorkspaceItemSchema = z.object({
  id: z.string().min(1),
  root: z.string().min(1),
  openedAt: openedAtSchema
}).strict();

export const listWorkspacesDataSchema = z.object({
  workspaces: z.array(listWorkspaceItemSchema),
  count: z.number().int().nonnegative()
}).strict().superRefine((value, context) => {
  if (value.count !== value.workspaces.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["count"],
      message: "count must equal workspaces.length."
    });
  }

  const ids = new Set();
  const roots = new Set();
  value.workspaces.forEach((workspace, index) => {
    if (ids.has(workspace.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workspaces", index, "id"],
        message: "Workspace ids must be unique."
      });
    }
    ids.add(workspace.id);

    if (roots.has(workspace.root)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workspaces", index, "root"],
        message: "Workspace roots must be unique."
      });
    }
    roots.add(workspace.root);
  });
});

const emptyDetailsSchema = z.object({}).strict();

const workspaceListFailedErrorSchema = z.object({
  code: z.literal("WORKSPACE_LIST_FAILED"),
  message: z.literal(LIST_WORKSPACES_ERROR_MESSAGES.WORKSPACE_LIST_FAILED),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(LIST_WORKSPACES_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const listWorkspacesErrorSchema = z.discriminatedUnion("code", [
  workspaceListFailedErrorSchema,
  internalErrorSchema
]);

export const listWorkspacesOutputShape = {
  codexgpt_tool: z.literal("list_workspaces"),
  codexgpt_title: z.literal("List Workspaces"),
  ok: z.boolean(),
  data: listWorkspacesDataSchema.nullable(),
  error: listWorkspacesErrorSchema.nullable(),
  meta: toolMetaSchema
};
```

Complete the module with a strict top-level schema and `superRefine` rules identical in semantics to the published adjacent tool modules:

- success requires non-null data and null error;
- failure requires null data and non-null error.

Add these exact types and constructors:

```ts
export type ListWorkspacesData = z.infer<typeof listWorkspacesDataSchema>;
export type ListWorkspacesStructuredResult = z.infer<typeof listWorkspacesOutputBaseSchema>;

export type ListWorkspacesFailureInput =
  | { code: "WORKSPACE_LIST_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createListWorkspacesSuccess(
  data: ListWorkspacesData,
  durationMs = 0
): ListWorkspacesStructuredResult;

export function createListWorkspacesFailure(
  failure: ListWorkspacesFailureInput,
  durationMs = 0
): ListWorkspacesStructuredResult;
```

Both constructors must parse through the strict full output schema and use `createToolMeta(durationMs)`.

- [x] **Step 1.5: Run the focused test and confirm schema GREEN / handler RED**

Run:

```text
node --test test/list-workspaces-contract.test.mjs
```

Expected result:

- pure schema and constructor tests pass;
- descriptor, handler, Tool Card, supertool, and HTTP compatibility tests remain RED for the planned missing implementation;
- no published adjacent schema is modified.

- [x] **Step 1.6: Review Task 1 and update project memory**

Run:

```text
git diff --check
```

Then inspect only the two new files with `show_changes` or targeted reads. Append a complete Task 1 record to the active Phase 1 archive and update `Memory.md` with exact RED and intermediate GREEN evidence. Do not stage or commit.

---

## Task 2: Add the provider boundary, validation, descriptor, and exact handler

**Files:**

- Modify: `src/server.ts` at schema imports, provider types/dependencies, provider construction, and direct `list_workspaces` registration.
- Continue: `test/list-workspaces-contract.test.mjs`
- Reference: `src/guard.ts` workspace interface and manager behavior; do not modify it.

**Interfaces:**

- Consumes: all exports created in Task 1 and existing `Workspace` type.
- Produces: optional dependency `listWorkspacesProvider?: () => Workspace[] | Promise<Workspace[]>`; exact direct handler output.

- [x] **Step 2.1: Add the schema imports**

Add one import block beside the adjacent workspace schema imports:

```ts
import {
  LIST_WORKSPACES_ERROR_MESSAGES,
  createListWorkspacesFailure,
  createListWorkspacesSuccess,
  listWorkspacesDataSchema,
  listWorkspacesOutputShape,
  type ListWorkspacesFailureInput
} from "./tools/schemas/listWorkspaces.js";
```

Do not reorganize unrelated imports or extract shared schema modules.

- [x] **Step 2.2: Add the test-only provider dependency**

In the existing `CodexGPTServerDependencies` interface, add exactly:

```ts
listWorkspacesProvider?: () => Workspace[] | Promise<Workspace[]>;
```

Near the other provider initialization in `createCodexGPTServer`, add:

```ts
const listWorkspacesProvider =
  dependencies.listWorkspacesProvider ??
  (() => workspaces.listWorkspaces());
```

This must not become a global variable, environment switch, MCP argument, or public configuration field.

- [x] **Step 2.3: Add strict internal provider parsing**

Near the existing workspace provider schemas, add an internal strict array schema:

```ts
const listWorkspacesProviderItemSchema = z.object({
  id: z.string().min(1),
  root: z.string().min(1),
  openedAt: z.string().min(1)
}).strict();

const listWorkspacesProviderResultSchema = z.array(listWorkspacesProviderItemSchema);
```

Do not validate timestamps here with a second competing rule. Final exact timestamp, uniqueness, and count invariants are owned by `listWorkspacesDataSchema`.

- [x] **Step 2.4: Add a fixed failure text helper**

Add:

```ts
function listWorkspacesFailureText(failure: ListWorkspacesFailureInput): string {
  return [
    "# List Workspaces Error",
    "",
    `Code: ${failure.code}`,
    LIST_WORKSPACES_ERROR_MESSAGES[failure.code]
  ].join("\n");
}
```

The helper must not accept or interpolate raw errors.

- [x] **Step 2.5: Advertise the exact output schema**

In the existing descriptor add:

```ts
outputSchema: listWorkspacesOutputShape,
```

Preserve:

- `inputSchema: {}`;
- title and description;
- read-only annotations;
- Tool Card metadata;
- full-mode-only registration.

- [x] **Step 2.6: Replace the flat handler with staged exact handling**

Use two explicit stages so provider invocation failure cannot be confused with malformed output:

```ts
async () => {
  const startedAt = Date.now();
  let rawWorkspaces: unknown;

  try {
    rawWorkspaces = await listWorkspacesProvider();
  } catch {
    const failure: ListWorkspacesFailureInput = {
      code: "WORKSPACE_LIST_FAILED",
      details: {}
    };
    return {
      ...textResult(
        listWorkspacesFailureText(failure),
        createListWorkspacesFailure(failure, Date.now() - startedAt)
      ),
      isError: true
    };
  }

  try {
    const current = listWorkspacesProviderResultSchema.parse(rawWorkspaces);
    const data = listWorkspacesDataSchema.parse({
      workspaces: current.map((workspace) => ({
        id: workspace.id,
        root: workspace.root,
        openedAt: workspace.openedAt
      })),
      count: current.length
    });
    const text = current.length
      ? current
          .map(
            (workspace) =>
              `- ${workspace.id} — ${workspace.root} (opened ${workspace.openedAt})`
          )
          .join("\n")
      : "No workspaces opened on this CodexGPT server/config yet. Call open_workspace first.";

    return textResult(
      text,
      createListWorkspacesSuccess(data, Date.now() - startedAt)
    );
  } catch {
    const failure: ListWorkspacesFailureInput = {
      code: "INTERNAL_ERROR",
      details: {}
    };
    return {
      ...textResult(
        listWorkspacesFailureText(failure),
        createListWorkspacesFailure(failure, Date.now() - startedAt)
      ),
      isError: true
    };
  }
}
```

Do not sort, mutate, filter, stat, realpath, or auto-open workspaces.

- [x] **Step 2.7: Complete focused handler and descriptor assertions**

Make the prepared tests assert:

- full-mode descriptor contains the exact output schema;
- standard/minimal descriptors omit the tool;
- no input fields are advertised;
- empty result is successful, nested, and exact;
- real opened workspace appears with the canonical root and exact timestamp;
- two authorized roots retain opening order;
- an injected reversed provider order remains reversed;
- two separate MCP clients using the same server configuration see shared manager inventory;
- provider throw and rejected promise return `WORKSPACE_LIST_FAILED` with `isError: true`;
- malformed records, invalid timestamp, duplicate ID, and duplicate root return `INTERNAL_ERROR`;
- raw diagnostic strings and malformed roots do not appear in text or structured output;
- success has no duplicated flat fields.

- [x] **Step 2.8: Run focused and adjacent tests**

Run:

```text
node --test test/list-workspaces-contract.test.mjs
```

Expected: handler and descriptor tests pass; only Task 3 consumer tests may remain RED.

Then run:

```text
node --test test/list-workspaces-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/server-config-contract.test.mjs
```

Expected: all adjacent workspace/config contracts pass.

- [x] **Step 2.9: Build and review Task 2**

Run:

```text
npm run build
git diff --check
```

Expected: TypeScript build passes and diff checking reports no whitespace errors. Update `Memory.md` and append the exact Task 2 verification evidence to the active Phase 1 archive. Do not stage or commit.

---

## Task 3: Migrate Tool Card, supertool assertions, and protected HTTP Smoke compatibility

**Files:**

- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/http-smoke-compat.mjs`
- Continue: `test/list-workspaces-contract.test.mjs`
- Must not modify: `scripts/http-smoke.mjs`
- Must not modify: `scripts/smoke.mjs`

**Interfaces:**

- Consumes: exact nested `list_workspaces` envelope from Task 2.
- Produces: nested-first Tool Card rendering, historical flat fallback, exact protected-source in-memory migration, supertool consumer evidence.

- [x] **Step 3.1: Add a nested-first Tool Card data normalizer**

Add a focused helper near the workspace-result normalizer:

```js
function listWorkspacesResultData(data) {
  const nested =
    data?.codexgpt_tool === "list_workspaces" &&
    data?.data &&
    typeof data.data === "object";
  return nested ? data.data : (data ?? {});
}
```

Do not broaden the existing open/snapshot normalizer or refactor unrelated Tool Card code.

- [x] **Step 3.2: Update the subtitle path**

Replace the flat-only branch with:

```js
if (data?.codexgpt_tool === "list_workspaces") {
  if (data?.ok === false) return data?.error?.code || "Workspace list unavailable";
  const listed = listWorkspacesResultData(data);
  return (listed?.count ?? 0) + " open workspaces";
}
```

This must still support old flat saved results through `listWorkspacesResultData`.

- [x] **Step 3.3: Update `renderWorkspaces` for nested success and fixed failure**

Use this behavior:

```js
function renderWorkspaces(data) {
  const error = data?.error ?? {};
  if (data?.ok === false) {
    return '<article class="card">' +
      header(data, pill(error.code || "error", "bad")) +
      '<div class="body"><div class="empty">' +
      esc(error.message || "Workspace list unavailable.") +
      '</div></div></article>';
  }

  const listed = listWorkspacesResultData(data);
  const spaces = Array.isArray(listed.workspaces) ? listed.workspaces : [];
  const rows = spaces.map((workspace) =>
    '<div class="file-row"><span class="file-code">ws</span><span class="file-name">' +
    esc((workspace?.id || "workspace") + " — " + (workspace?.root || "")) +
    '</span></div>'
  ).join("");

  return '<article class="card">' +
    header(data, pill((listed.count ?? spaces.length) + " open", "info")) +
    '<div class="body"><div class="file-list">' +
    (rows || '<div class="empty">No workspaces opened yet.</div>') +
    '</div></div></article>';
}
```

Retain existing escaping. Do not display `openedAt` unless separately approved; this migration preserves current visual scope.

- [x] **Step 3.4: Add Tool Card tests**

Assert generated widget HTML contains logic for:

- `data?.data` nested access for `list_workspaces`;
- nested count and workspace array;
- fixed error code/message path;
- historical flat fallback;
- no direct rendering of malformed failure workspaces.

Where practical, use existing source-shape assertions rather than introducing a browser runtime dependency.

- [x] **Step 3.5: Add supertool direct-action coverage**

Call:

```js
const result = await callTool(client, "codexgpt", {
  action: "list_workspaces",
  args: {}
});
```

Assert:

```js
assert.equal(result.structuredContent.codexgpt_tool, "list_workspaces");
assert.equal(result.structuredContent.codexgpt_title, "List Workspaces");
assert.equal(result.structuredContent.codexgpt_super_action, "list_workspaces");
assert.equal(result.structuredContent.wrapped_tool, "list_workspaces");
assert.equal(result.structuredContent.ok, true);
assert.deepEqual(result.structuredContent.data.workspaces, []);
assert.equal(result.structuredContent.data.count, 0);
```

Also assert the wrapper does not reintroduce flat `workspaces` or `count`.

- [x] **Step 3.6: Extend the protected HTTP Smoke compatibility loader**

Add one replacement pair to `scripts/http-smoke-compat.mjs`:

```js
[
  "list.structuredContent.workspaces.map",
  "list.structuredContent.data?.workspaces.map"
]
```

The existing exact-once loop must remain unchanged. Do not write transformed source to disk, do not weaken credential-shape protection, and do not modify the protected source.

- [x] **Step 3.7: Add compatibility assertions**

In the focused contract test, read both files and assert:

- `scripts/http-smoke.mjs` still contains the old protected flat access exactly once;
- `scripts/http-smoke-compat.mjs` contains the exact old/new replacement pair;
- the loader uses exact-once matching;
- no transformed source file path is introduced;
- `scripts/smoke.mjs` remains unchanged by this slice.

- [x] **Step 3.8: Run focused, Build, and standalone HTTP Smoke gates**

Run in order:

```text
node --test test/list-workspaces-contract.test.mjs
npm run build
node scripts/http-smoke-compat.mjs
```

Expected:

- focused contracts all pass;
- Build passes;
- HTTP Smoke passes through the in-memory compatibility loader;
- protected source files remain unchanged.

- [x] **Step 3.9: Run adjacent workspace tests and complete Smoke**

Run:

```text
node --test test/list-workspaces-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/server-config-contract.test.mjs
npm run smoke
```

Expected: all adjacent tests and all eight Smoke sections pass.

- [x] **Step 3.10: Review Task 3 and update memory**

Run:

```text
git diff --check
```

Use `show_changes` to confirm the consumer change set is limited to the Tool Card, compatibility loader, focused contract, and already approved schema/server files. Update `Memory.md` and append the exact Task 3 evidence to the active Phase 1 archive. Do not stage or commit.

---

## Task 4: Complete regression, documentation, memory, and implementation review

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Append: `docs/memory/archive/phase-1-part-3.md`, unless rollover threshold requires a new numbered volume
- Update status/evidence: `docs/superpowers/specs/2026-07-13-list-workspaces-output-schema-design.md`
- Update checkboxes/evidence: `docs/superpowers/plans/2026-07-13-list-workspaces-output-schema.md`
- Review all Slice 15 source/test/compatibility files

**Interfaces:**

- Consumes: locally complete Tasks 1–3.
- Produces: fully verified, documented, unstaged implementation ready for a separate publication decision.

- [x] **Step 4.1: Run the complete focused and adjacent contract set from a fresh process**

Run:

```text
node --test test/list-workspaces-contract.test.mjs
node --test test/list-workspaces-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/server-config-contract.test.mjs
```

Record exact totals. No test may be reported as passed from an earlier run.

- [x] **Step 4.2: Run the complete Node regression**

Run:

```text
node --test test/*.test.mjs
```

Expected: every test passes. Record the exact total and any platform skips separately.

- [x] **Step 4.3: Run Build and both Smoke entry paths**

Run:

```text
npm run build
node scripts/http-smoke-compat.mjs
npm run smoke
```

Expected:

- TypeScript build passes;
- standalone HTTP Smoke passes;
- all eight complete Smoke sections pass.

- [x] **Step 4.4: Run native-Windows Stress**

Run:

```text
npm run stress
```

Expected: native-Windows Stress passes, including its internal Build. Record any established capability skip by exact name; do not describe it as a passed executed fixture.

- [x] **Step 4.5: Verify package contents**

Run:

```text
npm pack --dry-run
```

Expected:

- package dry-run succeeds;
- new internal design, plan, Memory, and archive files remain excluded according to existing package policy;
- `src/tools/schemas/listWorkspaces.ts` is included through the compiled/package source policy as appropriate;
- no secret-looking or local profile file is included.

Record file count, compressed size, and unpacked size.

- [x] **Step 4.6: Update durable documentation**

Update `CHANGELOG.md` with one concise Phase 1 bullet covering:

- exact direct `list_workspaces` envelope;
- nested Tool Card/supertool consumers;
- protected HTTP Smoke compatibility;
- no lifecycle or Phase 2 change.

Update the `AGENTS.md` documentation map with the Slice 15 design and plan paths. Update the stopping point only after local verification is complete; state accurately whether the slice is merely locally complete or published.

Update `Memory.md` in place, keeping it within the project size limits. Preserve only current state, active decisions, evidence, limitations, open items, recent summaries, and archive links.

Append a complete STEP record to the active Phase 1 archive with:

- goal;
- files changed;
- implementation summary;
- exact verification commands;
- exact results;
- decisions;
- limitations;
- rollback;
- next approved action.

- [x] **Step 4.7: Update design and plan status accurately**

If all local gates pass:

- design status becomes `Implemented locally; publication not started`;
- plan Tasks 1–4 checkboxes and evidence are reconciled with actual work;
- Task 5 is explicitly approved and in progress; publication evidence must still remain factual and exact-head based.

Do not use `Published`, `CI-validated`, or equivalent language before commit/push/exact-head CI actually occur.

- [x] **Step 4.8: Run placeholder, contradiction, and secret scans**

Use targeted project search for:

```text
TODO
TBD
implementation not started
Published
list_workspaces
WORKSPACE_LIST_FAILED
```

Review every relevant result. Ensure:

- no stale status contradicts actual work;
- no placeholder remains in the new spec/plan;
- no real token, credential, private key, or secret-shaped fixture was added;
- no raw exception or malformed provider data reaches public errors;
- protected Smoke sources are unchanged.

- [x] **Step 4.9: Run final diff and scope checks**

Run:

```text
git diff --check
```

Then call `show_changes(include_diff=true)` and verify the changed-file set is limited to:

```text
src/tools/schemas/listWorkspaces.ts
src/server.ts
src/toolCardWidget.ts
scripts/http-smoke-compat.mjs
test/list-workspaces-contract.test.mjs
CHANGELOG.md
AGENTS.md
Memory.md
docs/memory/archive/phase-1-part-3.md or its approved rollover successor
docs/superpowers/specs/2026-07-13-list-workspaces-output-schema-design.md
docs/superpowers/plans/2026-07-13-list-workspaces-output-schema.md
```

Confirm these remain unchanged:

```text
src/guard.ts
scripts/smoke.mjs
scripts/http-smoke.mjs
package.json
package-lock.json
```

- [x] **Step 4.10: Stop at the implementation review gate**

Report:

- exact focused/adjacent/complete test totals;
- Build, HTTP Smoke, full Smoke, Stress, package, and diff outcomes;
- exact changed-file set;
- remaining limitations;
- rollback method.

Do not stage, commit, push, or begin Phase 2. Await a separate publication instruction.

---

## Task 5: Publication review and exact-head CI — only after separate approval

**Files:**

- Review all Slice 15 files from Task 4.
- Potentially update only `AGENTS.md`, `Memory.md`, active archive, design, and plan for publication evidence.
- No new feature files are authorized in this task.

**Interfaces:**

- Consumes: a cleanly reviewed, fully green, unstaged Slice 15 implementation.
- Produces: precise implementation commit, push, exact-head cross-platform CI evidence, and a separate durable publication record when required.

- [x] **Step 5.1: Load and run `neat-freak` for publication review**

Inspect only the Slice 15 changed files and durable records. Reconcile stale wording, duplicate records, file-size limits, archive rollover, exact test totals, and rollback language. Do not perform broad formatting or unrelated cleanup.

- [x] **Step 5.2: Re-run all final local gates after any review edit**

Run:

```text
node --test test/list-workspaces-contract.test.mjs
node --test test/list-workspaces-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/server-config-contract.test.mjs
node --test test/*.test.mjs
npm run build
node scripts/http-smoke-compat.mjs
npm run smoke
npm run stress
npm pack --dry-run
git diff --check
```

Every claim must use this fresh output.

- [x] **Step 5.3: Precisely stage only the reviewed files**

Do not use `git add .`. Stage the exact reviewed Slice 15 file list. Then run:

```text
git diff --cached --check
```

Review the staged summary and staged diff. Stop if any unrelated, secret-looking, profile, credential, protected-source, dependency, or Phase 2 file appears.

- [x] **Step 5.4: Create the implementation commit**

Use:

```text
feat(schema): add exact list_workspaces result contract
```

Record the short and full commit SHA. Do not amend or rewrite prior history.

- [x] **Step 5.5: Push only after the explicit publication approval remains valid**

Push `main` to `origin/main`. Record the exact before/after range. Do not force push.

- [x] **Step 5.6: Verify exact-head GitHub Actions**

Match the full implementation SHA to the public GitHub Actions run and verify all matrix jobs:

- Ubuntu / Node 20;
- Ubuntu / Node 24;
- Windows / Node 20;
- Windows / Node 24.

Do not infer CI success from branch status or a different commit.

- [x] **Step 5.7: Record publication evidence separately**

Update `Memory.md`, `AGENTS.md`, active archive, design status, and plan status with:

- implementation commit SHA;
- push range;
- exact CI run ID;
- each matrix job conclusion;
- published contract summary;
- limitations and normal-revert rollback.

Create and push a separate documentation record commit if that is still the established project workflow. Verify that record commit's exact-head CI before claiming the final repository head is fully validated.

- [x] **Step 5.8: Stop with Phase 2 still closed**

The next action after publication is design review of another remaining Phase 1 direct tool. Do not begin workspace lifecycle redesign until the remaining Phase 1 scope is explicitly reviewed and Phase 2 is opened separately.

---

## Plan Self-Review Checklist

Before implementation begins, verify:

- [x] Every requirement in the approved design maps to a task above.
- [x] No `TODO`, `TBD`, vague “handle errors,” or unspecified test step remains.
- [x] Item names are consistently `id`, `root`, and `openedAt`.
- [x] Provider name is consistently `listWorkspacesProvider`.
- [x] Public failure codes are only `WORKSPACE_LIST_FAILED` and `INTERNAL_ERROR`.
- [x] Success data fields are only `workspaces` and `count`.
- [x] Tool mode remains full only.
- [x] Protected source files remain unchanged.
- [x] Tasks 1–4 stop before staging and commit.
- [x] Task 5 is explicitly gated by separate publication approval.
- [x] Phase 2 remains closed.

## Execution Handoff

All five tasks are complete. Implementation commit `c4eb31a` passed exact-head CI run `29267724784` across Ubuntu/Windows Node 20/24. The remaining publication action is this separate durable record commit and its exact-head CI verification; after that, design-review the next remaining Phase 1 direct tool while keeping Phase 2 closed.
