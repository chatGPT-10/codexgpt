import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";
import {
  PROCESS_HOST_PROTOCOL,
  startWindowsProcessHostSpike
} from "../scripts/windows-process-host-spike.mjs";

const {
  WindowsProcessHostClient,
  decodeProcessHostCredit,
  encodeProcessHostCredit
} = await tsImport("../fixtures/ts-imports/process-host-imports.ts", import.meta.url);
const windowsOnly = process.platform === "win32" ? test : test.skip;

test("CXP4 credit payloads are exact bounded unsigned 64-bit byte counts", () => {
  const encoded = encodeProcessHostCredit(65_600);
  assert.equal(encoded.length, 8);
  assert.equal(decodeProcessHostCredit(encoded), 65_600);
  assert.throws(() => encodeProcessHostCredit(-1), /INVALID_CREDIT/);
  assert.throws(() => encodeProcessHostCredit(Number.MAX_SAFE_INTEGER + 1), /INVALID_CREDIT/);
  assert.throws(() => decodeProcessHostCredit(Buffer.alloc(7)), /INVALID_CREDIT_LENGTH/);
});

windowsOnly("production client starts the manifest-verified host and owns an independent lifecycle", async (t) => {
  const first = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  const second = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(async () => Promise.allSettled([first.close(), second.close()]));

  assert.notEqual(first.hostId, second.hostId);
  assert.notEqual(first.childProcessId, second.childProcessId);
  const [firstCapabilities, secondCapabilities] = await Promise.all([
    first.request("capabilities", {}),
    second.request("capabilities", {})
  ]);
  assert.equal(firstCapabilities.body.ok, true);
  assert.equal(secondCapabilities.body.ok, true);

  await first.close();
  const stillAlive = await second.request("capabilities", {});
  assert.equal(stillAlive.body.ok, true);
});

windowsOnly("production host enforces its native monotonic deadline while Node remains responsive", async (t) => {
  const client = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(() => client.close());
  const result = await client.request("run", {
    executable: process.execPath,
    arguments: [path.resolve("fixtures/native-host-process-tree-child.mjs"), "5000"],
    stdinBase64: "",
    timeoutMs: 250,
    stdoutLimitBytes: 65536,
    stderrLimitBytes: 65536,
    environment: {},
    cwd: path.resolve(".")
  }, { timeoutMs: 10_000 });
  assert.equal(result.body.timedOut, true);
  assert.equal(result.body.jobAssignedAtCreation, true);
});

windowsOnly("production host transports binary stdin and stdout beyond one JSON frame", async (t) => {
  const client = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(() => client.close());
  const input = Buffer.alloc(96 * 1024);
  for (let index = 0; index < input.length; index += 1) input[index] = index % 251;
  const result = await client.request("run", {
    executable: process.execPath,
    arguments: [
      "-e",
      "const c=[];process.stdin.on('data',b=>c.push(b));process.stdin.on('end',()=>process.stdout.write(Buffer.concat(c)))"
    ],
    stdinBase64: input.toString("base64"),
    timeoutMs: 10_000,
    stdoutLimitBytes: input.length,
    stderrLimitBytes: 4096,
    environment: {},
    cwd: path.resolve(".")
  }, { timeoutMs: 20_000 });
  assert.equal(result.body.streamTransport, "framed_v1");
  assert.deepEqual(Buffer.from(result.body.stdoutBase64, "base64"), input);
  assert.equal(result.body.stdoutTruncated, false);
});

windowsOnly("one host serializes framed runs while unrelated controls remain responsive", async (t) => {
  const client = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(() => client.close());
  const request = (delay, value) => client.request("run", {
    executable: process.execPath,
    arguments: ["-e", `setTimeout(()=>process.stdout.write(${JSON.stringify(value)}),${delay})`],
    stdinBase64: "",
    timeoutMs: 5_000,
    stdoutLimitBytes: 4096,
    stderrLimitBytes: 4096,
    environment: {},
    cwd: path.resolve(".")
  }, { timeoutMs: 10_000 });
  const first = request(150, "first");
  const second = request(0, "second");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const control = await client.request("capabilities", {}, { timeoutMs: 5_000 });
  assert.equal(control.body.ok, true);
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(Buffer.from(firstResult.body.stdoutBase64, "base64").toString("utf8"), "first");
  assert.equal(Buffer.from(secondResult.body.stdoutBase64, "base64").toString("utf8"), "second");
  assert.equal((await client.request("capabilities", {})).body.ok, true);
});

windowsOnly("production host cancels a timed-out request before its delayed effect", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-host-cancel-"));
  const marker = path.join(root, "late-effect.txt");
  const client = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(async () => {
    await client.close().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  });
  await assert.rejects(() => client.request("run", {
    executable: process.execPath,
    arguments: [
      "-e",
      `setTimeout(()=>import('node:fs').then(fs=>fs.writeFileSync(${JSON.stringify(marker)},'late')),500);setTimeout(()=>{},5000)`
    ],
    stdinBase64: "",
    timeoutMs: 5_000,
    stdoutLimitBytes: 4096,
    stderrLimitBytes: 4096,
    environment: {},
    cwd: path.resolve(".")
  }, { timeoutMs: 100 }), /HOST_REQUEST_TIMEOUT/);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await assert.rejects(fs.access(marker), (error) => error?.code === "ENOENT");
  const stillAlive = await client.request("capabilities", {});
  assert.equal(stillAlive.body.ok, true);
});

