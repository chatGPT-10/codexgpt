# Phase 5 Local Git Writes and Task Worktrees TDD Plan

**Status:** adversarially reviewed mandatory TDD plan; Phase 5A and 5B are locally complete; Phase 5C adversarial closure is next
**Date:** 2026-07-16
**Exact design:** `docs/superpowers/specs/2026-07-16-phase-5-git-and-task-worktrees-design.md`
**Entry gate:** satisfied by closure head `d19e65ba75938c35afa472d23d91d1724fe7fabf` and exact-head run `29603060944`; Gate G0 now proves the private Git execution capsule without adding a public tool or config

## 1. Deliverable

Phase 5 adds opt-in exact Tool Contract V4=51 with:

- typed, bounded local Git reads;
- exact local branch, stage, commit, restore, and owner-private stash operations;
- a capability- and identity-bound Git execution capsule;
- persistent managed task worktrees with session-local workspace handles;
- immutable merge review, exact-candidate verification receipts, clean-target integration, and safe removal;
- no typed remote/credential/force/branch-deletion capability.

Implementation is evidence-first:

```text
Git execution/canary gate
  -> exact V4 contract freeze
  -> typed read migration
  -> repository identity + state token + journal/audit
  -> branch/index/commit
  -> restore/stash
  -> managed-root/materializer
  -> task create/list/get
  -> merge prepare + exact checks
  -> merge execute + safe remove
  -> optional approved integrations
  -> adversarial closure
```

No V4 mutator is registered to a production handler until Gates G0, C4, and R pass.

## 2. Rules for every implementation task

1. Read `AGENTS.md`, `Memory.md`, current Git state, the exact task's source/tests, and the active archive volume before editing.
2. Confirm Phase 4 is closed and exact-head green before Task 5A0; a local Phase 4 checkpoint is not enough.
3. Add the narrow failing test first and retain the expected RED reason.
4. Keep V1=28, V2=31, and V3=39 exact. Never “temporarily” widen them while building V4.
5. Never invoke a free-form Git command, shell string, caller environment/config, arbitrary revision, remote, credential helper, or force option.
6. Treat Git execution, worktree identity, object quarantine/promotion, file mutation, index mutation, ref mutation, audit, and public projection as separate participants with explicit facts; the journal does not claim simultaneous visibility to external Git processes.
7. Run the narrow test, build, adjacent contract/policy/audit/transaction tests, `git diff --check`, secret/scope checks, and `npm run policy:check` after each task.
8. Run Git/Windows/path/process-sensitive tests on managed Node 20 and 24; destructive/lock/network/canary oracles belong in `control`, not the connector process.
9. Append each complete task to the active Phase 5 archive and update `Memory.md`. Start `docs/memory/archive/phase-5.md` only when Task 5A0 actually begins after Phase 4 closure.
10. Do not stage, commit, push, or publish a task-level Phase 5 slice. Publish once at the complete phase boundary under the existing authorization.
11. Apply the existing Policy Kernel taxonomy exactly: index-only staging is R2; every Git history/ref mutation and destructive file/worktree action is R3 with a fresh exact one-use local grant.

Managed ordinary shape:

```powershell
node scripts/long-task-runner.mjs list
node scripts/long-task-runner.mjs start --kind phase5-ordinary -- node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain ordinary
```

Control-domain work runs only in CI or a proven independent native terminal. Retain the exact run ID and bounded logs; stop only an exact owned run after proving it is still active.

## 3. Gates

| Gate | Blocks | Evidence |
| --- | --- | --- |
| 4P | all Phase 5 runtime work | exact Phase 4 closure SHA green on Ubuntu/Windows Node 20/24 |
| G0 | every V4 Git handler | exact executable/capability identity, raw-blob/private-index/object-only merge proof, and safe-capsule malicious-integration/remote canaries |
| C4 | V4 registration | exact 51, inherited contract freeze, strict schemas, supertool/profile/startup behavior |
| R | every Git mutation | repository/admin identity, state tokens, lock ordering, journal, audit, crash recovery |
| I | branch/stage/commit | exact ref/index CAS, blocked/secret scans, no implicit staging, identity rules |
| D | restore/stash | immutable preview, complete encrypted rollback, no pop/drop/clear/force |
| W | task lifecycle | managed root, raw materializer, owner/session handles, Windows path/delete/lock proof |
| M | merge execute | immutable candidate, exact receipts or approved skip, clean target, fast-forward/recovery |
| X | optional integrations | fresh R3 full-access facts and truthful no-isolation result |
| P | publication | complete local gate, neat-freak, one commit/push, exact-head CI |

Failure is supported but blocks dependent capabilities. No gate failure falls back to legacy `spawnSync`, full-access shell strings, ordinary recursive deletion, or remote Git.

## 4. Phase 5A — typed local Git domain

### Task 5A0 — Gate G0: prove the Git executable and safe execution capsule

**Goal:** establish whether the existing Phase 4 host can invoke local Git with a closed command/environment/config boundary before designing production handlers around it.

**Add:**

- `scripts/git-capability-spike.mjs`
- `scripts/git-execution-manifest-v1.json`
- `fixtures/git-canary-child.mjs`
- `fixtures/git-fake-askpass.mjs`
- `fixtures/git-fake-editor.mjs`
- `fixtures/git-fake-credential-helper.mjs`
- `test/git-execution-capsule.test.mjs`
- `test/git-execution-windows-control.test.mjs`

**Modify:**

- `scripts/test-domains.mjs`
- `test/test-domain-classification.test.mjs`
- `test/package-contents.test.mjs`
- `test/mutation-architecture.test.mjs` if new shipped process/file primitives appear

**RED cases:**

