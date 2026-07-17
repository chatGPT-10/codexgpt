#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import dgram from "node:dgram";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
export const SANDBOX_PROBE_REVISION = "phase-4b0-gate-s-v1";

export const REQUIRED_SANDBOX_ISOLATION_KEYS = Object.freeze([
  "liveWorkspace",
  "userProfile",
  "codexState",
  "browserState",
  "credentialState",
  "protectedRegistry",
  "unrelatedProcess",
  "unrelatedToken",
  "unrelatedSection",
  "approvalControlIpc",
  "controlIpc",
  "auditIpc",
  "namedObject",
  "globalObject",
  "mailslot",
  "rawPhysicalDevice",
  "rawVolume",
  "wmiBroker",
  "serviceBroker",
  "schedulerBroker",
  "comBroker",
  "tcpIpv4Loopback",
  "tcpIpv6Loopback",
  "tcpIpv4Private",
  "tcpIpv4LinkLocal",
  "tcpIpv4Public",
  "tcpIpv6LinkLocal",
  "tcpIpv6Public",
  "udpIpv4Loopback",
  "udpIpv6Loopback",
  "udpIpv4Private",
  "udpIpv4LinkLocal",
  "udpIpv4Public",
  "udpIpv4Multicast",
  "udpIpv6LinkLocal",
  "udpIpv6Public",
  "udpIpv6Multicast",
  "dnsUdp",
  "dohHttps",
  "directHttp",
  "proxyHttp"
]);

export const REQUIRED_SANDBOX_NETWORK_KEYS = Object.freeze([
  "tcpIpv4Loopback",
  "tcpIpv6Loopback",
  "tcpIpv4Private",
  "tcpIpv4LinkLocal",
  "tcpIpv4Public",
  "tcpIpv6LinkLocal",
  "tcpIpv6Public",
  "udpIpv4Loopback",
  "udpIpv6Loopback",
  "udpIpv4Private",
  "udpIpv4LinkLocal",
  "udpIpv4Public",
  "udpIpv4Multicast",
  "udpIpv6LinkLocal",
  "udpIpv6Public",
  "udpIpv6Multicast",
  "dnsUdp",
  "dohHttps",
  "directHttp",
  "proxyHttp"
]);

export const REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS = Object.freeze([
  "hostLiveWorkspace",
  "hostUserProfile",
  "hostCodexState",
  "hostBrowserState",
  "hostCredentialState",
  "hostProtectedRegistry",
  "hostUnrelatedProcess",
  "hostUnrelatedToken",
  "hostUnrelatedSection",
  "hostApprovalControlIpc",
  "hostControlIpc",
  "hostAuditIpc",
  "hostNamedObject",
  "hostGlobalObject",
  "hostMailslot",
  "hostWmiBroker",
  "hostServiceBroker",
  "hostSchedulerBroker",
  "hostComBroker",
  "hostTcpIpv4Loopback",
  "hostTcpIpv6Loopback",
  "hostTcpIpv4Private",
  "hostTcpIpv4LinkLocal",
  "hostTcpIpv4Public",
  "hostTcpIpv6LinkLocal",
  "hostTcpIpv6Public",
  "hostUdpIpv4Loopback",
  "hostUdpIpv6Loopback",
  "hostUdpIpv4Private",
  "hostUdpIpv4LinkLocal",
  "hostUdpIpv4Public",
  "hostUdpIpv4Multicast",
  "hostUdpIpv6LinkLocal",
  "hostUdpIpv6Public",
  "hostUdpIpv6Multicast",
  "hostDnsUdp",
  "hostDohHttps",
  "hostDirectHttp",
  "hostProxyHttp",
  "powershellStarted"
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "probeRevision",
  "fixtureDigest",
  "platform",
  "windowsBuild",
  "architecture",
  "usedElevation",
  "identity",
  "backends",
  "isolation",
  "positiveControls",
  "cleanup",
  "result",
  "reason"
]);
const IDENTITY_KEYS = Object.freeze([
  "profileCreated",
  "profileDeleted",
  "uniqueProfile",
  "collisionRejected",
  "isAppContainer",
  "isLpac",
  "lpacStatus",
  "appContainerSidMatches",
  "hostChildAgreement",
  "integrityRid",
  "capabilityCount",
  "restrictedSidCount",
  "jobMember"
]);
const BACKEND_KEYS = Object.freeze(["windowsPowerShell", "node", "gitBash"]);
const BACKEND_RESULT_KEYS = Object.freeze(["status", "classification", "exitCode"]);
const ISOLATION_RESULT_KEYS = Object.freeze(["status", "classification", "code"]);
const CLEANUP_KEYS = Object.freeze([
  "normalProbeExited",
  "crashProbeExited",
  "partialSpawnRejected",
  "jobEmpty",
  "profileDeleted",
  "privateTreeDeleted",
  "privateRegistryDeleted",
  "namedObjectsClosed",
  "noResidualAclTargets",
  "persistentSystemStateChanged"
]);

