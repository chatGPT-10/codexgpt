import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { ProcessManagerV3 } = await tsImport("../src/process/processManager.ts", import.meta.url);

test("ConPTY state exposes one terminal stream with bounded resize, ETX delivery, and exact ownership", async () => {
  let context = "conpty-owner";
  let callbacks;
  const operations = [];
  const manager = new ProcessManagerV3({
    contextFingerprint: () => context,
    backend: {
      start: async (input) => {
        callbacks = input;
        return {
          backend: { backendId: "conpty-test", commandKind: "powershell", executableIdentity: "c".repeat(64), terminal: "conpty" },
          write: async (data, close) => operations.push(["write", data.toString("utf8"), close]),
          interrupt: async () => { operations.push(["interrupt"]); return "delivered"; },
          resize: async (columns, rows) => operations.push(["resize", columns, rows]),
          terminate: async () => operations.push(["terminate"])
        };
      }
    }
  });
  const started = await manager.start({
    command: { kind: "powershell", script: "Write-Output 'initial'", edition: "windows" },
    cwd: { kind: "absolute_local", path: process.cwd() },
    mode: "full_access",
    terminal: "conpty",
    lifetime_ms: 60_000
  });
  const id = started.data.process_id;
  callbacks.onOutput("terminal", Buffer.from("terminal-ready\n"));
  assert.deepEqual(manager.read(id).data.output.chunks.map(({ stream }) => stream), ["terminal"]);
  assert.equal(manager.describe("write_process_input", { process_id: id, data: "Write-Output 'next'\r\n" }).riskClass, "R3");
  assert.equal(manager.describe("resize_process_terminal", { process_id: id, columns: 100, rows: 30 }).riskClass, "R0");
  await manager.write(id, "Write-Output 'next'\r\n");
  await manager.resize(id, 100, 30);
  assert.equal(await manager.interrupt(id), "delivered");
  assert.deepEqual(operations.slice(0, 3), [
    ["write", "Write-Output 'next'\r\n", false],
    ["resize", 100, 30],
    ["interrupt"]
  ]);
  context = "conpty-foreign";
  await assert.rejects(manager.write(id, "forbidden"), /PROCESS_NOT_FOUND/);
  context = "conpty-owner";
  await manager.terminate(id);
  assert.equal(manager.read(id).data.status, "terminated");
  await manager.close();
});

test("pipe interrupt remains unsupported without terminating the process", async () => {
  let terminateCalls = 0;
  const manager = new ProcessManagerV3({
    contextFingerprint: () => "pipe-owner",
    backend: {
      start: async () => ({
        write: async () => {},
        interrupt: async () => "unsupported",
        resize: async () => { throw new Error("TERMINAL_NOT_AVAILABLE"); },
        terminate: async () => { terminateCalls += 1; }
      })
    }
  });
  const started = await manager.start({
    command: { kind: "argv", executable: "C:\\bound\\tool.exe", args: [] },
    cwd: { kind: "absolute_local", path: process.cwd() },
    mode: "full_access",
    terminal: "pipes"
  });
  assert.equal(await manager.interrupt(started.data.process_id), "unsupported");
  assert.equal(terminateCalls, 0);
  await manager.close();
});
