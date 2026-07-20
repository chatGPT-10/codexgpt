# Direct `export_pro_context` Output Schema Design

> Date: 2026-07-13  
> Phase: 1, Slice 22  
> Status: approved for uninterrupted TDD implementation  
> Publication: part of the unified Slice 17–28 end-of-goal batch

## 1. Decision summary

Migrate only direct `export_pro_context` to the strict six-field Phase 1 envelope. Preserve its twelve inputs, standard/full visibility, write annotation, fixed context-bundle purpose, configured context directory, overwrite behavior, CLI consumer, self-test builder, Tool Card, and direct supertool action.

The exact contract will:

1. validate and canonicalize every explicit selected path and glob before any context scaffolding is created;
2. retain selected-first and important-file-second candidate ordering while exposing candidate, omitted, included, and skipped counts;
3. replace raw skipped-file exception strings with fixed safe reason records;
4. expose the effective selection switches and byte limits actually applied;
5. expose fixed AI-context coverage and newly created scaffold paths separately;
6. redact the complete bundle before applying UTF-8 byte limits;
7. report exact final bytes, SHA-256, prior existence, and independent diff/bundle truncation facts;
8. add a strict prepared-request/provider seam, stable failures, protected-Smoke compatibility, and direct-supertool preservation;
9. render bounded nested metadata in the Tool Card without returning or rendering the complete artifact body in structured data;
10. leave handoff writers, session tools, Policy Kernel behavior, atomic multi-file transactions, and publication untouched.

## 2. First-principles contract

The tool answers:

> For this authorized workspace and explicit selection policy, what bounded, redacted context artifact was written, what source material contributed to it, and what could not be included?

The answer must make these facts machine-verifiable:

- workspace and exact configured output path;
- effective title, switches, canonical selections, globs, and limits;
- bounded discovered candidates, known max-file omissions, successful source reads, and safe skip reasons;
- fixed AI-context files loaded or unavailable and scaffold files created;
- whether the artifact replaced an existing file;
- exact source/final byte counts, SHA-256, truncation, limitation, and redaction state.

The structured result intentionally does not duplicate the generated Markdown. The artifact is the durable output; returning the complete body again would double a potentially multi-megabyte write result and create a second disclosure surface. MCP text and the Tool Card contain bounded metadata and the saved path only.

## 3. Current behavior preserved and bounded

The public inputs remain:

```text
workspace_id?
title?
selected_paths?
extra_globs?
include_important_files?
include_changed_files?
include_diff?
include_ai_bridge?
max_depth?
max_files?
max_file_bytes?
max_total_bytes?
```

Effective defaults remain:

```text
title = "CodexGPT Context Bundle"
include_important_files = true
include_changed_files = true
include_diff = true
include_ai_bridge = true
max_depth = 3
max_files = 24
max_file_bytes = min(config.maxReadBytes, 60000)
max_diff_bytes = min(config.maxOutputBytes, 80000)
max_total_bytes = min(config.maxWriteBytes, 700000)
```

`max_total_bytes` may be below 20,000 only when the configured `maxWriteBytes` ceiling is lower; an input value still uses the existing 20,000 minimum. The effective value can never exceed `config.maxWriteBytes`.

The direct tool remains available in standard and full modes, hidden in minimal and connection-test modes, write-capable, non-destructive, non-idempotent because the generated timestamp changes, and Tool-Card-enabled. It continues to overwrite only the fixed `${contextDir}/pro-context.md` output.

Direct input bounds become explicit: title at most 200 characters, at most 80 selected paths, at most 32 extra globs, and at most 240 characters per path or glob. The CLI path applies the same domain validation even though it bypasses the MCP input schema.

## 4. Exact envelope

Every handler success and classified failure has exactly:

