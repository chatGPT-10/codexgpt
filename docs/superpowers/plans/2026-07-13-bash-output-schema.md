# `bash` Exact Output Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate only the direct `bash` MCP tool to the strict Phase 1 schema-v1 envelope while preserving the current synchronous Bash policy and verification behavior.

**Architecture:** Add one exact schema module and one injectable provider boundary around the existing `runBash` operation. The direct handler resolves the requested workspace and working directory, validates the provider result and its command/cwd/session identity, classifies internal policy/backend/path/start failures into fixed public errors, and preserves non-zero exits as successful process outcomes. A nested Tool Card renderer and updated Smoke/Stress consumers use the exact contract without changing the Bash execution algorithm.

**Tech Stack:** TypeScript, Zod, Node.js `node:test`, MCP SDK in-memory transport, existing CodexPro `PathGuard`, Bash policy and redaction services, Tool Card HTML, Git Bash on native Windows, and current Smoke/Stress suites.

**Status:** Planned and self-reviewed; implementation, staging, commits, push, and Phase 2/3/4 are not authorized by this document.

## Global Constraints

- Native Windows remains the primary platform; WSL must not become mandatory.
- Migrate only direct `bash`; do not change PowerShell, CMD, WSL, process sessions, PTY, Job Objects, workspace lifecycle, authentication, editing transactions, or Phase 2/3/4 behavior.
- Do not modify the current Bash allowlist, blocklist, environment policy, executable probe, timeout limits, output redaction, output truncation, direct-child termination, transcript modes, tool availability, or annotations.
- Preserve exactly eleven intentional success fields only under nested `data`: `workspace_id`, `root`, `command`, `cwd`, `exitCode`, `signal`, `durationMs`, `stdout`, `stderr`, `truncated`, and `bash_session_id`.
- Do not expose the current internal camelCase `bashSessionId` property publicly.
- `ok:true` means CodexPro returned a valid process outcome. A non-zero exit code, non-null signal, timeout marker, or truncated output remains `ok:true` when the provider returns a valid result.
- Use exactly eleven fixed non-retryable errors: `WORKSPACE_NOT_FOUND`, `INVALID_ARGUMENT`, `BASH_SESSION_CONFIGURATION_INVALID`, `BASH_SESSION_REQUIRED`, `BASH_SESSION_MISMATCH`, `COMMAND_POLICY_DENIED`, `SHELL_BACKEND_UNAVAILABLE`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `COMMAND_START_FAILED`, and `INTERNAL_ERROR`.
- Never expose raw failed commands, stdout, stderr, environment variables, executable paths, provided mismatching session ids, unsafe absolute paths, operating-system diagnostics, stack traces, exception names, or secret-looking values in public failures.
- Preserve the production `runBash` command/session/policy/backend/`cwd` validation order; after the provider returns, independently normalize the requested `cwd` and validate returned command, `cwd`, and optional session id before constructing success data.
- Do not add `passed`, `failed`, `timed_out`, `backend`, `pid`, `process_id`, `output_cursor`, `executed_project_code`, or sandbox claims.
- Do not introduce a production test mode, hidden MCP argument, environment switch, or global mutable provider override.
- Follow TDD: every production behavior change must be preceded by a focused failing test.
- Each task must remain independently reviewable. Commit commands in this plan are conditional checkpoints only and require the applicable user approval before execution.

---

## File Structure

- Create `src/tools/schemas/bash.ts`: exact success data, strict error union, output envelope, fixed messages, and pure constructors.
- Create `test/bash-contract.test.mjs`: schema, direct-handler, provider-validation, classification, Tool Card, wrapper, transcript, and tool-availability contracts.
- Modify `src/server.ts`: import the schema, define the Bash provider context and dependency, add strict provider validation, add safe classification, advertise the exact descriptor, and return the nested envelope.
- Modify `src/toolCardWidget.ts`: migrate `renderBash` to the nested envelope and add a stable failure branch.
- Modify `scripts/smoke.mjs`: update only direct Bash structured-result reads and stable failure assertions while preserving real execution coverage.
- Modify `scripts/stress.mjs`: update only direct and wrapped Bash structured-result reads and stable failure assertions while preserving policy-bypass coverage.
- Modify `CHANGELOG.md`, `AGENTS.md`, `Memory.md`, `docs/superpowers/specs/2026-07-13-bash-output-schema-design.md`, this plan, and `docs/memory/archive/phase-1-part-2.md` after implementation verification.
- Do not modify `src/bashOps.ts`, `src/config.ts`, package manifests, lockfiles, authentication, profile storage, or closed archive volumes.

---

### Task 1: Define and prove the strict `bash` schema contract

**Files:**
- Create: `test/bash-contract.test.mjs`
- Create: `src/tools/schemas/bash.ts`

**Interfaces:**
- Consumes: `createToolMeta` and `toolMetaSchema` from `src/tools/schemas/common.ts`.
- Produces: `BASH_ERROR_MESSAGES`, `bashDataSchema`, `bashErrorSchema`, `bashOutputShape`, `bashOutputSchema`, `createBashSuccess`, `createBashFailure`, `BashData`, `BashFailureInput`, and `BashStructuredResult`.

- [ ] **Step 1: Create the focused test file with failing constructor and strictness tests**

