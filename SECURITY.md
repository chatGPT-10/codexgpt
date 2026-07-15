# Security Policy

CodexPro exposes a local workspace to an MCP client. Treat it like a developer tool with access to your source tree, not like a hosted SaaS app.

## Supported Version

Security fixes target the latest published version only until the project reaches `1.0.0`.

Feature-specific notes follow GitHub `main`; npm users should check the published version before relying on a new command.

## Reporting

Please report security issues privately before opening a public issue. If the repository has GitHub private vulnerability reporting enabled, use that. Otherwise contact the maintainer listed by the project owner.

Do not include secrets, private repository contents, tunnel tokens, or `.env` values in reports.

## Terms Boundary

CodexPro is not designed to bypass, avoid, pool, resell, or modify ChatGPT, Codex, OpenAI, or third-party model limits. Do not market, deploy, or configure it that way.

Each user should connect their own ChatGPT account, use only product surfaces available to that account, and follow the limits, safety rules, and terms for ChatGPT, Codex, OpenAI, and any third-party model provider they connect.

## Threat Model

CodexPro can expose:

- file metadata and selected file contents from allowed workspaces
- git status and diffs
- `.ai-bridge` planning files
- optional shell command execution through the `bash` tool, hidden when bash mode is off
- optional write/edit/apply_patch capability depending on `CODEXPRO_WRITE_MODE`, advertised only in workspace write mode
- optional local handoff execution through `codexpro execute-handoff`, run from the user's terminal only
- optional local execute/review looping through `codexpro loop-handoff`, run from the user's terminal only with a user-provided reviewer command and iteration limit

## Failure Model

Review changes against these failure modes before release:

| Failure mode | Expected control |
| --- | --- |
| Public tunnel reachable without a secret | Public/non-loopback HTTP fails closed unless a CodexPro token is configured. |
| Raw CodexPro or Cloudflare token appears in UI, logs, docs, or package output | Tokens are redacted in profile/status output and tunnel tokens use local files for persistence. |
| ChatGPT can edit outside the intended repo | Allowed roots are explicit; path resolution rejects escapes, blocked globs, and symlink traversal. |
| A copied workspace handle is reused from another MCP session | Workspace handles are random, server-session scoped, checked against the issuing lifecycle domain, and invalidated by close, idle expiry, transport teardown, or policy-revision change. |
| ChatGPT can run arbitrary shell by default | Bash defaults to safe mode, can be disabled, and full mode is a trusted-local-only choice. Safe mode can still run repo package scripts, so use `--no-bash` for untrusted repos. |
| Handoff mode still exposes generic writes | Handoff/pro modes do not advertise generic `write`/`edit`/`apply_patch`; bounded handoff tools write `.ai-bridge` files only. |
| Local Codex history is treated as ChatGPT memory | Codex session access is opt-in metadata/read mode and never attaches to a live Codex app session. |
| Browser admin mutates live runtime unexpectedly | Admin profile changes apply on restart; active runtime policy stays stable for the current session. |
| Remote MCP tool runs Codex/OpenCode/Pi directly | Agent execution remains a user-started CLI/watch process on the local machine. |
| Autonomous loop drives ChatGPT Web or bypasses approvals | `loop-handoff` only runs local terminal commands over `.ai-bridge` files; it does not resume browser sessions, approve prompts, or expose a remote MCP executor. |
| Reviewer masks a failed external command | `loop-handoff` requires explicit reviewer verdict assignments and rejects reviewer `PASS` after failed executor, test, or reviewer commands unless the user opts into the supported executor/test override behavior. |

The main risks are:

- connecting an untrusted MCP client
- exposing the server through a public tunnel without auth
- running with `CODEXPRO_BASH_MODE=full`
- running with `CODEXPRO_WRITE_MODE=workspace` on an important repo
- executing an untrusted `.ai-bridge/current-plan.md` or custom `execute-handoff --command`
- running `loop-handoff` with an untrusted reviewer command or without a small `--max-iters`
- adding overly broad allowed roots
- leaking a `codexpro_token` or Cloudflare tunnel token
- trusting a downloaded `cloudflared` binary without understanding where it came from

