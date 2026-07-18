import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

import { runGitCapabilityProbe } from "../scripts/git-capability-spike.mjs";

const { WindowsProcessHostClient } = await tsImport("../fixtures/ts-imports/process-host-imports.ts", import.meta.url);
const windowsOnly = process.platform === "win32" ? test : test.skip;

windowsOnly("Gate G0 proves the exact Git executable and safe native-host capsule", async (t) => {
  const host = await WindowsProcessHostClient.start({ scriptsRoot: path.resolve("scripts") });
  t.after(() => host.close());

  const evidence = await runGitCapabilityProbe({
    host,
    repositoryRoot: path.resolve("."),
    scriptsRoot: path.resolve("scripts"),
    fixturesRoot: path.resolve("fixtures")
  });

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.gate, "G0");
  assert.equal(evidence.status, "passed");
  assert.match(evidence.capabilityRevision, /^[a-f0-9]{64}$/);
  assert.match(evidence.git.sha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.git.identity, /^sha256:[a-f0-9]{64}:dev:\d+:ino:\d+$/);
  assert.match(evidence.git.version, /^git version \d+\.\d+\.\d+/);
  assert.equal(path.basename(evidence.git.path).toLocaleLowerCase("en-US"), "git.exe");
  assert.equal(evidence.git.path.toLocaleLowerCase("en-US").includes("\\git\\cmd\\git.exe"), true);

  assert.deepEqual(evidence.features, {
    objectFormat: "sha1",
    worktreeListPorcelainZ: true,
    statusPorcelainV2: true,
    externalConfigIsolation: true,
    externalDiffAndTextconvDisabled: true,
    rawHashObject: true,
    privateIndex: true,
    commitTree: true,
    expectedOldRefUpdate: true,
    objectOnlyMerge: true,
    mergeConflictStatus: true,
    quarantineRejectedObjectsPromoted: 0
  });
  assert.deepEqual(evidence.canaries, {
    positiveControlExecutions: 1,
    safeModeExecutions: 0
  });
  assert.equal(evidence.host.jobAssignedAtCreation, true);
  assert.equal(evidence.host.exactHandleList, true);
  assert.equal(evidence.host.imageIdentityVerified, true);
  assert.equal(evidence.host.processTreeControl, "job_object_members_only");
  assert.equal(evidence.host.brokerEscapeResistance, "none");
  assert.equal(evidence.executionIsolation, "none");
  assert.equal(evidence.repositoryIntegrations, "disabled");
  assert.equal(evidence.remotePolicy, "deny_all");
  assert.equal(evidence.promptPolicy, "fail_closed");
});
