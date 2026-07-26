# Interphase Maintenance Archive — Part 5

This append-only volume continues interphase maintenance after the closed Part 4 volume.

## 2026-07-22 — STEP-385: Keep the initial worker lease observational

**Status:** Implementation and complete local verification finished; commit, push, and replacement exact-head CI remain pending. Phase 6 remains frozen.

**Goal:** Prevent a persistent failure to publish the first `running` worker lease from aborting the detached worker after identity evidence is available but before the real task, cleanup, retention, and authoritative `result.json` publication can complete.

**Files changed:**

- `CHANGELOG.md`
- `Memory.md`
- `docs/memory/archive/interphase-maintenance-part-5.md`
- `scripts/long-task-runner.mjs`
- `test/task-cleanup-lifecycle.test.mjs`

**Failure evidence:**

- STEP-384 was published as `c917a6bdb1c0dceddf62ba23bbf01d4bae9cfd53` and exact-head run `29913227391` passed Repository policy, Ubuntu Node 20/24, and Windows Node 24.
- Windows Node 20 alone failed `worker evidence mismatch makes a live PID stale and never blocks a same-kind retry` and `worker finalization remains observable through an exact lease or authoritative result`.
- The worker published `worker-evidence.json`, then still awaited the first `publishWorkerLease("running")` as a mandatory operation. A persistent Windows replacement-sharing conflict could therefore terminate the worker before spawning the child or publishing `result.json`.
- Later renewable and `finalizing` lease writes were already observational. The first write was the sole remaining semantic inconsistency.

**Implementation:**

- Changed the initial `running` lease publication to swallow its write failure exactly like later observational lease writes.
- The real child task still starts, owned temporary state still cleans up, logs and retention still complete, and `result.json` remains the authoritative terminal evidence.
- The 60-second lease duration, 15-second renewal interval, bounded Windows rename retry set and budget, stale classification, worker identity verification, stop authority, cleanup order, retention order, and result publication order are unchanged.
- No Node-version branch, CI-only path, timeout extension, test skip, early `completed` publication, or stale-as-running behavior was introduced.

**Deterministic regression:**

- Added a direct worker integration test that pre-creates `worker-lease.json` as a directory, permanently blocking every atomic lease replacement rather than relying on CI timing.
- The test proves `worker-evidence.json` is published first, then waits for a child-created marker to prove the child task actually started while the worker remains alive.
- The child is released with exit code `7`; the worker must publish `result.json` with that exact task exit code, `signal: null`, `error: null`, and cleaned temporary state.
- The test also proves the blocked lease path remains a directory, so success cannot come from a later lease write unexpectedly recovering.
- Before the production fix, the regression failed because the evidence existed but the child marker never appeared. After the fix, it passed.

**Verification:**

- Pre-fix TDD run: `npm run test:focused -- test/task-cleanup-lifecycle.test.mjs` produced 15 passes and the new deterministic failure.
- Current-runtime affected suites: `npm run test:focused -- test/task-cleanup-lifecycle.test.mjs test/runner-process-identity.test.mjs test/atomic-file.test.mjs` passed 27/27.
- Verified Node `v20.20.2` and Node `v24.15.0` each passed those same 27 tests and the five-test mutation inventory, for 32/32 affected tests per major.
- TypeScript build passed on both verified Node majors.
- `npm run policy:check` passed.
- `npm pack --dry-run --json` retained 529 package entries.
- `git diff --check` passed.
- Exact detached ordinary run `2026-07-22T11-19-34-671Z-step385-initial-lease-observational-ordinary-34b24faa` completed with exit code 0, cleaned temporary state, no retention failures, complete untruncated stdout, and zero stderr.
- Node 20 passed 1,109 of 1,111 tests with zero failures and two established skips. Node 24 produced the same counts.
- During terminal publication, exact status moved from `worker_lease_active` to `terminal_publication_in_progress` and then to authoritative `result_recorded`, preserving the intended ordering.

**Adversarial review:**

- A lease remains non-authorizing. Suppressing its write error cannot grant stop, deletion, workspace, or process authority.
- A missing lease does not change exact identity checks or stale classification; it only prevents an observational write failure from becoming the task outcome.
- The permanent directory blocker exercises initial, renewal, and finalizing lease failures. The exact task exit code proves no lease error is misreported as task failure or success.
- `result.json` remains after child completion, owned-TEMP cleanup, log persistence, and retention. No terminal state is published early.
- The change is the minimum semantic correction: one existing awaited observational operation now uses the same failure policy as every later lease publication.

**Risks and limitations:**

- If every lease write is persistently blocked and exact process identity is temporarily unavailable, observers may still classify an in-progress run as stale. This repair intentionally does not weaken that fail-closed status rule.
- Persistent lease failure reduces observability but cannot suppress the real task or terminal result once the worker continues running.
- Complete Ubuntu/Windows Node 20/24 exact-head CI remains the publication authority; local verification cannot close the runtime change.

**Rollback:** Revert STEP-385. This restores mandatory first-lease publication and the Windows Node 20 path where a persistent observational write failure can abort the worker before task execution and terminal result publication.

**Next step:** After explicit user approval, commit and push the five-file STEP-385 change, bind the new exact 40-character HEAD to a fresh full Ubuntu/Windows Node 20/24 CI run, and require every non-skipped job to succeed. Do not rerun the failed job from run `29913227391` against the old head.

## 2026-07-22 — STEP-387: Isolate verified prune-claim recovery from detached-run setup

**Status:** Test correction and complete local verification finished; commit, push, and replacement exact-head CI remain pending. Phase 6 runtime remains blocked on a green current-base Gate G6-0.

**Goal:** Make the prune-claim interruption recovery test exercise only its claimed-directory recovery contract instead of depending on an unrelated detached worker reaching terminal state under full-suite scheduler pressure.

**Failure evidence:**

