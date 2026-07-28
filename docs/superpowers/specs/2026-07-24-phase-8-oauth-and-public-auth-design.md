# Phase 8 OAuth 2.1 and Public Authentication Usability Design

Date: 2026-07-26
Status: local implementation closure accepted; G8-0 and Tasks 8A1–8A9, authorized Gate G8-U through Journey U7, and STEP-470 local G8-X are complete. U6 closed with a documented evidence substitution because the retained Legacy App was deleted: replacement Legacy rollback compatibility and exact OAuth return continuity passed, while continuity of the deleted Legacy App identity is not claimed. STEP-468 closed U7 with fail-early shared/unowned Tunnel preservation and live public/local boundary evidence. Exact-head CI, publication, and deployment remain separately authorized
Audience: CodexGPT maintainers and the owner of this personal deployment

This document supersedes the short Phase 8 outline in the master plan for exact Phase 8 behavior. Implementation authority and external-state authority remain governed by the current project boundary.

Protocol and dependency assumptions were revalidated on 2026-07-26 against current OpenAI Apps SDK authentication guidance, MCP Authorization `2025-11-25`, installed/latest `@modelcontextprotocol/sdk@1.29.0`, and the current project baseline `b4b041da32be7bfb133495fb30aa851d67d4f216`.

## 1. Decision

Phase 8 Core will deliver one narrow, self-hosted OAuth 2.1 path optimized for the actual personal ChatGPT workflow:

```text
ChatGPT
  -> HTTPS https://mcp.<domain>/mcp
Cloudflare named Tunnel
  -> 127.0.0.1:<public-port>
CodexGPT public listener
  -> OAuth 2.1 resource server + colocated personal authorization server
  -> existing Policy / Approval / Audit / Workspace boundaries

Owner browser or CLI on the same Windows account
  -> 127.0.0.1:<local-admin-port>
CodexGPT local admin listener
  -> approve or deny OAuth linking, revoke grants, rotate keys, inspect status
```

Core choices:

1. Use a stable HTTPS hostname and a Cloudflare named Tunnel. OAuth mode refuses quick-tunnel URLs because an issuer and resource identifier that change after restart are not a usable identity boundary.
2. Keep the authorization server inside CodexGPT. It is a single-owner approval service, not a general account system: no passwords, social login, tenant database, external identity provider, or remote admin console.
3. Use authorization code + PKCE `S256`, exact RFC 8707 resource binding, short signed access tokens, rotating opaque refresh tokens, immediate grant revocation, and per-request verification.
4. Target constrained Dynamic Client Registration (DCR) for Core because it is the smallest reviewed compatibility path exposed by the current TypeScript MCP SDK and current platform guidance. Reuse the SDK only for the reviewed authorization, token, revoke, provider, and client-lookup primitives. Publish project-owned exact metadata and a project-owned strict DCR route because the SDK's default registration and metadata behavior also permits client-secret clients and does not enforce this deployment's narrow registration contract. Gate G8-U must prove current live ChatGPT acceptance before Phase 8 closes. Defer CIMD until the SDK exposes a reviewed native server path or a later need justifies the extra remote-metadata and SSRF surface.
5. Accept only ChatGPT production redirect URIs in normal OAuth mode. DCR clients are public clients with `token_endpoint_auth_method=none`; no client secret is issued or stored.
6. Ask once for the scopes enabled by the current deployment. Normal coding therefore links once; a later capability expansion causes a clear reauthorization instead of silently widening an old token.
7. Keep admin authority entirely off the public listener. OAuth bearer tokens can call `/mcp`; they can never call local setup, credential, approval, revoke, or rotation operations.
8. Keep `legacy` and `oauth` as mutually exclusive modes. Never accept OAuth and query-token credentials on the same public endpoint. Explicit `legacy` remains a one-service-restart rollback until OAuth live and exact-head gates close; ChatGPT client rollback uses a separately retained Legacy App and is never claimed to happen automatically inside the OAuth App.
9. Add no MCP tool and no new execution authority. V1/V2/V3/V4/V5 remain exact `28/31/39/51/52`.

### Why

The product problem is not “add every OAuth feature.” It is “let one owner connect ChatGPT to one self-hosted coding bridge without putting a reusable secret in a URL.” The shortest dependable path is a small authorization server that treats possession of the existing local Windows control channel as owner authentication and delegates all workspace actions to the existing policy stack.

An external identity provider would reduce protocol code but violate the repository's self-hosted direction, introduce another account and availability dependency, and make first use harder. A password database would add more risk than value for one local owner. A public approval button would not authenticate the owner. The separate loopback control plane gives the required proof with the least new user ceremony.

The official OpenAI guidance recommends an established identity provider for general deployments. This design deliberately takes the custom-provider exception only because the deployment is personal, single-owner, self-hosted, and has an existing same-user local control channel. Phase 8 must not be marketed as a reusable multi-tenant identity provider.

### User impact

- The Server URL becomes the stable, token-free `https://mcp.<domain>/mcp`.
- First link requires one local Approve action; routine reconnects and restarts use refresh-token rotation without another prompt.
- Normal read/write coding works after that single link. Enabling a new higher capability later produces an explicit reauthorization.
- Revocation is one local command or one click and takes effect on the next request, including for an otherwise unexpired access token.
- A lost OAuth state, corrupt credential store, wrong hostname, or unavailable local approval channel fails closed with an exact recovery command.
- Quick tunnels remain available only through explicit legacy compatibility; OAuth setup explains how to create a stable named tunnel instead of failing later in ChatGPT.

## 2. Required user journeys

### 2.1 One-time setup

The supported public entry remains `scripts/codexgpt-entry.mjs`. The target workspace is explicit because profiles are keyed by canonical root; running from the source checkout must never accidentally configure the source checkout instead of the intended project.

Published global install:

```powershell
codexgpt auth setup `
  --root D:\Dev\target-repo `
  --hostname mcp.example.com `
  --tunnel-name codexgpt-target
```

Unpublished source checkout:

```powershell
node D:\Dev\codexpro\scripts\codexgpt-entry.mjs auth setup `
  --root D:\Dev\target-repo `
  --hostname mcp.example.com `
  --tunnel-name codexgpt-target
```

`--root` may be omitted only when the current directory canonicalizes to a workspace with one exact saved profile. Ambiguity or a source-checkout/target mismatch returns `ROOT_REQUIRED` with the complete corrected command.

This is one supported entry point for both cases:

- **Existing dedicated stable tunnel:** setup verifies and reuses it without redundant prompts or external mutation only when the local ownership marker, tunnel ID, hostname route, and generated ingress all belong to this exact stable binding. A shared or unowned tunnel is never rewritten.
- **Cold start:** setup previews the exact Cloudflare login, named-tunnel creation, DNS route, and ingress changes, then asks for one explicit confirmation before performing them. Browser login may still require the owner's Cloudflare action; “one command” does not mean silently changing an external account.
- **Deterministic/no-mutation:** `--no-tunnel-changes` performs every local check and prints the exact remaining Cloudflare commands without changing Tunnel or DNS state. Noninteractive provisioning requires the explicit `--provision-tunnel` flag and still prints the planned hostname/tunnel targets before execution.

Setup is a journaled, resumable state machine:

```text
preflight
  -> candidate-local-state
  -> login-required
  -> tunnel-created
  -> dns-routed
  -> ingress-written
  -> candidate-listener-started
  -> external-probe
  -> mode-committed
  -> foreground-running | configured-no-start
```

The journal contains only safe resource references, exact ownership/digests, completion state, and recovery instructions. Re-running the same command resumes idempotently; it never creates a second tunnel, DNS route, owner subject, binding, incarnation, or signing key after an acknowledged step. `--provision-tunnel` can run noninteractively only when the reviewed managed binary already has valid owner login material; otherwise it returns `AUTH_TUNNEL_LOGIN_REQUIRED` and the same resume command.

Preflight completes every read-only/local failure check first: canonical root/profile and hostname registry, DPAPI probe, state-root containment/ACL/capacity, deployment lock, exact free ports, and managed cloudflared identity. It then prepares but does not activate candidate OAuth state. Only after that reversible local point may the confirmed Cloudflare mutation run. Setup starts the exact candidate public OAuth listener and owned tunnel, probes the real public metadata/Host/resource path, and only then atomically commits the profile mode. The external probe is never made against a legacy listener. Any failure stops the exact candidate listener/tunnel, leaves profile mode unchanged, and preserves the resumable journal. `--no-start` may use the bounded candidate for the probe but stops it after commit.

The command:

1. completes the local preflight, creates candidate DPAPI/state under the exact lock, and changes no profile/external state;
2. verifies the managed `cloudflared` binary and either validates a dedicated owner-marked tunnel or, after explicit confirmation, performs the bounded login/create/DNS/ingress flow;
3. proves that ingress targets only `127.0.0.1:<public-port>`, has a final 404 catch-all, and never contains the local-admin port;
4. starts the candidate public listener/tunnel and validates the real external metadata/Host/resource path;
5. atomically saves `authMode: "oauth"` only after the candidate and external probe pass;
6. in an interactive TTY, keeps the verified candidate running as the foreground server; `--no-start` and noninteractive mode stop it and print one exact source/global start command;
7. copies the token-free Server URL and opens the current ChatGPT app-management page when possible.

If the hostname is already bound to another root, setup fails without changing either deployment. The primary action is to choose a new hostname. A separately confirmed `auth rebind --from-root <old> --root <new> --hostname <host> --revoke-all` flow may release and rebind only after revoking the old deployment and preserving its evidence; there is no silent key/state replacement for an unchanged issuer.

Successful output is short:

```text
OAuth ready
Server URL  https://mcp.example.com/mcp
Admin       local only
Next        create or refresh the ChatGPT app, then approve the link on this PC
Rollback    use the retained Legacy App after: codexgpt auth rollback --root D:\Dev\target-repo
```

