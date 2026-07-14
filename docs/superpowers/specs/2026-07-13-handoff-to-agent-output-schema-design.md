# Direct `handoff_to_agent` Output Schema Design

> Date: 2026-07-13  
> Phase: 1, Slice 23  
> Status: locally complete, post-result reviewed, `neat-freak` reconciled, and unpublished  
> Publication: part of the unified Slice 17–28 end-of-goal batch

## 1. Decision summary

Migrate only direct `handoff_to_agent` to the strict six-field Phase 1 envelope. Preserve its seven inputs, standard/full visibility, minimal-mode availability when `writeMode=handoff`, planning-only purpose, fixed AI-bridge artifact paths, direct supertool alias, shell-safe command hint, and the legacy flat `handoff_to_codex` result until Slice 24.

The exact contract will:

1. prepare and validate the complete request before any scaffold, plan, or log write;
2. preflight all nine fixed scaffold paths and both append logs before the first write;
3. distinguish a physically existing plan file from a meaningful prior plan;
4. apply append only when a meaningful prior plan exists, otherwise create a new plan and emit one fixed warning;
5. expose the exact final plan bytes and SHA-256 so `wait_for_handoff(plan_hash=...)` can bind to this plan;
6. expose exact pre-call diff facts, including whether the bounded diff text was truncated;
7. append one deterministic event to both fixed logs and expose its bytes and hash;
8. validate the provider result strictly, then reread the plan and both log tails before returning success;
9. add stable safe failures, a bounded nested Tool Card, protected-Smoke compatibility, and direct-supertool preservation;
10. leave `handoff_to_codex`, local agent execution, process management, transactions, Policy Kernel behavior, publication, and remote Git mutations untouched.

## 2. First-principles contract

The tool answers:

> For this authorized workspace and target implementation agent, what exact plan was durably written, did append actually occur, and were both handoff logs updated with the same event?

The answer must make these facts machine-verifiable:

- workspace, active modes, target agent, display name, optional model, title, and one request timestamp;
- all fixed artifact paths and scaffold files created by this call;
- whether `current-plan.md` physically existed and whether it contained a meaningful prior plan;
- whether append was requested and whether it was actually applied;
- prior/final UTF-8 bytes, final SHA-256, and the pre-call plan diff;
- both log identities and the exact common event bytes/hash;
- the bounded local-agent prompt and its exact UTF-8 bytes.

The operation remains planning-only. A successful result does not mean an agent started, read the file, changed code, or passed verification.

## 3. Inputs, visibility, and defaults

The public inputs remain:

```text
workspace_id?
agent?
agent_name?
model?
title?
plan
append?
```

Effective defaults remain:

```text
agent = "custom"
agent_name = known display name or normalized agent id
model = null
title = "Agent implementation plan"
append = false
```

Bounds become explicit:

- `workspace_id`: at most 160 characters and one line;
- `agent`: 1–64 characters, normalized to lowercase, matching `[a-z0-9][a-z0-9._-]*`;
- `agent_name`: at most 80 characters after whitespace collapse;
- `model`: at most 120 characters after whitespace collapse;
- `title`: at most 120 characters after whitespace collapse;
- `plan`: non-empty after trimming; the complete generated plan must fit `config.maxWriteBytes`.
- An existing `current-plan.md` is read only within `config.maxReadBytes`; `maxWriteBytes` cannot expand that read boundary. The final generated plan is then checked independently against `config.maxWriteBytes`.

The direct tool stays visible in standard and full modes. In minimal mode it remains visible only for `writeMode=handoff`. It remains hidden in connection-test mode. It remains callable even when ordinary workspace writes are off because it is the explicit planning exception. The annotation remains write-capable, local-only, non-destructive, and non-idempotent.

## 4. Exact envelope

Every handler success and classified failure has exactly:

```ts
interface HandoffToAgentOutput {
  codexpro_tool: "handoff_to_agent";
  codexpro_title: "Handoff To Agent";
  ok: boolean;
  data: HandoffToAgentData | null;
  error: HandoffToAgentError | null;
  meta: {
    schemaVersion: 1;
    durationMs: number;
    warnings: string[];
  };
}
```

Success requires `ok:true`, non-null `data`, and `error:null`. Failure requires `ok:false`, `data:null`, non-null `error`, `isError:true`, and no warnings. Flat legacy fields are rejected for this direct tool.

## 5. Exact success data

```ts
interface HandoffToAgentData {
  workspace_id: string;
  root: string;
  tool_mode: "minimal" | "standard" | "full";
  write_mode: "off" | "handoff" | "workspace";
  agent: string;
  agent_name: string;
  model: string | null;
  title: string;
  updated_at: string;
  append_requested: boolean;
  append_applied: boolean;
  max_write_bytes: number;
  plan_path: string;
  status_path: string;
  diff_path: string;
  log_path: string;
  execution_log_path: string;
  created_context_files: string[];
  created_context_file_count: number;
  plan_file_existed_before: boolean;
  prior_plan_available: boolean;
  previous_bytes: number;
  plan_bytes: number;
  plan_sha256: string;
  additions: number;
  deletions: number;
  changed: boolean;
  diff: string;
  diff_bytes: number;
  diff_truncated: boolean;
  logged_paths: string[];
  logged_count: number;
  event_bytes: number;
  event_sha256: string;
  prompt: string;
  prompt_bytes: number;
}
```

