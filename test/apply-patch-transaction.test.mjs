import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChangeSetStore } from "../dist/changesets/index.js";
import { PathGuard } from "../dist/guard.js";
import {
  attachPreparedPatchMutation,
  pendingWorkspaceMutation,
  WorkspaceMutationRuntime
} from "../dist/mutations/index.js";
import { prepareWorkspacePatch } from "../dist/patchOps.js";
import {
  AtomicTransactionEngine,
  installationMasterKey,
  loadOrCreateInstallationState,
  ProcessInstanceRegistry
} from "../dist/transactions/index.js";
import {
  applyPatchOutputSchema,
  applyPatchOutputSchemaV2,
  createApplyPatchSuccess,
  createApplyPatchSuccessV2,
  createApplyPatchTransactionFailureV2
} from "../dist/tools/schemas/applyPatch.js";

const NOW = Date.parse("2026-07-15T00:00:00.000Z");
const OWNER = `owner_${"7".repeat(64)}`;
const digest = (value) => createHash("sha256").update(value).digest("hex");

function mutationContext(contractVersion = 2) {
  return {
    toolName: "apply_patch",
    requestId: "request-apply-patch",
    ownerBinding: OWNER,
    policyRevision: "policy-apply-patch",
    contractVersion,
    now: () => NOW,
    retentionMs: 24 * 60 * 60 * 1000
  };
}

async function fixture(action, options = {}) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-apply-patch-txn-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const workspace = {
    id: "ws_apply_patch_fixture",
    root: workspaceRoot,
    openedAt: "2026-07-15T00:00:00.000Z"
  };
  const config = {
    blockedGlobs: [".env", "**/.env"],
    maxReadBytes: 1024 * 1024,
    maxWriteBytes: 1024 * 1024,
    maxOutputBytes: 1024 * 1024
  };
  const guard = new PathGuard(config, options.platform);
  const registry = new ProcessInstanceRegistry(stateRoot);
  const engine = new AtomicTransactionEngine(config, guard, stateRoot, registry, {
    faultInjector: options.faultInjector,
    now: () => NOW
  });
  const store = new ChangeSetStore({
    stateRoot,
    masterKey: installationMasterKey(loadOrCreateInstallationState({ stateRoot })),
    now: () => NOW
  });
  const runtime = new WorkspaceMutationRuntime({ engine, changeSetStore: store, now: () => NOW });
  try {
    return await action({ root, stateRoot, workspaceRoot, workspace, config, guard, engine, store, runtime });
  } finally {
    store.dispose();
    registry.dispose();
    await fsp.rm(root, { recursive: true, force: true });
  }
}

function multiFilePatch({ invalidDelete = false } = {}) {
  return [
    "diff --git a/replace.txt b/replace.txt",
    "--- a/replace.txt",
    "+++ b/replace.txt",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "diff --git a/create.txt b/create.txt",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/create.txt",
    "@@ -0,0 +1 @@",
    "+created",
    "diff --git a/delete.txt b/delete.txt",
    "deleted file mode 100644",
    "--- a/delete.txt",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    invalidDelete ? "-not-the-current-line" : "-remove",
    ""
  ].join("\n");
}

function sampleData() {
  return {
    workspace_id: "ws_fixture",
    root: "C:/workspace",
    paths: ["replace.txt", "create.txt", "delete.txt"],
    stdout: "",
    stderr: "",
    additions: 2,
    deletions: 2,
    changed: true,
    diff: multiFilePatch().trimEnd()
  };
}

function transactionResult() {
  return {
    change_set_id: `cs_${"1".repeat(32)}`,
    transaction_id: `tx_${"2".repeat(32)}`,
    before_state: "mixed",
    operation_count: 3,
    undo_supported: true,
    committed_at: "2026-07-15T00:00:00.000Z"
  };
}

async function seedFiles(workspaceRoot) {
  await Promise.all([
    fsp.writeFile(path.join(workspaceRoot, "replace.txt"), "old\n"),
    fsp.writeFile(path.join(workspaceRoot, "delete.txt"), "remove\n")
  ]);
}

