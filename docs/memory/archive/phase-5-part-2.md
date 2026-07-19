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

## STEP-360 — Repair the failed Phase 5 exact-head closure

**Date:** 2026-07-19
**Status:** local closure complete; replacement commit, push, and terminal exact-head success pending
**Next:** publish this bounded repair once and require its exact 40-character SHA to pass the complete CI matrix before Phase 6

The earlier duplicate `STEP-359` headings remain unchanged because this archive is append-only. Sequence resumes here at `STEP-360`.

### Goal and changed files

Repair the exact causes exposed by head `cc0ed18c6ee547d09eee4dcad10fd61918a2f9ab` and CI run `29690457396` without narrowing authoritative coverage or weakening the Phase 5 safe Git, process-identity, worktree-recovery, and no-sandbox boundaries.

Changed files: `.github/workflows/ci.yml`, `fixtures/git-v4-test-helper.mjs`, `scripts/long-task-runner.mjs`, `test/persistent-verification-receipt.test.mjs`, `test/task-worktree-remove.test.mjs`, `test/verification-run-command-integration.test.mjs`, `Memory.md`, and this archive.

### Root causes and implementation

- Reverted the invalid `cc0ed18` workflow reduction. Ubuntu and Windows CI again run the authoritative `test-domains.mjs --domain all` suite through the bounded summary wrapper; the fail-closed workflow contract remains unchanged.
- Repaired the Gate X fixture boundary. Safe fixture Git calls had inherited repository `core.hooksPath`, so a post-commit safe `git status` could execute `post-index-change` on Ubuntu. The fixture now supplies a private empty hooks directory for every safe call; reviewed Gate X execution still uses only the separately snapshotted approved hooks path.
- Repaired platform-neutral verification tests. Pure logic tests had passed POSIX `process.execPath` into the Windows-host command compiler, which correctly rejected it as `BACKEND_STALE`. They now use one consistent synthetic Windows executable identity while retaining mocked host execution and exact resource binding.
- Repaired POSIX removal fault injection. POSIX `rename` may replace an empty directory, unlike Windows. The rollback destinations are now deliberately non-empty, making second-quarantine and rollback failure deterministic on both platforms without changing production removal semantics.
- Repaired the detached-runner terminal publication race. When exact worker metadata/evidence match but the process exits immediately before the atomic result or stop record becomes visible, status waits for a bounded one-second publication window. A record produces the correct terminal state; absence after the bound remains `stale`. Forged or mismatched evidence receives no grace.

### Verification

- Focused build and regression passed 31/31 across CI workflow, Gate X, verification receipts, worktree removal, and runner bounds. `runner-log-bounds.test.mjs` then passed ten consecutive independent probes.
- Managed ordinary run `2026-07-19T15-28-34-729Z-phase5-closure-ordinary-a9c82872` completed with exit code 0, empty stderr, and 323,602 bytes of untruncated stdout. Node 20.20.2 and Node 24.15.0 each reported 1,083 tests, 1,081 pass, zero failures, and two established skips.
- Managed Windows control run `2026-07-19T15-50-53-099Z-phase5-closure-control-a95d827c` completed with exit code 0, empty stderr, and 35,037 bytes of untruncated stdout. Each pinned major passed 113/113 with zero skips.
- Managed protected Smoke run `2026-07-19T15-59-05-136Z-phase5-closure-smoke-84c49ddf` completed with exit code 0, empty stderr, and untruncated output. Both majors passed analysis, analysis CLI, main, HTTP, Pro CLI, doctor, settings, and execute/watch/loop handoff.
- `npm run build --silent`, `npm run policy:check`, and `git diff --check` passed. Focused mutation/package/domain/operational inventory passed 18/18. `npm pack --dry-run --json` passed with 520 entries, package size 1,140,057 bytes, and unpacked size 6,290,883 bytes.
- Independent reviewer automation was attempted after the usable result existed. The Windows connector returned 502 and local Codex review was blocked by revoked authentication before producing findings. Two separate manual adversarial passes then checked security/cross-platform semantics and CI/runner reliability. No additional P0 or P1 issue remained; production `NUL` hooks handling is confined to the verified Windows-only executor, while the cross-platform fixture now uses a private empty directory.

### Decisions, risks, rollback, and next

- Full `all` remains the isolated CI authority. `ordinary` is only the connector-safe local domain; it must never replace complete CI regression.
- The one-second runner grace recognizes only an already authenticated worker whose terminal record is racing publication. It does not extend ownership, preserve a dead worker as running, or accept mismatched evidence.
- Gate X and `full_access` remain ambient same-user authority with no filesystem, credential, registry, network, or broker isolation. Managed worktrees remain workflow isolation, not an OS sandbox. Tasks 4B1–4B6 and `workspace` remain deferred.
- Rollback is one revert of the pending STEP-360 closure commit. Rollback must not delete tasks, branches, commits, private stashes, candidates, audit, recovery data, or the managed Node toolchains.
- Stage only the exact changed scope, create one concise English commit, push `main` once, and bind the exact resulting SHA to CI. Do not create a later evidence-only commit solely to record a successful run.

