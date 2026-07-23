# Phase 7 Semantic Providers Usability Design

**Status:** design complete after execution, security/compatibility, and UX adversarial review; runtime implementation, dependency changes, staging, commit, push, publication, and deployment are not authorized by this document

**Date:** 2026-07-23

**Supersedes:** the generic Phase 7 semantic-provider outline in the master plan

**Scope:** make definitions, references, diagnostics, and repository-wide rename preview useful from the normal ChatGPT flow while preserving the existing workspace, path, mutation, and audit boundaries

**Compatibility baseline:** closed Phases 1–6; Phase 6 closure head `31631676fe254962a9a4f14d6e025e3edba82b8d` passed exact-head run `30033293444`; Tool Contracts V1=28/V2=31/V3=39/V4=51; per-server workspace lifecycle; PathGuard; Policy/Approval/Audit; Phase 3 atomic transactions; supported public entry `scripts/codexgpt-entry.mjs`

## 1. Decision

Phase 7 is a semantic-navigation and safe-refactoring phase. Its first success must not depend on Python, `uv`, a language server, a dashboard, a project script, or a manual Provider configuration.

The completed normal flow is:

```text
User asks where a symbol is defined, what uses it, why a file is invalid,
or requests a rename
  -> ChatGPT calls one typed semantic tool with a symbol name or exact position
  -> the server selects a bounded capability for that language
  -> every source snapshot is opened through the workspace path boundary
  -> definition/reference/diagnostic results return repository-relative locations
  -> rename returns a server-bound preview, affected files, digest, and bounded diff
  -> user or model applies that exact preview through apply_patch
  -> the server revalidates every snapshot and commits one Phase 3 transaction
  -> existing change-set, undo, audit, and verification behavior remains intact
```

Phase 7 makes these final design choices:

1. **The default `builtin` Provider becomes genuinely semantic for JavaScript and TypeScript.** It uses a pinned production TypeScript compiler API in a constrained, terminable Node worker over a virtual host. Other languages retain the current lexical analysis as an honest fallback.
2. **One public `semantic` tool is added, not a tool per operation.** Tool Contract V5 has exactly 52 tools: V4 plus one read-only tool with strict operations `definition`, `references`, `diagnostics`, and `rename_preview`.
3. **Rename is preview-then-apply.** CodexGPT never invokes or accepts a Provider protocol-level mutation. `rename_preview` creates a server-owned, session-bound preview; V5 `apply_patch` accepts that opaque preview token and routes the already reviewed text batch through the existing Phase 3 atomic mutation engine. Optional same-user child processes still have no filesystem isolation.
4. **Serena is optional retrieval breadth, not the rename authority.** Its adapter may use definition, reference, symbol, and diagnostic capabilities. It must not expose or call Serena's mutating `rename_symbol`, file, shell, memory, activation, or project-switch tools.
5. **A direct LSP adapter is a demand-driven advanced extension, not a core deliverable.** If a concrete language need remains after builtin and Serena, it implements a narrow protocol subset and converts `WorkspaceEdit` into a non-mutating preview. It never advertises or accepts server-initiated file mutation or command execution.
6. **External Provider startup is a local operator action.** A remote MCP request cannot choose an executable, arguments, environment, package version, download, project root, or network endpoint.
7. **Semantic failure is degradable.** Workspace open, ordinary search, read, and mutation tools stay usable when a Provider is missing, slow, unhealthy, or unsupported. Fallback is per capability and is disclosed; an unsafe lexical rename is never invented.
8. **No isolation claim is added.** The builtin worker and external Provider processes run with the current user's authority. Path normalization constrains what CodexGPT accepts and returns; it does not turn ambient `full_access`, a worker, or a same-user child into an OS sandbox. External status reports `execution_isolation: none`, `filesystem_isolation: none`, and `network_isolation: none` unless future OS controls prove otherwise.
9. **Phase 7 Core closes before optional Provider extensions.** Builtin JS/TS, V5, rename, health, docs, live ChatGPT, and exact-head closure form Phase 7 Core. Serena is a separately authorized Phase 7B extension; direct LSP is Phase 7C and begins only for a demonstrated language need.

### Why and user impact

| Decision | Why | User impact |
| --- | --- | --- |
| Ship zero-setup JS/TS semantics first | This repository and the primary workflow are TypeScript/JavaScript; requiring another runtime makes the default path brittle | Definitions, references, diagnostics, and rename work after an ordinary restart |
| Keep lexical fallback for unsupported languages | Partial understanding is still useful when labeled correctly | Search remains available instead of failing the whole workspace |
| Add one `semantic` tool | Four separate tools increase discovery and prompt cost without adding authority separation | ChatGPT has one obvious place for semantic questions |
| Use a preview token for rename | Copying a large patch through the model loses snapshot identity and creates race windows | The user reviews once and applies the exact bounded plan atomically |
| Reuse `apply_patch` and Phase 3 | Mutation policy, approvals, change sets, undo, locks, and audit already exist | Rename behaves like other edits instead of creating a second write system |
| Keep the Serena adapter retrieval-only | Serena is broad and convenient, but its rename tool writes directly and its process has ambient user authority | CodexGPT never calls that mutation path; users still receive an honest no-isolation warning |
| Run external setup locally and pin identities | Remote-selected commands or on-demand downloads turn analysis into arbitrary execution | Connecting ChatGPT cannot silently install or launch arbitrary software |
| Return typed degradation reasons | A generic “provider failed” gives no recovery path | The result tells the user whether to retry, configure a Provider, or continue with builtin |

## 2. Required user experience

### 2.1 Zero-setup first success

For a standard-profile JavaScript or TypeScript workspace, the user can ask:

- “`startWorkerLeaseRenewal` 在哪里定义？”
- “哪些地方调用了 `prepareWorkspaceTextBatch`？”
- “这个文件现在有什么 TypeScript 错误？”
- “把 `oldName` 重命名成 `newName`，先给我看影响。”

The system must answer without asking for a Provider name, project type, `tsconfig` path, package installation, shell permission, full-access profile, or a path/line/column the user did not provide. The public locator accepts either an exact position or a symbol name with an optional path hint. A name is auto-resolved only when exactly one semantic candidate exists; ambiguity returns bounded candidates and `needs_disambiguation` without guessing.

