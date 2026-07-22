# Security Policy

CodexGPT exposes a local workspace to an MCP client. Treat it like a developer tool with access to your source tree, not like a hosted SaaS app.

## Supported Version

Security fixes target the latest published version only until the project reaches `1.0.0`.

Feature-specific notes follow GitHub `main`; npm users should check the published version before relying on a new command.

## Reporting

Please report security issues privately before opening a public issue. If the repository has GitHub private vulnerability reporting enabled, use that. Otherwise contact the maintainer listed by the project owner.

Do not include secrets, private repository contents, tunnel tokens, or `.env` values in reports.

## Terms Boundary

CodexGPT is not designed to bypass, avoid, pool, resell, or modify ChatGPT, Codex, OpenAI, or third-party model limits. Do not market, deploy, or configure it that way.

Each user should connect their own ChatGPT account, use only product surfaces available to that account, and follow the limits, safety rules, and terms for ChatGPT, Codex, OpenAI, and any third-party model provider they connect.

## Threat Model

CodexGPT can expose:

- file metadata and selected file contents from allowed workspaces
- git status and diffs
- `.ai-bridge` planning files
- optional shell command execution through the `bash` tool, hidden when bash mode is off
- opt-in Contract V3 confirmed-root admission and trusted-code Windows process execution, each guarded by a separate local approval flow
- optional write/edit/apply_patch capability depending on `CODEXGPT_WRITE_MODE`, advertised only in workspace write mode
- optional local handoff execution through `codexgpt execute-handoff`, run from the user's terminal only
- optional local execute/review looping through `codexgpt loop-handoff`, run from the user's terminal only with a user-provided reviewer command and iteration limit

## Failure Model

Review changes against these failure modes before release:

| Failure mode | Expected control |
| --- | --- |
| Public tunnel reachable without a secret | Public/non-loopback HTTP fails closed unless a CodexGPT token is configured. |
| Raw CodexGPT or Cloudflare token appears in UI, logs, docs, or package output | Tokens are redacted in profile/status output and tunnel tokens use local files for persistence. |
| ChatGPT can edit outside the intended repo | Allowed roots are explicit; path resolution rejects escapes, blocked globs, and symlink traversal. |
| A copied workspace handle is reused from another MCP session | Workspace handles are random, server-session scoped, checked against the issuing lifecycle domain, and invalidated by close, idle expiry, transport teardown, or policy-revision change. |
| ChatGPT can run arbitrary shell by default | Bash defaults to safe mode, can be disabled, and full mode is a trusted-local-only choice. Safe mode can still run repo package scripts, so use `--no-bash` for untrusted repos. |
| Contract V3 `full_access` is mistaken for a sandbox | It is opt-in, requires an explicit V3 Permission Profile and a fresh local one-use approval, and reports ambient current-user filesystem, credential, registry, broker, device, and network authority. |
| A failed sandbox probe silently falls back to ambient execution | The reserved `workspace` profile remains unavailable and never falls back to `full_access`; retained Gate S evidence stays blocked and diagnostic only. |
| The Contract V4 Git capsule is mistaken for a sandbox | The capsule fixes executable identity, environment, arguments, prompts, network/lazy fetch, and integrations, but still runs as the current user and reports `execution_isolation: none`. |
| A task checkout is mistaken for process isolation | Managed worktrees separate workflow state only. They share repository metadata and provide no credential, registry, device, broker, or network isolation. |
| A clean task removal is mistaken for branch deletion | Removal deletes only the revalidated owned checkout and registration. The generated branch, commits, private stashes, and audit are retained. |
| Automatic temporary cleanup deletes unrelated system files | Cleanup requires the exact CodexGPT prefix, ownership marker, canonical direct-child path, directory identity, and a dead owner. Unmarked or malformed state is preserved, and explicit cleanup returns nonzero when validation or deletion is incomplete. |
| Merge preparation is mistaken for live-target execution | Preparation creates an immutable reviewed candidate; execution separately revalidates clean target state, normalization, OIDs, and CAS preconditions. |
| Handoff mode still exposes generic writes | Handoff/pro modes do not advertise generic `write`/`edit`/`apply_patch`; bounded handoff tools write `.ai-bridge` files only. |
| Local Codex history is treated as ChatGPT memory | Codex session access is opt-in metadata/read mode and never attaches to a live Codex app session. |
| Browser admin mutates live runtime unexpectedly | Admin profile changes apply on restart; active runtime policy stays stable for the current session. |
| Remote MCP tool runs Codex/OpenCode/Pi directly | Agent execution remains a user-started CLI/watch process on the local machine. |
| Autonomous loop drives ChatGPT Web or bypasses approvals | `loop-handoff` only runs local terminal commands over `.ai-bridge` files; it does not resume browser sessions, approve prompts, or expose a remote MCP executor. |
| Reviewer masks a failed external command | `loop-handoff` requires explicit reviewer verdict assignments and rejects reviewer `PASS` after failed executor, test, or reviewer commands unless the user opts into the supported executor/test override behavior. |