- exact Git path, stable file identity, digest, version, object-format/worktree/status porcelain features, raw object/index plumbing, machine-safe object-only merge, and replacement drift;
- caller PATH ambiguity (`cmd\git.exe` versus `bin\git.exe`) never changes the selected executable;
- inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, object/alternate/namespace/replace, SSH/askpass, proxy, trace, pager/editor, credential, and config variables are absent;
- repository-local/system/global hooks, reference-transaction hook, fsmonitor, LFS/custom filters, external diff/textconv, merge driver, signer, editor, pager, credential helper, askpass, aliases, and config includes execute zero canaries in safe mode;
- `hash-object -w --stdin --no-filters` without `--path`, private-index construction, `commit-tree`, expected-old ref update, and an object-only merge form execute zero clean/smudge/custom-driver canaries; the merge probe proves machine-safe success and NUL-delimited conflict output rather than assuming a Git version;
- inherited/caller object/index environment is absent, while exact service-generated private-index and object-quarantine paths work only under bound identities; rejected quarantined output promotes zero objects into the main ODB;
- a positive-control unrestricted invocation executes the canary so a broken oracle cannot pass;
- all generated commands are local allowlisted subcommands and direct argv; attempts to represent `push`, `pull`, `fetch`, `clone`, remote URLs, force, config mutation, or arbitrary flags fail before spawn;
- prompts and lazy fetch fail closed; stdout/stderr/time are independently bounded and redacted;
- executable replacement or capability drift revokes evidence and prevents spawn;
- Windows Job ownership/timeout/cleanup and current-user no-isolation metadata remain truthful.
- missing object-only merge support returns a capability failure; no probe or handler falls back to porcelain merge, checkout, reset, or worktree-updating `read-tree`.
- `merge-tree --write-tree --stdin` receives only exact full OIDs; tests prove that its NUL-delimited per-record status, not overall exit zero, distinguishes conflict from success and that human message text never drives authorization.

**Implementation:**

- Reuse the Phase 4 native host and executable-identity model; do not create a second process host.
- The spike may use a test-only builder but the exact manifest/schema/argument/environment rules must be promotable without semantic drift.
- Record feature evidence rather than relying only on a version threshold.
- Keep Gate G0 private; it adds no public tool or config.

**Verify:** focused active and managed Node 20/24 ordinary tests, Windows control oracle, build, syntax, package, mutation inventory, domain classification, policy, and diff check.

**Local completion evidence:** adversarially hardened capability revision `7e9f95bf7188bdd6035970eb38c5e3dfa5840996e7838273dc2757aa9b5d94f2` binds implementation revision `80456ec9c7e35f37bc618cbecc498d364268c473fa8ce700069cd894366aec25`, exact Git `2.55.0.windows.2`, and CXP4 host-manifest revision `8530a5c6d4c768d5e854719db2c4b447753a1a2a1d7e9b74b5b3218e79154e5b`. Final managed run `2026-07-17T21-03-15-107Z-phase5a0-adversarial-final-746beff5` passed Node 20/24 with 896 tests, 895 pass, 0 fail, and one established skip per major; stderr was empty and no log was truncated. Gate G0 remains private and package-excluded.

### Task 5A1 — Gate C4: freeze exact Tool Contract V4

**Goal:** add V4=51 without changing published V1/V2/V3 wire behavior or persisted readers.

**Add:**

- `src/tools/contracts/v4.ts`
- `src/tools/schemas/gitV4Common.ts`
- one strict schema module for each of the twelve V4 additions
- V4 variants for `git_status`, `git_diff`, `query_audit_events`, and `codexgpt`
- `test/phase-5-contract-v4.test.mjs`
- `test/phase-5-v4-inherited-contract.test.mjs`
- `test/phase-5-v4-persistence.test.mjs`

**Modify:**

- `src/config.ts`
- every affected file under `src/tools/contracts/`
- `src/tools/schemas/codexgpt.ts`
- `src/codexgptSupertool.ts`
- `src/server.ts`
- `src/productionRuntime.ts`
- versioned profile/config tests and package/static inventories

**RED inventory first:**

- enumerate every union/equality/switch/schema/fixture assuming only contracts 1/2/3;
- distinguish “inherits V2/V3 behavior” from persisted schema version and public output version;
- identify all V1/V2/V3 `git_status`/`git_diff` consumers and freeze their existing schemas/tool cards;
- forbid generic `version >= 4` where an exact contract or persisted pair is required.

**Contract RED cases:**

- V1 exact 28, V2 exact 31, V3 exact 39, unchanged names/profiles/schemas/aliases/failures;
- V4 exact 51: all V3 plus the exact twelve additions and no `bash`/`git_apply_patch`;
- standard exposes ten additions and full all twelve; minimal/connection expose none;
- inherited tools work directly and through `codexgpt`; no mutation alias exists;
- V4 `git_status`/`git_diff` select strict V4 schemas while older versions keep exact schema 1;
- unknown fields, raw flags/revisions/remotes/config/environment/executable inputs fail strict parsing;
- V4 nondefault; invalid config and missing enforce/audit/session/native/local-control/capability dependencies spawn zero children;
- same-binary rollback to V3 hides V4 tools while retaining V4 state/audit readers and cleanup.

**Implementation:**

- Add descriptor-driven `contractIncludesV2/V3/V4` predicates only where semantics truly inherit.
- Register disabled V4 handler slots after contract tests pass; no production effect yet.
- Keep V1 public default and current V3 activation exact.

**Verify:** exact contract suites, all V1/V2/V3 contract regressions, supertool/profile/connection-test tests, build, package, policy, and diff check.

**Local completion evidence:** exact V4=51 contract, profile projection, strict input/output schemas, V4 `git_status`/`git_diff`/audit/supertool projections, fail-closed disabled handler slots, V4-to-persisted-V3 transaction mapping, domain-separated audit cursors, and same-binary rollback readers are frozen. Managed Node 20.20.2 and Node 24.15.0 focused compatibility matrices each passed 45/45. Final ordinary run `2026-07-18T06-51-25-686Z-phase5a1-c4-final-4-96ce13f0` passed on both majors with 913 tests, 912 pass, 0 fail, and one established skip per major; stderr was empty and neither log was truncated. No V4 Git handler is active yet, and no staging, commit, push, or publication occurred.

### Task 5A2 — Migrate Git reads to typed, bounded, secret-safe providers

