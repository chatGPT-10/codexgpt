# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-26.
- Package: `codexgpt@0.28.6`; repository: `chatGPT-10/codexgpt`; primary platform: native Windows; WSL remains optional.
- Phases 0–3 are closed. Reduced Phase 4 closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf` with run `29603060944`; Phase 5 closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e` with run `29698209894`; Phase 6 closed at `31631676fe254962a9a4f14d6e025e3edba82b8d` with run `30033293444`.
- Phase 7 Core closed at `a0b9f46e2297297959527f7570c9cb7942cc8fb3` with exact-head run `30171313296`. Real App U2–U6 are accepted through STEP-430, final local G7-X passed at STEP-432, and Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package passed on the published exact head.
- Omitted guidance mode defaults to `standard`; explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the one-restart rollback. Frozen pre-Phase-6 Apps require one **Scan Tools** refresh or recreation.
- STEP-436 closes evidence-driven CI optimization Phases 1–3 at `b4b041da32be7bfb133495fb30aa851d67d4f216` with exact-head run `30177507346`: fail-closed Windows test profiles run at 4/2/1 with a strict serial rollback, measured Git fixture setup removes redundant churn, and four repeated matrix `prepack` builds are removed without dropping any Build or Package gate.
- STEP-437 completes the adversarially reviewed Phase 8 OAuth design/TDD plan and the whole-project comparison against `openai/codex@20dafe201d91d4405eef05ecd1db0257f13a9ac8`. Phase 8 runtime has not started.
- STEP-438 reconciles public user docs with that Phase 8 status, removes an unverified time-sensitive ChatGPT eligibility claim, and compresses the project rules/index without changing runtime behavior.
- STEP-439 completes all authorized local G8-0 evidence and a Windows settings-Smoke canonicalization repair; Task 8A1 has not started.
- STEP-440 corrects the impossible gate ordering: G8-0 freezes standards/SDK/documented-platform assumptions and approved exact dependency candidates, while live RFC 9207/DCR/cookie-navigation acceptance belongs to G8-U after a runnable OAuth vertical slice exists. The reviewed checkpoint establishes the clean Phase 8 base and closes G8-0; Task 8A1 is next.

## Approved execution boundary

The owner has authorized Phase 8 Core runtime/source work, exact production dependencies, Windows DPAPI helper work, and disposable local credential tests. The one-time STEP-440 authority covers reconciliation of the reviewed working tree, the gate-order correction, staging, and one local checkpoint commit; it does not cover push. Cloudflare/DNS/Tunnel mutation, real ChatGPT linking, real credential migration, publication/release/deployment, Task Scheduler, sandbox/egress, later staging/commit/push, destructive history, Phase 7B/7C installs, Tasks 4B1–4B6, `workspace`, and unrelated scope remain separately gated.

## Active decisions and constraints

