# Phase 8 OAuth 2.1 and Public Authentication TDD Plan

Date: 2026-07-26
Status: local implementation closure accepted; G8-0 and Tasks 8A1–8A9, authorized Gate G8-U through Journey U7, and STEP-470 local G8-X are complete. U6 closed with a documented evidence substitution: the original retained Legacy App was deleted, so same-App Legacy identity continuity is not claimed; a recreated Legacy App proved rollback compatibility, exact no-argument setup restored OAuth, and the existing OAuth App proved return continuity. STEP-468 closed U7 with fail-early shared/unowned Tunnel refusal plus live public/local boundary evidence. Exact-head CI and publication remain separately authorized
Paired design: [Phase 8 OAuth 2.1 and Public Authentication Usability Design](../specs/2026-07-24-phase-8-oauth-and-public-auth-design.md)

## 1. Deliverable

Phase 8 Core is complete only when a fresh user can:

1. run one OAuth setup command that reuses an existing named tunnel or guides a cold-start Cloudflare login/create/DNS flow behind one explicit external-change confirmation;
2. paste a token-free `https://<host>/mcp` URL into a current ChatGPT app;
3. approve the first link once through a separate local-only control plane;
4. use every capability enabled by the existing CodexGPT profile under exact OAuth scopes and existing Policy/Approval/Audit rules;
5. restart without relinking;
6. revoke access and see the next call fail;
7. relink or explicitly restart in legacy mode with no data deletion.

The implementation is a single-owner, colocated OAuth authorization/resource server. It uses constrained DCR, PKCE `S256`, stable resource binding, ES256 access tokens, rotating opaque refresh tokens, Windows DPAPI CurrentUser, request-local identity, separate public/local listeners, and a stable named Cloudflare Tunnel.

Phase 8 adds no MCP tool and no execution authority. V1/V2/V3/V4/V5 remain exact `28/31/39/51/52`.

## 2. Rules for every implementation task

1. Do not begin any runtime task until Gate G8-0 records fresh runtime and exact dependency authorization.
2. Begin from a clean reconciled head containing Phase 7 Core closure `a0b9f46e2297297959527f7570c9cb7942cc8fb3` and the approved CI-optimization baseline `b4b041da32be7bfb133495fb30aa851d67d4f216`. A dirty or ambiguous base is a blocker, not an invitation to absorb unrelated changes.
3. Inspect the current versions of every named file before editing; this plan records intent, not permission to overwrite later code.
4. Follow test-driven development: add the exact failing regression first, confirm the expected failure, implement the smallest complete behavior, and rerun the same test.
5. Complete one independently useful vertical slice at a time. Do not mix Phase 8B CIMD/private-key-JWT/mTLS/Access, Phase 9, unrelated refactors, or deployment work.
6. Preserve explicit `legacy` behavior and exact V1–V5 tool counts after every task.
7. OAuth mode never accepts query credentials, never shares a public listener with admin authority, and never silently falls back.
8. Every bearer-bearing MCP POST/GET/DELETE request is verified. Session initialization is not a substitute for request verification.
9. Every authorization decision uses request-local identity. No global/current-last-user variable or initialization-token fallback is allowed.
10. Every new secret is excluded from persistent config, displayed/copied output, logs, audit, errors, fixtures, generated docs, package contents, CodexGPT/helper argv/environment, and temporary files. The only URL exceptions are protocol-required, one-use, short-lived values in the exact OAuth callback query and the loopback bootstrap fragment; they require no-store/no-referrer, route-only logging, bounded TTL, and exact consumption tests. Tests prove only project-controlled boundaries and do not claim control over browser internals or arbitrary same-user processes.
11. Every new application-state write uses the reviewed atomic state boundary, exact schemas, bounded state, a single deployment writer, and the direct mutation inventory.
12. Production OAuth on non-Windows fails closed until a separately reviewed native credential provider exists. Cross-platform tests inject memory fixtures rather than a plaintext fallback.
13. Real ChatGPT, Cloudflare, DPAPI, or credentials are used only in an explicitly authorized live gate. Unit/integration tests use disposable fixtures.
14. A gate is classified as `passed`, `code-failed`, `not-run`, `environment-blocked`, or `platform-skipped`.
15. Every complete task runs its focused suite, managed Node 20/24 affected suite, build, repository policy, diff/secret/scope checks, then updates `Memory.md` and appends the active Phase 8 archive.
16. Runtime-sensitive ordinary suites run through `scripts/long-task-runner.mjs`; control/all runs only in CI or a proven independent native terminal. Stop only one exact owned run ID.
17. Do not stage, commit, push, publish, deploy, mutate DNS/tunnels, create/migrate real credentials, or delete auth state without the applicable explicit authorization.
18. After the complete runtime exists, run independent execution/correctness, security/compatibility, and UX/operability reviews against the implementation. Fix root causes and add permanent regressions before live closure.

## 3. Exact verification command shapes

This checkout must continue to use the retained legacy managed-toolchain root. Every toolchain command, including a command nested under the detached runner, receives it explicitly:

```powershell
$phase8ToolchainRoot = Join-Path $env:LOCALAPPDATA 'CodexPro\toolchains'
```

G8-0 records that the resolved absolute root is exactly this retained directory and that both approved majors are already ready. Phase 8 never runs `ensure`, copies a runtime, or migrates to the default `CodexGPT\toolchains` root.

Use the current runtime for the first RED/GREEN loop:

```powershell
npm run test:focused -- <test-files...>
npm run build
npm run policy:check
git diff --check
git status --short --branch
```

Use both managed majors for auth, HTTP, crypto, native-helper integration, and package-sensitive affected tests:

```powershell
node scripts/toolchain-manager.mjs exec --major 20 --root $phase8ToolchainRoot -- npm run test:focused -- <test-files...>
node scripts/toolchain-manager.mjs exec --major 24 --root $phase8ToolchainRoot -- npm run test:focused -- <test-files...>
node scripts/toolchain-manager.mjs exec --major 20 --root $phase8ToolchainRoot -- npm run build
node scripts/toolchain-manager.mjs exec --major 24 --root $phase8ToolchainRoot -- npm run build
```

Before an ordinary detached run:

```powershell
node scripts/long-task-runner.mjs list
node scripts/long-task-runner.mjs start --kind phase8-core-ordinary -- node scripts/toolchain-manager.mjs matrix --major all --root $phase8ToolchainRoot -- node scripts/test-domains.mjs run --domain ordinary
node scripts/long-task-runner.mjs status --run <exact-run-id>
```

Closure shapes:

```powershell
node scripts/long-task-runner.mjs start --kind phase8-core-final-ordinary -- node scripts/toolchain-manager.mjs matrix --major all --root $phase8ToolchainRoot -- node scripts/test-domains.mjs run --domain ordinary
node scripts/long-task-runner.mjs start --kind phase8-core-final-smoke -- node scripts/toolchain-manager.mjs matrix --major all --root $phase8ToolchainRoot -- npm run smoke
npm run policy:check
npm pack --dry-run --json
git diff --check
```

At implementation time, re-read the exact script syntax and domain routing. These command shapes do not authorize execution and do not justify running `all`, killing broad process names, or deleting run/TEMP roots manually.

## 4. Gate G8-0 — Authority, base, protocol, and dependency freeze

### Goal

Prove that Phase 8 runtime has authority, starts from a known compatible head, and uses exact current protocol/dependency facts before any source or package edit.

### Preconditions

- Phase 7 Core is formally closed at `a0b9f46e2297297959527f7570c9cb7942cc8fb3` by exact-head run `30171313296`.
- The implementation base contains the approved CI-optimization head `b4b041da32be7bfb133495fb30aa851d67d4f216`, exact-head run `30177507346`, or a later explicitly reconciled successor.
- Git status is clean or contains only changes the user has explicitly placed in Phase 8 scope.
- The user explicitly authorizes Phase 8 Core runtime, exact production dependencies, Windows DPAPI helper work, and disposable local credential tests.
- Cloudflare/DNS mutation, real ChatGPT linking, staging, commit, push, publication, release, and deployment remain separately stated.

### Required reads

- root `AGENTS.md` and `Memory.md`;
- active Phase 7 closure archive and exact-head evidence;
- paired Phase 8 design and this plan;
- `src/http.ts`, `src/config.ts`, `src/server.ts`, `src/profileStore.ts`;
- `src/policy/identity.ts`, `runtime.ts`, `schemas.ts`, `types.ts`, tool policy;
- current local approval/control runtime;
- transaction installation/state/lock/application-state writers;
- direct mutation and native API inventories;
- public entry, setup, stable tunnel, doctor, package, and CI scripts;
- current SDK OAuth router/provider/client-store/token middleware source;
- current OpenAI authentication/connection/testing/security guidance;
- current MCP authorization specification and referenced RFCs.

### Protocol freeze

Record:

- exact issuer/resource/path forms;
- exact protected-resource and authorization metadata;
- exact DCR redirect patterns from current OpenAI docs;
- exact SDK root route requirement and project-owned metadata/registration composition;
- exact PKCE/resource/scope/error requirements, including mandatory resource on authorization, code exchange, and refresh;
- exact RFC 9207 issuer-response metadata/callback behavior and the contract tests that must hold before any live gate;
- missing-token discovery versus invalid-token challenge semantics;
- fixed known DCR scope ceiling versus dynamic deployment-enabled metadata/authorization scopes;
- public waiting/status/continue browser behavior plus explicit ChatGPT cookie/navigation assumptions reserved for Gate G8-U;
- every bounded Core constant and the authenticated refresh-envelope format;
- endpoint-by-input OAuth error matrix, unknown-extension ignore behavior, and no-open-CORS authorization pages;
- public admission, ES256 work, invalid-Bearer, polling, metadata/JWKS, positive/negative cache, reserved-capacity, and invalid-audit aggregation ceilings;
- installation-wide audit as the only audit store and binding ID versus recoverable incarnation ID;
- exact ChatGPT tool `securitySchemes` and `_meta["mcp/www_authenticate"]` requirements;
- current Developer mode/App creation/Scan Tools path;
- current documented redirect URI behavior;
- current documented DCR expectations, with live DCR acceptance explicitly deferred to Gate G8-U because no compatible endpoint exists before the vertical slice.

