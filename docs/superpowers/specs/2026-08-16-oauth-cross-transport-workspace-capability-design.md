# OAuth Cross-Transport Workspace Capability Successor Design

Date: 2026-08-16
Status: STEP-493 implemented locally and adversarially reviewed; local Node 20/24 runtime gates pass; STEP-494 fresh ChatGPT Web A1 passed and closed the real-client promotion gate
Scope: OAuth / real ChatGPT Web workspace-handle continuity across MCP transport rotation
Primary platform: native Windows

## 1. Problem and evidence

STEP-490 established a real-client incompatibility, not a P1 pipeline regression. In the real baseline A1 trace, `open_workspace(target)` succeeded and returned an opaque `workspace_id`, but the next real ChatGPT Web tool call explicitly reusing that same handle returned `WORKSPACE_NOT_FOUND`. A second closed-world `codexgpt` call with the same explicit handle failed identically. The benchmark remains stopped at A1.

Authoritative evidence that motivated the successor:

- `docs/benchmarks/chatgpt-web-e2e/runs/2026-08-16-baseline-a1.json` records the exact failed trace.
- At STEP-490, `src/guard.ts` stored configured-root workspace records inside one `WorkspaceManager` and required matching `transportSessionId`, identity binding, and policy revision.
- At STEP-490, `src/http/oauthMcpRuntime.ts` created a fresh `createProductionCodexGPTServer()` for every MCP transport, so each transport received a distinct `WorkspaceManager`.
- At STEP-490, `src/server.ts` treated transport/server close as the configured-root lifecycle boundary.
- `src/auth/requestContext.ts` already exposes request-local safe OAuth binding facts: `ownerRef`, `clientRef`, `resource`, `bindingId`, `incarnationId`, `grantId`, `grantRevision`, scopes, token identity, and expiry.
- `src/auth/tokenService.ts` validates the current durable grant on every bearer request. Routine refresh keeps the same grant identity/revision, while revoke/expiry changes the durable grant state and revision.
- `test/workspace-lifecycle.test.mjs` intentionally characterizes the historical Phase 2B rule that independent MCP servers do not share configured-root workspace handles.
- `test/phase-8-mcp-auth-integration.test.mjs` proves one MCP transport is bound to owner/client/resource/deployment/grant and accepts a refreshed access token for the same grant while rejecting cross-client reuse.

STEP-493 implements the reviewed successor with one OAuth-runtime-owned in-memory configured-root registry, request-local principal binding, shared revocation fan-out, non-destructive foreign misses, bounded 64/principal and 256/runtime active capacity, process-restart invalidation, an OAuth-only `session_local` rollback selector, and OAuth-specific model guidance to keep explicitly using the returned `workspace_id` across transport rotation. Legacy/query-token, STDIO, confirmed-root, and task-worktree authority remain on their historical boundaries. STEP-494 then passed the required fresh ChatGPT Web A1 with the same explicit workspace handle reused across all necessary follow-up reads; the earlier exact-root/hash probe independently excludes default-root fallback. The connector surface does not expose transport/session IDs, so the evidence does not invent a specific transport transition; forced two-transport continuity remains covered by STEP-493 integration tests.

The successor problem is therefore:

> Preserve a workspace capability that the user explicitly opened across MCP transport rotation inside one valid OAuth deployment/authorization authority, without restoring path-derived identifiers, unauthenticated process-global lookup, or cross-principal handle reuse.

The target UX is deliberately simple:

```text
open_workspace once
  -> ChatGPT Web may rotate MCP transport/session
  -> later explicit workspace_id calls still resolve the same target
```

The user must not understand or manage MCP transport/session state.

## 2. First-principles model

A transport session is a delivery channel. It is not the durable security principal for a workspace capability.

A workspace capability has three conceptually separate parts:

