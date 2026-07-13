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
- Phase 1: the first eleven slices are published and cross-platform CI-validated; direct `bash` is the published eleventh slice.

## Approved stopping point

The first eleven Phase 1 slices are published and cross-platform CI-validated. Direct `bash` was published through commit `a39b779`; exact-head CI run `29239425311` passed Ubuntu/Windows with Node 20/24. The next action is to design-review the next Phase 1 vertical slice. Phase 2 remains closed.

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
- `tree` preserves five existing snake_case fields and six safe non-retryable errors.
- `read` preserves ten existing success fields and nine safe non-retryable errors.
- `git_status` preserves six success fields and seven safe Git/path errors.
- Direct `git_diff` preserves nine success fields and the same seven safe Git/path errors.
- Direct `show_changes` preserves staged/path/diff/checkpoint/untracked/UTF-8 behavior under strict nested `data` and removes legacy `status_error`/`diff_error` partial-success fields.
- `show_changes` Git, workspace, and path failures use the seven established safe Git/path codes and return `isError: true`.
- Optional change analysis failure keeps valid Git review data, returns `analysis: null`, and adds only `Change analysis was unavailable; Git review data is still complete.` to `meta.warnings`.
- `show_changes` analysis data is exact and strict; malformed provider data degrades safely rather than leaking raw diagnostics.
- Direct `search` preserves lexical matches under nested `data`, keeps aggregate text only in MCP `content`, and returns exact optional analysis or `null`.
- Structured search disablement and unexpected analysis failure use separate fixed warnings while preserving complete lexical results and excluding raw diagnostics.
- Direct `search` exposes eight stable non-retryable workspace/path/argument/backend/internal errors; `src/searchOps.ts` and `src/analysis/*` algorithms remain unchanged.
- Direct `write` preserves nine success fields only under nested `data` and exposes eleven stable non-retryable workspace/path/file/policy/write/internal errors.
- The direct `write` provider seam validates the returned path and exact result before analysis-cache invalidation; only a validated changed diff invalidates the cache.
- Fixed `write` failures exclude raw exceptions, absolute unsafe paths, file content, and secrets while retaining safe compatibility wording required by the existing Smoke suite.
- `edit`, `apply_patch`, atomic editing, expected hashes, transactions, authentication, dependencies, and Phase 2 remain out of scope for the published `write` slice.
- Direct `edit` preserves nine success fields only under nested `data` and exposes fourteen non-retryable workspace/path/file/replacement/policy/edit/internal errors.
- Empty `old_text`, zero matches, ambiguous matches, and expected-count mismatch are distinct failures: `INVALID_ARGUMENT`, `OLD_TEXT_NOT_FOUND`, `OLD_TEXT_NOT_UNIQUE`, and `REPLACEMENT_COUNT_MISMATCH`.
- The direct `edit` provider seam validates its exact result and returned path before analysis-cache invalidation; identical-text replacements remain successful but do not invalidate analysis when `diff.changed=false`.
- Fixed `edit` failures exclude raw exceptions, absolute unsafe paths, replacement text, file content, operating-system diagnostics, and secrets.
- `apply_patch`, fuzzy or regex editing, expected hashes, atomic replacement, transactions, rollback, undo, authentication, dependencies, and Phase 2 remain out of scope for the `edit` slice.
- The approved direct `apply_patch` design preserves its nine success fields only under nested `data`; `changed` is literal `true`, returned paths are non-empty and unique, and the submitted patch diff excludes unrelated dirty changes.
- Direct `apply_patch` uses twelve fixed non-retryable workspace/path/argument/policy/Git/patch/internal errors; raw patch content, Git diagnostics, unsafe absolute paths, file content, and secrets remain private.
- The direct `apply_patch` provider seam validates the exact result, requires safe normalized returned paths, compares the complete set against normalized submitted paths, and invalidates analysis only after full success validation.
- Atomic transactions, rollback, undo, expected hashes, fuzzy patching, authentication, dependencies, workspace lifecycle, and Phase 2/3 remain outside the `apply_patch` slice.
- Phase archives use bounded numbered volumes: after each complete STEP, open the next volume when the active file reaches 80% of the configured direct-read byte limit; earlier volumes remain unchanged.
- The repository has no `npm test` script; the complete regression command is `node --test test/*.test.mjs`.
- Direct `bash` is the locally complete eleventh Phase 1 slice; it stabilizes only the current synchronous Bash protocol and does not introduce PowerShell or process management.
- Bash `ok:true` means a valid process outcome; non-zero exit, signal, truncation, or the current timeout marker remain command-level results rather than tool-level errors.
- Direct `bash` exposes eleven nested success fields and eleven fixed non-retryable tool-level errors; the accidental public camelCase `bashSessionId` is removed.
- The handler validates exact provider command, normalized `cwd`, and configured session identity; Tool Card, supertool, Smoke, and Stress consumers use only the nested contract.
- Direct `bash` is published; credential changes, history rewriting, access expansion, and Phase 2 remain unapproved.

