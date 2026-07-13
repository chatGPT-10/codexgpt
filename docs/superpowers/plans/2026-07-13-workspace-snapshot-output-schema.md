# `workspace_snapshot` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate only direct `workspace_snapshot` to the exact Phase 1 schema-v1 envelope with strict nested data, stable redacted failures, validated summary/AI-context providers, Tool Card and supertool compatibility, and protected Smoke compatibility.

**Architecture:** Add one tool-owned schema module and two injectable read-provider boundaries around the existing `workspaceSummary` and `readAiBridgeContext` operations. Resolve the workspace first, invoke and validate each provider in a separate failure stage, normalize only approved AI bridge filenames, build exact public data, and preserve the existing redacted text response. Keep the tool full-mode only and retain historical flat Tool Card fallback.

**Tech Stack:** TypeScript, Node.js 20/24, Zod 3, MCP SDK in-memory transport, `node:test`, existing CodexPro Tool Card, Git Bash verification backend on Windows.

## Global Constraints

- Implement one direct tool only: `workspace_snapshot`.
- Follow `AGENTS.md` and the approved design at `docs/superpowers/specs/2026-07-13-workspace-snapshot-output-schema-design.md`.
- Do not migrate `list_workspaces`, `inspect_workspace`, `codex_context`, `read_handoff`, or `export_pro_context`.
- Do not begin Phase 2 workspace identity, ownership, expiry, persistence, close, or explicit-ID work.
- Do not change tool-mode membership; `workspace_snapshot` remains full-mode only.
- Do not create or modify `.ai-bridge` files from this read-only tool.
- Do not add dependencies or modify `package-lock.json`.
- Do not edit `scripts/smoke.mjs` or `scripts/http-smoke.mjs` directly.
- Use exact fail-closed in-memory compatibility substitutions only.
- Do not add a production test mode, hidden MCP argument, environment switch, or global mutable fixture.
- Do not expose raw exceptions, roots, forbidden paths, handoff contents, stacks, tokens, or secret-looking values in public failures.
- Keep the existing query-token, Host/Origin, Cloudflare, profile, and credential behavior unchanged.
- Run the narrowest test first after every behavior change.
- After each completed task, append the exact verification evidence to the active Phase 1 archive and update `Memory.md` concisely.
- Check archive rollover after every complete task. The current active archive is below the 80% direct-read threshold, so continue in `docs/memory/archive/phase-1-part-3.md` unless its size crosses the threshold during implementation.
- Stop before staging, commit, push, destructive Git operations, or Phase 2 unless the user explicitly authorizes them.

---

## Task 1: Add the RED contract and exact schema module

**Files:**

- Create: `test/workspace-snapshot-contract.test.mjs`
- Create: `src/tools/schemas/workspaceSnapshot.ts`
- Reference: `src/tools/schemas/common.ts`
- Reference: `src/tools/schemas/openWorkspace.ts`
- Reference: `test/open-workspace-contract.test.mjs`

### Step 1.1 — Create the complete focused contract test in RED state

- [ ] Create `test/workspace-snapshot-contract.test.mjs` using the existing in-memory MCP pattern.

Use these imports and schema loading rules:

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
  "../src/tools/schemas/workspaceSnapshot.ts",
  import.meta.url
).catch(() => null);

