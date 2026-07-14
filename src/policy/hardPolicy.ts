import type { ResourceDescriptorV1 } from "./types.js";

export const HARD_POLICY_REVISION = "hard-policy-v1" as const;

export interface HardPolicyDeploymentFacts {
  capabilityDisabled: boolean;
}

export interface HardPolicyMatch {
  id: string;
}

function filesystemSegments(relativePath: string): string[] {
  return relativePath.replaceAll("\\", "/").split("/").filter(Boolean).map((segment) => segment.toLocaleLowerCase("en-US"));
}

function isEnvFamily(segments: string[]): boolean {
  return segments.some((segment) => segment === ".env" || segment.startsWith(".env."));
}

function isGitMetadata(segments: string[]): boolean {
  return segments.includes(".git");
}

function isPrivateKey(segments: string[]): boolean {
  const basename = segments.at(-1) ?? "";
  return segments.includes(".ssh") ||
    basename === "id_rsa" || basename.startsWith("id_rsa.") ||
    basename === "id_ed25519" || basename.startsWith("id_ed25519.") ||
    basename.endsWith(".pem") || basename.endsWith(".key");
}

export function evaluateHardPolicy(
  resource: ResourceDescriptorV1,
  deployment: HardPolicyDeploymentFacts
): HardPolicyMatch[] {
  const matches: HardPolicyMatch[] = [];
  if (deployment.capabilityDisabled) matches.push({ id: "hard.deployment.disabled" });

  if (resource.kind === "filesystem") {
    if (resource.containment !== "inside") matches.push({ id: "hard.fs.escape" });
    const segments = filesystemSegments(resource.comparisonKey);
    if (isEnvFamily(segments)) matches.push({ id: "hard.fs.secret.env" });
    if (isPrivateKey(segments)) matches.push({ id: "hard.fs.private-key" });
    if (isGitMetadata(segments)) matches.push({ id: "hard.fs.git-direct" });
  }

  return matches;
}