If any standards, SDK, or documented-platform fact conflicts with the paired design, update and adversarially review the design before implementation. Live ChatGPT behavior is not a G8-0 precondition: it is a fail-closed G8-U acceptance condition after the runnable OAuth path exists. Do not improvise inside runtime code.

### Dependency freeze

As revalidated on 2026-07-26, the candidate exact production set is:

```text
@modelcontextprotocol/sdk 1.29.0
jose                     6.2.4
```

The implementation gate must:

- query current registry metadata and advisories;
- inspect license, unpacked contents, dependency tree, install scripts, Node engines, release provenance, and current OAuth implementation;
- run the existing repository dependency/policy checks;
- approve exact versions without caret/tilde during G8-0, then apply those exact pins as Task 8A1's first package change;
- add `jose` as a direct dependency before importing it, even though the SDK also depends on it transitively;
- bind SDK OAuth behavior with a permanent contract test rather than relying on undocumented internals.

If a newer SDK provides a materially different reviewed OAuth path, stop and reconcile this plan instead of silently upgrading.

### Baseline verification

```powershell
$phase8ToolchainRoot = Join-Path $env:LOCALAPPDATA 'CodexPro\toolchains'
git status --short --branch
git rev-parse HEAD
npm ls @modelcontextprotocol/sdk jose --depth=1
npm run build
npm run policy:check
node scripts/toolchain-manager.mjs status --root $phase8ToolchainRoot
```

Record the exact absolute root reported by `status`, prove Node 20 and 24 are both already `ready`, and fail G8-0 if the retained root is missing; do not repair or migrate it inside Phase 8. Run the inherited auth/Host/Origin/query-token, policy identity/scope, HTTP session, local control, atomic state, mutation architecture, package, and Smoke baselines through the current approved routing.

### Exit

G8-0 records authority text, exact base SHA, clean-scope proof, approved exact dependency versions/digests/licenses/advisories, protocol snapshot date, baseline commands/results, explicit live-compatibility assumptions reserved for G8-U, risks, rollback, and Task 8A1 as the only next action. No real ChatGPT, Tunnel, DNS, or credential mutation is required to exit G8-0.

## 5. Task 8A1 — Auth mode, canonical deployment identity, and metadata

### Goal

Add pure configuration and metadata contracts without activating OAuth routes. Explicit OAuth configuration must still fail `OAUTH_RUNTIME_UNAVAILABLE` until later tasks close.

### Add

- `src/auth/types.ts`
- `src/auth/schemas.ts`
- `src/auth/configuration.ts`
- `src/auth/metadata.ts`
- `src/auth/errors.ts`
- `src/auth/index.ts`
- `test/phase-8-auth-config.test.mjs`
- `test/phase-8-oauth-metadata.test.mjs`
- `test/phase-8-sdk-auth-contract.test.mjs`

### Modify

- `src/config.ts`
- `src/profileStore.ts`
- `package.json`
- `package-lock.json`

Package changes are limited to the exact G8-0 pins.

### RED tests

Assert:

- `authMode` accepts only `legacy|oauth`;
- omitted mode remains `legacy`;
- current-process env > persisted-user env > selected-root profile > omitted legacy; each valid lower-precedence difference is an override, status shows the winning source, and invalid values fail before startup;
- startup, setup, status, doctor, and rollback consume the same pure auth-mode resolver;
- OAuth plus query-token/no-token flags fails exactly;
- OAuth requires an explicit canonical `--root` unless the current directory has one exact matching profile, Windows production capability, stable HTTPS hostname, `/mcp` resource, dedicated owner-marked named tunnel, public loopback bind, and a distinct local-admin port;
- issuer/resource derive only from normalized saved configuration, never request headers;
- one issuer/resource/hostname binds to one canonical profile/root; a conflicting root fails without changing either deployment;
- public/local-admin port changes do not change deployment identity, grant revision, or metadata issuer/resource;
- hostname rejects credentials, path other than `/` or `/mcp`, query, fragment, wildcard, trailing-dot ambiguity, invalid IDN, and non-default unexpected port unless explicitly supported;
- profile stores safe selectors only;
- exact metadata JSON/headers for read-only, read+write, and read+write+execute deployments; both documents publish the same exact ordered `enabledOAuthScopes`;
- exact RFC 9207 issuer-response support plus root endpoints `/`, `/authorize`, `/authorize/status/*`, `/authorize/continue/*`, `/token`, `/register`, `/revoke`, `/jwks`, `/healthz`, and `/mcp`;
- no CIMD, OIDC, client-secret method, implicit grant, or unsupported endpoint is advertised;
- metadata/registration are project-owned; SDK authorization/token/revoke behavior is bound by a permanent contract test;
- public OAuth endpoint CORS is explicit and credential-free, local admin has no such CORS, and CORS is never authorization;
- SDK auth contract exposes the exact handler/provider/client-store primitives consumed by later tasks;
- explicit OAuth remains unavailable.

### Implementation

Introduce:

```ts
type HttpAuthMode = "legacy" | "oauth";

interface OAuthDeploymentIdentity {
  issuer: string;
  resource: string;
  hostname: string;
  profileId: string;
  bindingId: string;
  incarnationId: string;
  recoveryEpoch: string;
}

interface OAuthListenerConfig {
  publicHost: "127.0.0.1";
  publicPort: number;
  localAdminHost: "127.0.0.1";
  localAdminPort: number;
}
```

`bindingId`, `incarnationId`, and `recoveryEpoch` are random persisted opaque identifiers, not path hashes or public OAuth identifiers. `bindingId` remains stable for the exact canonical root/issuer/resource/hostname/tunnel ownership binding; forced recovery rotates `incarnationId`, key, pepper, and epoch. A pure resolver derives the canonical root/profile/issuer/resource tuple and ordered `enabledOAuthScopes`; the application-state layer later binds it to these persisted identifiers and the installation hostname registry.

Build metadata with pure functions that accept a validated deployment identity and the exact enabled-scope list. Set exact JSON, `application/json`, frozen no-store or bounded safe cache headers, RFC 9207 support, and `X-Content-Type-Options`. The published `resource_documentation` target requires the static safe root page. Define CORS per route: discovery/token/registration/revocation machine routes may use reviewed origin-agnostic responses without cookies or credential authority; authorize/wait/status/continue and `/mcp` have no inherited open CORS and keep their exact Origin contracts; local admin remains exact same-origin only.

Do not yet mount a route, generate a key, create state, or alter legacy startup.

### Narrow verification

```powershell
npm run test:focused -- test/phase-8-auth-config.test.mjs test/phase-8-oauth-metadata.test.mjs test/phase-8-sdk-auth-contract.test.mjs test/config-realpath.test.mjs test/policy-profile-store.test.mjs test/phase-3d-contract-and-config.test.mjs
npm run build
npm run policy:check
git diff --check
```

Repeat affected tests and build on managed Node 20 and 24.

### Exit

Pure contracts are frozen, package pins are exact/audited, OAuth cannot activate, legacy remains exact, and Task 8A2 is the only next action.

## 6. Task 8A2 — DPAPI credential provider and atomic auth state

### Goal

Create the production secret/state foundation without any public OAuth activation.

### Add

- `src/auth/credentialStore.ts`
- `src/auth/windowsDpapi.ts`
- `src/auth/keyManager.ts`
- `src/auth/stateStore.ts`
- `src/auth/deploymentLock.ts`
- `src/auth/deploymentRegistry.ts`
- `src/auth/recovery.ts`
- `scripts/windows-credential-host-protocol-v1.json`
- `scripts/windows-credential-host-manifest.json`
- `scripts/windows-credential-host.cs`
- `scripts/windows-credential-host.ps1`
- `test/phase-8-auth-state.test.mjs`
- `test/phase-8-auth-lock.test.mjs`
- `test/phase-8-windows-dpapi.test.mjs`
- `test/phase-8-auth-key-rotation.test.mjs`
- `test/phase-8-auth-recovery.test.mjs`
- `test/phase-8-auth-migration.test.mjs`
- `test/phase-8-auth-audit.test.mjs`

### Modify

- `src/transactions/atomicStateFile.ts` only if a generic missing invariant is proven; otherwise reuse it unchanged;
- `src/audit/types.ts`, `src/audit/schemas.ts`, `src/audit/runtime.ts`, and query/filter code only for the exact Phase 8 event extension;
- `test/mutation-architecture.test.mjs`;
- `scripts/windows-native-api-inventory-v1.json`;
- repository policy/package include rules as required.

### RED tests

Assert:

- CurrentUser DPAPI round trip works on Windows with disposable bytes;
- wrong purpose/entropy, corrupt blob, different provider, malformed protocol, oversize frame, helper crash, timeout, or stderr anomaly fails closed;
- secret bytes never enter argv, env, temp files, logs, thrown messages, fixtures, or serialized public state;
- OAuth production on non-Windows has no plaintext fallback;
- installation owner subject is created once under an installation lock; each profile/issuer gets a stable random binding ID plus a replaceable random incarnation ID, recovery epoch, P-256 key, pepper, state root, and writer lock;
- two distinct profile/issuer deployments initialize/run concurrently with one stable owner subject and no key/state crossover;
- the installation registry refuses two roots for one issuer/resource/hostname and never silently rebinds;
- concurrent initializers for one deployment publish one valid state;
- second live process ownership fails exactly;
- stale evidence never authorizes broad deletion;
- state writes are schema-validated, contained, durable/atomic, and preserve the last valid value on failure;
- known old schema migrates copy-on-write after a verified backup; an old binary or unknown future schema never strips/rewrites fields;
- corrupt/partial state enters recovery-required and recovery refuses a live writer;
- restore of a valid pre-revocation backup preserves the exact binding/tunnel-owner marker but generates a new incarnation/key/pepper/epoch, restores no active grant/family, leaves every old access/refresh token invalid, and atomically updates deployment state plus the installation registry current-incarnation reference without remote Cloudflare mutation;
- crash injection at every restore publish point leaves either the complete old or complete new incarnation, never a double hostname binding or registry/state mismatch;
- stale-lock unlock requires exact dead-owner evidence; quarantine/backup ceilings fail closed without deleting evidence;
- rotation publishes new active `kid`, retains only needed old public key, and never retains old private key;
- private JWK material exists only in protected payload and process memory;
- the existing installation-wide MAC-chained audit is the only audit store; deployment state holds only bounded correlation/cursor references;
- old audit readers/filters/cursors remain compatible; every durable auth state transition is audit-before-success and audit-writer failure is fail-closed;
- unauthenticated request floods aggregate into bounded first-event/window-summary records rather than one durable write per request;
- mutation/native inventories fail on unreviewed call drift.

