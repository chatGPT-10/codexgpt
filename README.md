<p align="center">
  <img src="docs/favicon.svg" width="72" height="72" alt="CodexPro logo">
</p>

<h1 align="center">CodexPro</h1>

<p align="center">
  Local coding tools for ChatGPT, scoped to one repo.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/codexpro"><img alt="npm" src="https://img.shields.io/npm/v/codexpro?style=flat-square"></a>
  <a href="https://github.com/chatGPT-10/codexgpt/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/chatGPT-10/codexgpt/ci.yml?branch=main&style=flat-square"></a>
  <a href="https://github.com/chatGPT-10/codexgpt/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/chatGPT-10/codexgpt?style=flat-square"></a>
  <a href="https://rebel0789.github.io/codexpro/"><img alt="Website" src="https://img.shields.io/badge/site-GitHub%20Pages-67e8f9?style=flat-square"></a>
</p>

## Install

Requirements:

- Node.js 20+
- A ChatGPT account with Apps / Developer Mode access
- One HTTPS route to your local machine when connecting ChatGPT from the web

Install the CLI:

```bash
npm install -g codexpro
```

Run setup inside the repo you want ChatGPT to work on:

```bash
cd /path/to/your/repo
codexpro setup
```

CodexPro prints and copies a Server URL that contains a `codexpro_token` query credential. In ChatGPT, open:

```text
Settings -> Security and login -> Developer mode: on
Settings -> Plugins -> Create
```

Paste the complete copied Server URL, including its query string, and choose `Authentication: No Authentication / None`. This is the supported personal ChatGPT query-token compatibility flow; OAuth 2.1 remains deferred.

Treat the complete URL as a password-equivalent secret. It can leak through browser history, clipboard contents, screenshots, logs, and copied links. Do not share, publish, or commit it.

Daily use from the same repo:

```bash
codexpro start
```

## What It Does

CodexPro starts a local MCP server for the current workspace. ChatGPT can then:

- read files and inspect the repo
- search code
- make scoped edits with `write`, `edit`, or guarded `apply_patch`
- run safe verification commands through `bash`
- review changed files with `show_changes`
- write handoff plans under `.ai-bridge`
- export a selected context bundle for model surfaces that cannot call tools

CodexPro is not a hosted service, model proxy, quota bypass, account pool, or OS sandbox.
It connects your own ChatGPT session to your own local repo through the official Developer Mode / MCP app path.

## Repository Analysis

CodexPro builds a bounded repository map from local manifests, source declarations, imports, tests, and Git state. It provides:

- `inspect_workspace` for languages, project types, entrypoints, areas, symbols, and relationships
- optional structured `search` intents: `text`, `symbol`, `references`, and `impact`
- affected-area, risk, related-test, and focused-command recommendations in `show_changes`
- matching read-only terminal views:

```bash
codexpro inspect --root /path/to/repo
codexpro review --root /path/to/repo
codexpro inspect --root /path/to/repo --json
```

The analysis is deterministic and local. It uses confidence labels instead of claiming compiler precision, stays within configured file/byte/symbol limits, and falls back to normal lexical search and Git review when analysis is incomplete.

Set `CODEXPRO_ANALYSIS=0` to disable repository analysis without changing the rest of the connector.

## Normal Commands

```bash
codexpro setup
codexpro start
codexpro start --root /path/to/repo
codexpro doctor
codexpro connection-test --root /path/to/repo
codexpro settings
codexpro inspect
codexpro review
```

Useful modes:

```bash
codexpro start --no-bash
codexpro start --tool-mode minimal
codexpro start --tool-mode full
codexpro start --mode handoff
codexpro start --mode pro
```

If ChatGPT cannot create the plugin, run `codexpro connection-test`. It keeps
the normal read, tree, search, and skill tools, disables writes, bash, and tool
cards, and logs whether a request reached the local MCP endpoint.

Tool cards are opt in:

```bash
CODEXPRO_TOOL_CARDS=1 codexpro start
```

## Public URL Options

ChatGPT web needs a public HTTPS Server URL. CodexPro supports:

