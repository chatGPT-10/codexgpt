# Phase 8 OAuth and Public Authentication — Volume 4

This volume continues the append-only Phase 8 implementation and live-acceptance record after Volume 3 closed at STEP-460.

## 2026-07-27 — STEP-461 — Close real ChatGPT Journey U3 restart/refresh

**Status:** Journey U3 is closed through the existing `codexgpt-Windows` ChatGPT App. After the live same-profile restart and refresh exercises from STEP-460, the existing App performed a real read without any new local approval or pending authorization. Gate G8-U continues with Journey U4 revoke/relink; U5–U7 and G8-X remain incomplete.

**Goal:** Complete the sole remaining current-client acceptance condition from STEP-460: prove that the already-linked ChatGPT App resumes after restart using its durable grant/refresh state, rather than silently requiring a fresh authorization.

**User-observable evidence:**

- The existing `codexgpt-Windows` App was instructed to call `open_current_workspace`, then `read` the current default workspace `package.json`, without writing files, executing shell commands, or requesting additional permissions.
- The real App returned `name: codexgpt` and `version: 0.28.6`, matching the repository file and proving that the request traversed the active CodexGPT App rather than being answered from an expected-value prompt alone.
- Immediately after that call, local owner status still reported `Pending 0`, `Clients 1`, and `Active grants 2`. No new local approval was created or consumed.

**Runtime evidence:**

- Runtime remained healthy at PID `19796` on the existing OAuth profile.
- Hostname remained `codexpro-oauth.drliang.uk`; the dedicated named Tunnel remained `codexpro-oauth-20260726`.
- Public `/healthz` and local-admin `http://127.0.0.1:8790/healthz` each returned HTTP `200` after the real App call.
- No hostname, DNS, Tunnel route, public/local port, profile capability, OAuth binding/incarnation, client, grant, key, credential, or workspace content changed during this closure check.

**Closure verification:**

- `node scripts/codexgpt-entry.mjs auth status --root D:/Dev/codexpro` — runtime running, `Pending 0`, `Clients 1`, `Active grants 2`.
- Public and local-admin health after the real App call — HTTP `200/200`.
- `npm run test:focused -- test/phase-8-plan-command-contract.test.mjs test/package-contents.test.mjs` — `9/9` passed.
- `npm run policy:check` — `Repository operational policy: PASS`.
- `git diff --check` — passed with only existing LF-to-CRLF working-tree warnings.
- Relative Markdown link audit across the updated active documents — passed.
- Changed-document private-key/JWT signature scan — passed.
- `Memory.md` remained within its practical limit at 123 lines / 15,824 bytes; this Volume 4 began at 42 lines / 4,935 bytes before this verification addition.

**Inherited STEP-460 evidence retained:**

- Same-profile restart preserved binding/incarnation, approved ChatGPT grants, and zero pending authorization.
- Refresh rotation preserved stable OAuth subject/client/grant ownership and same-session workspace access.
- Local-admin-only migration `8790→8791→8790` preserved existing grant validity.
- A dropped successful refresh response deterministically produced old-token retry `400 invalid_grant` and family state `revoked/replay`, never HTTP 500 or a stalled ambiguous state.
- Focused inherited refresh/auth/MCP/workspace regressions passed `47/47`; task-worktree durable owner-store passed `1/1`; build, Phase 8 documentation contract `7/7`, policy, diff, and changed-content secret checks passed.

**Files changed:** `AGENTS.md`, `README.md`, `README_ZH.md`, `SECURITY.md`, `design.md`, `Memory.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/reviews/2026-07-26-openai-codex-project-review.md`, the Phase 8 design/plan status, and this new archive volume.

**Decision and user impact:** A durable grant record alone was not treated as current-client acceptance. U3 closed only after the actual App read succeeded and the owner channel independently confirmed zero pending approval. Normal OAuth restart therefore requires no user relink ceremony under the tested stable hostname/profile/binding conditions.

**Adversarial review:** The result was checked against false-positive paths: expected-value prompting, stale local status, hidden reauthorization, descriptor-only success, profile drift, port drift, and accidental Cloudflare mutation. The read returned live repository data, the status check followed the call, and both health surfaces remained live. DevSpace exposed no separate agent provider, so this was a manual correctness/security/operability review rather than a claimed multi-agent result.

**Risks and limitations:** U3 proves restart/refresh continuity for the existing approved App under an unchanged hostname/profile/binding. It does not prove revoke/relink, backup recovery, legacy rollback, copied-Bearer limitations, or the remaining Tunnel-negative cases; those remain U4–U7. G8-X and exact-head publication evidence remain mandatory before Phase 8 closure.

**Rollback:** No rollback is required. The runtime remains on the original OAuth profile, hostname, public port `8789`, local-admin port `8790`, approved client, and two active grants. No production source behavior or external configuration changed in this closure step.

**Next approved action:** Execute Gate G8-U Journey U4 revoke/relink against the existing OAuth App, then continue U5 negative/recovery, U6 cached-App/legacy rollback, U7 Tunnel boundary, and G8-X. Publication, credential migration, staging, commit, push, release, deployment, and unrelated Cloudflare/DNS/Tunnel mutation remain separately gated.

## 2026-07-27 — STEP-462 — Close real ChatGPT Journey U4 revoke/relink

**Status:** Journey U4 is closed through the existing `codexgpt-Windows` ChatGPT App. The current App grant was revoked locally, the next real App request entered the OAuth relink flow instead of continuing with old authority, one new local approval restored a distinct read-only grant, and the revoked read/write grant remained durably revoked. Gate G8-U continues with U5 negative/recovery; U6–U7 and G8-X remain incomplete.

**Goal:** Prove against the real retained ChatGPT client that local grant revocation takes effect immediately, produces a safe relink path, requires current-user approval, restores service only under new authority, and does not revive the revoked access/refresh family.