### Implementation

Use a small line/framed protocol with fixed operations:

```text
protect-v1
unprotect-v1
probe-v1
```

The helper:

- compiles/runs from fixed reviewed source like the existing Windows native helpers;
- uses `ProtectedData.Protect/Unprotect(..., CurrentUser)`;
- receives payload through stdin and returns bounded structured output through stdout;
- has a hidden window;
- rejects caller-selected algorithms, paths, commands, entropy, providers, or scope.

Generate a stable random owner subject in a separate installation record, a stable random `bindingId` for the exact root/issuer/resource/hostname/tunnel binding, and a replaceable random `incarnationId`/recovery epoch/ES256 key/hash pepper in each deployment record. Bind DPAPI additional entropy to a fixed version/purpose: installation purpose for the owner record and exact binding/incarnation purpose for deployment secrets.

Reuse the atomic application-state writer and process-liveness concepts. Add exact schema versions and copy-on-write migration. Recovery restore never republishes backed-up signing/refresh authority: under fixed installation-registry → deployment lock order it writes/verifies a complete unreachable incarnation directory with new key/pepper/epoch and inactive grants, then atomically replaces the registry current-incarnation pointer as the sole commit point. Startup resolves state only through that pointer; the binding-only tunnel-owner marker stays unchanged, and no Tunnel/DNS operation occurs. Extend the existing persistent audit schema/runtime instead of building a second deployment log. Do not reuse the Phase 3 plaintext installation master key as an OAuth credential.

### Narrow verification

```powershell
npm run test:focused -- test/phase-8-auth-state.test.mjs test/phase-8-auth-lock.test.mjs test/phase-8-auth-key-rotation.test.mjs test/phase-8-auth-recovery.test.mjs test/phase-8-auth-migration.test.mjs test/phase-8-auth-audit.test.mjs test/audit-schema.test.mjs test/audit-store.test.mjs test/audit-query.test.mjs test/mutation-architecture.test.mjs
npm run build
npm run policy:check
git diff --check
```

On Windows, add:

```powershell
npm run test:focused -- test/phase-8-windows-dpapi.test.mjs
```

Run portable suites/build on managed Node 20/24 and Windows DPAPI on both managed majors. Non-Windows DPAPI is `platform-skipped`, while non-Windows production-fail-closed tests must pass.

### Exit

Protected key/state lifecycle works, OAuth remains unavailable publicly, no plaintext fallback exists, and Task 8A3 is the only next action.

## 7. Task 8A3 — Physical public/local listener separation

### Goal

Build the physical routing boundary and reuse the existing current-user local-control channel before adding authorization endpoints. OAuth mode exposes safe metadata/liveness on the public port; owner operations have only the local-control CLI path in this slice. The browser admin session is completed in Task 8A7 after the runnable OAuth vertical slice.

### Add

- `src/http/publicApp.ts`
- `src/http/localAdminApp.ts`
- `src/http/securityHeaders.ts`
- `test/phase-8-listener-separation.test.mjs`
- `test/phase-8-public-health.test.mjs`

### Modify

- `src/http.ts`
- `src/profileStore.ts`
- `scripts/codexgpt.mjs` only for safe runtime status URL generation;
- existing HTTP/admin/onboarding tests.

### RED tests

Assert:

- OAuth public and local-admin listeners use distinct loopback ports;
- public routes include exact metadata, required static safe `/` documentation, and minimal health but no setup/profile/admin/owner-approve/local-revoke/key-rotate;
- local routes are absent from the public router, not merely denied by middleware;
- before Task 8A7 the local browser app exposes no owner mutation route; current-user CLI calls use the existing local-control authentication and same `OwnerAdminService` interface;
- public health contains no roots, modes beyond safe auth state, profile path, owner/client/grant data, credential state, or environment detail;
- metadata/JWKS are pre-serialized per config/key revision with exact 60-second cache contract; root/health are no-store; their 32-active/64-queued/600-per-minute ceiling allocates bounded memory and performs no per-request durable audit;
- public listener ignores forwarded headers for authority;
- OAuth Host validation uses exact configured hostname;
- discovery/token/register/revoke CORS cannot reach local-admin routes, add cookie authority, or bypass Host/client/redirect/resource/PKCE checks; authorize/wait/status/continue have no open CORS;
- legacy mode retains its existing routes and responses until a later explicit migration;
- Cloudflare ingress model contains no local-admin port.

### Implementation

Refactor `src/http.ts` into orchestration plus app factories. Keep legacy route behavior behind the existing legacy path. Add OAuth-mode factories but keep `/mcp` authorization unavailable until Task 8A5. Establish the `OwnerAdminService` interface and route only the existing current-user local-control CLI adapter to it.

Do not use a public-host cookie for admin authority.

### Narrow verification

```powershell
npm run test:focused -- test/phase-8-listener-separation.test.mjs test/phase-8-public-health.test.mjs test/http-security.test.mjs test/process-local-control-cli.test.mjs test/local-control-protocol.test.mjs test/phase-7-http-reconnect-preview.test.mjs
npm run build
npm run policy:check
git diff --check
```

Run affected HTTP suites/build on managed Node 20/24.

### Exit

The public/local route boundary is physical and tested, legacy is unchanged, OAuth MCP still unavailable, and Task 8A4 is the only next action.

## 8. Task 8A4 — Constrained DCR, PKCE authorization, and local owner approval

**Local status (2026-07-26): complete.** Project-owned bounded DCR, PKCE authorization, current-user local approval/denial, one-use code delivery, exact route/error/security-header contracts, durable client state, process-ephemeral pending/code state, client cleanup, audit-before-publication, redaction, and reserved `/mcp` admission are implemented and verified. `/token`, `/revoke`, and authorized `/mcp` remain unavailable by design until Task 8A5.

### Goal

Complete registration and owner authorization through one-use codes, but do not yet issue production access/refresh tokens.

### Add

- `src/auth/clientStore.ts`
- `src/auth/authorizationStore.ts`
- `src/auth/ownerApproval.ts`
- `src/auth/oauthProvider.ts`
- `src/auth/rateLimits.ts`
- `test/phase-8-dcr.test.mjs`
- `test/phase-8-authorization.test.mjs`
- `test/phase-8-owner-approval.test.mjs`
- `test/phase-8-oauth-bounds.test.mjs`

### Modify

- `src/http/publicApp.ts`
- `src/http/localAdminApp.ts`
- local-control operation schemas/dispatch;
- auth state schemas/store;
- redaction utilities/tests;
- SDK contract test.

### RED tests

#### DCR

- route is exactly `POST /register`; `/oauth/register` and hidden SDK registration routes do not exist;
- accepts one exact current ChatGPT callback pattern and the documented legacy callback;
- rejects arbitrary HTTPS, localhost, custom scheme, wildcard, userinfo, query/fragment where forbidden, duplicate/multiple redirect, malformed callback ID, wrong grant/response/auth method, understood secret/JWKS/software-statement input, and oversized/duplicate JSON; bounded unknown extensions are ignored without log/store/echo;
- issues random public client ID and no secret;
- normalizes omitted response/grant/auth fields to `code`, both `authorization_code|refresh_token`, and `none`; an explicit auth-code-only/unknown grant set is rejected;
- accepts only known DCR scopes and returns the fixed three-scope Core protocol ceiling, with no registration access token/management URI; registration itself grants no current capability;
- a client first registered while the deployment is read-only can, after write is enabled through the normal profile path and the OAuth service restarts without changing binding/issuer, complete step-up authorization with the same client and a fresh local approval while its old token remains read-only;
- returns exact sanitized metadata, `client_id`, `client_id_issued_at`, and `token_endpoint_auth_method: none`;
- preserves exact registered redirect;
- bounds unapproved/approved clients and expires only eligible unapproved records;
- capacity failure gives local cleanup action and never silently removes active clients;
- DCR route/body/rate behavior is non-oracular.

#### Authorization

- routes are exactly `GET|POST /authorize`, `GET /authorize/status/<opaque-pending-id>`, and `GET /authorize/continue/<opaque-pending-id>`; `/oauth/authorize`, alternate status/continue paths, and alternate methods do not exist;
- requires `code`, known client, exact redirect, non-empty bounded state, exact resource, enabled known scopes, exact 43-character unpadded base64url S256 challenge/method; omitted/empty scope normalizes to current enabled scopes;
- rejects `plain`, missing PKCE, unsupported grant, missing/malformed/duplicate/wrong resource, scope widening, stale client, and duplicate standard-parameter pollution with the frozen error matrix; bounded unknown extensions are ignored;
- pending request is browser-bound, bounded, five-minute, and restart-ephemeral;
- public page contains no workspace path or secret;
- status requires exact pending ID + host-only HttpOnly binding cookie, returns only `pending|approved|denied|expired`, and has no CORS;
- approved/denied/expired each creates or retains one cookie-bound terminal delivery; continue requires the exact cookie, atomically consumes once, clears it, and redirects only to the verified callback with respectively code/access_denied/temporarily_unavailable plus original state and exact RFC 9207 issuer;
- expired active requests retain only a code-free terminal delivery for at most sixty additional seconds and remain charged to the cap; unknown/cross-cookie/double/late continue is non-oracular;
- public page/correlation code cannot approve;
- local CLI approval/denial uses the existing current-user local-control channel and the shared owner service; local browser approval remains unavailable until Task 8A7;
- local view shows exact safe facts;
- code is random, hashed, sixty-second, exact-client/redirect/resource/challenge/scope bound, and one-use;
- approval-vs-denial-vs-expiry, continue-vs-continue, and terminal-delivery-expiry races have one linearized result; redirects encode state/error/code/issuer exactly and cannot inject headers or alternate origins;
- registration/approval/denial/code creation transitions use the installation-wide MAC-chained audit before reporting terminal success; audit failure leaves no partial grant/code and returns one safe local recovery action;
- before Task 8A5, mounted `/token` and `/revoke` return one stable no-store `OAUTH_TOKEN_RUNTIME_UNAVAILABLE` response, mutate no state, disclose no secret/client fact, never call an incomplete provider, and never become 500;
- authorization/wait/status/continue responses freeze CSP `frame-ancestors 'none'`, no-referrer, nosniff, no-store, cookie scope, and no-third-party-asset behavior;
- fixed-seed property/adversarial cases cover duplicate ordering, percent encoding, Unicode/empty input, charset/content-type, URI normalization, JSON duplicate keys, and every exact byte/count boundary.
- pending/status/continue and global public admission use the exact design queues/rates; a polling flood has bounded memory/audit, cannot reveal pending/client existence, and does not consume the `/mcp` reserved capacity.

