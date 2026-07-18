# Phase 4 Windows Execution and Trusted-Workspace TDD Plan

**Status:** reduced-scope Phase 4 is published and exact-head closed; strong workspace sandbox work is deferred
**Date:** 2026-07-16
**Scope decision:** 2026-07-17 — close Phase 4 around Phase 4A trusted-code execution; retain 4B0 evidence without activating or claiming an OS sandbox
**Exact design:** `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`
**Current checkpoint:** Tasks 4A0a through 4A10, diagnostic 4B0, 4C0, 4C1, and publication Task 4C2 are complete; closure head `d19e65b` passed exact-head run `29603060944`; 4B1–4B6 and `workspace` remain deferred

## 1. Deliverable

Phase 4 adds an opt-in exact 39-tool Contract V3 with:

- brokered, locally confirmed access to ordinary local directories outside configured roots;
- truthful current-user `full_access` command/process execution for trusted code;
- bounded Windows-native Job/pipe/ConPTY lifecycle;
- V3-only exact local approvals and emergency process control;
- truthful trusted-code operation without claiming filesystem, credential, registry, broker, or network isolation;
- retained AppContainer/LPAC diagnostic evidence for a possible future sandbox redesign, outside the current Phase 4 closure scope.

The implementation order is evidence-first:

```text
runner safety
  -> native host feasibility
  -> local IPC feasibility
  -> atomic V3 approval state
  -> complete V3 compatibility migration
  -> confirmed-root admission
  -> full-access execution for trusted repositories
  -> retained restricted-identity diagnostic
  -> reduced-scope adversarial acceptance
```

No public process tool is added until the runner, native host, and local approval gates pass.

## 2. Rules for every implementation task

1. Inspect `git status --short`, relevant source, tests, config, phase archive size, and overlapping user changes.
2. Write the narrow failing test first and retain the expected RED evidence.
3. Implement only the task's behavior; do not mix unrelated refactors.
4. Run the narrow test, build, relevant contract/smoke tests, `git diff --check`, secret checks, scope checks, and `npm run policy:check`.
5. Run Windows handle/process/path-sensitive behavior under both managed Node 20 and 24.
6. Append the complete step to `docs/memory/archive/phase-4.md` and update `Memory.md` after every meaningful completed task.
7. Do not stage, commit, or push before the complete approved Phase 4 boundary.

Correct managed-toolchain syntax:

```powershell
node scripts/toolchain-manager.mjs exec --major 20 -- node --test <ordinary-test-files>
node scripts/toolchain-manager.mjs exec --major 24 -- node --test <ordinary-test-files>
```

Correct detached ordinary-domain shape:

```powershell
node scripts/long-task-runner.mjs list
node scripts/long-task-runner.mjs start --kind phase4-node20-ordinary -- node scripts/toolchain-manager.mjs exec --major 20 -- node scripts/test-domains.mjs run --domain ordinary
```

The returned run ID must be retained and checked with `status`; logs are read through bounded ranges. The runner does not accept `--domain`. Job, ConPTY, signals, process-tree kill, child/host crash, sandbox network, broker escape, and destructive runner tests belong in `CONTROL_DOMAIN_TESTS` and run only in GitHub Actions or an independently proven native terminal/process domain. A custom script cannot bypass domain classification; a registered control `.test.mjs` must own it.

Gate O has one deliberate bootstrap exception: its own destructive stop-identity oracle is invoked directly by the already independent CI/native control harness, never through the runner being tested. Gate O blocks later runner-mediated process/control work, not the direct evidence needed to prove Gate O itself. Once Gate O closes, every later control test returns to the registered domain/runner rules.

## 3. Gates

| Gate | Blocks | Evidence |
| --- | --- | --- |
| O | all later runner-mediated process/control testing | runner PID/creation-time/nonce identity, bounded logs, exact stop ownership proved outside that runner |
| N | production native host | Job/pipe/timeout/PowerShell/ConPTY behavior on supported Windows and Node 20/24 |
| A0 | local approvals | real pipe/state ACL and exact server routing |
| A1 | any V3 R3 handler | bounded pending state and atomic one-use grant consumption |
| C | V3 activation | exact 39 tools, V2 inheritance, persisted-state compatibility, V1/V2 freeze |
| F | confirmed roots/full access | exact root lease and truthful ambient-authority policy/results |
| S | optional future workspace sandbox only | retained 4B0 evidence; no activation or publication claim in the reduced Phase 4 scope |
| E | positive egress | deliberately unavailable in Phase 4 |
| P | publication | full local gate, docs/memory reconciliation, one commit/push, exact-head CI |

Failure is supported, but it stops the dependent work. No fallback weakens the claim.

## 4. Phase 4A — execution and confirmed full access

### Task 4A0a — Harden the detached runner before process tests

**Goal:** prove a stale run ID cannot kill a reused PID and output floods cannot fill the disk.

**Add:**

- `test/runner-process-identity.test.mjs`
- `test/runner-stop-identity-windows-control.test.mjs`
- `test/runner-log-bounds.test.mjs`
- bounded runner identity/output fixtures

**Modify:**

- `scripts/long-task-runner.mjs`
- `scripts/run-and-summarize.mjs` if its raw logs are unbounded
- `scripts/test-domains.mjs`
- `test/operational-reliability.test.mjs`
- `AGENTS.md` only if the verified operational contract changes

**RED cases:**

