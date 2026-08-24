# OAuth Cross-Transport Workspace Capability TDD Implementation Plan

Date: 2026-08-16
Status: STEP-493 Tasks 0–6 implemented and locally verified; STEP-494 Task 7/fresh ChatGPT Web A1 passed and closed the STEP-490 regression gate; STEP-495 later completed the matched successor-adjusted A2 pair outside this plan, while further benchmark/P1 work remains separately gated
Design authority: `docs/superpowers/specs/2026-08-16-oauth-cross-transport-workspace-capability-design.md`
Trigger: STEP-490 real ChatGPT Web A1 `WORKSPACE_NOT_FOUND` after transport rotation

## Goal

Make one explicitly opened OAuth workspace capability survive real ChatGPT Web MCP transport/session rotation while preserving opaque random handles, exact OAuth principal binding, policy/TTL/close/revoke invalidation, PathGuard authority, and legacy/STDIO isolation.

The target contract is:

```text
transport A: open_workspace(target) -> workspace_id W
transport B: read(package.json, workspace_id=W) -> same target, success
```

No default-workspace fallback is permitted. STEP-494 recorded the required real A1 pass; later benchmark progression follows `docs/benchmarks/chatgpt-web-e2e/` and separate owner authorization.

Implementation checkpoint (2026-08-16): Tasks 0–7 are complete. The primary RED reproduced `WORKSPACE_NOT_FOUND`; the successor integration is GREEN for cross-transport reuse/dedupe, same-grant refresh, issuing-transport close, cross-client/grant isolation, cross-transport close, PathGuard, direct/supertool parity, capacity, process-local restart semantics, OAuth-only composition, and `session_local` rollback. Managed Windows Node 20.20.2 and 24.15.0 focused/build, ordinary domains, and all eight protected Smoke segments pass; STEP-494 supplied the required fresh ChatGPT Web acceptance.

## Architecture under test

The implementation target is one in-memory `WorkspaceCapabilityRegistry` owned by one `OAuthReadOnlyMcpRuntime`/deployment incarnation and explicitly injected into every per-transport production server. The public handle remains `ws_<32hex>`. Legacy/query-token and STDIO continue to use the historical session/process-local workspace lifecycle.

The OAuth capability principal is the exact current request-local tuple:

```text
deployment binding
+ deployment incarnation
+ ownerRef
+ clientRef
+ resource
+ grantId
+ grantRevision
```

Policy revision is a separate capability validity epoch. Transport session ID, token ID/fingerprint, refresh generation, path, default root, and scopes alone are not continuity authority.

## Global constraints

- Characterization and RED tests come before runtime changes.
- Do not modify V1-V5 public tool names/counts or `open_workspace` / `close_workspace` schemas for this slice.
- Keep the public `workspace_id` format `ws_<32 lowercase hex>`.
- An explicit unresolved handle always fails; it never falls back to `defaultWorkspace()`.
- `allowedRoots`, native realpath, blocked paths, PathGuard, Policy Kernel, atomic transaction, semantic authority, and Git/process boundaries remain authoritative.
- Foreign principal lookup/close must be side-effect free: it cannot touch, close, revoke, or reveal the legitimate record.
- The shared registry is an OAuth runtime instance dependency, never a module/process-global singleton.
- Configured-root workspace capabilities are the only Phase 2B records migrated to the shared backend. Confirmed-root and task-worktree authorities retain their existing independently reviewed ownership/lifecycle contracts.
- Transport close detaches transport-local observers/resources but does not revoke OAuth shared configured-root capabilities.
- OAuth runtime/process shutdown clears the registry. Successor v1 does not persist workspace capabilities across restart.
- Shared configured-root storage is capped at 64 live capabilities per exact principal and 256 per OAuth runtime; capacity failure never evicts a live handle and uses the existing `WORKSPACE_OPEN_FAILED` contract.
- No staging, commit, push, publish, credential migration, Cloudflare/Tunnel/DNS mutation, or benchmark A2/candidate work is part of this plan.

