# CodexGPT Personal Fork — Project Instructions

## 1. Mission

This repository is the user's personal CodexGPT fork. Evolve it incrementally into a Windows-native, security-first, self-hosted local development bridge for ChatGPT.

Target network path:

```text
ChatGPT web
  -> HTTPS
mcp.<user-domain>
  -> Cloudflare DNS/TLS/Tunnel
127.0.0.1:8787
  -> customized CodexGPT
  -> explicitly authorized local workspaces
```

Remain self-hosted. Cloudflare is only DNS/TLS/Tunnel; do not add a project-operated Remote MCP relay without explicit user approval.

## 2. Environment and hard constraints

- Primary platform: native Windows.
- Do not make WSL mandatory.
- PowerShell support is a core requirement.
- Git Bash is the temporary Windows execution backend; Bash may remain optional.
- Prefer Cloudflare Tunnel bound to `127.0.0.1`; do not expose a local inbound port directly.
- Enforce security boundaries locally, not only at Cloudflare.
- Never leak tokens in logs, diffs, generated documentation, test fixtures, or URLs shown unnecessarily.
- Safe Bash is a policy filter, not an operating-system sandbox.
- Project build and test commands execute repository code with the current user's permissions.

## 3. Working method

- Work in small, reviewable, reversible steps.
- Implement or change one feature at a time.
- Prefer localized changes over broad rewrites.
- Do not mix unrelated refactors, formatting, and feature work.
- Before implementation, inspect relevant source, tests, configuration, project rules, memory, and Git state.
- Use test-driven development for behavior changes and bug fixes.
- Verify with fresh command output before claiming completion.
- Use explicit assumptions; do not present unverified security properties as guarantees.
- Do not bypass CodexGPT secret-content protections.
- Pause for user confirmation before architecture changes, irreversible operations, credential migration, access expansion, staging, commits, pushes, destructive Git actions, or history rewrites.

## 4. Memory protocol

The repository uses two memory layers:

- Root `Memory.md` is a concise editable index containing current state, active decisions, open items, recent step summaries, and archive links.
- `docs/memory/archive/` contains complete append-only implementation records grouped by phase.

After every meaningful completed step:

1. Append a dated full entry to the active phase archive or, between phases, the interphase maintenance archive.
2. Update `Memory.md` in place.
3. Record exact verification commands and results.
4. Record risks, limitations, rollback, and the next approved action.

Every archive entry records the step/title, status, goal, changed files, implementation, exact verification/results, decisions, risks, rollback, and next step.

Memory rules:

- Keep `Memory.md` at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archive volumes are append-only; do not silently rewrite archived history.
- Append corrections to archived facts as new correction entries.
- After each complete STEP, check the active phase archive size. If it is at or above 80% of the configured direct-read byte limit, close that volume, leave it unchanged, and start the next STEP in a numbered continuation volume. Do not rename or repartition earlier volumes.
- At phase completion, close the active volume. Create the next phase archive only when that phase begins; record between-phase work in the current interphase maintenance archive.
- Record materially relevant failed attempts and their causes.
- Do not store secrets, complete tokens, private keys, or sensitive file contents.
- Keep paths repository-relative unless an absolute path is necessary to explain an environment problem.
- If no source file changed, record `Files changed: none`.

## 5. Rules

### 5.1 Public entry and authentication

- `scripts/codexgpt-entry.mjs` is the only supported public CLI; direct `scripts/codexgpt.mjs` bypasses entry protections.
- With `CODEXGPT_ALLOW_QUERY_TOKEN` unset, ChatGPT Web uses the personal query-token URL with `Authentication: None / No Authentication`; it is password-equivalent and may leak through browser history, clipboard, screenshots, logs, and copied links. Hide it from normal startup logs. `CODEXGPT_ALLOW_QUERY_TOKEN=0` is only for Bearer-capable clients, never claimed as ChatGPT Web static-Bearer setup.
- OAuth is governed solely by Phase 8 and its gates. Non-loopback/tunnel modes fail closed without authentication, and Host/Origin checks remain local.

### 5.2 Cloudflared

- Supported Cloudflare starts use the SHA-256/version-verified managed binary; `PATH` cannot silently replace it, `--cloudflared <path>` is the only override, and quick-tunnel Host forwarding needs a real external check.

### 5.3 Windows paths

- Canonicalize roots with native realpath and case-insensitive blocked-path matching; reject device/UNC/drive-relative/ADS/reserved/trailing-dot-or-space/cross-drive paths and all symlink/junction escapes. Never weaken secret-file rules for a test or edit.

### 5.4 Shell execution

