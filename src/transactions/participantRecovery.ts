import type { PersistentAuditStore } from "../audit/store.js";
import type { ChangeSetStore } from "../changesets/store.js";
import type { MoveChangeSetStore } from "../changesets/moveStore.js";
import { TransactionError } from "./types.js";
import type {
  ParticipantRecoveryAdapter,
  ParticipantRecoveryProbeResult,
  TransactionManifest
} from "./types.js";

export interface DurableParticipantRecoveryAdapterOptions {
  auditStore: Pick<PersistentAuditStore, "probeExecutionParticipant" | "recordTransactionRecovery">;
  changeSetStore: Pick<ChangeSetStore, "probe" | "read" | "transition">;
  moveChangeSetStore: Pick<MoveChangeSetStore, "probe" | "read" | "transition">;
  now?: () => number;
}

function timestamp(now: () => number): string {
  const value = new Date(now()).toISOString();
  if (value === "Invalid Date") {
    throw new TransactionError(
      "TRANSACTION_RECOVERY_REQUIRED",
      "Participant recovery clock is invalid."
    );
  }
  return value;
}

export class DurableParticipantRecoveryAdapter implements ParticipantRecoveryAdapter {
  private readonly now: () => number;

  constructor(private readonly options: DurableParticipantRecoveryAdapterOptions) {
    this.now = options.now ?? Date.now;
  }

  async probe(
    manifest: TransactionManifest,
    participant: string
  ): Promise<ParticipantRecoveryProbeResult> {
    if (participant === "audit") {
      return this.options.auditStore.probeExecutionParticipant(manifest.changeSetId);
    }
    if (participant === "change_set") {
      return manifest.schemaVersion === 2
        ? this.options.moveChangeSetStore.probe(manifest.workspaceStateKey, manifest.changeSetId)
        : this.options.changeSetStore.probe(manifest.workspaceStateKey, manifest.changeSetId);
    }
    if (participant === "original_change_set" && manifest.schemaVersion === 2) {
      const reference = manifest.participantReferences.original_change_set;
      const match = /^original_change_set:(cs_[a-f0-9]{32})$/.exec(reference ?? "");
      if (!match) return "unknown";
      try {
        const original = this.options.moveChangeSetStore.read(manifest.workspaceStateKey, match[1]);
        if (original.state === "active") return "absent";
        if (original.state !== "undone") return "unknown";
        const reverse = this.options.moveChangeSetStore.read(
          manifest.workspaceStateKey,
          manifest.changeSetId
        );
        return reverse.toolName === "undo_change_set" && reverse.revertsChangeSetId === original.changeSetId
          ? "present"
          : "unknown";
      } catch {
        return "unknown";
      }
    }
    return "unknown";
  }

  private compensateV1(manifest: Extract<TransactionManifest, { schemaVersion: 1 }>): void {
    const current = this.options.changeSetStore.read(
      manifest.workspaceStateKey,
      manifest.changeSetId
    );
    if (current.state === "recovery_required") return;
    if (current.state !== "active") {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "V1 change-set compensation found an incompatible state."
      );
    }
    this.options.changeSetStore.transition(
      manifest.workspaceStateKey,
      manifest.changeSetId,
      {
        expectedGeneration: current.generation,
        state: "recovery_required",
        updatedAt: timestamp(this.now)
      }
    );
  }

  private compensateV2(manifest: Extract<TransactionManifest, { schemaVersion: 2 }>): void {
    const current = this.options.moveChangeSetStore.read(
      manifest.workspaceStateKey,
      manifest.changeSetId
    );
    if (current.state === "recovery_required") return;
    if (current.state !== "active") {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "V2 change-set compensation found an incompatible state."
      );
    }
    this.options.moveChangeSetStore.transition(
      manifest.workspaceStateKey,
      manifest.changeSetId,
      {
        expectedGeneration: current.generation,
        state: "recovery_required",
        updatedAt: timestamp(this.now)
      }
    );
  }

  async compensatePartial(
    manifest: TransactionManifest,
    presentParticipants: readonly string[]
  ): Promise<void> {
    if (presentParticipants.includes("original_change_set")) {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "An original change-set transition cannot be safely compensated after reverse effects diverged."
      );
    }
    if (!presentParticipants.includes("change_set")) return;
    if (manifest.schemaVersion === 2) this.compensateV2(manifest);
    else this.compensateV1(manifest);
  }

  async recordRecovery(
    manifest: TransactionManifest,
    action: "rollback_completed" | "cleanup_completed" | "workspace_frozen",
    resultCode: string
  ): Promise<void> {
    await this.options.auditStore.recordTransactionRecovery({
      action,
      transactionId: manifest.transactionId,
      changeSetId: manifest.changeSetId,
      operationCount: manifest.operations.length,
      resultCode,
      timestamp: manifest.updatedAt
    });
  }
}

export function createDurableParticipantRecoveryAdapter(
  options: DurableParticipantRecoveryAdapterOptions
): DurableParticipantRecoveryAdapter {
  return new DurableParticipantRecoveryAdapter(options);
}
