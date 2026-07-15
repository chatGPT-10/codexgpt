# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-15.
- Workspace: `D:\Dev\codexpro`; branch: `main`; package: `codexpro@0.28.6`.
- GitHub repository and `origin`: `chatGPT-10/codexgpt` over HTTPS.
- Primary platform: native Windows; WSL remains optional.
- Phase 0, Phase 0.5, Phase 1, the Policy Kernel Gate, Phase 2A, Phase 2B, Phase 3A, and Phase 3B are closed. Exact historical commit/run evidence is retained in the linked archives.
- Phase 3C is closed. Commit `50ec99b` passed exact-head CI run `29390317879` across Ubuntu/Windows Node 20/24 Build, Regression, complete Smoke, and Package.
- Current worktree: uncommitted post-Phase-3C maintenance that restores GitHub CLI config/keyring discovery in the narrowed Windows Bash environment without inheriting `GH_TOKEN` or unrelated API variables. Obsolete CI reproduction artifacts and the detached Phase 3A reproduction worktree have been removed.
- Phase 3D design grilling and adversarial review are complete in ignored coordination plan `.ai-bridge/current-plan.md`; implementation has not started. After maintenance publication, copy the corrected plan into the tracked Phase 3D plan before Task 1.

## Approved execution boundary

The user authorized continuous recommended-option implementation through Phase 8 and scoped staging, English commits, and pushes after each verified phase. Individual tasks receive local design/TDD/verification gates only; publish once at a complete phase boundary after neat-freak and the full local gate, then require exact-head CI before beginning the next phase. Gate 0 maintenance publication is approved and Phase 3D may begin only after its exact-head CI is green. Destructive user-data/history operations, production deployment, credential disclosure or migration, and silent expansion beyond the approved specifications remain excluded.

## Active decisions and constraints

- Keep CodexPro self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization and path enforcement remain local.
- Native Windows is primary. Git Bash is the temporary execution backend; native PowerShell remains required future work.
- Safe Bash is a command-policy filter, not an operating-system sandbox.
- `scripts/codexpro-entry.mjs` is the supported public CLI entry; direct `scripts/codexpro.mjs` launch is unsupported.
- The public CLI defaults to the personal ChatGPT query-token flow when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; `CODEXPRO_ALLOW_QUERY_TOKEN=0` is only for compatible non-ChatGPT Bearer clients.
- Server-side Bearer support must not be documented as manual static-Bearer support in ChatGPT Web. OAuth 2.1 remains reserved for Phase 8 and requires its dedicated identity, migration, rollback, and security gates.
- Phase 1 output envelopes remain closed: tool identity plus `ok`, `data`, `error`, and `meta`. Policy failures occur before those envelopes rather than reopening them.
- Policy Kernel uses an immutable compiled snapshot and pure deterministic evaluator. Tool Surface, Policy, Approval, and Sandbox remain separate; grants cannot exceed hard policy, identity scopes, Permission Profile, allowed roots, or demonstrated capabilities.
- `CODEXPRO_POLICY_ENGINE=legacy` remains the migration default; `shadow` is observational and `enforce` is fail-closed. No approval-management surface exists yet.
- Public `workspace_id` values are random session-scoped handles. Core lookup requires an explicit ID; omitted-ID compatibility exists only at the named session-local resolver.
- Keep `scripts/smoke.mjs` and `scripts/http-smoke.mjs` protected and unchanged. Compatibility loaders use exact fail-closed in-memory substitutions.
- Phase 3 is split into 3A transaction kernel, 3B persistent audit, 3C all-mutator migration plus bounded undo internals, and 3D `move_paths` plus total acceptance.
- `CODEXPRO_FILE_TRANSACTIONS=legacy` remains the compatibility default. Selecting `atomic` routes supported workspace writers through the transaction runtime with no direct-write fallback; writable atomic V1 requires terminal persistent audit.
- Phase 3 state stays outside workspaces and Git. The hard-link backend fails closed when unsupported and does not claim database-style cross-file instantaneous atomicity.
- Phase 3C injects one persistent runtime per production MCP server lifecycle. Public V1 remains exactly 28 tools; query/undo V2 adapters remain non-public until Phase 3D completes the exact 31-tool surface with `move_paths`.
- Phase 3D must repair the durable commit decision and participant-aware recovery for both existing Manifest V1 writers and new Manifest V2 moves before V2 activation. Participant-complete recovery finishes commit; participant-empty recovery rolls back; partial or unverifiable evidence is reconciled or freezes the workspace.
- `move_paths` uses one existing transaction engine with `TransactionManifestV2` and `ChangeSetManifestV2`; existing create/replace/delete writers continue persisting V1. Source proof is handle-based with stable file-object identity and bounded streaming hashes.
- `move_paths preview` performs full non-mutating policy/path/hash/same-device validation but cannot promise that a later hard-link attempt will succeed. Actual link permission is proven only inside the locked execution transaction.
- With `inheritEnv=false`, Windows Bash preserves or derives only bounded user/configuration paths required for normal CLI and keyring discovery. Do not copy `GH_TOKEN` or arbitrary API variables into the child; `CODEXPRO_INHERIT_ENV=1` is explicit full-environment opt-in for trusted repositories only.
- Installation identity is privately created, fully synced, and published once through a same-volume no-clobber hard link. Competing first-open processes must converge on the published state; persisted corruption fails closed.
- `test/mutation-architecture.test.mjs` binds each direct mutation primitive to exact path, location, digest, and reviewed purpose. Atomic production paths must prepare transactions first and cannot fall back to the one-cycle legacy writers.
- CI debugging trusts live HEAD, worktree, and exact job logs over narrative memory. Classify failures before editing, reproduce the failing OS/runtime, and never run lifecycle suites through the same process carrying the control channel.
- The master implementation plan is the sequencing authority. The complete regression command is `node --test test/*.test.mjs`; there is no `npm test` script.

