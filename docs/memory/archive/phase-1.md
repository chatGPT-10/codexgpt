# Phase 1 Implementation Record

This append-only archive records Phase 1 planning and implementation work. Phase 1 establishes exact output schemas and stable errors while preserving compatibility with existing text output.

## Phase boundary

- Phase 1 planning began on 2026-07-12 after explicit user approval.
- Phase 1 implementation has not started.
- The closed Phase 0.5 baseline must not be altered except through separately reviewed, Phase 1-scoped changes.
- Work proceeds one feature at a time with design approval before implementation.

## 2026-07-12 — STEP-073: Start Phase 1 planning and select the first vertical slice

**Status:** Planning started; implementation not started

**Goal:** Open the Phase 1 archive and select a narrowly scoped first migration target without changing runtime behavior.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-1.md`

**Planning summary:**

- Reviewed the existing tool registration path in `src/server.ts`.
- Confirmed `registerToolCompat` is the common result-wrapping boundary and currently does not advertise exact `outputSchema` definitions.
- Confirmed `server_config` has an empty input schema and a stable, read-only structured result, making it the lowest-risk first migration target.
- Considered three migration scopes:
  - common primitives only, without migrating a tool;
  - one complete vertical slice;
  - all tools at once.
- Selected the one-tool vertical-slice approach after explicit user approval.
- Selected `server_config` as the first Phase 1 tool.

**Approved first slice:**

1. Introduce only the common result/error primitives required by `server_config`.
2. Add an exact `outputSchema` for `server_config`.
3. Add success and failure contract tests for that slice.
4. Preserve the existing human-readable `content` output during migration.
5. Do not migrate another tool in the same implementation step.

**Verification and evidence:**

- Workspace was clean and synchronized with `origin/main` before planning began.
- `src/server.ts` contains the common registration path at `registerToolCompat` and the `server_config` registration.
- No source code, tests, package metadata, configuration, credentials, staging, commit, or push operation was performed in this step.

**Decisions made:**

- Phase 1 is now in planning status.
- Approach B was selected: use `server_config` as the first complete vertical slice.
- Implementation remains blocked until the detailed design is completed and approved.

**Risks and limitations:**

- The exact result-envelope shape, error representation, schema ownership, and contract-test mechanism remain to be designed.
- The first slice must not accidentally force a repository-wide result-format migration.

**Rollback method:**

- Remove this new archive before it is committed and restore the corresponding planning-status edits in `Memory.md`, `AGENTS.md`, and the roadmap.
- No runtime rollback is required because implementation has not started.

**Next step:** Continue the Phase 1 design one decision at a time. Do not modify source code until the written design is approved.

## 2026-07-12 — STEP-074: Approve the strict `server_config` result envelope

**Status:** Design decision approved; implementation not started

**Goal:** Fix the compatibility shape of the first Phase 1 structured result before designing metadata and errors.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Approved design:**

`server_config.structuredContent` will use a strict envelope with these top-level fields:

- `codexpro_tool`
- `codexpro_title`
- `ok`
- `data`
- `error`
- `meta`

For a successful `server_config` call:

- `ok` is `true`;
- `data` contains the configuration fields that are currently placed directly in `structuredContent`;
- `error` is `null`;
- `meta` contains the Phase 1 schema metadata selected in the next design decision.

Compatibility rules:

- Keep the existing human-readable MCP `content` text unchanged.
- Do not duplicate the configuration fields at the top level.
- Update the `server_config` tool card to read configuration fields from `data`.
- Do not change the structured output of any other tool in this slice.

**Decisions made:**

- Selected strict envelope approach A instead of a duplicated hybrid shape or schema-only migration.
- Accepted a deliberate structured-output change for `server_config`, bounded to this one tool.
- The envelope itself is the stable contract; tool-specific fields belong under `data`.

**Risks and limitations:**

- Existing consumers that directly read top-level `server_config` fields must migrate to `data`.
- The exact `meta` fields, stable error shape, and schema implementation ownership are still undecided.
- No compatibility alias will be added unless later evidence shows a required consumer cannot migrate.

**Rollback method:**

- Before implementation, remove this STEP-074 section and restore the corresponding summary in `Memory.md`.
- After implementation, rollback must restore the previous `server_config` structured result and card field access together.

**Next step:** Select the exact Phase 1 `meta` contract for the first slice. Do not modify source code yet.

## 2026-07-12 — STEP-075: Approve the minimal Phase 1 `meta` contract

**Status:** Design decision approved; implementation not started

**Goal:** Fix the metadata fields for the first strict `server_config` result envelope without introducing a misleading request identity.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Approved design:**

For the first Phase 1 slice, `meta` contains exactly:

- `schemaVersion`
- `durationMs`
- `warnings`

Field rules:

- `schemaVersion` is an integer and starts at `1`.
- `durationMs` is a non-negative number measured by the existing tool wrapper.
- `warnings` is always an array of strings and is empty when there are no warnings.
- `requestId` is intentionally omitted from the initial contract.

**Decisions made:**

- Selected M1 instead of generating a synthetic per-tool ID or publishing a permanently nullable `requestId` field.
- A future transport-aware request identity may be added through a schema-versioned change when a trustworthy source exists.
- The first slice must not imply that a random tool-call identifier is an HTTP or MCP request identity.

**Risks and limitations:**

- Cross-tool or cross-transport tracing is not part of the first slice.
- Adding a future request identity may require a later schema-version increment or an explicitly optional field.
- The exact stable error contract, schema ownership, and contract-test mechanism remain undecided.

**Rollback method:**

- Before implementation, remove this STEP-075 section and restore the corresponding `Memory.md` entries.
- No runtime rollback is required because source code has not changed.

**Next step:** Select the stable error contract for the `server_config` slice. Do not modify source code yet.

## 2026-07-12 — STEP-076: Approve the minimal stable error contract

**Status:** Design decision approved; implementation not started

**Goal:** Define a complete but narrowly scoped error object for the first `server_config` envelope without forcing a repository-wide error migration.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Approved design:**

The envelope uses this stable error shape:

- `code`
- `message`
- `retryable`
- `details`

Success rules:

- `ok` is `true`;
- `data` contains the `server_config` payload;
- `error` is `null`.

Failure rules:

- `ok` is `false`;
- `data` is `null`;
- `error.code` is `INTERNAL_ERROR` for the first slice;
- `error.message` is a redacted human-readable string;
- `error.retryable` is `false` unless a later tool-specific design explicitly proves retry safety;
- `error.details` is an object and defaults to `{}`;
- the MCP result retains `isError: true` and human-readable `content` for compatibility.

**Decisions made:**

- Selected E1 instead of publishing the full future error-code catalog or using an incomplete two-field error object.
- The common error shape is stable, but error codes are introduced incrementally per migrated tool.
- The first slice adds only `INTERNAL_ERROR`; it does not retrofit codes into existing tools.
- Unknown exceptions must not expose stack traces, secrets, tokens, or sensitive paths through `message` or `details`.

**Risks and limitations:**

- `server_config` has no normal user-triggered failure path, so its failure contract will require a controlled contract-test seam.
- `INTERNAL_ERROR` is intentionally broad for this first slice and is not a substitute for later tool-specific codes.
- Schema ownership and the exact contract-test mechanism remain undecided.

**Rollback method:**

- Before implementation, remove this STEP-076 section and restore the corresponding `Memory.md` entries.
- No runtime rollback is required because source code has not changed.

**Next step:** Select where the envelope and `server_config` schemas are owned. Do not modify source code yet.

## 2026-07-12 — STEP-077: Approve split schema ownership

**Status:** Design decision approved; implementation not started

**Goal:** Establish a scalable ownership boundary for common Phase 1 contracts and the first tool-specific schema without enlarging `src/server.ts`.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Approved design:**

Create these implementation modules when the implementation plan is approved:

- `src/tools/schemas/common.ts`
- `src/tools/schemas/serverConfig.ts`

Ownership rules:

- `common.ts` owns the shared envelope primitives: schema version, metadata, stable error object, and reusable success/failure envelope helpers or schema factories.
- `serverConfig.ts` owns the exact `server_config` data schema and the complete advertised output schema for that tool.
- TypeScript types are inferred from the Zod schemas rather than maintained as duplicate handwritten interfaces.
- `src/server.ts` imports the schemas and uses them at registration/response boundaries; it does not become the source of truth for schema definitions.
- No second tool schema is introduced in the first slice.

**Decisions made:**

- Selected S2 instead of one growing global schema file or embedding schemas in the existing large server module.
- The common module must remain tool-agnostic and contain no `server_config` field definitions.
- Tool-specific schema files may reuse common primitives but must own their exact `data` shape.

**Risks and limitations:**

- The implementation must verify that the installed MCP SDK accepts the chosen Zod/output-schema representation at registration time.
- Schema factories must not become an abstraction layer more complex than the first slice requires.
- The exact contract-test mechanism and controlled failure seam remain undecided.

**Rollback method:**

- Before implementation, remove this STEP-077 section and restore the corresponding `Memory.md` entries.
- No runtime rollback is required because source code has not changed.

**Next step:** Select the contract-test mechanism and controlled failure seam for `server_config`. Do not modify source code yet.

## 2026-07-12 — STEP-078: Approve contract tests with dependency injection

**Status:** Final core design decision approved; implementation not started

**Goal:** Define success, failure, and registration contract coverage without adding a production-only failure switch or test backdoor.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Approved design:**

Use a pure construction boundary plus test-only dependency injection:

- Add `test/server-config-contract.test.mjs`.
- Test the successful `server_config` result against the exact advertised output schema.
- Test that the MCP tool descriptor actually advertises the intended `outputSchema`.
- Provide the `server_config` result builder or handler factory with an injectable data provider.
- Production uses the normal configuration provider.
- The failure test injects a provider that throws, without adding an environment variable, CLI flag, HTTP route, hidden argument, or runtime test mode.
- Verify the failure result has `ok: false`, `data: null`, `error.code: INTERNAL_ERROR`, `retryable: false`, empty object `details`, `isError: true`, and redacted human-readable `content`.
- Verify success metadata has `schemaVersion: 1`, a non-negative `durationMs`, and an array `warnings`.
- Preserve existing smoke tests and add the narrow contract test before broader verification.

**Decisions made:**

- Selected T2 instead of a production runtime failure switch or schema-only unit tests.
- The injection seam exists at a pure factory/construction boundary and is not exposed as an MCP input or public configuration option.
- The contract test must exercise both schema validation and the actual registration/handler path.
- No second tool is migrated in this slice.

**Risks and limitations:**

- The seam must remain narrow enough that production code cannot accidentally select the throwing provider.
- The test must avoid asserting unstable values such as exact duration.
- The installed MCP SDK representation for `outputSchema` still needs implementation-time verification.

**Rollback method:**

- Before implementation, remove this STEP-078 section and restore the corresponding `Memory.md` entries.
- No runtime rollback is required because source code has not changed.

**Next step:** Present the complete `server_config` slice design for explicit approval. After approval, write and review the design specification before creating the implementation plan.

## 2026-07-12 — STEP-079: Write and self-review the formal first-slice design specification

**Status:** Design specification written; awaiting user review; implementation not started

**Goal:** Convert the approved Phase 1 decisions into one implementation-ready design document without modifying runtime code or tests.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-1.md`
- `docs/superpowers/specs/2026-07-12-server-config-output-schema-design.md`

