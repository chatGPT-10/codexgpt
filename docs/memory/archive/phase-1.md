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
