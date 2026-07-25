# Phase 7 Semantic Providers TDD Plan

**Status:** Core code and backend acceptance candidate completed locally through STEP-416 on 2026-07-24 after execution, security/compatibility, UX, and recovery-lock adversarial repair; publication/exact-head CI and real ChatGPT App UI G7-U remain outstanding

**Date:** 2026-07-24

**Design:** [Phase 7 Semantic Providers Usability Design](../specs/2026-07-23-phase-7-semantic-providers-design.md)

**Primary goal:** make semantic navigation and safe repository-wide rename work from the normal ChatGPT flow with zero setup for JavaScript/TypeScript, while keeping external Providers optional and every write inside the existing Phase 3 atomic transaction boundary

## 1. Deliverable

Phase 7 Core is complete only when this ordinary journey works:

```text
User asks a semantic code question
  -> semantic uniquely resolves a symbol name or accepts an exact source position
  -> builtin JS/TS answers without extra setup
  -> results use relative paths, exact ranges, bounded previews, and honest Provider facts
  -> rename_preview returns one complete, hash-bound, session-local plan
  -> apply_patch consumes that plan once
  -> Phase 3 revalidates and commits one transaction
  -> ordinary change review, undo, audit, and verification remain available
```

The user does not need to understand LSP, choose a Provider, install Serena, locate `tsconfig`, copy a generated patch, or switch to `full`.

Core ships in this order:

1. close the Phase 6 base and freeze authority/dependencies/contracts;
2. replace the dormant global Provider registry with a per-server semantic kernel;
3. build one canonical source/position/result boundary;
4. deliver builtin JavaScript/TypeScript definitions, references, and diagnostics;
5. expose exactly one V5 semantic tool and prove the real no-setup flow;
6. build rename preview and atomic token application;
7. add health, status, migration feedback, and recovery behavior;
8. integrate Core surfaces and review the completed Core runtime adversarially;
9. pass live usability, closure, publication, and exact-head gates;
10. only then consider a separately authorized Phase 7B Serena extension;
11. implement Phase 7C direct LSP only for a demonstrated unsupported-language need.

## 2. Rules for every implementation task

