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
- Phase 1: the `server_config`, `tree`, `read`, and `git_status` slices are published and cross-platform CI-validated.

## Approved stopping point

Phase 0.5 is closed. The Phase 1 `server_config`, `tree`, `read`, and `git_status` slices are published and cross-platform CI-validated. `git_status` implementation commit `bc92970` is on `origin/main`; CI run `29202896685` passed on Ubuntu/Windows with Node 20/24. No implementation task is active. The next permitted action is a separately reviewed Phase 1 design for one additional tool; Phase 2 remains closed.

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
- The first Phase 1 slice uses a strict `server_config` envelope: top-level tool identity plus `ok`, `data`, `error`, and `meta`; configuration fields live only under `data`.
- Its initial `meta` contract is exactly `schemaVersion`, `durationMs`, and `warnings`; `requestId` is omitted until a trustworthy transport-aware identity exists.
- Its stable error object is `code`, `message`, `retryable`, and `details`; the first slice introduces only `INTERNAL_ERROR`, with redacted output and no stack traces or secrets.
- Schema ownership is split: `src/tools/schemas/common.ts` owns shared envelope contracts, while `src/tools/schemas/serverConfig.ts` owns the exact `server_config` data and output schemas; types are inferred from Zod.
- Contract tests use a pure handler/result factory with test-only dependency injection; no environment flag, CLI option, hidden MCP argument, HTTP route, or production test mode is allowed.
- The second Phase 1 slice is `tree` only. It preserves existing snake_case data fields under `data`: `workspace_id`, `root`, `text`, `entries`, and `truncated`.
- `tree` introduces only `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `FILE_NOT_FOUND`, `NOT_A_DIRECTORY`, and `INTERNAL_ERROR`; all are non-retryable and use exact safe details.
- `tree` uses a local error-classification adapter because the global `CodexProError` remains untyped; global error refactoring and Phase 2 workspace lifecycle work are out of scope.
- The approved `tree` design is recorded in `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md`; its four-task TDD plan in `docs/superpowers/plans/2026-07-12-tree-output-schema.md` is fully executed, published, and cross-platform CI-validated.
- The third Phase 1 slice is `read` only. Its ten existing success fields remain unchanged under `data`: `workspace_id`, `root`, `path`, `text`, `startLine`, `endLine`, `totalLines`, `bytes`, `sha256`, and `truncated`.
- `read` permits exactly nine non-retryable errors: `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `FILE_NOT_FOUND`, `NOT_A_FILE`, `FILE_TOO_LARGE`, `FILE_NOT_TEXT`, `INVALID_LINE_RANGE`, and `INTERNAL_ERROR`.
- The approved `read` design is `docs/superpowers/specs/2026-07-12-read-output-schema-design.md`; it preserves current reading, hashing, redaction, optional workspace fallback, and the unrelated Windows Stress limitation.
- Its implementation plan is `docs/superpowers/plans/2026-07-12-read-output-schema.md`: four completed TDD tasks covering Schema, real MCP integration, Tool Card/consumer migration, and complete publication verification.
- The fourth Phase 1 slice is `git_status` only. It preserves six success fields under `data`: `workspace_id`, `root`, `path`, `status`, `changed_files`, and `changed`; `changed_files` remains a list of Git status lines rather than pure paths.
- `git_status` removes legacy success-field `status_error` and permits exactly seven non-retryable failures: `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `GIT_NOT_REPOSITORY`, `GIT_UNAVAILABLE`, `GIT_COMMAND_FAILED`, and `INTERNAL_ERROR`.
- Safe nonexistent Git pathspecs remain successful clean results. `git_diff`, `show_changes`, typed Git services, parsed porcelain entries, Git writes, and Phase 2 remain out of scope.
- The approved design and compact executed plan are `docs/superpowers/specs/2026-07-12-git-status-output-schema-design.md` and `docs/superpowers/plans/2026-07-12-git-status-output-schema.md`; implementation commit `bc92970` and CI run `29202896685` are published and passing.
- Do not stage, commit, push, rewrite history, rotate credentials, or expand access without explicit approval.

## Published phase evidence

- Phase 0.5: baseline `82c24da`, Linux fix `da83f77`, and closure `73d7f8f`; CI runs `29183635923` and `29184298290` passed on Ubuntu/Windows Node 20/24; external Cloudflare Host validation reached the expected unauthenticated `401`.
- `server_config`: implementation `b989776`, record `ec6c0c0`, neat-freak `ca17257`; CI runs `29189127483`, `29189202711`, and `29189679200` passed.
- `tree`: implementation `6aaeda4`, record `2ecd4af`, final state `e7c1646`; CI runs `29194671044`, `29194802582`, and `29194978911` passed.
- `read`: implementation `282dcfa`, record `c90246f`; CI runs `29199573321` and `29199802824` passed.
- `git_status`: implementation `bc92970`; local gates passed 17/17 focused, 89/89 complete tests, Build, 8/8 Smoke, audit 0, 107-file package, documentation 5/5, text safety, consumer, and scope audits; CI run `29202896685` passed on Ubuntu/Windows Node 20/24.
- Detailed RED/GREEN evidence, failed attempts, rollback, and publication records are in `docs/memory/archive/phase-1.md`.

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- `npm run stress` remains separately blocked on native Windows because its fixture creates the invalid filename `visible:123:file.txt`; the fixture was not changed and `node --check scripts/stress.mjs` passed.

## Open items

1. No Phase 1 implementation task is active; the next permitted action is a separately reviewed design for one additional Phase 1 tool.
2. Keep Phase 2 and another tool implementation closed without a new approved design and plan.
3. Treat the native-Windows Stress fixture filename issue as separate maintenance work.

## Recent summaries

- **STEP-120 — Publish `git_status`:** created and pushed implementation commit `bc92970`, confirmed local `main` synchronized with `origin/main`, and verified CI run `29202896685` passed on Ubuntu/Windows with Node 20/24; publication-record synchronization followed.
- **STEP-119 — Neat-freak pre-publication review:** audited project rules, documentation links, Memory limits, current consumers, and the exact eleven-file slice; compressed the executed `git_status` plan from 1828 lines / 55.8 KB to 216 lines / 9.9 KB while preserving contract and evidence.
- **STEP-118 — Complete local `git_status` slice:** passed 17/17 focused, 89/89 full tests, Build, all 8 Smoke sections, Stress syntax, audit 0, 107-file package, and documentation 5/5; eleven-file text, consumer, and scope audits passed.
- **STEP-117 — Task 3 card and consumers:** observed 16/17 with only the legacy card failing, then migrated the dedicated card and six Stress field references; 17/17 focused, Stress syntax, 34/34 regressions, and Build passed.
- **STEP-116 — Task 2 real `git_status` MCP integration:** observed the expected 4-pass/11-fail RED, then added the descriptor, provider seam, classifiers, strict envelopes, and redaction; 15/15 focused, 34/34 regressions, and Build passed.
- **STEP-115 — Task 1 exact `git_status` contracts:** observed the expected missing-module RED, added the six-field schema, seven errors, and constructors, then passed 4/4 focused tests plus Build.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Active Phase 1 planning and implementation — STEP-073 onward](docs/memory/archive/phase-1.md)

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Create the next phase archive only when that phase begins.
- Record between-phase work in `docs/memory/archive/interphase-maintenance.md`.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
