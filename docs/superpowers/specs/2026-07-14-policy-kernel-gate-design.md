# Policy Kernel Design Gate

**Date:** 2026-07-14  
**Status:** Approved; Policy Kernel design gate passed on 2026-07-14  
**Scope:** Design only. No production behavior, configuration loading, tool registration, authorization, approval, sandbox, or audit persistence changes are authorized by this document.

## 1. Decision

CodexGPT will use a repository-owned, compiled Policy Kernel rather than continuing distributed handler checks or introducing a general-purpose external policy engine.

The selected architecture is:

```text
Versioned policy documents
  -> strict validation and migration
  -> immutable compiled policy snapshot
  -> RequestContext + ResourceDescriptor
  -> pure deterministic evaluator
  -> allow | deny | approval_required | enforcement_unavailable
  -> domain service or SandboxBackend
  -> redacted audit event
  -> exact tool-specific result envelope
```

This design preserves four separate concepts:

| Layer | Question answered | It cannot replace |
|---|---|---|
| Tool Surface | Which tools may this client discover? | Authorization |
| Policy | What is the maximum permitted operation on this resource? | OS enforcement |
| Approval | May this session receive a bounded grant for this operation? | Hard-policy ceilings |
| Sandbox | What can the process actually reach at the OS layer? | User intent or policy semantics |

Approval never means “run with every permission of the current Windows account.”

## 2. Problem statement

CodexGPT already enforces useful controls through `allowedRoots`, Windows path validation, blocked globs, tool visibility, write mode, Bash mode, HTTP Host/Origin/authentication checks, secret-content checks, and bounded outputs. These decisions are currently distributed across configuration, transport, tool registration, guards, and handlers.

The Policy Kernel must establish one deterministic answer for this question:

> Given an authenticated or local request identity, transport session, workspace binding, operation, resource, current policy revision, and current enforcement capabilities, may the operation execute now, require approval, or fail closed?

The design must prevent the following classes of drift:

- a tool alias or supertool action bypassing a direct-tool check;
- tool visibility being treated as authorization;
- a handler interpreting `writeMode`, `bashMode`, or profile fields differently from another handler;
- approval exceeding an immutable hard-policy, identity, profile, or deployment ceiling;
- a requested sandbox silently degrading to current-user execution;
- a profile migration silently widening existing access;
- a stale session grant surviving a policy revision;
- an audit explanation leaking credentials, sensitive paths, commands, or file contents.

## 3. Non-goals

This design gate does not implement:

- Phase 2 production behavior;
- OAuth 2.1 or strong multi-user owner isolation;
- complete Windows filesystem, registry, credential, or network sandboxing;
- atomic multi-file transactions, undo, or persistent audit storage;
- persistent process management or a native PowerShell backend;
- Git remote writes;
- Hook, Skill, AGENTS, or instruction trust;
- semantic providers or subagents.

The existing Phase 1 tool contracts remain closed and are not reopened by this gate.

## 4. Core model

### 4.1 Effective permission formula

```text
effective ceiling
  = hardPolicy
  ∩ identityScopes
  ∩ permissionProfile
  ∩ deploymentCapabilities

effective permission
  = effective ceiling
  ∩ sessionGrant
```

`deploymentCapabilities` is explicit because a configuration request is not proof that the current Windows backend can enforce it.

Approval may enlarge `sessionGrant` only up to `effective ceiling`. It cannot modify the ceiling.

### 4.2 Core objects

The implementation must provide versioned forms of these objects:

- `RequestIdentityV1`
- `RequestContextV1`
- `PermissionProfileDocumentV1`
- `CompiledPolicySnapshotV1`
- `ResourceDescriptorV1`
- `SessionGrantV1`
- `PolicyDecisionV1`
- `AuditEventV1`
- `SandboxCapabilityReportV1`

Detailed identity and transport semantics are defined in `2026-07-14-request-context-identity-adr.md`. Permission Profile rules are defined in `2026-07-14-permission-profile-v1-design.md`. Windows threat and enforcement limits are defined in `2026-07-14-windows-enforcement-threat-model.md`.

### 4.3 Policy snapshot

A compiled policy snapshot is immutable and contains at least:

```text
schemaVersion
policyRevision
sourceHashes
compiledHardPolicy
compiledPermissionProfile
identityScopeMapping
approvalPolicy
requiredDeploymentCapabilities
createdAt
```

The same validated snapshot and same normalized input must produce the same decision. Wall-clock time may only affect explicit expiry checks passed into the evaluator as input.

## 5. Deterministic evaluation algorithm

Every protected operation follows this fixed order:

