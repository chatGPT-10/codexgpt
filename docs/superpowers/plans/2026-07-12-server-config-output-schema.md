# Exact `server_config` Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Executed through Task 4, published, and cross-platform CI-validated through STEP-089.

**Goal:** Migrate only `server_config` to an exact advertised output schema with strict success/failure envelopes, stable `INTERNAL_ERROR` failures, preserved text output, and contract tests.

**Architecture:** Add shared Phase 1 Zod contracts in `src/tools/schemas/common.ts` and the exact tool-specific schema in `src/tools/schemas/serverConfig.ts`. Keep the existing `src/server.ts` registration architecture, but inject a narrow `serverConfigDataProvider` for tests, attach measured duration at the common wrapper boundary, and update only the `server_config` tool card to read from `structuredContent.data`.

**Tech Stack:** TypeScript 5.8, Zod 3.25, MCP TypeScript SDK 1.17, Node.js 20+, `node:test`, `tsx` loader, existing CodexPro redaction helpers.

## Global Constraints

- Native Windows remains the primary platform; WSL must not become mandatory.
- Migrate only `server_config`; no second MCP tool may change structured output in this slice.
- Preserve the existing human-readable MCP `content` output.
- Preserve MCP `isError: true` on failures.
- Do not add dependencies; Zod, MCP SDK, TypeScript, and `tsx` are already available.
- Do not add an environment variable, CLI flag, hidden MCP argument, HTTP route, or production test mode for forced failures.
- Do not add `requestId`; initial metadata is exactly `schemaVersion`, `durationMs`, and `warnings`.
- The initial stable error object is exactly `code`, `message`, `retryable`, and `details`.
- The first slice introduces only `INTERNAL_ERROR`.
- Do not expose stack traces, tokens, secrets, authorization material, or sensitive paths.
- Do not modify authentication, Cloudflare, workspace, shell, process, Git, or profile behavior.
- Do not stage, commit, or push without separate explicit user approval.
- Before source execution begins, the approved planning documents must be preserved and the implementation must start from a reviewed Git state.

---

## File map

### Create

- `src/tools/schemas/common.ts` — shared schema version, metadata, stable error schema, and reusable inferred types.
- `src/tools/schemas/serverConfig.ts` — exact `server_config` data/output schemas and success/failure constructors.
- `test/server-config-contract.test.mjs` — schema, MCP registration, success, failure, redaction, duration, and tool-card compatibility tests.

### Modify

- `src/server.ts` — import schemas, add the narrow dependency seam, advertise `outputSchema`, construct strict results, and attach duration.
- `src/toolCardWidget.ts` — read `server_config` fields only from `data` while retaining top-level tool identity.
- `Memory.md` — record implementation status and next action.
- `docs/memory/archive/phase-1.md` — append implementation evidence, verification, risks, and rollback.

### Must not change

- Other MCP tool handlers or output shapes.
- `src/http.ts`, `src/stdio.ts`, authentication modules, Cloudflare scripts, package dependencies, or public configuration.

---

### Task 1: Add the exact shared and `server_config` Zod contracts

**Files:**
- Create: `src/tools/schemas/common.ts`
- Create: `src/tools/schemas/serverConfig.ts`
- Create: `test/server-config-contract.test.mjs`

**Interfaces:**
- Produces: `TOOL_SCHEMA_VERSION`, `toolMetaSchema`, `toolErrorSchema`, `ToolMeta`, and `ToolError`.
- Produces: `serverConfigDataSchema`, `serverConfigOutputShape`, `serverConfigOutputSchema`, `ServerConfigData`, `ServerConfigStructuredResult`, `createServerConfigSuccess`, and `createServerConfigFailure`.
- Consumes: Zod only. This task does not import `src/server.ts` yet.

- [ ] **Step 1: Create the failing schema contract test**

Create `test/server-config-contract.test.mjs` with this initial content:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  createServerConfigFailure,
  createServerConfigSuccess,
  serverConfigOutputSchema
} from "../src/tools/schemas/serverConfig.ts";

