# Direct `codex_context` Output Schema Design

> Date: 2026-07-13  
> Phase: 1, Slice 21  
> Status: locally complete, post-result reviewed, and unpublished  
> Publication: part of the unified Slice 17–28 end-of-goal batch

## 1. Decision summary

Migrate only direct `codex_context` to the strict six-field Phase 1 envelope. Preserve its six inputs, full-mode-only visibility, read-only behavior, one-call context purpose, and direct supertool action. Do not add arbitrary file selection, write behavior, hidden Codex memory, Policy Kernel behavior, or a new public size input.

The exact contract will:

1. normalize the target to one safe workspace-relative path;
2. distinguish an existing file, existing directory, and missing future target without using filename-dot heuristics;
3. load the root-to-target AGENTS chain without exposing raw read errors;
4. reuse the fixed `.ai-bridge` artifact allowlist and safe unavailable reasons;
5. echo effective include switches and byte bounds;
6. return the complete safe context in structured data as well as MCP text content;
7. cap returned context with the existing configured output limit using UTF-8 byte accounting;
8. preserve a bounded derived preview for Tool Card compatibility;
9. add a strict provider seam, stable failures, protected-Smoke compatibility, and supertool preservation;
10. leave `export_pro_context`, handoff writers, sessions, Phase 2, and public release work untouched.

## 2. First-principles contract

The tool answers:

> For this authorized workspace target, what explicit instruction chain, fixed handoff context, and requested Git state can be returned safely in one bounded result?

The answer must make these facts machine-verifiable:

- which workspace and canonical target were used;
- whether the target is a file, directory, or missing future target;
- which inclusion switches and effective limits applied;
- which AGENTS and fixed handoff files were loaded;
- which discovered sources were unavailable and why;
- whether Git status and diff were included;
- the exact returned context, byte count, preview, truncation, limitation, and redaction state.

The result must never depend on hidden Codex runtime memory or state outside the explicitly opened workspace and fixed handoff directory.

## 3. Current behavior preserved

Current inputs remain unchanged:

```text
workspace_id?
target_path?
include_ai_bridge?
include_git?
include_diff?
max_agent_bytes?
```

Effective defaults remain:

```text
target_path = "."
include_ai_bridge = true
include_git = true
include_diff = false
max_agent_bytes = min(60000, config.maxReadBytes)
```

`include_diff=true` remains independent of `include_git`; callers may request a diff without status. The direct tool remains full-mode-only, read-only, non-destructive, time-varying, and Tool-Card-enabled. Minimal and standard modes do not advertise it.

## 4. Exact envelope

Every success and failure has exactly:

```ts
interface CodexContextOutput {
  codexgpt_tool: "codex_context";
  codexgpt_title: "Codex Context";
  ok: boolean;
  data: CodexContextData | null;
  error: CodexContextError | null;
  meta: {
    schemaVersion: 1;
    durationMs: number;
    warnings: string[];
  };
}
```

Success requires `ok:true`, non-null `data`, and `error:null`. Failure requires `ok:false`, `data:null`, non-null `error`, `isError:true`, and no warnings. Flat legacy fields are rejected.

## 5. Exact success data

```ts
interface CodexContextData {
  workspace_id: string;
  root: string;
  target_path: string;
  target_kind: "file" | "directory" | "missing";
  tool_mode: "full";
  write_mode: "off" | "handoff" | "workspace";
  bash_mode: "off" | "safe" | "full";
  include_ai_bridge: boolean;
  include_git_status: boolean;
  include_git_diff: boolean;
  max_agent_bytes: number;
  max_total_bytes: number;
  agents_files: string[];
  agents_count: number;
  ai_context_exists: boolean | null;
  ai_context_files: string[];
  ai_context_count: number;
  unavailable_sources: Array<{
    source: "agents" | "ai_bridge";
    path: string;
    reason: "missing" | "blocked" | "too_large" | "not_text" | "output_limit" | "read_failed";
    bytes: number | null;
  }>;
  unavailable_count: number;
  included_git_status: boolean;
  included_git_diff: boolean;
  context: string;
  context_source_bytes: number;
  context_bytes: number;
  preview: string;
  truncated: boolean;
  output_limited: boolean;
  redacted: boolean;
}
```

