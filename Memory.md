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

## Approved stopping point

Phase 1, Phase 2A, and Phase 2B are formally closed. Phase 2B implementation commit `2fb622d` passed run `29332007110`, and unchanged-tree replacement verification commit `c08024d` passed run `29334446539` across Ubuntu/Windows Node 20/24. The next controlled action is Phase 3 design review under the recorded Phase 2A–5 authorization; implementation must still preserve independent gates and stop before unapproved Git or system-policy actions. Phase 6–9 and all independently gated high-risk actions remain closed.

## Active decisions and constraints

- Keep CodexPro self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization and path enforcement remain local.
- Native Windows is primary, WSL must remain optional, Git Bash is the temporary execution backend, and native PowerShell remains required future work.
- Safe Bash is a command-policy filter, not an operating-system sandbox.
- `scripts/codexpro-entry.mjs` is the supported public CLI entry; direct `scripts/codexpro.mjs` launch is unsupported.
- The public CLI defaults to the personal ChatGPT query-token flow when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; `CODEXPRO_ALLOW_QUERY_TOKEN=0` is only for compatible non-ChatGPT Bearer clients.
- Server-side Bearer support must not be documented as manual static-Bearer support in ChatGPT Web. OAuth 2.1 remains separately gated.
- Supported Cloudflare starts use the pinned verified managed binary path. Never bypass secret-content, workspace, path, Host, or Origin protections.
- Phase 1 output envelopes remain closed: tool identity plus `ok`, `data`, `error`, and `meta`; Phase 2A policy failures occur before those envelopes rather than reopening them.
- Policy Kernel uses an immutable compiled snapshot and pure deterministic evaluator. Tool Surface, Policy, Approval, and Sandbox remain separate, and approvals cannot exceed hard policy, identity scopes, Permission Profile, allowed roots, or demonstrated capabilities.
- `CODEXPRO_POLICY_ENGINE=legacy` remains the migration default; `shadow` is observational and `enforce` is fail-closed. Phase 2A has no approval-management surface, so bounded-risk operations may return `APPROVAL_REQUIRED`; unproved Shell/Process isolation returns sandbox-unavailable errors.
- Direct tools and the `codexpro` supertool share one registered-handler policy boundary across 28 canonical child tools. `close_workspace` is available in normal minimal/standard/full modes and hidden from read-only connection-test mode. `codexpro_self_test` exposes seventeen fixed checks, including five Policy checks.
- Phase 1 tool `meta` stays unchanged; transport-aware request IDs exist only inside Phase 2A `RequestContext` and audit facts.
- Keep `scripts/smoke.mjs` and `scripts/http-smoke.mjs` protected and unchanged. Compatibility loaders must use exact fail-closed in-memory substitutions.
- The master implementation plan is the active architecture and sequencing authority. Detailed Phase 1 and Policy Kernel facts belong in paired specs/plans and phase archives, not this index.
- The complete regression command is `node --test test/*.test.mjs`; the repository has no `npm test` script.

## Verification evidence

- Phase 2B exact-head run `29332007110` for implementation commit `2fb622d` passed all four Ubuntu/Windows Node 20/24 jobs. Every job completed Build, Regression Tests, Smoke Test, and Check Package Contents successfully.
- Closure-documentation run `29332531317` for `484cd6d` passed Ubuntu Node 20/24 and Windows Node 24 but produced one Windows Node 20 Regression Tests failure whose public logs were unavailable. The source tree was unchanged from the green implementation head; a fresh local Windows Node 20 `node --test` run passed 542 tests with 541 pass, 0 fail, and 1 skip. Empty replacement-verification commit `c08024d` preserved the same tree, and run `29334446539` then passed all four matrix jobs including every Build, Regression Tests, Smoke Test, and Check Package Contents step.
- Phase 2B local gate: complete regression 542 tests with 541 pass, 0 fail, and 1 established platform-conditional skip; TypeScript Build; all eight Smoke sections including real HTTP cross-session isolation; native-Windows Stress; 197-file package dry-run; and static removal of the process-global manager, path-derived public ID, and optional core lookup all passed.
- Phase 2A local gate: Policy focused 69 pass/0 fail/1 platform skip, adjacent security/contracts 149/149, complete regression 525 pass/0 fail/1 platform skip across 526 tests, Build, all eight Smoke sections, native-Windows Stress, 195-file package dry-run, protected-source checks, and the static 27-tool mapping passed.
- Initial exact-head run `29325407247` for `e6798b6` passed Windows Node 20/24 completely but failed Ubuntu Node 20/24 during Regression Tests. Root cause: `test/policy-resources.test.mjs` combined simulated `win32` `PathGuard` parsing with the host Linux `node:path` implementation. The repair keeps the real filesystem guard on the host platform and tests Windows normalization through resource comparison keys.
- Replacement exact-head run `29326459987` for repair commit `dea25ec` passed all four Ubuntu/Windows Node 20/24 jobs, including Build, Regression Tests, Smoke Test, and Check Package Contents.
- Published Phase 1 head `e20d84e` passed exact-head run `29314923948` on Ubuntu/Windows Node 20/24. Earlier phase and per-slice evidence remains in the linked archives and paired plans.

## Known limitations

- Phase 2A has no user-facing approval issuance surface or persistent audit store. `enforce` may stop bounded-risk operations at `APPROVAL_REQUIRED`, and arbitrary Shell/Process execution remains unavailable without demonstrated OS isolation.
- Phase 2B lifecycle state is intentionally process-local. Workspace close, sliding expiry, policy revocation, and cross-session isolation are implemented; persistence and OAuth owner identity remain out of scope, with OAuth still reserved for Phase 8.
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

1. Begin Phase 3 design review under the recorded Phase 2A–5 authorization. Keep all independently gated high-risk actions and Phase 6–9 closed; do not stage, commit, push, or change system policy without the applicable approval.

## Recent summaries

- **STEP-262 — Replace one non-reproduced closure CI failure:** run `29332531317` failed only Windows Node 20 Regression Tests on a documentation-only head; exact local Windows Node 20 regression passed 541/542 with one skip, and unchanged-tree commit `c08024d` passed replacement run `29334446539` across all four matrix jobs.
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

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
