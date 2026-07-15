# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-15.
- Workspace: `D:\Dev\codexpro`.
- Branch: `main`.
- Package: `codexpro@0.28.6`.
- GitHub repository: `chatGPT-10/codexgpt`.
- Local `origin` fetch and push URLs use `https://github.com/chatGPT-10/codexgpt.git`.
- Primary platform: native Windows.
- Phase 0: complete.
- Phase 0.5: formally closed on 2026-07-12.
- Phase 1: formally closed on 2026-07-14. Slices 1–16 were published earlier; unified Slices 17–28 implementation `021ab90` plus Windows portability repair `e20d84e` passed exact-head CI run `29314923948` on Ubuntu/Windows Node 20/24.
- Policy Kernel Gate: passed on 2026-07-14 after final approval of the compiled-kernel Approach B four-specification package.
- Phase 2A: formally closed on 2026-07-14. Implementation commit `e6798b6` plus Linux-path test repair `dea25ec` passed replacement exact-head CI run `29326459987` on Ubuntu/Windows Node 20/24.
- Phase 2B: formally closed on 2026-07-14. Implementation and reconciliation commit `2fb622d` passed exact-head CI run `29332007110`; replacement closure-verification commit `c08024d` passed run `29334446539` across Ubuntu/Windows Node 20/24 after one non-reproduced Windows Node 20 failure on the preceding documentation head.
- Phase 3: Phase 3A/3B are closed. Phase 3C Task 7 static mutation closure is locally complete and verified through STEP-291; scoped publication and exact-head CI are next.

## Approved execution boundary

The user authorized continuous recommended-option implementation through Phase 8 and scoped `stage`/English `commit`/`push` after each verified phase part. Keep the public contract V1 surface exact while Phase 3C migrates all writers and prepares the persistent runtime, query, undo, and versioned schemas. Because exact V2 includes Phase 3D's `move_paths`, public V2 startup remains fail-closed until Phase 3D can activate all 31 tools coherently. Each part must pass design, TDD, local verification, neat-freak reconciliation, publication, and exact-head CI before later work is stacked on it. Destructive user-data/history operations, production deployment, credential disclosure, and work outside the approved phase specifications remain excluded.

## Active decisions and constraints

- Keep CodexPro self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization and path enforcement remain local.
- Native Windows is primary, WSL must remain optional, Git Bash is the temporary execution backend, and native PowerShell remains required future work.
- Safe Bash is a command-policy filter, not an operating-system sandbox.
- `scripts/codexpro-entry.mjs` is the supported public CLI entry; direct `scripts/codexpro.mjs` launch is unsupported.
- The public CLI defaults to the personal ChatGPT query-token flow when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; `CODEXPRO_ALLOW_QUERY_TOKEN=0` is only for compatible non-ChatGPT Bearer clients.
- Server-side Bearer support must not be documented as manual static-Bearer support in ChatGPT Web. OAuth 2.1 implementation is authorized for Phase 8 but remains deferred until its dedicated design, migration, rollback, and security gates pass.
- Supported Cloudflare starts use the pinned verified managed binary path. Never bypass secret-content, workspace, path, Host, or Origin protections.
- Phase 1 output envelopes remain closed: tool identity plus `ok`, `data`, `error`, and `meta`; Phase 2A policy failures occur before those envelopes rather than reopening them.
- Policy Kernel uses an immutable compiled snapshot and pure deterministic evaluator. Tool Surface, Policy, Approval, and Sandbox remain separate, and approvals cannot exceed hard policy, identity scopes, Permission Profile, allowed roots, or demonstrated capabilities.
- `CODEXPRO_POLICY_ENGINE=legacy` remains the migration default; `shadow` is observational and `enforce` is fail-closed. Phase 2A has no approval-management surface, so bounded-risk operations may return `APPROVAL_REQUIRED`; unproved Shell/Process isolation returns sandbox-unavailable errors.
- Direct tools and the `codexpro` supertool share one registered-handler policy boundary across 28 canonical child tools. `close_workspace` is available in normal minimal/standard/full modes and hidden from read-only connection-test mode. `codexpro_self_test` exposes eighteen fixed checks, including five Policy checks and one bounded persistent-audit readiness check.
- Phase 1 tool `meta` stays unchanged; transport-aware request IDs exist only inside Phase 2A `RequestContext` and audit facts.
- Keep `scripts/smoke.mjs` and `scripts/http-smoke.mjs` protected and unchanged. Compatibility loaders must use exact fail-closed in-memory substitutions.
- Phase 3 is split into 3A transaction kernel, 3B persistent audit, 3C all-mutator migration plus bounded undo, and 3D `move_paths` plus total acceptance. Keep contract V1 at 28 tools; contract V2 has 31 tools and requires atomic transactions plus valid audit configuration.
- Phase 3 state stays outside workspaces and Git. The V1 atomic backend uses Node native file APIs and same-volume hard links, fails closed when unavailable, and does not claim database-style cross-file instantaneous atomicity.
- Before Phase 3C migrates every supported workspace writer, `CODEXPRO_FILE_TRANSACTIONS=atomic` is valid only with `CODEXPRO_WRITE_MODE=off`; writable atomic server construction must fail before tool registration. The allowed read-only atomic mode runs workspace recovery before handle issue or refresh.
- Phase 3B provides strict local authorization/execution/recovery/administrative audit events, canonical HMAC-chained JSONL segments, conservative cross-process locking, idempotent one-terminal-per-authorization semantics, tail quarantine, fail-closed corruption, rotation/retention, bounded authenticated queries, and transaction-audit participation. Current V1 production registration remains intentionally dormant until Phase 3C injects the persistent runtime; query and undo V2 registration remain non-public until Phase 3D completes the exact 31-tool set.
- Installation identity state is created privately, synced completely, and published once through a same-volume no-clobber hard link. Competing first-open processes must converge on the published complete state; retrying partial JSON is forbidden because corruption must still fail closed.
- During the current authorized batch, publish each independently reversible phase part only after its fresh local gate; wait for exact-head CI and fix failures before proceeding.
- The direct-mutation gate binds each current primitive to an exact path, line, column, call digest, and purpose. `fsOps.ts` and `handoffOps.ts` direct writers remain one-cycle `fileTransactions=legacy` compatibility only; atomic defaults must prepare a transaction first and cannot fall back.
- Tool contract selection defaults to V1 and accepts only `1|2`; omitted values in existing programmatic configuration remain V1 for one migration cycle. The final V2 name set is immutable and exact at 31 names, but server construction rejects V2 before registration until Phase 3D supplies `move_paths` plus the complete registration/schema capability.
- The master implementation plan is the active architecture and sequencing authority. Detailed Phase 1, Policy Kernel, and Phase 3 facts belong in paired specs/plans and phase archives, not this index.
- The complete regression command is `node --test test/*.test.mjs`; the repository has no `npm test` script.