**Live actions and user-observable evidence:**

- Owner status identified the currently used ChatGPT read/write grant by its most recent use. The supported exact-root command `auth revoke <grant-id>` returned `OAUTH_GRANT_REVOKED`; no client-wide revoke, owner-wide revoke, key rotation, profile change, restart, or Cloudflare mutation was performed.
- The next real `codexgpt-Windows` call could not continue under the revoked authority. ChatGPT displayed `Authorization pending` for the existing `ChatGPT` client and requested only `codexgpt:read`, proving the failure entered the intended relink flow rather than silently falling back or widening scope.
- The current pending request was approved through the current-user owner CLI. ChatGPT had issued an overlapping retry for the same client/scope; the approved current request created the new grant, while the stale browser branch conferred no authority and was explicitly denied. Final owner status returned to zero pending authorization.
- A real post-relink `open_current_workspace` call succeeded against `D:\Dev\codexpro`. The pre-revoke session-scoped workspace handle returned `WORKSPACE_NOT_FOUND`, so stale transport-local workspace state did not survive the revoke/relink boundary.
- Final owner status showed the same approved ChatGPT client, a new active read-only grant, and the old read/write grant still `revoked` with reason `local`. The old grant remained revoked after the new grant had refreshed several times; no access token, refresh token, authorization code, cookie, DPAPI material, private key, or client secret was printed or persisted.
- Public `https://codexpro-oauth.drliang.uk/healthz` and local-admin `http://127.0.0.1:8790/healthz` each returned HTTP `200` after relink.

**Exact verification:**

- `node scripts/codexgpt-entry.mjs auth revoke <current-grant-id> --root D:\Dev\codexpro` — `OAUTH_GRANT_REVOKED`.
- Real ChatGPT call after revoke — user-observed `Authorization pending` for `ChatGPT`, requested scope `codexgpt:read`.
- Current-user CLI approval of the current pending request — approved; obsolete same-client retry branch — denied.
- Real `codexgpt-Windows.open_current_workspace` after approval — passed and returned the canonical root `D:\Dev\codexpro`.
- Final redacted owner status — `pending: 0`; same client remained `approved`; new read-only grant `active`; revoked read/write grant remained `revoked/local`.
- `npm run test:focused -- test/phase-8-refresh-revoke.test.mjs test/phase-8-authorization.test.mjs test/phase-8-mcp-auth-integration.test.mjs test/phase-8-owner-binding.test.mjs` — `25/25` passed.
- Public/local health — HTTP `200/200`.
- `npm run test:focused -- test/phase-8-plan-command-contract.test.mjs test/package-contents.test.mjs` — `9/9` passed.
- `npm run policy:check` — `Repository operational policy: PASS`.
- `git diff --check` — passed with only existing LF-to-CRLF working-tree warnings.
- Relative Markdown link audit across the 12 updated active/evidence documents — passed.
- Changed-document private-key/JWT/correlation-code pattern scan — passed.
- `Memory.md` remained within its practical limit at 124 lines / 16,286 bytes; Phase 8 Volume 4 remained below its continuation threshold at 90 lines / 11,977 bytes before this final verification addition.

**Files changed:** Runtime source files: none. Status and evidence documentation: `AGENTS.md`, `Memory.md`, `README.md`, `README_ZH.md`, `SECURITY.md`, `design.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/reviews/2026-07-26-openai-codex-project-review.md`, `docs/superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md`, `docs/superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md`, and this archive volume.

**Decision and user impact:** Local revoke is now accepted as an immediate current-client cut-off, not merely a durable database transition. The real App required one new local approval and returned with least-privilege read-only scope. Existing client registration, hostname, Tunnel, binding, incarnation, and runtime remained unchanged; relink replaced grant authority rather than recreating deployment identity.

**Adversarial review:** The result was checked against stale-token fallback, hidden scope widening, client recreation, implicit approval, stale pending authority, grant resurrection, workspace-handle leakage, and external configuration drift. The relink created a distinct read-only grant, the revoked read/write grant remained revoked, the stale pending branch was denied, and public/local health stayed stable. DevSpace exposed no separate agent provider, so this was a manual security/correctness/operability review rather than a claimed multi-agent result.

**Risks and limitations:** ChatGPT does not expose its raw Bearer or refresh values, so old-token invalidation is evidenced by the real App entering relink, the durable revoked grant after successful new-grant use, and the focused access/refresh revocation regressions rather than by printing and manually replaying client secrets. The overlapping same-client retry is allowed by the bounded browser-binding design but can leave a stale pending request until denial or expiry; U5 will exercise denial, expiry, replay, malformed-token, recovery, and bounded-admission paths directly. The older U2 read-only grant remains an independent durable grant, but the current App did not resume through it after the actively used read/write grant was revoked.

**Rollback:** No rollback is required. The deployment remains on the original OAuth profile, hostname, public/local ports, client registration, binding, incarnation, and dedicated Tunnel. The accepted current state is the new read-only grant plus durable revoked history; restoring the revoked grant is neither required nor supported.

**Next approved action:** Execute Gate G8-U Journey U5 negative/recovery, then U6 cached-App/legacy rollback, U7 Tunnel boundary, and G8-X. Publication, credential migration, staging, commit, push, release, deployment, and unrelated Cloudflare/DNS/Tunnel mutation remain separately gated.

## 2026-07-27 — STEP-463 — Close Journey U5 negative/recovery

**Status:** Journey U5 is closed against the live dedicated OAuth deployment plus controlled-clock/private-key regressions. Denial, non-oracular continue behavior, invalid registration/credentials/tokens, refresh replay, bounded malformed traffic, environment override repair, and verified-backup recovery behaved as designed. The recovery path intentionally created a new incarnation and invalidated every prior client/grant/token authority; the retained ChatGPT OAuth App must relink on its next request. U6–U7 and G8-X remain incomplete.

