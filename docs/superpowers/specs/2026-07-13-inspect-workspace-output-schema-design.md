# `inspect_workspace` Exact Output Schema Design

**Date:** 2026-07-13
**Phase:** Phase 1
**Slice:** 16
**Status:** Published as implementation `4cea9bd` / CI `29272546666`; publication record `1f39996` / CI `29273060702`; both Ubuntu/Windows Node 20/24 matrices passed

## 1. Goal

Migrate only the direct `inspect_workspace` MCP tool to the established Phase 1 schema-v1 result envelope with:

- an exact advertised `outputSchema`;
- strict nested repository-analysis data;
- stable redacted failures;
- one test-only analysis-provider boundary;
- exact path, coverage, count, cache, and warning invariants;
- focused contract tests;
- nested Tool Card compatibility with historical flat fallback;
- direct `codexpro` supertool compatibility;
- fail-closed migration of protected Smoke consumers;
- unchanged analysis-engine, cache, write-invalidation, authentication, and workspace-lifecycle semantics.

This slice stabilizes the existing built-in repository-analysis protocol. It does not add Serena or LSP support, redesign the analysis engine, change cache invalidation, add workspace lifecycle behavior, or begin Phase 2.

## 2. Why `inspect_workspace` is the recommended next tool

The first fifteen Phase 1 slices already stabilize the direct configuration, file, Git-read, change-review, Shell, workspace-open, workspace-snapshot, and workspace-list protocols. The remaining tools now divide into three broad groups:

1. the core repository-analysis result, `inspect_workspace`;
2. capability and Skill inventory tools such as `codexpro_inventory` and `load_skill`;
3. `.ai-bridge`, context-export, and handoff tools.

`inspect_workspace` is no longer the smallest remaining tool, but it is the highest-leverage remaining foundational result:

- direct `search` structured analysis consumes the same `WorkspaceAnalysis` model;
- `write`, `edit`, and `apply_patch` invalidate the same analysis cache;
- Tool Card rendering already has a dedicated analysis view;
- Smoke and Stress verify analysis limits, blocked-file exclusion, cache hits, and write invalidation through this tool;
- leaving it flat forces every dependent consumer to continue carrying legacy assumptions.

The previous Slice 15 design intentionally postponed `inspect_workspace` until the smaller workspace inventory contract was complete. That prerequisite is now satisfied. Migrating it independently is therefore the recommended next step.

## 3. Alternatives considered

### Approach A — Migrate direct `inspect_workspace` independently

Add one tool-owned schema module, one injectable provider boundary around the existing `inspectWorkspace()` call, strict provider validation, staged redacted failures, exact scoped-output construction, focused tests, and consumer migration.

**Advantages**

- Stabilizes the main repository-analysis contract before capability and handoff tools.
- Preserves the existing analysis engine and cache rather than redesigning them.
- Removes the largest remaining flat Tool Card result.
- Makes write/edit/patch cache-invalidation tests consume the current nested protocol.
- Keeps one independently reversible feature boundary.

**Disadvantages**

- The output is larger and has more invariants than prior slices.
- The handler must validate many path-bearing records and distinguish full-analysis coverage from scoped returned output.

**Decision:** Recommended and approved.

### Approach B — Migrate `codexpro_inventory` first

This is a smaller result and would stabilize Skill and MCP-server inventory.

**Rejected because:** Skill discovery, trust, source precedence, and manifest semantics belong to a later dedicated capability/Skills sequence. It has lower leverage on the existing core read/edit workflow than `inspect_workspace`.

### Approach C — Migrate `load_skill` or `.ai-bridge` tools first

These tools are useful and individually smaller.

**Rejected because:** they stabilize downstream workflow surfaces while the shared repository-analysis result remains legacy-flat. They should follow the core inspection contract.

### Approach D — Extract a shared analysis schema from `search` and redesign providers

This would deduplicate analysis coverage, cache, path, symbol, and relationship schemas and could prepare Serena/LSP providers.

**Rejected because:** it combines protocol migration with broad refactoring and Phase 7 semantic-provider design. Slice 16 must remain independently reversible and must not change direct `search`.

## 4. First-principles model

A reliable repository-inspection result must answer six questions.

1. **Which workspace was analyzed?**
   The exact opened workspace selected by the existing optional `workspace_id` behavior.

2. **Which scope is being returned?**
   A normalized workspace-relative path. The provider still analyzes the bounded workspace as a whole; the handler filters returned records to the requested scope.

