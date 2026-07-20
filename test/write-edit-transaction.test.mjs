import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChangeSetStore } from "../dist/changesets/index.js";
import { PathGuard } from "../dist/guard.js";
import {
  prepareEditTextFile,
  prepareWriteTextFile
} from "../dist/fsOps.js";
import {
  attachPreparedFileMutation,
  pendingWorkspaceMutation,
  WorkspaceMutationRuntime
} from "../dist/mutations/index.js";
import {
  AtomicTransactionEngine,
  installationMasterKey,
  loadOrCreateInstallationState,
  ProcessInstanceRegistry
} from "../dist/transactions/index.js";
import {
  createWriteSuccessV2,
  createWriteTransactionFailureV2,
  writeOutputSchema,
  writeOutputSchemaV2
} from "../dist/tools/schemas/write.js";
import {
  createEditSuccessV2,
  createEditTransactionFailureV2,
  editOutputSchema,
  editOutputSchemaV2
} from "../dist/tools/schemas/edit.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const OWNER = `owner_${"5".repeat(64)}`;
const NOW = Date.parse("2026-07-14T12:00:00.000Z");

async function fixture(action, engineOptions = {}) {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-write-edit-txn-"));
  const root = await fsp.realpath(raw);
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fsp.mkdir(workspaceRoot);
  const workspace = {
    id: "ws_write_edit_fixture",
    root: workspaceRoot,
    openedAt: "2026-07-14T00:00:00.000Z"
  };
  const config = {
    blockedGlobs: [],
    maxReadBytes: 1024 * 1024,
    maxWriteBytes: 1024 * 1024
  };
  const guard = new PathGuard(config);
  const registry = new ProcessInstanceRegistry(stateRoot);
  const engine = new AtomicTransactionEngine(config, guard, stateRoot, registry, {
    ...engineOptions,
    now: engineOptions.now ?? (() => NOW)
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

function mutationContext(toolName, contractVersion = 2) {
  return {
    toolName,
    requestId: "request-write-edit",
    ownerBinding: OWNER,
    policyRevision: "policy-write-edit",
    contractVersion,
    now: () => NOW,
    retentionMs: 24 * 60 * 60 * 1000
  };
}

async function pendingFor(runtime, workspace, prepared, toolName, result = { ok: true }) {
  return runtime.invokeProvider({
    requiresMutation: true,
    provider: () => attachPreparedFileMutation({
      runtime,
      workspace,
      prepared,
      context: mutationContext(toolName),
      result,
      project: ({ result: committedResult, transaction, beforeSha256 }) => ({
        ...committedResult,
        transaction,
        beforeSha256
      })
    })
  });
}

test("V1 write/edit outputs remain exact while V2 requires transaction facts", () => {
  const transaction = {
    change_set_id: `cs_${"1".repeat(32)}`,
    transaction_id: `tx_${"2".repeat(32)}`,
    before_state: "present",
    operation_count: 1,
    undo_supported: true,
    committed_at: "2026-07-14T12:00:00.000Z"
  };
  const writeData = {
    workspace_id: "ws_fixture",
    root: "C:/workspace",
    path: "a.txt",
    existed: true,
    bytes: 3,
    sha256: digest("new"),
    additions: 1,
    deletions: 1,
    diff: "diff"
  };
  const editData = {
    workspace_id: "ws_fixture",
    root: "C:/workspace",
    path: "a.txt",
    replacements: 1,
    bytes: 3,
    sha256: digest("new"),
    additions: 1,
    deletions: 1,
    diff: "diff"
  };

  const writeV2 = createWriteSuccessV2({ ...writeData, transaction, before_sha256: digest("old") });
  const editV2 = createEditSuccessV2({ ...editData, transaction, before_sha256: digest("old") });
  assert.equal(writeOutputSchemaV2.parse(writeV2).data.before_sha256, digest("old"));
  assert.equal(editOutputSchemaV2.parse(editV2).data.transaction.transaction_id, transaction.transaction_id);
  assert.equal(writeOutputSchema.safeParse(writeV2).success, false);
  assert.equal(editOutputSchema.safeParse(editV2).success, false);
});

test("V2 write/edit transaction failures are strict and expose a path only for version conflicts", () => {
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
    const details = code === "FILE_VERSION_CONFLICT" ? { path: "safe.txt" } : {};
    const writeFailure = createWriteTransactionFailureV2({ code, details });
    const editFailure = createEditTransactionFailureV2({ code, details });
    assert.equal(writeOutputSchemaV2.parse(writeFailure).error.code, code);
    assert.equal(editOutputSchemaV2.parse(editFailure).error.code, code);
    assert.deepEqual(Object.keys(writeFailure.error.details), code === "FILE_VERSION_CONFLICT" ? ["path"] : []);
    assert.equal(writeOutputSchema.safeParse(writeFailure).success, false);
    assert.equal(editOutputSchema.safeParse(editFailure).success, false);
  }
  assert.equal(writeOutputSchemaV2.safeParse({
    ...createWriteTransactionFailureV2({ code: "TRANSACTION_BUSY", details: {} }),
    error: {
      ...createWriteTransactionFailureV2({ code: "TRANSACTION_BUSY", details: {} }).error,
      details: { path: "must-not-leak.txt" }
    }
  }).success, false);
});

test("atomic write captures absence and exact UTF-8 bytes", () => fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
  const content = "alpha\r\nβeta\n";
  const prepared = await prepareWriteTextFile(config, guard, workspace, "created.txt", content, {
    createDirs: false,
    overwrite: false
  });
  assert.equal(prepared.before.sha256, null);
  assert.equal(prepared.operation.kind, "create");
  assert.ok(prepared.operation.bytes.equals(Buffer.from(content, "utf8")));

  const result = await pendingFor(runtime, workspace, prepared, "write");
  const pending = pendingWorkspaceMutation(result);
  assert.ok(pending);
  assert.rejects(() => fsp.readFile(path.join(workspaceRoot, "created.txt")), { code: "ENOENT" });
  const committed = await pending.commit({ result, persistAudit: async () => {} });
  assert.ok((await fsp.readFile(path.join(workspaceRoot, "created.txt"))).equals(Buffer.from(content, "utf8")));
  assert.equal(committed.beforeSha256, null);
  assert.equal(committed.transaction.before_state, "absent");
}));