1. **Authority principal** — which authenticated OAuth authorization may present the handle.
2. **Resource binding** — which exact canonical workspace root the handle selects.
3. **Validity epochs/state** — whether the capability is still live under current grant, deployment incarnation, policy revision, TTL, and explicit close state.

Transport identity may remain useful for audit or diagnostics, but it must no longer be the sole continuity boundary in OAuth cross-transport mode.

The capability also does not replace path authorization. It selects one previously admitted canonical root; every later filesystem/Git/semantic/process operation still traverses the existing policy and path guards.

## 3. Recommended architecture

### 3.1 Decision

Use a **deployment-runtime-scoped shared server-side capability registry**, owned by one `OAuthReadOnlyMcpRuntime` instance and explicitly injected into each per-transport production server created by that runtime.

Do **not** use a module-global/process-global workspace registry.

Do **not** make the public handle self-describing in this successor version.

Do **not** persist the registry across process restart in this successor version.

The public `workspace_id` remains exactly the current random opaque shape:

```text
ws_<32 lowercase hex>
```

The shared state boundary is therefore:

```text
OAuth deployment runtime / current deployment incarnation
        |
        +-- shared WorkspaceCapabilityRegistry
        |      handle -> canonical root + principal binding + policy/TTL state
        |
        +-- MCP transport A -> production server A -> WorkspaceManager facade
        +-- MCP transport B -> production server B -> WorkspaceManager facade
        +-- MCP transport C -> production server C -> WorkspaceManager facade
```

Transport A/B/C can resolve the same handle only when the current request presents the exact capability principal described below.

### 3.2 Why this is not a return to process-global authority

The registry must satisfy all of these ownership constraints:

- constructed as an instance field of one OAuth deployment runtime, never at module scope;
- passed explicitly to transport servers through dependency injection;
- never discoverable by canonical path, `workspaceKey`, default root, or another server process;
- never shared with legacy/query-token or STDIO runtimes;
- discarded when the owning OAuth runtime/process ends;
- records are filtered/resolved only with the current request-local principal;
- no API accepts “deployment ID + path” as an alternate lookup route.

A test must fail if two independently constructed OAuth runtimes can resolve each other's handles, even when they use the same filesystem root.

### 3.3 Scope of shared state

Only the configured-root workspace records historically owned by the Phase 2B `WorkspaceManager` move to this shared backend.

The successor must **not** absorb or reinterpret other authority domains that happen to implement the `Workspace` shape:

- confirmed-root authority keeps its existing brokered owner/access/lease contract;
- task-worktree authority keeps its existing owner-bound worktree contract;
- process handles, approvals, change sets, Git facts, and semantic provider authority are not converted into deployment-global workspace capability state.

`listWorkspaces()` in OAuth shared mode therefore filters shared configured-root records by the exact current capability principal and policy revision, then composes only the already-authorized views returned by the existing confirmed-root/task-worktree authorities. A shared configured-root handle never becomes an alternate lookup route into those stores.

### 3.4 Revocation notification ownership

The registry also owns configured-root revocation events. Every per-transport manager/server that needs workspace-scoped cache invalidation subscribes while that server is alive.

- legitimate `close`, expiry, or policy invalidation emits one registry-level event;
- all live subscribers can invalidate semantic previews/analysis caches for that `workspace_id`;
- closing one transport only removes that transport's subscription;
- transport disposal must not emit a capability revocation merely because the transport ended.

Without registry-wide fan-out, cross-transport `close_workspace` could remove the authority record while leaving stale per-transport semantic/cache state alive, so this is part of the security/lifecycle contract rather than an optimization.

## 4. Capability security principal

### 4.1 Principal tuple

For OAuth cross-transport workspace capability resolution, the authoritative principal is the exact tuple:

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

The registry may store a domain-separated digest for equality/indexing, but targeted invalidation may retain these safe opaque references internally. None is returned in tool output or errors.

Meaning of each field:

