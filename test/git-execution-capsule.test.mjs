import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bindGitExecutable,
  buildSafeGitInvocation,
  computeGitCapabilityRevision,
  computeGateG0ImplementationRevision,
  createGitServicePathAuthority,
  enumerateGitExecutableCandidates,
  executeGitInvocation,
  loadGitExecutionManifest,
  mapGitCapabilityFailure,
  parseMergeTreeWriteTreeStdinZ,
  sanitizeGitDiagnostic,
  verifyGitExecutableBinding
} from "../scripts/git-capability-spike.mjs";

const manifest = await loadGitExecutionManifest();

function binding(file = "C:\\Program Files\\Git\\cmd\\git.exe") {
  return Object.freeze({
    schemaVersion: 1,
    path: file,
    realPath: file,
    sha256: "a".repeat(64),
    identity: `sha256:${"a".repeat(64)}:dev:1:ino:2`,
    version: "git version 2.55.0.windows.2"
  });
}

function repository() {
  return Object.freeze({
    gitDir: "C:\\repo\\.git",
    workTree: "C:\\repo",
    commonGitDir: "C:\\repo\\.git",
    objectFormat: "sha1"
  });
}

test("Gate G0 manifest freezes the private execution capsule contract", () => {
  assert.deepEqual(
    {
      schemaVersion: manifest.schemaVersion,
      capabilityName: manifest.capabilityName,
      capabilityVersion: manifest.capabilityVersion,
      executionIsolation: manifest.executionIsolation,
      repositoryIntegrations: manifest.repositoryIntegrations,
      processTreeControl: manifest.processTreeControl,
      brokerEscapeResistance: manifest.brokerEscapeResistance
    },
    {
      schemaVersion: 1,
      capabilityName: "codexgpt-git-execution",
      capabilityVersion: 1,
      executionIsolation: "none",
      repositoryIntegrations: "disabled",
      processTreeControl: "job_object_members_only",
      brokerEscapeResistance: "none"
    }
  );
  assert.deepEqual(manifest.allowedOperations, [
    "version",
    "init_private_probe",
    "object_format",
    "worktree_list_porcelain_z",
    "status_porcelain_v2",
    "diff_no_ext",
    "hash_object_write_raw",
    "read_tree_empty",
    "read_tree_oid",
    "update_index_cacheinfo",
    "write_tree",
    "commit_tree",
    "update_ref_expected_old",
    "merge_tree_write_stdin_z",
    "cat_file_exists",
    "positive_control_add"
  ]);
  assert.equal(manifest.commandTransport, "direct_argv");
  assert.equal(manifest.promptPolicy, "fail_closed");
  assert.equal(manifest.remotePolicy, "deny_all");
});

test("Gate G0 manifest rejects any security-control drift", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-manifest-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const original = JSON.parse(await fs.readFile(path.resolve("scripts/git-execution-manifest-v1.json"), "utf8"));
  const mutations = [
    (value) => value.candidateOrder.push("C:\\poison\\git.exe"),
    (value) => value.fixedConfigKeys.splice(value.fixedConfigKeys.indexOf("protocol.allow=never"), 1),
    (value) => value.deniedEnvironmentPrefixes.splice(0, 1),
    (value) => { value.deniedEnvironmentNames[0] = "UNRELATED"; },
    (value) => { value.limits.argumentCount += 1; }
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    const changed = structuredClone(original);
    mutations[index](changed);
    const file = path.join(root, `manifest-${index}.json`);
    await fs.writeFile(file, JSON.stringify(changed), "utf8");
    await assert.rejects(() => loadGitExecutionManifest({ manifestPath: file }), /GIT_MANIFEST_INVALID/);
  }
});

test("candidate discovery is fixed-location and never PATH ordered", () => {
  assert.deepEqual(
    enumerateGitExecutableCandidates({
      platform: "win32",
      programFiles: "D:\\Programs",
      localAppData: "C:\\Users\\Noah\\AppData\\Local",
      pathEnvironment: "C:\\poison\\cmd;C:\\poison\\bin"
    }),
    [
      "D:\\Programs\\Git\\cmd\\git.exe",
      "D:\\Programs\\Git\\bin\\git.exe"
    ]
  );
});

