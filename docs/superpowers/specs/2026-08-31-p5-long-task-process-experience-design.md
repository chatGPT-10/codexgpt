# P5 Long-Task and Process Experience Design

**Status:** approved for local implementation by the owner's 2026-08-31 P5 request

## Goal

Make finite commands and persistent processes unambiguous to ChatGPT, expose one truthful process lifecycle in the current V5 contract, and close the long-task cursor/cancellation acceptance loop without weakening any execution boundary.

## Existing foundation

P5 builds on the retained Phase 4 process kernel and STEP-516–518:

- `run_command` already owns bounded commands expected to terminate;
- `start_process` already owns persistent or interactive work and is full-tool-mode only;
- `read_process_output` already accepts `cursor`, `max_bytes`, and cancellable `wait_ms`;
- output rings, signed cursors, quotas, streaming redaction, Job ownership, ConPTY, and joinable close/revoke already exist;
- `full_access` remains ambient current-user authority, not a sandbox.

P5 therefore does not replace the Windows host, add a generic shell, add tools, or widen authority.

## Contract decision

The canonical lifecycle is:

```ts
type ProcessState =
  | "starting"
  | "running"
  | "exited"
  | "failed"
  | "terminated";
```

V5 process successes expose `state` as the canonical field. The existing `status` field remains for one compatibility period and must equal `state`. V3 and V4 output schemas remain exact and do not accept the new field.

`starting` is observable only through V5 `list_processes` while the backend start and required start audit are incomplete. `start_process` itself returns only after reaching `running`; a process that exits, fails, is revoked, or is terminated during startup does not return false success.

`run_command` uses the same V5 field but can return only terminal states. It never becomes a persistent handle.

## Output and cursor decision

The existing bounded output page remains authoritative:

```json
{
  "chunks": [],
  "next_cursor": null,
  "truncated": false,
  "eof": true,
  "returned_bytes": 0
}
```

P5 does not add a second cursor vocabulary or flatten this page. Callers pass each non-null `next_cursor` back as `cursor`; `max_bytes` bounds the page and `wait_ms` performs a cancellable long poll only when there is no unread output and EOF has not been reached.

## Lifecycle ownership

- The transport and request identity context own every persistent process.
- Workspace close/revoke, transport close, lease/evidence/policy revoke, lifetime expiry, explicit termination, output quota, host failure, and server shutdown converge on the existing joinable lifecycle.
- Cleanup targets the owned Job/process tree, not only one PID.
- A non-settling required verification/audit operation keeps close pending rather than manufacturing completion.
- Terminal records remain bounded and expire under the existing retention/quota rules.

## Compatibility and security

- Direct tool counts remain V1=28, V2=31, V3=39, V4=51, V5=52.
- No new command authority, network authority, credential access, filesystem access, or approval bypass is introduced.
- V3/V4 wire shapes remain unchanged.
- V5 `status` is a migration alias, not a second lifecycle source.
- App refresh, deployment, publication, commit/push, service installation, Web benchmark execution, and efficiency claims remain outside this local milestone.

## Acceptance

P5 is complete only when:

1. finite/persistent routing descriptions and instructions are exact;
2. every V5 process success has equal `state` and `status` values;
3. V5 can truthfully observe `starting`, while V3/V4 remain exact;
4. incremental reads prove no replay, bounded pages, waiting, cancellation, and terminal EOF behavior;
5. startup revocation and close join the eventual backend handle and cannot leave a live owned process;
6. Windows control coverage retains Job-tree/PowerShell/Node/cmd ownership evidence;
7. focused dual-Node, ordinary, smoke, build, package, policy, diff, credential, and scope gates pass.
