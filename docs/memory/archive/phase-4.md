# Phase 4

## STEP-309 - Design Phase 4 and repair it through adversarial review

**Date:** 2026-07-16
**Status:** Complete (design only; Phase 4 runtime implementation has not started)

### Goal

Derive a concrete Phase 4 architecture and TDD implementation sequence from first principles, include a Codex-like full-access workflow that requires a local user decision, then adversarially review and repair the completed design before implementation.

### Files changed

- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-4.md`

### Implementation summary

- Created an exact Phase 4 design with three non-interchangeable modes: brokered `confirmed_roots`, ambient current-user `full_access`, and offline filtered-snapshot `workspace` sandbox.
- Froze Tool Contract V3 at 39 tools while preserving exact V1=28 and V2=31 behavior, including V1/V2 Bash and approval-failure wire compatibility.
- Defined the user-facing **Full access (ask first)** mode as a fresh local decision-record workflow for ambient-authority actions, while explicitly refusing to claim secure human presence after unrestricted same-user code has run.
- Defined ordered Gates O, N, A0, A1, C, F, S, E, and P plus a task-by-task TDD sequence beginning with detached-runner ownership/log hardening.
- Defined exact native-host process ownership, PowerShell, ConPTY, output, cursor, audit, local approval, named-pipe, snapshot, AppContainer/LPAC, environment, cleanup, and offline-network contracts.
- Completed three independent adversarial review tracks after the usable draft existed: security, contract/Policy compatibility, and Windows implementation/UX. Repaired all P0/P1 findings and obtained final zero-P0/P1 re-reviews from all tracks.

### Adversarial repairs

- Replaced the false assumption that a current-user process can preserve brokered hard denies with truthful ambient-authority results and Permission Profile gating.
- Scoped process lifetime and termination to `job_object_members_only`, reported `broker_escape_resistance: none`, and added a nonce-bound WMI/COM probe without broad process killing.
- Required `NumberOfLinks === 1` plus stable-handle identity/link-count checks for all V3 confirmed-root ordinary-file providers.
- Separated required local decision records from an unprovable same-user human-presence guarantee.
- Removed Gate O's runner self-bootstrap loop and classified every real process/ConPTY/runner oracle as control-domain work.
- Required production to reuse the Gate-A0-proven native pipe factory; froze DACL/SACL/mandatory-integrity/token checks and verified `PIPE_REJECT_REMOTE_CLIENTS` through native call evidence and behavior rather than the descriptor.
- Froze a 64-byte `CXP4` protocol header, numeric frame kinds/flags, directional HMAC, frame/request/queue/credit bounds, overflow, and fatal recovery.
- Froze PowerShell exit-code mapping and a bounded fatal-host recovery path for a stuck Windows 19044 `ClosePseudoConsole` call.
- Chose exact persisted encodings: generic schema 1 with contract 3 and move schema 2 with contract 3; same-binary V2 rollback retains readers, while older-binary downgrade is not claimed.
- Enumerated every generic/move/undo writer, including export, handoff, non-retained self-test, local mutation service, and hard-coded V2 call sites; froze that every successful batch still emits a manifest while retention controls only undo material/capability, and removed the nonexistent change-set enumeration assumption.
- Added strict `AuditEventV3` lifecycle persistence plus separate V2/V3 query projections: V2 wire/cursor stays unchanged and filters V3 before paging, while V3 returns the union through a domain-separated cursor.
- Closed approval grant-consumption, composite-scope, V2-inheritance, standard-profile output pagination, executable replacement, streaming redaction, cursor confidentiality, snapshot content, unique AppContainer identity, environment, and Gate-S failure gaps.

### Verification commands

```powershell
node --test test/auth-documentation.test.mjs test/ci-workflow.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs test/mutation-architecture.test.mjs
npm run build
npm run policy:check
git diff --check
```

### Verification results

- Documentation/CI/package/domain/static-mutation tests: passed 15/15, failed 0, skipped 0.
- TypeScript build: passed.
- Repository operational policy: passed.
- `git diff --check`: passed; only expected line-ending notices were emitted.
- Markdown structure check: spec and plan code-fence counts are even; task/gate headings are unique and ordered.
- Intended scope check: only the six files listed above changed; no runtime source, configuration, workflow, fixture, credential, staging, commit, or push operation was performed.
- Archive size is below the volume rollover threshold.

### Decisions made

- The recommended cross-root answer is `confirmed_roots`; it retains brokered controls but cannot access hard-denied secrets/control state.
- True `full_access` can access any file, credential, registry key, network, or other resource already available to the current Windows user. It is for trusted code and is never called sandboxed or safe.
- The product requests a fresh local decision for every ambient start/input, but strong per-action human presence needs a future Windows Hello/UAC/separate-principal gate.
- Phase 4B publishes only if the filtered-snapshot AppContainer/LPAC Gate S fully passes. Positive egress remains unavailable.
- If Gate S fails, stop before publication and ask whether to close a reduced 4A scope or authorize a different sandbox architecture.

### Risks or limitations

- No Phase 4 runtime behavior exists yet; every backend and isolation property remains a design requirement until its gate produces evidence.
- Ambient same-user code can bypass brokered path rules, access user-readable credentials/control state, invoke the local approval workflow, and create brokered processes outside CodexPro-owned Jobs.
- Job Objects and ConPTY control lifecycle/I/O only; they do not isolate filesystem, registry, credentials, IPC, devices, or network.
- The source-shipped PowerShell/C# host and AppContainer/LPAC sandbox are candidates, not proven production capabilities.
- Same-binary configuration rollback is designed; downgrade to a pre-V3 binary is not promised.

### Rollback method

Delete the two new Phase 4 design documents and this new archive, then revert the Phase 4-only edits in the master plan, `AGENTS.md`, and `Memory.md`. No runtime or external state needs cleanup because none was changed.

### Next step

Begin only Task 4A0a: add RED tests and harden `scripts/long-task-runner.mjs` so run ownership binds PID creation time, nonce, and command identity and retained logs are bounded. Its destructive stop oracle must run through the pre-existing independent CI/native control harness, not through the runner under test.

## STEP-310 - Reconcile Phase 4 knowledge and audit workspace rules

**Date:** 2026-07-16
**Status:** Complete (documentation and governance only)

### Goal

Synchronize project knowledge after the Phase 4 design milestone, remove duplicated or stale guidance, and verify that the repository's active rules, documentation links, paths, commands, secret exclusions, and current implementation claims remain internally consistent.

### Files changed

- `AGENTS.md`
- `Memory.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-4.md`

### Implementation summary

- Reduced `AGENTS.md` from 21,462 bytes to approximately 16 KB by replacing duplicated phase history and detailed Phase 4 contract prose with concise rules and authoritative document pointers; all security and policy markers remain present.
- Reduced `Memory.md` from 13,724 bytes to approximately 12.4 KB by removing duplicated Phase 3 detail while retaining current state, Phase 4 decisions, evidence, limitations, open items, and complete archive links.
- Corrected the historical roadmap so its 2026-07-14 statement is explicitly historical rather than falsely claiming that Phase 2 is currently unstarted.
- Marked the roadmap's Phase 4 list as a superseded historical outline; the paired 2026-07-16 design and TDD plan remain authoritative.
- Audited all local Markdown links, documented scripts and source paths, package scripts, `.gitignore` secret/state exclusions, stale relative-time/TODO markers, workspace rule hierarchy, and platform-specific agent paths. No broken links, missing documented paths, conflicting rule files, or public Phase 4 implementation claims were found.
- Confirmed that no `CLAUDE.md` compatibility file is required because only Codex rules are active and `AGENTS.md` is already authoritative.

### Verification commands

```powershell
node --test test/auth-documentation.test.mjs test/ci-workflow.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs test/mutation-architecture.test.mjs
npm run build
npm run policy:check
git diff --check
```

The sync also ran a repository-wide local Markdown-link resolver, exact documented-path existence checks, package-script inventory, current-marker scan, size checks, and intended-scope inspection.

### Verification results

- Documentation/CI/package/domain/static-mutation tests: passed 15/15, failed 0, skipped 0.
- TypeScript build: passed.
- Repository operational policy: passed after restoring three exact policy-marker phrases that had initially been shortened to semantic equivalents. No policy rule was removed or bypassed.
- `git diff --check`: passed; only expected line-ending notices were emitted.
- Local Markdown links: 0 missing across repository Markdown files.
- Documented script/source paths: all present; referenced package scripts exist.
- Secret/state exclusions: `.env`, `.env.*`, `.ai-bridge/`, local JSON, logs, worktrees, and package/build outputs remain ignored as designed.
- Scope: documentation and governance only; no runtime source, configuration, workflow, fixture, external state, staging, commit, or push action occurred.
- Active Phase 4 archive remains far below the volume rollover threshold.

### Decisions made

- `AGENTS.md` remains the rule layer; exact contracts and historical evidence remain in specs, plans, and append-only archives instead of being duplicated there.
- Public README and security guides remain implementation-truthful and do not advertise Phase 4 full-access or sandbox behavior before runtime delivery.
- Historical documents may retain their original outlines only when clearly labeled as superseded and linked to the active authority.

### Risks or limitations

- The Phase 4 spec and plan are intentionally large exact-contract documents; they remain below the 1,500-line documentation threshold and should not be split while their paired gate/task structure remains usable.
- This sync validates documentation structure and current repository contracts; it does not create or validate any Phase 4 runtime capability.

### Rollback method

Revert the STEP-310-only edits in `AGENTS.md`, `Memory.md`, and `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, then append a correction entry to this archive rather than rewriting the completed record. No runtime or external state cleanup is required.

