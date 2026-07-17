import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const processHost = await tsImport("../fixtures/ts-imports/process-host-imports.ts", import.meta.url);
const {
  compileCommandForWindowsHost,
  discoverWindowsBackends,
  loadAndVerifyWindowsHostManifest,
  PROCESS_HOST_PROTOCOL
} = processHost;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("production host manifest binds the exact package-root sources and protocol", async () => {
  const verified = await loadAndVerifyWindowsHostManifest({
    scriptsRoot: path.resolve("scripts")
  });
  assert.equal(verified.manifest.schemaVersion, 1);
  assert.equal(verified.manifest.protocolVersion, 1);
  assert.equal(verified.manifest.headerLength, 64);
  assert.equal(verified.manifest.protocolSha256, sha256(await fsp.readFile("scripts/windows-process-host-protocol-v1.json")));
  assert.equal(verified.manifest.productionCSharpSha256, sha256(await fsp.readFile("scripts/windows-process-host.cs")));
  assert.equal(verified.manifest.productionPowerShellSha256, sha256(await fsp.readFile("scripts/windows-process-host.ps1")));
  assert.equal(verified.manifest.conPtyWorkerSha256, sha256(await fsp.readFile("scripts/windows-conpty-worker.ps1")));
  assert.equal(PROCESS_HOST_PROTOCOL.headerLength, 64);
  assert.equal(Object.isFrozen(verified.manifest), true);
});

test("manifest-bound Windows assets pin checkout bytes to LF", async () => {
  const attributes = new Set(
    (await fsp.readFile(".gitattributes", "utf8"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
  );
  for (const required of [
    "scripts/windows-*.cs text eol=lf",
    "scripts/windows-*.ps1 text eol=lf",
    "scripts/windows-*.json text eol=lf"
  ]) {
    assert.ok(attributes.has(required), `Missing stable checkout rule: ${required}`);
  }
});

test("backend discovery accepts only digest-reviewed explicit paths and deterministic Windows locations", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-backend-discovery-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const explicit = path.join(root, "reviewed.exe");
  await fsp.writeFile(explicit, Buffer.from("reviewed-backend"));
  const digest = sha256(Buffer.from("reviewed-backend"));

  const discovered = await discoverWindowsBackends({
    platform: "win32",
    systemRoot: path.join(root, "Windows"),
    programFiles: path.join(root, "Program Files"),
    localAppData: path.join(root, "LocalAppData"),
    explicit: [{ path: explicit, sha256: digest, kind: "argv", backendId: "reviewed-explicit" }]
  });
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].path, await fsp.realpath(explicit));
  assert.equal(discovered[0].sha256, digest);
  assert.equal(discovered[0].source, "reviewed_explicit");
  assert.match(discovered[0].identity, /^sha256:[a-f0-9]{64}:dev:[0-9]+:ino:[0-9]+$/);

  await fsp.writeFile(explicit, Buffer.from("replacement"));
  await assert.rejects(
    discoverWindowsBackends({
      platform: "win32",
      systemRoot: path.join(root, "Windows"),
      programFiles: path.join(root, "Program Files"),
      localAppData: path.join(root, "LocalAppData"),
      explicit: [{ path: explicit, sha256: digest, kind: "argv", backendId: "reviewed-explicit" }]
    }),
    (error) => error?.code === "BACKEND_STALE"
  );
});

test("command compiler preserves argv boundaries and keeps PowerShell source out of argv", () => {
  const backend = Object.freeze({
    schemaVersion: 1,
    backendId: "windows-powershell-5.1",
    backendVersion: "5.1",
    kind: "powershell",
    source: "windows_builtin",
    path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    realPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    sha256: "a".repeat(64),
    identity: `sha256:${"a".repeat(64)}:dev:1:ino:2`
  });
  const argv = compileCommandForWindowsHost({
    command: { kind: "argv", executable: "C:\\Tools\\tool.exe", args: ["", "two words", "\"quoted\"", "&|<>", "中文"] },
    backend: { ...backend, backendId: "reviewed-argv", kind: "argv", path: "C:\\Tools\\tool.exe", realPath: "C:\\Tools\\tool.exe" },
    cwd: "C:\\Work",
    environment: { A: "1" },
    deadlineMs: 30_000
  });
  assert.deepEqual(argv.request.input.arguments, ["", "two words", "\"quoted\"", "&|<>", "中文"]);
  assert.equal(argv.request.input.executable, "C:\\Tools\\tool.exe");

  const marker = "CXP4_PRIVATE_SCRIPT_MARKER";
  const powershell = compileCommandForWindowsHost({
    command: { kind: "powershell", script: `Write-Output '${marker}'`, edition: "windows" },
    backend,
    cwd: "C:\\Work",
    environment: {},
    deadlineMs: 30_000
  });
  assert.equal(powershell.request.operation, "run_powershell");
  assert.equal(powershell.request.input.executable, backend.realPath);
  assert.equal(JSON.stringify(powershell.spawnArgv).includes(marker), false);
  assert.equal(powershell.request.input.script.includes(marker), true);
  assert.equal(powershell.authorization.backendIdentity, backend.identity);
});