The data object has exactly thirty-six fields.

## 6. Prepared request and fixed paths

One immutable prepared request owns the normalized agent identity, display name, optional model, title, trimmed plan, append request, ISO-8601 timestamp, generated plan body, prompt, and deterministic JSONL event.

All one-line values reject control characters after normalization. The timestamp is injected once and reused in the Markdown `Updated:` line and log event. The final plan, prompt, and event are generated from prepared values only.

The fixed configured paths are:

```text
${contextDir}/current-plan.md
${contextDir}/agent-status.md
${contextDir}/codex-status.md
${contextDir}/implementation-diff.patch
${contextDir}/session-log.jsonl
${contextDir}/execution-log.jsonl
```

The nine scaffold paths are the existing `ensureAiBridge` fixed set in its current order. Before `ensureAiBridge` runs, the configured context directory, every existing context-directory ancestor, and every fixed target are resolved with write-strength `PathGuard` checks. Existing directory components must be directories and existing artifact targets must be regular files; a blocked path, escape, symlink/junction escape, file-shaped directory/ancestor, or invalid existing target fails before any write.

## 7. Append semantics

The preflight reads `current-plan.md` before scaffold creation when it exists and is a bounded text file.

```text
plan_file_existed_before = current-plan.md physically existed at preflight
prior_plan_available = file existed and was not the canonical empty scaffold plan after CRLF/CR line-ending normalization
append_applied = append_requested && prior_plan_available
```

When append is applied:

```text
final = previous.trimEnd() + "\n\n---\n\n" + new body
```

Otherwise the new body replaces the prior content. If append was requested but no meaningful prior plan existed, the call succeeds by creating a new plan and emits exactly:

```text
No prior handoff plan existed, so a new plan was created.
```

This avoids appending a real task below `No plan written yet.`. `previous_bytes` is the exact pre-call file size, including the scaffold placeholder when present, and is zero only when the file was absent.

## 8. Plan, diff, event, and prompt integrity

The complete final plan is checked for UTF-8 byte size and secret-looking content before the first write. Oversize or secret-bearing content fails without creating the bridge.

The reported diff compares the pre-call plan text with the final text, not the temporary scaffold created inside the operation. It retains the existing 60,000-character diff bound and fixed marker. Define:

```text
plan_bytes = UTF-8 bytes of final plan
plan_sha256 = SHA-256(final plan)
diff_bytes = UTF-8 bytes of returned bounded diff
diff_truncated = returned diff ends with the fixed makeUnifiedDiff truncation marker
changed = final plan differs from pre-call plan text
```

The same deterministic JSONL event, including `plan_hash`, is appended to `session-log.jsonl` and `execution-log.jsonl`. `logged_paths` is exactly those paths in that order. `event_bytes` includes the trailing newline and `event_sha256` hashes that exact byte sequence.

The prompt remains a local execution hint. OpenCode/Pi model and plan arguments retain single-quote shell escaping. Its exact UTF-8 length is `prompt_bytes`; it is bounded by construction and the Tool Card applies an additional display bound.

After strict provider validation, the handler:

1. reopens the fixed plan through `PathGuard` and verifies exact content, bytes, and SHA-256;
2. reads exactly `event_bytes` from the tail of each fixed log;
3. verifies each tail equals the returned event and therefore has the same hash.

Only then may it return success. The hash matches the CLI `planHash(planText)` algorithm and can be passed directly to `wait_for_handoff.plan_hash`.

## 9. Created scaffold effects and failure atomicity

`created_context_files` is the ordered subset of the fixed nine scaffold paths created by this call. The current plan may appear in this list even though it is immediately replaced by the prepared plan; the public diff remains relative to pre-call state.

Phase 1 does not claim a transaction across scaffold creation, plan replacement, and two log appends. An operating-system failure can leave a partial scaffold, a written plan, or only one updated log. Such a call returns an error and never claims success. Phase 3 transaction work may later make the multi-file operation atomic without changing the meaning of this V1 result.

## 10. Warnings

Success has exactly one warning iff `append_requested=true` and `append_applied=false`:

```text
No prior handoff plan existed, so a new plan was created.
```

Otherwise success warnings are empty. Failures always have empty warnings.

## 11. Stable failures

All failures use fixed safe messages and never expose raw exception text, stack traces, absolute request paths, allowed roots, plan content, model credentials, or log content.

