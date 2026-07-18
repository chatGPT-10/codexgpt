import { auditEventV4Schema } from "../audit/schemas.js";
import type {
  AuditEnvelopeV1,
  AuthorizationAuditEventV4,
  TerminalAuditEventV4
} from "../audit/types.js";
import type { GitRepositoryIdentity } from "./repositoryIdentity.js";
import type { GitFileLockHandle, GitLockHandle, GitLockManager } from "./locks.js";
import type {
  CreateGitOperationInputV1,
  GitOperationParticipantV1,
  GitOperationRecordV1,
  GitOperationStore
} from "./operationStore.js";
import type { GitRepositoryStore } from "./repositoryStore.js";
import { gateRError } from "./durableState.js";

export type GitParticipantProbeResult = "present" | "absent" | "unknown";
export type GitRecoveryOutcome = "committed" | "rolled_back" | "recovery_required";

export interface GitRecoveryResult {
  operationId: string;
  repositoryId: string;
  outcome: GitRecoveryOutcome;
  resultCode: string;
}

export interface GitRecoveryCoordinatorOptions {
  operationStore: GitOperationStore;
  repositoryStore: GitRepositoryStore;
  locks: Pick<GitLockManager, "acquire">;
  probeParticipant(
    operation: GitOperationRecordV1,
    participant: GitOperationParticipantV1
  ): Promise<GitParticipantProbeResult>;
  resolveTerminalAuditEventId?(
    operation: GitOperationRecordV1
  ): Promise<string | null | "unknown">;
  recordRecovery(input: {
    operation: GitOperationRecordV1;
    outcome: GitRecoveryOutcome;
    resultCode: string;
  }): Promise<void>;
}

const LIVE_DURABLE_PARTICIPANTS = new Set<GitOperationParticipantV1>([
  "private_index",
  "file_transaction",
  "ref_cas",
  "task_registry"
]);

export class GitRecoveryCoordinator {
  constructor(private readonly options: GitRecoveryCoordinatorOptions) {}

  async recoverAll(repositoryStateKey?: string): Promise<GitRecoveryResult[]> {
    const operations = this.options.operationStore.listIncomplete(repositoryStateKey);
    const results: GitRecoveryResult[] = [];
    for (const operation of operations) {
      let lock: GitLockHandle;
      try {
        lock = await this.options.locks.acquire({
          operationId: operation.operationId,
          repositoryStateKey: operation.repositoryStateKey,
          worktreeStateKeys: operation.worktreeStateKeys
        });
      } catch {
        this.options.repositoryStore.markRecoveryRequired(
          operation.repositoryStateKey,
          "GIT_LOCK_OWNERSHIP_UNPROVED"
        );
        results.push({
          operationId: operation.operationId,
          repositoryId: operation.repositoryId,
          outcome: "recovery_required",
          resultCode: "GIT_LOCK_OWNERSHIP_UNPROVED"
        });
        continue;
      }
      let result: GitRecoveryResult;
      try {
        result = await this.#recover(operation);
      } catch {
        this.options.repositoryStore.markRecoveryRequired(
          operation.repositoryStateKey,
          "GIT_RECOVERY_EXECUTION_FAILED"
        );
        result = {
          operationId: operation.operationId,
          repositoryId: operation.repositoryId,
          outcome: "recovery_required",
          resultCode: "GIT_RECOVERY_EXECUTION_FAILED"
        };
      }
      try {
        await lock.release();
      } catch {
        this.options.repositoryStore.markRecoveryRequired(
          operation.repositoryStateKey,
          "GIT_LOCK_RELEASE_UNPROVED"
        );
        result = {
          operationId: operation.operationId,
          repositoryId: operation.repositoryId,
          outcome: "recovery_required",
          resultCode: "GIT_LOCK_RELEASE_UNPROVED"
        };
      }
      results.push(result);
    }
    return results;
  }

  async #recover(operation: GitOperationRecordV1): Promise<GitRecoveryResult> {
    const probes = new Map<GitOperationParticipantV1, GitParticipantProbeResult>();
    for (const participant of operation.participantRequirements) {
      let result: GitParticipantProbeResult;
      try {
        result = await this.options.probeParticipant(operation, participant);
      } catch {
        result = "unknown";
      }
      if (!(["present", "absent", "unknown"] as const).includes(result)) result = "unknown";
      probes.set(participant, result);
    }

    if ([...probes.values()].some((value) => value === "unknown")) {
      return this.#freeze(operation, "GIT_PARTICIPANT_UNKNOWN");
    }