- Legacy `bash` uses Git Bash; V3 `full_access` uses native PowerShell/process; neither is isolation. Doctor reports missing Bash; `bash: off` needs none and `--no-profile` skips profiles.
- With `inheritEnv=false`, pass only bounded Windows discovery paths, never arbitrary parent tokens such as `GH_TOKEN`. `CODEXGPT_INHERIT_ENV=1` and full Bash are trusted-local-repository opt-ins.

### 5.5 References

- DevSpace is primary; Serena/Desktop are optional. Preserve external boundaries; verify license/attribution and prefer reimplementation.

### 5.6 Workspace

- Public `workspace_id` values are random opaque, session-local handles. Every lifecycle domain owns its `WorkspaceManager`; only `resolveWorkspace()` holds omitted-ID compatibility. Foreign, stale, closed, expired, or policy-stale handles fail closed without leakage, and `close_workspace` stays off the read-only connection-test surface.

### 5.7 Mutation inventory

- `test/mutation-architecture.test.mjs` is the fail-closed inventory for mutation primitives in `src/` and shipped scripts. It binds canonical path, location, semantic call digest, and reviewed purpose; drift fails CI.
- Production direct writes are limited to transaction/state/audit/documented installer runtime. The legacy `fsOps.ts`/`handoffOps.ts` writers are a one-cycle `fileTransactions=legacy` exception; the default atomic path must select prepared transactions without fallback. Fixture exclusions are exact source files only.

### 5.8 Operational reliability gates

The following rules are mandatory and are enforced by `npm run policy:check` plus CI contract tests:

- Reproduce Windows with `scripts/toolchain-manager.mjs` and its verified manifest at the retained `%LOCALAPPDATA%\CodexPro\toolchains` root. Platform-sensitive publication needs both pinned Node 20/24 majors; root migration needs separate approval.
- `scripts/test-domains.mjs` is authoritative: run `ordinary` through `scripts/long-task-runner.mjs`; use `control`/`all` only in CI or an independent native terminal; retain bounded evidence; stop only an exact owned run ID. Renewable leases are observational, must survive cleanup pressure, and cannot manufacture a premature failure.
- Focused/local work uses `npm run test:focused -- <files...>` and `npm run task:run -- <command...>` with owned temporary roots. Cleanup deletes only verified dead-owner marked roots/evidence; it never deletes persistent workspace, candidate, recovery, credential, audit, or toolchain state.
- Recovery may defer only for an exact live mutation lock returning `TRANSACTION_BUSY`; all other recovery errors fail closed. Mutation review identity must use repository path, syscall type, and a normalized semantic AST/call digest; never use timestamps or monotonic file IDs.
- Diagnose CI with `scripts/exact-head-ci.mjs` or `scripts/ci-failure-summary.mjs`, bounded user/config state, and ignored `.ai-bridge/` evidence. A phase closes only on its closure SHA's exact-head CI; never create a follow-up repository commit solely to record the run ID. Runtime changes need the complete Ubuntu/Windows Node 20/24 matrix; docs need the documentation/policy gate. `npm run policy:check` is required before staging and in every CI path, including documentation-only changes.
- Large single files must be read through explicit line ranges. Scan ceilings never enlarge connector response ceilings.

### 5.9 Phase 4 design boundary

- Follow the paired Phase 4 [spec](docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md) and [plan](docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md). Preserve V1=28/V2=31/V3=39 and their enforce/audit/session/atomic/approval contracts. `confirmed_roots` stays brokered; `full_access` has no filesystem, credential, registry, network, or broker isolation; `workspace` has no fallback. 4B0/4B1–4B6 remain blocked/deferred; destructive ownership tests need an independent control harness.

### 5.10 Phase 5 design boundary

- Follow the paired Phase 5 [spec](docs/superpowers/specs/2026-07-16-phase-5-git-and-task-worktrees-design.md) and [plan](docs/superpowers/plans/2026-07-16-phase-5-git-and-task-worktrees.md). V4 is opt-in exact 51. Safe Git requires fixed identity, private index/object quarantine, complete mutation tokens, R3 ref/history approval, and journaling; Gate X exposes only its four typed local operations, never a caller-selected command. No remote, credential, force, or config mutation; managed worktrees are owner-bound artifacts, not sandboxes/authority expansion.

### 5.11 Phase 6 design boundary

- Follow the adversarially reviewed Phase 6 [spec](docs/superpowers/specs/2026-07-22-phase-6-project-guidance-and-skills-design.md) and [plan](docs/superpowers/plans/2026-07-22-phase-6-project-guidance-and-skills.md). Guidance/Skills add no authority: reads are canonical same-handle and bounded, automatic metadata is budgeted, bodies/resources stay lazy, and scripts/dependencies/Hooks never auto-run. Omitted mode is `standard`; explicit `legacy` is rollback; frozen Apps need one **Scan Tools** refresh or recreation.

