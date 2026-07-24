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

The implementation must remain self-hosted. Cloudflare is used only for DNS, TLS, and Tunnel. Do not introduce a dependency on a project-operated Remote MCP relay unless the user explicitly changes this decision.

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

## 5. Active technical rules

### 5.1 Public entry and authentication

- `scripts/codexgpt-entry.mjs` is the supported public CLI entry.
- Direct `node scripts/codexgpt.mjs` invocation bypasses entry-layer protections and is not the supported public launch path.
- The supported public CLI uses the personal query-token compatibility flow for ChatGPT Web when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset.
- The CLI may copy the credential-bearing Server URL for that flow and must instruct `Authentication: None / No Authentication`; public startup logs keep it hidden unless the user explicitly presses `u` or requests the Create App fields.
- Treat the URL as a secret: it may leak through browser history, clipboard contents, screenshots, logs, and copied links.
- `CODEXGPT_ALLOW_QUERY_TOKEN=0` explicitly disables URL credentials for advanced compatible clients that can send an `Authorization: Bearer` header.
- Server-side Bearer support remains available for compatible clients, but documentation must not claim ChatGPT Web supports manual static-Bearer configuration.
- OAuth 2.1 is the later standards-based direction. Its Phase 8 implementation is authorized only within the execution boundary in Section 9 and must pass the dedicated identity, migration, rollback, and security gates before activation.
- Non-loopback and tunnel modes must fail closed without authentication unless an explicit reviewed override exists.
- Host and Origin checks must run locally.

### 5.2 Cloudflared

- Supported Cloudflare start paths use the pinned verified installer and exact managed binary path.
- Verify the pinned SHA-256 digest and reported version before installation.
- Do not allow a different `cloudflared` from `PATH` to replace the verified managed binary implicitly.
- Explicit `--cloudflared <path>` remains a manual override.
- Cloudflare quick-tunnel Host forwarding is not considered validated until a real external check passes.

### 5.3 Windows paths

- Canonicalize allowed roots and workspace paths with native realpath behavior.
- Windows blocked-path matching is case-insensitive.
- Reject Windows device paths, UNC paths, drive-relative paths, NTFS alternate data streams, reserved device names, trailing dot/space segments, and cross-drive escapes.
- Reject symlink or junction escapes for reads and writes.
- Never weaken blocked secret-file rules to make a test or edit easier.

### 5.4 Shell execution

- Git Bash is temporary; native PowerShell remains planned work.
- Doctor must report an unavailable required Bash backend before a Bash tool call fails.
- A saved profile with `bash: off` must not require Bash.
- `doctor --no-profile` must skip every saved-profile read and validation.
- With `inheritEnv=false`, keep arbitrary parent variables and tokens out of Bash. On Windows, preserve or derive only the bounded user/configuration paths needed for normal CLI and OS-keyring discovery; never solve CLI authentication by copying `GH_TOKEN` into the child environment.
- `CODEXGPT_INHERIT_ENV=1` exposes the complete parent environment and is restricted to trusted local repositories.
- Full Bash is for trusted local repositories only.

### 5.5 External references

- DevSpace is primary; Serena and Desktop Commander are optional semantic/process references.
- External designs must preserve workspace, permission, path, authentication, and edit-policy boundaries.
- Verify license and attribution before copying external source; prefer design-level reimplementation.

### 5.6 Workspace lifecycle

- Public `workspace_id` values are random opaque handles, never canonical-path hashes.
- Each MCP server lifecycle domain owns its own `WorkspaceManager`; do not restore process-global manager sharing.
- Core `getWorkspace(id)` requires an explicit ID. Omitted-ID compatibility belongs only in the named session-local `resolveWorkspace()` boundary.
- Foreign, closed, expired, transport-stale, or policy-stale handles must fail closed without revealing roots, keys, identity bindings, or revocation reasons.
- `close_workspace` is a normal lifecycle tool but must remain hidden from the read-only connection-test surface.

### 5.7 Direct mutation inventory

