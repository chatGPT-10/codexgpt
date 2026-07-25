import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const testRoot = path.join(repositoryRoot, "test");
const REPORT_MAX_BYTES = 2 * 1024 * 1024;

function boundedLabel(value, fallback = "unknown") {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) return fallback;
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : fallback;
}

function relativeTestPath(file) {
  if (typeof file !== "string" || file.length === 0) return null;
  let absolutePath;
  try {
    absolutePath = file.startsWith("file:") ? fileURLToPath(file) : path.resolve(repositoryRoot, file);
  } catch {
    return null;
  }
  const relative = path.relative(testRoot, absolutePath);
  if (
    relative.length === 0 ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative) ||
    !relative.endsWith(".test.mjs")
  ) {
    return null;
  }
  return `test/${relative.split(path.sep).join("/")}`;
}

function iso(timestamp) {
  return new Date(timestamp).toISOString();
}

function identity(stat) {
  return `${stat.dev}:${stat.ino}`;
}

function stableFacts(stat) {
  return `${identity(stat)}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

async function inspectDirectory(target, expectedRoot, expectedRelative) {
  const stat = await fsp.lstat(target, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Performance path must be a real directory: ${expectedRelative}`);
  }
  const real = await fsp.realpath(target);
  const relative = path.relative(expectedRoot, real).split(path.sep).join("/");
  if (relative !== expectedRelative) {
    throw new Error(`Performance path escaped the repository: ${expectedRelative}`);
  }
  return { path: target, real, identity: identity(stat) };
}