### Implementation

Mount project-owned exact metadata, required safe `/` page, and `/jwks` routes first. Implement project-owned `POST /register` with bounded raw JSON parsing, duplicate semantic-field rejection, ignored bounded unknown extensions, strict ChatGPT public-client validation, rate/cap limits, an exact minimal registration response, and the durable client store.

Pass the SDK provider a client-store view that supports lookup but omits `registerClient`, so the SDK cannot mount its broader DCR route or advertise client-secret registration. Mount the exact `@modelcontextprotocol/sdk@1.29.0` `mcpAuthRouter` at the application root, as its contract requires, for `/authorize`, `/token`, and `/revoke`. Put a project-owned bounded query/`application/x-www-form-urlencoded` parser plus Host, method, content-type, parameter, rate, safe-cache-header, safe-error, and exact error-code guards before those handlers. It must reject duplicate standard/ambiguous fields, understood forbidden `client_secret`/Basic client auth, JSON/multipart token bodies, and parameter pollution; bounded unknown extensions are ignored without log/store/echo. The guard provides one canonical parsed object to the SDK and explicitly returns `invalid_target`, `invalid_scope`, `invalid_client`, `invalid_grant`, or `invalid_request` per the design. Use the project limiter and explicitly disable the SDK's IP limiter only after the former is active, because every Cloudflare request reaches the process from loopback. Keep the exact project metadata route earlier in Express order so the SDK's hard-coded `client_secret_post` metadata is never published.

The SDK contract regression must enumerate the effective public route table, prove `/oauth/*` and a second `/register` are absent, prove only public-client `none` behavior is reachable, prove success and every early error retain no-store headers, and fail on route/method/CORS/body/client-auth/limiter drift after any SDK upgrade.

Implement `OAuthServerProvider.authorize` as a pending-owner request, not a public consent decision. Mount project-owned status/continue routes before the SDK router. The public waiting page polls status every 2.5 seconds with a random cookie binding; approval, denial, and expiry each produce one linearized terminal state, and only the one-use continue route can deliver the exact callback redirect. The provider adds RFC 9207 `iss` to every success/error callback. Until A5 supplies the complete token/grant service, explicit stub handlers make `/token` and `/revoke` safely unavailable.

Do not add a production test-client redirect. Synthetic/Inspector tests inject a predefined client through an explicit test adapter.

### Narrow verification

```powershell
npm run test:focused -- test/phase-8-dcr.test.mjs test/phase-8-authorization.test.mjs test/phase-8-owner-approval.test.mjs test/phase-8-oauth-bounds.test.mjs test/phase-8-auth-audit.test.mjs test/phase-8-listener-separation.test.mjs test/streaming-redaction.test.mjs test/approval-display-safety.test.mjs
npm run build
npm run policy:check
git diff --check
```

Run affected suites/build on managed Node 20/24.

### User checkpoint

Using only a synthetic client and disposable state:

1. fetch both metadata documents;
2. register an exact ChatGPT-shaped client;
3. start authorization with PKCE/resource/scopes;
4. observe the public waiting page;
5. approve locally;
6. receive one code and prove second use fails.

No real ChatGPT app, stable public tunnel, or production token is used yet.

### Exit

DCR and local owner authorization are complete and bounded; this is the completed Task 8A4 checkpoint.

## 9. Task 8A5 — Signed access tokens, rotating refresh tokens, and resource middleware

### Goal

Finish a runnable read-only OAuth vertical slice: code exchange, refresh/restart/replay/revoke, per-request bearer verification, and one authenticated MCP read.

### Add

- `src/auth/tokenService.ts`
- `src/auth/grantStore.ts`
- `src/auth/requestContext.ts`
- `src/auth/resourceMiddleware.ts`
- `src/auth/challenges.ts`
- `test/phase-8-token-exchange.test.mjs`
- `test/phase-8-token-validation.test.mjs`
- `test/phase-8-refresh-revoke.test.mjs`
- `test/phase-8-request-context.test.mjs`
- `test/phase-8-mcp-auth-integration.test.mjs`

### Modify

- `src/auth/oauthProvider.ts`
- `src/http/publicApp.ts`
- `src/http.ts`
- MCP transport registry/session record types;
- auth state schemas/store;
- audit schemas/runtime;
- redaction and HTTP error paths.

### RED tests

#### Code exchange

- routes are exactly `POST /token` and `POST /revoke`; `/oauth/token`, `/oauth/revoke`, alternate methods, and alternate content types do not exist;
- exact client, redirect, one-use authorization code/grant intent, 43–128-character RFC 7636 unreserved PKCE verifier, and resource required; token-endpoint `state` is unsupported because state is validated by the client on the authorization redirect;
- missing/malformed/duplicate/wrong resource is `invalid_target` (early duplicate may be `invalid_request`), bad/expired/used code or verifier/redirect mismatch is `invalid_grant`, unknown scope is `invalid_scope`, bad client is non-oracular `invalid_client`, and malformed/duplicate standard form input is `invalid_request`;
- bounded unknown extension parameters are ignored without log/store/echo; understood forbidden client-auth inputs are rejected;
- double code exchange and crash injection before code consume, grant/family persist, audit commit, and response publication yield at most one success and never two families or an unlistable active orphan;
- response contains ES256 access token, opaque refresh token, exact scope/type/expiry, and no-store headers;
- no client secret or Basic client authentication is accepted or returned;
- success, invalid-client, invalid-grant, rate, method, parse, and unexpected-error responses retain exact cache/security headers.

#### Access token

- only `alg=ES256`, `typ=at+jwt`, active/retained `kid`, exact issuer/audience/resource/subject/client/grant/revision/scope/time/jti accepted;
- wrong algorithm/signature/key/issuer/audience/resource/client/grant/revision, malformed scope, missing claim, future `nbf`, stale `iat`, expired token, revoked family, or corrupt state rejected;
- every POST/GET/DELETE `/mcp` request verifies Bearer header;
- query/body/cookie tokens always rejected;
- missing-token 401 discovery challenge omits `error`; malformed/expired/wrong/revoked token uses `invalid_token`; insufficient scope uses 403 and the minimum scope;
- an otherwise valid stolen Bearer can be replayed until expiry/revocation; tests and docs never claim DPoP/mTLS replay prevention;
- challenge serialization, header bytes, fixed-seed malformed JWTs, Unicode/control input, and exact size boundaries are deterministic and safe.
- oversized/structurally invalid Bearer fails before crypto; ES256 concurrency/queue, failed-new-token bucket, positive/negative fingerprint caches, and reserved established-token capacity match the design ceilings;
- randomized invalid-Bearer flood leaves memory, CPU queue, and durable audit growth bounded while a previously verified legitimate transport still receives reserved service; responses disclose no token/client/grant existence.

#### Refresh and revoke

- refresh rotates once and returns no reusable old token;
- refresh, replay, expiry, public/local/client/owner revoke, and scope revision share the fixed deployment-mutation-gate → sorted-family-lock → authoritative-reread/CAS order;
- every refresh request requires one exact resource; missing/wrong/duplicate resource fails before the SDK provider, despite the SDK schema making it optional;
- refresh scope omitted/empty means unchanged; exact-equal after normalization is accepted; subset/superset/unknown/duplicate scope fails `invalid_scope` and never revises the grant;
- the refresh value is an authenticated opaque version/family-handle/generation/nonce envelope; state stores only the current keyed hash/current generation and never plaintext token values;
- routine refresh increments `refresh_generation` only and leaves `grant_rev`, owner, scopes, approvals, workspaces, change sets, worktrees, and sessions stable;
- replay of a consumed token revokes the family;
- every authenticated old generation, including after more than 1,024 legal rotations, locates and revokes the current family without a tombstone list;
- idle/absolute expiry boundaries exact;
- refresh never widens scope or changes owner/client/resource;
- public revoke is non-oracular and changes state only for a token bound to the presented public `client_id`;
- local grant/owner-wide revoke is durable before success and rejects the next access call;
- refresh-vs-revoke, double refresh, replay-vs-refresh, and owner-wide-vs-family races are linearizable; after revoke reports success, no older transaction can issue or accept another token;
- every code/grant/refresh/revoke security transition commits the installation-wide audit event before success; audit failure blocks issuance/mutation, while hostile invalid requests use bounded aggregation;
- restart reloads active state and supports the new refresh token.
- the startup-selected DPAPI/state authority is pinned for the lifecycle; provider failure never falls back to stale alternate state.
- a durably committed refresh whose response is dropped causes the old-token retry to deterministically revoke/relink, never return a random 500 or retain a plaintext successor.

#### Request context and MCP

- concurrent identities cannot bleed;
- missing AsyncLocalStorage identity fails closed;
- session binds owner/client/resource/binding/incarnation and permits same-family token rotation only within the current incarnation;
- cross-owner/client/resource/profile token cannot reuse a session and reveals no session fact;
- initialize plus one read-only tool succeeds with a valid token;
- an initialization token is never reused as later request identity.

### Implementation

Use direct exact `jose` APIs for P-256 key generation/import, ES256 signing, and strict verification. Access TTL is ten minutes with bounded skew.

Generate an opaque authenticated refresh envelope with a random family handle and 256-bit nonce; protect version/handle/generation/nonce with a `refresh-envelope-v1` derived HMAC key. Persist only a `refresh-store-v1` keyed current-token hash and current generation; the two domain-separated keys are never reused. Maintain separate `refresh_generation` and security `grant_rev`, 90-day idle expiry, and 365-day absolute expiry. Route every family mutation through one coordinator with fixed deployment gate then sorted family locks, perform an authoritative reread plus revision/generation compare, persist state and the MAC-chained audit event, and only then construct a response. An authenticated older generation revokes the family, so no finite tombstone list forces periodic relink. Routine rotation changes only generation; replay/revoke/scope revision changes grant revision/status. Code exchange uses the same crash-safe deployment mutation boundary for code consumption + grant/family + audit. Pin the concrete credential/state provider at startup and fail closed instead of re-evaluating an automatic fallback during refresh or recovery.

