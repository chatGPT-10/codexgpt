# Phase 8 Implementation Archive — Volume 2

This append-only volume continues Phase 8 after Volume 1 closed at STEP-446.

## 2026-07-26 — STEP-447: Complete Task 8A5 signed tokens, rotating refresh, revoke, and authenticated read-only MCP

**Status:** Task 8A5 is complete locally. The supported OAuth runtime now performs authorization-code exchange, issues strict ES256 access tokens and authenticated opaque rotating refresh tokens, enforces durable replay/revoke/expiry state, verifies Bearer credentials on every MCP request, carries immutable request-local identity, and completes a real authenticated MCP initialize plus read-only tool call. Task 8A6 is the only next implementation boundary.

**Authority and boundary:** The owner explicitly instructed `@Devspace 执行Task 8A5`. Work stayed inside `D:\Dev\codexpro` and built on the authorized unstaged Tasks 8A1–8A4 tree. No Cloudflare/DNS/Tunnel object, real ChatGPT App, real credential, service, staged index, commit, push, release, or deployment was changed.

**Primary implementation:**

- Added a durable OAuth grant/family model bound to deployment, incarnation, owner, public client, resource, canonical scopes, grant revision, refresh generation, idle/absolute expiry, and safe terminal reasons. Every mutation runs under the deployment lock and publishes through the existing audit-before-state atomic store.
- Added crash-safe authorization-code exchange. The in-memory one-use code is marked consumed only after durable grant/family/audit publication; the durable keyed authorization-code hash prevents two families from one code across retries.
- Added strict ES256 `at+jwt` access tokens with exact `alg`, `typ`, retained `kid`, issuer, audience/resource, owner subject, public client, grant/revision, canonical scope, `iat/nbf/exp`, and random `jti`. TTL is ten minutes with sixty seconds of bounded skew.
- Added a cheap canonical JWT parser before cryptography: one ASCII Bearer value, exact three canonical base64url segments, bounded header/payload, exact 64-byte P-256 signature, exact header/payload key inventories, and no alternate algorithm/type/key acceptance.
- Added authenticated refresh envelope v1 containing a random 128-bit family handle, uint64 generation, and 256-bit nonce protected by a domain-separated HMAC. Durable state stores only the current domain-separated keyed hash and generation; plaintext refresh values are never persisted.
- Added 90-day idle and 365-day absolute refresh lifetimes. Normal refresh changes only generation/hash/last-use; old-generation replay revokes the entire family and increments the security grant revision.
- Added public non-oracular revoke plus local exact grant, public-client cascade, and owner-wide revoke. Successful durable revoke invalidates cached access tokens on the next request; safe local-control output omits family handles, authorization-code hashes, refresh hashes, client IDs, and credentials.
- Added exact `POST /token` and `POST /revoke` project-owned handlers with bounded form parsing, exact public `client_id`, no Basic/client secret/assertion support, exact RFC 8707 resource, grant-specific standard-parameter rejection, bounded ignored extensions, no-store headers, machine CORS, and frozen deployment/client rate limits.
- Added exact Bearer resource middleware for every POST/GET/DELETE `/mcp` request. Duplicate headers and query/body/cookie credential alternatives fail closed. Missing credentials return a discovery challenge without `error`; invalid credentials return `invalid_token`; insufficient scope returns 403 with the minimum scope.
- Added bounded ES256 admission: eight active, thirty-two queued, two active and eight queued reserved for established traffic. Invalid-new-token work uses a 120/minute token bucket with burst thirty; keyed positive/negative caches are capped at 128/256 and still recheck key retention, time, incarnation, client, resource, grant status, and revision.
- Added immutable AsyncLocalStorage request context carrying only stable owner/client/resource/deployment/grant/token references and a process-keyed token fingerprint. Missing identity fails closed and concurrent requests do not bleed.
- Added a read-only OAuth MCP runtime using the production server and Streamable HTTP transport. Each transport call runs inside the verified request context. Session records bind owner/client/resource/binding/incarnation/grant, accept same-grant token rotation, hide cross-client/cross-grant reuse as session-not-found, and never retain the initialization token as later identity.
- Added exact MCP Origin enforcement: absent Origin is accepted for non-browser clients; otherwise only the same HTTPS host or an explicitly configured origin is accepted, with bounded echoed CORS and exposed `Mcp-Session-Id`.
- Added current-user CLI/control operations `oauth-grants list|revoke|revoke-owner`; client revoke cascades to active grants. Volume-safe status documentation now identifies Task 8A6 as next.

**Primary files:**

- New auth/runtime: `src/auth/tokenService.ts`, `src/auth/grantStore.ts`, `src/auth/requestContext.ts`, `src/auth/resourceMiddleware.ts`, `src/auth/challenges.ts`, `src/http/oauthMcpRuntime.ts`.
- Modified auth/state/control/HTTP: `src/auth/authorizationStore.ts`, `src/auth/clientStore.ts`, `src/auth/keyManager.ts`, `src/auth/oauthProvider.ts`, `src/auth/ownerApproval.ts`, `src/auth/rateLimits.ts`, `src/auth/stateStore.ts`, `src/http/publicApp.ts`, `src/http.ts`, local-control schemas/server/client/runtime, audit schemas/types, and `scripts/codexgpt.mjs`.
- New tests: `test/phase-8-token-exchange.test.mjs`, `test/phase-8-token-validation.test.mjs`, `test/phase-8-refresh-revoke.test.mjs`, `test/phase-8-request-context.test.mjs`, `test/phase-8-mcp-auth-integration.test.mjs`, and shared token helpers; inherited Phase 8 listener/authorization/owner tests were updated for the new reachable runtime.

