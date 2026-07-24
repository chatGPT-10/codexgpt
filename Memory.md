# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-24.
- Package: `codexgpt@0.28.6`; repository: `chatGPT-10/codexgpt`; primary platform: native Windows; WSL remains optional.
- Phases 0–3 are closed. Reduced Phase 4 closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf` with exact-head run `29603060944`; Phase 5 closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e` with run `29698209894`.
- Phase 6 is formally closed at `31631676fe254962a9a4f14d6e025e3edba82b8d`; exact-head run `30033293444` passed Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package. Explicit `legacy` remains rollback and old Apps require one **Scan Tools** refresh or recreation.
- STEP-400 repaired the two Windows test observers and passed local ordinary, Build, and Smoke on managed Node 20/24. STEP-401 records the exact published closure without creating an evidence-only repository commit.
- STEP-408 completes the Phase 7 Core local candidate through Gate G7-X. STEP-409 through STEP-412 repair cross-platform identity and detached-runner races. STEP-413 forwards V5 production capabilities; STEP-414 makes both production and low-level V5 capability checks fail closed and adds permanent regressions. Formal closure still requires the repair exact-head matrix plus real ChatGPT G7-U.
- Omitted mode defaults to `standard` with readiness `ready`; explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the one-restart rollback. Omitted `minimal` mode preserves the exact legacy projection because it has no `codex_context`; explicit `standard + minimal` fails closed.

## Approved execution boundary

Phase 6 closure authority ended with exact-head run `30033293444`. The 2026-07-24 follow-up instruction authorizes completing the remaining Phase 7 Core path: real G7-U where the connected ChatGPT surface is available, staging only the reviewed Phase 7 scope, one concise English commit, ordinary push, and bounded exact-head CI diagnosis/repair cycles. It does not authorize Phase 7B/7C dependencies or installs, npm release, deployment, npm registry credentials, Tasks 4B1–4B6, `workspace`, force push, destructive history, credential migration, Phase 8+, or unrelated scope.

## Active decisions and constraints

- Keep CodexGPT self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization, Host/Origin checks, path enforcement, and secret handling remain local.
- Native Windows is primary. Git Bash remains the temporary Bash backend; PowerShell support is a core requirement.
- Preserve verified Node `v20.20.2` and `v24.15.0` toolchains. This checkout still uses the retained legacy `%LOCALAPPDATA%\CodexPro\toolchains\` root explicitly; migration to the manager's default `CodexGPT` root is outside STEP-379/380 and requires separate approval.
- `scripts/codexgpt-entry.mjs` is the supported public CLI entry. Direct `scripts/codexgpt.mjs` launch is unsupported.
- The ChatGPT Web compatibility flow uses the query token when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; public startup logs hide it by default and require an explicit local `u`/Create App action to display it. `CODEXGPT_ALLOW_QUERY_TOKEN=0` is for compatible Bearer clients, not manual ChatGPT Web Bearer configuration.
- V1/V2/V3/V4 tool counts remain 28/31/39/51. `full_access` is ambient trusted-code authority, not isolation; `workspace` has no fallback; Gate S and Task 4B0 remain blocked diagnostics.
- Gate X accepts only the four typed local Git operations. Old/new tree derivation and private staging remain inside one reviewed materialized integration bundle; no caller-selected command, remote, credential, force, or config mutation is allowed.
- Detached-run liveness is represented by exact renewable `worker-lease.json` evidence for `running` and `finalizing`. Every lease publication, including the first, is observational and cannot suppress task execution or authoritative result publication. The renewal timer remains referenced so it keeps the worker alive until `result.json` is published, then `stopLeaseRenewal()` clears it. A lease is non-authorizing: stop still requires exact live process identity, and a crashed worker becomes stale after lease expiry. Lease persistence is synchronous and atomic; synchronous and asynchronous atomic JSON replacement share one bounded retry policy for transient Windows replacement-sharing failures. A failed periodic lease publication retries after one second instead of waiting a full 15-second renewal interval.
- `scripts/test-domains.mjs` is authoritative. Connector-backed local regression uses `ordinary`; destructive control/all execution requires CI or a proven independent native terminal. There is no `npm test` script.
- Focused tests and tasks use `npm run test:focused -- <files...>` and `npm run task:run -- <command...>`. Cleanup deletes only exact verified dead-owner temporary roots and terminal run evidence.
- Mutation inventory is fail-closed and binds direct filesystem primitives to repository path, syscall type, and semantic call identity. Atomic production paths cannot fall back to legacy writers.
- With `inheritEnv=false`, Windows child environments preserve only bounded required user/system paths; do not copy `GH_TOKEN` or arbitrary API variables. `CODEXGPT_INHERIT_ENV=1` is trusted-repository opt-in.
- `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain protected; compatibility loaders use exact fail-closed in-memory substitutions.
- Runtime-relevant pushed SHAs require the complete exact-head matrix. Documentation-only changes require repository policy and document integrity checks.
- Phase 6 is usability-first: workspace open must return real root AGENTS text, standard `codex_context(target_path)` must return target guidance plus target Skill metadata, and bodies/resources stay lazy.
- Phase 6 adds no Tool Contract V5, generic Hooks, automatic Skill scripts/dependencies, custom trust/hash/permission manifest, or guidance-derived authority. Standard user/plugin Skills remain explicit opt-in.
- Every Phase 6 AGENTS/Skill/resource read must use one canonical same-handle bounded reader; automatic Skill catalogs default to an 8,000-character total budget.
- Omitted `CODEXGPT_GUIDANCE_MODE` now selects `standard` with readiness `ready`; explicit `legacy` preserves the exact prior V1/V2/V3/V4 projections as a one-restart rollback. In ChatGPT Web/App, subsequent default-workspace calls omit `workspace_id` because opaque handles are transport-session scoped and cross-session reuse must fail closed. Apps with frozen pre-Phase-6 tool snapshots require one **Scan Tools** refresh or recreation; transparent refresh is not claimed. `yaml@2.9.0` is the only new production dependency and has no transitive dependencies or lifecycle scripts.
- Phase 7 Core is implemented locally behind explicit `standard` Contract V5=52: owned-worker builtin JS/TS, symbol-or-position `semantic`, honest lexical quality labels, and server-owned rename plans applied only through the Policy Kernel/Phase 3 transaction. Approval binds `semanticFactsDigest`; stable identity/path/hash reaches the lock-held second inspection.
- Every Core workspace semantic read uses canonical same-handle access with `nlink === 1`; cached results revalidate exact source inventory, identity, and SHA-256 before reuse. Serena is Phase 7B; direct LSP is Phase 7C only for a named unmet language need. External same-user Providers have no execution, filesystem, or network isolation guarantee.

