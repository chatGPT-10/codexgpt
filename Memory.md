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
- Phase 3: Phase 3A and Phase 3B are published and closed. Phase 3C Tasks 1–3 are published as `a9acc14`, `c01a698`, and `68036e8`; runs `29372615528`, `29374274230`, and `29375830950` passed. Task 4 transaction-backed `write`/`edit` is locally complete and awaiting publication.

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
- Tool contract selection defaults to V1 and accepts only `1|2`; omitted values in existing programmatic configuration remain V1 for one migration cycle. The final V2 name set is immutable and exact at 31 names, but server construction rejects V2 before registration until Phase 3D supplies `move_paths` plus the complete registration/schema capability.
- The master implementation plan is the active architecture and sequencing authority. Detailed Phase 1, Policy Kernel, and Phase 3 facts belong in paired specs/plans and phase archives, not this index.
- The complete regression command is `node --test test/*.test.mjs`; the repository has no `npm test` script.

## Verification evidence

- Phase 3A/3B CI repair: commits `70b1060`, `c5b0226`, and `88bd4b9` fixed fixture discovery, platform-dependent hashes, and atomic installation-state publication; replacement run `29369658101` passed all four matrices.
- Phase 3C planning gate: commit `02e45fc` passed exact-head run `29371007807` on Ubuntu/Windows Node 20/24; every job completed Build, Regression, Smoke, and Package.
- Phase 3C Task 1 local gate: Build; 37/37 focused/adjacent contract tests; 3/3 audit-release tests; 20/20 extra concurrent audit append loops; complete 638-test regression with 637 pass, 0 fail, and 1 established platform skip; all eight Smoke sections; native-Windows Stress; and 237-file package dry-run passed. The first complete-regression attempt exposed a transient Windows audit-lock release `EPERM`; the bounded ownership-revalidating repair passed the replacement gate.
- Phase 3C Task 1 publication: commit `a9acc14` passed exact-head run `29372615528`; every Ubuntu/Windows Node 20/24 job completed Build, Regression, Smoke, and Package.
- Phase 3C Task 2 local gate: strict schema/AES-GCM/HMAC/store tests passed 13/13; focused plus adjacent transaction/audit tests passed 39/39; complete regression passed 650/651 with 0 failures and 1 established platform skip; Build, all eight Smoke sections, native-Windows Stress, and 249-file package dry-run passed.
- Phase 3C Task 2 publication: commit `c01a698` passed exact-head run `29374274230`; every Ubuntu/Windows Node 20/24 job completed Build, Regression, Smoke, and Package.
- Phase 3C Task 3 local gate: focused handshake plus Policy integration passed 11/11; adjacent audit/transaction group passed 22/22; complete regression passed 661/662 with 0 failures and 1 established platform skip; Build, all eight Smoke sections, native-Windows Stress, and 257-file package dry-run passed. Public V1 writers remain legacy and no atomic mutator name is enabled yet.
- Phase 3C Task 3 publication: commit `68036e8` passed exact-head run `29375830950`; every Ubuntu/Windows Node 20/24 job completed Build, Regression, Smoke, and Package.
- Phase 3C Task 4 local gate: strict write/edit transaction tests passed 11/11; Node 20.20.2 passed the final suite after five earlier repeated GREEN runs; complete regression passed 672/673 with 0 failures and 1 established platform skip; Build, all eight Smoke sections, native-Windows Stress, and 257-file package dry-run passed. V1 remains exact and production atomic writes remain fail-closed.
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
- Context, handoff, export, session, and wait operations use bounded non-atomic snapshots or multi-file writes; they fail closed on detected drift but do not provide transaction rollback.
- The dormant atomic `write` adapter currently requires an existing parent directory. `create_dirs=true` for missing parents remains an activation blocker; direct `mkdir` is forbidden because it would escape audit and rollback.
- Inventory, Skill discovery, session indexing, and review checkpoints are intentionally bounded or process-local rather than complete persistent indexes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.

## Open items

1. Publish Phase 3C Task 4, require exact-head CI, then start Task 5 transaction-backed multi-file `apply_patch` with RED all-or-nothing tests.

## Recent summaries

- **STEP-285 — Add transaction-backed write and edit adapters:** added exact-byte preparation, caller/observed hash checks, strict V2 results/failures, V1 projection compatibility, required-audit rollback, Windows concurrency coverage, and an explicit missing-parent activation blocker; the complete local gate passed.
- **STEP-284 — Add the audited mutation commit runtime:** added a private server-owned handle, exact transaction/change-set correlation, required audit/change-set participant ordering, complete rollback, committed-manifest cleanup proof, Policy wrapper integration, and independent-process audit-failure coverage; commit `68036e8` passed run `29375830950`.
- **STEP-283 — Add authenticated encrypted change-set storage:** added strict HMAC-authenticated manifests, AES-256-GCM rollback blobs, bounded retention/tombstones, safe state paths, shared V2 transaction results, and strict configuration; commit `c01a698` passed run `29374274230`.
- **STEP-282 — Close Phase 3C Task 1 publication:** commit `a9acc14` passed exact-head CI run `29372615528` across all four Ubuntu/Windows Node 20/24 jobs; Task 2 may begin.
- **STEP-281 — Harden transient Windows audit-lock release:** the Task 1 publication gate exposed one release-time rename conflict; bounded retries now revalidate ownership and the replacement complete gate passes.
- **STEP-280 — Add the Phase 3C contract-version gate:** added strict V1/V2 configuration, immutable exact 28/31 name sets, V1 compatibility for omitted programmatic fields, and pre-registration V2 rejection until `move_paths` exists; focused/adjacent 37/37 passed.
- **STEP-279 — Plan Phase 3C mutator migration and undo:** recorded closure-head CI run `29370073046`, resolved the Phase 3C/3D V2 sequencing conflict fail-closed, and wrote the ten-task RED/GREEN plan.

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

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
