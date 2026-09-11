# C2C Phase 1 — Protocol Core

Date: 2026-09-05. Scope: owner-authorized Phase 1 from conversation `6a9a74a0-c920-83eb-bf4b-b65891aecfd1`, following the [local Gate 0 report](../../reviews/2026-09-05-c2c-phase-0-acceptance.md). This is the C2C roadmap, not the historical MCP output-schema Phase 1.

## Boundary

Pure TypeScript logic under `src/c2c/`: schemas/types, parser, formatter, and reducer. No filesystem/process/network calls, MCP registration changes, dependency changes, profile changes, browser calls, CLI wiring, or persistent sessions. The current Codex remains the future executor. This module validates observations; it cannot prove that an execution or browser send actually occurred.

## Wire v1

`PREFIX = [CODEXGPT-C2C]`, `PROTOCOL_VERSION = 1`. The complete message is at most 16,384 UTF-8 bytes, measured before CRLF normalization. LF and CRLF are supported. Numbers are canonical nonnegative decimal safe integers. IDs use ASCII letters, digits, `_`, `-`; task IDs start with `c2c_` (1–96 suffix characters), execution IDs with `exec_` (1–96 suffix characters), opaque workspace IDs have 1–128 characters. Hashes are exactly 64 lowercase hex characters. PLAN path is exactly `.ai-bridge/current-plan.md`; PLAN bytes are positive metadata, not a file read or authorization.

Each message requires `PROTOCOL`, `STATE`, `TASK_ID`, `ITERATION`. Additional fields are an exact per-state whitelist:

| State | Required fields | Iteration |
| --- | --- | --- |
| INIT | WORKSPACE_ID, GOAL | 0 |
| PLAN | PLAN_PATH, PLAN_SHA256, PLAN_BYTES | >= 1 |
| EXECUTED | EXECUTION_ID, PLAN_SHA256, CHANGED_FILES, CHECKS (`recorded`) | >= 1 |
| DONE | SUMMARY | >= 1 |
| BLOCKED | REASON, NEEDS | >= 0 |
| ERROR | REASON | >= 0 |
| HANDOFF | ORIGINAL_GOAL, PROGRESS, CURRENT_STATE, KNOWN_ISSUES, NEXT_EXPECTED_STEP | >= 0 |

Scalar headers use `KEY: value`. Narrative fields use `KEY:` followed by bounded plain text; the parser also accepts a one-line narrative value. `CURRENT_STATE` is one of the local states below. The canonical formatter emits narrative fields as separate sections, without Markdown fencing. Blank section separators and a final newline are accepted; trailing section newlines are normalized. Canonical narrative values must have no outer whitespace. Lines beginning with quote/fence markers or uppercase header syntax are reserved and rejected inside narrative fields. Unsupported headers, duplicate headers, empty required fields, noncanonical numbers, malformed Unicode, C0/C1 controls, bidi/format controls, and extra protocol prefixes fail closed. Error text is fixed and does not echo the rejected content.

`parseMessage(text, {taskId, expectedIteration})` requires both local expectations. It parses the complete message and never searches for a substring or selects the last block. Leading prose, Markdown quotes/fences and multiple blocks are rejected. The future browser adapter must pass only the selected assistant message from the expected conversation; a text parser cannot authenticate DOM provenance. Source files and entire page/transcript text must never be passed as assistant messages.

`formatMessage(message)` validates the strict schema, body syntax, byte ceiling and parse roundtrip. EXECUTED has no arbitrary text/log/diff fields. Free-text goal/summary fields are not a semantic source-code or secret detector; existing secret protection must be composed by the future adapter/session boundary.

## Local reducer

`createTask(taskId)` returns IDLE with iteration 0 and no plan/execution. `transition(current, event)` validates and clones both inputs, returns a new validated snapshot, or throws `C2CTransitionError`. It performs no side effects and does not persist, retry or restart work.

| Current | Event / incoming state | Next | Waiting for |
| --- | --- | --- | --- |
| IDLE | SEND_INIT / INIT | INIT_SENT | CHATGPT_PLAN |
| INIT_SENT | RECEIVE / PLAN | PLAN_RECEIVED | CODEX_EXECUTION |
| PLAN_RECEIVED | START_EXECUTION | EXECUTING | CODEX_EXECUTION |
| EXECUTING | COMPLETE_EXECUTION / EXECUTED | EXECUTED_LOCAL | NONE |
| EXECUTED_LOCAL | SEND_EXECUTED / EXECUTED | EXECUTED_SENT | CHATGPT_REVIEW |
| EXECUTED_SENT | RECEIVE / PLAN | PLAN_RECEIVED | CODEX_EXECUTION |
| EXECUTED_SENT | RECEIVE / DONE | DONE | NONE |
| INIT_SENT or EXECUTED_SENT | RECEIVE / BLOCKED | BLOCKED | USER |
| INIT_SENT or EXECUTED_SENT | RECEIVE / ERROR | ERROR | USER |
| Any of the five active states | FAIL | ERROR | USER |
| Any of the five active states | REQUIRE_RECOVERY | RECOVERY_REQUIRED | USER |

IDLE waits for NONE. DONE, BLOCKED, ERROR and RECOVERY_REQUIRED have no outgoing transitions in this phase. Every omitted event/state pair is rejected. BLOCKED and RECOVERY_REQUIRED are stopped checkpoints, not completion claims. HANDOFF is a validated wire payload only; consuming it to change conversation or resume work belongs to later phases and is rejected by RECEIVE here.

PLAN always requires `current.iteration + 1`; a second PLAN while executing/pending execution is rejected. Review outcomes require the current iteration. Every message must match the current task. Local execution completion must match the retained PLAN hash and iteration. SEND_EXECUTED must match the entire saved execution receipt, including execution ID and changed-file count. Advancing to the next PLAN clears the old execution receipt. Waiting state, iteration, PLAN and execution consistency are validated again on every transition; this is not durable session authentication.

SEND_INIT and SEND_EXECUTED mean the adapter has evidence of a successful send. START_EXECUTION means local checks have authorized execution, and COMPLETE_EXECUTION means local completion was observed. If a send or execution outcome is uncertain, record REQUIRE_RECOVERY instead of claiming completion or automatically repeating the operation. Phase 2 must verify the actual plan file hash before execution; this phase only compares hash metadata.

## Gate and rollback

All 100 combinations of ten local states and ten event variants are tested, with additional invalid incoming INIT/EXECUTED/HANDOFF tests in every state. Protocol tests cover all seven messages, missing/duplicate/unknown fields, task and iteration mismatch, replay, wrong protocol, control characters, UTF-8 limits, multiple blocks, quotes/fences and missing hashes. Adjacent regression checks preserve tool registration, mutation inventory and Windows test classification. The two new test files are in the existing `fast` test inventory.

Rollback removes only these four new modules, two tests, two inventory entries and the associated Phase 1 documents/index entry. No existing API consumer imports C2C. Preserve pre-existing dirty changes. Browser/session/runtime-profile/CLI integration and publication remain later, separately scoped work.