The data object has exactly twenty-eight fields.

## 6. Target resolution

The target input is trimmed; blank becomes `.`. Absolute inputs already accepted by `PathGuard` remain compatible only when they resolve inside the workspace, but the public value is always canonical workspace-relative POSIX syntax.

Resolution returns one kind:

- `file`: existing regular file; load instruction directories from root through its parent;
- `directory`: existing directory; load from root through that directory;
- `missing`: no current target; require the closest existing parent to be a directory, validate it with write-strength parent containment, canonicalize safe internal symlink/junction parents to their real workspace path, and load through the immediate parent as the future-file instruction chain.

Other filesystem object types are invalid. Symlink/junction, Windows special-path, blocked-path, and workspace-escape rules remain enforced by `PathGuard`. A missing path under an escaping parent must fail rather than inherit instructions from outside the workspace.

## 7. AGENTS chain

Candidate filenames remain, in this order within each directory:

```text
AGENTS.override.md
AGENTS.md
agents.md
.agents.md
```

Directories are considered from workspace root toward the target. Native real paths are de-duplicated case-insensitively on Windows and exactly on other platforms. `agents_files` contains only successfully loaded files, in context order.

A matched file that cannot be safely loaded becomes one `unavailable_sources` entry with `source:"agents"` and a fixed reason. Its raw exception, absolute diagnostic path, or contents never enter the context. The human section uses only `[unavailable: <reason>]`.

No matching AGENTS file is a valid empty chain, not a failure or warning.

## 8. Fixed AI bridge context

When `include_ai_bridge=false`:

```text
ai_context_exists = null
ai_context_files = []
no ai_bridge unavailable entries
```

When included, only the seven existing `READ_HANDOFF_ARTIFACT_DEFINITIONS` paths are considered in fixed order under the configured `contextDir` (default `.ai-bridge`):

```text
current-plan.md
agent-status.md
implementation-diff.patch
codex-status.md
decisions.md
open-questions.md
execution-log.jsonl
```

If the context directory is absent, `ai_context_exists=false` with no files or unavailable entries. If it exists, every fixed path appears exactly once across loaded `ai_context_files` and `source:"ai_bridge"` unavailable entries. Missing optional artifacts are normal data and do not create a warning.

No source-provided path is trusted, and the read remains non-creating.

The provider boundary validates the configured directory prefix as well as the seven filenames. A safe custom `contextDir` therefore remains compatible without weakening the allowlist.

## 9. Git inclusion

`included_git_status` must equal `include_git_status`. `included_git_diff` must equal `include_git_diff`. Git output remains part of the combined context rather than being duplicated as additional large structured fields.

The provider must return status iff requested and diff iff requested. Provider identity or presence drift maps to `INTERNAL_ERROR`. Existing Git helpers retain their current bounded/redacted behavior; this slice does not refactor their public failure strings.

## 10. Output bounds and redaction

The complete provider text is redacted before output truncation. Define:

```text
max_total_bytes = config.maxOutputBytes
context_source_bytes = UTF-8 bytes after redaction and before output truncation
context_bytes = exact UTF-8 bytes in returned context
truncated = context_source_bytes > context_bytes
```

The returned context never exceeds `max_total_bytes`. Truncation uses a fixed marker and never splits a UTF-8 sequence. `preview` is the exact existing 40-line / 12,000-character preview function applied to the returned context.

`output_limited` is true iff context is truncated or an unavailable source reason is `too_large`/`output_limit`. `redacted` is true iff redaction changed provider text. Counts equal array lengths, loaded path arrays are unique and ordered, and returned paths are safe canonical relative paths.

The handler sets `codexgpt/preserveStructuredContent` so Tool Card tagging cannot silently truncate `data.context` and invalidate byte invariants.

## 11. Warnings

Success warnings are derived in this exact order:

1. `Some Codex context sources could not be read safely.` iff an unavailable reason is `blocked`, `not_text`, or `read_failed`.
2. `Codex context output was limited by the configured byte bounds.` iff `output_limited` is true.
3. `Secret-looking content was redacted from the returned Codex context.` iff `redacted` is true.

