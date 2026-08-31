import { randomBytes, randomUUID } from "node:crypto";
import { describeProcessActionResourceV3 } from "../policy/executionResources.js";
import type { ResourceResolutionResult, ToolResourceResolver } from "../policy/integration.js";
import type { ResourceDescriptorV1 } from "../policy/types.js";
import { createToolMeta } from "../tools/schemas/common.js";
import {
  interruptProcessOutputSchema,
  interruptProcessOutputSchemaV5,
  listProcessesOutputSchema,
  listProcessesOutputSchemaV5,
  processIdV1Schema,
  readProcessOutputInputV1Schema,
  readProcessOutputOutputSchema,
  readProcessOutputOutputSchemaV4,
  readProcessOutputOutputSchemaV5,
  resizeProcessTerminalOutputSchema,
  resizeProcessTerminalOutputSchemaV5,
  startProcessInputV1Schema,
  startProcessInputV4Schema,
  startProcessOutputSchema,
  startProcessOutputSchemaV5,
  terminateProcessOutputSchema,
  terminateProcessOutputSchemaV5,
  writeProcessInputOutputSchema,
  writeProcessInputOutputSchemaV5,
  type ProcessState
} from "../tools/schemas/execution.js";
import { OutputCursorCodec } from "./outputCursor.js";
import { isOutputTerminalQuotaExceededError, OutputQuotaManager } from "./outputQuota.js";
import { OutputRing, type OutputRingCursor, type OutputRingPage } from "./outputRing.js";
import { ProcessAuditCoordinatorV3 } from "./processAuditCoordinator.js";
import { StreamingRedactor } from "./streamingRedactor.js";
import path from "node:path";
import fs from "node:fs";
import type { RunCommandRuntimeV3 } from "./runCommand.js";
import {
  FULL_ACCESS_PROCESS_AUTHORITY_V3,
  FULL_ACCESS_PROCESS_WARNING_V3
} from "./authority.js";
import { contractIncludesV4, contractIncludesV5 } from "../tools/contracts/index.js";

export interface PersistentProcessHandleV3 {
  backend?: {
    backendId: string;
    commandKind: "argv" | "powershell" | "bash";
    executableIdentity: string;
    terminal: "pipes" | "conpty";
  };
  write(data: Buffer, close: boolean): Promise<void>;
  interrupt(): Promise<"delivered" | "unsupported">;
  terminate(): Promise<void>;
  resize(columns: number, rows: number): Promise<void>;
}

type PersistentExecutionRuntimeV4 = Pick<RunCommandRuntimeV3,
  | "toolContractVersion"
  | "preparePersistent"
  | "beginPersistentVerification"
  | "completePersistentVerification"
  | "issuePersistentVerificationReceipt"
>;
type PreparedPersistentExecutionV4 = ReturnType<PersistentExecutionRuntimeV4["preparePersistent"]>;
type PersistentVerificationBeforeV4 = Awaited<ReturnType<PersistentExecutionRuntimeV4["beginPersistentVerification"]>>;

export interface PersistentProcessBackendV3 {
  start(input: { processId: string; rawArgs: Record<string, unknown>; prepared?: PreparedPersistentExecutionV4; command: unknown; cwd: unknown; environment: Record<string, string>; timeoutMs: number; lifetimeMs: number; terminal: "pipes" | "conpty"; onOutput(stream: "stdout" | "stderr" | "terminal", bytes: Buffer): void; onExit(exitCode: number | null, reason: string): void }): Promise<PersistentProcessHandleV3>;
}

interface RecordV3 {
  id: string; generation: number; context: string; mode: "full_access"; terminal: "pipes" | "conpty";
  startedAt: number; expiresAt: number; status: ProcessState;
  exitCode: number | null; verificationReceipt: string | null;
  prepared: PreparedPersistentExecutionV4 | null; verificationBefore: PersistentVerificationBeforeV4;
  ring: OutputRing; handle: PersistentProcessHandleV3 | null; release(): void; redactors: Record<"stdout" | "stderr" | "terminal", StreamingRedactor>;
  handleReady: Promise<PersistentProcessHandleV3 | null>;
  settleHandle(handle: PersistentProcessHandleV3 | null): void;
  lifecyclePromise: Promise<void> | null;
  lifecycleSettled: boolean;
  lifecycleFailed: boolean;
  lifecycleError: unknown;
  terminationPromise: Promise<void> | null;
  terminationSettled: boolean;
  verificationRevoked: boolean;
  retentionReady: boolean;
  expiryTimer: NodeJS.Timeout;
  terminalTimer?: NodeJS.Timeout;
}

