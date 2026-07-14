# Direct `handoff_to_codex` Output Schema Design

> Date: 2026-07-13  
> Phase: 1, Slice 24  
> Status: locally complete, post-result reviewed, and `neat-freak` reconciled; unpublished  
> Publication: part of the unified Slice 17–28 end-of-goal batch

## 1. Decision summary

Migrate only direct `handoff_to_codex` from its legacy flat result to the strict six-field Phase 1 envelope. Preserve its four inputs, full-mode-only visibility, planning-only purpose, fixed AI-bridge artifacts, `codex_handoff` supertool alias, Codex-specific prompt, and current ability to write handoff artifacts even when ordinary workspace writes are off.

The tool is a fixed-target adapter over the hardened handoff domain, not a second implementation. Every accepted request uses:

```text
agent       = codex
agent_name  = Codex
model       = null
event       = handoff_to_codex
```

It exposes the same thirty-six durable facts as `handoff_to_agent`, but under its own exact schema and constructors. It does not execute Codex, attach to a Codex App task, broaden the tool surface, add arbitrary paths, or introduce Phase 2/Policy Kernel/process behavior.

## 2. First-principles contract

The user goal is to save one exact Codex implementation plan and receive enough machine-readable evidence to bind later waiting/execution workflows to that plan. Success therefore means all of the following are true:

1. the workspace and complete request were validated before any write;
2. all fixed output paths were preflighted inside the workspace;
3. the prior plan was read only within `config.maxReadBytes`;
4. append was applied only to a meaningful prior plan;
5. the final plan fits `config.maxWriteBytes` and passes secret protection;
6. one deterministic `handoff_to_codex` event was appended to both fixed logs;
7. provider output exactly matches the prepared request and preflight facts;
8. the exact plan bytes/hash and identical event tail in both logs were reread before success;
9. the returned `plan_sha256` is the hash accepted by `wait_for_handoff.plan_hash` and existing CLI handoff execution.

Approval, sandboxing, process execution, and transactions remain separate later concerns. A partial write can return failure but cannot be represented as success.

## 3. Inputs, visibility, and defaults

The public inputs remain:

```ts
interface HandoffToCodexInput {
  workspace_id?: string;
  title?: string;
  plan: string;
  append?: boolean;
}
```

Exact normalization:

- `workspace_id`: optional, at most 160 characters; omitted means the default workspace;
- `title`: optional, whitespace-collapsed, at most 120 normalized characters, default `Codex implementation plan`;
- `plan`: required string, non-empty after trimming;
- `append`: optional boolean, default `false`.

The complete generated plan must fit `config.maxWriteBytes`. An existing `current-plan.md` is read only within `config.maxReadBytes`; the write ceiling never expands the read ceiling.

Visibility is preserved exactly:

- advertised in `toolMode=full`;
- hidden in standard and minimal modes, including minimal handoff mode;
- hidden in connection-test mode;
- callable in full mode for `writeMode=off`, `handoff`, or `workspace` because this is the explicit planning-only write exception;
- annotation remains local-only, write-capable, non-destructive, and non-idempotent.

## 4. Exact envelope

Every classified success and failure has exactly:

```ts
interface HandoffToCodexOutput {
  codexpro_tool: "handoff_to_codex";
  codexpro_title: "Handoff To Codex";
  ok: boolean;
  data: HandoffToCodexData | null;
  error: HandoffToCodexError | null;
  meta: {
    schemaVersion: 1;
    durationMs: number;
    warnings: string[];
  };
}
```

Success requires `ok=true`, populated `data`, `error=null`. Failure requires `ok=false`, `data=null`, one fixed `error`, and MCP `isError=true`. Flat legacy fields are rejected.

## 5. Exact success data

Success contains exactly thirty-six fields:

```ts
interface HandoffToCodexData {
  workspace_id: string;
  root: string;
  tool_mode: "full";
  write_mode: "off" | "handoff" | "workspace";
  agent: "codex";
  agent_name: "Codex";
  model: null;
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
  logged_count: 2;
  event_bytes: number;
  event_sha256: string;
  prompt: string;
  prompt_bytes: number;
}
```

Fixed path identities are derived from the configured safe context directory:

```text
<context>/current-plan.md
<context>/agent-status.md
<context>/implementation-diff.patch
<context>/session-log.jsonl
<context>/execution-log.jsonl
```

`created_context_files` is an exact ordered subset of the nine canonical scaffold files. `logged_paths` is exactly the session log followed by the execution log.

## 6. Cross-field invariants

The schema and handler enforce:

- target identity is exactly Codex and `tool_mode` is exactly `full`;
- all fixed paths share one safe configured context directory;
- created count equals the ordered created-path subset length;
- a meaningful prior plan requires a physically existing plan file;
- absent plan means `previous_bytes=0`;
- `append_applied = append_requested && prior_plan_available`;
- `plan_bytes <= max_write_bytes`;
- plan/event hashes are lowercase SHA-256 values;
- diff/prompt byte fields equal their UTF-8 values;
- diff truncation equals the fixed suffix state;
- unchanged diff means zero counts and the fixed no-change sentence;
- changed diff requires a non-zero addition/deletion total;
- both fixed logs are reported in canonical order.

