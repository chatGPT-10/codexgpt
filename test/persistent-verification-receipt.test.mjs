import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createChangedTask, withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";
import { ProcessAuditCoordinatorV3 } from "../dist/process/processAuditCoordinator.js";
import { ProcessManagerV3 } from "../dist/process/processManager.js";
import { RunCommandRuntimeV3 } from "../dist/process/runCommand.js";
import {
  readProcessOutputDataV4Schema,
  startProcessInputV1Schema,
  startProcessInputV4Schema
} from "../dist/tools/schemas/execution.js";

const syntheticWindowsExecutable = "C:\\CodexGPT\\node.exe";

const fullAccessProfile = Object.freeze({
  ambientFilesystem: true,
  ambientCredentials: true,
  ambientRegistry: true,
  unrestrictedNetwork: true,
  requireBlockedPathEnforcement: false,
  requireCredentialIsolation: false,
  requireRegistryIsolation: false,
  requireDeviceIsolation: false,
  requireNetworkEnforcement: false,
  requireSandbox: false
});

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitForReceipt(manager, processId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const terminal = manager.read(processId);
    if (terminal.data.verification_receipt !== null) return terminal;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return manager.read(processId);
}

function runtimeFor(fixture) {
  const executable = syntheticWindowsExecutable;
  const runtime = new RunCommandRuntimeV3({
    config: {
      executionProfile: "full_access",
      defaultRoot: fixture.workspace.root,
      toolContractVersion: 4
    },
    fullAccessProfile,
    hostRuntime: { get: async () => { throw new Error("unexpected one-shot host request"); } },
    contextFingerprint: () => "persistent-verification-context-v4",
    policyRevision: () => "policy-test",
    evidenceRevision: () => "evidence-test",
    backendResolver: () => ({
      schemaVersion: 1,
      backendId: "persistent-test-backend",
      backendVersion: "v1",
      kind: "argv",
      source: "reviewed_explicit",
      path: executable,
      realPath: executable,
      sha256: "a".repeat(64),
      identity: `sha256:${"a".repeat(64)}:dev:1:ino:1`
    }),
    cwdIdentity: () => `sha256:${"b".repeat(64)}`
  });
  runtime.setCandidateVerificationWorkspace(fixture.candidateWorkspaces);
  return runtime;
}

async function preparedCandidate(fixture) {
  const created = await createChangedTask(fixture);
  const prepared = await fixture.service.merge({
    action: "prepare",
    workspace: fixture.workspace,
    guard: fixture.guard,
    taskWorktreeId: created.task.task_worktree_id,
    authorization: fixture.authorization
  });
  return { created, prepared };
}

function verificationArgs(prepared) {
  return {
    command: { kind: "argv", executable: syntheticWindowsExecutable, args: ["--version"] },
    cwd: { kind: "workspace" },
    mode: "full_access",
    terminal: "pipes",
    lifetime_ms: 60_000,
    verification: {
      merge_plan_id: prepared.merge_plan_id,
      integration_workspace_id: prepared.integration_workspace_id,
      category: prepared.required_check_categories[0]
    }
  };
}

test("V4 persistent natural exit issues exactly one receipt after exact post-clean and durable lifecycle audit", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const { prepared } = await preparedCandidate(fixture);
    const runtime = runtimeFor(fixture);
    const lifecycle = [];
    let callbacks;
    const manager = new ProcessManagerV3({
      contextFingerprint: () => "persistent-owner-v4",
      startResourceResolver: runtime,
      executionRuntime: runtime,
      audit: new ProcessAuditCoordinatorV3({
        sink: async (event) => {
          lifecycle.push(event);
          return { eventId: event.eventId, timestamp: event.timestamp };
        }
      }),
      backend: {
        async start(input) {
          callbacks = input;
          return {
            backend: {
              backendId: "persistent-test-backend",
              commandKind: "argv",
              executableIdentity: "a".repeat(64),
              terminal: "pipes"
            },
            async write() {},
            async interrupt() { return "unsupported"; },
            async terminate() {},
            async resize() {}
          };
        }
      }
    });
    try {
      const args = verificationArgs(prepared);
      assert.equal(startProcessInputV4Schema.safeParse(args).success, true);
      assert.equal(startProcessInputV1Schema.safeParse(args).success, false);
      const started = await manager.start(args);
      callbacks.onExit(0, "natural_exit");
      const terminal = await waitForReceipt(manager, started.data.process_id);
      assert.equal(terminal.data.status, "exited");
      assert.equal(terminal.data.exit_code, 0);
      assert.match(terminal.data.verification_receipt, /^verify_[A-Za-z0-9_-]+$/u);
      assert.equal(readProcessOutputDataV4Schema.safeParse(terminal.data).success, true);
      assert.equal(lifecycle.at(-1).transition, "exited");
      assert.equal(
        fixture.verificationReceipts.verify(terminal.data.verification_receipt, {
          mergePlanId: prepared.merge_plan_id,
          category: prepared.required_check_categories[0]
        }).terminalAuditEventId,
        lifecycle.at(-1).eventId
      );
      callbacks.onExit(0, "natural_exit");
      await settle();
      assert.equal(manager.read(started.data.process_id).data.verification_receipt, terminal.data.verification_receipt);
    } finally {
      await manager.close();
      runtime.close();
    }
  });
});

