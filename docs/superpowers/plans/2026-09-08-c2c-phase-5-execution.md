# C2C Phase 5 implementation plan

Date: 2026-09-08. Governed by the paired [design](../specs/2026-09-08-c2c-phase-5-execution-design.md).

1. Inspect current Git state, rules, Phase 4 contract and session/store/browser tests. Preserve unrelated changes and the planning-only Phase 4 checkpoint.
2. Add failing focused tests for start/finish evidence, immutable plan validation, pre-existing dirty baselines, CAS conflicts, duplicate/restarted operations and failed evidence collection. Implement bounded execution records and baseline capture through the retained local session interface.
3. Add failing CLI/browser tests for EXECUTED reservation before wire, actual persisted check projection, DONE review acceptance, malformed or wrong-turn replies and second PLAN rejection through observe and raw receive. Implement the single-iteration path without a process executor or recovery loop.
4. Update the C2C Skill and independent ChatGPT prompt. Require current-Codex authority review, real local checks, readable agent-status evidence, a single browser send and independent review. Validate Skill metadata and local Markdown links.
5. Run focused affected tests on managed Node 20/24, builds, relevant MCP smoke, policy, diff and intended-file/secret checks. Record exact results, platform skips and environment blockers separately.
6. When current host IAB and the authorized connector are available, run a fresh small implementation goal through real INIT, PLAN, local edits/checks, EXECUTED and reviewed DONE. Retain same-tab visible evidence and exact session facts. If unavailable, retain local evidence and explicitly mark real Gate 5 pending without copied messages or fabricated completion.
7. Update project Memory.md, append the active archive and write acceptance with actual outcomes, limitations and rollback. Staging, commit, publication and external changes remain separately authorized.
