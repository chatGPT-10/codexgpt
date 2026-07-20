# Phase 4 Windows Execution and Trusted-Workspace Design

**Status:** reduced personal-use Phase 4 is published and exact-head closed; strong sandbox implementation is deferred
**Date:** 2026-07-16
**Scope decision:** 2026-07-17 — Phase 4 closes around trusted-code execution and brokered roots; the `workspace` OS-sandbox profile remains unavailable
**Scope:** Phase 4A native Windows execution, locally confirmed full access for trusted repositories, and retained Phase 4B capability evidence only
**Compatibility baseline:** closed Phase 3, exact Tool Contract V1/V2, Policy Kernel, workspace lifecycle, durable audit, and atomic filesystem transactions

## 1. Final architecture decision

Phase 4 contains three capabilities with deliberately different security meanings:

1. **`confirmed_roots` — brokered cross-root file access.** A new V3-only tool can open a normal local directory outside configured `allowedRoots` after an exact local R3 confirmation. Existing file tools then operate through `WorkspaceManager`, `PathGuard`, atomic transactions, hard path rules, and audit. This is the recommended answer to “access files anywhere while still preserving CodexGPT protections.”
2. **`full_access` — current-user process execution.** An approved process runs with the ambient authority of the current Windows user. It is not limited to the project, has no filesystem/registry/credential/network isolation, and can bypass brokered blocked-path rules from inside its own code. This matches the underlying risk of a Codex-style unrestricted process and is only for code the user trusts.
3. **`workspace` — reserved unavailable profile.** The former offline AppContainer/LPAC sandbox design is retained as optional future research, but it is not part of the current Phase 4 product scope because real Gate S evidence did not prove the required isolation. No production activation path is published.

These are not aliases or fallback levels. `workspace` remains unavailable and never degrades to `full_access`; `confirmed_roots` never silently authorizes a current-user process; and local confirmation authorizes risk but does not create an operating-system boundary.

OpenAI documents sandbox mode and approval policy as separate controls. Its standard “Full access” preset removes the sandbox and normally removes approval prompts. CodexGPT deliberately exposes a different user-facing mode, **Full access (ask first)**. The V3 state machine requires a local decision record before every ambient-authority start or input action. That is a workflow confirmation, not a durable proof of human presence after unrestricted same-user code has already run.

## 2. First-principles derivation

### 2.1 Required outcome

ChatGPT must be able to run normal Windows development commands, manage interactive processes, and—when the user asks—work beyond configured project roots, without silently weakening the already published workspace, identity, approval, audit, rollback, and secret-handling contracts.

Before any process starts or external root opens, CodexGPT must establish:

1. the exact canonical action and authorization-relevant input;
2. the identity, transport session, workspace or root admission, policy revision, contract, and native capability evidence;
3. whether the operation is brokered or has ambient current-user authority; any future sandbox remains a separate explicitly proved capability;
4. the owner and absolute lifetime of every handle, process, lease, snapshot, and grant;
5. how unbounded and potentially secret-bearing output is contained;
6. the deterministic rollback or cleanup path.

### 2.2 Fundamental facts

| Fact | Consequence |
| --- | --- |
| Build and test commands execute transitive project code. | A command-name allowlist is not a sandbox. Every V3 process start is R3. |
| Job Objects own only processes that remain members; broker-created processes may escape. They do not isolate files, registry, credentials, IPC, or network. | Full access reports `process_tree_control: job_object_members_only` and `broker_escape_resistance: none`; its lifetime claim applies only to owned Job members. |
| ConPTY transports terminal I/O but does not isolate it. | PTY and sandbox capabilities are independent. |
| A current-user child can call Win32 APIs directly. | `full_access` cannot claim brokered path, credential, registry, device, or network enforcement. |
| A same-user local approval channel can be invoked by already-running unrestricted same-user code. | Local confirmation is a required product state transition, but only the first ambient start can be claimed to follow a human local action in the absence of pre-existing unrestricted code. |
| V1/V2 are published exact contracts. | Their tool names, `bash`, policy failure envelope, and approval behavior remain unchanged. |
| V3 inherits every non-Bash V2 feature. | Every `version === 2` capability gate and every 1/2 persisted schema must be migrated intentionally, not merely widened as a TypeScript union. |
| Current grant evaluation does not consume a matched R3 grant. | V3 needs an atomic reservation/consume state machine before any approved handler can run. |
| The existing workspace TTL is sliding. | Confirmed-root leases need a separate fixed absolute expiry and cannot reuse ordinary `touch()` semantics. |
| Output redaction regexes contain unbounded repetitions. | Chunk-overlap redaction is unsound; a bounded streaming state machine is required. |
| A MAC authenticates but does not conceal cursor offsets. | Cursors use AEAD or a bounded random server-side map. |
| A path-filtered snapshot may still contain secrets under ordinary names. | Snapshot construction needs path filtering, content filtering, opaque-binary policy, and a manifest bound to final approval. |
| Destination allowlists cannot be enforced by proxy environment variables. | Phase 4B is offline-only; positive egress remains unavailable. |

### 2.3 Threat boundary

The protected adversary includes:

- an authenticated remote MCP client attempting confused-deputy use;
- stale, foreign, expired, replayed, reordered, or concurrently retried requests;
- path, reparse-point, hard-link, executable-replacement, output-flood, protocol, and cleanup attacks;
- a sandbox child attempting access to CodexGPT approval/control/audit state.

The design does not claim isolation from:

- code the user explicitly starts in `full_access`;
- another already-running process with the same unrestricted Windows user token;
- an administrator, kernel compromise, or compromised CodexGPT package.

An approved `full_access` process may read, modify, delete, encode, or transmit anything the current Windows user can reach. Known-pattern output redaction is defense in depth, not DLP.

## 3. Scope and non-goals

### 3.1 In scope

- Direct executable/argument-array execution.
- One-shot PowerShell scripts and persistent pipe/ConPTY processes.
- Windows PowerShell 5.1, optional PowerShell 7, and optional verified Git Bash.
- Job ownership, native wall deadlines, output backpressure, quotas, input, resize, interrupt, termination, and crash cleanup.
- A V3-only local approval issuer and emergency process control.
- A V3-only `open_full_access_workspace` brokered root-admission tool.
- Explicit current-user `full_access` execution with local confirmation and truthful risk projection.
- Retained fail-closed AppContainer/LPAC diagnostic evidence with no production activation path.
- Versioned capability evidence, lifecycle audit, migration, rollback, and attack tests for the published Phase 4A scope.

### 3.2 Non-goals

- WSL as a requirement.
- Generic command-string tokenization or automatic CMD fallback.
- Positive destination network policy in Phase 4.
- A full-access process that still claims blocked-path, credential, registry, device, or network isolation.
- UNC, mapped-network, device namespace, drive-relative, ADS, reserved-name, or raw-volume admission through brokered file tools.
- Direct sandbox access to the live workspace or automatic artifact writeback.
- Persistent processes across server restart.
- A background Windows service.
- Installing PowerShell 7, a compiler SDK, a native package, WFP policy, firewall policy, or system driver without a new explicit decision.
- OAuth, Phase 5+, deployment, credential migration, or destructive Git-history operations.

