# C2C Phase 5 acceptance

Date: 2026-09-08. Status: local implementation and real Web Gate 5 PASS after an explicitly authorized fresh attempt. Closure-SHA CI/publication are not performed. This is C2C single-iteration execution, not the historical Core Git/worktree Phase 5.

## Delivered behavior

The public `c2c session --root <absolute-root>` JSON interface now connects an accepted PLAN to current-Codex execution and independent review:

- `execution-start` verifies the immutable plan snapshot, records an execution ID and bounded Git baseline, and durably reserves EXECUTING before returning the snapshot. Existing dirty content is preserved and distinguished.
- Current Codex implements the authorized goal and runs the checks. The CLI never interprets plan prose or starts another executor. `execution-finish` captures the final baseline, records baseline-relative changed paths and caller-reported checks, and returns a canonical report.
- Codex writes the exact report to `.ai-bridge/agent-status.md`. `prepare-executed` verifies that report and unchanged final Git evidence, then reserves EXECUTED_SENT before exposing wire. Retries cannot produce another send permission.
- Browser observation accepts only DONE/BLOCKED/ERROR after EXECUTED. Second PLAN is refused. DONE requires at least one passed check and no failed, blocked or unrun check. The lower-level store also prevents bypass of report/check gates for evidence-bearing sessions.

The paired [design](../superpowers/specs/2026-09-08-c2c-phase-5-execution-design.md), [plan](../superpowers/plans/2026-09-08-c2c-phase-5-execution.md), repository Skill and Brain prompt describe the actual interfaces and trust boundaries.

## Verification

- TDD RED: the new iteration test initially rejected unsupported execution-start; after implementation, narrow iteration and existing session/CLI/mutation contracts passed.
- Managed Node 20.20.2 and 24.15.0 TypeScript builds passed with `node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node node_modules/typescript/bin/tsc -p tsconfig.json`.
- Broad affected regression run `2026-09-08T05-32-13-497Z-c2c-phase5-tests-240c766f`: Node 20 passed 234 tests; Node 24 passed 235 tests; no failures/skips. A cross-process case was added while this run was underway, so this is not claimed as identical test inventory on both majors.
- The completed supplement `2026-09-08T10-04-50-856Z-c2c-phase5-final-ef3bb691` ran the same final iteration/evidence inventory on each major: 12 passed, zero failed/skipped. It covers actual fixture edits/checks and public CLI restart behavior, but simulated review remains a local test.
- Final fixed-path Git binding run `2026-09-08T11-08-25-204Z-c2c-phase5-binding-33752f28` passed all 12 iteration/evidence tests on each major, including an unusable PATH and hostile GIT_DIR. It ran after the last source changes and latest dual-Node build, with exit 0, untruncated logs, empty stderr and cleaned owned temporary state.
- MCP smoke `2026-09-08T05-33-46-202Z-c2c-phase5-smoke-8f4b1882` passed both majors. Completed run receipts have exit 0, untruncated logs, empty stderr and cleaned owned temporary state.
- Read-only capture against the actual dirty repository succeeded: 71 paths, 15,630 serialized bytes. This proves capture usability only; it did not start or complete a C2C task.
- Final `npm run policy:check`, `git -c core.safecrlf=false diff --check` and Skill validation passed. Seventeen phase-related files passed UTF-8/whitespace/credential-pattern checks; all 21 local Markdown links resolved. Scope inspection retained all earlier dirty work. Memory index: 104 lines / 19,969 bytes, below hard limits; active archive stays below its 48 KiB continuation threshold.

Broad regression used the detached runner prefix:

```powershell
node scripts/long-task-runner.mjs start --kind c2c-phase5-tests -- node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose focused-test -- node --test test/c2c-execution-evidence.test.mjs test/c2c-iteration.test.mjs test/c2c-browser-exchange.test.mjs test/c2c-cli.test.mjs test/c2c-protocol.test.mjs test/c2c-state-machine.test.mjs test/c2c-session-store.test.mjs test/c2c-plan-integrity.test.mjs test/c2c-runtime-profile.test.mjs test/c2c-runtime-safety.test.mjs test/c2c-production-runtime.test.mjs test/public-cli-help.test.mjs test/cli-hostname-propagation.test.mjs test/mutation-architecture.test.mjs test/test-execution-profiles.test.mjs
```