## STEP-361 — Promote the complete Gate X object closure

**Date:** 2026-07-19
**Status:** local closure complete; final commit, push, and terminal exact-head success pending
**Next:** stage the exact STEP-361 scope, commit once, push `main`, and require the resulting 40-character SHA to pass the complete exact-head CI matrix before Phase 6

### Goal and changed files

Close the remaining Gate X integrity defect exposed only by authoritative Ubuntu Node 20/24 CI. The approved stage boundary must not install a private index, mint an index token, or allow a later shadow commit unless every new Git object referenced by that index is already present and valid in the live object database.

Changed files in the final local closure tree: `src/git/objectQuarantine.ts`, `src/git/indexService.ts`, `test/git-object-quarantine.test.mjs`, `test/git-integrations-full-access.test.mjs`, `Memory.md`, and this archive. The bounded diagnostic fixture is already published in `1c6c415c58cf663443240417b2a59198b991659a`; no new diagnostic surface is added by STEP-361.

### Exact-head failures and bounded diagnosis

- Commit `e54d55d53f76e6632cec7455ec1c0e23f96f96c9` (`fix: close Phase 5 cross-platform gates`) restored authoritative Ubuntu `all` coverage and repaired the first cross-platform defects. Exact-head run `29694450602` completed with failure because Ubuntu Node 20 and Node 24 still failed the same Gate X integration test. The public failure remained collapsed to `GIT_CAPABILITY_UNAVAILABLE`, so the underlying Git error was not yet observable.
- Commit `1c6c415c58cf663443240417b2a59198b991659a` (`test: expose bounded Git failure context`) added failure-only fixture diagnostics containing the final safe Git argv, exit status, and at most 512 bytes of stderr. It records no environment, token, credential, or file content. Exact-head run `29694656908` completed with failure and exposed, on both Ubuntu majors, safe `git status --porcelain=v2 -z --branch --untracked-files=all --ignored=matching`, status 128, and `error: bad tree object HEAD`.

### Root cause

The defect was not a hook problem. Approved Gate X staging uses a private index plus a service-owned quarantine object directory so reviewed clean filters and `write-tree` cannot mutate the live object database directly. A clean filter can create a new blob, and `write-tree` can create new tree objects while also caching the resulting tree OID in the private index. The previous implementation scanned and promoted only selected blob OIDs. It then installed the private index and deleted the quarantine.

That sequence left the private index's cache-tree OID referring to a tree object that no longer existed. A later shadow commit could reference the missing tree; after the reviewed ref update, the live `HEAD` named a commit whose tree could not be read. The next safe status refresh therefore failed with `bad tree object HEAD`. Windows local runs did not reliably expose the defect because object reuse and cache-tree behavior differed; Ubuntu Node 20/24 reproduced it deterministically.

### Implementation

- Added `GitObjectQuarantine.promoteAll()`. It enumerates only the service-owned quarantine root and accepts only the canonical loose-object layout: a two-character lower-case hexadecimal directory and a 38-character SHA-1 or 62-character SHA-256 lower-case hexadecimal suffix.
- Enumeration fails closed on unexpected root entries such as `pack`, `info`, files, symlinks, junction-like non-directories, malformed names, or nested layout. Prefix fan-out is bounded to 256 directories and object fan-out to 4,096 objects.
- Every enumerated object is passed through the existing immutable promotion path. That path revalidates lexical containment, direct directory layout, directory and file type, symlink rejection, hard-link count 1, per-object compressed size, total compressed size, bounded inflation, Git object type/header, declared payload length, and SHA-1/SHA-256 content hash. Individual compressed objects remain bounded to 64 MiB, inflated objects to 128 MiB, and the promoted compressed total to 128 MiB.
- Approved stage still completes selected-path, blob-secret, index, tree, workspace-path, and HEAD checks first. It then promotes the complete verified quarantine loose-object set and executes `git cat-file -e <newTreeOid>^{tree}` against the live object database.
- Only after that live-tree proof succeeds does the code enter the existing final hook/state/index revalidation, atomically install the prepared private index, and mint the index token. Object promotion alone grants no ref, commit, or caller-selected command authority.
- The repair does not add remote, credential, force, config mutation, or arbitrary Git command support. Gate X still exposes only private-index stage, shadow-Git-dir commit, object-only merge, and private-destination checkout; the child remains ambient same-user `full_access` with `execution_isolation: none`.

### TDD and adversarial review

