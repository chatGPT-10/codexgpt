# Permission Profile V1 Design

**Date:** 2026-07-14  
**Status:** Approved; Policy Kernel design gate passed on 2026-07-14  
**Scope:** Versioned policy document, compilation, rule precedence, compatibility migration, and decision provenance. No production loader or enforcement change is authorized by this document.

## 1. Decision

CodexGPT will define a strict, repository-owned `PermissionProfileDocumentV1` in JSON. It will not copy an evolving upstream TOML syntax and will not reuse the current runtime workspace profile as a permission document.

`RuntimeProfile` controls startup, Tunnel, port, backend, Tool Surface, and presentation settings. `PermissionProfile` controls the maximum filesystem, Git, Shell, Process, and Network access available to a request identity. A runtime profile may reference a permission profile but cannot override it.

## 2. Storage and ownership

V1 storage locations are:

```text
~/.codexgpt/profiles/<workspace-hash>.json
~/.codexgpt/permissions/<permission-profile-id>.json
```

The permission directory is local configuration state, not workspace-controlled content. Workspace files, AGENTS instructions, Hooks, Skills, and tool arguments cannot select arbitrary permission files or mutate immutable hard policy.

Permission documents must not contain Tokens, private keys, Tunnel credentials, Authorization headers, Cookies, or credential-bearing URLs.

## 3. V1 document shape

```ts
interface PermissionProfileDocumentV1 {
  schemaVersion: 1;
  id: string;
  extends?: string;
  description?: string;
  workspaceRoots?: string[];

  filesystem?: {
    default?: "deny" | "read";
    rules?: FilesystemRuleV1[];
  };

  git?: {
    read?: boolean;
    write?: boolean;
    remoteWrite?: boolean;
  };

  shell?: {
    mode?: "disabled" | "verify" | "execute";
    requireSandbox?: boolean;
  };

  process?: {
    manage?: boolean;
    persistent?: boolean;
    requireSandbox?: boolean;
  };

  network?: {
    enabled?: boolean;
    rules?: NetworkRuleV1[];
    allowLoopback?: boolean;
    allowPrivate?: boolean;
    allowLinkLocal?: boolean;
    requireEnforcement?: boolean;
  };
}
```

Unknown fields are rejected. The compiler resolves inheritance first, then applies the defaults defined in this document to any still-missing field. A child profile may omit a field to inherit it; an omitted field with no ancestor value receives the V1 default. The loader does not infer intent from misspelled or deprecated fields.

## 4. Defaults

New V1 documents use:

```text
filesystem.default = deny
filesystem.rules = []
git.read = false
git.write = false
git.remoteWrite = false
shell.mode = disabled
shell.requireSandbox = true
process.manage = false
process.persistent = false
process.requireSandbox = true
network.enabled = false
network.rules = []
network.allowLoopback = false
network.allowPrivate = false
network.allowLinkLocal = false
network.requireEnforcement = true
```

`workspaceRoots` has no implicit home-directory entry. The current workspace root may be inserted only by the explicit compatibility compiler during migration.

## 5. Profile inheritance

V1 supports one optional parent through `extends`.

Compilation rules:

1. Resolve the parent by exact validated profile ID from the permission directory.
2. Reject missing parents, cycles, and inheritance depth greater than 8.
3. Validate every document before merging.
4. Merge parent first, then child.
5. Child scalar fields replace parent scalar fields.
6. Filesystem and Network rule arrays are concatenated parent-first and then compiled into deterministic rule sets.
7. Duplicate normalized rule IDs or duplicate normalized selectors with different access are rejected.
8. Inheritance never changes immutable hard policy.
9. The compiled snapshot records every source document hash and parent relationship.

Declaration order is not a decision tie-breaker.

## 6. Workspace roots

Each `workspaceRoots` entry is an absolute path selected by the local administrator. Compilation performs native canonicalization of existing roots. Non-existent workspace roots are invalid.

On Windows, roots reject:

- device paths;
- UNC paths in V1;
- drive-relative paths;
- NTFS alternate data streams;
- reserved device names;
- trailing dot or space segments;
- canonical paths that cannot be resolved safely.

