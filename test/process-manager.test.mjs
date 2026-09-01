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

test("read_process_output wait_ms wakes on new output, times out cleanly, and returns terminal state immediately", async () => {
  let callbacks;
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "wait-owner",
    backend: { start: async (input) => {
      callbacks = input;
      return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} };
    } }
  });
  const started = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  const processId = started.data.process_id;
  const initial = manager.read(processId);

  let settled = false;
  const waiting = manager.readResult({ process_id: processId, cursor: initial.data.output.next_cursor, max_bytes: 1024, wait_ms: 1_000 }).then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, "an empty running process must keep the bounded read pending");
  callbacks.onOutput("stdout", Buffer.from("ready\n"));
  const output = await waiting;
  assert.equal(output.data.output.chunks.map((chunk) => chunk.text).join(""), "ready\n");

  let timeoutSettled = false;
  const timeoutRead = manager.readResult({ process_id: processId, cursor: output.data.output.next_cursor, max_bytes: 1024, wait_ms: 10 }).then((value) => {
    timeoutSettled = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(timeoutSettled, false, "a positive wait must not resolve in the same microtask turn");
  const timedOut = await timeoutRead;
  assert.equal(timedOut.data.output.returned_bytes, 0);

  callbacks.onExit(0, "natural_exit");
  await new Promise((resolve) => setImmediate(resolve));
  const terminalRead = manager.readResult({ process_id: processId, cursor: timedOut.data.output.next_cursor, wait_ms: 1_000 });
  const terminalRace = await Promise.race([
    terminalRead.then((value) => ({ kind: "result", value })),
    new Promise((resolve) => setImmediate(() => resolve({ kind: "next-turn" })))
  ]);
  assert.equal(terminalRace.kind, "result", "terminal reads must not consume wait_ms");
  const terminal = terminalRace.value;
  assert.equal(terminal.data.status, "exited");
  assert.equal(terminal.data.output.eof, true);
  await manager.close();
});

test("read_process_output cancellation releases a pending wait", async () => {
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "wait-cancel-owner",
    backend: { start: async () => ({ write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} }) }
  });
  const started = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  const processId = started.data.process_id;
  const cursor = manager.read(processId).data.output.next_cursor;
  const controller = new AbortController();
  const waiting = manager.readResult({ process_id: processId, cursor, wait_ms: 30_000 }, controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(waiting, /abort/i);
  const followup = await manager.readResult({ process_id: processId, cursor, wait_ms: 0 });
  assert.equal(followup.data.output.returned_bytes, 0);
  await manager.close();
});

test("read_process_output wait_ms wakes when termination changes process state before host cleanup settles", async () => {
  let releaseTermination;
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "wait-termination-owner",
    backend: { start: async () => ({
      write: async () => {},
      interrupt: async () => "unsupported",
      terminate: () => new Promise((resolve) => { releaseTermination = resolve; }),
      resize: async () => {}
    }) }
  });
  const started = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  const processId = started.data.process_id;
  const cursor = manager.read(processId).data.output.next_cursor;
  const waiting = manager.readResult({ process_id: processId, cursor, wait_ms: 1_000 });
  await new Promise((resolve) => setImmediate(resolve));
  const terminating = manager.terminate(processId);
  try {
    const result = await Promise.race([
      waiting,
      new Promise((_, reject) => setTimeout(() => reject(new Error("state change did not wake output wait")), 100))
    ]);
    assert.equal(result.data.status, "terminated");
    assert.equal(result.data.output.eof, false, "host cleanup may still have redactor tail output to close");
  } finally {
    releaseTermination();
    await terminating;
    await manager.close();
  }
});

