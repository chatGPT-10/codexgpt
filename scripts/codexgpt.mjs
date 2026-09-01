#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cloudflaredTunnelArgs } from './cloudflared-installer.mjs';
import {
  createConfigExplanation,
  explainInput,
  formatConfigExplanationText
} from './config-explain.mjs';
import { createFixedAddressLookup, resolvePublicProbeAddress } from './oauth-admin.mjs';
import { boundedTextArtifact, trimUtf8Bytes } from './output-bounds.mjs';
import { createOwnedTempRootSync } from './owned-temp-root.mjs';
import {
  parseWorkspaceProfileJson,
  WorkspaceProfileValidationError
} from './workspace-profile-schema.mjs';
import {
  deleteWorkspaceProfileFilesSync,
  saveWorkspaceProfileFileSync
} from './workspace-profile-persistence.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNTRACKED_FILE_HASH_BYTES = 64 * 1024;
const UNTRACKED_SYMLINK_TARGET_BYTES = 512;

function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version;
}

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function usage() {
  console.log(`CodexGPT easy launcher

Usage:
  npm install -g codexgpt
  codexgpt setup
  codexgpt start
  codexgpt start --root /path/to/repo
  codexgpt settings
  codexgpt config explain [--json]
  codexgpt semantic status [--verbose]
  codexgpt semantic use builtin|none
  codexgpt semantic disable
  codexgpt doctor [--json]
  codexgpt auth setup --root /path/to/repo --hostname mcp.example.com --tunnel-name codexgpt
  codexgpt auth status --root /path/to/repo
  codexgpt auth pending|open|clients --root /path/to/repo
  codexgpt auth approve|deny <correlation-code> --root /path/to/repo
  codexgpt auth rollback --root /path/to/repo
  codexgpt approvals list --server <server_id>
  codexgpt approvals watch --server <server_id>
  codexgpt approvals approve <approval_id> --server <server_id>
  codexgpt approvals deny <approval_id> --server <server_id>
  codexgpt oauth-authorizations list --server <server_id>
  codexgpt oauth-authorizations approve <pending_id> --server <server_id>
  codexgpt oauth-authorizations deny <pending_id> --server <server_id>
  codexgpt oauth-clients list --server <server_id>
  codexgpt oauth-clients revoke <client_id> --server <server_id>
  codexgpt oauth-grants list --server <server_id>
  codexgpt oauth-grants revoke <grant_id> --server <server_id>
  codexgpt oauth-grants revoke-owner --server <server_id>
  codexgpt processes list --server <server_id>
  codexgpt processes terminate <process_id> --server <server_id>
  codexgpt connection-test --root /path/to/repo
  codexgpt inspect --root /path/to/repo [--json]
  codexgpt review --root /path/to/repo [--staged] [--path src/file.ts] [--json]
  codexgpt execute-handoff --agent opencode --model provider/model
  codexgpt watch-handoff --agent opencode --model provider/model
  codexgpt loop-handoff --agent opencode --model provider/model --review-command "node ./reviewer.js --status {{status_file}} --diff {{diff_file}} --plan-file {{plan_file}}"
  codexgpt --root /path/to/repo
  codexgpt ngrok --hostname your-domain.ngrok-free.dev
  codexgpt tailscale --hostname your-device.your-tailnet.ts.net
  codexgpt stable --hostname codexgpt.example.com --tunnel-name codexgpt
  codexgpt pro-bundle --root /path/to/repo --copy
  codexgpt pro-apply --root /path/to/repo --file plan.md
  codexgpt install-cloudflared
  npm run connect -- --root /path/to/repo
  node scripts/codexgpt-entry.mjs --root /path/to/repo --tunnel cloudflare

Options:
  --root <dir>              Workspace root. Default: current directory.
  --from-root <dir>         Copy saved settings from another workspace with settings use.
  --allow-root <dir>        Additional allowed root. Can be repeated.
  --allow-home              Allow opening any workspace under your home directory.
  --mode <agent|handoff|pro>
                             Default: agent.
                             agent = ChatGPT can read, write/edit/apply_patch files, search, and run safe bash.
                             handoff = ChatGPT writes .ai-bridge plans for a local implementation agent.
                             pro = export context for models that cannot call MCP tools.
  --agent                   Shortcut for --mode agent.
  --handoff                 Shortcut for --mode handoff.
  --pro-planning            Shortcut for --mode pro.
  --host <host>             Local bind host. Default: 127.0.0.1.
  --port <port>             Local port. Default: 8787.
  --bash <off|safe|full>    Bash mode. Default: safe.
  --no-bash                 Shortcut for --bash off.
  --bash-transcript <compact|full>
                             Chat transcript for bash results. Default: compact.
                             full prints raw stdout/stderr in chat.
  --full-bash-transcript    Shortcut for --bash-transcript full.
  --bash-session <id>       Local bash session label exposed to ChatGPT.
  --require-bash-session    Require bash calls to include matching session_id.
  --codex-sessions <off|metadata|read>
                             Opt in to read local ~/.codex session history.
                             metadata lists ids/titles/cwd; read allows bounded transcript reads.
  --codex-dir <dir>          Codex config/session directory. Default: ~/.codex.
  --write <off|handoff|workspace>
                             Write mode. Default: workspace in agent mode, handoff otherwise.
                             handoff = no generic write/edit/apply_patch tools; handoff tools write bounded .ai-bridge files.
  --tool-mode <minimal|standard|full>
                             Tool surface exposed to ChatGPT. Default: standard.
                             minimal = config/self-test plus open/read/write/edit/apply_patch/bash/show_changes.
                             full = expose every compatibility and advanced tool.
  --widget-domain <origin>   Dedicated HTTPS origin for ChatGPT widget iframes.
                             Required for app submission. Default: https://rebel0789.github.io.
  --tool-cards <on|off>      Opt in to ChatGPT widget metadata on tool descriptors. Default: off.
  --tunnel <none|cloudflare|cloudflare-named|ngrok|tailscale>
                             Expose local MCP. Default: cloudflare.
                             cloudflare = quick tunnel with a new URL each restart.
                             cloudflare-named = stable hostname using a named tunnel.
                             ngrok = stable ngrok dev-domain endpoint using --hostname/--url.
                             tailscale = Tailscale Funnel using --hostname/--url.
  --stable                  Shortcut for --tunnel cloudflare-named.
  --hostname <host>          Stable public hostname for cloudflare-named, ngrok, or tailscale.
  --url <url>                Alias for --hostname in stable URL modes.
  --tunnel-name <name>       Existing Cloudflare named tunnel to run.
  --cloudflare-token <token> Cloudflare Tunnel token for this launch only; not saved by settings set.
  --cloudflare-token-file <path>
                             File containing a Cloudflare Tunnel token.
  --cloudflare-config <path> cloudflared YAML config for a named tunnel.
  --token <token>           Bearer token for HTTP MCP. Auto-generated for tunnels.
  --cloudflared <path>      cloudflared executable. Default: PATH, then ~/.codexgpt/bin.
  --ngrok <path>            ngrok executable. Default: PATH.
  --ngrok-config <path>     Optional ngrok config file path.
  --tailscale <path>        tailscale executable. Default: PATH.
  --no-profile              Do not load a saved ~/.codexgpt workspace profile.
  --save-config             Save setup choices for this workspace when using setup.
  --no-save-config          Do not save setup choices when using setup.
  --yes                     Confirm settings delete/reset without prompting.
  --install-cloudflared     Install/reinstall cloudflared into ~/.codexgpt/bin.
  --no-install-cloudflared  Do not auto-install cloudflared when missing.
  --copy-url                Copy the ChatGPT Server URL to clipboard. Default for public HTTPS URLs.
  --no-copy-url             Do not copy the Server URL.
  --open-chatgpt            Open ChatGPT connector settings after the URL is ready.
  --no-auth                 Disable bearer-token auth. Only allowed with --tunnel none.
  --log-requests            Print redacted HTTP request and tool-call logs from the local MCP server.
  connection-test           Start a read-only connector with request logging and no bash or tool cards.
  --print-env               Print the environment used to launch the server.
  --version, -v             Print the CodexGPT version.
  --help                    Show this message.

Execute handoff options:
  codexgpt execute-handoff --agent opencode --model provider/model
  codexgpt execute-handoff --agent pi --model provider/model
  codexgpt execute-handoff --agent custom --command "my-agent --task-file {{plan_file}}"
  --agent <opencode|pi|codex|custom>
                             Local implementation agent adapter.
  --model <provider/model>  Optional model name passed to the adapter.
  --command <template>      Custom command template. Supports {{model}}, {{plan_file}}, {{plan_text}}, {{root}}.
  --dry-run                 Print the command that would run without executing it.
  --timeout-ms <ms>         Execution timeout. Default: 600000.
  --max-output-bytes <n>    Max stdout/stderr excerpt bytes per stream. Default: 120000.
  --context-dir <dir>       Handoff directory. Default: .ai-bridge.
  --yes                     Run without interactive confirmation.

Watch handoff options:
  codexgpt watch-handoff --agent opencode --model provider/model
  codexgpt watch-handoff --agent pi --model provider/model
  codexgpt watch-handoff --agent custom --command "my-agent --task-file {{plan_file}}"
  --once                    Exit after checking/running one new plan.
  --poll-interval-ms <ms>   Poll interval. Default: 2000.
  --debounce-ms <ms>        Wait for plan file stability. Default: 500.
  --state-file <path>       Watch state file. Default: .ai-bridge/watch-handoff-state.json.
  --yes                     Start automatic local execution without startup confirmation.

Loop handoff options:
  codexgpt loop-handoff --agent opencode --model provider/model --review-command "reviewer --status {{status_file}} --diff {{diff_file}} --plan-file {{plan_file}}"
  --review-command <template>
                             Local reviewer/orchestrator command. It should print CODEXGPT_REVIEW=PASS or CODEXGPT_REVIEW=FAIL.
                             On FAIL it must update .ai-bridge/current-plan.md before the next iteration.
  --max-iters <n>           Maximum execute/review iterations. Default: 3.
  --run-tests <template>    Optional local verification command before review.
  --allow-implicit-review-verdict
                             Infer PASS/FAIL from reviewer exit code and plan changes when no CODEXGPT_REVIEW line is printed.
  --allow-review-pass-on-failure
                             Let explicit reviewer PASS override a failed executor or failed test command.
  --require-clean-git-start Refuse to start unless git status is clean.
  --stop-if-no-files-changed
                             Stop if an executor iteration produces no git diff.
  --stop-if-same-diff       Stop if an executor iteration repeats the previous diff.
  --require-human-confirmation
                             Ask before running a reviewer-generated follow-up plan.
  --dry-run                 Print executor/reviewer/test commands without executing them.
  --yes                     Start the local loop without startup confirmation.

Default agent mode:
  codexgpt start --root /path/to/repo

Guided setup:
  codexgpt setup

Workspace settings:
  codexgpt settings
  codexgpt settings show
  codexgpt settings list
  codexgpt settings set --tunnel ngrok --hostname your-domain.ngrok-free.dev
  codexgpt settings use
  codexgpt settings delete --yes

Configuration explanation (read-only; secrets show only set/missing):
  codexgpt config explain --root /path/to/repo
  codexgpt config explain auth.mode --root /path/to/repo --json

Preflight diagnostics:
  codexgpt doctor
  codexgpt doctor --json

Ngrok stable URL mode:
  codexgpt ngrok --root /path/to/repo --hostname your-domain.ngrok-free.dev

Tailscale Funnel mode:
  codexgpt tailscale --root /path/to/repo --hostname your-device.your-tailnet.ts.net

Planning-only handoff mode:
  codexgpt start --root /path/to/repo --mode handoff

Execute a local handoff after ChatGPT writes .ai-bridge/current-plan.md:
  codexgpt execute-handoff --agent opencode --model provider/model
  codexgpt execute-handoff --agent pi --model provider/model
  codexgpt execute-handoff --agent custom --command "node ./agent.js --task-file {{plan_file}}" --yes

Watch for new handoff plans and execute them locally:
  codexgpt watch-handoff --agent opencode --model provider/model --yes
  codexgpt watch-handoff --agent custom --command "node ./agent.js --task-file {{plan_file}}" --yes

Run a bounded local execute/review loop:
  codexgpt loop-handoff --agent opencode --model provider/model --review-command "node ./reviewer.js --status {{status_file}} --diff {{diff_file}} --plan-file {{plan_file}}" --max-iters 3 --yes

Stable URL mode after one-time Cloudflare tunnel setup:
  codexgpt stable --root /path/to/repo --hostname codexgpt.example.com --tunnel-name codexgpt
`);
}

const colorEnabled = process.stdout.isTTY && !process.env.NO_COLOR;
const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function paint(style, text) {
  if (!colorEnabled) return text;
  return `${ansi[style] ?? ''}${text}${ansi.reset}`;
}

function termWidth(max = 78) {
  return Math.max(56, Math.min(max, process.stdout.columns || max));
}

function divider(label = '') {
  const width = termWidth();
  if (!label) return paint('dim', '-'.repeat(width));
  const text = ` ${label} `;
  return paint('dim', `${text}${'-'.repeat(Math.max(0, width - text.length))}`);
}

function printBox(title, lines) {
  const width = termWidth();
  const inner = width - 4;
  console.log(divider(title));
  for (const line of lines) {
    const chunks = wrapLine(line, inner);
    for (const chunk of chunks) console.log(`| ${chunk.padEnd(inner)} |`);
  }
  console.log(divider());
}

function wrapLine(text, width) {
  if (text.length <= width) return [text];
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function labelValue(label, value) {
  return `${label.padEnd(12)} ${value}`;
}

function statusLine(status, detail = '') {
  const marker = status === 'ok' ? paint('green', 'OK') : status === 'warn' ? paint('yellow', 'WARN') : paint('cyan', '..');
  console.log(`${marker} ${detail}`);
}

function profileSummary(profile) {
  if (!profile?.tunnel) return '';
  if (profile.tunnel === 'ngrok' && profile.hostname) return `Saved ngrok URL: ${profile.hostname}`;
  if (profile.tunnel === 'cloudflare-named' && profile.hostname) return `Saved Cloudflare URL: ${profile.hostname}`;
  if (profile.tunnel === 'tailscale' && profile.hostname) return `Saved Tailscale Funnel URL: ${profile.hostname}`;
  if (profile.tunnel === 'cloudflare') return 'Saved Cloudflare quick-tunnel setup';
  if (profile.tunnel === 'none') return 'Saved local-only setup';
  return '';
}

function profileOneLine(profile, index = 0) {
  const prefix = index ? `${index}. ` : '';
  const tunnel = profile.tunnel ?? 'cloudflare';
  const host = profile.hostname ? ` -> ${profile.hostname}` : '';
  const port = profile.port ? ` :${profile.port}` : '';
  return `${prefix}${profile.root}  ${tunnel}${host}${port}`;
}

function printSavedProfileHint(profile) {
  const summary = profileSummary(profile);
  if (!summary) return;
  printBox('Saved setup found', [
    summary,
    'From this folder, future launches only need: codexgpt start',
    'Use codexgpt setup when you want to change the port, mode, tool mode, tunnel, hostname, or token.'
  ]);
}

function parseArgs(argv) {
  const out = { allowRoots: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const option = raw.slice(2);
    const eq = option.indexOf('=');
    const key = eq >= 0 ? option.slice(0, eq) : option;
    const inlineValue = eq >= 0 ? option.slice(eq + 1) : undefined;
    if (key === 'help') out.help = true;
    else if (key === 'allow-home') out.allowHome = true;
    else if (key === 'no-auth') out.noAuth = true;
    else if (key === 'no-bash') out.bash = 'off';
    else if (key === 'compact-bash-transcript') out.bashTranscript = 'compact';
    else if (key === 'full-bash-transcript') out.bashTranscript = 'full';
    else if (key === 'codex-sessions-read') out.codexSessions = 'read';
    else if (key === 'require-bash-session') out.requireBashSession = true;
    else if (key === 'copy-url') out.copyUrl = true;
    else if (key === 'no-copy-url') out.noCopyUrl = true;
    else if (key === 'dry-run') out.dryRun = true;
    else if (key === 'json') out.json = true;
    else if (key === 'staged') out.staged = true;
    else if (key === 'once') out.once = true;
    else if (key === 'confirm') out.confirm = true;
    else if (key === 'no-confirm') out.noConfirm = true;
    else if (key === 'require-clean-git-start') out.requireCleanGitStart = true;
    else if (key === 'stop-if-no-files-changed') out.stopIfNoFilesChanged = true;
    else if (key === 'stop-if-same-diff') out.stopIfSameDiff = true;
    else if (key === 'require-human-confirmation') out.requireHumanConfirmation = true;
    else if (key === 'allow-implicit-review-verdict') out.allowImplicitReviewVerdict = true;
    else if (key === 'allow-review-pass-on-failure') out.allowReviewPassOnFailure = true;
    else if (key === 'open-chatgpt') out.openChatgpt = true;
    else if (key === 'no-profile') out.noProfile = true;
    else if (key === 'save-config') out.saveConfig = true;
    else if (key === 'no-save-config') out.noSaveConfig = true;
    else if (key === 'yes' || key === 'force') out.yes = true;
    else if (key === 'stable') out.tunnel = 'cloudflare-named';
    else if (key === 'install-cloudflared') out.installCloudflared = true;
    else if (key === 'no-install-cloudflared') out.noInstallCloudflared = true;
    else if (key === 'agent') {
      const next = argv[i + 1];
      if (inlineValue !== undefined || (next && !next.startsWith('--'))) {
        out.agent = inlineValue ?? next;
        if (inlineValue === undefined) i += 1;
      } else {
        out.mode = 'agent';
      }
    }
    else if (key === 'handoff') out.mode = 'handoff';
    else if (key === 'pro-planning' || key === 'pro') out.mode = 'pro';
    else if (key === 'log-requests') out.logRequests = true;
    else if (key === 'print-env') out.printEnv = true;
    else if (key === 'print-env-only') { out.printEnv = true; out.printEnvOnly = true; }
    else if (key === 'verbose') out.verbose = true;
    else {
      const next = argv[i + 1];
      const value = inlineValue ?? next;
      if (value === undefined || (inlineValue === undefined && value.startsWith('--'))) throw new Error(`Missing value for --${key}`);
      if (inlineValue === undefined) i += 1;
      if (key === 'allow-root') out.allowRoots.push(value);
      else out[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
  }
  return out;
}

function replaceSingleValueOption(argv, option, value) {
  const replaced = [];
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === option) {
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) index += 1;
      continue;
    }
    if (raw.startsWith(`${option}=`)) continue;
    replaced.push(raw);
  }
  replaced.push(option, value);
  return replaced;
}

function expandHome(input) {
  if (!input || input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function analysisChangedPaths(status) {
  if (!status || status === '(no output)') return [];
  const paths = [];
  for (const rawLine of String(status).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(fatal:|error:|git unavailable)/i.test(line)) continue;
    let filePath = '';
    if (line.startsWith('?? ')) filePath = line.slice(3).trim();
    else if (line.includes('\t')) filePath = line.split('\t').pop()?.trim() ?? '';
    else if (/^.{2}\s/.test(line)) filePath = line.slice(3).trim();
    if (filePath.includes(' -> ')) filePath = filePath.split(' -> ').pop() ?? filePath;
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      try { filePath = JSON.parse(filePath); } catch { filePath = filePath.slice(1, -1); }
    }
    if (filePath && !paths.includes(filePath)) paths.push(filePath);
  }
  return paths;
}

function assertGitStatusAvailable(status) {
  const value = String(status || '').trim();
  if (/^(fatal:|error:|git unavailable or failed:|git exited with status|usage: git )/i.test(value) || /not a git repository/i.test(value)) {
    throw new Error(`Unable to read Git changes: ${value}`);
  }
}

function printWorkspaceInspection(result, json) {
  const payload = {
    schema_version: result.schemaVersion,
    workspace_id: result.workspaceId,
    root: result.root,
    languages: result.languages,
    project_types: result.projectTypes,
    entrypoints: result.entrypoints,
    important_files: result.importantFiles,
    areas: result.areas,
    files: result.files,
    symbols: result.symbols,
    relationships: result.relationships,
    coverage: result.coverage,
    warnings: result.warnings,
    cache: result.cache
  };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log([
    'CodexGPT Repository Analysis',
    '',
    `Workspace: ${result.root}`,
    `Projects: ${result.projectTypes.join(', ') || 'unknown'}`,
    `Languages: ${result.languages.join(', ') || 'unknown'}`,
    `Entrypoints: ${result.entrypoints.join(', ') || 'none detected'}`,
    `Important areas: ${result.areas.slice(0, 8).map((area) => `${area.path} (${area.files})`).join(', ') || 'none'}`,
    `Coverage: ${result.coverage.analyzedFiles}/${result.coverage.inventoryFiles} files, ${result.coverage.symbolCount} symbols, ${result.coverage.relationshipCount} relationships${result.coverage.truncated ? ' (partial)' : ''}`,
    ...(result.warnings.length ? ['', 'Warnings:', ...result.warnings.map((warning) => `- ${warning}`)] : [])
  ].join('\n'));
}

function printChangeReview(result, json) {
  const payload = {
    schema_version: result.schemaVersion,
    changed_files: result.changedPaths,
    affected_areas: result.affectedAreas,
    dependent_files: result.dependentFiles,
    related_tests: result.relatedTests,
    risk_signals: result.riskSignals,
    recommended_commands: result.recommendedCommands,
    coverage: result.coverage,
    warnings: result.warnings,
    cache: result.cache
  };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log([
    'CodexGPT Change Review',
    '',
    `Changed files: ${result.changedPaths.join(', ') || 'none'}`,
    `Affected areas: ${result.affectedAreas.join(', ') || 'none'}`,
    `Risk: ${result.riskSignals.map((risk) => risk.label).join(', ') || 'none detected'}`,
    `Related tests: ${result.relatedTests.map((file) => file.path).join(', ') || 'none detected'}`,
    `Recommended verification: ${result.recommendedCommands.map((item) => item.command).join(', ') || 'none detected'}`,
    `Coverage: ${result.coverage.analyzedFiles}/${result.coverage.inventoryFiles} files${result.coverage.truncated ? ' (partial)' : ''}`,
    ...(result.warnings.length ? ['', 'Warnings:', ...result.warnings.map((warning) => `- ${warning}`)] : [])
  ].join('\n'));
}

async function runAnalysisCli(command, argv) {
  const args = parseArgs(argv);
  const root = realDir(args.root ?? process.cwd());
  const [{ loadConfig }, { PathGuard, WorkspaceManager }, analysis, git] = await Promise.all([
    import(pathToFileURL(path.join(projectRoot, 'dist', 'config.js')).href),
    import(pathToFileURL(path.join(projectRoot, 'dist', 'guard.js')).href),
    import(pathToFileURL(path.join(projectRoot, 'dist', 'analysis', 'index.js')).href),
    import(pathToFileURL(path.join(projectRoot, 'dist', 'gitOps.js')).href)
  ]);
  const config = loadConfig(['--root', root, '--bash', 'off', '--write', 'off']);
  const guard = new PathGuard(config);
  const workspace = new WorkspaceManager(config).defaultWorkspace();
  if (args.path) guard.resolve(workspace, args.path);
  if (command === 'inspect') {
    printWorkspaceInspection(await analysis.inspectWorkspace(config, guard, workspace), Boolean(args.json));
    return;
  }
  const status = git.gitDiffStatus(config, guard, workspace, args.path, Boolean(args.staged));
  assertGitStatusAvailable(status);
  const changedPaths = analysisChangedPaths(status);
  const review = await analysis.reviewWorkspaceChanges(config, guard, workspace, { changedPaths });
  printChangeReview(review, Boolean(args.json));
}

function realDir(input) {
  const resolved = path.resolve(expandHome(input));
  if (!fs.existsSync(resolved)) throw new Error(`Directory does not exist: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${resolved}`);
  return fs.realpathSync(resolved);
}

function resolveCodexDir(root, input) {
  if (!input) return '';
  const expanded = expandHome(input);
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(root, expanded);
}

function resolveConfigPath(root, input) {
  if (!input) return '';
  const expanded = expandHome(String(input));
  return path.isAbsolute(expanded) || path.win32.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(root, expanded);
}

function effectiveWriteMode(mode, requested) {
  const value = requested || (mode === 'agent' ? 'workspace' : 'handoff');
  if (!['off', 'handoff', 'workspace'].includes(value)) {
    throw new Error('--write must be off, handoff, or workspace');
  }
  if (mode === 'agent') return value;
  return value === 'off' ? 'off' : 'handoff';
}

function writeOption(args, profile, mode) {
  return effectiveWriteMode(mode, optionValue(args, profile, 'write', ['CODEXGPT_WRITE_MODE'], mode === 'agent' ? 'workspace' : 'handoff'));
}

function validateChoice(flag, value, allowed) {
  if (allowed.includes(value)) return value;
  throw new Error(`--${flag} must be ${allowed.slice(0, -1).join(', ')}, or ${allowed.at(-1)}`);
}

function optionalChoice(flag, value, allowed) {
  if (!value) return '';
  return validateChoice(flag, value, allowed);
}

function optionalWriteOption(args, profile, mode) {
  const requested = optionValue(args, profile, 'write', ['CODEXGPT_WRITE_MODE'], '');
  return requested ? effectiveWriteMode(mode, requested) : '';
}

function commandExists(command) {
  const result = process.platform === 'win32'
    ? spawnSync('where', [command], { stdio: 'ignore' })
    : spawnSync('/bin/sh', ['-c', 'command -v "$1"', 'codexgpt-command-v', command], { stdio: 'ignore' });
  return result.status === 0;
}

