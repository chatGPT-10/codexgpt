# Direct `wait_for_handoff` Output Schema Design

> Date: 2026-07-13  
> Phase: 1, Slice 20  
> Status: locally implemented, post-result hardened, fully verified, and unpublished  
> Publication: part of the unified Slice 17–28 end-of-goal batch

## 1. Decision summary

Migrate only direct `wait_for_handoff` to the strict six-field Phase 1 envelope. Preserve its current inputs, read-only long-poll behavior, `standard`/`full` visibility, bounded 1–60 second wait, and supertool alias `handoff_poll`.

The exact contract will:

1. separate the observed executor run from the outcome of this particular wait request;
2. distinguish a missing state file from an invalid or unreadable one;
3. accept only the version-1 lifecycle states written by the local executor;
4. ignore state-file-supplied artifact paths and read only four fixed allowlisted paths;
5. return bounded, redacted, byte-accounted excerpts only after a matching terminal run;
6. retain the existing compatibility meanings of `state`, `awaited_terminal`, `awaited_completed`, and `succeeded` inside nested `data`;
7. add strict provider seams, a dedicated bounded Tool Card, protected-Smoke compatibility substitutions, and supertool preservation;
8. leave executor startup, handoff writes, Codex context/export, process management, Policy Kernel, and Phase 2 untouched.

## 2. First-principles contract

The tool answers:

> Before the requested deadline, did this workspace expose a valid terminal handoff run matching the optional plan hash and iteration boundary, and if so what bounded review artifacts are safe to return?

The public protocol must not collapse these distinct states:

- no run-state file exists yet;
- a valid run is still running;
- a terminal run exists but belongs to a different plan;
- a terminal run exists but is not newer than `since_iteration`;
- a matching run completed, failed, or timed out;
- the state file exists but is malformed;
- the state file or a requested artifact cannot be read safely;
- a readable artifact was excerpted or redacted.

Raw JSON fields, arbitrary artifact paths, caught exception text, and operating-system diagnostics are not public API.

## 3. Current implementation evidence

The current handler in `src/server.ts`:

- reads `${contextDir}/handoff-run-state.json` with the general read bound;
- catches missing, malformed, blocked, oversized, binary, and other failures into the same `undefined` value;
- accepts any object and forwards selected values without a strict lifecycle schema;
- treats `completed`, `failed`, and `timed_out` as terminal;
- waits with a deadline-aware final sleep;
- coerces terminal hash/iteration mismatches to public `state: "running"`;
- trusts any normalized state-supplied artifact path below `contextDir`, not a fixed filename allowlist;
- returns optional flat fields and excerpts with character rather than UTF-8 byte accounting;
- does not advertise an `outputSchema` and uses the generic Tool Card.

The lifecycle writer in `scripts/codexpro.mjs` emits version 1 with `running`, `completed`, `failed`, or `timed_out`, plus iteration, plan hash, timestamps, executor identity, terminal result fields, and fixed artifact paths.

## 4. Exact envelope

Top-level fields are exactly:

```text
codexpro_tool
codexpro_title
ok
data
error
meta
```

`codexpro_tool` is `wait_for_handoff`; `codexpro_title` is `Wait For Handoff`.

## 5. Exact success data

`data` has exactly thirty fields:

```ts
interface WaitForHandoffData {
  workspace_id: string;
  root: string;
  context_dir: string;
  state_file: string;
  artifact_paths: {
    status: string;
    diff: string;
    log: string;
    tests: string;
  };
  state_present: boolean;
  state: "unknown" | "running" | "completed" | "failed" | "timed_out";
  wait_outcome: "matched_terminal" | "deadline";
  awaited_terminal: boolean;
  awaited_completed: boolean;
  succeeded: boolean;
  expected_plan_hash: string | null;
  since_iteration: number | null;
  plan_hash_mismatch: boolean;
  iteration_stale: boolean;
  max_wait_seconds: number;
  poll_ms: number;
  next_poll_after_seconds: number | null;
  max_state_bytes: number;
  max_artifact_bytes: number;
  max_total_bytes: number;
  run: WaitForHandoffRun | null;
  requested_artifacts: WaitForHandoffArtifactKind[];
  artifacts: WaitForHandoffArtifact[];
  artifact_count: number;
  unavailable: WaitForHandoffUnavailable[];
  unavailable_count: number;
  returned_bytes: number;
  output_limited: boolean;
  redacted: boolean;
}
```

There are no flat compatibility duplicates outside `data`.

### 5.1 Wait-facing state

