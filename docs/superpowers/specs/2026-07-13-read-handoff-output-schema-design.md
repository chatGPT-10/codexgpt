# Direct `read_handoff` Output Schema Design

> Date: 2026-07-13  
> Phase: 1, Slice 19  
> Status: locally implemented, hardened, and verified; unpublished  
> Publication: part of the unified Slice 17–28 end-of-goal batch

## 1. Decision summary

Migrate only direct `read_handoff` to the strict six-field Phase 1 envelope. Preserve its single optional `workspace_id` input, read-only behavior, fixed seven-file `.ai-bridge` allowlist, and `standard`/`full` visibility.

The slice will:

1. treat a missing handoff directory as an empty successful state;
2. represent each fixed artifact as either a complete readable artifact or a bounded safe unavailable record;
3. cap individual source files and the aggregate loaded source bytes;
4. expose post-redaction returned-byte accounting without returning raw diagnostics;
5. keep optional missing artifacts normal while warning about unreadable, limited, or redacted output;
6. add a strict provider seam, dedicated bounded Tool Card, nested consumer migration, and supertool preservation;
7. leave waiting, execution, handoff writes, Policy Kernel, trust, sandbox, and Phase 2 behavior untouched.

## 2. First-principles contract

The tool answers:

> Which approved handoff artifacts currently exist, which could be read safely within the configured bounds, and what exact redacted content can the caller review?

The protocol must distinguish:

- no handoff directory yet;
- an optional artifact that simply does not exist;
- a present artifact that policy or content checks reject;
- output omitted because of the file or aggregate byte bound;
- readable content changed by secret redaction;
- an unexpected provider or workspace failure.

Dynamic filesystem errors are not part of the public contract.

## 3. Current implementation evidence

Current direct behavior in `src/server.ts` and `src/workspaceOps.ts`:

- registers `read_handoff` in `standard` and `full`, not `minimal`;
- accepts only optional `workspace_id`;
- checks these seven fixed files in order:
  1. `current-plan.md`;
  2. `agent-status.md`;
  3. `implementation-diff.patch`;
  4. `codex-status.md`;
  5. `decisions.md`;
  6. `open-questions.md`;
  7. `execution-log.jsonl`;
- uses an 80,000-byte per-file request but has no aggregate handoff limit;
- concatenates dynamic `[unreadable: <raw error>]` sections;
- returns flat `workspace_id`, `root`, `files`, `file_count`, and `preview` with no advertised `outputSchema`;
- uses a generic Tool Card renderer and a flat protected main-Smoke consumer.

## 4. Scope

### 4.1 In scope

- `src/tools/schemas/readHandoff.ts`;
- a rich bounded `readHandoffContext` domain result shared through the existing `readAiBridgeContext` wrapper;
- exact stable direct handler stages and a test-only provider dependency;
- nested Tool Card and main-Smoke compatibility migration;
- exact supertool child-envelope preservation;
- focused, adjacent, complete, Build, Smoke, Stress, package, scope, secret, and per-tool `neat-freak` gates.

### 4.2 Out of scope

- `wait_for_handoff` behavior or schema;
- `codex_context`, `export_pro_context`, handoff write tools, or local executor behavior;
- new artifact paths, arbitrary path input, globbing, or directory traversal;
- partial byte slices of an individual artifact;
- content hashes, signatures, trust, permissions, Hooks, or Skills;
- Phase 2 identity/workspace lifecycle or later sandbox work;
- changes to protected `scripts/smoke.mjs` or `scripts/http-smoke.mjs`;
- staging, commit, push, or exact-head CI before Slice 28.

## 5. Exact success envelope

Top-level fields are exactly:

```text
codexpro_tool
codexpro_title
ok
data
error
meta
```

`codexpro_tool` is `read_handoff`; `codexpro_title` is `Read Handoff`.

## 6. Exact success data

`data` has exactly fifteen fields:

```ts
interface ReadHandoffData {
  workspace_id: string;
  root: string;
  context_dir: string;
  context_exists: boolean;
  max_file_bytes: number;
  max_total_bytes: number;
  artifacts: ReadHandoffArtifact[];
  files: string[];
  file_count: number;
  unavailable: ReadHandoffUnavailable[];
  unavailable_count: number;
  loaded_bytes: number;
  returned_bytes: number;
  output_limited: boolean;
  redacted: boolean;
}
```

