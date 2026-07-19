import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createChangedTask, withTaskWorktreeFixture } from "../fixtures/task-worktree-v4-helper.mjs";
import { installPolicyKernel } from "../dist/policy/integration.js";
import { RunCommandRuntimeV3 } from "../dist/process/runCommand.js";
import { runCommandInputV4Schema } from "../dist/tools/schemas/execution.js";

const fullAccessProfile = Object.freeze({
  ambientFilesystem: true,
  ambientCredentials: true,
  ambientRegistry: true,
  unrestrictedNetwork: true,
  requireBlockedPathEnforcement: false,
  requireCredentialIsolation: false,
  requireRegistryIsolation: false,
  requireDeviceIsolation: false,
  requireNetworkEnforcement: false,
  requireSandbox: false
});

test("an audited V4 command on the exact candidate issues a one-use receipt accepted by merge", async () => {
  await withTaskWorktreeFixture(async (fixture) => {
    const created = await createChangedTask(fixture);
    const prepared = await fixture.service.merge({
      action: "prepare",
      workspace: fixture.workspace,
      guard: fixture.guard,
      taskWorktreeId: created.task.task_worktree_id,
      authorization: fixture.authorization
    });
    const executable = process.execPath;
    const runtime = new RunCommandRuntimeV3({
      config: {
        executionProfile: "full_access",
        defaultRoot: fixture.workspace.root,
        toolContractVersion: 4
      },
      fullAccessProfile,
      hostRuntime: {
        get: async () => ({
          request: async () => ({
            body: {
              ok: true,
              exitCode: 0,
              timedOut: false,
              stdoutBase64: Buffer.from("candidate checks passed\n", "utf8").toString("base64"),
              stderrBase64: ""
            }
          })
        })
      },
      contextFingerprint: () => "execution-context-v4",
      policyRevision: () => "policy-test",
      evidenceRevision: () => "evidence-test",
      backendResolver: () => ({
        schemaVersion: 1,
        backendId: "test-backend",
        backendVersion: "v1",
        kind: "argv",
        source: "reviewed_explicit",
        path: executable,
        realPath: executable,
        sha256: "a".repeat(64),
        identity: `sha256:${"a".repeat(64)}:dev:1:ino:1`
      }),
      cwdIdentity: () => `sha256:${"b".repeat(64)}`
    });
    runtime.setCandidateVerificationWorkspace(fixture.candidateWorkspaces);
    const args = {
      command: { kind: "argv", executable, args: ["--version"] },
      cwd: { kind: "workspace" },
      mode: "full_access",
      timeout_ms: 5_000,
      verification: {
        merge_plan_id: prepared.merge_plan_id,
        integration_workspace_id: prepared.integration_workspace_id,
        category: prepared.required_check_categories[0]
      }
    };
    assert.doesNotThrow(() => runtime.describe("run_command", args));
    const terminalAudits = [];
    const server = {
      _registeredTools: {
        run_command: {
          inputSchema: runCommandInputV4Schema,
          handler: async (input) => ({
            structuredContent: await runtime.runCommand(input),
            content: [{ type: "text", text: "Command completed." }]
          })
        }
      }
    };
    installPolicyKernel(server, {
      mode: "enforce",
      authorize(_toolName, input) {
        const described = runtime.describe("run_command", input);
        return {
          decision: {
            schemaVersion: 1,
            decisionId: "decision-verification-command",
            outcome: "allow",
            reasonCode: null,
            policyRevision: "policy-test",
            resourceFingerprint: described.resource.resourceFingerprint,
            requiredApproval: null,
            requiredEnforcement: [],
            provenance: []
          },
          auditEvent: null,
          auditContext: {
            authorizationEvent: {},
            requirement: "required",
            riskClass: "R3",
            mutating: false
          }
        };
      },
      audit() {},
      persistAuthorization() {},
      persistExecution(_context, execution) {
        terminalAudits.push(execution);
        return {
          eventId: `event_${"c".repeat(32)}`,
          timestamp: new Date().toISOString()
        };
      }
    });
    try {
      const checked = await server._registeredTools.run_command.handler(args);
      assert.notEqual(checked.isError, true, JSON.stringify(checked));
      assert.equal(terminalAudits.length, 1);
      assert.equal(terminalAudits[0].exitCode, 0);
      const receipt = checked.structuredContent.data.verification_receipt;
      assert.match(receipt, /^verify_[A-Za-z0-9_-]+$/u);
      const executed = await fixture.service.merge({
        action: "execute",
        workspace: fixture.workspace,
        guard: fixture.guard,
        taskWorktreeId: created.task.task_worktree_id,
        mergePlanId: prepared.merge_plan_id,
        verificationReceipts: [receipt],
        authorization: fixture.authorization
      });
      assert.equal(executed.integrated, true);
      assert.throws(
        () => fixture.verificationReceipts.verify(receipt, {}),
        /VERIFICATION_RECEIPT_INVALID/
      );
    } finally {
      runtime.close();
    }
  });
});