## Safer Defaults

Default daily mode:

```bash
codexpro start \
  --root /path/to/repo \
  --bash safe \
  --tunnel cloudflare
```

Safer planning-only mode:

```bash
codexpro start \
  --root /path/to/repo \
  --mode handoff \
  --bash safe \
  --tunnel cloudflare
```

For stable public hostnames, keep the CodexPro auth token stable but private:

```bash
codexpro start \
  --root /path/to/repo \
  --tunnel cloudflare-named \
  --hostname codexpro.example.com \
  --tunnel-name codexpro \
  --token <long-random-token> \
  --bash safe
```

## Policy Kernel Boundaries

Phase 2A introduces a compiled local Policy Kernel with `legacy`, `shadow`, and `enforce` rollout modes. The effective ceiling is the intersection of immutable hard policy, identity scopes, the selected Permission Profile, and demonstrated deployment capabilities. A SessionGrant or approval may narrow or temporarily satisfy a request inside that ceiling; it cannot exceed it.

The following distinctions are security requirements:

- Tool visibility is not authorization.
- A query-token or Bearer token is a shared-secret identity, not proof of a human owner.
- Runtime profiles do not contain permission rules; strict Permission Profile V1 documents live under `~/.codexpro/permissions/`.
- Safe Bash is not an OS sandbox.
- A Windows Job Object, when later available, would establish only tested process-tree controls, not filesystem, registry, credential, or network isolation.
- Cloudflare Tunnel is inbound transport infrastructure and does not enforce local policy or outbound egress.
- Missing or partial enforcement capabilities produce stable fail-closed errors rather than current-user execution.

Phase 2A does not claim complete Windows sandboxing, OAuth-grade owner isolation, elimination of symlink/junction TOCTOU, persistent audit storage, approval UI, or safe arbitrary Git remote writes. The synthetic Windows capability spike reads and writes only temporary fixtures and reports unproved capabilities as `none`; it does not install firewall rules, services, scheduled tasks, registry policy, or sandbox software.

During the migration cycle, rollback is permitted only to reviewed legacy behavior, the exact generated compatibility profile, or a narrower read-only profile. Invalid policy configuration cannot fall through to an unguarded execution path.

## Workspace Lifecycle Boundaries

A `workspace_id` is an opaque capability handle issued inside one MCP server lifecycle domain. It is not a stable repository identifier, path hash, bearer credential for other sessions, or proof of a human owner. Separate HTTP transport sessions and separate STDIO server processes receive separate handles even when they open the same canonical root.

`close_workspace` invalidates a handle immediately. Active handles also expire after the bounded idle TTL, and successful use refreshes that deadline. Foreign, closed, expired, transport-stale, or policy-stale handles return the same bounded unavailable result without disclosing the root, internal workspace key, identity binding, policy revision, or revocation reason.

For one compatibility cycle, an omitted `workspace_id` can select only the current server session's configured default root. This compatibility boundary must not be generalized into process-global workspace sharing.

## Atomic Transaction Kernel Boundaries

Phase 3A adds an internal transaction and recovery kernel; it does not make the existing public `write`, `edit`, `apply_patch`, handoff, export, or other workspace writers atomic. `CODEXPRO_FILE_TRANSACTIONS` defaults to `legacy`. Until Phase 3C migrates every supported public writer, `atomic` is accepted only with `CODEXPRO_WRITE_MODE=off`, and writable atomic server construction fails before tool registration.

The V1 backend requires same-volume ordinary-file hard links for no-clobber creation and rollback evidence. Unsupported filesystems or volumes return `ATOMIC_BACKEND_UNAVAILABLE`; CodexPro does not fall back to a direct write. Transaction manifests live in the local application-state directory, use opaque workspace references, and exclude canonical workspace roots, file bodies, complete diffs, and credentials. Reserved `.codexpro-txn-*` path segments are blocked unconditionally from public path operations.