- STEP-385 was published as `e33966db4c5b6e5b0ad3a656cfc11aa3a2fb497e`.
- Exact-head run `29916845738` passed Repository policy, Ubuntu Node 20, and Windows Node 20/24. Ubuntu Node 24 failed only `cleanup recovers a terminal run left in its verified prune claim after an interruption`.
- The failure occurred after approximately 65.17 seconds in `waitForTerminal`: the setup run became `stale` after lease expiry and the bounded terminal-publication wait. The test had not yet renamed the run directory into a prune claim or invoked cleanup, so the claimed-directory recovery behavior was never exercised.
- Dedicated lifecycle tests immediately preceding this test passed in the same job, including persistent initial/refresh lease-failure coverage, finalization observation, owned-TEMP cleanup, and retention.

**Implementation:**

- Replaced the real detached-run setup with a complete direct-child schema-v2 terminal fixture containing exact directory identity, bounded worker identity fields, command metadata, stdout/stderr files, and authoritative `result.json`.
- The test then atomically renames that verified terminal directory to the exact `.codexgpt-run-prune-<32 hex>` shape and invokes the real cleanup command.
- Assertions remain fail-closed: exactly one claimed directory must be removed, no claim recovery may fail, the claimed path must be absent, and the run root must be empty.
- No production source, lease duration, stale classification, timeout, retry, skip, platform branch, or cleanup authority changed.

**Verification:**

- Verified Node `v20.20.2` and Node `v24.15.0` each passed 27/27 affected lifecycle, process-identity, and atomic-file tests.
- Both managed Node majors passed the five-test mutation architecture inventory.
- Exact detached ordinary run `2026-07-22T12-16-49-660Z-step386-claim-recovery-fixture-3d030141` completed with exit code 0, cleaned temporary state, zero retention failures, complete untruncated stdout, and zero stderr.
- Node 20 and Node 24 each passed 1,109 of 1,111 ordinary tests with zero failures and two established skips.
- TypeScript build passed on both managed Node majors, repository policy passed, the package dry-run retained 529 files, and `git diff --check` passed.

**Adversarial review:**

- The fixture still traverses the production claim-recovery path and its direct-child, canonical-path, directory-identity, terminal-record, and exact claim-name checks.
- Directory identity is captured before rename and must remain valid after the claim transition, preserving the interruption model under test.
- Removing the detached worker does not reduce lifecycle coverage because dedicated integration tests retain exact worker startup, running/finalizing lease, task execution, cleanup, retention, and result-publication assertions.
- The correction removes one unrelated failure source rather than accepting `stale`, extending a deadline, skipping a platform, or weakening cleanup validation.
- Concurrent Phase 6 edits in `AGENTS.md`, `Memory.md`, the master plan, roadmap, and two new design/plan files are separately owned and intentionally excluded from this change.

**Rollback:** Revert STEP-387 to restore the scheduler-dependent detached-run setup before prune-claim recovery. Production runtime behavior is unaffected either way.

**Next step:** Commit and push only the lifecycle test and this archive entry, bind the replacement 40-character HEAD to a fresh full Ubuntu/Windows Node 20/24 CI run, and require every non-skipped job to succeed before Gate G6-0 can pass.

## 2026-07-22 — STEP-388: Retry transient asynchronous atomic replacements

**Status:** Implementation and complete local verification finished; commit, push, and replacement exact-head CI remain pending. Phase 6 runtime remains blocked on a green current-base Gate G6-0.

**Goal:** Prevent transient Windows replacement-sharing conflicts during asynchronous atomic JSON publication from terminating a detached worker before authoritative `result.json` becomes durable.

**Files changed:**

- `CHANGELOG.md`
- `docs/memory/archive/interphase-maintenance-part-5.md`
- `scripts/atomic-file.mjs`
- `test/atomic-file.test.mjs`

**Failure evidence:**

- STEP-387 was published as `53adffc5b8c78704abece8da0bb888a35beab4ab`.
- Exact-head run `29920749402` passed Repository policy and complete Ubuntu Node 20/24 jobs. Windows Node 20 failed `worker evidence mismatch makes a live PID stale and never blocks a same-kind retry` after approximately 93.57 seconds and `terminal detached-run evidence is automatically pruned to the configured retention count` after approximately 67.59 seconds.
- Both failures started real detached workers successfully, then observed no authoritative terminal record before the authentic lease expired. The claim-recovery fixture introduced by STEP-387 passed on Windows Node 20 in approximately 91 ms.
- The shared unprotected boundary was asynchronous atomic JSON replacement: unlike synchronous lease replacement, `writeJsonAtomicFile` attempted one rename only. A transient `EPERM`, `EACCES`, or `EBUSY` while replacing `result.json` could therefore reject the worker's top-level async path; detached stderr is intentionally ignored, so observers later saw only stale state.

**Implementation:**

- Added one bounded asynchronous rename helper and reused the existing fixed retry policy: `EPERM`, `EACCES`, and `EBUSY`; 20 retries; 25 ms delay.
- Synchronous and asynchronous atomic replacements now share the same retry code set, retry count, and delay constants.
- Non-retryable errors still fail immediately. Exhausted transient failures still fail closed, and the exact adjacent temporary file is still identity-checked and removed.
- No lease duration, stale classification, process identity, terminal ordering, cleanup authority, test skip, platform branch, or CI-only path changed.

**Deterministic regression:**

- Added an async atomic replacement test whose injected rename returns `EPERM` twice and succeeds on the third attempt.
- Before the production change, the test rejected on the first `EPERM`. After the change, it proves three attempts, exact final JSON bytes, and no adjacent temporary residue.
- Existing permanent async rename-failure coverage still proves bounded exhaustion preserves the old target and removes the exact temporary file.

**Verification:**