3. **What was actually analyzed?**
   Full-workspace coverage, languages, project types, entrypoints, important files, areas, inventory files, symbols, and relationships generated by the existing built-in analysis engine.

4. **What was omitted from the response?**
   User-requested symbol/relationship omission, Tool Card caps, or explicit `max_*` output limits. These are represented by returned counts and `output_limited`; they do not rewrite the full analysis coverage.

5. **Was cached analysis reused?**
   The existing process-local cache reports `hit` and an opaque key. Successful writes, edits, and patches continue to invalidate it only when a validated operation reports a real change.

6. **How can failure be reported safely?**
   Workspace selection, path policy, provider execution, and provider/output validation are separate stages. No stage exposes raw exceptions, stack traces, absolute failed paths, malformed records, provider diagnostics, secrets, or blocked content.

The migration changes only the public result protocol and validation boundary. It does not change what the analysis engine discovers.

## 5. Existing behavior to preserve

The direct tool currently:

- is registered in standard and full tool modes when repository analysis is enabled;
- is absent in minimal mode;
- is absent when `CODEXPRO_ANALYSIS=0`;
- accepts optional `workspace_id` and retains the current default-workspace fallback;
- accepts an optional workspace-relative `path` used only to scope returned records;
- analyzes the bounded workspace through `inspectWorkspace(config, guard, workspace)`;
- resolves requested paths through `PathGuard`;
- treats the root scope as the entire workspace;
- permits a safe nonexistent relative scope and returns empty scoped arrays rather than introducing an existence check;
- applies server-config analysis limits before handler-level output limits;
- preserves provider order while filtering and slicing;
- uses fixed Tool Card caps of 120 files, 80 symbols, and 120 relationships;
- uses normal defaults of 300 files, 500 symbols, and 800 relationships;
- returns no symbols when `include_symbols=false`;
- returns no relationships when `include_relationships=false`;
- does not mark intentional omission by either include flag as output truncation;
- marks handler-level slicing through `output_limited` and a fixed warning;
- returns full-workspace coverage even when a narrower path is requested;
- reports process-local analysis-cache hit state and key;
- relies on `write`, `edit`, and `apply_patch` to invalidate that cache after real changes;
- returns a human-readable text summary;
- currently returns flat structured fields and has no exact `outputSchema`;
- currently lets uncaught workspace, path, analysis, and validation failures fall through the generic wrapper.

Slice 16 preserves these semantics except the flat result and generic failure surface. Blank or whitespace-only `path` values become the canonical root scope `.` in the structured result.

## 6. Scope

### 6.1 In scope

- Direct `inspect_workspace` only.
- Exact tool-owned schema-v1 envelope.
- Exact nested success data.
- Strict schemas for analysis files, areas, symbols, relationships, coverage, returned counts, and cache state.
- Exact provider workspace/root identity validation.
- Safe validation of every path-bearing provider record.
- Preservation of provider order.
- Full-workspace coverage with scoped returned records.
- Existing Tool Card and explicit `max_*` limits.
- Existing include-symbols/include-relationships behavior.
- Stable bounded analysis warnings.
- One injected `inspectWorkspaceProvider` boundary for tests.
- Five stable non-retryable failure codes.
- Nested Tool Card success/failure rendering with historical flat fallback.
- Direct `codexpro` supertool compatibility.
- Exact fail-closed in-memory migration of protected main-Smoke consumers.
- Direct migration of normal Stress and adjacent contract-test consumers.
- Focused, adjacent, complete, Build, analysis Smoke, HTTP Smoke, full Smoke, Stress, package, and diff verification.
- Design, plan, CHANGELOG, AGENTS map, `Memory.md`, and active Phase 1 archive records.

### 6.2 Out of scope

- `codexpro_inventory`, `load_skill`, `read_handoff`, `wait_for_handoff`, `codex_context`, Pro-context, or handoff tools.
- Direct `search` schema changes or shared-schema extraction.
- Analysis inventory, classifier, extractor, graph, cache, or provider redesign.
- New analysis languages, symbol kinds, relationship kinds, ranking, or heuristics.
- Serena, LSP, external semantic providers, rename, definitions, diagnostics, or references.
- Cache persistence, cache-key redesign, cache-size changes, or cross-process cache sharing.
- New filesystem existence checks for the requested scope.
- Workspace ownership, expiry, close, persistence, random IDs, or explicit-ID requirements.
- Authentication, OAuth, token, Host/Origin, Cloudflare, profile, credential, allowed-root, or path-policy changes.
- Dependency or lockfile changes.
- Direct edits to `scripts/smoke.mjs` or `scripts/http-smoke.mjs`.
- Broad `src/server.ts` refactoring.
- Phase 2, Phase 3, or Phase 7 work.