- a state record whose PID now belongs to a different process is `stale`, never `running`;
- `stop --run` checks worker nonce, process creation time, command identity, and expected worker evidence before `taskkill`;
- identity mismatch refuses stop and keeps the unrelated control alive;
- stdout/stderr each have a hard retained/logged byte cap, a dropped-byte count, and a bounded tail;
- output flood cannot block status/result creation;
- same-kind active run detection uses verified identity, not PID existence alone;
- result/status paths remain under the intended `.ai-bridge` root after reparse/replacement attempts.

**Implementation:**

- Record a random worker nonce in command/state and require the worker to publish matching live evidence.
- On Windows, record and re-read process creation time before declaring ownership.
- Treat ambiguous identity as stale and fail closed.
- Keep exact-run stop semantics; never enumerate/kill generic `node.exe`.

**Verification:**

- Pure parser/state tests may run as ordinary narrow tests.
- `runner-stop-identity-windows-control.test.mjs` is explicitly registered in `CONTROL_DOMAIN_TESTS`; the actual PID-reuse/stop oracle runs directly in the existing independent CI/native control harness and never through the pre-fix runner or synchronously through the connector.
- Run `npm run policy:check` and the existing operational reliability suite.

**Rollback:** restore the old runner only if no Phase 4 process/control work has begun; otherwise the gate remains mandatory.

### Task 4A0b — Extend native mutation inventory and prove the host candidate

**Goal:** ensure C#/PowerShell native behavior is statically reviewed, then prove the source-shipped helper without adding a public tool.

**Add:**

- `test/native-host-architecture.test.mjs`
- `scripts/windows-process-host-spike.ps1`
- `scripts/windows-process-host-spike.cs`
- `scripts/windows-process-host-spike.mjs`
- `scripts/windows-process-host-protocol-v1.json` (single machine-readable constant source)
- `test/windows-process-host-protocol.test.mjs` (ordinary parser/state tests)
- `test/windows-process-host-control.test.mjs` (control)
- bounded process-tree/PowerShell/ConPTY fixtures

**Modify:**

- `test/mutation-architecture.test.mjs`
- `scripts/test-domains.mjs`
- `package.json`
- package-content tests

**Static RED cases:**

- every shipped C#/PowerShell `CreateProcess`, Job, handle, named-pipe/DACL, AppContainer, ACL, snapshot copy/delete, and profile operation is inventoried by repository path, API/syscall, and normalized semantic digest;
- line/column are diagnostic only;
- additions/drift fail closed;
- no directory/pattern exemption is permitted.

**Native RED cases:**

- fixed `-NoLogo -NoProfile -NonInteractive` PowerShell launch, fixed cwd, bounded environment, and nonce handshake;
- wrong protocol/version/nonce, oversized/truncated/duplicate/out-of-order frame refusal;
- `STARTUPINFOEX` creation-time Job assignment and exact handle list;
- close Job kills ordinary child/grandchild but keeps an unrelated control alive;
- nonce-bound WMI/COM broker creation demonstrates and cleans one exact escaped process while reporting `broker_escape_resistance: none`; no broad kill is permitted;
- parent EOF, host crash, Node crash, partial spawn, and timeout close all owned handles/children;
- native monotonic deadline still fires under output flood;
- PowerShell UTF-8 complete-script bootstrap preserves Unicode and the exact exit table: empty/success `0`, captured PowerShell failure `1`, final observed native `$LASTEXITCODE`, explicit Win32 `exit N`, and parse/terminating error `1`;
- user profile/PATH/PSModulePath/TEMP poisoning has no effect;
- ConPTY create/read/write/resize/ETX/close succeeds or returns an exact capability failure;
- Windows build 19044 close ordering drains output; a five-second stuck `ClosePseudoConsole` makes the host fatal and an exact-host watchdog restarts it, revoking all Jobs owned by that host;
- parent-in-Job conditions are proved or return `JOB_ASSIGNMENT_UNAVAILABLE`.

**Implementation:**

- Use raw standard streams for protocol; PowerShell pipeline output may never touch stdout.
- Generate/check one shared protocol-constant source that exactly matches the spec's 64-byte `CXP4` header, numeric kinds/flags, direction-specific HMAC-SHA-256 tags, 64-KiB frame limit, request limits, byte queues, credit, and overflow behavior.
- Keep spike code outside production runtime.
- Emit capability evidence only below ignored `.ai-bridge/phase-4/`.

**Stop:** Gate N fails. Do not add a native package, prebuilt binary, `node-pty`, direct spawn, PATH helper, or `taskkill` fallback without a new decision.

### Task 4A1a — Prove local named-pipe and state ACLs

**Goal:** validate the local approval transport before building approval semantics.

**Add:**

- `scripts/windows-local-control-spike.ps1`
- `scripts/windows-local-control-spike.cs`
- `test/local-control-protocol.test.mjs` (ordinary)
- `test/local-control-pipe-windows-control.test.mjs` (control)

**Modify:**

- `scripts/test-domains.mjs`
- native host inventory

**RED cases:**

- random server ID and pipe name;
- actual pipe owner/DACL permits current user/SYSTEM, and its medium-integrity mandatory label plus post-connect impersonation rejects wrong-user, low-integrity, and AppContainer clients;
- descriptor readback verifies owner, DACL, SACL, and mandatory label; `PIPE_REJECT_REMOTE_CLIENTS` is separately verified from the exact `CreateNamedPipe` call inventory and a real remote refusal test, never inferred from the descriptor;
- state root/file owner/DACL are verified, not assumed;
- reparse-point, hard-link, stale PID/creation-time, nonce, and replacement attacks fail;
- startup secret travels only through private inherited/local IPC, not argv/environment;
- multiple servers are unambiguous and the client never selects “latest” implicitly;
- an owned Job child is rejected where client-PID/Job evidence is available;
- cleanup leaves no state/pipe/ACL artifact.