---

## Task 0 — Characterize current behavior and establish RED

**Files:**

- Preserve/extend: `test/workspace-lifecycle.test.mjs`
- Extend: `test/phase-8-mcp-auth-integration.test.mjs`
- Create: `test/oauth-cross-transport-workspace-capability.test.mjs`
- Read-only evidence: `docs/benchmarks/chatgpt-web-e2e/runs/2026-08-16-baseline-a1.json`

### Step 0.1 — Freeze historical non-OAuth/session-local characterization

Before changing runtime code, keep or add explicit tests proving:

- two ordinary in-memory `createCodexGPTServer()` instances do not share workspace handles;
- STDIO/process-local behavior stays isolated;
- legacy/query-token HTTP transport/session behavior stays isolated;
- omitted `workspace_id` remains only the existing compatibility path;
- an explicitly supplied unknown/stale ID never falls back to the configured default;
- same-root reuse inside one historical lifecycle domain still works;
- close, TTL, policy revision, and `beforeWorkspaceUse` behavior remain characterized.

These tests must remain GREEN before the successor implementation starts.

### Step 0.2 — Add a real OAuth two-transport characterization harness

Use the existing Phase 8 synthetic OAuth runtime helpers. Establish one owner, one approved DCR client, one active OAuth grant, and two separate MCP transports initialized with valid bearer requests from that same grant.

The harness must expose the distinct `Mcp-Session-Id` values and confirm both transport records belong to the same:

```text
ownerRef / clientRef / resource / bindingId / incarnationId / grantId
```

Do not mock `WorkspaceManager` at this integration boundary.

### Step 0.3 — Write the primary STEP-490 RED test

On transport A:

```text
open_workspace(target, include_tree=false) -> W
```

On transport B, explicitly call:

```text
read(path="package.json", workspace_id=W)
```

Assertions:

- expected successor behavior is success;
- returned read data belongs to the exact target root;
- the configured/default root is not selected as fallback;
- no second `open_workspace` occurs.

Expected before implementation: **RED with `WORKSPACE_NOT_FOUND`**, reproducing the real STEP-490 failure through the synthetic OAuth transport-rotation path.

### Step 0.4 — Write principal-isolation RED/characterization tests

For a handle issued under principal P, cover all of these independently:

1. different OAuth owner -> `WORKSPACE_NOT_FOUND` or the existing equivalent non-oracular tool failure;
2. same owner, different DCR client -> same failure;
3. same owner/client, different grant -> same failure;
4. different deployment binding -> same failure;
5. different deployment incarnation -> same failure;
6. same grant after routine access-token refresh -> capability remains usable;
7. guessed random `ws_<32hex>` -> exactly the same public lookup failure shape as a copied foreign handle.

After each foreign lookup/close attempt, prove the legitimate principal can still resolve the original handle. This is the regression that prevents a shared-registry capability-DoS bug.

### Step 0.5 — Write lifecycle RED tests

Cover:

- policy revision R -> R+1 makes the old capability fail closed;
- `close_workspace(W)` from another transport of the same principal invalidates W immediately for all later transports;
- close followed by reopen creates a new random handle;
- sliding TTL is refreshed by successful cross-transport resolve;
- failed foreign/stale lookups do not refresh TTL;
- expiry removes W and later lookup fails;
- transport A close does **not** revoke W in transport B;
- OAuth runtime/process replacement creates an empty registry, so W fails after restart by design;
- list operations expose only configured-root capabilities belonging to the exact current OAuth principal and current policy revision;
- after expiry pruning, the 65th live configured-root capability for one exact principal fails open with existing `WORKSPACE_OPEN_FAILED` without evicting any of the first 64;
- across principals, the 257th live configured-root capability for one OAuth runtime likewise fails non-oracularly without evicting a live handle.

### Step 0.6 — Write path/security boundary tests

Issue a valid handle for an allowed root, then prove:

