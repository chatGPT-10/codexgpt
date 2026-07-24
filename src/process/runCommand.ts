import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CodexGPTConfig } from "../config.js";
import { authorizedResourceFingerprint, type ResourceResolutionResult, type ToolResourceResolver } from "../policy/integration.js";
import type { ResourceDescriptorV1 } from "../policy/types.js";
import { semanticDigest } from "../policy/authorizationFacts.js";
import { describeExecutionResourceV3, describeProcessActionResourceV3, resolveEffectiveEnvironmentV3 } from "../policy/executionResources.js";
import { assertFullAccessProfileEligibleV3, type FullAccessProfileV3 } from "../policy/fullAccessResources.js";
import { createToolMeta } from "../tools/schemas/common.js";
import {
  readProcessOutputOutputSchema,
  readProcessOutputOutputSchemaV4,
  runCommandInputV1Schema,
  runCommandInputV4Schema,
  runCommandOutputSchema,
  runCommandOutputSchemaV4,
  startProcessInputV1Schema,
  startProcessInputV4Schema
} from "../tools/schemas/execution.js";
import { attachExecutionAuditFacts } from "../audit/transactionParticipant.js";
import type {
  CandidateCleanEvidenceV4,
  CandidateExecutionBindingV4,
  CandidateVerificationWorkspaceV4
} from "../worktrees/candidateWorkspace.js";
import {
  attachPendingVerificationReceipt,
  type PersistedTerminalAuditEvidenceV4
} from "../worktrees/verificationTerminal.js";
import { compileCommandForWindowsHost } from "./commandCompiler.js";
import { OutputCursorCodec } from "./outputCursor.js";
import { OutputQuotaManager } from "./outputQuota.js";
import { OutputRing } from "./outputRing.js";
import { StreamingRedactor } from "./streamingRedactor.js";
import { contractIncludesV4 } from "../tools/contracts/index.js";
import {
  FULL_ACCESS_PROCESS_AUTHORITY_V3,
  FULL_ACCESS_PROCESS_WARNING_V3
} from "./authority.js";
import type { CommandSpecV1, WindowsExecutableBindingV1 } from "./types.js";
import type { WindowsProcessHostRuntime } from "./windowsHostClient.js";

const TERMINAL_TTL_MS = 5 * 60_000;
const FIRST_PAGE_BYTES = 64 * 1024;

interface TerminalRecord {
  processId: string;
  generation: number;
  contextFingerprint: string;
  ring: OutputRing;
  status: "exited" | "failed" | "terminated";
  exitCode: number | null;
  verificationReceipt: string | null;
  expiresAt: number;
  release(): void;
}

export interface PersistentVerificationResourceFactsV4 {
  commandDigest: string;
  resourceFingerprint: string;
  backendId: string | null;
  backendVersion: string | null;
  executableIdentity: string;
  effectiveEnvironmentDigest: string;
  absoluteCwdIdentity: string;
  policyRevision: string | null;
}

export interface RunCommandRuntimeV3Options {
  config: Pick<CodexGPTConfig, "executionProfile" | "defaultRoot" | "toolContractVersion">;
  fullAccessProfile: FullAccessProfileV3;
  hostRuntime: Pick<WindowsProcessHostRuntime, "get">;
  contextFingerprint: () => string;
  policyRevision: () => string;
  evidenceRevision: () => string;
  backendResolver?: (command: CommandSpecV1) => WindowsExecutableBindingV1;
  cwdIdentity?: (cwd: string) => string;
  processId?: () => string;
  now?: () => number;
  cursorKey?: Buffer;
}

function fileBinding(filePath: string, kind: WindowsExecutableBindingV1["kind"], backendId: string): WindowsExecutableBindingV1 {
  const realPath = fs.realpathSync.native(filePath);
  const stat = fs.statSync(realPath, { bigint: true });
  if (!stat.isFile()) throw new Error("BACKEND_UNAVAILABLE");
  if (stat.size > 512n * 1024n * 1024n) throw new Error("BACKEND_UNAVAILABLE");
  const hash = createHash("sha256");
  const handle = fs.openSync(realPath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    for (;;) {
      const bytes = fs.readSync(handle, buffer, 0, buffer.length, position);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
      position += bytes;
    }
  } finally {
    fs.closeSync(handle);
  }
  const sha256 = hash.digest("hex");
  return Object.freeze({ schemaVersion: 1, backendId, backendVersion: "bound", kind, source: "reviewed_explicit", path: realPath, realPath, sha256, identity: `sha256:${sha256}:dev:${stat.dev}:ino:${stat.ino}` });
}

