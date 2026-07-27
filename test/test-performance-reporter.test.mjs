import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  createTestPerformanceReporter,
  prepareTestPerformanceDirectory,
  validateTestPerformanceReport
} from "../scripts/test-performance-reporter.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

async function collect(reporter, events) {
  const output = [];
  async function* source() {
    yield* events;
  }
  for await (const chunk of reporter(source())) output.push(chunk);
  return JSON.parse(output.join(""));
}

test("performance reporter records bounded per-file timing without source paths", async () => {
  const fileA = path.join(repositoryRoot, "test", "alpha.test.mjs");
  const fileB = path.join(repositoryRoot, "test", "nested", "beta.test.mjs");
  const timestamps = [
    1_000, 1_010, 1_025, 1_030,
    1_040, 1_070, 1_080, 1_100
  ];
  const reporter = createTestPerformanceReporter({
    now: () => timestamps.shift(),
    environment: {
      CODEXGPT_TEST_PERFORMANCE_DOMAIN: "all",
      CODEXGPT_TEST_PERFORMANCE_SHARD: "main",
      GITHUB_ACTIONS: "true",
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_JOB: "windows"
    },
    platform: "win32",
    architecture: "x64",
    nodeVersion: "v24.15.0"
  });
  const report = await collect(reporter, [
    { type: "test:dequeue", data: { file: fileA } },
    { type: "test:start", data: { file: fileA } },
    { type: "test:pass", data: { file: fileA } },
    { type: "test:complete", data: { file: fileA } },
    { type: "test:dequeue", data: { file: fileB } },
    { type: "test:start", data: { file: fileB } },
    { type: "test:fail", data: { file: fileB } },
    { type: "test:complete", data: { file: fileB } }
  ]);

  assert.deepEqual(
    report.testFiles.map((entry) => entry.test),
    ["test/nested/beta.test.mjs", "test/alpha.test.mjs"]
  );
  assert.deepEqual(report.testFiles[0], {
    test: "test/nested/beta.test.mjs",
    status: "failed",
    startedAt: "1970-01-01T00:00:01.040Z",
    endedAt: "1970-01-01T00:00:01.100Z",
    durationMs: 60
  });
  assert.equal(report.testFiles[1].durationMs, 30);
  const stringValues = [];
  JSON.stringify(report, (_key, value) => {
    if (typeof value === "string") stringValues.push(value);
    return value;
  });
  assert.equal(stringValues.some((value) => value.includes(repositoryRoot)), false);
  assert.equal(report.testFiles.some((entry) => path.isAbsolute(entry.test)), false);
  assert.deepEqual(report.runtime, {
    platform: "win32",
    architecture: "x64",
    nodeVersion: "v24.15.0"
  });
  assert.deepEqual(report.ci, {
    provider: "github-actions",
    runId: "123",
    runAttempt: "2",
    job: "windows"
  });
});

test("performance reporter ignores events outside the repository test tree", async () => {
  const timestamps = [2_000, 2_010, 2_020, 2_030];
  const reporter = createTestPerformanceReporter({
    now: () => timestamps.shift(),
    environment: {},
    platform: "linux",
    architecture: "arm64",
    nodeVersion: "v20.20.2"
  });
  const report = await collect(reporter, [
    { type: "test:dequeue", data: { file: path.join(repositoryRoot, "src", "server.ts") } },
    { type: "test:complete", data: { file: path.join(repositoryRoot, "src", "server.ts") } },
    { type: "test:dequeue", data: { file: path.resolve(repositoryRoot, "..", "secret.test.mjs") } },
    { type: "test:complete", data: { file: path.resolve(repositoryRoot, "..", "secret.test.mjs") } }
  ]);

  assert.deepEqual(report.testFiles, []);
  assert.equal(report.domain, "unknown");
  assert.equal(report.shard, "unknown");
  assert.equal(report.ci, null);
});

test("real Node multi-reporter execution writes and validates one bounded report", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-performance-reporter-"));
  try {
    const destination = path.join(root, "report.json");
    const reporter = pathToFileURL(path.join(repositoryRoot, "scripts", "test-performance-reporter.mjs")).href;
    const childEnvironment = {
      ...process.env,
      CODEXGPT_TEST_PERFORMANCE_DOMAIN: "all",
      CODEXGPT_TEST_PERFORMANCE_SHARD: "main"
    };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const { stdout } = await execFileAsync(process.execPath, [
      "--test",
      "--test-reporter=tap",
      `--test-reporter=${reporter}`,
      "--test-reporter-destination=stdout",
      `--test-reporter-destination=${destination}`,
      "test/ci-workflow.test.mjs"
    ], {
      cwd: repositoryRoot,
      env: childEnvironment,
      encoding: "utf8",
      timeout: 30_000
    });
    assert.match(stdout, /^TAP version 13/m);
    const report = await validateTestPerformanceReport(destination, {
      domain: "all",
      shard: "main",
      testNames: ["ci-workflow.test.mjs"]
    });
    assert.equal(report.testFiles.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("performance directory preparation rejects linked state paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-performance-boundary-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-performance-outside-"));
  try {
    await fs.symlink(outside, path.join(root, ".ai-bridge"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      prepareTestPerformanceDirectory(root),
      /must be a real directory/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("report validation rejects oversized, linked, stale, and malformed evidence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-performance-validator-"));
  const reportPath = path.join(root, "report.json");
  const linkedPath = path.join(root, "linked.json");
  const environment = {
    GITHUB_ACTIONS: "true",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "2",
    GITHUB_JOB: "windows"
  };
  const valid = {
    schemaVersion: 1,
    domain: "all",
    shard: "main",
    startedAt: "2026-07-25T20:00:00.000Z",
    endedAt: "2026-07-25T20:00:01.000Z",
    durationMs: 1_000,
    runtime: {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version
    },
    ci: {
      provider: "github-actions",
      runId: "123",
      runAttempt: "2",
      job: "windows"
    },
    testFiles: [{
      test: "test/alpha.test.mjs",
      status: "passed",
      startedAt: "2026-07-25T20:00:00.000Z",
      endedAt: "2026-07-25T20:00:01.000Z",
      durationMs: 1_000
    }]
  };
  const validate = () => validateTestPerformanceReport(reportPath, {
    domain: "all",
    shard: "main",
    testNames: ["alpha.test.mjs"],
    environment
  });
  try {
    await fs.writeFile(reportPath, JSON.stringify(valid));
    await validate();

    for (const mutate of [
      (report) => { report.extra = true; },
      (report) => { report.runtime.architecture = "wrong"; },
      (report) => { report.ci.runAttempt = "1"; },
      (report) => { report.testFiles = []; }
    ]) {
      const malformed = structuredClone(valid);
      mutate(malformed);
      await fs.writeFile(reportPath, JSON.stringify(malformed));
      await assert.rejects(validate);
    }

    await fs.writeFile(reportPath, JSON.stringify(valid));
    await fs.link(reportPath, linkedPath);
    await assert.rejects(validate, /single-link/);
    await fs.unlink(linkedPath);

    await fs.writeFile(reportPath, "x".repeat((2 * 1024 * 1024) + 1));
    await assert.rejects(validate, /bounded/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
