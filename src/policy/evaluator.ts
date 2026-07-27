import { createHash } from "node:crypto";
import path from "node:path";
import { minimatch } from "minimatch";
import {
  credentialRevisionForCredentialRef,
  credentialRevisionForIdentity
} from "../auth/policyIdentity.js";
import { evaluateHardPolicy } from "./hardPolicy.js";
import { policyDecisionV1Schema } from "./schemas.js";
import type {
  CompiledPermissionProfileV1,
  FilesystemAccess,
  FilesystemBatchResourceV1,
  FilesystemResourceV1,
  NetworkResourceV1,
  PolicyDecisionProvenanceV1,
  PolicyDecisionV1,
  PolicyReasonCode,
  PolicyScope,
  RequestContextV1,
  RequiredCapabilityV1,
  ResourceDescriptorV1,
  RiskClass,
  SandboxCapabilityReportV1,
  SessionGrantV1
} from "./types.js";

export interface ProfileEvaluation {
  allowed: boolean;
  safeRuleId: string;
  specificity: number[];
}

export interface EvaluatePolicyInput {
  context: RequestContextV1;
  activePolicyRevision: string;
  profile: CompiledPermissionProfileV1;
  resource: ResourceDescriptorV1;
  riskClass: RiskClass;
  grants: readonly SessionGrantV1[];
  requiredCapabilities: readonly RequiredCapabilityV1[];
  capabilities: SandboxCapabilityReportV1;
  deploymentDisabled: boolean;
  now: string;
  platform: NodeJS.Platform;
  toolContractVersion: string;
  inputDigest: string;
}

const ACCESS_TIE_PRIORITY: Record<FilesystemAccess, number> = {
  write: 0,
  read: 1,
  deny: 2
};

const LEVEL_RANKS: Record<string, readonly string[]> = {
  filesystemReadBoundary: ["none", "brokered", "kernel_enforced"],
  filesystemWriteBoundary: ["none", "brokered", "kernel_enforced"],
  processTreeControl: ["none", "best_effort", "job_object", "strong"],
  networkEgressControl: ["none", "proxy_only", "platform_enforced"],
  environmentIsolation: ["none", "filtered", "isolated"],
  credentialIsolation: ["none", "partial", "isolated"],
  registryIsolation: ["none", "partial", "isolated"]
};