function commandPaths(command) {
  if (process.platform === 'win32') {
    const result = spawnSync('where', [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (result.status !== 0) return [];
    return String(result.stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  const result = spawnSync('/bin/sh', ['-c', 'command -v "$1"', 'codexgpt-command-v', command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) return [];
  return String(result.stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function isPathLike(command) {
  return command.includes('/') || command.includes('\\') || command.startsWith('.');
}

function resolveExecutablePath(command) {
  const expanded = expandHome(command);
  return path.resolve(expanded);
}

function isWindowsBatchFile(command) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function isWindowsCommandCandidate(command) {
  return process.platform === 'win32' && /\.(cmd|bat|exe)$/i.test(command);
}

function resolveCodexCommand() {
  const explicit = String(process.env.CODEXGPT_CODEX_BIN ?? '').trim();
  if (explicit) {
    if (isPathLike(explicit)) return resolveExecutablePath(explicit);
    const candidates = commandPaths(explicit);
    if (process.platform !== 'win32') return candidates[0] || explicit;
    return candidates.find(isWindowsCommandCandidate) || explicit;
  }
  if (process.platform !== 'win32') return 'codex';
  return commandPaths('codex').find(isWindowsCommandCandidate) || 'codex';
}

function executableFileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function commandAvailable(command) {
  if (isPathLike(command)) return executableFileExists(resolveExecutablePath(command));
  return commandExists(command);
}

function commandAvailableFromRoot(command, root) {
  if (!isPathLike(command)) return commandExists(command);
  const expanded = expandHome(command);
  const resolved = path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(root, expanded);
  return executableFileExists(resolved);
}

function CodexGPTHome() {
  const customHome = process.env.CODEXGPT_HOME;
  return customHome ? path.resolve(expandHome(customHome)) : path.join(os.homedir(), '.codexgpt');
}

function profileDir() {
  return path.join(CodexGPTHome(), 'profiles');
}

function profileIdForRoot(root) {
  return createHash('sha256').update(root).digest('hex').slice(0, 24);
}

function profilePathForRoot(root) {
  return path.join(profileDir(), `${profileIdForRoot(root)}.json`);
}

function runtimeDir() {
  return path.join(CodexGPTHome(), 'runtime');
}

function runtimeStatusPathForRoot(root) {
  return path.join(runtimeDir(), `${profileIdForRoot(root)}.json`);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function loadWorkspaceProfile(root) {
  const profilePath = profilePathForRoot(root);
  if (!fs.existsSync(profilePath)) return {};
  const profile = parseWorkspaceProfileJson(fs.readFileSync(profilePath, 'utf8'), {
    expectedRoot: root,
    profilePath
  });
  return { ...profile, profilePath };
}

function listWorkspaceProfiles() {
  const dir = profileDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const profilePath = path.join(dir, name);
      const profile = parseWorkspaceProfileJson(fs.readFileSync(profilePath, 'utf8'), { profilePath });
      if (profilePathForRoot(profile.root) !== profilePath) {
        throw new WorkspaceProfileValidationError(
          '$.root',
          'must hash to the filename that stores this profile.',
          { profilePath }
        );
      }
      return { ...profile, profilePath };
    })
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function deleteWorkspaceProfile(root) {
  const filePath = profilePathForRoot(root);
  return deleteWorkspaceProfileFilesSync(filePath);
}

function saveWorkspaceProfile(root, profile) {
  const filePath = profilePathForRoot(root);
  return saveWorkspaceProfileFileSync(filePath, root, profile).profilePath;
}

function saveRuntimeConnection(root, details, options = {}) {
  const filePath = runtimeStatusPathForRoot(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const payload = {
    version: 1,
    root,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
    endpoint: details.endpoint,
    localBase: options.localBase ?? '',
    localStatusUrl: details.localStatusUrl ? details.localStatusUrl.replace(/codexgpt_token=[^&]+/, 'codexgpt_token=<redacted>') : '',
    tunnel: options.tunnel ?? '',
    mode: options.mode ?? '',
    bash: options.bash ?? '',
    bashTranscript: options.bashTranscript ?? '',
    codexSessions: options.codexSessions ?? '',
    bashSession: options.bashSession ?? '',
    requireBashSession: Boolean(options.requireBashSession),
    write: options.write ?? '',
    toolMode: options.toolMode ?? '',
    toolCards: Boolean(options.toolCards),
    configFingerprint: options.configFingerprint ?? ''
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {}
  return filePath;
}

function clearRuntimeConnection(root) {
  try {
    const filePath = runtimeStatusPathForRoot(root);
    const runtime = readJsonFile(filePath);
    if (runtime?.pid === process.pid) fs.rmSync(filePath, { force: true });
  } catch {}
}

function sanitizedProfile(profile) {
  if (!profile || !Object.keys(profile).length) return {};
  const { token, cloudflareToken, ...rest } = profile;
  return {
    ...rest,
    ...(token ? { token: '<saved>' } : {}),
    ...(cloudflareToken ? { cloudflareToken: '<saved>' } : {})
  };
}

function reusableProfilePayload(profile, overrides = {}) {
  const {
    version,
    root,
    updatedAt,
    profilePath,
    ...rest
  } = profile || {};
  return {
    ...rest,
    ...overrides
  };
}

function optionValue(args, profile, field, envNames = [], fallback = undefined) {
  if (args[field] !== undefined) return args[field];
  for (const envName of envNames) {
    if (process.env[envName] !== undefined && process.env[envName] !== '') return process.env[envName];
  }
  if (profile?.[field] !== undefined && profile[field] !== '') return profile[field];
  return fallback;
}

function boolFromValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

function optionBool(args, profile, field, envNames = [], fallback = false) {
  if (args[field] !== undefined) return boolFromValue(args[field], fallback);
  for (const envName of envNames) {
    if (process.env[envName] !== undefined && process.env[envName] !== '') return boolFromValue(process.env[envName], fallback);
  }
  if (profile?.[field] !== undefined && profile[field] !== '') return boolFromValue(profile[field], fallback);
  return fallback;
}

function cliExplainCandidate(args, field, argument, argv = [], aliases = []) {
  const accepted = new Set([argument, ...aliases]);
  let actualArgument = argument;
  for (const raw of argv) {
    const option = raw.startsWith('--') ? raw.split('=', 1)[0] : '';
    if (accepted.has(option)) actualArgument = option;
  }
  return { present: args[field] !== undefined, source: { kind: 'cli', argument: actualArgument } };
}

function environmentExplainCandidate(variable) {
  return {
    present: process.env[variable] !== undefined && process.env[variable] !== '',
    source: { kind: 'environment', variable, scope: 'current-process' }
  };
}

function compatibilityEnvironmentExplainCandidate(variable, replacement, remediation) {
  return {
    present: process.env[variable] !== undefined && process.env[variable] !== '',
    source: {
      kind: 'compatibility',
      source: `current-process environment ${variable}`,
      removeAfter: 'the configuration resolver migration window'
    },
    compatibility: { replacement, remediation }
  };
}

function modeAmbiguousCompatibilityEnvironmentExplainCandidate(variable, namedTunnelMode) {
  return {
    present: process.env[variable] !== undefined && process.env[variable] !== '',
    source: {
      kind: 'compatibility',
      source: `current-process environment ${variable}`,
      removeAfter: 'not scheduled',
      classification: 'mode-ambiguous',
      namedTunnelMode,
      effectiveScope: 'all-tunnel-modes'
    }
  };
}

function profileExplainCandidate(profile, field, jsonPath = `$.${field}`) {
  return {
    present: profile?.[field] !== undefined && profile[field] !== '',
    source: {
      kind: 'profile',
      file: profile?.profilePath ?? '(profile unavailable)',
      jsonPath
    }
  };
}

function defaultExplainSource(rule) {
  return { kind: 'default', rule };
}

function optionExplanation(input) {
  return explainInput({
    key: input.key,
    value: input.value,
    secret: input.secret,
    candidates: [
      cliExplainCandidate(input.args, input.field, input.argument, input.argv, input.aliases),
      ...input.envNames.map(environmentExplainCandidate),
      profileExplainCandidate(input.profile, input.field, input.jsonPath)
    ],
    fallback: input.fallback
  });
}

function buildConfigExplainInputs(context) {
  const { argv, args, profile, root, runtime, authMode, tunnel, stableHostname, mode,
    localAdminPort, bash, bashTranscript, codexSessions, codexDir, bashSession, requireBashSession,
    write, toolMode, widgetDomain, toolCards, semanticMode, semanticProvider, token } = context;
  const inputs = [];
  const addOption = (key, value, field, argument, envNames, rule, extra = {}) => inputs.push(optionExplanation({
    key, value, field, argument, envNames, argv, args, profile, fallback: defaultExplainSource(rule), ...extra
  }));

  inputs.push(explainInput({
    key: 'workspace.root',
    value: root,
    candidates: [
      cliExplainCandidate(args, 'root', '--root', argv),
      environmentExplainCandidate('CODEXGPT_ROOT'),
      compatibilityEnvironmentExplainCandidate(
        'CODEBASE_BRIDGE_REPO_ROOT',
        '--root or CODEXGPT_ROOT',
        '$env:CODEXGPT_ROOT = $env:CODEBASE_BRIDGE_REPO_ROOT; Remove-Item Env:CODEBASE_BRIDGE_REPO_ROOT'
      )
    ],
    fallback: defaultExplainSource('current working directory')
  }));
  inputs.push(explainInput({
    key: 'profile.disabled',
    value: Boolean(args.noProfile),
    candidates: [cliExplainCandidate(args, 'noProfile', '--no-profile', argv)],
    fallback: defaultExplainSource('workspace profile loading enabled')
  }));
  inputs.push(explainInput({
    key: 'auth.mode',
    value: authMode,
    candidates: [
      environmentExplainCandidate('CODEXGPT_AUTH_MODE'),
      profileExplainCandidate(profile, 'authMode')
    ],
    fallback: defaultExplainSource('legacy authentication mode')
  }));

  const tokenCandidates = [];
  if (authMode === 'oauth') {
    tokenCandidates.push({ present: true, source: defaultExplainSource('OAuth mode does not use the legacy HTTP token') });
  } else if (args.noAuth) {
    tokenCandidates.push({ present: true, source: { kind: 'cli', argument: '--no-auth' } });
  } else {
    tokenCandidates.push(
      cliExplainCandidate(args, 'token', '--token', argv),
      environmentExplainCandidate('CODEXGPT_HTTP_TOKEN'),
      compatibilityEnvironmentExplainCandidate(
        'CODEBASE_BRIDGE_HTTP_TOKEN',
        'CODEXGPT_HTTP_TOKEN',
        '$env:CODEXGPT_HTTP_TOKEN = $env:CODEBASE_BRIDGE_HTTP_TOKEN; Remove-Item Env:CODEBASE_BRIDGE_HTTP_TOKEN'
      ),
      profileExplainCandidate(profile, 'token')
    );
  }
  inputs.push(explainInput({
    key: 'auth.token',
    value: token,
    secret: true,
    candidates: tokenCandidates,
    fallback: defaultExplainSource('generated for this invocation when legacy authentication requires a token')
  }));

  addOption('server.host', runtime.host, 'host', '--host', ['CODEXGPT_HOST'], 'loopback-only local bind host');
  addOption('server.port', runtime.port, 'port', '--port', ['CODEXGPT_PORT'], 'CodexGPT local port default');
  addOption('connector.mode', mode, 'mode', '--mode', ['CODEXGPT_MODE'], 'agent connector mode', {
    aliases: ['--agent', '--handoff', '--pro-planning', '--pro']
  });
  addOption('tunnel.mode', tunnel, 'tunnel', '--tunnel', ['CODEXGPT_TUNNEL'], 'Cloudflare quick tunnel');
  inputs.push(explainInput({
    key: 'tunnel.hostname',
    value: stableHostname,
    candidates: [
      cliExplainCandidate(args, 'hostname', '--hostname', argv),
      cliExplainCandidate(args, 'url', '--url', argv),
      environmentExplainCandidate('CODEXGPT_PUBLIC_HOSTNAME'),
      compatibilityEnvironmentExplainCandidate(
        'CODEXGPT_HOSTNAME',
        'CODEXGPT_PUBLIC_HOSTNAME',
        '$env:CODEXGPT_PUBLIC_HOSTNAME = $env:CODEXGPT_HOSTNAME; Remove-Item Env:CODEXGPT_HOSTNAME'
      ),
      modeAmbiguousCompatibilityEnvironmentExplainCandidate('NGROK_DOMAIN', 'ngrok'),
      profileExplainCandidate(profile, 'hostname')
    ],
    fallback: defaultExplainSource('no stable public hostname')
  }));
  inputs.push(explainInput({
    key: 'filesystem.allowedRoots',
    value: runtime.allowedRoots,
    candidates: args.allowRoots.length
      ? [{ present: true, source: { kind: 'cli', argument: '--allow-root' } }]
      : [],
    fallback: defaultExplainSource('workspace root is always allowed')
  }));
  inputs.push(explainInput({
    key: 'filesystem.allowHome',
    value: Boolean(args.allowHome || boolFromValue(process.env.CODEXGPT_ALLOW_HOME, false)),
    candidates: [
      cliExplainCandidate(args, 'allowHome', '--allow-home', argv),
      environmentExplainCandidate('CODEXGPT_ALLOW_HOME')
    ],
    fallback: defaultExplainSource('home-directory expansion disabled')
  }));
  addOption('shell.bash', runtime.bashMode, 'bash', '--bash', ['CODEXGPT_BASH_MODE'], 'safe Bash policy', {
    aliases: ['--no-bash']
  });
  addOption('shell.transcript', runtime.bashTranscript, 'bashTranscript', '--bash-transcript', ['CODEXGPT_BASH_TRANSCRIPT'], 'compact Bash transcript', {
    aliases: ['--compact-bash-transcript', '--full-bash-transcript']
  });
  addOption('shell.session', runtime.bashSessionId ?? '', 'bashSession', '--bash-session', ['CODEXGPT_BASH_SESSION_ID'], 'no required session label');
  addOption('shell.requireSession', runtime.requireBashSession, 'requireBashSession', '--require-bash-session', ['CODEXGPT_REQUIRE_BASH_SESSION'], 'Bash session matching disabled');
  addOption('codex.sessions', runtime.codexSessions, 'codexSessions', '--codex-sessions', ['CODEXGPT_CODEX_SESSIONS'], 'Codex session history disabled', {
    aliases: ['--codex-sessions-read']
  });
  addOption('codex.directory', runtime.codexDir, 'codexDir', '--codex-dir', ['CODEXGPT_CODEX_DIR'], 'current user Codex directory');
  addOption('write.mode', runtime.writeMode, 'write', '--write', ['CODEXGPT_WRITE_MODE'], `mode-derived ${mode} write policy`);
  addOption('tools.mode', runtime.toolMode, 'toolMode', '--tool-mode', ['CODEXGPT_TOOL_MODE'], 'standard tool surface');
  addOption('tools.widgetDomain', runtime.widgetDomain, 'widgetDomain', '--widget-domain', ['CODEXGPT_WIDGET_DOMAIN'], 'bundled widget origin');
  addOption('tools.cards', runtime.toolCards, 'toolCards', '--tool-cards', ['CODEXGPT_TOOL_CARDS'], 'tool cards disabled');
  inputs.push(explainInput({
    key: 'semantic.mode',
    value: runtime.semanticMode,
    candidates: [environmentExplainCandidate('CODEXGPT_SEMANTIC_MODE')],
    fallback: defaultExplainSource('profile semantic provider and tool mode')
  }));
  addOption('semantic.provider', runtime.semanticProvider, 'semanticProvider', '--semantic-provider', ['CODEXGPT_SEMANTIC_PROVIDER'], 'built-in semantic provider');
  inputs.push(explainInput({
    key: 'logging.requests',
    value: runtime.logRequests,
    candidates: [
      cliExplainCandidate(args, 'logRequests', '--log-requests', argv),
      environmentExplainCandidate('CODEXGPT_LOG_REQUESTS')
    ],
    fallback: defaultExplainSource('request logging disabled')
  }));
  if (authMode === 'oauth') {
    inputs.push(explainInput({
      key: 'oauth.localAdminPort',
      value: localAdminPort,
      candidates: [profileExplainCandidate(profile, 'localAdminPort')],
      fallback: defaultExplainSource('OAuth setup must provide a distinct local-admin port')
    }));
  }
  return inputs;
}

function hasToolCardsInput(args, profile = {}) {
  return args.toolCards !== undefined || profile.toolCards !== undefined || (process.env.CODEXGPT_TOOL_CARDS !== undefined && process.env.CODEXGPT_TOOL_CARDS !== '');
}

function toolCardsProfileEntry(args, profile = {}) {
  const hasInput = hasToolCardsInput(args, profile);
  return hasInput ? { toolCards: optionBool(args, profile, 'toolCards', ['CODEXGPT_TOOL_CARDS'], false) } : {};
}

function toolCardsCliArgs(args, profile = {}) {
  if (!hasToolCardsInput(args, profile)) return [];
  return ['--tool-cards', optionBool(args, profile, 'toolCards', ['CODEXGPT_TOOL_CARDS'], false) ? 'on' : 'off'];
}

function validateBashSession(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(trimmed)) {
    throw new Error('--bash-session must be 1-64 characters using letters, numbers, dot, underscore, or dash, and must start with a letter or number.');
  }
  return trimmed;
}

function bashSessionOptions(args, profile = {}) {
  const bashSession = validateBashSession(optionValue(args, profile, 'bashSession', ['CODEXGPT_BASH_SESSION_ID'], ''));
  const requireBashSession = optionBool(args, profile, 'requireBashSession', ['CODEXGPT_REQUIRE_BASH_SESSION'], false);
  if (requireBashSession && !bashSession) {
    throw new Error('--require-bash-session requires --bash-session <id>.');
  }
  return { bashSession, requireBashSession };
}

function bashTranscriptOption(args, profile = {}) {
  const value = optionValue(args, profile, 'bashTranscript', ['CODEXGPT_BASH_TRANSCRIPT'], 'compact');
  if (value === 'compact' || value === 'full') return value;
  throw new Error('--bash-transcript must be compact or full.');
}

function codexSessionsOption(args, profile = {}) {
  const value = optionValue(args, profile, 'codexSessions', ['CODEXGPT_CODEX_SESSIONS'], 'off');
  if (value === 'off' || value === 'metadata' || value === 'read') return value;
  throw new Error('--codex-sessions must be off, metadata, or read.');
}

function stableToken(existing = '') {
  return existing || randomBytes(24).toString('hex');
}

function buildRuntimeServerEnvironment(input) {
  const environment = {
    ...input.baseEnvironment,
    CODEXGPT_ROOT: input.root,
    CODEXGPT_ALLOWED_ROOTS: input.allowRoots.join(path.delimiter),
    CODEXGPT_HOST: input.host,
    CODEXGPT_PORT: input.port,
    CODEXGPT_BASH_MODE: input.bash,
    CODEXGPT_BASH_TRANSCRIPT: input.bashTranscript,
    CODEXGPT_BASH_SESSION_ID: input.bashSession,
    CODEXGPT_REQUIRE_BASH_SESSION: input.requireBashSession ? '1' : '0',
    CODEXGPT_CODEX_SESSIONS: input.codexSessions,
    CODEXGPT_WRITE_MODE: input.write,
    CODEXGPT_TOOL_MODE: input.toolMode,
    CODEXGPT_WIDGET_DOMAIN: input.widgetDomain,
    CODEXGPT_TOOL_CARDS: input.toolCards ? '1' : '0',
    CODEXGPT_SEMANTIC_MODE: input.semanticMode,
    CODEXGPT_SEMANTIC_PROVIDER: input.semanticProvider,
    CODEXGPT_CONNECTION_TEST: input.connectionTest ? '1' : '0',
    CODEXGPT_MODE: input.mode,
    CODEXGPT_AUTH_MODE: input.authMode,
    CODEXGPT_TUNNEL_MODE: input.tunnel === 'none' ? '0' : '1',
    CODEXGPT_ALLOW_QUERY_TOKEN: input.authMode === 'oauth' ? '0' : input.baseEnvironment.CODEXGPT_ALLOW_QUERY_TOKEN,
    CODEXGPT_ALLOW_NO_HTTP_TOKEN: input.authMode === 'oauth' ? '0' : input.noAuth ? '1' : '0'
  };
  if (input.codexDir) environment.CODEXGPT_CODEX_DIR = input.codexDir;
  if (input.logRequests) environment.CODEXGPT_LOG_REQUESTS = '1';
  if (input.allowHome) environment.CODEXGPT_ALLOW_HOME = '1';
  if (input.token) environment.CODEXGPT_HTTP_TOKEN = input.token;
  else delete environment.CODEXGPT_HTTP_TOKEN;
  delete environment.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT;
  delete environment.CODEXGPT_EXPECTED_CONFIG_INTEGRITY;
  delete environment.CODEXGPT_CONFIG_INTEGRITY_KEY;
  return environment;
}

async function resolveRuntimeConfigSnapshot(root, environment, options = {}) {
  const configPath = path.join(projectRoot, 'dist', 'config.js');
  const resolverPath = path.join(projectRoot, 'dist', 'configResolver.js');
  if (!fs.existsSync(configPath) || !fs.existsSync(resolverPath)) {
    throw new Error(`Missing built configuration modules. Run npm install && npm run build first.`);
  }
  const [{ loadResolvedConfig }, { resolveConfigBootstrap }] = await Promise.all([
    import(pathToFileURL(configPath).href),
    import(pathToFileURL(resolverPath).href)
  ]);
  const platform = process.platform;
  const bootstrapArgv = options.argv ?? ['--root', root, ...(options.noProfile ? ['--no-profile'] : [])];
  resolveConfigBootstrap({
    argv: bootstrapArgv,
    environment,
    cwd: projectRoot,
    platform,
    filesystemPlatform: platform
  });
  return loadResolvedConfig(['--root', root, ...(options.noProfile ? ['--no-profile'] : [])], {
    environment,
    cwd: projectRoot,
    platform,
    filesystemPlatform: platform
  });
}

async function resolveLauncherBootstrap(argv, environment = process.env, cwd = process.cwd()) {
  const resolverPath = path.join(projectRoot, 'dist', 'configResolver.js');
  if (!fs.existsSync(resolverPath)) {
    throw new Error('Missing built configuration modules. Run npm install && npm run build first.');
  }
  const { resolveConfigBootstrap } = await import(pathToFileURL(resolverPath).href);
  return resolveConfigBootstrap({
    argv,
    environment,
    cwd,
    platform: process.platform,
    filesystemPlatform: process.platform
  });
}

function readRuntimeConnectionRecord(root) {
  try {
    const runtime = readJsonFile(runtimeStatusPathForRoot(root));
    if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) return {};
    if (runtime.version !== 1 || runtime.root !== root) return {};
    if (!Number.isInteger(runtime.pid) || runtime.pid <= 0) return {};
    if (!/^[a-f0-9]{64}$/.test(runtime.configFingerprint ?? '')) return {};
    try {
      process.kill(runtime.pid, 0);
    } catch {
      return {};
    }
    return runtime;
  } catch {
    return {};
  }
}

function cloudflaredBinName() {
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

function localCloudflaredPath() {
  return path.join(CodexGPTHome(), 'bin', cloudflaredBinName());
}

function cloudflaredReleaseAsset() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    if (arch === 'arm64') return { file: 'cloudflared-darwin-arm64.tgz', archive: true };
    if (arch === 'x64') return { file: 'cloudflared-darwin-amd64.tgz', archive: true };
  }

  if (platform === 'linux') {
    if (arch === 'arm64') return { file: 'cloudflared-linux-arm64', archive: false };
    if (arch === 'arm') return { file: 'cloudflared-linux-arm', archive: false };
    if (arch === 'x64') return { file: 'cloudflared-linux-amd64', archive: false };
    if (arch === 'ia32') return { file: 'cloudflared-linux-386', archive: false };
  }

  if (platform === 'win32') {
    if (arch === 'x64') return { file: 'cloudflared-windows-amd64.exe', archive: false };
    if (arch === 'ia32') return { file: 'cloudflared-windows-386.exe', archive: false };
  }

  throw new Error(`Automatic cloudflared install is not supported on ${platform}/${arch}. Install cloudflared manually or pass --cloudflared <path>.`);
}

function findFileByName(root, fileName) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) return fullPath;
    if (entry.isDirectory()) {
      const found = findFileByName(fullPath, fileName);
      if (found) return found;
    }
  }
  return '';
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'codexgpt-launcher' }
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer, { mode: 0o755 });
}

function verifyCloudflared(binaryPath) {
  const result = spawnSync(binaryPath, ['--version'], {
    stdio: 'ignore',
    shell: false,
    timeout: 15000
  });
  if (result.status !== 0) {
    throw new Error(`Downloaded cloudflared, but ${binaryPath} --version failed.`);
  }
}

async function installCloudflaredLocal() {
  const asset = cloudflaredReleaseAsset();
  const installPath = localCloudflaredPath();
  const binDir = path.dirname(installPath);
  const ownedTemp = createOwnedTempRootSync('cloudflared-local');
  const tmpRoot = ownedTemp.path;
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset.file}`;

  fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });
  console.error(`[codexgpt] Installing cloudflared locally: ${installPath}`);
  console.error(`[codexgpt] Downloading official Cloudflare release: ${asset.file}`);

  try {
    if (asset.archive) {
      const archivePath = path.join(tmpRoot, asset.file);
      const extractDir = path.join(tmpRoot, 'extract');
      fs.mkdirSync(extractDir, { recursive: true });
      await downloadFile(url, archivePath);
      const tar = spawnSync('tar', ['-xzf', archivePath, '-C', extractDir], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });
      if (tar.status !== 0) {
        throw new Error(`Failed to extract ${asset.file}: ${tar.stderr || tar.stdout || `exit ${tar.status}`}`);
      }
      const extracted = findFileByName(extractDir, 'cloudflared');
      if (!extracted) throw new Error(`Could not find cloudflared inside ${asset.file}`);
      fs.copyFileSync(extracted, installPath);
    } else {
      const tmpBinary = path.join(tmpRoot, cloudflaredBinName());
      await downloadFile(url, tmpBinary);
      fs.copyFileSync(tmpBinary, installPath);
    }

    if (process.platform !== 'win32') fs.chmodSync(installPath, 0o755);
    verifyCloudflared(installPath);
    console.error('[codexgpt] cloudflared installed successfully.');
    return installPath;
  } finally {
    ownedTemp.cleanupSync();
  }
}

async function resolveCloudflared(args) {
  const explicit = args.cloudflared ?? process.env.CLOUDFLARED_BIN ?? '';
  if (explicit) {
    const resolved = isPathLike(explicit) ? resolveExecutablePath(explicit) : explicit;
    if (commandAvailable(resolved)) {
      verifyCloudflared(resolved);
      return resolved;
    }
    throw new Error(`cloudflared was not found at ${explicit}. Remove --cloudflared, install it, or pass a valid path.`);
  }

  if (!args.installCloudflared && commandExists('cloudflared')) {
    try {
      verifyCloudflared('cloudflared');
      return 'cloudflared';
    } catch (error) {
      console.error(`[codexgpt] cloudflared in PATH failed --version; trying local install. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const localPath = localCloudflaredPath();
  if (!args.installCloudflared && executableFileExists(localPath)) {
    try {
      verifyCloudflared(localPath);
      return localPath;
    } catch (error) {
      if (args.noInstallCloudflared) return localPath;
      console.error(`[codexgpt] Existing ${localPath} failed --version; reinstalling. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (args.noInstallCloudflared) return '';
  return installCloudflaredLocal();
}

function verifyNgrok(binaryPath) {
  const result = spawnSync(binaryPath, ['version'], {
    stdio: 'ignore',
    shell: false,
    timeout: 15000
  });
  if (result.status !== 0) {
    throw new Error(`ngrok was found, but ${binaryPath} version failed. Run ngrok version to inspect it.`);
  }
}

function resolveNgrok(args) {
  const explicit = args.ngrok ?? process.env.NGROK_BIN ?? '';
  if (explicit) {
    const resolved = isPathLike(explicit) ? resolveExecutablePath(explicit) : explicit;
    if (commandAvailable(resolved)) {
      verifyNgrok(resolved);
      return resolved;
    }
    throw new Error(`ngrok was not found at ${explicit}. Install ngrok, add it to PATH, or pass --ngrok <path>.`);
  }

  if (commandExists('ngrok')) {
    verifyNgrok('ngrok');
    return 'ngrok';
  }

  throw new Error('ngrok was not found on PATH. Install it with Homebrew, winget, apt, or from https://ngrok.com/download, then run ngrok config add-authtoken <token>.');
}

function verifyTailscale(binaryPath) {
  const result = spawnSync(binaryPath, ['version'], {
    stdio: 'ignore',
    shell: false,
    timeout: 15000
  });
  if (result.status !== 0) {
    throw new Error(`tailscale was found, but ${binaryPath} version failed. Run tailscale version to inspect it.`);
  }
}

function resolveTailscale(args) {
  const explicit = args.tailscale ?? process.env.TAILSCALE_BIN ?? '';
  if (explicit) {
    const resolved = isPathLike(explicit) ? resolveExecutablePath(explicit) : explicit;
    if (commandAvailable(resolved)) {
      verifyTailscale(resolved);
      return resolved;
    }
    throw new Error(`tailscale was not found at ${explicit}. Install Tailscale, add it to PATH, or pass --tailscale <path>.`);
  }

  if (commandExists('tailscale')) {
    verifyTailscale('tailscale');
    return 'tailscale';
  }

  throw new Error('tailscale was not found on PATH. Install Tailscale and enable Funnel, then run codexgpt tailscale --hostname your-device.your-tailnet.ts.net.');
}

function ngrokConfigPath(root, args, profile = {}) {
  const configPath = optionValue(args, profile, 'ngrokConfig', ['NGROK_CONFIG', 'CODEXGPT_NGROK_CONFIG'], '');
  return resolveConfigPath(root, configPath);
}

function runHelperScript(scriptName, args) {
  const scriptPath = path.join(projectRoot, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    env: { ...process.env, CODEXGPT_CALLER_CWD: process.cwd() },
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function requestHealth(url, token, hostHeader, lookup) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.request(parsed, {
      method: 'GET',
      lookup,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(hostHeader ? { Host: hostHeader } : {})
      }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: response.statusCode ?? 0, text });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function waitForHealth(url, token, timeoutMs = 15000, hostHeader = '', lookup) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await requestHealth(url, token, hostHeader, lookup);
      if (response.status >= 200 && response.status < 300) return JSON.parse(response.text);
      lastError = `${response.status} ${response.text}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}`);
}

function portInUseHelp(host, port) {
  return [
    `Local port ${port} is already in use on ${host}.`,
    '',
    'If you want two repositories running at the same time, each one needs its own local port.',
    '',
    'Example:',
    '  repo A: codexgpt setup  -> port 8787 -> hostname A',
    '  repo B: codexgpt setup  -> port 8788 -> hostname B',
    '',
    'For quick tunnels you can also start the second repo with:',
    '  codexgpt start --port 8788',
    '',
    'Stable public hostnames also cannot be shared by two running repositories at once.'
  ].join('\n');
}

function normalizePort(port) {
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort <= 0 || numericPort > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  return String(numericPort);
}

async function assertPortAvailable(host, port) {
  const numericPort = Number(normalizePort(port));
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
        reject(new Error(portInUseHelp(host, port)));
        return;
      }
      reject(error);
    });
    server.once('listening', () => {
      server.close(() => resolve());
    });
    server.listen(numericPort, host);
  });
}

const spawnedChildren = new Set();

function spawnLogged(name, command, args, options = {}) {
  const { verbose = false, ...spawnOptions } = options;
  const child = spawn(command, args, { ...spawnOptions, stdio: ['ignore', 'pipe', 'pipe'] });
  const logLines = [];
  const record = (stream, chunk) => {
    const text = redactForLog(String(chunk));
    logLines.push(...text.split(/\r?\n/).filter(Boolean).map((line) => `[${name}] ${line}`));
    while (logLines.length > 120) logLines.shift();
    if (verbose) stream.write(`[${name}] ${text}`);
  };
  child.codexgptLogTail = () => logLines.join('\n');
  spawnedChildren.add(child);
  child.stdout.on('data', (chunk) => record(process.stdout, chunk));
  child.stderr.on('data', (chunk) => record(process.stderr, chunk));
  child.on('exit', (code, signal) => {
    spawnedChildren.delete(child);
    if (verbose) console.error(`[${name}] exited code=${code} signal=${signal}`);
  });
  return child;
}

function waitForCloudflareUrl(child, timeoutMs = 45000) {
  const re = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g;
  let buffer = '';
  const isQuickTunnelUrl = (value) => {
    try {
      return new URL(value).hostname !== 'api.trycloudflare.com';
    } catch {
      return false;
    }
  };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for cloudflared public URL.')), timeoutMs);
    timer.unref();
    const onData = (chunk) => {
      const text = String(chunk);
      buffer += text;
      const match = buffer.match(re);
      const tunnelUrl = match?.find(isQuickTunnelUrl);
      if (tunnelUrl) {
        clearTimeout(timer);
        resolve(tunnelUrl);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudflared exited before a URL was found, code=${code}`));
    });
  });
}

