import { sandboxCapabilityReportV1Schema } from "./schemas.js";
import type { RequiredCapabilityV1, SandboxCapabilityReportV1 } from "./types.js";

const LEVEL_RANKS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  filesystemReadBoundary: Object.freeze(["none", "brokered", "kernel_enforced"]),
  filesystemWriteBoundary: Object.freeze(["none", "brokered", "kernel_enforced"]),
  processTreeControl: Object.freeze(["none", "best_effort", "job_object", "strong"]),
  networkEgressControl: Object.freeze(["none", "proxy_only", "platform_enforced"]),
  environmentIsolation: Object.freeze(["none", "filtered", "isolated"]),
  credentialIsolation: Object.freeze(["none", "partial", "isolated"]),
  registryIsolation: Object.freeze(["none", "partial", "isolated"])
});

export function baselineNodeCapabilityReport(
  platform: NodeJS.Platform = process.platform
): SandboxCapabilityReportV1 {
  return Object.freeze(sandboxCapabilityReportV1Schema.parse({
    schemaVersion: 1,
    backendId: "codexgpt-node-broker",
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
  }));
}

export function capabilitySatisfies(
  report: SandboxCapabilityReportV1,
  requirement: RequiredCapabilityV1
): boolean {
  const actual = report[requirement.name];
  if (typeof requirement.minimum === "boolean") return actual === requirement.minimum;
  if (typeof actual !== "string") return false;
  const ranking = LEVEL_RANKS[requirement.name];
  if (!ranking) return actual === requirement.minimum;
  const minimumIndex = ranking.indexOf(requirement.minimum);
  const actualIndex = ranking.indexOf(actual);
  return minimumIndex >= 0 && actualIndex >= minimumIndex;
}

export function missingCapabilities(
  required: readonly RequiredCapabilityV1[],
  report: SandboxCapabilityReportV1
): RequiredCapabilityV1[] {
  return required.filter((requirement) => !capabilitySatisfies(report, requirement));
}