test("V4 persistent nonzero, timeout, termination, dirty candidate, and audit failure never issue receipts", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const { created, prepared } = await preparedCandidate(fixture);
    const task = fixture.store.read(created.task.task_worktree_id);
    const runtime = runtimeFor(fixture);
    const run = async ({ exitCode = 0, reason = "natural_exit", dirty = false, auditFailure = false, terminate = false }) => {
      let callbacks;
      const manager = new ProcessManagerV3({
        contextFingerprint: () => "persistent-owner-v4",
        startResourceResolver: runtime,
        executionRuntime: runtime,
        audit: new ProcessAuditCoordinatorV3({
          sink: async (event) => {
            if (auditFailure && event.transition === "exited") throw new Error("audit unavailable");
            return { eventId: event.eventId, timestamp: event.timestamp };
          }
        }),
        backend: {
          async start(input) {
            callbacks = input;
            return {
              backend: { backendId: "persistent-test-backend", commandKind: "argv", executableIdentity: "a".repeat(64), terminal: "pipes" },
              async write() {},
              async interrupt() { return "unsupported"; },
              async terminate() {},
              async resize() {}
            };
          }
        }
      });
      try {
        const started = await manager.start(verificationArgs(prepared));
        if (dirty) await fs.writeFile(path.join(task.privateState.worktreePath, "tracked.txt"), "dirty-after-start\n");
        if (terminate) await manager.terminate(started.data.process_id);
        else callbacks.onExit(exitCode, reason);
        await settle();
        const terminal = manager.read(started.data.process_id);
        assert.equal(terminal.data.verification_receipt, null, JSON.stringify({ exitCode, reason, dirty, auditFailure, terminate }));
        if (!terminate) assert.equal(terminal.data.exit_code, exitCode);
      } finally {
        if (auditFailure) await assert.rejects(manager.close(), /audit unavailable/);
        else await manager.close();
        if (dirty) await fs.writeFile(path.join(task.privateState.worktreePath, "tracked.txt"), "task-change\n");
      }
    };
    try {
      await run({ exitCode: 9 });
      await run({ exitCode: null, reason: "timeout" });
      await run({ terminate: true });
      await run({ dirty: true });
      await run({ auditFailure: true });
    } finally {
      runtime.close();
    }
  });
});

test("V3 persistent input and terminal output remain exact", async () => {
  let callbacks;
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "persistent-owner-v3",
    backend: {
      async start(input) {
        callbacks = input;
        return {
          async write() {},
          async interrupt() { return "unsupported"; },
          async terminate() {},
          async resize() {}
        };
      }
    }
  });
  const args = {
    command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] },
    cwd: { kind: "absolute_local", path: process.cwd() },
    mode: "full_access",
    terminal: "pipes"
  };
  try {
    await assert.rejects(manager.start({
      ...args,
      verification: {
        merge_plan_id: `merge_${"1".repeat(32)}`,
        integration_workspace_id: `ws_${"2".repeat(32)}`,
        category: "test"
      }
    }));
    const started = await manager.start(args);
    callbacks.onExit(0, "natural_exit");
    await settle();
    assert.deepEqual(Object.keys(manager.read(started.data.process_id).data).sort(), ["output", "process_id", "status"]);
  } finally {
    await manager.close();
  }
});