async function attachPrepared(runtime, workspace, prepared, contractVersion = 2) {
  const baseResult = { ok: true };
  return runtime.invokeProvider({
    requiresMutation: true,
    provider: () => attachPreparedPatchMutation({
      runtime,
      workspace,
      prepared,
      context: mutationContext(contractVersion),
      result: baseResult,
      project: ({ result, transaction, files }) => ({ ...result, transaction, files })
    })
  });
}

test("V1 apply_patch remains exact while V2 requires one transaction and strict per-file facts", () => {
  const v1 = createApplyPatchSuccess(sampleData());
  const files = [
    { path: "replace.txt", before_sha256: digest("old\n"), after_sha256: digest("new\n") },
    { path: "create.txt", before_sha256: null, after_sha256: digest("created\n") },
    { path: "delete.txt", before_sha256: digest("remove\n"), after_sha256: null }
  ];
  const v2 = createApplyPatchSuccessV2({ ...sampleData(), transaction: transactionResult(), files });
  assert.equal(applyPatchOutputSchema.parse(v1).ok, true);
  assert.equal(applyPatchOutputSchemaV2.parse(v2).data.files[2].after_sha256, null);
  assert.equal(applyPatchOutputSchema.safeParse(v2).success, false);
  assert.equal(applyPatchOutputSchemaV2.safeParse({
    ...v2,
    data: { ...v2.data, files: [...files, files[0]] }
  }).success, false);
});

test("V2 apply_patch transaction failures are strict and expose only conflict paths", () => {
  const codes = [
    "FILE_VERSION_CONFLICT",
    "TRANSACTION_BUSY",
    "ATOMIC_BACKEND_UNAVAILABLE",
    "AUDIT_UNAVAILABLE",
    "AUDIT_INTEGRITY_FAILURE",
    "TRANSACTION_FAILED",
    "ROLLBACK_FAILED",
    "TRANSACTION_RECOVERY_REQUIRED"
  ];
  for (const code of codes) {
    const result = createApplyPatchTransactionFailureV2({
      code,
      details: code === "FILE_VERSION_CONFLICT" ? { path: "replace.txt" } : {}
    });
    assert.equal(applyPatchOutputSchemaV2.parse(result).error.code, code);
    assert.deepEqual(Object.keys(result.error.details), code === "FILE_VERSION_CONFLICT" ? ["path"] : []);
    assert.equal(applyPatchOutputSchema.safeParse(result).success, false);
  }
});

test("multi-file patch prepares create replace and delete before one commit", () => fixture(async ({ workspaceRoot, workspace, config, guard, runtime, store, engine }) => {
  await seedFiles(workspaceRoot);
  const prepared = await prepareWorkspacePatch(config, guard, workspace, multiFilePatch());
  assert.deepEqual(prepared.result.paths, ["replace.txt", "create.txt", "delete.txt"]);
  assert.deepEqual(prepared.operations.map(({ operation }) => operation.kind), ["replace", "create", "delete"]);
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "replace.txt"), "utf8"), "old\n");
  await assert.rejects(() => fsp.readFile(path.join(workspaceRoot, "create.txt")), { code: "ENOENT" });

  const result = await attachPrepared(runtime, workspace, prepared);
  const committed = await pendingWorkspaceMutation(result).commit({ result, persistAudit: async () => {} });
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "replace.txt"), "utf8"), "new\n");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "create.txt"), "utf8"), "created\n");
  await assert.rejects(() => fsp.readFile(path.join(workspaceRoot, "delete.txt")), { code: "ENOENT" });
  assert.equal(committed.transaction.operation_count, 3);
  assert.equal(committed.transaction.before_state, "mixed");
  assert.deepEqual(committed.files.map((file) => file.path), prepared.result.paths);
  assert.equal(store.list(engine.workspaceStateKey(workspace.root)).length, 1);
}));