When atomic read-only mode is connected, persisted recovery runs before a workspace handle is issued or refreshed. Recovery restores before-state for incomplete transactions, finishes cleanup only for durably committed transactions, and freezes the workspace with `TRANSACTION_RECOVERY_REQUIRED` whenever ownership, identity, hash, or artifact evidence cannot be proved. The per-workspace lock coordinates CodexPro processes only; external editors and other applications remain outside it. Multi-file transactions provide staged execution, rollback, and crash recovery, not database-style simultaneous cross-file visibility.

Phase 3C's internal mutation runtime gives each prepared writer result a non-enumerable server-owned handle. Before any public success, the wrapper installs the visible transaction, persists required terminal audit evidence, commits the audit and authenticated change-set participants, and proves the committed transaction manifest before cleanup. Missing or foreign handles, provider exceptions, audit failure, change-set failure, or mismatched transaction/change-set facts fail closed and trigger rollback. Internal `write` and `edit` adapters now prepare complete exact UTF-8 buffers, enforce observed and optional caller hashes, preserve untouched BOM/newline bytes, and project strict V2 transaction results without widening V1. They remain dormant: current public V1 writes are still legacy, missing-parent atomic creation is an activation blocker, and writable atomic startup stays closed until every writer and directory case passes the static inventory gate.

The static mutation closure gate enumerates filesystem write primitives in all TypeScript sources and shipped runtime scripts. Each reviewed occurrence is fixed to its path, line, column, call digest, and one narrow purpose: transaction backend, atomic application state, persistent audit maintenance, or installer/runtime state outside authorized workspaces. Test and smoke fixtures are excluded by an exact file set rather than a broad pattern. The remaining direct workspace primitives in `fsOps.ts` and `handoffOps.ts` are retained only for the explicit `fileTransactions=legacy` compatibility path; the default atomic path must prepare and commit through the transaction runtime and cannot fall back to them. Any new primitive or source drift fails the gate until it is removed or independently reviewed.

## Persistent Audit Boundaries

Phase 3B adds a local persistent audit backend under the application-state directory, outside authorized workspaces and Git. It stores separate immutable authorization and terminal execution events plus bounded recovery and administrative events. Records use project-owned canonical JSON, monotonic sequence numbers, cross-segment HMAC-SHA-256 chaining, and keys derived from the Phase 3 installation master key with dedicated labels.

Audit records intentionally exclude file bodies, complete diffs, raw command output, canonical workspace roots, Authorization/Cookie values, credential-bearing URLs, private keys, and `.env` contents. Workspace references are keyed opaque identifiers. Queries are exact-filter only, default to the latest 24 hours, are limited to seven days and 100 records, and use authenticated expiring cursors. Raw segment export, regex search, and full-text search are not exposed.

The HMAC chain detects accidental damage and untrusted modification that does not also control the installation key. It is not legal WORM storage, remote attestation, or protection against an attacker running as the same OS account with access to both state and key material. Only an incomplete final line is automatically quarantined and truncated after the preceding chain and index relation verify; any non-tail break fails closed and preserves the original evidence.

`CODEXPRO_AUDIT_MODE=auto` is best-effort for legacy/shadow operation and becomes required for enforce-mode R2+ mutations. Required authorization evidence must be durable before execution. Required terminal evidence participates in the Phase 3A transaction before finalization; an append failure triggers rollback, and an unprovable rollback becomes `TRANSACTION_RECOVERY_REQUIRED`. Phase 3B's V2 query adapters and Policy/Audit production wiring remain dormant until Phase 3C enables one coherent contract V2 surface, so the current public V1 server must not be described as already emitting persistent audit records.

## Hard Rules

