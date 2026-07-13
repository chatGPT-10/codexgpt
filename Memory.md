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
- Phase 1: the first twelve slices are published and cross-platform CI-validated; publication review passed for the thirteenth direct `open_workspace` slice, which is awaiting explicit publication approval.

## Approved stopping point

The first twelve Phase 1 slices are published and cross-platform CI-validated. Publication review passed for direct `open_workspace` after fixing bounded data-URL stack labels and global-Skill request-scope validation. Final local evidence is focused 18/18, adjacent 66/66, complete 220/220, Build, Smoke 8/8, native-Windows Stress, package dry-run, and diff checking. No Critical or Important findings remain. The next action requires explicit approval to stage, commit, and push, then verify exact-head Ubuntu/Windows Node 20/24 CI. Phase 2 remains closed.

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
- Published Phase 1 tools through direct `open_current_workspace` use strict nested schema-v1 envelopes and stable redacted failures; exact contracts remain in the Phase 1 archives and design documents.
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

## Local verification evidence

- Published `open_current_workspace`: focused 13/13, complete regression 202/202, Build, Smoke 8/8, native-Windows Stress, diff checking, and exact-head cross-platform CI passed.
- Direct `open_workspace` focused contracts: 18/18 passed, including bounded compatibility-stack labels and global-Skill request-scope validation.
- Adjacent workspace/config/tree/Git contracts: 66/66 passed.
- Complete `node:test` regression after publication review: 220/220 passed.
- `npm run build`, `npm run stress`, and all eight Smoke sections passed on native Windows.
- `npm pack --dry-run` passed with the new schema build artifacts included and internal Memory/plan/spec files excluded.
- `git diff --check` passed; only established LF-to-CRLF working-copy warnings were emitted.

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
- Detailed RED/GREEN evidence, blockers, rollback, and publication records are split across Phase 1 Volume 1 (STEP-073–139), closed Volume 2 (STEP-140–151), and active Volume 3 (STEP-152 onward).

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
- Review checkpoints remain process-local memory state and are not shared across service restarts.
- Native-Windows Stress skips only the established POSIX-only multi-colon filename fixture and isolates fake-home discovery with both `HOME` and `USERPROFILE`.
- `docs/memory/archive/phase-1.md` exceeds the normal direct read-size limit and is the unchanged first Phase 1 archive volume covering STEP-073–139.
- `docs/memory/archive/phase-1-part-2.md` is closed at STEP-151 after crossing the rollover threshold; `phase-1-part-3.md` is active from STEP-152 onward.

## Open items

1. After explicit approval, stage, commit, and push the publication-reviewed thirteenth slice, then verify exact-head Ubuntu/Windows Node 20/24 CI.
2. Keep Phase 2 closed until the remaining Phase 1 scope is explicitly reviewed.

## Recent summaries

- **STEP-158 — Neat-freak and publication review:** reconciled all 28 plan steps, reduced Memory to a thinner index, fixed bounded data-URL stack labels and global-Skill request-scope validation, and passed focused 18/18, adjacent 66/66, complete 220/220, Build, Smoke 8/8, Stress, package dry-run, and diff checking.
- **STEP-157 — Eliminate the protected main-Smoke false green:** added exact-count in-memory migration for four `open_current_workspace` and three `open_workspace` workspace-ID reads; focused 16/16, adjacent 64/64, complete 218/218, and Smoke 8/8 pass.
- **STEP-156 — Complete the protected HTTP Smoke path:** added the exact fail-closed in-memory compatibility loader; HTTP Smoke and all eight Smoke sections passed.
- **STEP-155 — Implement direct `open_workspace` to the protected-consumer boundary:** added the exact schema, stage-aware handler, strict provider validation, Tool Card migration, and 15 focused contracts; 63 adjacent and 217 complete tests plus Build/Stress passed before the protected HTTP Smoke path was completed.
- **STEP-154 — Design direct `open_workspace`:** approved the independent thirteenth Phase 1 slice with a strict twelve-field envelope, seven redacted failures, deterministic alias normalization, stage-aware error classification, and no Phase 2 lifecycle expansion.
- **STEP-153 — Verify exact-head CI:** queried the public GitHub Actions API from Windows PowerShell and confirmed final HEAD `e0e5f77` passed CI run `29246163724` on Ubuntu/Windows with Node 20/24.
- **STEP-152 — Roll over Phase 1 memory:** closed Volume 2 at STEP-151 after it reached approximately 51.4 KB and opened `phase-1-part-3.md` as the active continuation.
- **STEP-151 — Publish direct `open_current_workspace`:** committed the reconciled slice as `d887849` and pushed `main` to `origin`; later exact-head verification is recorded in STEP-153.
- **STEP-150 — Reconcile the twelfth slice:** ran `neat-freak`, audited rule/document references, reduced `Memory.md` from 145 lines/15.5 KB to a thinner index, and aligned all current stopping points with the authorized publication workflow.
## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Phase 1 Volume 1 — STEP-073 through STEP-139](docs/memory/archive/phase-1.md)
- [Closed Phase 1 Volume 2 — STEP-140 through STEP-151](docs/memory/archive/phase-1-part-2.md)
- [Active Phase 1 Volume 3 — STEP-152 onward](docs/memory/archive/phase-1-part-3.md)

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