function fail(code = "SANDBOX_CAPABILITY_EVIDENCE_INCOMPLETE") {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail();
}

function isBoolean(value) {
  return value === true || value === false;
}

function validateBackend(value) {
  exactKeys(value, BACKEND_RESULT_KEYS);
  if (!["proved", "unavailable"].includes(value.status)) fail();
  if (typeof value.classification !== "string" || value.classification.length === 0) fail();
  if (!(value.exitCode === null || Number.isInteger(value.exitCode))) fail();
}

function validateIsolationResult(value) {
  exactKeys(value, ISOLATION_RESULT_KEYS);
  if (!["denied", "allowed", "partial", "non_policy_failure"].includes(value.status)) fail();
  if (typeof value.classification !== "string" || value.classification.length === 0) fail();
  if (!Number.isInteger(value.code)) fail();
}

function isExactNetworkPolicyDenial(value) {
  return value?.status === "denied" &&
    value.classification === "wsaeacces" &&
    value.code === 10013;
}

function qualifiesForGateS(value) {
  return value.usedElevation === false &&
    value.identity.profileCreated === true &&
    value.identity.profileDeleted === true &&
    value.identity.uniqueProfile === true &&
    value.identity.collisionRejected === true &&
    value.identity.isAppContainer === true &&
    value.identity.isLpac === false &&
    value.identity.lpacStatus === "proved" &&
    value.identity.appContainerSidMatches === true &&
    value.identity.hostChildAgreement === true &&
    Number.isInteger(value.identity.integrityRid) && value.identity.integrityRid >= 0 && value.identity.integrityRid < 0x2000 &&
    value.identity.capabilityCount === 0 &&
    Number.isInteger(value.identity.restrictedSidCount) && value.identity.restrictedSidCount >= 0 &&
    value.identity.jobMember === true &&
    value.backends.windowsPowerShell.status === "proved" &&
    REQUIRED_SANDBOX_ISOLATION_KEYS.every((key) => value.isolation[key].status === "denied") &&
    REQUIRED_SANDBOX_NETWORK_KEYS.every((key) => isExactNetworkPolicyDenial(value.isolation[key])) &&
    REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS.every((key) => value.positiveControls[key] === true) &&
    value.cleanup.normalProbeExited === true &&
    value.cleanup.crashProbeExited === true &&
    value.cleanup.partialSpawnRejected === true &&
    value.cleanup.jobEmpty === true &&
    value.cleanup.profileDeleted === true &&
    value.cleanup.privateTreeDeleted === true &&
    value.cleanup.privateRegistryDeleted === true &&
    value.cleanup.namedObjectsClosed === true &&
    value.cleanup.noResidualAclTargets === true &&
    value.cleanup.persistentSystemStateChanged === false;
}