- `AGENTS.md` Section 5 and paired phase documents are the detailed rule sources; this index retains only their current operational conclusions.
- CodexGPT remains self-hosted: Cloudflare supplies only DNS/TLS/Tunnel while authentication, Host/Origin, path enforcement, and secrets stay local. Native Windows is primary; Git Bash is temporary, and PowerShell support is required.
- The supported public entry is `scripts/codexgpt-entry.mjs`. Current ChatGPT Web compatibility uses the secret query-token URL unless `CODEXGPT_ALLOW_QUERY_TOKEN=0` selects a capable Bearer client; manual static-Bearer setup for ChatGPT Web is not claimed.
- V1/V2/V3/V4/V5 remain exactly 28/31/39/51/52. `full_access` is ambient authority, never isolation; `workspace`, Gate S, and Tasks 4B0–4B6 remain unavailable/deferred.
- Workspace handles are opaque session-local values and stale/foreign handles fail closed. Atomic and semantic mutations retain Policy, lock-held identity/hash, transaction, audit, and mutation-inventory gates; Gate X stays limited to four typed local Git operations.
- Use the retained managed Node `v20.20.2`/`v24.15.0` root `%LOCALAPPDATA%\CodexPro\toolchains\`. `test-domains` is authoritative; ordinary runs are detached, control/all need CI or an independent terminal, and cleanup stops/deletes only exact owned evidence.
- `inheritEnv=false` keeps only bounded Windows paths; arbitrary tokens stay out of children. Runtime-relevant publication requires the exact-head Ubuntu/Windows Node 20/24 matrix and `npm run policy:check` before staging.
- Phase 6 guidance grants no authority. Phase 7 Core is the owned JS/TS semantic provider with same-handle reads, honest fallback, server-owned rename plans, and no sandbox claim; Serena/LSP remain separately authorized extensions.
- Phase 8 design/TDD remains the runtime contract: one colocated OAuth authorization/resource server, strict public-client DCR, PKCE S256, RFC 8707/9207, DPAPI CurrentUser, separated public/local-admin listeners, bounded work, and no new tool/execution authority. STEP-440 closes G8-0 on a reviewed clean checkpoint; Task 8A1 is the only next runtime action.
- Phase 8 setup is canonical-root, dedicated-Tunnel, candidate-probe-before-commit, two-App rollback, and idempotent return to OAuth. Stable binding plus rotating incarnation, fixed-order refresh-family mutations, crash-safe code exchange, and durable installation audit are mandatory.
- After OAuth, prioritize configuration provenance, offline diagnostics, current-user Windows background lifecycle, incremental server/CLI/tool-manifest modularization, then full diagnostics. Native isolation is conditional P2 work after a concrete untrusted-code need and a read-only feasibility go decision.

## Verification evidence

- Published closure runs: Phase 3 `29441752493`/`29443158835`; Phase 4 `29603060944`; Phase 5 `29698209894`; Phase 6 `30033293444`; Phase 7 STEP-415 `30110614307`; STEP-419 `30149210849`; Phase 7 Core closure `30171313296` at `a0b9f46e2297297959527f7570c9cb7942cc8fb3`.
- Phase 7 STEP-420–STEP-432 completed real App U2–U6 for semantic apply/undo, content and NTFS replacement conflicts, worker cooldown/fallback, hostile-path failure, V4→V5 Scan Tools migration, and final managed Node 20/24 local G7-X. Exact evidence remains in the closed Phase 7 archives.
- STEP-436 passed Node 20/24 focused regressions, dual-major ordinary/build/eight-domain Smoke, policy/package 47/47, real `prepack`, repository policy, and final three-agent review with no remaining P0–P2. Exact head `b4b041da32be7bfb133495fb30aa851d67d4f216` passed run `30177507346` across Repository policy and Ubuntu/Windows Node 20/24 Build, Package, Regression, and Smoke.
- STEP-437 is documentation-only: upstream SHA/time and 16 cited source objects were verified, all 22 inherited test paths exist while 31 planned Phase 8 tests are explicitly declared, 14 managed-toolchain commands carry the retained root, and final policy/link/diff/secret results are recorded in the Phase 8 archive.
- STEP-438 verifies 135 Markdown files and 104 repository-relative links with zero broken links; public README/FAQ wording now distinguishes the completed OAuth design from the unimplemented runtime. Authentication-doc regressions pass 6/6 and the documentation/policy gate passes; exact commands/results are in the Phase 8 archive.
- STEP-439 freezes SDK `1.29.0` and direct `jose 6.2.4` candidates without editing package files, records zero high/critical plus two explicit moderate `@hono/node-server` findings, verifies 113 registry signatures/11 attestations, passes inherited focused baselines on current/managed Node 20/24, and passes dual-major eight-domain Smoke in run `2026-07-26T08-45-07-943Z-phase8-g8-0-smoke-matrix-fb43daca`.
- STEP-440 passes repository policy, authentication-documentation 6/6, managed Node 20/24 settings-Smoke compatibility, and `git diff --check`; it records live ChatGPT compatibility as a fail-closed G8-U condition rather than a pre-runtime G8-0 condition.

## Known limitations

- Phase 8 runtime remains unimplemented: public startup still uses the legacy query-token compatibility path; OAuth/DCR/DPAPI/grants/refresh/local admin/setup are not live-validated. Current ChatGPT RFC 9207/DCR/cookie-navigation behavior remains an explicit fail-closed G8-U assumption and is not claimed as observed.
- Phase 2A has no user-facing approval issuance surface. Phase 4A local approval is not OS isolation.
- Workspace lifecycle state is process-local; OAuth owner identity and lifecycle persistence remain Phase 8 work.
- External processes remain outside the workspace lock. Open-handle checks reduce replacement races but do not provide an OS-wide lock or absolute power-loss durability.
- Environment narrowing is defense in depth, not credential isolation; same-user children may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- `full_access`, confirmed roots, ConPTY, managed worktrees, and external Providers remain ambient-authority mechanisms, not sandboxes.
- Atomic `apply_patch` supports bounded UTF-8 create/replace/delete only and rejects binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- Cached-App migration requires one explicit **Scan Tools** refresh or recreation; transparent refresh is not claimed. U6 proved this by creating a V4 51-tool App before switching the same endpoint to V5.
- Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. `npm audit` has zero high/critical findings and two moderate transitive findings in the current MCP SDK compatibility line.
- Ordinary non-semantic `apply_patch` observed `POLICY_CONFIG_INVALID / policy-unavailable` across ChatGPT HTTP tool rotation during U3 fixture preparation. It made no mutation and is not part of the reconnect-stable semantic contract.
- Hosted exact-head Windows regression fell 16.8% on Node 20 and 29.6% on Node 24 versus Phase 0 run `30174477867`; total Windows jobs fell 11.1% and 25.4%, and Package fell from 15s to 3s. The original 40–70% hosted target was not reached; remaining time is concentrated in intentionally isolated control/process tests and Smoke.

## Open items

1. Begin Task 8A1 from the STEP-440 clean checkpoint: apply only the approved exact SDK `1.29.0` and direct `jose 6.2.4` pins, add RED configuration/metadata tests, and retain `OAUTH_RUNTIME_UNAVAILABLE`. Do not run live ChatGPT/Cloudflare work before G8-U authority.
2. After Phase 8, follow the reviewed sequence of configuration provenance, diagnostic foundation, current-user background lifecycle, and incremental modularization. Keep native isolation conditional and keep Serena/LSP, Tasks 4B1–4B6, `workspace`, release/deployment, credential migration, and toolchain-root migration separately gated.
3. Keep PR 6 as a draft for review; no merge, release, deployment, or further optimization is authorized.

## Recent summaries

- **STEP-440 — Reconcile the Phase 8 base:** move live RFC 9207/DCR/cookie-navigation acceptance from impossible pre-runtime G8-0 to fail-closed G8-U, verify the reviewed tree, and create one local clean checkpoint without pushing.
- **STEP-439 — Execute local G8-0 freeze:** verify protocol/dependency/baseline facts and repair Windows settings-Smoke path expectations without starting package/runtime work.
- **STEP-438 — Reconcile public authentication status:** replace stale “OAuth deferred” wording with the exact design-only/runtime-unavailable state, remove an unverified plan-eligibility assertion, and shrink the project rules/index below their soft limits.
- **STEP-437 — Complete Phase 8 design and project review:** adversarially repair the executable OAuth TDD plan, bind the whole-project review to `openai/codex@20dafe20`, and sequence the resulting improvements without starting runtime work.
- **STEP-436 — Close CI optimization Phases 1–3:** exact head `b4b041da` passes run `30177507346`; hosted Windows regression improves 16.8–29.6% and all required gates remain intact.
- **STEP-435 — Add evidence-first CI profiling:** preserve the former topology while producing bounded exact per-file timing evidence and publish the Phase 0 baseline at `d2e379a5` / run `30174477867`.
- **STEP-434 — Reconcile after Phase 7 closure:** close the Phase 7 archive volume, update public status text, remove stale Core-candidate wording, and move subsequent maintenance back to the interphase archive.
- **STEP-433 — Close Phase 7 Core:** publish the reviewed 37-file scope and bind exact head `a0b9f46e2297297959527f7570c9cb7942cc8fb3` to successful CI run `30171313296` across Repository policy and Ubuntu/Windows Node 20/24.
- **STEP-432 — Pass final local G7-X:** managed Node 20/24 build, 1,246/1,248 ordinary, eight-domain Smoke, package, integrity, dependency/license, and exact-scope gates pass after repairing a Node 20 test-import CPU spin.
- **STEP-430 — Accept real App U6:** one explicit Scan Tools migration upgrades a recreated V4 51-tool App to V5 and completes the full U1 semantic journey after repairing inventory and partial-project disambiguation regressions.

## Archives

- [Closed Phase 0 and Phase 0.5 — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Closed interphase maintenance Part 2 — STEP-363 through STEP-367](docs/memory/archive/interphase-maintenance-part-2.md)
- [Closed interphase maintenance Part 3 — STEP-368 through STEP-375](docs/memory/archive/interphase-maintenance-part-3.md)
- [Closed interphase maintenance Part 4 — STEP-376 through STEP-384](docs/memory/archive/interphase-maintenance-part-4.md)
- [Closed interphase maintenance Part 5 — STEP-385 through STEP-435](docs/memory/archive/interphase-maintenance-part-5.md)
- [Interphase maintenance Part 6 — STEP-436](docs/memory/archive/interphase-maintenance-part-6.md)
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
- [Post-Phase 3 operational hardening — STEP-307 through STEP-308](docs/memory/archive/post-phase-3-operational-hardening.md)
- [Closed Phase 4 Volume 1 — STEP-309 through STEP-318](docs/memory/archive/phase-4.md)
- [Closed Phase 4 Volume 2 — STEP-319 through STEP-325](docs/memory/archive/phase-4-part-2.md)
- [Closed Phase 4 Volume 3 — STEP-326 through STEP-343](docs/memory/archive/phase-4-part-3.md)
- [Closed Phase 5 Volume 1 — STEP-344 through STEP-355](docs/memory/archive/phase-5.md)
- [Closed Phase 5 Volume 2 — STEP-356 through STEP-362](docs/memory/archive/phase-5-part-2.md)
- [Closed Phase 6 Volume 1 — STEP-386 through STEP-400](docs/memory/archive/phase-6.md)
- [Closed Phase 6 Volume 2 — STEP-401](docs/memory/archive/phase-6-part-2.md)
- [Closed Phase 7 Volume 1 — STEP-399 through STEP-414](docs/memory/archive/phase-7.md)
- [Closed Phase 7 Volume 2 — STEP-415 through STEP-425](docs/memory/archive/phase-7-part-2.md)
- [Closed Phase 7 Volume 3 — STEP-426 through STEP-433](docs/memory/archive/phase-7-part-3.md)
- [Phase 8 — STEP-437 onward](docs/memory/archive/phase-8.md)

## Memory maintenance protocol

- Keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. At or above 48 KB (80% of the 60 KB direct-read limit), close the volume and start the next numbered continuation.
- `AGENTS.md` is authoritative for the complete protocol.