The supplements use that runner/matrix/cleanup prefix with only `test/c2c-iteration.test.mjs test/c2c-execution-evidence.test.mjs`. Smoke uses the prefix with `--purpose c2c-phase5-smoke -- node scripts/smoke-platform-compat.mjs`. Receipts remain under `.ai-bridge/runs/<run-id>/result.json`.

## Corrections and limitations

Independent code review found loader key-budget mismatch, a lower-level send/check bypass, post-commit oversized report risk and repository Git filter execution risk. All were repaired before local acceptance. Git for Windows rejected Node's device null path as GIT_CONFIG_GLOBAL; the implementation uses Git's `/dev/null`. A delegated evidence implementation remained pending initialization; the main agent completed it locally. Lost foreground tool handles were reconciled with completed detached receipts.

Fingerprint scans reuse protected same-handle reads and fixed-path Git binding; source bodies are never persisted or returned. Their bounded scan ceiling is separate from connector response limits. The original connector-sized scan failed on existing large source files; the 512 KiB per-file / 4 MiB total scan supports this repository without increasing connector output. Configured secret paths, unsafe links, binary/oversized content, filters, includes, worktree config, promisor integrations and submodules remain fail-closed. Raw diff metadata hashes plus dirty-file/index fingerprints are not patch exports or an OS-wide snapshot. External editors can race, and reverted transient edits cannot be attributed.

Checks are trusted reports from the current authorized Codex, not independently executed or cryptographically attested by the CLI. `.ai-bridge` is excluded from implementation-change counts. No new recovery or multi-iteration workflow is implemented; uncertain EXECUTING or send states must not rerun automatically. Older strict session readers may reject new evidence fields; retain current state for reconciliation rather than resetting it during rollback.

## First real Gate 5 attempt — preserved failure

The previous Phase 4 goal explicitly permitted planning only. Its session was saved in `.ai-bridge/c2c-phase4-preserved-session.json` and ended at revision 4 without execution, before beginning the newly authorized Phase 5 goal. Real Gate 5 still needs PLAN, local implementation/checks, EXECUTED, and independent connector-based review ending in DONE, without user copying plans/diffs/logs.

