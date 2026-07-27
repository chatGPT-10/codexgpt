import {
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual
} from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  SignJWT,
  createLocalJWKSet,
  jwtVerify,
  type JWTPayload
} from "jose";
import { clientRefForId } from "./clientStore.js";
import { OAuthProtocolError, authConfigurationError } from "./errors.js";
import { OAuthGrantStore } from "./grantStore.js";
import type { AuthKeyManager } from "./keyManager.js";
import type {
  AuthStateStore,
  DeploymentStateV1,
  OAuthGrantRecordV1
} from "./stateStore.js";
import {
  KNOWN_OAUTH_SCOPES,
  type OAuthDeploymentIdentity,
  type OAuthScope
} from "./types.js";

export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
export const OAUTH_ACCESS_TOKEN_CLOCK_SKEW_SECONDS = 60;
export const OAUTH_BEARER_MAX_BYTES = 8 * 1024;
export const OAUTH_REFRESH_TOKEN_MAX_BYTES = 512;
export const OAUTH_REFRESH_ENVELOPE_BYTES = 89;
export const OAUTH_ES256_ACTIVE_LIMIT = 8;
export const OAUTH_ES256_QUEUE_LIMIT = 32;
export const OAUTH_ES256_RESERVED_ACTIVE = 2;
export const OAUTH_ES256_RESERVED_QUEUE = 8;
export const OAUTH_FAILED_BEARER_RATE_PER_MINUTE = 120;
export const OAUTH_FAILED_BEARER_BURST = 30;

const REFRESH_VERSION = 1;
const REFRESH_PAYLOAD_BYTES = 1 + 16 + 8 + 32;
const TOKEN_ID_PATTERN = /^token_[A-Za-z0-9_-]{43}$/;
const GRANT_ID_PATTERN = /^grant_[a-f0-9]{32}$/;
const CLIENT_ID_PATTERN = /^client_[A-Za-z0-9_-]{43}$/;
const KID_PATTERN = /^kid_[a-f0-9]{32}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const ACCESS_PAYLOAD_KEYS = Object.freeze([
  "aud", "client_id", "exp", "grant_id", "grant_rev", "iat",
  "iss", "jti", "nbf", "scope", "sub"
]);

export interface OAuthTokenServiceOptions {
  identity: OAuthDeploymentIdentity;
  ownerSubject: string;
  ownerRef: string;
  state: DeploymentStateV1;
  store: AuthStateStore;
  keyManager: AuthKeyManager;
  grants: OAuthGrantStore;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

export interface VerifiedAccessToken {
  authInfo: AuthInfo;
  ownerSubject: string;
  ownerRef: string;
  clientId: string;
  clientRef: string;
  resource: string;
  bindingId: string;
  incarnationId: string;
  grantId: string;
  grantRevision: number;
  scopes: readonly OAuthScope[];
  tokenId: string;
  expiresAt: number;
  fingerprint: string;
}

export interface AuthorizationCodeTokenInput {
  authorizationCode: string;
  clientId: string;
  resource: string;
  scopes: readonly OAuthScope[];
}

export interface RefreshTokenInput {
  clientId: string;
  refreshToken: string;
  resource: string;
  scopes?: readonly OAuthScope[];
}

interface RefreshEnvelope {
  familyHandle: string;
  generation: bigint;
  tokenHash: string;
}

interface AccessGrantAuthority {
  clientId: string;
  scopes: readonly OAuthScope[];
  grantId: string;
  grantRevision: number;
}

interface CachedToken {
  verified: Omit<VerifiedAccessToken, "authInfo">;
  expiresAtMs: number;
}

interface CryptoQueueEntry<T> {
  reserved: boolean;
  action: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export class OAuthBearerCapacityError extends Error {
  readonly retryAfterSeconds = 1;

  constructor() {
    super("OAuth bearer verification capacity is temporarily full.");
    this.name = "OAuthBearerCapacityError";
  }
}

export class OAuthEs256Admission {
  #active = 0;
  #ordinaryActive = 0;
  #ordinaryQueued = 0;
  readonly #queue: CryptoQueueEntry<unknown>[] = [];

