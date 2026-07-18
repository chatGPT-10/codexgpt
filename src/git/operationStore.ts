import fs from "node:fs";
import path from "node:path";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { z } from "zod";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";
import {
  canonicalGateRJson,
  deriveGateRSubkey,
  gateRError,
  gateRRecordMac,
  gitStateDirectories,
  openGitState,
  sealGitState,
  verifyGateRRecordMac,
  type SealedGitStateV1
} from "./durableState.js";

export const GIT_OPERATION_STATES = Object.freeze([
  "preparing",
  "prepared",
  "executing",
  "effect_observed",
  "audit_pending",
  "committed",
  "rolling_back",
  "rolled_back",
  "recovery_required"
] as const);
export type GitOperationStateV1 = typeof GIT_OPERATION_STATES[number];

export const GIT_OPERATION_PARTICIPANTS = Object.freeze([
  "object_quarantine",
  "private_index",
  "file_transaction",
  "ref_cas",
  "task_registry",
  "audit"
] as const);
export type GitOperationParticipantV1 = typeof GIT_OPERATION_PARTICIPANTS[number];

export interface GitOperationRecordV1 {
  schemaVersion: 1;
  contractVersion: 4;
  operationId: string;
  repositoryStateKey: string;
  repositoryId: string;
  worktreeStateKeys: string[];
  toolName: string;
  canonicalAction: string;
  requestId: string;
  authorizationEventId: string;
  subjectFingerprint: string;
  contextFingerprint: string;
  policyRevision: string;
  resourceFingerprint: string;
  capabilityRevision: string;
  configurationRevision: string;
  participantRequirements: GitOperationParticipantV1[];
  counts: Record<string, number>;
  generation: number;
  state: GitOperationStateV1;
  durableEffectObserved: boolean;
  terminalAuditEventId: string | null;
  resultCode: string | null;
  privateState: SealedGitStateV1;
  createdAt: string;
  updatedAt: string;
  recordMac: string;
}

const safeOneLineSchema = z.string().min(1).max(160).refine(
  (value) => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
);
const timestampSchema = z.string().datetime({ offset: true });
const sealedSchema: z.ZodType<SealedGitStateV1> = z.object({
  schemaVersion: z.literal(1),
  iv: z.string().min(16).max(32),
  ciphertext: z.string().min(4).max(400_000),
  tag: z.string().min(20).max(32)
}).strict();
const countsSchema = z.record(
  z.string().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9._-]*$/),
  z.number().int().nonnegative().safe()
).refine((value) => Object.keys(value).length <= 32);

const recordSchema: z.ZodType<GitOperationRecordV1> = z.object({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(4),
  operationId: z.string().regex(/^gop_[a-f0-9]{32}$/),
  repositoryStateKey: z.string().regex(/^grs_[a-f0-9]{32}$/),
  repositoryId: z.string().regex(/^repo_[a-f0-9]{32}$/),
  worktreeStateKeys: z.array(z.string().regex(/^gws_[a-f0-9]{32}$/)).max(64)
    .refine((values) => new Set(values).size === values.length),
  toolName: safeOneLineSchema,
  canonicalAction: safeOneLineSchema,
  requestId: safeOneLineSchema,
  authorizationEventId: z.string().regex(/^event_[a-f0-9]{32}$/),
  subjectFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  policyRevision: safeOneLineSchema,
  resourceFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  capabilityRevision: z.string().regex(/^[a-f0-9]{64}$/),
  configurationRevision: z.string().regex(/^[a-f0-9]{64}$/),
  participantRequirements: z.array(z.enum(GIT_OPERATION_PARTICIPANTS)).min(1).max(GIT_OPERATION_PARTICIPANTS.length)
    .refine((values) => new Set(values).size === values.length),
  counts: countsSchema,
  generation: z.number().int().positive().safe(),
  state: z.enum(GIT_OPERATION_STATES),
  durableEffectObserved: z.boolean(),
  terminalAuditEventId: z.string().regex(/^event_[a-f0-9]{32}$/).nullable(),
  resultCode: safeOneLineSchema.nullable(),
  privateState: sealedSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  recordMac: z.string().regex(/^[a-f0-9]{64}$/)
}).strict().superRefine((value, context) => {
  if (value.state === "committed" && value.terminalAuditEventId === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["terminalAuditEventId"], message: "Committed operations require terminal audit." });
  }
  if (value.state === "effect_observed" || value.state === "audit_pending" || value.state === "committed") {
    if (!value.durableEffectObserved) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["durableEffectObserved"], message: "Durable effect state requires observed effect." });
    }
  }
  if (value.state !== "committed" && value.terminalAuditEventId !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["terminalAuditEventId"], message: "Only committed operations retain terminal audit identity." });
  }
});