test("write expected hash and overwrite:false fail before a transaction is prepared", () => fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
  await assert.rejects(
    () => prepareWriteTextFile(config, guard, workspace, "missing.txt", "new", {
      createDirs: false,
      overwrite: true,
      expectedSha256: digest("old")
    }),
    (error) => error?.code === "FILE_VERSION_CONFLICT" && error.safeDetails?.relativePath === "missing.txt"
  );
  await fsp.writeFile(path.join(workspaceRoot, "existing.txt"), "old");
  await assert.rejects(
    () => prepareWriteTextFile(config, guard, workspace, "existing.txt", "new", {
      createDirs: false,
      overwrite: false
    }),
    /overwrite=false/
  );
  await assert.rejects(
    () => runtime.invokeProvider({ requiresMutation: true, provider: async () => ({ ok: true }) }),
    (error) => error?.code === "TRANSACTION_PRECONDITION_FAILED"
  );
}));

test("concurrent create never clobbers the external target", () => fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
  const prepared = await prepareWriteTextFile(config, guard, workspace, "race.txt", "ours", {
    createDirs: false,
    overwrite: false
  });
  const result = await pendingFor(runtime, workspace, prepared, "write");
  await fsp.writeFile(path.join(workspaceRoot, "race.txt"), "external");
  await assert.rejects(
    () => pendingWorkspaceMutation(result).commit({ result, persistAudit: async () => {} }),
    (error) => error?.code === "FILE_VERSION_CONFLICT"
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "race.txt"), "utf8"), "external");
}));

test("atomic edit preserves untouched UTF-8 BOM and CRLF bytes", () => fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
  const before = Buffer.from("\ufefffirst\r\nold value\r\nlast\r\n", "utf8");
  await fsp.writeFile(path.join(workspaceRoot, "bom.txt"), before);
  const prepared = await prepareEditTextFile(config, guard, workspace, "bom.txt", "old value", "new value", {
    replaceAll: false,
    expectedReplacements: 1,
    expectedSha256: digest(before)
  });
  assert.equal(prepared.before.sha256, digest(before));
  assert.ok(prepared.operation.bytes.equals(Buffer.from("\ufefffirst\r\nnew value\r\nlast\r\n", "utf8")));
  const result = await pendingFor(runtime, workspace, prepared, "edit");
  const committed = await pendingWorkspaceMutation(result).commit({ result, persistAudit: async () => {} });
  assert.ok((await fsp.readFile(path.join(workspaceRoot, "bom.txt"))).equals(prepared.operation.bytes));
  assert.equal(committed.transaction.before_state, "present");
}));