**Goal:** Exercise the failure and recovery boundaries that cannot be inferred from a successful link: deny and terminalize an authorization safely, reject hostile protocol inputs without creating an oracle, state the copied-Bearer limitation truthfully, preserve service for an established client under bounded invalid traffic, prove environment override diagnostics, and restore a verified pre-revoke backup without reviving old authority or changing the stable deployment/Tunnel identity.

**Live negative evidence:**

- A disposable ChatGPT-compatible DCR client entered authorization, was denied through the supported owner CLI, and completed only through the original cookie-bound one-use continue path. The callback returned `access_denied`, preserved the original `state`, included the exact issuer, and contained no authorization code. Cross-cookie status/continue and double continue returned non-oracular HTTP `404`.
- A DCR request using `https://example.com/callback` returned HTTP `400 invalid_redirect_uri` with no client created. A query credential in OAuth mode returned HTTP `401`; a signature-tampered access token returned HTTP `401`.
- The same valid access Bearer initialized two independent MCP transports before expiry/revocation. This is the truthful Core limitation: access tokens are not DPoP- or mTLS-sender-constrained and remain copy-replayable until expiry or durable revocation.
- A separate single-use refresh token rotated successfully once; retrying the old token returned HTTP `400 invalid_grant`, and owner status showed the family durably `revoked/replay`.
- Forty unique invalid Bearers returned only HTTP `401`/`429`; forty cross-cookie authorization polls returned `404`. During the same flood, an already established legitimate MCP session completed `tools/list` and returned the exact 26-tool read-only snapshot. No unbounded queue, success oracle, or starvation of established service was observed.
- Current-process `CODEXGPT_AUTH_MODE` and persisted-user `CODEXGPT_AUTH_MODE` each blocked profile rollback with `AUTH_MODE_ENV_OVERRIDE` and the exact repair command for that source. The temporary persisted-user value was restored to its original empty state.

**Controlled negative evidence:**

- The focused authorization regression proved expiry produces a code-free `temporarily_unavailable` callback through the original cookie-bound continue path, preserving state/exact issuer; cross-cookie, double, and late continue remain non-oracular.
- Strict access-token regressions rejected wrong issuer/audience/resource/scope/signature/key/time, malformed and non-canonical tokens, duplicate claims, wrong type, oversize input, and expired tokens without exporting the production private key or minting hostile production tokens.
- Recovery regressions rejected tampered backups before publication and proved crash-before-pointer retains the old authoritative incarnation while crash-after-pointer exposes one complete new incarnation.
- Admission regressions retained exact ES256 active/queue reserves for established traffic and bounded failed-new-token signature work.

**Verified-backup recovery:**

- The live journey captured the baseline backup inventory while the runtime was offline, then restarted through the exact supported entry command and existing verified managed `cloudflared` binary.
- Owner mutations intentionally create verified pre-mutation backups. The probe selected the latest new backup produced immediately before local revocation of its disposable grant, rather than assuming only one backup would exist.
- After local revoke, the disposable old access token returned HTTP `401` and its old refresh token returned `invalid_grant`.
- With the runtime stopped, `auth recover restore <backup-id> --confirm-forced-relink` accepted the integrity-verified backup only as a security reset. Binding `binding_e9caab9de8b70c9ea37dc3e35822705d`, hostname `codexpro-oauth.drliang.uk`, issuer/resource, ports, profile, and owned Tunnel `codexpro-oauth-20260726` remained unchanged. No Cloudflare API, DNS route, Tunnel config, ownership marker, or registry binding was created or mutated.
- The incarnation changed from `incarnation_b6f91591643df65b8d81b521eb737caf` to `incarnation_6da5f4355e306fb79d9ca015b2dbdbcb`; signing/refresh/recovery authority rotated and active grants returned to zero. The old access token remained HTTP `401`; the old refresh attempt returned `invalid_client` because the old client registration was not revived.
- A new disposable client completed DCR, local approval, token exchange, MCP initialize, and `tools/list` with 26 tools after recovery. It was then publicly revoked and locally removed, leaving only durable revoked evidence and no active authority.
- Final runtime was healthy at PID `22836`, OAuth mode source remained the workspace profile, public/local health had passed `200/200` during the probe, and the stable binding/Tunnel identity was unchanged.

**Exact verification:**

- `npm run build` — passed.
- `npm run test:focused -- test/phase-8-authorization.test.mjs test/phase-8-token-validation.test.mjs test/phase-8-refresh-revoke.test.mjs test/phase-8-dcr.test.mjs test/phase-8-auth-recovery.test.mjs test/phase-8-oauth-bounds.test.mjs test/phase-8-auth-config.test.mjs test/phase-8-mcp-auth-integration.test.mjs` — `49/49` passed.
- `node --check .ai-bridge/g8-u-u5-negative-recovery-probe.mjs` — passed.
- First live probe run — protocol/flood portions passed, recovery was not attempted because the evidence harness incorrectly required exactly one new backup and observed five valid owner-mutation backups. This was a probe selection defect, not a product failure; runtime cleanup restored service.
- Corrected live probe — `PASS` for all live negative/recovery stages, stable binding/Tunnel, new incarnation, zero restored active grants, old-token rejection, and post-recovery service.
- `node scripts/codexgpt-entry.mjs auth status --root D:/Dev/codexpro --json` — runtime running, mode `oauth (profile)`, binding unchanged, new incarnation active, no pending authorization, and no active grant.
- Persisted-user `CODEXGPT_AUTH_MODE` check — empty after cleanup.