const {
  WORKSPACE_SNAPSHOT_ERROR_MESSAGES,
  createWorkspaceSnapshotFailure,
  createWorkspaceSnapshotSuccess,
  workspaceSnapshotOutputSchema
} = schemaModule ?? {};
```

Define this exact sample data shape:

```js
function sampleSnapshotData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\project",
    agents_loaded: true,
    agents_path: "AGENTS.md",
    skills: ["workspace-skill", "plugin-skill"],
    skill_inventory: [
      {
        name: "workspace-skill",
        description: null,
        source: "workspace",
        path: "$WORKSPACE/.codex/skills/workspace-skill/SKILL.md"
      },
      {
        name: "plugin-skill",
        description: "Plugin description",
        source: "plugin",
        path: "~/.codex/plugins/cache/example/plugin-skill/SKILL.md"
      }
    ],
    skill_counts: {
      total: 2,
      workspace: 1,
      user: 0,
      plugin: 1,
      other: 0
    },
    tree: ".\n└── package.json",
    git_status: "## main",
    ai_context_files: [
      ".ai-bridge/current-plan.md",
      ".ai-bridge/decisions.md"
    ],
    bash_mode: "full",
    write_mode: "workspace",
    tool_mode: "full",
    ...overrides
  };
}
```

Define these exact public failure fixtures:

```js
const failureCases = [
  {
    code: "WORKSPACE_NOT_FOUND",
    details: {
      source: "workspace_id",
      workspace_id: "ws_missing"
    },
    message: "The requested workspace is not open."
  },
  {
    code: "WORKSPACE_NOT_FOUND",
    details: {
      source: "default_workspace",
      workspace_id: null
    },
    message: "The requested workspace is not open."
  },
  {
    code: "SNAPSHOT_SUMMARY_FAILED",
    details: {},
    message: "The workspace summary could not be collected."
  },
  {
    code: "AI_CONTEXT_FAILED",
    details: {},
    message: "The AI handoff context could not be collected."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The workspace snapshot failed because of an internal error."
  }
];
```

Add pure schema tests with these exact assertions:

1. The module exists and all four exports are functions/objects.
2. Success has exactly top-level keys:
   `codexpro_title`, `codexpro_tool`, `data`, `error`, `meta`, `ok`.
3. Success data has exactly:
   `agents_loaded`, `agents_path`, `ai_context_files`, `bash_mode`, `git_status`, `root`, `skill_counts`, `skill_inventory`, `skills`, `tool_mode`, `tree`, `workspace_id`, `write_mode`.
4. `codexpro_tool === "workspace_snapshot"`.
5. `codexpro_title === "Workspace Snapshot"`.
6. `meta === { schemaVersion: 1, durationMs: 7, warnings: [] }` for duration 7.
7. Every approved failure has exact code, message, `retryable: false`, details, and duration.
8. Reject:
   - a flat top-level `workspace_id`;
   - any additional top-level field;
   - wrong tool identity or title;
   - success with `data: null` or a non-null error;
   - failure with non-null data or null error;
   - additional data, Skill, count, error-detail, or meta fields;
   - empty workspace ID, root, tree, Git status, Skill name, or AI file path;
   - `agents_path: undefined`;
   - `tree: null` or `tree: undefined`;
   - missing `ai_context_files`;
   - a negative count;
   - an invalid mode;
   - a failure detail object containing private diagnostics.

Add the complete in-memory helper set, following the existing workspace contract style:

```js
function createTestConfig(root = process.cwd(), overrides = {}) {
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
    bashMode: "safe",
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
  const server = createCodexProServer(config, dependencies ?? {});
  const client = new Client({
    name: "workspace-snapshot-contract-test",
    version: "0.0.0"
  });
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

async function withTempWorkspace(callback) {
  const created = await fs.mkdtemp(
    path.join(os.tmpdir(), "codexpro-workspace-snapshot-contract-")
  );
  const root = await fs.realpath(created);
  try {
    await fs.writeFile(
      path.join(root, "AGENTS.md"),
      "# Test instructions\n",
      "utf8"
    );
    return await callback(root, created);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }
}

function resultText(result) {
  return (result.content ?? [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function parseSnapshotResult(result) {
  return workspaceSnapshotOutputSchema.parse(result.structuredContent);
}
```

After the schema exists, add `assertSnapshotFailure` using the same exact envelope checks as the open-workspace contract.

Define summary fixtures that preserve provider camelCase:

```js
function emptySummary(context, overrides = {}) {
  return {
    text: [
      "# Workspace",
      "",
      "## Git status",
      "",
      "## main",
      "",
      "## Recent commits",
      "",
      "abc123 test commit"
    ].join("\n"),
    workspaceId: context.workspace.id,
    root: context.workspace.root,
    agentsLoaded: false,
    agentsPath: undefined,
    skills: [],
    skillInventory: [],
    skillCounts: {
      total: 0,
      workspace: 0,
      user: 0,
      plugin: 0,
      other: 0
    },
    tree: ".\n└── package.json",
    gitStatus: "## main",
    ...overrides
  };
}

function emptyAiContext(overrides = {}) {
  return {
    text: "No .ai-bridge handoff context exists yet.",
    files: [],
    ...overrides
  };
}
```

Add all behavior test names now so the test file is complete before implementation:

```text
workspace_snapshot schema module exists
workspace_snapshot success constructor produces the strict schema-v1 envelope
workspace_snapshot failure constructor produces every approved strict error
workspace_snapshot schema rejects malformed, flat, inconsistent, and additional fields
workspace_snapshot remains full-mode only and advertises an exact output schema
workspace_snapshot returns exact nested data with approved defaults
workspace_snapshot passes requested limits and skill options
workspace_snapshot normalizes allowed AI context files without creating context
workspace_snapshot keeps missing AI context and non-Git roots successful
workspace_snapshot returns a redacted WORKSPACE_NOT_FOUND failure
workspace_snapshot returns SNAPSHOT_SUMMARY_FAILED for summary provider exceptions
workspace_snapshot returns AI_CONTEXT_FAILED for AI provider exceptions
workspace_snapshot rejects malformed summary provider results
workspace_snapshot rejects global skills when global discovery is disabled
workspace_snapshot rejects malformed, duplicate, outside, and unapproved AI files
workspace_snapshot Tool Card consumes nested data and retains flat fallback
workspace_snapshot Tool Card lists AI filenames without file contents
codexpro workspace_snapshot action and snapshot alias preserve strict envelopes
Smoke compatibility migrates the protected snapshot tree consumer in memory
HTTP Smoke compatibility migrates the protected snapshot workspace-id consumer in memory
```

For the mode test, assert absence in minimal and standard, then exact descriptor presence in full:

```js
for (const toolMode of ["minimal", "standard"]) {
  await withConfigClient(createTestConfig(root, { toolMode }), {}, async (client) => {
    const listed = await client.listTools();
    assert.equal(
      listed.tools.some((tool) => tool.name === "workspace_snapshot"),
      false
    );
  });
}

await withConfigClient(createTestConfig(root, { toolMode: "full" }), {}, async (client) => {
  const listed = await client.listTools();
  const descriptor = listed.tools.find(
    (tool) => tool.name === "workspace_snapshot"
  );
  assert.ok(descriptor);
  assert.ok(descriptor.outputSchema);
  assert.equal(descriptor.outputSchema.type, "object");
  assert.deepEqual(
    new Set(descriptor.outputSchema.required),
    new Set([
      "codexpro_tool",
      "codexpro_title",
      "ok",
      "data",
      "error",
      "meta"
    ])
  );
});
```

- [ ] Run the focused test before creating the schema module.

```text
node --test test/workspace-snapshot-contract.test.mjs
```

**Expected RED result:** failure because `workspaceSnapshot.ts` does not exist and constructor/schema assertions cannot pass. Record the exact failing count; do not weaken the tests.

### Step 1.2 — Create the exact schema module

- [ ] Create `src/tools/schemas/workspaceSnapshot.ts` with this complete contract structure:

```ts
import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const WORKSPACE_SNAPSHOT_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not open.",
  SNAPSHOT_SUMMARY_FAILED: "The workspace summary could not be collected.",
  AI_CONTEXT_FAILED: "The AI handoff context could not be collected.",
  INTERNAL_ERROR: "The workspace snapshot failed because of an internal error."
} as const;

export const workspaceSnapshotSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1)
}).strict();

export const workspaceSnapshotSkillCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

