# Phase 4 implementation archive - Volume 2

This append-only volume continues Phase 4 from STEP-319 after Volume 1 crossed the 48,000-byte rollover threshold at STEP-318. Do not rewrite `docs/memory/archive/phase-4.md`.

Do not store secrets, complete tokens, private keys, credential-bearing URLs, raw command/environment/input bytes, canonical private roots before local approval, or sensitive file contents in this archive.

## STEP-319 - Close Phase 4A4 confirmed-root admission and fixed leases

**Status:** complete locally; uncommitted and unpublished

**Goal:** add V3-only brokered admission for locally confirmed ordinary roots without widening configured roots or claiming process isolation.

**Files changed:** `src/access/fullAccessLease.ts`, `src/access/rootAdmission.ts`, `src/access/protectedRoots.ts`, `src/control/localApprovalServer.ts`, `src/control/runtime.ts`, `src/guard.ts`, `src/policy/runtime.ts`, `src/productionRuntime.ts`, `src/server.ts`, `test/fixtures/full-access-imports.ts`, `test/full-access-contract.test.mjs`, `test/full-access-paths-windows.test.mjs`, `test/confirmed-root-hard-links-windows.test.mjs`, `test/full-access-lease.test.mjs`, `test/full-access-warning.test.mjs`, plus current-status rule/document/memory files.

**Implementation summary:** the remote first request performs lexical hashing only and exposes no existence/protection result. The local approval projection resolves and displays the canonical root, access class, and fixed lifetime before approval. One-use retry revalidates canonical path, volume/directory identity, reparse/mapped-drive state, identity/credential/transport/policy/contract/evidence bindings, and protected-policy revision before issuing random workspace/lease handles. Process-local leases enforce independent ten-minute idle and thirty-minute absolute ceilings, access-class-distinct keys, read-only denial, and ordered input quarantine/owned-Job termination/authorization cleanup. Confirmed-root path use adds volume-anchored protected-root checks, `nlink === 1` enforcement, stable file checks, and WorkspaceManager resolution/list/close integration without modifying or persisting `allowedRoots`. Server, Policy Kernel, local control, and production runtime accept a per-server injected root-admission runtime; default production remains fail-closed until the built-in native identity oracle is promoted later.

**Verification commands:**

```text
node --import tsx --test test/full-access-contract.test.mjs test/full-access-lease.test.mjs test/full-access-paths-windows.test.mjs test/confirmed-root-hard-links-windows.test.mjs test/full-access-warning.test.mjs
npm run build --silent
node --import tsx --test test/local-control-protocol.test.mjs test/policy-v3-approval-integration.test.mjs test/phase-4-contract-v3.test.mjs test/workspace-lifecycle.test.mjs test/production-runtime-integration.test.mjs
node scripts/long-task-runner.mjs start --kind phase4a4-confirmed-roots-focused-final-3 -- node scripts/toolchain-manager.mjs matrix --major all -- node --test --test-concurrency=1 test/full-access-contract.test.mjs test/full-access-paths-windows.test.mjs test/confirmed-root-hard-links-windows.test.mjs test/full-access-lease.test.mjs test/full-access-warning.test.mjs test/workspace-lifecycle.test.mjs test/path-policy.test.mjs test/open-workspace-contract.test.mjs test/list-workspaces-contract.test.mjs test/close-workspace-contract.test.mjs test/local-control-protocol.test.mjs test/policy-v3-approval-integration.test.mjs test/phase-4-contract-v3.test.mjs test/production-runtime-integration.test.mjs test/test-domain-classification.test.mjs
node scripts/long-task-runner.mjs start --kind phase4a4-ordinary-final -- node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain ordinary
git diff --check
npm run policy:check
node --test test/auth-documentation.test.mjs test/ci-workflow.test.mjs test/mutation-architecture.test.mjs test/operational-reliability.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs
```

