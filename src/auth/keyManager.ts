import { randomBytes as nodeRandomBytes } from "node:crypto";
import {
  exportJWK,
  generateKeyPair,
  importJWK,
  type JWK
} from "jose";
import { authConfigurationError } from "./errors.js";
import type { CredentialStore } from "./credentialStore.js";
import type {
  AuthStateStore,
  DeploymentStateV1,
  InstallationOwnerRecordV1
} from "./stateStore.js";

export interface DeploymentKeyBundle {
  protectedSigningPrivateJwk: string;
  activePublicJwk: DeploymentStateV1["activePublicJwk"];
  protectedRefreshPepper: string;
}

export interface DeploymentStateInput {
  canonicalRoot: string;
  profileId: string;
  hostname: string;
  issuer: string;
  resource: string;
  bindingId?: string;
  incarnationId?: string;
  recoveryEpoch?: string;
  owner: InstallationOwnerRecordV1;
  now?: number;
}

export interface AuthKeyManagerDependencies {
  randomBytes?: (size: number) => Buffer;
  now?: () => number;
}

function keyPurpose(bindingId: string, incarnationId: string): `codexgpt-deployment-v1:${string}:${string}:signing-key` {
  return `codexgpt-deployment-v1:${bindingId}:${incarnationId}:signing-key`;
}

function pepperPurpose(bindingId: string, incarnationId: string): `codexgpt-deployment-v1:${string}:${string}:refresh-pepper` {
  return `codexgpt-deployment-v1:${bindingId}:${incarnationId}:refresh-pepper`;
}

function validatePrivateJwk(value: JWK): asserts value is JWK & { kty: "EC"; crv: "P-256"; d: string; x: string; y: string } {
  if (
    value.kty !== "EC" || value.crv !== "P-256" ||
    typeof value.d !== "string" || typeof value.x !== "string" || typeof value.y !== "string"
  ) {
    throw authConfigurationError("OAUTH_STATE_INVALID", "Generated OAuth signing key is invalid.");
  }
}

export class AuthKeyManager {
  readonly #credentialStore: CredentialStore;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #now: () => number;

  constructor(credentialStore: CredentialStore, dependencies: AuthKeyManagerDependencies = {}) {
    this.#credentialStore = credentialStore;
    this.#randomBytes = dependencies.randomBytes ?? nodeRandomBytes;
    this.#now = dependencies.now ?? Date.now;
  }

  newId(prefix: "binding" | "incarnation" | "epoch" | "kid" | "auditref"): string {
    const value = this.#randomBytes(16);
    if (!Buffer.isBuffer(value) || value.length !== 16) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth key random source is invalid.");
    }
    return `${prefix}_${value.toString("hex")}`;
  }

  async createKeyBundle(bindingId: string, incarnationId: string): Promise<DeploymentKeyBundle> {
    const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
    const [publicJwkRaw, privateJwk] = await Promise.all([exportJWK(publicKey), exportJWK(privateKey)]);
    validatePrivateJwk(privateJwk);
    if (
      publicJwkRaw.kty !== "EC" || publicJwkRaw.crv !== "P-256" ||
      typeof publicJwkRaw.x !== "string" || typeof publicJwkRaw.y !== "string"
    ) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "Generated OAuth public key is invalid.");
    }
    const kid = this.newId("kid");
    const privatePayload = Buffer.from(JSON.stringify({ ...privateJwk, kid, alg: "ES256", use: "sig" }), "utf8");
    const pepper = this.#randomBytes(32);
    if (!Buffer.isBuffer(pepper) || pepper.length !== 32) {
      privatePayload.fill(0);
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth refresh pepper random source is invalid.");
    }
    try {
      const [protectedSigningPrivateJwk, protectedRefreshPepper] = await Promise.all([
        this.#credentialStore.protect(privatePayload, keyPurpose(bindingId, incarnationId)),
        this.#credentialStore.protect(pepper, pepperPurpose(bindingId, incarnationId))
      ]);
      return {
        protectedSigningPrivateJwk,
        activePublicJwk: {
          kty: "EC",
          crv: "P-256",
          x: publicJwkRaw.x,
          y: publicJwkRaw.y,
          kid,
          alg: "ES256",
          use: "sig"
        },
        protectedRefreshPepper
      };
    } finally {
      privatePayload.fill(0);
      pepper.fill(0);
    }
  }

  async createInitialDeployment(input: DeploymentStateInput): Promise<Omit<DeploymentStateV1, "integrity">> {
    const bindingId = input.bindingId ?? this.newId("binding");
    const incarnationId = input.incarnationId ?? this.newId("incarnation");
    const recoveryEpoch = input.recoveryEpoch ?? this.newId("epoch");
    const bundle = await this.createKeyBundle(bindingId, incarnationId);
    const timestamp = new Date(input.now ?? this.#now()).toISOString();
    return {
      schemaVersion: 1,
      generation: 1,
      bindingId,
      incarnationId,
      recoveryEpoch,
      canonicalRoot: input.canonicalRoot,
      profileId: input.profileId,
      hostname: input.hostname,
      issuer: input.issuer,
      resource: input.resource,
      ownerRef: input.owner.ownerRef,
      credentialProvider: this.#credentialStore.provider,
      ...bundle,
      previousPublicJwks: [],
      grants: [],
      recoveryRequired: false,
      auditCursorRef: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  async loadRefreshPepper(state: DeploymentStateV1): Promise<Buffer> {
    const plaintext = await this.#credentialStore.unprotect(
      state.protectedRefreshPepper,
      pepperPurpose(state.bindingId, state.incarnationId)
    );
    const pepper = Buffer.from(plaintext);
    plaintext.fill(0);
    if (pepper.length !== 32) {
      pepper.fill(0);
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth refresh pepper payload is invalid.");
    }
    return pepper;
  }

  async loadPrivateKey(state: DeploymentStateV1): Promise<CryptoKey> {
    const plaintext = await this.#credentialStore.unprotect(
      state.protectedSigningPrivateJwk,
      keyPurpose(state.bindingId, state.incarnationId)
    );
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(plaintext).toString("utf8"));
      } catch {
        throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth signing key payload is malformed.");
      }
      const jwk = parsed as JWK;
      validatePrivateJwk(jwk);
      if (
        jwk.kid !== state.activePublicJwk.kid ||
        jwk.x !== state.activePublicJwk.x ||
        jwk.y !== state.activePublicJwk.y ||
        jwk.alg !== "ES256" ||
        jwk.use !== "sig"
      ) {
        throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth signing key identity does not match state.");
      }
      return await importJWK(jwk, "ES256") as CryptoKey;
    } finally {
      plaintext.fill(0);
    }
  }

  async rotateSigningKey(store: AuthStateStore, state: DeploymentStateV1): Promise<DeploymentStateV1> {
    const bundle = await this.createKeyBundle(state.bindingId, state.incarnationId);
    const next: Omit<DeploymentStateV1, "integrity"> = {
      ...state,
      generation: state.generation + 1,
      protectedSigningPrivateJwk: bundle.protectedSigningPrivateJwk,
      activePublicJwk: bundle.activePublicJwk,
      previousPublicJwks: [state.activePublicJwk],
      updatedAt: new Date(this.#now()).toISOString()
    };
    delete (next as Partial<DeploymentStateV1>).integrity;
    return store.writeDeployment(next, "signing_key_rotated");
  }
}
