# CodexPro Interphase Maintenance Archive — Part 2

This append-only archive records maintenance after Phase 5 formally closed and before Phase 6 begins. Phase-specific implementation history remains in the Phase 5 archives.

## 2026-07-19 — STEP-363: Add automatic owned-temporary-state and run-evidence cleanup

**Status:** Completed locally; unstaged and uncommitted

**Goal:** Ensure supported focused tests, arbitrary local tasks, detached tasks, and smoke/regression launchers clean their exact CodexPro-owned temporary state after completion, while bounding ignored `.ai-bridge/runs` evidence without deleting unrelated system temporary files or persistent CodexPro state.

**Phase 5 closure antecedent:**

- Phase 5 formally closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e`.
- Exact-head CI run `29698209894` completed successfully for Classify changes, Repository policy, Ubuntu Node 20/24, and Windows Node 20/24. Every runtime job passed Build, authoritative complete Regression, protected Smoke, and Package.
- This closure fact is recorded now because a separate evidence-only commit was intentionally prohibited after the successful exact-head run.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `README.md`
- `README_ZH.md`
- `package.json`
- `scripts/long-task-runner.mjs`
- `scripts/owned-temp-root.mjs`
- `scripts/run-with-cleanup.mjs`
- `test/mutation-architecture.test.mjs`
- `test/owned-temp-root.test.mjs`
- `test/package-contents.test.mjs`
- `test/task-cleanup-lifecycle.test.mjs`
- `docs/memory/archive/interphase-maintenance-part-2.md`

**Implementation summary:**

- Added `scripts/run-with-cleanup.mjs`, exposed as `npm run task:run -- <command...>` and `npm run test:focused -- <files...>`. It creates one exact marked owned temporary root, redirects `TEMP`, `TMP`, and `TMPDIR` to its child directory, preserves the child exit status, and removes the complete owned tree after success or failure.
- The wrapper handles catchable `SIGINT`/`SIGTERM`, forwards the signal, applies a bounded five-second force fallback, and still executes cleanup. Windows `TerminateProcess`-style forced termination cannot execute JavaScript `finally`; the existing marker/PID/process-creation sweep recovers that exact dead-owner root on the next supported task or `task:cleanup`.
- Detached tasks now use the same owned temporary environment. Temporary cleanup completes before terminal `result.json` publication; cleanup failure turns an otherwise successful task into failure and is recorded as `TASK_TEMP_CLEANUP_FAILED`.
- Added automatic terminal run-evidence retention. Defaults are newest 20 terminal runs and at most 14 days. `--retention-count` and `--retention-days` override the bounds. Running/stale runs are never removed.
- Added exact terminal-run pruning with direct-child containment, canonical-path checks, directory identity revalidation for schema 2, terminal-record validation, a private prune claim, bounded Windows removal retries, and recovery of a verified claim left by interruption.
- Added bounded legacy schema-1 run cleanup. Because schema 1 predates stored directory identity, deletion is allowed only inside the explicitly selected runner root after direct-child, non-link, canonical-path, stable-current-identity, and matching terminal JSON validation.
- Added `npm run task:cleanup`. It sweeps only exact `codexpro-owned-v1-*` roots with valid ownership markers and dead owners under the selected OS temporary base, then applies terminal run-evidence retention. It exits nonzero when validation or deletion is incomplete and does not delete unmarked temporary entries, managed task worktrees, candidates, recovery state, credentials, audit state, or managed Node toolchains.
- Nested supported launchers propagate one canonical `CODEXPRO_OWNED_TEMP_BASE` and create sibling owned roots under that base instead of recursively nesting under each parent `child-temp`. This avoids Windows path-length amplification while preserving independent markers and cleanup.
- Wrapper and runner options are parsed only before their command separator, preventing child arguments such as `--purpose` or `--retention-count` from overriding cleanup policy.

**TDD and verification:**

- Initial red suite proved four missing behaviors: no generic cleanup runner, detached tasks inherited ambient TEMP, terminal run evidence was unbounded, and package scripts exposed no cleanup-backed focused-test/task entry.
- `test/task-cleanup-lifecycle.test.mjs` now covers success, nonzero exit, catchable termination, Windows forced-termination recovery, detached task cleanup before terminal publication, count retention, legacy terminal cleanup, interrupted prune-claim recovery, exact stale-owned-root cleanup, preservation of unrelated temporary data, and package command contracts.
- The first complete ordinary run exposed recursive owned-TEMP nesting: detached runner → ordinary launcher → test fixture. Windows then failed local-control compilation and Git object writes with path-length errors. A red regression was added, nested launchers were changed to create sibling roots under one canonical base, and the exact affected approval/CLI/export tests passed 35/35.
- Final adversarial managed Node 20.20.2 and Node 24.15.0 focused matrix run `2026-07-19T19-49-04-795Z-interphase-cleanup-adversarial-focused-38f5ac3f` passed 61/61 on each major across cleanup lifecycle, owned-temp security and nesting, runner identity/log bounds, package contents, test-domain classification, mutation inventory, approval/CLI, and export context. The runner reported `invalid=0` and removed its dedicated temporary state.
- Final managed Node 20/24 ordinary run `2026-07-19T19-18-17-116Z-interphase-cleanup-ordinary-final-2-d1a614a7` passed on each major at 1,096 tests, 1,094 pass, zero failures, and two established skips. Its dedicated temporary state was removed before terminal publication.
- The first retention-enabled ordinary completion removed 157 obsolete terminal run directories with zero failures. The final explicit `task:cleanup` scan found zero owned temporary roots, retained exactly 20 terminal runs, and reported zero invalid paths, failed deletions, or interrupted prune claims.
- Mutation architecture passed after adding exact reviewed classifications for the four new terminal-evidence `rename`/`rm` primitives; no directory exemption was added.
- Final adversarial review found and repaired a same-root evidence-confusion case: malformed legacy metadata could name a different terminal run directory. Run metadata, result, and stop records are now bound to their containing directory name; malformed states are preserved, counted as `invalid`, and make explicit cleanup return nonzero. The regression failed before the fix and passed afterward on both managed Node majors.
- Final TypeScript build, repository policy, `git diff --check`, and package dry-run passed. The package contains 521 entries, includes `scripts/run-with-cleanup.mjs`, and excludes internal memory archives.

**Decisions and safety boundary:**

- Automatic cleanup applies only to ephemeral owned temporary roots and verified terminal run evidence. Persistent task/worktree/candidate/recovery/audit/toolchain data is not reclassified as temporary.
- Raw direct `node --test` or arbitrary commands launched outside the supported wrappers cannot be intercepted. Project rules now require `npm run test:focused -- <files...>` and `npm run task:run -- <command...>` for cleanup-backed local work.
- Unmarked entries under `%LOCALAPPDATA%\Temp` are never deleted, even when their names contain `codexpro`; ownership requires the exact prefix, marker, path, identity, and dead-owner checks.
- Retention cleanup is best-effort and reported. It does not convert the child task result into failure; exact owned temporary-state cleanup does, because a supposedly completed task must not silently leave its dedicated temporary tree.

**Risks and limitations:**

- A same-user process can still create or hold files in account-readable temporary locations. Marker and identity checks prevent CodexPro from deleting unrelated paths; they are not an OS sandbox.
- A forcibly terminated Windows wrapper cannot synchronously run cleanup. Recovery occurs on the next supported launch or explicit `task:cleanup`.
- Stale or malformed runner directories that cannot pass terminal/identity/path validation are preserved and reported rather than deleted.
- Current changes are unstaged and uncommitted. No Git push or exact-head CI has been requested for this interphase maintenance yet.

**Rollback method:**

- Revert the files listed above and remove this new archive file.
- Rollback must not delete user temporary files, managed task worktrees, candidates, recovery state, credentials, audit state, run evidence outside the configured retention target, or managed toolchains.

**Next step:** Keep the reviewed change unstaged and uncommitted unless the user explicitly requests publication. Do not start Phase 6 or push this interphase runtime change without a new explicit action.

## 2026-07-19 — STEP-364: Reconcile documentation, memory, and project rules after cleanup implementation

**Status:** Completed locally; unstaged and uncommitted

**Goal:** Apply the `neat-freak` workflow after STEP-363 so active rules, developer guidance, security boundaries, user documentation, changelog, and project memory describe one consistent cleanup lifecycle without duplicating implementation history.

**Files changed:**

- `AGENTS.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `Memory.md`
- `README_ZH.md`
- `SECURITY.md`
- `docs/memory/archive/interphase-maintenance-part-2.md`

