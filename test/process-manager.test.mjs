import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { ProcessManagerV3 } = await tsImport("../src/process/processManager.ts", import.meta.url);
const { ProcessAuditCoordinatorV3 } = await tsImport("../src/process/processAuditCoordinator.ts", import.meta.url);
const { OutputQuotaManager } = await tsImport("../src/process/outputQuota.ts", import.meta.url);

test("persistent manager hides handles across contexts and records natural exit", async () => {
  let context = "session-a"; const events = []; let starts = 0; let terminateCalls = 0; let callbacks;
  const manager = new ProcessManagerV3({ contextFingerprint: () => context, audit: new ProcessAuditCoordinatorV3({ sink: (event) => events.push(event) }), backend: { start: async (input) => { starts += 1; callbacks = input; return { backend: { backendId: "exact-test-backend", commandKind: "argv", executableIdentity: "a".repeat(64), terminal: "pipes" }, write: async () => {}, interrupt: async () => "delivered", terminate: async () => { terminateCalls += 1; }, resize: async () => {} }; } } });
  const result = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access", terminal: "pipes" });
  const id = result.data.process_id;
  assert.match(id, /^process_[a-f0-9]{32}$/); assert.equal(starts, 1); assert.equal(JSON.stringify(result).includes("tool.exe"), false);
  assert.deepEqual(result.data.backend, { backend_id: "exact-test-backend", command_kind: "argv", executable_identity: "a".repeat(64), terminal: "pipes" });
  assert.equal(result.meta.warnings.length, 1);
  assert.match(result.meta.warnings[0], /not unforgeable proof of human presence/);
  assert.match(result.meta.warnings[0], /Job members only/);
  context = "session-b"; assert.throws(() => manager.read(id), /PROCESS_NOT_FOUND/); assert.equal(manager.list().data.process_count, 0);
  context = "session-a"; callbacks.onOutput("stdout", Buffer.from("hello")); callbacks.onExit(0, "natural_exit"); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.read(id).data.status, "exited"); assert.equal(events.at(-1).transition, "exited");
  await manager.close(); assert.equal(terminateCalls, 0, "natural exit is not terminated again");
});

test("persistent terminate is idempotent and emits terminal plus cleanup lifecycle", async () => {
  const events = []; let terminateCalls = 0; let callbacks;
  const manager = new ProcessManagerV3({ contextFingerprint: () => "owner", audit: new ProcessAuditCoordinatorV3({ sink: (event) => events.push(event) }), backend: { start: async (input) => { callbacks = input; return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => { terminateCalls += 1; }, resize: async () => {} }; } } });
  const result = await manager.start({ command: { kind: "powershell", script: "Start-Sleep 60" }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  callbacks.onOutput("stdout", Buffer.from("unterminated-tail"));
  await manager.terminate(result.data.process_id); await manager.terminate(result.data.process_id);
  assert.equal(terminateCalls, 1); assert.deepEqual(events.map((event) => event.transition), ["started", "user_terminated", "cleanup_completed"]);
  assert.match(manager.read(result.data.process_id).data.output.chunks.map((chunk) => chunk.text).join(""), /unterminated-tail/);
  await manager.close();
});

test("persistent policy resources enforce composite start scope and exact action risk", async () => {
  const startResource = { resource: { schemaVersion: 1, kind: "process", operation: "start", workspaceId: null, processId: "policy-start", persistence: true, executable: null, resourceFingerprint: `sha256:${"a".repeat(64)}` }, semanticFactsDigest: `sha256:${"b".repeat(64)}`, riskClass: "R3", requiredScopes: ["shell:execute", "process:manage", "process:persistent", "host:full-access"] };
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "owner",
    startResourceResolver: { describe: () => startResource },
    backend: { start: async () => ({ write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} }) }
  });
  assert.deepEqual(manager.describe("start_process", {}).requiredScopes, startResource.requiredScopes);
  const started = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  const process_id = started.data.process_id;
  assert.equal(manager.describe("read_process_output", { process_id }).riskClass, "R0");
  assert.equal(manager.describe("write_process_input", { process_id, data: "x" }).riskClass, "R3");
  assert.equal(manager.describe("interrupt_process", { process_id }).riskClass, "R2");
  assert.equal(manager.describe("terminate_process", { process_id }).riskClass, "R2");
  await manager.close();
});

