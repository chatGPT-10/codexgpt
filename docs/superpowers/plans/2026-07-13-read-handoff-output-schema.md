# Direct `read_handoff` Output Schema Implementation Plan

> Date: 2026-07-13  
> Phase: 1, Slice 19  
> Design: `docs/superpowers/specs/2026-07-13-read-handoff-output-schema-design.md`  
> Publication: deferred to the unified Slice 17–28 batch

## Global constraints

- Follow the approved design and change it first if implementation evidence changes a public decision.
- Use focused RED before production behavior.
- Migrate only direct `read_handoff`; do not migrate `wait_for_handoff` or later tools.
- Preserve the optional-only `workspace_id` input and current mode membership.
- Keep protected Smoke sources unchanged; use exact compatibility substitution.
- Do not add dependencies, arbitrary path input, write behavior, Phase 2, staging, commit, push, or CI publication.
- Finish with the user-required `neat-freak` before Slice 20.

### Task 1: Establish focused RED

- [x] Add `test/read-handoff-contract.test.mjs` with MCP/temp-workspace/result helpers.
- [x] Freeze exact envelope, fifteen data fields, artifact/unavailable shapes, warnings, and three failures.
- [x] Add strict malformed/cross-field rejection cases.
- [x] Add descriptor/mode and real absent/populated/limited/redacted behavior cases.
- [x] Add provider, Tool Card, long-output, supertool, and protected-consumer cases.
- [x] Run the suite and prove failures are missing Slice 19 behavior, not harness errors.

### Task 2: Add exact schema and constructors

- [x] Create `src/tools/schemas/readHandoff.ts`.
- [x] Define fixed artifact mapping, safe paths, exact item/data/error schemas, and derived warnings.
- [x] Enforce coverage/order/count/byte/limit/redaction invariants.
- [x] Add strict success/failure constructors.
- [x] Run the schema checkpoint and Build.

### Task 3: Implement bounded domain read

- [x] Add `readHandoffLimits`, artifact definitions/types, and `readHandoffContext` in `src/workspaceOps.ts`.
- [x] Return absent context without creating it.
- [x] Read only fixed artifacts that fit both bounds.
- [x] Classify unavailable artifacts without raw diagnostics.
- [x] Recheck actual bytes after read.
- [x] Make `readAiBridgeContext` a safe compatibility wrapper.

### Task 4: Implement exact direct handler

- [x] Add provider context/dependency and strict provider-result validation.
- [x] Split workspace, provider, and construction failure stages.
- [x] Pre-redact bodies and compute exact public counters/flags.
- [x] Advertise the exact output schema and structured-preservation metadata.
- [x] Keep human output bounded, safe, and actionable.
- [x] Run focused tests and Build.

### Task 5: Migrate consumers

- [x] Add nested-first dedicated `read_handoff` Tool Card rendering with flat historical fallback.
- [x] Add exact-once protected main-Smoke compatibility replacement.
- [x] Prove protected Smoke files are unchanged.
- [x] Prove supertool child-envelope preservation.
- [x] Run focused and adjacent tests.

### Task 6: Review and harden the usable result

- [x] Review path coverage, absence, optional missing files, read races, byte caps, redaction, provider drift, failure actionability, and card size.
- [x] Add deliberate RED for every material issue found.
- [x] Apply minimum fixes and rerun focused/adjacent tests plus Build.
- [x] Update the design first for any public-contract change.

### Task 7: Complete local verification and `neat-freak`

- [x] Run focused and adjacent contracts, Build, complete regression, Smoke, native-Windows Stress, and package dry-run.
- [x] Run diff, protected-source, exact-scope, secret-pattern, document-reference, and archive-size checks.
- [x] Reconcile `AGENTS.md`, `Memory.md`, master plan, historical roadmap, plan, design, and active archive.
- [x] Mark checkboxes only from fresh evidence.
- [x] Continue directly to Slice 20 without staging, committing, pushing, or CI publication.
