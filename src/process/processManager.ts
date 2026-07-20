import { randomBytes, randomUUID } from "node:crypto";
import { describeProcessActionResourceV3 } from "../policy/executionResources.js";
import type { ResourceResolutionResult, ToolResourceResolver } from "../policy/integration.js";
import type { ResourceDescriptorV1 } from "../policy/types.js";
import { createToolMeta } from "../tools/schemas/common.js";
import { interruptProcessOutputSchema, listProcessesOutputSchema, processIdV1Schema, readProcessOutputOutputSchema, readProcessOutputOutputSchemaV4, resizeProcessTerminalOutputSchema, startProcessInputV1Schema, startProcessInputV4Schema, startProcessOutputSchema, terminateProcessOutputSchema, writeProcessInputOutputSchema } from "../tools/schemas/execution.js";
import { OutputCursorCodec } from "./outputCursor.js";
import { OutputQuotaManager } from "./outputQuota.js";
import { OutputRing } from "./outputRing.js";
import { ProcessAuditCoordinatorV3 } from "./processAuditCoordinator.js";
import { StreamingRedactor } from "./streamingRedactor.js";
import path from "node:path";
import fs from "node:fs";
import type { RunCommandRuntimeV3 } from "./runCommand.js";
import {
  FULL_ACCESS_PROCESS_AUTHORITY_V3,
  FULL_ACCESS_PROCESS_WARNING_V3
} from "./authority.js";

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
  startedAt: number; expiresAt: number; status: "running" | "exited" | "failed" | "terminated";
  exitCode: number | null; verificationReceipt: string | null;
  prepared: PreparedPersistentExecutionV4 | null; verificationBefore: PersistentVerificationBeforeV4;
  ring: OutputRing; handle: PersistentProcessHandleV3 | null; release(): void; redactors: Record<"stdout" | "stderr" | "terminal", StreamingRedactor>;
  handleReady: Promise<PersistentProcessHandleV3 | null>;
  settleHandle(handle: PersistentProcessHandleV3 | null): void;
  terminationPromise: Promise<void> | null;
  terminationSettled: boolean;
  expiryTimer: NodeJS.Timeout;
  terminalTimer?: NodeJS.Timeout;
}

