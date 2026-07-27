import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

const auth = await tsImport("../src/auth/index.ts", import.meta.url);

export function createFoundation(options = {}) {
  const stateRoot = options.stateRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-auth-state-"));
  const workspaceRoot = options.workspaceRoot ?? fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-phase8-workspace-")));
  const events = [];
  const credentialStore = options.credentialStore ?? new auth.MemoryCredentialStore();
  const store = new auth.AuthStateStore(stateRoot, credentialStore, {
    audit: options.audit ?? { append(event) { events.push(structuredClone(event)); } }
  });
  const instance = new auth.AuthProcessInstanceRegistry(stateRoot, options.instanceDependencies);
  const locks = new auth.AuthStateLock(stateRoot, instance, options.lockDependencies);
  const registry = new auth.DeploymentRegistry(store, options.platform ?? process.platform);
  const keyManager = new auth.AuthKeyManager(credentialStore, options.keyDependencies);
  const coordinator = new auth.AuthDeploymentCoordinator(store, keyManager, registry, locks);
  const configuration = auth.resolveOAuthDeploymentConfiguration({
    canonicalRoot: workspaceRoot,
    profileId: "a".repeat(24),
    hostname: options.hostname ?? "mcp.example.com",
    platform: "win32",
    tunnel: "cloudflare-named",
    tunnelName: options.tunnelName ?? "codexgpt-oauth",
    tunnelOwner: "codexgpt",
    publicHost: "127.0.0.1",
    publicPort: 8787,
    localAdminHost: "127.0.0.1",
    localAdminPort: 8788
  });

  return {
    auth,
    stateRoot,
    workspaceRoot,
    events,
    credentialStore,
    store,
    instance,
    locks,
    registry,
    keyManager,
    coordinator,
    configuration,
    cleanup() {
      instance.dispose();
      fs.rmSync(stateRoot, { recursive: true, force: true });
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  };
}