## Verification evidence

- Phase 3 closure heads passed runs `29441752493` and `29443158835`; reduced Phase 4 passed `29603060944`; Phase 5 passed `29698209894`.
- Gate X follow-up head passed exact-head run `29780813295`; the post-Phase-5 runtime base `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c` passed run `29925944942`.
- Phase 6 implementation, live ChatGPT G6-M/G6-U acceptance, default activation, doctor alignment, compatibility repair, and complete local closure are recorded in STEP-390 through STEP-394 of `docs/memory/archive/phase-6.md`.
- STEP-395 through STEP-400 repair evidence and failed exact-head progression are preserved in `docs/memory/archive/phase-6.md`; STEP-401 and exact closure run `30033293444` are recorded in `docs/memory/archive/phase-6-part-2.md`.
- STEP-408 Gate G7-X passed managed Node 20/24 affected tests, build, ordinary `2026-07-24T07-24-01-829Z-phase7-core-ordinary-final-r2-34f8955d`, protected Smoke `2026-07-24T07-47-39-512Z-phase7-core-smoke-final-b56c3f08`, policy, package, advisory, link, secret, and diff gates.
- STEP-409 through STEP-412 exact-head repairs culminated in `f5c7763dfa36309901f3118b45dc81f2a2a4ee11`; CI run `30083199776` passed Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.
- STEP-413 verified the supported native-Windows standard/builtin V5 entry starts under atomic/enforce and rejects unauthenticated health access with 401.
- STEP-414 RED/GREEN production and low-level V5 regressions pass 18/18 locally; managed Node 20/24 Phase 7 plus production suites pass 59/59 per major and build passes. Ordinary `2026-07-24T12-55-54-670Z-phase7-v5-preflight-ordinary-fc9b4b4a` passes 1,223/1,225 with 2 established skips per major; protected Smoke `2026-07-24T13-21-27-766Z-phase7-v5-preflight-smoke-6759399b` passes all eight domains per major.

## Known limitations

- Phase 2A has no user-facing approval issuance surface. Phase 4A local approval is not OS isolation.
- Workspace lifecycle state is process-local; OAuth owner identity and lifecycle persistence remain out of scope.
- External processes remain outside CodexGPT's workspace lock. Open-handle checks reduce path-replacement races but do not create an OS-wide lock or absolute power-loss durability.
- Environment narrowing is defense in depth, not credential isolation; same-user children may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- `full_access`, confirmed roots, and ConPTY remain ambient-authority features; only owned Job members are lifecycle-controlled.
- Atomic `apply_patch` supports bounded UTF-8 create/replace/delete only and fails closed for binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- `docs/memory/archive/phase-1.md` exceeds normal direct-read size and remains an unchanged closed archive volume.
- The deleted pre-Phase-6 App made a genuine frozen-tool-snapshot reuse test impossible. The approved product contract is one explicit **Scan Tools** refresh or App recreation; transparent cache refresh is not claimed.
- Phase 7 Core is not formally closed: the STEP-414 repair still needs publication/exact-head CI and real ChatGPT G7-U. Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. `npm audit` has zero high/critical findings but retains two moderate transitive findings in the current MCP SDK compatibility line.

## Open items