| Code | Meaning | Retryable |
|---|---|---:|
| `WORKSPACE_NOT_FOUND` | Requested/default workspace is unavailable | false |
| `REQUEST_INVALID` | Agent/name/model/title/plan/append input is invalid | false |
| `OUTPUT_PATH_BLOCKED` | A fixed bridge output is blocked | false |
| `OUTPUT_PATH_OUTSIDE_WORKSPACE` | A fixed bridge output escapes the workspace | false |
| `OUTPUT_PATH_INVALID` | A fixed existing output is not a usable regular file | false |
| `EXISTING_PLAN_TOO_LARGE` | Existing plan exceeds `maxReadBytes` | false |
| `EXISTING_PLAN_NOT_TEXT` | Existing plan is binary | false |
| `EXISTING_PLAN_READ_FAILED` | Existing plan could not be read safely | false |
| `PLAN_TOO_LARGE` | Generated final plan exceeds `maxWriteBytes` | false |
| `PLAN_SECRET_BLOCKED` | Generated plan contains secret-looking content | false |
| `SCAFFOLD_WRITE_FAILED` | Fixed scaffold creation failed | false |
| `PLAN_WRITE_FAILED` | Final plan replacement failed | false |
| `LOG_WRITE_FAILED` | One or both fixed log appends failed | false |
| `HANDOFF_WRITE_FAILED` | Recognized operation could not complete safely | false |
| `INTERNAL_ERROR` | Provider/schema/integrity invariant failed | false |

`REQUEST_INVALID.details.source` is one of `agent`, `agent_name`, `model`, `title`, `plan`, or `append`. Path failures expose only `source:"context_dir"`. Other failures use empty details.

## 12. Provider boundary

Add one dependency seam:

```ts
handoffToAgentProvider?: (
  context: HandoffToAgentProviderContext
) => HandoffWriteResult | Promise<HandoffWriteResult>;

handoffToAgentNow?: () => string;
```

The context contains config, guard, workspace, prepared request, and preflight output. The provider result is strict and contains both public facts and the internal final plan/event text needed for end-to-end integrity validation.

The handler rejects:

- workspace, root, agent, model, title, timestamp, append, limit, or path drift;
- reordered/duplicate/non-fixed scaffold or log paths;
- incorrect previous/final bytes, plan hash, diff counts/marker, event bytes/hash, or prompt bytes;
- a final plan whose framing does not match the prepared request;
- a success claim without the exact plan artifact and identical event tails on disk;
- extra provider fields.

Provider drift maps to `INTERNAL_ERROR`, not a partially trusted result.

## 13. Human text, Tool Card, and consumers

MCP text contains a bounded summary: target, saved plan path, hash, append outcome, both log paths, diff stats, and the prompt. It does not duplicate the complete plan. The diff preview uses an additional bounded excerpt.

The dedicated Tool Card reads nested `data` first and supports historical flat fallback only for `handoff_to_codex` during Slice 23. It shows target/model, plan/hash, append state, diff stats, fixed paths, a bounded prompt, and a bounded diff preview. The direct result sets `codexpro/preserveStructuredContent:true` so exact structured diff and prompt fields are not silently compacted.

Protected `scripts/smoke.mjs` remains unchanged. `scripts/smoke-platform-compat.mjs` replaces the one direct flat `agent` read with `data?.agent` and the one legacy free-text oversize regex with the stable `EXISTING_PLAN_TOO_LARGE` code, each using an exact fail-closed count. Native Stress continues to assert the direct supertool wrapper and additionally validates the nested child envelope. HTTP Smoke advertises the tool but consumes no result field, so no HTTP substitution is needed.

## 14. Compatibility and non-goals

Preserved:

- all seven inputs and defaults;
- fixed context directory and scaffold names;
- planning-only behavior and ordinary-write exception;
- known display names and shell-safe prompt hints;
- direct supertool alias `agent_handoff`;
- `handoff_to_codex` flat contract until Slice 24;
- CLI execute/watch/loop handoff plan-hash compatibility.

Not included:

- starting, polling, interrupting, or terminating a local agent;
- arbitrary output paths or custom logs;
- network access, remote Git mutation, or credential management;
- atomic multi-file transactions or rollback;
- Policy Kernel, approval, hook, Skill trust, or OS sandbox behavior;
- staging, commit, push, release, or exact-head CI.

## 15. Verification and rollback

Required local evidence:

- focused schema/domain/MCP/provider/Tool Card/supertool/compatibility tests;
- deliberate post-result RED for every material review finding;
- adjacent handoff/read/wait/export/write contracts and Build;
- complete regression, Smoke, native-Windows Stress, package dry-run;
- protected-source, exact-scope, secret-pattern, whitespace, Markdown/reference, memory/archive, and Git-index checks;
- per-tool `neat-freak` reconciliation.

Rollback is file-local inside the unpublished shared batch: remove the Slice 23 schema/domain/test and revert only its handler, Tool Card, compatibility, Stress, design/plan, and memory records. Do not reset the shared tree or alter Slices 17–22.
