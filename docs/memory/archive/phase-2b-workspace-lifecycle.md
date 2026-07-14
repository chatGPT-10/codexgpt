# Phase 2B Workspace Lifecycle and Isolation

Date: 2026-07-14
Status: implemented and locally accepted; unstaged, uncommitted, and unpublished
Primary platform: native Windows

## STEP-254 — Design the workspace lifecycle boundary

Phase 2B began from the security property that a workspace is not merely a canonical filesystem root. It is an authorization capability issued inside one MCP lifecycle domain.

The approved design separates two identifiers:

- `workspaceKey`: a stable internal key derived from the canonical native root, with Windows case folding, used only for manager-local deduplication;
- `workspaceId`: a cryptographically random opaque `ws_<32 hex>` public handle used by tools.

The design forbids path-derived public identifiers, process-global manager sharing, core default-workspace fallback, and cross-session handle reuse. It retains omitted-`workspace_id` behavior for one compatibility cycle only through the explicitly named `resolveWorkspace()` boundary.

Design record:

- `docs/superpowers/specs/2026-07-14-phase-2b-workspace-lifecycle-design.md`
- `docs/superpowers/plans/2026-07-14-phase-2b-workspace-lifecycle.md`

## STEP-255 — Implement the lifecycle registry with TDD

The first RED run exposed the exact legacy behavior:

- public IDs were deterministic path hashes;
- separate managers returned the same ID for the same root;
- `getWorkspace()` silently selected the default root;
- close, expiry, revocation, and policy-revision invalidation did not exist.

`src/guard.ts` now provides a session-local `WorkspaceManager` with:

- random opaque workspace handles;
- stable private workspace keys;
- strict `getWorkspace(id)`;
- explicit compatibility `resolveWorkspace(id?)`;
- same-session active-handle reuse;
- sliding idle expiry;
- immediate close;
- transport-wide and policy-revision revocation;
- bounded tombstones;
- canonical native-realpath and allowed-root enforcement before registration.

`CODEXPRO_WORKSPACE_TTL_MS` is bounded from 60 seconds to 24 hours and defaults to the configured HTTP session TTL, normally 30 minutes.

Focused lifecycle tests proved:

- Windows case-insensitive and non-Windows case-sensitive key semantics;
- same-root reuse within one manager;
- different handles across managers;
- foreign-handle rejection;
- strict missing-ID rejection;
- compatibility-only default selection;
- close/reopen rotation;
- expiry and sliding refresh;
- policy and transport revocation.

## STEP-256 — Remove process-global sharing and bind request context

`src/server.ts` no longer contains a process-global `workspaceManagers` registry. Every `createCodexProServer()` invocation owns a new manager.

This matches transport architecture:

- each HTTP MCP transport session receives its own server and manager;
- one STDIO process receives one server and manager;
- legacy mode still receives lifecycle isolation even when Policy Kernel is not installed;
- shadow/enforce mode additionally binds the manager to the safe RequestIdentity projection, transport session ID, and live policy revision diagnostics.

Existing tool handlers now call `resolveWorkspace()` only at the centralized compatibility boundary. Explicit IDs use strict lookup. Policy resource construction follows the same rule.

Integration tests create two independent in-memory MCP servers with identical configuration and prove that:

- the same canonical root receives different handles;
- the second server cannot use the first server's handle;
- omitted legacy input resolves only the current server's configured default root;
- `list_workspaces` inventories remain session-local.

## STEP-257 — Add close_workspace as a canonical lifecycle tool

A new strict schema module, `src/tools/schemas/closeWorkspace.ts`, defines the exact result envelope.

Success data contains only:

- `workspace_id`;
- `closed_at`;
- `state: "closed"`.

Unknown, foreign, expired, and already-closed handles return one stable `WORKSPACE_NOT_FOUND` shape containing only a sanitized workspace ID. Root paths, workspace keys, identity bindings, policy revisions, raw credentials, and revocation reasons are not returned.

`close_workspace` is:

- canonical child tool number 28;
- visible in normal minimal, standard, and full modes;
- available through direct and `codexpro` supertool paths using the same registered handler;
- classified R1 with `workspace:open` and `context_only` policy semantics;
- hidden from connection-test mode because it changes session state and that surface remains read-only.

Contract tests prove strict additional-field rejection, all three normal tool modes, direct/supertool parity, immediate invalidation, safe repeated-close failure, and reopen handle rotation.

## STEP-258 — Migrate protected HTTP Smoke compatibility

The protected `scripts/http-smoke.mjs` source remains unchanged. Its exact compatibility loader now performs bounded fail-closed in-memory substitutions for the Phase 2B lifecycle.

The HTTP Smoke path proves:

- independent HTTP sessions receive different opaque handles;
- a fresh session starts with an empty workspace inventory;
- a copied foreign handle returns `WORKSPACE_NOT_FOUND`;
- a session opens and uses its own local handle for snapshot, tree, context, and Pro-context export;
- connection-test does not expose the state-changing close tool.

CRLF/LF source differences are handled by one bounded unique-match lifecycle pattern. Any protected-source drift fails closed.

## STEP-259 — User-facing documentation

Updated:

- `config.example.env` with `CODEXPRO_WORKSPACE_TTL_MS` bounds and defaults;
- `FAQ.md` with session-scoped handle, close, expiry, and compatibility behavior;
- `FAQ_ZH.md` with the equivalent Chinese explanation.

The documentation does not claim OAuth-grade human ownership. Until Phase 8, isolation is accurately described as MCP transport/credential and server-session isolation.

## Local verification evidence

The completed implementation passed:

- focused lifecycle and close-workspace tests;
- TypeScript Build;
- complete Node regression suite: 542 tests, 541 pass, 0 fail, and 1 established platform-conditional skip;
- all eight Smoke segments;
- native-Windows Stress;
- `npm pack --dry-run`, producing a 197-file package that includes the new built schema and excludes internal memory/spec/plan records;
- static searches proving no `workspaceManagers` or `workspaceIdForRoot` implementation remains and no optional core `getWorkspace` call exists.

The exact final regression count is recorded in root `Memory.md` after the last verification run.

## Remaining limitations

- Lifecycle state is intentionally process-local and is not persisted across server restart.
- There is no OAuth owner identity yet; shared-secret identities cannot identify a human subject.
- Omitted `workspace_id` remains available for one compatibility cycle at the explicit server boundary.
- Filesystem TOCTOU remains reduced rather than eliminated and is addressed by later atomic-operation phases.
- Session manager disposal relies on transport/server lifetime plus idle pruning; no public cross-process migration exists.
- No staging, commit, push, release, or exact-head CI check has been performed for Phase 2B.

## Next controlled action

Review the final unstaged diff. After explicit user approval, run the requested cleanup/reconciliation step, then stage, commit, push, and verify exact-head CI. Phase 3 must not be treated as published work until Phase 2B publication is closed.

## STEP-260 — Neat-freak reconciliation

**Status:** Complete locally; unstaged, uncommitted, unpublished, and without exact-head CI evidence.

**Goal:** Reconcile active project rules, user documentation, security guidance, release notes, memory, and the Phase 2B implementation after local acceptance without rewriting historical archives.

**Files changed:** `AGENTS.md`, `CHANGELOG.md`, `README.md`, `README_ZH.md`, `SECURITY.md`, `Memory.md`, `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/memory/archive/phase-2b-workspace-lifecycle.md`, and `src/guard.ts`.

**Implementation summary:** Added the workspace-lifecycle invariants and current stopping point to `AGENTS.md`; documented session-scoped handles, `close_workspace`, sliding TTL, and the compatibility boundary in both READMEs and `SECURITY.md`; added current Policy Kernel and workspace-lifecycle entries to `CHANGELOG.md`; aligned the master plan and memory index; preserved old Phase 1/2A specifications and append-only archives as historical facts; removed the unused `lastSeenAtMs` field because `expiresAtMs` is the sole sliding-expiry state.

**Verification commands:**

- `node --test test/workspace-lifecycle.test.mjs test/close-workspace-contract.test.mjs test/auth-documentation.test.mjs test/package-contents.test.mjs`
- `npm run build`
- `node --test test/*.test.mjs`
- `npm run smoke`
- `npm pack --dry-run`

**Verification results:** Focused lifecycle/documentation/package contracts passed 22/22. TypeScript Build passed. Complete regression ran 542 tests with 541 pass, 0 fail, and 1 established platform-conditional skip. All eight Smoke sections passed. Package dry-run passed with 197 files and continued to exclude internal memory, specification, and plan records.

**Decisions made:** Keep active rules concise but explicit about the no-global-manager and strict-lookup boundaries. Treat old references to 27 canonical tools or Phase 2B as future work inside closed specs/archives as historical evidence, not stale active documentation. Do not edit Codex automatic memory outside the repository. Do not stage, commit, push, or begin Phase 3 publication work in this step.

**Risks or limitations:** Exact-head Ubuntu/Windows Node 20/24 CI remains pending. `AGENTS.md` remains below its soft size limits but is above 70% of the 15 KB advisory byte budget, so future rule additions should replace or compress existing text where possible.

**Rollback method:** Revert only the STEP-260 documentation/rule changes and restore the redundant internal timestamp field if necessary; no public schema, handle format, lifecycle behavior, or persisted user data depends on this reconciliation.

**Next step:** After explicit user approval, stage the reconciled Phase 2B diff, commit, push, and verify exact-head CI. Do not treat Phase 3 as published work until that closure succeeds.