The command must not print an access token, refresh token, authorization code, DPAPI blob, private JWK, query-token URL, Cloudflare credential, or full client registration record.

### 2.2 First ChatGPT link

1. The owner creates or refreshes a ChatGPT app with `https://mcp.example.com/mcp`.
2. ChatGPT discovers protected-resource and authorization-server metadata.
3. ChatGPT registers one public DCR client and starts authorization code + PKCE.
4. The public authorization page says `Waiting for approval on this PC`, shows a short non-secret correlation code, requested capability labels, and expiry. It exposes no local path or secret.
5. The running CLI shows a pending-link indicator and the local setup page shows the same correlation code with the canonical workspace, client, redirect URI, scopes, and expiry.
6. The owner clicks Approve once, or runs:

   ```powershell
   codexgpt auth approve <correlation-code> --root D:\Dev\target-repo
   ```

7. The public browser receives a one-time authorization code, ChatGPT exchanges it with its PKCE verifier, and normal MCP initialization continues.

An owner denial returns the standard OAuth `access_denied` result. An expired request tells the user to retry linking. Neither condition produces a generic server error.

### 2.3 Normal restart

`codexgpt start --root D:\Dev\target-repo` (or `node D:\Dev\codexpro\scripts\codexgpt-entry.mjs start --root D:\Dev\target-repo` from this source checkout) loads the protected key and durable grant state, starts the public and local listeners, validates the exact issuer/resource/hostname/profile tuple, and accepts ChatGPT's refreshed access token. No owner click is expected.

If ChatGPT presents a consumed refresh token, the complete refresh family is revoked as replayed and the UI gives the relink action. It never silently issues a second token.

If the server durably rotates a refresh token but the success response is lost, the client's retry is intentionally treated as replay and the family is revoked. This prefers a deterministic relink over retaining a reusable plaintext successor. A permanent dropped-response regression must prove the result is a clear relink action, not a random 500 or stuck connection.

### 2.4 Capability change

The initial challenge asks for all coarse scopes that the current deployment can actually use:

- always `codexgpt:read`;
- `codexgpt:write` only when the active configuration exposes writable filesystem or local Git behavior;
- `codexgpt:execute` only when the active configuration exposes shell/process/full-access behavior.

Saved profile changes take effect only after CodexGPT starts again. The exact expansion journey is:

1. enable the capability through the normal canonical-root profile path;
2. stop/restart the foreground OAuth service with the printed exact `start --root` command, or use the separately installed `service restart --root`; issuer, resource, `bindingId`, and OAuth App stay unchanged;
3. prove the old token still lacks the new scope;
4. let the first affected tool call return an insufficient-scope challenge;
5. reauthorize the same DCR client and approve the expanded scopes locally.

A pure scope expansion does not require **Scan Tools**. Only a tool descriptor/visibility change requires the existing one-time **Scan Tools** or recreate action. If configuration becomes more restrictive, restart publishes the smaller `enabledOAuthScopes`; the next policy intersection removes capability without widening any token and without a reauthorization loop.

### 2.5 Revoke and recover

```powershell
codexgpt auth status --root D:\Dev\target-repo
codexgpt auth pending --root D:\Dev\target-repo
codexgpt auth open --root D:\Dev\target-repo
codexgpt auth clients --root D:\Dev\target-repo
codexgpt auth client remove <safe-client-id> --root D:\Dev\target-repo
codexgpt auth prune --unapproved --root D:\Dev\target-repo
codexgpt auth revoke <grant-id> --root D:\Dev\target-repo
codexgpt auth revoke --all --root D:\Dev\target-repo
codexgpt auth rotate-signing-key --root D:\Dev\target-repo
codexgpt auth rollback --root D:\Dev\target-repo
codexgpt auth recover inspect --root D:\Dev\target-repo
codexgpt auth recover restore <backup-id> --root D:\Dev\target-repo
codexgpt auth recover unlock <exact-owner-id> --root D:\Dev\target-repo
codexgpt auth reinitialize --revoke-all --root D:\Dev\target-repo
```

`status` shows safe client labels, scope labels, creation/last-use/expiry times, and revocation state. It never shows raw client secrets or token material.

`revoke` atomically increments the grant revision before reporting success. Every subsequent access-token verification checks this durable revision, so revocation is immediate rather than “after the ten-minute JWT expires.”

`client remove` removes one registration only after its grants are revoked; it is distinct from grant revoke. Active clients are never evicted automatically.

`rollback` first resolves the effective auth-mode origin. It changes only the selected profile mode when no CLI/environment override wins, and otherwise returns `AUTH_MODE_ENV_OVERRIDE` with the exact current-process or persisted-user-environment repair command. It does not delete OAuth state, legacy credentials, audit records, profiles, keys, grants, registrations, or recovery evidence.

Service rollback and ChatGPT rollback are separate:

1. keep the pre-migration Legacy App during at least one compatibility cycle;
2. create a separate OAuth App for the token-free URL;
3. after `auth rollback`, use its exact foreground stop/start instruction; if a separately authorized background-service feature exists, use its exact-root restart instead;
4. then use the retained Legacy App;
5. if no Legacy App exists, start legacy mode and explicitly press `u` to reveal/copy the credential-bearing URL under the existing URL-secret warning and `Authentication: None` instruction;
6. return to OAuth by rerunning the idempotent published/source `auth setup --root D:\Dev\target-repo`, which infers the saved hostname/tunnel, candidate-probes, and commits only on success; then use the retained OAuth App.

The OAuth App itself does not learn the legacy query-token URL, and the Legacy App does not become an OAuth client automatically.

Recovery commands work offline under the same Windows account when the server cannot start. They acquire the exact deployment lock, refuse to modify a live deployment, inspect or restore only verified backups, and move corrupt state into a bounded quarantine without deletion. `recover unlock` succeeds only after exact dead-owner evidence.

A backup's integrity does not prove that its grant/revocation state is current. `recover restore` is therefore always a security reset: inside one offline transaction it restores eligible configuration/registration evidence, preserves the stable binding and binding-only tunnel-owner marker, creates a new random incarnation ID, signing key, refresh pepper, and recovery epoch, marks every restored grant/family inactive, atomically updates deployment state plus the installation registry's current-incarnation reference, publishes no old public key, and requires relink before service resumes. It does not recreate or remotely mutate Cloudflare Tunnel/DNS. Old access and refresh tokens remain invalid even when the backup predates their revocation. If DPAPI unprotect cannot be recovered, `reinitialize --revoke-all` uses the same forced-relink rule, requires destructive confirmation, preserves the old evidence, and never overwrites the old protected blob in place.

## 3. Scope and non-goals

### 3.1 In scope

- colocated OAuth 2.1 authorization server and MCP resource server;
- OAuth authorization code grant with PKCE `S256`;
- constrained ChatGPT DCR;
- protected-resource metadata and authorization-server metadata;
- exact `resource`, issuer, audience, redirect, code, scope, and token validation;
- ES256 access-token signing and JWKS publication;
- opaque refresh-token rotation, replay detection, expiry, and family revocation;
- one stable owner subject and stable owner-bound policy identity;
- per-request bearer validation for POST, GET, and DELETE MCP traffic;
- per-tool OAuth security metadata and runtime scope challenges;
- public/local listener separation;
- Windows DPAPI CurrentUser protection for long-lived signing and hashing keys;
- atomic, bounded, recoverable auth application state;
- local owner consent, grant management, key rotation, doctor output, and audit;
- named Cloudflare Tunnel/hostname validation;
- strict OAuth/legacy migration and rollback;
- live ChatGPT, negative-protocol, Node 20/24, Windows/Ubuntu test-provider, package, and exact-head gates.

### 3.2 Explicitly out of scope

- multi-user accounts, organizations, teams, roles, invitations, or delegated administration;
- passwords, password reset, email verification, passkeys, TOTP, recovery codes, or social login;
- an external Auth0/Okta/Stytch/Cognito dependency;
- OAuth client credentials, device code, implicit grant, resource-owner password grant, JWT bearer grant, or service accounts;
- arbitrary public DCR clients;
- OIDC ID tokens, `openid`, `profile`, or `email` scopes;
- CIMD or `private_key_jwt` in Core;
- token introspection for third-party authorization servers;
- a remote admin API or an OAuth admin scope;
- Cloudflare Access or mTLS in Core;
- public inbound binding, WSL, containers, or an OS sandbox;
- deleting legacy query-token state;
- new MCP tools, new workspace authority, remote Git writes, or new execution capabilities;
- Phase 9 subagents.

### 3.3 Threat boundary

Phase 8 protects against:

- URL-token leakage through browser history, clipboard, screenshots, or copied links;
- expired, malformed, wrong-issuer, wrong-audience, wrong-resource, wrong-scope, or revoked tokens;
- authorization-code interception without the PKCE verifier;
- refresh-token replay;
- cross-client, cross-resource, cross-profile, and cross-session token confusion;
- a public caller attempting to invoke setup/admin/approval operations;
- a public caller attempting to register a non-ChatGPT redirect URI;
- stale grants surviving scope, owner, key, profile, or deployment revision changes;
- corrupt or partially written auth state.

An unexpired Bearer access token remains replayable if stolen because Core does not implement DPoP or end-to-end mTLS. The ten-minute lifetime and immediate local revocation bound damage; they do not prevent use before expiry/revocation. Phase 8 also does not protect against a process already running as the same Windows user, a compromised owner browser/account, a compromised Cloudflare account, a malicious dependency executing during build/install, or ambient `full_access`. The truthful isolation report remains `execution_isolation: none`, `filesystem_isolation: none`, and `network_isolation: none` where applicable.