- `deploymentBindingId`: identifies the stable OAuth deployment binding. Phase 8 binds it to canonical profile/root plus issuer/resource/hostname ownership. It is necessary but not sufficient authority.
- `deploymentIncarnationId`: is the current deployment security epoch. Recovery/security reset rotates it, so old capabilities cannot cross a forced-reset incarnation.
- `ownerRef`: binds the capability to the installation owner without storing/exposing the raw owner subject.
- `clientRef`: prevents another OAuth/DCR client owned by the same user from replaying a copied workspace handle.
- `resource`: preserves the exact MCP resource boundary already enforced by the OAuth transport record and token verifier. It is a consistency field, not sufficient authority alone.
- `grantId`: prevents a different authorization grant, including a new grant for the same client/owner, from inheriting the old capability.
- `grantRevision`: binds the capability to the grant security revision. Routine refresh keeps it stable; revoke/expiry/scope-revision invalidates the old revision.

This grant binding is intentionally strict. A routine access-token refresh remains continuous because it preserves `grantId`/`grantRevision`; an explicit relink, reauthorization that creates a new grant, or scope revision does **not** inherit old workspace capabilities. The user may need one new `open_workspace` after such an authorization-boundary change. That cost is preferable to allowing a new grant to inherit copied handles from an older authorization.

### 4.2 Validity epoch outside the principal

Each capability record also stores the active workspace-policy revision at issue time:

```ts
policyRevision: string | null
```

Policy revision is a capability validity condition, not an OAuth identity principal. A record resolves only when its stored revision exactly equals the current policy revision supplied by the server handling the request.

### 4.3 Facts that must not become authority

The following values must not be used alone or added as continuity requirements:

- `transportSessionId`: specifically excluded from OAuth continuity authority; transport rotation is the problem being solved.
- access-token `tokenId` or `tokenFingerprint`: excluded because normal bearer refresh must not invalidate the workspace capability.
- refresh-token generation: excluded because routine refresh rotation must not invalidate the capability.
- canonical path, `workspaceKey`, default root, profile path, hostname, or issuer/resource alone: resource identity is not caller authority.
- raw owner subject, raw client ID, bearer token, refresh token, authorization code, or credential material: unnecessary and unsafe to retain in workspace records.
- OAuth scopes alone: scopes are an upper-bound permission set, not ownership. Current token/grant validation and Policy Kernel remain authoritative.
- `bindingId` alone: it identifies a deployment, not a client/grant authorization.
- `ownerRef` alone: this would let all clients/grants of the owner reuse a copied handle and is therefore too broad.
- `clientRef` alone: this would let a later/new grant for the same client inherit an earlier grant's workspace capability and is also too broad.

## 5. Record and index model

A configured-root capability record should contain only the state required to enforce the contract:

```ts
interface WorkspaceCapabilityRecordV1 {
  workspace: {
    id: string;
    root: string;       // canonical native realpath, internal only except existing open/list outputs
    openedAt: string;
  };
  workspaceKey: string; // internal canonical-root dedupe identity only
  principal: OAuthWorkspaceCapabilityPrincipalV1;
  principalDigest: string;
  policyRevision: string | null;
  expiresAtMs: number;
}
```

Required indexes:

```text
workspace_id -> record
(principalDigest, workspaceKey, policyRevision) -> workspace_id
```

The second index means:

- same principal + same canonical root + same policy revision reuses one active capability across transports;
- a different owner/client/grant/incarnation receives a distinct capability even for the same root;
- a new policy revision cannot silently reuse the old capability.

Tombstones remain bounded and internal. They may retain only enough information for collision avoidance, cleanup accounting, and deterministic tests. Public behavior must not distinguish never-issued, foreign, closed, expired, policy-stale, or stale-incarnation handles.

## 6. Resolution algorithm

For an explicit `workspace_id`, the OAuth shared-mode resolver must execute in this order:

1. Require syntactically valid explicit handle input. Never substitute the default root for a supplied-but-invalid/unresolved handle.
2. Obtain the current request-local OAuth principal from already verified bearer context.
3. Read the registry record by random handle.
4. If no record exists, return the ordinary opaque `WORKSPACE_NOT_FOUND` result.
5. Compare the record principal with the current principal **without mutating or revoking the record on mismatch**.
6. If the principal differs, return the same `WORKSPACE_NOT_FOUND` result.
7. Compare record policy revision with the current active policy revision. A same-principal stale policy record is invalidated internally and returns `WORKSPACE_NOT_FOUND`.
8. Check expiry. Expired record is invalidated internally and returns `WORKSPACE_NOT_FOUND`.
9. Run the existing `beforeWorkspaceUse(canonicalRoot)` recovery/readiness hook. Failure must neither issue nor refresh the capability.
10. Refresh the sliding TTL only after every preceding check succeeds.
11. Return the exact stored workspace root/ID to the existing tool pipeline.
12. The downstream PathGuard/Policy Kernel/domain service performs its normal per-operation resource checks. The workspace capability does not bypass them.

The no-mutation rule at step 5 is a new critical invariant. In a shared registry, a foreign principal that knows or guesses a valid handle must not be able to revoke the legitimate owner's capability merely by attempting lookup/close.

## 7. Lifecycle contract

### 7.1 Issue / open

Authority:

- caller must already have a verified OAuth request and `workspace:open` eligibility;
- requested root is normalized, native-realpath resolved, and checked against `allowedRoots` exactly as today;
- `beforeWorkspaceUse` must succeed before issue/touch.

Behavior:

- same canonical root under the same principal + policy revision returns the same active `workspace_id` and refreshes TTL;
- another principal gets another random ID;
- no path-derived or deterministic public identifier is created.

Public failure remains the existing `open_workspace` root/open/internal error contract. No principal/deployment detail is returned.

### 7.2 Resolve across transport rotation

Authority:

- the current bearer request must verify against current durable OAuth state;
- current principal tuple must exactly match the record principal;
- current policy revision must match the record revision.

Success returns the same workspace/root regardless of MCP transport ID.

Unknown/foreign/stale/closed/expired records return the existing non-oracular `WORKSPACE_NOT_FOUND` tool failure.

### 7.3 Touch / sliding TTL

A successful same-principal resolution or repeated open refreshes `expiresAtMs` using the existing bounded `workspaceTtlMs` semantics.

Failed lookups, foreign-principal attempts, policy-stale attempts, and recovery/readiness failures never refresh TTL.

TTL is shared across transports because it belongs to the capability record, not a transport server.

### 7.4 Close

`close_workspace(workspace_id)` uses the same strict current-principal resolution rule, then atomically removes the active record and records a bounded tombstone.

After close linearizes:

- every later transport for the same principal receives `WORKSPACE_NOT_FOUND`;
- foreign principals receive the same failure and cannot close/revoke the legitimate record;
- reopening the same root issues a new random handle.

The existing public success shape and `ws_<32hex>` validation remain unchanged.

### 7.5 Grant revoke / expiry / scope revision

Durable OAuth grant state is authoritative before MCP tool dispatch. `verifyAccessToken()` validates the grant on every request. Therefore a revoked/expired stale access token fails at the HTTP OAuth boundary with the existing `401 invalid_token` behavior before workspace lookup.

If a later valid request uses a new grant or new grant revision, its principal no longer matches the old capability, so the old handle returns `WORKSPACE_NOT_FOUND` if it reaches a tool call.

The registry may provide targeted purge APIs for prompt cleanup (`revokeGrant`, `revokeClient`, `revokeOwner`), but security must not depend on those callbacks racing successfully with bearer revocation. Durable OAuth validation + principal mismatch are the authority; purge is cleanup/defense in depth.

### 7.6 Client revoke/removal

Client revocation/removal first invalidates its durable grants under Phase 8 rules. Existing tokens then fail bearer verification. A different/new client cannot resolve the old workspace handle because `clientRef` is part of the principal.