**Reconciliation:**

- Generalized the memory rule from one fixed interphase archive filename to the current interphase maintenance archive, so numbered continuation volumes remain valid.
- Kept the exact repository-policy markers while compressing operational, Phase 4, and Phase 5 rules; `AGENTS.md` remains a rule manual rather than a STEP-363 change log.
- Reduced `Memory.md` by graduating detailed Phase 4/5 and verification mechanics back to their archives, corrected both Phase 5 archive labels to closed, and retained only current constraints, final evidence, open actions, and recent summaries.
- Added the cleanup lifecycle to `CHANGELOG.md` and contributor setup/checklist guidance. Moved the Chinese cleanup commands into a dedicated `开发` section to match their developer-only scope.
- Added an explicit security failure-mode row: automatic cleanup requires exact prefix, marker, direct-child path, directory identity, and dead-owner evidence; malformed or unmarked state is preserved and incomplete cleanup returns nonzero.
- Left `README.md` unchanged during this reconciliation because STEP-363 already contains the complete English usage and safety boundary.

**Verification:**

- `npm run policy:check`: passed after restoring the two exact policy markers required in `AGENTS.md`.
- `node --test test/auth-documentation.test.mjs test/package-contents.test.mjs test/operational-reliability.test.mjs`: 15/15 passed.
- `git diff --check`: passed; only the repository's expected Windows LF-to-CRLF warnings were emitted.
- Relative-link audit passed for 117 tracked/current Markdown files with zero missing local targets. The active-document relative-time scan returned zero matches after replacing an ambiguous Chinese “最近 20” phrase with a fixed completion-order description.
- Final size check: `AGENTS.md` 200 lines / 15,341 bytes and `Memory.md` 121 lines / 15,491 bytes. Both remain below their hard limits, `Memory.md` is below its practical target, the active archive is below its volume threshold, and the documentation tree remains larger than the memory tree.
- Intended-file review confirmed that STEP-364 modifies only rules, documentation, changelog, security guidance, memory, and this archive; STEP-363 runtime/test changes remain separate and unchanged by the reconciliation.

