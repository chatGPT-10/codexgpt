# Direct `load_skill` Output Schema Implementation Plan

> Date: 2026-07-13  
> Phase: 1, Slice 18  
> Design: `docs/superpowers/specs/2026-07-13-load-skill-output-schema-design.md`  
> Publication: deferred to the unified Slice 17–28 batch

## Global constraints

- Follow the design exactly; change it first if implementation evidence invalidates a decision.
- Use TDD: focused RED before production behavior.
- Keep the direct tool in `standard` and `full` only.
- Do not add Phase 2 Policy Kernel or Phase 6 Skill trust behavior.
- Do not edit protected `scripts/smoke.mjs` or `scripts/http-smoke.mjs`.
- Preserve secret redaction, workspace realpath checks, and sanitized selectors.
- Use `apply_patch` for edits.
- Do not stage, commit, push, or run exact-head CI.
- Finish with `neat-freak` before Slice 19.

### Task 1: Establish the focused RED contract

- [x] Create `test/load-skill-contract.test.mjs` with reusable MCP, temp-workspace, result-text, and exact failure helpers.
- [x] Add pure tests for the six-field envelope, fourteen data fields, selector/Skill shapes, byte invariants, warning derivation, and all stable failures.
- [x] Add strict rejection tests for flat/additional fields, unsafe selectors, mismatched selector/Skill identity, bad byte relationships, impossible partial-resolution success, and warning drift.
- [x] Add descriptor/mode tests proving `standard` and `full` visibility, `minimal` absence, read-only annotations, and advertised `outputSchema`.
- [x] Add real/provider tests for nested success, effective options, empty body, truncation, redaction, workspace failure, not-found, ambiguity, discovery limit, exact-path partial resolution, provider throw/mismatch, and long Tool Card-enabled output.
- [x] Add Tool Card, supertool, Stress, and compatibility-loader assertions.
- [x] Run `node --test test/load-skill-contract.test.mjs` and record the genuine behavioral RED.
- [x] Review that failures come from missing Slice 18 behavior rather than test syntax or harness problems.

### Task 2: Add the strict schema and constructors

- [x] Create `src/tools/schemas/loadSkill.ts`.
- [x] Define fixed titles, messages, warnings, source enum, safe selector schemas, Skill item schema, and exact fourteen-field data schema.
- [x] Implement cross-field identity, global-source, byte/truncation, returned-byte, partial-resolution, and warning invariants.
- [x] Define all eight failure variants with exact redacted details and non-retryable semantics.
- [x] Add strict success/failure constructors that derive warnings.
- [x] Run the focused suite and confirm only runtime/consumer groups remain red.
- [x] Run `npm run build`.

### Task 3: Make the bounded domain resolver explicit

- [x] Add `discoveryTruncated` to `LoadedSkill`.
- [x] Add a small exported typed `LoadSkillError` covering not-found, ambiguous, resolution-limit, boundary, and read failures.
- [x] Preserve current discovery roots, sorting, depth, and limits.
- [x] Return ambiguity immediately when at least two visible candidates match.
- [x] Require an exact path for success when discovery is truncated and uniqueness/absence cannot otherwise be proven.
- [x] Revalidate workspace Skill realpath immediately before read and read the revalidated target.
- [x] Wrap expected read failures without exposing raw errors.
- [x] Run focused domain tests and the Slice 17 inventory contract.

### Task 4: Implement the exact direct handler

- [x] Import the new schema, constants, and types.
- [x] Add `LoadSkillProviderContext` and optional `loadSkillProvider` dependency.
- [x] Add strict provider-result validation and selector/result consistency checks.
- [x] Add safe selector normalization and exact effective-option calculation.
- [x] Split workspace lookup, provider execution, and output construction into explicit failure stages.
- [x] Pre-redact the body, compute `returned_bytes`, set `redacted`, and construct exact data.
- [x] Add the `outputSchema`, read-only annotations, and internal structured-preservation metadata.
- [x] Keep human content bounded, redacted, and actionable.
- [x] Run focused tests and `npm run build`.

### Task 5: Migrate consumers

- [x] Add nested-first `loadSkillResultData` and a dedicated bounded `renderLoadSkill` Tool Card function with flat historical fallback.
- [x] Update every Stress `load_skill` body read to nested `data` and add exact metadata assertions.
- [x] Extend `scripts/smoke-platform-compat.mjs` with exact-count flat-to-nested Skill/text replacements.
- [x] Extend `scripts/http-smoke-compat.mjs` with exact-once flat-to-nested Skill/text replacements.
- [x] Prove protected Smoke source files are unchanged.
- [x] Prove the supertool preserves the nested child envelope.
- [x] Run focused and adjacent consumer tests.

### Task 6: Review the usable result and harden it

- [x] Review selector sanitization, path/source agreement, partial discovery, byte/redaction semantics, filesystem races, provider mismatch, Tool Card size, and error actionability.
- [x] Add a deliberate RED for every material issue found.
- [x] Apply the minimum fix and rerun focused/adjacent tests plus Build.
- [x] Update the design first if any public-contract decision changes.

### Task 7: Complete local verification and `neat-freak`

- [x] Run focused Slice 18 tests.
- [x] Run adjacent inventory/workspace contracts.
- [x] Run `npm run build`.
- [x] Run `node --test test/*.test.mjs`.
- [x] Run `npm run smoke`.
- [x] Run native-Windows `npm run stress`.
- [x] Run `npm pack --dry-run`.
- [x] Run `git diff --check`.
- [x] Audit exact intended files and protected-source hashes/diffs.
- [x] Scan changed files for secret-looking values.
- [x] Run the user-required `neat-freak`: enumerate project docs/rules, reconcile active facts, check paths/references, measure `AGENTS.md`/`Memory.md`/archive sizes, and fix drift.
- [x] Append complete archive evidence and update `Memory.md`, `AGENTS.md`, the master plan, and historical roadmap status.
- [x] Mark every executed checkbox complete only after fresh evidence.
- [x] Continue directly to Slice 19 without staging, committing, pushing, or CI publication.
