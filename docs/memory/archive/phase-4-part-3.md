# Phase 4 Windows execution and sandbox archive - Volume 3

This append-only continuation starts after STEP-325. Phase 4 remains locally unpublished. New implementation records begin with Task 4A8.

## STEP-326 — Close Phase 4A8 persistent process ownership and lifecycle

**Date:** 2026-07-17
**Status:** Complete locally; unpublished

**Goal**

Implement persistent pipe processes with exact ownership, per-input approval, lifecycle audit, bounded output/terminal retention, exact revocation, and local emergency termination without claiming sandbox or broker-escape resistance.

**Files changed**

- `src/process/processManager.ts`
- `src/process/processAuditCoordinator.ts`
- `src/process/windowsPersistentBackend.ts`
- `src/process/commandCompiler.ts`
- `src/process/outputQuota.ts`
- `src/process/streamingRedactor.ts`
- `src/process/runCommand.ts`
- `src/productionRuntime.ts`
- `src/policy/executionResources.ts`
- `src/policy/runtime.ts`
- `src/control/runtime.ts`
- `src/control/windowsLocalControl.ts`
- `src/tools/schemas/execution.ts`
- `src/server.ts`
- `scripts/windows-process-host.cs`
- `scripts/windows-process-host-manifest.json`
- `scripts/windows-native-api-inventory-v1.json`
- `scripts/codexpro.mjs`
- `scripts/test-domains.mjs`
- `test/process-manager.test.mjs`
- `test/process-lifecycle-windows-control.test.mjs`
- `test/persistent-process-production-windows-control.test.mjs`
- `test/process-local-control-cli.test.mjs`
- `test/policy-v3-approval-integration.test.mjs`
- `test/run-command-contract.test.mjs`
- `test/backend-discovery.test.mjs`
- `test/windows-process-host-control.test.mjs`
- related Phase 4 audit, output, package, production, and domain contract tests

**Implementation summary**

- Added one `ProcessManagerV3` and lifecycle-audit coordinator per production runtime. Public process IDs and safe-integer generations are random; context fingerprints bind server, contract, policy, evidence, transport session, and identity without exposing host PID, command, root, or input.
- Added persistent native pipe operations over the manifest-bound Windows host with creation-time Job and exact handle-list ownership. Start requires execute, manage, persistent, and full-access scopes; every input is a fresh exact R3 action, while owner-checked reads, lists, and resize descriptions remain R0.
- Added redaction-before-retention, independent active/terminal quotas, oldest-terminal eviction, five-minute retention, exact crash/expiry/termination lifecycle events, and cleanup evidence. Termination flushes buffered redactor tails; host-loss during termination closes the public handle as failed and records `host_crashed` plus `cleanup_completed`.
- Added local server-owned process listing/termination that remains usable after the remote transport context changes and is not blocked by an unavailable remote audit path. Production shutdown now terminates managed processes before closing root admission, local approval/control, and the native host.
- Repaired PowerShell backend identity so the exact approved executable path is carried into both one-shot and persistent host requests and re-opened/verified by the native host. Persistent PowerShell closes its private bootstrap stdin so the initial script actually runs; stdout/stderr are drained to EOF before the terminal handle is retired.
- Preserved truthful authority: results expose the real backend digest plus `job_object_members_only` and `broker_escape_resistance: none`; WMI/COM/scheduler/service escapes remain outside the lifetime guarantee.

**Verification commands**

- `npm run build`
- `node --test test/process-manager.test.mjs test/policy-v3-approval-integration.test.mjs`
- `node --test test/backend-discovery.test.mjs test/process-manager.test.mjs test/policy-v3-approval-integration.test.mjs test/native-host-architecture.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs`
- `node scripts/long-task-runner.mjs start --kind phase4a8-ordinary --cwd D:\Dev\codexpro -- node scripts/toolchain-manager.mjs matrix --major all -- node --test test/process-manager.test.mjs test/policy-v3-approval-integration.test.mjs test/run-command-contract.test.mjs test/process-output-quota.test.mjs test/process-output-ring.test.mjs test/process-output-cursor.test.mjs test/streaming-redaction.test.mjs test/backend-discovery.test.mjs test/native-host-architecture.test.mjs test/package-contents.test.mjs test/production-runtime-integration.test.mjs test/audit-lifecycle-v3.test.mjs test/phase-4-v3-audit-persistence.test.mjs test/test-domain-classification.test.mjs`
- independent hidden native PowerShell control run `task4a8-control-20260717T062059767Z`: managed Node 20/24 over `test/windows-process-host-control.test.mjs`, `test/process-lifecycle-windows-control.test.mjs`, `test/persistent-process-production-windows-control.test.mjs`, and `test/process-local-control-cli.test.mjs`
- independent hidden native PowerShell control run `task4a8-control-final-20260717T062545561Z`: managed Node 20/24 over the final lifecycle, production, and local-control tests
- `npm run policy:check`
- `git diff --check`
- scoped changed-file secret-pattern scan with explicit classification of fixed redaction fixtures and `task-worktree-*` filename false positives

**Verification results**

- Build passed.
- Focused ordinary run `2026-07-17T04-24-41-927Z-phase4a8-ordinary-7c867a27` passed 51/51 on Node 20.20.2 and 51/51 on Node 24.15.0 with zero failures or skips.
- Broad native control run passed 13/13 on each managed runtime. After the final manager/shutdown repairs, the fresh control run passed 3/3 on each runtime with zero failures or skips.
- Native semantic inventory, production manifest/package, policy, domain partition, and diff checks passed.
- Secret scan found zero unclassified values. Five `task-worktree-*` filenames matched the naive `sk-` prefix pattern and two fixed Bearer placeholders were intentional redaction-test fixtures.

**Decisions made**

- Local emergency control is server-owned rather than transport-context-owned; remote MCP ownership checks remain exact and return uniform `PROCESS_NOT_FOUND`.
- Terminal-cap pressure evicts the oldest terminal record instead of failing after process exit and leaking an unretained record.
- Runtime policy/evidence are immutable snapshots. Their replacement occurs through runtime quiesce/disposal; `revokeAll` provides explicit policy/evidence/lease/transport transitions for lifecycle coordinators without introducing a process-global manager.
- PowerShell source stays off argv, but the exact approved executable path is now an authenticated request field and native identity input.

**Risks or limitations**

- Persistent `full_access` is ambient current-user authority, not a sandbox. Only recorded Job members are controlled; brokered escapes are neither prevented nor searched for.
- Pipe-mode interrupt remains unsupported. Interactive input, ETX delivery, resize, and close-order semantics are Task 4A9.
- Confirmed-root default activation still lacks the built-in stable Windows identity oracle. Sandbox authority remains unavailable.
- Lifecycle audit failure during ordinary remote termination remains a surfaced operation failure after best-effort process cleanup; local emergency termination deliberately prioritizes exact owned-process cleanup when the remote audit request path is unavailable.

**Rollback method**

- Before Phase 4 publication, revert only the scoped Task 4A8 source/test/manifest changes and remove its new untracked files. No user configuration, credentials, workspaces, or Git history require mutation.
- Runtime rollback to the prior published head removes persistent handlers while retaining V3 audit readers and existing one-shot terminal records.

**Next step**

Execute Task 4A9 ConPTY and interactive semantics. Do not stage, commit, push, or publish at this task boundary.

## STEP-327 — Neat-freak reconciliation after Phase 4A8

**Date:** 2026-07-17
**Status:** Complete locally; unpublished

**Goal**

