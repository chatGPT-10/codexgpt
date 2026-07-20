# Phase 5 Local Git Writes and Task Worktrees Design

**Status:** adversarially reviewed exact design; Tasks 5A0 / Gate G0 through 5A3 / Gate R are locally complete; Task 5A4 / Gate I is next
**Date:** 2026-07-16
**Scope:** local Git inspection and mutation plus managed task-worktree lifecycle
**Compatibility baseline:** closed Phase 3, completed and exact Phase 4 publication, Tool Contracts V1=28/V2=31/V3=39, Policy Kernel `enforce`, durable audit, atomic filesystem/state primitives, stable request identity, native Windows execution, and local R3 approval

## 1. Final architecture decision

Phase 5 is not a command-string wrapper around `git`. It adds three deliberately separate components:

1. **A typed local-Git domain.** Tool Contract V4 adds exact local branch, index, commit, restore, and stash operations. Inputs are closed schemas; callers cannot supply flags, arbitrary revisions, config, environment, remotes, or executable paths.
2. **A Git execution capsule.** CodexGPT invokes one identity-bound Git executable through the Phase 4 native host with a fixed environment, fixed command builders, bounded input/output, disabled prompts/network/lazy fetch, and repository integrations disabled by default. This is a policy and execution-control boundary, not an OS sandbox.
3. **A persistent task-worktree manager.** CodexGPT creates opaque, owner-bound task artifacts below a startup-configured local managed root, then issues session-local workspace handles for them. Task artifacts may survive server restart; workspace handles do not.

The default user flow is:

```text
inspect typed status
  -> create managed task worktree and generated codex/* branch
  -> edit through ordinary guarded workspace tools
  -> stage exact paths against a fresh state token
  -> commit the exact staged tree
  -> prepare an immutable merge review
  -> run checks against the exact candidate
  -> locally confirm and fast-forward the clean target to that candidate
  -> remove only the clean managed checkout; keep the branch
```

The design never equates a worktree with isolation. Project code run inside a task worktree has exactly the Phase 4 execution mode selected for that process.

## 2. First-principles derivation

### 2.1 Required outcome

An authenticated client must be able to turn a real local change into a reviewable local commit without being able to:

- smuggle arbitrary Git flags or revision expressions;
- mutate remotes, credentials, global/system config, or user identity;
- stage or expose blocked/secret content;
- overwrite unrelated working-tree or index changes;
- confuse one repository, worktree, branch, owner, session, or server with another;
- delete a dirty or foreign directory;
- claim that hooks, filters, worktrees, or Git locks are security sandboxes;
- report success when Git state changed but audit/recovery state did not converge.

### 2.2 Fundamental facts and consequences

| Fact | Required consequence |
| --- | --- |
| Git has three independently mutable planes: worktree, index, and refs/objects. | Every mutation binds and rechecks all affected planes; “clean” is never inferred from one command or one OID. |
| Git worktrees share the common object database and most refs but own separate `HEAD` and index state. | Locks and manifests bind both repository identity and worktree identity; repository-wide ref operations serialize across worktrees. |
| Git hooks, clean/smudge filters, merge drivers, fsmonitor, signing, editors, pagers, credential helpers, and config includes may execute code. | Safe typed operations disable or reject them. Running them is a separate ambient-authority R3 path with truthful `full_access` semantics. |
| A worktree is a directory plus shared Git metadata, not a containment primitive. | It is never called a sandbox and never changes process authority. |
| `git worktree remove` protects ordinary dirty worktrees but `--force` bypasses that protection. | Phase 5 exposes no force removal and never deletes a branch as part of checkout removal. |
| Merge/restore against a dirty target can destroy or entangle unrelated work. | Destructive operations require an exact clean-state token and a second pre-side-effect recheck. |
| A successful local commit is recoverable through refs/reflogs, but an index/worktree overwrite may not be. | Commit/branch operations use expected-old ref updates; destructive file changes require retained encrypted undo material or fail before mutation. |
| Git porcelain intended for humans is configuration-sensitive and unsafe to parse. | Machine reads use documented NUL-delimited porcelain/raw forms; free-form text is never the source of an authorization fact. |
| Git can lazily fetch missing partial-clone objects. | Every typed operation is local-only, disables lazy fetch, and fails on missing objects. |
| Checkout-oriented porcelain may run clean/smudge filters or expose a checked-out target to partially applied state. | Safe staging, stash, task materialization, and target integration use raw blobs, private indexes, object-only merge, and journaled file/index/ref participants rather than porcelain checkout/add/stash/merge. |
| A bounded scan is not evidence about data it did not inspect. | Mutation tokens are issued only for a complete scan of their exact semantic scope; incomplete or truncated reads return no mutation-capable token. |
| Windows paths, case folding, reparse points, locks, and path length can invalidate a seemingly valid Git plan. | Native identity/path probes and Windows-specific destructive oracles block publication. |
| V1, V2, and V3 are published exact contracts. | V4 is opt-in; older tool names, schemas, profiles, failure behavior, and persisted readers remain exact. |

### 2.3 Threat boundary

The protected adversary includes:

- an authenticated remote client attempting path, ref, flag, revision, output, or confused-deputy injection;
- a malicious repository containing hostile names, config, attributes, hooks, filters, merge drivers, submodule metadata, replacement refs, alternates, or partial-clone state;
- stale, foreign, replayed, reordered, or concurrently retried state/review/merge tokens;
- a task directory replaced with a junction, symlink, mount, hard link, or different stable object;
- a crash or audit failure between Git object creation, index installation, ref update, worktree materialization, and terminal recording;
- another Git process changing a ref/index while CodexGPT is preparing or executing a request;
- output floods, invalid UTF-8, terminal control bytes, malicious filenames, and secret-bearing diffs or commit subjects.

The design does not claim protection from:

- a compromised Git executable that passed the current executable-identity policy;
- an administrator, kernel compromise, or another unrestricted process running as the same user;
- repository code the user explicitly authorizes through Phase 4 `full_access`;
- Git remote operations the user separately runs through an approved unrestricted process.

## 3. Scope, dependencies, and non-goals

### 3.1 Blocking dependencies

Phase 5 implementation may begin only after the complete Phase 4 closure SHA passes exact-head Ubuntu/Windows Node 20/24 CI. It requires:

- V3 native one-shot execution and stable executable identity;
- V3 local R3 decisions and atomic grant consumption;
- durable authorization, terminal, and lifecycle audit;
- Phase 3 installation key, atomic state files, participant recovery, and encrypted change-set storage;
- `WorkspaceManager` per-server lifecycle isolation;
- native Windows directory/file identity and handle-safe deletion evidence.

If Phase 4 closes with an explicitly approved reduced scope that lacks a required dependency, the dependent Phase 5 capability remains unavailable. It does not fall back to raw `spawnSync`, shell strings, or unguarded recursive deletion.

