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

- Package metadata is currently `codexgpt@0.28.6`; `main` contains unreleased changes that may be ahead of npm.
- Native Windows is a primary supported environment. WSL is not required. PowerShell is supported; Git Bash remains useful for Bash-oriented workflows.
- The default public tool contract remains V1. Contracts V2, V3, and V4 are explicit opt-in advanced surfaces.
- Phase 5, including typed local Git and managed task worktrees, closed on the full Ubuntu/Windows Node 20/24 validation matrix. Advanced features still retain their documented fail-closed and no-sandbox boundaries.

Check the npm badge before installing. Use a source checkout when you specifically need unreleased `main` behavior.

## Requirements

- Windows 10/11, macOS, or Linux
- Node.js 20 or newer
- Git for Git-aware workflows
- A ChatGPT account and model surface that exposes Apps / Developer Mode actions
- A public HTTPS route when ChatGPT Web must reach the local MCP server

For the preferred Windows path, install Node.js and Git for Windows. PowerShell is sufficient for normal setup; WSL is optional.

## Quick start

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

In ChatGPT, enable Developer Mode, then create a Plugin/App connection using a Server URL. UI labels can change, but the current flow is generally:

```text
Settings -> Security and login -> Developer mode: on
Settings -> Plugins / Apps -> Create
```

Use:

```text
Name: CodexGPT
Connection: Server URL
Server URL: paste the complete URL copied by CodexGPT
Authentication: No Authentication / None
```

Do not remove the `codexgpt_token` query string. The complete URL is password-equivalent and can leak through browser history, clipboard contents, screenshots, logs, or copied links.

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

### Phase 6 project guidance

Phase 6 project guidance is enabled by default. Start normally:

```powershell
codexgpt start
```

The first workspace-open result includes bounded root `AGENTS.md` instructions and an implicit-eligible workspace Skill catalog. Before the first mutation, ChatGPT calls `codex_context(target_path)` to load the exact root-to-target instruction chain and target-scoped `.agents/skills` catalog, then may load at most one matching Skill with the same returned `target_path`. Skill bodies and `references/`, `scripts/`, or `assets/` text remain lazy; nothing in a Skill executes automatically. User/plugin Skills remain excluded unless a tool call explicitly opts into global discovery.

An App created before the Phase 6 tool update may retain a frozen tool snapshot. Run **Scan Tools** once or recreate that App; transparent refresh is not claimed. The stable `codexgpt` supertool remains a compatibility path for `open` and `codex_context` when present in the cached snapshot. To roll back with the same binary, restart with:

```powershell
$env:CODEXGPT_GUIDANCE_MODE = "legacy"
codexgpt start
```

Run `codexgpt doctor` to see readiness, invalid metadata, collisions, and scan/catalog truncation. The omitted mode is now `standard`; explicit `legacy` remains the one-restart rollback path. Because `minimal` does not expose `codex_context`, omitted guidance with `--tool-mode minimal` uses the exact legacy compatibility projection; explicitly requesting `standard` with minimal fails at startup.

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
codexgpt doctor
codexgpt connection-test --root <repo>
codexgpt settings
codexgpt inspect --root <repo>
codexgpt review --root <repo>
```

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

## Security model

Default safety properties include:

- Public tunnel mode requires a CodexGPT HTTP token.
- The public CLI uses the complete query-token Server URL for personal ChatGPT compatibility.
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

Writable atomic V1 requires persistent terminal audit. A PowerShell example for exact V2 activation is:

```powershell
$env:CODEXGPT_TOOL_CONTRACT_VERSION = "2"
$env:CODEXGPT_FILE_TRANSACTIONS = "atomic"
$env:CODEXGPT_AUDIT_MODE = "required"
$env:CODEXGPT_AUDIT_RETENTION_DAYS = "30"
$env:CODEXGPT_AUDIT_RETENTION_BYTES = "104857600"
```

V3 and V4 require enforce-mode policy, persistent audit, atomic state, strict permission profiles, and local approval support. They do not provide an OS sandbox, credential isolation, or unrestricted remote Git commands.

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