function waitForTunnelStartup(child, label, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const outputTail = () => {
      const tail = typeof child.codexgptLogTail === 'function' ? child.codexgptLogTail() : '';
      return tail ? `\n\nRecent ${label} output:\n${tail}` : '';
    };
    const onExit = (code, signal) => {
      settle(reject, new Error(`${label} exited before startup completed, code=${code} signal=${signal}${outputTail()}`));
    };
    const onError = (error) => {
      settle(reject, new Error(`${label} failed before startup completed: ${error instanceof Error ? error.message : String(error)}${outputTail()}`));
    };
    timer = setTimeout(() => settle(resolve), timeoutMs);
    timer.unref();
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function outboundProxyFromEnv(env = process.env) {
  return env.HTTPS_PROXY || env.https_proxy || env.ALL_PROXY || env.all_proxy || env.HTTP_PROXY || env.http_proxy || '';
}

function requestQuickTunnelViaCurl(proxyUrl) {
  const args = ['--silent', '--show-error', '--fail', '--max-time', '30'];
  if (proxyUrl) args.push('--proxy', proxyUrl);
  args.push('-X', 'POST', 'https://api.trycloudflare.com/tunnel');
  const result = spawnSync('curl', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(redactForLog(`Failed to request Cloudflare quick tunnel via curl: ${result.stderr || result.stdout || `exit ${result.status}`}`));
  }

  let body;
  try {
    body = JSON.parse(result.stdout);
  } catch {
    throw new Error('Cloudflare quick tunnel API returned invalid JSON.');
  }

  const tunnel = body?.result;
  if (!body?.success || !tunnel?.id || !tunnel?.hostname || !tunnel?.account_tag || !tunnel?.secret) {
    const errors = Array.isArray(body?.errors) && body.errors.length ? ` ${JSON.stringify(body.errors)}` : '';
    throw new Error(redactForLog(`Cloudflare quick tunnel API did not return usable tunnel credentials.${errors}`));
  }

  return {
    id: String(tunnel.id),
    hostname: normalizePublicHostname(tunnel.hostname),
    accountTag: String(tunnel.account_tag),
    secret: String(tunnel.secret)
  };
}

function writeQuickTunnelCredentials(tunnel) {
  const ownedTemp = createOwnedTempRootSync('quick-tunnel');
  const tmpRoot = ownedTemp.path;
  const credentialsPath = path.join(tmpRoot, 'credentials.json');
  fs.writeFileSync(credentialsPath, JSON.stringify({
    AccountTag: tunnel.accountTag,
    TunnelSecret: tunnel.secret,
    TunnelID: tunnel.id
  }, null, 2), { mode: 0o600 });
  return { credentialsPath, cleanup: () => ownedTemp.cleanupSync() };
}

function killProcess(child) {
  if (!child || child.killed) return;
  try { child.kill('SIGTERM'); } catch {}
  setTimeout(() => {
    if (!child.killed) {
      try { child.kill('SIGKILL'); } catch {}
    }
  }, 1500).unref();
}

function cleanupChildren() {
  for (const child of spawnedChildren) killProcess(child);
}

function endpointWithToken(endpoint, token) {
  if (!token) return endpoint;
  const url = new URL(endpoint);
  url.searchParams.set('codexgpt_token', token);
  return url.toString();
}

function normalizePublicHostname(value) {
  const raw = String(value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  if (url.protocol !== 'https:') throw new Error('hostname must use https when a scheme is provided.');
  if (url.search || url.hash) throw new Error('hostname must not include query strings or fragments.');
  if (url.pathname !== '/' && url.pathname !== '/mcp') throw new Error('hostname must be a host, URL root, or /mcp URL.');
  return url.host;
}

function publicBaseFromHostname(hostname) {
  return `https://${normalizePublicHostname(hostname)}`;
}

function tailscaleFunnelHttpsPort(publicBase) {
  const port = new URL(publicBase).port || '443';
  if (!['443', '8443', '10000'].includes(port)) {
    throw new Error('Tailscale Funnel HTTPS port must be 443, 8443, or 10000.');
  }
  return port;
}

function readTokenFile(filePath) {
  const resolved = path.resolve(expandHome(filePath));
  return fs.readFileSync(resolved, 'utf8').trim();
}

function normalizeMode(args) {
  const mode = args.mode ?? process.env.CODEXGPT_MODE ?? 'agent';
  if (!['agent', 'handoff', 'pro'].includes(mode)) {
    throw new Error('--mode must be agent, handoff, or pro');
  }
  return mode;
}

function copyToClipboard(text) {
  const attempts = [];
  if (process.platform === 'darwin') attempts.push(['pbcopy', []]);
  else if (process.platform === 'win32') attempts.push(['cmd', ['/c', 'clip']]);
  else {
    attempts.push(['wl-copy', []]);
    attempts.push(['xclip', ['-selection', 'clipboard']]);
    attempts.push(['xsel', ['--clipboard', '--input']]);
  }

  for (const [command, args] of attempts) {
    const exists = command === 'cmd' || commandExists(command);
    if (!exists) continue;
    const result = spawnSync(command, args, {
      input: text,
      encoding: 'utf8',
      stdio: ['pipe', 'ignore', 'ignore'],
      shell: false
    });
    if (result.status === 0) return { ok: true, command };
  }
  return { ok: false, command: '' };
}

function openUrl(url) {
  const command =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  const [bin, args] = command;
  if (bin !== 'cmd' && !commandExists(bin)) return false;
  const result = spawnSync(bin, args, { stdio: 'ignore', shell: false });
  return result.status === 0;
}

function waitForProcessExit(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function waitForPublicHealth(publicBase, token, tunnelChild, tunnelLabel = 'tunnel', usePublicDns = false) {
  const exit = waitForProcessExit(tunnelChild).then(({ code, signal }) => {
    throw new Error(`${tunnelLabel} exited before ${publicBase}/healthz was reachable, code=${code} signal=${signal}`);
  });
  const health = (async () => {
    let lookup;
    if (usePublicDns) {
      try {
        lookup = createFixedAddressLookup(await resolvePublicProbeAddress(new URL(publicBase).hostname));
      } catch (error) {
        await sleep(1000);
        throw error;
      }
    }
    return waitForHealth(`${publicBase}/healthz`, token, 60000, '', lookup);
  })();
  return Promise.race([health, exit]);
}

function isSubpath(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function contextDirFromArgs(args) {
  return args.contextDir ?? process.env.CODEXGPT_CONTEXT_DIR ?? '.ai-bridge';
}

function resolveWorkspaceFile(root, relativePath) {
  const absPath = path.resolve(root, relativePath);
  if (!isSubpath(absPath, root)) {
    throw new Error(`Path escapes workspace root: ${relativePath}`);
  }
  return absPath;
}

function readTextFileBounded(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);
  if (stat.size > maxBytes) throw new Error(`File is too large (${stat.size} bytes). Limit: ${maxBytes} bytes.`);
  const sample = fs.readFileSync(filePath, { encoding: null });
  if (sample.includes(0)) throw new Error(`Refusing to read binary file: ${filePath}`);
  return sample.toString('utf8');
}

function numberOption(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function handoffMaxReadBytes() {
  return numberOption(process.env.CODEXGPT_MAX_READ_BYTES, 180_000, 4_000, 2_000_000);
}

function shellCommandPreview(parts) {
  return parts.map((part) => {
    const text = String(part);
    if (/^[A-Za-z0-9_./:@=+-]+$/.test(text)) return text;
    return process.platform === 'win32'
      ? `'${text.replace(/'/g, "''")}'`
      : `'${text.replace(/'/g, "'\\''")}'`;
  }).join(' ');
}

function restartCommandPreview(argv, root) {
  const omittedFlags = new Set(['--json', '--print-env', '--print-env-only']);
  const filtered = [];
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const option = raw.startsWith('--') ? raw.split('=', 1)[0] : '';
    const secretOption = /(?:token|secret|password|private-key)/i.test(option);
    if (option === '--root' || omittedFlags.has(option) || secretOption) {
      if (!raw.includes('=') && argv[index + 1] && !argv[index + 1].startsWith('--') && option !== '--json' && option !== '--print-env' && option !== '--print-env-only') {
        index += 1;
      }
      continue;
    }
    filtered.push(raw);
  }
  const rootPreview = process.platform === 'win32'
    ? `'${String(root).replace(/'/g, "''")}'`
    : `'${String(root).replace(/'/g, "'\\''")}'`;
  return `${shellCommandPreview(['codexgpt', 'start', ...filtered, '--root'])} ${rootPreview}`;
}

function runtimeOwnsEndpoint(runtime, host, port) {
  try {
    const endpoint = new URL(runtime.localBase);
    const endpointHost = endpoint.hostname === '[::1]' ? '::1' : endpoint.hostname;
    return endpoint.protocol === 'http:' && endpointHost === host && endpoint.port === String(port);
  } catch {
    return false;
  }
}

function redactForLog(value) {
  return String(value)
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_SECRET]')
    .replace(/\b(?:sk-ant-[A-Za-z0-9_-]{10,}|gh[opsru]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9_-]{20,})\b/g, '[REDACTED_SECRET]')
    .replace(/\b(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED_SECRET]')
    .replace(/([?&](?:codexgpt_token|token|access_token|auth_token|api[_-]?key)=)[^&\s"'`<>]{8,}/gi, '$1[REDACTED_SECRET]')
    .replace(/(["']?[A-Za-z0-9_]{0,64}(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)[A-Za-z0-9_]{0,64}["']?\s*:\s*)(?:"[^"\r\n]{12,512}"|'[^'\r\n]{12,512}'|`[^`\r\n]{12,512}`|[A-Za-z0-9_./+=-]{20,512})/gi, '$1[REDACTED_SECRET]')
    .replace(/\b[A-Za-z0-9_]{0,64}(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)[A-Za-z0-9_]{0,64}\s*=\s*(?:"[^"\r\n]{12,512}"|'[^'\r\n]{12,512}'|`[^`\r\n]{12,512}`|[A-Za-z0-9_./+=-]{20,512})/gi, (match) => {
      const index = match.indexOf('=');
      return index < 0 ? '[REDACTED_SECRET]' : `${match.slice(0, index).trimEnd()}= [REDACTED_SECRET]`;
    });
}

function redactEnvObject(env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|CODEXGPT_CONFIG_INTEGRITY_KEY)/i.test(key)
      ? '<redacted>'
      : redactForLog(String(value));
  }
  return out;
}

function trimBytes(value, maxBytes) {
  return trimUtf8Bytes(redactForLog(value), maxBytes);
}

function splitCommandTemplate(input) {
  const tokens = [];
  let current = '';
  let quote = '';
  let tokenStarted = false;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') {
      const next = text[i + 1];
      tokenStarted = true;
      if (next && (next === quote || next === '\\' || (!quote && /\s|["']/.test(next)))) {
        current += next;
        i += 1;
      } else {
        current += char;
      }
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      else {
        tokenStarted = true;
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(current);
        current = '';
        tokenStarted = false;
      }
      continue;
    }
    tokenStarted = true;
    current += char;
  }
  if (quote) throw new Error('Custom command has an unterminated quote.');
  if (tokenStarted) tokens.push(current);
  return tokens;
}

function applyCommandTemplate(value, replacements) {
  return String(value).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, key) => replacements[key] ?? '');
}

function buildExecutorCommand(args, root, planPath, planText) {
  const agent = String(args.agent ?? 'opencode').trim().toLowerCase();
  const model = String(args.model ?? process.env.CODEXGPT_AGENT_MODEL ?? '').trim();
  const replacements = {
    model,
    plan_file: planPath,
    plan_text: planText,
    root
  };

  if (args.command) {
    const template = String(args.command);
    if (!/\{\{\s*(plan_file|plan_text)\s*\}\}/.test(template)) {
      throw new Error('Custom --command must include {{plan_file}} or {{plan_text}} so the agent receives the handoff.');
    }
    const parts = splitCommandTemplate(template).map((part) => applyCommandTemplate(part, replacements));
    const displayParts = splitCommandTemplate(template).map((part) => applyCommandTemplate(part, { ...replacements, plan_text: '<plan_text>' }));
    if (!parts.length) throw new Error('Custom --command is empty.');
    return { agent, model, command: parts[0], args: parts.slice(1), displayArgs: displayParts.slice(1), custom: true };
  }

  if (agent === 'opencode') {
    return {
      agent,
      model,
      command: 'opencode',
      args: ['run', ...(model ? ['--model', model] : []), planText],
      displayArgs: ['run', ...(model ? ['--model', model] : []), '<plan_text>'],
      custom: false
    };
  }
  if (agent === 'pi') {
    return {
      agent,
      model,
      command: 'pi',
      args: [...(model ? ['--model', model] : []), '-p', planText],
      displayArgs: [...(model ? ['--model', model] : []), '-p', '<plan_text>'],
      custom: false
    };
  }
  if (agent === 'codex') {
    const codexLastMessagePath = path.join(path.dirname(planPath), 'codex-last-message.md');
    const relativePlanPath = path.relative(root, planPath) || planPath;
    const CodexGPTmpt = [
      `Read the handoff plan at ${relativePlanPath} and execute it in this workspace.`,
      'Keep changes scoped to that plan.',
      'Do not modify .ai-bridge/current-plan.md.',
      'When finished, summarize changed files and verification.'
    ].join(' ');
    return {
      agent,
      model,
      command: resolveCodexCommand(),
      args: [
        'exec',
        '--ephemeral',
        '--sandbox',
        'workspace-write',
        '-c',
        'approval_policy="never"',
        '--output-last-message',
        codexLastMessagePath,
        ...(model ? ['--model', model] : []),
        CodexGPTmpt
      ],
      displayArgs: [
        'exec',
        '--ephemeral',
        '--sandbox',
        'workspace-write',
        '-c',
        'approval_policy="never"',
        '--output-last-message',
        path.relative(root, codexLastMessagePath),
        ...(model ? ['--model', model] : []),
        `<read ${relativePlanPath}>`
      ],
      custom: false
    };
  }
  if (agent === 'custom') {
    throw new Error('Custom agent execution requires --command.');
  }
  throw new Error(`Unsupported --agent ${agent}. Use opencode, pi, codex, or custom with --command.`);
}

function executorCommandPreview(commandInfo) {
  return shellCommandPreview([commandInfo.command, ...(commandInfo.displayArgs ?? commandInfo.args)]);
}

function quoteWindowsCmdArg(value) {
  const text = String(value).replace(/\r?\n/g, ' ');
  if (!text) return '""';
  return `"${text.replace(/"/g, '""')}"`;
}

function processInvocation(command, args) {
  if (!isWindowsBatchFile(command)) return { command, args };
  const commandLine = ['call', quoteWindowsCmdArg(command), ...args.map(quoteWindowsCmdArg)].join(' ');
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', commandLine],
    windowsVerbatimArguments: true
  };
}

function runProcessCaptured(command, args, options) {
  const timeoutMs = options.timeoutMs;
  const maxOutputBytes = options.maxOutputBytes;
  const retainedOutputBytes = maxOutputBytes + 1;
  const started = Date.now();
  return new Promise((resolve) => {
    const invocation = processInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let closed = false;
    const appendBounded = (current, chunk) => {
      if (Buffer.byteLength(current, 'utf8') > retainedOutputBytes) return current;
      const next = current + String(chunk);
      const buffer = Buffer.from(next, 'utf8');
      return buffer.byteLength > retainedOutputBytes
        ? buffer.subarray(0, retainedOutputBytes).toString('utf8')
        : next;
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!closed) child.kill('SIGKILL');
      }, 1500).unref();
    }, timeoutMs);
    timer.unref();

    child.stdout.on('data', (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: 127,
        signal: null,
        durationMs: Date.now() - started,
        timedOut,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        spawnError: true
      });
    });
    child.on('close', (exitCode, signal) => {
      closed = true;
      clearTimeout(timer);
      const out = trimBytes(stdout, maxOutputBytes);
      const err = trimBytes(`${stderr}${timedOut ? `\n[codexgpt] Command timed out after ${timeoutMs} ms.` : ''}`, maxOutputBytes);
      resolve({
        exitCode,
        signal,
        durationMs: Date.now() - started,
        timedOut,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
        spawnError: false
      });
    });
  });
}

function readGitDiff(root, maxBytes) {
  const result = spawnSync('git', ['diff', '--no-ext-diff', '--'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: Math.max(maxBytes * 2, 1_000_000),
    shell: false
  });
  if (result.status !== 0) {
    const reason = result.stderr || result.stdout || `git diff exited ${result.status}`;
    return `# git diff unavailable\n\n${redactForLog(reason).trim()}\n`;
  }
  const diff = result.stdout || '';
  if (!diff.trim()) return '';
  return trimBytes(diff, maxBytes).text;
}

function readGitStatus(root, maxBytes) {
  const result = spawnSync('git', ['status', '--short'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: Math.max(maxBytes * 2, 1_000_000),
    shell: false
  });
  if (result.status !== 0) {
    const reason = result.stderr || result.stdout || `git status exited ${result.status}`;
    return `# git status unavailable\n\n${redactForLog(reason).trim()}\n`;
  }
  const status = result.stdout || '';
  return status.trim() ? trimBytes(status, maxBytes).text : '';
}

function codeBlock(label, value) {
  return `## ${label}\n\n\`\`\`text\n${String(value || '').replace(/```/g, '`\\`\\`') || '(empty)'}\n\`\`\`\n`;
}

let localMutationModulesPromise;

async function localMutationModules() {
  localMutationModulesPromise ??= Promise.all([
    import(pathToFileURL(path.join(projectRoot, 'dist', 'config.js')).href),
    import(pathToFileURL(path.join(projectRoot, 'dist', 'guard.js')).href),
    import(pathToFileURL(path.join(projectRoot, 'dist', 'fsOps.js')).href),
    import(pathToFileURL(path.join(projectRoot, 'dist', 'mutations', 'index.js')).href)
  ]);
  return localMutationModulesPromise;
}

function workspaceRelativePath(root, absolutePath) {
  const relative = path.relative(root, absolutePath).replace(/\\/g, '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error('Workspace mutation path is outside the selected root.');
  }
  return relative;
}

async function commitWorkspaceWrites(root, writes, toolName) {
  const [configModule, guardModule, fsOpsModule, mutationModule] = await localMutationModules();
  const config = configModule.loadConfig(replaceSingleValueOption(process.argv.slice(2), '--root', root));
  const guard = new guardModule.PathGuard(config);
  const workspaces = new guardModule.WorkspaceManager(config);
  const workspace = workspaces.openWorkspace(root);
  const prepared = await fsOpsModule.prepareWorkspaceTextBatch(config, guard, workspace, writes);
  const service = new mutationModule.LocalMutationService(config, guard);
  try {
    await service.executeBatch(workspace, prepared, { ok: true }, { toolName });
  } finally {
    service.dispose();
  }
}

async function writeExecutionOutputs(root, contextDir, commandInfo, result, diffText, gitStatusText, finalRunState) {
  const bridgeDir = resolveWorkspaceFile(root, contextDir);
  const statusPath = path.join(bridgeDir, 'agent-status.md');
  const diffPath = path.join(bridgeDir, 'implementation-diff.patch');
  const logPath = path.join(bridgeDir, 'execution-log.jsonl');
  const commandText = executorCommandPreview(commandInfo);
  const status = [
    '# Agent Execution Status',
    '',
    `Updated: ${new Date().toISOString()}`,
    `Agent: ${commandInfo.agent}`,
    commandInfo.model ? `Model: ${commandInfo.model}` : '',
    `Command: ${commandText}`,
    `Exit code: ${result.exitCode ?? 'null'}`,
    result.signal ? `Signal: ${result.signal}` : '',
    `Timed out: ${result.timedOut ? 'yes' : 'no'}`,
    `Duration: ${result.durationMs} ms`,
    `Diff path: ${path.posix.join(contextDir, 'implementation-diff.patch')}`,
    `Execution log: ${path.posix.join(contextDir, 'execution-log.jsonl')}`,
    '',
    codeBlock('Git status excerpt', gitStatusText),
    '',
    codeBlock('Stdout excerpt', result.stdout),
    codeBlock('Stderr excerpt', result.stderr)
  ].filter(Boolean).join('\n');
  const logEvent = {
    ts: new Date().toISOString(),
    event: 'execute_handoff',
    agent: commandInfo.agent,
    model: commandInfo.model || undefined,
    command: commandText,
    exit_code: result.exitCode,
    signal: result.signal,
    timed_out: result.timedOut,
    duration_ms: result.durationMs,
    stdout_excerpt: result.stdout,
    stderr_excerpt: result.stderr,
    git_status_excerpt: gitStatusText || undefined,
    diff_path: path.posix.join(contextDir, 'implementation-diff.patch'),
    status_path: path.posix.join(contextDir, 'agent-status.md')
  };
  const writes = [
    { path: workspaceRelativePath(root, statusPath), content: status, mode: 'replace' },
    { path: workspaceRelativePath(root, diffPath), content: diffText || '', mode: 'replace' },
    { path: workspaceRelativePath(root, logPath), content: `${JSON.stringify(logEvent)}\n`, mode: 'append' }
  ];
  if (finalRunState) {
    const statePath = handoffRunStatePath(root, contextDir);
    writes.push({
      path: workspaceRelativePath(root, statePath),
      content: `${JSON.stringify({ version: 1, updated_at: new Date().toISOString(), ...finalRunState }, null, 2)}\n`,
      mode: 'replace'
    });
  }
  await commitWorkspaceWrites(root, writes, 'execute_handoff');
  return { statusPath, diffPath, logPath };
}

async function confirmLocalExecution(args, root, commandInfo) {
  if (args.yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Use --yes to execute a local handoff in non-interactive shells, or use --dry-run to preview.');
  }
  printBox('Confirm local execution', [
    labelValue('Workspace', root),
    labelValue('Agent', commandInfo.agent),
    ...(commandInfo.model ? [labelValue('Model', commandInfo.model)] : []),
    labelValue('Command', executorCommandPreview(commandInfo)),
    'This runs a local process in the workspace. CodexGPT will collect status, logs, and git diff into .ai-bridge.'
  ]);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await ask(rl, 'Run this local agent now?', 'no');
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

function loadHandoffExecution(args) {
  const root = realDir(args.root ?? process.env.CODEXGPT_ROOT ?? process.cwd());
  const contextDir = contextDirFromArgs(args);
  const bridgeDir = resolveWorkspaceFile(root, contextDir);
  const planPath = path.join(bridgeDir, 'current-plan.md');
  const maxReadBytes = handoffMaxReadBytes();
  const maxOutputBytes = numberOption(args.maxOutputBytes ?? process.env.CODEXGPT_MAX_OUTPUT_BYTES, 120_000, 4_000, 2_000_000);
  const timeoutMs = numberOption(args.timeoutMs ?? args.timeout, 600_000, 1_000, 24 * 60 * 60_000);
  if (!fs.existsSync(planPath)) {
    throw new Error(`No handoff plan found at ${path.relative(root, planPath)}. Ask ChatGPT to call handoff_to_agent first.`);
  }
  const planText = readTextFileBounded(planPath, maxReadBytes);
  const commandInfo = buildExecutorCommand(args, root, planPath, planText);
  const commandText = executorCommandPreview(commandInfo);
  return {
    root,
    contextDir,
    bridgeDir,
    planPath,
    planText,
    commandInfo,
    commandText,
    maxOutputBytes,
    timeoutMs
  };
}

function printHandoffDryRun(request, title = 'CodexGPT execute-handoff dry run') {
  printBox(title, [
    labelValue('Workspace', request.root),
    labelValue('Plan', path.relative(request.root, request.planPath)),
    labelValue('Agent', request.commandInfo.agent),
    ...(request.commandInfo.model ? [labelValue('Model', request.commandInfo.model)] : []),
    labelValue('Command', request.commandText),
    'No command was executed and no .ai-bridge result files were changed.'
  ]);
}

async function executeHandoffRequest(request, args, options = {}) {
  const confirmed = options.skipConfirmation ? true : await confirmLocalExecution(args, request.root, request.commandInfo);
  if (!confirmed) {
    statusLine('warn', 'Execution cancelled.');
    return { cancelled: true, result: null, outputs: null };
  }

  if (!commandAvailableFromRoot(request.commandInfo.command, request.root)) {
    throw new Error(`${request.commandInfo.command} was not found. Install it, add it to PATH, pass an absolute path, or use --command.`);
  }

  const iteration = Number.isFinite(options.iteration) ? options.iteration : 1;
  const runPlanHash = planHash(request.planText);
  const startedAt = new Date().toISOString();
  await writeHandoffRunState(request.root, request.contextDir, {
    state: 'running',
    iteration,
    started_at: startedAt,
    finished_at: null,
    plan_hash: runPlanHash,
    executor: request.commandInfo.agent,
    model: request.commandInfo.model || undefined,
    pid: process.pid
  });

  statusLine('wait', `Running ${request.commandInfo.agent}: ${request.commandText}`);
  const result = await runProcessCaptured(request.commandInfo.command, request.commandInfo.args, {
    cwd: request.root,
    timeoutMs: request.timeoutMs,
    maxOutputBytes: request.maxOutputBytes
  });
  const diffText = readGitDiffExcludingContext(request.root, request.contextDir, request.maxOutputBytes);
  const gitStatusText = readGitStatus(request.root, request.maxOutputBytes);
  const runState = result.timedOut ? 'timed_out' : (result.exitCode === 0 ? 'completed' : 'failed');
  const testsAbsPath = path.join(request.bridgeDir, 'loop-tests.txt');
  const finalRunState = {
    state: runState,
    iteration,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    plan_hash: runPlanHash,
    executor: request.commandInfo.agent,
    model: request.commandInfo.model || undefined,
    exit_code: result.exitCode ?? null,
    timed_out: Boolean(result.timedOut),
    duration_ms: result.durationMs,
    status_file: path.posix.join(request.contextDir, 'agent-status.md'),
    diff_file: path.posix.join(request.contextDir, 'implementation-diff.patch'),
    log_file: path.posix.join(request.contextDir, 'execution-log.jsonl'),
    ...(fs.existsSync(testsAbsPath) ? { tests_file: path.posix.join(request.contextDir, 'loop-tests.txt') } : {})
  };
  const outputs = await writeExecutionOutputs(
    request.root,
    request.contextDir,
    request.commandInfo,
    result,
    diffText,
    gitStatusText,
    finalRunState
  );
  statusLine(result.exitCode === 0 ? 'ok' : 'warn', `Agent exited with code ${result.exitCode ?? 'null'}${result.signal ? ` signal=${result.signal}` : ''}`);
  console.log(`Status: ${path.relative(request.root, outputs.statusPath)}`);
  console.log(`Diff:   ${path.relative(request.root, outputs.diffPath)}`);
  console.log(`Log:    ${path.relative(request.root, outputs.logPath)}`);
  return { cancelled: false, result, outputs };
}

async function runExecuteHandoff(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }
  const request = loadHandoffExecution(args);

  if (args.dryRun) {
    printHandoffDryRun(request);
    return;
  }

  const execution = await executeHandoffRequest(request, args);
  if (execution.result && execution.result.exitCode !== 0) process.exitCode = execution.result.exitCode ?? 1;
}

function planHash(planText) {
  return createHash('sha256').update(planText).digest('hex');
}

function isScaffoldedHandoffPlan(planText) {
  return String(planText).trim() === '# Current Plan\n\nNo plan written yet.';
}

function readWatchState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function handoffRunStatePath(root, contextDir) {
  return resolveWorkspaceFile(root, path.posix.join(contextDir, 'handoff-run-state.json'));
}