- paths outside that workspace remain rejected by PathGuard/resource resolution;
- symlink/junction/native-realpath escape checks are unchanged;
- having W does not allow opening or addressing a sibling allowed root without separately opening it;
- policy/scope denial remains authoritative after workspace resolution;
- no failure payload contains canonical root, `workspaceKey`, owner/client/grant/deployment binding, principal digest, or revocation reason.

### Step 0.7 — Write handler parity tests

Using the same handle across transport rotation, prove:

- direct `read` succeeds;
- closed-world `codexgpt` -> `read` succeeds with the same result semantics;
- `close_workspace` invalidation applies equally to both paths;
- existing V1-V5 schema/tool-count contracts remain unchanged.

### Step 0.8 — Run the pre-implementation test gate

Run the existing characterization separately from the intentional RED tests so failures are attributable:

```powershell
npm run test:focused -- test/workspace-lifecycle.test.mjs test/open-workspace-contract.test.mjs test/close-workspace-contract.test.mjs
```

Expected: existing characterization GREEN.

Then run:

```powershell
npm run test:focused -- test/oauth-cross-transport-workspace-capability.test.mjs test/phase-8-mcp-auth-integration.test.mjs
```

Expected before implementation:

- the newly added cross-transport same-principal continuity tests are RED with the current `WORKSPACE_NOT_FOUND` behavior;
- historical OAuth authentication/session-isolation tests remain GREEN;
- record the exact failing assertion(s); do not weaken them to make current behavior pass.

---

## Task 1 — Implement the shared capability registry core

**Files:**

- Prefer create: `src/workspace/capabilityRegistry.ts`
- Modify minimally: `src/guard.ts`
- Test: `test/oauth-cross-transport-workspace-capability.test.mjs`

### Step 1.1 — Define the internal principal and registry contract

Add an internal, non-public contract equivalent to:

```ts
interface OAuthWorkspaceCapabilityPrincipalV1 {
  authDomain: "oauth";
  deploymentBindingId: string;
  deploymentIncarnationId: string;
  ownerRef: string;
  clientRef: string;
  resource: string;
  grantId: string;
  grantRevision: number;
}
```

The registry interface must make principal/policy explicit for every stateful operation. It must not expose path-derived lookup:

```ts
issueOrReuse(root, principal, policyRevision)
resolve(workspaceId, principal, policyRevision)
close(workspaceId, principal, policyRevision)
list(principal, policyRevision)
revokeForPolicyRevision(activeRevision)
dispose()
```

Do not create APIs such as `findByRoot(root)` without the exact principal tuple.

### Step 1.2 — Move configured-root record storage behind the registry

Maintain:

```text
workspace_id -> record
(principalDigest, workspaceKey, policyRevision) -> workspace_id
```

Preserve:

- cryptographic 16-byte random public ID generation;
- native canonical root and internal `workspaceKey`;
- existing sliding TTL bounds;
- bounded tombstones;
- same-principal/same-root active deduplication.

Add non-evicting active-record ceilings exactly as the design specifies: 64 per exact principal and 256 per OAuth runtime. Prune expired records before capacity evaluation; if the ceiling is still reached, fail only the new open through existing `WORKSPACE_OPEN_FAILED` projection.

Different principals must never deduplicate into one public handle.

### Step 1.3 — Implement non-destructive foreign lookup

Required ordering:

```text
lookup id
-> principal match
-> policy revision match
-> expiry
-> beforeWorkspaceUse/readiness
-> touch TTL
-> success
```

If the principal does not match:

- return an opaque miss;
- do not delete the record;
- do not write a tombstone;
- do not emit a revocation event;
- do not refresh TTL.

This differs intentionally from the current `recordMatchesCurrentBinding` path in `src/guard.ts`, which is safe only while each manager owns its own private map.

### Step 1.4 — Make revocation events registry-wide

The shared registry owns configured-root revocation notifications. Per-transport `WorkspaceManager`/semantic consumers subscribe while their server is alive.

