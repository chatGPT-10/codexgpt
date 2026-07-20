import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_SANDBOX_ISOLATION_KEYS,
  REQUIRED_SANDBOX_NETWORK_KEYS,
  REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS,
  projectSandboxCapabilityEvidence,
  selectProtectedPathCandidate,
  validateSandboxCapabilityEvidence
} from "../scripts/windows-sandbox-spike.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function denied(code = 5, classification = "win32_access_denied") {
  return Object.freeze({ status: "denied", classification, code });
}

function backend(status, classification, exitCode) {
  return Object.freeze({ status, classification, exitCode });
}

function completeEvidence(overrides = {}) {
  const isolation = Object.fromEntries(
    REQUIRED_SANDBOX_ISOLATION_KEYS.map((key) => [
      key,
      REQUIRED_SANDBOX_NETWORK_KEYS.includes(key)
        ? denied(10013, "wsaeacces")
        : denied()
    ])
  );
  return Object.freeze({
    schemaVersion: 2,
    probeRevision: "phase-4b0-gate-s-v1",
    fixtureDigest: "a".repeat(64),
    platform: "win32",
    windowsBuild: "19044",
    architecture: "x64",
    usedElevation: false,
    identity: Object.freeze({
      profileCreated: true,
      profileDeleted: true,
      uniqueProfile: true,
      collisionRejected: true,
      isAppContainer: true,
      isLpac: false,
      lpacStatus: "proved",
      appContainerSidMatches: true,
      hostChildAgreement: true,
      integrityRid: 4096,
      capabilityCount: 0,
      restrictedSidCount: 0,
      jobMember: true
    }),
    backends: Object.freeze({
      windowsPowerShell: backend("proved", "exit_0", 0),
      node: backend("unavailable", "runtime_acl_unavailable", null),
      gitBash: backend("unavailable", "runtime_not_found", null)
    }),
    isolation: Object.freeze(isolation),
    positiveControls: Object.freeze(Object.fromEntries(
      REQUIRED_SANDBOX_POSITIVE_CONTROL_KEYS.map((key) => [key, true])
    )),
    cleanup: Object.freeze({
      normalProbeExited: true,
      crashProbeExited: true,
      partialSpawnRejected: true,
      jobEmpty: true,
      profileDeleted: true,
      privateTreeDeleted: true,
      privateRegistryDeleted: true,
      namedObjectsClosed: true,
      noResidualAclTargets: true,
      persistentSystemStateChanged: false
    }),
    result: "proved",
    reason: null,
    ...overrides
  });
}

test("Gate S capability projection accepts only complete proved evidence", () => {
  const evidence = completeEvidence();
  const validated = validateSandboxCapabilityEvidence(evidence);
  assert.deepEqual(validated, evidence);
  assert.deepEqual(projectSandboxCapabilityEvidence(validated), {
    workspaceSandbox: "proved",
    fallback: "none",
    backend: "appcontainer",
    windowsBuild: "19044",
    probeRevision: "phase-4b0-gate-s-v1"
  });
});

test("Gate S rejects a forged proved result when any required fact is partial, allowed, elevated, or uncleared", () => {
  const candidates = [
    completeEvidence({
      isolation: {
        ...completeEvidence().isolation,
        protectedRegistry: { status: "partial", classification: "timeout", code: 0 }
      }
    }),
    completeEvidence({
      isolation: {
        ...completeEvidence().isolation,
        comBroker: { status: "allowed", classification: "success", code: 0 }
      }
    }),
    completeEvidence({ usedElevation: true }),
    completeEvidence({
      identity: { ...completeEvidence().identity, lpacStatus: "backend_incompatible" }
    }),
    completeEvidence({
      cleanup: { ...completeEvidence().cleanup, namedObjectsClosed: false }
    }),
    completeEvidence({
      cleanup: { ...completeEvidence().cleanup, privateRegistryDeleted: false }
    }),
    completeEvidence({
      positiveControls: { ...completeEvidence().positiveControls, hostDirectHttp: false }
    }),
    completeEvidence({
      backends: {
        ...completeEvidence().backends,
        windowsPowerShell: backend("unavailable", "runtime_acl_unavailable", null)
      }
    }),
    completeEvidence({
      isolation: {
        ...completeEvidence().isolation,
        tcpIpv4Public: { status: "denied", classification: "connection_refused", code: 10061 }
      }
    }),
    completeEvidence({
      isolation: {
        ...completeEvidence().isolation,
        udpIpv4Public: { status: "denied", classification: "timeout", code: 10060 }
      }
    }),
    completeEvidence({
      isolation: {
        ...completeEvidence().isolation,
        proxyHttp: { status: "denied", classification: "wsaeacces", code: 5 }
      }
    })
  ];

  for (const candidate of candidates) {
    assert.throws(
      () => validateSandboxCapabilityEvidence(candidate),
      /SANDBOX_CAPABILITY_EVIDENCE_INCOMPLETE/
    );
  }
});