Create `test/bash-contract.test.mjs` with these initial imports:

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
const {
  BASH_ERROR_MESSAGES,
  bashOutputSchema,
  createBashFailure,
  createBashSuccess
} = await tsImport("../src/tools/schemas/bash.ts", import.meta.url);
```

Add this exact success fixture:

```js
function sampleBashData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    command: "npm run build",
    cwd: ".",
    exitCode: 0,
    signal: null,
    durationMs: 1842,
    stdout: "build passed\n",
    stderr: "",
    truncated: false,
    bash_session_id: null,
    ...overrides
  };
}
```

Add one constructor case for every approved error and exact details shape:

```js
const failureCases = [
  ["WORKSPACE_NOT_FOUND", { workspace_id: "ws_missing" }],
  ["INVALID_ARGUMENT", { argument: "command", reason: "empty" }],
  ["BASH_SESSION_CONFIGURATION_INVALID", { reason: "missing_server_session_id" }],
  ["BASH_SESSION_REQUIRED", { expected_session_id: "main" }],
  ["BASH_SESSION_MISMATCH", { expected_session_id: "main" }],
  ["COMMAND_POLICY_DENIED", { reason: "blocked_pattern" }],
  ["SHELL_BACKEND_UNAVAILABLE", { backend: "bash" }],
  ["PATH_OUTSIDE_WORKSPACE", { path: "[unsafe path omitted]" }],
  ["PATH_BLOCKED", { path: ".git" }],
  ["COMMAND_START_FAILED", { backend: "bash" }],
  ["INTERNAL_ERROR", {}]
];
```

Assert all of the following:

- success has exact top-level keys `codexpro_tool`, `codexpro_title`, `ok`, `data`, `error`, and `meta`;
- success rejects unknown top-level and nested fields;
- `command` and `cwd` reject empty strings;
- `exitCode` accepts a non-negative integer or `null` and rejects negative/fractional values;
- `signal` accepts `null` or a non-empty bounded string;
- `durationMs` is non-negative;
- `bash_session_id` accepts `null` or a 1–64 character identifier matching `[A-Za-z0-9][A-Za-z0-9._-]*`;
- failure requires `data:null`, one approved error, the exact fixed message, `retryable:false`, exact details, and empty warnings;
- `COMMAND_POLICY_DENIED` accepts only `blocked_pattern` or `not_allowlisted`;
- public legacy fields such as top-level `command`, `exitCode`, `durationMs`, and `bashSessionId` are rejected.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```text
node --test test/bash-contract.test.mjs
```

Expected: FAIL with module-not-found for `src/tools/schemas/bash.ts`. No production source should have changed before this RED result.

- [ ] **Step 3: Implement `src/tools/schemas/bash.ts` with fixed public messages**

Create the file with these fixed messages:

```ts
import { z } from "zod";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const BASH_ERROR_MESSAGES = {
  WORKSPACE_NOT_FOUND: "The requested workspace is not available. Open the workspace before retrying.",
  INVALID_ARGUMENT: "The Bash request contains an invalid argument.",
  BASH_SESSION_CONFIGURATION_INVALID: "The Bash session guard is enabled but the server session configuration is invalid.",
  BASH_SESSION_REQUIRED: "A Bash session id is required for this server.",
  BASH_SESSION_MISMATCH: "The provided Bash session id does not match this server.",
  COMMAND_POLICY_DENIED: "The command is not allowed by the current Bash policy.",
  SHELL_BACKEND_UNAVAILABLE: "The Bash backend is unavailable on this server.",
  PATH_OUTSIDE_WORKSPACE: "The requested working directory is outside the permitted workspace boundary.",
  PATH_BLOCKED: "The requested working directory is blocked by workspace safety rules.",
  COMMAND_START_FAILED: "The Bash process could not be started.",
  INTERNAL_ERROR: "The Bash request failed because of an internal error."
} as const;
```

Define the session schema and exact success data:

```ts
const bashSessionIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const bashDataSchema = z.object({
  workspace_id: z.string().min(1),
  root: z.string(),
  command: z.string().min(1),
  cwd: z.string().min(1),
  exitCode: z.number().int().nonnegative().nullable(),
  signal: z.string().min(1).max(64).nullable(),
  durationMs: z.number().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  bash_session_id: bashSessionIdSchema.nullable()
}).strict();
```

Define strict detail schemas:

```ts
const workspaceDetailsSchema = z.object({
  workspace_id: z.string().min(1).max(160)
}).strict();

const invalidArgumentDetailsSchema = z.object({
  argument: z.literal("command"),
  reason: z.literal("empty")
}).strict();

const sessionConfigurationDetailsSchema = z.object({
  reason: z.literal("missing_server_session_id")
}).strict();

const expectedSessionDetailsSchema = z.object({
  expected_session_id: bashSessionIdSchema
}).strict();

const commandPolicyDetailsSchema = z.object({
  reason: z.enum(["blocked_pattern", "not_allowlisted"])
}).strict();

const backendDetailsSchema = z.object({
  backend: z.literal("bash")
}).strict();

const pathDetailsSchema = z.object({
  path: z.string().min(1).max(240)
}).strict();

