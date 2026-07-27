# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-27; stable release `codexgpt@1.0.0` is published; repository `chatGPT-10/codexgpt`; native Windows remains primary and WSL optional.
- Phases 0–8 Core are closed. Phase 7 closed at `a0b9f46e2297297959527f7570c9cb7942cc8fb3` / `30171313296`; Phase 8 closed at `55b2b5664aae322ec992968a41c87a289fb75282` / `30274857996`.
- STEP-437–472 completed Phase 8 Core, real G8-U Journeys U2–U7, local G8-X, portability repairs, and exact-head Ubuntu/Windows Node 20/24 CI. U6 retains the deleted-App evidence substitution; U7 preserves the public-loopback/local-admin boundary.
- STEP-473 prepared and locally verified the bounded `1.0.0` package. STEP-474 closed publication: PR 6 merged to `main` at `9131c393da3a1eb3c9514710b0b1569f55dd5acb`, and npm `latest`, annotated tag `v1.0.0`, and the GitHub Release align to that commit.

## Approved execution boundary

The `1.0.0` release cycle is complete. No post-`1.0.0` implementation or deployment is implicitly authorized. Credential migration, runtime deployment, Task Scheduler, sandbox/egress, destructive history, Phase 7B/7C installs, Tasks 4B1–4B6, `workspace`, and unrelated scope remain separately gated.

## Active decisions and constraints