## 4. Deployment identity and listener split

### 4.1 Canonical URLs

For configured hostname `mcp.example.com`:

```text
issuer                    https://mcp.example.com
resource                  https://mcp.example.com/mcp
protected resource        https://mcp.example.com/.well-known/oauth-protected-resource/mcp
authorization metadata    https://mcp.example.com/.well-known/oauth-authorization-server
authorization endpoint    https://mcp.example.com/authorize
token endpoint            https://mcp.example.com/token
registration endpoint     https://mcp.example.com/register
revocation endpoint       https://mcp.example.com/revoke
jwks endpoint             https://mcp.example.com/jwks
```

The issuer has no trailing slash. The resource includes the exact `/mcp` path and no trailing slash, query, or fragment. Authorization and token requests must carry that exact resource value. The server never derives issuer or resource from `Host`, `Forwarded`, or `X-Forwarded-*` headers.

Hostname, issuer, resource, canonical profile/root, stable `bindingId`, current `incarnationId`, signing state, and grant state form the deployment identity. Public and local-admin ports are listener configuration, not token/grant identity. One issuer/resource tuple may be bound to only one canonical profile/root across the installation. Changing hostname/profile requires a new binding or the separately confirmed revoke-all rebind flow; tokens from the previous binding do not carry over. Forced recovery preserves the binding/tunnel ownership but rotates the incarnation and all token authority. Changing only the local-admin port requires a restart but does not invalidate grants or refresh families.

### 4.2 Public listener

The public listener binds only to `127.0.0.1:<public-port>` and exposes:

- `GET /.well-known/oauth-protected-resource/mcp`;
- `GET /.well-known/oauth-protected-resource` as an exact compatibility mirror;
- `GET /.well-known/oauth-authorization-server`;
- `GET /jwks`;
- `GET|POST /authorize`;
- `GET /authorize/status/<opaque-pending-id>`;
- `GET /authorize/continue/<opaque-pending-id>`;
- `POST /token`;
- `POST /register`;
- `POST /revoke`;
- `POST|GET|DELETE /mcp`;
- a minimal `GET /healthz` returning only safe liveness/version/auth-mode data;
- a required static `GET /` documentation page because protected-resource metadata publishes it as `resource_documentation`.

In OAuth mode, `/setup`, `/admin/*`, detailed status, profile mutation, owner approval, revoke, rotation, and credential operations do not exist on this listener.

The root page is completely static, contains no workspace, credential, client, grant, deployment, version-detail, or environment data, and performs no browser detection or network fetch. It explains only that this is a CodexGPT OAuth endpoint and tells the owner to run `codexgpt auth status --root <workspace>` or `codexgpt auth open --root <workspace>` on the PC. It inherits the exact public HTML CSP/no-store/no-referrer/no-frame contract.

The public listener accepts only the configured public hostname. It does not enable Express `trust proxy`; forwarded addresses are never authorization evidence.

Public OAuth metadata and reviewed token/registration/revocation machine endpoints may advertise origin-agnostic CORS because browser-based MCP clients need discovery and token endpoints. `/authorize` and its waiting/status/continue pages do not use open CORS. CORS is not treated as authorization: these routes use no cookie authority except the exact waiting-page binding, exact Host/client/redirect/resource/PKCE checks still apply, and `/mcp` preserves its existing Origin policy. The local-admin listener never inherits this CORS behavior.

Every public HTML response and the local admin UI has a frozen security-header contract: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, a nonce/hash-based `Content-Security-Policy` with `default-src 'none'` and `frame-ancestors 'none'`, and no third-party asset. Waiting-page cookies are host-only, `HttpOnly`, `Secure`, `SameSite=Strict`, path-scoped to `/authorize`, short-lived, and contain only a random binding. The loopback admin cookie is host-only and `Secure` only when the exact local origin uses HTTPS; Core's HTTP loopback origin instead relies on `HttpOnly`, `SameSite=Strict`, exact Origin/Host/CSRF, a fragment bootstrap, and physical absence from Tunnel ingress. Tests freeze both variants rather than setting an unusable Secure cookie on HTTP loopback.

### 4.3 Local admin listener

The local admin listener binds a separate `127.0.0.1:<local-admin-port>` that is absent from Cloudflare ingress. It exposes setup, detailed status, pending-link approval, profile mutation, grant revoke, and key rotation.

It requires:

- an exact loopback socket peer and loopback Host;
- a one-time bootstrap nonce delivered in a URL fragment, never a query string;
- an `HttpOnly`, `SameSite=Strict` local session cookie after nonce exchange;
- exact Origin/Host validation;
- a per-session CSRF token on state changes;
- bounded body sizes and rate limits;
- short idle and absolute session expiry.

The CLI obtains equivalent authority through the existing current-user local-control channel. Browser and CLI adapters call the same owner-operation service; they do not implement separate authorization rules.

Any request arriving through the public port is incapable of reaching local admin routes even if it spoofs a Host header.

## 5. OAuth metadata and client registration

### 5.1 Protected-resource metadata

The document below is the exact full-capability example:

```json
{
  "resource": "https://mcp.example.com/mcp",
  "authorization_servers": ["https://mcp.example.com"],
  "scopes_supported": [
    "codexgpt:read",
    "codexgpt:write",
    "codexgpt:execute"
  ],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://mcp.example.com/"
}
```

The real response uses the configured hostname and an ordered `enabledOAuthScopes` computed once from the deployment's maximum configured capability: `read` is always present, `write` is present only when writable filesystem/local-Git behavior is configured, and `execute` is present only when shell/process/full-access behavior is configured. Both metadata documents and every discovery challenge publish that same ordered set; a read-only deployment therefore publishes only `["codexgpt:read"]`. Protected-resource and authorization-server metadata plus JWKS are pre-serialized by current config/key revision and return `Cache-Control: public, max-age=60, must-revalidate`; root HTML and health remain `no-store`. Rotation retains old public verification material beyond this cache window. Metadata uses exact JSON/content-type/cache/security headers and contains no local paths, profile IDs, owner IDs, client IDs, or deployment secrets.

### 5.2 Authorization-server metadata

For a full-capability deployment, Core advertises:

```json
{
  "issuer": "https://mcp.example.com",
  "authorization_endpoint": "https://mcp.example.com/authorize",
  "token_endpoint": "https://mcp.example.com/token",
  "registration_endpoint": "https://mcp.example.com/register",
  "revocation_endpoint": "https://mcp.example.com/revoke",
  "jwks_uri": "https://mcp.example.com/jwks",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "authorization_response_iss_parameter_supported": true,
  "token_endpoint_auth_methods_supported": ["none"],
  "revocation_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": [
    "codexgpt:read",
    "codexgpt:write",
    "codexgpt:execute"
  ]
}
```

`scopes_supported` is the same exact dynamic `enabledOAuthScopes` published by protected-resource metadata, not an unconditional three-scope list. Core does not advertise `client_id_metadata_document_supported`, OIDC scopes, implicit response types, client-secret methods, or unsupported endpoints.

### 5.3 DCR boundary

Normal OAuth mode accepts a DCR document only when all of these are true:

- body is valid bounded JSON with no duplicate semantic fields;
- `redirect_uris` contains one URI and it matches either:
  - `https://chatgpt.com/connector/oauth/<bounded-callback-id>`; or
  - the exact legacy `https://chatgpt.com/connector_platform_oauth_redirect`;
- response types are omitted or exactly `["code"]`; omission is normalized and returned as `["code"]`;
- grant types are omitted or contain exactly `authorization_code` and `refresh_token`; omission is normalized and returned as both because Core always issues a rotating refresh token, while an explicit authorization-code-only or unknown grant set is rejected;
- token endpoint auth method is omitted or exactly `none`;
- `scope` is omitted or is one normalized, duplicate-free subset of the fixed Core-known scope vocabulary (`read`, `write`, `execute`); unknown scopes are rejected;
- client name and optional display metadata pass size, URL, and control-character limits;
- no client secret, arbitrary JWKS, localhost redirect, custom scheme, fragment, userinfo, wildcard, or non-HTTPS URI is accepted.

Bounded unrecognized extension metadata is ignored and not logged, stored, or echoed, as required for extensible OAuth registration. Duplicate standard fields and understood-but-forbidden security-sensitive fields such as `client_secret`, `jwks`, `jwks_uri`, `software_statement`, registration-management input, or alternate authentication methods are rejected. The `201` response returns the accepted and normalized sanitized metadata—including exact `response_types`, `grant_types`, fixed Core-known protocol `scope`, and `token_endpoint_auth_method`—plus a random opaque `client_id` and `client_id_issued_at`. The DCR scope is a client protocol ceiling, not a grant: initial authorization and discovery still request only current `enabledOAuthScopes`, and owner consent plus current policy remain mandatory. This lets one registered client reauthorize after a later configuration expansion without recreating the App. The response returns no `client_secret`, registration access token, or remote registration-management URI.

Unapproved registrations are bounded and expire after 24 hours. Approved registrations are durable, owner-visible, and capped. Capacity exhaustion returns an actionable local cleanup instruction; it never evicts an active approved client silently.

MCP Inspector and synthetic clients use an explicit test-only predefined-client adapter. Production OAuth mode never widens DCR redirect rules just to make a test convenient.

### 5.4 Why DCR is Core and CIMD is deferred

OpenAI and MCP prefer CIMD when available. The current production dependency, `@modelcontextprotocol/sdk@1.29.0`, exposes authorization/token/revoke handlers and a DCR handler, but does not publish a complete native CIMD server path. Its `mcpAuthRouter` must be mounted at the application root and fixes the paths to `/authorize`, `/token`, `/register`, and `/revoke`. Its generated metadata advertises `client_secret_post` plus `none`; its built-in DCR route uses generic JSON parsing/open CORS and can issue a client secret for non-public clients. Those defaults are broader than this deployment.

