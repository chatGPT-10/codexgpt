import { riskLimits, SessionGrantStore } from "../policy/approval.js";
import type { RequestContextV1 } from "../policy/types.js";
import {
  ApprovalQueueError,
  PendingApprovalStore,
  type ApprovalDisplaySummaryV3,
  type PendingApprovalV3
} from "../policy/pendingApprovals.js";
import {
  localControlRequestV3Schema,
  localControlResponseV3Schema,
  localServerIdSchema,
  type LocalControlRequestV3,
  type LocalControlResponseV3
} from "./schemas.js";

export interface LocalProcessSummaryV3 {
  processId: string;
  state: string;
  summary: string;
}

export interface LocalProcessControlV3 {
  list(): LocalProcessSummaryV3[] | Promise<LocalProcessSummaryV3[]>;
  terminate(processId: string): boolean | Promise<boolean>;
}

export interface LocalApprovalServerOptions {
  serverId: string;
  approvals: PendingApprovalStore;
  grants: SessionGrantStore;
  processes?: LocalProcessControlV3;
  now?: () => number;
  prepareApproval?: (record: PendingApprovalV3) => void | Promise<void>;
  displayApproval?: (record: PendingApprovalV3) => ApprovalDisplaySummaryV3 | null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
  });
}

function safeApproval(record: PendingApprovalV3, display?: ApprovalDisplaySummaryV3 | null): LocalControlResponseV3["approvals"][number] {
  return {
    approvalId: record.approvalId,
    state: record.state,
    riskClass: record.facts.riskClass,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    grantId: record.grantId,
    reservationId: record.reservationId,
    summary: {
      ...structuredClone(display ?? record.summary),
      revealArguments: [...((display ?? record.summary).revealArguments ?? [])]
    }
  };
}

function contextFor(record: PendingApprovalV3, grantRevision: string, receivedAt: string): RequestContextV1 {
  const local = record.facts.transportKind === "stdio";
  return {
    schemaVersion: 1,
    requestId: `request_${record.approvalId.slice("approval_".length)}`,
    transportKind: local ? "stdio" : "streamable_http",
    transportSessionId: record.facts.transportSessionId,
    identity: {
      schemaVersion: 1,
      kind: local ? "local_process" : record.facts.identitySubject ? "oauth_subject" : "shared_secret_bearer",
      authenticationMode: local ? "stdio" : record.facts.identitySubject ? "oauth2" : "bearer",
      credentialRef: record.facts.credentialRef,
      subject: record.facts.identitySubject,
      scopes: [],
      assuranceLevel: local ? "local" : record.facts.identitySubject ? "strong" : "shared_secret"
    },
    workspaceId: record.facts.workspaceId,
    runtimeProfileId: "runtime-v3",
    permissionProfileId: "approval-v3",
    policyRevision: record.facts.policyRevision,
    sessionGrantRevision: grantRevision,
    receivedAt
  };
}

export function escapeTerminalText(value: string, maximum = 160): string {
  let output = "";
  for (const character of value.normalize("NFC")) {
    const code = character.codePointAt(0)!;
    const printableAscii = code >= 0x20 && code <= 0x7e;
    const safe = printableAscii && character !== "\\";
    const encoded = safe ? character : `\\u{${code.toString(16).toUpperCase().padStart(4, "0")}}`;
    if (output.length + encoded.length > maximum) {
      output += "...";
      break;
    }
    output += encoded;
  }
  return output;
}

export function renderApprovalSummary(record: PendingApprovalV3): string {
  const lines = [
    `Approval: ${escapeTerminalText(record.approvalId)}`,
    `State: ${escapeTerminalText(record.state)}`,
    `Backend: ${escapeTerminalText(record.summary.backend)}`,
    `Action: ${escapeTerminalText(record.summary.actionKind)}`,
    `Arguments: ${record.summary.argumentCount}`,
    `Scope: ${escapeTerminalText(record.summary.logicalScope)}`,
    `Identity: ${escapeTerminalText(record.summary.identityLabel)}`,
    `Authority: ${escapeTerminalText(record.summary.authoritySummary)}`,
    `Risk: ${record.facts.riskClass}`,
    `Expires: ${record.expiresAt}`,
    `Digest: ${record.summary.digestPrefix}`
  ];
  return lines.join("\n");
}