export const workspaceSnapshotDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string().min(1),
  agents_loaded: z.boolean(),
  agents_path: z.string().min(1).nullable(),
  skills: z.array(z.string().min(1)),
  skill_inventory: z.array(workspaceSnapshotSkillSchema),
  skill_counts: workspaceSnapshotSkillCountsSchema,
  tree: z.string().min(1),
  git_status: z.string().min(1),
  ai_context_files: z.array(z.string().min(1)),
  bash_mode: z.enum(["off", "safe", "full"]),
  write_mode: z.enum(["off", "handoff", "workspace"]),
  tool_mode: z.enum(["minimal", "standard", "full"])
}).strict();

const workspaceNotFoundDetailsSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("workspace_id"),
    workspace_id: z.string().min(1)
  }).strict(),
  z.object({
    source: z.literal("default_workspace"),
    workspace_id: z.null()
  }).strict()
]);

const emptyDetailsSchema = z.object({}).strict();

const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(
    WORKSPACE_SNAPSHOT_ERROR_MESSAGES.WORKSPACE_NOT_FOUND
  ),
  retryable: z.literal(false),
  details: workspaceNotFoundDetailsSchema
}).strict();

const snapshotSummaryFailedErrorSchema = z.object({
  code: z.literal("SNAPSHOT_SUMMARY_FAILED"),
  message: z.literal(
    WORKSPACE_SNAPSHOT_ERROR_MESSAGES.SNAPSHOT_SUMMARY_FAILED
  ),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const aiContextFailedErrorSchema = z.object({
  code: z.literal("AI_CONTEXT_FAILED"),
  message: z.literal(
    WORKSPACE_SNAPSHOT_ERROR_MESSAGES.AI_CONTEXT_FAILED
  ),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(WORKSPACE_SNAPSHOT_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const workspaceSnapshotErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  snapshotSummaryFailedErrorSchema,
  aiContextFailedErrorSchema,
  internalErrorSchema
]);

export const workspaceSnapshotOutputShape = {
  codexpro_tool: z.literal("workspace_snapshot"),
  codexpro_title: z.literal("Workspace Snapshot"),
  ok: z.boolean(),
  data: workspaceSnapshotDataSchema.nullable(),
  error: workspaceSnapshotErrorSchema.nullable(),
  meta: toolMetaSchema
};

const workspaceSnapshotOutputBaseSchema = z.object(
  workspaceSnapshotOutputShape
).strict();

export const workspaceSnapshotOutputSchema =
  workspaceSnapshotOutputBaseSchema.superRefine((value, context) => {
    if (value.ok) {
      if (value.data === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data"],
          message: "Successful workspace_snapshot results require data."
        });
      }
      if (value.error !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "Successful workspace_snapshot results require error to be null."
        });
      }
      return;
    }

    if (value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Failed workspace_snapshot results require data to be null."
      });
    }
    if (value.error === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed workspace_snapshot results require an error object."
      });
    }
  });

export type WorkspaceSnapshotData = z.infer<
  typeof workspaceSnapshotDataSchema
>;
export type WorkspaceSnapshotStructuredResult = z.infer<
  typeof workspaceSnapshotOutputBaseSchema
>;

export type WorkspaceSnapshotFailureInput =
  | {
      code: "WORKSPACE_NOT_FOUND";
      details: {
        source: "workspace_id" | "default_workspace";
        workspace_id: string | null;
      };
    }
  | { code: "SNAPSHOT_SUMMARY_FAILED"; details: Record<string, never> }
  | { code: "AI_CONTEXT_FAILED"; details: Record<string, never> }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };

export function createWorkspaceSnapshotSuccess(
  data: WorkspaceSnapshotData,
  durationMs = 0
): WorkspaceSnapshotStructuredResult {
  return workspaceSnapshotOutputSchema.parse({
    codexpro_tool: "workspace_snapshot",
    codexpro_title: "Workspace Snapshot",
    ok: true,
    data: workspaceSnapshotDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createWorkspaceSnapshotFailure(
  failure: WorkspaceSnapshotFailureInput,
  durationMs = 0
): WorkspaceSnapshotStructuredResult {
  return workspaceSnapshotOutputSchema.parse({
    codexpro_tool: "workspace_snapshot",
    codexpro_title: "Workspace Snapshot",
    ok: false,
    data: null,
    error: {
      code: failure.code,
      message: WORKSPACE_SNAPSHOT_ERROR_MESSAGES[failure.code],
      retryable: false,
      details: failure.details
    },
    meta: createToolMeta(durationMs)
  });
}
```

- [ ] Run the focused contract again.

```text
node --test test/workspace-snapshot-contract.test.mjs
```

**Expected intermediate result:** pure constructor/schema tests pass; descriptor and handler tests remain RED because direct `workspace_snapshot` still advertises no exact schema and returns flat output.

### Step 1.3 — Record Task 1

- [ ] Append a STEP entry to `docs/memory/archive/phase-1-part-3.md` with:
  - status;
  - files changed;
  - RED command and failure reason;
  - schema implementation command and new result;
  - exact contract decisions;
  - risks, rollback, and next task.
- [ ] Update `Memory.md` concisely: four errors, thirteen data fields, tree non-null, AI filenames approved-only, Task 1 status, and Task 2 next.
- [ ] Check `Memory.md` remains within hard limits.
- [ ] Run `show_changes` and confirm only Task 1 files plus records changed.
- [ ] Stop before staging or commit unless explicitly authorized.

**Proposed commit after approval:**

```text
test(schema): define workspace_snapshot result contract
```

---

## Task 2: Add providers, validation, stable failures, and the exact handler

**Files:**

- Modify: `src/server.ts`
- Modify: `test/workspace-snapshot-contract.test.mjs`
- Modify: `Memory.md`
- Append: `docs/memory/archive/phase-1-part-3.md`

### Step 2.1 — Import the schema and define snapshot provider types

- [ ] Add this import adjacent to the existing workspace schema imports:

```ts
import {
  WORKSPACE_SNAPSHOT_ERROR_MESSAGES,
  createWorkspaceSnapshotFailure,
  createWorkspaceSnapshotSuccess,
  workspaceSnapshotDataSchema,
  workspaceSnapshotOutputShape,
  type WorkspaceSnapshotFailureInput
} from "./tools/schemas/workspaceSnapshot.js";
```

- [ ] Add these exact internal types near the open-workspace provider types:

```ts
type WorkspaceSnapshotSummaryOptions = {
  includeTree: true;
  maxDepth: number;
  maxEntries: number;
  includeSkills: boolean;
  includeGlobalSkills: boolean;
};

const workspaceSnapshotProviderSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1)
}).strict();

const workspaceSnapshotProviderCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

const workspaceSnapshotSummaryProviderResultSchema = z.object({
  text: z.string().min(1),
  workspaceId: z.string().min(1),
  root: z.string().min(1),
  agentsLoaded: z.boolean(),
  agentsPath: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)),
  skillInventory: z.array(workspaceSnapshotProviderSkillSchema),
  skillCounts: workspaceSnapshotProviderCountsSchema,
  tree: z.string().min(1),
  gitStatus: z.string().min(1)
}).strict();

const workspaceSnapshotAiProviderResultSchema = z.object({
  text: z.string(),
  files: z.array(z.string().min(1))
}).strict();

type WorkspaceSnapshotSummaryProviderResult = z.infer<
  typeof workspaceSnapshotSummaryProviderResultSchema
>;

type WorkspaceSnapshotAiProviderResult = z.infer<
  typeof workspaceSnapshotAiProviderResultSchema
>;
```

- [ ] Export provider contexts beside the existing open-workspace contexts:

```ts
export interface WorkspaceSnapshotSummaryProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: WorkspaceSnapshotSummaryOptions;
}

export interface WorkspaceSnapshotAiContextProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
}
```

- [ ] Extend `CodexProServerDependencies` exactly:

```ts
workspaceSnapshotSummaryProvider?: (
  context: WorkspaceSnapshotSummaryProviderContext
) => WorkspaceSummary | Promise<WorkspaceSummary>;
workspaceSnapshotAiContextProvider?: (
  context: WorkspaceSnapshotAiContextProviderContext
) => { text: string; files: string[] } | Promise<{ text: string; files: string[] }>;
```

### Step 2.2 — Add strict summary validation

- [ ] Add a tool-specific expected-count helper; do not refactor the existing open-tool helpers in this slice:

```ts
function expectedWorkspaceSnapshotSkillCounts(
  inventory: WorkspaceSnapshotSummaryProviderResult["skillInventory"]
): WorkspaceSnapshotSummaryProviderResult["skillCounts"] {
  const counts = {
    total: inventory.length,
    workspace: 0,
    user: 0,
    plugin: 0,
    other: 0
  };
  for (const skill of inventory) counts[skill.source] += 1;
  return counts;
}
```

- [ ] Add `validateWorkspaceSnapshotSummary` with these exact invariants:

```ts
function validateWorkspaceSnapshotSummary(
  result: WorkspaceSnapshotSummaryProviderResult,
  workspace: Workspace,
  guard: PathGuard,
  options: WorkspaceSnapshotSummaryOptions
): Array<{
  name: string;
  description: string | null;
  source: "workspace" | "user" | "plugin" | "other";
  path: string;
}> {
  if (result.workspaceId !== workspace.id) {
    throw new CodexProError(
      "Workspace snapshot provider returned a mismatched workspace id."
    );
  }
  if (result.root !== workspace.root) {
    throw new CodexProError(
      "Workspace snapshot provider returned a mismatched root."
    );
  }
  if (result.agentsLoaded !== Boolean(result.agentsPath)) {
    throw new CodexProError(
      "Workspace snapshot provider returned inconsistent AGENTS state."
    );
  }
  if (result.agentsPath) {
    const resolvedAgents = guard.resolve(workspace, result.agentsPath);
    if (resolvedAgents.relPath !== result.agentsPath) {
      throw new CodexProError(
        "Workspace snapshot provider returned a non-normalized AGENTS path."
      );
    }
  }

  const expectedNames = result.skillInventory.map((skill) => skill.name);
  if (
    expectedNames.length !== result.skills.length ||
    expectedNames.some((name, index) => result.skills[index] !== name)
  ) {
    throw new CodexProError(
      "Workspace snapshot provider returned mismatched skill names."
    );
  }

  const expectedCounts = expectedWorkspaceSnapshotSkillCounts(
    result.skillInventory
  );
  for (const key of [
    "total",
    "workspace",
    "user",
    "plugin",
    "other"
  ] as const) {
    if (result.skillCounts[key] !== expectedCounts[key]) {
      throw new CodexProError(
        "Workspace snapshot provider returned mismatched skill counts."
      );
    }
  }

  if (
    !options.includeSkills &&
    (
      result.skills.length ||
      result.skillInventory.length ||
      result.skillCounts.total
    )
  ) {
    throw new CodexProError(
      "Workspace snapshot provider returned skills when discovery was disabled."
    );
  }

  if (
    options.includeSkills &&
    !options.includeGlobalSkills &&
    result.skillInventory.some((skill) => skill.source !== "workspace")
  ) {
    throw new CodexProError(
      "Workspace snapshot provider returned global skills when global discovery was disabled."
    );
  }

  return result.skillInventory.map((skill) => ({
    name: skill.name,
    description: skill.description ?? null,
    source: skill.source,
    path: skill.path
  }));
}
```

The strict provider schema already enforces non-empty tree and Git status. Do not add a nullable tree branch.

### Step 2.3 — Add approved AI-context path normalization

- [ ] Add the fixed basename list:

```ts
const WORKSPACE_SNAPSHOT_AI_CONTEXT_NAMES = [
  "current-plan.md",
  "agent-status.md",
  "implementation-diff.patch",
  "codex-status.md",
  "decisions.md",
  "open-questions.md",
  "execution-log.jsonl"
] as const;
```

- [ ] Add a validator that derives the approved normalized set from `config.contextDir` and `PathGuard`:

```ts
function validateWorkspaceSnapshotAiFiles(
  result: WorkspaceSnapshotAiProviderResult,
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace
): string[] {
  const approved = new Set(
    WORKSPACE_SNAPSHOT_AI_CONTEXT_NAMES.map((name) =>
      guard.resolve(workspace, `${config.contextDir}/${name}`).relPath
    )
  );
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const file of result.files) {
    const relPath = guard.resolve(workspace, file).relPath;
    if (!approved.has(relPath)) {
      throw new CodexProError(
        "Workspace snapshot AI provider returned an unapproved context file."
      );
    }
    if (seen.has(relPath)) {
      throw new CodexProError(
        "Workspace snapshot AI provider returned a duplicate context file."
      );
    }
    seen.add(relPath);
    normalized.push(relPath);
  }

  return normalized;
}
```

Do not include AI provider text in structured data.

### Step 2.4 — Add safe workspace-resolution details and failure rendering

- [ ] Add this classifier:

```ts
function classifyWorkspaceSnapshotWorkspaceFailure(
  args: Record<string, unknown>
): WorkspaceSnapshotFailureInput {
  return args.workspace_id
    ? {
        code: "WORKSPACE_NOT_FOUND",
        details: {
          source: "workspace_id",
          workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
        }
      }
    : {
        code: "WORKSPACE_NOT_FOUND",
        details: {
          source: "default_workspace",
          workspace_id: null
        }
      };
}
```

- [ ] Add one local helper inside the snapshot handler or a small nearby function to render fixed public text:

```ts
function workspaceSnapshotFailureText(
  failure: WorkspaceSnapshotFailureInput
): string {
  return [
    "# Workspace Snapshot Error",
    "",
    `Code: ${failure.code}`,
    WORKSPACE_SNAPSHOT_ERROR_MESSAGES[failure.code]
  ].join("\n");
}
```

No raw error argument may enter this text.

### Step 2.5 — Wire production defaults

- [ ] In `createCodexProServer`, add defaults after the open-workspace providers:

```ts
const workspaceSnapshotSummaryProvider =
  dependencies.workspaceSnapshotSummaryProvider ??
  ((context: WorkspaceSnapshotSummaryProviderContext) =>
    workspaceSummary(
      context.config,
      context.guard,
      context.workspace,
      context.options
    ));