## 4. Tool Contract V3

### 4.1 Exact inventory

- V1 remains the exact 28-tool contract.
- V2 remains the exact 31-tool contract.
- V3 is V2 minus `bash`, plus nine tools, for an exact 39-tool canonical universe:

  1. `open_full_access_workspace`
  2. `run_command`
  3. `start_process`
  4. `read_process_output`
  5. `write_process_input`
  6. `interrupt_process`
  7. `terminate_process`
  8. `resize_process_terminal`
  9. `list_processes`

`bash` remains only in V1/V2. It is never renamed, widened, or aliased. V3 uses descriptor-driven capability inclusion so that all 30 inherited non-Bash V2 tools keep their direct, supertool, atomic, undo, audit, and output behavior.

### 4.2 Tool profile

| Tool profile | V3 additions |
| --- | --- |
| `connection-test` | none |
| `minimal` | none |
| `standard` | `run_command`, `read_process_output` |
| `full` | all nine |

The `standard` profile is functional without `start_process`: every `run_command` creates a retained terminal record, returns its `process_id` plus the first output page, and allows later pagination through `read_process_output` for five minutes.

`open_full_access_workspace` is full-profile only. Direct tools and `codexgpt` child actions share the same canonical action, strict schema, handler instance, policy wrapper, and result projector. There is no alias or alternate execution path.

### 4.3 Mandatory startup gate

Any V3 `standard` or `full` server must fail before tool registration unless all of these are true:

- `policyEngineMode === "enforce"`;
- durable audit is available and execution-relevant events are `required`;
- a stable transport-session and identity context exists;
- Phase 3 atomic mutation, change-set, recovery, and state readers are active;
- the V3 contract migration gate has passed.

`legacy` and `shadow` must produce zero V3 handler executions and zero process spawns. V1/V2 keep their existing configuration and failure wire behavior, including the absence of a pending-approval issuer.

### 4.4 Persisted mutation encoding

Storage schema versions describe record shape, not public tool-contract capability. V3 adds no new filesystem mutation record shape, so Phase 4 must not invent a `ChangeSetManifestV3` merely because the public contract is V3. The exact accepted pairs are:

| Stored record | `schemaVersion` | Accepted `contractVersion` | V3 writers |
| --- | --- | --- | --- |
| `ChangeSetManifestV1` | `1` | `1`, `2`, or `3` | V3 `write`, `edit`, `apply_patch`, `export_pro_context`, `handoff_to_agent`, `handoff_to_codex`, `codexgpt_self_test`, local batch mutations, and schema-1 undo records write `3` |
| `MoveChangeSetManifestV2` | `2` | `2` or `3` | V3 `move_paths` and move-undo records write `3` |

Every other schema/contract pair fails strict parsing. Every `attachPreparedFileMutation`, `attachPreparedPatchMutation`, and `attachPreparedBatchMutation` call site—including the local mutation service and self-test path—must accept/pass contract `3`. Every successful prepared batch mutation emits its schema-1 manifest. `retainChangeSet: false` does not suppress that record; it suppresses undo material and records `undoSupported: false` with `undoReason: "retention_disabled"`. `moves/service.ts`, `changesets/undo.ts`, and `changesets/moveUndo.ts` receive the caller contract instead of hard-coding `2`.

Generic and move undo records retain `revertsChangeSetId`, but encode the contract of the undo call rather than copying the source record's contract. The existing transaction journal and prepared-mutation shapes remain at their present schema versions because their shapes do not change; their mutation contexts and attached manifests carry exact `contractVersion: 3` for V3 calls. There is no `query_change_sets` tool: `undo_change_set` operates on an already known change-set ID, while `query_audit_events` writes no mutation record.

The upgraded reader accepts both rows before V3 can activate. A configuration rollback from V3 to V2 means switching the same upgraded binary back to contract V2: given a known ID, it can undo an owned V3 record under current policy and emit the unchanged V2 projection; a V2 undo writes contract `2` while preserving lineage to the V3 record. The corresponding V2-compatible authorization/execution evidence remains discoverable through `query_audit_events`. Downgrading to an older binary whose schemas reject contract `3` is not a supported rollback and must not be claimed as one.

`contractVersion`, `schemaVersion`, lineage, owner binding, policy revision, and operations remain inside the manifest MAC. Any future record-shape change requires a new schema version and an explicit migration; it cannot be hidden behind a widened contract union.

## 5. Confirmed cross-root file access

### 5.1 Public tool

```ts
interface OpenFullAccessWorkspaceInputV1 {
  root: string;
  access: "read_only" | "read_write";
  lease_ms?: number; // default 10 minutes; hard maximum 30 minutes
}
```

The first remote call never probes or reports whether the path exists, is protected, is inaccessible, or is a valid directory. It registers a bounded V3 R3 request from a lexical path digest and returns one generic `LOCAL_ROOT_APPROVAL_REQUIRED` with an opaque ID.

The local approval view resolves and displays the canonical root, local volume, requested access, fixed lifetime, remote identity/session label, and risk. Only the local side learns pre-approval existence and permission facts.

After local approval, the remote client retries the exact call. The server atomically consumes the grant, revalidates canonical path, volume serial, directory file identity, policy/blocked-rule revision, identity, transport, and contract, then creates a random workspace handle plus a `FullAccessLeaseV1`.

### 5.2 Lease semantics

The lease binds:

- server instance;
- canonical tool/action;
- credential reference and stable identity binding;
- exact transport session;
- contract and policy revisions;
- canonical local root, volume serial, and directory file ID;
- `read_only` or `read_write` access;
- grant/approval ID;
- creation time, idle expiry, and fixed absolute expiry.

The approval/grant TTL is at most two minutes and exactly one use. The resulting workspace lease is separate: ten-minute idle expiry and at most thirty-minute absolute expiry. Ordinary workspace access may refresh only the idle deadline and never the absolute deadline.

Confirmed-root records use an access class and lease ID in their internal key. They never reuse an ordinary configured-root handle, append to `config.allowedRoots`, write a persistent allowed root, survive server restart, or cross identity/transport/policy boundaries.

On lease expiry or revocation, CodexGPT first quarantines process input and terminates any bound process, then revokes workspace/file-operation access and cleans state.

### 5.3 Brokered hard boundary

Confirmed-root file operations remain brokered. They still reject:

- device, `GLOBALROOT`, raw-volume, UNC, mapped-network, drive-relative, ADS, reserved-name, trailing-dot/space, and reparse escape paths;
- CodexGPT control, approval, identity, audit, transaction, and sandbox state;
- Codex credential/auth/config roots and Windows/browser credential stores;
- current blocked secret/control globs such as `.env`, private keys, `.ssh`, `.git`, and reserved transaction artifacts.

