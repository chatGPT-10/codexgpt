# C2C protocol v1

The implementation in `src/c2c/types.ts`, `protocol.ts`, `messages.ts`, and `stateMachine.ts` is authoritative. Parse exactly one completed assistant message from the bound conversation. The body must begin with `[CODEXGPT-C2C]` on its own first line. No prose wrapper, Markdown fence, quote, concatenated messages, unknown fields, duplicate fields, or embedded second prefix is accepted. Maximum wire size is 16,384 UTF-8 bytes. CRLF normalizes to LF; tabs, invisible format/control characters and malformed Unicode are rejected.

Every message includes `PROTOCOL: 1`, `STATE`, `TASK_ID`, and `ITERATION`. Task IDs match `c2c_[A-Za-z0-9_-]{1,96}`. Integers are nonnegative safe integers with no leading zeros. Scalar values occupy one line. Body fields use an empty header followed by plain text; their lines cannot begin with a quote/fence marker or an uppercase field header. Do not invent additional metadata.

| State | Additional fields | Iteration |
| --- | --- | --- |
| INIT | `WORKSPACE_ID` scalar; `GOAL` body | 0 |
| PLAN | `PLAN_PATH`, `PLAN_SHA256`, `PLAN_BYTES` scalars | Previous local iteration + 1, minimum 1 |
| EXECUTED | `EXECUTION_ID`, `PLAN_SHA256`, `CHANGED_FILES`, `CHECKS` scalars | Current plan iteration, minimum 1 |
| DONE | `SUMMARY` body | Current execution iteration, minimum 1 |
| BLOCKED | `REASON`, `NEEDS` bodies | Current local iteration |
| ERROR | `REASON` body | Current local iteration |
| HANDOFF | `ORIGINAL_GOAL`, `PROGRESS`, `KNOWN_ISSUES`, `NEXT_EXPECTED_STEP` bodies; `CURRENT_STATE` scalar | Saved iteration |

`WORKSPACE_ID` uses the actual opaque workspace capability, never a filesystem path. `PLAN_PATH` is exactly `.ai-bridge/current-plan.md`; `PLAN_SHA256` is 64 lowercase hexadecimal characters; `PLAN_BYTES` is the positive raw UTF-8 byte count. Copy hash and bytes from the successful handoff tool result, not a hash of rendered Markdown. Protocol acceptance at PLAN_RECEIVED does not verify artifact bytes. The local snapshot reader must verify both against the exact bounded artifact before execution; Phase 5 execution-start performs that integration. Any snapshot mismatch fails closed.

`EXECUTION_ID` matches `exec_[A-Za-z0-9_-]{1,96}`; `CHANGED_FILES` is a nonnegative integer; `CHECKS` is exactly `recorded`. These fields require actual local execution evidence. Phase 5 execution-finish records baseline-relative paths and checks reported by the current Codex; it does not run tests. CHECKS: recorded is not a claim that checks passed.

The Phase 5 local progression is `IDLE -> INIT_SENT -> PLAN_RECEIVED -> EXECUTING -> EXECUTED_LOCAL -> EXECUTED_SENT`. Only `INIT_SENT` and `EXECUTED_SENT` accept remote messages. The general protocol can represent a subsequent PLAN, but the Phase 5 CLI rejects it after execution in both observe and raw receive; only one PLAN iteration is supported. DONE is legal only after `EXECUTED_SENT`; it cannot complete a newly initialized task. BLOCKED and ERROR use the existing iteration, including 0 before the first plan. DONE, BLOCKED, ERROR and RECOVERY_REQUIRED are terminal for the reducer.

HANDOFF is a projection of the saved checkpoint, not a received transition or an instruction to rerun. Its `CURRENT_STATE` must be one of `IDLE`, `INIT_SENT`, `PLAN_RECEIVED`, `EXECUTING`, `EXECUTED_LOCAL`, `EXECUTED_SENT`, `DONE`, `BLOCKED`, `RECOVERY_REQUIRED`, `ERROR`; completed/ended tasks do not produce a handoff. Recovery must not reset EXECUTING to an executable state.