### 3.2 In scope

- Typed status, diff, local log, and local branch reads.
- Local branch creation without switch, rename, deletion, or upstream mutation.
- Exact-path staging and exact-index commit.
- Bounded restore and private per-task stash operations.
- Managed task-worktree create/list/get/merge/remove.
- Local-only Git capability probing, stable executable/repository identity, locks, journals, recovery, audit, quotas, and Windows diagnostics.
- Optional execution of repository Git integrations only through separately approved ambient `full_access`.

### 3.3 Non-goals

- `push`, `pull`, `fetch`, `clone`, remote prune, remote branch deletion, force push, or any other remote mutation.
- Remote/credential/helper configuration or mutation.
- Branch deletion, rename, reset, rebase, cherry-pick, revert, tag mutation, submodule init/update, or force worktree removal.
- Arbitrary Git command, flag, pathspec magic, revision expression, config key, environment variable, or executable selection.
- Automatic conflict resolution.
- Automatic branch deletion after merge or worktree removal.
- Treating Git locks as exclusion from external same-user programs.
- Treating a worktree, local approval, hook digest, or successful test as a security sandbox or proof of human presence.
- Making Tool Contract V4 or local Git writes the public default.

## 4. Tool Contract V4

### 4.1 Exact inventory

- V1 remains exact 28.
- V2 remains exact 31.
- V3 remains exact 39 and keeps `bash` absent.
- V4 inherits all 39 V3 tools and adds exactly twelve tools, for exact **51**:

```text
git_log
git_branch
git_create_branch
git_stage
git_commit
git_restore
git_stash
create_task_worktree
list_task_worktrees
get_task_worktree
merge_task_worktree
remove_task_worktree
```

The historical outline's `git_apply_patch` is rejected. Existing `apply_patch` performs guarded atomic file mutation; `git_stage` records selected results in the index. A second patch tool would duplicate authority and bypass the established transaction boundary.

### 4.2 Profile projection

- `connection-test`: no V4 additions; it remains read-only and intentionally small.
- `minimal`: no V4 additions.
- `standard`: all V4 additions except `git_restore` and `git_stash`.
- `full`: all twelve V4 additions.

Visibility is not authorization. Every direct tool and `codexgpt` child action still passes the same Policy Kernel, resource resolution, approval, audit, and capability checks.

### 4.3 Existing Git tools under V4

V1/V2/V3 `git_status` and `git_diff` schemas remain byte-for-byte exact. V4 keeps the same names but selects strict V4 schemas:

- `git_status` uses `status --porcelain=v2 -z --branch --untracked-files=all`, returns typed entries/counts plus an opaque state token, and reports omitted blocked/secret paths only as bounded counts.
- `git_diff` accepts a comparison enum (`worktree_to_index`, `index_to_head`, or `head_to_base` for an owned task), literal guarded paths, and `include_patch`. It returns NUL-parsed typed changes, bounded stats, a redacted patch, truncation facts, omission counts, and a matching state token.

V4 never parses `status --short`, branch decoration, `--oneline`, localized diagnostics, or human diffstat as machine state.

### 4.4 Strict inputs

- Every schema is strict and rejects unknown fields.
- Paths are arrays of literal repository-relative paths; pathspec magic and empty/absolute/device/UNC/drive-relative/ADS forms are rejected before Git.
- Existing branches are selected by short-lived opaque `branch_id` values returned by the current repository context, not by caller-supplied raw refs. Internally they bind normalized local `refs/heads/*` values validated by Git and Windows case-fold collision checks. A new branch is a strict secret-scanned `codex/*` name only.
- Bases are limited to `current_head` or one current-context `branch_id`. Arbitrary rev syntax, raw existing refs, tags, remote-tracking refs, reflog syntax, `HEAD~1`, and raw `--` fragments are unrepresentable.
- Commit messages are UTF-8, NUL-free, 1–16 KiB, supplied over private stdin, and represented in audit only by length and digest.
- No mutation tool has an alias.

### 4.5 Activation

V4 is nondefault. Selecting it requires Policy Kernel `enforce`, durable audit, stable request/session identity, atomic/state readers, native host identity, local approval, and a successful Git capability probe. A missing mandatory dependency fails startup before any V4 handler runs.

`gitMode=read` is the default. Local mutations additionally require explicit `gitMode=local` plus matching Permission Profile scopes. Repository integrations remain `off` unless separately enabled.

## 5. Repository identity and the Git execution capsule

### 5.1 Repository admission

For every V4 repository, CodexGPT resolves and binds:

- opaque random `repository_id`;
- canonical worktree root and stable directory identity;
- canonical per-worktree Git dir and common Git dir;
- local owner SID/uid and volume/filesystem facts;
- object format (`sha1` or `sha256`), ref storage, HEAD state, current local branch, and exact OID;
- mutable metadata identities for `HEAD`, index, refs storage, config, worktree administrative directory, and lock parents;
- Git executable path, stable identity, digest/version/capability revision;
- repository-policy, PathPolicy, secret-policy, contract, and Policy Kernel revisions.

A normal primary repository must keep its Git metadata below its admitted root. A linked worktree is accepted only when it is a CodexGPT-managed task whose `.git` indirection and `commondir` match the stored parent identity. Bare repositories, arbitrary external gitdirs, unsafe ownership, reftable until explicitly proved, external object alternates, replacement refs, and unresolved partial-clone objects fail closed. Safe mutations also reject sparse checkout, sparse index, and split index until their exact index/worktree semantics have dedicated evidence; read tools may report those facts but cannot mint a mutation token.

Mutable Git metadata may not be a reparse point or multi-link ordinary file. Immutable object files may be shared/hard-linked; CodexGPT never edits an existing object in place.

Repositories referenced by persistent tasks have an authenticated versioned registry record with a random opaque `repository_id`, sealed canonical path, stable repository/common-dir identities, owner binding, and last validated capability/policy revisions. The ID is never a path hash. Restart reopens and revalidates the record before task recovery; path/identity drift makes it unavailable without exposing or automatically rebinding the old record.

### 5.2 Executable identity

Phase 5 does not trust whichever `git.exe` wins a later PATH lookup. Startup resolves one executable, records its canonical path/stable identity/digest/version and required feature probes, and injects that exact identity into every request fact. Replacement changes the capability revision, revokes pending Git state, and blocks new operations until reprobe.

No global Git installation, config, credential, or `safe.directory` entry is modified. Repository ownership is proved independently; ownership failure returns a stable action-oriented error.

### 5.3 Safe capsule

Safe typed operations use the Phase 4 native host with:

- direct executable plus generated argument array; never a shell or command string;
- exact `--git-dir` and `--work-tree` from admitted identity;
- clean bounded environment with inherited `GIT_*`, `SSH_*`, askpass, proxy, trace, pager, editor, object/index/namespace, and credential variables removed;
- sealed service-internal `GIT_INDEX_FILE` and `GIT_OBJECT_DIRECTORY` overrides are allowed only for identity-bound private index/object-quarantine paths created by the Git domain; they are never caller input, inherited state, repository config, or public output;
- `GIT_TERMINAL_PROMPT=0`, literal pathspecs, no replacement objects, no lazy fetch, and no optional background maintenance;
- a private empty `core.hooksPath`, disabled fsmonitor, disabled signing, disabled credential helpers, disabled external diff/textconv, no pager/editor, and deny-all Git protocols;
- discovered clean/smudge filter drivers neutralized in safe mode; custom merge drivers rejected for an affected merge;
- capability-probed object-only merge and private-index plumbing; absence of a proved machine-safe form fails closed instead of falling back to a live checkout;
- bounded stdin, stdout, stderr, wall time, Job/process memory, object count, path count, blob size, total bytes, and process/output quotas;
- redaction/control neutralization before retention or public projection.

This capsule narrows Git's behavior but runs as the current user. Public metadata says `execution_isolation: none`, `repository_integrations: disabled`, and never calls it a sandbox.

### 5.4 Repository integrations

`integrations=off` is mandatory for the safe path. Hooks, executable filters, merge drivers, signing programs, fsmonitor daemons, editors, pagers, and credential helpers do not run.

An optional `integrations=approved_full_access` path may be implemented only after the safe path is complete. It:

- requires V4, `gitMode=local`, explicit profile permission, and a fresh local R3 grant;
- previews every discovered executable integration path plus bounded digest/identity facts without claiming transitive completeness;
- binds Git/repository/ref/index/worktree/integration/policy/capability facts to the grant;
- permits exactly four typed executor requests: private-index stage, shadow-Git-dir commit, quarantined object-only merge, and private-destination checkout;
- exposes no caller-selected command, subcommand, argument vector, remote action, credential action, force option, or config mutation;
- executes through Phase 4 ambient `full_access`, while both approval and result report no filesystem, credential, registry, network, or broker-escape isolation.

A hook digest is drift evidence, not proof that sourced scripts or transitive tools are safe.

## 6. State tokens, locking, journaling, and recovery

### 6.1 Exact state vector

A V4 status result returns a short-lived AEAD mutation token only when its requested semantic scope was scanned completely. Any entry, byte, time, object, ignored/untracked, attribute, or output truncation that could affect the requested mutation returns `state_token: null`, `mutation_state: incomplete`, and `GIT_STATE_INCOMPLETE` when a mutator attempts to proceed. A path-subset token authorizes only that exact path set; repository-wide restore, stash, task, and merge operations require a complete repository-wide scan. A complete token is bound to:

- server, owner, credential, transport session, repository, and worktree IDs;
- contract, policy, path/secret policy, Git capability, and configuration revisions;
- HEAD symbolic target and OID, index tree OID and index identity/digest;
- typed worktree-entry digest, untracked/ignored collision digest, and scan completeness;
- requested path set and omission/truncation facts;
- issue and absolute expiry times.

Tokens expire after five minutes, are one context only, conceal private roots/OIDs where not already returned, and cannot be used as a grant. A mutation requires a matching token and recomputes the affected facts immediately before side effects.

### 6.2 Locks

- A repository-wide CodexGPT lock serializes ref/common-metadata mutations.
- A worktree lock serializes its index and file-plane mutations.
- Locks use Phase 3 process-instance ownership and exact PID creation-time identity.
- Ordering is always repository lock, then lexically ordered worktree locks, then Phase 3 file transaction lock.
- External Git/editor processes remain outside these locks. Expected-old OIDs, Git lockfiles, stable identities, and final rechecks detect rather than prevent their races.

The implementation never deletes an unknown `.lock` file. A stale-lock diagnosis is read-only; cleanup requires exact ownership evidence or manual action.

### 6.3 Durable operation journal

Before any mutation, an authenticated journal records safe pre-state, planned post-state, participant requirements, and recovery probes. Object quarantine/promotion, private-index installation, guarded file mutation, ref CAS, task registry, and audit are distinct participants when applicable. Journal states are:

```text
preparing
prepared
executing
effect_observed
audit_pending
committed
rolling_back
rolled_back
recovery_required
```

Raw file content, complete diffs, commit messages, canonical private roots, tokens, and credentials are excluded. Necessary private paths and encrypted index/file undo data remain sealed in local application state.

Git object creation may leave unreachable immutable objects after failure; this is not reported as a committed mutation. Index/ref/worktree effects are acknowledged only after reconciliation and terminal audit. If the effect is durable but terminal audit cannot be proved, the repository freezes with `GIT_RECOVERY_REQUIRED`; it is not silently rewound across possible external work.

The journal coordinates participants; it does not provide database-style simultaneous visibility to external Git processes. A checked-out-target integration may be observed between its file, index, ref, and terminal-audit transitions. CodexGPT therefore retains exact rollback state, blocks its own concurrent access, rechecks expected identities at every boundary, and after a crash either finishes, safely rolls back, or freezes for recovery. Documentation and results must not claim cross-process atomic visibility.

### 6.4 Concurrency and idempotency

- Ref creation/update uses expected-old OIDs and exact ref names.
- Stage/commit binds the exact index identity/tree; `git_commit` never implies `-a`.
- Repeated request IDs return the same terminal result only while the authenticated terminal record is retained.
- Foreign/stale tokens and IDs return opaque not-found/stale errors without revealing roots, refs, owners, or counts.
- Startup recovery reconciles the journal, Git porcelain, exact refs, worktree administration, stored identities, and audit before issuing affected handles.

## 7. Typed local Git operations

### 7.1 `git_log` and `git_branch`

- Read only local objects/`refs/heads/*`; no remote refs or arbitrary revision syntax.
- `git_log` returns at most 100 typed commits with full OID, parent OIDs, bounded control-neutralized and secret-redacted-or-omitted subject/author display name, and timestamp; author email/body/signature payload are omitted.
- `git_branch` returns an opaque context-bound `branch_id`, exact OID, current/checked-out state, and owned task relation. A bounded ref display name is returned only after control and secret screening; otherwise `name_omitted: true`. Windows case-fold ambiguity fails closed.

### 7.2 `git_create_branch`

- Creates one new local `refs/heads/codex/*` branch at the exact state-token HEAD or a current-context `branch_id`; other destination namespaces, raw existing refs, and arbitrary local branch names are not representable in V4.
- Does not switch worktrees, set upstream, rename/delete another branch, or overwrite an existing ref.
- Uses expected-absent ref creation and preserves the branch on later unrelated failures.
- It is a Git history/ref mutation and therefore requires a fresh exact one-use R3 grant.