windowsOnly("production host accepts the 120 second deadline and 512 argument ceiling", async (t) => {
  const client = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(() => client.close());
  const result = await client.request("run", {
    executable: process.execPath,
    arguments: ["-e", "process.stdout.write('ok')", ...Array.from({ length: 510 }, () => "")],
    stdinBase64: "",
    timeoutMs: 120_000,
    stdoutLimitBytes: 4096,
    stderrLimitBytes: 4096,
    environment: {},
    cwd: path.resolve(".")
  }, { timeoutMs: 10_000 });
  assert.equal(result.body.ok, true);
  assert.equal(Buffer.from(result.body.stdoutBase64, "base64").toString("utf8"), "ok");
});

windowsOnly("production host rejects deadline and argument ceilings before spawning", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-host-timeout-cap-"));
  const marker = path.join(root, "spawned.txt");
  const client = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(async () => {
    await client.close().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  });
  const result = await client.request("run", {
    executable: process.execPath,
    arguments: ["-e", `import('node:fs').then(fs=>fs.writeFileSync(${JSON.stringify(marker)},'spawned'))`],
    stdinBase64: "",
    timeoutMs: 120_001,
    stdoutLimitBytes: 4096,
    stderrLimitBytes: 4096,
    environment: {},
    cwd: path.resolve(".")
  });
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "INVALID_TIMEOUTMS");
  await assert.rejects(fs.access(marker), (error) => error?.code === "ENOENT");
  const tooManyArguments = await client.request("run", {
    executable: process.execPath,
    arguments: [
      "-e",
      `import('node:fs').then(fs=>fs.writeFileSync(${JSON.stringify(marker)},'spawned'))`,
      ...Array.from({ length: 511 }, () => "")
    ],
    stdinBase64: "",
    timeoutMs: 10_000,
    stdoutLimitBytes: 4096,
    stderrLimitBytes: 4096,
    environment: {},
    cwd: path.resolve(".")
  });
  assert.equal(tooManyArguments.body.ok, false);
  assert.equal(tooManyArguments.body.code, "INVALID_ARGUMENTS");
  await assert.rejects(fs.access(marker), (error) => error?.code === "ENOENT");
});

windowsOnly("framed output remains bounded and the host is reusable after truncation", async (t) => {
  const client = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(() => client.close());
  const limit = 1024 * 1024;
  const result = await client.request("run", {
    executable: process.execPath,
    arguments: ["-e", "process.stdout.write(Buffer.alloc(2*1024*1024,0x61));process.stderr.write(Buffer.alloc(2*1024*1024,0x62))"],
    stdinBase64: "",
    timeoutMs: 10_000,
    stdoutLimitBytes: limit,
    stderrLimitBytes: limit,
    environment: {},
    cwd: path.resolve(".")
  }, { timeoutMs: 20_000 });
  assert.equal(Buffer.from(result.body.stdoutBase64, "base64").length, limit);
  assert.equal(Buffer.from(result.body.stderrBase64, "base64").length, limit);
  assert.equal(result.body.stdoutTruncated, true);
  assert.equal(result.body.stderrTruncated, true);
  assert.equal((await client.request("capabilities", {})).body.ok, true);
});

windowsOnly("closing the host prevents a queued request from executing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-host-close-"));
  const marker = path.join(root, "queued-effect.txt");
  const client = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  try {
    const active = assert.rejects(client.request("run", {
      executable: process.execPath,
      arguments: ["-e", "setTimeout(()=>{},5000)"],
      stdinBase64: "",
      timeoutMs: 10_000,
      stdoutLimitBytes: 4096,
      stderrLimitBytes: 4096,
      environment: {},
      cwd: path.resolve(".")
    }), /HOST_CLOSED|TRUNCATED_CONTROL/);
    const queued = assert.rejects(client.request("run", {
      executable: process.execPath,
      arguments: ["-e", `import('node:fs').then(fs=>fs.writeFileSync(${JSON.stringify(marker)},'queued'))`],
      stdinBase64: "",
      timeoutMs: 10_000,
      stdoutLimitBytes: 4096,
      stderrLimitBytes: 4096,
      environment: {},
      cwd: path.resolve(".")
    }), /HOST_CLOSED|TRUNCATED_CONTROL/);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await client.close();
    await Promise.all([active, queued]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await assert.rejects(fs.access(marker), (error) => error?.code === "ENOENT");
  } finally {
    await client.close().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
});

windowsOnly("production host fails closed on an older framed stream version", async (t) => {
  const session = await startWindowsProcessHostSpike();
  t.after(() => session.abort().catch(() => {}));
  const requestId = randomUUID().replaceAll("-", "");
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(requestId);
      reject(new Error("old stream version did not fail closed"));
    }, 10_000);
    session.pending.set(requestId, {
      resolve(value) { clearTimeout(timer); resolve(value); },
      reject(error) { clearTimeout(timer); reject(error); }
    });
  });
  session.sendFrame(PROCESS_HOST_PROTOCOL.kinds.REQUEST_JSON, {
    schemaVersion: 1,
    operation: "run",
    input: {
      executable: process.execPath,
      arguments: ["-e", "process.exit(0)"],
      timeoutMs: 10_000,
      stdoutLimitBytes: 4096,
      stderrLimitBytes: 4096,
      environment: {},
      cwd: path.resolve(".")
    },
    stream: { version: 0, inputBytes: 0, output: "frames" }
  }, { requestId });
  await assert.rejects(response, /STREAM_VERSION_MISMATCH/);
  assert.equal(session.fatalCode, "STREAM_VERSION_MISMATCH");
});
