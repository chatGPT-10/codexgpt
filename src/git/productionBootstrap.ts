import type { CodexGPTConfig } from "../config.js";
import { contractIncludesV4 } from "../tools/contracts/index.js";
import type { ManagedWorktreeRoot } from "../worktrees/root.js";
import { admitManagedWorktreeRoot } from "../worktrees/root.js";
import { WindowsProcessHostRuntime } from "../process/windowsHostClient.js";
import { WindowsHostGitExecutor } from "./execution.js";

export interface ProductionGitBootstrapV4 {
  executor: WindowsHostGitExecutor;
  managedRoot: ManagedWorktreeRoot | null;
  dispose(): Promise<void>;
}

export async function createProductionGitBootstrapV4(
  config: CodexGPTConfig,
  options: {
    stateRoot: string;
    explicitGitPath?: string;
  }
): Promise<ProductionGitBootstrapV4 | null> {
  if (
    !contractIncludesV4(config.toolContractVersion) ||
    config.toolMode === "minimal" ||
    config.connectionTest
  ) return null;
  const hostRuntime = new WindowsProcessHostRuntime();
  let executor: WindowsHostGitExecutor | null = null;
  try {
    executor = await WindowsHostGitExecutor.start({
      hostRuntime,
      explicitGitPath: options.explicitGitPath
    });
    const managedRoot = config.gitMode === "local"
      ? await admitManagedWorktreeRoot({
          root: config.taskWorktreeRoot,
          protectedRoots: [...config.allowedRoots, options.stateRoot],
          create: true
        })
      : null;
    return {
      executor,
      managedRoot,
      async dispose() {
        await executor?.dispose();
        await hostRuntime.close();
      }
    };
  } catch (error) {
    await executor?.dispose().catch(() => {});
    await hostRuntime.close().catch(() => {});
    throw error;
  }
}