## 7. Warning

There is one ordered warning:

```text
Append was requested but no meaningful prior plan existed; a new Codex plan was written.
```

It appears exactly when `append_requested=true` and `append_applied=false`. All other successes have no warning.

## 8. Stable failures

The tool has fifteen fixed, non-retryable failures:

| Code | Meaning | Details |
|---|---|---|
| `WORKSPACE_NOT_FOUND` | Requested/default workspace unavailable | safe workspace selector only |
| `REQUEST_INVALID` | `title`, `plan`, or `append` invalid | `{ source }` |
| `OUTPUT_PATH_BLOCKED` | Fixed bridge output blocked | `{ source: "context_dir" }` |
| `OUTPUT_PATH_OUTSIDE_WORKSPACE` | Fixed output escapes workspace | `{ source: "context_dir" }` |
| `OUTPUT_PATH_INVALID` | Existing output/ancestor has invalid shape | `{ source: "context_dir" }` |
| `EXISTING_PLAN_TOO_LARGE` | Existing plan exceeds `maxReadBytes` | `{}` |
| `EXISTING_PLAN_NOT_TEXT` | Existing plan is binary | `{}` |
| `EXISTING_PLAN_READ_FAILED` | Existing plan could not be read safely | `{}` |
| `PLAN_TOO_LARGE` | Generated final plan exceeds `maxWriteBytes` | `{}` |
| `PLAN_SECRET_BLOCKED` | Generated plan contains secret-looking content | `{}` |
| `SCAFFOLD_WRITE_FAILED` | Scaffold creation failed | `{}` |
| `PLAN_WRITE_FAILED` | Final plan write failed | `{}` |
| `LOG_WRITE_FAILED` | One or both log appends failed | `{}` |
| `HANDOFF_WRITE_FAILED` | Recognized provider operation failed | `{}` |
| `INTERNAL_ERROR` | Schema/provider/integrity invariant failed | `{}` |

Raw exceptions, stack traces, unsafe paths, plan content, secrets, and provider diagnostics never enter public failures.

## 9. Domain and provider boundary

Slice 24 reuses `prepareAgentHandoffRequest`, `preflightAgentHandoffOutput`, and `writePreparedAgentHandoff`. It removes the temporary flat `writeAgentHandoff` compatibility wrapper after no production consumer remains.

The server adds independent `handoffToCodexProvider` and `handoffToCodexNow` dependencies. The default provider is still the shared durable writer, but independent seams prove that each direct tool validates its own call and cannot accidentally route through the other public handler.

The handler validates provider identity, fixed paths, append facts, plan/diff/event/prompt bytes and hashes, exact created/logged ordering, and every prepared fact. Before success it rereads the complete final plan under `maxWriteBytes` and exactly one event-sized tail from both logs.

## 10. Human output and Tool Card

MCP text remains bounded and Codex-specific: plan path/hash, append outcome, status/diff/log paths, diff stats, and the Codex prompt. It does not duplicate the complete plan. Diff preview is separately bounded.

The handoff Tool Card becomes nested-first for both direct tools and removes the temporary flat Slice 23 fallback. It renders target, append outcome, hash/bytes, fixed paths, bounded prompt, and bounded diff. The direct result uses `codexpro/preserveStructuredContent:true`.

## 11. Compatibility and consumers

- Protected `scripts/smoke.mjs` remains unchanged; its Codex call consumes no result fields and therefore needs no new substitution.
- Protected `scripts/http-smoke.mjs` remains unchanged; it checks advertisement only.
- The Slice 23 focused compatibility test is migrated from proving a flat Codex result to proving the exact nested Slice 24 result.
- Native Stress adds a full-mode `codex_handoff` supertool assertion without exposing Codex handoff in minimal/standard modes.
- `codexpro` preserves the exact nested child envelope plus wrapper metadata.
- Existing CLI `execute-handoff`, `watch-handoff`, and `loop-handoff` remain compatible through the same plan path and SHA-256 content.

## 12. Non-goals

Not included:

- executing or resuming Codex;
- Codex App task attachment;
- model selection input;
- arbitrary output paths;
- transactions or rollback claims;
- process management, sandboxing, approval, Policy Kernel, or Phase 2 behavior;
- staging, commit, push, publication, deployment, or exact-head CI.

## 13. Verification and rollback

Required evidence:

- focused schema/domain/MCP/provider/Tool Card/supertool/compatibility tests;
- deliberate post-result review and RED for material findings;
- Slice 23 plus adjacent read/wait/export contracts and Build;
- complete regression, all Smoke commands, native-Windows Stress, package dry-run;
- protected-source, exact-scope, secret-pattern, whitespace, Markdown/reference, memory/archive, and Git-index checks;
- per-tool `neat-freak` reconciliation.

Rollback is file-local inside the unpublished shared batch: remove the Slice 24 schema/test/design/plan and revert only its handler, shared handoff-helper extraction, Tool Card, Stress, and live-memory records. Restore the temporary flat compatibility wrapper only if rolling back Slice 24 while retaining Slice 23. Do not reset Slices 17–23 or rewrite closed archive history.
