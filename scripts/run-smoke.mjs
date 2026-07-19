#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOwnedTempEnvironment } from "./owned-temp-root.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const smokeScripts = Object.freeze([
  "analysis-smoke.mjs",
  "analysis-cli-smoke.mjs",
  "smoke-platform-compat.mjs",
  "http-smoke-compat.mjs",
  "pro-smoke.mjs",
  "doctor-smoke.mjs",
  "settings-smoke-platform-compat.mjs",
  "execute-handoff-smoke-platform-compat.mjs"
]);

function runScript(script, environment) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(scriptDirectory, script)], {
      cwd: repositoryRoot,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: "inherit"
    });
    child.once("error", (error) => {
      console.error(error.stack ?? error.message);
      resolve(127);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
}

const suiteTemp = await createOwnedTempEnvironment("smoke-suite");
let exitCode = 0;
try {
  for (const script of smokeScripts) {
    exitCode = await runScript(script, suiteTemp.environment);
    if (exitCode !== 0) break;
  }
} finally {
  try {
    await suiteTemp.cleanup();
  } catch (error) {
    console.error(`Owned smoke temporary state could not be removed: ${error?.code ?? error?.message ?? "unknown"}`);
    if (exitCode === 0) exitCode = 1;
  }
}
process.exitCode = exitCode;
