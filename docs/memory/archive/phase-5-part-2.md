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

## STEP-358 — Repair Ubuntu portability exposed by the first closure run

**Date:** 2026-07-19
**Status:** implementation and focused regression complete; replacement closure SHA pending
**Next:** final managed local gates, one portability-fix commit, push, and exact-head CI

### Exact-head failure and root cause

The first Phase 5 publication was `d414531416f5b0c38166a1b9fcbcb714b06f36bc`. Exact-head CI run `29664071044` completed with failure only in Ubuntu Node 20/24. Windows remained green. Two platform assumptions were exposed:

- Safe read normalization used empty command-line values for configured clean/smudge filters. The Ubuntu `git status` path did not reliably treat those overrides as an absent driver and returned `GIT_CAPABILITY_UNAVAILABLE`. The override now uses the fixed shell-builtin failure sentinel `! :` with `required=false`; Git therefore performs documented no-op passthrough without invoking the repository-provided filter command.
- Managed removal rejected every entry with `nlink > 1`. POSIX directories normally have link counts above one because of directory topology, so ordinary nested task trees failed with `TASK_WORKTREE_REMOVE_UNSAFE`. Link-count rejection now applies only to regular files; symbolic links, `.git`, special files, and hard-linked files remain fail-closed.

### Focused verification

`npm run build --silent && node --test test/git-integrations-full-access.test.mjs test/task-worktree-remove.test.mjs test/phase-5-adversarial-acceptance.test.mjs` passed 11/11. Added regressions freeze the exact inert filter overrides, accept ordinary nested directory link counts, and continue to reject hard-linked files.

## STEP-359 — Re-establish final Phase 5 local closure after adversarial hardening

**Date:** 2026-07-19
**Status:** local closure complete; replacement commit, push, and exact-head CI pending
**Next:** publish the scoped replacement closure commit and require terminal exact-head success before Phase 6

### Goal and changed files

Finish the bounded Phase 5 adversarial-repair batch left after the first closure SHA, preserve the exact V1/V2/V3/V4 and security boundaries, discard invalid evidence produced while ordinary test processes overlapped, and produce fresh isolated Windows-native closure evidence.

Exact changed scope:

- Root and knowledge: `Memory.md`, `docs/memory/archive/phase-5-part-2.md`, `package.json`.
- Fixtures: `fixtures/git-v4-test-helper.mjs`, `fixtures/task-worktree-v4-helper.mjs`.
- Runtime scripts and native artifacts: `scripts/atomic-file.mjs`, `scripts/cloudflared-installer.mjs`, `scripts/codexpro.mjs`, `scripts/long-task-runner.mjs`, `scripts/owned-temp-root.d.mts`, `scripts/owned-temp-root.mjs`, `scripts/process-identity.mjs`, `scripts/run-smoke.mjs`, `scripts/smoke-platform-compat.mjs`, `scripts/test-domains.mjs`, `scripts/toolchain-manager.mjs`, `scripts/windows-native-api-inventory-v1.json`, `scripts/windows-process-host-manifest.json`, `scripts/windows-process-host-protocol-v1.json`, `scripts/windows-process-host.cs`, and `scripts/worktree-delete-control.mjs`.
- Audit, Git, policy, process, and server runtime: `src/audit/runtime.ts`, `src/audit/transactionParticipant.ts`, `src/git/admission.ts`, `src/git/commitService.ts`, `src/git/durableState.ts`, `src/git/execution.ts`, `src/git/indexService.ts`, `src/git/integrations.ts`, `src/git/mutationContext.ts`, `src/git/mutationService.ts`, `src/git/opaqueRecordStore.ts`, `src/git/readService.ts`, `src/git/repositoryIdentity.ts`, `src/git/restoreService.ts`, `src/git/reviewToken.ts`, `src/git/stashService.ts`, `src/policy/executionResources.ts`, `src/policy/integration.ts`, `src/policy/runtime.ts`, `src/process/processAuditCoordinator.ts`, `src/process/processManager.ts`, `src/process/runCommand.ts`, `src/process/windowsHostClient.ts`, `src/process/windowsHostProtocol.ts`, `src/process/windowsPersistentBackend.ts`, `src/productionRuntime.ts`, `src/server.ts`, `src/tools/schemas/codexpro.ts`, `src/tools/schemas/execution.ts`, and `src/tools/schemas/mergeTaskWorktree.ts`.
- Managed worktree runtime: `src/worktrees/candidateWorkspace.ts`, `src/worktrees/mergeExecute.ts`, `src/worktrees/mergePlanStore.ts`, `src/worktrees/mergePrepare.ts`, `src/worktrees/recovery.ts`, `src/worktrees/remove.ts`, `src/worktrees/remover.ts`, `src/worktrees/service.ts`, `src/worktrees/store.ts`, `src/worktrees/verificationReceipts.ts`, `src/worktrees/verificationTerminal.ts`, and `src/worktrees/workspaceAuthority.ts`.
- Regression and control tests: `test/atomic-file.test.mjs`, `test/codex-sessions-contract.test.mjs`, `test/git-durable-review-plan.test.mjs`, `test/git-execution-windows-control.test.mjs`, `test/git-integrations-approval.test.mjs`, `test/git-integrations-full-access.test.mjs`, `test/git-integrations-worktree.test.mjs`, `test/git-restore-v4.test.mjs`, `test/git-sha256-v4.test.mjs`, `test/git-stage-v4.test.mjs`, `test/git-stash-v4.test.mjs`, `test/git-unsupported-formats-v4.test.mjs`, `test/mutation-architecture.test.mjs`, `test/owned-temp-root.test.mjs`, `test/package-contents.test.mjs`, `test/persistent-process-production-windows-control.test.mjs`, `test/persistent-verification-receipt.test.mjs`, `test/phase-5-contract-v4.test.mjs`, `test/policy-v3-approval-integration.test.mjs`, `test/process-manager.test.mjs`, `test/task-worktree-candidate-verification.test.mjs`, `test/task-worktree-merge-execute.test.mjs`, `test/task-worktree-merge-prepare.test.mjs`, `test/task-worktree-remove.test.mjs`, `test/task-worktree-windows-locks.test.mjs`, `test/task-worktree-workspace-integration.test.mjs`, `test/test-domain-classification.test.mjs`, `test/verification-receipts.test.mjs`, `test/verification-run-command-integration.test.mjs`, `test/windows-process-host-integration-windows-control.test.mjs`, `test/windows-process-host-protocol.test.mjs`, and `test/worktree-windows-control.test.mjs`.