For a rename:

1. `semantic(operation="rename_preview", ...)` returns a bounded summary, a diff preview, every affected repository-relative path, edit counts, one manifest digest, omitted-result counts, and an opaque machine-use `preview_id`; exact hashes and identities remain in the server-owned manifest.
2. The response explains one next action: review and apply, cancel, or request a fresh preview after a typed `too_large` failure. It never suggests an unsupported partial rename.
3. V5 `apply_patch(semantic_preview_id=...)` applies only that exact plan.
4. A changed file, expired token, changed workspace policy, lost transport session, changed Provider generation, or closed workspace rejects the apply and asks for a fresh preview.
5. Success returns the ordinary transaction/change-set result so the existing review, undo, and verification flow remains familiar.
6. If the user asks to “先看影响,” ChatGPT stops after preview. If the user explicitly asks to complete the rename, ChatGPT may validate the complete preview and call `apply_patch` in the same turn; only the existing mutation policy decides whether another approval is required. Preview creation itself is never approval.

### 2.2 Optional Provider setup

An operator who needs broader language coverage uses one local setup action, not ChatGPT:

```powershell
codexgpt semantic setup serena
```

`setup` performs the approved preflight, managed install/registration, selection, probe, and rollback recording, then says only whether one restart is needed. Public startup never auto-downloads a Provider. `codexgpt semantic status` is the troubleshooting path; its default view reports capabilities, health, and one recovery action, while `--verbose` additionally reports:

- configured Provider;
- actual Provider and capability matrix;
- fixed executable identity and version, without credential-bearing arguments;
- workspace/language support;
- health and last safe reason code;
- whether runtime is offline, network-capable, or unknown;
- the exact one-step recovery action.

JS/TS always routes to the faster builtin engine. An enabled external Provider fills unsupported languages/capabilities instead of replacing builtin globally. `codexgpt semantic use builtin` is the one-restart rollback. `semanticProvider=none` disables semantic calls without disabling existing lexical search.

### 2.3 Actionable degradation

Provider failure must not block workspace open. A semantic result uses one of these stable states:

| State | Meaning | User action |
| --- | --- | --- |
| `ready` | Selected capability answered | Continue |
| `fallback` | Selected Provider failed or lacked the capability; builtin answered | Continue, or run local status for broader coverage |
| `unsupported` | No safe Provider supports this operation/language | Configure an optional Provider or use text search |
| `cooldown` | Repeated timeout/crash opened the circuit | Continue with builtin; retry after `retry_after_ms` |
| `unavailable` | Configured executable/version/project is absent or invalid | Run the exact local setup/status action |
| `stale_preview` | Rename inputs or binding changed | Request a fresh preview |

Every response also includes `result_quality: semantic | lexical`, a stable `next_action`, and `retry_after_ms` when applicable. Raw stderr, absolute home paths, environment values, tokens, and Provider-internal traces are never returned to ChatGPT.

## 3. Scope and non-goals

### 3.1 In scope

- definition lookup;
- reference lookup;
- diagnostics for exactly one file in Phase 7 Core;
- rename preparation and text-edit preview;
- JavaScript/TypeScript owned-worker semantic support;
- honest lexical fallback;
- optional Serena retrieval adapter;
- demand-driven direct stdio LSP extension;
- per-server Provider lifecycle and health;
- V5 tool projection and exact V1–V4 compatibility;
- local CLI setup/status/use/disable experience;
- PathGuard normalization, bounded output, Policy/Audit integration;
- Phase 3 atomic apply, change set, undo, and verification.

### 3.2 Explicitly out of scope

- code completion, hover, signature help, formatting, code actions, or arbitrary LSP requests;
- arbitrary caller-selected Provider commands or endpoints;
- automatic workspace package installation;
- running `tsconfig` plugins, project scripts, build tools, or Serena memories;
- Provider-created, renamed, or deleted files;
- applying LSP `workspace/applyEdit`, `workspace/executeCommand`, or resource operations;
- remote LSP/TCP/WebSocket servers;
- semantic indexing outside an explicitly authorized workspace;
- workspace-wide diagnostics or persistent cross-restart rename previews;
- OAuth owner identity or a new approval system;
- claiming external processes are sandboxed;
- Phase 8 or Phase 9 work.

## 4. Activation, compatibility, and configuration

### 4.1 Tool Contract V5

V5 is additive:

```text
V1 = 28
V2 = 31
V3 = 39
V4 = 51
V5 = 52
```

V5 inherits the exact V4 tool set and behavior, with:

- one `semantic` tool;
- one additional mutually exclusive `semantic_preview_id` branch in `apply_patch`.

V1–V4 request schemas, result schemas, names, counts, annotations, registration order, and profile projections remain byte-for-byte compatible. A client frozen on V4 keeps the old `apply_patch` schema and cannot apply a semantic preview. `minimal` and the connection-test surface do not expose `semantic`; `standard` and `full` do. `close_workspace` remains hidden from the read-only connection-test surface.

The phase uses an explicit standard flag before activation:

```text
CODEXGPT_SEMANTIC_MODE=legacy | standard
```

- omitted and `legacy`: exact V1–V4 behavior, no V5 advertisement;
- explicit `standard`: V5 and semantic runtime are active during the gated rollout;
- omitted may become `standard` only after Phase 7 Core live, compatibility, local, publication, and exact-head gates pass;
- explicit `legacy` remains the one-restart rollback for one migration period.

V5 is not only a catalog edit. The implementation must migrate every closed-world contract boundary in configuration, HTTP/stdio, production composition, Policy/Approval, process, Git bootstrap, inventory/doctor, and the `codexgpt` supertool. Shared `contractIncludesV2/V3/V4/V5` predicates replace accidental `=== 4` tests where inheritance is intended. V5 mutation continues to persist the existing Phase 3 transaction/change-set contract version; it does not rewrite historical persistence, audit, Git, or resource fingerprints to version 5. Legacy mode must not read semantic registrations, start a Provider, initialize TypeScript, or change startup/doctor instructions.

`CODEXGPT_SEMANTIC_MODE=standard` has one documented mapping to `CODEXGPT_TOOL_CONTRACT_VERSION=5`; contradictory explicit values fail closed. The closed-world `codexgpt` supertool receives a typed semantic action in V5 and delegates to the same handler; it is required for cached-client compatibility, not optional.

