# Exact `git_status` Output Schema — Executed Plan

**Date:** 2026-07-12
**Status:** All four implementation tasks are locally complete and verified; publication is authorized but not yet recorded
**Scope:** Phase 1 fourth vertical slice; `git_status` only

## Goal

Migrate direct `git_status` to an exact advertised output schema with strict success/failure envelopes, seven stable safe errors, preserved readable MCP output, a nested-data Tool Card, migrated proven consumers, and complete local verification.

The detailed decision history, RED/GREEN evidence, failed attempts, command output, and closeout record are stored in `docs/memory/archive/phase-1.md`, STEP-113 through STEP-118. The source and tests are the authoritative implementation.

## Fixed constraints

- Native Windows remains the primary platform; WSL is not required.
- Only direct `git_status` is migrated in this slice.
- `git_diff`, `show_changes`, shared Git operations, Git writes, authentication, Cloudflare, profiles, dependencies, shell/process behavior, and Phase 2 remain unchanged.
- Successful fields retain their existing names and raw Git status-line semantics.
- Successful fields exist only under `structuredContent.data`.
- Top-level fields are exactly `codexpro_tool`, `codexpro_title`, `ok`, `data`, `error`, and `meta`.
- Metadata remains exactly `schemaVersion`, `durationMs`, and `warnings`.
- Readable MCP `content` remains available on success and failure.
- Failures use `isError: true`.
- Raw Git stderr, stack traces, secrets, environment values, and unsafe absolute paths are not exposed.
- Safe nonexistent pathspecs remain successful clean results.
- `git_status` remains full-mode-only.
- The native-Windows Stress fixture `visible:123:file.txt` is not changed.

## Exact success contract

Successful `data` contains exactly:

- `workspace_id`
- `root`
- `path`
- `status`
- `changed_files`
- `changed`

The schema enforces:

- strict objects with no additional fields;
- non-empty workspace identity;
- `changed_files` entries are non-empty Git status lines and never branch-header records;
- `changed === (changed_files.length > 0)`;
- no successful `status_error` field;
- `error === null` on success.

`changed_files` intentionally remains a list of cleaned Git status lines rather than parsed path objects in schema version 1.

## Exact failure contract

All errors are non-retryable and use fixed public messages.

| Code | Details |
|---|---|
| `WORKSPACE_NOT_FOUND` | `{ workspace_id }` |
| `PATH_OUTSIDE_WORKSPACE` | `{ path }` |
| `PATH_BLOCKED` | `{ path }` |
| `GIT_NOT_REPOSITORY` | `{}` |
| `GIT_UNAVAILABLE` | `{}` |
| `GIT_COMMAND_FAILED` | `{}` |
| `INTERNAL_ERROR` | `{}` |

Workspace and path details are sanitized and bounded. Unsafe absolute paths use `[unsafe path omitted]`. Raw provider output and exception text are never copied into public error details.

## File map

### Created

- `src/tools/schemas/gitStatus.ts`
- `test/git-status-contract.test.mjs`
- `docs/superpowers/specs/2026-07-12-git-status-output-schema-design.md`
- `docs/superpowers/plans/2026-07-12-git-status-output-schema.md`

### Modified

- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/stress.mjs`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

### Intentionally unchanged

- `src/gitOps.ts`
- `src/guard.ts`
- `src/http.ts`
- `src/stdio.ts`
- `src/tools/schemas/common.ts`
- `scripts/smoke.mjs`
- package dependencies and lockfile
- `git_diff` and `show_changes` public contracts
- authentication, Cloudflare, profiles, shell/process behavior, and Phase 2

## Task 1 — Exact schema and constructors

- [x] Wrote four constructor/schema tests before production code.
- [x] Observed the expected missing-module RED for `src/tools/schemas/gitStatus.ts`.
- [x] Added the strict six-field data schema.
- [x] Added seven discriminated error variants with fixed messages and strict details.
- [x] Added strict success/failure envelope invariants.
- [x] Added `createGitStatusSuccess` and `createGitStatusFailure`.
- [x] Passed 4/4 focused tests.
- [x] Passed TypeScript build.
- [x] Recorded STEP-115 in both Memory layers.

## Task 2 — Real MCP integration

- [x] Added real in-memory MCP and temporary Git repository tests.
- [x] Observed 4 constructor tests passing and 11 expected integration failures against the legacy handler.
- [x] Added the exact advertised `gitStatusOutputShape`.
- [x] Added constructor-only `GitStatusProviderContext` and `gitStatusResultProvider` dependency injection.
- [x] Added local thrown-error and returned-output classifiers without changing shared Git internals.
- [x] Returned strict success and failed envelopes through the real MCP handler.
- [x] Preserved readable success status text and safe readable failure text.
- [x] Preserved blank-path unscoped behavior while retaining the original `data.path` value.
- [x] Preserved safe nonexistent pathspec behavior.
- [x] Covered workspace, path, repository, executable, command, malformed-provider, and secret-bearing exception failures.
- [x] Passed 15/15 focused tests.
- [x] Passed 34/34 published `server_config`, `tree`, and `read` contract regressions.
- [x] Passed TypeScript build.
- [x] Recorded STEP-116 in both Memory layers.

## Task 3 — Tool Card and consumers

- [x] Added one Tool Card source-contract test and one valid supertool regression test before card edits.
- [x] Observed 16 passing tests and one expected legacy-card failure.
- [x] Migrated the dedicated subtitle to stable `error.code` and nested `data.changed_files`.
- [x] Migrated only `renderStatus` to nested `data` and stable `error`.
- [x] Preserved `renderChanges` and the legacy `show_changes` fields.
- [x] Migrated the direct and supertool Stress consumers to `structuredContent.data.changed_files`.
- [x] Applied exactly six Stress field-reference replacements after secret scanning blocked the controlled editor.
- [x] Confirmed no old direct or supertool `git_status` top-level consumer remains.
- [x] Passed 17/17 focused tests.
- [x] Passed Stress syntax, 34/34 published contract regressions, and TypeScript build.
- [x] Recorded STEP-117 in both Memory layers.

## Task 4 — Complete local closeout

- [x] Passed focused `git_status` tests: 17/17.
- [x] Passed complete Node tests: 89/89.
- [x] Passed TypeScript build.
- [x] Passed all 8 Smoke sections.
- [x] Passed `npm audit --audit-level=high`: 0 vulnerabilities.
- [x] Passed `npm pack --dry-run`: 107 files.
- [x] Confirmed compiled `gitStatus` JavaScript and source map are packaged.
- [x] Confirmed the contract test, Memory, archive, design, and plan are excluded from the package.
- [x] Passed documentation regression: 5/5.
- [x] Passed `node --check scripts/stress.mjs`.
- [x] Recorded full native-Windows Stress as platform-blocked by the pre-existing invalid filename fixture; no full-Stress pass is claimed.
- [x] Passed NUL, trailing-whitespace, conflict-marker, vague-marker, credential-pattern, Memory-limit, consumer, and scope checks.
- [x] Synchronized the design, roadmap, AGENTS, Memory index, and Phase 1 archive.
- [x] Reviewed exactly eleven intended changed files.
- [x] Confirmed no file was staged, committed, or pushed during implementation.
- [x] Recorded STEP-118 in both Memory layers.

## Verification summary

| Gate | Result |
|---|---|
| Focused `git_status` contract | 17/17 passed |
| Published schema regressions | 34/34 passed |
| Complete Node suite | 89/89 passed |
| TypeScript build | passed |
| Smoke | 8/8 sections passed |
| Stress syntax | passed |
| Full Stress | platform-blocked on native Windows by the existing fixture |
| Dependency audit | 0 vulnerabilities |
| Package dry-run | 107 files |
| Documentation tests | 5/5 passed |
| Text safety | passed |
| Consumer audit | passed |
| Intended-file scope | exactly 11 files |

## Compatibility notes

- Direct success fields move from the structured top level to `data`.
- Direct Git failures become stable failed envelopes instead of clean-looking success objects with `status_error`.
- Human-readable success content remains the current Git status text.
- Valid supertool calls retain `codexpro_super_action` and `wrapped_tool` while child fields remain nested.
- Safe nonexistent pathspecs remain successful clean results.
- Successful `root` remains absolute.
- `changed_files` retains status-line semantics in schema version 1.
- `show_changes` and `git_diff` retain their existing legacy contracts.

## Known limitations

- Git failure classification remains coupled to current string output from `src/gitOps.ts`.
- `changed_files` remains an imperfect name for status records.
- Raw `status` remains command-oriented text rather than parsed porcelain data.
- Large repository status output remains subject to the existing synchronous output-buffer boundary.
- Tool Card verification remains primarily source-contract based.
- Full native-Windows Stress remains blocked by the pre-existing colon-containing fixture.
- Cross-platform CI evidence is unavailable until publication.

## Rollback

Before publication:

1. Restore the former direct `git_status` handler and Tool Card branch.
2. Restore the six Stress field references.
3. Remove `src/tools/schemas/gitStatus.ts` and `test/git-status-contract.test.mjs`.
4. Restore the six documentation and Memory files.
5. Rebuild and rerun focused, complete, and Smoke gates.

After publication, use normal revert commits and append correction records. Do not rewrite history or force-push.

No credentials, profiles, dependencies, authentication state, workspaces, remote branches, or Cloudflare state require rollback.

## Current boundary

The reviewed eleven-file slice is locally complete. The user has authorized neat-freak cleanup followed by staging, commit, and push. CI publication evidence and final synchronization must be recorded after the remote push succeeds.
