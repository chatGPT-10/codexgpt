# CodexGPT Personal Fork — Architecture and Roadmap

This document contains the historical audit baseline, design references, target architecture, long-term contracts, and phased roadmap for the personal CodexGPT fork.

Authority boundaries:

- `AGENTS.md` contains active project rules and safety constraints.
- `Memory.md` contains the current state, active decisions, open items, and recent step summaries.
- `docs/memory/archive/phase-0-and-0.5.md` contains the complete append-only Phase 0 and Phase 0.5 implementation history.
- This document is a design and planning reference. It does not authorize staging, commits, pushes, access expansion, or starting a later phase.

## 1. Historical audited baseline

Audit date: 2026-07-11.

```text
Repository: D:\Dev\codexgpt
Branch: main
Package: codexgpt
Version: 0.28.6
Node requirement: >=20
Initial Git state: clean
```

Architecture at the initial audit:

```text
scripts/codexgpt.mjs
  CLI, profiles, setup, doctor, Cloudflare/ngrok/Tailscale launch

src/http.ts
  Express HTTP service, token authentication, admin UI/API,
  Streamable HTTP MCP sessions

src/stdio.ts
  STDIO MCP transport

src/server.ts
  centralized MCP tool registration, schemas, dispatch, result formatting

Domain modules
  config.ts
  guard.ts
  fsOps.ts
  searchOps.ts
  gitOps.ts
  bashOps.ts
  workspaceOps.ts
  capabilitiesOps.ts
  analysis/*
  proContext.ts
  codexSessions.ts
  redact.ts
```

Initial audit findings before Phase 0.5 implementation:

1. `src/server.ts` was a large centralized tool registry and dispatcher.
2. Tools had useful input schemas but no precise MCP `outputSchema` declarations.
3. Errors did not use a complete stable error-code model.
4. Preliminary multi-workspace support existed, but many calls could fall back to a default workspace.
5. File writes lacked expected-hash conflict checks, atomic multi-file transactions, and rollback.
6. The shell implementation invoked Bash and had no native PowerShell/CMD backend.
7. On the audited Windows machine, a verification command failed before execution with `spawn bash ENOENT`; this meant the selected Bash backend was unavailable, not that the TypeScript build failed.
8. Safe Bash was a policy filter, not an operating-system sandbox.
9. HTTP supported Bearer headers, while query-parameter tokens were still part of the primary workflow.
10. Host allowlisting, strict Origin policy, scoped tokens, token rotation, and separate admin permissions were incomplete.
11. Profile storage could contain usable token material in local JSON.
12. CI ran on Ubuntu only; Windows behavior lacked continuous coverage.
13. Built-in repository analysis was bounded lexical/regex analysis, not LSP-grade semantic analysis.
14. A semantic provider interface existed, but no provider was registered.
15. Skills and AGENTS discovery existed, but trust, version, permission, and content-hash models were incomplete.

The current resolution status of these findings is maintained in `Memory.md` and the phase archive, not in this historical list.

## 2. Reference projects and adoption policy

### DevSpace

DevSpace is the primary workflow reference. Prefer compatible design ideas such as:

- explicit workspace opening and workspace identifiers;
- task worktrees;
- nested project instructions;
- persistent process sessions;
- Host and authentication hardening concepts.

Do not copy assumptions that conflict with this project:

- Bash must not become mandatory on Windows;
- worktrees must not be described as security sandboxes;
- redundant or overly broad tools should not be exposed.

### Serena

Serena is an optional semantic-provider reference for:

- symbols;
- definitions;
- references;
- diagnostics;
- rename and WorkspaceEdit previews.

Serena or another provider must not write files directly. Proposed edits must pass through CodexGPT path policy and the future atomic edit service.

### Desktop Commander

Desktop Commander is a process-management reference for:

- persistent process IDs;
- bounded output buffers;
- cursor-based output reads;
- stdin, interrupt, and termination;
- audit metadata.

Terminal access must never bypass the workspace and permission model.

Before copying source code from any external project, verify the exact license and attribution requirements. Prefer design-level reimplementation.

## 3. Target architecture

Move gradually toward these boundaries; do not relocate everything at once:

```text
app/            server creation, tool registry, result envelope
transport/      HTTP and STDIO transports
transport/http/ routes, sessions, security headers

auth/           request identity, bearer tokens, OAuth, scopes
workspace/      allowed roots, workspace registry, session lifecycle
files/          reads, versions, atomic writes, patch transactions
shell/          policy engine and Windows/Linux shell backends
process/        persistent processes, PTY/ConPTY, output buffering
git/            typed Git operations and task worktrees
instructions/   AGENTS resolution and precedence
skills/         manifest, trust, permissions, hashes
semantic/       built-in, Serena, and optional LSP providers
audit/          redacted local audit events and retention
config/         schema, loader, defaults, migration
tools/          domain-specific MCP tool modules
```

