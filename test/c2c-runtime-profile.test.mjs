import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareC2CLaunch } from '../scripts/c2c-runtime-profile.mjs';
import { tsImport } from 'tsx/esm/api';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { saveWorkspaceProfileFileSync } from '../scripts/workspace-profile-persistence.mjs';
const { loadConfig } = await tsImport('../src/config.ts', import.meta.url);

test('runtime marker is parsed and conflicting effective settings fail closed', () => {
  const { environment } = prepareC2CLaunch(['c2c', 'start'], {});
  const config = loadConfig(['--root', process.cwd(), '--no-profile'], { environment });
  assert.equal(config.c2cRuntime, true);
  for (const [key, value] of Object.entries({ WRITE_MODE: 'workspace', BASH_MODE: 'safe', TOOL_MODE: 'full', CODEX_SESSIONS: 'read', EXECUTION_PROFILE: 'full_access', GIT_MODE: 'local', CONTEXT_DIR: '.other' })) {
    assert.throws(() => loadConfig(['--root', process.cwd(), '--no-profile'], { environment: { ...environment, [`CODEXGPT_${key}`]: value } }), /C2C/);
  }
  assert.throws(() => loadConfig(['--root', process.cwd(), '--no-profile'], { environment: { ...environment, CODEXGPT_C2C_RUNTIME: 'true' } }), /C2C/);
});

test('C2C launch pins safety selectors without mutating caller inputs or credentials', () => {
  const argv = ['c2c', 'start', '--root', 'workspace', '--tunnel', 'none'];
  const env = { CODEXGPT_AUTH_MODE: 'oauth', CODEXGPT_EXECUTION_PROFILE: 'full_access', CODEXGPT_GIT_MODE: 'local' };
  const launch = prepareC2CLaunch(argv, env);
  assert.deepEqual(argv, ['c2c', 'start', '--root', 'workspace', '--tunnel', 'none']);
  assert.equal(env.CODEXGPT_EXECUTION_PROFILE, 'full_access');
  assert.equal(launch.argv[0], 'start');
  assert.equal(launch.environment.CODEXGPT_AUTH_MODE, 'oauth');
  for (const [key, value] of Object.entries({ C2C_RUNTIME: '1', MODE: 'handoff', WRITE_MODE: 'handoff', BASH_MODE: 'off', TOOL_MODE: 'standard', CODEX_SESSIONS: 'off', EXECUTION_PROFILE: 'off', GIT_MODE: 'read', GIT_INTEGRATIONS: 'off', CONTEXT_DIR: '.ai-bridge' })) {
    assert.equal(launch.environment[`CODEXGPT_${key}`], value);
  }
  assert.ok(launch.argv.includes('--no-save-config'));
});

for (const args of [[], ['resume'], ['start', '--mode', 'agent'], ['start', '--write=workspace'], ['start', '--bash=full'], ['start', '--codex-sessions-read'], ['start', '--execution-profile=full_access'], ['start', '--save-config'], ['start', '--install-cloudflared'], ['start', '--agent'], ['start', 'execute-handoff'], ['start', '--root'], ['start', '--unknown=x']]) {
  test(`C2C rejects unsupported or conflicting arguments ${JSON.stringify(args)}`, () => {
    assert.throws(() => prepareC2CLaunch(['c2c', ...args], {}), /C2C/);
  });
}

test('ordinary launcher invocation is unchanged', () => {
  const argv = ['start', '--mode', 'handoff']; const environment = { CODEXGPT_BASH_MODE: 'safe' };
  assert.deepEqual(prepareC2CLaunch(argv, environment), { argv, environment });
});

test('public C2C entry resolves hostile saved settings safely and preserves the profile', () => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-launch-')));
  try {
    const root = path.join(base, 'workspace'); const home = path.join(base, 'home');
    fs.mkdirSync(root); fs.mkdirSync(home);
    const profile = path.join(home, 'profiles', `${createHash('sha256').update(root).digest('hex').slice(0, 24)}.json`);
    saveWorkspaceProfileFileSync(profile, root, { mode: 'agent', write: 'workspace', bash: 'full', toolMode: 'full', codexSessions: 'read', tunnel: 'none' });
    const before = fs.readFileSync(profile);
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('CODEXGPT_') || key.startsWith('CODEBASE_BRIDGE_')) delete env[key];
    Object.assign(env, { CODEXGPT_HOME: home, CODEXGPT_EXECUTION_PROFILE: 'full_access', CODEXGPT_GIT_MODE: 'local', CODEXGPT_GIT_INTEGRATIONS: 'approved_full_access', CODEXGPT_CONTEXT_DIR: '.other', CODEXGPT_MODE: 'agent', CODEXGPT_BASH_MODE: 'full' });
    const output = execFileSync(process.execPath, ['scripts/codexgpt-entry.mjs', 'c2c', 'start', '--root', root, '--tunnel', 'none', '--no-auth', '--print-env-only'], { env, encoding: 'utf8', windowsHide: true, timeout: 20000 });
    const resolved = JSON.parse(output.slice(output.indexOf('{')));
    for (const [key, value] of Object.entries({ C2C_RUNTIME: '1', MODE: 'handoff', WRITE_MODE: 'handoff', BASH_MODE: 'off', TOOL_MODE: 'standard', CODEX_SESSIONS: 'off', EXECUTION_PROFILE: 'off', GIT_MODE: 'read', GIT_INTEGRATIONS: 'off', CONTEXT_DIR: '.ai-bridge' })) assert.equal(resolved[`CODEXGPT_${key}`], value);
    assert.deepEqual(fs.readFileSync(profile), before);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
