import { createTerminalAuditEventV4 } from "../audit/lifecycleV4.js";
import type { AuthorizationAuditEventV4 } from "../audit/types.js";
import type { GitOperationParticipantV1 } from "./operationStore.js";
import type { GitRepositoryIdentity } from "./repositoryIdentity.js";
import { GitGateRRuntimeV4 } from "./recovery.js";
import { gitMutationError, sha256Git } from "./mutationContext.js";

function safeResultCode(error: unknown): string {
  const value = error instanceof Error ? error.message : "GIT_OPERATION_FAILED";
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : "GIT_OPERATION_FAILED";
}

export class GitMutationJournalV4 {
  readonly gateRBound = true as const;

  constructor(
    private readonly runtime: GitGateRRuntimeV4,
    private readonly configurationRevision: string
  ) {}

  async run<T>(input: {
    authorization: AuthorizationAuditEventV4 | null | undefined;
    repository: GitRepositoryIdentity;
    toolName: string;
    canonicalAction: string;
    workspaceId: string;
    participants: GitOperationParticipantV1[];
    counts: Record<string, number>;
    privateState: unknown;
    effectState?(result: T): unknown;
    preEffect?(): Promise<void>;
    effect(): Promise<T>;
  }): Promise<T> {
    const authorization = input.authorization;
    if (
      !authorization ||
      authorization.outcome !== "allow" ||
      !authorization.requestId ||
      authorization.toolName !== input.toolName ||
      authorization.canonicalAction !== input.canonicalAction ||
      authorization.repositoryId !== input.repository.repositoryId
    ) {
      throw gitMutationError("GIT_RECOVERY_REQUIRED");
    }
    const registered = this.runtime.registerRepository(input.repository);
    let prepared = await this.runtime.prepareOperation({
      authorization,
      authorizedRepositoryId: input.repository.repositoryId,
      operation: {
        repositoryStateKey: registered.repositoryStateKey,
        repositoryId: registered.repositoryId,
        worktreeStateKeys: registered.worktreeStateKeys,
        toolName: input.toolName,
        canonicalAction: input.canonicalAction,
        requestId: authorization.requestId,
        subjectFingerprint: authorization.subjectFingerprint,
        contextFingerprint: authorization.contextFingerprint,
        policyRevision: authorization.policyRevision!,
        resourceFingerprint: authorization.resourceFingerprint,
        capabilityRevision: registered.capabilityRevision,
        configurationRevision: this.configurationRevision,
        participantRequirements: [...new Set([...input.participants, "audit" as const])],
        counts: input.counts,
        privateState: input.privateState
      }
    });
    try {
      await input.preEffect?.();
      prepared = await this.runtime.beginEffect(prepared, input.privateState);
      const result = await input.effect();
      prepared = await this.runtime.observeEffect(
        prepared,
        input.effectState
          ? input.effectState(result)
          : { prepared: input.privateState, result },
        "EFFECT_OBSERVED"
      );
      const terminal = createTerminalAuditEventV4({
        timestamp: new Date().toISOString(),
        requestId: authorization.requestId,
        authorizationEventId: authorization.eventId,
        decisionId: authorization.decisionId,
        toolName: input.toolName,
        canonicalAction: input.canonicalAction,
        workspaceId: input.workspaceId,
        policyRevision: authorization.policyRevision,
        subjectFingerprint: authorization.subjectFingerprint,
        contextFingerprint: authorization.contextFingerprint,
        resultCode: "OK",
        counts: input.counts,
        repositoryId: input.repository.repositoryId,
        taskWorktreeId: null,
        operationId: prepared.operation.operationId,
        status: "succeeded",
        durableEffectObserved: true,
        recoveryRequired: false
      });
      await this.runtime.completeOperation(prepared, terminal);
      return result;
    } catch (error) {
      if (prepared.operation.state === "prepared") {
        await this.runtime.rollBackOperation(prepared, safeResultCode(error)).catch(() => {});
      } else if (!["committed", "rolled_back", "recovery_required"].includes(prepared.operation.state)) {
        await this.runtime.requireRecovery(prepared, safeResultCode(error)).catch(() => {});
      }
      throw error;
    }
  }

  static configurationRevision(value: unknown): string {
    return sha256Git(JSON.stringify(value));
  }
}
