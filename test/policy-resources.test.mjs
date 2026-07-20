import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { PathGuard } = await tsImport("../src/guard.ts", import.meta.url);
const {
  classifyNetworkAddress,
  describeFilesystemResource,
  describeGitResource,
  describeNetworkResource,
  describeProcessResource,
  describeShellResource,
  fingerprintResource,
  normalizeNetworkHost
} = await tsImport("../src/policy/resources.ts", import.meta.url);

const config = {
  blockedGlobs: [".git", ".git/**", "**/.git/**", ".env", ".env.*", "**/.env", "**/.env.*"]
};

function withWorkspace(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-policy-resource-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "File.ts"), "export {};\n", "utf8");
  const workspace = { id: "ws_resource", root: fs.realpathSync.native(root), openedAt: new Date().toISOString() };
  try {
    return callback({ root, workspace });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("Windows resource comparison keys are case-insensitive and slash normalized", () => {
  withWorkspace(({ workspace }) => {
    const guard = new PathGuard(config, process.platform);
    const filesystem = describeFilesystemResource({
      platform: "win32",
      workspace,
      guard,
      operation: "read",
      inputPath: "src/File.ts"
    });
    assert.equal(filesystem.relativePath, "src/File.ts");
    assert.equal(filesystem.comparisonKey, "src/file.ts");
    assert.match(filesystem.resourceFingerprint, /^sha256:[a-f0-9]{64}$/);

    const git = describeGitResource({
      workspaceId: workspace.id,
      operation: "read",
      repositoryKey: "repo_local",
      relativePaths: ["SRC\\File.ts", "src/file.ts"],
      platform: "win32"
    });
    assert.deepEqual(git.relativePaths, ["src/file.ts", "src/file.ts"]);
  });
});

test("non-existent write targets retain a validated unresolved suffix and stable parent identity", () => {
  withWorkspace(({ workspace }) => {
    const guard = new PathGuard(config, process.platform);
    const resource = describeFilesystemResource({
      platform: process.platform,
      workspace,
      guard,
      operation: "write",
      inputPath: "new/deep/file.ts"
    });
    assert.equal(resource.targetExists, false);
    assert.deepEqual(resource.unresolvedSuffix, ["new", "deep", "file.ts"]);
    assert.match(resource.existingParentIdentity, /^parent_[a-f0-9]{24}$/);
    assert.equal(resource.containment, "inside");
  });
});

test("blocked paths remain blocked before resource creation", () => {
  withWorkspace(({ workspace }) => {
    const guard = new PathGuard(config, process.platform);
    assert.throws(() => describeFilesystemResource({
      platform: process.platform,
      workspace,
      guard,
      operation: "read",
      inputPath: ".env"
    }), /blocked/i);
  });
});

test("Git Shell and Process descriptors contain digests instead of raw commands", () => {
  const git = describeGitResource({
    workspaceId: "ws_resource",
    operation: "read",
    repositoryKey: "repo_local",
    relativePaths: ["src/File.ts"],
    refs: ["HEAD"],
    remoteName: null,
    remoteHost: null
  });
  assert.equal(git.kind, "git");

  const command = "npm run build -- --secret synthetic";
  const shell = describeShellResource({
    workspaceId: "ws_resource",
    operation: "verify",
    backend: "bash",
    cwd: ".",
    commandKind: "verification",
    command,
    executable: "npm",
    argumentCount: 4,
    persistence: false,
    requestedNetwork: false
  });
  assert.equal(JSON.stringify(shell).includes(command), false);
  assert.match(shell.commandDigest, /^sha256:[a-f0-9]{64}$/);

  const processResource = describeProcessResource({
    operation: "terminate",
    workspaceId: "ws_resource",
    processId: "job-1",
    persistence: false,
    executable: null
  });
  assert.equal(processResource.processId, "job-1");
});

test("network normalization supports exact DNS and IP literals and rejects unsupported wildcards", () => {
  assert.equal(normalizeNetworkHost("EXAMPLE.COM."), "example.com");
  assert.equal(normalizeNetworkHost("[2001:db8::10]"), "2001:db8::10");
  assert.equal(normalizeNetworkHost("*.Example.com"), "*.example.com");
  assert.equal(normalizeNetworkHost("**.Example.com"), "**.example.com");
  assert.throws(() => normalizeNetworkHost("api.*.example.com"));
  assert.throws(() => normalizeNetworkHost("192.0.2.0/24"));
});

test("network descriptors classify address families and address classes", () => {
  const network = describeNetworkResource({
    operation: "connect",
    workspaceId: null,
    scheme: "https",
    host: "example.com",
    port: 443,
    resolvedAddresses: ["127.0.0.1", "10.0.0.1", "203.0.113.10"]
  });
  assert.equal(network.hostKind, "dns");
  assert.deepEqual(network.addressClasses, ["loopback", "private", "reserved"]);
  assert.equal(classifyNetworkAddress("169.254.10.1"), "link_local");
  assert.equal(classifyNetworkAddress("::1"), "loopback");
});

test("resource fingerprints are deterministic and ignore object insertion order", () => {
  const first = fingerprintResource({ b: 2, a: 1 });
  const second = fingerprintResource({ a: 1, b: 2 });
  assert.equal(first, second);
});