// Machine-readable lifecycle state for an in-flight or completed handoff run.
// ChatGPT-side tooling (the read-only wait_for_handoff MCP tool) polls this file
// instead of inferring run state from markdown/log artifacts.
async function writeHandoffRunState(root, contextDir, state) {
  const statePath = handoffRunStatePath(root, contextDir);
  const payload = { version: 1, updated_at: new Date().toISOString(), ...state };
  await commitWorkspaceWrites(root, [{
    path: workspaceRelativePath(root, statePath),
    content: `${JSON.stringify(payload, null, 2)}\n`,
    mode: 'replace'
  }], 'execute_handoff');
}

async function appendBridgeLog(root, contextDir, event) {
  const bridgeDir = resolveWorkspaceFile(root, contextDir);
  const logPath = path.join(bridgeDir, 'execution-log.jsonl');
  await commitWorkspaceWrites(root, [{
    path: workspaceRelativePath(root, logPath),
    content: `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`,
    mode: 'append'
  }], 'handoff_run_log');
}

async function waitForStablePlan(planPath, debounceMs) {
  try {
    const before = fs.statSync(planPath);
    await sleep(debounceMs);
    const after = fs.statSync(planPath);
    return before.isFile() && after.isFile() && before.size === after.size && before.mtimeMs === after.mtimeMs;
  } catch {
    return false;
  }
}

async function confirmWatchHandoff(args, root) {
  if (args.yes || args.noConfirm) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Use --yes to start watch-handoff in non-interactive shells.');
  }
  printBox('Confirm handoff watcher', [
    labelValue('Workspace', root),
    labelValue('Agent', args.agent ?? 'opencode'),
    ...(args.model ? [labelValue('Model', args.model)] : []),
    'This starts a local-only watcher. Each new .ai-bridge/current-plan.md hash runs through the configured local agent.',
    'ChatGPT only writes the handoff plan; this terminal-owned process performs execution.'
  ]);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await ask(rl, 'Start automatic local handoff execution?', 'no');
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

async function runWatchHandoff(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }
  const root = realDir(args.root ?? process.env.CODEXGPT_ROOT ?? process.cwd());
  const contextDir = contextDirFromArgs(args);
  const bridgeDir = resolveWorkspaceFile(root, contextDir);
  const planPath = path.join(bridgeDir, 'current-plan.md');
  const statePath = resolveWorkspaceFile(root, args.stateFile ?? path.posix.join(contextDir, 'watch-handoff-state.json'));
  const pollIntervalMs = numberOption(args.pollIntervalMs ?? args.pollInterval, 2000, 250, 60_000);
  const debounceMs = numberOption(args.debounceMs, 500, 0, 30_000);
  let state = readWatchState(statePath);
  let lastDryRunHash = state.lastPlanHash ?? '';
  let lastSkippedHash = '';
  let stopped = false;

  if (!args.dryRun) {
    const approved = await confirmWatchHandoff(args, root);
    if (!approved) {
      statusLine('warn', 'Watcher cancelled.');
      return;
    }
  }

  printBox('CodexGPT watch-handoff', [
    labelValue('Workspace', root),
    labelValue('Plan', path.relative(root, planPath)),
    labelValue('State', path.relative(root, statePath)),
    labelValue('Agent', args.agent ?? 'opencode'),
    ...(args.model ? [labelValue('Model', args.model)] : []),
    labelValue('Poll', `${pollIntervalMs} ms`),
    labelValue('Debounce', `${debounceMs} ms`),
    args.once ? 'Mode: check once and exit.' : 'Mode: watching until Ctrl+C.'
  ]);

  const stop = () => {
    stopped = true;
    statusLine('warn', 'Stopping handoff watcher...');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopped) {
    if (!fs.existsSync(planPath)) {
      if (args.once) throw new Error(`No handoff plan found at ${path.relative(root, planPath)}.`);
      await sleep(pollIntervalMs);
      continue;
    }

    const stable = await waitForStablePlan(planPath, debounceMs);
    if (!stable) {
      if (args.once) throw new Error(`Handoff plan did not become stable at ${path.relative(root, planPath)}.`);
      await sleep(pollIntervalMs);
      continue;
    }

    const request = loadHandoffExecution({ ...args, root, contextDir });
    const currentHash = planHash(request.planText);
    if (isScaffoldedHandoffPlan(request.planText)) {
      if (lastSkippedHash !== currentHash) statusLine('wait', 'Ignoring scaffolded empty handoff plan.');
      lastSkippedHash = currentHash;
      if (args.once) return;
      await sleep(pollIntervalMs);
      continue;
    }
    if (state.lastPlanHash === currentHash || lastDryRunHash === currentHash) {
      statusLine(args.once ? 'ok' : 'wait', `No new handoff plan: ${currentHash.slice(0, 12)}`);
      if (args.once) return;
      await sleep(pollIntervalMs);
      continue;
    }

    if (args.dryRun) {
      printHandoffDryRun(request, 'CodexGPT watch-handoff dry run');
      lastDryRunHash = currentHash;
      if (args.once) return;
      await sleep(pollIntervalMs);
      continue;
    }

    await appendBridgeLog(root, contextDir, {
      event: 'watch_handoff_started',
      plan_hash: currentHash,
      agent: request.commandInfo.agent,
      model: request.commandInfo.model || undefined,
      plan_path: path.posix.join(contextDir, 'current-plan.md')
    });

    const execution = await executeHandoffRequest(request, { ...args, yes: true }, { skipConfirmation: true });
    const exitCode = execution.result?.exitCode ?? null;
    state = {
      lastPlanHash: currentHash,
      lastRanAt: new Date().toISOString(),
      agent: request.commandInfo.agent,
      model: request.commandInfo.model || undefined,
      exitCode,
      planPath: path.posix.join(contextDir, 'current-plan.md')
    };
    await commitWorkspaceWrites(root, [
      {
        path: workspaceRelativePath(root, statePath),
        content: `${JSON.stringify(state, null, 2)}\n`,
        mode: 'replace'
      },
      {
        path: path.posix.join(contextDir, 'execution-log.jsonl'),
        content: `${JSON.stringify({
          ts: new Date().toISOString(),
          event: 'watch_handoff_finished',
          plan_hash: currentHash,
          agent: request.commandInfo.agent,
          model: request.commandInfo.model || undefined,
          exit_code: exitCode,
          status_path: path.posix.join(contextDir, 'agent-status.md'),
          diff_path: path.posix.join(contextDir, 'implementation-diff.patch')
        })}\n`,
        mode: 'append'
      }
    ], 'watch_handoff');

    if (args.once) {
      if (execution.result && execution.result.exitCode !== 0) process.exitCode = execution.result.exitCode ?? 1;
      return;
    }

    await sleep(pollIntervalMs);
  }
}

function loopArtifactPaths(root, contextDir) {
  const bridgeDir = resolveWorkspaceFile(root, contextDir);
  return {
    bridgeDir,
    planPath: path.join(bridgeDir, 'current-plan.md'),
    statusPath: path.join(bridgeDir, 'agent-status.md'),
    diffPath: path.join(bridgeDir, 'implementation-diff.patch'),
    logPath: path.join(bridgeDir, 'execution-log.jsonl'),
    testsPath: path.join(bridgeDir, 'loop-tests.txt'),
    reviewPath: path.join(bridgeDir, 'loop-review.md'),
    statePath: path.join(bridgeDir, 'loop-handoff-state.json')
  };
}

function buildTemplateCommand(template, replacements, displayReplacements, label) {
  const parts = splitCommandTemplate(template).map((part) => applyCommandTemplate(part, replacements));
  const displayParts = splitCommandTemplate(template).map((part) => applyCommandTemplate(part, displayReplacements ?? replacements));
  if (!parts.length) throw new Error(`${label} command is empty.`);
  return {
    command: parts[0],
    args: parts.slice(1),
    displayArgs: displayParts.slice(1),
    displayCommand: shellCommandPreview([displayParts[0], ...displayParts.slice(1)])
  };
}

function loopTemplateReplacements(root, contextDir, iteration, paths) {
  return {
    root,
    context_dir: resolveWorkspaceFile(root, contextDir),
    iteration: String(iteration),
    plan_file: paths.planPath,
    status_file: paths.statusPath,
    diff_file: paths.diffPath,
    log_file: paths.logPath,
    tests_file: paths.testsPath,
    review_file: paths.reviewPath,
    state_file: paths.statePath
  };
}

function buildReviewerCommand(args, root, contextDir, iteration, paths) {
  const template = String(args.reviewCommand ?? '').trim();
  if (!template) throw new Error('loop-handoff requires --review-command <template>.');
  const replacements = loopTemplateReplacements(root, contextDir, iteration, paths);
  return buildTemplateCommand(template, replacements, replacements, 'Review');
}

function buildTestCommand(args, root, contextDir, iteration, paths) {
  const template = String(args.runTests ?? '').trim();
  if (!template) return null;
  const replacements = loopTemplateReplacements(root, contextDir, iteration, paths);
  return buildTemplateCommand(template, replacements, replacements, 'Test');
}

function commandDisplay(commandInfo) {
  return shellCommandPreview([commandInfo.command, ...(commandInfo.displayArgs ?? commandInfo.args)]);
}