- Do not run public tunnels with `--no-auth`.
- Public tunnel mode and non-loopback binds fail closed if `CODEXPRO_HTTP_TOKEN` is missing.
- The supported public `codexpro` entry uses the personal query-token compatibility flow for ChatGPT Web when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset.
- The copied Server URL contains `codexpro_token`; select `Authentication: None / No Authentication` in ChatGPT for this personal compatibility flow.
- Treat that URL as a password-equivalent secret. It can leak through browser history, clipboard contents, screenshots, logs, and copied links.
- Set `CODEXPRO_ALLOW_QUERY_TOKEN=0` only for compatible clients that can send an `Authorization: Bearer` header. Server-side Bearer support remains available for compatible clients, but ChatGPT Web manual static-Bearer setup is not claimed or documented.
- Direct unsupported server launches still keep query authentication disabled unless `CODEXPRO_ALLOW_QUERY_TOKEN=1` is explicit.
- Do not commit printed connector URLs that include `codexpro_token`.
- Do not commit Cloudflare tunnel tokens.
- Do not paste raw Cloudflare tunnel tokens into browser pages or screenshots. Use `--cloudflare-token-file` or the local page's Cloudflare token file field instead.
- Use `--mode handoff` for planning workflows where ChatGPT should not edit source files. Handoff mode does not advertise generic `write`/`edit` tools.
- Preview local handoff execution with `codexpro execute-handoff --dry-run` before running an unfamiliar adapter or custom command.
- Preview autonomous local loops with `codexpro loop-handoff --dry-run`, keep `--max-iters` small, and prefer `--require-human-confirmation` until you trust the reviewer command.
- Keep `execute-handoff` local. Do not wrap it in a remote MCP tool unless you add a stronger approval and sandbox story.
- Keep `loop-handoff` local. Do not use it to automate ChatGPT Web, Codex approvals, account access, third-party Pro sites, quota limits, or product safety prompts.
- Use default agent mode only with trusted ChatGPT sessions and repo-specific roots.
- Use `--no-bash` when ChatGPT should never trigger shell commands in the workspace.
- Use `--bash-session <id> --require-bash-session` when bash should be enabled only for calls that explicitly target this local CodexPro terminal label.
- Keep Codex session history access off unless needed. `--codex-sessions metadata` only lists local Codex JSONL metadata; `--codex-sessions read` allows bounded transcript reads.
- Keep `CODEXPRO_CONTEXT_DIR` as a workspace-relative hidden directory such as `.ai-bridge`; CodexPro rejects source, build, dependency, credential, and absolute context directories.
- Use `--bash full` only for trusted local repos.
- Do not treat MCP session ids or bash session labels as Codex conversation ids. CodexPro does not execute inside a Codex app session.
- Prefer a repo-specific `--root` instead of `--allow-home`.
- Use `--no-install-cloudflared --cloudflared <path>` if your organization requires a managed Cloudflare Tunnel binary.

## Cloudflare Binary Install

The supported public `codexpro` entry uses the repository-managed verified installer for Cloudflare start paths: default/start, `stable`, explicit Cloudflare tunnel starts, and `connection-test` whenever its effective tunnel is `cloudflare` or `cloudflare-named`. It selects the platform asset from `scripts/cloudflared-release.mjs`, downloads the pinned release, rejects files larger than 100 MiB, verifies the pinned SHA-256 digest, checks the reported version, and installs the result into `~/.codexpro/bin`. It does not install a system service, use sudo/admin rights, or modify shell startup files.

Managed-start flow:

```text
1. an explicit --cloudflared <path> remains a manual override
2. otherwise ensure the pinned managed binary exists and verifies correctly
3. pass its exact path with --cloudflared <managed-path>
4. pass --no-install-cloudflared so the legacy CLI cannot select or download another binary
```

Use `npm run cloudflared:install`, `npm run cloudflared:upgrade`, and `npm run cloudflared:status` for the managed binary. Directly invoking `node scripts/codexpro.mjs` bypasses the verified public entry and is not the supported public launch path.

## Built-In Guards

CodexPro blocks common sensitive paths by default:

- `.env` and `.env.*`
- `.git` internals
- `node_modules`
- common private key names
- build/cache folders such as `dist`, `build`, `.next`, `coverage`, `.cache`
- symlinks that resolve outside the workspace or into blocked paths

These guards reduce risk. They are not an OS sandbox.
