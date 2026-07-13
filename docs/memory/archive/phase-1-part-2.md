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

---

## STEP-145 — Implement and verify direct `bash` exact output schema

**Status**

Complete locally. The four-task TDD plan was executed and committed through schema, handler, and consumer checkpoints. All local gates passed. Publication, push, cross-platform CI, credential changes, access expansion, history rewriting, and Phase 2 remain pending.

**Goal**

Migrate only the direct `bash` MCP tool to the strict Phase 1 schema-v1 envelope while preserving the current synchronous Git Bash execution algorithm, safe/full policy, transcript behavior, Session Guard, output redaction/truncation, and command-level non-zero exit semantics.

**Commits**

- `1f66073` — `docs: design bash schema contract`.
- `0ddabfc` — `test(schema): define bash result contract`.
- `7a71421` — `feat(schema): migrate bash result envelope`.
- `86350df` — `test(schema): migrate bash consumers`.

**Files changed**

- `src/tools/schemas/bash.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `test/bash-contract.test.mjs`
- `scripts/smoke.mjs`
- `scripts/stress.mjs`
- `CHANGELOG.md`
- `AGENTS.md`
- `Memory.md`
- `docs/superpowers/specs/2026-07-13-bash-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-bash-output-schema.md`
- `docs/memory/archive/phase-1-part-2.md`

**Implementation summary**

- Added `src/tools/schemas/bash.ts` with the exact schema-v1 envelope and eleven strict nested success fields.
- Added eleven fixed non-retryable tool-level errors for workspace, input, Session Guard, policy, backend, path, process start, and internal failures.
- Preserved non-zero exit codes, signals, truncation, and the existing timeout marker as valid command outcomes under `ok:true`.
- Added an injectable `bashResultProvider`, strict provider-result parsing, and exact command/normalized-`cwd`/session identity validation.
- Removed the accidental public camelCase `bashSessionId`; only nullable `bash_session_id` remains under `data`.
- Preserved compact and full human transcripts while making tool-level failure content fixed and redacted.
- Migrated `renderBash` to the nested envelope with separate bounded stdout/stderr previews, signal/truncation/session indicators, and a stable failure branch.
- Verified that the `codexpro` wrapper preserves child `ok/data/error/meta` and adds only wrapper identity.
- Migrated Smoke and Stress from legacy flat Bash fields to nested fields and exact stable policy codes without weakening file-noncreation assertions.
- Left `src/bashOps.ts`, allowlists/blocklists, executable probing, environment policy, timeout and direct-child termination behavior, dependencies, authentication, profiles, and workspace lifecycle unchanged.

**TDD evidence**

- Task 1 RED: focused test failed only because `src/tools/schemas/bash.ts` did not exist.
- Task 1 GREEN: constructor/schema tests 4/4 passed; committed as `0ddabfc`.
- Task 2 RED: descriptor, nested envelope, provider seam, and fixed failures failed as expected.
- Task 2 GREEN: direct Bash contracts 10/10 passed and TypeScript build passed; committed as `7a71421`.
- Task 3 RED: wrapper already preserved the child envelope, while the Tool Card still read flat fields.
- Task 3 GREEN: focused contracts 12/12, Build, Smoke 8/8, and native-Windows Stress passed; committed as `86350df`.

**Final verification commands**

```text
node --test test/bash-contract.test.mjs
node --test test/bash-contract.test.mjs test/server-config-contract.test.mjs test/apply-patch-contract.test.mjs test/show-changes-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
git diff --check
```

**Final verification results**

- Focused direct `bash`: 12/12 passed.
- Adjacent contracts: 46/46 passed.
- Complete regression suite: 189/189 passed.
- Build: passed.
- Smoke: all eight sections passed.
- Native-Windows Stress: passed, including its internal build.
- Pre-documentation `git diff --check`: passed.
- Real end-to-end coverage includes compact/full transcripts, allowed package scripts, Session Guard, disabled Bash registration, direct and wrapped policy rejection, and file-noncreation assertions.

**Material failed attempts and corrections**

- The first direct-handler test workspace used a Windows temporary path whose long and 8.3 forms differed. The fixture was corrected with `fs.realpath`; production code was unchanged.
- The focused test process could not discover Git Bash through `where bash`, so deterministic handler contracts use the injected provider while existing Smoke/Stress remain the authoritative real Git Bash coverage.
- Standard `edit` correctly refused `scripts/smoke.mjs` and `scripts/stress.mjs` because those files contain established secret-lookalike safety fixtures.
- Two exact Node replacement attempts stopped before writing when match-count assertions found a broad or incorrectly quoted pattern. The successful replacement used exact `\x27`-encoded single-quote strings and asserted every match count before one write.

**Decisions made**

- Tool envelope success and command success remain separate concepts.
- No `COMMAND_FAILED` error or `timed_out` field was added.
- Provider identity mismatch and malformed provider data map to fixed `INTERNAL_ERROR`.
- Session mismatch failures expose only the configured expected id and never echo the submitted mismatch.
- Production validation order in `runBash` remains unchanged; the handler independently normalizes `cwd` after provider return before constructing success.
- Publication remains a separate approval gate.

**Risks or limitations**

- Safe Bash remains a policy filter, not an operating-system sandbox.
- Repository verification commands execute with the current user's permissions.
- Timeout does not guarantee termination of the complete Windows process tree.
- Timeout and output-pressure termination still lack separate typed public state.
- Failure classification remains coupled to current internal message prefixes and Node error codes.
- Git Bash remains the temporary Windows backend; native PowerShell is deferred to Phase 4.
- Cross-platform CI has not run for these commits because they have not been pushed.

**Rollback method**

Revert documentation/implementation commits in reverse order without rewriting history: `86350df`, `7a71421`, `0ddabfc`, and optionally planning commit `1f66073`. Then run the complete local gates. No user profiles, credentials, dependencies, branches, prior Phase 1 slices, or earlier archive volumes require changes.

**Next step**

Commit the reconciled documentation record after final diff review. Then stop for explicit approval before pushing `main`. After approval, verify that the exact branch-head GitHub Actions run matches the pushed SHA and passes Ubuntu/Windows Node 20/24. Do not begin Phase 2.

---

## STEP-146 — Publish direct `bash`

**Status**

Published and cross-platform CI-validated. The implementation and reconciled record were pushed to `main`; the exact pushed head passed the full GitHub Actions matrix.

**Goal**

Publish the completed eleventh Phase 1 slice without expanding scope, then verify that the exact remote branch head passes Ubuntu/Windows with Node 20/24.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-2.md`
- `docs/superpowers/plans/2026-07-13-bash-output-schema.md`
- `docs/superpowers/specs/2026-07-13-bash-output-schema-design.md`

