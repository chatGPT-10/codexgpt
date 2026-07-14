# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-14.
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
- Phase 3: Phase 3A and Phase 3B are published through `88bd4b9` (`75b8d54` 3A, `00cb917` 3B, `70b1060` fixture discovery repair, `c5b0226` portable protected-source hashes, `88bd4b9` atomic installation-state publication). Replacement exact-head run `29369658101` passed Ubuntu/Windows Node 20/24; Phase 3C–3D have not started.

## Approved execution boundary

The user authorized continuous recommended-option implementation through Phase 8 and scoped `stage`/English `commit`/`push` after each verified phase part. Keep the public contract V1 surface exact until Phase 3C enables the persistent runtime, all mutators, `query_audit_events`, and contract V2 coherently. Each part must pass design, TDD, local verification, neat-freak reconciliation, publication, and exact-head CI before later work is stacked on it. Destructive user-data/history operations, production deployment, credential disclosure, and work outside the approved phase specifications remain excluded.

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
- Phase 3B provides strict local authorization/execution/recovery/administrative audit events, canonical HMAC-chained JSONL segments, conservative cross-process locking, idempotent one-terminal-per-authorization semantics, tail quarantine, fail-closed corruption, rotation/retention, bounded authenticated queries, and transaction-audit participation. Current V1 production registration remains intentionally dormant until Phase 3C injects the persistent runtime and enables contract V2 coherently.
- Installation identity state is created privately, synced completely, and published once through a same-volume no-clobber hard link. Competing first-open processes must converge on the published complete state; retrying partial JSON is forbidden because corruption must still fail closed.
- During the current authorized batch, publish each independently reversible phase part only after its fresh local gate; wait for exact-head CI and fix failures before proceeding.
- The master implementation plan is the active architecture and sequencing authority. Detailed Phase 1, Policy Kernel, and Phase 3 facts belong in paired specs/plans and phase archives, not this index.
- The complete regression command is `node --test test/*.test.mjs`; the repository has no `npm test` script.

## Verification evidence

- Phase 3A/3B CI diagnosis: run `29348287464` exposed Node discovery of executable child fixtures plus raw-byte protected-source hash drift; later commits `70b1060` and `c5b0226` repair those causes. Run `29362153159` then isolated one Windows Node 20 first-open race where another process could observe partial `installation.json` bytes.
- STEP-277 replacement gate: local Build, focused/concurrency tests, 35 additional Windows Node 20.20.2 iterations, 631-test regression, all eight Smoke sections, native-Windows Stress, and 237-file package dry-run passed. Commit `88bd4b9` then passed exact-head CI run `29369658101` on Ubuntu/Windows Node 20/24; every job completed Build, Regression, Smoke, and Package.
- Phase 3B implementation boundary: persistent storage, query, diagnostics, Policy wrapper integration points, and transaction participant are published, but current V1 production registration still does not inject the persistent runtime or expose `query_audit_events`; coherent enablement remains Phase 3C work.
- Phase 3A local gate: focused transaction tests 44/44; adjacent security/lifecycle regression 38/38; complete regression 590 tests with 589 pass, 0 fail, and 1 established platform skip; TypeScript Build, all eight Smoke sections, native-Windows Stress, 217-file package dry-run, protected-source hashes, exact 28-tool contract, static dependency/sensitive-field checks, and the dedicated whitespace/scope review passed.
- Phase 3A implementation boundary: default transaction mode remains `legacy`; `atomic` is read-only until Phase 3C; public writers are not migrated; same-volume hard links are mandatory with no direct-write fallback; crash recovery runs before atomic-mode workspace reuse and freezes on unprovable evidence. The implementation is published at `75b8d54`; these compatibility boundaries remain active.
- Published exact-head evidence: Phase 2B replacement closure run `29334446539`, Phase 2A replacement run `29326459987`, and Phase 1 run `29314923948` passed the Ubuntu/Windows Node 20/24 matrices. Detailed failures, repairs, and local gates remain in the linked archives.

## Known limitations

