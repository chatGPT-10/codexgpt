#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processCreationTime } from "../scripts/long-task-runner.mjs";
import { startWindowsProcessHostSpike } from "../scripts/windows-process-host-spike.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordPath = path.resolve(process.argv[2]);
const evidencePath = path.resolve(process.argv[3]);
const treeFixture = path.join(repositoryRoot, "fixtures", "native-host-process-tree-child.mjs");

async function waitForRecord() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await fs.readFile(recordPath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("TREE_RECORD_TIMEOUT");
}

const session = await startWindowsProcessHostSpike();
session.request("run", {
  executable: process.execPath,
  arguments: [treeFixture, "60000", recordPath],
  cwd: repositoryRoot,
  environment: {},
  stdinBase64: "",
  timeoutMs: 60000,
  stdoutLimitBytes: 4096,
  stderrLimitBytes: 4096
}, { timeoutMs: 65000 }).catch(() => {});
const tree = await waitForRecord();
const hostCreationTime = await processCreationTime(session.child.pid);
await fs.writeFile(evidencePath, `${JSON.stringify({
  controllerPid: process.pid,
  hostPid: session.child.pid,
  hostCreationTime,
  hostTempRoot: session.tempRoot,
  tree
})}\n`, { encoding: "utf8", flag: "wx" });
process.exit(0);