Allowed roots from deployment configuration and profile workspace roots are intersected. A profile cannot widen the deployment allowed-root set.

## 7. Filesystem rules

### 7.1 Rule shape

```ts
type FilesystemRuleV1 =
  | {
      id: string;
      selector: { kind: "exact"; path: string };
      access: "read" | "write" | "deny";
    }
  | {
      id: string;
      selector: { kind: "subtree"; path: string };
      access: "read" | "write" | "deny";
    }
  | {
      id: string;
      selector: { kind: "deny_glob"; pattern: string };
      access: "deny";
    };
```

Allow globs are excluded from V1 because their interaction with Windows aliases, separators, non-existent targets, and rule specificity is difficult to make safely intuitive. Exact and subtree selectors provide positive access. Globs are available only as additional denies.

### 7.2 Path input language

Rule paths are workspace-relative POSIX-style paths:

```text
.
src
src/server.ts
.ai-bridge
```

Rules reject:

- absolute paths;
- `..` traversal;
- empty segments;
- backslash separators in stored form;
- NUL bytes;
- Windows illegal path segments;
- drive letters;
- selectors outside the selected workspace root.

The root path is represented by `.`.

### 7.3 Windows normalization

The compiler creates two representations:

```text
display path
  preserves normalized original spelling for safe user output

comparison key
  slash-normalized, Unicode-normalized, and Windows case-folded
```

Windows comparisons are case-insensitive. Linux comparisons remain case-sensitive. The platform is part of the compiled policy snapshot; a snapshot compiled for one platform is not reused on another.

No normalization rule is allowed to convert an invalid Windows path into a valid allowed path. Validation occurs before and after normalization.

### 7.4 Existing targets

For an existing target:

1. Validate raw input.
2. Resolve against the session-bound workspace root.
3. Use native realpath for the target.
4. Verify containment within workspace and deployment/profile roots.
5. Compute the relative comparison key.
6. Apply immutable hard policy.
7. Apply profile rules.

Both the lexical path and real target are checked against hard deny rules.

### 7.5 Non-existent write targets

For a target that does not yet exist:

1. Validate every raw segment.
2. Find the closest existing parent.
3. Open or native-realpath the parent and verify containment.
4. Preserve the unresolved suffix as validated segments.
5. Build the prospective canonical comparison key.
6. Apply hard policy and profile rules to the prospective relative path.
7. Immediately before the side effect, repeat parent identity and policy-revision checks.

Phase 2A may reduce but cannot eliminate symlink/junction time-of-check/time-of-use races. Phase 3 adds handle/hash/atomic-write controls.

## 8. Filesystem rule precedence

Specificity is calculated mechanically:

```text
exact selector
  specificity = (3, segmentCount, normalizedLength)

subtree selector
  specificity = (2, segmentCount, normalizedLength)

deny_glob selector
  specificity = (1, literalSegmentCount, literalCharacterCount, -wildcardCount)

default
  specificity = (0, 0, 0)
```

Comparison is lexicographic from left to right. Higher value is more specific.

Decision algorithm:

1. Collect all matching compiled rules.
2. Select the highest specificity tuple.
3. If several rules have equal specificity, choose the least privilege:

```text
deny > read > write
```

Here `>` means “wins the tie,” not “grants more privilege.”

4. If no rule matches, use the explicit filesystem default.
5. A write request requires `write`; `read` does not imply write.
6. A write grant includes reading only the exact data needed to perform and verify that write through the controlled domain service; it does not create a general read grant for unrelated tools.

The compiler rejects duplicate normalized selectors with conflicting access where deterministic intent would otherwise be unclear.

## 9. Immutable hard policy

The following are code-owned, non-overridable hard denies in V1:

- Windows device, UNC, drive-relative, ADS, reserved-name, and trailing-dot/space forms;
- workspace or allowed-root escape;
- existing target or parent resolving outside the workspace through symlink/junction traversal;
- direct file-tool reads or writes to `.git/**`;
- protected secret-content classes including `.env` families, private-key files, SSH private keys, and explicitly registered credential stores;
- deployment-disabled capabilities;
- credential, Authorization, Cookie, and secret URL disclosure through policy output or audit;
- requested enforcement whose required backend capability is unavailable.