- Added the regression assertion `approved stage must promote the complete new tree before deleting quarantine`. Before the implementation change, the assertion observed status 128 for `cat-file -e <newTreeOid>^{tree}`; after the repair it passes.
- Added direct quarantine tests proving complete discovery/promotion of multiple loose objects and fail-closed rejection of an unexpected object-store directory.
- Security review checked path containment, canonical layout, symlink/junction escape, mutable hard links, object-count and byte fan-out, SHA-1/SHA-256 verification, quarantine-bound enumeration, index-install ordering, and the distinction between immutable object availability and ref authority.
- An extra valid but unreferenced loose object can at most become a bounded unreachable immutable object; it receives no commit or ref authority. Objects outside the service-owned quarantine are never inventoried or promoted.
- External reviewer automation did not produce findings: the Windows CodexPro connector returned 502, the local Codex CLI refresh token was revoked, and the Ubuntu connector exposed no executable reviewer action. Two independent manual adversarial passes reviewed security/cross-platform semantics and closure/CI ordering. No new P0 or P1 issue was found; this record does not claim an external agent passed.

### Final local verification

- Focused Gate X/quarantine/stage/mutation inventory command passed 26/26: `node --test test/git-object-quarantine.test.mjs test/git-integrations-full-access.test.mjs test/git-stage-v4.test.mjs test/mutation-architecture.test.mjs`. Package inventory passed 2/2 with `node --test test/package-contents.test.mjs`, for a combined focused result of 28/28.
- SHA-256/quarantine/unsupported-format command passed 10/10: `node --test test/git-sha256-v4.test.mjs test/git-object-quarantine.test.mjs test/git-unsupported-formats-v4.test.mjs`.
- The authoritative `all` inventory contains 187 test files. `node --test test/test-domain-classification.test.mjs` passed 3/3 and proved the discovered inventory is exactly partitioned into ordinary and frozen control domains. `node --test test/mutation-architecture.test.mjs` passed 5/5.
- Managed ordinary run `2026-07-19T16-32-01-786Z-phase5-tree-closure-ordinary-f62b8663` completed with exit code 0, empty stderr, 324,027 bytes of untruncated stdout, and no dropped bytes. Node 20.20.2 and Node 24.15.0 each reported 1,085 tests, 1,083 pass, zero failures, and two established skips.
- Managed Windows control run `2026-07-19T16-49-25-336Z-phase5-tree-closure-control-4a81dab8` completed with exit code 0, empty stderr, 35,011 bytes of untruncated stdout, and no dropped bytes. Each pinned major passed 113/113 with zero failures and zero skips.
- Managed protected Smoke run `2026-07-19T16-55-58-312Z-phase5-tree-closure-smoke-954de9da` completed with exit code 0, empty stderr, and 606 bytes of untruncated stdout. Both majors passed analysis, analysis CLI, main Smoke, HTTP, Pro CLI, doctor, settings, and execute/watch/loop handoff.
- `npm run build` passed. `npm run policy:check` reported `Repository operational policy: PASS`. `git diff --check` exited successfully with only the configured LF-to-CRLF worktree warnings. `npm pack --dry-run --json` passed with 520 entries.
- The added-line secret-shape scan found zero new matches. A full-current-file scan identified two established secret-shaped fixtures/patterns in `src/git/indexService.ts` and `test/git-integrations-full-access.test.mjs`; the same files were already flagged at `HEAD`, so STEP-361 introduced no secret-shaped value. `.ai-bridge/runs` remains ignored by `.gitignore` and no run evidence is in the intended commit scope.

### Decisions, risks, rollback, and next

- Stage-time object closure is a prerequisite for index installation, not a post-commit repair. Deferring promotion until commit would preserve a bad index token and violate fail-closed ordering.
- Promotion is deliberately limited to verified loose objects created under the service-owned quarantine. Supporting packfiles or arbitrary object-directory shapes would add unnecessary parser and authority surface and is rejected.
- The 4,096-object and 128 MiB compressed-total bounds prevent unbounded fan-out. Repositories whose reviewed stage exceeds these limits fail closed and require a narrower operation; no silent fallback exists.
- Existing same-user authority limitations remain. Gate X, clean filters, signing helpers, and `full_access` are not filesystem, credential, registry, network, or broker isolation. Managed worktrees remain workflow isolation, not a sandbox. Tasks 4B1–4B6 and `workspace` remain deferred.
- Rollback is one revert of the pending STEP-361 closure commit. Rollback must not delete tasks, branches, commits, private stashes, candidates, audit, recovery data, or managed Node toolchains.
- The final closure SHA does not exist until the exact scope is committed. After one push, bind only that complete 40-character SHA to CI and require terminal success for Classify changes, Repository policy, Ubuntu Node 20/24, and Windows Node 20/24, with Build, authoritative complete Regression, protected Smoke, and Package in every runtime job. Do not create a later memory/evidence-only commit.
