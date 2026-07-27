# Phase 8 OAuth and Public Authentication — Volume 3

This continuation is append-only. It begins after `phase-8-part-2.md` reached the archive rotation threshold.

## 2026-07-26 — STEP-452 — Complete Task 8A9 adversarial repair

**Status:** Task 8A9 is complete locally. Three independent execution/correctness, security/compatibility, and UX/operability passes reviewed the completed Phase 8 runtime. Every accepted defect was repaired with a regression. Gate G8-U is now the only next Phase 8 action and remains separately authorized.

**Goal:** Attack the completed OAuth runtime rather than its design, repair confirmed invariant violations without broadening authority or weakening compatibility, and rerun narrow, inherited, managed-major, policy, package, and local production fixtures.

**Files changed:**

- Runtime repairs: `src/auth/clientStore.ts`, `src/auth/localAdminSession.ts`, `src/auth/resourceMiddleware.ts`, `src/auth/tokenService.ts`, `src/http/localAdminApp.ts`, `src/http/oauthMcpRuntime.ts`, `src/http/publicApp.ts`.
- Permanent regressions: `test/phase-8-dcr.test.mjs`, `test/phase-8-listener-separation.test.mjs`, `test/phase-8-local-admin-session.test.mjs`, `test/phase-8-mcp-auth-integration.test.mjs`, `test/phase-8-token-validation.test.mjs`, `test/phase-8-plan-command-contract.test.mjs`.
- Status and operator boundary: `AGENTS.md`, `Memory.md`, `README.md`, `README_ZH.md`, `SECURITY.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/reviews/2026-07-26-openai-codex-project-review.md`, the paired Phase 8 design/plan, and this archive volume.

**Implementation and accepted findings:**

1. **DCR inherited-property injection.** The bounded JSON parser materialized objects with `{}`. An unknown `__proto__` extension could therefore inject inherited `client_name` or `token_endpoint_auth_method` values and alter registration semantics. Objects now use a null prototype; the regression proves unknown extensions cannot influence declared metadata.
2. **False established-session admission.** Bearer verification previously treated any string `Mcp-Session-Id` header plus a previously validated fingerprint as established traffic, even when the session was malformed, absent, foreign, or unbound. The reserved ES256 lane now requires a callback from the MCP runtime proving one exact existing transport and one fingerprint already validated on that transport. Per-session fingerprint state is bounded to 16 entries and expires no later than token expiry.
3. **Ambiguous MCP session headers.** The runtime previously accepted Node's normalized header view. It now parses raw headers and requires exactly one UUID-shaped `Mcp-Session-Id`; duplicates fail with the existing bounded 400 response rather than being interpreted by parser order.
4. **Duplicate Host authority.** Node accepts duplicate Host headers and exposes the first normalized value. Both public and local-admin listeners now require exactly one raw Host value matching the normalized request and the configured authority. Forwarded headers remain ignored.
5. **Non-canonical Origin acceptance.** Same-host checks previously accepted malformed Origin values containing a path or query because `URL.host` still matched. Public MCP CORS now requires the input to equal `URL.origin` before either same-host or configured-origin admission.
6. **Local-admin credential ambiguity and capacity recovery.** Cookie parsing used the current value as the duplicate sentinel, so an empty first `codexgpt_admin` cookie allowed a second credential. It now tracks presence separately and rejects every duplicate. A valid fragment bootstrap is no longer consumed solely because all four local sessions are occupied; after one session is revoked, the still-valid bootstrap can be exchanged once.

**Exact verification and classification:**

- RED then GREEN regressions:
  - DCR `__proto__` case failed with inherited `token_endpoint_auth_method`, then `test/phase-8-dcr.test.mjs` passed `7/7`.
  - duplicate Host raw requests returned `200` before repair, then `test/phase-8-listener-separation.test.mjs` passed `5/5`.
  - local-admin capacity reuse and empty-first duplicate cookie both failed before repair, then `test/phase-8-local-admin-session.test.mjs` passed `3/3`.
  - non-canonical same-host Origin returned `200` before repair, then `test/phase-8-token-validation.test.mjs` passed `4/4`.
  - exact transport/fingerprint and duplicate session-header regressions passed with `test/phase-8-mcp-auth-integration.test.mjs` `4/4` after the bounded transport association repair.
- Current Node complete Phase 8 set: `152/152` passed.
- Managed Windows Node `20.20.2`: explicit 32-file Phase 8 set `152/152` passed; build passed.
- Managed Windows Node `24.15.0`: explicit 32-file Phase 8 set `152/152` passed; build passed.
- Inherited legacy/auth/redaction/policy/V1–V5/native/package/production slice: `70/70` passed.
- `npm run policy:check`, `git diff --check`, and `npm pack --dry-run --json --ignore-scripts` passed; package dry-run reported `653` entries and retained the reviewed credential-helper artifacts without tests, memory archives, auth state, credentials, or private keys.
- `npm audit --omit=dev --audit-level=high --json` reported `0` high and `0` critical findings. It reported one moderate advisory chain (`@modelcontextprotocol/sdk@1.29.0` → `@hono/node-server@1.19.15`) limited to the Hono `serve-static` subpath. Production uses the SDK's `getRequestListener` transport adapter and imports no Hono static middleware; source/package inventory searches found no `serveStatic` or `@hono/node-server/serve-static` reachability. No incompatible SDK downgrade or out-of-range transitive override was accepted.
- No Cloudflare, DNS, Tunnel, live ChatGPT, credential migration, publication, release, staging, commit, or push action was performed.

**Decisions and why:**

- Preserve the exact MCP SDK/jose contract and fix project-owned authority checks rather than replacing SDK behavior or relaxing protocol validation.
- Bind reserved cryptographic capacity to actual transport state, not attacker-controlled header shape.
- Reject duplicate authority/credential sources at the raw-header/cookie boundary instead of relying on Node/Express normalization order.
- Keep the current moderate Hono static-file advisory as an explicit non-reachable dependency limitation. The vulnerable API is not imported or mounted; the available audit suggestion is an incompatible SDK downgrade, while forcing `@hono/node-server` 2.x would violate the SDK's declared `^1.19.9` range without upstream compatibility evidence.
- Devspace exposed no independent agent provider in this workspace, so the required adversarial review was executed as three independent passes against the repaired tree rather than falsely claiming multi-agent execution.