### 4.2 Persistent selector

The workspace/profile setting is:

```ts
type SemanticProviderSelection = "builtin" | "serena" | "lsp" | "none";
```

Default: `builtin`.

The selector chooses intent, not authority. It cannot widen `allowedRoots`, bypass blocked paths, activate full access, change a tool profile, install a program, select a remote endpoint, or authorize a mutation.

Advanced LSP registration lives in local application state and contains only a locally approved fixed record:

```ts
interface LspRegistration {
  id: string;
  languages: string[];
  managedManifestId: string;
  runtimeRealPath: string;
  runtimeIdentity: StableExecutableIdentity;
  entrypointRealPath: string;
  entrypointIdentity: StableFileIdentity;
  dependencyTreeDigest: string;
  argv: readonly string[];
  version: string;
  positionEncodings: readonly ("utf-8" | "utf-16" | "utf-32")[];
  environmentPolicy: "bounded";
}
```

The managed manifest also binds package/lock or wheel/tarball integrity and the exact dependency tree. Every launch same-handle verifies the runtime and entrypoint identity/digest; PATH lookup, mutable `.cmd` shims, and unverified cache entrypoints are forbidden. The public API accepts only the registration `id`; it never accepts `command`, `args`, `cwd`, `env`, URI, or network address.

## 5. Provider kernel

### 5.1 Per-server ownership

Replace the process-global registry in `src/analysis/providers.ts` with one `SemanticProviderManager` owned by each MCP server lifecycle domain. It is bound to that server's `WorkspaceManager`, PathGuard configuration, policy revision, transport session, process supervisor, preview store, and audit sink.

This prevents:

- Provider instances leaking across server tests or users;
- a preview created in one transport from being consumed in another;
- a process or cache surviving workspace closure accidentally;
- global registration order changing capability selection.

`WorkspaceManager` gains one internal asynchronous `onWorkspaceRevoked({ id, key, reason })` notification emitted from the single private revocation boundary for explicit close, expiry, policy-revision change, and transport-wide revoke. The semantic manager subscribes before accepting work. Revocation cancels in-flight work, evicts snapshots/previews, and releases only that Provider project session; HTTP/stdio transport close waits for or records the bounded disposal result. Server shutdown terminates only exact owned Provider processes. A disposal failure cannot resurrect a handle and is reported locally without leaking workspace identity.

### 5.2 Capability contract

The internal contract is typed and smaller than LSP or Serena:

```ts
type SemanticCapability =
  | "definition"
  | "references"
  | "diagnostics"
  | "rename_preview";

interface SemanticProvider {
  readonly id: "builtin" | "serena" | "lsp";
  probe(context: ProbeContext): Promise<ProviderProbe>;
  definition?(request: PositionRequest): Promise<LocationResult>;
  references?(request: ReferenceRequest): Promise<LocationResult>;
  diagnostics?(request: DiagnosticRequest): Promise<DiagnosticResult>;
  renamePreview?(request: RenameRequest): Promise<ProviderWorkspaceEdit>;
  disposeWorkspace(workspaceKey: string): Promise<void>;
  dispose(): Promise<void>;
}
```

Every request includes server-resolved workspace identity, a normalized repository-relative file, an exact source snapshot, a bounded cancellation/deadline, requested language, and current policy revision. A remote caller's raw absolute path is never forwarded. When an external protocol requires `rootUri`, `cwd`, or a document URI, the adapter derives the canonical absolute fact from the already authorized workspace and never returns it to ChatGPT.

Every response includes:

```ts
interface SemanticEnvelope<T> {
  requested_provider: SemanticProviderSelection;
  actual_provider: "builtin-typescript" | "builtin-lexical" | "serena" | "lsp" | "none";
  state: "ready" | "fallback" | "unsupported" | "cooldown" | "unavailable";
  capability: SemanticCapability;
  language: string;
  partial: boolean;
  omitted_count: number;
  result_quality: "semantic" | "lexical";
  next_action: SafeSemanticNextAction;
  reason_code?: SafeSemanticReason;
  retry_after_ms?: number;
  result: T;
}
```

Unknown fields from an external Provider are discarded. Missing required fields, invalid ranges, duplicate/overlapping edits, non-file URIs, or unbounded result sets fail the operation; they are not coerced.

### 5.3 Capability selection

Selection is per operation:

1. validate workspace, tool profile, operation, target path, position, and output budget;
2. route supported JavaScript/TypeScript operations directly to builtin instead of paying an external startup/timeout tax;
3. for other languages/capabilities, ask an enabled extension only if its probe says the exact capability/language is ready;
4. on a safe `unsupported`, timeout, crash, or protocol failure, consult builtin immediately within the remaining deadline;
5. return builtin result as `fallback` when it can answer;
6. return typed `unsupported` when no safe implementation exists.

`rename_preview` never falls back to lexical replacement. Builtin lexical may locate probable references for search, but only a Provider that proves symbol identity and returns well-formed text edits may rename.

## 6. Canonical semantic source boundary

### 6.1 Source snapshots

All Providers consume `SemanticSourceSnapshot` objects created by one server-owned reader:

```ts
interface SemanticSourceSnapshot {
  relativePath: string;
  canonicalPathKey: string;
  language: string;
  utf8Text: string;
  sha256: string;
  byteLength: number;
  lineIndex: readonly number[];
  stableIdentity: StableFileIdentity;
}
```

The reader must:

- resolve through the workspace's native realpath and PathGuard;
- reject outside roots, blocked secrets, device/UNC/drive-relative/ADS/reserved/trailing-dot-space paths and link/junction escapes under the existing Windows rules;
- use the canonical same-handle bounded-read primitive for every workspace source, config, package metadata, declaration, and preview/apply reread; if the primitive is unavailable, return `unavailable` rather than falling back to `stat + readFile(path)`;
- reject non-ordinary files, every workspace file with `nlink !== 1`, invalid UTF-8, oversized sources, and identity/content replacement;
- return repository-relative slash-normalized paths only;
- distinguish per-file, per-request, workspace-source, Provider-response, diff-preview, and total-output limits.

