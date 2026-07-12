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
- Phase 1: first `server_config` vertical slice is fully published and CI-validated through implementation commit `b989776` and record commit `ec6c0c0`.

## Approved stopping point

Phase 0.5 is closed. The first Phase 1 `server_config` slice is published through implementation commit `b989776` and record commit `ec6c0c0`; CI runs `29189127483` and `29189202711` both passed on Ubuntu/Windows Node 20/24. Local `main` and `origin/main` are synchronized. Stop at the next planning boundary. Do not migrate a second tool without a separately reviewed plan and explicit approval.

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
- Local `main` and `origin/main` are synchronized at `ec6c0c0`; the worktree was clean before this documentation-only tidy-up.

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- `npm run stress` still fails on native Windows before reaching this slice because its fixture creates the invalid Windows filename `visible:123:file.txt`; script syntax and migrated `server_config` reads were checked separately.

## Open items

1. No Phase 1 implementation task is active; the first `server_config` slice is closed and verified.
2. The next permitted Phase 1 action is planning and design for one additional tool, after explicit approval.
3. Treat the native-Windows Stress fixture filename issue as separate maintenance work; do not mix it into the next schema slice.

## Recent summaries

- **STEP-077 — Split schema ownership:** approved S2 with shared contracts in `src/tools/schemas/common.ts` and exact `server_config` schemas in `src/tools/schemas/serverConfig.ts`, with TypeScript types inferred from Zod.
- **STEP-078 — Contract tests with dependency injection:** approved T2 to test success, failure, and advertised schema through a pure construction seam, without adding any production failure switch or test backdoor.
- **STEP-079 — Formal design specification:** wrote, self-reviewed, and received user approval for `docs/superpowers/specs/2026-07-12-server-config-output-schema-design.md`.
- **STEP-080 — Implementation plan:** wrote and self-reviewed `docs/superpowers/plans/2026-07-12-server-config-output-schema.md` with four TDD tasks, exact interfaces, commands, review gates, and rollback; execution was approved afterward and completed in STEP-085.
- **STEP-081 — Neat-freak reconciliation:** synchronized active status across `AGENTS.md`, the roadmap, and Memory; added design/plan pointers and removed the implementation plan's fixed future STEP number.
- **STEP-082 — Task 1 exact Schema contracts:** under TDD, added shared metadata/error contracts, the strict `server_config` data and success/failure schemas, and 3 focused contract tests; tests and TypeScript build passed. Real MCP integration remains Task 2.
- **STEP-083 — Task 2 real MCP integration:** advertised the exact `server_config.outputSchema`, returned strict success/failure envelopes through real in-memory MCP calls, measured `durationMs`, added a constructor-only provider seam, and verified redaction plus `isError: true`; 5 tests and Build passed.
- **STEP-084 — Task 3 tool-card data path:** migrated only the `server_config` subtitle and detailed card renderer to nested `data`, retained top-level identity for the generic header, and added a focused compatibility assertion; 6 tests and Build passed.
- **STEP-085 — Complete exact `server_config` output schema:** finished the first Phase 1 vertical slice, migrated all internal consumers to nested `data`, passed 6/6 contract tests, 44/44 full tests, Build, all 8 Smoke sections, audit, package, and 5/5 documentation tests; awaiting final review and Git approval.
- **STEP-086 — Stage reviewed Phase 1 slice:** after explicit approval, staged the complete 14-file planning, implementation, internal-consumer, test, and Memory set; no unstaged changes, commit, or push followed.
- **STEP-087 — Commit exact `server_config` slice:** after explicit approval, created the local commit `feat: add exact server_config output schema`; `main` was one commit ahead of `origin/main`, with no push performed at that step.
- **STEP-088 — Push exact `server_config` slice:** after explicit approval, pushed implementation commit `b989776` to `origin/main` and prepared the publication record.
- **STEP-089 — Neat-freak Phase 1 slice closeout:** verified both implementation and record CI runs passed on Ubuntu/Windows Node 20/24, confirmed local/remote synchronization, removed completed push/CI items, and restored a planning-only boundary for the next tool.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Active Phase 1 planning and implementation — STEP-073 onward](docs/memory/archive/phase-1.md)

Archive integrity for the pre-migration journal:

- Lines: 1089
- Bytes: 45573
- SHA-256: `b297808452af0cd49311e03f4365d0770a115a119e6db3eeb14966fadb3ad477`

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Create the next phase archive only when that phase begins.
- Record between-phase work in `docs/memory/archive/interphase-maintenance.md`.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
