const childProcess = require('node:child_process');
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const path = require('node:path');

if (process.platform === 'win32' && fs.realpathSync?.native) {
  const nativeRealpathSync = fs.realpathSync.native.bind(fs.realpathSync);
  nativeRealpathSync.native = fs.realpathSync.native;
  fs.realpathSync = nativeRealpathSync;

  const originalSpawn = childProcess.spawn;
  const originalSpawnSync = childProcess.spawnSync;
  const inspectNodeScript = (candidate) => {
    try {
      if (!fs.statSync(candidate).isFile()) return '';
      if (/\.(?:c?js|mjs)$/i.test(candidate)) return candidate;
      return fs.readFileSync(candidate, 'utf8').slice(0, 64).includes('/usr/bin/env node') ? candidate : '';
    } catch {
      return '';
    }
  };
  const resolveCommandPath = (command, options) => {
    if (typeof command !== 'string') return '';
    if (fs.existsSync(command)) return command;
    if (command.includes('/') || command.includes('\\')) return '';
    const env = options?.env ?? process.env;
    const searchPath = env.PATH ?? env.Path ?? process.env.PATH ?? '';
    const extensions = (env.PATHEXT ?? process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter(Boolean);
    for (const directory of searchPath.split(path.delimiter).filter(Boolean)) {
      const exact = path.join(directory, command);
      if (fs.existsSync(exact)) return exact;
      if (!path.extname(command)) {
        for (const extension of extensions) {
          const candidate = `${exact}${extension.toLowerCase()}`;
          if (fs.existsSync(candidate)) return candidate;
          const upperCandidate = `${exact}${extension.toUpperCase()}`;
          if (fs.existsSync(upperCandidate)) return upperCandidate;
        }
      }
    }
    return '';
  };
  const quoteCmdArg = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const batchInvocation = (command, args, options) => ({
    command: options?.env?.ComSpec ?? process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', ['call', quoteCmdArg(command), ...args.map(quoteCmdArg)].join(' ')],
    options: { ...options, windowsVerbatimArguments: true }
  });

  childProcess.spawn = (command, args = [], options) => {
    const resolved = resolveCommandPath(command, options);
    const script = resolved ? inspectNodeScript(resolved) : '';
    if (script) return originalSpawn(process.execPath, [script, ...args], options);
    if (/\.(?:bat|cmd)$/i.test(resolved)) {
      const invocation = batchInvocation(resolved, args, options);
      return originalSpawn(invocation.command, invocation.args, invocation.options);
    }
    return originalSpawn(command, args, options);
  };
  childProcess.spawnSync = (command, args = [], options) => {
    const resolved = resolveCommandPath(command, options);
    const script = resolved ? inspectNodeScript(resolved) : '';
    if (script) return originalSpawnSync(process.execPath, [script, ...args], options);
    if (/\.(?:bat|cmd)$/i.test(resolved)) {
      const invocation = batchInvocation(resolved, args, options);
      return originalSpawnSync(invocation.command, invocation.args, invocation.options);
    }
    return originalSpawnSync(command, args, options);
  };
  syncBuiltinESMExports();
}

const previousNodeOptions = process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS;
if (previousNodeOptions) process.env.NODE_OPTIONS = previousNodeOptions;
else delete process.env.NODE_OPTIONS;
delete process.env.CODEXGPT_REALPATH_PREVIOUS_NODE_OPTIONS;