The owner subsequently enabled Browser. The supported IAB opened the dedicated [acceptance chat](https://chatgpt.com/c/6a9ffbbc-84b4-83ed-b07d-66bee5359560), selected the existing codexgpt-Windows-v2 connector, obtained a real workspace handle, loaded the Brain instructions and received READY. The new goal permits only a documentation improvement in `skill/references/execution-workflow.md`, plus local evidence and acceptance records.

The same previously authorized runtime configuration was started through `node scripts/long-task-runner.mjs start --kind c2c-phase5-runtime -- node scripts/codexgpt-entry.mjs c2c start --root D:\Dev\codexgpt`, run `2026-09-08T12-12-44-833Z-c2c-phase5-runtime-fbf51dc9`. Configured-Host health and actual connector reads initially succeeded. Exactly one INIT was reserved at revision 6 and submitted; a generating observation preserved that revision. The completed assistant reply was BLOCKED: reads succeeded, but the required handoff reported an account connection error and no successful plan hash/byte result existed. This is the Brain's reported error, not a verified diagnosis of credentials.

After interruption, the same chat was reopened and its actual final message was observed without resending INIT. `Get-Content .ai-bridge/c2c-phase5-init-blocked.json -Raw | node scripts/codexgpt-entry.mjs c2c session --root D:\Dev\codexgpt` accepted revision 7/BLOCKED, iteration 0, plan/execution null. The bounded observation and response are retained in `.ai-bridge/c2c-phase5-init-blocked.json` and `.ai-bridge/c2c-phase5-blocked-result.json`. User turn: `260944af-d022-4522-90da-7c65a5c1b3a5`; assistant turn: `d941f1d4-f8bc-4186-998f-4a93f86fe8e0`.

At that attempt's inspection, local health returned connection refused and the recorded worker/child PIDs were absent. The runner has no terminal result; its last lease publication was 12:19:15 UTC. These facts establish that attempt's unavailability, not its cause. No credential reset, connection rebind, duplicate INIT, local plan substitution or execution occurred. BLOCKED is terminal in Phase 5; that attempt was retained for the subsequent explicitly user-directed retry. Phase 6 recovery was not added.

## User-directed retry — real Gate 5 PASS

The owner explicitly requested another real Web acceptance. The failed session was preserved in `.ai-bridge/c2c-phase5-attempt1-preserved.json` and ended at revision 8 without execution. The authorized public C2C entry restarted the same configuration under detached run `2026-09-08T16-33-26-407Z-c2c-phase5-retry-runtime-7cfcd621`; configured-Host health passed before preflight and during review. No OAuth, App, DNS or service settings changed.

The same acceptance chat obtained a fresh workspace through a successful `open_current_workspace`. New task `c2c_phase5_live_20260908_retry1` used a new INIT, not a replay of the blocked task. Actual persisted transitions were:

| Revision | State | Observed result |
| --- | --- | --- |
| 9 | IDLE | New task with fresh workspace binding |
| 10 | INIT_SENT | One reserved/submitted INIT; waiting observation preserved revision |
| 11 | PLAN_RECEIVED | Actual bare PLAN accepted from browser DOM |
| 12 | EXECUTING | Plan bytes/hash verified; execution ID and 72-path dirty baseline recorded |
| 13 | EXECUTED_LOCAL | One baseline-relative changed path and five passed checks recorded |
| 14 | EXECUTED_SENT | Exact canonical report and unchanged Git evidence verified; one reserved/submitted EXECUTED |
| 15 | DONE | Actual completed independent review accepted at 16:41:41 UTC |

Plan SHA-256: `a3bf003f28d8b293258a825eebff42f7d769b9098e78e156adffb644cfc4c2d0`; bytes: 5,024. Execution ID: `exec_321e0b8565c2dfc647b01a465bc51fbe`. HEAD stayed `877aebedbd2cb71dea657ba33f9cd52aed1c2889`. Only `skill/references/execution-workflow.md` changed relative to the captured baseline: it now defines all five statuses, gives exactly one illustrative valid JSON example and states the reporting boundary and exact DONE predicate. The original dirty file set was retained.

Actual checks all passed: `node .ai-bridge/c2c-phase5-retry-validate.mjs`; `npm run policy:check`; `git -c core.safecrlf=false diff --check -- skill/references/execution-workflow.md`; `python D:/Codex/home/skills/.system/skill-creator/scripts/quick_validate.py skill`; target credential-pattern scan and manual complete diff inspection. The target was already untracked, so the Git whitespace command alone was insufficient: direct whitespace checks and a baseline-relative patch supplied the actual content verification. The validator checked the example against the current check schema and confirmed only the intended baseline-relative path changed. No source behavior changed during this retry; earlier dual-Node build/regression/smoke receipts remain applicable.

The 41,386-byte canonical report was written verbatim to `.ai-bridge/agent-status.md`; the before-image and unified patch are `.ai-bridge/c2c-phase5-retry-workflow-before.md` and `.ai-bridge/implementation-diff.patch`. Fresh UI inspection showed real `show_changes`, `read_handoff`, target-file `read` and schema/CLI `read` calls. `read_handoff` returned seven artifacts including the plan, report and patch: 58,960 bytes, no unavailable artifacts, no output limit or redaction. Target and CLI reads returned ok. This supports independent file/evidence review, not an independent rerun of Codex's check commands. Bounded UI evidence is `.ai-bridge/c2c-phase5-retry-review-ui.txt`; no efficiency benchmark score is inferred.

INIT user turn: `8455e300-377f-48e2-af2a-4c37a5bdfbe2`; EXECUTED user turn: `22ecd6bb-f5e7-4b1e-9001-7d4e6a8445ad`; DONE assistant turn: `request-6a9ffbbc-84b4-83ed-b07d-66bee5359560-2`. Complete, unchanged bare replies were supplied to public CLI `observe`; no fence stripping, substring extraction, second PLAN or duplicate send occurred. Exact requests/results are `.ai-bridge/c2c-phase5-retry-{plan,start,finish,executed,done}[-request].json`. The ignored helper runs `node scripts/codexgpt-entry.mjs c2c session --root D:\Dev\codexgpt` with serialized JSON stdin and saves full results before printing bounded summaries.

Project acceptance/Memory/archive updates were made after DONE and are outside that completed one-file implementation baseline. The previous failure and its unconfirmed runtime exit cause remain recorded. Browser reconnection and an explicitly authorized fresh attempt do not establish Phase 6 automatic recovery support. Real Gate 5 is passed; closure-SHA CI and publication remain separate project gates.

Full ordinary/control regression, exact-head CI, staging/commit/push, package publication, deployment, App refresh, OAuth/Tunnel/DNS changes and Phase 6 were not performed. Rollback only this phase's code/Skill/docs/inventory additions, preserving all pre-existing dirty work, sessions, credentials and audit data.