export function renderLocalApprovalEntry(
  record: LocalControlResponseV3["approvals"][number],
  options: { reveal?: boolean } = {}
): string {
  const lines = [
    `Approval: ${escapeTerminalText(record.approvalId)}`,
    `State: ${escapeTerminalText(record.state)}`,
    `Backend: ${escapeTerminalText(record.summary.backend)}`,
    `Action: ${escapeTerminalText(record.summary.actionKind)}`,
    `Arguments: ${record.summary.argumentCount}`,
    `Scope: ${escapeTerminalText(record.summary.logicalScope)}`,
    `Identity: ${escapeTerminalText(record.summary.identityLabel)}`,
    `Authority: ${escapeTerminalText(record.summary.authoritySummary)}`,
    `Risk: ${record.riskClass}`,
    `Expires: ${record.expiresAt}`,
    `Digest: ${record.summary.digestPrefix}`
  ];
  if (options.reveal) {
    for (let index = 0; index < record.summary.revealArguments.length; index += 1) {
      lines.push(`Arg ${index + 1}: ${escapeTerminalText(record.summary.revealArguments[index], 240)}`);
    }
  }
  return lines.join("\n");
}

export class LocalApprovalServer {
  readonly serverId: string;
  readonly #approvals: PendingApprovalStore;
  readonly #grants: SessionGrantStore;
  #processes?: LocalProcessControlV3;
  readonly #now: () => number;
  #prepareApproval?: (record: PendingApprovalV3) => void | Promise<void>;
  #displayApproval?: (record: PendingApprovalV3) => ApprovalDisplaySummaryV3 | null;
  #mutationTail: Promise<void> = Promise.resolve();

  constructor(options: LocalApprovalServerOptions) {
    this.serverId = localServerIdSchema.parse(options.serverId);
    this.#approvals = options.approvals;
    this.#grants = options.grants;
    this.#processes = options.processes;
    this.#now = options.now ?? Date.now;
    this.#prepareApproval = options.prepareApproval;
    this.#displayApproval = options.displayApproval;
  }

  setApprovalPreparation(
    callback: ((record: PendingApprovalV3) => void | Promise<void>) | undefined,
    display?: (record: PendingApprovalV3) => ApprovalDisplaySummaryV3 | null
  ): void {
    this.#prepareApproval = callback;
    this.#displayApproval = display;
  }

  setProcessControl(processes: LocalProcessControlV3 | undefined): void {
    this.#processes = processes;
  }

  async handle(raw: unknown): Promise<LocalControlResponseV3> {
    const request = localControlRequestV3Schema.parse(raw);
    if (request.serverId !== this.serverId) throw new Error("CONTROL_SERVER_MISMATCH");
    switch (request.operation) {
      case "approvals.list":
        await this.#approvals.expire(new Date(this.#now()).toISOString());
        await this.#preparePendingApprovals();
        return this.#response("CONTROL_OK", true, false);
      case "approvals.watch":
        return this.#watch(request);
      case "approvals.approve":
        return this.#mutate(() => this.#approve(request.approvalId));
      case "approvals.deny":
        return this.#mutate(() => this.#deny(request.approvalId));
      case "processes.list":
        return this.#processResponse("CONTROL_OK", false, await this.#processes?.list() ?? []);
      case "processes.terminate": {
        const changed = await this.#processes?.terminate(request.processId) ?? false;
        return this.#processResponse(changed ? "PROCESS_TERMINATED" : "PROCESS_NOT_FOUND", changed, await this.#processes?.list() ?? []);
      }
    }
  }

