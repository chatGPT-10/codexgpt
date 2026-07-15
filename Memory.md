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
- Phase 3: Phase 3A/3B are closed. Phase 3C Task 7 commit `b9864e4` passed exact-head run `29384188481` on all four matrices. Tasks 8–10 are locally complete in one unpublished phase batch; final regression, publication, and exact-head CI remain.

## Approved execution boundary

The user authorized continuous recommended-option implementation through Phase 8 and scoped `stage`/English `commit`/`push` after each verified phase. Keep the public contract V1 surface exact while Phase 3C migrates all writers and prepares the persistent runtime, query, undo, and versioned schemas. Because exact V2 includes Phase 3D's `move_paths`, public V2 startup remains fail-closed until Phase 3D can activate all 31 tools coherently. Individual tasks must pass design, TDD, and local verification, but Task-level commits, pushes, and CI are deferred; the complete phase must pass neat-freak reconciliation, publication, and exact-head CI before the next phase begins. Destructive user-data/history operations, production deployment, credential disclosure, and work outside the approved phase specifications remain excluded.

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
- `CODEXPRO_FILE_TRANSACTIONS=legacy` remains the compatibility default. Selecting `atomic` routes every supported workspace writer through the transaction runtime with no direct-write fallback; writable atomic V1 requires persistent terminal audit and rejects `CODEXPRO_AUDIT_MODE=off` before tool registration. Recovery runs before handle issue or refresh.
- Phase 3B provides strict local authorization/execution/recovery/administrative audit events, canonical HMAC-chained JSONL segments, conservative cross-process locking, idempotent one-terminal-per-authorization semantics, tail quarantine, fail-closed corruption, rotation/retention, bounded authenticated queries, and transaction-audit participation. Phase 3C now injects the production runtime for atomic or non-legacy Policy configurations; query and undo V2 registration remain non-public until Phase 3D completes the exact 31-tool set.
- Installation identity state is created privately, synced completely, and published once through a same-volume no-clobber hard link. Competing first-open processes must converge on the published complete state; retrying partial JSON is forbidden because corruption must still fail closed.
- During the current authorized batch, keep independently reversible Task changes uncommitted after their fresh local gates; publish once at the complete phase boundary, then wait for exact-head CI and fix failures before beginning the next phase.
- CI debugging protocol: trust the live repository, HEAD, worktree, and exact job logs over stale narrative memory; classify failures before editing; review existing unstaged work before reimplementing; reproduce with the failing OS and runtime; stress concurrency defects across repeated runs rather than accepting one pass; never execute service-stopping or lifecycle suites through the same CodexPro process that carries the control channel; publish one independently reversible repair and wait for its exact-head CI before stacking later work.
- The direct-mutation gate binds each current primitive to an exact path, line, column, call digest, and purpose. `fsOps.ts` and `handoffOps.ts` direct writers remain one-cycle `fileTransactions=legacy` compatibility only; the configured atomic path must prepare a transaction first and cannot fall back.
- Tool contract selection defaults to V1 and accepts only `1|2`; omitted values in existing programmatic configuration remain V1 for one migration cycle. The final V2 name set is immutable and exact at 31 names, but server construction rejects V2 before registration until Phase 3D supplies `move_paths` plus the complete registration/schema capability.
- The master implementation plan is the active architecture and sequencing authority. Detailed Phase 1, Policy Kernel, and Phase 3 facts belong in paired specs/plans and phase archives, not this index.
- The complete regression command is `node --test test/*.test.mjs`; the repository has no `npm test` script.

## Verification evidence

- Phase 3A/3B and their CI repairs are closed; replacement run `29369658101` passed Ubuntu/Windows Node 20/24. Detailed evidence is archived in Phase 3 Volumes 1–2.
- Phase 3C planning and Tasks 1–4 are published through repair commit `bb5b863`; exact-head runs through `29378357522` passed all four matrices. Detailed per-task evidence is archived in Volumes 2–3.
- Phase 3C Task 5 commit `b1df763` passed run `29379729314`; Task 6 repair `124f555` passed run `29382183625`; Task 7 commit `b9864e4` passed run `29384188481`, each across Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.
- Phase 3C Tasks 8–10 are locally complete in one unpublished batch: owner-bound undo, production composition, writable atomic V1, lifecycle cleanup, Smoke state isolation, and documentation reconciliation. Fresh evidence: Build; Phase 3 focused 178/178; final complete regression 729/730 with 0 failures and 1 established skip; seven safe Smoke sections; native-Windows Stress; 268-file package dry-run; static/diff gates.
- The complete execute/watch/loop lifecycle Smoke must run in an independent process because its process-tree cleanup can terminate the CodexPro process carrying this control channel; exact-head CI remains mandatory.

## Known limitations