Profile, Approval, SessionGrant, AGENTS, Hook, Skill, or tool input cannot override these denies.

Performance/noise paths such as `node_modules`, `dist`, `build`, `.next`, `coverage`, and `.cache` are not permanent immutable secrets. The compatibility compiler preserves their current blocking behavior as profile denies for the first migration cycle, preventing silent expansion while allowing future explicit review.

Hard-policy extensions:

- may be added or tightened by code version;
- have stable safe rule IDs;
- cause a new policy revision;
- invalidate grants;
- cannot be removed through local profile edits;
- require a separately reviewed security migration to remove or weaken.

## 10. Git policy

Git policy is separate from filesystem access:

```text
git.read
git.write
git.remoteWrite
```

Rules:

- Git read still requires workspace/repository containment.
- Git write does not imply remote write.
- Remote write requires `git:remote-write`, `git.remoteWrite`, explicit high-risk approval, and separate product authorization outside this gate.
- Direct filesystem access to `.git/**` remains hard denied; Git operations use the Git domain service.
- Git path arguments are normalized through Filesystem resources where applicable.
- History rewriting and destructive operations require dedicated operation descriptors and cannot be inferred from `git.write = true` alone.

## 11. Shell and Process policy

Shell modes are:

```text
disabled
verify
execute
```

`verify` corresponds to a closed verification-command compatibility category, not arbitrary command execution. `execute` permits the operation only inside the effective ceiling and with all required enforcement capabilities.

`requireSandbox = true` means absence of any required capability returns a domain-specific enforcement-unavailable error. It never falls back to current-user execution.

Process policy distinguishes process management from persistent processes. `persistent = true` requires `manage = true`, appropriate identity scope, high-risk approval, and Phase 4A lifecycle implementation.

## 12. Network rules

### 12.1 Rule shape

```ts
interface NetworkRuleV1 {
  id: string;
  host: string;
  ports: number[] | { from: number; to: number }[];
  access: "allow" | "deny";
}
```

Supported host forms:

```text
example.com       exact DNS host
*.example.com     proper subdomains only
**.example.com    root and all subdomains
192.0.2.10        exact IPv4 literal
2001:db8::10      exact IPv6 literal
```

IP literals are exact-only and are still subject to resolved-address-class controls. Arbitrary middle-label wildcards and CIDR expressions are invalid in V1.

### 12.2 Host normalization

Compilation and evaluation normalize:

- lowercase;
- one trailing DNS dot removed;
- IDNA converted to ASCII;
- IPv6 brackets removed for comparison;
- explicit port or scheme default port;
- empty labels and invalid host syntax rejected.

### 12.3 Network precedence

Host specificity is:

```text
exact > *.suffix > **.suffix
```

Longer literal suffix wins within the same class. A narrower port set wins over a wider set. Equal specificity uses deny.

Network authorization also requires resolved-address classification. Domain allow does not override `allowLoopback`, `allowPrivate`, or `allowLinkLocal`.

Every redirect and connection attempt is re-evaluated. An allow decision that cannot be bound to an enforceable resolved target returns `NETWORK_ENFORCEMENT_UNAVAILABLE`.

## 13. Policy decision provenance

Every matched or decisive source has a stable safe identifier. The public decision contains only the decisive safe summary:

```text
sourceKind
safeRuleId
specificity
policyRevision
reasonCode
```

The evaluator may retain a bounded internal trace of considered rule IDs for tests and redacted audit facts. It never emits raw absolute roots, full patterns containing sensitive names, credentials, commands, or file contents.

## 14. Compatibility compiler

The migration compiler consumes the current effective runtime configuration and emits a strict compatibility Permission Profile.

### 14.1 Tool mode

```text
minimal | standard | full
  -> RuntimeProfile Tool Surface only
```

Tool mode never appears as an allow rule in the Permission Profile.

### 14.2 Write mode