  run<T>(reserved: boolean, action: () => Promise<T>): Promise<T> {
    if (this.#canStart(reserved)) return this.#start(reserved, action);
    if (
      this.#queue.length >= OAUTH_ES256_QUEUE_LIMIT ||
      (!reserved && this.#ordinaryQueued >= OAUTH_ES256_QUEUE_LIMIT - OAUTH_ES256_RESERVED_QUEUE)
    ) {
      throw new OAuthBearerCapacityError();
    }
    if (!reserved) this.#ordinaryQueued += 1;
    return new Promise<T>((resolve, reject) => {
      this.#queue.push({
        reserved,
        action,
        resolve: resolve as (value: unknown) => void,
        reject
      });
    });
  }

  #canStart(reserved: boolean): boolean {
    if (this.#active >= OAUTH_ES256_ACTIVE_LIMIT) return false;
    return reserved || this.#ordinaryActive < OAUTH_ES256_ACTIVE_LIMIT - OAUTH_ES256_RESERVED_ACTIVE;
  }

  #start<T>(reserved: boolean, action: () => Promise<T>): Promise<T> {
    this.#active += 1;
    if (!reserved) this.#ordinaryActive += 1;
    return action().finally(() => {
      this.#active -= 1;
      if (!reserved) this.#ordinaryActive -= 1;
      this.#drain();
    });
  }

  #drain(): void {
    let progress = true;
    while (progress && this.#queue.length > 0) {
      progress = false;
      const index = this.#queue.findIndex((entry) => this.#canStart(entry.reserved));
      if (index < 0) return;
      const [entry] = this.#queue.splice(index, 1);
      if (!entry.reserved) this.#ordinaryQueued -= 1;
      progress = true;
      void this.#start(entry.reserved, entry.action).then(entry.resolve, entry.reject);
    }
  }
}

class FailedBearerBudget {
  #tokens = OAUTH_FAILED_BEARER_BURST;
  #updatedAt: number;

  constructor(readonly now: () => number) {
    this.#updatedAt = now();
  }

  reserve(): boolean {
    this.#refill();
    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }

  refund(): void {
    this.#refill();
    this.#tokens = Math.min(OAUTH_FAILED_BEARER_BURST, this.#tokens + 1);
  }

  #refill(): void {
    const current = this.now();
    const elapsed = Math.max(0, current - this.#updatedAt);
    this.#updatedAt = current;
    this.#tokens = Math.min(
      OAUTH_FAILED_BEARER_BURST,
      this.#tokens + elapsed * (OAUTH_FAILED_BEARER_RATE_PER_MINUTE / 60_000)
    );
  }
}

function deriveKey(root: Buffer, purpose: string): Buffer {
  return createHmac("sha256", root).update(purpose, "utf8").digest();
}

function fixedEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function oauthInvalidGrant(): OAuthProtocolError {
  return new OAuthProtocolError("invalid_grant", "The OAuth grant is invalid.");
}

function accessInvalid(): OAuthProtocolError {
  return new OAuthProtocolError("invalid_grant", "The access token is invalid.", 401);
}

function parseScopes(scope: unknown): readonly OAuthScope[] {
  if (typeof scope !== "string" || scope.length < 1 || scope.length > 256 || /\s{2,}|[^\x20-\x7e]/.test(scope)) {
    throw accessInvalid();
  }
  const values = scope.split(" ");
  if (new Set(values).size !== values.length || values.some((value) => !KNOWN_OAUTH_SCOPES.includes(value as OAuthScope))) {
    throw accessInvalid();
  }
  const normalized = KNOWN_OAUTH_SCOPES.filter((value) => values.includes(value));
  if (normalized.length !== values.length || normalized.some((value, index) => value !== values[index])) {
    throw accessInvalid();
  }
  return Object.freeze([...normalized]);
}

function numericClaim(payload: JWTPayload, name: "iat" | "nbf" | "exp" | "grant_rev"): number {
  const value = payload[name];
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw accessInvalid();
  return value as number;
}

function stringClaim(payload: JWTPayload, name: "sub" | "client_id" | "jti" | "grant_id"): string {
  const value = payload[name];
  if (typeof value !== "string") throw accessInvalid();
  return value;
}

