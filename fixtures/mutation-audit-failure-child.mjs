import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PathGuard } from "../dist/guard.js";
import { ChangeSetStore } from "../dist/changesets/index.js";
import {
  attachPendingWorkspaceMutation,
  pendingWorkspaceMutation,
  WorkspaceMutationRuntime
} from "../dist/mutations/index.js";
import {
  AtomicTransactionEngine,
  installationMasterKey,
  loadOrCreateInstallationState,
  ProcessInstanceRegistry
} from "../dist/transactions/index.js";

const [stateRoot, workspaceRoot] = process.argv.slice(2);
if (!stateRoot || !workspaceRoot) throw new Error("missing mutation fixture paths");

const digest = (value) => createHash("sha256").update(value).digest("hex");
const config = { blockedGlobs: [], maxWriteBytes: 1024 * 1024 };
const workspace = {
  id: "ws_audit_failure_child",
  root: fs.realpathSync.native(workspaceRoot),
  openedAt: "2026-07-14T00:00:00.000Z"
};
const registry = new ProcessInstanceRegistry(stateRoot);
const engine = new AtomicTransactionEngine(config, new PathGuard(config), stateRoot, registry);
const store = new ChangeSetStore({
  stateRoot,
  masterKey: installationMasterKey(loadOrCreateInstallationState({ stateRoot }))
});
const runtime = new WorkspaceMutationRuntime({ engine, changeSetStore: store });

try {
  const result = await runtime.invokeProvider({
    requiresMutation: true,
    provider: async () => {
      const pending = await runtime.prepare({
        transaction: {
          workspace,
          operations: [{
            operationId: "op_replace_child",
            kind: "replace",
            relativePath: "subject.txt",
            bytes: Buffer.from("new"),
            expectedSha256: digest("old")
          }]
        },
        changeSet({ transactionId, changeSetId, workspaceStateKey }) {
          const createdAt = "2026-07-14T12:00:00.000Z";
          return {
            manifest: {
              schemaVersion: 1,
              transactionId,
              changeSetId,
              workspaceStateKey,
              generation: 1,
              createdAt,
              updatedAt: createdAt,
              expiresAt: "2026-07-15T12:00:00.000Z",
              toolName: "write",
              requestId: "request-child",
              ownerBinding: `owner_${"7".repeat(64)}`,
              policyRevision: "policy-child",
              contractVersion: 1,
              state: "active",
              undoSupported: true,
              undoReason: null,
              operations: [{
                operationId: "op_replace_child",
                kind: "replace",
                relativePath: "subject.txt",
                destinationRelativePath: null,
                before: {
                  exists: true,
                  sha256: digest("old"),
                  bytes: 3,
                  metadata: { mode: 0o644, atimeMs: 1, mtimeMs: 2 }
                },
                after: { exists: true, sha256: digest("new"), bytes: 3 },
                blobId: `blob_${"8".repeat(32)}`
              }],
              plaintextBytes: 3,
              ciphertextBytes: 40,
              revertsChangeSetId: null
            },
            blobs: [{
              blobId: `blob_${"8".repeat(32)}`,
              operationId: "op_replace_child",
              beforeSha256: digest("old"),
              plaintext: Buffer.from("old")
            }]
          };
        }
      });
      return attachPendingWorkspaceMutation({ structuredContent: { ok: true } }, pending);
    }
  });
  let code = null;
  try {
    await pendingWorkspaceMutation(result).commit({
      result,
      persistAudit: async () => { throw new Error("injected durable append failure"); }
    });
  } catch (error) {
    code = error?.code ?? null;
  }
  process.stdout.write(JSON.stringify({
    code,
    content: fs.readFileSync(path.join(workspace.root, "subject.txt"), "utf8"),
    changeSetCount: store.list(engine.workspaceStateKey(workspace.root)).length
  }));
} finally {
  store.dispose();
  registry.dispose();
}
