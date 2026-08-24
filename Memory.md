# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-08-24; checkout `codex/tool-execution-pipeline-slice1` remains at `8a3d5dd3012c7c152fb7eea2fdb3fb91465ebc7e`, 14 commits ahead of fetched `origin/main` `c43ec8ecae9782598ebc9cf90d8df8cdde1035c1`. P1 routes `tree`/`read`/`search` through ToolExecutionPipeline, and STEP-515 clarifies the model-facing lexical/semantic boundary for `search`. Public release remains `codexgpt@1.0.4`; native Windows is primary and WSL optional.
- Historical Phase 1–8 Core and the bounded `1.0.0`–`1.0.4` release sequence are closed; exact implementation, CI, runtime, and publication evidence remains in `docs/memory/archive/`. The current public release remains `codexgpt@1.0.4`.
- STEP-485–515 completed/reviewed all 18 Phase 0 executions, aggregate, knowledge/rule reconciliation, and the first evidence-selected post-benchmark P1 description fix. Later implementation phases remain gated.

## Approved execution boundary

The owner authorized STEP-515 to improve the product before any further trace recollection; that bounded `search` description slice is complete. Another P1 slice, trace recollection, P2/P3/P4, publication, credential migration, Task Scheduler/service installation, sandbox/egress, destructive history, Phase 7B/7C, Tasks 4B1–4B6, `workspace`, and unrelated deployment changes require a separate decision.

## Active decisions and constraints