A Provider-supplied absolute path or URI is only an untrusted locator. The server converts it with a standards-compliant file-URL parser to a candidate native path and re-runs the complete boundary before accepting a result. Provider-owned TypeScript standard-library assets use a separate audited package-root, manifest/digest, same-handle, ordinary-file, and identity boundary. A standard-library definition is filtered or returned only as an `external_library` fact without a repository path.

### 6.2 Positions and ranges

The public `semantic` tool uses 1-based Unicode code-point line and column values—not grapheme clusters or UTF-16 units—because they are understandable to users and ChatGPT. Internally:

- the source snapshot converts public positions to exact offsets;
- Phase 7 Core converts only public code-point positions and TypeScript offsets;
- LSP extension work separately negotiates and records UTF-8/UTF-16/UTF-32 positions, using UTF-16 only as the protocol fallback;
- surrogate pairs, combining marks, CRLF, LF, an optional UTF-8 BOM, end-of-line, and the final empty line receive explicit fixtures;
- range start must not exceed end;
- every range must land on a valid character boundary in the exact snapshot.

Results return 1-based line/column plus a bounded one-line preview. They never return raw Provider paths.

## 7. Builtin Provider

### 7.1 TypeScript/JavaScript engine

The default engine uses a pinned exact TypeScript production dependency after Gate G7-0 audits its license, package contents, lifecycle scripts, transitive graph, supported Node majors, and advisories. Compiler/language-service work runs in a lazy, owned, terminable Node worker from the first implementation; it never executes synchronously on the MCP event loop.

It creates a constrained compiler/language-service host:

- project files come only from authorized snapshots;
- TypeScript standard library files come only from the pinned package's verified installed location;
- the engine version always comes from the pinned CodexGPT dependency; workspace-local TypeScript compilers, language-service plugins, custom module-resolution hooks, loaders, and scripts never execute;
- PathGuard-approved workspace `.ts/.tsx/.js/.jsx/.json/.d.ts`, `package.json` `exports`/`types` metadata, bounded `node_modules` declaration packages, in-root `tsconfig extends`, and in-root project references may be read strictly as data through the canonical reader;
- root-external `extends`, project references, declaration paths, package targets, and module results are rejected;
- `tsconfig` and `jsconfig` are parsed as data through the bounded reader;
- includes/excludes and reachable-import module resolution may select only files that pass PathGuard; the engine never enumerates all of `node_modules`;
- missing packages produce diagnostics/fallback facts, not automatic installs;
- no `ts.sys` method may read, enumerate, watch, write, create directories, execute, or resolve outside the constrained host;
- file watching is not required in Phase 7; before every request the manager revalidates the config/project manifest and every cached file version by stable identity plus content hash, including same-size/same-timestamp external-editor changes;
- global worker, queued-request, workspace-project, source-byte, and cache-byte budgets prevent one HTTP transport per session from multiplying state without bound.

The engine supports:

- definition and type-definition locations collapsed into the public definition result;
- references with declaration inclusion explicitly reported;
- syntactic and semantic diagnostics with safe message flattening;
- `getRenameInfo` plus `findRenameLocations`, converted to non-overlapping text edits;
- JavaScript projects without config through a bounded inferred project;
- TypeScript config and common monorepo projects when every config, reference, source, metadata, and declaration file stays within the workspace boundary.

Large repositories use deterministic file-count, byte, worker-memory, concurrency, queue, and time budgets. Exceeding a budget returns `partial` or `unsupported` with a next action; it never silently indexes the whole drive. A rename token is created only when the project coverage needed for that symbol is complete.

On the reference fixture, the product targets are: cold first semantic result within 5 seconds; warm definition within 1 second; warm references/one-file diagnostics within 2 seconds; and warm rename preview within 3 seconds at p95. The gate records Windows/Ubuntu and Node 20/24 measurements rather than hiding misses. Worker termination/cancellation must keep the MCP event loop responsive.

### 7.2 Lexical fallback

The existing `src/analysis/` inventory, relationship, and structured-search behavior remains:

- the ordinary `search` tool keeps its current schema and behavior;
- builtin lexical results may satisfy approximate definition/reference navigation when clearly labeled;
- lexical results never claim compiler diagnostics;
- lexical results never produce a rename preview;
- the dormant global `AnalysisProvider` registry is migrated or removed rather than becoming a second selection system.

## 8. Serena adapter

Serena is a separately authorized Phase 7B, locally installed stdio MCP Provider for broader language retrieval. It is not a Phase 7 Core activation or closure prerequisite.

### 8.1 Allowed capability subset

The adapter reuses the repository's pinned MCP SDK with a server-owned transport/process supervisor; it does not add a raw generic MCP proxy. It may map only reviewed retrieval operations such as declaration/symbol lookup, referencing-symbol lookup, and diagnostics. Exact method/tool names, input schemas, capability set, and adapter-generated argument construction are frozen against the selected release. A schema/capability drift fails closed.

It must not expose or call:

- `rename_symbol` or any edit/write operation;
- shell/process tools;
- file create/delete/move/write tools;
- memory read/write tools;
- project activation/switching selected by the remote caller;
- onboarding or dashboard actions;
- arbitrary Serena tool names.

Because Serena's public rename operation mutates files, Serena does not implement `rename_preview` in Phase 7. Rename uses builtin TypeScript or the direct LSP adapter.

The internal client does not expose `tools/list` or raw tool invocation and rejects server-initiated sampling, elicitation, roots, or other unreviewed requests. Caller fields are never passed through to Serena path/project/body/include arguments; the adapter constructs them from the authorized workspace, with symbol bodies excluded by default. One invalid/outside result rejects the whole operation rather than silently dropping part of a semantic answer.

### 8.2 Local setup and lifecycle

The selected Serena release, Python runtime range, executable, package graph, and install command must be pinned and reviewed before implementation. The intended operational contract is:

- one explicit local `codexgpt semantic setup serena`;
- managed Provider state outside the workspace;
- `SERENA_HOME` or the release-equivalent state root points to CodexGPT-owned application state;
- project metadata is stored outside the repository when supported;
- dashboard and usage reporting are disabled;
- runtime prefers a verified offline invocation after setup;
- read-only/planning/IDE-style context is configured in addition to the adapter allowlist;
- one project session is bound to one authorized workspace;
- startup cwd is the canonical authorized workspace;
- inherited environment is bounded and does not copy arbitrary tokens;
- Windows process ownership requires the existing exact owned Job/process identity model; if binding cannot be proved, the Provider is unavailable.