export function compareSpecificity(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function normalizePolicyPath(value: string, platform: NodeJS.Platform): string {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/")).normalize("NFC");
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

function selectorSpecificity(kind: "exact" | "subtree" | "deny_glob", value: string): number[] {
  if (kind === "exact") return [3, value.split("/").length, value.length];
  if (kind === "subtree") return [2, value === "." ? 0 : value.split("/").length, value.length];
  const literalCharacters = value.replace(/[*?{}[\]!]/g, "").length;
  const wildcardCount = (value.match(/[*?]/g) ?? []).length;
  const literalSegments = value.split("/").filter((segment) => !/[*?{}[\]!]/.test(segment)).length;
  return [1, literalSegments, literalCharacters, -wildcardCount];
}

function filesystemProfileEvaluation(
  profile: CompiledPermissionProfileV1,
  resource: FilesystemResourceV1,
  platform: NodeJS.Platform
): ProfileEvaluation {
  const target = resource.comparisonKey;
  const matches = profile.filesystem.rules.flatMap((rule) => {
    if (rule.selector.kind === "deny_glob") {
      const pattern = platform === "win32"
        ? rule.selector.pattern.toLocaleLowerCase("en-US")
        : rule.selector.pattern;
      if (!minimatch(target, pattern, { dot: true, nocase: platform === "win32", matchBase: false })) return [];
      return [{ rule, specificity: selectorSpecificity("deny_glob", pattern) }];
    }
    const selectorPath = normalizePolicyPath(rule.selector.path, platform);
    const matchesSelector = rule.selector.kind === "exact"
      ? target === selectorPath
      : selectorPath === "." || target === selectorPath || target.startsWith(`${selectorPath}/`);
    return matchesSelector ? [{ rule, specificity: selectorSpecificity(rule.selector.kind, selectorPath) }] : [];
  });

  let selected: typeof matches[number] | undefined;
  for (const candidate of matches) {
    if (!selected) {
      selected = candidate;
      continue;
    }
    const specificity = compareSpecificity(candidate.specificity, selected.specificity);
    if (specificity > 0 || (specificity === 0 && ACCESS_TIE_PRIORITY[candidate.rule.access] > ACCESS_TIE_PRIORITY[selected.rule.access])) {
      selected = candidate;
    }
  }

  const access = selected?.rule.access ?? profile.filesystem.default;
  const required: "read" | "write" = resource.operation === "read" || resource.operation === "list" || resource.operation === "search"
    ? "read"
    : "write";
  const allowed = required === "write"
    ? access === "write"
    : access === "read" || (access === "write" && profile.filesystem.default === "read");
  return {
    allowed,
    safeRuleId: selected?.rule.id ?? `profile.fs.default.${profile.filesystem.default}`,
    specificity: selected?.specificity ?? [0, 0, 0]
  };
}

function filesystemBatchProfileEvaluation(
  profile: CompiledPermissionProfileV1,
  resource: FilesystemBatchResourceV1,
  platform: NodeJS.Platform
): ProfileEvaluation {
  const paths = resource.entries.flatMap((entry) => [
    entry.sourceComparisonKey,
    entry.destinationComparisonKey
  ].filter((value): value is string => value !== null));
  const evaluations = paths.map((comparisonKey) => filesystemProfileEvaluation(profile, {
    schemaVersion: 1,
    kind: "filesystem",
    operation: "write",
    workspaceId: resource.workspaceId,
    relativePath: comparisonKey,
    comparisonKey,
    targetExists: false,
    containment: "inside",
    existingParentIdentity: "parent_batch_policy",
    unresolvedSuffix: [],
    resourceFingerprint: resource.resourceFingerprint
  }, platform));
  const denied = evaluations.find((evaluation) => !evaluation.allowed);
  if (denied) return denied;
  return evaluations.reduce((selected, evaluation) =>
    compareSpecificity(evaluation.specificity, selected.specificity) > 0 ? evaluation : selected
  );
}

function hostRuleMatches(ruleHost: string, targetHost: string): boolean {
  if (ruleHost.startsWith("**.")) {
    const suffix = ruleHost.slice(3);
    return targetHost === suffix || targetHost.endsWith(`.${suffix}`);
  }
  if (ruleHost.startsWith("*.")) {
    const suffix = ruleHost.slice(2);
    return targetHost !== suffix && targetHost.endsWith(`.${suffix}`);
  }
  return targetHost === ruleHost;
}

function portRuleMatches(ports: CompiledPermissionProfileV1["network"]["rules"][number]["ports"], port: number): boolean {
  if (ports.length === 0) return false;
  const first = ports[0];
  if (typeof first === "number") return (ports as number[]).includes(port);
  return (ports as Array<{ from: number; to: number }>).some((range) => port >= range.from && port <= range.to);
}

function portWidth(ports: CompiledPermissionProfileV1["network"]["rules"][number]["ports"]): number {
  const first = ports[0];
  if (typeof first === "number") return Math.max(1, (ports as number[]).length);
  return Math.max(1, (ports as Array<{ from: number; to: number }>).reduce((total, range) => total + range.to - range.from + 1, 0));
}

function networkProfileEvaluation(profile: CompiledPermissionProfileV1, resource: NetworkResourceV1): ProfileEvaluation {
  if (!profile.network.enabled) return { allowed: false, safeRuleId: "profile.network.disabled", specificity: [0] };
  if (resource.addressClasses.includes("loopback") && !profile.network.allowLoopback) {
    return { allowed: false, safeRuleId: "profile.network.loopback-denied", specificity: [4] };
  }
  if (resource.addressClasses.includes("private") && !profile.network.allowPrivate) {
    return { allowed: false, safeRuleId: "profile.network.private-denied", specificity: [4] };
  }
  if (resource.addressClasses.includes("link_local") && !profile.network.allowLinkLocal) {
    return { allowed: false, safeRuleId: "profile.network.link-local-denied", specificity: [4] };
  }
  if (resource.addressClasses.some((value) => value === "multicast" || value === "unspecified" || value === "reserved")) {
    return { allowed: false, safeRuleId: "profile.network.special-address-denied", specificity: [4] };
  }

  const matches = profile.network.rules.flatMap((rule) => {
    const normalizedRuleHost = rule.host.toLocaleLowerCase("en-US").replace(/\.$/, "");
    if (!hostRuleMatches(normalizedRuleHost, resource.host) || !portRuleMatches(rule.ports, resource.port)) return [];
    const hostClass = normalizedRuleHost.startsWith("**.") ? 1 : normalizedRuleHost.startsWith("*.") ? 2 : 3;
    const literal = normalizedRuleHost.replace(/^\*\*?\./, "");
    return [{
      rule,
      specificity: [hostClass, literal.split(".").length, literal.length, -portWidth(rule.ports)]
    }];
  });

  let selected: typeof matches[number] | undefined;
  for (const candidate of matches) {
    if (!selected) {
      selected = candidate;
      continue;
    }
    const specificity = compareSpecificity(candidate.specificity, selected.specificity);
    if (specificity > 0 || (specificity === 0 && candidate.rule.access === "deny" && selected.rule.access === "allow")) {
      selected = candidate;
    }
  }
  return selected
    ? { allowed: selected.rule.access === "allow", safeRuleId: selected.rule.id, specificity: selected.specificity }
    : { allowed: false, safeRuleId: "profile.network.default-deny", specificity: [0] };
}

export function evaluateProfile(
  profile: CompiledPermissionProfileV1,
  resource: ResourceDescriptorV1,
  platform: NodeJS.Platform = process.platform
): ProfileEvaluation {
  switch (resource.kind) {
    case "filesystem":
      return filesystemProfileEvaluation(profile, resource, platform);
    case "filesystem_batch":
      return filesystemBatchProfileEvaluation(profile, resource, platform);
    case "git": {
      const allowed = resource.operation === "read"
        ? profile.git.read
        : resource.operation === "remote_write"
          ? profile.git.remoteWrite
          : profile.git.write;
      return { allowed, safeRuleId: `profile.git.${resource.operation}`, specificity: [1] };
    }
    case "shell": {
      const allowed = resource.operation === "verify"
        ? profile.shell.mode === "verify" || profile.shell.mode === "execute"
        : profile.shell.mode === "execute";
      return { allowed, safeRuleId: `profile.shell.${profile.shell.mode}`, specificity: [1] };
    }
    case "process":
      return {
        allowed: profile.process.manage && (!resource.persistence || profile.process.persistent),
        safeRuleId: resource.persistence ? "profile.process.persistent" : "profile.process.manage",
        specificity: [1]
      };
    case "network":
      return networkProfileEvaluation(profile, resource);
    case "audit":
      return { allowed: true, safeRuleId: "profile.audit.query", specificity: [1] };
  }
}

function scopeForResource(resource: ResourceDescriptorV1): PolicyScope {
  switch (resource.kind) {
    case "filesystem":
      return resource.operation === "read" || resource.operation === "list" || resource.operation === "search"
        ? "filesystem:read"
        : "filesystem:write";
    case "filesystem_batch":
      return "filesystem:write";
    case "git":
      return resource.operation === "read" ? "git:read" : resource.operation === "remote_write" ? "git:remote-write" : "git:write";
    case "shell":
      return resource.operation === "verify" ? "shell:verify" : "shell:execute";
    case "process":
      return "process:manage";
    case "network":
      return "network:connect";
    case "audit":
      return "audit:read";
  }
}

function capabilitySatisfies(report: SandboxCapabilityReportV1, requirement: RequiredCapabilityV1): boolean {
  const actual = report[requirement.name];
  if (typeof requirement.minimum === "boolean") return actual === requirement.minimum;
  if (typeof actual !== "string") return false;
  const ranking = LEVEL_RANKS[requirement.name];
  if (!ranking) return actual === requirement.minimum;
  return ranking.indexOf(actual) >= ranking.indexOf(requirement.minimum) && ranking.indexOf(requirement.minimum) >= 0;
}

export function missingCapabilities(
  required: readonly RequiredCapabilityV1[],
  report: SandboxCapabilityReportV1
): RequiredCapabilityV1[] {
  return required.filter((requirement) => !capabilitySatisfies(report, requirement));
}

function grantMatches(input: EvaluatePolicyInput, grant: SessionGrantV1): boolean {
  const now = Date.parse(input.now);
  return grant.credentialRef === input.context.identity.credentialRef &&
    (grant.credentialRevision ?? credentialRevisionForCredentialRef(grant.credentialRef)) === credentialRevisionForIdentity(input.context.identity) &&
    grant.transportSessionId === input.context.transportSessionId &&
    grant.workspaceId === input.context.workspaceId &&
    grant.policyRevision === input.context.policyRevision &&
    grant.toolContractVersion === input.toolContractVersion &&
    grant.operation === `${input.resource.kind}.${input.resource.operation}` &&
    grant.resourceFingerprint === input.resource.resourceFingerprint &&
    grant.inputDigest === input.inputDigest &&
    grant.riskClass === input.riskClass &&
    Date.parse(grant.issuedAt) <= now &&
    Date.parse(grant.expiresAt) > now &&
    (grant.usesRemaining === null || grant.usesRemaining > 0);
}

function provenance(
  sourceKind: PolicyDecisionProvenanceV1["sourceKind"],
  safeRuleId: string | null,
  specificity: number[] = [],
  overrides: Partial<PolicyDecisionProvenanceV1> = {}
): PolicyDecisionProvenanceV1 {
  return {
    sourceKind,
    safeRuleId,
    specificity,
    grantId: null,
    approvalId: null,
    enforcementBackend: null,
    ...overrides
  };
}

function deterministicDecisionId(input: Omit<PolicyDecisionV1, "schemaVersion" | "decisionId">): string {
  const digest = createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex").slice(0, 24);
  return `decision_${digest}`;
}

function decision(
  input: EvaluatePolicyInput,
  outcome: PolicyDecisionV1["outcome"],
  reasonCode: PolicyReasonCode | null,
  decisionProvenance: PolicyDecisionProvenanceV1[],
  requiredApproval: PolicyDecisionV1["requiredApproval"] = null,
  requiredEnforcement: RequiredCapabilityV1[] = []
): PolicyDecisionV1 {
  const facts = {
    outcome,
    reasonCode,
    policyRevision: input.activePolicyRevision,
    resourceFingerprint: input.resource.resourceFingerprint,
    requiredApproval,
    requiredEnforcement,
    provenance: decisionProvenance
  };
  return policyDecisionV1Schema.parse({
    schemaVersion: 1,
    decisionId: deterministicDecisionId(facts),
    ...facts
  });
}

function enforcementReason(resource: ResourceDescriptorV1): PolicyReasonCode {
  if (resource.kind === "shell") return "SHELL_SANDBOX_UNAVAILABLE";
  if (resource.kind === "process") return "PROCESS_SANDBOX_UNAVAILABLE";
  if (resource.kind === "network") return "NETWORK_ENFORCEMENT_UNAVAILABLE";
  return "POLICY_CONFIG_INVALID";
}

function approvalRequirement(riskClass: Exclude<RiskClass, "R0" | "R4">): PolicyDecisionV1["requiredApproval"] {
  return {
    riskClass,
    maxTtlMs: riskClass === "R1" ? 30 * 60_000 : riskClass === "R2" ? 5 * 60_000 : 2 * 60_000,
    uses: riskClass === "R3" ? 1 : null
  };
}

export function evaluatePolicy(input: EvaluatePolicyInput): PolicyDecisionV1 {
  if (input.context.policyRevision !== input.activePolicyRevision) {
    return decision(input, "deny", "POLICY_CONTEXT_STALE", [provenance("deployment", "policy.context.stale")]);
  }

  const hardMatches = evaluateHardPolicy(input.resource, { capabilityDisabled: input.deploymentDisabled });
  if (hardMatches.length > 0) {
    return decision(input, "deny", "POLICY_DENIED", [provenance("hard_policy", hardMatches[0].id)]);
  }

  const requiredScope = scopeForResource(input.resource);
  if (!input.context.identity.scopes.includes(requiredScope)) {
    return decision(input, "deny", "POLICY_DENIED", [provenance("identity_scope", `scope.${requiredScope}`)]);
  }

  const profileResult = evaluateProfile(input.profile, input.resource, input.platform);
  if (!profileResult.allowed) {
    return decision(input, "deny", "POLICY_DENIED", [provenance("permission_profile", profileResult.safeRuleId, profileResult.specificity)]);
  }

  const missing = missingCapabilities(input.requiredCapabilities, input.capabilities);
  if (missing.length > 0) {
    return decision(
      input,
      "enforcement_unavailable",
      enforcementReason(input.resource),
      [provenance("enforcement", "enforcement.capability.missing", [], { enforcementBackend: input.capabilities.backendId })],
      null,
      missing
    );
  }

  if (input.riskClass === "R4") {
    return decision(input, "deny", "POLICY_DENIED", [provenance("approval_policy", "approval.r4.unapprovable")]);
  }
  if (input.riskClass === "R0") {
    return decision(input, "allow", null, [provenance("permission_profile", profileResult.safeRuleId, profileResult.specificity)]);
  }

  const matchingGrant = input.grants.find((grant) => grantMatches(input, grant));
  if (matchingGrant) {
    return decision(input, "allow", null, [
      provenance("permission_profile", profileResult.safeRuleId, profileResult.specificity),
      provenance("session_grant", "grant.exact", [], { grantId: matchingGrant.grantId })
    ]);
  }

  return decision(
    input,
    "approval_required",
    "APPROVAL_REQUIRED",
    [provenance("approval_policy", `approval.${input.riskClass.toLocaleLowerCase("en-US")}`)],
    approvalRequirement(input.riskClass)
  );
}