Core therefore uses a narrow composition:

1. project-owned protected-resource/authorization metadata and `/jwks` routes are mounted first;
2. project-owned `/register` performs bounded raw JSON parsing, duplicate-field rejection, exact ChatGPT redirect validation, public-client-only issuance, capacity/rate control, and durable storage;
3. the SDK-facing client-store view omits `registerClient`, preventing the built-in registration route and its client-secret metadata;
4. the SDK router is mounted at the application root for `/authorize`, `/token`, and `/revoke`, behind a project-owned bounded query/form parser plus Host/method/content-type/rate/parameter/safe-header guards; the project parser rejects duplicate standard fields and understood forbidden fields, ignores bounded unrecognized extension parameters without logging or echoing them, rejects every client secret or Basic-client-auth input, hands the SDK one canonical parsed body, and disables the SDK's loopback/IP-based limiter only after the project limiter is active;
5. permanent route/metadata/behavior contract tests fail if an SDK upgrade adds, moves, or broadens an endpoint.

This keeps the SDK's tested protocol state-machine boundary without adopting its broader discovery and client-registration policy.

DCR therefore minimizes implementation and interoperability risk for this one-owner deployment. It is not a permanent rejection of CIMD. A later Phase 8B may replace or supplement DCR when:

- the exact SDK provides reviewed CIMD support; or
- a concrete ChatGPT compatibility or administration problem justifies a bounded local adapter.

Phase 8B must preserve the same owner, scope, token, admin, and rollback invariants.

## 6. Authorization and local owner consent

### 6.1 Request validation

`/authorize` accepts only:

- `response_type=code`;
- a known active DCR `client_id`;
- an exact registered redirect URI;
- non-empty opaque `state` within a bounded size;
- `code_challenge_method=S256`;
- an exact 43-character, unpadded base64url SHA-256 challenge matching `[A-Za-z0-9_-]{43}`;
- exact configured `resource`;
- known requested scopes that are also enabled by the deployment; omitted or empty `scope` normalizes to the exact ordered `enabledOAuthScopes`;
- an optional bounded `id_token_hint` only as ignored compatibility input, because Core does not issue OIDC ID tokens.

Bounded unknown extension parameters are ignored, never logged/stored/reflected, and never affect policy. Duplicate standard parameters, understood forbidden parameters, malformed values, or budget overflow fail. Authorization/wait/status/continue routes never inherit open CORS from metadata, token, registration, or revocation wrappers.

### 6.1.1 Exact error contract

The project guard converts protocol failures before the SDK can turn them into a generic 500:

| Endpoint/input | OAuth result |
| --- | --- |
| authorize/token/refresh missing, malformed, duplicate, or wrong `resource` | `invalid_target`; a duplicate standard parameter may use `invalid_request` before semantic validation |
| unknown, duplicate, or disabled requested scope | `invalid_scope` |
| missing/invalid client where client authentication is evaluated | `invalid_client` without a client-existence oracle |
| bad/expired/consumed code, redirect mismatch, or PKCE verifier failure | `invalid_grant` |
| verifier outside 43–128 RFC 7636 unreserved characters | `invalid_grant` |
| duplicate standard field, forbidden client authentication, wrong method/content type, or malformed form/query | `invalid_request` |
| bounded unknown extension field | ignored and not logged, stored, or echoed |

Authorization errors redirect with original `state` and exact issuer only after both client and redirect have been verified; earlier failures use a direct safe response. Core implements RFC 9207: metadata advertises `authorization_response_iss_parameter_supported: true`, and every successful or error authorization callback includes exact `iss`. G8-0 freezes this standards-required contract and its tests; Gate G8-U proves current live ChatGPT acceptance after the runnable OAuth path exists. Incompatibility blocks Phase 8 closure and requires an explicit design revision rather than silently omitting issuer binding.

### 6.2 Pending request

After validation, the server creates an in-memory pending request containing:

- random request ID and random browser binding;
- safe client reference and exact redirect;
- PKCE challenge;
- requested scopes;
- exact resource;
- state;
- creation/expiry;
- owner decision state.

The public browser receives only a secure, HttpOnly browser-binding cookie, an opaque pending ID, and a short correlation code. Its same-origin page polls the project-owned `GET /authorize/status/<opaque-pending-id>` route. That route requires the exact cookie and pending ID, allows no CORS, returns only `pending|approved|denied|expired`, and never returns a code or redirect URI. For every terminal state the page navigates to the project-owned one-use `GET /authorize/continue/<opaque-pending-id>` route. Continue requires the exact pending ID and browser-binding cookie, atomically consumes the delivery record, clears the binding cookie, and redirects only to the already verified callback:

- approved -> `code`, original `state`, and exact RFC 9207 `iss`;
- denied -> `error=access_denied`, a bounded safe description, original `state`, and exact `iss`;
- expired -> `error=temporarily_unavailable`, a bounded retry description, original `state`, and exact `iss`.

Only errors reached after the client and redirect have been fully validated may redirect. Unknown, malformed, cross-cookie, already-consumed, or terminal-delivery-expired requests return the same non-oracular local error and never reveal a redirect, state, decision, client, or code. Both routes are mounted before the SDK root router and every other path/method is absent.

The active authorization request, pending ID, and browser binding expire after five minutes. Denial or active expiry converts the entry into a cookie-bound, code-free terminal-delivery record retained for at most another sixty seconds or one successful continue, whichever comes first; it remains charged against the pending cap. Authorization codes expire after sixty seconds, are single-use, and exist only as keyed hashes in memory. Status/continue responses are no-store, non-oracular, and bounded globally/per client.

Restarting during an incomplete authorization safely cancels the flow. The page tells the user to retry; no partial grant is durable.

### 6.3 Owner decision

The local approval view shows:

- correlation code;
- canonical workspace root;
- safe client label and hashed client reference;
- exact redirect host/path;
- human scope descriptions;
- whether scopes match current configuration;
- expiry;
- Approve and Deny.

Approval is valid only through the current-user local-control service or an authenticated local-admin session. Public browser possession, source IP, forwarded IP, correlation code, OAuth state, or DCR client ID never authorizes the request.

The OAuth consent queue is separate from tool-operation approval records. It may reuse the local transport and UI shell, but not grant IDs, schemas, or approval semantics.

## 7. Token and grant model

### 7.1 Access token

Access tokens are compact ES256 JWTs with:

```text
typ      at+jwt
alg      ES256
kid      active signing-key id
iss      exact configured issuer
aud      exact configured resource
sub      stable owner subject
client_id opaque DCR client id
scope    space-delimited coarse OAuth scopes
iat      issue time
nbf      not-before
exp      ten minutes after issue
jti      random token id
grant_id random grant-family id
grant_rev durable grant revision
```

Verification allows only ES256 and a bounded clock skew. It checks signature, `kid`, `typ`, issuer, audience, subject, client, scope syntax, `iat`, `nbf`, `exp`, `jti`, grant ID, grant revision, deployment identity, and current durable grant state.

Every MCP HTTP request carries and verifies a Bearer token. A valid token is never accepted from a query string, cookie, request body, WebSocket subprotocol, or MCP payload.

### 7.2 Refresh token

Refresh tokens are opaque server-authenticated envelopes containing only a version, random 128-bit family handle, unsigned 64-bit generation, random 256-bit nonce, and HMAC-SHA-256. The HMAC key is DPAPI-protected. The client treats the base64url value as opaque; the envelope contains no owner, scope, client, resource, path, or reusable server secret. The server persists only the current token keyed hash, random family handle, current generation, grant revision, scopes, client/resource reference, created/last-use/idle/absolute expiry, and status.

Defaults:

- rotate on every successful use;
- 90-day inactivity expiry;
- 365-day absolute expiry;
- one response returns one new refresh token;
- a consumed token replay revokes the complete family;
- a scope increase requires a new owner-approved authorization;
- every refresh request carries the exact RFC 8707 `resource`; missing, duplicate, or wrong resource fails;
- refresh `scope` is omitted or empty, or normalizes to the exact current family scope set; omitted/empty means unchanged, while subset, superset, unknown, or duplicate scope input fails `invalid_scope` rather than mutating the grant;
- a refresh response never broadens scopes or changes resource/client/owner.

Token values are returned only in standards-required OAuth JSON responses with `Cache-Control: no-store` and `Pragma: no-cache`.

Every mutation of a refresh family—refresh, public/local/client/owner revoke, replay handling, expiry, and owner-approved scope revision—uses one linearizable coordinator. The fixed acquisition order is deployment mutation gate, then affected family locks in lexicographic family-handle order, then an authoritative durable reread plus expected revision/generation comparison. Refresh authenticates/decodes the envelope only far enough to locate the random family handle, enters that order, requires the exact current generation and current keyed hash, durably persists the successor hash/generation and required audit record, and only then returns the response. Revoke returns success only after the new revision/status and audit record are durable; no refresh or access issuance may commit after that success against an older reread. Any authenticated older generation identifies and revokes the still-active family without retaining every old token hash; an unauthenticated/malformed handle remains non-oracular. Owner-wide operations lock all affected families in sorted order and never invert the order.

The envelope MAC and persisted token hash use separately derived, purpose-labelled keys (`refresh-envelope-v1` and `refresh-store-v1`) from the protected deployment key material; they are never the same raw key. Routine refresh increments only `refresh_generation`; it does not change `grant_rev`, owner identity, scopes, approval revision, or existing owner-bound artifacts. Revoke, replay-family revoke, or owner-approved scope revision changes `grant_rev`. Access tokens minted after routine refresh carry the same grant revision and a new `jti`, so existing unexpired access tokens remain valid unless a security revision changes.