async function createDirectory(target) {
  try {
    await fsp.mkdir(target);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
}

export async function prepareTestPerformanceDirectory(root = repositoryRoot) {
  const rootReal = await fsp.realpath(root);
  const bridge = path.join(root, ".ai-bridge");
  const performance = path.join(bridge, "performance");
  await createDirectory(bridge);
  const bridgeState = await inspectDirectory(bridge, rootReal, ".ai-bridge");
  await createDirectory(performance);
  const performanceState = await inspectDirectory(performance, rootReal, ".ai-bridge/performance");
  return { rootReal, bridge: bridgeState, performance: performanceState };
}

export async function verifyTestPerformanceDirectory(state) {
  const bridge = await inspectDirectory(state.bridge.path, state.rootReal, ".ai-bridge");
  const performance = await inspectDirectory(
    state.performance.path,
    state.rootReal,
    ".ai-bridge/performance"
  );
  if (bridge.identity !== state.bridge.identity || performance.identity !== state.performance.identity) {
    throw new Error("Performance directory identity changed while tests were running.");
  }
}

function exactKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unexpected fields.`);
  }
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

export async function validateTestPerformanceReport(
  reportPath,
  {
    domain,
    shard,
    testNames,
    platform = process.platform,
    nodeVersion = process.version,
    environment = process.env
  }
) {
  const handle = await fsp.open(reportPath, "r");
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size <= 0n || before.size > BigInt(REPORT_MAX_BYTES)) {
      throw new Error("Performance report must be one bounded single-link regular file.");
    }
    const buffer = Buffer.alloc(REPORT_MAX_BYTES + 1);
    let loaded = 0;
    while (loaded < buffer.length) {
      const { bytesRead } = await handle.read(buffer, loaded, buffer.length - loaded, loaded);
      if (bytesRead === 0) break;
      loaded += bytesRead;
    }
    if (loaded > REPORT_MAX_BYTES) throw new Error("Performance report exceeded its read bound.");
    const text = buffer.subarray(0, loaded).toString("utf8");
    const after = await handle.stat({ bigint: true });
    if (stableFacts(before) !== stableFacts(after) || BigInt(loaded) !== after.size) {
      throw new Error("Performance report stable facts changed while it was read.");
    }
    const report = JSON.parse(text);
    exactKeys(
      report,
      ["schemaVersion", "domain", "shard", "startedAt", "endedAt", "durationMs", "runtime", "ci", "testFiles"],
      "Performance report"
    );
    if (report.schemaVersion !== 1 || report.domain !== domain || report.shard !== shard) {
      throw new Error("Performance report context does not match the test invocation.");
    }
    if (
      !Number.isFinite(Date.parse(report.startedAt)) ||
      !Number.isFinite(Date.parse(report.endedAt)) ||
      !Number.isFinite(report.durationMs) ||
      report.durationMs < 0
    ) {
      throw new Error("Performance report has invalid aggregate timing metadata.");
    }
    exactKeys(report.runtime, ["platform", "architecture", "nodeVersion"], "Performance runtime");
    if (
      report.runtime.platform !== platform ||
      report.runtime.architecture !== process.arch ||
      report.runtime.nodeVersion !== nodeVersion
    ) {
      throw new Error("Performance report runtime does not match the test process.");
    }
    if (report.ci !== null) {
      exactKeys(report.ci, ["provider", "runId", "runAttempt", "job"], "Performance CI context");
      if (
        report.ci.provider !== "github-actions" ||
        [report.ci.runId, report.ci.runAttempt, report.ci.job]
          .some((value) => boundedLabel(value) !== value)
      ) {
        throw new Error("Performance report contains invalid CI context.");
      }
    }
    if (environment.GITHUB_ACTIONS === "true") {
      const expectedCi = {
        provider: "github-actions",
        runId: boundedLabel(environment.GITHUB_RUN_ID),
        runAttempt: boundedLabel(environment.GITHUB_RUN_ATTEMPT),
        job: boundedLabel(environment.GITHUB_JOB)
      };
      if (
        Object.values(expectedCi).includes("unknown") ||
        report.ci === null ||
        Object.entries(expectedCi).some(([key, value]) => report.ci[key] !== value)
      ) {
        throw new Error("Performance report does not match the current GitHub Actions context.");
      }
    }
    if (!Array.isArray(report.testFiles)) throw new Error("Performance testFiles must be an array.");
    const expected = new Set(testNames.map((name) => `test/${name}`));
    const actual = new Set();
    for (const entry of report.testFiles) {
      exactKeys(entry, ["test", "status", "startedAt", "endedAt", "durationMs"], "Performance test file");
      if (!expected.has(entry.test) || actual.has(entry.test) || path.isAbsolute(entry.test)) {
        throw new Error("Performance report contains an unexpected or duplicate test path.");
      }
      if (!["passed", "failed"].includes(entry.status)) {
        throw new Error("Performance report contains an invalid test status.");
      }
      if (
        !Number.isFinite(Date.parse(entry.startedAt)) ||
        !Number.isFinite(Date.parse(entry.endedAt)) ||
        !Number.isFinite(entry.durationMs) ||
        entry.durationMs < 0
      ) {
        throw new Error("Performance report contains invalid timing metadata.");
      }
      actual.add(entry.test);
    }
    if (actual.size !== expected.size) throw new Error("Performance report is missing test files.");
    return report;
  } finally {
    await handle.close();
  }
}

export function createTestPerformanceReporter({
  now = Date.now,
  environment = process.env,
  platform = process.platform,
  architecture = process.arch,
  nodeVersion = process.version
} = {}) {
  return async function* testPerformanceReporter(source) {
    const files = new Map();
    let reportStartedAt = null;
    let reportEndedAt = null;

    for await (const event of source) {
      const timestamp = now();
      reportStartedAt ??= timestamp;
      reportEndedAt = timestamp;
      const test = relativeTestPath(event?.data?.file);
      if (test === null) continue;

      const current = files.get(test) ?? {
        test,
        status: "unknown",
        firstObservedAt: timestamp,
        startedAt: null,
        endedAt: null,
        lastObservedAt: timestamp
      };
      current.lastObservedAt = timestamp;
      if (event.type === "test:dequeue") current.startedAt ??= timestamp;
      if (event.type === "test:complete") current.endedAt = timestamp;
      if (event.type === "test:fail") current.status = "failed";
      if (event.type === "test:pass" && current.status !== "failed") current.status = "passed";
      files.set(test, current);
    }

    const testFiles = [...files.values()]
      .map((entry) => {
        const startedAt = entry.startedAt ?? entry.firstObservedAt;
        const endedAt = entry.endedAt ?? entry.lastObservedAt;
        return {
          test: entry.test,
          status: entry.status,
          startedAt: iso(startedAt),
          endedAt: iso(endedAt),
          durationMs: Math.max(0, endedAt - startedAt)
        };
      })
      .sort((left, right) => right.durationMs - left.durationMs || left.test.localeCompare(right.test));

    const githubActions = environment.GITHUB_ACTIONS === "true";
    const report = {
      schemaVersion: 1,
      domain: boundedLabel(environment.CODEXGPT_TEST_PERFORMANCE_DOMAIN),
      shard: boundedLabel(environment.CODEXGPT_TEST_PERFORMANCE_SHARD),
      startedAt: reportStartedAt === null ? null : iso(reportStartedAt),
      endedAt: reportEndedAt === null ? null : iso(reportEndedAt),
      durationMs: reportStartedAt === null ? 0 : Math.max(0, reportEndedAt - reportStartedAt),
      runtime: {
        platform,
        architecture,
        nodeVersion
      },
      ci: githubActions
        ? {
            provider: "github-actions",
            runId: boundedLabel(environment.GITHUB_RUN_ID),
            runAttempt: boundedLabel(environment.GITHUB_RUN_ATTEMPT),
            job: boundedLabel(environment.GITHUB_JOB)
          }
        : null,
      testFiles
    };
    yield `${JSON.stringify(report, null, 2)}\n`;
  };
}

export default createTestPerformanceReporter();
