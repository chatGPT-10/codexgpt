# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-12.
- Workspace: `D:\Dev\codexpro`.
- Branch: `main`.
- Package: `codexpro@0.28.6`.
- GitHub repository: `chatGPT-10/codexgpt`.
- Local `origin` fetch and push URLs use `https://github.com/chatGPT-10/codexgpt.git`.
- Primary platform: native Windows.
- Phase 0: complete.
- Phase 0.5: formally closed on 2026-07-12.
- Phase 1: `server_config`, `tree`, `read`, `git_status`, and `git_diff` are published; `show_changes` is implemented and locally verified, with publication pending.

## Approved stopping point

The sixth Phase 1 vertical slice, direct `show_changes`, is implemented, locally verified, and neat-freak reconciled. Design commit `5108e8a`, plan commit `8e885ef`, schema commit `69c5fea`, handler commit `2329160`, consumer commit `9777f32`, and adjacent-test correction `c41365a` are on local `main`. Documentation commit, publication, and remote CI evidence remain pending. Do not begin another Phase 1 tool or Phase 2 until this slice is published and recorded.

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
- `src/gitOps.ts`, `src/analysis/*`, Git writes, authentication, dependencies, and Phase 2 remain out of scope for this slice.
- The repository has no `npm test` script; the complete regression command is `node --test test/*.test.mjs`.
- Do not stage, commit, push, rewrite history, rotate credentials, or expand access without explicit approval; the user explicitly approved autonomous completion and publication of this slice.

## Local verification evidence

- Focused `show_changes` contracts: 14/14 passed.
- Adjacent `git_status`, `git_diff`, and `show_changes` contracts: 50/50 passed.
- Complete `node:test` regression suite: 122/122 passed.
- `npm run build`: passed.
- `npm run smoke`: all eight sections passed.
- `npm run stress`: passed on native Windows.
- `git diff --check`: passed.
- One attempted `npm test` command failed because no such package script exists; the actual complete regression command then passed.

## Published phase evidence

- Phase 0.5: baseline `82c24da`, Linux fix `da83f77`, and closure `73d7f8f`; CI runs `29183635923` and `29184298290` passed on Ubuntu/Windows Node 20/24.
- `server_config`: implementation `b989776`, record `ec6c0c0`, neat-freak `ca17257`; CI runs `29189127483`, `29189202711`, and `29189679200` passed.
- `tree`: implementation `6aaeda4`, record `2ecd4af`, final state `e7c1646`; CI runs `29194671044`, `29194802582`, and `29194978911` passed.
- `read`: implementation `282dcfa`, record `c90246f`; CI runs `29199573321` and `29199802824` passed.
- `git_status`: implementation `bc92970`; local gates and CI run `29202896685` passed on Ubuntu/Windows Node 20/24.
- `git_diff`: design `1bbe240`, plan `8083f53`, implementation `19f0042`, publication record `9103ce4`; CI run `29204692105` passed on Ubuntu/Windows Node 20/24.
- `show_changes`: design `5108e8a`, plan `8e885ef`, schema `69c5fea`, handler `2329160`, consumers `9777f32`, adjacent tests `c41365a`; publication and remote CI pending.
- Detailed RED/GREEN evidence, blockers, rollback, and publication records are in `docs/memory/archive/phase-1.md`.

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Git failure classification remains coupled to current string output from `src/gitOps.ts`.
- Review checkpoints remain process-local memory state and are not shared across service restarts.
- Native-Windows Stress skips only the established POSIX-only multi-colon filename fixture and isolates fake-home discovery with both `HOME` and `USERPROFILE`.
- `docs/memory/archive/phase-1.md` exceeds the direct read-size limit; use targeted search while Phase 1 remains active, and do not split the append-only archive before phase closure without a separate reviewed maintenance decision.

## Open items

1. Commit the reconciled documentation, push local `main`, and verify remote CI for `show_changes`.
2. After publication, the next permitted action is a separately reviewed design for one additional Phase 1 tool.
3. Keep Phase 2 closed without a new approved design and plan.

## Recent summaries

- **STEP-128 — Verify `show_changes` locally:** focused 14/14, adjacent 50/50, complete 122/122, Build, Smoke 8/8, native-Windows Stress, and diff-check passed.
- **STEP-127 — Complete TDD migration:** added strict schema/provider seams/classifiers, nested Tool Card/supertool consumers, safe analysis degradation, and updated historical adjacent card expectations.
- **STEP-126 — Approve sixth-slice design and plan:** selected direct `show_changes`, strict Git failures, and safe optional-analysis degradation while keeping Git/analysis services unchanged.
- **STEP-125 — Publish `git_diff`:** pushed through publication record `9103ce4` and verified CI run `29204692105` on Ubuntu/Windows Node 20/24.

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
