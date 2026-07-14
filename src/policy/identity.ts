import { createHmac, randomBytes as nodeRandomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { codexProHome } from "../profileStore.js";
import { requestIdentityV1Schema } from "./schemas.js";
import type { PolicyScope, RequestIdentityV1 } from "./types.js";

const IDENTITY_KEY_BYTES = 32;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function isFileError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function base32Lower(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function identityKeyPath(home = codexProHome()): string {
  return path.join(home, "policy", "identity-hmac.key");
}

function readIdentityKey(filePath: string): Buffer {
  const key = fs.readFileSync(filePath);
  if (key.length !== IDENTITY_KEY_BYTES) {
    throw new Error("Identity key has an invalid length.");
  }
  return key;
}

export function loadOrCreateIdentityKey(
  options: { home?: string; randomBytes?: (size: number) => Buffer } = {}
): Buffer {
  const filePath = identityKeyPath(options.home);
  try {
    return readIdentityKey(filePath);
  } catch (error) {
    if (!isFileError(error, "ENOENT")) throw error;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const key = (options.randomBytes ?? nodeRandomBytes)(IDENTITY_KEY_BYTES);
  if (!Buffer.isBuffer(key) || key.length !== IDENTITY_KEY_BYTES) {
    throw new Error("Identity key generator returned an invalid length.");
  }
  try {
    fs.writeFileSync(filePath, key, { flag: "wx", mode: 0o600 });
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Best-effort permission repair for filesystems that support chmod.
    }
    return Buffer.from(key);
  } catch (error) {
    if (!isFileError(error, "EEXIST")) throw error;
    return readIdentityKey(filePath);
  }
}

export function credentialRef(rawCredential: string, key: Buffer): string {
  if (!rawCredential) throw new Error("Credential reference requires a non-empty credential.");
  if (!Buffer.isBuffer(key) || key.length !== IDENTITY_KEY_BYTES) throw new Error("Credential reference key is invalid.");
  const digest = createHmac("sha256", key)
    .update("codexpro/request-identity/v1\0", "utf8")
    .update(rawCredential, "utf8")
    .digest();
  return `cred_${base32Lower(digest).slice(0, 26)}`;
}

function uniqueScopes(scopes: readonly PolicyScope[]): PolicyScope[] {
  return [...new Set(scopes)];
}

export function identityForStdio(scopes: readonly PolicyScope[]): RequestIdentityV1 {
  return requestIdentityV1Schema.parse({
    schemaVersion: 1,
    kind: "local_process",
    authenticationMode: "stdio",
    credentialRef: null,
    subject: null,
    scopes: uniqueScopes(scopes),
    assuranceLevel: "local"
  });
}

export function identityForLoopback(scopes: readonly PolicyScope[]): RequestIdentityV1 {
  return requestIdentityV1Schema.parse({
    schemaVersion: 1,
    kind: "loopback_unauthenticated",
    authenticationMode: "loopback_none",
    credentialRef: null,
    subject: null,
    scopes: uniqueScopes(scopes),
    assuranceLevel: "low"
  });
}

export function identityForSharedSecret(
  authenticationMode: "query_token" | "bearer",
  rawCredential: string,
  key: Buffer,
  scopes: readonly PolicyScope[]
): RequestIdentityV1 {
  return requestIdentityV1Schema.parse({
    schemaVersion: 1,
    kind: authenticationMode === "query_token" ? "shared_secret_query" : "shared_secret_bearer",
    authenticationMode,
    credentialRef: credentialRef(rawCredential, key),
    subject: null,
    scopes: uniqueScopes(scopes),
    assuranceLevel: "shared_secret"
  });
}

export interface PolicySessionContextSource {
  transportKind: "stdio" | "streamable_http";
  transportSessionId(): string;
  identity: RequestIdentityV1;
}

export function createStdioPolicySessionSource(input: {
  sessionId: string;
  scopes: readonly PolicyScope[];
}): PolicySessionContextSource {
  const sessionId = input.sessionId.trim();
  if (!sessionId || sessionId === "pending") throw new Error("STDIO policy session id is invalid.");
  return Object.freeze({
    transportKind: "stdio" as const,
    transportSessionId: () => sessionId,
    identity: Object.freeze(identityForStdio(input.scopes))
  });
}

export function createHttpPolicySessionSource(input: {
  authenticationMode: "loopback_none" | "query_token" | "bearer";
  configuredCredential?: string;
  key: Buffer;
  transportSessionId: () => string;
  scopes: readonly PolicyScope[];
}): PolicySessionContextSource {
  const identity = input.authenticationMode === "loopback_none"
    ? identityForLoopback(input.scopes)
    : identityForSharedSecret(
        input.authenticationMode,
        input.configuredCredential ?? "",
        input.key,
        input.scopes
      );
  return Object.freeze({
    transportKind: "streamable_http" as const,
    transportSessionId: input.transportSessionId,
    identity: Object.freeze(identity)
  });
}
