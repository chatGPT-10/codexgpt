# P3 Unified Code Navigation TDD Implementation Plan

Date: 2026-08-30
Status: completed locally as STEP-537 under the owner's explicit instruction to execute P3 through completion
Design authority: `docs/superpowers/specs/2026-08-30-p3-unified-code-navigation-design.md`

## Goal

Provide one bounded, evidence-labelled code-navigation route across owned semantics, lexical search, and file discovery while preserving V1-V5 direct-tool counts, old operations, authority, and rollback.

## Constraints

- Tests precede runtime changes.
- Keep direct-tool counts `28/31/39/51/52`; do not remove or rename any tool.
- Add `navigate_code` only as a V5 supertool alias to `semantic`.
- Keep all existing `semantic` operations and `search` payloads compatible.
- Lexical fallback must be explicit and must not claim semantic certainty.
- Diagnostics never receive a fake lexical fallback.
- Do not alter rename/apply authority, external state, App configuration, deployment, Git history, or publication.

## Task 0 - Characterize and establish RED

1. Run the existing Phase 7 semantic, search, tool-definition, and routing-description tests.
2. Add `test/navigation-service.test.mjs` for TypeScript, Python, mixed, unavailable, crash, stale, diagnostics, file, text, and truncation routing.
3. Add `test/navigation-contract.test.mjs` for strict input/output schemas, direct semantic integration, V5 alias behavior, older-version rejection, and exact tool counts.
4. Register both tests in `scripts/test-execution-profile-manifest.mjs`.
5. Run the new tests before implementation and record the missing-module/schema failures as RED.

## Task 1 - Add strict navigation schemas and service

1. Add `src/navigation/types.ts` and `src/navigation/service.ts`.
2. Add `src/tools/schemas/navigation.ts` with strict request/result/match schemas.
3. Extend the semantic input descriptor and strict input union with `operation=navigate`.
4. Extend the semantic result envelope additively for navigation providers/capability/result.
5. Implement semantic-first routing, honest lexical fallback, text routing, file routing, diagnostics unavailability, redaction, budgets, stable reason codes, and truncation.
6. Build and run the unit contract tests to GREEN.

## Task 2 - Integrate through the existing pipeline

1. Construct one navigation service beside the existing semantic manager.
2. Branch only `operation=navigate` inside the existing registered `semantic` handler.
3. Render the normalized navigation result without exposing internal paths or errors.
4. Add V5-only `navigate_code -> semantic` alias resolution and update the supertool/direct descriptions.
5. Prove the alias invokes the same registered handler and pipeline; prove V1-V4 do not resolve it.
6. Run focused semantic/search/supertool/pipeline/tool-count regressions.

## Task 3 - Compatibility and packaging

1. Preserve all existing semantic definition/reference/diagnostics/rename behavior.
2. Preserve search structured-analysis behavior and V1-V5 descriptor/tool-count snapshots except the intentional additive V5 semantic input metadata.
3. Add new source/tests to the execution-profile and package checks.
4. Update README, README_ZH, design, changelog, master plan, and shipped prompts only where the navigation selection contract is user/model-facing.

## Task 4 - Final local closure

Run in order:

```powershell
npm run test:focused -- test/navigation-service.test.mjs test/navigation-contract.test.mjs <semantic/search/pipeline compatibility tests>
node scripts/toolchain-manager.mjs matrix --major all --root $env:LOCALAPPDATA\CodexPro\toolchains -- npm run test:focused -- <selected tests>
node scripts/long-task-runner.mjs start --kind p3-final-ordinary --cwd D:\Dev\codexgpt -- node scripts/toolchain-manager.mjs matrix --major all --root $env:LOCALAPPDATA\CodexPro\toolchains -- npm run test:ordinary
node scripts/long-task-runner.mjs start --kind p3-final-smoke --cwd D:\Dev\codexgpt -- node scripts/toolchain-manager.mjs matrix --major all --root $env:LOCALAPPDATA\CodexPro\toolchains -- npm run smoke
node scripts/toolchain-manager.mjs matrix --major all --root $env:LOCALAPPDATA\CodexPro\toolchains -- npm run build
npm pack --dry-run --json
npm run policy:check
git diff --check
```

Then run added-line credential scans, direct-tool count/scope checks, Markdown link/UTF-8 checks, archive-size checks, and confirm no file is staged.

## Task 5 - Knowledge closure

1. Append one complete STEP entry to the active interphase archive, starting a continuation volume first if the 48 KB split threshold is reached.
2. Update `Memory.md` in place and keep it within its limits.
3. Record exact commands/results, failed attempts, risks, rollback, unscored Web metrics, and next gated action.
4. Run the final documentation/rule audit and correct stale P3 guidance.

P3 is complete only when all local gates are green and the knowledge surfaces agree. P4, App refresh, Web benchmark, deployment, publication, commit, push, credentials, and external-state work remain separately gated.

## Completion record

Tasks 0–5 completed on 2026-08-30. RED began with the expected missing navigation modules/schema. The final implementation preserves all named compatibility and authority constraints, and the exact closure evidence is recorded in the paired design, `Memory.md`, and `docs/memory/archive/interphase-maintenance-part-12.md`. P4 remains the next separately gated product phase.