### 7.3 `git_stage`

- Accepts 1–256 exact literal paths from a matching complete state token.
- Stages additions, modifications, and deletions for only those paths; no `-A` outside the explicit set, interactive/patch mode, intent-to-add, chmod, or submodule recursion.
- Resolves every path through PathPolicy and rescans the proposed index blobs through secret-content policy.
- Safe staging never calls `git add` and never applies repository clean filters. It applies path/type/size and secret-content policy to the exact raw worktree bytes before object creation, hashes only accepted bytes with `hash-object -w --stdin --no-filters` and no `--path`, builds a complete private temporary index from the expected old index using generated NUL-delimited index plumbing, verifies the resulting tree and secret/path facts, then atomically installs that index only if the live index identity still matches.
- A complete attribute/config inventory must prove that raw staging matches the selected path's required Git representation. If built-in EOL normalization or any clean filter would transform the bytes, safe mode returns `GIT_NORMALIZATION_REQUIRED` or `GIT_INTEGRATION_REQUIRED`; it never silently commits a raw representation that normal Git would change. Successful results state `normalization: raw_git_blobs`.
- Returns old/new index tree OIDs, typed staged entries, and a new index token.
- Concurrent index/worktree drift returns `GIT_STATE_CHANGED` before acknowledging success.

### 7.4 `git_commit`

- Requires a fresh index token and a non-empty exact staged tree.
- Independently re-enumerates and rescans staged paths/blobs; it never trusts `git_stage` alone.
- Applies the same secret-content policy to the full commit message before `commit-tree`; rejected messages create no commit object. V4 results and audit never return the message, while `git_log` subjects are bounded, neutralized, and secret-redacted or omitted.
- Derives author/committer identity only from an explicit local CodexGPT Git identity or exact admitted repository-local `user.name`/`user.email` keys. System/global files, includes, conditional includes, environment identity, and caller values are ignored; absence fails with `GIT_IDENTITY_REQUIRED`. The reviewed values are copied into the clean command scope. Callers cannot set identity, dates, signing, amend, parents, or trailers.
- Safe mode creates the commit with hooks/signing disabled and updates the current local branch by expected-old OID.
- Detached/unborn HEAD, merge state, unresolved entries, blocked content, identity absence, or changed index fails closed.
- Returns the new commit/tree/parent OIDs, typed file counts, `hooks_executed: false`, `signature: none`, and a fresh state token.

### 7.5 `git_restore`

The tool has `prepare` and `execute` actions. Prepare returns an opaque review token, exact affected paths/byte counts, loss summary, and whether an encrypted Phase 3 change set can retain every overwritten byte. Execute requires that token plus fresh R3 approval.

Allowed forms are only:

- unstage exact paths from `HEAD` while leaving worktree bytes unchanged;
- restore exact worktree paths from the current index while leaving the index unchanged.

There is no arbitrary source revision, recursive root restore, combined index/worktree reset, or force mode. Worktree restore fails before mutation if complete undo retention, path policy, secret policy, size, type, or stable-identity checks cannot be satisfied.

`worktree_from_index` also requires proof that raw index blobs are the selected paths' correct checkout representation; applicable EOL/smudge transformations require the separately approved integration path. `index_from_head` does not touch worktree bytes but still uses private-index CAS.

### 7.6 `git_stash`

The tool exposes `list`, `prepare_create`, `execute_create`, `prepare_apply`, `execute_apply`, `prepare_forget`, and `execute_forget`. It never exposes shared-stack `pop`, positional `drop`, or `clear`.

- Stashes are owner/task-bound opaque objects retained under `refs/codexgpt/stash/*`, not the shared `refs/stash` stack.
- Create includes only exact reviewed tracked/untracked paths; ignored and blocked paths are never included. Its authenticated record binds the original worktree/task, base tree, exact selected index entries/tree, exact selected worktree/untracked tree, modes, identities, and private ref/OIDs.
- Only after the private ref and complete rollback material are durable does create clean those selected paths to the current `HEAD`, preserving every unselected index/worktree entry. Staged versus unstaged state is retained rather than flattened.
- Apply is limited to the same bound worktree/task, keeps the stash ref after success, and restores both selected index and worktree planes. `prepare_apply` performs bounded object-only three-way/no-clobber checks from the recorded base to current state inside sealed quarantine, then completely rescans synthesized output; any conflict, secret, incomplete scan, or untracked overwrite issues no execute token. Accepted synthesized objects are promoted only as an execute journal participant before index/file installation.
- Forget targets exactly one opaque owner-bound private stash ID, previews loss/age and the exact expected ref/OID without revealing a private path, and requires fresh R3 approval. Execute deletes only that expected private ref, journals a rollback CAS/tombstone, and never runs Git GC; it cannot select by stack position, pattern, or count.
- Any conflict, unsupported filter/type, or incomplete rollback material aborts before the live worktree changes.
- Safe mode never invokes porcelain `git stash`. Create and apply use the same raw-blob, private-index, object-tree, journaled file/index/ref, and complete-rollback machinery as stage/restore; repositories that require filters use only the separately approved integration path.
- Apply also fails before effects when an affected path requires EOL/smudge checkout transformation; it never writes raw blobs under a claim of normal Git checkout semantics.

## 8. Managed task worktrees

### 8.1 Identity and storage

Task records use random opaque `task_worktree_id` values. They persist in authenticated application state and bind:

- versioned stable owner binding and repository ID; the binding stores neither raw query/Bearer credentials nor transport-session identity;
- generated local branch ref, immutable bound target local-branch ref, base OID, current head OID, and lifecycle generation;
- canonical managed path sealed at rest, stable root identity, per-worktree Git dir/common-dir relation, and lock reason;
- creation/update timestamps, policy/capability revisions, state, and cleanup/recovery facts.

The default root is `%LOCALAPPDATA%\CodexGPT\worktrees\v1`. `CODEXGPT_WORKTREE_ROOT` is a startup-local setting, never a remote tool argument. It must be an owned, ordinary, fixed local directory outside credential/audit/key/control roots and may not be UNC, mapped, removable, device, reparse, or nested inside a repository. Short opaque directory components reduce path pressure.

Creating a task never mutates `allowedRoots`. `get_task_worktree` issues a new session-local workspace handle with `accessClass: task_worktree`; ordinary file tools then use normal PathGuard, atomic mutation, hard-deny, policy, and audit behavior. Closing that handle does not remove the persistent task.

The current personal authentication flow resolves to the existing installation-local stable owner abstraction. A credential/token rotation does not silently transfer or reveal tasks to a different binding. Phase 8 may add an explicit versioned owner-migration transaction, but Phase 5 neither invents OAuth ownership nor guesses equivalence; same-binary rollback retains the newer owner-binding reader.