**Verification results:** RED first failed because the access modules did not exist. Active focused/regression runs passed after implementation. Managed focused run `2026-07-16T19-56-36-768Z-phase4a4-confirmed-roots-focused-final-3-0ea5c54f` passed 97/97 on Node 20.20.2 and 97/97 on Node 24.15.0, with complete stdout and empty stderr. Managed ordinary run `2026-07-16T19-58-09-568Z-phase4a4-ordinary-final-1219c831` passed 835/836 with one established platform-capability skip and zero failures on each runtime; 247,516 stdout bytes were retained without truncation and stderr was empty. Build, repository policy, diff check, and 23/23 governance/static/package tests passed.

**Decisions made:** root approval is prepared during local list/watch so the operator sees canonical local facts before deciding; generic remote approval records never expose private canonical roots. Confirmed-root state remains per server and process-local, never enters configured-root persistence, and is not process authority. Node filesystem identity is used only for brokered file checks; the production stable Windows root/file oracle remains an explicit Task 4A6 dependency rather than an overclaimed Node guarantee.

**Risks or limitations:** the built-in production runtime does not yet instantiate a native stable-identity oracle, so default public confirmed-root authority remains unavailable. Node path checks reduce replacement and hard-link races but do not replace the later native held-handle oracle. Read/search/tree currently fail closed at the shared guard on a linked ordinary file; the standalone confirmed-root guard supports bounded omission metadata for providers that can continue enumeration. Confirmed-root authorization is a brokered file lease and never authorizes current-user process execution.

**Rollback method:** remove the three `src/access/` modules and their server/policy/local-control/production injection wiring, remove confirmed-root WorkspaceManager/PathGuard branches and the five tests, then restore the Task 4A3 current-status wording. V1/V2 configured-root behavior remains unchanged.

**Next step:** Task 4A5 bounded output, finite-memory streaming redaction, opaque AEAD cursors, and quotas; no task-level staging, commit, push, or publication.

## STEP-320 - Close Phase 4A5 bounded output safety

**Status:** complete locally; uncommitted and unpublished

**Goal:** make output redaction, retention, pagination, waiting, and quotas safe independently of the native host.

**Files changed:** `src/process/outputRing.ts`, `src/process/outputQuota.ts`, `src/process/outputCursor.ts`, `src/process/streamingRedactor.ts`, `src/redact.ts`, `scripts/output-bounds.mjs`, `test/fixtures/process-output-imports.ts`, `test/process-output-ring.test.mjs`, `test/process-output-quota.test.mjs`, `test/process-output-cursor.test.mjs`, `test/streaming-redaction.test.mjs`, `test/output-bounds.test.mjs`, and checkpoint documents/memory.

**Implementation summary:** output passes through incremental UTF-8 decoding, ANSI/control neutralization, and a fixed-memory known-pattern recognizer before ring retention. The ring bounds per-process bytes, evicts only on UTF-8 boundaries, supports old-cursor truncation, intra-chunk pagination, concurrent/cancelled waiters, and EOF wakeup. AES-256-GCM cursors hide and bind process/generation/sequence/offset/context/version/expiry. Quotas bound active processes, terminal records, per-process/server output, and preserve per-session output reservations; overflow signals only the offending producer. Public metadata explicitly says `best_effort_known_patterns`, never DLP.

**Verification commands:** focused RED/green tests via `node --import tsx --test`; `npm run build --silent`; `npm run policy:check`; managed matrix run `2026-07-16T20-17-43-210Z-phase4a5-output-focused-final-ddd47e53`; output/contract/domain/package regressions; `git diff --check`.

**Verification results:** RED failed on absent modules. Final active output suite passed 16/16. Managed Node 20.20.2 and Node 24.15.0 each passed 24/24 with zero skips/failures, complete 7,244-byte stdout, and empty stderr. Build, policy, diff, package, exact V3 contract, and domain classification passed.

**Decisions made:** UTF-8 pages may exceed a one-byte QoS request only to return one complete scalar and guarantee progress; ASCII `max_bytes=1` remains exact. Session output reservation is enforced before server capacity so a noisy session cannot consume another active session's minimum. Redaction is explicit before append and recognizes only documented known patterns.

**Risks or limitations:** known-pattern redaction cannot detect arbitrary encoding, encryption, fragmentation, or unknown credentials and is not an exfiltration boundary. Ring/process terminal expiry is owned by the later process manager. Native protocol queue caps and producer Job termination arrive in Task 4A6.