Blocked-path evaluation is anchored to the local volume or a stricter configured policy anchor, not rebased at the newly opened root. Opening `.ssh`, `.git`, or another blocked directory as the workspace root cannot erase its protected ancestor name.

V3 confirmed-root access also applies one exact hard-link invariant to every ordinary file: `NumberOfLinks === 1`. Authorization facts bind volume serial, stable file ID, and link count. Reads execute from the verified handle after a final identity/link-count check; search/tree safely skip a multi-link file and return a bounded omission count. Existing-file write, edit, move, delete, and undo paths fail closed before side effects when the source or destination object is multi-link; newly created/replaced objects are rechecked before commit. Mutation providers keep the stable handle through the transaction and recheck identity/link count before the side effect and before commit, rolling back on drift. A hard link to a protected file placed under an approved ordinary directory is therefore never read or mutated through the confirmed-root broker.

This rule is scoped only to V3 confirmed-root handles. It does not silently change V1/V2 or configured-root behavior.

This brokered mode can reach any normal local file not covered by those hard exclusions. It does not grant an arbitrary child process ambient authority.

## 6. Execution contract

### 6.1 Command forms

```ts
type CommandSpecV1 =
  | { kind: "argv"; executable: string; args?: string[] }
  | { kind: "powershell"; script: string; edition?: "auto" | "core" | "windows" }
  | { kind: "bash"; script: string };

type ExecutionCwdV1 =
  | { kind: "workspace"; path?: string }
  | { kind: "absolute_local"; path: string }; // full_access only
```

Rules:

- No generic command string and no CodexGPT tokenization.
- `argv` preserves exact argument boundaries and never joins them through a shell.
- Relative executable paths containing separators are rejected.
- `absolute_local` cwd is available only to `full_access`; declared input still rejects device, UNC, mapped-network, drive-relative, ADS, reserved-name, and trailing-dot/space syntax. This validates only CodexGPT input and does not constrain what the child later opens.
- PowerShell one-shot, persistent non-interactive script, and interactive terminal are distinct schema branches. A one-shot script does not share its private script channel with later process input.
- Input ceilings: 32 KiB script, 512 arguments, 8 KiB per argument, 64 KiB aggregate arguments, 64 explicit environment entries, and 16 KiB aggregate environment values.
- Windows environment keys are canonicalized case-insensitively; duplicates fail.

### 6.2 Tool results

`run_command` returns a terminal `process_id`, the first output page, and a retained terminal record readable for five minutes through `read_process_output`:

```ts
interface RunCommandResultV1 {
  process_id: string;
  status: "exited" | "failed" | "terminated";
  exit_code: number | null;
  termination_reason: TerminationReasonV1 | null;
  backend: BackendSummaryV1;
  authority: AuthoritySummaryV1;
  output: OutputPageV1;
  started_at: string;
  ended_at: string;
}
```

`start_process` returns a creation-time snapshot. Because a child can exit before projection, `status` may already be `running`, `exited`, or `failed`.

Every result includes exact authority fields. `full_access` must report:

```json
{
  "mode": "full_access",
  "workspace_boundary_enforced": false,
  "filesystem_scope": "current_user_unrestricted",
  "filesystem_isolation": "none",
  "credential_isolation": "none",
  "registry_isolation": "none",
  "network_isolation": "none",
  "process_tree_control": "job_object_members_only",
  "broker_escape_resistance": "none",
  "host_writeback": "possible",
  "redaction": "best_effort_known_patterns"
}
```

The fixed lifetime, timeout, terminate, lease-close, transport-close, and server-close guarantees apply only to processes that remain in CodexGPT-owned Jobs. Full-access code can ask WMI, Task Scheduler, services, COM, or another same-user broker to create a process outside that Job; Phase 4A neither prevents nor promises to find or terminate such an escape. Cleanup may target only exact recorded objects and never performs a broad process kill. A requirement that no descendant can survive expiry is satisfiable only by the Gate-S sandbox, not by `full_access`.

The `workspace` sandbox must report filtered snapshot, no host writeback, protected-registry isolation at its proved level, isolated credentials/environment, and deny-all network.

A nonzero exit, timeout, or user termination is a completed process outcome, not an MCP transport failure. Policy, approval, validation, backend, spawn, host-protocol, and internal failures use stable tool errors.

### 6.3 Process tools

- `read_process_output` accepts an owned process handle, opaque cursor, `max_bytes` 1–262,144, and `wait_ms` 0–30,000.
- An old cursor resumes at the earliest retained byte with `truncated: true`; an invalid/foreign/stale handle returns `PROCESS_NOT_FOUND`.
- `write_process_input` accepts at most 64 KiB and every call requires a new exact one-use R3 approval.
- `interrupt_process` sends ETX for ConPTY or a proven Ctrl+Break process-group signal for pipes. Unsupported interruption returns `INTERRUPT_UNSUPPORTED`; it never silently terminates.
- `terminate_process` closes/terminates the exact owned Job members and is idempotent only while its terminal record remains; it never claims to terminate an unrecorded broker escape.
- `resize_process_terminal` is bounded to 1–500 rows/columns and only applies to ConPTY.
- `list_processes` returns only current-context handles and never exposes host PID, command text, root, environment, or foreign counts.

### 6.4 Quotas and deadlines

- Active processes: 8/server and 4/transport session.
- Terminal records: 32/server and 8/session.
- Output retention: 1 MiB/process default, 8 MiB hard; 16 MiB/server with per-session reservations so one noisy session cannot evict another.
- Host protocol queue: bounded per process and globally; overflow terminates only the noisy Job with `OUTPUT_LIMIT_EXCEEDED`.
- One-shot wall time: 30 seconds default, 10 minutes maximum.
- Persistent `full_access`: 15 minutes default, 30 minutes maximum and fixed at approval for owned Job members; `broker_escape_resistance` remains `none`.
- Persistent `workspace`: 30 minutes default, 2 hours maximum if Gate S proves cleanup.
- Snapshot preparation, spawn, command runtime, and cleanup each have separate clocks and result fields.

The native host enforces wall deadlines with a monotonic clock. Node timers are secondary watchdogs only.

## 7. Policy and authorization

### 7.1 Composite scope and risk

| Tool/action | Risk | Required scopes |
| --- | --- | --- |
| `open_full_access_workspace` | R3 | `workspace:full-access` |
| sandbox `run_command` | R3 | `shell:execute` |
| full-access `run_command` | R3 | `shell:execute` + `host:full-access` |
| sandbox `start_process` | R3 | `shell:execute` + `process:manage` + `process:persistent` |
| full-access `start_process` | R3 | previous scopes + `host:full-access` |
| `read_process_output` | R0 | `process:manage` + owned handle |
| `list_processes` | R0 | `process:manage` + context filter |
| `resize_process_terminal` | R0 | `process:manage` + owned ConPTY handle |
| `write_process_input` | R3 | `process:manage` |
| `interrupt_process` | R2 | `process:manage` |
| `terminate_process` | R2 | `process:manage` |