### 8.2 Create

`create_task_worktree` requires a clean committed named local target branch, binds that exact target ref in the task record, and generates `codex/<sanitized-task>-<random-suffix>` unless an explicit valid unused `codex/*` branch is supplied. Detached or unborn bases fail closed.

Before side effects it enumerates the exact tree and rejects:

- blocked/secret paths or content;
- case-fold/path-normalization collisions;
- `.git` aliases, reserved devices, ADS, trailing-dot/space, over-limit paths, reparse/symlink entries, unsupported modes, and oversized/count/total-byte limits;
- missing promisor objects, unsafe alternates, unsupported ref storage, or submodule recursion requirements.

The first call may build this complete immutable tree/root/capability review under R2 preparation authority, but creates no branch, administrative directory, or task root. The local R3 card binds its manifest digest, exact counts/limits, generated safe branch display, managed-root facts, owner/session, and revisions. Only an exact retry consumes the grant and begins the journal; drift discards the review and requires a fresh preflight.

Creation first records an expected-absent generated branch-ref participant, then creates the administrative worktree for that already-existing branch with `git worktree add --no-checkout --lock`. It never uses the combined `-b` form because branch creation and worktree administration need separate recovery facts. It then constructs the per-worktree index and materializes exact raw Git blobs through a journaled bounded binary writer. External filters such as LFS are not hydrated; the result reports their affected-entry count and `materialization: raw_git_blobs`. Submodules remain uninitialized and are reported. If a later participant fails, the exact generated branch is retained and surfaced as a bounded recovery fact rather than being silently deleted.

Gitlink entries may create only known empty inert directories matching the index, with a task manifest rule that blocks file-tool traversal/mutation beneath them. V4 never initializes, updates, stages, restores, stashes, or recursively enters a submodule. A target-to-candidate gitlink change blocks safe merge execution and requires separate explicit submodule handling outside this contract.

Creation succeeds only after Git's NUL-delimited worktree inventory, branch ref, task store, root identity, index, HEAD, clean status, workspace issuance, and terminal audit all reconcile.

### 8.3 List and get

- `list_task_worktrees` returns only current-owner tasks for the selected repository and never reports foreign counts.
- `get_task_worktree` revalidates persistent state and returns task metadata plus a current session-local workspace handle.
- Missing, foreign, replaced, stale-policy, recovery-required, or removed tasks use the same opaque not-found/unavailable family.
- Remote MCP results return the session-local workspace handle and safe task metadata, not the canonical managed path. The canonical path may be shown only by the local owner-side control/CLI view after identity validation; audit and generic errors use opaque IDs/fingerprints.

### 8.4 Remove

`remove_task_worktree` never accepts force and never deletes the branch. It requires:

- exact managed root/Git-admin identities;
- no active owned process, pending input, merge plan, or workspace mutation;
- clean index/worktree with no untracked or ignored entries;
- no reparse, mount, foreign hard-link, nested repository, or unexpected filesystem entry;
- unchanged task head and registry generation;
- successful pre-delete Windows lock diagnostics.

The first request freezes those complete facts in an immutable removal review and creates no delete/unlock effect. The local R3 card states that the checkout and registration will be removed while the branch, commits, and private stashes remain. Exact retry consumes the grant and revalidates every identity/count/lock fact before revocation or deletion begins.

The manager revokes handles, quarantines input, drains owned Jobs, unlocks the exact CodexGPT lock, and deletes only through the proved handle-safe remover. Generic recursive deletion and `git worktree remove` are not deletion backends. The journal removes the proved task tree and its separately stored exact CodexGPT-owned common-dir worktree-administration directory as two stable-identity participants, then verifies the complete inventory and records a tombstone. Global `worktree prune/repair` is never used as cleanup because it could affect unrelated registrations. File-lock failure returns `WORKTREE_IN_USE`; CodexGPT never kills unrelated processes or retries with force.

## 9. Merge review and execution

### 9.1 Prepare

`merge_task_worktree { action: prepare }` requires a clean committed task and the task record's bound target branch. The caller cannot supply or substitute another target ref. It binds exact target/task OIDs and produces one immutable merge plan:

- If target is an ancestor of task, the candidate is the task head.
- Otherwise CodexGPT uses a Gate-G0-proved object-only merge capability: `merge-tree --write-tree --stdin` with exact full OIDs and NUL-delimited output, inside a sealed private object quarantine that reads the admitted repository object database but receives every newly created blob/tree/commit. The parser treats the per-record merge status, not the process exit code, as clean/conflicted and never consumes human conflict messages as authorization facts. Lazy fetch and executable integrations are disabled and affected custom merge drivers are rejected. It never runs porcelain `git merge` in a checkout. The resulting quarantined tree is completely rescanned. The strict optional merge message uses the same bounds and pre-object secret policy as `git_commit`; absence selects the fixed text `Merge CodexGPT task worktree`. With the same reviewed local identity/no-caller-date/no-signing rules as `git_commit`, `commit-tree` then creates the candidate with the exact target first parent and task second parent. Only after all path/secret/shape checks pass does a journaled immutable-object promotion verify-or-install the quarantined objects into the main ODB and create an expected-absent private candidate ref. The message and identity values are absent from V4 results and audit.
- Conflicts return typed bounded paths and no live-target mutation; automatic resolution is out of scope.
- If the object-only capability or machine-safe conflict form is unavailable, divergent preparation fails with `GIT_MERGE_CAPABILITY_UNAVAILABLE`; it never falls back to a live target or task checkout. After the candidate exists, CodexGPT may raw-materialize a separate integration task worktree only to run checks against that exact OID.
- Fast-forward and divergent plans both require a bounded complete traversal of every commit newly reachable from the candidate relative to the target. Commit messages and relevant typed metadata are control-neutralized and secret-scanned without entering results/audit; an incomplete history scan or secret-bearing commit blocks plan issuance.
- The plan returns candidate OID, typed target-to-candidate diff, status, complete secret/path scan, integration workspace when needed, required-check state, and an opaque `merge_plan_id`.

Divergent preparation is a two-stage state machine because an R3 grant cannot honestly bind a candidate that does not exist yet:

1. the first `prepare` call, under R2 preparation authority, computes the exact candidate entirely in sealed quarantine, completes all bounded scans, and stores an immutable review record; it changes no main ODB, ref, index, or worktree;
2. the bounded remote preview and richer local approval card identify that exact candidate/review without private paths or secret text;
3. a fresh local R3 decision binds candidate OID, quarantine/scan digests, target/task facts, private-ref expiry, owner/session, and revisions;
4. retrying the same semantic `prepare` atomically consumes the grant, revalidates every fact, promotes the accepted immutable objects, creates the expected-absent private candidate ref, and issues the merge plan exactly once.

