import { createHash } from "node:crypto";
import { authConfigurationError } from "./errors.js";
import type { OAuthDeploymentConfiguration } from "./types.js";
import type {
  AuthStateStore,
  DeploymentRegistryEntryV1,
  DeploymentRegistryV1,
  DeploymentStateV1
} from "./stateStore.js";

function samePath(left: string, right: string, platform: NodeJS.Platform): boolean {
  return platform === "win32"
    ? left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US")
    : left === right;
}

function normalizedIdentityKey(value: string): string {
  if (/^sha256:[a-f0-9]{64}$/.test(value)) return value;
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export class DeploymentRegistry {
  constructor(
    readonly store: AuthStateStore,
    readonly platform: NodeJS.Platform = process.platform
  ) {}

  resolve(identityKey: string): DeploymentRegistryEntryV1 | null {
    const registry = this.store.readRegistry();
    if (!registry) return null;
    return registry.entries.find((entry) => entry.identityKey === normalizedIdentityKey(identityKey)) ?? null;
  }

  async bind(input: {
    configuration: OAuthDeploymentConfiguration;
    state: DeploymentStateV1;
  }): Promise<DeploymentRegistryV1> {
    const current = this.store.readRegistry();
    const identityKey = normalizedIdentityKey(input.configuration.identityKey);
    const existing = current?.entries.find((entry) => entry.identityKey === identityKey);
    if (existing) {
      const compatible =
        samePath(existing.canonicalRoot, input.configuration.canonicalRoot, this.platform) &&
        existing.profileId === input.configuration.profileId &&
        existing.hostname === input.configuration.hostname &&
        existing.issuer === input.configuration.issuer &&
        existing.resource === input.configuration.resource &&
        existing.bindingId === input.state.bindingId;
      if (!compatible) {
        throw authConfigurationError(
          "OAUTH_STATE_CONFLICT",
          "OAuth issuer/resource/hostname is already bound to a different canonical deployment."
        );
      }
      if (existing.currentIncarnationId === input.state.incarnationId) return current!;
      return this.setCurrentIncarnation(existing.bindingId, input.state.incarnationId);
    }
    for (const entry of current?.entries ?? []) {
      if (
        entry.hostname === input.configuration.hostname ||
        entry.issuer === input.configuration.issuer ||
        entry.resource === input.configuration.resource
      ) {
        throw authConfigurationError(
          "OAUTH_STATE_CONFLICT",
          "OAuth hostname, issuer, or resource is already owned by another deployment."
        );
      }
    }
    const entry: DeploymentRegistryEntryV1 = {
      identityKey,
      canonicalRoot: input.configuration.canonicalRoot,
      profileId: input.configuration.profileId,
      hostname: input.configuration.hostname,
      issuer: input.configuration.issuer,
      resource: input.configuration.resource,
      bindingId: input.state.bindingId,
      currentIncarnationId: input.state.incarnationId,
      tunnelOwnerMarker: {
        tunnel: "cloudflare-named",
        tunnelName: input.configuration.tunnelName,
        tunnelOwner: "codexgpt",
        bindingId: input.state.bindingId
      }
    };
    return this.store.writeRegistry({
      schemaVersion: 1,
      generation: (current?.generation ?? 0) + 1,
      entries: [...(current?.entries ?? []), entry].sort((left, right) => left.identityKey.localeCompare(right.identityKey)),
      updatedAt: new Date().toISOString()
    }, {
      bindingId: input.state.bindingId,
      incarnationId: input.state.incarnationId
    });
  }

  async rebind(input: {
    identityKey: string;
    configuration: OAuthDeploymentConfiguration;
    state: DeploymentStateV1;
  }): Promise<DeploymentRegistryV1> {
    const current = this.store.readRegistry();
    if (!current) throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth deployment registry does not exist.");
    const identityKey = normalizedIdentityKey(input.identityKey);
    let matched = false;
    const entries = current.entries.map((entry) => {
      if (entry.identityKey !== identityKey) return entry;
      matched = true;
      if (entry.bindingId !== input.state.bindingId) {
        throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth rebind cannot change the stable binding.");
      }
      return {
        ...entry,
        canonicalRoot: input.configuration.canonicalRoot,
        profileId: input.configuration.profileId,
        hostname: input.configuration.hostname,
        issuer: input.configuration.issuer,
        resource: input.configuration.resource,
        currentIncarnationId: input.state.incarnationId,
        tunnelOwnerMarker: {
          tunnel: "cloudflare-named" as const,
          tunnelName: input.configuration.tunnelName,
          tunnelOwner: "codexgpt" as const,
          bindingId: input.state.bindingId
        }
      };
    });
    if (!matched) throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth deployment binding is not registered.");
    return this.store.writeRegistry({
      schemaVersion: 1,
      generation: current.generation + 1,
      entries,
      updatedAt: new Date().toISOString()
    }, { bindingId: input.state.bindingId, incarnationId: input.state.incarnationId });
  }

  async setCurrentIncarnation(bindingId: string, incarnationId: string): Promise<DeploymentRegistryV1> {
    const current = this.store.readRegistry();
    if (!current) {
      throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth deployment registry does not exist.");
    }
    let matched = false;
    const entries = current.entries.map((entry) => {
      if (entry.bindingId !== bindingId) return entry;
      matched = true;
      return { ...entry, currentIncarnationId: incarnationId };
    });
    if (!matched) {
      throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth deployment binding is not registered.");
    }
    return this.store.writeRegistry({
      schemaVersion: 1,
      generation: current.generation + 1,
      entries,
      updatedAt: new Date().toISOString()
    }, { bindingId, incarnationId });
  }

  readCurrentState(identityKey: string): DeploymentStateV1 {
    const entry = this.resolve(identityKey);
    if (!entry) {
      throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth deployment is not registered.");
    }
    const state = this.store.readDeployment(entry.bindingId, entry.currentIncarnationId);
    if (state.bindingId !== entry.bindingId || state.incarnationId !== entry.currentIncarnationId) {
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth registry and deployment state disagree.");
    }
    return state;
  }
}
