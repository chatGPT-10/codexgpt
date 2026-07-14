# Phase 2A Policy Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a versioned, deterministic, fail-closed local Policy Kernel with RequestContext/RequestIdentity, conservative compatibility migration, bounded approvals, safe provenance, transport-aware identity, and a central authorization boundary without implementing Phase 2B workspace lifecycle or a production OS sandbox.

**Architecture:** Add focused modules under `src/policy/` that validate and compile Permission Profile V1 documents into immutable snapshots, normalize tool requests into resource descriptors, evaluate hard policy/scopes/profile/grants deterministically, and return either allow, approval-required, deny, or enforcement-unavailable. Preserve current behavior behind `legacy`, compare decisions in `shadow`, and make `enforce` opt-in; integrate at the registered-tool boundary so direct tools and the `codexpro` supertool share the same policy path.

**Tech Stack:** TypeScript 5.8, Node.js 20+, Zod 3, Node built-ins (`crypto`, `fs`, `path`, `url`, `net`, `async_hooks`), MCP SDK 1.17, native Windows and Ubuntu test matrix.

**Status:** Published and formally closed on 2026-07-14. Implementation commit `e6798b6` plus Linux-path test repair `dea25ec` passed exact-head CI run `29326459987` on Ubuntu/Windows Node 20/24; every job completed Build, Regression Tests, Smoke Test, and Check Package Contents.

## Global Constraints

- Native Windows is the primary platform; WSL must not become mandatory.
- No new runtime dependency is added in Phase 2A.
- Cloudflare remains DNS/TLS/Tunnel ingress only and is not an authorization or outbound-network enforcement layer.
- Tool Surface, Policy, Approval, and Sandbox remain separate.
- Approval cannot exceed hard policy, allowed roots, identity scopes, Permission Profile, or deployment capability ceilings.
- `CODEXPRO_POLICY_ENGINE` accepts exactly `legacy`, `shadow`, or `enforce`; the migration-cycle default is `legacy`.
- Existing `toolMode`, `writeMode`, and `bashMode` remain readable for at least one migration cycle.
- Production policy failures occur before the existing Phase 1 tool result envelope; return an MCP tool-error result with `isError: true`, bounded text, no `structuredContent`, and a non-enumerable internal brand. Do not add policy codes to all twenty-eight Phase 1 output schemas.
- Query-token and Bearer modes are shared-secret identities, not human subjects.
- Raw Tokens, Authorization/Cookie headers, credential URLs, full commands, file contents, private keys, browser data, and sensitive absolute paths never enter context, policy output, audit facts, tests, or logs.
- Safe Bash remains a command policy filter, not an OS sandbox.
- Absence or partial availability of a required enforcement capability fails closed.
- Phase 2A does not implement OAuth 2.1, Phase 2B workspace ownership/expiry, persistent audit storage, persistent processes, native PowerShell execution, Hooks, Skills trust, semantic providers, Git remote writes, or complete Windows sandboxing.
- Every behavior change uses TDD. Run the focused test first, then adjacent policy tests, then the complete regression, Build, Smoke, native-Windows Stress, package dry-run, static checks, and protected-source checks before completion.
- Staging, commit, push, destructive Git actions, system-policy changes, and candidate sandbox installation require the explicit approval required by `AGENTS.md`; plan commit steps are review checkpoints, not automatic authorization.

---

## File Structure

Create:

- `src/policy/types.ts` — stable V1 types and error/reason vocabularies.
- `src/policy/schemas.ts` — strict Zod schemas for profiles, contexts, resources, decisions, grants, audit events, and capability reports.
- `src/policy/profileStore.ts` — permission-profile path resolution, strict reads, inheritance, source hashes, and immutable snapshot loading.
- `src/policy/resources.ts` — filesystem, Git, Shell, Process, and Network resource normalization/fingerprints.
- `src/policy/hardPolicy.ts` — code-owned immutable deny registry and safe rule IDs.
- `src/policy/evaluator.ts` — pure deterministic ceiling/grant evaluator.
- `src/policy/approval.ts` — bounded approval requests and process-local SessionGrant store.
- `src/policy/identity.ts` — identity-key store, credential references, and transport identity mapping.
- `src/policy/context.ts` — request-context source and immutable context construction.
- `src/policy/compat.ts` — conservative compiler from current runtime modes to Permission Profile V1.
- `src/policy/enforcement.ts` — capability reports and required-capability comparison.
- `src/policy/audit.ts` — redacted in-memory audit-event construction.
- `src/policy/toolPolicy.ts` — canonical tool/action-to-resource mapping and risk classification.
- `src/policy/integration.ts` — registered-tool wrappers, legacy/shadow/enforce routing, policy error result, and supertool propagation.
- `scripts/policy-windows-spike.mjs` — controlled synthetic Windows capability probe.
- `test/policyFixtures.mjs` — deterministic synthetic builders shared by policy tests; no real user paths or credentials.
- `test/policy-schema.test.mjs`
- `test/policy-profile-store.test.mjs`
- `test/policy-resources.test.mjs`
- `test/policy-evaluator.test.mjs`
- `test/policy-approval.test.mjs`
- `test/policy-identity-context.test.mjs`
- `test/policy-compat.test.mjs`
- `test/policy-enforcement-audit.test.mjs`
- `test/policy-integration.test.mjs`
- `test/policy-transport.test.mjs`
- `test/policy-windows-spike.test.mjs`

Modify:

- `src/config.ts` — policy-engine mode and permission-profile selection.
- `src/profileStore.ts` — RuntimeProfile fields only; preserve secret sanitization.
- `src/http.ts` — strict admin-profile fields, authentication-mode capture, and session context source.
- `src/stdio.ts` — process-lifetime STDIO session context source.
- `src/server.ts` — inject policy runtime and run one registration-finalization wrapper.
- `src/codexproSupertool.ts` — propagate branded policy failures without converting them into `CHILD_RESULT_INVALID`.
- `src/tools/schemas/serverConfig.ts` — expose safe policy mode/profile/revision/capability summary.
- `src/selfTestOps.ts` and `src/tools/schemas/codexproSelfTest.ts` — add bounded policy diagnostics without changing source files during probes.
- `src/toolCardWidget.ts` — display safe policy mode/revision and enforcement status.
- `scripts/stress-contract-compat.mjs` — add exact fail-closed Windows-safe policy fixtures; keep `scripts/stress.mjs` unchanged.
- `config.example.env`, `README.md`, `README_ZH.md`, `SECURITY.md`, `FAQ.md`, `FAQ_ZH.md` — exact migration and security-claim documentation.
- `Memory.md`, `AGENTS.md`, `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/memory/archive/policy-kernel-gate.md` — implementation status and verification evidence.

---

### Task 1: Freeze Policy V1 Types and Strict Schemas

**Files:**
- Create: `src/policy/types.ts`
- Create: `src/policy/schemas.ts`
- Create: `test/policyFixtures.mjs`
- Test: `test/policy-schema.test.mjs`

**Interfaces:**
- Consumes: Zod and Node platform type names.
- Produces: `PermissionProfileDocumentV1`, `CompiledPolicySnapshotV1`, `RequestIdentityV1`, `RequestContextV1`, `ResourceDescriptorV1`, `PolicyDecisionV1`, `SessionGrantV1`, `AuditEventV1`, `SandboxCapabilityReportV1`, and strict Zod schemas with the same names ending in `Schema`.
- Test fixtures: `makePolicyHome`, `config`, `loadConfigWith`, `fixture`, `filesystem`, `shell`, `capabilityReport`, `exactGrant`, `resource`, `auditInput`, `withPolicyClient`, `denyAllProfile`, `initializeHttpSession`, and `fakeExecutor`. Each test file defines its synthetic file-local `workspace`, `guard`, `context`, `state`, `source`, `key`, `scopes`, `store`, `fixtureRoot`, `TEST_TOKEN`, and `READ_SCOPES` before the first test.