const workspaceSnapshotAiContextProvider =
  dependencies.workspaceSnapshotAiContextProvider ??
  ((context: WorkspaceSnapshotAiContextProviderContext) =>
    readAiBridgeContext(
      context.config,
      context.guard,
      context.workspace
    ));
```

Do not pass `createIfMissing: true`.

### Step 2.6 — Replace only the direct `workspace_snapshot` handler

- [ ] Add `outputSchema: workspaceSnapshotOutputShape` to the descriptor.

- [ ] Replace the existing handler with separate resolution, invocation, validation, and construction stages:

```ts
async (args) => {
  const startedAt = Date.now();
  let workspace: Workspace;

  try {
    workspace = workspaces.getWorkspace(args.workspace_id);
  } catch {
    const failure = classifyWorkspaceSnapshotWorkspaceFailure(args);
    return {
      ...textResult(
        workspaceSnapshotFailureText(failure),
        createWorkspaceSnapshotFailure(
          failure,
          Date.now() - startedAt
        )
      ),
      isError: true
    };
  }

  const options: WorkspaceSnapshotSummaryOptions = {
    includeTree: true,
    maxDepth: limitInt(args.max_depth, 3, 1, 8),
    maxEntries: limitInt(args.max_files, 500, 1, 3000),
    includeSkills: parseBool(args.include_skills, false),
    includeGlobalSkills: parseBool(args.include_global_skills, false)
  };

  let rawSummary: unknown;
  try {
    rawSummary = await workspaceSnapshotSummaryProvider({
      config,
      guard,
      workspace,
      options
    });
  } catch {
    const failure: WorkspaceSnapshotFailureInput = {
      code: "SNAPSHOT_SUMMARY_FAILED",
      details: {}
    };
    return {
      ...textResult(
        workspaceSnapshotFailureText(failure),
        createWorkspaceSnapshotFailure(
          failure,
          Date.now() - startedAt
        )
      ),
      isError: true
    };
  }

  let summary: WorkspaceSnapshotSummaryProviderResult;
  let normalizedInventory: Array<{
    name: string;
    description: string | null;
    source: "workspace" | "user" | "plugin" | "other";
    path: string;
  }>;
  try {
    summary = workspaceSnapshotSummaryProviderResultSchema.parse(rawSummary);
    normalizedInventory = validateWorkspaceSnapshotSummary(
      summary,
      workspace,
      guard,
      options
    );
  } catch {
    const failure: WorkspaceSnapshotFailureInput = {
      code: "INTERNAL_ERROR",
      details: {}
    };
    return {
      ...textResult(
        workspaceSnapshotFailureText(failure),
        createWorkspaceSnapshotFailure(
          failure,
          Date.now() - startedAt
        )
      ),
      isError: true
    };
  }

  let rawAi: unknown;
  try {
    rawAi = await workspaceSnapshotAiContextProvider({
      config,
      guard,
      workspace
    });
  } catch {
    const failure: WorkspaceSnapshotFailureInput = {
      code: "AI_CONTEXT_FAILED",
      details: {}
    };
    return {
      ...textResult(
        workspaceSnapshotFailureText(failure),
        createWorkspaceSnapshotFailure(
          failure,
          Date.now() - startedAt
        )
      ),
      isError: true
    };
  }

  try {
    const ai = workspaceSnapshotAiProviderResultSchema.parse(rawAi);
    const aiContextFiles = validateWorkspaceSnapshotAiFiles(
      ai,
      config,
      guard,
      workspace
    );
    const data = workspaceSnapshotDataSchema.parse({
      workspace_id: workspace.id,
      root: workspace.root,
      agents_loaded: summary.agentsLoaded,
      agents_path: summary.agentsPath ?? null,
      skills: summary.skills,
      skill_inventory: normalizedInventory,
      skill_counts: summary.skillCounts,
      tree: summary.tree,
      git_status: summary.gitStatus,
      ai_context_files: aiContextFiles,
      bash_mode: config.bashMode,
      write_mode: config.writeMode,
      tool_mode: config.toolMode
    });
    const text = `${summary.text}\n\n## AI handoff context\n\n${ai.text}`;

    return textResult(
      text,
      createWorkspaceSnapshotSuccess(
        data,
        Date.now() - startedAt
      )
    );
  } catch {
    const failure: WorkspaceSnapshotFailureInput = {
      code: "INTERNAL_ERROR",
      details: {}
    };
    return {
      ...textResult(
        workspaceSnapshotFailureText(failure),
        createWorkspaceSnapshotFailure(
          failure,
          Date.now() - startedAt
        )
      ),
      isError: true
    };
  }
}
```

Do not add flat compatibility fields to the direct result.

### Step 2.7 — Complete and run the handler tests

- [ ] Implement every behavior test already named in Task 1.

Use injected providers to prove:

- default options exactly equal:

```js
{
  includeTree: true,
  maxDepth: 3,
  maxEntries: 500,
  includeSkills: false,
  includeGlobalSkills: false
}
```

- requested options exactly equal:

```js
{
  includeTree: true,
  maxDepth: 8,
  maxEntries: 3000,
  includeSkills: true,
  includeGlobalSkills: true
}
```

- explicit unknown ID does not leak a private diagnostic;
- summary provider throw does not leak its message;
- AI provider throw does not leak its message;
- malformed provider results produce `INTERNAL_ERROR`;
- AI allowed paths normalize `./.ai-bridge/...` to `.ai-bridge/...`;
- duplicate normalized paths fail;
- `../private.md`, absolute paths, and `.ai-bridge/unapproved.md` fail without appearing in output;
- `fs.stat(root/.ai-bridge)` still rejects with `ENOENT` after a production-provider snapshot on a workspace without the directory.

- [ ] Run the focused contract.

```text
node --test test/workspace-snapshot-contract.test.mjs
```

**Expected GREEN result:** all focused schema, descriptor, handler, failure, Tool Card source, supertool, and compatibility-source tests that do not yet require Task 3 consumer changes pass; Task 3-specific source assertions remain RED until the consumer migration is applied.

- [ ] Run the adjacent workspace contracts.

```text
node --test test/workspace-snapshot-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/tree-contract.test.mjs test/server-config-contract.test.mjs
```

**Expected result:** all pass. Any regression in the two open tools is a blocker; do not update their public contracts.

### Step 2.8 — Record Task 2

- [ ] Append the complete Task 2 STEP evidence to the active archive.
- [ ] Update `Memory.md` with provider boundaries, exact stage errors, focused and adjacent counts, limitations, rollback, and Task 3 next.
- [ ] Run `show_changes` and verify no unrelated source changed.
- [ ] Stop before staging or commit unless explicitly authorized.

**Proposed commit after approval:**

```text
feat(schema): add exact workspace_snapshot result contract
```

---

## Task 3: Migrate Tool Card, supertool assertions, and protected Smoke consumers

**Files:**

- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/smoke-platform-compat.mjs`
- Modify: `scripts/http-smoke-compat.mjs`
- Modify: `test/workspace-snapshot-contract.test.mjs`
- Must not modify: `scripts/smoke.mjs`
- Must not modify: `scripts/http-smoke.mjs`
- Modify: `Memory.md`
- Append: `docs/memory/archive/phase-1-part-3.md`

