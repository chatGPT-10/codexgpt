import { randomBytes } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { CodexGPTHome, profileIdForRoot } from "../profileStore.js";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";

const OwnedRuntimeRecordSchema = z.object({
  schemaVersion: z.literal(1),
  controllerId: z.string().regex(/^lch_[a-f0-9]{32}$/),
  workspaceRoot: z.string().min(1).max(32768),
  pid: z.number().int().positive().safe(),
  processCreationTime: z.string().min(1).max(160),
  state: z.enum(["owned_starting", "owned_running", "exited"]),
  startedAt: z.string().datetime({ offset: true }),
  exitedAt: z.string().datetime({ offset: true }).nullable(),
  exitCode: z.number().int().nullable()
}).strict();

export type OwnedRuntimeRecord = z.infer<typeof OwnedRuntimeRecordSchema>;
export type OwnedRuntimeState = "none" | "owned_starting" | "owned_running" | "foreign_or_stale" | "exited";

export interface RuntimeOwnershipSnapshot {
  readonly state: OwnedRuntimeState;
  readonly pid: number | null;
}

export interface RuntimeOwnershipSupervisor {
  snapshot(): Promise<RuntimeOwnershipSnapshot>;
  recordOwnedRuntime(input: { pid: number; processCreationTime: string }): Promise<RuntimeOwnershipSnapshot>;
  markRunning(): Promise<RuntimeOwnershipSnapshot>;
  markExited(exitCode: number | null): Promise<RuntimeOwnershipSnapshot>;
  markExitedAfterConfirmedTermination(exitCode: number | null): Promise<RuntimeOwnershipSnapshot>;
}

export interface RuntimeOwnershipOptions {
  workspaceRoot: string;
  stateRoot?: string;
  controllerId?: string;
  now?: () => number;
  processCreationTime?: (pid: number) => Promise<string | null>;
}

function lifecycleError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function defaultControllerId(): string {
  return `lch_${randomBytes(16).toString("hex")}`;
}

export function defaultLifecycleStateRoot(): string {
  return path.join(CodexGPTHome(), "control-plane", "v1");
}

function recordPath(stateRoot: string, workspaceRoot: string): string {
  return path.join(path.resolve(stateRoot), "runtimes", `${profileIdForRoot(workspaceRoot)}.json`);
}

export function createRuntimeOwnershipSupervisor(options: RuntimeOwnershipOptions): RuntimeOwnershipSupervisor {
  const stateRoot = path.resolve(options.stateRoot ?? defaultLifecycleStateRoot());
  const controllerId = options.controllerId ?? defaultControllerId();
  if (!/^lch_[a-f0-9]{32}$/.test(controllerId)) throw lifecycleError("CONTROL_OWNER_INVALID");
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const now = options.now ?? Date.now;
  const creationTime = options.processCreationTime ?? (async () => null);
  const store = new AtomicJsonFileStore(stateRoot, OwnedRuntimeRecordSchema);
  const filePath = recordPath(stateRoot, workspaceRoot);

  const read = (): OwnedRuntimeRecord | null => {
    try {
      return store.read(filePath);
    } catch {
      return null;
    }
  };
  const observe = async (): Promise<RuntimeOwnershipSnapshot> => {
    const record = read();
    if (!record) return { state: "none", pid: null };
    if (record.state === "exited") return { state: "exited", pid: record.pid };
    const liveCreation = await creationTime(record.pid);
    if (record.controllerId !== controllerId || liveCreation !== record.processCreationTime) {
      return { state: "foreign_or_stale", pid: record.pid };
    }
    return { state: record.state, pid: record.pid };
  };
  const requireOwnedLive = async (): Promise<OwnedRuntimeRecord> => {
    const snapshot = await observe();
    const record = read();
    if (!record || (snapshot.state !== "owned_starting" && snapshot.state !== "owned_running")) {
      throw lifecycleError("CONTROL_RUNTIME_NOT_OWNED");
    }
    return record;
  };
  return Object.freeze({
    snapshot: observe,
    recordOwnedRuntime: async ({ pid, processCreationTime }: { pid: number; processCreationTime: string }) => {
      if (!Number.isSafeInteger(pid) || pid <= 0 || !processCreationTime || processCreationTime.length > 160) {
        throw lifecycleError("CONTROL_RUNTIME_IDENTITY_INVALID");
      }
      const liveCreation = await creationTime(pid);
      if (liveCreation !== processCreationTime) throw lifecycleError("CONTROL_RUNTIME_IDENTITY_STALE");
      store.write(filePath, {
        schemaVersion: 1,
        controllerId,
        workspaceRoot,
        pid,
        processCreationTime,
        state: "owned_starting",
        startedAt: new Date(now()).toISOString(),
        exitedAt: null,
        exitCode: null
      });
      return await observe();
    },
    markRunning: async () => {
      const record = await requireOwnedLive();
      store.write(filePath, { ...record, state: "owned_running" });
      return await observe();
    },
    markExited: async (exitCode: number | null): Promise<RuntimeOwnershipSnapshot> => {
      const record = await requireOwnedLive();
      if (exitCode !== null && !Number.isSafeInteger(exitCode)) throw lifecycleError("CONTROL_RUNTIME_EXIT_INVALID");
      store.write(filePath, {
        ...record,
        state: "exited",
        exitedAt: new Date(now()).toISOString(),
        exitCode
      });
      return { state: "exited" as const, pid: record.pid };
    },
    markExitedAfterConfirmedTermination: async (exitCode: number | null): Promise<RuntimeOwnershipSnapshot> => {
      const record = read();
      if (!record || record.controllerId !== controllerId || (record.state !== "owned_starting" && record.state !== "owned_running")) {
        throw lifecycleError("CONTROL_RUNTIME_NOT_OWNED");
      }
      if (exitCode !== null && !Number.isSafeInteger(exitCode)) throw lifecycleError("CONTROL_RUNTIME_EXIT_INVALID");
      store.write(filePath, {
        ...record,
        state: "exited",
        exitedAt: new Date(now()).toISOString(),
        exitCode
      });
      return { state: "exited" as const, pid: record.pid };
    }
  });
}