const emptyDetailsSchema = z.object({}).strict();
```

Create an exact discriminated error union. Each member must use its literal fixed message, `retryable:z.literal(false)`, and only its approved strict details schema:

```ts
const workspaceNotFoundErrorSchema = z.object({
  code: z.literal("WORKSPACE_NOT_FOUND"),
  message: z.literal(BASH_ERROR_MESSAGES.WORKSPACE_NOT_FOUND),
  retryable: z.literal(false),
  details: workspaceDetailsSchema
}).strict();

const invalidArgumentErrorSchema = z.object({
  code: z.literal("INVALID_ARGUMENT"),
  message: z.literal(BASH_ERROR_MESSAGES.INVALID_ARGUMENT),
  retryable: z.literal(false),
  details: invalidArgumentDetailsSchema
}).strict();

const bashSessionConfigurationInvalidErrorSchema = z.object({
  code: z.literal("BASH_SESSION_CONFIGURATION_INVALID"),
  message: z.literal(BASH_ERROR_MESSAGES.BASH_SESSION_CONFIGURATION_INVALID),
  retryable: z.literal(false),
  details: sessionConfigurationDetailsSchema
}).strict();

const bashSessionRequiredErrorSchema = z.object({
  code: z.literal("BASH_SESSION_REQUIRED"),
  message: z.literal(BASH_ERROR_MESSAGES.BASH_SESSION_REQUIRED),
  retryable: z.literal(false),
  details: expectedSessionDetailsSchema
}).strict();

const bashSessionMismatchErrorSchema = z.object({
  code: z.literal("BASH_SESSION_MISMATCH"),
  message: z.literal(BASH_ERROR_MESSAGES.BASH_SESSION_MISMATCH),
  retryable: z.literal(false),
  details: expectedSessionDetailsSchema
}).strict();

const commandPolicyDeniedErrorSchema = z.object({
  code: z.literal("COMMAND_POLICY_DENIED"),
  message: z.literal(BASH_ERROR_MESSAGES.COMMAND_POLICY_DENIED),
  retryable: z.literal(false),
  details: commandPolicyDetailsSchema
}).strict();

const shellBackendUnavailableErrorSchema = z.object({
  code: z.literal("SHELL_BACKEND_UNAVAILABLE"),
  message: z.literal(BASH_ERROR_MESSAGES.SHELL_BACKEND_UNAVAILABLE),
  retryable: z.literal(false),
  details: backendDetailsSchema
}).strict();

const pathOutsideWorkspaceErrorSchema = z.object({
  code: z.literal("PATH_OUTSIDE_WORKSPACE"),
  message: z.literal(BASH_ERROR_MESSAGES.PATH_OUTSIDE_WORKSPACE),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const pathBlockedErrorSchema = z.object({
  code: z.literal("PATH_BLOCKED"),
  message: z.literal(BASH_ERROR_MESSAGES.PATH_BLOCKED),
  retryable: z.literal(false),
  details: pathDetailsSchema
}).strict();

const commandStartFailedErrorSchema = z.object({
  code: z.literal("COMMAND_START_FAILED"),
  message: z.literal(BASH_ERROR_MESSAGES.COMMAND_START_FAILED),
  retryable: z.literal(false),
  details: backendDetailsSchema
}).strict();

const internalErrorSchema = z.object({
  code: z.literal("INTERNAL_ERROR"),
  message: z.literal(BASH_ERROR_MESSAGES.INTERNAL_ERROR),
  retryable: z.literal(false),
  details: emptyDetailsSchema
}).strict();

export const bashErrorSchema = z.discriminatedUnion("code", [
  workspaceNotFoundErrorSchema,
  invalidArgumentErrorSchema,
  bashSessionConfigurationInvalidErrorSchema,
  bashSessionRequiredErrorSchema,
  bashSessionMismatchErrorSchema,
  commandPolicyDeniedErrorSchema,
  shellBackendUnavailableErrorSchema,
  pathOutsideWorkspaceErrorSchema,
  pathBlockedErrorSchema,
  commandStartFailedErrorSchema,
  internalErrorSchema
]);
```

Define this exact failure-input type:

```ts
export type BashFailureInput =
  | { code: "WORKSPACE_NOT_FOUND"; details: { workspace_id: string } }
  | { code: "INVALID_ARGUMENT"; details: { argument: "command"; reason: "empty" } }
  | { code: "BASH_SESSION_CONFIGURATION_INVALID"; details: { reason: "missing_server_session_id" } }
  | { code: "BASH_SESSION_REQUIRED"; details: { expected_session_id: string } }
  | { code: "BASH_SESSION_MISMATCH"; details: { expected_session_id: string } }
  | { code: "COMMAND_POLICY_DENIED"; details: { reason: "blocked_pattern" | "not_allowlisted" } }
  | { code: "SHELL_BACKEND_UNAVAILABLE"; details: { backend: "bash" } }
  | { code: "PATH_OUTSIDE_WORKSPACE"; details: { path: string } }
  | { code: "PATH_BLOCKED"; details: { path: string } }
  | { code: "COMMAND_START_FAILED"; details: { backend: "bash" } }
  | { code: "INTERNAL_ERROR"; details: Record<string, never> };
```

Define the exact envelope:

```ts
export const bashOutputShape = {
  codexpro_tool: z.literal("bash"),
  codexpro_title: z.literal("Bash"),
  ok: z.boolean(),
  data: bashDataSchema.nullable(),
  error: bashErrorSchema.nullable(),
  meta: toolMetaSchema
};

const bashOutputBaseSchema = z.object(bashOutputShape).strict();

export const bashOutputSchema = bashOutputBaseSchema.superRefine((value, context) => {
  if (value.ok) {
    if (value.data === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Successful bash results require data." });
    }
    if (value.error !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Successful bash results require error to be null." });
    }
    return;
  }
  if (value.data !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "Failed bash results require data to be null." });
  }
  if (value.error === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["error"], message: "Failed bash results require an error object." });
  }
});
```

Export `BashData`, `BashStructuredResult`, `createBashSuccess`, and `createBashFailure`. Both constructors must parse through `bashOutputSchema` and call `createToolMeta(durationMs)`.

- [ ] **Step 4: Run focused constructor tests and confirm GREEN**

Run:

```text
node --test test/bash-contract.test.mjs
```

Expected: constructor/schema tests PASS. Direct-handler tests are not yet present.

- [ ] **Step 5: Review Task 1 diff and conditional checkpoint**

Use `show_changes` restricted to `src/tools/schemas/bash.ts` and `test/bash-contract.test.mjs`. Confirm no server, Bash algorithm, Tool Card, authentication, dependency, or workspace-lifecycle change exists.

When implementation execution and Git checkpointing have explicit approval:

```text
git add src/tools/schemas/bash.ts test/bash-contract.test.mjs
git commit -m "test(schema): define bash result contract"
```

---

### Task 2: Migrate the direct handler and classify tool-level failures safely

**Files:**
- Modify: `test/bash-contract.test.mjs`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: all schema exports from Task 1; `BashResult` and `runBash` from `src/bashOps.ts`; existing `PathGuard`, workspace manager, `nodeErrorCode`, safe detail helpers, `bashTextResult`, and duration attachment behavior.
- Produces: `BashProviderContext`, optional `bashResultProvider`, strict `bashProviderResultSchema`, `classifyBashFailure`, and the migrated direct handler.

- [ ] **Step 1: Add direct-handler test helpers**

Following the existing direct-tool contract tests, add:

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

async function withInMemoryClient(config, dependencies, callback) {
  const server = createCodexProServer(config, dependencies);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "bash-contract", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await callback(client);
  } finally {
    await client.close();
    await server.close();
  }
}

async function withTempWorkspace(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-bash-contract-"));
  try {
    await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function assertBashFailure(result, expectedCode, expectedDetails) {
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.ok, false);
  assert.equal(result.structuredContent.data, null);
  assert.equal(result.structuredContent.error.code, expectedCode);
  assert.equal(result.structuredContent.error.message, BASH_ERROR_MESSAGES[expectedCode]);
  assert.equal(result.structuredContent.error.retryable, false);
  assert.deepEqual(result.structuredContent.error.details, expectedDetails);
  assert.deepEqual(result.structuredContent.meta.warnings, []);
}
```