- [x] **Step 1: Write failing schema tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  permissionProfileDocumentV1Schema,
  requestIdentityV1Schema,
  policyDecisionV1Schema
} = await tsImport("../src/policy/schemas.ts", import.meta.url);

test("Permission Profile V1 rejects unknown fields and applies no implicit access", () => {
  assert.throws(() => permissionProfileDocumentV1Schema.parse({
    schemaVersion: 1,
    id: "review",
    unknown: true
  }));
});

test("shared-secret identity cannot invent a subject", () => {
  assert.throws(() => requestIdentityV1Schema.parse({
    schemaVersion: 1,
    kind: "shared_secret_bearer",
    authenticationMode: "bearer",
    credentialRef: "cred_0123456789abcdef",
    subject: "user-1",
    scopes: ["filesystem:read"],
    assuranceLevel: "shared_secret"
  }));
});

test("policy decisions use the closed outcome vocabulary", () => {
  assert.throws(() => policyDecisionV1Schema.parse({
    schemaVersion: 1,
    decisionId: "decision-1",
    outcome: "maybe",
    reasonCode: "POLICY_DENIED",
    policyRevision: "policy-1",
    resourceFingerprint: "sha256:abc",
    requiredApproval: null,
    requiredEnforcement: [],
    provenance: []
  }));
});
```

- [x] **Step 2: Run the tests and verify RED**

Run: `node --test test/policy-schema.test.mjs`

Expected: FAIL because `src/policy/schemas.ts` does not exist.

- [x] **Step 3: Implement the V1 type vocabulary**

```ts
export const POLICY_SCOPES = [
  "workspace:open",
  "filesystem:read",
  "filesystem:write",
  "git:read",
  "git:write",
  "git:remote-write",
  "shell:verify",
  "shell:execute",
  "process:manage",
  "network:connect",
  "audit:read",
  "admin:profile",
  "admin:credentials"
] as const;

export type PolicyScope = typeof POLICY_SCOPES[number];
export type PolicyOutcome = "allow" | "deny" | "approval_required" | "enforcement_unavailable";
export type PolicyReasonCode =
  | "POLICY_DENIED"
  | "APPROVAL_REQUIRED"
  | "POLICY_CONTEXT_STALE"
  | "POLICY_RESOURCE_INVALID"
  | "POLICY_CONFIG_INVALID"
  | "SHELL_SANDBOX_UNAVAILABLE"
  | "PROCESS_SANDBOX_UNAVAILABLE"
  | "NETWORK_ENFORCEMENT_UNAVAILABLE";

export type FilesystemAccess = "deny" | "read" | "write";
export type PolicyEngineMode = "legacy" | "shadow" | "enforce";
export type RiskClass = "R0" | "R1" | "R2" | "R3" | "R4";
```

Define every V1 interface exactly as approved in the four Gate specifications. Keep `ResourceDescriptorV1` as a closed discriminated union and include `schemaVersion: 1` on every serialized object.

- [x] **Step 4: Implement strict Zod schemas and cross-field refinements**

```ts
export const requestIdentityV1Schema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum([
    "local_process",
    "loopback_unauthenticated",
    "shared_secret_query",
    "shared_secret_bearer",
    "oauth_subject"
  ]),
  authenticationMode: z.enum(["stdio", "loopback_none", "query_token", "bearer", "oauth2"]),
  credentialRef: z.string().regex(/^cred_[a-z2-7]{16,52}$/).nullable(),
  subject: z.string().min(1).max(240).nullable(),
  scopes: z.array(z.enum(POLICY_SCOPES)).max(POLICY_SCOPES.length),
  assuranceLevel: z.enum(["local", "low", "shared_secret", "strong"])
}).strict().superRefine((value, context) => {
  const shared = value.kind === "shared_secret_query" || value.kind === "shared_secret_bearer";
  if (shared && value.subject !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["subject"], message: "Shared credentials cannot define a subject." });
  }
  if (value.kind === "oauth_subject" && value.subject === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["subject"], message: "OAuth identities require a subject." });
  }
});
```

All schemas use `.strict()`. Reject unknown versions, unknown scopes, invalid risk classes, inconsistent success/refusal fields, invalid capability levels, and a persistent process profile with `manage: false`.

- [x] **Step 5: Run focused tests and Build**

Run: `node --test test/policy-schema.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 6: Review checkpoint**

Use `show_changes` for only the three Task 1 files. Do not stage or commit without explicit approval.

---

### Task 2: Implement Permission Profile Storage, Inheritance, and Snapshot Identity

**Files:**
- Create: `src/policy/profileStore.ts`
- Modify: `src/profileStore.ts`
- Test: `test/policy-profile-store.test.mjs`

**Interfaces:**
- Consumes: `permissionProfileDocumentV1Schema`, `codexProHome()`, native realpath, SHA-256.
- Produces:
  - `permissionDir(): string`
  - `permissionProfilePath(id: string): string`
  - `loadPermissionProfileGraph(id: string, options?: { maxDepth?: number }): LoadedPermissionProfileGraph`
  - `compilePermissionProfile(graph, platform): CompiledPermissionProfileV1`
  - `policyRevisionForSources(sourceHashes, hardPolicyRevision, capabilityRevision): string`

- [x] **Step 1: Write failing profile-store tests**

```js
test("profile inheritance is parent-first, bounded, and hash recorded", async () => {
  const root = await makePolicyHome({
    "base.json": { schemaVersion: 1, id: "base", filesystem: { default: "deny", rules: [] } },
    "child.json": { schemaVersion: 1, id: "child", extends: "base", git: { read: true } }
  });
  const graph = loadPermissionProfileGraph("child", { home: root });
  assert.deepEqual(graph.order, ["base", "child"]);
  assert.equal(graph.sourceHashes.length, 2);
});

test("profile cycles and depth above eight fail closed", async () => {
  const root = await makePolicyHome({
    "a.json": { schemaVersion: 1, id: "a", extends: "b" },
    "b.json": { schemaVersion: 1, id: "b", extends: "a" }
  });
  assert.throws(() => loadPermissionProfileGraph("a", { home: root }), /cycle/i);
});
```

- [x] **Step 2: Run the tests and verify RED**

Run: `node --test test/policy-profile-store.test.mjs`

Expected: FAIL because the profile store is absent.

- [x] **Step 3: Add exact profile-ID and path rules**

```ts
const PROFILE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function permissionDir(home = codexProHome()): string {
  return path.join(home, "permissions");
}

export function permissionProfilePath(id: string, home = codexProHome()): string {
  if (!PROFILE_ID.test(id)) throw new PolicyConfigError("Invalid permission profile id.");
  return path.join(permissionDir(home), `${id}.json`);
}
```

Read at most 256 KiB per document, require a regular file, reject symlinked profile files, validate the document before following `extends`, and record SHA-256 over exact file bytes.

- [x] **Step 4: Implement deterministic inheritance and defaults**

```ts
export function loadPermissionProfileGraph(
  id: string,
  options: { home?: string; maxDepth?: number } = {}
): LoadedPermissionProfileGraph {
  const maxDepth = options.maxDepth ?? 8;
  const visited = new Set<string>();
  const active = new Set<string>();
  const order: PermissionProfileDocumentV1[] = [];
  const sourceHashes: PolicySourceHash[] = [];

  const visit = (currentId: string, depth: number): void => {
    if (depth > maxDepth) throw new PolicyConfigError("Permission profile inheritance exceeds eight levels.");
    if (active.has(currentId)) throw new PolicyConfigError("Permission profile inheritance cycle detected.");
    if (visited.has(currentId)) return;
    active.add(currentId);
    const loaded = readAndValidateProfile(currentId, options.home);
    if (loaded.document.extends) visit(loaded.document.extends, depth + 1);
    active.delete(currentId);
    visited.add(currentId);
    order.push(loaded.document);
    sourceHashes.push({ id: currentId, sha256: loaded.sha256 });
  };

  visit(id, 1);
  return { id, order, sourceHashes };
}
```