**Decisions and scope:**

- STEP-364 changes documentation and memory only. It does not alter STEP-363 runtime behavior, package scripts, retention defaults, ownership validation, or cleanup authority.
- The completed STEP-363 Node 20/24 focused and ordinary evidence remains valid; repeating the complete runtime matrix for documentation-only reconciliation would violate the standing impact-scoped verification rule.
- Historical phase archives remain append-only. Stale intermediate statuses inside closed entries were not rewritten; current truth is expressed by the closure record, closed archive labels, and this new reconciliation entry.

**Risks and rollback:**

- Documentation can still drift if future cleanup changes bypass the cleanup-backed commands or omit the changelog/security surfaces.
- Rollback is a documentation-only revert of the files listed above. It must not alter temporary directories, run evidence, worktrees, credentials, audit state, managed toolchains, commits, or remote state.

**Next step:** Keep STEP-363 and STEP-364 unstaged, uncommitted, and unpushed until the user explicitly requests publication. Do not start Phase 6 as part of documentation cleanup.


## 2026-07-20 — STEP-365: Correct canonical project identity to CodexGPT

**Status:** Implemented on the dedicated rename branch; pending pull-request exact-head CI.

**Goal:** Correct the repository-wide canonical identity from the previous CodexPro naming to CodexGPT without silently rewriting append-only historical records.

**Files changed:** All tracked active text surfaces containing the previous name, plus every active tracked filename containing it. Historical files below `docs/memory/archive/` remain byte-preserved except for this appended correction entry.

**Implementation summary:**

- Renamed the npm package, executable commands, environment-variable namespace, local state and temporary prefixes, MCP tool names, source modules, test files, documentation filenames, URLs, labels, and user-facing instructions to CodexGPT.
- Renamed active tracked paths atomically with `git mv`, then updated all active textual references so imports, scripts, contracts, fixtures, and documentation remain aligned.
- Added an active-tree residual-name gate and retained complete Ubuntu/Windows Node 20/24 pull-request CI as the publication gate.
- This is an intentional breaking identity migration. Existing package names, commands, variables, profile/state directories, and cached MCP descriptors must be recreated or migrated under the CodexGPT namespace.

**Verification:**

- Generation automation passed UTF-8 residual scanning and TypeScript build before committing the branch change.
- Pull-request CI must pass Repository policy and the Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package matrix; diff integrity is repaired and rechecked on the materialized branch before merge.

**Risks and limitations:**

- The canonical rename intentionally breaks consumers that still invoke the previous npm package, binaries, environment variables, state paths, or MCP tool names.
- The local checkout directory itself is outside repository version control and is not renamed by this GitHub change.
- Historical archive entries retain the name that was accurate when those entries were written; this correction entry is the authoritative transition record.

