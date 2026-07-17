import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { processCreationTime } from "../scripts/long-task-runner.mjs";
import {
  PROCESS_HOST_PROTOCOL,
  encodeProcessHostFrame,
  startWindowsProcessHostSpike
} from "../scripts/windows-process-host-spike.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const treeFixture = path.join(repositoryRoot, "fixtures", "native-host-process-tree-child.mjs");
const exitFixture = path.join(repositoryRoot, "fixtures", "native-host-exit-code-child.mjs");
const floodFixture = path.join(repositoryRoot, "fixtures", "runner-output-flood-child.mjs");
const endlessFloodFixture = path.join(repositoryRoot, "fixtures", "native-host-output-flood-until-killed.mjs");
const nodeCrashControllerFixture = path.join(repositoryRoot, "fixtures", "native-host-node-crash-controller.mjs");
const windowsPowerShell = path.join(path.parse(process.execPath).root, "Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitDead(pid, deadlineMs = 10000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(alive(pid), false, `PID ${pid} remained alive`);
}

async function waitForJsonFile(file, deadlineMs = 10000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${file}`);
}

async function waitForChildExit(child, deadlineMs = 15000) {
  if (child.exitCode !== null) return { code: child.exitCode, signal: child.signalCode };
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`PID ${child.pid} did not exit`)), deadlineMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function decodeText(base64) {
  return Buffer.from(base64, "base64").toString("utf8");
}

function baseInput(overrides = {}) {
  return {
    cwd: repositoryRoot,
    environment: {},
    timeoutMs: 10000,
    stdoutLimitBytes: 65536,
    stderrLimitBytes: 65536,
    ...overrides
  };
}

async function runPowerShell(session, script, overrides = {}) {
  const { body } = await session.request("run_powershell", baseInput({ executable: windowsPowerShell, script, ...overrides }), { timeoutMs: 45000 });
  return body;
}

async function exactTerminate(pid, expectedCreationTime) {
  const current = await processCreationTime(pid);
  assert.equal(current, expectedCreationTime, "Exact cleanup PID identity drifted");
  process.kill(pid);
  await waitDead(pid);
}

test("source-shipped PowerShell/C# host proves Job-at-creation ownership, exact handles, deadline cleanup, and bounded flood draining", { skip: process.platform !== "win32" }, async () => {
  const session = await startWindowsProcessHostSpike();
  const unrelated = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
    cwd: repositoryRoot,
    windowsHide: true,
    stdio: "ignore"
  });
  const unrelatedCreationTime = await processCreationTime(unrelated.pid);
  try {
    const capabilities = (await session.request("capabilities", {})).body;
    assert.equal(capabilities.ok, true);
    assert.equal(capabilities.jobListAttribute, true);
    assert.equal(capabilities.handleListAttribute, true);
    assert.equal(capabilities.killOnJobClose, true);
    assert.equal(capabilities.nativeMonotonicDeadline, true);
    assert.equal(capabilities.processTreeControl, "job_object_members_only");
    assert.equal(capabilities.brokerEscapeResistance, "none");
    assert.equal(capabilities.parentInJob, true, "The real connector control environment should exercise nested Job support");

    const tree = (await session.request("run", {
      executable: process.execPath,
      arguments: [treeFixture, "60000"],
      stdinBase64: "",
      ...baseInput({ timeoutMs: 800, stdoutLimitBytes: 4096, stderrLimitBytes: 4096 })
    }, { timeoutMs: 30000 })).body;
    assert.equal(tree.code, "PROCESS_TIMED_OUT");
    assert.equal(tree.timedOut, true);
    assert.equal(tree.jobAssignedAtCreation, true);
    assert.equal(tree.exactHandleList, true);
    assert.equal(tree.imageIdentityVerified, true);
    assert.equal(tree.processTreeControl, "job_object_members_only");
    const processRecord = JSON.parse(decodeText(tree.stdoutBase64).trim());
    assert.equal(processRecord.parentPid, tree.processId);
    await waitDead(processRecord.parentPid);
    await waitDead(processRecord.grandchildPid);
    assert.equal(alive(unrelated.pid), true, "Closing the owned Job must not kill an unrelated process");

    const flood = (await session.request("run", {
      executable: process.execPath,
      arguments: [floodFixture, String(4 * 1024 * 1024)],
      stdinBase64: "",
      ...baseInput({ timeoutMs: 15000, stdoutLimitBytes: 4096, stderrLimitBytes: 4096 })
    }, { timeoutMs: 30000 })).body;
    assert.equal(flood.code, "PROCESS_EXITED");
    assert.equal(flood.exitCode, 0);
    assert.ok(flood.stdoutTotalBytes > 4 * 1024 * 1024);
    assert.ok(flood.stderrTotalBytes > 4 * 1024 * 1024);
    assert.ok(flood.stdoutDroppedBytes > 4_000_000);
    assert.ok(flood.stderrDroppedBytes > 4_000_000);
    assert.equal(flood.stdoutTruncated, true);
    assert.equal(flood.stderrTruncated, true);
    assert.ok(Buffer.from(flood.stdoutBase64, "base64").length <= 4096);
    assert.ok(Buffer.from(flood.stderrBase64, "base64").length <= 4096);
    assert.match(decodeText(flood.stdoutBase64), /STDOUT-TAIL/);
    assert.match(decodeText(flood.stderrBase64), /STDERR-TAIL/);

    const floodDeadline = (await session.request("run", {
      executable: process.execPath,
      arguments: [endlessFloodFixture],
      stdinBase64: "",
      ...baseInput({ timeoutMs: 700, stdoutLimitBytes: 4096, stderrLimitBytes: 4096 })
    }, { timeoutMs: 30000 })).body;
    assert.equal(floodDeadline.code, "PROCESS_TIMED_OUT");
    assert.equal(floodDeadline.timedOut, true);
    assert.ok(floodDeadline.elapsedMilliseconds >= 650);
    assert.ok(floodDeadline.elapsedMilliseconds < 10000);
    assert.ok(floodDeadline.stdoutTotalBytes > 65536);
    assert.ok(floodDeadline.stderrTotalBytes > 65536);
    assert.equal(floodDeadline.stdoutTruncated, true);
    assert.equal(floodDeadline.stderrTruncated, true);
  } finally {
    await session.close();
    if (alive(unrelated.pid) && unrelatedCreationTime) await exactTerminate(unrelated.pid, unrelatedCreationTime);
  }
});

test("ConPTY create, read, write, resize, ETX delivery, Job ownership, and bounded close are proved through the isolated worker", { skip: process.platform !== "win32" }, async () => {
  const session = await startWindowsProcessHostSpike();
  try {
    const { body } = await session.request("conpty_probe", {}, { timeoutMs: 30000 });
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(body.code, "CONPTY_PROBE_OK");
    assert.equal(body.conPtyCreated, true);
    assert.equal(body.resized, true);
    assert.equal(body.etxDelivered, true);
    assert.equal(body.outputContainsReady, true);
    assert.equal(body.outputContainsInputAck, true);
    assert.equal(body.outputContainsEtxAck, true);
    assert.equal(body.exitCode, 0);
    assert.equal(body.timedOut, false);
    assert.equal(body.workerInOwnedJob, true);
    assert.equal(body.targetInInheritedJobAtCreation, true);
    assert.equal(body.jobAssignedAtCreation, true);
    assert.equal(body.workerJobAssignedAtCreation, true);
    assert.equal(body.workerExactHandleList, true);
    assert.equal(body.workerImageIdentityVerified, true);
    assert.equal(body.jobOwnershipMode, "job_list_worker_inheritance_before_resume");
    assert.ok(body.closeDurationMs >= 0 && body.closeDurationMs < body.closeDeadlineMs);
    assert.equal(body.closeDeadlineMs, 5000);
    assert.ok(body.outputTotalBytes > 0);
    assert.ok(Buffer.from(body.outputBase64, "base64").length <= 16384);
  } finally {
    await session.close();
  }
});

test("a stuck ClosePseudoConsole makes only the isolated worker fatal, preserves unrelated processes, and a fresh worker succeeds", { skip: process.platform !== "win32" }, async () => {
  const session = await startWindowsProcessHostSpike();
  const unrelated = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
    cwd: repositoryRoot,
    windowsHide: true,
    stdio: "ignore"
  });
  const unrelatedCreationTime = await processCreationTime(unrelated.pid);
  try {
    const { body: hung } = await session.request("conpty_close_hang_probe", {}, { timeoutMs: 20000 });
    assert.equal(hung.ok, false);
    assert.equal(hung.code, "HOST_FATAL_CONPTY_CLOSE");
    assert.equal(hung.workerTimedOut, false);
    assert.equal(hung.workerJobAssignedAtCreation, true);
    assert.equal(hung.workerExactHandleList, true);
    assert.equal(hung.workerImageIdentityVerified, true);
    assert.ok(hung.workerElapsedMilliseconds >= 5000 && hung.workerElapsedMilliseconds < 20000);
    assert.equal(alive(unrelated.pid), true);

    const { body: restarted } = await session.request("conpty_probe", {}, { timeoutMs: 30000 });
    assert.equal(restarted.ok, true, JSON.stringify(restarted));
    assert.equal(restarted.code, "CONPTY_PROBE_OK");
    assert.equal(restarted.workerInOwnedJob, true);
    assert.equal(restarted.targetInInheritedJobAtCreation, true);
  } finally {
    await session.close();
    if (alive(unrelated.pid) && unrelatedCreationTime) await exactTerminate(unrelated.pid, unrelatedCreationTime);
  }
});

test("host crash closes its creation-time Job and kills the exact owned process tree", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-host-crash-"));
  const recordPath = path.join(root, "tree.json");
  const session = await startWindowsProcessHostSpike();
  let hostCreationTime;
  try {
    const pending = session.request("run", {
      executable: process.execPath,
      arguments: [treeFixture, "60000", recordPath],
      stdinBase64: "",
      ...baseInput({ timeoutMs: 60000, stdoutLimitBytes: 4096, stderrLimitBytes: 4096 })
    }, { timeoutMs: 65000 });
    const tree = await waitForJsonFile(recordPath);
    hostCreationTime = await processCreationTime(session.child.pid);
    assert.equal(typeof hostCreationTime, "string");
    await exactTerminate(session.child.pid, hostCreationTime);
    await assert.rejects(pending, /HOST_CLOSED|Native spike host closed/);
    await waitDead(tree.parentPid);
    await waitDead(tree.grandchildPid);
  } finally {
    if (alive(session.child.pid) && hostCreationTime) await exactTerminate(session.child.pid, hostCreationTime);
    await fs.rm(session.tempRoot, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("parent EOF is detected without consuming protocol bytes and revokes every active Job", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-host-eof-"));
  const recordPath = path.join(root, "tree.json");
  const session = await startWindowsProcessHostSpike();
  let hostCreationTime;
  try {
    const pending = session.request("run", {
      executable: process.execPath,
      arguments: [treeFixture, "60000", recordPath],
      stdinBase64: "",
      ...baseInput({ timeoutMs: 60000, stdoutLimitBytes: 4096, stderrLimitBytes: 4096 })
    }, { timeoutMs: 65000 });
    const tree = await waitForJsonFile(recordPath);
    hostCreationTime = await processCreationTime(session.child.pid);
    session.child.stdin.end();
    await waitForChildExit(session.child);
    await assert.rejects(pending, /HOST_CLOSED|Native spike host closed/);
    await waitDead(tree.parentPid);
    await waitDead(tree.grandchildPid);
  } finally {
    if (alive(session.child.pid) && hostCreationTime) await exactTerminate(session.child.pid, hostCreationTime);
    await fs.rm(session.tempRoot, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("an abrupt Node controller exit closes host stdin, then the host watchdog revokes its Jobs", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-node-crash-"));
  const recordPath = path.join(root, "tree.json");
  const evidencePath = path.join(root, "controller.json");
  const controller = spawn(process.execPath, [nodeCrashControllerFixture, recordPath, evidencePath], {
    cwd: repositoryRoot,
    windowsHide: true,
    stdio: "ignore"
  });
  let evidence;
  try {
    evidence = await waitForJsonFile(evidencePath, 20000);
    const outcome = await waitForChildExit(controller, 20000);
    assert.equal(outcome.code, 0);
    await waitDead(evidence.hostPid, 15000);
    await waitDead(evidence.tree.parentPid, 15000);
    await waitDead(evidence.tree.grandchildPid, 15000);
  } finally {
    if (evidence?.hostPid && alive(evidence.hostPid) && evidence.hostCreationTime) {
      await exactTerminate(evidence.hostPid, evidence.hostCreationTime);
    }
    if (alive(controller.pid)) {
      const creationTime = await processCreationTime(controller.pid);
      if (creationTime) await exactTerminate(controller.pid, creationTime);
    }
    if (evidence?.hostTempRoot) await fs.rm(evidence.hostTempRoot, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("PowerShell execution uses script-over-private-stdin with Unicode and exact Win32 exit mapping", { skip: process.platform !== "win32" }, async () => {
  const session = await startWindowsProcessHostSpike();
  try {
    const unicode = await runPowerShell(session, "[Console]::Write('你好🙂')");
    assert.equal(unicode.exitCode, 0);
    assert.equal(decodeText(unicode.stdoutBase64), "你好🙂");

    const empty = await runPowerShell(session, "");
    assert.equal(empty.exitCode, 0);

    const failed = await runPowerShell(session, "throw 'synthetic failure'");
    assert.equal(failed.exitCode, 1);

    const quotedNode = process.execPath.replaceAll("'", "''");
    const quotedExitFixture = exitFixture.replaceAll("'", "''");
    const native = await runPowerShell(session, `& '${quotedNode}' '${quotedExitFixture}' 23`);
    assert.equal(native.exitCode, 23, JSON.stringify(native));

    const finalNative = await runPowerShell(session, `& '${quotedNode}' '${quotedExitFixture}' 7; & '${quotedNode}' '${quotedExitFixture}' 9`);
    assert.equal(finalNative.exitCode, 9);

    const explicit = await runPowerShell(session, "exit 37");
    assert.equal(explicit.exitCode, 37);

    const parseError = await runPowerShell(session, "if (");
    assert.equal(parseError.exitCode, 1);

    const commandLine = await runPowerShell(session, [
      "$marker='CXP4_SCRIPT_MARKER_MUST_NOT_BE_IN_COMMAND_LINE'",
      "$command=(Get-CimInstance Win32_Process -Filter \"ProcessId=$PID\").CommandLine",
      "[Console]::Write($command)"
    ].join(";"));
    assert.equal(commandLine.exitCode, 0);
    assert.doesNotMatch(decodeText(commandLine.stdoutBase64), /CXP4_SCRIPT_MARKER_MUST_NOT_BE_IN_COMMAND_LINE/);
    assert.match(decodeText(commandLine.stdoutBase64), /-EncodedCommand/i);

    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const systemDrive = path.parse(systemRoot).root.replace(/[\\/]$/, "");
    const poisoned = await runPowerShell(session, "[Console]::Write(($env:SystemDrive+'|'+$env:ProgramData+'|'+$env:PATH))", {
      environment: {
        SystemDrive: "Z:",
        ProgramData: "Z:\\poison-program-data",
        PATH: "Z:\\missing",
        PSModulePath: "Z:\\missing-modules",
        TEMP: "Z:\\missing-temp",
        TMP: "Z:\\missing-temp",
        PROFILE: "CXP4_PROFILE_POISON"
      }
    });
    assert.equal(poisoned.exitCode, 0);
    assert.equal(
      decodeText(poisoned.stdoutBase64),
      `${systemDrive}|${path.join(systemDrive, "ProgramData")}|${path.join(systemRoot, "System32")};${systemRoot}`
    );
  } finally {
    await session.close();
  }
});

test("a nonce-bound WMI broker probe truthfully demonstrates no broker escape resistance and cleans only the exact escaped PID", { skip: process.platform !== "win32" }, async (context) => {
  const session = await startWindowsProcessHostSpike();
  let escapedPid;
  let escapedCreationTime;
  try {
    const nonce = `cxp4-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const childCommand = `\"${process.execPath}\" -e \"process.title='${nonce}';setTimeout(()=>{},60000)\"`;
    const script = [
      `$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='${childCommand.replaceAll("'", "''")}'}`,
      "if($r.ReturnValue -ne 0){throw ('WMI_CREATE_'+$r.ReturnValue)}",
      "[Console]::Write($r.ProcessId)"
    ].join(";");
    const broker = await runPowerShell(session, script, { timeoutMs: 20000 });
    if (broker.exitCode !== 0) {
      context.skip(`WMI broker unavailable with exit ${broker.exitCode}`);
      return;
    }
    escapedPid = Number(decodeText(broker.stdoutBase64).trim());
    assert.ok(Number.isInteger(escapedPid) && escapedPid > 0);
    escapedCreationTime = await processCreationTime(escapedPid);
    assert.equal(typeof escapedCreationTime, "string");
    assert.equal(alive(escapedPid), true, "Broker-created process should remain outside the child Job");
    const capabilities = (await session.request("capabilities", {})).body;
    assert.equal(capabilities.brokerEscapeResistance, "none");
  } finally {
    if (escapedPid && escapedCreationTime && alive(escapedPid)) await exactTerminate(escapedPid, escapedCreationTime);
    await session.close();
  }
});