test("an invalid later hunk produces no file change and no pending transaction", () => fixture(async ({ workspaceRoot, workspace, config, guard, store, engine }) => {
  await seedFiles(workspaceRoot);
  await assert.rejects(
    () => prepareWorkspacePatch(config, guard, workspace, multiFilePatch({ invalidDelete: true })),
    /cleanly|hunk|current workspace/i
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "replace.txt"), "utf8"), "old\n");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "delete.txt"), "utf8"), "remove\n");
  await assert.rejects(() => fsp.readFile(path.join(workspaceRoot, "create.txt")), { code: "ENOENT" });
  assert.deepEqual(store.list(engine.workspaceStateKey(workspace.root)), []);
}));

test("Windows comparison keys reject case-folded duplicate patch targets", () => fixture(async ({ workspace, config, guard }) => {
  const patch = [
    "--- /dev/null",
    "+++ b/Case.txt",
    "@@ -0,0 +1 @@",
    "+first",
    "--- /dev/null",
    "+++ b/case.txt",
    "@@ -0,0 +1 @@",
    "+second",
    ""
  ].join("\n");
  await assert.rejects(
    () => prepareWorkspacePatch(config, guard, workspace, patch),
    (error) => error?.patchPlanFailureKind === "invalid"
  );
}, { platform: "win32" }));

test("zero-length hunks use unified-diff insertion coordinates and preserve CRLF", () => fixture(async ({ workspaceRoot, workspace, config, guard }) => {
  await fsp.writeFile(path.join(workspaceRoot, "lines.txt"), "one\r\nthree\r\n");
  const patch = [
    "--- a/lines.txt",
    "+++ b/lines.txt",
    "@@ -1,0 +2 @@",
    "+two",
    "@@ -2 +3 @@",
    "-three",
    "+THREE",
    ""
  ].join("\n");
  const prepared = await prepareWorkspacePatch(config, guard, workspace, patch);
  assert.equal(prepared.operations[0].operation.bytes.toString("utf8"), "one\r\ntwo\r\nTHREE\r\n");
}));

test("no-newline markers preserve an absent final line ending", () => fixture(async ({ workspaceRoot, workspace, config, guard }) => {
  await fsp.writeFile(path.join(workspaceRoot, "tail.txt"), "tail");
  const patch = [
    "--- a/tail.txt",
    "+++ b/tail.txt",
    "@@ -1 +1 @@",
    "-tail",
    "\\ No newline at end of file",
    "+done",
    "\\ No newline at end of file",
    ""
  ].join("\n");
  const prepared = await prepareWorkspacePatch(config, guard, workspace, patch);
  assert.equal(prepared.operations[0].operation.bytes.toString("utf8"), "done");
}));

test("unsupported rename copy and special-mode metadata fail closed", () => fixture(async ({ workspace, config, guard }) => {
  const patches = [
    [
      "diff --git a/source.txt b/copied.txt",
      "similarity index 100%",
      "copy from source.txt",
      "copy to copied.txt",
      "--- /dev/null",
      "+++ b/copied.txt",
      "@@ -0,0 +1 @@",
      "+copied",
      ""
    ].join("\n"),
    [
      "diff --git a/link.txt b/link.txt",
      "new file mode 120000",
      "--- /dev/null",
      "+++ b/link.txt",
      "@@ -0,0 +1 @@",
      "+target.txt",
      ""
    ].join("\n"),
    [
      "diff --git a/executable.txt b/executable.txt",
      "new file mode 100755",
      "--- /dev/null",
      "+++ b/executable.txt",
      "@@ -0,0 +1 @@",
      "+echo hi",
      ""
    ].join("\n")
  ];
  for (const patch of patches) {
    await assert.rejects(
      () => prepareWorkspacePatch(config, guard, workspace, patch),
      (error) => error?.patchPlanFailureKind === "invalid" || error?.patchPlanFailureKind === "check_failed"
    );
  }
}));

