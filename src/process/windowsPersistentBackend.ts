import { randomBytes } from "node:crypto";
import net from "node:net";
import type { PersistentProcessBackendV3, PersistentProcessHandleV3 } from "./processManager.js";
import type { RunCommandRuntimeV3 } from "./runCommand.js";
import type { WindowsProcessHostRuntime } from "./windowsHostClient.js";

function requiredHandle(body: Record<string, unknown>): string {
  const value = body.processHandle;
  if (typeof value !== "string" || !/^native_[a-f0-9]{32}$/.test(value)) throw new Error("HOST_PROTOCOL_ERROR");
  return value;
}

export class WindowsPersistentProcessBackendV3 implements PersistentProcessBackendV3 {
  readonly #host: Pick<WindowsProcessHostRuntime, "get">;
  readonly #execution: Pick<RunCommandRuntimeV3, "preparePersistent">;

  constructor(options: { hostRuntime: Pick<WindowsProcessHostRuntime, "get">; executionRuntime: Pick<RunCommandRuntimeV3, "preparePersistent"> }) {
    this.#host = options.hostRuntime;
    this.#execution = options.executionRuntime;
  }

  async start(input: Parameters<PersistentProcessBackendV3["start"]>[0]): Promise<PersistentProcessHandleV3> {
    const prepared = input.prepared ?? this.#execution.preparePersistent(input.rawArgs);
    if (input.terminal === "conpty") return await this.#startConPty(input, prepared);
    const client = await this.#host.get();
    const response = await client.request("start_persistent", {
      ...prepared.compiled.request.input,
      commandOperation: prepared.compiled.request.operation,
      lifetimeMs: input.lifetimeMs
    }, { timeoutMs: input.timeoutMs + 10_000 });
    const processHandle = requiredHandle(response.body);
    let closed = false;
    let pollActive = true;
    const poll = async (): Promise<void> => {
      while (pollActive) {
        const current = await client.request("poll_persistent", { processHandle, waitMs: 250 }, { timeoutMs: 5_000 });
        for (const [stream, key] of [["stdout", "stdoutBase64"], ["stderr", "stderrBase64"]] as const) {
          const encoded = current.body[key];
          if (typeof encoded === "string" && encoded.length) input.onOutput(stream, Buffer.from(encoded, "base64"));
        }
        if (current.body.running !== true) {
          pollActive = false;
          closed = true;
          input.onExit(typeof current.body.exitCode === "number" ? current.body.exitCode : null, typeof current.body.reason === "string" ? current.body.reason : "exited");
        }
      }
    };
    void poll().catch(() => { if (!closed) { closed = true; input.onExit(null, "host_crashed"); } });
    return Object.freeze({
      backend: Object.freeze({
        backendId: prepared.backend.backendId,
        commandKind: prepared.command.kind,
        executableIdentity: prepared.backend.sha256,
        terminal: input.terminal
      }),
      write: async (data: Buffer, close: boolean) => { if (closed) throw new Error("PROCESS_NOT_FOUND"); await client.request("write_persistent", { processHandle, dataBase64: data.toString("base64"), close }); },
      interrupt: async () => { if (closed) return "unsupported"; const result = await client.request("interrupt_persistent", { processHandle }); return result.body.delivered === true ? "delivered" : "unsupported"; },
      terminate: async () => { if (closed) return; pollActive = false; await client.request("terminate_persistent", { processHandle }); closed = true; },
      resize: async () => { throw new Error("TERMINAL_NOT_AVAILABLE"); }
    });
  }