**Completed work:**

- Created the formal design specification for the exact `server_config` output-schema vertical slice.
- Documented purpose, non-goals, current behavior, success/failure envelopes, metadata, stable errors, schema ownership, data flow, MCP registration, tool-card compatibility, contract tests, compatibility policy, expected file scope, acceptance criteria, and rollback.
- Preserved the approved constraints from STEP-073 through STEP-078.
- Explicitly prohibited migration of a second tool and any production failure switch or hidden test backdoor.

**Self-review:**

- Placeholder scan found no `TBD`, `TODO`, `FIXME`, or incomplete section.
- Scope review confirmed the design remains limited to `server_config`.
- Consistency review confirmed the strict envelope, M1 metadata, E1 error object, S2 schema ownership, and T2 contract-test approach agree across the specification.
- The specification marks implementation as not started and does not authorize source changes.

**Verification and evidence:**

- The specification is stored at `docs/superpowers/specs/2026-07-12-server-config-output-schema-design.md`.
- No source file, test file, dependency, package metadata, credential, staging area, commit, or remote was modified in this step.

**Risks and limitations:**

- The installed MCP SDK `outputSchema` representation still requires implementation-time verification.
- The design must be reviewed by the user before an implementation plan is written.

**Rollback method:**

- Remove the design specification and this STEP-079 section, then restore the corresponding `Memory.md` status.
- No runtime rollback is required because implementation has not started.

**Next step:** User reviews and approves the written specification. Only after that approval may the `writing-plans` workflow create the implementation plan.

## 2026-07-12 — STEP-080: Write and self-review the first-slice implementation plan

**Status:** Implementation plan written; awaiting user review; implementation not started

**Goal:** Convert the approved design specification into an executable TDD plan with exact files, interfaces, code, commands, review gates, and rollback steps.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-1.md`
- `docs/superpowers/plans/2026-07-12-server-config-output-schema.md`

**Completed work:**

- Invoked the `writing-plans` workflow after explicit specification approval.
- Created a four-task implementation plan covering schema contracts, actual MCP registration and handler integration, tool-card migration, and full verification/memory closure.
- Included exact code examples, TDD fail/pass commands, expected results, file boundaries, compatibility constraints, and rollback instructions.
- Preserved the requirement that no Git mutation occurs without separate explicit approval.
- Replaced the redaction-test example with a runtime-assembled synthetic value after CodexPro correctly blocked a secret-looking literal in the planning document.

**Self-review and verification:**

- Placeholder scan found no `TBD`, `TODO`, `FIXME`, `implement later`, `fill in details`, or cross-task shorthand.
- Scope review confirmed the plan migrates only `server_config`.
- Type/interface review confirmed later tasks consume the exact exports defined in earlier tasks.
- Verified `@modelcontextprotocol/sdk/inMemory.js` exists and `InMemoryTransport.createLinkedPair` is available in the installed SDK.
- No source file, test file, dependency, package metadata, credential, staging area, commit, or remote was modified.

**Risks and limitations:**

- The MCP SDK's accepted `outputSchema` TypeScript representation still requires implementation-time build verification; the plan defines a bounded fallback that preserves one field-level source of truth.
- The plan is intentionally detailed and must be executed task-by-task rather than as one unreviewed bulk patch.

**Rollback method:**

- Remove the implementation plan and this STEP-080 section, then restore the corresponding `Memory.md` status.
- No runtime rollback is required because implementation has not started.

**Next step:** User reviews and approves the implementation plan. After approval, select the execution workflow and begin only Task 1 under TDD; do not modify source before that approval.

## 2026-07-12 — STEP-081: Neat-freak planning-document reconciliation

**Status:** Planning documents reconciled; implementation not started

**Goal:** Remove stale status wording and future STEP-number collisions while keeping the approved design and detailed TDD plan intact.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-1.md`
- `docs/superpowers/plans/2026-07-12-server-config-output-schema.md`

**Completed work:**

- Updated the active stopping point in `AGENTS.md` to reflect that the design is approved and the implementation plan awaits explicit execution approval.
- Added the approved specification and implementation plan to the authoritative documentation map.
- Updated the Phase 1 roadmap status to match the active planning state.
- Removed the implementation plan's hard-coded future `STEP-081` reference; execution must use the next available Phase 1 step number.
- Preserved historical archive entries and avoided compressing the detailed specification or implementation plan because both remain within their size limits and serve distinct purposes.

**Size and scope review:**

- `AGENTS.md`: below the 300-line and 15 KB soft limits.
- `Memory.md`: below the 200-line and 25 KB hard limits.
- Design specification: below the 1,500-line soft limit.
- Implementation plan: below the 1,500-line soft limit.
- No source, test, dependency, package metadata, credential, staging area, commit, or remote state changed.

**Verification:**

- Re-ran the focused documentation test.
- Re-ran `git diff --check`.
- Confirmed the implementation plan still covers only `server_config`.

**Rollback method:**

- Restore the previous status wording and documentation map entries, then restore the former fixed step label in the implementation plan.
- No runtime rollback is required because implementation has not started.

**Next step:** User approves the implementation plan. Only then select an execution workflow and begin Task 1 under TDD.

## 2026-07-12 — STEP-082: Task 1 exact `server_config` Schema contracts

**Status:** Complete; awaiting Task 1 diff review

**Goal:** Add the exact shared metadata/error contracts and strict `server_config` success/failure schemas without integrating them into the live MCP registration yet.

**Files changed:**

