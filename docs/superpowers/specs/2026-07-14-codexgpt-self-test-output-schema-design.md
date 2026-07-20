# Direct `codexgpt_self_test` Output Schema Design

> Date: 2026-07-14  
> Phase: 1, Slice 27  
> Status: Approved under the recorded uninterrupted Slice 17–28 authorization  
> Scope: direct `codexgpt_self_test` only

## 1. Purpose

Migrate the direct `codexgpt_self_test` tool from its legacy flat diagnostic object to one exact schema-v1 result without weakening its local-only safety boundary or turning diagnostic findings into transport failures.

The tool exists to answer one question:

> Does this CodexGPT process, under its current effective modes and workspace, behave consistently with its own advertised local capabilities and safety boundaries?

The result must distinguish four different facts:

1. the diagnostic ran and every performed check passed;
2. the diagnostic ran but found a warning;
3. the diagnostic ran but found a failed check;
4. the tool could not produce a trustworthy diagnostic result.

Cases 1–3 are successful tool calls with `ok: true`. Case 4 is a stable tool failure with `ok: false`.

## 2. Inventory findings

### 2.1 Current inputs

The public tool currently accepts:

- optional `workspace_id`;
- `write_probe`, default `true`;
- `bash_probe`, default `true`;
- `pro_context_probe`, default `true`;
- `include_global_skills`, default `true`;
- `max_skills`, default `40`, bounded to `1..120`.

These inputs remain unchanged.

### 2.2 Current diagnostic surface

A real standard-mode run returned these twelve checks in fixed semantic order:

1. workspace;
2. tool mode;
3. write mode;
4. bash mode;
5. HTTP authentication;
6. registered tool set;
7. inventory;
8. Git status;
9. write/edit probe;
10. selected-only Pro context;
11. Bash policy;
12. terms boundary.

The current flat result also exposes workspace identity, modes, expected and registered tools, aggregate counts, touched files, check details, and a fixed terms-boundary object.

### 2.3 Consumers

Maintained consumers are:

- the dedicated Tool Card in `src/toolCardWidget.ts`;
- protected `scripts/smoke.mjs` checks for status, expected/registered tools, touched files, write-mode filtering, and Bash-session behavior;
- native `scripts/stress.mjs` status checking;
- the Slice 17 inventory domain consumed internally by self-test;
- the Slice 22 selected-only Pro-context compatibility wrapper;
- mode and registration logic shared with `server_config` and the future Slice 28 supertool.

Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` must remain byte-for-byte unchanged. The main Smoke consumer will migrate only through exact fail-closed substitutions in `scripts/smoke-platform-compat.mjs`.

### 2.4 Current weaknesses

The legacy result has five material weaknesses:

1. flat fields do not match the Phase 1 envelope;
2. free-form check details can drift or accidentally expose diagnostics;
3. an explicitly skipped probe is represented as a warning rather than a distinct skipped outcome;
4. expected and registered tool lists are not represented with explicit missing/unexpected set facts;
5. `status: fail` can be confused with a failed tool invocation even though it is a valid diagnostic result.

## 3. Approaches considered

### Approach A — Preserve the flat object inside `data`

This is the smallest migration, but it preserves opaque details, ambiguous skipped warnings, and weak cross-field invariants.

### Approach B — Keep a generic array of arbitrary checks

This improves nesting but still trusts Provider-generated names, messages, counts, and status. It is easy for diagnostics to drift silently.

### Approach C — Structured facts with derived checks

The Provider returns bounded structured observations. The handler validates identity and facts, derives all twelve check records, calculates counts/status, and generates only fixed or bounded safe messages.

**Decision: Approach C.** It is the smallest design that makes the self-test trustworthy rather than merely well-shaped.

## 4. Scope boundaries

### 4.1 Included

- exact schema-v1 output;
- fixed twelve-check order;
- separate `pass`, `warn`, `fail`, and `skipped` outcomes;
- exact expected/registered/missing/unexpected tool-set facts;
- bounded inventory and Git summary facts;
- safe fixed-path probe accounting;
- one injected Provider boundary;
- stable redacted operational failures;
- bounded nested human text and Tool Card;
- exact protected-Smoke compatibility substitutions;
- native Stress migration.

### 4.2 Excluded

- executing Codex or another agent;
- changing tool visibility policy;
- implementing the Phase 2 Policy Kernel;
- adding an OS sandbox;
- adding network probes or external Cloudflare checks;
- adding source-file writes;
- changing authentication behavior;
- migrating the Slice 28 `codexgpt` supertool;
- staging, committing, pushing, publishing, or exact-head CI.

## 5. Public envelope

The exact top-level result is:

```text
codexgpt_tool
codexgpt_title
ok
data
error
meta
```

Constants:

```text
codexgpt_tool  = "codexgpt_self_test"
codexgpt_title = "CodexGPT Self Test"
meta.schemaVersion = 1
```

Successful diagnostics require:

```text
ok = true
data != null
error = null
```

Operational failures require:

```text
ok = false
data = null
error != null
meta.warnings = []
```

`ok` describes whether a trustworthy diagnostic result was produced. It does not describe whether all checks passed.

## 6. Exact success data

The success `data` object has exactly twenty-one fields:

```text
workspace_id
root
status
counts
tool_mode
write_mode
bash_mode
bash_session_guard
http_auth
request
expected_tools
registered_tools
missing_tools
unexpected_tools
tool_set_matches
inventory
git
probe_artifact
files_touched
checks
terms_boundary
```

### 6.1 Identity and mode fields

```text
workspace_id: safe non-empty one-line identifier
root: canonical native absolute allowed workspace path
status: "pass" | "warn" | "fail"
tool_mode: "minimal" | "standard" | "full"
write_mode: "off" | "handoff" | "workspace"
bash_mode: "off" | "safe" | "full"
```

The Provider must return the same workspace/config identity supplied by the handler. Path-equivalent but noncanonical roots are rejected.

### 6.2 Counts

```text
counts = {
  total: 12,
  passed: integer >= 0,
  warned: integer >= 0,
  failed: integer >= 0,
  skipped: integer >= 0
}
```

All four outcome counts sum to exactly twelve and equal the corresponding records in `checks`.

Overall status is derived:

```text
failed > 0                     -> "fail"
failed = 0 and warned > 0      -> "warn"
failed = 0 and skipped > 0     -> "warn"
otherwise                      -> "pass"
```

### 6.3 Bash session guard

```text
bash_session_guard = {
  required: boolean,
  configured: boolean
}
```

The actual Bash session identifier is not returned. The diagnostic needs only whether a guard is required and configured.

Invariant:

```text
required = true -> configured = true
bash_mode = "off" -> required = false and configured = false
```

### 6.4 HTTP authentication

```text
http_auth = {
  enabled: boolean,
  required_for_public_access: boolean
}
```

`required_for_public_access` must remain true for supported public/non-loopback operation. The self-test does not expose credentials, URLs containing credentials, token presence details, or authentication diagnostics.

### 6.5 Effective request

```text
request = {
  write_probe: boolean,
  bash_probe: boolean,
  pro_context_probe: boolean,
  include_global_skills: boolean,
  max_skills: integer 1..120
}
```

Defaults are applied exactly once before Provider invocation. The returned request must equal the normalized effective request.

### 6.6 Tool-set facts

Each tool array:

- contains safe non-empty one-line names;
- contains no duplicates;
- contains at most 28 names;
- is sorted lexicographically for deterministic output.

```text
expected_tools
registered_tools
missing_tools
unexpected_tools
tool_set_matches
```

Invariants:

```text
missing_tools    = expected_tools - registered_tools
unexpected_tools = registered_tools - expected_tools
tool_set_matches = missing_tools.length = 0 and unexpected_tools.length = 0
```

Expected tools and registered tools must come from independent observations:

- expected tools from the current effective visibility rules;
- registered tools from the actual server registration set.

The self-test must not compare two aliases of the same array.

### 6.7 Inventory facts

```text
inventory = {
  skill_count: integer 0..120,
  mcp_server_count: integer >= 0 and bounded by the existing inventory limit,
  skills_truncated: boolean,
  mcp_servers_truncated: boolean
}
```

No Skill names, paths, descriptions, MCP server names, config paths, or raw discovery diagnostics are included in this aggregate tool.

The Provider may reuse the Slice 17 domain result, but the public self-test contract exposes only these counts and truncation facts.

### 6.8 Git facts

```text
git = {
  repository_state: "clean" | "changed" | "not_git" | "unavailable",
  changed_entries: integer >= 0
}
```

Invariants:

```text
repository_state = "clean"   -> changed_entries = 0
repository_state = "changed" -> changed_entries > 0
repository_state in {"not_git", "unavailable"} -> changed_entries = 0
```

No changed paths, diff, Git stderr, executable paths, or repository internals are returned.

### 6.9 Probe artifact and touched files

```text
probe_artifact: null | ".ai-bridge/codexgpt-self-test.md"
files_touched: [] | [".ai-bridge/codexgpt-self-test.md"]
```

Rules:

- only the fixed context artifact may be touched;
- source files are never valid probe targets;
- `write_probe = false` requires `probe_artifact = null` and `files_touched = []`;
- a performed write/edit probe requires the fixed path in both fields;
- a skipped or preflight-rejected probe may leave both fields empty;
- duplicates, absolute paths, backslashes, alternate context paths, and additional files are rejected.

The probe must not overwrite unrelated user content. It may create or update only an absent file or a file that exactly matches a recognized CodexGPT self-test scaffold. A conflicting meaningful file produces a failed diagnostic check without modification.

The final owned scaffold should avoid secrets and unnecessary environment data. It must not persist the workspace root, credentials, command output, or arbitrary timestamps solely for the diagnostic.

### 6.10 Terms boundary

```text
terms_boundary = {
  local_workspace_bridge: true,
  provides_models: false,
  proxies_model_access: false,
  bypasses_quotas: false,
  remote_agent_execution: false
}
```

These values are exact constants. Provider drift is an internal error.

## 7. Exact checks

`checks` contains exactly twelve records in this order:

```text
workspace
tool_mode
write_mode
bash_mode
http_auth
registered_tool_set
inventory
git_status
write_edit_probe
selected_only_pro_context
bash_policy
terms_boundary
```

Each record is strict:

```text
{
  name: fixed check name,
  status: "pass" | "warn" | "fail" | "skipped",
  code: fixed safe diagnostic code,
  message: bounded safe one-line text
}
```

### 7.1 Ownership of check output

The Provider returns structured observations and bounded reason codes. It does not own:

- aggregate counts;
- overall status;
- check order;
- public check names;
- public messages;
- meta warnings.

The handler derives those values and rejects Provider attempts to supply them.

### 7.2 Outcome semantics

- `pass`: the check was performed and met its invariant.
- `warn`: the check was performed and found a supported but cautionary state, such as full Bash enabled.
- `fail`: the check was performed or preflighted and found a material inconsistency.
- `skipped`: an optional probe was not performed because the normalized request disabled it or the effective mode made it unavailable.

An explicitly skipped probe is not encoded as a generic warning record.

### 7.3 Messages

Messages are generated from fixed templates and already validated public facts. They must:

- be one line;
- contain no controls;
- be at most 240 characters;
- contain no raw exceptions, stack traces, secrets, command output, arbitrary file content, or unsafe paths;
- never include the Bash session identifier.

## 8. Diagnostic versus operational failures

### 8.1 Successful diagnostic with failed checks

A coherent diagnostic with one or more `fail` checks returns:

```text
ok = true
data.status = "fail"
data.counts.failed > 0
error = null
```

This is not an MCP transport/tool failure. The caller can inspect the bounded failed checks.

### 8.2 Stable tool failures

The exact operational errors are:

#### `WORKSPACE_NOT_FOUND`

```text
message: "The requested workspace is not open."
retryable: false
details:
  { source: "workspace_id", workspace_id: safe id }
  or
  { source: "default_workspace", workspace_id: null }