### Next step

Begin only Task 4A0a under the paired Phase 4 TDD plan. Do not advertise or activate Full access (ask first), confirmed-root access, native process sessions, or the workspace sandbox until their ordered gates pass.

## STEP-311 - Close Gate O with exact runner ownership and bounded logs

**Date:** 2026-07-16
**Status:** Complete

### Goal

Harden the detached long-task runner before any Phase 4 process implementation so stale PID reuse cannot terminate an unrelated process and output floods cannot retain unbounded logs or block result creation.

### Files changed

- `scripts/long-task-runner.mjs`
- `scripts/test-domains.mjs`
- `fixtures/runner-output-flood-child.mjs`
- `fixtures/runner-long-lived-child.mjs`
- `test/runner-process-identity.test.mjs`
- `test/runner-stop-identity-windows-control.test.mjs`
- `test/runner-log-bounds.test.mjs`
- `test/operational-reliability.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-4.md`

### Implementation summary

- Upgraded runner state to schema 2 with a random 256-bit worker nonce, canonical command digest, exact worker-command digest, PID, independently observed process creation time, and worker-published evidence.
- Windows ownership checks use fixed noninteractive Windows PowerShell process creation-time reads. Status, duplicate-kind detection, and stop fail closed on missing, ambiguous, stale, or mismatched evidence.
- `stop --run` re-reads exact ownership immediately before `taskkill /PID <worker> /T /F`; it never enumerates or kills generic `node.exe` processes.
- Reparse/symbolic-link path segments are rejected, run-directory object identity is persisted and revalidated, and replacement directories cannot supply trusted result/status state.
- Child stdout/stderr now flow through constant-memory tail buffers. Each stream has a default 1 MiB cap, an 8 MiB hard configurable maximum, exact total/retained/dropped byte counts, truncation metadata, and a bounded terminal log file.
- Output pipes are always drained even after the retention cap, so a flood cannot deadlock the child or prevent terminal result creation.
- Registered the destructive stale-PID stop oracle in the control domain and kept pure identity/log/path tests in the ordinary domain.

### Verification commands