There is no flat compatibility duplicate, aggregate `text`, or `preview` in structured output. The human MCP content is derived from the exact artifacts.

### 6.1 Effective bounds

```text
max_total_bytes = min(config.maxOutputBytes, 240000)
max_file_bytes  = min(config.maxReadBytes, 80000, max_total_bytes)
```

Both are echoed in `data`. Individual artifacts are full-or-unavailable; Slice 19 does not return partial file prefixes.

### 6.2 Artifact item

Each readable artifact has exactly:

```ts
interface ReadHandoffArtifact {
  path: string;
  kind:
    | "plan"
    | "agent_status"
    | "implementation_diff"
    | "codex_status"
    | "decisions"
    | "open_questions"
    | "execution_log";
  bytes: number;
  line_count: number;
  returned_bytes: number;
  redacted: boolean;
  text: string;
}
```

`bytes` is the complete raw file byte count. `returned_bytes` is exactly `Buffer.byteLength(text, "utf8")` after redaction. `line_count` describes the complete decoded source, with an empty file reporting zero.

### 6.3 Unavailable item

Each unavailable fixed artifact has exactly:

```ts
interface ReadHandoffUnavailable {
  path: string;
  kind: ReadHandoffArtifact["kind"];
  reason:
    | "missing"
    | "blocked"
    | "too_large"
    | "not_text"
    | "output_limit"
    | "read_failed";
  bytes: number | null;
}
```

No raw exception, operating-system message, private absolute path, or content excerpt is included.

### 6.4 Cross-field invariants

- Artifact/unavailable paths are exactly the seven approved paths beneath `context_dir`, with the fixed path-to-kind mapping.
- When `context_exists=false`, `artifacts`, `files`, and `unavailable` are empty; all counts/byte totals are zero and both flags are false.
- When `context_exists=true`, every approved path appears exactly once across `artifacts` and `unavailable`.
- Both arrays preserve approved path order.
- `files` exactly equals the artifact path sequence.
- `file_count === artifacts.length`; `unavailable_count === unavailable.length`.
- `loaded_bytes === sum(artifact.bytes)` and never exceeds `max_total_bytes`.
- `returned_bytes === sum(artifact.returned_bytes)`.
- Every artifact byte count is at most `max_file_bytes`.
- `redacted` is true iff at least one artifact is redacted.
- `output_limited` is true iff an unavailable reason is `too_large` or `output_limit`.
- `too_large` and `output_limit` require a numeric observed byte count; `missing` and `blocked` use `null`.

## 7. Warnings

Successful warnings are derived in this exact order:

1. `Some handoff artifacts could not be read safely.` iff any unavailable reason is `blocked`, `not_text`, or `read_failed`.
2. `Handoff output was limited by the configured byte bounds.` iff `output_limited` is true.
3. `Secret-looking content was redacted from returned handoff artifacts.` iff `redacted` is true.

Normal missing optional files and an absent handoff directory do not warn. Failures have no warnings.

## 8. Stable failures

All failures are non-retryable, use `ok:false`, `data:null`, `isError:true`, and fixed safe content.

### 8.1 `WORKSPACE_NOT_FOUND`

Message: `The requested workspace is not open.`

Details distinguish explicit `workspace_id` from the missing default workspace without exposing a root.

### 8.2 `HANDOFF_READ_FAILED`

Message: `The handoff context could not be read safely.`

Details are exactly `{ context_dir }`, using the already validated relative hidden directory.

### 8.3 `INTERNAL_ERROR`

Message: `The handoff reader failed because of an internal error.` Details are exactly `{}`.

Provider execution exceptions map to `HANDOFF_READ_FAILED`; malformed or inconsistent provider output maps to `INTERNAL_ERROR`.

## 9. Domain behavior

Add a fixed artifact-definition table and `readHandoffContext` in `src/workspaceOps.ts`.

The reader:

1. resolves and verifies the configured context directory without creating it;
2. returns `contextExists:false` when it is absent;
3. stats each approved artifact before reading;
4. classifies missing, policy-blocked, oversized, non-text, aggregate-limit, and other read failures into fixed reasons;
5. reads only complete files that fit both bounds;
6. rechecks actual buffer size against both bounds after the read;
7. returns raw decoded artifact bodies only to the server boundary;
8. never includes a raw caught error in its derived legacy context text.

The existing `readAiBridgeContext` becomes a compatibility wrapper over this result for later `codex_context` and Pro-context migration; this slice does not change those public schemas.