```ts
interface ExportProContextOutput {
  codexgpt_tool: "export_pro_context";
  codexgpt_title: "Export Pro Context";
  ok: boolean;
  data: ExportProContextData | null;
  error: ExportProContextError | null;
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
interface ExportProContextData {
  workspace_id: string;
  root: string;
  path: string;
  tool_mode: "standard" | "full";
  write_mode: "off" | "handoff" | "workspace";
  bash_mode: "off" | "safe" | "full";
  title: string;
  include_important_files: boolean;
  include_changed_files: boolean;
  include_diff: boolean;
  include_ai_bridge: boolean;
  max_depth: number;
  max_files: number;
  max_file_bytes: number;
  max_diff_bytes: number;
  max_total_bytes: number;
  selected_paths: string[];
  selected_count: number;
  extra_globs: string[];
  extra_glob_count: number;
  changed_file_count: number;
  candidate_count: number;
  omitted_count: number;
  files_included: string[];
  file_count: number;
  files_skipped: Array<{
    path: string | null;
    reason: "missing" | "blocked" | "not_file" | "too_large" | "not_text" | "read_failed";
    bytes: number | null;
  }>;
  skipped_count: number;
  ai_context_files: string[];
  ai_context_file_count: number;
  ai_context_unavailable: Array<{
    path: string;
    reason: "missing" | "blocked" | "too_large" | "not_text" | "output_limit" | "read_failed";
    bytes: number | null;
  }>;
  ai_context_unavailable_count: number;
  created_context_files: string[];
  created_context_file_count: number;
  existed: boolean;
  source_bytes: number;
  bytes: number;
  sha256: string;
  diff_truncated: boolean;
  bundle_truncated: boolean;
  truncated: boolean;
  output_limited: boolean;
  redacted: boolean;
}
```

The data object has exactly forty-two fields.

## 6. Prepared request and explicit selection

Before any write, the domain prepares one immutable effective request:

- trim the title, collapse line breaks to spaces, use the default when blank, and enforce the title bound;
- trim, canonicalize, and de-duplicate selected paths with native Windows case behavior;
- allow absolute selected paths only when `PathGuard` canonicalizes them inside the opened workspace;
- validate missing selected paths with write-strength closest-parent containment so a junction or symlink cannot hide an escape;
- normalize glob separators to `/`, reject blank/absolute/home/drive-relative/control-character/traversal patterns, and de-duplicate them;
- calculate every effective switch and limit once.

An explicit blocked/outside/invalid selection fails before `ensureAiBridge`. A safe missing path remains a candidate and later produces a `missing` skip record. Auto-discovered Git/important/glob candidates do not gain authority: blocked or malformed auto candidates become safe skip records and never expose their raw input or exception.

## 7. Candidate accounting

Candidate priority remains:

1. explicit selected paths;
2. important root configuration files;
3. remaining changed and glob-matched files in deterministic lexical order.

The fixed output path is excluded. Candidate identity is de-duplicated case-insensitively on Windows and exactly elsewhere.

Define:

```text
candidate_count = unique candidates in the bounded discovery set before max_files
attempted_count = min(candidate_count, max_files)
omitted_count = candidate_count - attempted_count
file_count + skipped_count = attempted_count
```

Explicit selections, changed files, and the fixed important-file list are fully enumerated. Each user glob is deliberately probed for at most `max_files + 1` matches so a broad pattern cannot turn this write tool into an unbounded workspace crawl. Therefore `candidate_count` and `omitted_count` are exact for the bounded discovery set; when a glob has still more matches, `omitted_count` is a conservative lower bound and `output_limited` remains true. A future contract may add an explicit glob-discovery truncation field; Phase 1 does not claim a full-workspace glob total.

`files_included` lists files successfully read into the unbounded source bundle, in bundle order. `files_skipped` has one record for every attempted candidate that was not read. A path is `null` only when exposing the auto-discovered raw identity would itself be unsafe. Raw exception messages, absolute diagnostics, and content never enter a skip record.

`too_large` requires observed bytes. `not_text` may carry observed bytes. `missing`, `blocked`, `not_file`, and `read_failed` use `bytes:null`.

Whole-bundle truncation can remove a tail of the source bundle; therefore `bundle_truncated:true` explicitly means the final artifact may not contain every byte represented by the pre-cap `files_included` set. This preserves the existing artifact order while making the limitation visible rather than silently claiming a complete bundle.

