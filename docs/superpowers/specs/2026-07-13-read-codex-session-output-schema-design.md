# Direct `read_codex_session` Output Schema Design

> Date: 2026-07-13  
> Phase: 1  
> Slice: 26 of 28  
> Status: Approved under the user's delegated first-principles and uninterrupted-execution authority  
> Implementation state: Not started when this design was written

## 1. Decision summary

Migrate only the opt-in direct `read_codex_session` transcript reader to the established Phase 1 schema-v1 envelope.

The slice will:

- remain available only with `--codex-sessions read`, independently of `toolMode`;
- require one canonical session id, one canonical absolute source path, or both matching selectors;
- distinguish a confirmed missing id from an id that could be beyond the fixed Slice 25 discovery window;
- revalidate native real-path containment before reading;
- read one bounded file snapshot of at most 20,000,000 bytes;
- sanitize controls and redact sensitive-looking transcript content before applying the requested UTF-8 byte budget;
- return a safe prefix of one oversized final message when possible instead of discarding the whole message;
- advertise one exact twenty-field success contract and eight-field message records;
- validate one injected Provider boundary and map failures to eight stable redacted errors;
- add a bounded nested-only Tool Card while preserving the complete requested transcript in structured data;
- remain unstaged, uncommitted, unpushed, and unpublished until Slices 17–28 are complete.

The slice will not attach to a running Codex task, execute `codex resume`, search transcript text, modify history, add new roots, or implement process/session management.

## 2. First-principles framing

The goal is:

> Return the requested local Codex transcript with a provable selector, source boundary, snapshot limit, output limit, and redaction state—without claiming a bounded index proved that an omitted session does not exist.

That requires:

1. **Explicit authorization** — transcript bodies remain absent unless local configuration is exactly `read`.
2. **Unambiguous selection** — the effective id/path pair and how it was selected are public facts.
3. **Containment** — lexical input validation is followed by native real-path containment against configured active/archive roots.
4. **Bounded acquisition** — the opened file snapshot cannot exceed the fixed 20 MB ceiling or grow beyond the captured snapshot while streamed.
5. **Safe output** — controls are normalized and secrets are redacted before UTF-8 capping and byte accounting.
6. **Honest completeness** — message and byte truncation have exact causes; a truncated metadata index cannot yield a false `not found` claim.
7. **Failure containment** — raw paths, transcript text, filesystem diagnostics, and stacks never enter public errors.

## 3. Current implementation evidence

Current production flow:

```text
conditional read_codex_session registration
  → readCodexSession(config, selectors and limits)
      → source_path realpath check or bounded id index lookup
      → parse session metadata
      → stat path and reject files above 20 MB
      → stream JSONL response_item events
      → stop before a message that would exceed count/byte limits
  → build one Markdown transcript
  → flat structuredContent
```

Durable behavior to preserve:

- the tool is visible only in `codexSessions=read` and is visible in all three tool modes;
- callers may select by `session_id`, `source_path`, or both;
- `max_messages` is `1..400`, default `80`;
- `max_total_bytes` is `4000..400000`, default `80000`;
- regular messages, function-call names, and function-call outputs are returned; other events are ignored;
- id lookup is not limited by the preceding `codex_sessions.max_sessions` return window;
- a `source_path` returned by Slice 25 remains readable;
- no command is executed and no history file is modified.

Current defects and ambiguities:

- output is flat and has no exact `outputSchema` or stable tool-local failures;
- missing selectors, invalid ids, path escapes, mismatches, missing files, oversized files, and internal errors collapse into legacy text errors;
- a bounded 3000-file/depth-6 id lookup can falsely report `not found` after incomplete discovery;
- relative and path-equivalent source inputs are silently normalized rather than rejected as ambiguous selectors;
- role/tool labels and message controls are history-controlled and inserted into Markdown headings/content;
- redaction happens only after domain byte/truncation accounting, so published content can differ from claimed limits;
- one message larger than the remaining budget is dropped completely;
- a stat-then-path stream can observe file growth beyond the stated snapshot;
- the generic Tool Card can compact or render large structured transcript fields and invalidate the exact contract.

## 4. Approaches considered

### 4.1 Wrap the existing flat result only

Rejected because selection ambiguity, false not-found claims, pre-redaction accounting, whole-message loss, and unstable errors would remain.

### 4.2 Exact bounded transcript contract with one validated Provider boundary

Adopted. Harden the existing domain locally, expose request/snapshot/output facts, use typed operational failures, and migrate the dedicated consumer surface.

### 4.3 Build a persistent Codex task/session controller

Rejected. Live attachment, resume execution, PTY/process ownership, and cross-session lifecycle belong to later phases and would violate the Phase 1 tool-schema scope.

## 5. Exact input contract

```text
session_id?: string up to 128 characters
source_path?: string up to 4096 characters
max_messages?: integer 1..400; default 80
max_total_bytes?: integer 4000..400000; default 80000
```

Semantic normalization occurs once before the Provider:

- at least one selector is required;
- `session_id`, when present, must be an exact canonical lowercase UUID;
- `source_path`, when present, must be an exact canonical absolute native path with no surrounding whitespace or controls;
- if both are present, the parsed source must have the same session id;
- limits are echoed exactly after applying defaults.

Effective `selection` is exactly `session_id`, `source_path`, or `both`.

## 6. Exact public success contract

### 6.1 Envelope

```json
{
  "codexpro_tool": "read_codex_session",
  "codexpro_title": "Read Codex Session",
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

### 6.2 Exact twenty `data` fields

```json
{
  "codex_dir": "C:\\Users\\Noah\\.codex",
  "roots": [
    "C:\\Users\\Noah\\.codex\\sessions",
    "C:\\Users\\Noah\\.codex\\archived_sessions"
  ],
  "codex_sessions_mode": "read",
  "tool_mode": "full",
  "selection": "session_id",
  "requested_session_id": "019cc369-bd7c-7891-b371-7b20b4fe0b18",
  "requested_source_path": null,
  "max_messages": 80,
  "max_total_bytes": 80000,
  "max_source_file_bytes": 20000000,
  "source_file_bytes": 12345,
  "session": {},
  "messages": [],
  "message_count": 0,
  "content_bytes": 0,
  "redacted_message_count": 0,
  "truncated_message_count": 0,
  "truncated": false,
  "truncation_reason": null,
  "output_limited": false
}
```

Rules:

```text
roots == [codex_dir/sessions, codex_dir/archived_sessions]
source_file_bytes <= max_source_file_bytes
message_count == messages.length <= max_messages
content_bytes == sum(messages[].bytes) <= max_total_bytes
redacted_message_count == count(messages[].redacted)
truncated_message_count == count(messages[].truncated) <= 1
truncated == (truncation_reason != null)
output_limited == truncated
```

Selector invariants:

- `session_id`: requested id is non-null and equals `session.session_id`; requested path is null;
- `source_path`: requested path is non-null and equals `session.source_path`; requested id is null;
- `both`: both requested values are non-null and equal the resolved session identity;
- the session record is the exact nine-field Slice 25 record and its source remains under the root matching `storage`.

## 7. Exact message contract

Each returned message contains exactly eight fields:

```json
{
  "ordinal": 1,
  "kind": "message",
  "role": "user",
  "timestamp": 1783936800000,
  "content": "Please inspect the repository.",
  "bytes": 30,
  "redacted": false,
  "truncated": false
}
```

Rules:

- `ordinal` is contiguous and one-based in returned order;
- `kind` is `message | function_call | function_call_output`;
- `role` is `user | assistant | developer | system | tool | unknown`;
- timestamp is a non-negative epoch-millisecond integer within the JavaScript `Date` range (`0..8640000000000000`) or `null`;
- content is non-empty normalized text with NUL, DEL, and non-whitespace C0 controls removed;
- known secret shapes are absent from content;
- `bytes` is the exact UTF-8 size of content;
- only the last returned message may be truncated, and a truncated message must end with the fixed `\n...[message truncated]` marker;
- a function call remains a bounded `[Tool: name]` summary and does not expose arguments;
- function-call output is treated as transcript content and receives the same control normalization, redaction, and byte bound.

## 8. Redaction and truncation order

For every relevant JSONL event:

```text
extract content
  → normalize CRLF/lone CR and unsafe controls
  → normalize fixed role/tool label
  → redact sensitive-looking text
  → enforce remaining UTF-8 content budget
  → compute exact bytes and flags