`process:manage` alone can never start arbitrary code. V3 replaces the current single-scope static policy definition with versioned composite requirements.

`full_access` additionally requires explicit Permission Profile fields allowing ambient current-user filesystem/credential/registry access and unrestricted host network. A profile that requires blocked-path, credential, registry, device, destination-network, or sandbox enforcement against the child returns `PROCESS_POLICY_UNENFORCEABLE` before approval or spawn.

### 7.2 Semantic authorization facts

V3 does not use `JSON.stringify(args)` as its authorization digest. Every action defines a closed, domain-separated, stably serialized `AuthorizationFactsV1`.

Run/start facts bind:

- canonical tool/action and command kind;
- exact script bytes or argv boundaries;
- canonical effective-environment digest;
- logical/absolute cwd and access mode;
- requested terminal, deadline, and fixed process lifetime;
- exact resolved executable/backend file identity held through spawn;
- network posture and authority mode;
- workspace/lease/snapshot identity;
- contract, policy, capability-evidence, identity, and transport revisions.

Input facts bind process generation, exact bytes, and close flag. Full-root admission binds lexical request, final canonical identity, access, lifetime, and blocked-rule revision. Output pagination and wait fields are QoS, not authorization expansion; the owned handle and cursor still enforce context.

Direct and supertool calls map to the same canonical action and facts. Another tool with the same resource kind/operation cannot consume the grant.

## 8. V3 local approval system

### 8.1 V3-only wire behavior

The pending issuer, `approval_id`, local control plane, and grant consumption activate only for V3. V1/V2 retain their exact existing policy failure envelope and do not gain pending approvals.

V3 flow:

1. resolve only facts safe to reveal and validate before approval;
2. create/deduplicate one bounded pending request;
3. persist required approval-request audit;
4. return `APPROVAL_REQUIRED`, opaque ID, exact server selector, and safe retry instruction;
5. local user lists/watches the exact server, reviews a sanitized summary, and approves or denies;
6. issue a grant only after any required local preparation and final confirmation;
7. remote client retries the same semantic action;
8. atomically reserve the exact grant before authorization audit and handler execution;
9. persist consume/authorization audit, commit consumption, then execute;
10. any audit/spawn failure burns R3 and never refunds it.

Two concurrent identical retries must produce exactly one handler/spawn. Approve, deny, expire, reserve, consume, and burn are closed state transitions; repeated CLI requests are idempotent and cannot issue duplicate grants.

### 8.2 Sandbox two-stage approval

An exact sandbox execution grant must bind the immutable final snapshot. Because snapshot construction may exceed the two-minute R3 TTL, local approval is two-stage:

1. the user approves **snapshot preparation**; this is not an execution grant;
2. the builder creates and validates the snapshot, then shows digest, file/byte counts, exclusions, backend identity, and authority summary locally;
3. the user gives a fresh final confirmation;
4. CodexGPT issues a two-minute, one-use grant bound to `snapshot_id` and authenticated manifest digest;
5. retry may use only that immutable prepared snapshot and may never rebuild behind the same grant.

The approval summary for live `full_access` explicitly says transitive code and live dependencies are not frozen by the command digest.

### 8.3 Local control plane

The local CLI provides:

- `codexgpt approvals list --server <server_id>`;
- `codexgpt approvals watch --server <server_id>`;
- `codexgpt approvals approve <approval_id> --server <server_id>`;
- `codexgpt approvals deny <approval_id> --server <server_id>`;
- `codexgpt processes list --server <server_id>`;
- `codexgpt processes terminate <process_id> --server <server_id>`.

Emergency local termination needs no remote approval.

The pipe/state design has its own Gate A0. It must prove the exact native pipe factory later used in production, not a parallel spike-only implementation. TypeScript owns the protocol and approval state machine but may not create a weaker pipe independently. The factory applies an owner/current-user/SYSTEM DACL plus a medium-integrity mandatory label that denies low-integrity write-up. After connection the server impersonates the client and requires the configured user SID, integrity level at least medium, `TokenIsAppContainer === false`, and available client-PID/owned-Job checks before reading an approval command.

Gate A0 reads the real descriptor back to verify owner, DACL, SACL, and mandatory label. `PIPE_REJECT_REMOTE_CLIENTS` is a `CreateNamedPipe` mode flag, not a descriptor field; it is verified by the native call inventory and an actual remote-client refusal test. State discovery is reparse-safe and binds random server ID, PID creation time, nonce, and private startup secret. The registry never defaults to the “latest” server, and the secret travels only through private local IPC, never argv or environment.

Approval display defaults to backend, action kind, argument count, logical cwd/root scope, identity/session label, absolute lifetime, authority/isolation facts, and digest prefix. It never prints raw environment. Reveal mode escapes C0/C1, ESC, newline, backspace, bidi/default-ignorable characters, limits width, and cannot perform terminal control injection.

Queue limits are 32/server, 8/session, and 10 new pending requests/session/minute. Duplicate requests do not extend TTL. Overflow returns `APPROVAL_QUEUE_FULL` without creating durable unbounded state.

### 8.4 Limitation of local confirmation

The current-user local control channel cannot defend against already approved malicious `full_access` code with the same ambient Windows identity. The server rejects low-integrity/AppContainer clients and approval clients that belong to an owned Job where the platform can prove it, but a same-user broker escape can still invoke the CLI or pipe. Therefore:

- the server state machine always requires a fresh local decision record for each R3 ambient start/input action;
- in the absence of pre-existing unrestricted same-user code, the first ambient-authority start is preceded by a local human action;
- after unrestricted same-user code has run, the record is a collaboration/UX gate, not cryptographic proof that a human supplied the decision;
- Phase 4A must not advertise “human presence,” “unforgeable per-action confirmation,” or protection from already-running same-user malware.

Strong per-action human presence would require a new independently trusted authenticator such as Windows Hello, secure-consent/UAC mediation, or a separate OS principal. That architecture is outside Phase 4 and needs a new blocking design gate rather than a wording change.

The Phase 4B sandbox must prove it cannot read the approval registry/secret or connect to approval/host/audit IPC. Any access fails Gate S.

## 9. Output, cursor, and audit

### 9.1 Capture and retention

- Pipe mode preserves separately observed `stdout`/`stderr` streams without claiming an OS total order.
- ConPTY returns one `terminal` stream.
- Incremental UTF-8 decoding preserves incomplete sequences and deterministically replaces invalid bytes.
- Known-secret filtering happens before ring retention, long-poll wakeup, audit counts, logs, and result projection.

### 9.2 Bounded streaming redactor

The implementation cannot use “overlap equal to the longest regex” because current patterns are unbounded. It uses a finite-memory streaming recognizer:

- bounded prefix detection;
- suppression beginning as soon as a protected prefix reaches its minimum secret length;
- suppression through a defined terminator or EOF;
- a fixed candidate buffer ceiling;
- deterministic behavior for missing terminators, extremely long values, every chunk split, and EOF flush.

`full_access` can encode or fragment unknown secrets, so public metadata says `best_effort_known_patterns`. The redactor is not an exfiltration boundary.

### 9.3 Opaque cursor

The cursor is either AEAD-encrypted server-local state or a random key into a bounded server-side cursor map. It binds process generation, retained sequence, intra-chunk offset, context, expiry, and version without exposing offsets. A MAC-only base64 structure is insufficient.

### 9.4 Lifecycle audit

V3 adds versioned events for:

- approval requested/prepared/granted/denied/expired/reserved/consumed/burned;
- root lease created/revoked/expired;
- process start, natural exit, user terminate, timeout, expiry, policy/evidence revocation, host crash, and cleanup;
- snapshot prepare/create/validate/attach/cleanup/recovery.

Persistent process lifecycle events do not reuse the existing one-authorization/one-terminal-execution uniqueness slot. Raw commands, scripts, arguments, input, output, environment values, canonical private roots, tokens, and secrets are excluded.

### 9.5 Audit persistence and contract projections

Phase 4 adds a strict `AuditEventV3` persisted union without modifying `AuditEventV2`. Every V3 action still writes the existing V2 authorization event and one terminal V2 execution event where that pair already applies; V3 lifecycle records supplement rather than replace that backward-queryable evidence.

Every `AuditEventV3` has `schemaVersion: 3`, `contractVersion: 3`, event ID/type/transition, timestamp, nullable request/authorization/decision/credential/session/tool/workspace references, canonical action, policy revision, SHA-256 subject/context fingerprints, nullable safe result code, and at most sixteen bounded nonnegative counts. It is strict and uses the existing safe-ID, safe-one-line, timestamp, and fingerprint limits. The exact discriminants are:

| `eventType` | Allowed `transition` values |
| --- | --- |
| `approval_lifecycle` | `requested`, `prepared`, `granted`, `denied`, `expired`, `reserved`, `consumed`, `burned` |
| `root_lease_lifecycle` | `created`, `revoked`, `expired` |
| `process_lifecycle` | `started`, `exited`, `user_terminated`, `timed_out`, `expired`, `policy_revoked`, `evidence_revoked`, `transport_closed`, `lease_revoked`, `output_limit_exceeded`, `host_crashed`, `cleanup_completed` |
| `snapshot_lifecycle` | `prepare_requested`, `prepared`, `validated`, `attached`, `cleanup_pending`, `cleaned`, `recovered`, `failed` |

The persisted reader union is exactly `AuditEventV2 | AuditEventV3`. `AuditEnvelopeV1.storeVersion` remains `1` because its sequence/segment/previous-MAC/event/record-MAC envelope shape is unchanged; its `event` parser accepts that union, and the record MAC covers the complete event including schema, contract, transition, fingerprints, and counts. Index, segment metadata, retention, chain verification, and quarantine schemas remain unchanged. Unknown event schemas/transitions fail integrity validation. An older binary that cannot parse `AuditEventV3` is not a supported rollback target.

V2 and V3 public query projections are exact and separate:

- V2 `query_audit_events` input, `AuditEventV2` union, `QueryAuditEventsResultV2 { schemaVersion: 2 }`, filter digest, and cursor-V1 codec remain byte/schema compatible. The upgraded store verifies the full V2/V3 MAC chain, then removes V3 events before applying V2 filters, descending ordering, limit, and pagination. `nextCursor` is based on the last emitted V2 sequence and is null exactly when no later matching V2 projection remains; skipped V3 records can neither appear nor cause a loop. V2 `changeSetIds` therefore still finds the V2 execution evidence for a V3 mutation, while V3-only lifecycle evidence remains retained but hidden from V2 wire.
- V3 keeps the same input field names but expands `eventTypes` with the four V3 discriminants. `QueryAuditEventsResultV3 { schemaVersion: 3 }` returns records whose event is `AuditEventV2 | AuditEventV3`. V2-only `statuses` and `changeSetIds` filters never match a V3 lifecycle event. V3 uses a cursor-V2 payload containing `projectionVersion: 3`, filter digest, last underlying sequence, and expiry, authenticated with a domain-separated `audit-query-v3` MAC; V2/V3 cursors are mutually invalid.

Switching the upgraded binary from V3 to V2 preserves chain verification and V2-compatible mutation evidence, hides V3 lifecycle records from the V2 wire, and invalidates outstanding V3 query cursors. It never deletes, rewrites, or silently maps a V3 lifecycle event into an inaccurate V2 event.

## 10. Native Windows host

### 10.1 Gate prerequisites

Before the native spike, CodexGPT must first harden `long-task-runner` to bind worker PID, creation time, nonce, and command identity; reject PID reuse; and cap stdout/stderr logs. It must also extend static mutation review to C#/PowerShell native APIs and shipped scripts.

The first host candidate is a fixed built-in Windows PowerShell invocation with:

- `-NoLogo -NoProfile -NonInteractive`;
- fixed package-root source files;
- safe fixed cwd and bounded clean environment;
- `Add-Type` compiling shipped reviewable C# without requiring a development SDK;
- one host per MCP server;
- raw `Console.OpenStandardInput/Output` protocol streams with no PowerShell pipeline output.

Failure requests a new supply-chain decision; it never falls back to direct Node spawn, `taskkill`, PATH helper, or an unreviewed native dependency.

### 10.2 Protocol

Protocol V1 uses a 64-byte little-endian header. Constants are frozen in one generated/checkable source shared by TypeScript and C#:

| Offset | Width | Field | Exact rule |
| --- | --- | --- | --- |
| 0 | 4 | magic | bytes `43 58 50 34` (`CXP4`) |
| 4 | 2 | version | unsigned `1` |
| 6 | 2 | header length | unsigned `64` |
| 8 | 2 | frame kind | exact enum below |
| 10 | 2 | flags | only kind-permitted bits; otherwise zero |
| 12 | 4 | sequence | unsigned, starts at `1`, strictly increments per direction, no wrap |
| 16 | 16 | request ID | random opaque 128-bit value; all zero only for host-global frames |
| 32 | 8 | process generation | unsigned; zero only before/without process ownership |
| 40 | 4 | payload length | unsigned, at most 65,536 bytes |
| 44 | 4 | reserved | all zero |
| 48 | 16 | authentication tag | first 16 bytes of HMAC-SHA-256 |

