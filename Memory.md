# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-29; current npm release `codexgpt@1.0.4` is published at `48fb3f5334cb286df2af7adf56ddddbbcfc41406` (`latest` and npm `gitHead` verified); its exact-head CI and reviewed runtime replacement are complete. GitHub reconciliation is incomplete: default `main` has `1.0.2` package metadata but `1.0.1` runtime/README state, GitHub Latest Release is `v1.0.1`, and `v1.0.2`–`v1.0.4` tags/Releases are absent. The historical `1.0.2` npm commit failed CI and had mismatched runtime version surfaces, so it may be recorded only as superseded, never as a closed release; repository `chatGPT-10/codexgpt`; native Windows remains primary and WSL optional.
- Phases 0–8 Core are closed. Phase 7 closed at `a0b9f46e2297297959527f7570c9cb7942cc8fb3` / `30171313296`; Phase 8 closed at `55b2b5664aae322ec992968a41c87a289fb75282` / `30274857996`.
- STEP-437–472 completed Phase 8 Core, real G8-U Journeys U2–U7, local G8-X, portability repairs, and exact-head Ubuntu/Windows Node 20/24 CI. U6 retains the deleted-App evidence substitution; U7 preserves the public-loopback/local-admin boundary.
- STEP-473 prepared and locally verified the bounded `1.0.0` package. STEP-474 closed publication: PR 6 merged to `main` at `9131c393da3a1eb3c9514710b0b1569f55dd5acb`, and npm `latest`, annotated tag `v1.0.0`, and the GitHub Release align to that commit.
- STEP-480 published and deployed `1.0.3` for the recurring OAuth refresh disconnect without changing token lifetime or rotation: token limits are 120/client and 240/deployment per 15 minutes, and authenticated local diagnostics distinguish token/client/deployment/public-admission outcomes.
- STEP-481 published and deployed `1.0.4` for explicit user-Skill loading: `$CODEX_DIR/skills` remains its own opt-in canonical root, oversized public descriptions no longer cause `INTERNAL_ERROR`, and non-Skill plugin-cache entries no longer consume the Skill-candidate limit. Focused regressions, managed Node 20/24 build, policy, exact-head CI, npm publication, and OAuth runtime replacement passed.

## Approved execution boundary

The owner explicitly authorized and completed the bounded `1.0.1` launcher correction, the STEP-480 `1.0.3` OAuth refresh repair, and the STEP-481 `1.0.4` user-Skill repair, including publication and reviewed runtime replacement. STEP-476 repaired the OAuth listener collision; STEP-477 authorized consolidation onto `codexgpt.drliang.uk`. Further implementation, deployment changes, credential migration, Task Scheduler/service installation, sandbox/egress, destructive history, Phase 7B/7C installs, Tasks 4B1–4B6, `workspace`, and unrelated scope remain separately gated.

## Active decisions and constraints