G7-0 also audits Serena's persistent cache contents, ACL/reparse-point boundary, retention, and explicit purge behavior; `read_only` does not mean “no local persistence.” These controls reduce accidental capability exposure. CodexGPT runtime does not invoke an installer or updater after setup, but it does not isolate or prove the child's own network/filesystem behavior. Status and documentation must report `execution_isolation: none`, `filesystem_isolation: none`, `network_isolation: none`, and `project_code_execution: disabled | possible | unknown`.

## 9. Direct LSP adapter

Direct LSP is Phase 7C and starts only after a concrete unsupported-language need remains after Phase 7 Core and any approved Serena extension. It has its own authorization, dependency, adversarial review, live acceptance, publication, and exact-head gates.

### 9.1 Protocol subset

The adapter supports a standards-compatible, bounded stdio subset:

- JSON-RPC framing;
- `initialize`, `initialized`, `shutdown`, and `exit`;
- negotiated `positionEncoding`;
- document open/change/close notifications needed for exact snapshots;
- definition;
- references;
- push and pull diagnostics when advertised;
- `prepareRename`;
- rename returning `WorkspaceEdit`;
- cancellation and bounded request IDs.

It does not support arbitrary methods. Unknown server requests receive a standards-compatible refusal. In particular:

- do not advertise `workspace.applyEdit`;
- reject `workspace/applyEdit`;
- reject `workspace/executeCommand`;
- reject dynamic capability registration outside the reviewed subset;
- do not forward log/show-message text directly to ChatGPT;
- do not follow `LocationLink` or URI results before server normalization.

The adapter should depend on a small audited JSON-RPC/protocol package only if that is safer and smaller than a local strict framer. Gate G7-0 makes that evidence-based choice; no package is approved by this design alone.

Every server-to-client request is denied by default. If a future reviewed server requires `workspace/configuration`, the adapter returns only a frozen bounded local record. `workspace/applyEdit` receives `applied: false` without inspecting its paths. Generic LSP remains an explicitly trusted ambient-authority opt-in with `project_code_execution: possible | unknown` unless a server-specific audit proves `disabled`.

### 9.2 WorkspaceEdit normalization

Phase 7 accepts only text edits to existing ordinary UTF-8 files:

- exactly one of `changes` or ordered `documentChanges` may appear; both together are rejected;
- document versions, when present, must match the exact open snapshot;
- `CreateFile`, `RenameFile`, and `DeleteFile` resource operations are rejected;
- snippet edits, insert/replace ambiguity not representable as exact text ranges, overlapping edits, duplicate edits, and conflicting versions are rejected;
- every URI must be a standard-parsed `file:` URI and pass PathGuard; authority, query, fragment, NUL, encoded slash/backslash, double encoding, UNC/device/ADS/trailing-dot-space forms are rejected;
- URI aliases are deduplicated by canonical comparison key, not raw string;
- repeated document edits with conflicting/multiple version facts are rejected;
- `LocationLink.targetSelectionRange` must be contained by `targetRange`;
- every edited file is independently opened and hashed;
- edits are sorted in descending offset order and applied in memory to the exact snapshot;
- the resulting batch then passes existing text, size, secret-content, mutation-count, and transaction preparation checks.

CodexGPT never grants or executes protocol-level write authority from this conversion. The same-user LSP process itself has no filesystem or network isolation and may access account-readable data; the product states that limitation rather than claiming the process cannot write.

## 10. Public tool contract

### 10.1 Request

The public description is frozen for routing tests:

> Find symbol definitions and references, report TypeScript/JavaScript diagnostics, or preview a safe symbol rename. Use `semantic` for code meaning, `search` for text/regex, and `inspect_workspace` for a repository overview. Do not ask the user to choose a Provider.

The strict V5 request shape is conceptually:

```ts
type SemanticLocator =
  | { kind: "position"; path: string; line: number; column: number }
  | { kind: "symbol"; symbol: string; path_hint?: string };

type SemanticRequest =
  | {
      operation: "definition" | "references";
      locator: SemanticLocator;
      include_declaration?: boolean;
      max_results?: number;
      workspace_id?: string;
    }
  | {
      operation: "diagnostics";
      path: string;
      severity?: "error" | "warning" | "information" | "hint";
      max_results?: number;
      workspace_id?: string;
    }
  | {
      operation: "rename_preview";
      locator: SemanticLocator;
      new_name: string;
      max_preview_chars?: number;
      workspace_id?: string;
    };
```

Unknown fields are rejected. Position-based identity is authoritative. A symbol locator first performs bounded semantic candidate resolution: exactly one candidate is converted to an internal exact position; zero returns not found; more than one returns `needs_disambiguation` with bounded path/position candidates and creates no rename preview.

`new_name` is bounded text and must pass both generic identifier safety and the selected Provider's language-specific validation. It cannot contain a path separator, control character, NUL, newline, or URI syntax.

### 10.2 Response bounds

Definition/reference/diagnostic results include:

- actual/configured Provider and state;
- sanitized relative path;
- 1-based range;
- bounded single-line source preview;
- result count, returned count, omitted count, and `partial`;
- `result_quality`, safe reason code, and one stable `next_action` when degraded.

Rename preview includes:

```ts
interface RenamePreviewResult {
  preview_id: string;
  expires_in_seconds: number;
  old_name: string;
  new_name: string;
  manifest_digest: string;
  affected_file_count: number;
  edit_count: number;
  files: Array<{
    path: string;
    edit_count: number;
  }>;
  diff_preview: string;
  preview_truncated: boolean;
  omitted_preview_chars: number;
}
```

The server-owned file/identity/hash/edit manifest is complete or the preview is not applicable. Public structured output returns the opaque token because ChatGPT needs it for the next tool call, but the tool description tells ChatGPT never to repeat the token in natural-language output. Per-file hashes stay server-side; users see paths, counts, diff, expiry, and one manifest digest. Only the human-readable diff may be truncated. If the complete bounded file/edit manifest does not fit configured limits, the operation returns typed `too_large` and creates no token; Phase 7 Core offers no incomplete rename or unsupported “narrow scope” promise.