```powershell
node --test test/runner-process-identity.test.mjs test/runner-log-bounds.test.mjs test/operational-reliability.test.mjs
node --test test/runner-stop-identity-windows-control.test.mjs
node scripts/toolchain-manager.mjs exec --major 20 -- node --test test/runner-process-identity.test.mjs test/runner-log-bounds.test.mjs test/operational-reliability.test.mjs
node scripts/toolchain-manager.mjs exec --major 24 -- node --test test/runner-process-identity.test.mjs test/runner-log-bounds.test.mjs test/operational-reliability.test.mjs
node scripts/toolchain-manager.mjs exec --major 20 -- node --test test/runner-stop-identity-windows-control.test.mjs
node scripts/toolchain-manager.mjs exec --major 24 -- node --test test/runner-stop-identity-windows-control.test.mjs
npm run build
npm run policy:check
```

### Verification results

- Initial RED exposed legitimate Windows 8.3 short-path aliases and a short-task/process-creation-query race. The fix changed path trust to reparse plus stable object identity and made startup creation-time observations concurrent while retaining stop-time revalidation.
- Ordinary runner/compatibility tests: 12/12 passed under the active Node runtime, managed Node 20.20.2, and managed Node 24.15.0.
- Destructive Windows stop-identity control oracle: 1/1 passed under the active runtime and both managed Node majors. The stale record was classified `stale`, stop refused `taskkill`, and the unrelated control process remained alive.
- TypeScript build: passed.
- Repository operational policy: passed.
- No staging, commit, push, generic process kill, credential access, or public process-tool activation occurred.

### Decisions made

- PID liveness is never sufficient ownership evidence.
- A quick process may complete during a relatively slow Windows creation-time query; late terminal state is re-read rather than misclassified as stale.
- Log caps apply independently to stdout and stderr, retain the tail rather than the head, and preserve exact loss metadata.

### Risks or limitations

- Windows process creation-time discovery currently launches fixed Windows PowerShell and is intentionally conservative rather than fast. Gate N may replace this with the proven native host, but stop ownership must not weaken.
- Same-user replacement attacks are reduced by random run IDs, reparse rejection, stable directory identity, nonce, and creation-time binding; this is runner ownership hardening, not an OS sandbox.
- Control evidence covers the exact stale-identity refusal oracle; later process-tree, Job, ConPTY, host-crash, and broker-escape behavior remains blocked on Gate N.

### Rollback method

Restore the schema-1 runner and remove the new fixtures/tests only if no later Phase 4 process work exists. Once Gate N or later work depends on schema 2, retain the upgraded reader and ownership semantics.

### Next step

Begin Task 4A0b: extend the native mutation inventory and prove the source-shipped PowerShell/C# Windows process-host candidate without exposing a public MCP process tool.

## STEP-312 - Close Gate N with a source-shipped native Windows process host

**Date:** 2026-07-16
**Status:** Complete

### Goal

Prove that a fixed package-root Windows PowerShell/C# host can own process trees at creation, enforce bounded protocol and output behavior, execute complete private-stdin PowerShell scripts, and operate ConPTY on Windows 19044 without adding a public process tool or a native binary dependency.

### Implementation summary

- Added the exact 64-byte `CXP4` protocol authority, directional HMAC-SHA-256 framing, strict sequence/flag/size rules, bounded request queues, and strict UTF-8 object JSON with duplicate-key rejection.
- Added a fixed `-NoLogo -NoProfile -NonInteractive` package-root PowerShell bootstrap that compiles reviewed C# through `Add-Type`; host stdout remains protocol-only and stderr is bounded.
- Added STARTUPINFOEX process creation with creation-time Job assignment, exact handle inheritance, executable handle identity verification, kill-on-close, native waits, bounded stdout/stderr tails, and parent-EOF cleanup.
- Proved host crash, parent EOF, abrupt Node-controller exit, partial/fatal protocol input, timeout, and output flood cleanup without broad process-name killing.
- Proved PowerShell Unicode/private-stdin execution and exact exit mapping. The bounded environment now fixes `SystemDrive`, `SystemRoot`, `WINDIR`, `ProgramData`, `ComSpec`, minimal system `PATH`, and `PATHEXT`; caller poisoning cannot replace them.
- Proved `broker_escape_resistance: none` with a nonce-bound WMI process and exact PID/creation-time cleanup.
- Added an isolated Job-owned ConPTY worker. It proves create/read/write/resize/ETX delivery/close, keeps the target in the inherited Job before execution, and temporarily detaches only the isolated worker's standard handles so target output cannot bypass the Pseudo Console.
- A simulated stuck `ClosePseudoConsole` triggers the five-second worker-fatal gate; the worker Job closes, an unrelated process survives, and the main host launches a fresh worker that passes the normal ConPTY probe.
- Added exact C#/PowerShell semantic API inventory, package-content checks, control-domain registration, and ignored capability evidence at `.ai-bridge/phase-4/native-host-capability.json`.

### Verification results

- Active-runtime native/protocol/static/package/control gate: 25/25 passed.
- Managed Node 20.20.2 final matrix: 25/25 passed.
- Managed Node 24.15.0 final matrix: 25/25 passed.
- TypeScript build and repository operational policy passed.
- Final evidence records Windows `10.0.19044`, x64, source SHA-256 identities, Job/handle/deadline/ConPTY capability, `HOST_FATAL_CONPTY_CLOSE` recovery, temporary-root cleanup, and zero persistent host changes.
- The Node 20 matrix exposed that libuv requires a bounded system `PATH` even for absolute descendant executables under the clean environment. The fix is a fixed `System32;Windows` PATH, not ambient inheritance.
- A missing `SystemDrive` initially caused .NET cache templates to create a literal `%SystemDrive%` tree in the workspace. The environment contract and regression oracle were repaired, and the exact synthetic cache tree plus temporary diagnostic probes were removed.

### Decisions and limitations

