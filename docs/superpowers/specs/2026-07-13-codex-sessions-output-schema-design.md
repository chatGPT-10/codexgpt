# Direct `codex_sessions` Output Schema Design

> Date: 2026-07-13  
> Phase: 1  
> Slice: 25 of 28  
> Status: Approved under the user's delegated first-principles and uninterrupted-execution authority  
> Implementation state: Locally complete, reviewed, verified, per-tool reconciled, and unpublished inside the unified Slice 17–28 batch

## 1. Decision summary

Migrate only the optional direct `codex_sessions` metadata-index tool to the established Phase 1 schema-v1 envelope.

The slice will:

- preserve explicit `--codex-sessions metadata|read` opt-in;
- remain available in `minimal`, `standard`, and `full` tool modes after opt-in;
- preserve metadata-only behavior even when transcript reads are enabled separately;
- advertise one exact nested output schema;
- expose the effective query, return limit, scan limits, result counts, and completeness state;
- validate Provider identity, paths, counts, uniqueness, ordering, and fixed resume commands before publication;
- reject unsafe history-supplied session identifiers instead of constructing a copyable command from them;
- make filesystem discovery and duplicate selection deterministic;
- migrate the Tool Card and protected-Smoke compatibility harness to nested `data` without editing either protected Smoke source;
- remain unstaged, uncommitted, unpushed, and unpublished until Slices 17–28 are complete.

The slice will not return transcript bodies or tail summaries, attach to a live Codex task, execute `codex resume`, or change `read_codex_session` output.

## 2. First-principles framing

The goal is:

> Give ChatGPT a trustworthy, bounded index of resumable local top-level Codex sessions, while making partial discovery visible and never turning untrusted history text into a dangerous command.

That requires:

1. **Authorization** — the tool exists only after explicit local-history opt-in.
2. **Identity** — the result states which Codex directory, roots, session mode, and tool mode it describes.
3. **Index integrity** — each record has one safe id, one exact resume command, one in-root source, and deterministic ordering.
4. **Completeness** — the caller can distinguish a complete result from filesystem-scan or `max_sessions` truncation.
5. **Failure containment** — Provider failures and malformed internal results become stable redacted errors.

It does not require a process controller, live-task attachment, memory import, or Policy Kernel behavior.

## 3. Current implementation evidence

Current production flow:

```text
conditional direct codex_sessions registration
  → listCodexSessions(config, { maxSessions, query })
      → scan <codex_dir>/sessions and <codex_dir>/archived_sessions
      → read bounded JSONL head/tail slices
      → omit subagent/unparseable files
      → filter and sort metadata
  → flat structuredContent
```

Current durable behavior:

- `codexSessions=off` advertises neither session tool;
- `metadata` advertises only `codex_sessions`;
- `read` advertises both direct session tools;
- opt-in session tools are added independently of `toolMode`;
- `max_sessions` is an integer `1..200`, default `30`;
- `query` matches session id, title, project directory, and source path case-insensitively;
- two fixed roots are scanned recursively to depth `6`, with at most `3000` JSONL candidates total;
- each metadata parse reads at most 64 KiB from the head and 64 KiB from the tail;
- subagent histories and unreadable/stale files are omitted;
- source paths can later be passed to `read_codex_session` only in explicit `read` mode;
- protected Smoke proves metadata mode cannot search transcript-tail text.

Current defects and ambiguities:

- output is flat and has no exact `outputSchema`;
- scan limits and partial discovery are invisible;
- return and total counts are not cross-validated;
- filesystem enumeration and equal-time ordering are not deterministic;
- duplicate ids can produce ambiguous records and later id resolution;
- a history-supplied non-UUID id is inserted into `codex resume <id>` without command-safe validation;
- `project_dir` is not bounded or normalized before text output;
- no independent Provider seam proves paths and counts belong to configured roots;
- the generic Tool Card would display the whole envelope after nesting.

## 4. Approaches considered

### 4.1 Wrap the existing flat object only

Rejected because scan incompleteness, unsafe commands, duplicate ambiguity, and unvalidated Provider data would remain.

### 4.2 Tool-local exact index contract and validated Provider boundary

Add one schema module, explicit discovery accounting, deterministic indexing, safe UUID identity, one Provider seam, fixed warnings/errors, and bounded consumer migration.

Decision: adopt this approach. It solves the trust and completeness problems while leaving transcript reading for Slice 26.

### 4.3 Build a live Codex task/session manager now

Rejected because attaching to tasks, controlling processes, importing memories, or executing resume commands exceeds a read-only metadata index and belongs to later process/session architecture.

