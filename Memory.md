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
- Phase 1: the `server_config`, `tree`, and `read` slices are published and cross-platform CI-validated. The fourth `git_status` slice is locally complete, neat-freak reviewed, and authorized for publication; it remains unstaged at this checkpoint.

## Approved stopping point

Phase 0.5 is closed. The Phase 1 `server_config`, `tree`, and `read` slices are published and cross-platform CI-validated. `git_status` is locally complete: 17/17 focused, 89/89 full tests, Build, 8/8 Smoke, audit 0, 107-file package, and documentation 5/5 passed. Neat-freak reduced the executed plan from 1828 lines / 55.8 KB to 216 lines / 9.9 KB without changing the contract. Staging, commit, and push are now authorized; Phase 2 remains closed.

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
- The approved design is `docs/superpowers/specs/2026-07-12-git-status-output-schema-design.md`; all four tasks in `docs/superpowers/plans/2026-07-12-git-status-output-schema.md` are locally complete and verified.
- Do not stage, commit, push, rewrite history, rotate credentials, or expand access without explicit approval.

## Final Phase 0.5 evidence

- Baseline commit: `82c24da` (`feat: complete Phase 0.5 security baseline`).
- Linux process-tree fix: `da83f77` (`fix: clean up Linux test process trees`).
- Closure record: `73d7f8f` (`docs: close Phase 0.5`).
- Local Node 24 regression: 38/38 passed.
- Local Node 20 regression: 38/38 passed.
- Smoke: 8/8 sequential sections passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm pack --dry-run`: 97 files; internal memory archives excluded.
- CodexPro self-test: 7 pass, 0 fail.
- Runtime-fix CI run `29183635923`: Ubuntu/Windows Node 20/24 all passed.
- Closure-record CI run `29184298290`: Ubuntu/Windows Node 20/24 all passed.
- Stale CI run `29181286011`: manually cancelled after the replacement run passed.
- External Cloudflare validation: the public hostname reached CodexPro through Cloudflare, passed Host validation, and returned the expected unauthenticated `401`.

## First Phase 1 slice evidence

- Contract test: 6/6 passed; complete Node suite: 44/44 passed.
- Build passed; all 8 Smoke sections passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm pack --dry-run`: 101 files; internal Memory/spec/plan archives excluded.
- Documentation test: 5/5 passed; changed-file text validation passed.
- Implementation commit `b989776` and record commit `ec6c0c0` were pushed successfully to `origin/main`.
- CI runs `29189127483` and `29189202711`: Ubuntu/Windows Node 20/24 all passed.
- Local `main` and `origin/main` were synchronized at `ec6c0c0` before the documentation-only tidy-up.
- Neat-freak closeout commit `ca17257` was pushed to `origin/main`; CI run `29189679200` completed successfully on Ubuntu/Windows Node 20/24.

## Second Phase 1 slice final evidence

- Baseline before Task 1: complete Node suite 44/44 passed.
- Task 1 RED: `test/tree-contract.test.mjs` failed with the expected `ERR_MODULE_NOT_FOUND` for `src/tools/schemas/tree.ts`.
- Task 1 GREEN: 4/4 focused Schema/constructor tests passed.
- TypeScript build passed with exit code 0.
- Task 2 RED: the original 4 constructor tests passed while 7 real MCP tests failed for the missing descriptor, legacy result shape, and absent provider seam.
- Task 2 GREEN: 11/11 focused tests passed, including real success, five expected user errors, and redacted `INTERNAL_ERROR`.
- Existing `server_config` contract regression: 6/6 passed; TypeScript build passed.
- Task 3 RED: the first 11 tests passed while the new Tool Card source-contract test failed because `renderTree` and the dedicated route were absent.
- Task 3 GREEN: 12/12 focused tests passed; TypeScript build passed.
- Task 4 focused/full/build gates: 12/12 focused tests, 56/56 complete Node tests, and TypeScript build passed.
- Initial Smoke found one approved direct consumer in `scripts/http-smoke.mjs`; after moving its two reads to `structuredContent.data`, the narrow HTTP Smoke and all 8 full Smoke sections passed.
- Audit: 0 vulnerabilities. Package dry-run: 103 files; compiled `tree` Schema included and internal tests/Memory/specs/plans excluded. Documentation: 5/5 passed.
- Stress syntax, whitespace, conflict-marker, NUL, Memory-limit, credential-pattern, stale-consumer, and complete-scope checks passed.
- Implementation commit `6aaeda4`, publication-record commit `2ecd4af`, and final-state commit `e7c1646` were pushed to `origin/main`; CI runs `29194671044`, `29194802582`, and `29194978911` all passed.