### Implementation and adversarial repairs

- Added identity-checked atomic JSON state writes, exact process-creation identity helpers, and marker-bound owned temporary roots with bounded stale-root recovery. Ordinary, control, toolchain, and protected Smoke launch paths now share owned child temporary state rather than relying on ambient temporary-directory cleanup.
- Hardened the CXP4 Windows native host, client, protocol, audit coordination, process lifecycle, and persistent backend around exact image/creation identity, owned Job members, bounded frames/output/deadlines, terminal audit evidence, and fail-closed close/cleanup ordering. Native source and protocol manifests remain digest-bound.
- Added managed-task repository admission, durable opaque plan/receipt/candidate records, retained reviewed candidate objects, candidate verification workspaces, terminal receipt finalization, restart recovery, exact target/task/candidate binding, and owner-bound task-worktree workspace integration. SHA-1 and SHA-256 object widths are validated explicitly; unsupported repository formats fail closed.
- Strengthened Gate X integration identity/config binding, private index/object requirements, raw candidate scans, stash/restore durability, expected-old ref/index/worktree checks, and recovery transitions without adding arbitrary Git, remote, credential, force, config-mutation, or sandbox claims. Contract V4 remains exact 51 and V1/V2/V3 remain frozen.
- Retained the STEP-358 Ubuntu repairs: configured filters use an inert non-required passthrough, and hard-link rejection applies to regular files rather than ordinary POSIX directories. Protected Smoke also canonicalizes the default Codex directory only in the exact compatibility migration layer; protected source remains unchanged.
- The apparent SHA-256 `GIT_STATE_CHANGED` closure failure was not accepted as code evidence after multiple ordinary/probe process trees were found overlapping. Only exact owned probe trees and one exact runner ID were stopped. The same SHA-256 tests passed independently on both managed majors, followed by a single clean serialized ordinary matrix. No retry loop, assertion weakening, broad process kill, or error suppression was introduced.

### Fresh verification

- Managed ordinary run `2026-07-19T13-04-21-322Z-phase5-clean-ordinary-matrix-87b14466` completed with exit code 0, empty stderr, and untruncated output. Node 20.20.2 and Node 24.15.0 each reported 1,083 tests, 1,081 pass, zero failures, and two established skips.
- Managed Windows control run `2026-07-19T13-24-53-997Z-phase5-clean-control-matrix-df959fc3` completed with exit code 0, empty stderr, and untruncated output. Each pinned major passed 113/113 with no skip.
- Protected Smoke run `2026-07-19T13-32-27-618Z-phase5-clean-smoke-matrix-2e837136` completed with exit code 0, empty stderr, and untruncated output. Both pinned majors passed analysis, analysis CLI, main, HTTP, Pro CLI, doctor, settings, and execute/watch/loop handoff sections.
- `npm run build --silent`, `npm run policy:check`, and `git diff --check` passed. Diff check emitted only established LF-to-CRLF working-copy warnings.
- Node 24 `npm pack --dry-run --json` passed after prepack build with 520 entries, package size 1,139,965 bytes, and unpacked size 6,290,212 bytes.
- Focused atomic/native/policy/package/domain inventory regression passed 44/44. A safe changed-file scan covered 95 files against six private-key/token credential shapes and emitted no match.