## 5. Scope

### 5.1 In scope

- `src/tools/schemas/codexSessions.ts`;
- exact direct-tool `outputSchema`;
- exact eighteen-field success `data` and nine-field session records;
- effective query, `max_sessions`, scan limits, and full accounting;
- deterministic traversal, ordering, and duplicate-id selection;
- fixed truncation warnings;
- safe UUID-only identities and exact resume commands;
- bounded one-line title/project/path fields;
- one injected `codexSessionsProvider` boundary;
- two fixed non-retryable failures;
- nested-only bounded Tool Card handling;
- protected main-Smoke in-memory compatibility migration;
- focused through package/static verification;
- per-tool `neat-freak` reconciliation.

### 5.2 Out of scope

- changing `read_codex_session` structured output;
- returning transcript-tail summaries or message bodies;
- live task attachment or running `codex resume`;
- modifying history files or expanding roots;
- workspace lifecycle or ownership;
- Permission Profiles, approval, Hooks, Skills trust, Sandbox, OAuth, or scopes;
- changing CLI/profile setting names;
- editing protected `scripts/smoke.mjs` or `scripts/http-smoke.mjs`;
- staging, commit, push, release, or exact-head CI before Slice 28;
- dependencies or general server decomposition.

## 6. Exact input contract

```text
max_sessions?: integer 1..200; default 30
query?: string up to 500 characters
```

The handler normalizes `query` to a trimmed, whitespace-collapsed, bounded one-line string. Empty normalized input becomes `null`. Matching remains case-insensitive over exactly:

```text
session_id
title
project_dir
source_path
```

No transcript message or summary participates in filtering.

## 7. Exact public success contract

### 7.1 Envelope