**Files changed:** Runtime source files: none. Ignored live evidence helper: `.ai-bridge/g8-u-u5-negative-recovery-probe.mjs`. Status/evidence documentation: `AGENTS.md`, `Memory.md`, `README.md`, `README_ZH.md`, `SECURITY.md`, `design.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/reviews/2026-07-26-openai-codex-project-review.md`, `docs/superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md`, `docs/superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md`, and this archive volume.

**Decision and user impact:** U5 is accepted. Normal access Bearers are explicitly not sender-constrained; copying one can replay its authority until expiry or revocation. Recovery does not restore old access: it preserves deployment routing identity but rotates authority and forces relink. After this accepted security reset, the retained OAuth App remains the correct App but its next request must register/authorize again through one local approval.

**Adversarial review:** The completed result was checked against false denial success, state/issuer loss, cookie oracle, copied-token understatement, refresh-family partial revocation, invalid-token queue starvation, backup rollback reviving grants, duplicate binding/Tunnel mutation, environment-variable residue, cleanup failure, and evidence-helper false positives. The first probe failure exposed and corrected the backup-count assumption; selecting the latest verified pre-revoke backup matches the owner mutation protocol. DevSpace exposed no separate agent provider, so this was a manual security/correctness/operability adversarial review rather than a claimed multi-agent result.

**Risks and limitations:** Expiry and cryptographically valid wrong-claim cases were exercised with controlled time/private keys in isolated regressions rather than by waiting for production expiry or exporting production signing authority. Cloudflare edge may still return an HTTP error response while the local origin is stopped; only the loopback local-control unavailability and offline recovery ownership were relied on. U5 does not close cached-App/legacy rollback, the public/local Tunnel boundary, G8-X, publication, or exact-head CI.

**Rollback:** Do not restore the old incarnation or old grant authority. The accepted post-U5 state is the same profile, hostname, ports, stable binding, and owned Tunnel with a new incarnation and no active prior authority. Operational recovery is to relink the retained OAuth App; source rollback is unnecessary because no production source changed.

**Next approved action:** Execute Gate G8-U Journey U6 cached-App/legacy rollback using the retained Legacy and OAuth Apps, then U7 Tunnel boundary and G8-X. Publication, credential migration, staging, commit, push, release, deployment, and unrelated Cloudflare/DNS/Tunnel mutation remain separately gated.

## 2026-07-27 — STEP-464 — Repair and execute U6 rollback round-trip; current-client closure remains blocked

**Status:** The U6 product defect is repaired and the complete live service/protocol round-trip `oauth → legacy → oauth` passes. The profile now retains separate credential-free Legacy and OAuth routing selectors, exact no-argument rollback works after one bounded migration, OAuth setup prints the required **Scan Tools** action, and the original OAuth binding/incarnation survive the round-trip. Journey U6 is not yet closed because the retained ChatGPT Apps did not produce the required successful current-client calls: the OAuth App correctly requires relink after STEP-463, and the available `codexgpt` connector returned a platform `502` during the otherwise healthy Legacy interval.

**Confirmed root cause:** The pre-U6 profile stored one active route only. OAuth setup replaced the Legacy hostname, tunnel name, ports, and Cloudflare selector in place. Running `auth rollback` changed only `authMode`; after restart, legacy authentication was served on `codexpro-oauth.drliang.uk`, while the retained Legacy App endpoint `codexpro.drliang.uk` returned Cloudflare `530`. This violated the two-App rollback contract and could not be repaired by App metadata refresh.

**Implementation:**

- Added reviewed `authRoutes.legacy` and `authRoutes.oauth` profile selectors containing routing facts only: tunnel mode/name/owner, hostname, public/local-admin ports, config/token-file paths, and the managed-cloudflared selector. Raw query tokens and raw Cloudflare tokens are forbidden from these route objects.
- OAuth issuer/resource validation now binds to the retained OAuth route even while the active top-level route is Legacy.
- `auth setup` captures the pre-migration Legacy route, persists the OAuth route separately, restores the OAuth route after rollback, and continues to candidate-probe before committing `authMode: oauth`.
- `auth rollback` switches the active top-level routing fields to the retained Legacy route while preserving OAuth state, keys, clients, grants, audit, binding, incarnation, and OAuth route selectors. Missing retained route data fails closed with `AUTH_LEGACY_ROUTE_MISSING`.
- Existing pre-route profiles have one explicit bounded migration path using `--legacy-hostname`, `--legacy-tunnel-name`, and `--legacy-public-port` together. Partial input fails closed. The migration records routing facts only and does not copy or display credentials.
- `settings set` preserves both routes and OAuth selectors in either auth mode, including migration of the old profile shape without copying credential material into `authRoutes`.
- Setup now prints: `in the OAuth App, choose Scan Tools once or recreate the App`.

**Live round-trip evidence:**

- The first unmodified rollback reproduced the defect exactly: mode became Legacy, but the active route remained `codexpro-oauth.drliang.uk`; that host returned authenticated-legacy `401`, while `codexpro.drliang.uk` returned `530`.
- After the repair, the one-time explicit route migration recorded `codexpro.drliang.uk` / tunnel `codexgpt` / port `8787`, then restarted Legacy mode without displaying a credential-bearing URL. The Legacy host returned unauthenticated `401`, the OAuth host was inactive, and a credential-safe probe internally used the retained token to complete health, MCP initialize, and `tools/list` with 23 tools. The Legacy endpoint returned `404` for credentialed OAuth metadata; the probe printed only safe aggregate evidence.
- The exact no-argument source command `node scripts/codexgpt-entry.mjs auth setup --root D:/Dev/codexpro` inferred `codexpro-oauth.drliang.uk`, tunnel `codexpro-oauth-20260726`, public port `8789`, and local-admin port `8790`; launched a candidate; passed the public metadata/JWKS/health probe; committed OAuth mode; and printed the required Scan Tools instruction.
- Restored OAuth mode returned public health `200`; the Legacy hostname returned `502`. Binding remained `binding_e9caab9de8b70c9ea37dc3e35822705d` and incarnation remained `incarnation_6da5f4355e306fb79d9ca015b2dbdbcb`.
- A disposable ChatGPT-compatible OAuth client completed DCR, PKCE S256 authorization, local approval, token exchange, MCP initialize, and `tools/list`. All 26 visible tools carried exact matching top-level and compatibility OAuth security schemes; three expected scope variants were observed. A query-token attempt against the OAuth MCP endpoint returned `401`. The disposable grant/client were revoked, leaving no active authority.
- A second no-argument `auth rollback` proved the retained route was durable and no migration flags were needed again; the same exact no-argument `auth setup` restored OAuth once more.