test("safe builder emits only exact local argv and a sealed environment", () => {
  const invocation = buildSafeGitInvocation({
    manifest,
    binding: binding(),
    repository: repository(),
    operation: {
      kind: "hash_object_write_raw",
      stdin: Buffer.from("hello\n")
    },
    servicePaths: {
      tempRoot: "C:\\state\\tmp",
      home: "C:\\state\\home",
      hooks: "C:\\state\\hooks"
    },
    callerEnvironment: {
      PATH: "C:\\poison",
      GIT_DIR: "C:\\escape",
      GIT_WORK_TREE: "C:\\escape",
      GIT_INDEX_FILE: "C:\\escape\\index",
      GIT_OBJECT_DIRECTORY: "C:\\escape\\objects",
      GIT_ALTERNATE_OBJECT_DIRECTORIES: "C:\\escape\\alt",
      GIT_NAMESPACE: "escape",
      GIT_REPLACE_REF_BASE: "refs/replace/",
      GIT_SSH_COMMAND: "evil",
      GIT_ASKPASS: "evil",
      SSH_ASKPASS: "evil",
      HTTP_PROXY: "http://127.0.0.1:9",
      GIT_TRACE: "1",
      GIT_EDITOR: "evil",
      GIT_PAGER: "evil",
      GIT_CONFIG_GLOBAL: "C:\\evil.cfg"
    }
  });

  assert.equal(invocation.executable, binding().realPath);
  assert.deepEqual(invocation.arguments.slice(-4), ["hash-object", "-w", "--stdin", "--no-filters"]);
  assert.equal(invocation.arguments.includes("--path"), false);
  assert.equal(invocation.stdin.toString("utf8"), "hello\n");
  assert.equal(invocation.environment.PATH.includes("poison"), false);
  assert.equal(invocation.environment.SystemRoot, "C:\\Windows");
  assert.equal(invocation.environment.GIT_DIR, undefined);
  assert.equal(invocation.environment.GIT_WORK_TREE, undefined);
  assert.equal(invocation.environment.GIT_TERMINAL_PROMPT, "0");
  assert.equal(invocation.environment.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(invocation.environment.GIT_NO_LAZY_FETCH, "1");
  assert.equal(invocation.environment.GIT_NO_REPLACE_OBJECTS, "1");
  assert.equal(invocation.environment.GIT_ALLOW_PROTOCOL, "");
  assert.equal(invocation.timeoutMs, 60_000);
  assert.equal(invocation.stdoutLimitBytes, 1_048_576);
  assert.equal(invocation.stderrLimitBytes, 1_048_576);
  assert.equal(invocation.executionIsolation, "none");
  assert.equal(invocation.repositoryIntegrations, "disabled");
});

test("service-generated private index and quarantine paths require an unforgeable authority", () => {
  const authority = createGitServicePathAuthority(Buffer.alloc(32, 7));
  const foreignAuthority = createGitServicePathAuthority(Buffer.alloc(32, 8));
  const servicePaths = {
    tempRoot: "C:\\state\\tmp",
    home: "C:\\state\\home",
    hooks: "C:\\state\\hooks",
    privateIndex: "C:\\state\\indexes\\index-1",
    objectDirectory: "C:\\state\\objects\\quarantine-1",
    objectAlternates: "C:\\repo\\.git\\objects"
  };
  const identity = authority.seal(repository(), servicePaths);
  const invocation = buildSafeGitInvocation({
    manifest,
    binding: binding(),
    repository: repository(),
    operation: { kind: "read_tree_empty" },
    servicePathAuthority: authority,
    servicePaths: { ...servicePaths, identity }
  });
  assert.equal(invocation.environment.GIT_INDEX_FILE, "C:\\state\\indexes\\index-1");
  assert.equal(invocation.environment.GIT_OBJECT_DIRECTORY, "C:\\state\\objects\\quarantine-1");
  assert.equal(invocation.environment.GIT_ALTERNATE_OBJECT_DIRECTORIES, "C:\\repo\\.git\\objects");
  assert.equal(invocation.servicePathIdentity, identity);

  const forgedIdentity = foreignAuthority.seal(repository(), servicePaths);
  assert.throws(() => buildSafeGitInvocation({
    manifest,
    binding: binding(),
    repository: repository(),
    operation: { kind: "read_tree_empty" },
    servicePathAuthority: authority,
    servicePaths: { ...servicePaths, identity: forgedIdentity }
  }), /GIT_SERVICE_PATH_IDENTITY_REQUIRED/);
  assert.throws(() => buildSafeGitInvocation({
    manifest,
    binding: binding(),
    repository: repository(),
    operation: { kind: "read_tree_empty" },
    servicePathAuthority: { schemaVersion: 1, verify: () => true },
    servicePaths: { ...servicePaths, identity }
  }), /GIT_SERVICE_PATH_IDENTITY_REQUIRED/);
  authority.destroy();
  foreignAuthority.destroy();
});

test("remote, credential, config, force, revision and raw flag forms fail before spawn", () => {
  const forbidden = [
    { kind: "push" },
    { kind: "pull" },
    { kind: "fetch" },
    { kind: "clone", url: "https://example.invalid/repo.git" },
    { kind: "raw", args: ["status"] },
    { kind: "config", key: "credential.helper", value: "evil" },
    { kind: "update_ref_expected_old", ref: "refs/heads/main", newOid: "a".repeat(40), oldOid: "0".repeat(40), force: true },
    { kind: "cat_file_exists", oid: "HEAD~1" },
    {
      kind: "merge_tree_write_stdin_z",
      pairs: [
        ["a".repeat(40), "b".repeat(40)],
        ["c".repeat(40), "d".repeat(40)]
      ]
    }
  ];
  for (const operation of forbidden) {
    assert.throws(() => buildSafeGitInvocation({
      manifest,
      binding: binding(),
      repository: repository(),
      operation,
      servicePaths: { tempRoot: "C:\\state\\tmp", home: "C:\\state\\home", hooks: "C:\\state\\hooks" }
    }), /GIT_COMMAND_REJECTED|GIT_OID_INVALID|GIT_REF_INVALID/);
  }
});

test("merge-tree parser authorizes from the NUL status record, never human text", () => {
  const clean = Buffer.from(`1\0${"a".repeat(40)}\0\0`, "utf8");
  assert.deepEqual(parseMergeTreeWriteTreeStdinZ(clean, "sha1"), {
    clean: true,
    treeOid: "a".repeat(40),
    conflictRecordCount: 0
  });

  const conflict = Buffer.from([
    "0",
    "b".repeat(40),
    `100644 ${"c".repeat(40)} 1\tfile.txt`,
    `100644 ${"d".repeat(40)} 2\tfile.txt`,
    `100644 ${"e".repeat(40)} 3\tfile.txt`,
    "",
    "1",
    "file.txt",
    "THIS MESSAGE SAYS CLEAN BUT IS NOT AUTHORITY",
    "",
    ""
  ].join("\0"), "utf8");
  assert.deepEqual(parseMergeTreeWriteTreeStdinZ(conflict, "sha1"), {
    clean: false,
    treeOid: "b".repeat(40),
    conflictRecordCount: 1
  });

  assert.throws(
    () => parseMergeTreeWriteTreeStdinZ(Buffer.from(`1\0HEAD\0\0`, "utf8"), "sha1"),
    /GIT_MERGE_OUTPUT_INVALID/
  );
  const wrongStageOidLength = Buffer.from([
    "0",
    "b".repeat(40),
    `100644 ${"c".repeat(41)} 1\tfile.txt`,
    `100644 ${"d".repeat(40)} 2\tfile.txt`,
    `100644 ${"e".repeat(40)} 3\tfile.txt`,
    "",
    ""
  ].join("\0"), "utf8");
  assert.throws(
    () => parseMergeTreeWriteTreeStdinZ(wrongStageOidLength, "sha1"),
    /GIT_MERGE_OUTPUT_INVALID/
  );
  const unavailable = mapGitCapabilityFailure(
    "merge_tree_write_stdin_z",
    Object.assign(new Error("unsupported"), { code: "GIT_EXECUTION_FAILED" })
  );
  assert.equal(unavailable.code, "GIT_MERGE_CAPABILITY_UNAVAILABLE");
});

test("capability revision binds the exact implementation and native-host manifest", async () => {
  const implementationRevision = await computeGateG0ImplementationRevision();
  assert.match(implementationRevision, /^[a-f0-9]{64}$/);
  const common = {
    manifest,
    binding: binding(),
    version: "git version 2.55.0.windows.2",
    features: { objectOnlyMerge: true },
    host: { manifestRevision: "1".repeat(64), processTreeControl: "job_object_members_only" },
    implementationRevision
  };
  const first = computeGitCapabilityRevision(common);
  assert.notEqual(first, computeGitCapabilityRevision({ ...common, implementationRevision: "2".repeat(64) }));
  assert.notEqual(first, computeGitCapabilityRevision({ ...common, host: { ...common.host, manifestRevision: "3".repeat(64) } }));
});

test("executable replacement prevents host spawn and diagnostics stay bounded", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-git-binding-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const executable = path.join(root, "git.exe");
  await fs.writeFile(executable, "first");
  const original = await bindGitExecutable(executable);
  await verifyGitExecutableBinding(original);
  await fs.writeFile(executable, "second");
  await assert.rejects(() => verifyGitExecutableBinding(original), /GIT_EXECUTABLE_DRIFT/);
  let requests = 0;
  const invocation = buildSafeGitInvocation({
    manifest,
    binding: original,
    repository: repository(),
    operation: { kind: "version" },
    servicePaths: {
      tempRoot: "C:\\state\\tmp",
      home: "C:\\state\\home",
      hooks: "C:\\state\\hooks"
    }
  });
  await assert.rejects(
    () => executeGitInvocation({ request: async () => { requests += 1; return { body: {} }; } }, invocation, { binding: original }),
    /GIT_EXECUTABLE_DRIFT/
  );
  assert.equal(requests, 0);

  const secret = "https://user:password@example.invalid/repo?token=sk-abcdefghijklmnop";
  const sanitized = sanitizeGitDiagnostic(`${secret}\n${"x".repeat(20_000)}`, 512);
  assert.equal(sanitized.includes("password"), false);
  assert.equal(sanitized.includes("sk-abcdefghijklmnop"), false);
  assert.ok(Buffer.byteLength(sanitized, "utf8") <= 512);
});
