# P3 Unified Code Navigation Design

Date: 2026-08-30
Status: completed locally as STEP-537 under the owner's instruction to execute P3 through completion
Scope: unify lexical search, owned semantic navigation, and bounded file discovery without changing authority or the V1-V5 direct-tool counts
Primary platform: native Windows

## 1. Problem

CodexGPT already has a mature owned TypeScript semantic provider and a bounded lexical `search` tool. The remaining user problem is routing: the model must decide whether a code-location request needs `search`, `semantic`, `tree`, or another read before it has enough evidence to make that choice. Failed semantic availability then adds another model-visible retry.

P3 must make one request sufficient for ordinary code navigation while preserving honest evidence quality:

```text
navigation intent
  -> server-owned route
  -> semantic when it can answer
  -> lexical fallback when semantic cannot answer safely
  -> one bounded normalized result
```

Lexical evidence must never be presented as semantic certainty. Diagnostics have no lexical equivalent and therefore report semantic unavailability rather than inventing a fallback.

## 2. Compatibility decision

Do not add a 53rd direct V5 tool and do not rename or remove `semantic` or `search`.

Add an additive `semantic(operation="navigate")` input variant and expose `navigate_code` as a V5 `codexgpt` action alias that resolves to the already registered `semantic` handler. This preserves:

- exact direct-tool counts V1/V2/V3/V4/V5 `28/31/39/51/52`;
- all existing semantic/search names, operations, OAuth scopes, annotations, and rollback behavior;
- the P1 registration gateway and authorization -> workspace -> Policy -> approval -> execute -> audit -> render order;
- cached-supertool usability because `codexgpt` already accepts an open action string and args object;
- additive direct-tool discovery after a separately authorized App **Scan Tools** refresh.

The alias is V5-only. Earlier contract versions neither advertise nor resolve it.

## 3. Public navigation contract

The additive input is:

```json
{
  "operation": "navigate",
  "intent": "definition | references | implementation | text | file | diagnostics",
  "query": "WorkspaceManager",
  "path": "src",
  "max_results": 40,
  "workspace_id": "ws_..."
}
```

`query` is required except for diagnostics, where `path` is required. `path` is always workspace-relative and traverses the existing PathGuard.

The normalized result contains:

```json
{
  "intent": "definition",
  "query": "WorkspaceManager",
  "matches": [
    {
      "path": "src/guard.ts",
      "line": 120,
      "column": 14,
      "kind": "definition",
      "symbol": "WorkspaceManager",
      "preview": "export class WorkspaceManager"
    }
  ],
  "provider": "builtin-typescript",
  "quality": "semantic",
  "fallback": false,
  "truncated": false
}
```

`quality` is one of `semantic`, `lexical`, `lexical_fallback`, or `unavailable`. `provider`, `quality`, and `fallback` are mandatory. Results remain inside the existing strict semantic envelope, including state, result quality, returned count, omitted count, reason code, and next action.

## 4. Routing rules

### 4.1 Definition, references, implementation

Call the owned semantic manager first. `implementation` uses the provider's definition capability because the current owned engine has no separate implementation operation.

Return semantic locations when the provider reports a ready semantic result. Return disambiguation candidates as bounded candidate matches. Fall back to a fresh lexical search when:

- semantic is disabled, unsupported, unavailable, or cooling down;
- the owned worker crashes or times out;
- the source changes during analysis;
- a symbol lookup returns no semantic location;
- a non-TypeScript target produces the existing honest lexical fallback.

The fallback sets `provider` to the actual lexical backend (`ripgrep` or `node`), `quality` to `lexical_fallback`, `fallback` to true, and a stable reason code. It never claims definition/reference certainty.

### 4.2 Text

Use bounded lexical search directly. This is intentional lexical routing, so `quality=lexical` and `fallback=false`.

### 4.3 File

Use bounded PathGuard-scoped file enumeration and case-insensitive path/basename matching. This is file discovery, not content analysis. Provider is `builtin-file-index`, quality is lexical, and every result points to line 1.

### 4.4 Diagnostics

Use the owned semantic provider. If it is unavailable or unsupported, return `quality=unavailable`, `fallback=false`, no matches, and an actionable next step. Do not turn text matches into diagnostics.

## 5. Budgets and determinism

- Accept at most 200 results, reusing the semantic public ceiling.
- Lexical search remains subject to `config.maxSearchResults`, output byte limits, blocked globs, redaction, and ripgrep/Node fallback.
- File discovery scans at most 20,000 already authorized file paths and returns only the requested result limit.
- Preview text is redacted and capped at 400 characters.
- `truncated` is explicit. Exact omitted counts are reported only when known; an unknown lexical overflow remains represented by `truncated=true` without an invented count.
- Result order is provider order for semantic/search and stable lexical path order for file discovery.

## 6. Security and authority invariants

P3 is read-only navigation. It adds no root, path, filesystem, process, Git, mutation, provider-command, network, credential, or approval authority.

All direct and `navigate_code` supertool calls execute the registered `semantic` handler through the P1 ToolExecutionPipeline. Nested filesystem access keeps the established PathGuard and bounded-read/list/search seams. Provider paths outside the authorized project, stale identities, blocked paths, and revoked workspace capabilities continue to fail closed or degrade only to a fresh authorized lexical read.

No semantic rename behavior changes. `rename_preview` and `apply_patch` retain the Phase 7 same-handle, complete-project, preview-token, transaction, and audit contracts.

## 7. Acceptance

Automated fixtures cover:

- TypeScript definition and references;
- Python lexical fallback;
- mixed-repository path hints;
- semantic disabled/unavailable;
- worker crash/cooldown;
- stale source during analysis;
- diagnostics without false lexical certainty;
- large result truncation;
- file and text routing;
- V5 `navigate_code` alias and V1-V4 rejection;
- exact V1-V5 direct-tool counts and old semantic/search compatibility.

P3 closes locally only after focused tests, managed Node 20/24 ordinary, smoke, build, package, policy, diff, credential, documentation, and scope checks pass. The owner did not request a fresh ChatGPT Web run; Web efficiency fields therefore remain unscored and no tool-call reduction is claimed from unit/integration evidence.

No App refresh, deployment, publication, staging, commit, push, credential change, or external-state change is part of P3.

## 8. Closure evidence

STEP-537 closed this design on 2026-08-30. The managed Node 20.20.2/24.15.0 focused navigation/compatibility matrix passed 67/67 on each major. Detached ordinary run `2026-08-30T20-30-06-358Z-p3-final-ordinary-r2-35339e54` passed on both majors with fast 1235/1236 (one established platform skip), safe 299/300 (one established platform skip), and isolated 68/68. Detached smoke run `2026-08-30T20-48-47-747Z-p3-final-smoke-683b726e`, both managed builds, package dry-run, Policy, diff, credential, documentation, and scope gates passed. The stopped first ordinary run is retained as failed-attempt evidence for a Node 20 `tsx` duplicate-transform test-import order defect; the single-barrel correction reduced the affected contract from sustained multi-minute CPU use to a 1.6-second 4/4 pass.

No fresh ChatGPT Web trace was authorized. The Web efficiency fields remain unscored, and P4 plus every external-state action remains separately gated.