**Implementation summary**

- Ran `neat-freak` and reconciled the Bash design, plan, changelog, project rules, memory index, and active archive.
- Reduced `Memory.md` from 150 lines to leave capacity for future step records while preserving STEP-140 onward in the recent-summary window.
- Committed the implementation record as `a39b779` and pushed `main`.
- Confirmed local `main` matched `origin/main` immediately after the push.
- Matched GitHub Actions run `29239425311` to exact head `a39b7791908a1b193c2ae653a706785846d3bf10`.

**Verification commands**

```text
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
git diff --check
git push origin main
GitHub REST: actions/runs?head_sha=<exact SHA>
GitHub REST: actions/runs/29239425311/jobs
```

**Verification results**

- Complete regression: 189/189 passed.
- Build: passed.
- Smoke: all eight sections passed.
- Native-Windows Stress: passed, including its internal build.
- Diff check: passed; only established LF-to-CRLF working-copy warnings were emitted before staging.
- Push: `main` advanced to `a39b779`.
- CI run `29239425311`: success.
- Matrix jobs passed: Ubuntu Node 20, Ubuntu Node 24, Windows Node 20, Windows Node 24.

**Decisions made**

- The direct `bash` slice is now published and closed.
- No credentials, profiles, dependencies, authentication, Bash policy, process architecture, or Phase 2 behavior changed during publication.
- The next work remains another Phase 1 design review rather than entering Phase 2.