- Fast demo URL: `codexpro start --tunnel cloudflare`
- Stable ngrok domain: `codexpro ngrok --hostname your-domain.ngrok-free.dev`
- Stable Cloudflare route: `codexpro stable --hostname codexpro.example.com --tunnel-name codexpro`
- Tailscale Funnel: `codexpro tailscale --hostname your-device.your-tailnet.ts.net`
- Local only: `codexpro start --tunnel none`

Cloudflare quick tunnels honor `HTTPS_PROXY`, `ALL_PROXY`, or `HTTP_PROXY` when those env vars are set.

Stable modes should use a stable CodexPro token:

```bash
codexpro tailscale \
  --hostname your-device.your-tailnet.ts.net \
  --token keep-this-token-stable
```

Tailscale Funnel must already be allowed for your tailnet. It requires MagicDNS, HTTPS certificates, and Funnel policy support. CodexPro runs:

```bash
tailscale funnel http://127.0.0.1:8787
```

Then use the complete Server URL copied by CodexPro. It includes the `codexpro_token` query credential; do not remove the query string. In ChatGPT choose `Authentication: No Authentication / None`.

## Policy Kernel Migration

Phase 2A adds a local Policy Kernel with three explicit rollout modes:

- `CODEXPRO_POLICY_ENGINE=legacy` is the migration-cycle default and preserves the existing execution path.
- `CODEXPRO_POLICY_ENGINE=shadow` executes the legacy path while producing only redacted comparison facts.
- `CODEXPRO_POLICY_ENGINE=enforce` makes the compiled Policy Kernel authoritative and fails closed when policy, identity, approval, or enforcement facts are unavailable.

An optional `CODEXPRO_PERMISSION_PROFILE=<id>` selects a strict JSON document at `~/.codexpro/permissions/<id>.json`. Runtime profiles and Permission Profiles are separate: `toolMode` controls discovery only, while filesystem, Git, Shell, Process, and Network ceilings come from identity scopes, hard policy, the selected Permission Profile, bounded session grants, and demonstrated enforcement capabilities.

Contracts V1 and V2 intentionally retain their original behavior and never create pending approvals. Explicit Contract V3 adds a local-only approval CLI for confirmed roots and trusted-code process execution; it does not expose an MCP approval tool and does not treat the remote client as proof of a human decision. Safe Bash remains a command filter rather than an OS sandbox. Cloudflare Tunnel protects inbound routing; it does not enforce local authorization or outbound network access.

Rollback during the migration cycle is limited to the reviewed `legacy` behavior, the generated compatibility profile, or a narrower read-only profile. Policy-loading failure never falls through to unguarded execution.

## Atomic Transactions and Persistent Audit

Phase 3 connects the transaction, change-set, persistent-audit, recovery, and move backends to the real HTTP and STDIO server lifecycle:

- `CODEXPRO_FILE_TRANSACTIONS=legacy|atomic`; `legacy` remains the compatibility default. With `atomic`, supported workspace writers prepare one guarded transaction and never fall back to a direct write.
- Writable atomic V1 requires persistent terminal audit, and the same requirement applies to explicit V2. `CODEXPRO_AUDIT_MODE=off` is rejected; audit or participant failure reconciles or rolls the visible file changes back instead of returning an unaudited success.
- `CODEXPRO_AUDIT_MODE=auto|off|best_effort|required`; `auto` is the default, and `off` is also rejected with Policy `enforce`.
- `CODEXPRO_AUDIT_RETENTION_DAYS` defaults to 30 days and `CODEXPRO_AUDIT_RETENTION_BYTES` defaults to 100 MiB for closed segments.
- Audit, authenticated change-set, and transaction state stay outside workspaces and Git. They exclude raw file contents, complete diffs, command output, credentials, and canonical workspace roots.

