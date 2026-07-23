import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const previousNodeOptions = process.env.NODE_OPTIONS;
const previousShimNodeOptions = process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS;
const previousTemp = process.env.TEMP;
const previousTmp = process.env.TMP;
const previousGuidanceMode = process.env.CODEXGPT_GUIDANCE_MODE;
const originalSpawn = childProcess.spawn;

function removeRuntimeStatusForPid(home, pid) {
  if (!home || !pid) return;
  const runtimeDir = path.join(home, 'runtime');
  if (!fs.existsSync(runtimeDir)) return;
  for (const name of fs.readdirSync(runtimeDir)) {
    if (!name.endsWith('.json')) continue;
    const filePath = path.join(runtimeDir, name);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data?.pid === pid) fs.rmSync(filePath, { force: true });
    } catch {
      // Ignore unrelated or partially written test status files.
    }
  }
}

function removeQuickTunnelCredentials(argsLogPath) {
  if (!argsLogPath || !fs.existsSync(argsLogPath)) return;
  try {
    const args = JSON.parse(fs.readFileSync(argsLogPath, 'utf8'));
    const index = Array.isArray(args) ? args.indexOf('--credentials-file') : -1;
    const credentialsPath = index >= 0 ? args[index + 1] : undefined;
    if (credentialsPath) fs.rmSync(path.dirname(credentialsPath), { recursive: true, force: true });
  } catch {
    // Ignore test-only cleanup when the fake tunnel did not record arguments.
  }
}

try {
  process.env.CODEXGPT_GUIDANCE_MODE = 'legacy';
  if (process.platform === 'win32') {
    const canonicalTemp = fs.realpathSync.native(os.tmpdir());
    process.env.TEMP = canonicalTemp;
    process.env.TMP = canonicalTemp;
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const shimPath = path.join(scriptDir, 'windows-realpath-shim.cjs').replaceAll('\\', '/');
    const requireOption = `--require "${shimPath.replaceAll('"', '\\"')}"`;
    process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS = previousNodeOptions ?? '';
    process.env.NODE_OPTIONS = [previousNodeOptions, requireOption].filter(Boolean).join(' ');
    childProcess.spawn = (...args) => {
      const options = args[2] ?? {};
      const child = originalSpawn(...args);
      const home = options.env?.CODEXGPT_HOME;
      const originalKill = child.kill.bind(child);
      child.kill = (signal) => {
        if (signal === 'SIGTERM') {
          removeRuntimeStatusForPid(home, child.pid);
          removeQuickTunnelCredentials(options.env?.CODEXGPT_FAKE_CLOUDFLARED_ARGS);
        }
        return originalKill(signal);
      };
      return child;
    };
    syncBuiltinESMExports();
  }

  await import('./settings-smoke.mjs');
} finally {
  childProcess.spawn = originalSpawn;
  syncBuiltinESMExports();
  if (previousNodeOptions === undefined) delete process.env.NODE_OPTIONS;
  else process.env.NODE_OPTIONS = previousNodeOptions;
  if (previousShimNodeOptions === undefined) delete process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS;
  else process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS = previousShimNodeOptions;
  if (previousTemp === undefined) delete process.env.TEMP;
  else process.env.TEMP = previousTemp;
  if (previousTmp === undefined) delete process.env.TMP;
  else process.env.TMP = previousTmp;
  if (previousGuidanceMode === undefined) delete process.env.CODEXGPT_GUIDANCE_MODE;
  else process.env.CODEXGPT_GUIDANCE_MODE = previousGuidanceMode;
}
