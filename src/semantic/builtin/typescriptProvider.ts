import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { DEFAULT_SEMANTIC_BUDGETS } from "../budgets.js";

export interface SemanticWorkerHealthRegistry {
  recordFailure(scopeId: string): void;
  recordSuccess(scopeId: string): void;
  status(scopeId?: string): Readonly<{
    unavailable: boolean;
    retryAfterMs: number;
  }>;
}

export function createSemanticWorkerHealthRegistry(options: {
  now?: () => number;
  failureThreshold?: number;
  cooldownMs?: number;
} = {}): SemanticWorkerHealthRegistry {
  const now = options.now ?? Date.now;
  const failureThreshold = options.failureThreshold ?? 3;
  const cooldownMs = options.cooldownMs ?? 30_000;
  const failuresByScope = new Map<string, { consecutive: number; cooldownUntil: number; unavailable: boolean }>();

  return {
    recordFailure(scopeId) {
      const current = failuresByScope.get(scopeId) ?? { consecutive: 0, cooldownUntil: 0, unavailable: false };
      current.consecutive += 1;
      current.unavailable = true;
      if (current.consecutive >= failureThreshold) current.cooldownUntil = now() + cooldownMs;
      failuresByScope.set(scopeId, current);
    },
    recordSuccess(scopeId) {
      failuresByScope.delete(scopeId);
    },
    status(scopeId) {
      const records = scopeId
        ? [failuresByScope.get(scopeId)].filter((value): value is NonNullable<typeof value> => Boolean(value))
        : [...failuresByScope.values()];
      const retryAfterMs = Math.max(0, ...records.map((value) => value.cooldownUntil - now()));
      return Object.freeze({
        unavailable: records.some((value) => value.unavailable),
        retryAfterMs
      });
    }
  };
}

export interface TypeScriptWorkerClientOptions {
  timeoutMs: number;
  maxQueue: number;
  maxResponseBytes: number;
  healthRegistry?: SemanticWorkerHealthRegistry;
}

export interface TypeScriptWorkerRequest {
  scopeId: string;
  healthScopeId?: string;
  operation: "definition" | "references" | "diagnostics" | "rename_preview";
  files: readonly { path: string; text: string; asset?: boolean }[];
  target: { path: string; line: number; column: number };
  includeDeclaration?: boolean;
  newName?: string;
}

interface PendingRequest {
  resolve(value: any): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
  scopeId: string;
  healthScopeId: string;
  bytes: number;
}

export interface TypeScriptWorkerClient {
  request(request: TypeScriptWorkerRequest): Promise<any>;
  dispose(): Promise<void>;
  readonly generation: number;
  cancelScope(scopeId: string): void;
  status(scopeId?: string): Readonly<{
    state: "idle" | "ready" | "cooldown" | "unavailable" | "disposed";
    generation: number;
    pending: number;
    retryAfterMs: number;
  }>;
}