**Current-client evidence and blocker:**

- `codexgpt-Windows.open_current_workspace` against the restored OAuth deployment returned ChatGPT's `We couldn't connect your account. Please try again.` This is consistent with STEP-463's deliberate security reset, which invalidated the retained App's client/grant authority. No pending request was created automatically; the App must be explicitly reconnected in ChatGPT.
- During the verified Legacy interval, `codexgpt.open_current_workspace` returned a platform `502` even though the credential-safe live probe succeeded against the retained Legacy hostname and token. The available connector cannot be proven to be the retained pre-migration Legacy App, and its platform configuration is not observable through DevSpace.
- Therefore the runtime/protocol portion is passed, but the user-observable retained-App requirements in U6 items 4, 6, and 7 remain unaccepted. `environment-blocked` is not recorded as `passed`.

**Verification:**

- RED focused tests reproduced the unchanged-host rollback and OAuth-issuer/Legacy-host validation failures.
- `npm run build` — passed.
- Combined auth profile/CLI regressions — `26/26` passed; managed Node `20.20.2` and `24.15.0` each passed the auth/profile/documentation contract set `33/33`.
- Complete Phase 8 suite — `164/164` passed.
- Mutation/native/package/cached-App/redaction/workspace inherited set — `36/36` passed.
- Credential-safe ignored probes: `.ai-bridge/g8-u-u6-legacy-probe.mjs` and `.ai-bridge/g8-u-u6-oauth-probe.mjs` — both passed.
- Final runtime: OAuth mode, public health `200`, Legacy hostname inactive with Cloudflare `530` (an earlier edge check returned `502`), PID `23352`, zero pending authorization, no active grant, unchanged binding/incarnation.

**Files changed:** `src/profileStore.ts`, `scripts/oauth-admin.mjs`, `scripts/codexgpt.mjs`, `test/phase-8-auth-cli.test.mjs`, `test/phase-8-auth-config.test.mjs`, the Phase 8 design/plan status, `AGENTS.md`, `Memory.md`, and this archive. The two live probes are ignored evidence under `.ai-bridge/`.

**Adversarial review:** The implementation was checked for mixed-mode acceptance, credential duplication, raw-token logging, partial migration input, route/issuer confusion, unsafe fallback, OAuth state deletion, Tunnel mutation, binding/incarnation drift, query-token acceptance in OAuth, stale active authority, and false current-client success. The only remaining issue is external/current-client acceptance, not a passing product assertion. DevSpace exposed no independent implementation agent, so this is a manual correctness/security/operability adversarial review rather than a claimed multi-agent result.

**Rollback:** Source rollback is to remove `authRoutes` support and the new tests as one unit, but that restores the confirmed broken two-App rollback and is not recommended. Operationally, the deployment is already returned to the original OAuth hostname/tunnel/ports/binding/incarnation. No credential, OAuth state, Cloudflare route, Tunnel, DNS record, key, client history, grant history, or audit record was deleted.

**Next approved action:** In ChatGPT, reconnect the retained `codexgpt-Windows` OAuth App, perform one real read, then identify and retry the actual retained Legacy App during one more no-argument rollback interval. Only those user-observable calls can close U6; then continue U7 and G8-X.

## 2026-07-27 — STEP-465 — Accept U6 OAuth current-client read; Legacy call remains

**Status:** The OAuth current-client half of Journey U6 is accepted. The pre-reset ChatGPT App returned `invalid_client`, which is the expected consequence of STEP-463 rotating incarnation/key authority and invalidating every old client/grant/token. Recreating the App against the unchanged OAuth endpoint completed registration, approval, token refresh, and a real read through ChatGPT. Journey U6 remains open only for the retained Legacy App current-client call.

**User-observable evidence:** A new ChatGPT conversation invoked the recreated OAuth App and returned exactly the canonical workspace root `D:\Dev\codexpro`, package name `codexgpt`, and version `0.28.6`. The result came from the App tool call rather than from conversation context or a local shell substitution.

**Local corroboration:** Immediately after the read, `node scripts/codexgpt-entry.mjs auth status --root D:/Dev/codexpro --json` reported OAuth mode on `codexpro-oauth.drliang.uk`, runtime PID `23352`, unchanged binding `binding_e9caab9de8b70c9ea37dc3e35822705d`, unchanged incarnation `incarnation_6da5f4355e306fb79d9ca015b2dbdbcb`, no pending authorization, one approved ChatGPT public client, and one active `codexgpt:read` grant at refresh generation `6` with `lastUsedAt` updated by the accepted call. No credential value was displayed or copied into documentation.

**Decision and user impact:** Do not treat `invalid_client` after a forced security reset as a server defect or repeatedly retry the stale App. The shortest correct recovery is App recreation against the same token-free MCP endpoint, followed by one local approval. The stable hostname, Tunnel, binding, and incarnation remain unchanged during this post-reset relink/recreation path.

**Adversarial review:** The completed evidence was checked against false positives from copied conversation text, shell-derived package metadata, stale grants, pending-only registration, wrong endpoint, authority revival, and credential disclosure. The simultaneous approved-client/active-read-grant/recent-use state corroborates the real App call. DevSpace exposed no independent agent provider, so this was a manual security/correctness review rather than a claimed multi-agent result.

**Files changed:** `AGENTS.md`, `Memory.md`, `docs/superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md`, and this archive volume. Runtime source files: none.

**Risks and limitations:** This step does not prove the retained Legacy App path and therefore does not close U6. The recreated OAuth App has a new client identity by design; no prior client/grant/token authority was revived. U7, G8-X, publication, credential migration, staging, commit, push, release, and deployment remain unaccepted.

**Rollback:** No runtime rollback is required. Removing the recreated ChatGPT App would revoke only the current-client access path; it would not change the local deployment. Do not restore or reuse the invalidated pre-reset client authority.

**Next approved action:** Identify the actual retained Legacy App, run one exact no-argument `auth rollback --root D:/Dev/codexpro` interval, prove one real read through that App, then return through the exact no-argument `auth setup --root D:/Dev/codexpro` path. Only then can U6 close.

## 2026-07-27 — STEP-466 — Record accidental deletion of the retained Legacy App

**Status:** No runtime or local credential loss occurred. The user reported that the retained pre-migration Legacy ChatGPT App was accidentally deleted. The original same-App current-client identity and cached metadata are therefore irrecoverable. U6 remains open; a recreated Legacy App can provide compensating compatibility evidence but cannot be represented as the original retained-App evidence without an explicit gate exception.

**Impact analysis:** ChatGPT App deletion removes the client-side App configuration only. It does not delete the local Legacy query token, credential reference, credential-free `authRoutes.legacy` selector, OAuth state, keys, grants, audit history, binding, incarnation, Tunnel, DNS route, or workspace profile. The existing OAuth App remains connected and usable.

**Exact verification:** `node scripts/codexgpt-entry.mjs auth status --root D:/Dev/codexpro --json` reported OAuth mode, runtime PID `23352`, unchanged binding `binding_e9caab9de8b70c9ea37dc3e35822705d`, unchanged incarnation `incarnation_6da5f4355e306fb79d9ca015b2dbdbcb`, no pending authorization, the approved ChatGPT OAuth client, and its active read-only grant at refresh generation `6`.

**Decision and user impact:** Do not claim recovery of the deleted App or silently weaken the U6 criterion. The shortest truthful path is to perform one more no-argument rollback, recreate a Legacy App using the existing secret query-token URL without exposing it in chat or documentation, prove one real read, then return through the exact no-argument OAuth setup path. That evidence proves current rollback compatibility, not continuity of the deleted App identity. U6 closure requires an explicit disposition of the now-unverifiable retained-identity criterion.

**Files changed:** `AGENTS.md`, `Memory.md`, `docs/superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md`, and this archive volume. Runtime source files: none.

**Adversarial review:** The result was checked against treating App deletion as credential deletion, leaking the Legacy query-token URL, recreating the App under the OAuth endpoint, claiming retained identity from a replacement, changing Cloudflare state unnecessarily, and deleting OAuth state to simplify testing. No independent agent provider was available; this was a manual correctness/security review.

**Rollback:** Documentation-only. The local deployment remains in OAuth mode and requires no rollback. The deleted ChatGPT App cannot be restored from repository or server state.

**Next approved action:** At a controlled point, switch with the exact no-argument Legacy rollback flow, recreate a new Legacy App from the locally displayed/copied secret URL with `Authentication: None`, prove one read, and return to OAuth. Record the replacement-App result as compensating evidence and obtain an explicit U6 criterion exception before closure.

## 2026-07-27 — STEP-467 — Accept U6 with documented evidence substitution

**Status:** Journey U6 is accepted with one explicit test deviation. The recreated Legacy ChatGPT App completed a real read while only the Legacy route was active; the exact no-argument OAuth setup restored the saved OAuth route; the existing OAuth App then reopened the workspace and read `package.json`. The original retained Legacy App had been deleted, so continuity of that exact App identity is neither recovered nor claimed.

**User-observable evidence:** In Legacy mode, the recreated `codexgpt-Legacy-U6` App returned canonical workspace root `D:\Dev\codexpro`, package name `codexgpt`, and version `0.28.6`. The complete query-token URL remained in the local clipboard and was never printed into chat, documentation, or command output.

**Route and runtime evidence:** Before the Legacy call, only loopback port `8787` was listening; `https://codexpro.drliang.uk/healthz` returned the expected unauthenticated `401`, while the OAuth hostname returned `502`. The first stop attempt exposed a stale pre-rollback OAuth process tree still listening on `8789/8790`; it was identified by exact repository command lines and terminated before acceptance, preventing a false dual-active result. After the Legacy read, `node scripts/codexgpt-entry.mjs auth setup --root D:/Dev/codexpro` inferred the saved OAuth hostname/tunnel/ports, candidate-probed before commit, and restored OAuth mode. The final OAuth hostname returned `200`, the Legacy hostname returned Cloudflare `530`, and only `8789/8790` listened locally.

