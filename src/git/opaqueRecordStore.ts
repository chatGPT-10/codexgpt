import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";
import {
  canonicalGateRJson,
  deriveGateRSubkey,
  openGitState,
  sealGitState,
  type SealedGitStateV1
} from "./durableState.js";

interface OpaqueRecordV1 {
  schemaVersion: 1;
  recordId: string;
  kind: string;
  generation: number;
  state: "active" | "consumed" | "revoked";
  issuedAt: string;
  expiresAt: string;
  value: SealedGitStateV1;
  recordMac: string;
}

const sealedSchema = z.object({
  schemaVersion: z.literal(1),
  iv: z.string().min(16).max(32),
  ciphertext: z.string().min(4).max(400_000),
  tag: z.string().min(20).max(32)
}).strict();

const recordSchema: z.ZodType<OpaqueRecordV1> = z.object({
  schemaVersion: z.literal(1),
  recordId: z.string().min(8).max(240).regex(/^[A-Za-z][A-Za-z0-9_-]+$/u),
  kind: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/u),
  generation: z.number().int().positive().safe(),
  state: z.enum(["active", "consumed", "revoked"]),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  value: sealedSchema,
  recordMac: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

function withoutMac(record: OpaqueRecordV1): Omit<OpaqueRecordV1, "recordMac"> {
  const { recordMac: _ignored, ...rest } = record;
  return rest;
}

export class DurableOpaqueRecordStoreV4 {
  readonly #directory: string;
  readonly #atomic: AtomicJsonFileStore<OpaqueRecordV1>;
  readonly #sealKey: Buffer;
  readonly #macKey: Buffer;
  readonly #now: () => number;

  constructor(options: {
    stateRoot: string;
    masterKey: Buffer;
    namespace: string;
    now?: () => number;
  }) {
    if (!/^[a-z][a-z0-9-]{0,47}$/u.test(options.namespace)) {
      throw new Error("GIT_RECOVERY_REQUIRED");
    }
    this.#directory = path.join(path.resolve(options.stateRoot), "git", options.namespace);
    this.#atomic = new AtomicJsonFileStore(options.stateRoot, recordSchema);
    this.#sealKey = deriveGateRSubkey(options.masterKey, `${options.namespace}-sealed`);
    this.#macKey = deriveGateRSubkey(options.masterKey, `${options.namespace}-mac`);
    this.#now = options.now ?? Date.now;
  }

  put<T>(input: {
    recordId: string;
    kind: string;
    value: T;
    expiresAt: number;
  }): void {
    const now = this.#now();
    if (input.expiresAt <= now || input.expiresAt > now + 366 * 24 * 60 * 60_000) {
      throw new Error("GIT_STATE_TOKEN_INVALID");
    }
    const file = this.#path(input.recordId);
    if (fs.existsSync(file)) throw new Error("GIT_STATE_TOKEN_INVALID");
    const base = {
      schemaVersion: 1 as const,
      recordId: input.recordId,
      kind: input.kind,
      generation: 1,
      state: "active" as const,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(input.expiresAt).toISOString(),
      value: sealGitState(
        this.#sealKey,
        `opaque-v4:${input.kind}:${input.recordId}`,
        input.value,
        randomBytes
      )
    };
    this.#atomic.write(file, recordSchema.parse({
      ...base,
      recordMac: createHmac("sha256", this.#macKey)
        .update(canonicalGateRJson(base))
        .digest("hex")
    }));
  }

  get<T>(recordId: string, kind: string): T {
    const record = this.#read(recordId);
    if (
      record.kind !== kind ||
      record.state !== "active" ||
      Date.parse(record.issuedAt) > this.#now() ||
      Date.parse(record.expiresAt) < this.#now()
    ) throw new Error("GIT_STATE_TOKEN_INVALID");
    return openGitState(
      this.#sealKey,
      `opaque-v4:${kind}:${recordId}`,
      record.value
    ) as T;
  }

  consume<T>(recordId: string, kind: string): T {
    const value = this.get<T>(recordId, kind);
    this.#transition(recordId, "consumed");
    return value;
  }

  revoke(recordId: string): void {
    const record = this.#read(recordId);
    if (record.state === "active") this.#transition(recordId, "revoked");
  }

  list<T>(kind: string, options: { includeExpired?: boolean } = {}): Array<{ recordId: string; value: T }> {
    let names: string[];
    try {
      names = fs.readdirSync(this.#directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error("GIT_RECOVERY_REQUIRED");
    }
    const output: Array<{ recordId: string; value: T }> = [];
    for (const name of names.filter((value) => /^[a-f0-9]{64}\.json$/u.test(value)).sort()) {
      const record = this.#atomic.read(path.join(this.#directory, name));
      const expected = createHmac("sha256", this.#macKey)
        .update(canonicalGateRJson(withoutMac(record)))
        .digest("hex");
      if (record.recordMac !== expected) throw new Error("GIT_RECOVERY_REQUIRED");
      if (
        record.kind === kind &&
        record.state === "active" &&
        (options.includeExpired === true || Date.parse(record.expiresAt) >= this.#now())
      ) {
        output.push({
          recordId: record.recordId,
          value: openGitState(
            this.#sealKey,
            `opaque-v4:${kind}:${record.recordId}`,
            record.value
          ) as T
        });
      }
    }
    return output;
  }

  dispose(): void {
    this.#sealKey.fill(0);
    this.#macKey.fill(0);
  }

  #transition(recordId: string, state: "consumed" | "revoked"): void {
    const current = this.#read(recordId);
    const base = {
      ...withoutMac(current),
      generation: current.generation + 1,
      state
    };
    this.#atomic.write(this.#path(recordId), recordSchema.parse({
      ...base,
      recordMac: createHmac("sha256", this.#macKey)
        .update(canonicalGateRJson(base))
        .digest("hex")
    }));
  }

  #read(recordId: string): OpaqueRecordV1 {
    const record = this.#atomic.read(this.#path(recordId));
    const expected = createHmac("sha256", this.#macKey)
      .update(canonicalGateRJson(withoutMac(record)))
      .digest("hex");
    if (record.recordMac !== expected) throw new Error("GIT_RECOVERY_REQUIRED");
    return record;
  }

  #path(recordId: string): string {
    if (!/^[A-Za-z][A-Za-z0-9_-]{7,239}$/u.test(recordId)) {
      throw new Error("GIT_STATE_TOKEN_INVALID");
    }
    const key = createHmac("sha256", this.#macKey)
      .update("opaque-record-path\0")
      .update(recordId)
      .digest("hex");
    return path.join(this.#directory, `${key}.json`);
  }
}
