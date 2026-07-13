# CodexPro Phase 1 Archive — Volume 2

Status: active
Date opened: 2026-07-13
Step range: STEP-140 onward
Previous volume: [Phase 1 Volume 1 — STEP-073 through STEP-139](phase-1.md)

This is the active append-only continuation of the Phase 1 implementation record. The previous `phase-1.md` volume remains unchanged. New complete records are appended here at whole-step boundaries so each archive remains readable through the normal bounded workspace tools.

---

## STEP-140 — Design direct `apply_patch` exact output schema

**Status**

Complete. The isolated tenth Phase 1 vertical-slice design is approved and self-reviewed. Implementation has not started.

**Goal**

Define an exact schema-v1 output and stable failure contract for only the direct `apply_patch` MCP tool while preserving its existing guarded unified-diff behavior and keeping atomic transactions, rollback, undo, authentication, workspace lifecycle, and Phase 2/3 outside the slice.

**Files changed**

- `docs/superpowers/specs/2026-07-13-apply-patch-output-schema-design.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-2.md`

**Implementation summary**

- Selected direct `apply_patch` as the tenth Phase 1 vertical slice.
- Preserved all nine existing success fields under strict nested `data`.
- Defined twelve fixed non-retryable public failure codes.
- Excluded raw patch text, Git diagnostics, unsafe paths, file contents, secrets, stack traces, and operating-system details from public failures.
- Designed an injectable `applyPatchResultProvider` boundary for contract tests.
- Required strict provider-result validation and exact comparison between returned paths and normalized submitted-patch paths before analysis-cache invalidation.
- Designed a dedicated nested-envelope Tool Card path while leaving `export_pro_context` on the legacy renderer.
- Chose bounded archive volumes at complete STEP boundaries instead of special tail-append operations on an oversized file. Existing `phase-1.md` remains unchanged as Volume 1; this file becomes the active Volume 2.

**Verification commands**

```text
git diff --check
```

The design document was also checked for placeholders, unresolved choices, internal contradictions, scope expansion, unsafe public diagnostics, and phase-boundary drift.

**Verification results**

- Design self-review: passed.
- Placeholder and unresolved-choice scan: passed.
- Scope and phase-boundary review: passed.
- `git diff --check`: passed.
- Git emitted only the established Windows LF-to-CRLF working-copy warnings for Markdown files.
- No source code, tests, dependencies, authentication, workspace lifecycle, or Phase 2/3 behavior was changed.

**Decisions made**

- The direct `apply_patch` migration will stabilize protocol only; it will not add editing capabilities.
- Successful schema-v1 results require non-empty unique paths, non-empty diff text, and literal `changed: true`.
- Provider-returned paths must exactly match the normalized path set declared by the submitted patch.
- All write-operation failures are non-retryable in schema version 1.
- After each complete STEP, the active volume size is checked. At or above 80% of the configured direct-read byte limit, the next STEP starts in a numbered continuation volume; no existing archive volume is renamed or rewritten.

**Risks or limitations**

- Existing patch failure classification remains coupled to current internal error messages, Git process outcomes, and operating-system error codes until a later typed error refactor.
- The existing patch operation is not atomic and offers no rollback or crash recovery.
- Volume ranges must be kept current in `Memory.md` and `AGENTS.md` when a new volume is opened.

**Rollback method**

Delete the uncommitted design specification and this new continuation volume, then restore `AGENTS.md` and `Memory.md`. The closed `phase-1.md` volume and all published Phase 1 code remain untouched.

**Next step**

After explicit approval, commit the approved design and archive-volume record, then invoke the `writing-plans` workflow to create a separate TDD implementation plan. Do not begin implementation or Phase 2.

---

## STEP-141 — Commit design and write direct `apply_patch` implementation plan

**Status**

Complete. The approved design record was committed, and a separate four-task TDD implementation plan was written and self-reviewed. Implementation has not started.

**Goal**

Create an executable, zero-context implementation sequence for the tenth Phase 1 slice without changing production code or authorizing implementation.

**Files changed**

- `docs/superpowers/plans/2026-07-13-apply-patch-output-schema.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-2.md`

**Implementation summary**

- Committed the approved design, memory index, archive Volume 2 opening, and documentation map as commit `3279d0c` (`docs: design apply_patch schema contract`).
- Wrote a four-task TDD plan covering the exact schema module, direct handler/provider boundary, tool-local patch/Git failure markers, returned-path normalization and exact set comparison, cache ordering, dedicated Tool Card rendering, nested Smoke assertions, adjacent regression coverage, complete local gates, memory reconciliation, and conditional publication.
- Added exact file paths, interfaces, code shapes, commands, expected RED/GREEN outcomes, checkpoint commits, final verification gates, and publication boundaries.
- Self-reviewed the plan against the approved design and corrected three issues before recording it: normalized returned paths are required before set comparison, Tool Card path previews are bounded to eight items, and deterministic Git-stage tests import an explicit internal operation error type.

