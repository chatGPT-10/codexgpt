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
- Phase 1: the first eleven slices are published and cross-platform CI-validated; direct `open_current_workspace` is published as commit `d887849`, with exact-head CI verification pending.

## Approved stopping point

The first eleven Phase 1 slices are published and cross-platform CI-validated. Direct `bash` was published through commit `a39b779`; exact-head CI run `29239425311` passed Ubuntu/Windows with Node 20/24. Direct `open_current_workspace` was published as commit `d887849` after focused 13/13, complete regression 202/202, Build, Smoke 8/8, native-Windows Stress, and `neat-freak` reconciliation. Exact-head CI remains unverified because `gh` is unavailable and the public Actions lookup was inaccessible from the current environment. Phase 2 remains closed.

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
- Published Phase 1 tools through direct `apply_patch` use strict nested schema-v1 envelopes and stable redacted failures; exact field/error contracts remain in the Phase 1 archives and design documents.
- `show_changes` and `search` preserve complete core results when optional analysis is unavailable, using only fixed safe warnings and excluding raw diagnostics.
- `write`, `edit`, and `apply_patch` validate provider identity and normalized returned paths before cache invalidation; raw content, unsafe paths, diagnostics, and secrets stay private.
- Atomic transactions, rollback, undo, fuzzy editing, authentication, dependency changes, workspace lifecycle, and Phase 2/3 remain outside the published Phase 1 slices.
- Phase archives use bounded numbered volumes: after each complete STEP, open the next volume when the active file reaches 80% of the configured direct-read byte limit; earlier volumes remain unchanged.
- The repository has no `npm test` script; the complete regression command is `node --test test/*.test.mjs`.
- Direct `bash` is the locally complete eleventh Phase 1 slice; it stabilizes only the current synchronous Bash protocol and does not introduce PowerShell or process management.
- Bash `ok:true` means a valid process outcome; non-zero exit, signal, truncation, or the current timeout marker remain command-level results rather than tool-level errors.
- Direct `bash` exposes eleven nested success fields and eleven fixed non-retryable tool-level errors; the accidental public camelCase `bashSessionId` is removed.
- The handler validates exact provider command, normalized `cwd`, and configured session identity; Tool Card, supertool, Smoke, and Stress consumers use only the nested contract.
- Direct `bash` is published; credential changes, history rewriting, access expansion, and Phase 2 remain unapproved.
- Direct `open_current_workspace` is the locally complete twelfth Phase 1 slice; `open_workspace`, `workspace_snapshot`, and workspace lifecycle remain outside it.
- Its strict success `data` has twelve fields; absent `agents_path`, `tree`, and skill descriptions normalize to `null`, while recent commits remain human MCP content only.
- Provider workspace/root identity, AGENTS path, skill-name/count, and request-inclusion mismatches fail closed as `INTERNAL_ERROR`.
- Five fixed non-retryable failures cover missing/non-directory/disallowed default roots, workspace-open failure, and internal validation failure; non-Git directories remain successful workspaces.

## Local verification evidence

- Focused direct `open_current_workspace` contracts: 13/13 passed.
- Adjacent `open_current_workspace`/`server_config`/`tree`/`git_status` contracts: 48/48 passed after final documentation reconciliation.
- Complete `node:test` regression suite: 202/202 passed.
- `npm run build`: passed.
- `npm run smoke`: all eight sections passed after one RED/GREEN lowercase-`agents.md` consumer correction.
- `npm run stress`: passed on native Windows, including its internal build.
- `git diff --check`: passed; only established LF-to-CRLF working-copy warnings were emitted.
- Real coverage preserves minimal/standard/full registration, non-Git success, workspace/global skill discovery, symlink-root rejection, Tool Card compatibility, supertool nesting, and lowercase AGENTS discovery.

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
- `open_current_workspace`: implementation and reconciliation commit `d887849` pushed to `origin/main`; exact-head CI verification remains pending because the current environment cannot query GitHub Actions.
- Detailed RED/GREEN evidence, blockers, rollback, and publication records are split across `docs/memory/archive/phase-1.md` (STEP-073–139) and the active `docs/memory/archive/phase-1-part-2.md` (STEP-140 onward).

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Git failure classification remains coupled to current string output from `src/gitOps.ts`.
- Direct `edit` failure classification remains coupled to current `CodexProError` message prefixes and operating-system error codes.
- Direct `apply_patch` input/path classification remains coupled to current internal message prefixes; Git stage classification now uses tool-local typed markers.
- Direct `bash` failure classification remains coupled to current message prefixes and Node error codes; safe Bash is not a sandbox, and timeout does not reliably terminate the complete Windows process tree.
- Direct `open_current_workspace` failure classification remains coupled to current `WorkspaceManager` message prefixes and Node error codes; workspace ownership, expiry, and client isolation remain deferred to Phase 2.
- Review checkpoints remain process-local memory state and are not shared across service restarts.
- Native-Windows Stress skips only the established POSIX-only multi-colon filename fixture and isolates fake-home discovery with both `HOME` and `USERPROFILE`.
- `docs/memory/archive/phase-1.md` exceeds the normal direct read-size limit and is now the unchanged first Phase 1 archive volume covering STEP-073–139.
- `docs/memory/archive/phase-1-part-2.md` is the active bounded continuation from STEP-140 onward; future volumes may open only at complete STEP boundaries without renaming or rewriting earlier volumes.

## Open items

1. Verify exact-head Ubuntu/Windows Node 20/24 CI for the published `open_current_workspace` slice when GitHub Actions access is available.
2. Keep credential/access changes and Phase 2 closed; do not start the next slice until publication state is reconciled.

## Recent summaries

- **STEP-151 — Publish direct `open_current_workspace`:** committed the reconciled slice as `d887849` and pushed `main` to `origin`; exact-head CI remains pending because the current environment lacks `gh` and could not access the public Actions lookup.
- **STEP-150 — Reconcile the twelfth slice:** ran `neat-freak`, audited rule/document references, reduced `Memory.md` from 145 lines/15.5 KB to a thinner index, and aligned all current stopping points with the authorized publication workflow.
- **STEP-149 — Implement and verify direct `open_current_workspace`:** added the exact twelve-field envelope, five fixed failures, strict provider identity/path/skill/count/inclusion checks, nested Tool Card/supertool consumers, and real Smoke/HTTP Smoke/Stress migration; focused 13/13, complete 202/202, Build, Smoke 8/8, and native-Windows Stress passed.
- **STEP-148 — Plan direct `open_current_workspace`:** converted the approved design into a four-task TDD plan covering schema, handler/provider, consumers, verification, rollback, and publication boundaries.
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