- Gate N proves `job_object_members_only`; WMI/COM/service/scheduler broker escape remains outside the Job and is reported truthfully as `none` resistance.
- ETX means delivered to the Pseudo Console; it does not promise that an arbitrary foreground program terminates.
- A stuck Pseudo Console close is isolated to a replaceable Job-owned worker so the protocol host can recover without targeting a foreign process.
- No V3 process tool, approval surface, confirmed root, full-access mode, sandbox, staging, commit, push, or persistent system modification was created.

### Next step

Begin Task 4A1a / Gate A0: prove the local named-pipe transport and state-file ACLs, owner/SACL/mandatory-integrity evidence, exact server routing, startup-secret transfer, wrong-user/low-integrity/AppContainer refusal, and cleanup before implementing approval semantics.

## STEP-313 - Close Phase 4A0 and stop before Gate A0

**Date:** 2026-07-16
**Status:** Complete

### Goal

Close only Phase 4A0 after the user narrowed the execution boundary, preserving the completed Gate O and Gate N work while removing all unfinished Task 4A1a/Gate A0 experiments.

### Scope reconciliation

- Confirmed from the authoritative TDD plan that Phase 4A0 consists exactly of Task 4A0a/Gate O and Task 4A0b/Gate N; Task 4A1a begins the next subphase.
- Removed the five untracked local-control experiment files created after entering Gate A0: the protocol authority, C# spike, Node wrapper, PowerShell bootstrap, and protocol test.
- Retained all Gate O runner hardening, Gate N native-host/ConPTY implementation, fixtures, inventories, tests, package assertions, and ignored capability evidence.
- Added the two new Phase 4A0 control tests to the frozen connector-hostile test-domain list. The first full regression correctly exposed that stale governance list; no runtime test failed.
- No public V3 tool, approval surface, confirmed-root mode, full-access mode, sandbox, staging, commit, push, or system-persistent change was introduced.

### Final verification

- Gate O managed Node 20.20.2 matrix: 13/13 passed.
- Gate O managed Node 24.15.0 matrix: 13/13 passed.
- Gate N managed Node 20.20.2 matrix: 25/25 passed.
- Gate N managed Node 24.15.0 matrix: 25/25 passed.
- Complete active-runtime regression after the test-domain correction: 847 passed, 0 failed, 1 existing platform skip.
- TypeScript build: passed.
- Repository operational policy: passed.
- The initial combined matrix command was interrupted by a connector 502 before returning test results; the exact Gate O and Gate N matrices were rerun separately and both returned complete green evidence.

### Decisions and limitations

- Phase 4A0 is locally closed but not published; exact-head CI evidence does not exist because no stage, commit, or push was performed.
- Gate N proves a source-shipped native host candidate and its control properties, not a registered public execution tool.
- Phase 4A1a/Gate A0 remains entirely unimplemented after cleanup. Local approval, V3 contracts, confirmed roots, full access, and sandbox behavior remain unavailable.

### Next step

Pause. Resume only when the user explicitly instructs work on Task 4A1a/Gate A0 or a publication step for the completed Phase 4A0 batch.

## STEP-314 - Reconcile the Phase 4A0 knowledge checkpoint

**Date:** 2026-07-16
**Status:** Complete (documentation and memory only)

### Goal

Run the neat-freak reconciliation after Phase 4A0 so the current rule layer, memory index, design status, and TDD-plan checkpoint all describe the same locally complete but unpublished state.

### Files changed

- `AGENTS.md`
- `Memory.md`
- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
- `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`
- `docs/memory/archive/phase-4.md`

### Implementation summary

- Replaced the stale current-state claims that Phase 4 runtime work had not started and that Task 4A0a was still next.
- Recorded the exact current checkpoint: Gate O and Gate N are locally complete, Phase 4A0 remains uncommitted and unpublished, and execution is paused before Task 4A1a/Gate A0.
- Updated only status/checkpoint prose in the paired Phase 4 design and plan; exact contracts, task ordering, historical archive entries, and implementation evidence remain unchanged.
- Kept public V3 process, approval, confirmed-root, full-access, and sandbox capabilities explicitly absent.

### Verification commands

```powershell
node --test test/auth-documentation.test.mjs test/ci-workflow.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs test/mutation-architecture.test.mjs test/native-host-architecture.test.mjs
node scripts/repository-policy.mjs
```

### Verification results

- Documentation/governance/static/package gate: 18/18 passed, 0 failed, 0 skipped.
- Repository operational policy: passed.
- Targeted Markdown search found no remaining current-status claim that Phase 4 still begins at Task 4A0a; the older statements inside completed append-only STEP-309/310 remain valid historical records.
- `Memory.md` remains below the 150-line/18-KB practical target and the 200-line/25-KB hard limit.
- No runtime implementation, staging, commit, push, exact-head CI, credential, or external state change occurred in this reconciliation step.

### Decisions made

- Current status belongs in `Memory.md`, `AGENTS.md`, and the status/checkpoint fields of the paired Phase 4 documents; completed archive entries are not rewritten to erase their historical context.
- Task 4A1a/Gate A0 is the next implementation boundary, but it remains paused until explicit user instruction.

### Risks or limitations

- Phase 4A0 has only local verification. Publication and exact-head CI evidence remain absent.
- `AGENTS.md` remains near its soft byte-size target but below its line-count and hard attention-budget limits; future rule additions should replace or consolidate existing prose rather than append history.

### Rollback method

Revert only the STEP-314 status/checkpoint edits in the four current documents and remove this final archive entry. Do not alter the Phase 4A0 runtime files or rewrite earlier append-only records.

### Next step

Pause before Task 4A1a/Gate A0. Stage, commit, push, and exact-head CI only if the user explicitly chooses to publish the completed Phase 4A0 batch.

## STEP-315 - Complete Phase 4A1 local approval and atomic grant consumption

**Date:** 2026-07-16
**Status:** Complete locally; uncommitted and unpublished

### Goal