- Verified Node `v20.20.2` and Node `v24.15.0` each passed 28/28 atomic-file, process-identity, and cleanup-lifecycle tests.
- Both managed Node majors passed the five-test mutation architecture inventory.
- The two Windows Node 20 CI failures passed five consecutive focused stress runs after the repair.
- Exact detached ordinary run `2026-07-22T13-08-28-930Z-step388-async-atomic-retry-b2665083` completed with exit code 0, cleaned temporary state, zero retention failures, complete untruncated stdout, and zero stderr.
- Node 20 and Node 24 each passed 1,110 of 1,112 ordinary tests with zero failures and two established skips.
- TypeScript build passed on both managed Node majors, repository policy passed, the package dry-run retained 529 files, and scoped `git diff --check` passed.

**Adversarial review:**

- The retry does not convert failure into success: only the same atomic rename is repeated, and the new target is accepted only when rename completes.
- The retry budget is fixed at at most 21 total attempts and approximately 500 ms of delay, so permanent sharing conflicts remain bounded and fail closed.
- The temporary file remains the same identity-verified object across retries; no new file, fallback copy, direct overwrite, or target clobber path is introduced.
- Applying the same bounded policy to all async atomic JSON publications also protects `worker-evidence.json`, `child.json`, `metadata.json`, and `stopped.json` without adding separate per-file mechanisms.
- No multi-agent provider was available in the workspace; the completed diff received a manual adversarial review against retry exhaustion, non-retryable errors, temporary identity drift, cleanup behavior, terminal authority, and scope isolation.

**Risks and limitations:**

- The CI artifact cannot expose the detached worker's discarded stderr, so the exact failing rename is inferred from the common terminal boundary and deterministic injected reproduction rather than directly logged from the failed hosted worker.
- A conflict lasting beyond the fixed retry budget still prevents publication and eventually produces stale state; extending the budget further would require new evidence.

**Rollback:** Revert STEP-388. This restores single-attempt asynchronous rename behavior while leaving the STEP-387 fixture isolation unchanged.

**Next step:** Commit and push only the four STEP-388 files, bind the new exact 40-character HEAD to a fresh full Ubuntu/Windows Node 20/24 CI run, and require every non-skipped job to succeed before Gate G6-0 can pass.

### STEP-388 publication correction — recorded during STEP-389

- STEP-388 was committed and pushed as `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c` with commit message `fix: retry transient atomic replacements`.
- Exact-head CI run `29925944942` completed with conclusion `success`; Repository policy and Ubuntu/Windows Node 20/24 Regression, Smoke, and Package all passed, and bounded failure-evidence uploads were correctly skipped.
- Local `main`, `origin/main`, and the GitHub run head resolve to the same 40-character SHA.
- This closes the runtime-base exact-head prerequisite of Phase 6 Gate G6-0. It does not authorize Phase 6 runtime implementation or the YAML production dependency, and a fresh no-conflicting-run check remains mandatory immediately before Task 6A0.

## 2026-07-23 — STEP-402: Reconcile Phase 6 closure knowledge and audit project rules

**Status:** Complete locally. Documentation and project memory now consistently treat Phase 6 as closed at `31631676fe254962a9a4f14d6e025e3edba82b8d` by exact-head run `30033293444`. No staging, commit, push, runtime, dependency, Provider installation, release, or deployment was performed.

**Goal:** Remove stale open-gate claims after formal Phase 6 closure, align the Phase 7 design baseline and next legal action, and mechanically audit project rules, paths, links, memory size, and user-facing launch guidance without overwriting separately owned work.

**Files changed:**

- `AGENTS.md`
- `CHANGELOG.md`
- `Memory.md`
- `README.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/interphase-maintenance-part-5.md`
- `docs/memory/archive/phase-6-part-2.md`
- `docs/superpowers/plans/2026-07-22-phase-6-project-guidance-and-skills.md`
- `docs/superpowers/specs/2026-07-22-phase-6-project-guidance-and-skills-design.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`
- `docs/superpowers/specs/2026-07-23-phase-7-semantic-providers-design.md`

**Implementation:**

- Updated the active README status and changelog to include the closed Phase 6 guidance surface and the final Windows runner-observation stabilization.
- Changed the Phase 6 paired plan/spec status, evidence, compatibility baseline, and completion checklist from pending to exact-head closed.
- Changed the Phase 7 paired plan/spec compatibility baseline and next legal action to start from the closed Phase 6 head and require fresh G7-0 authorization.
- Removed the stale STEP-398 `closure remains open` summary from `Memory.md`, retained only current recent summaries, and recorded this reconciliation as STEP-402.
- Corrected the active-rule summary from closed Phases 1–5 to closed Phases 1–6 without adding mechanism or history to the rule file.

**Verification:**