- `AGENTS.md` Section 5 and paired phase documents are the detailed rule sources; this index retains only their current operational conclusions.
- CodexGPT remains self-hosted: Cloudflare supplies only DNS/TLS/Tunnel while authentication, Host/Origin, path enforcement, and secrets stay local. Native Windows is primary; Git Bash is temporary, and PowerShell support is required.
- The supported public entry is `scripts/codexgpt-entry.mjs`. Legacy mode retains the secret query-token compatibility App; OAuth mode uses a separate App with a token-free URL and forces query-token acceptance off. Manual static-Bearer setup for ChatGPT Web is not claimed.
- V1/V2/V3/V4/V5 remain exactly 28/31/39/51/52. `full_access` is ambient authority, never isolation; `workspace`, Gate S, and Tasks 4B0–4B6 remain unavailable/deferred.
- Workspace handles are opaque session-local values and stale/foreign handles fail closed. Atomic and semantic mutations retain Policy, lock-held identity/hash, transaction, audit, and mutation-inventory gates; Gate X stays limited to four typed local Git operations.
- Use the retained managed Node `v20.20.2`/`v24.15.0` root `%LOCALAPPDATA%\CodexPro\toolchains\`. `test-domains` is authoritative; ordinary runs are detached, control/all need CI or an independent terminal, and cleanup stops/deletes only exact owned evidence.
- `inheritEnv=false` keeps only bounded Windows paths; arbitrary tokens stay out of children. Runtime-relevant publication requires the exact-head Ubuntu/Windows Node 20/24 matrix and `npm run policy:check` before staging.
- Phase 6 guidance grants no authority. Phase 7 Core is the owned JS/TS semantic provider with same-handle reads, honest fallback, server-owned rename plans, and no sandbox claim; Serena/LSP remain separately authorized extensions.
- Phase 8 design/TDD remains the runtime contract: one colocated OAuth authorization/resource server, strict public-client DCR, PKCE S256, RFC 8707/9207, DPAPI CurrentUser, separated public/local-admin listeners, bounded work, and no new tool/execution authority. Tasks 8A1–8A9, G8-U Journeys U2–U7, local G8-X, and exact-head CI are complete. U6's replacement Legacy App proves current rollback compatibility, not continuity of the deleted original App identity; U7 proves the owned public-loopback Tunnel boundary and fail-early shared/unowned refusal.
- Phase 8 setup is canonical-root, dedicated-Tunnel, candidate-probe-before-commit, credential-free `authRoutes.legacy|oauth`, full-route two-App rollback, and idempotent return to OAuth. Stable binding plus rotating incarnation, fixed-order refresh-family mutations, crash-safe code exchange, and durable installation audit are mandatory.
- After OAuth, prioritize configuration provenance, offline diagnostics, current-user Windows background lifecycle, incremental server/CLI/tool-manifest modularization, then full diagnostics. Native isolation is conditional P2 work after a concrete untrusted-code need and a read-only feasibility go decision.

## Verification evidence

- Published closure runs: Phase 3 `29441752493`/`29443158835`; Phase 4 `29603060944`; Phase 5 `29698209894`; Phase 6 `30033293444`; Phase 7 `30171313296` at `a0b9f46e2297297959527f7570c9cb7942cc8fb3`.
- STEP-436 exact head `b4b041da32be7bfb133495fb30aa851d67d4f216` passed run `30177507346` across Repository policy and Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.
- STEP-437–452 passed Phase 8 Core on managed Node 20/24 (`152/152`), inherited regressions (`70/70`), policy/diff/package checks, and a 653-entry package dry run.
- STEP-454–463 passed live U2–U5: dedicated Tunnel/App, scope and descriptor lifecycle, restart/refresh, revoke/relink, negative/replay/admission checks, and verified-backup recovery as a new-incarnation security reset.
- STEP-464–467 passed the Legacy/OAuth route round-trip and U6 current-client evidence. Replacement Legacy compatibility and return-to-OAuth continuity are accepted; continuity of the deleted original Legacy App is not claimed.
- STEP-468 passed U7: owned ingress remained byte-identical and public-loopback-only, local-admin stayed private, Host/forwarded headers conferred no authority, and managed Node 20/24 boundary tests passed `33/33` on each major.
- STEP-470 local G8-X passed after one test-first diagnostic-race repair. Post-repair ordinary run `2026-07-27T13-20-49-272Z-phase8-g8-x-ordinary-matrix-r2-471681bb` passed `1429` with `2` explicit Windows capability skips per major; protected Smoke run `2026-07-27T13-05-15-016Z-phase8-g8-x-smoke-matrix-r2-a1bbb40a` passed all eight groups on Node `20.20.2` and `24.15.0`. Policy/diff/lock/dependency/package/link/credential checks passed; the dry package contains `654` files and no private state.
- STEP-472 initial exact-head run `30273084546` at `32063df4b49b4db31cb8da45fca33f035530da2b` exposed the POSIX/Win32 root classification defect; repair run `30274322791` exposed one final synthetic-path test assumption. Final head `55b2b5664aae322ec992968a41c87a289fb75282` passed run `30274857996` across Repository policy and Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.
- STEP-473 local `1.0.0` gates passed: focused release contracts `10/10`, managed Node 20/24 package contracts `3/3` each, build, policy, diff/secret checks, package-lock synchronization, 654-file package dry run, publish dry run, and detached protected Smoke exit `0` on both managed majors.
- STEP-474 release closure passed: release-candidate head `ca701b6a0f464427b89d828f906b4199636feae5` passed run `30282382963`; PR 6 merged as `9131c393da3a1eb3c9514710b0b1569f55dd5acb`; merged exact-head run `30283923175` passed Repository policy and Ubuntu/Windows Node 20/24; npm reports `version=latest=1.0.0` with matching `gitHead`; remote `v1.0.0` dereferences to the same commit; and the GitHub Release is public.

## Known limitations

- Phase 8 Core through Task 8A9, Gate G8-U Journeys U2–U7, local G8-X, and exact-head CI are implemented and accepted. U6 retains a documented test deviation because the original Legacy App was deleted; replacement-App compatibility and exact OAuth return continuity passed, but same-App Legacy identity continuity is not claimed. U5's security reset correctly made the old OAuth client invalid; no prior client/grant/token authority survived.
- DPAPI production protection is intentionally Windows CurrentUser-only. Loss of that user profile or its DPAPI material requires explicit security-reset recovery; there is no plaintext, memory, or non-Windows production fallback.
- Phase 2A has no user-facing approval issuance surface. Phase 4A local approval is not OS isolation.
- Workspace lifecycle state remains process-local. OAuth installation owner, deployment, grant/family, signing/refresh authority, and client state persist; pending browser authorization/code state remains intentionally process-ephemeral and restart requires a fresh authorization attempt.
- External processes remain outside the workspace lock. Open-handle checks reduce replacement races but do not provide an OS-wide lock or absolute power-loss durability.
- Environment narrowing is defense in depth, not credential isolation; same-user children may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- `full_access`, confirmed roots, ConPTY, managed worktrees, and external Providers remain ambient-authority mechanisms, not sandboxes.
- Atomic `apply_patch` supports bounded UTF-8 create/replace/delete only and rejects binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- Cached-App migration requires one explicit **Scan Tools** refresh or recreation; transparent refresh is not claimed. U6 proved this by creating a V4 51-tool App before switching the same endpoint to V5.
- Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. `npm audit` has zero high/critical findings and two moderate transitive findings in the current MCP SDK compatibility line.

## Open items

1. Select and explicitly authorize the next post-`1.0.0` slice from the reviewed sequence: configuration provenance, diagnostic foundation, current-user background lifecycle, then incremental modularization. Native isolation, Serena/LSP, Tasks 4B1–4B6, `workspace`, runtime deployment, credential migration, and toolchain-root migration remain separately gated.

## Recent summaries

- **STEP-474 — `1.0.0` release closure and reconciliation:** publish the verified package, align npm/tag/GitHub Release to the merged exact head, and remove stale release-pending state from active rules, security policy, plan, and memory.
- **STEP-473 — `1.0.0` release preparation:** align package/runtime/docs versioning, bind version consistency in tests, and prepare the verified Phase 8 baseline for main/tag/npm publication.
- **STEP-472 — Exact-head CI portability repair:** preserve Win32 canonical-root rejection, classify POSIX roots only on non-Windows hosts, make all synthetic Win32 path operations explicit, and close exact-head CI at `55b2b5664aae322ec992968a41c87a289fb75282` / `30274857996`.
- **STEP-471 — Neat-freak after local G8-X:** compact always-loaded rules/index, clarify local versus exact-head closure, and verify links/contracts/budgets.
- **STEP-470 — Local G8-X:** repair named-Tunnel failure precedence, pass post-repair managed ordinary/Smoke, and close the local source-checkout gate without publication or external-state mutation.
- **STEP-468 — U7 Tunnel boundary:** refuse shared/unowned configs before mutation and prove the live public/local listener boundary.
- **STEP-467 — U6 evidence substitution:** prove replacement Legacy compatibility and exact OAuth return continuity without claiming deleted-App identity continuity.

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
- [Closed Phase 8 Volume 1 — STEP-437 through STEP-446](docs/memory/archive/phase-8.md)
- [Closed Phase 8 Volume 2 — STEP-447 through STEP-451](docs/memory/archive/phase-8-part-2.md)
- [Closed Phase 8 Volume 3 — STEP-452 through STEP-460](docs/memory/archive/phase-8-part-3.md)
- [Closed Phase 8 Volume 4 — STEP-461 through STEP-469](docs/memory/archive/phase-8-part-4.md)
- [Closed Phase 8 Volume 5 — STEP-470 through STEP-474](docs/memory/archive/phase-8-part-5.md)

## Memory maintenance protocol

- Keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. At or above 48 KB (80% of the 60 KB direct-read limit), close the volume and start the next numbered continuation.
- `AGENTS.md` is authoritative for the complete protocol.