```json
{
  "codexgpt_tool": "codex_sessions",
  "codexgpt_title": "Codex Sessions",
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

No success field is duplicated at the top level.

### 7.2 Exact eighteen `data` fields

```json
{
  "codex_dir": "C:\\Users\\Noah\\.codex",
  "roots": [
    "C:\\Users\\Noah\\.codex\\sessions",
    "C:\\Users\\Noah\\.codex\\archived_sessions"
  ],
  "codex_sessions_mode": "metadata",
  "tool_mode": "standard",
  "query": null,
  "max_sessions": 30,
  "scan_file_limit": 3000,
  "scan_depth_limit": 6,
  "scanned_file_count": 2,
  "indexed_session_count": 1,
  "excluded_file_count": 0,
  "duplicate_file_count": 1,
  "sessions": [
    {
      "provider_id": "codex",
      "session_id": "019cc369-bd7c-7891-b371-7b20b4fe0b18",
      "storage": "active",
      "title": "Fix the session index",
      "project_dir": "D:\\Dev\\codexgpt",
      "created_at": 1783936800000,
      "last_active_at": 1783937100000,
      "source_path": "C:\\Users\\Noah\\.codex\\sessions\\2026\\07\\session.jsonl",
      "resume_command": "codex resume 019cc369-bd7c-7891-b371-7b20b4fe0b18"
    }
  ],
  "session_count": 1,
  "total_found": 1,
  "discovery_truncated": false,
  "results_truncated": false,
  "output_limited": false
}
```

Rules:

```text
roots.length == 2
scanned_file_count <= scan_file_limit
scanned_file_count == indexed_session_count + excluded_file_count + duplicate_file_count
session_count == sessions.length
session_count <= max_sessions
session_count <= total_found <= indexed_session_count
results_truncated == (total_found > session_count)
output_limited == (discovery_truncated || results_truncated)
```

`total_found` keeps its existing meaning: unique indexed sessions matching the effective query before the return limit.

`excluded_file_count` includes candidates that were unreadable, malformed, subagent-sourced, or lacked a safe top-level identity. `duplicate_file_count` counts valid files removed after deterministic duplicate-id selection.

## 8. Exact session record contract

Each record contains exactly nine fields:

```json
{
  "provider_id": "codex",
  "session_id": "019cc369-bd7c-7891-b371-7b20b4fe0b18",
  "storage": "active",
  "title": "Fix the session index",
  "project_dir": "D:\\Dev\\codexgpt",
  "created_at": 1783936800000,
  "last_active_at": 1783937100000,
  "source_path": "C:\\Users\\Noah\\.codex\\sessions\\2026\\07\\session.jsonl",
  "resume_command": "codex resume 019cc369-bd7c-7891-b371-7b20b4fe0b18"
}
```

Rules:

- `provider_id` is exactly `codex`;
- `session_id` is a canonical lowercase UUID;
- `storage` is `active | archived`, derived from the fixed source root;
- `title` and `project_dir` are bounded safe one-line strings or explicit `null`;
- `created_at` and `last_active_at` are non-negative epoch-millisecond integers or `null`;
- `source_path` is a bounded absolute native path under the root matching `storage`;
- `resume_command` is exactly `codex resume <session_id>`;
- `summary` and transcript bodies are absent;
- session ids are unique.

Provider ids that are not safe UUIDs are ignored. A safe UUID may be recovered from the filename when the payload id is absent or unsafe; unsafe payload text never appears in the command.

## 9. Deterministic discovery and ordering

Directory entries are traversed in ordinal name order. `discovery_truncated=true` when a candidate subtree or entry is omitted by the fixed depth/file bounds.

Valid records are ordered by:

1. effective activity time descending (`last_active_at`, else `created_at`, else `0`);
2. creation time descending;
3. `active` before `archived` for an exact tie;
4. session id ascending;
5. source path ascending.

The first record wins for each duplicate id. Filtering preserves that order, and `max_sessions` slices only after de-duplication and filtering.

## 10. Provider trust boundary

Add:

```ts
codexSessionsProvider?: (
  context: {
    config: CodexGPTConfig;
    options: { maxSessions: number; query?: string };
  }
) => CodexSessionListResult | Promise<CodexSessionListResult>;
```

The handler independently verifies:

- strict Provider shape;
- `codex_dir` and both roots match active configuration;
- every source is absolute and contained by its declared root;
- ids, commands, metadata, timestamps, uniqueness, and order are valid;
- counts and truncation flags agree;
- returned count and `total_found` agree with the request;
- no summary/transcript field crosses the boundary.

Provider exceptions become `SESSION_INDEX_FAILED`. Malformed or identity-drifting results become `INTERNAL_ERROR`.

## 11. Warnings and failures

Fixed warnings, in order:

```text
Codex session discovery reached its fixed filesystem limits.
More matching Codex sessions exist than max_sessions returned.
```

Failures have no warnings:

| Code | Message | Retryable | Details |
|---|---|---:|---|
| `SESSION_INDEX_FAILED` | `Local Codex session metadata could not be indexed safely.` | false | `{}` |
| `INTERNAL_ERROR` | `The Codex session index failed because of an internal error.` | false | `{}` |

No raw filesystem error, history content, path, token, or stack is exposed.

## 12. Human text and Tool Card

Success text reports mode, effective query, indexed/matched/returned counts, scan/exclusion/duplicate counts, and completeness. It shows at most 30 summaries; the complete bounded array remains structured.

The Tool Card will:

- recognize `codex_sessions` explicitly;
- read only nested `data`;
- show returned/matched counts and completeness;
- display at most twelve rows;
- bound every rendered field;
- never render raw JSON for the full session array.

No flat fallback is retained for this migrated tool; the direct handler and in-repository consumers migrate together inside the unpublished batch.

## 13. Compatibility and protected tests

- Visibility remains configuration-driven and independent of `toolMode`.
- `read_codex_session` remains read-mode-only and flat until Slice 26.
- `source_path` remains usable after Slice 26 performs its own validation.
- `scripts/smoke-platform-compat.mjs` performs exact-count in-memory substitutions for four protected flat reads.
- Protected Smoke source files remain byte-for-byte unchanged.
- No public release note is added until unified publication.

## 14. Verification strategy

Focused tests prove:

1. exact schema, warnings, failures, and invariants;
2. off/metadata/read visibility and advertised schema;
3. nested success with request/config identity;
4. metadata filtering cannot match transcript-tail text;
5. deterministic traversal/order/de-duplication/accounting;
6. unsafe ids never become resume commands;
7. Provider exception and drift classification;
8. root/source containment;
9. bounded nested-only Tool Card;
10. fail-closed protected-Smoke substitutions;
11. existing `read_codex_session` compatibility.

Post-result review covers root symlinks, Windows path case, races, bounds, duplicate ambiguity, filtering, transcript leakage, text/widget limits, and advertised/runtime agreement. Each material defect gets a deliberate RED.

## 15. Rollback

Remove the Slice 25 schema/test/design/plan and revert only its domain indexing, dependency/handler, Tool Card, compatibility-harness, and active-memory changes. Preserve Slices 17–24, protected Smoke sources, and closed archives.

## 16. Accepted design

Use the tool-local exact index contract with validated Provider output, visible completeness, safe UUID commands, deterministic duplicate handling, bounded nested consumers, and no transcript/process/Policy-Kernel expansion.