**Verification commands**

```text
git diff --cached --check
git commit -m "docs: design apply_patch schema contract"
```

The plan was also searched for prohibited placeholders and reviewed for spec coverage, type consistency, error consistency, scope drift, unsafe diagnostics, archive-volume references, and execution-boundary wording.

**Verification results**

- Staged design diff check: passed.
- Design commit: `3279d0c`, four files changed, 512 insertions, 11 deletions.
- Plan placeholder scan: passed; no unresolved implementation marker or wildcard Git path remains.
- Plan spec/type/error/scope self-review: passed after the three corrections listed above.
- No production source, tests, dependencies, authentication, workspace lifecycle, or Phase 2/3 behavior was modified.

**Decisions made**

- Use four independently reviewable TDD tasks: schema, handler/classification, consumers/cache, and complete verification/documentation.
- Use a tool-local internal `ApplyPatchOperationError` to distinguish unavailable Git, failed preflight, and failed apply stages without exposing raw diagnostics or creating a project-wide error hierarchy.
- Require provider-returned paths to be safe, already normalized, unique, and exactly equal to the normalized submitted-patch path set before cache invalidation.
- Keep implementation and publication separately gated; this planning step does not authorize either.

**Risks or limitations**

- The plan is detailed but unexecuted; all code shapes remain subject to RED/GREEN evidence and TypeScript compilation during implementation.
- The design commit's STEP-140 rollback wording referred to uncommitted files. After commit `3279d0c`, rollback means reverting that commit rather than deleting uncommitted files; this STEP records the correction without rewriting archived history.
- The current patch operation remains synchronous and non-atomic, with no rollback or crash recovery.

**Rollback method**

Delete the uncommitted plan and revert only the uncommitted STEP-141 updates to `AGENTS.md`, `Memory.md`, and this active archive. To roll back the already committed design record separately, revert commit `3279d0c`; do not rewrite history or alter Phase 1 Volume 1.

**Next step**

Obtain explicit approval to execute the four-task TDD plan. Do not begin implementation, staging, publication, credential changes, history rewriting, access expansion, or Phase 2 without the applicable approval.

---

## STEP-142 — Implement and verify direct `apply_patch` exact output schema

**Status**

Complete locally. All four implementation tasks and local gates passed. The implementation remains unstaged, uncommitted, and unpublished; Phase 2 remains closed.

**Goal**

Migrate only direct `apply_patch` to the exact Phase 1 schema-v1 contract while preserving the guarded synchronous `git apply` workflow and excluding transaction, rollback, authentication, dependency, workspace-lifecycle, and Phase 2/3 work.

**Files changed**