Contract V1 remains the default exact 28-tool public surface. Explicit contract V2 (`CODEXPRO_TOOL_CONTRACT_VERSION=2`) requires atomic transactions and persistent audit and defines exactly 31 child tools. Standard/full mode adds `move_paths` and `undo_change_set`; full mode also adds `query_audit_events`. Minimal and connection-test surfaces expose none of the three additions. `move_paths` is limited to 64 hash-guarded ordinary files inside one workspace and one volume, never overwrites an unrelated target, and treats preview as validation rather than a promise that the later hard-link operation will succeed. See [SECURITY.md](SECURITY.md) for recovery, integrity, retention, owner-binding, undo, and trust-boundary details.

## Trusted-Code Windows Execution (Contract V3)

Contract V3 is opt-in and defines exactly 39 tools: it inherits the non-`bash` V2 surface and adds `open_full_access_workspace`, `run_command`, `start_process`, and six typed process-management tools. It requires atomic transactions, durable audit, Policy Kernel `enforce`, a stable session identity, and the local approval runtime.

A minimal Windows PowerShell activation for a trusted repository is:

```powershell
$env:CODEXPRO_FILE_TRANSACTIONS = "atomic"
$env:CODEXPRO_AUDIT_MODE = "required"
$env:CODEXPRO_POLICY_ENGINE = "enforce"
$env:CODEXPRO_TOOL_CONTRACT_VERSION = "3"
$env:CODEXPRO_TOOL_MODE = "full"
$env:CODEXPRO_PERMISSION_PROFILE = "trusted-local"
$env:CODEXPRO_EXECUTION_PROFILE = "full_access"
$env:CODEXPRO_LOCAL_FILE_ACCESS = "confirmed_roots" # optional
codexpro start --root D:\Dev\your-repo --write workspace --bash off
```

Create `%USERPROFILE%\.codexpro\permissions\trusted-local.json` first. The following profile explicitly acknowledges ambient current-user authority; replace the root with an exact directory you intend to use:

```json
{
  "schemaVersion": 3,
  "id": "trusted-local",
  "description": "Trusted repositories on this Windows account",
  "workspaceRoots": ["D:\\Dev\\your-repo"],
  "shell": { "mode": "execute", "requireSandbox": false },
  "process": { "manage": true, "persistent": true, "requireSandbox": false },
  "network": {
    "enabled": true,
    "rules": [],
    "allowLoopback": true,
    "allowPrivate": true,
    "allowLinkLocal": true,
    "requireEnforcement": false
  },
  "fullAccess": {
    "ambientFilesystem": true,
    "ambientCredentials": true,
    "ambientRegistry": true,
    "unrestrictedNetwork": true,
    "requireBlockedPathEnforcement": false,
    "requireCredentialIsolation": false,
    "requireRegistryIsolation": false,
    "requireDeviceIsolation": false,
    "requireNetworkEnforcement": false,
    "requireSandbox": false
  }
}
```

When ChatGPT requests a V3 R3 action, CodexPro returns an approval ID and local server ID. Review and approve it from a separate local terminal, then retry the identical tool call:

```powershell
codexpro approvals list --server <server_id>
codexpro approvals approve <approval_id> --server <server_id>
# or: codexpro approvals deny <approval_id> --server <server_id>
```

Persistent processes remain locally inspectable and terminable even when the remote client is unavailable:

```powershell
codexpro processes list --server <server_id>
codexpro processes terminate <process_id> --server <server_id>
```

`full_access` is for code you trust. It runs with the ambient authority of the current Windows user and does **not** isolate files, credentials, registry, devices, COM/WMI/service brokers, or network access. Job Objects control only recorded Job members; ConPTY provides terminal I/O, not isolation; output redaction recognizes known patterns but is not DLP. The reserved `workspace` execution profile remains unavailable and never falls back to `full_access`.

## Workspace Sessions

A `workspace_id` is a random opaque handle owned by one MCP server session, not a hash of the repository path. Reopening the same root inside one active session reuses that handle; another HTTP transport session or STDIO server process receives a different handle and cannot use or list the first session's workspaces.

Call `close_workspace` to invalidate a handle immediately. Idle handles expire after `CODEXPRO_WORKSPACE_TTL_MS`; when unset, the value follows `CODEXPRO_HTTP_SESSION_TTL_MS`, normally 30 minutes, and successful use refreshes the idle deadline.