Keep this helper aligned with the current complete direct-tool contract configuration. The Bash-specific differences are exactly `bashMode: "safe"` and `toolMode: "full"`; do not omit unrelated required configuration fields.

- [ ] **Step 2: Add failing descriptor, outcome, provider, and classification tests**

Add focused tests for:

1. direct `bash` advertises `outputSchema` and returns exact top-level keys;
2. `bashMode:"off"` does not register the tool;
3. a real `pwd` command succeeds with eleven nested data fields and no top-level legacy fields;
4. an injected result with `exitCode:2` remains `ok:true` and `isError !== true`;
5. injected null exit code, signal, and truncation remain valid success data;
6. unknown explicit workspace;
7. empty and whitespace-only commands;
8. required session omitted;
9. mismatched session without echoing the provided mismatch;
10. configured-session/provider-session consistency;
11. blocked-pattern policy rejection;
12. not-allowlisted policy rejection;
13. unavailable backend rejection;
14. escaping, absolute, UNC, device, drive-relative, ADS, reserved-name, trailing-dot/space, and parent-symlink `cwd` rejection;
15. blocked `.git` `cwd` rejection;
16. injected `ENOENT`, `EACCES`, and `EPERM` start rejections;
17. generic provider rejection;
18. malformed provider objects: missing field, unknown field, negative/fractional exit, empty signal, negative duration, invalid session id;
19. provider-returned command mismatch;
20. provider-returned non-normalized, different, escaping, or blocked `cwd`;
21. provider-returned session when none is configured, missing session when one is configured, and mismatched configured session;
22. fixed human-readable failure content excludes command text, supplied mismatch, executable path, environment value, raw provider message, stack, and unsafe absolute path.

Use dependency injection for provider shape/start/backend marker cases. Use real current behavior for workspace, input, session, policy, and path cases where deterministic on the test platform.

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```text
node --test test/bash-contract.test.mjs
```

Expected: FAIL because direct `bash` has no exact `outputSchema`, returns flat mixed-case fields, uses generic error output, has no injectable provider, and does not validate provider-returned identity.

- [ ] **Step 4: Add schema imports and provider types to `src/server.ts`**

Import:

```ts
import {
  BASH_ERROR_MESSAGES,
  bashDataSchema,
  bashOutputShape,
  createBashFailure,
  createBashSuccess,
  type BashFailureInput
} from "./tools/schemas/bash.js";
import type { BashResult } from "./bashOps.js";
```

If `runBash` and other Bash imports already share one import declaration, extend that declaration rather than duplicating it.