Authorization-code exchange is also a single crash-safe transaction: under the deployment mutation gate it atomically consumes the keyed code record, verifies client/redirect/resource/PKCE, persists the grant/family and durable audit event, then constructs one response. Double exchange has at most one success. Failure or process termination before publication leaves either a still-valid unconsumed code with no grant or a consumed code with one complete active grant; it never leaves two families or an active orphan that the owner cannot list/revoke. A lost successful token response intentionally requires a fresh authorization rather than reusing the code.

The concrete DPAPI/state provider selected at startup is pinned for the complete server lifecycle; a later provider failure is an error, never a fallback to another potentially stale credential store. The deployment-wide single-writer lock prevents a second process from running the same transaction concurrently.

### 7.3 Immediate revocation

JWT signature validity is necessary but not sufficient. Every request checks that the referenced grant family exists, is active, matches the owner/client/resource, and has the exact revision in the token.

Local revoke, refresh replay, signing-state rollback, client revoke, or owner-wide revoke updates durable state before success is reported. Old access tokens fail on the next request even before `exp`.

The public revocation endpoint accepts an access or refresh token, verifies it without revealing validity, revokes the corresponding family only when it belongs to the authenticated public `client_id`, and returns the standard non-oracular success response for valid, unknown, expired, cross-client, and already-revoked input.

### 7.4 Key rotation

One deployment has one active P-256 private key and zero or more temporary previous public keys. Rotation:

1. generates and DPAPI-protects a new private key;
2. atomically publishes the new active `kid` and previous public JWK;
3. signs new tokens only with the new key;
4. retains an old public key for the maximum access-token lifetime plus skew;
5. removes the expired public key through bounded maintenance.

Previous private keys are not retained. Rotation does not change owner identity or grant scopes. A corrupt or unavailable key fails OAuth mode closed.

## 8. Windows credential and state storage

### 8.1 State layout

Phase 8 separates installation identity from deployment state:

- one installation owner record below `CODEXGPT_HOME` contains the versioned, DPAPI-protected stable owner subject and uses an installation-scoped lock/entropy purpose;
- one stable random `bindingId` binds canonical workspace profile/root, exact issuer/resource/hostname, and the owner-marked dedicated tunnel; it survives a forced recovery reset;
- one deployment root is keyed by `bindingId` and contains a replaceable random `incarnationId`/recovery epoch plus deployment-specific key, client, grant, refresh, and recovery state;
- one installation deployment registry atomically binds each issuer/resource/hostname to exactly one canonical profile/root and `bindingId`, and records only the current `incarnationId`;
- the existing installation-wide MAC-chained persistent audit is the sole audit store; deployment state contains only bounded audit correlation/cursor references, never a second audit log.

A deployment root contains:

- public deployment metadata;
- an opaque installation-owner reference plus DPAPI-protected deployment signing/hash-key bundles;
- non-secret public JWKs;
- normalized DCR registrations;
- current keyed refresh-token hashes, authenticated family handles/generations, and grant state;
- process-owner/lock/recovery evidence;
- bounded references into the installation-wide persistent audit.

Profiles contain only:

```json
{
  "authMode": "oauth",
  "oauthIssuer": "https://mcp.example.com",
  "oauthResource": "https://mcp.example.com/mcp",
  "oauthCredentialProvider": "windows-dpapi-current-user",
  "oauthStateRef": "<opaque-local-reference>"
}
```

No profile contains a private JWK, refresh token, access token, authorization code, PKCE verifier, raw DCR request, DPAPI plaintext, or newly created shared secret. Two distinct profile/issuer deployments may run concurrently under separate deployment writer locks and keys while reading the same stable installation owner subject; a global registry lock is used only for setup/rebind of hostname ownership.

### 8.2 DPAPI provider

Windows production uses a narrow, versioned helper around `.NET ProtectedData` with `DataProtectionScope.CurrentUser`.

- Secrets cross the Node/helper boundary only over inherited stdin/stdout pipes, never argv, environment, temporary files, or logs.
- Additional entropy uses a fixed version/purpose. The installation owner blob binds to the installation purpose; deployment key/pepper blobs bind to the exact profile/deployment purpose.
- The helper has a fixed operation protocol, source/manifest integrity checks, bounded frame sizes, hidden process window, and no caller-selected command.
- Unprotected key bytes live only in the current CodexGPT process and are cleared where Buffer semantics permit. This is not claimed to resist a same-user process or memory compromise.
- Windows ACLs and DPAPI are both used; ACLs alone are not described as encryption.

There is no plaintext production fallback. Ubuntu and generic test runs use injected in-memory fixtures; non-Windows OAuth production remains unsupported until an independently reviewed native credential provider exists.

### 8.3 Atomicity and ownership

Auth state uses the reviewed atomic application-state writer and a dedicated single-deployment writer lock. It does not write through workspace mutation tools.

Only one OAuth server process may own a deployment state root. A second owner fails with an exact process/run identifier and recovery instruction. Stale-owner recovery uses bounded liveness evidence and never authorizes deletion of credentials, grants, audits, or unknown state.

Every installation/deployment document has an exact schema version, canonical serialization, integrity field, and bounded unknown-field policy. Migration runs copy-on-write under the relevant lock: verify old state, create a manifest-bound backup, write/verify the candidate, then publish. A new binary may migrate a known older schema; an old binary encountering a future schema refuses to write and prints the exact required version. Unknown future fields are never silently stripped. Rolling the binary back does not rewrite state.

Schema or integrity failure sets `recovery_required`; OAuth startup, issuance, refresh, revoke, and rotation fail closed. Explicit legacy restart remains available without modifying the OAuth evidence.

No backup restore can lower a security revision or republish an old signing/refresh authority. Recovery activation keeps the stable `bindingId` but creates a new random `incarnationId`, key, pepper, and recovery epoch with inactive grants, so “backup before revoke → revoke → restore backup” still rejects every old access/refresh token and permits only a new authorization flow. Restore acquires the installation-registry lock and deployment lock in that fixed order, writes/verifies a complete copy-on-write incarnation directory that is not yet reachable, then atomically replaces the registry's current-incarnation pointer as the sole commit point. Startup resolves state only through that pointer. The owner-marked local tunnel record names only the stable `bindingId`, so it remains unchanged and no Cloudflare Tunnel/DNS operation occurs. A crash before the pointer publish leaves the complete old incarnation; a crash after it exposes the complete new one. Registry and state never expose two hostname bindings or a half-switched identity, and the old directory remains bounded recovery evidence until explicit retention cleanup.

All new filesystem primitives must enter the direct mutation inventory with exact semantic digests and reviewed purposes.

## 9. Request identity and policy integration

### 9.1 Request-aware identity

The current HTTP identity is fixed when an MCP session is created. That is insufficient for OAuth because the authorization specification requires a bearer token on every HTTP request and the token may rotate while the MCP session remains active.

Phase 8 introduces a request-aware policy context:

```text
HTTP bearer verification
  -> VerifiedOAuthRequest
  -> AsyncLocalStorage request context
  -> PolicySessionContextSource.currentIdentity()
  -> Policy / Approval / Audit / tool handler
```

There is no process-global last identity and no fallback to the initialization token. Missing request context fails closed.

Each MCP transport record binds the stable owner subject, client reference, resource, and deployment. Later POST/GET/DELETE requests may use a rotated token from the same owner/client/deployment but may not cross owner, client, resource, or profile boundaries.

### 9.2 Identity fields

The versioned OAuth identity carries:

- `kind: "oauth_subject"`;
- `authenticationMode: "oauth2"`;
- stable owner `subject`;
- stable derived `ownerId`;
- grant-family `credentialRef`;
- grant revision;
- per-request token ID;
- hashed client reference;
- mapped internal policy scopes;
- `assuranceLevel: "strong"`.

Raw bearer tokens and raw DCR metadata never enter request identity, policy decisions, approval facts, audit records, workspace handles, or error details.

Owner-bound artifacts use the stable OAuth subject first. Token rotation and signing-key rotation do not change owner identity. Revocation or scope revision invalidates affected approval/grant facts through the credential revision.

The current V4 owner formula, which includes `credentialRef` even when an OAuth subject exists, must be corrected. OAuth ownership is subject-stable; a refreshed credential is not a new owner.

Legacy and OAuth remain separate owner domains. Workspace handles, approvals, change sets, worktrees, process handles, and Git facts created under one auth mode are never silently inherited by the other. A service rollback restores access only to still-valid legacy-owned artifacts under the original legacy identity; OAuth-owned artifacts remain preserved but inaccessible until OAuth mode returns, subject to their normal expiry/revocation. The UI reports this before mode change so rollback cannot be mistaken for an ownership migration.

### 9.3 Scope mapping

OAuth uses three understandable scopes:

| OAuth scope | Internal eligibility |
| --- | --- |
| `codexgpt:read` | workspace open, filesystem read, Git read, audit read, semantic read |
| `codexgpt:write` | filesystem write, local Git/index/ref/commit/merge, worktree management |
| `codexgpt:execute` | shell verify/execute, process manage/persistent, configured network/full-access eligibility |

This mapping is only an upper bound. It never enables a disabled tool, widens `allowedRoots`, bypasses hard secret/path rules, selects a more permissive profile, grants an operation approval, enables Git remote writes, or creates OS isolation.

Core has a fixed ordered `knownOAuthScopes` vocabulary that drives only the DCR protocol ceiling. At startup one pure resolver derives the ordered `enabledOAuthScopes` from the deployment configuration; that current value drives protected-resource metadata, authorization-server metadata, discovery challenges, authorization validation, owner consent, and policy intersection. Contradictory values or drift between any two current-capability representations fail startup; metadata never advertises a scope that authorization will reject solely because the deployment disabled it. A later configuration expansion can step up the same registered client, but the old token gains nothing until a new local owner approval succeeds.