Reconcile project rules, authoritative plans, concise memory, archive evidence, runtime shutdown ordering, and next-task routing against the verified 4A8 implementation.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `docs/memory/archive/phase-4-part-3.md`
- `src/productionRuntime.ts`

**Implementation summary**

- Advanced every active checkpoint from 4A8 to 4A9 and replaced the stale “persistent lifecycle unavailable” limitation with the exact remaining ConPTY/sandbox limitations.
- Kept `Memory.md` concise and linked the exact ordinary/control evidence rather than duplicating the full implementation narrative.
- Moved production resource disposal into the verified order: quiesce, terminate managed processes, close root admission/local control, then close execution/native-host state and durable stores.
- Confirmed the active archive volume remains far below its rollover threshold.

**Verification commands**

- `npm run build`
- `npm run policy:check`
- `node --test test/process-manager.test.mjs test/production-runtime-integration.test.mjs test/native-host-architecture.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs`
- `git diff --check`
- Markdown local-link validation and `Memory.md` line/byte limit check

**Verification results**

- Pending fresh post-reconciliation governance run; results are appended as a correction entry if any statement changes.

**Decisions made**

- Task-level publication remains prohibited. The next implementation boundary is exactly Task 4A9.
- Archive detail remains append-only; the concise root memory stores only current state, final evidence, limitations, and next action.

**Risks or limitations**

- Documentation is only authoritative if the pending fresh governance run passes; a failure must be fixed before 4A9 implementation proceeds.

**Rollback method**

- Revert only the STEP-327 documentation/checkpoint edits and the process-first disposal-order change. Leave STEP-326 archive history unchanged and append a correction if necessary.

**Next step**

Pass the fresh neat-freak governance run, then begin Task 4A9.

### STEP-327 verification addendum

The fresh post-reconciliation run passed:

- `npm run build`
- `npm run policy:check`
- 32/32 focused governance, production, process-manager, package, native-inventory, domain, and authentication-documentation tests
- `git diff --check`
- `Memory.md`: 122 lines and 17,563 bytes; active archive volume remained below the rollover threshold
- independent native run `task4a8-neat-control-20260717T062919441Z`: production persistent-process shutdown passed 1/1 on managed Node 20.20.2 and 1/1 on managed Node 24.15.0

STEP-327 is verified complete. Task 4A9 is now the exact next action.

## STEP-328 — Close Phase 4A9 ConPTY and interactive semantics

**Date:** 2026-07-17
**Status:** Complete locally; unpublished

**Goal**

Add interactive PowerShell through an isolated Job-owned ConPTY worker without conflating input delivery, target survival, sandboxing, or human-presence claims.

**Files changed**

- `src/process/windowsPersistentBackend.ts`
- `src/process/windowsHostClient.ts`
- `src/process/types.ts`
- `scripts/windows-process-host.cs`
- `scripts/windows-conpty-worker.ps1`
- `scripts/windows-process-host-manifest.json`
- `scripts/windows-native-api-inventory-v1.json`
- `scripts/repository-policy.mjs`
- `scripts/test-domains.mjs`
- `test/process-conpty-contract.test.mjs`
- `test/conpty-close-order-windows-control.test.mjs`
- `test/backend-discovery.test.mjs`
- `test/native-host-architecture.test.mjs`
- `test/test-domain-classification.test.mjs`

**Implementation summary**

- Added manifest-bound persistent ConPTY PowerShell with exact executable identity, `-NoProfile`, script delivery through the terminal rather than argv or the one-shot stdin bootstrap, one UTF-8 terminal stream, bounded resize, ETX delivery, and Job-member-only cleanup.
- Isolated `ClosePseudoConsole` fatality inside the worker so a close watchdog failure cannot kill the unrelated authenticated host. The host starts the worker inside its creation-time Job and verifies the target image and inherited Job membership.
- Replaced post-start worker-stdin control after PowerShell `-File` exposed EOF with a random 256-bit named-pipe name plus an independent 256-bit control key. Both values remain inside the authenticated host request and process memory; every command uses a random request ID and exact schema.
- Preserved the distinction between delivery and survival: ETX reports delivery, while the target may remain running or exit. Pipe-mode interrupt remains unsupported and does not terminate the process.

**Verification commands**

- `npm run build`
- `node --test test/process-conpty-contract.test.mjs test/backend-discovery.test.mjs test/native-host-architecture.test.mjs test/test-domain-classification.test.mjs`
- `npm run policy:check`
- `node scripts/long-task-runner.mjs start --kind phase4a9-ordinary --cwd D:\Dev\codexpro -- node scripts/toolchain-manager.mjs matrix --major all -- node --test test/process-conpty-contract.test.mjs test/backend-discovery.test.mjs test/native-host-architecture.test.mjs test/windows-process-host-protocol.test.mjs test/test-domain-classification.test.mjs test/package-contents.test.mjs`
- independent hidden native PowerShell control run `task4a9-control-final-20260717T065004185Z`: managed Node 20/24 over `test/conpty-close-order-windows-control.test.mjs`

**Verification results**

- Build, repository policy, production manifest, native semantic inventory, package, protocol, and domain gates passed.
- Ordinary run `2026-07-17T04-49-27-200Z-phase4a9-ordinary-e5fce4f3` passed 17/17 on Node 20.20.2 and 17/17 on Node 24.15.0 with zero failures or skips.
- Independent control passed 1/1 on each managed runtime. It proved worker-fatal close isolation, initial and subsequent UTF-8 terminal I/O, resize, ETX delivery, terminal-only output, terminate/input/resize race convergence, and exact cleanup.
- The first named-pipe control run delivered input and ETX but asserted output after ETX; review corrected the test to prove UTF-8 input completion before sending ETX, matching the specified delivery/survival distinction.

**Decisions made**

- The initial worker configuration remains on private inherited stdin, but all post-start commands use the authenticated private named pipe because PowerShell `-File` closes inherited stdin after reading its script.
- ConPTY remains ambient current-user `full_access`. The unguessable pipe/key authenticates the private protocol but is not described as a same-user sandbox boundary.
- Resize is R0 owner-checked state control; every input description remains exact R3 and will traverse the shared production policy handler at the 4A10 integration gate.

**Risks or limitations**

- ConPTY provides terminal semantics, not filesystem, credential, registry, network, device, or broker-escape isolation.
- Same-user unrestricted code could attack same-user resources; the random pipe/key prevents accidental or unauthenticated protocol use but does not create a security boundary against already-unrestricted code.
- ETX is delivered as byte `0x03`; target behavior after delivery is intentionally not guaranteed.
- The built-in confirmed-root identity oracle and offline workspace sandbox remain unavailable.

**Rollback method**

- Before Phase 4 publication, remove the ConPTY backend/test/worker additions and restore the prior manifest digest. No user configuration, credentials, workspaces, or Git history require mutation.

**Next step**

Run neat-freak reconciliation, then execute Task 4A10 integration closure. Do not stage, commit, push, or publish at this task boundary.

## STEP-329 — Neat-freak reconciliation after Phase 4A9

**Date:** 2026-07-17
**Status:** Complete locally; unpublished

**Goal**

Reconcile project rules, authoritative plans, concise memory, archive evidence, manifest/inventory authority, and next-task routing against the verified ConPTY implementation.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `docs/memory/archive/phase-4-part-3.md`

**Implementation summary**