1. Validate `RequestContext`, workspace binding, and policy revision.
2. Convert tool-specific input into one `ResourceDescriptorV1` variant.
3. Normalize the resource using the platform-specific canonicalization contract.
4. Apply immutable hard policy.
5. Apply deployment-level disabled capabilities.
6. Intersect identity scopes.
7. Apply the compiled Permission Profile.
8. Verify that every required enforcement capability is available.
9. Apply the current bounded `SessionGrant`.
10. Return `allow`, `approval_required`, `deny`, or `enforcement_unavailable`.
11. Before a side effect, revalidate policy revision and resource identity for write, Shell, Process, Git mutation, and Network operations.
12. Emit a redacted `AuditEventV1` fact regardless of allow or refusal; reliable persistence begins in Phase 3.

No exception, parse failure, backend probe failure, or unknown rule may become allow.

## 6. Decision and error contract

`PolicyDecisionV1.outcome` is one of:

```text
allow
deny
approval_required
enforcement_unavailable
```

Stable public error codes are:

| Condition | Code |
|---|---|
| Hard, scope, profile, or grant refusal | `POLICY_DENIED` |
| Bounded approval can satisfy the request | `APPROVAL_REQUIRED` |
| Context or grant revision is stale | `POLICY_CONTEXT_STALE` |
| Resource cannot be safely normalized | `POLICY_RESOURCE_INVALID` |
| Policy document or migration is invalid | `POLICY_CONFIG_INVALID` |
| Required Shell boundary is unavailable | `SHELL_SANDBOX_UNAVAILABLE` |
| Required Process boundary is unavailable | `PROCESS_SANDBOX_UNAVAILABLE` |
| Required Network boundary is unavailable | `NETWORK_ENFORCEMENT_UNAVAILABLE` |

Transport authentication remains outside the Policy Kernel:

- failed authentication remains HTTP `401`;
- failed Host or Origin validation remains HTTP `403`;
- a hidden direct tool remains absent and direct invocation uses the MCP unknown-tool behavior;
- a hidden supertool action remains `ACTION_NOT_AVAILABLE`.

Public errors contain only stable reason codes, safe source categories, policy revision, and bounded safe identifiers. They never include raw Token values, Authorization headers, credential URLs, full sensitive paths, complete commands, rule bodies, or stack traces.

## 7. Approval model

Risk classes are fixed as:

| Class | Meaning | Maximum grant shape |
|---|---|---|
| R0 | No approval required within current ceiling | Base session grant |
| R1 | Low risk and safely reusable | Current transport session, at most 30 minutes |
| R2 | Medium risk | Operation, resource fingerprint, and input digest; at most 5 minutes |
| R3 | High risk | One use, exact operation/resource/input; expires within 2 minutes |
| R4 | Immutable refusal | No approval request may be created |

Delete/move, Git history mutation, Git remote write, arbitrary Shell, persistent Process, credential administration, and Permission Profile administration are R3 when the capability is otherwise enabled. Private, loopback, and link-local Network access is R3 only when deployment policy explicitly enables that address class. Any capability disabled by immutable hard policy or deployment policy is R4 and cannot generate an approval request.

Every approval or grant is bound to:

```text
credentialRef
transportSessionId
workspaceId
policyRevision
toolContractVersion
operation
resourceFingerprint
inputDigest
riskClass
expiry
```

A grant such as “all Bash is approved” is invalid. Profile or hard-policy revision invalidates all earlier grants. High-risk operations recheck the revision immediately before the side effect.

## 8. Resource descriptors

`ResourceDescriptorV1` is a closed discriminated union:

```text
FilesystemResourceV1
GitResourceV1
ShellResourceV1
ProcessResourceV1
NetworkResourceV1
```

Each descriptor has a stable operation, workspace identity when applicable, normalized safe fields, and a `resourceFingerprint` derived from canonical policy facts rather than display strings.

Arbitrary Shell text is treated as opaque for authorization. CodexGPT must not claim that parsing a command string proves every filesystem, process, registry, credential, or network side effect. Opaque commands require a stronger risk class and enforceable sandbox capabilities.

## 9. Provenance and audit facts

A decision carries bounded provenance:

```text
policyRevision
outcome
reasonCode
sourceKind
safeRuleId
specificity
grantId
approvalId
enforcementBackend
```

`sourceKind` is one of:

```text
hard_policy
deployment
identity_scope
permission_profile
session_grant
approval_policy
enforcement
```

`AuditEventV1` may record timestamp, request and decision IDs, safe credential reference, transport session ID, canonical tool/action, workspace ID, relative resource summary, resource fingerprint, policy revision, outcome, reason code, safe rule IDs, approval/grant state, enforcement backend, duration, result code, exit code, and bounded byte counts.

It must not record Authorization, Cookie, complete Tokens, credential-bearing URLs, file contents, `.env` contents, private keys, browser data, full command text or output, sensitive absolute paths, or unredacted approval inputs.

## 10. Compatibility migration

`RuntimeProfile` and `PermissionProfile` become distinct concepts. Runtime configuration may select Tunnel, port, backend, and Tool Surface, but cannot bypass permission policy.

Existing settings compile conservatively:

```text
toolMode minimal|standard|full
  -> Tool Surface only

writeMode off
  -> no filesystem write grant
writeMode handoff
  -> write ceiling limited to the protected .ai-bridge compatibility area
writeMode workspace
  -> workspace write ceiling subject to all hard policy and profile rules

bashMode off
  -> Shell disabled
bashMode safe
  -> verification-command compatibility profile
bashMode full
  -> legacy explicit ceiling, not proof of sandboxing or whole-machine authorization
```

Migration uses three explicit engine states:

```text
legacy
shadow
enforce
```

`legacy` executes the current path. `shadow` executes the current path and computes a redacted comparison decision without changing behavior. `enforce` uses the new Policy Kernel. Migration produces a hash-pinned compatibility profile that is no broader than the old effective configuration.

Rollback may return to the exact compatibility profile or a narrower emergency read-only profile. Failure to load the new Policy Kernel cannot fall through to an unguarded execution path.

## 11. SandboxBackend contract

A Sandbox backend reports capabilities, not a single boolean:

```text
filesystemReadBoundary
filesystemWriteBoundary
processTreeControl
networkEgressControl
environmentIsolation
credentialIsolation
registryIsolation
backendId
backendVersion
```

The evaluator declares required capabilities per operation. If any required capability is absent, the result is `enforcement_unavailable` with the domain-specific stable error code.

Windows Job Objects count only toward process lifecycle and tree-control capabilities. They do not establish filesystem, registry, credential, or network isolation.

## 12. Phase 2 slicing

### Phase 2A

1. Versioned schemas, strict validators, and pure migrations.
2. `RequestIdentityV1` and `RequestContextV1`.
3. Resource descriptor normalization.
4. Pure evaluator, provenance, and stable error mapping.
5. Immutable hard-policy registry.
6. Compatibility profile compiler.
7. Central authorization wrapper and shadow mode.
8. In-memory Approval and SessionGrant interfaces.
9. `AuditEventV1` creation without persistent storage.
10. Enforce-mode integration for Node-hosted file and local Git-read boundaries.
11. Windows enforcement spike and capability report.
12. Enforce-mode switch and rollback validation.

### Phase 2B

1. Stable canonical `workspaceKey` and opaque session-bound `workspaceId`.
2. Workspace binding to identity and transport session.
3. Removal of implicit default-workspace fallback from core services.
4. Close, expiry, revocation, and cleanup.
5. Workspace and grant invalidation on policy changes.
6. One-cycle compatibility parser for legacy workspace identifiers.
7. Cross-session, expiry, revocation, and stale-context contract tests.

Each slice must be independently reversible. Reversion must not restore a known security defect.

## 13. Required test matrix

The implementation plan must include deterministic tests for:

- every hard deny against every approval/profile source;
- path exact/subtree precedence, equal-specificity deny, Windows case folding, separators, non-existent targets, junction/symlink drift, and blocked secrets;
- identity scope/profile/grant intersections;
- Tool Surface changes having no effect on the same direct authorization decision;
- STDIO, loopback, query-token, Bearer, and future OAuth identity shapes;
- approval expiry, one-use consumption, resource/input binding, and policy-revision invalidation;
- partial sandbox capabilities and fail-closed errors;
- domain, port, redirect, resolved-address class, rebinding, proxy, and subprocess network cases;
- redaction of credentials, paths, commands, contents, and rule bodies;
- legacy/shadow/enforce migration with no silent expansion;
- Windows and Ubuntu Node 20/24 regression, Build, Smoke, Stress, package, static, and secret-shape gates.

## 14. Security claims explicitly prohibited before later phases

The project must not claim that:

- Phase 2A eliminates filesystem TOCTOU races;
- query-token or Bearer mode provides OAuth-grade user isolation;
- safe Bash is an OS sandbox;
- a Windows Job Object restricts filesystem or network access;
- a domain allowlist alone prevents rebinding, redirects, proxies, or subprocess bypass;
- a requested sandbox is active unless the capability report proves every required boundary;
- an approval permits access outside hard policy, allowed roots, scopes, or the Permission Profile.

## 15. Gate acceptance

The design-only Policy Kernel gate is ready for final written-spec approval when all of the following are true:

- this document and the three companion documents contain no placeholder or unresolved design item;
- rule composition is deterministic for identical normalized inputs;
- deny, approval, stale context, invalid resource, and enforcement failure have exact semantics;
- Windows filesystem, process, and network threats are covered;
- migration cannot silently expand existing effective access;
- unsupported security guarantees are stated explicitly;
- Phase 2A and Phase 2B are split into independently reversible slices;
- production code remains at the Phase 1 published state.

Final written-spec approval passes the design gate and permits transition to a detailed Phase 2A implementation plan under the authorization already recorded on 2026-07-13. It does not authorize Phase 6–9, OAuth 2.1, credential migration, destructive operations, or Git remote writes.
