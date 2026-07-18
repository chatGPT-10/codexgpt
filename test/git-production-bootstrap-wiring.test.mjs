import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { createStdioPolicySessionSource } from "../dist/policy/identity.js";
import { policyIdentityScopes } from "../dist/policy/runtime.js";
import { SessionGrantStore } from "../dist/policy/approval.js";
import { bindGitExecutable, createGitCapabilityEvidence } from "../dist/git/capabilities.js";
import { admitManagedWorktreeRoot } from "../dist/worktrees/root.js";
import {
  connectProductionCodexProServer,
  createProductionCodexProServer
} from "../dist/productionRuntime.js";
import { CONTRACT_V4_ADDITIONS } from "../dist/tools/contracts/index.js";

function withEnv(changes, action) {
  const previous = new Map(Object.keys(changes).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return action();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("supported production composition installs the probed V4 Git service before transport connect", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-git-production-"));
  const workspace = path.join(root, "workspace");
  const home = path.join(root, "home");
  const managedPath = path.join(root, "managed");
  await fs.mkdir(workspace);
  await fs.mkdir(managedPath);
  const managedRoot = await admitManagedWorktreeRoot({
    root: managedPath,
    protectedRoots: [workspace, home],
    create: false
  });
  const binding = await bindGitExecutable(process.execPath);
  const capability = createGitCapabilityEvidence({
    executable: binding,
    version: "git version 2.50.0",
    hostManifestRevision: "1".repeat(64),
    implementationRevision: "2".repeat(64)
  });
  const executor = {
    capability,
    capabilityRevision: capability.capabilityRevision,
    async run() {
      return {
        status: 1,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        stdoutTruncated: false,
        stderrTruncated: false,
        timedOut: false
      };
    }
  };
  let disposed = false;
  const localApprovalRuntimeV3 = {
    serverId: `server_${"3".repeat(32)}`,
    grants: new SessionGrantStore(),
    setApprovalPreparation() {},
    setProcessControl() {},
    async close() {},
    async reserveMatching() { return null; },
    async request() { throw new Error("not used"); },
    async burn() {},
    async commitConsume() {}
  };
  try {
    const config = withEnv({
      CODEXPRO_HOME: home,
      CODEXPRO_TOOL_CONTRACT_VERSION: "4",
      CODEXPRO_FILE_TRANSACTIONS: "atomic",
      CODEXPRO_AUDIT_MODE: "required",
      CODEXPRO_POLICY_ENGINE: "enforce",
      CODEXPRO_GIT_MODE: "local",
      CODEXPRO_TASK_WORKTREE_ROOT: managedPath
    }, () => loadConfig([
      "--root", workspace,
      "--allow-root", workspace,
      "--bash", "off",
      "--write", "off",
      "--tool-mode", "full"
    ]));
    const source = createStdioPolicySessionSource({
      sessionId: "git-production-bootstrap",
      scopes: policyIdentityScopes(config)
    });
    const server = createProductionCodexProServer(config, {
      stateRootOptions: { env: { ...process.env, CODEXPRO_HOME: home } },
      policySessionContextSource: source,
      localApprovalRuntimeV3,
      gitBootstrapV4: {
        executor,
        managedRoot,
        async dispose() { disposed = true; }
      }
    });
    const client = new Client({ name: "git-production-bootstrap-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      connectProductionCodexProServer(server, serverTransport),
      client.connect(clientTransport)
    ]);
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    assert.deepEqual(
      CONTRACT_V4_ADDITIONS.filter((name) => !names.has(name)),
      []
    );
    await Promise.allSettled([client.close(), server.close()]);
    assert.equal(disposed, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