**User impact:**

- Unknown DCR extensions can no longer alter client metadata through JavaScript inheritance.
- Invalid or copied session headers cannot consume the reserved established-user ES256 lane.
- Proxy/header ambiguity fails closed on both listeners.
- Browser-origin checks now accept only canonical origins.
- Local-admin duplicate credentials are rejected consistently, and a user who hits the four-session ceiling can revoke one session and continue with the same unexpired bootstrap instead of rerunning `auth open`.

**Risks and limitations:**

- Current ChatGPT DCR, RFC 9207 callback, cookie navigation, refresh, and reconnect behavior remains unobserved until G8-U. Local and synthetic results are not current-client acceptance.
- The moderate transitive Hono `serve-static` advisory remains present in the installed dependency graph but is not reachable through the reviewed production imports/routes. Reassess when the pinned MCP SDK publishes a compatible dependency update.
- Pending authorization/code state remains intentionally process-ephemeral; restart requires a fresh authorization attempt.
- Same-user malware, ambient `full_access`, and external-process races remain outside the OAuth authentication guarantees already documented.

**Rollback:** Revert the STEP-452 runtime/test/document changes as one local patch. No schema migration, external state mutation, credential deletion, Tunnel change, or published head was created. Rolling back only the repairs would restore the five security boundary defects and the bootstrap-capacity UX failure, so rollback is for bisect/recovery only, not a supported operating state.

**Next approved action:** Gate G8-U live ChatGPT acceptance, only after separate explicit authorization for the required real ChatGPT/Cloudflare operations. Staging, commit, push, publication, release, deployment, DNS/Tunnel mutation, and credential migration remain separately gated.

## 2026-07-26 — STEP-453 — Reconcile Phase 8 knowledge after Task 8A9

**Status:** Knowledge cleanup is complete. Active rules, public documentation, the Phase 8 plan/spec, roadmap/review status, and project memory consistently identify Tasks 8A1–8A9 as locally complete and Gate G8-U as the next separately authorized boundary.

**Goal:** Remove duplicated implementation history from always-loaded files, keep detailed evidence in the append-only archives, verify rule/reference integrity, and leave a clean handoff without changing runtime behavior.

**Files changed:** `AGENTS.md`, `Memory.md`, and this archive volume.

**Implementation:**

- Reduced the Phase 8 rule and authorization paragraphs in `AGENTS.md` to durable constraints and gate boundaries instead of repeating the implementation inventory already maintained in the paired design/plan and archives.
- Consolidated STEP-437 through STEP-452 history and verification in `Memory.md`, retained current decisions/limits/open items, and added this cleanup step.
- Confirmed that the only non-archive text saying Task 8A9 was next is an explicitly labeled Task 8A8 checkpoint in the executable plan; no active document retains a stale next-action statement.
- Verified all relative Markdown links in `AGENTS.md` and `Memory.md` resolve.
- Reduced `AGENTS.md` from 15,440 to 14,875 bytes and `Memory.md` from 18,300 to 15,440 bytes, restoring both practical attention-budget targets.

**Exact verification and classification:** Active status scan passed; `AGENTS.md`/`Memory.md` link audit passed; focused documentation/package contract tests, `git diff --check`, and `npm run policy:check` passed. No runtime, dependency, credential, external service, Git staging, commit, or push action was performed.

**Decisions and why:** Keep operational rules terse and universal; keep chronological implementation detail in the archive; preserve historical checkpoint statements only when their time context is explicit.

**User impact:** Future agents load less duplicated text, see the current G8-U boundary immediately, and retain direct links to complete Phase 8 evidence.

**Risks and limitations:** This is documentation/memory reconciliation only. It does not substitute for live G8-U or exact-head G8-X acceptance.

**Rollback:** Revert the STEP-453 documentation-only edits. No runtime or external state would be affected.

**Next approved action:** Gate G8-U, after separate explicit authorization for real ChatGPT/Cloudflare operations. Publication, credential migration, release, staging, commit, and push remain separately gated.

## 2026-07-26 — STEP-454 — Begin live Gate G8-U and repair production setup/restart defects

**Status:** Authorized G8-U is in progress. The dedicated OAuth Cloudflare Tunnel, DNS route, public OAuth surface, separated local-admin listener, and local owner-control CLI are live and verified. Real ChatGPT App creation, DCR/browser authorization, tool scan, and the remaining U1–U7 current-client journeys are not yet accepted.

**Goal:** Move from synthetic Phase 8 evidence to the first real self-hosted public OAuth deployment without weakening DCR, RFC 9207, Host/Origin, listener separation, credential protection, or the retained Legacy rollback path.

**Files changed:** `scripts/oauth-admin.mjs`, `scripts/codexgpt.mjs`, `src/http.ts`, `test/phase-8-auth-cli.test.mjs`, `Memory.md`, and this archive volume.

**External state changed under explicit G8-U authority:**

- Created dedicated named Tunnel `codexpro-oauth-20260726` with exact UUID `1a32acd1-ad71-4388-a610-0404c917ed7d`.
- Bound `codexpro-oauth.drliang.uk` to that exact Tunnel and wrote the owner-marked dedicated ingress to `http://127.0.0.1:8789` with final `http_status:404`.
- Committed the selected workspace profile to `oauth`, using public listener `127.0.0.1:8789` and local-admin listener `127.0.0.1:8790`.
- Preserved the pre-migration Legacy App, old Tunnel, OAuth state, keys, grants, audit, and rollback path. No credential migration, publication, staging, commit, or push occurred.

**Confirmed live defects and repairs:**