**Goal:** replace human-output parsing and direct PATH `spawnSync` for the V4 path while preserving older wire projections.

**Add:**

- `src/git/execution.ts`
- `src/git/capabilities.ts`
- `src/git/repositoryIdentity.ts`
- `src/git/parsers.ts`
- `src/git/readService.ts`
- `src/git/stateToken.ts`
- `test/git-repository-identity.test.mjs`
- `test/git-porcelain-parsers.test.mjs`
- `test/git-v4-read-tools.test.mjs`
- `test/git-secret-boundary.test.mjs`

**Modify:**

- `src/gitOps.ts`
- `src/server.ts`
- existing `git_status`, `git_diff`, `show_changes`, workspace/context/export consumers
- `src/redact.ts`
- existing Git contract tests only where implementation injection changes; old expected wire remains exact

**RED cases:**

- porcelain v2/raw/numstat `-z` parsing for spaces, tabs, newlines, Unicode, invalid UTF-8 policy, renames/copies, binary, modes, submodules, detached/unborn state, SHA-1/SHA-256;
- object reads use bounded batch size checks before content streaming; corrupt objects/packs, oversized blobs, pathological delta chains, and output/time/memory pressure fail with no retained secret or state token;
- exact entry/byte/time/output limits and explicit truncation/omission facts;
- full-workspace diff never emits blocked path content, `.env`, private keys, credentials, or secret-looking fixture values;
- malicious names/subjects cannot inject ANSI, terminal controls, bidi ambiguity, fields, logs, or JSON structure;
- repository root/gitdir/commondir ownership, reparse, mutable hard-link, alternate, replacement, partial/missing object, core.worktree, and case ambiguity fail safely;
- V4 mutation token binds exact repository/worktree/head/index/worktree digest/context/revisions/expiry and is `null` whenever the exact requested path/repository scan, ignored/untracked inventory, attribute inventory, or result is incomplete/truncated;
- path-subset tokens cannot authorize repository-wide restore/stash/task/merge work; a mutation presented with incomplete state returns `GIT_STATE_INCOMPLETE` before side effects;
- sparse checkout, sparse index, split index, reftable, and other unproved mutable formats remain readable as bounded facts but cannot mint a safe-mutation token;
- V1/V2/V3 projections remain exact even when backed by the new parser;
- read failures reveal no raw stderr, private root, config origin, executable path, or foreign state.
- existing local branches use opaque context-bound `branch_id` inputs; safe display names are secret/control screened and may be omitted, and raw existing refs/revisions are unrepresentable.

**Implementation:**

- Promote Gate-G0 builder and capability evidence without semantic changes.
- Use documented machine formats only; human text is display-only after sanitization.
- Keep the old schema constructors for V1–V3 and add explicit V4 projectors.
- Use a bounded attribute/integration inventory to neutralize executable filters for safe reads; hold the CodexGPT worktree lock and recheck inventory identities around Git.
- Mark the result `execution_isolation: none` and `repository_integrations: disabled`.

**Verify:** new focused suites, all existing Git/show-changes/context/export contracts, build, managed Node 20/24 ordinary run, policy/package/static/secret/diff checks.

**Local completion evidence:** V4 `git_status`, `git_diff`, `git_log`, and `git_branch` now use typed machine-format readers behind branded Gate-G0 capability evidence. Repository admission/revalidation, process-local read coordination, bounded `cat-file` batches, secret/blocked omission, opaque branch/repository IDs, complete-state tokens, and V4-only legacy projections are active; V1/V2/V3 providers and wire remain exact. The first complete ordinary candidate run `2026-07-18T12-19-14-420Z-phase5a2-ordinary-final-62b46a7f` exposed six adversarial failures and is retained only as repaired evidence. Final run `2026-07-18T12-41-24-298Z-phase5a2-ordinary-final-2-ddcc623b` passed Node 20.20.2 and Node 24.15.0 with 944 tests, 943 pass, 0 fail, and one established skip per major; stderr was empty and no output was truncated. No Git mutation handler, remote, credential, force, staging, commit, push, or publication occurred.

### Task 5A3 — Gate R: repository locks, operation journal, AuditEventV4, and recovery

**Goal:** create the durable coordination layer required before any index/ref/worktree mutation.

**Add:**

- `src/git/locks.ts`
- `src/git/objectQuarantine.ts`
- `src/git/repositoryStore.ts`
- `src/git/operationStore.ts`
- `src/git/recovery.ts`
- `src/git/resources.ts`
- `src/audit/lifecycleV4.ts`
- V4 audit query schema/projector/cursor
- `test/git-locks.test.mjs`
- `test/git-object-quarantine.test.mjs`
- `test/git-repository-store.test.mjs`
- `test/git-operation-store.test.mjs`
- `test/git-recovery.test.mjs`
- `test/git-policy-resources.test.mjs`
- `test/phase-5-v4-audit-persistence.test.mjs`

**Modify:**

- `src/audit/types.ts`
- `src/audit/schemas.ts`
- `src/audit/store.ts`
- `src/audit/queryTool.ts`
- `src/policy/types.ts`
- `src/policy/schemas.ts`
- `src/policy/toolPolicy.ts`
- `src/policy/authorizationFacts.ts`
- `src/policy/integration.ts`
- `src/productionRuntime.ts`
- state/package/mutation inventories

**RED cases:**

- repository-before-worktree-before-file lock ordering and exact process ownership;
- stale/foreign locks are diagnosed but never deleted without exact ownership proof;
- strict journal states, MAC/AEAD integrity, encrypted private path/index/undo fields, bounded counts/sizes, and no sensitive public/log fields;
- object quarantine promotion is journaled per immutable object, verifies an existing destination by object identity/content, never overwrites a mismatched object, and is recoverable before any candidate ref is created;
- crash at every transition before/after object/index/ref/file/audit effects converges to unchanged, committed, rolled back, or recovery-required;
- terminal audit failure after a durable Git effect freezes rather than falsely succeeding or blindly rewinding;
- persisted audit is the exact union `AuditEventV2 | AuditEventV3 | AuditEventV4`; V4 owns its authorization, terminal, and Git/task lifecycle events rather than silently widening an older event;
- V2/V3 audit projections verify the complete mixed-version chain, then skip V4 events before pagination; V4 has a domain-separated union projection/cursor and cannot consume older cursors;
- grants/tokens bind closed semantic facts and cannot be replayed across repositories/worktrees/owners/sessions/revisions.
- remote first-attempt R3 failures leak no new repository/ref/path facts; local approval cards show exact safe action/target/count/loss/check/integration/expiry facts, and retry consumes one exact semantic grant under concurrent replay.