No workspace error reveals whether the copied handle belonged to that client.

### 7.7 Policy revision change

A capability is valid only for its issued policy revision. On the first resolve/open/list/close under a different active revision, same-principal stale records are invalidated and the supplied handle returns `WORKSPACE_NOT_FOUND`.

A proactive `revokeForPolicyRevision(activeRevision)` sweep remains valid for cleanup, but correctness also requires the per-resolution equality check.

### 7.8 Incarnation/security reset

`incarnationId` is part of the principal. A recovery/security reset creates a new incarnation and invalidates old OAuth bearer/grant authority under Phase 8. Old workspace handles therefore cannot resolve under the new incarnation.

Because the recommended registry is process-memory-only, recovery also naturally loses old records.

### 7.9 MCP transport close/rotation

Closing transport A must **not** revoke an OAuth shared workspace capability merely because A issued or last used it.

Transport/server disposal still cleans transport-local caches/listeners/process resources according to their own contracts. The shared workspace registry is owned by the OAuth runtime, not by an individual transport server.

This is a deliberate change from the current V5 server-close path that calls `workspaces.revokeAll("transport_closed")`.

Legacy/query-token and STDIO modes keep their current transport/process-local revocation semantics.

### 7.10 OAuth runtime/process restart

Successor v1 makes an explicit choice: **workspace capabilities do not survive a CodexGPT process/runtime restart**.

Rationale:

- STEP-490 requires cross-transport continuity inside one running OAuth deployment, not cross-process persistence;
- restart persistence would require durable capability/revocation/touch state or a cryptographic token/key migration contract;
- failing closed on restart is simpler to audit and avoids turning the workspace registry into durable authorization state.

After a normal service restart, the OAuth grant may continue through normal refresh-token behavior, but an old `workspace_id` returns `WORKSPACE_NOT_FOUND`; ChatGPT must call `open_workspace` again once for that restarted runtime.

If real UX later requires restart continuity, that is a separate successor version and must not be smuggled into STEP-490 implementation.

### 7.11 Expiry, capacity, and cleanup

The shared registry keeps the existing bounded one-minute-to-24-hour workspace TTL rules. Because one shared registry aggregates records that were previously spread across transport-local managers, active-record count must also be bounded rather than relying on TTL alone.

Successor v1 uses non-evicting internal ceilings of **64 active configured-root capabilities per principal** and **256 active configured-root capabilities per OAuth runtime**. These are operational memory/abuse bounds, not authorization limits. On capacity exhaustion:

- prune expired records first;
- never evict a still-live capability merely to admit a new one;
- fail the new `open_workspace` using its existing non-sensitive `WORKSPACE_OPEN_FAILED` contract;
- do not reveal which principal/root consumed capacity.

Cleanup rules:

- operations lazily prune expired records before use;
- the OAuth runtime may own one bounded periodic prune timer so an idle registry does not retain expired records indefinitely;
- tombstones remain bounded;
- cleanup never publishes revocation reason or principal identity;
- shutdown clears the runtime-owned registry without writing durable workspace capability state.

## 8. Concurrency and race semantics

The contract defines linearization points rather than claiming cancellation of already executing tool calls.

### Open same root

Within one runtime/event loop, issue is atomic with respect to the `(principalDigest, workspaceKey, policyRevision)` index. Concurrent opens for the same tuple converge on one active handle. Different principals never dedupe together.

### Close versus read

Workspace authorization linearizes when `resolve(workspace_id, currentPrincipal, currentPolicyRevision)` succeeds.

- If close removes the record first, the read fails with `WORKSPACE_NOT_FOUND`.
- If the read resolves first, that already-admitted in-flight read may complete. Close prevents subsequent resolutions; it does not retroactively cancel a tool call that has already crossed authorization/policy admission.

Any stronger “abort in-flight operation on close” semantic would require a separate per-tool lease/cancellation design and is not claimed here.