1. **Machine-readable cloudflared output was contaminated by warnings.** `cloudflared 2026.7.1` returned valid tunnel inventory JSON on stdout and an update warning on stderr. Successful commands concatenated both streams before `JSON.parse`, causing `AUTH_TUNNEL_LIST_INVALID`. Success now returns stdout only; failed commands still combine bounded stderr/stdout for diagnosis.
2. **DNS routing used an ambiguous Tunnel name.** `cloudflared tunnel route dns <name> <host>` exited successfully while reporting that the hostname still targeted the old Tunnel UUID. Routing now requires the exact reviewed UUID, so a conflicting hostname fails closed instead of silently passing. The G8-U hostname created in this step was explicitly overwritten once to the new exact UUID after the defect was proven.
3. **Public probes depended on the workstation resolver.** Cloudflare authoritative/public resolvers returned the new hostname while the active university DNS servers returned refusal/NXDOMAIN. Setup and named-Tunnel startup now resolve through explicit public Cloudflare DNS and pin only the connection address; HTTPS hostname, SNI, certificate, Host, metadata, issuer/resource, JWKS, and health checks remain unchanged.
4. **OAuth runtime status paired identities from two processes.** The marker stored the HTTP process PID with the local-control child process creation time. The exact liveness check therefore deleted a valid marker about 1.7 seconds after creation, making `auth status`, `auth pending`, and local owner approval report a stopped service while both listeners remained live. The marker now stores the native-control PID and creation time from the same ready record.

**Live evidence:**

- `auth setup --root D:/Dev/codexpro --hostname codexpro-oauth.drliang.uk --tunnel-name codexpro-oauth-20260726 --public-port 8789 --local-admin-port 8790 --provision-tunnel --no-start` completed with `OAuth ready` and committed only after the external probe passed.
- Cloudflare edge returned HTTP 200 for `/healthz` with `authMode: oauth` and `mcpAvailable: true`.
- Public authorization-server metadata returned the exact issuer, `/authorize`, `/token`, `/register`, `/revoke`, `/jwks`, PKCE `S256`, rotating-refresh grant type, and RFC 9207 support.
- Direct public-listener access with a loopback Host returned 403, while `http://127.0.0.1:8790/healthz` returned 200 and reported the owner channel available. Cloudflare ingress therefore reaches only the public listener; forwarded/incorrect authority does not expose local administration.
- After the runtime marker repair, `auth status --json` reported `configured: true`, `runtime.running: true`, the stable binding/incarnation, and empty live client/authorization/grant lists. `auth pending` returned `No OAuth pending.` rather than `OAUTH_SERVICE_NOT_RUNNING`.
- The retained foreground-equivalent OAuth service continues through the supported public entry with no URL token or static Bearer instruction.

**Exact local verification:**

- RED then GREEN focused regression for cloudflared stdout/stderr separation.
- RED then GREEN focused regression for public-DNS address pinning without weakening TLS/Host validation.
- RED then GREEN focused regression requiring exact Tunnel UUID DNS routing.
- RED then GREEN focused regression binding runtime PID and creation time to the same native-control ready record.
- `npm run test:focused -- test/phase-8-auth-cli.test.mjs test/phase-8-cloudflare-config.test.mjs`: `17/17` passed.
- `npm run test:focused -- test/phase-8-*.test.mjs`: complete current-Node Phase 8 set `157/157` passed.
- `npm run build`: passed after the runtime and launcher changes.

**Adversarial review:**

- The stdout repair does not suppress failure diagnostics; only successful machine-readable output excludes stderr warnings.
- Public DNS is used only to select a network address. Requests retain the configured HTTPS hostname and normal certificate/SNI/Host verification, so the repair does not convert the probe into an IP-trust bypass.
- Exact UUID routing rejects ambiguity rather than adding unconditional overwrite behavior. `--overwrite-dns` was used only once after proving that this newly authorized G8-U hostname had been attached to the wrong existing Tunnel by the confirmed defect.
- Runtime liveness remains fail-closed against PID reuse because PID and creation time now describe the same native-control process. The marker is still removed on exact service shutdown and cannot authorize through a foreign/stale server id.
- The dedicated OAuth listener remains loopback-only; no local inbound port, local-admin route, token, private key, or credential was exposed or recorded.

**Risks and limitations:**

- This step proves the real Cloudflare/Tunnel/runtime boundary, not current ChatGPT behavior. ChatGPT has not yet performed DCR, accepted RFC 9207 callbacks, traversed the cookie-bound waiting/continue path, refreshed/reconnected, revoked/relinked, refreshed a cached App, or exercised Legacy rollback.
- The workstation's configured DNS servers still return refusal/NXDOMAIN for the new hostname even though public resolvers and Cloudflare edge are correct. CodexGPT startup no longer depends on that resolver for the named-Tunnel health probe, but unrelated local applications may still observe the local DNS defect.
- The managed cloudflared pin remains `2026.7.1`; its warning recommends `2026.7.3`. Updating the exact verified binary/version/digest is a separate dependency decision, not part of this compatibility repair.
- G8-U and G8-X remain incomplete. Environment-blocked or locally synthetic results must not be reclassified as current-client acceptance.

**Rollback:** Stop the exact OAuth foreground process, run `node scripts/codexgpt-entry.mjs auth rollback --root D:/Dev/codexpro`, restart through the supported public entry, and use the separately retained Legacy App. This preserves OAuth keys/state/audit and the dedicated Tunnel/DNS route. Reverting the source patch restores the four confirmed production defects and is not a supported operating rollback.

**Only next action:** In ChatGPT Web, create the separate OAuth development App using only `https://codexpro-oauth.drliang.uk/mcp`, select OAuth if prompted, run **Scan Tools**, and complete the browser authorization until the PC shows one pending local approval. Then continue G8-U U0/U1 from that live pending request. Publication, credential migration, staging, commit, push, release, and deployment remain separately gated.

## 2026-07-26 — STEP-455 — Execute Gate G8-U Journey U2 scope behavior and repair live profile/descriptor defects