**Stop:** Gate A0 fails. No MCP approval tool may be added as a workaround.

### Task 4A1b — Implement bounded V3-only approval state and atomic consumption

**Goal:** make V3 approvals exact, usable, auditable, and concurrency-safe without changing V1/V2 wire behavior.

**Add:**

- `src/policy/pendingApprovals.ts`
- `src/policy/authorizationFacts.ts`
- `src/control/localApprovalServer.ts`
- `src/control/localApprovalClient.ts`
- `src/control/schemas.ts`
- `src/audit/lifecycleV3.ts`
- `scripts/windows-local-control.ps1`
- `scripts/windows-local-control.cs`
- `scripts/windows-local-control-manifest.json`
- `test/policy-pending-approval.test.mjs`
- `test/policy-grant-consumption.test.mjs`
- `test/approval-multi-server.test.mjs`
- `test/cli-approvals.test.mjs`
- `test/approval-display-safety.test.mjs`
- `test/audit-lifecycle-v3.test.mjs`

**Modify:**

- `src/policy/approval.ts`
- `src/policy/runtime.ts`
- `src/policy/evaluator.ts`
- `src/policy/integration.ts`
- `src/productionRuntime.ts`
- `src/audit/types.ts`
- `src/audit/schemas.ts`
- `src/audit/store.ts`
- `scripts/codexpro.mjs`
- `scripts/codexpro-entry.mjs`
- package-content tests and `scripts/test-domains.mjs`
- audit schemas/store/query
- package/native mutation inventories

**RED cases:**

- V1/V2 keep exact failure snapshots and create no pending approval;
- V3 identical requests dedupe without TTL extension;
- server 32/session 8/rate 10 per minute limits and `APPROVAL_QUEUE_FULL`;
- request, prepare, approve, deny, expire, reserve, consume, and burn form one closed state machine;
- changed canonical action, semantic facts, identity binding, credential revision, transport, workspace/lease, policy/evidence revision, contract, or risk cannot match;
- R3 is at most two minutes and one use;
- two concurrent exact retries yield exactly one authorization and one handler call;
- reservation occurs before handler; required audit failure burns R3 and executes zero times;
- approval transitions persist strict schema-3 lifecycle records while existing V2 authorization/terminal execution events remain unchanged;
- repeated approve/deny calls are idempotent and cannot issue a second grant;
- transport/policy/evidence/server close revokes pending/grants;
- direct/supertool canonical actions can share the exact intended grant and unrelated tools cannot;
- ANSI/C0/C1/newline/backspace/Bidi/homoglyph/long-argument summaries cannot spoof the local terminal;
- CLI always requires `--server`, defaults timeout/ambiguous input to deny, and reveals no environment secret.
- production pipe creation is byte/semantic-digest identical to the Gate-A0-proven native factory; TypeScript cannot create an alternate pipe;
- production parity re-runs descriptor, mode-flag, token-integrity/AppContainer, remote-client, and multiple-server tests against packaged sources.

**Implementation:**

- Add atomic `reserveMatching`/`commitConsume`/`burnReservation`; do not pass a reusable snapshot to the evaluator and assume it was consumed.
- Pending facts live in the owning production runtime, never a global singleton.
- Add the persisted `AuditEventV2 | AuditEventV3` envelope reader and schema-3 lifecycle writer before the first approval transition can complete; public V2/V3 query projection migration remains Task 4A2.
- Promote the exact Gate-A0 native pipe factory into the packaged `windows-local-control` sources; TypeScript owns only framing, routing, and approval state.
- Persist required transition audit; an unpersistable R3 reservation is burned and never executes.
- Add `approvals list/watch/approve/deny` and local `processes list/terminate` commands.
- Approval error returns a safe next action and exact server selector, then instructs the remote client to retry the identical semantic call.

**Stop:** an exact transport/session binding or atomic one-use invariant cannot be proved.

### Task 4A2 — Migrate the complete contract stack and freeze V3 public/persisted encodings

**Goal:** add exact V3=39 without losing any inherited V2 behavior or persisted-state reader.

**Add:**

- `src/tools/contracts/v3.ts`
- `src/tools/schemas/openFullAccessWorkspace.ts`
- `src/tools/schemas/execution.ts`
- `test/phase-4-contract-v3.test.mjs`
- `test/phase-4-v3-inherited-contract.test.mjs`
- `test/phase-4-v3-persistence.test.mjs`
- `test/phase-4-v3-audit-persistence.test.mjs`

**Modify:**

- `src/config.ts`
- every file under `src/tools/contracts/` affected by versioning
- `src/tools/schemas/codexpro.ts`
- `src/tools/phase3dServer.ts`
- `src/codexproSupertool.ts`
- every `toolContractVersion === 2` branch in `src/server.ts`
- `src/changesets/types.ts`
- `src/changesets/schemas.ts`
- `src/changesets/undo.ts`
- `src/changesets/moveUndo.ts`
- `src/moves/service.ts`
- `src/mutations/writers.ts`
- `src/mutations/localService.ts`
- `src/audit/types.ts`
- `src/audit/schemas.ts`
- `src/audit/store.ts`
- `src/audit/queryTool.ts`
- `src/tools/schemas/queryAuditEvents.ts`
- transaction/manifest/change-set readers and tests