When one transport closes/expirs/revokes W legitimately:

- every active subscriber can invalidate its workspace-scoped caches/previews;
- closing one MCP transport only unsubscribes that transport's observers;
- transport disposal does not clear the shared registry.

This prevents cross-transport `close_workspace` from leaving stale semantic/cache state in another transport server.

### Step 1.5 — Preserve the historical local backend

`WorkspaceManager` must still support its private/session-local backend when no shared OAuth registry is injected.

Existing ordinary/legacy/STDIO characterization tests must pass unchanged. Do not make the shared registry the default for all server constructions.

### Step 1.6 — Run registry-focused GREEN tests

Run:

```powershell
npm run test:focused -- test/oauth-cross-transport-workspace-capability.test.mjs test/workspace-lifecycle.test.mjs
```

Expected at this checkpoint:

- deterministic registry/principal/TTL/close tests GREEN;
- OAuth end-to-end continuity may still be RED until Tasks 2-3 wire the dependency.

---

## Task 2 — Make server lifecycle ownership explicit

**Files:**

- Modify: `src/server.ts`
- Modify only for dependency threading: `src/productionRuntime.ts`
- Test: `test/workspace-lifecycle.test.mjs`
- Test: `test/oauth-cross-transport-workspace-capability.test.mjs`

### Step 2.1 — Inject, never discover, the shared registry

Extend the internal server/runtime dependency interfaces with an optional shared configured-root workspace capability dependency plus a request-local capability-principal source.

Rules:

- `createCodexGPTServer()` never looks up a registry from module globals;
- ordinary/legacy/STDIO server construction receives no shared registry;
- OAuth transport-created servers receive the exact registry owned by their `OAuthReadOnlyMcpRuntime`.

### Step 2.2 — Derive binding per request in shared OAuth mode

The current `workspaceIdentityBinding()` is evaluated at server construction and collapses OAuth identity to the stable owner. That is insufficient for a shared registry because client/grant/incarnation must also bind authority.

In shared OAuth mode, obtain the capability principal from the verified request-local OAuth context on each tool call/resolution. Do not freeze the initialization token ID/fingerprint into the workspace record.

Historical local mode can keep its current server-local identity binding behavior.

### Step 2.3 — Separate “owns registry” from “uses registry”

The server/manager lifecycle must expose whether it owns the underlying configured-root registry.

On server/transport close:

- private/session-local manager: preserve current `revokeAll("transport_closed")` behavior;
- shared OAuth manager/facade: unsubscribe local listeners and dispose local semantic resources only; do **not** revoke the shared workspace records.

Do not key this behavior on an incidental tool-contract version or on `semanticManager` existence. It is a lifecycle ownership property.

### Step 2.4 — Keep external workspace authorities unchanged

Confirmed roots and task-worktree authority remain on their existing independently reviewed stores/bindings. The configured-root shared registry must not absorb or enumerate another authority's records.

`listWorkspaces()` in shared OAuth mode combines:

- configured-root records filtered to the current exact capability principal/policy;
- existing confirmed-root/task-worktree views only according to their current authority APIs.

### Step 2.5 — Run server lifecycle tests

Run:

```powershell
npm run test:focused -- test/workspace-lifecycle.test.mjs test/oauth-cross-transport-workspace-capability.test.mjs
```

Expected:

- private manager/server isolation GREEN;
- shared-registry transport close no longer destroys W;
- observer/revocation fan-out GREEN;
- no public schema changes.

---

## Task 3 — Wire one registry per OAuth deployment runtime

**Files:**

- Modify: `src/http/oauthMcpRuntime.ts`
- Modify only as needed for dependency plumbing: `src/productionRuntime.ts`, `src/server.ts`
- Test: `test/phase-8-mcp-auth-integration.test.mjs`
- Test: `test/oauth-cross-transport-workspace-capability.test.mjs`

### Step 3.1 — Create the registry at the correct ownership boundary

`OAuthReadOnlyMcpRuntime` creates exactly one configured-root workspace capability registry for its current deployment incarnation.