test("expiry during start and started-audit failure both terminate the exact returned handle", async () => {
  for (const failure of ["expiry", "audit"]) {
    let terminateCalls = 0;
    const manager = new ProcessManagerV3({
      contextFingerprint: () => `owner-${failure}`,
      audit: new ProcessAuditCoordinatorV3({ sink: async (event) => { if (failure === "audit" && event.transition === "started") throw new Error("audit unavailable"); } }),
      backend: { start: async () => {
        if (failure === "expiry") await new Promise((resolve) => setTimeout(resolve, 10));
        return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => { terminateCalls += 1; }, resize: async () => {} };
      } }
    });
    await assert.rejects(manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access", lifetime_ms: failure === "expiry" ? 1 : 60_000 }));
    assert.equal(terminateCalls, 1, `${failure} must terminate the exact returned handle`);
    assert.equal(manager.list().data.process_count, 0);
    await manager.close();
  }
});

test("local termination waits for an in-flight start handle to be exactly terminated", async () => {
  let resolveStart;
  let terminateCalls = 0;
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "owner-start-race",
    backend: { start: () => new Promise((resolve) => { resolveStart = resolve; }) }
  });
  const starting = manager.start({
    command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] },
    cwd: { kind: "absolute_local", path: process.cwd() },
    mode: "full_access"
  });
  await new Promise((resolve) => setImmediate(resolve));
  const processId = manager.localControl().list()[0].processId;
  let returned = false;
  const terminating = manager.localControl().terminate(processId).then((value) => {
    returned = true;
    return value;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(returned, false);
  resolveStart({
    write: async () => {},
    interrupt: async () => "unsupported",
    terminate: async () => { terminateCalls += 1; },
    resize: async () => {}
  });
  assert.equal(await terminating, true);
  await assert.rejects(starting, /PROCESS_EXPIRED_DURING_START/);
  assert.equal(terminateCalls, 1);
  await manager.close();
});

test("root drain terminates only exact-owned processes in the root or descendants", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-process-root-"));
  const root = path.join(base, "task");
  const descendant = path.join(root, "nested");
  const sibling = path.join(base, "sibling");
  await Promise.all([fs.mkdir(descendant, { recursive: true }), fs.mkdir(sibling)]);
  const terminated = [];
  const executionRuntime = {
    toolContractVersion: 4,
    preparePersistent: (args) => ({ cwd: args.cwd.path, verificationBinding: null, resource: {} }),
    beginPersistentVerification: async () => null,
    completePersistentVerification: async () => null,
    issuePersistentVerificationReceipt: () => { throw new Error("unexpected"); }
  };
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "owner-root-drain",
    executionRuntime,
    backend: { start: async (input) => ({
      write: async () => {},
      interrupt: async () => "unsupported",
      terminate: async () => { terminated.push(input.prepared.cwd); },
      resize: async () => {}
    }) }
  });
  try {
    for (const cwd of [root, descendant, sibling]) {
      await manager.start({
        command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] },
        cwd: { kind: "absolute_local", path: cwd },
        mode: "full_access"
      });
    }
    assert.equal(manager.hasActiveProcessInRoot(root), true);
    await manager.drainActiveProcessesInRoot(root);
    assert.deepEqual(new Set(terminated), new Set([root, descendant]));
    assert.equal(manager.hasActiveProcessInRoot(root), false);
    assert.equal(manager.list().data.processes.filter((item) => item.status === "running").length, 1);
  } finally {
    await manager.close();
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("root drain waits for an expiry termination already pending on start", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-process-expiry-drain-"));
  let resolveStart;
  let terminateCalls = 0;
  const executionRuntime = {
    toolContractVersion: 4,
    preparePersistent: (args) => ({ cwd: args.cwd.path, verificationBinding: null, resource: {} }),
    beginPersistentVerification: async () => null,
    completePersistentVerification: async () => null,
    issuePersistentVerificationReceipt: () => { throw new Error("unexpected"); }
  };
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "owner-expiry-drain",
    executionRuntime,
    backend: { start: () => new Promise((resolve) => { resolveStart = resolve; }) }
  });
  try {
    const starting = manager.start({
      command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] },
      cwd: { kind: "absolute_local", path: base },
      mode: "full_access",
      lifetime_ms: 1
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(manager.hasActiveProcessInRoot(base), true);
    let drained = false;
    const drain = manager.drainActiveProcessesInRoot(base).then(() => { drained = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(drained, false);
    resolveStart({
      write: async () => {},
      interrupt: async () => "unsupported",
      terminate: async () => { terminateCalls += 1; },
      resize: async () => {}
    });
    await drain;
    await assert.rejects(starting, /PROCESS_EXPIRED_DURING_START/);
    assert.equal(terminateCalls, 1);
    assert.equal(manager.hasActiveProcessInRoot(base), false);
  } finally {
    await manager.close();
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("local emergency termination is not blocked by an unavailable lifecycle audit sink", async () => {
  let context = "remote-session-a"; let terminateCalls = 0;
  const audit = new ProcessAuditCoordinatorV3({ sink: async (event) => { if (event.transition !== "started") throw new Error("audit unavailable"); } });
  const manager = new ProcessManagerV3({ contextFingerprint: () => context, audit, backend: { start: async () => ({ write: async () => {}, interrupt: async () => "unsupported", terminate: async () => { terminateCalls += 1; }, resize: async () => {} }) } });
  const started = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  context = "remote-session-b";
  assert.equal(manager.localControl().list().length, 1, "local control is server-owned, not transport-session-owned");
  assert.equal(await manager.localControl().terminate(started.data.process_id), true);
  assert.equal(terminateCalls, 1);
  await manager.close();
});

test("local emergency control never reports success when handle termination fails", async () => {
  const events = [];
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "owner-local-terminate-failure",
    audit: new ProcessAuditCoordinatorV3({ sink: (event) => events.push(event) }),
    backend: { start: async () => ({
      write: async () => {},
      interrupt: async () => "unsupported",
      terminate: async () => { throw new Error("kill failed"); },
      resize: async () => {}
    }) }
  });
  const started = await manager.start({
    command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] },
    cwd: { kind: "absolute_local", path: process.cwd() },
    mode: "full_access"
  });
  await assert.rejects(
    manager.localControl().terminate(started.data.process_id),
    /kill failed/
  );
  assert.equal(manager.read(started.data.process_id).data.status, "failed");
  assert.deepEqual(
    events.map((event) => event.transition),
    ["started", "host_crashed", "cleanup_completed"]
  );
  await manager.close();
});