export function validateSandboxCapabilityEvidence(value) {
  try {
    exactKeys(value, TOP_LEVEL_KEYS);
    if (value.schemaVersion !== 2 || value.probeRevision !== SANDBOX_PROBE_REVISION || value.platform !== "win32") fail();
    if (!/^[a-f0-9]{64}$/.test(value.fixtureDigest)) fail();
    if (typeof value.windowsBuild !== "string" || value.windowsBuild.length === 0) fail();
    if (!["x64", "x86", "arm64"].includes(value.architecture)) fail();
    if (!isBoolean(value.usedElevation)) fail();

    exactKeys(value.identity, IDENTITY_KEYS);
    for (const key of [
      "profileCreated", "profileDeleted", "uniqueProfile", "collisionRejected", "isAppContainer",
      "isLpac", "appContainerSidMatches", "hostChildAgreement", "jobMember"
    ]) {
      if (!isBoolean(value.identity[key])) fail();
    }
    if (!["proved", "backend_incompatible", "partial"].includes(value.identity.lpacStatus)) fail();
    for (const key of ["integrityRid", "capabilityCount", "restrictedSidCount"]) {
      if (!Number.isInteger(value.identity[key])) fail();
    }

    exactKeys(value.backends, BACKEND_KEYS);
    for (const key of BACKEND_KEYS) validateBackend(value.backends[key]);

    exactKeys(value.isolation, REQUIRED_SANDBOX_ISOLATION_KEYS);
    for (const key of REQUIRED_SANDBOX_ISOLATION_KEYS) validateIsolationResult(value.isolation[key]);

    exactKeys(value.positiveControls, REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS);
    for (const key of REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS) {
      if (!isBoolean(value.positiveControls[key])) fail();
    }

    exactKeys(value.cleanup, CLEANUP_KEYS);
    for (const key of CLEANUP_KEYS) {
      if (!isBoolean(value.cleanup[key])) fail();
    }

    if (!["proved", "blocked"].includes(value.result)) fail();
    if (!(value.reason === null || (typeof value.reason === "string" && value.reason.length > 0))) fail();
    const qualifies = qualifiesForGateS(value);
    if (value.result === "proved" && (!qualifies || value.reason !== null)) fail();
    if (value.result === "blocked" && (qualifies || typeof value.reason !== "string" || value.reason.length === 0)) fail();
    return Object.freeze(structuredClone(value));
  } catch (error) {
    if (error?.code === "SANDBOX_CAPABILITY_EVIDENCE_INCOMPLETE") throw error;
    fail();
  }
}

export function projectSandboxCapabilityEvidence(value) {
  if (typeof value?.platform === "string" && value.platform !== "win32") {
    return Object.freeze({
      workspaceSandbox: "unavailable",
      fallback: "none",
      reason: typeof value?.reason === "string" ? value.reason : "WINDOWS_REQUIRED"
    });
  }
  try {
    const evidence = validateSandboxCapabilityEvidence(value);
    if (evidence.result === "proved") {
      return Object.freeze({
        workspaceSandbox: "proved",
        fallback: "none",
        backend: "appcontainer",
        windowsBuild: evidence.windowsBuild,
        probeRevision: evidence.probeRevision
      });
    }
    return Object.freeze({
      workspaceSandbox: "unavailable",
      fallback: "none",
      reason: evidence.reason,
      probeRevision: evidence.probeRevision
    });
  } catch {
    return Object.freeze({
      workspaceSandbox: "unavailable",
      fallback: "none",
      reason: "SANDBOX_CAPABILITY_EVIDENCE_INCOMPLETE"
    });
  }
}

function boundedEnvironment() {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  const systemDrive = path.parse(systemRoot).root.replace(/[\\/]$/, "") || "C:";
  return {
    SystemDrive: systemDrive,
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    ComSpec: path.join(systemRoot, "System32", "cmd.exe"),
    PATH: `${path.join(systemRoot, "System32")};${systemRoot}`,
    PATHEXT: ".COM;.EXE;.BAT;.CMD"
  };
}