Target request path:

```text
HTTP security layer
  -> Host and Origin checks
  -> authentication and scopes
  -> request identity and request ID
  -> MCP transport
  -> tool registry
  -> input validation
  -> workspace and policy checks
  -> domain service
  -> audit event
  -> exact structured output
```

## 4. Architecture decisions

### 4.1 Workspace identity

Recommended model:

- `workspaceKey`: stable local identity derived from the canonical path; used for local persistence only.
- `workspaceId`: opaque session-scoped random identifier, bound to the authenticated client/session and used in MCP calls.

Eventually require explicit `workspace_id` on workspace-bound tools. Only server configuration, allowed-root listing, workspace listing, and workspace opening may omit it.

### 4.2 Authentication

Long-term public ChatGPT connection:

- OAuth 2.1 resource-server model;
- validate issuer, audience, expiry, and scopes;
- use a mature identity provider or reviewed implementation;
- do not create a partial ad hoc OAuth system.

Current compatibility and migration direction:

- the supported public CLI defaults to personal ChatGPT query-token compatibility when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset;
- `CODEXGPT_ALLOW_QUERY_TOKEN=0` selects Bearer-header output for compatible non-ChatGPT clients;
- direct unsupported server launches keep query authentication off unless explicitly enabled;
- the long-term model uses scoped tokens, hashed token storage, token IDs, expiry, revocation, rotation, and OAuth 2.1.

Initial scope vocabulary:

```text
workspace:open
workspace:read
workspace:write
shell:verify
shell:full
git:read
git:write
process:manage
admin:profile
admin:tokens
```

### 4.3 Shell security

Preferred modes:

```text
disabled
read_only
safe
workspace
full
```

- `disabled`: no shell tool.
- `read_only`: use dedicated read, search, and Git tools; no general shell.
- `safe`: parsed verification commands with explicit project-code risk metadata.
- `workspace`: reserved for a future verified operating-system-isolated implementation.
- `full`: current-user execution for trusted repositories only.

PowerShell should become the default Windows backend. Windows PowerShell, Git Bash, CMD, and WSL may remain optional backends.

Project build and test scripts execute repository code and must be marked accordingly.

### 4.4 Semantic providers

Provider options:

```text
builtin
serena
lsp
none
```

Providers may inspect and propose edits, but every path and edit must be validated and applied by CodexGPT.

## 5. Target tool groups

Workspace:

```text
list_allowed_roots
list_workspaces
open_workspace
open_current_workspace
close_workspace
get_workspace
workspace_snapshot
```

Files and search:

```text
tree
read
read_many
file_stat
file_hash
search_text
search_symbol
find_references
inspect_workspace
```

Editing:

```text
preview_edit
apply_atomic_patch
apply_multi_file_patch
undo_change
```

Git and worktrees:

The following is the historical candidate inventory. The exact Phase 5 design supersedes it and explicitly rejects `git_apply_patch` in favor of guarded `apply_patch` plus exact-path `git_stage`.

```text
git_status
git_diff
git_log
git_branch
git_create_branch
git_stage
git_commit
git_restore
git_stash
git_apply_patch
create_task_worktree
list_task_worktrees
get_task_worktree
merge_task_worktree
remove_task_worktree
```

Shell and processes:

```text
run_verification
start_process
read_process_output
write_process_input
interrupt_process
terminate_process
list_processes
```

Instructions, skills, semantic, and audit:

```text
get_instructions
explain_instruction_sources
list_skills
get_skill
enable_skill
disable_skill
verify_skill
list_symbols
find_symbol
get_definition
find_references
get_diagnostics
preview_rename
preview_workspace_edit
list_audit_events
export_audit_log
purge_audit_log
```

This is a target inventory, not authorization to expose every tool immediately.

## 6. Output and error contract

Each tool should eventually declare an exact `outputSchema`. Do not use a meaningless unrestricted object schema.