### Step 3.1 — Unwrap nested snapshot data with flat fallback

- [ ] Change `workspaceResultData` so the recognized nested workspace tools are exactly:

```js
function workspaceResultData(data) {
  const isWorkspaceResult =
    data?.codexpro_tool === "open_current_workspace" ||
    data?.codexpro_tool === "open_workspace" ||
    data?.codexpro_tool === "workspace_snapshot";
  return isWorkspaceResult && data?.data && typeof data.data === "object"
    ? data.data
    : (data ?? {});
}
```

This retains historical flat snapshot fallback when `data` is absent.

- [ ] Replace the snapshot subtitle branch with nested failure-aware logic:

```js
if (data?.codexpro_tool === "workspace_snapshot") {
  if (data?.ok === false) {
    return data?.error?.code || "Workspace snapshot unavailable";
  }
  const workspace = workspaceResultData(data);
  return workspace.root || "Workspace snapshot";
}
```

### Step 3.2 — Render approved AI filenames without contents

- [ ] In `renderWorkspace`, add:

```js
const aiContextFiles = Array.isArray(workspace.ai_context_files)
  ? workspace.ai_context_files
  : [];
const aiContextRows = aiContextFiles.slice(0, 12).map((file) =>
  '<div class="file-row"><span class="file-code">ctx</span><span class="file-name">' +
  esc(file) +
  '</span></div>'
).join("");
const aiContextText = aiContextFiles.length
  ? '<div class="file-list">' + aiContextRows + '</div>' +
    (aiContextFiles.length > 12
      ? '<div class="empty">+' + esc(aiContextFiles.length - 12) + ' more context files</div>'
      : "")
  : '<div class="empty">No readable AI handoff files.</div>';
```

- [ ] Add this fold after Git and before Skills:

```js
fold(
  "AI handoff",
  aiContextFiles.length + " files",
  aiContextText,
  false
)
```

Open tools will show an empty AI handoff fold only if this is inserted unconditionally. Avoid that behavior change: include the fold only when `data.codexpro_tool === "workspace_snapshot"`.

Use:

```js
const aiContextSection = data?.codexpro_tool === "workspace_snapshot"
  ? fold(
      "AI handoff",
      aiContextFiles.length + " files",
      aiContextText,
      false
    )
  : "";
```

Then concatenate `aiContextSection` after the Git fold.