## 7. Exact success contract

The top-level result uses the established strict Phase 1 envelope:

```json
{
  "codexpro_tool": "inspect_workspace",
  "codexpro_title": "Inspect Workspace",
  "ok": true,
  "data": {
    "workspace_id": "ws_0123456789abcdef01234567",
    "root": "D:\\Dev\\project",
    "path": ".",
    "languages": ["typescript"],
    "project_types": ["node"],
    "entrypoints": ["src/index.ts"],
    "important_files": ["package.json", "README.md"],
    "areas": [
      { "path": "src", "role": "source", "files": 3 }
    ],
    "files": [
      {
        "path": "src/index.ts",
        "bytes": 120,
        "modifiedMs": 1783944000000,
        "language": "typescript",
        "role": "source",
        "generated": false,
        "entrypoint": true
      }
    ],
    "symbols": [
      {
        "name": "main",
        "kind": "function",
        "path": "src/index.ts",
        "line": 1,
        "exported": true,
        "confidence": "strong"
      }
    ],
    "relationships": [],
    "coverage": {
      "inventoryFiles": 3,
      "analyzedFiles": 2,
      "scannedBytes": 240,
      "symbolCount": 1,
      "relationshipCount": 0,
      "truncated": false,
      "warnings": []
    },
    "warnings": [],
    "output_limited": false,
    "returned": {
      "files": 1,
      "symbols": 1,
      "relationships": 0
    },
    "cache": {
      "hit": false,
      "key": "ws_0123456789abcdef01234567:opaque-fingerprint-and-limits"
    }
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 12,
    "warnings": []
  }
}
```

The historical flat `schema_version` field is removed. Schema version ownership belongs only to `meta.schemaVersion`.

### 7.1 Exact top-level data fields

Success data contains exactly these sixteen fields:

```text
workspace_id
root
path
languages
project_types
entrypoints
important_files
areas
files
symbols
relationships
coverage
warnings
output_limited
returned
cache
```

No field is duplicated at the envelope top level.

### 7.2 Analysis language enum

```text
typescript
javascript
python
go
rust
swift
java
csharp
c
cpp
json
yaml
toml
markdown
shell
unknown
```

`data.languages` remains the provider's ordered unique list and normally excludes `unknown`, matching the built-in engine. Each file may still use `unknown`.

### 7.3 File-role enum

```text
source
test
config
docs
generated
infrastructure
other
```

### 7.4 Analysis file

Each `files` item contains exactly:

```json
{
  "path": "src/index.ts",
  "bytes": 120,
  "modifiedMs": 1783944000000,
  "language": "typescript",
  "role": "source",
  "generated": false,
  "entrypoint": true
}
```

Rules:

- `path` is a normalized safe workspace-relative file path;
- paths are unique in the full provider inventory;
- `bytes` is a non-negative integer;
- `modifiedMs` is a finite non-negative number because filesystem timestamps may contain fractional milliseconds;
- `language` and `role` use the exact enums;
- `generated` and `entrypoint` are booleans.

### 7.5 Analysis area

Each `areas` item contains exactly:

```json
{
  "path": "src",
  "role": "source",
  "files": 3
}
```

Rules:

- `path` is `.` or a normalized safe workspace-relative area path;
- area paths are unique;
- `files` is a positive integer;
- full provider area counts sum to `coverage.inventoryFiles`;
- scoped output preserves the existing parent-area behavior and does not recalculate area counts.

### 7.6 Analysis symbol

Each `symbols` item contains exactly:

```json
{
  "name": "main",
  "kind": "function",
  "path": "src/index.ts",
  "line": 1,
  "exported": true,
  "confidence": "strong"
}
```

Symbol kinds:

```text
function
class
interface
enum
struct
trait
protocol
type
variable
```

Confidence values:

```text
exact
strong
inferred
```

Rules:

- `name` is non-empty;
- `path` is a normalized safe workspace-relative path present in the full file inventory;
- `line` is a positive integer;
- `exported` is boolean.

### 7.7 Analysis relationship