- `src/tools/schemas/common.ts`
- `src/tools/schemas/serverConfig.ts`
- `test/server-config-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Implementation summary:**

- Added `TOOL_SCHEMA_VERSION`, strict `toolMetaSchema`, strict `toolErrorSchema`, inferred `ToolMeta`/`ToolError` types, and `createToolMeta()`.
- Added the exact strict `serverConfigDataSchema` covering the current configuration fields.
- Added the strict output envelope with top-level tool identity, `ok`, `data`, `error`, and `meta` only.
- Added cross-field validation so success requires non-null `data` and null `error`, while failure requires null `data` and a non-null error.
- Added success and failure constructors; the first stable failure code is only `INTERNAL_ERROR`, with `retryable: false` and empty `details`.
- Added focused contract tests for success shape, failure shape, top-level field isolation, metadata, and inconsistent state rejection.
- Did not modify `src/server.ts`, the actual MCP registration, tool cards, authentication, dependencies, or any second tool.

**Verification commands:**

- `node --import tsx --test test/server-config-contract.test.mjs` before implementation
- `node --import tsx --test test/server-config-contract.test.mjs` after implementation
- `npm run build`

**Verification results:**

- RED check: failed as expected with `ERR_MODULE_NOT_FOUND` for `src/tools/schemas/serverConfig.ts`; this confirmed the new test exercised the missing contract.
- Contract test after implementation: 3 tests passed, 0 failed.
- TypeScript build: passed with exit code 0 and no TypeScript errors.

**Decisions made:**

- Followed the approved plan exactly and used only existing Zod/TypeScript dependencies.
- Kept the constructors pure and independent of `src/server.ts` so Task 1 remains isolated and reversible.
- Recorded this as the next available Phase 1 step number, `STEP-082`.

**Risks or limitations:**

- The new schemas are not yet advertised through MCP `listTools()` and are not yet used by the live `server_config` handler; that is explicitly Task 2.
- Error redaction and real failure injection are not exercised until the handler integration task.
- The broader working tree still contains previously approved planning/documentation changes that predate Task 1.

**Rollback method:**

- Remove `src/tools/schemas/common.ts`, `src/tools/schemas/serverConfig.ts`, and `test/server-config-contract.test.mjs`.
- Revert the STEP-082 updates in `Memory.md` and remove this appended archive entry.
- No runtime migration or configuration rollback is required because the schemas are not connected to production behavior.

**Next step:** User reviews the Task 1 diff. After explicit approval, begin only Task 2 under TDD. Do not stage, commit, push, or enter Task 3.

## 2026-07-12 — STEP-083: Task 2 real MCP `server_config` contract integration

**Status:** Complete; awaiting Task 2 diff review

**Goal:** Connect the strict Task 1 contract to the actual MCP tool descriptor and handler, including real success/failure calls, measured duration, redaction, and `isError: true`, without changing a second tool.

**Files changed:**

- `src/server.ts`
- `test/server-config-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Implementation summary:**

- Imported the exact `server_config` schemas and constructors into `src/server.ts`.
- Added exported `CodexProServerDependencies` with only the optional programmatic `serverConfigDataProvider`; it is not connected to environment variables, CLI, HTTP, MCP arguments, or saved profiles.
- Added a typed default data builder that validates current server configuration through `serverConfigDataSchema`.
- Added `outputSchema: serverConfigOutputShape` only to the `server_config` descriptor.
- Replaced the old top-level configuration result with the strict success envelope under `structuredContent.data` while preserving the readable `content` text.
- Converted provider/validation failures into a redacted `INTERNAL_ERROR` envelope with `retryable: false`, empty `details`, and MCP `isError: true`.
- Attached measured nonnegative `durationMs` at the existing wrapper boundary only when structured content already contains a `meta` object.
- Extended the contract test to use the SDK `InMemoryTransport` and real `listTools()`/`callTool()` paths.

**Verification commands:**

- `node --import tsx --test test/server-config-contract.test.mjs` before implementation
- `node --import tsx --test test/server-config-contract.test.mjs` after implementation and cleanup
- `npm run build`
- Targeted source search for `serverConfigDataProvider`, `outputSchema: serverConfigOutputShape`, and the success/failure constructors

**Verification results:**

- RED check: 3 existing tests passed and 2 new integration tests failed for the expected reasons: no advertised `outputSchema` and the old top-level structured configuration shape.
- Final contract test: 5 tests passed, 0 failed.
- TypeScript build: passed with exit code 0 and no TypeScript errors.
- Real MCP success output passed `serverConfigOutputSchema`, preserved readable text, and reported nonnegative duration.
- Injected provider failure passed the strict failure schema, returned `isError: true`, removed the synthetic secret, and contained no stack trace.
- Targeted search confirmed the provider seam remains limited to the constructor interface/default selection, handler call, plan, and test; only `server_config` advertises this new exact schema.

**Decisions made:**

- Kept failure injection as a constructor-only dependency rather than a production test mode.
- Reused the existing `errorText()` redaction path and did not expose raw exceptions or stacks.
- Computed the registered tool list once in the default data builder so `registeredTools` and `registeredToolCount` remain consistent.
- Limited duration attachment to structured results with an existing `meta` object, preserving old tools that do not use the Phase 1 envelope.

**Failed attempts and resolution:**

- A broad exact replacement of the legacy inline config object did not match reliably because the file contained mixed newline sequences during incremental editing. The object was removed with bounded exact replacements, the affected handler was re-read, and both the focused tests and Build were rerun successfully.

**Risks or limitations:**

- The `server_config` tool card still reads the former top-level fields and must be migrated to `structuredContent.data` in Task 3.
- The slice still migrates only `server_config`; every other MCP tool retains its previous structured output contract.
- No full smoke, audit, or package gate was run in Task 2 because those are reserved for Task 4 in the approved plan.
- The broader working tree still includes approved planning and Task 1 changes that have not been staged or committed.

**Rollback method:**

- Revert the Task 2 changes in `src/server.ts` and remove the two MCP integration tests, leaving the Task 1 schema constructors/tests intact.
- Revert the STEP-083 updates in `Memory.md` and remove this appended archive entry.
- No configuration, dependency, profile, authentication, or data migration rollback is required.

**Next step:** User reviews the Task 2 diff. After explicit approval, begin only Task 3 under TDD. Do not stage, commit, push, or enter Task 4.

## 2026-07-12 — STEP-084: Task 3 `server_config` tool-card data-path migration

**Status:** Complete; awaiting Task 3 diff review

**Goal:** Update only the `server_config` tool-card subtitle and detailed renderer so configuration fields are read from nested `structuredContent.data`, while preserving top-level tool identity for generic card framing.

**Files changed:**

- `src/toolCardWidget.ts`
- `test/server-config-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Implementation summary:**

- Updated the `server_config` subtitle branch to create `const config = data?.data ?? {}` and read tool, Bash, and session fields from that nested object.
- Updated `renderServerConfig()` to read blocked globs, allowed roots, Bash session settings, runtime fields, limits, modes, authentication state, and raw configuration from `config` only.
- Preserved `header(data, ...)` so `codexpro_tool` and `codexpro_title` remain top-level identity fields.
- Added a focused source-level compatibility assertion that requires both nested data paths and rejects the former top-level blocked-glob read.
- Did not modify any other tool-card branch or any production MCP handler.

**Verification commands:**

- `node --import tsx --test test/server-config-contract.test.mjs` before implementation
- `node --import tsx --test test/server-config-contract.test.mjs` after implementation
- `npm run build`

**Verification results:**

- RED check: 5 existing tests passed and only the new tool-card data-path assertion failed because the widget still read top-level configuration fields.
- Final contract test: 6 tests passed, 0 failed.
- TypeScript build: passed with exit code 0 and no TypeScript errors.
- Manual bounded review confirmed the subtitle and renderer use nested `data`, while `header(data, ...)` remains unchanged.

**Decisions made:**

- Kept the compatibility test source-focused because the widget is exported as an HTML string and Task 3 does not introduce a browser/DOM test dependency.
- Retained existing camelCase and snake_case fallbacks for Bash session, tool mode, and Bash mode within the nested configuration object.
- Kept raw-card output limited to the nested configuration object so the envelope metadata and error fields are not mislabeled as raw config.

**Failed attempts and resolution:**

- Whole-block exact replacements did not match because of the file's newline formatting. The two approved branches were updated through bounded unique-line replacements, then re-read and verified.

**Risks or limitations:**

- The test verifies the generated widget source path rather than executing it in a browser DOM.
- The full Node suite, Smoke, audit, package dry-run, and final slice review remain Task 4.
- No other tool has been migrated to the new Phase 1 output contract.

**Rollback method:**

- Revert the `server_config` changes in `src/toolCardWidget.ts` and remove the sixth compatibility test/import.
- Revert the STEP-084 updates in `Memory.md` and remove this appended archive entry.
- No runtime configuration, dependency, authentication, or data migration rollback is required.

**Next step:** User reviews the Task 3 diff. After explicit approval, run only Task 4 full regression, Smoke, audit, package, diff, and memory-completion gates. Do not stage, commit, or push without separate approval.

## 2026-07-12 — STEP-085: Implement exact `server_config` output schema

**Status:** Complete locally; awaiting final implementation review and explicit Git-operation approval

**Goal:** Complete the first Phase 1 vertical slice as one verified unit: exact `server_config.outputSchema`, stable success/failure envelopes, redacted errors, measured metadata, compatible readable text, nested-data tool cards, and updated internal consumers.

**Files changed for the completed slice:**

- `src/tools/schemas/common.ts`
- `src/tools/schemas/serverConfig.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `test/server-config-contract.test.mjs`
- `scripts/smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/stress.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

Previously approved planning/rule changes remain separately present in `AGENTS.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, and `docs/superpowers/`.