export class ProcessManagerV3 implements ToolResourceResolver {
  readonly #backend: PersistentProcessBackendV3; readonly #context: () => string; readonly #audit: ProcessAuditCoordinatorV3;
  readonly #execution: PersistentExecutionRuntimeV4 | null;
  readonly #startResolver: ToolResourceResolver;
  readonly #quota: OutputQuotaManager; readonly #cursor: OutputCursorCodec; readonly #records = new Map<string, RecordV3>(); readonly #now: () => number;
  readonly #starting = new Set<Promise<void>>();
  #state: "open" | "closing" | "closed" = "open";
  #revocationGeneration = 0;
  #revoking = false;
  #revocationPromise: Promise<void> | null = null;
  #closePromise: Promise<void> | null = null;

  constructor(options: { backend: PersistentProcessBackendV3; contextFingerprint: () => string; startResourceResolver?: ToolResourceResolver; executionRuntime?: PersistentExecutionRuntimeV4; audit?: ProcessAuditCoordinatorV3; quota?: OutputQuotaManager; cursorKey?: Buffer; now?: () => number }) {
    this.#backend = options.backend; this.#context = options.contextFingerprint; this.#startResolver = options.startResourceResolver ?? { describe: () => { throw new Error("START_PROCESS_RESOURCE_REQUIRES_EXECUTION_BINDING"); } }; this.#execution = options.executionRuntime ?? null; this.#audit = options.audit ?? new ProcessAuditCoordinatorV3(); this.#quota = options.quota ?? new OutputQuotaManager(); this.#now = options.now ?? Date.now; this.#cursor = new OutputCursorCodec({ key: options.cursorKey ?? randomBytes(32), now: this.#now });
  }

  describe(toolName: string, args: Record<string, unknown>): ResourceResolutionResult {
    if (toolName === "start_process") return this.#startResolver.describe(toolName, args);
    const id = typeof args.process_id === "string" ? args.process_id : ""; const record = this.#owned(id);
    const operation = toolName as "read_process_output" | "list_processes" | "write_process_input" | "interrupt_process" | "terminate_process" | "resize_process_terminal";
    const resource = describeProcessActionResourceV3({ operation, processId: record?.id, generation: record?.generation, owned: Boolean(record), contextMatches: operation === "list_processes" || Boolean(record), terminal: record?.terminal, input: typeof args.data === "string" ? Buffer.from(args.data) : undefined, close: args.close === true });
    return { resource: resource as unknown as ResourceDescriptorV1, semanticFactsDigest: resource.semanticFactsDigest, riskClass: resource.riskClass, requiredScopes: ["process:manage"] };
  }

  async start(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.#state !== "open" || this.#revoking) throw new Error("PROCESS_MANAGER_UNAVAILABLE");
    const admissionGeneration = this.#revocationGeneration;
    let settleStart!: () => void;
    const pendingStart = new Promise<void>((resolve) => { settleStart = resolve; });
    this.#starting.add(pendingStart);
    try {
      return await this.#start(args, admissionGeneration);
    } finally {
      this.#starting.delete(pendingStart);
      settleStart();
    }
  }

