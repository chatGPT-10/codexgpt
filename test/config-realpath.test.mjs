import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../dist/config.js';

test('configured root uses the canonical native real path', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-config-root-'));
  try {
    const expected = await fs.realpath(tmp);
    const config = loadConfig(['--root', tmp, '--bash', 'off', '--write', 'off']);
    assert.equal(config.defaultRoot, expected);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('configured Codex directory uses the canonical native real path when it exists', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-config-codex-dir-'));
  const codexDir = path.join(tmp, '.codex');
  await fs.mkdir(codexDir);
  try {
    const expected = await fs.realpath(codexDir);
    const config = loadConfig([
      '--root',
      tmp,
      '--codex-dir',
      codexDir,
      '--bash',
      'off',
      '--write',
      'off'
    ]);
    assert.equal(config.codexDir, expected);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