Denied, expired, drifted, or abandoned reviews delete only their proved quarantine through the handle-safe application-state cleanup path and never touch repository objects/refs. Fast-forward preparation creates no new object/ref and may issue its immutable plan under R2 after the same complete tree/history checks; execute remains R3.

The plan is AEAD/MAC bound to repository/worktrees/branches/OIDs/indexes, Git executable and integration facts, policy/capability revisions, owner/session, diff digest, and a thirty-minute absolute expiry.

The R3 preparation approval explicitly includes the private candidate ref's bounded lifecycle. After plan expiry or successful integration cleanup may delete only the exact expected app-owned candidate ref through a journaled/audited CAS; it never deletes the task/target branch, runs GC, or removes objects directly. If identity or audit cannot be proved, the ref is retained in recovery state rather than guessed away.

### 9.2 Verification receipts

Successful Phase 4 commands may issue opaque verification receipts bound to:

- exact candidate OID and clean integration/task worktree state;
- repository/worktree identity, backend/environment/capability/policy revisions;
- command subject fingerprint, exit zero, terminal audit event, and timestamp.

Merge execution requires all configured receipt categories. Because Phase 5 cannot infer every project's correct test suite, an explicit `skip_checks` decision is allowed only through the same local R3 approval and is retained as a terminal audit fact. A stale receipt never passes because a newer commit has the same branch name.

### 9.3 Execute

`merge_task_worktree { action: execute }` requires the exact unexpired plan and fresh R3 approval. It rechecks:

- target and task refs/OIDs;
- exact target checkout relation; when checked out in the admitted primary worktree, a clean index/worktree plus absence of untracked/ignored collision paths;
- candidate object/tree and diff/secret/path digests;
- verification receipts or explicit locally approved skip;
- repository/worktree/Git/policy/capability identities;
- Windows path and lock feasibility.

The target moves only from the expected old target to the prepared candidate. CodexGPT does not run checkout, reset, read-tree-with-worktree-update, or porcelain merge against the live target. It first builds and verifies the exact raw target-to-candidate file delta, a complete candidate private index, encrypted rollback bytes, and expected-old ref update. The journal then applies the guarded Phase 3 file transaction, atomically replaces the per-worktree index, updates the ref by expected-old CAS with hooks disabled, and persists terminal audit. Any failed boundary rolls back while facts still match or freezes as `GIT_RECOVERY_REQUIRED`; external observers may see an intermediate participant state as stated in Section 6.3.

The exact NUL-delimited worktree inventory determines whether the bound target branch is checked out. If it is checked out in the admitted primary worktree, the file/index/ref sequence above is mandatory. If it is not checked out anywhere, execute is ref-only after proving that absence twice. A foreign, ambiguous, or changing checkout relation fails closed; CodexGPT never updates a checked-out branch whose worktree it cannot reconcile.

For a checked-out target, the affected-path attribute/config inventory must also prove that writing candidate raw blobs is the correct checkout representation. Built-in EOL conversion, LFS/smudge, or another checkout transform on an affected path blocks the safe execute path with an action-oriented normalization/integration error. The optional approved-integration path is the only V4 route that may run those transformations.

After success, the task branch and task worktree remain. Integration state is cleaned only after the terminal audit and target reconciliation are durable.

## 10. Policy and authorization

| Action | Risk | Required scope/facts |
| --- | --- | --- |
| status/diff/log/branch/list/get | R0 | `git:read` plus owned workspace/repository |
| stage | R2 | `git:index:write` + `filesystem:read` + fresh state token |
| restore/stash review or stash list | R0 | owned repository + complete read facts; no side effect |
| create branch | R3 | `git:refs:write` + expected-absent ref + exact one-use local grant |
| commit | R3 | `git:commit` + `git:refs:write` + fresh index token + exact one-use local grant |
| create task worktree | R3 | `worktree:manage` + `git:refs:write` + managed-root capability + local grant |
| execute restore / stash create, apply, or forget | R3 | file/index/ref scopes + retained rollback or exact expected-ref tombstone + local grant |
| prepare merge review | R2 | task/target ownership + complete scans + sealed quarantine; no repository effect |
| finalize divergent candidate/ref | R3 | exact review/candidate/quarantine facts + candidate-ref scope + local grant |
| execute merge | R3 | `git:merge` + target file/ref scopes + merge plan + local grant |
| remove clean task worktree | R3 | `worktree:manage` + exact clean/root/process/lock facts + local grant |
| any approved repository integration | R3 | action scopes + `shell:execute` + `host:full-access` + local grant |

Authorization facts are closed, domain-separated, and schema-versioned. They bind semantic paths/refs/OIDs/counts/digests rather than JSON text or raw command lines. Grants cannot widen hard path/secret policy, owner scope, configured Git mode, or demonstrated capability.

The first remote R3 attempt returns one generic approval-required result with an opaque request ID and no new repository/path/ref existence facts. The local approval projection shows the exact action, locally resolved repository/task, safe branch/candidate identifiers, affected file/byte counts, retained-loss facts, checks, integration/isolation status, and expiry. Commit/merge messages may be shown locally only after secret/control screening and are never copied into audit. Deny/expire/drift burns the request; retry atomically consumes one exact semantic grant.

Phase 4's local-control limitation remains exact: after unrestricted same-user code has run, an R3 decision record is a required workflow state transition, not cryptographic proof of human presence. Phase 5 prompts and documentation cannot strengthen that claim.

## 11. Audit, privacy, and output

Phase 5 adds strict `AuditEventV4` authorization, terminal, Git-operation, task-worktree, merge-plan, verification, and recovery transitions inside the existing MAC-chained envelope. The persisted union is explicitly `AuditEventV2 | AuditEventV3 | AuditEventV4`; a V4 action never masquerades as a V2/V3 authorization or terminal record. V1–V3 public audit schemas/cursors remain exact. Older readers verify the complete mixed-version chain, filter V4 before pagination, and project only their exact historical schema. V4 queries use a domain-separated V4 union projection and cursor and cannot consume older cursors.

Audit and logs exclude:

- canonical private roots/Git dirs/worktree paths;
- raw config, environment, hooks, filters, commands, commit messages, diffs, file bodies, branch descriptions, and process output;
- credentials, remote URLs, author emails, tokens, private keys, and `.env` contents.

Safe evidence includes opaque IDs, local ref display names only after one-line control/secret screening, OID/digest prefixes where necessary, counts, risk/isolation facts, stable result codes, and transition timestamps.

Every parser and projection has independent input, retained-output, result, and audit ceilings. Increasing a repository scan limit never increases MCP response or log limits.

## 12. Windows behavior

