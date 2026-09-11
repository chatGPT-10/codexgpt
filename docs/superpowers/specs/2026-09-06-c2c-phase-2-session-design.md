# C2C Phase 2 — Local Session / Checkpoint

Date: 2026-09-06. Owner scope: continue and complete Phase 2 of the detailed C2C roadmap in conversation `6a9a74a0-c920-83eb-bf4b-b65891aecfd1`, after [Phase 1](2026-09-05-c2c-phase-1-protocol-design.md). This document describes local implementation, not publication or deployment authority.

## Storage and identity

The independent path is `CodexGPTHome()/c2c/sessions/<profileIdForRoot(canonicalRoot)>.json`. Native realpath resolves Windows casing and 8.3 aliases before invoking the existing profile-key function. The file contains a strict version 1 session, monotonic revision, canonical workspace root and directory identity, current opaque MCP workspace ID, conversation binding, task snapshot, checkpoint summary, saved timestamp and optional explicit end timestamp. The path-derived profile key is an internal filename, never an MCP workspace capability.

The existing workspace profile and OAuth schema are unchanged. Constructor-only `home` supports an explicit application home and isolated tests. State beneath the bound workspace is refused. Every directory ancestor is checked for symlinks/junctions; a loaded store pins the workspace and session-directory identities. A recreated workspace, copied session for another root, linked state file, changed state directory or unexpected non-regular file fails closed.

Session input is at most 65,536 bytes. Reads are bounded through one file descriptor, validate file/path identity before and after reading, and require `nlink === 1`. The existing strict JSON parser rejects duplicate keys, invalid UTF-8, excessive nesting and key counts. The schema rejects additional fields, invalid local-state invariants and unknown versions. Known secret patterns use the existing redaction detector on individual strings; private-key markers are additionally refused. This is bounded pattern detection, not a complete classifier for arbitrary confidential prose.

Checkpoint text consists only of `originalGoal` (up to 8 KiB), `completedSubtasks`, `knownIssues`, and `nextExpectedStep` (up to 2 KiB each). The original goal is immutable during a task. No transcript, terminal-log, token, cookie or session-storage fields exist. The session keeps the structured PLAN and execution receipt already defined in Phase 1; actual plan contents are not persisted in it.

## Conversation binding

`mode=chat` requires `projectUrl=null` and a conversation URL. `mode=project` requires a Project URL and permits `chatUrl=null` until a conversation exists. Accepted URLs are literal HTTPS `chatgpt.com` forms:

- `/c/<lowercase-UUID>`;
- `/g/g-p-<ASCII-project-id-or-slug>/c/<lowercase-UUID>`;
- `/g/g-p-<ASCII-project-id-or-slug>/project` for Project URLs only.

No credentials, explicit port, query, fragment, escaping or dot-segment normalization is accepted. A project-scoped chat must match its recorded Project. This is the supported v1 grammar, not a promise to accept every future ChatGPT URL shape. The stored opaque workspace handle is not automatically renewed after runtime restart; later adapters must obtain and verify fresh authority rather than treating this file as authorization.

## API and state transitions

`C2CSessionStore(root, options)` provides:

| Method | Behavior |
| --- | --- |
| `load()` | Read and validate a session, or return null only when absent. No directory creation. |
| `begin(input, expectedRevision=null)` | Create IDLE at revision 1. A replacement requires the current revision and a different task ID after DONE or an explicitly ended task. |
| `resume(taskId)` | Return the validated matching checkpoint without writes, sends, execution or a state transition. |
| `advance(revision, taskId, event)` | Apply the Phase 1 reducer with strict task/revision checks. INIT must also match the saved workspace ID and original goal. Direct START_EXECUTION is refused. |
| `startExecution(revision, taskId, config)` | Verify the actual PLAN, then persist EXECUTING and return the exact verified in-memory text snapshot. |
| `checkpoint(revision, taskId, patch)` | CAS update of the three progress fields; cannot replace task state, original goal or logs. |
| `endTask(revision, taskId, confirmation)` | Require confirmation equal to the exact task ID, retain the existing checkpoint and record its end. This ends metadata only; it neither stops nor owns a process. |

