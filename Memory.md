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
- Phase 1: `server_config`, `tree`, `read`, `git_status`, and `git_diff` are published and cross-platform CI-validated.

## Approved stopping point

The fifth Phase 1 vertical slice, `git_diff`, is published. Implementation commit `19f0042` provides exact schema-v1 success/failure contracts, a dedicated direct Tool Card, and preserved `path`/`staged`/`include_diff` behavior. Publication record `9103ce4` is on `origin/main`; CI run `29204692105` passed on Ubuntu/Windows with Node 20/24. No implementation task is active. The next permitted action is a separately reviewed Phase 1 design for one additional tool; Phase 2 remains closed.

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
- `git_status` preserves six success fields, removes `status_error`, and uses seven safe Git/path errors.
- Direct `git_diff` preserves nine success fields under `data`, removes legacy `diff_error`, and uses the same seven safe Git/path errors.
- `git_diff` preserves blank and safe nonexistent pathspecs, staged selection, stats-only output, legacy text content, and supertool wrapping.
- `show_changes`, `src/gitOps.ts`, typed Git services, parsed hunks/files, Git writes, authentication, dependencies, and Phase 2 remain out of scope.
- The approved `git_diff` design and plan are `docs/superpowers/specs/2026-07-12-git-diff-output-schema-design.md` and `docs/superpowers/plans/2026-07-12-git-diff-output-schema.md`.
- Do not stage, commit, push, rewrite history, rotate credentials, or expand access without explicit approval; the user explicitly approved autonomous completion of this slice.

## Published phase evidence

- Phase 0.5: baseline `82c24da`, Linux fix `da83f77`, and closure `73d7f8f`; CI runs `29183635923` and `29184298290` passed on Ubuntu/Windows Node 20/24.
- `server_config`: implementation `b989776`, record `ec6c0c0`, neat-freak `ca17257`; CI runs `29189127483`, `29189202711`, and `29189679200` passed.
- `tree`: implementation `6aaeda4`, record `2ecd4af`, final state `e7c1646`; CI runs `29194671044`, `29194802582`, and `29194978911` passed.
- `read`: implementation `282dcfa`, record `c90246f`; CI runs `29199573321` and `29199802824` passed.
- `git_status`: implementation `bc92970`; local gates and CI run `29202896685` passed on Ubuntu/Windows Node 20/24.
- `git_diff`: design `1bbe240`, plan `8083f53`, implementation `19f0042`, publication record `9103ce4`; local gates passed 19/19 focused, 36/36 adjacent Git contracts, 108/108 complete tests, Build, all 8 Smoke sections, full native-Windows Stress, and `git diff --check`; CI run `29204692105` passed on Ubuntu/Windows Node 20/24.
- Detailed RED/GREEN evidence, blockers, rollback, and publication records are in `docs/memory/archive/phase-1.md`.

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Git failure classification remains coupled to current string output from `src/gitOps.ts`.
- Native-Windows Stress skips only the POSIX-only multi-colon filename fixture and isolates fake-home discovery with both `HOME` and `USERPROFILE`; the full remaining suite runs on Windows.

## Open items

1. No Phase 1 implementation task is active; the next permitted action is a separately reviewed design for one additional Phase 1 tool.
2. Keep Phase 2 closed without a new approved design and plan.

## Recent summaries

- **STEP-125 — Publish `git_diff`:** pushed through publication record `9103ce4`, confirmed local `main` synchronized with `origin/main`, and verified CI run `29204692105` passed on Ubuntu/Windows with Node 20/24.
- **STEP-124 — Commit `git_diff` implementation:** created `19f0042` after focused contracts, Build, Smoke, Stress, and diff-check passed; production scope remained limited to the direct tool schema/handler and dedicated card.
- **STEP-123 — Unblock native-Windows Stress:** confirmed the POSIX multi-colon filename and `HOME`-only fake-home assumptions were fixture bugs, then skipped only the incompatible filename case and set `USERPROFILE`; full Stress passed.
- **STEP-122 — Complete TDD migration:** observed missing-module and legacy-handler RED states, added the strict schema/provider seam/classifiers/card/consumer updates, and reached 19/19 focused plus 36/36 adjacent Git contracts.
- **STEP-121 — Approve `git_diff` design and plan:** committed the one-tool design as `1bbe240` and the four-task plan as `8083f53`, preserving `show_changes`, `src/gitOps.ts`, and Phase 2 boundaries.
- **STEP-120 — Publish `git_status`:** implementation `bc92970` and CI run `29202896685` passed on Ubuntu/Windows with Node 20/24.

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