**Status:** Journey U2 now passes at the live public OAuth/MCP protocol layer after two behavior defects were repaired test-first. The current ChatGPT App and its active grant were preserved. Current-client UI confirmation of one understandable scope reauthorization and no **Scan Tools** prompt for a pure scope change remains pending, so U2 is not yet claimed as fully accepted through the ChatGPT UI. U3–U7 and G8-X remain incomplete.

**Goal:** Prove least-privilege OAuth scope expansion and reduction on the stable named hostname without recreating the App, changing the issuer/binding, widening DCR, granting disabled local capabilities, or coupling a pure scope change to MCP descriptor refresh.

**Files changed:** `scripts/codexgpt.mjs`, `src/server.ts`, `test/phase-8-auth-cli.test.mjs`, `test/phase-8-mcp-auth-integration.test.mjs`, `Memory.md`, and this archive volume. The reproducible live probe is retained only as ignored evidence at `.ai-bridge/g8-u-u2-scope-probe.mjs`.

**External/runtime state exercised under the existing G8-U authority:**

- Cycled the existing OAuth profile through read-only, write-enabled, a deliberate `toolMode=minimal` visibility fixture, and the final read-only state.
- Restarted only through the supported public entry and the existing dedicated named Tunnel; no DNS, Tunnel binding, hostname, issuer, resource, credential, or Cloudflare configuration was changed.
- Preserved the existing approved real `ChatGPT` DCR client and active grant. Used one disposable same-client-style public DCR client for deterministic protocol evidence, then revoked its refresh authority and removed it through the supported owner CLI.
- Final live profile is `write=off`, `bash=off`, `toolMode=full`; the public and local-admin listeners are healthy.

**Confirmed live defects and repairs:**

1. **Capability settings could destroy the OAuth profile.** `settings set` rebuilt the profile without `authMode`, local-admin port, Tunnel owner, issuer/resource, credential provider, or state reference, silently returning the next start to legacy selection. A RED regression reproduced the loss. `saveSettingsFromArgs()` now preserves the complete reviewed OAuth selector set, plus the existing policy and permission selectors, while changing only the requested capability fields.
2. **Read-only OAuth removed write descriptors.** `toolNamesForMode()` and `shouldRegisterTool()` hid `write`, `edit`, and `apply_patch` whenever local writes were disabled. A live read-only call therefore returned `Tool write not found`, forcing descriptor drift and defeating scope-only step-up. OAuth now keeps these descriptors stable; the request-local scope/deployment gate still rejects the call before its handler with a normal local-profile denial. Legacy mode retains its prior hidden-tool behavior.
3. **A local-ready process is not yet a public-ready Tunnel.** The first repaired probe reached healthy loopback listeners while Cloudflare briefly returned 502 during named-Tunnel reattachment. The evidence harness now waits for both local and public health before evaluating a journey stage, preventing startup timing from being mislabeled as authorization failure.

**Live U2 evidence:**

- Both metadata documents advertised exactly `codexgpt:read` in the read-only deployment.
- DCR returned the fixed protocol ceiling `codexgpt:read codexgpt:write codexgpt:execute` rather than mirroring current deployment enablement.
- The read-only full tool surface contained 26 descriptors. Disabled write returned a local-profile denial with no OAuth reconnect challenge and created no file.
- After enabling write and restarting without changing issuer/binding, the old read token still initialized and read normally but write returned `insufficient_scope` and requested the ordered union `codexgpt:read codexgpt:write`.
- The same DCR client completed one new authorization and local approval; the new grant successfully wrote an ignored bounded fixture.
- The full-mode descriptor digest was byte-stable across the pure scope change. The deliberate visibility fixture changed the tool count from 26 to 11, proving the probe can distinguish scope-only stability from a real descriptor change.
- After reducing write and restarting, the previously broader token received a normal local-profile denial with no privilege increase or OAuth challenge, while `server_config` remained readable.

**Exact verification:**

- RED then GREEN: `npm run test:focused -- test/phase-8-auth-cli.test.mjs` — final `15/15` passed.
- RED then GREEN: `npm run test:focused -- test/phase-8-mcp-auth-integration.test.mjs` — final behavior repaired.
- `npm run build` — passed.
- `npm run test:focused -- test/phase-8-mcp-auth-integration.test.mjs test/phase-8-auth-cli.test.mjs` — `20/20` passed.
- `node ./.ai-bridge/g8-u-u2-scope-probe.mjs` — `PASS` with read-only metadata, fixed DCR ceiling, old-token step-up, same-client reauthorization, successful write, descriptor stability, deliberate visibility change, reduction denial, and read continuity.
- `npm run test:focused -- test/phase-8-*.test.mjs` — complete current-Node Phase 8 set `159/159` passed.
- `npm run policy:check` — `Repository operational policy: PASS`.
- `git diff --check` — passed; only pre-existing working-tree line-ending warnings were emitted.

**Adversarial review:**

- Stable descriptors add no authority: every OAuth tool call still requires request-local identity, token scopes, current deployment scopes, Policy, and the existing mutation controls before a handler can run.
- The registration exception is OAuth-only. Legacy read-only profiles continue hiding write tools exactly as before.
- Preserving OAuth selectors prevents an ordinary capability edit from downgrading authentication mode or orphaning the state binding. Existing profile validation still rejects incomplete or inconsistent OAuth selector sets.
- A broader historical token cannot bypass a later local reduction because effective authority is the intersection of token scope and current deployment capability. Reduction therefore produces a local policy/config denial rather than a reconnect loop.
- The ignored probe emits only redacted bounded evidence, stores no access/refresh token, and deletes no durable user state. No staging, commit, push, credential migration, publication, release, or deployment action occurred.
- No multi-agent provider was available in this workspace; the completed result received a manual adversarial review against legacy regression, hidden authority, descriptor drift, profile-selector loss, stale-token escalation, Tunnel startup races, and cleanup failure.

**Risks and limitations:**