**Risks or limitations**

- Safe Bash remains a policy filter rather than an operating-system sandbox.
- Timeout still does not guarantee termination of the complete Windows process tree.
- Bash failure classification remains coupled to current message prefixes and Node error codes.
- The final publication-state documentation commit will trigger a new docs-only branch-head CI run after this record is written.

**Rollback method**

Revert the final publication-state documentation commit, then revert `a39b779` and the implementation commits in reverse order only if the published slice itself must be withdrawn. Do not rewrite history or alter user credentials/profiles.

**Next step**

Commit and push this final publication-state record, verify its docs-only exact-head CI run, then design-review the next Phase 1 vertical slice. Keep Phase 2 closed.

---

## STEP-147 — Design direct `open_current_workspace`

**Status**

Design approved and self-reviewed. The written specification exists locally; no implementation plan, source change, test change, staging, commit, push, access change, or Phase 2 work has started.

**Goal**

Select and fully specify the next isolated Phase 1 exact-output-schema slice after the published direct `bash` contract.

**Files changed**

- `docs/superpowers/specs/2026-07-13-open-current-workspace-output-schema-design.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1-part-2.md`

**Implementation summary**

- Inspected the remaining unmigrated direct tools, the existing `open_current_workspace` handler, `WorkspaceSummary`, `WorkspaceManager`, Git summary behavior, skill inventory records, Tool Card consumers, and Smoke/HTTP Smoke/Stress callers.
- Compared three boundaries: direct `open_current_workspace` only, combined `open_current_workspace` plus `open_workspace`, and a smaller auxiliary tool.
- Selected direct `open_current_workspace` only because it is the required normal session entry and is exposed in minimal, standard, and full modes.
- Defined a strict schema-v1 envelope with twelve nested success fields, explicit nullable optional values, a tool-specific injectable summary provider, and cross-field validation for workspace/root identity, AGENTS paths, skill names/counts, and request-controlled inclusion.
- Defined five fixed non-retryable failures for post-start default-root and internal validation conditions.
- Preserved non-Git directories as valid successful workspaces and kept recent commits in human MCP content only.
- Required Tool Card compatibility for the still-flat `open_workspace` and `workspace_snapshot` results and nested compatibility for the `codexpro` `open` alias.
- Self-review removed the initially proposed `DEFAULT_ROOT_INVALID` error after confirming `loadConfig()` validates and canonicalizes the default root before MCP server startup, making that error unreachable at tool-call time.

**Verification commands**

```text
Targeted repository inspection through open_current_workspace, read, tree, and search
design placeholder/contradiction search: TBD|TODO|PLACEHOLDER|DEFAULT_ROOT_INVALID|all six|Six fixed
git diff --check
show_changes(include_diff=false)
```

**Verification results**

- The design self-review found no remaining placeholders, stale six-error wording, or `DEFAULT_ROOT_INVALID` references.
- `git diff --check` exited 0; only the established Windows LF-to-CRLF working-copy warnings appeared for `AGENTS.md` and `Memory.md`.
- Pre-archive `show_changes` confirmed the scope contained only `AGENTS.md`, `Memory.md`, and the new design specification.
- No source, test, dependency, package, profile, credential, transport, CI workflow, or Phase 2 file changed.
- Build, regression, Smoke, and Stress were not run because this step changes design and project records only.

**Decisions made**