- `AGENTS.md` Section 5 and paired phase documents are the detailed rule sources; this index retains only their current operational conclusions.
- CodexGPT remains self-hosted: Cloudflare supplies only DNS/TLS/Tunnel while authentication, Host/Origin, path enforcement, and secrets stay local. Native Windows is primary; Git Bash is temporary, and PowerShell support is required.
- The supported public entry is `scripts/codexgpt-entry.mjs`. Legacy mode retains the secret query-token compatibility App; OAuth mode uses a separate App with a token-free URL and forces query-token acceptance off. Manual static-Bearer setup for ChatGPT Web is not claimed.
- V1/V2/V3/V4/V5 remain exactly 28/31/39/51/52. `full_access` is ambient authority, never isolation; `workspace`, Gate S, and Tasks 4B0–4B6 remain unavailable/deferred.
- Workspace handles are opaque session-local values and stale/foreign handles fail closed. Atomic and semantic mutations retain Policy, lock-held identity/hash, transaction, audit, and mutation-inventory gates; Gate X stays limited to four typed local Git operations.
- Use the retained managed Node `v20.20.2`/`v24.15.0` root `%LOCALAPPDATA%\CodexPro\toolchains\`. `test-domains` is authoritative; ordinary runs are detached, control/all need CI or an independent terminal, and cleanup stops/deletes only exact owned evidence.
- `inheritEnv=false` keeps only bounded Windows paths; arbitrary tokens stay out of children. Runtime-relevant publication requires the exact-head Ubuntu/Windows Node 20/24 matrix and `npm run policy:check` before staging.
- Phase 6 guidance grants no authority. Phase 7 Core is the owned JS/TS semantic provider with same-handle reads, honest fallback, server-owned rename plans, and no sandbox claim; Serena/LSP remain separately authorized extensions.
- Phase 8 design/TDD remains the runtime contract: one colocated OAuth authorization/resource server, strict public-client DCR, PKCE S256, RFC 8707/9207, DPAPI CurrentUser, separated public/local-admin listeners, bounded work, and no new tool/execution authority. Tasks 8A1–8A9, G8-U Journeys U2–U7, local G8-X, and exact-head CI are complete. U6's replacement Legacy App proves current rollback compatibility, not continuity of the deleted original App identity; U7 proves the owned public-loopback Tunnel boundary and fail-early shared/unowned refusal.
- Phase 8 setup is canonical-root, dedicated-Tunnel, candidate-probe-before-commit, credential-free `authRoutes.legacy|oauth`, full-route two-App rollback, and idempotent return to OAuth. Stable binding plus rotating incarnation, fixed-order refresh-family mutations, crash-safe code exchange, and durable installation audit are mandatory.
- After OAuth, prioritize configuration provenance, offline diagnostics, current-user Windows background lifecycle, incremental server/CLI/tool-manifest modularization, then full diagnostics. Native isolation is conditional P2 work after a concrete untrusted-code need and a read-only feasibility go decision.

## Verification evidence

- Phase 3–7 closures and Phase 8 Core/U2–U7/G8-X evidence are archived; Phase 8 exact-head closure is `55b2b5664aae322ec992968a41c87a289fb75282` / `30274857996`. The published `1.0.0` baseline, `1.0.1` launcher correction, and their release evidence are likewise archived.
- STEP-476–478 resolved the listener collision, consolidated the surviving profile at `codexgpt.drliang.uk` with access to `D:\Dev\codexpro`, removed the redundant deployment, and retained only the separately authorized DNS cleanup.
- STEP-479 prevents a truncated oversized ripgrep JSON record from terminating HTTP. STEP-480 passed focused and managed Node 20/24 checks, full ordinary/Smoke, exact-head CI `30361606961`, npm publication, and reviewed `1.0.3` runtime replacement. STEP-481 exact-head CI `30373608845` passed; its active owned `1.0.4` run is `2026-07-28T16-16-24-285Z-codexgpt-step481-user-skill-1-0-4-ba0b359d`.

## Known limitations

- Phase 8 Core through Task 8A9, Gate G8-U Journeys U2–U7, local G8-X, and exact-head CI are implemented and accepted. U6 retains a documented test deviation because the original Legacy App was deleted; replacement-App compatibility and exact OAuth return continuity passed, but same-App Legacy identity continuity is not claimed. U5's security reset correctly made the old OAuth client invalid; no prior client/grant/token authority survived.
- DPAPI production protection is intentionally Windows CurrentUser-only. Loss of that user profile or its DPAPI material requires explicit security-reset recovery; there is no plaintext, memory, or non-Windows production fallback.
- Phase 2A has no user-facing approval issuance surface. Phase 4A local approval is not OS isolation.
- Workspace lifecycle state remains process-local. OAuth installation owner, deployment, grant/family, signing/refresh authority, and client state persist; pending browser authorization/code state remains intentionally process-ephemeral and restart requires a fresh authorization attempt.
- External processes remain outside the workspace lock. Open-handle checks reduce replacement races but do not provide an OS-wide lock or absolute power-loss durability.
- Environment narrowing is defense in depth, not credential isolation; same-user children may access account-readable files and system keyrings.
- Safe Bash timeout does not reliably terminate every Windows descendant process.
- `full_access`, confirmed roots, ConPTY, managed worktrees, and external Providers remain ambient-authority mechanisms, not sandboxes.
- Atomic `apply_patch` supports bounded UTF-8 create/replace/delete only and rejects binary, symlink, rename/copy, and mode changes.
- Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- Cached-App migration requires one explicit **Scan Tools** refresh or recreation; transparent refresh is not claimed. U6 proved this by creating a V4 51-tool App before switching the same endpoint to V5.
- Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. `npm audit` has zero high/critical findings and two moderate transitive findings in the current MCP SDK compatibility line.

## Open items

1. Reconcile the already published `1.0.2`–`1.0.4` source commits onto GitHub `main` with a merge that preserves the exact npm commits as ancestors; do not squash or rebase. Create annotated exact tags and public Releases at the npm `gitHead` values, mark `1.0.2` explicitly superseded with its failed-CI/runtime-version mismatch disclosed, and verify GitHub Latest is `1.0.4`. Project policy forbids moving/deleting an existing release tag; npm publication alone is not full public-release closure.
2. Delete the remaining Cloudflare DNS record `codexpro-oauth.drliang.uk`; its runtime, Tunnel, profile, setup journal, and tunnel credential are already gone. The single active service is `codexgpt.drliang.uk` on `8789/8790`, managed by detached run `2026-07-28T16-16-24-285Z-codexgpt-step481-user-skill-1-0-4-ba0b359d`, with `D:\Dev\codexpro` explicitly allowed for workspace switching. A reviewed current-user Windows background lifecycle, native isolation, Serena/LSP, Tasks 4B1–4B6, credential migration, and toolchain-root migration remain separately gated.
3. Use the published `1.0.4` ChatGPT App normally for at least 20 minutes. The repaired user Skill can be invoked by exact `$CODEX_DIR/skills/neat-freak/SKILL.md` selector or by `neat-freak`; this behavior-only patch does not itself require Scan Tools. If a disconnect recurs, inspect authenticated local diagnostics for `token_client_limit`, `token_deployment_limit`, or `public_admission_limit` before changing any ceiling.

## Recent summaries

- **STEP-483 — Public-release alignment audit:** npm `latest` and per-version `gitHead` values are correct through `1.0.4`, but GitHub `main` and public tag/Release objects stop earlier; update the authority docs and require source/tag/Release alignment before calling future npm publications complete.
- **STEP-481 — `1.0.4` User Skill loader release:** preserve the isolated global-Skill boundary while making exact and name-based user Skill loading resilient to long frontmatter descriptions and noisy plugin caches; exact-head CI, npm publication, and the replacement OAuth runtime are complete.
- **STEP-482 — User-Skill documentation reconciliation:** document the bounded explicit `source: "user"` loading path in the bilingual README/FAQ, correct the unnecessary Scan Tools suggestion for a behavior-only patch, and retain the outstanding 20-minute OAuth acceptance check.
- **STEP-480 — `1.0.3` OAuth refresh-limit release:** raise the measured-safe client/deployment token ceilings to `120/240` per 15 minutes, retain rotating refresh/replay semantics, and expose bounded credential-free counters only to an authenticated loopback admin session. Exact-head CI, npm publication, and reviewed runtime replacement are complete; real 20-minute ChatGPT acceptance remains pending.
- **STEP-477 — Single-domain consolidation:** restart `codexgpt.drliang.uk` with explicit access to `D:\Dev\codexpro`, verify real workspace switching, stop and remove the redundant runtime/Tunnel/profile, and isolate the remaining DNS-record deletion.
- **STEP-478 — Stale runtime cleanup:** remove the retired `D:\Dev\codexpro` runtime record only; preserve the shared Tunnel configuration used by the active primary service and revalidate the complete OAuth path.

## Archives

- [Closed Phase 0 and Phase 0.5 — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Closed interphase maintenance Part 2 — STEP-363 through STEP-367](docs/memory/archive/interphase-maintenance-part-2.md)
- [Closed interphase maintenance Part 3 — STEP-368 through STEP-375](docs/memory/archive/interphase-maintenance-part-3.md)
- [Closed interphase maintenance Part 4 — STEP-376 through STEP-384](docs/memory/archive/interphase-maintenance-part-4.md)
- [Closed interphase maintenance Part 5 — STEP-385 through STEP-435](docs/memory/archive/interphase-maintenance-part-5.md)
- [Closed interphase maintenance Part 6 — STEP-436 and STEP-475–482](docs/memory/archive/interphase-maintenance-part-6.md)
- [Interphase maintenance Part 7 — STEP-483](docs/memory/archive/interphase-maintenance-part-7.md)
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
- [Closed Phase 7 Volume 3 — STEP-426 through STEP-433](docs/memory/archive/phase-7-part-3.md)
- [Closed Phase 8 Volume 1 — STEP-437 through STEP-446](docs/memory/archive/phase-8.md)
- [Closed Phase 8 Volume 2 — STEP-447 through STEP-451](docs/memory/archive/phase-8-part-2.md)
- [Closed Phase 8 Volume 3 — STEP-452 through STEP-460](docs/memory/archive/phase-8-part-3.md)
- [Closed Phase 8 Volume 4 — STEP-461 through STEP-469](docs/memory/archive/phase-8-part-4.md)
- [Closed Phase 8 Volume 5 — STEP-470 through STEP-474](docs/memory/archive/phase-8-part-5.md)

## Memory maintenance protocol

- Keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. At or above 48 KB (80% of the 60 KB direct-read limit), close the volume and start the next numbered continuation.
- `AGENTS.md` is authoritative for the complete protocol.