function sampleServerConfigData() {
  return {
    defaultRoot: "D:\\Dev\\codexpro",
    allowedRoots: ["D:\\Dev"],
    host: "127.0.0.1",
    port: 8787,
    widgetDomain: "https://example.invalid",
    authEnabled: true,
    allowedHosts: ["codexpro.example.invalid"],
    allowedOrigins: ["https://chatgpt.com"],
    allowQueryToken: true,
    bashMode: "off",
    bashAvailability: null,
    bashTranscript: "compact",
    bashSessionId: null,
    requireBashSession: false,
    codexSessions: "off",
    codexDir: "D:\\Dev\\codexpro\\.codex-test",
    writeMode: "workspace",
    toolMode: "minimal",
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
    inheritEnv: false,
    contextDir: ".ai-bridge",
    maxReadBytes: 1_000_000,
    maxWriteBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    maxSearchResults: 200,
    blockedGlobs: [".git/**"],
    registeredTools: ["server_config"],
    registeredToolCount: 1
  };
}

test("server_config success constructor produces the strict schema-v1 envelope", () => {
  const result = createServerConfigSuccess(sampleServerConfigData(), 7);
  const parsed = serverConfigOutputSchema.parse(result);

  assert.deepEqual(Object.keys(parsed).sort(), [
    "codexpro_title",
    "codexpro_tool",
    "data",
    "error",
    "meta",
    "ok"
  ]);
  assert.equal(parsed.codexpro_tool, "server_config");
  assert.equal(parsed.codexpro_title, "Server Config");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.equal(parsed.data.host, "127.0.0.1");
  assert.equal("host" in parsed, false);
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 7,
    warnings: []
  });
});

test("server_config failure constructor produces only INTERNAL_ERROR", () => {
  const result = createServerConfigFailure("redacted failure", 3);
  const parsed = serverConfigOutputSchema.parse(result);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.deepEqual(parsed.error, {
    code: "INTERNAL_ERROR",
    message: "redacted failure",
    retryable: false,
    details: {}
  });
  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 3,
    warnings: []
  });
});

test("server_config schema rejects inconsistent success and failure states", () => {
  assert.throws(() =>
    serverConfigOutputSchema.parse({
      ...createServerConfigSuccess(sampleServerConfigData(), 0),
      data: null
    })
  );
  assert.throws(() =>
    serverConfigOutputSchema.parse({
      ...createServerConfigFailure("failure", 0),
      error: null
    })
  );
});
```

- [ ] **Step 2: Run the new test and verify the expected failure**

Run:

```bash
node --import tsx --test test/server-config-contract.test.mjs
```

Expected result: FAIL with `ERR_MODULE_NOT_FOUND` for `src/tools/schemas/serverConfig.ts`.

- [ ] **Step 3: Implement the shared contracts**

Create `src/tools/schemas/common.ts`:

```ts
import { z } from "zod";

export const TOOL_SCHEMA_VERSION = 1 as const;

export const toolMetaSchema = z.object({
  schemaVersion: z.literal(TOOL_SCHEMA_VERSION),
  durationMs: z.number().nonnegative(),
  warnings: z.array(z.string())
}).strict();

export const toolErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.unknown())
}).strict();

export type ToolMeta = z.infer<typeof toolMetaSchema>;
export type ToolError = z.infer<typeof toolErrorSchema>;

export function createToolMeta(durationMs = 0, warnings: string[] = []): ToolMeta {
  return toolMetaSchema.parse({
    schemaVersion: TOOL_SCHEMA_VERSION,
    durationMs: Math.max(0, durationMs),
    warnings
  });
}
```

- [ ] **Step 4: Implement the exact `server_config` schema**

Create `src/tools/schemas/serverConfig.ts`:

```ts
import { z } from "zod";
import { createToolMeta, toolErrorSchema, toolMetaSchema } from "./common.js";

const bashAvailabilitySchema = z.object({
  available: z.boolean(),
  executable: z.string(),
  detail: z.string()
}).strict();

const analysisLimitsSchema = z.object({
  maxInventoryFiles: z.number().int().nonnegative(),
  maxAnalyzedFiles: z.number().int().nonnegative(),
  maxScannedBytes: z.number().int().nonnegative(),
  maxSymbols: z.number().int().nonnegative(),
  maxRelationships: z.number().int().nonnegative()
}).strict();