    const audit = probes.get("audit") ?? "absent";
    const durablePresent = [...probes.entries()].some(([participant, result]) =>
      result === "present" && LIVE_DURABLE_PARTICIPANTS.has(participant)
    );
    const objectOnlyPresent = probes.get("object_quarantine") === "present" && !durablePresent;
    const anyNonAuditPresent = [...probes.entries()].some(([participant, result]) =>
      participant !== "audit" && result === "present"
    );

    if (audit === "present" && (durablePresent || operation.durableEffectObserved)) {
      let terminalAuditEventId: string | null | "unknown" = "unknown";
      try {
        terminalAuditEventId = this.options.resolveTerminalAuditEventId
          ? await this.options.resolveTerminalAuditEventId(operation)
          : "unknown";
      } catch {
        terminalAuditEventId = "unknown";
      }
      if (!terminalAuditEventId || terminalAuditEventId === "unknown" || !/^event_[a-f0-9]{32}$/.test(terminalAuditEventId)) {
        return this.#freeze(operation, "AUDIT_TERMINAL_UNPROVED");
      }
      return this.#commit(operation, terminalAuditEventId);
    }
    if (audit === "present" && !anyNonAuditPresent && !operation.durableEffectObserved) {
      return this.#freeze(operation, "GIT_AUDIT_EFFECT_MISMATCH");
    }
    if (durablePresent || operation.durableEffectObserved) {
      return this.#freeze(operation, "AUDIT_TERMINAL_UNPROVED");
    }
    if (objectOnlyPresent || [...probes.values()].every((value) => value === "absent")) {
      return this.#rollBack(operation, objectOnlyPresent ? "ORPHAN_OBJECTS_UNREACHABLE" : "NO_DURABLE_EFFECT");
    }
    return this.#freeze(operation, "GIT_PARTICIPANT_MISMATCH");
  }

  #advanceToExecuting(operation: GitOperationRecordV1): GitOperationRecordV1 {
    let current = operation;
    if (current.state === "preparing") current = this.options.operationStore.transition(current, { state: "prepared" });
    if (current.state === "prepared") current = this.options.operationStore.transition(current, { state: "executing" });
    return current;
  }

  async #commit(operation: GitOperationRecordV1, terminalAuditEventId: string): Promise<GitRecoveryResult> {
    let current = this.#advanceToExecuting(operation);
    if (current.state === "executing") {
      current = this.options.operationStore.transition(current, {
        state: "effect_observed",
        durableEffectObserved: true,
        resultCode: "EFFECT_RECONCILED"
      });
    }
    if (current.state === "effect_observed") {
      current = this.options.operationStore.transition(current, { state: "audit_pending" });
    }
    if (current.state !== "audit_pending") return this.#freeze(current, "GIT_RECOVERY_STATE_INVALID");
    current = this.options.operationStore.transition(current, {
      state: "committed",
      durableEffectObserved: true,
      terminalAuditEventId,
      resultCode: "RECOVERED_COMMITTED"
    });
    const result: GitRecoveryResult = {
      operationId: current.operationId,
      repositoryId: current.repositoryId,
      outcome: "committed",
      resultCode: "RECOVERED_COMMITTED"
    };
    try {
      await this.options.recordRecovery({ operation: current, outcome: result.outcome, resultCode: result.resultCode });
    } catch {
      return this.#freeze(current, "RECOVERY_AUDIT_UNAVAILABLE");
    }
    return result;
  }

  async #rollBack(operation: GitOperationRecordV1, resultCode: string): Promise<GitRecoveryResult> {
    let current = operation;
    if (current.state !== "rolling_back") {
      current = this.options.operationStore.transition(current, { state: "rolling_back", resultCode });
    }
    current = this.options.operationStore.transition(current, {
      state: "rolled_back",
      durableEffectObserved: false,
      resultCode
    });
    const result: GitRecoveryResult = {
      operationId: current.operationId,
      repositoryId: current.repositoryId,
      outcome: "rolled_back",
      resultCode
    };
    try {
      await this.options.recordRecovery({ operation: current, outcome: result.outcome, resultCode });
      return result;
    } catch {
      return this.#freeze(current, "RECOVERY_AUDIT_UNAVAILABLE");
    }
  }

  async #freeze(operation: GitOperationRecordV1, resultCode: string): Promise<GitRecoveryResult> {
    let current = operation;
    if (current.state !== "recovery_required" && current.state !== "committed" && current.state !== "rolled_back") {
      current = this.options.operationStore.transition(current, {
        state: "recovery_required",
        resultCode
      });
    }
    try {
      this.options.repositoryStore.markRecoveryRequired(current.repositoryStateKey, resultCode);
    } catch {
      throw gateRError();
    }
    const result: GitRecoveryResult = {
      operationId: current.operationId,
      repositoryId: current.repositoryId,
      outcome: "recovery_required",
      resultCode
    };
    try {
      await this.options.recordRecovery({ operation: current, outcome: result.outcome, resultCode });
    } catch {
      // The authenticated journal and repository freeze are the source of truth.
    }
    return result;
  }
}