Merge parent-first, reject duplicate normalized rule IDs/selectors with conflicting access, then apply V1 defaults. The compiled result contains no mutable arrays or objects; recursively freeze it.

- [x] **Step 5: Run focused tests and Build**

Run: `node --test test/policy-profile-store.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 6: Review checkpoint**

Confirm only profile-store files and tests changed. Do not stage or commit without explicit approval.

---

### Task 3: Normalize Filesystem, Git, Shell, Process, and Network Resources

**Files:**
- Create: `src/policy/resources.ts`
- Modify: `src/guard.ts`
- Test: `test/policy-resources.test.mjs`
- Adjacent test: `test/path-policy.test.mjs`

**Interfaces:**
- Consumes: `Workspace`, `PathGuard`, `assertSafePathInput`, `displayPath`, `domainToASCII`, `net.isIP`.
- Produces:
  - `describeFilesystemResource(...)`
  - `describeGitResource(...)`
  - `describeShellResource(...)`
  - `describeProcessResource(...)`
  - `describeNetworkResource(...)`
  - `fingerprintResource(resource): string`

- [x] **Step 1: Write failing normalization tests**

```js
test("Windows filesystem comparison keys are case-insensitive and slash normalized", async () => {
  const one = describeFilesystemResource({ platform: "win32", workspace, guard, operation: "read", inputPath: "SRC\\File.ts" });
  const two = describeFilesystemResource({ platform: "win32", workspace, guard, operation: "read", inputPath: "src/file.ts" });
  assert.equal(one.comparisonKey, two.comparisonKey);
});

test("non-existent write targets retain a validated unresolved suffix", async () => {
  const resource = describeFilesystemResource({ platform: process.platform, workspace, guard, operation: "write", inputPath: "new/deep/file.ts" });
  assert.equal(resource.targetExists, false);
  assert.deepEqual(resource.unresolvedSuffix, ["new", "deep", "file.ts"]);
});