- Advanced all active checkpoints from 4A9 to 4A10 and replaced stale “ConPTY unavailable” text with the exact remaining confirmed-root-oracle and sandbox limitations.
- Kept the root memory below its hard limits by compressing the current-state summary and rotating recent summaries instead of copying the archive narrative.
- Rechecked the source-shipped worker, C# host, production manifest hashes, native semantic inventory, package contents, test-domain classification, and ordinary/control evidence.
- Confirmed the active archive remains below its rollover threshold.

**Verification commands**

- `npm run build`
- `npm run policy:check`
- focused governance/ConPTY tests
- `git diff --check`
- Markdown local-link validation, secret-pattern classification, and `Memory.md` line/byte checks

**Verification results**

- Pending fresh post-reconciliation governance run; an addendum records the exact result before Task 4A10 begins.

**Decisions made**

- Task-level publication remains prohibited. Task 4A10 is the sole next implementation boundary.
- Named-pipe authentication is documented as private protocol integrity, not a same-user isolation guarantee.

**Risks or limitations**

- Documentation is authoritative only after the fresh governance run passes. Any failure must be fixed before 4A10 implementation.

**Rollback method**

- Revert only the STEP-329 checkpoint/documentation edits. Leave STEP-328 append-only history unchanged and append a correction if a recorded fact changes.

**Next step**

Pass the fresh neat-freak governance run, then begin Task 4A10.

### STEP-329 verification addendum

The fresh post-reconciliation gate passed:

- `npm run build`
- `npm run policy:check`
- 17/17 focused ConPTY, manifest, inventory, protocol, package, and domain tests
- managed ordinary run `2026-07-17T04-54-43-373Z-phase4a9-neat-ordinary-f5510b7a`: 17/17 on Node 20.20.2 and 17/17 on Node 24.15.0
- independent native run `task4a9-neat-control-20260717T065459575Z`: real ConPTY lifecycle passed 1/1 on each managed runtime with process exit code 0
- `git diff --check`
- all 48 local links across 107 tracked Markdown files resolved
- scoped secret scan classified 20 syntactic hits as 15 `task-worktree-*` filename matches, three fixed test fixtures, and two documentation-wording matches; zero hits were unclassified
- `Memory.md`: 124 lines and 17,962 bytes; active archive remained below the rollover threshold

The first post-reconciliation build exposed TypeScript control-flow narrowing at the ConPTY ready-failure cleanup because the socket assignment occurs inside an event callback. The repair moved socket destruction behind one closure shared by all cleanup paths; the fresh build and both managed runtime gates then passed. STEP-329 is verified complete and Task 4A10 is now the exact next action.

## STEP-330 — Close Phase 4A10 integration and complete Phase 4A

**Status**

Complete locally, adversarially reviewed, uncommitted, unpushed, and unpublished.

**Goal**

Prove that complete Phase 4A has one live direct/supertool production path, no hidden compatibility or invalid-mode execution bypass, exact V1/V2 wire compatibility, truthful diagnostics and authority warnings, complete failure cleanup, and full managed Windows Node 20/24 ordinary/control evidence.

**Files changed**

- `scripts/codexpro.mjs`
- `scripts/long-task-runner.mjs`
- `scripts/phase-4a-smoke.mjs`
- `src/process/authority.ts`
- `src/process/processManager.ts`
- `src/process/runCommand.ts`
- `test/fixtures/phase-4a-integration-imports.ts`
- `test/handoff-to-agent-contract.test.mjs`
- `test/handoff-to-codex-contract.test.mjs`
- `test/local-control-pipe-windows-control.test.mjs`
- `test/operational-reliability.test.mjs`
- `test/phase-4a-adversarial.test.mjs`
- `test/phase-4a-integration.test.mjs`
- `test/phase-4a-smoke.test.mjs`
- `test/process-manager.test.mjs`
- `test/run-command-contract.test.mjs`
- `test/runner-stop-identity-windows-control.test.mjs`

**Implementation summary**

- Added a registered Phase 4A smoke that freezes exact V1=28, V2=31, V3=39 and every manifest-bound C#/PowerShell/worker/protocol digest.
- Proved direct and supertool execution traverse one live policy and handler path and that production constructs exactly one shared native host, execution runtime, process manager, lifecycle audit coordinator, and persistent backend.
- Added adversarial tests for hidden `start_process` aliases, invalid V3 legacy/shadow/best-effort modes, AppContainer local-approval rejection, start-failure cleanup, truthful ambient-authority warnings, and absence of sandbox or unforgeable human-presence claims.
- Split doctor output into backend, Job ownership, ConPTY, approval pipe, confirmed roots, full access, and sandbox evidence without changing frozen V1/V2 tool schemas.
- Centralized exact full-access authority and warning facts for one-shot and persistent results.
- Made exact Windows runner stopping retry a bounded transient `taskkill` failure while revalidating the same PID creation time before every retry. Moved the real process-tree termination oracle from ordinary to the registered control domain; ordinary retains only injectable exact-PID behavior.
- Reordered the two handoff control tests to load `handoffOps.ts` before `server.ts`, preventing a Node 20 `tsx/esm/api` duplicate-module cache spin. Raised only the bounded read-only CIM command-line evidence timeout from 10 to 30 seconds after the full control load proved the prior ceiling insufficient.

**Verification commands**

- `npm run build`
- `npm run policy:check`
- `node --test test/phase-4a-integration.test.mjs test/phase-4a-adversarial.test.mjs test/phase-4a-smoke.test.mjs test/test-domain-classification.test.mjs test/package-contents.test.mjs test/mutation-architecture.test.mjs`
- `node --test test/phase-4-v3-inherited-contract.test.mjs test/phase-4-contract-v3.test.mjs`
- `node scripts/long-task-runner.mjs start --kind phase4a10-ordinary-final --cwd D:\Dev\codexpro -- node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain ordinary`
- Independent hidden native PowerShell: `node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain control`, with `CODEXPRO_ALLOW_CONTROL_DOMAIN_TESTS=1` scoped only inside the proven independent child terminal.
- `git diff --check`
- Markdown local-link scan
- Scoped secret-pattern scan with matched values suppressed

**Verification results**

- Build and repository policy passed.
- Focused integration/adversarial/smoke/domain/package/mutation gate passed 17/17.
- Frozen inherited-contract gate passed 11/11 and retained exact V1=28, V2=31, V3=39.
- Ordinary run `2026-07-17T05-28-50-651Z-phase4a10-ordinary-final-c79da322` exited 0. Node 20.20.2 ran 873 tests with 872 pass, one platform skip, zero failures; Node 24.15.0 produced the same counts.
- Independent control run `task4a10-control-final-pass-20260717T080357854Z` exited 0. Node 20.20.2 passed 99/99; Node 24.15.0 passed 99/99.
- `git diff --check` passed. All 48 local links across 114 repository Markdown files resolved. The scoped secret-pattern scan found only two fixed rejection/redaction fixture files; zero files were unclassified.

**Decisions made**

- Do not add diagnostics fields to `server_config`: the attempted addition changed frozen V1/V2 descriptor and call hashes and was fully reverted. CLI doctor is the diagnostics surface.
- Destructive process-tree termination is control-domain evidence and must never run inside the detached runner being proved.
- A fresh local R3 record is required for every full-access start, but only the initial start with no pre-existing unrestricted same-user code may be described as following a human action. Later records are not unforgeable human-presence proof.
- Phase 4A is a complete usable local checkpoint, not a Phase 4 publication boundary.

**Risks or limitations**

