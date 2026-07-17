import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const access = await tsImport("../fixtures/ts-imports/full-access-imports.ts", import.meta.url);
const { RootAdmissionCoordinator, RootAdmissionRuntimeV3, createStatFreeRootAdmissionRequest } = access;

const binding = Object.freeze({
  serverId: "server-test",
  credentialRef: "credential-query",
  credentialRevision: "credential-revision-1",
  transportKind: "streamable-http",
  transportSessionId: "transport-test",
  identityKind: "query-token",
  identitySubject: null,
  policyRevision: "policy-1",
  contractVersion: 3,
  evidenceRevision: "evidence-1"
});

test("first confirmed-root request is stat-free and returns no existence signal", () => {
  let probes = 0;
  const request = createStatFreeRootAdmissionRequest({
    root: "Z:\\not-present\\.ssh",
    access: "read_only",
    leaseMs: 60_000,
    binding,
    onFilesystemProbe: () => { probes += 1; }
  });
  assert.equal(probes, 0);
  assert.deepEqual(Object.keys(request.publicRequest).sort(), [
    "access", "bindingFingerprint", "leaseMs", "requestFingerprint", "schemaVersion"
  ]);
  assert.doesNotMatch(JSON.stringify(request.publicRequest), /not-present|\.ssh|Z:/i);
});

test("local approval binds stable root identity and retry revalidates before handle creation", async () => {
  let current = {
    canonicalRoot: "C:\\Users\\Noah\\Documents",
    comparisonKey: "c:\\users\\noah\\documents",
    volumeSerial: "volume-7",
    directoryId: "directory-9",
    reparsePoint: false,
    mappedDrive: false
  };
  let randomCalls = 0;
  const coordinator = new RootAdmissionCoordinator({
    identityOracle: { inspectRoot: async () => ({ ...current }) },
    now: () => 1_000,
    randomBytes: (size) => { randomCalls += 1; return Buffer.alloc(size, randomCalls); }
  });
  const request = coordinator.request({
    root: "C:\\Users\\Noah\\Documents",
    access: "read_write",
    leaseMs: 120_000,
    binding
  });
  const approval = await coordinator.prepareLocalApproval(request.localRequest);
  assert.equal(approval.rootIdentity.volumeSerial, "volume-7");
  assert.equal(approval.binding.credentialRef, "credential-query");
  assert.doesNotMatch(JSON.stringify(approval), /token=/i);

  current = { ...current, directoryId: "replacement" };
  await assert.rejects(
    coordinator.consumeApproval({ approvalId: approval.approvalId, binding }),
    /stale/i
  );
  assert.equal(randomCalls, 0);

  current = { ...current, directoryId: "directory-9" };
  const admitted = await coordinator.consumeApproval({ approvalId: approval.approvalId, binding });
  assert.match(admitted.workspace.id, /^ws_[a-f0-9]{32}$/);
  assert.equal(randomCalls, 2);
  await assert.rejects(
    coordinator.consumeApproval({ approvalId: approval.approvalId, binding }),
    /consumed/i
  );
});

test("V3 root runtime keeps policy resolution stat-free and opens only a locally prepared request", async () => {
  let probes = 0;
  const runtime = new RootAdmissionRuntimeV3({
    identityOracle: {
      inspectRoot: async () => {
        probes += 1;
        return {
          canonicalRoot: "C:\\Data",
          comparisonKey: "c:\\data",
          volumeSerial: "volume-1",
          directoryId: "directory-1",
          reparsePoint: false,
          mappedDrive: false
        };
      }
    },
    currentBinding: () => binding,
    randomBytes: (size) => Buffer.alloc(size, 9),
    now: () => 5_000
  });
  const args = { root: "C:\\Data", access: "read_only", lease_ms: 60_000 };
  const described = runtime.describe("open_full_access_workspace", args);
  assert.equal(probes, 0);
  assert.equal(described.riskClass, "R3");
  assert.deepEqual(described.requiredScopes, ["workspace:full-access"]);

  runtime.registerPendingApproval("approval_external", args, binding);
  const approvalRecord = {
    facts: { toolName: "open_full_access_workspace" },
    approvalId: "approval_external",
    summary: {
      backend: "node",
      actionKind: "process.inspect",
      argumentCount: 2,
      logicalScope: "server",
      identityLabel: "query-token",
      authoritySummary: "local decision required",
      digestPrefix: "12345678",
      revealArguments: []
    }
  };
  await runtime.prepareApproval(approvalRecord);
  assert.equal(probes, 1);
  const display = runtime.approvalDisplay(approvalRecord);
  assert.equal(display.logicalScope, "C:\\Data");
  assert.match(display.authoritySummary, /read-only.*not a process sandbox/i);
  const opened = await runtime.open(args);
  assert.equal(probes, 2);
  assert.equal(opened.access_class, "confirmed_root");
  assert.equal(opened.access, "read_only");
  await assert.rejects(runtime.open(args), /stale|unavailable/i);
});
