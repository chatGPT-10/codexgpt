import { createHmac } from "node:crypto";
import { deriveTransactionSubkey } from "../transactions/installation.js";
import { normalizeCanonicalWorkspaceRoot } from "../transactions/stateRoot.js";
import { AuditError } from "./types.js";

function encodeCanonical(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new AuditError("AUDIT_RECORD_INVALID", "Canonical JSON numbers must be finite.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new AuditError("AUDIT_RECORD_INVALID", "Canonical JSON contains an unsupported value.");
  }
  if (ancestors.has(value)) {
    throw new AuditError("AUDIT_RECORD_INVALID", "Canonical JSON contains a cycle.");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => encodeCanonical(item, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new AuditError("AUDIT_RECORD_INVALID", "Canonical JSON accepts only plain objects.");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((left, right) => left.localeCompare(right, "en"));
    return `{${keys.map((key) => {
      const item = record[key];
      if (item === undefined) {
        throw new AuditError("AUDIT_RECORD_INVALID", "Canonical JSON contains an unsupported value.");
      }
      return `${JSON.stringify(key)}:${encodeCanonical(item, ancestors)}`;
    }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return encodeCanonical(value, new Set());
}

export function auditRecordMac(recordKey: Buffer, envelopeWithoutMac: unknown): string {
  if (!Buffer.isBuffer(recordKey) || recordKey.length !== 32) {
    throw new AuditError("AUDIT_RECORD_INVALID", "Audit record key has an invalid length.");
  }
  return createHmac("sha256", recordKey)
    .update(canonicalJson(envelopeWithoutMac), "utf8")
    .digest("hex");
}

export function deriveAuditRecordKey(masterKey: Buffer): Buffer {
  return deriveTransactionSubkey(masterKey, "audit-record");
}

export function deriveAuditCursorKey(masterKey: Buffer): Buffer {
  return deriveTransactionSubkey(masterKey, "audit-cursor");
}

export function workspaceAuditRef(
  canonicalRoot: string,
  masterKey: Buffer,
  platform: NodeJS.Platform = process.platform
): string {
  const key = deriveTransactionSubkey(masterKey, "audit-workspace-ref");
  try {
    const normalized = normalizeCanonicalWorkspaceRoot(canonicalRoot, platform);
    const digest = createHmac("sha256", key).update(normalized, "utf8").digest("hex");
    return `awr_${digest.slice(0, 32)}`;
  } finally {
    key.fill(0);
  }
}
