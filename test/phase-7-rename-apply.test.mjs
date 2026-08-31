import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChangeSetStore } from "../dist/changesets/index.js";
import { loadConfig } from "../dist/config.js";
import { PathGuard } from "../dist/guard.js";
import { WorkspaceMutationRuntime } from "../dist/mutations/index.js";
import { createCodexGPTServer } from "../dist/server.js";
import {
  readSemanticSourceSnapshot,
  SemanticPreviewStore
} from "../dist/semantic/index.js";
import {
  AtomicTransactionEngine,
  installationMasterKey,
  loadOrCreateInstallationState,
  ProcessInstanceRegistry
} from "../dist/transactions/index.js";

function withEnv(changes, action) {
  const previous = new Map();
  for (const [name, value] of Object.entries(changes)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return action();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function configFor(root) {
  return withEnv({
    CODEXGPT_SEMANTIC_MODE: "standard",
    CODEXGPT_ALLOWED_ROOTS: root,
    CODEXGPT_FILE_TRANSACTIONS: "atomic",
    CODEXGPT_AUDIT_MODE: "required",
    CODEXGPT_POLICY_ENGINE: "enforce"
  }, () => loadConfig([
    "--root", root,
    "--bash", "off",
    "--write", "workspace",
    "--tool-mode", "full"
  ]));
}

function allowRuntime(deniedTools = new Set()) {
  let sequence = 0;
  return {
    mode: "enforce",
    authorize(toolName) {
      sequence += 1;
      const denied = deniedTools.has(toolName);
      const eventId = `event_${sequence.toString(16).padStart(32, "0")}`;
      const authorizationEvent = {
        schemaVersion: 2,
        eventId,
        eventType: "authorization",
        timestamp: "2026-07-23T00:00:00.000Z",
        requestId: null,
        authorizationEventId: null,
        decisionId: `decision-${sequence}`,
        credentialRef: null,
        transportSessionId: "session-semantic-apply",
        toolName,
        canonicalAction: toolName,
        workspaceId: null,
        workspaceRef: null,
        policyRevision: "policy-semantic-apply",
        resourceSummary: "phase7 semantic apply fixture",
        resourceFingerprint: "a".repeat(64),
        outcome: denied ? "deny" : "allow",
        reasonCode: denied ? "POLICY_DENIED" : null,
        safeRuleIds: [],
        approvalState: "not_required",
        grantId: null,
        sandboxBackend: "brokered",
        riskClass: toolName === "apply_patch" ? "R2" : "R0"
      };
      return {
        decision: {
          schemaVersion: 1,
          decisionId: `decision-${sequence}`,
          outcome: denied ? "deny" : "allow",
          reasonCode: denied ? "POLICY_DENIED" : null,
          policyRevision: "policy-semantic-apply",
          resourceFingerprint: `sha256:${"a".repeat(64)}`,
          requiredApproval: null,
          requiredEnforcement: [],
          provenance: []
        },
        auditEvent: null,
        auditContext: {
          authorizationEvent,
          requirement: "required",
          riskClass: authorizationEvent.riskClass,
          mutating: toolName === "apply_patch"
        }
      };
    },
    audit() {},
    persistAuthorization() {},
    persistExecution() {}
  };
}

test("registered V5 semantic preview applies atomically once and publishes a change set", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-semantic-apply-")));
  const stateRoot = path.join(root, "state");
  const workspaceRoot = path.join(root, "workspace");
  await fs.mkdir(workspaceRoot);
  await fs.writeFile(path.join(workspaceRoot, "value.ts"), "export const value = 1;\n");
  await fs.writeFile(path.join(workspaceRoot, "package.json"), JSON.stringify({
    name: "workflow-fixture",
    private: true,
    scripts: { test: "node --test" }
  }));
  const config = configFor(workspaceRoot);
  const guard = new PathGuard(config);
  const registry = new ProcessInstanceRegistry(stateRoot);
  const engine = new AtomicTransactionEngine(config, guard, stateRoot, registry);
  const store = new ChangeSetStore({
    stateRoot,
    masterKey: installationMasterKey(loadOrCreateInstallationState({ stateRoot }))
  });
  const mutationRuntime = new WorkspaceMutationRuntime({ engine, changeSetStore: store });
  const previews = new SemanticPreviewStore();
  const semanticManager = {
    previews,
    async execute(workspace, request) {
      const read = await readSemanticSourceSnapshot({
        root: workspace.root,
        relativePath: "value.ts",
        maxBytes: config.maxReadBytes,
        blockedGlobs: config.blockedGlobs
      });
      assert.equal(read.ok, true);
      const before = read.snapshot.utf8Text;
      const start = before.indexOf("value");
      const after = `${before.slice(0, start)}renamed${before.slice(start + 5)}`;
      return {
        requested_provider: "builtin",
        actual_provider: "builtin-typescript",
        state: "ready",
        capability: request.operation,
        language: "typescript",
        partial: false,
        omitted_count: 0,
        returned_count: 1,
        result_quality: "semantic",
        next_action: "Apply the opaque preview exactly once.",
        result: previews.create({
          workspaceId: workspace.id,
          workspaceBindingDigest: `sha256:${"8".repeat(64)}`,
          workspaceAuthorityDigest: `sha256:${"7".repeat(64)}`,
          providerGeneration: 1,
          providerFacts: { provider: "builtin-typescript", engineVersion: "5.9.3" },
          oldName: "value",
          newName: "renamed",
          files: [{
            snapshot: read.snapshot,
            edits: [{ path: "value.ts", start, length: 5, newText: "renamed" }],
            resultingText: after,
            resultingSha256: createHash("sha256").update(after, "utf8").digest("hex")
          }]
        }, 4_000)
      };
    },
    resolvePreview(id, workspaceId) {
      return previews.resolve(id, workspaceId);
    },
    reservePreview(id, invocationId, workspaceId) {
      const resolved = previews.resolve(id, workspaceId);
      return { ...resolved, plan: previews.reserve(id, invocationId, workspaceId) };
    },
    assertReservation(id, invocationId, workspaceId) {
      return previews.assertReserved(id, invocationId, workspaceId);
    },
    invalidateWorkspace(workspaceId) {
      previews.invalidateWorkspace(workspaceId);
    },
    runtimeStatus() {
      return {
        configuredProvider: "builtin",
        actualProvider: "builtin-typescript",
        state: "ready",
        resultQuality: "semantic",
        engineVersion: "5.9.3",
        nextAction: "No setup is required.",
        budgets: {},
        retryAfterMs: 0
      };
    },
    async dispose() {}
  };
  const deniedTools = new Set();
  const policyRuntime = allowRuntime(deniedTools);
  const verificationCalls = [];
  const server = createCodexGPTServer(config, {
    workspaceMutationRuntime: mutationRuntime,
    changeSetOwnerBindingKey: Buffer.alloc(32, 5),
    atomicMutationToolNames: new Set([
      "apply_patch",
      "codexgpt_self_test",
      "edit",
      "export_pro_context",
      "handoff_to_agent",
      "handoff_to_codex",
      "write"
    ]),
    persistentAuditRuntime: policyRuntime,
    policyRuntime,
    policySessionContextSource: {
      identity: { credentialRef: null, scopes: ["filesystem:write"] },
      transportKind: "stdio",
      transportSessionId: () => "session-semantic-apply"
    },
    movePathsService: {},
    undoChangeSetService: {},
    v4ContractCapabilities: {
      nativeHostIdentityAvailable: true,
      localApprovalAvailable: true,
      gitCapabilityAvailable: true,
      contractV4MigrationAvailable: true
    },
    semanticManagerV5: semanticManager,
    showChangesStatusProvider: async () => " M value.ts",
    showChangesDiffProvider: async () => "diff --git a/value.ts b/value.ts\n--- a/value.ts\n+++ b/value.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const renamed = 1;",
    v3ToolHandlers: {
      run_command(args) {
        verificationCalls.push(args);
        return {
          content: [{ type: "text", text: "tests passed" }],
          structuredContent: {
            codexgpt_tool: "run_command",
            codexgpt_title: "Run Command",
            ok: true,
            data: {
              process_id: `process_${"1".repeat(32)}`,
              status: "exited",
              exit_code: 0,
              termination_reason: null,
              backend: {
                backend_id: "workflow-test",
                command_kind: "powershell",
                executable_identity: "2".repeat(64),
                terminal: "pipes"
              },
              authority: {
                mode: "full_access",
                workspace_boundary_enforced: false,
                filesystem_scope: "current_user_unrestricted",
                filesystem_isolation: "none",
                credential_isolation: "none",
                registry_isolation: "none",
                network_isolation: "none",
                process_tree_control: "job_object_members_only",
                broker_escape_resistance: "none",
                host_writeback: "possible",
                redaction: "best_effort_known_patterns"
              },
              output: {
                chunks: [{ stream: "stdout", text: "tests passed\n", bytes: 13 }],
                next_cursor: null,
                truncated: false,
                eof: true,
                returned_bytes: 13
              },
              started_at: "2026-08-31T00:00:00.000Z",
              ended_at: "2026-08-31T00:00:01.000Z",
              verification_receipt: null
            },
            error: null,
            meta: { schemaVersion: 1, durationMs: 1, warnings: [] }
          }
        };
      }
    }
  });
  try {
    const preview = await server._registeredTools.semantic.handler({
      operation: "rename_preview",
      locator: { kind: "position", path: "value.ts", line: 1, column: 14 },
      new_name: "renamed"
    });
    assert.equal(preview.structuredContent.ok, true);
    const previewId = preview.structuredContent.data.result.preview_id;
    const applied = await server._registeredTools.apply_patch.handler({ semantic_preview_id: previewId });
    assert.equal(applied.structuredContent.ok, true);
    const workflow = applied.structuredContent.data.workflow;
    assert.equal(workflow.stage, "applied");
    assert.equal(workflow.verification.auto_run, false);
    assert.deepEqual(workflow.verification.recommended.map((item) => item.check), ["test"]);
    assert.deepEqual(workflow.review.inspection_checklist, [
      "unexpected_files",
      "formatting",
      "generated_artifacts",
      "dependency_changes",
      "accidental_deletion"
    ]);
    assert.equal(verificationCalls.length, 0);
    const changeSetId = applied.structuredContent.data.transaction.change_set_id;

    deniedTools.add("run_command");
    const denied = await server._registeredTools.codexgpt.handler({
      action: "verify_change",
      args: {
        workspace_id: applied.structuredContent.data.workspace_id,
        change_set_id: changeSetId,
        checks: ["test"]
      }
    });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent, undefined);
    assert.match(denied.content[0].text, /refused|denied|policy/iu);
    assert.equal(verificationCalls.length, 0);
    deniedTools.delete("run_command");

    const verified = await server._registeredTools.codexgpt.handler({
      action: "verify_change",
      args: {
        workspace_id: applied.structuredContent.data.workspace_id,
        change_set_id: changeSetId,
        checks: ["test"]
      }
    });
    assert.equal(verified.structuredContent.ok, true);
    assert.equal(verified.structuredContent.codexgpt_super_action, "verify_change");
    assert.equal(verified.structuredContent.data.workflow.stage, "verified");
    assert.equal(verified.structuredContent.data.workflow.ready, false);
    assert.equal(verificationCalls.length, 1);
    assert.deepEqual(verificationCalls[0].command, {
      kind: "powershell",
      script: "& npm run test\nexit $LASTEXITCODE",
      edition: "auto"
    });

    const reviewed = await server._registeredTools.show_changes.handler({
      workspace_id: applied.structuredContent.data.workspace_id,
      change_set_id: changeSetId,
      include_diff: true,
      mark_reviewed: true,
      since: "workspace"
    });
    assert.equal(reviewed.structuredContent.ok, true);
    assert.equal(reviewed.structuredContent.data.workflow.complete, true);
    assert.equal(reviewed.structuredContent.data.workflow.ready, true);
    const unlinked = await server._registeredTools.show_changes.handler({
      workspace_id: applied.structuredContent.data.workspace_id,
      change_set_id: `cs_${"f".repeat(32)}`,
      include_diff: true,
      mark_reviewed: true,
      since: "workspace"
    });
    assert.equal(unlinked.structuredContent.ok, true);
    assert.equal("workflow" in unlinked.structuredContent.data, false);
    assert.match(unlinked.content[0].text, /workflow could not be linked or updated/u);
    assert.match(await fs.readFile(path.join(workspaceRoot, "value.ts"), "utf8"), /renamed/);
    assert.equal(store.list(engine.workspaceStateKey(workspaceRoot)).length, 1);
    const replay = await server._registeredTools.apply_patch.handler({ semantic_preview_id: previewId });
    assert.equal(replay.isError, true);
  } finally {
    await server.close();
    store.dispose();
    registry.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
});