  async #start(args: Record<string, unknown>, admissionGeneration: number): Promise<Record<string, unknown>> {
    const prepared = this.#execution?.preparePersistent(args) ?? null;
    const input = this.#execution && contractIncludesV4(this.#execution.toolContractVersion)
      ? startProcessInputV4Schema.parse(args)
      : startProcessInputV1Schema.parse(args);
    if (input.mode !== "full_access") throw new Error("PROCESS_SANDBOX_UNAVAILABLE");
    const id = processIdV1Schema.parse(`process_${randomUUID().replaceAll("-", "")}`); const generation = randomBytes(6).readUIntBE(0, 6); const context = this.#context(); const startedAt = this.#now();
    const lifetimeMs = input.lifetime_ms ?? 30 * 60_000; const terminal = input.terminal ?? "pipes"; const reservation = this.#quota.reserveProcess(context, id);
    let verificationBefore: PersistentVerificationBeforeV4 = null;
    try {
      verificationBefore = prepared
        ? await this.#execution!.beginPersistentVerification(prepared.verificationBinding)
        : null;
    } catch (error) {
      reservation.release();
      throw error;
    }
    if (
      this.#state !== "open" ||
      this.#revoking ||
      admissionGeneration !== this.#revocationGeneration
    ) {
      reservation.release();
      throw new Error("PROCESS_MANAGER_UNAVAILABLE");
    }
    let settleHandle!: (handle: PersistentProcessHandleV3 | null) => void;
    const handleReady = new Promise<PersistentProcessHandleV3 | null>((resolve) => { settleHandle = resolve; });
    const expiryTimer = setTimeout(() => void this.#terminate(record, "expired"), lifetimeMs);
    expiryTimer.unref?.();
    const record: RecordV3 = { id, generation, context, mode: "full_access", terminal, startedAt, expiresAt: startedAt + lifetimeMs, status: "starting", exitCode: null, verificationReceipt: null, prepared, verificationBefore, ring: new OutputRing(), handle: null, handleReady, settleHandle, lifecyclePromise: null, lifecycleSettled: false, lifecycleFailed: false, lifecycleError: null, terminationPromise: null, terminationSettled: false, verificationRevoked: false, retentionReady: false, release: reservation.release, redactors: { stdout: new StreamingRedactor(), stderr: new StreamingRedactor(), terminal: new StreamingRedactor() }, expiryTimer };
    this.#records.set(id, record);
    try {
      const handle = await this.#backend.start({ processId: id, rawArgs: args, ...(prepared ? { prepared } : {}), command: input.command, cwd: input.cwd, environment: input.environment ?? {}, timeoutMs: input.timeout_ms ?? 30_000, lifetimeMs, terminal,
        onOutput: (stream, bytes) => { if ((record.status !== "starting" && record.status !== "running") || record.lifecyclePromise) return; const redacted = record.redactors[stream].write(bytes); if (!this.#quota.claimOutput(id, redacted.length)) void this.#terminate(record, "output_limit_exceeded"); else record.ring.append(stream, redacted); },
        onExit: (exitCode, reason) => this.#beginExit(record, exitCode, reason) });
      record.handle = handle;
      record.settleHandle(handle);
      if (record.status !== "starting" || record.lifecyclePromise) {
        if (record.lifecyclePromise) await this.#joinLifecycle(record);
        else if (record.terminationPromise) await record.terminationPromise;
        throw new Error("PROCESS_EXPIRED_DURING_START");
      }
      await this.#audit.record(id, generation, "started", "approved_start");
      if (record.status !== "starting" || record.lifecyclePromise || record.terminationPromise) {
        if (record.lifecyclePromise) await this.#joinLifecycle(record);
        else if (record.terminationPromise) await record.terminationPromise;
        throw new Error("PROCESS_EXPIRED_DURING_START");
      }
      record.status = "running";
      record.ring.notifyChange();
      const backend = handle.backend ?? { backendId: "test-double", commandKind: input.command.kind, executableIdentity: "0".repeat(64), terminal };
      const v5 = this.#usesV5Contract();
      const data = { process_id: id, status: "running", ...(v5 ? { state: "running" } : {}), backend: { backend_id: backend.backendId, command_kind: backend.commandKind, executable_identity: backend.executableIdentity, terminal: backend.terminal }, authority: FULL_ACCESS_PROCESS_AUTHORITY_V3, started_at: new Date(startedAt).toISOString(), absolute_expires_at: new Date(record.expiresAt).toISOString() };
      const schema = v5 ? startProcessOutputSchemaV5 : startProcessOutputSchema;
      return schema.parse({ codexgpt_tool: "start_process", codexgpt_title: "Start Process", ok: true, data, error: null, meta: createToolMeta(0, [FULL_ACCESS_PROCESS_WARNING_V3]) }) as Record<string, unknown>;
    } catch (error) {
      record.settleHandle(null);
      clearTimeout(expiryTimer);
      try {
        if (record.lifecyclePromise && !record.lifecycleSettled) await record.lifecyclePromise;
        else if (record.terminationPromise) await record.terminationPromise;
        else await record.handle?.terminate();
      } catch { }
      this.#records.delete(id);
      reservation.release();
      throw error;
    }
  }

  async write(id: string, data: string, close = false): Promise<void> { const record = this.#requireRunning(id); await record.handle!.write(Buffer.from(data), close); }
  async interrupt(id: string): Promise<"delivered" | "unsupported"> { return await this.#requireRunning(id).handle!.interrupt(); }
  async terminate(id: string): Promise<void> { const record = this.#owned(id); if (!record) throw new Error("PROCESS_NOT_FOUND"); if (record.lifecyclePromise) return await this.#joinLifecycle(record); if (record.terminationPromise) return await record.terminationPromise; if (record.status === "terminated") return; await this.#terminate(record, "user_terminated"); }
  hasActiveProcessInRoot(root: string): boolean {
    const canonicalRoot = fs.realpathSync.native(root);
    return [...this.#records.values()].some((record) => {
      if (!record.prepared || !this.#hasActiveLifecycle(record)) return false;
      const cwd = fs.realpathSync.native(record.prepared.cwd);
      const relative = path.relative(canonicalRoot, cwd);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
  }
  async drainActiveProcessesInRoot(root: string): Promise<void> {
    const canonicalRoot = fs.realpathSync.native(root);
    const matches = [...this.#records.values()].filter((record) => {
      if (!record.prepared || !this.#hasActiveLifecycle(record)) return false;
      const cwd = fs.realpathSync.native(record.prepared.cwd);
      const relative = path.relative(canonicalRoot, cwd);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
    const operations = matches.map((record) => {
      if (record.lifecyclePromise) return this.#joinLifecycle(record);
      if (record.terminationPromise && !record.terminationSettled) return record.terminationPromise;
      return this.#terminate(record, "user_terminated");
    });
    await this.#joinOperations(operations);
  }
  async resize(id: string, columns: number, rows: number): Promise<void> { await this.#requireRunning(id).handle!.resize(columns, rows); }

  read(id: string, cursor?: string, maxBytes = 64 * 1024): Record<string, unknown> {
    const record = this.#owned(id);
    if (!record) throw new Error("PROCESS_NOT_FOUND");
    const state = this.#decodeCursor(record, cursor);
    return this.#readResult(record, record.ring.read({ ...state, maxBytes }));
  }
  async readResult(args: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const input = readProcessOutputInputV1Schema.parse(args);
    const record = this.#owned(input.process_id);
    if (!record) throw new Error("PROCESS_NOT_FOUND");
    const state = this.#decodeCursor(record, input.cursor);
    const maxBytes = input.max_bytes ?? 64 * 1024;
    let page = record.ring.read({ ...state, maxBytes });
    if ((input.wait_ms ?? 0) > 0 && this.#hasActiveLifecycle(record) && page.returnedBytes === 0 && !page.eof) {
      await record.ring.waitForChange({ sequence: page.next.sequence, timeoutMs: input.wait_ms, signal });
      if (this.#owned(record.id) !== record) throw new Error("PROCESS_NOT_FOUND");
      page = record.ring.read({ ...page.next, maxBytes });
    }
    return this.#readResult(record, page);
  }
  list(): Record<string, unknown> {
    const v5 = this.#usesV5Contract();
    const processes = [...this.#records.values()]
      .filter((record) => record.context === this.#context() && (v5 || record.status !== "starting"))
      .slice(0, 32)
      .map((record) => ({
        process_id: record.id,
        status: record.status,
        ...(v5 ? { state: record.status } : {}),
        mode: record.mode,
        terminal: record.terminal,
        started_at: new Date(record.startedAt).toISOString(),
        absolute_expires_at: new Date(record.expiresAt).toISOString()
      }));
    const schema = v5 ? listProcessesOutputSchemaV5 : listProcessesOutputSchema;
    return schema.parse({ codexgpt_tool: "list_processes", codexgpt_title: "List Processes", ok: true, data: { processes, process_count: processes.length }, error: null, meta: createToolMeta() }) as Record<string, unknown>;
  }

  async writeResult(args: Record<string, unknown>): Promise<Record<string, unknown>> { const id = String(args.process_id ?? ""); await this.write(id, String(args.data ?? ""), args.close === true); return this.#stateResult(this.#usesV5Contract() ? writeProcessInputOutputSchemaV5 : writeProcessInputOutputSchema, "write_process_input", "Write Process Input", id); }
  async interruptResult(args: Record<string, unknown>): Promise<Record<string, unknown>> { const id = String(args.process_id ?? ""); const delivered = await this.interrupt(id); if (delivered === "unsupported") throw new Error("INTERRUPT_UNSUPPORTED"); return this.#stateResult(this.#usesV5Contract() ? interruptProcessOutputSchemaV5 : interruptProcessOutputSchema, "interrupt_process", "Interrupt Process", id); }
  async terminateResult(args: Record<string, unknown>): Promise<Record<string, unknown>> { const id = String(args.process_id ?? ""); await this.terminate(id); return this.#stateResult(this.#usesV5Contract() ? terminateProcessOutputSchemaV5 : terminateProcessOutputSchema, "terminate_process", "Terminate Process", id); }
  async resizeResult(args: Record<string, unknown>): Promise<Record<string, unknown>> { const id = String(args.process_id ?? ""); await this.resize(id, Number(args.columns), Number(args.rows)); return this.#stateResult(this.#usesV5Contract() ? resizeProcessTerminalOutputSchemaV5 : resizeProcessTerminalOutputSchema, "resize_process_terminal", "Resize Process Terminal", id); }
  localControl() {
    return {
      list: () => [...this.#records.values()].map((r) => ({ processId: r.id, state: r.status, summary: `${r.terminal}; job members only; broker escape resistance none` })),
      terminate: async (processId: string) => { const record = this.#records.get(processId); if (!record || (record.status !== "starting" && record.status !== "running") || record.lifecyclePromise) return false; await this.#terminate(record, "user_terminated", true); return true; }
    };
  }

  async close(reason: "policy_revoked" | "evidence_revoked" | "transport_closed" | "lease_revoked" = "transport_closed"): Promise<void> {
    if (this.#closePromise) return await this.#closePromise;
    this.#state = "closing";
    this.#closePromise = (async () => {
      let closeError: unknown;
      try {
        await this.revokeAll(reason);
      } catch (error) {
        closeError = error;
      } finally {
        for (const record of [...this.#records.values()]) {
          clearTimeout(record.expiryTimer);
          if (record.terminalTimer) clearTimeout(record.terminalTimer);
          record.release();
          this.#records.delete(record.id);
        }
        this.#cursor.dispose();
        this.#state = "closed";
      }
      if (closeError) throw closeError;
    })();
    return await this.#closePromise;
  }
  async revokeAll(reason: "policy_revoked" | "evidence_revoked" | "transport_closed" | "lease_revoked" = "policy_revoked"): Promise<void> {
    if (this.#revocationPromise) return await this.#revocationPromise;
    this.#revoking = true;
    this.#revocationGeneration += 1;
    const starts = [...this.#starting];
    const records = [...this.#records.values()];
    for (const record of records) record.verificationRevoked = true;
    const operations = records.map((record) => {
      if (record.lifecyclePromise) return this.#joinLifecycle(record);
      if (record.terminationPromise && !record.terminationSettled) return record.terminationPromise;
      if (record.status === "starting" || record.status === "running") return this.#terminate(record, reason);
      return Promise.resolve();
    });
    this.#revocationPromise = this.#joinOperations([...starts, ...operations]).finally(() => {
      this.#revoking = false;
      this.#revocationPromise = null;
    });
    return await this.#revocationPromise;
  }
  owns(id: string): boolean { return this.#owned(id) !== null; }
  #owned(id: string): RecordV3 | null { const r = this.#records.get(id); return r && r.context === this.#context() ? r : null; }
  #requireRunning(id: string): RecordV3 { const r = this.#owned(id); if (!r || r.status !== "running" || r.lifecyclePromise || !r.handle) throw new Error("PROCESS_NOT_FOUND"); return r; }
  #decodeCursor(record: RecordV3, cursor?: string): OutputRingCursor { return cursor ? this.#cursor.decode(cursor, { processId: record.id, generation: record.generation, contextFingerprint: record.context }) : { sequence: 0, offset: 0 }; }
  #readResult(record: RecordV3, page: OutputRingPage): Record<string, unknown> { const output = { chunks: page.chunks, next_cursor: page.eof ? null : this.#cursor.encode({ processId: record.id, generation: record.generation, sequence: page.next.sequence, offset: page.next.offset, contextFingerprint: record.context, expiresAt: record.expiresAt }), truncated: page.truncated, eof: page.eof, returned_bytes: page.returnedBytes }; const v4 = Boolean(this.#execution && contractIncludesV4(this.#execution.toolContractVersion)); const v5 = this.#usesV5Contract(); const data = { process_id: record.id, status: record.status, ...(v5 ? { state: record.status } : {}), output, ...(v4 ? { exit_code: record.exitCode, verification_receipt: record.verificationReceipt } : {}) }; const schema = v5 ? readProcessOutputOutputSchemaV5 : v4 ? readProcessOutputOutputSchemaV4 : readProcessOutputOutputSchema; return schema.parse({ codexgpt_tool: "read_process_output", codexgpt_title: "Read Process Output", ok: true, data, error: null, meta: createToolMeta() }) as Record<string, unknown>; }
  #stateResult(schema: { parse(value: unknown): unknown }, tool: string, title: string, id: string): Record<string, unknown> { const record = this.#owned(id); if (!record) throw new Error("PROCESS_NOT_FOUND"); return schema.parse({ codexgpt_tool: tool, codexgpt_title: title, ok: true, data: { process_id: id, status: record.status, ...(this.#usesV5Contract() ? { state: record.status } : {}) }, error: null, meta: createToolMeta() }) as Record<string, unknown>; }
  #usesV5Contract(): boolean { return Boolean(this.#execution && contractIncludesV5(this.#execution.toolContractVersion)); }
  #hasActiveLifecycle(r: RecordV3): boolean {
    return r.status === "starting" || r.status === "running" ||
      Boolean(r.lifecyclePromise && !r.lifecycleSettled) ||
      Boolean(r.terminationPromise && !r.terminationSettled);
  }
  async #joinLifecycle(r: RecordV3): Promise<void> {
    if (r.lifecyclePromise) await r.lifecyclePromise;
    if (r.lifecycleFailed) throw r.lifecycleError;
  }
  async #joinOperations(operations: Array<Promise<void>>): Promise<void> {
    const results = await Promise.allSettled(operations);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length === 1) throw failures[0].reason;
    if (failures.length > 1) throw new AggregateError(failures.map((failure) => failure.reason), "PROCESS_LIFECYCLE_FAILED");
  }
  #beginExit(r: RecordV3, exitCode: number | null, reason: string): void {
    if (r.lifecyclePromise || (r.status !== "starting" && r.status !== "running")) return;
    let settleLifecycle!: () => void;
    r.lifecyclePromise = new Promise<void>((resolve) => { settleLifecycle = resolve; });
    void this.#exit(r, exitCode, reason)
      .catch((error) => {
        r.status = "failed";
        r.verificationReceipt = null;
        r.lifecycleFailed = true;
        r.lifecycleError = error;
      })
      .finally(() => {
        r.lifecycleSettled = true;
        if (this.#records.get(r.id) === r && !r.terminalTimer) this.#retainTerminal(r);
        settleLifecycle();
      });
  }
  async #exit(r: RecordV3, exitCode: number | null, reason: string): Promise<void> {
    if (r.status !== "starting" && r.status !== "running") return;
    clearTimeout(r.expiryTimer);
    this.#flushRedactors(r);
    const transition = reason === "host_crashed" ? "host_crashed"
      : reason === "expired" ? "expired"
      : "exited";
    r.status = transition === "host_crashed" ? "failed" : transition === "expired" ? "terminated" : "exited";
    r.exitCode = exitCode;
    r.ring.notifyChange();
    let verificationAfter = null;
    const naturalSuccess = transition === "exited" &&
      exitCode === 0 &&
      (reason === "natural_exit" || reason === "exited");
    if (
      naturalSuccess &&
      this.#execution &&
      r.prepared?.verificationBinding &&
      r.verificationBefore
    ) {
      try {
        verificationAfter = await this.#execution.completePersistentVerification(
          r.prepared.verificationBinding,
          r.verificationBefore
        );
      } catch {
        verificationAfter = null;
      }
    }
    let terminalAudit;
    const lifecycleFailures: unknown[] = [];
    try {
      terminalAudit = await this.#audit.record(r.id, r.generation, transition, reason);
      if (transition !== "exited") await this.#audit.record(r.id, r.generation, "cleanup_completed", reason);
    } catch (error) {
      lifecycleFailures.push(error);
    }
    try {
      this.#reserveTerminal(r);
    } catch (error) {
      lifecycleFailures.push(error);
    }
    if (lifecycleFailures.length === 0 &&
      verificationAfter &&
      this.#execution &&
      r.prepared?.verificationBinding &&
      terminalAudit &&
      !r.verificationRevoked &&
      this.#records.get(r.id) === r &&
      exitCode === 0
    ) {
      try {
        r.verificationReceipt = this.#execution.issuePersistentVerificationReceipt(
          r.prepared.verificationBinding,
          verificationAfter,
          r.prepared.resource,
          terminalAudit,
          exitCode
        );
      } catch {
        r.verificationReceipt = null;
      }
    }
    if (lifecycleFailures.length > 0) {
      r.status = "failed";
      r.verificationReceipt = null;
    }
    r.retentionReady = true;
    r.ring.close();
    if (lifecycleFailures.length === 1) throw lifecycleFailures[0];
    if (lifecycleFailures.length > 1) throw new AggregateError(lifecycleFailures, "PROCESS_LIFECYCLE_FAILED");
  }
  async #terminate(r: RecordV3, reason: string, bestEffortAudit = false): Promise<void> {
    if (r.terminationPromise) return r.terminationPromise;
    if (r.status !== "starting" && r.status !== "running") return;
    clearTimeout(r.expiryTimer);
    r.status = "terminated";
    r.ring.notifyChange();
    r.terminationPromise = (async () => {
      try {
      let terminationError: unknown;
      try {
        const handle = r.handle ?? await r.handleReady;
        await handle?.terminate();
      } catch (error) {
        terminationError = error;
        r.status = "failed";
      }
      this.#flushRedactors(r);
      const transition = terminationError ? "host_crashed"
        : reason === "user_terminated" ? "user_terminated"
        : reason === "output_limit_exceeded" ? "output_limit_exceeded"
        : reason === "expired" ? "expired"
        : reason === "policy_revoked" ? "policy_revoked"
        : reason === "evidence_revoked" ? "evidence_revoked"
        : reason === "lease_revoked" ? "lease_revoked"
        : reason === "host_crashed" ? "host_crashed"
        : "transport_closed";
      const lifecycleFailures: unknown[] = terminationError ? [terminationError] : [];
      try {
        await this.#audit.record(r.id, r.generation, transition, reason);
        await this.#audit.record(r.id, r.generation, "cleanup_completed", reason);
      } catch (error) {
        if (!bestEffortAudit) lifecycleFailures.push(error);
      }
      try {
        this.#reserveTerminal(r);
      } catch (error) {
        lifecycleFailures.push(error);
      }
      if (lifecycleFailures.length > 0) r.status = "failed";
      r.retentionReady = true;
      r.ring.close();
      if (lifecycleFailures.length === 1) throw lifecycleFailures[0];
      if (lifecycleFailures.length > 1) throw new AggregateError(lifecycleFailures, "PROCESS_LIFECYCLE_FAILED");
      } finally {
        r.terminationSettled = true;
        if (this.#records.get(r.id) === r && !r.terminalTimer) this.#retainTerminal(r);
      }
    })();
    return r.terminationPromise;
  }
  #retainTerminal(r: RecordV3): void {
    r.terminalTimer = setTimeout(() => {
      if (this.#records.get(r.id) !== r) return;
      r.release();
      this.#records.delete(r.id);
    }, 5 * 60_000);
    r.terminalTimer.unref?.();
  }
  #flushRedactors(r: RecordV3): void {
    for (const [stream, redactor] of Object.entries(r.redactors) as Array<["stdout" | "stderr" | "terminal", StreamingRedactor]>) {
      const tail = redactor.end();
      if (tail.length) r.ring.append(stream, tail);
    }
  }
  #reserveTerminal(r: RecordV3): void {
    while (true) {
      try {
        this.#quota.reserveTerminal(r.id);
        return;
      } catch (error) {
        if (!isOutputTerminalQuotaExceededError(error)) throw error;
        const scope = error.scope;
        const oldest = [...this.#records.values()]
          .filter((candidate) => candidate !== r && candidate.retentionReady && (scope === "server" || candidate.context === r.context))
          .sort((a, b) => a.startedAt - b.startedAt)[0];
        if (!oldest) {
          throw error;
        }
        if (oldest.terminalTimer) clearTimeout(oldest.terminalTimer);
        oldest.release();
        this.#records.delete(oldest.id);
      }
    }
  }
}
