# Direct `read_codex_session` Output Schema Implementation Plan

> Date: 2026-07-13  
> Phase: 1, Slice 26  
> Design: `docs/superpowers/specs/2026-07-13-read-codex-session-output-schema-design.md`  
> Execution: uninterrupted TDD inside the unpublished Slice 17–28 batch

## Goal

Replace the direct `read_codex_session` flat output with its exact schema-v1 bounded-transcript contract while preserving read-mode opt-in, making selector/snapshot/completeness facts trustworthy, redacting before byte accounting, and keeping the operation read-only and process-free.

## Guardrails

- Do not edit protected `scripts/smoke.mjs` or `scripts/http-smoke.mjs`.
- Do not attach to tasks, execute `codex resume`, search transcripts, or add history roots.
- Do not expose raw secrets, controls, paths in failures, exceptions, or stacks.
- Do not implement Phase 2+ lifecycle, policy, sandbox, or process behavior.
- Do not stage, commit, push, publish, or run exact-head CI before Slice 28.
- Use deliberate RED before every behavior change or hardening fix.
- Finish with the required per-tool `neat-freak`, then continue directly to Slice 27.

## Task 1 — Freeze executable acceptance criteria

- [x] Add `test/read-codex-session-contract.test.mjs`.
- [x] Assert exact envelope, twenty-field data, eight-field messages, warnings, failures, and invariants.
- [x] Assert off/metadata/read visibility across all tool modes and exact descriptor/schema.
- [x] Assert id/path/both requests, defaults, identity, and Slice 25 adjacency.
- [x] Assert not-found versus incomplete resolution and every typed operational failure.
- [x] Assert controls, roles, redaction-before-cap, Unicode bytes, partial messages, and exact-limit EOF.
- [x] Assert Provider drift, bounded nested Tool Card, and protected-source compatibility.
- [x] Run the focused file and preserve the expected all-RED baseline.

## Task 2 — Add the exact schema module

- [x] Add `src/tools/schemas/readCodexSession.ts`.
- [x] Define the strict eight-field message and twenty-field data schemas.
- [x] Reuse the strict Slice 25 session record and enforce selector/root/message/count invariants.
- [x] Define two fixed warnings, eight fixed failures, and pure constructors.
- [x] Export the exact output shape for MCP advertisement.
- [x] Run schema-only tests and Build.

## Task 3 — Harden bounded transcript acquisition

- [x] Add normalized request and typed domain operation errors.
- [x] Distinguish confirmed missing id from incomplete bounded-index resolution.
- [x] Revalidate canonical real-path containment for id and path selection.
- [x] Open/stat one file handle and bound the stream to the captured 20 MB snapshot.
- [x] Normalize kinds/roles/controls, redact, then apply exact UTF-8 limits.
- [x] Return a marked safe prefix for one oversized final message when budget permits.
- [x] Return exact source/message/redaction/truncation facts.
- [x] Run domain-focused tests and Build.

## Task 4 — Add the Provider boundary and direct handler

- [x] Add `NormalizedReadCodexSessionRequest`, Provider context, and dependency injection.
- [x] Normalize semantic selectors once before the Provider.
- [x] Validate strict Provider/config/request/session/message identity and counts.
- [x] Advertise the exact output schema and preserve long structured content.
- [x] Return exact nested success and bounded safe human transcript.
- [x] Map typed operational failures and unknown/malformed Provider failures exactly.
- [x] Run focused handler/provider tests and Build.

## Task 5 — Migrate bounded consumers

- [x] Add dedicated Tool Card title/icon/subtitle/extractor/renderer.
- [x] Render at most eight bounded transcript previews with no flat fallback.
- [x] Migrate the Slice 25 source-path adjacency assertion to nested `data`.
- [x] Prove protected Smoke sources require no edit and still pass through the compatibility harness.
- [x] Run consumer tests, protected main Smoke, and Build.

## Task 6 — Review and harden the usable result

- [x] Review Windows case, root symlinks, source replacement/growth, malformed/large files, exact-limit EOF, Unicode/controls, redaction expansion, Provider drift, text/Card bounds, and advertised/runtime agreement.
- [x] Add a deliberate RED for every material defect found.
- [x] Apply the smallest correction and rerun focused and adjacent suites.
- [x] Confirm protected Smoke sources remain unchanged.

## Task 7 — Complete local gates and per-tool `neat-freak`

- [x] Run focused and adjacent Slice 25–26 suites.
- [x] Run the complete contract regression and Build.
- [x] Run all Smoke sections, native-Windows Stress, and package dry-run.
- [x] Run protected-source, empty-index, exact-scope, `git diff --check`, secret-shape, and intended-file audits.
- [x] Run `neat-freak`: reconcile design/plan/master/roadmap/AGENTS/Memory/archive and verify links, fences, pairs, limits, and references.
- [x] Record exact commands/results, risks, rollback, and next action in the active archive volume.
- [x] Continue directly to Slice 27 without staging, committing, pushing, publication, or exact-head CI.
