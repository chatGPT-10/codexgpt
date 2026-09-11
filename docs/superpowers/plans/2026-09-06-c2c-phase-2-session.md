# C2C Phase 2 implementation and verification

Date: 2026-09-06. [Design](../specs/2026-09-06-c2c-phase-2-session-design.md).

1. Restore the detailed Phase 2 roadmap and inspect current Phase 1 code, profile key/home utilities, atomic writer, safe reader, redaction and mutation inventory.
2. Write RED tests for session/CAS/task/URL/restart/PLAN requirements. Implement independent session storage, strict schema, path helpers, verified plan snapshot and HANDOFF projection.
3. Add actual child-process restart/concurrency/crash evidence, failure injection and path/secret rejection tests. Register exact mutation call digests and test execution profiles.
4. Verify retained Node 20/24 builds and focused plus adjacent tests; run compiled Session smoke and existing MCP smoke using owned temporary state.
5. Review each Gate 2 item against code and fresh results; run policy/diff/secret/link/intended-file checks. Append STEP-557 and update the project index. Preserve prior dirty files and all existing profile/deployment state.

## Reproduction

```powershell
npm run test:focused -- test/c2c-session-store.test.mjs test/c2c-plan-integrity.test.mjs
node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node node_modules/typescript/bin/tsc -p tsconfig.json
node scripts/long-task-runner.mjs start --kind c2c-phase2-tests -- node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose focused-test -- node --test test/c2c-session-store.test.mjs test/c2c-plan-integrity.test.mjs test/c2c-protocol.test.mjs test/c2c-state-machine.test.mjs test/mutation-architecture.test.mjs test/test-execution-profiles.test.mjs test/tool-definition-registry.test.mjs test/guidance-safe-text-reader.test.mjs test/guidance-safe-text-reader-windows.test.mjs test/windows-process-host-protocol.test.mjs
node scripts/long-task-runner.mjs start --kind c2c-phase2-smoke -- node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose c2c-phase2-smoke -- node scripts/smoke-platform-compat.mjs
npm run policy:check
git diff --check
```

The [acceptance report](../../reviews/2026-09-06-c2c-phase-2-acceptance.md) records final results and the retained runner IDs. Full ordinary/control, actual Browser orchestration and exact-head CI are separate from these local Gate 2 checks.
