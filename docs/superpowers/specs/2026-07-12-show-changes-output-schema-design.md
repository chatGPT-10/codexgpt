# `show_changes` Exact Output Schema Design

Date: 2026-07-12  
Phase: Phase 1, sixth vertical slice  
Status: Published and cross-platform CI-validated

## 1. Goal

Migrate only the direct `show_changes` MCP tool to the Phase 1 schema-v1 result envelope with an exact advertised `outputSchema`, strict success data, stable public errors, safe optional-analysis degradation, and focused contract tests.

The slice must preserve the current review workflow: staged or unstaged selection, optional path scoping, optional raw diff, `last_shown` checkpoints, untracked-file fingerprinting, change-impact analysis, legacy text content, and `codexpro` supertool wrapping.

## 2. Chosen approach

Use a local boundary pattern that builds on the completed `git_status` and `git_diff` slices:

1. Add a dedicated schema module at `src/tools/schemas/showChanges.ts`.
2. Keep `src/gitOps.ts` and `src/analysis/*` unchanged.
3. Add narrow injectable providers for the status, diff, and optional analysis calls used by `show_changes`.
4. Reuse the established Git/path failure classifiers where their semantics match.
5. Register `show_changes` with an exact `outputSchema`.
6. Return schema-v1 success or failure envelopes from the direct handler.
7. Treat Git, workspace, and path failures as tool failures.
8. Treat optional change-analysis failure as a safe success degradation: `analysis: null` plus one fixed warning in `meta.warnings`.
9. Preserve legacy human-readable text content.
10. Update the dedicated Tool Card renderer to consume only the nested envelope.

This approach is preferred over retaining the current flat partial-success object or refactoring all Git and analysis operations into new services. It gives the required public contract with the smallest isolated change.

## 3. Scope

### In scope

- Direct `show_changes` tool only.
- Exact advertised `outputSchema`.
- Strict success data schema and invariants.
- Strict discriminated error schema.
- Exact nested schema for optional change analysis.
- Fixed, non-secret analysis-degradation warning.
- Stable public error messages.
- Status, diff, and analysis provider seams for deterministic contract tests.
- Existing checkpoint, path, staged, diff omission, and untracked-file behavior.
- Focused `node:test` contract coverage.
- Existing smoke/stress compatibility updates where old flat fields are asserted.
- Direct Tool Card migration to nested `data`, `error`, and `meta`.
- `codexpro` supertool wrapper compatibility.
- `Memory.md`, Phase 1 archive, architecture roadmap, changelog, and `AGENTS.md` documentation-map updates.

### Out of scope

- Changes to direct `git_status` or `git_diff` contracts.
- Changes to `src/gitOps.ts`.
- Changes to repository analysis algorithms or analysis types.
- Parsed Git status records, parsed diff hunks, or a new Git service.
- Persistence or cross-process sharing of review checkpoints.
- Workspace lifecycle changes.
- Write tools, Git writes, authentication, profiles, Cloudflare, shell/process behavior, dependencies, or Phase 2.

## 4. Public success contract

The direct tool returns this envelope in `structuredContent`:

```json
{
  "codexpro_tool": "show_changes",
  "codexpro_title": "Show Changes",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexpro",
    "path": "workspace changes",
    "status": "## main...origin/main\n M src/server.ts",
    "changed_files": [" M src/server.ts"],
    "staged": false,
    "include_diff": true,
    "additions": 12,
    "deletions": 3,
    "changed": true,
    "diff": "diff --git ...",
    "review_since": "last_shown",
    "review_marked": true,
    "review_checkpoint_hit": false,
    "analysis": null
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

### Success data fields

- `workspace_id`: non-empty workspace identifier.
- `root`: workspace root display string.
- `path`: original requested path, or `workspace changes` when omitted.
- `status`: normalized Git status text used by the review.
- `changed_files`: status lines excluding the branch header.
- `staged`: effective staged selection; default `false`.
- `include_diff`: effective raw-diff inclusion; default `true`.
- `additions`: non-negative integer for the returned review state.
- `deletions`: non-negative integer for the returned review state.
- `changed`: whether this response reports reviewable changes.
- `diff`: returned raw diff, or the empty string when omitted, clean, or checkpoint-suppressed.
- `review_since`: `last_shown` or `workspace`.
- `review_marked`: whether this call wrote a review checkpoint.
- `review_checkpoint_hit`: whether an unchanged prior checkpoint suppressed repeated review output.
- `analysis`: exact change-analysis object, or `null` when disabled, unnecessary, checkpoint-suppressed, or safely degraded.

Unknown fields are rejected. Legacy `status_error` and `diff_error` are not allowed.

## 5. Success invariants

The schema must reject success data unless all of these hold:

1. `changed=false` requires empty `changed_files`, zero additions, zero deletions, and an empty diff.
2. `include_diff=false` requires an empty diff, `review_marked=false`, and `review_checkpoint_hit=false`.
3. `review_checkpoint_hit=true` requires `review_since="last_shown"`, `include_diff=true`, `changed=false`, empty `changed_files`, zero additions, zero deletions, an empty diff, and `analysis=null`.
4. A non-empty diff requires `include_diff=true`, `changed=true`, and `review_checkpoint_hit=false`.
5. `analysis` may be non-null only when `changed=true` and `review_checkpoint_hit=false`.
6. `changed=true` may have zero line additions/deletions because untracked, metadata-only, rename-only, or binary changes can still be reviewable.
7. `review_marked=true` requires `include_diff=true`.
8. Unknown data and nested analysis fields are rejected.

## 6. Exact analysis contract

When analysis succeeds, `data.analysis` preserves the existing public field names:

```json
{
  "schema_version": 1,
  "changed_paths": ["src/server.ts"],
  "affected_areas": ["src"],
  "dependent_files": [
    {
      "path": "test/show-changes-contract.test.mjs",
      "confidence": "strong",
      "reasons": ["imports changed file"]
    }
  ],
  "related_tests": [],
  "risk_signals": [
    {
      "id": "public-api",
      "label": "Public API",
      "confidence": "strong",
      "paths": ["src/server.ts"],
      "reasons": ["public tool contract changed"]
    }
  ],
  "recommended_commands": [
    {
      "command": "npm test",
      "source": "package.json",
      "reasons": ["project test script"]
    }
  ],
  "coverage": {
    "inventoryFiles": 100,
    "analyzedFiles": 90,
    "scannedBytes": 100000,
    "symbolCount": 200,
    "relationshipCount": 300,
    "truncated": false,
    "warnings": []
  },
  "warnings": [],
  "cache": {
    "hit": false,
    "key": "analysis-cache-key"
  }
}
```

Approved confidence values are `exact`, `strong`, and `inferred`. Approved risk ids are `public-api`, `authentication`, `storage`, `migration`, `build`, and `configuration`.

If analysis throws, returns malformed data, or fails strict parsing:

- the Git review remains `ok: true`;
- `data.analysis` is `null`;
- `meta.warnings` is exactly extended with:
  `Change analysis was unavailable; Git review data is still complete.`
- raw exception messages, stack traces, paths, provider diagnostics, and secret-looking text are not exposed.

Analysis being disabled, unnecessary because there are no changed paths, or skipped because of a checkpoint hit is not an error and adds no warning.

## 7. Public failure contract

Failures return:

```json
{
  "codexpro_tool": "show_changes",
  "codexpro_title": "Show Changes",
  "ok": false,
  "data": null,
  "error": {
    "code": "GIT_NOT_REPOSITORY",
    "message": "The workspace is not a Git repository.",
    "retryable": false,
    "details": {}
  },
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

Approved error codes:

- `WORKSPACE_NOT_FOUND`
- `PATH_OUTSIDE_WORKSPACE`
- `PATH_BLOCKED`
- `GIT_NOT_REPOSITORY`
- `GIT_UNAVAILABLE`
- `GIT_COMMAND_FAILED`
- `INTERNAL_ERROR`

All errors are non-retryable in schema version 1.

### Error details

- `WORKSPACE_NOT_FOUND`: `{ "workspace_id": "..." }`
- `PATH_OUTSIDE_WORKSPACE`: `{ "path": "..." }`
- `PATH_BLOCKED`: `{ "path": "..." }`
- Git and internal failures: `{}`

Absolute or otherwise unsafe paths must be replaced with `[unsafe path omitted]`. Raw Git diagnostics, exception messages, stack traces, workspace roots, and secret-bearing strings must not enter structured or text failure output.

## 8. Runtime flow

The direct handler must perform this sequence:

1. Resolve the workspace.
2. Determine effective `staged`, `include_diff`, `review_since`, and `mark_reviewed` values.
3. Normalize the optional path through `PathGuard`; blank path remains equivalent to workspace scope.
4. Call the injectable status provider and require a string result.
5. Normalize and classify status diagnostics before continuing.
6. Call the injectable diff provider and require a string result.
7. Normalize and classify diff diagnostics before calculating stats.
8. Compute changed files and the existing untracked-file fingerprint.
9. Apply the existing checkpoint key and fingerprint behavior.
10. Preserve the rule that `include_diff=false` does not read or write the full-review checkpoint.
11. Derive response stats, changed paths, and review state.
12. When eligible, call the injectable analysis provider and strictly parse the public analysis object.
13. On analysis failure only, set `analysis=null` and append the fixed warning.
14. Parse strict success data and return a validated success envelope plus legacy text content.
15. Catch workspace, path, Git-provider, malformed-provider, and unexpected failures; classify and return a fixed failure envelope with `isError: true`.

Status failure has priority when status and diff would both fail because status is evaluated first. No partial Git success envelope is returned.

## 9. Dependency seams

Add these optional server dependencies:

```ts
export interface ShowChangesGitProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  path?: string;
  staged: boolean;
}

export interface ShowChangesAnalysisProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  changedPaths: string[];
}

showChangesStatusProvider?: (
  context: ShowChangesGitProviderContext
) => string | Promise<string>;

showChangesDiffProvider?: (
  context: ShowChangesGitProviderContext
) => string | Promise<string>;

showChangesAnalysisProvider?: (
  context: ShowChangesAnalysisProviderContext
) => ChangeAnalysis | Promise<ChangeAnalysis>;
```

Default providers delegate to current `gitDiffStatus(...)`, `gitDiff(...)`, and `reviewWorkspaceChanges(...)` calls. These seams exist only for deterministic contract testing and do not add public MCP arguments or production test modes.

## 10. Text compatibility

- Successful calls keep the existing `# Show Changes` text layout.
- `last_shown` checkpoint hits keep reporting `No changes since last shown review.` and `No new diff since last shown review.`
- `include_diff=false` keeps reporting `Diff omitted by request.`
- Analysis text is included only when exact analysis data is available.
- Safe analysis degradation does not embed raw failure text in the human-readable content.
- Tool failures return a concise fixed heading, public code, and fixed public message.

## 11. Wrapper compatibility

The `codexpro` supertool action `show_changes` and alias `changes` must continue preserving wrapper metadata while carrying the nested child contract:

- `codexpro_tool: "show_changes"`
- `codexpro_super_action: "show_changes"`
- `wrapped_tool: "show_changes"`
- nested `ok`, `data`, `error`, and `meta`

No legacy flat status, diff, changed, checkpoint, analysis, `status_error`, or `diff_error` fields may remain at wrapper top level.

## 12. Tool Card compatibility

The direct `show_changes` renderer must:

- read success fields only from `data`;
- read failure values only from `error`;
- read degradation warnings only from `meta.warnings`;
- render exact analysis from `data.analysis`;
- keep Git error and analysis-unavailable states distinguishable;
- stop depending on legacy `status_error` and `diff_error`.

Direct `git_status` and `git_diff` renderers remain unchanged.

## 13. Tests

Create `test/show-changes-contract.test.mjs` covering:

1. Success constructors for changed, clean, checkpoint-hit, stats-only, untracked-only, metadata-only, analysis-present, and analysis-null examples.
2. Every approved failure constructor.
3. Strict rejection of unknown fields, legacy errors, invalid nested analysis, and inconsistent data states.
4. Success/failure envelope consistency.
5. Advertised exact `outputSchema`.
6. Clean repository behavior.
7. Unstaged changes, raw diff, status, changed-file lines, and stats.
8. `include_diff=false` preserving stats without consuming or writing a checkpoint.
9. `last_shown` checkpoint suppression and `since=workspace` bypass.
10. `mark_reviewed=false` behavior.
11. Staged-only selection.
12. Path scoping, blank path behavior, safe nonexistent pathspec behavior, and unrelated-file exclusion.
13. Untracked-file content changing the fingerprint.
14. UTF-8 quoted paths and rename analysis compatibility.
15. Analysis-disabled and no-changed-path behavior.
16. Successful exact analysis mapping.
17. Thrown, malformed, and secret-bearing analysis failures degrading to the fixed warning.
18. Unknown workspace, outside path, and blocked path mapping.
19. Non-Git repository mapping.
20. Injected Git absence and command-failure mapping for both status and diff providers.
21. Malformed status/diff provider output and secret-bearing thrown exception redaction.
22. Direct Tool Card nested-field behavior.
23. `codexpro` wrapper and `changes` alias compatibility.

Update existing smoke/stress assertions only where they directly access old flat `show_changes` fields.

## 14. Acceptance criteria

The slice is accepted when:

- `show_changes` advertises an exact `outputSchema`.
- Every direct success result validates against `showChangesOutputSchema`.
- Every direct failure validates against `showChangesOutputSchema` and sets `isError: true`.
- Git/workspace/path failures never appear as successful review data.
- Optional analysis failure never hides valid Git review data and never exposes raw diagnostics.
- Existing staged, path, `include_diff`, `since`, `mark_reviewed`, checkpoint, untracked-file, UTF-8, and analysis-success behavior remains intact.
- The dedicated Tool Card and supertool wrapper consume the nested contract correctly.
- Focused contracts, adjacent Git contracts, complete tests, build, smoke, native-Windows stress, and `git diff --check` pass.
- Documentation and project memory record completion of only this vertical slice.

## 15. Rollback

Rollback is limited to removing:

- `src/tools/schemas/showChanges.ts`;
- `show_changes` imports, dependency seams, exact `outputSchema`, classifiers, and envelope handler changes;
- dedicated Tool Card nested-envelope adjustments;
- focused contract tests and direct compatibility assertion updates;
- this slice's documentation records.

`src/gitOps.ts`, `src/analysis/*`, direct `git_status`, and direct `git_diff` require no rollback because they remain unchanged.

## 16. Local completion evidence

Implemented in commits `69c5fea`, `2329160`, `9777f32`, and `c41365a` after design commit `5108e8a` and plan commit `8e885ef`.

Fresh local verification on native Windows passed:

- focused `show_changes` contracts: 14/14;
- adjacent `git_status`/`git_diff`/`show_changes` contracts: 50/50;
- complete `node:test` regression suite: 122/122;
- TypeScript build;
- all eight Smoke sections;
- native-Windows Stress;
- `git diff --check`.

The repository has no `npm test` script. The complete regression command is `node --test test/*.test.mjs`. Documentation record `0051543` is on `origin/main`, and CI run `29206887875` passed all Ubuntu/Windows Node 20/24 jobs.
