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
