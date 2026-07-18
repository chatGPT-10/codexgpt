import type { TaskWorktreeStoreV1 } from "./store.js";

export class TaskWorktreeRecoveryV4 {
  constructor(private readonly store: TaskWorktreeStoreV1) {}

  recover(_ownerFingerprint?: string): Array<{ taskWorktreeId: string; outcome: string }> {
    const results = [];
    for (const { record } of this.store.listAll()) {
      if (record.state === "preparing") {
        this.store.update(record.taskWorktreeId, { state: "recovery_required" });
        results.push({ taskWorktreeId: record.taskWorktreeId, outcome: "recovery_required" });
      }
    }
    return results;
  }
}