**Implementation:**

- Reuse Phase 3 installation key, atomic state files, writer lock ownership, and participant-recovery concepts without inserting Git metadata into ordinary workspace transactions.
- Persist authorization before mutation and terminal/lifecycle evidence after reconciled effect.
- Add disabled V4 policy definitions first; handler activation remains blocked.

**Verify:** focused store/recovery/audit/policy tests including injected failures, adjacent Phase 3/4 recovery/audit suites, build, managed matrix, policy/package/mutation/secret/diff checks.

**Local completion evidence:** Gate R now owns exact repository→lexical-worktree→Phase-3-file lock ordering and reverse release, exact process ownership, authenticated/encrypted repository and operation records, stable opaque repository identity, journaled immutable object promotion, strict operation transitions, V4 authorization/terminal/lifecycle audit, exact V2/V3/V4 query compatibility, startup reconciliation, and persistent repository freeze when any participant, lock, durable effect, or terminal audit cannot be proven. The first final matrix attempt was stopped after a Node 20 `tsx` `.ts`/`.js` alias loader deadlock in `approval-multi-server.test.mjs`; a single package-excluded integration barrel fixed that root cause. The next complete run exposed Git-specific state-directory names inside the Phase 3 transaction module; moving that layout into `src/git/durableState.ts` restored the architecture boundary without weakening the test. Final run `2026-07-18T15-29-43-345Z-phase5a3-final3-535183ed` passed Node 20.20.2 and Node 24.15.0 with 969 tests, 968 pass, 0 fail, and one established skip per major; exit was 0, stderr was empty, and logs were untruncated. All V4 mutation handlers remain disabled; no repository ref, index, worktree, remote, credential, stage, commit, push, or publication action occurred.

### Task 5A4 — Gate I: local branch, stage, and commit

**Goal:** implement the non-destructive core local-write path with exact ref/index CAS and repeated secret enforcement.

**Add:**

- `src/git/branchService.ts`
- `src/git/indexService.ts`
- `src/git/commitService.ts`
- `test/git-branch-v4.test.mjs`
- `test/git-stage-v4.test.mjs`
- `test/git-commit-v4.test.mjs`
- `test/git-mutation-races.test.mjs`

**Modify:**

- `src/server.ts`
- `src/productionRuntime.ts`
- V4 policy/resource/authorization modules
- V4 schema modules and supertool maps

**RED cases:**

- branch creation expected-absent, secret-scanned `refs/heads/codex/*`, optional current-context base `branch_id`, Windows case collision, no raw existing-ref input/switch/upstream/delete/rename/overwrite, and fresh R3 grant;
- stage requires fresh complete state token and 1–256 literal guarded paths; no pathspec magic, implicit `-A`, chmod, submodule recursion, or unrelated entry;
- stage covers add/modify/delete and returns exact old/new index tree plus new token;
- stage rejects blocked paths, secret content, unsupported type/size, sparse/split index, external filters in safe mode, changed worktree/index, and unmerged state;
- stage's complete attribute/config inventory proves raw bytes need no built-in EOL or clean-filter transformation; otherwise it fails `GIT_NORMALIZATION_REQUIRED`/`GIT_INTEGRATION_REQUIRED` without object/index effects and points to the separately approved path;
- stage scans path/type/size/secret policy before object creation, hashes only exact accepted raw bytes with `hash-object -w --stdin --no-filters` and no `--path`, edits a private temporary index with generated NUL-delimited plumbing, verifies the exact resulting tree, and installs that index atomically only after expected-old identity still matches; `git add` is a failing canary;
- commit requires exact index token, non-empty staged tree, current local branch, fresh R3 grant, identity only from an explicit local CodexGPT profile or exact admitted repository-local keys, message over stdin, and no amend/signing/hooks/trailers/dates/`-a`;
- system/global identity, includes/conditional includes, inherited author/committer environment, and caller identity never participate; absence returns `GIT_IDENTITY_REQUIRED`;
- commit rescans staged blobs independently and rejects an externally staged secret;
- commit secret-scans the complete message before `commit-tree`, creates no object on rejection, and never returns the message through V4 result/audit; `git_log` redacts or omits secret-bearing subjects;
- ref/index races at every fault point never produce false success; immutable orphan objects are tolerated and reported only internally;
- audit/result exclude commit message, emails, raw diffs, config origins, and private paths.

**Implementation:**

- Use generated object/ref/index plumbing only through the safe capsule and exact expected-old facts. Safe stage never uses checkout-oriented porcelain or repository filters.
- Bind staged-tree identity to the commit; never stage as a side effect of commit.
- Enable the three handlers only after all Gate-I cases pass.

**Verify:** focused Git mutations, legacy Git contracts, Policy/Audit/Recovery/Phase 3 regressions, build, managed Node matrix, package/policy/mutation/secret/diff checks.

### Task 5A5 — Gate D: bounded restore and private stash

**Goal:** support reversible cleanup and bounded private-stash lifecycle without exposing reset/clean/pop/shared-stack drop/clear or stash races.

**Add:**

- `src/git/restoreService.ts`
- `src/git/stashService.ts`
- `src/git/reviewToken.ts`
- `test/git-restore-v4.test.mjs`
- `test/git-stash-v4.test.mjs`

**Modify:**

- `src/server.ts`
- `src/productionRuntime.ts`
- Git journal/recovery/policy/audit/schema modules
- Phase 3 change-set participant adapters where required

