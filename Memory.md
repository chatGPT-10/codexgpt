# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-13.
- Workspace: `D:\Dev\codexpro`.
- Branch: `main`.
- Package: `codexpro@0.28.6`.
- GitHub repository: `chatGPT-10/codexgpt`.
- Local `origin` fetch and push URLs use `https://github.com/chatGPT-10/codexgpt.git`.
- Primary platform: native Windows.
- Phase 0: complete.
- Phase 0.5: formally closed on 2026-07-12.
- Phase 1: the first fifteen slices are published; Slice 16 direct `inspect_workspace` Tasks 1–4 are locally complete and Task 5 publication is in progress.

## Approved stopping point

Slice 16 direct `inspect_workspace` is locally complete through Task 4. Exact schema/provider/handler/consumer work passed initial RED 0/10, schema-only GREEN 3/10, focused 10/10, adjacent 79/79, complete 263/263, Build, analysis Smoke, analysis CLI Smoke, standalone HTTP Smoke, complete Smoke 8/8, native-Windows Stress, package dry-run, and diff checking. The next approved step is Task 5 publication and exact-head CI verification, followed by a separate durable record. Workspace lifecycle, semantic-provider expansion, and Phase 2 remain closed.

## Active decisions and constraints

- Keep CodexPro self-hosted; Cloudflare is used only for DNS, TLS, and Tunnel.
- Native Windows is the primary platform; WSL must not become mandatory.
- Git Bash is the temporary Windows execution backend; native PowerShell remains planned work.
- Safe Bash is a policy filter, not an operating-system sandbox.
- `scripts/codexpro-entry.mjs` is the supported public CLI entry; direct `scripts/codexpro.mjs` launch is unsupported.
- The supported public CLI defaults to the personal ChatGPT query-token compatibility flow when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset.
- Treat the complete credential-bearing Server URL as a secret because it may leak through browser history, clipboard contents, screenshots, logs, and copied links.
- `CODEXPRO_ALLOW_QUERY_TOKEN=0` is only for compatible non-ChatGPT clients that can send Bearer headers.
- Server-side Bearer support remains, but documentation must not claim ChatGPT Web supports manual static-Bearer configuration.
- OAuth 2.1 is deferred to a later phase.
- Supported Cloudflare starts must use the pinned verified managed binary path.
- Do not bypass secret-content protections or weaken workspace/path boundaries.
- Phase 1 uses strict tool-specific envelopes: top-level tool identity plus `ok`, `data`, `error`, and `meta`; data fields live only under `data`.
- Initial `meta` is exactly `schemaVersion`, `durationMs`, and `warnings`; `requestId` remains deferred until trustworthy transport-aware identity exists.
- Stable errors use `code`, `message`, `retryable`, and `details`; raw exceptions, stack traces, unsafe paths, and secrets are excluded.
- Schema ownership remains split between `src/tools/schemas/common.ts` and one exact tool schema module per migrated tool.
- Contract tests use pure constructors and test-only dependency injection; no production test mode or hidden MCP argument is allowed.
- Implemented Phase 1 direct tools through `inspect_workspace` use strict nested schema-v1 envelopes and stable redacted failures; exact contracts remain in the Phase 1 archives and design documents.
- `show_changes` and `search` preserve complete core results when optional analysis is unavailable, using only fixed safe warnings and excluding raw diagnostics.
- `write`, `edit`, and `apply_patch` validate provider identity and normalized returned paths before cache invalidation; raw content, unsafe paths, diagnostics, and secrets stay private.
- Atomic transactions, rollback, undo, fuzzy editing, authentication, dependency changes, workspace lifecycle, and Phase 2/3 remain outside the published Phase 1 slices.
- Phase archives use bounded numbered volumes: after each complete STEP, open the next volume when the active file reaches 80% of the configured direct-read byte limit; earlier volumes remain unchanged.
- The repository has no `npm test` script; the complete regression command is `node --test test/*.test.mjs`.
- Published `bash` and `open_current_workspace` contract details, verification evidence, and rollback records remain in their design/plan files and Phase 1 archives; do not reopen those slices during the current review.
- Direct `open_workspace` is the locally complete thirteenth Phase 1 slice; its exact twelve-field nested contract, deterministic workspace IDs, canonical-root reuse, current tool modes, and non-Git success are implemented and verified.
- Seven fixed non-retryable failures separate alias conflict, invalid/missing/non-directory/disallowed roots, open failure, and internal summary failure; public details expose only bounded source fields, never the local root or allowed-root list.
- `root` and `path` are trimmed aliases: blank values are absent, matching effective aliases succeed, differing aliases fail, and a blank `root` cannot shadow a valid `path`.
- Root-opening failures and summary-provider failures are classified in separate stages; provider-time filesystem errors remain `INTERNAL_ERROR`. Workspace lifecycle, shared schema extraction, and Phase 2 remain deferred.
- Provider Skill output must respect both discovery switches: no Skill data when `include_skills=false`, and only workspace-source Skills when `include_global_skills=false`.
- Keep `scripts/smoke.mjs` and `scripts/http-smoke.mjs` protected and unchanged; their compatibility entries perform exact fail-closed in-memory substitutions, add bounded `sourceURL` labels, and write no transformed source to disk.
- The published fourteenth slice migrates only full-mode direct `workspace_snapshot`; its thirteen-field contract, four failures, provider boundaries, protected-consumer compatibility, and limitations remain unchanged.
- Slice 15 published direct full-mode `list_workspaces` with nested ordered inventory and no workspace-lifecycle expansion.
- Slice 16 migrates only direct `inspect_workspace`; it remains standard/full when analysis is enabled and absent in minimal or analysis-disabled modes.
- Slice 16 preserves the built-in full-workspace analysis engine and cache, while returned records are path-scoped and independently capped.
- Slice 16 success has exactly sixteen nested data fields; full coverage stays distinct from `returned` counts and `output_limited`.
- Provider warnings remain bounded domain data; `meta.warnings` stays empty. Unknown warning forms and malformed provider output fail internally.
- Five fixed failures separate workspace, path, provider-execution, and internal-validation stages without exposing raw diagnostics.
- Tool Card becomes nested-first with historical flat fallback; protected main-Smoke changes only through exact fail-closed in-memory substitutions.