async function listenTcp(host) {
  const server = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host, port: 0, exclusive: true }, resolve);
  });
  server.unref();
  return server;
}

async function listenUdp(type, host) {
  const socket = dgram.createSocket(type);
  socket.on("message", (message, remote) => {
    socket.send(Buffer.from("ok"), remote.port, remote.address, () => {});
  });
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, host, resolve);
  });
  socket.unref();
  return socket;
}

export async function selectProtectedPathCandidate(candidates) {
  const resolvedCandidates = candidates.filter(Boolean).map((candidate) => path.resolve(candidate));
  if (resolvedCandidates.length === 0) throw new Error("PROTECTED_PATH_CANDIDATE_REQUIRED");
  for (const candidate of resolvedCandidates) {
    try {
      await fs.stat(candidate);
      return candidate;
    } catch {
      // Preserve the exact candidate set; do not widen to a parent directory.
    }
  }
  return resolvedCandidates[0];
}

async function discoverProtectedPaths() {
  const userProfile = process.env.USERPROFILE ?? process.env.HOME ?? path.dirname(repositoryRoot);
  const localAppData = process.env.LOCALAPPDATA ?? path.join(userProfile, "AppData", "Local");
  const roamingAppData = process.env.APPDATA ?? path.join(userProfile, "AppData", "Roaming");
  return {
    userProfile: await selectProtectedPathCandidate([userProfile]),
    codexState: await selectProtectedPathCandidate([path.join(userProfile, ".codex")]),
    browserState: await selectProtectedPathCandidate([
      path.join(localAppData, "Google", "Chrome", "User Data"),
      path.join(localAppData, "Microsoft", "Edge", "User Data"),
      path.join(roamingAppData, "Mozilla", "Firefox", "Profiles")
    ]),
    credentialState: await selectProtectedPathCandidate([
      path.join(roamingAppData, "Microsoft", "Credentials"),
      path.join(localAppData, "Microsoft", "Credentials")
    ])
  };
}

async function discoverGitBash() {
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Git", "bin", "bash.exe"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Git", "usr", "bin", "bash.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe")
  ];
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await fs.access(candidate);
      return path.resolve(candidate);
    } catch {
      // Continue through fixed native-Windows Git candidates.
    }
  }
  return "";
}