export const serverConfigDataSchema = z.object({
  defaultRoot: z.string(),
  allowedRoots: z.array(z.string()),
  host: z.string(),
  port: z.number().int().min(1).max(65_535),
  widgetDomain: z.string(),
  authEnabled: z.boolean(),
  allowedHosts: z.array(z.string()),
  allowedOrigins: z.array(z.string()),
  allowQueryToken: z.boolean(),
  bashMode: z.enum(["off", "safe", "full"]),
  bashAvailability: bashAvailabilitySchema.nullable(),
  bashTranscript: z.enum(["compact", "full"]),
  bashSessionId: z.string().nullable(),
  requireBashSession: z.boolean(),
  codexSessions: z.enum(["off", "metadata", "read"]),
  codexDir: z.string(),
  writeMode: z.enum(["off", "handoff", "workspace"]),
  toolMode: z.enum(["minimal", "standard", "full"]),
  toolCards: z.boolean(),
  connectionTest: z.boolean(),
  analysisEnabled: z.boolean(),
  analysisLimits: analysisLimitsSchema,
  inheritEnv: z.boolean(),
  contextDir: z.string(),
  maxReadBytes: z.number().int().nonnegative(),
  maxWriteBytes: z.number().int().nonnegative(),
  maxOutputBytes: z.number().int().nonnegative(),
  maxSearchResults: z.number().int().nonnegative(),
  blockedGlobs: z.array(z.string()),
  registeredTools: z.array(z.string()),
  registeredToolCount: z.number().int().nonnegative()
}).strict();

const internalErrorSchema = toolErrorSchema.extend({
  code: z.literal("INTERNAL_ERROR")
}).strict();

export const serverConfigOutputShape = {
  codexpro_tool: z.literal("server_config"),
  codexpro_title: z.literal("Server Config"),
  ok: z.boolean(),
  data: serverConfigDataSchema.nullable(),
  error: internalErrorSchema.nullable(),
  meta: toolMetaSchema
};

const serverConfigOutputBaseSchema = z.object(serverConfigOutputShape).strict();

export const serverConfigOutputSchema = serverConfigOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Successful server_config results require data."
      });
    }
    if (value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Successful server_config results require error to be null."
      });
    }
    return;
  }

  if (value.data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "Failed server_config results require data to be null."
    });
  }
  if (value.error === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["error"],
      message: "Failed server_config results require an error object."
    });
  }
});

export type ServerConfigData = z.infer<typeof serverConfigDataSchema>;
export type ServerConfigStructuredResult = z.infer<typeof serverConfigOutputBaseSchema>;

export function createServerConfigSuccess(
  data: ServerConfigData,
  durationMs = 0
): ServerConfigStructuredResult {
  return serverConfigOutputSchema.parse({
    codexpro_tool: "server_config",
    codexpro_title: "Server Config",
    ok: true,
    data: serverConfigDataSchema.parse(data),
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createServerConfigFailure(
  message: string,
  durationMs = 0
): ServerConfigStructuredResult {
  return serverConfigOutputSchema.parse({
    codexpro_tool: "server_config",
    codexpro_title: "Server Config",
    ok: false,
    data: null,
    error: {
      code: "INTERNAL_ERROR",
      message,
      retryable: false,
      details: {}
    },
    meta: createToolMeta(durationMs)
  });
}
```

- [ ] **Step 5: Run the schema contract tests**

Run:

```bash
node --import tsx --test test/server-config-contract.test.mjs
```

Expected result: 3 tests PASS.

- [ ] **Step 6: Run TypeScript build**

Run:

```bash
npm run build
```

Expected result: exit code 0 and no TypeScript errors.

- [ ] **Step 7: Review Task 1 before any Git operation**

Confirm only these paths were added:

```text
src/tools/schemas/common.ts
src/tools/schemas/serverConfig.ts
test/server-config-contract.test.mjs
```

Do not stage or commit until the user explicitly approves the Task 1 diff.

---

### Task 2: Integrate the strict contract into the actual MCP registration and handler path

**Files:**
- Modify: `src/server.ts:21-119`
- Modify: `src/server.ts:257-298`
- Modify: `src/server.ts:919-1061`
- Modify: `test/server-config-contract.test.mjs`

**Interfaces:**
- Consumes: `serverConfigDataSchema`, `serverConfigOutputShape`, `createServerConfigSuccess`, `createServerConfigFailure`, and `ServerConfigData` from Task 1.
- Produces: exported `CodexProServerDependencies` with optional `serverConfigDataProvider`.
- Produces: actual MCP `listTools()` descriptor with `outputSchema` and `callTool()` success/failure results matching the schema.

- [ ] **Step 1: Extend the test with actual MCP registration and calls**

Add these imports to `test/server-config-contract.test.mjs`:

```js
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCodexProServer } from "../src/server.ts";
```

Add these helpers after `sampleServerConfigData()`:

```js
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
    toolMode: "minimal",
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
  const server = createCodexProServer(createTestConfig(), dependencies);
  const client = new Client({ name: "server-config-contract-test", version: "0.0.0" });
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
```

Append these tests:

```js
test("server_config advertises the exact output schema and returns a valid success envelope", async () => {
  await withInMemoryClient({}, async (client) => {
    const listed = await client.listTools();
    const descriptor = listed.tools.find((tool) => tool.name === "server_config");

    assert.ok(descriptor, "server_config must be registered");
    assert.ok(descriptor.outputSchema, "server_config must advertise outputSchema");
    assert.equal(descriptor.outputSchema.type, "object");
    assert.deepEqual(
      new Set(descriptor.outputSchema.required),
      new Set(["codexpro_tool", "codexpro_title", "ok", "data", "error", "meta"])
    );

    const result = await client.callTool({ name: "server_config", arguments: {} });
    const parsed = serverConfigOutputSchema.parse(result.structuredContent);

    assert.equal(result.isError, undefined);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data);
    assert.equal(parsed.error, null);
    assert.equal("host" in parsed, false);
    assert.equal(parsed.meta.schemaVersion, 1);
    assert.ok(parsed.meta.durationMs >= 0);
    assert.deepEqual(parsed.meta.warnings, []);
    assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("CodexPro Server Config")));
  });
});