```text
off
  -> filesystem.default = read when current read tools are visible
  -> no write allow rule

handoff
  -> only the exact protected .ai-bridge compatibility subtree receives write

workspace
  -> workspace subtree receives write, except all hard and compatibility denies
```

The compiler must reproduce actual old visibility and write behavior without adding access. Where old behavior is ambiguous, migration selects the narrower interpretation and records a safe warning.

### 14.3 Bash mode

```text
off
  -> shell.mode = disabled

safe
  -> shell.mode = verify
  -> current closed verification-command set retained for one cycle

full
  -> shell.mode = execute as a compatibility ceiling
  -> no claim of OS sandbox or whole-machine authorization
```

The new enforce engine may refuse an operation when required sandbox capabilities are unavailable even when the legacy full mode would have executed it. This is an intentional fail-closed restriction, not a compatibility expansion.

### 14.4 Existing blocked globs

Secret and escape-related entries become hard policy. Performance/noise entries become explicit compatibility deny-glob rules. Custom extra blocked globs become profile deny-glob rules. Migration never drops an existing blocked rule silently.

## 15. Engine migration states

```text
legacy
shadow
enforce
```

- `legacy`: current behavior only.
- `shadow`: current behavior executes; the Policy Kernel computes a deterministic redacted comparison. A shadow allow never changes a legacy deny, and a shadow deny never blocks until the discrepancy is reviewed.
- `enforce`: Policy Kernel decision is authoritative.

Shadow records contain safe decision codes, rule IDs, and fingerprints only. They exclude raw paths, commands, contents, and credentials.

A migration is accepted only when tests prove that the compatibility profile does not produce an allow where the legacy path denies for the same supported operation. New explicit fail-closed denials are permitted and documented.

## 16. Rollback

Rollback options are:

1. exact legacy behavior with the original reviewed configuration during the single migration window;
2. the hash-pinned generated compatibility profile;
3. a narrower emergency read-only profile.

Invalid profile, missing parent, migration failure, snapshot mismatch, or Policy Kernel startup failure cannot switch to unguarded execution.

No rollback deletes user profile files, credentials, workspace records, audit facts, or approval records without separate confirmation.

## 17. Required tests

- strict unknown-field and invalid-version refusal;
- inheritance resolution, cycle detection, maximum depth, source hashes, and duplicate-selector rejection;
- Windows case folding, separator handling, Unicode normalization, reserved names, ADS, drive-relative, UNC, and trailing dot/space refusal;
- exact/subtree/deny-glob specificity and equal-specificity deny;
- existing and non-existent target handling;
- symlink/junction target and parent escape refusal;
- hard deny cannot be overridden by child profile, scope, approval, or grant;
- root intersection cannot widen deployment allowed roots;
- Git read/write/remote-write independence;
- Shell disabled/verify/execute distinction and enforcement-unavailable behavior;
- Network exact/wildcard/port specificity, address classes, redirect re-evaluation, and deny tie;
- public provenance redaction;
- compatibility compilation for every current tool/write/bash combination;
- legacy/shadow/enforce comparison proving no silent permission expansion;
- rollback only to equal or narrower effective access.

## 18. Rejected alternatives

### Continue distributed mode checks

Rejected because authorization would remain handler-specific, difficult to audit, and vulnerable to direct/supertool drift.

### Allow arbitrary positive globs in V1

Rejected because deterministic user-understandable specificity across Windows aliases and non-existent targets is not sufficiently constrained for the first schema.

### Use declaration order as precedence

Rejected because reformatting or inheritance could change security behavior.

### Adopt a general external policy engine now

Rejected because it adds a runtime and policy language before CodexGPT has stabilized its resource, identity, approval, and enforcement contracts. The pure evaluator boundary can be replaced later without changing those contracts.

## 19. Security claims prohibited by this design

The Permission Profile describes policy intent and ceilings. It does not prove:

- atomic filesystem containment;
- absence of Windows TOCTOU races;
- Shell or Process sandboxing;
- network egress enforcement;
- OAuth owner identity;
- safe remote Git mutation.

Those properties require the corresponding later execution layers and acceptance evidence.
