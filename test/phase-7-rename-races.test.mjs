import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChangeSetStore } from "../dist/changesets/index.js";
import { prepareWorkspaceTextBatch } from "../dist/fsOps.js";
import { PathGuard } from "../dist/guard.js";
import {
  attachPreparedBatchMutation,
  pendingWorkspaceMutation,
  WorkspaceMutationRuntime
} from "../dist/mutations/index.js";
import { readSemanticSourceSnapshot } from "../dist/semantic/index.js";
import {
  AtomicTransactionEngine,
  installationMasterKey,
  loadOrCreateInstallationState,
  ProcessInstanceRegistry
} from "../dist/transactions/index.js";
import { createDistinctReplacement } from "./fixtures/filesystem-identity.js";

const NOW = Date.parse("2026-07-23T00:00:00.000Z");
const SEMANTIC_FACTS = `sha256:${"7".repeat(64)}`;

async function fixture(action, faultInjector) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-semantic-race-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const workspace = {
    id: "ws_semantic_race",
    root: workspaceRoot,
    openedAt: "2026-07-23T00:00:00.000Z"
  };
  const config = {
    blockedGlobs: [".env", "**/.env"],
    maxReadBytes: 1024 * 1024,
    maxWriteBytes: 1024 * 1024,
    maxOutputBytes: 1024 * 1024
  };
  const guard = new PathGuard(config);
  const registry = new ProcessInstanceRegistry(stateRoot);
  const engine = new AtomicTransactionEngine(config, guard, stateRoot, registry, {
    faultInjector,
    now: () => NOW
  });
  const store = new ChangeSetStore({
    stateRoot,
    masterKey: installationMasterKey(loadOrCreateInstallationState({ stateRoot })),
    now: () => NOW
  });
  const runtime = new WorkspaceMutationRuntime({ engine, changeSetStore: store, now: () => NOW });
  try {
    return await action({ workspaceRoot, workspace, config, guard, runtime, store, engine });
  } finally {
    store.dispose();
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function semanticPrepared(config, guard, workspace, relativePath, resultingText) {
  const read = await readSemanticSourceSnapshot({
    root: workspace.root,
    relativePath,
    maxBytes: config.maxReadBytes,
    blockedGlobs: config.blockedGlobs
  });
  assert.equal(read.ok, true);
  return prepareWorkspaceTextBatch(config, guard, workspace, [{
    path: relativePath,
    content: resultingText,
    mode: "replace",
    expectedSha256: read.snapshot.sha256,
    expectedStableIdentity: {
      dev: read.snapshot.stableIdentity.dev,
      ino: read.snapshot.stableIdentity.ino
    },
    expectedParentIdentity: read.snapshot.parentIdentity
  }]);
}

async function attach(runtime, workspace, prepared, validateSemanticReservation) {
  const result = { ok: true };
  return runtime.invokeProvider({
    requiresMutation: true,
    provider: () => attachPreparedBatchMutation({
      runtime,
      workspace,
      prepared,
      context: {
        toolName: "apply_patch",
        requestId: "request-semantic-race",
        ownerBinding: `owner_${"8".repeat(64)}`,
        policyRevision: "policy-semantic-race",
        contractVersion: 3,
        semanticFactsDigest: SEMANTIC_FACTS,
        ...(validateSemanticReservation ? { validateSemanticReservation } : {}),
        now: () => NOW
      },
      result
    })
  });
}

test("lock-held semantic replace rejects a distinct same-content file object", () => {
  let target;
  let replacement;
  return fixture(async ({ workspaceRoot, workspace, config, guard, runtime, store, engine }) => {
    target = path.join(workspaceRoot, "value.ts");
    replacement = path.join(workspaceRoot, "replacement.ts");
    await fsp.writeFile(target, "export const value = 1;\n");
    await createDistinctReplacement(target, replacement, "export const value = 1;\n");
    const prepared = await semanticPrepared(config, guard, workspace, "value.ts", "export const renamed = 1;\n");

    await assert.rejects(
      () => attach(runtime, workspace, prepared),
      (error) => error?.code === "FILE_VERSION_CONFLICT"
    );
    assert.equal(await fsp.readFile(target, "utf8"), "export const value = 1;\n");
    assert.deepEqual(store.list(engine.workspaceStateKey(workspace.root)), []);
  }, {
    async hit(point) {
      if (point !== "after_manifest_preparing") return;
      await fsp.rm(target);
      await fsp.rename(replacement, target);
    }
  });
});

test("semantic batch carries one exact authorization digest into the transaction request", async () => {
  let captured;
  const pending = {
    transactionId: `tx_${"1".repeat(32)}`,
    changeSetId: `cs_${"2".repeat(32)}`,
    operationCount: 1,
    mutationKinds: ["replace"],
    async commit({ result }) { return result; },
    projectFailure() { return null; },
    async rollback() {}
  };
  const runtime = {
    async prepare(input) {
      captured = input.transaction;
      return pending;
    }
  };
  const before = Buffer.from("old\n");
  await attachPreparedBatchMutation({
    runtime,
    workspace: { id: "ws_digest", root: "C:/fixture", openedAt: "2026-07-23T00:00:00.000Z" },
    prepared: {
      operations: [{
        path: "value.ts",
        before: {
          exists: true,
          sha256: "cba06b5736faf67e54b07b561eae94395e774c517a7d910a54369e1263ccfbd4",
          bytes: before,
          metadata: { mode: 0, atimeMs: 0, mtimeMs: 0, ctimeMs: 0 }
        },
        afterSha256: "11507a0e2f5e69d5dfa40a62a1bd7b6ee57e6bcd85c67c9b8431b36fff21c437",
        operation: {
          operationId: "op_semantic_digest",
          kind: "replace",
          relativePath: "value.ts",
          bytes: Buffer.from("new\n"),
          expectedSha256: "cba06b5736faf67e54b07b561eae94395e774c517a7d910a54369e1263ccfbd4"
        }
      }]
    },
    context: {
      toolName: "apply_patch",
      requestId: null,
      ownerBinding: `owner_${"8".repeat(64)}`,
      policyRevision: "policy",
      contractVersion: 3,
      semanticFactsDigest: SEMANTIC_FACTS,
      now: () => NOW
    },
    result: { ok: true }
  });
  assert.equal(captured.semanticFactsDigest, SEMANTIC_FACTS);
});

test("lock-held semantic replace rejects a replaced parent even when the same file object returns", () => {
  let parent;
  let target;
  let parked;
  return fixture(async ({ workspaceRoot, workspace, config, guard, runtime, store, engine }) => {
    parent = path.join(workspaceRoot, "src");
    target = path.join(parent, "value.ts");
    parked = path.join(workspaceRoot, "parked.ts");
    await fsp.mkdir(parent);
    await fsp.writeFile(target, "export const value = 1;\n");
    const prepared = await semanticPrepared(config, guard, workspace, "src/value.ts", "export const renamed = 1;\n");
    await assert.rejects(
      () => attach(runtime, workspace, prepared),
      (error) => error?.code === "FILE_VERSION_CONFLICT"
    );
    assert.equal(await fsp.readFile(target, "utf8"), "export const value = 1;\n");
    assert.deepEqual(store.list(engine.workspaceStateKey(workspace.root)), []);
  }, {
    async hit(point) {
      if (point !== "after_manifest_preparing") return;
      await fsp.rename(target, parked);
      await fsp.rmdir(parent);
      await fsp.mkdir(parent);
      await fsp.rename(parked, target);
    }
  });
});

test("BOM and CRLF survive semantic bytes through atomic apply", () => {
  return fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
    const target = path.join(workspaceRoot, "value.ts");
    const before = "\uFEFFexport const value = 1;\r\n";
    const after = "\uFEFFexport const renamed = 1;\r\n";
    await fsp.writeFile(target, Buffer.from(before, "utf8"));
    const prepared = await semanticPrepared(config, guard, workspace, "value.ts", after);
    const result = await attach(runtime, workspace, prepared);
    const pending = pendingWorkspaceMutation(result);
    assert.ok(pending);
    await pending.commit({ result, persistAudit() {} });
    assert.deepEqual(await fsp.readFile(target), Buffer.from(after, "utf8"));
  });
});

test("revoked semantic reservation fails inside the workspace lock before install", () => {
  let authorized = true;
  return fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
    const target = path.join(workspaceRoot, "value.ts");
    await fsp.writeFile(target, "export const value = 1;\n");
    const prepared = await semanticPrepared(config, guard, workspace, "value.ts", "export const renamed = 1;\n");
    await assert.rejects(
      () => attach(runtime, workspace, prepared, () => {
        if (!authorized) throw new Error("Semantic preview is unavailable.");
      }),
      /Transaction commit failed|Semantic preview is unavailable|transaction/i
    );
    assert.equal(await fsp.readFile(target, "utf8"), "export const value = 1;\n");
  }, {
    hit(point) {
      if (point === "after_manifest_preparing") authorized = false;
    }
  });
});