export function createTypeScriptWorkerClient(options: TypeScriptWorkerClientOptions): TypeScriptWorkerClient {
  let worker: Worker | null = null;
  let disposed = false;
  let nextId = 1;
  let generation = 0;
  const healthRegistry = options.healthRegistry ?? createSemanticWorkerHealthRegistry();
  let queuedBytes = 0;
  const pending = new Map<number, PendingRequest>();

  const rejectAll = (message: string) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      queuedBytes -= entry.bytes;
      entry.reject(new Error(message));
    }
    pending.clear();
  };

  const start = () => {
    if (worker) return worker;
    const localCompiledWorkerUrl = new URL("./typescriptWorker.js", import.meta.url);
    const checkoutCompiledWorkerUrl = new URL("../../../dist/semantic/builtin/typescriptWorker.js", import.meta.url);
    const workerUrl = fs.existsSync(localCompiledWorkerUrl)
      ? localCompiledWorkerUrl
      : fs.existsSync(checkoutCompiledWorkerUrl)
        ? checkoutCompiledWorkerUrl
        : null;
    if (!workerUrl) throw new Error("Semantic worker is not built. Run the project build and retry.");
    const created = new Worker(workerUrl, {
      execArgv: [],
      resourceLimits: {
        maxOldGenerationSizeMb: DEFAULT_SEMANTIC_BUDGETS.workerOldGenerationSizeMb,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4
      }
    });
    worker = created;
    generation += 1;
    created.on("message", (message: any) => {
      if (worker !== created) return;
      const serializedBytes = Buffer.byteLength(JSON.stringify(message), "utf8");
      if (serializedBytes > options.maxResponseBytes) {
        for (const entry of pending.values()) healthRegistry.recordFailure(entry.healthScopeId);
        rejectAll("Semantic worker response exceeded its byte limit.");
        worker = null;
        void created.terminate();
        return;
      }
      const entry = pending.get(message?.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      queuedBytes -= entry.bytes;
      if (message?.ok === true) {
        healthRegistry.recordSuccess(entry.healthScopeId);
        entry.resolve(message.result);
      } else {
        entry.reject(new Error(String(message?.error ?? "Semantic worker failed.")));
      }
    });
    created.on("error", (error) => {
      if (worker !== created) return;
      for (const entry of pending.values()) healthRegistry.recordFailure(entry.healthScopeId);
      rejectAll(`Semantic worker crashed: ${error.message}`);
      worker = null;
    });
    created.on("exit", (code) => {
      if (worker !== created) return;
      if (code !== 0 && pending.size) {
        for (const entry of pending.values()) healthRegistry.recordFailure(entry.healthScopeId);
        rejectAll("Semantic worker exited before completing the request.");
      }
      worker = null;
    });
    return created;
  };

  return {
    get generation() {
      return generation;
    },
    request(request) {
      if (disposed) return Promise.reject(new Error("Semantic worker is disposed."));
      const healthScopeId = request.healthScopeId ?? request.scopeId;
      const health = healthRegistry.status(healthScopeId);
      if (health.retryAfterMs > 0) {
        return Promise.reject(new Error(`Semantic worker is cooling down; retry after ${health.retryAfterMs} ms.`));
      }
      if (pending.size >= options.maxQueue) return Promise.reject(new Error("Semantic worker queue limit reached."));
      const requestBytes = Buffer.byteLength(JSON.stringify(request), "utf8");
      const maxQueuedBytes = 96 * 1024 * 1024;
      if (requestBytes > 64 * 1024 * 1024 || queuedBytes + requestBytes > maxQueuedBytes) {
        return Promise.reject(new Error("Semantic worker queued input byte limit reached."));
      }
      const id = nextId++;
      const active = start();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          healthRegistry.recordFailure(healthScopeId);
          const entry = pending.get(id);
          pending.delete(id);
          if (entry) queuedBytes -= entry.bytes;
          reject(new Error("Semantic worker request timed out at its deadline."));
          const exact = worker;
          worker = null;
          void exact?.terminate();
          rejectAll("Semantic worker was terminated after a timeout.");
        }, Math.max(1, options.timeoutMs));
        pending.set(id, { resolve, reject, timer, scopeId: request.scopeId, healthScopeId, bytes: requestBytes });
        queuedBytes += requestBytes;
        active.postMessage({
          id,
          ...request,
          files: request.files.map((file) => ({
            path: file.path,
            text: file.text,
            ...(file.asset === true ? { asset: true } : {})
          }))
        });
      });
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      rejectAll("Semantic worker is disposed.");
      const exact = worker;
      worker = null;
      if (exact) await exact.terminate();
    },
    cancelScope(scopeId) {
      let cancelled = 0;
      for (const [id, entry] of pending.entries()) {
        if (entry.scopeId !== scopeId) continue;
        clearTimeout(entry.timer);
        pending.delete(id);
        queuedBytes -= entry.bytes;
        entry.reject(new Error("Semantic worker request was cancelled because its workspace was revoked."));
        cancelled += 1;
      }
      if (cancelled === 0 || pending.size > 0) return;
      const exact = worker;
      worker = null;
      void exact?.terminate();
    },
    status(scopeId) {
      const health = healthRegistry.status(scopeId);
      const retryAfterMs = health.retryAfterMs;
      return Object.freeze({
        state: disposed
          ? "disposed"
          : retryAfterMs > 0
            ? "cooldown"
            : worker
              ? "ready"
              : health.unavailable
                ? "unavailable"
                : "idle",
        generation,
        pending: pending.size,
        retryAfterMs
      });
    }
  };
}