Before crypto, apply the frozen cheap Bearer shape/size parser. Implement bounded ES256 work admission, keyed positive/negative fingerprints, and reserved capacity exactly as designed; a positive cache hit still rechecks time, incarnation, grant status/revision, client/resource, and transport binding. Invalid unauthenticated events feed only the bounded installation-audit aggregation path.

Wrap each `transport.handleRequest` call in an AsyncLocalStorage context created from the verified request. Store only stable binding references in the transport record.

Mount `/mcp` only after metadata, state, provider, middleware, and local control are ready. Startup is all-or-nothing.

### Narrow verification

```powershell
npm run test:focused -- test/phase-8-token-exchange.test.mjs test/phase-8-token-validation.test.mjs test/phase-8-refresh-revoke.test.mjs test/phase-8-request-context.test.mjs test/phase-8-mcp-auth-integration.test.mjs test/phase-8-auth-audit.test.mjs test/phase-7-http-reconnect-preview.test.mjs test/streaming-redaction.test.mjs test/approval-display-safety.test.mjs
npm run build
npm run policy:check
git diff --check
```

Run affected suites/build on managed Node 20/24.

### Runnable vertical-slice checkpoint

With disposable state and a synthetic client:

1. DCR;
2. authorize;
3. local approve;
4. exchange;
5. initialize MCP;
6. call one read-only tool;
7. refresh after simulated restart;
8. revoke;
9. prove next call is 401.

Record exact request/response shapes with all credentials redacted.

### Exit

The end-to-end read-only OAuth path is runnable, durable, revocable, and request-bound; higher policy/tool scope integration remains closed; Task 8A6 is the only next action.

## 10. Task 8A6 — OAuth identity, policy scope intersection, owner stability, and tool metadata

### Goal

Route all inherited tools through request-local OAuth identity and exact coarse-scope challenges without changing tool counts or existing local authority.

### Add

- `src/auth/policyIdentity.ts`
- `src/auth/toolSecurity.ts`
- `test/phase-8-policy-identity.test.mjs`
- `test/phase-8-scope-enforcement.test.mjs`
- `test/phase-8-tool-security-metadata.test.mjs`
- `test/phase-8-owner-binding.test.mjs`

### Modify

- `src/policy/identity.ts`
- `src/policy/types.ts`
- `src/policy/schemas.ts`
- `src/policy/runtime.ts`
- `src/policy/context.ts`
- `src/policy/authorizationFacts.ts`;
- `src/policy/approval.ts` and evaluator only where credential revision must bind;
- `src/changesets/undo.ts`;
- V4 Git/worktree owner binding;
- `src/server.ts`;
- production runtime wiring;
- inherited contract/approval/audit tests.

### RED tests

Assert:

- OAuth identity contains stable subject/owner, grant credential reference/revision, token ID, hashed client reference, mapped scopes, and strong assurance;
- raw token/client metadata never enters identity or policy/audit facts;
- policy source obtains current request identity, not session initialization identity;
- effective scopes equal token mapping intersect deployment/configuration scopes before profile/hard-policy/approval evaluation;
- V3/V4 scope appends cannot bypass a missing OAuth scope;
- after a normal profile change and exact-root OAuth server restart, configuration reduction takes effect on the next request without widening any token or producing a reauthorization loop;
- after a normal profile change and restart that preserves issuer/binding, configuration expansion requires a new local owner approval and succeeds with the same DCR client under its fixed known-scope protocol ceiling; the old token never expands;
- read/write/execute tools advertise minimum exact OAuth scopes in both metadata locations;
- missing token gives 401 discovery without an OAuth error; invalid token gives 401 `invalid_token`; transport/resource scope failure before tool parsing gives HTTP 403, while per-tool scope failure returns a normal MCP `CallToolResult` with safe `content`, `isError: true`, and `_meta["mcp/www_authenticate"]`;
- step-up challenge scope is the deterministic union of current granted scopes and tool minimum scopes intersected with enabled/client ceilings, so adding execute does not drop read/write;
- a required scope absent from `enabledOAuthScopes` returns normal config/policy denial plus the local enable/profile action and no OAuth challenge;
- an enabled scope absent only from the token returns the step-up OAuth challenge;
- token + deployment scope with missing operation approval uses the existing approval flow and no OAuth challenge;
- pure scope change requires no **Scan Tools**; only descriptor/visibility change gives the existing refresh/recreate instruction;
- challenge serialization resists injection and leaks no internals;
- subject-stable ownership survives access/refresh/signing-key rotation;
- grant revoke/scope revision stales approvals and credential-bound facts;
- cross-subject access to change sets, worktrees, Git facts, or workspace session fails closed;
- legacy and OAuth owner domains never inherit each other's workspace/approval/change-set/worktree/process/Git artifacts; switching back restores only the still-valid artifacts originally owned by that mode;
- legacy/local/STDIO identity behavior remains exact;
- V1/V2/V3/V4/V5 names/order/counts and non-auth schemas remain exact.

### Implementation

Introduce a versioned request identity shape rather than mutating V1 ambiguously. Make `PolicySessionContextSource` expose the current request identity through a fail-closed accessor.

Centralize:

```ts
oauthScopesForDeployment(config)
knownOAuthScopes()
internalScopesForOAuth(scopes)
effectivePolicyScopes(config, identity)
oauthScopesForTool(toolName)
```

Correct owner binding so an OAuth subject is the stable OAuth owner seed; credential references/revisions remain revocation and approval-staleness facts, not owner identity. Preserve legacy ownership unchanged and make mode crossing an explicit domain boundary rather than an identity migration. Centralize the three-way tool decision—deployment disabled, token missing, operation approval missing—before constructing any challenge so a disabled capability can never trigger an unsatisfiable reconnect loop.

In OAuth mode, `registerToolCompat` emits exact `oauth2` schemes. In legacy mode it preserves exact existing descriptors. One canonical challenge builder serves HTTP and tool-level errors.

### Narrow verification

```powershell
npm run test:focused -- test/phase-8-policy-identity.test.mjs test/phase-8-scope-enforcement.test.mjs test/phase-8-tool-security-metadata.test.mjs test/phase-8-owner-binding.test.mjs test/policy-identity-context.test.mjs test/policy-evaluator.test.mjs test/policy-approval.test.mjs test/undo-change-set.test.mjs test/phase-5-v4-inherited-contract.test.mjs test/phase-7-v5-runtime-inheritance.test.mjs
npm run build
npm run policy:check
git diff --check
```

Run affected suites/build on managed Node 20/24.

### Exit

All enabled tools have correct OAuth/policy behavior, owner identity is refresh-stable and revoke-sensitive, exact inherited contracts pass, and Task 8A7 is the only next action.

## 11. Task 8A7 — One-command setup, local operations, and tunnel verification

### Goal

Turn the protocol into a low-friction supported product path.

### Add

- `scripts/oauth-admin.mjs`
- `src/auth/localAdminSession.ts`
- `test/phase-8-auth-cli.test.mjs`
- `test/phase-8-auth-doctor.test.mjs`
- `test/phase-8-cloudflare-config.test.mjs`
- `test/phase-8-auth-ui.test.mjs`
- `test/phase-8-local-admin-session.test.mjs`

### Modify

- `scripts/codexgpt-entry.mjs`
- `scripts/codexgpt.mjs`
- `scripts/doctor.mjs`
- `src/http/localAdminApp.ts`
- setup/status page assets embedded in current source;
- Cloudflare named-tunnel configuration/validation helpers;
- public help and package tests.

### CLI contract

```text
codexgpt auth setup --hostname <host> [--tunnel-name <name>]
                    --root <canonical-path>
                    [--provision-tunnel | --no-tunnel-changes] [--no-start]
codexgpt auth status --root <canonical-path> [--json]
codexgpt auth pending --root <canonical-path>
codexgpt auth open --root <canonical-path>
codexgpt auth approve <correlation-code> --root <canonical-path>
codexgpt auth deny <correlation-code> --root <canonical-path>
codexgpt auth clients --root <canonical-path>
codexgpt auth client remove <safe-client-id> --root <canonical-path>
codexgpt auth prune --unapproved --root <canonical-path>
codexgpt auth revoke <grant-id> --root <canonical-path>
codexgpt auth revoke --all --root <canonical-path> [--confirm-revoke-all]
codexgpt auth rotate-signing-key --root <canonical-path> [--revoke-all]
codexgpt auth rollback --root <canonical-path>
codexgpt auth recover inspect --root <canonical-path>
codexgpt auth recover restore <backup-id> --root <canonical-path> [--confirm-forced-relink]
codexgpt auth recover unlock <exact-owner-id> --root <canonical-path> [--confirm-dead-owner]
codexgpt auth reinitialize --revoke-all --root <canonical-path> [--confirm-reinitialize]
codexgpt auth rebind --from-root <old> --root <new> --hostname <host> --revoke-all
```

Published global-install setup:

```powershell
codexgpt auth setup --root D:\Dev\target-repo --hostname mcp.example.com --tunnel-name codexgpt-oauth
```

Unpublished source-checkout setup:

```powershell
node D:\Dev\codexpro\scripts\codexgpt-entry.mjs auth setup --root D:\Dev\target-repo --hostname mcp.example.com --tunnel-name codexgpt-oauth
```

`auth setup` defaults to existing saved dedicated-tunnel values and asks only for facts that cannot be inferred. `--root` can be omitted only when cwd has one exact matching saved profile. With an owner-marked dedicated tunnel it is zero-prompt. On a cold start it previews the exact Cloudflare login/tunnel/DNS/ingress plan and asks once before external mutation. `--no-tunnel-changes` is deterministic and prints exact remaining commands; noninteractive creation requires explicit `--provision-tunnel` and pre-existing valid Cloudflare login material. It journals `preflight -> candidate-local-state -> login-required -> tunnel-created -> dns-routed -> ingress-written -> candidate-listener-started -> external-probe -> mode-committed -> foreground-running|configured-no-start` and resumes idempotently. All local/DPAPI/lock/port/cloudflared checks and candidate state precede external mutation. The real public metadata/Host/resource probe runs only against the exact candidate listener/tunnel; profile mode commits afterward. Failure stops the exact candidate, preserves the journal, and leaves profile mode unchanged. Interactive success keeps the verified candidate as the foreground server; `--no-start` and noninteractive success stop it and print the exact source/global start command.