- Use native realpath/stable identity and case-insensitive collision checks for repository, Git admin, task root, and every materialized path.
- Do not modify global `core.longpaths`. Probe capability and use command-scoped behavior only; fail before side effects when any Node/Git/native component cannot represent the final path.
- Treat `index.lock`, ref locks, checkout locks, antivirus/editor handles, and directory handles as bounded diagnosable states, never as permission to force deletion.
- Use Restart Manager or an equally narrow native oracle only to report bounded executable basenames/counts for exact locked task paths; never reveal command lines or terminate owners.
- Test CRLF, Unicode, invalid UTF-8 filenames where representable, reserved names, trailing dots/spaces, case-only refs/paths, junctions, symlinks, hard links, SUBST/mapped/removable volumes, long paths, and process-held handles.

## 13. Stable error vocabulary

At minimum V4 defines fixed families for:

```text
GIT_CAPABILITY_UNAVAILABLE
GIT_EXECUTABLE_CHANGED
GIT_NOT_REPOSITORY
GIT_REPOSITORY_UNSAFE
GIT_METADATA_OUTSIDE_AUTHORITY
GIT_UNSUPPORTED_REPOSITORY_FORMAT
GIT_OBJECT_MISSING
GIT_SCAN_LIMIT
GIT_STATE_INCOMPLETE
GIT_STATE_TOKEN_INVALID
GIT_STATE_CHANGED
GIT_REF_CHANGED
GIT_INDEX_CHANGED
GIT_UNMERGED
GIT_IDENTITY_REQUIRED
GIT_NORMALIZATION_REQUIRED
GIT_PATH_BLOCKED
GIT_SECRET_BLOCKED
GIT_INTEGRATION_REQUIRED
GIT_MERGE_CAPABILITY_UNAVAILABLE
GIT_SPARSE_CHECKOUT_UNSUPPORTED
GIT_SPLIT_INDEX_UNSUPPORTED
GIT_RECOVERY_REQUIRED
TASK_WORKTREE_NOT_FOUND
TASK_WORKTREE_DIRTY
TASK_WORKTREE_IN_USE
TASK_WORKTREE_UNSAFE_ENTRY
TASK_WORKTREE_PATH_TOO_LONG
MERGE_CONFLICT
MERGE_PLAN_INVALID
MERGE_PLAN_STALE
MERGE_CHECKS_REQUIRED
```

Errors expose only bounded safe details plus a closed action-oriented `next_action` such as `refresh_status`, `reduce_scope`, `close_worktree_handles`, `resolve_conflicts_locally`, `use_approved_integrations`, `upgrade_git_capability`, or `run_manual_git_recovery`. Raw Git stderr, config origins, private paths, hooks, command lines, and owner identities never cross the public error boundary.

## 14. Configuration and defaults

Recommended V4 configuration shape:

```text
toolContractVersion: 4          # explicit; V1 remains default
gitMode: read | local           # default read
gitIntegrations: off | approved_full_access  # default off
worktreeRoot: local startup path
worktreeMaxTasksPerRepository: 16
worktreeMaxTasksPerOwner: 32
worktreeMaxFiles: bounded startup value
worktreeMaxBlobBytes: bounded startup value
worktreeMaxTotalBytes: bounded startup value
gitMaxPrivateStashesPerRepository: 64
gitMaxPrivateStashesPerOwner: 128
gitStateTokenTtlSeconds: 300
mergePlanTtlSeconds: 1800
```

Remote requests cannot change these values. Invalid combinations fail before registration. Deprecated Git-read configuration remains readable for at least one migration period; rollback never deletes branches, refs, stashes, task directories, or newer audit/state records.

## 15. Publication gates and acceptance

| Gate | Blocks | Required evidence |
| --- | --- | --- |
| G0 | every V4 Git handler | exact Git identity/capability, private-index/raw-blob/object-only merge proof, plus malicious config/integration/remote execution oracle |
| C4 | V4 registration | exact 51, exact inherited V1/V2/V3, strict V4 schemas, supertool parity, startup failure |
| R | Git mutations | repository/admin identity, locks, state tokens, journal, audit, crash recovery |
| W | task create/remove | managed-root ownership, raw materialization, path/reparse/hard-link/lock/destructive canaries |
| M | merge execute | immutable merge plan, candidate verification, clean target, CAS/fast-forward, crash recovery |
| P | publication | complete local gate, neat-freak, one phase commit/push, exact-head CI |

Phase 5 acceptance requires:

- V1=28, V2=31, and V3=39 remain exact; V4=51 is exact and nondefault.
- Safe typed builders cannot represent remote, force, config, credential, arbitrary revision, arbitrary source, or branch-deletion operations.
- Malicious hooks/filters/drivers/fsmonitor/signing/editor/pager/credential/askpass/config/environment fixtures execute zero canaries in safe mode.
- Safe stage/stash/materialization/merge/target integration never invokes checkout-oriented porcelain or clean/smudge filters; sparse/split-index/ref-storage capability gaps fail closed.
- Safe stage and checked-out-target integration fail rather than silently changing semantics when EOL or clean/smudge transformations would alter affected bytes.
- A rejected commit message or merge-produced secret creates no commit/ref and promotes no quarantined object into the repository ODB.
- A fast-forward candidate with an unscanned or secret-bearing newly reachable commit message cannot produce a merge plan.
- Incomplete or truncated scans mint no mutation-capable state token.
- Blocked/secret content is absent from stage, commit, stash, merge candidate, diff output, audit, and logs.
- Branch/index/ref/worktree races and every injected crash converge to unchanged, committed, rolled back, or `recovery_required`; never false success.
- Default task changes can be created and completed in a managed worktree without modifying `allowedRoots`.
- Dirty/untracked/ignored/reparse/foreign/locked worktrees cannot be removed, and the external deletion canary survives every Windows test.
- Merge prepare shows exact status, typed diff, checks, isolation/integration facts, and candidate identity before execute.
- Worktrees are never described as sandboxes; typed remote prohibition is never described as a restriction on separately approved full-access commands.
- Managed Node 20/24 ordinary and control domains, Ubuntu/Windows Build/Regression/Smoke/Package, policy, package contents, mutation inventory, link/secret checks, and exact-head CI pass.

## 16. Rollback

- Set Git mode to `read`, refuse new V4 mutations, expire pending state/review/grant tokens, and let in-flight journaled operations reconcile.
- Revoke task workspace handles only after quarantining input and draining owned Jobs; do not remove persistent task artifacts.
- Restore V3 public registration without deleting V4 audit events, task records, branches, custom stash refs, merge refs, or recovery data.
- Retain V4 readers/recovery code in the same binary so rollback can enumerate/reconcile newer state without exposing V4 tools.
- Never reset refs, delete branches/worktrees/stashes, clear Git locks, mutate config/credentials, or discard user files as part of configuration rollback.

