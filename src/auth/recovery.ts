import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";
import { authConfigurationError } from "./errors.js";
import type { OAuthDeploymentConfiguration } from "./types.js";
import { AuthKeyManager } from "./keyManager.js";
import { DeploymentRegistry } from "./deploymentRegistry.js";
import { AuthStateLock, type AuthStateLockHandle } from "./deploymentLock.js";
import {
  AuthStateStore,
  DeploymentStateV1Schema,
  authStateIntegrity,
  deploymentStateFile,
  type DeploymentStateV1
} from "./stateStore.js";

export interface AuthRecoveryHooks {
  afterIncarnationWrite?(state: DeploymentStateV1): void | Promise<void>;
  afterRegistryPublish?(state: DeploymentStateV1): void | Promise<void>;
}

export interface InitializedAuthDeployment {
  ownerSubject: string;
  state: DeploymentStateV1;
  created: boolean;
}

function release(handle: AuthStateLockHandle | null): void {
  if (handle) handle.release();
}

function deploymentLockName(bindingId: string): `deployment_binding_${string}` {
  if (!/^binding_[a-f0-9]{32}$/.test(bindingId)) {
    throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth deployment binding identifier is invalid.");
  }
  return `deployment_${bindingId}` as `deployment_binding_${string}`;
}

export class AuthDeploymentCoordinator {
  constructor(
    readonly store: AuthStateStore,
    readonly keyManager: AuthKeyManager,
    readonly registry: DeploymentRegistry,
    readonly locks: AuthStateLock
  ) {}

  async initialize(configuration: OAuthDeploymentConfiguration): Promise<InitializedAuthDeployment> {
    let installationLock: AuthStateLockHandle | null = null;
    let registryLock: AuthStateLockHandle | null = null;
    let deploymentLock: AuthStateLockHandle | null = null;
    try {
      installationLock = this.locks.acquire("installation");
      const owner = await this.store.initializeOwner();
      release(installationLock);
      installationLock = null;

      registryLock = this.locks.acquire("registry");
      const existing = this.registry.resolve(configuration.identityKey);
      if (existing) {
        this.registry.assertCompatible(configuration, existing);
        deploymentLock = this.locks.acquire(deploymentLockName(existing.bindingId));
        const state = this.registry.readCurrentState(configuration.identityKey);
        return { ownerSubject: owner.subject, state, created: false };
      }

      const bindingId = this.keyManager.newId("binding");
      deploymentLock = this.locks.acquire(deploymentLockName(bindingId));
      const initial = await this.keyManager.createInitialDeployment({
        canonicalRoot: configuration.canonicalRoot,
        profileId: configuration.profileId,
        hostname: configuration.hostname,
        issuer: configuration.issuer,
        resource: configuration.resource,
        bindingId,
        owner: owner.record
      });
      const state = await this.store.writeDeployment(initial);
      await this.registry.bind({ configuration, state });
      return { ownerSubject: owner.subject, state, created: true };
    } finally {
      release(deploymentLock);
      release(registryLock);
      release(installationLock);
    }
  }

  async createBackup(identityKey: string): Promise<string> {
    const entry = this.registry.resolve(identityKey);
    if (!entry) throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth deployment is not registered.");
    const lock = this.locks.acquire(deploymentLockName(entry.bindingId));
    try {
      const state = this.registry.readCurrentState(identityKey);
      return await this.store.createDeploymentBackup(state.bindingId, state.incarnationId);
    } finally {
      lock.release();
    }
  }

  async rotateSigningKey(
    identityKey: string,
    options: { createBackup?: boolean } = {}
  ): Promise<DeploymentStateV1> {
    const entry = this.registry.resolve(identityKey);
    if (!entry) throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth deployment is not registered.");
    const lock = this.locks.acquire(deploymentLockName(entry.bindingId));
    try {
      const state = this.registry.readCurrentState(identityKey);
      if (options.createBackup !== false) {
        await this.store.createDeploymentBackup(state.bindingId, state.incarnationId);
      }
      return await this.keyManager.rotateSigningKey(this.store, state);
    } finally {
      lock.release();
    }
  }

