import { WINDOWS_TEST_EXECUTION_PROFILES } from "./test-execution-profile-manifest.mjs";

export const WINDOWS_ADDITIONAL_ISOLATED_TESTS = Object.freeze([
  "approval-multi-server.test.mjs",
  "connector-auth-output.test.mjs",
  "doctor-shell.test.mjs",
  "http-security.test.mjs",
  "phase-4a-integration.test.mjs",
  "phase-6-transport-parity.test.mjs"
]);

const PROFILE_BY_TEST = new Map();
for (const [profile, names] of Object.entries(WINDOWS_TEST_EXECUTION_PROFILES)) {
  for (const name of names) {
    if (PROFILE_BY_TEST.has(name)) throw new Error(`TEST_PROFILE_DUPLICATE:${name}`);
    PROFILE_BY_TEST.set(name, profile);
  }
}

function validateInputs(testNames, options) {
  if (!Array.isArray(testNames) || testNames.some((name) => typeof name !== "string")) {
    throw new Error("TEST_CLASSIFICATION_INVALID");
  }
  if (new Set(testNames).size !== testNames.length) throw new Error("TEST_CLASSIFICATION_INVALID");
  if (!["layered", "legacy"].includes(options.topology)) throw new Error("TEST_TOPOLOGY_INVALID");
  if (
    options.requestedConcurrency !== undefined &&
    !/^[1-9][0-9]*$/u.test(options.requestedConcurrency)
  ) {
    throw new Error("TEST_CONCURRENCY_INVALID");
  }
  if (Number(options.requestedConcurrency ?? 1) > 64) throw new Error("TEST_CONCURRENCY_INVALID");
  for (const list of [options.controlTests, options.serialTests]) {
    if (!Array.isArray(list) || list.some((name) => typeof name !== "string")) {
      throw new Error("TEST_CLASSIFICATION_INVALID");
    }
  }
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

export function validateTestExecutionProfileInventory(testNames, options) {
  if (!Array.isArray(testNames) || testNames.some((name) => typeof name !== "string")) {
    throw new Error("TEST_PROFILE_INVENTORY_DRIFT");
  }
  const actual = sortedUnique(testNames);
  const reviewed = [...PROFILE_BY_TEST.keys()].sort();
  const unknown = actual.filter((name) => !PROFILE_BY_TEST.has(name));
  const missing = reviewed.filter((name) => !actual.includes(name));
  const configured = [
    ...options.controlTests,
    ...options.serialTests,
    ...WINDOWS_ADDITIONAL_ISOLATED_TESTS
  ];
  const missingConfigured = configured.filter((name) => !actual.includes(name));
  const nonIsolatedConfigured = configured.filter((name) => PROFILE_BY_TEST.get(name) !== "isolated");
  if (
    actual.length !== testNames.length ||
    unknown.length > 0 ||
    missing.length > 0 ||
    missingConfigured.length > 0 ||
    nonIsolatedConfigured.length > 0
  ) {
    throw new Error([
      "TEST_PROFILE_INVENTORY_DRIFT",
      `unknown=${unknown.join(",") || "none"}`,
      `missing=${missing.join(",") || "none"}`,
      `missing_configured=${missingConfigured.join(",") || "none"}`,
      `non_isolated_configured=${nonIsolatedConfigured.join(",") || "none"}`
    ].join(":"));
  }
}

export function validateTestExecutionPartition(testNames, shards) {
  if (!Array.isArray(shards) || shards.some((shard) => !Array.isArray(shard?.tests))) {
    throw new Error("TEST_EXECUTION_PARTITION_INVALID");
  }
  const flattened = shards.flatMap((shard) => shard.tests);
  if (
    flattened.length !== testNames.length ||
    new Set(flattened).size !== flattened.length ||
    JSON.stringify([...flattened].sort()) !== JSON.stringify([...testNames].sort())
  ) {
    throw new Error("TEST_EXECUTION_PARTITION_INVALID");
  }
}

export function buildTestExecutionShards(testNames, options) {
  validateInputs(testNames, options);
  const tests = [...testNames];
  if (options.platform === "win32" && options.topology === "legacy") {
    if (options.requestedConcurrency !== undefined && options.requestedConcurrency !== "1") {
      throw new Error("TEST_CONCURRENCY_INVALID");
    }
    return [{
      name: "main",
      concurrency: "1",
      tests
    }];
  }

  const serial = new Set(options.serialTests);
  if (options.platform !== "win32") {
    if (options.requestedConcurrency === "1") {
      return [{ name: "main", concurrency: "1", tests }];
    }
    return [
      {
        name: "main",
        concurrency: options.requestedConcurrency,
        tests: tests.filter((name) => !serial.has(name))
      },
      {
        name: "serial",
        concurrency: "1",
        tests: tests.filter((name) => serial.has(name))
      }
    ];
  }

  if (options.requestedConcurrency === "1") {
    return [{ name: "main", concurrency: "1", tests }];
  }
  for (const name of tests) {
    if (!PROFILE_BY_TEST.has(name)) throw new Error(`TEST_PROFILE_INVENTORY_DRIFT:unknown=${name}`);
  }
  return [
    {
      name: "fast",
      concurrency: options.requestedConcurrency ?? "4",
      tests: tests.filter((name) => PROFILE_BY_TEST.get(name) === "fast")
    },
    {
      name: "safe",
      concurrency: "2",
      tests: tests.filter((name) => PROFILE_BY_TEST.get(name) === "safe")
    },
    {
      name: "isolated",
      concurrency: "1",
      tests: tests.filter((name) => PROFILE_BY_TEST.get(name) === "isolated")
    }
  ];
}