It must be an instance field. No module-level cache/map is permitted.

Every `#createTransport(context)` passes that same registry into its newly created production server.

### Step 3.2 — Build the principal from verified request context

Use the current request-local `OAuthRequestContext`, not the initial transport context, to construct the exact capability principal:

```text
bindingId
incarnationId
ownerRef
clientRef
resource
grantId
grantRevision
```

A routine access-token refresh under the same grant therefore preserves W. A new grant/client/incarnation does not.

The already existing OAuth bearer verifier remains first authority: revoked/expired access tokens fail before workspace resolution.

### Step 3.3 — Own prune/shutdown at OAuth runtime level

The OAuth runtime is responsible for shared-registry cleanup:

- lazy expiry remains authoritative on each operation;
- one bounded runtime-level prune cadence may remove expired records;
- runtime `close()` disposes the registry after transport servers are quiesced;
- no workspace capability state is serialized during normal shutdown.

Transport pruning/disposal must not clear the registry.

### Step 3.4 — Turn the STEP-490 synthetic integration GREEN

Run:

```powershell
npm run test:focused -- test/oauth-cross-transport-workspace-capability.test.mjs test/phase-8-mcp-auth-integration.test.mjs
```

Required GREEN assertions include:

- transport A open -> transport B read same W succeeds;
- same-grant refreshed access token on B/C succeeds;
- cross-client and cross-grant copied W fails non-oracularly;
- foreign attempts do not destroy W for the legitimate principal;
- close on B invalidates C;
- closing A alone does not invalidate B/C.

---

## Task 4 — Close policy, revoke, race, and path-boundary gaps

**Files:**

- Test: `test/oauth-cross-transport-workspace-capability.test.mjs`
- Test: `test/phase-8-mcp-auth-integration.test.mjs`
- Modify runtime only where a RED test proves a missing enforcement path.

### Step 4.1 — Grant/client/owner revocation

Tests must prove:

- public/local OAuth grant revoke makes the old access token fail at the existing HTTP bearer boundary;
- client revoke/removal likewise prevents old bearer use;
- a newly authorized grant/client cannot reuse the old W;
- any targeted workspace-registry purge hook is cleanup/defense in depth, not the sole security mechanism.

Do not couple correctness to an asynchronous registry callback winning a race with OAuth revocation.

### Step 4.2 — Policy revision invalidation

Use an injected/test policy revision source:

1. issue W under R;
2. change active revision to R+1;
3. resolve W from another transport;
4. assert `WORKSPACE_NOT_FOUND` and no root leakage;
5. reopen target and assert a new capability bound to R+1.

Keep the per-resolution equality check even if a proactive sweep exists.

### Step 4.3 — Race semantics

Write deterministic tests around the documented linearization points:

- close wins before resolve -> read fails;
- resolve wins before close -> already admitted read may complete, later resolves fail;
- expiry wins -> late touch cannot resurrect W;
- foreign lookup racing legitimate use cannot revoke/touch W;
- policy revision flip after old resolve does not cause the workspace registry to claim retroactive cancellation; the next resolve must fail under the new revision.

Do not add an unreviewed cross-tool cancellation subsystem to this slice.

### Step 4.4 — PathGuard/root-authority regression

Re-run focused path/security tests with a cross-transport W. A valid capability must still be incapable of:

- reading outside its canonical root;
- escaping through symlink/junction/native path tricks;
- selecting a sibling root merely because that sibling is also in `allowedRoots`;
- bypassing tool-specific policy/scope/approval checks.

---

## Task 5 — Compatibility gate and rollback path

**Files:**

- Modify minimally: `src/config.ts` only if needed for the migration selector
- Modify: OAuth/server composition files only
- Tests: public contract, lifecycle, OAuth integration, supertool parity

### Step 5.1 — Add one OAuth-only migration selector

Use one explicit internal/configured mode with semantics equivalent to:

```text
session_local
oauth_cross_transport
```