- `AGENTS.md` Section 5 and paired phase documents are the detailed rule sources; this index retains only their current operational conclusions.
- CodexGPT remains self-hosted: Cloudflare supplies only DNS/TLS/Tunnel while authentication, Host/Origin, path enforcement, and secrets stay local. Native Windows is primary; Git Bash is temporary, and PowerShell support is required.
- The supported public entry is `scripts/codexgpt-entry.mjs`. Legacy mode retains the secret query-token compatibility App; OAuth mode uses a separate App with a token-free URL and forces query-token acceptance off. Manual static-Bearer setup for ChatGPT Web is not claimed.
- V1/V2/V3/V4/V5 remain exactly 28/31/39/51/52. `full_access` is ambient authority, never isolation; `workspace`, Gate S, and Tasks 4B0–4B6 remain unavailable/deferred.
- Configured-root `workspace_id` values remain random opaque `ws_<32hex>` capabilities. STEP-493 makes OAuth default to one deployment-runtime-scoped shared registry bound to deployment binding/incarnation + owner + client + grant/revision + resource and current policy revision; transport/token IDs are not continuity authority, so the same grant survives MCP rotation and access-token refresh. Foreign lookup/close is non-destructive; TTL/close/policy/grant/incarnation invalidation stays fail-closed; runtime restart clears the registry. Confirmed-root/task-worktree, Legacy/query-token, and STDIO authority remains local. Explicit stale IDs never fall back to default; `CODEXGPT_OAUTH_WORKSPACE_CAPABILITY_MODE=session_local` is the rollback selector.
- Use the retained managed Node `v20.20.2`/`v24.15.0` root `%LOCALAPPDATA%\CodexPro\toolchains\`. `test-domains` is authoritative; ordinary runs are detached, control/all need CI or an independent terminal, and cleanup stops/deletes only exact owned evidence.
- `inheritEnv=false` keeps only bounded Windows paths; arbitrary tokens stay out of children. Runtime-relevant publication requires the exact-head Ubuntu/Windows Node 20/24 matrix and `npm run policy:check` before staging.
- Phase 6 guidance grants no authority. Phase 7 Core is the owned JS/TS semantic provider with same-handle reads, honest fallback, server-owned rename plans, and no sandbox claim; Serena/LSP remain separately authorized extensions.
- Phase 8 design/TDD remains the runtime contract: one colocated OAuth authorization/resource server, strict public-client DCR, PKCE S256, RFC 8707/9207, DPAPI CurrentUser, separated public/local-admin listeners, bounded work, and no new tool/execution authority. Tasks 8A1–8A9, G8-U Journeys U2–U7, local G8-X, and exact-head CI are complete. U6's replacement Legacy App proves current rollback compatibility, not continuity of the deleted original App identity; U7 proves the owned public-loopback Tunnel boundary and fail-early shared/unowned refusal.
- Phase 8 setup is canonical-root, dedicated-Tunnel, candidate-probe-before-commit, credential-free `authRoutes.legacy|oauth`, full-route two-App rollback, and idempotent return to OAuth. Stable binding plus rotating incarnation, fixed-order refresh-family mutations, crash-safe code exchange, and durable installation audit are mandatory.
- After OAuth, prioritize configuration provenance, offline diagnostics, current-user Windows background lifecycle, incremental server/CLI/tool-manifest modularization, then full diagnostics. Native isolation is conditional P2 work after a concrete untrusted-code need and a read-only feasibility go decision.
- ChatGPT Web behavior changes are measured by `docs/benchmarks/chatgpt-web-e2e/`. A1 is GREEN. From A2 onward both server base refs must apply exact `successor-overlay.json`; its six path/status/hash entries are byte-identical on baseline/candidate and the harness revalidates them before and after build. This keeps the P1 base-ref delta as the intended A/B variable.

## Verification evidence

- Historical Phase 3–8 and release/runtime evidence remains archived; `1.0.4` exact-head CI `30373608845` and release-alignment merge-head CI `30471674322` passed. A fresh 2026-08-16 check proved the old STEP-481 runtime record stale (`process_identity_mismatch`) before benchmark startup.
- STEP-490 baseline A1 evidence remains at `docs/benchmarks/chatgpt-web-e2e/runs/2026-08-16-baseline-a1.json`: explicit post-open handle reuse failed with `WORKSPACE_NOT_FOUND`; the exact baseline run is stopped. STEP-492 design-only verification and full details remain in Part 7.
- STEP-493/494 successor gates remain GREEN; formal fresh A1 passed at 4 calls / 0 wrong / 0 redundant / 1 context fetch. A2/B1/B2 tie task success; C1/C2/D1/E1 tie task success and verification. D2 ties on task failure but completed verification. E1 evidence under `docs/benchmarks/chatgpt-web-e2e/runs/2026-08-16-e1-*.json` records 6/6 and zero current old-symbol hits for both; incomplete traces keep efficiency fields `null`.

## Known limitations

- Phase 8 Core through Task 8A9, Gate G8-U Journeys U2–U7, local G8-X, and exact-head CI are implemented and accepted. U6 retains a documented test deviation because the original Legacy App was deleted; replacement-App compatibility and exact OAuth return continuity passed, but same-App Legacy identity continuity is not claimed. U5's security reset correctly made the old OAuth client invalid; no prior client/grant/token authority survived.
- DPAPI production protection is intentionally Windows CurrentUser-only. Loss of that user profile or its DPAPI material requires explicit security-reset recovery; there is no plaintext, memory, or non-Windows production fallback.
- Phase 2A has no user-facing approval issuance surface. Phase 4A local approval is not OS isolation.
- Workspace capability state remains process-local by design: OAuth configured-root handles may cross MCP transport rotation inside one running deployment runtime, but do not survive service/runtime restart. OAuth installation owner, deployment, grant/family, signing/refresh authority, and client state persist; pending browser authorization/code state remains intentionally process-ephemeral.
- External processes remain outside the workspace lock. Open-handle checks reduce replacement races but do not provide an OS-wide lock or absolute power-loss durability.
- Environment narrowing is defense in depth, not credential isolation; same-user children may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- `full_access`, confirmed roots, ConPTY, managed worktrees, and external Providers remain ambient-authority mechanisms, not sandboxes.
- Atomic `apply_patch` supports bounded UTF-8 create/replace/delete only and rejects binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- Cached-App migration requires one explicit **Scan Tools** refresh or recreation; transparent refresh is not claimed. U6 proved this by creating a V4 51-tool App before switching the same endpoint to V5.
- Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. `npm audit` has zero high/critical findings and two moderate transitive findings in the current MCP SDK compatibility line.

## Open items

1. Select and authorize one further P1 slice, if desired; complete-trace recollection and App-surface refresh remain optional evidence work rather than a prerequisite for product fixes.
2. Delete the remaining Cloudflare DNS record `codexpro-oauth.drliang.uk` only under its separate approval; reviewed background lifecycle, native isolation, Serena/LSP, Tasks 4B1–4B6, credential migration, and toolchain-root migration also remain gated.
3. The earlier 20-minute `1.0.4` normal-use acceptance remains separate from benchmark scoring; if disconnects recur, inspect authenticated local diagnostics before changing any ceiling.

## Recent summaries

- **STEP-515 — `search` lexical/semantic description contract:** changed the model-facing description to route exact text/error/config/content lookup to `search`, unknown filenames/directories to `tree`, and definitions/references/diagnostics/rename impact to available `semantic`; added an exact direct contract assertion and intentionally refreshed the three affected V1 wire descriptor hashes. TDD, 40/40 focused tests, build, policy, diff, credential, and adversarial review passed.
- **STEP-514 — Phase 0 knowledge/rule reconciliation:** compacted this index after campaign closure, corrected the stale execution boundary, and mechanically verified active documentation links, critical rule paths, required package scripts, policy, focused benchmark contracts, JSON provenance, and repository hygiene without changing product/runtime state.
- **STEP-513 — Phase 0 aggregate:** A2–I2 matched task success is baseline 11/17 vs candidate 12/17 (G2 only); verification is 12/12 each. Efficiency KPI is unscored because complete trace coverage is 0/17 vs 2/17; final review passed.

## Archives

- [Closed Phase 0 and Phase 0.5 — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Closed interphase maintenance Part 2 — STEP-363 through STEP-367](docs/memory/archive/interphase-maintenance-part-2.md)
- [Closed interphase maintenance Part 3 — STEP-368 through STEP-375](docs/memory/archive/interphase-maintenance-part-3.md)
- [Closed interphase maintenance Part 4 — STEP-376 through STEP-384](docs/memory/archive/interphase-maintenance-part-4.md)
- [Closed interphase maintenance Part 5 — STEP-385 through STEP-435](docs/memory/archive/interphase-maintenance-part-5.md)
- [Closed interphase maintenance Part 6 — STEP-436 and STEP-475–482](docs/memory/archive/interphase-maintenance-part-6.md)
- [Closed interphase maintenance Part 7 — STEP-483 through STEP-492](docs/memory/archive/interphase-maintenance-part-7.md)
- [Closed interphase maintenance Part 8 — STEP-493 through STEP-497](docs/memory/archive/interphase-maintenance-part-8.md)
- [Closed interphase maintenance Part 9 — STEP-498 through STEP-505](docs/memory/archive/interphase-maintenance-part-9.md)
- [Active interphase maintenance Part 10 — STEP-506 onward](docs/memory/archive/interphase-maintenance-part-10.md)
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