## 10. Provider boundary and handler stages

Add:

```ts
interface ReadHandoffProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  limits: { maxFileBytes: number; maxTotalBytes: number };
}
```

and an optional test-only `readHandoffProvider` dependency.

Handler stages:

1. resolve workspace or return exact `WORKSPACE_NOT_FOUND`;
2. compute effective limits and call the provider;
3. map provider throws to fixed `HANDOFF_READ_FAILED`;
4. strictly validate provider shape, fixed path coverage/order, bounds, and counts;
5. redact each readable body, calculate returned bytes and flags, and construct the exact success;
6. map any malformed provider/construction result to fixed `INTERNAL_ERROR`.

## 11. Human content and Tool Card

Human success content includes:

- safe workspace/context identity;
- context-present/absent state;
- loaded/unavailable counts and byte bounds;
- one safe section per readable artifact;
- safe reason-only rows for unavailable artifacts.

The direct descriptor uses the existing internal structured-preservation flag so Tool Card post-processing cannot mutate validated long artifact bodies.

The dedicated Tool Card:

- reads nested `data` first and retains historical flat fallback only inside the renderer;
- renders fixed failure code/message only;
- lists unavailable reason rows;
- previews at most 20 lines per readable artifact;
- never routes the exact result through the generic JSON renderer.

## 12. Consumers and compatibility

- Protected main Smoke has exactly one flat `handoffContext.structuredContent.files` read. Its compatibility loader performs one exact fail-closed replacement to nested `data?.files`.
- Protected HTTP Smoke does not consume direct `read_handoff` structured fields and needs no substitution.
- Current Stress has no direct `read_handoff` structured consumer.
- `codexpro` action `read_handoff` preserves the complete child envelope and adds only existing wrapper tags.

## 13. Focused tests

The focused suite covers:

1. exact populated and absent success constructors;
2. exact warnings and all three failures;
3. strict rejection of flat, additional, unsafe, duplicate, misordered, uncovered, count/byte/flag/warning-drift data;
4. standard/full visibility, minimal absence, read-only annotations, and exact advertised schema;
5. real absent context success;
6. real readable artifacts, normal missing files, secret redaction, and empty files;
7. file and aggregate limit classification;
8. blocked/non-text/read-failed safe outcomes where practical;
9. explicit/default workspace failure, provider throw, and malformed provider output without leaks;
10. dedicated bounded Tool Card and long structured-content preservation;
11. supertool preservation;
12. exact main-Smoke compatibility migration and protected-source immutability.

## 14. Verification matrix

```text
node --test test/read-handoff-contract.test.mjs
node --test test/workspace-snapshot-contract.test.mjs test/load-skill-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs
npm run build
node --test test/*.test.mjs
npm run smoke
npm run stress
npm pack --dry-run
git diff --check
protected-source diff check
intended unified-batch scope check
secret-looking-content scan
neat-freak project reconciliation
```

## 15. Expected files

Production/test:

- `src/tools/schemas/readHandoff.ts`
- `src/workspaceOps.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/smoke-platform-compat.mjs`
- `test/read-handoff-contract.test.mjs`

Durable records:

- this design and matching plan;
- `AGENTS.md`;
- `Memory.md`;
- master plan and historical roadmap status;
- active Phase 1 archive volume.

Protected sources remain unchanged: `scripts/smoke.mjs` and `scripts/http-smoke.mjs`.

## 16. Acceptance criteria

- every real success and expected failure parses the exact schema;
- absence and optional missing artifacts remain successful and non-warning;
- no arbitrary path can be requested or returned;
- no raw exception, secret, absolute private path, or unsafe diagnostic is public;
- per-file and aggregate bounds are explicit and truthful;
- structured byte/redaction flags describe the returned text exactly;
- Tool Card, compatibility loader, and supertool preserve nested output;
- all local gates and per-tool `neat-freak` pass;
- no staging, publication, Phase 2, waiting, execution, or write behavior is added.

## 17. Risks and rollback

Large artifacts that previously became dynamic unreadable text now receive a stable `too_large` or `output_limit` record. The aggregate bound can omit later artifacts in fixed priority order. This is intentional bounded behavior, not data loss on disk.

Before unified publication, rollback uses a reviewed normal reverse patch limited to Slice 19 files plus an append-only correction. Do not reset the shared Slice 17–18 working tree, delete `.ai-bridge` data, or weaken path/secret protections.