- `run` preserves the valid observed lifecycle state.
- `state` reports the wait-facing state: `unknown` if no state exists, `running` while the observed state is running or a terminal state does not match the requested hash/iteration, otherwise the matching terminal state.
- `wait_outcome` is `matched_terminal` only when a terminal state satisfies both optional match conditions; otherwise it is `deadline`.
- `awaited_terminal` is true iff `wait_outcome === "matched_terminal"`.
- `awaited_completed` and `succeeded` are both true iff the matched terminal run is `completed`.
- `plan_hash_mismatch` is true only when an expected hash and a valid run are both present and differ.
- `iteration_stale` is true only when `since_iteration` and a valid run are present and `run.iteration <= since_iteration`.
- `next_poll_after_seconds` is null for a matched terminal result and otherwise `ceil(poll_ms / 1000)`, with a minimum of one.

### 5.2 Canonical run

```ts
interface WaitForHandoffRun {
  version: 1;
  state: "running" | "completed" | "failed" | "timed_out";
  iteration: number;
  plan_hash: string;
  started_at: string;
  finished_at: string | null;
  updated_at: string | null;
  executor: string;
  model: string | null;
  exit_code: number | null;
  timed_out: boolean;
  duration_ms: number | null;
  redacted: boolean;
}
```

The reader ignores unknown source fields such as `pid` and every source-supplied artifact path. Missing optional run fields normalize to null or false. Cross-field rules are:

- `running` has no finish time, exit code, or duration and is not timed out;
- `completed` has a finish time, exit code zero, and is not timed out;
- `failed` has a finish time, is not timed out, and cannot claim exit code zero;
- `timed_out` has a finish time, null exit code, and `timed_out:true`;
- timestamps are valid offset-aware ISO datetimes;
- identifiers are bounded, trimmed, one-line strings;
- executor/model values are redacted before becoming public, and `run.redacted` records whether either changed.

## 6. Bounds and fixed artifacts

Effective source/output bounds are echoed:

```text
max_state_bytes    = min(config.maxReadBytes, 64000)
max_artifact_bytes = min(config.maxReadBytes, 80000)
max_total_bytes    = min(config.maxOutputBytes, 40000)
```

All have a minimum of one byte. The four fixed paths are:

```text
status -> <contextDir>/agent-status.md
diff   -> <contextDir>/implementation-diff.patch
log    -> <contextDir>/execution-log.jsonl
tests  -> <contextDir>/loop-tests.txt
```

`status` is always requested. `diff`, `log`, and `tests` follow the three existing include inputs. The fixed order is status, diff, log, tests. Artifacts are read only for a matching terminal run.

Per-kind returned excerpt targets preserve current behavior but become UTF-8-byte based:

```text
status: 6000 bytes, prefix
diff:  12000 bytes, prefix
log:    6000 bytes, last 20 non-empty lines
tests:  4000 bytes, prefix
```

Redaction occurs before the final per-kind and aggregate output cap is enforced, so returned byte counts are truthful even when replacement text expands.

### 6.1 Artifact item

```ts
interface WaitForHandoffArtifact {
  path: string;
  kind: "status" | "diff" | "log" | "tests";
  source_bytes: number;
  line_count: number;
  returned_bytes: number;
  truncated: boolean;
  redacted: boolean;
  text: string;
}
```

### 6.2 Unavailable item

```ts
interface WaitForHandoffUnavailable {
  path: string;
  kind: WaitForHandoffArtifact["kind"];
  reason: "missing" | "blocked" | "too_large" | "not_text" | "output_limit" | "read_failed";
  bytes: number | null;
}
```

No raw diagnostic or absolute artifact path is returned.

### 6.3 Artifact invariants

- `artifact_paths` always contains the exact four fixed relative paths.
- `requested_artifacts` is the fixed-order subset implied by the include inputs.
- Before a matching terminal run, `artifacts` and `unavailable` are empty and all artifact counts/bytes/flags are zero or false, except run-field redaction can set `redacted`.
- After a matching terminal run, every requested kind appears exactly once across `artifacts` and `unavailable`; unrequested kinds appear nowhere.
- Both arrays preserve fixed order.
- `artifact_count` and `unavailable_count` equal their array lengths.
- `returned_bytes` equals the sum of artifact `returned_bytes` and never exceeds `max_total_bytes`.
- `line_count` and `returned_bytes` describe the exact returned text.
- `output_limited` is true iff an artifact is truncated or an unavailable reason is `too_large`/`output_limit`.
- `redacted` is true iff `run.redacted` or a returned artifact's `redacted` field is true.

## 7. Polling semantics

The handler reads once immediately. If no matching terminal state exists, it sleeps for `min(poll_ms, remaining_deadline_ms, remaining_scheduled_sleep_budget_ms)`, then reads again. It never sleeps a full poll interval past the deadline. The independent scheduled-sleep budget decreases after every successful sleep so a frozen or backward-moving wall clock cannot make polling unbounded.

Missing state is a normal observation and can be polled until the deadline. A present invalid state or a non-missing provider read failure returns a stable failure immediately rather than masquerading as absence. Tests use injected clock/sleep seams; production uses `Date.now` and `setTimeout`.