test("network normalization distinguishes exact host wildcard and IP literal", () => {
  assert.equal(normalizeNetworkHost("EXAMPLE.COM."), "example.com");
  assert.equal(normalizeNetworkHost("[2001:db8::10]"), "2001:db8::10");
  assert.throws(() => normalizeNetworkHost("api.*.example.com"));
});
```

- [x] **Step 2: Run RED tests**

Run: `node --test test/policy-resources.test.mjs`

Expected: FAIL because resource functions are absent.

- [x] **Step 3: Add a stable path-resolution fact type without weakening `PathGuard`**

```ts
export interface PolicyPathFacts {
  absPath: string;
  relPath: string;
  comparisonKey: string;
  targetExists: boolean;
  existingParent: string;
  existingParentIdentity: string;
  unresolvedSuffix: string[];
}
```

Add one `PathGuard.resolvePolicyFacts(workspace, inputPath, { forWrite })` method that calls the existing `resolve` path first, performs no broader acceptance, and returns facts needed by policy. Preserve all existing special-path, blocked-glob, symlink, junction, and allowed-root failures.

- [x] **Step 4: Implement filesystem and Git descriptors**

```ts
export function describeFilesystemResource(input: DescribeFilesystemInput): FilesystemResourceV1 {
  const facts = input.guard.resolvePolicyFacts(input.workspace, input.inputPath, {
    forWrite: input.operation !== "read" && input.operation !== "list"
  });
  const resource = filesystemResourceV1Schema.parse({
    schemaVersion: 1,
    kind: "filesystem",
    operation: input.operation,
    workspaceId: input.workspace.id,
    relativePath: facts.relPath,
    comparisonKey: facts.comparisonKey,
    targetExists: facts.targetExists,
    existingParentIdentity: facts.existingParentIdentity,
    unresolvedSuffix: facts.unresolvedSuffix,
    resourceFingerprint: ""
  });
  return { ...resource, resourceFingerprint: fingerprintResource(resource) };
}
```

Git descriptors include operation, repository identity, normalized relative paths, refs, remote name, and remote host. Do not read `.git/**` through file tools.

- [x] **Step 5: Implement opaque Shell/Process and strict Network descriptors**

```ts
export function describeShellResource(input: DescribeShellInput): ShellResourceV1 {
  const commandDigest = sha256Utf8(input.command);
  return shellResourceV1Schema.parse({
    schemaVersion: 1,
    kind: "shell",
    operation: input.operation,
    workspaceId: input.workspace.id,
    backend: input.backend,
    cwd: input.cwd,
    commandKind: input.commandKind,
    executable: input.executable,
    argumentCount: input.argumentCount,
    commandDigest,
    persistence: false,
    requestedNetwork: input.requestedNetwork,
    resourceFingerprint: fingerprintObject({ commandDigest, cwd: input.cwd, backend: input.backend })
  });
}
```

Network host forms are exact DNS, `*.suffix`, `**.suffix`, exact IPv4, or exact IPv6. Reject CIDR and middle-label wildcards. Normalize scheme/port, classify every resolved address, and make every redirect a new resource.

- [x] **Step 6: Run focused and adjacent tests**

Run: `node --test test/policy-resources.test.mjs test/path-policy.test.mjs`

Expected: PASS with platform-specific symlink/junction skips unchanged.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 7: Review checkpoint**

Confirm `guard.ts` only adds fact extraction and does not broaden accepted paths.

---

### Task 4: Implement Immutable Hard Policy and the Pure Deterministic Evaluator

**Files:**
- Create: `src/policy/hardPolicy.ts`
- Create: `src/policy/evaluator.ts`
- Test: `test/policy-evaluator.test.mjs`

**Interfaces:**
- Consumes: compiled profile, identity scopes, resource descriptor, capability report, current grants.
- Produces:
  - `HARD_POLICY_REVISION`
  - `evaluateHardPolicy(resource, deployment): HardPolicyMatch[]`
  - `evaluatePolicy(input: EvaluatePolicyInput): PolicyDecisionV1`

- [x] **Step 1: Write failing evaluator matrix tests**

```js
test("hard deny wins over profile allow and approval grant", () => {
  const decision = evaluatePolicy(fixture({
    resource: filesystem(".env", "read"),
    profileAccess: "write",
    scopes: ["filesystem:read", "filesystem:write"],
    grant: exactGrant(".env")
  }));
  assert.equal(decision.outcome, "deny");
  assert.equal(decision.reasonCode, "POLICY_DENIED");
  assert.equal(decision.provenance[0].sourceKind, "hard_policy");
});

test("same normalized input produces byte-identical decision facts", () => {
  const input = fixture({ resource: filesystem("src/index.ts", "read") });
  assert.deepEqual(evaluatePolicy(input), evaluatePolicy(input));
});

test("missing enforcement capability fails closed before grant evaluation", () => {
  const decision = evaluatePolicy(fixture({
    resource: shell("npm test"),
    requiredCapabilities: ["processTreeControl", "networkEgressControl"],
    capabilities: capabilityReport({ processTreeControl: "job_object", networkEgressControl: "none" })
  }));
  assert.equal(decision.outcome, "enforcement_unavailable");
  assert.equal(decision.reasonCode, "SHELL_SANDBOX_UNAVAILABLE");
});
```

- [x] **Step 2: Run RED tests**

Run: `node --test test/policy-evaluator.test.mjs`

Expected: FAIL because evaluator modules are absent.

- [x] **Step 3: Implement code-owned hard deny rules**

```ts
export const HARD_POLICY_REVISION = "hard-policy-v1";

export const HARD_POLICY_RULES: readonly HardPolicyRule[] = Object.freeze([
  { id: "hard.fs.secret.env", kind: "filesystem", match: (r) => isEnvFamily(r.relativePath) },
  { id: "hard.fs.private-key", kind: "filesystem", match: (r) => isPrivateKeyPath(r.relativePath) },
  { id: "hard.fs.git-direct", kind: "filesystem", match: (r) => isGitMetadataPath(r.relativePath) },
  { id: "hard.fs.escape", kind: "filesystem", match: (r) => r.containment !== "inside" },
  { id: "hard.deployment.disabled", kind: "any", match: (_r, d) => d.capabilityDisabled }
]);
```

Keep safe IDs stable. Do not expose raw configured roots or secret path patterns in public provenance.

- [x] **Step 4: Implement exact/subtree/deny-glob and Network specificity**

```ts
export function compareFilesystemSpecificity(a: FilesystemSpecificity, b: FilesystemSpecificity): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

const ACCESS_TIE_PRIORITY = { write: 0, read: 1, deny: 2 } as const;
```

Collect matches, select the highest specificity tuple, and choose `deny`, then `read`, then `write` on an exact tie. Declaration order never decides.

- [x] **Step 5: Implement the pure evaluation sequence**

```ts
export function evaluatePolicy(input: EvaluatePolicyInput): PolicyDecisionV1 {
  const hard = evaluateHardPolicy(input.resource, input.deployment);
  if (hard.length > 0) return deniedDecision(input, "hard_policy", hard[0].id);

  const requiredScope = scopeForResource(input.resource);
  if (!input.identity.scopes.includes(requiredScope)) {
    return deniedDecision(input, "identity_scope", `scope.${requiredScope}`);
  }

  const profile = evaluateCompiledProfile(input.profile, input.resource);
  if (!profile.allowed) return deniedDecision(input, "permission_profile", profile.safeRuleId);

  const missing = missingCapabilities(input.requiredCapabilities, input.capabilities);
  if (missing.length > 0) return enforcementUnavailableDecision(input, missing);

  const risk = input.approvalPolicy.classify(input.resource);
  if (risk === "R0") return allowedDecision(input, profile.safeRuleId);
  const grant = input.grants.findMatching(input.context, input.resource, risk, input.now);
  return grant ? allowedDecision(input, grant.grantId) : approvalRequiredDecision(input, risk);
}
```

Every timestamp and expiry value is explicit input. Do not call `Date.now()` inside the pure evaluator.

- [x] **Step 6: Run focused tests and Build**

Run: `node --test test/policy-evaluator.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 7: Review checkpoint**

Verify hard denies cannot be overridden by any test fixture source.

---

### Task 5: Implement Bounded Approval Requests and Session Grants

**Files:**
- Create: `src/policy/approval.ts`
- Test: `test/policy-approval.test.mjs`

**Interfaces:**
- Consumes: `RequestContextV1`, resource fingerprint, input digest, risk class, policy revision.
- Produces:
  - `ApprovalPolicyV1`
  - `createApprovalRequest(...)`
  - `SessionGrantStore`
  - `grantMatches(...)`
  - `consumeGrant(...)`

- [x] **Step 1: Write failing approval-binding tests**

```js
test("R3 grant is exact one-use and bound to policy revision", () => {
  const store = new SessionGrantStore();
  const grant = store.issue({
    context,
    operation: "shell.execute",
    resourceFingerprint: "sha256:one",
    inputDigest: "sha256:input",
    riskClass: "R3",
    issuedAt: 1_000,
    expiresAt: 121_000,
    usesRemaining: 1
  });
  assert.ok(store.findMatching(context, resource("sha256:one"), "R3", 2_000));
  store.consume(grant.grantId);
  assert.equal(store.findMatching(context, resource("sha256:one"), "R3", 3_000), null);
});

test("profile revision invalidates every earlier grant", () => {
  const changed = { ...context, policyRevision: "policy-new" };
  assert.equal(store.findMatching(changed, resource("sha256:one"), "R3", 2_000), null);
});
```

- [x] **Step 2: Run RED tests**

Run: `node --test test/policy-approval.test.mjs`

Expected: FAIL because approval store is absent.

- [x] **Step 3: Implement fixed risk limits**

```ts
const RISK_LIMITS = Object.freeze({
  R0: { maxTtlMs: 0, uses: Number.POSITIVE_INFINITY },
  R1: { maxTtlMs: 30 * 60_000, uses: Number.POSITIVE_INFINITY },
  R2: { maxTtlMs: 5 * 60_000, uses: Number.POSITIVE_INFINITY },
  R3: { maxTtlMs: 2 * 60_000, uses: 1 },
  R4: { maxTtlMs: 0, uses: 0 }
});
```

R4 cannot create an approval request. R1–R3 require exact credential reference, transport session, workspace, policy revision, tool contract version, operation, resource fingerprint, input digest, risk class, and expiry.

- [x] **Step 4: Implement process-local grant storage and revocation**

```ts
export class SessionGrantStore {
  readonly #grants = new Map<string, SessionGrantV1>();

  revokeForPolicyRevision(policyRevision: string): void {
    for (const [id, grant] of this.#grants) {
      if (grant.policyRevision !== policyRevision) this.#grants.delete(id);
    }
  }

  revokeTransportSession(transportSessionId: string): void {
    for (const [id, grant] of this.#grants) {
      if (grant.transportSessionId === transportSessionId) this.#grants.delete(id);
    }
  }
}
```

Do not persist grants in Phase 2A. Do not expose an MCP approval-management tool in this phase; tests and future UI use the injected interface.

- [x] **Step 5: Run tests and Build**

Run: `node --test test/policy-approval.test.mjs test/policy-evaluator.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 6: Review checkpoint**

Confirm no grant can mean “all Bash” or survive a session/policy revision change.

---

### Task 6: Implement Installation-Local Credential References and Request Context

**Files:**
- Create: `src/policy/identity.ts`
- Create: `src/policy/context.ts`
- Test: `test/policy-identity-context.test.mjs`

**Interfaces:**
- Consumes: `codexProHome()`, Node `crypto`, transport facts, scopes, profile/snapshot revisions.
- Produces:
  - `loadOrCreateIdentityKey(options?): Buffer`
  - `credentialRef(rawCredential, key): string`
  - `identityForStdio(...)`
  - `identityForLoopback(...)`
  - `identityForSharedSecret(...)`
  - `PolicySessionContextSource`
  - `createRequestContext(source, state): RequestContextV1`

- [x] **Step 1: Write failing identity privacy tests**

```js
test("credential references are stable locally and differ across installations", () => {
  const raw = "synthetic-shared-secret";
  const one = credentialRef(raw, Buffer.alloc(32, 1));
  const two = credentialRef(raw, Buffer.alloc(32, 1));
  const other = credentialRef(raw, Buffer.alloc(32, 2));
  assert.equal(one, two);
  assert.notEqual(one, other);
  assert.equal(one.includes(raw), false);
});

test("query and bearer identities have no subject", () => {
  assert.equal(identityForSharedSecret("query_token", "secret", key, scopes).subject, null);
  assert.equal(identityForSharedSecret("bearer", "secret", key, scopes).subject, null);
});

test("request context contains no raw credential", () => {
  const context = createRequestContext(source, state);
  assert.equal(JSON.stringify(context).includes("synthetic-shared-secret"), false);
});
```

- [x] **Step 2: Run RED tests**

Run: `node --test test/policy-identity-context.test.mjs`

Expected: FAIL because identity/context modules are absent.

- [x] **Step 3: Implement the local HMAC key store**

```ts
const IDENTITY_KEY_BYTES = 32;

export function identityKeyPath(home = codexProHome()): string {
  return path.join(home, "policy", "identity-hmac.key");
}

export function loadOrCreateIdentityKey(options: { home?: string; randomBytes?: typeof randomBytes } = {}): Buffer {
  const keyPath = identityKeyPath(options.home);
  try {
    const existing = fs.readFileSync(keyPath);
    if (existing.length !== IDENTITY_KEY_BYTES) throw new PolicyConfigError("Identity key has an invalid length.");
    return existing;
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  const key = (options.randomBytes ?? randomBytes)(IDENTITY_KEY_BYTES);
  fs.writeFileSync(keyPath, key, { flag: "wx", mode: 0o600 });
  return key;
}
```

If concurrent creation wins elsewhere, reopen and validate the existing file. Never print the key or include it in diagnostics.

- [x] **Step 4: Implement domain-separated HMAC references and identities**

```ts
export function credentialRef(rawCredential: string, key: Buffer): string {
  const digest = createHmac("sha256", key)
    .update("codexpro/request-identity/v1\0", "utf8")
    .update(rawCredential, "utf8")
    .digest();
  return `cred_${base32Lower(digest).slice(0, 26)}`;
}
```

STDIO receives `local_process/local`; explicit no-token loopback receives `loopback_unauthenticated/low`; query and Bearer receive shared-secret identities; OAuth type support exists in schemas but no OAuth authentication path is added.

- [x] **Step 5: Implement immutable session context sources**

```ts
export interface PolicySessionContextSource {
  transportKind: "stdio" | "streamable_http";
  transportSessionId(): string;
  identity: RequestIdentityV1;
}

export function createRequestContext(source: PolicySessionContextSource, state: PolicyRequestState): RequestContextV1 {
  return requestContextV1Schema.parse({
    schemaVersion: 1,
    requestId: state.requestId,
    transportKind: source.transportKind,
    transportSessionId: source.transportSessionId(),
    identity: source.identity,
    workspaceId: state.workspaceId,
    runtimeProfileId: state.runtimeProfileId,
    permissionProfileId: state.permissionProfileId,
    policyRevision: state.policyRevision,
    sessionGrantRevision: state.sessionGrantRevision,
    receivedAt: state.receivedAt
  });
}
```

- [x] **Step 6: Run tests and Build**

Run: `node --test test/policy-identity-context.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 7: Review checkpoint**

Search changed files for `Authorization`, `Cookie`, and synthetic raw secret values; only test assertions describing absence are allowed.

---

### Task 7: Compile Current Runtime Modes into a Conservative Compatibility Profile

**Files:**
- Create: `src/policy/compat.ts`
- Modify: `src/config.ts`
- Modify: `src/profileStore.ts`
- Modify: `src/http.ts`
- Test: `test/policy-compat.test.mjs`
- Adjacent tests: `test/server-config-contract.test.mjs`, `test/http-security.test.mjs`, `test/cli-hostname-propagation.test.mjs`

**Interfaces:**
- Consumes: `CodexProConfig`, `WorkspaceProfile`, current blocked globs, current modes.
- Produces:
  - `policyEngineMode: "legacy" | "shadow" | "enforce"`
  - `permissionProfileId?: string`
  - `compileCompatibilityProfile(config): PermissionProfileDocumentV1`
  - `compareLegacyAndPolicyDecision(...)`

- [x] **Step 1: Write failing migration matrix tests**

```js
for (const [writeMode, expectedWrite] of [
  ["off", []],
  ["handoff", [".ai-bridge"]],
  ["workspace", ["."]]
]) {
  test(`writeMode ${writeMode} compiles without broader write access`, () => {
    const profile = compileCompatibilityProfile(config({ writeMode }));
    const writeRules = profile.filesystem.rules.filter((rule) => rule.access === "write");
    assert.deepEqual(writeRules.map((rule) => rule.selector.path), expectedWrite);
  });
}

test("toolMode is absent from permission rules", () => {
  const profile = compileCompatibilityProfile(config({ toolMode: "full" }));
  assert.equal(JSON.stringify(profile).includes("toolMode"), false);
});

test("invalid policy engine value fails closed instead of using legacy", () => {
  assert.throws(() => loadConfigWith({ CODEXPRO_POLICY_ENGINE: "permit" }), /POLICY_ENGINE/);
});
```

- [x] **Step 2: Run RED tests**

Run: `node --test test/policy-compat.test.mjs`

Expected: FAIL because compatibility compilation and config fields are absent.

- [x] **Step 3: Add strict runtime configuration fields**

```ts
export type PolicyEngineMode = "legacy" | "shadow" | "enforce";

function policyEngineModeFrom(value: string | undefined): PolicyEngineMode {
  if (value === undefined || value === "") return "legacy";
  if (value === "legacy" || value === "shadow" || value === "enforce") return value;
  throw new Error("CODEXPRO_POLICY_ENGINE must be legacy, shadow, or enforce.");
}
```

Add `policyEngineMode` and optional `permissionProfileId` to `CodexProConfig`, `WorkspaceProfile`, `RuntimeConnection`, admin profile validation, and sanitized profile output. Profile IDs use the exact 1–64 lowercase-safe syntax from Task 2.

- [x] **Step 4: Implement compatibility compilation**

```ts
export function compileCompatibilityProfile(config: CodexProConfig): PermissionProfileDocumentV1 {
  const rules: FilesystemRuleV1[] = compatibilityDenyRules(config.blockedGlobs);
  if (config.writeMode === "handoff") {
    rules.push({ id: "compat.write.handoff", selector: { kind: "subtree", path: config.contextDir }, access: "write" });
  }
  if (config.writeMode === "workspace") {
    rules.push({ id: "compat.write.workspace", selector: { kind: "subtree", path: "." }, access: "write" });
  }
  return permissionProfileDocumentV1Schema.parse({
    schemaVersion: 1,
    id: "compat-v1",
    workspaceRoots: [config.defaultRoot],
    filesystem: { default: "read", rules },
    git: { read: true, write: false, remoteWrite: false },
    shell: { mode: config.bashMode === "off" ? "disabled" : config.bashMode === "safe" ? "verify" : "execute", requireSandbox: true },
    process: { manage: false, persistent: false, requireSandbox: true },
    network: { enabled: false, rules: [], allowLoopback: false, allowPrivate: false, allowLinkLocal: false, requireEnforcement: true }
  });
}
```

Classify existing secret/escape globs as hard policy and preserve every other existing blocked glob as a compatibility deny. Never silently drop an invalid custom blocked glob; fail startup with `POLICY_CONFIG_INVALID` in shadow/enforce.

- [x] **Step 5: Run focused and adjacent tests**

Run: `node --test test/policy-compat.test.mjs test/server-config-contract.test.mjs test/http-security.test.mjs test/cli-hostname-propagation.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 6: Review checkpoint**

Verify the default remains `legacy` and current profiles remain readable.

---

### Task 8: Implement Enforcement Capability Reports and Redacted Audit Facts

**Files:**
- Create: `src/policy/enforcement.ts`
- Create: `src/policy/audit.ts`
- Test: `test/policy-enforcement-audit.test.mjs`

**Interfaces:**
- Consumes: required capability names, backend probe facts, policy decisions, request contexts.
- Produces:
  - `baselineNodeCapabilityReport(platform)`
  - `missingCapabilities(required, report)`
  - `createAuditEvent(input): AuditEventV1`
  - `sanitizePolicySummary(...)`

- [x] **Step 1: Write failing capability and redaction tests**

```js
test("Job Object process control does not imply filesystem or network isolation", () => {
  const report = capabilityReport({ processTreeControl: "job_object" });
  assert.equal(report.filesystemReadBoundary, "none");
  assert.equal(report.networkEgressControl, "none");
});

test("audit events omit commands credentials and sensitive absolute paths", () => {
  const event = createAuditEvent(auditInput({
    rawCredential: "synthetic-secret",
    command: "curl https://user:pass@example.invalid",
    absolutePath: "C:\\Users\\Example\\.ssh\\id_ed25519"
  }));
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes("synthetic-secret"), false);
  assert.equal(serialized.includes("user:pass"), false);
  assert.equal(serialized.includes("id_ed25519"), false);
});
```

- [x] **Step 2: Run RED tests**

Run: `node --test test/policy-enforcement-audit.test.mjs`

Expected: FAIL because modules are absent.

- [x] **Step 3: Implement the honest baseline capability report**

```ts
export function baselineNodeCapabilityReport(platform: NodeJS.Platform): SandboxCapabilityReportV1 {
  return sandboxCapabilityReportV1Schema.parse({
    schemaVersion: 1,
    backendId: "codexpro-node-broker",
    backendVersion: "1",
    platform,
    filesystemReadBoundary: "brokered",
    filesystemWriteBoundary: "brokered",
    processTreeControl: "none",
    networkEgressControl: "none",
    environmentIsolation: "filtered",
    credentialIsolation: "none",
    registryIsolation: "none",
    supportsPeerAddressVerification: false,
    supportsRedirectReauthorization: false,
    supportsRevocation: false,
    evidenceRevision: "node-broker-v1"
  });
}
```

The `brokered` filesystem claim applies only to Node-hosted domain operations that never delegate access to a child process.

- [x] **Step 4: Implement capability comparison and audit construction**

```ts
export function missingCapabilities(
  required: readonly RequiredCapability[],
  report: SandboxCapabilityReportV1
): RequiredCapability[] {
  return required.filter((requirement) => !capabilitySatisfies(report, requirement));
}

export function createAuditEvent(input: CreateAuditEventInput): AuditEventV1 {
  return auditEventV1Schema.parse({
    schemaVersion: 1,
    eventId: input.eventId,
    timestamp: input.timestamp,
    requestId: input.context.requestId,
    decisionId: input.decision.decisionId,
    credentialRef: input.context.identity.credentialRef,
    transportSessionId: input.context.transportSessionId,
    toolName: safeOneLine(input.toolName, 80),
    canonicalAction: safeOneLine(input.canonicalAction, 80),
    workspaceId: input.context.workspaceId,
    relativeResourceSummary: safeRelativeSummary(input.resource),
    resourceFingerprint: input.resource.resourceFingerprint,
    policyRevision: input.context.policyRevision,
    outcome: input.decision.outcome,
    reasonCode: input.decision.reasonCode,
    safeRuleIds: input.decision.provenance.map((item) => item.safeRuleId).filter(Boolean).slice(0, 16),
    approvalState: input.approvalState,
    grantId: input.grantId,
    sandboxBackend: input.capabilities.backendId,
    durationMs: input.durationMs,
    resultCode: input.resultCode,
    exitCode: input.exitCode,
    boundedByteCounts: input.boundedByteCounts
  });
}
```

Audit events remain process-local facts in Phase 2A. Do not write an audit log file.

- [x] **Step 5: Run tests and Build**

Run: `node --test test/policy-enforcement-audit.test.mjs test/policy-evaluator.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 6: Review checkpoint**

Confirm no capability report claims untested OS isolation.

---

### Task 9: Map Existing Tools to Policy Resources and Add the Central Registered-Tool Wrapper

**Files:**
- Create: `src/policy/toolPolicy.ts`
- Create: `src/policy/integration.ts`
- Modify: `src/server.ts`
- Modify: `src/codexproSupertool.ts`
- Test: `test/policy-integration.test.mjs`
- Adjacent tests: `test/codexpro-contract.test.mjs`, `test/read-contract.test.mjs`, `test/write-contract.test.mjs`, `test/git-status-contract.test.mjs`, `test/bash-contract.test.mjs`

**Interfaces:**
- Consumes: registered-tool map, `RequestContext`, evaluator, resource builders, grants, capability report.
- Produces:
  - `describeToolPolicyRequest(toolName, args, runtime): ToolPolicyRequest`
  - `installPolicyKernel(server, runtime): void`
  - `createPolicyToolFailure(decision): ToolCallResult`
  - `isPolicyToolFailure(result): boolean`

- [x] **Step 1: Write failing direct/supertool policy tests**

```js
test("enforce denies the same read through direct and supertool paths", async () => {
  await withPolicyClient({ engine: "enforce", profile: denyAllProfile() }, async (client) => {
    const direct = await client.callTool({ name: "read", arguments: { path: "README.md" } });
    const wrapped = await client.callTool({ name: "codexpro", arguments: { action: "read", args: { path: "README.md" } } });
    assert.equal(direct.isError, true);
    assert.equal(wrapped.isError, true);
    assert.equal(direct.structuredContent, undefined);
    assert.equal(wrapped.structuredContent, undefined);
    assert.match(direct.content[0].text, /POLICY_DENIED/);
    assert.equal(wrapped.content[0].text, direct.content[0].text);
  });
});

test("legacy mode preserves existing exact tool envelopes", async () => {
  await withPolicyClient({ engine: "legacy" }, async (client) => {
    const result = await client.callTool({ name: "read", arguments: { path: "README.md", end_line: 1 } });
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.codexpro_tool, "read");
  });
});

test("shadow mode executes legacy result and records only redacted comparison facts", async () => {
  const audits = [];
  await withPolicyClient({ engine: "shadow", auditSink: (event) => audits.push(event) }, async (client) => {
    await client.callTool({ name: "read", arguments: { path: "README.md", end_line: 1 } });
  });
  assert.equal(audits.length, 1);
  assert.equal(JSON.stringify(audits).includes(process.cwd()), false);
});
```

- [x] **Step 2: Run RED tests**

Run: `node --test test/policy-integration.test.mjs`

Expected: FAIL because policy integration is absent.

- [x] **Step 3: Implement the closed tool-to-resource mapping**

```ts
const TOOL_POLICY: Record<string, ToolPolicyDefinition> = {
  read: { risk: "R0", describe: describeExactRead },
  tree: { risk: "R0", describe: describeWorkspaceRead },
  search: { risk: "R0", describe: describeWorkspaceRead },
  git_status: { risk: "R0", describe: describeGitRead },
  git_diff: { risk: "R0", describe: describeGitRead },
  write: { risk: "R2", describe: describeExactWrite },
  edit: { risk: "R2", describe: describeExactWrite },
  apply_patch: { risk: "R2", describe: describePatchWrites },
  bash: { risk: "R3", describe: describeOpaqueShell },
  open_workspace: { risk: "R1", describe: describeWorkspaceOpen }
};
```

Provide explicit definitions for every registered canonical direct tool. Read-only diagnostics map to the minimal required workspace/filesystem/Git resources. Handoff/export tools map to the exact `.ai-bridge` write subtree. Tools with no protected resource still require context validation but produce an empty resource array. Unknown registered tool names fail installation rather than running unclassified.

- [x] **Step 4: Implement branded policy failures without changing Phase 1 schemas**

```ts
const POLICY_FAILURE = Symbol("codexpro.policy.failure");

export function createPolicyToolFailure(decision: PolicyDecisionV1): ToolCallResult {
  const result: ToolCallResult = {
    content: [{
      type: "text",
      text: `CodexPro policy refused this operation.\nCode: ${decision.reasonCode}\nPolicy revision: ${safeId(decision.policyRevision)}`
    }],
    isError: true
  };
  Object.defineProperty(result, POLICY_FAILURE, { value: true, enumerable: false });
  return result;
}

export function isPolicyToolFailure(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as Record<symbol, unknown>)[POLICY_FAILURE] === true);
}
```

The text contains no raw resource, rule body, command, path, or credential.

- [x] **Step 5: Wrap the registered tool map once**

```ts
export function installPolicyKernel(server: unknown, runtime: PolicyRuntime): void {
  const tools = registeredToolsOf(server);
  for (const [toolName, entry] of Object.entries(tools)) {
    const original = entry.handler;
    entry.handler = async (args, extra) => {
      const request = runtime.describe(toolName, args);
      const evaluation = runtime.evaluate(request);
      runtime.audit(evaluation.auditEvent);
      if (runtime.mode === "enforce" && evaluation.decision.outcome !== "allow") {
        return createPolicyToolFailure(evaluation.decision);
      }
      return original(args, extra);
    };
  }
}
```

In `shadow`, always call the original handler and record comparison only. In `legacy`, do not compile/read Permission Profiles or create identity-key files unless safe diagnostics explicitly request them.

- [x] **Step 6: Preserve policy failures through the supertool**

Immediately after the child handler returns in `src/codexproSupertool.ts`, add:

```ts
if (isPolicyToolFailure(childResult)) return childResult;
```

Import `isPolicyToolFailure` from `./policy/integration.js`. This prevents conversion to `CHILD_RESULT_INVALID` and preserves direct/supertool parity.

- [x] **Step 7: Install integration after all direct tools and supertool metadata are registered**

In `createCodexProServer`, build the `PolicyRuntime` from injected dependencies/config and call `installPolicyKernel(server, policyRuntime)` exactly once after tool registration and `upgradeCodexProSupertool`. Do not add per-handler policy branches.

- [x] **Step 8: Run focused and adjacent tests**

Run: `node --test test/policy-integration.test.mjs test/codexpro-contract.test.mjs test/read-contract.test.mjs test/write-contract.test.mjs test/git-status-contract.test.mjs test/bash-contract.test.mjs`

Expected: PASS. Legacy Phase 1 envelopes remain exact.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 9: Review checkpoint**

Confirm every registered direct tool has one explicit policy definition and no alias can select broader resources.

---

### Task 10: Wire STDIO and HTTP Transport Identity into the Server Instance

**Files:**
- Modify: `src/http.ts`
- Modify: `src/stdio.ts`
- Modify: `src/server.ts`
- Test: `test/policy-transport.test.mjs`
- Adjacent test: `test/http-security.test.mjs`

**Interfaces:**
- Consumes: existing Host/Origin/Token middleware and MCP session lifecycle.
- Produces: one `PolicySessionContextSource` per STDIO process or HTTP MCP transport session.

- [x] **Step 1: Write failing transport identity tests**

```js
test("query and bearer sessions produce distinct authentication modes without raw tokens", async () => {
  const query = await initializeHttpSession({ authentication: "query" });
  const bearer = await initializeHttpSession({ authentication: "bearer" });
  assert.equal(query.identity.authenticationMode, "query_token");
  assert.equal(bearer.identity.authenticationMode, "bearer");
  assert.equal(JSON.stringify([query, bearer]).includes(TEST_TOKEN), false);
});

test("stdio receives one process-lifetime opaque transport session id", () => {
  const source = createStdioPolicySessionSource({ sessionId: "stdio-test-session", scopes: READ_SCOPES });
  assert.equal(source.transportKind, "stdio");
  assert.equal(source.transportSessionId(), "stdio-test-session");
});
```

- [x] **Step 2: Run RED tests**

Run: `node --test test/policy-transport.test.mjs`

Expected: FAIL because transport sources are not wired.

- [x] **Step 3: Capture HTTP authentication mode without storing request credentials**

After a Token match, set a bounded request-local fact:

```ts
res.locals.codexproAuthenticationMode = tokenMatches(bearer) ? "bearer" : "query_token";
```

Do not store the bearer/query value in `locals`. For the accepted configured shared secret, derive `credentialRef` from `config.authToken` and the local identity key only when creating a new MCP server session.

- [x] **Step 4: Bind one context source to each HTTP transport**

```ts
const policySession = createHttpPolicySessionSource({
  authenticationMode: res.locals.codexproAuthenticationMode,
  configuredCredential: config.authToken,
  transportSessionId: () => String((transport as { sessionId?: string }).sessionId ?? "pending"),
  scopes: policyIdentityScopes(config)
});

const server = createCodexProServer(config, {
  ...dependencies,
  policySessionContextSource: policySession
});
```

Tool calls with `pending` are refused as invalid context; MCP initialize itself is not a protected tool call.

- [x] **Step 5: Bind one process-lifetime STDIO source**

```ts
const policySession = createStdioPolicySessionSource({
  sessionId: randomUUID(),
  scopes: policyIdentityScopes(config)
});
const server = createCodexProServer(config, { policySessionContextSource: policySession });
```

- [x] **Step 6: Run focused and adjacent tests**

Run: `node --test test/policy-transport.test.mjs test/http-security.test.mjs`

Expected: PASS. Existing 401, 403, query-token, Bearer, and session errors remain unchanged.

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 7: Review checkpoint**

Verify HTTP logs still use `req.path`, not credential-bearing URLs, and no Token is serialized.

---

### Task 11: Expose Safe Policy Diagnostics and Add the Windows Capability Spike

**Files:**
- Modify: `src/tools/schemas/serverConfig.ts`
- Modify: `src/selfTestOps.ts`
- Modify: `src/tools/schemas/codexproSelfTest.ts`
- Modify: `src/toolCardWidget.ts`
- Create: `scripts/policy-windows-spike.mjs`
- Create: `test/policy-windows-spike.test.mjs`
- Modify: `scripts/stress-contract-compat.mjs`
- Adjacent tests: `test/server-config-contract.test.mjs`, `test/codexpro-self-test-contract.test.mjs`

**Interfaces:**
- Consumes: safe runtime summary, capability report, synthetic fixture root.
- Produces: bounded diagnostics and a local-only synthetic probe report.

- [x] **Step 1: Write failing diagnostic tests**

```js
test("server_config exposes only safe policy summary", () => {
  const data = sampleServerConfigData();
  data.policyEngineMode = "shadow";
  data.permissionProfileId = "compat-v1";
  data.policyRevision = "policy_0123456789abcdef";
  data.enforcement = { backendId: "codexpro-node-broker", evidenceRevision: "node-broker-v1" };
  const parsed = serverConfigOutputSchema.parse(createServerConfigSuccess(data));
  assert.equal(JSON.stringify(parsed).includes("identity-hmac.key"), false);
});
```

- [x] **Step 2: Write failing spike-contract tests**

```js
test("Windows spike uses synthetic roots and never accesses real user secrets", async () => {
  const result = await runSpikeFixture({ fixtureRoot, platform: "win32", execute: fakeExecutor });
  assert.equal(result.fixtureRoot, "[synthetic fixture]");
  assert.equal(JSON.stringify(result).includes(process.env.USERPROFILE ?? "__none__"), false);
  assert.deepEqual(result.capabilities.sort(), ["environmentIsolation", "filesystemReadBoundary", "filesystemWriteBoundary", "networkEgressControl", "processTreeControl"].sort());
});
```

- [x] **Step 3: Run RED tests**

Run: `node --test test/policy-windows-spike.test.mjs test/server-config-contract.test.mjs test/codexpro-self-test-contract.test.mjs`

Expected: FAIL because safe policy fields and spike module are absent.

- [x] **Step 4: Add safe diagnostic fields**

Expose only:

```text
policyEngineMode
permissionProfileId
policyRevision
hardPolicyRevision
grantRevision
capability backendId/evidenceRevision
missing required capability names
```

Do not expose profile file paths, roots beyond existing server-config behavior, rule bodies, source hashes, HMAC key paths, credentials, commands, or audit contents.

- [x] **Step 5: Implement a controlled synthetic Windows spike**

```js
export async function runSpikeFixture({ fixtureRoot, platform, execute }) {
  const probes = [
    probeWorkspaceRead(fixtureRoot, execute),
    probeOutsideRead(fixtureRoot, execute),
    probeChildTree(fixtureRoot, execute),
    probeFilteredEnvironment(fixtureRoot, execute),
    probeLoopbackNetwork(fixtureRoot, execute)
  ];
  const settled = await Promise.all(probes);
  return sanitizeSpikeReport({ platform, fixtureRoot: "[synthetic fixture]", probes: settled });
}
```

The executable CLI creates only a temporary synthetic tree and local controlled listeners, performs no firewall/registry/service/task installation, and cleans up in `finally`. It reports observed capability levels; it does not modify production capability claims automatically.

- [x] **Step 6: Integrate bounded self-test checks**

Add fixed checks for:

```text
policy_schema
policy_profile
policy_revision
policy_identity
policy_enforcement
```

A failed probe is diagnostic `warn` or `fail` according to existing self-test semantics; it does not write source files. The only optional write remains `.ai-bridge/codexpro-self-test.md`.

- [x] **Step 7: Run focused and adjacent tests**

Run: `node --test test/policy-windows-spike.test.mjs test/server-config-contract.test.mjs test/codexpro-self-test-contract.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: exit code 0.

On native Windows, run: `node scripts/policy-windows-spike.mjs`

Expected: exit code 0 with a redacted synthetic report; unsupported capabilities remain `none` or `partial`.

- [x] **Step 8: Review checkpoint**

Confirm no system setting, real credential, registry value, firewall rule, service, task, or persistent process changed.

---

### Task 12: Complete Rollout Documentation, Static Gates, and Full Verification

**Files:**
- Modify: `config.example.env`
- Modify: `README.md`
- Modify: `README_ZH.md`
- Modify: `SECURITY.md`
- Modify: `FAQ.md`
- Modify: `FAQ_ZH.md`
- Modify: `AGENTS.md`
- Modify: `Memory.md`
- Modify: `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- Modify: `docs/memory/archive/policy-kernel-gate.md`

**Interfaces:**
- Consumes: completed implementation and fresh verification evidence.
- Produces: exact migration guidance, limitations, rollback, acceptance record, and next Phase 2B design action.

- [x] **Step 1: Document exact configuration and migration behavior**

Add these examples without real credentials:

```env
# Migration-cycle default: current behavior.
CODEXPRO_POLICY_ENGINE=legacy

# Compute redacted policy comparisons while preserving legacy execution.
# CODEXPRO_POLICY_ENGINE=shadow

# Enforce the compiled Policy Kernel. Unsupported enforcement fails closed.
# CODEXPRO_POLICY_ENGINE=enforce

# Optional exact local Permission Profile id under ~/.codexpro/permissions/.
# CODEXPRO_PERMISSION_PROFILE=review
```

Document that `toolMode` controls visibility only, shared Tokens are not human identities, safe Bash is not a sandbox, Job Objects do not isolate files/network, and Cloudflare does not control outbound execution.

- [x] **Step 2: Add rollback instructions**

Rollback permits only:

```text
- exact reviewed legacy behavior during the one-cycle migration window;
- the generated hash-pinned compatibility profile;
- a narrower read-only emergency profile.
```

Policy load failure cannot fall through to unguarded execution. No rollback deletes profiles, credentials, workspace records, grants, or audit facts.

- [x] **Step 3: Run all focused policy tests**

Run:

`node --test test/policy-schema.test.mjs test/policy-profile-store.test.mjs test/policy-resources.test.mjs test/policy-evaluator.test.mjs test/policy-approval.test.mjs test/policy-identity-context.test.mjs test/policy-compat.test.mjs test/policy-enforcement-audit.test.mjs test/policy-integration.test.mjs test/policy-transport.test.mjs test/policy-windows-spike.test.mjs`

Expected: all policy tests pass with zero failures.

- [x] **Step 4: Run adjacent security and contract tests**

Run:

`node --test test/path-policy.test.mjs test/http-security.test.mjs test/server-config-contract.test.mjs test/codexpro-contract.test.mjs test/codexpro-self-test-contract.test.mjs test/read-contract.test.mjs test/write-contract.test.mjs test/edit-contract.test.mjs test/apply-patch-contract.test.mjs test/git-status-contract.test.mjs test/git-diff-contract.test.mjs test/bash-contract.test.mjs`

Expected: all pass; platform-specific established skips remain explicit.

- [x] **Step 5: Run complete project verification**

Run: `node --test test/*.test.mjs`

Expected: zero failures.

Run: `npm run build`

Expected: exit code 0.

Run: `npm run smoke`

Expected: all eight Smoke sections pass; protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain unchanged.

Run: `npm run stress`

Expected: native-Windows Stress passes with only the established documented platform skip.

Run: `npm pack --dry-run`

Expected: exit code 0; no permission documents, HMAC keys, audit data, `.ai-bridge` contents, or test fixtures are packaged.

Run: `git diff --check`

Expected: exit code 0; the Windows LF-to-CRLF working-copy warning may appear without whitespace errors.

- [x] **Step 6: Run static security checks**

Use repository search to verify:

```text
- no source contains a real-looking Token or private key fixture;
- policy errors contain no raw path/command/profile body;
- every canonical registered tool has a ToolPolicy definition;
- no code converts enforcement-unavailable into legacy execution;
- no Phase 2B workspace lifecycle, OAuth, persistent process, Hook, Skill trust, semantic, or Git remote-write implementation entered scope;
- protected Smoke source files are unchanged.
```

- [x] **Step 7: Run per-task `neat-freak` reconciliation after implementation approval**

Load and execute the repository `neat-freak` workflow only after all implementation and verification tasks pass. It may reconcile documentation, names, dead imports, and exact scope; it must not broaden policy, weaken hard denies, or edit protected Smoke source.

- [x] **Step 8: Update authoritative status**

Record exact commands, counts, platform skips, risks, rollback, changed files, and next action in `Memory.md` and `docs/memory/archive/policy-kernel-gate.md`. Mark Phase 2A complete only after fresh evidence satisfies every acceptance condition. The next action is Phase 2B design/implementation under the recorded authorization, not Phase 6–9.

- [x] **Step 9: Publication checkpoint**

Use `show_changes` for the complete exact scope. Do not stage, commit, push, or inspect remote CI until explicit publication approval is obtained under `AGENTS.md`.

---

## Plan Self-Review Results

- Spec coverage: all approved Gate deliverables map to Tasks 1–12, including identity, profile Schema, hard policy, deterministic composition, approval/grants, enforcement capabilities, resource models, provenance/audit, migration, Windows spike, threat limits, tests, and rollback.
- Boundary coverage: direct tools and the `codexpro` supertool share the registered-tool wrapper; policy refusal does not mutate the twenty-eight Phase 1 output schemas.
- Type consistency: `PolicyEngineMode`, `PolicyOutcome`, `PolicyReasonCode`, `RiskClass`, scope names, resource kinds, and capability names are defined once in Task 1 and reused unchanged.
- Migration safety: `legacy` remains default, `shadow` cannot change execution, `enforce` fails closed, and compatibility compilation cannot add an allow absent from current supported behavior.
- Scope safety: Phase 2B, Phase 3 persistence/transactions, Phase 4 process/sandbox implementation, Phase 6 trust, Phase 7 semantic providers, Phase 8 OAuth, and Phase 9 subagents remain excluded.
- Placeholder scan: the plan contains no unresolved implementation marker or unspecified code step.