  async #watch(request: Extract<LocalControlRequestV3, { operation: "approvals.watch" }>): Promise<LocalControlResponseV3> {
    const deadline = this.#now() + request.timeoutMs;
    while (this.#sequence() <= request.afterSequence && this.#now() < deadline) {
      await delay(Math.min(25, Math.max(1, deadline - this.#now())));
      await this.#approvals.expire(new Date(this.#now()).toISOString());
    }
    const changed = this.#sequence() > request.afterSequence;
    await this.#preparePendingApprovals();
    return this.#response(changed ? "CONTROL_CHANGED" : "CONTROL_TIMEOUT", true, changed);
  }

  async #preparePendingApprovals(): Promise<void> {
    if (!this.#prepareApproval) return;
    for (const record of this.#approvals.snapshot()) {
      if (record.facts.serverId !== this.serverId || record.state !== "pending") continue;
      await this.#prepareApproval(record);
    }
  }

  async #approve(approvalId: string): Promise<LocalControlResponseV3> {
    await this.#approvals.expire(new Date(this.#now()).toISOString());
    const current = this.#requiredApproval(approvalId);
    if (current.grantId) return this.#response("APPROVAL_GRANTED", true, false, current.grantId);
    if (current.state === "denied" || current.state === "expired" || current.state === "consumed" || current.state === "burned") {
      return this.#response("APPROVAL_STATE_CONFLICT", false, false);
    }
    const nowMs = this.#now();
    await this.#prepareApproval?.(current);
    await this.#approvals.prepare(approvalId, new Date(nowMs).toISOString());
    const expiresMs = Math.min(Date.parse(current.expiresAt), nowMs + riskLimits(current.facts.riskClass).maxTtlMs);
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return this.#response("APPROVAL_EXPIRED", false, false);
    const grant = this.#grants.issue({
      context: contextFor(current, this.#grants.revision(), new Date(nowMs).toISOString()),
      operation: current.facts.operation,
      resourceFingerprint: current.facts.resourceFingerprint,
      inputDigest: current.facts.inputDigest,
      riskClass: current.facts.riskClass,
      toolContractVersion: current.facts.toolContractVersion,
      issuedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(expiresMs).toISOString(),
      usesRemaining: riskLimits(current.facts.riskClass).uses
    });
    try {
      await this.#approvals.approve(approvalId, grant.grantId, new Date(nowMs).toISOString());
    } catch (error) {
      this.#grants.revokeGrant(grant.grantId);
      throw error;
    }
    return this.#response("APPROVAL_GRANTED", true, true, grant.grantId);
  }

  async #deny(approvalId: string): Promise<LocalControlResponseV3> {
    await this.#approvals.expire(new Date(this.#now()).toISOString());
    const current = this.#requiredApproval(approvalId);
    if (current.state === "denied") return this.#response("APPROVAL_DENIED", true, false);
    try {
      await this.#approvals.deny(approvalId, new Date(this.#now()).toISOString());
      return this.#response("APPROVAL_DENIED", true, true);
    } catch (error) {
      if (error instanceof ApprovalQueueError && error.code === "APPROVAL_STATE_CONFLICT") {
        return this.#response(error.code, false, false);
      }
      throw error;
    }
  }

  #requiredApproval(approvalId: string): PendingApprovalV3 {
    const record = this.#approvals.get(approvalId);
    if (!record || record.facts.serverId !== this.serverId) throw new ApprovalQueueError("APPROVAL_NOT_FOUND", "Approval was not found on this server.");
    return record;
  }

  #sequence(): number {
    return this.#approvals.snapshot().reduce((maximum, record) => Math.max(maximum, record.transitionSequence), 0);
  }

  #response(code: string, ok: boolean, changed: boolean, grantId: string | null = null): LocalControlResponseV3 {
    const approvals = this.#approvals.snapshot()
      .filter((record) => record.facts.serverId === this.serverId)
      .map((record) => safeApproval(record, this.#displayApproval?.(record)));
    return localControlResponseV3Schema.parse({
      schemaVersion: 3,
      contractVersion: 3,
      serverId: this.serverId,
      ok,
      code,
      sequence: this.#sequence(),
      approvals,
      processes: [],
      grantId,
      changed
    });
  }

  #processResponse(code: string, changed: boolean, processes: LocalProcessSummaryV3[]): LocalControlResponseV3 {
    return localControlResponseV3Schema.parse({
      schemaVersion: 3,
      contractVersion: 3,
      serverId: this.serverId,
      ok: code !== "PROCESS_NOT_FOUND",
      code,
      sequence: this.#sequence(),
      approvals: [],
      processes,
      grantId: null,
      changed
    });
  }

  #mutate<T>(action: () => Promise<T>): Promise<T> {
    const result = this.#mutationTail.then(action, action);
    this.#mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}