```

The fixed partial-message marker is included inside the byte budget. If too little budget remains even for a useful marked prefix, no partial message is added and the overall result still reports `byte_limit`.

`truncation_reason` is:

- `message_limit` only after another relevant message exists beyond `max_messages`;
- `byte_limit` when another relevant message cannot fit completely;
- `null` when EOF is reached without omitting relevant transcript content.

Warnings, in order:

1. `Transcript output reached the requested message or byte limit.` when truncated;
2. `Sensitive-looking transcript content was redacted before return.` when any returned message was redacted.

## 9. Snapshot and containment model

- The configured roots are resolved with native realpath when present.
- A source selector is first required to be canonical absolute native syntax, then resolved with native realpath.
- The resolved source must remain strictly below one resolved configured root.
- Child symlink/junction escapes fail closed.
- The file is opened, statted through that handle, and rejected unless it is a regular file at or below 20,000,000 bytes.
- Streaming is bounded to the handle's captured size so concurrent append cannot expand the read beyond the reported snapshot.
- Every session identity observed in the opened snapshot must match the identity resolved before opening; a conflict fails closed as `SESSION_READ_FAILED`.
- Metadata and transcript acquisition are still not an OS-level atomic transaction; later sandbox/transaction phases remain responsible for stronger guarantees.

For id lookup, if no match is found and Slice 25 discovery was incomplete, return `SESSION_RESOLUTION_INCOMPLETE` rather than `SESSION_NOT_FOUND`; the caller can retry with an exact source path.

## 10. Provider trust boundary

Add:

```ts
readCodexSessionProvider?: (
  context: {
    config: CodexProConfig;
    request: NormalizedReadCodexSessionRequest;
  }
) => CodexSessionReadResult | Promise<CodexSessionReadResult>;
```

The handler independently verifies:

- strict Provider shape with no extra fields;
- exact configured directory/root identity;
- exact normalized selector and limits;
- exact Slice 25 session identity, source containment, and fixed resume command;
- safe ordered messages, byte counts, redaction/truncation flags, and aggregate bounds;
- source snapshot size and fixed 20 MB ceiling;
- no known secret shape or raw diagnostic crosses the boundary, including session identity metadata that generic result redaction would otherwise rewrite after schema validation.

Typed domain failures retain their stable code. Unknown Provider exceptions become `SESSION_READ_FAILED`; malformed or identity-drifting Provider results become `INTERNAL_ERROR`.

## 11. Exact failures

| Code | Message | Retryable | Details |
|---|---|---:|---|
| `REQUEST_INVALID` | `A canonical Codex session id or source path is required.` | false | `{ reason }` |
| `SESSION_NOT_FOUND` | `The requested Codex session was not found.` | false | `{ selector }` |
| `SESSION_RESOLUTION_INCOMPLETE` | `The bounded Codex session index could not prove that this session is absent.` | false | `{ selector: "session_id" }` |
| `SOURCE_PATH_OUTSIDE_ROOTS` | `The Codex session source is outside the configured history roots.` | false | `{}` |
| `SESSION_ID_MISMATCH` | `The requested session id does not match the selected source.` | false | `{}` |
| `SESSION_FILE_TOO_LARGE` | `The Codex session file exceeds the fixed read ceiling.` | false | `{ max_source_file_bytes: 20000000 }` |
| `SESSION_READ_FAILED` | `The Codex session transcript could not be read safely.` | true | `{}` |
| `INTERNAL_ERROR` | `The Codex session reader failed because of an internal error.` | false | `{}` |

Allowed request reasons are `selector_required`, `session_id_invalid`, and `source_path_invalid`. Allowed not-found selectors are `session_id` and `source_path`. No public error contains a requested path, session history content, raw exception, operating-system code, or stack.

## 12. Human text and Tool Card

Human success text reports selector, source/session identity, requested limits, snapshot bytes, returned content bytes, message/redaction/truncation counts, and the safe transcript. It never uses history-controlled text as an unbounded Markdown heading.

The Tool Card will:

- recognize `read_codex_session` explicitly;
- consume only nested `data` and `error`;
- show selector, message/content counts, redaction, and truncation state;
- preview at most eight messages and at most 600 characters per message;
- never render the entire raw transcript or JSON envelope;
- preserve the complete bounded structured result by setting `codexpro/preserveStructuredContent=true`.

No flat fallback is retained for this migrated direct tool.

## 13. Compatibility

- Slice 25 `codex_sessions` remains unchanged.
- Its `source_path` output remains a valid direct selector.
- Existing protected Smoke checks consume only human transcript text, so protected sources require no semantic edit; compatibility tests will fail closed if that assumption drifts.
- The existing Slice 25 adjacency assertion migrates from flat `session/message_count` to nested `data`.
- No public input, configuration flag, visibility rule, or command changes.
- Public release notes remain deferred to the unified Slice 17–28 publication.

## 14. Verification strategy

Focused tests prove:

1. exact schema, warnings, failures, and cross-field invariants;
2. read-only visibility across all tool modes and exact descriptor/schema advertisement;
3. id, path, and combined selector normalization and identity;
4. confirmed not-found versus incomplete bounded resolution;
5. native path and symlink/junction containment;
6. fixed file-size and handle-bounded snapshot behavior;
7. message kinds/roles/order/timestamps and ignored events;
8. control normalization, redaction-before-cap, Unicode byte accounting, Date-renderable timestamps, and fixed-marker partial final messages;
9. opened-snapshot session identity, Provider exception/drift classification, and absence of diagnostics or post-schema secret rewrites;
10. bounded human text and nested-only Tool Card;
11. Slice 25 source-path adjacency and protected-Smoke compatibility;
12. complete regression, Build, Smoke, Windows Stress, package, static, and `neat-freak` gates.

Post-result review covers Windows path case, configured-root symlinks, source replacement/growth races, zero/huge/malformed files, CRLF/Unicode/control content, redaction length expansion, exact-limit EOF, Provider counts/order, human Markdown safety, Widget bounds, and advertised/runtime agreement. Every material defect receives a deliberate RED.

## 15. Rollback

Remove the Slice 26 schema/test/design/plan and revert only its domain reader, dependency/handler, Tool Card, Slice 25 adjacency, and active-memory changes. Preserve Slices 17–25, protected Smoke sources, and closed archives.

## 16. Accepted design

Use the exact bounded transcript contract with canonical selectors, honest incomplete-resolution failure, handle-bounded source snapshots, redaction-before-UTF-8-capping, one safe partial final message, validated Provider output, stable redacted failures, and a bounded nested-only consumer.