**TDD failure evidence and repairs:**

- The first token rerun returned unexpected 503 responses because test code imported source and compiled copies of the OAuth error class. Machine-route error recognition was changed to a strict structural protocol-error contract instead of weakening response validation.
- Fixed-clock JWT tests initially failed because `jose` used wall time while grant logic used the injected test clock. Verification now passes the same explicit `currentDate` authority.
- The first full Phase 8 run exposed one stale health expectation (`mcpAvailable: false`); production health now reports the real mounted read-only MCP runtime while app-factory tests without that runtime remain unavailable.
- State invariants initially made client-revoke publication impossible because a transient revoked client could coexist with an active grant before cascade cleanup. Durable schema validation permits the transition, while every access/refresh reread independently requires an approved client, so authority is removed before success and no request can pass through the transient state.
- Adversarial review found and repaired four publication/resource gaps: provisional MCP servers are disposed when initialization never establishes a session; client-grant cascade retries complete after an audit failure; access signing occurs before durable grant publication so key drift cannot orphan an active family; GET/DELETE transport failures use the same bounded JSON-RPC error boundary as POST.
- Strict token review added exact raw JWT header/payload key inventories with duplicate-key rejection, canonical base64url segments, canonical refresh-envelope text, retained-key checks on cache hits, signing-key lifecycle pinning, client-approval checks, exact ES256 reservation tests, invalid-signature budget tests, concurrent double-refresh linearizability, safe local grant controls, MCP Origin enforcement, and post-revoke 401 on the existing session.
- The complete ordinary suite initially reported two failures with one shared cause: the new reviewed token test helper was absent from the CI discovery allowlist, and the multi-reporter child reproduced that same failure. The authoritative CI/profile/reporter tests pass 15/15 after repair. Two complete ordinary reruns were then blocked by Devspace upstream 502 responses before any repository test result was returned.

**Exact verification and results:**

- Current Node exact narrow Task 8A5 command, including auth audit, Phase 7 reconnect, streaming redaction, and approval-display safety: 38/38 pass.
- Current Node complete `test/phase-8-*.test.mjs`: 106/106 pass.
- Current Node build: pass.
- `npm run policy:check`: `Repository operational policy: PASS`.
- `git diff --check`: pass; only repository-standard LF-to-CRLF informational warnings.
- Managed toolchains are ready and supply-chain recorded: Node `20.20.2` and Node `24.15.0`.
- Managed Node 20 and Node 24 builds: pass on both.
- Managed Node 20 and Node 24 exact core token/refresh/context/MCP/audit matrix: 27/27 pass on each major.
- CI discovery, test-profile inventory, and real multi-reporter regression slice: 15/15 pass after adding the reviewed token helper to the exact allowlist.
- Real local vertical slice proves code exchange, MCP initialize, `tools/list`, one read-only `server_config` call, same-grant refresh/session continuity, cross-client session rejection, public revoke, and next MCP request `401 invalid_token`.
- No secret-bearing value is written to durable state, safe local-control responses, request context, test output, or documentation.

**Adversarial review:**

- Protocol/state pass reviewed code reuse, PKCE/redirect/resource binding, canonical JWT/refresh representations, duplicate JSON keys, signing-before-publication, generation/revision separation, replay after rotation, concurrent double refresh, restart, expiry, public/client/grant/owner revoke, retryable cascade, audit failure, and stale-client authority. All tested paths fail closed or preserve one linearizable result.
- HTTP/resource pass reviewed route aliases, methods, content types, alternate credential sources, challenge serialization, CORS/Origin, Host authority inheritance, bounded work, cache invalidation, deterministic limiter clocks, and response secret leakage. Exact routes and bounded non-oracular errors remain intact.
- MCP/compatibility pass reviewed session binding, provisional initialization cleanup, token-identity replacement per request, read-only runtime configuration, GET/POST/DELETE error containment, shutdown/pruning, Phase 7 reconnect, redaction, owner display, listener separation, Windows DPAPI, and Node 20/24 behavior. No inherited regression remains in the executed suites.
- Devspace exposed no external agent provider for this workspace. The required adversarial review was therefore performed as independent protocol/state, HTTP/security, and MCP/compatibility passes rather than claiming a multi-agent result.

**Known limits:** This is a local synthetic-client vertical slice, not live ChatGPT acceptance. Task 8A6 must connect request-local OAuth identity to exact policy/scope/tool metadata without changing existing tool counts or local authority. Browser owner administration, setup orchestration, full scopes, current live ChatGPT DCR/RFC 9207/cookie/refresh behavior, Tunnel boundary, legacy two-App rollback, G8-U, full G8-X, publication, and deployment remain incomplete or separately gated. Bearer tokens are replayable until expiry or durable revocation; DPoP/mTLS is not claimed.