export interface CreateGitOperationInputV1 {
  repositoryStateKey: string;
  repositoryId: string;
  worktreeStateKeys: string[];
  toolName: string;
  canonicalAction: string;
  requestId: string;
  authorizationEventId: string;
  subjectFingerprint: string;
  contextFingerprint: string;
  policyRevision: string;
  resourceFingerprint: string;
  capabilityRevision: string;
  configurationRevision: string;
  participantRequirements: GitOperationParticipantV1[];
  counts: Record<string, number>;
  privateState: unknown;
}

export interface GitOperationTransitionV1 {
  state: GitOperationStateV1;
  durableEffectObserved?: boolean;
  terminalAuditEventId?: string | null;
  resultCode?: string | null;
  counts?: Record<string, number>;
  privateState?: unknown;
}

const TRANSITIONS: Readonly<Record<GitOperationStateV1, ReadonlySet<GitOperationStateV1>>> = Object.freeze({
  preparing: new Set<GitOperationStateV1>(["prepared", "rolling_back", "rolled_back", "recovery_required"]),
  prepared: new Set<GitOperationStateV1>(["executing", "rolling_back", "rolled_back", "recovery_required"]),
  executing: new Set<GitOperationStateV1>(["effect_observed", "rolling_back", "rolled_back", "recovery_required"]),
  effect_observed: new Set<GitOperationStateV1>(["audit_pending", "rolling_back", "recovery_required"]),
  audit_pending: new Set<GitOperationStateV1>(["committed", "recovery_required"]),
  committed: new Set<GitOperationStateV1>(),
  rolling_back: new Set<GitOperationStateV1>(["rolled_back", "recovery_required"]),
  rolled_back: new Set<GitOperationStateV1>(),
  recovery_required: new Set<GitOperationStateV1>()
});

function timestamp(now: () => number): string {
  const value = new Date(now()).toISOString();
  if (value === "Invalid Date") throw gateRError();
  return value;
}

function withoutMac(record: GitOperationRecordV1): Omit<GitOperationRecordV1, "recordMac"> {
  const { recordMac: _recordMac, ...rest } = record;
  return rest;
}

function validatePrivateState(value: unknown): unknown {
  const canonical = canonicalGateRJson(value);
  if (Buffer.byteLength(canonical, "utf8") > 262_144) throw gateRError();
  return value;
}

export class GitOperationStore {
  readonly #stateRoot: string;
  readonly #directory: string;
  readonly #atomic: AtomicJsonFileStore<GitOperationRecordV1>;
  readonly #encryptionKey: Buffer;
  readonly #recordKey: Buffer;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;
  #disposed = false;

  constructor(options: {
    stateRoot: string;
    masterKey: Buffer;
    now?: () => number;
    randomBytes?: (size: number) => Buffer;
  }) {
    this.#stateRoot = path.resolve(options.stateRoot);
    this.#directory = gitStateDirectories(this.#stateRoot).operations;
    this.#atomic = new AtomicJsonFileStore(this.#stateRoot, recordSchema);
    this.#encryptionKey = deriveGateRSubkey(options.masterKey, "operation-private-state");
    this.#recordKey = deriveGateRSubkey(options.masterKey, "operation-record-mac");
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
  }