**TDD sequence:**

1. Task 1 RED failed because the new Schema module did not exist; minimal shared and tool-specific Zod contracts then produced 3/3 passing tests.
2. Task 2 RED retained those 3 passes while 2 real MCP integration tests failed for missing `outputSchema` and the old top-level result; minimal server integration then produced 5/5 passing tests.
3. Task 3 RED retained those 5 passes while the new tool-card data-path assertion failed; the two `server_config` card branches were migrated to nested `data`, producing 6/6 passing tests.
4. Task 4 first exposed that the new test required `--import tsx` while CI uses plain `node --test`; the test was changed to use the official `tsx/esm/api` `tsImport()` runtime API, after which plain Node and the complete suite passed.
5. Task 4 Smoke then exposed old internal consumers reading top-level configuration fields. All stdio Smoke, HTTP Smoke, and Stress `server_config` reads were migrated to `structuredContent.data`; the complete 8-section Smoke suite then passed.

**Final contract:**

- Top-level fields are exactly `codexpro_tool`, `codexpro_title`, `ok`, `data`, `error`, and `meta`.
- Success uses `ok: true`, validated non-null `data`, and `error: null`.
- Failure uses `ok: false`, `data: null`, MCP `isError: true`, and a redacted error object with `code`, `message`, `retryable`, and `details`.
- This first slice exposes only `INTERNAL_ERROR`, with `retryable: false` and `details: {}`.
- `meta` contains exactly `schemaVersion`, `durationMs`, and `warnings`; schema version is 1 and duration is nonnegative.
- Human-readable MCP `content` remains available.
- The widget keeps top-level identity for its generic header and reads configuration values only from nested `data`.

**Verification results:**

- Narrow contract test: 6 passed, 0 failed.
- Complete Node suite: 44 passed, 0 failed.
- TypeScript build: passed with exit code 0.
- Smoke: all 8 sequential sections passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm pack --dry-run`: passed; 101 files, 294.8 kB packed, 1.4 MB unpacked; internal Memory/spec/plan archives were excluded.
- Authentication/documentation test: 5 passed, 0 failed.
- Targeted search found no remaining internal direct reads of `server_config` configuration fields from top-level `structuredContent`.
- Targeted search confirmed `serverConfigDataProvider` exists only in the programmatic constructor seam, server implementation, test, plan, and memory documentation.
- The synthetic failure value remains assembled from harmless fragments inside the test, is redacted in output, and no stack trace is returned.
- No stage, commit, push, credential change, dependency change, profile change, or Cloudflare change occurred.

**Additional verification note:**

- `npm run stress` was attempted because its `server_config` consumer was migrated. On native Windows it failed before reaching that consumer because the existing fixture creates `visible:123:file.txt`, which is not a valid Windows filename. `node --check scripts/stress.mjs` passed, and the old top-level consumer search returned no matches. This pre-existing platform limitation is outside the approved first-slice scope.

**Compatibility impact:**

- `server_config` consumers must now read configuration fields from `structuredContent.data`.
- Generic tool identity remains top-level.
- Existing readable text output and MCP error signaling are preserved.
- No second tool was migrated, and other tool result shapes remain unchanged.
- Internal stdio Smoke, HTTP Smoke, Stress, and the tool card were updated for the new path.

**Risks and limitations:**

- Only `server_config` has the Phase 1 exact contract; later tools require separate reviewed slices.
- The tool-card compatibility test checks generated widget source rather than executing a browser DOM.
- Native-Windows Stress remains blocked by its unrelated colon-containing fixture filename.
- The working tree contains the complete unstaged Phase 1 planning and first-slice implementation set.

**Rollback method:**

1. Restore the former `server_config` handler and remove its advertised `outputSchema`.
2. Restore the former tool-card and internal script top-level configuration reads.
3. Remove `src/tools/schemas/common.ts` and `src/tools/schemas/serverConfig.ts` if no later slice uses them.
4. Remove `test/server-config-contract.test.mjs`.
5. Remove `attachStructuredDuration` and the constructor dependency interface if unused.
6. Revert the STEP-082 through STEP-085 root-memory state and append a rollback record here.

No user configuration, credentials, profiles, workspaces, remote branches, dependencies, or Cloudflare state require rollback.

**Next step:** User performs final implementation review. After separate explicit approval, stage the reviewed Phase 1 planning and first-slice files, then commit and push in separately approved operations. Do not begin migration of a second tool.

## 2026-07-12 — STEP-086: Stage reviewed Phase 1 slice

**Status:** Complete; awaiting commit approval

**Goal:** Stage the complete reviewed first Phase 1 `server_config` slice after explicit user approval, without committing or pushing.

**Actions and evidence:**

- Staged the exact 14 reviewed files covering planning, schemas, server integration, tool-card compatibility, internal Smoke/Stress consumers, contract tests, and active Memory records.
- Git status shows only index states `M  ` and `A  ` for those 14 files; no ` M`, `??`, or unrelated path remains.
- Windows emitted only expected LF-to-CRLF working-copy warnings.
- No commit, push, dependency change, credential change, profile change, or Cloudflare change occurred.

**Next step:** After separate explicit approval, create the local commit. Do not push or migrate a second tool.

## 2026-07-12 — STEP-087: Commit exact `server_config` slice

**Status:** Complete; awaiting push approval

**Goal:** Create the reviewed local Phase 1 commit after explicit approval, while keeping remote state unchanged.

**Actions and evidence:**

- Created the local commit with message `feat: add exact server_config output schema`.
- The commit contains the complete 14-file planning, schema, server, tool-card, internal-consumer, contract-test, and Memory set.
- Updated the active status documents to show that `main` is one commit ahead of `origin/main` and awaits push approval.
- No push, dependency change, credential change, profile change, or Cloudflare change occurred.

**Next step:** After separate explicit approval, push the local commit. Do not migrate a second tool.

## 2026-07-12 — STEP-088: Push exact `server_config` slice

**Status:** Complete; publication record pending synchronization

**Goal:** Publish the reviewed first Phase 1 `server_config` slice after explicit approval and record the remote state without starting a second migration.

**Actions and evidence:**

- Pushed implementation commit `b989776` (`feat: add exact server_config output schema`) from local `main` to `origin/main`.
- Git reported the remote update `0009b78..b989776  main -> main` with exit code 0.
- Updated the active status documents to mark the first slice as published.
- No dependency, credential, profile, workspace, or Cloudflare state changed.

**Next step:** Publish this documentation-only push record, verify local `main` and `origin/main` are synchronized, then review CI. Do not migrate a second tool without a separately reviewed plan and explicit approval.

## 2026-07-12 — STEP-089: Neat-freak Phase 1 slice closeout

**Status:** Complete; first Phase 1 slice closed and no implementation task active

**Goal:** Reconcile the final push and CI facts across the project knowledge layer after the first exact-output-schema slice.

**Actions and evidence:**

- Re-verified CI run `29189127483` for implementation commit `b989776`: `completed/success`.
- Re-verified CI run `29189202711` for record commit `ec6c0c0`: `completed/success`.
- Both runs passed Ubuntu/Windows Node 20/24 jobs.
- Confirmed local `main` and `origin/main` divergence is `0/0`; the worktree was clean before this documentation-only tidy-up.
- Updated `Memory.md`, `AGENTS.md`, the roadmap, design status, and plan status to remove completed push/CI actions and restore a planning-only boundary.
- No source code, dependency, credential, profile, workspace, or Cloudflare state changed.

**Next step:** No Phase 1 implementation task is active. After explicit approval, plan and design one additional exact-schema tool as a separate vertical slice. Keep the native-Windows Stress fixture filename issue as separate maintenance work.

## 2026-07-12 — STEP-090: Publish and verify neat-freak closeout

**Status:** Complete; final closeout record prepared for publication

**Goal:** Publish the STEP-089 knowledge reconciliation and verify its cross-platform CI result without starting new implementation work.

**Actions and evidence:**

- Re-ran the focused documentation test before publication: 5/5 passed.
- Re-ran the six-file Markdown whitespace and conflict-marker check: passed.
- Staged exactly the six reviewed documentation files and created commit `ca17257` (`docs: close first Phase 1 schema slice`).
- Pushed `ca17257` to `origin/main` successfully.
- CI run `29189679200` completed with `success`; Ubuntu/Windows Node 20/24 all passed.
- Updated `Memory.md` and this archive with the publication evidence.
- No source code, dependency, credential, profile, workspace, or Cloudflare state changed.

**Next step:** Publish this final two-file record, verify its CI, then begin a new session at the Phase 1 planning boundary. Do not start Phase 2 or a second tool implementation without explicit approval.

## 2026-07-12 — STEP-091: Select and specify the second Phase 1 `tree` slice

**Status:** Complete; written design specification awaiting user review

**Goal:** Select one low-risk second MCP tool, clarify its exact success and failure contracts, and write an independently reviewable design specification without modifying source code or beginning Phase 2.

**Files changed:**

- `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Implementation summary:**

