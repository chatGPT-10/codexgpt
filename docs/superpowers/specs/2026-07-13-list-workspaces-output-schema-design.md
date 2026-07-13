# `list_workspaces` Exact Output Schema Design

**Date:** 2026-07-13
**Phase:** Phase 1
**Slice:** 15
**Status:** Implemented and fully verified locally; publication not started

## 1. Goal

Migrate only the direct `list_workspaces` MCP tool to the established Phase 1 schema-v1 result envelope with:

- an exact advertised `outputSchema`;
- strict nested success data;
- stable redacted failures;
- one test-only workspace-list provider boundary;
- focused contract tests;
- nested Tool Card compatibility;
- `codexpro` supertool compatibility;
- exact fail-closed HTTP Smoke compatibility.

This slice stabilizes the existing process-local workspace inventory. It does not redesign workspace identity, add ownership or expiry, add `close_workspace`, persist workspace sessions, require explicit workspace IDs, or begin Phase 2.

## 2. Why `list_workspaces` is the recommended next tool

The first fourteen Phase 1 slices already stabilize:

1. opening the configured workspace with `open_current_workspace`;
2. opening an authorized root with `open_workspace`;
3. reading rich context with `workspace_snapshot`.

The remaining direct workspace tools are not equal in risk:

- `list_workspaces` is a small in-memory inventory read with no path input, filesystem traversal, Git process, analysis cache, or `.ai-bridge` write;
- `inspect_workspace` introduces analysis inventory, symbols, relationships, cache state, truncation, provider degradation, and a much larger output;
- lifecycle work such as close, expiry, ownership, random IDs, and persistence belongs to Phase 2.

`list_workspaces` is therefore the smallest useful continuation of the workspace protocol and the best next slice for preserving the one-feature-per-slice rule.

## 3. Alternatives considered

### Approach A — Migrate direct `list_workspaces` independently

Add one tool-owned schema, one injectable provider, strict provider/invariant validation, two stable failures, focused tests, nested Tool Card handling, supertool coverage, and one exact HTTP compatibility substitution.

**Advantages**

- Smallest remaining workspace contract.
- No new dependency or external process.
- Independently reversible.
- Preserves current cross-session shared inventory semantics.
- Establishes a stable contract before Phase 2 changes workspace lifecycle.

**Disadvantages**

- The schema intentionally stabilizes current process-local semantics that Phase 2 will later version or replace.

**Decision:** Recommended and approved.

### Approach B — Migrate `inspect_workspace` next

This would stabilize a higher-value repository-analysis result.

**Rejected because:** its result and failure surface are substantially wider. It couples analysis inventory, cache, file/symbol/relationship limits, provider degradation, path scoping, and Tool Card rendering in one slice. It should follow the smaller inventory contract.

### Approach C — Extract shared workspace schemas and begin lifecycle redesign

This would introduce shared workspace item types, random session IDs, ownership, expiry, close behavior, or persistence before migrating the direct list tool.

**Rejected because:** it crosses into Phase 2, expands rollback scope, and changes semantics instead of first stabilizing the existing protocol.

### Approach D — Combine `list_workspaces` with `codexpro_inventory`

Both are inventory-style tools.

**Rejected because:** they inventory different domains. `list_workspaces` exposes process-local workspace state, while `codexpro_inventory` scans Skills and MCP configuration. Combining them violates the single-feature boundary.

## 4. First-principles model

A reliable workspace-list contract must answer four questions:

1. **What is being listed?**
   The workspaces currently held by the shared in-memory `WorkspaceManager` for one normalized server configuration.

2. **What is guaranteed on success?**
   An ordered array of exact workspace records plus a derived count.

3. **How can it fail safely?**
   Provider invocation failure is distinct from malformed internal output, and neither exposes exception text, stacks, roots from failed data, credentials, or diagnostics.

4. **What is explicitly not promised?**
   Persistence across process restarts, client ownership, expiry, close semantics, random session identity, or authorization isolation.

The migration must preserve current behavior and make only the public result protocol exact.

## 5. Existing behavior to preserve