## 17. Rejected shortcuts

- Free-form `git` command or flag arrays.
- Reusing Phase 4 `run_command` as the typed Git implementation.
- Calling `git add -A`, `git commit -a`, `git reset --hard`, `git clean`, shared-stack `git stash pop/drop/clear`, or any force option.
- Treating `--no-verify` alone as disabling all hooks.
- Trusting PATH Git, inherited `HOME`/environment, human porcelain, branch names alone, or a path hash as identity.
- Creating worktrees inside the repository or beneath control/audit/key state.
- Letting `git worktree remove` recursively delete an unproved Windows tree.
- Running global `git worktree prune/repair` to clean one managed task registration.
- Using `git add`, porcelain `git stash`, or live-checkout `git merge` in the safe path.
- Falling back from missing object-only merge capability to a merge or checkout in the target/task worktree.
- Updating a checked-out target ref without reconciling its worktree.
- Accepting tests run against a branch name rather than the exact candidate OID and state.
- Automatically deleting the task branch after merge/remove.
- Describing Git locks, worktrees, local approval, or an empty hooks directory as an OS sandbox.

## 18. Adversarial review repairs

The post-draft review repaired these publication-blocking classes:

1. Git ref/history mutations were under-classified. Branch creation, commit, task creation, divergent-candidate finalization, merge, destructive restore/stash, private-ref deletion, and removal now require exact one-use R3 approval; index-only stage and effect-free preparation remain R2 or lower.
2. Checkout-oriented staging, stash, divergent merge, and target update could execute repository filters or expose the live target to porcelain side effects. The safe path now uses raw blobs, private indexes, quarantined object-only merge, and explicit object/file/index/ref participants.
3. Raw bytes could silently diverge from Git EOL/LFS/filter semantics. Every affected stage/restore/stash/checked-out-target path now proves raw equivalence or fails with an action-oriented normalization/integration error.
4. Truncated scans could still have produced state tokens. Mutation tokens are now absent unless the exact mutation scope is complete.
5. Task target selection and worktree cleanup were ambiguous. Tasks bind their creation-time target branch, callers cannot substitute another, branch/admin/root participants are separate, global prune is forbidden, and only proved exact removers run.
6. Persistent identity and audit compatibility were underspecified. Repository/task records use opaque versioned owner/repository bindings, V4 owns its authorization/terminal/lifecycle events, and older readers verify then filter/project exactly.
7. Sparse/split indexes, unsupported ref storage, and unavailable object-only merge lacked a fail-closed result. They now block safe mutations with stable errors and no live-checkout fallback.
8. Merge/stash algorithms can synthesize a secret blob before post-operation scanning. New objects stay in sealed quarantine and are promoted only after complete path/message/content/history checks; commit messages are scanned before object creation.
9. A one-stage R3 merge prepare could not bind an exact candidate before creating it. Divergent prepare now computes only in quarantine under R2, then requires a candidate-bound R3 retry for promotion/ref/plan issuance; fast-forward prepare remains effect-free.
10. The draft implied atomic visibility and left private refs without a bounded lifecycle. The repaired journal states external intermediate visibility truthfully, and candidate/private-stash ref creation, exact forget/expiry, rollback, tombstones, quotas, and no-GC behavior are explicit.

No Phase 5 runtime implementation existed during this review, so these repairs change only the authoritative design and TDD order.

## 19. Authoritative references

- [Git worktree documentation](https://git-scm.com/docs/git-worktree.html) for shared/per-worktree state, stable porcelain, lock/remove/repair, and clean-removal behavior.
- [Git status documentation](https://git-scm.com/docs/git-status) for stable porcelain v2 and NUL path handling.
- [Git diff documentation](https://git-scm.com/docs/git-diff.html) for raw/numstat NUL output and external diff/textconv controls.
- [Git hooks documentation](https://git-scm.com/docs/githooks) for commit/merge/reference-transaction execution.
- [Git commit documentation](https://git-scm.com/docs/git-commit.html) for index-to-commit semantics and the limits of `--no-verify`.
- [Git update-ref documentation](https://git-scm.com/docs/git-update-ref.html) for expected-old ref updates and reflog behavior.
- [Git merge-tree documentation](https://git-scm.com/docs/git-merge-tree) for object-only merge, NUL-delimited conflict records, and its explicit no-index/no-worktree behavior.
- [Git hash-object documentation](https://git-scm.com/docs/git-hash-object) for stdin object creation and explicit no-filter behavior.
- [Git update-index documentation](https://git-scm.com/docs/git-update-index) for private-index `--index-info` construction.
- [Git commit-tree documentation](https://git-scm.com/docs/git-commit-tree) for stdin commit messages and explicit parent construction.
- [Git cat-file documentation](https://git-scm.com/docs/git-cat-file) for batch metadata checks before bounded content reads.
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md` for phase order and approved scope.
- `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md` for execution, approval, identity, audit, and sandbox meanings.
- `SECURITY.md` for active path, secret, transaction, audit, and public-entry boundaries.

## 20. Implementation handoff

The mandatory TDD order is defined in:

`docs/superpowers/plans/2026-07-16-phase-5-git-and-task-worktrees.md`

Phase 4 closure head `d19e65ba75938c35afa472d23d91d1724fe7fabf` passed exact-head run `29603060944`, satisfying Gate 4P. Task 5A0 / Gate G0 is locally complete after adversarial hardening: capability revision `7e9f95bf7188bdd6035970eb38c5e3dfa5840996e7838273dc2757aa9b5d94f2` binds the exact implementation, Git executable, and CXP4 host manifest; final managed Node 20/24 run `2026-07-17T21-03-15-107Z-phase5a0-adversarial-final-746beff5` passed. Task 5A1 / Gate C4 is also locally complete: final managed run `2026-07-18T06-51-25-686Z-phase5a1-c4-final-4-96ce13f0` passed Node 20.20.2 and Node 24.15.0 with 913 tests, 912 pass, 0 fail, and one established skip per major. Task 5A2 activates only the typed V4 read path: final managed run `2026-07-18T12-41-24-298Z-phase5a2-ordinary-final-2-ddcc623b` passed both managed Node majors with 944 tests, 943 pass, 0 fail, and one established skip per major. Task 5A3 / Gate R now supplies the durable repository/worktree/file lock order, authenticated encrypted journals, immutable object promotion, strict V4 audit and startup recovery/freeze boundary required before mutation; final managed run `2026-07-18T15-29-43-345Z-phase5a3-final3-535183ed` passed both managed majors with 969 tests, 968 pass, 0 fail, and one established skip per major. V1/V2/V3 remain exact, every V4 mutation handler remains disabled, and Task 5A4 / Gate I is next.