After `auth rollback`, returning to OAuth uses the same idempotent command with only `--root`; saved hostname/tunnel are inferred:

```powershell
codexgpt auth setup --root D:\Dev\target-repo
node D:\Dev\codexpro\scripts\codexgpt-entry.mjs auth setup --root D:\Dev\target-repo
```

It reruns preflight/candidate/public probe and commits OAuth only on success. This is the only supported resume path; direct profile editing is not documented as recovery.

### RED tests

Assert:

- public entry routes every auth command without bypassing its protections;
- source-checkout setup executed from `D:\Dev\codexpro` for another explicit root creates/reads state only for the target root;
- setup succeeds from a valid saved owner-marked dedicated-tunnel profile with no redundant prompts;
- cold-start setup uses the same entry command, requires one explicit external-change confirmation, survives the browser login handoff, and resumes each journal phase without duplicate tunnel/DNS/key/state creation;
- failure injection after every journal phase proves no legacy listener is probed, no candidate survives unexpectedly, and `authMode` remains unchanged until the real external probe passes;
- `--no-tunnel-changes` and noninteractive modes never mutate Cloudflare implicitly;
- missing noninteractive Cloudflare login returns `AUTH_TUNNEL_LOGIN_REQUIRED` plus the same resume command;
- quick tunnel, missing hostname/tunnel, mismatched profile/issuer/root, hostname already bound to another root, public bind, same admin/public port, unverified cloudflared, or ingress to admin port fails early with one exact next command;
- an unowned/shared tunnel, DNS conflict, name conflict, or ingress containing another service remains byte-identical and setup recommends a new dedicated tunnel name;
- setup never modifies DNS/tunnel unless the exact dedicated stable binding is owned or one explicitly confirmed creation command does so;
- interactive success starts exactly one foreground instance; `--no-start`/noninteractive never starts and prints one exact command;
- successful output/copy uses only token-free Server URL;
- status/JSON is safe and stable;
- `auth open` gets one bootstrap fragment over current-user local control and opens the browser; local bootstrap/cookie/CSRF/CSP/Origin/Host/expiry contracts are exact;
- approve/deny/client-remove/prune/revoke/rotate/recovery/rebind require current-user local control;
- client removal revokes its grants, remains distinct from grant revoke, and no active client is evicted automatically;
- backup restore preserves the stable binding/tunnel but creates a new incarnation/key/pepper/epoch with inactive grants, atomically updates registry state, and cannot revive any old access/refresh token;
- stale unlock requires exact dead-owner evidence and offline operations refuse a live server;
- noninteractive commands are deterministic;
- TTY shows pending indicator and opens the local approval page without auto-approving;
- local page uses progressive disclosure and one clear primary action;
- doctor distinguishes ready/warning/blocker and tests metadata/state/listener/tunnel without printing secrets;
- rollback resolves the winning config origin; an environment override returns `AUTH_MODE_ENV_OVERRIDE` plus the exact PowerShell repair command rather than claiming success;
- foreground rollback prints the exact stop/start action; if a separately authorized service package later exists, service-mode rollback requires one exact-root restart. ChatGPT uses the separately retained Legacy App, while idempotent `auth setup --root` plus the retained OAuth App returns to OAuth;
- legacy/OAuth artifacts remain separate owner domains and are preserved across switching;
- destructive TTY operations show exact effects and require confirmation; noninteractive execution requires the dedicated confirmation flag;
- normal key rotation and suspected compromise are distinct: compromise uses explicit rotate + revoke-all;
- legacy secret URL display remains explicit/warned only in legacy mode;
- help/docs never tell ChatGPT users to configure a static Bearer token.

### Implementation

Route `auth` before the general connector path in `scripts/codexgpt-entry.mjs`. Keep the supported public-entry invariant.

Extend the current interactive key loop with a non-secret pending-link indicator and an action that opens local approvals. Add the loopback browser session here: random fragment bootstrap delivered over local control, one-use exchange, exact Host/Origin/CSRF, bounded cookie, frozen CSP/no-referrer/no-store headers, and no public route. Do not add a one-key blind approval.

Generate/validate exact Cloudflare ingress:

```yaml
ingress:
  - hostname: <exact-host>
    service: http://127.0.0.1:<public-port>
  - service: http_status:404
```

Preserve the current pinned managed binary and explicit manual override contract. Reuse only an exact owner-marked dedicated tunnel. Never merge or rewrite a shared/unowned ingress in Core. Otherwise, only after explicit interactive confirmation or valid noninteractive `--provision-tunnel`, run the bounded managed-binary login/create/route/config workflow and resume setup after browser authentication. Record safe tunnel/hostname ownership and exact manual cleanup guidance, but never delete Cloudflare state during `auth rollback`. Prove the local-admin port is absent.

### Narrow verification

```powershell
npm run test:focused -- test/phase-8-auth-cli.test.mjs test/phase-8-auth-doctor.test.mjs test/phase-8-cloudflare-config.test.mjs test/phase-8-auth-ui.test.mjs test/phase-8-local-admin-session.test.mjs test/public-cli-help.test.mjs test/cli-hostname-propagation.test.mjs test/cloudflared-installer.test.mjs
npm run build
npm run policy:check
git diff --check
```

Run affected suites/build on managed Node 20/24.

### User checkpoint

From disposable local state and a fake tunnel validator:

1. run setup with explicit root/hostname/tunnel name and observe the interactive foreground start;
2. open local admin with `auth open`;
3. approve a synthetic pending link;
4. inspect safe status and clients;
5. revoke and prune;
6. stop, rollback, and use the retained Legacy App contract;
7. prove OAuth state remains intact and legacy is not active until restart;
8. rerun the exact idempotent published/source `auth setup --root` command, infer the saved hostname/tunnel, and verify the retained OAuth App contract;
9. restore a pre-revoke backup, prove the binding/owned tunnel remains usable with a new incarnation and no remote Cloudflare mutation, and prove every old access/refresh token still fails until relink.

### Exit

The supported CLI/local UI journey is complete and actionable; Task 8A8 migration/documentation/package integration is now complete locally.

## 12. Task 8A8 — Migration, documentation, package, and complete integration

### Goal

Integrate the complete Core surface, document truthful setup/rollback, and prove legacy/package boundaries before adversarial review.

### Add

- `test/phase-8-plan-command-contract.test.mjs`

### Modify