The direct tool currently:

- is registered only in `tool_mode=full`;
- accepts no arguments;
- reads `WorkspaceManager.listWorkspaces()`;
- returns an empty list before a workspace is opened;
- preserves the `Map` insertion order;
- returns each internal workspace as `{ id, root, openedAt }`;
- derives `count` from the array length;
- returns a human-readable line per workspace, including the canonical root and opening timestamp;
- uses a process-local workspace manager shared by MCP sessions with the same normalized server configuration;
- returns flat structured fields;
- has no exact `outputSchema`;
- lets uncaught exceptions fall through the generic wrapper.

The migration preserves all of these semantics except the flat structured result and generic failure surface.

## 6. Scope

### 6.1 In scope

- Direct `list_workspaces` only.
- Exact tool-owned schema-v1 envelope.
- Exact success data with `workspaces` and `count`.
- Exact workspace item fields `id`, `root`, and `openedAt`.
- Empty-list success.
- Preservation of provider order.
- Duplicate ID/root rejection.
- Exact ISO-8601 timestamp validation.
- One injected `listWorkspacesProvider` boundary for tests.
- Two stable non-retryable failures.
- Nested Tool Card rendering plus historical flat fallback.
- `codexpro` supertool direct-action compatibility.
- Exact fail-closed in-memory migration of the protected HTTP Smoke consumer.
- Focused, adjacent, complete, Build, Smoke, Stress, package, and diff verification.
- Design, plan, CHANGELOG, AGENTS map, `Memory.md`, and active Phase 1 archive records.

### 6.2 Out of scope

- `inspect_workspace`.
- `codexpro_inventory`, `load_skill`, `read_handoff`, `codex_context`, or Pro-context tools.
- `close_workspace`.
- Workspace ownership, client isolation, expiry, persistence, or random session IDs.
- Requiring explicit `workspace_id` in other tools.
- Changing deterministic workspace ID generation.
- Changing canonical-root reuse.
- Sorting by root or timestamp.
- Rechecking filesystem existence when listing.
- Redacting canonical roots from successful authenticated results.
- Shared workspace-schema extraction or broad `src/server.ts` refactoring.
- Authentication, OAuth, token, Cloudflare, credential, profile, or allowed-root changes.
- Dependency or lockfile changes.
- Direct edits to `scripts/http-smoke.mjs` or `scripts/smoke.mjs`.
- Phase 2 or Phase 3 work.

## 7. Exact success contract

The top-level result uses the established strict Phase 1 envelope:

```json
{
  "codexpro_tool": "list_workspaces",
  "codexpro_title": "List Workspaces",
  "ok": true,
  "data": {
    "workspaces": [],
    "count": 0
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

### 7.1 Exact `data` fields

Success data contains exactly two fields:

```json
{
  "workspaces": [
    {
      "id": "ws_0123456789abcdef01234567",
      "root": "D:\\Dev\\project",
      "openedAt": "2026-07-13T12:34:56.789Z"
    }
  ],
  "count": 1
}
```

### 7.2 Field rules

| Field | Rule |
|---|---|
| `workspaces` | Required array; may be empty; preserves provider order. |
| `workspaces[].id` | Required non-empty string; unique within the result. Preserve the existing field name. |
| `workspaces[].root` | Required non-empty canonical-root string; unique within the result. Preserve the existing field name. |
| `workspaces[].openedAt` | Required ISO-8601 UTC timestamp produced by `Date.prototype.toISOString()`. Preserve the existing field name. |
| `count` | Required non-negative integer exactly equal to `workspaces.length`; always derived by the handler. |

### 7.3 Why item fields are not renamed

The existing tool exposes `id`, `root`, and `openedAt`. Renaming them to `workspace_id` and `opened_at` would add avoidable consumer churn during a stabilization phase and would pre-empt the Phase 2 identity redesign. This slice therefore preserves the existing item names and only moves them under the exact `data` envelope.

### 7.4 Ordering and filesystem rules

- Preserve `WorkspaceManager` insertion order.
- Do not sort by root, ID, or timestamp.
- Do not call `realpath`, `stat`, or existence checks during listing.
- A workspace root that is deleted after opening remains an inventory entry until the process lifecycle changes it; Phase 1 does not invent close or cleanup behavior.

### 7.5 No duplicated flat fields

The migrated result must not expose `workspaces`, `count`, or workspace item data at the top level. All success data lives under `structuredContent.data`.

## 8. Stable failure contract

Every failure uses the strict envelope with `data: null`, an exact error, and bounded meta.

### 8.1 `WORKSPACE_LIST_FAILED`

Used only when invoking the workspace-list provider throws or rejects.

```json
{
  "code": "WORKSPACE_LIST_FAILED",
  "message": "The open workspace list could not be collected.",
  "retryable": false,
  "details": {}
}
```

### 8.2 `INTERNAL_ERROR`

Used when the provider returns malformed data, strict parsing fails, duplicate IDs/roots are detected, count invariants fail, or final result construction fails.

```json
{
  "code": "INTERNAL_ERROR",
  "message": "The workspace list failed because of an internal error.",
  "retryable": false,
  "details": {}
}
```

### 8.3 Public failure safety

Failures must not include:

- the thrown exception message;
- stack traces;
- malformed provider roots or timestamps;
- provider output;
- allowed-root lists;
- tokens, credentials, or secret-looking values;
- absolute paths in `details`.

The human-readable text includes only a fixed heading, code, and fixed public message.

## 9. Provider boundary and validation

Add one optional dependency:

```ts
listWorkspacesProvider?: () => Workspace[] | Promise<Workspace[]>;
```

Production default:

```ts
const listWorkspacesProvider =
  dependencies.listWorkspacesProvider ??
  (() => workspaces.listWorkspaces());
```

Processing stages:

```text
record start time
→ invoke listWorkspacesProvider
→ provider throw/reject => WORKSPACE_LIST_FAILED
→ strict-parse array and records
→ reject duplicate id or root
→ preserve order and derive count
→ construct exact schema-v1 success
→ unexpected validation/construction issue => INTERNAL_ERROR
```

The provider is test-only dependency injection, not a production mode, hidden MCP argument, environment switch, or mutable global fixture.

## 10. Tool registration and mode behavior

The descriptor must add:

```ts
outputSchema: listWorkspacesOutputShape
```

Existing behavior remains:

- full mode: registered;
- standard mode: absent;
- minimal mode: absent;
- no input arguments;
- read-only annotations and Tool Card metadata unchanged.

The tool does not auto-open the default workspace. Empty-list success before any open operation is intentional.

## 11. Text response

Preserve the current readable text:

- non-empty list: one line per workspace using `id`, `root`, and `openedAt`;
- empty list: `No workspaces opened on this CodexPro server/config yet. Call open_workspace first.`

Only structured output and failure handling become exact.

## 12. Consumer compatibility

### 12.1 Tool Card

Update `renderWorkspaces` and the subtitle path to consume nested success data first:

```text
data.data.workspaces
data.data.count
```

Requirements:

- render exact nested success;
- render fixed nested error code/message;
- retain historical flat fallback for old saved results;
- never read malformed failure data;
- continue displaying IDs and roots for successful inventory entries.

### 12.2 `codexpro` supertool

A direct action call with `action: "list_workspaces"` must preserve:

- `codexpro_tool: "list_workspaces"`;
- `codexpro_title: "List Workspaces"`;
- `codexpro_super_action: "list_workspaces"`;
- `wrapped_tool: "list_workspaces"`;
- the exact nested `data`/`error`/`meta` envelope.

### 12.3 Protected HTTP Smoke

Do not edit `scripts/http-smoke.mjs` directly. Extend `scripts/http-smoke-compat.mjs` with one exact-once substitution:

```text
list.structuredContent.workspaces.map
→ list.structuredContent.data?.workspaces.map
```

The loader must remain fail-closed when the protected source drifts and must not write transformed source to disk.

`scripts/smoke.mjs` currently requires no direct `list_workspaces` result migration; it only checks full-mode registration. Keep the protected file unchanged.

## 13. Test strategy

Create `test/list-workspaces-contract.test.mjs` using the established in-memory MCP pattern.

### 13.1 Pure schema tests

Verify:

- exact tool identity and title;
- exact six top-level fields;
- exact two data fields;
- exact three item fields;
- empty and populated success;
- exact meta;
- both fixed failures;
- rejection of flat fields, extra fields, empty values, invalid timestamps, negative/mismatched count, duplicate IDs, duplicate roots, malformed error details, and invalid success/failure combinations.

### 13.2 Descriptor and mode tests

Verify:

- exact advertised `outputSchema` in full mode;
- absence in standard and minimal modes;
- no input fields were added.

### 13.3 Handler tests

Verify:

- empty-list success before opening a workspace;
- real manager success after `open_current_workspace`;
- canonical root and ISO timestamp preservation;
- insertion order across two authorized roots;
- shared inventory across two MCP sessions using the same server configuration;
- provider order preservation;
- provider throw/reject => `WORKSPACE_LIST_FAILED`;
- malformed array/item/timestamp/duplicate => `INTERNAL_ERROR`;
- raw provider diagnostics are absent from text and structured output.

### 13.4 Consumer tests

Verify:

- Tool Card nested success;
- Tool Card nested failure;
- Tool Card historical flat fallback;
- supertool direct action preserves the nested envelope;
- compatibility loader contains the exact-once protected-source migration;
- standalone HTTP Smoke and complete Smoke pass.

## 14. Planned files

### Create

- `src/tools/schemas/listWorkspaces.ts`
- `test/list-workspaces-contract.test.mjs`

### Modify during implementation

- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/http-smoke-compat.mjs`
- `CHANGELOG.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-3.md`
- this design document
- `docs/superpowers/plans/2026-07-13-list-workspaces-output-schema.md`

