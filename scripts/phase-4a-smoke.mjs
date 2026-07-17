#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTRACT_V1_CHILD_TOOLS,
  CONTRACT_V2_CHILD_TOOLS,
  CONTRACT_V3_CHILD_TOOLS
} from "../dist/tools/contracts/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "scripts", "windows-process-host-manifest.json"), "utf8"));
const digest = (relativePath) => createHash("sha256")
  .update(fs.readFileSync(path.join(root, relativePath)))
  .digest("hex");

assert.equal(CONTRACT_V1_CHILD_TOOLS.length, 28);
assert.equal(CONTRACT_V2_CHILD_TOOLS.length, 31);
assert.equal(CONTRACT_V3_CHILD_TOOLS.length, 39);
assert.equal(CONTRACT_V3_CHILD_TOOLS.includes("bash"), false);
assert.equal(manifest.productionCSharpSha256, digest(manifest.productionCSharp));
assert.equal(manifest.productionPowerShellSha256, digest(manifest.productionPowerShell));
assert.equal(manifest.conPtyWorkerSha256, digest(manifest.conPtyWorker));
assert.equal(manifest.conPtyProbeChildSha256, digest(manifest.conPtyProbeChild));
assert.equal(manifest.protocolSha256, digest(manifest.protocolAuthority));

process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  ok: true,
  contracts: { v1: 28, v2: 31, v3: 39 },
  nativeHost: "manifest_verified",
  conptyWorker: "manifest_verified",
  conptyProbeChild: "manifest_verified"
}) + "\n");
