import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";
import { processCreationTime } from "../scripts/long-task-runner.mjs";
import { remotePipeRefused } from "../scripts/windows-local-control-spike.mjs";

const {
  SessionGrantStore,
  PendingApprovalStore,
  createAuthorizationFactsV3,
  semanticDigest,
  LocalApprovalClient,
  LocalApprovalServer,
  WindowsLocalControlRuntime,
  localControlServerId
} = await tsImport("../fixtures/ts-imports/local-approval-integration-imports.ts", import.meta.url);

const windowsOnly = process.platform === "win32" ? test : test.skip;
const fingerprint = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function approvalFacts(serverId, sessionId, suffix) {
  return createAuthorizationFactsV3({
    serverId,
    credentialRef: suffix === "first" ? "cred_aaaaaaaaaaaaaaaa" : "cred_bbbbbbbbbbbbbbbb",
    credentialRevision: "credential-revision-1",
    transportKind: "http",
    transportSessionId: sessionId,
    identityKind: "authenticated_subject",
    identitySubject: `subject-${suffix}`,
    workspaceId: `workspace-${suffix}`,
    leaseId: `lease-${suffix}`,
    policyRevision: "policy-v3",
    evidenceRevision: "evidence-v3",
    toolContractVersion: "3",
    toolName: "run_command",
    canonicalAction: "process.run_command",
    operation: "process.execute",
    resourceFingerprint: fingerprint(`resource:${suffix}`),
    inputDigest: fingerprint(`input:${suffix}`),
    semanticFactsDigest: semanticDigest({ backend: "windows-native-pipe", argv: ["node", `${suffix}.mjs`] }),
    riskClass: "R3"
  });
}

function summary(suffix) {
  return {
    backend: "windows-native-pipe",
    actionKind: "process.execute",
    argumentCount: 2,
    logicalScope: `workspace-${suffix}`,
    identityLabel: `subject-${suffix}`,
    authoritySummary: "ambient current-user process authority; ask first",
    digestPrefix: createHash("sha256").update(suffix).digest("hex").slice(0, 16)
  };
}

async function createServer(suffix) {
  const serverId = localControlServerId();
  const approvals = new PendingApprovalStore();
  const grants = new SessionGrantStore();
  const requested = (await approvals.request({
    facts: approvalFacts(serverId, `session-${suffix}`, suffix),
    summary: summary(suffix)
  })).approval;
  return {
    serverId,
    approvals,
    grants,
    requested,
    server: new LocalApprovalServer({ serverId, approvals, grants })
  };
}

windowsOnly("production local-control factory routes exact servers and performs real approval decisions", async (t) => {
  const stateBaseRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "codexpro-production-control-"));
  const first = await createServer("first");
  const second = await createServer("second");
  const runtimes = [];
  t.after(async () => {
    await Promise.allSettled(runtimes.map((runtime) => runtime.close()));
    await fsp.rm(stateBaseRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  runtimes.push(await WindowsLocalControlRuntime.start({ server: first.server, stateBaseRoot }));
  runtimes.push(await WindowsLocalControlRuntime.start({ server: second.server, stateBaseRoot }));
  assert.notEqual(runtimes[0].serverId, runtimes[1].serverId);
  assert.equal(runtimes[0].ready.pipeRejectRemoteClients, true);
  assert.equal(runtimes[1].ready.pipeRejectRemoteClients, true);
  assert.equal(await remotePipeRefused(runtimes[0].ready.pipePath), true);

  const client = new LocalApprovalClient({ stateBaseRoot, processCreationTime, timeoutMs: 10_000 });
  const [firstList, secondList] = await Promise.all([
    client.list(first.serverId),
    client.list(second.serverId)
  ]);
  assert.deepEqual(firstList.approvals.map((entry) => entry.approvalId), [first.requested.approvalId]);
  assert.deepEqual(secondList.approvals.map((entry) => entry.approvalId), [second.requested.approvalId]);

  const approved = await client.approve(first.serverId, first.requested.approvalId);
  const denied = await client.deny(second.serverId, second.requested.approvalId);
  assert.equal(approved.code, "APPROVAL_GRANTED");
  assert.equal(approved.changed, true);
  assert.equal(denied.code, "APPROVAL_DENIED");
  assert.equal(denied.changed, true);
  assert.equal(first.approvals.get(first.requested.approvalId).state, "granted");
  assert.equal(second.approvals.get(second.requested.approvalId).state, "denied");
  assert.equal(first.grants.size(), 1);
  assert.equal(second.grants.size(), 0);

  await assert.rejects(client.list("latest"), /invalid/i);
  await assert.rejects(client.list("0".repeat(32)), (error) => error?.code === "ENOENT");
});

test("production and diagnostic local-control startup allow bounded fresh compile latency", async () => {
  const [source, spike] = await Promise.all([
    fsp.readFile(new URL("../src/control/windowsLocalControl.ts", import.meta.url), "utf8"),
    fsp.readFile(new URL("../scripts/windows-local-control-spike.mjs", import.meta.url), "utf8")
  ]);
  assert.match(source, /const DEFAULT_WINDOWS_LOCAL_CONTROL_STARTUP_TIMEOUT_MS = 60_000;/);
  assert.match(source, /options\.startupTimeoutMs \?\? DEFAULT_WINDOWS_LOCAL_CONTROL_STARTUP_TIMEOUT_MS/);
  assert.match(spike, /const DEFAULT_WINDOWS_LOCAL_CONTROL_SPIKE_STARTUP_TIMEOUT_MS = 60_000;/);
  assert.match(spike, /CONTROL_READY_TIMEOUT"\)\), DEFAULT_WINDOWS_LOCAL_CONTROL_SPIKE_STARTUP_TIMEOUT_MS/);
});

windowsOnly("packaged production C# is byte-identical to the Gate-A0-proven pipe factory", async () => {
  const [manifestText, productionCSharp, gateCSharp, productionPowerShell] = await Promise.all([
    fsp.readFile(new URL("../scripts/windows-local-control-manifest.json", import.meta.url), "utf8"),
    fsp.readFile(new URL("../scripts/windows-local-control.cs", import.meta.url)),
    fsp.readFile(new URL("../scripts/windows-local-control-spike.cs", import.meta.url)),
    fsp.readFile(new URL("../scripts/windows-local-control.ps1", import.meta.url), "utf8")
  ]);
  const manifest = JSON.parse(manifestText);
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  assert.equal(productionCSharp.equals(gateCSharp), true);
  assert.equal(digest(productionCSharp), manifest.productionCSharpSha256);
  assert.equal(digest(gateCSharp), manifest.gateA0CSharpSha256);
  assert.equal(digest(Buffer.from(productionPowerShell)), manifest.productionPowerShellSha256);
  assert.match(productionPowerShell, /windows-local-control\.cs/);
  assert.match(productionCSharp.toString("utf8"), /PIPE_REJECT_REMOTE_CLIENTS/);
  assert.match(productionCSharp.toString("utf8"), /ImpersonateNamedPipeClient/);
  assert.match(productionCSharp.toString("utf8"), /TokenIntegrityLevel/);
  assert.match(productionCSharp.toString("utf8"), /TokenIsAppContainer/);
  assert.match(productionCSharp.toString("utf8"), /CONTROL_OWNED_JOB_CLIENT/);
});