  async #startConPty(
    input: Parameters<PersistentProcessBackendV3["start"]>[0],
    prepared: ReturnType<RunCommandRuntimeV3["preparePersistent"]>
  ): Promise<PersistentProcessHandleV3> {
    if (prepared.command.kind === "bash") throw new Error("BACKEND_UNAVAILABLE");
    const client = await this.#host.get();
    const compiledInput = prepared.compiled.request.input as Record<string, unknown>;
    const executable = prepared.backend.realPath;
    const arguments_ = prepared.command.kind === "powershell"
      ? ["-NoLogo", "-NoProfile"]
      : Array.isArray(compiledInput.arguments) ? compiledInput.arguments : [];
    const initialInput = prepared.command.kind === "powershell"
      ? Buffer.from(`${prepared.command.script}\r\n`, "utf8")
      : Buffer.alloc(0);
    const controlPipe = randomBytes(32).toString("hex");
    const controlKey = randomBytes(32).toString("hex");
    const workerStart = Buffer.from(`${JSON.stringify({
      schemaVersion: 1,
      operation: "start",
      executable,
      arguments: arguments_,
      cwd: prepared.cwd,
      environment: Object.fromEntries(prepared.effective.entries),
      initialInputBase64: initialInput.toString("base64"),
      columns: 80,
      rows: 25,
      controlPipe,
      controlKey
    })}\n`, "utf8");
    const response = await client.request("start_conpty_worker", {
      workerInputBase64: workerStart.toString("base64"),
      lifetimeMs: input.lifetimeMs
    }, { timeoutMs: input.timeoutMs + 10_000 });
    const processHandle = requiredHandle(response.body);
    let closed = false;
    let pollActive = true;
    let buffered = Buffer.alloc(0);
    let terminalEvent: { exitCode: number | null; reason: string } | null = null;
    let controlSocket: net.Socket | null = null;
    const closeControlSocket = () => controlSocket?.destroy();
    let readyResolve!: () => void;
    let readyReject!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const pending = new Map<string, { resolve(value: Record<string, unknown>): void; reject(error: Error): void; timer: NodeJS.Timeout }>();

    const failPending = (error: Error) => {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
      pending.clear();
    };
    const consumeEvents = (bytes: Buffer) => {
      buffered = Buffer.concat([buffered, bytes]);
      if (buffered.length > 1024 * 1024) throw new Error("CONPTY_WORKER_PROTOCOL_OVERFLOW");
      for (;;) {
        const newline = buffered.indexOf(0x0a);
        if (newline < 0) break;
        const line = buffered.subarray(0, newline).toString("utf8").trim();
        buffered = buffered.subarray(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line) as Record<string, unknown>;
        if (event.schemaVersion !== 1 || typeof event.type !== "string") throw new Error("CONPTY_WORKER_PROTOCOL_ERROR");
        if (event.type === "control_ready") {
          if (event.controlPipe !== controlPipe || controlSocket) throw new Error("CONPTY_WORKER_PROTOCOL_ERROR");
          controlSocket = net.createConnection(`\\\\.\\pipe\\${controlPipe}`);
          controlSocket.on("error", (error) => {
            readyReject(error);
            failPending(error);
          });
        } else if (event.type === "ready") {
          if (event.targetInInheritedJobAtCreation !== true || event.imageIdentityVerified !== true) throw new Error("CONPTY_WORKER_OWNERSHIP_UNPROVED");
          readyResolve();
        } else if (event.type === "output") {
          if (typeof event.dataBase64 !== "string") throw new Error("CONPTY_WORKER_PROTOCOL_ERROR");
          input.onOutput("terminal", Buffer.from(event.dataBase64, "base64"));
        } else if (event.type === "response") {
          const requestId = typeof event.requestId === "string" ? event.requestId : "";
          const waiting = pending.get(requestId);
          if (!waiting) throw new Error("CONPTY_WORKER_RESPONSE_UNEXPECTED");
          clearTimeout(waiting.timer);
          pending.delete(requestId);
          if (event.ok === true) waiting.resolve(event);
          else waiting.reject(new Error(typeof event.code === "string" ? event.code : "CONPTY_WORKER_REQUEST_FAILED"));
        } else if (event.type === "exit") {
          terminalEvent = {
            exitCode: typeof event.exitCode === "number" ? event.exitCode : null,
            reason: typeof event.reason === "string" ? event.reason : "host_crashed"
          };
        } else {
          throw new Error("CONPTY_WORKER_PROTOCOL_ERROR");
        }
      }
    };
    const poll = async (): Promise<void> => {
      while (pollActive) {
        const current = await client.request("poll_persistent", { processHandle, waitMs: 100 }, { timeoutMs: 5_000 });
        if (typeof current.body.stdoutBase64 === "string" && current.body.stdoutBase64.length) consumeEvents(Buffer.from(current.body.stdoutBase64, "base64"));
        if (typeof current.body.stderrBase64 === "string" && current.body.stderrBase64.length) {
          throw new Error("CONPTY_WORKER_STDERR");
        }
        if (current.body.running !== true) {
          pollActive = false;
          closed = true;
          closeControlSocket();
          const ended = terminalEvent ?? { exitCode: typeof current.body.exitCode === "number" ? current.body.exitCode : null, reason: "host_crashed" };
          failPending(new Error("PROCESS_NOT_FOUND"));
          input.onExit(ended.exitCode, ended.reason);
        }
      }
    };
    void poll().catch((error) => {
      if (!closed) {
        closed = true;
        pollActive = false;
        closeControlSocket();
        readyReject(error instanceof Error ? error : new Error(String(error)));
        failPending(error instanceof Error ? error : new Error(String(error)));
        input.onExit(null, "host_crashed");
      }
    });
    const readyTimer = setTimeout(() => readyReject(new Error("CONPTY_WORKER_READY_TIMEOUT")), Math.min(input.timeoutMs, 30_000));
    readyTimer.unref?.();
    try {
      await ready;
    } catch (error) {
      pollActive = false;
      try { await client.request("terminate_persistent", { processHandle }); } catch { }
      closeControlSocket();
      closed = true;
      throw error;
    } finally {
      clearTimeout(readyTimer);
    }

    const requestWorker = async (operation: "input" | "resize" | "interrupt", body: Record<string, unknown>): Promise<Record<string, unknown>> => {
      if (closed) throw new Error("PROCESS_NOT_FOUND");
      if (!controlSocket || controlSocket.destroyed) throw new Error("PROCESS_NOT_FOUND");
      const requestId = randomBytes(32).toString("hex");
      const command = Buffer.from(`${JSON.stringify({ schemaVersion: 1, operation, requestId, controlKey, ...body })}\n`, "utf8");
      const responsePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error("CONPTY_WORKER_REQUEST_TIMEOUT")); }, 10_000);
        timer.unref?.();
        pending.set(requestId, { resolve, reject, timer });
      });
      try {
        await new Promise<void>((resolve, reject) => controlSocket!.write(command, (error) => error ? reject(error) : resolve()));
      } catch (error) {
        const waiting = pending.get(requestId);
        if (waiting) { clearTimeout(waiting.timer); pending.delete(requestId); waiting.reject(error instanceof Error ? error : new Error(String(error))); }
      }
      return await responsePromise;
    };

    return Object.freeze({
      backend: Object.freeze({
        backendId: prepared.backend.backendId,
        commandKind: prepared.command.kind,
        executableIdentity: prepared.backend.sha256,
        terminal: "conpty" as const
      }),
      write: async (data: Buffer, close: boolean) => { await requestWorker("input", { dataBase64: data.toString("base64"), close }); },
      interrupt: async () => { await requestWorker("interrupt", {}); return "delivered" as const; },
      terminate: async () => {
        if (closed) return;
        pollActive = false;
        closeControlSocket();
        await client.request("terminate_persistent", { processHandle });
        closed = true;
        failPending(new Error("PROCESS_NOT_FOUND"));
      },
      resize: async (columns: number, rows: number) => { await requestWorker("resize", { columns, rows }); }
    });
  }
}
