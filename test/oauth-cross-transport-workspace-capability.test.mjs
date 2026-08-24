import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const registryModule = await tsImport("../src/workspace/capabilityRegistry.ts", import.meta.url);
const guardModule = await tsImport("../src/guard.ts", import.meta.url);
const {
  WorkspaceCapabilityRegistry,
  WorkspaceCapabilityCapacityError,
  oauthWorkspaceCapabilityPrincipalDigest
} = registryModule;
const { WorkspaceManager } = guardModule;

function principal(overrides = {}) {
  return {
    authDomain: "oauth",
    deploymentBindingId: "binding_11111111111111111111111111111111",
    deploymentIncarnationId: "incarnation_11111111111111111111111111111111",
    ownerRef: "owner_ref_a",
    clientRef: "client_ref_a",
    resource: "https://mcp.example.invalid/mcp",
    grantId: "grant_11111111111111111111111111111111",
    grantRevision: 0,
    ...overrides
  };
}

function randomSequence(...hexValues) {
  let index = 0;
  return (size) => {
    assert.equal(size, 16);
    const value = hexValues[index] ?? hexValues.at(-1);
    index += 1;
    return Buffer.from(value, "hex");
  };
}

function incrementingRandomBytes() {
  let counter = 1n;
  return (size) => {
    assert.equal(size, 16);
    const value = Buffer.alloc(16);
    value.writeBigUInt64BE(counter, 8);
    counter += 1n;
    return value;
  };
}

function managerConfig(root) {
  return {
    defaultRoot: root,
    allowedRoots: [root],
    httpSessionTtlMs: 60_000,
    workspaceTtlMs: 60_000,
    blockedGlobs: []
  };
}

function registry(options = {}) {
  let now = 1_700_000_000_000;
  const instance = new WorkspaceCapabilityRegistry({
    ttlMs: 60_000,
    now: () => now,
    randomBytes: randomSequence(
      "11".repeat(16),
      "22".repeat(16),
      "33".repeat(16),
      "44".repeat(16),
      "55".repeat(16)
    ),
    ...options
  });
  return {
    instance,
    now: () => now,
    advance: (milliseconds) => { now += milliseconds; }
  };
}

test("principal digest is stable, domain separated, and changes across OAuth authority fields", () => {
  const base = oauthWorkspaceCapabilityPrincipalDigest(principal());
  assert.match(base, /^sha256:[0-9a-f]{64}$/);
  assert.equal(base, oauthWorkspaceCapabilityPrincipalDigest(principal()));
  for (const override of [
    { deploymentBindingId: "binding_22222222222222222222222222222222" },
    { deploymentIncarnationId: "incarnation_22222222222222222222222222222222" },
    { ownerRef: "owner_ref_b" },
    { clientRef: "client_ref_b" },
    { resource: "https://other.example.invalid/mcp" },
    { grantId: "grant_22222222222222222222222222222222" },
    { grantRevision: 1 }
  ]) {
    assert.notEqual(base, oauthWorkspaceCapabilityPrincipalDigest(principal(override)));
  }
});

test("same principal/root/policy reuses one opaque handle across callers and refreshes TTL", () => {
  const state = registry();
  const p = principal();
  const first = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-a");
  assert.match(first.id, /^ws_[0-9a-f]{32}$/);
  state.advance(40_000);
  const resolved = state.instance.resolve(first.id, p, "policy-a");
  assert.equal(resolved?.id, first.id);
  state.advance(40_000);
  assert.equal(state.instance.resolve(first.id, p, "policy-a")?.id, first.id);
  const repeated = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-a");
  assert.equal(repeated.id, first.id);
});

test("every OAuth capability principal field participates in resolution authority", () => {
  const state = registry();
  const owner = principal();
  const opened = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, owner, "policy-a");
  const variations = [
    { deploymentBindingId: "binding_22222222222222222222222222222222" },
    { deploymentIncarnationId: "incarnation_22222222222222222222222222222222" },
    { ownerRef: "owner_ref_b" },
    { clientRef: "client_ref_b" },
    { resource: "https://other.example.invalid/mcp" },
    { grantId: "grant_22222222222222222222222222222222" },
    { grantRevision: 1 }
  ];
  for (const override of variations) {
    const foreign = principal(override);
    assert.equal(state.instance.resolve(opened.id, foreign, "policy-a"), undefined);
    assert.equal(state.instance.close(opened.id, foreign, "policy-a"), undefined);
  }
  assert.equal(state.instance.resolve(opened.id, owner, "policy-a")?.id, opened.id);
});

