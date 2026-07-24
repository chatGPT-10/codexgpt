import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
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
const { createAuthorizationFactsV3, semanticDigest } = await tsImport("../src/policy/authorizationFacts.ts", import.meta.url);

const windowsOnly = process.platform === "win32" ? test : test.skip;
const secretMarker = "SYNTHETIC_CLI_ENV_SECRET";
const fingerprint = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function facts(serverId, suffix) {
  return createAuthorizationFactsV3({
    serverId,
    credentialRef: "cred_aaaaaaaaaaaaaaaa",
    credentialRevision: "credential-revision-1",
    transportKind: "http",
    transportSessionId: "session-cli",
    identityKind: "authenticated_subject",
    identitySubject: "subject-cli",
    workspaceId: "workspace-cli",
    leaseId: "lease-cli",
    policyRevision: "policy-cli",
    evidenceRevision: "evidence-cli",
    toolContractVersion: "3",
    toolName: "run_command",
    canonicalAction: "process.run_command",
    operation: "process.execute",
    resourceFingerprint: fingerprint(`resource:${suffix}`),
    inputDigest: fingerprint(`input:${suffix}`),
    semanticFactsDigest: semanticDigest({ argv: ["node", `${suffix}.mjs`] }),
    riskClass: "R3"
  });
}

function summary(suffix) {
  return {
    backend: "windows-native-pipe",
    actionKind: "process.execute",
    argumentCount: 2,
    logicalScope: "workspace-cli",
    identityLabel: "subject-cli",
    authoritySummary: "ambient current-user authority; ask first",
    digestPrefix: createHash("sha256").update(suffix).digest("hex").slice(0, 16),
    revealArguments: ["node", `unsafe\n\u001b[31m${suffix}`]
  };
}

windowsOnly("public CLI requires exact server routing and safely lists, watches, approves, denies, and controls processes", async (t) => {
  const localAppData = await fsp.mkdtemp(path.join(os.tmpdir(), "codexgpt-cli-control-"));
  const stateBaseRoot = path.join(localAppData, "CodexGPT", "state", "v1");
  const serverId = localControlServerId();
  const approvals = new PendingApprovalStore();
  const grants = new SessionGrantStore();
  const first = (await approvals.request({ facts: facts(serverId, "first"), summary: summary("first") })).approval;
  const second = (await approvals.request({ facts: facts(serverId, "second"), summary: summary("second") })).approval;
  const processes = new Map([["process-owned-1", { processId: "process-owned-1", state: "running", summary: "owned process" }]]);
  const server = new LocalApprovalServer({
    serverId,
    approvals,
    grants,
    processes: {
      list: () => [...processes.values()],
      terminate: (processId) => processes.delete(processId)
    }
  });
  const runtime = await WindowsLocalControlRuntime.start({ server, stateBaseRoot });
  t.after(async () => {
    await runtime.close().catch(() => {});
    await fsp.rm(localAppData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const entry = path.resolve("scripts", "codexgpt-entry.mjs");
  const environment = {
    ...process.env,
    LOCALAPPDATA: localAppData,
    SYNTHETIC_SECRET: secretMarker
  };
  const run = async (args) => await execFileAsync(process.execPath, [entry, ...args], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    timeout: 20_000,
    windowsHide: true,
    maxBuffer: 128 * 1024
  });

  const listed = await run(["approvals", "list", "--server", serverId]);
  assert.match(listed.stdout, /process\.execute/);
  assert.match(listed.stdout, /Risk: R3/);
  assert.equal(listed.stdout.includes("unsafe"), false);
  assert.equal(listed.stdout.includes(secretMarker), false);

  const revealed = await run(["approvals", "list", "--server", serverId, "--reveal"]);
  assert.match(revealed.stdout, /Arg 1: node/);
  assert.match(revealed.stdout, /\\u\{000A\}/);
  assert.match(revealed.stdout, /\\u\{001B\}/);
  assert.equal(revealed.stdout.includes("\u001b"), false);
  assert.equal(revealed.stdout.includes(secretMarker), false);

  await assert.rejects(run(["approvals", "list"]), (error) => {
    assert.match(error.stderr, /--server/);
    assert.match(error.stderr, /latest/);
    return true;
  });
  await assert.rejects(run(["approvals", "approve", "--server", serverId]), (error) => {
    assert.match(error.stderr, /approval_id/);
    return true;
  });

  const approved = await run(["approvals", "approve", first.approvalId, "--server", serverId]);
  assert.match(approved.stdout, /APPROVAL_GRANTED/);
  assert.equal(approvals.get(first.approvalId).state, "granted");
  assert.equal(grants.size(), 1);
  await run(["approvals", "approve", first.approvalId, "--server", serverId]);
  assert.equal(grants.size(), 1, "repeated approve must not issue a second grant");

  const denied = await run(["approvals", "deny", second.approvalId, "--server", serverId]);
  assert.match(denied.stdout, /APPROVAL_DENIED/);
  assert.equal(approvals.get(second.approvalId).state, "denied");
  const watched = await run(["approvals", "watch", "--server", serverId, "--once", "--timeout-ms", "25"]);
  assert.match(watched.stdout, /Approval:/);

  const processList = await run(["processes", "list", "--server", serverId]);
  assert.match(processList.stdout, /process-owned-1/);
  const terminated = await run(["processes", "terminate", "process-owned-1", "--server", serverId]);
  assert.match(terminated.stdout, /PROCESS_TERMINATED/);
  assert.equal(processes.size, 0);
});