- `README.md`
- `README_ZH.md`
- `SECURITY.md`
- `CLOUDFLARED_VERIFIED_INSTALL.md`
- `design.md`
- `AGENTS.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `Memory.md`
- active `docs/memory/archive/phase-8*.md`;
- package/repository-policy/CI classifiers and tests as required.

### Required documentation

- one-entry-command stable OAuth setup for both published global install and unpublished source checkout, always binding the exact target `--root`;
- dedicated owner-marked tunnel reuse, resumable setup journal, candidate external probe, and explicitly confirmed cold-start path;
- exact token-free ChatGPT Server URL;
- first local approval;
- normal restart;
- status/client cleanup/revoke/rotate/recovery/relink;
- explicit two-App legacy rollback and URL-secret warning; service restart is not described as automatic ChatGPT client rollback;
- exact idempotent `auth setup --root` return-to-OAuth command using the retained OAuth App;
- profile capability changes require an exact-root restart before step-up/reduction; scope-only change does not request Scan Tools;
- environment-override recovery and foreground versus future service restart instructions;
- backup restore/reinitialize preserve the binding/tunnel, rotate incarnation authority, force relink, and never revive old grants;
- stable named-tunnel requirement and quick-tunnel limitation;
- separate public/local ports;
- exact self-hosted/single-owner/no-OS-isolation limits;
- DPAPI CurrentUser behavior and same-user threat boundary;
- no static-Bearer claim for ChatGPT;
- no Cloudflare Access/mTLS claim;
- current Developer mode/App creation/Scan Tools path;
- required static resource-documentation page, RFC 9207 issuer binding, endpoint error matrix, unknown-extension behavior, and public-work ceilings;
- troubleshooting by stable error code and next command.

### Integration tests

Add one complete synthetic journey that:

1. creates disposable protected-state fixtures;
2. starts both listeners on reserved loopback ports;
3. fetches metadata;
4. proves the root route inventory and performs DCR at `/register`;
5. proves read-only metadata requests only read while DCR retains the fixed known-scope protocol ceiling, then performs authorization + local approval + PKCE exchange;
6. initializes MCP;
7. calls read, write, and enabled execute surfaces with exact scopes and existing approvals;
8. refreshes after restart and proves an old generation after more than 1,024 rotations still revokes the current family without a periodic cap relink;
9. revokes and proves immediate failure;
10. relinks;
11. switches profile to legacy, uses the retained Legacy App contract, and proves no dual acceptance/cross-mode artifact inheritance;
12. returns with the exact idempotent `auth setup --root` command and the retained OAuth App;
13. restores a pre-revoke backup, atomically publishes a new incarnation under the same binding/owned tunnel, and proves every old token remains invalid until relink;
14. drives approve/deny/expire/continue races and exact RFC 9207/error callbacks;
15. floods invalid Bearer/polling paths and proves bounded queues, reserved established-user capacity, and aggregated audit;
16. checks every captured output for secret material.

Add documentation/contract tests for URLs, route inventory, security schemes, errors, counts, package contents, and rollback wording.

`phase-8-plan-command-contract` parses this plan's fenced verification commands and fails if an inherited test path does not exist, a planned new test was not declared by its task, a shell glob is used for Phase 8 tests, or any managed-toolchain status/exec/matrix command omits the explicit retained `CodexPro\toolchains` root. This prevents the implementation runbook from drifting into commands that fail before testing code.

Legacy static credentials remain available for at least one completed compatibility cycle. A later, separately authorized retirement step may add `auth legacy status`, migration warnings, and explicit owner-confirmed deletion only after OAuth and rollback evidence pass. Phase 8 Core never auto-deletes or silently migrates the old token.

### Verification

```powershell
$phase8ToolchainRoot = Join-Path $env:LOCALAPPDATA 'CodexPro\toolchains'
$phase8TestFiles = @(rg --files test -g 'phase-8-*.test.mjs' | Sort-Object)
if ($phase8TestFiles.Count -eq 0) { throw 'No Phase 8 tests found.' }
npm run test:focused -- @phase8TestFiles
node scripts/toolchain-manager.mjs exec --major 20 --root $phase8ToolchainRoot -- npm run test:focused -- @phase8TestFiles
node scripts/toolchain-manager.mjs exec --major 24 --root $phase8ToolchainRoot -- npm run test:focused -- @phase8TestFiles
npm run build
node scripts/toolchain-manager.mjs exec --major 20 --root $phase8ToolchainRoot -- npm run build
node scripts/toolchain-manager.mjs exec --major 24 --root $phase8ToolchainRoot -- npm run build
node scripts/long-task-runner.mjs list
node scripts/long-task-runner.mjs start --kind phase8-a8-ordinary -- node scripts/toolchain-manager.mjs matrix --major all --root $phase8ToolchainRoot -- node scripts/test-domains.mjs run --domain ordinary
node scripts/long-task-runner.mjs status --run <exact-ordinary-run-id>
# Only after the ordinary run is terminal:
node scripts/long-task-runner.mjs start --kind phase8-a8-smoke -- node scripts/toolchain-manager.mjs matrix --major all --root $phase8ToolchainRoot -- npm run smoke
node scripts/long-task-runner.mjs status --run <exact-smoke-run-id>
npm run policy:check
npm pack --dry-run --json
git diff --check
```

Reuse the same verified non-empty `$phase8TestFiles` array when invoking managed Node 20 and 24; never depend on PowerShell or Node shell-glob expansion. Do not start Smoke until the exact ordinary run is terminal, and do not infer terminal status from connector timeout. These pre-review runs do not constitute closure.

### Outcome

Completed locally on 2026-07-26 without Cloudflare/DNS/Tunnel mutation, real ChatGPT linking, credential migration, publication, release, staging, commit, or push. The English and Chinese onboarding, security model, verified Cloudflared guide, design boundary, package inventory, public resource-documentation page, full synthetic OAuth/MCP operator journey, more-than-1,024 refresh-rotation regression, and portable verification-command contract are implemented. Managed Windows Node 20.20.2 and Node 24.15.0 each pass the 150-test Phase 8 set and build; detached ordinary and Smoke matrices are recorded separately as pre-review evidence.

### Exit

The full local runtime exists, is documented/package-safe, and passes its pre-review integration suites. At the Task 8A8 checkpoint, Task 8A9 was the only next action.

## 13. Task 8A9 — Completed-runtime adversarial repair

### Goal

Review the completed implementation, not a proposal, and repair every accepted finding with a permanent regression.

### Required parallel reviews

#### Execution and correctness

Attack:

- exact SDK router/provider behavior and route mount order;
- project-owned metadata/DCR shadowing, root-only endpoint inventory, and absence of client-secret/CIMD claims;
- authorization/code/refresh/revoke state machines;
- crash/restart windows and atomic transitions;
- clock/skew/expiry boundaries;
- concurrency and AsyncLocalStorage propagation;
- HTTP session/token rotation binding;
- CLI, local UI, tunnel, doctor, package, and rollback journeys;
- Node 20/24 and Windows-specific process/helper behavior.

#### Security and compatibility

Attack:

- redirect, issuer, resource, audience, Host, Origin, CSRF, PKCE, state, code, JWT, `kid`, algorithm, scope, and refresh replay validation;
- DCR abuse, rate/cap exhaustion, parameter pollution, open redirect, header injection, request smuggling assumptions, query/cookie token paths, and forwarded-header trust;
- public OAuth CORS versus local-admin same-origin separation;
- DPAPI protocol, argv/env/log/temp leakage, ACL/state corruption, lock recovery, mutation inventory, audit/redaction, and package leaks;
- scope union bypass, owner drift, stale approvals, cross-session/client/profile access;
- exact legacy/STDIO and V1–V5 compatibility.

#### UX and operability

Attack:

- first setup from no OAuth knowledge;
- cold start with no saved tunnel, browser login continuation, explicit external-change preview, and deterministic no-mutation mode;
- missing stable tunnel/hostname/DPAPI/local control;
- first approval, mobile browser with PC approval, denial, timeout, restart, stale app metadata, scope expansion, refresh replay, revoke, relink, and rollback;
- error wording and next actions;
- number of prompts/commands/copies;
- secret exposure in the visible UI;
- whether normal coding really takes one link and no repeated ceremony.

### Repair rule

For every accepted finding:

1. identify the violated invariant and root cause;
2. add or strengthen a regression that fails before the repair;
3. implement the smallest complete repair;
4. rerun the narrow, inherited, managed-major, policy, package, and relevant live fixture;
5. record finding, decision, changed files, exact verification, risk, and rollback in the Phase 8 archive.

Do not dismiss a finding because a happy-path live check passed. Do not broaden DCR, disable a check, weaken DPAPI, hide an error, or relax legacy fingerprints to make a test green.

### Exit

At the Task 8A9 checkpoint, all accepted findings were repaired or explicitly blocked with evidence and the three review passes were rerun; Gate G8-U was then the only next action.

Completed locally on 2026-07-26. Regressions now cover DCR inherited-property injection, exact existing-transport/fingerprint admission for the reserved ES256 lane, duplicate MCP session and Host headers, canonical Origin enforcement, duplicate local-admin cookies, and recoverable local-admin session-capacity handling. Current and managed Node 20.20.2/24.15.0 Phase 8 sets pass 152/152 on each; inherited compatibility passed 70/70; builds, policy, diff, and package dry-run gates passed. The current moderate `@hono/node-server` static-file advisory is documented as non-reachable because no production route imports or mounts its `serve-static` subpath. No external or publication action was performed.

## 14. Gate G8-U — Live ChatGPT acceptance

Real credentials/tunnel/app operations require explicit live-gate authorization. This is the first gate that can truthfully test current ChatGPT behavior because Tasks 8A4–8A5 and the local closure gates must first provide a runnable, contract-tested OAuth endpoint.

### Preflight U0 — Compatibility assumptions

Before the broader journeys, use the disposable OAuth App to verify all assumptions that G8-0 could only freeze from standards, SDK source, and current documentation:

1. ChatGPT performs the expected constrained DCR flow against `/register`.
2. Authorization success and error callbacks accept the exact RFC 9207 `iss` parameter.
3. The waiting page, host-only binding cookie, status polling, and one-use continue redirect survive the actual ChatGPT browser/navigation path.
4. The exact production redirect URI is accepted without broadening the redirect allowlist.

Any incompatibility blocks G8-U and Phase 8 closure. Return to the paired design and tests; do not remove issuer binding, widen DCR, weaken cookie binding, or add a legacy credential path to force acceptance.

### Journey U1 — Fresh token-free link

1. Retain the current Legacy App and create a separate disposable/new OAuth App on a stable named hostname.
2. Run the exact published-install or source-checkout setup command with the target `--root`, from either an owned dedicated tunnel or a disposable cold-start tunnel flow, and record the explicit Cloudflare confirmation.
3. Paste only `https://<host>/mcp`.
4. Confirm ChatGPT discovers OAuth/DCR through the exact root endpoints without a URL token or static Bearer instruction.
5. Confirm the public page waits and the PC shows one local approval.
6. Approve once.
7. Confirm initialization and a natural read/write coding request succeed.

### Journey U2 — Scope behavior

1. Start read-only and confirm both metadata documents/challenge advertise only read while DCR returns the fixed known-scope protocol ceiling.
2. Confirm disabled capabilities remain unavailable despite token contents.
3. Enable one additional capability through the normal profile path.
4. Restart the foreground OAuth service with the exact `start --root` command without changing issuer/binding, then confirm the old token still cannot use the new capability.
5. Confirm the same DCR client shows one understandable reauthorization and the new grant works after local approval; the App is not recreated.
6. Confirm pure scope change does not request **Scan Tools**; a deliberate descriptor/visibility fixture still does.
7. Reduce the profile capability, restart, and confirm the next call is a normal config/policy denial with no privilege increase and no OAuth reconnect loop.

Journey U2 accepted through the real `codexgpt-Windows` App at STEP-458: read-only linking, same-client `read→read+write` step-up, real bounded write, reduction denial without reconnect, and deliberate `full→minimal→full` descriptor refresh all passed. The standard-guidance `workspace_snapshot` defect exposed during restoration was repaired with a permanent regression. No App recreation or OAuth identity change occurred.

### Journey U3 — Restart and refresh

1. Restart CodexGPT without changing hostname/profile.
2. Confirm ChatGPT resumes without local approval.
3. Confirm token rotation does not change workspace/change-set/worktree owner binding.
4. Change only the local-admin port, restart, and confirm the existing grant/refresh remains valid.
5. Inject one dropped successful refresh response and confirm the deterministic outcome is revoke/relink, not 500/stall.

STEP-460 passed the live runtime/protocol portions: exact same-profile restart, refresh-stable subject/client/grant ownership, same-session workspace reuse after rotation, local-admin `8790→8791→8790` with unchanged binding/incarnation and existing grants, and dropped-response retry yielding `400 invalid_grant` plus `revoked/replay`.

Journey U3 accepted through the real `codexgpt-Windows` App at STEP-461: the existing App resumed after same-profile restart, read live `package.json` data, and owner status remained at zero pending authorization. STEP-460 separately proved refresh-stable owner binding, same-session workspace continuity, local-admin-only port migration, and deterministic `invalid_grant`/relink behavior after a dropped successful refresh response.

### Journey U4 — Revoke and relink

1. Revoke the current grant locally.
2. Confirm the next call fails immediately and triggers a safe relink path.
3. Confirm relink requires local approval and restores service.
4. Confirm old access and refresh tokens remain unusable.

Journey U4 accepted through the real `codexgpt-Windows` App at STEP-462. The current read/write grant was revoked through the supported owner CLI; the next real App call could not continue with the old authority and entered the local-approval relink flow. A newly approved read-only grant restored service through a real `open_current_workspace` call, while the old grant remained durably `revoked/local`. One overlapping retry left a stale same-client pending request; it conferred no authority and was explicitly denied, leaving zero pending authorizations. Focused revoke/authorization/MCP/owner-binding regressions passed `25/25`.