**Rollback method:** remove the four `src/process/output*`/redactor modules and their tests, restore `src/redact.ts` and `scripts/output-bounds.mjs` exports, then restore Task 4A5 current-status wording.

**Next step:** Task 4A6 native host/protocol/backend identity productionization; no task-level publication.

## STEP-321 - Close Phase 4A6 production Windows host and backend identity

**Status:** complete locally; uncommitted and unpublished

**Goal:** promote only Gate-N-proven native primitives into a manifest-verified per-production-runtime host with exact protocol, backend identity, command compilation, package, and supply-chain gates.

**Files changed:** `scripts/windows-process-host.cs`, `scripts/windows-process-host.ps1`, `scripts/windows-process-host-manifest.json`, `scripts/windows-native-api-inventory-v1.json`, `scripts/.npmignore`, `.npmignore`, `src/process/windowsHostProtocol.ts`, `src/process/windowsHostClient.ts`, `src/process/backendDiscovery.ts`, `src/process/commandCompiler.ts`, `src/process/types.ts`, `src/productionRuntime.ts`, `src/server.ts`, `scripts/repository-policy.mjs`, `scripts/test-domains.mjs`, `test/fixtures/process-host-imports.ts`, `test/backend-discovery.test.mjs`, `test/windows-process-host-integration-windows-control.test.mjs`, `test/native-host-architecture.test.mjs`, `test/package-contents.test.mjs`, `test/production-runtime-integration.test.mjs`, `test/test-domain-classification.test.mjs`, and checkpoint documents/memory.

**Implementation summary:** the production host is fixed to package-root PowerShell/C# and the shared CXP4 protocol authority. A checked manifest binds exact source/protocol digests before `Add-Type`; repository policy and package tests fail on drift. The TypeScript protocol enforces the frozen authenticated 64-byte envelope, strict UTF-8/JSON, sequence, direction, payload, queue, and correlation rules. Backend discovery accepts only digest-reviewed explicit paths or fixed Windows locations and returns SHA-256 plus stable file identity; command compilation preserves direct argv boundaries and keeps PowerShell source off argv. Each production runtime owns a lazy, independently disposable host; no global host exists. The shipped tarball excludes the Gate-N spike driver.

**Verification commands:**

```text
npm run build
node --test test/backend-discovery.test.mjs test/native-host-architecture.test.mjs test/package-contents.test.mjs test/production-runtime-integration.test.mjs test/test-domain-classification.test.mjs
npm run policy:check
node scripts/toolchain-manager.mjs matrix --major all -- node --test test/backend-discovery.test.mjs test/native-host-architecture.test.mjs test/package-contents.test.mjs test/production-runtime-integration.test.mjs test/test-domain-classification.test.mjs
independent hidden native process: node scripts/toolchain-manager.mjs matrix --major all -- node --test test/windows-process-host-integration-windows-control.test.mjs
```

**Verification results:** build and repository policy passed. Managed Node 20.20.2 and Node 24.15.0 each passed 22/22 focused ordinary tests. Independent native run `task4a6-managed-control-20260716T205620563Z` passed 2/2 on each managed runtime and retained bounded stdout/stderr evidence below `.ai-bridge/phase-4/`. Package, native inventory, manifest digests, per-runtime independence, and native monotonic timeout all passed.

**Decisions made:** derive production system paths from the installed Node drive rather than caller environment; keep optional PowerShell 7/Git Bash discovery limited to fixed locations; retain explicit digest-reviewed paths as the only override. The production native class is `ProcessHost`, while the proof driver stays local-only and is excluded from the tarball.

**Risks or limitations:** Task 4A6 does not expose process handlers. The full-access policy/approval/result projection and redaction/ring integration arrive in Task 4A7; persistent ownership and ConPTY arrive later. Confirmed-root activation still needs a built-in stable Windows root oracle. Same-user code can inspect the host channel, and Job ownership still provides no broker-escape resistance.

**Rollback method:** remove the five new `src/process/` production modules and their server/production wiring, restore the Gate-N source class/loader names and package inventory, remove the manifest policy/package tests, and restore the Task 4A6 checkpoint wording. Existing Gate N evidence and Task 4A5 output layer remain intact.

