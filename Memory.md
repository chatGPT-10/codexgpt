# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-14.
- Workspace: `D:\Dev\codexpro`.
- Branch: `main`.
- Package: `codexpro@0.28.6`.
- GitHub repository: `chatGPT-10/codexgpt`.
- Local `origin` fetch and push URLs use `https://github.com/chatGPT-10/codexgpt.git`.
- Primary platform: native Windows.
- Phase 0: complete.
- Phase 0.5: formally closed on 2026-07-12.
- Phase 1: the first sixteen slices are published; direct `inspect_workspace` implementation `4cea9bd` and publication record `1f39996` passed exact-head CI runs `29272546666` and `29273060702` on Ubuntu/Windows Node 20/24.
- Authoritative route: finish and jointly publish all Phase 1 advertised-tool schemas, pass the design-only Policy Kernel gate, then continuously implement Phase 2A–Phase 5 under the 2026-07-13 conditional authorization without another phase-entry approval pause.
- Slices 17 `codexpro_inventory` through 28 `codexpro`: all implementation, focused/adjacent/complete regression, Build, eight-section Smoke, native-Windows Stress, package, static, and per-tool reconciliation gates pass locally. Phase 1 is locally complete; the twelve-slice batch remains unstaged, uncommitted, unpushed, and unpublished until the unified publication action.

## Approved stopping point

