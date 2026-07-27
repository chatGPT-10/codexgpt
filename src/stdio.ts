#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { contractIncludesV4 } from "./tools/contracts/index.js";
import { createStdioPolicySessionSource } from "./policy/identity.js";
import { policyIdentityScopes } from "./policy/runtime.js";
import {
  connectProductionCodexGPTServer,
  createProductionCodexGPTServer
} from "./productionRuntime.js";
import { createProductionGitBootstrapV4 } from "./git/productionBootstrap.js";
import { resolveTransactionStateRoot } from "./transactions/stateRoot.js";

const CODEXGPT_VERSION = "1.0.0";

function printHelp(): void {
  console.log(`CodexGPT MCP stdio server

Usage:
  codexgpt-mcp --root /path/to/repo [--allow-root /path]
  codexgpt-mcp --version
  codexgpt-mcp --help

Most users should run: codexgpt start`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--version") || argv.includes("-v") || argv[0] === "version") {
    console.log(CODEXGPT_VERSION);
    return;
  }
  if (argv.includes("--help") || argv[0] === "help") {
    printHelp();
    return;
  }

  process.env.CODEXGPT_ALLOW_NO_HTTP_TOKEN ??= "1";
  const config = loadConfig();
  const needsSessionContext =
    contractIncludesV4(config.toolContractVersion) ||
    (config.policyEngineMode ?? "legacy") !== "legacy" ||
    (config.fileTransactions === "atomic" && config.writeMode !== "off");
  const policySessionContextSource = needsSessionContext
    ? createStdioPolicySessionSource({
        sessionId: randomUUID(),
        scopes: policyIdentityScopes(config)
      })
    : undefined;
  const gitBootstrapV4 = await createProductionGitBootstrapV4(config, {
    stateRoot: resolveTransactionStateRoot()
  });
  let server;
  try {
    server = createProductionCodexGPTServer(config, {
      policySessionContextSource,
      gitBootstrapV4: gitBootstrapV4 ?? undefined
    });
  } catch (error) {
    await gitBootstrapV4?.dispose();
    throw error;
  }
  const transport = new StdioServerTransport();
  await connectProductionCodexGPTServer(server, transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