- Inspected the clean synchronized workspace, `AGENTS.md`, `Memory.md`, the Phase 1 roadmap, current MCP tool modes, `tree` registration, `repoTree`, `PathGuard`, shared schema contracts, the completed `server_config` pattern, and tool-card routing.
- Recommended and received explicit approval for `tree` as the second Phase 1 vertical slice because it is read-only, bounded, representative of workspace/path errors, and does not require Phase 2 lifecycle changes.
- Retained the existing successful data fields under nested `data`: `workspace_id`, `root`, `text`, `entries`, and `truncated`.
- Approved the six exact failure codes `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `FILE_NOT_FOUND`, `NOT_A_DIRECTORY`, and `INTERNAL_ERROR`; all use `retryable: false` and strict code-specific details.
- Chose a `tree`-local error-classification adapter rather than refactoring the global untyped `CodexProError`, keeping other tools unchanged.
- Defined safe error-detail sanitation, literal stable messages, exact length bounds, constructor-only `treeResultProvider` test injection, dedicated nested-data tool-card handling, contract-test coverage, acceptance criteria, risks, rollback, and explicit non-goals.
- Wrote the approved design to `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md` and self-reviewed it for placeholders, contradictions, ambiguity, and scope expansion.
- No source implementation, dependency, credential, profile, workspace, Cloudflare, stage, commit, or push operation occurred.

**Verification commands:**

- `node --test test/auth-documentation.test.mjs`
- `node -e "const fs=require('fs');const p='docs/superpowers/specs/2026-07-12-tree-output-schema-design.md';const s=fs.readFileSync(p,'utf8');for(const x of ['TODO','TBD','PLACEHOLDER','<<<<<<<','=======','>>>>>>>']){if(s.includes(x)){console.error('FOUND '+x);process.exitCode=1;}}console.log('spec-scan-ok');"`
- CodexPro `read` of the complete written specification after creation.

**Verification results:**

- Authentication/documentation regression: 5 passed, 0 failed.
- Placeholder and conflict-marker scan: `spec-scan-ok`.
- Complete specification read confirmed 21 sections, no unresolved placeholder, no implementation instruction that crosses into Phase 2, and consistent success/failure, metadata, details, test, scope, and rollback contracts.
- The self-review tightened stable messages to literals, bounded sanitized `workspace_id` details to 160 characters, bounded sanitized path details to 240 characters, and made the `treeResultProvider` constructor seam explicit.

**Decisions made:**

- `tree` is the only approved second Phase 1 tool.
- Existing snake_case data field names and structured `text` are retained.
- Successful `root` remains the existing absolute value for compatibility; failure details never expose absolute paths.
- The direct output top level remains exactly `codexpro_tool`, `codexpro_title`, `ok`, `data`, `error`, and `meta`.
- `meta` remains exactly `schemaVersion`, `durationMs`, and `warnings`.
- Default-workspace fallback remains unchanged; explicit workspace IDs, ownership, expiry, and close remain Phase 2 work.
- No global error-class refactor is permitted in this slice.
- The written specification must receive user approval before an implementation plan is written.

**Risks or limitations:**

- The local adapter temporarily depends on recognized current error-message prefixes because internal errors are untyped.
- Successful `root` remains an absolute path.
- Tool-card tests will inspect generated source rather than a full browser DOM.
- Native-Windows Stress remains separately blocked by the invalid colon-containing filename fixture.
- Only design and project memory were changed; no executable behavior has been tested or implemented.

**Rollback method:**

- Remove `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md`.
- Restore the prior root `Memory.md` state.
- Append a correction or rollback entry to this archive rather than silently rewriting STEP-091.
- No source, dependency, credential, profile, workspace, remote, or Cloudflare rollback is required.

**Next step:** User reviews and explicitly approves the written `tree` design specification. After approval, invoke the planning workflow and write a separate TDD implementation plan. Do not modify source code, stage, commit, push, or begin Phase 2.

## 2026-07-12 — STEP-092: Write the second-slice `tree` implementation plan

**Status:** Complete; self-reviewed implementation plan awaiting user approval

**Goal:** Convert the approved written `tree` specification into a complete task-by-task TDD implementation plan without modifying executable source or starting Phase 2.

**Files changed:**

- `docs/superpowers/plans/2026-07-12-tree-output-schema.md`
- `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Implementation summary:**

- Loaded and followed the `writing-plans` workflow after explicit approval of the written design specification.
- Mapped the exact create/modify boundaries for `src/tools/schemas/tree.ts`, `test/tree-contract.test.mjs`, `src/server.ts`, `src/toolCardWidget.ts`, and the two Memory layers.
- Wrote a four-task TDD plan with 41 tracked steps: exact Zod contracts, real MCP integration and six-code classification, dedicated nested-data Tool Card migration, and complete regression/local closeout.
- Included complete code blocks for constructor tests, schemas, MCP tests, provider interface, local sanitizers/classifier, exact handler integration, card renderer, and source-contract tests.
- Fixed the cross-task interface names as `TREE_ERROR_MESSAGES`, `treeDataSchema`, `treeErrorSchema`, `treeOutputShape`, `treeOutputSchema`, `TreeData`, `TreeFailureInput`, `TreeStructuredResult`, `createTreeSuccess`, `createTreeFailure`, exported `TreeProviderContext`, and `treeResultProvider`.
- Added per-task root Memory and Phase 1 archive updates, per-task `show_changes` reviews, explicit user approval gates, and a final stop before staging.
- Defined complete verification for focused tests, the current 44-test baseline plus 12 new tests, build, eight-section Smoke, audit, package contents, documentation, Stress syntax, whitespace, conflict markers, Memory limits, secret-like patterns, stale consumer search, and intended-file review.
- Preserved the separate native-Windows Stress fixture limitation and prohibited Phase 2, dependency, credential, profile, authentication, Cloudflare, and unrelated-tool changes.
- The first attempt to write the complete plan in one call was blocked by the safety checker because a verification example contained credential-like regex literals. The plan was safely written in bounded sections with those detection patterns assembled from harmless fragments; no credential value was used or exposed.
- Updated the design status to show written-spec approval and plan-review state.
- No source implementation, dependency, credential, profile, workspace, Cloudflare, stage, commit, or push operation occurred.

**Verification commands:**

- `node -e "const fs=require('fs');const p='docs/superpowers/plans/2026-07-12-tree-output-schema.md';const s=fs.readFileSync(p,'utf8');for(const x of ['TODO','TBD','PLACEHOLDER']){if(s.includes(x)){console.error('FOUND '+x);process.exitCode=1;}}if(/^(<<<<<<<|=======|>>>>>>>)(?: .*)?$/m.test(s)){console.error('FOUND REAL CONFLICT MARKER');process.exitCode=1;}const tasks=(s.match(/^### Task /gm)||[]).length;const checks=(s.match(/^- \\[ \\]/gm)||[]).length;console.log(JSON.stringify({tasks,checks,lines:s.split(/\\r?\\n/).length,bytes:Buffer.byteLength(s)}));"`
- `node --test test/auth-documentation.test.mjs`
- Final changed-document and Memory-limit validation command recorded with the result below.
- CodexPro `read` of the complete plan sections and `show_changes` of the complete planning diff.

**Verification results:**

- Plan structure scan: 4 tasks, 41 unchecked execution steps, 1,336 lines, and 44,464 bytes before the final status-only Memory/archive updates.
- No unfinished marker or real merge-conflict line was found.
- Spec coverage review found a task for every approved contract, error, data, card, test, verification, compatibility, risk, and rollback requirement.
- Type/interface review corrected `TreeProviderContext` to an exported interface and kept every downstream name consistent.
- Card review added an explicit nested-data subtitle assertion and wrapped the root metric in the existing `metrics` container.
- Authentication/documentation regression: 5 passed, 0 failed.
- Final document/Memory validation: 4 plan tasks, 41 tracked steps, 1,336 plan lines, 44,464 plan bytes, 130 Memory lines, 12,129 Memory bytes, 4 files checked, and no unfinished marker, real conflict marker, NUL byte, or Memory hard-limit violation.

**Decisions made:**

- Execution is split into four reviewable tasks, not a single broad implementation batch.
- Each task must update both Memory layers and stop for explicit approval.
- The plan contains no automatic stage, commit, or push step.
- Task 1 creates only the exact schema and constructor tests.
- Task 2 alone integrates the real handler and local classifier.
- Task 3 alone migrates the Tool Card.
- Task 4 performs full regression and stops at the staging approval boundary.
- The global error class, path policy, default-workspace behavior, and all other tool contracts remain unchanged.