Add beside the existing provider contexts:

```ts
export interface BashProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  command: string;
  options: {
    cwd?: string;
    timeoutMs?: number;
    sessionId?: string;
  };
}
```

Extend `CodexProServerDependencies`:

```ts
bashResultProvider?: (
  context: BashProviderContext
) => BashResult | Promise<BashResult>;
```

- [ ] **Step 5: Add strict provider-result validation**

Near the existing direct-tool provider schemas, add:

```ts
const bashProviderResultSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1),
  exitCode: z.number().int().nonnegative().nullable(),
  signal: z.string().min(1).max(64).nullable(),
  durationMs: z.number().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  bashSessionId: z.string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    .optional()
}).strict();
```

Near the other default providers, add:

```ts
const bashResultProvider =
  dependencies.bashResultProvider ??
  ((context: BashProviderContext) =>
    runBash(
      context.config,
      context.guard,
      context.workspace,
      context.command,
      context.options
    ));
```

- [ ] **Step 6: Add safe Bash failure classification helpers**

Add these exact bounded helpers and path-prefix list beside the established direct-tool classifiers:

```ts
function safeBashWorkspaceIdDetail(value: unknown): string {
  return safeTreeWorkspaceIdDetail(value);
}

function safeBashSessionDetail(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(text)) {
    throw new CodexProError("Configured Bash session id is invalid.");
  }
  return text;
}

function safeBashPathDetail(value: unknown): string {
  const raw = String(value ?? ".");
  const segments = raw.replace(/\\/g, "/").split("/");
  if (segments.some((segment) => segment === "..")) {
    return "[unsafe path omitted]";
  }
  return safeTreePathDetail(raw);
}

const BASH_OUTSIDE_PATH_PREFIXES = [
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
```

Implement the classifier with the exact current internal message prefixes:

```ts
function classifyBashFailure(
  error: unknown,
  args: Record<string, unknown>,
  config: CodexProConfig
): BashFailureInput {
  const message = error instanceof Error ? error.message : String(error);
  const filesystemCode = nodeErrorCode(error);

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeBashWorkspaceIdDetail(args.workspace_id) }
    };
  }
  if (!String(args.command ?? "").trim() || message === "command is required.") {
    return {
      code: "INVALID_ARGUMENT",
      details: { argument: "command", reason: "empty" }
    };
  }
  if (message === "bash session guard is enabled but no server bash session id is configured.") {
    return {
      code: "BASH_SESSION_CONFIGURATION_INVALID",
      details: { reason: "missing_server_session_id" }
    };
  }
  if (message.startsWith("bash session id is required.")) {
    return {
      code: "BASH_SESSION_REQUIRED",
      details: { expected_session_id: safeBashSessionDetail(config.bashSessionId) }
    };
  }
  if (message.startsWith("bash session id mismatch.")) {
    return {
      code: "BASH_SESSION_MISMATCH",
      details: { expected_session_id: safeBashSessionDetail(config.bashSessionId) }
    };
  }
  if (message.startsWith("Command is blocked in CODEXPRO_BASH_MODE=safe:")) {
    return {
      code: "COMMAND_POLICY_DENIED",
      details: { reason: "blocked_pattern" }
    };
  }
  if (message.startsWith("Command is not in the safe bash allowlist:")) {
    return {
      code: "COMMAND_POLICY_DENIED",
      details: { reason: "not_allowlisted" }
    };
  }
  if (message.startsWith("Bash backend is unavailable.")) {
    return {
      code: "SHELL_BACKEND_UNAVAILABLE",
      details: { backend: "bash" }
    };
  }
  if (message.startsWith("Path is blocked by safety rules:")) {
    return {
      code: "PATH_BLOCKED",
      details: { path: safeBashPathDetail(args.cwd ?? ".") }
    };
  }
  if (BASH_OUTSIDE_PATH_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      details: { path: safeBashPathDetail(args.cwd ?? ".") }
    };
  }
  if (filesystemCode === "ENOENT" || filesystemCode === "EACCES" || filesystemCode === "EPERM") {
    return {
      code: "COMMAND_START_FAILED",
      details: { backend: "bash" }
    };
  }
  return { code: "INTERNAL_ERROR", details: {} };
}
```

Keep this classification order exact. Provider command/cwd/session validation failures intentionally fall through to `INTERNAL_ERROR`; no raw provider message is published.

- [ ] **Step 7: Migrate the direct handler**

Replace only the direct `bash` handler with this flow:

```ts
registerCodexTool(
  config,
  server,
  "bash",
  {
    title: "Bash",
    description:
      "Run one allowlisted verification command in the workspace, such as tests, build, lint, typecheck, or a project script. Do not use for git status/diff or file inspection; use show_changes, tree, search, and read instead. Do not chain commands with &&, pipes, redirects, or shell file readers.",
    inputSchema: {
      workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
      command: z.string().describe("Command to run."),
      session_id: z.string().optional().describe(
        config.requireBashSession && config.bashSessionId
          ? `Required bash session id for this server: ${config.bashSessionId}.`
          : "Optional bash session id. If configured on the server, a provided value must match it."
      ),
      cwd: z.string().optional().describe("Working directory relative to workspace root. Default: ."),
      timeout_ms: z.number().int().min(1000).max(180000).optional().describe("Timeout in milliseconds. Default: 30000.")
    },
    outputSchema: bashOutputShape,
    annotations: BASH_ANNOTATIONS,
    _meta: {
      ...toolCardMeta(),
      "openai/toolInvocation/invoking": "Running bash command...",
      "openai/toolInvocation/invoked": "Bash command finished"
    }
  },
  async (args) => {
    const startedAt = Date.now();
    try {
      const workspace = workspaces.getWorkspace(args.workspace_id);
      const command = String(args.command ?? "");
      const requestedCwd = typeof args.cwd === "string" ? args.cwd : undefined;
      const providerResult = bashProviderResultSchema.parse(
        await bashResultProvider({
          config,
          guard,
          workspace,
          command,
          options: {
            cwd: requestedCwd,
            timeoutMs: args.timeout_ms,
            sessionId: args.session_id
          }
        })
      );
      const resolvedCwd = guard.resolve(workspace, requestedCwd ?? ".");
      const expectedCwd = path.relative(workspace.root, resolvedCwd.absPath) || ".";

      if (providerResult.command !== command) {
        throw new CodexProError("Bash provider returned a mismatched command.");
      }
      if (providerResult.cwd !== expectedCwd) {
        throw new CodexProError("Bash provider returned a mismatched working directory.");
      }
      if (config.bashSessionId) {
        if (providerResult.bashSessionId !== config.bashSessionId) {
          throw new CodexProError("Bash provider returned a mismatched session id.");
        }
      } else if (providerResult.bashSessionId !== undefined) {
        throw new CodexProError("Bash provider returned an unexpected session id.");
      }

      const data = bashDataSchema.parse({
        workspace_id: workspace.id,
        root: workspace.root,
        command: providerResult.command,
        cwd: providerResult.cwd,
        exitCode: providerResult.exitCode,
        signal: providerResult.signal,
        durationMs: providerResult.durationMs,
        stdout: providerResult.stdout,
        stderr: providerResult.stderr,
        truncated: providerResult.truncated,
        bash_session_id: providerResult.bashSessionId ?? null
      });

      return textResult(
        bashTextResult(config, providerResult),
        createBashSuccess(data, Date.now() - startedAt)
      );
    } catch (error) {
      const failure = classifyBashFailure(error, args, config);
      const text = [
        "# Bash Error",
        "",
        `Code: ${failure.code}`,
        BASH_ERROR_MESSAGES[failure.code]
      ].join("\n");
      return {
        ...textResult(text, createBashFailure(failure, Date.now() - startedAt)),
        isError: true
      };
    }
  }
);
```

Preserve the existing registration position and annotations. Ensure the generic registration wrapper does not overwrite the nested `meta.durationMs`; its existing attachment behavior may update the constructor value with the full call duration.

- [ ] **Step 8: Run focused tests and confirm GREEN**

Run:

```text
node --test test/bash-contract.test.mjs
```

Expected: schema, descriptor, direct handler, process-outcome, provider-validation, session, policy, backend, path, start, and fixed-failure tests PASS.

- [ ] **Step 9: Review Task 2 diff and conditional checkpoint**

Use `show_changes` for `src/server.ts` and `test/bash-contract.test.mjs`. Confirm:

- `src/bashOps.ts` is unchanged;
- non-zero exit remains `ok:true`;
- raw failures do not cross the public boundary;
- no PowerShell/process/session architecture was introduced;
- no other tool schema changed.

When approved:

```text
git add src/server.ts test/bash-contract.test.mjs
git commit -m "feat(schema): migrate bash result envelope"
```

---

### Task 3: Migrate Tool Card, wrapper, Smoke, and Stress consumers

**Files:**
- Modify: `test/bash-contract.test.mjs`
- Modify: `src/toolCardWidget.ts`
- Modify: `scripts/smoke.mjs`
- Modify: `scripts/stress.mjs`

**Interfaces:**
- Consumes: the nested direct `bash` envelope from Task 2.
- Produces: nested Tool Card rendering and end-to-end consumers that never read legacy top-level Bash result fields.

- [ ] **Step 1: Add failing Tool Card and supertool tests**

Add tests that supply a successful nested envelope and require the rendered widget source to:

- branch on `data?.ok === false`;
- read command data from `data?.data ?? {}`;
- render the stable error code and fixed message for failure;
- preserve command-level `passed`/`failed` presentation from `exitCode` without changing envelope `ok`;
- render separate bounded stdout and stderr previews;
- show truncation and optional session indicators;
- avoid reading legacy top-level `data.exitCode`, `data.stdout`, or `data.durationMs`.

Add an in-memory `codexpro` wrapper call:

```js
const wrapped = await client.callTool({
  name: "codexpro",
  arguments: {
    action: "bash",
    args: { workspace_id: workspaceId, command: "pwd" }
  }
});
```

Assert:

```js
assert.equal(wrapped.structuredContent.codexpro_tool, "bash");
assert.equal(wrapped.structuredContent.codexpro_super_action, "bash");
assert.equal(wrapped.structuredContent.wrapped_tool, "bash");
assert.equal(wrapped.structuredContent.ok, true);
assert.equal(wrapped.structuredContent.data.exitCode, 0);
assert.equal("exitCode" in wrapped.structuredContent, false);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```text
node --test test/bash-contract.test.mjs
```

Expected: FAIL because the Tool Card still reads flat fields. The supertool may already preserve the nested child result after Task 2; keep the test as a regression lock.

- [ ] **Step 3: Migrate `renderBash` to the nested envelope**

Replace only `renderBash` with a nested implementation shaped as follows:

```js
function renderBash(data) {
  const commandResult = data?.data ?? {};
  const error = data?.error ?? {};
  if (data?.ok === false) {
    return '<article class="card">' +
      header(data, pill(error.code || "error", "bad")) +
      '<div class="body"><div class="empty">' +
      esc(error.message || "Bash unavailable.") +
      '</div></div></article>';
  }

  const commandPassed = Number(commandResult.exitCode) === 0;
  const stdoutLines = countLines(commandResult.stdout);
  const stderrLines = countLines(commandResult.stderr);
  const totalLines = stdoutLines + stderrLines;
  const pills = [
    pill(commandPassed ? "passed" : "failed", commandPassed ? "good" : "bad"),
    commandResult.signal ? pill(commandResult.signal, "warn") : "",
    commandResult.truncated ? pill("truncated", "warn") : "",
    commandResult.bash_session_id ? pill("session " + commandResult.bash_session_id, "info") : "",
    pill(totalLines + " lines", "info"),
    pill((commandResult.durationMs ?? "-") + " ms")
  ].join("");
  const command = '<span class="prompt">$</span> ' + esc(truncate(commandResult.command || "", 1000));
  const stdout = previewLines(commandResult.stdout || "", 18);
  const stderr = previewLines(commandResult.stderr || "", 18);
  const outputBoxes = [
    stdout ? fold("stdout", stdoutLines + " lines", codebox("stdout preview", esc(truncate(stdout, 5000)), "terminal"), false) : "",
    stderr ? fold("stderr", stderrLines + " lines", codebox("stderr preview", esc(truncate(stderr, 5000)), "terminal"), false) : ""
  ].join("") || '<div class="empty">Command produced no output.</div>';

  return '<article class="card">' + header(data, pills) + '<div class="body">' +
    '<div class="summary">' +
    summaryItem("Exit", commandResult.exitCode ?? "-") +
    summaryItem("Signal", commandResult.signal || "-") +
    summaryItem("Lines", totalLines) +
    summaryItem("Duration", (commandResult.durationMs ?? "-") + " ms") +
    '</div>' +
    codebox("command", command, "terminal") +
    outputBoxes +
    '</div></article>';
}
```

Keep all output previews bounded and escaped. Do not render raw failure details or submitted failure command text.

- [ ] **Step 4: Update Smoke's old flat Bash accesses**

In `scripts/smoke.mjs`, update only assertions that read direct successful Bash data:

```js
const pwdBashData = pwdBash.structuredContent.data;
if (!pwdBashData?.stdout?.trim() || pwdBashData.exitCode !== 0) {
  throw new Error(`compact bash transcript dropped nested structured output: ${JSON.stringify(pwdBash.structuredContent)}`);
}
```

For session guard success:

```js
if (
  guardedBash.structuredContent.data?.bash_session_id !== "codex-main" ||
  guardedBash.structuredContent.data?.exitCode !== 0 ||
  !guardedBash.content?.[0]?.text?.includes("Exit: 0")
) {
  throw new Error(`bash session guard did not allow matching session id: ${JSON.stringify(guardedBash.structuredContent)}`);
}
```

Replace generic `expectToolError` checks for direct Bash with exact stable code assertions where the helper can accept a code. Preserve all existing real safe-policy, package-script, transcript, no-Bash, and session tests.

- [ ] **Step 5: Update Stress's old flat Bash accesses**

Change successful checks from:

```js
safePwd.structuredContent.exitCode === 0
```

to:

```js
safePwd.structuredContent.ok === true &&
safePwd.structuredContent.data?.exitCode === 0
```

Change direct safe-policy error string checks from a flat string to:

```js
blockedNewline.structuredContent.ok === false &&
blockedNewline.structuredContent.error?.code === "COMMAND_POLICY_DENIED"
```

For wrapped failures, preserve wrapper identity and assert the nested code:

```js
blockedSuperNewline.structuredContent.codexpro_tool === "bash" &&
blockedSuperNewline.structuredContent.ok === false &&
blockedSuperNewline.structuredContent.error?.code === "COMMAND_POLICY_DENIED"
```

Do not weaken any file-noncreation assertion or policy-bypass fixture.

- [ ] **Step 6: Run focused and end-to-end consumer tests**

Run:

```text
node --test test/bash-contract.test.mjs
npm run smoke
npm run stress
```

Expected:

- focused Bash contract passes;
- all eight Smoke sections pass;
- native-Windows Stress passes, including its internal build;
- compact/full transcript, session guard, safe-policy, supertool, and no-Bash behavior remain covered.

- [ ] **Step 7: Review Task 3 diff and conditional checkpoint**

Use `show_changes` for `src/toolCardWidget.ts`, `scripts/smoke.mjs`, `scripts/stress.mjs`, and `test/bash-contract.test.mjs`. Confirm only nested field access and stable errors changed.

When approved:

```text
git add src/toolCardWidget.ts scripts/smoke.mjs scripts/stress.mjs test/bash-contract.test.mjs
git commit -m "test(schema): migrate bash consumers"
```

---

### Task 4: Complete verification, documentation, memory, and publication gate

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Modify: `docs/superpowers/specs/2026-07-13-bash-output-schema-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-bash-output-schema.md`
- Modify: `docs/memory/archive/phase-1-part-2.md`
- Review: every implementation file from Tasks 1–3

**Interfaces:**
- Consumes: the complete eleventh Phase 1 slice.
- Produces: fresh local evidence, reconciled documentation and memory, an independently reversible implementation set, and a separate publication decision point.

- [ ] **Step 1: Run focused Bash contracts**

Run:

```text
node --test test/bash-contract.test.mjs
```

Expected: all focused cases pass. Record the exact passed/failed/skipped counts.

- [ ] **Step 2: Run adjacent contracts**

Run:

```text
node --test test/bash-contract.test.mjs test/server-config-contract.test.mjs test/apply-patch-contract.test.mjs test/show-changes-contract.test.mjs
```

Expected: all pass. These cover shared envelope/meta behavior, server Bash configuration, adjacent edit-and-verify workflow, Tool Card routing, and wrapper behavior.

- [ ] **Step 3: Run the complete Node regression suite**

Run:

```text
node --test test/*.test.mjs
```

Expected: all tests pass. Record exact counts rather than copying historical values.

- [ ] **Step 4: Run build**

Run:

```text
npm run build
```

Expected: TypeScript compilation succeeds with no schema/provider type errors.

- [ ] **Step 5: Run Smoke**

Run:

```text
npm run smoke
```

Expected: all eight sections pass, including real Bash execution, compact/full transcript, session guard, safe policy, and no-Bash mode.

- [ ] **Step 6: Run native-Windows Stress**

Run:

```text
npm run stress
```

Expected: pass, including the internal build and all direct/supertool safe-Bash bypass protections.

- [ ] **Step 7: Run whitespace and diff validation**

Run:

```text
git diff --check
```

Expected: no errors. Established Windows LF-to-CRLF working-copy warnings may be recorded separately but are not failures.

- [ ] **Step 8: Review the exact change set**

Use one final `show_changes` with the full intended scope. Confirm:

- only the expected schema, test, handler, Tool Card, Smoke, Stress, changelog, design, plan, AGENTS, Memory, and active archive files changed;
- `src/bashOps.ts`, config, authentication, dependencies, profiles, and Phase 2/3/4 code are unchanged;
- all direct Bash success fields live only under `data`;
- no `bashSessionId` is public;
- every tool-level failure sets `isError:true` and has a fixed safe message;
- non-zero command exits remain `ok:true`;
- no raw command, output, executable path, environment value, unsafe path, mismatching input id, token, private key, or process diagnostic appears in public failure fixtures or docs.

- [ ] **Step 9: Reconcile documentation and memory with fresh evidence**

Update:

- `CHANGELOG.md`: describe the exact direct `bash` schema-v1 contract, stable errors, nested Tool Card/wrapper consumers, and preserved command-outcome semantics.
- Design status: `Complete locally; publication pending` with exact evidence.
- Plan status and checkboxes: mark only actually completed items.
- `AGENTS.md`: add design/plan documentation map entries and update the stopping point.
- `Memory.md`: record the eleventh slice state, decisions, exact local verification counts, limitations, and next permitted action.
- Active archive: append a complete implementation STEP with files, commands, results, decisions, failures, risks, rollback, and publication gate.

Do not rewrite earlier archive entries. Check the active archive byte size after the complete STEP and open a numbered continuation volume only if it reaches the configured 80% threshold.

- [ ] **Step 10: Run final documentation diff check**

Run:

```text
git diff --check
```

Expected: pass after documentation reconciliation.

- [ ] **Step 11: Stop for explicit publication approval**

Report:

- exact changed files;
- focused, adjacent, complete, Build, Smoke, Stress, and diff-check results;
- retained timeout/process-tree and policy-not-sandbox limitations;
- rollback method;
- whether the working tree is unstaged.

Do not stage, commit, push, alter credentials, expand access, rewrite history, or begin Phase 2/3/4 without explicit approval.

After approval, stage only the reviewed files and run:

```text
git diff --cached --check
```

Then create the approved implementation commit, push `main`, and verify the exact branch-head GitHub Actions run on Ubuntu/Windows Node 20/24. Publication is complete only when the CI head SHA equals the pushed implementation SHA and all four matrix jobs pass.

---

## Plan Self-Review

- Spec coverage: every design requirement maps to Tasks 1–4.
- Placeholder scan: no `TBD`, `TODO`, wildcard implementation instruction, or unresolved decision remains.
- Type consistency: `BashProviderContext`, provider result fields, public data fields, fixed errors, and consumer field names match across all tasks.
- Outcome consistency: non-zero command exit remains `ok:true`; only tool-level failures produce `ok:false`.
- Security consistency: raw failed commands, output, environment, executable paths, unsafe paths, submitted mismatch values, and internal diagnostics remain private.
- Scope consistency: `src/bashOps.ts`, PowerShell, process sessions, PTY, Job Objects, authentication, dependencies, workspace lifecycle, and Phase 2/3/4 remain outside the plan.
- Verification consistency: focused, adjacent, complete, Build, Smoke, native-Windows Stress, diff review, memory reconciliation, and cross-platform CI are all explicitly gated.