Effective internal scopes are:

```text
mapped token scopes
  INTERSECT
deployment/configuration scopes
  INTERSECT
permission profile and hard policy
  PLUS only a valid operation-specific local approval where already required
```

The existing runtime behavior that appends V3/V4 scopes from configuration after identity creation must not bypass the OAuth intersection. Legacy/local identities are constructed with their deployment-enabled scopes so the same intersection algorithm preserves compatibility.

## 10. Tool metadata and authentication challenges

### 10.1 Security schemes

In OAuth mode, every exposed tool declares an `oauth2` security scheme with the minimum coarse scopes required by that tool. The top-level `securitySchemes` and compatibility `_meta.securitySchemes` mirrors are identical.

Examples:

```json
[{ "type": "oauth2", "scopes": ["codexgpt:read"] }]
```

```json
[{ "type": "oauth2", "scopes": ["codexgpt:read", "codexgpt:write"] }]
```

```json
[{ "type": "oauth2", "scopes": ["codexgpt:read", "codexgpt:execute"] }]
```

Legacy mode preserves its exact existing tool descriptors. OAuth metadata does not change tool names, order, request/response schemas, visibility, connection-test hiding, or Tool Contract counts.

### 10.2 HTTP challenges

When no authentication information is present, HTTP 401 returns a discovery challenge without an OAuth `error` value:

```text
WWW-Authenticate: Bearer resource_metadata="<exact-metadata-url>",
  scope="<space-delimited-enabledOAuthScopes>"
```

A malformed, expired, wrong, or revoked bearer token returns HTTP 401 with:

```text
WWW-Authenticate: Bearer resource_metadata="<exact-metadata-url>",
  error="invalid_token",
  error_description="<safe bounded action>",
  scope="<space-delimited-enabledOAuthScopes>"
```

An otherwise valid token rejected by the resource/transport authorization layer before a tool is parsed returns HTTP 403 with `error="insufficient_scope"`. A tool-specific scope decision happens inside the normal MCP/JSON-RPC response and does not convert the transport to an HTTP 403.

### 10.3 Tool-level challenges

The handler distinguishes three outcomes in this order:

1. if the tool's required coarse scope is absent from current `enabledOAuthScopes`, return the normal existing configuration/policy denial plus one local enable/change-profile action; do not emit an OAuth challenge that the authorization server can never satisfy;
2. if the scope is enabled but absent from the token grant, return the step-up result below;
3. if token and deployment scopes exist but an operation-specific approval is missing, use the existing approval flow; do not emit an OAuth challenge.

Only outcome 2 returns a normal `CallToolResult` envelope with `isError: true`, safe `content`, and:

```json
{
  "content": [
    { "type": "text", "text": "Reconnect to allow this capability." }
  ],
  "isError": true,
  "_meta": {
    "mcp/www_authenticate": [
      "Bearer resource_metadata=\"...\", error=\"insufficient_scope\", error_description=\"Reconnect to allow this capability\", scope=\"codexgpt:read codexgpt:execute\""
    ]
  }
}
```

The requested challenge scope is the deterministic `read, write, execute`-ordered union of the token's current granted scopes and the tool's minimum scopes, intersected with current `enabledOAuthScopes` and the fixed client protocol ceiling. This prevents step-up from accidentally dropping still-required read/write scopes. The challenge is generated by one canonical serializer to prevent header injection or metadata drift. It includes no token, local path, owner ID, client ID, policy body, or internal scope name. A configuration reduction therefore produces no privilege increase and no endless reconnect loop.

## 11. Cloudflare and hostname contract

### 11.1 Stable tunnel requirement

OAuth mode accepts only a saved stable hostname with a named Cloudflare Tunnel in Core. `cloudflare` quick-tunnel mode fails preflight:

```text
OAuth needs a stable HTTPS hostname; quick-tunnel URLs change after restart.
Run: codexgpt auth setup --root <canonical-path> --hostname <host> --tunnel-name <name>
No external changes: add --no-tunnel-changes
```

There is no hidden auto-downgrade to legacy and no generated temporary issuer.

If the named tunnel or DNS route does not exist, interactive setup performs the bounded Cloudflare flow only after one explicit preview/confirmation. It records safe created-resource references for status and rollback instructions, but `auth rollback` never deletes them. Any destructive Cloudflare cleanup remains a separate explicit owner action.

### 11.2 Generated ingress

The generated/validated Cloudflare ingress contains:

1. one exact hostname route to `http://127.0.0.1:<public-port>`;
2. any required fixed Host forwarding to the configured public hostname;
3. a final `http_status:404` catch-all;
4. no route to the local-admin port;
5. no `0.0.0.0`, LAN address, wildcard hostname, arbitrary origin, or caller-selected executable.

CodexGPT uses only the pinned verified managed `cloudflared` binary unless the existing explicit manual override is selected.

### 11.3 Access and mTLS

Cloudflare Access is not enabled by Core because an extra interactive or service-token gate can prevent ChatGPT from reaching OAuth metadata and token endpoints. Current OpenAI guidance states that ChatGPT presents an OpenAI-managed client certificate, but the intended Cloudflare topology terminates public TLS before the loopback process. CodexGPT therefore cannot treat mTLS as local evidence unless a later end-to-end design proves certificate validation/forwarding without trusting spoofable headers.

Neither control is claimed. A later extension requires a real end-to-end proof and must remain additive to OAuth, never a replacement.

## 12. Configuration, migration, and rollback

### 12.1 Exact auth modes

```text
authMode = legacy | oauth
```

- `legacy` is the exact query-token/static-Bearer compatibility behavior.
- `oauth` exposes the Phase 8 routes and accepts only OAuth Bearer tokens on `/mcp`.
- There is no `auto`, `mixed`, or dual-accept mode.

The environment override is `CODEXGPT_AUTH_MODE=legacy|oauth`; the saved profile field is `authMode`. Core has no separate public `--auth-mode` selector. One pure resolver, reused by startup, setup, status, doctor, and rollback, applies this exact precedence:

```text
current-process CODEXGPT_AUTH_MODE
  > persisted-user CODEXGPT_AUTH_MODE
  > selected canonical-root profile authMode
  > omitted legacy default
```

Different valid values at lower-precedence sources are overrides, not contradictions; status/doctor show the winning source without exposing unrelated environment data. Invalid values fail before startup. OAuth combined with query-token/no-token flags is a true conflict and fails with one exact repair command. `CODEXGPT_ALLOW_QUERY_TOKEN` is never interpreted as permission to weaken OAuth mode. If a future CLI auth-mode selector is introduced, it must rank above current-process environment and receive its own compatibility tests.

### 12.2 Migration

Rollout order:

1. implementation lands with omitted mode still resolving to `legacy`;
2. owner runs explicit `auth setup`;
3. MCP Inspector/synthetic protocol tests pass;
4. the existing Legacy App is retained and a separate fresh OAuth App completes the real journey;
5. restart, refresh, scope, revoke, and relink journeys pass;
6. adversarial review and local closure pass;
7. an exact published head passes the full matrix;
8. only then may a separately approved change make stable named-tunnel setup default to `oauth`.

Existing query-token values and the Legacy App remain usable only by explicit legacy mode for at least one compatibility cycle. They are not copied into OAuth state, migrated into refresh tokens, displayed, rotated automatically, or deleted. A later retirement needs an explicit status/warning cycle, successful OAuth/rollback evidence, and separate owner-confirmed deletion.

The workspace profile retains two credential-free route selectors in addition to the active top-level route:

```text
authRoutes.legacy = { tunnel, hostname, tunnelName, port, optional safe file/path selectors }
authRoutes.oauth  = { tunnel, hostname, tunnelName, tunnelOwner, port, localAdminPort, optional safe file/path selectors }
```

Only reviewed routing selectors are allowed. Query tokens, raw Cloudflare tokens, authorization codes, OAuth tokens, DPAPI blobs, private keys, and client/grant state are forbidden in `authRoutes`. The active top-level route must be switched as one mode-specific unit; changing only `authMode` is invalid because it can serve the selected authentication mechanism on the other App's hostname. OAuth issuer/resource continue to derive from `authRoutes.oauth.hostname` while Legacy mode is active.

Switching auth mode requires restarting the CodexGPT server process: stop/start the foreground process with the exact-root command, or restart a separately installed background task if that later feature exists. It does not transform one ChatGPT App into the other. The OAuth App may need one `Scan Tools` refresh or recreation because security metadata can be cached; legacy rollback uses the separately retained Legacy App.

### 12.3 Rollback

`codexgpt auth rollback --root <canonical-path>`:

- resolves the effective auth-mode origin and switches the active route plus workspace profile to explicit `legacy` only when no CLI/current-process/persisted-user environment override wins;
- on an override, returns `AUTH_MODE_ENV_OVERRIDE` and the exact PowerShell removal/change plus foreground restart action instead of claiming success;
- prints the URL-secret warning, one exact foreground restart command, and the retained-Legacy-App instruction;
- leaves OAuth state intact for diagnosis or retry;
- does not accept legacy credentials until restart;
- does not alter Cloudflare credentials or tunnel routes;
- does not delete or rewrite audit history;
- does not transfer owner-bound artifacts between legacy and OAuth identity domains.

A profile created before `authRoutes` existed fails with `AUTH_LEGACY_ROUTE_MISSING` rather than guessing. One bounded compatibility migration may supply `--legacy-hostname`, `--legacy-tunnel-name`, and `--legacy-public-port` together. Partial input fails closed; the command records only routing facts, never copies the existing query token into the route selector, and subsequent rollback uses the normal no-argument command.

Corrupt OAuth state never triggers automatic fallback. The owner chooses rollback explicitly.