- The twelfth Phase 1 vertical slice is direct `open_current_workspace` only.
- The current deterministic workspace identifier and existing default-workspace behavior remain unchanged.
- Success data contains exactly twelve fields under `data`; `agents_path`, `tree`, and missing skill descriptions normalize to `null`.
- Skill names must exactly match inventory names in order, and all five source counts must match the inventory.
- Five failures are public: `DEFAULT_ROOT_NOT_FOUND`, `DEFAULT_ROOT_NOT_DIRECTORY`, `ROOT_NOT_ALLOWED`, `WORKSPACE_OPEN_FAILED`, and `INTERNAL_ERROR`.
- Non-Git workspace diagnostics remain bounded success data rather than a tool-level failure.
- `open_workspace`, `workspace_snapshot`, workspace lifecycle, authentication, dependencies, implementation, publication, and Phase 2 remain out of scope.

**Risks or limitations**

- Failure classification will remain coupled to current `WorkspaceManager` message prefixes and Node error codes until a later typed workspace-error refactor.
- The shared workspace Tool Card currently serves migrated and unmigrated result shapes, so implementation must retain an explicit compatibility path.
- Default-root missing, non-directory, or allowed-root failures are mainly post-start filesystem-change conditions because configuration validates the root before server creation.
- Skill trust, AGENTS precedence, workspace ownership, expiration, and client isolation remain deferred.

**Rollback method**

Before any commit, discard only the four listed design/record changes if the design is withdrawn. After a future normal commit, revert that design-record commit without rewriting history. Do not alter user profiles, credentials, allowed roots, prior Phase 1 commits, or earlier archive entries.

**Next step**

The user reviews `docs/superpowers/specs/2026-07-13-open-current-workspace-output-schema-design.md`. After approval, create a separate detailed TDD implementation plan using the established Phase 1 workflow. Do not implement, stage, commit, push, expand access, or begin Phase 2 yet.

---

## STEP-148 — Plan direct `open_current_workspace`

**Status**

Completed. The approved design was converted into a four-task TDD implementation plan and approved for inline execution; publication remained a separate gate.

**Goal**

Translate the twelfth-slice design into exact schema, handler/provider, consumer, verification, rollback, and record tasks without expanding into `open_workspace` or Phase 2.

**Files changed**

- `docs/superpowers/plans/2026-07-13-open-current-workspace-output-schema.md`

**Implementation summary**

- Defined Task 1 for the strict twelve-field success schema and five-error union.
- Defined Task 2 for a tool-specific injected `workspaceSummary` provider, cross-field validation, and safe failure classification.
- Defined Task 3 for nested Tool Card/supertool handling and exact Smoke/HTTP Smoke/Stress consumer migration while retaining flat `open_workspace` and `workspace_snapshot` compatibility.
- Defined Task 4 for full local gates, secret/scope review, project records, rollback, and the separate publication boundary.

**Verification commands**

```text
Plan self-review for placeholders, interface names, task ownership, scope, rollback, and publication boundaries
```

**Verification results**

- Every approved design requirement had an owning task.
- No undefined interface, placeholder, dependency change, authentication change, workspace lifecycle change, or Phase 2 work remained in scope.

**Decisions made**

- Execute in the current `main` workspace because the approved uncommitted design and memory records were already present there.
- Keep staging, commit, push, credential/access changes, and exact-head CI as separate approvals.

**Risks or limitations**

- The plan relies on existing message-prefix classification rather than introducing a project-wide typed workspace-error hierarchy.
- Large Smoke/Stress files contain intentional secret-lookalike fixtures and may require the established exact temporary Node patch method rather than generic edit.

**Rollback method**

Discard the uncommitted plan file or later revert its normal commit. No source, configuration, profile, credential, dependency, or prior slice changes are required.

**Next step**

Execute Tasks 1–4 in TDD order, then stop before staging or publication.

---

## STEP-149 — Implement and verify direct `open_current_workspace`

**Status**

Locally implemented and fully verified. Nothing is staged, committed, or pushed; exact-head cross-platform CI has not run for this slice.

**Goal**

