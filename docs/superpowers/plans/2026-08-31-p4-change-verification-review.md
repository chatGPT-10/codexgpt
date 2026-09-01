# P4 Change Verification and Review TDD Implementation Plan

Date: 2026-08-31
Status: completed locally through STEP-539 under the owner's instruction to execute P4 through completion
Design authority: `docs/superpowers/specs/2026-08-31-p4-change-verification-review-design.md`

## Goal

Turn committed mutations into one explicit, owner-bound modify -> verify -> review workflow while preserving all direct-tool counts, security gates, older contracts, and external-state boundaries.

## Constraints

- Tests precede runtime behavior changes.
- Keep direct-tool counts `28/31/39/51/52`; do not add, remove, or rename a direct tool.
- Add `verify_change` only as a V5 `codexgpt` composite action.
- Never execute verification automatically after a mutation.
- Run only current P2 `confidence=confirmed` project commands selected by bounded check category.
- Invoke the existing registered `run_command` handler so full-access, Policy, approval, audit, timeout, and redaction contracts remain mandatory.
- Keep V1-V4 schemas/descriptors exact and retain all mutation/change-set/undo semantics.
- Do not refresh Apps, deploy, publish, stage, commit, push, or change credentials, network, services, or external state.

## Task 0 - Establish RED

1. Add `test/change-workflow-service.test.mjs` for service state, owner binding, recommendations, verification pass/fail, review linkage, and budgets.
2. Add `test/change-workflow-contract.test.mjs` for strict schemas, mutation next-state projection, V5 composite action, old-version rejection, registered-child execution, Policy passthrough, and exact counts.
3. Register both tests in `scripts/test-execution-profile-manifest.mjs`.
4. Run them before implementation and retain the expected missing-module/schema failures as RED.

## Task 1 - Add workflow schemas and service

1. Add `src/workflows/changeWorkflow.ts` and `src/tools/schemas/changeWorkflow.ts`.
2. Define strict bounded workflow, recommendation, check result, verify input/output, and review-link schemas.
3. Implement server-local workflow records keyed by workspace plus change set and bound to the current owner.
4. Reuse the P2 detector through guarded manifest reads and accept only confirmed commands.
5. Compile confirmed commands into server-selected PowerShell invocations without accepting caller shell text.

## Task 2 - Project mutation next-state

1. Add V5-only mutation output schema variants with optional workflow projection fields.
2. Extract committed change-set identity and changed paths from `write`, `edit`, `apply_patch`, `move_paths`, and non-preview `undo_change_set` results.
3. Attach next-state centrally after the registered mutation handler succeeds.
4. Append one bounded textual next action without leaking paths or tokens beyond the structured result.
5. Prove previews, failures, and V1-V4 results remain unchanged.

## Task 3 - Add verify and review composition

1. Extend the V5 supertool owned-result union for `verify_change` without adding a direct tool.
2. Resolve and validate workspace, change-set, owner, requested check categories, and current confirmed commands.
3. Invoke the already registered `run_command` pipeline handler for each check.
4. Preserve Policy/approval failures; normalize terminal project check results and leave review pending.
5. Add optional V5 `show_changes.change_set_id` linkage and a bounded review result.
6. Mark workflow complete only after terminal verification and qualifying diff inspection.

## Task 4 - Compatibility, UX, and packaging

1. Update V5 descriptions, shipped prompts, README, README_ZH, design, changelog, and master plan for the new closed-loop routing.
2. Keep V1-V4 descriptor snapshots exact and update only intentional V5 metadata.
3. Add source/tests to execution-profile and package checks.
4. Verify mutation architecture inventory has no unreviewed write primitive.

## Task 5 - Final local closure

Run in order:

```powershell
npm run test:focused -- test/change-workflow-service.test.mjs test/change-workflow-contract.test.mjs <mutation/process/show_changes/pipeline compatibility tests>
node scripts/toolchain-manager.mjs matrix --major all --root $env:LOCALAPPDATA\CodexPro\toolchains -- npm run test:focused -- <selected tests>
node scripts/long-task-runner.mjs start --kind p4-final-ordinary --cwd D:\Dev\codexgpt -- node scripts/toolchain-manager.mjs matrix --major all --root $env:LOCALAPPDATA\CodexPro\toolchains -- node scripts/test-domains.mjs run --domain ordinary
node scripts/long-task-runner.mjs start --kind p4-final-smoke --cwd D:\Dev\codexgpt -- node scripts/toolchain-manager.mjs matrix --major all --root $env:LOCALAPPDATA\CodexPro\toolchains -- npm run smoke
node scripts/toolchain-manager.mjs matrix --major all --root $env:LOCALAPPDATA\CodexPro\toolchains -- npm run build
npm pack --dry-run --json
npm run policy:check
git diff --check
```

Then run added-line credential scans, exact direct-tool count/scope checks, Markdown link/UTF-8 checks, archive-size checks, mutation-inventory checks, and confirm no file is staged.

## Task 6 - Knowledge closure

1. Append STEP-538 to the active interphase archive, then append STEP-539 for the frozen final-review checklist closure without rewriting STEP-538.
2. Update `Memory.md` in place and keep it within project limits.
3. Record exact commands/results, material failed attempts, risks, rollback, unscored Web metrics, and the next gated action.
4. Run the final rule and knowledge audit.

P4 is complete only when every local gate is green and product, user guidance, memory, and append-only history agree.

Completion evidence is recorded in `Memory.md` and STEP-538/539 of `docs/memory/archive/interphase-maintenance-part-13.md`. No App refresh, deployment, publication, staging, commit, push, network, credential, or Web benchmark action was performed.
