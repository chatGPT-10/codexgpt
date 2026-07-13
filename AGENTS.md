# CodexPro Personal Fork — Project Instructions

## 1. Mission

This repository is the user's personal CodexPro fork. Evolve it incrementally into a Windows-native, security-first, self-hosted local development bridge for ChatGPT.

Target network path:

```text
ChatGPT web
  -> HTTPS
mcp.<user-domain>
  -> Cloudflare DNS/TLS/Tunnel
127.0.0.1:8787
  -> customized CodexPro
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
- Do not bypass CodexPro secret-content protections.
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

Archive entry fields:

```text
Step ID and title
Status
Goal
Files changed
Implementation summary
Verification commands
Verification results
Decisions made
Risks or limitations
Rollback method
Next step
```

Memory rules:

- Keep `Memory.md` at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archive volumes are append-only; do not silently rewrite archived history.
- Append corrections to archived facts as new correction entries.
- After each complete STEP, check the active phase archive size. If it is at or above 80% of the configured direct-read byte limit, close that volume, leave it unchanged, and start the next STEP in a numbered continuation volume. Do not rename or repartition earlier volumes.
- At phase completion, close the active volume. Create the next phase archive only when that phase begins; record between-phase maintenance in `docs/memory/archive/interphase-maintenance.md`.
- Record materially relevant failed attempts and their causes.
- Do not store secrets, complete tokens, private keys, or sensitive file contents.
- Keep paths repository-relative unless an absolute path is necessary to explain an environment problem.
- If no source file changed, record `Files changed: none`.

## 5. Active technical rules

### 5.1 Public entry and authentication

- `scripts/codexpro-entry.mjs` is the supported public CLI entry.
- Direct `node scripts/codexpro.mjs` invocation bypasses entry-layer protections and is not the supported public launch path.
- The supported public CLI uses the personal query-token compatibility flow for ChatGPT Web when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset.
- The CLI may print and copy the credential-bearing Server URL for that flow and must instruct `Authentication: None / No Authentication`.
- Treat the URL as a secret: it may leak through browser history, clipboard contents, screenshots, logs, and copied links.
- `CODEXPRO_ALLOW_QUERY_TOKEN=0` explicitly disables URL credentials for advanced compatible clients that can send an `Authorization: Bearer` header.
- Server-side Bearer support remains available for compatible clients, but documentation must not claim ChatGPT Web supports manual static-Bearer configuration.
- OAuth 2.1 is the later standards-based direction and requires separate explicit approval before implementation.
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
- Full Bash is for trusted local repositories only.

### 5.5 External references

- DevSpace is the primary workflow reference.
- Serena is an optional semantic-provider reference.
- Desktop Commander is a process-management reference.
- External designs must not bypass workspace, permission, path, authentication, or edit-policy boundaries.
- Before copying external source, verify license and attribution requirements. Prefer design-level reimplementation.

## 6. Documentation map

- `Memory.md` — current state and next action.
- `docs/memory/archive/phase-0-and-0.5.md` — closed Phase 0 and Phase 0.5 history through STEP-065.
- `docs/memory/archive/interphase-maintenance.md` — closed maintenance records from STEP-066 through STEP-072.
- `docs/memory/archive/phase-1.md` — unchanged Phase 1 Volume 1 covering STEP-073 through STEP-139.
- `docs/memory/archive/phase-1-part-2.md` — active Phase 1 Volume 2 from STEP-140 onward.
- `docs/superpowers/specs/2026-07-12-server-config-output-schema-design.md` — approved design for the first Phase 1 vertical slice.
- `docs/superpowers/plans/2026-07-12-server-config-output-schema.md` — executed plan for the completed first Phase 1 `server_config` vertical slice.
- `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md` — approved design for the published second Phase 1 `tree` slice.
- `docs/superpowers/plans/2026-07-12-tree-output-schema.md` — executed four-task plan for the published `tree` slice.
- `docs/superpowers/specs/2026-07-12-read-output-schema-design.md` — approved and published design for the third Phase 1 `read` slice.
- `docs/superpowers/plans/2026-07-12-read-output-schema.md` — executed four-task plan for the published `read` slice.
- `docs/superpowers/specs/2026-07-12-git-status-output-schema-design.md` — approved and published design for the fourth Phase 1 `git_status` slice.
- `docs/superpowers/plans/2026-07-12-git-status-output-schema.md` — compact executed four-task plan for the published `git_status` slice.
- `docs/superpowers/specs/2026-07-12-git-diff-output-schema-design.md` — approved design for the fifth Phase 1 `git_diff` slice.
- `docs/superpowers/plans/2026-07-12-git-diff-output-schema.md` — executed four-task plan for the `git_diff` slice.
- `docs/superpowers/specs/2026-07-12-show-changes-output-schema-design.md` — published design for the sixth Phase 1 `show_changes` slice.
- `docs/superpowers/plans/2026-07-12-show-changes-output-schema.md` — executed four-task plan for the published `show_changes` slice.
- `docs/superpowers/specs/2026-07-12-search-output-schema-design.md` — published design for the seventh Phase 1 direct `search` slice.
- `docs/superpowers/plans/2026-07-12-search-output-schema.md` — executed four-task plan for the published `search` slice.
- `docs/superpowers/specs/2026-07-13-write-output-schema-design.md` — published design for the eighth Phase 1 direct `write` slice.
- `docs/superpowers/plans/2026-07-13-write-output-schema.md` — executed four-task plan for the eighth `write` slice.
- `docs/superpowers/specs/2026-07-13-edit-output-schema-design.md` — published design for the ninth Phase 1 direct `edit` slice.
- `docs/superpowers/plans/2026-07-13-edit-output-schema.md` — executed four-task implementation plan for the published ninth `edit` slice.
- `docs/superpowers/specs/2026-07-13-apply-patch-output-schema-design.md` — published design for the tenth Phase 1 direct `apply_patch` slice.
- `docs/superpowers/plans/2026-07-13-apply-patch-output-schema.md` — executed four-task TDD plan for the published tenth `apply_patch` slice.
- `docs/superpowers/specs/2026-07-13-bash-output-schema-design.md` — published design for the eleventh Phase 1 direct `bash` slice.
- `docs/superpowers/plans/2026-07-13-bash-output-schema.md` — executed four-task TDD plan for the published eleventh `bash` slice.
- `docs/superpowers/specs/2026-07-13-open-current-workspace-output-schema-design.md` — published design for the twelfth Phase 1 direct `open_current_workspace` slice; exact-head CI verification is pending.
- `docs/superpowers/plans/2026-07-13-open-current-workspace-output-schema.md` — executed four-task TDD plan for the locally verified twelfth `open_current_workspace` slice.
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md` — historical audit baseline, reference projects, target architecture, tool groups, contracts, and Phase 0–9 roadmap.
- `SECURITY.md` — active security guidance and public-entry rules.
- `CLOUDFLARED_VERIFIED_INSTALL.md` — pinned Cloudflared installation and routing policy.
- `design.md` — UI and documentation visual design rules.
- `README.md` / `README_ZH.md` — user-facing setup and usage.