function gitStatusPorcelain(root, maxBytes = 1_000_000) {
  return runGitText(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', '.'], maxBytes);
}

function normalizedContextDir(contextDir) {
  return String(contextDir || '.ai-bridge').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
}

function normalizeStatusPath(value) {
  return String(value || '').replace(/^"|"$/g, '').replace(/\\"/g, '"');
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function statusLinePaths(line) {
  const value = String(line || '').slice(3).trim();
  const renameIndex = value.indexOf(' -> ');
  if (renameIndex < 0) return [normalizeStatusPath(value)];
  return [
    normalizeStatusPath(value.slice(0, renameIndex)),
    normalizeStatusPath(value.slice(renameIndex + 4))
  ];
}

function gitWorkspacePrefix(root) {
  const topLevel = runGitText(root, ['rev-parse', '--show-toplevel'], 100_000).trim();
  return toPosixPath(path.relative(topLevel, root)).replace(/\/+$/, '');
}

function workspacePathFromGitPath(filePath, workspacePrefix) {
  const normalized = toPosixPath(filePath).replace(/^\.?\//, '');
  const prefix = toPosixPath(workspacePrefix).replace(/\/+$/, '');
  if (!prefix) return normalized;
  if (normalized === prefix) return '';
  if (normalized.startsWith(`${prefix}/`)) return normalized.slice(prefix.length + 1);
  return null;
}

function statusLineWorkspacePaths(line, workspacePrefix) {
  return statusLinePaths(line)
    .map((filePath) => workspacePathFromGitPath(filePath, workspacePrefix))
    .filter((filePath) => filePath !== null && filePath !== '');
}

function workspaceStatusLine(line, workspacePaths) {
  return `${String(line || '').slice(0, 3)}${workspacePaths.join(' -> ')}`;
}

function isContextStatusLine(line, contextDir, workspacePrefix = '') {
  const context = normalizedContextDir(contextDir);
  const paths = statusLineWorkspacePaths(line, workspacePrefix);
  return paths.length > 0 && paths.every((filePath) => filePath === context || filePath.startsWith(`${context}/`));
}

function assertCleanGitStart(root, contextDir) {
  const status = gitStatusPorcelain(root);
  const workspacePrefix = gitWorkspacePrefix(root);
  const nonContextStatus = status.split(/\r?\n/).map((line) => {
    if (!line.trim()) return '';
    const paths = statusLineWorkspacePaths(line, workspacePrefix);
    if (!paths.length || paths.every(contextPathPredicate(contextDir))) return '';
    return workspaceStatusLine(line, paths);
  }).filter(Boolean).join('\n');
  if (nonContextStatus.trim()) {
    throw new Error(`--require-clean-git-start refused to start because the workspace has non-handoff changes:\n${nonContextStatus}`);
  }
}

function runGitText(root, args, maxBytes) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: Math.max(maxBytes * 2, 1_000_000),
    shell: false
  });
  if (result.status !== 0) {
    const reason = result.stderr || result.stdout || `git ${args.join(' ')} exited ${result.status}`;
    throw new Error(redactForLog(reason).trim());
  }
  return result.stdout || '';
}

function singleLineSummary(value) {
  return String(value).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

function fileSha256(filePath) {
  const hash = createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  try {
    for (;;) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function boundedFileFingerprint(filePath, stat) {
  const hash = createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  let remaining = Math.min(stat.size, UNTRACKED_FILE_HASH_BYTES);
  try {
    while (remaining > 0) {
      const bytesRead = fs.readSync(fd, buffer, 0, Math.min(buffer.length, remaining), null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      remaining -= bytesRead;
    }
  } finally {
    fs.closeSync(fd);
  }
  const hashLabel = stat.size > UNTRACKED_FILE_HASH_BYTES ? `sha256_first_${UNTRACKED_FILE_HASH_BYTES}` : 'sha256';
  const truncated = stat.size > UNTRACKED_FILE_HASH_BYTES ? ', fingerprint_truncated=true' : '';
  return `${stat.size} bytes, ${hashLabel}=${hash.digest('hex')}${truncated}`;
}

function untrackedEntrySummary(root, relPath) {
  const absPath = path.resolve(root, relPath);
  try {
    const stat = fs.lstatSync(absPath);
    if (stat.isSymbolicLink()) {
      const target = singleLineSummary(trimBytes(fs.readlinkSync(absPath), UNTRACKED_SYMLINK_TARGET_BYTES).text);
      return `- ${relPath} (symlink, target=${target})`;
    }
    if (!stat.isFile()) return `- ${relPath} (${stat.isDirectory() ? 'directory' : 'non-file'})`;
    return `- ${relPath} (${boundedFileFingerprint(absPath, stat)})`;
  } catch (error) {
    return `- ${relPath} (unavailable: ${singleLineSummary(redactForLog(error instanceof Error ? error.message : String(error)))})`;
  }
}

function untrackedFilesSummary(root, contextDir, maxBytes) {
  const context = normalizedContextDir(contextDir);
  const output = runGitText(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.'], 1_000_000);
  const entries = output.split('\0').filter(Boolean).filter((relPath) => relPath !== context && !relPath.startsWith(`${context}/`));
  if (!entries.length) return '';
  const lines = [];
  let usedBytes = 0;
  let omitted = 0;
  const budget = Math.max(1_024, maxBytes);
  for (const relPath of entries.sort()) {
    const line = untrackedEntrySummary(root, relPath);
    const lineBytes = Buffer.byteLength(`${line}\n`, 'utf8');
    if (usedBytes + lineBytes > budget) {
      omitted += 1;
      continue;
    }
    lines.push(line);
    usedBytes += lineBytes;
  }
  if (omitted) lines.push(`- ... ${omitted} untracked entries omitted after ${budget} bytes`);
  return `${lines.join('\n')}\n`;
}

function contextPathPredicate(contextDir) {
  const context = normalizedContextDir(contextDir);
  return (filePath) => filePath === context || filePath.startsWith(`${context}/`);
}

function pathStateForFingerprint(root, relPath, options = {}) {
  const absPath = path.resolve(root, relPath);
  try {
    const stat = fs.lstatSync(absPath);
    const type = stat.isSymbolicLink()
      ? 'symlink'
      : stat.isFile()
        ? 'file'
        : stat.isDirectory()
          ? 'directory'
          : 'non-file';
    const parts = [
      `type=${type}`,
      `mode=${stat.mode}`,
      `size=${stat.size}`
    ];
    if (stat.isSymbolicLink()) parts.push(`target=${singleLineSummary(fs.readlinkSync(absPath))}`);
    if (stat.isFile()) {
      parts.push(options.fullFileHash ? `sha256=${fileSha256(absPath)}` : boundedFileFingerprint(absPath, stat));
    }
    return parts.join(';');
  } catch (error) {
    return `unavailable:${singleLineSummary(redactForLog(error instanceof Error ? error.message : String(error)))}`;
  }
}

function changeFingerprintExcludingContext(root, contextDir) {
  const context = normalizedContextDir(contextDir);
  const isContextPath = contextPathPredicate(contextDir);
  const workspacePrefix = gitWorkspacePrefix(root);
  const status = gitStatusPorcelain(root, 25_000_000);
  const stagedRaw = runGitText(root, ['diff', '--cached', '--raw', '-z', '--no-ext-diff', '--', '.', `:(exclude)${context}`], 25_000_000);
  const hash = createHash('sha256');
  hash.update(`staged-raw\0${stagedRaw}\0`);
  for (const line of status.split(/\r?\n/).filter(Boolean).sort()) {
    const paths = statusLineWorkspacePaths(line, workspacePrefix);
    if (!paths.length) continue;
    if (paths.length && paths.every(isContextPath)) continue;
    hash.update(`status\0${workspaceStatusLine(line, paths)}\0`);
    const fullFileHash = !line.startsWith('?? ');
    for (const filePath of paths) {
      hash.update(`path\0${filePath}\0${pathStateForFingerprint(root, filePath, { fullFileHash })}\0`);
    }
  }
  return hash.digest('hex');
}

function readGitDiffExcludingContext(root, contextDir, maxBytes) {
  const context = normalizedContextDir(contextDir);
  try {
    const staged = runGitText(root, ['diff', '--cached', '--no-ext-diff', '--', '.', `:(exclude)${context}`], maxBytes);
    const unstaged = runGitText(root, ['diff', '--no-ext-diff', '--', '.', `:(exclude)${context}`], maxBytes);
    const untracked = untrackedFilesSummary(root, contextDir, maxBytes);
    const sections = [];
    if (staged.trim()) sections.push(`# Staged diff\n\n${staged}`);
    if (unstaged.trim()) sections.push(`# Unstaged diff\n\n${unstaged}`);
    if (untracked.trim()) sections.push(`# Untracked files\n\n${untracked}`);
    if (!sections.length) return '';
    return trimBytes(sections.join('\n\n'), maxBytes).text;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return boundedTextArtifact('# git changes unavailable', redactForLog(detail), maxBytes);
  }
}

async function writeLoopTestOutput(root, paths, result, commandText) {
  const content = [
    '# Loop Test Output',
    '',
    `Updated: ${new Date().toISOString()}`,
    `Command: ${commandText}`,
    `Exit code: ${result.exitCode ?? 'null'}`,
    result.signal ? `Signal: ${result.signal}` : '',
    `Timed out: ${result.timedOut ? 'yes' : 'no'}`,
    `Duration: ${result.durationMs} ms`,
    '',
    codeBlock('Stdout excerpt', result.stdout),
    codeBlock('Stderr excerpt', result.stderr)
  ].filter(Boolean).join('\n');
  await commitWorkspaceWrites(root, [{
    path: workspaceRelativePath(root, paths.testsPath),
    content,
    mode: 'replace'
  }], 'loop_handoff');
}

function explicitReviewVerdict(text) {
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const assignment = line.match(/^CODEXGPT_REVIEW\s*=\s*(PASS|FAIL)\b/i);
    if (assignment) return assignment[1].toUpperCase();
  }
  return '';
}

async function writeLoopReviewOutput(root, paths, result, commandText, verdict, nextPlanChanged) {
  const content = [
    '# Loop Review',
    '',
    `Updated: ${new Date().toISOString()}`,
    `Command: ${commandText}`,
    `Verdict: ${verdict || 'unknown'}`,
    `Next plan changed: ${nextPlanChanged ? 'yes' : 'no'}`,
    `Exit code: ${result.exitCode ?? 'null'}`,
    result.signal ? `Signal: ${result.signal}` : '',
    `Timed out: ${result.timedOut ? 'yes' : 'no'}`,
    `Duration: ${result.durationMs} ms`,
    '',
    codeBlock('Stdout excerpt', result.stdout),
    codeBlock('Stderr excerpt', result.stderr)
  ].filter(Boolean).join('\n');
  await commitWorkspaceWrites(root, [{
    path: workspaceRelativePath(root, paths.reviewPath),
    content,
    mode: 'replace'
  }], 'loop_handoff');
}

async function runLoopCommand(commandInfo, root, timeoutMs, maxOutputBytes, label) {
  if (!commandAvailableFromRoot(commandInfo.command, root)) {
    throw new Error(`${label} command was not found: ${commandInfo.command}`);
  }
  statusLine('wait', `Running ${label.toLowerCase()}: ${commandDisplay(commandInfo)}`);
  return runProcessCaptured(commandInfo.command, commandInfo.args, {
    cwd: root,
    timeoutMs,
    maxOutputBytes
  });
}

function assertLoopCommandAvailable(commandInfo, root, label) {
  if (!commandAvailableFromRoot(commandInfo.command, root)) {
    throw new Error(`${label} command was not found before starting loop-handoff: ${commandInfo.command}`);
  }
}

function preflightLoopCommands(request, reviewCommand, testCommand) {
  assertLoopCommandAvailable(request.commandInfo, request.root, 'Executor');
  assertLoopCommandAvailable(reviewCommand, request.root, 'Review');
  if (testCommand) assertLoopCommandAvailable(testCommand, request.root, 'Test');
}

async function confirmLoopHandoff(args, root) {
  if (args.yes || args.noConfirm || args.dryRun) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Use --yes to start loop-handoff in non-interactive shells, or use --dry-run to preview.');
  }
  printBox('Confirm handoff loop', [
    labelValue('Workspace', root),
    labelValue('Agent', args.agent ?? 'opencode'),
    ...(args.model ? [labelValue('Model', args.model)] : []),
    labelValue('Max iters', args.maxIters ?? '3'),
    labelValue('Reviewer', args.reviewCommand ?? ''),
    'This runs local executor and reviewer commands in a bounded loop. It does not automate ChatGPT or any browser session.'
  ]);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await ask(rl, 'Start local execute/review loop?', 'no');
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

async function confirmLoopContinuation(args, root, iteration, planPath) {
  if (!args.requireHumanConfirmation) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('--require-human-confirmation needs an interactive terminal before running follow-up plans.');
  }
  printBox('Confirm follow-up plan', [
    labelValue('Workspace', root),
    labelValue('Iteration', String(iteration)),
    labelValue('Plan', path.relative(root, planPath)),
    'The reviewer wrote or kept a follow-up plan. Review it before continuing.'
  ]);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await ask(rl, 'Run the next local executor iteration?', 'no');
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

function printLoopDryRun(request, reviewCommand, testCommand, maxIters) {
  printBox('CodexGPT loop-handoff dry run', [
    labelValue('Workspace', request.root),
    labelValue('Plan', path.relative(request.root, request.planPath)),
    labelValue('Agent', request.commandInfo.agent),
    ...(request.commandInfo.model ? [labelValue('Model', request.commandInfo.model)] : []),
    labelValue('Max iters', String(maxIters)),
    labelValue('Executor', request.commandText),
    ...(testCommand ? [labelValue('Tests', commandDisplay(testCommand))] : []),
    labelValue('Reviewer', commandDisplay(reviewCommand)),
    'No command was executed and no .ai-bridge result files were changed.'
  ]);
}

async function runLoopHandoff(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  const root = realDir(args.root ?? process.env.CODEXGPT_ROOT ?? process.cwd());
  const contextDir = contextDirFromArgs(args);
  const paths = loopArtifactPaths(root, contextDir);
  const maxIters = numberOption(args.maxIters ?? args.maxIterations, 3, 1, 25);
  const maxReadBytes = handoffMaxReadBytes();
  const maxOutputBytes = numberOption(args.maxOutputBytes ?? process.env.CODEXGPT_MAX_OUTPUT_BYTES, 120_000, 4_000, 2_000_000);
  const reviewTimeoutMs = numberOption(args.reviewTimeoutMs, 600_000, 1_000, 24 * 60 * 60_000);
  const testTimeoutMs = numberOption(args.testTimeoutMs, 600_000, 1_000, 24 * 60 * 60_000);

  if (args.requireCleanGitStart) assertCleanGitStart(root, contextDir);

  let request = loadHandoffExecution({ ...args, root, contextDir });
  const reviewCommand = buildReviewerCommand(args, root, contextDir, 1, paths);
  const testCommand = buildTestCommand(args, root, contextDir, 1, paths);

  if (args.dryRun) {
    printLoopDryRun(request, reviewCommand, testCommand, maxIters);
    return;
  }

  preflightLoopCommands(request, reviewCommand, testCommand);

  const approved = await confirmLoopHandoff(args, root);
  if (!approved) {
    statusLine('warn', 'Loop cancelled.');
    return;
  }

  printBox('CodexGPT loop-handoff', [
    labelValue('Workspace', root),
    labelValue('Plan', path.relative(root, paths.planPath)),
    labelValue('Agent', request.commandInfo.agent),
    ...(request.commandInfo.model ? [labelValue('Model', request.commandInfo.model)] : []),
    labelValue('Max iters', String(maxIters)),
    labelValue('Reviewer', commandDisplay(reviewCommand)),
    ...(testCommand ? [labelValue('Tests', commandDisplay(testCommand))] : []),
    'Mode: local execute/review loop. No ChatGPT or browser session is automated.'
  ]);

  let previousChangeFingerprint = '';
  let finalVerdict = 'FAIL';
  let stopReason = 'max_iters';

  for (let iteration = 1; iteration <= maxIters; iteration += 1) {
    if (iteration > 1) {
      const continueLoop = await confirmLoopContinuation(args, root, iteration, paths.planPath);
      if (!continueLoop) {
        stopReason = 'human_cancelled';
        break;
      }
    }

    request = loadHandoffExecution({ ...args, root, contextDir });
    const currentPlanHash = planHash(request.planText);
    if (isScaffoldedHandoffPlan(request.planText)) {
      stopReason = 'scaffolded_plan';
      statusLine('warn', 'Stopping because current-plan.md is still the empty scaffold.');
      break;
    }

    await appendBridgeLog(root, contextDir, {
      event: 'loop_handoff_iteration_started',
      iteration,
      plan_hash: currentPlanHash,
      agent: request.commandInfo.agent,
      model: request.commandInfo.model || undefined
    });

    const beforeExecutionFingerprint = changeFingerprintExcludingContext(root, contextDir);
    const execution = await executeHandoffRequest(request, { ...args, yes: true }, { skipConfirmation: true, iteration });
    const diffText = readGitDiffExcludingContext(root, contextDir, maxOutputBytes);
    const currentChangeFingerprint = changeFingerprintExcludingContext(root, contextDir);
    const changedThisIteration = currentChangeFingerprint !== beforeExecutionFingerprint;

    if (args.stopIfNoFilesChanged && !changedThisIteration) {
      finalVerdict = 'FAIL';
      stopReason = 'no_files_changed';
      statusLine('warn', 'Stopping because the executor produced no new git changes.');
      break;
    }
    if (args.stopIfSameDiff && previousChangeFingerprint && currentChangeFingerprint === previousChangeFingerprint) {
      finalVerdict = 'FAIL';
      stopReason = 'same_diff';
      statusLine('warn', 'Stopping because the executor repeated the previous diff.');
      break;
    }
    previousChangeFingerprint = currentChangeFingerprint;

    const iterationTestCommand = buildTestCommand(args, root, contextDir, iteration, paths);
    let testResult = null;
    if (iterationTestCommand) {
      testResult = await runLoopCommand(iterationTestCommand, root, testTimeoutMs, maxOutputBytes, 'Test');
      await writeLoopTestOutput(root, paths, testResult, commandDisplay(iterationTestCommand));
      statusLine(testResult.exitCode === 0 ? 'ok' : 'warn', `Tests exited with code ${testResult.exitCode ?? 'null'}${testResult.signal ? ` signal=${testResult.signal}` : ''}`);
    }

    const iterationReviewCommand = buildReviewerCommand(args, root, contextDir, iteration, paths);
    const beforeReviewPlanExists = fs.existsSync(paths.planPath);
    const beforeReviewPlan = beforeReviewPlanExists ? readTextFileBounded(paths.planPath, maxReadBytes) : '';
    const reviewResult = await runLoopCommand(iterationReviewCommand, root, reviewTimeoutMs, maxOutputBytes, 'Review');
    const afterReviewPlanExists = fs.existsSync(paths.planPath);
    const afterReviewPlan = afterReviewPlanExists ? readTextFileBounded(paths.planPath, maxReadBytes) : '';
    const planDeletedByReview = beforeReviewPlanExists && !afterReviewPlanExists;
    const nextPlanChanged = planDeletedByReview || (afterReviewPlanExists && planHash(afterReviewPlan) !== planHash(beforeReviewPlan));
    const hasUsableFollowupPlan = afterReviewPlanExists && afterReviewPlan.trim() && !isScaffoldedHandoffPlan(afterReviewPlan);
    let verdict = explicitReviewVerdict(`${reviewResult.stdout}\n${reviewResult.stderr}`);
    if (!verdict && args.allowImplicitReviewVerdict && nextPlanChanged && reviewResult.exitCode === 0) verdict = 'FAIL';
    if (!verdict && args.allowImplicitReviewVerdict && afterReviewPlanExists && reviewResult.exitCode === 0 && execution.result?.exitCode === 0 && (!testResult || testResult.exitCode === 0)) verdict = 'PASS';
    await writeLoopReviewOutput(root, paths, reviewResult, commandDisplay(iterationReviewCommand), verdict, nextPlanChanged);
    let acceptedVerdict = verdict;
    let rejectedPassReason = '';
    if (verdict === 'PASS' && reviewResult.exitCode !== 0) {
      acceptedVerdict = 'FAIL';
      rejectedPassReason = 'reviewer_failed';
    } else if (verdict === 'PASS' && !args.allowReviewPassOnFailure && execution.result?.exitCode !== 0) {
      acceptedVerdict = 'FAIL';
      rejectedPassReason = 'executor_failed';
    } else if (verdict === 'PASS' && !args.allowReviewPassOnFailure && testResult && testResult.exitCode !== 0) {
      acceptedVerdict = 'FAIL';
      rejectedPassReason = 'tests_failed';
    }

    const iterationFinishedEvent = {
      event: 'loop_handoff_iteration_finished',
      iteration,
      plan_hash: currentPlanHash,
      agent: request.commandInfo.agent,
      model: request.commandInfo.model || undefined,
      executor_exit_code: execution.result?.exitCode ?? null,
      test_exit_code: testResult?.exitCode ?? null,
      reviewer_exit_code: reviewResult.exitCode,
      reviewer_verdict: verdict,
      verdict: acceptedVerdict,
      rejected_pass_reason: rejectedPassReason || undefined,
      next_plan_changed: nextPlanChanged,
      followup_plan_exists: afterReviewPlanExists,
      has_usable_followup_plan: Boolean(hasUsableFollowupPlan),
      changed_this_iteration: changedThisIteration,
      status_path: path.posix.join(contextDir, 'agent-status.md'),
      diff_path: path.posix.join(contextDir, 'implementation-diff.patch'),
      tests_path: iterationTestCommand ? path.posix.join(contextDir, 'loop-tests.txt') : undefined,
      review_path: path.posix.join(contextDir, 'loop-review.md')
    };
    const iterationState = {
      updatedAt: new Date().toISOString(),
      iteration,
      maxIters,
      reviewerVerdict: verdict,
      verdict: acceptedVerdict,
      rejectedPassReason: rejectedPassReason || undefined,
      planHash: currentPlanHash,
      nextPlanChanged,
      followupPlanExists: afterReviewPlanExists,
      hasUsableFollowupPlan: Boolean(hasUsableFollowupPlan),
      changedThisIteration,
      executorExitCode: execution.result?.exitCode ?? null,
      reviewerExitCode: reviewResult.exitCode
    };
    await commitWorkspaceWrites(root, [
      {
        path: workspaceRelativePath(root, paths.logPath),
        content: `${JSON.stringify({ ts: new Date().toISOString(), ...iterationFinishedEvent })}\n`,
        mode: 'append'
      },
      {
        path: workspaceRelativePath(root, paths.statePath),
        content: `${JSON.stringify(iterationState, null, 2)}\n`,
        mode: 'replace'
      }
    ], 'loop_handoff');

    if (acceptedVerdict === 'PASS') {
      finalVerdict = 'PASS';
      stopReason = 'pass';
      statusLine('ok', `Reviewer passed on iteration ${iteration}.`);
      break;
    }

    if (rejectedPassReason) {
      if (rejectedPassReason === 'reviewer_failed') {
        finalVerdict = 'FAIL';
        stopReason = 'reviewer_error';
        statusLine('warn', `Reviewer returned PASS, but reviewer process exited with code ${reviewResult.exitCode ?? 'null'}.`);
        break;
      }
      if (rejectedPassReason === 'executor_failed') {
        finalVerdict = 'FAIL';
        stopReason = 'executor_failed';
        statusLine('warn', `Reviewer returned PASS, but executor exited with code ${execution.result?.exitCode ?? 'null'}.`);
        break;
      }
      finalVerdict = 'FAIL';
      stopReason = 'tests_failed';
      statusLine('warn', `Reviewer returned PASS, but tests exited with code ${testResult?.exitCode ?? 'null'}.`);
      break;
    }

    if (acceptedVerdict !== 'FAIL') {
      finalVerdict = 'FAIL';
      stopReason = reviewResult.exitCode === 0 ? 'unknown_verdict' : 'reviewer_error';
      statusLine('warn', `Stopping because reviewer did not return a usable verdict. Exit code: ${reviewResult.exitCode ?? 'null'}`);
      break;
    }

    if (reviewResult.exitCode !== 0) {
      finalVerdict = 'FAIL';
      stopReason = 'reviewer_error';
      statusLine('warn', `Stopping because reviewer exited with code ${reviewResult.exitCode ?? 'null'}.`);
      break;
    }

    if (!nextPlanChanged || !hasUsableFollowupPlan) {
      finalVerdict = 'FAIL';
      stopReason = 'no_followup_plan';
      statusLine('warn', 'Reviewer returned FAIL but did not update current-plan.md.');
      break;
    }

    statusLine('wait', `Reviewer requested another iteration (${iteration}/${maxIters}).`);
  }

  await appendBridgeLog(root, contextDir, {
    event: 'loop_handoff_finished',
    verdict: finalVerdict,
    stop_reason: stopReason
  });
  statusLine(finalVerdict === 'PASS' ? 'ok' : 'warn', `Loop finished: ${finalVerdict} (${stopReason}).`);
  console.log(`Status: ${path.relative(root, paths.statusPath)}`);
  console.log(`Diff:   ${path.relative(root, paths.diffPath)}`);
  console.log(`Review: ${path.relative(root, paths.reviewPath)}`);
  console.log(`Log:    ${path.relative(root, paths.logPath)}`);
  if (finalVerdict !== 'PASS') process.exitCode = 1;
}

function createConnectorDetails(endpoint, token, localBase = '', options = {}) {
  const serverUrl = endpointWithToken(endpoint, token);
  const localStatusBase = options.localStatusBase ?? localBase;
  return {
    endpoint,
    token,
    authMode: options.authMode ?? 'legacy',
    serverUrl,
    localStatusUrl: options.authMode === 'oauth'
      ? ''
      : localStatusBase ? endpointWithToken(`${localStatusBase}/`, token) : '',
    chatgptSettingsUrl: 'https://chatgpt.com/#settings/Connectors'
  };
}

function printCreateAppFields(details) {
  console.log('Create App fields:');
  console.log('');
  console.log('  Name: CodexGPT');
  console.log('  Description: Local coding workspace bridge for ChatGPT.');
  console.log('  Connection: Server URL');
  console.log(`  Server URL: ${details.serverUrl}`);
  console.log(`  Authentication: ${details.authMode === 'oauth' ? 'OAuth' : 'No Authentication / None'}`);
  console.log('');
  if (details.token) {
    console.log('If your ChatGPT UI supports custom headers instead, you can use:');
    console.log('');
    console.log(`  Authorization: Bearer ${details.token}`);
  } else if (details.authMode !== 'oauth') {
    console.log('Authorization: disabled');
  }
}

function oauthPendingCount(root) {
  if (!root) return null;
  const result = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', 'oauth-admin.mjs'), 'status', '--root', root, '--json'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000
  });
  if (result.error || result.status !== 0) return null;
  try {
    const status = JSON.parse(result.stdout);
    return status.live?.authorizations?.filter((entry) => entry.status === 'pending').length ?? 0;
  } catch {
    return null;
  }
}

function openOAuthAdmin(root) {
  if (!root) return false;
  const result = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', 'oauth-admin.mjs'), 'open', '--root', root], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
    timeout: 15000
  });
  return !result.error && result.status === 0;
}

function printConnectorBlock(endpoint, token, options = {}) {
  const details = createConnectorDetails(endpoint, token, options.localBase ?? '', {
    authMode: options.authMode ?? 'legacy',
    localStatusBase: options.localStatusBase ?? options.localBase ?? ''
  });
  const { serverUrl } = details;
  const publicHttps = serverUrl.startsWith('https://');
  const shouldCopy = options.copyUrl === true || (options.copyUrl !== false && publicHttps);
  const copied = shouldCopy ? copyToClipboard(serverUrl) : { ok: false, command: '' };
  const opened = options.openChatgpt ? openUrl(details.chatgptSettingsUrl) : false;

  const mode = options.mode ?? 'agent';
  const modeTitle = mode === 'agent' ? 'Agent' : mode === 'handoff' ? 'Handoff' : 'Pro planning';
  console.log('');
  console.log(paint('bold', 'CodexGPT ready'));
  if (options.root) console.log(`  Workspace  ${options.root}`);
  console.log(`  Mode       ${modeTitle}  tools=${options.toolMode ?? 'standard'}  write=${options.write ?? 'workspace'}  bash=${options.bash ?? 'safe'}`);
  console.log(`  Transcript bash=${options.bashTranscript ?? 'compact'}`);
  if (options.codexSessions && options.codexSessions !== 'off') console.log(`  Codex      sessions=${options.codexSessions}`);
  if (options.bashSession) console.log(`  Bash       session=${options.bashSession}${options.requireBashSession ? ' required' : ''}`);
  console.log(`  Connector  ${publicHttps ? 'public HTTPS' : 'local HTTP'}`);
  if (copied.ok) {
    console.log(`  URL        copied with ${copied.command}`);
    if (details.authMode !== 'oauth') console.log('  Secret URL hidden; press u to show it explicitly');
  } else if (shouldCopy) {
    console.log(details.authMode === 'oauth'
      ? '  URL        clipboard unavailable; press u to show the URL'
      : '  URL        clipboard unavailable; press u to show the secret URL');
  } else if (options.copyUrl === false && publicHttps) {
    console.log('  URL        not copied; press c to copy or u to show');
  } else if (!publicHttps) {
    console.log('  URL        local HTTP only');
    console.log(serverUrl);
  }
  if (options.openChatgpt) {
    statusLine(opened ? 'ok' : 'warn', opened ? 'Opened ChatGPT connector settings' : 'Could not open ChatGPT automatically');
  }
  console.log('');
  if (options.connectionTest) {
    console.log(paint('bold', 'Connection test'));
    if (details.authMode === 'oauth') {
      console.log('  OAuth discovery and listener separation are ready.');
      console.log('  MCP authorization remains unavailable until the later Phase 8 OAuth vertical slice.');
    } else {
      console.log('  1. In ChatGPT, open Settings -> Plugins and create a development plugin.');
      if (publicHttps) {
        console.log(copied.ok
          ? '  2. Paste the copied Server URL and choose Authentication: No Authentication.'
          : '  2. Press u to show the secret Server URL, then paste it and choose Authentication: No Authentication.');
      } else {
        console.log('  2. Paste the Server URL above and choose Authentication: No Authentication.');
      }
      console.log('  3. Watch this terminal for: [CodexGPT] POST /mcp received');
      console.log('');
      console.log('  No POST /mcp     ChatGPT or the tunnel did not reach CodexGPT.');
      console.log('  POST /mcp -> 401 The full Server URL, including codexgpt_token, was not used.');
      console.log('  POST /mcp -> 2xx The MCP connection reached CodexGPT successfully.');
    }
    console.log('');
  }
  if (details.authMode === 'oauth') {
    const pending = oauthPendingCount(options.root);
    console.log(pending === null
      ? 'Approvals: local owner channel unavailable; run codexgpt auth status for the exact repair.'
      : `Approvals: ${pending} pending link${pending === 1 ? '' : 's'}; press a to open the local approval page.`);
    console.log('Next: create or refresh the ChatGPT App with this token-free Server URL, then approve the link locally.');
  } else if (publicHttps && !copied.ok) {
    console.log('Next: press u to show the secret Server URL, then open ChatGPT and choose Authentication: None.');
  } else {
    console.log('Next: press Enter to open ChatGPT, paste the copied Server URL, choose Authentication: None.');
  }
  console.log(details.authMode === 'oauth'
    ? 'Keys: Enter open ChatGPT | a approvals | c copy | u show URL | h help | q quit'
    : 'Keys: Enter open | c copy | u show URL | o status | h help | q quit');
  return { ...details, copied, opened, mode, toolMode: options.toolMode ?? 'standard', root: options.root ?? '' };
}

function printControlHelp(authMode = 'legacy') {
  console.log('');
  console.log('Controls');
  console.log('  Enter  open ChatGPT connector settings in your browser');
  console.log('  c      copy Server URL again');
  console.log('  u      print Server URL only');
  if (authMode === 'oauth') console.log('  a      open the authenticated local OAuth approval page');
  else console.log('  o      open local setup/status page');
  console.log('  p      print Create App fields');
  console.log('  m      print mode help');
  console.log('  h      show controls');
  console.log('  q      stop CodexGPT');
  console.log('');
}

function printModeHelp() {
  console.log('');
  console.log('Modes');
  console.log('  codexgpt start                 agent mode: read/write/edit/apply_patch/search/bash');
  console.log('  codexgpt start --no-bash       agent mode without ChatGPT-triggered shell commands');
  console.log('  codexgpt start --bash-session main --require-bash-session');
  console.log('  codexgpt start --mode handoff  planning-only .ai-bridge handoff');
  console.log('  codexgpt start --mode pro      export context for models without MCP tools');
  console.log('  codexgpt start --tool-mode minimal   expose only the tight coding loop');
  console.log('  codexgpt start --tool-mode full      expose every advanced compatibility tool');
  console.log('');
}

function printStableUrlHelp() {
  console.log('');
  console.log('Stable URL setup');
  console.log('');
  console.log('Quick tunnels change every restart. ChatGPT apps should use a stable URL.');
  console.log('');
  console.log('One-time Cloudflare setup with your domain:');
  console.log('  codexgpt install-cloudflared');
  console.log('  ~/.codexgpt/bin/cloudflared tunnel login');
  console.log('  ~/.codexgpt/bin/cloudflared tunnel create codexgpt');
  console.log('  ~/.codexgpt/bin/cloudflared tunnel route dns codexgpt codexgpt.example.com');
  console.log('');
  console.log('Daily start:');
  console.log('  codexgpt stable --hostname codexgpt.example.com --tunnel-name codexgpt --token keep-this-stable-token');
  console.log('');
  console.log('Ngrok alternative with a reserved domain:');
  console.log('  ngrok config add-authtoken <your-ngrok-token>');
  console.log('  codexgpt ngrok --hostname your-domain.ngrok-free.dev --token keep-this-stable-token');
  console.log('');
  console.log('Tailscale Funnel alternative:');
  console.log('  tailscale funnel 8787');
  console.log('  codexgpt tailscale --hostname your-device.your-tailnet.ts.net --token keep-this-stable-token');
  console.log('');
}

function compareMajorVersion(version, minimumMajor) {
  const major = Number(String(version).split('.')[0]);
  return Number.isFinite(major) && major >= minimumMajor;
}

function browserOpenCommand() {
  if (process.platform === 'darwin') return commandExists('open') ? 'open' : '';
  if (process.platform === 'win32') return 'cmd start';
  return commandExists('xdg-open') ? 'xdg-open' : '';
}

function clipboardCommand() {
  if (process.platform === 'darwin') return commandExists('pbcopy') ? 'pbcopy' : '';
  if (process.platform === 'win32') return 'clip';
  for (const command of ['wl-copy', 'xclip', 'xsel']) {
    if (commandExists(command)) return command;
  }
  return '';
}

function localOrPathCommand(command, localPath) {
  if (command && commandAvailable(command)) return command;
  if (localPath && executableFileExists(localPath)) return localPath;
  return '';
}

function doctorLine(status, label, detail = '') {
  const marker = status === 'ok' ? paint('green', 'OK') : status === 'warn' ? paint('yellow', 'WARN') : paint('red', 'FAIL');
  console.log(`${marker} ${label.padEnd(18)} ${detail}`);
}

async function runDoctor(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  const bootstrap = await resolveLauncherBootstrap(argv);
  const root = realDir(bootstrap.effective.rootInput);
  const profile = bootstrap.effective.noProfile ? {} : loadWorkspaceProfile(root);
  const effectiveArgs = { ...profile, ...args };
  const tunnel = optionValue(args, profile, 'tunnel', ['CODEXGPT_TUNNEL'], 'cloudflare');
  const host = optionValue(args, profile, 'host', ['CODEXGPT_HOST'], '127.0.0.1');
  const port = normalizePort(String(optionValue(args, profile, 'port', ['CODEXGPT_PORT'], '8787')));
  const mode = optionValue(args, profile, 'mode', ['CODEXGPT_MODE'], 'agent');
  const bash = optionValue(args, profile, 'bash', ['CODEXGPT_BASH_MODE'], 'safe');
  const rawWrite = optionValue(args, profile, 'write', ['CODEXGPT_WRITE_MODE'], mode === 'agent' ? 'workspace' : 'handoff');
  let write = String(rawWrite);
  let writeError = '';
  try {
    write = effectiveWriteMode(mode, rawWrite);
  } catch (error) {
    writeError = error instanceof Error ? error.message : String(error);
  }
  const toolMode = optionValue(args, profile, 'toolMode', ['CODEXGPT_TOOL_MODE'], 'standard');
  const stableHostname = args.hostname
    ?? args.url
    ?? process.env.CODEXGPT_PUBLIC_HOSTNAME
    ?? process.env.CODEXGPT_HOSTNAME
    ?? process.env.NGROK_DOMAIN
    ?? profile.hostname
    ?? '';
  const authMode = String(process.env.CODEXGPT_AUTH_MODE ?? profile.authMode ?? 'legacy').trim();
  if (authMode !== 'legacy' && authMode !== 'oauth') {
    throw new Error('Authentication mode must be exactly legacy or oauth.');
  }
  const localAdminPort = authMode === 'oauth'
    ? normalizePort(String(profile.localAdminPort ?? ''))
    : '';
  const allowRoots = [root, ...(args.allowRoots ?? [])].map(realDir);
  const bashTranscript = bashTranscriptOption(args, profile);
  const codexSessions = codexSessionsOption(args, profile);
  const codexDir = resolveCodexDir(root, optionValue(args, profile, 'codexDir', ['CODEXGPT_CODEX_DIR'], ''));
  const { bashSession, requireBashSession } = bashSessionOptions(args, profile);
  const widgetDomain = optionValue(args, profile, 'widgetDomain', ['CODEXGPT_WIDGET_DOMAIN'], 'https://rebel0789.github.io');
  const toolCards = optionBool(args, profile, 'toolCards', ['CODEXGPT_TOOL_CARDS'], false);
  const semanticProvider = optionValue(args, profile, 'semanticProvider', ['CODEXGPT_SEMANTIC_PROVIDER'], 'builtin');
  const semanticMode = process.env.CODEXGPT_SEMANTIC_MODE === 'legacy'
    ? 'legacy'
    : process.env.CODEXGPT_SEMANTIC_MODE === 'standard'
      ? 'standard'
      : profile.semanticProvider && toolMode !== 'minimal'
        ? 'standard'
        : 'legacy';
  const configuredToken = optionValue(args, profile, 'token', ['CODEXGPT_HTTP_TOKEN', 'CODEBASE_BRIDGE_HTTP_TOKEN'], '');
  const plannedToken = authMode === 'oauth' || args.noAuth ? '' : configuredToken || 'doctor-planned-token';
  const doctorServerEnv = buildRuntimeServerEnvironment({
    baseEnvironment: process.env,
    root,
    allowRoots,
    host,
    port,
    bash,
    bashTranscript,
    bashSession,
    requireBashSession,
    codexSessions,
    write,
    toolMode,
    widgetDomain,
    toolCards,
    semanticMode,
    semanticProvider,
    connectionTest: false,
    mode,
    authMode,
    tunnel,
    noAuth: Boolean(args.noAuth),
    codexDir,
    logRequests: Boolean(args.logRequests || process.env.CODEXGPT_LOG_REQUESTS === '1'),
    allowHome: Boolean(args.allowHome),
    token: plannedToken
  });
  const runtimeConfigSnapshot = await resolveRuntimeConfigSnapshot(root, doctorServerEnv, {
    noProfile: Boolean(args.noProfile),
    argv
  });
  const httpPath = path.join(projectRoot, 'dist', 'http.js');
  const serverPath = path.join(projectRoot, 'dist', 'server.js');
  const cloudflaredPath = localOrPathCommand(
    effectiveArgs.cloudflared ?? process.env.CLOUDFLARED_BIN ?? 'cloudflared',
    localCloudflaredPath()
  );
  const ngrokPath = localOrPathCommand(effectiveArgs.ngrok ?? process.env.NGROK_BIN ?? 'ngrok', '');
  const tailscalePath = localOrPathCommand(effectiveArgs.tailscale ?? process.env.TAILSCALE_BIN ?? 'tailscale', '');
  const clipboard = clipboardCommand();
  const browser = browserOpenCommand();
  const checks = [];

  function record(status, label, detail) {
    checks.push(Object.freeze({ status, label, detail: String(detail ?? '') }));
    if (!args.json) doctorLine(status, label, detail);
  }

  if (!args.json) {
    console.log('');
    printBox('CodexGPT doctor', [
      labelValue('Workspace', root),
      labelValue('Mode', `${mode}  tools=${toolMode}  write=${write}  bash=${bash}`),
      labelValue('Tunnel', tunnel),
      labelValue('Config fingerprint', runtimeConfigSnapshot.publicFingerprint),
      ...(stableHostname ? [labelValue('Hostname', stableHostname)] : []),
      ...(profile.profilePath ? [labelValue('Profile', profile.profilePath)] : [])
    ]);
  }

  record(compareMajorVersion(process.versions.node, 20) ? 'ok' : 'fail', 'Node', `v${process.versions.node} (requires >=20)`);
  record(fs.existsSync(httpPath) && fs.existsSync(serverPath) ? 'ok' : 'fail', 'Build artifacts', fs.existsSync(httpPath) ? 'dist ready' : 'missing dist/http.js; run npm install && npm run build');
  record(fs.existsSync(path.join(projectRoot, 'package.json')) ? 'ok' : 'fail', 'Package root', projectRoot);
  record(profile.profilePath ? 'ok' : 'warn', 'Saved profile', profile.profilePath ? profileSummary(profile) || profile.profilePath : 'none for this workspace');
  record(['agent', 'handoff', 'pro'].includes(mode) ? 'ok' : 'fail', 'Mode', ['agent', 'handoff', 'pro'].includes(mode) ? mode : '--mode must be agent, handoff, or pro');
  record(['off', 'safe', 'full'].includes(bash) ? 'ok' : 'fail', 'Bash mode', ['off', 'safe', 'full'].includes(bash) ? bash : '--bash must be off, safe, or full');
  record(!writeError && ['off', 'handoff', 'workspace'].includes(write) ? 'ok' : 'fail', 'Write mode', writeError || write);
  record(['minimal', 'standard', 'full'].includes(toolMode) ? 'ok' : 'fail', 'Tool mode', ['minimal', 'standard', 'full'].includes(toolMode) ? toolMode : '--tool-mode must be minimal, standard, or full');
  const savedRuntime = readRuntimeConnectionRecord(root);
  const restartCommand = restartCommandPreview(argv, root);
  if (savedRuntime.configFingerprint) {
    record(
      savedRuntime.configFingerprint === runtimeConfigSnapshot.publicFingerprint ? 'ok' : 'warn',
      'Config match',
      savedRuntime.configFingerprint === runtimeConfigSnapshot.publicFingerprint
        ? 'current configuration matches the live runtime record'
        : `current configuration differs from the live runtime record; stop it, then run: ${restartCommand}`
    );
  } else {
    record('ok', 'Config match', 'no live runtime record; comparison skipped');
  }
  const guidanceModeInput = process.env.CODEXGPT_GUIDANCE_MODE;
  const guidanceMode = guidanceModeInput === undefined && toolMode === 'minimal'
    ? 'legacy'
    : String(guidanceModeInput ?? 'standard').trim().toLowerCase();
  record(
    guidanceMode === 'legacy' || guidanceMode === 'standard' ? 'ok' : 'fail',
    'Guidance mode',
    guidanceMode === 'standard'
      ? 'standard is ready and enabled by default'
      : guidanceMode === 'legacy'
        ? guidanceModeInput === undefined && toolMode === 'minimal'
          ? 'minimal mode uses legacy compatibility because codex_context is unavailable'
          : 'explicit legacy rollback mode'
        : 'CODEXGPT_GUIDANCE_MODE must be legacy or standard'
  );
  if (guidanceMode === 'standard' && fs.existsSync(serverPath)) {
    try {
      const [{ discoverInstructions }, { discoverTargetSkills }, { buildSkillCatalog }] = await Promise.all([
        import(pathToFileURL(path.join(projectRoot, 'dist', 'guidance', 'instructions.js')).href),
        import(pathToFileURL(path.join(projectRoot, 'dist', 'guidance', 'skillDiscovery.js')).href),
        import(pathToFileURL(path.join(projectRoot, 'dist', 'guidance', 'skillCatalog.js')).href)
      ]);
      const runtimeConfig = runtimeConfigSnapshot.effective;
      const instructions = await discoverInstructions({
        root,
        targetPath: '.',
        fallbackNames: runtimeConfig.instructionFallbacks,
        maxFileBytes: 60000,
        maxTotalBytes: runtimeConfig.maxInstructionTotalBytes,
        blockedGlobs: runtimeConfig.blockedGlobs
      });
      const skills = await discoverTargetSkills({
        root,
        targetPath: '.',
        maxCandidates: runtimeConfig.maxSkillCandidates,
        maxSkills: 500,
        blockedGlobs: runtimeConfig.blockedGlobs
      });
      const catalog = buildSkillCatalog(skills.skills, runtimeConfig.maxSkillCatalogChars);
      record(instructions.complete ? 'ok' : 'warn', 'Project guidance', `${instructions.files.length} instruction file(s); ${instructions.diagnostics.length} diagnostic(s)`);
      for (const item of instructions.diagnostics.slice(0, 8)) {
        record('warn', 'Guidance detail', `${item.code}${item.path ? ` ${item.path}` : ''}; ${item.action}`);
      }
      for (const item of skills.diagnostics.slice(0, 8)) {
        record('warn', 'Skill diagnostic', `${item.code}${item.path ? ` ${item.path}` : ''}; ${item.action}`);
      }
      record(
        skills.scanTruncated || catalog.catalogOmittedCount > 0 || skills.invalidCount > 0 ? 'warn' : 'ok',
        'Project Skills',
        `${skills.validCount} valid, ${skills.invalidCount} invalid, ${catalog.entries.length} implicit; scan_truncated=${skills.scanTruncated}; catalog_omitted=${catalog.catalogOmittedCount}`
      );
      for (const skill of skills.skills.filter((item) => item.warnings.length || item.requirementsState !== 'none' || !item.implicitInvocation).slice(0, 8)) {
        const policy = !skill.implicitInvocation ? 'explicit-only' : skill.requirementsState;
        record('warn', 'Skill detail', `${skill.path}: ${[policy, ...skill.warnings].filter(Boolean).join(', ')}`);
      }
      record('ok', 'Skill resources', 'path-only index and one-file text reads use the blocked-secret and same-handle reader policy');
    } catch (error) {
      record('fail', 'Guidance scan', error instanceof Error ? error.message.split('\n')[0] : String(error));
    }
  }
  if (semanticMode === 'standard') {
    const typescriptPackage = path.join(projectRoot, 'node_modules', 'typescript', 'package.json');
    const semanticReady = semanticProvider === 'none' || fs.existsSync(typescriptPackage);
    record(
      ['builtin', 'none'].includes(semanticProvider) && semanticReady ? 'ok' : 'fail',
      'Semantic Core',
      semanticProvider === 'none'
        ? 'disabled by saved selector; ordinary tools remain available'
        : semanticReady
          ? 'builtin TypeScript ready; existing 51-tool Apps must Scan Tools once or be recreated'
          : 'builtin TypeScript asset missing; run npm install, then restart'
    );
  }
  record(clipboard ? 'ok' : 'warn', 'Clipboard', clipboard || 'not found; URL will be printed for manual copy');
  record(browser ? 'ok' : 'warn', 'Browser open', browser || 'not found; open ChatGPT manually');

  const ownedRuntimeActive =
    savedRuntime.configFingerprint === runtimeConfigSnapshot.publicFingerprint &&
    runtimeOwnsEndpoint(savedRuntime, host, port);
  if (ownedRuntimeActive) {
    record('ok', 'Local port', `owned runtime active at ${host}:${port}`);
  } else {
    try {
      await assertPortAvailable(host, port);
      record('ok', 'Local port', `${host}:${port} available`);
    } catch (error) {
      record('fail', 'Local port', error instanceof Error ? error.message.split('\n')[0] : String(error));
    }
  }

  if (tunnel === 'none') {
    record('ok', 'Tunnel', 'local-only mode');
  } else if (tunnel === 'cloudflare') {
    record(cloudflaredPath ? 'ok' : 'warn', 'cloudflared', cloudflaredPath || 'missing now; codexgpt start can auto-install unless --no-install-cloudflared is used');
  } else if (tunnel === 'cloudflare-named') {
    record(stableHostname ? 'ok' : 'fail', 'Hostname', stableHostname || 'required for Cloudflare stable mode');
    record(cloudflaredPath ? 'ok' : 'warn', 'cloudflared', cloudflaredPath || 'missing now; run codexgpt install-cloudflared or pass --cloudflared');
    record(
      optionValue(args, profile, 'tunnelName', ['CLOUDFLARE_TUNNEL_NAME', 'CODEXGPT_TUNNEL_NAME'], '') ||
        optionValue(args, profile, 'cloudflareTokenFile', ['CLOUDFLARE_TUNNEL_TOKEN_FILE', 'CODEXGPT_CLOUDFLARE_TUNNEL_TOKEN_FILE'], '') ||
        optionValue(args, profile, 'cloudflareConfig', ['CLOUDFLARE_TUNNEL_CONFIG', 'CODEXGPT_CLOUDFLARE_CONFIG'], '') ||
        optionValue(args, profile, 'cloudflareToken', ['CLOUDFLARE_TUNNEL_TOKEN', 'CODEXGPT_CLOUDFLARE_TUNNEL_TOKEN'], '')
        ? 'ok'
        : 'fail',
      'Cloudflare setup',
      'needs tunnel name, config, token file, or tunnel token'
    );
  } else if (tunnel === 'ngrok') {
    record(stableHostname ? 'ok' : 'fail', 'Hostname', stableHostname || 'required for ngrok mode');
    record(ngrokPath ? 'ok' : 'fail', 'ngrok', ngrokPath || 'not found on PATH; install ngrok and run ngrok config add-authtoken <token>');
  } else if (tunnel === 'tailscale') {
    record(stableHostname ? 'ok' : 'fail', 'Hostname', stableHostname || 'required for Tailscale Funnel mode');
    record(tailscalePath ? 'ok' : 'fail', 'tailscale', tailscalePath || 'not found on PATH; install Tailscale and enable Funnel');
  } else {
    record('fail', 'Tunnel', `unknown tunnel mode: ${tunnel}`);
  }

  const contractVersion = String(process.env.CODEXGPT_TOOL_CONTRACT_VERSION ?? '1');
  const policyMode = String(process.env.CODEXGPT_POLICY_ENGINE ?? 'legacy');
  const auditMode = String(process.env.CODEXGPT_AUDIT_MODE ?? 'off');
  const executionProfile = String(process.env.CODEXGPT_EXECUTION_PROFILE ?? 'off');
  const localFileAccess = String(process.env.CODEXGPT_LOCAL_FILE_ACCESS ?? 'configured_roots');
  const permissionProfile = String(process.env.CODEXGPT_PERMISSION_PROFILE ?? '');
  const nativeManifest = path.join(projectRoot, 'scripts', 'windows-process-host-manifest.json');
  const nativeBackendCandidate = process.platform === 'win32' && fs.existsSync(nativeManifest);
  const v3ApprovalConfiguration =
    (contractVersion === '3' || contractVersion === '4') &&
    policyMode === 'enforce' &&
    auditMode === 'required';
  record(
    executionProfile === 'off' || nativeBackendCandidate ? 'ok' : 'fail',
    'Execution backend',
    executionProfile === 'off'
      ? 'disabled'
      : nativeBackendCandidate
        ? 'manifest-bound Windows host configured; identity is rechecked at execution'
        : 'full_access requires the packaged native Windows host'
  );
  record(
    executionProfile === 'off' ? 'ok' : 'warn',
    'Job ownership',
    executionProfile === 'off'
      ? 'inactive'
      : 'candidate available; creation-time Job membership is proved per process'
  );
  record(
    executionProfile === 'off' ? 'ok' : 'warn',
    'ConPTY',
    executionProfile === 'off'
      ? 'inactive'
      : 'candidate available; capability and close watchdog are proved per interactive start'
  );
  record(
    executionProfile === 'off' || v3ApprovalConfiguration ? 'ok' : 'fail',
    'Approval pipe',
    executionProfile === 'off'
      ? 'inactive'
      : v3ApprovalConfiguration
        ? 'required local decision channel configured; not a human-presence proof'
        : 'full_access requires contract 3, Policy Kernel enforce, and required audit'
  );
  record(
    localFileAccess === 'confirmed_roots' ? 'warn' : 'ok',
    'Confirmed roots',
    localFileAccess === 'confirmed_roots'
      ? 'requested; activation still requires the built-in stable identity oracle and local approval'
      : 'configured_roots only'
  );
  record(
    executionProfile === 'full_access' && !permissionProfile ? 'fail' : executionProfile === 'full_access' ? 'warn' : 'ok',
    'Full access',
    executionProfile === 'full_access'
      ? permissionProfile
        ? 'ambient current-user authority; no filesystem, credential, registry, network, or broker-escape isolation'
        : 'CODEXGPT_PERMISSION_PROFILE is required'
      : 'disabled'
  );
  record(
    'warn',
    'Sandbox evidence',
    'unavailable; workspace mode must remain fail-closed until Phase 4B proves an offline filtered snapshot'
  );

  const configuration = createConfigExplanation(
    runtimeConfigSnapshot,
    buildConfigExplainInputs({
        argv,
        args,
        profile,
        root,
        runtime: runtimeConfigSnapshot.effective,
        authMode,
        tunnel,
        stableHostname,
        mode,
        localAdminPort,
        bash,
        bashTranscript,
        codexSessions,
        codexDir,
        bashSession,
        requireBashSession,
        write,
        toolMode,
        widgetDomain,
        toolCards,
        semanticMode,
        semanticProvider,
        token: plannedToken
    }),
    { restartCommand }
  );
  for (const diagnostic of configuration.diagnostics) {
    record('warn', 'Config compatibility', `${diagnostic.message} Next: ${diagnostic.remediation}`);
  }
  const failures = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;
  if (args.json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: 'doctor',
      ok: failures === 0,
      summary: { failures, warnings },
      configuration,
      checks
    }, null, 2)}\n`);
    if (failures) process.exitCode = 1;
    return;
  }

  console.log('');
  if (failures) {
    statusLine('warn', `${failures} blocker${failures === 1 ? '' : 's'} and ${warnings} warning${warnings === 1 ? '' : 's'} found.`);
    process.exitCode = 1;
    return;
  }
  statusLine('ok', warnings ? `Ready with ${warnings} warning${warnings === 1 ? '' : 's'}.` : 'Ready.');
}

function normalizeSetupChoice(value, allowed, fallback) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  const match = allowed.find((item) => item === normalized || item.startsWith(normalized));
  return match ?? fallback;
}

async function ask(rl, question, fallback = '') {
  const suffix = fallback ? ` ${paint('dim', `[${fallback}]`)}` : '';
  const hint = fallback ? `${paint('dim', '> Enter to proceed with default')}\n` : '';
  const answer = await rl.question(`${paint('cyan', '?')} ${question}${suffix}\n${hint}> `);
  return answer.trim() || fallback;
}

function tunnelChoiceFromProfile(profile, fallback = 'cloudflare') {
  if (profile?.tunnel === 'ngrok') return 'ngrok';
  if (profile?.tunnel === 'cloudflare-named') return 'stable';
  if (profile?.tunnel === 'tailscale') return 'tailscale';
  if (profile?.tunnel === 'none') return 'local';
  if (profile?.tunnel === 'cloudflare') return 'cloudflare';
  return fallback;
}

function tunnelModeFromChoice(choice) {
  if (choice === 'quick' || choice === 'cloudflare') return 'cloudflare';
  if (choice === 'stable') return 'cloudflare-named';
  if (choice === 'tailscale') return 'tailscale';
  if (choice === 'local') return 'none';
  return choice;
}

function hasExplicitTunnelInput(args) {
  return Boolean(
    args.tunnel ||
    args.noProfile ||
    process.env.CODEXGPT_TUNNEL
  );
}

async function collectTunnelPreference(rl, defaults, profile, options = {}) {
  const defaultTunnel = options.defaultTunnel ?? tunnelChoiceFromProfile(profile, 'cloudflare');
  const tunnelAnswer = await ask(rl, 'Tunnel: cloudflare, ngrok, tailscale, stable, or local?', defaultTunnel);
  const tunnelChoice = normalizeSetupChoice(tunnelAnswer, ['cloudflare', 'quick', 'ngrok', 'tailscale', 'stable', 'local'], defaultTunnel);
  const tunnel = tunnelModeFromChoice(tunnelChoice);
  let hostname = '';
  let tunnelName = '';
  let ngrokConfig = '';
  let cloudflareConfig = '';
  let cloudflareTokenFile = '';

  if (tunnel === 'ngrok') {
    hostname = await ask(
      rl,
      'Ngrok domain or URL, without /mcp',
      optionValue(defaults, profile, 'hostname', ['CODEXGPT_PUBLIC_HOSTNAME', 'CODEXGPT_HOSTNAME', 'NGROK_DOMAIN'], '')
    );
    if (!hostname) throw new Error('Ngrok setup needs your reserved domain, for example name.ngrok-free.dev.');
    hostname = normalizePublicHostname(hostname);
    ngrokConfig = optionValue(defaults, profile, 'ngrokConfig', ['NGROK_CONFIG', 'CODEXGPT_NGROK_CONFIG'], '');
  } else if (tunnel === 'cloudflare-named') {
    hostname = await ask(
      rl,
      'Stable Cloudflare hostname, without /mcp',
      optionValue(defaults, profile, 'hostname', ['CODEXGPT_PUBLIC_HOSTNAME', 'CODEXGPT_HOSTNAME'], '')
    );
    if (!hostname) throw new Error('Stable public URL setup needs a real hostname, for example codexgpt.yourdomain.com.');
    hostname = normalizePublicHostname(hostname);
    tunnelName = await ask(rl, 'Cloudflare tunnel name', optionValue(defaults, profile, 'tunnelName', ['CODEXGPT_TUNNEL_NAME', 'CLOUDFLARE_TUNNEL_NAME'], 'codexgpt'));
    cloudflareConfig = optionValue(defaults, profile, 'cloudflareConfig', ['CODEXGPT_CLOUDFLARE_CONFIG', 'CLOUDFLARE_TUNNEL_CONFIG'], '');
    cloudflareTokenFile = optionValue(defaults, profile, 'cloudflareTokenFile', ['CODEXGPT_CLOUDFLARE_TUNNEL_TOKEN_FILE', 'CLOUDFLARE_TUNNEL_TOKEN_FILE'], '');
  } else if (tunnel === 'tailscale') {
    hostname = await ask(
      rl,
      'Tailscale Funnel hostname, without /mcp',
      optionValue(defaults, profile, 'hostname', ['CODEXGPT_PUBLIC_HOSTNAME', 'CODEXGPT_HOSTNAME', 'TAILSCALE_FUNNEL_HOSTNAME'], '')
    );
    if (!hostname) throw new Error('Tailscale setup needs your Funnel hostname, for example machine.tailnet.ts.net.');
    hostname = normalizePublicHostname(hostname);
  }

  return {
    tunnel,
    hostname,
    tunnelName,
    ngrokConfig,
    cloudflareConfig,
    cloudflareTokenFile
  };
}

function applyTunnelPreferenceToArgs(args, preference) {
  args.tunnel = preference.tunnel;
  if (preference.hostname) args.hostname = preference.hostname;
  if (preference.tunnelName) args.tunnelName = preference.tunnelName;
  if (preference.ngrokConfig) args.ngrokConfig = preference.ngrokConfig;
  if (preference.cloudflareConfig) args.cloudflareConfig = preference.cloudflareConfig;
  if (preference.cloudflareTokenFile) args.cloudflareTokenFile = preference.cloudflareTokenFile;
}

function profileFromPreference(root, args, profile, preference) {
  const mode = optionValue(args, profile, 'mode', ['CODEXGPT_MODE'], 'agent');
  const port = String(optionValue(args, profile, 'port', ['CODEXGPT_PORT'], '8787'));
  const bash = optionValue(args, profile, 'bash', ['CODEXGPT_BASH_MODE'], '');
  const bashTranscript = bashTranscriptOption(args, profile);
  const codexSessions = codexSessionsOption(args, profile);
  const codexDir = optionValue(args, profile, 'codexDir', ['CODEXGPT_CODEX_DIR'], '');
  const { bashSession, requireBashSession } = bashSessionOptions(args, profile);
  const write = optionalWriteOption(args, profile, mode);
  const toolMode = optionValue(args, profile, 'toolMode', ['CODEXGPT_TOOL_MODE'], '');
  const widgetDomain = optionValue(args, profile, 'widgetDomain', ['CODEXGPT_WIDGET_DOMAIN'], '');
  const existingToken = optionValue(args, profile, 'token', ['CODEXGPT_HTTP_TOKEN', 'CODEBASE_BRIDGE_HTTP_TOKEN'], '');
  const token = preference.tunnel === 'none' ? existingToken : stableToken(existingToken);
  return {
    port,
    mode,
    tunnel: preference.tunnel,
    ...(preference.hostname ? { hostname: preference.hostname } : {}),
    ...(preference.tunnelName ? { tunnelName: preference.tunnelName } : {}),
    ...(preference.ngrokConfig ? { ngrokConfig: preference.ngrokConfig } : {}),
    ...(preference.cloudflareConfig ? { cloudflareConfig: preference.cloudflareConfig } : {}),
    ...(preference.cloudflareTokenFile ? { cloudflareTokenFile: preference.cloudflareTokenFile } : {}),
    ...(token ? { token } : {}),
    ...(bash ? { bash } : {}),
    ...(bashTranscript !== 'compact' ? { bashTranscript } : {}),
    ...(codexSessions !== 'off' ? { codexSessions } : {}),
    ...(codexDir ? { codexDir } : {}),
    ...(bashSession ? { bashSession } : {}),
    ...(requireBashSession ? { requireBashSession: true } : {}),
    ...(write ? { write } : {}),
    ...(toolMode ? { toolMode } : {}),
    ...(widgetDomain ? { widgetDomain } : {}),
    ...(profile.semanticProvider ? { semanticProvider: profile.semanticProvider } : {}),
    ...toolCardsProfileEntry(args, profile),
    ...(args.noInstallCloudflared ? { noInstallCloudflared: true } : {}),
    root
  };
}

async function maybeConfigureFirstRun(root, args, profile) {
  if (profile.profilePath || !process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || hasExplicitTunnelInput(args)) {
    return profile;
  }

  const reusableProfiles = listWorkspaceProfiles().filter((item) => item.root !== root);
  if (reusableProfiles.length) {
    const shown = reusableProfiles.slice(0, 9);
    printBox('Saved setups', [
      'No saved settings exist for this workspace, but CodexGPT found saved setups from other workspaces.',
      ...shown.map((item, index) => profileOneLine(item, index + 1)),
      'Use a number to reuse one here, or type new to choose a fresh tunnel.'
    ]);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await ask(rl, 'Use saved setup number, or new?', shown.length === 1 ? '1' : 'new');
      const normalized = answer.trim().toLowerCase();
      const selectedIndex = Number(normalized);
      if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= shown.length) {
        const selected = shown[selectedIndex - 1];
        const payload = reusableProfilePayload(selected, {
          port: String(optionValue(args, selected, 'port', ['CODEXGPT_PORT'], selected.port ?? '8787')),
          mode: optionValue(args, selected, 'mode', ['CODEXGPT_MODE'], selected.mode ?? 'agent')
        });
        const savedPath = saveWorkspaceProfile(root, payload);
        statusLine('ok', `Saved workspace settings from ${selected.root}: ${savedPath}`);
        return loadWorkspaceProfile(root);
      }
    } finally {
      rl.close();
    }
  }

  printBox('First run setup', [
    'No saved tunnel preference exists for this workspace.',
    'Choose once now. CodexGPT will reuse this choice on future codexgpt start runs until you change or delete it with codexgpt settings.'
  ]);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const preference = await collectTunnelPreference(rl, args, profile, { defaultTunnel: 'cloudflare' });
    applyTunnelPreferenceToArgs(args, preference);
    const saveAnswer = await ask(rl, 'Save this as the default for this workspace?', 'yes');
    if (!['n', 'no'].includes(saveAnswer.trim().toLowerCase())) {
      const savedPath = saveWorkspaceProfile(root, profileFromPreference(root, args, profile, preference));
      statusLine('ok', `Saved workspace settings: ${savedPath}`);
      return loadWorkspaceProfile(root);
    }
    return profileFromPreference(root, args, profile, preference);
  } finally {
    rl.close();
  }
}

function commandPreview(args) {
  return shellCommandPreview(['codexgpt', ...args]);
}

async function runSetupWizard(argv) {
  if (!process.stdin.isTTY) {
    throw new Error('codexgpt setup needs an interactive terminal. Use codexgpt start --root /path/to/repo for non-interactive scripts.');
  }
  const defaults = parseArgs(argv);
  const defaultRoot = path.resolve(expandHome(defaults.root ?? process.env.CODEXGPT_ROOT ?? process.cwd()));

  printBox('CodexGPT setup', [
    'This wizard prepares a ChatGPT connector for the folder you choose.',
    'Press Enter to accept defaults. Stable tunnel choices are saved per workspace under ~/.codexgpt.'
  ]);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const rootInput = await ask(rl, 'Where is your project located?', defaultRoot);
    const root = realDir(rootInput);
    const profile = defaults.noProfile ? {} : loadWorkspaceProfile(root);
    if (profile.profilePath) {
      statusLine('ok', `Loaded saved profile: ${profile.profilePath}`);
      printSavedProfileHint(profile);
    }

    const savedTunnel = optionValue(defaults, profile, 'tunnel', ['CODEXGPT_TUNNEL'], 'cloudflare');
  const defaultTunnel = savedTunnel === 'cloudflare-named'
      ? 'stable'
      : savedTunnel === 'ngrok'
        ? 'ngrok'
        : savedTunnel === 'tailscale'
          ? 'tailscale'
          : savedTunnel === 'none'
            ? 'local'
            : 'quick';
    const defaultPort = String(optionValue(defaults, profile, 'port', ['CODEXGPT_PORT'], '8787'));
    const defaultMode = normalizeSetupChoice(optionValue(defaults, profile, 'mode', ['CODEXGPT_MODE'], 'agent'), ['agent', 'handoff', 'pro'], 'agent');

    const port = normalizePort(await ask(rl, 'Which local port should CodexGPT use?', defaultPort));
    const modeAnswer = await ask(rl, 'Mode: agent, handoff, or pro?', defaultMode);
    const mode = normalizeSetupChoice(modeAnswer, ['agent', 'handoff', 'pro'], defaultMode);

    printBox('Public URL', [
      'ChatGPT needs an HTTPS URL it can reach.',
      'quick  = CodexGPT creates a Cloudflare quick tunnel for demos and local work.',
      'stable = use your own domain with a Cloudflare named tunnel so the ChatGPT app URL does not change.',
      'ngrok  = use your ngrok free dev domain, for example https://name.ngrok-free.dev.',
      'tailscale = use Tailscale Funnel, for example https://device.tailnet.ts.net.',
      'local  = no tunnel, only useful for local MCP clients that can reach 127.0.0.1.'
    ]);

    const tunnelAnswer = await ask(rl, 'Public access: quick, stable, ngrok, tailscale, or local?', defaultTunnel);
    const tunnelChoice = normalizeSetupChoice(tunnelAnswer, ['quick', 'stable', 'ngrok', 'tailscale', 'local'], defaultTunnel);
    const args = ['start', '--root', root, '--port', port, '--mode', mode];
    const bash = optionValue(defaults, profile, 'bash', ['CODEXGPT_BASH_MODE'], '');
    const bashTranscript = bashTranscriptOption(defaults, profile);
    const codexSessions = codexSessionsOption(defaults, profile);
    const codexDir = optionValue(defaults, profile, 'codexDir', ['CODEXGPT_CODEX_DIR'], '');
    const write = optionalWriteOption(defaults, profile, mode);
    const toolMode = optionalChoice('tool-mode', optionValue(defaults, profile, 'toolMode', ['CODEXGPT_TOOL_MODE'], ''), ['minimal', 'standard', 'full']);
    const widgetDomain = optionValue(defaults, profile, 'widgetDomain', ['CODEXGPT_WIDGET_DOMAIN'], '');
    const toolCardsEntry = toolCardsProfileEntry(defaults, profile);
    if (bash) args.push('--bash', bash);
    if (bashTranscript !== 'compact') args.push('--bash-transcript', bashTranscript);
    if (codexSessions !== 'off') args.push('--codex-sessions', codexSessions);
    if (codexDir) args.push('--codex-dir', codexDir);
    const { bashSession, requireBashSession } = bashSessionOptions(defaults, profile);
    if (bashSession) args.push('--bash-session', bashSession);
    if (requireBashSession) args.push('--require-bash-session');
    if (write) args.push('--write', write);
    if (toolMode) args.push('--tool-mode', toolMode);
    if (widgetDomain) args.push('--widget-domain', widgetDomain);
    args.push(...toolCardsCliArgs(defaults, profile));
    if (defaults.noInstallCloudflared) args.push('--no-install-cloudflared');
    if (defaults.openChatgpt) args.push('--open-chatgpt');
    if (defaults.noCopyUrl) args.push('--no-copy-url');

    let profileTunnel = 'cloudflare';
    let profileHostname = '';
    let profileTunnelName = '';
    let profileNgrokConfig = '';
    let profileCloudflareConfig = '';
    let profileCloudflareTokenFile = '';
    let profileToken = optionValue(defaults, profile, 'token', ['CODEXGPT_HTTP_TOKEN', 'CODEBASE_BRIDGE_HTTP_TOKEN'], '');

    if (tunnelChoice === 'local') {
      profileTunnel = 'none';
      args.push('--tunnel', 'none');
    } else if (tunnelChoice === 'stable') {
      profileTunnel = 'cloudflare-named';
      let hostname = await ask(
        rl,
        'Stable Cloudflare hostname, without /mcp',
        optionValue(defaults, profile, 'hostname', ['CODEXGPT_PUBLIC_HOSTNAME', 'CODEXGPT_HOSTNAME'], '')
      );
      if (!hostname) throw new Error('Stable public URL setup needs a real hostname, for example codexgpt.yourdomain.com.');
      hostname = normalizePublicHostname(hostname);
      profileHostname = hostname;
      const tunnelName = await ask(rl, 'Cloudflare tunnel name', optionValue(defaults, profile, 'tunnelName', ['CODEXGPT_TUNNEL_NAME', 'CLOUDFLARE_TUNNEL_NAME'], 'codexgpt'));
      profileTunnelName = tunnelName;
      args.push('--tunnel', 'cloudflare-named', '--hostname', hostname, '--tunnel-name', tunnelName);
      profileCloudflareConfig = optionValue(defaults, profile, 'cloudflareConfig', ['CODEXGPT_CLOUDFLARE_CONFIG', 'CLOUDFLARE_TUNNEL_CONFIG'], '');
      profileCloudflareTokenFile = optionValue(defaults, profile, 'cloudflareTokenFile', ['CODEXGPT_CLOUDFLARE_TUNNEL_TOKEN_FILE', 'CLOUDFLARE_TUNNEL_TOKEN_FILE'], '');
      if (profileCloudflareConfig) args.push('--cloudflare-config', profileCloudflareConfig);
      if (profileCloudflareTokenFile) args.push('--cloudflare-token-file', profileCloudflareTokenFile);
    } else if (tunnelChoice === 'ngrok') {
      profileTunnel = 'ngrok';
      let hostname = await ask(
        rl,
        'Ngrok domain or URL, without /mcp',
        optionValue(defaults, profile, 'hostname', ['CODEXGPT_PUBLIC_HOSTNAME', 'CODEXGPT_HOSTNAME', 'NGROK_DOMAIN'], '')
      );
      if (!hostname) throw new Error('Ngrok setup needs your reserved domain, for example name.ngrok-free.dev.');
      hostname = normalizePublicHostname(hostname);
      profileHostname = hostname;
      args.push('--tunnel', 'ngrok', '--hostname', hostname);
      const ngrokConfig = optionValue(defaults, profile, 'ngrokConfig', ['NGROK_CONFIG', 'CODEXGPT_NGROK_CONFIG'], '');
      if (ngrokConfig) {
        profileNgrokConfig = ngrokConfig;
        args.push('--ngrok-config', ngrokConfig);
      }
    } else if (tunnelChoice === 'tailscale') {
      profileTunnel = 'tailscale';
      let hostname = await ask(
        rl,
        'Tailscale Funnel hostname, without /mcp',
        optionValue(defaults, profile, 'hostname', ['CODEXGPT_PUBLIC_HOSTNAME', 'CODEXGPT_HOSTNAME', 'TAILSCALE_FUNNEL_HOSTNAME'], '')
      );
      if (!hostname) throw new Error('Tailscale setup needs your Funnel hostname, for example machine.tailnet.ts.net.');
      hostname = normalizePublicHostname(hostname);
      profileHostname = hostname;
      args.push('--tunnel', 'tailscale', '--hostname', hostname);
    } else {
      profileTunnel = 'cloudflare';
      args.push('--tunnel', 'cloudflare');
    }

    if (profileTunnel !== 'none') {
      profileToken = await ask(rl, 'CodexGPT auth token for this workspace', stableToken(profileToken));
      if (profileToken) args.push('--token', profileToken);
    }

    const saveDefault = defaults.noSaveConfig ? 'no' : 'yes';
    const saveAnswer = await ask(rl, 'Save this setup for future runs from this workspace?', saveDefault);
    const shouldSave = !['n', 'no'].includes(saveAnswer.trim().toLowerCase());
    if (shouldSave) {
      const savedPath = saveWorkspaceProfile(root, {
        port,
        mode,
        tunnel: profileTunnel,
        ...(profileHostname ? { hostname: profileHostname } : {}),
        ...(profileTunnelName ? { tunnelName: profileTunnelName } : {}),
        ...(profileNgrokConfig ? { ngrokConfig: profileNgrokConfig } : {}),
        ...(profileCloudflareConfig ? { cloudflareConfig: profileCloudflareConfig } : {}),
        ...(profileCloudflareTokenFile ? { cloudflareTokenFile: profileCloudflareTokenFile } : {}),
        ...(profileToken ? { token: profileToken } : {}),
        ...(bash ? { bash } : {}),
        ...(bashTranscript !== 'compact' ? { bashTranscript } : {}),
        ...(codexSessions !== 'off' ? { codexSessions } : {}),
        ...(codexDir ? { codexDir } : {}),
        ...(bashSession ? { bashSession } : {}),
        ...(requireBashSession ? { requireBashSession: true } : {}),
        ...(write ? { write } : {}),
        ...(toolMode ? { toolMode } : {}),
        ...(widgetDomain ? { widgetDomain } : {}),
        ...toolCardsEntry,
        ...(defaults.noInstallCloudflared ? { noInstallCloudflared: true } : {})
      });
      statusLine('ok', `Saved workspace profile: ${savedPath}`);
    }

    const startAnswer = await ask(rl, 'Start CodexGPT now?', 'yes');
    const shouldStart = !['n', 'no'].includes(startAnswer.trim().toLowerCase());
    console.log('');
    console.log(paint('bold', 'Command'));
    console.log(`  ${commandPreview(args)}`);
    console.log('');
    if (!shouldStart) {
      console.log('Setup complete. Run the command above when you are ready.');
      return null;
    }
    return args;
  } finally {
    rl.close();
  }
}

function printProfile(root, profile) {
  if (!profile.profilePath) {
    printBox('CodexGPT settings', [
      labelValue('Workspace', root),
      'No saved settings for this workspace.',
      'Run codexgpt settings set or codexgpt setup to save a tunnel preference.'
    ]);
    return;
  }
  const safe = sanitizedProfile(profile);
  printBox('CodexGPT settings', [
    labelValue('Workspace', root),
    labelValue('Profile', profile.profilePath),
    labelValue('Tunnel', safe.tunnel ?? 'cloudflare'),
    ...(safe.hostname ? [labelValue('Hostname', safe.hostname)] : []),
    ...(safe.tunnelName ? [labelValue('Tunnel name', safe.tunnelName)] : []),
    ...(safe.ngrokConfig ? [labelValue('Ngrok config', safe.ngrokConfig)] : []),
    ...(safe.cloudflareConfig ? [labelValue('Cloudflare cfg', safe.cloudflareConfig)] : []),
    ...(safe.cloudflareTokenFile ? [labelValue('CF token file', safe.cloudflareTokenFile)] : []),
    ...(safe.port ? [labelValue('Port', safe.port)] : []),
    ...(safe.mode ? [labelValue('Mode', safe.mode)] : []),
    ...(safe.bash ? [labelValue('Bash', safe.bash)] : []),
    ...(safe.write ? [labelValue('Write', safe.write)] : []),
    ...(safe.toolMode ? [labelValue('Tool mode', safe.toolMode)] : []),
    ...(safe.toolCards !== undefined ? [labelValue('Tool cards', safe.toolCards ? 'on' : 'off')] : []),
    labelValue('Bash transcript', safe.bashTranscript ?? 'compact'),
    labelValue('Codex sessions', safe.codexSessions ?? 'off'),
    ...(safe.codexDir ? [labelValue('Codex dir', safe.codexDir)] : []),
    ...(safe.bashSession ? [labelValue('Bash session', `${safe.bashSession}${safe.requireBashSession ? ' required' : ''}`)] : []),
    ...(safe.widgetDomain ? [labelValue('Widget origin', safe.widgetDomain)] : []),
    ...(safe.noInstallCloudflared ? [labelValue('cloudflared', 'manual install only')] : []),
    ...(safe.token ? [labelValue('Token', safe.token)] : []),
    ...(safe.cloudflareToken ? [labelValue('Cloudflare token', safe.cloudflareToken)] : [])
  ]);
}

function printProfileList(profiles = listWorkspaceProfiles()) {
  if (!profiles.length) {
    printBox('CodexGPT saved setups', [
      'No saved workspace settings found.',
      'Run codexgpt setup or codexgpt settings set to create one.'
    ]);
    return;
  }
  printBox('CodexGPT saved setups', profiles.slice(0, 50).map((profile, index) => profileOneLine(profile, index + 1)));
}

function saveSettingsFromArgs(root, args, profile) {
  if (args.cloudflareToken !== undefined) {
    throw new Error('codexgpt settings set does not save raw --cloudflare-token. Save it to a local file and use --cloudflare-token-file <path>; start still accepts --cloudflare-token for a single launch.');
  }
  const tunnel = optionValue(args, profile, 'tunnel', ['CODEXGPT_TUNNEL'], profile.tunnel ?? 'cloudflare');
  if (!['none', 'cloudflare', 'cloudflare-named', 'ngrok', 'tailscale'].includes(tunnel)) {
    throw new Error('--tunnel must be none, cloudflare, cloudflare-named, ngrok, or tailscale');
  }
  const needsHostname = tunnel === 'ngrok' || tunnel === 'cloudflare-named' || tunnel === 'tailscale';
  const rawHostname = needsHostname ? (args.hostname ?? args.url ?? profile.hostname ?? '') : '';
  const hostname = needsHostname ? normalizePublicHostname(rawHostname) : String(rawHostname ?? '').trim();
  if (needsHostname && !hostname) {
    throw new Error('--hostname is required for ngrok, cloudflare-named, and tailscale settings.');
  }
  const mode = optionValue(args, profile, 'mode', ['CODEXGPT_MODE'], profile.mode ?? 'agent');
  if (!['agent', 'handoff', 'pro'].includes(mode)) {
    throw new Error('--mode must be agent, handoff, or pro');
  }
  const toolMode = optionalChoice('tool-mode', optionValue(args, profile, 'toolMode', ['CODEXGPT_TOOL_MODE'], profile.toolMode ?? ''), ['minimal', 'standard', 'full']);
  const widgetDomain = optionValue(args, profile, 'widgetDomain', ['CODEXGPT_WIDGET_DOMAIN'], profile.widgetDomain ?? '');
  const port = normalizePort(optionValue(args, profile, 'port', ['CODEXGPT_PORT'], profile.port ?? '8787'));
  const bashTranscript = bashTranscriptOption(args, profile);
  const codexSessions = codexSessionsOption(args, profile);
  const codexDir = optionValue(args, profile, 'codexDir', ['CODEXGPT_CODEX_DIR'], profile.codexDir ?? '');
  const { bashSession, requireBashSession } = bashSessionOptions(args, profile);
  const write = writeOption(args, profile, mode);
  const bash = optionalChoice('bash', optionValue(args, profile, 'bash', ['CODEXGPT_BASH_MODE'], profile.bash ?? ''), ['off', 'safe', 'full']);
  const tunnelName = tunnel === 'cloudflare-named' ? (args.tunnelName ?? profile.tunnelName ?? '') : '';
  const ngrokConfig = tunnel === 'ngrok'
    ? resolveConfigPath(root, optionValue(args, profile, 'ngrokConfig', ['NGROK_CONFIG', 'CODEXGPT_NGROK_CONFIG'], ''))
    : '';
  const cloudflareConfig = tunnel === 'cloudflare-named'
    ? resolveConfigPath(root, optionValue(args, profile, 'cloudflareConfig', ['CODEXGPT_CLOUDFLARE_CONFIG', 'CLOUDFLARE_TUNNEL_CONFIG'], ''))
    : '';
  const cloudflareTokenFile = tunnel === 'cloudflare-named'
    ? resolveConfigPath(root, optionValue(args, profile, 'cloudflareTokenFile', ['CODEXGPT_CLOUDFLARE_TUNNEL_TOKEN_FILE', 'CLOUDFLARE_TUNNEL_TOKEN_FILE'], ''))
    : '';
  const token = tunnel === 'none'
    ? optionValue(args, profile, 'token', ['CODEXGPT_HTTP_TOKEN', 'CODEBASE_BRIDGE_HTTP_TOKEN'], profile.token ?? '')
    : stableToken(optionValue(args, profile, 'token', ['CODEXGPT_HTTP_TOKEN', 'CODEBASE_BRIDGE_HTTP_TOKEN'], profile.token ?? ''));
  const authMode = profile.authMode === 'oauth' || profile.authMode === 'legacy' ? profile.authMode : '';
  const previousAuthRoute = {
    ...(profile.port ? { port: profile.port } : {}),
    ...(profile.tunnel ? { tunnel: profile.tunnel } : {}),
    ...(profile.hostname ? { hostname: profile.hostname } : {}),
    ...(profile.tunnelName ? { tunnelName: profile.tunnelName } : {}),
    ...(profile.tunnelOwner ? { tunnelOwner: profile.tunnelOwner } : {}),
    ...(profile.localAdminPort ? { localAdminPort: profile.localAdminPort } : {}),
    ...(profile.ngrokConfig ? { ngrokConfig: profile.ngrokConfig } : {}),
    ...(profile.cloudflareConfig ? { cloudflareConfig: profile.cloudflareConfig } : {}),
    ...(profile.cloudflareTokenFile ? { cloudflareTokenFile: profile.cloudflareTokenFile } : {}),
    ...(profile.noInstallCloudflared ? { noInstallCloudflared: true } : {})
  };
  const activeAuthRoute = {
    port,
    tunnel,
    ...(hostname ? { hostname } : {}),
    ...(tunnelName ? { tunnelName } : {}),
    ...(ngrokConfig ? { ngrokConfig } : {}),
    ...(cloudflareConfig ? { cloudflareConfig } : {}),
    ...(cloudflareTokenFile ? { cloudflareTokenFile } : {}),
    ...(authMode === 'oauth' && profile.tunnelOwner ? { tunnelOwner: profile.tunnelOwner } : {}),
    ...(authMode === 'oauth' && profile.localAdminPort ? { localAdminPort: profile.localAdminPort } : {}),
    ...(args.noInstallCloudflared ?? profile.noInstallCloudflared ? { noInstallCloudflared: true } : {})
  };
  const authRoutes = { ...(profile.authRoutes ?? {}) };
  if (!authRoutes.oauth && profile.oauthIssuer && profile.hostname) {
    try {
      if (new URL(profile.oauthIssuer).hostname === profile.hostname) authRoutes.oauth = previousAuthRoute;
    } catch {}
  }
  if (authMode) authRoutes[authMode] = activeAuthRoute;
  const savedPath = saveWorkspaceProfile(root, {
    port,
    mode,
    tunnel,
    ...(hostname ? { hostname } : {}),
    ...(tunnelName ? { tunnelName } : {}),
    ...(ngrokConfig ? { ngrokConfig } : {}),
    ...(cloudflareConfig ? { cloudflareConfig } : {}),
    ...(cloudflareTokenFile ? { cloudflareTokenFile } : {}),
    ...(token ? { token } : {}),
    ...(bash ? { bash } : {}),
    ...(bashTranscript !== 'compact' ? { bashTranscript } : {}),
    ...(codexSessions !== 'off' ? { codexSessions } : {}),
    ...(codexDir ? { codexDir } : {}),
    ...(bashSession ? { bashSession } : {}),
    ...(requireBashSession ? { requireBashSession: true } : {}),
    ...(mode !== 'agent' || args.write !== undefined || profile.write ? { write } : {}),
    ...(toolMode ? { toolMode } : {}),
    ...(widgetDomain ? { widgetDomain } : {}),
    ...(profile.policyEngine ? { policyEngine: profile.policyEngine } : {}),
    ...(profile.permissionProfile ? { permissionProfile: profile.permissionProfile } : {}),
    ...(profile.semanticProvider ? { semanticProvider: profile.semanticProvider } : {}),
    ...(authMode ? { authMode } : {}),
    ...(Object.keys(authRoutes).length ? { authRoutes } : {}),
    ...(profile.oauthIssuer ? { oauthIssuer: profile.oauthIssuer } : {}),
    ...(profile.oauthResource ? { oauthResource: profile.oauthResource } : {}),
    ...(profile.oauthCredentialProvider ? { oauthCredentialProvider: profile.oauthCredentialProvider } : {}),
    ...(profile.oauthStateRef ? { oauthStateRef: profile.oauthStateRef } : {}),
    ...(authMode === 'oauth' && profile.localAdminPort ? { localAdminPort: profile.localAdminPort } : {}),
    ...(authMode === 'oauth' && profile.tunnelOwner ? { tunnelOwner: profile.tunnelOwner } : {}),
    ...toolCardsProfileEntry(args, profile),
    ...(args.noInstallCloudflared ?? profile.noInstallCloudflared ? { noInstallCloudflared: true } : {})
  });
  statusLine('ok', `Saved workspace settings: ${savedPath}`);
  printProfile(root, loadWorkspaceProfile(root));
}

async function chooseReusableProfile(rl, currentRoot, profiles = listWorkspaceProfiles()) {
  const reusable = profiles.filter((item) => item.root !== currentRoot);
  if (!reusable.length) return null;
  printProfileList(reusable);
  const answer = await ask(rl, 'Use saved setup number?', reusable.length === 1 ? '1' : '');
  const selectedIndex = Number(answer.trim());
  if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > reusable.length) {
    throw new Error('Invalid saved setup number.');
  }
  return reusable[selectedIndex - 1];
}

async function runSettings(argv) {
  const action = argv[0] && !argv[0].startsWith('--') ? argv[0] : '';
  const args = parseArgs(action ? argv.slice(1) : argv);
  if (args.help) {
    usage();
    return;
  }
  const root = realDir(args.root ?? process.env.CODEXGPT_ROOT ?? process.cwd());
  const profile = args.noProfile ? {} : loadWorkspaceProfile(root);

  if (action === 'list' || action === 'ls') {
    printProfileList();
    return;
  }

  if (action === 'show' || (!action && !process.stdin.isTTY)) {
    printProfile(root, profile);
    return;
  }

  if (action === 'delete' || action === 'reset' || action === 'remove') {
    if (!profile.profilePath) {
      statusLine('warn', 'No saved settings exist for this workspace.');
      return;
    }
    if (!args.yes && process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await ask(rl, `Delete saved settings for ${root}?`, 'no');
        if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
          statusLine('warn', 'Settings delete cancelled.');
          return;
        }
      } finally {
        rl.close();
      }
    } else if (!args.yes) {
      throw new Error('Use codexgpt settings delete --yes in non-interactive shells.');
    }
    deleteWorkspaceProfile(root);
    statusLine('ok', 'Deleted saved settings for this workspace.');
    return;
  }

  if (action === 'set') {
    saveSettingsFromArgs(root, args, profile);
    return;
  }

  if (action === 'use' || action === 'copy') {
    const fromRoot = args.fromRoot ? realDir(args.fromRoot) : '';
    let source = fromRoot ? loadWorkspaceProfile(fromRoot) : null;
    if (fromRoot && !source.profilePath) {
      throw new Error(`No saved settings found for --from-root ${fromRoot}`);
    }
    if (!source) {
      if (!process.stdin.isTTY) throw new Error('Use --from-root in non-interactive shells.');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        source = await chooseReusableProfile(rl, root);
      } finally {
        rl.close();
      }
    }
    if (!source) {
      statusLine('warn', 'No reusable saved settings found.');
      return;
    }
    const savedPath = saveWorkspaceProfile(root, reusableProfilePayload(source));
    statusLine('ok', `Saved workspace settings from ${source.root}: ${savedPath}`);
    printProfile(root, loadWorkspaceProfile(root));
    return;
  }

  if (action && !['change', 'edit'].includes(action)) {
    throw new Error(`Unknown settings action: ${action}`);
  }

  if (!process.stdin.isTTY) {
    printProfile(root, profile);
    return;
  }

  printProfile(root, profile);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const selected = await ask(rl, 'Action: set, use, delete, show, list, or exit?', profile.profilePath ? 'show' : 'set');
    const normalized = normalizeSetupChoice(selected, ['set', 'use', 'delete', 'show', 'list', 'exit'], profile.profilePath ? 'show' : 'set');
    if (normalized === 'exit') return;
    if (normalized === 'list') {
      printProfileList();
      return;
    }
    if (normalized === 'show') {
      printProfile(root, profile);
      return;
    }
    if (normalized === 'use') {
      const source = await chooseReusableProfile(rl, root);
      if (!source) {
        statusLine('warn', 'No reusable saved settings found.');
        return;
      }
      const savedPath = saveWorkspaceProfile(root, reusableProfilePayload(source));
      statusLine('ok', `Saved workspace settings from ${source.root}: ${savedPath}`);
      printProfile(root, loadWorkspaceProfile(root));
      return;
    }
    if (normalized === 'delete') {
      if (!profile.profilePath) {
        statusLine('warn', 'No saved settings exist for this workspace.');
        return;
      }
      const answer = await ask(rl, `Delete saved settings for ${root}?`, 'no');
      if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
        statusLine('warn', 'Settings delete cancelled.');
        return;
      }
      deleteWorkspaceProfile(root);
      statusLine('ok', 'Deleted saved settings for this workspace.');
      return;
    }

    const preference = await collectTunnelPreference(rl, args, profile);
    const payload = profileFromPreference(root, args, profile, preference);
    const savedPath = saveWorkspaceProfile(root, payload);
    statusLine('ok', `Saved workspace settings: ${savedPath}`);
    printProfile(root, loadWorkspaceProfile(root));
  } finally {
    rl.close();
  }
}

async function runSemantic(argv) {
  const action = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'status';
  const selection = argv[1] && !argv[1].startsWith('--') ? argv[1] : undefined;
  const args = parseArgs(argv);
  const root = realDir(args.root ?? process.env.CODEXGPT_ROOT ?? process.cwd());
  const profile = args.noProfile ? {} : loadWorkspaceProfile(root);
  if (action === 'use' || action === 'disable') {
    if (args.noProfile) throw new Error('semantic use/disable requires a saved workspace profile; remove --no-profile.');
    const provider = action === 'disable' ? 'none' : selection;
    if (!['builtin', 'none'].includes(provider)) {
      throw new Error('Use `codexgpt semantic use builtin|none` or `codexgpt semantic disable`.');
    }
    if (provider === 'builtin' && profile.toolMode === 'minimal') {
      throw new Error('Semantic V5 is not exposed in minimal tool mode. Change the saved tool mode to standard or full first.');
    }
    const savedPath = saveWorkspaceProfile(root, {
      ...profile,
      profilePath: undefined,
      semanticProvider: provider
    });
    statusLine('ok', `Semantic Provider set to ${provider}: ${savedPath}`);
    console.log(provider === 'builtin'
      ? 'Restart CodexGPT. JavaScript/TypeScript semantic navigation will be available with no separate Provider setup.'
      : 'Restart CodexGPT. Semantic navigation and rename previews are disabled; ordinary tools are unchanged.');
    return;
  }
  if (action !== 'status' || selection) {
    throw new Error('Use `codexgpt semantic status [--verbose]`, `use builtin|none`, or `disable`.');
  }
  const configuredProvider = process.env.CODEXGPT_SEMANTIC_PROVIDER === 'none'
    ? 'none'
    : process.env.CODEXGPT_SEMANTIC_PROVIDER === 'builtin'
      ? 'builtin'
      : profile.semanticProvider === 'none'
        ? 'none'
        : 'builtin';
  const statusPath = path.join(projectRoot, 'dist', 'semantic', 'status.js');
  if (!fs.existsSync(statusPath)) {
    throw new Error('Semantic status runtime is not built. Run `npm install && npm run build`, then retry.');
  }
  const { semanticCoreStatus } = await import(pathToFileURL(statusPath).href);
  const status = semanticCoreStatus(configuredProvider);
  const semanticMode = process.env.CODEXGPT_SEMANTIC_MODE === 'legacy'
    ? 'legacy'
    : process.env.CODEXGPT_SEMANTIC_MODE === 'standard'
      ? 'standard'
      : profile.semanticProvider && profile.toolMode !== 'minimal'
        ? 'standard'
        : 'legacy';
  const lines = [
    labelValue('Configured', status.configuredProvider),
    labelValue('Actual', status.actualProvider),
    labelValue('State', semanticMode === 'standard' ? status.state : 'legacy rollback'),
    labelValue('Quality', semanticMode === 'standard' ? status.resultQuality : 'lexical'),
    labelValue('Next action', semanticMode === 'standard'
      ? status.nextAction
      : 'Run `codexgpt semantic use builtin`, restart, then Scan Tools in the existing ChatGPT App.')
  ];
  if (argv.includes('--verbose')) {
    lines.push(
      labelValue('Engine', status.engineVersion ?? 'unavailable'),
      labelValue('Worker timeout', `${status.budgets.workerTimeoutMs} ms`),
      labelValue('Queue limit', status.budgets.maxQueue),
      labelValue('Result limit', status.budgets.maxResults),
      labelValue('Isolation', 'execution/filesystem/network: none (current-user worker)')
    );
  }
  printBox('CodexGPT semantic status', lines);
}

function writeControlPrompt() {
  process.stdout.write('codexgpt> ');
}

function runControlPanel(details, cleanup = cleanupChildren) {
  if (!process.stdin.isTTY) return new Promise(() => {});

  writeControlPrompt();

  process.stdin.setEncoding('utf8');
  if (typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise(() => {
    process.stdin.on('data', (key) => {
      if (key === '\u0003') {
        console.log('\nStopping CodexGPT...');
        cleanup();
        process.exit(130);
      }
      const normalized = key.toLowerCase();
      if (key === '\r' || key === '\n') {
        const opened = openUrl(details.chatgptSettingsUrl);
        const pasteHint = details.copied?.ok
          ? 'The Server URL is already copied; paste it into Server URL.'
          : 'Press u to show the secret Server URL.';
        console.log(opened ? `\nOpened ChatGPT connector settings. ${pasteHint}` : `\nCould not open ChatGPT automatically. ${pasteHint}`);
        writeControlPrompt();
      } else if (normalized === 'c') {
        const copied = copyToClipboard(details.serverUrl);
        console.log(copied.ok ? `\nServer URL copied with ${copied.command}.` : '\nCould not copy automatically. Press u to show the secret Server URL.');
        writeControlPrompt();
      } else if (normalized === 'u') {
        console.log(`\n${details.serverUrl}`);
        writeControlPrompt();
      } else if (normalized === 'a' && details.authMode === 'oauth') {
        const opened = openOAuthAdmin(details.root);
        console.log(opened ? '\nOpened authenticated local OAuth approvals.' : '\nCould not open local OAuth approvals. Run codexgpt auth status for the exact repair.');
        writeControlPrompt();
      } else if (normalized === 'o' && details.authMode !== 'oauth') {
        if (!details.localStatusUrl) {
          console.log('\nNo local status page URL is available for this run.');
        } else {
          const opened = openUrl(details.localStatusUrl);
          console.log(opened ? '\nOpened local CodexGPT setup/status page.' : `\nCould not open automatically. Open this URL:\n${details.localStatusUrl}`);
        }
        writeControlPrompt();
      } else if (normalized === 'p') {
        console.log('');
        printCreateAppFields(details);
        console.log('');
        writeControlPrompt();
      } else if (normalized === 'm') {
        printModeHelp();
        console.log('');
        writeControlPrompt();
      } else if (normalized === 'h' || normalized === '?') {
        printControlHelp(details.authMode);
        writeControlPrompt();
      } else if (normalized === 'q') {
        console.log('\nStopping CodexGPT...');
        cleanup();
        process.exit(0);
      }
    });
  });
}

function parseLocalControlCliArgs(argv) {
  const values = {
    serverId: '',
    timeoutMs: 1000,
    reveal: false,
    once: false,
    positionals: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--server' || value === '--timeout-ms') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`${value} requires a value.`);
      if (value === '--server') values.serverId = next;
      else values.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (value.startsWith('--server=')) {
      values.serverId = value.slice('--server='.length);
      continue;
    }
    if (value.startsWith('--timeout-ms=')) {
      values.timeoutMs = Number(value.slice('--timeout-ms='.length));
      continue;
    }
    if (value === '--reveal') {
      values.reveal = true;
      continue;
    }
    if (value === '--once') {
      values.once = true;
      continue;
    }
    if (value.startsWith('--')) throw new Error(`Unknown local-control option: ${value}`);
    values.positionals.push(value);
  }
  if (!/^[a-f0-9]{32}$/.test(values.serverId)) {
    throw new Error('--server with the exact 32-character server id is required; "latest" is never selected implicitly.');
  }
  if (!Number.isInteger(values.timeoutMs) || values.timeoutMs < 1 || values.timeoutMs > 30_000) {
    throw new Error('--timeout-ms must be an integer from 1 to 30000.');
  }
  return values;
}

function printLocalApprovals(response, renderLocalApprovalEntry, reveal) {
  if (response.approvals.length === 0) {
    console.log('No approvals on this server.');
    return;
  }
  console.log(response.approvals.map((entry) => renderLocalApprovalEntry(entry, { reveal })).join('\n\n'));
}

function printOAuthAuthorizations(response, escapeTerminalText) {
  const entries = response.oauthAuthorizations ?? [];
  if (entries.length === 0) {
    console.log('No OAuth authorizations on this server.');
    return;
  }
  for (const entry of entries) {
    console.log([
      `Authorization: ${escapeTerminalText(entry.pendingId)}`,
      `Correlation: ${escapeTerminalText(entry.correlationCode)}`,
      `State: ${escapeTerminalText(entry.status)}`,
      `Workspace: ${escapeTerminalText(entry.canonicalRoot, 32768)}`,
      `Client: ${escapeTerminalText(entry.clientLabel, 128)} (${escapeTerminalText(entry.clientRef)})`,
      `Redirect: ${escapeTerminalText(entry.redirectHost + entry.redirectPath, 2304)}`,
      `Scopes: ${escapeTerminalText(entry.scopes.join(' '), 128)}`,
      `Configuration match: ${entry.scopesMatchCurrentConfiguration ? 'yes' : 'no'}`,
      `Expires: ${escapeTerminalText(entry.expiresAt)}`
    ].join('\n'));
    console.log('');
  }
}

function printOAuthClients(response, escapeTerminalText) {
  const entries = response.oauthClients ?? [];
  if (entries.length === 0) {
    console.log('No OAuth clients on this server.');
    return;
  }
  for (const entry of entries) {
    console.log([
      `Client: ${escapeTerminalText(entry.clientId)}`,
      `Reference: ${escapeTerminalText(entry.clientRef)}`,
      `Label: ${escapeTerminalText(entry.label, 128)}`,
      `State: ${escapeTerminalText(entry.status)}`,
      `Redirect: ${escapeTerminalText(entry.redirectHost + entry.redirectPath, 2304)}`,
      `Created: ${escapeTerminalText(entry.createdAt)}`,
      `Expires: ${escapeTerminalText(entry.expiresAt ?? 'not applicable')}`
    ].join('\n'));
    console.log('');
  }
}

function printOAuthGrants(response, escapeTerminalText) {
  const entries = response.oauthGrants ?? [];
  if (entries.length === 0) {
    console.log('No OAuth grants on this server.');
    return;
  }
  for (const entry of entries) {
    console.log([
      `Grant: ${escapeTerminalText(entry.grantId)}`,
      `Client: ${escapeTerminalText(entry.clientRef)}`,
      `State: ${escapeTerminalText(entry.status)}`,
      `Scopes: ${escapeTerminalText(entry.scopes.join(' '), 128)}`,
      `Grant revision: ${entry.grantRevision}`,
      `Refresh generation: ${entry.refreshGeneration}`,
      `Created: ${escapeTerminalText(entry.createdAt)}`,
      `Last used: ${escapeTerminalText(entry.lastUsedAt)}`,
      `Idle expiry: ${escapeTerminalText(entry.idleExpiresAt)}`,
      `Absolute expiry: ${escapeTerminalText(entry.absoluteExpiresAt)}`,
      `Revoked: ${escapeTerminalText(entry.revokedAt ?? 'not applicable')}`,
      `Reason: ${escapeTerminalText(entry.revokeReason ?? 'not applicable')}`
    ].join('\n'));
    console.log('');
  }
}
async function runLocalControlCli(family, argv) {
  const parsed = parseLocalControlCliArgs(argv);
  const [operation, target, ...extra] = parsed.positionals;
  if (!operation || extra.length > 0) throw new Error(`Invalid ${family} command.`);
  const clientPath = path.join(projectRoot, 'dist', 'control', 'localApprovalClient.js');
  const serverPath = path.join(projectRoot, 'dist', 'control', 'localApprovalServer.js');
  if (!fs.existsSync(clientPath) || !fs.existsSync(serverPath)) {
    throw new Error('Local approval runtime is not built. Run npm run build first.');
  }
  const stateRootPath = path.join(projectRoot, 'dist', 'transactions', 'stateRoot.js');
  if (!fs.existsSync(stateRootPath)) {
    throw new Error('Local approval runtime is not built. Run npm run build first.');
  }
  const [
    { LocalApprovalClient },
    { escapeTerminalText, renderLocalApprovalEntry },
    { resolveTransactionStateRoot }
  ] = await Promise.all([
    import(pathToFileURL(clientPath).href),
    import(pathToFileURL(serverPath).href),
    import(pathToFileURL(stateRootPath).href)
  ]);
  const transactionStateRoot = resolveTransactionStateRoot();
  let transactionServerPresent = false;
  if (family === 'processes') {
    try {
      fs.lstatSync(path.join(transactionStateRoot, parsed.serverId));
      transactionServerPresent = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const stateBaseRoot = family === 'approvals' || family === 'oauth-authorizations' || family === 'oauth-clients' || family === 'oauth-grants' || transactionServerPresent
    ? transactionStateRoot
    : undefined;
  const client = new LocalApprovalClient({
    ...(stateBaseRoot ? { stateBaseRoot } : {}),
    timeoutMs: Math.min(30_000, parsed.timeoutMs + 5_000)
  });

  if (family === 'approvals' && operation === 'list' && !target) {
    const response = await client.list(parsed.serverId);
    printLocalApprovals(response, renderLocalApprovalEntry, parsed.reveal);
    return;
  }
  if (family === 'approvals' && operation === 'watch' && !target) {
    let response = await client.list(parsed.serverId);
    printLocalApprovals(response, renderLocalApprovalEntry, parsed.reveal);
    do {
      response = await client.watch(parsed.serverId, response.sequence, parsed.timeoutMs);
      if (response.changed) printLocalApprovals(response, renderLocalApprovalEntry, parsed.reveal);
    } while (!parsed.once);
    return;
  }
  if (family === 'approvals' && (operation === 'approve' || operation === 'deny')) {
    if (!target || !/^approval_[a-f0-9]{32}$/.test(target)) {
      throw new Error(`${operation} requires one exact approval_id.`);
    }
    const response = operation === 'approve'
      ? await client.approve(parsed.serverId, target)
      : await client.deny(parsed.serverId, target);
    console.log(`${response.code}: ${target}`);
    const entry = response.approvals.find((value) => value.approvalId === target);
    if (entry) console.log(renderLocalApprovalEntry(entry, { reveal: parsed.reveal }));
    if (!response.ok) process.exitCode = 1;
    return;
  }
  if (family === 'oauth-authorizations' && operation === 'list' && !target) {
    const response = await client.listOAuthAuthorizations(parsed.serverId);
    printOAuthAuthorizations(response, escapeTerminalText);
    return;
  }
  if (family === 'oauth-authorizations' && (operation === 'approve' || operation === 'deny')) {
    if (!target || !/^pending_[A-Za-z0-9_-]{22}$/.test(target)) {
      throw new Error(`${operation} requires one exact pending_id.`);
    }
    const response = operation === 'approve'
      ? await client.approveOAuthAuthorization(parsed.serverId, target)
      : await client.denyOAuthAuthorization(parsed.serverId, target);
    console.log(`${response.code}: ${target}`);
    printOAuthAuthorizations(response, escapeTerminalText);
    if (!response.ok) process.exitCode = 1;
    return;
  }
  if (family === 'oauth-clients' && operation === 'list' && !target) {
    const response = await client.listOAuthClients(parsed.serverId);
    printOAuthClients(response, escapeTerminalText);
    return;
  }
  if (family === 'oauth-clients' && operation === 'revoke') {
    if (!target || !/^client_[A-Za-z0-9_-]{43}$/.test(target)) {
      throw new Error('revoke requires one exact client_id.');
    }
    const response = await client.revokeOAuthClient(parsed.serverId, target);
    console.log(`${response.code}: ${target}`);
    printOAuthClients(response, escapeTerminalText);
    if (!response.ok) process.exitCode = 1;
    return;
  }
  if (family === 'oauth-grants' && operation === 'list' && !target) {
    const response = await client.listOAuthGrants(parsed.serverId);
    printOAuthGrants(response, escapeTerminalText);
    return;
  }
  if (family === 'oauth-grants' && operation === 'revoke') {
    if (!target || !/^grant_[a-f0-9]{32}$/.test(target)) {
      throw new Error('revoke requires one exact grant_id.');
    }
    const response = await client.revokeOAuthGrant(parsed.serverId, target);
    console.log(`${response.code}: ${target}`);
    printOAuthGrants(response, escapeTerminalText);
    if (!response.ok) process.exitCode = 1;
    return;
  }
  if (family === 'oauth-grants' && operation === 'revoke-owner' && !target) {
    const response = await client.revokeOAuthOwnerGrants(parsed.serverId);
    console.log(response.code);
    printOAuthGrants(response, escapeTerminalText);
    if (!response.ok) process.exitCode = 1;
    return;
  }
  if (family === 'processes' && operation === 'list' && !target) {
    const response = await client.listProcesses(parsed.serverId);
    if (response.processes.length === 0) console.log('No owned processes on this server.');
    else for (const entry of response.processes) {
      console.log(`${escapeTerminalText(entry.processId)}  ${escapeTerminalText(entry.state)}  ${escapeTerminalText(entry.summary, 240)}`);
    }
    return;
  }
  if (family === 'processes' && operation === 'terminate') {
    if (!target || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(target)) {
      throw new Error('terminate requires one exact process_id.');
    }
    const response = await client.terminateProcess(parsed.serverId, target);
    console.log(`${response.code}: ${target}`);
    if (!response.ok) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown ${family} operation: ${operation}`);
}

