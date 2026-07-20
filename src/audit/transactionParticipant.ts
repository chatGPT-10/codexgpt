import type {
  AuditAuthorizationContextV2,
  AuditExecutionInputV2
} from "../policy/integration.js";
import {
  TransactionError,
  type CommittedTransaction,
  type PendingTransactionCommit
} from "../transactions/types.js";
import { AuditError, type AuditMutationKind } from "./types.js";

const EXECUTION_AUDIT_FACTS = Symbol("codexgpt.execution.audit.facts");

export interface ExecutionAuditFacts {
  resultCode: string | null;
  exitCode: number | null;
  boundedByteCounts: Record<string, number>;
  changeSetId: string | null;
  operationCount: number;
  mutationKinds: AuditMutationKind[];
  pendingMutationCommit: PendingTransactionCommit | null;
}

export function attachExecutionAuditFacts<T extends object>(
  result: T,
  facts: ExecutionAuditFacts
): T {
  Object.defineProperty(result, EXECUTION_AUDIT_FACTS, {
    value: facts,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return result;
}

export function executionAuditFacts(value: unknown): ExecutionAuditFacts | null {
  if (!value || typeof value !== "object") return null;
  const facts = (value as Record<symbol, unknown>)[EXECUTION_AUDIT_FACTS];
  if (facts && typeof facts === "object") return facts as ExecutionAuditFacts;
  const structured = (value as { structuredContent?: unknown }).structuredContent;
  if (!structured || typeof structured !== "object") return null;
  const nested = (structured as Record<symbol, unknown>)[EXECUTION_AUDIT_FACTS];
  return nested && typeof nested === "object" ? nested as ExecutionAuditFacts : null;
}

export interface TransactionAuditRuntime {
  persistExecution(
    context: AuditAuthorizationContextV2,
    execution: AuditExecutionInputV2
  ): void | Promise<void>;
}

export interface CommitTransactionWithAuditInput {
  pending: PendingTransactionCommit;
  runtime: TransactionAuditRuntime;
  context: AuditAuthorizationContextV2;
  execution: AuditExecutionInputV2;
}

export async function commitAuditParticipant(
  input: CommitTransactionWithAuditInput
): Promise<void> {
  try {
    await input.pending.commitParticipant("audit", async () => {
      await input.runtime.persistExecution(input.context, input.execution);
    });
  } catch {
    try {
      await input.pending.rollback("audit_completion_failed");
    } catch {
      throw new TransactionError(
        "TRANSACTION_RECOVERY_REQUIRED",
        "Audit completion failed and transaction rollback could not be proven."
      );
    }
    throw new AuditError(
      "AUDIT_UNAVAILABLE",
      "Audit completion failed and the transaction was rolled back."
    );
  }
}

export async function commitTransactionWithAudit(
  input: CommitTransactionWithAuditInput
): Promise<CommittedTransaction> {
  await commitAuditParticipant(input);
  return input.pending.finalize();
}
