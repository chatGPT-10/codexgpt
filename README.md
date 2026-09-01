<p align="center">
  <img src="docs/favicon.svg" width="72" height="72" alt="CodexGPT logo">
</p>

<h1 align="center">CodexGPT</h1>

<p align="center">
  Windows-first, self-hosted MCP tools that connect ChatGPT to one local repository.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/codexgpt"><img alt="npm" src="https://img.shields.io/npm/v/codexgpt?style=flat-square"></a>
  <a href="https://github.com/chatGPT-10/codexgpt/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/chatGPT-10/codexgpt/ci.yml?branch=main&style=flat-square"></a>
  <a href="https://github.com/chatGPT-10/codexgpt/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/chatGPT-10/codexgpt?style=flat-square"></a>
  <a href="https://rebel0789.github.io/codexgpt/"><img alt="Website" src="https://img.shields.io/badge/site-GitHub%20Pages-67e8f9?style=flat-square"></a>
</p>

<p align="center">
  <a href="README_ZH.md">中文</a> ·
  <a href="DOMAIN_SETUP.md">Cloudflare domain setup</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="FAQ.md">FAQ</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

## What CodexGPT is

CodexGPT runs an MCP server on your machine and scopes it to a repository you choose. A compatible ChatGPT Developer Mode app can then inspect files, search code, make guarded edits, review Git changes, run bounded verification commands, and write handoff plans under `.ai-bridge`.

The intended deployment is fully self-hosted:

```text
ChatGPT
  -> HTTPS
mcp.example.com
  -> Cloudflare DNS / TLS / Tunnel
127.0.0.1:8787
  -> CodexGPT
  -> one local repository
```

Cloudflare is only the network edge. CodexGPT remains local, the origin port stays bound to loopback, and no third-party MCP relay is required.

CodexGPT is not a hosted coding service, model proxy, quota bypass, account pool, or operating-system sandbox. It is not an OS sandbox.

## Current project status

- The first stable release is `codexgpt@1.0.0`; the current npm patch release is `codexgpt@1.0.5`. Package metadata, runtime self-reporting, and npm `latest` must remain aligned; each release must also identify its exact source commit.
- Native Windows is a primary supported environment. WSL is not required. PowerShell is supported; Git Bash remains useful for Bash-oriented workflows.
- The default public tool contract remains V1. Contracts V2, V3, V4, and the explicit-standard Phase 7 Core V5 surface are advanced opt-ins.
- Phases 5, 6, and Phase 7 Core are closed on full Ubuntu/Windows Node 20/24 validation matrices. Phase 7 Core closed at `a0b9f46e2297297959527f7570c9cb7942cc8fb3` with exact-head CI run `30171313296`; Contract V5 remains an explicit `standard` opt-in rather than the default public contract.
- Phase 8 Tasks 8A1–8A9 are implemented and locally verified in the source checkout: Windows DPAPI CurrentUser state protection, separated public/local listeners, constrained DCR + PKCE S256, ES256 access tokens, rotating refresh families, durable revoke/replay, request-local policy identity, exact per-tool scopes, supported setup/administration/recovery, dedicated Tunnel ownership checks, migration/rollback documentation, package integration, synthetic end-to-end OAuth/MCP coverage, and completed-runtime adversarial repairs. Live Gate G8-U is accepted through Journeys U2–U7, and STEP-470 closed local G8-X with post-repair managed Node 20/24 ordinary and protected Smoke. U6 passed service/protocol rollback, a real recreated-Legacy-App read, exact no-argument OAuth restoration, and a real post-return OAuth App read; the deleted original Legacy App identity is explicitly not claimed as continuous. U7 proved fail-early byte-preserving refusal of shared/unowned Tunnel configs and the live public-loopback/local-admin boundary. Phase 8 exact-head closure passed at `55b2b5664aae322ec992968a41c87a289fb75282` in CI run `30274857996`; `1.0.0` packages this verified baseline.