async function fixtureDigest() {
  const files = [
    "scripts/windows-sandbox-spike.mjs",
    "scripts/windows-sandbox-spike.ps1",
    "scripts/windows-sandbox-cleanup.ps1",
    "scripts/windows-sandbox-spike.cs",
    "scripts/windows-sandbox-attack-probe.cs",
    "fixtures/sandbox-attacks/backend-powershell.ps1",
    "fixtures/sandbox-attacks/backend-node.mjs",
    "fixtures/sandbox-attacks/backend-git-bash.sh"
  ];
  const hash = createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await fs.readFile(path.join(repositoryRoot, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function terminateOwnedHost(child) {
  if (!child || child.killed) return;
  child.kill();
}

function cleanupSandboxNonce(probeNonce) {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  const executable = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const result = spawnSync(executable, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", path.join(scriptDirectory, "windows-sandbox-cleanup.ps1"),
    "-ProbeNonce", probeNonce
  ], {
    cwd: scriptDirectory,
    env: boundedEnvironment(),
    windowsHide: true,
    stdio: "ignore",
    timeout: 15_000
  });
  return !result.error && result.status === 0;
}

function cleanupAfterAbnormalExit(probeNonce, child, terminateTree = false) {
  if (terminateTree) terminateOwnedHost(child);
  return cleanupSandboxNonce(probeNonce) ? "CLEANUP_PROVED" : "CLEANUP_FAILED";
}

function runPowerShell(args, probeNonce) {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  const executable = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(scriptDirectory, "windows-sandbox-spike.ps1"),
      ...args
    ], {
      cwd: scriptDirectory,
      env: boundedEnvironment(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      const cleanupStatus = cleanupAfterAbnormalExit(probeNonce, child, true);
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      const detail = stderr.trim().slice(-4096);
      finish(() => reject(new Error(`SANDBOX_SPIKE_TIMEOUT_${cleanupStatus}${detail ? `: ${detail}` : ""}`)));
    }, 90_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-2_097_152);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-131_072);
    });
    child.once("error", (error) => finish(() => {
      const cleanupStatus = cleanupAfterAbnormalExit(probeNonce, child);
      reject(new Error(`${error?.message ?? String(error)}_${cleanupStatus}`));
    }));
    child.once("close", (code) => finish(() => {
      if (code !== 0) {
        const cleanupStatus = cleanupAfterAbnormalExit(probeNonce, child);
        reject(new Error(`SANDBOX_SPIKE_FAILED_${code}_${cleanupStatus}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      try {
        const evidence = JSON.parse(lines.at(-1) ?? "");
        if (!cleanupSandboxNonce(probeNonce)) {
          reject(new Error("SANDBOX_SPIKE_POST_RUN_CLEANUP_FAILED"));
          return;
        }
        resolve(evidence);
      } catch (error) {
        const message = `SANDBOX_SPIKE_INVALID_JSON: ${stderr.trim() || stdout.trim() || error?.message || "unknown"}`;
        const cleanupStatus = cleanupAfterAbnormalExit(probeNonce, child);
        reject(new Error(`${message}_${cleanupStatus}`));
      }
    }));
  });
}

async function closeServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await Promise.race([
    new Promise((resolve) => server.close(resolve)),
    new Promise((resolve) => setTimeout(resolve, 1_000))
  ]);
}

async function closeUdp(socket) {
  if (!socket) return;
  await Promise.race([
    new Promise((resolve) => socket.close(resolve)),
    new Promise((resolve) => setTimeout(resolve, 1_000))
  ]);
}

export async function runWindowsSandboxSpike() {
  if (process.platform !== "win32") {
    return Object.freeze({ schemaVersion: 2, platform: process.platform, result: "unavailable", reason: "WINDOWS_REQUIRED" });
  }

  const tcp4 = await listenTcp("127.0.0.1");
  const udp4 = await listenUdp("udp4", "127.0.0.1");
  let tcp6;
  let udp6;
  try {
    tcp6 = await listenTcp("::1");
    udp6 = await listenUdp("udp6", "::1");
    const protectedPaths = await discoverProtectedPaths();
    const digest = await fixtureDigest();
    const probeNonce = randomBytes(16).toString("hex");
    const evidence = await runPowerShell([
      "-RepositoryRoot", repositoryRoot,
      "-FixtureDigest", digest,
      "-ProbeNonce", probeNonce,
      "-Ipv4Port", String(tcp4.address().port),
      "-Ipv6Port", String(tcp6.address().port),
      "-Udp4Port", String(udp4.address().port),
      "-Udp6Port", String(udp6.address().port),
      "-ParentPid", String(process.pid),
      "-UserProfilePath", protectedPaths.userProfile,
      "-CodexStatePath", protectedPaths.codexState,
      "-BrowserStatePath", protectedPaths.browserState,
      "-CredentialStatePath", protectedPaths.credentialState,
      "-NodePath", process.execPath,
      "-GitBashPath", await discoverGitBash()
    ], probeNonce);
    return validateSandboxCapabilityEvidence(evidence);
  } finally {
    await Promise.all([closeServer(tcp4), closeServer(tcp6), closeUdp(udp4), closeUdp(udp6)]);
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runWindowsSandboxSpike()
    .then((evidence) => process.stdout.write(`${JSON.stringify(evidence)}\n`))
    .catch((error) => {
      process.stderr.write(`${error?.code ?? error?.message ?? String(error)}\n`);
      process.exitCode = 1;
    });
}
