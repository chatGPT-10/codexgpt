#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { createOwnedTempEnvironment } from "./owned-temp-root.mjs";

const argv = process.argv.slice(2);
const separator = argv.indexOf("--");
const wrapperArgv = separator === -1 ? argv : argv.slice(0, separator);

function option(name, fallback) {
  const index = wrapperArgv.indexOf(name);
  return index === -1 ? fallback : wrapperArgv[index + 1];
}

function fail(message, code = 2) {
  console.error(message);
  process.exitCode = code;
}

if (separator === -1 || separator === argv.length - 1) {
  fail("Usage: node scripts/run-with-cleanup.mjs [--purpose <name>] [--base-root <dir>] [--cwd <dir>] -- <command> [args...]");
} else {
  const command = argv.slice(separator + 1);
  const purpose = option("--purpose", "task");
  const baseRoot = option("--base-root");
  const cwd = path.resolve(option("--cwd", process.cwd()));
  const ownedTemp = await createOwnedTempEnvironment(purpose, {
    ...(baseRoot ? { baseRoot } : {}),
    hostEnvironment: process.env
  });

  let child;
  let outcome;
  const signalExitCodes = new Map([["SIGINT", 130], ["SIGTERM", 143]]);
  let requestedSignal;
  let forceTimer;
  const forwardSignal = (signal) => {
    requestedSignal ??= signal;
    if (!child) return;
    try {
      child.kill(signal);
      forceTimer ??= setTimeout(() => {
        try {
          child?.kill("SIGKILL");
        } catch {
          // Cleanup reports any remaining locked temporary state.
        }
      }, 5_000);
      forceTimer.unref();
    } catch {
      // Cleanup still runs; child termination failure is reflected by its eventual outcome.
    }
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    try {
      child = spawn(command[0], command.slice(1), {
        cwd,
        env: ownedTemp.environment,
        shell: false,
        windowsHide: true,
        stdio: "inherit"
      });
      if (requestedSignal) forwardSignal(requestedSignal);
      outcome = await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        child.once("error", (error) => finish({ code: 127, signal: null, error }));
        child.once("close", (code, signal) => finish({ code: code ?? 1, signal, error: null }));
      });
    } catch (error) {
      outcome = { code: 127, signal: null, error };
    }
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    if (forceTimer) clearTimeout(forceTimer);
    try {
      await ownedTemp.cleanup();
    } catch (error) {
      console.error(`Owned task temporary state could not be removed: ${error?.code ?? error?.message ?? "unknown"}`);
      if (!outcome || outcome.code === 0) outcome = { code: 1, signal: null, error };
    }
  }

  if (outcome?.error) console.error(outcome.error.stack ?? outcome.error.message ?? String(outcome.error));
  process.exitCode = requestedSignal
    ? signalExitCodes.get(requestedSignal) ?? 1
    : outcome?.code ?? 1;
}