The main risks are:

- connecting an untrusted MCP client
- exposing the server through a public tunnel without auth
- running with `CODEXGPT_BASH_MODE=full`
- enabling Contract V3 `CODEXGPT_EXECUTION_PROFILE=full_access` for code, dependencies, or scripts you do not trust
- running with `CODEXGPT_WRITE_MODE=workspace` on an important repo
- executing an untrusted `.ai-bridge/current-plan.md` or custom `execute-handoff --command`
- running `loop-handoff` with an untrusted reviewer command or without a small `--max-iters`
- adding overly broad allowed roots
- leaking a `codexgpt_token` or Cloudflare tunnel token
- trusting a downloaded `cloudflared` binary without understanding where it came from

## Safer Defaults

Default daily mode:

```bash
codexgpt start \
  --root /path/to/repo \
  --bash safe \
  --tunnel cloudflare
```

Safer planning-only mode:

```bash
codexgpt start \
  --root /path/to/repo \
  --mode handoff \
  --bash safe \
  --tunnel cloudflare
```

For stable public hostnames, keep the CodexGPT auth token stable but private:

```bash
codexgpt start \
  --root /path/to/repo \
  --tunnel cloudflare-named \
  --hostname codexgpt.example.com \
  --tunnel-name codexgpt \
  --token <long-random-token> \
  --bash safe
```

## Policy Kernel Boundaries

Phase 2A introduces a compiled local Policy Kernel with `legacy`, `shadow`, and `enforce` rollout modes. The effective ceiling is the intersection of immutable hard policy, identity scopes, the selected Permission Profile, and demonstrated deployment capabilities. A SessionGrant or approval may narrow or temporarily satisfy a request inside that ceiling; it cannot exceed it.

The following distinctions are security requirements:

- Tool visibility is not authorization.
- A query-token or Bearer token is a shared-secret identity, not proof of a human owner.
- Runtime profiles do not contain permission rules; strict Permission Profile V1 documents live under `~/.codexgpt/permissions/`.
- Safe Bash is not an OS sandbox.
- With `CODEXGPT_INHERIT_ENV` unset, Bash excludes arbitrary parent variables and token variables. On Windows it supplies only the bounded user/configuration paths needed for normal CLI discovery, including GitHub CLI configuration and OS-keyring access. `CODEXGPT_INHERIT_ENV=1` disables that narrowing and exposes the complete parent environment to the child process.
- Environment narrowing is defense in depth, not filesystem or credential isolation: a same-user process may still access files and operating-system services allowed to that account.
- Contract V3 `full_access` uses a Windows Job Object only for recorded Job members. It does not isolate files, registry, credentials, devices, COM/WMI/service brokers, or network, and it does not prove that broker-created descendants remain controllable.
- ConPTY is terminal transport, not a sandbox.
- Cloudflare Tunnel is inbound transport infrastructure and does not enforce local policy or outbound egress.
- Any profile that claims blocked-path, credential, registry, device, destination-network, or sandbox enforcement against an ambient child fails closed before approval or spawn. `full_access` is admitted only when the selected profile explicitly accepts that those protections do not apply.

Contracts V1 and V2 retain their exact behavior and do not create pending approvals. Contract V3 adds a local-only approval and emergency-control surface, durable V3 lifecycle audit, and typed Windows process tools. It still does not claim OAuth-grade owner isolation, complete Windows sandboxing, elimination of all same-user TOCTOU or broker escapes, DLP, or safe arbitrary Git remote writes.

## Contract V4 Git and Task-Worktree Boundaries