test("revoke and close join an in-flight natural exit and suppress post-revocation receipts", async () => {
  for (const action of ["revoke", "close"]) {
    let callbacks;
    let releaseVerification;
    let markVerificationStarted;
    let issueCalls = 0;
    const verificationStarted = new Promise((resolve) => { markVerificationStarted = resolve; });
    const executionRuntime = {
      toolContractVersion: 4,
      preparePersistent: (args) => ({ cwd: args.cwd.path, verificationBinding: { exact: true }, resource: { exact: true } }),
      beginPersistentVerification: async () => ({ clean: true }),
      completePersistentVerification: () => {
        markVerificationStarted();
        return new Promise((resolve) => { releaseVerification = () => resolve({ clean: true }); });
      },
      issuePersistentVerificationReceipt: () => {
        issueCalls += 1;
        return `verify_${"a".repeat(32)}`;
      }
    };
    const manager = new ProcessManagerV3({
      contextFingerprint: () => `exit-${action}-owner`,
      executionRuntime,
      audit: new ProcessAuditCoordinatorV3({ sink: (event) => ({ eventId: event.eventId, timestamp: event.timestamp }) }),
      backend: { start: async (input) => {
        callbacks = input;
        return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} };
      } }
    });
    const started = await manager.start({
      command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] },
      cwd: { kind: "absolute_local", path: process.cwd() },
      mode: "full_access",
      verification: { merge_plan_id: `merge_${"1".repeat(32)}`, integration_workspace_id: `ws_${"2".repeat(32)}`, category: "test" }
    });
    callbacks.onExit(0, "natural_exit");
    await verificationStarted;
    let settled = false;
    const lifecycle = (action === "revoke" ? manager.revokeAll("evidence_revoked") : manager.close("evidence_revoked")).then(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    const returnedBeforeExitSettled = settled;
    releaseVerification();
    await lifecycle;
    const receipt = action === "revoke" ? manager.read(started.data.process_id).data.verification_receipt : null;
    if (action === "revoke") await manager.close();
    assert.equal(returnedBeforeExitSettled, false, `${action} must join natural-exit verification`);
    assert.equal(issueCalls, 0, `${action} must invalidate receipt publication before joining exit cleanup`);
    assert.equal(receipt, null);
  }
});

test("root drain treats natural-exit verification as active until post-exit work settles", async () => {
  let callbacks;
  let releaseVerification;
  let markVerificationStarted;
  const verificationStarted = new Promise((resolve) => { markVerificationStarted = resolve; });
  const executionRuntime = {
    toolContractVersion: 4,
    preparePersistent: (args) => ({ cwd: args.cwd.path, verificationBinding: { exact: true }, resource: { exact: true } }),
    beginPersistentVerification: async () => ({ clean: true }),
    completePersistentVerification: () => {
      markVerificationStarted();
      return new Promise((resolve) => { releaseVerification = () => resolve({ clean: true }); });
    },
    issuePersistentVerificationReceipt: () => `verify_${"b".repeat(32)}`
  };
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "exit-drain-owner",
    executionRuntime,
    audit: new ProcessAuditCoordinatorV3({ sink: (event) => ({ eventId: event.eventId, timestamp: event.timestamp }) }),
    backend: { start: async (input) => {
      callbacks = input;
      return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} };
    } }
  });
  const started = await manager.start({
    command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] },
    cwd: { kind: "absolute_local", path: process.cwd() },
    mode: "full_access",
    verification: { merge_plan_id: `merge_${"3".repeat(32)}`, integration_workspace_id: `ws_${"4".repeat(32)}`, category: "test" }
  });
  callbacks.onExit(0, "natural_exit");
  await verificationStarted;
  const finalizing = manager.read(started.data.process_id);
  assert.equal(finalizing.data.status, "exited");
  assert.equal(finalizing.data.output.eof, false);
  assert.equal(finalizing.data.exit_code, 0);
  assert.equal(finalizing.data.verification_receipt, null);
  assert.equal(manager.hasActiveProcessInRoot(process.cwd()), true);
  let drained = false;
  const drain = manager.drainActiveProcessesInRoot(process.cwd()).then(() => { drained = true; });
  let finalizedReadSettled = false;
  const finalizedRead = manager.readResult({ process_id: started.data.process_id, cursor: finalizing.data.output.next_cursor, wait_ms: 1_000 }).then((value) => {
    finalizedReadSettled = true;
    return value;
  });
  await new Promise((resolve) => setImmediate(resolve));
  const returnedBeforeExitSettled = drained;
  assert.equal(finalizedReadSettled, false);
  releaseVerification();
  const [, terminal] = await Promise.all([drain, finalizedRead]);
  assert.equal(returnedBeforeExitSettled, false);
  assert.equal(terminal.data.output.eof, true);
  assert.match(terminal.data.verification_receipt, /^verify_/u);
  assert.equal(manager.hasActiveProcessInRoot(process.cwd()), false);
  await manager.close();
});

