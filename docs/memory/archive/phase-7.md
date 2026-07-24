# Phase 7 Archive

This append-only volume begins Phase 7 design history. Phase 7 Core runtime starts only after Phase 6 exact-head closure and Gate G7-0 receives fresh runtime and exact TypeScript dependency authorization. Serena and direct LSP have separate post-Core authorization gates.

## 2026-07-23 — STEP-399: Design usable semantic navigation and safe rename

**Status:** Paired design and executable TDD plan complete after execution, security/compatibility, and UX adversarial review. Phase 7 runtime, dependencies, external Provider installations, staging, commit, push, publication, release, and deployment were not performed.

**Goal:** Make Phase 7 runnable, useful, and low-friction before optimizing breadth: zero-setup JavaScript/TypeScript semantic navigation, a symbol-friendly public tool, and a complete rename plan applied through the existing approval and atomic transaction boundary.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-7.md`
- `docs/superpowers/specs/2026-07-23-phase-7-semantic-providers-design.md`
- `docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md`

Separately owned Phase 6 edits in `test/runner-process-identity.test.mjs` and `test/task-cleanup-lifecycle.test.mjs` were inspected only to preserve scope and were not modified or claimed by STEP-399.

**Baseline and authority:**

- Work began while STEP-398 existed as an unpublished local candidate. A separate process later published it as `0cb612f8c05353fb421aff37792967b5a4298e9b`; STEP-399 performed no Git publication.
- Exact-head run `30023834082` passed Repository policy and Ubuntu Node 20/24 but failed Windows Node 20/24 Regression.
- The separately owned Phase 6 repair then ran detached ordinary as `2026-07-23T16-32-29-043Z-phase6-final-ordinary-r4-c7dfea6b`; it completed with exit code 1, empty stderr, cleaned temporary state, and zero retention failures.
- Formal Phase 6 closure therefore remains open. The user authorized Phase 7 design/TDD reconciliation only, not runtime, dependencies, external installs, staging, commit, or push.

**Initial design result:**

- Added one V5 `semantic` tool for definition, references, one-file diagnostics, and rename preview; V1/V2/V3/V4 remain exact 28/31/39/51.
- Chose zero-setup builtin JavaScript/TypeScript as the default and kept lexical analysis as an honest quality-labeled fallback.
- Reused V5 `apply_patch` and the Phase 3 atomic transaction instead of adding a second mutation system.
- Kept Serena and direct LSP optional, with no remote-selected command, install, update, or authority expansion.

**Adversarial review and repairs:**

Execution/correctness review found invalid managed-run commands, closed-world Contract 4 comparisons outside the catalog, an incorrect `LocalMutationService` alternative, no workspace-revocation event, conditional worker use, and optional Providers blocking closure. The final plan now uses the repository's real toolchain/runner commands; migrates V5 across config, HTTP/stdio, production, Policy/Approval, process, Git, inventory/doctor, and supertool boundaries; uses only `dependencies.workspaceMutationRuntime`; adds `onWorkspaceRevoked`; makes the TypeScript worker mandatory; and closes Core before extensions.

Security/compatibility review found that hash-only checks could accept a distinct same-content file after preview, approval could not see the rename manifest, same-handle reading was optional, external no-write/network claims were untrue, executable identity was incomplete, and token/Serena/LSP rules were underspecified. The final design carries canonical path, stable identity, parent/path binding, hash, and `semanticFactsDigest` through the Phase 3 lock-held second inspection; adds non-consuming pre-authorization and atomic audit facts; requires canonical same-handle workspace reads with `nlink === 1`; defines a burn-only suspicious token state machine; binds managed runtime/entrypoint/dependency manifests; and reports no external execution/filesystem/network isolation.

UX review found that natural symbol questions contradicted a mandatory path/line/column schema, real dependency/type graphs could be unreadable, optional Providers delayed the useful feature, rename intent duplicated confirmation, setup required five steps, public output exposed implementation details, diagnostics scope was ambiguous, latency had no target, and cached Apps lacked actionable feedback. The final design adds unique-only symbol resolution with ambiguity candidates; permits bounded in-root `.d.ts`, package metadata, config extension, and project references as data; splits Core/Phase 7B/Phase 7C; distinguishes “preview only” from “complete rename”; makes Serena setup one local action if later authorized; hides per-file hashes from public output; requires one-file diagnostics; sets cold/warm targets; and adds one Scan Tools/recreate migration action.

**Key decisions and user impact:**

- Core is useful without Python, `uv`, Serena, or a language server. The user asks a normal symbol question and does not choose a Provider or line number.
- TypeScript work runs in an owned terminable worker, reads real in-workspace declarations/configuration as data, and must keep the MCP event loop responsive.
- Rename preview stores the complete identity/hash/edit manifest server-side. Public output progressively shows paths, counts, digest, diff, expiry, and one next action.
- A user who asks “先看影响” stops at preview; a user who asks to complete a rename may preview and apply in one turn, with the existing mutation policy deciding approval.
- Stable object identity and exact semantic approval facts survive into the transaction lock. The design does not treat a pre-lock hash or an earlier preview as mutation authorization.
- Serena is Phase 7B after Core closure. Direct LSP is Phase 7C only for a demonstrated unmet language need. Their absence cannot delay Core.

**Verification completed before final archive reconciliation:**

- `npm run policy:check` — passed with `Repository operational policy: PASS`.
- `npm run test:focused -- test/auth-documentation.test.mjs test/package-contents.test.mjs` — passed 8/8 with zero failures.
- Repository-wide Markdown relative-link audit — 125 Markdown files, `BROKEN_COUNT|0`.
- `git diff --check` — passed during the repaired design review.
- `gh run view 30023834082 --json status,conclusion,headSha,jobs,url` — terminal failure, with Repository policy and Ubuntu Node 20/24 successful and Windows Node 20/24 Regression failed.
- `node scripts/long-task-runner.mjs status --run 2026-07-23T16-32-29-043Z-phase6-final-ordinary-r4-c7dfea6b` — terminal completed, exit code 1, empty stderr, cleaned temporary state, zero retention failures.
- Build, Smoke, managed runtime suites, package regeneration, and exact-head CI were not run for STEP-399 because it changes design/project documentation only and Phase 7 runtime is absent.

**Risks and limitations:**

- The documents specify future behavior; no semantic runtime or dependency exists yet.
- Requiring `nlink === 1` may reject some hardlink-backed dependency layouts. This preserves the current provable content boundary and must degrade actionably rather than weaken it silently.
- TypeScript latency targets and real repository/monorepo behavior remain acceptance gates, not achieved measurements.
- Extending Phase 3 with lock-held semantic identity preconditions and pre-authorization facts is a real architecture change that requires fresh runtime approval and RED-first compatibility tests.
- External same-user Providers remain ambient authority even when their protocol allowlist is retrieval-only.
- The two separately owned Phase 6 test repairs and failed ordinary r4 are not resolved by this design step.

**Rollback:** Before publication, remove the two paired Phase 7 documents and this new archive, then revert only STEP-399 changes in `AGENTS.md`, `Memory.md`, the master plan, and historical roadmap. Preserve the separately owned Phase 6 test edits. After adoption, append corrections rather than rewriting this entry. Rollback changes no runtime, dependency, Provider state, credential, workspace, branch, worktree, or audit data.

**Next step:** Complete Phase 6 formal closure under its existing bounded authority. Then obtain fresh Phase 7 Core runtime and exact TypeScript dependency authorization, execute Gate G7-0, and begin Task 7A1. Do not install or request Serena/LSP during Core G7-0.

### Final verification addendum

The first owned-file static scan reported seven trailing-whitespace findings. They were intentional Markdown hard breaks in the new document metadata, but the documents did not need them; they were replaced with blank paragraphs and the complete scan was rerun.

- `npm run policy:check` — passed with `Repository operational policy: PASS`.
- `npm run test:focused -- test/auth-documentation.test.mjs test/package-contents.test.mjs` — passed 8/8 with zero failures.
- `git diff --check` — passed. PowerShell/Git emitted non-failing CRLF conversion warnings for tracked Markdown files.
- Owned STEP-399 scope scan — seven files checked, zero trailing-whitespace findings, and zero secret-value matches.
- Repository-wide Markdown relative-link audit — 126 Markdown files checked, zero broken relative links.
- `Memory.md` remained within its practical line and byte limits; the Phase 7 archive remained well below its continuation-volume threshold.

STEP-399 is complete as an executable design and project-record reconciliation. No Phase 7 runtime, dependency, Provider, staging, commit, push, publication, release, or deployment action was performed.

## 2026-07-24 — STEP-408: Complete the Phase 7 Core local implementation candidate and Gate G7-X

**Status:** Phase 7 Core is complete as a local checkout candidate through Gate G7-X after TDD, execution/correctness review, security/compatibility review, and UX/operability review. Real ChatGPT Gate G7-U, staging, commit, push, publication, release, deployment, and exact-head CI were not performed; Core is therefore not formally closed.

**Goal:** Finish the existing uncommitted Phase 7 Core implementation on native Windows, prove the exact V5/semantic/rename boundaries on managed Node 20 and 24, repair supported adversarial findings instead of weakening gates, and leave one auditable next step.

**Files changed:**

- Runtime and contracts: `src/semantic/`, `src/tools/contracts/v5.ts`, `src/tools/schemas/semantic.ts`, and the existing server/config/policy/audit/mutation/transaction/CLI integration surfaces.
- Dependency and packaging: `package.json`, `package-lock.json` with exact production `typescript@5.9.3` plus compatible transitive advisory updates.
- Tests: all `test/phase-7-*.test.mjs`, inherited contract/transaction fixtures, and the production mutation-writer inventory in `test/phase-4-v3-persistence.test.mjs`.
- Public and project records: `README.md`, `README_ZH.md`, `SECURITY.md`, `design.md`, `CHANGELOG.md`, the Phase 7 plan, master plan, roadmap, `Memory.md`, and this archive.
- Two unrelated untracked Phase 8 OAuth design/plan files were preserved without modification or inclusion in STEP-408.

**RED evidence and root-cause repairs:**

1. Public documentation described only V4/Phase 6. `test/phase-7-documentation.test.mjs` failed until the zero-setup semantic journey, rename preview/apply/undo, status/rollback, Scan Tools migration, no-sandbox boundary, and unimplemented Serena/LSP truth were documented in both languages and security/design/change records.
2. `cancelScope()` terminated the shared TypeScript worker and rejected unrelated workspace requests. The worker client now removes only matching pending entries and terminates the worker only when no unrelated request remains.
3. The manager wrapped invalid rename identifiers and non-renamable symbols as `WORKER_UNAVAILABLE`. Controlled request errors now remain actionable user errors without poisoning worker health.
4. The owned worker rebuilt the exact same TypeScript project for every request. It now retains one bounded language service keyed by an exact SHA-256 digest over asset/path/text inputs and disposes the prior service on replacement.
5. The project cache used a five-second TTL measured before cold scanning, so a slow cold result could be expired on arrival; it also reused stale data until expiry. Cached requests now re-enumerate the source inventory and re-open every known file through the canonical same-handle reader, binding canonical path, parent/path identity, stable object identity, byte length, and SHA-256 before reuse.
6. Revalidation repeated canonical-root construction, double reads, UTF-8 decoding, and line-index construction for already trusted unchanged snapshots. The boundary now reuses one prepared root/PathGuard per batch, performs one same-handle hash pass during revalidation, and skips decoding only when the exact prior trusted SHA-256 matches.
7. A complete dependency graph cache could miss a newly added ambient declaration. Complete graphs now re-enumerate exact package declaration inventories; partial graphs remain honestly partial and refuse rename rather than guessing.
8. The strict warm-definition latency gate initially exceeded two seconds under concurrent load. Source-only symbol lookup now revalidates only the source inventory because the manager resolves the unique source target before the worker call; dependency omissions remain visible through `partial` and `omitted_count`. The strict cold/warm repository gate passed without widening its timeout.
9. The inherited V3 mutation-writer inventory still expected four batch call sites after the semantic apply branch introduced a fifth. All five production calls were inspected and proven to map through `persistedMutationContractVersion(config.toolContractVersion)`; the exact closed-set count was updated from four to five.

**Implementation result:**

- Explicit `standard` Contract V5 inherits V4 exactly and exposes 52 tools: the unchanged 51-tool V4 surface plus one read-only `semantic` tool.
- Builtin `typescript@5.9.3` supports definition, references, one-file diagnostics, unique-only symbol resolution, ambiguity candidates, and complete non-mutating rename previews.
- Results expose relative paths, bounded output, `actual_provider`, and `result_quality`; lexical fallback is never presented as semantic certainty and rename never falls back to lexical replacement.
- Rename plans are random opaque single-use server-local previews bound to workspace, policy generation, source identities/hashes, complete edits, and `semanticFactsDigest`. Only V5 `apply_patch` can consume a preview through the existing approval, lock-held second inspection, atomic transaction, audit, change-set, review, and undo path.
- Workspace close/revocation cancels only its semantic requests and burns its previews. Providers cannot grant workspace access, approve or perform mutations, invoke Git/shell/network operations, install software, or bypass the transaction runtime.
- `codexgpt semantic use builtin`, `semantic status --verbose`, and `semantic disable` provide one local activation/health/rollback path. Existing Apps require one explicit **Scan Tools** refresh or recreation.

**Exact verification evidence:**

- Phase 7 plus apply-patch/transaction/mutation architecture matrix: 80/80 passed on managed Node `20.20.2` and 80/80 on managed Node `24.15.0`.
- HTTP security plus inherited mutation persistence inventory after the final repair: 7/7 passed on each managed Node major.
- Strict repository acceptance with `CODEXGPT_SEMANTIC_LATENCY_GATE=1`: all 11 checks passed, including cold and warm semantic latency.
- Managed Node 20/24 TypeScript builds passed; `npm run policy:check` returned `Repository operational policy: PASS`; `git diff --check` passed with non-failing CRLF warnings only.
- Authoritative ordinary run `2026-07-24T07-24-01-829Z-phase7-core-ordinary-final-r2-34f8955d`: exit 0, empty stderr, cleaned temporary state, 1,220 tests per major, 1,218 passed, 2 established skips, zero failures.
- Protected Smoke run `2026-07-24T07-47-39-512Z-phase7-core-smoke-final-b56c3f08`: exit 0, empty stderr, cleaned temporary state; analysis, analysis CLI, ordinary smoke, HTTP, Pro CLI, doctor, settings, and handoff domains passed on each managed Node major.
- Documentation/auth/package focused checks: 9/9 passed.
- Package dry-run: `codexgpt-0.28.6.tgz`, 1,256,822 packed bytes, 6,969,922 unpacked bytes, 579 entries; required compiled semantic/V5 assets were present and tests, archives, run evidence, credentials, and Provider caches were excluded by package tests.
- `npm install --package-lock-only --ignore-scripts --dry-run` reported up to date. `npm audit --omit=dev --audit-level=high` passed with zero high/critical findings; two moderate transitive findings remain in the current `@modelcontextprotocol/sdk` / `@hono/node-server` compatibility line.
- Repository Markdown relative-link audit: 129 files, zero broken relative links.
- Credential-pattern scan matched only intentional test fixtures; no production or documentation secret value was found.
- Static `src/semantic` scan found no direct filesystem mutation, shell/process execution, network, dynamic-eval, or environment-variable API.

**Adversarial review result:**

The environment exposed no independent Agent runtime, so STEP-408 did not claim multi-agent review. Three independent passes were performed against the completed code: execution/correctness, security/compatibility, and UX/operability. Every supported high/medium finding above received a deterministic RED reproduction, root-cause repair, and narrow plus cross-major verification. No test timeout was widened, platform skip added, error hidden, or ambient authority relabeled as isolation.

**Decisions:**

- Core closes locally before optional Providers. Serena remains Phase 7B and direct LSP remains demand-driven Phase 7C; neither is installed or implied bundled.
- Cached semantic correctness is identity/hash based, not timestamp/TTL based. Source inventory is checked on every cached request; complete dependency inventory is checked whenever the operation depends on it.
- Large or truncated dependency graphs may still serve bounded read-only results with explicit partial facts, but rename requires complete coverage and fails closed.
- The builtin worker remains current-user ambient execution with `execution_isolation: none`, `filesystem_isolation: none`, and `network_isolation: none`.
- No stage, commit, push, release, deployment, or exact-head action is inferred from a green local G7-X.

**Risks and limitations:**

- Gate G7-U requires real ChatGPT user-observable evidence and was not executable through Devspace. Environment-blocked is not counted as passed.
- The current checkout is uncommitted and contains two unrelated untracked Phase 8 documents. They must remain excluded from any later Phase 7 staging review.
- Local ordinary/Smoke used the installed dependency tree; the lockfile carries the compatible advisory updates. Publication still requires a clean install and the complete exact-head package matrix.
- Two moderate upstream HTTP adapter advisories remain. No high or critical advisory remains, but the moderate findings require upstream-compatible resolution rather than a forced unreviewed major override.
- Same-user worker and future external Providers are not credential, filesystem, registry, or network sandboxes.

**Rollback:** Before publication, revert only the reviewed Phase 7 runtime/contracts/tests/docs/dependency changes. Operational rollback for an installed candidate is `codexgpt semantic disable` followed by one restart; V1–V4 and ordinary read/search/edit remain unchanged. No persistent Serena/LSP installation, remote Provider registration, commit, branch, worktree, release, deployment, or credential change was made.

**Next approved action:** Perform real ChatGPT Gate G7-U with one fresh or explicitly refreshed App and retain the old 51-tool migration check. After G7-U passes, request separate authorization for reviewed staging, English commit, ordinary push, and exact-head CI. Do not stage the unrelated Phase 8 files or begin Phase 7B/7C without new authorization.

## 2026-07-24 — STEP-409: Repair Linux parent-directory object reuse

**Status:** First Phase 7 publication candidate pushed; the first exact-head run exposed one Linux race-boundary defect, which is repaired locally with deterministic RED/GREEN and managed Node 20/24 verification. Replacement publication and exact-head verification remain pending.

**Goal:** Preserve the semantic rename guarantee that replacing an affected file's parent directory is rejected inside the workspace lock, even when the original file object is moved back and the filesystem immediately reuses the removed directory inode.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-7.md`
- `src/guard.ts`
- `src/guidance/safeTextReader.ts`
- `test/phase-7-source-boundary.test.mjs`