test("real host rejects a bad directional HMAC frame fatally without executing another request", { skip: process.platform !== "win32" }, async () => {
  const session = await startWindowsProcessHostSpike();
  try {
    const invalid = encodeProcessHostFrame({
      kind: PROCESS_HOST_PROTOCOL.kinds.REQUEST_JSON,
      sequence: session.sendSequence,
      requestId: "ffeeddccbbaa99887766554433221100",
      payload: Buffer.from('{"schemaVersion":1,"operation":"capabilities","input":{}}'),
      key: session.nodeToHostKey
    });
    invalid[48] ^= 0xff;
    session.child.stdin.write(invalid);
    const outcome = await session.exitPromise;
    assert.equal(outcome.code, 0);
    assert.equal(session.fatalCode, "BAD_AUTH_TAG");
  } finally {
    if (!session.child.killed) session.child.stdin.end();
    await fs.rm(session.tempRoot, { recursive: true, force: true });
  }
});

test("host launch is independent of ambient system-path and PowerShell profile variables", { skip: process.platform !== "win32" }, async () => {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts", "windows-process-host-spike.mjs")], {
    cwd: repositoryRoot,
    env: {
      SystemDrive: "Z:",
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      ProgramData: "Z:\\poison-program-data",
      PATH: "Z:\\poison",
      PSModulePath: "Z:\\poison",
      PROFILE: "Z:\\poison-profile"
    },
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000
  });
  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.platform, "win32");
  await assert.rejects(
    fs.access(path.join(repositoryRoot, "%SystemDrive%")),
    (error) => error?.code === "ENOENT"
  );
});