### 5.12 Phase 7 design boundary

- Follow the execution/security/UX-reviewed Phase 7 [spec](docs/superpowers/specs/2026-07-23-phase-7-semantic-providers-design.md) and [plan](docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md). Core uses its owned JS/TS engine, exact V5=52 `semantic`, honest fallback, and a server-owned rename plan only through V5 `apply_patch`; same-handle `nlink === 1` and Phase 3 lock-held identity/hash preconditions remain mandatory. V1–V4 stay 28/31/39/51; `legacy` rolls back. Real G7-U is required; Serena/LSP stay separately authorized, with no Provider mutation/command authority or sandbox claims.

### 5.13 Phase 8 design boundary

- Follow the 2026-07-26 Phase 8 [spec](docs/superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md) and [plan](docs/superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md). Phase 8 Core is closed: G8-0, Tasks 8A1–8A9, real G8-U Journeys U2–U7, local G8-X, and exact-head Ubuntu/Windows Node 20/24 CI passed at `55b2b5664aae322ec992968a41c87a289fb75282` / run `30274857996`. Preserve the U6 deleted-App evidence substitution, U7 public-loopback/local-admin boundary, `legacy|oauth` exclusivity, credential-free `authRoutes`, two-App rollback via `auth setup --root`, Windows DPAPI CurrentUser, strict DCR/PKCE and token/session bounds, durable revoke/replay, request-local policy identity, no-deletion recovery, no new execution authority, and exact V1–V5 counts `28/31/39/51/52`.
- The [`openai/codex` review](docs/reviews/2026-07-26-openai-codex-project-review.md) and [post-Phase-8 improvement plan](docs/superpowers/plans/2026-07-26-post-phase-8-project-improvement-plan.md) are advisory only and grant no implementation authority.

## 6. Documentation map

- `Memory.md` indexes current state and `docs/memory/archive/` append-only history.
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md` controls sequencing; paired files under `docs/superpowers/specs/` and `plans/` control exact phase contracts/TDD.
- `README.md`, `README_ZH.md`, `SECURITY.md`, `CLOUDFLARED_VERIFIED_INSTALL.md`, and `design.md` are the active user/security/design references. `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md` is a historical baseline.

Keep long mechanisms and history out of this rule file.

## 7. Verification rules

For every implementation step:

1. Inspect current Git changes.
2. Run the narrowest relevant regression first.
3. Run build or typecheck when the backend is available.
4. Run the relevant smoke suite.
5. Run `git diff --check` or an equivalent dedicated check.
6. Confirm no secret-looking values were introduced.
7. Confirm only intended files changed.
8. Run `npm run policy:check`.
9. For platform/runtime-sensitive changes, verify through the managed Node 20/24 toolchains; launch long suites through the detached runner rather than the connector request.
10. Update `Memory.md` and append the phase archive entry.

Distinguish clearly between:

- passed;
- failed because of code;
- not run;
- blocked by environment;
- skipped by platform capability.

## 8. Rollback and compatibility

- Use feature flags for migrations that affect existing connectors.
- Keep deprecated configuration readable for at least one migration period.
- Avoid schema-breaking changes without a version and compatibility path.
- Keep each step independently reversible where practical.
- Never delete user configuration, profiles, tokens, branches, worktrees, or audit data without explicit confirmation.

## 9. Current approved execution boundary

Phases 1–8 Core are closed. Phase 7 Core closed at `a0b9f46e2297297959527f7570c9cb7942cc8fb3` / run `30171313296`; Phase 8 Core closed at `55b2b5664aae322ec992968a41c87a289fb75282` / run `30274857996`. Phase 4's 4B0 stays blocked/non-production; `workspace` and Tasks 4B1–4B6 stay deferred. Preserve verified Node toolchains; use `Memory.md` for current evidence and next action.

The npm releases `codexgpt@1.0.0` through `codexgpt@1.0.4` are published and immutable; corrections require a new semantic version. `1.0.3` and `1.0.4` were explicitly authorized bounded repairs, not blanket post-`1.0.0` authority. No further implementation or deployment is implicitly authorized. U6 proves replacement Legacy compatibility and OAuth return continuity, not recovery of the deleted original App identity. Credential migration, unrelated Cloudflare/Tunnel/DNS mutation, Phase 7B/7C installs, Task Scheduler/service, sandbox/egress, runtime deployment, destructive history, Phase 9, and unrelated scope remain gated. Do not create an evidence-only commit solely to record a CI run ID.
