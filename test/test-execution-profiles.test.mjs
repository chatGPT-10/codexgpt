import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildTestExecutionShards,
  validateTestExecutionProfileInventory,
  WINDOWS_ADDITIONAL_ISOLATED_TESTS
} from "../scripts/test-execution-profiles.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controlTests = [
  "conpty-close-order-windows-control.test.mjs",
  "process-lifecycle-windows-control.test.mjs"
];
const serialTests = [
  "phase-7-repository-acceptance.test.mjs",
  "runner-process-identity.test.mjs"
];
const sampleTests = [
  "approval-multi-server.test.mjs",
  "cli-approvals.test.mjs",
  "codexgpt-contract.test.mjs",
  "git-stash-v4.test.mjs",
  "mutation-runtime.test.mjs",
  "phase-3d-move-engine.test.mjs",
  "phase-7-repository-acceptance.test.mjs",
  "process-lifecycle-windows-control.test.mjs",
  "runner-process-identity.test.mjs",
  "task-worktree-remove.test.mjs",
  "transaction-engine.test.mjs"
];

test("Windows layered topology partitions every test into bounded fast, safe, and isolated shards", () => {
  const shards = buildTestExecutionShards(sampleTests, {
    platform: "win32",
    topology: "layered",
    controlTests,
    serialTests
  });

  assert.deepEqual(shards.map(({ name, concurrency }) => ({ name, concurrency })), [
    { name: "fast", concurrency: "4" },
    { name: "safe", concurrency: "2" },
    { name: "isolated", concurrency: "1" }
  ]);
  assert.deepEqual(shards[0].tests, ["codexgpt-contract.test.mjs"]);
  assert.deepEqual(shards[1].tests, [
    "git-stash-v4.test.mjs",
    "mutation-runtime.test.mjs",
    "phase-3d-move-engine.test.mjs",
    "task-worktree-remove.test.mjs",
    "transaction-engine.test.mjs"
  ]);
  assert.deepEqual(shards[2].tests, [
    "approval-multi-server.test.mjs",
    "cli-approvals.test.mjs",
    "phase-7-repository-acceptance.test.mjs",
    "process-lifecycle-windows-control.test.mjs",
    "runner-process-identity.test.mjs"
  ]);
  assert.deepEqual(
    shards.flatMap((shard) => shard.tests).sort(),
    [...sampleTests].sort()
  );
  assert.equal(new Set(shards.flatMap((shard) => shard.tests)).size, sampleTests.length);
  assert.ok(WINDOWS_ADDITIONAL_ISOLATED_TESTS.includes("approval-multi-server.test.mjs"));
});

test("Windows legacy topology is an exact one-process rollback", () => {
  assert.deepEqual(buildTestExecutionShards(sampleTests, {
    platform: "win32",
    topology: "legacy",
    controlTests,
    serialTests
  }), [{
    name: "main",
    concurrency: "1",
    tests: sampleTests
  }]);
});

test("non-Windows topology preserves the established main and serial split", () => {
  const shards = buildTestExecutionShards(sampleTests, {
    platform: "linux",
    topology: "layered",
    controlTests,
    serialTests
  });
  assert.deepEqual(shards, [
    {
      name: "main",
      concurrency: undefined,
      tests: sampleTests.filter((name) => !serialTests.includes(name))
    },
    {
      name: "serial",
      concurrency: "1",
      tests: sampleTests.filter((name) => serialTests.includes(name))
    }
  ]);
});

test("an explicit Windows concurrency tunes fast work without widening safe or isolated work", () => {
  const shards = buildTestExecutionShards(sampleTests, {
    platform: "win32",
    topology: "layered",
    requestedConcurrency: "8",
    controlTests,
    serialTests
  });
  assert.deepEqual(shards.map(({ name, concurrency }) => ({ name, concurrency })), [
    { name: "fast", concurrency: "8" },
    { name: "safe", concurrency: "2" },
    { name: "isolated", concurrency: "1" }
  ]);
});

test("an explicit Windows concurrency of one preserves the established globally serial behavior", () => {
  assert.deepEqual(buildTestExecutionShards(sampleTests, {
    platform: "win32",
    topology: "layered",
    requestedConcurrency: "1",
    controlTests,
    serialTests
  }), [{
    name: "main",
    concurrency: "1",
    tests: sampleTests
  }]);
});

test("the legacy rollback remains exactly serial and rejects a wider concurrency", () => {
  assert.throws(() => buildTestExecutionShards(sampleTests, {
    platform: "win32",
    topology: "legacy",
    requestedConcurrency: "8",
    controlTests,
    serialTests
  }), /TEST_CONCURRENCY_INVALID/);
});

test("the reviewed Windows profile inventory exactly covers repository tests and fails closed on drift", async () => {
  const discovered = (await fs.readdir(path.join(repositoryRoot, "test"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => entry.name)
    .sort();

  assert.doesNotThrow(() => validateTestExecutionProfileInventory(discovered, {
    controlTests,
    serialTests
  }));
  const isolated = buildTestExecutionShards(discovered, {
    platform: "win32",
    topology: "layered",
    controlTests,
    serialTests
  }).find((shard) => shard.name === "isolated").tests;
  assert.deepEqual(
    WINDOWS_ADDITIONAL_ISOLATED_TESTS.filter((name) => !isolated.includes(name)),
    [],
    "every additional process/port risk must remain isolated"
  );
  assert.throws(() => validateTestExecutionProfileInventory(
    [...discovered, "new-child-crash.test.mjs"],
    { controlTests, serialTests }
  ), /TEST_PROFILE_INVENTORY_DRIFT/);
  assert.throws(() => validateTestExecutionProfileInventory(
    discovered.slice(1),
    { controlTests, serialTests }
  ), /TEST_PROFILE_INVENTORY_DRIFT/);
});

test("invalid topology and concurrency fail before any child process starts", () => {
  assert.throws(() => buildTestExecutionShards(sampleTests, {
    platform: "win32",
    topology: "unknown",
    controlTests,
    serialTests
  }), /TEST_TOPOLOGY_INVALID/);
  assert.throws(() => buildTestExecutionShards(sampleTests, {
    platform: "win32",
    topology: "layered",
    requestedConcurrency: "0",
    controlTests,
    serialTests
  }), /TEST_CONCURRENCY_INVALID/);
  assert.throws(() => buildTestExecutionShards([...sampleTests, sampleTests[0]], {
    platform: "win32",
    topology: "layered",
    controlTests,
    serialTests
  }), /TEST_CLASSIFICATION_INVALID/);
});