test("edit snippet and caller-version failures happen before transaction preparation", () => fixture(async ({ workspaceRoot, workspace, config, guard }) => {
  await fsp.writeFile(path.join(workspaceRoot, "edit.txt"), "same same");
  await assert.rejects(
    () => prepareEditTextFile(config, guard, workspace, "edit.txt", "same", "new", {
      replaceAll: false,
      expectedSha256: digest("same same")
    }),
    /matched 2 times/
  );
  await assert.rejects(
    () => prepareEditTextFile(config, guard, workspace, "edit.txt", "same", "new", {
      replaceAll: true,
      expectedReplacements: 1,
      expectedSha256: digest("same same")
    }),
    /Expected 1 replacements/
  );
  await assert.rejects(
    () => prepareEditTextFile(config, guard, workspace, "edit.txt", "same", "new", {
      replaceAll: true,
      expectedSha256: digest("stale")
    }),
    (error) => error?.code === "FILE_VERSION_CONFLICT" && error.safeDetails?.relativePath === "edit.txt"
  );
}));

test("atomic preparation rejects invalid UTF-8 instead of replacing bytes", () => fixture(async ({ workspaceRoot, workspace, config, guard }) => {
  await fsp.writeFile(path.join(workspaceRoot, "invalid.txt"), Buffer.from([0xc3, 0x28]));
  await assert.rejects(
    () => prepareEditTextFile(config, guard, workspace, "invalid.txt", "(", "x", {
      replaceAll: false
    }),
    /Refusing to read binary file/
  );
}));

test("required audit failure restores the complete before-state and publishes no change set", () => fixture(async ({ workspaceRoot, workspace, config, guard, runtime, store, engine }) => {
  await fsp.writeFile(path.join(workspaceRoot, "audit.txt"), "before");
  const prepared = await prepareWriteTextFile(config, guard, workspace, "audit.txt", "after", {
    createDirs: false,
    overwrite: true,
    expectedSha256: digest("before")
  });
  const result = await pendingFor(runtime, workspace, prepared, "write");
  await assert.rejects(
    () => pendingWorkspaceMutation(result).commit({
      result,
      persistAudit: async () => { throw new Error("audit unavailable"); }
    }),
    (error) => error?.code === "AUDIT_UNAVAILABLE"
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "audit.txt"), "utf8"), "before");
  assert.deepEqual(store.list(engine.workspaceStateKey(workspace.root)), []);
}));

test("a post-commit projection defect is recovery-class and never invites a blind retry", () => fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
  await fsp.writeFile(path.join(workspaceRoot, "projection.txt"), "before");
  const prepared = await prepareWriteTextFile(config, guard, workspace, "projection.txt", "after", {
    createDirs: false,
    overwrite: true,
    expectedSha256: digest("before")
  });
  const result = await runtime.invokeProvider({
    requiresMutation: true,
    provider: () => attachPreparedFileMutation({
      runtime,
      workspace,
      prepared,
      context: mutationContext("write"),
      result: { ok: true },
      project: () => { throw new Error("projection defect"); }
    })
  });
  await assert.rejects(
    () => pendingWorkspaceMutation(result).commit({ result, persistAudit: async () => {} }),
    (error) => error?.code === "TRANSACTION_RECOVERY_REQUIRED" && !error.message.includes("projection defect")
  );
  assert.equal(await fsp.readFile(path.join(workspaceRoot, "projection.txt"), "utf8"), "after");
}));

test("atomic replacement exposes complete bytes before and after the visible install point", () => {
  let signalInstalled;
  let releaseInstalled;
  const installed = new Promise((resolve) => { signalInstalled = resolve; });
  const release = new Promise((resolve) => { releaseInstalled = resolve; });
  return fixture(async ({ workspaceRoot, workspace, config, guard, runtime }) => {
    const oldBytes = Buffer.alloc(256 * 1024, 0x61);
    const newBytes = Buffer.alloc(256 * 1024, 0x62);
    const target = path.join(workspaceRoot, "visible.txt");
    await fsp.writeFile(target, oldBytes);
    const prepared = await prepareWriteTextFile(config, guard, workspace, "visible.txt", newBytes.toString("utf8"), {
      createDirs: false,
      overwrite: true,
      expectedSha256: digest(oldBytes)
    });
    const result = await pendingFor(runtime, workspace, prepared, "write");
    assert.ok((await fsp.readFile(target)).equals(oldBytes));
    const committing = pendingWorkspaceMutation(result).commit({ result, persistAudit: async () => {} });
    await installed;
    assert.ok((await fsp.readFile(target)).equals(newBytes));
    releaseInstalled();
    await committing;
    assert.ok((await fsp.readFile(target)).equals(newBytes));
  }, {
    faultInjector: {
      async hit(point) {
        if (point !== "after_each_install") return;
        signalInstalled();
        await release;
      }
    }
  });
});