## Verification evidence

- Phase 3A/3B CI repair: commits `70b1060`, `c5b0226`, and `88bd4b9` fixed fixture discovery, platform-dependent hashes, and atomic installation-state publication; replacement run `29369658101` passed all four matrices.
- Phase 3C planning gate: commit `02e45fc` passed exact-head run `29371007807` on Ubuntu/Windows Node 20/24; every job completed Build, Regression, Smoke, and Package.
- Phase 3C Tasks 1-3: commits `a9acc14`, `c01a698`, and `68036e8` passed exact-head runs `29372615528`, `29374274230`, and `29375830950`; their full local evidence remains in Phase 3 Volumes 2-3.
- Phase 3C Task 4: implementation `ac06b2c` exposed an unbounded Windows reader/rename CI hang in run `29377484728`; deterministic boundary testing in `bb5b863` passed replacement run `29378357522` across Ubuntu/Windows Node 20/24. Local closure included 220/220 repeated focused tests, 672/673 complete regression, Build, all Smoke sections, Stress, and package dry-run.
- Phase 3C Task 5 local gate: RED exposed three parser gaps (zero-count insertion coordinates, unsupported metadata, and case-folded expected-file duplicates). The repaired preflight and one-change-set mutation path passed 29/29 focused/legacy apply-patch tests, the complete 687/688 regression with 0 failures and 1 established skip, Build, all eight Smoke sections, native-Windows Stress, and a 259-file package dry-run. V1 remains exact; V2 remains dormant.
- Phase 3C Task 5 publication: commit `b1df763` passed exact-head run `29379729314` on Ubuntu/Windows Node 20/24; every job completed Build, Regression, Smoke, and Package.
- Phase 3C Task 6 local gate: one shared bounded text-batch builder now covers missing-directory scaffold creation, complete-file append replacements, handoff, Pro-context, self-test non-retention, `pro-apply`, and execute/watch/loop CLI artifacts. Focused/legacy coverage passed 94/94, complete regression 701/702 with 0 failures and 1 established skip, Build, all eight Smoke sections, Stress, and a 261-file package dry-run.
- Task 6 repair: `918d55d` triggered Ubuntu Node 20/24 Smoke failures in run `29381264649` when Git diff overflow text bypassed the caller limit. Repair `124f555` bounds final UTF-8 bytes including the marker; replacement run `29382183625` passed all four matrices.
- Phase 3C Task 7 local gate: iterative RED and neat-freak review exposed 139 mutation occurrences across 15 exact runtime files, including three fd-level audit mutations plus the atomic audit-index writer missed by the first vocabulary. The reviewed inventory, CommonJS/alias scanner coverage, and atomic non-reachability proof passed 91/91 focused writer tests, 707/708 complete regression with 0 failures and 1 established skip, Build, all eight Smoke sections, native-Windows Stress, and a 262-file package dry-run.
- Phase 3B implementation boundary: persistent storage, query, diagnostics, Policy wrapper integration points, and transaction participant are published, but current V1 production registration still does not inject or expose it. Phase 3C owns runtime/writer/undo preparation; complete public V2 activation is deferred to the Phase 3D 31-tool gate.

