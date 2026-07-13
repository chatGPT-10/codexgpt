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
