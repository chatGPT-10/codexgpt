# C2C Phase 4 — implementation and acceptance status

Date: 2026-09-07. **Phase 4 local implementation and live INIT-to-PLAN acceptance PASS.** Scope follows the [design](../superpowers/specs/2026-09-07-c2c-phase-4-browser-design.md) and [plan](../superpowers/plans/2026-09-07-c2c-phase-4-browser.md). This closes the Skill/browser planning exchange, not the Phase 5 implementation/review loop or release gates.

## Requirement evidence

| Requirement | Current evidence |
| --- | --- |
| Repository Skill and lazy references | `skill/SKILL.md` plus protocol, project-instructions and browser-workflow references; Skill validator passes. |
| Separate Brain contract | `C2C_CHATGPT_PROMPT.md`; existing `CHATGPT_PROMPT.md` unchanged. |
| Code owns protocol and transitions | Session CLI reuses Phase 1 parser/reducer and Phase 2 CAS store. |
| One-tab DOM attribution | Observer validates exact URL, tab/provider identity, submitted user turn and one completed assistant reply. Tests reject stale/ambiguous/wrong-task replies. This is adapter-input validation, not proof that a host supplied genuine DOM. |
| No timeout resend | Poller has only read/wait capabilities; exhaustion returns pending. INIT is durably reserved before exposing wire. Compiled public CLI subprocess tests prove a later process cannot reserve it again. |
| Session bridge | Public `c2c session --root <absolute-root>` reads bounded strict JSON stdin: status, begin, prepare-init, receive, observe. Unknown/duplicate keys and oversized input fail without echoing input. |
| Actual IAB integration | Supported IAB delivered one formal INIT and received a bare PLAN; fresh DOM observation advanced the real session to PLAN_RECEIVED, revision 3. Local plan hash/bytes match. See final live evidence below. |

The Skill is the host orchestration layer; no browser binary, login extraction or standalone Playwright backend is bundled. `observe` accepts a bounded snapshot supplied by that layer. `receive` is a trusted local manual-input interface and cannot certify browser attribution. Neither proves plan file integrity: Phase 5 must call the retained snapshot check before execution. `INIT_SENT` records an at-most-once reservation in this bridge, not proven delivery; crashes between reservation and submission require reconciliation, never automatic replay.

## Fresh verification

- TDD RED: browser exchange and CLI tests initially failed with missing modules; implementation then passed.
- Build: `node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node node_modules/typescript/bin/tsc -p tsconfig.json` passed on Node 20.20.2 and 24.15.0.
- Focused matrix runner `2026-09-07T06-58-07-813Z-c2c-phase4-tests-c328c02c`: **223 passed, 0 failed, 0 skipped on each Node major**; exit 0, complete logs, empty stderr, temporary state cleaned.
- Existing MCP smoke runner `2026-09-07T06-58-17-981Z-c2c-phase4-smoke-21c223a8`: both Node majors pass; exit 0, complete logs, empty stderr, temporary state cleaned.
- `npm run policy:check` and `git -c core.safecrlf=false diff --check` pass.
- `python D:\Codex\home\skills\.system\skill-creator\scripts\quick_validate.py skill` passes. Local Markdown links, new-file whitespace and introduced credential-pattern scans pass. `Memory.md` is 103 lines / 19,248 bytes, below its hard limits; active Part 15 is 2,893 bytes, below the continuation threshold.

Reproduce the focused run with `node scripts/long-task-runner.mjs start --kind c2c-phase4-tests -- node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose focused-test -- node --test` followed by:

```text
test/c2c-browser-exchange.test.mjs test/c2c-cli.test.mjs test/c2c-protocol.test.mjs
test/c2c-state-machine.test.mjs test/c2c-session-store.test.mjs test/c2c-plan-integrity.test.mjs
test/c2c-runtime-profile.test.mjs test/c2c-runtime-safety.test.mjs test/c2c-production-runtime.test.mjs
test/public-cli-help.test.mjs test/cli-hostname-propagation.test.mjs
test/mutation-architecture.test.mjs test/test-execution-profiles.test.mjs
```

Smoke uses the same detached matrix prefix with `-- node scripts/run-with-cleanup.mjs --purpose c2c-phase4-smoke -- node scripts/smoke-platform-compat.mjs`. Receipts are under `.ai-bridge/runs/<run-id>/result.json`. Later terminal handles were unavailable; the completed receipts and logs, not handle loss, establish success.

## Earlier prerequisite investigation and boundaries

### Browser continuation — 2026-09-07

The user explicitly enabled Browser and requested continuation. Current plugin `26.901.51231` connected successfully; the previous cache path no longer existed. A new dedicated ChatGPT conversation was created through the supported IAB. The non-executing bootstrap prompt was submitted once and received `READY` in the same tab. A transient `/c/WEB:...` URL resolved to a canonical UUID chat URL; no transient URL was accepted as a session binding. Provider tab identity remained stable and the tab was marked for continuation.

The existing `codexgpt-Windows-v2` connector was selected through its visible mention picker. A single read-only `open_current_workspace` preflight produced an expanded tool card displaying `{}` and a completed assistant response reporting workspace_id/tool_mode/C2C ceiling unavailable. A separate direct connector diagnostic returned MCP `-32603 Internal error`. Native `Get-NetTCPConnection -State Listen -LocalPort 8787` returned no listener. These observations do not prove a specific remote transport cause, but no current workspace binding can be established. The visible workspace-limit banner did not prevent the successful READY generation and is not asserted as the blocker.

