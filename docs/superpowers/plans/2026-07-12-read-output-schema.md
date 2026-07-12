# Exact `read` Output Schema — Executed Plan

**Date:** 2026-07-12
**Status:** All four tasks published in implementation commit `282dcfa` with publication record `c90246f`; CI runs `29199573321` and `29199802824` passed on Ubuntu/Windows with Node 20/24
**Scope:** Phase 1 third vertical slice; `read` only

## Goal

Migrate `read` to an exact advertised output schema with strict success/failure envelopes, nine stable safe errors, preserved readable MCP output, a nested-data Tool Card, migrated proven consumers, and complete local verification.

The detailed implementation history and command-by-command evidence are recorded in `docs/memory/archive/phase-1.md`, STEP-103 through STEP-108. The source and tests are the authoritative implementation.

## Fixed constraints

- Native Windows remains the primary platform; WSL is not required.
- Only `read` is migrated in this slice.
- Successful fields keep their existing names and casing.
- Successful fields exist only under `structuredContent.data`.
- Top-level fields are exactly `codexpro_tool`, `codexpro_title`, `ok`, `data`, `error`, and `meta`.
- Metadata remains exactly `schemaVersion`, `durationMs`, and `warnings`.
- Readable MCP `content` is preserved on success and failure.
- Failures preserve `isError: true`.
- No raw exception, stack trace, token, secret, environment value, or unsafe absolute path is returned.
- Existing optional workspace fallback, file decoding, line numbering, byte limits, bounded scan, binary detection, hashing, redaction, and structured compaction remain unchanged.
- Global `CodexProError`, path policy, authentication, Cloudflare, profiles, dependencies, shell/process behavior, Git behavior, and Phase 2 are unchanged.
- The native-Windows Stress fixture `visible:123:file.txt` is not changed.

## Exact success contract

Successful `data` contains exactly:

- `workspace_id`
- `root`
- `path`
- `text`
- `startLine`
- `endLine`
- `totalLines`
- `bytes`
- `sha256`
- `truncated`

The schema validates:

- positive and internally consistent line bounds;
- `endLine <= totalLines`;
- `truncated` matches the selected line interval;
- non-negative byte count;
- lowercase 64-character SHA-256 format;
- strict objects with no additional fields.

## Exact failure contract

All errors are non-retryable and use fixed public messages.

| Code | Details |
|---|---|
| `WORKSPACE_NOT_FOUND` | `{ workspace_id }` |
| `PATH_OUTSIDE_WORKSPACE` | `{ path }` |
| `PATH_BLOCKED` | `{ path }` |
| `FILE_NOT_FOUND` | `{ path }` |
| `NOT_A_FILE` | `{ path }` |
| `FILE_TOO_LARGE` | `{ path, scope, limit_bytes }` |
| `FILE_NOT_TEXT` | `{ path }` |
| `INVALID_LINE_RANGE` | `{ path, start_line, end_line }` |
| `INTERNAL_ERROR` | `{}` |

Workspace and path details are sanitized and bounded. Unsafe absolute paths are represented as `[unsafe path omitted]`.

## File map

### Created

- `src/tools/schemas/read.ts`
- `test/read-contract.test.mjs`

### Modified

- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/stress.mjs`
- `docs/superpowers/specs/2026-07-12-read-output-schema-design.md`
- `docs/superpowers/plans/2026-07-12-read-output-schema.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-1.md`

### Intentionally unchanged

- `src/fsOps.ts`
- `src/guard.ts`
- `src/http.ts`
- `src/stdio.ts`
- `src/tools/schemas/common.ts`
- `scripts/smoke.mjs`
- package dependencies and lockfile
- authentication, Cloudflare, profiles, shell/process, Git, and other tool handlers

## Task 1 — Exact schema and constructors

- [x] Wrote constructor and strict-schema tests first.
- [x] Observed the expected missing-module RED.
- [x] Added `src/tools/schemas/read.ts` with strict data, error, output, metadata, and constructor contracts.
- [x] Preserved the ten existing success fields and nine approved errors.
- [x] Passed 4/4 focused tests.
- [x] Passed TypeScript build.
- [x] Recorded STEP-105 in both Memory layers.

## Task 2 — Real MCP integration

- [x] Added real MCP descriptor, success, user-error, path-redaction, and injected internal-error tests.
- [x] Observed 4 passing constructor tests and 11 expected integration failures against the legacy handler.
- [x] Added exact `read.outputSchema`.
- [x] Added `ReadProviderContext` and constructor-only `readResultProvider` dependency injection.
- [x] Added a read-local safe classifier without changing global errors.
- [x] Returned strict success/failure envelopes through the real MCP handler.
- [x] Preserved readable content and `isError: true`.
- [x] Canonicalized only temporary test roots with `fs.realpath` after native-Windows junction diagnostics.
- [x] Passed 15/15 focused tests.
- [x] Passed 18/18 published `server_config` and `tree` contract regressions.
- [x] Passed TypeScript build.
- [x] Recorded STEP-106 in both Memory layers.

## Task 3 — Tool Card and consumers

- [x] Added a failing Tool Card source-contract test.
- [x] Observed 15 passing tests and one expected missing-renderer failure.
- [x] Added the dedicated nested-data `read` subtitle.
- [x] Added `renderRead` for stable success and failure presentation.
- [x] Routed `read` away from the generic file renderer.
- [x] Preserved generic write/edit/patch/diff/export rendering.
- [x] Migrated seven proven Stress assertions:
  - two supertool text checks;
  - full-read `endLine`;
  - `FILE_TOO_LARGE` error code;
  - ranged-read text;
  - late-NUL `FILE_NOT_TEXT` error code;
  - absolute-alias path.
- [x] Applied the Stress edits only after explicit shell-patch approval because full-file secret scanning blocked the controlled editor.
- [x] Required every old assertion to match exactly once.
- [x] Verified token fixtures, the invalid Windows filename fixture, late-NUL fixture creation, and unrelated Stress behavior were unchanged.
- [x] Passed 16/16 focused tests.
- [x] Passed Stress syntax, 18/18 published contract regressions, and TypeScript build.
- [x] Confirmed no stale direct successful top-level `read` consumer remains.
- [x] Recorded STEP-107 in both Memory layers.

## Task 4 — Complete local closeout

- [x] Passed focused `read` tests: 16/16.
- [x] Passed complete Node tests: 72/72.
- [x] Passed TypeScript build.
- [x] Passed all 8 Smoke sections.
- [x] Passed `npm audit --audit-level=high`: 0 vulnerabilities.
- [x] Passed `npm pack --dry-run`: 105 files.
- [x] Confirmed compiled `read` schema output is packaged and internal Memory/spec/plan/tests are excluded.
- [x] Passed documentation regression: 5/5.
- [x] Passed `node --check scripts/stress.mjs`.
- [x] Passed `git diff --check`; only expected Windows LF-to-CRLF warnings were emitted.
- [x] Passed conflict-marker, NUL, credential-pattern, Memory-limit, consumer, and scope checks.
- [x] Synchronized the design, roadmap, AGENTS, Memory index, and Phase 1 archive.
- [x] Reviewed exactly eleven intended changed files.
- [x] Confirmed no file is staged.
- [x] Recorded STEP-108 in both Memory layers.
- [x] Stopped at the separate staging approval boundary.

## Verification summary

| Gate | Result |
|---|---|
| Focused `read` contract | 16/16 passed |
| Complete Node suite | 72/72 passed |
| Published contract regression | 18/18 passed |
| TypeScript build | passed |
| Smoke | 8/8 sections passed |
| Dependency audit | 0 vulnerabilities |
| Package dry-run | 105 files |
| Documentation tests | 5/5 passed |
| Stress syntax | passed |
| Whitespace and text safety | passed |
| Consumer audit | passed |
| Intended-file scope | exactly 11 files |

## Compatibility notes

- Existing readable MCP content remains available.
- Valid supertool calls retain wrapper identity while child `read` success fields now live under `data`.
- Malformed supertool child-argument handling remains outside the direct valid `read` contract and was not changed.
- Successful `root` remains absolute.
- `sha256` remains based on decoded text before output redaction.
- Tool Card structured-string compaction may bound displayed `data.text` independently of line-selection `truncated`.

## Known limitations

- The local classifier is coupled to existing error-message prefixes because global errors remain untyped.
- NUL detection does not prove complete text encoding validity.
- Tool Card verification is primarily source-contract based.
- Full native-Windows Stress remains blocked by the pre-existing invalid filename fixture.
- Cross-platform CI evidence does not exist until the slice is committed and pushed.

## Rollback

Before staging:

1. Restore the former `read` handler and Tool Card route.
2. Restore the seven Stress assertions.
3. Remove `src/tools/schemas/read.ts` and `test/read-contract.test.mjs`.
4. Restore the five documentation and Memory files.
5. Rebuild and rerun focused plus complete tests.

After publication, use normal revert commits and append correction records. Do not rewrite history or force-push.

No user configuration, credentials, profiles, authentication state, dependencies, workspaces, remote branches, or Cloudflare state require rollback.

## Current boundary

The reviewed eleven-file slice is locally complete and unstaged. The next permitted action is explicit user approval for staging only. Commit, push, CI publication, Phase 2, and another tool migration remain closed.