  async rebindAsSecurityReset(
    identityKey: string,
    configuration: OAuthDeploymentConfiguration,
    hooks: AuthRecoveryHooks = {}
  ): Promise<DeploymentStateV1> {
    let registryLock: AuthStateLockHandle | null = null;
    let deploymentLock: AuthStateLockHandle | null = null;
    try {
      registryLock = this.locks.acquire("registry");
      const entry = this.registry.resolve(identityKey);
      if (!entry) throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth deployment is not registered.");
      if (configuration.identityKey !== identityKey) {
        throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth rebind cannot change hostname, issuer, or resource.");
      }
      deploymentLock = this.locks.acquire(deploymentLockName(entry.bindingId));
      const current = this.registry.readCurrentState(identityKey);
      const owner = this.store.readOwner();
      if (owner.ownerRef !== current.ownerRef) {
        throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth installation owner and deployment disagree.");
      }
      await this.store.createDeploymentBackup(current.bindingId, current.incarnationId);
      const reset = await this.keyManager.createInitialDeployment({
        canonicalRoot: configuration.canonicalRoot,
        profileId: configuration.profileId,
        hostname: configuration.hostname,
        issuer: configuration.issuer,
        resource: configuration.resource,
        bindingId: current.bindingId,
        incarnationId: this.keyManager.newId("incarnation"),
        recoveryEpoch: this.keyManager.newId("epoch"),
        owner
      });
      const candidate = await this.store.writeDeployment({
        ...reset,
        generation: current.generation + 1,
        grants: [],
        clients: [],
        previousPublicJwks: [],
        auditCursorRef: null
      }, "deployment_recovered");
      await hooks.afterIncarnationWrite?.(candidate);
      await this.registry.rebind({ identityKey, configuration, state: candidate });
      await hooks.afterRegistryPublish?.(candidate);
      return candidate;
    } finally {
      release(deploymentLock);
      release(registryLock);
    }
  }

  async restoreAsSecurityReset(
    identityKey: string,
    backup: DeploymentStateV1,
    hooks: AuthRecoveryHooks = {}
  ): Promise<DeploymentStateV1> {
    let registryLock: AuthStateLockHandle | null = null;
    let deploymentLock: AuthStateLockHandle | null = null;
    try {
      registryLock = this.locks.acquire("registry");
      const entry = this.registry.resolve(identityKey);
      if (!entry) throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth deployment is not registered.");
      deploymentLock = this.locks.acquire(deploymentLockName(entry.bindingId));
      const current = this.registry.readCurrentState(identityKey);
      const verifiedBackup = DeploymentStateV1Schema.safeParse(backup);
      if (!verifiedBackup.success || verifiedBackup.data.integrity !== authStateIntegrity(verifiedBackup.data)) {
        throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth recovery backup integrity verification failed.");
      }
      backup = verifiedBackup.data;
      if (backup.bindingId !== current.bindingId || backup.ownerRef !== current.ownerRef) {
        throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth recovery backup belongs to another binding.");
      }
      if (
        backup.canonicalRoot !== current.canonicalRoot || backup.profileId !== current.profileId ||
        backup.hostname !== current.hostname || backup.issuer !== current.issuer || backup.resource !== current.resource
      ) {
        throw authConfigurationError("OAUTH_STATE_CONFLICT", "OAuth recovery backup changes deployment identity.");
      }
      const owner = this.store.readOwner();
      if (owner.ownerRef !== current.ownerRef) {
        throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth installation owner and deployment disagree.");
      }
      await this.store.createDeploymentBackup(current.bindingId, current.incarnationId);
      const reset = await this.keyManager.createInitialDeployment({
        canonicalRoot: current.canonicalRoot,
        profileId: current.profileId,
        hostname: current.hostname,
        issuer: current.issuer,
        resource: current.resource,
        bindingId: current.bindingId,
        incarnationId: this.keyManager.newId("incarnation"),
        recoveryEpoch: this.keyManager.newId("epoch"),
        owner
      });
      const candidate = await this.store.writeDeployment(
        {
          ...reset,
          generation: current.generation + 1,
          grants: [],
          previousPublicJwks: [],
          auditCursorRef: null
        },
        "deployment_recovered"
      );
      await hooks.afterIncarnationWrite?.(candidate);
      await this.registry.setCurrentIncarnation(current.bindingId, candidate.incarnationId);
      await hooks.afterRegistryPublish?.(candidate);
      return candidate;
    } finally {
      release(deploymentLock);
      release(registryLock);
    }
  }
}

