# Phase 1 First Slice Design: Exact `server_config` Output Schema

**Date:** 2026-07-12
**Status:** Approved design; implemented, published, and cross-platform CI-validated through STEP-089
**Scope:** One vertical slice for `server_config` only

## 1. Purpose

Phase 1 establishes exact MCP output schemas and stable errors without breaking the existing human-readable tool output. The first implementation slice migrates only `server_config` so the repository gains one complete, testable reference pattern before any broader rollout.

This slice must prove the full path:

1. a precise advertised `outputSchema`;
2. an actual structured result that validates against it;
3. a stable success envelope;
4. a stable failure envelope;
5. compatibility with existing MCP `content` and `isError` behavior;
6. a tool card that reads the new structured shape;
7. contract tests that exercise registration, success, and failure.

## 2. Non-goals

This slice does not:

- migrate any tool other than `server_config`;
- retrofit stable error codes into all existing `CodexProError` uses;
- introduce request identity or cross-transport tracing;
- add OAuth, scopes, audit logging, workspace lifecycle, shell changes, or process management;
- add an environment variable, CLI flag, hidden MCP argument, HTTP route, or production test mode for forced failures;
- remove or rewrite the existing human-readable `content` output;
- add compatibility aliases for the former top-level `server_config` fields;
- refactor unrelated parts of `src/server.ts`.

## 3. Current behavior

`server_config` is registered in `src/server.ts` through the common registration path. Its handler builds a safe configuration object and returns it through `textResult`.

Current structured output places configuration fields directly at the top level after `tagToolResult` adds:

- `codexpro_tool`;
- `codexpro_title`.

The tool currently has no exact `outputSchema`. Errors are converted to `isError: true` with a text message and a non-stable `{ error: string }` structured object.

## 4. Approved structured result contract

### 4.1 Top-level envelope

`server_config.structuredContent` will contain exactly these contract groups:

```text
codexpro_tool
codexpro_title
ok
data
error
meta
```

Tool identity remains at the top level because existing CodexPro cards and generic result presentation use it to select rendering behavior.

Tool-specific configuration fields move under `data` and are not duplicated at the top level.

### 4.2 Success result

A successful result has:

```json
{
  "codexpro_tool": "server_config",
  "codexpro_title": "Server Config",
  "ok": true,
  "data": {
    "defaultRoot": "...",
    "allowedRoots": [],
    "host": "127.0.0.1"
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

The example is illustrative. The exact `data` schema must enumerate every safe configuration field currently returned by `server_config`, including nested structures and nullable fields.

### 4.3 Failure result

A failure has:

```json
{
  "codexpro_tool": "server_config",
  "codexpro_title": "Server Config",
  "ok": false,
  "data": null,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Redacted human-readable message",
    "retryable": false,
    "details": {}
  },
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

The enclosing MCP result also retains:

- `isError: true`;
- human-readable `content`;
- existing redaction behavior.

Unknown exceptions must not expose stack traces, tokens, secrets, authorization material, or sensitive paths through either `message` or `details`.

## 5. Metadata contract

The first schema version defines `meta` with exactly:

- `schemaVersion`;
- `durationMs`;
- `warnings`.

Rules:

- `schemaVersion` is the integer `1`.
- `durationMs` is a non-negative number measured at the common tool wrapper boundary.
- `warnings` is always an array of strings and defaults to `[]`.
- `requestId` is omitted. A random tool-call ID must not be presented as an HTTP or MCP transport request identity.

A future transport-aware identity requires a separately reviewed schema change.

## 6. Stable error contract

The reusable error object contains:

- `code: string`;
- `message: string`;
- `retryable: boolean`;
- `details: object`.

The first slice introduces only one code:

```text
INTERNAL_ERROR
```

This is intentionally narrow. Later tool migrations introduce their own stable codes only when their behavior is migrated and tested.

`retryable` defaults to `false`. A future tool may use `true` only when retry safety is explicitly designed and verified.

`details` defaults to `{}`. The first slice does not include raw exceptions, stack traces, config objects, or environment details.

## 7. Schema ownership

Implementation creates:

```text
src/tools/schemas/common.ts
src/tools/schemas/serverConfig.ts
```

### 7.1 `common.ts`

Owns only tool-agnostic Phase 1 contracts:

- schema version constant;
- metadata schema;
- stable error schema;
- reusable success/failure envelope primitives or minimal schema factory;
- TypeScript types inferred from Zod.

It must not contain `server_config` fields.

### 7.2 `serverConfig.ts`

Owns:

- exact `server_config` data schema;
- complete success and failure output schema for `server_config`;
- inferred TypeScript types for the data and full result;
- any narrowly scoped construction helpers required by this tool.

The implementation must avoid parallel handwritten interfaces that can drift from the Zod schema.

## 8. Construction and data flow

