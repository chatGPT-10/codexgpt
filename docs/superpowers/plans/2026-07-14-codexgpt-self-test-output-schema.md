# Direct `codexgpt_self_test` Output Schema Implementation Plan

> Date: 2026-07-14  
> Phase: 1, Slice 27  
> Design: `docs/superpowers/specs/2026-07-14-codexgpt-self-test-output-schema-design.md`  
> Execution: uninterrupted TDD inside the unpublished Slice 17–28 batch

## Goal

Replace the direct `codexgpt_self_test` flat result with an exact schema-v1 structured diagnostic contract that derives all public checks from validated facts, distinguishes failed checks from failed tool execution, exposes explicit skipped probes, and preserves the local-only fixed-artifact boundary.

## Guardrails

- Do not edit protected `scripts/smoke.mjs` or `scripts/http-smoke.mjs`.
- Do not execute Codex, another agent, external network probes, or Cloudflare checks.
- Do not implement the Phase 2 Policy Kernel or migrate the Slice 28 `codexgpt` supertool.
- Do not expose raw exceptions, stacks, credentials, Bash output, file content, Skill/MCP names, or Git paths.
- Do not touch source files from the write/edit probe.
- Do not add a production test mode or hidden MCP argument.
- Do not stage, commit, push, publish, or run exact-head CI before Slice 28.
- Use deliberate RED before every behavior change or hardening fix.
- Finish with the required per-tool `neat-freak`, then continue directly to Slice 28.

## Task 1 — Freeze executable acceptance criteria

- [x] Add `test/codexgpt-self-test-contract.test.mjs`.
- [x] Assert the exact six-field envelope, twenty-one-field data object, twelve checks, four outcomes, three failures, and ordered warnings.
- [x] Assert all public input defaults/bounds and visibility in minimal, standard, and full modes.
- [x] Assert failed diagnostic checks remain `ok: true` while operational failures use `ok: false`.
- [x] Assert independent expected/registered tool observations and exact missing/unexpected derivation.
- [x] Assert inventory/Git/probe/session/auth/terms invariants and absence of raw diagnostics.
- [x] Assert bounded human text, nested-only Tool Card, protected-source assumptions, native Stress migration, and Slice 17/22 adjacency.
- [x] Run the complete focused file and preserve an all-RED executable baseline.

## Task 2 — Add the exact schema module

- [x] Add `src/tools/schemas/codexgptSelfTest.ts`.
- [x] Define strict identity, request, mode, count, tool-set, inventory, Git, probe, check, terms, error, and envelope schemas.
- [x] Define the fixed twelve-check order and safe diagnostic-code/message constraints.
- [x] Enforce exact cross-field counts, status, tool-set differences, fixed paths, terms constants, and ordered warnings.
- [x] Add pure success/failure constructors.
- [x] Export the exact output shape for MCP advertisement.
- [x] Run schema-only tests and Build.

## Task 3 — Build the structured diagnostic Provider

- [x] Normalize defaults once before Provider invocation.
- [x] Introduce one injectable Provider context containing workspace, config identity, normalized request, and actual registered tools.
- [x] Derive expected tools independently from current effective visibility rules.
- [x] Reuse bounded Slice 17 inventory facts without exposing names or paths.
- [x] Produce bounded Git clean/changed/not-Git/unavailable facts without paths or stderr.
- [x] Harden the fixed `.ai-bridge/codexgpt-self-test.md` probe with recognized-scaffold preflight and no unrelated overwrite.
- [x] Keep selected-only Pro-context verification build-only and keep Bash verification allowlisted/local.
- [x] Return only structured observations and fixed internal reason codes.
- [x] Run Provider/domain-focused tests and Build.

## Task 4 — Derive checks and wire the direct handler

- [x] Validate Provider workspace/config/request/tool/inventory/Git/probe/terms identity before public construction.
- [x] Validate sorted, unique tool lists and derive exact missing/unexpected sets without aliasing observations.
- [x] Derive the twelve checks, four outcome counts, overall status, fixed messages, and ordered warnings in the handler.
- [x] Preserve a coherent failed diagnostic as `ok: true`, `data.status = "fail"`.
- [x] Map workspace absence, incomplete execution, and Provider/schema drift to the exact three stable failures.
- [x] Advertise the exact output schema and correct non-destructive local-write annotations.
- [x] Emit bounded safe human diagnostic text.
- [x] Run handler/descriptor/failure tests and Build.

## Task 5 — Migrate maintained consumers

- [x] Add a nested-only self-test extractor and failure-aware dedicated Tool Card.
- [x] Render all twelve bounded checks, four counts, tool-set mismatch summaries, and the fixed artifact only when present.
- [x] Add exact-count fail-closed self-test substitutions to `scripts/smoke-platform-compat.mjs`.
- [x] Keep both protected Smoke sources byte-for-byte unchanged.
- [x] Update `scripts/stress.mjs` to consume nested self-test data.
- [x] Preserve Slice 17 inventory and Slice 22 selected-only Pro-context compatibility.
- [x] Run consumer tests, protected main Smoke, native Stress subset, and Build.

## Task 6 — Review and harden the usable result

- [x] Review Windows path casing, context-directory links, pre-existing artifact conflicts, partial writes, and exact-edit mismatch.
- [x] Review non-Git/unavailable Git states, tool-list aliases/order/count drift, inventory truncation, and all mode combinations.
- [x] Review Bash off/safe/full, required session guard, skipped probes, and full-Bash warnings.
- [x] Review secret/control/path injection, arbitrary Provider messages, impossible check counts/order, and terms drift.
- [x] Review human/Card bounds and advertised/runtime agreement.
- [x] Add one deliberate RED for every material defect found.
- [x] Apply the smallest correction and rerun focused plus adjacent suites.

## Task 7 — Complete local gates and per-tool `neat-freak`

- [x] Run focused and adjacent Slice 17/22/config/Bash/write-mode suites.
- [x] Run the complete contract regression and Build.
- [x] Run all eight Smoke sections, native-Windows Stress, and package dry-run.
- [x] Run protected-source, empty-index, exact-scope, whitespace, secret-shape, and intended-file audits.
- [x] Run `neat-freak`: reconcile design/plan/master/roadmap/AGENTS/Memory/archive and verify links, fences, pairs, limits, and references.
- [x] Record exact commands/results, risks, rollback, and next action in the active archive volume.
- [x] Continue directly to Slice 28 without staging, committing, pushing, publication, or exact-head CI.
