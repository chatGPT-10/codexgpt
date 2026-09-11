# C2C Phase 5 — Single execution and independent review

Date: 2026-09-08. Scope: the owner's request to implement C2C Phase 5 after Phase 4, not the historical Core Git/worktree Phase 5. See the paired [implementation plan](../plans/2026-09-08-c2c-phase-5-execution.md).

## Contract

Support one authorized INIT → PLAN → current Codex implementation → EXECUTED → independent ChatGPT DONE/BLOCKED/ERROR exchange. The current Codex is the executor; there is no new process executor, arbitrary command interface, permission expansion, second PLAN iteration or Phase 6 recovery. Preserve existing protocol compatibility, Policy/approval and runtime capability limits. Existing Phase 4 planning-only evidence does not authorize executing that plan.

The public entry remains `node scripts/codexgpt-entry.mjs c2c session --root <absolute-root>` with bounded strict JSON stdin. `execution-start(taskId, revision)` verifies the accepted plan hash/bytes and preserves its immutable snapshot, captures a Git baseline and execution identity, and CAS-persists EXECUTING before returning executable context. The current Codex first checks original goal, repository instructions, authority and dirty changes; plan authenticity is not authority.

`execution-finish(taskId, revision, checks)` captures final Git evidence against the start baseline, records changed paths and caller-reported `{name, status, summary}` checks, and persists EXECUTED_LOCAL. Tests are performed by the current Codex, not automatically by this command. Evidence distinguishes pre-existing dirty state from final differences; it cannot establish causal attribution against concurrent external editors or account for reverted transient edits. Capture errors fail closed rather than reporting an empty successful diff.

Finish returns a canonical `report` containing task/iteration and the execution record. Codex writes it verbatim as UTF-8 to `.ai-bridge/agent-status.md` for connector review. Prepare safely rereads and exactly matches this report and recaptures the Git baseline to reject post-finish drift. `prepare-executed(taskId, revision)` uses persisted execution facts to format wire, reserves EXECUTED_SENT through CAS before returning it, and returns no new wire on replay. A crash can lose an attempted send; reservation is not delivery proof and must not trigger resending.

`observe` validates same-conversation DOM evidence from INIT_SENT or EXECUTED_SENT. After execution only DONE/BLOCKED/ERROR is accepted. DONE additionally requires at least one passed check and only passed/skipped statuses; otherwise CHECKS_NOT_PASSED prevents completion. Raw receive enforces the same single-iteration limit. Interrupted EXECUTING and uncertain delivery remain unresolved; no automatic rerun, rollback of user work or recovery transition is introduced.

## Evidence and scope

Git uses the retained fixed-path executable binding with a final identity/hash recheck, a narrowed environment and fixed read commands. Filter/include/worktree-config/promisor and submodule integrations fail closed; hooks, fsmonitor and network protocols are disabled. Each baseline keeps at most 128 dirty paths / 24,000 serialized bytes. Same-handle text fingerprints scan at most 524,288 bytes per file and 4 MiB total, independently of connector text-response limits; source bodies are never retained. Blocked paths, binary/oversized files and unsafe links fail closed. `diffSha256` hashes raw Git diff metadata, with file content and index fingerprints retained per dirty path; it is not a saved patch hash. `.ai-bridge` is excluded from implementation-change counts.

Local TDD covers snapshot integrity, baseline-relative changes including existing dirty work, persisted checks/identity, stale revision and duplicate start/finish/send rejection, restart reservation, second PLAN refusal and browser review attribution. Run relevant managed Node 20/24 tests/build/smoke, policy and diff checks; retained evidence must distinguish actual execution from simulations.

Real Gate 5 requires a fresh authorized small goal, visible INIT/PLAN exchange, actual local edit and checks, one visible EXECUTED send, and independent ChatGPT review through connector reads ending in DONE. No user-copy substitute. Absent current IAB capability leaves this gate pending even when all local gates pass. No global Skill installation, runtime redeployment, App refresh, credential/network/service mutation, publication or new execution authority follows from implementation.

Rollback the additive Phase 5 code and workflow only, preserving existing dirty work, sessions, profiles and audit evidence. Do not replay an old in-flight session after rollback.