**Rollback:** Revert only STEP-447 source/test/documentation changes. Existing versioned auth state and audit evidence must not be deleted automatically. Legacy mode remains the explicit no-deletion server rollback; no external resource requires rollback.

**Only next action:** Task 8A6. Implement request-local OAuth identity, exact policy/scope intersection, owner stability, and tool metadata. Keep live ChatGPT/Cloudflare work, staging, commit, push, release, and deployment separately gated.

## 2026-07-26 — STEP-448: Neat-freak reconciliation after Task 8A5

**Status:** The active knowledge base now matches the STEP-447 code boundary. Public documentation no longer says the OAuth runtime is unimplemented, but it also does not promote the local synthetic-client implementation as a supported or live-validated ChatGPT setup flow. Task 8A6 remains the only next implementation action.

**Authority and boundary:** The owner requested `@Devspace 用neat-freak 整理一下`. Work stayed inside `D:\Dev\codexpro` and modified documentation/memory only. No source/runtime behavior, dependency, credential, external infrastructure, stage, commit, push, release, or deployment changed.

**Files changed:**

- `README.md`, `README_ZH.md`, `FAQ.md`, `FAQ_ZH.md`
- `SECURITY.md`, `design.md`, `CHANGELOG.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md`
- `docs/reviews/2026-07-26-openai-codex-project-review.md`
- `Memory.md`, `docs/memory/archive/phase-8-part-2.md`

**Reconciliation:**

- Replaced false public statements that Phase 8 OAuth was design-only or unimplemented with the exact current boundary: Tasks 8A1–8A5 are locally implemented and verified, while current ChatGPT/Cloudflare acceptance, supported OAuth setup, policy/scope/tool integration, browser owner administration, and publication remain pending.
- Preserved query-token onboarding as the only supported public setup flow and retained the explicit warning that manual static Bearer configuration is not claimed for ChatGPT Web.
- Added a dedicated Phase 8 OAuth security-boundary section covering physical listener separation, constrained DCR/PKCE/resource binding, strict ES256 access tokens, replayable-Bearer limitations, authenticated rotating refresh families, durable revoke/replay, DPAPI CurrentUser, request/session binding, and the absence of authority expansion.
- Updated design copy rules so future docs distinguish published query-token onboarding, locally implemented OAuth, and compatible-client static Bearer without collapsing their readiness or trust levels.
- Added the Phase 8 vertical slice to `CHANGELOG.md` Unreleased and updated the master plan/current-action block from the stale 8A1–8A2 state to 8A1–8A5 complete / 8A6 next.
- Marked the `openai/codex` review as a historical baseline rather than rewriting its dated findings; its top-level note now points readers to the post-review 8A1–8A5 implementation status.
- Reduced `Memory.md` from 19,970 bytes to 16,312 bytes and from 113 to 100 measured lines by merging event-by-event Phase 8 history into stable status/evidence summaries. Archive pointers remain intact.

**Verification:**

- `npm run test:focused -- test/auth-documentation.test.mjs test/phase-7-documentation.test.mjs test/ci-workflow.test.mjs`: 9/9 pass.
- `npm run policy:check`: `Repository operational policy: PASS`.
- `git diff --check`: pass; only repository-standard LF-to-CRLF informational warnings.
- `Memory.md`: 100 measured lines / 16,312 bytes, below the practical 150-line / 18-KB target and the hard 200-line / 25-KB limit.
- Every Markdown archive link in `Memory.md` resolves to an existing file.
- Targeted stale-status scan across active README/FAQ/security/design/plan/review files returns no remaining claims that OAuth is unimplemented, that only 8A1–8A2 are complete, or that Task 8A5 is still next.

**Adversarial review:**

- Reader-state pass checked that a new user still receives the supported query-token setup rather than an unreleased OAuth procedure.
- Security-language pass checked that local implementation is not misrepresented as live acceptance, sender-constrained tokens, complete policy integration, or added execution authority.
- Knowledge-governance pass checked current-versus-historical status separation, memory size, archive append-only behavior, link integrity, and next-action consistency. Devspace exposed no external agent provider, so these were independent review passes rather than a claimed multi-agent result.

**Known limits:** Website HTML still documents the supported query-token flow and therefore required no readiness change. Historical archive entries retain their original point-in-time statements. The complete ordinary suite was not rerun because this step changed documentation/memory only; focused documentation, policy, link, size, and diff gates cover the affected surface.

**Rollback:** Revert only the STEP-448 documentation and memory edits. No runtime state or external resource requires rollback.

**Only next action:** Task 8A6. Route inherited tools through request-local OAuth identity and exact policy/scope intersection without changing tool counts or local authority.

## 2026-07-26 — STEP-449: Complete Task 8A6 OAuth policy identity, scope intersection, owner stability, and tool metadata

**Status:** Task 8A6 is complete locally. Every inherited tool now executes with request-local OAuth policy identity, exact token/deployment scope intersection, stable OAuth owner binding, grant-revision-sensitive approval authority, and exact per-tool OAuth metadata/challenges. V1–V5 tool names, order, counts, non-auth schemas, legacy ownership formulas, and local authority remain unchanged. Task 8A7 is the only next implementation boundary.

