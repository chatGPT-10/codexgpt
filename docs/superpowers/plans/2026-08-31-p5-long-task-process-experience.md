# P5 Long-Task and Process Experience Implementation Plan

## Scope

Implement only the additive V5 lifecycle projection and the missing truthful startup state. Reuse the existing process manager, output ring/cursor/quota, Windows host, Policy/approval/audit path, and joinable cleanup.

## Task 1 — Freeze the contract with RED tests

- Add `test/process-experience-contract.test.mjs`.
- Require the shared five-state enum and equal V5 `state`/`status` aliases.
- Require V3/V4 strict rejection of the additive V5 field.
- Require the V5 supertool map to use the V5 process schemas without changing tool counts.
- Observe a delayed backend as `starting`, then `running` only after startup completes.
- Revoke a delayed start and prove close waits for and terminates the eventual handle.

## Task 2 — Add the V5 schema projection

- Export the shared `ProcessState` schema/type from `src/tools/schemas/execution.ts`.
- Add strict V5 data, output-shape, and output-schema variants for all process tools.
- Keep the existing V3/V4 schemas byte-for-byte compatible in accepted keys.
- Override only process entries in `CODEXGPT_CHILD_OUTPUT_SCHEMAS_V5`.

## Task 3 — Make startup state truthful

- Create persistent records as `starting`.
- Permit output, exit, termination, revocation, and lifecycle joins during startup.
- Transition to `running` only after backend handle acquisition and required start audit.
- Project V5 `state` plus the equal compatibility `status`; hide starting records from legacy V3/V4 list projections.
- Project the same V5 state from bounded `run_command` terminal results and retained output reads.

## Task 4 — Align model and user guidance

- Keep `run_command` for bounded test/build/lint/typecheck-style commands.
- Keep `start_process` for servers, watchers, REPLs, and interactive terminals.
- Document the V5 canonical state, compatibility alias, cursor loop, explicit termination, and ambient-authority boundary.
- Update the active roadmap/changelog without claiming App/Web evidence.

## Task 5 — Verify and close

1. Run the new RED test before implementation.
2. Run the narrow process contract/manager/ring/cursor/runtime tests.
3. Run managed Node 20/24 focused tests.
4. Run build and package checks.
5. Freeze source, then run detached ordinary and smoke domains on both managed majors.
6. Run `npm run policy:check`, `git diff --check`, credential scan, tool-count/scope checks, and archive-size checks.
7. Append the full STEP record and update `Memory.md`.

No staging, commit, push, publication, App refresh, Web benchmark, credential/network mutation, service install, or deployment is part of this plan.
