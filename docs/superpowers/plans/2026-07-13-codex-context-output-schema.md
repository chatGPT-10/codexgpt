# Direct `codex_context` Output Schema Implementation Plan

> Date: 2026-07-13  
> Phase: 1, Slice 21  
> Design: `docs/superpowers/specs/2026-07-13-codex-context-output-schema-design.md`  
> Publication: deferred to the unified Slice 17–28 batch

## Global constraints

- Follow the approved design and update it first if evidence changes a public decision.
- Use focused RED before production behavior.
- Migrate only direct `codex_context`; leave Slice 22 and later contracts unchanged.
- Preserve all current inputs, full-only visibility, read-only behavior, Git switch independence, and direct supertool action.
- Use only the root-to-target instruction chain and fixed handoff allowlist.
- Keep protected Smoke sources unchanged through exact fail-closed compatibility substitutions.
- Do not add dependencies, arbitrary file selection, writes, hidden Codex state, Policy Kernel behavior, staging, commit, push, or CI publication.
- Finish with the user-required `neat-freak` before Slice 22.

### Task 1: Establish focused RED

- [x] Add `test/codex-context-contract.test.mjs` with schema, MCP, temp-workspace, provider, Tool Card, and protected-source helpers.
- [x] Freeze the six-field envelope, twenty-eight data fields, unavailable records, warnings, and six failures.
- [x] Cover modes, descriptor, canonical targets, instruction chain, fixed AI context, Git switches, bounds, redaction, and non-creation.
- [x] Cover provider drift, Tool Card bounds, long structured content, supertool, compatibility substitutions, and protected sources.
- [x] Run focused RED and prove failures are absent Slice 21 behavior.

### Task 2: Add exact schema and constructors

- [x] Create `src/tools/schemas/codexContext.ts`.
- [x] Define safe paths, modes, exact data/error/output schemas, fixed warnings, and preview derivation.
- [x] Enforce counts, include/presence flags, AI coverage, byte/truncation/limit/redaction, ordering, and envelope invariants.
- [x] Add strict success/failure constructors and make schema checkpoints green.
- [x] Run Build.

### Task 3: Harden target and domain reads

- [x] Add canonical target resolution with file/directory/missing kinds and safe missing-parent validation.
- [x] Replace filename-dot instruction inference with target-kind directory derivation.
- [x] Guard and realpath instruction directories/files before read; de-duplicate per platform.
- [x] Return only loaded AGENTS paths plus safe fixed unavailable reasons; remove raw exception text.
- [x] Reuse fixed handoff artifacts and return exact AI existence/coverage/unavailability.
- [x] Assemble provider text with independent Git switches and no context creation.
- [x] Run focused domain tests and Build.

### Task 4: Implement exact handler and provider boundary

- [x] Add `codexContextProvider` dependency and strict raw provider framing.
- [x] Classify workspace/target/provider failures without unsafe details.
- [x] Validate identity, canonical path/kind, ordered AGENTS, fixed AI coverage, unavailability, and requested Git presence.
- [x] Redact before UTF-8 output capping; construct exact context bytes, preview, flags, counts, and warnings.
- [x] Advertise the exact schema and preserve structured content.
- [x] Run focused tests and Build.

### Task 5: Migrate consumers

- [x] Add a nested-first dedicated bounded `codex_context` Tool Card with historical flat fallback.
- [x] Add exact-count protected main-Smoke compatibility substitutions.
- [x] Add exact-count protected HTTP-Smoke compatibility substitutions.
- [x] Prove protected sources are unchanged.
- [x] Prove direct supertool child-envelope preservation.
- [x] Run focused and adjacent tests.

### Task 6: Review and harden the usable result

- [x] Review target races, missing-parent containment, instruction precedence/order, case behavior, fixed AI coverage, Git failures, Unicode bytes, redaction expansion, provider drift, duplication cost, and UI bounds.
- [x] Add deliberate RED for every material issue found.
- [x] Apply minimum fixes and rerun focused/adjacent tests plus Build.
- [x] Reconcile the design for the configured context-directory and canonical missing-parent clarifications found during review.

### Task 7: Complete local verification and `neat-freak`

- [x] Run focused/adjacent contracts, Build, complete regression, Smoke, native-Windows Stress, and package dry-run.
- [x] Run diff, protected-source, exact-scope, secret-pattern, document-reference, memory, and archive checks.
- [x] Reconcile `AGENTS.md`, `Memory.md`, master plan, historical roadmap, plan, design, and active archive.
- [x] Mark checkboxes only from fresh evidence.
- [x] Continue directly to Slice 22 without staging, committing, pushing, or CI publication.