test("server_config converts an injected provider failure into a redacted INTERNAL_ERROR envelope", async () => {
  const secret = ["gh", "p_", "a".repeat(32)].join("");

  await withInMemoryClient(
    {
      serverConfigDataProvider: () => {
        throw new Error(`provider failed with ${secret}`);
      }
    },
    async (client) => {
      const result = await client.callTool({ name: "server_config", arguments: {} });
      const parsed = serverConfigOutputSchema.parse(result.structuredContent);
      const serialized = JSON.stringify(result);

      assert.equal(result.isError, true);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.data, null);
      assert.deepEqual(parsed.error, {
        code: "INTERNAL_ERROR",
        message: "Error: provider failed with [REDACTED_SECRET]",
        retryable: false,
        details: {}
      });
      assert.equal(parsed.meta.schemaVersion, 1);
      assert.ok(parsed.meta.durationMs >= 0);
      assert.deepEqual(parsed.meta.warnings, []);
      assert.doesNotMatch(serialized, new RegExp(secret));
      assert.doesNotMatch(parsed.error.message, /\n\s*at\s/);
      assert.ok(result.content.some((item) => item.type === "text"));
    }
  );
});
```

- [ ] **Step 2: Run the tests and verify the expected integration failure**

Run:

```bash
node --import tsx --test test/server-config-contract.test.mjs
```

Expected result: FAIL because `createCodexProServer` does not accept dependencies and `server_config` does not advertise `outputSchema` or return the new envelope.

- [ ] **Step 3: Import the schema contracts into `src/server.ts`**

Add this import after the existing local imports:

```ts
import {
  createServerConfigFailure,
  createServerConfigSuccess,
  serverConfigDataSchema,
  serverConfigOutputShape,
  type ServerConfigData
} from "./tools/schemas/serverConfig.js";
```

- [ ] **Step 4: Add the narrow dependency interface**

Add below `type CodexToolHandler`:

```ts
export interface CodexProServerDependencies {
  serverConfigDataProvider?: () => ServerConfigData | Promise<ServerConfigData>;
}
```

This is a programmatic construction seam only. Do not connect it to environment variables, CLI parsing, HTTP, MCP arguments, or saved profiles.

- [ ] **Step 5: Attach duration at the existing common wrapper boundary**

Add this helper immediately before `registerToolCompat`:

```ts
function attachStructuredDuration(result: any, durationMs: number): any {
  if (!result || typeof result !== "object") return result;
  const structured = result.structuredContent;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) return result;
  const meta = structured.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return result;

  result.structuredContent = {
    ...structured,
    meta: {
      ...meta,
      durationMs: Math.max(0, durationMs)
    }
  };
  return result;
}
```

Replace the `wrapped` body inside `registerToolCompat` with:

```ts
  const wrapped = async (args: any) => {
    const started = Date.now();
    try {
      const result = attachStructuredDuration(
        tagToolResult(await handler(args ?? {}), name, options),
        Date.now() - started
      );
      logToolCall(name, result?.isError ? "error" : "ok", started);
      return result;
    } catch (error) {
      const result = attachStructuredDuration(
        tagToolResult(errorResult(error), name, options),
        Date.now() - started
      );
      logToolCall(name, "error", started);
      return result;
    }
  };