**Next step:** Task 4A7 one-shot `full_access` execution; no task-level staging, commit, push, or publication.

## STEP-322 - Reconcile Phase 4A6 knowledge and mutation inventory

**Status:** complete locally; uncommitted and unpublished

**Goal:** run the required `neat-freak` checkpoint after Task 4A6 and make rules, current-state documents, memory, archive evidence, and static mutation review match the production implementation.

**Files changed:** `AGENTS.md`, `Memory.md`, the paired Phase 4 spec/plan, the master plan, `docs/memory/archive/phase-4-part-2.md`, and `test/mutation-architecture.test.mjs`.

**Implementation summary:** current-state pointers now identify Task 4A7 as next while historical archives remain append-only. `Memory.md` was compacted below its practical 18 KB threshold. The production host's private temporary bootstrap directory creation and exact cleanup were added to the fail-closed mutation inventory.

**Verification commands:** `git diff --check`; scoped secret scan; project-memory link check; `npm run policy:check`; `node --test test/auth-documentation.test.mjs test/ci-workflow.test.mjs test/mutation-architecture.test.mjs test/operational-reliability.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs`.

**Verification results:** the first governance run failed only because the new `mkdtemp`/`rm` production primitives were unreviewed. After adding their exact semantic digests and purpose, the affected matrix passed 11/11 and the complete documentation/governance matrix passed 23/23; policy, links, secret scan, and diff check passed. `Memory.md` is 120 lines and 17,690 bytes.

**Decisions made:** private native-host bootstrap state remains outside workspaces and is tracked as an application/runtime-state exception; no directory or filename-pattern exemption was added.

**Risks or limitations:** the archive is below its rollover threshold. User-facing Phase 4 documentation remains intentionally deferred until the runtime evidence required by Task 4C0 exists.

**Rollback method:** revert only the checkpoint wording and STEP-322 memory/index changes; removing the mutation inventory entry also requires removing the corresponding production primitives.

**Next step:** Task 4A7 one-shot `full_access` execution.

## STEP-323 - Design and adversarially repair Phase 5

**Status:** complete locally; documentation/design only; uncommitted and unpublished

**Goal:** derive the exact Phase 5 local-Git/task-worktree architecture from first principles, produce a concrete mandatory TDD sequence, then adversarially review and repair the completed draft before implementation begins.

