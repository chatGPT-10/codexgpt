# Direct `handoff_to_agent` Output Schema Implementation Plan

> Date: 2026-07-13  
> Phase: 1, Slice 23  
> Design: `docs/superpowers/specs/2026-07-13-handoff-to-agent-output-schema-design.md`  
> Status: locally complete, post-result reviewed, `neat-freak` reconciled, and unpublished  
> Publication: deferred to the unified Slice 17–28 batch

## Global constraints

- Follow the approved design and update it first if evidence changes a public decision.
- Use focused RED before production behavior.
- Migrate only direct `handoff_to_agent`; keep direct `handoff_to_codex` flat until Slice 24.
- Preserve all seven inputs, visibility/mode behavior, planning-only semantics, fixed paths, supertool alias, and shell-safe hints.
- Complete request and output preflight before the first scaffold, plan, or log write.
- Bind success to the exact plan artifact and identical deterministic event tails on both logs.
- Keep protected Smoke sources unchanged through exact fail-closed compatibility substitution.
- Do not add execution, process management, arbitrary output paths, transaction claims, Policy Kernel behavior, staging, commit, push, publication, or CI.
- Finish with the user-required `neat-freak` before Slice 24.

### Task 1: Establish focused RED

- [x] Add `test/handoff-to-agent-contract.test.mjs` with schema, MCP, temp-workspace, provider, Tool Card, supertool, protected-source, and native-Stress helpers.
- [x] Freeze the six-field envelope, thirty-six data fields, one warning, and fifteen stable failures.
- [x] Cover descriptor/modes/defaults, request preparation, no-write preflight, meaningful-prior-plan append semantics, bytes/hash/diff/event/prompt integrity, and scaffold ordering.
- [x] Cover strict provider drift, missing/mismatched disk plan, mismatched log tails, bounded nested Tool Card, shell quoting, direct-supertool preservation, protected compatibility, and Slice 24 isolation.
- [x] Run focused RED and prove failures are absent Slice 23 behavior.

### Task 2: Add exact schema and constructors

- [x] Create `src/tools/schemas/handoffToAgent.ts`.
- [x] Define safe identities/paths/timestamps, exact data/error/output schemas, fixed warning, and fixed path definitions.
- [x] Enforce append equations, fixed ordered scaffold/log paths, byte/hash/diff/prompt/event invariants, and envelope exclusivity.
- [x] Add strict success/failure constructors and warning derivation.
- [x] Run focused schema checkpoints and Build.

### Task 3: Prepare and harden the domain

- [x] Create `src/handoffOps.ts` with typed immutable request preparation and fixed output preflight.
- [x] Normalize agent/name/model/title, inject one timestamp, build plan/prompt/event deterministically, and reject invalid/oversize/secret requests before writes.
- [x] Preflight all fixed paths, read the prior plan safely, distinguish scaffold placeholder from a meaningful plan, and calculate actual append semantics.
- [x] Write scaffold, plan, and identical log events while returning exact pre-call diff, plan/event hashes, prompt bytes, and created paths.
- [x] Keep a compatibility wrapper for Slice 24 without changing its public flat contract.
- [x] Run focused domain tests and Build.

### Task 4: Implement exact handler and provider boundary

- [x] Add `handoffToAgentProvider` and deterministic clock dependencies over the prepared request/output.
- [x] Classify workspace/request/path/existing-plan/plan/scaffold/log/provider failures without unsafe details.
- [x] Strictly validate provider identity, request echo, fixed paths/order, append equations, counts, bytes, hashes, diff marker, event, and prompt.
- [x] Reopen the actual plan and both log tails and require exact provider agreement before success.
- [x] Construct exact data/warnings, bounded human text, MCP error semantics, output descriptor, and structured-preservation metadata.
- [x] Run focused tests and Build.

### Task 5: Migrate consumers

- [x] Add a nested-first bounded `handoff_to_agent` Tool Card while retaining flat `handoff_to_codex` fallback.
- [x] Add the exact-count protected main-Smoke compatibility substitution; leave protected Smoke sources unchanged.
- [x] Migrate native Stress to validate the nested supertool child envelope.
- [x] Preserve shell-quoted MCP text behavior and all fixed scaffold checks.
- [x] Prove `handoff_to_codex` remains flat and direct supertool child-envelope preservation holds.
- [x] Run focused and adjacent tests.

### Task 6: Review and harden the usable result

- [x] Review preflight ordering, placeholder detection, UTF-8/secret limits, Windows path containment, symlink/junction races, pre-call diff semantics, partial multi-file failure, log-tail integrity, JSONL framing, shell quoting, provider drift, and UI bounds.
- [x] Add deliberate RED for every material issue found.
- [x] Apply minimum fixes and rerun focused/adjacent tests plus Build.
- [x] Reconcile the design first if a public decision changes.

### Task 7: Complete local verification and `neat-freak`

- [x] Run focused/adjacent contracts, Build, complete regression, Smoke, native-Windows Stress, and package dry-run.
- [x] Run diff, protected-source, exact-scope, secret-pattern, document-reference, memory, archive, and Git-index checks.
- [x] Reconcile `AGENTS.md`, `Memory.md`, master plan, historical roadmap, plan, design, and active archive.
- [x] Mark checkboxes only from fresh evidence.
- [x] Continue directly to Slice 24 without staging, committing, pushing, publication, or exact-head CI.
