# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-25.
- Package: `codexgpt@0.28.6`; repository: `chatGPT-10/codexgpt`; primary platform: native Windows; WSL remains optional.
- Phases 0–3 are closed. Reduced Phase 4 closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf` with exact-head run `29603060944`; Phase 5 closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e` with run `29698209894`.
- Phase 6 is formally closed at `31631676fe254962a9a4f14d6e025e3edba82b8d`; exact-head run `30033293444` passed Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package. Explicit `legacy` remains rollback and old Apps require one **Scan Tools** refresh or recreation.
- STEP-408 completes the Phase 7 Core local candidate through Gate G7-X. STEP-409 through STEP-415 repair cross-platform identity, V5 capability, and detached-runner races; STEP-415 published as `dbf033dc8e5c38d904b2cc47325244ccce4f533e` and exact-head run `30110614307` passed the complete matrix.
- STEP-416 repairs the live G7-U backend blockers. STEP-417 published dual local-control root routing as `9f8a593e52b5ed57bd6beb4885617dc85e44f6a3`; exact-head run `30144166480` passed Repository policy, Ubuntu Node 20/24, and Windows Node 24, but Windows Node 20 hit the 60-second cold local-control compile bound. STEP-418 raises only that production/diagnostic startup bound to 120 seconds and is locally verified; replacement publication/exact-head CI and actual user-observable ChatGPT App G7-U remain required.
- Omitted mode defaults to `standard` with readiness `ready`; explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the one-restart rollback. Omitted `minimal` mode preserves the exact legacy projection because it has no `codex_context`; explicit `standard + minimal` fails closed.

## Approved execution boundary

Phase 6 closure authority ended with exact-head run `30033293444`. The 2026-07-24 follow-up instruction authorizes completing the remaining Phase 7 Core path: real G7-U where the connected ChatGPT surface is available, staging only the reviewed Phase 7 scope, one concise English commit, ordinary push, and bounded exact-head CI diagnosis/repair cycles. It does not authorize Phase 7B/7C dependencies or installs, npm release, deployment, npm registry credentials, Tasks 4B1–4B6, `workspace`, force push, destructive history, credential migration, Phase 8+, or unrelated scope.

## Active decisions and constraints