- `src/tools/schemas/applyPatch.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `test/apply-patch-contract.test.mjs`
- `test/edit-contract.test.mjs`
- `test/write-contract.test.mjs`
- `scripts/smoke.mjs`
- `CHANGELOG.md`
- `AGENTS.md`
- `Memory.md`
- `docs/superpowers/specs/2026-07-13-apply-patch-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-apply-patch-output-schema.md`
- `docs/memory/archive/phase-1-part-2.md`

**Implementation summary**

- Added a strict `apply_patch` schema module with the nine preserved nested success fields, exact envelope invariants, twelve fixed non-retryable errors, fixed messages, strict details, and pure success/failure constructors.
- Added an injectable `applyPatchResultProvider`, strict provider-result validation, normalized unique path validation, exact expected/returned path-set comparison, and cache invalidation only after complete success validation.
- Added tool-local Git-stage markers for unavailable Git, failed `git apply --check`, and failed `git apply`, preventing raw subprocess diagnostics from crossing the public boundary.
- Centralized the original input rejection order in `validateApplyPatchInput`: empty, size, secret content, symlink mode, patch paths, then path policy.
- Added `safeApplyPatchPathDetail` so relative escapes and other unsafe path forms return `[unsafe path omitted]` while safe blocked paths remain actionable.
- Added a dedicated nested `renderApplyPatch` Tool Card with an eight-path preview; `renderFile` now remains only for `export_pro_context`.
- Preserved the `codexpro` wrapper envelope without restoring legacy flat fields.
- Updated Smoke to read nested direct success data while preserving real patch, unrelated-diff isolation, cache invalidation, blocked `.env`, quoted path, copy target, and symlink rejection cases.

**Verification commands**

```text
node --test test/apply-patch-contract.test.mjs
node --test test/apply-patch-contract.test.mjs test/edit-contract.test.mjs test/write-contract.test.mjs test/read-contract.test.mjs test/git-diff-contract.test.mjs test/show-changes-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
git diff --check
```

**Verification results**

- Focused direct `apply_patch`: 14/14 passed.
- Adjacent contracts: 89/89 passed.
- Complete regression suite: 177/177 passed.
- Build: passed.
- Smoke: all eight sections passed.
- Native-Windows Stress: passed, including its internal build.
- Pre-reconciliation `git diff --check`: passed with only established LF-to-CRLF working-copy warnings.
- Real coverage includes multi-file order, real preflight mismatch, validation precedence, fixed safe failures, malformed providers, unsafe/mismatched returned paths, cache ordering, Tool Card routing, wrapper behavior, and no raw diagnostic leakage.

**Material failed attempts**

- Standard `edit` could not update `scripts/smoke.mjs` because that existing test file intentionally contains secret-lookalike fixtures and the full-result secret scan failed closed.
- The first exact Node replacement command failed before writing because Bash expanded JavaScript template expressions inside double quotes.
- A second exact Node replacement used single-quoted program text and asserted exact match counts before writing; it changed only the four intended legacy field accesses. Subsequent Build, Smoke, full regression, Stress, and diff review passed.

**Decisions made**

- Preserve original rejection precedence even though handler/provider validation is duplicated through one shared pure helper.
- Treat malformed or unsafe provider-returned paths as `INTERNAL_ERROR`; submitted target policy failures retain stable path-specific public errors.
- Keep relative escapes private in public details.
- Keep the operation explicitly synchronous and non-atomic; no rollback, undo, expected hash, or change-set identifier was added.
- Keep implementation publication separately gated.

**Risks or limitations**

- Input/path failure classification still recognizes current internal message prefixes; Git operation stages now use typed local markers.
- A patch may affect multiple files without transaction, rollback, or crash recovery guarantees.
- Cross-platform CI has not yet run for this implementation because it has not been pushed.

**Rollback method**

Before publication, restore the listed unstaged implementation/documentation files and remove the two new implementation files plus the untracked plan/test files as applicable; do not revert design commit `3279d0c` unless the design record itself must also be removed. After publication, revert the implementation commit without rewriting history. No user profiles, credentials, dependencies, branches, or Phase 1 Volume 1 records require changes.

**Next step**

Obtain explicit approval to stage the exact reviewed change set, commit, push to `origin/main`, verify the branch-head GitHub Actions matrix on Ubuntu/Windows with Node 20/24, and record the publication result. Do not begin Phase 2.

---

## STEP-143 — Publish direct `apply_patch`

**Status**

Complete. The tenth Phase 1 slice is published and cross-platform CI-validated. Phase 2 remains closed.

**Goal**

Publish the exact reviewed implementation set, verify the branch-head Actions matrix, and synchronize the concise project state and append-only active archive.

**Publication actions**

- Re-ran the focused direct contract immediately before staging: 14/14 passed.
- Staged exactly the 13 reviewed implementation, test, Smoke, plan, design, changelog, AGENTS, Memory, and archive files.
- `git diff --cached --check` passed with no output.
- Created implementation commit `c761b4e` (`feat(schema): add exact apply_patch result contract`), containing 13 files, 2,548 insertions, 58 deletions, and three new files.
- Pushed `main` to `origin/main`; the remote advanced from `a182393` to `c761b4e`.
- Confirmed the full implementation SHA as `c761b4e9fb3ffa219ff7ab314bb28f351d062db9`.

**CI verification**

- GitHub Actions run: `29233787814`.
- Workflow: `CI`.
- Head SHA exactly matched `c761b4e9fb3ffa219ff7ab314bb28f351d062db9`.
- Ubuntu / Node 20: success.
- Ubuntu / Node 24: success.
- Windows / Node 20: success.
- Windows / Node 24: success.
- The installed Git Bash environment did not contain `gh`; Windows PowerShell also confirmed no `gh` command. CI was therefore verified through the public GitHub Actions REST API by exact run id and head SHA, not inferred from push success.

**Repository state**

- Immediately after the implementation push, `show_changes` reported `## main...origin/main` with no changed files.
- This STEP and the concise state updates form a separate documentation record authorized by the same publication approval.
- Active archive size after this STEP: 16,263 bytes; no new volume is required.

**Risks or limitations**

- The operation remains synchronous and non-atomic, without transaction, rollback, crash recovery, expected hashes, fuzzy patching, or automatic repair.
- Input/path failure classification still recognizes internal message prefixes; Git operation stages use typed tool-local markers.

**Rollback method**

Revert implementation commit `c761b4e` without rewriting history, then run the complete local gates and push the revert. Do not remove user configuration, credentials, branches, archives, or Phase 1 Volume 1.

**Next step**

Design-review one additional Phase 1 tool as a separate vertical slice. Do not begin Phase 2 without explicit approval.

---