## 11. Rename preview binding and atomic apply

### 11.1 Preview store

`preview_id` is a cryptographically random opaque handle. The server stores the plan in memory only and binds it to:

- MCP server lifecycle domain;
- server instance identity;
- transport/session identity;
- workspace opaque handle and internal workspace identity;
- workspace owner/policy revision and allowed-root generation;
- confirmed-root lease/access facts when present;
- managed task-worktree owner and lifecycle generation when present;
- selected Provider id, version, process generation, and capability;
- source path/position/new name;
- every relative path, stable identity, and `expected_sha256`;
- normalized edit digest and complete resulting-text digest;
- monotonic creation/age plus wall-clock display expiry;
- invocation-bound single-use state.

Default TTL is 15 minutes, with a bounded per-workspace count and total byte budget. Oldest unused previews may be evicted. Workspace close, policy/access/worktree change, Provider restart, server restart, or a successful application invalidates the preview.

Preview lookup failure returns one safe reason. It does not reveal whether a foreign token exists.

The state machine is exact:

```text
ready -> reserved(invocation_id) -> consumed | burned
```

Authorization denial occurs before reservation. Drift, binding mismatch, any transaction attempt, and unknown/recovery-required terminal state burn the token and require a fresh preview; a suspicious failure never returns an old token to `ready`. Concurrent reservations fail opaquely. When `workspace_id` is omitted, the token's bound workspace is resolved inside the named session-local boundary; when supplied, it must match exactly.

### 11.2 Apply path

V5 `apply_patch` has two mutually exclusive forms:

```ts
{ patch: string, ...legacyFields }
{ semantic_preview_id: string, workspace_id?: string }
```

Policy evaluation needs exact semantic facts before the mutation handler. V5 therefore adds a non-consuming, opaque pre-authorization resolver that returns only workspace binding, Provider generation, preview/manifest digest, complete relative-path-manifest digest, file/edit/byte counts, policy/access/worktree facts, and safe display paths. These facts form `semanticFactsDigest`, the approval display/binding, and the final transaction request. Legacy patch requests keep their exact existing resource facts.

After authorization, the semantic handler:

1. resolves the session-local workspace exactly as the ordinary mutation path and requires the same `semanticFactsDigest`;
2. atomically reserves the preview for the invocation and verifies TTL, single-use state, Provider generation, policy/access/worktree binding, and file manifest;
3. reopens every input through the canonical source reader;
4. requires exact stable identity and SHA-256 for every file;
5. recomputes resulting text from the stored normalized edits;
6. calls `prepareWorkspaceTextBatch` with every expected hash;
7. uses the existing server `dependencies.workspaceMutationRuntime` and `attachPreparedBatchMutation` to return one pending mutation to the current Policy Kernel; it never uses `LocalMutationService`;
8. carries canonical path key, stable file identity, parent/path binding, expected hash, and semantic facts as internal Phase 3 transaction preconditions;
9. requires Phase 3 to compare those identity/path/hash preconditions again after acquiring the workspace lock during its second inspect/stage, then journal, commit atomically, create the ordinary change set, and audit;
10. marks the token consumed after a successful terminal commit and burned after drift, a transaction attempt, unknown terminal state, or recovery-required state;
11. invalidates all other previews that mention a changed file.

Hash-only revalidation is insufficient: replacing a source with a distinct same-content file object after preview must fail inside the transaction lock. No semantic code calls `writeFile`, `rename`, `rm`, Git, shell, `LocalMutationService`, or a Provider mutation method directly. The mutation inventory must fail if such a writer appears.

### 11.3 Approval and audit

Preview creation is read-only and receives read-only tool annotations. Applying a preview is an ordinary mutation:

- it uses the current `apply_patch` policy and approval rules;
- a previous preview does not count as mutation approval;
- an approval for preview A cannot authorize preview B because `semanticFactsDigest` binds the exact Provider generation, path-manifest digest, counts, access facts, and preview digest;
- a bounded V5 semantic audit-facts schema records operation type, actual Provider, preview/manifest digest, affected relative paths/counts, expected-hash digest, transaction/change-set identifiers, result, and safe reason as the existing transaction audit participant; audit failure retains the current rollback rule;
- Provider stdout/stderr, absolute paths, source bodies, full diffs, and token values are not persisted.

## 12. Health, timeouts, and process ownership

Each external Provider project session has:

```text
disabled -> starting -> ready -> degraded -> cooldown
                 \-> unavailable
```

Required behavior:

- startup and capability probes are lazy and bounded;
- workspace open never waits for external startup;
- each request has a deadline and cancellation;
- stdout framing has per-message and total-buffer limits;
- stderr uses a local bounded redacted ring and is not a protocol channel;
- crashes/timeouts increment a per-workspace circuit breaker;
- after a small fixed failure budget, requests fall back immediately during cooldown;
- restart count is bounded over a rolling window;
- process identity and stop target are exact; never terminate all `node.exe`, `python.exe`, or language-server processes;
- Windows children must join an owned Job and other platforms an exact owned process group; if ownership binding cannot be proved, the external Provider is unavailable;
- unexpected descendant/process escape is reported as a limitation, not silently claimed controlled;
- server shutdown does not hang on a dead Provider.

Builtin compiler work always runs in the owned worker defined in Section 7.1, with cancellation, source-count, byte, result, memory, queue, concurrency, and CPU-time budgets. Worker crash/termination cannot block the MCP event loop or leave an accepted stale result.

## 13. Policy, privacy, and security invariants

1. A Provider receives no authority fact and cannot grant permission.
2. Only the server resolves workspaces and paths.
3. Every accepted location/edit is normalized again after the Provider responds.
4. Secret-content and blocked-file rules stay exact; diagnostic text is redacted and bounded.
5. External runtime, entrypoint, package integrity/dependency-tree manifest, version, argv, and bounded environment are locally approved and same-handle verified launch facts.
6. No remote call installs, downloads, updates, registers, activates, or chooses a Provider.
7. CodexGPT does not invoke an external installer/updater at runtime, but external children receive no filesystem or network isolation guarantee.
8. The builtin host never executes workspace-local plugins/config hooks. Every external Provider has a reviewed profile and reports `project_code_execution: disabled | possible | unknown`.
9. Provider caches are separated by server, workspace identity, policy revision, language, config digest, and file hashes.
10. A fallback must name itself; no lexical answer is presented as semantic certainty.
11. Rename accepts text edits only and never resource operations.
12. Every mutation still passes Phase 3 transaction, change-set, undo, audit, and mutation-inventory gates.
13. V1–V4 clients do not observe V5 schemas or behavior.
14. `full_access`, the builtin worker, and external processes remain ambient authority. External status reports `execution_isolation: none`, `filesystem_isolation: none`, and `network_isolation: none`.

