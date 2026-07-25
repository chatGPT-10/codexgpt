# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-25.
- Package: `codexgpt@0.28.6`; repository: `chatGPT-10/codexgpt`; primary platform: native Windows; WSL remains optional.
- Phases 0–3 are closed. Reduced Phase 4 closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf` with run `29603060944`; Phase 5 closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e` with run `29698209894`; Phase 6 closed at `31631676fe254962a9a4f14d6e025e3edba82b8d` with run `30033293444`.
- Phase 7 Core code/backend gates reached STEP-419 at `76cdd18b478679a5c298521c15e1760e093fe0aa`; exact-head run `30149210849` passed Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.
- STEP-420 through STEP-423 repaired the live ChatGPT V5 path. Real App U2–U6 are accepted through STEP-430. Final local G7-X passed at STEP-432; reviewed publication and replacement exact-head CI remain pending.
- Omitted guidance mode defaults to `standard`; explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the one-restart rollback. Frozen pre-Phase-6 Apps require one **Scan Tools** refresh or recreation.

## Approved execution boundary

The 2026-07-24 follow-up authorizes only the remaining Phase 7 Core closure path: final local G7-X, staging the reviewed Phase 7 scope, one concise English commit, ordinary push, and bounded exact-head CI diagnosis/repair. It does not authorize Phase 7B/7C installs, Phase 8 implementation, release/deployment, credential migration, force push, destructive history, Tasks 4B1–4B6, `workspace`, or unrelated scope.

## Active decisions and constraints