**RED inventory first:**

- enumerate every equality/union/schema/fixture that assumes only 1/2;
- enumerate every `attachPreparedFileMutation`, `attachPreparedPatchMutation`, `attachPreparedBatchMutation`, move, generic undo, and move-undo caller, including export/handoff/self-test/local-service paths and every hard-coded contract `2`;
- establish `contractIncludesV2(version)` or descriptor-driven feature predicates;
- forbid scattered mechanical `>= 2` where persisted-schema meaning differs.

**Contract RED cases:**

- V1 exactly 28 and V2 exactly 31, unchanged names/schemas/approval failures;
- V3 exactly 39: V2 minus `bash`, plus nine exact additions;
- standard exposes `run_command` + `read_process_output`; `run_command` returns the retained terminal `process_id` that makes later reads functional; full exposes all nine; minimal/connection none;
- `open_full_access_workspace` has no alias and is full-only;
- V3 inherits all 30 non-Bash V2 tools in direct and supertool forms;
- V3 inherited write/edit/apply_patch/move/undo/`query_audit_events` operations preserve atomic/audit wire semantics;
- V3 write/edit/apply-patch/export/handoff/self-test/local-batch mutations plus schema-1 V3 undo records write `ChangeSetManifestV1 { schemaVersion: 1, contractVersion: 3 }`;
- every successful prepared batch mutation emits a manifest; `retainChangeSet: false` still emits contract `3` with `undoSupported: false` and `undoReason: "retention_disabled"`, suppressing only undo material/capability;
- V3 move and move-undo records write `MoveChangeSetManifestV2 { schemaVersion: 2, contractVersion: 3 }`;
- strict readers accept only schema/contract pairs `1/(1|2|3)` and `2/(2|3)`; no `ChangeSetManifestV3` exists because the record shape did not change;
- transaction/prepared-mutation schema versions remain unchanged, while their contexts/manifests carry exact caller contract; undo preserves `revertsChangeSetId` and writes the undo caller's contract rather than copying the source contract;
- same-binary config rollback to V2 can undo an owned V3 record by known ID and query its retained V2 authorization/execution evidence through the unchanged V2 audit projection; V2 undo emits contract `2`; no change-set enumeration tool or older-binary downgrade is claimed;
- manifest MAC verification covers schema, contract, lineage, owner, policy, and operations for every accepted pair;
- `AuditEventV2` and V2 query input/output remain exact; V3 lifecycle writers persist strict `AuditEventV3` approval/root/process/snapshot transitions inside the existing MAC-chained envelope union;
- V3 actions retain V2 authorization/terminal execution evidence; V2 query verifies the full chain, filters V3 before V2 pagination, advances cursors by the last emitted V2 sequence, and cannot loop on hidden V3 records;
- V3 query returns schema `3` with the V2/V3 event union and a domain-separated projection-bound cursor; V2/V3 cursors are mutually invalid and config rollback never rewrites/deletes V3 evidence;
- unknown/extra fields and generic command strings fail strict parsing;
- V3 standard/full refuses startup outside enforce + required durable audit + stable session + atomic runtime;
- legacy/shadow/best-effort cases call no handler and spawn zero children.

**Implementation:**

- Add disabled V3 registrations only after contract migration tests are green.
- Widen `ChangeSetManifestV1.contractVersion` and generic mutation contexts to `1 | 2 | 3`; widen `MoveChangeSetManifestV2.contractVersion` to `2 | 3`; keep storage schema names/numbers unchanged.
- Thread the caller contract through server export/handoff/self-test paths, local mutation service, move service, generic undo, and move undo; no production writer may hard-code V2 for a V3 call.
- Replace every V2 capability equality with an explicit descriptor/capability predicate, but keep persisted-record dispatch keyed first by `schemaVersion` and then by the exact allowed pair.
- Add `PersistedAuditEvent = AuditEventV2 | AuditEventV3` only at the store/envelope layer. Keep V2 public schemas untouched; add separate V3 query schemas/projector/cursor codec and filter V3 before V2 matching/paging.
- Keep V3 nondefault.
- Keep V1/V2 `CODEXPRO_BASH_MODE` behavior; V3 never maps it.

### Task 4A3 — Add V3 composite policy, capabilities, and semantic authorization facts

**Goal:** authorize the exact resolved action and prevent `process:manage` from becoming an execution bypass.

**Add:**

- `src/policy/executionResources.ts`
- `src/policy/executionCapabilities.ts`
- `src/policy/fullAccessResources.ts`
- `test/phase-4-policy-resources.test.mjs`
- `test/phase-4-authorization-facts.test.mjs`
- `test/phase-4-capabilities.test.mjs`

**Modify:**

- `src/policy/types.ts`
- `src/policy/schemas.ts`
- `src/policy/resources.ts`
- `src/policy/toolPolicy.ts`
- `src/policy/runtime.ts`
- `src/policy/enforcement.ts`
- `src/policy/profileStore.ts`
- `src/policy/compat.ts`
- `src/config.ts`

**RED cases:**

