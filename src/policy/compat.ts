import type { CodexGPTConfig } from "../config.js";
import { permissionProfileDocumentV1Schema, permissionProfileDocumentV3Schema } from "./schemas.js";
import type { FilesystemRuleV1, PermissionProfileDocumentV1, PermissionProfileDocumentV3 } from "./types.js";

const HARD_GLOB_PATTERNS = [
  /^\.git(?:\/\*\*)?$/i,
  /^\*\*\/\.git(?:\/\*\*)?$/i,
  /^\.env(?:\.\*|\/\*\*)?$/i,
  /^\*\*\/\.env(?:\.\*|\/\*\*|\.\*\/\*\*)?$/i,
  /^\*\*\/\*\.(?:pem|key)$/i,
  /^\*\*\/(?:id_rsa|id_ed25519)(?:\.\*)?$/i,
  /^\*\*\/\.ssh\/\*\*$/i
];

function isHardPolicyGlob(pattern: string): boolean {
  return HARD_GLOB_PATTERNS.some((candidate) => candidate.test(pattern));
}

function safeRuleId(index: number): string {
  return `compat.blocked.${String(index + 1).padStart(4, "0")}`;
}

function compatibilityDenyRules(blockedGlobs: readonly string[]): FilesystemRuleV1[] {
  const seen = new Set<string>();
  const rules: FilesystemRuleV1[] = [];
  for (const pattern of blockedGlobs) {
    const normalized = pattern.trim().replaceAll("\\", "/");
    if (!normalized || seen.has(normalized) || isHardPolicyGlob(normalized)) continue;
    seen.add(normalized);
    rules.push({
      id: safeRuleId(rules.length),
      selector: { kind: "deny_glob", pattern: normalized },
      access: "deny"
    });
  }
  return rules;
}

export function compileCompatibilityProfile(config: CodexGPTConfig): PermissionProfileDocumentV1 {
  const rules = compatibilityDenyRules(config.blockedGlobs);
  if (config.writeMode === "handoff") {
    rules.push({
      id: "compat.write.handoff",
      selector: { kind: "subtree", path: config.contextDir },
      access: "write"
    });
  } else if (config.writeMode === "workspace") {
    rules.push({
      id: "compat.write.workspace",
      selector: { kind: "subtree", path: "." },
      access: "write"
    });
  }

  return permissionProfileDocumentV1Schema.parse({
    schemaVersion: 1,
    id: "compat-v1",
    description: "Generated conservative compatibility profile for the current runtime modes.",
    workspaceRoots: [config.defaultRoot],
    filesystem: {
      default: "read",
      rules
    },
    git: {
      read: true,
      write: config.writeMode === "workspace",
      remoteWrite: false
    },
    shell: {
      mode: config.bashMode === "off" ? "disabled" : config.bashMode === "safe" ? "verify" : "execute",
      requireSandbox: true
    },
    process: {
      manage: false,
      persistent: false,
      requireSandbox: true
    },
    network: {
      enabled: false,
      rules: [],
      allowLoopback: false,
      allowPrivate: false,
      allowLinkLocal: false,
      requireEnforcement: true
    }
  });
}

export function compileCompatibilityProfileV3(config: CodexGPTConfig): PermissionProfileDocumentV3 {
  const v1 = compileCompatibilityProfile(config);
  const { schemaVersion: _schemaVersion, ...base } = v1;
  return permissionProfileDocumentV3Schema.parse({
    ...base,
    schemaVersion: 3,
    id: "compat-v3",
    description: "Generated conservative V3 profile. Ambient full access is not eligible without an explicit profile.",
    fullAccess: {
      ambientFilesystem: false,
      ambientCredentials: false,
      ambientRegistry: false,
      unrestrictedNetwork: false,
      requireBlockedPathEnforcement: true,
      requireCredentialIsolation: true,
      requireRegistryIsolation: true,
      requireDeviceIsolation: true,
      requireNetworkEnforcement: true,
      requireSandbox: true
    }
  });
}