Each `relationships` item contains exactly:

```json
{
  "from": "src/index.ts",
  "to": "src/service.ts",
  "kind": "imports",
  "confidence": "strong",
  "source": "built-in import extraction"
}
```

Relationship kinds:

```text
imports
references
tests
package
```

Rules:

- `from` and `to` are normalized safe workspace-relative paths present in the full file inventory;
- `source` is a bounded, non-empty, single-line label, not a raw diagnostic;
- handler scoping preserves a relationship when either endpoint is in scope.

### 7.8 Coverage

Coverage contains exactly:

```json
{
  "inventoryFiles": 3,
  "analyzedFiles": 2,
  "scannedBytes": 240,
  "symbolCount": 1,
  "relationshipCount": 0,
  "truncated": false,
  "warnings": []
}
```

Invariants:

- all counts are non-negative integers;
- `analyzedFiles <= inventoryFiles`;
- `inventoryFiles` equals the full provider `files.length`;
- `symbolCount` equals the full provider `symbols.length`;
- `relationshipCount` equals the full provider `relationships.length`;
- `coverage.warnings` exactly equals the full provider warning list;
- coverage remains full-workspace coverage after path filtering and output slicing;
- `coverage.truncated` describes analysis collection limits, not handler response limits.

### 7.9 Warnings

Provider warnings are limited to the existing bounded built-in forms:

```text
Inventory truncated at <N> files.
Source analysis reached its file or byte limit.
Symbol extraction reached its configured limit.
Skipped <N> source file(s) that changed or became unreadable during analysis.
```

The handler may append exactly one additional warning:

```text
Structured output was limited. Use path or max_* arguments to request a narrower or larger result.
```

Rules:

- `coverage.warnings` contains provider coverage warnings only;
- `data.warnings` contains the same provider warnings plus the output-limit warning when applicable;
- `meta.warnings` remains empty because these are primary domain results, not optional-provider degradation;
- unknown provider diagnostics are rejected as malformed internal output rather than reflected publicly;
- warnings never contain absolute paths, stack traces, exception names, or secrets.

### 7.10 Returned counts and response limits

`returned` contains exactly:

```json
{
  "files": 1,
  "symbols": 1,
  "relationships": 0
}
```

Each count equals the corresponding returned array length.

Normal default response caps remain:

```text
files: 300
symbols: 500
relationships: 800
```

Tool Card response caps remain:

```text
files: 120
symbols: 80
relationships: 120
```

`output_limited=true` only when an included result collection was sliced below its scoped size. Setting `include_symbols=false` or `include_relationships=false` intentionally omits that collection and does not by itself set `output_limited=true`.

### 7.11 Cache

Cache contains exactly:

```json
{
  "hit": false,
  "key": "opaque-non-empty-cache-key"
}
```

Rules:

- `hit` is boolean;
- `key` is a bounded non-empty string;
- the key remains opaque to clients;
- the slice does not change cache-key construction, LRU size, persistence, or invalidation;
- first uncached analysis reports `hit=false` and an identical repeated analysis may report `hit=true`;
- successful changed `write`, `edit`, and `apply_patch` operations continue to invalidate the workspace cache.

## 8. Provider contract and validation boundary

Add one optional test-only dependency:

```ts
inspectWorkspaceProvider?: (input: {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
}) => WorkspaceAnalysis | Promise<WorkspaceAnalysis>;
```

Production default:

```ts
({ config, guard, workspace }) => inspectWorkspace(config, guard, workspace)
```

The provider receives the full workspace, not the requested scope. This preserves full-workspace caching and keeps path filtering in the direct handler.

Provider output validation must occur before scope filtering:

1. parse the complete strict provider shape;
2. require `schemaVersion === 1`;
3. require `workspaceId === workspace.id`;
4. require `root === workspace.root`;
5. require a lowercase 64-character SHA-256 `fingerprint`;
6. validate all path-bearing values through `PathGuard` and require normalized path equality;
7. require entrypoints and important files to exist in the full file inventory;
8. require symbol and relationship paths to exist in the full file inventory;
9. require unique file and area paths;
10. require coverage counts and warnings to match the full provider arrays;
11. require area counts to cover the full inventory exactly;
12. reject unknown fields and unknown warning forms.

The provider-only `fingerprint`, `schemaVersion`, and duplicate `workspaceId`/`root` fields are validation inputs. They are not copied into success data except through the public `workspace_id` and `root` fields.