- `run_command` requires execute; `start_process` requires execute + manage + persistent; handle actions cannot start code;
- `full_access` adds `host:full-access` and explicit Permission Profile eligibility for ambient files/credentials/registry/network;
- any profile requiring child path/credential/registry/device/network/sandbox enforcement returns `PROCESS_POLICY_UNENFORCEABLE` before approval;
- full-access empty network request still reports unrestricted host network;
- semantic facts bind exact scripts/argv/env/cwd/backend identity/terminal/deadline/lifetime/network posture/access mode/context revisions;
- Windows environment keys are case-insensitive, duplicate-safe, and the effective map—not caller map—is digested;
- process input binds generation and exact bytes;
- raw scripts/args/env/canonical private roots never enter audit summaries;
- read/list/resize are R0 only after owned-handle/context checks;
- evidence revision change revokes pending/grants/process/workspace state through callbacks.

**Implementation:**

- Add versioned multi-scope policy definitions.
- Keep V1 schemas/resources frozen.
- Make the capability evidence store per server and live-revisioned.

### Task 4A4 — Implement confirmed-root admission and fixed leases

**Goal:** deliver the user-requested brokered ability to reach normal local files outside configured roots after local confirmation.

**Add:**

- `src/access/fullAccessLease.ts`
- `src/access/rootAdmission.ts`
- `src/access/protectedRoots.ts`
- `test/full-access-contract.test.mjs`
- `test/full-access-paths-windows.test.mjs`
- `test/confirmed-root-hard-links-windows.test.mjs`
- `test/full-access-lease.test.mjs`
- `test/full-access-warning.test.mjs`

**Modify:**

- `src/guard.ts`
- `src/productionRuntime.ts`
- `src/server.ts`
- V3 policy resolver/registration
- list/close workspace V3 projections as required

**RED cases:**

- first remote request is stat-free and cannot distinguish nonexistent/protected/inaccessible/valid roots before local review;
- local approval binds canonical root, volume serial, directory ID, access class, lease duration, identity/transport/credential/policy/contract/evidence revisions;
- retry atomically consumes approval and revalidates identity before a random handle is created;
- root replacement, drive-letter remap, junction/reparse, case drift, and policy drift fail;
- every V3 confirmed-root ordinary file requires `NumberOfLinks === 1`; authorization binds volume serial/file ID/link count and stable-handle checks run immediately before read or mutation and before mutation commit;
- a protected-root file hard-linked into an approved ordinary directory is skipped with bounded omission metadata by read/search/tree and fails closed through write/edit/apply-patch/move/delete/undo providers;
- concurrent link-count or file-identity drift rolls back the transaction; these hard-link rules do not change V1/V2 or configured-root behavior;
- read-only lease cannot write even when global write mode permits;
- ten-minute idle and thirty-minute absolute expiry are independent; ordinary `touch()` never extends absolute expiry;
- handle keys include access class/lease and cannot reuse a configured-root handle;
- lease never changes/persists `allowedRoots` and never survives restart;
- blocked globs remain anchored at volume/stricter policy root, so opening `.ssh`/`.git` cannot rebase protection away;
- CodexPro control/audit/identity/state, Codex auth/config, credential/browser stores, device/UNC/mapped/ADS/reserved paths remain blocked;
- query-token/Bearer identity is bound without exposing token values;
- expiry/revocation first quarantines process input and terminates bound Job members, without claiming control of a full-access broker escape.

**Implementation:**

- Add `open_full_access_workspace` only in V3/full.
- Keep ordinary `open_workspace` semantics unchanged in all contracts.
- Return access class and absolute expiry in V3 workspace metadata.
- Do not automatically authorize a current-user process from a confirmed root.

**Narrow verification:** V3 full-access tests, existing workspace lifecycle/path policy, V1/V2 open workspace snapshots, build, and policy check.

### Task 4A5 — Build bounded output, streaming redaction, AEAD cursors, and quotas

**Goal:** make output safety independent from the native process implementation.

**Add:**

- `src/process/outputRing.ts`
- `src/process/outputQuota.ts`
- `src/process/outputCursor.ts`
- `src/process/streamingRedactor.ts`
- `test/process-output-ring.test.mjs`
- `test/process-output-quota.test.mjs`
- `test/process-output-cursor.test.mjs`
- `test/process-streaming-redaction.test.mjs`

**Modify:**

- `src/redact.ts`
- `scripts/output-bounds.mjs`
- `test/output-bounds.test.mjs`

**RED cases:**

- known secret prefix split at every byte boundary;
- unbounded token length, missing terminator, EOF flush, and fixed candidate memory;
- UTF-8 split/invalid bytes, ANSI/log injection, and redaction-before-retention;
- explicit proof that metadata says best-effort and no test claims arbitrary encoded-secret DLP;
- ring eviction, old cursor, concurrent readers, exit wakeup, cancelled waits, and terminal cleanup;
- AEAD/random-map cursor hides sequence/intra-chunk offset and rejects forge/context/version/expiry drift;
- `max_bytes=1` resumes inside a chunk without loss/duplication;
- per-process/server/session/terminal-record caps and session reservations;
- noisy-process overflow terminates only that producer, never blocks host control or evicts unrelated reservations.

**Implementation:**

- Use an injected clock/key/quota manager.
- Redact before storing any byte.
- Retain one-shot terminal output for five minutes and return a `process_id` consumable by `read_process_output`.

### Task 4A6 — Promote the native host and define backend identity

**Goal:** productionize only Gate-N-proven primitives with a complete bounded protocol and package supply-chain check.

**Add:**

