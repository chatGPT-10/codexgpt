# Phase 2B Workspace Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace process-global deterministic workspace identifiers with session-scoped opaque lifecycle handles that can be closed, expired, and invalidated without breaking the one-cycle omitted-`workspace_id` compatibility path.

**Architecture:** `WorkspaceManager` becomes a session-local capability registry with a stable internal `workspaceKey`, random public `workspaceId`, idle expiry, close/revoke operations, and strict lookup. `createCodexGPTServer` owns a new manager per server instance, while existing handlers use an explicitly named compatibility resolver. A strict `close_workspace` tool exposes bounded lifecycle control without leaking roots, identity bindings, or revocation reasons.

**Tech Stack:** TypeScript 5.8, Node.js 20/24, MCP SDK 1.17, Zod 3.25, Node test runner, native Windows verification.

## Global Constraints

- Native Windows remains the primary platform; WSL must not become mandatory.
- PowerShell and Git Bash compatibility must remain intact.
- Cloudflare remains only the DNS/TLS/Tunnel entry layer; no third-party Remote MCP relay is introduced.
- Raw credentials, identity keys, canonical root hashes, and revocation reasons must not appear in public error details or logs.
- Existing allowed-root, native-realpath, blocked-glob, Host/Origin, and Windows path protections remain authoritative.
- Existing `open_workspace` and `list_workspaces` strict output contracts remain unchanged.
- No staging, commit, push, publish, destructive Git, or external network mutation is performed without separate user approval.

---

### Task 1: Session-local Workspace Lifecycle Core

**Files:**
- Modify: `src/config.ts`
- Modify: `src/guard.ts`
- Create: `test/workspace-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `CodexGPTConfig.defaultRoot`, `allowedRoots`, `httpSessionTtlMs`, existing Windows path validation.
- Produces: `WorkspaceManager.openWorkspace(root?)`, `getWorkspace(id)`, `resolveWorkspace(id?)`, `closeWorkspace(id)`, `listWorkspaces()`, `revokeAll(reason)`, `revokeForPolicyRevision(revision)`, and exported `workspaceKeyForRoot(root, platform)`.

- [x] **Step 1: Write failing lifecycle tests**

Create deterministic tests using temporary canonical roots, injected clocks, and injected random bytes. Assert:

```js
const managerA = new WorkspaceManager(config, {
  transportSessionId: () => "session-a",
  identityBinding: "identity-a",
  now: () => now,
  randomBytes: () => Buffer.alloc(16, 0x11)
});
const managerB = new WorkspaceManager(config, {
  transportSessionId: () => "session-b",
  identityBinding: "identity-a",
  now: () => now,
  randomBytes: () => Buffer.alloc(16, 0x22)
});
const a = managerA.openWorkspace(root);
const b = managerB.openWorkspace(root);
assert.notEqual(a.id, b.id);
assert.throws(() => managerB.getWorkspace(a.id), /Unknown workspace_id/);
```

Also assert strict missing-ID rejection, compatibility default resolution, same-session reuse, close/reopen ID rotation, idle expiry, bounded cleanup, stable key generation, and policy-revision invalidation.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/workspace-lifecycle.test.mjs`
Expected: FAIL because lifecycle constructor options, random IDs, strict lookup, close, expiry, and revocation do not exist.

- [x] **Step 3: Add bounded configuration**

Add optional `workspaceTtlMs` to `CodexGPTConfig` and load it with:

```ts
workspaceTtlMs: numberFrom(
  process.env.CODEXGPT_WORKSPACE_TTL_MS,
  numberFrom(process.env.CODEXGPT_HTTP_SESSION_TTL_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000),
  60_000,
  24 * 60 * 60_000
)
```

Keeping the interface field optional preserves direct test fixtures; `WorkspaceManager` falls back to `httpSessionTtlMs` when omitted.

- [x] **Step 4: Implement the lifecycle registry**

Replace path-derived public IDs with:

```ts
export function workspaceKeyForRoot(realRoot: string, platform = process.platform): string {
  const normalized = normalizeWorkspaceIdentityPath(realRoot, platform);
  return `wk_${createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
}