1. Publish only the reviewed STEP-413/414 Phase 7 repair scope and bind its exact head to the complete CI matrix. Run real ChatGPT Gate G7-U after one **Scan Tools** refresh or App recreation; retain the old 51-tool migration check and do not mark formal closure without both gates.
2. Keep Serena/LSP, Tasks 4B1–4B6, `workspace`, Phase 8, release/deployment, and toolchain-root migration deferred; never reinterpret ambient process/worktree/Provider mechanisms as a sandbox.

## Recent summaries

- **STEP-414 - Bind V5 capability checks end to end:** derive semantic availability from exact standard/builtin configuration in both production composition and the low-level server, with RED/GREEN regressions for enabled and disabled Providers.
- **STEP-413 - Forward V5 production capabilities:** pass builtin semantic-runtime readiness and the completed V5 migration gate into the production preflight.
- **STEP-412 - Defer pruning live terminal workers:** retain terminal evidence until exact worker identity is gone.
- **STEP-411 - Fail closed before unsafe lease replacement:** reject non-ordinary or linked lease targets before replacement retries.
- **STEP-410 - Isolate detached-runner lifecycle tests:** serialize only process-owning non-Windows lifecycle files.
- **STEP-409 - Bind parent directory object generation:** include creation generation in lock-held parent identity.
- **STEP-408 - Complete Phase 7 Core local G7-X:** finish builtin semantic navigation, safe rename, security boundaries, documentation, and local closure gates.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Closed interphase maintenance Part 2 — STEP-363 through STEP-367](docs/memory/archive/interphase-maintenance-part-2.md)
- [Closed interphase maintenance Part 3 — STEP-368 through STEP-375](docs/memory/archive/interphase-maintenance-part-3.md)
- [Closed interphase maintenance Part 4 — STEP-376 through STEP-384](docs/memory/archive/interphase-maintenance-part-4.md)
- [Active interphase maintenance Part 5 — STEP-385 onward](docs/memory/archive/interphase-maintenance-part-5.md)
- [Phase 1 Volume 1 — STEP-073 through STEP-139](docs/memory/archive/phase-1.md)
- [Closed Phase 1 Volume 2 — STEP-140 through STEP-151](docs/memory/archive/phase-1-part-2.md)
- [Closed Phase 1 Volume 3 — STEP-152 through STEP-165](docs/memory/archive/phase-1-part-3.md)
- [Closed Phase 1 Volume 4 — STEP-166 through STEP-179](docs/memory/archive/phase-1-part-4.md)
- [Closed Phase 1 Volume 5 — STEP-180 through STEP-193](docs/memory/archive/phase-1-part-5.md)
- [Closed Phase 1 Volume 6 — STEP-194 through STEP-205](docs/memory/archive/phase-1-part-6.md)
- [Closed Phase 1 Volume 7 — STEP-206 through STEP-219](docs/memory/archive/phase-1-part-7.md)
- [Closed Phase 1 Volume 8 — STEP-220 through STEP-236](docs/memory/archive/phase-1-part-8.md)
- [Closed Phase 1 Volume 9 — STEP-237 through STEP-247](docs/memory/archive/phase-1-part-9.md)
- [Policy Kernel Gate — STEP-248 through STEP-253](docs/memory/archive/policy-kernel-gate.md)
- [Closed Phase 2B Workspace Lifecycle — STEP-254 through STEP-262](docs/memory/archive/phase-2b-workspace-lifecycle.md)
- [Closed Phase 3 Volume 1 — STEP-263 through STEP-277](docs/memory/archive/phase-3.md)
- [Closed Phase 3 Volume 2 — STEP-278 through STEP-285](docs/memory/archive/phase-3-part-2.md)
- [Closed Phase 3 Volume 3 — STEP-286 through STEP-291](docs/memory/archive/phase-3-part-3.md)
- [Closed Phase 3 Volume 4 — STEP-292 through STEP-306](docs/memory/archive/phase-3-part-4.md)
- [Post-Phase 3 operational hardening — STEP-307 through STEP-308](docs/memory/archive/post-phase-3-operational-hardening.md)
- [Closed Phase 4 Volume 1 — STEP-309 through STEP-318](docs/memory/archive/phase-4.md)
- [Closed Phase 4 Volume 2 — STEP-319 through STEP-325](docs/memory/archive/phase-4-part-2.md)
- [Closed Phase 4 Volume 3 — STEP-326 through STEP-343](docs/memory/archive/phase-4-part-3.md)
- [Closed Phase 5 Volume 1 — STEP-344 through STEP-355](docs/memory/archive/phase-5.md)
- [Closed Phase 5 Volume 2 — STEP-356 through STEP-362](docs/memory/archive/phase-5-part-2.md)
- [Closed Phase 6 Volume 1 — STEP-386 through STEP-400](docs/memory/archive/phase-6.md)
- [Closed Phase 6 Volume 2 — STEP-401](docs/memory/archive/phase-6-part-2.md)
- [Active Phase 7 design and Core implementation — STEP-399 onward](docs/memory/archive/phase-7.md)

## Memory maintenance protocol

- Edit this index in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. Every meaningful completed step updates this index and appends the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