**Authority and boundary:** The owner explicitly instructed `@Devspace 执行task 8A6`. Work stayed inside `D:\Dev\codexpro` and built on the authorized unstaged Tasks 8A1–8A5 tree. No Cloudflare/DNS/Tunnel object, real ChatGPT App, real credential, service, staged index, commit, push, release, or deployment was changed.

**Primary implementation:**

- Added a strict OAuth policy identity carrying only safe request facts: stable subject-derived `ownerId`, grant-derived credential reference, grant revision, token id, safe client reference, mapped internal scopes, and strong assurance. Raw access/refresh tokens, raw public client ids, token fingerprints, and key material never enter policy identity, challenge metadata, durable approval grants, or documentation.
- Replaced session-frozen OAuth identity reads with request-local identity resolution from the existing AsyncLocalStorage context. Missing request identity fails closed before tool or policy execution; legacy/static session sources retain compatibility through the same interface.
- Added deterministic public-to-internal scope mapping and the exact effective ceiling: current deployment capability intersected with the current token's mapped scopes. Existing hard policy, permission profiles, approvals, transactions, audit, Git/worktree checks, and execution gates remain downstream and cannot be widened by OAuth.
- Added exact per-tool OAuth scope classification and descriptor publication in both MCP metadata locations. Read tools require `codexgpt:read`; filesystem/Git/worktree/handoff mutations add `codexgpt:write`; shell/process/full-access tools add `codexgpt:execute`; the mixed self-test requires all three because its default probes may write and execute.
- Added the three-way runtime decision: locally disabled capability returns a bounded local-configuration denial without an OAuth challenge; an enabled capability missing only from the token returns a normal MCP result with canonical `mcp/www_authenticate` step-up metadata; a fully scoped call continues into the existing Policy Kernel.
- Added stable OAuth ownership domains. Access-token, refresh-token, signing-key, incarnation, and grant-revision changes do not change the OAuth owner; grant revision remains a credential-revision fact that invalidates stale approval grants. Cross-subject and cross-auth-domain ownership remain distinct and non-disclosing.
- Preserved legacy byte-level behavior: legacy policy identity scopes, credential revision digest, workspace identity binding, V4 owner formula, process context, and Git context/owner fingerprints keep their prior derivations. OAuth uses a stable owner-only projection where process/Git/workspace continuity must survive token rotation.
- Removed the 8A5 read-only runtime downgrade. OAuth MCP now uses the real configured production capability profile, production Git bootstrap, Policy Kernel source, local approval runtime, and semantic runtime while preserving the same tool projections and local authority ceilings.
- Added a fail-closed production guard requiring a request-local policy identity source whenever OAuth tool security is installed. The pinned MCP SDK currently drops unknown top-level tool fields, so OAuth mode wraps its owned `tools/list` handler to publish the exact top-level `securitySchemes`; real wire integration tests freeze this SDK seam.

**Primary files:**

- New: `src/auth/policyIdentity.ts`, `src/auth/toolSecurity.ts`, `test/phase-8-policy-identity.test.mjs`, `test/phase-8-scope-enforcement.test.mjs`, `test/phase-8-tool-security-metadata.test.mjs`, `test/phase-8-owner-binding.test.mjs`.
- Modified: policy identity/context/types/schemas/runtime/evaluator/approval, change-set ownership, server registration/wrapping, production runtime, OAuth MCP runtime, HTTP composition, auth exports, real MCP integration tests, and active status/security documentation.

**TDD and adversarial repairs:**

- Initial review found that the 8A5 runtime hard-disabled write, execution, Git, transactions, policy, and audit; the runtime now retains the configured local profile and adds OAuth only as an additional ceiling.
- A first identity-source design captured identity during MCP initialization. It was replaced with request-local resolution so refreshed tokens and grant revisions are observed on every call.
- The first policy implementation appended V3/V4 scopes after OAuth identity creation, which could bypass token scope intersection. Scope expansion is now computed only inside the deployment/token intersection, while the legacy path reconstructs its exact historical inherited scopes.
- Early owner helpers changed legacy hashes and credential revisions. Independent compatibility review restored the exact legacy formulas and limited new stable owner projections to OAuth identities.
- Full OAuth identity in process/Git/workspace ownership would have made token rotation appear as a new owner. Stable ownership projections now contain only the OAuth owner domain while request authorization still uses current token and grant-revision facts.
- Annotation-based review exposed `codexgpt_self_test` as a mixed-capability bypass because its default probes can write and execute; its OAuth contract now requires all three coarse scopes.
- OAuth tool wrapping without a policy identity source could have produced ownerless/session-only behavior. Server construction now rejects that composition before allocation.
- The MCP SDK registration path preserved `_meta.securitySchemes` but omitted top-level `securitySchemes`; the owned `tools/list` wrapper restores the protocol field, with exact wire tests and unchanged discovery order/counts.
- One overloaded combined Phase 8/documentation run produced a single generic file-level failure for the MCP integration file. The file immediately passed 3/3 alone and the complete Phase 8 parallel rerun passed 120/120; no persistent code failure was reproduced.

