# `bash` Exact Output Schema Design

Date: 2026-07-13
Phase: Phase 1, eleventh vertical slice
Status: Published through commit `a39b779`; CI run `29239425311` passed Ubuntu/Windows Node 20/24

## 1. Goal

Migrate only the direct `bash` MCP tool to the established Phase 1 schema-v1 result envelope with an exact advertised `outputSchema`, strict success data, stable public errors, focused contract tests, Tool Card compatibility, and `codexgpt` wrapper compatibility.

The slice preserves the current synchronous Bash verification workflow, safe/full policy behavior, optional session guard, workspace-relative `cwd`, timeout bounds, output redaction and truncation, compact/full human transcript modes, Git Bash compatibility on native Windows, current tool registration rules, and existing Smoke/Stress coverage.

This slice stabilizes the protocol around the existing Bash implementation. It does not create a shell abstraction, add PowerShell, add background process sessions, improve process-tree termination, or claim operating-system sandboxing.

## 2. Why `bash` is the recommended next slice

The first ten Phase 1 slices already cover configuration, file inspection, search, Git review, direct file creation, exact replacement, and unified-diff application. `bash` is the remaining high-frequency tool used immediately after those operations to run build, test, lint, typecheck, and other verification commands.

Migrating `bash` now gives the normal edit-and-verify workflow a stable structured contract without crossing into Phase 2 workspace lifecycle, Phase 3 atomic editing, or Phase 4 native shell/process architecture.

Three approaches were considered:

### Approach A — Migrate direct `bash` only

Add one exact schema module, one injectable provider boundary around the existing `runBash`, safe failure classification, nested Tool Card consumption, and contract tests.

Advantages:

- completes the core direct edit-and-verify path;
- follows the proven Phase 1 migration pattern;
- preserves current command behavior;
- remains independently reversible;
- does not require new dependencies or a shell redesign.

This is the selected approach.

### Approach B — Migrate a workspace summary tool first

A tool such as `open_current_workspace` or `workspace_snapshot` has a lower execution-risk surface.

This is not selected because the core verification tool would continue exposing an unstable mixed-case flat result and generic error object. Workspace summary tools can follow after the execution contract is stabilized.

### Approach C — Combine Bash with PowerShell and process management

Introduce a generic shell interface, native PowerShell backend, persistent process sessions, PTY support, and Windows process-tree control in the same slice.

This is rejected because it is Phase 4 work, changes behavior and permissions, requires a much larger security review, and would make the Phase 1 protocol migration difficult to isolate or roll back.

## 3. Scope

### In scope

- Direct `bash` tool only.
- Exact advertised `outputSchema`.
- Strict schema-v1 success and failure envelopes.
- Preservation of the current successful process-result fields under nested `data`.
- Removal of the accidental duplicate camelCase `bashSessionId` from public structured output.
- One injectable `bashResultProvider` for deterministic handler contract tests.
- Strict provider-result validation.
- Validation that provider-returned command, working directory, and optional session id match the request and server configuration.
- Stable safe public failure codes and messages.
- Existing compact and full human-readable Bash transcript behavior.
- Dedicated nested-envelope Tool Card rendering.
- `codexgpt` supertool wrapper compatibility.
- Focused `node:test` contract coverage.
- Smoke and Stress updates only where they inspect the old flat structured result.
- Documentation, changelog, project memory, and active Phase 1 archive updates during implementation.

### Out of scope

- PowerShell, Windows PowerShell, CMD, WSL, or a generic shell backend interface.
- ConPTY, PTY, stdin, interactive commands, persistent processes, process sessions, output cursors, ring buffers, Ctrl+C, or background jobs.
- Windows Job Objects or reliable process-tree termination.
- Changes to the current timeout algorithm or the direct-child kill behavior.
- Changes to safe-mode allowlists, blocklists, command parsing, environment inheritance, executable discovery, or Bash availability probing.
- Changes to Bash tool registration, tool modes, annotations, transcript configuration, session configuration, authentication, dependencies, workspace lifecycle, or path policy.
- Treating `safe` mode as an operating-system sandbox.
- A new `timed_out` field or a new process-state model.
- Automatically treating a non-zero exit code as an MCP tool failure.
- Phase 2, Phase 3, or Phase 4 implementation.

