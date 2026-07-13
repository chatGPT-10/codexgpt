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
- Phase 1: the first eight slices are published and cross-platform CI-validated; the ninth direct `edit` slice is implemented and locally validated, with publication pending.

## Approved stopping point

The eighth Phase 1 vertical slice, direct `write`, is published in commit `b807b9e`; CI run `29224276725` passed on Ubuntu/Windows with Node 20/24. The ninth direct `edit` slice is implemented and locally validated under `docs/superpowers/specs/2026-07-13-edit-output-schema-design.md` and `docs/superpowers/plans/2026-07-13-edit-output-schema.md`; publication and CI verification are pending. Phase 2 remains closed.

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
- The repository has no `npm test` script; the complete regression command is `node --test test/*.test.mjs`.
- The user approved autonomous execution and publication of all four direct `edit` tasks; credential changes, history rewriting, access expansion, and Phase 2 remain unapproved.

## Local verification evidence

- Focused direct `edit` contracts: 14/14 passed.
- Adjacent `edit`/`write`/`read`/`show_changes` contracts: 56/56 passed.
- Complete `node:test` regression suite: 163/163 passed.
- `npm run build`: passed.
- `npm run smoke`: all eight sections passed.
- `npm run stress`: passed on native Windows after replacing one obsolete raw `binary` text assertion with the stable `FILE_NOT_TEXT` code.
- `git diff --check`: passed; Git emitted only the established Windows LF-to-CRLF working-copy warnings.
- Design and plan self-review found no placeholders, scope expansion, type drift, or changes to `apply_patch`, authentication, dependencies, workspace lifecycle, or Phase 2.

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
- Detailed RED/GREEN evidence, blockers, rollback, and publication records are in `docs/memory/archive/phase-1.md`.

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Git failure classification remains coupled to current string output from `src/gitOps.ts`.
- Direct `edit` failure classification remains coupled to current `CodexProError` message prefixes and operating-system error codes.
- Review checkpoints remain process-local memory state and are not shared across service restarts.
- Native-Windows Stress skips only the established POSIX-only multi-colon filename fixture and isolates fake-home discovery with both `HOME` and `USERPROFILE`.
- `docs/memory/archive/phase-1.md` exceeds the direct read-size limit; use targeted search while Phase 1 remains active, and do not split the append-only archive before phase closure without a separate reviewed maintenance decision.

## Open items

1. Publish the locally verified direct `edit` slice, verify Ubuntu/Windows Node 20/24 CI, and record the final synchronized branch state.
2. Keep Phase 2 closed without a new approved design and plan.

## Recent summaries

- **STEP-138 — Implement and verify direct `edit`:** added the exact schema-v1 contract, fourteen stable failures, validated provider/path boundary, cache-safe nested Tool Card/supertool consumers, and TDD coverage; focused 14/14, adjacent 56/56, complete 163/163, Build, Smoke 8/8, native-Windows Stress, and diff check passed.
- **STEP-137 — Plan direct `edit`:** wrote and self-reviewed a four-task TDD implementation plan covering the exact schema, handler classification, cache ordering, nested consumers, complete gates, memory reconciliation, and conditional publication.
- **STEP-136 — Design direct `edit`:** approved the isolated ninth Phase 1 slice with exact nested success data, fourteen stable failures, a validated provider seam, dedicated Tool Card handling, and no expansion into `apply_patch`, atomic editing, or Phase 2.
- **STEP-135 — Publish `write`:** pushed implementation commit `b807b9e` and verified CI run `29224276725` passed on Ubuntu/Windows with Node 20/24.
- **STEP-134 — Reconcile the eighth slice:** updated the design, plan, changelog, AGENTS map, and project memory after the full local verification suite passed.
- **STEP-133 — Implement and verify direct `write`:** added the exact schema-v1 contract, eleven stable failures, validated provider seam, nested Tool Card/supertool consumers, and TDD coverage; focused 12/12, adjacent 42/42, complete 149/149, Build, Smoke 8/8, and native-Windows Stress passed.
- **STEP-132 — Design and plan direct `write`:** approved the isolated eighth Phase 1 slice without expanding into `edit`, `apply_patch`, atomic editing, or Phase 2.
- **STEP-131 — Publish `search`:** pushed commit `02153a9`, confirmed local/remote synchronization, and verified CI run `29209071349` passed on Ubuntu/Windows with Node 20/24.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Active Phase 1 planning and implementation — STEP-073 onward](docs/memory/archive/phase-1.md)

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
