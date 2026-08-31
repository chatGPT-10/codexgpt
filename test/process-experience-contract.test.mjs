import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  execution,
  codexgpt,
  ProcessManagerV3,
  RunCommandRuntimeV3
} = await tsImport("../fixtures/ts-imports/process-experience-contract-imports.ts", import.meta.url);

const processId = `process_${"a".repeat(32)}`;
const meta = { schemaVersion: 1, durationMs: 0, warnings: [] };

function envelope(tool, title, data) {
  return { codexgpt_tool: tool, codexgpt_title: title, ok: true, data, error: null, meta };
}

function output() {
  return { chunks: [], next_cursor: null, truncated: false, eof: true, returned_bytes: 0 };
}

function stateData(state = "running") {
  return { process_id: processId, state, status: state };
}

test("V5 process schemas share one strict state and retain an equal status migration alias", () => {
  assert.deepEqual(execution.PROCESS_STATES_V5, ["starting", "running", "exited", "failed", "terminated"]);
  for (const state of execution.PROCESS_STATES_V5) {
    assert.equal(execution.processStateV5Schema.safeParse(state).success, true, state);
  }

  const read = envelope("read_process_output", "Read Process Output", {
    ...stateData("exited"),
    output: output(),
    exit_code: 0,
    verification_receipt: null
  });
  assert.equal(execution.readProcessOutputOutputSchemaV5.safeParse(read).success, true);
  assert.equal(execution.readProcessOutputOutputSchemaV4.safeParse(read).success, false);
  assert.equal(execution.readProcessOutputOutputSchemaV5.safeParse({
    ...read,
    data: { ...read.data, status: "failed" }
  }).success, false);

  const list = envelope("list_processes", "List Processes", {
    processes: [{
      ...stateData("starting"),
      mode: "full_access",
      terminal: "pipes",
      started_at: "2026-08-31T00:00:00.000Z",
      absolute_expires_at: "2026-08-31T01:00:00.000Z"
    }],
    process_count: 1
  });
  assert.equal(execution.listProcessesOutputSchemaV5.safeParse(list).success, true);
  assert.equal(execution.listProcessesOutputSchema.safeParse(list).success, false);

  const terminal = envelope("run_command", "Run Command", {
    ...stateData("exited"),
    exit_code: 0,
    termination_reason: null,
    backend: {
      backend_id: "test",
      command_kind: "argv",
      executable_identity: "b".repeat(64),
      terminal: "none"
    },
    authority: {
      mode: "full_access",
      workspace_boundary_enforced: false,
      filesystem_scope: "current_user_unrestricted",
      filesystem_isolation: "none",
      credential_isolation: "none",
      registry_isolation: "none",
      network_isolation: "none",
      process_tree_control: "job_object_members_only",
      broker_escape_resistance: "none",
      host_writeback: "possible",
      redaction: "best_effort_known_patterns"
    },
    output: output(),
    started_at: "2026-08-31T00:00:00.000Z",
    ended_at: "2026-08-31T00:00:01.000Z",
    verification_receipt: null
  });
  assert.equal(execution.runCommandOutputSchemaV5.safeParse(terminal).success, true);
  assert.equal(execution.runCommandOutputSchemaV5.safeParse({
    ...terminal,
    data: { ...terminal.data, state: "running", status: "running" }
  }).success, false);
});