**RED cases:**

- prepare tokens bind exact affected paths, bytes, index/head/worktree identities, rollback capacity, owner/session/revisions, and expiry;
- restore only `index_from_head` or `worktree_from_index`; no arbitrary source/root reset/combined reset/force;
- `worktree_from_index` and stash apply fail before effects when EOL/smudge checkout transformation would be required; `index_from_head` remains private-index CAS only;
- every overwritten byte has encrypted retained undo material before R3 execution; size/type/secret/path/identity failure is pre-side-effect;
- stash uses opaque owner/task refs under `refs/codexgpt/stash/*`, never shared `refs/stash`;
- create records the bound worktree/task, base, selected index tree/entries, selected worktree/untracked tree, modes, identities, and private ref/OIDs; it includes only exact reviewed tracked/untracked paths and never ignored/blocked/secret paths;
- create cleans selected paths to current `HEAD` only after private ref and complete rollback are durable, preserves unselected entries, and retains staged-versus-unstaged state;
- apply is same-worktree/task only, object-only three-way/no-clobber previewed in quarantine, completely rescans synthesized output, promotes accepted objects only during execute, restores both selected index/worktree planes, retains its ref after success, and has complete rollback; shared-stack pop/drop/clear are unrepresentable;
- exact `prepare_forget`/`execute_forget` accepts one opaque owner-bound private stash, binds expected ref/OID and loss warning, requires fresh R3, records rollback CAS/tombstone, runs no GC, and cannot select by stack position/pattern/count;
- per-repository/per-owner private-stash quotas fail before create and direct the user to exact reviewed forget rather than automatic deletion;
- safe stash create/apply never calls porcelain `git stash`; it uses raw blobs, private indexes, private refs, and the same journaled file/index participant machinery as stage/restore;
- token replay/race/crash/audit failure converges without silent data loss.

**Implementation:**

- Reuse Phase 3 encrypted change-set material for worktree restoration and a separate encrypted index snapshot participant where required.
- Keep both tools full-profile only and R3 for destructive execute actions.

**Verify:** focused suites, change-set/transaction recovery, Git core mutations, build, managed matrix, package/policy/mutation/secret/diff checks.

## 5. Phase 5B — managed task worktrees

### Task 5B0 — Gate W0: managed root, tree preflight, and raw blob materializer

**Goal:** prove that CodexGPT can create and remove only its own task tree without executing filters or traversing hostile Windows objects.

**Add:**

- `src/worktrees/root.ts`
- `src/worktrees/treeManifest.ts`
- `src/worktrees/materializer.ts`
- `src/worktrees/remover.ts`
- `scripts/worktree-delete-control.mjs`
- `test/worktree-root.test.mjs`
- `test/worktree-materializer.test.mjs`
- `test/worktree-windows-control.test.mjs`

**Modify:**

- native identity/control manifest and package/mutation/domain inventories
- `src/config.ts` for bounded startup-only root/quota settings

**RED cases:**

- managed root ownership, local fixed volume, non-reparse, outside repository/control/audit/key/credential roots, no remote argument control;
- full tree preflight for `.git` aliases, case/normalization collisions, device/ADS/trailing-dot-space/long paths, symlink/reparse/unsupported modes, blocked/secret paths/content, submodules, missing objects, count/blob/total limits;
- gitlinks produce only manifest-known empty inert directories; task file tools cannot traverse/mutate beneath them, and V4 cannot init/update/stage/restore/stash or merge a changed gitlink;
- SHA-1/SHA-256 batch object reads are bounded and raw; no clean/smudge/LFS process runs;
- materialization is journaled, no-clobber, exact-byte, crash recoverable, and reports filter/submodule limitations;
- recursive-delete canary outside a junction/symlink/mount survives; unexpected reparse/hard-link/nested repo/ignored/untracked entry blocks deletion;
- held-file/directory locks return bounded diagnostics and no retry/kill/force.

**Implementation:**

- Preflight the entire candidate tree before `git worktree add` side effects.
- Stream exact raw blobs through bounded same-volume staging and final identity checks; do not buffer an unbounded repository in memory.
- Use the native handle-safe remover proved by the control oracle for the task tree and, as a separate stable-identity journal participant, its exact CodexGPT-owned common-dir administration directory. Never delegate either to generic recursive delete or `git worktree remove`, and never run global `worktree prune/repair` for one task.

**Verify:** active/managed ordinary tests, Windows control canaries under Node 20/24, build, package/mutation/domain/policy/secret/diff checks.

### Task 5B1 — Create, list, get, and recover task worktrees

**Goal:** implement persistent owner-bound task artifacts and session-local workspace issuance without changing `allowedRoots`.

**Add:**

- `src/worktrees/store.ts`
- `src/worktrees/manager.ts`
- `src/worktrees/service.ts`
- `src/worktrees/recovery.ts`
- `test/task-worktree-store.test.mjs`
- `test/task-worktree-lifecycle.test.mjs`
- `test/task-worktree-workspace-integration.test.mjs`
- `test/task-worktree-recovery.test.mjs`

**Modify:**

- `src/guard.ts`
- `src/server.ts`
- `src/productionRuntime.ts`
- Policy/resource/authorization/audit/schema/supertool modules
- workspace list/get/close tests

**RED cases:**