## Known limitations

- Phase 2A still has no user-facing approval issuance surface. Phase 3B adds the persistent-audit backend, but current V1 production registration does not inject or expose it until Phase 3C; `enforce` may still stop bounded-risk operations at `APPROVAL_REQUIRED`, and arbitrary Shell/Process execution remains unavailable without demonstrated OS isolation.
- Phase 2B lifecycle state is intentionally process-local. Workspace close, sliding expiry, policy revocation, and cross-session isolation are implemented; persistence and OAuth owner identity remain out of scope, with OAuth still reserved for Phase 8.
- The implemented Phase 3A hard-link backend excludes unsupported filesystems/volumes. Multi-file crash behavior requires recovery before workspace reuse and is not database-style instantaneous atomic visibility; external processes remain outside CodexPro's workspace lock.
- Omitted `workspace_id` remains supported for one compatibility cycle only through the explicit session-local resolver. Filesystem TOCTOU is reduced, not eliminated.
- Safe Bash is not a sandbox, and timeout does not reliably terminate every Windows descendant process.
- The managed pinned Cloudflared binary is not installed in the user profile. macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Several legacy failure classifiers still depend on bounded internal message prefixes or Node error codes. Exact tool-level details remain in the Phase 1 archives.
- Protected main/HTTP Smoke compatibility depends on exact source strings; source drift fails closed and requires a same-change compatibility update.
- Read-only context, session, and wait operations use bounded snapshots. Task 6 migrates bridge scaffold, handoff, export, self-test, and supported CLI workspace artifacts to rollback-capable transactions; Task 7 closes the static inventory, but production writable atomic server construction remains gated until Tasks 8-9 close undo, schemas, and runtime wiring.
- Atomic transactions can create missing parent directories through recorded empty-directory rollback. A continuously conflicting external Windows file handle can still make install fail and roll back; byte atomicity does not imply guaranteed forward progress under external contention.
- The dormant atomic `apply_patch` adapter supports exact bounded UTF-8 text create/replace/delete hunks and fails closed for binary, symlink, rename/copy, and mode changes. Shared batch preparation now enforces an aggregate after-byte ceiling before transaction state is created.
- Inventory, Skill discovery, session indexing, and review checkpoints are intentionally bounded or process-local rather than complete persistent indexes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.

## Open items

1. Publish Phase 3C Task 7, require exact-head CI, then execute Task 8 owner binding, policy resource resolution, and bounded `undo_change_set`.

## Recent summaries

- **STEP-291 - Close the static mutation inventory locally:** bound 139 direct mutation occurrences to exact reviewed purposes, proved legacy writers unreachable from atomic defaults, and passed the complete local gate.
- **STEP-290 - Close Phase 3C Task 6:** repair `124f555` passed replacement run `29382183625` across Ubuntu/Windows Node 20/24; Task 7 may begin.
- **STEP-289 - Bound CLI diff failure artifacts:** exact-head Ubuntu CI exposed an oversized error artifact; final UTF-8 output now includes the marker inside the caller limit.
- **STEP-288 - Migrate bridge and CLI workspace writers:** added bounded multi-file text batches, transaction-owned directory creation, shared durable-audit local mutation service, atomic handoff/Pro-context/self-test/CLI paths, and historical committed-manifest recovery semantics; published at `918d55d` before STEP-289 repaired its CI finding.
- **STEP-287 - Add transaction-backed multi-file apply_patch:** added complete UTF-8 diff preflight, deterministic create/replace/delete transactions, strict expected-file and V2 facts, all-or-nothing rollback, and fail-closed unsupported-patch handling; the complete local gate passed.
- **STEP-286 - Repair the Windows atomic-visibility CI hang:** replaced an unbounded cross-platform reader race with deterministic reads at the transaction's installed-pending boundary; repair `bb5b863` passed exact-head run `29378357522`.

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

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