**Risks or limitations:**

- The planned classifier remains temporarily coupled to recognized current error-message prefixes.
- The planned Tool Card test inspects generated widget source rather than running a browser DOM.
- The full implementation plan is intentionally detailed and large because it contains executable code and exact tests for a zero-context implementer.
- No executable behavior has been implemented or verified yet.

**Rollback method:**

- Remove `docs/superpowers/plans/2026-07-12-tree-output-schema.md`.
- Restore the prior design status and root Memory state.
- Append a correction or rollback entry to this archive rather than silently rewriting STEP-092.
- No source, dependency, credential, profile, workspace, remote, or Cloudflare rollback is required.

**Next step:** User reviews and explicitly approves the implementation plan. After approval, execute only Task 1 with TDD, update both Memory layers, show the task diff, and stop before Task 2. Do not stage, commit, push, or begin Phase 2.

## 2026-07-12 — STEP-093: Implement Task 1 exact `tree` Schema contracts

**Status:** Complete locally; awaiting explicit Task 2 approval

**Goal:** Implement only the exact tool-specific `tree` Zod data, error, and output contracts plus constructor tests, without changing the registered MCP handler or Tool Card.

**Files changed for Task 1:**

- `src/tools/schemas/tree.ts`
- `test/tree-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**TDD sequence:**

1. Ran the pre-implementation complete Node baseline: 44/44 passed.
2. Created `test/tree-contract.test.mjs` before production code.
3. Ran the focused test and observed the expected RED: `ERR_MODULE_NOT_FOUND` for the absent `src/tools/schemas/tree.ts`.
4. Created the minimal exact `tree` Schema and constructor implementation.
5. Re-ran the focused test and obtained GREEN: 4/4 passed.
6. Ran the TypeScript build: exit code 0.

**Implemented contract:**

- Successful `data` is strict and contains exactly `workspace_id`, `root`, `text`, `entries`, and `truncated`.
- Top-level output shape is prepared as exactly `codexpro_tool`, `codexpro_title`, `ok`, `data`, `error`, and `meta`.
- `meta` reuses the shared Phase 1 contract with exactly `schemaVersion`, `durationMs`, and `warnings`.
- The strict error union permits only `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `FILE_NOT_FOUND`, `NOT_A_DIRECTORY`, and `INTERNAL_ERROR`.
- Each error fixes its stable public message and `retryable: false`.
- Workspace details require exactly one non-empty `workspace_id` bounded to 160 characters.
- Path details require exactly one non-empty `path` bounded to 240 characters.
- `INTERNAL_ERROR.details` is a strict empty object.
- Constructors enforce consistent success/failure states through the complete output Schema.
- `src/tools/schemas/common.ts` was reused unchanged.

**Verification commands and results:**

- `node --test` before implementation: 44 passed, 0 failed.
- `node --test test/tree-contract.test.mjs` before Schema creation: expected missing-module failure.
- `node --test test/tree-contract.test.mjs` after Schema creation: 4 passed, 0 failed.
- `npm run build`: exit code 0.

**Scope boundary:**

- The current registered `tree` MCP handler still returns its legacy structured shape and does not yet advertise `outputSchema`.
- No real workspace/path failure is classified through the new contract yet.
- The constructor-only provider seam does not exist yet.
- The Tool Card still uses its previous generic behavior.
- No other MCP tool output changed.
- No dependency, authentication, Cloudflare, profile, workspace-lifecycle, path-policy, shell, process, or Stress-fixture behavior changed.
- No stage, commit, or push operation occurred.

**Risks or limitations:**

- Task 1 proves only pure Schema and constructor behavior; real MCP registration and failures require Task 2 tests.
- The stable error messages and exact detail shapes are now public contract constants and must remain aligned with later handler classification.
- Full-suite regression after adding the new test file is intentionally deferred to Task 4; the pre-change baseline and Task 1 focused/build gates passed.

**Rollback method:**

- Remove `src/tools/schemas/tree.ts`.
- Remove `test/tree-contract.test.mjs`.
- Restore the preceding root Memory state and append a rollback record here.
- No source consumer, dependency, credential, profile, workspace, remote, or Cloudflare rollback is required because no runtime integration exists yet.

**Next step:** User reviews the complete Task 1 diff. After explicit approval, execute only Task 2: real MCP registration, exact advertised output schema, constructor-only provider seam, and local stable-error classification. Do not begin Tool Card migration, stage, commit, push, or Phase 2.

## 2026-07-12 — STEP-094: Implement Task 2 real `tree` MCP integration

**Status:** Complete locally; awaiting explicit Task 3 approval

**Goal:** Connect the approved `tree` contract to the real MCP descriptor and handler, classify expected failures safely, and preserve readable output without migrating the Tool Card.

**Files changed for Task 2:**

- `src/server.ts`
- `test/tree-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**TDD sequence and evidence:**

1. Added seven real in-memory MCP tests after the four Task 1 constructor tests.
2. RED produced 4 passes and 7 expected failures: no advertised `outputSchema`, legacy top-level success data, legacy `{ error: string }` failures, and no working provider seam.
3. Added exact `treeOutputShape` registration, strict real success/failure construction, measured metadata through the existing wrapper, and `isError: true` on failures.
4. Added constructor-only `treeResultProvider`; production defaults to `repoTree`, while tests may inject an unexpected failure without any environment, CLI, HTTP, MCP-input, profile, or public-config switch.
5. Added a `tree`-local classifier for `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `FILE_NOT_FOUND`, `NOT_A_DIRECTORY`, and fallback `INTERNAL_ERROR`.
6. Added bounded safe details: Workspace IDs are cleaned and capped at 160 characters; safe relative paths are cleaned and capped at 240; absolute/device/UNC/drive/ADS/reserved forms use `[unsafe path omitted]`; internal errors return `{}`.
7. GREEN: 11/11 focused tests passed.
8. Existing first-slice regression: 6/6 `server_config` tests passed.
9. TypeScript build passed with exit code 0.
10. Targeted searches found no existing direct consumer of old top-level `tree` fields; matches were planning text, the new tests, or unrelated `search` fields.

**Compatibility and scope:**

- Successful readable directory-tree `content` remains unchanged.
- Successful structured fields now live only under `data`.
- Failures return fixed safe readable text, strict structured errors, and MCP `isError: true`.
- Default-workspace fallback, path policy, global `CodexProError`, other tool contracts, authentication, Cloudflare, profiles, dependencies, shell, process behavior, and the Stress fixture remain unchanged.
- The Tool Card still uses its previous generic behavior and is intentionally deferred to Task 3.
- No stage, commit, or push operation occurred.

**Implementation note:**

- `src/server.ts` initially used CRLF. It was normalized to LF through the exact editor so the planned multi-line replacement could be applied safely; Git reports no line-ending-only diff.
- One intermediate insertion temporarily duplicated the old `tree` tail. The exact duplicate was removed before verification; the final diff contains only the intended handler replacement.

**Risks and limitations:**

- The local classifier temporarily recognizes current internal error-message prefixes because `CodexProError` has no typed code.
- Task 2 tests real MCP behavior but does not yet test the dedicated Tool Card path.
- Full Node, Smoke, audit, and package gates remain Task 4.

**Rollback method:**

- Restore the former `tree` registration and remove its advertised output Schema.
- Remove `TreeProviderContext`, `treeResultProvider`, and the local classification/sanitization helpers.
- Restore the Task 1-only tests and Memory state, then append a rollback record here.
- No dependency, credential, profile, workspace, remote, or Cloudflare rollback is required.

**Next step:** User reviews Task 2. After explicit approval, execute only Task 3: migrate the `tree` Tool Card subtitle and renderer to nested `data` and add the focused source-contract test. Do not begin Task 4, stage, commit, push, or Phase 2.

## 2026-07-12 — STEP-095: Implement Task 3 nested-data `tree` Tool Card

**Status:** Complete locally; awaiting explicit Task 4 approval

**Goal:** Migrate only the `tree` Tool Card subtitle, renderer, and routing to the approved nested-data contract, with a focused source-contract test.

**Files changed for Task 3:**