### Policy revision switch

A call admitted under revision R may complete if the global policy subsystem allows already-admitted work to complete. The next workspace resolution under R+1 rejects the R-bound capability. The workspace registry does not weaken or replace the Policy Kernel's own revision/admission guarantees.

### OAuth revoke versus executing tool

Phase 8 durable revoke is authoritative before success is reported and blocks subsequent bearer verification. A tool request that already completed bearer verification/policy admission before revoke may complete; successor workspace handling does not claim retroactive cancellation.

### Registry cleanup versus resolve

Cleanup and resolve must operate against one authoritative in-memory record map. An expired record cannot be resurrected by a late touch: expiry is checked before touch, and once close/expiry removal wins, no later operation may reinsert the same public ID.

### Stale copied handle

A copied handle presented by a different principal is a read-only miss from the attacker's perspective: no touch, no close, no revocation, no root disclosure, and no different public error.

## 9. Model comparison

### Model A — deployment-runtime-scoped shared server-side registry

Properties:

- preserves `ws_<32hex>` and V1–V5 public schemas;
- naturally supports sliding TTL, same-root dedupe, immediate close, bounded tombstones, and policy invalidation;
- exact principal can be checked on every call using request-local OAuth context;
- no new cryptographic token format/key material;
- restart invalidates capability by design;
- primary implementation risk is accidental widening into module/process-global authority, addressed by explicit ownership/injection tests.

### Model B — cryptographically authenticated/self-describing opaque capability

A true self-describing design would need to encode, authenticate, and normally encrypt at least root/resource identity, principal binding/epoch, issue/expiry state, and a nonce/version.

Advantages:

- transport-independent without a lookup table;
- could support process restart if its capability key is durable and the validity contract is also durable.

Problems for this repository/contract:

1. The current strict close schema requires `workspace_id` to match `^ws_[0-9a-f]{32}$`. A meaningful encrypted/authenticated payload cannot fit in the existing 128-bit public handle; a real self-describing token would change public schema/size, or else become only a cryptographic pointer to server state.
2. Sliding TTL is mutable state. A stateless token cannot refresh idle expiry without reissuing a new token, which would change the user-visible handle on normal use.
3. Immediate `close_workspace` needs a deny/revocation state. Policy revision invalidation and targeted grant/client revoke also need current server state. Once those stores exist, the alleged stateless benefit largely disappears.
4. Restart continuity would require a new durable capability encryption/MAC key with purpose separation, DPAPI/state migration, recovery/rollback rules, and revocation persistence. Reusing signing or refresh keys is forbidden.
5. Encrypting the handle does not solve stolen-authority replay. An attacker holding both a valid bearer token for the exact grant and the copied workspace handle remains inside the same bearer security model; Phase 8 does not claim DPoP/mTLS proof of possession.

Conclusion: Model B adds cryptographic and migration surface without removing the state required by the current lifecycle semantics. It is not recommended for STEP-490.

### Optional future Model C — durable opaque registry

If process-restart continuity later becomes a proven UX requirement, a better follow-up than immediately adopting self-describing tokens may be a durable opaque registry inside the deployment's protected application state. That would preserve the public ID format but would require a separate review of crash consistency, expiry clock semantics, recovery/security reset, durable close/revoke, cleanup, backup rollback, and auth-state mutation inventory. It is intentionally out of scope here.

## 10. Security invariants

The successor is acceptable only if all of these remain true:

1. Public `workspace_id` remains cryptographically random, opaque, and not derivable from canonical path or `workspaceKey`.
2. `allowedRoots`, native `realpath`, blocked-path rules, Windows path safety, PathGuard, and Policy Kernel remain the final path/operation boundaries.
3. OAuth transport rotation changes no root authority and adds no new allowed root.
4. The exact deployment incarnation + owner + client + grant principal is required on every shared-handle resolution.
5. A different owner, client, grant, deployment binding, incarnation, or resource cannot reuse a copied handle.
6. Token ID/fingerprint and transport session ID are not continuity requirements, so routine access-token refresh and MCP rotation do not break a valid handle.
7. Grant revoke/expiry/scope revision, client revoke, deployment incarnation change, policy revision change, explicit close, and TTL expiry all fail closed.
8. Foreign-principal lookup/close is non-destructive to the legitimate record.
9. Public errors do not reveal canonical root, workspaceKey, principal digest, owner/client/grant/deployment facts, tombstone/revocation reason, or whether the handle ever existed.
10. A supplied invalid/stale `workspace_id` never falls back to default workspace.
11. Legacy/query-token and STDIO behavior is not widened by the OAuth successor.
12. Direct tool and closed-world supertool calls share the same resolver/handler semantics.
13. Transport close does not revoke OAuth shared capability; OAuth runtime/process end does.
14. Process restart invalidates workspace capabilities in successor v1; this behavior is explicit and tested.
15. No module-scope/process-global workspace capability map is introduced.
16. Shared configured-root records cannot be used as an alternate authority for confirmed roots, task worktrees, process handles, change sets, approvals, Git facts, or other owner-bound artifacts.
17. Registry revocation is fanned out to live per-transport cache/semantic subscribers, while transport close merely unsubscribes.
18. Active configured-root capability records are count-bounded without evicting live handles.

## 11. Compatibility and migration

### Public contract

Keep unchanged:

- V1–V5 tool names/counts unless an unrelated existing migration changes them;
- `open_workspace` input/output shape;
- `workspace_id` public `ws_<32hex>` format;
- `close_workspace` success/error schema;
- `WORKSPACE_NOT_FOUND` as the non-oracular stale/foreign/closed handle result;
- direct/supertool handler parity.

`open_workspace` does not need a new transport/deployment/grant field. Exposing those would leak mechanism and make the user reason about MCP internals.

### Omitted `workspace_id`

The historical one-cycle omitted-ID compatibility boundary remains separate:

- omission may still select the configured default according to existing compatibility rules;
- an explicitly supplied handle that fails lookup must never fall back to default;
- the shared registry must not infer “the last workspace used by this owner/client/grant” when the caller omitted the ID.

### Rollback feature gate

Implementation should retain one explicit OAuth-only migration switch for one compatibility cycle, conceptually:

```text
workspace capability mode = session_local | oauth_cross_transport
```

Recommended rollout behavior:

- legacy/query-token and STDIO remain `session_local` regardless;
- OAuth successor implementation is exercised under `oauth_cross_transport` in focused/integration tests;
- production/candidate promotion uses `oauth_cross_transport` only after the full RED-to-GREEN suite passes;
- one-cycle rollback can restore the historical OAuth `session_local` behavior without schema changes or state migration;
- no mode permits default-workspace fallback for a supplied invalid ID.

The exact config/env spelling is an implementation detail to settle in the TDD slice; the behavioral gate is mandatory.

## 12. Minimum runtime surface

The implementation should remain localized to the workspace/OAuth composition seam:

1. `src/guard.ts` or a small new `src/workspace/` module:
   - extract configured-root record storage into an injectable capability registry/store;
   - support request-local principal binding in shared OAuth mode;
   - own shared revocation-event fan-out and bounded active-record capacity;
   - preserve current local/session backend by default.
2. `src/server.ts`:
   - accept the optional shared workspace capability dependency/context source;
   - stop treating transport close as capability revoke when the manager does not own the shared registry;
   - keep Policy Kernel/PathGuard/domain handlers on the same resolved workspace object.
3. `src/productionRuntime.ts`:
   - thread the optional dependency only; do not create global state.
4. `src/http/oauthMcpRuntime.ts`:
   - create exactly one registry per OAuth runtime/deployment incarnation;
   - pass it into every transport-created production server;
   - derive the current capability principal from request-local verified OAuth context on each tool call;
   - own shared-registry prune/shutdown lifecycle.
