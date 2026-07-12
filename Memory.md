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
- Phase 1: the first `server_config` and second `tree` vertical slices are published and cross-platform CI-validated. The `tree` implementation is commit `6aaeda4`; its publication records are commits `2ecd4af` and `e7c1646`.

## Approved stopping point

Phase 0.5 is closed. The first Phase 1 `server_config` and second `tree` slices are published and cross-platform CI-validated. No implementation task is active. The next permitted action is design and planning for one additional Phase 1 tool after explicit approval. Do not begin Phase 2 or a third tool implementation without a separately reviewed plan and explicit approval.

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

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- `npm run stress` remains separately blocked on native Windows because its fixture creates the invalid filename `visible:123:file.txt`; the fixture was not changed and `node --check scripts/stress.mjs` passed.

## Open items

1. No Phase 1 implementation task is active; the next permitted action is selecting and designing one additional tool after explicit approval.
2. Keep Phase 2 and a third tool implementation closed without a new reviewed design and plan.
3. Treat the native-Windows Stress fixture filename issue as separate maintenance work.

## Recent summaries

- **STEP-088 — Push exact `server_config` slice:** after explicit approval, pushed implementation commit `b989776` to `origin/main` and prepared the publication record.
- **STEP-089 — Neat-freak Phase 1 slice closeout:** verified both implementation and record CI runs passed on Ubuntu/Windows Node 20/24, confirmed local/remote synchronization, removed completed push/CI items, and restored a planning-only boundary for the next tool.
- **STEP-090 — Publish and verify neat-freak closeout:** committed and pushed the six-file closeout as `ca17257`, then verified CI run `29189679200` completed successfully on Ubuntu/Windows Node 20/24.
- **STEP-091 — Select and specify the `tree` slice:** inspected the current tool list and implementation boundaries, approved `tree` as the second Phase 1 slice, fixed its exact data and six-code failure contract, wrote and self-reviewed `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md`, and stopped before implementation-plan writing.
- **STEP-092 — Write the `tree` implementation plan:** after written-spec approval, produced and self-reviewed `docs/superpowers/plans/2026-07-12-tree-output-schema.md` with four TDD tasks, 41 tracked steps, exact interfaces and code, per-task Memory/review gates, complete verification, rollback, and a stop before Task 1 pending user approval.
- **STEP-093 — Task 1 exact `tree` contracts:** under TDD, added `src/tools/schemas/tree.ts` and `test/tree-contract.test.mjs`; observed the expected missing-module RED, then passed 4/4 focused tests and the TypeScript build. Real MCP integration and Tool Card migration remain unstarted.
- **STEP-094 — Task 2 real `tree` MCP integration:** added the exact advertised Schema, strict success/failure envelopes, constructor-only `treeResultProvider`, safe local error classification, and seven real MCP tests; 11/11 focused tests, 6/6 `server_config` regression tests, and Build passed. Tool Card migration remains Task 3.
- **STEP-095 — Task 3 nested-data `tree` Tool Card:** under TDD, added a dedicated subtitle, success/error renderer, and route that read tool fields only from `data`; the new source-contract test failed before implementation, then all 12 focused tests and Build passed. Full closeout remained Task 4.
- **STEP-096 — Complete local `tree` slice:** passed 12/12 focused and 56/56 complete tests, Build, all 8 Smoke sections, audit, 103-file package, 5/5 documentation, Stress syntax, text-safety, consumer, and scope checks; migrated the one proven HTTP Smoke consumer to nested `data` and stopped before staging.
- **STEP-097 — Neat-freak `tree` closeout:** synchronized `AGENTS.md`, the Phase 1 roadmap, design status, plan status, all 41 plan checkboxes, and Memory; removed stale “second tool not started” text and established the reviewed eleven-file staging boundary.
- **STEP-098 — Stage reviewed `tree` slice:** after explicit approval, staged the complete eleven-file implementation, planning, documentation, test, Smoke-consumer, and Memory set; no unstaged changes, commit, or push followed.
- **STEP-099 — Commit and push `tree` implementation:** created commit `6aaeda4` (`feat: add exact tree output schema`) from the reviewed eleven-file set and pushed `main` to `origin`; closeout record publication and CI verification remained.
- **STEP-100 — Verify and close `tree` publication:** published commits `2ecd4af` and `e7c1646`; CI runs `29194671044`, `29194802582`, and `29194978911` passed, local `main` matched `origin/main`, and the project returned to the Phase 1 planning boundary.
- **STEP-101 — Neat-freak publication reconciliation:** removed stale staging language and commit history from active rules, synchronized final commit/CI evidence across the roadmap, design, plan, and Memory, and reduced the root index below its practical limit.

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