- The protocol path proves the server behavior required by U2, but DevSpace cannot observe whether the current ChatGPT UI renders exactly one understandable reconnect prompt or suppresses **Scan Tools** for the pure scope change. Those two UI observations remain mandatory before calling current-client U2 accepted.
- The final live profile is intentionally read-only. The existing ChatGPT grant may still contain broader historical scopes, but current deployment intersection prevents write/execute authority.
- This verification used current Node. Managed Node 20/24 and the full G8-X closure matrix remain later gates.
- The repository still contains the broader authorized, uncommitted Phase 8 work. This step did not stage, commit, push, or normalize unrelated changes.

**Rollback:** Operationally, the final read-only state can be returned to the prior full local capability selection with `node scripts/codexgpt-entry.mjs settings set --root D:/Dev/codexpro --write workspace --bash full --tool-mode full`, followed by the exact supported foreground restart. Reverting only this source repair would reintroduce OAuth selector loss and scope-driven descriptor drift and is therefore not a supported behavior rollback.

**Next approved action:** In the existing ChatGPT OAuth App, trigger the write capability once and confirm one understandable reauthorization without App recreation; confirm that the pure scope change does not request **Scan Tools**, while a deliberate descriptor/visibility change does. Then continue Journey U3 restart and refresh. Publication, credential migration, staging, commit, push, release, and deployment remain separately gated.

## 2026-07-26 — STEP-456 — Repair real ChatGPT reconnect scope negotiation

**Status:** The current-client reconnect failure is repaired test-first and deployed to the existing OAuth runtime. ChatGPT had not reached local approval because it requested the fixed DCR protocol ceiling `codexgpt:read codexgpt:write codexgpt:execute` while the read-only deployment advertised only `codexgpt:read`; the authorization guard rejected the request with `invalid_scope` before creating pending state. The approved client, hostname, issuer, binding, incarnation, and read-only profile remain unchanged. A real UI retry is still required before current-client U2 acceptance.

**Goal:** Preserve the fixed DCR scope ceiling required for future step-up without forcing an App recreation, while issuing only the least-privilege intersection of the client's known request and the capabilities currently enabled by the local deployment.

**Files changed:** `src/auth/oauthProvider.ts`, `test/phase-8-authorization.test.mjs`, `Memory.md`, and this archive volume.

**Reproduction and root cause:**

- Public OAuth metadata and the MCP challenge were healthy and advertised exactly `codexgpt:read`; the approved ChatGPT client remained present and approved.
- Repeated ChatGPT **Connect** attempts produced no local pending authorization.
- Replaying the approved client's exact redirect with the three known scopes reproduced a `302` callback carrying `error=invalid_scope` and `error_description=Requested OAuth scope is not enabled.`
- Replaying the same client with only `codexgpt:read` entered pending successfully, proving the Tunnel, callback, client registration, PKCE path, and local authorization store were not the failure.
- The prior `parseScope()` implementation incorrectly required every requested scope to be currently enabled. This contradicted the U2 contract in which DCR retains a fixed known-scope ceiling while deployment capability changes are negotiated without recreating the App.

**Repair:**

- Authorization requests still reject malformed, duplicate, and unknown scopes.
- Requests containing known scopes are narrowed to their ordered intersection with the current deployment scopes.
- A request with no enabled intersection still fails with `invalid_scope`; no zero-authority grant can be created.
- The pending page, authorization record, code, token response, and durable grant therefore contain only the effective current scopes. A read-only deployment receiving the fixed three-scope ceiling creates a pending request for only `codexgpt:read`.

**Runtime action and live evidence:**

- Rebuilt the repository and restarted only the exact `D:\Dev\codexpro` OAuth launcher process tree with the same supported `start --root` command and managed cloudflared path.
- The restarted runtime retained `binding_e9caab9de8b70c9ea37dc3e35822705d`, `incarnation_b6f91591643df65b8d81b521eb737caf`, the approved ChatGPT client, the dedicated hostname, and the read-only profile.
- The exact approved-client three-scope request now returns the authorization waiting page and creates one pending request whose effective scope is exactly `codexgpt:read`.
- The diagnostic pending request was denied immediately after verification; no diagnostic grant or token was created.

**Exact verification:**

- RED: `node --test test/phase-8-authorization.test.mjs` — the new scope-ceiling narrowing regression failed with `302 invalid_scope`.
- GREEN: `npm run build` plus authorization/auth CLI/MCP integration tests — `28/28` passed.
- `npm run test:focused -- test/phase-8-*.test.mjs` — complete current-Node Phase 8 set `160/160` passed.
- Public metadata returned `200`; unauthenticated MCP returned the exact `401` read challenge; the approved-client ceiling request returned `200` and a read-only pending authorization.

**Adversarial review:**

- The repair does not widen authority: requested scopes must be members of the frozen known set, and issued authority is the intersection with the current deployment.
- Unknown scopes, duplicate scopes, malformed encoding, and known requests with an empty enabled intersection still fail before pending state.
- DCR metadata remains stable, so a pure local capability change does not require App recreation or **Scan Tools**.
- Token and tool-call enforcement remain independent downstream gates: durable grant scope, current deployment scope, request-local policy identity, Policy, and existing mutation controls are still required.
- No client, grant, key, Tunnel, DNS route, hostname, issuer, binding, credential, profile capability, file outside `D:\Dev\codexpro`, stage, commit, push, publication, release, or deployment was created or changed.
- No multi-agent provider was available in this workspace; the result received a manual adversarial review against unknown-scope widening, zero-scope issuance, ordering drift, stale-token escalation, App recreation, and runtime identity drift.

**Risks and limitations:**

- DevSpace cannot click or observe the ChatGPT UI. The user must retry **Connect**, verify the browser shows a pending authorization for `codexgpt:read`, and confirm no **Scan Tools** prompt appears.
- Current verification is on the current Node runtime. Managed Node 20/24 and G8-X remain later closure gates.
- The repository retains the broader authorized uncommitted Phase 8 changes; this step did not stage, commit, push, or normalize unrelated work.