**Exact verification and results:**

- Current Node build: pass.
- Exact Task 8A6 narrow plus inherited compatibility command: 58/58 pass.
- Real OAuth MCP integration: 3/3 pass, including read-only call, exact metadata, read-token/write-tool step-up challenge, zero mutation, same-grant refresh continuity, cross-client rejection, and revoke-to-401.
- Complete current `test/phase-8-*.test.mjs`: 120/120 pass.
- Documentation/CI focused tests: 9/9 pass.
- Managed Node `20.20.2` and `24.15.0` builds: pass on both.
- Managed Node 20 and Node 24 OAuth/policy/MCP/inherited-contract matrix: 61/61 pass on each major.
- `npm run policy:check`: `Repository operational policy: PASS`.
- `git diff --check`: pass; only repository-standard LF-to-CRLF informational warnings.
- `Memory.md`: 124 measured lines / 17,537 bytes, below the practical 150-line / 18-KB target and the hard 200-line / 25-KB limit.

**Adversarial review:**

- Protocol/scope pass reviewed exact tool classification, metadata locations, deterministic scope order/union, disabled-versus-step-up semantics, challenge injection, token leakage, supertool child dispatch, and no-rescan behavior.
- Identity/ownership pass reviewed token/refresh/signing/grant rotation, stable subject ownership, credential-revision invalidation, process/Git/workspace continuity, cross-subject/auth-domain separation, approval reuse, and raw identifier leakage.
- Compatibility/runtime pass reviewed legacy byte formulas, V1–V5 universes, production capability composition, Git bootstrap disposal, request-context lifecycle, pinned SDK tool-list serialization, shutdown/pruning, current/Node 20/24 behavior, and documentation readiness claims.
- Devspace exposed no separate agent provider. The required adversarial review was performed as three independent passes rather than claiming a multi-agent result.

**Known limits:** This remains a local synthetic-client implementation, not live ChatGPT or Cloudflare acceptance. Browser owner administration, one-command setup, Tunnel verification, real current-client behavior, two-App rollback acceptance, G8-U, full G8-X, publication, and deployment remain incomplete or separately gated. Bearer tokens remain replayable until expiry or durable revocation; DPoP/mTLS and OS sandboxing are not claimed. Top-level OAuth tool metadata depends on the pinned MCP SDK handler seam and is guarded by exact SDK and wire tests.

**Rollback:** Revert only STEP-449 source/test/documentation changes. Do not delete auth state, approval/audit evidence, credentials, Apps, or external infrastructure. Legacy mode remains the explicit no-deletion server rollback.

**Only next action:** Task 8A7. Implement one-command setup, current-user local operations, and fail-closed Tunnel verification. Keep live ChatGPT/Cloudflare mutation, staging, commit, push, release, and deployment separately gated.

## 2026-07-26 — STEP-450: Complete Task 8A7 supported OAuth setup, local operations, Tunnel verification, and recovery

**Status:** Task 8A7 is complete locally. The supported entry now exposes a workspace-scoped `codexgpt auth` operating surface for setup, status, local owner approval, client/grant/key administration, diagnostics, rollback, backup restore, stale-lock recovery, reinitialization, and canonical-root rebind. OAuth mode is committed only after exact public metadata, JWKS, and health verification. Task 8A8 is the only next boundary.

**Authority and boundary:** The owner explicitly instructed `@Devspace 执行task 8A7`. Work stayed inside `D:\Dev\codexpro` and built on the authorized unstaged Tasks 8A1–8A6 tree. No real Cloudflare DNS route, Tunnel, ChatGPT App, credential, service installation, staged index, commit, push, release, or deployment was changed. Setup code can perform bounded external provisioning only after an explicit interactive confirmation or `--provision-tunnel`; that path was not executed here.

**Primary implementation:**