The npm badge and package metadata should both report `1.0.5`. Use a source checkout for development, verification of a specific commit or branch, or changes not included in the npm package; check its package version and commit before relying on it.

For an existing source checkout, keep the public entry layer by using the repository scripts:

```powershell
Set-Location D:\Dev\codexgpt
npm install
npm run build
npm run connect:setup -- --root D:\Dev\your-repo
```

Daily start from that source checkout:

```powershell
npm run connect -- --root D:\Dev\your-repo
```

## Requirements

- Windows 10/11, macOS, or Linux for the legacy connector; Phase 8 Core OAuth setup currently requires native Windows
- Node.js 20 or newer
- Git for Git-aware workflows
- A ChatGPT account and plan/workspace surface that exposes custom Apps and Developer Mode
- A stable public HTTPS hostname when ChatGPT Web must reach the local MCP server

For the preferred Windows path, install Node.js and Git for Windows. PowerShell is sufficient for normal setup; WSL is optional.

## OAuth setup from one exact command

Use a separate OAuth App and retain the existing Legacy App until the live migration is accepted. OAuth setup is workspace-bound: every command must target the exact repository with `--root`.

Published global install:

```powershell
codexgpt auth setup `
  --root D:\Dev\your-repo `
  --hostname mcp.example.com `
  --tunnel-name codexgpt
```

Source checkout (development or branch-specific build):

```powershell
Set-Location D:\Dev\codexgpt
npm install
npm run build
node .\scripts\codexgpt-entry.mjs auth setup `
  --root D:\Dev\your-repo `
  --hostname mcp.example.com `
  --tunnel-name codexgpt
```

Setup requires a stable named Cloudflare Tunnel. It reuses only a dedicated Tunnel whose ownership marker matches this workspace/deployment, journals resumable phases, starts a candidate on separate loopback ports, and verifies public metadata, JWKS, and health before committing OAuth mode. Cloudflare/DNS changes are printed first and require explicit approval; use `--no-tunnel-changes` for a deterministic no-mutation preflight.

The ChatGPT Server URL is token-free:

```text
https://mcp.example.com/mcp
```

In ChatGPT Web, enable Developer Mode, create a custom App, paste that URL, choose OAuth when shown, run **Scan Tools**, and complete the browser flow. The first grant waits for explicit approval on the Windows PC:

```powershell
codexgpt auth pending --root D:\Dev\your-repo
codexgpt auth open --root D:\Dev\your-repo
# or approve the displayed correlation code:
codexgpt auth approve <correlation-code> --root D:\Dev\your-repo
```

Normal foreground restart keeps the same issuer, binding, Tunnel, clients, and refresh families:

```powershell
codexgpt start --root D:\Dev\your-repo
```

A pure scope change does not require **Scan Tools**. Enabling or removing a tool descriptor/capability requires an exact-root restart first; then use **Scan Tools** once if the App's tool snapshot changed. The old token never gains a newly enabled capability without reauthorization.

Operational commands:

```powershell
codexgpt auth status --root D:\Dev\your-repo
codexgpt auth clients --root D:\Dev\your-repo
codexgpt auth client remove <client-id> --root D:\Dev\your-repo
codexgpt auth revoke <grant-id> --root D:\Dev\your-repo
codexgpt auth rotate-signing-key --root D:\Dev\your-repo
codexgpt auth recover inspect --root D:\Dev\your-repo
```

Backup restore and `auth reinitialize --revoke-all` preserve the stable binding and dedicated Tunnel, publish a new incarnation/key authority, invalidate all old access/refresh credentials, and force relink. They never revive old grants. DPAPI protection is bound to the current Windows user profile; another user, a lost profile, or same-user malware is outside that protection boundary.

### Two-App rollback and return to OAuth

Do not delete the Legacy App or its credential during Phase 8 Core migration. To roll back, stop the foreground OAuth process, switch only the workspace profile, restart, and use the separately retained Legacy App:

```powershell
codexgpt auth rollback --root D:\Dev\your-repo
codexgpt start --root D:\Dev\your-repo
```

A service restart is not an automatic ChatGPT client rollback. The OAuth App is never given the legacy query-token URL, and OAuth state, keys, grants, clients, audit, Tunnel config, and owner marker are preserved.

Return idempotently to OAuth with the retained OAuth App:

```powershell
codexgpt auth setup --root D:\Dev\your-repo
```

The saved hostname, Tunnel, ports, and ownership marker are inferred; the candidate public surface is probed before OAuth mode is committed again. The profile keeps separate credential-free Legacy and OAuth routing selectors, so rollback switches the complete route rather than serving Legacy authentication on the OAuth hostname. Profiles created before this selector split fail closed and require one explicit retained-route migration; credentials are never copied into the route selectors.

If an environment override blocks the profile, remove it before restart:

```powershell
Remove-Item Env:CODEXGPT_AUTH_MODE -ErrorAction SilentlyContinue
[Environment]::SetEnvironmentVariable('CODEXGPT_AUTH_MODE', $null, 'User')
```

The public listener defaults to `127.0.0.1:8787`; local owner administration defaults to the separate `127.0.0.1:8788` and must never be routed through Cloudflare. Quick Tunnels are unsuitable because their hostname changes. Static Bearer configuration for ChatGPT, Cloudflare Access, mTLS, multi-owner tenancy, and OS isolation are not claimed.

Current OpenAI guidance says custom Apps are configured from ChatGPT Web through Apps/Developer Mode and tool metadata is refreshed through **Scan Tools**; availability depends on plan/workspace. It also recommends refresh-token support and, for OIDC providers, advertising `offline_access`. CodexGPT is an OAuth authorization server rather than an OIDC provider and issues rotating refresh tokens. Journeys U2–U4 passed DCR/linking, local approval, scoped reauthorization, descriptor refresh, post-restart refresh continuity, and local revoke/relink. Journey U5 passed live denial, replay, bounded-admission, environment-override, and verified-backup recovery; recovery remains an intentional security reset that preserves the stable binding/hostname/Tunnel while invalidating every prior client/grant/token authority. U6 passed the separate-route Legacy/OAuth round-trip, exact OAuth schemes, query-token denial, a recreated Legacy App read, exact OAuth return, and a post-return read through the existing OAuth App; continuity of the deleted original Legacy App identity is not claimed. U7 passed fail-early byte-preserving refusal of shared/unowned Tunnel configs and the live public-loopback/local-admin boundary. Gate G8-U, local G8-X, and exact-head Ubuntu/Windows Node 20/24 CI are complete at `55b2b5664aae322ec992968a41c87a289fb75282` / run `30274857996`.

## Legacy compatibility quick start (query-token)

### 1. Install the CLI

```powershell
npm install -g codexgpt
codexgpt --version
```

### 2. Run guided setup inside the target repository

```powershell
Set-Location D:\Dev\your-repo
codexgpt setup
```

Setup saves a per-workspace profile and attempts to copy the complete Server URL containing a `codexgpt_token` query credential. Startup logs keep that secret URL hidden; press `u` in the CodexGPT terminal only when you explicitly need to display it.

### 3. Create the ChatGPT connection

Open ChatGPT's current Apps/Plugins connection-management page. If the UI offers Developer Mode, enable it; labels can change, but the flow is generally:

```text
Settings -> Plugins / Apps -> + / Create
```

Use:

```text
Name: CodexGPT
Connection: Server URL
Server URL: paste the complete URL copied by CodexGPT
Authentication: No Authentication / None (if shown)
```

Do not remove the `codexgpt_token` query string from this retained Legacy App. The complete URL is password-equivalent and can leak through browser history, clipboard contents, screenshots, logs, or copied links. The source-checkout OAuth path described earlier has separate live G8-U evidence and uses a different retained App with a token-free URL; do not mix the two modes or substitute manual static-Bearer settings.

