# Direct `wait_for_handoff` Output Schema Implementation Plan

> Date: 2026-07-13  
> Phase: 1, Slice 20  
> Design: `docs/superpowers/specs/2026-07-13-wait-for-handoff-output-schema-design.md`  
> Publication: deferred to the unified Slice 17–28 batch

## Global constraints

- Follow the approved design and change it first if implementation evidence changes a public decision.
- Use focused RED before production behavior.
- Migrate only direct `wait_for_handoff`; leave Slice 21 and later public contracts unchanged.
- Preserve current inputs, mode membership, read-only behavior, wait bounds, and supertool alias.
- Treat state-file artifact paths as untrusted and use only fixed filenames.
- Keep protected Smoke sources unchanged; use exact compatibility substitution.
- Do not add dependencies, arbitrary paths, write/process behavior, Phase 2 work, staging, commit, push, or CI publication.
- Finish with the user-required `neat-freak` before Slice 21.

### Task 1: Establish focused RED

- [x] Add `test/wait-for-handoff-contract.test.mjs` with MCP, temp-workspace, fake-clock, and result helpers.
- [x] Freeze the exact envelope, thirty data fields, run/artifact/unavailable schemas, warnings, and five failures.
- [x] Add strict malformed and cross-field rejection cases.
- [x] Cover modes, descriptor, real state transitions, deadlines, matching, artifacts, redaction, and limits.
- [x] Cover provider seams, Tool Card, structured preservation, supertool, compatibility, and protected sources.
- [x] Run focused RED and prove failures are missing Slice 20 behavior.

### Task 2: Add exact schema and constructors

- [x] Create `src/tools/schemas/waitForHandoff.ts`.
- [x] Define fixed paths/kinds, canonical run, exact data/error schemas, and warnings.
- [x] Enforce wait, matching, lifecycle, coverage, ordering, byte, truncation, and redaction invariants.
- [x] Add strict success/failure constructors and schema checkpoint tests.
- [x] Run Build.

### Task 3: Add bounded domain readers

- [x] Add effective wait limits and fixed raw result types in `src/workspaceOps.ts`.
- [x] Implement non-creating fixed state-file read with missing/error distinction and race checks.
- [x] Implement fixed requested-artifact reads with safe classifications and no source path trust.
- [x] Recheck actual bytes and binary content after read.
- [x] Run focused domain tests and Build.

### Task 4: Implement exact polling handler

- [x] Add state/artifact provider dependencies plus injectable clock/sleep seams.
- [x] Strictly parse canonical version-1 state and normalize only documented optional fields.
- [x] Implement immediate read, match logic, deadline-aware sleeps, and terminal artifact loading.
- [x] Build bounded UTF-8 excerpts, log tailing, redaction, exact counters, and stable failures.
- [x] Advertise the exact schema and preserve structured content.
- [x] Run focused tests and Build.

### Task 5: Migrate consumers

- [x] Add a nested-first dedicated bounded `wait_for_handoff` Tool Card.
- [x] Add exact-count protected main-Smoke compatibility substitutions.
- [x] Migrate Stress reads to nested data/artifact fields.
- [x] Prove protected Smoke sources are unchanged.
- [x] Prove supertool child-envelope preservation.
- [x] Run focused and adjacent tests.

### Task 6: Review and harden the usable result

- [x] Review lifecycle consistency, missing/invalid/read failures, match boundaries, deadline math, path trust, races, Unicode bytes, redaction expansion, provider drift, and UI bounds.
- [x] Add deliberate RED for every material issue found.
- [x] Apply minimum fixes and rerun focused/adjacent tests plus Build.
- [x] Update the design first for any public-contract change.

### Task 7: Complete local verification and `neat-freak`

- [x] Run focused/adjacent contracts, Build, complete regression, Smoke, native-Windows Stress, and package dry-run.
- [x] Run diff, protected-source, exact-scope, secret-pattern, document-reference, memory, and archive checks.
- [x] Reconcile `AGENTS.md`, `Memory.md`, master plan, historical roadmap, plan, design, and active archive.
- [x] Mark checkboxes only from fresh evidence.
- [x] Continue directly to Slice 21 without staging, committing, pushing, or CI publication.