Complete Task 4A1a/Gate A0 and Task 4A1b/Gate A1 without activating a public V3 execution surface: prove the private Windows local-control boundary, implement exact V3-only pending approvals and grants, consume grants atomically, expose only the loopback operator CLI, and stop before Task 4A2/Gate C.

### Files changed

- Local control and native proof: `scripts/windows-local-control.cs`, `scripts/windows-local-control.ps1`, `scripts/windows-local-control-manifest.json`, `scripts/windows-local-control-spike.mjs`, `src/control/`, and their exact protocol/native/static tests.
- Approval and policy lifecycle: `src/policy/authorizationFacts.ts`, `src/policy/pendingApprovals.ts`, `src/policy/approval.ts`, `src/policy/runtime.ts`, `src/policy/integration.ts`, `src/productionRuntime.ts`, `src/server.ts`, schemas, fixtures, and focused tests.
- Operator surface and governance: `scripts/codexpro.mjs`, package/native/mutation inventories, test-domain classification, this archive, `Memory.md`, `AGENTS.md`, and the Phase 4 status/checkpoint documents.

### Implementation summary

- Proved a Windows named-pipe/state boundary with exact descriptor, owner, DACL, SACL, mandatory label, `PIPE_REJECT_REMOTE_CLIENTS`, wrong-user/low-integrity/AppContainer/owned-job refusals, private bootstrap-secret transfer, stale/reparse/hard-link/replacement refusal, exact server routing, and cleanup.
- Added one local-control runtime per owning production runtime; no process-global manager or public-network approval endpoint was introduced.
- Added bounded V3-only pending approval queues, TTL and closed-lifecycle handling, exact authorization facts, durable lifecycle audit, and reserve/commit/burn grant consumption. V1/V2 still create no pending approval.
- Added loopback CLI commands for approval list/watch/approve/deny and owned-process list/terminate with an exact `--server` requirement and safe default display.
- The post-result review repaired canonical direct/supertool authorization binding, the `pending -> prepared -> granted` transition, reusable R2 grant behavior, child-exit cleanup ordering, exact mutation inventory entries, and queue-limit regression coverage.
- Node 20 exposed a test-loader deadlock when repeated `tsx` imports loaded the new shared policy graph in an unsafe order. The tests now load one test-only integration barrel or import the pending store first; no product contract was weakened.
- The first complete ordinary run then exposed two stale production-runtime test assumptions: the observation gained `localApprovalServerId`, and async child shutdown means construction-failure cleanup is eventually complete rather than same-tick complete. The assertions were updated to the real lifecycle contract and passed both managed runtimes.

### Verification commands

```powershell
node scripts/long-task-runner.mjs start --kind phase4a1-gate-a0-control-final -- <Gate A0 native/control command>
node scripts/long-task-runner.mjs start --kind phase4a1-targeted-matrix-final-2 -- node scripts/toolchain-manager.mjs matrix --major all -- node --test <Phase 4A1 focused tests>
node scripts/long-task-runner.mjs start --kind phase4a1-ordinary-final-3 -- node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain ordinary
npm run build
npm run policy:check
node --test test/auth-documentation.test.mjs test/ci-workflow.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs test/mutation-architecture.test.mjs test/native-host-architecture.test.mjs
node --check scripts/codexpro.mjs
git diff --check
```

### Verification results

- Gate A0 final run `2026-07-16T13-10-10-933Z-phase4a1-gate-a0-control-final-a0af1a9c`: passed with exit code 0.
- Focused final run `2026-07-16T16-41-13-064Z-phase4a1-targeted-matrix-final-2-4a436d12`: Node 20.20.2 passed 54/54; Node 24.15.0 passed 54/54; zero failures and untruncated bounded logs.
- Production-runtime regression run `2026-07-16T16-54-46-770Z-phase4a1-production-runtime-regression-61472100`: passed on both managed runtimes.
- Complete ordinary run `2026-07-16T16-55-35-405Z-phase4a1-ordinary-final-3-fb72bc23`: Node 20.20.2 and Node 24.15.0 each reported 786 tests, 785 passed, 0 failed, and 1 established platform-capability skip; logs were complete and untruncated.
- TypeScript build, repository operational policy, CLI syntax, and the 18/18 documentation/governance/static/package gate passed.
- An initial `git diff --check` invocation from the restricted connector could not discover the repository despite the verified working directory; it was rerun with repository access during the final reconciliation gate.
- Material diagnostic runs stopped before the final green evidence were `2026-07-16T14-22-02-173Z-phase4a1-ordinary-final-5c2c7488`, `2026-07-16T16-15-33-966Z-phase4a1-node20-audit-query-diagnostic-ea68f7e8`, `2026-07-16T16-17-51-979Z-phase4a1-node20-audit-schema-diagnostic-5ed96188`, `2026-07-16T16-27-18-425Z-phase4a1-targeted-matrix-final-f1dfb12e`, and the stale-assertion run `2026-07-16T16-45-59-953Z-phase4a1-ordinary-final-2-7ae80195`.

### Decisions made

- GitHub Actions was not used for the subphase gate because it would require publishing a partial Phase 4 worktree. Bounded local detached-runner logs provide the same Node 20/24 failure evidence without violating the complete-phase publication rule.
- Approval authorizes a precisely bound risk; it does not create a sandbox or prove human presence after unrestricted same-user execution.
- Public V3 registration remains Gate C work. The local control/CLI substrate is not advertised in public user guides before the public contract exists.

### Risks or limitations

- Phase 4A1 has local evidence only. There is no Phase 4 commit, push, exact-head CI run, or published artifact.
- No public V3 process tool, confirmed-root workspace, `full_access`, or offline sandbox is active.
- Local same-user security boundaries and approval records cannot stop every WMI/COM/service/scheduler broker escape or prove a human made a later decision after arbitrary same-user code runs.

### Rollback method