- Phase 2A still has no user-facing approval issuance surface. Phase 3C injects the persistent-audit runtime when atomic or non-legacy Policy configuration requires it, but V1 still exposes no audit-query tool; `enforce` may stop bounded-risk operations at `APPROVAL_REQUIRED`, and arbitrary Shell/Process execution remains unavailable without demonstrated OS isolation.
- Phase 2B lifecycle state is intentionally process-local. Workspace close, sliding expiry, policy revocation, and cross-session isolation are implemented; persistence and OAuth owner identity remain out of scope, with OAuth still reserved for Phase 8.
- The implemented Phase 3A hard-link backend excludes unsupported filesystems/volumes. Multi-file crash behavior requires recovery before workspace reuse and is not database-style instantaneous atomic visibility; external processes remain outside CodexPro's workspace lock.
- Omitted `workspace_id` remains supported for one compatibility cycle only through the explicit session-local resolver. Filesystem TOCTOU is reduced, not eliminated.
- Safe Bash is not a sandbox, and timeout does not reliably terminate every Windows descendant process.
- The managed pinned Cloudflared binary is not installed in the user profile. macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Several legacy failure classifiers still depend on bounded internal message prefixes or Node error codes. Exact tool-level details remain in the Phase 1 archives.
- Protected main/HTTP Smoke compatibility depends on exact source strings; source drift fails closed and requires a same-change compatibility update.
- Read-only context, session, and wait operations use bounded snapshots. Task 6 migrated bridge scaffold, handoff, export, self-test, and supported CLI workspace artifacts; Task 7 closed the static inventory; Tasks 8–9 completed owner-bound undo, schemas, production composition, and writable atomic V1. Public query/undo remains gated only by incomplete contract V2.
- Atomic transactions can create missing parent directories through recorded empty-directory rollback. A continuously conflicting external Windows file handle can still make install fail and roll back; byte atomicity does not imply guaranteed forward progress under external contention.
- Atomic `apply_patch` supports exact bounded UTF-8 text create/replace/delete hunks and fails closed for binary, symlink, rename/copy, and mode changes. Shared batch preparation enforces an aggregate after-byte ceiling before transaction state is created.
- Inventory, Skill discovery, session indexing, and review checkpoints are intentionally bounded or process-local rather than complete persistent indexes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.

## Open items

1. Run the final fresh complete regression, publish the reviewed Phase 3C batch once, and require exact-head CI before Phase 3D.

## Recent summaries

- **STEP-295 - Complete Phase 3C local acceptance:** reconciled Tasks 8–10, hardened rollback-blob validation and production resource cleanup, isolated stateful Windows Smoke roots, and passed the final complete regression at 729/730 with 0 failures and 1 established skip. Single phase publication and exact-head CI remain.
- **STEP-294 - Complete Phase 3C Task 9 locally:** added per-server production composition, shared-registry recovery ownership, HTTP/STDIO lifecycle wiring, persistent-audit injection, and writable atomic V1. Production tests passed 5/5 and the complete Phase 3 focused gate passed 175/175; publication remains deferred to Task 10.
- **STEP-293 - Complete Phase 3C Task 8 locally:** added keyed owner binding, bounded Policy batch-resource resolution, strict dormant V2 undo schemas/adapters, full conflict/blob/policy preflight, and audited reverse transactions. Build plus 357 targeted tests passed with 0 failures and 1 established skip; publication and CI are deferred to the Phase 3C boundary.
- **STEP-292 - Close Phase 3C Task 7 publication:** `b9864e4` passed exact-head run `29384188481` across all four Ubuntu/Windows Node 20/24 jobs; Task 8 may begin.
- **STEP-291 - Close the static mutation inventory locally:** bound 139 direct mutation occurrences to exact reviewed purposes, proved legacy writers unreachable from atomic defaults, and passed the complete local gate.
- **STEP-290 - Close Phase 3C Task 6:** repair `124f555` passed replacement run `29382183625` across Ubuntu/Windows Node 20/24; Task 7 may begin.
- **STEP-289 - Bound CLI diff failure artifacts:** exact-head Ubuntu CI exposed an oversized error artifact; final UTF-8 output now includes the marker inside the caller limit.
- **STEP-288 - Migrate bridge and CLI workspace writers:** added bounded multi-file text batches, transaction-owned directory creation, shared durable-audit local mutation service, atomic handoff/Pro-context/self-test/CLI paths, and historical committed-manifest recovery semantics; published at `918d55d` before STEP-289 repaired its CI finding.
- **STEP-287 - Add transaction-backed multi-file apply_patch:** added complete UTF-8 diff preflight, deterministic create/replace/delete transactions, strict expected-file and V2 facts, all-or-nothing rollback, and fail-closed unsupported-patch handling; the complete local gate passed.

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

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