Local session status remains null; no workspace_id was fabricated and no INIT was reserved/sent. The supported entry's `c2c start --root D:\Dev\codexgpt --tunnel none --print-env-only` preview exited 0 without stderr and showed C2C=1, standard tools, execution off, Git read, OAuth mode. Preview is not a running service. Actual runtime startup/deployment remains separately gated by AGENTS.md section 9. Next action requires authorization to start the prepared C2C runtime using existing connection settings, then retry the failed read-only preflight and perform the protocol exchange. No OAuth/Tunnel/DNS configuration or billing setting was changed.

Enable the host Browser, read its current documentation, bind one authorized ChatGPT conversation with the C2C connector, and verify fresh same-tab submission/generation/completion and accepted PLAN or explicit BLOCKED. Preserve evidence without credentials/transcripts. The earlier Phase 0 DOM probe and fake snapshots do not meet this requirement. Resolve any observed adapter mismatch before closing Phase 4.

Full ordinary/control regressions, live Web roundtrip and exact-head CI were not run. No executor loop, global Skill installation, package change, staging, commit, push, deployment, App refresh, OAuth/Tunnel/DNS or credential change occurred. All earlier dirty work is retained. Rollback removes only this phase's additive files, public entry route and test inventory entries; preserve user sessions, profiles and audit data. Packaging belongs to the later release phase.

## Final live acceptance after runtime authorization

The owner explicitly authorized the prepared C2C runtime startup. `node scripts/codexgpt-entry.mjs c2c start --root D:\Dev\codexgpt` started handoff/standard/write-handoff/Bash-off using the existing OAuth profile and named tunnel. The effective MCP port is **8789**, local admin 8790. Correction: the earlier absence of a listener on 8787 did not establish absence on the configured port. A health request with the configured Host returned `{ok:true,authMode:"oauth",mcpAvailable:true}`; the first request using the loopback Host was correctly rejected by Host enforcement.

The same ChatGPT conversation then successfully returned the actual D:\Dev\codexgpt workspace, standard tool mode, handoff writes and Bash off. The repository Brain prompt was supplied separately and acknowledged READY. Session `c2c_phase4_live_20260907` was created at revision 1; prepare-init committed revision 2 before exposing the canonical wire.

A turn interruption removed the browser binding and foreground server. With fresh evidence of connection refusal, the authorized runtime was relaunched through detached runner `2026-09-07T19-24-19-377Z-c2c-phase4-runtime-2d3aed0b`. The old tab was absent; the same canonical conversation was reopened and its persisted, unsent composer draft inspected. The last sent assistant reply was still READY and there was no submitted INIT. No second prepare-init occurred. Paragraph-node projection matched the original reserved wire; rendered innerText had extra paragraph whitespace and was not used as the transmitted-wire authority. The single actual INIT submission then occurred, with submitted user turn `7b78a120-b2cf-4532-852a-8a950874d2d0`. This is explicit evidence reconciliation during the test, not an implemented automatic Phase 6 recovery mechanism. Runtime restart invalidates old workspace capabilities; the Brain obtained a fresh capability during its read workflow. Session capability rotation is not claimed.

During generation, the actual DOM observation passed public CLI `observe` as waiting, preserving revision 2. The same tab/provider identity was maintained throughout the formal exchange. The completed assistant turn `request-6a9eb29c-c0fc-83ed-bc34-a99f58f3ac04-0` contained exactly one assistant content block, no code fence, and this bare PLAN:

```text
[CODEXGPT-C2C]
PROTOCOL: 1
STATE: PLAN
TASK_ID: c2c_phase4_live_20260907
ITERATION: 1
PLAN_PATH: .ai-bridge/current-plan.md
PLAN_SHA256: f9dae3c03482e3723dd5ace1f482a58c45d6c8ef61cb2ffaa96716250ee64958
PLAN_BYTES: 3205
```

`Get-Content .ai-bridge/c2c-phase4-live-complete.json -Raw | node scripts/codexgpt-entry.mjs c2c session --root D:\Dev\codexgpt` returned observation complete, PLAN_RECEIVED, revision 3. Repeating the same local observation returned REVISION_CONFLICT and did not resend anything to the browser. The separate retained `readPlanSnapshot` reader, using `loadConfig` read protections, verified the actual artifact SHA and 3,205 bytes. Execution remained null. Waiting and complete bounded DOM request evidence is retained in `.ai-bridge/c2c-phase4-live-observe.json` and `.ai-bridge/c2c-phase4-live-complete.json`; no full transcript or credentials were saved.

The live plan proposes a documentation-only clarification. It was **not executed**. The session intentionally remains PLAN_RECEIVED for inspection; later execution requires Phase 5 authorization and a fresh integrity check. The authorized C2C runtime remains available under its exact detached runner; no package publication, App refresh, credential/profile migration, DNS modification, service installation, full regression, CI or Web efficiency benchmark was performed. The earlier pending/no-deployment statements above describe pre-authorization history and are superseded only by this bounded startup and live planning-exchange evidence.