export class OAuthTokenService {
  readonly #identity: OAuthDeploymentIdentity;
  readonly #ownerSubject: string;
  readonly #ownerRef: string;
  readonly #store: AuthStateStore;
  readonly #grants: OAuthGrantStore;
  readonly #privateKey: CryptoKey;
  readonly #activeKid: string;
  readonly #refreshEnvelopeKey: Buffer;
  readonly #refreshStoreKey: Buffer;
  readonly #authorizationCodeKey: Buffer;
  readonly #bearerCacheKey: Buffer;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #admission = new OAuthEs256Admission();
  readonly #failedBudget: FailedBearerBudget;
  readonly #positiveCache = new Map<string, CachedToken>();
  readonly #negativeCache = new Map<string, number>();
  readonly #validatedFingerprints = new Map<string, number>();

  private constructor(input: OAuthTokenServiceOptions & { privateKey: CryptoKey; refreshPepper: Buffer }) {
    this.#identity = Object.freeze({ ...input.identity });
    this.#ownerSubject = input.ownerSubject;
    this.#ownerRef = input.ownerRef;
    this.#store = input.store;
    this.#grants = input.grants;
    this.#privateKey = input.privateKey;
    this.#activeKid = input.state.activePublicJwk.kid;
    this.#refreshEnvelopeKey = deriveKey(input.refreshPepper, "refresh-envelope-v1");
    this.#refreshStoreKey = deriveKey(input.refreshPepper, "refresh-store-v1");
    this.#authorizationCodeKey = deriveKey(input.refreshPepper, "authorization-code-store-v1");
    this.#bearerCacheKey = this.#random(32, input.randomBytes ?? nodeRandomBytes);
    input.refreshPepper.fill(0);
    this.#now = input.now ?? Date.now;
    this.#randomBytes = input.randomBytes ?? nodeRandomBytes;
    this.#failedBudget = new FailedBearerBudget(this.#now);
  }

  static async create(options: OAuthTokenServiceOptions): Promise<OAuthTokenService> {
    if (
      options.state.bindingId !== options.identity.bindingId ||
      options.state.incarnationId !== options.identity.incarnationId ||
      options.state.ownerRef !== options.ownerRef ||
      options.state.issuer !== options.identity.issuer ||
      options.state.resource !== options.identity.resource
    ) {
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth token service identity does not match durable state.");
    }
    const [privateKey, refreshPepper] = await Promise.all([
      options.keyManager.loadPrivateKey(options.state),
      options.keyManager.loadRefreshPepper(options.state)
    ]);
    return new OAuthTokenService({ ...options, privateKey, refreshPepper });
  }

