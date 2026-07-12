# `search` Exact Output Schema Design

Date: 2026-07-12  
Phase: Phase 1, seventh vertical slice  
Status: Implemented and locally verified; publication pending

## 1. Goal

Migrate only the direct `search` MCP tool to the Phase 1 schema-v1 result envelope with an exact advertised `outputSchema`, strict lexical search data, stable public errors, safe optional-analysis degradation, focused contract tests, Tool Card compatibility, and `codexpro` wrapper compatibility.

The slice must preserve fixed-string and regular-expression search, ripgrep and Node fallback behavior, path and glob scoping, hidden-file handling, configured result limits, redaction, optional structured search, legacy text content, and current cross-platform behavior.

## 2. Chosen approach

Use the established local boundary pattern:

1. Add `src/tools/schemas/search.ts`.
2. Keep `src/searchOps.ts` and `src/analysis/*` algorithms unchanged.
3. Add one narrow injectable `searchResultProvider` used only by the direct handler and contract tests.
4. Register direct `search` with an exact `outputSchema`.
5. Return strict schema-v1 success or failure envelopes.
6. Treat workspace, path, lexical backend, malformed lexical result, and unexpected failures as tool failures.
7. Treat optional structured-analysis failure as safe success degradation: preserve lexical matches, set `analysis: null`, and add one fixed warning.
8. Distinguish configured analysis disablement from unexpected analysis failure with separate fixed warnings.
9. Keep human-readable search text only in MCP `content`; do not duplicate it in structured data.
10. Update the Tool Card to render from nested `data.matches` and `data.analysis`.

This is preferred over a lexical-only half migration or a broad analysis subsystem refactor.

## 3. Scope

### In scope

- Direct `search` tool only.
- Exact advertised `outputSchema`.
- Strict lexical match and optional structured-analysis schemas.
- Stable public errors and safe details.
- Search provider dependency seam.
- Existing search options and result limits.
- Safe structured-analysis degradation.
- Direct Tool Card migration to nested envelope fields.
- `codexpro` wrapper compatibility.
- Focused `node:test` contract coverage.
- Existing smoke/stress compatibility updates where they inspect flat fields.
- Documentation, project memory, and changelog updates.

### Out of scope

- Changes to search ranking, indexing, cache algorithms, inventory, or relationship analysis.
- Splitting `search` into multiple public tools.
- New semantic providers or LSP/Serena integration.
- Changes to `tree`, `read`, Git tools, write tools, shell, authentication, profiles, Cloudflare, workspace lifecycle, dependencies, or Phase 2.

## 4. Public success contract