No production test mode, hidden MCP argument, environment switch, or global mutable fixture is added.

## 9. Input and scope semantics

The handler resolves inputs in this order:

1. acquire the workspace with existing optional-ID fallback;
2. normalize `path`:
   - omitted, empty, or whitespace-only becomes `.`;
   - otherwise preserve the caller text for policy classification and resolve it once;
3. resolve through `PathGuard`;
4. convert the resolved path to canonical workspace-relative `/` form;
5. call the full-workspace analysis provider;
6. validate provider output;
7. filter and slice returned records.

Scope predicates remain:

```ts
const inScope = (filePath: string) =>
  scopePath === "." ||
  filePath === scopePath ||
  filePath.startsWith(`${scopePath}/`);

const areaInScope = (areaPath: string) =>
  scopePath === "." ||
  areaPath === "." ||
  inScope(areaPath) ||
  scopePath.startsWith(`${areaPath}/`);
```

A safe nonexistent relative path remains valid and produces empty scoped arrays with full-workspace coverage. Slice 16 does not introduce `FILE_NOT_FOUND` for scope selection.

## 10. Exact failure contract

All failures use the strict Phase 1 envelope:

```json
{
  "codexpro_tool": "inspect_workspace",
  "codexpro_title": "Inspect Workspace",
  "ok": false,
  "data": null,
  "error": {
    "code": "ANALYSIS_FAILED",
    "message": "The workspace analysis could not be completed.",
    "retryable": false,
    "details": {}
  },
  "meta": {
    "schemaVersion": 1,
    "durationMs": 4,
    "warnings": []
  }
}
```

### 10.1 Approved error codes

| Code | Message | Details | Stage |
|---|---|---|---|
| `WORKSPACE_NOT_FOUND` | `The requested workspace is not available. Open the workspace before retrying.` | `{ workspace_id }` | workspace selection |
| `PATH_OUTSIDE_WORKSPACE` | `The requested analysis path is outside the permitted workspace boundary.` | `{ path }` | path resolution/policy |
| `PATH_BLOCKED` | `The requested analysis path is blocked by safety rules.` | `{ path }` | blocked-path policy |
| `ANALYSIS_FAILED` | `The workspace analysis could not be completed.` | `{}` | provider throw/rejection |
| `INTERNAL_ERROR` | `The workspace analysis failed because of an internal error.` | `{}` | malformed provider/output or unexpected internal failure |

All five errors are non-retryable in the public contract because the handler cannot reliably distinguish permanent from transient provider failures.

### 10.2 Safe details

- `workspace_id` is trimmed, bounded to 160 characters, and replaced with a fixed omission marker if malformed.
- `path` is workspace-relative, bounded to 240 characters, and replaced with `[unsafe path omitted]` when it is absolute, device-like, UNC, drive-qualified, ADS-like, contains unsafe segments, or otherwise unsuitable for public details.
- Empty-detail failures contain exactly `{}`.
- No error detail contains the allowed-root list, canonical root from failed data, provider output, exception text, stack, cache key, fingerprint, file content, token, or secret-looking value.

### 10.3 Failure staging

1. Workspace acquisition failure is classified before path handling.
2. Path resolution failure is classified before provider invocation.
3. Provider throw or rejected promise becomes `ANALYSIS_FAILED`.
4. Strict provider validation, scope construction, data construction, or schema construction failure becomes `INTERNAL_ERROR`.
5. Generic tool-wrapper exceptions must not escape these stages.

`ANALYSIS_DISABLED` is not a direct failure code because the tool remains unregistered when analysis is disabled.

## 11. Tool registration and modes

Preserve:

- title `Inspect Workspace`;
- read-only annotations;
- existing Tool Card metadata;
- standard/full registration when analysis is enabled;
- absence in minimal mode;
- absence when analysis is disabled;
- the existing input schema and numeric bounds.

Add only:

```ts
outputSchema: inspectWorkspaceOutputShape
```

No input field is renamed or removed.

## 12. Tool Card and consumer compatibility

### 12.1 Tool Card

Add one nested-first normalizer:

```js
function inspectWorkspaceResultData(data) {
  const nested =
    data?.codexpro_tool === "inspect_workspace" &&
    data?.data &&
    typeof data.data === "object";
  return nested ? data.data : (data ?? {});
}
```

Use it in:

- `subtitleFor`;
- `renderWorkspaceAnalysis`.

Behavior:

- current nested success renders coverage, projects, languages, entrypoints, areas, symbols, relationships, and warnings;
- nested failure renders the fixed error code/message rather than an empty analysis card;
- historical saved flat results continue to render;
- current success does not use flat fallbacks before nested data.

### 12.2 Direct `codexpro` supertool

The direct action must preserve:

- child identity `inspect_workspace`;
- child title `Inspect Workspace`;
- exact nested envelope;
- exact failure envelope;
- no flattening or duplicate fields.

### 12.3 Protected main Smoke

Do not edit `scripts/smoke.mjs` directly. Extend `scripts/smoke-platform-compat.mjs` with exact-count, fail-closed in-memory replacements for the known flat `inspect_workspace` accesses. Source drift must fail before executing transformed code, and transformed source must never be written to disk.

### 12.4 Normal consumers

Update normal, non-protected consumers directly:

- `scripts/stress.mjs` reads `structuredContent.data`;
- write/edit/apply-patch cache-invalidation contract tests read `structuredContent.data.cache` and `structuredContent.data.files`.

No historical fallback is needed in active tests or Stress.

## 13. Test strategy

Create `test/inspect-workspace-contract.test.mjs` and cover five layers.

### 13.1 Pure schema and constructor tests

- required exports exist;
- exact success and failure keys;
- exact data and nested-record keys;
- exact identity, title, meta, messages, details, and retryability;
- removal of flat fields and `schema_version`;
- rejection of extra fields;
- all enum and numeric constraints;
- warning whitelist and output-limit warning consistency;
- returned-count equality;
- coverage-count equality;
- cache shape;
- success/failure nullability invariants.

### 13.2 Real-provider behavior

- descriptor advertises exact `outputSchema`;
- standard/full registration and minimal/analysis-disabled absence;
- root-scope success;
- normalized blank path;
- directory scope;
- file scope;
- safe nonexistent scope;
- include-symbols false;
- include-relationships false;
- explicit `max_*` slicing;
- Tool Card caps;
- full coverage remains unchanged after scoping;
- first miss and repeated cache hit;
- blocked files remain absent.

### 13.3 Injected-provider behavior

- provider receives exact config, guard, and workspace;
- provider is called once and before output filtering;
- provider order is preserved;
- workspace/root mismatch fails internally;
- malformed file, area, symbol, relationship, coverage, warning, fingerprint, or cache fails internally;
- unsafe or blocked returned paths fail internally without leaking them;
- provider throw and rejection become `ANALYSIS_FAILED`;
- malformed-provider diagnostics never appear publicly.

### 13.4 Public failure classification

- unknown workspace;
- outside path;
- blocked path;
- unsafe Windows path forms;
- provider execution failure;
- internal validation failure;
- fixed redacted text and details.

### 13.5 Consumers and adjacent behavior

- nested Tool Card success;
- nested Tool Card failure;
- historical flat Tool Card fallback;
- direct supertool success/failure;
- fail-closed protected Smoke replacement;
- Stress analysis limits;
- write/edit/apply-patch cache invalidation;
- direct structured `search` remains unchanged.

## 14. Files and responsibilities

### New files

- `src/tools/schemas/inspectWorkspace.ts` — exact public and provider-facing schemas, warning rules, constructors, and types for direct `inspect_workspace`.
- `test/inspect-workspace-contract.test.mjs` — focused pure, handler, failure, consumer, and compatibility contracts.

### Modified production files

- `src/server.ts` — schema import, provider dependency, provider validation, failure classification, output descriptor, and staged handler.
- `src/toolCardWidget.ts` — nested-first analysis normalizer and failure-aware renderer.
- `scripts/smoke-platform-compat.mjs` — exact fail-closed in-memory migration of protected main-Smoke accesses.
- `scripts/stress.mjs` — current nested analysis result reads.

### Modified adjacent tests

- `test/write-contract.test.mjs` — nested cache/file reads.
- `test/edit-contract.test.mjs` — nested cache reads.
- `test/apply-patch-contract.test.mjs` — nested cache reads.

### Modified durable records after implementation

- `CHANGELOG.md`.
- `AGENTS.md`.
- `Memory.md`.
- active Phase 1 archive.
- this design document.
- the Slice 16 implementation plan.

No other file is in the planned change set unless an implementation-time failing test proves a directly related consumer was missed.

## 15. Verification strategy

Narrow-first verification:

```text
node --test test/inspect-workspace-contract.test.mjs
```