**Rollback:** Reverting this repair would restore the confirmed current-client reconnect failure and is not an operational rollback. The supported operational rollback remains `auth rollback` to the retained Legacy App without deleting OAuth state.

**Next approved action:** In ChatGPT Web, retry **Connect** on the existing OAuth App. When the browser reaches the CodexGPT waiting page, run `node scripts/codexgpt-entry.mjs auth pending --root D:/Dev/codexpro`; approve only the new `ChatGPT` request whose scope is exactly `codexgpt:read`. Then confirm the App connects without **Scan Tools** and continue U2 scope expansion.

## 2026-07-26 — STEP-457 — Validate the real ChatGPT scope lifecycle

**Status:** The existing `codexgpt-Windows` ChatGPT App now passes the real current-client read-only link, same-client scope expansion, bounded write, and post-reduction denial path. The App/client, issuer, hostname, deployment binding, and incarnation remained stable. Journey U2 still retains one explicit control: a deliberate descriptor/visibility change must visibly require **Scan Tools** before U2 is fully closed.

**Goal:** Confirm that the protocol behavior proven in STEP-455/456 is rendered correctly by the real ChatGPT client: least-privilege initial authorization, one understandable scope step-up without App recreation, actual use of the newly granted capability, and immediate loss of effective authority when the local deployment reduces capability.

**Real-client evidence:**

- The existing approved ChatGPT client completed reconnect against the read-only deployment. The resulting active grant contained exactly `codexgpt:read`; ChatGPT displayed a partial-permission notice because it requested the fixed known-scope ceiling, but the App was connected and a real read of `package.json` succeeded.
- The local profile was changed through the supported settings path to `write=workspace`, then the exact OAuth launcher process tree was restarted. The public metadata changed to `codexgpt:read codexgpt:write` while issuer, binding, incarnation, and client remained unchanged.
- A real ChatGPT write request using the old read-only grant triggered one new pending authorization for the same `ChatGPT` client with effective scopes exactly `codexgpt:read,codexgpt:write`; no `execute` scope was requested for approval.
- After local approval and browser continuation, token exchange created active grant `grant_0ff84c0cbc64b4707fabc2c8ae92b9d3` with `read+write`. ChatGPT created `.ai-bridge/g8-u-u2-chatgpt-write.txt` containing exactly `G8-U U2 ChatGPT write scope verified.`
- The profile was then reduced through the supported settings path to `write=off` and the exact service was restarted on the same issuer/binding/incarnation. Public metadata returned to `codexgpt:read` while the broader historical grant remained durable.
- Repeating the edit through the real App produced the normal local-profile result: `write_mode: off`; the mutation was not executed, the file remained byte-for-byte unchanged, and no reconnect/pending authorization was created.
- The broader token therefore gained no authority after reduction: effective authority remained the intersection of token scope and current deployment capability.

**Runtime state after verification:**

- Profile: `write=off`, `bash=off`, `toolMode=full`.
- Runtime healthy on local admin PID `14984`; public hostname remains `codexpro-oauth.drliang.uk`.
- Binding remains `binding_e9caab9de8b70c9ea37dc3e35822705d`; incarnation remains `incarnation_b6f91591643df65b8d81b521eb737caf`.
- Existing approved ChatGPT client remains `clientref_79cab432a216999d838d864ec5d591c5`.
- No OAuth pending authorization remains.

**Adversarial review:**

- A durable broad grant is not equivalent to current authority; the successful reduction denial proves the deployment intersection is enforced at call time.
- The denied mutation left the evidence file unchanged, ruling out a handler-after-denial or partial-write defect.
- The step-up reused the approved DCR client and stable issuer/binding, ruling out hidden App recreation as the source of success.
- The scope approval excluded `execute`, preserving least privilege for this journey.
- No DNS, Tunnel route, signing key, credential provider, client registration, stage, commit, push, publication, release, deployment, or file outside `D:\\Dev\\codexpro` was changed.
- Multi-agent review was unavailable; the result received manual adversarial review against stale-token escalation, partial mutation, reconnect loops, overbroad scope issuance, client replacement, and runtime identity drift.

**Remaining limitation:** The real-client scope lifecycle is accepted, but the Journey U2 descriptor control remains: change the visible tool surface deliberately, confirm ChatGPT requires **Scan Tools**, then restore `toolMode=full`. U3–U7 and G8-X remain incomplete.

**Next approved action:** Run the deliberate descriptor/visibility control in the existing App, confirm **Scan Tools** is required only for that change, restore the full tool surface, then proceed to Journey U3 restart and refresh.

## 2026-07-26 — STEP-458 — Close real ChatGPT Journey U2 and repair workspace snapshot

**Status:** Journey U2 is closed in the existing `codexgpt-Windows` ChatGPT App. A deliberate `toolMode=full→minimal→full` transition produced the expected tool-refresh UX without OAuth reconnect or App recreation; the full-only `workspace_snapshot` tool disappeared in minimal mode and returned in full mode. During the restoration check, the real App exposed a separate standard-guidance `workspace_snapshot` defect. That defect was reproduced against the real repository, repaired test-first, loaded by an exact OAuth process-tree restart, and confirmed through the real ChatGPT client.

**Descriptor-control evidence:**

- The supported settings command changed only `toolMode` from `full` to `minimal`; `write=off`, `bash=off`, hostname, issuer, binding, incarnation, approved client, and grants remained unchanged.
- ChatGPT displayed a tool refresh prompt. After refresh, an exact request for full-only `workspace_snapshot` reported that the tool was unavailable; minimal tools remained usable and no OAuth authorization was requested.
- Restoring `toolMode=full` and restarting the exact launcher restored the full descriptor surface. ChatGPT could again select `workspace_snapshot`, proving the visibility change—not a scope change—was what required tool refresh.
- No **Reconnect**, DCR registration, new client, pending authorization, or App recreation occurred during either descriptor transition.

**Workspace snapshot defect and root cause:**

