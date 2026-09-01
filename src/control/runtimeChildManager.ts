import type { RuntimeOwnershipSnapshot, RuntimeOwnershipSupervisor } from "./runtimeOwnership.js";

export interface ControllerOwnedChild {
  readonly pid?: number;
  once(event: "exit", listener: (code: number | null) => void): unknown;
}

export interface RuntimeChildManager {
  start(): Promise<RuntimeOwnershipSnapshot>;
  stop(): Promise<RuntimeOwnershipSnapshot>;
  restart(): Promise<RuntimeOwnershipSnapshot>;
}

export interface RuntimeChildManagerOptions {
  ownership: RuntimeOwnershipSupervisor;
  launch(): ControllerOwnedChild;
  processCreationTime(pid: number): Promise<string | null>;
  waitForReady?(): Promise<boolean>;
  terminate(pid: number): Promise<boolean>;
}

function childError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

export function createRuntimeChildManager(options: RuntimeChildManagerOptions): RuntimeChildManager {
  let operationInFlight: { kind: "start" | "stop" | "restart"; promise: Promise<RuntimeOwnershipSnapshot> } | null = null;
  let ownedChild: ControllerOwnedChild | null = null;
  const start = async (): Promise<RuntimeOwnershipSnapshot> => {
    const existing = await options.ownership.snapshot();
    if (existing.state === "owned_starting" || existing.state === "owned_running") {
      throw childError("CONTROL_RUNTIME_ALREADY_OWNED");
    }
    const child = options.launch();
    const pid = child.pid;
    if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0) throw childError("CONTROL_RUNTIME_SPAWN_INVALID");
    let exited: number | null | undefined;
    child.once("exit", (code) => {
      exited = code;
      void options.ownership.markExited(code).catch(() => {});
    });
    const processCreationTime = await options.processCreationTime(pid);
    if (!processCreationTime) throw childError("CONTROL_RUNTIME_IDENTITY_UNAVAILABLE");
    const snapshot = await options.ownership.recordOwnedRuntime({ pid, processCreationTime });
    ownedChild = child;
    if (exited !== undefined) return await options.ownership.markExited(exited);
    if (!options.waitForReady || !await options.waitForReady()) return snapshot;
    try {
      return await options.ownership.markRunning();
    } catch {
      return await options.ownership.snapshot();
    }
  };
  const stop = async (): Promise<RuntimeOwnershipSnapshot> => {
    const snapshot = await options.ownership.snapshot();
    if ((snapshot.state !== "owned_starting" && snapshot.state !== "owned_running") || !snapshot.pid || ownedChild?.pid !== snapshot.pid) {
      throw childError("CONTROL_RUNTIME_NOT_OWNED");
    }
    if (!await options.terminate(snapshot.pid)) throw childError("CONTROL_RUNTIME_STOP_FAILED");
    return await options.ownership.markExitedAfterConfirmedTermination(null);
  };
  const runExclusive = (kind: "start" | "stop" | "restart", action: () => Promise<RuntimeOwnershipSnapshot>): Promise<RuntimeOwnershipSnapshot> => {
    if (operationInFlight) {
      if (kind === "start" && operationInFlight.kind === "start") return operationInFlight.promise;
      return Promise.reject(childError("CONTROL_RUNTIME_OPERATION_IN_PROGRESS"));
    }
    const promise = action();
    operationInFlight = { kind, promise };
    void promise.finally(() => {
      if (operationInFlight?.promise === promise) operationInFlight = null;
    }).catch(() => {});
    return promise;
  };
  return Object.freeze({
    start: () => runExclusive("start", start),
    stop: () => runExclusive("stop", stop),
    restart: () => runExclusive("restart", async () => {
      await stop();
      return await start();
    })
  });
}
