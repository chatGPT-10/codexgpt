import { createHash } from "node:crypto";
import { PathGuard } from "../../dist/guard.js";
import {
  AtomicTransactionEngine,
  ProcessInstanceRegistry
} from "../../dist/transactions/index.js";

const [stateRoot, workspaceRoot] = process.argv.slice(2);
if (!stateRoot || !workspaceRoot) process.exit(64);

const digest = (value) => createHash("sha256").update(value).digest("hex");
const config = { blockedGlobs: [], maxWriteBytes: 1024 * 1024 };
const workspace = {
  id: "ws_crash_fixture",
  root: workspaceRoot,
  openedAt: new Date().toISOString()
};
const registry = new ProcessInstanceRegistry(stateRoot);
const engine = new AtomicTransactionEngine(
  config,
  new PathGuard(config),
  stateRoot,
  registry,
  {
    faultInjector: {
      hit(point, facts) {
        if (point === "after_each_install" && facts.index === 0) {
          process.exit(91);
        }
      }
    }
  }
);

const prepared = await engine.prepare({
  workspace,
  requiredParticipants: ["audit"],
  operations: [
    {
      operationId: "op_replace_a",
      kind: "replace",
      relativePath: "a.txt",
      bytes: Buffer.from("new-a"),
      expectedSha256: digest("old-a")
    },
    {
      operationId: "op_create_b",
      kind: "create",
      relativePath: "b.txt",
      bytes: Buffer.from("new-b"),
      expectedAbsent: true
    },
    {
      operationId: "op_delete_c",
      kind: "delete",
      relativePath: "c.txt",
      expectedSha256: digest("old-c")
    }
  ]
});
await prepared.commit();
process.exit(92);