Remove the Phase 4A1 local-control, approval, runtime, CLI, inventory, fixture, and test additions; restore the Phase 4A0 checkpoint wording in current documents. Do not rewrite earlier append-only archive entries or remove the retained managed toolchains.

### Next step

Stop before Task 4A2/Gate C, as requested. Resume only on explicit instruction; do not stage, commit, push, or run exact-head CI until the complete Phase 4 publication boundary.

## STEP-316 - Record the managed Node 20 `tsx` policy-loader trap

**Date:** 2026-07-16
**Status:** Complete (memory and documentation maintenance)

### Goal

Capture the costly Phase 4A1 managed-Node-20 test-loading failure as an actionable diagnostic rule, so later policy work can distinguish test-loader deadlock from product behavior and avoid repeating the exploratory attempts.

### Files changed

- `Memory.md`
- `docs/memory/archive/phase-4.md`

### Implementation summary

- The affected pattern is repeated sequential `tsx/esm/api` `tsImport` loading of the new shared policy graph, specifically when `authorizationFacts` is evaluated before `pendingApprovals` under Node 20.
- Symptom: an otherwise ordinary Node 20 test stays active with CPU/cache-spin behavior and no useful test completion, while the same logic succeeds in the active runtime or after changing only the test-module load topology.
- Stable test patterns are: load a single test-only barrel that exports the required policy integration symbols, as `test/fixtures/policy-v3-integration-imports.ts` does; or import `PendingApprovalStore` before `authorizationFacts` in sequential `tsImport` calls.
- Rejected workaround: do not replace the imports with `Promise.all`; this test-loader path can instead expose raw TypeScript `import type` syntax. Do not change production policy imports or weaken product assertions to accommodate the loader.
- Diagnose through a managed Node 20 narrow test launched by the owned long-task runner. Before stopping a run, prove its exact ownership and collect bounded state/log evidence; do not kill generic `node.exe` processes.

### Verification commands

```powershell
node scripts/long-task-runner.mjs start --kind phase4a1-node20-single-barrel-regression -- node scripts/toolchain-manager.mjs run --major 20 -- node --test test/policy-v3-approval-integration.test.mjs
node scripts/long-task-runner.mjs start --kind phase4a1-import-and-limits-matrix -- node scripts/toolchain-manager.mjs matrix --major all -- node --test <Phase 4A1 import-order and queue-limit tests>
```

### Verification results

- Managed Node 20 single-barrel regression `2026-07-16T16-39-42-246Z-phase4a1-node20-single-barrel-regression-a55fc770`: exit code 0.
- Import-order and limit matrix `2026-07-16T16-26-04-592Z-phase4a1-import-and-limits-matrix-89bdd43c`: Node 20 passed 11/11 and Node 24 passed 11/11.
- The later focused final matrix passed 54/54 under both Node 20.20.2 and Node 24.15.0, and the complete ordinary matrix passed 785/786 with zero failures under both runtimes; this confirms the documented loading topology remains compatible with the full Phase 4A1 suite.

### Decisions made

- Treat this as a test-harness compatibility constraint, not a production runtime defect.
- Keep the concise operational rule in `Memory.md`; retain exact symptoms, rejected workaround, run IDs, and diagnosis procedure in this append-only Phase 4 record.

### Risks or limitations

- The diagnosis is scoped to the observed Node 20 `tsx/esm/api` policy-import graph. Do not generalize it to unrelated TypeScript loaders without fresh evidence.
- Future `tsx`, Node, or module-graph changes can invalidate the workaround; the managed Node 20 narrow regression is the required confirmation path.

### Rollback method

Remove the concise `Memory.md` rule and append a correction entry if later evidence disproves it. Do not rewrite STEP-315 or this completed record.

### Next step

Keep the rule active for subsequent Phase 4 policy tests. Implementation remains paused before Task 4A2/Gate C.

## STEP-317 - Complete Task 4A2 and Gate C exact V3 contract migration

**Date:** 2026-07-16
**Status:** Complete locally; uncommitted and unpublished

### Goal

Migrate the complete public and persisted contract stack to exact V3=39 without changing exact V1=28 or V2=31 behavior, while keeping every newly registered V3 action non-executable until its later policy/runtime gate.

### Files changed

- Contract and schemas: `src/config.ts`, `src/codexproSupertool.ts`, `src/tools/contracts/`, `src/tools/schemas/codexpro.ts`, `src/tools/schemas/execution.ts`, `src/tools/schemas/openFullAccessWorkspace.ts`, and `src/server.ts`.
- Persistence and rollback: `src/changesets/`, `src/mutations/writers.ts`, `src/moves/service.ts`, and `src/tools/phase3dServer.ts`.
- Audit and runtime: `src/audit/`, `src/policy/runtime.ts`, `src/policy/toolPolicy.ts`, and `src/productionRuntime.ts`.
- Tests and policy inventories: the Phase 4 contract/persistence/audit tests plus adjacent mutation, move, undo, production-runtime, domain-classification, package, and architecture tests.
- Knowledge layer: `AGENTS.md`, `Memory.md`, the Phase 4 design/plan, the master implementation plan, and this archive.

### Implementation summary

- Added exact Contract V3 parsing, capability gates, descriptors, direct registration, supertool routing, and strict input/output schemas. V3 is exactly V2 without `bash`, plus `open_full_access_workspace` and eight typed execution/process actions, for 39 child tools.
- V3 standard/full startup now requires Policy Kernel `enforce`, required durable audit, stable identity/session context, Phase 3 atomic/state readers, and an explicit contract-migration capability. Minimal and connection-test projections gain no authority.
- Registered the nine V3 additions only behind a disabled policy and fail-closed handlers. Gate C therefore proves the wire/migration boundary without claiming that process execution, confirmed roots, full access, or sandboxing is usable.
- Widened generic schema-1 mutation manifests to caller contract `1 | 2 | 3` and schema-2 move manifests to `2 | 3`, while preserving storage schema numbers and MAC coverage. V3 writers thread contract 3; same-binary V2 rollback can undo retained V3 records and emits contract 2.
- Added strict persisted `AuditEventV2 | AuditEventV3` envelope support. V2 query verifies the complete chain, filters V3 before paging, and retains V2 authorization/execution evidence; V3 uses a separate union projection and domain-separated cursor that is mutually invalid with V2.
- Replaced stale “dormant V2” schema commentary and reconciled every current-status document. Historical Phase 4A0/A1 archive statements remain unchanged.