test("candidate verification failure publishes no unreachable terminal record", async () => {
  const processId = `process_${"d".repeat(32)}`;
  const executable = process.execPath;
  const runtime = new RunCommandRuntimeV3({
    config: {
      executionProfile: "full_access",
      defaultRoot: path.resolve("."),
      toolContractVersion: 4
    },
    fullAccessProfile,
    hostRuntime: {
      get: async () => ({
        request: async () => ({
          body: {
            ok: true,
            exitCode: 0,
            timedOut: false,
            stdoutBase64: Buffer.from("verification became dirty\n", "utf8").toString("base64"),
            stderrBase64: ""
          }
        })
      })
    },
    contextFingerprint: () => "execution-context-v4",
    policyRevision: () => "policy-test",
    evidenceRevision: () => "evidence-test",
    processId: () => processId,
    backendResolver: () => ({
      schemaVersion: 1,
      backendId: "test-backend",
      backendVersion: "v1",
      kind: "argv",
      source: "reviewed_explicit",
      path: executable,
      realPath: executable,
      sha256: "a".repeat(64),
      identity: `sha256:${"a".repeat(64)}:dev:1:ino:1`
    }),
    cwdIdentity: () => `sha256:${"b".repeat(64)}`
  });
  runtime.setCandidateVerificationWorkspace({
    describeExecution() {
      return {
        cwd: path.resolve("."),
        request: { category: "unit" },
        record: {
          mergePlanId: `merge_${"1".repeat(32)}`,
          integrationWorkspaceId: `ws_${"2".repeat(32)}`,
          taskWorktreeId: `task_${"3".repeat(32)}`,
          taskGeneration: 1,
          repositoryId: `repo_${"4".repeat(32)}`,
          candidateOid: "5".repeat(40),
          candidateTreeOid: "6".repeat(40),
          manifestDigest: "7".repeat(64),
          rootIdentity: "8".repeat(64)
        }
      };
    },
    async beginExecution() {
      return { clean: true };
    },
    async completeExecution() {
      throw new Error("MERGE_CHECKS_REQUIRED");
    }
  });
  try {
    await assert.rejects(() => runtime.runCommand({
      command: { kind: "argv", executable, args: ["--version"] },
      cwd: { kind: "workspace" },
      mode: "full_access",
      timeout_ms: 5_000,
      verification: {
        merge_plan_id: `merge_${"1".repeat(32)}`,
        integration_workspace_id: `ws_${"2".repeat(32)}`,
        category: "unit"
      }
    }), /MERGE_CHECKS_REQUIRED/);
    assert.throws(
      () => runtime.readProcessOutput({ process_id: processId }),
      /PROCESS_NOT_FOUND/
    );
  } finally {
    runtime.close();
  }
});