- Ambient `full_access` remains current-user unrestricted authority with no filesystem, credential, registry, network, broker-escape, or host-writeback isolation. Only recorded Job members are lifecycle-controlled.
- The built-in stable Windows confirmed-root identity oracle remains unavailable; confirmed-root admission is not default-active.
- Sandbox authority remains unavailable and Phase 4B has not started.
- Phase 4A remains a large dirty, unpublished worktree. No exact-head CI exists until complete Phase 4 is staged, committed, and published at its approved boundary.

**Rollback method**

- Revert the STEP-330 runtime/test changes as one local unit while retaining earlier append-only Phase 4 records. Do not weaken V1/V2 wire, mutation inventory, native manifest, or control-domain classification.

**Next step**

Run neat-freak reconciliation for the complete Phase 4A checkpoint, then stop the current goal without beginning Phase 4B or publishing.

## STEP-331 — Neat-freak reconciliation at the complete Phase 4A checkpoint

**Status**

Implementation and documentation reconciliation complete; final post-reconciliation governance verification pending in the addendum below.

**Goal**

Align project rules, active plans, concise memory, archive routing, current limitations, and the user-visible stopping boundary with the verified complete Phase 4A runtime.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `docs/memory/archive/phase-4-part-3.md`

**Implementation summary**

- Advanced every active checkpoint from “4A10 next” to “complete Phase 4A locally closed and unpublished.”
- Preserved the complete-Phase-4 publication boundary and historical continuous authorization while recording that the current goal stops at 4A and Phase 4B has not started.
- Reconciled exact integration evidence, truthful ambient-authority limitations, confirmed-root-oracle absence, sandbox absence, Node 20 duplicate-module loader behavior, ordinary/control partitioning, and next-action routing.
- Kept the active Phase 4 archive append-only and retained all failed gate attempts and repairs.

**Verification commands**

- Pending fresh post-reconciliation build, policy, focused governance, diff, link, secret, and memory/archive size checks.

**Verification results**

- Pending addendum.

**Decisions made**

- Do not stage, commit, push, publish, start Phase 4B, or modify Phase 5 runtime at this checkpoint.
- Treat complete Phase 4A as a verified usable result while preserving the stricter rule that Phase 4 closes only after complete Phase 4 publication and exact-head CI.

**Risks or limitations**

- Documentation is authoritative only after the fresh post-reconciliation governance gate passes.
- The current worktree remains intentionally unpublished and therefore has no exact-head CI evidence.

**Rollback method**

- Revert only STEP-331 checkpoint/documentation edits. Leave STEP-330 and all earlier append-only history unchanged; append a correction if a recorded fact later changes.

**Next step**

Pass the fresh neat-freak governance gate, record its exact addendum, and end the current goal at the complete Phase 4A checkpoint.

### STEP-331 verification addendum

The fresh post-reconciliation governance gate passed:

- `npm run build`
- `npm run policy:check`
- 28/28 Phase 4A integration, adversarial, smoke, domain, package, mutation-inventory, and frozen V1/V2/V3 contract tests
- `git diff --check`
- all 48 local links across 114 repository Markdown files resolved
- scoped secret-pattern scan found only the two fixed rejection/redaction fixture files already classified in STEP-330; zero files were unclassified
- no active `AGENTS.md`, `Memory.md`, master-plan, Phase 4 spec, or Phase 4 plan text still routes to “Task 4A10 next”
- `Memory.md`: 123 lines and 18,084 bytes, below the practical 18 KiB limit
- active archive: 28,021 bytes before this addendum, below the 144 KiB rollover threshold

STEP-331 is verified complete. Complete Phase 4A is locally closed, adversarially reviewed, uncommitted, unpushed, and unpublished. The current goal ends at this checkpoint; Phase 4B has not started.

## STEP-332 — Implement and adversarially close Task 4B0 with Gate S blocked

**Date:** 2026-07-17
**Status:** Task 4B0 implementation and adversarial repair complete locally; Gate S blocked; unpublished

**Goal**

Build a Windows-native, nonpersistent restricted-identity and attack oracle that either proves the exact offline `workspace` isolation claim or fails closed with classified evidence, with special emphasis on detecting high-risk network escape.

**Files changed**

- `scripts/windows-sandbox-attack-probe.cs`
- `scripts/windows-sandbox-cleanup.ps1`
- `scripts/windows-sandbox-spike.cs`
- `scripts/windows-sandbox-spike.mjs`
- `scripts/windows-sandbox-spike.ps1`
- `scripts/windows-native-api-inventory-v1.json`
- `scripts/test-domains.mjs`
- `scripts/.npmignore`
- `test/fixtures/sandbox-attacks/backend-powershell.ps1`
- `test/fixtures/sandbox-attacks/backend-node.mjs`
- `test/fixtures/sandbox-attacks/backend-git-bash.sh`
- `test/windows-sandbox-capability.test.mjs`
- `test/windows-sandbox-control.test.mjs`
- `test/package-contents.test.mjs`
- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `docs/memory/archive/phase-4-part-3.md`

**Implementation summary**

- Created a unique ephemeral AppContainer profile, collision oracle, child/host token evidence, candidate LPAC probe, creation-time Job ownership, backend probes, protected-surface attack matrix, crash/partial-spawn tests, and authenticated cleanup evidence without changing firewall, WFP, services, tasks, shared runtime ACLs, or other persistent host state.
- Replaced the original monolithic attack process with one dedicated identity process plus one independently bounded AppContainer/Job process per attack key. A WMI, COM, DNS, HTTP, or socket hang now contaminates only its exact Job and becomes a fail-closed partial result.
- Bound every network acceptance result to exact `status=denied`, `classification=wsaeacces`, and code `10013`; timeout, refusal, DNS failure, unreachable routing, WebException, partial output, and missing evidence cannot satisfy Gate S.
- Repaired the UDP oracle so a successful `Send` is immediately classified as `allowed`; a later receive timeout can no longer hide outbound datagram escape.
- Replaced unstable remote-reachability positive controls with independently successful local protocol/address-family controls while retaining separate DNS, DoH, direct HTTP, and proxy controls.
- Verified cleanup of exact Jobs, descendants, AppContainer profile, private tree, protected registry fixture, named objects, and ACL targets. Gate-only sources are excluded from the npm package.
- Adversarial review found and repaired four P1 classes: status-only network denial, UDP send masking, non-cancellable single-process probes, and false remote positive controls. A second review found no path that can project the fresh blocked evidence to an available `workspace` or fall back to `full_access`.

**Verification commands**

- `node --test test/windows-sandbox-capability.test.mjs`
- `npm run build`
- `node --test test/native-host-architecture.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs`
- detached control run `2026-07-17T11-55-45-438Z-phase4b0-adversarial-control-174b5afa`: `node --test test/windows-sandbox-control.test.mjs`
- `node scripts/toolchain-manager.mjs matrix --major all -- node --test test/windows-sandbox-capability.test.mjs test/native-host-architecture.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs`
- `npm run policy:check`
- raw evidence run `2026-07-17T11-53-27-420Z-phase4b0-adversarial-evidence-73e20038`: `node scripts/windows-sandbox-spike.mjs`

**Verification results**

- Capability/projection/adversarial tests: 5/5 passed.
- Build: passed.
- Native API inventory, package boundary, and test-domain tests: 6/6 passed.
- Managed Node `20.20.2`: 11/11 passed; managed Node `24.15.0`: 11/11 passed.
- Detached Windows control test: 1/1 passed in about 31 seconds; it proved complete fail-closed evidence emission rather than sandbox availability.
- Repository operational policy: passed.
- Raw evidence returned `result=blocked`. Identity and cleanup were complete, but the current host did not satisfy the isolation claim.
- The oracle proved a real network escape: UDP sends succeeded for every tested IPv4/IPv6 loopback, private, link-local, public, and multicast class. TCP private/link-local/public probes were denied with exact `WSAEACCES(10013)`, but TCP loopback timed out; DNS/DoH and direct/proxy HTTP lacked exact policy-denial evidence. Service-manager and unauthorized COM probes were reachable. LPAC was backend-incompatible and the host process was elevated.