Contract V4 is exact 51 and requires atomic state, durable audit, Policy Kernel `enforce`, stable session identity, verified native Git execution, and local approval support. `CODEXGPT_GIT_MODE=read` is the mutation-off default; `local` activates only the typed local operations admitted by policy and Gate R.

- The safe capsule binds one executable identity and uses direct argv, a clean bounded environment, fixed disabling config, no prompts, no lazy fetch, and no network protocol. It is not an OS sandbox.
- Safe stage, restore, stash, task materialization, divergent merge, and target integration use private indexes, raw blobs, object quarantine, and explicit file/index/ref participants. They do not invoke porcelain `git add`, `checkout`, `reset`, `clean`, `stash`, or live-checkout `merge`.
- Affected EOL, text, encoding, ident, clean/smudge/LFS, or other checkout transformations fail before effects. `CODEXGPT_GIT_INTEGRATIONS=off` executes no repository integration.
- Remote, credential, config mutation, force, branch/history deletion, shared `refs/stash`, GC, and caller-selected arbitrary Git arguments are absent from the typed surface. A separately approved unrestricted process remains ambient authority outside this guarantee.
- Gate R persists authorization before effects and terminal audit before success. It coordinates CodexGPT-owned locks and participants only; external Git processes are not excluded and simultaneous database visibility is not claimed. Unprovable restart state freezes the repository instead of guessing rollback or deletion.
- Public repository, task, branch, plan, review, receipt, and workspace values are opaque. Canonical task paths remain local-control information. Persistent task owner binding is versioned; session workspace handles are not revived after restart.
- Task create and remove are review/execute state machines. Create's review has no branch/root/admin effect. Remove requires a clean exact inventory and retains the branch, commits, and private stashes.
- Fast-forward merge preparation is effect-free. Divergent preparation computes/scans in quarantine under review authority; object/ref promotion requires a fresh candidate-bound R3 retry. Merge execute is a separate R3 CAS and may still fail after checks if external state changes.
- Same-binary rollback to V3 hides V4 tools but keeps compatible readers and recovery state. Configuration rollback never means deleting tasks, branches, stashes, candidates, or audit.

Repository integrations that require hooks, filters, signing, merge helpers, or similar programs are not run by the safe path. Enabling a configuration value never authorizes silent ambient execution; if an exact approved integration path is unavailable, the operation fails with an action-oriented error. Gate X requires explicit `approved_full_access`, local Git mode, one exact fresh R3 grant, and unchanged executable/repository/integration identities. It exposes only private-index stage, shadow-directory commit, quarantined object-only merge, and private-destination checkout; no caller-selected Git command or typed remote, credential, force, or config mutation exists. These four operations remain ambient current-user execution with no filesystem, credential, registry, network, or broker isolation, and both the local approval display and public result state that limit.

During the migration cycle, rollback is permitted only to reviewed legacy behavior, the exact generated compatibility profile, or a narrower read-only profile. Invalid policy configuration cannot fall through to an unguarded execution path.

## Contract V3 Trusted-Code Execution Boundaries

Contract V3 is disabled by default. Enabling its non-minimal execution surface requires all of the following:

- `CODEXGPT_TOOL_CONTRACT_VERSION=3`;
- `CODEXGPT_FILE_TRANSACTIONS=atomic`;
- durable audit through `CODEXGPT_AUDIT_MODE=auto|required`;
- `CODEXGPT_POLICY_ENGINE=enforce`;
- a strict schema-3 Permission Profile;
- `CODEXGPT_EXECUTION_PROFILE=full_access` for ambient process execution, or `CODEXGPT_LOCAL_FILE_ACCESS=confirmed_roots` for brokered root admission;
- an available local approval runtime bound to the exact server lifecycle.

V3 R3 actions create a bounded pending request but do not execute. A separate local terminal must inspect and approve the exact action through `codexgpt approvals ...`; the resulting grant is one-use, context-bound, and consumed atomically. A retry with changed executable, arguments, working directory, backend, environment, policy, evidence, session, or root identity requires a new approval. The remote MCP client cannot approve its own request.

`run_command` and `start_process` under `full_access` run with the current Windows user's ambient authority. They may read, modify, delete, encode, or transmit anything that account can reach. The fixed clean child environment and known-pattern streaming redaction reduce accidental exposure but do not isolate account-readable files, keyrings, credentials, registry, devices, brokers, or network and do not provide DLP.