- Keep CodexGPT self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization, Host/Origin checks, path enforcement, and secret handling remain local.
- Native Windows is primary. Git Bash remains the temporary Bash backend; PowerShell support is a core requirement. Production and diagnostic local-control cold startup allow 120 seconds; request, process-lifetime, output, ownership, and close bounds remain unchanged.
- Preserve verified Node `v20.20.2` and `v24.15.0` toolchains. This checkout still uses the retained legacy `%LOCALAPPDATA%\CodexPro\toolchains\` root explicitly; migration to the manager's default `CodexGPT` root is outside STEP-379/380 and requires separate approval.
- `scripts/codexgpt-entry.mjs` is the supported public CLI entry. Direct `scripts/codexgpt.mjs` launch is unsupported.
- The ChatGPT Web compatibility flow uses the query token when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret; public startup logs hide it by default and require an explicit local `u`/Create App action to display it. `CODEXGPT_ALLOW_QUERY_TOKEN=0` is for compatible Bearer clients, not manual ChatGPT Web Bearer configuration.
- V1/V2/V3/V4 tool counts remain 28/31/39/51. `full_access` is ambient trusted-code authority, not isolation; `workspace` has no fallback; Gate S and Task 4B0 remain blocked diagnostics.
- Gate X accepts only the four typed local Git operations. Old/new tree derivation and private staging remain inside one reviewed materialized integration bundle; no caller-selected command, remote, credential, force, or config mutation is allowed.
- Detached-run liveness uses exact renewable `worker-lease.json` evidence for `running`/`finalizing`; leases are observational only. Child terminal observers precede metadata I/O, stop requires exact live identity, and crashed workers become stale after lease expiry.
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
- Phase 7 Core is implemented locally behind explicit `standard` Contract V5=52: owned-worker builtin JS/TS, symbol-or-position `semantic`, honest lexical quality labels, and server-owned rename plans applied only through the Policy Kernel/Phase 3 transaction. Approval binds `semanticFactsDigest`; stable identity/path/hash reaches the lock-held second inspection. Operation-union tools publish explicit wire descriptor shapes while retaining strict server parsers; inherited local approval facts bind the actual Tool Contract 3/4/5.
- Every Core workspace semantic read uses canonical same-handle access with `nlink === 1`; cached results revalidate exact source inventory, identity, and SHA-256 before reuse. The builtin worker keeps the 64 MB input, 2 MB response, and 5-second request bounds while using a 448 MB old-generation ceiling proven by repository-scale references plus diagnostics. Live `TRANSACTION_BUSY` defers only redundant recovery and never becomes cached readiness. Serena is Phase 7B; direct LSP is Phase 7C only for a named unmet language need. External same-user Providers have no execution, filesystem, or network isolation guarantee.

## Verification evidence

- Phase 3 closure heads passed runs `29441752493` and `29443158835`; reduced Phase 4 passed `29603060944`; Phase 5 passed `29698209894`.
- Phase 6 implementation, live ChatGPT G6-M/G6-U acceptance, default activation, doctor alignment, compatibility repair, and complete local closure are recorded in STEP-390 through STEP-394 of `docs/memory/archive/phase-6.md`.
- STEP-395 through STEP-400 repair evidence and failed exact-head progression are preserved in `docs/memory/archive/phase-6.md`; STEP-401 and exact closure run `30033293444` are recorded in `docs/memory/archive/phase-6-part-2.md`.
- STEP-408 Gate G7-X passed managed Node 20/24 affected tests, build, ordinary `2026-07-24T07-24-01-829Z-phase7-core-ordinary-final-r2-34f8955d`, protected Smoke `2026-07-24T07-47-39-512Z-phase7-core-smoke-final-b56c3f08`, policy, package, advisory, link, secret, and diff gates.
- STEP-409 through STEP-412 exact-head repairs culminated in `f5c7763dfa36309901f3118b45dc81f2a2a4ee11`; CI run `30083199776` passed Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.
- STEP-413 verified the supported native-Windows standard/builtin V5 entry starts under atomic/enforce and rejects unauthenticated health access with 401.
- STEP-414 published as `6ec5f5ab8ccd03868954e642a557c2a1e55957a6`; exact-head run `30097613996` passed Repository policy, Ubuntu Node 20, and Windows Node 24, but Ubuntu Node 24 lost two fast-child terminal events and Windows Node 20 lost one, each waiting 90 seconds for a result the worker never published.
- STEP-415 registers child terminal observers before persisting `child.json`. RED source-order regression failed before the repair; current and managed Node 20/24 lifecycle suites pass 36/36. Ordinary `2026-07-24T13-52-39-279Z-phase7-worker-observer-ordinary-dcfd2455` passes 1,224/1,226 with 2 established skips per major; protected Smoke `2026-07-24T14-16-31-900Z-phase7-worker-observer-smoke-50bfd1b6` passes all eight domains per major. Published exact-head run `30110614307` subsequently passed Repository policy and Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.
- STEP-416 backend U1/U2 and U3 content drift pass; same-content identity remains deterministic-regression evidence, not real App UI acceptance. STEP-417 exact-head run `30144166480` isolated one Windows Node 20 `CONTROL_READY_TIMEOUT` after 60,061 ms. STEP-418 current and managed build/affected tests pass; ordinary run `2026-07-25T04-54-46-291Z-phase7-step418-final-local-gates-e8ed7c24` passes 1,227/1,229 with 2 established skips per major, and isolated Smoke `2026-07-25T05-24-21-474Z-phase7-step418-smoke-isolated-594818f3` passes all eight domains per major with exit 0 and zero stderr.

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
- Phase 7 Core is not formally closed: the STEP-418 replacement still needs publication/exact-head CI, and no current tool surface can perform or observe the required real ChatGPT App **Scan Tools**/cached-App journeys. Backend and regression evidence does not substitute for actual user-observable U1–U6. Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. `npm audit` has zero high/critical findings but retains two moderate transitive findings in the current MCP SDK compatibility line.

## Open items

1. Publish only the reviewed STEP-418 local-control startup correction and bind its replacement exact head to the complete CI matrix. Then run real ChatGPT Gate G7-U after one **Scan Tools** refresh or App recreation, retain the old 51-tool migration check, and require actual user-observable evidence for U1–U6 before formal closure.
2. Keep Serena/LSP, Tasks 4B1–4B6, `workspace`, Phase 8, release/deployment, and toolchain-root migration deferred; never reinterpret ambient process/worktree/Provider mechanisms as a sandbox.

## Recent summaries

- **STEP-418 - Bound cold local-control startup:** raise only production/diagnostic Windows local-control startup from 60 to 120 seconds after exact-head CI measured a 60,061 ms cold compile.
- **STEP-417 - Preserve dual local-control roots:** keep production approvals/process control on the transaction root while retaining the legacy owned-process fallback without cross-root fail-open behavior.
- **STEP-416 - Repair live V5/App acceptance blockers:** publish usable union schemas, align approvals and root policy facts, size the owned worker for accepted projects, degrade auxiliary Git summaries, and defer recovery only for an exact verified-live lock owner.
- **STEP-415 - Observe worker child completion before metadata I/O:** attach child terminal listeners before the first await so fast exits and output floods always reach authoritative result publication.

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
- [Closed Phase 7 Volume 1 — STEP-399 through STEP-414](docs/memory/archive/phase-7.md)
- [Active Phase 7 Volume 2 — STEP-415 onward](docs/memory/archive/phase-7-part-2.md)

## Memory maintenance protocol

- Edit this index in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. Every meaningful completed step updates this index and appends the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