```json
{
  "codexpro_tool": "search",
  "codexpro_title": "Search Files",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexpro",
    "matches": [
      {
        "path": "src/server.ts",
        "line": 2345,
        "text": "\"search\","
      }
    ],
    "truncated": false,
    "used": "ripgrep",
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
- `matches`: ordered lexical matches.
- `matches[].path`: safe workspace-relative display path.
- `matches[].line`: positive one-based line number.
- `matches[].text`: redacted and bounded matching line text.
- `truncated`: whether visible matches or output limits exceeded returned matches.
- `used`: exact backend enum `ripgrep | node`.
- `analysis`: exact structured search object or `null`.

Unknown fields are rejected. Structured data does not contain the legacy aggregate `text` field.

## 5. Exact analysis contract

When requested and available, `data.analysis` preserves current camelCase public names:

```json
{
  "schemaVersion": 1,
  "query": "searchWorkspace",
  "intent": "symbol",
  "groups": {
    "definitions": [],
    "references": [],
    "tests": [],
    "configuration": [],
    "documentation": [],
    "other": []
  },
  "matches": [],
  "coverage": {
    "inventoryFiles": 10,
    "analyzedFiles": 9,
    "scannedBytes": 10000,
    "symbolCount": 20,
    "relationshipCount": 30,
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

Each structured match is strict and contains:

- `path`, `line`, `text`
- `group`: `definitions | references | tests | configuration | documentation | other`
- `score`: finite number
- `reasons`: string array
- `confidence`: `exact | strong | inferred`
- `source`: string

Every group must exist. Group values and `analysis.matches` are arrays of the same exact match schema; the contract does not require duplicate membership equality because current analysis may expose compacted card views.

## 6. Analysis degradation

Analysis is optional support around authoritative lexical search results.

### Not requested

- `analysis: null`
- no warning

### Disabled by configuration

- lexical search remains `ok: true`
- `analysis: null`
- `meta.warnings` contains exactly:
  `Structured search analysis is disabled; lexical search results are complete.`

### Unexpected unavailable or malformed analysis

- lexical search remains `ok: true`
- `analysis: null`
- `meta.warnings` contains exactly:
  `Structured search analysis was unavailable; lexical search results are complete.`
- raw exceptions, stack traces, absolute paths, provider diagnostics, and secret-looking text are excluded from both structured and text output.

A provider result with `cache.key = "disabled"` or `cache.key = "unavailable"` is normalized to these public degradation states. Exact valid analysis is preserved.

## 7. Public failure contract

```json
{
  "codexpro_tool": "search",
  "codexpro_title": "Search Files",
  "ok": false,
  "data": null,
  "error": {
    "code": "SEARCH_BACKEND_UNAVAILABLE",
    "message": "The requested search requires an unavailable search backend.",
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

Approved errors:

- `WORKSPACE_NOT_FOUND`
- `PATH_OUTSIDE_WORKSPACE`
- `PATH_BLOCKED`
- `FILE_NOT_FOUND`
- `INVALID_ARGUMENT`
- `SEARCH_BACKEND_UNAVAILABLE`
- `SEARCH_COMMAND_FAILED`
- `INTERNAL_ERROR`

All are non-retryable in schema version 1.

### Error details

- `WORKSPACE_NOT_FOUND`: `{ "workspace_id": "..." }`
- path failures: `{ "path": "..." }`
- `INVALID_ARGUMENT`: `{ "argument": "query | regex | glob" }`
- backend, command, and internal failures: `{}`

Unsafe path details become `[unsafe path omitted]`. Failure text uses only fixed headings, codes, and messages.

## 8. Runtime flow

1. Resolve workspace.
2. Build effective search options without changing current defaults.
3. Call the injectable search provider.
4. Require an object result with strict lexical fields.
5. Parse `matches`, `truncated`, and `used` before considering analysis.
6. Determine whether structured analysis was requested from `intent`, `symbol`, or `include_tests` presence.
7. If not requested, force `analysis: null` without warning.
8. If disabled, unavailable, thrown, or malformed, safely degrade according to section 6.
9. If available, strictly parse the exact analysis object.
10. Parse strict success data and return validated envelope plus current human-readable `content` text.
11. Catch lexical/workspace/path/backend errors, classify to a fixed public failure, and return `isError: true`.

## 9. Dependency seam

```ts
export interface SearchProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: Partial<SearchOptions>;
}

searchResultProvider?: (
  context: SearchProviderContext
) => SearchResult | Promise<SearchResult>;
```

The default delegates to `searchWorkspace(...)`. No hidden MCP argument or production test mode is added.

## 10. Text compatibility

- Successful calls keep current line-oriented content or `No matches.`.
- Structured analysis may remain summarized in structured data; no duplicated aggregate search text is added under `data`.
- Failures use `# Search Files Error`, public code, and fixed public message.
- Analysis degradation does not expose provider diagnostics in text.

## 11. Wrapper and Tool Card compatibility

The `codexpro` supertool action `search` preserves wrapper metadata and carries the child envelope. No legacy flat `matches`, `truncated`, `used`, `analysis`, or `text` fields remain at wrapper top level.

The Tool Card must:

- read lexical results from `data.matches`;
- read backend and truncation from `data.used` and `data.truncated`;
- render structured groups from `data.analysis`;
- render failure values from `error`;
- stop parsing the legacy aggregate `text` field;
- remain safe for colon-containing Windows and POSIX paths by using the structured `path` and `line` fields.

## 12. Tests

Create `test/search-contract.test.mjs` covering:

1. Strict success and every approved failure constructor.
2. Rejection of unknown fields, wrong details, invalid matches, invalid analysis, and inconsistent envelope states.
3. Advertised exact `outputSchema`.
4. Real lexical success and no-match success.
5. Node/ripgrep backend enum and truncation contract through injected providers.
6. Structured analysis exact success.
7. Not-requested analysis normalization.
8. Config-disabled, unavailable, thrown, secret-bearing, and malformed analysis degradation.
9. Unknown workspace, outside path, blocked path, missing target, invalid regex, unavailable backend, command failure, and malformed provider classification.
10. Human-readable content and `isError` behavior.
11. Direct Tool Card nested-field behavior.
12. `codexpro` wrapper compatibility.

Update smoke/stress assertions only where they directly inspect old flat search structured fields.

## 13. Acceptance criteria

- Direct `search` advertises an exact `outputSchema`.
- Every direct success and failure validates against `searchOutputSchema`.
- Lexical fields are only under `data`.
- `analysis` is always present as an exact object or `null`.
- Analysis degradation preserves lexical results and exposes only fixed warnings.
- Failures set `isError: true` and expose no raw diagnostic.
- Tool Card and supertool consume the nested envelope.
- Focused contract tests, complete `node:test`, build, smoke, stress, and diff check pass.
- Memory and documentation reflect the seventh Phase 1 slice.

## 14. Rollback

Revert the slice commits. This removes `src/tools/schemas/search.ts`, the provider seam, handler envelope, contract tests, and consumer/documentation updates while leaving `src/searchOps.ts` and analysis algorithms unchanged.