## 8. Warnings

Success warnings are derived in this exact order:

1. `No matching terminal handoff state was observed before the wait deadline.` iff `wait_outcome` is `deadline`.
2. `Some requested handoff artifacts could not be read safely.` iff an unavailable reason is `blocked`, `not_text`, or `read_failed`.
3. `Handoff excerpts were limited by the configured byte bounds.` iff `output_limited` is true.
4. `Secret-looking content was redacted from the returned handoff result.` iff `redacted` is true.

Normal missing optional artifacts do not add a separate warning. Failures have no warnings.

## 9. Stable failures

All failures use `ok:false`, `data:null`, `isError:true`, fixed safe text, and no warnings.

- `WORKSPACE_NOT_FOUND`: requested workspace is not open; non-retryable; explicit/default details match earlier workspace tools.
- `HANDOFF_STATE_READ_FAILED`: the fixed state file could not be read safely; non-retryable; details contain only `context_dir` and `state_file`.
- `HANDOFF_STATE_INVALID`: the present state file is not a valid version-1 lifecycle record; retryable because a concurrent writer may replace it; details contain only `state_file`.
- `HANDOFF_ARTIFACT_READ_FAILED`: the artifact provider failed before safe per-file classifications were available; non-retryable; details contain only `context_dir`.
- `INTERNAL_ERROR`: provider output or constructed data violated the exact contract; non-retryable; details are `{}`.

## 10. Domain and provider boundaries

Add bounded domain readers in `src/workspaceOps.ts`:

- `readHandoffRunState` resolves, stats, text-checks, revalidates, reads, and byte-checks only the fixed state path; ENOENT returns a missing observation, while other failures throw without retaining diagnostics;
- `readWaitForHandoffArtifacts` reads only the requested fixed paths and returns complete raw text or safe unavailable classifications.

Add test-only dependencies:

```ts
waitForHandoffStateProvider
waitForHandoffArtifactsProvider
waitForHandoffNow
waitForHandoffSleep
```

The server strictly validates provider identity, byte claims, fixed path/kind coverage, fixed relative order inside both provider artifact arrays, canonical run state, derived match flags, excerpt accounting, and final success construction. Provider throws map to the corresponding stable read failure; malformed provider values map to `INTERNAL_ERROR`, while valid provider framing containing invalid state JSON maps to `HANDOFF_STATE_INVALID`.

## 11. Human content and Tool Card

Human content shows the safe wait outcome, fixed state path, match/mismatch reason, canonical terminal summary, fixed unavailable reasons, and bounded artifact excerpts. It never prints raw state JSON.

The descriptor advertises the exact output schema and uses structured-content preservation. The dedicated Tool Card reads nested `data` first, retains flat historical fallback only inside the renderer, renders safe failure code/message, displays wait/match state, and caps each artifact preview at 20 lines and 4,000 characters.

## 12. Consumers and compatibility

- Protected `scripts/smoke.mjs` remains unchanged. `scripts/smoke-platform-compat.mjs` performs exact-count substitutions from its known flat wait fields to nested data/run/artifact-path fields.
- Protected HTTP Smoke reads no wait result fields and needs no substitution.
- Stress consumers migrate directly to nested `data` and artifact arrays.
- `codexpro` action `handoff_poll` preserves the complete six-field child envelope plus its existing wrapper tags.

## 13. Focused tests

The focused suite covers exact constructors, every failure, strict drift rejection, mode/descriptor annotations, immediate match, deadline/missing, hash mismatch, stale iteration, all terminal states, invalid/unreadable state, provider drift, fixed-path artifact reads, include flags, missing/unsafe/large/binary artifacts, UTF-8 byte truncation, log tailing, secret redaction, aggregate limits, deadline-aware sleep, Tool Card bounds, long structured preservation, supertool preservation, exact compatibility substitutions, and protected-source immutability.

## 14. Verification and acceptance

Run focused and adjacent contracts, Build, complete Node regression, all Smoke sections, native-Windows Stress, package dry-run, whitespace/protected-source/exact-scope/secret/Markdown/archive checks, then the required `neat-freak`.

Acceptance requires every result to parse the exact schema; no arbitrary path, raw exception, private diagnostic, secret-looking value, or unbounded body may escape; no sleep may extend beyond the deadline and a stalled/reversed wall clock cannot make the loop unbounded; protected Smoke sources, Git index, and unpublished Slice 17–19 work remain unchanged.

## 15. Risks and rollback

Invalid state files that previously appeared as `unknown` now produce an actionable retryable failure. State-file-supplied artifact paths are intentionally ignored even if they name another file under the context directory. Artifact bodies remain snapshots rather than an atomic set.

Before unified publication, rollback is a reviewed reverse patch limited to Slice 20 code, tests, adapters, and documentation plus an append-only correction. Do not reset the shared tree or discard Slices 17–19.