### Must remain unchanged

- `src/guard.ts`
- `scripts/smoke.mjs`
- `scripts/http-smoke.mjs`
- `package.json`
- `package-lock.json`
- authentication, profile, Cloudflare, and Phase 2 files.

## 15. Verification gates

Required local gates:

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
show_changes(include_diff=true)
```

After separately approved publication:

- exact staged diff check;
- precise commit;
- push to `origin/main`;
- exact-head Ubuntu/Windows Node 20/24 GitHub Actions verification;
- separate publication record if required by the established workflow.

## 16. Rollback

Before publication:

- remove only `src/tools/schemas/listWorkspaces.ts` and `test/list-workspaces-contract.test.mjs`;
- revert only the `list_workspaces` imports, dependency/provider, descriptor, handler, Tool Card branch, HTTP compatibility substitution, and slice records;
- do not alter published Phase 1 schemas, workspace-manager behavior, credentials, profiles, protected Smoke sources, or prior archives.

After publication, use a normal revert commit. Do not reset or rewrite `main`.

## 17. Risks and limitations

- The contract intentionally preserves deterministic process-local IDs and shared inventory because Phase 2 is not open.
- Successful results expose canonical roots as the current authenticated personal tool already does.
- Provider validation duplicates a small amount of workspace-item checking to keep rollback local.
- `src/server.ts` remains above the configured direct-read limit and requires targeted inspection/editing.
- The HTTP compatibility loader remains coupled to exact protected-source strings and fails closed on drift.
- There is no close, expiry, ownership, persistence, or client isolation in this slice.

## 18. Approved decisions

- Select `list_workspaces` as Phase 1 Slice 15.
- Use an independent one-tool migration.
- Preserve item names `id`, `root`, and `openedAt`.
- Preserve empty-list success and insertion order.
- Preserve cross-session shared process-local inventory.
- Use one provider boundary and two fixed non-retryable errors.
- Keep the tool full-mode only.
- Keep protected Smoke sources unchanged.
- Keep Phase 2 closed.

## 19. Stopping point

The design is approved and the detailed implementation plan is prepared. No production source, test, dependency, authentication, profile, credential, Cloudflare, tool-mode, workspace-lifecycle, staging, commit, push, or Phase 2 change is authorized by this document alone.