**Decisions made**

- Keep Gate S, Task 4B1, the built-in sandbox authority, and every `workspace` activation path unavailable. Do not weaken assertions or relabel timeout/unreachable results as isolation.
- Do not fall back from `workspace` to ambient `full_access`.
- Preserve the complete unpublished Phase 4A checkpoint as a usable reduced-scope candidate, but do not treat Gate S failure as automatic Phase 4 completion or publication approval.
- No stage, commit, push, exact-head CI, production deployment, elevation request, or persistent machine-state change was performed.

**Risks or limitations**

- The present AppContainer configuration is not a network sandbox for UDP on this Windows host.
- Service Control Manager and unauthorized COM access remain reachable; several network paths do not return policy-denial evidence.
- The run was elevated, candidate LPAC was backend-incompatible, Node could not be safely proved under the intended runtime ACL model, and Git Bash was unavailable to the probe.
- `test/fixtures/sandbox-attacks/invoke-probe.ps1` is an unreferenced temporary fixture from an abandoned implementation path. It is not packaged or executed and was not deleted because file deletion requires explicit user authorization.
- The Phase 4 worktree remains uncommitted, unpushed, unpublished, and without exact-head CI evidence.

**Rollback method**

- Revert only STEP-332 implementation, test, and current-state documentation changes while preserving all Phase 4A work and earlier append-only records.
- No firewall, WFP, service, scheduler, shared ACL, or other host rollback is required because the probe made no approved persistent system-state change.
- If a recorded fact changes, append a correction rather than rewriting this archive entry.

**Next step**

Do not start Task 4B1. Require an explicit Gate S architecture or reduced-scope decision. The safe architecture path must independently prove a non-elevated LPAC/AppContainer configuration with exact deny-all networking, or introduce a separately reviewed OS-level enforcement design with its own elevation, persistence, rollback, and attack gates. Otherwise retain Phase 4A plus the blocked 4B0 evidence and keep `workspace` unavailable.

### STEP-332 final evidence addendum

Fresh post-reconciliation evidence run `2026-07-17T12-07-34-189Z-phase4b0-final-evidence-78036063` completed with exit code 0 and returned `result=blocked`, reason `RESTRICTED_PROBE_DNSUDP_timeout`. It reproduced every material Gate S blocker, including successful outbound UDP sends across the tested IPv4/IPv6 address classes, reachable service-manager and unauthorized COM surfaces, and incomplete policy-denial evidence for TCP loopback, DNS/DoH, and direct/proxy HTTP. Exact Job/profile/tree/registry/object cleanup remained complete and `persistentSystemStateChanged=false`. This supersedes the earlier raw-evidence run as STEP-332's final runtime evidence without changing the blocked decision.

The final post-documentation managed matrix also included two additional regression gates for exact protected-path selection and fixture-bound abnormal-exit cleanup. Final counts are capability/adversarial 7/7 and focused Node `20.20.2`/`24.15.0` 13/13 per runtime, superseding the initial 5/5 and 11/11 counts recorded above.

### STEP-332 final closure correction

The complete ordinary domain exposed one real repository-integration defect: executable attack fixtures under `test/fixtures/sandbox-attacks/` were discovered as Node test modules. The entire directory was moved without content deletion to `fixtures/sandbox-attacks/`, all fixture-digest and copy references were updated, and package tests now prove the top-level Gate-S fixtures are excluded from the published package. The historical paths above describe the initial implementation state; the active paths are now:

- `fixtures/sandbox-attacks/backend-powershell.ps1`
- `fixtures/sandbox-attacks/backend-node.mjs`
- `fixtures/sandbox-attacks/backend-git-bash.sh`
- `fixtures/sandbox-attacks/invoke-probe.ps1`

The first full ordinary rerun also exposed connector-environment dependencies rather than product regressions: the Git Bash child lacked `LOCALAPPDATA`/`CODEXPRO_HOME`, and the active local CodexPro instance owned port 8787. Tests now use the explicit nonsecret Windows state root where required, and the doctor integration test allocates its own temporary loopback port without changing the process-wide `CODEXPRO_PORT` or V1 frozen wire hashes.

Final verification supersedes the earlier counts and run IDs:

- full ordinary run `2026-07-17T12-22-24-986Z-phase4b0-ordinary-final-pass-b776c65c`: 881 tests, 880 pass, zero fail, one platform skip;
- managed Node `20.20.2` focused integration/security matrix: 35/35 pass;
- managed Node `24.15.0` focused integration/security matrix: 35/35 pass;
- final detached control `2026-07-17T12-26-59-883Z-phase4b0-control-final-post-move-6913f5a7`: 1/1 pass;
- final post-move evidence `2026-07-17T12-25-47-771Z-phase4b0-final-evidence-post-move-082ed78e`: exit 0, `result=blocked`, reason `RESTRICTED_PROBE_DNSUDP_timeout`, every material UDP/service/COM/network blocker reproduced, and all cleanup facts remained complete;
- final build and `npm run policy:check`: pass.

This correction does not change the decision: Task 4B0 is complete as a fail-closed oracle, Gate S is blocked, and Task 4B1 plus every `workspace` activation path remain unavailable.

## 2026-07-17 — STEP-333: Adversarially harden and re-verify Task 4B0

**Status**

Complete locally and unpublished. The adversarial review found and repaired evidence-integrity, cleanup-authority, process-identity, fixture-layout, detached-runner, and test-isolation defects. Fresh Gate S evidence remains `blocked`; Task 4B1 and `workspace` remain unavailable.

**Goal**

Re-review the complete Task 4B0 implementation as an attacker, remove every false-positive or overbroad proof path, reproduce the full ordinary/control and managed-runtime gates, and replace STEP-332's stale verification references with current evidence without weakening any isolation requirement.

**Files changed**

- `scripts/windows-sandbox-spike.mjs`
- `scripts/windows-sandbox-spike.ps1`
- `scripts/windows-sandbox-cleanup.ps1`
- `scripts/windows-sandbox-spike.cs`
- `scripts/windows-sandbox-attack-probe.cs`
- `scripts/windows-native-api-inventory-v1.json`
- `scripts/long-task-runner.mjs`
- `fixtures/sandbox-attacks/`
- `test/windows-sandbox-capability.test.mjs`
- `test/windows-sandbox-control.test.mjs`
- `test/native-host-architecture.test.mjs`
- `test/operational-reliability.test.mjs`
- `test/phase-4a-integration.test.mjs`
- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `Memory.md`
- `docs/memory/archive/phase-4-part-3.md`

**Implementation summary**