1. Read `AGENTS.md`, `Memory.md`, current Git state, the paired design/plan, the task's source/tests, and the active Phase 7 archive before editing.
2. Do not begin Core runtime work until Gate G7-0 records terminal Phase 6 exact-head success, no conflicting same-kind detached run, explicit Phase 7 Core runtime authorization, and explicit approval for the exact TypeScript production dependency. Serena/LSP dependencies and installs have separate post-Core gates.
3. Start every behavior change with one narrow failing test. Record the exact RED reason before production changes.
4. Complete one independently usable vertical slice at a time. Do not mix unrelated cleanup, formatting, Phase 8, Phase 9, OAuth, sandbox, or deployment work.
5. Preserve exact V1=28/V2=31/V3=39/V4=51 schemas and projections. Add V5=52 only behind explicit `standard` mode until Core exact-head closure passes.
6. Keep the ordinary `search` behavior usable and schema-compatible. Semantic fallback may call shared internals but must not silently change existing search certainty.
7. Keep every CodexGPT Provider protocol operation read-only; optional same-user children still have no filesystem isolation. Only the existing server `workspaceMutationRuntime` plus current Policy Kernel may prepare/commit a rename batch; never use `LocalMutationService` for an MCP request.
8. Resolve every input path and every Provider-returned path/URI through the canonical source boundary; never trust a Provider's normalization.
9. Never pass a remote caller-selected executable, argument, environment value, cwd, URI endpoint, package version, or tool name to a Provider process.
10. Do not auto-install, auto-update, auto-run project scripts, load workspace language plugins, or copy arbitrary parent tokens.
11. Preserve protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs`. Extend only through the existing fail-closed compatibility-loader pattern after dedicated tests.
12. Every complete task runs its narrow suite, managed Node 20/24 affected suite, build when source changed, repository policy, diff/secret/scope checks, then updates `Memory.md` and appends the Phase 7 archive.
13. Runtime-sensitive ordinary suites run through `scripts/long-task-runner.mjs`; control/all runs only in CI or a proven independent native terminal. Stop only one exact owned run ID.
14. Do not stage, commit, push, publish, deploy, install external software, migrate credentials, or perform destructive Git/data operations without the applicable explicit authorization.
15. Classify every gate as `passed`, `code-failed`, `not-run`, `environment-blocked`, or `platform-skipped`.
16. After the complete Core runtime exists, run execution, security/compatibility, and UX adversarial reviews against it; fix root causes and add permanent regression tests before Core closure. Each optional extension receives its own post-implementation reviews.

## 3. Exact verification command shapes

Use the current runtime for the first RED/GREEN loop:

```powershell
npm run test:focused -- <test-files...>
npm run build
npm run policy:check
git diff --check
git status --short --branch
```

Use both managed majors for platform/runtime-sensitive affected tests:

```powershell
node scripts/toolchain-manager.mjs exec --major 20 -- npm run test:focused -- <test-files...>
node scripts/toolchain-manager.mjs exec --major 24 -- npm run test:focused -- <test-files...>
node scripts/toolchain-manager.mjs exec --major 20 -- npm run build
node scripts/toolchain-manager.mjs exec --major 24 -- npm run build
```

Before an ordinary detached run:

```powershell
node scripts/long-task-runner.mjs list
node scripts/long-task-runner.mjs start --kind phase7-core-ordinary -- node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain ordinary
node scripts/long-task-runner.mjs status --run <exact-run-id>
```

Use the run's exact ID for status, logs, or stop. Do not invoke `all`, kill broad process names, or delete run/TEMP roots manually.

Closure shapes:

```powershell
node scripts/long-task-runner.mjs start --kind phase7-core-final-ordinary -- node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain ordinary
node scripts/long-task-runner.mjs start --kind phase7-core-final-smoke -- node scripts/toolchain-manager.mjs matrix --major all -- npm run smoke
npm run policy:check
npm pack --dry-run --json
git diff --check
```

The exact current script syntax must be re-read at implementation time. These shapes do not authorize execution before G7-0 or replace authoritative `scripts/test-domains.mjs` routing.

## 4. Gate G7-0 — Authority, clean base, and dependency freeze

### Goal

Make runtime implementation legal and reproducible before adding code.

### Preconditions

- Read the terminal Phase 6 exact-head run and bind it to one exact 40-character SHA.
- Reconcile local `main`, `origin/main`, working tree, active detached runs, and ignored evidence.
- Obtain explicit user authorization for Phase 7 Core runtime.
- Obtain explicit user approval for the exact TypeScript production package/version.
- Keep JSON-RPC/protocol packages and Serena/Python/`uv`/language-server installation outside Core G7-0; approve them only at G7B/G7C if those extensions begin.

### Required evidence

Create a G7-0 dependency table containing:

| Candidate | Required evidence |
| --- | --- |
| exact `typescript` version | package files, license, lifecycle scripts, transitive dependencies, Node 20/24 compatibility, advisory status, packed size |

### Compatibility freeze

Add or strengthen tests that prove:

- V1/V2/V3/V4 counts remain 28/31/39/51;
- every inherited name/schema/annotation/registration order remains exact;
- omitted/legacy mode advertises no V5;
- current `search`, `inspect_workspace`, and V4 `apply_patch` fixtures are unchanged;
- standard/minimal/full/connection-test projections are recorded before V5.

### Verification

```powershell
npm run test:focused -- test/phase-5-v4-inherited-contract.test.mjs test/phase-5-contract-v4.test.mjs test/search-contract.test.mjs test/apply-patch-contract.test.mjs
npm run policy:check
git diff --check
```

### Exit

G7-0 passes only when Core authority, the exact TypeScript decision, exact-head base, and compatibility fixtures are all recorded. Otherwise stop without production edits.

## 5. Task 7A1 — Per-server semantic kernel

### Goal

Create a lifecycle-owned Provider manager without changing public tools.

### Add

- `src/semantic/types.ts`
- `src/semantic/manager.ts`
- `src/semantic/health.ts`
- `src/semantic/index.ts`
- `test/phase-7-semantic-manager.test.mjs`

### Modify

- `src/analysis/providers.ts`
- `src/analysis/types.ts`
- `src/analysis/index.ts`
- `src/guard.ts`
- `src/server.ts`
- `src/http.ts`
- `src/stdio.ts`
- relevant server dependency/test helpers

### RED tests

1. Two server instances cannot observe each other's Providers, health, workspaces, or caches.
2. `closed`, `expired`, `policy_revision_changed`, and `transport_closed` all emit one opaque internal revocation notification, cancel requests, evict previews/cache, and dispose only the affected Provider project.
3. HTTP/stdio transport close observes bounded asynchronous disposal success/failure; server close disposes exact owned Providers once.
4. Provider selection is per capability and deterministic.
5. `none` returns typed unsupported without breaking lexical search.
6. timeout/crash/malformed result can fall back to builtin and reports `fallback`.
7. rename never falls back to lexical.
8. current global registry behavior cannot register a Provider across server instances.

### Implementation

- Introduce `SemanticProviderManager` as a dependency of one MCP server lifecycle domain.
- Move Provider registration/selection out of the module-global `Map`.
- Keep a temporary internal compatibility adapter only if current analysis tests require it; remove it before G7-A.
- Define stable capability, state, reason-code, cancellation, deadline, and result-envelope types.
- Add bounded per-workspace health/circuit state without starting an external process.
- Bind caches to workspace identity and policy generation.
- Add one internal `onWorkspaceRevoked({ id, key, reason })` notification at the private `WorkspaceManager` revocation boundary; no public error reveals the reason.

### Narrow verification

```powershell
npm run test:focused -- test/phase-7-semantic-manager.test.mjs test/analysis-smoke-entry.test.mjs test/search-contract.test.mjs test/workspace-lifecycle.test.mjs test/policy-transport.test.mjs
npm run build
```

### Exit

The internal manager is useful in tests, public behavior is unchanged, and no process-global semantic state remains.

## 6. Task 7A2 — Canonical Core source, position, and result boundary

### Goal

Make builtin semantic input/output pass one mandatory race-resistant workspace boundary before TypeScript is connected. LSP URI and encoding work stays in Phase 7C.

### Add

- `src/semantic/sourceSnapshot.ts`
- `src/semantic/positions.ts`
- `src/semantic/normalize.ts`
- `src/semantic/budgets.ts`
- `test/phase-7-source-boundary.test.mjs`
- `test/phase-7-public-position.test.mjs`
- fixtures for CRLF, LF, BOM, surrogate/combining characters, junction/symlink/hardlink, and replacement races

### Reuse

- existing PathGuard/native realpath behavior;
- the Phase 6 canonical same-handle bounded reader as the required basis for every workspace source/config/metadata/declaration read;
- existing secret-path and redaction rules;
- existing output-budget utilities.

Do not create a second weaker validate-then-open reader.

### RED tests

- reject outside-root, blocked-secret, link/junction escape, hardlink alias, non-ordinary file, invalid UTF-8, oversized file, and replacement identity/content drift;
- reject Windows device, UNC, drive-relative, ADS, reserved, trailing-dot/space, mixed-case escape, and cross-drive paths;
- reject any workspace semantic read that cannot use the canonical same-handle reader or has `nlink !== 1`;
- convert 1-based Unicode code-point positions to TypeScript offsets and back for CRLF/LF/BOM/surrogate/combining/EOL fixtures;
- reject negative, zero, past-EOL, reversed, overlapping, invalid-boundary, and integer-overflow ranges;
- discard unknown Provider fields and raw absolute-path/display text;
- truncate previews only after the complete count/omitted metadata is known.

### Implementation

- Define immutable source snapshots with relative path, stable identity, SHA-256, byte length, line index, and text.
- Require every Provider request to use snapshots.
- Treat builtin returned locations/edits as hostile and normalize them again; reserve file-URI parsing and LSP encodings for G7C.
- Centralize language detection, per-file/request/workspace/result/diff/total budgets, and safe reason codes.
- Keep source bodies and complete diffs out of persistent logs.

### Narrow verification

```powershell
npm run test:focused -- test/phase-7-source-boundary.test.mjs test/phase-7-public-position.test.mjs test/path-policy.test.mjs test/guidance-safe-text-reader.test.mjs test/guidance-safe-text-reader-windows.test.mjs
npm run build
```

Use actual current path-test filenames discovered at implementation time; do not invent a skip when a named historical test moved.

### Exit

A controlled builtin fixture cannot return one accepted location/edit without passing the same canonical boundary later reused by extensions.

## 7. Task 7A3 — Builtin JavaScript/TypeScript vertical slice

### Goal

Deliver useful zero-setup definition, references, and diagnostics internally before adding a public tool or external process.

### Add

- `src/semantic/builtin/typescriptHost.ts`
- `src/semantic/builtin/typescriptProvider.ts`
- `src/semantic/builtin/typescriptWorker.ts`
- `src/semantic/builtin/lexicalProvider.ts`
- `src/semantic/builtin/projectResolver.ts`
- `test/phase-7-builtin-typescript.test.mjs`
- `test/fixtures/semantic/typescript-configured/`
- `test/fixtures/semantic/typescript-inferred/`
- `test/fixtures/semantic/javascript-inferred/`
- `test/fixtures/semantic/nodenext-dependencies/`
- `test/fixtures/semantic/monorepo-extends/`

### Modify

- `package.json`
- lockfile
- `src/semantic/manager.ts`
- package/dependency-policy fixtures

Only the exact G7-0-approved dependency may be added.

### RED tests

Configured project:

- imported symbol definition resolves to the correct source range;
- references distinguish declaration inclusion;
- syntactic and semantic diagnostics are stable and bounded;
- path aliases stay within the workspace;
- in-root `tsconfig extends`, project references, `package.json` `exports/types`, dependency-owned `.d.ts`, and `@types/node` resolve as data;
- root-external `extends`, project references, package targets, or module resolution cannot escape;
- missing external packages return diagnostics without installation.
- NodeNext `.js` imports resolve to authorized `.ts` sources as they do in this repository.

Inferred project:

- JS and TS work without `tsconfig`;
- bounded sibling discovery is deterministic;
- generated/vendor/ignored/oversized candidates respect policy and budgets.

Host confinement:

- standard library reads come only from the pinned TypeScript package;
- workspace-local TypeScript compiler/plugins/loaders never load or execute;
- no host method writes, watches, executes, or enumerates outside allowed snapshots;
- no project lifecycle script runs;
- same relative paths in two workspaces never share a project/cache.
- every workspace source/config/package/declaration read uses the canonical same-handle reader with `nlink === 1`;
- an external editor's same-size/same-timestamp content change invalidates the cached project before the next result;
- incomplete project coverage blocks rename-token creation.

Worker and performance:

- compiler work runs in an owned terminable worker from the first implementation;
- cancellation, crash, malformed/oversized worker messages, memory, queue, concurrency, and total worker limits are deterministic;
- MCP event-loop responsiveness remains bounded during a large/project-pathological request;
- on the reference fixture, cold result is at most 5 seconds and p95 warm definition/references-or-diagnostics/rename-preview targets are 1/2/3 seconds; misses block default activation until explicitly resolved.

Fallback:

- unsupported language definition/reference may return labeled lexical results;
- unsupported diagnostics are honest;
- unsupported rename produces no preview.

### Implementation

- Build a constrained compiler/language-service host over immutable source snapshots inside a lazy owned worker.
- Parse local config as bounded data; implement only needed options and report ignored unsafe options.
- Allow standard library assets through an audited package-root manifest/digest and same-handle reads.
- Allow only reachable, in-root package metadata/declarations/config references as data; never enumerate all `node_modules`.
- Maintain a bounded project cache keyed by server/workspace/config/policy/file hashes.
- Revalidate project manifest and every cached file identity/hash before each request.
- Enforce global worker/request/cache budgets across transports, not only per session.
- Map compiler diagnostics and locations through the canonical normalizer.

### Narrow verification

```powershell
npm run test:focused -- test/phase-7-builtin-typescript.test.mjs test/phase-7-typescript-worker.test.mjs test/phase-7-source-boundary.test.mjs test/analysis-smoke-entry.test.mjs test/package-contents.test.mjs
npm run build
npm run policy:check
```

Then run the affected suite and build on managed Node 20 and 24.

### User checkpoint

Use an internal CLI/test harness against this repository to show:

- one definition;
- one multi-file reference result;
- one real diagnostic or an explicit clean result;
- one definition/reference through this repository's NodeNext and installed declaration graph;
- no external Provider process.

### Exit

The builtin engine is independently useful and bounded before any public V5 schema is introduced.

## 8. Task 7A4 — V5 inherited-runtime migration and public `semantic` tool

### Goal

Migrate every closed-world Contract 4 runtime boundary, then expose the useful builtin slice through one discoverable, strict, read-only public tool while preserving every legacy and persisted contract.

### Add

- `src/tools/schemas/semantic.ts`
- `src/tools/contracts/v5.ts`
- `src/tools/contracts/versions.ts`
- `test/phase-7-contract-v5.test.mjs`
- `test/phase-7-v5-runtime-inheritance.test.mjs`
- `test/phase-7-semantic-routing.test.mjs`
- `test/semantic-contract.test.mjs`

### Modify

- `src/tools/contracts/types.ts`
- `src/tools/contracts/catalog.ts`
- `src/tools/contracts/registration.ts`
- `src/tools/contracts/index.ts`
- `src/config.ts`
- `src/productionRuntime.ts`
- `src/http.ts`
- `src/stdio.ts`
- `src/policy/runtime.ts`
- relevant `src/process/` contract gates
- `src/git/productionBootstrap.ts`
- `src/server.ts`
- CLI/server config and supertool parsing for `CODEXGPT_SEMANTIC_MODE`
- inventory/self-test/doctor fixtures that enumerate tool contracts

### RED tests

- explicit-standard V5 has exactly 52 tools: exact V4 set plus `semantic`;
- V1–V4 remain exact and omit semantic;
- legacy/omitted mode remains exact before default activation;
- shared `contractIncludesV2/V3/V4/V5` behavior reaches config, HTTP/stdio, production composition, Policy/Approval, process, Git bootstrap, inventory/doctor, and the supertool without accidental `=== 4` downgrade;
- V5 mutation still persists the existing Phase 3 transaction/change-set version and preserves Git/Audit/resource fingerprints;
- `CODEXGPT_SEMANTIC_MODE=standard` maps to Contract 5; contradictory explicit mode/contract inputs fail closed;
- legacy mode does not read/validate semantic registration, start a Provider, import/init TypeScript, or change startup/doctor/server instructions;
- standard/full expose semantic; minimal/connection-test do not;
- schema is a strict discriminated union and rejects unknown/mixed fields;
- `definition`/`references`/`rename_preview` accept exactly one locator: exact position or `symbol + optional path_hint`;
- a unique symbol resolves, ambiguity returns bounded candidates/`needs_disambiguation`, and no candidate is guessed;
- one-file diagnostics requires a path; workspace diagnostics do not exist in Core;
- rename validates bounded `new_name` but performs no mutation;
- read-only annotations are exact;
- result envelopes report configured/actual Provider, `result_quality`, partial/omitted, `next_action`, and safe degradation;
- the V5 `codexgpt` supertool action delegates to the same semantic handler and cannot dispatch a raw internal action;
- natural-language fixtures distinguish semantic symbol/diagnostic/rename requests from text `search` and overview `inspect_workspace`;
- workspace ownership/lifecycle errors stay opaque;
- Audit does not store source bodies, full diff, raw stderr, or absolute paths.

### Implementation

- Add one strict operation-discriminated schema.
- Introduce inherited-contract predicates and migrate every intended closed-world V4 runtime comparison before registering V5.
- Resolve workspace through the current named session-local boundary.
- Use the per-server manager and canonical source/result normalizer.
- Freeze the design's exact goal-oriented tool description and routing fixtures.
- Keep existing `search` and `inspect_workspace` schemas unchanged.
- Add the required stable V5 supertool action for cached clients; do not create a second semantic implementation.

### Narrow verification

```powershell
npm run test:focused -- test/phase-7-contract-v5.test.mjs test/phase-7-v5-runtime-inheritance.test.mjs test/phase-7-semantic-routing.test.mjs test/semantic-contract.test.mjs test/phase-5-v4-inherited-contract.test.mjs test/search-contract.test.mjs test/codexgpt-contract.test.mjs
npm run build
```

### Live Gate G7-M

From a fresh local supported public entry and a refreshed ChatGPT App:

1. ask “`startWorkerLeaseRenewal` 在哪里定义？” without giving a path or running search first;
2. ask for references;
3. ask for diagnostics on one file;
4. confirm ChatGPT chooses `semantic` without being taught a Provider name, path, or line and returns candidates rather than guessing when deliberately ambiguous;
5. confirm results use relative paths and name `builtin-typescript`;
6. confirm ordinary search/read still work after a forced unsupported-language result.

Record `passed` or `environment-blocked`; do not flip the default or substitute unit tests.

### Exit

Explicit-standard V5 is useful for read-only navigation, inherited runtime semantics are exact, and legacy/persisted projections remain green.

## 9. Task 7A5 — Rename planner and complete preview

### Goal

Convert builtin compiler symbol identity into a complete, bounded, non-mutating text-edit plan. LSP edit normalization belongs to Phase 7C.

### Add

- `src/semantic/renamePlanner.ts`
- `src/semantic/previewStore.ts`
- `src/semantic/diffPreview.ts`
- `test/phase-7-rename-preview.test.mjs`
- `test/phase-7-preview-lifecycle.test.mjs`

### Modify

- `src/semantic/builtin/typescriptProvider.ts`
- `src/semantic/manager.ts`
- `src/tools/schemas/semantic.ts`
- `src/server.ts`

### RED tests

Symbol correctness:

- reject a non-renamable position;
- resolve a symbol-only locator only when exactly one candidate exists; ambiguity creates no token;
- distinguish shadowed/local/exported symbols;
- validate the language-specific new name;
- preserve shorthand/import/export/property behavior returned by TypeScript;
- never use lexical replacement.

Edit correctness:

- normalize every target file through PathGuard;
- reject blocked/outside/non-file/linked/replaced/invalid UTF-8 targets;
- reject overlap, duplicate conflict, invalid range, resource operation, and incomplete file manifest;
- apply descending-offset edits to the exact snapshot;
- keep every path/identity/hash/edit in the server manifest even when the public diff truncates; public output returns paths/counts plus one manifest digest, not per-file hashes;
- refuse plan creation when complete manifest/edit storage exceeds limits.

Binding/lifecycle:

- tokens are random, opaque, per server instance/transport/workspace/policy/access/worktree/Provider generation, 15-minute monotonic-age bounded, single-use, and non-enumerable;
- state is exactly `ready -> reserved(invocation_id) -> consumed | burned`;
- foreign/expired/evicted/closed/restarted/policy/access/worktree-stale lookup returns the same safe failure shape;
- explicit close, workspace expiry, policy-revision change, and transport revoke invalidate through the shared revocation notification;
- per-workspace token/byte quotas evict only unused previews;
- persistent Audit never records token values or full source/diff.

### Implementation

- Map TypeScript `getRenameInfo`/rename locations into normalized text edits.
- Generate resulting text in memory and compute edit/result digests.
- Store complete plans in a bounded in-memory preview store.
- Return a bounded public manifest projection/diff while retaining complete identity/hash/edit facts server-side.
- Bind monotonic TTL and wall-clock display expiry separately.
- Invalidate previews on the shared workspace revocation event, access/worktree change, Provider restart, and successful changed-file mutation.

### Narrow verification

```powershell
npm run test:focused -- test/phase-7-rename-preview.test.mjs test/phase-7-preview-lifecycle.test.mjs test/semantic-contract.test.mjs
npm run build
```

### Exit

The preview proves the full intended batch but still has no file-writing path.

## 10. Task 7A6 — V5 `apply_patch` semantic-preview branch

### Goal

Apply an exact semantic preview once through the existing atomic mutation path.

### Add

- `test/phase-7-rename-apply.test.mjs`
- `test/phase-7-rename-races.test.mjs`
- `test/phase-7-rename-transaction.test.mjs`

### Modify

- V5-only `apply_patch` schema/contract
- `src/server.ts`
- `src/policy/runtime.ts`
- `src/policy/integration.ts`
- `src/policy/authorizationFacts.ts`
- `src/transactions/types.ts`
- `src/transactions/schemas.ts`
- `src/transactions/engine.ts`
- `src/transactions/atomicFs.ts`
- bounded semantic audit-facts/participant schemas
- preview-store consumption/invalidation
- mutation architecture inventory only for legitimate call-site drift, never as a blanket exemption

### RED tests

Success:

- same-file rename applies once;
- multi-file rename creates one atomic transaction/change set;
- expected hashes and resulting bytes match preview;
- approval display and binding include Provider/manifest digest, affected safe paths, file/edit/byte counts, and policy/access/worktree facts;
- an approval for preview A cannot authorize B;
- ordinary show-changes/undo/audit behavior remains available;
- successful mutation invalidates related previews.

Race and binding:

- reject changed bytes with same size/timestamp;
- reject a pre-created distinct same-content object, parent replacement, case alias, link/junction swap, policy/access/worktree/root generation change, Provider restart, explicit close, workspace expiry, transport revoke, TTL expiry, replay, and concurrent apply;
- carry canonical path key, stable identity, parent/path binding, expected hash, and semantic facts into the transaction and compare them during the second inspect/stage after the existing workspace lock;
- a partial preparation/commit failure changes no files;
- drift/binding mismatch, any transaction attempt, and unknown/recovery-required terminal state burn the token; authorization denial occurs before reservation;
- failed transaction follows current recovery semantics without returning a suspicious token to ready;
- rejection never leaks foreign token/workspace facts.

Security:

- `patch` and `semantic_preview_id` are mutually exclusive;
- V1–V4 cannot send the semantic branch;
- preview is not mutation approval;
- a non-consuming opaque pre-authorization resolver returns the same safe failure for foreign/expired tokens at policy and handler boundaries;
- `semanticFactsDigest` is identical in pre-authorization, approval reservation, handler reservation, transaction request, and audit;
- secret-looking resulting content follows current mutation policy;
- Provider modules contain no direct filesystem writer, shell, Git, or mutation-service bypass;
- static mutation inventory proves the only write path is the existing prepared-batch transaction path;
- audit contains no token, absolute path, source body, raw stderr, or complete diff, and audit participant failure preserves atomic rollback.

### Implementation

- Resolve the token non-consumingly before approval and bind bounded semantic facts to the approval; reserve only after authorization.
- Reopen/revalidate every snapshot and recompute resulting texts.
- Call existing `prepareWorkspaceTextBatch`.
- Attach the batch only through `dependencies.workspaceMutationRuntime` plus `attachPreparedBatchMutation`, returning a pending mutation to the existing Policy Kernel; never instantiate/use `LocalMutationService`.
- Extend the internal transaction precondition compatibly so the Phase 3 lock-held second inspection checks semantic identity/path/hash facts, while all legacy operations keep their exact schema/behavior.
- Enforce `ready -> reserved(invocation_id) -> consumed | burned`; do not release after a transaction attempt or uncertain terminal.
- Persist bounded semantic audit facts through the existing atomic transaction audit participant.

### Narrow verification

```powershell
npm run test:focused -- test/phase-7-rename-apply.test.mjs test/phase-7-rename-races.test.mjs test/phase-7-rename-transaction.test.mjs test/apply-patch-transaction.test.mjs test/apply-patch-contract.test.mjs test/mutation-architecture.test.mjs test/transaction-architecture.test.mjs
npm run build
npm run policy:check
```

Run the race/transaction set on both managed Node majors.

### Live Gate G7-R

In a disposable authorized fixture workspace through ChatGPT:

1. ask “先看影响” and confirm ChatGPT stops after the multi-file preview;
2. inspect the public paths/counts/manifest digest/diff without per-file hashes or token narration;
3. separately ask “完成重命名” and confirm ChatGPT may preview then apply in one turn while the existing mutation policy decides approval;
4. apply exactly once and verify compile/tests;
5. show the ordinary change set;
6. prove replay and same-content object replacement fail safely;
7. undo through the existing mechanism.

Do not use this repository's active Phase 6 working tree as the destructive fixture.

### Exit

Rename is an ordinary, atomic, reviewable CodexGPT mutation; no Provider can write.

## 11. Task 7A7 — Core health, doctor, migration, and operator experience

### Goal

Make builtin/worker failures understandable, keep semantics from degrading ordinary work, and give cached 51-tool Apps one explicit migration action.

### Add

- `src/semantic/status.ts`
- `test/phase-7-core-health.test.mjs`
- `test/phase-7-semantic-cli.test.mjs`
- `test/phase-7-cached-app-migration.test.mjs`

### Modify

- `scripts/codexgpt-entry.mjs`
- `scripts/codexgpt.mjs` implementation behind the public entry as appropriate
- doctor/settings/profile schema and migration
- server startup/shutdown integration
- minimal help/user docs needed for the current Core slice

### CLI contract

```text
codexgpt semantic status
codexgpt semantic status --verbose
codexgpt semantic use builtin|none
codexgpt semantic disable
```

`status` shows capability/health plus one action; `--verbose` adds safe engine/version/budget facts. `use` and `disable` must not reveal tokens or broad environment state. Provider `setup` is introduced only by a separately authorized extension.

### RED tests

- workspace open/startup does not wait for builtin worker initialization;
- status distinguishes configured vs actual capability and `result_quality`;
- missing/wrong TypeScript engine asset returns one exact recovery action;
- worker timeout, cancellation, crash, malformed/oversized message, queue/concurrency/memory exhaustion, and shutdown are bounded;
- circuit opens after a fixed failure budget and falls back immediately during cooldown;
- restart attempts are bounded;
- owned worker termination never targets unrelated processes;
- server shutdown and workspace close cannot hang;
- builtin/none rollback is one restart and preserves existing profile compatibility;
- unsupported language does not make doctor globally fail;
- cooldown reports `retry_after_ms`; all degradation reports stable `next_action`;
- an existing 51-tool App receives one non-secret “Scan Tools or recreate” startup/doctor notice after V5 activation, with no transparent-refresh claim.

### Implementation

- Reuse Node worker lifecycle primitives and current bounded diagnostics; do not add external process machinery to Core.
- Add capability probes and safe reason codes.
- Persist only the builtin/none selector; keep health/worker generation in memory.
- Make `semantic status` the single detailed troubleshooting surface; normal tool errors stay concise.

### Narrow verification

```powershell
npm run test:focused -- test/phase-7-core-health.test.mjs test/phase-7-semantic-cli.test.mjs test/phase-7-cached-app-migration.test.mjs test/doctor-shell.test.mjs
npm run build
```

### Exit

An unhealthy builtin worker cannot block startup or ordinary tools, cached Apps receive one migration action, and the user gets one concrete recovery step.

Continue directly to Task 7A8 in Section 14. Sections 12–13 are post-Core extension appendices, not the next implementation steps.

## 12. Post-Core extension appendix — Task 7B1 Serena retrieval

Do not execute this section in the Core sequence. Complete Tasks 7A8–7A9 and Gates G7-U/G7-X plus Core exact-head closure first.

### Goal

Add broad language retrieval through one separately authorized local setup without exposing a generic MCP proxy or Serena's mutating/general agent tools.

### Preconditions

- Phase 7 Core exact-head closure complete;
- separate exact Serena/Python/installer/runtime authorization and dependency audit;
- local setup target directory and rollback are explicitly resolved;
- one named non-JS/TS user need justifies the extension.

### Add

- `src/semantic/providers/serena.ts`
- `src/semantic/providers/serenaProtocol.ts`
- `src/semantic/processSupervisor.ts`
- `scripts/semantic-provider-manager.mjs` or a smaller existing-CLI integration
- `test/phase-7-serena-adapter.test.mjs`
- deterministic fake Serena fixture

### RED tests

- adapter reuses the pinned MCP SDK over a server-owned transport/process supervisor and exposes no raw `tools/list`/call proxy;
- adapter freezes method/tool name, input schema, capability set, and adapter-built argument rules; drift fails closed;
- unknown or caller-selected Serena tool names are impossible;
- mutating rename/file/shell/memory/project-switch/onboarding/dashboard tools are unreachable;
- Serena `rename_symbol` is never called;
- caller fields cannot select path/project/body/include flags; symbol bodies default excluded;
- server-initiated sampling/elicitation/roots/unknown requests are rejected and log notifications are bounded locally;
- relative/absolute result locations pass canonical normalization;
- any result containing outside/blocked paths rejects the entire operation and audits safely;
- timeout/crash/malformed/oversized results fall back;
- one Provider project binds to one workspace;
- state root is outside the workspace with reviewed ACL/reparse-point, cache-content, retention, and explicit purge behavior;
- dashboard and usage reporting are disabled;
- bounded environment excludes arbitrary parent tokens;
- CodexGPT runtime invokes no installer/updater after setup; the child receives no claimed network/filesystem isolation;
- managed launch manifest same-handle binds runtime/interpreter, direct entrypoint, package/lock or wheel/tarball integrity, dependency tree, and argv; PATH shims/cache replacement fail;
- Windows Job/process-group ownership failure makes the Provider unavailable;
- uninstall/disable never deletes user workspace or unrelated Python/`uv` state.

### Implementation

- Make `codexgpt semantic setup serena` perform approved preflight, managed install/registration, selection, probe, rollback recording, and report only whether restart is needed.
- Freeze exact selected-release method/tool/schema/argument mappings.
- Invoke only read-only retrieval and diagnostics.
- Use local managed state and the verified managed installation manifest.
- Prefer offline runtime after setup.
- Report `execution_isolation: none`, `filesystem_isolation: none`, `network_isolation: none`, and `project_code_execution: disabled | possible | unknown`.
- Keep JS/TS routed to builtin and rename capability absent; Serena fills only unsupported retrieval/diagnostic capabilities.

### Verification

```powershell
npm run test:focused -- test/phase-7-serena-adapter.test.mjs test/phase-7-provider-health.test.mjs test/phase-7-source-boundary.test.mjs test/semantic-contract.test.mjs test/process-manager.test.mjs
npm run build
npm run policy:check
```

Then run one explicitly authorized real Serena acceptance in a disposable workspace:

- definitions/references/diagnostics for one supported non-JS/TS language;
- forced outside-path result fixture rejects;
- status reports exact version and no isolation claim;
- disabling returns immediately to builtin.

Then run Serena-specific execution/security/UX reviews, fix supported findings with regressions, and require its own local/package/publication/exact-head gates. Core remains closed if this optional extension is deferred or rejected.

### Exit

Serena improves retrieval breadth. CodexGPT grants/executes no protocol-level write/shell/tool-selection authority, while honestly reporting that the same-user child itself has no filesystem/network isolation. It is not required for Core success.

## 13. Post-Core extension appendix — Task 7C1 direct LSP

### Goal

Support a generic, strict stdio LSP subset only when a concrete language remains unsupported after Core and any approved Serena extension.

### Preconditions

- Phase 7 Core exact-head closure complete;
- named language/user journey and separate runtime/dependency/install authorization approved;
- protocol dependency/local-framer and server-specific project-code-execution review approved;
- exact fixture and one optional real server registration approved;
- process supervisor and canonical source/position boundary pass.

### Add

- `src/semantic/providers/lsp/framing.ts`
- `src/semantic/providers/lsp/client.ts`
- `src/semantic/providers/lsp/provider.ts`
- `src/semantic/providers/lsp/workspaceEdit.ts`
- `test/phase-7-lsp-protocol.test.mjs`
- `test/phase-7-lsp-workspace-edit.test.mjs`
- deterministic fixture LSP server

### RED tests

Framing/lifecycle:

- fragmented headers/bodies, multiple messages, UTF-8 payloads, invalid content length, duplicate headers, oversized messages, malformed JSON, unknown IDs, cancellation, timeout, orderly shutdown, crash, and stderr flood;
- exact fixed executable/argv/identity/environment/cwd;
- no TCP/WebSocket/remote URI registration.
- managed manifest binds runtime, entrypoint, package integrity/dependency tree, argv, and same-handle launch identity; PATH shims are rejected.

Capabilities:

- negotiate position encoding;
- call only initialize/open/change/close/definition/references/diagnostics/prepareRename/rename/shutdown/exit;
- reject unknown server requests;
- refuse `workspace/applyEdit`, `workspace/executeCommand`, unsafe dynamic registration, and caller-selected arbitrary methods;
- deny every server-to-client request by default; `workspace/applyEdit` returns `applied:false` without reading paths, and any reviewed configuration response is frozen/bounded;
- do not forward show/log messages raw.

Locations/edits:

- normalize `Location` and `LocationLink`;
- reject a WorkspaceEdit containing both `changes` and `documentChanges`; normalize exactly one text-only form;
- require document versions when supplied;
- reject Create/Rename/Delete resource operations;
- reject overlap/conflict/snippet/repeated-version/invalid URI/range/version;
- standard-parse file URIs; reject authority/query/fragment/NUL/encoded slash-or-backslash/double encoding/UNC/device/ADS/trailing-dot-space and deduplicate canonical aliases;
- require `LocationLink.targetSelectionRange` inside `targetRange`;
- convert valid rename edits into the same preview store and transaction path;
- never send an edit acknowledgement that implies CodexGPT applied a rejected edit.

### Implementation

- Implement only the frozen subset.
- Make the client server-owned and project/workspace-bound.
- Send snapshots, not broad filesystem access requests, where server protocol permits.
- Normalize all outputs before manager acceptance.
- Route rename `WorkspaceEdit` through the existing rename planner.
- Report `execution_isolation: none`, `filesystem_isolation: none`, `network_isolation: none`, and server-specific `project_code_execution`.

### Verification

```powershell
npm run test:focused -- test/phase-7-lsp-protocol.test.mjs test/phase-7-lsp-workspace-edit.test.mjs test/phase-7-position-encoding.test.mjs test/phase-7-provider-health.test.mjs test/phase-7-rename-transaction.test.mjs
npm run build
npm run policy:check
```

Optional real-server acceptance uses one exact locally approved registration. A community TypeScript language server may validate interoperability, but it does not replace builtin default acceptance and is not silently bundled.

Run LSP-specific execution/security/UX reviews and its own local/package/publication/exact-head gates. Deferral is the default completed outcome when no concrete language need exists.

### Exit

The direct adapter expands language support without becoming an arbitrary JSON-RPC/process/mutation bridge.

## 14. Task 7A8 — Core surface integration and documentation

### Goal

Make semantic behavior consistent across CLI, MCP HTTP/stdio, profiles, inventory, doctor, package, Smoke, and user documentation.

### Modify

- `README.md`
- `README_ZH.md`
- `SECURITY.md`
- `design.md`
- `CHANGELOG.md`
- server/CLI/profile/inventory/self-test/doctor/package fixtures
- protected Smoke only through an exact compatibility loader if required
- `AGENTS.md`, `Memory.md`, master plan, roadmap, and Phase 7 archive after implementation evidence exists

### Required documentation

- default zero-setup JS/TS journey;
- one semantic tool with examples;
- rename preview/apply/undo journey;
- actual builtin/lexical quality and fallback behavior;
- `builtin` and `none` selectors;
- exact local status/rollback commands;
- Serena/LSP are unimplemented post-Core extensions, not implied bundled capabilities;
- Provider never grants workspace/mutation permission;
- cached App requires Scan Tools/recreation on V5 activation;
- no manual static-Bearer claim for ChatGPT Web;
- supported public entry only.

### Integration tests

- stdio and HTTP return identical V5 schemas/results;
- query-token/auth/Host/Origin behavior unchanged;
- standard/full/minimal/connection-test projections exact;
- workspace handles remain transport/session scoped;
- workspace close clears semantic state and previews;
- profile migration reads old records and writes only the new version when changed;
- package contains required compiled Core semantic files and exact TypeScript assets/dependency only, with no tests/evidence/provider cache;
- self-test/doctor never writes a workspace merely to check semantics;
- public startup remains one command.

### Verification

```powershell
npm run test:focused -- test/semantic-contract.test.mjs test/phase-7-contract-v5.test.mjs test/server-config-contract.test.mjs test/codexgpt-inventory-contract.test.mjs test/codexgpt-self-test-contract.test.mjs test/package-contents.test.mjs test/auth-documentation.test.mjs
npm run build
npm run policy:check
git diff --check
```

Run the complete affected set on both managed majors.

### Exit

Every Core surface tells the same builtin capability, quality, authority, fallback, migration, and rollback truth.

## 15. Task 7A9 — Core post-runtime adversarial repair

### Goal

Review the completed implementation, not an imagined design, and turn every valid finding into a root-cause fix plus regression.

### Required parallel reviews

#### Execution and correctness

- TypeScript host completeness and performance;
- worker responsiveness/crash/cancellation/global budgets;
- project/config/module resolution;
- position/range conversion;
- Provider capability selection and fallback;
- preview completeness and edit application;
- workspace revocation and worker startup/shutdown/cancellation;
- Windows/Ubuntu and Node 20/24 behavior;
- task ordering and missing integration paths.

#### Security and compatibility

- PathGuard/same-handle/source/transaction-lock races;
- secret/output redaction;
- preview token binding/replay/policy drift;
- pre-authorization/approval/audit facts binding;
- transaction/mutation-inventory bypass;
- V1–V4/tool-profile/auth/workspace compatibility;
- false isolation or network claims.

#### UX and operability

- no-setup first success;
- schema/tool discoverability for ChatGPT;
- ambiguity and error recovery;
- latency and output volume;
- status/migration/rollback friction;
- rename review/apply/undo clarity;
- cached App behavior;
- builtin-worker failure and lexical fallback behavior.

### Repair rule

For each supported finding:

1. record evidence and affected user/security outcome;
2. add a failing regression or deterministic reproduction;
3. fix the root cause;
4. run the narrow suite and both managed majors where relevant;
5. update design/plan only when the implemented contract changes;
6. append the Phase 7 archive.

Do not close a finding by weakening a test, increasing an unbounded timeout, adding a platform skip, hiding an error, or relabeling ambient authority as isolation.

### Exit

All high/medium supported findings are repaired. Remaining limitations are explicit, bounded, and accepted by the user where they affect the product contract.

## 16. Gate G7-U — Live ChatGPT acceptance

Use a fresh App or explicit **Scan Tools** refresh and the supported public CLI entry. Also retain one old 51-tool App fixture to verify the migration notice.

### Journey U1 — No-setup navigation

1. Open this repository with the standard profile.
2. Ask “`startWorkerLeaseRenewal` 在哪里定义？” without a path or pre-search.
3. Ask for references and open one returned file.
4. Ask for diagnostics.
5. Ask an ambiguous symbol and confirm candidates appear without guessing.
6. Confirm no Provider/setup question and no external process requirement.

### Journey U2 — Safe rename

1. Open a disposable authorized fixture.
2. Say “先看影响”; confirm paths/counts/manifest digest/diff appear, no per-file hashes/token narration, and no apply occurs.
3. Say “完成重命名” in a fresh fixture; confirm ChatGPT may preview and apply in one turn while existing policy decides approval.
4. Verify build/tests and inspect the ordinary change set.
5. Prove replay fails and undo succeeds.

### Journey U3 — Drift

1. Create a preview.
2. Change one affected file through an authorized independent edit.
3. Apply the old preview.
4. Confirm safe stale rejection and one-step fresh-preview guidance.
5. Repeat with a pre-created distinct same-content object and confirm the lock-held identity check rejects.

### Journey U4 — Worker failure and lexical fallback

1. Force the builtin fixture worker to timeout/crash.
2. Confirm workspace/search/read remain usable.
3. Confirm an unsupported language result says `result_quality: lexical` or typed unsupported rather than semantic certainty.
4. Confirm status gives one exact recovery action and cooldown `retry_after_ms`.

### Journey U5 — Boundaries

1. Ask a controlled builtin fixture to return an outside, blocked, linked, and replaced path.
2. Confirm every result is rejected/redacted/audited without path disclosure.
3. Confirm no semantic direct writer/shell/tool-selection call occurs.

### Journey U6 — Cached App migration

1. Connect an old 51-tool App after V5 activation.
2. Confirm the supported entry/doctor gives one clear **Scan Tools** or recreate action without claiming transparent refresh.
3. Refresh/recreate and complete U1.

All journeys require actual user-observable evidence. Environment-blocked is not passed.

## 17. Gate G7-X — Local closure

### Focused and cross-platform

- every Phase 7 Core test;
- inherited V1–V4 contract tests;
- PathGuard/Windows path/security tests;
- workspace lifecycle and transport isolation;
- transaction, mutation architecture, apply-patch, change-set, undo, audit;
- worker, workspace-revocation, and transaction-lifecycle fixtures;
- auth/Host/Origin/query-token documentation;
- package contents and dependency policy;
- build on managed Node 20 and 24.

### Authoritative runs

- prove no same-kind run is active;
- detached ordinary on both managed majors;
- protected Smoke on both managed majors;
- control tests only in CI or proven independent native terminal;
- no stale/unknown run is reclassified as passed;
- retain bounded evidence under ignored `.ai-bridge/`.

### Static/integrity

- `npm run policy:check`;
- `git diff --check`;
- Markdown relative-link audit;
- changed-content credential-pattern scan;
- production dependency/license/advisory audit;
- mutation inventory exact;
- package dry-run exact;
- no tests, archives, `.ai-bridge`, Provider caches, local registrations, credentials, or unmanaged binaries in package;
- `Memory.md` and Phase 7 archive within volume rules;
- only intended files changed.

### Closure result

Record exact commands, counts, skips, run IDs, package sizes, risks, rollback, and next action. A green focused suite is not closure.

## 18. Publication and exact-head closure

Publication requires separate explicit authorization unless already granted at that time.

1. Review the complete diff and current Git status.
2. Stage only the reviewed Phase 7 scope.
3. Run staged-boundary policy and secret checks.
4. Create one concise English commit.
5. Push normally only after authorization.
6. Bind one exact 40-character HEAD to Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.
7. Diagnose the first underlying failure with exact-head tools; repair root cause and repeat only within fresh authorization.
8. Do not create an evidence-only follow-up commit after the closure head passes.
9. Do not deploy or publish a release without separate authorization.

Phase 7 Core closes only when one exact published head passes the complete matrix. Phase 7B/7C extensions, if later authorized, each require their own scoped publication and exact-head result and do not reopen or block Core.

## 19. Memory entry required after every complete step

Append to the active Phase 7 archive:

```text
Date and STEP
Status
Goal
Files changed
RED evidence
Implementation
Exact verification commands/results
Adversarial review/fixes
Decisions
Risks and limitations
Rollback
Next approved action
```

Update root `Memory.md` in place with only current state, active decisions, final evidence, limitations, open items, recent summaries, and the archive link. Start a numbered continuation volume before the active archive reaches the configured 80% direct-read threshold.

## 20. Current next action

The Phase 7 Core checkout candidate has completed STEP-416 code repair and backend live acceptance. STEP-416 fixes MCP wire descriptor publication, production approval state-root alignment, inherited V3 approval binding for Tool Contracts 3/4/5, workspace-root Policy facts, repository-scale TypeScript worker memory, non-authoritative Git summary degradation, and recovery contention. Adversarial review additionally proved that recovery may defer only a `TRANSACTION_BUSY` carrying an exact verified-live-owner fact; unverifiable ownership and every other busy cause remain fail-closed. STEP-417 repairs the exact-head Windows regression caused by applying the production approval root to the standalone owned-process fallback: approvals remain on the transaction root, production processes use that root when the exact server directory exists there, and otherwise process control retains the established legacy local-control root without falling back around corrupt production state.

Authoritative STEP-416 focused evidence:

- managed functional matrix: `2026-07-24T19-20-52-160Z-phase7-step416-managed-functional-r2-c01bac11` — Node 20 and Node 24 each passed 60/60, exit 0, zero stderr;
- managed repository acceptance, isolated from competing CPU load: `2026-07-24T19-23-36-411Z-phase7-step416-managed-repository-r2-0f097adb` — Node 20 and Node 24 each passed 1/1 with the existing warm `<= 2000 ms` assertion unchanged, exit 0, zero stderr;
- managed build: `2026-07-24T19-27-57-319Z-phase7-step416-managed-build-final-efe701ac` — Node 20 and Node 24 passed, exit 0, zero stderr;
- authoritative ordinary: `2026-07-24T19-29-42-826Z-phase7-step416-ordinary-final-5ee89b91` — each managed major ran 1,229 tests, with 1,227 passed, 2 established skips, and 0 failed;
- protected Smoke: `2026-07-24T19-54-59-950Z-phase7-step416-smoke-final-2daab671` — all eight domains passed on both managed majors, exit 0, zero stderr;
- backend HTTP MCP U1 and U2 passed; U3 content drift rejected a stale preview with `FILE_VERSION_CONFLICT`; same-content object replacement is covered by deterministic lock-held regressions, not claimed as real App UI evidence.

The 2026-07-24 follow-up authorization permits final local closure gates, staging only the reviewed Phase 7 scope, one concise English commit, an ordinary push, and bounded exact-head CI diagnosis/repair cycles. It does not authorize Phase 7B/7C, Phase 8, release, deployment, credential work, force push, or unrelated changes.

The original STEP-416 publication `691168ebf88024896d755067656b438217356ed0` was correctly rejected by exact-head run `30123081050` after Windows Node 20 exposed the dual-root process-control regression. STEP-417 now probes the exact production server path with `lstatSync`, allowing legacy fallback only on `ENOENT`; all other state-root errors remain fail-closed. Final local run `2026-07-25T03-57-05-983Z-phase7-step417-final-local-gates-r2-46cbb590` passes managed dual-topology 2/2, authoritative ordinary 1,227/1,229 with 2 established skips, and all eight protected Smoke domains on both Node 20/24 majors; managed build `2026-07-25T03-50-56-919Z-phase7-step416-ci-repair-build-72f42491` also passes both majors. The next legal action is:

1. stage and publish only the reviewed four-file STEP-417 correction scope, excluding the two untracked Phase 8 records and all runtime evidence/state;
2. bind the replacement exact 40-character head to Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package;
3. perform Gate G7-U in the real ChatGPT App after one explicit **Scan Tools** refresh or App recreation, retaining the old 51-tool migration check;
4. keep Serena and direct LSP outside Core and uninstalled;
5. close Core only when both the exact-head matrix and real user-observable G7-U pass. Backend HTTP MCP evidence is not a substitute for the UI gate.