async function main() {
  let argv = process.argv.slice(2);
  let connectionTest = false;
  let explainConfig = false;
  let explainConfigKey = '';
  if (argv[0] === '--version' || argv[0] === '-v' || argv[0] === 'version') {
    console.log(packageVersion());
    return;
  }
  let subcommand = argv[0];
  if (subcommand === 'config' && argv[1] === 'explain') {
    explainConfig = true;
    explainConfigKey = argv[2] && !argv[2].startsWith('--') ? argv[2] : '';
    argv = argv.slice(explainConfigKey ? 3 : 2);
    subcommand = undefined;
  }
  if (subcommand === 'inspect' || subcommand === 'review') {
    await runAnalysisCli(subcommand, argv.slice(1));
    return;
  }
  if (subcommand === 'stable-help') {
    printStableUrlHelp();
    return;
  }
  if (subcommand === 'setup' || subcommand === 'onboard') {
    if (argv.includes('--help') || argv[1] === 'help') {
      usage();
      return;
    }
    const setupArgs = await runSetupWizard(argv.slice(1));
    if (!setupArgs) return;
    argv = setupArgs;
    subcommand = argv[0];
  }
  if (!explainConfig && (subcommand === 'settings' || subcommand === 'config')) {
    await runSettings(argv.slice(1));
    return;
  }
  if (subcommand === 'semantic') {
    await runSemantic(argv.slice(1));
    return;
  }
  if (subcommand === 'execute-handoff' || subcommand === 'execute' || subcommand === 'run-handoff') {
    await runExecuteHandoff(argv.slice(1));
    return;
  }
  if (subcommand === 'watch-handoff' || subcommand === 'watch') {
    await runWatchHandoff(argv.slice(1));
    return;
  }
  if (subcommand === 'loop-handoff' || subcommand === 'loop') {
    await runLoopHandoff(argv.slice(1));
    return;
  }
  if (subcommand === 'pro-bundle' || subcommand === 'bundle') {
    runHelperScript('pro-bundle.mjs', argv.slice(1));
  }
  if (subcommand === 'pro-apply' || subcommand === 'apply') {
    runHelperScript('pro-apply.mjs', argv.slice(1));
  }
  if (subcommand === 'install-cloudflared') {
    const installArgs = parseArgs(argv.slice(1));
    if (installArgs.help) {
      usage();
      return;
    }
    const installedCloudflared = await installCloudflaredLocal();
    console.log(`cloudflared ready: ${installedCloudflared}`);
    return;
  }
  if (subcommand === 'doctor') {
    await runDoctor(argv.slice(1));
    return;
  }
  if (subcommand === 'approvals' || subcommand === 'oauth-authorizations' || subcommand === 'oauth-clients' || subcommand === 'oauth-grants' || subcommand === 'processes') {
    await runLocalControlCli(subcommand, argv.slice(1));
    return;
  }
  if (argv[0] === 'stable') {
    argv.shift();
    argv.unshift('--tunnel', 'cloudflare-named');
  }
  if (argv[0] === 'ngrok') {
    argv.shift();
    argv.unshift('--tunnel', 'ngrok');
  }
  if (argv[0] === 'tailscale') {
    argv.shift();
    argv.unshift('--tunnel', 'tailscale');
  }
  if (argv[0] === 'connection-test') {
    connectionTest = true;
    argv.shift();
  }
  if (argv[0] === 'start' || argv[0] === 'connect') argv.shift();
  if (argv[0] === '--version' || argv[0] === '-v' || argv[0] === 'version') {
    console.log(packageVersion());
    return;
  }
  if (argv[0] === 'help') argv[0] = '--help';
  const args = parseArgs(argv);
  if (connectionTest) {
    args.mode = 'agent';
    args.toolMode = 'standard';
    args.write = 'off';
    args.bash = 'off';
    args.toolCards = 'off';
    args.logRequests = true;
  }
  if (args.help) {
    usage();
    return;
  }

  const bootstrap = await resolveLauncherBootstrap(argv);
  const root = realDir(bootstrap.effective.rootInput);
  let profile = bootstrap.effective.noProfile ? {} : loadWorkspaceProfile(root);
  if (!explainConfig) profile = await maybeConfigureFirstRun(root, args, profile);
  const effectiveArgs = { ...profile, ...args };
  const authMode = String(process.env.CODEXGPT_AUTH_MODE ?? profile.authMode ?? 'legacy').trim();
  if (authMode !== 'legacy' && authMode !== 'oauth') {
    throw new Error('Authentication mode must be exactly legacy or oauth.');
  }
  if (!explainConfig && profile.profilePath && !args.noProfile) {
    statusLine('ok', `Using saved profile: ${profile.profilePath}`);
    const summary = profileSummary(profile);
    if (summary) statusLine('ok', `${summary}. Future launches from this folder only need: codexgpt start`);
  }

  const tunnel = optionValue(args, profile, 'tunnel', ['CODEXGPT_TUNNEL'], 'cloudflare');
  if (!['none', 'cloudflare', 'cloudflare-named', 'ngrok', 'tailscale'].includes(tunnel)) {
    throw new Error('--tunnel must be none, cloudflare, cloudflare-named, ngrok, or tailscale');
  }
  const stableHostname = args.hostname
    ?? args.url
    ?? process.env.CODEXGPT_PUBLIC_HOSTNAME
    ?? process.env.CODEXGPT_HOSTNAME
    ?? process.env.NGROK_DOMAIN
    ?? profile.hostname
    ?? '';
  if (tunnel === 'cloudflare-named' && !stableHostname) {
    printStableUrlHelp();
    throw new Error('--hostname is required with stable URL mode.');
  }
  if (tunnel === 'ngrok' && !stableHostname) {
    throw new Error('--hostname is required with ngrok tunnel mode. Example: codexgpt ngrok --hostname your-domain.ngrok-free.dev');
  }
  if (tunnel === 'tailscale' && !stableHostname) {
    throw new Error('--hostname is required with Tailscale Funnel mode. Example: codexgpt tailscale --hostname your-device.your-tailnet.ts.net');
  }
  const mode = optionValue(args, profile, 'mode', ['CODEXGPT_MODE'], 'agent');
  if (!['agent', 'handoff', 'pro'].includes(mode)) {
    throw new Error('--mode must be agent, handoff, or pro');
  }

  const allowRoots = [root, ...(args.allowRoots ?? [])].map(realDir);
  const host = optionValue(args, profile, 'host', ['CODEXGPT_HOST'], '127.0.0.1');
  if (args.noAuth && (tunnel !== 'none' || !isLoopbackHost(host))) {
    throw new Error('--no-auth is only allowed with --tunnel none on a loopback host.');
  }
  const port = normalizePort(optionValue(args, profile, 'port', ['CODEXGPT_PORT'], '8787'));
  const localAdminPort = authMode === 'oauth'
    ? normalizePort(String(profile.localAdminPort ?? ''))
    : '';
  if (authMode === 'oauth' && localAdminPort === port) {
    throw new Error('OAuth public and local-admin ports must be distinct.');
  }
  const bash = optionValue(args, profile, 'bash', ['CODEXGPT_BASH_MODE'], 'safe');
  const bashTranscript = bashTranscriptOption(args, profile);
  const codexSessions = codexSessionsOption(args, profile);
  const codexDir = resolveCodexDir(root, optionValue(args, profile, 'codexDir', ['CODEXGPT_CODEX_DIR'], ''));
  const { bashSession, requireBashSession } = bashSessionOptions(args, profile);
  const write = writeOption(args, profile, mode);
  const toolMode = optionValue(args, profile, 'toolMode', ['CODEXGPT_TOOL_MODE'], 'standard');
  const widgetDomain = optionValue(args, profile, 'widgetDomain', ['CODEXGPT_WIDGET_DOMAIN'], 'https://rebel0789.github.io');
  const toolCards = optionBool(args, profile, 'toolCards', ['CODEXGPT_TOOL_CARDS'], false);
  const semanticProvider = optionValue(args, profile, 'semanticProvider', ['CODEXGPT_SEMANTIC_PROVIDER'], 'builtin');
  validateChoice('bash', bash, ['off', 'safe', 'full']);
  validateChoice('write', write, ['off', 'handoff', 'workspace']);
  validateChoice('tool-mode', toolMode, ['minimal', 'standard', 'full']);
  validateChoice('semantic provider', semanticProvider, ['builtin', 'none']);

  if (authMode === 'oauth' && args.noAuth) {
    throw new Error('--no-auth is incompatible with OAuth mode.');
  }
  let token = authMode === 'oauth'
    ? ''
    : args.noAuth
      ? ''
      : optionValue(args, profile, 'token', ['CODEXGPT_HTTP_TOKEN', 'CODEBASE_BRIDGE_HTTP_TOKEN'], '');
  if (!token && !args.noAuth && authMode === 'legacy') token = stableToken();

  const semanticMode = process.env.CODEXGPT_SEMANTIC_MODE === 'legacy'
    ? 'legacy'
    : process.env.CODEXGPT_SEMANTIC_MODE === 'standard'
      ? 'standard'
      : profile.semanticProvider && toolMode !== 'minimal'
        ? 'standard'
        : 'legacy';
  const serverEnv = buildRuntimeServerEnvironment({
    baseEnvironment: process.env,
    root,
    allowRoots,
    host,
    port,
    bash,
    bashTranscript,
    bashSession,
    requireBashSession,
    codexSessions,
    write,
    toolMode,
    widgetDomain,
    toolCards,
    semanticMode,
    semanticProvider,
    connectionTest,
    mode,
    authMode,
    tunnel,
    noAuth: Boolean(args.noAuth),
    codexDir,
    logRequests: Boolean(args.logRequests || process.env.CODEXGPT_LOG_REQUESTS === '1'),
    allowHome: Boolean(args.allowHome),
    token
  });
  const runtimeConfigSnapshot = await resolveRuntimeConfigSnapshot(root, serverEnv, {
    noProfile: Boolean(args.noProfile),
    argv
  });
  if (explainConfig) {
    const explainedInputs = buildConfigExplainInputs({
        argv,
        args,
        profile,
        root,
        runtime: runtimeConfigSnapshot.effective,
        authMode,
        tunnel,
        stableHostname,
        mode,
        allowRoots,
        host,
        port,
        localAdminPort,
        bash,
        bashTranscript,
        codexSessions,
        codexDir,
        bashSession,
        requireBashSession,
        write,
        toolMode,
        widgetDomain,
        toolCards,
        semanticMode,
        semanticProvider,
        token
      });
    const selectedInputs = explainConfigKey
      ? explainedInputs.filter((input) => input.key === explainConfigKey)
      : explainedInputs;
    if (explainConfigKey && selectedInputs.length === 0) {
      throw new Error(
        `Unknown configuration key: ${explainConfigKey}. Available public keys: ${explainedInputs.map((input) => input.key).join(', ')}`
      );
    }
    const explanation = createConfigExplanation(
      runtimeConfigSnapshot,
      selectedInputs,
      { restartCommand: restartCommandPreview(argv, root) }
    );
    process.stdout.write(args.json
      ? `${JSON.stringify(explanation, null, 2)}\n`
      : formatConfigExplanationText(explanation));
    return;
  }
  serverEnv.CODEXGPT_EXPECTED_CONFIG_FINGERPRINT = runtimeConfigSnapshot.publicFingerprint;
  const configIntegrityKey = randomBytes(32).toString('hex');
  serverEnv.CODEXGPT_CONFIG_INTEGRITY_KEY = configIntegrityKey;
  serverEnv.CODEXGPT_EXPECTED_CONFIG_INTEGRITY = runtimeConfigSnapshot.integrityProof(configIntegrityKey);
  if (serverEnv.CODEXGPT_SEMANTIC_MODE === 'standard') {
    statusLine('warn', 'Semantic V5 exposes 52 tools. In an existing 51-tool ChatGPT App, choose Scan Tools once or recreate the App.');
  }
  if (args.printEnv) {
    console.log(JSON.stringify(redactEnvObject(serverEnv), null, 2));
  }
  if (args.printEnvOnly) return;

  const httpPath = path.join(projectRoot, 'dist', 'http.js');
  if (!fs.existsSync(httpPath)) {
    throw new Error(`Missing ${httpPath}. Run npm install && npm run build first.`);
  }

  await assertPortAvailable(host, port);
  if (authMode === 'oauth') await assertPortAvailable('127.0.0.1', localAdminPort);

  printBox('CodexGPT start', [
    labelValue('Workspace', root),
    labelValue('Mode', `${mode}  tools=${toolMode}  write=${write}  bash=${bash}`),
    labelValue('Bash transcript', bashTranscript),
    labelValue('Codex sessions', codexSessions),
    labelValue('Config fingerprint', runtimeConfigSnapshot.publicFingerprint),
    ...(bashSession ? [labelValue('Bash session', `${bashSession}${requireBashSession ? ' required' : ''}`)] : []),
    labelValue('Local URL', `http://${host}:${port}/mcp`),
    ...(authMode === 'oauth' ? [labelValue('Local admin', `http://127.0.0.1:${localAdminPort}/`)] : []),
    labelValue(
      'Tunnel',
      tunnel === 'cloudflare'
        ? 'Cloudflare quick tunnel'
        : tunnel === 'cloudflare-named'
          ? `Cloudflare named tunnel for ${stableHostname}`
          : tunnel === 'ngrok'
            ? `ngrok endpoint for ${stableHostname}`
            : tunnel === 'tailscale'
              ? `Tailscale Funnel endpoint for ${stableHostname}`
              : 'none'
    )
  ]);

  const verboseLogs = Boolean(args.logRequests || process.env.CODEXGPT_LOG_REQUESTS === '1');
  statusLine('wait', 'Starting local MCP server');
  const server = spawnLogged('codexgpt', process.execPath, [httpPath, '--root', root,
    ...(args.noProfile ? ['--no-profile'] : [])
  ], { cwd: projectRoot, env: serverEnv, verbose: verboseLogs });
  let cloudflared;
  let cleanupTunnelCredentials = () => {};
  const cleanup = () => {
    cleanupTunnelCredentials();
    cleanupChildren();
    clearRuntimeConnection(root);
  };
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  const localBase = `http://${host}:${port}`;
  const localAdminBase = authMode === 'oauth' ? `http://127.0.0.1:${localAdminPort}` : localBase;
  try {
    await Promise.all([
      waitForHealth(`${localBase}/healthz`, token, 15_000, authMode === 'oauth' ? stableHostname : ''),
      ...(authMode === 'oauth' ? [waitForHealth(`${localAdminBase}/healthz`, '', 15_000)] : [])
    ]);
  } catch (error) {
    const serverTail = typeof server.codexgptLogTail === 'function' ? server.codexgptLogTail() : '';
    cleanup();
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${serverTail ? `\n${serverTail}` : ''}`
    );
  }
  statusLine('ok', `Local MCP ready at ${localBase}/mcp`);
  const runtimeOptions = {
    localBase,
    localAdminBase,
    authMode,
    tunnel,
    mode,
    toolMode,
    write,
    bash,
    bashTranscript,
    codexSessions,
    bashSession,
    requireBashSession,
    toolCards,
    connectionTest,
    configFingerprint: runtimeConfigSnapshot.publicFingerprint
  };

  if (tunnel === 'none') {
    if (effectiveArgs.installCloudflared) {
      const installedCloudflared = await resolveCloudflared(effectiveArgs);
      if (installedCloudflared) console.log(`cloudflared ready: ${installedCloudflared}`);
    }
    const details = printConnectorBlock(`${localBase}/mcp`, token, {
      localBase,
      localStatusBase: localAdminBase,
      authMode,
      copyUrl: args.copyUrl ? true : args.noCopyUrl ? false : undefined,
      openChatgpt: Boolean(args.openChatgpt),
      mode,
      toolMode,
      root,
      write,
      bash,
      bashTranscript,
      codexSessions,
      bashSession,
      requireBashSession,
      connectionTest
    });
    saveRuntimeConnection(root, details, runtimeOptions);
    await runControlPanel(details, cleanup);
    return;
  }

  if (tunnel === 'ngrok') {
    const ngrokPath = resolveNgrok(effectiveArgs);
    const publicBase = publicBaseFromHostname(stableHostname);
    const ngrokArgs = ['http', localBase, '--url', publicBase];
    const configPath = ngrokConfigPath(root, args, profile);
    if (configPath) ngrokArgs.push('--config', configPath);
    statusLine('wait', `Opening ngrok endpoint for ${publicBase}`);
    cloudflared = spawnLogged('ngrok', ngrokPath, ngrokArgs, { cwd: root, env: process.env, verbose: verboseLogs });
    try {
      await waitForPublicHealth(publicBase, token, cloudflared, 'ngrok');
    } catch (error) {
      const tail = typeof cloudflared.codexgptLogTail === 'function' ? cloudflared.codexgptLogTail() : '';
      const hint = [
        '',
        'Ngrok stable domains need one-time setup before this can succeed:',
        '',
        '  ngrok config add-authtoken <your-ngrok-token>',
        '  find your free ngrok dev domain in the ngrok dashboard',
        '  codexgpt ngrok --hostname your-domain.ngrok-free.dev --token keep-this-stable-token',
        '',
        'If the domain is already in use, stop the other ngrok process or choose another reserved domain.'
      ].join('\n');
      throw new Error(`${error instanceof Error ? error.message : String(error)}${tail ? `\n\nRecent ngrok output:\n${tail}` : ''}${hint}`);
    }
    const details = printConnectorBlock(`${publicBase}/mcp`, token, {
      localBase,
      localStatusBase: localAdminBase,
      authMode,
      copyUrl: args.noCopyUrl ? false : true,
      openChatgpt: Boolean(args.openChatgpt),
      mode,
      toolMode,
      root,
      write,
      bash,
      bashTranscript,
      codexSessions,
      bashSession,
      requireBashSession,
      connectionTest
    });
    saveRuntimeConnection(root, details, runtimeOptions);
    await runControlPanel(details, cleanup);
    return;
  }

  if (tunnel === 'tailscale') {
    const tailscalePath = resolveTailscale(effectiveArgs);
    const publicBase = publicBaseFromHostname(stableHostname);
    const httpsPort = tailscaleFunnelHttpsPort(publicBase);
    const tailscaleArgs = ['funnel'];
    if (httpsPort !== '443') tailscaleArgs.push(`--https=${httpsPort}`);
    tailscaleArgs.push(localBase);
    statusLine('wait', `Opening Tailscale Funnel for ${publicBase}`);
    cloudflared = spawnLogged('tailscale', tailscalePath, tailscaleArgs, { cwd: root, env: process.env, verbose: verboseLogs });
    try {
      await waitForPublicHealth(publicBase, token, cloudflared, 'Tailscale Funnel');
    } catch (error) {
      const tail = typeof cloudflared.codexgptLogTail === 'function' ? cloudflared.codexgptLogTail() : '';
      const hint = [
        '',
        'Tailscale Funnel needs one-time setup before this can succeed:',
        '',
        '  install and log in to Tailscale',
        '  enable MagicDNS, HTTPS certificates, and Funnel for this tailnet',
        '  codexgpt tailscale --hostname your-device.your-tailnet.ts.net --token keep-this-stable-token',
        '',
        'Funnel exposes this connector publicly. Keep the CodexGPT token enabled.'
      ].join('\n');
      throw new Error(`${error instanceof Error ? error.message : String(error)}${tail ? `\n\nRecent tailscale output:\n${tail}` : ''}${hint}`);
    }
    const details = printConnectorBlock(`${publicBase}/mcp`, token, {
      localBase,
      localStatusBase: localAdminBase,
      authMode,
      copyUrl: args.noCopyUrl ? false : true,
      openChatgpt: Boolean(args.openChatgpt),
      mode,
      toolMode,
      root,
      write,
      bash,
      bashTranscript,
      codexSessions,
      bashSession,
      requireBashSession,
      connectionTest
    });
    saveRuntimeConnection(root, details, runtimeOptions);
    await runControlPanel(details, cleanup);
    return;
  }

  const cloudflaredPath = await resolveCloudflared(effectiveArgs);
  if (!cloudflaredPath) {
    console.error('\ncloudflared was not found. The local MCP server is still running.');
    console.error('Install Cloudflare Tunnel, rerun without --no-install-cloudflared, or run with --tunnel none for local clients.');
    console.error('Downloads: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/');
    const details = printConnectorBlock(`${localBase}/mcp`, token, {
      localBase,
      localStatusBase: localAdminBase,
      authMode,
      copyUrl: args.copyUrl ? true : false,
      openChatgpt: Boolean(args.openChatgpt),
      mode,
      toolMode,
      root,
      write,
      bash,
      bashTranscript,
      codexSessions,
      bashSession,
      requireBashSession,
      connectionTest
    });
    saveRuntimeConnection(root, details, runtimeOptions);
    await runControlPanel(details, cleanup);
    return;
  }

  if (tunnel === 'cloudflare') {
    statusLine('wait', 'Opening Cloudflare quick tunnel');
    const proxyUrl = outboundProxyFromEnv(process.env);
    let publicBase = '';
    if (proxyUrl) {
      const quickTunnel = requestQuickTunnelViaCurl(proxyUrl);
      const { credentialsPath, cleanup: removeCredentials } = writeQuickTunnelCredentials(quickTunnel);
      cleanupTunnelCredentials = removeCredentials;
      try {
        cloudflared = spawnLogged('cloudflared', cloudflaredPath, cloudflaredTunnelArgs('--url', localBase, '--credentials-file', credentialsPath, 'run', quickTunnel.id), { cwd: root, env: process.env, verbose: verboseLogs });
      } catch (error) {
        removeCredentials();
        throw error;
      }
      cloudflared.once('exit', removeCredentials);
      cloudflared.once('error', removeCredentials);
      await waitForTunnelStartup(cloudflared, 'cloudflared');
      publicBase = `https://${quickTunnel.hostname}`;
    } else {
      cloudflared = spawnLogged('cloudflared', cloudflaredPath, cloudflaredTunnelArgs('--url', localBase), { cwd: root, env: process.env, verbose: verboseLogs });
      publicBase = await waitForCloudflareUrl(cloudflared);
    }
    const details = printConnectorBlock(`${publicBase}/mcp`, token, {
      localBase,
      localStatusBase: localAdminBase,
      authMode,
      copyUrl: args.noCopyUrl ? false : true,
      openChatgpt: Boolean(args.openChatgpt),
      mode,
      toolMode,
      root,
      write,
      bash,
      bashTranscript,
      codexSessions,
      bashSession,
      requireBashSession,
      connectionTest
    });
    saveRuntimeConnection(root, details, runtimeOptions);
    await runControlPanel(details, cleanup);
    return;
  }

  const publicBase = publicBaseFromHostname(stableHostname);
  const tunnelName = optionValue(args, profile, 'tunnelName', ['CLOUDFLARE_TUNNEL_NAME', 'CODEXGPT_TUNNEL_NAME'], '');
  const cloudflareConfig = resolveConfigPath(root, optionValue(args, profile, 'cloudflareConfig', ['CLOUDFLARE_TUNNEL_CONFIG', 'CODEXGPT_CLOUDFLARE_CONFIG'], ''));
  const cloudflareTokenFile = resolveConfigPath(root, optionValue(args, profile, 'cloudflareTokenFile', ['CLOUDFLARE_TUNNEL_TOKEN_FILE', 'CODEXGPT_CLOUDFLARE_TUNNEL_TOKEN_FILE'], ''));
  const cloudflareToken = optionValue(args, profile, 'cloudflareToken', ['CLOUDFLARE_TUNNEL_TOKEN', 'CODEXGPT_CLOUDFLARE_TUNNEL_TOKEN'], '');

  const cloudflaredArgs = cloudflaredTunnelArgs();
  if (cloudflareConfig) {
    cloudflaredArgs.push('--config', cloudflareConfig, 'run');
    if (tunnelName) cloudflaredArgs.push(tunnelName);
  } else {
    cloudflaredArgs.push('run', '--url', localBase);
    if (cloudflareTokenFile) {
      cloudflaredArgs.push('--token-file', cloudflareTokenFile);
    } else if (cloudflareToken) {
      // Passed to cloudflared through the child environment below.
    } else {
      if (!tunnelName) {
        throw new Error('--tunnel-name, --cloudflare-token, --cloudflare-token-file, or --cloudflare-config is required with --tunnel cloudflare-named.');
      }
      cloudflaredArgs.push(tunnelName);
    }
  }

  statusLine('wait', `Starting Cloudflare named tunnel for ${publicBase}`);
  const cloudflaredEnv = cloudflareToken && !cloudflareTokenFile
    ? { ...process.env, TUNNEL_TOKEN: cloudflareToken }
    : process.env;
  cloudflared = spawnLogged('cloudflared', cloudflaredPath, cloudflaredArgs, { cwd: root, env: cloudflaredEnv, verbose: verboseLogs });
  try {
    await waitForPublicHealth(publicBase, token, cloudflared, 'tunnel', true);
  } catch (error) {
    const tail = typeof cloudflared.codexgptLogTail === 'function' ? cloudflared.codexgptLogTail() : '';
    const hint = [
      '',
      'Named Cloudflare tunnels need one-time setup before this can succeed:',
      '',
      '  cloudflared tunnel login',
      '  cloudflared tunnel create <tunnel-name>',
      '  cloudflared tunnel route dns <tunnel-name> <hostname>',
      '',
      'Or create a remotely managed tunnel in the Cloudflare dashboard and pass:',
      '',
      '  --cloudflare-token-file ~/.codexgpt/cloudflare-tunnel-token',
      '',
      'Quick tunnels do not support a permanent hostname. Use --tunnel cloudflare only for demos.'
    ].join('\n');
    throw new Error(`${error instanceof Error ? error.message : String(error)}${tail ? `\n\nRecent cloudflared output:\n${tail}` : ''}${hint}`);
  }
  const details = printConnectorBlock(`${publicBase}/mcp`, token, {
    localBase,
    localStatusBase: localAdminBase,
    authMode,
    copyUrl: args.noCopyUrl ? false : true,
    openChatgpt: Boolean(args.openChatgpt),
    mode,
    toolMode,
    root,
    write,
    bash,
    bashTranscript,
    codexSessions,
    bashSession,
    requireBashSession,
    connectionTest
  });
  saveRuntimeConnection(root, details, runtimeOptions);
  await runControlPanel(details, cleanup);
}

main().catch((error) => {
  cleanupChildren();
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  if (process.env.CODEXGPT_DEBUG === '1' && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