### Step 3.3 — Add exact protected-consumer substitutions

- [ ] In `scripts/smoke-platform-compat.mjs`, add this replacement before appending the source label:

```js
source = replaceExactCount(
  source,
  'snapshotAlias.structuredContent.tree',
  'snapshotAlias.structuredContent.data?.tree',
  1
);
```

- [ ] In `scripts/http-smoke-compat.mjs`, add this exact tuple to `replacements`:

```js
[
  "snapshot.structuredContent.workspace_id",
  "snapshot.structuredContent.data?.workspace_id"
]
```

Do not loosen the exact-once guard.

### Step 3.4 — Complete Tool Card, supertool, and compatibility tests

- [ ] Make the Tool Card test assert all of the following source evidence:

```js
assert.match(toolCardWidgetHtml, /workspace_snapshot/);
assert.match(toolCardWidgetHtml, /function workspaceResultData\(data\)/);
assert.match(toolCardWidgetHtml, /data\?\.data/);
assert.match(toolCardWidgetHtml, /workspace\.ai_context_files/);
assert.match(toolCardWidgetHtml, /AI handoff/);
assert.match(toolCardWidgetHtml, /No readable AI handoff files/);
```

- [ ] Add a rendered nested failure source assertion that fixed `error.code` is used and no raw provider exception branch exists.

- [ ] In full mode, call both:

```js
{ action: "workspace_snapshot", args: {} }
{ action: "snapshot", args: {} }
```

Assert for each:

```js
structured.codexpro_tool === "workspace_snapshot"
structured.codexpro_title === "Workspace Snapshot"
structured.codexpro_super_action === "workspace_snapshot"
structured.wrapped_tool === "workspace_snapshot"
structured.ok === true
structured.data.root === root
!("root" in structured)
!("workspace_id" in structured)
```

Inject a summary-provider failure and assert the wrapped failure keeps `SNAPSHOT_SUMMARY_FAILED` and the same strict wrapper tags.

- [ ] Assert compatibility-loader source contains:

```text
snapshotAlias.structuredContent.data?.tree
snapshot.structuredContent.data?.workspace_id
expectedCount
sourceURL=codexpro-smoke-compat.mjs
sourceURL=codexpro-http-smoke-compat.mjs
data:text/javascript;base64
```

- [ ] Assert both protected sources remain unchanged by checking `show_changes` does not list them.

### Step 3.5 — Run focused and actual consumer verification

- [ ] Run the focused contract:

```text
node --test test/workspace-snapshot-contract.test.mjs
```

**Expected:** all focused tests pass.

- [ ] Run protected main Smoke through its compatibility loader:

```text
node scripts/smoke-platform-compat.mjs
```

**Expected:** pass; the source drift guards find exactly the approved occurrences.

- [ ] Run protected HTTP Smoke through its compatibility loader:

```text
node scripts/http-smoke-compat.mjs
```

**Expected:** pass; the snapshot ID consumer reads `structuredContent.data.workspace_id` in memory.

- [ ] Re-run adjacent workspace contracts:

```text
node --test test/workspace-snapshot-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/tree-contract.test.mjs test/server-config-contract.test.mjs
```

**Expected:** all pass.

### Step 3.6 — Record Task 3

- [ ] Append exact consumer and adjacent results to the active archive.
- [ ] Update `Memory.md` with nested Tool Card behavior, flat fallback, protected-source status, exact replacements, risks, and Task 4 next.
- [ ] Use `show_changes` to confirm both protected source files remain unchanged.
- [ ] Stop before staging or commit unless explicitly authorized.

**Proposed commit after approval:**

```text
fix(compat): migrate workspace_snapshot consumers
```

---

## Task 4: Complete regression, documentation, memory, and implementation review

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Append: `docs/memory/archive/phase-1-part-3.md`
- Review: all Task 1–3 files

### Step 4.1 — Run complete local verification

- [ ] Focused contract:

```text
node --test test/workspace-snapshot-contract.test.mjs
```

- [ ] Adjacent contracts:

```text
node --test test/workspace-snapshot-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/tree-contract.test.mjs test/server-config-contract.test.mjs
```

- [ ] Complete regression:

```text
node --test test/*.test.mjs
```

- [ ] Build:

```text
npm run build
```

- [ ] Full Smoke:

```text
npm run smoke
```

- [ ] Native-Windows Stress:

```text
npm run stress
```

- [ ] Package dry-run:

```text
npm pack --dry-run
```

- [ ] Diff check:

```text
git diff --check
```

Record exact counts, package file count, compressed/unpacked sizes, warnings, and any platform skips. Do not summarize a blocked or skipped gate as passed.

### Step 4.2 — Update durable documentation

- [ ] Add one concise unreleased CHANGELOG entry stating:

```text
- Added an exact schema-v1 `workspace_snapshot` result contract with validated workspace and AI-context providers, stable redacted failures, nested Tool Card/supertool support, and fail-closed protected Smoke compatibility.
```

- [ ] Update `AGENTS.md` documentation map with the new design and plan paths.

- [ ] Update the current stopping point to say:

```text
The first fourteen Phase 1 vertical slices are implemented and locally verified. Direct `workspace_snapshot` is awaiting publication review and explicit staging/commit/push approval. Phase 2 remains closed.
```

Do not claim publication or CI before a commit has been pushed and exact-head CI has passed.

- [ ] Update `Memory.md` with:
  - Slice 14 tool name and status;
  - exact thirteen-field success data;
  - four failure codes;
  - two provider boundaries;
  - full-mode-only decision;
  - Tool Card and protected Smoke compatibility;
  - exact verification evidence;
  - remaining risks;
  - rollback;
  - next action: `neat-freak` and publication review, not Phase 2.

- [ ] Append the complete Task 4 STEP record to `docs/memory/archive/phase-1-part-3.md`.

### Step 4.3 — Run `neat-freak` and reconcile