### Decisions, risks, rollback, and next

- Only fresh isolated runner evidence is closure evidence. Concurrent ad-hoc ordinary or probe processes are operationally invalid even if their individual paths are temporary and randomized.
- Existing truthful limitations remain: Gate X and `full_access` are ambient same-user authority, CodexPro locks do not exclude external processes, managed worktrees are workflow isolation rather than an OS sandbox, and `workspace` plus Tasks 4B1–4B6 remain deferred.
- Rollback is one revert of the pending replacement closure commit. Persistent tasks, branches, candidates, stashes, audit, and recovery data must not be deleted as part of rollback.
- Stage only the exact scope above, create one concise English replacement closure commit, push once, bind the exact 40-character SHA to CI, and require terminal success for repository policy plus Ubuntu/Windows Node 20/24 Build, complete Regression, protected Smoke, and Package before Phase 6.

## STEP-359 — Re-establish the clean Phase 5 replacement closure

**Date:** 2026-07-19
**Status:** locally complete; replacement closure commit, push, and exact-head CI remain pending
**Next:** finish the bounded scope and secret audit, publish one English Phase 5 replacement closure commit, push `main`, and require terminal exact-head success before Phase 6

### Goal and changed files

Close the remaining local evidence gaps after the first exact-head portability failure without weakening Git parsing, protected Smoke, runner ownership, or Windows-native requirements.

Changed in this step: `src/worktrees/mergePrepare.ts`, `scripts/smoke-platform-compat.mjs`, `test/git-sha256-v4.test.mjs`, `test/codex-sessions-contract.test.mjs`, `Memory.md`, and this archive. The complete replacement closure worktree also retains the previously reviewed Phase 5 repair set.

### Final adversarial repairs

- Repaired SHA-256 revision/path ambiguity. A `rev-list` history range lacked a terminating `--`; under a long Windows temporary path Git could interpret the 64-character OID range as a path and fail with `Filename too long`, which surfaced as `GIT_STATE_CHANGED`. Candidate history, object enumeration, and raw diff commands now terminate revision parsing explicitly, retain bounded OID validation, and have long-path SHA-256 regressions on both pinned Node majors.
- Repaired protected Smoke canonical-path drift without editing protected `scripts/smoke.mjs`. On this host, the lexical `%USERPROFILE%\.codex` path is a junction to `D:\Codex\home`; production configuration returns native realpath while the old Smoke expectation remained lexical. The exact fail-closed compatibility loader now canonicalizes the expected default only when it exists and otherwise preserves the lexical fallback. A contract test freezes the exact in-memory substitution.
- Discarded overlapping or stopped-run evidence rather than treating it as completion. Run `2026-07-19T12-54-56-159Z-phase5-final-ordinary-matrix-e3ae0cca` has an exact stop record and no result; it is not cited as a pass.

### Final local verification

- Managed ordinary run `2026-07-19T13-04-21-322Z-phase5-clean-ordinary-matrix-87b14466` passed Node 20.20.2 and Node 24.15.0. Each major reported 1,083 tests, 1,081 pass, zero failures, and two established skips. Exit code was 0, stderr was empty, and the 323,567-byte stdout log was not truncated.
- Managed Windows control run `2026-07-19T13-24-53-997Z-phase5-clean-control-matrix-df959fc3` passed both pinned majors. Each reported 113/113, zero failures, and zero skips. Exit code was 0, stderr was empty, and the 35,023-byte stdout log was not truncated.
- Managed protected Smoke run `2026-07-19T13-32-27-618Z-phase5-clean-smoke-matrix-2e837136` passed all eight sections on both pinned majors. Exit code was 0, stderr was empty, and neither stream was truncated.
- `npm run build`, `npm run policy:check`, `git diff --check`, and `npm pack --dry-run --json` passed on the replacement closure tree; the package contained 520 entries. The complete ordinary suite retained contract, package, mutation-inventory, and compatibility coverage.

### Decisions, risks, rollback, and next

- Phase 5 is locally green but not formally closed. Only a replacement closure SHA with terminal exact-head Ubuntu/Windows Node 20/24 Build, Regression, protected Smoke, Package, policy, and registered control success can authorize Phase 6.
- The Git fixes narrow argument interpretation; they do not add remote, credential, force, config-mutation, or arbitrary-command capability. The Smoke fix changes only the test compatibility expectation and preserves native realpath production behavior.
- Same-binary rollback remains `CODEXPRO_GIT_MODE=read`, `CODEXPRO_GIT_INTEGRATIONS=off`, or V3 projection as applicable. Rollback must not delete tasks, branches, commits, private stashes, candidates, audit, or recovery evidence.
- Do not create an evidence-only follow-up commit after CI. The exact-head run belongs to the single replacement closure SHA.