Recommended envelope:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "requestId": "req_...",
    "durationMs": 12,
    "warnings": []
  }
}
```

Errors should contain stable codes. Initial code vocabulary:

```text
INVALID_ARGUMENT
AUTH_REQUIRED
AUTH_INVALID
AUTH_SCOPE_REQUIRED
HOST_NOT_ALLOWED
ORIGIN_NOT_ALLOWED
RATE_LIMITED
WORKSPACE_NOT_FOUND
WORKSPACE_EXPIRED
ROOT_NOT_ALLOWED
PATH_OUTSIDE_WORKSPACE
PATH_BLOCKED
SYMLINK_ESCAPE
WINDOWS_DEVICE_PATH_BLOCKED
FILE_NOT_FOUND
FILE_TOO_LARGE
FILE_NOT_TEXT
FILE_VERSION_CONFLICT
SECRET_CONTENT_BLOCKED
PATCH_INVALID
PATCH_CHECK_FAILED
TRANSACTION_FAILED
COMMAND_POLICY_DENIED
SHELL_BACKEND_UNAVAILABLE
PROCESS_NOT_FOUND
PROCESS_TIMEOUT
PROCESS_OUTPUT_TRUNCATED
GIT_NOT_REPOSITORY
GIT_DIRTY
WORKTREE_IN_USE
SEMANTIC_PROVIDER_UNAVAILABLE
INTERNAL_ERROR
```

Keep legacy human-readable `content` during migration while making `structuredContent` authoritative.

## 7. Implementation roadmap

### Phase 0 — Current-state audit

Status: complete. No source implementation changes were made during the audit.

### Phase 0.5 — Security and Windows test baseline

Status: formally closed on 2026-07-12. The final baseline passed local verification, Ubuntu/Windows CI on Node 20 and 24, and a real external Cloudflare Host-forwarding check. Current operational state is maintained in `Memory.md`.

Delivered scope:

1. Windows CI baseline.
2. Focused Windows path-policy tests using `node:test`.
3. Case-insensitive blocked-path matching on Windows.
4. Rejection or safe handling of Windows device paths, UNC paths, NTFS ADS, reserved names, trailing dots/spaces, and cross-drive escapes.
5. Allowed Host policy.
6. Explicit Origin policy.
7. Bearer-header authentication retained for compatible clients.
8. The supported public CLI defaults to the personal ChatGPT query-token compatibility flow; `CODEXGPT_ALLOW_QUERY_TOKEN=0` explicitly selects the Bearer-client path.
9. Token query strings excluded from request logs.
10. Doctor diagnostics for unavailable shell backends.
11. Pinned, checksum-verified Cloudflared installation and exact managed-binary routing.
12. Public CLI and documentation aligned with the selected compatibility flow and URL-secret exposure warnings.
13. Linux test process-tree cleanup verified in GitHub-hosted Ubuntu runners.

Closure evidence is recorded in `docs/memory/archive/phase-0-and-0.5.md`.

### Phase 1 — Exact output schemas and stable errors

Historical-status note (2026-07-14): this document preserves the original audit baseline and first-seven-slice snapshot below. Active sequencing is superseded by `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`. All twenty-eight Phase 1 slices are published and cross-platform exact-head CI-validated. Unified Slices 17–28 implementation `021ab90` plus Windows portability repair `e20d84e` passed run `29314923948` on Ubuntu/Windows Node 20/24, and Phase 1 is formally closed. At that date Phase 2 had not started. Current state and evidence are indexed in `Memory.md`.

- delivered the common result, metadata, and stable-error primitives required by incremental tool migration;
- delivered exact advertised `outputSchema` contracts for `server_config`, `tree`, `read`, direct `search`, `git_status`, direct `git_diff`, and direct `show_changes`, with real MCP success/failure contract tests;
- preserved human-readable `content` output and MCP `isError` behavior;
- migrated all seven dedicated direct tool cards and proven internal consumers to nested `data`;
- introduced six safe `tree`, nine safe `read`, and seven safe Git/review non-retryable error codes through tool-local classifiers without refactoring global errors;
- preserved blank and safe nonexistent Git pathspecs, staged/unstaged selection, stats-only output, supertool wrapping, review checkpoints, untracked-file fingerprints, and UTF-8 path/rename analysis;
- made optional `show_changes` impact-analysis failure degrade to `analysis: null` plus one fixed warning without hiding valid Git review data or exposing raw diagnostics;
- made optional `search` analysis disablement or failure preserve complete lexical matches as `analysis: null` plus one fixed safe warning while keeping aggregate search text only in MCP `content`;
- corrected native-Windows Stress fixture assumptions without changing production behavior;
- continue migrating later tools incrementally through separately reviewed designs and plans.

### Phase 2 — Workspace lifecycle and isolation

Historical outline only. The active route requires Phase 1 completion and unified publication, then successful acceptance of a design-only Policy Kernel gate. The 2026-07-13 recorded authorization then permits continuous Phase 2A–Phase 5 implementation without a repeated phase-entry approval pause; phase-specific quality and safety gates remain mandatory.

- implement `workspaceKey` plus session-scoped `workspaceId`;
- require explicit workspace IDs;
- add close and expiry;
- bind workspaces to client identity/session;
- remove implicit default-workspace behavior from core services;
- complete Windows canonical-path enforcement.

### Phase 3 — Atomic edits and audit

- file hashes and expected-hash conflicts;
- temporary writes, `fsync`, and atomic replacement;
- multi-file transactions and rollback;
- add `move_paths` only after Policy Kernel and workspace isolation: one-workspace/one-volume atomic batches, no overwrite, full preflight, source-hash verification, and partial-execution rollback;
- change-set IDs and supported undo;
- preserve encoding, BOM, newline, and permissions where possible;
- add redacted local audit events.

### Phase 4 — Windows shell and process sessions

Historical outline only. The current Phase 4 contract and sequence are superseded by the paired 2026-07-16 design and TDD plan listed in `AGENTS.md`.

- shell backend interface;
- native PowerShell backend;
- optional Windows PowerShell, CMD, Git Bash, and WSL backends;
- parsed command policy and environment allowlist;
- persistent process sessions;
- ConPTY/PTY integration;
- bounded output buffers and cursors;
- stdin, interrupt, timeout, and full process-tree termination;
- Windows Job Object integration where feasible.

### Phase 5 — Git and task worktrees

Historical outline only. The exact Phase 5 boundary and TDD sequence are superseded by the adversarially reviewed 2026-07-16 [design](superpowers/specs/2026-07-16-phase-5-git-and-task-worktrees-design.md) and [plan](superpowers/plans/2026-07-16-phase-5-git-and-task-worktrees.md). Phase 4 exact-head closure is satisfied; Tasks 5A0 / Gate G0 through 5A3 / Gate R are locally complete, and Task 5A4 / Gate I is next.

- typed Git results;
- branch, stage, commit, restore, and stash;
- task-worktree lifecycle;
- clean-baseline checks;
- Windows file-lock and long-path handling;
- merge review and safe deletion.

Do not expose push, force push, remote mutation, credential mutation, or force deletion by default. The exact design additionally requires V4=51, raw-blob/private-index safe writes, object-only merge, R3 history mutation, managed task roots that never widen `allowedRoots`, and fail-closed unsupported repository formats.

### Phase 6 — Project guidance and Agent Skills usability

Historical outline only. The exact Phase 6 boundary and TDD sequence are superseded by the adversarially reviewed 2026-07-22 [design](superpowers/specs/2026-07-22-phase-6-project-guidance-and-skills-design.md) and [plan](superpowers/plans/2026-07-22-phase-6-project-guidance-and-skills.md). Phase 6 is closed at `31631676fe254962a9a4f14d6e025e3edba82b8d` by successful exact-head run `30033293444`; explicit `legacy` remains the rollback.

Phase 6 now prioritizes the working ChatGPT path: workspace open returns actual root AGENTS text and bounded root Skill metadata; `codex_context(target_path)` in the standard profile returns the exact root-to-target instruction chain and target-scoped Skill catalog; `load_skill` keeps bodies and resources lazy; actual file, process, and Git actions remain under existing typed tools and Policy/Approval/Audit.

The former mandatory version/trust/permission/content-hash manifest and generic Hook runner are not Phase 6 requirements. Agent Skills use their standard metadata, automatic catalogs are budgeted, user/plugin Skills remain explicit standard opt-in, scripts/dependencies do not auto-run, and one canonical same-handle reader protects AGENTS/Skill/resource reads. This changes usability scope, not the existing local authorization boundary.

### Phase 7 — Semantic providers

Historical outline only. The exact Phase 7 boundary and sequence are superseded by the 2026-07-23 [design](superpowers/specs/2026-07-23-phase-7-semantic-providers-design.md) and [TDD plan](superpowers/plans/2026-07-23-phase-7-semantic-providers.md).

The closed Phase 7 Core implements the runnable first path: a zero-setup owned-worker JavaScript/TypeScript engine that understands symbol-only requests and real in-workspace declaration/config data; exact inherited-runtime V5 with one `semantic` tool; honest lexical fallback; and a complete server-owned identity/hash/edit rename plan whose approval facts and lock-held preconditions flow through the existing Phase 3 atomic transaction.

Focused Node 20/24, transaction, audit, cache-revalidation, worker isolation, documentation, and repository latency gates pass locally after adversarial repair. Real ChatGPT G7-U U2–U6 is accepted through STEP-430, final ordinary/smoke/package G7-X passed at STEP-432, and Phase 7 Core formally closed at `a0b9f46e2297297959527f7570c9cb7942cc8fb3` with exact-head run `30171313296`.

Serena retrieval is a separately authorized Phase 7B extension; direct stdio LSP is Phase 7C only when a concrete language need remains. CodexGPT exposes no protocol-level Provider mutation, while external same-user processes truthfully retain `execution_isolation: none`, `filesystem_isolation: none`, and `network_isolation: none`. Serena/LSP dependencies or installations remain outside the closed Core scope.

### Phase 8 — OAuth and Cloudflare hardening

The historical outline is superseded by the 2026-07-26 [Phase 8 design](superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md) and [executable TDD plan](superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md). G8-0 and Tasks 8A1–8A9 are complete: exact dependency pins, Windows DPAPI CurrentUser, atomic auth state, separated listeners, constrained DCR/PKCE, ES256 access tokens, rotating refresh families, durable revoke/replay, request-local policy/scope enforcement, exact tool metadata, supported setup/local administration, fail-closed Tunnel ownership verification, protected recovery/rebind/no-deletion rollback, current onboarding/security documentation, package boundaries, complete synthetic OAuth/MCP integration, and completed-runtime adversarial repairs exist. Authorized live G8-U is accepted through Journeys U2–U7, STEP-470 accepted local G8-X, and Phase 8 exact-head CI closed at `55b2b5664aae322ec992968a41c87a289fb75282` / `30274857996`; `1.0.0` published this baseline. U6 closed with a documented evidence substitution after deletion of the original Legacy App: replacement Legacy compatibility and exact OAuth return continuity passed, while continuity of the deleted App identity is not claimed. U7 proved fail-early byte-preserving shared/unowned Tunnel refusal and the live public-loopback/local-admin boundary. The explicitly authorized `1.0.3` and `1.0.4` npm/runtime repairs are complete; their GitHub source/tag/Release reconciliation remains outstanding, while further deployment and unrelated external state remain separately gated.

Core uses a personal self-hosted colocated OAuth authorization/resource server, strict public-client DCR, authorization code + exact PKCE `S256`, RFC 8707 resource and RFC 9207 issuer binding, short ES256 access tokens, authenticated opaque refresh envelopes, DPAPI `CurrentUser`, request-local identity, and physically separate public/local-admin listeners. Public routes include a static safe documentation root, cookie-bound authorization status/continue, `/authorize`, `/token`, `/register`, `/revoke`, and `/jwks`; the project owns strict registration, metadata, error and bounded-admission guards instead of exposing the SDK's broader defaults. All refresh/revoke/scope family mutations share one linearizable lock/CAS order, and installation-wide audit is durable before security-state success. A stable binding owns root/issuer/hostname/dedicated Tunnel while forced recovery rotates only the incarnation authority. `legacy|oauth` remain mutually exclusive; profiles keep separate credential-free mode routes, server/client rollback uses separately retained Apps and idempotent `auth setup --root`, no tool or execution authority is added, and V1–V5 stay 28/31/39/51/52.

Journey U5 negative/recovery passed against the live deployment: denial/replay/bounded-admission failures remained safe, copied Bearer replay was accepted only until durable revocation, and restoring a verified pre-revoke backup produced a new-incarnation security reset without changing the stable binding, hostname, or owned Tunnel. Every prior client/grant/token authority stayed invalid. STEP-464 repaired and passed U6's `oauth → legacy → oauth` service/protocol path with exact route exclusivity, query-token denial, and unchanged binding/incarnation. STEP-467 closed U6 with explicit evidence substitution: a recreated Legacy App completed a real read in exclusive Legacy mode, exact setup restored OAuth, and the existing OAuth App completed a post-return read. STEP-468 closed U7 by moving shared/unowned config refusal ahead of all setup mutation and proving the live public/local Tunnel boundary. STEP-470 closed local G8-X after one named-Tunnel diagnostic-race repair and post-repair dual-Node ordinary/Smoke. Subsequent exact-head closure and the authorized npm/runtime patches are recorded in `Memory.md`; the current maintenance boundary is GitHub release alignment, not new Phase 8 implementation.

The broader [`openai/codex` project review](reviews/2026-07-26-openai-codex-project-review.md) preserves the existing security/transaction/CI strengths and prioritizes, after OAuth, an explainable configuration kernel, Windows background lifecycle, unified diagnostics, incremental server/CLI domain extraction, and a separately authorized native Windows isolation feasibility study. The detailed [post-Phase-8 plan](superpowers/plans/2026-07-26-post-phase-8-project-improvement-plan.md) is advisory and grants no implementation authority.

### Phase 9 — Subagents

Deferred until workspace isolation, process management, audit, worktrees, and delegated scopes are stable.
