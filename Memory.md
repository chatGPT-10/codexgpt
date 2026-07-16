# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-15.
- Workspace: `D:\Dev\codexpro`; branch: `main`; package: `codexpro@0.28.6`.
- GitHub repository and `origin`: `chatGPT-10/codexgpt` over HTTPS.
- Primary platform: native Windows; WSL remains optional.
- Phase 0, Phase 0.5, Phase 1, the Policy Kernel Gate, Phase 2A, Phase 2B, and complete Phase 3 are closed. Exact historical commit/run evidence is retained in the linked archives.
- Phase 3C commit `50ec99b` passed exact-head run `29390317879`; Gate 0 maintenance commit `77b1e9069798235d674342a2c33a234a4266b564` passed exact-head run `29402504990`, both across Ubuntu/Windows Node 20/24 Build, Regression, complete Smoke, and Package.
- Phase 3D implementation commit `3000aa6d88190f31c6b93c35ae59e7889317aae4` is published on `main`. It implements `move_paths`, authenticated Manifest/Change Set V2, parent-identity/reparse-point revalidation, participant-aware V1/V2 recovery, recoverable move undo, service-level mutation quiesce/drain, bounded audit query, Policy resource composition, and exact direct/supertool V2 registration.
- Test-only commit `e5d9d27f37f6fd2b7c1b76c8db38755da32c6ab5` repaired the first cross-platform CI findings. Windows Node 20 compatibility commit `2df4a1f50c692ef414f1b913dabdaf7b198c97a2` passed runtime exact-head run `29441752493`. Documentation closure commit `3a040647da1f443513ea8348cc3c02a0603ca9b0` passed final exact-head run `29443158835`; both runs completed Ubuntu/Windows Node 20/24 Build, Regression, complete Smoke, and Package successfully.
- Post-Phase 3 operational hardening is implemented and locally verified but remains unstaged: bounded Windows `gh` discovery, non-recursive exact-head evidence, compact CI diagnostics, detached run ownership, isolated control-test domains, verified Node 20/24 toolchains, deterministic replacement fixtures, semantic mutation identities, docs-only CI filtering, and bounded large-file ranged reads. The running connector must be restarted to load the new read defaults.

## Approved execution boundary

The user authorized continuous recommended-option implementation through Phase 8 and scoped staging, English commits, and pushes after each verified phase. Phase 3 is closed. The next execution boundary is Phase 4 design review followed by its approved local TDD tasks; publish only at the complete phase boundary and require exact-head Ubuntu/Windows Node 20/24 CI before advancing again. Destructive user-data/history operations, production deployment, credential disclosure or migration, and silent expansion beyond the approved specifications remain excluded.

## Active decisions and constraints