- random opaque repository/task/workspace IDs; owner/server/session/policy/evidence binding and opaque foreign failures;
- persistent tasks bind the versioned stable owner abstraction rather than raw credentials or transport sessions; token rotation, restart, foreign identity, same-binary rollback, and future unknown owner-binding versions fail without task/path/count leakage;
- generated `codex/<slug>-<suffix>` collision safety; base must be a clean committed named local target branch whose exact ref is permanently bound to the task record;
- expected-absent generated branch creation is a distinct R3 journal participant; only then may `worktree add --no-checkout --lock` attach the already-existing branch, followed by raw materialization and per-worktree index/HEAD/common-dir reconciliation;
- the first request may create only an immutable R2 preflight manifest; local R3 approval binds exact tree/root/quota/branch/owner/revision facts, and retry revalidates before the first branch/admin/root effect;
- the combined `worktree add -b` form is unrepresentable; a later failure retains the exact generated branch as a bounded recovery fact instead of silently deleting it;
- create retries/crashes around branch ref, admin dir, target root, registry, workspace issuance, and audit;
- task artifact persists across restart while old workspace handle dies; `get` issues a new current-session handle;
- task handle uses ordinary PathGuard/transactions/audit and never modifies/persists `allowedRoots`;
- list/get reveal only owner tasks, return remote workspace handles without canonical managed paths, and leak no foreign count/path/ref facts; only local owner-side control may display the revalidated path;
- policy/Git/root identity drift revokes handles and blocks mutation without deleting the task.

**Implementation:**

- Extend `WorkspaceManager` with an injected task-worktree authority parallel to, but distinct from, confirmed roots.
- Store necessary canonical task paths sealed in private state; public/audit projections use opaque IDs.
- Enable create/list/get only after startup recovery completes.

**Verify:** focused lifecycle/recovery/workspace tests, existing Phase 2/4 workspace and path suites, build, managed matrix, package/policy/mutation/secret/diff checks.

### Task 5B2 — Verification receipts and immutable merge preparation

**Goal:** produce an exact reviewable candidate without mutating the live target.

**Add:**

- `src/worktrees/verificationReceipts.ts`
- `src/worktrees/mergePlanStore.ts`
- `src/worktrees/mergePrepare.ts`
- `test/verification-receipts.test.mjs`
- `test/task-worktree-merge-prepare.test.mjs`
- `test/task-worktree-merge-conflicts.test.mjs`

**Modify:**

- Phase 4 run/process terminal result internals to issue optional receipts without changing V3 wire
- V4 process result projection if a public receipt is needed
- server/policy/resource/authorization/audit/schema modules

**RED cases:**

- receipt binds exact candidate OID, clean state, command subject, exit zero, terminal audit, backend/environment/policy/capability/owner/worktree identity and expiry;
- a branch-name-only, dirty, failed, foreign, stale, replayed, or pre-candidate receipt never passes;
- merge target is the task record's bound local target branch and is not caller-selectable; rename/deletion/rebinding drift fails closed without probing another ref;
- fast-forward candidate equals task head only when exact ancestry holds;
- divergent candidate uses the Gate-G0-proved object-only merge capability inside a sealed object quarantine with exact target first parent/task second parent, hooks/autostash/rerere/integrations/network disabled, and affected custom drivers rejected; porcelain `git merge` against any checkout is a failing canary;
- merge-produced blobs/tree and the strict optional merge message pass complete path/secret/shape checks before journaled immutable-object promotion and expected-absent candidate-ref creation; the absent-message default is exact `Merge CodexGPT task worktree`, the message is absent from result/audit, and rejection leaves the main ODB/ref set unchanged;
- merge `commit-tree` uses the same reviewed local identity, caller-date prohibition, no-signing rule, and private-stdin message handling as `git_commit`;
- unavailable machine-safe object merge fails `GIT_MERGE_CAPABILITY_UNAVAILABLE`; it never falls back to a live target/task checkout, while fast-forward preparation remains available;
- conflicts return bounded typed paths, do not mutate target, and clean recoverable integration state;
- candidate path/secret scan and typed target-to-candidate diff are complete before plan issuance;
- both fast-forward and divergent candidates completely traverse the bounded target-to-candidate commit set and secret-scan commit messages/typed metadata; count/byte/time truncation or a secret-bearing message issues no plan;
- plan is immutable, context-bound, thirty-minute absolute TTL, and cleanup never deletes task/user commits.
- divergent `prepare` first computes and scans only in sealed quarantine under R2, returns/stores an immutable review, then requires a fresh candidate-bound R3 retry to promote objects, create the private ref, and issue exactly one plan; concurrent retry/replay produces one finalization;
- deny/expiry/drift/abandon cleanup removes only the exact quarantine and no repository state; fast-forward preparation creates no object/ref and remains R2, while execute remains R3;
- R3 prepare approval discloses and binds exact app-owned candidate-ref expiry; expiry/success cleanup uses expected-ref/OID CAS plus journal/audit, runs no GC, and retains uncertain refs for recovery.

**Implementation:**

- Keep V3 process wire exact; add an internal terminal evidence hook and expose receipt only in V4 result schemas where required.
- Create the candidate tree/commit in quarantine, rescan it, promote only accepted immutable objects, and retain it by expected-absent private ref. This makes prepare an R3 history/ref mutation with a fresh exact grant.
- Raw-materialize an integration worktree only after the candidate OID exists, and use it solely for checks bound to that OID. Task branch remains the durable user work.

**Verify:** focused receipt/merge tests, Phase 4 process/audit/cursor suites, Git/worktree recovery, build, managed matrix, package/policy/mutation/secret/diff checks.

### Task 5B3 — Gate M/W: merge execute and clean task removal

**Goal:** update a clean target to the exact prepared candidate and remove only a proven clean managed checkout.

**Add:**

- `src/worktrees/mergeExecute.ts`
- `test/task-worktree-merge-execute.test.mjs`
- `test/task-worktree-remove.test.mjs`
- `test/task-worktree-windows-locks.test.mjs`

**Modify:**

- task manager/service/recovery/journal/audit/policy/schema modules
- native Windows lock diagnostics and control tests

**RED cases:**