Process IDs are random owner-bound handles. Lifetime, timeout, interrupt, resize, input, output, termination, and server-close guarantees apply only to processes that remain members of the exact native Job. Local emergency commands can list or terminate those recorded processes even when the remote transport is unavailable. They do not kill unrelated processes and do not claim control over WMI, COM, service, scheduler, or other broker-created escapes.

`open_full_access_workspace` is a brokered confirmed-root admission path, not permission for an ambient child. It requires an exact local approval, stable Windows object identity, hard-link count 1 for ordinary confirmed-root files, fixed absolute lease expiry, PathGuard checks, atomic transactions for supported writes, and audit. It does not persistently widen global `allowedRoots`.

The reserved `CODEXGPT_EXECUTION_PROFILE=workspace` is not a reduced-security mode. The AppContainer/LPAC Gate S probe did not prove the required network and broker isolation on the tested host, so production registration and activation remain unavailable. Task 4B0 fixtures are diagnostic, package-excluded, non-persistent, and cannot activate a sandbox. There is no automatic fallback from `workspace` to `full_access`.

## Workspace Lifecycle Boundaries

A `workspace_id` is an opaque capability handle issued inside one MCP server lifecycle domain. It is not a stable repository identifier, path hash, bearer credential for other sessions, or proof of a human owner. Separate HTTP transport sessions and separate STDIO server processes receive separate handles even when they open the same canonical root.

`close_workspace` invalidates a handle immediately. Active handles also expire after the bounded idle TTL, and successful use refreshes that deadline. Foreign, closed, expired, transport-stale, or policy-stale handles return the same bounded unavailable result without disclosing the root, internal workspace key, identity binding, policy revision, or revocation reason.

For one compatibility cycle, an omitted `workspace_id` can select only the current server session's configured default root. This compatibility boundary must not be generalized into process-global workspace sharing.

## Atomic Transaction Kernel Boundaries

Phase 3 connects the transaction, recovery, participant, move, change-set, and persistent-audit kernels to every supported public workspace writer. `CODEXGPT_FILE_TRANSACTIONS` still defaults to the reviewed `legacy` compatibility path; selecting `atomic` makes those writers prepare and commit through the guarded runtime and never silently fall back to direct writes. Writable atomic operation requires persistent terminal audit, so `CODEXGPT_AUDIT_MODE=off` fails before tool registration. Contract V1 remains the default exact 28-tool surface. Explicit contract V2 requires atomic transactions, persistent audit, an available state root, and the move runtime; it defines exactly 31 child tools, with the three additions hidden in minimal and connection-test mode.

The atomic backend requires same-volume ordinary-file hard links for no-clobber creation, move installation, and rollback evidence. Unsupported filesystems or volumes return `ATOMIC_BACKEND_UNAVAILABLE`; CodexGPT does not fall back to direct writes, replacing rename, or copy/delete. Transaction manifests live in the local application-state directory, use opaque workspace references, and exclude canonical workspace roots, file bodies, complete diffs, and credentials. Reserved `.codexgpt-txn-*` path segments are blocked unconditionally from public path operations.

When atomic mode is connected, persisted recovery runs before a workspace handle is issued or refreshed. Participant-aware recovery completes commit when every required participant effect is durably present, restores before-state when none is present, compensates and correlates partial effects while restoring before-state, and freezes the workspace with `TRANSACTION_RECOVERY_REQUIRED` whenever ownership, participant, identity, hash, or artifact evidence cannot be proved. The root-keyed lock coordinates CodexGPT processes only; external editors and other applications remain outside it. Multi-file transactions provide staged execution, rollback, and process-crash recovery, not database-style simultaneous cross-file visibility or absolute power-loss durability.

The mutation runtime gives each prepared writer result a non-enumerable server-owned handle. Before any public atomic success, the wrapper installs the visible transaction, persists required terminal audit evidence, commits and probes the audit and authenticated change-set participants, records the durable commit decision, and proves the committed transaction manifest before cleanup. Missing or foreign handles, provider exceptions, audit failure, change-set failure, or mismatched transaction/change-set facts fail closed and trigger reconciliation or rollback. `write`, `edit`, multi-file `apply_patch`, bridge scaffold/export/handoff writers, self-test artifacts, and supported CLI workspace artifacts all use this path when atomic mode is selected. Exact V1 response schemas remain unchanged.