- Enumerated 127 project Markdown files outside ignored/generated trees; the relative Markdown link audit found zero broken targets.
- All 19 repository paths directly named by active technical rules exist.
- `D:\Codex\home\AGENTS.md` and `C:\Users\Administrator\.codex\AGENTS.md` are byte-identical; no parent workspace rule file exists between `D:\Dev\codexpro` and `D:\`.
- `.gitignore` covers `.env`, `.env.*`, `.ai-bridge/`, generated output, and local JSON/Markdown/log artifacts; Git tracks no `.env`, PEM, or key file.
- `Memory.md` remains below the project soft and hard limits. Repository documentation is larger than the project memory archive, so no memory/docs size inversion exists.
- Active status and relative-time scans, repository policy, documentation/package tests, whitespace checks, added-line secret scan, and final scope checks are required after this archive entry.

**Adversarial review:** Pending against this completed synchronization result; supported findings must be repaired before final handoff.

**Decisions, risks, and limitations:**

- `AGENTS.md` exceeds the neat-freak 15 KB soft guideline but remains below 300 lines and contains active security/operational boundaries rather than historical narration. Broad compression would increase the chance of deleting a required fail-closed rule, so this pass does not trade correctness for a soft byte target.
- The supported public-entry rule and README use `scripts/codexgpt-entry.mjs`, but the runtime `--help` output still advertises direct `node scripts/codexgpt.mjs`. That is a user-facing runtime change, not a pure knowledge edit, and requires explicit authorization plus a regression test.
- Closed append-only archives and historical implementation steps retain their original point-in-time facts. Only active status surfaces were corrected.

**Rollback:** Revert only the STEP-402 documentation and memory edits. Do not rewrite the closed Phase 6 archives, remove Phase 7 design work, or change runtime behavior as documentation rollback.

**Next step:** Complete post-edit documentation/policy verification and multi-agent adversarial review. After that, obtain an explicit user decision before repairing the public CLI help drift or beginning Phase 7 Core runtime work.

### STEP-402 completion correction

This correction is append-only. The original `Files changed` list combined prior STEP-401 closure-record files with files actually touched by STEP-402. STEP-402 itself changed `AGENTS.md`, `CHANGELOG.md`, `Memory.md`, `README.md`, `README_ZH.md`, the master plan, this interphase archive, the Phase 6 paired plan/spec, and the existing Phase 7 paired plan/spec. The roadmap was modified by STEP-401, while `docs/memory/archive/phase-6-part-2.md` contains only the STEP-401 closure record.

Post-edit verification completed:

- `npm run policy:check` passed.
- `npm run test:focused -- test/authentication-docs.test.mjs test/package-contents.test.mjs test/operational-policy.test.mjs` passed 2/2 executed tests.
- `git diff --check` passed with only Git's informational LF-to-CRLF warnings.
- The relative Markdown link audit passed 127 files with zero broken targets.
- Active-status and relative-time scans found no remaining stale Phase 6 open-gate claim after the repairs below.
- The added-line high-confidence secret scan passed; no staged files, runtime/source changes, dependencies, credentials, or external state changes were introduced.

Three independent read-only adversarial reviews found and this pass repaired:

- stale Phase 6/Phase 7 status wording in the Phase 6 checklist and master plan;
- four obsolete Phase 8 authorization claims that conflicted with the current execution boundary;
- one stale master-plan statement that still blocked the already completed G6-M/G6-U default flip;
- a circular Phase 6 compatibility baseline, restored to its historical closed Phase 1–5 implementation baseline;
- missing English/Chinese source-checkout launch instructions and Chinese current-status parity;
- the untracked public CLI help drift is now an explicit `Memory.md` open item because fixing runtime help and adding its regression test require fresh authorization.

The final review found no reason to rewrite append-only historical point-in-time facts. STEP-402 is complete locally. The next authorized action remains documentation handoff only; runtime help repair, Phase 7 Core implementation, staging, commit, push, publication, release, and deployment all require fresh user authorization.

## 2026-07-23 — STEP-403: Keep public CLI help on the supported entry

**Status:** Complete locally under Noah's bounded maintenance authorization. The public help no longer recommends bypassing entry-layer protections. No staging, commit, push, publication, release, deployment, dependency, credential, or Phase 7 runtime action was performed.

**Goal:** Make the source-checkout help path match the project's actual public-entry boundary and prevent equivalent direct-inner-CLI guidance or npm bin drift from returning.

**Files changed:**

- `AGENTS.md`
- `CHANGELOG.md`
- `Memory.md`
- `scripts/codexgpt.mjs`
- `test/public-cli-help.test.mjs`
- `docs/memory/archive/interphase-maintenance-part-5.md`

**Implementation:**

- Replaced the help example `node scripts/codexgpt.mjs ...` with `node scripts/codexgpt-entry.mjs ...`; no launch, authentication, tunnel, or command-routing behavior changed.
- Added a runtime regression that executes the real public entry with `--help`, requires a source-checkout example through `codexgpt-entry.mjs`, rejects quoted/unquoted direct inner launches with Windows or POSIX separators, and binds `package.json`'s public `codexgpt` bin to the entry script.
- Closed the STEP-402 open item and recorded that this maintenance authorization is exhausted.

**TDD evidence:**

- Before the production edit, `npm run test:focused -- test/public-cli-help.test.mjs` failed 0/1 because the required entry example was absent and the output still contained the direct inner-CLI command.
- After the one-line production edit, the same command passed 1/1.

**Verification:**

- `node scripts/toolchain-manager.mjs matrix --major all --root C:\Users\Administrator\AppData\Local\CodexPro\toolchains -- npm run test:focused -- test/public-cli-help.test.mjs test/auth-documentation.test.mjs test/package-contents.test.mjs test/mutation-architecture.test.mjs` passed 14/14 on Node `20.20.2` and 14/14 on Node `24.15.0`.
- `node scripts/toolchain-manager.mjs matrix --major all --root C:\Users\Administrator\AppData\Local\CodexPro\toolchains -- npm run build` passed on both managed majors.
- Detached run `2026-07-23T19-11-40-017Z-step403-cli-help-smoke-8c295cb3` completed with exit code 0, cleaned temporary state, zero retention failures, complete untruncated stdout, and zero stderr. Node 20 and Node 24 each passed analysis, analysis CLI, main, HTTP, pro CLI, doctor, settings, and handoff Smoke domains.
- The first connector-bound dual-major Smoke invocation exceeded its 240-second request timeout while the exact process tree remained active and later exited naturally; it produced no retained terminal result, so it is not counted as verification. The retry used the required detached runner and authoritative terminal evidence.
- Repository policy, whitespace, added-line secret, staging, and final scope checks are recorded after this entry.

**Adversarial review:**

- Three independent read-only reviews found no blocking behavior, authorization, platform, mutation-inventory, or worktree-scope issue.
- Review strengthened the permanent regression to cover optional quotes, `./` or `.\`, both path separators, and the published npm bin mapping. The positive assertion now binds entry identity and required options without fixing the path placeholder.
- The changed script line contains no filesystem mutation primitive, so the mutation inventory remains unchanged and its focused gate passes.

**Decisions, risks, and limitations:**

- This fixes user guidance, not execution isolation; direct manual invocation of the inner script remains technically possible and unsupported.
- Local dual-major verification is not publication closure. Any pushed runtime-relevant SHA still requires the complete exact-head Ubuntu/Windows Node 20/24 matrix.

**Rollback:** Revert the one help line, the focused regression, and the STEP-403 project-record updates together. This restores the known guidance defect without affecting runtime command routing.

**Next step:** Obtain fresh authorization before staging, committing, pushing, publishing, beginning Phase 7 Core runtime work, or changing any dependency.

### STEP-403 final verification addendum

- `npm run policy:check` passed.
- `npm run test:focused -- test/public-cli-help.test.mjs test/auth-documentation.test.mjs test/package-contents.test.mjs test/mutation-architecture.test.mjs` passed 14/14.
- `git diff --check` passed with only informational LF-to-CRLF warnings.
- The high-confidence added-line secret scan passed.
- `Memory.md` is 117 lines and 15,209 bytes; the active interphase archive is 27,342 bytes and does not require rollover.
- Final scope inspection found only the intended STEP-403 runtime/test/record additions alongside the pre-existing STEP-401/402 and Phase 7 design documentation work. No file is staged.

Size clarification: 27,342 bytes was measured immediately before this addendum; the appended evidence remains below the configured rollover threshold.

## 2026-07-23 — STEP-404: Authorize and prepare the audited publication batch

**Status:** Pre-publication preparation complete. Noah authorized ordinary staging, English commits, pushes, and exact-head CI repair/retry cycles for the existing audited batch. The exact published SHA and terminal CI result must be taken from Git/GitHub evidence; no evidence-only repository commit may be created afterward.

**Goal:** Publish the reconciled Phase 6 closure/project records, Phase 7 design/TDD records, and STEP-403 public-help repair as one reviewed batch, then repair only the first root cause of any exact-head CI failure until the terminal matrix passes.

**Files in the authorized batch:** the existing STEP-401/402 project records, Phase 7 paired design/archive files, `scripts/codexgpt.mjs`, `test/public-cli-help.test.mjs`, and their README/changelog/rule/memory updates. No Phase 7 runtime, dependency, Provider, credential, npm registry, deployment, or destructive-history change is included.

**Pre-publication verification:**

- `npm run policy:check` passed.
- `npm pack --dry-run` passed and retained 549 package files; `bin.codexgpt` maps to `scripts/codexgpt-entry.mjs`.
- Managed Node `20.20.2` and `24.15.0` each passed `npm run build`.
- Earlier STEP-403 managed Node focused and Smoke evidence remains current for the only runtime/test change.
- Three independent read-only reviews found no code, scope, secret, package, or documentation blocker. One review confirmed npm registry publication cannot proceed on this machine because `npm whoami` returned `ENEEDAUTH`; no credential was requested, created, or stored.

**Decisions and limitations:**

- This is a single combined commit because all files reconcile the same released Phase 6 state, make the Phase 7 design handoff current, and remove the public-entry help contradiction. The final runtime-relevant head will receive one complete exact-head matrix rather than splitting evidence across intermediate heads.
- Git publication and exact-head CI are authorized. npm registry publication remains environment-blocked by absent authentication and must not be simulated with repository credentials.

**Rollback:** Revert the resulting published commit normally if the exact-head matrix exposes a regression. Do not force-push or rewrite history.

**Next step:** Stage the reviewed batch, create an English commit, push normally to `origin/main`, locate and verify its exact-head CI run, and repair/retry only if a gate fails.
## 2026-07-23 — STEP-405: Stabilize Windows lease-refresh terminal observation

**Status:** Local repair complete; republishing for a new exact-head matrix is authorized.

**Goal:** Fix the first and only failed gate from exact-head run 30040766710 without weakening the production runner's lease, finalization, cleanup, or fail-closed stale semantics.

**Failure evidence:**

- Published head 0d28db3f6c05d0f29d075bf71de43585b772da4b reached CI run 30040766710.
- Repository policy, Ubuntu Node 20/24, and Windows Node 24 all passed. Windows Node 20 Regression failed only terminal result publication survives a failed observational lease refresh after 63.6 seconds because its 60-second waitForJson deadline saw no result.json.
- The compact summary and bounded failure evidence are under ignored .ai-bridge/step404-ci-failure-summary.json and GitHub artifact 8577548984. No secret was added to the repository.

**Implementation:**

- The test-only child now writes a completion marker and calls process.exit(0) after it observes the release signal. This removes ambiguity from relying on an interval handle to quiesce while keeping the worker's real child-close, TEMP cleanup, logs, retention, and result.json path under test.
- The test confirms the child marker before awaiting the runner result, so a future timeout distinguishes child-release failure from worker-finalization failure.
- The result observation deadline is WORKER_LEASE_MS + 30,000, matching the existing terminal-observation grace. It does not change the production 60-second lease, 15-second renewal, one-second failure retry, or stale classification; it only prevents a test from declaring failure at the exact observation boundary while the deliberately broken observational lease cannot provide a finalizing signal.

**Verification:**

- The targeted managed Node 20 test passed once, then passed five sequential repetitions (17/17 each).
- Managed Node 20.20.2 and 24.15.0 each passed test/task-cleanup-lifecycle.test.mjs 17/17.
- The same managed Node 20/24 build and repository policy gates passed before the repair; final policy, scope, secret, and whitespace checks are required before staging.

**Adversarial review:**

- Three independent read-only reviews found no production behavior, authorization, mutation-inventory, secret, or scope blocker.
- Review required the completion marker before the extended result wait; that repair is included above. The 30-second grace reduces test sensitivity to terminal latency but preserves the production contract and makes the fixture's progress diagnosable.

**Rollback:** Revert only the STEP-405 test and record updates. This restores the former 60-second observation deadline and implicit fixture exit behavior.

**Next step:** Run final policy/scope checks, create one English repair commit, push normally, and require a new exact-head CI matrix to pass before calling publication successful.

## 2026-07-23 — STEP-406: Remove synthetic finalization timing from the Windows regression

**Status:** Local repair complete; republishing for a new exact-head matrix is authorized.

**Goal:** Repair the first and only failed gate from exact-head run 30042788160 without changing the production long-task runner, its exact identity checks, leases, cleanup, retention, or stale-state behavior.

**Failure evidence:**

- Published head 8c07ba9d9975e76fab8ea93bfaef3d705d1ee808 reached CI run 30042788160.
- Repository policy, Ubuntu Node 20/24, and Windows Node 24 passed. Windows Node 20 Regression failed only worker finalization remains observable through an exact lease or authoritative result after its complete 90-second observation window saw neither a finalizing lease nor a result.
- The compact failure evidence is under ignored .ai-bridge/step405-ci-failure-summary.json and GitHub artifact 8578320181. No secret was added to the repository.

**Implementation:**

- Removed the test-only fabricated stale run, including its fake PID, nonce, process creation time, and identity files. That state is not a real worker and forces pruneTerminalRuns to wait for terminal publication before the actual worker may write result.json.
- The integration test still starts a real detached worker, accepts only its exact finalizing lease or successful authoritative result, checks the finalizing status identity when that window is observed, and requires its terminal result to have exit code zero.
- Neighboring tests retain the deliberate initial-lease and renewal-publication failure paths. No production file changed.

**Verification:**

- `node scripts/toolchain-manager.mjs matrix --major all --root C:\\Users\\Administrator\\AppData\\Local\\CodexPro\\toolchains -- npm run test:focused -- test/task-cleanup-lifecycle.test.mjs` passed 17/17 on Node 20.20.2 and 17/17 on Node 24.15.0.
- `npm run policy:check` passed after the test and project-record updates.
- `git diff --check` passed; only informational LF-to-CRLF warnings were emitted.

**Adversarial review:**

- Independent behavior and scope reviews found no blocker. They confirmed that the real-worker integration still proves the allowed authoritative-result path, while deterministic finalizing-lease identity coverage remains in test/runner-process-identity.test.mjs.

**Decisions, risks, and limitations:**

- The test no longer artificially lengthens the finalizing window. This is intentional: result.json is an allowed authoritative observation and is less timing-sensitive on Windows. The test continues to assert the finalizing path if it is actually observable.
- Local dual-major verification is not publication closure. The pushed runtime-relevant SHA must still pass the full exact-head Ubuntu/Windows Node 20/24 matrix.

**Rollback:** Revert only the STEP-406 test and record updates. This restores the synthetic stale-run timing fixture and its CI flakiness.

**Next step:** Run policy, whitespace, secret, and intended-scope checks; create one English repair commit; push normally; and require a new exact-head CI matrix to pass before calling publication successful.

## 2026-07-23 — STEP-407: Separate finalizing-lease identity from Windows result publication

**Status:** Local repair complete; republishing for a new exact-head matrix is authorized.

**Goal:** Repair the first root cause from exact-head run 30044475015 without changing production runner behavior or weakening the finalizing-lease, identity, cleanup, retention, or terminal-result contracts.

**Failure evidence:**

- Published head a644174ba5ae3786e7436efd525299d95cd19276 reached CI run 30044475015.
- Repository policy, Ubuntu Node 20/24, and Windows Node 24 passed. Windows Node 20 first timed out worker finalization remains observable through an exact lease or authoritative result after 90 seconds, then two later detached-worker tests also failed to reach terminal state.
- The failure sequence proves this was not the removed fabricated stale-run fixture: the problematic test concurrently polled files while its real worker synchronously replaced lease and result records. Its stuck detached worker then affected subsequent lifecycle cases.
- The compact summary and redacted CI artifact are under ignored .ai-bridge/step406-ci-failure-summary.json and .ai-bridge/step406-failure-artifact/. No secret was added to the repository.

**Implementation:**

- Removed the test-only polling helper that concurrently read metadata, evidence, lease, result, and stopped records every 25 milliseconds while the real worker performed atomic replacements.
- The integration test now starts the real detached worker and requires its matching successful result.json followed by terminal status. It therefore still proves the authoritative publication path without manufacturing a replacement-window race on Windows Node 20.
- Renamed the integration test to state its real assertion. The exact bounded finalizing-lease and terminal_publication_in_progress semantics remain deterministically covered by runner-process-identity.test.mjs, including a bounded observer that sees the exact lease.
- No production file changed.

**Verification:**

- `node scripts/toolchain-manager.mjs matrix --major all --root C:\\Users\\Administrator\\AppData\\Local\\CodexPro\\toolchains -- npm run test:focused -- test/task-cleanup-lifecycle.test.mjs test/runner-process-identity.test.mjs` passed 23/23 on Node 20.20.2 and 23/23 on Node 24.15.0.

**Adversarial review:**

- Independent behavior and scope reviews found no blocker. They confirmed that the concurrent reader was test-only, the real detached-result path remains covered, and exact finalizing-lease identity/observation are deterministically covered by the dedicated identity suite.

**Decisions, risks, and limitations:**

- This separates two legitimate contracts instead of trying to make a filesystem race deterministic. The lease contract remains independently tested, and the integration test continues to exercise the real detached result path.
- Local dual-major verification is not publication closure. The pushed runtime-relevant SHA must still pass the full exact-head Ubuntu/Windows Node 20/24 matrix.

**Rollback:** Revert only the STEP-407 test and record updates. This restores the concurrent observer and its Windows Node 20 timing race.

**Next step:** Run independent adversarial review, policy, whitespace, secret, and intended-scope checks; create one English repair commit; push normally; and require a new exact-head CI matrix to pass before calling publication successful.

## 2026-07-25 — STEP-434: Reconcile knowledge after Phase 7 Core closure

**Status:** Completed locally. Public status documentation, active rules, current memory, the Phase 7 plan, the historical roadmap, and archive routing now agree that Phase 7 Core is closed at `a0b9f46e2297297959527f7570c9cb7942cc8fb3` by exact-head run `30171313296`. No source, dependency, runtime configuration, credential, approval, transaction, staging, commit, push, release, or deployment state changed.

**Goal:** Apply the `neat-freak` workflow after formal closure: remove stale pre-publication claims, close the Phase 7 archive volume, return subsequent work to the interphase archive, audit active rule references and public setup text, and keep the root memory index compact.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `README.md`
- `README_ZH.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-7-part-3.md`
- `docs/memory/archive/interphase-maintenance-part-5.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`

**Reconciliation:**

- Replaced stale English and Chinese README claims that Phase 7 Core remained in pre-publication validation with the exact closure head/run while preserving that Contract V5 is an explicit `standard` opt-in rather than the default public contract.
- Changed the roadmap's remaining “Core candidate” language to the closed Core scope and renamed the Phase 7 plan's final section from “Current next action” to “Closure state”.
- Updated the master plan's top authorization line to state that the Phase 7 closure authorization is complete and exhausted.
- Kept the Phase 7 design/security rules active, but corrected the rollback sentence so explicit `legacy` remains the supported one-restart rollback after closure rather than only until closure.
- Closed Phase 7 Volume 3 at STEP-433 and changed the root archive label from active/open-ended to closed `STEP-426 through STEP-433`. Later maintenance now returns to this interphase archive as required by the project memory protocol.
- Compacted recent root summaries to the five entries with current handoff value. Historical point-in-time statements inside closed append-only archives were not rewritten.
- Left the two untracked Phase 8 OAuth documents unchanged and outside this maintenance scope.

**Exact verification and rule audit:**

- `npm run test:focused -- test/auth-documentation.test.mjs test/phase-7-documentation.test.mjs test/package-contents.test.mjs test/public-cli-help.test.mjs test/operational-reliability.test.mjs` passed 18/18.
- `npm run policy:check` reported `Repository operational policy: PASS`; `git diff --check` passed with only checkout line-ending warnings.
- Relative-link audit scanned 129 tracked Markdown files and 82 relative links with zero missing targets. All 32 archive links in `Memory.md` resolve.
- Every active path explicitly referenced by `AGENTS.md` exists. `.gitignore` still covers `.env` and `.env.*`; no `CLAUDE.md` mirror is required by the project rules.
- Active non-archive Markdown contains no relative-time wording such as “today”, “yesterday”, “recently”, `今天`, or `最近`.
- Final size check after this entry: `AGENTS.md` 210 lines / 19,563 bytes; `Memory.md` 118 lines / 15,349 bytes; closed Phase 7 Volume 3 350 lines / 35,515 bytes; active interphase Volume 5 486 lines / 45,508 bytes; master plan 1,366 lines / 77,920 bytes. All remain within project hard limits. Interphase Volume 5 remains below the 48 KB rollover threshold, but the next complete maintenance STEP must check the threshold before appending and open Part 6 if necessary.

**Adversarial review:** A second read-only pass challenged whether the closure evidence was being duplicated into rules, whether public docs overclaimed default V5 activation, whether historical archives were being rewritten, whether Phase 8 was accidentally adopted, and whether the archive routing violated the phase-completion protocol. No blocking inconsistency remained. No independent subagent provider is available in this workspace, so no multi-agent claim is made.

**Decisions, risks, and limitations:** This is documentation and project-memory maintenance only. The published closure head remains unchanged, and no evidence-only commit is created. `AGENTS.md` remains above the neat-freak 15 KB soft preference but below 300 lines and contains active fail-closed rules; broad compression would reduce safety clarity. The master plan remains below its established 1,500-line soft limit and should continue to be read by explicit ranges.

**Rollback:** Revert only the nine STEP-434 documentation/memory files. Do not reopen Phase 7 Volume 3, rewrite earlier append-only entries, or alter the published closure head/run evidence.

**Next action:** None is authorized. Any Phase 7B/7C, Phase 8, release/deployment, credential migration, toolchain-root migration, or deferred Phase 4 work requires separate approval.

## 2026-07-25 — STEP-435: Add evidence-first CI performance collection

**Status:** Phase 0 is implemented and verified locally. The repository can now produce bounded per-test-file timing evidence without changing the existing Windows serialization or Linux split topology. No file was staged, committed, pushed, released, or deployed, and no new GitHub Actions run or artifact exists for this working tree.

**Goal:** Begin the approved CI optimization plan at its lowest-risk boundary: measure the current test topology before changing concurrency, sharding, caches, dependencies, or runtime behavior. The immediate user impact is diagnostic rather than a claimed speedup: the next exact-head matrix can identify the real Windows bottlenecks instead of optimizing from intuition.

**Files changed:**

- `.github/workflows/ci.yml`
- `scripts/test-domains.mjs`
- `scripts/test-performance-reporter.mjs`
- `test/ci-workflow.test.mjs`
- `test/mutation-architecture.test.mjs`
- `test/owned-temp-root.test.mjs`
- `test/test-domain-classification.test.mjs`
- `test/test-performance-reporter.test.mjs`
- `Memory.md`
- `docs/memory/archive/interphase-maintenance-part-5.md`

**Implementation:**

- Added explicit `--performance` collection to the authoritative test-domain runner. The option preserves the established Windows `--test-concurrency=1` behavior and the existing non-Windows main/serial split.
- Added a Node test-runner reporter that records one bounded entry per repository `test/*.test.mjs` file from first dequeue through completion, sorts entries by descending duration, stores only repository-relative test paths, and includes platform, architecture, Node version, domain, shard, and bounded CI identity.
- Local evidence uses collision-resistant timestamp/PID names under ignored `.ai-bridge/performance/`. GitHub evidence uses deterministic exact filenames for each domain, shard, platform, and Node major so the workflow never uploads by wildcard.
- The workflow keeps ordinary console output while adding the JSON reporter, uploads only after the regression step succeeds, includes the hidden `.ai-bridge` directory explicitly, fails if an exact report is absent, retains artifacts for 14 days, and includes `github.run_attempt` in artifact names.
- Report preparation and validation reject symlinks/junctions, hardlinks, oversized evidence, repository escapes, unstable file identity/metadata, unknown keys, malformed runtime data, and CI context not exactly bound to the current `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, and `GITHUB_JOB`.
- Registered the reporter's ignored-state directory creation in the fail-closed mutation inventory. The reporter remains in the npm package because the shipped `scripts/test-domains.mjs --performance` path imports it; excluding the small dependency would ship a broken public script.
- Updated operational contract tests for the additional reporter arguments and child-environment handoff without weakening owned temporary-root cleanup.

**Current evidence and ranking:**

- Existing successful GitHub run `30171313296` at exact head `a0b9f46e2297297959527f7570c9cb7942cc8fb3` remains the live baseline. Its regression/smoke steps were Windows Node 20 `15m29s`/`4m20s`, Windows Node 24 `11m38s`/`4m36s`, Ubuntu Node 20 `2m47s`/`1m24s`, and Ubuntu Node 24 `1m49s`/`1m12s`. This confirms that Windows regression is the first measurement target, but it does not provide per-file artifacts.
- Managed Node 24 ordinary run `2026-07-25T20-35-16-660Z-phase0-performance-ordinary-node24-final-8cba77fc` completed successfully with 1,252 passes, zero failures, and two established skips across 1,254 tests. The runner cleaned its owned temporary state and produced a 209-file local report with `526,915 ms` wall duration.
- The Node 24 local top five were `task-worktree-merge-execute.test.mjs` (`32,679 ms`), `git-stash-v4.test.mjs` (`32,172 ms`), `git-integrations-worktree.test.mjs` (`31,427 ms`), `task-worktree-merge-prepare.test.mjs` (`28,900 ms`), and `task-worktree-remove.test.mjs` (`28,408 ms`). These are local Windows measurements only and do not yet authorize concurrency changes.
- An earlier managed Node 20 ordinary run produced a preliminary 209-file report with `1,014,891 ms` wall duration, then exited nonzero because `test/owned-temp-root.test.mjs` still expected the former three-argument launcher shape. Production tests were 1,250 passes, one test-contract failure, and two established skips. The stale contract was repaired to permit the reporter arguments and assert the derived child environment; the final dual-major focused regressions below passed.

**Exact verification and results:**

- Current Node 24: `npm run test:focused -- test/owned-temp-root.test.mjs test/test-performance-reporter.test.mjs test/test-domain-classification.test.mjs test/ci-workflow.test.mjs test/mutation-architecture.test.mjs` passed 29/29.
- Managed Node 20.20.2: `node scripts/toolchain-manager.mjs exec --major 20 --root C:\Users\Administrator\AppData\Local\CodexPro\toolchains -- node --test test/owned-temp-root.test.mjs test/test-performance-reporter.test.mjs test/test-domain-classification.test.mjs test/ci-workflow.test.mjs test/mutation-architecture.test.mjs` passed 29/29.
- Managed Node 24.15.0 detached ordinary with `--performance` passed 1,252/1,254 with two established skips and zero failures.
- `npm run build` passed.
- `npm run policy:check` reported `Repository operational policy: PASS`.
- `npm run test:focused -- test/package-contents.test.mjs` passed 2/2.
- `npm pack --dry-run --json` completed successfully and included both the shipped domain runner and its reporter.
- `git diff --check` passed with informational checkout line-ending warnings only.
- A filename-only secret-pattern scan over the eight implementation/test files returned no matches.

**Adversarial review:**

- Three independent read-only agents reviewed runtime compatibility, CI/test quality, and security after the initial result existed. A final security re-review found no remaining P0/P1.
- Review repairs added hidden-file upload support, exact artifact paths, run-attempt collision resistance, success-only upload, workflow-step-scoped tests, real multi-reporter integration coverage, linked-state rejection, same-handle bounded reads, stable metadata checks, runtime architecture validation, exact CI-environment binding, mutation-inventory coverage, and adversarial oversized/hardlink/stale/malformed evidence tests.
- The reviewers confirmed Node 20 and Node 24 multi-reporter compatibility. The final dual-major 29/29 runs above include the last CI-context and adversarial-validator changes.

**Decisions, risks, and limitations:**

- This STEP measures only. It deliberately does not enable parallel Windows execution, change the CI matrix, remove dependencies, alter caches, or refactor tests before exact GitHub data exists.
- Local `.ai-bridge/performance/` reports are ignored diagnostic evidence, not publication proof. GitHub artifact generation, full cross-platform ranking, and before/after optimization evidence require an explicitly authorized commit/push followed by a new exact-head matrix.
- The final Node 24 ordinary run began before the last validator-only tightening. Its production test workload and generated local report passed; the final validator changes were separately exercised after the patch on both managed Node majors.
- Existing unrelated user documentation and Phase 8 working-tree changes were preserved and were not adopted into this STEP.

**Rollback:** Revert only the eight implementation/test files listed above and the STEP-435 memory updates. Ignored local reports and detached-run evidence may be retained for diagnosis; no user configuration, credential, branch, worktree, audit record, or published state needs rollback.

**Next action:** With explicit authorization, stage and commit only the reviewed STEP-435 scope, push normally, run the exact-head Ubuntu/Windows Node 20/24 matrix, download the four exact performance artifacts, and rank the Windows bottlenecks before proposing any Phase 1 optimization.

**Volume state:** Closed after STEP-435 at 53,676 bytes, above the 48 KB rollover threshold. Leave this volume unchanged; create interphase maintenance Part 6 only when the next maintenance STEP begins.