- Phase 2A still has no user-facing approval issuance surface. Phase 3B adds the persistent-audit backend, but current V1 production registration does not inject or expose it until Phase 3C; `enforce` may still stop bounded-risk operations at `APPROVAL_REQUIRED`, and arbitrary Shell/Process execution remains unavailable without demonstrated OS isolation.
- Phase 2B lifecycle state is intentionally process-local. Workspace close, sliding expiry, policy revocation, and cross-session isolation are implemented; persistence and OAuth owner identity remain out of scope, with OAuth still reserved for Phase 8.
- The implemented Phase 3A hard-link backend excludes unsupported filesystems/volumes. Multi-file crash behavior requires recovery before workspace reuse and is not database-style instantaneous atomic visibility; external processes remain outside CodexPro's workspace lock.
- Omitted `workspace_id` remains supported for one compatibility cycle only through the explicit session-local resolver. Filesystem TOCTOU is reduced, not eliminated.
- Safe Bash is not a sandbox, and timeout does not reliably terminate every Windows descendant process.
- The managed pinned Cloudflared binary is not installed in the user profile. macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Several legacy failure classifiers still depend on bounded internal message prefixes or Node error codes. Exact tool-level details remain in the Phase 1 archives.
- Protected main/HTTP Smoke compatibility depends on exact source strings; source drift fails closed and requires a same-change compatibility update.
- Context, handoff, export, session, and wait operations use bounded non-atomic snapshots or multi-file writes; they fail closed on detected drift but do not provide transaction rollback.
- Inventory, Skill discovery, session indexing, and review checkpoints are intentionally bounded or process-local rather than complete persistent indexes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.

## Open items

1. Publish the STEP-278 documentation closure and require its exact-head CI to pass. Then write the Phase 3C TDD plan from the approved specification and continue through Phase 8 under the recorded gates.

## Recent summaries

- **STEP-278 — Close the Phase 3A/3B CI repair gate:** recorded that `88bd4b9` passed run `29369658101` on all Ubuntu/Windows Node 20/24 jobs and opened Phase 3 archive Volume 2 for the Phase 3C baseline.
- **STEP-277 — Repair Phase 3A/3B CI portability and state publication:** confirmed both Phase 3A portability fixes, replaced partial installation-state visibility with synced no-clobber publication, and passed Node 20 concurrency stress plus the full local gate.
- **STEP-276 — Reconcile Phase 3B knowledge and public metadata:** documented audit configuration and the dormant V1 boundary, aligned fork links, and added static drift guards before Phase 3B publication.
- **STEP-275 — Locally accept Phase 3B:** implemented the persistent local audit backend, strict bounded query and transaction participant, eighteen-check self-test integration, and dormant V2 adapters; focused 36/36, adjacent 171/172 with one established skip, complete 625/626 with one established skip, Build, eight-section Smoke, native-Windows Stress, 237-file package dry-run, and architecture/scope gates passed. Stopped before Git staging.
- **STEP-274 — Reconcile Phase 3A publication and start Phase 3B:** confirmed local/origin `75b8d54`, wrote the ten-task persistent-audit plan, and added strict audit mode/retention configuration with 4/4 focused tests passing after an observed RED.
- **STEP-273 — Locally accept Phase 3A:** implemented and reconciled the internal transaction kernel; 44 focused, 38 adjacent, and 590 complete tests passed with 0 failures and 1 established platform skip, plus Build, eight-section Smoke, native-Windows Stress, 217-file package dry-run, static architecture, protected-source, whitespace, and scope gates. Stopped before Git staging.
- **STEP-272 — Add crash recovery and workspace readiness:** added strict persisted recovery, dead-owner lock quarantine, workspace freeze on unprovable evidence, and a pre-handle readiness gate; a child-process crash after the first visible install restored the complete before-state in a fresh process.
- **STEP-261 — Publish and close Phase 2B:** commit `2fb622d` was pushed to `main`; exact-head run `29332007110` passed Ubuntu/Windows Node 20/24, including Build, Regression Tests, Smoke Test, and Check Package Contents in every job.
- **STEP-260 — Reconcile Phase 2B knowledge and rules:** aligned `AGENTS.md`, dual-language READMEs, `SECURITY.md`, `CHANGELOG.md`, the master plan, Memory, and the active archive; removed unused lifecycle timestamp state; focused 22/22, Build, 541/542 regression with one platform skip, eight-section Smoke, and 197-file package dry-run passed.
- **STEP-259 — Locally accept Phase 2B:** 542-test regression produced 541 pass, 0 fail, and 1 established platform skip; Build, eight-section Smoke, native-Windows Stress, and 197-file package dry-run passed.

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
- [Active Phase 3 Volume 2 — STEP-278 onward](docs/memory/archive/phase-3-part-2.md)

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