- `scripts/windows-process-host.ps1`
- `scripts/windows-process-host.cs`
- `scripts/windows-process-host-manifest.json`
- `src/process/windowsHostProtocol.ts`
- `src/process/windowsHostClient.ts`
- `src/process/backendDiscovery.ts`
- `src/process/commandCompiler.ts`
- `src/process/types.ts`
- `test/windows-process-host-integration-windows-control.test.mjs`
- `test/backend-discovery.test.mjs`

**Modify:**

- `src/productionRuntime.ts`
- `src/server.ts`
- `scripts/test-domains.mjs`
- packaging, native inventory, package tests

**RED cases:**

- one host per production runtime; no global sharing;
- fixed package-root files, policy-generated manifest digests, no workspace/PATH shadowing;
- manifest/file identity revalidation before `Add-Type`;
- exact backend discovery: reviewed explicit path, verified PowerShell 7 locations, built-in Windows PowerShell, verified Git Bash;
- executable replacement-denying handle held through spawn and post-create image identity verification;
- exact shared 64-byte protocol envelope, kind/flag values, directional HMAC keys, sequence/correlation, frame/request/queue limits, credit, overflow, cancellation, and fatal state machine;
- host/node EOF/crash revokes every process and closes every Job;
- stuck ConPTY close marks the host fatal, terminates/restarts the exact host, and reports that every Job owned by that server host may be terminated;
- native deadline survives Node stall;
- stdout protocol-only, stderr bounded safe codes;
- package tarball contains exact production sources/manifest and no unapproved spike artifacts.

**Implementation:**

- Generate/check the host manifest through a repository-policy gate, not an ad hoc release note.
- No unverified binary or native addon.

### Task 4A7 — Implement one-shot `full_access` execution

**Goal:** produce the first usable command result with truthful ambient-authority warnings and exact local confirmation.

**Add:**

- `src/process/runCommand.ts`
- `test/run-command-contract.test.mjs`
- `test/run-command-windows-control.test.mjs`
- `test/full-access-execution-policy.test.mjs`

**Modify:**

- `src/server.ts`
- `src/productionRuntime.ts`
- `scripts/test-domains.mjs`
- V3 schemas/policy/audit/result projections

**RED cases:**

- direct argv preserves empty/spaced/quoted/Unicode/metacharacter arguments with no shell parse;
- fixed PowerShell bootstrap keeps script out of argv/log/audit and implements the exact empty/PowerShell/native/explicit/parse-error exit-code table;
- backend identity drift after approval burns grant and spawns zero;
- full-access approval summary binds command, effective environment, cwd, fixed lifetime, backend identity, and all `none` isolation facts;
- result says current-user unrestricted files/credentials/registry/network and host writeback possible;
- result says `process_tree_control: job_object_members_only` and `broker_escape_resistance: none`; timeout/termination/lifetime claims cover only recorded Job members;
- permission profile without explicit ambient/unrestricted-host-network allowance refuses before approval;
- nonzero/timeout/user termination return completed result;
- `run_command` returns terminal `process_id`, first page, and later pagination;
- known-pattern redaction works, while an encoded-secret fixture proves no DLP claim;
- workspace/blocked path validation is not asserted as a child boundary;
- V1/V2 Bash is unchanged.

**Verification:** schema/policy tests may run ordinary; `run-command-windows-control.test.mjs` is registered in `CONTROL_DOMAIN_TESTS` because it launches and terminates real Windows processes.

**Implementation:**

- Support `argv` and Windows PowerShell first; add PowerShell 7/Git Bash only after exact discovery evidence.
- Full-access is for trusted code. Never call it safe/sandboxed.

### Task 4A8 — Implement persistent process ownership and lifecycle audit

**Goal:** add persistent pipes, handle operations, exact revocation, and local emergency control.

**Add:**

- `src/process/processManager.ts`
- `src/process/processAuditCoordinator.ts`
- `test/process-manager.test.mjs`
- `test/process-lifecycle-windows-control.test.mjs`
- `test/process-local-control-cli.test.mjs`
- contract tests for start/read/write/interrupt/terminate/list

**Modify:**

- `src/productionRuntime.ts`
- `src/server.ts`
- transport/workspace/policy/evidence close paths
- audit schema/store/query
- `scripts/test-domains.mjs`

**RED cases:**

- random handle and process generation; no host PID/root/command projection;
- quota checked before spawn; one noisy session cannot starve another;
- cross-server/session/identity/workspace/lease/contract/policy/evidence handles all return `PROCESS_NOT_FOUND`;
- each input is a fresh exact R3 and concurrent retry writes exactly once;
- process start requires execute + manage + persistent composite scopes;
- output read/list/resize are R0 only after exact ownership/context checks;
- terminate/interrupt risk and idempotence match design;
- workspace/lease close, transport close, policy/evidence change, expiry, host/server crash follow quarantine -> owned-Job terminate -> handles -> lifecycle audit -> cleanup;
- lifecycle results always expose `job_object_members_only`/`broker_escape_resistance: none`; no expiry, terminate, or crash path claims to find a WMI/COM/scheduler/service-brokered escape;
- natural exit creates a lifecycle event without reusing the existing one-terminal-execution slot;
- local process terminate works even when remote approval/audit request path is unavailable;
- terminal record count and expiry are bounded;
- restart restores no public process but cleans authenticated state safely.

**Implementation:** one manager/audit coordinator per production runtime; no process-global manager.

### Task 4A9 — Add ConPTY and interactive semantics