Publish a trustworthy local schema-v1 implementation for the mandatory startup tool while preserving current default-workspace behavior and keeping Phase 2 closed.

**Files changed**

- `src/tools/schemas/openCurrentWorkspace.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `test/open-current-workspace-contract.test.mjs`
- `scripts/smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/stress.mjs`
- `CHANGELOG.md`
- `AGENTS.md`
- `Memory.md`
- `docs/superpowers/specs/2026-07-13-open-current-workspace-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-open-current-workspace-output-schema.md`
- `docs/memory/archive/phase-1-part-2.md`

**Implementation summary**

- Added the exact schema module with twelve strict success fields, nullable AGENTS/tree/description values, five fixed non-retryable errors, strict details, envelope consistency, and pure constructors.
- Added a tool-specific injected summary provider and strict internal result schema.
- The handler validates workspace/root identity, normalized in-workspace AGENTS path, exact skill-name order, exact five-source counts, and request-controlled tree/skill inclusion before constructing success.
- Mode values come from server configuration rather than provider output; recent commits remain human MCP content only.
- Non-Git directories remain successful workspaces with bounded Git diagnostics.
- Updated the shared workspace Tool Card through a compatibility normalizer: nested direct `open_current_workspace`, flat unmigrated `open_workspace` and `workspace_snapshot`.
- Preserved the nested child envelope through the `codexpro` `open` alias.
- Migrated direct/wrapped consumers in Smoke, HTTP Smoke, and Stress without changing flat `open_workspace` consumers.
- Added a real regression for lowercase `agents.md` after the first full Smoke run exposed one missed flat consumer.

**Verification commands**

```text
node --test test/open-current-workspace-contract.test.mjs
node --test test/open-current-workspace-contract.test.mjs test/server-config-contract.test.mjs test/tree-contract.test.mjs test/git-status-contract.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
npm run stress
targeted stale-consumer searches
show_changes(include_diff=false)
git diff --check
```

**Verification results**

- Final focused contracts: 13/13 passed.
- Final adjacent contracts: 48/48 passed.
- Complete regression: 202/202 passed.
- Build: passed.
- Smoke: all eight sections passed.
- Native-Windows Stress: passed, including its internal Build.
- `git diff --check`: passed; only established LF-to-CRLF working-copy warnings were emitted.
- Targeted searches found no stale direct `open_current_workspace` flat reads for workspace id, tool mode, lowercase AGENTS path, or wrapped Skills.
- `show_changes` listed only the intended implementation, tests, consumer scripts, design/plan, changelog, project rules, memory, and active archive files.

**Material failed attempts and corrections**

- Initial focused RED failed with `ERR_MODULE_NOT_FOUND` for the intentionally absent schema module.
- After the schema module, 4 pure schema tests passed while 8 integration tests failed as intended.
- After the handler, 11/12 focused tests passed; the remaining failure identified the flat Tool Card consumer.
- The first exact consumer patch stopped after Smoke because an HTTP field name also appeared in unmigrated `open_workspace`; HTTP and Stress were not written. The corrected patch used ordered first-occurrence replacement for the earlier direct block and exact-count replacement for Stress.
- A whole-block HTTP replacement stopped before writing because the file used CRLF while the template used LF. The ordered replacement avoided newline coupling.
- The first full Smoke run failed on the lowercase `agents.md` compatibility assertion. A focused regression was added and observed RED before migrating both reads to nested `data`; focused and full Smoke then passed.
- Generic edits to the large Smoke script were blocked by established secret-lookalike fixtures, so bounded exact-count temporary Node patch scripts were used and self-deleted after success.

**Decisions made**

- Keep exactly twelve structured success fields and five public failures.
- Provider/path/count/inclusion mismatches fail closed as `INTERNAL_ERROR`.
- `open_workspace`, `workspace_snapshot`, workspace lifecycle, AGENTS precedence, Skill trust, authentication, dependencies, credentials, and Phase 2 remain unchanged.
- The current deterministic workspace id remains unchanged.

**Risks or limitations**

- Failure classification remains coupled to current `WorkspaceManager` diagnostic prefixes and Node error codes.
- Default-root missing/non-directory/disallowed failures are mainly post-start filesystem-change cases because config loading validates the root before server creation.
- The shared workspace Tool Card intentionally carries a migrated/unmigrated compatibility branch until later slices migrate the adjacent tools.
- Workspace ownership, expiry, close, persistence, and client isolation remain deferred to Phase 2.

**Rollback method**

Before commit, discard only the listed twelfth-slice changes. After a future normal commit, revert consumer changes, handler/Tool Card changes, schema/tests, and documentation records in reverse order without rewriting history. Do not alter profiles, credentials, allowed roots, dependencies, prior Phase 1 commits, or earlier archive entries.

**Next step**

Optionally run `neat-freak`, review the complete local diff, then obtain separate approval for staging, commit, push, and exact-head Ubuntu/Windows Node 20/24 CI verification. Keep Phase 2 closed.

---

## STEP-150 — Reconcile the twelfth slice before publication

**Status**

Completed. `neat-freak` reconciliation is complete, and the user has authorized staging, commit, and push.

**Goal**

Reconcile rules, design/plan status, project memory, and archive references against the verified implementation before publication.

**Files changed**

- `AGENTS.md`
- `Memory.md`
- `docs/superpowers/specs/2026-07-13-open-current-workspace-output-schema-design.md`
- `docs/superpowers/plans/2026-07-13-open-current-workspace-output-schema.md`
- `docs/memory/archive/phase-1-part-2.md`

**Implementation summary**

- Audited the current root rules, memory index, design, implementation plan, active archive, changed-file set, and all Markdown references to the twelfth slice.
- Confirmed README, security, installation, architecture, and external integration guides require no change because this slice stabilizes an existing internal MCP result contract without changing user setup, authentication, routing, or dependencies.
- Reduced `Memory.md` from 145 lines and 15.5 KB by graduating published per-tool contract detail to the existing Phase 1 archives and design documents.
- Kept the current `bash` and `open_current_workspace` decisions, verification evidence, limitations, and next actions in the root index.
- Aligned current stopping points with the user's publication authorization while preserving earlier archive entries as historical facts.

**Verification commands**

```text
open_current_workspace(include_skills=true, include_global_skills=true)
tree(path=".", max_depth=2, include_hidden=true)
read AGENTS.md
read Memory.md
search Markdown for stale twelfth-slice implementation/publication states
show_changes(include_diff=true)
git diff --check
```

**Verification results**

- `AGENTS.md`: 208 lines and 13.4 KB, below its soft limit.
- `Memory.md`: reduced below its prior 145-line/15.5-KB state and remains below practical and hard limits.
- Active Phase 1 Volume 2 remains below the configured archive rollover threshold.
- No dead design/plan references, contradictory current stopping points, or unrelated documentation requirements were found.
- No source behavior, dependency, profile, credential, authentication, transport, CI workflow, or Phase 2 scope changed during reconciliation.

**Decisions made**

- Preserve historical archive next-step text; record changed authorization as this new append-only STEP instead of rewriting STEP-149.
- Publish the complete reconciled slice on the existing `main` branch as explicitly authorized by the user.

**Risks or limitations**

- Exact-head Ubuntu/Windows Node 20/24 CI can only be verified after the pushed commit exists.
- Publication records will need a follow-up memory/archive update with the actual commit and CI run identifiers.

**Rollback method**

Before commit, discard only the STEP-150 reconciliation edits. After normal publication, revert the resulting commit without rewriting history. Do not modify credentials, profiles, allowed roots, prior commits, or earlier archive entries.

**Next step**

Run final verification, stage the complete reconciled slice, create an intentional commit, push `main` to `origin`, and verify exact-head CI. Keep Phase 2 closed.