test("V5 supertool overrides every process schema without changing direct tool counts", () => {
  assert.equal(codexgpt.CANONICAL_CODEXGPT_CHILD_TOOLS_V1.length, 28);
  assert.equal(codexgpt.CANONICAL_CODEXGPT_CHILD_TOOLS_V2.length, 31);
  assert.equal(codexgpt.CANONICAL_CODEXGPT_CHILD_TOOLS_V3.length, 39);
  assert.equal(codexgpt.CANONICAL_CODEXGPT_CHILD_TOOLS_V4.length, 51);
  assert.equal(codexgpt.CANONICAL_CODEXGPT_CHILD_TOOLS_V5.length, 52);
  for (const name of [
    "run_command",
    "start_process",
    "read_process_output",
    "write_process_input",
    "interrupt_process",
    "terminate_process",
    "resize_process_terminal",
    "list_processes"
  ]) {
    assert.equal(typeof codexgpt.CODEXGPT_CHILD_OUTPUT_SCHEMAS_V5[name]?.safeParse, "function", name);
    assert.equal(typeof execution.EXECUTION_OUTPUT_SCHEMAS_V5[name]?.safeParse, "function", name);
  }
  const v5State = envelope("write_process_input", "Write Process Input", stateData("running"));
  assert.equal(codexgpt.CODEXGPT_CHILD_OUTPUT_SCHEMAS_V5.write_process_input.safeParse(v5State).success, true);
  assert.equal(codexgpt.CODEXGPT_CHILD_OUTPUT_SCHEMAS_V4.write_process_input.safeParse(v5State).success, false);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function v5ExecutionRuntime() {
  return {
    toolContractVersion: 5,
    preparePersistent: () => ({ verificationBinding: null }),
    beginPersistentVerification: async () => null,
    completePersistentVerification: async () => null,
    issuePersistentVerificationReceipt: () => { throw new Error("unexpected receipt"); }
  };
}

const args = {
  command: { kind: "argv", executable: "C:\\Tools\\fake.exe", args: [] },
  cwd: { kind: "absolute_local", path: process.cwd() },
  mode: "full_access",
  terminal: "pipes",
  lifetime_ms: 60_000
};

test("V5 observes starting and changes to running only after backend startup completes", async () => {
  const gate = deferred();
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "p5-owner",
    executionRuntime: v5ExecutionRuntime(),
    backend: {
      start: async () => {
        await gate.promise;
        return {
          async write() {},
          async interrupt() { return "delivered"; },
          async terminate() {},
          async resize() {}
        };
      }
    }
  });
  try {
    const pending = manager.start(args);
    await new Promise((resolve) => setImmediate(resolve));
    const starting = manager.list().data.processes;
    assert.equal(starting.length, 1);
    assert.equal(starting[0].state, "starting");
    assert.equal(starting[0].status, "starting");
    gate.resolve();
    const started = await pending;
    assert.equal(started.data.state, "running");
    assert.equal(started.data.status, "running");
    assert.equal(manager.read(started.data.process_id).data.state, "running");
    assert.equal((await manager.writeResult({ process_id: started.data.process_id, data: "x" })).data.state, "running");
    assert.equal((await manager.interruptResult({ process_id: started.data.process_id })).data.state, "running");
    assert.equal((await manager.resizeResult({ process_id: started.data.process_id, columns: 100, rows: 30 })).data.state, "running");
    assert.equal(manager.list().data.processes[0].state, "running");
    const terminated = await manager.terminateResult({ process_id: started.data.process_id });
    assert.equal(terminated.data.state, "terminated");
    assert.equal(manager.read(started.data.process_id).data.state, "terminated");
  } finally {
    gate.resolve();
    await manager.close();
  }
});

test("close joins and terminates a backend handle that arrives after startup revocation", async () => {
  const gate = deferred();
  let terminated = 0;
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "p5-revoke-owner",
    executionRuntime: v5ExecutionRuntime(),
    backend: {
      start: async () => {
        await gate.promise;
        return {
          async write() {},
          async interrupt() { return "unsupported"; },
          async terminate() { terminated += 1; },
          async resize() {}
        };
      }
    }
  });
  const pending = manager.start(args);
  await new Promise((resolve) => setImmediate(resolve));
  const closing = manager.close();
  let settled = false;
  void closing.finally(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  gate.resolve();
  await assert.rejects(pending, /PROCESS_(?:MANAGER_UNAVAILABLE|EXPIRED_DURING_START)/u);
  await closing;
  assert.equal(terminated, 1);
});

test("V5 bounded commands and retained output reads use the same terminal state", async () => {
  const executable = "C:\\Tools\\fake.exe";
  const fullAccessProfile = {
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
  };
  const runtime = new RunCommandRuntimeV3({
    config: { executionProfile: "full_access", defaultRoot: process.cwd(), toolContractVersion: 5 },
    fullAccessProfile,
    contextFingerprint: () => "p5-command-owner",
    policyRevision: () => "p5-policy",
    evidenceRevision: () => "p5-evidence",
    backendResolver: () => ({
      schemaVersion: 1,
      backendId: "p5-test",
      backendVersion: "1",
      kind: "argv",
      source: "reviewed_explicit",
      path: executable,
      realPath: executable,
      sha256: "c".repeat(64),
      identity: `sha256:${"c".repeat(64)}:dev:1:ino:1`
    }),
    cwdIdentity: () => `sha256:${"d".repeat(64)}`,
    hostRuntime: {
      get: async () => ({
        request: async () => ({
          body: {
            ok: true,
            exitCode: 0,
            timedOut: false,
            stdoutBase64: Buffer.from("done\n").toString("base64"),
            stderrBase64: ""
          }
        })
      })
    }
  });
  try {
    const result = await runtime.runCommand({
      command: { kind: "argv", executable, args: [] },
      cwd: { kind: "absolute_local", path: process.cwd() },
      mode: "full_access"
    });
    assert.equal(result.data.state, "exited");
    assert.equal(result.data.status, "exited");
    assert.equal(execution.runCommandOutputSchemaV5.safeParse(result).success, true);
    const reread = runtime.readProcessOutput({ process_id: result.data.process_id, max_bytes: 1024 });
    assert.equal(reread.data.state, "exited");
    assert.equal(reread.data.status, "exited");
    assert.equal(execution.readProcessOutputOutputSchemaV5.safeParse(reread).success, true);
  } finally {
    runtime.close();
  }
});