## Verification evidence

- Phase 3C: commit `50ec99b97f7ec3e4d689b5306f0caa0f60afdc45`; run `29390317879`; all four Ubuntu/Windows Node 20/24 jobs passed Build, Regression, complete Smoke, and Package.
- Current Bash maintenance: Bash contract 15/15; combined Bash/Doctor/Self-test/documentation gate 40/40; TypeScript Build and main Smoke passed; `git diff --check` passed; the credential-shape scan returned no matches.
- A real `gh auth status` launched with `createBashEnvironment({ inheritEnv: false })` exited 0 for account `chatGPT-10` through the Windows keyring. The child did not inherit `GH_TOKEN`; CLI output exposed only its normal masked token display.

## Known limitations

- Phase 2A has no user-facing approval issuance surface; `enforce` may return `APPROVAL_REQUIRED`, and arbitrary Shell/Process execution remains unavailable without demonstrated OS isolation.
- Workspace lifecycle state is intentionally process-local. OAuth owner identity and lifecycle persistence remain out of scope.
- Published Phase 3C recovery still has an unresolved participant commit-decision crash window: if all required participant effects become durable before the final committed-manifest write, current recovery policy may restore filesystem before-state. Phase 3D participant reconciliation is a closure blocker; public V2 must remain fail-closed until it passes crash-boundary tests.
- External processes remain outside CodexPro's workspace lock. Phase 3D can reduce path-replacement TOCTOU with open-handle identity checks but cannot provide an OS-wide write lock, serializable namespace visibility to arbitrary readers, or absolute power-loss durability when directory sync is unsupported.
- Environment narrowing is defense in depth, not credential isolation; same-user child processes may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- Protected main/HTTP Smoke compatibility depends on exact source strings; drift fails closed and requires a same-change compatibility update.
- Public contract V2 remains unavailable until Phase 3D implements `move_paths` and validates direct/supertool/policy/inventory/self-test/Tool Card parity.
- Atomic `apply_patch` is bounded UTF-8 create/replace/delete only and fails closed for binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.

## Open items

1. Publish the verified Gate 0 maintenance batch and require exact-head Ubuntu/Windows Node 20/24 CI.
2. After that exact-head CI is green, copy the adversarially corrected `.ai-bridge/current-plan.md` into `docs/superpowers/plans/2026-07-15-phase-3d-move-paths-and-acceptance.md`, reconcile the approved Phase 3D design errata, and begin Task 1 wire-contract/native-Windows feasibility probes.

## Recent summaries

- **STEP-299 - Adversarially correct the Phase 3D plan:** identified the existing participant commit-decision crash window plus preview capability, path/handle TOCTOU, Change Set V2, lifecycle, retry, wire-contract, and platform-test gaps; expanded the ignored coordination plan to a 16-task fail-closed implementation and acceptance sequence. No implementation code changed.
- **STEP-298 - Remove obsolete CI reproduction artifacts:** removed the clean detached Phase 3A worktree plus ignored CI checkouts, temporary Node 20 runtime, logs, HTML captures, and anonymous cookies while preserving all active `.ai-bridge` coordination files.
- **STEP-297 - Preserve GitHub CLI keyring discovery:** derived Windows app-data/config paths from `USERPROFILE`, kept token variables excluded, updated public security guidance, and passed focused tests, Build, real `gh auth status`, and main Smoke. Publication remains pending.
- **STEP-296 - Close Phase 3C publication:** commit `50ec99b` passed exact-head run `29390317879` across all four Ubuntu/Windows Node 20/24 matrices.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Phase 1 Volume 1 — STEP-073 through STEP-139](docs/memory/archive/phase-1.md)
- [Closed Phase 1 Volume 2 — STEP-140 through STEP-151](docs/memory/archive/phase-1-part-2.md)
- [Closed Phase 1 Volume 3 — STEP-152 through STEP-165](docs/memory/archive/phase-1-part-3.md)
- [Closed Phase 1 Volume 4 — STEP-166 through STEP-179](docs/memory/archive/phase-1-part-4.md)
- [Closed Phase 1 Volume 5 — STEP-180 through STEP-193](docs/memory/archive/phase-1-part-5.md)
- [Closed Phase 1 Volume 6 — STEP-194 through STEP-205](docs/memory/archive/phase-1-part-6.md)
- [Closed Phase 1 Volume 7 — STEP-206 through STEP-219](docs/memory/archive/phase-1-part-7.md)
- [Closed Phase 1 Volume 8 — STEP-220 through STEP-236](docs/memory/archive/phase-1-part-8.md)
- [Closed Phase 1 Volume 9 — STEP-237 through STEP-247](docs/memory/archive/phase-1-part-9.md)
- [Policy Kernel Gate — STEP-248 through STEP-253](docs/memory/archive/policy-kernel-gate.md)
- [Closed Phase 2B Workspace Lifecycle — STEP-254 through STEP-262](docs/memory/archive/phase-2b-workspace-lifecycle.md)
- [Closed Phase 3 Volume 1 — STEP-263 through STEP-277](docs/memory/archive/phase-3.md)
- [Closed Phase 3 Volume 2 — STEP-278 through STEP-285](docs/memory/archive/phase-3-part-2.md)
- [Closed Phase 3 Volume 3 — STEP-286 through STEP-291](docs/memory/archive/phase-3-part-3.md)
- [Active Phase 3 Volume 4 — STEP-292 onward](docs/memory/archive/phase-3-part-4.md)

## Memory maintenance protocol

- Edit this index in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. Every meaningful completed step updates this index and appends the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