In contract V2 standard/full mode, `move_paths` and `undo_change_set` use the same guarded runtime and policy boundary as direct tools and the `codexgpt` supertool. `move_paths` accepts at most 64 ordinary files, requires a caller-supplied lowercase SHA-256 for every source, remains inside one canonical workspace and volume, and never overwrites an unrelated target. Chains, cycles, duplicate-object hard links, and Windows case-only renames use no-clobber hard-link staging. Preview performs current policy/path/hash/device validation but cannot guarantee that a later execution-time link will succeed. Undo is owner- and retention-bound, complete-preflight, no-clobber, all-or-nothing, and has no force or redo mode.

The static mutation closure gate enumerates filesystem write primitives in all TypeScript sources and shipped runtime scripts. Each reviewed occurrence is fixed to its path, line, column, call digest, and one narrow purpose: transaction backend, atomic application state, persistent audit maintenance, or installer/runtime state outside authorized workspaces. Test and smoke fixtures are excluded by an exact file set rather than a broad pattern. The remaining direct workspace primitives in `fsOps.ts` and `handoffOps.ts` are retained only for the explicit `fileTransactions=legacy` compatibility path; the configured atomic path must prepare and commit through the transaction runtime and cannot fall back to them. Any new primitive or source drift fails the gate until it is removed or independently reviewed.

## Persistent Audit Boundaries

Phase 3B adds a local persistent audit backend under the application-state directory, outside authorized workspaces and Git. It stores separate immutable authorization and terminal execution events plus bounded recovery and administrative events. Records use project-owned canonical JSON, monotonic sequence numbers, cross-segment HMAC-SHA-256 chaining, and keys derived from the Phase 3 installation master key with dedicated labels.

Audit records intentionally exclude file bodies, complete diffs, raw command output, canonical workspace roots, Authorization/Cookie values, credential-bearing URLs, private keys, and `.env` contents. Workspace references are keyed opaque identifiers. Queries are exact-filter only, default to the latest 24 hours, are limited to seven days and 100 records, and use authenticated expiring cursors. Raw segment export, regex search, and full-text search are not exposed.

The HMAC chain detects accidental damage and untrusted modification that does not also control the installation key. It is not legal WORM storage, remote attestation, or protection against an attacker running as the same OS account with access to both state and key material. Only an incomplete final line is automatically quarantined and truncated after the preceding chain and index relation verify; any non-tail break fails closed and preserves the original evidence.

`CODEXGPT_AUDIT_MODE=auto` is best-effort for ordinary legacy/shadow operation and becomes required for enforce-mode R2+ mutations. Writable atomic operation always requires durable terminal evidence, including when the configured Policy mode is `legacy`; the internal compatibility wrapper observes rather than enforces Policy decisions while preserving the required audit/transaction commit ordering. Required authorization evidence must be durable before execution where Policy requires it. A required terminal append failure triggers participant-aware reconciliation or rollback, and an unprovable result becomes `TRANSACTION_RECOVERY_REQUIRED`. The production runtime is injected when atomic or non-legacy Policy/audit configuration requires it. In contract V2 full mode, `query_audit_events` is an installation-level `audit:read` operation with exact bounded filters and authenticated cursor pagination; it remains hidden in standard, minimal, and connection-test modes.

## Hard Rules