Frame kinds are `0x01 HELLO`, `0x02 HELLO_ACK`, `0x10 REQUEST_JSON`, `0x11 RESPONSE_JSON`, `0x12 EVENT_JSON`, `0x20 OUTPUT`, `0x21 INPUT`, `0x22 CREDIT`, `0x23 CANCEL`, and `0x7f FATAL`. `OUTPUT` alone may set `STDERR=0x0001` or `EOF=0x0002`; `INPUT` alone may set `EOF=0x0002`; every other bit is reserved and zero. HELLO payloads are at most 4 KiB, JSON/FATAL payloads at most 64 KiB, OUTPUT/INPUT payloads at most 64 KiB, CREDIT is exactly eight bytes, and CANCEL is empty. JSON is canonical strict UTF-8 with one object root, bounded depth/keys/string lengths, schema-known fields, and no duplicate keys. OUTPUT/INPUT bytes are opaque.

Node creates two independent 32-byte random HMAC keys for Node-to-host and host-to-Node traffic and transfers them through the private inherited bootstrap handle, never argv/environment. The tag covers header bytes 0 through 47 followed by the exact payload under the direction-specific key. This authenticates the private channel and detects corruption/reflection; it is not a boundary against code already running as the same Windows user, which may inspect or tamper with either process.

There are at most 8 in-flight requests per process and 64 per host. Host-to-Node queued frame bytes, including headers, are capped at 1 MiB per process and 16 MiB per host. Node-to-host pending INPUT/control bytes are capped at 256 KiB per process and 4 MiB per host. Credit is returned only after bytes leave the receiver queue. A normal API enqueue beyond input credit returns `HOST_BACKPRESSURE` without consuming input; a process whose output enqueue would exceed either output cap has only its owned Job terminated with `OUTPUT_LIMIT_EXCEEDED`. A peer that sends beyond credit, or sends an unknown, duplicate, out-of-order, direction-invalid, oversized, bad-tag, or malformed frame, causes a fatal host close, revocation of every host-owned record, and Job closure. Sequence exhaustion requires a clean host restart before another frame.

The protocol fixes request/response correlation, process-generation transitions, cancellation races, fatal/nonfatal errors, and restart recovery. Host stdout is protocol-only; stderr contains only bounded safe codes and never payload, script, environment, path, or output bytes.

### 10.3 Creation and identity

The host uses:

- `STARTUPINFOEX`;
- `PROC_THREAD_ATTRIBUTE_JOB_LIST` for creation-time ownership;
- `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` for exact inheritance;
- `PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE` when needed;
- `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES` only for a proven sandbox.

The executable is opened with replacement-denying sharing, its volume/file identity is bound to authorization, the handle remains open until creation completes, and the launched image identity is verified. Drift burns approval and prevents use.

Every Job has kill-on-close, no breakaway, bounded active-process count and configurable memory/CPU ceilings. CPU ceilings are not used as wall clocks. Native monotonic deadlines close the Job independently of Node event-loop health. Gate N must also run a safe nonce-bound WMI/COM broker probe and prove the opposite boundary: a broker-created process may remain outside the Job. The probe is an expected `broker_escape_resistance: none` result, and cleanup targets only its exact recorded identity; no broad PID/name kill is allowed.

### 10.4 PowerShell semantics

PowerShell uses a fixed nonsecret bootstrap that reads a complete UTF-8 script from a private handle and creates a ScriptBlock. Before invocation it sets `$global:LASTEXITCODE = $null`; immediately after invocation it captures `$?` before running any bootstrap command. Exit mapping is exact:

| Outcome | Reported Win32 exit code |
| --- | --- |
| empty/completed script, no native command, final captured `$?` true | `0` |
| completed script, no native command, final captured `$?` false | `1` |
| one or more native commands and no explicit `exit` | the final observed `$LASTEXITCODE` as an unsigned Win32 `DWORD` |
| explicit `exit N` | the exact resulting unsigned Win32 `DWORD` (`exit 37` is `37`) |
| parse error or uncaught terminating error | `1` |

Non-terminating errors follow the captured final `$?` rule. Tests cover Unicode, empty script, PowerShell success/failure, multiple native commands, `exit 37`, negative/large Win32 normalization, parse/terminating errors, profile poisoning, PATH/PSModulePath/TEMP poisoning, and command-line disclosure.

### 10.5 ConPTY semantics

Gate N proves create/read/write/resize/interrupt/close on the actual supported Windows builds, including build 19044. Teardown first quarantines input and terminates/waits the exact Job, keeps a dedicated reader draining output, calls `ClosePseudoConsole` on a separate non-reader teardown thread, then closes output and remaining handles. ETX result means delivered, not that the target remained alive.

`ClosePseudoConsole` cannot be made cancellable merely by observing a timeout. If teardown has not completed in five seconds, an independent host watchdog marks the host fatal and terminates the exact host process; Node's held child handle supplies a second ten-second exact-host watchdog. That closes every Job handle owned by that host, revokes every corresponding process record, records `HOST_FATAL_CONPTY_CLOSE`, and starts a fresh host. This recovery can terminate unrelated processes owned by the same MCP server host and the user-facing result must say so; it never targets a foreign process or falls back to `taskkill`.

## 11. Deferred Phase 4B filtered-snapshot sandbox design

### 11.1 Positioning

This section is retained as a design record for a possible future, separately approved sandbox phase. It is not an active Phase 4 implementation requirement, does not block reduced Phase 4 closure, and creates no production `workspace` capability.

If revived, it would be a disposable verification sandbox rather than a persistent development environment. Every execution would see an immutable prepared input snapshot; writes would stay inside its private run tree and be discarded. Intentional host changes would use brokered file tools or explicitly approved `full_access`.

### 11.2 Snapshot construction

The builder operates under server/session concurrency, disk, CPU, failure-backoff, and time quotas. It:

1. freezes workspace/confirmed-root lease, policy, blocked-rule, capability, and backend revisions;
2. walks through stable Windows handles with bounded depth, entries, size, and preparation time;
3. rejects device/UNC/ADS/reserved/reparse/special paths and every regular file whose hard-link count is not exactly one;
4. reads each source from the already verified handle, not by reopening its path;
5. records volume serial, file ID, size, content hash, and post-copy handle metadata; any drift fails;
6. materializes only safe in-root link targets with cycle/containment bounds and rejects all external targets;
7. runs streaming secret-content detection over every normal text file and the same detector over dependency content;
8. fails the entire snapshot with `SNAPSHOT_SECRET_CONTENT_BLOCKED` on a protected content match;
9. treats archives, databases, and opaque binaries as content-denied by default unless an explicit local exact-digest dependency/artifact policy allows them;
10. rescans the final tree for blocked content, reparse points, and identity drift;
11. creates an authenticated manifest and digest;
12. keeps the unfinished root undiscoverable to the sandbox SID;
13. binds the exact final manifest to the fresh execution approval.

The snapshot is a manifest of individually stable file captures, not an atomic whole-workspace timestamp. The claim is limited to the current path/content detector version; it cannot detect arbitrary encoded or unknown secrets.

Default source ceilings are 200,000 entries, 4 GiB total, 1 GiB/file, and 10 minutes preparation. Preparation, approval, and command deadlines are separate.

