import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const { runSpikeFixture, SPIKE_CAPABILITY_NAMES } = await import("../scripts/policy-windows-spike.mjs");

test("Windows spike uses only synthetic fixture facts and never returns a real user path", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-policy-spike-test-"));
  const calls = [];
  try {
    const report = await runSpikeFixture({
      fixtureRoot,
      platform: "win32",
      execute: async (probe) => {
        calls.push(probe.id);
        return { id: probe.id, outcome: probe.id === "workspace_read" ? "pass" : "blocked", detailCode: "synthetic" };
      }
    });
    assert.equal(report.fixtureRoot, "[synthetic fixture]");
    assert.equal(report.platform, "win32");
    assert.deepEqual(report.capabilities, [...SPIKE_CAPABILITY_NAMES]);
    assert.deepEqual(calls, [
      "workspace_read",
      "outside_read",
      "child_tree",
      "filtered_environment",
      "loopback_network"
    ]);
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(fixtureRoot), false);
    assert.equal(serialized.includes(process.env.USERPROFILE ?? "__absent__"), false);
    assert.equal(serialized.includes(process.env.HOME ?? "__absent__"), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("spike rejects non-temporary fixture roots and malformed executor results", async () => {
  await assert.rejects(
    runSpikeFixture({ fixtureRoot: process.cwd(), platform: "win32", execute: async (probe) => ({ id: probe.id, outcome: "pass", detailCode: "x" }) }),
    /temporary synthetic fixture/i
  );

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-policy-spike-test-"));
  try {
    await assert.rejects(
      runSpikeFixture({ fixtureRoot, platform: "win32", execute: async () => ({ id: "wrong", outcome: "pass", detailCode: "x" }) }),
      /probe result/i
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("spike capability summary remains conservative when probes do not prove isolation", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-policy-spike-test-"));
  try {
    const report = await runSpikeFixture({
      fixtureRoot,
      platform: "win32",
      execute: async (probe) => ({ id: probe.id, outcome: "blocked", detailCode: "synthetic" })
    });
    assert.equal(report.observed.filesystemReadBoundary, "none");
    assert.equal(report.observed.filesystemWriteBoundary, "none");
    assert.equal(report.observed.processTreeControl, "none");
    assert.equal(report.observed.networkEgressControl, "none");
    assert.equal(report.observed.environmentIsolation, "none");
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