Do not duplicate long architecture descriptions, historical narratives, or step logs in this file. Update the appropriate document and keep only rules required for the next coding session here.

## 7. Verification rules

For every implementation step:

1. Inspect current Git changes.
2. Run the narrowest relevant regression first.
3. Run build or typecheck when the backend is available.
4. Run the relevant smoke suite.
5. Run `git diff --check` or an equivalent dedicated check.
6. Confirm no secret-looking values were introduced.
7. Confirm only intended files changed.
8. Update `Memory.md` and append the phase archive entry.

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

## 9. Current approved stopping point

Phase 0.5 is formally closed. All approved local, Ubuntu/Windows CI, and real external Cloudflare Host-forwarding gates passed. Public `https://codexpro.drliang.uk/healthz` reached CodexPro through Cloudflare and passed Host validation before returning the expected authentication-layer `401 Unauthorized`. OAuth 2.1 remains deferred.

Phase 1 implementation started on 2026-07-12. The first eleven vertical slices are published and cross-platform CI-validated. Direct `bash` was published through commit `a39b779`; CI run `29239425311` passed on Ubuntu/Windows with Node 20/24. The twelfth direct `open_current_workspace` slice was published as commit `d887849` after focused 13/13, complete regression 202/202, Build, Smoke 8/8, native-Windows Stress, and `neat-freak` reconciliation. Exact-head CI remains pending because the current environment cannot query GitHub Actions. Do not begin Phase 2 until the remaining Phase 1 scope is explicitly reviewed.