## 8. AI context and scaffold effects

When `include_ai_bridge=false`:

```text
ai_context_files = []
ai_context_unavailable = []
created_context_files = []
```

When true, the existing scaffold behavior remains: `ensureAiBridge` creates missing files from its fixed nine-file definition in fixed order before the AI-context section is read. `created_context_files` contains only files created by this call.

The AI-context section reuses the seven fixed `READ_HANDOFF_ARTIFACT_DEFINITIONS` paths under the configured safe `contextDir`. Every fixed path appears exactly once across `ai_context_files` and `ai_context_unavailable`, in allowlist order. Unavailability uses the existing fixed safe reasons; raw read errors remain private.

Output and scaffold paths are preflighted before the first write. An operating-system failure can still leave a partially created scaffold because Phase 1 does not introduce the Phase 3 transaction engine. The result never claims success unless the final context artifact was written and verified by returned bytes/hash.

## 9. UTF-8 limits, redaction, and integrity

Diff truncation and whole-bundle truncation use fixed markers and UTF-8 byte accounting; neither may split a UTF-8 sequence.

Order of operations:

```text
assemble complete source Markdown
  -> redact secret-looking content
  -> measure source_bytes
  -> UTF-8 cap to max_total_bytes
  -> write fixed output path
  -> report exact write bytes and SHA-256
```

Define:

```text
bundle_truncated = source_bytes > bytes
truncated = diff_truncated || bundle_truncated
output_limited =
  truncated
  || omitted_count > 0
  || any file skip is too_large
  || any AI-context unavailable reason is too_large or output_limit
```

`bytes` is the exact UTF-8 byte length of the final Markdown and never exceeds `max_total_bytes` or `config.maxWriteBytes`. `sha256` must match the final Markdown returned by the internal provider. Before reporting success, the handler reopens the fixed artifact through `PathGuard` and verifies its bytes, SHA-256, and decoded content against the validated provider result. `existed` reports whether the fixed output file was replaced. `redacted` is true iff redaction changed the complete pre-cap source Markdown. The public title is the redacted effective title.

## 10. Warnings

Success warnings are derived in this exact order:

1. `Some context sources could not be included safely.` iff `files_skipped` or `ai_context_unavailable` is non-empty.
2. `The exported context was limited by configured bounds.` iff `output_limited` is true.
3. `Secret-looking content was redacted from the exported context.` iff `redacted` is true.

Creating scaffold files or replacing an existing context artifact is expected write behavior, not a warning. Failures have no warnings.

## 11. Stable failures

All failures use fixed safe text and never include raw exception messages, stack traces, absolute request paths, allowed-root lists, file contents, or secret-looking values.

- `WORKSPACE_NOT_FOUND`: requested/default workspace is unavailable; non-retryable; existing safe workspace-detail convention.
- `REQUEST_INVALID`: title, selected-path list, or glob list cannot form a bounded request; non-retryable; details contain only `source`.
- `SELECTION_PATH_BLOCKED`: an explicit selected path is denied by path policy; non-retryable; details are `{source:"selected_paths"}`.
- `SELECTION_PATH_OUTSIDE_WORKSPACE`: an explicit selected path violates containment; non-retryable; same safe details.
- `OUTPUT_PATH_BLOCKED`: configured context/output paths are denied by path policy; non-retryable; details are `{source:"context_dir"}`.
- `OUTPUT_PATH_OUTSIDE_WORKSPACE`: configured context/output paths violate workspace containment; non-retryable; same safe details.
- `CONTEXT_BUILD_FAILED`: bounded source collection or bundle assembly failed after request validation; non-retryable; details are `{}`.
- `CONTEXT_WRITE_FAILED`: scaffold or final artifact write failed; non-retryable; details are `{}`.
- `CONTEXT_EXPORT_FAILED`: an injected or otherwise unclassified provider operation failed; non-retryable; details are `{}`.
- `INTERNAL_ERROR`: provider output or constructed data violated the exact contract; non-retryable; details are `{}`.

## 12. Domain and provider boundary

`src/proContext.ts` will expose:

```ts
prepareProContextRequest(config, guard, workspace, options)
buildPreparedProContext(config, guard, workspace, request)
exportPreparedProContext(config, guard, workspace, request)
```

The existing `buildProContext` and `exportProContext` remain compatibility wrappers for the self-test and `scripts/pro-bundle.mjs`.

Add one test-only server dependency:

```ts
exportProContextProvider(context)
```

Its context includes config, guard, workspace, and the already prepared immutable request. The server strictly validates workspace identity, effective options, configured output identity, candidate/count equations, safe ordered paths, fixed AI coverage, fixed scaffold subset/order, Markdown byte/hash/truncation/redaction facts, result framing, and the actual on-disk artifact before creating public data.

Typed domain failures retain their safe category. An untyped provider throw maps to `CONTEXT_EXPORT_FAILED`; a parsed but inconsistent provider result maps to `INTERNAL_ERROR`.

## 13. Tool Card and consumers

The Tool Card becomes nested-first. It renders the saved path, byte/hash summary, source counts, created files, safe unavailable reasons, and limit/redaction pills. It never reads or renders internal Markdown. Historical flat results remain a renderer fallback.

Protected main and HTTP Smoke sources remain byte-for-byte unchanged. Exact-count in-memory compatibility substitutions migrate their flat `path` and `files_included` reads. Native Stress migrates directly. The `codexgpt` action `pro_export` preserves the complete six-field child envelope plus wrapper tags.

`scripts/pro-bundle.mjs` continues to receive internal Markdown for optional clipboard copying and uses the expanded result fields without changing its public command-line interface. `codexgpt_self_test` continues to use the build-only compatibility wrapper and selected-only invariant.

## 14. Focused tests

The focused suite covers:

- exact constructors, forty-two data fields, warning order, failures, and strict cross-field drift;
- standard/full visibility, minimal/connection hiding, write annotations, descriptor, and exact output schema;
- defaults, configured ceilings below public minima, normalized title, canonical selected paths, safe missing paths, and glob validation;
- selected priority, Windows case de-duplication, candidate/omitted/attempted equations, fixed output exclusion, and safe skip classifications;
- fixed AI coverage, custom context directory, created-file subset/order, and include-off non-creation;
- preflight-before-write for blocked/outside/invalid selections and output paths;
- Unicode diff and final byte limits after redaction, exact SHA-256/bytes/existence, and independent truncation flags;
- quoted Unicode Git rename destinations, provider throw, absent/mismatched provider artifacts, and identity/options/count/path/coverage/hash/framing drift without diagnostic leakage;
- nested-first bounded Tool Card, direct supertool preservation, CLI/self-test compatibility, protected substitutions, and protected-source immutability.

## 15. Verification and acceptance

Run focused and adjacent handoff/write/context contracts, Build, complete Node regression, all eight Smoke sections, native-Windows Stress, package dry-run, whitespace/protected-source/exact-scope/secret/Markdown/archive checks, then the required `neat-freak`.

Acceptance requires every successful handler result to parse the exact schema; no write may precede request/output preflight; no selected or output path may escape the workspace; no raw diagnostic, unsafe identity, secret-looking value, character-count truncation, unreported candidate omission, unbounded artifact copy, or Tool Card full-body rendering may escape. Protected Smoke sources and the Git index must remain unchanged.

## 16. Risks and rollback

The export remains a bounded snapshot of filesystem and Git state, not an atomic read transaction or OS sandbox. `ensureAiBridge` plus final export remains a multi-file write sequence that can be partially applied on an operating-system failure; Phase 3 owns transaction/rollback behavior. Path checks and the final artifact reread reduce but cannot eliminate operating-system time-of-check/time-of-use races without an OS sandbox or transaction engine. Glob counts describe bounded discovery rather than a full-workspace total. Git helper failure text remains legacy content inside the redacted bounded artifact. The generated timestamp keeps repeated exports non-idempotent.

Rollback removes only the Slice 22 schema/test/domain/handler/consumer changes and restores the flat direct output, leaving Slices 17–21 untouched. The unified batch has no intermediate commit to rewrite.