**OAuth current-client corroboration:** The existing `codexgpt-Windows-U6` App successfully ran `open_current_workspace` and read lines 1–8 of `package.json`, returning root `D:\Dev\codexpro`, name `codexgpt`, and version `0.28.6`. Local `auth status --json` simultaneously reported runtime PID `20672`, unchanged binding `binding_e9caab9de8b70c9ea37dc3e35822705d`, unchanged incarnation `incarnation_6da5f4355e306fb79d9ca015b2dbdbcb`, no pending authorization, the approved ChatGPT client, and its active `codexgpt:read` grant advanced to refresh generation `9` with `lastUsedAt` updated by the accepted call.

**Exact verification:** `npm run test:focused -- test/auth-documentation.test.mjs test/phase-8-plan-command-contract.test.mjs` passed `13/13`; `npm run policy:check` passed; `git diff --check` passed with only pre-existing LF→CRLF warnings; the changed-document private-key/JWT/query-token-value scan passed. `Memory.md` is 134 lines / 20,803 bytes, below the hard 200-line / 25-KB limit; this archive volume is 257 lines / 41,108 bytes, below its continuation threshold.

**Criterion disposition:** U6 items concerning current rollback usability, route exclusivity, preserved OAuth state, exact return setup, and post-return OAuth continuity are passed. The destroyed same-App Legacy identity criterion is closed by evidence substitution rather than silently marked as passed: replacement-App compatibility is accepted, but continuity of the deleted original Legacy App identity remains unproven and irrecoverable.