```

Old tools remain unchanged because they do not have a structured `meta` object.

- [ ] **Step 6: Add the typed default data builder**

Add immediately before `createCodexProServer`:

```ts
function buildServerConfigData(
  config: CodexProConfig,
  server: McpServer
): ServerConfigData {
  return serverConfigDataSchema.parse({
    defaultRoot: config.defaultRoot,
    allowedRoots: config.allowedRoots,
    host: config.host,
    port: config.port,
    widgetDomain: config.widgetDomain,
    authEnabled: Boolean(config.authToken),
    allowedHosts: config.allowedHosts,
    allowedOrigins: config.allowedOrigins,
    allowQueryToken: config.allowQueryToken,
    bashMode: config.bashMode,
    bashAvailability: config.bashMode === "off" ? null : probeBashAvailability(),
    bashTranscript: config.bashTranscript,
    bashSessionId: config.bashSessionId ?? null,
    requireBashSession: config.requireBashSession,
    codexSessions: config.codexSessions,
    codexDir: config.codexDir,
    writeMode: config.writeMode,
    toolMode: config.toolMode,
    toolCards: config.toolCards,
    connectionTest: config.connectionTest,
    analysisEnabled: config.analysisEnabled,
    analysisLimits: config.analysisLimits,
    inheritEnv: config.inheritEnv,
    contextDir: config.contextDir,
    maxReadBytes: config.maxReadBytes,
    maxWriteBytes: config.maxWriteBytes,
    maxOutputBytes: config.maxOutputBytes,
    maxSearchResults: config.maxSearchResults,
    blockedGlobs: config.blockedGlobs,
    registeredTools: registeredToolNames(server),
    registeredToolCount: registeredToolNames(server).length
  });
}
```

- [ ] **Step 7: Accept dependencies in the server factory**

Change the signature to:

```ts
export function createCodexProServer(
  config: CodexProConfig,
  dependencies: CodexProServerDependencies = {}
): McpServer {
```

After creating `server`, add:

```ts
  const serverConfigDataProvider =
    dependencies.serverConfigDataProvider ??
    (() => buildServerConfigData(config, server));
```

- [ ] **Step 8: Advertise the exact schema and replace only the `server_config` handler**

In the `server_config` descriptor, add:

```ts
      outputSchema: serverConfigOutputShape,
```

Replace the handler with:

```ts
    async () => {
      try {
        const safeConfig = serverConfigDataSchema.parse(await serverConfigDataProvider());
        return textResult(
          `# CodexPro Server Config\n\n${JSON.stringify(safeConfig, null, 2)}`,
          createServerConfigSuccess(safeConfig)
        );
      } catch (error) {
        const message = errorText(error);
        return {
          ...textResult(message, createServerConfigFailure(message)),
          isError: true
        };
      }
    }
```

Remove the former inline `safeConfig` object from this handler. Do not change any other tool handler.

- [ ] **Step 9: Run the narrow contract tests**

Run:

```bash
node --import tsx --test test/server-config-contract.test.mjs
```

Expected result: 5 tests PASS.

- [ ] **Step 10: Run TypeScript build**

Run:

```bash
npm run build
```

Expected result: exit code 0.

If the MCP SDK rejects `outputSchema: serverConfigOutputShape`, inspect the installed SDK type error and use the smallest representation accepted by SDK 1.17.4 while retaining `serverConfigOutputShape` as the single field-level source of truth. Do not weaken the runtime `serverConfigOutputSchema` validation.

- [ ] **Step 11: Review Task 2 before any Git operation**

Confirm:

- `listTools()` advertises `server_config.outputSchema`.
- Both actual success and injected failure pass `serverConfigOutputSchema`.
- No runtime flag or public failure seam was introduced.
- No other tool output changed.

Do not stage or commit until explicit user approval.

---

### Task 3: Update and test the `server_config` tool card data path

**Files:**
- Modify: `src/toolCardWidget.ts:506-522`
- Modify: `src/toolCardWidget.ts:902-941`
- Modify: `test/server-config-contract.test.mjs`

**Interfaces:**
- Consumes: the strict top-level identity and nested `data` result from Task 2.
- Produces: card subtitle and detailed rendering that use `data` only for configuration fields.

- [ ] **Step 1: Add a failing tool-card compatibility assertion**

Add this import to `test/server-config-contract.test.mjs`:

```js
import { toolCardWidgetHtml } from "../src/toolCardWidget.ts";
```

Append this test:

```js
test("server_config tool card reads configuration fields from data", () => {
  assert.match(
    toolCardWidgetHtml,
    /const config = data\?\.data \?\? \{\};/
  );
  assert.match(
    toolCardWidgetHtml,
    /function renderServerConfig\(data\) \{\s*const config = data\?\.data \?\? \{\};/
  );
  assert.doesNotMatch(
    toolCardWidgetHtml,
    /function renderServerConfig\(data\) \{\s*const blocked = Array\.isArray\(data\.blockedGlobs\)/
  );
});
```

- [ ] **Step 2: Run the contract test and verify the expected failure**

Run:

```bash
node --import tsx --test test/server-config-contract.test.mjs
```

Expected result: FAIL only for the new tool-card data-path test.

- [ ] **Step 3: Update `subtitleFor`**

Replace the current `server_config` branch with:

```js
    if (data?.codexpro_tool === "server_config") {
      const config = data?.data ?? {};
      const session = config?.bashSessionId || config?.bash_session_id;
      return "tools " + (config?.toolMode || config?.tool_mode || "-") + ", bash " + (config?.bashMode || config?.bash_mode || "-") + (session ? ", session " + session : "");
    }
```

- [ ] **Step 4: Update `renderServerConfig`**

Change the start of the function to:

```js
  function renderServerConfig(data) {
    const config = data?.data ?? {};
    const blocked = Array.isArray(config.blockedGlobs) ? config.blockedGlobs : [];
    const allowed = Array.isArray(config.allowedRoots) ? config.allowedRoots : [];
    const bashSession = config.bashSessionId || config.bash_session_id || "";
    const bashSessionRequired = Boolean(config.requireBashSession || config.require_bash_session);
```

Inside the remainder of `renderServerConfig`, replace configuration reads from `data` with `config`:

```text
data.defaultRoot        → config.defaultRoot
data.host               → config.host
data.port               → config.port
data.widgetDomain       → config.widgetDomain
data.maxReadBytes       → config.maxReadBytes
data.maxWriteBytes      → config.maxWriteBytes
data.maxOutputBytes     → config.maxOutputBytes
data.toolMode           → config.toolMode
data.bashMode           → config.bashMode
data.authEnabled        → config.authEnabled
data.writeMode          → config.writeMode
JSON.stringify(data...) → JSON.stringify(config...)
```

Keep `header(data, ...)` unchanged so top-level `codexpro_tool` and `codexpro_title` continue to drive generic card identity.

- [ ] **Step 5: Run the narrow tests**

Run:

```bash
node --import tsx --test test/server-config-contract.test.mjs
```

Expected result: 6 tests PASS.

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected result: exit code 0.

- [ ] **Step 7: Review Task 3 before any Git operation**

Confirm no unrelated tool-card branch changed. Do not stage or commit without explicit user approval.

---

### Task 4: Run full regression gates and record the completed slice

**Files:**
- Modify: `Memory.md`
- Modify: `docs/memory/archive/phase-1.md`
- Review: all implementation files from Tasks 1-3

**Interfaces:**
- Consumes: the completed first Phase 1 vertical slice.
- Produces: verified evidence, rollback notes, and the next approved planning boundary.

- [ ] **Step 1: Run the narrow contract test first**

Run:

```bash
node --import tsx --test test/server-config-contract.test.mjs
```

Expected result: 6 tests PASS.

- [ ] **Step 2: Run the complete Node test suite**

Run:

```bash
node --test test/*.test.mjs
```

Expected result: all tests PASS; the total will be the prior baseline plus the 6 new contract tests.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected result: exit code 0.

- [ ] **Step 4: Run the smoke suite**

Run:

```bash
npm run smoke
```

Expected result: all 8 sequential smoke sections PASS.

- [ ] **Step 5: Run package and security gates**

Run separately:

```bash
npm audit --audit-level=high
```

Expected result: 0 high-or-higher vulnerabilities.

```bash
npm pack --dry-run
```

Expected result: package contents remain bounded and internal memory/spec/plan archives are not unintentionally published.

- [ ] **Step 6: Run whitespace validation**

Run:

```bash
git diff --check
```

Expected result: exit code 0. LF-to-CRLF informational warnings are acceptable on Windows; whitespace errors are not.

- [ ] **Step 7: Review the exact file scope**

Expected implementation paths:

```text
src/tools/schemas/common.ts
src/tools/schemas/serverConfig.ts
src/server.ts
src/toolCardWidget.ts
test/server-config-contract.test.mjs
Memory.md
docs/memory/archive/phase-1.md
```

Planning files already present may remain changed until their separately approved Git lifecycle is completed. No other source, test, config, credential, dependency, or generated file should change.

- [ ] **Step 8: Review for secrets and unsafe test seams**

Verify:

- no real credential was added;
- the synthetic test value exists only inside the test and is assembled from harmless fragments;
- no environment variable, CLI option, HTTP route, MCP input, profile field, or saved setting can select the throwing provider;
- failure output contains no stack trace or raw synthetic value;
- `serverConfigDataProvider` is only an optional programmatic constructor dependency.

- [ ] **Step 9: Update `Memory.md`**

Record:

- Phase 1 implementation has started and the first `server_config` slice is complete locally;
- exact contract, tests, and verification evidence;
- worktree/staging/commit/push status;
- next action is review and explicit approval for Git operations, not migration of a second tool.

Keep `Memory.md` below its practical size limits.

- [ ] **Step 10: Append the Phase 1 archive**

Append the next available Phase 1 step, titled `Implement exact server_config output schema`, to `docs/memory/archive/phase-1.md` with:

- status;
- goal;
- files changed;
- TDD sequence;
- success/failure contract details;
- verification command results;
- compatibility impact;
- risks and limitations;
- rollback instructions;
- next action.

Do not edit closed archives.

- [ ] **Step 11: Re-run the narrow documentation test and diff check**

Run:

```bash
node --test test/auth-documentation.test.mjs
```

Expected result: 5 tests PASS.

Run:

```bash
git diff --check
```

Expected result: exit code 0.

- [ ] **Step 12: Stop for final implementation review**

Present:

- exact changed files;
- contract test totals;
- full test/build/smoke/package/audit results;
- compatibility changes;
- rollback path;
- unstaged/staged state.

Do not stage, commit, or push until the user explicitly approves those operations.

---

## Implementation completion criteria

The plan is complete only when:

- `server_config` advertises an exact `outputSchema` from the same field-level source used by runtime validation;
- actual MCP success and injected failure results validate against `serverConfigOutputSchema`;
- success uses `ok: true`, populated `data`, `error: null`;
- failure uses `ok: false`, `data: null`, redacted `INTERNAL_ERROR`, `retryable: false`, and `{}` details;
- metadata contains exactly `schemaVersion`, `durationMs`, and `warnings`;
- existing text content and failure `isError` remain;
- the tool card reads configuration from `data`;
- no other tool result changes;
- no production test backdoor exists;
- narrow tests, full tests, build, smoke, audit, package dry-run, documentation test, and diff check pass;
- `Memory.md` and the active Phase 1 archive contain final evidence;
- no Git mutation occurs without explicit approval.

## Rollback

Rollback this slice as one unit:

1. restore the former `server_config` handler and remove its advertised `outputSchema`;
2. restore the former tool-card top-level field access;
3. remove `src/tools/schemas/common.ts` if no later tool uses it;
4. remove `src/tools/schemas/serverConfig.ts`;
5. remove `test/server-config-contract.test.mjs`;
6. restore the common wrapper if `attachStructuredDuration` is unused;
7. append a rollback record to `docs/memory/archive/phase-1.md` and update `Memory.md`.

No user configuration, credentials, profiles, workspaces, remote branches, or Cloudflare state are changed by either implementation or rollback.