export interface PreparedGitOperationV4 {
  operation: GitOperationRecordV1;
  lock: GitLockHandle;
}

export class GitGateRRuntimeV4 {
  #ready = false;
  #startupComplete = false;

  constructor(private readonly options: {
    recovery: GitRecoveryCoordinator;
    operationStore: GitOperationStore;
    repositoryStore: GitRepositoryStore;
    locks: GitLockManager;
    appendAuthorization(event: AuthorizationAuditEventV4): Promise<AuditEnvelopeV1>;
    appendTerminal?(event: TerminalAuditEventV4): Promise<AuditEnvelopeV1>;
  }) {}

  async startupRecovery(): Promise<GitRecoveryResult[]> {
    if (this.#startupComplete) return [];
    const results = await this.options.recovery.recoverAll();
    const frozenRepositoryExists = this.options.repositoryStore.list()
      .some((repository) => repository.state === "recovery_required");
    this.#startupComplete = true;
    this.#ready = !frozenRepositoryExists &&
      results.every((result) => result.outcome !== "recovery_required");
    return results;
  }

  isReady(): boolean {
    return this.#startupComplete && this.#ready;
  }

  registerRepository(identity: GitRepositoryIdentity) {
    if (!this.isReady()) throw gateRError();
    return this.options.repositoryStore.register(identity);
  }

  async prepareOperation(input: {
    authorization: AuthorizationAuditEventV4;
    operation: Omit<CreateGitOperationInputV1, "authorizationEventId">;
    authorizedRepositoryId?: string;
    acquireFileLocks?: () => Promise<GitFileLockHandle>;
  }): Promise<PreparedGitOperationV4> {
    if (!this.isReady()) throw gateRError();
    let authorization: AuthorizationAuditEventV4;
    try {
      const parsed = auditEventV4Schema.parse(input.authorization);
      if (parsed.eventType !== "authorization") throw gateRError();
      authorization = parsed;
    } catch {
      throw gateRError();
    }
    if (
      authorization.eventType !== "authorization" ||
      authorization.outcome !== "allow" ||
      authorization.repositoryId !== (input.authorizedRepositoryId ?? input.operation.repositoryId) ||
      authorization.requestId !== input.operation.requestId ||
      authorization.toolName !== input.operation.toolName ||
      authorization.canonicalAction !== input.operation.canonicalAction ||
      authorization.policyRevision !== input.operation.policyRevision ||
      authorization.subjectFingerprint !== input.operation.subjectFingerprint ||
      authorization.contextFingerprint !== input.operation.contextFingerprint ||
      authorization.resourceFingerprint !== input.operation.resourceFingerprint
    ) throw gateRError();
    const repository = this.options.repositoryStore.activate(input.operation.repositoryStateKey);
    if (
      repository.repositoryId !== input.operation.repositoryId ||
      repository.capabilityRevision !== input.operation.capabilityRevision
    ) throw gateRError();
    const persisted = await this.options.appendAuthorization(authorization);
    if (persisted.event.eventId !== authorization.eventId || persisted.event.schemaVersion !== 4) throw gateRError();
    const preparing = this.options.operationStore.create({
      ...input.operation,
      authorizationEventId: authorization.eventId
    });
    const lock = await this.options.locks.acquire({
      operationId: preparing.operationId,
      repositoryStateKey: preparing.repositoryStateKey,
      worktreeStateKeys: preparing.worktreeStateKeys,
      acquireFileLocks: input.acquireFileLocks
    });
    try {
      const operation = this.options.operationStore.transition(preparing, { state: "prepared" });
      return { operation, lock };
    } catch (error) {
      await lock.release().catch(() => {});
      throw error;
    }
  }

  async completeOperation(
    prepared: PreparedGitOperationV4,
    terminal: TerminalAuditEventV4
  ): Promise<GitOperationRecordV1> {
    let current = prepared.operation;
    try {
      if (!this.options.appendTerminal) throw gateRError();
      if (current.state === "prepared") {
        current = this.options.operationStore.transition(current, { state: "executing" });
        current = this.options.operationStore.transition(current, {
          state: "effect_observed",
          durableEffectObserved: true,
          resultCode: terminal.resultCode
        });
      }
      if (current.state !== "effect_observed") throw gateRError();
      current = this.options.operationStore.transition(current, { state: "audit_pending" });
      const persisted = await this.options.appendTerminal(terminal);
      if (
        persisted.event.schemaVersion !== 4 ||
        persisted.event.eventType !== "terminal" ||
        persisted.event.eventId !== terminal.eventId
      ) throw gateRError();
      current = this.options.operationStore.transition(current, {
        state: "committed",
        durableEffectObserved: true,
        terminalAuditEventId: terminal.eventId,
        resultCode: terminal.resultCode
      });
      return current;
    } catch {
      this.options.repositoryStore.markRecoveryRequired(current.repositoryStateKey, "AUDIT_TERMINAL_UNPROVED");
      if (!["committed", "rolled_back", "recovery_required"].includes(current.state)) {
        current = this.options.operationStore.transition(current, {
          state: "recovery_required",
          resultCode: "AUDIT_TERMINAL_UNPROVED"
        });
      }
      throw gateRError();
    } finally {
      await prepared.lock.release().catch(() => {
        this.options.repositoryStore.markRecoveryRequired(
          prepared.operation.repositoryStateKey,
          "GIT_LOCK_RELEASE_UNPROVED"
        );
      });
    }
  }

  async observeEffect(
    prepared: PreparedGitOperationV4,
    privateState: unknown,
    resultCode = "EFFECT_OBSERVED"
  ): Promise<PreparedGitOperationV4> {
    let current = prepared.operation;
    try {
      current = this.options.operationStore.transition(current, {
        state: "executing",
        privateState
      });
      current = this.options.operationStore.transition(current, {
        state: "effect_observed",
        durableEffectObserved: true,
        resultCode,
        privateState
      });
      return { operation: current, lock: prepared.lock };
    } catch {
      this.options.repositoryStore.markRecoveryRequired(
        prepared.operation.repositoryStateKey,
        "GIT_EFFECT_STATE_UNPROVED"
      );
      try {
        const persisted = this.options.operationStore.read(
          prepared.operation.repositoryStateKey,
          prepared.operation.operationId
        ).record;
        if (!["committed", "rolled_back", "recovery_required"].includes(persisted.state)) {
          this.options.operationStore.transition(persisted, {
            state: "recovery_required",
            resultCode: "GIT_EFFECT_STATE_UNPROVED"
          });
        }
      } catch {
        // Repository freeze is the final fail-closed state.
      }
      await prepared.lock.release().catch(() => {});
      throw gateRError();
    }
  }

  async beginEffect(
    prepared: PreparedGitOperationV4,
    privateState: unknown
  ): Promise<PreparedGitOperationV4> {
    let current = prepared.operation;
    try {
      if (current.state !== "prepared") throw gateRError();
      current = this.options.operationStore.transition(current, {
        state: "executing",
        privateState
      });
      return { operation: current, lock: prepared.lock };
    } catch {
      this.options.repositoryStore.markRecoveryRequired(
        prepared.operation.repositoryStateKey,
        "GIT_EFFECT_START_UNPROVED"
      );
      await prepared.lock.release().catch(() => {});
      throw gateRError();
    }
  }

  async requireRecovery(
    prepared: PreparedGitOperationV4,
    resultCode: string
  ): Promise<GitOperationRecordV1> {
    let current = prepared.operation;
    try {
      this.options.repositoryStore.markRecoveryRequired(
        current.repositoryStateKey,
        resultCode
      );
      if (!["committed", "rolled_back", "recovery_required"].includes(current.state)) {
        current = this.options.operationStore.transition(current, {
          state: "recovery_required",
          resultCode
        });
      }
      return current;
    } finally {
      await prepared.lock.release().catch(() => {
        this.options.repositoryStore.markRecoveryRequired(
          prepared.operation.repositoryStateKey,
          "GIT_LOCK_RELEASE_UNPROVED"
        );
      });
    }
  }

  async rollBackOperation(
    prepared: PreparedGitOperationV4,
    resultCode: string
  ): Promise<GitOperationRecordV1> {
    let current = prepared.operation;
    try {
      current = this.options.operationStore.transition(current, {
        state: "rolling_back",
        resultCode
      });
      current = this.options.operationStore.transition(current, {
        state: "rolled_back",
        durableEffectObserved: false,
        resultCode
      });
      return current;
    } finally {
      await prepared.lock.release().catch(() => {
        this.options.repositoryStore.markRecoveryRequired(
          prepared.operation.repositoryStateKey,
          "GIT_LOCK_RELEASE_UNPROVED"
        );
      });
    }
  }
}