## 4. Result semantics

The direct `bash` tool has two distinct outcome layers.

### Tool-level outcome

`ok` answers whether CodexGPT successfully validated the request, started the configured Bash backend, and produced a valid bounded process result.

- `ok: true`: the tool operation completed and returned a trustworthy process outcome.
- `ok: false`: CodexGPT could not perform the tool operation because of workspace, argument, session, policy, backend, path, start, or internal failure.

### Command-level outcome

`data.exitCode` and `data.signal` describe the command itself.

A command that starts correctly and exits with code `1`, `2`, or another non-zero value remains `ok: true`. Build or test failure is useful verification evidence, not a transport or tool-contract failure.

A command currently terminated by timeout or output pressure also remains `ok: true` if `runBash` returns its bounded process result. This preserves current behavior. Schema version 1 does not add a separate `timed_out` field because the current implementation does not expose a trustworthy typed timeout flag after completion.

## 5. Public success contract

```json
{
  "codexgpt_tool": "bash",
  "codexgpt_title": "Bash",
  "ok": true,
  "data": {
    "workspace_id": "ws_...",
    "root": "D:\\Dev\\codexgpt",
    "command": "npm run build",
    "cwd": ".",
    "exitCode": 0,
    "signal": null,
    "durationMs": 1842,
    "stdout": "...",
    "stderr": "",
    "truncated": false,
    "bash_session_id": null
  },
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 1845,
    "warnings": []
  }
}
```

### Success data fields

1. `workspace_id`: non-empty workspace identifier.
2. `root`: workspace root display string.
3. `command`: the exact submitted command string after MCP input parsing; non-empty.
4. `cwd`: normalized workspace-relative working directory; `.` for the workspace root.
5. `exitCode`: non-negative integer or `null` when the process ended without an exit code.
6. `signal`: non-empty bounded signal string or `null`.
7. `durationMs`: non-negative execution duration reported by the provider.
8. `stdout`: bounded and redacted standard output.
9. `stderr`: bounded and redacted standard error, including the existing timeout marker when applicable.
10. `truncated`: whether either output stream was truncated.
11. `bash_session_id`: the configured matching Bash session id, or `null`.

Unknown fields are rejected. All eleven fields live only under `data`.

The current provider's internal optional `bashSessionId` property is not exposed publicly. Returning both `bashSessionId` and `bash_session_id` was an accidental flat-result artifact, not a supported schema contract.

No `passed`, `failed`, `timed_out`, `backend`, `pid`, `process_id`, `output_cursor`, `executed_project_code`, or sandbox guarantee is added.

## 6. Internal provider contract

Add:

```ts
export interface BashProviderContext {
  config: CodexGPTConfig;
  guard: PathGuard;
  workspace: Workspace;
  command: string;
  options: {
    cwd?: string;
    timeoutMs?: number;
    sessionId?: string;
  };
}
```

Extend `CodexGPTServerDependencies` with:

```ts
bashResultProvider?: (
  context: BashProviderContext
) => BashResult | Promise<BashResult>;
```

The production provider calls the existing `runBash` function. Contract tests inject deterministic providers. No production test mode, hidden MCP argument, environment switch, or global mutable override is allowed.

The strict provider result contains exactly:

```ts
{
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  bashSessionId?: string;
}
```

Provider validation requires:

- non-empty command and `cwd`;
- non-negative integer `exitCode` when non-null;
- non-empty bounded signal when non-null;
- non-negative duration;
- string output streams;
- boolean `truncated`;
- a valid 1–64 character session id when present;
- no unknown fields.