- The first restored invocation returned `INTERNAL_ERROR`. A local real-repository reproduction showed both `open_current_workspace` and `workspace_snapshot` rejected the default standard-guidance summary shape.
- `workspaceSummary()` correctly includes implicit skill inventory plus `standardGuidance` metadata when guidance mode is `standard`.
- `workspace_snapshot` still used a legacy-only strict provider schema and rejected both the extra `standardGuidance` field and non-empty implicit skills when `include_skills=false`.
- The repair adds optional standard-guidance validation to the snapshot provider contract and permits implicit skill inventory when that validated guidance object is present. It does not add guidance text or new fields to the public snapshot output.
- A later `WORKSPACE_NOT_FOUND` result was not a defect: the user passed a workspace handle across two ChatGPT MCP transport sessions. Workspace handles are intentionally opaque and transport-session-local. Calling `workspace_snapshot` with empty arguments correctly resolves the configured default workspace.

**Files changed:** `src/server.ts`, `test/workspace-snapshot-contract.test.mjs`, `Memory.md`, and this archive volume.

**Exact verification:**

- RED: the new standard-guidance snapshot regression returned `INTERNAL_ERROR`.
- GREEN: `node --test test/workspace-snapshot-contract.test.mjs` — `21/21` passed.
- `npm run build` — passed.
- `npm run test:focused -- test/phase-8-*.test.mjs` — complete current-Node Phase 8 set `160/160` passed.
- The exact OAuth launcher process tree was restarted; the loaded runtime retained `binding_e9caab9de8b70c9ea37dc3e35822705d`, `incarnation_b6f91591643df65b8d81b521eb737caf`, hostname `codexpro-oauth.drliang.uk`, and the existing approved ChatGPT client.
- Real ChatGPT empty-argument `workspace_snapshot` returned success with root `D:\Dev\codexpro` and `tool_mode=full`.

**Adversarial review:**

- The snapshot repair widens only the internal accepted provider shape to match the already-enabled standard-guidance producer; the public strict output schema and authority remain unchanged.
- Guidance instruction text is not added to snapshot structured output. Existing redaction and approved AI-context filename validation remain intact.
- Foreign or stale workspace handles still fail closed; the repair does not make handles cross-session or durable.
- The descriptor test distinguishes capability metadata from authorization: pure scope changes caused no tool refresh, while an actual tool-list change did, and neither transition altered OAuth identity.
- No write capability, execute capability, DNS/Tunnel route, credential, key, client, stage, commit, push, publication, release, or deployment was added.
- No multi-agent provider was available; manual adversarial review covered output widening, instruction-content leakage, implicit-skill bypass, cross-session handle weakening, hidden OAuth relink, and runtime identity drift.

**Runtime state after closure:**

- Profile: `write=off`, `bash=off`, `toolMode=full`.
- OAuth runtime is healthy with the same issuer, binding, incarnation, approved client, and durable grants; no pending authorization remains.
- Journey U2 is accepted. U3–U7 and G8-X remain incomplete.

**Next approved action:** Continue Gate G8-U with Journey U3 restart/refresh using the existing App and stable OAuth identity.

## 2026-07-27 — STEP-459 — Neat-freak reconciliation after Journey U2

**Status:** Active rules, user/security/design documentation, the Phase 8 spec/plan, project roadmap/review, and root memory now match the accepted real-client boundary: Tasks 8A1–8A9 are locally complete, Gate G8-U is authorized and in progress, Journey U2 is closed, and Journey U3 restart/refresh is next. No source/runtime behavior or external state changed.

**Authority and boundary:** The owner requested `@Devspace 用neat-freak整理一下`. Work stayed inside `D:\Dev\codexpro`. No credential, grant, client, Tunnel/DNS route, runtime profile, service, dependency, source, test behavior, stage, commit, push, release, or deployment changed.

**Files changed:** `AGENTS.md`, `README.md`, `README_ZH.md`, `SECURITY.md`, `design.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/reviews/2026-07-26-openai-codex-project-review.md`, the Phase 8 spec/plan, `Memory.md`, and this archive volume.

**Reconciliation:**

- Replaced stale active claims that G8-U had not started or still required authorization with the exact current state: the dedicated OAuth Tunnel/App and fresh link exist, Journey U2 passed, and U3–U7 plus G8-X remain.
- Kept historical checkpoint statements intact or explicitly labeled them as point-in-time facts rather than rewriting archive history.
- Updated public English/Chinese and security copy to claim only observed U2 behavior: linking, local approval, scoped step-up, bounded write/reduction denial, and descriptor refresh. Restart/refresh, revoke/relink, recovery, rollback, and remaining Tunnel behavior are not claimed.
- Compressed `Memory.md` from 19,567 bytes / 131 lines to 15,371 bytes / 119 lines by merging duplicated Phase 8 event narration into stable status and evidence summaries while preserving decisions, gates, limitations, next action, and archive pointers.
- Kept the active Phase 8 history in Volume 3. The volume was 43,484 bytes before this entry; opening a new continuation was unnecessary under the 48-KB threshold.

**Verification:**

- Documentation/contract focused set: `16/16` passed.
- `npm run policy:check`: `Repository operational policy: PASS`.
- `git diff --check`: passed; only repository-standard LF-to-CRLF warnings.
- Relative Markdown links: passed across the 11 edited active rule/user/design/plan files.
- Targeted stale-status scan found one unlabeled Task 8A9 checkpoint sentence; it was rewritten as a historical checkpoint, then the scan passed.
- Changed-Markdown secret signature scan found no private-key block or JWT-shaped value.
- `Memory.md`: 119 lines / 15,371 bytes, below the practical 150-line / 18-KB target.

**Adversarial review:** Reader-state, security-claim, authority-boundary, current-versus-history, and memory-governance passes found no remaining P0–P2 issue. Devspace exposed no separate agent provider, so this is a manual multi-pass review rather than a claimed multi-agent result.