  recordPath(repositoryStateKey: string, operationId: string): string {
    this.#assertOpen();
    if (!/^grs_[a-f0-9]{32}$/.test(repositoryStateKey) || !/^gop_[a-f0-9]{32}$/.test(operationId)) throw gateRError();
    return path.join(this.#directory, repositoryStateKey, `${operationId}.json`);
  }

  create(input: CreateGitOperationInputV1): GitOperationRecordV1 {
    this.#assertOpen();
    const random = this.#randomBytes(16);
    if (!Buffer.isBuffer(random) || random.length !== 16) throw gateRError();
    const operationId = `gop_${random.toString("hex")}`;
    random.fill(0);
    const at = timestamp(this.#now);
    const privateState = sealGitState(
      this.#encryptionKey,
      `git-operation-v1:${input.repositoryStateKey}:${operationId}`,
      validatePrivateState(input.privateState),
      this.#randomBytes
    );
    const unsigned: Omit<GitOperationRecordV1, "recordMac"> = {
      schemaVersion: 1,
      contractVersion: 4,
      operationId,
      repositoryStateKey: input.repositoryStateKey,
      repositoryId: input.repositoryId,
      worktreeStateKeys: [...input.worktreeStateKeys].sort(),
      toolName: input.toolName,
      canonicalAction: input.canonicalAction,
      requestId: input.requestId,
      authorizationEventId: input.authorizationEventId,
      subjectFingerprint: input.subjectFingerprint,
      contextFingerprint: input.contextFingerprint,
      policyRevision: input.policyRevision,
      resourceFingerprint: input.resourceFingerprint,
      capabilityRevision: input.capabilityRevision,
      configurationRevision: input.configurationRevision,
      participantRequirements: [...input.participantRequirements],
      counts: { ...input.counts },
      generation: 1,
      state: "preparing",
      durableEffectObserved: false,
      terminalAuditEventId: null,
      resultCode: null,
      privateState,
      createdAt: at,
      updatedAt: at
    };
    let record: GitOperationRecordV1;
    try {
      record = recordSchema.parse({ ...unsigned, recordMac: gateRRecordMac(this.#recordKey, unsigned) });
    } catch {
      throw gateRError();
    }
    const file = this.recordPath(record.repositoryStateKey, record.operationId);
    if (fs.existsSync(file)) throw gateRError();
    try {
      this.#atomic.write(file, record);
      return Object.freeze(record);
    } catch {
      throw gateRError();
    }
  }

  read(repositoryStateKey: string, operationId: string): {
    record: GitOperationRecordV1;
    privateState: unknown;
  } {
    this.#assertOpen();
    try {
      const record = recordSchema.parse(this.#atomic.read(this.recordPath(repositoryStateKey, operationId)));
      verifyGateRRecordMac(this.#recordKey, withoutMac(record), record.recordMac);
      const privateState = openGitState<unknown>(
        this.#encryptionKey,
        `git-operation-v1:${repositoryStateKey}:${operationId}`,
        record.privateState
      );
      validatePrivateState(privateState);
      return { record: Object.freeze(record), privateState };
    } catch {
      throw gateRError();
    }
  }

  transition(previous: GitOperationRecordV1, change: GitOperationTransitionV1): GitOperationRecordV1 {
    this.#assertOpen();
    let parsedPrevious: GitOperationRecordV1;
    try {
      parsedPrevious = recordSchema.parse(previous);
    } catch {
      throw gateRError();
    }
    if (!TRANSITIONS[parsedPrevious.state].has(change.state)) throw gateRError();
    const persisted = this.read(parsedPrevious.repositoryStateKey, parsedPrevious.operationId);
    if (persisted.record.generation !== parsedPrevious.generation || persisted.record.recordMac !== parsedPrevious.recordMac) throw gateRError();
    const nextPrivate = change.privateState === undefined
      ? persisted.privateState
      : validatePrivateState(change.privateState);
    const privateState = sealGitState(
      this.#encryptionKey,
      `git-operation-v1:${parsedPrevious.repositoryStateKey}:${parsedPrevious.operationId}`,
      nextPrivate,
      this.#randomBytes
    );
    const unsigned: Omit<GitOperationRecordV1, "recordMac"> = {
      ...withoutMac(parsedPrevious),
      generation: parsedPrevious.generation + 1,
      state: change.state,
      durableEffectObserved: change.durableEffectObserved ?? parsedPrevious.durableEffectObserved,
      terminalAuditEventId: change.terminalAuditEventId === undefined ? parsedPrevious.terminalAuditEventId : change.terminalAuditEventId,
      resultCode: change.resultCode === undefined ? parsedPrevious.resultCode : change.resultCode,
      counts: change.counts === undefined ? parsedPrevious.counts : { ...change.counts },
      privateState,
      updatedAt: timestamp(this.#now)
    };
    let next: GitOperationRecordV1;
    try {
      next = recordSchema.parse({ ...unsigned, recordMac: gateRRecordMac(this.#recordKey, unsigned) });
    } catch {
      throw gateRError();
    }
    try {
      this.#atomic.write(this.recordPath(next.repositoryStateKey, next.operationId), next);
      return Object.freeze(next);
    } catch {
      throw gateRError();
    }
  }

  list(repositoryStateKey?: string): GitOperationRecordV1[] {
    this.#assertOpen();
    const repositories = repositoryStateKey
      ? [repositoryStateKey]
      : (() => {
          try {
            return fs.readdirSync(this.#directory).filter((name) => /^grs_[a-f0-9]{32}$/.test(name)).sort();
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw gateRError();
          }
        })();
    const output: GitOperationRecordV1[] = [];
    for (const repository of repositories) {
      let names: string[];
      try {
        names = fs.readdirSync(path.join(this.#directory, repository));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw gateRError();
      }
      for (const name of names.filter((value) => /^gop_[a-f0-9]{32}\.json$/.test(value)).sort()) {
        output.push(this.read(repository, name.slice(0, -5)).record);
      }
    }
    return output;
  }

  listIncomplete(repositoryStateKey?: string): GitOperationRecordV1[] {
    return this.list(repositoryStateKey).filter((record) => !["committed", "rolled_back"].includes(record.state));
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#encryptionKey.fill(0);
    this.#recordKey.fill(0);
  }

  #assertOpen(): void {
    if (this.#disposed) throw gateRError();
  }
}