Returning from legacy to OAuth is the same idempotent setup journey, not an undocumented profile edit:

```powershell
# Published global install
codexgpt auth setup --root D:\Dev\target-repo

# This source checkout
node D:\Dev\codexpro\scripts\codexgpt-entry.mjs auth setup --root D:\Dev\target-repo
```

Setup infers the saved hostname and owner-marked dedicated tunnel, revalidates local state, starts/probes a candidate OAuth listener, and atomically commits `oauth` only after the real public probe succeeds. It then uses the separately retained OAuth App. A winning environment override produces `AUTH_MODE_ENV_OVERRIDE` and an exact PowerShell repair command rather than reporting a mode change.

## 13. Limits, audit, and privacy

### 13.1 Bounded inputs and state

Core freezes these default ceilings; Gate G8-0 may change a value only by updating the paired design/RED boundary tests before implementation:

| Boundary | Exact Core ceiling/default |
| --- | --- |
| DCR JSON body | 16 KiB UTF-8, object depth 4, 32 total properties, duplicate semantic keys rejected before JSON materialization |
| OAuth query/form body | 8 KiB UTF-8, 24 parameters, key 64 bytes, value 4,096 bytes, duplicate keys rejected |
| URI/client display | URI 2,048 bytes; client name 128 UTF-8 bytes; control characters forbidden |
| `state` / PKCE | state 8–1,024 bytes; verifier 43–128 RFC 7636 unreserved characters; S256 challenge exactly 43 unpadded base64url characters; S256 only |
| Token/header | Bearer/JWT 8 KiB; authorization header 8 KiB; one credential source only |
| DCR records | 16 approved + 32 unapproved per deployment; unapproved lifetime 24 hours |
| Pending authorization | 32 per deployment, 4 per client; lifetime 5 minutes |
| Browser/admin | pending ID 128 random bits; browser binding/bootstrap nonce 256 bits; 4 local admin sessions; 15-minute idle and 8-hour absolute admin expiry |
| Authorization code | 256 random bits; 60-second lifetime; one use |
| Access token | 10-minute lifetime; 60-second verification skew; ES256 only |
| Refresh family | 8 active per client, 64 per deployment; 90-day idle, 365-day absolute |
| Refresh envelope | 1-byte version, 128-bit random family handle, 64-bit generation, 256-bit nonce, 256-bit HMAC; 512-byte encoded-token ceiling |
| Signing keys | 1 active + at most 4 retained public JWKs; no retained previous private key |
| OAuth rate limits | DCR 20/hour deployment; authorize 120/15 min deployment and 20/15 min client; token 240/15 min deployment and 120/15 min client; revoke 60/15 min deployment and 20/15 min client |
| Public admission | 64 active + 128 queued requests per deployment; 16 active + 32 queued positions reserved for `/mcp`; overflow is bounded 429 with `Retry-After` and no identity oracle |
| Bearer verification | cheap length/ASCII/three-base64url-segment/decoded-header checks precede crypto; 8 ES256 verifications active + 32 queued; 2 active + 8 queued positions reserved for an exact previously validated keyed token fingerprint on an existing transport |
| Bearer abuse | 120 failed new-token validations/minute/deployment with burst 30; 256 keyed negative fingerprints retained for at most 60 seconds; exhaustion never evicts the reserved established-token path |
| Valid-token cache | 128 keyed fingerprints, never raw tokens; expires no later than token `exp`/key retirement/10 minutes; every hit still rechecks incarnation, current grant status/revision, resource/client/transport binding, and time |
| Authorization polling | page polls no faster than every 2.5 seconds; status 180/5 min per browser binding and 4,096/5 min per deployment; continue 4/5 min per binding and 256/5 min per deployment |
| Metadata/JWKS/root/health | pre-serialized by config/key revision; 32 active + 64 queued and 600/min/deployment; no per-request durable audit; cache headers are frozen per route |
| Invalid-event aggregation | 64 deployment/error-class buckets; first event plus one bounded summary per 5-minute window, never one durable write per hostile request |
| Audit | 8 KiB per auth event; existing configured retention defaults remain 30 days and 100 MiB closed segments |
| Recovery | 3 verified backups per state document and 64 MiB total auth quarantine; overflow blocks mutation and gives cleanup guidance |

The token limits include authorization-code exchange and refresh requests in the same fixed window. The per-client ceiling is sized above the observed ChatGPT refresh cadence while remaining bounded; it does not weaken refresh rotation, replay detection, or access-token lifetime. The process keeps only bounded, credential-free counters by grant type, HTTP status, and fixed internal reason. Pre-parse admission or deployment-limit rejections truthfully use the `unknown` grant type. Those counters are exposed only after authentication on the loopback local-admin status API, never by either unauthenticated health endpoint or the public listener, and contain no client, grant, token, request, or network identifier.

All byte limits use UTF-8 encoded bytes before normalization; percent decoding, Unicode normalization, content-type/charset validation, and duplicate detection occur under the same raw-input budget. Rate-limit responses do not reveal whether a client, token, or pending ID exists.

Because Cloudflare Tunnel makes the local socket peer uninformative, forwarded IP headers are never trusted for authentication or sole rate-limit identity. Rate limiting combines bounded global queues, safe client/grant/browser references only after they are authenticated, endpoint, and time. A cheap parser rejects oversized or structurally impossible Bearers before JSON/base64/JWK work. Positive/negative fingerprints use a separate process-random `bearer-cache-v1` HMAC key, are never persisted or logged, and disappear on restart. The positive cache is an optimization, not authority: a hit must still pass current durable grant/revision/incarnation and request-binding checks. The reserved established-token lane keeps an already connected legitimate user usable during a randomized invalid-signature flood; fresh-link work may be rate-limited but cannot cause unbounded CPU, memory, or disk growth. The SDK's loopback/IP limiter is disabled only after these project limits are active. Capacity errors remain fail-closed, non-oracular, and locally recoverable.

### 13.2 Audit events

The existing installation-wide MAC-chained persistent audit is the only writer and format. Phase 8 extends its event schema/filter/cursor compatibility; it does not create a deployment-local second log. Persistent audit records safe events such as:

- DCR accepted/rejected with safe reason and hashed client reference;
- authorization requested/approved/denied/expired;
- code exchanged/reused;
- access issued/invalid;
- refresh rotated/replayed/expired;
- grant revoked;
- key rotated;
- admin session created/expired;
- auth mode changed;
- OAuth startup/recovery failure.

Events include safe timestamps, owner/client/grant/token references, requested scopes, result, and rule IDs. They exclude raw tokens, codes, verifier/challenge, OAuth state, DPAPI blobs, private/public request bodies, query strings, cookies, local bootstrap nonces, and secret headers.

Every durable security transition—registration approval/removal, owner consent/denial, code consumption plus grant creation, refresh rotation/replay, revoke, scope revision, key/mode/recovery change, and admin-session creation—commits its MAC-chained audit event in the same logical transaction before success is reported. Audit-writer failure makes the mutation/issuance fail closed. Hostile unauthenticated rejects never perform one synchronous durable write each: the first safe error-class event and a bounded in-memory counter are flushed as one window summary. If that flush fails, a local `audit_unavailable` health fact is set and later security mutations fail closed, while hostile requests remain rejected without memory growth.

### 13.3 Redaction

Redaction tests cover:

- JWT-like strings;
- `Authorization` headers;
- `access_token`, `refresh_token`, `code`, `state`, `client_secret`, `code_verifier`, and bootstrap parameters;
- OAuth response bodies;
- URL query strings;
- DPAPI and JWK private members.

Request logs use route paths, not original URLs. OAuth token responses set no-store headers. Error messages are actionable but non-oracular.

## 14. Compatibility invariants

- V1/V2/V3/V4/V5 remain exact `28/31/39/51/52`.
- OAuth adds no MCP tool, execution profile, Provider authority, Git authority, workspace root, or path exception.
- STDIO behavior remains unchanged and does not require OAuth.
- Loopback-only no-token behavior remains available only under its existing explicit trusted-local boundary.
- Explicit legacy HTTP behavior remains byte-compatible until its separately approved retirement.
- Phase 6 guidance and Phase 7 semantic behavior inherit the same OAuth/policy boundary without special bypasses.
- `close_workspace` remains hidden from the read-only connection-test surface.
- Host and Origin checks stay local.
- Query credentials remain forbidden in OAuth mode even if a Bearer token is also present.
- Public startup never claims Cloudflare Access, mTLS, OS sandboxing, same-user isolation, or multi-user identity.

## 15. Acceptance gates

### G8-C — Configuration and metadata

- exact issuer/resource/endpoint derivation;
- exact root route inventory (`/authorize`, `/authorize/status/*`, `/authorize/continue/*`, `/token`, `/register`, `/revoke`, `/jwks`) and SDK mount order;
- explicit canonical root, one-hostname/one-profile registry, listener-config/deployment-identity separation;
- stable-host and dedicated owner-marked named-tunnel requirement;
- exact metadata documents and cache/content/security headers;
- read-only/read-write/full dynamic scope metadata with fixed DCR protocol ceiling;
- exact auth-mode source precedence/origin reporting, invalid-value rejection, and OAuth/query-token true-conflict rejection;
- exact Tool Contract counts and legacy descriptor fingerprints.

### G8-D — DCR and authorization

- only exact ChatGPT redirects;
- public client with no secret;
- PKCE `S256`, state, resource, scope, redirect, client, code expiry, and one-use enforcement;
- exact cookie-bound approved/denied/expired status and one-use continue browser-delivery path, including original state and RFC 9207 issuer;
- bounded provisional/approved registration state;
- public browser cannot approve;
- local owner approval/denial and expiry work.

### G8-T — Token lifecycle