```

#### `SELF_TEST_EXECUTION_FAILED`

```text
message: "The CodexGPT self-test could not be completed."
retryable: true
details: {}
```

Used only when an unexpected operational failure prevents a coherent twelve-check result.

#### `INTERNAL_ERROR`

```text
message: "The CodexGPT self-test failed because of an internal error."
retryable: false
details: {}
```

Used for malformed Provider output, identity drift, impossible counts, unsafe fields, duplicate/unsorted tools, secret-shaped values, or schema drift.

Known per-check failures should remain diagnostic records rather than being collapsed into `SELF_TEST_EXECUTION_FAILED`.

## 9. Meta warnings

Warnings are exact and derived in this order:

1. `"One or more self-test checks failed."` when `counts.failed > 0`;
2. `"One or more self-test checks returned warnings."` when `counts.warned > 0`;
3. `"One or more optional self-test probes were skipped."` when `counts.skipped > 0`.

A failed envelope has no warnings.

## 10. Provider boundary

Introduce one test-only injectable Provider with a normalized context containing:

```text
workspace
config identity
normalized request
actual registered tool names
```

The production Provider may call existing helpers for:

- expected tool derivation;
- capability inventory;
- Git status summary;
- fixed-path write/edit probe;
- selected-only Pro-context build;
- Bash policy verification.

The Provider result contains only structured observations and fixed internal reason codes. Before constructing public output, the handler validates:

- workspace id and canonical root;
- effective modes and session-guard booleans;
- exact normalized request;
- independently derived tool sets;
- inventory limits and truncation facts;
- Git state/count relationships;
- probe eligibility, fixed path, and touched-file set;
- fixed terms constants;
- absence of additional fields and known secret shapes.

There is no production test mode and no hidden MCP argument.

## 11. Probe behavior

### 11.1 Write/edit probe

The probe is local and bounded:

1. resolve the configured context directory through current workspace/path policy;
2. preflight the fixed self-test artifact;
3. refuse to overwrite unrecognized meaningful content;
4. write a fixed safe `marker: before` scaffold;
5. exact-edit it to `marker: after`;
6. confirm only the fixed path is affected;
7. confirm path-scoped Git status is clean when the context directory is ignored;
8. return structured facts, not file content.

A supported write-mode restriction produces `skipped`; an unexpected probe failure produces a `fail` check with a fixed code.

### 11.2 Selected-only Pro-context probe

The probe uses the existing build-only compatibility wrapper. It must prove that an explicit fixed selection does not silently include important files, changed files, diff, or other AI-bridge files.

It does not write `pro-context.md`.

### 11.3 Bash policy probe

The probe checks policy and session-guard behavior with only allowlisted safe local commands. It does not expose command text or output in the public result.

- Bash off may be skipped as unavailable.
- Safe Bash passing policy is `pass`.
- Full Bash is a supported but cautionary `warn` state.
- A required configured session guard is tested without exposing its identifier.

## 12. Descriptor and annotations

The tool remains visible in minimal, standard, and full modes.

Because the default write probe may update a fixed `.ai-bridge` artifact:

```text
readOnlyHint: false
destructiveHint: false
idempotentHint: true
openWorldHint: false
```

The description must state that the tool:

- performs local diagnostics only;
- may touch only `.ai-bridge/codexgpt-self-test.md` when the write probe is enabled;
- does not execute agents, proxy models, bypass quotas, or contact external services.

## 13. Human text and Tool Card

### 13.1 Human content

Human text is bounded and derived from validated structured data. It includes:

- overall status and counts;
- mode summary;
- tool-set match summary;
- at most twelve one-line check summaries;
- fixed touched-file summary when applicable.

It excludes raw exceptions, check internals, Skill/MCP names, Git paths, file content, Bash output, and credentials.

### 13.2 Tool Card

The Tool Card becomes nested-only for Slice 27:

- use `data` only on success and `error` only on failure;
- show pass/warn/fail/skipped counts;
- show all twelve bounded check rows;
- show missing/unexpected tools only when non-empty;
- show the fixed probe artifact only when touched;
- do not retain a legacy flat fallback.

Structured data remains complete; only visible presentation is bounded.

## 14. Consumer migration

### 14.1 Protected main Smoke

Do not edit `scripts/smoke.mjs`.

Add exact-count fail-closed replacements in `scripts/smoke-platform-compat.mjs` for the legacy self-test accesses to nested `data`, including:

- primary status;
- expected tools;
- registered tools;
- touched files;
- handoff/off write-mode checks;
- guarded Bash status/checks.

Any protected-source drift must fail before execution.

### 14.2 Native Stress

Update `scripts/stress.mjs` directly to read nested `data.status` and bounded checks.

### 14.3 Tool Card

Add a dedicated nested extractor and failure-aware renderer. Preserve title/icon identity but remove flat reads.

### 14.4 Adjacent contracts

Regression must cover:

- Slice 17 inventory compatibility;
- Slice 22 build-only Pro-context compatibility;
- `server_config` mode and registered-tool facts;
- Bash mode/session guard behavior;
- write-mode visibility;
- future Slice 28 boundary without migrating the supertool early.

## 15. Testing strategy

### 15.1 Deliberate RED baseline

Create `test/codexgpt-self-test-contract.test.mjs` before production changes. The full focused baseline must execute and fail for missing exact behavior rather than fixture or import failures.

### 15.2 Required focused coverage

- exact six-field envelope and twenty-one-field data;
- twelve fixed checks and four outcomes;
- exact counts/status/warning derivation;
- exact three stable failures;
- all input defaults and bounds;
- all tool modes and write/Bash mode combinations;
- independent expected/registered tool sets;
- missing/unexpected tool derivation;
- inventory bounds without names/paths;
- Git clean/changed/not-Git/unavailable facts;
- write artifact conflict and fixed-path containment;
- skipped probes;
- selected-only Pro-context behavior;
- Bash full warning and session guard;
- Provider throws and semantic drift;
- secret/control/path rejection;
- bounded human text and nested-only Tool Card;
- exact protected compatibility substitutions;
- native Stress consumer migration.

### 15.3 Adversarial review

Review at least:

- Windows path casing and context-directory junctions;
- pre-existing probe artifact content;
- probe partial writes and edit mismatch;
- Git unavailable and non-repository roots;
- expected/registered aliases, duplicates, ordering, and count drift;
- inventory truncation and global-skill limits;
- Bash off/safe/full and required session guard;
- Provider free-form secret attempts;
- check count/order/status/message drift;
- human/Card output bounds;
- advertised schema versus runtime result.

Every material defect found requires a deliberate RED and the smallest correction.

## 16. Verification gates

Before declaring Slice 27 locally complete:

1. focused contract suite;
2. adjacent Slice 17/22/config/Bash/write-mode suites;
3. complete contract regression;
4. TypeScript Build;
5. all eight Smoke sections;
6. native-Windows Stress;
7. package dry-run;
8. protected-source immutability;
9. empty Git index;
10. exact unpublished-scope comparison;
11. rule-aware whitespace and secret-shape audit;
12. Markdown links/fences/spec-plan/reference/size audit;
13. per-tool `neat-freak` reconciliation.

## 17. Rollback

Rollback is one Slice:

- remove `src/tools/schemas/codexgptSelfTest.ts`;
- restore the legacy direct handler and flat Tool Card;
- remove the focused contract test;
- remove only Slice 27 compatibility substitutions and Stress migration;
- revert the Slice 27 design/plan/status records.

Do not revert Slices 17–26 or modify protected Smoke sources.

## 18. Acceptance criteria

Slice 27 is acceptable when:

- the direct tool advertises and returns the exact schema-v1 envelope;
- a failed diagnostic check remains `ok: true` with `data.status = "fail"`;
- skipped probes are explicit and count-correct;
- expected and registered tools are independently observed and exactly compared;
- no arbitrary Provider message or raw diagnostic reaches public output;
- only the fixed self-test artifact can be touched;
- full Bash and session-guard states are represented truthfully without exposing identifiers;
- protected Smoke sources remain unchanged;
- all local and reconciliation gates pass;
- the complete Slice 17–27 batch remains unstaged, uncommitted, unpushed, and unpublished.