### Verification commands

```powershell
node --test test/phase-4-contract-v3.test.mjs test/phase-4-v3-inherited-contract.test.mjs test/phase-4-v3-persistence.test.mjs test/phase-4-v3-audit-persistence.test.mjs test/audit-lifecycle-v3.test.mjs test/policy-v3-approval-integration.test.mjs
node scripts/long-task-runner.mjs start --kind phase4a2-gate-c-ordinary-final -- node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain ordinary
npm run build
node --test test/auth-documentation.test.mjs test/ci-workflow.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs test/mutation-architecture.test.mjs test/native-host-architecture.test.mjs
npm run policy:check
git diff --check
```

The neat-freak reconciliation also enumerated all Markdown files, resolved every relative Markdown link, checked `AGENTS.md`/`Memory.md` sizes, and scanned the workspace for secret-looking assignments while excluding generated/runtime state.

### Verification results

- Focused final Contract V3/persistence/audit/approval matrix passed 21/21 with zero failures.
- Gate C ordinary run `2026-07-16T18-48-24-962Z-phase4a2-gate-c-ordinary-final-164586c5` exited 0. Managed Node 20.20.2 and Node 24.15.0 each ran 807 tests: 806 passed, 0 failed, and 1 established platform-capability test skipped.
- The Gate C runner retained all 239,151 stdout bytes with no truncation; stderr was empty. The exact owned runner identity remained valid until the result record closed it.
- TypeScript build passed. The documentation/governance/static/package gate passed 18/18. Repository operational policy passed.
- `git diff --check` passed with only expected working-tree CRLF notices. All 110 Markdown files had zero missing relative links. `Memory.md` remained below its practical 18-KB and hard line/byte limits.
- The broad secret-pattern scan reported only four established smoke/test fixture files and no changed Phase 4 file; no credential value was introduced.

### Decisions made

- Gate C activates the exact V3 wire universe but not execution authority. A registered tool with a disabled policy/handler is an intentional fail-closed migration seam, not a usable feature.
- Persisted record dispatch remains schema-first and exact-pair validated; no `ChangeSetManifestV3` was invented because the durable record shape did not change.
- V2 audit rollback visibility is retained by filtering V3 lifecycle records only at the V2 projection boundary, never by deleting or rewriting newer evidence.
- Task-level work remains local and unpublished. The first Phase 4 stage/commit/push remains the complete-phase boundary after all local gates and neat-freak reconciliation.

### Risks or limitations

- This is local evidence only; there is no Phase 4 commit, push, exact-head CI, or published package yet.
- The nine V3 additions are deliberately unusable. Composite scope policy, full-access eligibility, live capability evidence, semantic execution facts, confirmed-root admission, output/process runtime, and sandbox proof remain later tasks.
- The older rejected sandbox launch left a command-only ignored run directory with no worker metadata or result. It was not treated as evidence and was not destructively removed.

### Rollback method

Restore Contract V2 selection, remove the V3 descriptors/schemas/registrations and V3 audit projection, and revert only contract-3 widening in current readers/writers. Preserve existing V3 audit/change-set data until the same-binary V2 rollback path has completed any required owned undo; do not rewrite append-only history or remove retained managed toolchains.

### Next step

Begin Task 4A3 with RED tests for versioned composite scopes, full-access Permission Profile eligibility, unenforceable child-policy rejection, exact semantic authorization facts, owned-handle R0 checks, and per-server live capability-evidence revocation. Keep V1 schemas/resources frozen and keep every V3 execution handler fail closed until its later gate.

## STEP-318 - Complete Task 4A3 composite policy, capability evidence, and semantic facts

**Date:** 2026-07-16
**Status:** Complete locally; uncommitted and unpublished; Phase 4 Volume 1 closed

### Goal

Authorize exact V3 execution/process intent without letting `process:manage` become a code-execution bypass, without weakening V1/V2 schemas, and without allowing ambient `full_access` to claim isolation it cannot enforce.

### Files changed

- New policy foundations: `src/policy/executionResources.ts`, `src/policy/executionCapabilities.ts`, and `src/policy/fullAccessResources.ts`.
- Versioned policy integration: `src/policy/types.ts`, `src/policy/schemas.ts`, `src/policy/toolPolicy.ts`, `src/policy/runtime.ts`, `src/policy/integration.ts`, `src/policy/profileStore.ts`, `src/policy/compat.ts`, and `src/config.ts`.
- Tests: `test/phase-4-policy-resources.test.mjs`, `test/phase-4-authorization-facts.test.mjs`, `test/phase-4-capabilities.test.mjs`, and the single-import test barrel `test/fixtures/phase-4-policy-imports.ts`.
- Knowledge layer: `AGENTS.md`, `Memory.md`, the Phase 4 design/plan, the master implementation plan, and this archive.

### Implementation summary