const KnownDeploymentStateV0Schema = z.object({
  schemaVersion: z.literal(0),
  generation: z.number().int().positive(),
  bindingId: z.string().regex(/^binding_[a-f0-9]{32}$/),
  incarnationId: z.string().regex(/^incarnation_[a-f0-9]{32}$/),
  recoveryEpoch: z.string().regex(/^epoch_[a-f0-9]{32}$/),
  canonicalRoot: z.string().min(1).max(32768),
  profileId: z.string().regex(/^[a-f0-9]{24}$/),
  hostname: z.string().min(1).max(253),
  issuer: z.string().url(),
  resource: z.string().url(),
  ownerRef: z.string().regex(/^ownerref_[a-f0-9]{32}$/),
  credentialProvider: z.literal("windows-dpapi-current-user"),
  protectedSigningPrivateJwk: z.string().min(4).max(131072),
  activePublicJwk: z.unknown(),
  protectedRefreshPepper: z.string().min(4).max(131072),
  grants: z.array(z.unknown()).max(4096),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  integrity: z.string().regex(/^sha256:[a-f0-9]{64}$/)
}).strict();

type KnownDeploymentStateV0 = z.infer<typeof KnownDeploymentStateV0Schema>;

export async function migrateKnownDeploymentStateV0(input: {
  store: AuthStateStore;
  bindingId: string;
  incarnationId: string;
}): Promise<DeploymentStateV1> {
  const file = deploymentStateFile(input.store.paths().root, input.bindingId, input.incarnationId);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth state cannot be read for migration.");
  }
  if ((raw as { schemaVersion?: unknown }).schemaVersion !== 0) {
    throw authConfigurationError(
      "OAUTH_STATE_MIGRATION_REQUIRED",
      "OAuth state schema is not a known migratable version."
    );
  }
  const old = KnownDeploymentStateV0Schema.parse(raw);
  if (old.integrity !== authStateIntegrity(old)) {
    throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth migration source integrity failed.");
  }
  const backupDirectory = path.join(path.dirname(file), "backups");
  const backupFile = path.join(backupDirectory, `state-v0-generation-${old.generation}.json`);
  const backupStore = new AtomicJsonFileStore(input.store.paths().root, KnownDeploymentStateV0Schema);
  backupStore.write(backupFile, old);
  const migrated = DeploymentStateV1Schema.parse({
    ...old,
    schemaVersion: 1,
    generation: old.generation + 1,
    previousPublicJwks: [],
    recoveryRequired: false,
    auditCursorRef: null,
    updatedAt: new Date().toISOString(),
    integrity: "sha256:" + "0".repeat(64)
  });
  const { integrity: _discarded, ...withoutIntegrity } = migrated;
  return input.store.writeDeployment(withoutIntegrity, "state_migrated");
}

export function createKnownDeploymentStateV0ForTest(state: DeploymentStateV1): KnownDeploymentStateV0 {
  const value = {
    schemaVersion: 0 as const,
    generation: state.generation,
    bindingId: state.bindingId,
    incarnationId: state.incarnationId,
    recoveryEpoch: state.recoveryEpoch,
    canonicalRoot: state.canonicalRoot,
    profileId: state.profileId,
    hostname: state.hostname,
    issuer: state.issuer,
    resource: state.resource,
    ownerRef: state.ownerRef,
    credentialProvider: state.credentialProvider,
    protectedSigningPrivateJwk: state.protectedSigningPrivateJwk,
    activePublicJwk: state.activePublicJwk,
    protectedRefreshPepper: state.protectedRefreshPepper,
    grants: state.grants,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    integrity: "sha256:" + "0".repeat(64)
  };
  return KnownDeploymentStateV0Schema.parse({ ...value, integrity: authStateIntegrity(value) });
}