### 11.3 Dependencies

`node_modules` is excluded by default. An explicit dependency copy channel physically copies allowed content into the per-run tree; it never hard-links or junctions to the live tree or external package store.

pnpm external stores, Yarn PnP, native addons, nested external links, and large opaque packages may fail with `DEPENDENCY_VIEW_UNAVAILABLE`. A required user runtime that lacks safe system ACLs must also be copied into the run tree; shared runtime/toolchain ACLs are never modified.

`.git` remains excluded, so Git operations are unsupported in the workspace sandbox.

### 11.4 Unique restricted identity

Each snapshot/process owner gets a unique AppContainer/LPAC profile and SID. `ERROR_ALREADY_EXISTS` is a collision/recovery condition, not permission to reuse. The host grants only the minimum ACLs to the snapshot/private temp/profile/runtime tree.

After spawn, both host and child evidence verify AppContainer token, SID, capabilities, integrity/restricted groups, and Job membership. Profile deletion begins only after Job active-process count is zero. A cleanup timeout records authenticated cleanup-pending state for startup recovery.

No live workspace, shared user runtime, CodexGPT state, approval/control pipe, user profile, credential store, browser profile, unrelated process/token/section, raw device/volume, global object, mailslot, WMI/service/scheduler broker, or unauthorized COM surface may be reachable.

The capability claim is `protected_registry_isolation`, not blanket registry isolation; allowed public system keys are explicitly inventoried.

### 11.5 Environment

The environment starts empty. Windows keys are canonicalized case-insensitively. The caller receives a closed allowlist and cannot override:

- path/loader/system variables;
- HOME/USERPROFILE/TEMP/TMP/APPDATA/LOCALAPPDATA;
- PowerShell/module/profile controls;
- Node/Python/runtime preload hooks;
- Git credential/config controls;
- package registry/token controls;
- proxy/resolver variables.

System/runtime values and sandbox-private roots are constructed last and immutable. The execution grant binds the complete effective-environment digest. `CODEXGPT_INHERIT_ENV=1` cannot broaden a workspace sandbox.

### 11.6 Offline network

The only Phase 4B network capability is `deny_all`, implemented by a token with no network capabilities and accepted only after attack evidence proves denial for TCP/UDP, IPv4/IPv6, DNS/DoH, direct clients, proxy attempts, loopback, link-local, private, multicast, and public destinations across available PowerShell/Node/Python/Bash runtimes.

Tests require a separately proven positive network control and distinguish policy denial such as `WSAEACCES` from timeout, missing DNS, or unreachable infrastructure. System-state broker probes needing scheduled tasks, services, firewall, WFP, or elevation are not executed without separate approval; absent evidence keeps Gate S closed.

Any nonempty positive destination request returns `NETWORK_ENFORCEMENT_UNAVAILABLE` before snapshot preparation. Phase 4 installs no WFP/firewall/loopback/proxy/certificate/DNS policy.

## 12. Capability evidence and revocation

Capability evidence records exact backend/source identity, Windows build/architecture, managed Node version, probe revision, individual capability level, bounded result digest, cleanup result, and whether elevation or persistent state was used.

API presence is not evidence. Synthetic fixtures test projection only. Production evidence changes through a per-server evidence store with a revision callback that:

1. revokes pending requests and grants;
2. quarantines process input;
3. terminates affected Jobs;
4. revokes confirmed-root/sandbox handles;
5. cleans authenticated state;
6. forces new requests onto the new policy/evidence revision.

Foreign, stale, expired, policy-stale, evidence-stale, transport-stale, and server-stale process/workspace handles fail closed without disclosing their reason.

## 13. Configuration and activation

```text
CODEXGPT_TOOL_CONTRACT_VERSION=3
CODEXGPT_LOCAL_FILE_ACCESS=configured_roots|confirmed_roots
CODEXGPT_EXECUTION_PROFILE=off|full_access|workspace
CODEXGPT_EXECUTION_DEPENDENCIES=off|node_modules
```

Defaults remain the published contract, `configured_roots`, and execution `off`. V3 never becomes default.

`confirmed_roots` enables the V3 approval path but grants no root by configuration alone. `full_access` requires explicit Permission Profile eligibility, required audit, a fresh per-action local decision record, and an authority warning. That record is not advertised as secure human-presence proof after unrestricted same-user code has run. `workspace` is reserved and unavailable in the reduced scope. Neither can fall back to the other.

Activation matrix:

| Closure point | confirmed roots | full access process | workspace sandbox |
| --- | --- | --- | --- |
| before 4A | unavailable | unavailable | unavailable |
| after 4A | explicit local R3 | explicit local R3, trusted code only | unavailable |
| reduced Phase 4 closure | explicit local R3 | explicit local R3, trusted code only | unavailable |
| future separately approved sandbox phase | unchanged | unchanged | only after a new architecture and complete independent proof |

Gate S failed on the tested AppContainer/LPAC path. The user selected reduced Phase 4 closure around Phase 4A. The blocked evidence remains recorded, `workspace` stays unavailable, and the roadmap does not reinterpret a failed sandbox as success.

## 14. Error vocabulary

Stable additions include:

- `APPROVAL_QUEUE_FULL`
- `APPROVAL_REQUIRED`
- `BACKEND_STALE`
- `BACKEND_UNAVAILABLE`
- `DEPENDENCY_VIEW_UNAVAILABLE`
- `EXECUTION_PROFILE_DISABLED`
- `EXECUTION_QUOTA_EXCEEDED`
- `HOST_PROTOCOL_ERROR`
- `HOST_UNAVAILABLE`
- `INTERRUPT_UNSUPPORTED`
- `LOCAL_ROOT_APPROVAL_REQUIRED`
- `LOCAL_ROOT_ADMISSION_STALE`
- `NETWORK_ENFORCEMENT_UNAVAILABLE`
- `OUTPUT_LIMIT_EXCEEDED`
- `PROCESS_NOT_FOUND`
- `PROCESS_POLICY_UNENFORCEABLE`
- `PROCESS_SANDBOX_UNAVAILABLE`
- `SHELL_SANDBOX_UNAVAILABLE`
- `SNAPSHOT_LIMIT_EXCEEDED`
- `SNAPSHOT_SECRET_CONTENT_BLOCKED`
- `SNAPSHOT_SOURCE_CHANGED`
- `SNAPSHOT_UNSAFE_ENTRY`
- `TERMINAL_NOT_AVAILABLE`
- `WORKSPACE_POLICY_STALE`

Public errors expose no host PID, native handle, foreign existence, canonical private root before local approval, token, command, environment, or raw backend diagnostic.

## 15. Implementation and publication gates