### 4. Daily start

From the same repository:

```powershell
codexgpt start
```

Keep the CodexGPT process running while ChatGPT uses the connection.

## Recommended stable setup: your domain + Cloudflare Tunnel

Use a named Cloudflare Tunnel for a stable hostname such as `mcp.example.com`.

One-time setup:

```powershell
codexgpt install-cloudflared
cloudflared tunnel login
cloudflared tunnel create codexgpt
cloudflared tunnel route dns codexgpt mcp.example.com
```

Start CodexGPT with the named tunnel:

```powershell
codexgpt stable `
  --root D:\Dev\your-repo `
  --hostname mcp.example.com `
  --tunnel-name codexgpt `
  --token <long-random-codexgpt-token> `
  --bash safe
```

This keeps the local listener on `127.0.0.1:8787`; `cloudflared` makes an outbound tunnel connection. Do not open port 8787 on the router or Windows Firewall.

For an exact Windows configuration file, token separation, ingress validation, rotation, and Host-header/DNS-rebinding controls, read [DOMAIN_SETUP.md](DOMAIN_SETUP.md).

## Common operating modes

### Normal coding

```powershell
codexgpt start
```

The standard surface supports repository reads, search, scoped writes/edits, guarded patches, Git review, and safe verification.

For an ordinary code-location request, use `semantic` with `operation: "navigate"` (or V5 `codexgpt` with `action: "navigate_code"`; its `args` need only the intent/query fields). The server routes `definition`, `references`, `implementation`, `text`, `file`, and `diagnostics` intent across the owned semantic provider, bounded lexical search, and file discovery. Use raw `tree` only when you specifically need hierarchy and raw `search` only when you specifically need lexical occurrences. Mutation and process boundaries remain separate: `write` replaces a whole file, `edit` performs one exact replacement, `apply_patch` coordinates multiple locations, `run_command` performs finite verification, and full-mode `start_process` owns persistent or interactive work. Selection guidance grants no authority and bypasses no approval.

### Phase 6 project guidance

Phase 6 project guidance is enabled by default. Start normally:

```powershell
codexgpt start
```

The first `open_current_workspace` or `open_workspace` call now returns a bounded `context_snapshot`: workspace/platform identity; detected root manifests and languages; package manager plus build/test/lint/typecheck commands with exact `source` and `confirmed|inferred` confidence; a compact Git summary; instruction paths and Skill metadata; and semantic/persistent-process availability. The snapshot is capped at 12,000 serialized characters, reports any omitted metadata, and keeps `open_workspace` tree discovery off unless explicitly requested. This gives ChatGPT enough bootstrap information for the first useful code action without a routine `tree` + `package.json` + `AGENTS.md` + `git_status` preamble.

The bounded text projection and `context_snapshot` contain no instruction or Skill body; the standard structured compatibility fields remain available to existing clients. Before a target-specific mutation, ChatGPT may call `codex_context(target_path)` for the exact root-to-target instruction chain, then load at most one matching Skill with `load_skill`; `tree` and `git_diff` are also lazy detail tools. Skill bodies and `references/`, `scripts/`, or `assets/` text remain lazy and never execute automatically. User/plugin Skills remain excluded unless a call explicitly opts into global discovery. To deliberately load a configured user Skill, call `load_skill` with `source: "user"` and either its `name` or its displayed selector such as `$CODEX_DIR/skills/neat-freak/SKILL.md`; this read is limited to configured user-Skill roots and does not add a workspace root or change `--allow-root`.

An App created before the Phase 6 tool update may retain a frozen tool snapshot. Run **Scan Tools** once or recreate that App; transparent refresh is not claimed. The stable `codexgpt` supertool remains a compatibility path for `open` and `codex_context` when present in the cached snapshot. To roll back with the same binary, restart with:

```powershell
$env:CODEXGPT_GUIDANCE_MODE = "legacy"
codexgpt start
```

Run `codexgpt doctor` to see readiness, invalid metadata, collisions, and scan/catalog truncation. The omitted mode is now `standard`; explicit `legacy` remains the one-restart rollback path. Because `minimal` does not expose `codex_context`, omitted guidance with `--tool-mode minimal` uses the exact legacy compatibility projection; explicitly requesting `standard` with minimal fails at startup.

### Phase 7 Core semantic navigation

Phase 7 Core adds an explicit-standard Contract V5 with one zero-setup `semantic` tool for JavaScript and TypeScript. It supports `definition`, `references`, one-file `diagnostics`, and `rename_preview`. A symbol locator may omit the path only when the symbol resolves uniquely; ambiguous names return bounded candidates instead of guessing. Results use workspace-relative paths and report `actual_provider` plus `result_quality` so lexical fallback is never presented as semantic certainty.

P3 adds the compatible high-level `navigate` operation without adding a 53rd direct tool or changing the exact V1-V5 counts `28/31/39/51/52`. Every normalized match reports the actual `provider`, `quality`, `fallback`, and `truncated` state. TypeScript definitions/references use the owned semantic provider; Python or unavailable/crashed/stale semantic requests degrade to freshly bounded lexical evidence labelled `lexical_fallback`; text and filename discovery route directly to their appropriate lexical backend; diagnostics never invent a lexical substitute. Existing `definition`, `references`, `diagnostics`, and `rename_preview` calls remain unchanged.

P4 closes the mutation loop without adding a direct tool. A committed V5 `write`, `edit`, `apply_patch`, `move_paths`, or `undo_change_set` result includes `data.workflow`: the exact change set, changed paths, current confirmed project checks, and pending diff review. Nothing runs automatically. When Contract V5, the `codexgpt` wrapper, and an eligible `full_access` execution profile are available, explicitly call `codexgpt(action="verify_change")` with only the returned check categories; the server re-resolves current confirmed P2 commands and invokes the existing Policy/approval/audit-protected `run_command` path. This does not require full tool mode: standard tool mode already exposes the finite `run_command` path, while the execution profile and local approval still govern whether it can run. Then call `show_changes` with the same `change_set_id`, `include_diff=true`, and `mark_reviewed=true`. The returned checklist requires inspecting the full diff for unexpected files, formatting, generated artifacts, dependency changes, and accidental deletion; it does not claim heuristic automatic approval. The workflow is `complete` after terminal verification plus whole-workspace diff inspection, and `ready` only when verification passed. V1-V4 remain exact, and V5 still has 52 direct tools.

P5 completes the local long-task/process experience without adding tools or authority. V5 process successes use the shared lifecycle `starting | running | exited | failed | terminated`; `state` is canonical and the retained `status` field is an equal compatibility alias. `list_processes` can truthfully show `starting` while backend start and required start audit are incomplete, but `start_process` returns only after `running`. Startup revocation, workspace/transport close, expiry, explicit termination, and server shutdown join the owned process lifecycle and Job-tree cleanup. V3/V4 wire shapes remain exact.

An existing V5 App with the stable open-schema `codexgpt` wrapper can use `action: "navigate_code"` immediately after the server update. Calling `semantic(operation="navigate")` directly requires one separately authorized **Scan Tools** refresh or App recreation so ChatGPT receives the additive descriptor fields; this repository change does not perform that refresh.

Enable the builtin engine for this workspace, restart, then run **Scan Tools** once in an existing 51-tool ChatGPT App or recreate the App:

```powershell
codexgpt semantic use builtin
codexgpt start
```

Inspect health and bounded worker facts locally:

```powershell
codexgpt semantic status
codexgpt semantic status --verbose
```

A rename is two distinct operations. `semantic` with `rename_preview` creates a complete, hash- and identity-bound in-memory plan without writing files. V5 `apply_patch` consumes its opaque `semantic_preview_id` once and applies the whole batch through the existing approval, atomic transaction, audit, change-set, review, and undo path. A preview is not approval, and a Provider never gains workspace or mutation authority.

Rollback is one restart and leaves ordinary read/search/edit tools unchanged:

```powershell
codexgpt semantic disable
codexgpt start
```

The builtin worker runs as the current user and is not an execution, filesystem, credential, or network sandbox. Serena and direct LSP Providers are unimplemented post-Core extensions and are not bundled or installed by this feature.

Disable all ChatGPT-triggered shell commands:

```powershell
codexgpt start --no-bash
```

Require Bash calls to target this exact local server label:

```powershell
codexgpt start --bash-session main --require-bash-session
```

### Handoff mode

ChatGPT writes a plan but does not directly edit source files:

```powershell
codexgpt start --mode handoff --no-bash
```

The plan is stored at `.ai-bridge/current-plan.md`. Execute it locally only after review:

```powershell
codexgpt execute-handoff --agent codex --dry-run
codexgpt execute-handoff --agent codex --yes
```

Remote MCP tools do not directly launch Codex, OpenCode, Pi, or arbitrary local agents.

### Pro/context fallback

For a model surface that cannot call MCP tools:

```powershell
codexgpt pro-bundle --root D:\Dev\your-repo --copy
```

This writes `.ai-bridge/pro-context.md`, which can be supplied to a planning-only model. Apply a reviewed plan with:

```powershell
codexgpt pro-apply --root D:\Dev\your-repo --file plan.md
```

### Read-only connection diagnostics

```powershell
codexgpt connection-test --root D:\Dev\your-repo
```

This keeps the read/search surface, disables writes and Bash, and logs whether requests reach the local MCP endpoint.

## Main commands

```text
codexgpt setup
codexgpt start
codexgpt stable --hostname mcp.example.com --tunnel-name codexgpt
codexgpt doctor [--json]
codexgpt semantic status --verbose
codexgpt semantic use builtin
codexgpt semantic disable
codexgpt connection-test --root <repo>
codexgpt settings
codexgpt config explain [auth.mode] --root <repo> [--json]
codexgpt inspect --root <repo>
codexgpt review --root <repo>
```

`config explain` is read-only: it resolves the same startup plan without starting a server, probing a port, or creating a profile. Text output shows why each public input won and the safe restart command; `--json` also returns the complete effective runtime snapshot. Secret values are always represented only as `set` or `missing`, including overridden token sources.

`doctor --json` returns machine-readable diagnostics and embeds that exact same secret-redacted `config explain` document under `configuration`; the supported public CLI also adds its Bash, saved-profile, and OAuth wrapper checks. `ok` is false and the command exits non-zero when any structured check has status `fail`.

The compatibility variable `CODEBASE_BRIDGE_HTTP_TOKEN` remains readable for the migration window. When it is the selected token source, `config explain` and `doctor` emit `CONFIG_COMPATIBILITY_INPUT` with a secret-free PowerShell migration command to `CODEXGPT_HTTP_TOKEN`; the configured token itself is never included. A selected canonical source produces no compatibility warning.

The compatibility variable `CODEBASE_BRIDGE_REPO_ROOT` also remains readable for the migration window. The supported public entry uses it for workspace and saved-profile selection only when neither `--root` nor `CODEXGPT_ROOT` is present. `config explain` and `doctor` preserve that source and return the value-free PowerShell migration command `$env:CODEXGPT_ROOT = $env:CODEBASE_BRIDGE_REPO_ROOT; Remove-Item Env:CODEBASE_BRIDGE_REPO_ROOT`; the selected canonical or CLI root produces no compatibility warning.

`CODEXGPT_HOSTNAME` remains a value-equivalent compatibility input for `CODEXGPT_PUBLIC_HOSTNAME`. When selected, the public entry preserves its original source while keeping the effective hostname and public fingerprint unchanged; `config explain` and `doctor` return `$env:CODEXGPT_PUBLIC_HOSTNAME = $env:CODEXGPT_HOSTNAME; Remove-Item Env:CODEXGPT_HOSTNAME` without embedding the hostname value. `--hostname`, `--url`, or `CODEXGPT_PUBLIC_HOSTNAME` still wins without a compatibility warning.

`NGROK_DOMAIN` remains value-equivalent to `CODEXGPT_PUBLIC_HOSTNAME`, including outside ngrok mode. The public entry now preserves that original source, and `config explain` plus the configuration inside `doctor --json` classify it as mode-ambiguous: its name says ngrok, but its established effective scope is all tunnel modes. No removal or migration warning is scheduled in this step; use `CODEXGPT_PUBLIC_HOSTNAME` for new configuration. CLI, canonical, and `CODEXGPT_HOSTNAME` inputs retain their existing precedence.

Useful surface controls:

```text
--no-bash
--tool-mode minimal
--tool-mode standard
--tool-mode full
--mode handoff
--mode pro
--tunnel none
```

## Workspace sessions

`workspace_id` is a random opaque capability handle, not a repository-path hash. In OAuth mode, configured-root handles are owned by one running deployment runtime and can be explicitly reused across ChatGPT Web MCP transport rotation only for the same deployment incarnation, owner, OAuth client, grant/revision, resource, and policy revision. A copied handle from another principal fails with the same bounded unavailable result and cannot close or extend the legitimate capability.

`close_workspace` invalidates a handle immediately. Idle handles expire according to `CODEXGPT_WORKSPACE_TTL_MS`; when unset, the timeout follows `CODEXGPT_HTTP_SESSION_TTL_MS` (normally 30 minutes), and successful use refreshes the idle deadline. Restarting the OAuth runtime/service clears configured-root capabilities, while a normal access-token refresh inside the same grant does not change their authority.

Legacy/query-token HTTP and STDIO keep their historical session/process-local behavior. During the compatibility period, omitting `workspace_id` can select only the current server session's configured default root. In OAuth mode, after explicitly opening a non-default root, keep passing the returned `workspace_id`; an unresolved explicit handle never falls back to the default workspace. `CODEXGPT_OAUTH_WORKSPACE_CAPABILITY_MODE=session_local` temporarily restores the old OAuth lifecycle.

## Security model

Default safety properties include:

- OAuth public mode requires a valid OAuth grant and uses a token-free ChatGPT Server URL.
- The retained Legacy public CLI uses the complete query-token Server URL for personal ChatGPT compatibility; treat that URL as password-equivalent.
- The local HTTP listener defaults to `127.0.0.1`.
- Generic source writes are exposed only in workspace write mode.
- Safe Bash blocks broad shell patterns and sensitive/build/cache paths.
- `.env`, private keys, `.git`, dependency trees, generated directories, path escapes, and symlink escapes are guarded.
- Token-like values are redacted from supported status and log surfaces.
- Contract V3 `full_access` and Contract V4 integration execution are ambient current-user authority, not isolation.

Use `--no-bash` for untrusted repositories. Review [SECURITY.md](SECURITY.md) before exposing CodexGPT through any tunnel or enabling advanced contracts.

## Advanced contracts

The default path is intentionally simpler. Advanced versions are explicit:

- **V1**: the default contract defines exactly 28 child tools.
- **V2**: atomic transactions, durable audit, move/undo, and bounded audit queries. Explicit contract V2 activation requires atomic transactions and persistent audit and defines exactly 31 child tools.
- **V3**: trusted-code Windows process execution and confirmed-root admission with separate local one-use approvals.
- **V4**: typed local Git operations and owner-bound managed task worktrees.
- **V5**: exact V4 inheritance plus one read-only `semantic` tool in explicit `standard` mode. The builtin TypeScript engine can create a rename preview, while only V5 `apply_patch` may consume `semantic_preview_id` through the existing atomic mutation path.

Writable atomic V1 requires persistent terminal audit. A PowerShell example for exact V2 activation is:

```powershell
$env:CODEXGPT_TOOL_CONTRACT_VERSION = "2"
$env:CODEXGPT_FILE_TRANSACTIONS = "atomic"
$env:CODEXGPT_AUDIT_MODE = "required"
$env:CODEXGPT_AUDIT_RETENTION_DAYS = "30"
$env:CODEXGPT_AUDIT_RETENTION_BYTES = "104857600"
```

V3 and V4 require enforce-mode policy, persistent audit, atomic state, strict permission profiles, and local approval support. They do not provide an OS sandbox, credential isolation, or unrestricted remote Git commands.

For V3–V5 process work, choose by workload lifetime:

- Use `run_command` only for one bounded command expected to exit, such as tests, builds, lint, or typecheck. Standard tool mode exposes this finite path; never use it to keep a server, watcher, or REPL alive.
- Use `start_process` for a dev server, watcher, or interactive REPL. It is available only in full tool mode. On Windows, choose ConPTY when terminal interaction is required, pass every non-null `next_cursor` to `read_process_output`, and call `terminate_process` when the owned process is no longer needed.

Both paths use `full_access` ambient current-user authority and are not sandboxes. A positive `read_process_output.wait_ms` can wait for output or lifecycle finalization for at most 30 seconds; terminal records return immediately once `eof=true`.

In V5 results, read `state` as the lifecycle source of truth; `status` is retained only as an equal migration alias. `list_processes` may briefly report `starting`, while `start_process` itself succeeds only with `running`. Reuse each non-null `output.next_cursor` as the next call's `cursor`; `max_bytes` bounds each page, and output is not replayed from the beginning unless the cursor is omitted.

Managed task worktrees preserve the branch, commits, and private stashes for recovery. Merge preparation is typed and bounded; it does not merge into the primary worktree automatically. External Git processes and unrelated Git processes can still race with CodexGPT because workflow isolation is not process or credential isolation.

See [SECURITY.md](SECURITY.md) for the exact boundaries.

## Token rotation

To rotate the CodexGPT MCP token:

1. Stop CodexGPT.
2. Start it with a new long random value passed to `--token`.
3. Replace the complete Server URL in ChatGPT, including the new `codexgpt_token` query string.
4. Remove old URLs from notes, screenshots, shell history, and password managers where applicable.

The Cloudflare Tunnel credential and the CodexGPT MCP token are different secrets. Rotating one does not rotate the other.

## Troubleshooting

Run the preflight first:

```powershell
codexgpt doctor
```

Common cases:

- **Quick-tunnel URL changed:** restart CodexGPT and replace the ChatGPT Server URL.
- **Stable hostname does not respond:** verify the named tunnel and DNS route, then confirm the app still uses the complete tokenized URL.
- **One ChatGPT model cannot call tools:** use a model/chat surface that supports Developer Mode app actions, or use `pro-bundle`.
- **Port 8787 is busy:** use another port, for example `--port 8788`, and update the tunnel origin.
- **Tool list is stale:** recreate the ChatGPT connection or rotate the token and replace the complete Server URL.

## Development

```powershell
npm install
npm run build
npm run smoke
npm run stress
```

Use cleanup-backed focused tests and local tasks:

```powershell
npm run test:focused -- test/example.test.mjs
npm run task:run -- node scripts/example.mjs
npm run task:cleanup
```

Release checks:

```powershell
npm run policy:check
npm run build
npm run smoke
npm audit --audit-level=high
npm pack --dry-run
git diff --check
```

## Documentation

- [Website](https://rebel0789.github.io/codexgpt/)
- [Chinese README](README_ZH.md)
- [Cloudflare domain setup](DOMAIN_SETUP.md)
- [Security policy](SECURITY.md)
- [FAQ](FAQ.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