## Local verification evidence

- Focused direct `bash` contracts: 12/12 passed.
- Adjacent `bash`/`server_config`/`apply_patch`/`show_changes` contracts: 46/46 passed.
- Complete `node:test` regression suite: 189/189 passed.
- `npm run build`: passed.
- `npm run smoke`: all eight sections passed.
- `npm run stress`: passed on native Windows, including its internal build.
- `git diff --check`: passed before documentation reconciliation.
- Real coverage preserves compact/full transcripts, safe package scripts, Session Guard, disabled-Bash registration, direct/supertool policy rejection, and file-noncreation assertions.

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
- Detailed RED/GREEN evidence, blockers, rollback, and publication records are split across `docs/memory/archive/phase-1.md` (STEP-073–139) and the active `docs/memory/archive/phase-1-part-2.md` (STEP-140 onward).

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Git failure classification remains coupled to current string output from `src/gitOps.ts`.
- Direct `edit` failure classification remains coupled to current `CodexProError` message prefixes and operating-system error codes.
- Direct `apply_patch` input/path classification remains coupled to current internal message prefixes; Git stage classification now uses tool-local typed markers.
- Direct `bash` failure classification remains coupled to current message prefixes and Node error codes; safe Bash is not a sandbox, and timeout does not reliably terminate the complete Windows process tree.
- Review checkpoints remain process-local memory state and are not shared across service restarts.
- Native-Windows Stress skips only the established POSIX-only multi-colon filename fixture and isolates fake-home discovery with both `HOME` and `USERPROFILE`.
- `docs/memory/archive/phase-1.md` exceeds the normal direct read-size limit and is now the unchanged first Phase 1 archive volume covering STEP-073–139.
- `docs/memory/archive/phase-1-part-2.md` is the active bounded continuation from STEP-140 onward; future volumes may open only at complete STEP boundaries without renaming or rewriting earlier volumes.

## Open items

1. Design-review the next Phase 1 vertical slice using the established exact-schema workflow.
2. Keep Phase 2 closed until the remaining Phase 1 scope is explicitly reviewed.

## Recent summaries

- **STEP-146 — Publish direct `bash`:** pushed publication record `a39b779`, verified exact-head CI run `29239425311` passed Ubuntu/Windows Node 20/24, and confirmed local `main` matched `origin/main` before the final publication-record update.
- **STEP-145 — Implement and verify direct `bash`:** added the exact schema-v1 envelope, eleven fixed tool-level failures, validated provider identity, nested Tool Card/supertool consumers, and preserved command-level non-zero exits; focused 12/12, adjacent 46/46, complete 189/189, Build, Smoke 8/8, native-Windows Stress, and diff checks passed; publication remains pending.
- **STEP-144 — Design and plan direct `bash`:** selected the isolated eleventh Phase 1 slice, fixed the tool-level versus command-level outcome boundary, defined eleven nested success fields and eleven stable failures, wrote a four-task TDD plan, and kept Bash behavior, PowerShell/process work, implementation, publication, and Phase 2 closed.
- **STEP-143 — Publish direct `apply_patch`:** pushed implementation commit `c761b4e`, verified CI run `29233787814` passed Ubuntu/Windows Node 20/24, and confirmed local `main` matched `origin/main` before the publication-record update.
- **STEP-142 — Implement and verify direct `apply_patch`:** added the exact schema-v1 envelope, twelve fixed failures, normalized provider/path-set validation, cache-safe invalidation, dedicated Tool Card/supertool consumers, and TDD coverage; focused 14/14, adjacent 89/89, complete 177/177, Build, Smoke 8/8, native-Windows Stress, and diff check passed; publication remains pending.
- **STEP-141 — Commit and plan direct `apply_patch`:** committed the approved design as `3279d0c`, wrote and self-reviewed the four-task TDD plan, corrected returned-path normalization, bounded Tool Card previews, and deterministic Git-stage test interfaces, and kept implementation and Phase 2 closed.
- **STEP-140 — Design direct `apply_patch`:** approved and self-reviewed the isolated tenth Phase 1 slice with nine nested success fields, twelve stable non-retryable failures, exact returned-path-set validation, cache-safe provider ordering, a dedicated Tool Card path, and no expansion into atomic transactions, rollback, authentication, or Phase 2/3; opened bounded Phase 1 Volume 2 from STEP-140 without rewriting Volume 1.
## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Phase 1 Volume 1 — STEP-073 through STEP-139](docs/memory/archive/phase-1.md)
- [Active Phase 1 Volume 2 — STEP-140 onward](docs/memory/archive/phase-1-part-2.md)

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