**Files changed:** `docs/superpowers/specs/2026-07-16-phase-5-git-and-task-worktrees-design.md`, `docs/superpowers/plans/2026-07-16-phase-5-git-and-task-worktrees.md`, `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `AGENTS.md`, `Memory.md`, and this archive volume. Phase 5 runtime/source files changed: none.

**Implementation summary:** the exact design freezes opt-in Tool Contract V4 at 51 tools, preserves V1=28/V2=31/V3=39, separates the typed local-Git domain, identity-bound safe capsule, and persistent managed task-worktree manager, and defines Gates 4P/G0/C4/R/I/D/W/M/X/P with Task 5A0 through 5C3. The post-draft adversarial review raised Git ref/history writes to R3, replaced checkout-oriented stage/stash/merge/target update with raw blobs/private indexes/quarantined object-only merge/journal participants, required pre-object commit-message scanning and two-stage candidate-bound merge approval, made incomplete scans incapable of minting mutation tokens, bound every task to its creation-time target, rejected silent EOL/LFS/filter semantic drift, split task branch/root/admin participants, made removal handle-safe rather than Git-recursive, defined bounded private stash/candidate-ref lifecycles, froze the V4 persisted-audit union/projections, and added fail-closed sparse/split-index/reftable/object-merge capability errors. Neat-freak reconciled the master sequence, historical roadmap, active rules, and memory without pretending Phase 5 runtime exists or changing Phase 4's next task.

**Verification commands:**

```text
npm run build
npm run policy:check
node --test test/auth-documentation.test.mjs test/ci-workflow.test.mjs test/mutation-architecture.test.mjs test/operational-reliability.test.mjs test/package-contents.test.mjs test/test-domain-classification.test.mjs
PowerShell local-link validation across all repository Markdown files
PowerShell scoped secret-pattern scan across the seven affected Markdown files
git diff --check
```

**Verification results:** final build and repository policy passed. The documentation/governance/static/package matrix passed 23/23. All 113 repository Markdown local links and the corrected scoped secret-pattern scan across the seven affected files passed; the first scan command itself had a PowerShell colon-interpolation syntax error and changed no state. `git diff --check` passed after final memory reconciliation. An earlier build observed five in-progress Phase 4 V3 type-integration errors in `src/http.ts`, `src/policy/runtime.ts`, `src/process/runCommand.ts`, `src/selfTestOps.ts`, and `src/stdio.ts`; after the surrounding Phase 4 worktree converged, the final fresh build rerun passed. This Phase 5 step changed no runtime source and did not mask or repair those files.

**Decisions made:** Phase 5 cannot start before complete Phase 4 exact-head closure. V4 remains nondefault and local-only; typed remote, credential, force, arbitrary Git, branch deletion, and force removal remain structurally absent. Index-only stage is R2; every ref/history or destructive task action is R3. The safe capsule is not a sandbox, a task worktree does not isolate code or widen `allowedRoots`, and a separately approved ambient `full_access` process remains capable of running unrestricted Git outside the typed surface.

**Risks or limitations:** object-only merge, raw private-index construction, Windows handle-safe deletion, exact executable identity, and crash recovery are design requirements, not demonstrated Phase 5 capabilities. The journal cannot make file/index/ref transitions simultaneously visible to arbitrary external Git processes. Repository integrations remain ambient full access. No managed Node 20/24 Phase 5 runtime test was run because no Phase 5 runtime exists.

**Rollback method:** remove the two new Phase 5 paired documents and revert only the Phase 5 pointers/summary in the master plan, historical roadmap, `AGENTS.md`, and `Memory.md`; append a correction rather than rewriting this archive entry. Runtime behavior, Phase 4 source, branches, worktrees, refs, credentials, and external state are untouched.

**Next step:** continue Phase 4 Task 4A7. After complete Phase 4 phase-boundary publication and exact-head CI, begin Phase 5 at Task 5A0/Gate G0; do not create `docs/memory/archive/phase-5.md` before then.

## STEP-324 - Close Phase 4A7 one-shot full-access execution

**Status:** complete locally; uncommitted and unpublished

**Goal:** expose one-shot V3 `run_command` only after exact local R3 approval, execute through the manifest-bound native Windows host, and return truthful ambient-authority and bounded output results without any sandbox or workspace-boundary claim.

**Files changed:** `src/process/runCommand.ts`, `src/process/commandCompiler.ts`, `src/policy/runtime.ts`, `src/policy/integration.ts`, `src/policy/audit.ts`, `src/policy/types.ts`, `src/productionRuntime.ts`, `scripts/test-domains.mjs`, `test/run-command-contract.test.mjs`, `test/run-command-windows-control.test.mjs`, `test/policy-v3-approval-integration.test.mjs`, `test/test-domain-classification.test.mjs`, and checkpoint documents/memory.

**Implementation summary:** the production runtime compiles an explicit Permission Profile V3, rejects any profile that does not affirm ambient filesystem, credential, registry, and unrestricted-network authority, and wires `run_command` plus terminal `read_process_output`. Direct argv preserves exact arguments; PowerShell source stays off argv. The result states current-user unrestricted filesystem/credentials/registry/network, no isolation, possible host writeback, Job members-only control, and no broker-escape resistance. Known-pattern streaming redaction precedes ring retention; arbitrary encoded secrets remain visible by design. Terminal output is retained for five minutes with AEAD-bound pagination. The V3 authorization path now converts an atomically reserved matching grant into an allow decision and exposes grant provenance. An internal non-enumerable authorization-resource binding makes the handler revalidate the exact resource fingerprint immediately before host acquisition, so backend identity drift consumes the one-use grant but produces zero spawn.

**Verification commands:** `npm run build`; focused direct and policy integration tests; `npm run policy:check`; managed Node 20/24 focused ordinary matrix; independent hidden native managed Node 20/24 control run for `test/run-command-windows-control.test.mjs`; mutation/native inventory, package, production-runtime, exact V3, and domain regressions.

**Verification results:** focused contract and approval integration passed, including 24 concurrent identical retries with exactly one R3 winner and 23 fresh approval-required outcomes. Managed Node 20.20.2 and Node 24.15.0 each passed 28/28 ordinary tests. Independent native run `task4a7-control-20260717T034953761Z` passed 1/1 on each managed runtime and retained bounded evidence under `.ai-bridge/phase-4/`. Build, policy, package, mutation/native inventory, production runtime, V1/V2 compatibility, and exact V3=39 registration passed. The post-result adversarial review found and fixed the approval-to-handler backend replacement race and an unbounded executable hash read.

**Decisions made:** `full_access` is accepted risk, never an isolation claim. Nonzero exit and native timeout are completed process results. Approval display binds the actual backend, argument count, revealed direct argv, semantic digest, cwd/environment/lifetime/network posture, and the complete ambient-authority warning. Absolute executable paths are identity-bound; arbitrary PATH lookup remains unavailable.

**Risks or limitations:** one-shot execution only is active. There is no persistent process input/control, ConPTY, broker-escape resistance, DLP, workspace/blocked-path child enforcement, built-in confirmed-root identity oracle, or offline sandbox. Terminal records are purged lazily on the next process action and are bounded by process/session/server quotas. Same-user code can inspect host channels and unrestricted children can read credentials, registry, network, and any current-user-accessible file.

**Rollback method:** remove `RunCommandRuntimeV3` and its production handlers/resolver, restore context-only V3 grant behavior and generic V1 audit summaries, remove the two 4A7 tests/domain entry, and restore the Task 4A7 checkpoint wording. The 4A6 host and 4A5 output primitives remain independently usable.

**Next step:** Task 4A8 persistent process ownership and lifecycle audit; no task-level staging, commit, push, or publication.

## STEP-325 - Reconcile Phase 4A7 knowledge and rules

**Status:** complete locally; uncommitted and unpublished

**Goal:** run the required `neat-freak` checkpoint after Task 4A7 and reconcile active rules, plans, memory, append-only evidence, package/governance gates, and archive rollover state.

**Files changed:** `AGENTS.md`, `Memory.md`, the paired Phase 4 spec/plan, the master plan, `docs/memory/archive/phase-4-part-2.md`, and the new continuation header `docs/memory/archive/phase-4-part-3.md`.

**Implementation summary:** all active status pointers now identify Task 4A8 as next and distinguish verified one-shot ambient execution from unavailable persistent/sandbox authority. Historical Task 4A6 and Phase 5 design records remain unchanged. The active archive crossed its configured rollover threshold after this checkpoint, so Volume 2 is closed and Volume 3 is prepared for the next completed step.

**Verification commands:** `npm run build`; `npm run policy:check`; managed Node 20/24 focused 4A7 matrix; independent native control run `task4a7-control-20260717T034953761Z`; documentation/governance matrix; `git diff --check`; scoped secret-pattern scan and manual classification of known sentinel fixtures; memory/archive byte and line counts.

**Verification results:** build and policy passed. Managed ordinary matrices passed 28/28 per runtime and native control passed 1/1 per runtime. Documentation/governance passed 23/23. Diff check reported only existing LF-to-CRLF working-copy warnings and no whitespace errors. The secret scan found only explicit synthetic redaction-test sentinels and Phase 5 filenames containing the substring `worktree`; no credential value was introduced. `Memory.md` remains below 150 lines and 18 KB. Volume 2 is closed after this entry.

**Decisions made:** authorization-to-handler resource binding is now an active security rule for executable identity drift. One-shot output terminal records remain process records for pagination, not persistent running processes. Archive rollover preserves every earlier entry byte-for-byte.

**Risks or limitations:** the new Volume 3 contains no implementation claim until Task 4A8 completes. Existing broad worktree changes remain intentionally uncommitted until the complete Phase 4 boundary.

**Rollback method:** restore only current checkpoint wording and remove the empty Volume 3 header if no later entry uses it; never rewrite Volume 2 history.

**Next step:** Task 4A8 in Phase 4 Volume 3.