For one compatibility cycle, tools that omit `workspace_id` still resolve only the current session's configured default root. This compatibility path does not restore cross-session sharing.

## Safety Defaults

- Public tunnel mode requires a CodexPro HTTP token.
- The supported public CLI defaults to the personal ChatGPT query-token compatibility flow; set `CODEXPRO_ALLOW_QUERY_TOKEN=0` only for advanced compatible clients that can send Bearer headers.
- Generic writes are hidden unless `CODEXPRO_WRITE_MODE=workspace`.
- Safe bash blocks broad shell patterns and secret/build/cache paths.
- By default, Bash receives a narrow child environment rather than arbitrary parent variables. On Windows, CodexPro derives `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, and `GH_CONFIG_DIR` so tools such as GitHub CLI can reuse their config and OS keyring, while `GH_TOKEN` and unrelated API variables are not copied.
- `CODEXPRO_INHERIT_ENV=1` opts into the full parent environment and should be used only for trusted local repositories.
- Contract V3 defaults to execution `off`; enable `full_access` only with an explicit V3 Permission Profile and local one-use approvals. The reserved `workspace` sandbox profile remains unavailable.
- `apply_patch` is workspace-scoped and rejects blocked paths, symlink patches, and secret-looking patch content.
- `show_changes` keeps a review checkpoint so repeated unchanged reviews collapse.
- Tool-card metadata is off unless `CODEXPRO_TOOL_CARDS=1`.

Read [SECURITY.md](SECURITY.md) before exposing CodexPro through any tunnel.

## RAM And ChatGPT Memory

CodexPro can reduce what it sends to ChatGPT. Current local fixes:

- binary-file checks scan with a reusable 64 KiB buffer instead of allocating the whole file
- ChatGPT tool-card structured payloads are compacted only for card output, not for normal tool data
- bash chat transcripts stay compact by default

That helps avoid oversized MCP/card payloads. It does not force Chrome, ChatGPT, or an old browser iframe to release memory that the client already holds. If the browser tab has already grown, reload the ChatGPT page or restart the browser.

## Repo Context

CodexPro uses explicit files, not hidden chat memory:

```text
AGENTS.md
.ai-bridge/current-plan.md
.ai-bridge/agent-status.md
.ai-bridge/decisions.md
.ai-bridge/open-questions.md
.ai-bridge/execution-log.jsonl
```

For non-tool model surfaces:

```bash
codexpro start --mode pro
```

Or from a local checkout:

```bash
codexpro pro-bundle --root /path/to/repo --copy
codexpro pro-apply --root /path/to/repo --file plan.md
```

## Handoff

ChatGPT can write a plan without executing a local agent:

```bash
codexpro start --mode handoff
```

Then you run execution locally:

```bash
codexpro execute-handoff --agent codex --yes
codexpro watch-handoff --agent codex --yes
```

`handoff_to_agent` is planning-only over MCP. CodexPro does not expose arbitrary local agent execution as a remote ChatGPT tool.

## Troubleshooting

Run:

```bash
codexpro doctor
```

Common fixes:

- Quick tunnel URL changed: rerun `codexpro start` and update the ChatGPT app Server URL.
- Stable URL does not respond: check the tunnel provider first, then confirm the ChatGPT app still uses the complete copied URL including `codexpro_token`.
- ChatGPT cannot call tools in one model/chat: switch to a ChatGPT surface that supports Developer Mode app actions.
- Local port is busy: start another repo with `--port 8788`.
- Tool list looks stale: recreate the ChatGPT app entry or rotate the CodexPro token and replace the app's complete Server URL.

## Development

```bash
npm install
npm run build
npm run smoke
npm run stress
```

Useful release checks:

```bash
npm run build
npm run smoke
CODEXPRO_TOOL_CARDS=1 npm run smoke
npm audit --audit-level=high
npm pack --dry-run
git diff --check
```

## Docs

- [Website](https://rebel0789.github.io/codexpro/)
- [FAQ](FAQ.md)
- [Security](SECURITY.md)
- [Stable URL guide](DOMAIN_SETUP.md)
- [Changelog](CHANGELOG.md)