  async exchangeAuthorizationCode(input: AuthorizationCodeTokenInput): Promise<OAuthTokens> {
    if (input.resource !== this.#identity.resource) throw new OAuthProtocolError("invalid_target", "The OAuth resource is invalid.");
    const familyHandle = `family_${this.#randomBytesExact(16).toString("hex")}`;
    const grantId = `grant_${this.#randomBytesExact(16).toString("hex")}`;
    const refreshToken = this.#createRefreshToken(familyHandle, 0n);
    const accessToken = await this.#signAccessToken({
      grantId,
      clientId: input.clientId,
      scopes: input.scopes,
      grantRevision: 0
    });
    const grant = await this.#grants.create({
      grantId,
      clientId: input.clientId,
      clientRef: clientRefForId(input.clientId),
      scopes: input.scopes,
      familyHandle,
      refreshTokenHash: this.#refreshHash(refreshToken),
      authorizationCodeHash: this.authorizationCodeHash(input.authorizationCode)
    });
    return await this.#tokensForGrant(grant, refreshToken, accessToken);
  }

  async exchangeRefreshToken(input: RefreshTokenInput): Promise<OAuthTokens> {
    if (input.resource !== this.#identity.resource) throw new OAuthProtocolError("invalid_target", "The OAuth resource is invalid.");
    const envelope = this.#parseRefreshToken(input.refreshToken);
    const current = this.#grants.getByFamily(envelope.familyHandle);
    if (!current || current.clientId !== input.clientId || current.resource !== input.resource) throw oauthInvalidGrant();
    const scopes = input.scopes ?? current.scopes;
    const nextToken = this.#createRefreshToken(envelope.familyHandle, envelope.generation + 1n);
    const mutation = await this.#grants.rotateRefresh({
      familyHandle: envelope.familyHandle,
      generation: envelope.generation,
      presentedTokenHash: envelope.tokenHash,
      nextTokenHash: this.#refreshHash(nextToken),
      clientId: input.clientId,
      clientRef: clientRefForId(input.clientId),
      resource: input.resource,
      scopes
    });
    if (mutation.kind !== "rotated") throw oauthInvalidGrant();
    return await this.#tokensForGrant(mutation.grant, nextToken);
  }

  async verifyAccessToken(
    token: string,
    options: { isEstablishedSession?: (fingerprint: string) => boolean } = {}
  ): Promise<VerifiedAccessToken> {
    const now = this.#now();
    let header: { kid: string };
    try {
      header = this.#cheapBearerHeader(token);
    } catch (error) {
      if (!this.#failedBudget.reserve()) throw new OAuthBearerCapacityError();
      if (error instanceof OAuthProtocolError) throw error;
      throw accessInvalid();
    }
    const fingerprint = this.#tokenFingerprint(token);
    this.#pruneCaches(now);
    const negativeUntil = this.#negativeCache.get(fingerprint);
    if (negativeUntil !== undefined && negativeUntil > now) throw accessInvalid();
    const cached = this.#positiveCache.get(fingerprint);
    try {
      let base: Omit<VerifiedAccessToken, "authInfo">;
      const state = this.#currentState();
      const keyRetained = header.kid === state.activePublicJwk.kid ||
        state.previousPublicJwks.some((key) => key.kid === header.kid);
      if (cached && cached.expiresAtMs > now && keyRetained) {
        base = cached.verified;
      } else {
        if (!this.#failedBudget.reserve()) throw new OAuthBearerCapacityError();
        const reserved = this.#validatedFingerprints.has(fingerprint) &&
          options.isEstablishedSession?.(fingerprint) === true;
        try {
          base = await this.#admission.run(
            reserved,
            () => this.#verifyCryptographic(token, fingerprint, header)
          );
          this.#failedBudget.refund();
        } catch (error) {
          if (error instanceof OAuthBearerCapacityError) this.#failedBudget.refund();
          throw error;
        }
      }
      const grant = await this.#grants.validateAccess({
        grantId: base.grantId,
        clientId: base.clientId,
        ownerRef: base.ownerRef,
        resource: base.resource,
        grantRevision: base.grantRevision,
        scopes: base.scopes
      });
      if (grant.familyHandle.length === 0) throw accessInvalid();
      const authInfo: AuthInfo = {
        token,
        clientId: base.clientId,
        scopes: [...base.scopes],
        expiresAt: base.expiresAt,
        resource: new URL(base.resource),
        extra: {
          ownerSubject: base.ownerSubject,
          ownerRef: base.ownerRef,
          bindingId: base.bindingId,
          incarnationId: base.incarnationId,
          grantId: base.grantId,
          grantRevision: base.grantRevision,
          tokenId: base.tokenId,
          tokenFingerprint: base.fingerprint
        }
      };
      return Object.freeze({ ...base, authInfo });
    } catch (error) {
      if (error instanceof OAuthBearerCapacityError) throw error;
      this.#rememberNegative(fingerprint, now);
      if (error instanceof OAuthProtocolError) throw error;
      throw accessInvalid();
    }
  }

  async revoke(input: { token: string; clientId: string }): Promise<void> {
    let familyHandle: string | undefined;
    try {
      familyHandle = this.#parseRefreshToken(input.token).familyHandle;
    } catch {
      try {
        const header = this.#cheapBearerHeader(input.token);
        const verified = await this.#verifyCryptographic(
          input.token,
          this.#tokenFingerprint(input.token),
          header
        );
        const grant = this.#grants.getByGrantId(verified.grantId);
        if (grant && verified.clientId === input.clientId) familyHandle = grant.familyHandle;
      } catch {
        return;
      }
    }
    if (!familyHandle) return;
    await this.#grants.revokeFamily({
      familyHandle,
      clientRef: clientRefForId(input.clientId),
      reason: "public"
    });
  }

  authorizationCodeHash(code: string): string {
    if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw oauthInvalidGrant();
    return `hmac-sha256:${createHmac("sha256", this.#authorizationCodeKey).update(code, "utf8").digest("hex")}`;
  }

  refreshTokenFamily(token: string): string {
    return this.#parseRefreshToken(token).familyHandle;
  }

  dispose(): void {
    this.#refreshEnvelopeKey.fill(0);
    this.#refreshStoreKey.fill(0);
    this.#authorizationCodeKey.fill(0);
    this.#bearerCacheKey.fill(0);
    this.#positiveCache.clear();
    this.#negativeCache.clear();
    this.#validatedFingerprints.clear();
  }

  async #tokensForGrant(
    grant: OAuthGrantRecordV1,
    refreshToken: string,
    preSignedAccessToken?: string
  ): Promise<OAuthTokens> {
    const accessToken = preSignedAccessToken ?? await this.#signAccessToken(grant);
    return Object.freeze({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: grant.scopes.join(" ")
    });
  }

  async #signAccessToken(grant: AccessGrantAuthority): Promise<string> {
    const current = this.#currentState();
    if (current.activePublicJwk.kid !== this.#activeKid) {
      throw authConfigurationError(
        "OAUTH_STATE_RECOVERY_REQUIRED",
        "OAuth signing authority changed during the current token-service lifecycle."
      );
    }
    const issuedAt = Math.floor(this.#now() / 1000);
    const tokenId = `token_${this.#randomBytesExact(32).toString("base64url")}`;
    return await new SignJWT({
      client_id: grant.clientId,
      scope: grant.scopes.join(" "),
      grant_id: grant.grantId,
      grant_rev: grant.grantRevision
    })
      .setProtectedHeader({ alg: "ES256", typ: "at+jwt", kid: this.#activeKid })
      .setIssuer(this.#identity.issuer)
      .setAudience(this.#identity.resource)
      .setSubject(this.#ownerSubject)
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(issuedAt + OAUTH_ACCESS_TOKEN_TTL_SECONDS)
      .setJti(tokenId)
      .sign(this.#privateKey);
  }

  async #verifyCryptographic(
    token: string,
    fingerprint: string,
    header: { kid: string } = this.#cheapBearerHeader(token)
  ): Promise<Omit<VerifiedAccessToken, "authInfo">> {
    const state = this.#currentState();
    if (header.kid !== state.activePublicJwk.kid && !state.previousPublicJwks.some((key) => key.kid === header.kid)) {
      throw accessInvalid();
    }
    const jwks = createLocalJWKSet({ keys: [state.activePublicJwk, ...state.previousPublicJwks] });
    let verified;
    try {
      verified = await jwtVerify(token, jwks, {
        algorithms: ["ES256"],
        issuer: this.#identity.issuer,
        audience: this.#identity.resource,
        clockTolerance: OAUTH_ACCESS_TOKEN_CLOCK_SKEW_SECONDS,
        currentDate: new Date(this.#now())
      });
    } catch {
      throw accessInvalid();
    }
    if (verified.protectedHeader.alg !== "ES256" || verified.protectedHeader.typ !== "at+jwt" || verified.protectedHeader.kid !== header.kid) {
      throw accessInvalid();
    }
    const payload = verified.payload;
    const payloadKeys = Object.keys(payload).sort();
    if (
      payloadKeys.length !== ACCESS_PAYLOAD_KEYS.length ||
      payloadKeys.some((key, index) => key !== ACCESS_PAYLOAD_KEYS[index])
    ) {
      throw accessInvalid();
    }
    const subject = stringClaim(payload, "sub");
    const clientId = stringClaim(payload, "client_id");
    const tokenId = stringClaim(payload, "jti");
    const grantId = stringClaim(payload, "grant_id");
    const grantRevision = numericClaim(payload, "grant_rev");
    const issuedAt = numericClaim(payload, "iat");
    const notBefore = numericClaim(payload, "nbf");
    const expiresAt = numericClaim(payload, "exp");
    const scopes = parseScopes(payload.scope);
    const nowSeconds = Math.floor(this.#now() / 1000);
    if (
      payload.iss !== this.#identity.issuer ||
      payload.aud !== this.#identity.resource ||
      subject !== this.#ownerSubject ||
      !CLIENT_ID_PATTERN.test(clientId) ||
      !TOKEN_ID_PATTERN.test(tokenId) ||
      !GRANT_ID_PATTERN.test(grantId) ||
      notBefore !== issuedAt ||
      notBefore > nowSeconds ||
      issuedAt > nowSeconds + OAUTH_ACCESS_TOKEN_CLOCK_SKEW_SECONDS ||
      nowSeconds - issuedAt > OAUTH_ACCESS_TOKEN_TTL_SECONDS + OAUTH_ACCESS_TOKEN_CLOCK_SKEW_SECONDS ||
      expiresAt !== issuedAt + OAUTH_ACCESS_TOKEN_TTL_SECONDS ||
      expiresAt <= nowSeconds - OAUTH_ACCESS_TOKEN_CLOCK_SKEW_SECONDS ||
      state.bindingId !== this.#identity.bindingId ||
      state.incarnationId !== this.#identity.incarnationId
    ) {
      throw accessInvalid();
    }
    const base: Omit<VerifiedAccessToken, "authInfo"> = Object.freeze({
      ownerSubject: subject,
      ownerRef: this.#ownerRef,
      clientId,
      clientRef: clientRefForId(clientId),
      resource: this.#identity.resource,
      bindingId: this.#identity.bindingId,
      incarnationId: this.#identity.incarnationId,
      grantId,
      grantRevision,
      scopes,
      tokenId,
      expiresAt,
      fingerprint
    });
    this.#rememberPositive(fingerprint, base, expiresAt * 1000);
    return base;
  }

  #cheapBearerHeader(token: string): { kid: string } {
    if (
      typeof token !== "string" || token.length < 32 || Buffer.byteLength(token, "utf8") > OAUTH_BEARER_MAX_BYTES ||
      /[^\x21-\x7e]/.test(token)
    ) {
      throw accessInvalid();
    }
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => part.length === 0 || !BASE64URL_PATTERN.test(part))) throw accessInvalid();
    let parsed: unknown;
    try {
      const decoded = parts.map((part) => Buffer.from(part, "base64url"));
      if (decoded.some((bytes, index) => bytes.toString("base64url") !== parts[index])) throw new Error("non-canonical");
      if (decoded[0].length < 2 || decoded[0].length > 1024) throw new Error("header-size");
      if (decoded[1].length < 2 || decoded[1].length > 4096) throw new Error("payload-size");
      if (decoded[2].length !== 64) throw new Error("signature-size");
      const rawHeader = decoded[0].toString("utf8");
      const rawPayload = decoded[1].toString("utf8");
      parsed = JSON.parse(rawHeader);
      const parsedPayload = JSON.parse(rawPayload);
      const serializedKeys = [...rawHeader.matchAll(/"([^"\\]+)"\s*:/g)].map((match) => match[1]);
      if (serializedKeys.length !== 3 || new Set(serializedKeys).size !== 3) throw new Error("header-keys");
      if (!parsedPayload || Array.isArray(parsedPayload) || typeof parsedPayload !== "object") throw new Error("payload-object");
      const serializedPayloadKeys = [...rawPayload.matchAll(/"([^"\\]+)"\s*:/g)].map((match) => match[1]);
      const parsedPayloadKeys = Object.keys(parsedPayload as Record<string, unknown>).sort();
      if (
        serializedPayloadKeys.length !== ACCESS_PAYLOAD_KEYS.length ||
        new Set(serializedPayloadKeys).size !== ACCESS_PAYLOAD_KEYS.length ||
        parsedPayloadKeys.length !== ACCESS_PAYLOAD_KEYS.length ||
        parsedPayloadKeys.some((key, index) => key !== ACCESS_PAYLOAD_KEYS[index])
      ) {
        throw new Error("payload-keys");
      }
    } catch {
      throw accessInvalid();
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw accessInvalid();
    const header = parsed as Record<string, unknown>;
    const headerKeys = Object.keys(header).sort();
    if (
      headerKeys.length !== 3 || headerKeys[0] !== "alg" || headerKeys[1] !== "kid" || headerKeys[2] !== "typ" ||
      header.alg !== "ES256" || header.typ !== "at+jwt" || typeof header.kid !== "string" || !KID_PATTERN.test(header.kid)
    ) {
      throw accessInvalid();
    }
    return { kid: header.kid };
  }

  #createRefreshToken(familyHandle: string, generation: bigint): string {
    if (!/^family_[a-f0-9]{32}$/.test(familyHandle) || generation < 0n || generation > 0xffffffffffffffffn) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth refresh envelope input is invalid.");
    }
    const payload = Buffer.alloc(REFRESH_PAYLOAD_BYTES);
    payload[0] = REFRESH_VERSION;
    Buffer.from(familyHandle.slice("family_".length), "hex").copy(payload, 1);
    payload.writeBigUInt64BE(generation, 17);
    this.#randomBytesExact(32).copy(payload, 25);
    const mac = createHmac("sha256", this.#refreshEnvelopeKey).update(payload).digest();
    return Buffer.concat([payload, mac]).toString("base64url");
  }

  #parseRefreshToken(token: string): RefreshEnvelope {
    if (
      typeof token !== "string" || token.length < 1 || Buffer.byteLength(token, "utf8") > OAUTH_REFRESH_TOKEN_MAX_BYTES ||
      !BASE64URL_PATTERN.test(token)
    ) {
      throw oauthInvalidGrant();
    }
    let decoded: Buffer;
    try {
      decoded = Buffer.from(token, "base64url");
    } catch {
      throw oauthInvalidGrant();
    }
    if (
      decoded.toString("base64url") !== token ||
      decoded.length !== OAUTH_REFRESH_ENVELOPE_BYTES ||
      decoded[0] !== REFRESH_VERSION
    ) {
      throw oauthInvalidGrant();
    }
    const payload = decoded.subarray(0, REFRESH_PAYLOAD_BYTES);
    const suppliedMac = decoded.subarray(REFRESH_PAYLOAD_BYTES);
    const expectedMac = createHmac("sha256", this.#refreshEnvelopeKey).update(payload).digest();
    if (!fixedEqual(suppliedMac, expectedMac)) throw oauthInvalidGrant();
    const familyHandle = `family_${payload.subarray(1, 17).toString("hex")}`;
    const generation = payload.readBigUInt64BE(17);
    return Object.freeze({ familyHandle, generation, tokenHash: this.#refreshHash(token) });
  }

  #refreshHash(token: string): string {
    return `hmac-sha256:${createHmac("sha256", this.#refreshStoreKey).update(token, "utf8").digest("hex")}`;
  }

  #tokenFingerprint(token: string): string {
    return createHmac("sha256", this.#bearerCacheKey).update(token, "utf8").digest("hex");
  }

  #rememberPositive(fingerprint: string, verified: Omit<VerifiedAccessToken, "authInfo">, expiresAtMs: number): void {
    const boundedExpiry = Math.min(expiresAtMs, this.#now() + OAUTH_ACCESS_TOKEN_TTL_SECONDS * 1000);
    this.#positiveCache.delete(fingerprint);
    this.#positiveCache.set(fingerprint, {
      verified,
      expiresAtMs: boundedExpiry
    });
    this.#validatedFingerprints.delete(fingerprint);
    this.#validatedFingerprints.set(fingerprint, boundedExpiry);
    while (this.#positiveCache.size > 128) {
      const oldest = this.#positiveCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#positiveCache.delete(oldest);
    }
    while (this.#validatedFingerprints.size > 128) {
      const oldest = this.#validatedFingerprints.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#validatedFingerprints.delete(oldest);
    }
  }

  #rememberNegative(fingerprint: string, now: number): void {
    this.#negativeCache.delete(fingerprint);
    this.#negativeCache.set(fingerprint, now + 60_000);
    while (this.#negativeCache.size > 256) {
      const oldest = this.#negativeCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#negativeCache.delete(oldest);
    }
  }

  #pruneCaches(now: number): void {
    for (const [key, value] of this.#positiveCache) if (value.expiresAtMs <= now) this.#positiveCache.delete(key);
    for (const [key, until] of this.#negativeCache) if (until <= now) this.#negativeCache.delete(key);
    for (const [key, until] of this.#validatedFingerprints) if (until <= now) this.#validatedFingerprints.delete(key);
  }

  #currentState(): DeploymentStateV1 {
    const state = this.#store.readDeployment(this.#identity.bindingId, this.#identity.incarnationId);
    if (state.bindingId !== this.#identity.bindingId || state.incarnationId !== this.#identity.incarnationId) {
      throw authConfigurationError("OAUTH_STATE_RECOVERY_REQUIRED", "OAuth token state identity changed.");
    }
    return state;
  }

  #randomBytesExact(size: number): Buffer {
    return this.#random(size, this.#randomBytes);
  }

  #random(size: number, source: (size: number) => Buffer): Buffer {
    const value = source(size);
    if (!Buffer.isBuffer(value) || value.length !== size) {
      throw authConfigurationError("OAUTH_STATE_INVALID", "OAuth token random source is invalid.");
    }
    return value;
  }
}
