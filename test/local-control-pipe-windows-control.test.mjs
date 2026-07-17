import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  acquireLocalControlSecret,
  callLocalControl,
  remotePipeRefused,
  startWindowsLocalControlSpike
} from "../scripts/windows-local-control-spike.mjs";

const windowsOnly = process.platform === "win32" ? test : test.skip;

function powershellPath() {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function commandLineForPid(pid) {
  const script = `(Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\").CommandLine`;
  const result = spawnSync(powershellPath(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000
  });
  assert.equal(
    result.status,
    0,
    result.error?.code
      ? `command-line evidence query failed: ${result.error.code}`
      : result.stderr
  );
  return String(result.stdout).trim();
}

function runNegativeProbe(mode, pipePath, ownedJobName = "") {
  const scriptPath = path.resolve("test", "fixtures", "windows-local-control-negative-probe.ps1");
  const args = [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", scriptPath, "-Mode", mode, "-PipePath", pipePath
  ];
  if (ownedJobName) args.push("-OwnedJobName", ownedJobName);
  const result = spawnSync(powershellPath(), args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20_000
  });
  assert.equal(result.status, 0, `negative probe ${mode} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const lines = String(result.stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.ok(lines.length > 0, `negative probe ${mode} returned no JSON`);
  return JSON.parse(lines.at(-1));
}

async function replaceState(session, transform) {
  const statePath = path.join(session.stateRoot, `${session.serverId}.json`);
  const originalText = await fsp.readFile(statePath, "utf8");
  const state = JSON.parse(originalText);
  const changed = transform(structuredClone(state));
  await fsp.writeFile(statePath, `${JSON.stringify(changed)}\n`);
  return async () => fsp.writeFile(statePath, originalText);
}

windowsOnly("Gate A0 native pipe factory proves descriptor, token evidence, routing, private bootstrap, and cleanup", async () => {
  let first;
  let second;
  let firstRoot;
  let secondRoot;
  let stage = "start-first-server";
  try {
    first = await startWindowsLocalControlSpike();
    firstRoot = first.stateRoot;
    stage = "start-second-server";
    second = await startWindowsLocalControlSpike();
    secondRoot = second.stateRoot;
    stage = "initial-routing";
    assert.notEqual(first.serverId, second.serverId);
    assert.notEqual(first.nonce, second.nonce);
    assert.notEqual(first.ready.pipePath, second.ready.pipePath);
    assert.ok(first.ready.ownedJobName.endsWith(first.serverId));
    assert.ok(second.ready.ownedJobName.endsWith(second.serverId));

    stage = "parallel-describe";
    const [firstDescription, secondDescription] = await Promise.all([
      first.request("describe"),
      second.request("describe")
    ]);
    for (const [session, description] of [[first, firstDescription], [second, secondDescription]]) {
      stage = `command-line-evidence-${session.serverId}`;
      assert.equal(description.ok, true);
      assert.equal(description.serverId, session.serverId);
      assert.equal(description.nonce, session.nonce);
      assert.equal(description.client.clientPid, process.pid);
      assert.equal(description.client.accepted, true);
      assert.ok(description.client.userSid.startsWith("S-1-5-21-"));
      assert.ok(description.client.integrityRid >= 0x2000);
      assert.equal(description.client.isAppContainer, false);
      assert.equal(description.client.inOwnedJob, false);
      assert.equal(description.client.ownedJobCheck, "not_member");
      assert.equal(description.pipeRejectRemoteClients, true);
      assert.equal(description.bootstrapKeyTransport, "private_parent_stdin");

      assert.match(description.pipeSddl, /^O:LA/);
      assert.match(description.pipeSddl, /D:P/);
      assert.match(description.pipeSddl, /;;;SY\)/);
      assert.match(description.pipeSddl, /;;;LA\)/);
      assert.doesNotMatch(description.pipeSddl, /;;;(?:WD|AU|BU)\)/);
      assert.equal(description.pipeDescriptor.systemAclRevision, 2);
      assert.equal(description.pipeDescriptor.systemAclAceCount, 1);
      assert.equal(description.pipeDescriptor.mandatoryLabelAceCount, 1);
      assert.equal(description.pipeDescriptor.mandatoryLabelSid, "S-1-16-8192");
      assert.equal(description.pipeDescriptor.mandatoryPolicyMask, 1);
      assert.equal(description.pipeDescriptor.mediumNoWriteUp, true);
      assert.match(description.stateRootSddl, /^O:LA/);
      assert.match(description.stateFileSddl, /^O:LA/);
      assert.doesNotMatch(description.stateRootSddl, /;;;(?:WD|AU|BU)\)/);
      assert.doesNotMatch(description.stateFileSddl, /;;;(?:WD|AU|BU)\)/);

      const keyText = session.startupSecret.toString("base64");
      const stateText = await fsp.readFile(path.join(session.stateRoot, `${session.serverId}.json`), "utf8");
      assert.doesNotMatch(stateText, new RegExp(keyText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      const commandLine = commandLineForPid(session.child.pid);
      assert.doesNotMatch(commandLine, new RegExp(keyText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(commandLine, /bootstrapKey|keyDigest/i);
    }

    stage = "explicit-ping-routing";
    assert.equal((await first.request("ping")).serverId, first.serverId);
    assert.equal((await second.request("ping")).serverId, second.serverId);

    stage = "private-bootstrap-transfer";
    const transferredSecret = await acquireLocalControlSecret({
      stateRoot: first.stateRoot,
      serverId: first.serverId
    });
    try {
      assert.equal(transferredSecret.length, 32);
      assert.equal(transferredSecret.equals(first.startupSecret), true);
    } finally {
      transferredSecret.fill(0);
    }

    stage = "wrong-key-rejection";
    const wrongKey = randomBytes(32);
    const restoreKeyState = await replaceState(first, (state) => ({
      ...state,
      keyDigest: createHash("sha256").update(wrongKey).digest("hex")
    }));
    try {
      const rejected = await callLocalControl({
        stateRoot: first.stateRoot,
        serverId: first.serverId,
        startupSecret: wrongKey,
        operation: "ping"
      });
      assert.deepEqual({ ok: rejected.ok, code: rejected.code }, { ok: false, code: "CONTROL_KEY_MISMATCH" });
    } finally {
      await restoreKeyState();
    }

    stage = "nonce-rejection";
    const restoreNonceState = await replaceState(first, (state) => ({
      ...state,
      nonce: randomBytes(32).toString("hex")
    }));
    try {
      const rejected = await callLocalControl({
        stateRoot: first.stateRoot,
        serverId: first.serverId,
        startupSecret: first.startupSecret,
        operation: "ping"
      });
      assert.deepEqual({ ok: rejected.ok, code: rejected.code }, { ok: false, code: "CONTROL_NONCE_MISMATCH" });
    } finally {
      await restoreNonceState();
    }

    stage = "anonymous-wrong-user-refusal";
    const anonymousProbe = runNegativeProbe("anonymous", first.ready.pipePath);
    assert.equal(anonymousProbe.probeCompleted, true, anonymousProbe.probeError);
    assert.equal(anonymousProbe.opened, false);
    assert.equal(anonymousProbe.win32Error, 5);
    assert.equal((await first.request("ping")).ok, true);

    stage = "low-integrity-refusal";
    const lowIntegrityProbe = runNegativeProbe("low_integrity", first.ready.pipePath);
    assert.equal(lowIntegrityProbe.probeCompleted, true, lowIntegrityProbe.probeError);
    assert.equal(lowIntegrityProbe.integrityRid, 0x1000);
    assert.equal(lowIntegrityProbe.opened, false);
    assert.equal(lowIntegrityProbe.win32Error, 5);
    assert.equal((await first.request("ping")).ok, true);

    stage = "appcontainer-refusal";
    const appContainerProbe = runNegativeProbe("appcontainer", first.ready.pipePath);
    assert.equal(appContainerProbe.probeCompleted, true, appContainerProbe.probeError);
    assert.equal(appContainerProbe.processCreated, true);
    assert.equal(appContainerProbe.isAppContainer, true);
    assert.ok(appContainerProbe.integrityRid < 0x2000);
    assert.equal(appContainerProbe.childExitCode, 5);
    assert.equal(appContainerProbe.deleteProfileHresult, 0);
    assert.equal((await first.request("ping")).ok, true);

    stage = "owned-job-refusal";
    const ownedJobProbe = runNegativeProbe("owned_job", first.ready.pipePath, first.ready.ownedJobName);
    assert.equal(ownedJobProbe.probeCompleted, true, ownedJobProbe.probeError);
    assert.equal(ownedJobProbe.processCreated, true);
    assert.equal(ownedJobProbe.assignedToOwnedJob, true);
    assert.equal(ownedJobProbe.childExitCode, 42);
    assert.equal(ownedJobProbe.opened, true);
    assert.equal(ownedJobProbe.serverCode, "CONTROL_OWNED_JOB_CLIENT");
    assert.equal((await first.request("ping")).ok, true);

    stage = "remote-client-refusal";
    assert.equal(await remotePipeRefused(first.ready.pipePath), true);
    stage = "post-remote-second-server";
    assert.equal((await second.request("ping")).ok, true);
  } catch (error) {
    const wrapped = new Error(`${stage}: ${error?.message ?? String(error)}`, { cause: error });
    wrapped.code = error?.code;
    throw wrapped;
  } finally {
    await Promise.allSettled([first?.close(), second?.close()].filter(Boolean));
  }

  if (firstRoot) await assert.rejects(fsp.lstat(firstRoot), { code: "ENOENT" });
  if (secondRoot) await assert.rejects(fsp.lstat(secondRoot), { code: "ENOENT" });
});

windowsOnly("Gate A0 source keeps bootstrap material off argv/environment and uses the reviewed native factory", async () => {
  const source = await fsp.readFile(new URL("../scripts/windows-local-control-spike.mjs", import.meta.url), "utf8");
  const nativeSource = await fsp.readFile(new URL("../scripts/windows-local-control-spike.cs", import.meta.url), "utf8");
  assert.match(source, /child\.stdin\.write/);
  assert.match(source, /env: boundedEnvironment\(root\)/);
  assert.doesNotMatch(source, /spawn\([^\n]+bootstrapKey/);
  assert.match(nativeSource, /PIPE_REJECT_REMOTE_CLIENTS/);
  assert.match(nativeSource, /CreateNamedPipeW/);
  assert.match(nativeSource, /GetNamedPipeClientProcessId/);
  assert.match(nativeSource, /ImpersonateNamedPipeClient/);
  assert.match(nativeSource, /TokenIntegrityLevel/);
  assert.match(nativeSource, /TokenIsAppContainer/);
  assert.match(nativeSource, /CONTROL_OWNED_JOB_CLIENT/);
  assert.match(nativeSource, /SYSTEM_MANDATORY_LABEL_ACE_TYPE|aceType == 0x11/);
});
