import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes
} from "node:crypto";
import { deriveTransactionSubkey } from "../transactions/installation.js";
import { changeSetBlobIdSchema } from "./schemas.js";
import {
  ChangeSetError,
  type ChangeSetBlobContext
} from "./types.js";
import {
  changeSetIdSchema,
  operationIdSchema,
  sha256Schema
} from "../transactions/schemas.js";

const MAGIC = Buffer.from("CPCHGB01", "ascii");
const ENVELOPE_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 1 + NONCE_BYTES + TAG_BYTES;
export const MAX_CHANGE_SET_BLOB_PLAINTEXT_BYTES = 64 * 1024 * 1024;

export interface ChangeSetBlobCryptoOptions {
  randomBytes?: (size: number) => Buffer;
}

function parseContext(context: ChangeSetBlobContext): ChangeSetBlobContext {
  const result = {
    changeSetId: changeSetIdSchema.safeParse(context.changeSetId),
    blobId: changeSetBlobIdSchema.safeParse(context.blobId),
    operationId: operationIdSchema.safeParse(context.operationId),
    beforeSha256: sha256Schema.safeParse(context.beforeSha256)
  };
  if (Object.values(result).some((item) => !item.success)) {
    throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set blob identity is invalid.");
  }
  return context;
}

function aadFor(context: ChangeSetBlobContext): Buffer {
  const parsed = parseContext(context);
  return Buffer.from(JSON.stringify({
    schemaVersion: 1,
    changeSetId: parsed.changeSetId,
    blobId: parsed.blobId,
    operationId: parsed.operationId,
    beforeSha256: parsed.beforeSha256
  }), "utf8");
}

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new ChangeSetError("CHANGE_SET_INVALID", "Change-set blob key must be 32 bytes.");
  }
}

export function deriveChangeSetBlobKey(masterKey: Buffer): Buffer {
  return deriveTransactionSubkey(masterKey, "change-set-blob");
}

export function deriveChangeSetManifestKey(masterKey: Buffer): Buffer {
  return deriveTransactionSubkey(masterKey, "change-set-manifest");
}

export function encryptChangeSetBlob(
  key: Buffer,
  plaintext: Buffer,
  context: ChangeSetBlobContext,
  options: ChangeSetBlobCryptoOptions = {}
): Buffer {
  assertKey(key);
  if (!Buffer.isBuffer(plaintext) || plaintext.length > MAX_CHANGE_SET_BLOB_PLAINTEXT_BYTES) {
    throw new ChangeSetError("CHANGE_SET_LIMIT_EXCEEDED", "Change-set blob plaintext exceeds its limit.");
  }
  const nonce = (options.randomBytes ?? nodeRandomBytes)(NONCE_BYTES);
  if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_BYTES) {
    throw new ChangeSetError("CHANGE_SET_UNAVAILABLE", "Change-set blob nonce source is invalid.");
  }
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadFor(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    MAGIC,
    Buffer.from([ENVELOPE_VERSION]),
    nonce,
    tag,
    ciphertext
  ]);
}

export function decryptChangeSetBlob(
  key: Buffer,
  envelope: Buffer,
  context: ChangeSetBlobContext
): Buffer {
  assertKey(key);
  if (
    !Buffer.isBuffer(envelope) ||
    envelope.length < HEADER_BYTES ||
    !envelope.subarray(0, MAGIC.length).equals(MAGIC) ||
    envelope[MAGIC.length] !== ENVELOPE_VERSION
  ) {
    throw new ChangeSetError("CHANGE_SET_INTEGRITY_FAILURE", "Change-set blob envelope is invalid.");
  }
  const nonceStart = MAGIC.length + 1;
  const tagStart = nonceStart + NONCE_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      envelope.subarray(nonceStart, tagStart),
      { authTagLength: TAG_BYTES }
    );
    decipher.setAAD(aadFor(context));
    decipher.setAuthTag(envelope.subarray(tagStart, ciphertextStart));
    return Buffer.concat([
      decipher.update(envelope.subarray(ciphertextStart)),
      decipher.final()
    ]);
  } catch (error) {
    if (error instanceof ChangeSetError && error.code === "CHANGE_SET_INVALID") throw error;
    throw new ChangeSetError(
      "CHANGE_SET_INTEGRITY_FAILURE",
      "Change-set blob authentication failed."
    );
  }
}