- execute requires exact unexpired plan, exact target/task/candidate refs/OIDs, a complete clean checked-out target with no untracked/ignored collision paths or a twice-proved unchecked-out target, valid receipts or explicit locally approved skip, and fresh R3 grant;
- exact worktree inventory is stable: a target checked out in the admitted primary worktree uses the full file/index/ref path, a target proved unchecked-out twice uses ref-only CAS, and foreign/ambiguous/changing checkout ownership fails closed;
- checked-out target deltas with applicable EOL, LFS/smudge, or other checkout transformations fail the safe path before file effects; raw candidate blobs are never silently substituted for the repository's expected checked-out representation;
- target moves only from expected-old to candidate; no autostash/rerere/hook/filter/driver/signing/editor/pager/network and no checkout/reset/live-worktree `read-tree` porcelain;
- prepare constructs the complete raw target-to-candidate file transaction, complete candidate private index, encrypted rollback material, and expected-old ref update before execute;
- execute journals guarded Phase 3 file mutation, atomic index replacement, expected-old ref CAS, and terminal audit as distinct participants; injected failures distinguish unchanged, rolled back, effect-observed/audit-pending, and recovery-required without claiming simultaneous visibility to external Git processes;
- no target mutation on stale target/task/candidate, failed check, secret/path drift, lock/path limit, or capability/policy drift;
- remove requires exact task identity/generation/head, clean index/worktree, zero untracked/ignored/reparse/foreign/nested entries, no active owned process/input/plan/mutation, and R3;
- remove's first call creates only an immutable complete review; the local R3 card distinguishes checkout/registration removal from retained branch/commits/stashes, and retry revalidates before handle revocation or deletion;
- removal revokes handles/drains owned Jobs, keeps branch/stash/task commits, never uses force, and records tombstone;
- task root and exact CodexGPT-owned common-dir administration directory are removed as separate identity-bound participants; inventory reconciliation proves only that registration disappeared, with a canary proving unrelated worktree metadata survives;
- Windows held handles/junction canaries fail safely without killing a process or touching external files.

**Implementation:**

- Use the raw file/index/ref participant builder; do not ask Git porcelain to update the checked-out target. Ref CAS is last among live Git state participants and only after exact file/index reconciliation; audit failure after durable effect freezes for recovery.
- Keep task branch/worktree after merge; removal remains a separate explicit action.

**Verify:** focused merge/remove/recovery/control suites, all Git/worktree/process/workspace/policy/audit/transaction tests, build, managed ordinary/control matrices, package/policy/mutation/secret/diff checks.

### Task 5B4 — Gate X: optional approved repository integrations

**Goal:** support repositories that require hooks/filters/signing/merge helpers without pretending those programs are confined.

**Add:**

- `src/git/integrations.ts`
- `test/git-integrations-approval.test.mjs`
- `test/git-integrations-full-access.test.mjs`

**Modify:**

- Git services needing integration selection
- V4 schemas, policy resources/facts, local approval projection, audit, production runtime

**RED cases:**

- default remains off and executes zero integrations;
- request requires config/profile enablement, action scopes, `shell:execute`, `host:full-access`, exact discovered integration identity/digests, and fresh local R3 grant;
- approval display is bounded/control-safe and reports no filesystem/credential/registry/network/broker-escape isolation;
- integration or Git identity drift burns the grant before spawn;
- remote subcommands/config/credential mutation remain structurally impossible in typed builders;
- no claim that hashing one hook proves transitive behavior or human presence;
- full-access process escape/lifetime limitations match Phase 4 exactly.

**Implementation:**

- Reuse Phase 4 full-access host/approval/result metadata; do not create an intermediate pseudo-sandbox.
- The completed Gate X executor accepts exactly four discriminated requests: private-index stage, shadow-Git-dir commit, quarantined object-only merge, and private-destination checkout. Unknown operations and missing private state fail closed; callers provide no command/subcommand/argv, remote, credential, force, or config-mutation input.
- Each run requires explicit `approved_full_access`, exact integration discovery/revalidation, an exact fresh R3 grant, and approval/result text that states ambient current-user authority with no filesystem, credential, registry, network, or broker isolation.
- If this task cannot meet Gate X, keep integrations unsupported and close Phase 5 only if the user explicitly accepts that reduced compatibility. Do not silently run them.

**Verify:** focused integration/approval/process tests, Phase 4 full-access contracts, Git mutations/worktrees, managed matrix, build, package/policy/mutation/secret/diff checks.

## 6. Phase 5 closure

### Task 5C0 — Full adversarial acceptance matrix

Run cross-cutting attacks with positive controls:

- malicious Git executable replacement and PATH ambiguity;
- repository ownership/gitdir/commondir/config/include/alternate/replace/partial-clone/ref-storage drift;
- hooks/reference-transaction/filter/LFS/merge-driver/fsmonitor/signing/editor/pager/credential/askpass/proxy/SSH/trace/environment execution;
- CRLF/EOL/clean/smudge normalization drift between raw task blobs, the index, and a checked-out target;
- remote/force/config/credential/revision/pathspec argument injection;
- blocked paths, staged external secrets, secret-bearing diffs/messages/output, invalid UTF-8/control/bidi filenames;
- merge-synthesized secret blobs and rejected commit messages leave no promoted object, commit, or ref; quarantine cleanup/recovery has a positive external-object canary;
- SHA-1/SHA-256, detached/unborn, unmerged, sparse checkout/index, split index, reftable, submodule, binary, oversized/count/scan limits;
- concurrent external ref/index/worktree mutations and every journal/audit crash point;
- task owner/session/server/policy/capability staleness and restart recovery;
- merge target/task/check drift, conflict, ignored/untracked overwrite collisions, stale receipts/plans;
- Windows case-only refs/paths, reserved/ADS/trailing names, long paths, reparse/junction/symlink/hard-link/mapped/removable roots, held files/directories, antivirus-style retry pressure;
- deletion/remote/network/child-execution canaries with independent positive controls.

Every expected skip must be a real platform-capability skip, not an assertion bypass. Gate failures stop closure.

### Task 5C1 — Reconcile user documentation and project knowledge

Only after runtime evidence, update:

- `README.md`
- `README_ZH.md`
- `SECURITY.md`
- `design.md`
- `AGENTS.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- active Phase 5 archive volume

Documentation must distinguish:

- worktree workflow isolation from OS process isolation;
- safe capsule from sandbox;
- disabled repository integrations from approved ambient full access;
- typed local-only Git surface from separately approved unrestricted commands;
- clean checkout removal from branch deletion;
- merge preparation/candidate checks from live-target execution;
- CodexGPT locks from external-process exclusion;
- rollback configuration from deletion of persistent tasks/branches/stashes/audit.

Run `neat-freak`, then rerun every documentation/policy/static gate affected by its edits.

### Task 5C2 — Full local gate

Run with fresh evidence, in order:

1. V1/V2/V3/V4 exact contract and persisted-state compatibility tests;
2. Git execution/identity/parser/read/state-token suites;
3. branch/stage/commit/restore/stash/policy/audit/recovery suites;
4. worktree materializer/lifecycle/merge/remove suites;
5. `npm run build`;
6. managed Node 20/24 ordinary domain through the detached runner;
7. managed Node 20/24 Windows/control domain only in approved independent/CI execution;
8. complete protected Smoke and package tests;
9. `npm run policy:check`;
10. `git diff --check`;
11. secret scan that emits only safe file/line locations;
12. TypeScript/scripts/PowerShell/C# process/mutation/deletion inventories;
13. intended scope, archive rollover, `Memory.md` size, Markdown links, and rule-path checks;
14. neat-freak reconciliation and all affected gate reruns.

Classify every result as passed, code-failed, not run, environment-blocked, or platform-skipped.

### Task 5C3 — Publish once and require exact-head CI

Under the existing complete-phase authorization:

1. confirm exact Phase 5 scope and no unrelated Phase 4/user changes are omitted or swept in accidentally;
2. stage the intended complete phase;
3. create one concise English Phase 5 commit;
4. push the current branch;
5. invoke exact-head diagnostics with the exact 40-character HEAD;
6. require Ubuntu/Windows Node 20/24 Build, complete Regression, protected Smoke, Package, policy, and registered control evidence;
7. keep bounded evidence only below ignored `.ai-bridge/` and do not create an evidence-only follow-up commit;
8. begin Phase 6 only after exact-head terminal success.

## 7. Cross-cutting matrix

| Dimension | Required values |
| --- | --- |
| contract | V1=28, V2=31, V3=39, V4=51 |
| profile | connection-test, minimal, standard, full |
| Git mode | read, local; integrations off, approved full-access |
| object/ref | SHA-1, SHA-256; loose/packed refs; unsupported reftable failure |
| repository | primary, owned task, bare/foreign/external-gitdir rejection, partial/missing objects |
| HEAD/index | branch, detached, unborn, unmerged; clean/dirty/stale/raced/locked |
| content | text, binary, executable, submodule, symlink rejection, LFS/filter indication, secret/blocked |
| path | ASCII/Unicode/control, case collision, reserved/ADS/trailing, long, reparse/hard-link/mapped/removable |
| task | active, handle-closed, restart-restored, policy/evidence stale, dirty, locked, removed, recovery-required |
| merge | fast-forward, divergent clean candidate, conflict, stale plan/receipt/target/task, approved check skip |
| failure | before/after object, index, ref, file, task-store, audit, cleanup; child/host/server crash |
| platform | Windows native and Ubuntu CI; managed Node 20/24; current probed Git capability |

## 8. Final rollback

- Turn Git mode to `read`; reject new mutations and expire pending state/review/grant tokens.
- Let exact owned in-flight journals reconcile; freeze uncertain repositories rather than guessing.
- Revoke session-local task handles only after input quarantine and owned-Job drain; retain task artifacts.
- Restore V3 tool registration while retaining V4 state/audit readers and cleanup.
- Do not delete or reset branches, refs, task worktrees, custom stash refs, merge refs, user files, config, credentials, toolchains, or audit/recovery evidence.
- Older-binary downgrade is not claimed. Same-binary configuration rollback is mandatory.

## 9. Completed adversarial review

The review was run against the completed first-principles draft and repaired both this plan and the exact design before either was marked authoritative. Publication-blocking findings and their enforced tests are:

| Finding | Repair enforced by this plan |
| --- | --- |
| ref/history actions were below the Policy Kernel's R3 floor | branch, commit, task create, divergent-candidate finalization, merge, destructive restore/stash, private-ref forget, removal, and integrations require fresh exact one-use R3 grants |
| `git add`, stash, checkout, or live merge could execute repository code or apply filters | raw blob/private-index services, object-only merge, canaries, and no checkout-oriented safe-path fallback |
| truncated status could authorize unseen data | `state_token: null` for incomplete scope and `GIT_STATE_INCOMPLETE` before every mutation |
| combined worktree/branch and generic removal blurred crash ownership | split journal participants, retained generated branch on uncertain failure, and proved handle-safe deletion only |
| V4 audit compatibility was ambiguous | exact persisted union, V4-owned auth/terminal/lifecycle events, and verify-then-filter old readers |
| sparse/split index, reftable, and object-merge gaps had no closed failure | mutation-token refusal and stable capability errors with actionable `next_action` |
| live target update implied atomicity Git cannot provide across external processes | explicit file/index/ref/audit participants, complete rollback, identity rechecks, and truthful intermediate-visibility/recovery semantics |
| merge could synthesize a secret object before post-merge scanning | sealed object quarantine, complete pre-promotion scan, immutable-object promotion journal, and pre-object commit-message scan |
| one-stage approval could not bind a not-yet-created merge candidate | R2 quarantine review followed by an exact candidate-bound R3 promotion/ref/plan retry |
| raw writes could silently diverge from EOL/LFS/filter checkout semantics | complete attribute/config proof or a stable normalization/integration failure before effects |
| caller-selected merge targets could redirect a task into another branch | immutable task-bound target ref plus opaque existing-branch IDs and drift failure |
| private stash/candidate refs could grow or disappear without an exact lifecycle | explicit quotas, reviewed one-ref forget/expiry CAS, journal/tombstone/audit, no GC, and retained uncertain state |

Residual limits are deliberate: the safe capsule is not an OS sandbox, task worktrees share Git metadata, approved integrations run with ambient `full_access`, and typed remote prohibition does not constrain a separately approved unrestricted process. Any implementation that weakens those statements fails Gate P.