**Goal:** complete interactive PowerShell without conflating input delivery, process survival, or sandboxing.

**Add:**

- `test/process-conpty-contract.test.mjs` (ordinary schemas/state)
- `test/conpty-close-order-windows-control.test.mjs` (control)

**Modify:**

- process manager/host protocol/host C#/server
- `scripts/test-domains.mjs`

**RED cases:**

- interactive PowerShell starts `-NoProfile` and does not reuse one-shot stdin bootstrap;
- single terminal stream, UTF-8 I/O, bounded resize;
- every input call uses exact R3 facts;
- ETX reports delivered and permits either running or exited target outcome;
- unsupported pipe Ctrl+Break returns `INTERRUPT_UNSUPPORTED` without termination;
- close ordering/drain/watchdog passes on Windows build 19044;
- resize/input/output/terminate races produce one terminal state and no handle leak;
- unrelated control remains alive.

**Verification:** control test only in the registered control domain under managed Node 20/24; never direct through the connector.

### Task 4A10 — Close Phase 4A integration

**Status:** complete and published as part of the closed reduced Phase 4 boundary.

**Goal:** prove no direct, supertool, compatibility, approval, or lifecycle bypass remains.

**Add:**

- `test/phase-4a-integration.test.mjs`
- `test/phase-4a-adversarial.test.mjs`
- `scripts/phase-4a-smoke.mjs` owned by a registered test/domain wrapper

**Modify:**

- registration, doctor/config diagnostics, package/domain/CI definitions as required

**RED cases:**

- direct and supertool paths share exact handler/policy/approval/host/manager/redactor/audit instances;
- hidden/disabled tools cannot be reached through stale aliases/actions;
- V3 legacy/shadow/best-effort audit runs zero handlers;
- V1/V2 exact contract/policy wire remains unchanged;
- confirmed-root and current-user full-access facts remain visibly distinct;
- local approval cannot be reached by an AppContainer fixture candidate;
- current-user full-access warning says the state machine requires a fresh local record but only the first start, absent pre-existing unrestricted code, can be claimed to follow a human action; no later unforgeable human-presence claim appears;
- full-access process results and lifecycle tests say Job-member-only control and no broker-escape resistance;
- every failure path leaves no child/Job/pipe/pending grant/lease leak;
- doctor reports backend, Job, ConPTY, approval pipe, confirmed roots, full access, and sandbox evidence separately.

**4A checkpoint:** the approved trusted-code runtime scope, documentation reconciliation, and complete local gate are closed. Only Task 4C2 publication and exact-head CI remain.

## 5. Phase 4B — deferred optional OS-sandbox research

### Scope decision

The project is primarily for the user's own repositories and trusted local code. A strong untrusted-code sandbox is therefore not required for the current product goal and must not block Phase 4 publication or Phase 5 work.

The current operating model is:

- use brokered `configured_roots` or `confirmed_roots` for ordinary file work;
- use `full_access` only for repositories, scripts, and dependencies the user trusts;
- retain per-action local approval, bounded output, durable audit, exact backend identity, Job-member lifecycle control, and emergency termination;
- clearly state that `full_access` has ambient current-user filesystem, credential, registry, IPC, broker, and network authority;
- keep `workspace` hidden and unavailable rather than publishing a weaker feature under a sandbox name.

### Task 4B0 — Retain the restricted-identity capability probe

**Status:** complete locally and retained as diagnostic evidence only.

The probe established that the current AppContainer/LPAC approach does not satisfy the former strong sandbox contract. The blocked result remains factual evidence and must not be rewritten as success. Existing probe code and tests remain non-production diagnostics and package exclusions unless a future sandbox redesign explicitly adopts them.

The 4B0 evidence is no longer a Phase 4 publication gate. Its required maintenance boundary is limited to:

- buildability and exact package exclusion;
- no persistent firewall, WFP, service, scheduler, shared-runtime ACL, or machine-policy changes;
- authenticated cleanup of only probe-owned temporary profiles, ACLs, Jobs, handles, trees, and registry canaries;
- bounded, non-secret diagnostic output;
- no activation path from configuration, contracts, aliases, doctor, or stale capability evidence.

### Tasks 4B1 through 4B6 — Deferred

The filtered snapshot, two-stage prepared execution, production AppContainer/LPAC backend, immutable sandbox environment, deny-all network enforcement, workspace integration, and full sandbox adversarial matrix are removed from the current implementation sequence.

They may be reconsidered only as a separately approved future phase with a new threat model and architecture. A future design should prefer a real OS boundary such as Hyper-V, Windows Sandbox, or an isolated VM-backed executor if untrusted-code execution becomes a genuine requirement. It must not reuse the `workspace` name until its claims are independently proved.

### Reduced-scope acceptance

Phase 4B is complete for the current personal-use scope when:

1. `workspace` remains unavailable and cannot fall back to `full_access`;
2. public docs describe `full_access` as trusted-code ambient authority, not sandboxed execution;
3. existing 4B0 diagnostics cannot be reached through production tools;
4. the complete Phase 4A regression, compatibility, audit, lifecycle, policy, package, and exact-head gates pass;
5. no documentation claims untrusted-code, credential, broker, filesystem, registry, or network isolation.

## 6. Phase 4 closure

### Task 4C0 — Reconcile documentation only after runtime evidence

**Status:** complete locally; public configuration, FAQ, security, UI copy, rules, memory, and roadmap now match the reduced trusted-code scope.

Update:

- `README.md`
- `README_ZH.md`
- `SECURITY.md`
- `design.md`
- `AGENTS.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- `docs/memory/archive/phase-4.md`

Documentation must distinguish:

- confirmed brokered roots from ambient full-access processes;
- local decision-record workflow from secure human-presence proof and OS isolation;
- Job from sandbox and ConPTY from both;
- Job-member lifetime/termination from unbounded full-access broker escapes;
- known-pattern redaction from DLP;
- trusted-code `full_access` from any OS sandbox claim;
- retained 4B0 diagnostics from production capabilities;
- unavailable `workspace` from an implemented execution mode.

The reduced-scope decision has been made: close Phase 4 around Phase 4A, retain truthful 4B0 blocked evidence, and defer all strong sandbox implementation. Do not silently publish a failed or weakened workspace promise.

### Task 4C1 — Full local gate

**Status:** complete locally. Managed Node 20.20.2 and 24.15.0 ordinary domains passed 880/881 with one established platform skip each; control domains passed 100/100 each; both eight-part Smoke suites, build, focused 115-test gate, policy, package dry-run, links, secrets, inventories, and diff checks passed.

Run with fresh output, in order:

1. V1/V2/V3 exact contract and persisted-state migration tests;
2. approval/root/policy/output/native protocol ordinary tests;
3. `npm run build`;
4. managed Node 20/24 ordinary domains through the hardened detached runner;
5. managed Node 20/24 control domains only in approved external/CI domain;
6. complete Smoke and package tests;
7. `npm run policy:check`;
8. `git diff --check`;
9. secret-content scan that reports only safe code/file locations;
10. TypeScript plus C#/PowerShell mutation/native-host inventories;
11. intended Git scope and archive/index size checks;
12. neat-freak rule/document/memory reconciliation;
13. rerun every gate affected by reconciliation.

Classify every command as passed, code-failed, not run, environment-blocked, or platform-skipped.

### Task 4C2 — Publish once and require exact-head CI

Under the existing complete-phase authorization:

1. confirm intended Phase 4 scope;
2. stage once;
3. create one concise English Phase 4 commit;
4. push current branch;
5. run exact-head diagnostics with the exact 40-character HEAD;
6. require Ubuntu/Windows Node 20/24 Build, complete Regression, protected Smoke, and Package success;
7. keep exact evidence below ignored `.ai-bridge/` and do not create an evidence-only follow-up commit;
8. begin Phase 5 only after exact-head terminal success.

## 7. Cross-cutting matrix

| Dimension | Required values |
| --- | --- |
| Node | managed 20.20.2 and 24.15.0, or an explicitly updated pinned successor |
| Windows build | current 19044 plus CI-supported Windows image facts |
| backend | Windows PowerShell 5.1; PowerShell 7/Git Bash only when present and verified |
| terminal | pipes, ConPTY, unsupported capability |
| contract | V1, V2, V3 |
| tool profile | connection-test, minimal, standard, full |
| policy | legacy, shadow, enforce; V3 privileged paths only enforce |
| access | configured root, confirmed read-only root, confirmed read-write root, trusted-code full access; workspace remains unavailable |
| workspace | active, idle-expired, absolute-expired, closed, foreign, transport/policy/evidence stale |
| process | zero, nonzero, timeout, interrupt, terminate, child/host/server crash |
| output | empty, invalid/split UTF-8, split/long known secret, encoded unknown secret, ring/queue overflow, old/forged cursor |
| deferred sandbox diagnostics | package exclusion, no production activation, probe-owned cleanup, bounded non-secret evidence |
| network | no isolation claim for full access; no workspace network feature is published |

Optional backend absence is a supported skip. Windows PowerShell fallback, local approval, confirmed-root admission, full-access truthfulness, Job ownership, bounded output, and exact V1/V2 compatibility are mandatory for Phase 4 closure. No sandbox backend is selected or published in the reduced scope.

## 8. Final rollback

- Set V3 execution off and confirmed-root admission disabled.
- Refuse new starts, quarantine input, and terminate/drain active Jobs before hiding tools.
- Revoke elevated root leases without touching configured roots.
- Preserve upgraded readers for exact manifest pairs schema `1`/contract `1|2|3` and schema `2`/contract `2|3`, plus authenticated cleanup for newer state; this is same-binary configuration rollback and does not claim older-binary downgrade support.
- Keep authenticated cleanup for any diagnostic AppContainer profile/ACL/Job state created by explicit 4B0 probe runs; production runtime must create none.
- Restore V2 public tools without deleting newer audit evidence or user configuration.
- Never remove user files, credentials, toolchains, branches, worktrees, or unrelated processes.
- No live workspace ACL or system firewall reversal should exist; any such mutation means the implementation violated the design.

## 9. Current implementation checkpoint

Tasks 4A0a through 4A10, diagnostic 4B0, 4C0, 4C1, and publication Task 4C2 are complete. Exact V3=39 trusted-code execution retains its R3, manifest, lifecycle, output, audit, and compatibility guarantees; `workspace` and Tasks 4B1–4B6 remain deferred, and 4B0 stays blocked diagnostic evidence. Closure head `d19e65ba75938c35afa472d23d91d1724fe7fabf` passed exact-head run `29603060944` across classification, repository policy, and Ubuntu/Windows Node 20/24. Phase 5 Tasks 5A0 / Gate G0 through 5A3 / Gate R are locally complete; Task 5A4 / Gate I is next.