After schema parsing, the handler must verify:

1. the returned command exactly equals the submitted command;
2. the production provider retains its existing `PathGuard` resolution before process spawn;
3. after a provider result is strictly parsed, the handler independently resolves the requested `cwd` and derives the expected normalized workspace-relative value before constructing success;
4. the returned `cwd` exactly equals that normalized expected value;
5. when the server has a configured Bash session id, the provider returns that exact id;
6. when the server has no configured Bash session id, the provider does not return one.

Malformed provider results or mismatched command, `cwd`, or session values become `INTERNAL_ERROR`.

## 7. Public failure contract

```json
{
  "codexgpt_tool": "bash",
  "codexgpt_title": "Bash",
  "ok": false,
  "data": null,
  "error": {
    "code": "COMMAND_POLICY_DENIED",
    "message": "The command is not allowed by the current Bash policy.",
    "retryable": false,
    "details": {
      "reason": "not_allowlisted"
    }
  },
  "meta": {
    "schemaVersion": 1,
    "durationMs": 1,
    "warnings": []
  }
}
```

Approved schema-v1 errors:

1. `WORKSPACE_NOT_FOUND`
2. `INVALID_ARGUMENT`
3. `BASH_SESSION_CONFIGURATION_INVALID`
4. `BASH_SESSION_REQUIRED`
5. `BASH_SESSION_MISMATCH`
6. `COMMAND_POLICY_DENIED`
7. `SHELL_BACKEND_UNAVAILABLE`
8. `PATH_OUTSIDE_WORKSPACE`
9. `PATH_BLOCKED`
10. `COMMAND_START_FAILED`
11. `INTERNAL_ERROR`

All are non-retryable in schema version 1. Automatic retry is unsafe for a command whose start state may be uncertain, and policy or configuration failures require a changed request or server state.

There is no `BASH_DISABLED` error because the tool is not registered when `bashMode` is `off`.

There is no `COMMAND_FAILED` error because a non-zero exit code is a valid process outcome under `ok: true`.

There is no `COMMAND_TIMEOUT` error in schema version 1 because the current provider resolves timeouts as bounded process outcomes rather than throwing a typed timeout failure.

### Fixed public messages

- `WORKSPACE_NOT_FOUND`: `The requested workspace is not available. Open the workspace before retrying.`
- `INVALID_ARGUMENT`: `The Bash request contains an invalid argument.`
- `BASH_SESSION_CONFIGURATION_INVALID`: `The Bash session guard is enabled but the server session configuration is invalid.`
- `BASH_SESSION_REQUIRED`: `A Bash session id is required for this server.`
- `BASH_SESSION_MISMATCH`: `The provided Bash session id does not match this server.`
- `COMMAND_POLICY_DENIED`: `The command is not allowed by the current Bash policy.`
- `SHELL_BACKEND_UNAVAILABLE`: `The Bash backend is unavailable on this server.`
- `PATH_OUTSIDE_WORKSPACE`: `The requested working directory is outside the permitted workspace boundary.`
- `PATH_BLOCKED`: `The requested working directory is blocked by workspace safety rules.`
- `COMMAND_START_FAILED`: `The Bash process could not be started.`
- `INTERNAL_ERROR`: `The Bash request failed because of an internal error.`

### Error details

- `WORKSPACE_NOT_FOUND`: `{ workspace_id }`, sanitized and length-bounded.
- `INVALID_ARGUMENT`: `{ argument: "command", reason: "empty" }`.
- `BASH_SESSION_CONFIGURATION_INVALID`: `{ reason: "missing_server_session_id" }`.
- `BASH_SESSION_REQUIRED`: `{ expected_session_id }`, containing only the configured bounded session id already exposed by the tool descriptor and server configuration.
- `BASH_SESSION_MISMATCH`: `{ expected_session_id }`, never echoing the submitted mismatching value.
- `COMMAND_POLICY_DENIED`: `{ reason }`, where `reason` is exactly `blocked_pattern` or `not_allowlisted`.
- `SHELL_BACKEND_UNAVAILABLE`: `{ backend: "bash" }`.
- `PATH_OUTSIDE_WORKSPACE`: `{ path }`, containing only a safe normalized workspace-relative display path or `[unsafe path omitted]`.
- `PATH_BLOCKED`: `{ path }`, using the same safe path rule.
- `COMMAND_START_FAILED`: `{ backend: "bash" }`.
- `INTERNAL_ERROR`: strict empty object.