Adjacent analysis and cache consumers:

```text
node --test test/inspect-workspace-contract.test.mjs test/search-contract.test.mjs test/show-changes-contract.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs test/apply-patch-contract.test.mjs
```

Complete local gates:

```text
node --test test/*.test.mjs
npm run build
npm run analysis:smoke
npm run analysis:cli-smoke
node scripts/http-smoke-compat.mjs
npm run smoke
npm run stress
npm pack --dry-run
git diff --check
```

Final review uses `show_changes(include_diff=true)` rather than Shell-based Git inspection.

Publication remains separately approval-gated and requires exact-head Ubuntu/Windows Node 20/24 CI.

## 16. Risks and mitigations

### Risk: scope filtering is confused with analysis coverage

**Mitigation:** coverage remains explicitly full-workspace; `returned` and `output_limited` describe only the response after scope and caps.

### Risk: provider warnings leak diagnostics

**Mitigation:** accept only the existing bounded warning forms and one handler-owned output-limit warning.

### Risk: path-bearing internal output escapes workspace policy

**Mitigation:** validate every provider path through `PathGuard`, require normalized equality, and require symbol/relationship targets to exist in the validated full file inventory.

### Risk: strict provider invariants reject valid current output

**Mitigation:** establish focused real-provider fixtures before handler migration and verify each invariant against Linux and native Windows.

### Risk: protected Smoke source drift

**Mitigation:** use exact-count fail-closed in-memory replacements; do not edit or persist transformed protected source.

### Risk: cache behavior changes accidentally

**Mitigation:** the provider still analyzes the full workspace; no cache module changes are allowed; existing write/edit/patch invalidation tests are migrated and retained.

### Risk: schema size encourages broad refactoring

**Mitigation:** keep the schema tool-owned, reuse only established `common.ts`, and defer shared analysis extraction until a separate approved slice.

## 17. Rollback

Before publication, remove the new focused test and schema module and revert only the exact Slice 16 changes in:

```text
src/server.ts
src/toolCardWidget.ts
scripts/smoke-platform-compat.mjs
scripts/stress.mjs
test/write-contract.test.mjs
test/edit-contract.test.mjs
test/apply-patch-contract.test.mjs
CHANGELOG.md
AGENTS.md
Memory.md
active Phase 1 archive
Slice 16 design and plan
```

Do not alter the analysis engine, cache, credentials, profiles, protected Smoke sources, prior Phase 1 schemas, or published commits.

After publication, use a normal revert commit. Do not reset or rewrite `main`.

## 18. Acceptance criteria

Slice 16 is locally complete only when all of the following are true:

- direct `inspect_workspace` advertises an exact `outputSchema`;
- success and every failure validate against the strict tool-owned schema;
- success data has exactly the sixteen approved fields;
- no flat current data fields or `schema_version` remain;
- provider identity, path, warning, coverage, count, and cache invariants are validated;
- full-workspace coverage and scoped returned output are unambiguous;
- Tool Card and explicit limits preserve current behavior;
- include flags do not falsely mark output truncation;
- five stable failures expose no raw diagnostics;
- Tool Card is nested-first and retains historical flat fallback;
- direct supertool preserves the exact child envelope;
- protected Smoke sources remain unchanged;
- normal Stress and cache-invalidation consumers use nested data;
- focused, adjacent, complete, Build, analysis Smoke, HTTP Smoke, full Smoke, Stress, package, and diff gates pass;
- no dependency, auth, Cloudflare, profile, allowed-root, path-policy, cache-engine, semantic-provider, workspace-lifecycle, or Phase 2 behavior changes;
- `Memory.md` and the active Phase 1 archive contain exact verification evidence;
- staging, commit, push, and CI occur only after explicit publication approval.

## 19. Final decisions

- Phase 1 Slice 16 is direct `inspect_workspace`.
- Use one tool-owned schema rather than shared analysis extraction.
- Preserve the full built-in analysis engine and cache semantics.
- Normalize blank scope to `.` and preserve safe nonexistent-scope success.
- Keep full coverage separate from scoped/capped returned records.
- Keep domain warnings in `data`, not `meta`.
- Reject unknown provider warning forms rather than reflecting diagnostics.
- Use five fixed non-retryable failures.
- Keep the tool standard/full and analysis-enabled only.
- Keep protected Smoke sources unchanged.
- Keep Phase 2 and semantic-provider expansion closed.