- ES256 algorithm/key/issuer/audience/resource/time/scope/grant checks;
- access lifetime and skew boundaries;
- refresh rotation, replay-family revoke, idle/absolute expiry;
- authenticated opaque family/generation envelope detects any older generation without a periodic tombstone cap;
- one mutation coordinator for refresh/replay/expiry/scope/public/local/client/owner revoke, fixed lock order, post-lock authoritative reread/CAS, audit/state durable-before-response publication, and pinned credential/state authority;
- immediate grant and owner-wide revocation;
- safe signing-key rotation;
- backup restore/reinitialize preserves the stable binding but atomically publishes a new incarnation/key/pepper/epoch plus registry reference, inactivates grants, retains the same owned tunnel without remote mutation, and cannot revive pre-revoke access;
- no plaintext long-lived secret in profile/state/log/package.

### G8-I — Identity and policy

- every MCP HTTP request is verified;
- request-local identity cannot bleed across concurrent requests;
- session owner/client/resource binding survives token rotation and rejects cross-binding;
- OAuth scopes intersect deployment and policy scopes;
- V3/V4 configuration cannot append around a missing OAuth scope;
- deployment-disabled, token-missing, and operation-approval-missing outcomes are distinct and cannot create an unsatisfiable reauthorization loop;
- owner-bound change sets, approvals, worktrees, and Git facts remain stable across token refresh but stale after revocation/scope revision.

### G8-A — Admin separation

- public port has no setup/admin/approve/revoke/rotate route;
- local port is absent from tunnel ingress;
- bootstrap fragment, cookie, Origin/Host, CSRF, expiry, and same-user local control are enforced;
- waiting/admin CSP, no-framing, referrer, no-store, cookie, and no-third-party-asset contracts are exact;
- public Host spoofing cannot cross listeners;
- public health output contains no workspace or credential detail.

### G8-U — Real user experience

On a fresh ChatGPT developer-mode app:

1. run the exact source/global setup command for an explicit target root and paste a token-free Server URL;
2. ChatGPT discovers OAuth and registers;
3. owner receives one local approval;
4. read/write coding succeeds without URL secrets;
5. enabled execution either works under the original deployment scopes or triggers one clear reauthorization;
6. restart refreshes without approval;
7. local revoke stops the next call;
8. relink restores service, including after dropped-refresh-response or forced recovery reset;
9. `Scan Tools`/recreate guidance repairs cached pre-OAuth metadata;
10. quick/shared/unowned-tunnel setup fails early without mutation and gives the dedicated-tunnel command;
11. foreground/service rollback uses the retained Legacy App, and the exact idempotent `auth setup --root` command returns to the separate retained OAuth App.

Environment-blocked is not passed.

### G8-X — Local and exact-head closure

- all Phase 8 focused tests;
- inherited auth/Host/Origin/query-token and Policy/Approval/Audit tests;
- transaction/application-state/mutation-inventory tests;
- fixed-seed query/form/JSON/URI property/adversarial boundary tests;
- Windows DPAPI live tests with disposable credentials/state;
- managed Node 20/24 build, ordinary, and Smoke;
- package dry run and dependency/license/advisory review;
- current MCP Inspector or an exact synthetic protocol client;
- real ChatGPT live gate;
- three-way completed-runtime adversarial review and permanent regressions;
- exact-head Ubuntu/Windows Node 20/24 Repository policy, Build, Regression, Smoke, and Package.

STEP-470 satisfies the local source-checkout subset through focused tests, managed Node 20/24 build/ordinary/Smoke, package and dependency review, real G8-U evidence, and completed-runtime review. It does not satisfy the final exact-head matrix item; full G8-X and Phase 8 Core closure remain pending separately authorized publication and exact-head CI.

A green focused suite, a metadata curl, or a successful token exchange alone is not closure.

## 16. Rollout checkpoints

1. **Protocol skeleton:** metadata/config only; OAuth mode still fails unavailable.
2. **Secure state:** DPAPI keys and atomic grant store, no public activation.
3. **Runnable vertical slice:** root-route DCR -> local approve -> code -> token -> one authenticated read-only MCP call.
4. **Durable session:** refresh/restart/replay/revoke.
5. **Policy integration:** request-local identity, scopes, owner stability, full inherited tools.
6. **Operational UX:** setup/status/approve/revoke/rotate/rollback and split local UI.
7. **Tunnel/live:** named Cloudflare path and current ChatGPT.
8. **Adversarial repair and closure:** execution, security/compatibility, UX, full matrix, exact head.

Each checkpoint is independently fail-closed and reversible. No checkpoint may advertise a later guarantee.

## 17. Rejected alternatives

### 17.1 Keep the query token and improve warnings

Rejected because the reusable credential remains in the URL and therefore in the highest-leakage surfaces. Better copy does not change that fact.

### 17.2 Require a hosted identity provider

Rejected for Core because it violates the personal self-hosted direction and adds account, configuration, cost, and availability dependencies. It remains the correct recommendation if CodexGPT ever becomes multi-user.

### 17.3 Build passwords or passkeys into CodexGPT

Rejected because one owner already has a stronger and simpler local proof channel. Account recovery and credential-enrollment code would dominate Phase 8 without improving the target journey.

### 17.4 Put Approve on the public authorization page

Rejected because reaching the public page does not prove local ownership. It would let any remote caller authorize itself.

### 17.5 Use one HTTP listener with Host checks for admin

Rejected because the tunnel reaches that listener and Host/header behavior is not a physical routing boundary. A separate loopback port that is absent from ingress is simpler to reason about and test.

### 17.6 Accept legacy and OAuth credentials together

Rejected because it creates downgrade ambiguity, doubles route logic, complicates audit, and leaves the URL secret active. One restart is an acceptable rollback cost.

### 17.7 Use only self-contained JWT validation

Rejected because an unexpired JWT would survive local revoke. Every request also checks durable grant status and revision.

### 17.8 Store opaque access tokens only

Rejected for Core because the master plan requires signature/issuer/audience validation and signed tokens make exact resource-server checks testable. Durable grant checks still provide immediate revocation.

### 17.9 Implement CIMD before the first live path

Rejected for Core because the current SDK's production router does not provide the complete server path and a custom implementation introduces remote-fetch/SSRF/cache complexity. Constrained DCR is the smallest current implementation target and is subject to explicit live acceptance at Gate G8-U. CIMD remains a bounded later improvement.

### 17.10 Enable Cloudflare Access or claim mTLS

Rejected until the real ChatGPT-to-Cloudflare-to-loopback path proves interoperability and trustworthy evidence. OAuth remains mandatory either way.

## 18. Authoritative references

Implementation must re-read current versions at Gate G8-0:

- OpenAI Apps SDK authentication: <https://developers.openai.com/apps-sdk/build/auth>
- OpenAI connect from ChatGPT: <https://developers.openai.com/apps-sdk/deploy/connect-chatgpt>
- OpenAI testing: <https://developers.openai.com/apps-sdk/deploy/testing>
- OpenAI security and privacy: <https://developers.openai.com/apps-sdk/guides/security-privacy>
- MCP Authorization specification: <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>
- OAuth 2.0 Protected Resource Metadata, RFC 9728: <https://www.rfc-editor.org/rfc/rfc9728>
- OAuth 2.0 Authorization Server Metadata, RFC 8414: <https://www.rfc-editor.org/rfc/rfc8414>
- The OAuth 2.0 Authorization Framework, RFC 6749: <https://www.rfc-editor.org/rfc/rfc6749>
- OAuth 2.0 Authorization Server Issuer Identification, RFC 9207: <https://www.rfc-editor.org/rfc/rfc9207>
- OAuth 2.0 Resource Indicators, RFC 8707: <https://www.rfc-editor.org/rfc/rfc8707>
- Proof Key for Code Exchange, RFC 7636: <https://www.rfc-editor.org/rfc/rfc7636>
- OAuth 2.0 Bearer Token Usage, RFC 6750: <https://www.rfc-editor.org/rfc/rfc6750>
- OAuth 2.0 Token Revocation, RFC 7009: <https://www.rfc-editor.org/rfc/rfc7009>
- OAuth 2.0 Security Best Current Practice, RFC 9700: <https://www.rfc-editor.org/rfc/rfc9700>
- JWT Profile for OAuth Access Tokens, RFC 9068: <https://www.rfc-editor.org/rfc/rfc9068>
- Dynamic Client Registration, RFC 7591: <https://www.rfc-editor.org/rfc/rfc7591>

Current dependency evidence on 2026-07-26:

- manifest range `@modelcontextprotocol/sdk`: `^1.17.4`; installed/latest: `1.29.0`, MIT;
- installed transitive `jose`: `6.2.3`;
- current latest `jose`: `6.2.4`, MIT, no runtime dependencies reported by npm metadata.

Those observations are not an implementation-time pin. Gate G8-0 must audit and pin the exact authorized versions before changing package metadata.

## 19. Authorization boundary

The 2026-07-26 continuation request authorizes completion and review of this detailed design, its TDD plan, the `openai/codex` comparison, and project-record reconciliation only.

It does not authorize:

- Phase 8 runtime code;
- package/dependency changes;
- DPAPI helper implementation or real credential creation/migration;
- Cloudflare configuration or DNS/tunnel mutation;
- live external OAuth registration;
- staging, commit, push, publication, release, or deployment;
- deletion of query-token or OAuth state;
- Phase 8B CIMD/private-key-JWT/mTLS/Access work;
- Phase 9 or unrelated scope.

Runtime begins only after a fresh Gate G8-0 authorization and a reconciled clean base that contains Phase 7 Core closure head `a0b9f46e2297297959527f7570c9cb7942cc8fb3` plus the approved CI-optimization baseline `b4b041da32be7bfb133495fb30aa851d67d4f216`.
