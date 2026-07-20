import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const previousNodeOptions = process.env.NODE_OPTIONS;
const previousShimNodeOptions = process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS;
const previousTemp = process.env.TEMP;
const previousTmp = process.env.TMP;

try {
  if (process.platform === 'win32') {
    const canonicalTemp = fs.realpathSync.native(os.tmpdir());
    process.env.TEMP = canonicalTemp;
    process.env.TMP = canonicalTemp;

    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const shimPath = path.join(scriptDir, 'windows-realpath-shim.cjs').replaceAll('\\', '/');
    const requireOption = `--require "${shimPath.replaceAll('"', '\\"')}"`;
    process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS = previousNodeOptions ?? '';
    process.env.NODE_OPTIONS = [previousNodeOptions, requireOption].filter(Boolean).join(' ');
  }

  await import('./execute-handoff-smoke.mjs');
} finally {
  if (previousNodeOptions === undefined) delete process.env.NODE_OPTIONS;
  else process.env.NODE_OPTIONS = previousNodeOptions;
  if (previousShimNodeOptions === undefined) delete process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS;
  else process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS = previousShimNodeOptions;
  if (previousTemp === undefined) delete process.env.TEMP;
  else process.env.TEMP = previousTemp;
  if (previousTmp === undefined) delete process.env.TMP;
  else process.env.TMP = previousTmp;
}