test("foreign principal lookup and close are non-destructive and non-touching", () => {
  const state = registry();
  const owner = principal();
  const foreign = principal({ clientRef: "client_ref_b" });
  const opened = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, owner, "policy-a");
  state.advance(30_000);
  assert.equal(state.instance.resolve(opened.id, foreign, "policy-a"), undefined);
  assert.equal(state.instance.close(opened.id, foreign, "policy-a"), undefined);
  state.advance(30_001);
  assert.equal(state.instance.resolve(opened.id, owner, "policy-a"), undefined);
});

test("opening under a new policy revision invalidates stale same-principal capabilities before capacity accounting", () => {
  const state = registry({ maxPerPrincipal: 1, maxActive: 2 });
  const p = principal();
  const first = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-a");
  const second = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-b");
  assert.notEqual(second.id, first.id);
  assert.equal(state.instance.resolve(first.id, p, "policy-b"), undefined);
  assert.equal(state.instance.resolve(second.id, p, "policy-b")?.id, second.id);
});

test("policy mismatch invalidates only the legitimate principal record and close rotates the handle", () => {
  const state = registry();
  const p = principal();
  const first = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-a");
  assert.equal(state.instance.resolve(first.id, p, "policy-b"), undefined);
  const second = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-b");
  assert.notEqual(second.id, first.id);
  const closed = state.instance.close(second.id, p, "policy-b");
  assert.equal(closed?.workspaceId, second.id);
  assert.equal(state.instance.resolve(second.id, p, "policy-b"), undefined);
  const third = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-b");
  assert.notEqual(third.id, second.id);
});

test("close and expiry linearize before later resolves without retroactively invalidating an admitted workspace value", () => {
  const state = registry();
  const p = principal();
  const first = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-a");
  const admitted = state.instance.resolve(first.id, p, "policy-a");
  assert.equal(admitted?.id, first.id);
  assert.equal(state.instance.close(first.id, p, "policy-a")?.workspaceId, first.id);
  assert.equal(admitted?.root, "C:\\repo");
  assert.equal(state.instance.resolve(first.id, p, "policy-a"), undefined);

  const second = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-a");
  state.advance(60_001);
  assert.equal(state.instance.resolve(second.id, p, "policy-a"), undefined);
  assert.equal(state.instance.resolve(second.id, p, "policy-a"), undefined);
});

test("list is exact-principal and policy scoped", () => {
  const state = registry();
  const firstPrincipal = principal();
  const secondPrincipal = principal({ grantId: "grant_22222222222222222222222222222222" });
  const first = state.instance.issueOrReuse({ root: "C:\\one", workspaceKey: "wk_one" }, firstPrincipal, "policy-a");
  state.instance.issueOrReuse({ root: "C:\\two", workspaceKey: "wk_two" }, secondPrincipal, "policy-a");
  assert.deepEqual(state.instance.list(firstPrincipal, "policy-a").map((workspace) => workspace.id), [first.id]);
  assert.deepEqual(state.instance.list(firstPrincipal, "policy-b"), []);
});

test("revocation events fan out to all subscribers while unsubscribe detaches only one observer", () => {
  const state = registry();
  const p = principal();
  const firstEvents = [];
  const secondEvents = [];
  const unsubscribe = state.instance.onWorkspaceRevoked((event) => firstEvents.push(event));
  state.instance.onWorkspaceRevoked((event) => secondEvents.push(event));
  const opened = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-a");
  unsubscribe();
  state.instance.close(opened.id, p, "policy-a");
  assert.deepEqual(firstEvents, []);
  assert.equal(secondEvents.length, 1);
  assert.equal(secondEvents[0].id, opened.id);
  assert.equal(secondEvents[0].reason, "closed");
});