export class ProcessManagerV3 implements ToolResourceResolver {
  readonly #backend: PersistentProcessBackendV3; readonly #context: () => string; readonly #audit: ProcessAuditCoordinatorV3;
  readonly #execution: PersistentExecutionRuntimeV4 | null;
  readonly #startResolver: ToolResourceResolver;
  readonly #quota: OutputQuotaManager; readonly #cursor: OutputCursorCodec; readonly #records = new Map<string, RecordV3>(); readonly #now: () => number;

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
    const prepared = this.#execution?.preparePersistent(args) ?? null;
    const input = this.#execution?.toolContractVersion === 4
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
    let settleHandle!: (handle: PersistentProcessHandleV3 | null) => void;
    const handleReady = new Promise<PersistentProcessHandleV3 | null>((resolve) => { settleHandle = resolve; });
    const expiryTimer = setTimeout(() => void this.#terminate(record, "expired"), lifetimeMs);
    expiryTimer.unref?.();
    const record: RecordV3 = { id, generation, context, mode: "full_access", terminal, startedAt, expiresAt: startedAt + lifetimeMs, status: "running", exitCode: null, verificationReceipt: null, prepared, verificationBefore, ring: new OutputRing(), handle: null, handleReady, settleHandle, terminationPromise: null, terminationSettled: false, release: reservation.release, redactors: { stdout: new StreamingRedactor(), stderr: new StreamingRedactor(), terminal: new StreamingRedactor() }, expiryTimer };
    this.#records.set(id, record);
    try {
      const handle = await this.#backend.start({ processId: id, rawArgs: args, ...(prepared ? { prepared } : {}), command: input.command, cwd: input.cwd, environment: input.environment ?? {}, timeoutMs: input.timeout_ms ?? 30_000, lifetimeMs, terminal,
        onOutput: (stream, bytes) => { if (record.status !== "running") return; const redacted = record.redactors[stream].write(bytes); if (!this.#quota.claimOutput(id, redacted.length)) void this.#terminate(record, "output_limit_exceeded"); else record.ring.append(stream, redacted); },
        onExit: (exitCode, reason) => void this.#exit(record, exitCode, reason).catch(() => { record.status = "failed"; }) });
      record.handle = handle;
      record.settleHandle(handle);
      if (record.status !== "running") {
        await record.terminationPromise;
        throw new Error("PROCESS_EXPIRED_DURING_START");
      }
      await this.#audit.record(id, generation, "started", "approved_start");
      const backend = handle.backend ?? { backendId: "test-double", commandKind: input.command.kind, executableIdentity: "0".repeat(64), terminal };
      const data = { process_id: id, status: "running", backend: { backend_id: backend.backendId, command_kind: backend.commandKind, executable_identity: backend.executableIdentity, terminal: backend.terminal }, authority: FULL_ACCESS_PROCESS_AUTHORITY_V3, started_at: new Date(startedAt).toISOString(), absolute_expires_at: new Date(record.expiresAt).toISOString() };
      return startProcessOutputSchema.parse({ codexgpt_tool: "start_process", codexgpt_title: "Start Process", ok: true, data, error: null, meta: createToolMeta(0, [FULL_ACCESS_PROCESS_WARNING_V3]) }) as Record<string, unknown>;
    } catch (error) {
      record.settleHandle(null);
      clearTimeout(expiryTimer);
      try {
        if (record.terminationPromise) await record.terminationPromise;
        else await record.handle?.terminate();
      } catch { }
      this.#records.delete(id);
      reservation.release();
      throw error;
    }
  }

  async write(id: string, data: string, close = false): Promise<void> { const record = this.#requireRunning(id); await record.handle!.write(Buffer.from(data), close); }
  async interrupt(id: string): Promise<"delivered" | "unsupported"> { return await this.#requireRunning(id).handle!.interrupt(); }
  async terminate(id: string): Promise<void> { const record = this.#owned(id); if (!record) throw new Error("PROCESS_NOT_FOUND"); if (record.terminationPromise) return await record.terminationPromise; if (record.status === "terminated") return; await this.#terminate(record, "user_terminated"); }
  hasActiveProcessInRoot(root: string): boolean {
    const canonicalRoot = fs.realpathSync.native(root);
    return [...this.#records.values()].some((record) => {
      if ((record.status !== "running" && (record.terminationSettled || !record.terminationPromise)) || !record.prepared) return false;
      const cwd = fs.realpathSync.native(record.prepared.cwd);
      const relative = path.relative(canonicalRoot, cwd);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
  }
  async drainActiveProcessesInRoot(root: string): Promise<void> {
    const canonicalRoot = fs.realpathSync.native(root);
    const matches = [...this.#records.values()].filter((record) => {
      if ((record.status !== "running" && (record.terminationSettled || !record.terminationPromise)) || !record.prepared) return false;
      const cwd = fs.realpathSync.native(record.prepared.cwd);
      const relative = path.relative(canonicalRoot, cwd);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
    for (const record of matches) {
      if (record.terminationPromise) await record.terminationPromise;
      else await this.#terminate(record, "user_terminated");
    }
  }
  async resize(id: string, columns: number, rows: number): Promise<void> { await this.#requireRunning(id).handle!.resize(columns, rows); }

  read(id: string, cursor?: string, maxBytes = 64 * 1024): Record<string, unknown> { const r = this.#owned(id); if (!r) throw new Error("PROCESS_NOT_FOUND"); const state = cursor ? this.#cursor.decode(cursor, { processId: id, generation: r.generation, contextFingerprint: r.context }) : { sequence: 0, offset: 0 }; const page = r.ring.read({ sequence: state.sequence, offset: state.offset, maxBytes }); const output = { chunks: page.chunks, next_cursor: page.eof ? null : this.#cursor.encode({ processId: id, generation: r.generation, sequence: page.next.sequence, offset: 0, contextFingerprint: r.context, expiresAt: r.expiresAt }), truncated: page.truncated, eof: page.eof, returned_bytes: page.returnedBytes }; const v4 = this.#execution?.toolContractVersion === 4; const data = { process_id: id, status: r.status, output, ...(v4 ? { exit_code: r.exitCode, verification_receipt: r.verificationReceipt } : {}) }; const schema = v4 ? readProcessOutputOutputSchemaV4 : readProcessOutputOutputSchema; return schema.parse({ codexgpt_tool: "read_process_output", codexgpt_title: "Read Process Output", ok: true, data, error: null, meta: createToolMeta() }) as Record<string, unknown>; }
  list(): Record<string, unknown> { const processes = [...this.#records.values()].filter((r) => r.context === this.#context()).slice(0, 32).map((r) => ({ process_id: r.id, status: r.status, mode: r.mode, terminal: r.terminal, started_at: new Date(r.startedAt).toISOString(), absolute_expires_at: new Date(r.expiresAt).toISOString() })); return listProcessesOutputSchema.parse({ codexgpt_tool: "list_processes", codexgpt_title: "List Processes", ok: true, data: { processes, process_count: processes.length }, error: null, meta: createToolMeta() }) as Record<string, unknown>; }

  async writeResult(args: Record<string, unknown>): Promise<Record<string, unknown>> { const id = String(args.process_id ?? ""); await this.write(id, String(args.data ?? ""), args.close === true); return this.#stateResult(writeProcessInputOutputSchema, "write_process_input", "Write Process Input", id); }
  async interruptResult(args: Record<string, unknown>): Promise<Record<string, unknown>> { const id = String(args.process_id ?? ""); const delivered = await this.interrupt(id); if (delivered === "unsupported") throw new Error("INTERRUPT_UNSUPPORTED"); return this.#stateResult(interruptProcessOutputSchema, "interrupt_process", "Interrupt Process", id); }
  async terminateResult(args: Record<string, unknown>): Promise<Record<string, unknown>> { const id = String(args.process_id ?? ""); await this.terminate(id); return this.#stateResult(terminateProcessOutputSchema, "terminate_process", "Terminate Process", id); }
  async resizeResult(args: Record<string, unknown>): Promise<Record<string, unknown>> { const id = String(args.process_id ?? ""); await this.resize(id, Number(args.columns), Number(args.rows)); return this.#stateResult(resizeProcessTerminalOutputSchema, "resize_process_terminal", "Resize Process Terminal", id); }
  localControl() {
    return {
      list: () => [...this.#records.values()].map((r) => ({ processId: r.id, state: r.status, summary: `${r.terminal}; job members only; broker escape resistance none` })),
      terminate: async (processId: string) => { const record = this.#records.get(processId); if (!record || record.status !== "running") return false; await this.#terminate(record, "user_terminated", true); return true; }
    };
  }

  async close(reason: "policy_revoked" | "evidence_revoked" | "transport_closed" | "lease_revoked" = "transport_closed"): Promise<void> {
    await this.revokeAll(reason);
    for (const record of [...this.#records.values()]) {
      clearTimeout(record.expiryTimer);
      if (record.terminalTimer) clearTimeout(record.terminalTimer);
      record.release();
      this.#records.delete(record.id);
    }
    this.#cursor.dispose();
  }
  async revokeAll(reason: "policy_revoked" | "evidence_revoked" | "transport_closed" | "lease_revoked" = "policy_revoked"): Promise<void> {
    for (const record of [...this.#records.values()]) {
      if (record.terminationPromise && !record.terminationSettled) await record.terminationPromise;
      else if (record.status === "running") await this.#terminate(record, reason);
    }
  }
  owns(id: string): boolean { return this.#owned(id) !== null; }
  #owned(id: string): RecordV3 | null { const r = this.#records.get(id); return r && r.context === this.#context() ? r : null; }
  #requireRunning(id: string): RecordV3 { const r = this.#owned(id); if (!r || r.status !== "running" || !r.handle) throw new Error("PROCESS_NOT_FOUND"); return r; }
  #stateResult(schema: { parse(value: unknown): unknown }, tool: string, title: string, id: string): Record<string, unknown> { const record = this.#owned(id); if (!record) throw new Error("PROCESS_NOT_FOUND"); return schema.parse({ codexgpt_tool: tool, codexgpt_title: title, ok: true, data: { process_id: id, status: record.status }, error: null, meta: createToolMeta() }) as Record<string, unknown>; }
  async #exit(r: RecordV3, exitCode: number | null, reason: string): Promise<void> {
    if (r.status !== "running") return;
    clearTimeout(r.expiryTimer);
    this.#flushRedactors(r);
    const transition = reason === "host_crashed" ? "host_crashed"
      : reason === "expired" ? "expired"
      : "exited";
    r.status = transition === "host_crashed" ? "failed" : transition === "expired" ? "terminated" : "exited";
    r.exitCode = exitCode;
    r.ring.close();
    this.#reserveTerminal(r);
    this.#retainTerminal(r);
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
    const terminalAudit = await this.#audit.record(r.id, r.generation, transition, reason);
    if (
      verificationAfter &&
      this.#execution &&
      r.prepared?.verificationBinding &&
      terminalAudit &&
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
    if (transition !== "exited") await this.#audit.record(r.id, r.generation, "cleanup_completed", reason);
  }
  async #terminate(r: RecordV3, reason: string, bestEffortAudit = false): Promise<void> {
    if (r.terminationPromise) return r.terminationPromise;
    if (r.status !== "running") return;
    clearTimeout(r.expiryTimer);
    r.status = "terminated";
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
      r.ring.close();
      this.#reserveTerminal(r);
      this.#retainTerminal(r);
      const transition = terminationError ? "host_crashed"
        : reason === "user_terminated" ? "user_terminated"
        : reason === "output_limit_exceeded" ? "output_limit_exceeded"
        : reason === "expired" ? "expired"
        : reason === "policy_revoked" ? "policy_revoked"
        : reason === "evidence_revoked" ? "evidence_revoked"
        : reason === "lease_revoked" ? "lease_revoked"
        : reason === "host_crashed" ? "host_crashed"
        : "transport_closed";
      try {
        await this.#audit.record(r.id, r.generation, transition, reason);
        await this.#audit.record(r.id, r.generation, "cleanup_completed", reason);
      } catch (error) {
        if (!bestEffortAudit) throw error;
      }
      if (terminationError) throw terminationError;
      } finally {
        r.terminationSettled = true;
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
        const oldest = [...this.#records.values()]
          .filter((candidate) => candidate !== r && candidate.status !== "running")
          .sort((a, b) => a.startedAt - b.startedAt)[0];
        if (!oldest) {
          r.release();
          this.#records.delete(r.id);
          throw error;
        }
        if (oldest.terminalTimer) clearTimeout(oldest.terminalTimer);
        oldest.release();
        this.#records.delete(oldest.id);
      }
    }
  }
}
