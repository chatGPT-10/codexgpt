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
    "--tool-mode", "standard"
  ]));
}

function allowRuntime() {
  let sequence = 0;
  return {
    mode: "enforce",
    authorize(toolName) {
      sequence += 1;
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
        outcome: "allow",
        reasonCode: null,
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
          outcome: "allow",
          reasonCode: null,
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
  const policyRuntime = allowRuntime();
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
    semanticManagerV5: semanticManager
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