## Local verification evidence

- Slice 16 initial RED: 0/10; schema-only GREEN: 3/10; focused final: 10/10.
- Slice 16 adjacent analysis/cache contracts: 79/79; complete `node --test test/*.test.mjs`: 263/263.
- `npm run build`, analysis Smoke, analysis CLI Smoke, protected main Smoke, standalone HTTP Smoke, all eight complete Smoke sections, and native-Windows Stress passed.
- Latest `npm pack --dry-run` passed with 131 files, 346.4 kB compressed, and 1.8 MB unpacked; internal Memory/plan/spec files remain excluded.
- `git diff --check` passed; only established LF-to-CRLF working-copy warnings were emitted.
- Slice 16 publication and exact-head CI have not yet run.

## Published phase evidence

- Phase 0.5: baseline `82c24da`, Linux fix `da83f77`, and closure `73d7f8f`; CI runs `29183635923` and `29184298290` passed on Ubuntu/Windows Node 20/24.
- `server_config`: implementation `b989776`, record `ec6c0c0`, neat-freak `ca17257`; CI runs `29189127483`, `29189202711`, and `29189679200` passed.
- `tree`: implementation `6aaeda4`, record `2ecd4af`, final state `e7c1646`; CI runs `29194671044`, `29194802582`, and `29194978911` passed.
- `read`: implementation `282dcfa`, record `c90246f`; CI runs `29199573321` and `29199802824` passed.
- `git_status`: implementation `bc92970`; local gates and CI run `29202896685` passed on Ubuntu/Windows Node 20/24.
- `git_diff`: design `1bbe240`, plan `8083f53`, implementation `19f0042`, publication record `9103ce4`; CI run `29204692105` passed on Ubuntu/Windows Node 20/24.
- `show_changes`: design `5108e8a`, plan `8e885ef`, schema `69c5fea`, handler `2329160`, consumers `9777f32`, adjacent tests `c41365a`, documentation record `0051543`; CI run `29206887875` passed on Ubuntu/Windows Node 20/24.
- `search`: implementation and publication commit `02153a9`; CI run `29209071349` passed on Ubuntu/Windows Node 20/24.
- `write`: implementation commit `b807b9e`; CI run `29224276725` passed on Ubuntu/Windows Node 20/24.
- `edit`: implementation commit `89cf2e3`; CI run `29226366822` passed on Ubuntu/Windows Node 20/24.
- `apply_patch`: design commit `3279d0c`; implementation commit `c761b4e`; CI run `29233787814` passed Ubuntu/Windows Node 20/24.
- `bash`: planning `1f66073`, schema `0ddabfc`, handler `7a71421`, consumers `86350df`, publication record `a39b779`; CI run `29239425311` passed Ubuntu/Windows Node 20/24.
- `open_current_workspace`: implementation and reconciliation commit `d887849`; final exact-head `e0e5f77` passed CI run `29246163724` on Ubuntu/Windows with Node 20/24.
- `open_workspace`: implementation and publication-review commit `c31e8a1`; exact-head CI run `29253838423` passed Ubuntu/Windows with Node 20/24.
- `workspace_snapshot`: implementation and publication-review commit `242315e`; exact-head CI run `29258565084` passed Ubuntu/Windows with Node 20/24.
- `list_workspaces`: implementation commit `c4eb31a`; exact-head CI run `29267724784` passed Ubuntu/Windows with Node 20/24.
- Detailed RED/GREEN evidence, blockers, rollback, and publication records are split across Phase 1 Volume 1 (STEP-073–139), closed Volume 2 (STEP-140–151), closed Volume 3 (STEP-152–165), and active Volume 4 (STEP-166 onward).

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Git failure classification remains coupled to current string output from `src/gitOps.ts`.
- Direct `edit` failure classification remains coupled to current `CodexProError` message prefixes and operating-system error codes.
- Direct `apply_patch` input/path classification remains coupled to current internal message prefixes; Git stage classification now uses tool-local typed markers.
- Direct `bash` failure classification remains coupled to current message prefixes and Node error codes; safe Bash is not a sandbox, and timeout does not reliably terminate the complete Windows process tree.
- Direct `open_current_workspace` failure classification remains coupled to current `WorkspaceManager` message prefixes and Node error codes; workspace ownership, expiry, and client isolation remain deferred to Phase 2.
- Direct `open_workspace` root-failure classification also depends on bounded `WorkspaceManager` prefixes and Node error codes.
- Main-Smoke and HTTP-Smoke compatibility loaders depend on exact protected-source strings; source drift fails closed and requires a same-change loader update.
- Direct `workspace_snapshot` validation remains intentionally tool-local and duplicates some open-tool invariants until a later separately reviewed extraction.
- Direct `inspect_workspace` validation remains intentionally tool-local, duplicates some analysis schemas from `search`, and depends on bounded internal error-message prefixes for workspace/path classification.
- Review checkpoints remain process-local memory state and are not shared across service restarts.
- Native-Windows Stress skips only the established POSIX-only multi-colon filename fixture and isolates fake-home discovery with both `HOME` and `USERPROFILE`.
- `docs/memory/archive/phase-1.md` exceeds the normal direct read-size limit and is the unchanged first Phase 1 archive volume covering STEP-073–139.
- Phase 1 Volume 2 is closed at STEP-151; Volume 3 is closed at STEP-165 after crossing the rollover threshold; `phase-1-part-4.md` is active from STEP-166 onward.