test("revocation starts every running termination before joining natural-exit verification", async () => {
  const callbacks = [];
  let releaseVerification;
  let markVerificationStarted;
  let terminateCalls = 0;
  const verificationStarted = new Promise((resolve) => { markVerificationStarted = resolve; });
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "parallel-revoke-owner",
    executionRuntime: {
      toolContractVersion: 4,
      preparePersistent: (args) => ({ cwd: args.cwd.path, verificationBinding: { exact: true }, resource: { exact: true } }),
      beginPersistentVerification: async () => ({ clean: true }),
      completePersistentVerification: () => {
        markVerificationStarted();
        return new Promise((resolve) => { releaseVerification = () => resolve({ clean: true }); });
      },
      issuePersistentVerificationReceipt: () => `verify_${"c".repeat(32)}`
    },
    audit: new ProcessAuditCoordinatorV3({ sink: (event) => ({ eventId: event.eventId, timestamp: event.timestamp }) }),
    backend: { start: async (input) => {
      callbacks.push(input);
      return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => { terminateCalls += 1; }, resize: async () => {} };
    } }
  });
  const input = { command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access", verification: { merge_plan_id: `merge_${"5".repeat(32)}`, integration_workspace_id: `ws_${"6".repeat(32)}`, category: "test" } };
  await manager.start(input);
  await manager.start(input);
  callbacks[0].onExit(0, "natural_exit");
  await verificationStarted;
  let revoked = false;
  const revocation = manager.revokeAll("evidence_revoked").then(() => { revoked = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(terminateCalls, 1, "an unrelated running process must be terminated before verification joins");
  assert.equal(revoked, false);
  releaseVerification();
  await revocation;
  await manager.close();
});

test("close blocks verification-stage starts and remains closed", async () => {
  let releaseBegin;
  let markBeginStarted;
  let backendStarts = 0;
  const beginStarted = new Promise((resolve) => { markBeginStarted = resolve; });
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "close-admission-owner",
    executionRuntime: {
      toolContractVersion: 4,
      preparePersistent: (args) => ({ cwd: args.cwd.path, verificationBinding: { exact: true }, resource: { exact: true } }),
      beginPersistentVerification: () => {
        markBeginStarted();
        return new Promise((resolve) => { releaseBegin = () => resolve({ clean: true }); });
      },
      completePersistentVerification: async () => ({ clean: true }),
      issuePersistentVerificationReceipt: () => `verify_${"d".repeat(32)}`
    },
    backend: { start: async () => {
      backendStarts += 1;
      return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} };
    } }
  });
  const input = { command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access", verification: { merge_plan_id: `merge_${"7".repeat(32)}`, integration_workspace_id: `ws_${"8".repeat(32)}`, category: "test" } };
  const rejectedStart = assert.rejects(manager.start(input), /PROCESS_MANAGER_UNAVAILABLE/);
  await beginStarted;
  let closed = false;
  const closing = manager.close("evidence_revoked").then(() => { closed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, false, "close must join starts admitted before closing");
  releaseBegin();
  await rejectedStart;
  await closing;
  assert.equal(backendStarts, 0);
  await assert.rejects(manager.start(input), /PROCESS_MANAGER_UNAVAILABLE/);
});

test("terminal quota never evicts cleanup that is still in flight", async () => {
  const callbacks = [];
  let blockedProcessId = null;
  let releaseAudit;
  let markAuditStarted;
  const auditStarted = new Promise((resolve) => { markAuditStarted = resolve; });
  const quota = new OutputQuotaManager({ maxServerRecords: 2, maxSessionRecords: 2 });
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "pending-quota-owner",
    quota,
    audit: new ProcessAuditCoordinatorV3({ sink: (event) => {
      if (event.processId === blockedProcessId && event.transition === "user_terminated") {
        markAuditStarted();
        return new Promise((resolve) => { releaseAudit = () => resolve({ eventId: event.eventId, timestamp: event.timestamp }); });
      }
      return { eventId: event.eventId, timestamp: event.timestamp };
    } }),
    backend: { start: async (input) => {
      callbacks.push(input);
      return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} };
    } }
  });
  const input = { command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" };
  const completed = await manager.start(input);
  callbacks[0].onExit(0, "natural_exit");
  assert.equal((await manager.readResult({ process_id: completed.data.process_id, wait_ms: 1_000 })).data.output.eof, true);
  const blocked = await manager.start(input);
  const third = await manager.start(input);
  blockedProcessId = blocked.data.process_id;
  const terminating = manager.terminate(blockedProcessId);
  await auditStarted;
  callbacks[2].onExit(0, "natural_exit");
  assert.equal((await manager.readResult({ process_id: third.data.process_id, wait_ms: 1_000 })).data.output.eof, true);
  assert.equal(manager.owns(blockedProcessId), true, "pending cleanup must remain joinable");
  assert.equal(manager.owns(completed.data.process_id), true, "pending cleanup must not consume terminal retention quota");
  assert.equal(manager.owns(third.data.process_id), true);
  releaseAudit();
  await terminating;
  assert.equal(manager.owns(completed.data.process_id), false, "finalized cleanup may evict the oldest settled terminal record");
  await manager.close();
});