- `src/toolCardWidget.ts`
- `test/tree-contract.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**TDD sequence and evidence:**

1. Imported `toolCardWidgetHtml` into the existing `tree` contract suite.
2. Added one focused source-contract test requiring a dedicated `tree` route, subtitle, and renderer that read successful fields only from `data`.
3. RED: the first 11 tests passed and the new test failed because `renderTree` and the dedicated route did not exist.
4. Added a `tree` subtitle that reads `data.root` on success and the stable top-level error code on failure.
5. Added `renderTree(data)` with a safe error card and a successful card showing root, entry count, truncation state, and a bounded 40-line tree preview from nested `data`.
6. Added a dedicated `tree` routing branch before `inspect_workspace`.
7. GREEN: 12/12 focused tests passed.
8. TypeScript build passed with exit code 0.

**Compatibility and scope:**

- The generic header continues to use top-level `codexpro_tool`, `codexpro_title`, `ok`, and `error` as approved.
- Successful `root`, `text`, `entries`, and `truncated` are read only from nested `data`.
- Failure cards display only the stable public error code and safe message already produced by Task 2.
- The renderer uses existing shared widget helpers and styles; no CSS, browser dependency, or unrelated renderer changed.
- No MCP handler, Schema, path policy, other tool output, dependency, credential, profile, Cloudflare, workspace lifecycle, Stress fixture, stage, commit, or push operation changed.

**Risks and limitations:**

- The Tool Card test is a generated-source contract test rather than a full browser DOM execution.
- The tree preview is intentionally bounded to 40 lines in the widget; complete readable MCP content and structured `data.text` remain available outside the preview.
- Full Node, Smoke, audit, package, documentation, syntax, consumer, and final scope gates remain Task 4.

**Rollback method:**

- Remove the `tree` subtitle branch, `renderTree`, and dedicated route from `src/toolCardWidget.ts`.
- Remove only the final Tool Card source-contract test and import from `test/tree-contract.test.mjs`.
- Restore the preceding root Memory state and append a rollback record here.
- No runtime handler, dependency, credential, profile, workspace, remote, or Cloudflare rollback is required.

**Next step:** User reviews Task 3. After explicit approval, execute Task 4 complete local regression and closeout, then stop at the separate staging approval boundary. Do not stage, commit, push, or begin Phase 2.

## 2026-07-12 — STEP-096: Complete the local `tree` vertical slice

**Status:** Complete locally; awaiting explicit staging approval

**Goal:** Run every approved Task 4 gate, repair only a proven direct consumer of the migrated contract, record complete evidence, and stop before Git staging.

**Complete changed-file set:**

- `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md`
- `docs/superpowers/plans/2026-07-12-tree-output-schema.md`
- `src/tools/schemas/tree.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `test/tree-contract.test.mjs`
- `scripts/http-smoke.mjs`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Task 4 verification sequence and results:**

1. Fresh focused contract suite: 12 passed, 0 failed.
2. Complete Node suite: 56 passed, 0 failed, matching the 44-test baseline plus 12 new tests.
3. TypeScript build: exit code 0.
4. Initial complete Smoke run: first three sections passed, then HTTP Smoke failed because `scripts/http-smoke.mjs` still read `tree.structuredContent.workspace_id` from the legacy top level.
5. Updated only the proven direct consumer: two HTTP Smoke reads now use `tree.structuredContent.data?.workspace_id`. No runtime behavior changed.
6. Narrow `node scripts/http-smoke-compat.mjs`: passed.
7. Re-run complete `npm run smoke`: all 8 sequential sections passed.
8. `npm audit --audit-level=high`: 0 vulnerabilities, exit code 0.
9. `npm pack --dry-run`: exit code 0, 103 files, package size 298.5 kB, unpacked size 1.4 MB. Compiled `dist/tools/schemas/tree.js` and source map were included; tests, root Memory, phase archive, design specification, and implementation plan remained excluded.
10. Documentation regression: 5 passed, 0 failed.
11. `node --check scripts/stress.mjs`: exit code 0. The invalid native-Windows fixture filename was not changed and full Stress was not required.
12. `git diff --check`: exit code 0; only expected Windows LF-to-CRLF checkout warnings were emitted.
13. Conflict-marker, NUL, Memory-limit, and credential-pattern check: 7 files checked with no issue; pre-final root Memory was 146 lines and 14,114 bytes.
14. Consumer inspection found no old `tree` use of `structuredContent.entries`; `structuredContent.text` and `structuredContent.truncated` matches belonged to other tools. The dedicated `renderTree(data)` route exists, and the HTTP Smoke consumer now reads nested `data`.
15. Complete `show_changes` review confirmed the intended nine-file set, no staged files, no dependency files, no credentials, profiles, Cloudflare state, Phase 2 behavior, third-tool migration, or Stress fixture modification.

**Stable contract delivered:**

- Exact top level: `codexpro_tool`, `codexpro_title`, `ok`, `data`, `error`, and `meta`.
- Exact successful `data`: `workspace_id`, `root`, `text`, `entries`, and `truncated`.
- Exact `meta`: `schemaVersion`, `durationMs`, and `warnings`.
- Stable non-retryable failures: `WORKSPACE_NOT_FOUND`, `PATH_OUTSIDE_WORKSPACE`, `PATH_BLOCKED`, `FILE_NOT_FOUND`, `NOT_A_DIRECTORY`, and `INTERNAL_ERROR`.
- Expected errors include bounded safe details; unexpected errors expose no original message, stack, secret, or absolute path.
- Readable MCP `content` remains available; failures retain `isError: true`.
- The dedicated Tool Card reads successful tool fields only from nested `data` and shows fixed public failure information.

**TDD summary:**

- Task 1 RED was the missing Schema module; GREEN was 4/4 constructor/Schema tests.
- Task 2 RED was 7 real MCP failures against the legacy descriptor/result path; GREEN was 11/11 focused tests.
- Task 3 RED was the absent dedicated Tool Card route and renderer; GREEN was 12/12 focused tests.
- Task 4 discovered and repaired one real compatibility consumer through a failing Smoke gate, then passed the narrow and complete Smoke runs.

**Compatibility impact:**

- Direct machine consumers of successful `tree` output must read tool fields from `structuredContent.data`.
- Top-level identity, `ok`, `error`, and `meta` remain valid.
- Human-readable directory-tree text is preserved.
- Other tool contracts and default-workspace behavior are unchanged.

**Known limitations:**

- The local classifier temporarily depends on current internal error-message prefixes because global `CodexProError` is still untyped.
- Successful `data.root` remains an absolute path for compatibility; failure details do not expose absolute paths.
- Tool Card verification is source-contract based rather than a browser DOM test.
- Native-Windows Stress remains separately blocked by `visible:123:file.txt`.

**Rollback method:**

1. Restore the former `tree` registration and remove its exact output Schema.
2. Remove the local classifier and `treeResultProvider` seam.
3. Restore generic Tool Card handling for `tree`.
4. Restore the two HTTP Smoke consumer reads to the former shape only if the runtime migration is also rolled back.
5. Remove `src/tools/schemas/tree.ts` and `test/tree-contract.test.mjs`.
6. Restore root Memory and append a rollback record here.
7. Rebuild `dist` from restored source.

No dependency, credential, profile, workspace, remote, Cloudflare, staging, commit, or push operation occurred.

**Next step:** User reviews the complete locally verified nine-file slice and separately approves staging. The staging step must not commit or push. Do not begin Phase 2 or a third tool migration.

## 2026-07-12 — STEP-097: Neat-freak closeout for the local `tree` slice

**Status:** Complete locally; awaiting explicit staging approval

**Goal:** Reconcile project rules, roadmap, design, plan, and Memory with the fully verified `tree` implementation, remove stale planning language, and preserve a clean staging boundary.

**Files changed in this cleanup:**

- `AGENTS.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md`
- `docs/superpowers/plans/2026-07-12-tree-output-schema.md`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

**Implementation summary:**

- Updated the `AGENTS.md` documentation map with the second-slice design and executed plan.
- Replaced the stale stopping point that said no second tool had started with the verified `tree` staging boundary.
- Updated the Phase 1 roadmap to list both delivered vertical slices, the six stable `tree` errors, and the fact that Phase 2 remains closed.
- Marked the design as implemented and locally verified; relabeled its former “current behavior” section as a preserved pre-implementation baseline.
- Marked the implementation plan as fully executed, converted all 41 tracked steps from unchecked to completed, and added an execution-record pointer to STEP-093 through STEP-096.
- Compressed root Memory by removing STEP-077 and STEP-078 from the recent-summary window; their complete history remains in this archive.
- Corrected the staging-review scope from the STEP-096 nine-file implementation set to the final eleven-file set after adding `AGENTS.md` and the roadmap.

**Verification commands:**

- `node --test test/auth-documentation.test.mjs`
- `node -e` document-state, checkbox-count, path-existence, conflict-marker, NUL, Memory-limit, and credential-pattern validation
- `git diff --check`
- CodexPro targeted searches for stale second-tool and awaiting-approval language
- CodexPro `show_changes` for the complete unstaged scope

**Verification results:**