Raw commands, stdout, stderr, environment variables, executable paths, unsafe absolute paths, provided mismatching session ids, operating-system diagnostics, stack traces, exception names, and secret-looking values are never included in public failure fields or failure MCP text.

## 8. Failure classification

The direct handler catches every failure and maps it as follows:

- unknown explicit `workspace_id` -> `WORKSPACE_NOT_FOUND`;
- empty or whitespace-only command -> `INVALID_ARGUMENT`;
- session guard enabled without a configured server id -> `BASH_SESSION_CONFIGURATION_INVALID`;
- required session id omitted -> `BASH_SESSION_REQUIRED`;
- submitted session id differs from the configured id -> `BASH_SESSION_MISMATCH`;
- command matches a current safe-mode blocked pattern -> `COMMAND_POLICY_DENIED` with `blocked_pattern`;
- command is absent from the current safe allowlist -> `COMMAND_POLICY_DENIED` with `not_allowlisted`;
- existing availability probe reports Bash unavailable -> `SHELL_BACKEND_UNAVAILABLE`;
- absolute, escaping, UNC, device, drive-relative, ADS, reserved-name, trailing-dot/space, or parent-symlink escape `cwd` -> `PATH_OUTSIDE_WORKSPACE`;
- blocked or unsafe-symlink `cwd` -> `PATH_BLOCKED`;
- provider or spawn rejection with `ENOENT`, `EACCES`, or `EPERM`, when not already classified as backend unavailable -> `COMMAND_START_FAILED`;
- malformed provider data, command/working-directory/session mismatch, unexpected exceptions, and unclassified conditions -> `INTERNAL_ERROR`.

Classification may inspect the current internal `CodexGPTError` message prefixes and Node error codes, but only fixed public messages and strict bounded details leave the handler. This slice does not create a project-wide typed error hierarchy or change `src/bashOps.ts` policy algorithms.

## 9. Handler flow

The direct handler follows this order:

1. Record the handler start time.
2. Resolve the workspace.
3. Parse the submitted command, optional `cwd`, timeout, and session id.
4. Execute the injected or production provider with the original request values; the production `runBash` path retains its current command/session/policy/backend/`cwd` validation order before process spawn.
5. Strictly parse the provider result.
6. Independently resolve the requested `cwd` through the existing `PathGuard` and derive its normalized workspace-relative value.
7. Validate exact returned command, normalized `cwd`, and session consistency.
8. Construct strict `BashData` with `bash_session_id` only.
9. Preserve the existing compact or full human-readable Bash transcript.
10. Return `createBashSuccess(data)`.
11. On any tool-level failure, classify it, return `createBashFailure(failure)`, and set `isError: true`.

A valid provider result with a non-zero `exitCode`, a non-null `signal`, timeout marker text, or `truncated: true` remains a successful tool result.

## 10. Human-readable MCP content

### Compact transcript

Preserve the current compact summary:

```text
# Bash

`npm run build`

CWD: .
Exit: 0
Duration: 1842 ms
Output: stdout 4 lines, stderr 0 lines.

Raw stdout/stderr are in the structured CodexGPT card. Start with `--bash-transcript full` to print raw output in chat.
```

### Full transcript

Preserve the current command, `cwd`, exit, signal, duration, stdout, and stderr sections.

### Failure transcript

Tool-level failures become fixed and safe:

```text
# Bash Error

Code: COMMAND_POLICY_DENIED
The command is not allowed by the current Bash policy.
```

The submitted command and raw internal diagnostic must not be repeated in failure content.

## 11. Tool Card and wrapper consumers

Update `renderBash(data)` in `src/toolCardWidget.ts` to read the nested envelope.

Successful cards show:

- command-level passed/failed status derived from `exitCode === 0`;
- exit code and optional signal;
- total output-line count;
- execution duration;
- bounded command preview;
- bounded stdout and stderr previews;
- truncation and optional session indicators.

Failure cards show only the stable error code and fixed public message.

The Tool Card distinction between a successful command and a failed command is presentation only. It must not reinterpret envelope `ok`.

The `codexgpt` supertool continues to preserve the child structured result and adds only wrapper identity fields. It must not flatten `data`, overwrite `ok/error/meta`, or restore legacy top-level Bash fields.

## 12. Contract tests

Add `test/bash-contract.test.mjs` covering at least:

1. registration advertises the exact `outputSchema` when Bash is enabled;
2. Bash remains unregistered when mode is `off`;
3. success constructor accepts the exact eleven-field nested data object;
4. strict top-level and nested unknown-field rejection;
5. success requires non-null `data`, null `error`, non-empty command and `cwd`, valid numeric fields, and valid optional session id;
6. failure requires null `data` and one approved non-null error;
7. all eleven stable errors validate with exact fixed messages and details;
8. a real `pwd` command returns a nested successful result;
9. a real command with non-zero exit remains `ok: true` and preserves the exit code;
10. compact transcript omits raw stdout/stderr from chat while retaining them under `data`;
11. full transcript includes raw redacted stdout/stderr in chat;
12. `truncated`, `signal`, and null `exitCode` provider results validate;
13. empty command classification;
14. required and mismatched session classifications without echoing the submitted mismatch;
15. blocked-pattern and not-allowlisted policy classification;
16. unavailable backend classification without exposing executable paths;
17. escaping and blocked `cwd` classifications without unsafe detail leakage;
18. injected start rejection classification;
19. malformed provider objects become `INTERNAL_ERROR`;
20. returned command, `cwd`, or session mismatch becomes `INTERNAL_ERROR`;
21. no accidental public `bashSessionId` field remains;
22. Tool Card reads nested success and failure data;
23. `codexgpt` wrapping preserves the nested direct contract.

Existing Smoke and Stress tests remain authoritative for:

- safe `pwd` execution;
- allowed package scripts;
- command chaining rejection;
- environment expansion rejection;
- unsafe `find` output options;
- unsafe Git output options;
- compact/full transcript behavior;
- session guard behavior;
- no-Bash tool-mode behavior;
- supertool policy preservation;
- native Windows Git Bash execution.

## 13. File-level implementation boundary

Expected files:

- Add `src/tools/schemas/bash.ts`.
- Add `test/bash-contract.test.mjs`.
- Modify `src/server.ts` for schema imports, provider context and dependency, strict provider validation, failure classification, exact tool registration, and nested response construction.
- Modify `src/toolCardWidget.ts` for nested `renderBash` behavior.
- Modify `scripts/smoke.mjs` only for nested Bash result and stable failure assertions.
- Modify `scripts/stress.mjs` only for nested Bash result and stable failure assertions.
- Modify adjacent contract tests only when they intentionally assert Tool Card or wrapper behavior.
- Update `CHANGELOG.md`, `Memory.md`, `AGENTS.md`, this design, the implementation plan, and the active Phase 1 archive after implementation verification.

No change is expected in `src/bashOps.ts`, `src/config.ts`, dependencies, package-lock files, authentication code, profile handling, workspace lifecycle, or Phase 2/3/4 modules.

## 14. Compatibility and security

