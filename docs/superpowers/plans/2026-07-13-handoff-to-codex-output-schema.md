# Direct `handoff_to_codex` Output Schema Implementation Plan

> Date: 2026-07-13  
> Phase: 1, Slice 24  
> Design: `docs/superpowers/specs/2026-07-13-handoff-to-codex-output-schema-design.md`  
> Publication: deferred to the unified Slice 17–28 batch

## Constraints

- Follow the approved design and update it before code if evidence changes a public decision.
- Use focused RED before production behavior.
- Migrate only direct `handoff_to_codex`; retain Slice 23 behavior and exact contracts.
- Preserve four inputs, full-only visibility, planning-only writes, fixed paths, Codex identity/prompt, and `codex_handoff` alias.
- Reuse the hardened handoff domain; do not create a parallel file-writing implementation.
- Keep both protected Smoke sources unchanged.
- Do not add execution, process management, transactions, Policy Kernel behavior, staging, commit, push, publication, or CI.
- Finish with the user-required `neat-freak` before Slice 25.

### Task 1: Establish focused RED

- [x] Add `test/handoff-to-codex-contract.test.mjs` with schema, MCP, temp-workspace, provider, Tool Card, supertool, protected-source, mode, and native-Stress helpers.
- [x] Freeze the six-field envelope, thirty-six data fields, one warning, and fifteen stable failures.
- [x] Cover fixed Codex identity, four inputs/defaults, full-only visibility, no-write preflight, append semantics, read/write ceilings, bytes/hashes/diff/event/prompt integrity, and scaffold ordering.
- [x] Cover provider drift, missing/mismatched disk plan, mismatched log tails, bounded nested Tool Card, supertool preservation, protected-source compatibility, and Slice 23 isolation.
- [x] Run focused RED and prove failures are absent Slice 24 behavior.

### Task 2: Add exact schema and constructors

- [x] Add `src/tools/schemas/handoffToCodex.ts` with tool-local warning/error definitions and fixed Codex data constraints.
- [x] Reuse only explicitly exported shared handoff data primitives; preserve strict Slice 23 behavior.
- [x] Add strict success/failure constructors and cross-field invariants.
- [x] Run schema-focused tests and Build.

### Task 3: Extract the shared validated provider boundary

- [x] Extract the Slice 23 provider-result validation and durable plan/two-log reread into one internal shared helper.
- [x] Keep request preparation, preflight, and durable writer behavior unchanged.
- [x] Add independent Slice 24 provider/clock seams and remove the flat wrapper only after all consumers migrate.
- [x] Run Slice 23 and Slice 24 domain/provider tests plus Build.

### Task 4: Implement the exact direct handler

- [x] Register the exact output schema and structured-content preservation without changing full-only visibility.
- [x] Build the fixed Codex request, classify only safe tool-specific failures, and validate every provider/preflight fact.
- [x] Return exact nested success/failure and bounded Codex-specific MCP text.
- [x] Prove invalid requests do not create bridge files and durable drift cannot return success.
- [x] Run handler-focused tests and Build.

### Task 5: Migrate consumers

- [x] Make the handoff Tool Card nested-first for both direct handoff tools and remove the flat fallback.
- [x] Preserve protected main/HTTP Smoke sources without adding unnecessary substitutions.
- [x] Add full-mode native Stress coverage for the `codex_handoff` nested supertool child.
- [x] Migrate the Slice 23 compatibility assertion to the Slice 24 nested contract.
- [x] Run focused and adjacent tests plus Build.

### Task 6: Review and harden the usable result

- [x] Review fixed-target enforcement, mode surface, request normalization, read/write limits, all preflight/write ordering, partial writes, event identity, plan/log integrity, provider drift, compatibility, and UI bounds.
- [x] Add deliberate RED for every material issue found.
- [x] Apply minimum fixes and rerun focused/adjacent tests plus Build.
- [x] Reconcile the design first if a public decision changes.

### Task 7: Complete local verification and `neat-freak`

- [x] Run focused/adjacent contracts, Build, complete regression, all Smoke commands, native-Windows Stress, and package dry-run.
- [x] Run diff, protected-source, exact-scope, secret-pattern, document-reference, memory, archive, and Git-index checks.
- [x] Reconcile `AGENTS.md`, `Memory.md`, master plan, historical roadmap, plan, design, and active archive.
- [x] Mark checkboxes only from fresh evidence.
- [x] Continue directly to Slice 25 without staging, committing, pushing, publication, or exact-head CI.