- `test/mutation-architecture.test.mjs` is the fail-closed inventory for filesystem mutation primitives in `src/` and shipped runtime scripts. Every occurrence is bound to a canonical repository path, line, column, call digest, and reviewed purpose; additions and line/call drift must fail CI.
- Production direct writes are limited to the transaction filesystem backend, atomic application-state files, persistent audit maintenance, and documented installer/runtime state outside authorized workspaces.
- The exact direct writers in `src/fsOps.ts` and `src/handoffOps.ts` are a one-cycle compatibility exception for `fileTransactions=legacy` only. The static gate must also prove that the default atomic server path selects prepared transaction mutations before any legacy provider and never falls back to these writers.
- Fixture writers are excluded only by the test's exact source-file selection. Do not add directory, filename-pattern, or regular-expression exemptions.

### 5.8 Operational reliability gates

The following rules are mandatory and are enforced by `npm run policy:check` plus CI contract tests:

- Use `scripts/toolchain-manager.mjs` and a verified manifest for exact Windows Node 20/24 reproduction. This checkout currently uses the retained legacy `%LOCALAPPDATA%\CodexPro\toolchains` root explicitly; migration to the default `%LOCALAPPDATA%\CodexGPT\toolchains` root requires separate approval. Temporary runtimes are migration sources only; platform-sensitive changes require both pinned majors before publication.
- `scripts/test-domains.mjs` is authoritative. Run `ordinary` through `scripts/long-task-runner.mjs`; run `control`/`all` only in CI or a proven independent native terminal. Retain bounded run evidence, prove no same-kind run is active before retrying, and stop only an exact owned run ID—never all `node.exe` processes.
- Detached-run liveness uses exact renewable `worker-lease.json` evidence for `running` and `finalizing`. The lease is observational only, never authorizes stop or deletion, and tests must not declare failure before the bounded lease can expire. Register every task child's `error` and `close` observers before the first awaited metadata write so fast completion cannot be lost. Lease renewal must remain independent of the asynchronous cleanup/retention filesystem queue and use bounded retries for transient Windows replacement-sharing failures so CI pressure cannot manufacture stale state.
- Transaction recovery may defer only when an exact verifiable live workspace mutation lock returns `TRANSACTION_BUSY`; this is not a recovered or cached readiness state. Every later use may retry recovery, and all non-live-lock recovery errors remain fail-closed.
- Use `npm run test:focused -- <files...>` and `npm run task:run -- <command...>` for focused tests and local tasks. They and detached tasks isolate `TEMP`/`TMP`/`TMPDIR` in marked owned roots; detached evidence defaults to 20 terminal runs and 14 days. `npm run task:cleanup` may delete only verified dead-owner `codexgpt-owned-v1-*` roots and terminal run evidence, never unmarked temporary entries or persistent worktree, candidate, recovery, credential, audit, or toolchain state.
- Diagnose CI with `scripts/exact-head-ci.mjs` or `scripts/ci-failure-summary.mjs`, bound to the exact 40-character HEAD, bounded Windows user/config state, and no inherited GitHub tokens. Fix the first underlying error and keep evidence only under ignored `.ai-bridge/`.
- A phase closes only when its closure SHA passes exact-head CI; never create a follow-up repository commit solely to record the run ID. Runtime-relevant changes—scripts, workflows, package metadata, tests, configuration, source, or fixtures—require the complete Ubuntu/Windows Node 20/24 matrix. Documentation-only changes use the documentation/policy gate.
- Replacement fixtures must pre-create a distinct stable object before installation; never infer identity from monotonic inode/file-index or timestamps. Mutation review identity must use repository path, syscall type, and a normalized semantic AST/call digest. Line/column are diagnostic only.
- Large single files must be read through explicit line ranges. Scan ceilings must not enlarge connector response ceilings.
- `npm run policy:check` is required before staging and runs in every CI path, including documentation-only changes.

### 5.9 Phase 4 design boundary

- Follow the paired Phase 4 [spec](docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md) and [plan](docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md). Preserve V1=28/V2=31/V3=39 and all enforce/audit/session/atomic/approval, persistence, rollback, and native-host contracts. `confirmed_roots` remains brokered; `full_access` remains ambient trusted-code authority without filesystem, credential, registry, network, or broker isolation; `workspace` has no fallback. Diagnostic 4B0 stays blocked/package-excluded, Tasks 4B1–4B6 stay deferred, and destructive ownership tests run only in an independent control harness.

### 5.10 Phase 5 design boundary

