# Windows Enforcement Threat Model and Spike Plan

**Date:** 2026-07-14  
**Status:** Approved; Policy Kernel design gate passed on 2026-07-14  
**Primary platform:** Native Windows  
**Scope:** Threat model, capability contract, test harness, fail-closed requirements, and prohibited claims. This document does not select or implement a production sandbox backend.

## 1. Security objective

CodexGPT is a self-hosted local development bridge. Cloudflare may provide DNS, TLS, and Tunnel ingress, but local authorization and execution boundaries must remain enforceable on the Windows host.

The Windows enforcement objective is:

> A Policy Kernel decision may authorize an operation only when the selected execution path can prove every required filesystem, process, environment, credential, registry, and network capability for that operation. Partial enforcement is reported explicitly and never silently treated as complete isolation.

This is defense in depth around authorized workspaces, not a claim that untrusted code can safely execute with the full current-user token.

## 2. Assets

Protected assets include:

- files outside authorized workspaces and allowed roots;
- `.env`, private keys, SSH material, browser profiles, cloud credentials, package registry credentials, and local application secrets;
- Git repository metadata and remote credentials;
- the Windows registry and credential stores;
- environment variables, inherited handles, named pipes, and local IPC endpoints;
- loopback, private-network, link-local, metadata-service, and public network destinations;
- other processes and process trees running as the same Windows user;
- saved Runtime Profiles, Permission Profiles, Token material, policy revisions, approvals, grants, and audit records;
- availability of the workstation and repository data.

## 3. Trust boundaries

```text
ChatGPT / MCP client
  -> Cloudflare ingress when used
  -> local HTTP Host/Origin/authentication boundary
  -> transport session
  -> RequestContext / Policy Kernel
  -> domain service
  -> SandboxBackend or broker
  -> Windows kernel and user profile resources
```

STDIO begins at a local process boundary rather than HTTP, but it still enters the same RequestContext, Policy Kernel, domain service, and enforcement path.

Workspace content, AGENTS files, package scripts, source code, build scripts, test runners, interpreters, Hooks, Skills, and tool arguments are untrusted inputs with respect to host security.

## 4. Threat actors and abuse cases

The model covers:

- a malicious or compromised remote MCP client holding a shared Token;
- prompt injection in repository content or generated instructions;
- a malicious trusted-repository dependency or package script;
- an accidental overly broad Profile or Approval;
- a local low-assurance loopback client;
- a process that spawns child, detached, or interpreter processes;
- a DNS server, redirect target, proxy, or local network service attempting to redirect traffic;
- a concurrent local process changing junctions, symlinks, files, or policy state between checks and use;
- malformed Windows paths exploiting alternate syntax or normalization differences;
- logging and diagnostic paths leaking credentials or sensitive resources.

## 5. Required capability report

A backend reports facts through `SandboxCapabilityReportV1`:

```ts
interface SandboxCapabilityReportV1 {
  schemaVersion: 1;
  backendId: string;
  backendVersion: string;
  platform: "win32";
  filesystemReadBoundary: "none" | "brokered" | "kernel_enforced";
  filesystemWriteBoundary: "none" | "brokered" | "kernel_enforced";
  processTreeControl: "none" | "best_effort" | "job_object" | "strong";
  networkEgressControl: "none" | "proxy_only" | "platform_enforced";
  environmentIsolation: "none" | "filtered" | "isolated";
  credentialIsolation: "none" | "partial" | "isolated";
  registryIsolation: "none" | "partial" | "isolated";
  supportsPeerAddressVerification: boolean;
  supportsRedirectReauthorization: boolean;
  supportsRevocation: boolean;
  evidenceRevision: string;
}
```

The report is generated from executable probes and backend version facts, not configuration claims. The policy snapshot records the report revision.

## 6. Enforcement principle

Every operation declares required capabilities. Examples:

```text
Node-hosted bounded file read
  filesystemReadBoundary may be brokered by the CodexGPT process
  no child process required

Opaque Shell verification command
  filesystemReadBoundary
  filesystemWriteBoundary according to command class
  processTreeControl
  environmentIsolation
  networkEgressControl when network must be disabled
  credentialIsolation

Persistent process
  processTreeControl
  supportsRevocation
  environmentIsolation
  filesystem and network capabilities required by its grant
```

When any required capability is absent:

```text
Shell   -> SHELL_SANDBOX_UNAVAILABLE
Process -> PROCESS_SANDBOX_UNAVAILABLE
Network -> NETWORK_ENFORCEMENT_UNAVAILABLE
```

No backend may advertise a stronger capability than its tests demonstrate.

## 7. Windows filesystem threats

### 7.1 Alternate path forms

The hard policy rejects:

- `\\?\` and `\\.\` device namespaces;
- UNC paths in V1;
- drive-relative paths such as `C:relative`;
- NTFS alternate data streams;
- reserved device basenames;
- trailing spaces and dots;
- NUL bytes;
- cross-drive escapes;
- canonical targets outside allowed roots.

Tests must include mixed slash forms, case variation, long path forms, Unicode normalization variants, reserved names with extensions, and alternate stream syntax.

### 7.2 Junction and symlink escape

Threat:

1. Policy validates a path or parent inside the workspace.
2. Another process replaces a segment with a junction or symlink.
3. Execution reaches an outside target.

Phase 2A controls:

- lexical validation;
- native realpath of existing targets and closest existing parents;
- target and parent containment checks;
- pre-side-effect policy-revision and parent-identity revalidation;
- refusal to write through a detected symbolic link;
- no claim of complete race elimination.

Phase 3 must add handle-oriented identity, expected hashes where applicable, atomic replacement, and transaction/rollback semantics.

### 7.3 Hard links and file identity

The spike must determine whether allowed workspace files can be hard-linked to sensitive files under supported filesystems and privileges. Where file identity cannot be proven safe, write operations through such paths must be refused or brokered with a stronger identity check.

### 7.4 Direct `.git` access

Direct file tools remain prohibited from `.git/**`. Git operations use the Git domain service so policy can distinguish Git read, local write, history mutation, and remote write.

## 8. Process threats

### 8.1 Child and detached processes

A command may spawn:

- direct children;
- grandchildren;
- detached processes;
- scheduled tasks;
- services;
- WMI or PowerShell-created processes;
- interpreters that launch additional executables.

The spike must verify process-tree containment and termination behavior for `cmd.exe`, PowerShell, Git Bash, Node.js, Python, and representative package runners.

### 8.2 Job Object limits

A Windows Job Object may provide lifecycle and process-tree controls. It does not by itself provide:

- filesystem access control;
- registry isolation;
- credential isolation;
- network egress control;
- protection from every process-creation escape mechanism.

A backend using a Job Object may report `processTreeControl = job_object` only after escape and termination tests pass. All other capability fields remain independently evaluated.

### 8.3 Current-user token risk

Running arbitrary code with the normal current-user token may expose the entire user profile, credentials, registry, browser data, network, and other processes. Approval cannot make this safe. If the selected backend cannot reduce or broker those capabilities to the required boundary, the operation fails closed.

### 8.4 Environment and inherited handles

The spike must inspect:

- inherited environment variables;
- `HOME`, `USERPROFILE`, credential helper variables, proxy variables, package registry variables, cloud variables, and SSH-related variables;
- inherited standard handles and unintended inheritable handles;
- named pipes and local IPC endpoints;
- temporary-directory placement and permissions.

A filtered environment is not full credential isolation. Capability reports must use the narrower fact.

## 9. Registry and credential threats

The spike must test access to:

- HKCU and selected HKLM locations;
- Windows Credential Manager interfaces;
- DPAPI-protected material available to the current user;
- browser profile stores;
- Git credential helpers;
- SSH agent or pageant-like sockets/pipes;
- package manager credential files.

If a backend cannot isolate these assets, `credentialIsolation` and `registryIsolation` remain `none` or `partial`. Opaque Shell execution requiring isolation must be refused.

## 10. Network threats

### 10.1 Address classes

Every resolved or literal target is classified at least as:

```text
loopback
private
link_local
multicast
unspecified
reserved
public
```

Domain allow rules do not override address-class restrictions.

### 10.2 DNS rebinding and resolution race

Threat:

1. An allowed hostname resolves to a public address during policy evaluation.
2. It resolves to loopback or private space during connection.

Required design:

- authorize resolved address sets, not hostname strings alone;
- bind connection to the authorized result when the backend supports it;
- verify the actual peer address;
- reauthorize new resolutions;
- fail closed when this binding cannot be enforced for a protected operation.

### 10.3 Redirects

Every redirect is a new Network resource. Scheme, hostname, port, and resolved address classes are re-evaluated. Redirecting from allowed public HTTPS to loopback, private HTTP, file URLs, or unsupported schemes is refused.

### 10.4 Proxies and subprocess bypass

The spike must test:

- `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY`;
- system proxy settings;
- application-specific proxies;
- child processes and interpreters opening sockets directly;
- DNS-over-HTTPS clients;
- local proxy and loopback relays.

A domain list in Node code is not a network sandbox for arbitrary child processes. If all traffic cannot be forced through an authorized enforcement point, the backend cannot report platform-enforced egress control.

### 10.5 Cloudflare distinction

Cloudflare Tunnel protects inbound exposure and TLS routing. It does not enforce outbound network access for local tools or child processes and is not part of `SandboxBackend` egress capability.

## 11. Candidate spike families

The spike may evaluate combinations of:

- a brokered file-operation model inside the CodexGPT Node process;
- restricted Windows access tokens;
- AppContainer or comparable Windows isolation primitives;
- Job Objects for process lifecycle;
- explicit environment construction;
- a controlled egress proxy with peer verification;
- Windows Filtering Platform or another platform-enforced network layer;
- separate low-privilege worker processes;
- Windows Sandbox or disposable VM approaches for later high-risk workflows.

No candidate is selected merely because an API exists. It must pass the capability-specific harness and meet native-Windows usability constraints. WSL may remain an optional backend but cannot become mandatory.

## 12. Spike harness

The spike produces a reproducible local harness with fixtures that attempt:

### Filesystem

- read and write inside the workspace;
- read and write outside the workspace;
- access `.env`, SSH private keys, browser profile data, and representative credential files;
- traverse symlinks and junctions;
- swap a junction between authorization and execution;
- use ADS, device paths, UNC, drive-relative, reserved names, and trailing-dot/space forms;
- create child interpreters that attempt the same accesses.

### Process

- spawn child and grandchild processes;
- detach or break away;
- exceed timeout;
- survive parent termination;
- create through PowerShell, cmd, Git Bash, Node, Python, WMI-like paths where safely testable;
- attempt scheduled task or service creation without performing irreversible host changes.

### Environment, credentials, and registry

- enumerate selected environment variables;
- read permitted and prohibited temporary locations;
- access selected HKCU fixtures;
- probe representative credential interfaces with synthetic fixtures;
- inspect inherited handles and local IPC fixtures.

### Network

- connect to allowed public fixture;
- connect to loopback and private synthetic fixtures;
- follow redirects across address classes;
- exercise DNS answer changes;
- use proxy environment variables;
- open sockets from Node, Python, PowerShell, and Git Bash children;
- verify actual peer address when the backend claims support.

All fixtures use synthetic test secrets and local controlled services. The harness does not read or transmit the user's real credentials.

## 13. Acceptance levels

A capability is accepted only when:

1. positive allowed cases succeed;
2. negative prohibited cases fail for the intended enforcement reason;
3. child-process variants do not bypass the boundary;
4. cleanup leaves no persistent process, task, service, route, proxy, firewall, registry, or credential change;
5. results are reproducible on supported native Windows versions;
6. the capability report matches the observed boundary exactly;
7. failures produce stable redacted errors.

A partial result remains useful, but the report must state the partial level. For example, successful Job Object termination plus failed network containment yields process-tree capability only.

## 14. Fail-closed integration

The Policy Kernel compares operation requirements with the capability report.

Examples:

```text
required filesystemWriteBoundary = brokered
actual filesystemWriteBoundary = brokered
  -> capability satisfied

required networkEgressControl = platform_enforced
actual networkEgressControl = proxy_only
  -> NETWORK_ENFORCEMENT_UNAVAILABLE

required credentialIsolation = isolated
actual credentialIsolation = partial
  -> SHELL_SANDBOX_UNAVAILABLE
```

Capability probe errors, stale evidence revisions, backend version mismatch, or unknown capability values are treated as unavailable.

## 15. Revocation and policy changes

For future persistent processes, the backend must expose whether it supports revocation. A policy/profile/session change requires one of:

- terminate the process tree;
- revoke its brokered handles and network authorization;
- quarantine it from further input/output;
- refuse to start persistent execution when revocation cannot be enforced.

Continuing an old process under a broader obsolete grant is prohibited.

## 16. Audit boundaries

Allowed enforcement audit fields include:

- backend ID and version;
- capability report revision;
- required capability names;
- missing capability names;
- process exit code and bounded counts;
- safe fixture or operation IDs.

Forbidden fields include:

- full command text or output;
- real credential contents;
- private keys;
- browser data;
- Authorization/Cookie;
- sensitive absolute paths;
- unredacted environment values;
- proxy credentials.

## 17. Rollback and cleanup

Every spike candidate must provide a cleanup procedure and verification that no persistent host change remains. Candidate installation or system-policy changes require separate explicit approval before execution.

Production rollback may disable the backend and narrow affected capabilities. It cannot silently run the same operation with current-user permissions.

## 18. Security claims explicitly prohibited

Until capability-specific evidence passes, CodexGPT must not claim:

- complete Windows sandboxing;
- filesystem isolation from a Job Object;
- network isolation from a domain allowlist;
- credential isolation from environment filtering alone;
- process-tree containment without breakaway tests;
- elimination of junction/symlink TOCTOU;
- safe execution of arbitrary repository code under the normal user token;
- Cloudflare Tunnel provides outbound egress control;
- WSL is required for the supported Windows product path.

## 19. Required Phase 2A deliverable

Phase 2A must produce a design-to-evidence report containing:

- candidates evaluated;
- exact Windows versions and backend versions;
- fixture and probe results;
- accepted capability levels;
- rejected or partial capabilities;
- stable fail-closed mappings;
- cleanup verification;
- security properties that remain unguaranteed;
- recommendation for Phase 4B production implementation.

The report may conclude that no candidate currently satisfies a capability. In that case the correct product behavior is to keep the affected operation disabled or enforcement-unavailable.