**Files changed:** Runtime source files: none. Status/evidence documentation: `AGENTS.md`, `Memory.md`, `README.md`, `README_ZH.md`, `SECURITY.md`, `design.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/reviews/2026-07-26-openai-codex-project-review.md`, the Phase 8 design/plan, and this archive volume.

**Adversarial review:** The completed result was checked against false acceptance from simultaneous Legacy/OAuth listeners, use of the wrong hostname, a copied conversation answer instead of a tool call, exposure of the query token, loss of OAuth state, binding/incarnation drift, stale OAuth authority revival, and misrepresentation of replacement-App identity. The stale OAuth process found during the transition was removed before evidence collection. No independent agent provider was available, so this was a manual security/correctness/operability review.

**Rollback:** No operational rollback is required. The deployment is restored to OAuth mode on the original dedicated hostname/tunnel/ports with the same binding/incarnation and active read-only OAuth App. The recreated Legacy App remains available for future explicit rollback; deleting it again would recreate the same evidence and usability gap.

**Next approved action:** Execute Journey U7 Tunnel-boundary, then G8-X. Publication, credential migration, staging, commit, push, release, deployment, unrelated Cloudflare/DNS/Tunnel mutation, and other gated scope remain unapproved.

## 2026-07-27 — STEP-468 — Close Journey U7 Tunnel boundary

**Status:** Journey U7 and Gate G8-U are accepted. The live dedicated OAuth Tunnel reaches only the public loopback listener, the local-admin listener remains local-only, Host and forwarded-header attempts cannot cross into owner administration, and Cloudflare Access/end-to-end mTLS remain explicitly unclaimed. A test-first repair also moved shared/unowned config rejection ahead of setup journal, OAuth state, profile, Tunnel, and DNS mutation.

**Goal:** Prove the complete Tunnel boundary rather than treating a successful public health request as sufficient: owned ingress must be exact and idempotent; shared or unowned config must remain byte-identical and receive one usable dedicated-tunnel command; public routing must exclude local administration under normal, Host-substitution, and forwarded-header requests.

**Files changed:** `scripts/oauth-admin.mjs`, `test/phase-8-auth-cli.test.mjs`, `AGENTS.md`, `Memory.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, the Phase 8 design/plan, and this archive volume.

**Implementation:** Added `preflightExistingTunnelConfig()` and invoked it before any setup mutation. Existing config is reused only when the ingress validator and static CodexGPT ownership marker both match the exact profile, tunnel, hostname, and valid binding shape. Shared, admin-exposing, ingress-mismatched, missing-marker, and mismatched-marker configs fail closed without rewriting the source file. The error prints one exact `auth setup` command with an idempotent `-dedicated` tunnel name and the first unused managed config path. The previous `--provision-tunnel` adoption path for an existing unowned config was removed. Candidate profile persistence now occurs only after existing ownership or newly generated ingress has been validated.

**Test-first evidence:** The new regression initially failed because `preflightExistingTunnelConfig` did not exist. After implementation, `test/phase-8-auth-cli.test.mjs` proves shared and unowned configs remain byte-identical, no owner marker is created, the repair command selects a different unused config path, the preflight call precedes journal/state/profile mutation, and an exact statically owned config remains reusable.

**Live ingress evidence:** The owned config digest was `sha256:13ab3389041170e58926fc7cc9fbfaf712145d8a5edb4016be5c860d8be8f4dd` before and after exact no-argument `auth setup --root D:/Dev/codexpro`. It contains only the exact hostname route to `127.0.0.1:8789` and the final `http_status:404` catch-all; `8790` is absent. Setup returned `OAuth already ready`, kept runtime PID `20672`, required zero approval/restart/user-supplied facts, and preserved the existing binding, one approved client, one active read grant, and `Pending 0`.

**Live public/local boundary evidence:** `https://codexpro-oauth.drliang.uk/healthz` returned `200` with only the public OAuth health shape. Public `/api/status`, `/session/bootstrap`, `/admin.js`, and `/api/grants/revoke-all` returned `404`. A direct `Host: 127.0.0.1:8790` request returned `403`; spoofed `X-Forwarded-Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, and `Forwarded` headers did not change the public router or health response. `https://codexpro-oauth.drliang.uk:8790/healthz` was unreachable within the bounded probe, while `http://127.0.0.1:8790/healthz` returned `200` with the local-admin owner-channel shape.

**Exact verification:**
- `npm run test:focused -- test/phase-8-auth-cli.test.mjs` passed `20/20` after the initial expected missing-export failure.
- `npm run test:focused -- test/phase-8-auth-cli.test.mjs test/phase-8-cloudflare-config.test.mjs test/phase-8-listener-separation.test.mjs test/phase-8-public-health.test.mjs` passed `33/33`.
- `node scripts/toolchain-manager.mjs matrix --major all --root C:/Users/Administrator/AppData/Local/CodexPro/toolchains -- npm run build` passed on Node `20.20.2` and `24.15.0`.
- The same managed-major matrix running the four focused boundary files passed `33/33` on each major.
- `node scripts/codexgpt-entry.mjs auth setup --root D:/Dev/codexpro` passed idempotently against the running owned deployment with no Tunnel/DNS rewrite.