- Replaced the public `Explorer\\User Shell Folders` registry probe with a nonce-bound current-user-only HKCU key. The key is a real host positive control, is inaccessible to the AppContainer, and must be deleted before cleanup can pass.
- Strengthened the service oracle from merely opening the Service Control Manager to opening fixed service `EventLog` with `SERVICE_QUERY_STATUS` and calling `QueryServiceStatusEx`. The standard AppContainer still reaches that read-only surface, so the finding remains a real Gate S blocker rather than a weak-probe false positive.
- Removed exact-protected-path fallback to broad parent directories. Missing Codex/browser/credential targets retain their exact candidate identity, and the corresponding host positive control fails closed instead of overstating isolation.
- Removed an unused helper that accepted timeout or generic network errors as positive evidence. Remote network categories now depend only on separately proven local protocol/address-family controls; sandbox denial still requires exact `WSAEACCES(10013)`.
- Removed unauthenticated startup deletion of `%TEMP%\\CodexPro\\phase-4b0\\<32hex>` directories. Abnormal cleanup is now bound only to the current random probe nonce; no attacker-created same-shape tree is treated as authenticated state.
- Removed outer `taskkill /PID /T /F` use from the Gate S driver. Timeout handling terminates the exact Node-held PowerShell process handle; the source-shipped PowerShell host owns kill-on-close Jobs that revoke the probe descendants.
- Anchored PowerShell digest/nonce validation and retained a second exact C# nonce/digest check.
- Moved executable sandbox fixtures from `test/fixtures/` to root `fixtures/sandbox-attacks/`, preserving the repository rule that every `.mjs` under `test/` is a `*.test.mjs` module.
- Added bounded Windows `APPDATA`/`LOCALAPPDATA` derivation to the detached runner without adding or copying tokens. Existing explicit values and arbitrary variables remain unchanged.
- Changed the Phase 4A doctor integration test to use a dynamically selected local free port instead of colliding with the live connector on port 8787.
- Extended the exact native semantic inventory for every added AppContainer, Job, mailslot, service-query, and cleanup API. No directory or filename-pattern exemption was introduced.

**Verification commands**

- `npm run build`
- `npm run policy:check`
- `node --test test/operational-reliability.test.mjs test/ci-workflow.test.mjs`
- detached focused run `2026-07-17T12-19-57-418Z-phase4b0-ordinary-failures-fixed-b608493e`
- detached ordinary run `2026-07-17T12-20-20-906Z-phase4b0-ordinary-final-v2-18680a60`
- detached control run `2026-07-17T12-23-34-597Z-phase4b0-control-final-c8cd7d59`
- detached managed Node matrix `2026-07-17T12-24-25-516Z-phase4b0-node20-node24-matrix-17b37ffe`
- detached raw evidence run `2026-07-17T12-25-22-322Z-phase4b0-final-evidence-v2-19ef20db`

**Verification results**

- Build passed.
- Repository operational policy passed.
- Operational reliability plus CI discovery passed 10/10.
- The four previously failing ordinary cases passed in the focused run with exit code 0.
- Complete ordinary domain passed 880/881 with one intentional platform skip, zero failures, and bounded untruncated logs.
- Gate S control test passed with exit code 0 and verified that the complete blocked evidence projects only to `workspaceSandbox=unavailable` with `fallback=none`.
- Managed Node `20.20.2` and `24.15.0` each passed the 21-test focused matrix covering evidence schema, adversarial guards, native inventory, package contents, test domains, runner reliability, and abnormal cleanup.
- Fresh raw evidence returned `result=blocked`, Windows build `19044`, standard AppContainer integrity RID `4096`, zero capabilities, exact host/child SID and Job agreement, and complete profile/tree/registry/named-object cleanup. The first reported reason remains `RESTRICTED_PROBE_DNSUDP_timeout`; material blockers also include elevated host execution, LPAC `backend_incompatible`, readable service and COM broker surfaces, successful UDP sends across every tested IPv4/IPv6 class, non-policy TCP loopback/HTTP outcomes, failed host DoH positive control, unavailable Node runtime ACL proof, and missing Git Bash.

**Decisions made**

- Do not change the blocked result or relax exact denial classification.
- Do not treat successful cleanup as proof of isolation; every required attack and positive-control fact remains independently mandatory.
- Do not start Task 4B1 or activate `workspace`.
- A future safe continuation requires an explicit architecture decision: prove a non-elevated LPAC/other restricted identity that closes the broker and network gaps, or design a separately reviewed OS enforcement layer with elevation, persistence, rollback, and attack gates.
- No stage, commit, push, exact-head CI, production deployment, elevation request, or persistent host-policy change was performed.

**Risks or limitations**

- The standard AppContainer configuration is not a deny-all network sandbox: UDP send succeeds broadly, TCP loopback does not produce policy denial, and DNS/DoH/direct/proxy evidence is incomplete or non-policy.
- `EventLog` service status and an unauthorized COM surface remain reachable.
- The current connector host is elevated, so the required non-elevated proof is absent even where individual token and cleanup facts pass.
- LPAC is backend-incompatible on the tested path; Node is unavailable under the intended runtime ACL model and Git Bash was not found.
- The worktree still combines complete unpublished Phase 4A and 4B0 changes and has no publication or exact-head CI evidence.

**Rollback method**

- Revert only STEP-333 code/test/current-state-documentation changes while preserving earlier append-only records and complete Phase 4A work.
- No firewall, WFP, service, scheduler, shared runtime ACL, or user-data rollback is required because the implementation made no persistent host-policy change.

**Next step**

Pause at Gate S. Require the user to choose an architecture or reduced-scope closure. Until then retain the complete unpublished Phase 4A checkpoint plus the blocked 4B0 evidence, and keep Task 4B1, `workspace`, Phase 4 publication, and Phase 5 runtime unavailable.

### STEP-333 final verification addendum

After STEP-333 was appended, a final independent pass re-ran the complete authoritative boundaries against the stable source tree:

- `2026-07-17T12-22-24-986Z-phase4b0-ordinary-final-pass-b776c65c`: complete ordinary domain, 881 tests, 880 pass, zero fail, one platform skip;
- managed Node `20.20.2` and `24.15.0`: 35/35 focused integration/security tests per runtime, including frozen V1/V2/V3 wire hashes, native semantic inventory, package exclusion, runner/domain policy, abnormal cleanup, and Gate-S adversarial guards;
- `2026-07-17T12-26-59-883Z-phase4b0-control-final-post-move-6913f5a7`: final detached Windows control, 1/1 pass;
- `2026-07-17T12-25-47-771Z-phase4b0-final-evidence-post-move-082ed78e`: final fixture-bound raw evidence, exit 0, `result=blocked`, reason `RESTRICTED_PROBE_DNSUDP_timeout`, complete cleanup, and unchanged UDP/service/COM/network blockers;
- `npm run build` and `npm run policy:check`: pass.

No source file changed after these runtime gates. Subsequent edits were limited to this append-only evidence correction and the concise `Memory.md` index. No stage, commit, push, publication, exact-head CI, elevation request, or persistent host-policy change occurred.

## STEP-334 — Approve reduced Phase 4 trusted-repository scope

**Status**

Complete. Design and implementation sequencing were revised; no runtime source behavior was changed.

**Goal**

Remove the unproved AppContainer/LPAC sandbox from the current Phase 4 delivery requirement because the project is primarily for the user's own trusted repositories, while retaining truthful security boundaries and the blocked 4B0 evidence.

**Files changed**

- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-4-part-3.md`

**Implementation summary**

- Changed the current Phase 4 product goal from untrusted-code sandbox execution to trusted-repository Windows execution with brokered roots, exact local R3 approval, truthful ambient-authority reporting, bounded output, audit, Job-member lifecycle control, and emergency termination.
- Retained Task 4B0 as blocked diagnostic evidence only. Its result is not weakened, reclassified, or exposed as a production capability.
- Deferred Tasks 4B1 through 4B6, including filtered snapshots, prepared sandbox execution, production AppContainer/LPAC activation, deny-all network enforcement, workspace integration, and the full sandbox adversarial matrix.
- Kept `workspace` unavailable with no fallback to `full_access`.
- Made reduced Phase 4 closure depend on Phase 4A correctness, exact V1/V2/V3 compatibility, truthful full-access warnings, package exclusion and non-activation of 4B0 diagnostics, complete local verification, one publication, and exact-head CI.
- Recorded that a future untrusted-code feature should use a separately approved architecture and prefer a real OS boundary such as Hyper-V, Windows Sandbox, or a VM-backed executor.

**Verification commands**

- documentation/reference search for `Gate S`, `Task 4B1`, `workspace sandbox`, `offline workspace sandbox`, and `Phase 4B`
- `git diff --check`
- `npm run policy:check`

**Verification results**

- Documentation/reference search found no remaining statement that Task 4B1, Gate S, or sandbox activation blocks the reduced Phase 4 publication path.
- `git diff --check` passed; output contained only existing Windows LF-to-CRLF conversion warnings.
- `npm run policy:check` passed with `Repository operational policy: PASS`.

**Decisions made**

- Personal trusted-repository use does not justify blocking the roadmap on a strong untrusted-code sandbox.
- `full_access` remains explicitly ambient current-user authority and is suitable only for trusted code.
- A failed isolation proof must remain failed; scope reduction is acceptable, security-claim downgrading is not.
- Task 4B0 diagnostic code remains package-excluded, non-production, non-persistent, bounded, and cleanup-authenticated.
- Phase 5 remains blocked until the reduced Phase 4 closure SHA passes exact-head CI.

**Risks or limitations**

- Trusted-code execution can still read, modify, delete, or transmit anything reachable by the current Windows user.
- Local approval is a workflow gate, not an OS boundary or durable human-presence proof after ambient same-user code has run.
- The project does not provide a safe environment for unknown repositories, unreviewed install scripts, or hostile dependencies.
- Existing 4B0 diagnostics remain complex test-only code and must not drift into production registration or package contents.

**Rollback method**

- Revert only the STEP-334 documentation and memory edits. Runtime code is unchanged.
- Restoring the former strong sandbox roadmap would still require a new explicit approval and would not change the existing blocked Gate S evidence.

**Next step**

Complete reduced Phase 4 documentation reconciliation and the full local gate. Keep Task 4B1 through 4B6 and `workspace` activation deferred. After local acceptance, use the existing phase-boundary authorization for one stage/commit/push and require exact-head CI before Phase 5.

## STEP-335 — Complete reduced Phase 4 public documentation reconciliation

**Status**

Complete locally; uncommitted, unpushed, and unpublished.

**Goal**

Make every active user-facing, security, configuration, design, rule, and roadmap document describe the actual reduced Phase 4 product: brokered confirmed roots and locally approved trusted-code Windows execution, with no OS-sandbox claim and no `workspace` fallback.

**Files changed**

- `README.md`
- `README_ZH.md`
- `FAQ.md`
- `FAQ_ZH.md`
- `SECURITY.md`
- `config.example.env`
- `design.md`
- `AGENTS.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `Memory.md`
- `docs/memory/archive/phase-4-part-3.md`

**Implementation summary**

- Replaced stale Phase 2A claims that no interactive approval route exists. V1/V2 remain exact and never create pending approvals; V3 documents its local-only approval and emergency process-control CLI.
- Added complete English and Chinese V3 trusted-code setup examples, including atomic/audit/enforce prerequisites, exact 39-tool contract, schema-3 Permission Profile, local approval retry flow, and local process inspection/termination.
- Documented `full_access` as ambient current-user authority with no filesystem, credential, registry, device, broker, network, DLP, sandbox, or durable human-presence claim.
- Kept confirmed-root brokered access distinct from process authority and documented hard-link, stable-identity, lease, PathGuard, atomic-write, and audit boundaries.
- Kept `workspace` reserved and unavailable, retained blocked 4B0 evidence, and prohibited fallback or marketing reinterpretation.
- Updated FAQ, example environment, security threat model, UI copy rules, master plan, exact spec/plan, project rules, and concise memory.
- Reduced `AGENTS.md` from 230 lines/18,477 bytes to 204 lines/15,196 bytes by removing duplicate history and mechanism prose while preserving mandatory gates and authoritative pointers.

**Verification commands**

- repository-wide active-document searches for stale Phase 2A approval, Job, 4A-next, Gate-S-publication, and sandbox wording
- source/schema/CLI inspection for exact V3 additions, configuration prerequisites, Permission Profile fields, approval commands, and process commands
- Markdown local-link scan
- `git diff --check`
- `npm run policy:check`
- focused Phase 4 contract, integration, approval, process, audit, package, mutation, and Gate S projection tests

**Verification results**

- No active public document retained the stale no-approval or pre-Phase-4 wording.
- Every documented environment variable, profile field, tool name, and CLI command matches the current source and strict schemas.
- All 48 repository-local Markdown links resolved.
- Diff check passed with only existing LF-to-CRLF warnings.
- Repository policy passed.
- The focused runtime/documentation gate passed 115/115 with zero failures or skips.

**Decisions made**

- Public setup may document V3 before publication only as part of the same intended Phase 4 boundary; it must not claim the current published npm/Git head already contains the feature.
- `full_access` examples must force an explicit profile acknowledgement rather than providing a permissive built-in default.
- FAQ and configuration examples are part of the active product contract and must advance with README/SECURITY.
- Rules files should contain enforcement rules and pointers, not duplicate implementation history.

**Risks or limitations**

- The example trusted profile intentionally accepts all current-user ambient authority; users must replace the sample root and use it only with trusted code.
- Current documents describe a large local unpublished worktree; they become published product documentation only with Task 4C2.
- `AGENTS.md` remains just above the neat-freak 15 KB soft guideline at 15,196 bytes but is below its 300-line boundary and contains only active rules/pointers.

**Rollback method**

- Revert only STEP-335 documentation edits while preserving append-only history and all Phase 4 runtime work.
- Do not restore stale claims that V3 lacks local approval or that Job/ConPTY provide sandbox isolation.

**Next step**

Run the complete reduced Phase 4 local gate, reconcile final evidence, and stop before publication.

## STEP-336 — Pass reduced Phase 4 full local gate and neat-freak reconciliation

**Status**

Complete locally; uncommitted, unpushed, and unpublished. Task 4C2 is the only remaining Phase 4 action.

**Goal**