- Keep CodexGPT self-hosted. Cloudflare is limited to DNS, TLS, and Tunnel; authorization, Host/Origin checks, path enforcement, and secret handling remain local.
- Native Windows is primary. Git Bash remains the temporary Bash backend; PowerShell support is required. Production and diagnostic local-control cold startup allow 120 seconds.
- Preserve managed Node `v20.20.2` and `v24.15.0` under the retained `%LOCALAPPDATA%\CodexPro\toolchains\` root; toolchain-root migration requires separate approval.
- `scripts/codexgpt-entry.mjs` is the supported public CLI. Direct `scripts/codexgpt.mjs` launch is unsupported.
- The ChatGPT Web compatibility flow uses the query token when `CODEXGPT_ALLOW_QUERY_TOKEN` is unset. Treat the complete Server URL as a secret. `CODEXGPT_ALLOW_QUERY_TOKEN=0` is for compatible Bearer clients, not manual ChatGPT Web Bearer setup.
- V1/V2/V3/V4 remain exact 28/31/39/51 tools. Explicit-standard V5 is 52. `full_access` is ambient authority, not isolation; `workspace`, Gate S, and Task 4B0 remain unavailable/deferred.
- Public workspace IDs are random session-local handles. Foreign, stale, expired, closed, policy-stale, or transport-stale handles fail closed. Only the bounded V5 default-root semantic apply/undo paths have reconnect-stable authority.
- Gate X exposes only four typed local Git operations inside its reviewed private GitDir/index/object quarantine. No caller-selected Git command, remote, credential, force, or config mutation is allowed.
- Atomic mutations must pass the Policy Kernel and Phase 3 transaction path. Stable path, parent identity, file identity, and SHA-256 preconditions reach the lock-held second inspection. Direct semantic writers are forbidden.
- Mutation inventory is fail-closed and binds direct filesystem primitives to repository path, syscall type, and semantic call identity. Atomic production paths cannot fall back to legacy writers.
- `scripts/test-domains.mjs` is authoritative. Use detached `ordinary`; run `control`/`all` only in CI or a proven independent native terminal. Stop only an exact owned run ID.
- Focused tests and local tasks use `npm run test:focused -- <files...>` and `npm run task:run -- <command...>`. Cleanup may delete only verified owned temporary roots and terminal run evidence.
- Detached-run liveness uses renewable `worker-lease.json` evidence. Leases are observational only; terminal observers precede metadata I/O; crashed workers become stale only after lease expiry.
- With `inheritEnv=false`, preserve only bounded required Windows paths. Do not copy `GH_TOKEN` or arbitrary API variables. `CODEXGPT_INHERIT_ENV=1` is trusted-repository opt-in.
- Phase 6 guidance/Skills add no authority. AGENTS/Skill/resource reads use one canonical same-handle bounded reader; automatic Skill metadata has an 8,000-character total budget; bodies/resources stay lazy.
- Phase 7 Core uses the builtin owned-worker JS/TS provider, symbol-or-position semantic lookup, honest lexical quality, and server-owned rename plans. Semantic preview adoption binds canonical-root authority, identity, policy revision, immutable manifest, provider facts, and TTL.
- Core semantic reads require canonical same-handle access with `nlink === 1`; cached results revalidate source inventory, identity, and SHA-256. Successful provider responses revalidate the exact workspace snapshots sent to the worker before publishing results. Worker bounds remain 64 MB input, 2 MB output, 5-second request, and 448 MB old-generation heap. HTTP transports share only authority-bound worker health/cooldown state; workers, workspace handles, project caches, and cancellation remain transport-local.
- Serena is Phase 7B; direct LSP is Phase 7C only for a named unmet language need. External same-user Providers have no execution, filesystem, or network isolation guarantee.
- Runtime-relevant pushed SHAs require the complete exact-head matrix. `npm run policy:check` is required before staging and in every CI path.

## Verification evidence

- Published closure runs: Phase 3 `29441752493`/`29443158835`; Phase 4 `29603060944`; Phase 5 `29698209894`; Phase 6 `30033293444`; Phase 7 STEP-415 `30110614307`; STEP-419 `30149210849`.
- STEP-420 through STEP-423 passed their affected build/regression/policy/diff/ordinary gates; named-tunnel run `2026-07-25T13-58-50-191Z-phase7-u2-named-tunnel-r6-85202e85` provided the live G7-U environment.
- STEP-424 real App U2 applied one 3-file/5-edit rename, rejected exact replay with `SEMANTIC_PREVIEW_STALE`, consumed reconnect-stable R2 apply/undo grants, produced exact forward/reverse change-set lineage, restored the original bytes, and passed fixture build/test.
- STEP-425 real App U3 proved both independent content drift and an NTFS same-content distinct-object replacement return `FILE_VERSION_CONFLICT` for `src/use.mjs` after exact R2 approval, with no new approval, change set, partial mutation, or symbol drift. Grants are consumed and fixture build/test pass.
- STEP-427 real App U4 produced two `WORKER_UNAVAILABLE` results followed by `WORKER_COOLDOWN` with `retry_after_ms: 30000`; a rotated `server_config` reported the same cooldown with a decreasing retry value, while ordinary search/read remained available. Unsupported `.py` lookup reported `fallback`, `builtin-lexical`, `lexical`, and `language: python` rather than TypeScript certainty. The queried fixture symbol was absent, so an empty lexical location set was correct.
- STEP-428 real App U5 rejected controlled outside, blocked, linked, and replaced provider paths with bounded errors; no hostile path, environment-file content, or fixture marker was disclosed, and only four semantic calls occurred. The required terminal-persistence path returned each original tool error, which is possible only after the matching failed execution event is committed; a persistence failure would have been replaced by `AUDIT_UNAVAILABLE`.
- STEP-430 real App U6 recreated an actual V4 51-tool App, switched the same public endpoint to V5, displayed the required **Scan Tools**/recreate action without claiming transparent refresh, and completed one Scan Tools refresh. The refreshed App exposed `semantic`, returned a successful 29-Skill/2-MCP inventory, resolved `startWorkerLeaseRenewal` through definition, references/read, and diagnostics, and returned 22 `main` candidates with `NEEDS_DISAMBIGUATION`, no preview, and no mutation. Two live defects were repaired: overlong Skill summaries no longer collapse inventory, and partial repositories disambiguate before rename completeness gating.
- STEP-432 final local G7-X passed managed Node 20/24 build, authoritative ordinary, protected Smoke, package, policy, diff, link, secret, dependency/license, and scope gates. Ordinary passed 1,246/1,248 with two established skips on each major; both Smoke runs passed all eight domains. A Node 20 `tsx` repeated-import CPU spin in `policy-transport.test.mjs` was repaired by loading policy leaf modules before `server.ts`, then frozen by 7/7 focused results on both majors.

## Known limitations

- Phase 2A has no user-facing approval issuance surface. Phase 4A local approval is not OS isolation.
- Workspace lifecycle state is process-local; OAuth owner identity and lifecycle persistence remain Phase 8 work.
- External processes remain outside the workspace lock. Open-handle checks reduce replacement races but do not provide an OS-wide lock or absolute power-loss durability.
- Environment narrowing is defense in depth, not credential isolation; same-user children may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- `full_access`, confirmed roots, ConPTY, managed worktrees, and external Providers remain ambient-authority mechanisms, not sandboxes.
- Atomic `apply_patch` supports bounded UTF-8 create/replace/delete only and rejects binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- Cached-App migration requires one explicit **Scan Tools** refresh or recreation; transparent refresh is not claimed. U6 proved this by creating a V4 51-tool App before switching the same endpoint to V5.
- Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. `npm audit` has zero high/critical findings and two moderate transitive findings in the current MCP SDK compatibility line.
- Ordinary non-semantic `apply_patch` observed `POLICY_CONFIG_INVALID / policy-unavailable` across ChatGPT HTTP tool rotation during U3 fixture preparation. It made no mutation and is not part of the reconnect-stable semantic contract.

## Open items

1. Publish only the reviewed Phase 7 repair scope and bind the replacement exact head to terminal Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package success.
2. Keep Serena/LSP, Tasks 4B1–4B6, `workspace`, Phase 8, release/deployment, credential migration, and toolchain-root migration deferred.

## Recent summaries

- **STEP-432 — Pass final local G7-X:** managed Node 20/24 build, 1,246/1,248 ordinary, eight-domain Smoke, package, integrity, dependency/license, and exact-scope gates pass after repairing a Node 20 test-import CPU spin.
- **STEP-431 — Reconcile after U6:** synchronize active rules, roadmap, master plan, changelog, and memory with accepted G7-U and the remaining final G7-X/publication/exact-head sequence.
- **STEP-430 — Accept real App U6:** one explicit Scan Tools migration upgrades a recreated V4 51-tool App to V5 and completes the full U1 semantic journey after repairing inventory and partial-project disambiguation regressions.
- **STEP-428 — Accept real App U5:** hostile provider paths and analysis-time replacement fail closed, disclose no sensitive data, and gain no writer, shell, or tool-selection authority.
- **STEP-427 — Accept real App U4:** worker crashes survive HTTP transport rotation into one authority-bound cooldown; ordinary tools remain available and unsupported Python lookup is honestly lexical.
- **STEP-425 — Accept real App U3:** content drift and same-content NTFS object replacement both fail closed at lock-held inspection with no mutation.

## Archives

- [Closed Phase 0 and Phase 0.5 — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
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
- [Closed Phase 7 Volume 2 — STEP-415 through STEP-425](docs/memory/archive/phase-7-part-2.md)
- [Active Phase 7 Volume 3 — STEP-426 onward](docs/memory/archive/phase-7-part-3.md)

## Memory maintenance protocol

- Keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. At or above 48 KB (80% of the 60 KB direct-read limit), close the volume and start the next numbered continuation.
- `AGENTS.md` is authoritative for the complete protocol.