function defaultBackend(command: CommandSpecV1): WindowsExecutableBindingV1 {
  if (command.kind === "argv") {
    if (!path.win32.isAbsolute(command.executable) && !path.isAbsolute(command.executable)) throw new Error("BACKEND_UNAVAILABLE");
    return fileBinding(command.executable, "argv", "reviewed-explicit-argv");
  }
  const drive = path.parse(process.execPath).root.replace(/[\\/]$/, "");
  if (command.kind === "powershell") {
    const core = path.join(`${drive}\\`, "Program Files", "PowerShell", "7", "pwsh.exe");
    const windows = path.join(`${drive}\\`, "Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const selected = command.edition === "windows" ? windows : command.edition === "core" ? core : fs.existsSync(core) ? core : windows;
    return fileBinding(selected, "powershell", selected === windows ? "windows-powershell" : "powershell-core");
  }
  throw new Error("BACKEND_UNAVAILABLE");
}

export class RunCommandRuntimeV3 implements ToolResourceResolver {
  readonly #options: RunCommandRuntimeV3Options;
  readonly #cursor: OutputCursorCodec;
  readonly #quota = new OutputQuotaManager();
  readonly #records = new Map<string, TerminalRecord>();
  readonly #now: () => number;
  #candidateWorkspaces: CandidateVerificationWorkspaceV4 | null = null;

  constructor(options: RunCommandRuntimeV3Options) {
    if (options.config.executionProfile !== "full_access") throw new Error("EXECUTION_PROFILE_DISABLED");
    assertFullAccessProfileEligibleV3(options.fullAccessProfile);
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#cursor = new OutputCursorCodec({ key: options.cursorKey ?? randomBytes(32), now: this.#now });
  }

  setCandidateVerificationWorkspace(runtime: CandidateVerificationWorkspaceV4): void {
    if (this.#candidateWorkspaces) throw new Error("MERGE_CHECKS_REQUIRED");
    this.#candidateWorkspaces = runtime;
  }

  get toolContractVersion(): 3 | 4 {
    return contractIncludesV4(this.#options.config.toolContractVersion) ? 4 : 3;
  }

  async beginPersistentVerification(
    binding: CandidateExecutionBindingV4 | null
  ): Promise<CandidateCleanEvidenceV4 | null> {
    if (!binding) return null;
    if (!this.#candidateWorkspaces) throw new Error("MERGE_CHECKS_REQUIRED");
    return this.#candidateWorkspaces.beginExecution(binding);
  }

  async completePersistentVerification(
    binding: CandidateExecutionBindingV4,
    before: CandidateCleanEvidenceV4
  ): Promise<CandidateCleanEvidenceV4> {
    if (!this.#candidateWorkspaces) throw new Error("MERGE_CHECKS_REQUIRED");
    return this.#candidateWorkspaces.completeExecution(binding, before);
  }

  issuePersistentVerificationReceipt(
    binding: CandidateExecutionBindingV4,
    clean: CandidateCleanEvidenceV4,
    resource: PersistentVerificationResourceFactsV4,
    audit: PersistedTerminalAuditEvidenceV4,
    exitCode: number
  ): string {
    if (
      !this.#candidateWorkspaces ||
      exitCode !== 0 ||
      !resource.backendId ||
      !resource.backendVersion ||
      !resource.policyRevision
    ) throw new Error("MERGE_CHECKS_REQUIRED");
    return this.#candidateWorkspaces.issueReceipt(binding, clean, {
      commandDigest: resource.commandDigest,
      commandResourceFingerprint: resource.resourceFingerprint,
      backendId: resource.backendId,
      backendVersion: resource.backendVersion,
      executableIdentity: resource.executableIdentity,
      effectiveEnvironmentDigest: resource.effectiveEnvironmentDigest,
      cwdIdentity: resource.absoluteCwdIdentity,
      policyRevision: resource.policyRevision,
      terminalAuditEventId: audit.eventId,
      exitCode
    });
  }

  #resolve(args: Record<string, unknown>, operation: "run_command" | "start_process" = "run_command") {
    const persistentInput = operation === "start_process"
      ? (contractIncludesV4(this.toolContractVersion)
          ? startProcessInputV4Schema.parse(args)
          : startProcessInputV1Schema.parse(args))
      : null;
    const input = persistentInput ?? (contractIncludesV4(this.#options.config.toolContractVersion)
      ? runCommandInputV4Schema.parse(args)
      : runCommandInputV1Schema.parse(args));
    if (input.mode !== "full_access") throw new Error("PROCESS_SANDBOX_UNAVAILABLE");
    const command = input.command as CommandSpecV1;
    const backend = (this.#options.backendResolver ?? defaultBackend)(command);
    const verificationRequest = ("verification" in input ? input.verification : undefined) as
      | { merge_plan_id: string; integration_workspace_id: string; category: string }
      | undefined;
    if (
      verificationRequest &&
      (input.mode !== "full_access" || input.cwd.kind !== "workspace" || input.cwd.path !== undefined)
    ) throw new Error("MERGE_CHECKS_REQUIRED");
    const verificationBinding: CandidateExecutionBindingV4 | null = verificationRequest
      ? this.#candidateWorkspaces?.describeExecution({
          mergePlanId: verificationRequest.merge_plan_id,
          integrationWorkspaceId: verificationRequest.integration_workspace_id,
          category: verificationRequest.category
        }) ?? (() => { throw new Error("MERGE_CHECKS_REQUIRED"); })()
      : null;
    const cwd = verificationBinding
      ? verificationBinding.cwd
      : input.cwd.kind === "absolute_local"
        ? path.resolve(input.cwd.path)
        : path.resolve(this.#options.config.defaultRoot, input.cwd.path ?? ".");
    const effective = resolveEffectiveEnvironmentV3({ base: {}, overrides: input.environment ?? {}, platform: "win32" });
    const deadlineMs = input.timeout_ms ?? 30_000;
    const cwdIdentity = this.#options.cwdIdentity?.(cwd) ?? semanticDigest({ cwd: fs.realpathSync.native(cwd) });
    const lifetimeMs = persistentInput ? persistentInput.lifetime_ms ?? 30 * 60_000 : deadlineMs;
    const terminal = persistentInput ? persistentInput.terminal ?? "pipes" : "none";
    const resource = describeExecutionResourceV3({
      operation, command, effectiveEnvironmentDigest: effective.digest, logicalCwd: cwd,
      absoluteCwdIdentity: cwdIdentity, backend: { backendId: backend.backendId, backendVersion: backend.backendVersion, executableIdentity: `sha256:${backend.sha256}` },
      terminal, deadlineMs, lifetimeMs, networkPosture: "unrestricted_host", accessMode: "full_access",
      workspaceId: null, leaseId: null, snapshotId: null, contractVersion: 3,
      policyRevision: this.#options.policyRevision(), evidenceRevision: this.#options.evidenceRevision(),
      identityRevision: this.#options.contextFingerprint(), transportRevision: this.#options.contextFingerprint()
      ,
      ...(verificationBinding ? {
        verification: {
          mergePlanId: verificationBinding.record.mergePlanId,
          integrationWorkspaceId: verificationBinding.record.integrationWorkspaceId,
          category: verificationBinding.request.category,
          taskWorktreeId: verificationBinding.record.taskWorktreeId,
          taskGeneration: verificationBinding.record.taskGeneration,
          repositoryId: verificationBinding.record.repositoryId,
          candidateOid: verificationBinding.record.candidateOid,
          candidateTreeOid: verificationBinding.record.candidateTreeOid,
          manifestDigest: `sha256:${verificationBinding.record.manifestDigest}`,
          rootIdentity: `sha256:${verificationBinding.record.rootIdentity}`
        }
      } : {})
    });
    return { input, command, backend, cwd, effective, deadlineMs, lifetimeMs, terminal, resource, verificationBinding };
  }

  describe(toolName: string, args: Record<string, unknown>): ResourceResolutionResult {
    this.#purge();
    if (toolName === "run_command" || toolName === "start_process") {
      const resolved = this.#resolve(args, toolName);
      return { resource: resolved.resource as unknown as ResourceDescriptorV1, semanticFactsDigest: resolved.resource.semanticFactsDigest, riskClass: "R3" as const, requiredScopes: toolName === "start_process" ? ["shell:execute", "process:manage", "process:persistent", "host:full-access"] : ["shell:execute", "process:manage", "host:full-access"] };
    }
    if (toolName === "read_process_output") {
      const processId = String(args.process_id ?? "");
      const record = this.#records.get(processId);
      const resource = describeProcessActionResourceV3({ operation: "read_process_output", processId, generation: record?.generation, owned: Boolean(record), contextMatches: record?.contextFingerprint === this.#options.contextFingerprint() });
      return { resource: resource as unknown as ResourceDescriptorV1, semanticFactsDigest: resource.semanticFactsDigest, riskClass: "R0" as const, requiredScopes: ["process:manage"] };
    }
    throw new Error("PROCESS_NOT_FOUND");
  }

  async runCommand(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const started = this.#now();
    const resolved = this.#resolve(args);
    const authorized = authorizedResourceFingerprint(args);
    if (authorized && authorized !== resolved.resource.resourceFingerprint) throw new Error("BACKEND_STALE");
    const processId = this.#options.processId?.() ?? `process_${randomUUID().replaceAll("-", "")}`;
    const reservation = this.#quota.reserveProcess(this.#options.contextFingerprint(), processId);
    const ring = new OutputRing();
    const stdoutRedactor = new StreamingRedactor();
    const stderrRedactor = new StreamingRedactor();
    let body: Record<string, unknown>;
    try {
      const verificationBefore = resolved.verificationBinding
        ? await this.#candidateWorkspaces!.beginExecution(resolved.verificationBinding)
        : null;
      const compiled = compileCommandForWindowsHost({ command: resolved.command, backend: resolved.backend, cwd: resolved.cwd, environment: Object.fromEntries(resolved.effective.entries), deadlineMs: resolved.deadlineMs });
      const client = await this.#options.hostRuntime.get();
      ({ body } = await client.request(compiled.request.operation, compiled.request.input, { timeoutMs: resolved.deadlineMs + 10_000 }));
      for (const [stream, key, redactor] of [["stdout", "stdoutBase64", stdoutRedactor], ["stderr", "stderrBase64", stderrRedactor]] as const) {
        const encoded = typeof body[key] === "string" ? body[key] as string : "";
        const raw = Buffer.from(encoded, "base64");
        const redacted = Buffer.concat([redactor.write(raw), redactor.end()]);
        if (!this.#quota.claimOutput(processId, redacted.length)) throw new Error("OUTPUT_LIMIT_EXCEEDED");
        ring.append(stream, redacted);
      }
      ring.close();
      this.#quota.reserveTerminal(processId);
      const timedOut = body.timedOut === true;
      const exitCode = typeof body.exitCode === "number" ? body.exitCode : null;
      const status = timedOut ? "terminated" : body.ok === false && exitCode === null ? "failed" : "exited";
      const record: TerminalRecord = {
        processId,
        generation: 0,
        contextFingerprint: this.#options.contextFingerprint(),
        ring,
        status,
        exitCode,
        verificationReceipt: null,
        expiresAt: this.#now() + TERMINAL_TTL_MS,
        release: reservation.release
      };
      const output = this.#page(record, { sequence: 0, offset: 0 }, FIRST_PAGE_BYTES);
      const data = { process_id: processId, status, exit_code: exitCode, termination_reason: timedOut ? "timeout" : null,
        backend: { backend_id: resolved.backend.backendId, command_kind: resolved.command.kind, executable_identity: resolved.backend.sha256, terminal: "none" }, authority: FULL_ACCESS_PROCESS_AUTHORITY_V3, output,
        started_at: new Date(started).toISOString(), ended_at: new Date(this.#now()).toISOString(),
        ...(contractIncludesV4(this.#options.config.toolContractVersion) ? { verification_receipt: null } : {}) };
    const schema = contractIncludesV4(this.#options.config.toolContractVersion)
        ? runCommandOutputSchemaV4
        : runCommandOutputSchema;
      const structured = schema.parse({ codexgpt_tool: "run_command", codexgpt_title: "Run Command", ok: true, data, error: null, meta: createToolMeta(this.#now() - started, [FULL_ACCESS_PROCESS_WARNING_V3]) }) as Record<string, unknown>;
      attachExecutionAuditFacts(structured, {
        resultCode: status === "exited" && exitCode === 0 ? "OK" : "COMMAND_FAILED",
        exitCode,
        boundedByteCounts: { returnedBytes: output.returned_bytes },
        changeSetId: null,
        operationCount: 1,
        mutationKinds: [],
        pendingMutationCommit: null
      });
      if (resolved.verificationBinding && verificationBefore && status === "exited" && exitCode === 0) {
        const verificationAfter = await this.#candidateWorkspaces!.completeExecution(
          resolved.verificationBinding,
          verificationBefore
        );
        attachPendingVerificationReceipt(structured, {
          finalize: (audit) => this.#candidateWorkspaces!.issueReceipt(
            resolved.verificationBinding!,
            verificationAfter,
            {
              commandDigest: resolved.resource.commandDigest,
              commandResourceFingerprint: resolved.resource.resourceFingerprint,
              backendId: resolved.resource.backendId!,
              backendVersion: resolved.resource.backendVersion!,
              executableIdentity: resolved.resource.executableIdentity,
              effectiveEnvironmentDigest: resolved.resource.effectiveEnvironmentDigest,
              cwdIdentity: resolved.resource.absoluteCwdIdentity,
              policyRevision: resolved.resource.policyRevision!,
              terminalAuditEventId: audit.eventId,
              exitCode
            }
          ),
          attach: (receipt) => {
            const projected = structured.data as Record<string, unknown> | undefined;
            if (!projected) throw new Error("MERGE_CHECKS_REQUIRED");
            projected.verification_receipt = receipt;
            record.verificationReceipt = receipt;
          }
        });
      }
      this.#records.set(processId, record);
      return structured;
    } catch (error) {
      reservation.release();
      throw error;
    }
  }

  preparePersistent(args: Record<string, unknown>) {
    const resolved = this.#resolve(args, "start_process");
    const authorized = authorizedResourceFingerprint(args);
    if (authorized && authorized !== resolved.resource.resourceFingerprint) throw new Error("BACKEND_STALE");
    const compiled = compileCommandForWindowsHost({ command: resolved.command, backend: resolved.backend, cwd: resolved.cwd, environment: Object.fromEntries(resolved.effective.entries), deadlineMs: resolved.deadlineMs });
    return Object.freeze({ ...resolved, compiled });
  }

  readProcessOutput(args: Record<string, unknown>): Record<string, unknown> {
    this.#purge();
    const processId = String(args.process_id ?? "");
    const record = this.#records.get(processId);
    if (!record || record.contextFingerprint !== this.#options.contextFingerprint()) throw new Error("PROCESS_NOT_FOUND");
    const state = typeof args.cursor === "string" ? this.#cursor.decode(args.cursor, { processId, generation: record.generation, contextFingerprint: record.contextFingerprint }) : { sequence: 0, offset: 0 };
    const output = this.#page(record, state, typeof args.max_bytes === "number" ? args.max_bytes : FIRST_PAGE_BYTES);
    const data = {
      process_id: processId,
      status: record.status,
      output,
      ...(contractIncludesV4(this.toolContractVersion)
        ? {
            exit_code: record.exitCode,
            verification_receipt: record.verificationReceipt
          }
        : {})
    };
    const schema = contractIncludesV4(this.toolContractVersion)
      ? readProcessOutputOutputSchemaV4
      : readProcessOutputOutputSchema;
    return schema.parse({ codexgpt_tool: "read_process_output", codexgpt_title: "Read Process Output", ok: true, data, error: null, meta: createToolMeta() }) as Record<string, unknown>;
  }

  #page(record: TerminalRecord, cursor: { sequence: number; offset: number }, maxBytes: number) {
    const page = record.ring.read({ ...cursor, maxBytes });
    return { chunks: page.chunks, next_cursor: page.eof ? null : this.#cursor.encode({ processId: record.processId, generation: record.generation, sequence: page.next.sequence, offset: page.next.offset, contextFingerprint: record.contextFingerprint, expiresAt: record.expiresAt }), truncated: page.truncated, eof: page.eof, returned_bytes: page.returnedBytes };
  }

  #purge(): void {
    for (const [id, record] of this.#records) if (this.#now() >= record.expiresAt) { record.release(); this.#records.delete(id); }
  }

  close(): void {
    for (const record of this.#records.values()) record.release();
    this.#records.clear();
    this.#cursor.dispose();
  }
}