## 14. Verification and acceptance gates

Phase 7 Core runtime may start only after:

- Phase 6 has a terminal successful exact-head closure;
- the user explicitly authorizes Phase 7 Core runtime and the exact TypeScript production dependency;
- the current working tree and detached-run state are reconciled;
- exact V1–V4 compatibility fixtures are frozen;
- the exact TypeScript production version is audited.

Serena and LSP dependencies/installations are not required or authorized by Core G7-0. Each extension repeats its own dependency/installation authority gate. Core closure requires all of the following.

### G7-C — Contract and compatibility

- V1=28/V2=31/V3=39/V4=51 stay exact.
- Explicit standard V5=52 contains exactly one new semantic tool.
- Legacy mode produces no V5 registration or semantic schema.
- V5 inherits correctly across config, HTTP/stdio, production composition, Policy/Approval, process, Git, inventory/doctor, and the required supertool action while persisted Phase 3/Git/Audit contract versions stay unchanged.
- Contradictory semantic-mode/tool-contract inputs fail closed.
- Legacy mode does not read semantic registration, start a Provider, import/init TypeScript, or change startup/doctor output.
- Old cached connections receive one honest Scan Tools/recreate instruction; transparent schema refresh is not claimed.

### G7-S — Source and path safety

- Windows device, UNC, drive-relative, ADS, reserved, trailing-dot/space, case-fold, junction, symlink, hardlink, outside-root, replacement-race, blocked-secret, non-file URI, and encoding fixtures fail closed.
- Core public/TypeScript position conversion passes CRLF/LF/BOM/surrogate/combining-mark/EOL fixtures.
- Every workspace source/config/metadata/declaration read is mandatory same-handle with `nlink === 1`; same-size/same-timestamp and between-read replacement fail.
- Provider-owned TypeScript library assets pass their separate package-manifest/same-handle boundary.
- External or builtin output cannot smuggle an unvalidated absolute path into a result.

### G7-B — Builtin usefulness

- A clean JS/TS fixture and this repository's NodeNext graph return correct definitions, references, diagnostics, and rename preview.
- `@types/node`, dependency-owned `.d.ts`, package `exports/types`, in-root `extends`, and a common monorepo/project-reference fixture work as data without executing a workspace compiler/plugin/script.
- Configured and inferred projects behave deterministically on Windows and Ubuntu; external same-size/same-timestamp edits invalidate cache.
- cold/warm latency, event-loop responsiveness, worker crash, memory, concurrency, queue, and cache budgets pass the Section 7.1 targets or record an explicit miss before activation.
- Unsupported languages retain labeled lexical search without false rename support.
- Large-project budgets are bounded and actionable.

### G7-R — Rename transaction

- Preview contains a complete server-owned file/identity/hash/edit manifest and public manifest digest.
- Same-file and multi-file rename apply through one atomic transaction.
- exact stable identity/path/hash preconditions are rechecked after the Phase 3 workspace lock; a distinct same-content replacement, parent replacement, case alias, and link swap reject.
- approval display/binding and final handler share one `semanticFactsDigest`; a grant for preview A cannot authorize B.
- file drift, policy/access/worktree drift, Provider restart, workspace close/expiry/transport revoke, expiry, replay, overlap, resource operation, and blocked path all reject.
- token state follows `ready -> reserved -> consumed | burned`, including transaction/recovery failure.
- success yields an ordinary change set and undo path.
- mutation architecture proves no new direct Provider writer.

### G7-H — Core worker and workspace lifecycle

- workspace revocation notification covers explicit close, expiry, policy revision, and transport revoke, with bounded observable disposal;
- worker fixture covers startup, timeout, cancellation, crash, malformed/oversized messages, queue/memory/concurrency limits, exact shutdown, and server restart;
- no broad process kill, event-loop blockage, cross-server/workspace cache leak, or inherited token exposure occurs.

### G7-U — Real user experience

From a fresh ChatGPT App/tool scan using the supported public entry:

1. a symbol-only natural-language definition and references request works in this repository without a pre-search or Provider setup; ambiguity returns candidates without guessing;
2. one-file diagnostics return actionable locations;
3. “先看影响” stops after a readable preview, while an explicit “完成重命名” may preview and apply in one turn under existing approval policy;
4. multi-file rename applies once, verifies, rejects replay/drift, and uses ordinary undo;
5. unsupported-language lexical fallback reports `result_quality: lexical` without breaking workspace/search/read;
6. the user does not choose a Provider for the default journey;
7. an existing 51-tool ChatGPT App receives one clear Scan Tools/recreate migration prompt.

Unit tests cannot substitute for this gate.

### G7-X — Core cross-platform and exact-head closure

- managed Node 20/24 focused tests and build;
- authoritative detached ordinary run;
- protected Smoke on both majors;
- package dry-run and dependency/license/advisory evidence;
- repository policy, documentation links, secret scan, `git diff --check`, mutation inventory, and intended-scope audit;
- exact-head Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package;
- no evidence-only follow-up commit.

Phase 7 Core formally closes and may flip omitted mode only after G7-C/S/B/R/H/U/X pass. Serena or LSP absence cannot block this closure.

### G7B — Serena extension

Phase 7B begins only under separate runtime/install authorization after Core closure. It freezes the MCP method/tool/schema allowlist, managed installation manifest, cache/retention/purge behavior, process ownership, honest isolation fields, fixture failures, one real non-JS/TS retrieval acceptance, adversarial review, and its own publication/exact-head result.

### G7C — Direct LSP extension

Phase 7C begins only for a named unsupported-language need and separate authorization. It owns URI/position-encoding, JSON-RPC/framing, server-request denial, text-only WorkspaceEdit, server-specific project-code-execution review, live acceptance, adversarial review, and publication/exact-head gates. Deferring it is a valid completed Phase 7 Core outcome.

