# Phase 2B Workspace Lifecycle Design

Date: 2026-07-14
Status: approved for implementation by the recorded Phase 2B authorization
Primary platform: native Windows

## 1. Problem statement

Phase 2A established request identity and policy context, but the current workspace registry still violates the intended security model:

- `workspaceId` is a deterministic hash of the canonical root, so it is a path-derived identifier rather than an opaque capability.
- all server instances with the same configuration share one process-global `WorkspaceManager`;
- `WorkspaceManager.getWorkspace()` silently opens or returns the default workspace when no identifier is provided;
- workspace bindings have no close, expiry, revocation, or cleanup lifecycle;
- a transport session can therefore reuse a workspace identifier created by another session.

The essential Phase 2B change is to turn a workspace from a process-level convenience record into a session-scoped authorization capability.

## 2. Security invariants

1. A public `workspaceId` is random, opaque, and not derivable from a filesystem path.
2. A stable `workspaceKey` is derived from the canonical native root and is used only for local deduplication and identity checks.
3. Each MCP server instance owns one independent workspace lifecycle domain. HTTP already creates one server per MCP transport session; STDIO creates one server per process session.
4. A workspace handle can be resolved only inside the manager that issued it.
5. Closing, expiry, session shutdown, or policy invalidation makes a handle unusable immediately within that lifecycle domain.
6. `getWorkspace(id)` is strict and never accepts an omitted identifier.
7. Legacy omission of `workspace_id` is handled only by an explicit one-cycle compatibility resolver at the tool boundary.
8. Allowed roots, native realpath resolution, blocked paths, and Windows path safety remain authoritative and fail closed.
9. Static Token identity is not represented as a human identity. Phase 2B provides transport/credential isolation, not OAuth-grade per-human isolation.

## 3. Identifier model

### 3.1 workspaceKey

`workspaceKey` has the form `wk_<24 hex characters>` and is the SHA-256 prefix of a platform-normalized canonical root:

- native `realpath` is resolved first;
- Windows comparison is case-insensitive by lowercasing the canonical path before hashing;
- separators are normalized for stable comparison;
- the key is stable for the same canonical root on the same platform.

It is not accepted as a tool argument and is not a replacement for `workspaceId`.

### 3.2 workspaceId

`workspaceId` has the form `ws_<32 lowercase hex characters>` generated from cryptographically secure random bytes. It is:

- unique per active lifecycle domain;
- stable while the same workspace remains active in that domain;
- replaced after close, expiry, or revocation followed by reopen;
- never reconstructed from the root or `workspaceKey`.

## 4. Workspace record and states

An internal workspace record contains:

- public `id`;
- stable `key`;
- canonical `root`;
- `openedAt`;
- `lastSeenAt`;
- `expiresAt`;
- issuing `transportSessionId`;
- issuing safe identity binding fingerprint;
- policy revision binding when available.

Active records are held in two indexes: `workspaceId -> record` and `workspaceKey -> workspaceId`.

Terminal states are represented by bounded tombstones for deterministic internal tests and cleanup accounting. Public tool failures do not disclose whether an unknown handle was never issued, belonged to another session, expired, or was revoked.

## 5. Lifetime and cleanup

The default idle lifetime is configured by `CODEXGPT_WORKSPACE_TTL_MS`; it defaults to the HTTP session TTL and is bounded from one minute to 24 hours.

- Successful resolution refreshes `lastSeenAt` and `expiresAt`.
- Opening the same canonical root returns the existing active handle and refreshes it.
- Every open, get, list, or close operation prunes expired records first.
- `closeWorkspace(id)` revokes the selected handle.
- `revokeAll(reason)` invalidates every active workspace in the lifecycle domain.
- `revokeForPolicyRevision(revision)` invalidates workspaces bound to a different policy revision.
- tombstones are bounded to prevent unbounded process memory growth.

## 6. Session and identity binding

The manager receives a session binding at construction:

- `transportSessionId()` returns the current validated transport session identifier;
- the identity binding fingerprint is computed only from safe `RequestIdentityV1` fields and never contains a raw credential;
- the active policy revision may be supplied by the policy runtime.

For compatibility tests and direct in-memory server construction, the server creates a private local-process session binding when no transport source is supplied. It is unique per server instance.

Because the registry is no longer process-global, even a guessed or copied identifier cannot resolve in another session's manager.

## 7. Core API and compatibility boundary

`WorkspaceManager` exposes:

- `openWorkspace(root?)`;
- `getWorkspace(id)` — strict;
- `resolveWorkspace(id?)` — explicit one-cycle compatibility parser;
- `defaultWorkspace()` — explicit default opening used only by open/current and compatibility paths;
- `closeWorkspace(id)`;
- `listWorkspaces()`;
- `revokeAll(reason)`;
- `revokeForPolicyRevision(revision)`.

Existing tool schemas may continue to allow omitted `workspace_id` for one compatibility cycle. Server handlers must call `resolveWorkspace`, while Policy Kernel resource description must use strict `getWorkspace` whenever a workspace ID is present and explicitly request the current default only at the central compatibility boundary.

No filesystem, Git, analysis, shell, handoff, or Pro-context domain service may reconstruct or select a workspace itself.

## 8. close_workspace tool

A new lifecycle tool is available in minimal, standard, and full surfaces.

Input:

- required `workspace_id`.

Success data:

- `workspace_id`;
- `closed_at`;
- `state: "closed"`.

Stable failures:

- `WORKSPACE_NOT_FOUND` for unknown, foreign, expired, or already-closed handles;
- `INTERNAL_ERROR` for an unexpected internal failure.

The tool does not return the root, `workspaceKey`, identity binding, or revocation reason.

## 9. Policy and grant interaction

`close_workspace` uses the existing `workspace:open` lifecycle scope and an R1 context-only policy definition. It does not grant filesystem access.

The current SessionGrantStore already supports transport-session and policy-revision revocation. Phase 2B preserves that model and ensures that no workspace handle survives outside its owning server/session domain. A future live policy reload must call both workspace and grant invalidation methods before accepting side effects under the new revision.

## 10. Compatibility and rollback

Compatibility:

- omitted `workspace_id` continues to resolve to the session-local configured default root for one cycle;
- repeated opens of the same root in one session return one active handle;
- existing open/list output contracts remain unchanged;
- direct and supertool calls share the same registered handler and lifecycle domain.

Rollback may remove the close tool or lifecycle metadata, but must not restore a process-global workspace registry, deterministic path-derived public IDs, or cross-session handle reuse.

## 11. Test matrix

Required deterministic tests:

- stable `workspaceKey` for equivalent canonical roots, including Windows case folding;
- random opaque `workspaceId` not equal to or derived from `workspaceKey`;
- same root reuses an active ID within one manager;
- two managers issue different IDs for the same root;
- a handle from manager A fails in manager B;
- close invalidates immediately and reopen creates a new ID;
- idle expiry invalidates and cleanup removes the active record;
- policy revision invalidation revokes stale workspaces;
- strict `getWorkspace` rejects omitted IDs;
- explicit compatibility resolver still selects the session-local default;
- `close_workspace` exact schema, registration in every tool mode, direct/supertool parity, and safe failures;
- full regression, Build, Smoke, native Windows Stress, package dry-run, static scope, and secret-shape gates.

## 12. Non-goals

Phase 2B does not implement OAuth, persistent workspace storage, cross-process workspace migration, filesystem TOCTOU elimination, OS sandboxing, persistent process ownership, or destructive Git/network operations.