5. Focused tests:
   - `test/workspace-lifecycle.test.mjs` keeps legacy/session-local characterization;
   - a new focused registry/successor test owns deterministic principal/TTL/race cases;
   - `test/phase-8-mcp-auth-integration.test.mjs` owns real OAuth multi-transport integration characterization;
   - benchmark contract/evidence remains under `docs/benchmarks/chatgpt-web-e2e/`.

No tool schema, filesystem primitive, Git primitive, transaction primitive, or P1 ToolExecutionPipeline change is required to solve STEP-490.

## 13. Known limitation: bearer theft

This design prevents a workspace handle from becoming authority by itself. A copied handle is useless under another owner/client/grant.

It does not add proof-of-possession to OAuth. If an attacker steals both a still-valid bearer token for the exact same grant and the corresponding workspace handle, the request is indistinguishable from that bearer principal under the existing Phase 8 model. Preventing that requires DPoP, mTLS, or another separately reviewed proof-of-possession mechanism and is outside this workspace-successor scope.

## 14. Adversarial review outcome

The initial draft was attacked against the required failure modes. The resulting corrections are part of this final design:

- **Process-global authority:** rejected; registry ownership is one OAuth runtime instance and two runtime instances remain isolated even for the same root.
- **Binding too broad:** owner-only and client-only bindings were rejected. Exact grant identity/revision is retained, with the explicit UX consequence that a new/revised grant requires reopening the workspace once.
- **Binding too narrow:** transport session and access-token identity were rejected as principal fields, so MCP rotation and routine access-token refresh remain continuous.
- **Capability theft/replay:** foreign handle use is a side-effect-free miss. Theft of both the exact-grant bearer token and handle remains a known Phase 8 bearer limitation, not a property this design falsely claims to solve.
- **Restart/revoke race:** restart continuity is explicitly out of scope and fails closed; durable OAuth validation is authoritative for revoke, with registry purge only cleanup/defense in depth.
- **Policy race:** current revision is compared on every resolution; no callback-only invalidation assumption is permitted.
- **Root-authority widening:** only configured-root records are shared. Confirmed-root/task-worktree and all other owner-bound authority stores remain independent, and PathGuard/Policy Kernel stay final.
- **Legacy/STDIO regression:** shared mode is OAuth-only and injectable; historical local/session behavior remains the rollback/default for those transports.
- **Cross-transport stale cache:** registry-level revocation event fan-out is required so close/expiry/policy invalidation reaches all live transport-local semantic/cache subscribers.
- **Registry aggregation:** active records receive non-evicting per-principal/runtime ceilings because sharing turns formerly per-transport memory into deployment-runtime memory.
- **ChatGPT Web UX:** while the runtime and exact OAuth grant remain valid, the user opens once and can keep explicitly reusing W across transport rotation; MCP session concepts never appear in the public contract. Restart or a new authorization grant intentionally requires one reopen.

No review finding justifies weakening opaque IDs, exact principal/policy binding, close/TTL behavior, or path authority.

## 15. Acceptance gate

This design is not considered implemented by documentation alone.

The implementation gate is:

```text
characterization
  -> RED cross-transport tests
  -> minimal shared-registry implementation
  -> focused/security/integration GREEN
  -> build/policy/diff/secret gates
  -> real ChatGPT Web STEP-490 A1 rerun
```

The real A1 pass condition is exact:

```text
open_workspace(pinned target)
  -> returns workspace_id W
ChatGPT Web may use the next MCP transport/session
read(package.json, workspace_id=W)
  -> succeeds against the same pinned target root
  -> never resolves the configured/default root as fallback
```

This pass condition was recorded in STEP-494 (`docs/benchmarks/chatgpt-web-e2e/runs/2026-08-16-successor-a1.json`). STEP-495 later completed the matched successor-adjusted A2 pair outside this design slice; later benchmark/P1 work remains separately authorized.
