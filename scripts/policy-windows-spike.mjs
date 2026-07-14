#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SPIKE_CAPABILITY_NAMES = Object.freeze([
  "filesystemReadBoundary",
  "filesystemWriteBoundary",
  "processTreeControl",
  "networkEgressControl",
  "environmentIsolation"
]);

const PROBES = Object.freeze([
  Object.freeze({ id: "workspace_read", capability: "filesystemReadBoundary" }),
  Object.freeze({ id: "outside_read", capability: "filesystemWriteBoundary" }),
  Object.freeze({ id: "child_tree", capability: "processTreeControl" }),
  Object.freeze({ id: "filtered_environment", capability: "environmentIsolation" }),
  Object.freeze({ id: "loopback_network", capability: "networkEgressControl" })
]);

function isSubpath(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSyntheticFixtureRoot(fixtureRoot) {
  const resolved = path.resolve(fixtureRoot);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!isSubpath(resolved, temporaryRoot) || resolved === temporaryRoot || !path.basename(resolved).startsWith("codexpro-")) {
    throw new Error("Windows spike requires a temporary synthetic fixture root.");
  }
  return resolved;
}

function validateProbeResult(probe, result) {
  if (
    !result ||
    result.id !== probe.id ||
    !["pass", "blocked", "unavailable", "error"].includes(result.outcome) ||
    typeof result.detailCode !== "string" ||
    !/^[A-Za-z0-9._-]{1,80}$/.test(result.detailCode)
  ) {
    throw new Error(`Windows spike probe result is invalid for ${probe.id}.`);
  }
  return Object.freeze({
    id: probe.id,
    capability: probe.capability,
    outcome: result.outcome,
    detailCode: result.detailCode
  });
}

function conservativeObserved(results) {
  const byId = new Map(results.map((result) => [result.id, result]));
  return Object.freeze({
    filesystemReadBoundary: byId.get("workspace_read")?.outcome === "pass" && byId.get("outside_read")?.outcome === "blocked"
      ? "brokered"
      : "none",
    filesystemWriteBoundary: "none",
    processTreeControl: byId.get("child_tree")?.outcome === "pass" ? "best_effort" : "none",
    networkEgressControl: "none",
    environmentIsolation: byId.get("filtered_environment")?.outcome === "pass" ? "filtered" : "none"
  });
}

export async function runSpikeFixture({ fixtureRoot, platform = process.platform, execute }) {
  if (typeof execute !== "function") throw new Error("Windows spike requires an executor.");
  assertSyntheticFixtureRoot(fixtureRoot);
  const results = [];
  for (const probe of PROBES) {
    results.push(validateProbeResult(probe, await execute(probe)));
  }
  return Object.freeze({
    schemaVersion: 1,
    platform,
    fixtureRoot: "[synthetic fixture]",
    capabilities: [...SPIKE_CAPABILITY_NAMES],
    observed: conservativeObserved(results),
    probes: results,
    persistentHostChanges: false
  });
}

async function defaultExecutor(fixtureRoot, probe) {
  switch (probe.id) {
    case "workspace_read": {
      const value = await fs.readFile(path.join(fixtureRoot, "workspace", "inside.txt"), "utf8");
      return { id: probe.id, outcome: value === "synthetic-inside\n" ? "pass" : "error", detailCode: "fixture-read" };
    }
    case "outside_read": {
      try {
        await fs.readFile(path.join(fixtureRoot, "outside", "outside.txt"), "utf8");
        return { id: probe.id, outcome: "unavailable", detailCode: "no-boundary" };
      } catch {
        return { id: probe.id, outcome: "blocked", detailCode: "read-blocked" };
      }
    }
    case "child_tree":
      return { id: probe.id, outcome: "unavailable", detailCode: "not-probed" };
    case "filtered_environment":
      return { id: probe.id, outcome: "unavailable", detailCode: "not-isolated" };
    case "loopback_network":
      return { id: probe.id, outcome: "unavailable", detailCode: "not-enforced" };
    default:
      return { id: probe.id, outcome: "error", detailCode: "unknown-probe" };
  }
}

async function main() {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-policy-spike-"));
  try {
    await fs.mkdir(path.join(fixtureRoot, "workspace"), { recursive: true });
    await fs.mkdir(path.join(fixtureRoot, "outside"), { recursive: true });
    await fs.writeFile(path.join(fixtureRoot, "workspace", "inside.txt"), "synthetic-inside\n", "utf8");
    await fs.writeFile(path.join(fixtureRoot, "outside", "outside.txt"), "synthetic-outside\n", "utf8");
    const report = await runSpikeFixture({
      fixtureRoot,
      platform: process.platform,
      execute: (probe) => defaultExecutor(fixtureRoot, probe)
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