Prove the complete reduced Phase 4 runtime, compatibility, control, documentation, package, policy, and operational boundaries after final public-document and rule reconciliation.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `README.md`
- `README_ZH.md`
- `FAQ.md`
- `FAQ_ZH.md`
- `SECURITY.md`
- `config.example.env`
- `design.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `docs/memory/archive/phase-4-part-3.md`

**Implementation summary**

- Ran the complete managed Node 20/24 ordinary and independently authorized control domains against the final reduced scope.
- Ran both managed-runtime eight-part Smoke suites and a fresh package dry-run.
- Re-ran build, focused contract/integration/security tests, repository policy, native/mutation inventories, package exclusion, diff, links, secret-shape classification, Git scope, and memory/archive size checks.
- Retained diagnostic 4B0 as package-excluded and production-unreachable; `workspace` remains unavailable.
- Reconciled the spec, plan, master route, project rules, concise memory, and active append-only archive to Task 4C2 next.

**Verification commands**

- `npm run build`
- focused `node --test` Phase 4/V3 gate: 29 files, 115 tests
- malformed first detached attempt `2026-07-17T13-24-04-886Z-phase4c1-ordinary-final-47d34f58`
- authoritative ordinary run `2026-07-17T13-24-36-755Z-phase4c1-ordinary-final-v2-ab977a66`
- authoritative control run `2026-07-17T13-36-32-731Z-phase4c1-control-final-1a68ca66`
- authoritative Smoke run `2026-07-17T13-42-52-140Z-phase4c1-smoke-final-ed2c1ad6`
- `npm pack --dry-run --json`
- `npm run policy:check`
- `git diff --check`
- repository-local Markdown link scan
- scoped secret-shape scan with matched values suppressed
- active-document stale-route search
- key-file line/byte and active-archive rollover checks

**Verification results**

- Build passed.
- Focused gate passed 115/115, zero failures and skips.
- The first ordinary launch was environment-command failed before testing because unquoted Git-Bash handling collapsed `D:\\Dev\\codexpro` into an invalid `D:\\Dev\\codexpro\\Devcodexpro` `cwd`; it became stale with no result and no owned process. Omitting redundant `--cwd` fixed the invocation.
- Managed Node 20.20.2 ordinary passed 880/881 with zero failures and one established platform skip; Node 24.15.0 produced the same result. Run output was bounded and untruncated.
- Managed Node 20.20.2 and 24.15.0 control domains each passed 100/100 with zero failures or skips.
- Both managed runtimes passed all eight Smoke sections: analysis, analysis CLI, protected main, protected HTTP, Pro CLI, doctor, settings, and execute/watch/loop handoff.
- Package dry-run built successfully and contained 394 files, 897,572 packed bytes, and 4,851,096 unpacked bytes; package tests proved 4B0 diagnostics and memory archives remain excluded.
- Repository policy, mutation/native-host semantic inventories, exact V1=28/V2=31/V3=39 contracts, diff check, intended scope, and all 48 local links passed.
- Secret-shape scan identified only the two established fixed rejection/redaction fixture files, with no new or unclassified secret material.
- `AGENTS.md` is 204 lines/15,196 bytes; `Memory.md` remains below 150 lines/18 KB; the active Phase 4 archive remains below its rollover threshold.

**Decisions made**

- Redundant Windows `--cwd` arguments must be omitted or robustly quoted when commands cross Git Bash; the runner's default current directory is safer.
- One established platform skip is accepted only because both managed runtimes report the same known Windows/POSIX filename limitation and zero failures.
- No Task 4B1–4B6 work, sandbox activation, stage, commit, push, or exact-head CI belongs in Task 4C1.
- Task 4C2 must publish the complete intended Phase 4 scope once, not split runtime and documentation into recursive closure commits.

**Risks or limitations**

- Exact-head Ubuntu/Windows Node 20/24 CI does not exist until Task 4C2 publishes a closure SHA.
- The worktree is large because the complete Phase 4 boundary is intentionally unpublished as one unit.
- `full_access` remains trusted-code ambient authority and is unsafe for unknown repositories or hostile dependencies.
- Gate S remains blocked diagnostic evidence and `workspace` remains unavailable.

**Rollback method**

- Revert the STEP-335/336 reconciliation edits as one documentation unit while preserving earlier runtime and append-only records.
- Runtime rollback remains execution `off`, confirmed-root admission disabled, active input quarantined, recorded Jobs drained/terminated, V2 readers retained, and no user data deleted.

**Next step**

Stop before Task 4C2. On the next explicit execution, confirm the intended Phase 4 scope, stage once, create one English phase-boundary commit, push, and require exact-head Ubuntu/Windows Node 20/24 CI before Phase 5.

## STEP-337 — Publish Phase 4 and repair exact-head CI portability

**Status**

The initial Phase 4 publication is pushed. Its first exact-head run failed on three cross-platform CI defects; the bounded portability repair is complete locally and requires one replacement exact-head run before Phase 4 can close.

**Goal**

Publish the approved reduced Phase 4 boundary once, bind CI to its exact SHA, diagnose every failing matrix domain from primary logs, and repair portability without weakening manifest identity, test discovery, policy, or package boundaries.

**Published evidence**

- Initial Phase 4 commit: `60f62daea95f4ab489baac062574211a8ccd2fd0` (`feat: add Phase 4 trusted Windows execution`).
- Initial exact-head CI run: `29586912907`.
- Change classification and repository policy passed; Ubuntu/Windows Node 20/24 regression jobs failed.
- Exact run discovery and verification evidence is retained only below ignored `.ai-bridge/`.

**Root causes**

- Windows checkout converted manifest-bound C#, PowerShell, and JSON assets from LF to CRLF. The CI-observed SHA-256 values exactly matched the CRLF byte forms, so host and local-control manifests correctly failed closed as stale.
- `compileCommandForWindowsHost()` used controller-platform `path.resolve()` for Windows paths. Ubuntu therefore rewrote `C:\\...` inputs as POSIX paths and rejected a valid reviewed backend as `BACKEND_STALE`.
- Node 24.18 recursively executed TypeScript import barrels below `test/fixtures/` as tests. Native TypeScript loading could not resolve their source `.js` specifiers because those barrels are intended only for `tsx` test imports.

**Files changed**

- `.gitattributes`
- `.npmignore`
- `src/process/commandCompiler.ts`
- `fixtures/ts-imports/*.ts`
- the six former `test/fixtures/*-imports.ts` barrels
- affected Phase 4 and process-output tests
- `test/backend-discovery.test.mjs`
- `test/package-contents.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-4-part-3.md`

**Implementation summary**

- Pinned `scripts/windows-*.cs`, `scripts/windows-*.ps1`, and `scripts/windows-*.json` to `text eol=lf`; manifest hashes remain the reviewed LF identities rather than being weakened or made platform-specific.
- Switched Windows host compilation to `path.win32.resolve()` for executable and working-directory identity on every controller platform.
- Moved `tsx` import barrels to `fixtures/ts-imports/`, updated every consumer, left inert compatibility sentinels under `test/fixtures/`, and excluded the new test-only directory from published packages.
- Added regression checks for the mandatory LF attributes and package exclusion.

**Verification results**

- Affected regression set: 59/59 passed.
- Manifest-attribute and package-boundary focused set: 6/6 passed.
- TypeScript Build passed.
- Managed ordinary matrix run `2026-07-17T14-31-32-859Z-phase4ci-repair-ordinary-bd2f9e70` completed with exit code 0, zero stderr, and no log truncation.
- Managed Node 20.20.2 passed 983/984 with the one established platform skip; Node 24.15.0 passed 989/990 with the same skip. The six additional Node 24 successes are the inert TypeScript fixture sentinels.
- Package dry-run retained 394 files, 897,594 packed bytes, and 4,851,128 unpacked bytes; zero `fixtures/ts-imports/` files were published.
- Repository policy and `git diff --check` passed.

**Decisions made**

- Raw source identity must be made checkout-stable at the Git boundary; runtime hash comparison remains exact and fail-closed.
- Windows command compilation is a Windows semantic domain even when tests or controllers run on Ubuntu.
- Test-only executable/import helpers must stay outside Node's recursive `test/` discovery tree and outside the npm package.
- The repair will be one scoped follow-up to the failed Phase 4 publication. Successful replacement CI evidence must remain ignored; no evidence-only closure commit is allowed.

**Next step**

Create and push one concise portability-repair commit, bind a replacement CI run to its exact 40-character SHA, and require Ubuntu/Windows Node 20/24 Build, complete Regression, protected Smoke, and Package success before Phase 5.