Normal missing optional handoff files add no warning. Failures have no warnings.

## 12. Stable failures

All failures use fixed safe text and never include raw exception messages, stack traces, absolute target inputs, allowed-root lists, or file contents.

- `WORKSPACE_NOT_FOUND`: requested/default workspace is not open; non-retryable; safe existing workspace detail conventions.
- `TARGET_PATH_BLOCKED`: target is denied by path policy; non-retryable; details contain only a bounded safe source marker.
- `TARGET_PATH_OUTSIDE_WORKSPACE`: target violates workspace/Windows containment rules; non-retryable; details contain only a bounded safe source marker.
- `TARGET_PATH_INVALID`: target exists but is not a regular file/directory, or cannot form a valid canonical target; non-retryable; details contain only a bounded safe source marker.
- `CONTEXT_READ_FAILED`: the bounded context provider failed after target validation; non-retryable; details contain only canonical `target_path`.
- `INTERNAL_ERROR`: malformed provider output or constructed data violated the exact contract; non-retryable; details are `{}`.

## 13. Domain and provider boundary

`src/workspaceOps.ts` will:

- expose a safe target resolver returning canonical path and kind;
- derive instruction directories from target kind rather than a filename-dot heuristic;
- guard directories and candidate files before realpath/read;
- return loaded AGENTS paths plus safe unavailable classifications;
- reuse `readHandoffContext` for fixed AI context coverage;
- construct combined text without raw read errors.

Add one test-only dependency:

```ts
codexContextProvider(context)
```

The provider context contains config, guard, workspace, canonical target, target kind, inclusion switches, and effective agent bound. The server strictly validates provider identity, target, ordered safe paths, fixed AI coverage, unavailability, requested Git presence, and text framing before constructing public data.

Provider throws map to `CONTEXT_READ_FAILED`. Malformed provider output maps to `INTERNAL_ERROR`.

## 14. Tool Card and consumers

The Tool Card becomes nested-first and renders only bounded metadata, loaded paths, unavailable reasons, and `preview`; it never renders the full context field. Historical flat data remains a renderer fallback.

Protected main and HTTP Smoke sources remain byte-for-byte unchanged. Exact-count in-memory compatibility substitutions migrate their flat `workspace_id` and `agents_files` reads. The `codexgpt` action `codex_context` preserves the complete six-field child envelope plus wrapper tags.

No Stress consumer currently reads direct `codex_context` fields.

## 15. Focused tests

The focused suite covers:

- exact constructors, warnings, failures, and strict cross-field drift;
- full-only mode, read-only annotations, descriptor, and exact output schema;
- canonical blank/root/file/directory/missing target behavior;
- nested AGENTS order, lowercase compatibility, realpath de-duplication, and dotted directories;
- missing AI context non-creation and fixed included/excluded coverage;
- independent Git status/diff switches;
- target blocked/outside/invalid failures;
- provider throw, identity/order/coverage/presence drift, and diagnostic non-leakage;
- UTF-8 byte truncation after redaction and exact preview preservation;
- nested-first bounded Tool Card and long structured preservation;
- direct supertool preservation;
- exact protected compatibility substitutions and protected-source immutability.

## 16. Verification and acceptance

Run focused and adjacent workspace/handoff contracts, Build, complete Node regression, all eight Smoke sections, native-Windows Stress, package dry-run, whitespace/protected-source/exact-scope/secret/Markdown/archive checks, then the required `neat-freak`.

Acceptance requires every result to parse the exact schema; the target chain must remain inside the workspace; no arbitrary source path, raw exception, private diagnostic, secret-looking value, unbounded context, or Tool Card full-body rendering may escape; absent AI context must not be created; protected Smoke sources and Git index remain unchanged.

## 17. Risks and rollback

The context body is duplicated between MCP text content and structured data so direct and supertool consumers receive the same semantics; the configured output limit bounds that cost. Git helper failure text remains legacy content inside the redacted bounded context. Filesystem reads remain snapshots, not atomic transactions or OS sandbox guarantees.

Rollback removes only the Slice 21 schema/test/domain/handler/consumer changes and restores flat direct output, leaving Slices 17–20 untouched. The unified batch has no intermediate commit to rewrite.