function opaqueWorkspaceId(randomBytes: (size: number) => Buffer): string {
  return `ws_${randomBytes(16).toString("hex")}`;
}
```

Maintain `Map<workspaceId, record>` and `Map<workspaceKey, workspaceId>`. Validate current transport session, identity binding, expiry, and policy revision on every strict lookup. `resolveWorkspace(undefined)` is the only compatibility fallback.

- [x] **Step 5: Run focused tests and confirm GREEN**

Run: `node --test test/workspace-lifecycle.test.mjs`
Expected: PASS.

- [x] **Step 6: Record checkpoint without committing**

Review Task 1 with `show_changes` scoped to the three files. Do not stage or commit.

---

### Task 2: Remove Process-global Sharing and Wire Policy Context

**Files:**
- Modify: `src/server.ts`
- Modify: `src/policy/runtime.ts`
- Modify: `src/policy/toolPolicy.ts`
- Modify: `src/http.ts` only if deterministic shutdown coverage requires an explicit server/session cleanup hook.
- Test: `test/workspace-lifecycle.test.mjs`
- Test: `test/policy-kernel-gate.test.mjs`

**Interfaces:**
- Consumes: Task 1 `WorkspaceManager` lifecycle API and `PolicySessionContextSource`.
- Produces: one manager per `createCodexGPTServer` invocation; strict Policy Kernel workspace resolution; explicit compatibility resolution in existing tool handlers.

- [x] **Step 1: Add failing cross-server integration tests**

Create two in-memory MCP servers with identical config. Open the same root through both clients and assert distinct IDs. Pass the first server's ID to the second server's `tree` or `read` tool and assert the existing safe `WORKSPACE_NOT_FOUND` contract.

Also assert that an omitted `workspace_id` still resolves only the current server's configured default root.

- [x] **Step 2: Run integration tests and confirm RED**

Run: `node --test test/workspace-lifecycle.test.mjs test/policy-kernel-gate.test.mjs`
Expected: FAIL because `getSharedWorkspaceManager` currently shares identifiers across servers.

- [x] **Step 3: Delete the shared registry**

Remove:

```ts
const workspaceManagers = new Map<string, WorkspaceManager>();
function workspaceManagerKey(...) { ... }
function getSharedWorkspaceManager(...) { ... }
```

Construct a new manager inside `createCodexGPTServer`:

```ts
const workspaces = new WorkspaceManager(config, workspaceBindingForServer(dependencies.policySessionContextSource));
```

The default binding must be unique per server instance and contain no raw credential.

- [x] **Step 4: Move fallback to the explicit boundary**

Change existing server handlers from:

```ts
workspaces.getWorkspace(args.workspace_id)
```

to:

```ts
workspaces.resolveWorkspace(args.workspace_id)
```

Keep `getWorkspace(id)` strict. Update Policy Kernel resource resolution so an explicit ID uses strict `getWorkspace`, while omitted legacy input calls the compatibility resolver at one centralized point.

- [x] **Step 5: Preserve policy and grant bindings**

Keep request contexts bound to `transportSessionId`, credential reference, workspace ID, and policy revision. Ensure stale/foreign workspace IDs fail before resource side effects. Add the lifecycle definition for `close_workspace` in Task 3.

- [x] **Step 6: Run integration tests and confirm GREEN**

Run: `node --test test/workspace-lifecycle.test.mjs test/policy-kernel-gate.test.mjs`
Expected: PASS.

- [x] **Step 7: Record checkpoint without committing**

Review exact server/policy changes with `show_changes`. Do not stage or commit.

---

### Task 3: Add the Strict close_workspace Tool

**Files:**
- Create: `src/tools/schemas/closeWorkspace.ts`
- Modify: `src/tools/schemas/codexgpt.ts`
- Modify: `src/server.ts`
- Modify: `src/policy/toolPolicy.ts`
- Modify: `src/toolCardWidget.ts` only for safe title/icon categorization if required by existing exhaustive mappings.
- Create: `test/close-workspace-contract.test.mjs`
- Modify: supertool and inventory contract tests whose canonical tool counts are intentionally exhaustive.

**Interfaces:**
- Consumes: `WorkspaceManager.closeWorkspace(id)`.
- Produces: exact `closeWorkspaceOutputSchema`, `createCloseWorkspaceSuccess`, `createCloseWorkspaceFailure`, canonical child action `close_workspace`.

- [x] **Step 1: Write the exact contract tests**

Assert the strict success envelope:

```js
{
  codexgpt_tool: "close_workspace",
  codexgpt_title: "Close Workspace",
  ok: true,
  data: {
    workspace_id: "ws_...",
    closed_at: "2026-07-14T00:00:00.000Z",
    state: "closed"
  },
  error: null,
  meta: { schemaVersion: 1, durationMs: 0, warnings: [] }
}
```

Assert strict additional-field rejection, safe `WORKSPACE_NOT_FOUND`, all three tool modes, direct/supertool parity, immediate post-close rejection, and reopen ID rotation.

- [x] **Step 2: Run contract tests and confirm RED**

Run: `node --test test/close-workspace-contract.test.mjs`
Expected: FAIL because the schema and tool do not exist.

- [x] **Step 3: Implement the schema constructors**

Use the repository's existing strict envelope pattern. Failure details contain only a sanitized `workspace_id`; no root, key, identity, or revocation reason.

- [x] **Step 4: Register the canonical lifecycle tool**

Add `close_workspace` to minimal, standard, full, supertool canonical actions, child schema mapping, and Policy Kernel definitions. Use:

```ts
close_workspace: Object.freeze({
  riskClass: "R1",
  requiredScope: "workspace:open",
  resourceMode: "context_only"
})
```

Register a handler requiring `workspace_id`, call `workspaces.closeWorkspace`, and return the strict result.

- [x] **Step 5: Run focused contracts and confirm GREEN**

Run: `node --test test/close-workspace-contract.test.mjs test/codexgpt-supertool-contract.test.mjs`
Expected: PASS.

- [x] **Step 6: Record checkpoint without committing**

Review schema, server, policy, and tests. Do not stage or commit.

---

### Task 4: Documentation, Memory, and Complete Verification

**Files:**
- Modify: `Memory.md`
- Create: `docs/memory/archive/phase-2b-workspace-lifecycle.md`
- Modify: `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md` only to record completion evidence without changing future phase scope.
- Modify: `README.md`, `README_ZH.md`, `FAQ.md`, `FAQ_ZH.md`, or `config.example.env` only where the new TTL or close lifecycle is user-facing.

**Interfaces:**
- Consumes: completed Tasks 1–3 and all verification evidence.
- Produces: reproducible Phase 2B closure record and next-step pointer.

- [x] **Step 1: Run the complete regression suite**

Run the repository's full Node test command discovered from the current established gate. Expected: all tests pass with the new expected test/tool count.

- [x] **Step 2: Run Build**

Run: `npm run build`
Expected: exit 0 with no TypeScript errors.

- [x] **Step 3: Run all eight Smoke segments**

Run: `npm run smoke`
Expected: all eight segments pass.

- [x] **Step 4: Run native Windows Stress**

Run: `npm run stress`
Expected: exit 0 on native Windows.

- [x] **Step 5: Run package dry-run**

Run: `npm pack --dry-run`
Expected: exit 0; no internal memory archive or secret-bearing file is packaged.

- [x] **Step 6: Run static scope and secret-shape checks**

Use targeted repository searches and `show_changes` to prove:

- no process-global `workspaceManagers` registry remains;
- no deterministic `workspaceIdForRoot` remains;
- no core call uses `getWorkspace` with an omitted/optional identifier;
- no raw token, identity key, credential, or private path was added to output/error schemas;
- changes are confined to Phase 2B lifecycle, contracts, tests, and documentation.

- [x] **Step 7: Update memory and archive**

Record exact completed behavior, test counts, Build/Smoke/Stress/package evidence, remaining limitations, and the next authorized Phase 2 step. Keep root `Memory.md` concise; place detailed evidence in the new Phase 2B archive.

- [x] **Step 8: Final review**

Run `show_changes` once with the complete diff. Resolve any incorrect scope, stale text, or accidental artifact. Leave all changes unstaged for user review.