- Keep CodexPro self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization and path enforcement remain local.
- Native Windows is primary. Git Bash is the temporary execution backend; native PowerShell remains required future work.
- Use the verified managed Node runtimes under `%LOCALAPPDATA%\CodexPro\toolchains\`: Node `v20.20.2` and `v24.15.0` are installed from the official distribution, verified against `SHASUMS256.txt`, and recorded in the local toolchain manifest. Cleanup must not remove this managed root without explicit user approval.
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
- One persistent Phase 3 runtime is injected per production MCP server lifecycle. V1 remains exactly 28 tools; explicit V2 projects exactly 31, adding `move_paths` and `undo_change_set` in standard/full mode and `query_audit_events` only in full mode. Minimal and connection-test expose none of the additions.
- Participant-aware recovery applies to existing Manifest V1 writers and Manifest V2 moves. Participant-complete recovery finishes commit; participant-empty recovery restores before-state; partial effects are correlated and compensated while restoring before-state; unverifiable evidence freezes the workspace.
- `move_paths` uses the existing transaction engine with `TransactionManifestV2` and `ChangeSetManifestV2`; existing create/replace/delete writers continue persisting V1. Source proof is handle-based with stable file-object identity and bounded streaming hashes.
- `move_paths preview` performs full non-mutating policy/path/hash/same-device validation but cannot promise that a later hard-link attempt will succeed. Actual link permission is proven only inside the locked execution transaction.
- With `inheritEnv=false`, Windows Bash preserves or derives only bounded user/configuration paths required for normal CLI and keyring discovery. Do not copy `GH_TOKEN` or arbitrary API variables into the child; `CODEXPRO_INHERIT_ENV=1` is explicit full-environment opt-in for trusted repositories only.
- Installation identity is privately created, fully synced, and published once through a same-volume no-clobber hard link. Competing first-open processes must converge on the published state; persisted corruption fails closed.
- `test/mutation-architecture.test.mjs` binds each direct mutation primitive to repository path, syscall type, normalized semantic call digest, and reviewed purpose. Line and column remain diagnostic only. Atomic production paths must prepare transactions first and cannot fall back to the one-cycle legacy writers.
- CI debugging binds the exact 40-character HEAD SHA, restores only bounded Windows keyring/config paths for `gh`, extracts the first underlying assertion through the compact-summary scripts, and stores exact-head evidence only below ignored `.ai-bridge/`. A successful closure run never triggers a follow-up commit solely to record its run ID.
- Full Regression and Smoke run through the detached run-ID/PID/result runner. `scripts/test-domains.mjs` keeps five connector-hostile tests in an isolated control domain; never start a duplicate kind, and stop only an exact recorded run ID.
- The master implementation plan is the sequencing authority. The complete regression command is `node --test`; there is no `npm test` script.

## Verification evidence

- Phase 3C: commit `50ec99b97f7ec3e4d689b5306f0caa0f60afdc45`, run `29390317879`; Gate 0: commit `77b1e9069798235d674342a2c33a234a4266b564`, run `29402504990`. Both exact heads passed all Ubuntu/Windows Node 20/24 Build, Regression, complete Smoke, and Package jobs.
- Phase 3D publication chain: `3000aa6d88190f31c6b93c35ae59e7889317aae4` (implementation), `e5d9d27f37f6fd2b7c1b76c8db38755da32c6ab5` (cross-platform test stabilization), and `2df4a1f50c692ef414f1b913dabdaf7b198c97a2` (Windows Node 20 handle compatibility).
- Runtime exact-head run `29441752493` for `2df4a1f50c692ef414f1b913dabdaf7b198c97a2` and final closure exact-head run `29443158835` for `3a040647da1f443513ea8348cc3c02a0603ca9b0` both completed successfully on 2026-07-15. Ubuntu Node 20/24 and Windows Node 20/24 each passed Build, complete Regression, all protected Smoke sections, and Package in both runs.
- Final local evidence before publication included official Windows Node 20.20.2 move/crash/undo 46/46 plus all other 91 test files, Node 24 complete 809/810 with zero failures and one established skip, affected 84/84, native-Windows Stress, static gates 17/17, clean diff checks, and a 308-entry package dry-run.
- A real bounded `gh auth status` exited 0 for account `chatGPT-10` through the Windows keyring without inheriting `GH_TOKEN`; exact-head closure verification and compact failed-run extraction also succeeded.
- Post-Phase 3 hardening passed managed Node 20/24 ordinary-domain Regression, all eight Smoke sections, both Builds, affected gates 73/73 per version, policy checks, and a 319-file package dry-run. Authoritative runner IDs and supply-chain hashes are archived in STEP-307.

## Known limitations

- Phase 2A has no user-facing approval issuance surface; `enforce` may return `APPROVAL_REQUIRED`, and arbitrary Shell/Process execution remains unavailable without demonstrated OS isolation.
- Workspace lifecycle state is intentionally process-local. OAuth owner identity and lifecycle persistence remain out of scope.
- The participant commit-decision window and complete Phase 3D runtime are published and exact-head validated. Operational rollback must retain V2 readers, participant reconciliation, and recovery evidence.
- External processes remain outside CodexPro's workspace lock. Open-handle identity checks reduce path-replacement TOCTOU but cannot provide an OS-wide write lock, serializable namespace visibility to arbitrary readers, or absolute power-loss durability when directory sync is unsupported.
- Environment narrowing is defense in depth, not credential isolation; same-user child processes may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- Protected main/HTTP Smoke compatibility depends on exact source strings; drift fails closed and requires a same-change compatibility update.
- V2 remains explicit rather than default. Rolling configuration back to V1 hides V2 tools but must retain V2 readers and recovery.
- Atomic `apply_patch` is bounded UTF-8 create/replace/delete only and fails closed for binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.

## Open items

1. Begin Phase 4 with design review against the authoritative master implementation plan.
2. Preserve the closed Phase 3 contract, recovery, audit, rollback, and exact V1/V2 compatibility gates while implementing Phase 4.

## Recent summaries

- **STEP-307 - Enforce Phase 3D operational lessons:** added bounded Windows `gh` discovery, exact-head evidence without recursive commits, compact CI diagnostics, detached run ownership, isolated control-test domains, verified Node 20/24 toolchains, semantic mutation identities, docs-only CI classification, and bounded ranged reads; final managed Node 20/24 Regression, Smoke, Build, policy, and package gates passed locally.
- **STEP-306 - Finalize Phase 3 memory:** final closure commit `3a040647da1f443513ea8348cc3c02a0603ca9b0` passed exact-head run `29443158835` across all four complete matrices; retained the verified portable Node 20.20.2 runtime for future reproduction and advanced the next boundary to Phase 4 design review.
- **STEP-305 - Close Phase 3:** runtime exact-head run `29441752493` passed Ubuntu/Windows Node 20/24 Build, complete Regression, all protected Smoke sections, and Package for commit `2df4a1f`; Phase 3D and complete Phase 3 were formally closed pending the documentation-head confirmation recorded in STEP-306.
- **STEP-304 - Repair Windows Node 20 move handles:** classified run `29437987007`, reproduced Node 20.20.2 unlinked-name `EPERM`, handed object ownership from the original source handle to a verified stage handle, moved the external-replacement test into the real post-unlink/pre-manifest window, and passed Node 20 move 46/46, all other 91 test files, Node 24 complete 809/810, Stress, static, and package gates.
- **STEP-303 - Repair first Phase 3D exact-head CI:** published `3000aa6`, classified run `29436565136` as two test-portability failures, made the replacement-object fixture immune to inode reuse, normalized only environment-dependent V1 call facts, and restored Build, 84/84 affected tests, and 809/810 complete regression with zero failures.
- **STEP-302 - Repair the Phase 3D adversarial gaps and repeat acceptance:** added true syscall-boundary recovery, parent/reparse identity revalidation, recoverable original-change-set reconciliation, service-level quiesce/drain, real child-process crash oracles, Windows retry/EXDEV/junction/multi-process coverage, exact V1 wire fingerprints, and the refreshed 809/810 regression plus 308-entry package evidence.
- **STEP-301 - Close the neat-freak follow-up gate:** reconciled the remaining V2 documentation test and the then-current pre-adversarial local gate; STEP-302 supersedes its verification counts and acceptance status.
- **STEP-300 - Complete Phase 3D locally and reconcile the knowledge base:** implemented the exact 31-tool V2 move/recovery/undo/query surface while preserving default V1, passed the native-Windows local gate, and aligned configuration, public docs, security guidance, plans, rules, memory, and archive state.

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
- [Closed Phase 3 Volume 4 — STEP-292 through STEP-306](docs/memory/archive/phase-3-part-4.md)
- [Post-Phase 3 operational hardening — STEP-307](docs/memory/archive/post-phase-3-operational-hardening.md)

## Memory maintenance protocol

- Edit this index in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. Every meaningful completed step updates this index and appends the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