- Follow the paired Phase 5 [spec](docs/superpowers/specs/2026-07-16-phase-5-git-and-task-worktrees-design.md) and [plan](docs/superpowers/plans/2026-07-16-phase-5-git-and-task-worktrees.md). V4 is opt-in exact 51 and preserves V1/V2/V3. Safe Git writes require fixed executable identity, private indexes, quarantined object promotion, complete mutation tokens, R3 ref/history approval, and journaled participants. Gate X exposes only private stage, shadow commit, quarantined object merge, and private checkout after exact binding and approval; it accepts no caller-selected Git command and remains ambient `full_access` without isolation. Managed worktrees are owner-bound workflow artifacts, not sandboxes; they do not widen `allowedRoots`, delete branches/history, or enable remote, credential, force, or config mutations.

### 5.11 Phase 6 design boundary

- Follow the adversarially reviewed Phase 6 [spec](docs/superpowers/specs/2026-07-22-phase-6-project-guidance-and-skills-design.md) and [plan](docs/superpowers/plans/2026-07-22-phase-6-project-guidance-and-skills.md). Phase 6 makes root/target AGENTS and target-scoped Agent Skills usable from the standard ChatGPT flow without Tool Contract V5 or new execution authority. Use one canonical same-handle bounded reader, keep standard user/plugin Skills explicit opt-in, budget automatic metadata, and keep bodies/resources lazy. AGENTS/Skills never grant permission; scripts, dependencies, and generic Hooks do not auto-run. The former Hook/trust-manifest Phase 6 outline is superseded. Live root/nested acceptance passed and omitted mode now defaults to `standard`; explicit `legacy` remains the one-restart rollback. Apps with frozen pre-Phase-6 tool snapshots require one **Scan Tools** refresh or recreation; transparent refresh is not claimed.

### 5.12 Phase 7 design boundary

- Follow the execution/security/UX-reviewed Phase 7 [spec](docs/superpowers/specs/2026-07-23-phase-7-semantic-providers-design.md) and [plan](docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md). Core first delivers a zero-setup owned-worker JavaScript/TypeScript engine, symbol-or-position locator, one inherited-runtime V5 `semantic` tool, honest lexical fallback, and a server-owned rename plan consumed by V5 `apply_patch`. Approval binds the exact semantic manifest, and canonical path/stable identity/hash preconditions must reach the Phase 3 lock-held second inspection; do not use `LocalMutationService` for MCP mutations. Every workspace semantic read is mandatory canonical same-handle with `nlink === 1`. MCP wire descriptors for operation unions must expose an explicit raw Zod property shape while the server retains the exact strict union parser; local-approval protocol V3 facts and grants bind the actual inherited Tool Contract 3, 4, or 5. Backend HTTP journeys and deterministic regressions do not substitute for real ChatGPT App UI G7-U evidence. V1/V2/V3/V4 remain exact 28/31/39/51; explicit-standard V5 is exact 52 and retains `legacy` rollback until Core live/publication/exact-head gates close. Core closure must not wait for external Providers. Serena is a separately authorized Phase 7B retrieval/diagnostics extension; direct LSP is Phase 7C only for a concrete unmet language need. CodexGPT must not invoke Provider protocol-level mutation/command operations, while external same-user children truthfully remain `execution_isolation: none`, `filesystem_isolation: none`, and `network_isolation: none`. No remote request may install, update, choose commands, or grant Provider authority.

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

Phases 1–6 are closed. Phase 7 Core is implemented but remains open until both its replacement exact-head matrix and real ChatGPT Gate G7-U pass. Phase 4's 4B0 stays blocked/non-production; `workspace` and Tasks 4B1–4B6 stay deferred. Preserve verified Node toolchains; use `Memory.md` for current evidence and next action.

The 2026-07-24 follow-up authorization permits only the remaining Phase 7 Core closure path: perform real G7-U where the connected ChatGPT surface is available, stage the reviewed Phase 7 repair scope, create one concise English commit, push normally, and run bounded exact-head CI diagnosis/repair cycles. It does not authorize Phase 7B/7C dependencies or installs, npm release or deployment, npm registry credentials, credential migration, force push, destructive history, Phase 8+, or unrelated scope expansion. Do not create an evidence-only follow-up commit solely to record a CI run ID.