## STEP-144 — Design and plan direct `bash` exact output schema

**Status**

Complete. The eleventh Phase 1 vertical-slice design and its four-task TDD implementation plan are approved under the user's standing recommendation rule. Production implementation, staging, commit, push, and Phase 2 have not started.

**Goal**

Define a stable schema-v1 contract for only the direct `bash` MCP tool and create an executable TDD plan while preserving the current synchronous Bash verification behavior and excluding PowerShell, persistent processes, PTY, Windows Job Objects, shell abstraction, and later-phase architecture.

**Files changed**

- `docs/superpowers/specs/2026-07-13-bash-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-bash-output-schema.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-2.md`

**Design and planning summary**

- Selected direct `bash` as the eleventh Phase 1 slice because it completes the high-frequency direct edit-and-verify workflow without crossing into Phase 2/3/4.
- Chose the isolated direct-tool migration pattern: one exact schema module, one injectable provider seam around existing `runBash`, strict provider validation, stable failure classification, nested Tool Card consumption, and focused contract tests.
- Defined the critical outcome boundary: envelope `ok` represents the tool operation; `exitCode` and `signal` represent the command. Non-zero exit, signal, truncation, and the current timeout marker remain valid command outcomes under `ok:true`.
- Preserved eleven intentional success fields under nested `data`: workspace, root, command, normalized working directory, exit code, signal, execution duration, stdout, stderr, truncation, and optional normalized session id.
- Removed the accidental public duplicate `bashSessionId`; only `bash_session_id` is planned publicly.
- Defined eleven fixed non-retryable tool-level errors for workspace, argument, session configuration, required/mismatched session, policy, backend, path, process start, and internal failure.
- Required safe fixed failure messages that exclude raw commands, output, environment values, executable paths, supplied mismatch ids, unsafe absolute paths, system diagnostics, stack traces, and secret-looking values.
- Preserved the production `runBash` validation order, then required the handler to independently normalize the requested `cwd` and validate returned command, `cwd`, and session identity before success construction.
- Kept `src/bashOps.ts`, the safe allowlist/blocklist, output redaction/truncation, timeout and termination behavior, environment policy, transcript modes, registration, annotations, dependencies, authentication, and workspace lifecycle unchanged.
- Wrote four independently reviewable TDD tasks: exact schema, direct handler/provider/classification, Tool Card/Smoke/Stress consumers, and complete verification/documentation/publication gate.

**Verification commands**

```text
git diff --check
```

The design and plan were also self-reviewed for placeholder-free instructions, complete spec coverage, consistent types and field names, outcome semantics, safe error boundaries, implementation scope, and Phase boundaries.

**Verification results**

- Design self-review: passed.
- Plan spec-coverage review: passed.
- Placeholder and unresolved-choice scan: passed.
- Type/field/error consistency review: passed.
- Security and phase-boundary review: passed.
- Pre-archive `git diff --check`: passed.
- Git emitted only the established Windows LF-to-CRLF working-copy warnings for `AGENTS.md` and `Memory.md`.
- No production source, tests, Bash algorithm, dependencies, authentication, profiles, workspace lifecycle, process architecture, or Phase 2/3/4 behavior was changed.

**Decisions made**

- Use the current direct `bash` tool rather than a workspace summary tool because the edit-and-verify protocol is the next highest-value unfinished direct contract.
- Do not combine this slice with PowerShell or process management; those remain Phase 4.
- Keep non-zero command exits as successful tool-level results so failed builds/tests remain structured verification evidence.
- Do not invent a `timed_out` field until the execution layer exposes a trustworthy typed state.
- All public Bash tool-level failures are non-retryable in schema version 1.
- Keep implementation, Git checkpointing, publication, and CI as separately approved gates.

**Risks or limitations**

- Safe Bash remains a policy filter rather than an operating-system sandbox; verification commands can execute repository code with the current user's permissions.
- Timeout currently targets the direct child and does not guarantee termination of the complete Windows process tree.
- Planned failure classification remains coupled to current internal message prefixes and Node error codes until a later typed shell error refactor.
- Git Bash remains the temporary native-Windows backend; native PowerShell is deferred.
- The implementation plan is detailed but unexecuted, so final code shapes remain subject to RED/GREEN evidence, TypeScript compilation, Smoke, Stress, and cross-platform CI.

**Rollback method**

Before any planning commit, delete the two new planning documents and restore only the uncommitted `AGENTS.md`, `Memory.md`, and this STEP append. If the planning record is committed later, revert that planning commit without rewriting history. No production files, profiles, credentials, dependencies, or prior archive volumes require changes.

**Next step**

Ask the user to choose between committing only this planning record or executing the four-task TDD plan. Do not implement, stage, publish, change credentials, expand access, rewrite history, or begin Phase 2 without the applicable approval.