### Journey U5 — Negative and recovery

- deny and expire a link;
- prove denial and expiry each traverse the cookie-bound one-use continue path with original state/exact issuer, while double/cross-cookie/late continue remains non-oracular;
- simulate wrong issuer/audience/resource/scope/signature/key/time;
- attempt query credential in OAuth mode;
- present refresh replay;
- attempt a non-ChatGPT DCR redirect;
- replay an otherwise valid copied Bearer before expiry and record the truthful limitation, then revoke and prove the next replay fails;
- stop local control or corrupt disposable state;
- restore a verified backup taken before a revoke and prove the old access/refresh authority is not revived;
- prove the restored incarnation starts on the same binding/hostname/owned tunnel without remote Cloudflare mutation or duplicate registry binding;
- flood malformed/invalid Bearers and polling while proving bounded queues/memory/audit and reserved service for an established legitimate transport;
- test current-process and persisted-user auth-mode environment overrides;
- verify exact safe error and next action for each.

Journey U5 accepted at STEP-463. The live deployment rejected a non-ChatGPT DCR redirect, query credentials, tampered signatures, refresh replay, double/cross-cookie continue, and malformed-token/polling floods while an established legitimate MCP transport remained served. A copied Bearer was truthfully accepted twice before expiry because Core has no sender constraint; local revoke then rejected it. Current-process and persisted-user auth-mode overrides returned exact repair commands. Controlled-clock/private-key regressions covered expiry plus wrong issuer/audience/resource/scope/key/time without exporting production secrets. Restoring the latest verified backup created immediately before local grant revoke was accepted only as a security reset: the stable binding, hostname, issuer/resource, ports, and owned Tunnel remained unchanged; the incarnation/key/pepper authority rotated; all prior clients/grants/tokens stayed invalid; and one new disposable client proved the recovered service. The retained ChatGPT OAuth App must relink on its next request.

### Journey U6 — Cached app and rollback

1. Keep the pre-migration Legacy App and use a separate OAuth App with pre-OAuth tool metadata.
2. Confirm setup tells the OAuth App user to Scan Tools or recreate once.
3. Confirm refreshed metadata shows exact OAuth schemes.
4. Run explicit `auth rollback --root D:\Dev\target-repo`, perform the printed foreground stop/start action (or exact-root service restart only if that separately authorized feature exists), and prove only the retained Legacy App works without displaying/deleting credentials or OAuth state.
5. Prove the OAuth App does not silently receive the legacy query-token URL.
6. Return with the exact idempotent published or source command `auth setup --root D:\Dev\target-repo`; prove it infers the saved hostname/tunnel, candidate-probes before commit, then use the retained OAuth App and prove existing valid OAuth state is recoverable while Legacy App calls fail.
7. Confirm owner-bound artifacts from one mode are not inherited by the other and reappear only under their original still-valid identity.

STEP-464 repaired and passed the U6 service/protocol round-trip. The original profile shape stored only one active route, so rollback served Legacy authentication on the OAuth hostname and left the Legacy hostname inactive. The repair persists separate credential-free `authRoutes.legacy` and `authRoutes.oauth` selectors, adds one fail-closed migration for pre-route profiles, switches the full active route on rollback, restores the saved OAuth route through the exact no-argument setup command, and prints the required **Scan Tools** instruction. Live evidence passed credential-safe Legacy MCP initialize/tools (`23` tools, no OAuth metadata), OAuth DCR/PKCE/token/MCP (`26` tools with exact schemes), query-token denial, candidate-probe-before-commit, hostname exclusivity, and unchanged binding/incarnation. STEP-465 accepted the OAuth current-client half after the U5 security reset by recreating the invalidated OAuth App and completing a real read. STEP-466 recorded accidental deletion of the retained Legacy App, making same-App identity continuity irrecoverable. STEP-467 then supplied explicit compensating evidence and closed U6 with that deviation: a recreated Legacy App completed a real read of `D:\Dev\codexpro` / `codexgpt` / `0.28.6` while Legacy was exclusively active; exact no-argument setup restored the saved OAuth route; the Legacy hostname became inactive; and the existing OAuth App reopened the workspace and read `package.json`. Items 4 and 7 are accepted for current rollback compatibility only, not for continuity of the deleted original Legacy App identity; item 6 is fully accepted.

### Journey U7 — Tunnel boundary

- prove Cloudflare ingress reaches only the public loopback port;
- prove an existing shared/unowned tunnel with unrelated ingress stays byte-identical and setup recommends a dedicated tunnel;
- prove the local-admin port is unreachable through the public hostname;
- prove public Host/forwarded-header attempts cannot reach admin;
- record that mTLS/Access are not claimed.

Journey U7 accepted at STEP-468. Existing shared or unowned configs are now validated before setup journal, OAuth state, profile, Tunnel, or DNS mutation; refusal preserves the config byte-for-byte and prints one exact command using a new dedicated tunnel name and unused managed config path. The live owned config remained byte-identical across idempotent no-argument setup and contained only `127.0.0.1:8789` plus the final 404 catch-all, never local-admin `8790`. Public health returned the OAuth resource shape, public requests to local-admin routes returned `404`, direct Host substitution returned `403`, forwarded Host/IP/proto headers remained on the public router, public `:8790` was unreachable, and loopback `127.0.0.1:8790` alone returned the local-admin health shape. Cloudflare Access and end-to-end mTLS remain explicitly unclaimed.

All journeys require user-observable evidence with credentials redacted. Measure the number of user-supplied facts, local approvals, restarts, and recovery commands: existing-tunnel setup asks for no inferable fact, normal restart requires zero approval, and each failure presents one primary next command. `environment-blocked` is not `passed`.

## 15. Gate G8-X — Local closure

### Focused and inherited

- every Phase 8 test;
- legacy auth/query-token/Bearer/Host/Origin/CORS/body/session tests;
- local control/approval/audit/redaction tests;
- policy identity/evaluator/scope/approval/facts tests;
- change-set/undo/Git/worktree owner-binding tests;
- V1–V5 contract/visibility/output fingerprints;
- transaction/atomic state/process lock/recovery/mutation inventory;
- CLI/setup/stable tunnel/doctor/public help/docs;
- package contents and dependency policy;
- build on managed Node 20 and 24.

### Authoritative runs

- prove no same-kind run is active;
- detached ordinary on both managed majors;
- protected Smoke on both managed majors;
- disposable Windows DPAPI live test on both managed majors;
- control tests only in CI or proven independent native terminal;
- no stale/unknown run reclassified as passed;
- bounded evidence only under ignored `.ai-bridge/`.

### Static and integrity

- `npm run policy:check`;
- `git diff --check`;
- Markdown relative-link audit;
- changed-content credential/JWT/OAuth-secret scan;
- production dependency/license/advisory audit;
- exact package pins and lock integrity;
- native API and direct mutation inventories exact;
- package dry-run exact;
- no tests, archives, `.ai-bridge`, auth state, DPAPI blobs, credentials, local registrations, private JWKs, or unmanaged binaries in package;
- `Memory.md` and Phase 8 archive within volume rules;
- only intended files changed.

### Closure result

Record exact commands, counts, skips, run IDs, dependency versions, package sizes, live journey evidence, risks, rollback, and next action. A focused green suite or successful live link is not closure.

## 16. Publication and exact-head closure

Publication requires separate explicit authorization unless explicitly granted at that time.

1. Review complete diff and Git status.
2. Stage only reviewed Phase 8 Core scope.
3. Run staged-boundary policy and secret checks.
4. Create one concise English commit or the smallest explicitly approved reviewable sequence.
5. Push normally only after authorization.
6. Bind one exact 40-character HEAD to Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.
7. Diagnose the first underlying failure with exact-head tools; repair root cause and retry only within fresh authority.
8. Do not create an evidence-only follow-up commit after the closure head passes.
9. Do not deploy, publish a release, mutate DNS/tunnels, or delete legacy credentials without separate authorization.

Phase 8 Core closes only when one exact published head passes the complete matrix and the live ChatGPT gate. A future Phase 8B CIMD/private-key-JWT/mTLS/Access extension requires its own design, authorization, tests, review, live gate, and publication; it does not reopen or block Core.

## 17. Memory entry required after every complete step

Append to the active Phase 8 archive:

```text
Date and STEP
Status
Goal
Files changed
Implementation
Exact verification and result classification
Dependency/protocol evidence when relevant
Decisions and why
User impact
Risks and limitations
Rollback
Next approved action
```

Update root `Memory.md` in place with current state, active boundary, most recent evidence, limitations, and next action. Keep the index within its size limits. When an archive volume reaches 80% of the direct-read ceiling, close it and begin the next numbered volume without rewriting prior entries.

Never store tokens, codes, private keys, DPAPI plaintext/blobs, Cloudflare credentials, complete client registration bodies, or sensitive local output.

## 18. Current next action

G8-0 and Tasks 8A1–8A9 are complete locally. Exact dependencies, Windows DPAPI CurrentUser protection, versioned atomic auth state, exact single-writer locks, stable binding/current-incarnation publication, physically separated listeners, constrained DCR/PKCE authorization, strict ES256 access tokens, rotating opaque refresh families, durable replay/revoke/expiry, request-local OAuth policy identity, token/deployment scope intersection, stable OAuth owner domains, exact per-tool OAuth metadata, authenticated MCP read/write/execute paths, one-command setup, current-user local administration, fail-closed Tunnel verification, protected recovery/rebind/no-deletion rollback, migration/security documentation, package boundaries, complete synthetic OAuth/MCP integration, and completed-runtime adversarial repairs are implemented and verified.

Gate G8-U is accepted through Journey U7. STEP-467 accepted U6 with a documented evidence substitution after the retained Legacy App was deleted: replacement Legacy compatibility passed, exact no-argument OAuth return passed, and the existing OAuth App completed a post-return read; continuity of the deleted Legacy App identity is explicitly not claimed. STEP-468 closed U7 with fail-early shared/unowned Tunnel preservation and live public/local boundary evidence. STEP-470 accepted local G8-X after one test-first named-Tunnel diagnostic-race repair and post-repair managed Node 20/24 ordinary plus protected Smoke. Exact-head CI, push, publication, release, deployment, unrelated Cloudflare/DNS/Tunnel mutation, and real credential migration remain separately authorized.