Direct `inspect_workspace` remains the published stopping head. Slices 17–28 are locally complete, reconciled, and unpublished; Phase 1 implementation is locally complete. The next authorized action is the unified stage/commit/push/exact-head-CI publication run for the twelve-slice batch. Policy Kernel work remains design-only until that publication; Phase 2–5 production behavior remains closed until the design gate passes, then proceeds continuously under the recorded authorization. Phase 6–9 remain closed.

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
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md` is the active architecture and sequencing authority; the 2026-07-11 audit/roadmap is historical.
- Tool visibility, effective policy, approval, and OS sandbox are separate layers; approval cannot override hard denies, allowed roots, identity scopes, or Permission Profile ceilings.
- File organization is a Phase 3 atomic-transaction capability: `move_paths` V1 stays inside one workspace/volume, forbids overwrite, preflights the whole batch, verifies source hashes, and rolls back partial execution; it is not added to Phase 1.
- Initial `meta` is exactly `schemaVersion`, `durationMs`, and `warnings`; `requestId` remains deferred until trustworthy transport-aware identity exists.
- Slice 17–28 use one end-of-goal publication batch; no intermediate staging, commit, push, or exact-head CI, and every completed tool is followed by `neat-freak` reconciliation.
- Stable errors use `code`, `message`, `retryable`, and `details`; raw exceptions, stack traces, unsafe paths, and secrets are excluded.
- Schema ownership remains split between `src/tools/schemas/common.ts` and one exact tool schema module per migrated tool.
- Contract tests use pure constructors and test-only dependency injection; no production test mode or hidden MCP argument is allowed.
- Published Phase 1 direct tools through `inspect_workspace`, plus locally complete Slices 17–28, use strict nested schema-v1 envelopes and stable redacted failures; exact contracts remain in the Phase 1 archives and paired design/plan documents.
- Slice 25 keeps `codex_sessions` configuration-gated across tool modes and adopts a metadata-only eighteen-field index contract with deterministic UUID-safe records, ordinal bounded discovery, visible scan/result truncation, control-safe one-line metadata/query fields, and no change to `read_codex_session` until Slice 26.
- Slice 26 keeps transcript reads configuration-gated and adopts canonical id/path selectors, honest incomplete-index resolution, a handle-bounded 20 MB source snapshot, redaction before UTF-8 capping, one safe partial final message, exact truncation causes, and eight stable redacted failures.
- Slice 26 additionally requires Date-renderable message timestamps, the fixed marker on partial messages, matching session identities observed inside the opened snapshot, and rejection before generic redaction can rewrite any Provider identity fact.
- Slice 27 treats self-test check failures as successful diagnostic results, derives twelve fixed checks from validated structured Provider facts, gives skipped probes their own outcome, compares independently observed expected/registered tool sets, locks status/reason/truncation semantics, migrates only the recognized legacy scaffold, and restricts write probing to `.ai-bridge/codexpro-self-test.md`.
- Slice 28 gives `codexpro` one closed exact contract over 27 canonical child tools and eight fixed aliases. `list_actions` and dispatch use the live enabled registration map; the wrapper validates input, invokes the registered target handler directly, validates its exact output, and preserves child `content`/`isError`/envelopes. Aliases cannot widen availability, wrapper failures are fixed/redacted, and the supertool-free connection-test surface is a safe no-op.
- `show_changes` and `search` preserve complete core results when optional analysis is unavailable, using only fixed safe warnings and excluding raw diagnostics.
- `write`, `edit`, and `apply_patch` validate provider identity and normalized returned paths before cache invalidation; raw content, unsafe paths, diagnostics, and secrets stay private.
- Atomic transactions, rollback, undo, fuzzy editing, authentication, dependency changes, workspace lifecycle, and Phase 2/3 remain outside the published Phase 1 slices.
- Phase archives use bounded numbered volumes: after each complete STEP, open the next volume when the active file reaches 80% of the configured direct-read byte limit; earlier volumes remain unchanged.
- The repository has no `npm test` script; the complete regression command is `node --test test/*.test.mjs`.
- Published Slice 1–16 contract details, verification evidence, and rollback records remain in their paired design/plan files and Phase 1 archives; do not reopen them during the unified unpublished batch.
- Keep `scripts/smoke.mjs` and `scripts/http-smoke.mjs` protected and unchanged; their compatibility entries perform exact fail-closed in-memory substitutions, add bounded `sourceURL` labels, and write no transformed source to disk.
- Migrated Tool Cards are nested-first with historical flat fallback; protected main/HTTP Smoke changes only through exact fail-closed in-memory substitutions.

## Local verification evidence

- Slice 28: focused 13/13, adjacent 87/87, complete 456/456, Build, all eight Smoke sections, native-Windows Stress, 162-file package dry-run, `git diff --check`, credential-shape scan, and protected compatibility pass. Deliberate REDs fixed the supertool-free connection-test surface, `enabled=false` exposure, and legacy-wrapper delegation instead of direct target-handler dispatch.
- Slices 23–27: every focused, adjacent, complete regression, Build, eight-section Smoke, native-Windows Stress, package, static, and per-tool `neat-freak` gate passed; exact counts, deliberate REDs, path scopes, and rollback records remain in Phase 1 Volumes 7–9 and the paired design/plan files.
- Slices 17–22: every per-slice focused/adjacent/complete regression, Build, Smoke, native-Windows Stress, package, static, and required `neat-freak` gate passed; exact counts and defects are retained in Phase 1 Volumes 5–7.
- Exact-head implementation CI run `29272546666` passed Ubuntu/Windows Node 20/24 for full SHA `4cea9bd29d1abad97e511d65acf6a57c591a2b74`; publication-record run `29273060702` passed the same four-job matrix for full SHA `1f39996d375b6191fba0bb8972c35bb3b15136ad`.

## Published phase evidence

- Phase 0.5: baseline `82c24da`, Linux fix `da83f77`, and closure `73d7f8f`; CI runs `29183635923` and `29184298290` passed on Ubuntu/Windows Node 20/24.
- Published Slices 1–16 passed their recorded local and Ubuntu/Windows Node 20/24 exact-head gates; per-tool commits, CI runs, RED/GREEN evidence, blockers, and rollback are retained in Phase 1 Volumes 1–4.
- The latest published implementation/publication heads are `4cea9bd` and `1f39996`, with passing CI runs `29272546666` and `29273060702`.

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.
- Git failure classification, including Slice 27 self-test repository-state mapping, remains coupled to current bounded string output from `src/gitOps.ts`.
- Direct `edit` failure classification remains coupled to current `CodexProError` message prefixes and operating-system error codes.
- Direct `apply_patch` input/path classification remains coupled to current internal message prefixes; Git stage classification now uses tool-local typed markers.
- Direct `bash` failure classification remains coupled to current message prefixes and Node error codes; safe Bash is not a sandbox, and timeout does not reliably terminate the complete Windows process tree.
- Direct `open_current_workspace` failure classification remains coupled to current `WorkspaceManager` message prefixes and Node error codes; workspace ownership, expiry, and client isolation remain deferred to Phase 2.
- Direct `open_workspace` root-failure classification also depends on bounded `WorkspaceManager` prefixes and Node error codes.
- Main-Smoke and HTTP-Smoke compatibility loaders depend on exact protected-source strings; source drift fails closed and requires a same-change loader update.
- Direct `workspace_snapshot` validation remains intentionally tool-local and duplicates some open-tool invariants until a later separately reviewed extraction.
- Direct `inspect_workspace` validation remains intentionally tool-local, duplicates some analysis schemas from `search`, and depends on bounded internal error-message prefixes for workspace/path classification.
- Direct `codexpro_inventory` returns a deterministic bounded subset rather than a full-machine total; its twelve-hex external Skill selector is an identifier only and `load_skill` must rediscover/exact-match the private record before reading.
- Direct `load_skill` scans at most 500 Skills, so incomplete name-only resolution fails closed; native realpath is revalidated immediately before read, but Skill trust/content hashes and OS-level atomic containment remain deferred to Phase 6 and the sandbox phases.
- Direct `wait_for_handoff` uses a scheduled-sleep budget in addition to wall time and rejects provider-order drift; state/artifact filesystem snapshots remain non-atomic until later transaction/sandbox work.
- Direct `codex_context` returns a bounded redacted snapshot, not an atomic filesystem/Git transaction; Git helper failure text remains legacy bounded context until its later domain refactor.
- Direct `export_pro_context` uses bounded per-glob discovery, so omission counts are conservative lower bounds beyond each `max_files + 1` probe; scaffold plus artifact writes are non-transactional, while final success now requires an exact on-disk artifact reread.
- Direct `handoff_to_agent` and `handoff_to_codex` keep scaffold, plan, and two log writes non-transactional; detected TOCTOU or log-tail drift fails closed without rollback. Existing plans are bounded by `maxReadBytes`, and both direct results are strict nested contracts.
- Direct `codex_sessions` is a bounded best-effort metadata snapshot rather than an atomic history index; racing or malformed files are excluded, omitted-match totals remain owned by the in-process Provider. Slice 26 transcript acquisition is handle-bounded but metadata discovery and the later transcript handle remain separate observations.
- Review checkpoints remain process-local memory state and are not shared across service restarts.
- Native-Windows Stress skips only the established POSIX-only multi-colon filename fixture and isolates fake-home discovery with both `HOME` and `USERPROFILE`.
- `docs/memory/archive/phase-1.md` exceeds the normal direct read-size limit and is the unchanged first Phase 1 archive volume covering STEP-073–139.
- Phase 1 Volumes 2–8 are closed at STEP-151, STEP-165, STEP-179, STEP-193, STEP-205, STEP-219, and STEP-236; `phase-1-part-9.md` is active from STEP-237 onward.

## Open items

1. Run the conditionally approved unified Slice 17–28 stage/commit/push/exact-head-CI publication; close Phase 1 after exact-head Ubuntu/Windows Node 20/24 pass; complete the Policy Kernel design gate; then continuously execute Phase 2A–Phase 5 without a repeated phase-entry approval pause.

## Recent summaries

- **STEP-245 — Finalize Slice 28 direct dispatch:** a deliberate RED proved the adapter still called the legacy wrapper; dispatch now invokes the live registered target handler directly. Focused 13/13, adjacent 87/87, complete 456/456, Build, eight Smoke sections, Windows Stress, 162-file package, and static gates passed. Phase 1 is locally complete and awaits unified publication.
- **STEP-243 — Design Slice 28:** approved Approach C, wrote the exact supertool design and seven-task TDD plan, and fixed the 27-child/eight-alias closed contract without opening Phase 2 behavior.
- **STEP-242 — Reconcile Slice 27:** marked all 53 plan items complete, synchronized master/roadmap/AGENTS/Memory/archive, verified 27 design-plan pairs and documentation integrity, and made Slice 28 the next action.
- **STEP-241 — Implement Slice 27 before neat-freak:** completed the exact self-test schema, validated Provider, fixed twelve-check derivation, nested consumers, protected-Smoke compatibility, native Stress migration, legacy fixed-artifact migration, semantic hardening, and every non-`neat-freak` local gate.
- **STEP-240 — Design Slice 27 self-test contract:** inventoried the real twelve-check diagnostic, chose structured facts with handler-derived checks, specified a twenty-one-field result with explicit skipped probes and three stable failures, and wrote the seven-task TDD plan.
- **STEP-239 — Close Slice 26 locally:** focused 20/20, adjacent 40/40, complete 428/428, Build, eight Smoke sections, native-Windows Stress, 153-file package dry-run, exact 65-path/static audits, and per-tool `neat-freak` passed; Slice 26 remains unpublished.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Closed interphase maintenance — STEP-066 through STEP-072](docs/memory/archive/interphase-maintenance.md)
- [Phase 1 Volume 1 — STEP-073 through STEP-139](docs/memory/archive/phase-1.md)
- [Closed Phase 1 Volume 2 — STEP-140 through STEP-151](docs/memory/archive/phase-1-part-2.md)
- [Closed Phase 1 Volume 3 — STEP-152 through STEP-165](docs/memory/archive/phase-1-part-3.md)
- [Closed Phase 1 Volume 4 — STEP-166 through STEP-179](docs/memory/archive/phase-1-part-4.md)
- [Closed Phase 1 Volume 5 — STEP-180 through STEP-193](docs/memory/archive/phase-1-part-5.md)
- [Closed Phase 1 Volume 6 — STEP-194 through STEP-205](docs/memory/archive/phase-1-part-6.md)
- [Closed Phase 1 Volume 7 — STEP-206 through STEP-219](docs/memory/archive/phase-1-part-7.md)
- [Closed Phase 1 Volume 8 — STEP-220 through STEP-236](docs/memory/archive/phase-1-part-8.md)
- [Active Phase 1 Volume 9 — STEP-237 onward](docs/memory/archive/phase-1-part-9.md)

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
