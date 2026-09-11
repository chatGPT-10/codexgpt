// A transient launch constraint, never a saved workspace/OAuth profile or new mode.
const pinned = Object.freeze({
  mode: 'handoff', write: 'handoff', bash: 'off', 'tool-mode': 'standard', 'codex-sessions': 'off'
});
const values = new Set(['root', 'allow-root', 'host', 'port', 'tunnel', 'hostname', 'url',
  'cloudflared', 'tunnel-name', 'cloudflare-config', 'cloudflare-token-file', 'token']);
const switches = new Set(['help', 'no-profile', 'no-auth', 'no-copy-url', 'no-install-cloudflared',
  'print-env-only', 'no-save-config']);

export function prepareC2CLaunch(argv, environment = process.env) {
  if (argv[0] !== 'c2c') return { argv, environment };
  if (argv[1] !== 'start') throw new Error('C2C usage: codexgpt c2c start [--root <workspace>] [start connection options]');
  const forwarded = ['start'];
  for (let i = 2; i < argv.length; i++) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match) throw new Error('C2C accepts only named start options.');
    const [, key, inline] = match;
    if (switches.has(key)) {
      if (inline !== undefined) throw new Error(`C2C --${key} does not accept a value.`);
      forwarded.push(`--${key}`);
      continue;
    }
    if (!values.has(key) && !Object.hasOwn(pinned, key)) throw new Error(`C2C does not support --${key}.`);
    const value = inline ?? argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`C2C missing value for --${key}.`);
    if (Object.hasOwn(pinned, key)) {
      if (value !== pinned[key]) throw new Error(`C2C requires --${key} ${pinned[key]}.`);
    } else forwarded.push(`--${key}`, value);
  }
  for (const [key, value] of Object.entries(pinned)) forwarded.push(`--${key}`, value);
  forwarded.push('--no-save-config');
  return {
    argv: forwarded,
    environment: {
      ...environment,
      CODEXGPT_C2C_RUNTIME: '1',
      CODEXGPT_MODE: 'handoff', CODEXGPT_WRITE_MODE: 'handoff', CODEXGPT_BASH_MODE: 'off',
      CODEXGPT_TOOL_MODE: 'standard', CODEXGPT_CODEX_SESSIONS: 'off',
      CODEXGPT_EXECUTION_PROFILE: 'off', CODEXGPT_EXECUTION_DEPENDENCIES: 'off',
      CODEXGPT_GIT_MODE: 'read', CODEXGPT_GIT_INTEGRATIONS: 'off',
      CODEXGPT_CONTEXT_DIR: '.ai-bridge'
    }
  };
}