IDLE and all unfinished/stopped states, including BLOCKED, ERROR and RECOVERY_REQUIRED, occupy the workspace slot until an explicit end. Merely constructing another store, resuming or calling begin again cannot create a second active task. DONE is eligible for a new task only with the current revision. No arbitrary save/replace-session API is exposed.

`validateTaskState` is exported from the Phase 1 reducer so persisted-state validation reuses the same invariants. Its transition rules are unchanged. `buildHandoff(session)` projects the original goal, progress, current local state, known issues and next step to the Phase 1 HANDOFF wire schema and validates its formatter limit. It rejects ended tasks and does not operate a browser or change state. Reserved wire syntax in narrative text can make HANDOFF formatting fail; it is never silently truncated or interpreted as another control message.

## CAS, atomicity and failure semantics

Each mutation obtains one exclusive `wx` lock file adjacent to the session. Its random owner bytes and file identity must still match before commit and before release. A second store/process cannot pass the read/validate/write interval concurrently. Under this lock, the method loads and validates the current session, checks revision and task, computes a transition, writes a same-directory exclusive temporary file, fsyncs it, and atomically renames it through the retained `AtomicJsonFileStore`.

Immediately before rename, recheck lock ownership, directory identity, the complete previously read session and the temporary file identity. Any observed competing update aborts. The file writer and its existing mutation primitives are reused; the five new application-state mutation call sites are explicitly inventoried. No generic workspace writer or MCP mutation is introduced.

Successful writes increment revision by exactly one and read back the result. Pre-rename failures retain the old session and clean the owned temporary file. File fsync is required; the existing directory-sync capability can be supported or unsupported. A reported directory-sync failure after rename produces `COMMIT_UNCERTAIN`; the new revision may already be durable and the caller must load it before deciding what happened. Replaying the previous revision is rejected.

An abrupt process exit during writing can leave a temporary file and lock. They are preserved as evidence; no timeout, PID guess, automatic deletion or lock stealing occurs. Reads can still resume the last valid checkpoint, while writes report SESSION_LOCKED. Repair of interrupted in-flight operations and automatic recovery are Phase 6 work. Thus restart **after every completed checkpoint** is supported, but this phase does not claim automatic recovery from every interrupted syscall. The exclusive lock serializes cooperating clients; native path checks are defense in depth, not OS isolation against a hostile process with the same filesystem authority.

## PLAN integrity

`readPlanSnapshot(root, plan, config)` accepts only a strict PLAN message and fixed `.ai-bridge/current-plan.md`. It reuses `readGuidanceText` and the caller's effective blocked globs/read ceiling, with additional rejection of plan-path symlinks and junctioned parents. The reader verifies regular single-link identity, reads through one handle with its existing verification pass, rejects invalid UTF-8/binary data, and computes SHA-256 over the original bytes, including BOM and CRLF. Both hash and byte count must equal the Web PLAN metadata; known secrets are refused.

`startExecution` holds the session lock through this read and stores EXECUTING only after success. A mismatch, unreadable file, blocked path or secret leaves the original revision/state unchanged. The returned frozen text snapshot is the verified execution input. Future executors must consume that snapshot rather than re-read a mutable file; no filesystem helper can guarantee a later arbitrary read still sees the same content. This method does not launch an executor or expand its approval/Policy authority.

## Gate 2 and rollback

Test session creation/update, atomic replace and failure, corrupt JSON, wrong workspace, stale revision, concurrent processes, task conflicts, invalid URLs, changed PLAN and process restart at every checkpoint. Add injection tests for foreign lock replacement and uncertain commit. Run retained Node 20/24, adjacent reader/parser/inventory checks, compiled local smoke and existing MCP smoke. No real profiles or deployment state are used by tests.

Rollback only the new C2C modules/tests, the validator export, test inventory entries and Phase 2 documentation. Existing sessions must be retained for explicit user handling; removing code is not authorization to delete user state. No external profile migration, CLI/browser integration, runtime change, commit or publication is part of this phase.