**Decision and user impact:** A config file is not authority. Shape validation alone cannot authorize CodexGPT to adopt a Tunnel; a matching local ownership marker is required before any local or external setup mutation. The user now receives one concrete path to a newly dedicated Tunnel instead of a command that could claim an existing unowned resource. Normal owned-tunnel restart/setup remains zero-approval and idempotent.

**Risks and limitations:** Public `:8790` unreachability is an observed Cloudflare/network result plus exact ingress proof, not an Internet-wide port-scan guarantee. Core still does not provide DPoP, sender-constrained Bearers, Cloudflare Access, end-to-end mTLS, same-user isolation, or an OS sandbox. The live runtime was not restarted because U7 did not require a code activation restart; G8-X must validate the complete current worktree through its authoritative suites.

**Adversarial review:** Reviewed the completed result against config-byte mutation, owner-marker forgery/mismatch, `--provision-tunnel` takeover, repair-command path collision, Host-header rebinding, forwarded-header trust, public owner-route leakage, false acceptance from public health alone, and accidental Access/mTLS claims. The unused-path allocator avoids recommending the rejected config or another existing path. No independent agent provider was available in DevSpace, so this was a manual security/correctness/operability review.

**Rollback:** Revert the STEP-468 changes in `scripts/oauth-admin.mjs` and its regression if compatibility with unowned-config adoption were intentionally restored; no live Cloudflare, DNS, credential, grant, binding, or profile rollback is required because U7 made no external-state change. Reverting would reintroduce post-mutation shared/unowned detection and is not recommended.

**Next approved action:** Execute Gate G8-X local closure. Publication, credential migration, staging, commit, push, release, deployment, unrelated Cloudflare/DNS/Tunnel mutation, and other gated scope remain unapproved.

## 2026-07-27 — STEP-469 — Neat-freak reconciliation after U7

**Status:** Active project knowledge is reconciled after accepted Journey U7. Public documentation, security guidance, the changelog, project memory, Phase 8 status, and the G8-X next boundary now agree. Phase 8 Volume 4 is closed after this entry because it exceeds the 48 KB continuation threshold; Gate G8-X must begin in `phase-8-part-5.md`.

**Goal:** Remove stale U6/U7-pending claims that survived in lower sections of otherwise updated documents, reduce the root memory index below its practical loading target, verify rule/document references, and preserve historical records without rewriting append-only archives.

**Files changed:** `CHANGELOG.md`, `FAQ.md`, `FAQ_ZH.md`, `README.md`, `README_ZH.md`, `SECURITY.md`, `Memory.md`, and this archive volume. Runtime source files: none.

**Implementation:** Updated the Unreleased changelog and Legacy FAQ sections from the obsolete Tasks 8A1–8A6/design-only boundary to the exact current source-checkout state: Tasks 8A1–8A9 and live G8-U Journeys U2–U7 are complete, U6 retains its deleted-App evidence substitution, and G8-X/publication remain incomplete. Replaced stale README and SECURITY paragraphs that still said U6 required current-client calls and U7 remained pending. Compacted `Memory.md` by graduating detailed journey narratives to the Phase 8 archives, retaining only current state, final evidence, active constraints, limitations, open items, concise recent summaries, and archive links. Historical archive statements were left unchanged.

**Exact verification:**
- `npm run test:focused -- test/auth-documentation.test.mjs test/phase-8-plan-command-contract.test.mjs test/public-cli-help.test.mjs test/package-contents.test.mjs` passed `16/16`.
- The root-memory relative-link audit resolved all `37` links with zero missing targets.
- The active stale-status scan found no remaining U6-current-client/U7-pending wording; matching older statements exist only in append-only historical archives.
- `npm run policy:check` passed.
- `git diff --check` passed; output contained only the repository's existing LF-to-CRLF working-copy warnings.
- `Memory.md` decreased from `21,293` to `14,570` bytes and is `121` lines, below the practical `18 KB`/`150`-line targets and the hard `25 KB`/`200`-line limits.
- Final recursive size audit reported `4,234,006` bytes under `docs/` and `1,907,080` bytes under `docs/memory/`; project knowledge is not memory-heavy relative to documentation.

**Rules audit:** Required `AGENTS.md` and `Memory.md` exist. Phase 4–8 spec/plan links, the project review, active documentation map, supported entry script, toolchain manager, mutation inventory, and archive links resolve. The project explicitly treats `AGENTS.md` as authoritative and does not require a `CLAUDE.md` symlink, so no cross-platform generic symlink rule was applied. No destructive rename, deletion, external-state mutation, credential handling, staging, commit, or push was performed.

**Adversarial review:** Reviewed the completed result against top-section/body status divergence, accidental rewriting of historical evidence, loss of U6's explicit exception, false Phase 8 closure, removal of live limitations, broken archive links, oversized root memory, and premature creation of an empty continuation volume. No independent DevSpace agent provider is available, so this was a manual correctness/security/knowledge-governance review.

**Rollback:** Revert only the STEP-469 documentation and memory edits. No runtime, profile, OAuth, Tunnel, DNS, credential, grant, client, or external state changed.

**Next approved action:** Begin Gate G8-X in `docs/memory/archive/phase-8-part-5.md`. Publication, credential migration, staging, commit, push, release, deployment, unrelated Cloudflare/DNS/Tunnel mutation, and other gated scope remain unapproved.