- Input arguments remain unchanged.
- Tool availability and annotations remain unchanged.
- Compact and full human-readable transcripts remain compatible.
- Structured success intentionally changes from flat fields to schema-v1 nesting.
- Non-zero command exit remains a successful tool-level result.
- Current safe-mode policy remains unchanged and is not represented as a sandbox.
- Current output redaction and byte limits remain unchanged.
- Current timeout and process-kill limitations remain unchanged and documented.
- No raw command or process diagnostic crosses the public failure boundary.
- The submitted session mismatch is not echoed.
- All path details are workspace-relative and sanitized before publication.
- All tool-level failure results set `isError: true`.

## 15. Verification gates for implementation

Run in this order:

1. `node --test test/bash-contract.test.mjs`;
2. adjacent Tool Card, wrapper, configuration, and direct-tool contract tests;
3. `node --test test/*.test.mjs`;
4. `npm run build`;
5. `npm run smoke`;
6. `npm run stress` on native Windows;
7. `git diff --check`;
8. review only intended files changed;
9. confirm no token, secret, private key, raw command failure fixture, unsafe absolute path, executable path, environment value, or raw process diagnostic was introduced;
10. update project memory with exact fresh results.

Cross-platform CI must pass on Ubuntu and Windows with Node 20 and 24 before publication is considered complete.

## 16. Rollback

The slice is independently reversible:

- remove `src/tools/schemas/bash.ts`;
- remove the Bash provider dependency and handler classification additions;
- restore the direct tool's previous flat structured result;
- restore the legacy flat `renderBash` consumer;
- revert focused tests and nested Smoke/Stress access.

Rollback does not require changing the underlying Bash execution algorithm, user configuration, profiles, authentication, dependencies, workspace state, or other Phase 1 tool schemas.

## 17. Known limitations retained deliberately

- Safe Bash is a policy filter, not an operating-system sandbox.
- Verification commands execute repository code with the current user's permissions.
- Timeout currently targets the direct child and does not guarantee termination of the complete Windows process tree.
- Output-pressure termination and timeout do not have separate typed public fields.
- Failure classification remains coupled to current internal message prefixes and Node error codes until a later typed shell error refactor.
- Git Bash remains the temporary native-Windows backend; PowerShell is deferred to Phase 4.

## 18. Design self-review

- Placeholder scan: no `TBD`, `TODO`, or unresolved choice remains.
- Consistency: success fields match the current intentional direct result while removing only the accidental duplicate session field.
- Outcome consistency: non-zero exit remains a command result; tool-level failures alone produce `ok: false`.
- Error consistency: every approved code has one fixed message, exact details, and `retryable: false`.
- Security: raw commands, output, executable paths, environment data, unsafe paths, supplied mismatch ids, and operating-system diagnostics are excluded from failures.
- Scope: only direct `bash` protocol stabilization and necessary consumers/tests are included.
- Phase boundary: PowerShell, process sessions, PTY, Job Objects, shell abstraction, atomic editing, authentication, workspace lifecycle, and Phase 2/3/4 remain excluded.

## 19. Local implementation evidence

The implementation was completed with test-first checkpoints:

- Planning record: `1f66073`.
- Schema contract: `0ddabfc`.
- Direct handler and stable failures: `7a71421`.
- Tool Card, wrapper, Smoke, and Stress consumers: `86350df`.

Fresh verification on native Windows:

- Focused `bash` contracts: 12/12 passed.
- Adjacent `bash`/`server_config`/`apply_patch`/`show_changes` contracts: 46/46 passed.
- Complete `node --test test/*.test.mjs`: 189/189 passed.
- `npm run build`: passed.
- `npm run smoke`: all eight sections passed.
- `npm run stress`: passed, including its internal build.
- `git diff --check`: passed.

The production Bash algorithm, safe allowlist/blocklist, environment policy, timeout and direct-child termination behavior, dependencies, authentication, profiles, and workspace lifecycle remain unchanged. Publication record `a39b779` was pushed on 2026-07-13, and exact-head CI run `29239425311` passed Ubuntu/Windows with Node 20/24.