test("WorkspaceManager facades share configured-root capability state but transport disposal only unsubscribes the caller", () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-oauth-workspace-shared-")));
  try {
    const shared = new WorkspaceCapabilityRegistry({
      ttlMs: 60_000,
      randomBytes: incrementingRandomBytes()
    });
    const p = principal();
    const base = {
      configuredRootRegistry: shared,
      capabilityPrincipal: () => p,
      identityBinding: "identity-a",
      policyRevision: () => "policy-a"
    };
    const managerA = new WorkspaceManager(managerConfig(root), {
      ...base,
      transportSessionId: () => "session-a"
    });
    const managerB = new WorkspaceManager(managerConfig(root), {
      ...base,
      transportSessionId: () => "session-b"
    });
    const eventsA = [];
    const eventsB = [];
    managerA.onWorkspaceRevoked((event) => eventsA.push(event));
    managerB.onWorkspaceRevoked((event) => eventsB.push(event));

    const opened = managerA.openWorkspace(root);
    assert.equal(managerB.getWorkspace(opened.id).id, opened.id);
    assert.equal(managerA.workspaceBindingDigest(opened.id), managerB.workspaceBindingDigest(opened.id));

    managerA.dispose("transport_closed");
    assert.equal(managerB.getWorkspace(opened.id).id, opened.id);
    managerB.closeWorkspace(opened.id);
    assert.deepEqual(eventsA, []);
    assert.equal(eventsB.length, 1);
    assert.equal(eventsB[0].id, opened.id);
    assert.equal(eventsB[0].reason, "closed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("shared configured-root backend does not absorb confirmed-root or task-worktree authority", () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-oauth-workspace-external-authority-")));
  try {
    const shared = new WorkspaceCapabilityRegistry({
      ttlMs: 60_000,
      randomBytes: incrementingRandomBytes()
    });
    const p = principal();
    const confirmedWorkspace = { id: `ws_${"a".repeat(32)}`, root, openedAt: new Date(0).toISOString(), accessClass: "confirmed_root" };
    const taskWorkspace = { id: `ws_${"b".repeat(32)}`, root, openedAt: new Date(0).toISOString(), accessClass: "task_worktree" };
    const authority = (workspace) => ({
      getWorkspace(id) {
        if (id !== workspace.id) throw new Error("not found");
        return workspace;
      },
      listWorkspaces() {
        return [workspace];
      },
      closeWorkspace(id) {
        if (id !== workspace.id) return null;
        return { workspaceId: id, closedAt: new Date(0).toISOString(), state: "closed" };
      }
    });
    const managerA = new WorkspaceManager(managerConfig(root), {
      configuredRootRegistry: shared,
      capabilityPrincipal: () => p,
      transportSessionId: () => "session-a",
      identityBinding: "identity-a",
      policyRevision: () => "policy-a",
      confirmedRoots: authority(confirmedWorkspace),
      taskWorktrees: authority(taskWorkspace)
    });
    const managerB = new WorkspaceManager(managerConfig(root), {
      configuredRootRegistry: shared,
      capabilityPrincipal: () => p,
      transportSessionId: () => "session-b",
      identityBinding: "identity-a",
      policyRevision: () => "policy-a"
    });
    const configured = managerA.openWorkspace(root);
    assert.equal(managerB.getWorkspace(configured.id).id, configured.id);
    assert.throws(() => managerB.getWorkspace(confirmedWorkspace.id), /Unknown workspace_id/);
    assert.throws(() => managerB.getWorkspace(taskWorkspace.id), /Unknown workspace_id/);
    assert.deepEqual(
      managerA.listWorkspaces().map((workspace) => workspace.id).sort(),
      [configured.id, confirmedWorkspace.id, taskWorkspace.id].sort()
    );
    assert.deepEqual(managerB.listWorkspaces().map((workspace) => workspace.id), [configured.id]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("WorkspaceManager shared mode fails foreign and policy-stale handles without default fallback", () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-oauth-workspace-policy-")));
  try {
    let revision = "policy-a";
    const shared = new WorkspaceCapabilityRegistry({
      ttlMs: 60_000,
      randomBytes: incrementingRandomBytes()
    });
    const owner = principal();
    const manager = new WorkspaceManager(managerConfig(root), {
      configuredRootRegistry: shared,
      capabilityPrincipal: () => owner,
      transportSessionId: () => "session-a",
      identityBinding: "identity-a",
      policyRevision: () => revision
    });
    const foreign = new WorkspaceManager(managerConfig(root), {
      configuredRootRegistry: shared,
      capabilityPrincipal: () => principal({ ownerRef: "owner_ref_b" }),
      transportSessionId: () => "session-b",
      identityBinding: "identity-b",
      policyRevision: () => revision
    });
    const opened = manager.openWorkspace(root);
    assert.throws(() => foreign.getWorkspace(opened.id), /Unknown workspace_id/);
    assert.equal(manager.getWorkspace(opened.id).id, opened.id);

    revision = "policy-b";
    assert.throws(() => manager.getWorkspace(opened.id), /Unknown workspace_id/);
    const reopened = manager.openWorkspace(root);
    assert.notEqual(reopened.id, opened.id);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("capacity rejects only the new issue after pruning and never evicts live handles", () => {
  const state = registry({ maxPerPrincipal: 2, maxActive: 3 });
  const p = principal();
  const one = state.instance.issueOrReuse({ root: "C:\\one", workspaceKey: "wk_one" }, p, "policy-a");
  const two = state.instance.issueOrReuse({ root: "C:\\two", workspaceKey: "wk_two" }, p, "policy-a");
  assert.throws(
    () => state.instance.issueOrReuse({ root: "C:\\three", workspaceKey: "wk_three" }, p, "policy-a"),
    WorkspaceCapabilityCapacityError
  );
  assert.equal(state.instance.resolve(one.id, p, "policy-a")?.id, one.id);
  assert.equal(state.instance.resolve(two.id, p, "policy-a")?.id, two.id);

  const other = principal({ grantId: "grant_22222222222222222222222222222222" });
  state.instance.issueOrReuse({ root: "C:\\three", workspaceKey: "wk_three" }, other, "policy-a");
  assert.throws(
    () => state.instance.issueOrReuse({ root: "C:\\four", workspaceKey: "wk_four" }, other, "policy-a"),
    WorkspaceCapabilityCapacityError
  );
});

test("default capacity is exactly 64 per principal and 256 per OAuth runtime without live eviction", () => {
  let now = 1_700_000_000_000;
  const perPrincipal = new WorkspaceCapabilityRegistry({
    ttlMs: 60_000,
    now: () => now,
    randomBytes: incrementingRandomBytes()
  });
  const p = principal();
  const live = [];
  for (let index = 0; index < 64; index += 1) {
    live.push(perPrincipal.issueOrReuse({
      root: `C:\\per-principal-${index}`,
      workspaceKey: `wk_per_${index}`
    }, p, "policy-a"));
  }
  assert.throws(() => perPrincipal.issueOrReuse({
    root: "C:\\per-principal-65",
    workspaceKey: "wk_per_65"
  }, p, "policy-a"), WorkspaceCapabilityCapacityError);
  assert.equal(perPrincipal.resolve(live[0].id, p, "policy-a")?.id, live[0].id);

  const runtime = new WorkspaceCapabilityRegistry({
    ttlMs: 60_000,
    now: () => now,
    randomBytes: incrementingRandomBytes()
  });
  let first;
  for (let principalIndex = 0; principalIndex < 4; principalIndex += 1) {
    const current = principal({
      grantId: `grant_${String(principalIndex + 1).repeat(32).slice(0, 32)}`
    });
    for (let rootIndex = 0; rootIndex < 64; rootIndex += 1) {
      const opened = runtime.issueOrReuse({
        root: `C:\\runtime-${principalIndex}-${rootIndex}`,
        workspaceKey: `wk_runtime_${principalIndex}_${rootIndex}`
      }, current, "policy-a");
      first ??= { opened, current };
    }
  }
  const fifthPrincipal = principal({ grantId: `grant_${"9".repeat(32)}` });
  assert.throws(() => runtime.issueOrReuse({
    root: "C:\\runtime-257",
    workspaceKey: "wk_runtime_257"
  }, fifthPrincipal, "policy-a"), WorkspaceCapabilityCapacityError);
  assert.equal(runtime.resolve(first.opened.id, first.current, "policy-a")?.id, first.opened.id);
});

test("independent registry instances never become process-global authority", () => {
  const first = new WorkspaceCapabilityRegistry({
    ttlMs: 60_000,
    randomBytes: incrementingRandomBytes()
  });
  const second = new WorkspaceCapabilityRegistry({
    ttlMs: 60_000,
    randomBytes: incrementingRandomBytes()
  });
  const p = principal();
  const opened = first.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-a");
  assert.equal(second.resolve(opened.id, p, "policy-a"), undefined);
  assert.equal(first.resolve(opened.id, p, "policy-a")?.id, opened.id);
});

test("dispose clears all process-local capability state", () => {
  const state = registry();
  const p = principal();
  const opened = state.instance.issueOrReuse({ root: "C:\\repo", workspaceKey: "wk_a" }, p, "policy-a");
  state.instance.dispose();
  assert.equal(state.instance.resolve(opened.id, p, "policy-a"), undefined);
  assert.deepEqual(state.instance.list(p, "policy-a"), []);
});