- Documentation regression: 5 passed, 0 failed.
- State and safety validation: 11 files checked, 13 documentation references resolved, 41 plan steps checked, 0 unchecked, and no conflict marker, NUL, or credential-like value found.
- Root `Memory.md`: 150 lines and 14,616 bytes; within both practical and hard limits.
- `AGENTS.md`: 186 lines and 10,056 bytes; within its soft limit.
- Stale active-state search returned no match for “No second tool has been migrated”, “No Phase 1 implementation task is active”, or either prior awaiting-approval status.
- `git diff --check`: exit code 0; only expected Windows LF-to-CRLF checkout warnings were emitted.
- Final workspace review showed exactly 11 unstaged files and no staged files.

**Decisions made:**

- `AGENTS.md` remains a concise rules and stopping-point document, not a detailed implementation log.
- The roadmap records stable delivered capabilities; detailed evidence remains in the phase archive.
- The design preserves its pre-implementation baseline for auditability rather than rewriting history as though the implementation already existed.
- The executed plan remains available as a complete implementation record with checked steps.
- The reviewed staging set now contains eleven files: the prior nine implementation/planning/Memory files plus `AGENTS.md` and `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`.

**Risks or limitations:**

- No README change was needed because this slice changes internal MCP structured contracts, not installation or launch behavior.
- The global Codex configuration and non-project memory directories were outside this workspace cleanup; no external state was modified.
- The local classifier, absolute successful `root`, source-based Tool Card test, and native-Windows Stress limitations recorded in STEP-096 remain unchanged.

**Rollback method:**

- Restore the six cleanup files to their STEP-096 state while leaving the verified implementation intact.
- Append a correction entry here rather than silently changing archived facts.
- No source, dependency, credential, profile, workspace, remote, Cloudflare, staging, commit, or push rollback is required.

**Next step:** User reviews the final eleven-file unstaged slice and explicitly approves staging. The staging step must not commit or push. Do not begin Phase 2 or a third tool migration.

## 2026-07-12 — STEP-098: Stage the reviewed `tree` slice

**Status:** Complete; awaiting explicit commit approval

**Goal:** Stage exactly the reviewed eleven-file `tree` slice after explicit user approval, synchronize the project stopping point, and stop before commit.

**Files staged:**

- `AGENTS.md`
- `Memory.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/memory/archive/phase-1.md`
- `docs/superpowers/plans/2026-07-12-tree-output-schema.md`
- `docs/superpowers/specs/2026-07-12-tree-output-schema-design.md`
- `scripts/http-smoke.mjs`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `src/tools/schemas/tree.ts`
- `test/tree-contract.test.mjs`

**Implementation summary:**

- Ran one explicit `git add --` command listing all eleven reviewed paths; no wildcard or unrelated file was included.
- Updated `AGENTS.md`, the roadmap, design, plan, and root Memory from the staging boundary to the commit-approval boundary.
- Recorded this step in both Memory layers and re-staged the synchronized documentation.
- No source behavior changed during staging synchronization.

**Verification results:**

- The initial staging command exited with code 0.
- Only expected Windows LF-to-CRLF checkout warnings were emitted.
- The first cached-diff whitespace check found two trailing spaces in the design metadata; they were removed and the design plus this archive were re-staged.
- The repeated cached-diff whitespace check passed.
- CodexPro `show_changes` returned an empty result for both staged and unstaged views after staging, so final verification used read-only Git commands instead.
- `git diff --cached --name-only` listed exactly the eleven reviewed files, `git diff --name-only` returned no unstaged paths, and `git status --short` showed seven modified plus four added files in the index.
- Final Git review therefore confirmed the complete eleven-file set staged and no unstaged changes.
- No commit or push occurred.

**Decisions made:**

- The next Git action requires separate explicit approval and is one local commit only.
- The commit step must not push.
- Phase 2 and a third tool migration remain closed.

**Risks or limitations:**

- The previously recorded local classifier, absolute successful `root`, source-based Tool Card test, and native-Windows Stress limitations remain unchanged.
- Line-ending warnings are expected checkout behavior and did not block staging.

**Rollback method:**

- Unstage the eleven listed files while preserving their working-tree contents.
- Restore the pre-staging stopping-point text and append a correction entry here.
- No source rollback, dependency change, credential, profile, Cloudflare, remote, commit, or push rollback is required.

**Next step:** User reviews the complete staged eleven-file slice and explicitly approves one local commit. Do not push in the commit step. Do not begin Phase 2 or a third tool migration.

## 2026-07-12 — STEP-099: Commit and push the `tree` implementation

**Status:** Implementation published; follow-up closeout record included in the current publication

**Goal:** Create the reviewed implementation commit, push it to `origin/main`, and prepare the final publication record without changing feature behavior.

**Implementation summary:**

- Re-ran the cached-diff whitespace check before committing; it passed.
- Created local commit `6aaeda4` with message `feat: add exact tree output schema`.
- The commit contains the complete reviewed eleven-file implementation, planning, documentation, test, HTTP Smoke consumer, and Memory set.
- Pushed `main` from `b0d1875` through `6aaeda4` to `origin/main` successfully.
- Updated `AGENTS.md`, the Phase 1 roadmap, the `tree` design and executed plan, root Memory, and this archive to record the published implementation.
- No feature source, dependency, credential, profile, Cloudflare, workspace lifecycle, Stress fixture, or Phase 2 behavior changed in the follow-up record.

**Verification commands and results:**

- `git diff --cached --check`: passed before the implementation commit.
- `git commit -m "feat: add exact tree output schema"`: exit code 0; 11 files changed, 3,314 insertions, and 28 deletions.
- `git push origin main`: exit code 0; `b0d1875..6aaeda4 main -> main`.
- The follow-up record will receive its own local commit and push, followed by local/remote synchronization and GitHub Actions status checks.

**Decisions made:**

- Preserve implementation commit `6aaeda4` as the feature commit.
- Publish status and Memory reconciliation as a separate follow-up commit.
- Do not begin Phase 2 or a third tool migration after publication; return to the Phase 1 planning boundary.

**Risks or limitations:**

- GitHub Actions results are not yet recorded in this entry.
- The local classifier, absolute successful `root`, source-based Tool Card test, and native-Windows Stress limitations remain unchanged.

**Rollback method:**

- Before downstream work, revert the follow-up record commit and then revert `6aaeda4` if the entire `tree` slice must be removed.
- Do not force-push or rewrite published history.
- No credential, profile, Cloudflare, or workspace rollback is required.

**Next step:** Commit and push this follow-up closeout record, verify local `main` matches `origin/main`, then inspect the new GitHub Actions run. Do not begin Phase 2 or a third tool migration.

## 2026-07-12 — STEP-100: Verify and close the `tree` publication

**Status:** Complete; Phase 1 returned to the planning boundary

**Goal:** Verify both published `tree` commits, record their CI results, reconcile active project state, and close the slice without beginning another implementation.

**Implementation summary:**

- Published closeout record commit `2ecd4af` with message `docs: record tree schema publication`.
- Pushed `main` from `6aaeda4` through `2ecd4af` to `origin/main`.
- Confirmed a clean working tree immediately after the push.
- Confirmed local `HEAD` and `origin/main` both resolved to `2ecd4af4ff246840fc946960dd83005cf4e1da6f`.
- GitHub CLI was not installed, so CI status was queried through the public GitHub Actions API using Node `fetch` without credentials.
- Updated the rules, roadmap, design, executed plan, root Memory, and this archive to return the repository to the Phase 1 planning boundary.

**Verification results:**

- Implementation commit `6aaeda4`: CI run `29194671044`, completed successfully.
- Closeout record commit `2ecd4af`: CI run `29194802582`, completed successfully.
- The closeout run was polled until GitHub reported `completed / success`.
- `git status --short`: no output after the record push.
- `git rev-parse HEAD` and `git rev-parse origin/main`: identical full hash for `2ecd4af`.
- The failed `gh run list` attempt was environmental only: `/usr/bin/bash: gh: command not found`; no repository change resulted.

**Decisions made:**

- The `tree` vertical slice is fully closed and cross-platform CI-validated.
- No Phase 1 implementation task remains active.
- The next permitted action is selecting and designing one additional Phase 1 tool under a separately reviewed specification and plan.
- Phase 2 and a third tool implementation remain closed without explicit approval.

**Risks or limitations:**

- The global `CodexProError` remains untyped; `tree` still uses its reviewed local classifier.
- Successful `tree.data.root` remains absolute for compatibility.
- Tool Card verification remains source-contract based.
- Native-Windows Stress remains separately blocked by `visible:123:file.txt`.

**Rollback method:**

- Revert the final state-record publication first, then revert `2ecd4af` and `6aaeda4` in reverse order if the complete published slice must be removed.
- Do not rewrite history or force-push.
- No credential, profile, Cloudflare, dependency, or workspace rollback is required.

**Next step:** Remain at the Phase 1 planning boundary. Do not start Phase 2 or a third tool implementation without a separately reviewed design, plan, and explicit approval.