- [ ] Load and run the `neat-freak` skill against only the current slice.
- [ ] Accept only behavior-preserving cleanup within the approved file set.
- [ ] Reject broad formatting, schema extraction, shared workspace refactors, or unrelated documentation edits.
- [ ] Re-run every gate affected by cleanup.
- [ ] Reconcile CHANGELOG, AGENTS, Memory, and archive evidence with the final diff.

### Step 4.4 — Perform final review

- [ ] Use CodexPro `show_changes` with the unified diff.
- [ ] Verify the changed-file set is limited to:

```text
src/tools/schemas/workspaceSnapshot.ts
test/workspace-snapshot-contract.test.mjs
src/server.ts
src/toolCardWidget.ts
scripts/smoke-platform-compat.mjs
scripts/http-smoke-compat.mjs
CHANGELOG.md
AGENTS.md
Memory.md
docs/memory/archive/phase-1-part-3.md
docs/superpowers/specs/2026-07-13-workspace-snapshot-output-schema-design.md
docs/superpowers/plans/2026-07-13-workspace-snapshot-output-schema.md
```

- [ ] Confirm explicitly that these files are unchanged:

```text
scripts/smoke.mjs
scripts/http-smoke.mjs
package.json
package-lock.json
```

- [ ] Search the diff for secret-looking values and raw private diagnostics.
- [ ] Confirm no new environment variables, authentication behavior, dependencies, or public tool membership changes exist.
- [ ] Confirm `workspace_snapshot` still performs no writes.
- [ ] Confirm direct and supertool success/failure both parse through the exact schema.
- [ ] Confirm the implementation can be reverted independently.

### Step 4.5 — Stop at the publication gate

- [ ] Do not stage, commit, push, or check exact-head CI yet.
- [ ] Report:
  - design and plan paths;
  - changed files;
  - focused, adjacent, complete, Build, Smoke, Stress, package, and diff results;
  - review findings and fixes;
  - remaining limitations;
  - proposed publication commit message.

**Proposed implementation commit after explicit approval:**

```text
feat(schema): add exact workspace_snapshot result contract
```

**Proposed publication flow after explicit approval:**

```text
precisely stage only reviewed files
git diff --cached --check
git commit -m "feat(schema): add exact workspace_snapshot result contract"
git push origin main
query the public GitHub Actions API for the exact head
verify Ubuntu and Windows on Node 20 and 24
append the publication record
commit and push the publication record separately
verify the documentation-record exact head
```

---

## Task 5: Publication review and exact-head CI — only after separate approval

**Files:**

- No source changes unless publication review finds a real defect.
- Modify records only after evidence exists.

### Step 5.1 — Stage precisely

- [ ] Stage only the reviewed Slice 14 files. Do not use `git add .`.
- [ ] Inspect staged status and diff.
- [ ] Run:

```text
git diff --cached --check
```

**Expected:** pass with no unintended files.

### Step 5.2 — Commit and push

- [ ] Commit:

```text
git commit -m "feat(schema): add exact workspace_snapshot result contract"
```

- [ ] Push directly to `origin/main` only if that remains the explicitly approved publication route:

```text
git push origin main
```

Do not force push or rewrite history.

### Step 5.3 — Verify exact-head CI

- [ ] Resolve the full pushed head SHA.
- [ ] Query the public GitHub Actions API for the run whose `head_sha` equals that exact SHA.
- [ ] Verify all four matrix jobs:
  - Ubuntu / Node 20;
  - Ubuntu / Node 24;
  - Windows / Node 20;
  - Windows / Node 24.
- [ ] If any job fails, read the failed job log, fix only the demonstrated defect, repeat local affected gates, and publish a normal follow-up commit.

### Step 5.4 — Record publication separately

- [ ] Append the implementation commit SHA, push range, workflow run ID, full head SHA, four job results, risks, rollback, and next action to the active archive.
- [ ] Update `Memory.md` and `AGENTS.md` to say Slice 14 is published only after all exact-head jobs succeed.
- [ ] Commit the publication record separately.
- [ ] Push and verify the publication-record exact head.

### Step 5.5 — Stop before the next slice

- [ ] Return to design review of the next remaining Phase 1 direct tool.
- [ ] Do not assume Phase 1 is complete and do not begin Phase 2 without an explicit remaining-scope review.

---

## Final acceptance checklist

```text
[ ] Direct workspace_snapshot remains full-mode only
[ ] Exact outputSchema is advertised in full mode
[ ] Success envelope has exactly six top-level fields
[ ] Success data has exactly thirteen fields
[ ] tree is required and non-null
[ ] agents_path is normalized to string or null
[ ] Skill names, inventory, counts, and inclusion flags agree
[ ] AI context files are normalized, unique, ordered, and approved-only
[ ] No AI context content enters structured data
[ ] Missing .ai-bridge remains successful and creates nothing
[ ] Non-Git workspace remains successful
[ ] WORKSPACE_NOT_FOUND is stable and redacted
[ ] SNAPSHOT_SUMMARY_FAILED is stable and redacted
[ ] AI_CONTEXT_FAILED is stable and redacted
[ ] INTERNAL_ERROR covers invariant violations without diagnostics
[ ] Provider invocation and validation stages are distinguished
[ ] Tool Card handles nested success/failure and flat fallback
[ ] Tool Card shows AI filenames but not contents
[ ] codexpro direct action and snapshot alias preserve the envelope
[ ] Protected Smoke sources are unchanged
[ ] Compatibility loaders fail closed on source drift
[ ] Focused contract passes
[ ] Adjacent workspace contracts pass
[ ] Complete regression passes
[ ] Build passes
[ ] Full Smoke passes
[ ] Native-Windows Stress passes
[ ] npm pack --dry-run passes
[ ] git diff --check passes
[ ] No dependency or lockfile change
[ ] No authentication, profile, credential, Cloudflare, or Phase 2 change
[ ] Memory.md is within limits and current
[ ] Active Phase 1 archive contains exact evidence
[ ] Final diff contains only approved files
[ ] Publication remains a separate explicit approval gate
```