**Rollback:** Revert the STEP-365 commit. Do not partially restore mixed namespaces.

**Next step:** Require the complete runtime matrix, repair only concrete rename regressions, and merge after exact-head success.


**Adversarial verification addendum:**

- The materialized branch exposed rename-induced integrity drift rather than runtime feature drift: three manifest-bound native-host file hashes, one semantic native-API inventory digest, and six exact mutation-review call digests changed because the canonical namespace changed inside reviewed source strings.
- Updated only those derived authorities after inspecting each affected source operation. Repository policy then passed, and the focused naming/authentication/package/operational/native-host/mutation suite passed 63/63.
- Active tracked paths and UTF-8 text outside append-only archives contain no residual previous project identifier. `git diff --check`, TypeScript build, isolated settings Smoke, and the 521-entry `codexgpt@0.28.6` package dry-run passed.
- A combined local Smoke run passed analysis, analysis CLI, protected main, HTTP, Pro CLI, and doctor components before one settings runtime-status timeout. The isolated settings Smoke immediately passed; the complete exact-head CI matrix remains required to distinguish local timing noise from a portable defect.
- The first final-head Ubuntu Node 24 regression exposed only frozen V1 descriptor/call hashes and protected Smoke source hashes that still represented the previous namespace. Updated those exact hashes from observed canonical CodexGPT descriptors, normalized server-config payloads, and LF-normalized protected sources; tool names, counts, envelopes, and runtime behavior remained unchanged.


## 2026-07-20 — STEP-366: Remove mutable Gate X commands from the private integration config

**Status:** Implemented in an isolated exact-merge worktree; pending pull-request exact-head CI.

**Goal:** Repair CI run 113 and make Gate X immutable integration execution structural rather than dependent on Git configuration precedence.

**Files changed:** `src/git/integrations.ts`, `test/git-integrations-full-access.test.mjs`, `test/mutation-architecture.test.mjs`, `Memory.md`, and this archive.

**Implementation summary:**

- CI run 113 initially failed only Ubuntu Node 20 in `Gate X executes an immutable integration snapshot across final revalidation and spawn`: the marker observed both the reviewed snapshot and the subsequently drifted repository script. The failed job rerun passed, proving intermittency but not eliminating the unsafe state.
- Root cause: Gate X copied the repository's complete local Git config into its private Git directory and also supplied reviewed snapshot commands through command-line configuration overrides. The private execution therefore retained the original mutable command and the snapshot command for the same key, relying on precedence instead of removing the unreviewed execution path.
- Gate X now removes each discovered executable integration command key and the inherited `core.hooksPath` key from the private config using bounded Git config operations, verifies every key is absent, and then exposes only the materialized reviewed command or private hook snapshot.
- Advanced the internal integration implementation revision so previously minted durable review facts fail closed after this execution-bundle change.
- Strengthened the regression to assert the mutable command is absent from the private config before the original script is changed and approved execution begins. Updated the exact mutation-review digest for the changed private-config write.

**Verification:**

- The strengthened regression failed against the original implementation because `filter.snapshot.clean` was still present in the private config.
- `npm run build` passed.
- `npm run test:focused -- test/git-integrations-full-access.test.mjs` passed 10/10.
- The exact formerly failing immutable-snapshot test passed five consecutive isolated runs.
- `npm run test:focused -- test/git-integrations-approval.test.mjs test/git-integrations-full-access.test.mjs test/mutation-architecture.test.mjs` passed 17/17.
- `npm run test:focused -- test/git-integrations-worktree.test.mjs` passed 4/4; `npm run test:focused -- test/git-sha256-v4.test.mjs` passed 2/2.
- `npm run policy:check` and `git diff --check` passed.
- GitHub Actions run 113 attempt 2 passed the rerun Ubuntu Node 20 job and completed successfully; a new exact-head runtime matrix remains required for this code change.

**Risks and limitations:**

- The private config intentionally retains reviewed non-command Git configuration facts; only executable integration keys and inherited hooks-path selection are removed and replaced by immutable materialized equivalents.
- This remains ambient `full_access` execution under the current user and does not create OS isolation.
- The additional bounded Git config operations can fail closed if the private config cannot be normalized or verified.

**Rollback:** Revert STEP-366 as one unit. Do not retain the strengthened test while restoring duplicate executable keys, and do not restore the previous implementation revision independently.

**Next step:** Publish the focused repair through a dedicated pull request and require Repository policy plus the complete Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package matrix before merge.