test("expected_files is a bounded touched-file subset and stale facts fail before mutation", () => fixture(async ({ workspaceRoot, workspace, config, guard }) => {
  await seedFiles(workspaceRoot);
  await assert.rejects(
    () => prepareWorkspacePatch(config, guard, workspace, multiFilePatch(), {
      expectedFiles: { "replace.txt": digest("stale") }
    }),
    (error) => error?.code === "FILE_VERSION_CONFLICT" && error.safeDetails?.relativePath === "replace.txt"
  );
  await assert.rejects(
    () => prepareWorkspacePatch(config, guard, workspace, multiFilePatch(), {
      expectedFiles: { "outside-the-patch.txt": null }
    }),
    (error) => error?.patchPlanFailureKind === "invalid"
  );
  const prepared = await prepareWorkspacePatch(config, guard, workspace, multiFilePatch(), {
    expectedFiles: {
      "replace.txt": digest("old\n"),
      "create.txt": null,
      "delete.txt": digest("remove\n")
    }
  });
  assert.equal(prepared.operations.length, 3);
}));

test("Windows expected_files rejects duplicate case-folded keys", () => fixture(async ({ workspaceRoot, workspace, config, guard }) => {
  await seedFiles(workspaceRoot);
  await assert.rejects(
    () => prepareWorkspacePatch(config, guard, workspace, multiFilePatch(), {
      expectedFiles: {
        "replace.txt": digest("old\n"),
        "REPLACE.TXT": digest("old\n")
      }
    }),
    (error) => error?.patchPlanFailureKind === "invalid"
  );
}, { platform: "win32" }));

for (const failAfterInstall of [1, 2, 3]) {
  test(`fault after visible install ${failAfterInstall} rolls back the complete patch`, () => {
    let installs = 0;
    return fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
      await seedFiles(workspaceRoot);
      const prepared = await prepareWorkspacePatch(config, guard, workspace, multiFilePatch());
      const result = await attachPrepared(runtime, workspace, prepared);
      await assert.rejects(
        () => pendingWorkspaceMutation(result).commit({ result, persistAudit: async () => {} })
      );
      assert.equal(await fsp.readFile(path.join(workspaceRoot, "replace.txt"), "utf8"), "old\n");
      assert.equal(await fsp.readFile(path.join(workspaceRoot, "delete.txt"), "utf8"), "remove\n");
      await assert.rejects(() => fsp.readFile(path.join(workspaceRoot, "create.txt")), { code: "ENOENT" });
    }, {
      faultInjector: {
        hit(point) {
          if (point === "after_each_install" && ++installs === failAfterInstall) {
            throw new Error("injected visible install failure");
          }
        }
      }
    });
  });
}

test("required audit failure restores all files and publishes no change set", () => fixture(async ({ workspaceRoot, workspace, config, guard, runtime, store, engine }) => {
  await seedFiles(workspaceRoot);
  const prepared = await prepareWorkspacePatch(config, guard, workspace, multiFilePatch());
  const result = await attachPrepared(runtime, workspace, prepared);
  await assert.rejects(
    () => pendingWorkspaceMutation(result).commit({
      result,
      persistAudit: async () => { throw new Error("audit unavailable"); }
    }),
    (error) => error?.code === "AUDIT_UNAVAILABLE"
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "replace.txt"), "utf8"), "old\n");
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "delete.txt"), "utf8"), "remove\n");
  await assert.rejects(() => fsp.readFile(path.join(workspaceRoot, "create.txt")), { code: "ENOENT" });
  assert.deepEqual(store.list(engine.workspaceStateKey(workspace.root)), []);
}));

test("V1 projection stays exact after an atomic patch commit", () => fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
  await seedFiles(workspaceRoot);
  const prepared = await prepareWorkspacePatch(config, guard, workspace, multiFilePatch());
  const v1 = createApplyPatchSuccess({ ...sampleData(), root: workspace.root, workspace_id: workspace.id });
  const result = await runtime.invokeProvider({
    requiresMutation: true,
    provider: () => attachPreparedPatchMutation({
      runtime,
      workspace,
      prepared,
      context: mutationContext(1),
      result: v1
    })
  });
  const committed = await pendingWorkspaceMutation(result).commit({ result, persistAudit: async () => {} });
  assert.deepEqual(committed, v1);
  assert.equal(applyPatchOutputSchema.parse(committed).ok, true);
  assert.equal(applyPatchOutputSchemaV2.safeParse(committed).success, false);
}));