- Added versioned composite requirements for all nine V3 additions. `run_command` always requires `shell:execute`; persistent starts additionally require `process:manage` plus `process:persistent`; ambient actions additionally require `host:full-access`. Handle operations cannot start code.
- Kept the V1 scope, identity, request-context, and Permission Profile schemas exact. Added separate strict V3 scope/identity/context and Permission Profile schemas, a V3 graph loader/compiler, and a conservative V3 compatibility profile whose ambient eligibility defaults fail closed.
- Added exact Phase 4 authority configuration: `configured_roots|confirmed_roots`, execution `off|full_access|workspace`, and dependencies `off|node_modules`. Defaults grant no new authority, and nondefault values are rejected outside Contract V3.
- Added case-insensitive Windows effective-environment resolution with duplicate refusal and a digest of the final effective map. Execution facts bind typed script/argv boundaries, effective environment, logical and absolute cwd identity, exact backend/executable identity, terminal, deadline, fixed lifetime, network posture, access mode, workspace/lease/snapshot, and policy/evidence/identity/transport revisions.
- Execution/process descriptors retain digests, counts, and safe opaque identifiers only. Raw scripts, argv, environment values, input bytes, and canonical private roots do not enter the descriptor or approval/audit facts.
- Process input facts bind generation, exact bytes, and close state. Read/list/resize are R0 only after owned-handle/context checks; input is R3 and interrupt/terminate are R2.
- Added explicit ambient filesystem, credential, registry, and unrestricted-network eligibility. Any requested blocked-path, credential, registry, device, network-destination, or sandbox enforcement for an ambient child returns `PROCESS_POLICY_UNENFORCEABLE` before approval.
- Added one live capability-evidence store per runtime/server. Revision replacement revokes approvals/grants, quarantines input, terminates processes, revokes workspaces, and cleans authenticated state in order; repeated old revisions are rejected and new requests fail closed while replacement is active. Runtime policy/evidence diagnostics read the live revision.
- V3 resolved policy resources must provide their closed semantic-facts digest; runtime refuses a resolver that tries to fall back to raw argument serialization. Production handlers/resolvers remain absent, so the public additions still cannot execute.
- Consolidated the new tests behind one TypeScript import barrel to preserve the managed Node 20 loader constraint recorded in STEP-316.

### Verification commands

```powershell
node --test test/phase-4-policy-resources.test.mjs test/phase-4-authorization-facts.test.mjs test/phase-4-capabilities.test.mjs
npm run build
node scripts/long-task-runner.mjs start --kind phase4a3-policy-focused-final-2 -- node scripts/toolchain-manager.mjs matrix --major all -- node --test --test-concurrency=1 test/phase-4-policy-resources.test.mjs test/phase-4-authorization-facts.test.mjs test/phase-4-capabilities.test.mjs test/policy-compat.test.mjs test/policy-profile-store.test.mjs test/policy-integration.test.mjs test/policy-v3-approval-integration.test.mjs test/phase-4-contract-v3.test.mjs test/test-domain-classification.test.mjs
node scripts/long-task-runner.mjs start --kind phase4a3-ordinary-final-2 -- node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain ordinary
node --test test/auth-documentation.test.mjs test/ci-workflow.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs test/mutation-architecture.test.mjs test/native-host-architecture.test.mjs
npm run policy:check
git diff --check
```

The neat-freak pass also enumerated Markdown files, resolved relative links, checked rule/memory/archive sizes, and scanned changed files for secret-looking assignments.

### Verification results

- Focused final run `2026-07-16T19-23-03-347Z-phase4a3-policy-focused-final-2-836ae658` passed on both managed runtimes: 48 tests, 47 passed, 0 failed, and 1 established platform-capability skip per runtime. Logs were complete and stderr was empty.
- Final ordinary run `2026-07-16T19-24-24-375Z-phase4a3-ordinary-final-2-ca29973a` passed on both managed runtimes: 825 tests, 824 passed, 0 failed, and 1 established skip per runtime. It retained all 244,264 stdout bytes without truncation and had empty stderr.
- TypeScript build passed. The 18/18 documentation/governance/static/package gate passed. Repository operational policy passed.
- `git diff --check` passed with only expected CRLF notices. All 110 Markdown files had zero missing relative links. No changed file matched the broad secret-assignment scan.
- Before the final ordinary run, review identified an evidence-update race. Exact owned run `2026-07-16T19-20-20-414Z-phase4a3-ordinary-final-088321ee` was stopped by verified run ID, the store gained an update barrier and RED regression, and only the repaired final run is completion evidence.

### Decisions made

- Composite scope definitions are versioned instead of widening the V1 identity schema. V1 remains incapable of accepting V3-only host/persistence scopes.
- A Permission Profile can authorize ambient risk only by setting every explicit ambient eligibility field; omission is denial. Approval cannot make an unenforceable child policy enforceable.
- `full_access` always records unrestricted host network even when the caller supplies an empty destination request. Empty requested destinations do not create network isolation.
- Capability evidence replacement is a fail-closed transition, not an eventual-consistency update: no new authorization may read the old evidence while revocation callbacks run.
- Task 4A3 builds the policy substrate only. It does not activate a production command resolver or reinterpret a disabled execution profile as usable.

### Risks or limitations

- V3 production execution and confirmed-root resolvers/handlers remain unavailable. The new policy APIs are exercised through exact injected facts and cannot spawn a process.
- V3 identity/context schemas exist but production transport migration remains part of later integration; no V1/V2 identity wire was widened.
- Full-access eligibility truthfully authorizes ambient current-user authority. It provides no filesystem, credential, registry, network, or broker-escape isolation and cannot prove human presence after same-user unrestricted code runs.
- Evidence remains local and unpublished; there is no Phase 4 commit, push, exact-head CI, or released package.

### Rollback method

Remove the three new V3 policy modules and their tests, restore V3 tool policies to the Gate C fail-closed definitions, remove V3-only config/profile/identity schemas, and restore the prior static capability revision in the policy runtime. Preserve Gate C persisted V3 records/audit data, Phase 4A0/A1 infrastructure, managed toolchains, and append-only history.

### Next step

Begin Task 4A4 with stat-free first-call admission, exact one-use local approval binding, canonical root identity, protected-root exclusions, V3 confirmed-root hard-link count 1, read-only/read-write fixed leases, and expiry/revocation process cleanup. This Volume 1 is now above the 48,000-byte rollover threshold and is closed; start STEP-319 in `docs/memory/archive/phase-4-part-2.md` without rewriting this file.
