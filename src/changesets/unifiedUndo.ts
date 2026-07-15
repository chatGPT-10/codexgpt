import type { Workspace } from "../guard.js";
import type { AtomicTransactionEngine } from "../transactions/engine.js";
import type { ChangeSetStore } from "./store.js";
import type {
  PrepareUndoChangeSetInput,
  PreparedUndoChangeSet,
  UndoChangeSetService
} from "./undo.js";
import { UndoChangeSetError } from "./undo.js";
import type { MoveUndoChangeSetService } from "./moveUndo.js";

export interface UnifiedUndoChangeSetServiceOptions {
  engine: Pick<AtomicTransactionEngine, "workspaceStateKey">;
  changeSetStore: Pick<ChangeSetStore, "probe">;
  v1: Pick<UndoChangeSetService, "prepare" | "describeResource">;
  v2: Pick<MoveUndoChangeSetService, "probe" | "prepare" | "describeResource">;
}

type UndoVersion = 1 | 2;

export class UnifiedUndoChangeSetService {
  constructor(private readonly options: UnifiedUndoChangeSetServiceOptions) {}

  private version(workspace: Workspace, changeSetId: string): UndoVersion {
    const workspaceStateKey = this.options.engine.workspaceStateKey(workspace.root);
    const v1 = this.options.changeSetStore.probe(workspaceStateKey, changeSetId);
    const v2 = this.options.v2.probe(workspace, changeSetId);
    if (v1 === "present" && v2 === "absent") return 1;
    if (v1 === "absent" && v2 === "present") return 2;
    if (v1 === "absent" && v2 === "absent") {
      throw new UndoChangeSetError("CHANGE_SET_NOT_FOUND", "Change set was not found.");
    }
    throw new UndoChangeSetError(
      "TRANSACTION_RECOVERY_REQUIRED",
      "Change-set version or integrity evidence is ambiguous."
    );
  }

  describeResource(input: {
    workspace: Workspace;
    changeSetId: string;
    ownerBinding: string;
  }) {
    return this.version(input.workspace, input.changeSetId) === 2
      ? this.options.v2.describeResource(input)
      : this.options.v1.describeResource(input);
  }

  prepare<T extends object = Record<string, unknown>>(
    input: PrepareUndoChangeSetInput<T>
  ): Promise<PreparedUndoChangeSet> {
    return this.version(input.workspace, input.changeSetId) === 2
      ? this.options.v2.prepare(input)
      : this.options.v1.prepare(input);
  }
}
