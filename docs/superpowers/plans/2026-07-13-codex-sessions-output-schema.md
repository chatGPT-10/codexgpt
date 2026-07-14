# Direct `codex_sessions` Output Schema Implementation Plan

> Date: 2026-07-13  
> Phase: 1, Slice 25  
> Design: `docs/superpowers/specs/2026-07-13-codex-sessions-output-schema-design.md`  
> Execution: uninterrupted TDD inside the unpublished Slice 17–28 batch

## Goal

Replace the direct `codex_sessions` flat output with its exact schema-v1 metadata-index contract while preserving opt-in visibility, preventing transcript leakage and unsafe resume commands, proving deterministic bounded discovery, and leaving `read_codex_session` production output unchanged.

## Guardrails

- Do not edit protected `scripts/smoke.mjs` or `scripts/http-smoke.mjs`.
- Do not expose transcript bodies, tail summaries, raw errors, or new history roots.
- Do not execute or attach to Codex tasks.
- Do not implement Phase 2+ behavior.
- Do not stage, commit, push, publish, or run exact-head CI before Slice 28.
- Use deliberate RED before every behavior change or hardening fix.
- Finish with the required per-tool `neat-freak`, then continue directly to Slice 26.

## Task 1 — Freeze executable acceptance criteria

- [x] Add `test/codex-sessions-contract.test.mjs`.
- [x] Assert exact schema fields, constructors, warnings, failures, and cross-field invariants.
- [x] Assert off/metadata/read visibility across tool modes and the exact advertised schema.
- [x] Assert nested-only success, request identity, metadata-only filtering, and no flat duplicates.
- [x] Assert deterministic discovery/order/de-duplication/accounting and safe UUID commands.
- [x] Assert Provider exception, drift, containment, count, ordering, and extra-field failures.
- [x] Assert bounded nested-only Tool Card and exact protected-Smoke compatibility substitutions.
- [x] Run the focused file and preserve the expected all-RED baseline.

## Task 2 — Add the exact schema module

- [x] Add `src/tools/schemas/codexSessions.ts`.
- [x] Define the nine-field strict session item and eighteen-field strict data object.
- [x] Define deterministic comparison and all count/completeness invariants.
- [x] Define two fixed warnings and two fixed non-retryable failures.
- [x] Define exact envelope, output shape, constructors, and failure input types.
- [x] Run schema-only tests and Build.

## Task 3 — Harden deterministic bounded indexing

- [x] Export fixed scan file/depth limits from `src/codexSessions.ts`.
- [x] Sort directory traversal and report discovery truncation exactly.
- [x] Validate/lowercase UUID identities before constructing resume commands.
- [x] Bound and normalize title/project metadata.
- [x] Derive `active|archived` storage from the fixed root.
- [x] Deterministically sort and de-duplicate sessions.
- [x] Return exact scan/index/exclusion/duplicate/match/return accounting.
- [x] Prove domain behavior with targeted tests and Build.

## Task 4 — Add the Provider boundary and direct handler

- [x] Add `CodexSessionsProviderContext` and `codexSessionsProvider` dependency.
- [x] Validate strict Provider shape before public construction.
- [x] Validate configured directory/root identity and source containment.
- [x] Normalize the effective request once.
- [x] Register `codex_sessions` with exact `outputSchema` and bounded query input.
- [x] Return exact nested success text/data.
- [x] Map Provider exceptions to `SESSION_INDEX_FAILED` and drift to `INTERNAL_ERROR`.
- [x] Run focused handler/provider tests and Build.

## Task 5 — Migrate consumers without touching protected sources

- [x] Add dedicated nested-only Tool Card title, subtitle, extractor, and bounded renderer.
- [x] Add exact-count `codex_sessions` substitutions to `scripts/smoke-platform-compat.mjs`.
- [x] Confirm `read_codex_session` visibility/output remains unchanged.
- [x] Run focused consumer tests, protected main Smoke through its compatibility harness, and Build.

## Task 6 — Review and harden the usable result

- [x] Review root symlinks, Windows path case, source containment, races, scan limits, integer/timestamp bounds, duplicates, filtering, transcript leakage, human text, Tool Card bounds, and advertised/runtime agreement.
- [x] Add a deliberate RED for each material defect found.
- [x] Apply the smallest correction and rerun focused and adjacent suites.
- [x] Confirm protected Smoke sources are unchanged.

## Task 7 — Complete local gates and per-tool `neat-freak`

- [x] Run the focused Slice 25 suite.
- [x] Run adjacent optional-session and direct-tool contract suites.
- [x] Run the complete contract regression and Build.
- [x] Run all Smoke sections, native-Windows Stress, and package dry-run.
- [x] Run `git diff --check`, protected-source, empty-index, exact-scope, secret-shape, and intended-file audits.
- [x] Run `neat-freak`: reconcile design/plan/master roadmap/AGENTS/Memory/archive and verify Markdown links, fences, size limits, path references, required files, and output-schema pairs.
- [x] Record exact commands/results, risks, rollback, and next action in active Volume 8.
- [x] Continue directly to Slice 26 without staging, committing, pushing, publication, or exact-head CI.
