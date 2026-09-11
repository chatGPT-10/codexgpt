# C2C Phase 3 — Safe Runtime Profile acceptance

Implementation began 2026-09-06; final verification 2026-09-07. Status: local Gate 3 PASS. Scope: [design](../superpowers/specs/2026-09-06-c2c-phase-3-runtime-design.md) and [plan](../superpowers/plans/2026-09-06-c2c-phase-3-runtime.md), following Phase 2.

## Deliverable and Gate 3

| Requirement | Evidence |
| --- | --- |
| Public `codexgpt c2c start` | Entry converts to existing start and pins handoff/write/Bash/tool/history/execution/Git/context settings; public child-process test reads resolved output against hostile saved/environment inputs and proves the profile bytes and workspace are unchanged. |
| Cannot modify source | Real MCP direct calls and wrapper actions/aliases are denied; `src/sample.ts` and other source bytes remain unchanged. Generic writes to the plan path are also denied. |
| Cannot run shell or mutate Git | Command, process, Git mutation, worktree and verification actions are unavailable. Server registration and wrapper dispatch enforce the ceiling independently of client catalogs. |
| Can write current-plan.md | Real MCP legacy/OAuth projection tests write and read the bounded plan. Compiled production V1 uses actual atomic transactions and persistent audit; the plan exists and source remains unchanged. |
| Can inspect actual diff | Both direct MCP and compiled production tests initialize a real Git fixture, modify a tracked file, and assert the returned diff includes the actual addition. |
| Stale tools cannot bypass | Old direct names fail at dispatch; canonical names and aliases return `ACTION_NOT_AVAILABLE`. V5 workflow is omitted and refused even with an injected execution handler. |
| Existing boundaries preserved | Normal handoff and affected contract tests pass; V1–V5 canonical universes stay 28/31/39/51/52. No new mode, OAuth schema, permission grant, executor, browser adapter or deployment. |

The C2C catalog is a subset of version-available tools. `semantic` requires existing V5 prerequisites; this wrapper does not force a contract migration. `handoff_to_codex` retains its existing plan/scaffold/status/log/diff artifacts within `.ai-bridge`; it is not a single-file-only writer.

Existing `enforce` Policy still returns `APPROVAL_REQUIRED` without the required approval. The production test verifies this refusal and the absence of a plan, separately from the successful legacy-Policy atomic/audit test. No test substitutes a permissive mock Policy or mutation runtime for that production evidence. OAuth-mode in-memory tests exercise server projection, not HTTP authorization or a real App grant. The V5 workflow adversarial test uses a mock wrapper registry; it does not claim a real V5 production or Browser roundtrip.

## Verification receipts

- TDD RED: missing launcher module; missing runtime marker; legacy catalog exposed `handoff_to_agent`; OAuth catalog exposed `write`.
- Focused source checks: CLI/profile tests, actual MCP safety, production atomic/audit and Policy refusal tests passed. Affected legacy context/handoff schemas and contracts passed after adding truthful standard-mode results.
- `node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node node_modules/typescript/bin/tsc -p tsconfig.json`: Node 20.20.2 and 24.15.0 pass.
- Final focused runner: `2026-09-07T06-25-20-286Z-c2c-phase3-final-91ce42f3`.
- Final existing MCP smoke runner: `2026-09-07T06-25-30-560Z-c2c-phase3-final-smoke-757b641c`.
- Final matrix: Node 20/24 each **285 pass, 0 fail, 0 skip**; runner exit 0. Both MCP smoke versions pass, runner exit 0. Both receipts report cleaned temporary state, complete untruncated logs and empty stderr.
- Closure checks PASS: `npm run policy:check`, `git -c core.safecrlf=false diff --check`, local Markdown links, new-file whitespace, introduced credential patterns and intended file scope. Memory.md is 100 lines; Part 14 is closed at 53,016 bytes after STEP-558.

Reproduce the focused matrix by running `node scripts/long-task-runner.mjs start --kind c2c-phase3-check -- node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose focused-test -- node --test` followed by these files:

```text
test/c2c-production-runtime.test.mjs test/c2c-runtime-profile.test.mjs test/c2c-runtime-safety.test.mjs
test/c2c-protocol.test.mjs test/c2c-state-machine.test.mjs test/c2c-session-store.test.mjs test/c2c-plan-integrity.test.mjs
test/handoff-to-codex-contract.test.mjs test/codex-context-contract.test.mjs test/codexgpt-contract.test.mjs
test/config-fingerprint.test.mjs test/config-explain.test.mjs test/public-cli-help.test.mjs test/cli-hostname-propagation.test.mjs
test/mutation-architecture.test.mjs test/test-execution-profiles.test.mjs test/tool-definition-registry.test.mjs
test/phase-7-contract-v5.test.mjs test/phase-7-v5-runtime-inheritance.test.mjs test/phase-6-standard-projection.test.mjs test/change-workflow-contract.test.mjs
```

The smoke uses the same detached matrix prefix with `-- node scripts/run-with-cleanup.mjs --purpose c2c-phase3-smoke -- node scripts/smoke-platform-compat.mjs`. Receipts reside under `.ai-bridge/runs/<run-id>/result.json` and retained logs.

Earlier runner `2026-09-06T20-36-13-945Z-c2c-phase3-tests-65b978fa` passed 283 tests on Node 20; Node 24 had 282 passes and one inventory failure because the newly added production test was not yet classified. The inventory was corrected. The first production test expected unconditional success under enforce Policy and used an incorrect audit-directory location; the final tests preserve the observed approval boundary and read the real `state/v1/audit/segments` location. Earlier smoke passed both Node versions; final smoke reruns the completed implementation.

## Usage, rollback and limits

From this built source checkout, the command is `node .\scripts\codexgpt-entry.mjs c2c start --root <workspace>`. It uses existing connection settings and does not save its safety selectors to the profile. This capability is not in the immutable published 1.0.5 release. Actual launch/replacement of the user's existing endpoint was not performed. Existing Cloudflared verification, local authentication, Host/Origin and OAuth grants remain authoritative.

Rollback removes only this phase's launcher, runtime ceiling, additive schema and test/document changes; retain all user profiles, C2C sessions, logs and audit state. Ordinary start uses its saved authority and is not an automatic fallback. Previous dirty changes were preserved. No staging, commit, push, publication, deployment, App refresh, browser operation or global-memory update occurred. Full ordinary/control regression, HTTP OAuth E2E and exact-head CI were not run; this is local Gate 3 evidence. Phase 4 remains the next separately scoped phase.