The intended flow is:

```text
server_config registration
    ↓
normal safe-config data provider
    ↓
server_config result builder
    ↓
strict success envelope
    ↓
common wrapper adds measured duration
    ↓
MCP result with unchanged text content
```

Failure flow:

```text
server_config data provider throws
    ↓
common/server_config construction boundary catches
    ↓
redacted INTERNAL_ERROR envelope
    ↓
MCP result with isError: true and text content
```

The exact placement of duration injection may follow the existing wrapper implementation, but the final structured result must contain the measured value and pass the advertised schema.

## 9. MCP registration

The `server_config` tool descriptor must advertise its exact `outputSchema`.

The installed MCP SDK representation must be verified during implementation. The schema passed to registration and the schema used in contract validation must derive from the same source of truth.

The first slice must not modify descriptors for other tools.

Fallback SDK compatibility in `registerToolCompat` must continue to work. The design must not silently drop `outputSchema` on the supported `registerTool` path.

## 10. Tool card compatibility

The CodexPro tool card currently reads `server_config` fields from the structured result top level.

It must change only for `server_config` so it reads from:

```text
data.toolMode
data.bashMode
data.bashSessionId
```

A defensive fallback to the old top-level shape is not part of the approved contract unless implementation evidence proves it is required for an actual supported rendering path.

No unrelated card behavior should change.

## 11. Test design

Create:

```text
test/server-config-contract.test.mjs
```

Use Node's built-in `node:test` and existing project conventions.

### 11.1 Success contract

The test must verify:

- the actual registered `server_config` handler returns `ok: true`;
- configuration values are under `data`;
- former configuration fields are not duplicated at the top level;
- `error` is `null`;
- `meta.schemaVersion` is `1`;
- `meta.durationMs` is non-negative;
- `meta.warnings` is an array;
- the structured result validates against the exact schema;
- the human-readable `content` remains present.

### 11.2 Failure contract

Use a pure construction boundary or handler factory with an injectable data provider.

Production wiring supplies the normal provider. The test supplies a provider that throws.

The test must verify:

- `ok: false`;
- `data: null`;
- `error.code: "INTERNAL_ERROR"`;
- `error.retryable: false`;
- `error.details` is `{}`;
- the message is redacted;
- no stack trace or injected secret appears;
- `isError: true` remains present;
- human-readable `content` remains present;
- the structured failure validates against the exact schema.

The injection seam must not be exposed through environment variables, command-line flags, HTTP, MCP inputs, or public configuration.

### 11.3 Registration contract

The test must verify the actual MCP descriptor for `server_config` contains the intended `outputSchema`.

It must test registration behavior, not only import and parse a standalone schema object.

### 11.4 Regression verification

After the narrow test passes, run:

1. the new contract test;
2. existing focused tool/server tests affected by registration or result wrapping;
3. build/typecheck;
4. smoke suite;
5. `git diff --check`;
6. secret-pattern review;
7. intended-file review.

## 12. Compatibility policy

Compatibility retained:

- existing human-readable MCP `content`;
- MCP `isError` on failure;
- tool name and title;
- safe configuration payload values;
- existing authentication, transport, workspace, and shell behavior.

Deliberate structured compatibility change:

- `server_config` configuration fields move from the top level into `data`.

This is accepted because the first slice is explicitly establishing the stable Phase 1 contract. No duplicate transitional aliases are included.

## 13. Expected implementation scope

Expected source/test changes are limited to:

```text
src/tools/schemas/common.ts
src/tools/schemas/serverConfig.ts
src/server.ts
src/toolCardWidget.ts
test/server-config-contract.test.mjs
Memory.md
docs/memory/archive/phase-1.md
```

Additional files require a documented reason and separate scope review.

No dependency addition is expected because the repository already uses Zod and `node:test`.

## 14. Acceptance criteria

The slice is complete only when all of the following are true:

- `server_config` advertises an exact `outputSchema`.
- Actual success and failure structured outputs validate against it.
- Success uses `ok: true`, populated `data`, and `error: null`.
- Failure uses `ok: false`, `data: null`, and stable `INTERNAL_ERROR`.
- Metadata is exactly version, duration, and warnings.
- Existing text output remains available.
- Failure retains `isError: true`.
- The tool card renders the new `data` shape.
- No other tool's structured result changes.
- No production test backdoor exists.
- Narrow tests, build, smoke, and diff checks pass.
- No secret-looking values are introduced.
- `Memory.md` and the Phase 1 archive are updated.

## 15. Rollback

The implementation must be independently reversible.

Rollback restores together:

- the former `server_config` structured output;
- removal of its advertised `outputSchema`;
- the former tool-card field access;
- removal of the new contract test and schema files if unused elsewhere.

No user configuration, credentials, profiles, workspaces, or remote state is changed by this slice.
