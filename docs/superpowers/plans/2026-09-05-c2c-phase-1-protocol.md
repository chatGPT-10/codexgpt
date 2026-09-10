# C2C Phase 1 implementation and acceptance

Date: 2026-09-05. [Contract](../specs/2026-09-05-c2c-phase-1-protocol-design.md).

1. Restore Phase 0 task and original C2C roadmap; inspect rules, project memory, existing source/test conventions and dirty state. Preserve existing changes.
2. Write failing protocol and reducer tests before implementation, including every allowed and forbidden state/event combination.
3. Implement `src/c2c/{types,protocol,messages,stateMachine}.ts` as pure modules. Enforce strict wire context, bounded messages, separate local states and exact execution receipt linkage.
4. Classify tests in the existing Windows `fast` inventory. Run focused tests, adjacent registration/mutation/inventory tests, managed Node 20/24 build and relevant existing smoke.
5. Run policy/diff/secret/intended-file checks; append STEP-556 to project history and update the index. Do not stage, commit, push, deploy or start Phase 2.

## Verification commands

```powershell
npm run test:focused -- test/c2c-protocol.test.mjs test/c2c-state-machine.test.mjs
node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose focused-test -- node --test test/c2c-protocol.test.mjs test/c2c-state-machine.test.mjs test/test-execution-profiles.test.mjs test/tool-definition-registry.test.mjs test/mutation-architecture.test.mjs
node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node node_modules/typescript/bin/tsc -p tsconfig.json
node scripts/long-task-runner.mjs start --kind c2c-phase1-smoke -- node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose c2c-phase1-smoke -- node scripts/smoke-platform-compat.mjs
npm run policy:check
git diff --check
```

Final counts, results, limitations and runner receipt are recorded in the [acceptance report](../../reviews/2026-09-05-c2c-phase-1-acceptance.md). Full ordinary/control and browser gates belong to the Phase 0 baseline and are not represented as rerun by these focused Phase 1 commands.