**Publication and RED evidence:**

- Reviewed Phase 7 scope was staged without the two untracked Phase 8 drafts; staged diff was 84 files, 5,689 insertions, and 180 deletions.
- Staged `git diff --check`, repository policy, and added-line credential-pattern scan passed; the scan found zero staged secret-pattern matches.
- Commit `2fe59314dde9300fe08a59776e96bbaf9408cb7b` (`feat: add Phase 7 semantic core`) was pushed normally to `origin/main`.
- Exact-head run `30077724891` passed classification, build, and Repository policy, but Ubuntu Node 20 and Node 24 Regression both failed `lock-held semantic replace rejects a replaced parent even when the same file object returns` with `ERR_ASSERTION: Missing expected rejection`.
- A deterministic local RED added `parent identity distinguishes a reused directory object generation`; before implementation it failed because `parentObjectIdentity` did not exist.

**Root cause:** Parent identity hashed only canonical path, device, and inode/file ID. Linux may immediately reuse a removed empty directory inode for the newly created directory at the same path. The target file object and SHA-256 were intentionally preserved by the fixture, so the lock-held check could not distinguish the new parent object.

**Implementation:**

- Added one canonical `parentObjectIdentity()` helper shared by `PathGuard.resolvePolicyFacts()` and the canonical same-handle reader.
- Parent identity now binds canonical parent path, device, inode/file ID, and object generation.
- `birthtimeNs` is used when available because it remains stable while directory contents change. Filesystems without birth time fail closed by using `ctimeNs`; this may reject a concurrent sibling mutation but cannot silently accept parent replacement.
- No timeout, platform skip, weakened assertion, or hash-only fallback was introduced.

**Verification:**

- Local deterministic RED: `npm run test:focused -- test/phase-7-source-boundary.test.mjs` — 3 passed, 1 failed before implementation.
- `npm run build` — passed.
- Affected local suite: source boundary, rename races, rename apply, and apply-patch transaction — 25/25 passed.
- Managed Node `20.20.2` and `24.15.0` build — passed on both.
- Managed Node 20/24 affected suite — 25/25 passed per major.

**Risks and limitations:** Filesystems without a meaningful birth time use the conservative ctime fallback. A sibling directory-entry change between preview and apply may therefore reject a valid rename on those filesystems; the required recovery is a fresh preview. This is an availability tradeoff, not an authority expansion.

**Rollback:** Revert only the shared generation-aware parent identity helper and its regression. Do not revert the Phase 7 Core candidate or weaken the replaced-parent lock-held precondition.

**Next action:** Run final policy/diff checks, create one concise repair commit, push normally, and bind the replacement exact head to the complete CI matrix. Real ChatGPT G7-U remains required before formal Phase 7 closure.