test("host crash and backend expiry retain distinct terminal lifecycle evidence", async () => {
  for (const [reason, expectedStatus, expectedTransitions] of [
    ["host_crashed", "failed", ["started", "host_crashed", "cleanup_completed"]],
    ["expired", "terminated", ["started", "expired", "cleanup_completed"]]
  ]) {
    const events = []; let callbacks;
    const manager = new ProcessManagerV3({
      contextFingerprint: () => `owner-${reason}`,
      audit: new ProcessAuditCoordinatorV3({ sink: (event) => events.push(event) }),
      backend: { start: async (input) => {
        callbacks = input;
        return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} };
      } }
    });
    const started = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
    callbacks.onExit(null, reason);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(manager.read(started.data.process_id).data.status, expectedStatus);
    assert.deepEqual(events.map((event) => event.transition), expectedTransitions);
    await manager.close();
  }
});

test("a failed terminate request still closes the public handle and records host-crash cleanup", async () => {
  const events = [];
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "owner-terminate-failure",
    audit: new ProcessAuditCoordinatorV3({ sink: (event) => events.push(event) }),
    backend: { start: async () => ({ write: async () => {}, interrupt: async () => "unsupported", terminate: async () => { throw new Error("host unavailable"); }, resize: async () => {} }) }
  });
  const started = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  await assert.rejects(manager.terminate(started.data.process_id), /host unavailable/);
  assert.equal(manager.read(started.data.process_id).data.status, "failed");
  assert.deepEqual(events.map((event) => event.transition), ["started", "host_crashed", "cleanup_completed"]);
  await manager.close();
});

test("revocation terminates every owned running process and terminal retention evicts oldest records", async () => {
  const callbacks = []; let terminateCalls = 0; let now = 1_000;
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "owner",
    now: () => now++,
    quota: new OutputQuotaManager({ maxServerRecords: 1, maxSessionRecords: 1 }),
    backend: { start: async (input) => {
      callbacks.push(input);
      return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => { terminateCalls += 1; }, resize: async () => {} };
    } }
  });
  const one = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\one.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  callbacks[0].onExit(0, "natural_exit");
  await new Promise((resolve) => setImmediate(resolve));
  const two = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\two.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  callbacks[1].onExit(0, "natural_exit");
  await new Promise((resolve) => setImmediate(resolve));
  assert.throws(() => manager.read(one.data.process_id), /PROCESS_NOT_FOUND/, "oldest terminal record is evicted at the cap");
  assert.equal(manager.read(two.data.process_id).data.status, "exited");

  const three = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\three.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  await manager.revokeAll("evidence_revoked");
  assert.equal(manager.read(three.data.process_id).data.status, "terminated");
  assert.equal(terminateCalls, 1);
  await manager.close();
});
