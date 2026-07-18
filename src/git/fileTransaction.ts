import { randomBytes } from "node:crypto";
import type { Workspace } from "../guard.js";
import type { AtomicTransactionEngine } from "../transactions/engine.js";

export type GitFileMutationV4 =
  | { kind: "create"; path: string; bytes: Buffer }
  | { kind: "replace"; path: string; bytes: Buffer; expectedSha256: string }
  | { kind: "delete"; path: string; expectedSha256: string };

export class GitFileTransactionV4 {
  constructor(
    private readonly engine: Pick<AtomicTransactionEngine, "prepare">
  ) {}

  async run<T>(input: {
    workspace: Workspace;
    operations: readonly GitFileMutationV4[];
    commitGitState?: () => Promise<T>;
  }): Promise<T | null> {
    if (input.operations.length === 0) {
      return input.commitGitState ? input.commitGitState() : null;
    }
    const requiredParticipants = input.commitGitState ? ["git_state"] : [];
    const prepared = await this.engine.prepare({
      workspace: input.workspace,
      operations: input.operations.map((operation, index) => ({
        operationId: `op_git_${index}_${randomBytes(4).toString("hex")}`,
        relativePath: operation.path,
        ...(operation.kind === "create"
          ? { kind: "create" as const, bytes: operation.bytes, expectedAbsent: true as const }
          : operation.kind === "replace"
            ? {
                kind: "replace" as const,
                bytes: operation.bytes,
                expectedSha256: operation.expectedSha256
              }
            : {
                kind: "delete" as const,
                expectedSha256: operation.expectedSha256
              })
      })),
      requiredParticipants
    });
    let pending;
    try {
      pending = await prepared.commit();
      let result: T | null = null;
      if (input.commitGitState) {
        await pending.commitParticipant("git_state", async () => {
          result = await input.commitGitState!();
        });
      }
      await pending.finalize();
      return result;
    } catch (error) {
      await (pending ?? prepared).rollback("git_file_transaction_failed").catch(() => {});
      throw error;
    }
  }
}