## 15. Rollout and rollback

Rollout is intentionally vertical:

1. explicit standard mode with per-server kernel and source normalizer;
2. builtin JS/TS definition/reference/diagnostic path;
3. V5 public semantic tool and live no-setup navigation;
4. rename preview plus atomic apply;
5. health/doctor experience;
6. Core documentation and completed-runtime adversarial review/repairs;
7. live navigation/rename/fallback acceptance;
8. Core publication, exact-head closure, and only then omitted-default activation;
9. separately authorized Phase 7B Serena extension;
10. demand-driven Phase 7C direct LSP extension.

Rollback:

- `CODEXGPT_SEMANTIC_MODE=legacy` removes V5 after one restart;
- `semanticProvider=builtin` removes external Provider dependence;
- `semanticProvider=none` disables semantic calls while keeping lexical search;
- no rollback deletes user configuration, Provider state, previews, source files, audit records, changes, branches, or worktrees automatically;
- an already committed rename rolls back through the existing change-set/undo mechanism, not a Provider.

## 16. Rejected alternatives

### 16.1 Require Serena for Phase 7

Rejected because first success would depend on Python/package setup and a long-lived ambient-authority process. It also exposes a mutating rename operation that does not fit preview-first atomic application.

### 16.2 Use only a generic LSP adapter

Rejected as the default because users would still need to install and configure a server per language. Direct LSP remains valuable as an advanced extension.

### 16.3 Overload `search`

Rejected because diagnostics and rename have different inputs, output semantics, and user intent. Hidden mode switches inside `search` would make discovery and compatibility harder than one explicit tool.

### 16.4 Add four public tools

Rejected because the operations share one authority level, position model, Provider state, and result envelope. Separate tools add prompt/schema cost without a security benefit.

### 16.5 Let the model copy the rename diff into `apply_patch`

Rejected because it discards Provider generation and source snapshot bindings, can truncate large edits, and reintroduces avoidable model transcription and TOCTOU errors.

### 16.6 Let Provider edits write directly

Rejected because it bypasses PathGuard revalidation, Policy/Approval, workspace locks, transaction journals, atomic commit, change sets, undo, and persistent audit.

### 16.7 Automatically install or update Providers at startup

Rejected because opening a workspace must not execute package-manager/network state changes and remote clients must not control local software supply.

## 17. Authoritative references

- Phase 7 implementation must follow the paired [TDD plan](../plans/2026-07-23-phase-7-semantic-providers.md).
- LSP behavior is based on the official [Language Server Protocol 3.18 specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/), while the implemented subset remains explicitly bounded.
- Serena installation, running, configuration, security, and tool behavior must be frozen against the chosen release using its official documentation:
  - [Installation](https://oraios.github.io/serena/02-usage/010_installation.html)
  - [Running the MCP server](https://oraios.github.io/serena/02-usage/020_running.html)
  - [Configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)
  - [Security considerations](https://oraios.github.io/serena/02-usage/070_security.html)
  - [Tool catalogue](https://oraios.github.io/serena/01-about/035_tools.html)
- TypeScript compiler API behavior and the exact package selected at G7-0 must be verified against the official [TypeScript repository](https://github.com/microsoft/TypeScript).
- `typescript-language-server` is an optional community adapter target, not a Microsoft product or default dependency; if used for acceptance, freeze its exact release from its [official repository](https://github.com/typescript-language-server/typescript-language-server).

## 18. Design adversarial review

The complete draft received three independent read-only reviews before this final revision.

### Execution and correctness repairs

- Replaced invalid toolchain/detached-run command shapes with the repository's actual `exec --major`, `matrix --major all`, and `long-task-runner start/status` forms.
- Expanded V5 from a catalog-only change into an inherited-runtime migration across config, transports, production composition, Policy/Approval, process, Git, inventory/doctor, and the required supertool action while preserving persisted contract versions.
- Removed the incorrect `LocalMutationService` alternative and bound MCP rename only to `dependencies.workspaceMutationRuntime` plus the current Policy Kernel.
- Added a single workspace-revocation notification for close, expiry, policy drift, and transport revoke.
- Made the TypeScript worker, real NodeNext/declaration graph, cache revalidation, responsiveness, and global budgets mandatory rather than conditional.

### Security and compatibility repairs

- Carried canonical path, stable identity, parent/path binding, and hash into Phase 3's lock-held second inspection so a distinct same-content replacement cannot pass.
- Added non-consuming pre-authorization resolution and `semanticFactsDigest` so approval A cannot authorize preview B; bounded semantic audit facts remain an atomic transaction participant.
- Made the canonical same-handle reader and `nlink === 1` mandatory for every workspace semantic read, with a separate audited TypeScript-library asset boundary.
- Defined the token state machine and burn rules for drift, transaction attempts, and uncertain recovery.
- Replaced false external-process safety claims with explicit no-isolation facts and managed runtime/entrypoint/dependency manifests.
- Tightened Serena method/schema/argument allowlisting and deferred LSP URI/server-request/WorkspaceEdit complexity to its own demand-driven extension.

### UX and operability repairs

- Added symbol-name lookup with unique-only auto-resolution and bounded ambiguity candidates, so ordinary questions do not require the user to supply a line number.
- Allowed safe in-root declaration/package/config data needed by real projects while still preventing compiler/plugin/script execution.
- Split Core closure from Phase 7B Serena and Phase 7C LSP so optional integrations cannot delay the zero-setup feature.
- Defined “preview only” versus “complete rename” conversation intent, one-step Serena setup, progressive public rename output, 15-minute preview TTL, stable next actions, quality labels, and latency targets.
- Required a real repository/monorepo journey and explicit old-App Scan Tools/recreate feedback.

## 19. Authorization boundary

This design work is authorized by the 2026-07-23 user request. It does not authorize:

- Phase 7 runtime edits;
- adding or changing dependencies;
- installing Serena, Python, `uv`, a language server, or any Provider;
- changing the default tool contract;
- staging, commit, push, publication, release, or deployment;
- credentials, destructive Git/data operations, Phase 8, Phase 9, or deferred sandbox work.

Runtime begins only after Phase 6 exact-head closure and a fresh explicit implementation/dependency authorization at Gate G7-0.