| Gate | Required evidence |
| --- | --- |
| O — operational runner | PID creation-time/nonce identity, bounded logs, correct domain/toolchain invocation |
| N — native host | fixed bootstrap, Job/handle ownership, native timeout, pipe backpressure, PowerShell semantics, ConPTY close on supported Windows/Node 20/24 |
| A0 — local IPC | real named-pipe/state ACL, remote/wrong-user/owned-child rejection, reparse-safe discovery, exact multi-server routing |
| A1 — approval state | bounded queue, V3-only wire, atomic one-use concurrency, durable lifecycle audit, sanitized watch UX |
| C — contract | V1=28, V2=31, V3=39, inherited V2 behavior, persisted V3 readers, direct/supertool parity |
| F — confirmed roots/full access | exact root lease/revocation and truthful ambient-authority policy/results |
| S — optional future workspace sandbox | retained blocked 4B0 evidence; no current production activation or Phase 4 publication dependency |
| E — positive egress | deliberately unavailable; requires a new privileged design and explicit authorization |
| P — publication | neat-freak, full local gate, one phase-boundary publication, exact-head CI |

No failed gate may be bypassed by direct spawn, PATH helper, `taskkill`, live-root ACLs, firewall changes, environment proxy, or security-claim downgrade hidden from the user.

## 16. Acceptance criteria

### 16.1 Phase 4A

- V1/V2 exact wire and no-pending-issuer behavior remain unchanged.
- V3 is exact 39 and inherits all V2 non-Bash tools and persisted state correctly.
- All generic/move/undo writer call sites persist the exact caller contract; same-binary V2 can undo a known V3 change-set ID without an invented enumeration tool.
- V2 audit input/output/event/cursor wire remains exact; V3 lifecycle persistence, V2 filter-before-page behavior, and the separate V3 union projection/cursor pass rollback tests.
- V3 cannot run under legacy/shadow/best-effort audit.
- R3 approval consumption is atomic; concurrent replay produces one execution.
- Confirmed-root admission leaks no pre-approval existence facts, preserves absolute hard paths, never persists `allowedRoots`, and has fixed revocation.
- Every V3 confirmed-root ordinary file has `NumberOfLinks === 1`; protected-file hard links are skipped for reads/search and fail closed for mutations without changing V1/V2.
- Full-access results and prompts expose all `none` isolation facts, `job_object_members_only`, `broker_escape_resistance: none`, and the Job-member-only fixed lifetime.
- The local state machine requires a fresh decision record per R3 action, while UI/docs explicitly limit the human-presence claim after ambient same-user code has run.
- Current-user code is never described as constrained by PathGuard/network destinations.
- Native argv/PowerShell and persistent pipe/ConPTY lifecycle, crash, timeout, output, cursor, quota, control, and audit tests pass under managed Node 20/24 and the proper test domain.
- Local emergency termination remains available when remote approval is unavailable.

### 16.2 Reduced Phase 4B disposition

- `workspace` remains unavailable in contracts, configuration, aliases, doctor activation, and production runtime.
- Task 4B0 evidence remains truthful and blocked; it is not converted into a sandbox claim.
- Existing diagnostic code remains package-excluded and performs no persistent firewall, WFP, service, scheduler, shared-runtime ACL, or machine-policy changes.
- Explicit probe runs clean only authenticated probe-owned state and emit bounded non-secret evidence.
- Tasks 4B1 through 4B6 are deferred to a separately approved future phase and are not required for current Phase 4 closure.

### 16.3 Publication

- Runtime changes pass complete Ubuntu/Windows Node 20/24 Build, Regression, protected Smoke, Package, policy, secret, mutation/native-host inventory, and process-control gates.
- Long tests use the detached runner and authoritative ordinary/control partition with retained run IDs and bounded logs.
- Documentation and memory are reconciled after runtime evidence.
- The phase is staged, committed in English, and pushed only once at its complete approved boundary.
- Closure head `d19e65ba75938c35afa472d23d91d1724fe7fabf` passed exact-head run `29603060944`; Phase 5 Task 5A0 / Gate G0 may begin. Evidence remains below ignored `.ai-bridge/`.

## 17. Rollback

- Set execution `off`, reject new root/process requests, quarantine input, and terminate/drain active processes before hiding tools.
- Revoke confirmed-root leases without modifying configured roots.
- Retain exact manifest pairs, the V2/V3 persisted audit reader, and authenticated cleanup for any explicitly run diagnostic 4B0 probe state.
- Configuration rollback to V2 restores its exact tools and audit projection, hides but still authenticates V3 lifecycle events, invalidates V3 cursors, and does not delete newer audit/state evidence.
- No live-workspace ACL or system firewall rollback is needed; production runtime creates no sandbox profile, snapshot ACL, or sandbox state in the reduced scope.
- Never delete user data, credentials, toolchains, branches, worktrees, or unrelated processes.

## 18. Rejected shortcuts

- Reinterpreting V1/V2 `bash`.
- Calling a Job or ConPTY a sandbox.
- Claiming confirmation constrains an ambient current-user child.
- Adding external roots to global `allowedRoots`.
- Reusing ordinary sliding workspace TTL for elevated access.
- Using full request JSON as V3 authorization facts.
- Matching a grant without atomic consumption.
- Using overlap around unbounded regex patterns.
- Returning MAC-only readable cursor state while claiming confidentiality.
- Building a new snapshot after approval.
- Hard-linking dependencies to live trees.
- Reusing AppContainer profiles or changing shared runtime/live-workspace ACLs.
- Approximating destination enforcement with proxy environment variables.
- Running control-domain tests synchronously in the connector.

## 19. Authoritative references

- [OpenAI agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject)
- [UpdateProcThreadAttribute](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute)
- [Microsoft pseudoconsole documentation](https://learn.microsoft.com/en-us/windows/console/pseudoconsoles)
- [ClosePseudoConsole](https://learn.microsoft.com/en-us/windows/console/closepseudoconsole)
- [Implementing an AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)
- [CreateAppContainerProfile](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createappcontainerprofile)
- [Windows Filtering Platform](https://learn.microsoft.com/en-us/windows/win32/fwp/about-windows-filtering-platform)
- [Application Layer Enforcement](https://learn.microsoft.com/en-us/windows/win32/fwp/application-layer-enforcement--ale-)
- [Windows PowerShell command-line options](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe?view=powershell-5.1)

## 20. Implementation handoff

The paired TDD plan is `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`. Reduced Phase 4 is published and closed at `d19e65ba75938c35afa472d23d91d1724fe7fabf`; exact-head run `29603060944` passed classification, repository policy, and Ubuntu/Windows Node 20/24. Trusted-code `full_access` still requires exact local R3 approval, backend revalidation, truthful ambient-authority reporting, bounded redacted output, owner-bound handles, and Job-member-only lifecycle control. Task 4B0 remains blocked diagnostic evidence; Tasks 4B1–4B6 and `workspace` remain deferred. Phase 5 Tasks 5A0 / Gate G0 through 5A3 / Gate R are locally complete; Task 5A4 / Gate I is next.