Requirements:

- legacy/query-token and STDIO always remain session-local in this migration cycle;
- OAuth `session_local` reproduces historical Phase 2B behavior for rollback;
- OAuth `oauth_cross_transport` enables the new shared registry;
- neither mode permits default fallback for an explicitly supplied invalid handle.

Choose the exact config/env name only after checking current configuration naming conventions. Do not add multiple overlapping flags.

### Step 5.2 — Freeze public schemas and tool inventory

Run/extend contracts proving unchanged:

- `open_workspace` result shape;
- `close_workspace` strict `ws_<32hex>` shape;
- stale/foreign `WORKSPACE_NOT_FOUND` failure shape;
- V1/V2/V3/V4/V5 exact tool inventories;
- connection-test exposure rules;
- direct/supertool handler parity.

### Step 5.3 — Verify legacy and STDIO isolation

Explicitly prove:

- an OAuth-issued W does not resolve in legacy/query-token mode;
- an OAuth-issued W does not resolve in STDIO/local mode;
- a local/session-issued W does not resolve in OAuth shared mode;
- switching the migration selector back to session-local does not migrate/import shared records.

---

## Task 6 — Full local verification before real ChatGPT Web

### Step 6.1 — Run the narrow security/regression set

At minimum:

```powershell
npm run test:focused -- test/oauth-cross-transport-workspace-capability.test.mjs test/workspace-lifecycle.test.mjs test/phase-8-mcp-auth-integration.test.mjs test/open-workspace-contract.test.mjs test/close-workspace-contract.test.mjs test/codexgpt-supertool-contract.test.mjs
```

Expected: all GREEN.

If additional touched runtime seams have dedicated tests, add only those focused suites required by the actual diff.

### Step 6.2 — Build

```powershell
npm run build
```

Expected: exit 0.

### Step 6.3 — Repository policy and diff hygiene

Run:

```powershell
npm run policy:check
git diff --check
```

Then run an added-diff-only secret-looking-value scan using the repository's established STEP-490/491 method. Expected: no credential/token/private-key-looking additions.

Also inspect the source diff and prove:

- no module/process-global workspace capability map exists;
- no path-derived public workspace ID exists;
- no bearer/refresh token or raw owner/client credential is stored in capability records;
- no supplied-invalid-ID default fallback was added;
- no legacy/STDIO cross-session sharing was introduced;
- no unrelated P1 ToolExecutionPipeline, filesystem mutation, Git, transaction, Cloudflare, or deployment behavior changed.

### Step 6.4 — Run the applicable established runtime suites

Because this successor changes OAuth/runtime lifecycle, follow the repository's normal runtime-sensitive gate after focused GREEN:

- established ordinary test domain through the owned detached runner;
- relevant Smoke coverage;
- managed Node 20 and Node 24 where required by current repository policy;
- complete exact-head CI only after a later separately approved stage/commit/push step.

Do not run control/all destructively from the Devspace connector when project rules require an independent native terminal/CI.

---

## Task 7 — Real STEP-490 A1 regression gate

This is the product acceptance test, not an optional demo.

### Step 7.1 — Start only the reviewed successor runtime

Use the benchmark runtime harness and exact pinned target from the Phase 0 benchmark contract. Record a new run ID/evidence file clearly as the workspace-successor A1 validation. Do not start A2 or the P1 candidate campaign.

### Step 7.2 — Execute the same real ChatGPT Web A1 bootstrap

The real ChatGPT Web App must:

```text
open_workspace(C:\Users\Administrator\.devspace\worktrees\codexgpt-d6e52e6e)
  -> W
```

Then its next App call, even if ChatGPT created a new MCP transport/session, must explicitly execute:

```text
read(package.json, workspace_id=W)
```

Required evidence:

- read succeeds;
- it reads the exact pinned target workspace;
- no default-root fallback occurs;
- no second `open_workspace` is required;
- no unrelated connector/plugin is used to mask failure.