## Open items

1. Execute Slice 16 Task 5: run `neat-freak`, repeat release gates, precisely stage, commit, push, and verify implementation exact-head CI.
2. Publish and verify a separate durable record; keep workspace lifecycle, semantic-provider expansion, and Phase 2 closed.

## Recent summaries

- **STEP-175 — Complete local Slice 16 verification:** focused 10/10, adjacent 79/79, complete 263/263, all Build/Smoke/Stress/package/diff gates passed.
- **STEP-174 — Implement handler and migrate consumers:** added exact provider validation and staged failures; Tool Card, protected Smoke, Stress, and cache consumers now use nested data.
- **STEP-173 — Establish Slice 16 RED and schema GREEN:** initial RED was 0/10; schema-only intermediate was 3/10 before handler and consumer migration.
- **STEP-172 — Design and plan direct `inspect_workspace`:** selected the core repository-analysis result, approved its exact sixteen-field contract and five fixed failures, and wrote the five-task TDD plan.
- **STEP-171 — Publish direct `list_workspaces`:** implementation commit `c4eb31a` was pushed and exact-head CI run `29267724784` passed Ubuntu/Windows Node 20/24.
- **STEP-170 — Complete local verification:** focused 13/13, adjacent 70/70, complete 253/253, Build, standalone HTTP Smoke, Smoke 8/8, native-Windows Stress, package dry-run, and diff checking passed.
- **STEP-169 — Migrate list consumers:** Tool Card became nested-first with flat fallback; one exact in-memory HTTP substitution preserved protected sources; all consumer gates passed.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Phase 1 Volume 1 — STEP-073 through STEP-139](docs/memory/archive/phase-1.md)
- [Closed Phase 1 Volume 2 — STEP-140 through STEP-151](docs/memory/archive/phase-1-part-2.md)
- [Closed Phase 1 Volume 3 — STEP-152 through STEP-165](docs/memory/archive/phase-1-part-3.md)
- [Active Phase 1 Volume 4 — STEP-166 onward](docs/memory/archive/phase-1-part-4.md)

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
