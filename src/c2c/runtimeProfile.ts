import type { CodexGPTConfig } from '../config.js';

// Closed-world ceiling: future tools gain no C2C authority by default.
const tools = new Set([
  'codexgpt', 'server_config', 'codexgpt_inventory', 'list_workspaces',
  'open_current_workspace', 'open_workspace', 'close_workspace', 'workspace_snapshot',
  'inspect_workspace', 'tree', 'search', 'read', 'git_status', 'git_diff', 'show_changes',
  'read_handoff', 'wait_for_handoff', 'codex_context', 'load_skill', 'handoff_to_codex', 'semantic'
]);

export function c2cToolAllowed(name: string): boolean { return tools.has(name); }

export function parseC2CRuntime(value: string | undefined): boolean {
  if (value === undefined || value === '0') return false;
  if (value === '1') return true;
  throw new Error('CODEXGPT_C2C_RUNTIME must be exactly 0 or 1.');
}

export function assertC2CRuntime(config: CodexGPTConfig): void {
  if (!config.c2cRuntime) return;
  if (config.writeMode !== 'handoff' || config.bashMode !== 'off' || config.toolMode !== 'standard' ||
      config.codexSessions !== 'off' || config.executionProfile !== 'off' || config.gitMode !== 'read' ||
      config.gitIntegrations !== 'off' || config.contextDir !== '.ai-bridge') {
    throw new Error('C2C requires handoff writes, standard tools, disabled Bash/history/execution, read-only Git, and .ai-bridge context.');
  }
}
