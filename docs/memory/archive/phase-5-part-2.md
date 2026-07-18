# Phase 5 Implementation Archive — Volume 2

This append-only continuation starts after `phase-5.md` reached the configured direct-read rollover threshold. Volume 1 remains unchanged.

## STEP-356 — Gate X adversarial closure and truthful ambient authority

**Date:** 2026-07-19
**Status:** complete; final Phase 5 ordinary/static closure and publication remain pending
**Next:** STEP-357 final local closure, then one Phase 5 publication and exact-head CI

### Goal and changed files

Complete the Gate X security model requested for Phase 5C: explicit opt-in, exact executable/repository/integration identity binding, fresh exact R3 approval, and only four restricted typed Git actions. The closure must never expose a caller-selected Git command or imply that repository integrations are isolated.

Changed in this step: `src/git/execution.ts`, `src/policy/runtime.ts`, `test/phase-5-adversarial-acceptance.test.mjs`, `test/mutation-architecture.test.mjs`, `README.md`, `README_ZH.md`, `SECURITY.md`, `config.example.env`, `design.md`, the paired Phase 5 design/plan, `AGENTS.md`, `Memory.md`, the master implementation plan, and this continuation archive.

### Implementation and adversarial repairs

- Kept `CODEXPRO_GIT_INTEGRATIONS=off` as the default. `approved_full_access` still requires Contract V4, local Git mutation mode, the explicit `full_access` execution profile, exact discovered integration identities, unchanged semantic state, and a fresh exact one-use R3 grant.
- Preserved exactly four discriminated executor requests: private-index `stage`, shadow-Git-dir `commit`, quarantined object-only `merge_tree`, and private-destination `checkout_index`. No public or internal typed request accepts a Git command, subcommand, arbitrary argv, remote action, credential action, force option, or config mutation.
- Repaired a real fail-open branch: an unknown runtime `operation` previously entered the final checkout branch. `checkout_index` is now explicit and every other value returns `GIT_CAPABILITY_UNAVAILABLE` before spawn.
- Repaired two missing private-state checks. Approved `merge_tree` now rejects an absent private object directory instead of falling back to the live repository object database. Approved `checkout_index` rejects an absent private index instead of reading the live index.
- Repaired approval-card disclosure. A Gate X approval now states: ambient current-user `full_access`; no filesystem, credential, registry, network, or broker isolation; typed operation only. Public Git results already retained `execution_isolation: none` and continue to expose that limit.
- Strengthened the adversarial acceptance test to bind the exact four operation literals, explicit checkout branch, unknown-operation rejection, required private object/index state, absence of caller command fields, and exact no-isolation approval text.
- Registered the previously implemented private shadow/quarantine/hydration filesystem primitives in the fail-closed mutation architecture inventory with exact semantic call digests and reviewed purposes; no directory or filename-pattern exemption was added.
- Reconciled English/Chinese user documentation, security guidance, configuration comments, design copy rules, authoritative Phase 5 design/TDD plan, repository rules, master plan, and current memory. The documentation distinguishes typed Gate X workflow control from OS isolation and separately approved unrestricted processes.

### Failed candidate and root cause

The first managed Node 20/24 ordinary candidate, run `2026-07-18T21-41-51-460Z-phase5c-ordinary-pre-docs-c975be23`, completed with exit code 1, empty stderr, and untruncated logs. The only failing test was the mutation architecture inventory. Eight existing Phase 5B private-state writes were not yet classified: six shadow commit/quarantine operations, one stage quarantine directory, and one merge hydration directory. The implementation was valid private-state behavior; the failure correctly identified incomplete review metadata. Exact path/syscall/semantic-digest entries were added and the focused inventory passed without weakening the scanner.

### Verification

- `npm run build --silent && node --test test/phase-5-adversarial-acceptance.test.mjs test/git-integrations-approval.test.mjs test/git-integrations-full-access.test.mjs test/mutation-architecture.test.mjs test/phase-5-contract-v4.test.mjs test/phase-5-v4-audit-persistence.test.mjs test/phase-5-v4-persistence.test.mjs` passed 30/30 with zero failures.
- Managed Windows control run `2026-07-18T22-00-24-748Z-phase5c-control-final-a2fbff85` passed Node 20.20.2 and Node 24.15.0 with exit code 0. The result log was 31,886 bytes, stderr was empty, and neither stream was truncated.
- The control domain exercised exact Git executable/capsule evidence, local approval and pipe behavior, process lifecycle and Job ownership, crash/lock oracles, Windows sandbox capability truthfulness, and handle-safe task-worktree deletion.

### Risks, limitations, rollback, and next

- Approved integrations execute same-user repository programs. Exact identity binding and one-use approval detect reviewed drift but do not make sourced scripts, transitive executables, broker-created descendants, credentials, registry, files, or network safe.
- CodexPro locks coordinate only CodexPro-owned mutations. External Git or editor processes can still race; expected-old checks and revalidation fail closed rather than provide an OS-wide lock.
- Configuration rollback is `CODEXPRO_GIT_INTEGRATIONS=off`, `CODEXPRO_GIT_MODE=read`, or same-binary V3 projection. Rollback does not delete tasks, branches, commits, private stashes, candidates, recovery state, or audit.
- Final Phase 5 ordinary/static/Smoke/package gates remain mandatory. After they pass, publish the complete Phase 5 batch once and require terminal exact-head CI before Phase 6.

## STEP-357 — Complete the Phase 5 local closure candidate

**Date:** 2026-07-19
**Status:** locally complete; not yet staged, committed, pushed, or exact-head verified
**Next:** scoped Phase 5 publication, then closure-SHA exact-head CI

### Final verification

- Managed ordinary run `2026-07-18T22-25-18-928Z-phase5c-ordinary-final-7783f2dd` passed Node 20.20.2 and Node 24.15.0. Each major reported 1,015 tests, 1,014 pass, zero failures, and one established skip. Exit code was 0, stderr was empty, and the 303,203-byte stdout log was not truncated.
- Managed Windows control run `2026-07-18T22-00-24-748Z-phase5c-control-final-a2fbff85` passed both pinned majors with exit code 0, empty stderr, and complete logs.
- Protected complete Smoke run `2026-07-18T22-19-07-774Z-phase5c-smoke-final-node-3da83ad4` passed all eight sections with exit code 0, empty stderr, and no truncation. The fixed Node plus `npm-cli.js` launch avoided the connector-hostile Windows `npm` shim; an earlier direct invocation returned a connector 502 and produced no valid completion evidence.
- `npm run build`, `npm run policy:check`, and `git diff --check` passed. Diff check emitted only established LF-to-CRLF working-copy warnings.
- `npm pack --dry-run --json` passed with 509 package entries; the package inventory tests remained part of the managed ordinary matrix.
- Focused Gate X/V4/audit/mutation tests passed 30/30 after the fail-closed repairs.

### Closure boundary

The complete Phase 5 workspace is now the local closure candidate. Publication must be one scoped English commit and one push. Phase 5 is not formally closed, and Phase 6 must not begin, until the exact 40-character closure SHA reaches terminal success in repository policy and the Ubuntu/Windows Node 20/24 Build, Regression, protected Smoke, and Package matrix. No evidence-only follow-up commit may be created solely to record that CI run.