- Added `scripts/oauth-admin.mjs` and routed `codexgpt auth` through the supported entry before connector startup. Commands cover `setup`, `status`, `doctor`, `pending`, `open`, `approve`, `deny`, `clients`, client removal, unapproved-client pruning, grant revoke, owner-wide revoke, signing-key rotation, rollback, recovery inspect/restore/unlock, reinitialize, and rebind.
- Added exact workspace/runtime discovery without requiring users to copy internal server ids. Runtime markers are atomically stored per profile and bind canonical root, stable binding, incarnation, server id, PID, exact Windows process creation time, local-admin origin, and start time. Stale or PID-reused markers are removed only after identity mismatch is proven.
- Added a one-time local-admin browser bootstrap carried only in the URL fragment. Bootstrap exchange requires exact loopback origin, then issues an `HttpOnly; SameSite=Strict` session cookie plus a separate CSRF token. Sessions are capped at four, idle-expire after fifteen minutes, absolutely expire after eight hours, and reject duplicate cookies, bad Host, non-loopback peers, wrong Origin, missing CSRF, replayed bootstrap values, and unknown routes.
- Replaced the unauthenticated OAuth local-status URL with a reviewed local-only UI. The UI lists pending links, clients, and grants and performs approve/deny/remove/revoke through the same current-user named-pipe owner service used by CLI commands. All responses are no-store; CSP, framing, referrer, MIME, Host, Origin, and DOM text boundaries fail closed.
- Added exact dedicated Cloudflare configuration generation and validation. The config permits only one reviewed hostname route to `http://127.0.0.1:<publicPort>` plus the terminal `http_status:404`; it rejects shared routes, extra fields, local-admin exposure, mismatched credentials files, invalid tunnel ids, and self-update drift. A separate owner marker binds the config to exact profile, stable binding, tunnel id/name, and hostname.
- Added fail-closed Tunnel selection. Cold setup will not reuse a same-name Tunnel without exact setup-journal ownership evidence; ambiguous or unowned names stop before DNS or ingress mutation. Existing configs require exact owner-marker proof. Rebind updates only the owner marker after preserving hostname/issuer/resource and does not rewrite Cloudflare routes.
- Added resumable setup journaling with a bounded monotonic phase history: preflight, candidate local state, login-required, Tunnel creation, DNS route, ingress write, candidate listeners, external probe, mode commit, and foreground state. Managed pinned `cloudflared` is verified by version and SHA-256 before use.
- Setup creates local candidate state first, retains legacy mode during probing, starts the candidate with a process-local OAuth override, and verifies protected-resource metadata, authorization-server endpoints, active local signing `kid`, ES256 JWKS shape, and authenticated MCP health over the public hostname. Only then is the workspace profile committed to OAuth. Failure or `--no-start` stops the exact candidate process tree; setup never deletes old auth state.
- Added safe mode-aware connector UX. OAuth startup prints only the token-free server URL and pending-link count; `a` opens the authenticated local approval page through a one-time owner-channel bootstrap. Legacy query-token behavior remains unchanged.
- Added `doctor` integration for OAuth profiles. It verifies native Windows, complete selectors, DPAPI CurrentUser, installation owner/registry/current deployment consistency, managed `cloudflared`, dedicated ingress, owner marker, exact runtime identity, local-admin health, current-user owner control, and public metadata/JWKS/MCP health. A stopped service is a warning; key/state/Tunnel inconsistencies are failures.
- Added immutable protected deployment backups before destructive owner operations, key rotation, restore, reinitialize, and rebind. Backups are integrity-checked, audit-first, remain discoverable across incarnations under the stable binding, and never expose plaintext secret material. Restore/reinitialize/rebind generate a new signing key, pepper, epoch, and incarnation and clear prior grants/clients.
- Added explicit destructive confirmations. Interactive operations require exact phrases; noninteractive operations require command-specific flags for owner-wide revoke, forced relink restore, stale-owner recovery, and reinitialization. Rebind requires distinct source/target roots, a clean target with no OAuth selectors or live runtime, exact source Tunnel ownership, stable issuer/resource/binding, and `--revoke-all`.
- Added no-deletion rollback. `auth rollback` changes only the profile selector to legacy after detecting environment precedence; it preserves OAuth state, keys, clients, grants, audit, Tunnel routes, and the separately retained OAuth App, and states when a currently running process must be stopped/restarted.

**Primary files:**

- New runtime/CLI: `scripts/oauth-admin.mjs`, `src/auth/localAdminSession.ts`, `src/auth/cloudflareConfig.ts`, `src/auth/runtimeStatus.ts`, `src/http/localAdminApp.ts`.
- Modified composition/control/state: `scripts/codexgpt-entry.mjs`, `scripts/codexgpt.mjs`, `scripts/doctor.mjs`, `scripts/cloudflared-installer.mjs`, `src/http.ts`, auth state/recovery/registry/client/owner modules, local-control schemas/server/client/runtime, audit schemas/types, and execution-profile inventory.
- New tests: `test/phase-8-auth-cli.test.mjs`, `test/phase-8-auth-doctor.test.mjs`, `test/phase-8-auth-ui.test.mjs`, `test/phase-8-cloudflare-config.test.mjs`, and `test/phase-8-local-admin-session.test.mjs`; inherited listener, approval, recovery, key-rotation, package, help, and profile tests were updated for the supported contract.

**TDD and adversarial repairs:**