- Do not run public tunnels with `--no-auth`.
- Public tunnel mode and non-loopback binds fail closed if `CODEXGPT_HTTP_TOKEN` is missing.
- The supported public `codexgpt` entry uses the personal query-token compatibility flow for ChatGPT Web when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset.
- The copied Server URL contains `codexgpt_token`; select `Authentication: None / No Authentication` in ChatGPT for this personal compatibility flow.
- Public startup logs keep the credential-bearing Server URL hidden by default. Display it only through an explicit local action such as pressing `u` or printing the Create App fields.
- Treat that URL as a password-equivalent secret. It can leak through browser history, clipboard contents, screenshots, logs, and copied links.
- Set `CODEXGPT_ALLOW_QUERY_TOKEN=0` only for compatible clients that can send an `Authorization: Bearer` header. Server-side Bearer support remains available for compatible clients, but ChatGPT Web manual static-Bearer setup is not claimed or documented.
- Direct unsupported server launches still keep query authentication disabled unless `CODEXGPT_ALLOW_QUERY_TOKEN=1` is explicit.
- Do not commit printed connector URLs that include `codexgpt_token`.
- Do not commit Cloudflare tunnel tokens.
- Do not paste raw Cloudflare tunnel tokens into browser pages or screenshots. Use `--cloudflare-token-file` or the local page's Cloudflare token file field instead.
- Use `--mode handoff` for planning workflows where ChatGPT should not edit source files. Handoff mode does not advertise generic `write`/`edit` tools.
- Preview local handoff execution with `codexgpt execute-handoff --dry-run` before running an unfamiliar adapter or custom command.
- Preview autonomous local loops with `codexgpt loop-handoff --dry-run`, keep `--max-iters` small, and prefer `--require-human-confirmation` until you trust the reviewer command.
- Keep `execute-handoff` local. Do not wrap it in a remote MCP tool unless you add a stronger approval and sandbox story.
- Keep `loop-handoff` local. Do not use it to automate ChatGPT Web, Codex approvals, account access, third-party Pro sites, quota limits, or product safety prompts.
- Use default agent mode only with trusted ChatGPT sessions and repo-specific roots.
- Use `--no-bash` when ChatGPT should never trigger shell commands in the workspace.
- Use `--bash-session <id> --require-bash-session` when bash should be enabled only for calls that explicitly target this local CodexGPT terminal label.
- Keep Codex session history access off unless needed. `--codex-sessions metadata` only lists local Codex JSONL metadata; `--codex-sessions read` allows bounded transcript reads.
- Keep `CODEXGPT_CONTEXT_DIR` as a workspace-relative hidden directory such as `.ai-bridge`; CodexGPT rejects source, build, dependency, credential, and absolute context directories.
- Use `--bash full` only for trusted local repos.
- Enable Contract V3 `full_access` only for repositories, package scripts, dependencies, compilers, and executables you trust under the current Windows account.
- Review V3 approvals locally with `codexgpt approvals list --server <server_id>`; do not approve an action whose displayed executable, arguments, working directory, authority, or lifetime is unexpected.
- Keep `CODEXGPT_EXECUTION_PROFILE=workspace` unavailable. Do not relabel the retained AppContainer capability probe as a production sandbox or weaken its blocked evidence.
- Do not treat MCP session ids or bash session labels as Codex conversation ids. CodexGPT does not execute inside a Codex app session.
- Prefer a repo-specific `--root` instead of `--allow-home`.
- Use `--no-install-cloudflared --cloudflared <path>` if your organization requires a managed Cloudflare Tunnel binary.

## Cloudflare Binary Install

The supported public `codexgpt` entry uses the repository-managed verified installer for Cloudflare start paths: default/start, `stable`, explicit Cloudflare tunnel starts, and `connection-test` whenever its effective tunnel is `cloudflare` or `cloudflare-named`. It selects the platform asset from `scripts/cloudflared-release.mjs`, downloads the pinned release, rejects files larger than 100 MiB, verifies the pinned SHA-256 digest, checks the reported version, and installs the result into `~/.codexgpt/bin`. It does not install a system service, use sudo/admin rights, or modify shell startup files.

Managed-start flow:

```text
1. an explicit --cloudflared <path> remains a manual override
2. otherwise ensure the pinned managed binary exists and verifies correctly
3. pass its exact path with --cloudflared <managed-path>
4. pass --no-install-cloudflared so the legacy CLI cannot select or download another binary
```

Use `npm run cloudflared:install`, `npm run cloudflared:upgrade`, and `npm run cloudflared:status` for the managed binary. Directly invoking `node scripts/codexgpt.mjs` bypasses the verified public entry and is not the supported public launch path.

## Built-In Guards

CodexGPT blocks common sensitive paths by default:

- `.env` and `.env.*`
- `.git` internals
- `node_modules`
- common private key names
- build/cache folders such as `dist`, `build`, `.next`, `coverage`, `.cache`
- symlinks that resolve outside the workspace or into blocked paths

These guards reduce risk. They are not an OS sandbox.