### Step 7.3 — Gate campaign resumption

Only after the real A1 successor regression is recorded as successful may the owner decide to resume:

```text
A2 baseline/candidate benchmark work
and/or
further P1 ToolExecutionPipeline migration
```

If real A1 still fails, stop the exact run and return to the smallest failing transport/principal lifecycle assumption. Do not loosen identity, grant, client, policy, TTL, or path boundaries to make the benchmark pass.

STEP-494 closure note: the initial current-conversation connector probe succeeded as `open_workspace(exact target) -> W -> read(package.json, W)` with target-vs-default SHA-256 proof. The owner then supplied the required fresh ChatGPT Web A1 result: the same explicit `workspace_id` was reused for `package.json`, `src/stdio.ts`, and `src/http.ts`, no `WORKSPACE_NOT_FOUND` occurred, and all A1 success criteria were satisfied. Formal evidence is `docs/benchmarks/chatgpt-web-e2e/runs/2026-08-16-successor-a1.json`; the exact successor runtime was stopped by run ID afterward. The connector surface still does not expose transport/session ID, so no specific transport transition is inferred. Task 7 is complete. STEP-495 later authorized and completed the matched A2 pair under the separate benchmark contract; that later work does not expand this plan's implementation authority.

---

## RED test inventory

The implementation phase must begin with these named behavioral tests (exact file/test names may be adjusted, semantics may not):

1. same OAuth owner/client/grant: transport A open, transport B reuse W -> success;
2. same grant after access-token refresh -> success;
3. different OAuth owner -> non-oracular workspace miss;
4. same owner, different OAuth client -> miss;
5. same owner/client, different grant -> miss;
6. different deployment binding/incarnation -> miss;
7. foreign lookup/close does not revoke legitimate W;
8. policy revision change -> stale W fail closed;
9. close on one transport -> immediate failure on later transports;
10. TTL expiry -> failure; successful cross-transport resolve refreshes TTL;
11. valid W cannot bypass allowed-root/native-realpath/PathGuard boundaries;
12. guessed random W and copied foreign W do not disclose existence/reason;
13. process/runtime restart -> old W fails exactly as successor v1 specifies;
14. transport close alone -> W remains valid for same principal on another transport;
15. STDIO/legacy/query-token isolation remains session/process-local;
16. existing direct/supertool handler parity remains identical;
17. V1-V5 schemas/tool counts remain unchanged;
18. shared-registry list returns only the current exact principal's configured-root records;
19. registry revocation event fan-out invalidates active per-transport workspace caches/subscribers;
20. 64-per-principal / 256-per-runtime capacity bounds prune expiry first, refuse only the new open, and never evict a live handle;
21. two independently constructed OAuth runtimes cannot resolve each other's handles even for the same canonical root;
22. real OAuth two-transport integration reproduces then fixes STEP-490;
23. STEP-490 A1: `open_workspace` -> next-transport `read(package.json)` resolves the same pinned target, never the default root.

## Rollback

The runtime implementation must be independently reversible:

- switch OAuth migration mode back to historical `session_local`;
- remove shared-registry injection from `OAuthReadOnlyMcpRuntime`;
- preserve all public schemas/tool names and durable OAuth state;
- do not delete grants, clients, credentials, audit, profiles, or user workspace data;
- do not restore any path-derived or unauthenticated process-global workspace registry.

Rollback intentionally restores the known STEP-490 limitation until a corrected successor is available; it must not silently fake continuity with default workspace selection.

## Completion definition

This plan is complete only when a future implementation step has evidence for all of the following:

```text
characterization GREEN
+ required cross-transport tests first observed RED
+ focused successor tests GREEN
+ OAuth integration GREEN
+ public contract/legacy/STDIO parity GREEN
+ build GREEN
+ repository policy/diff/secret gates GREEN
+ applicable runtime-sensitive suites GREEN
+ real ChatGPT Web STEP-490 A1 GREEN
```

Until then the Phase 0 benchmark remains blocked at A1.