- Initial RED tests established missing Tunnel/config and local-session modules before implementation.
- Replaced the old unauthenticated local-status expectation with the one-time bootstrap contract; OAuth mode now exposes no reusable local-admin URL.
- Bound runtime discovery to Windows process creation time, not PID alone, and added stale-marker cleanup tests.
- Tightened Cloudflare ownership after review: same-name unowned Tunnels fail closed; credentials-file basename must equal the exact tunnel id; `no-autoupdate` cannot drift; local-admin ingress and shared configs are rejected.
- Bound bootstrap exchange to its issued origin and made duplicate admin cookies invalid.
- Added pre-mutation backups after review exposed that key/client/grant mutations lacked operator-restorable evidence. Cross-incarnation enumeration repaired a second issue where reinitialize/rebind backups would otherwise be invisible from the new incarnation.
- Moved backup creation after restore/rebind validation so malformed input creates neither a new incarnation nor misleading backup evidence.
- Added exact rebind target protection and owner-marker migration to prevent same-root overwrite, target takeover, or dual-active ownership.
- Changed doctor runtime absence from failure to warning while retaining fail-closed state/key/Tunnel findings.
- Updated outdated test fixtures for exact Tunnel credential naming and the secured local-admin route.
- Corrected managed-toolchain discovery from the stale planned root to the existing retained `%LOCALAPPDATA%\CodexGPT\toolchains\` root. The two failed root lookups performed no installation or mutation.

**Exact verification and results:**

- Exact Task 8A7 narrow slice: 29/29 pass.
- Complete current Phase 8 explicit set: 141/141 pass.
- Managed Node `20.20.2` complete Phase 8 set: 141/141 pass.
- Managed Node `24.15.0` complete Phase 8 set: 141/141 pass.
- Current, managed Node 20, and managed Node 24 builds: pass on all three.
- Package/public-help/auth-documentation/test-profile/CI/connector-contract slice: 36/36 pass.
- `npm run policy:check`: pass.
- `npm pack --dry-run --json`: pass; the published package includes `scripts/oauth-admin.mjs` and excludes internal memory archives.
- `git diff --check`: pass; only repository-standard LF-to-CRLF informational warnings.
- No secret, bootstrap value, cookie, CSRF token, client secret, private key, raw refresh value, or internal server id is printed by supported status/setup output.

**Adversarial review:**

- Setup/Tunnel pass reviewed default no-mutation behavior, login handoff, exact Tunnel identity, same-name conflicts, DNS route ordering, config atomicity, owner-marker binding, external-probe-before-commit, candidate cleanup, idempotent running-state return, and legacy-mode preservation on failure.
- Local-admin/control pass reviewed loopback/Host/Origin/CSRF/cookie/bootstrap boundaries, session caps/expiry/replay, DOM injection, no-store/CSP, current-user pipe reuse, stale PID evidence, safe response fields, correlation-code resolution, and secret/log leakage.
- Recovery/compatibility pass reviewed audit-before-state ordering, protected backup integrity and visibility, restore/reinitialize/rebind authority reset, invalid-input side effects, stable binding/issuer/resource, target-root takeover, rollback precedence, existing legacy query-token behavior, package entry, and current/Node 20/24 behavior.
- Devspace exposed no separate agent provider. The required adversarial review was therefore performed as three independent passes rather than claiming a multi-agent result.

**Known limits:** This is local and synthetic verification, not live Cloudflare or ChatGPT acceptance. Current ChatGPT DCR, RFC 9207, cookie/navigation, refresh, relink, and App behavior remain external assumptions for Task 8A8/G8-U. No live Tunnel/DNS/App mutation, publication, or deployment occurred. Bearer tokens remain replayable until expiry or durable revocation; DPoP/mTLS and OS sandboxing are not claimed.

**Rollback:** Revert only STEP-450 source/test/memory changes. Do not delete OAuth state, protected backups, audit evidence, credentials, Apps, DNS routes, or Tunnel objects. Operational rollback is `codexgpt auth rollback --root <workspace>`, followed by stopping the current OAuth run and starting the retained Legacy App flow.

**Only next action:** Task 8A8. Verify current ChatGPT client behavior and reconcile operator/public documentation while keeping live Cloudflare/ChatGPT mutation, staging, commit, push, release, and deployment separately gated.

## 2026-07-26 — STEP-451: Complete Task 8A8 migration, documentation, package, and full synthetic integration

**Status:** Task 8A8 is complete locally. Phase 8 now has exact English/Chinese onboarding, two-App migration and rollback instructions, a static public OAuth resource-documentation page, package/private-state boundaries, a complete synthetic public-plus-local-listener operator journey, refresh durability beyond 1,024 rotations, and portable verification-command contracts. Task 8A9 completed-runtime adversarial repair is the only next implementation boundary; current live ChatGPT/Cloudflare acceptance remains G8-U.

**Authority and boundary:** The owner explicitly instructed `@Devspace 执行task 8A8`. Work stayed inside `D:\Dev\codexpro` and built on the authorized unstaged Tasks 8A1–8A7 tree. No Cloudflare DNS route, Tunnel object/configuration, real ChatGPT App, credential, service, package publication, release, deployment, staged index, commit, or push was changed. Current OpenAI documentation was inspected only to keep operator wording and unverified compatibility assumptions truthful.

**Primary implementation:**

- Replaced stale public readiness text with the exact boundary: Tasks 8A1–8A8 are locally verified, while G8-U is still required before claiming current ChatGPT compatibility.
- Added one exact published and source-checkout `auth setup --root` path, token-free Server URL, local pending/open/approve commands, normal restart behavior, scope-versus-descriptor rescan guidance, protected recovery semantics, and an explicit two-App rollback/return procedure in English and Chinese.
- Added named-Tunnel documentation that exposes only `127.0.0.1:8787`, never routes local administration on `127.0.0.1:8788`, rejects Quick/shared/unowned Tunnels, retains `--no-tunnel-changes`, and commits OAuth mode only after public metadata/JWKS/health probing.
- Expanded the public root into static resource documentation for discovery, PKCE S256, RFC 9207 issuer binding, header-only Bearer credentials, constrained DCR and ignored unknown extensions, bounded public work, stable OAuth errors, and the physically separate owner listener. Corrected the obsolete read-only MCP description.
- Added package assertions for the OAuth admin entry, Windows DPAPI helper/manifest/protocol, compiled auth/HTTP runtime, and exclusion of private OAuth state/backups.
- Added an HTTP-level synthetic operator journey using physically separate public and local-admin listeners: metadata and DCR, public authorization with PKCE, fragment bootstrap plus cookie/Origin/CSRF local approval, RFC 9207 callback, code exchange, MCP initialize/list/read/write/safe-execute, public revoke, immediate session rejection, and relink.
- Added a durable refresh-family regression that completes 1,025 single-use rotations without changing the grant/client authority.
- Added a plan-command contract that rejects shell-dependent glob expansion, verifies every referenced test exists, binds all managed-toolchain commands to the retained `%LOCALAPPDATA%\CodexPro\toolchains` root, and freezes critical onboarding/security/Tunnel instructions.
- Registered the new command-contract test in the fail-closed Windows execution-profile inventory and added the new OAuth CLI/runtime writers to the reviewed mutation inventory.

**TDD and repair evidence:**

- The initial Phase 8 integration command accidentally expanded PowerShell variables in Bash and overloaded the full suite. It still exposed one real defect: 8A7 OAuth admin/runtime-status writers were missing from the mutation inventory. The inventory was repaired and its focused gate passed.
- The first detached ordinary run, `2026-07-26T16-57-45-692Z-phase8-a8-ordinary-33661669`, failed before tests with `TEST_PROFILE_INVENTORY_DRIFT` because the new plan-contract test was not assigned to a Windows execution profile. The test was added to the fast profile and the inventory gate passed 8/8.
- A second ordinary run was stopped through the owned long-task runner before completion because review showed the complete integration test should exercise the actual separate local-admin HTTP listener rather than direct in-process approval. No orphan process remained. The strengthened test passed on current Node and both managed majors.
- Current OpenAI guidance recommends refresh-token support and describes `offline_access` for OIDC providers. CodexGPT is an OAuth authorization server, not an OIDC provider, and already issues rotating refresh tokens; no unsupported `openid`/ID-token/userinfo claim or speculative scope was added. Live refresh/cookie/navigation/relink behavior remains a G8-U observation requirement.

**Exact verification and results:**

- Current Node complete explicit Phase 8 set: 150/150 pass.
- Managed Node `20.20.2` complete explicit Phase 8 set: 150/150 pass.
- Managed Node `24.15.0` complete explicit Phase 8 set: 150/150 pass.
- Current and managed builds: pass for the affected source/runtime boundary.
- Final documentation/package/mutation/help/execution-profile slice: 29/29 pass.
- Final dual-major ordinary domain run `2026-07-26T17-08-15-679Z-phase8-a8-ordinary-final-82dacd95`: exit 0; temporary state cleaned; stderr empty.
- Final dual-major Smoke run `2026-07-26T17-23-57-260Z-phase8-a8-smoke-final-38dd748d`: exit 0; temporary state cleaned; stderr empty.
- `npm run policy:check`, `npm pack --dry-run --json`, and `git diff --check`: pass. Package output retains reviewed OAuth runtime/admin files and excludes internal memory/private OAuth state.

**Adversarial review:**

- Protocol/runtime pass reviewed public/local listener separation, exact authorization callback issuer, DCR extension handling, local bootstrap/cookie/Origin/CSRF approval, token and session binding, read/write/execute scope enforcement, immediate revoke, relink, and refresh-family longevity.
- Security/package pass reviewed query-token exclusion in OAuth mode, no static-Bearer/Cloudflare Access/mTLS/DPoP claim, no local-admin ingress, DPAPI same-user limitation, secret-free docs/tests/output, exact mutation inventory, package inclusion, and private-state exclusion.
- Operator/compatibility pass reviewed one-command setup, source-checkout fallback, stable named Tunnel, Scan Tools boundaries, restart, two-App rollback, idempotent OAuth return, recovery-forces-relink semantics, current OpenAI UI wording, and the distinction between local synthetic evidence and G8-U acceptance.
- Devspace exposed no separate agent provider. The required review was therefore performed as three independent adversarial passes rather than claiming a multi-agent result. No remaining Task 8A8 defect was found after the repairs above.

**Known limits:** No real ChatGPT App, Cloudflare Tunnel/DNS route, credential migration, package publication, deployment, or exact-head CI was exercised. Current ChatGPT DCR, RFC 9207 callback handling, cookie/navigation behavior, rotating-refresh behavior, cached-App repair, and relink behavior remain unobserved external assumptions until G8-U. Task 8A9 must review the completed runtime before external acceptance and closure gates.

**Rollback:** Revert only STEP-451 documentation, public-resource text, test, package-contract, execution-profile, and mutation-inventory changes. Do not delete OAuth state, backups, audit evidence, Apps, credentials, DNS routes, or Tunnel objects. No external resource requires rollback.

**Only next action:** Task 8A9. Adversarially review and repair the completed runtime without external mutation; keep real ChatGPT/Cloudflare acceptance in G8-U and publication/deployment/staging/commit/push separately gated.