test("Gate S accepts complete blocked evidence only as unavailable with no full-access fallback", () => {
  const blocked = completeEvidence({
    isolation: {
      ...completeEvidence().isolation,
      comBroker: { status: "allowed", classification: "success", code: 0 }
    },
    result: "blocked",
    reason: "COM_BROKER_REACHABLE"
  });

  const validated = validateSandboxCapabilityEvidence(blocked);
  assert.equal(validated.result, "blocked");
  assert.deepEqual(projectSandboxCapabilityEvidence(validated), {
    workspaceSandbox: "unavailable",
    fallback: "none",
    reason: "COM_BROKER_REACHABLE",
    probeRevision: "phase-4b0-gate-s-v1"
  });
});

test("Gate S projection never maps non-Windows or malformed evidence to full access", () => {
  assert.deepEqual(projectSandboxCapabilityEvidence({
    schemaVersion: 2,
    platform: "linux",
    result: "unavailable",
    reason: "WINDOWS_REQUIRED"
  }), {
    workspaceSandbox: "unavailable",
    fallback: "none",
    reason: "WINDOWS_REQUIRED"
  });

  assert.deepEqual(projectSandboxCapabilityEvidence({ result: "proved" }), {
    workspaceSandbox: "unavailable",
    fallback: "none",
    reason: "SANDBOX_CAPABILITY_EVIDENCE_INCOMPLETE"
  });
});

test("Gate S protected-path selection never widens a missing exact target to its parent", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-phase4b0-paths-"));
  try {
    const first = path.join(root, "first-exact-target");
    const second = path.join(root, "second-exact-target");
    await fs.mkdir(second);
    assert.equal(await selectProtectedPathCandidate([first, second]), path.resolve(second));
    await fs.rm(second, { recursive: true, force: true });
    assert.equal(await selectProtectedPathCandidate([first, second]), path.resolve(first));
    await assert.rejects(() => selectProtectedPathCandidate([]), /PROTECTED_PATH_CANDIDATE_REQUIRED/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Gate S binds evidence to executed fixtures and cleans every abnormal host exit", async () => {
  const [hostSource, driverSource] = await Promise.all([
    fs.readFile(path.join(repositoryRoot, "scripts", "windows-sandbox-spike.cs"), "utf8"),
    fs.readFile(path.join(repositoryRoot, "scripts", "windows-sandbox-spike.mjs"), "utf8")
  ]);

  assert.match(hostSource, /VerifyFixtureDigest\(repositoryRoot, fixtureDigest\)/);
  assert.match(hostSource, /SHA256\.Create\(\)/);
  assert.doesNotMatch(hostSource, /CleanupStaleRuns/);
  assert.match(driverSource, /cleanupAfterAbnormalExit\(probeNonce/);
  assert.match(driverSource, /child\.kill\(\)/);
  assert.doesNotMatch(driverSource, /taskkill/i);
  assert.match(driverSource, /if \(code !== 0\)[\s\S]*cleanupAfterAbnormalExit/);
  assert.match(driverSource, /SANDBOX_SPIKE_INVALID_JSON[\s\S]*cleanupAfterAbnormalExit/);
});

test("Gate S attack oracle isolates every probe and treats UDP send success as an escape", async () => {
  const [attackSource, hostSource] = await Promise.all([
    fs.readFile(path.join(repositoryRoot, "scripts", "windows-sandbox-attack-probe.cs"), "utf8"),
    fs.readFile(path.join(repositoryRoot, "scripts", "windows-sandbox-spike.cs"), "utf8")
  ]);

  assert.match(attackSource, /Required\(options, "probe"\)/);
  assert.doesNotMatch(attackSource, /Task\.Factory\.StartNew/);
  const udpMethod = attackSource.match(/private static void UdpRoundTrip[\s\S]*?\n\s*private static byte\[\] BuildDnsQuery/)?.[0] ?? "";
  assert.match(udpMethod, /socket\.Send\(payload\)/);
  assert.doesNotMatch(udpMethod, /socket\.Receive/);
  assert.match(hostSource, /foreach \(string probeKey in IsolationKeys\)/);
  assert.match(hostSource, /"--mode", "probe", "--probe", probeKey/);
  assert.match(hostSource, /AddStrictPositive\(result, positiveLines, "hostTcpIpv4Public", "tcpIpv4Loopback"\)/);
  assert.match(hostSource, /AddStrictPositive\(result, positiveLines, "hostUdpIpv6Multicast", "udpIpv6Loopback"\)/);
  assert.doesNotMatch(hostSource, /AddNetworkPositive/);
  assert.match(hostSource, /IsExactNetworkPolicyDenial/);
});