**Risk and rollback:** This is documentation/memory reconciliation only. Revert only STEP-459 documentation edits if needed; the running OAuth deployment and Journey U2 evidence require no rollback.

**Next approved action:** Gate G8-U Journey U3 restart/refresh in the existing OAuth App and stable deployment. U4–U7, G8-X, publication, credential migration, staging, commit, push, release, and deployment remain separately gated.

## 2026-07-27 — STEP-460 — Execute Journey U3 runtime/refresh acceptance

**Status:** The runtime/protocol portions of Journey U3 passed against the live named hostname. Same-profile restart, refresh rotation, stable OAuth ownership, local-admin-only port migration, and the dropped-successful-refresh failure mode all behaved as designed. Journey U3 is not yet fully closed because DevSpace cannot invoke or observe the existing ChatGPT App after restart; one real current-client read must still confirm that ChatGPT resumes without a new local approval.

**Goal:** Exercise the existing production OAuth deployment through restart and refresh without changing hostname, public port, profile capabilities, binding, incarnation, or the approved ChatGPT client; then prove that changing only the local-admin port does not invalidate grants and that a lost successful refresh response deterministically forces relink rather than 500/stall.

**Runtime and external actions:**

- Baseline remained `https://codexpro-oauth.drliang.uk/mcp`, public loopback `8789`, local-admin `8790`, binding `binding_e9caab9de8b70c9ea37dc3e35822705d`, and incarnation `incarnation_b6f91591643df65b8d81b521eb737caf`.
- Restarted only the exact owned OAuth launcher process tree and relaunched through `scripts/codexgpt-entry.mjs start --root D:\Dev\codexpro` with the verified managed cloudflared binary. No DNS, Tunnel, hostname, public-port, profile capability, key, or credential changed.
- Created one disposable read-only DCR client and grant for deterministic refresh evidence. Access/refresh values stayed in process memory and were never printed or written.
- Changed only the local-admin port through supported `auth setup` candidate probing: `8790→8791`, proved the existing grant still refreshed, then restored `8791→8790` and proved refresh again. The public Tunnel ingress remained bound to `127.0.0.1:8789` throughout.
- Injected a dropped successful refresh by terminating the response body after the server returned success. The durable generation advanced once; retrying the now-old token returned HTTP `400 invalid_grant` and revoked only that disposable family with reason `replay`.
- Removed the disposable client through the supported owner command. Its revoked audit/history record remains intentionally durable; it has no active grant.

**Live evidence:**

- Same-profile restart retained the exact binding/incarnation, the approved ChatGPT client, both pre-existing active ChatGPT grants, and zero pending authorizations.
- The disposable grant refreshed successfully after restart without a new authorization. JWT `sub`, `client_id`, `grant_id`, audience, scope, and grant revision remained stable across rotations.
- A workspace handle opened under one access token remained usable through `workspace_snapshot` after rotating to the next access token in the same MCP session, directly proving stable workspace ownership across refresh.
- The `8790→8791` restart retained binding/incarnation, existing ChatGPT grants, disposable client/grant identity, and zero pending authorizations. The same grant refreshed and initialized MCP successfully.
- After restoring `8790`, public and local health each returned HTTP 200. Final runtime PID was `19796`; no OAuth pending authorization remained.
- The dropped-response family ended `revoked/replay`; the existing approved ChatGPT client and its two active grants were unchanged.

**Exact verification:**

- `node --check .ai-bridge/g8-u-u3-refresh-probe.mjs` — passed.
- `node .ai-bridge/g8-u-u3-refresh-probe.mjs` — `PASS` for same-profile restart, stable owner claims, same-session workspace binding after refresh, local-admin `8790→8791→8790`, grant continuity, and dropped-response replay revocation.
- Public and local-admin `/healthz` — HTTP `200/200` after final restoration.
- Focused inherited refresh/auth/MCP/workspace set — `47/47` passed.
- Task-worktree durable owner-store regression — `1/1` passed.

**Adversarial review:**

- The probe verified the launcher ancestry and exact workspace command before force-terminating the owned process tree; it could not target an unrelated Node process.
- Port migration used the existing owner-marked dedicated Tunnel config and `--no-tunnel-changes`; no Cloudflare mutation was needed or performed.
- Stable subject/client/grant claims plus live same-session workspace reuse demonstrate that refresh rotation does not create a new OAuth owner. Inherited tests separately prove change-set ownership follows the stable OAuth subject and task-worktree records remain sealed owner-bound across reconstruction.
- The dropped-response test did not retain or expose the successor token. Revoking on replay is the intended fail-closed result, while the approved ChatGPT grants remained active.
- No production source behavior changed. The only retained probe is ignored under `.ai-bridge/`; no token, code, cookie, private key, DPAPI material, or Cloudflare credential was persisted.
- DevSpace exposed no separate agent provider, so the completed result received manual security/correctness/operability adversarial passes rather than a claimed multi-agent review.

**Risks and limitations:**

- Existing ChatGPT grant continuity and zero pending approval are confirmed locally, but the required user-observable current-client call after restart is not yet observed. Journey U3 must remain open until the existing App performs one read without presenting a new local approval.
- Live change-set/worktree creation was intentionally not attempted because the final U2 profile is read-only. Their stable owner-domain behavior remains covered by inherited regressions, not reclassified as a live mutation result.
- The runtime is restored to local-admin `8790`; the durable revoked disposable client/grant records are expected audit state, not active authority.

**Rollback:** No operational rollback is needed. The runtime and profile are back at the pre-step hostname, public/local ports, binding, incarnation, capabilities, approved ChatGPT client, and active grants. The ignored probe may be retained as bounded evidence; the revoked disposable history is intentionally non-deletable through normal cleanup.

**Next approved action:** Invoke one read through the existing `codexgpt-Windows` ChatGPT App. Accept U3 only if it succeeds with no new local approval or pending authorization. Then continue U4 revoke/relink. This entry closes Phase 8 Volume 3 because the file now exceeds the 48-KB continuation threshold; begin the next complete STEP in `phase-8-part-4.md`.
