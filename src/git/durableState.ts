import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  timingSafeEqual
} from "node:crypto";
import path from "node:path";

export interface GitStateDirectoriesV1 {
  root: string;
  locks: string;
  repositoryLocks: string;
  worktreeLocks: string;
  state: string;
  repositories: string;
  operations: string;
  quarantines: string;
}

export function gitStateDirectories(stateRoot: string): GitStateDirectoriesV1 {
  const root = path.resolve(stateRoot);
  const locks = path.join(root, "locks", "git");
  const state = path.join(root, "git");
  return {
    root,
    locks,
    repositoryLocks: path.join(locks, "repositories"),
    worktreeLocks: path.join(locks, "worktrees"),
    state,
    repositories: path.join(state, "repositories"),
    operations: path.join(state, "operations"),
    quarantines: path.join(state, "quarantines")
  };
}

export interface SealedGitStateV1 {
  schemaVersion: 1;
  iv: string;
  ciphertext: string;
  tag: string;
}

export function gateRError(code = "GIT_RECOVERY_REQUIRED"): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

function canonical(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw gateRError();
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw gateRError();
  if (ancestors.has(value)) throw gateRError();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonical(item, ancestors)).join(",")}]`;
    }
    const object = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) throw gateRError();
    return `{${Object.keys(object).sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => {
        if (object[key] === undefined) throw gateRError();
        return `${JSON.stringify(key)}:${canonical(object[key], ancestors)}`;
      }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalGateRJson(value: unknown): string {
  return canonical(value, new Set());
}

export function deriveGateRSubkey(masterKey: Buffer, label: string): Buffer {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) throw gateRError();
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(label)) throw gateRError();
  return Buffer.from(hkdfSync(
    "sha256",
    masterKey,
    Buffer.alloc(0),
    Buffer.from(`codexgpt/phase5/gate-r/${label}/v1`, "utf8"),
    32
  ));
}

export function sealGitState(
  key: Buffer,
  aad: string,
  value: unknown,
  randomBytes: (size: number) => Buffer,
  maxPlaintextBytes = 262_144
): SealedGitStateV1 {
  if (
    !Buffer.isBuffer(key) ||
    key.length !== 32 ||
    !aad ||
    aad.length > 1024 ||
    !Number.isSafeInteger(maxPlaintextBytes) ||
    maxPlaintextBytes < 262_144 ||
    maxPlaintextBytes > 48_000_000
  ) throw gateRError();
  const plaintext = Buffer.from(canonicalGateRJson(value), "utf8");
  if (plaintext.length > maxPlaintextBytes) {
    plaintext.fill(0);
    throw gateRError();
  }
  const iv = randomBytes(12);
  if (!Buffer.isBuffer(iv) || iv.length !== 12) {
    plaintext.fill(0);
    throw gateRError();
  }
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      schemaVersion: 1,
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: tag.toString("base64")
    };
  } catch {
    throw gateRError();
  } finally {
    plaintext.fill(0);
    iv.fill(0);
  }
}

export function openGitState<T>(
  key: Buffer,
  aad: string,
  sealed: SealedGitStateV1,
  maxPlaintextBytes = 262_144
): T {
  try {
    if (
      !Number.isSafeInteger(maxPlaintextBytes) ||
      maxPlaintextBytes < 262_144 ||
      maxPlaintextBytes > 48_000_000
    ) throw new Error("size");
    if (sealed.schemaVersion !== 1) throw new Error("version");
    const iv = Buffer.from(sealed.iv, "base64");
    const ciphertext = Buffer.from(sealed.ciphertext, "base64");
    const tag = Buffer.from(sealed.tag, "base64");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > maxPlaintextBytes) throw new Error("shape");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    try {
      if (plaintext.length > maxPlaintextBytes) throw new Error("size");
      return JSON.parse(plaintext.toString("utf8")) as T;
    } finally {
      plaintext.fill(0);
    }
  } catch {
    throw gateRError();
  }
}

export function gateRRecordMac(key: Buffer, valueWithoutMac: unknown): string {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw gateRError();
  return createHmac("sha256", key)
    .update(canonicalGateRJson(valueWithoutMac), "utf8")
    .digest("hex");
}

export function verifyGateRRecordMac(key: Buffer, valueWithoutMac: unknown, supplied: string): void {
  if (!/^[a-f0-9]{64}$/.test(supplied)) throw gateRError();
  const expected = Buffer.from(gateRRecordMac(key, valueWithoutMac), "hex");
  const actual = Buffer.from(supplied, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw gateRError();
}
