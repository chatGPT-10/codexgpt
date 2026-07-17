import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { tsImport } from "tsx/esm/api";

const execFileAsync = promisify(execFile);
const { LocalApprovalServer } = await tsImport("../src/control/localApprovalServer.ts", import.meta.url);
const { WindowsLocalControlRuntime, localControlServerId } = await tsImport("../src/control/windowsLocalControl.ts", import.meta.url);
const { SessionGrantStore } = await tsImport("../src/policy/approval.ts", import.meta.url);
const { PendingApprovalStore } = await tsImport("../src/policy/pendingApprovals.ts", import.meta.url);

test("local CLI terminates an owned process when the remote approval path is unavailable", { skip: process.platform !== "win32" }, async () => {
  const localAppData = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-process-cli-"));
  const serverId = localControlServerId();
  let running = true;
  const server = new LocalApprovalServer({
    serverId,
    approvals: new PendingApprovalStore(),
    grants: new SessionGrantStore(),
    processes: {
      list: () => running ? [{ processId: "process_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", state: "running", summary: "job members only; no broker escape resistance" }] : [],
      terminate: (processId) => processId === "process_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" && running ? (running = false, true) : false
    }
  });
  const runtime = await WindowsLocalControlRuntime.start({ server, stateBaseRoot: path.join(localAppData, "CodexPro", "control") });
  try {
    const result = await execFileAsync(process.execPath, [path.resolve("scripts", "codexpro-entry.mjs"), "processes", "terminate", "process_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--server", serverId], {
      cwd: process.cwd(), env: { ...process.env, LOCALAPPDATA: localAppData }, encoding: "utf8", timeout: 20_000, windowsHide: true, maxBuffer: 64 * 1024
    });
    assert.match(result.stdout, /PROCESS_TERMINATED/);
    assert.equal(running, false);
  } finally {
    await runtime.close();
    await fs.rm(localAppData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