## Third Phase 1 slice final evidence

- Task 1 RED was the expected missing `src/tools/schemas/read.ts`; GREEN was 4/4 strict constructor/schema tests.
- Task 2 RED was 4 passed and 11 failed against the legacy MCP contract; GREEN was 15/15 after exact handler integration and Windows temp-root canonicalization in tests only.
- Task 3 RED was 15 passed and 1 missing-card failure; GREEN was 16/16 after the dedicated nested-data card and seven approved Stress consumer migrations.
- Complete local gates: 16/16 focused, 72/72 Node tests, Build, all 8 Smoke sections, audit 0 vulnerabilities, 105-file package, and documentation 5/5.
- Stress syntax, whitespace, conflict-marker, NUL, Memory-limit, credential-pattern, stale-consumer, and complete-scope checks passed.
- Implementation commit `282dcfa` and publication-record commit `c90246f` were pushed to `origin/main`; CI runs `29199573321` and `29199802824` passed on Ubuntu/Windows with Node 20/24.

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- `npm run stress` remains separately blocked on native Windows because its fixture creates the invalid filename `visible:123:file.txt`; the fixture was not changed and `node --check scripts/stress.mjs` passed.

## Open items

1. Execute the authorized staging, commit, and push workflow for the exact eleven-file `git_status` slice.
2. Record the resulting commit, remote synchronization, and available CI evidence after publication.
3. Keep Phase 2 and another tool migration closed.
4. Treat the native-Windows Stress fixture filename issue as separate maintenance work.

## Recent summaries

- **STEP-119 — Neat-freak pre-publication review:** audited project rules, documentation links, Memory limits, current consumers, and the exact eleven-file slice; compressed the executed `git_status` plan from 1828 lines / 55.8 KB to 216 lines / 9.9 KB while preserving contract and evidence; authorized publication workflow remains next.
- **STEP-118 — Complete local `git_status` slice:** passed 17/17 focused, 89/89 full tests, Build, all 8 Smoke sections, Stress syntax, audit 0, 107-file package, and documentation 5/5; eleven-file text, consumer, and scope audits passed; synchronized design, plan, roadmap, AGENTS, and Memory; stopped unstaged before publication.
- **STEP-117 — Task 3 card and consumers:** observed 16/17 with only the legacy card failing, then migrated the dedicated `git_status` subtitle/renderer to nested `data` and stable `error`, preserved `show_changes`, and moved exactly six Stress field references through a controlled patch after secret scanning blocked normal edit; 17/17 focused, Stress syntax, 34/34 regressions, and Build passed.
- **STEP-116 — Task 2 real `git_status` MCP integration:** observed the expected 4-pass/11-fail legacy-handler RED, then added the exact descriptor, constructor-only provider seam, local safe classifiers, strict success/failure envelopes, readable content, and stable error redaction; 15/15 focused, 34/34 published-contract regressions, and Build passed while `git_diff`/`show_changes` remained unchanged.
- **STEP-115 — Task 1 exact `git_status` contracts:** baseline was 72/72 Node tests and Build; observed the expected missing-module RED, then added the strict six-field data schema, seven error variants, envelope constructors, and passed 4/4 focused tests plus Build; the public handler remained legacy until Task 2.
- **STEP-114 — Write the `git_status` implementation plan:** produced and self-reviewed the four-task TDD plan, corrected RED counts and cross-platform assertions, and stopped before Task 1.
- **STEP-113 — Select and specify the `git_status` slice:** approved the fourth Phase 1 tool-local contract, preserved six success fields under nested `data`, fixed seven stable errors, preserved safe nonexistent pathspec behavior, and wrote the approved design.

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
