import type { PersistentAuditStore } from "../audit/store.js";
import { createApprovalLifecycleSinkV3 } from "../audit/lifecycleV3.js";
import {
  SessionGrantStore,
  type GrantReservationV3,
  type MatchGrantInput
} from "../policy/approval.js";
import type { AuthorizationFactsV3 } from "../policy/authorizationFacts.js";
import {
  PendingApprovalStore,
  type ApprovalDisplaySummaryV3,
  type PendingApprovalStoreOptions,
  type PendingApprovalV3
} from "../policy/pendingApprovals.js";
import {
  LocalApprovalServer,
  type LocalProcessControlV3
} from "./localApprovalServer.js";
import {
  WindowsLocalControlRuntime,
  localControlServerId
} from "./windowsLocalControl.js";

export interface LocalApprovalRuntimeV3Options {
  auditStore: PersistentAuditStore;
  stateBaseRoot: string;
  processes?: LocalProcessControlV3;
  now?: () => number;
  pendingStoreOptions?: Omit<PendingApprovalStoreOptions, "now" | "lifecycleSink">;
  startNativeControl?: boolean;
}

export interface ApprovalExecutionReservationV3 {
  reservation: GrantReservationV3;
  approval: PendingApprovalV3;
}

export class LocalApprovalRuntimeV3 {
  readonly serverId: string;
  readonly approvals: PendingApprovalStore;
  readonly grants: SessionGrantStore;
  readonly server: LocalApprovalServer;
  #nativeControl: WindowsLocalControlRuntime | null = null;
  #closed = false;

  private constructor(input: {
    serverId: string;
    approvals: PendingApprovalStore;
    grants: SessionGrantStore;
    server: LocalApprovalServer;
  }) {
    this.serverId = input.serverId;
    this.approvals = input.approvals;
    this.grants = input.grants;
    this.server = input.server;
  }

  static async start(options: LocalApprovalRuntimeV3Options): Promise<LocalApprovalRuntimeV3> {
    const serverId = localControlServerId();
    const approvals = new PendingApprovalStore({
      ...options.pendingStoreOptions,
      now: options.now,
      lifecycleSink: createApprovalLifecycleSinkV3(options.auditStore)
    });
    const grants = new SessionGrantStore();
    const server = new LocalApprovalServer({
      serverId,
      approvals,
      grants,
      processes: options.processes,
      now: options.now
    });
    const runtime = new LocalApprovalRuntimeV3({ serverId, approvals, grants, server });
    if (options.startNativeControl !== false) {
      runtime.#nativeControl = await WindowsLocalControlRuntime.start({
        server,
        stateBaseRoot: options.stateBaseRoot
      });
    }
    return runtime;
  }

  nativeControl(): WindowsLocalControlRuntime | null {
    return this.#nativeControl;
  }

  setApprovalPreparation(
    callback: ((record: PendingApprovalV3) => void | Promise<void>) | undefined,
    display?: (record: PendingApprovalV3) => ApprovalDisplaySummaryV3 | null
  ): void {
    this.#assertOpen();
    this.server.setApprovalPreparation(callback, display);
  }

  setProcessControl(processes: LocalProcessControlV3 | undefined): void {
    this.#assertOpen();
    this.server.setProcessControl(processes);
  }

  async request(input: {
    facts: AuthorizationFactsV3;
    summary: ApprovalDisplaySummaryV3;
    createdAt?: string;
  }): Promise<{ approval: PendingApprovalV3; deduplicated: boolean }> {
    this.#assertOpen();
    if (input.facts.serverId !== this.serverId) throw new Error("CONTROL_SERVER_MISMATCH");
    return await this.approvals.request(input);
  }

  async reserveMatching(input: MatchGrantInput): Promise<ApprovalExecutionReservationV3 | null> {
    this.#assertOpen();
    const reservation = this.grants.reserveMatching(input);
    if (!reservation) return null;
    try {
      const existing = this.approvals.getByGrantId(reservation.grantId);
      if (existing?.state === "consumed" && existing.facts.riskClass !== "R3") {
        return { reservation, approval: existing };
      }
      const approval = await this.approvals.markReserved(
        reservation.grantId,
        reservation.reservationId,
        input.now
      );
      if (!approval) throw new Error("APPROVAL_GRANT_STATE_MISSING");
      return { reservation, approval };
    } catch (error) {
      this.grants.burnReservation(reservation.reservationId);
      throw error;
    }
  }

  async commitConsume(input: ApprovalExecutionReservationV3, at?: string): Promise<void> {
    this.#assertOpen();
    if (input.approval.state === "consumed" && input.approval.facts.riskClass !== "R3") {
      if (!this.grants.commitConsume(input.reservation.reservationId)) {
        throw new Error("APPROVAL_CONSUME_STATE_MISMATCH");
      }
      return;
    }
    try {
      const approval = await this.approvals.markConsumed(
        input.reservation.grantId,
        input.reservation.reservationId,
        at
      );
      if (!approval || !this.grants.commitConsume(input.reservation.reservationId)) {
        throw new Error("APPROVAL_CONSUME_STATE_MISMATCH");
      }
    } catch (error) {
      this.grants.burnReservation(input.reservation.reservationId);
      this.grants.revokeGrant(input.reservation.grantId);
      try {
        await this.approvals.markBurned(
          input.reservation.grantId,
          input.reservation.reservationId,
          at,
          "CONSUME_FAILED"
        );
      } catch {
        // Preserve the original required-audit/consume failure.
      }
      throw error;
    }
  }

  async burn(input: ApprovalExecutionReservationV3, resultCode: string, at?: string): Promise<void> {
    this.#assertOpen();
    this.grants.burnReservation(input.reservation.reservationId);
    if (input.approval.state === "consumed" && input.approval.facts.riskClass !== "R3") return;
    this.grants.revokeGrant(input.reservation.grantId);
    await this.approvals.markBurned(
      input.reservation.grantId,
      input.reservation.reservationId,
      at,
      resultCode
    );
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    let failure: unknown;
    try {
      await this.approvals.closeServer(this.serverId);
    } catch (error) {
      failure = error;
    }
    this.grants.clear();
    try {
      await this.#nativeControl?.close();
    } catch (error) {
      failure ??= error;
    }
    this.#nativeControl = null;
    if (failure) throw failure;
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("CONTROL_SERVER_CLOSED");
  }
}
