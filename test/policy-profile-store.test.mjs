import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  PolicyConfigError,
  compilePermissionProfile,
  loadPermissionProfileGraph,
  permissionProfilePath,
  policyRevisionForSources
} = await tsImport("../src/policy/profileStore.ts", import.meta.url);

function makeHome(documents) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-policy-home-"));
  const dir = path.join(home, "permissions");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, document] of Object.entries(documents)) {
    fs.writeFileSync(path.join(dir, name), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  }
  return home;
}

function cleanup(home) {
  fs.rmSync(home, { recursive: true, force: true });
}

test("profile path accepts only exact safe ids", () => {
  const home = makeHome({});
  try {
    assert.equal(permissionProfilePath("review.child", home), path.join(home, "permissions", "review.child.json"));
    assert.throws(() => permissionProfilePath("../escape", home), PolicyConfigError);
    assert.throws(() => permissionProfilePath("UPPER", home), PolicyConfigError);
  } finally {
    cleanup(home);
  }
});

test("profile inheritance is parent-first, bounded, hash recorded, and defaults applied after merge", () => {
  const home = makeHome({
    "base.json": {
      schemaVersion: 1,
      id: "base",
      workspaceRoots: [process.cwd()],
      filesystem: {
        default: "deny",
        rules: [{ id: "base.read.src", selector: { kind: "subtree", path: "src" }, access: "read" }]
      },
      git: { read: true }
    },
    "child.json": {
      schemaVersion: 1,
      id: "child",
      extends: "base",
      filesystem: {
        rules: [{ id: "child.write.generated", selector: { kind: "subtree", path: "generated" }, access: "write" }]
      },
      shell: { mode: "verify" }
    }
  });
  try {
    const graph = loadPermissionProfileGraph("child", { home });
    assert.deepEqual(graph.order.map((entry) => entry.id), ["base", "child"]);
    assert.equal(graph.sourceHashes.length, 2);
    assert.match(graph.sourceHashes[0].sha256, /^[a-f0-9]{64}$/);

    const compiled = compilePermissionProfile(graph, process.platform);
    assert.equal(compiled.id, "child");
    assert.deepEqual(compiled.sourceProfileIds, ["base", "child"]);
    assert.equal(compiled.filesystem.default, "deny");
    assert.deepEqual(compiled.filesystem.rules.map((rule) => rule.id), ["base.read.src", "child.write.generated"]);
    assert.equal(compiled.git.read, true);
    assert.equal(compiled.git.write, false);
    assert.equal(compiled.shell.mode, "verify");
    assert.equal(compiled.shell.requireSandbox, true);
    assert.equal(compiled.network.enabled, false);
    assert.ok(Object.isFrozen(compiled));
    assert.ok(Object.isFrozen(compiled.filesystem.rules));
  } finally {
    cleanup(home);
  }
});

test("profile cycles and inheritance depth above eight fail closed", () => {
  const cyclicHome = makeHome({
    "a.json": { schemaVersion: 1, id: "a", extends: "b" },
    "b.json": { schemaVersion: 1, id: "b", extends: "a" }
  });
  try {
    assert.throws(() => loadPermissionProfileGraph("a", { home: cyclicHome }), /cycle/i);
  } finally {
    cleanup(cyclicHome);
  }

  const documents = {};
  for (let index = 1; index <= 9; index += 1) {
    documents[`p${index}.json`] = {
      schemaVersion: 1,
      id: `p${index}`,
      ...(index < 9 ? { extends: `p${index + 1}` } : {})
    };
  }
  const deepHome = makeHome(documents);
  try {
    assert.throws(() => loadPermissionProfileGraph("p1", { home: deepHome }), /eight|depth/i);
  } finally {
    cleanup(deepHome);
  }
});

test("profile store rejects symlinked documents and oversized files", { skip: process.platform === "win32" }, () => {
  const home = makeHome({
    "target.json": { schemaVersion: 1, id: "target" }
  });
  try {
    fs.symlinkSync(path.join(home, "permissions", "target.json"), path.join(home, "permissions", "link.json"));
    assert.throws(() => loadPermissionProfileGraph("link", { home }), /symbolic link/i);

    fs.writeFileSync(path.join(home, "permissions", "large.json"), "x".repeat(256 * 1024 + 1), "utf8");
    assert.throws(() => loadPermissionProfileGraph("large", { home }), /256 KiB|too large/i);
  } finally {
    cleanup(home);
  }
});

test("compiler rejects duplicate ids and conflicting normalized selectors", () => {
  const home = makeHome({
    "base.json": {
      schemaVersion: 1,
      id: "base",
      filesystem: {
        rules: [{ id: "same", selector: { kind: "subtree", path: "SRC" }, access: "read" }]
      }
    },
    "child.json": {
      schemaVersion: 1,
      id: "child",
      extends: "base",
      filesystem: {
        rules: [{ id: "same", selector: { kind: "subtree", path: "src" }, access: "write" }]
      }
    }
  });
  try {
    const graph = loadPermissionProfileGraph("child", { home });
    assert.throws(() => compilePermissionProfile(graph, "win32"), /duplicate|conflict/i);
  } finally {
    cleanup(home);
  }
});

test("policy revision is deterministic and changes with source or capability revision", () => {
  const sources = [{ id: "base", sha256: "a".repeat(64) }];
  const one = policyRevisionForSources(sources, "hard-v1", "cap-v1");
  const two = policyRevisionForSources(sources, "hard-v1", "cap-v1");
  const changed = policyRevisionForSources(sources, "hard-v1", "cap-v2");
  assert.equal(one, two);
  assert.notEqual(one, changed);
  assert.match(one, /^policy_[a-f0-9]{24}$/);
});