test("simultaneous natural exits share a one-record terminal quota without lifecycle failure", async () => {
  const callbacks = [];
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "simultaneous-terminal-owner",
    quota: new OutputQuotaManager({ maxServerRecords: 1, maxSessionRecords: 1 }),
    backend: { start: async (input) => {
      callbacks.push(input);
      return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} };
    } }
  });
  const input = { command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" };
  const first = await manager.start(input);
  const second = await manager.start(input);
  callbacks[0].onExit(0, "natural_exit");
  callbacks[1].onExit(0, "natural_exit");
  await manager.revokeAll("evidence_revoked");
  assert.equal(Number(manager.owns(first.data.process_id)) + Number(manager.owns(second.data.process_id)), 1);
  await manager.close();
});

test("session terminal quota evicts only the same context", async () => {
  let context = "quota-context-b";
  const callbacks = [];
  const manager = new ProcessManagerV3({
    contextFingerprint: () => context,
    quota: new OutputQuotaManager({ maxServerRecords: 10, maxSessionRecords: 1 }),
    backend: { start: async (input) => {
      callbacks.push(input);
      return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} };
    } }
  });
  const input = { command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" };
  const foreign = await manager.start(input);
  callbacks[0].onExit(0, "natural_exit");
  assert.equal((await manager.readResult({ process_id: foreign.data.process_id, wait_ms: 1_000 })).data.output.eof, true);
  context = "quota-context-a";
  const firstOwned = await manager.start(input);
  callbacks[1].onExit(0, "natural_exit");
  assert.equal((await manager.readResult({ process_id: firstOwned.data.process_id, wait_ms: 1_000 })).data.output.eof, true);
  const secondOwned = await manager.start(input);
  callbacks[2].onExit(0, "natural_exit");
  assert.equal((await manager.readResult({ process_id: secondOwned.data.process_id, wait_ms: 1_000 })).data.output.eof, true);
  assert.equal(manager.owns(firstOwned.data.process_id), false);
  assert.equal(manager.owns(secondOwned.data.process_id), true);
  context = "quota-context-b";
  assert.equal(manager.owns(foreign.data.process_id), true, "one context must not evict another context's retained evidence");
  await manager.close();
});

test("lifecycle audit failure is visible to revoke and close joiners", async () => {
  let callbacks;
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "lifecycle-error-owner",
    audit: new ProcessAuditCoordinatorV3({ sink: (event) => {
      if (event.transition === "exited") throw new Error("terminal audit unavailable");
      return { eventId: event.eventId, timestamp: event.timestamp };
    } }),
    backend: { start: async (input) => {
      callbacks = input;
      return { write: async () => {}, interrupt: async () => "unsupported", terminate: async () => {}, resize: async () => {} };
    } }
  });
  const started = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  const cursor = manager.read(started.data.process_id).data.output.next_cursor;
  const stateChange = manager.readResult({ process_id: started.data.process_id, cursor, wait_ms: 1_000 });
  callbacks.onExit(0, "natural_exit");
  const exited = await stateChange;
  assert.equal(exited.data.status, "exited");
  assert.equal(exited.data.output.eof, false, "host exit is visible before lifecycle finalization");
  const finalized = await manager.readResult({ process_id: started.data.process_id, cursor: exited.data.output.next_cursor, wait_ms: 1_000 });
  assert.equal(finalized.data.status, "failed");
  assert.equal(finalized.data.output.eof, true, "lifecycle failure must be final before EOF");
  await assert.rejects(manager.revokeAll("evidence_revoked"), /terminal audit unavailable/);
  await assert.rejects(manager.close("evidence_revoked"), /terminal audit unavailable/);
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
  assert.equal((await manager.readResult({ process_id: one.data.process_id, wait_ms: 1_000 })).data.output.eof, true);
  const two = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\two.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  callbacks[1].onExit(0, "natural_exit");
  assert.equal((await manager.readResult({ process_id: two.data.process_id, wait_ms: 1_000 })).data.output.eof, true);
  assert.throws(() => manager.read(one.data.process_id), /PROCESS_NOT_FOUND/, "oldest terminal record is evicted at the cap");
  assert.equal(manager.read(two.data.process_id).data.status, "exited");

  const three = await manager.start({ command: { kind: "argv", executable: "C:\\bound\\three.exe", args: [] }, cwd: { kind: "absolute_local", path: process.cwd() }, mode: "full_access" });
  await manager.revokeAll("evidence_revoked");
  assert.equal(manager.read(three.data.process_id).data.status, "terminated");
  assert.equal(terminateCalls, 1);
  await manager.close();
});
