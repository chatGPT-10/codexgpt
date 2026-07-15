#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createStdioPolicySessionSource } from "./policy/identity.js";
import { policyIdentityScopes } from "./policy/runtime.js";
import {
  connectProductionCodexProServer,
  createProductionCodexProServer
} from "./productionRuntime.js";

const CODEXPRO_VERSION = "0.28.6";

function printHelp(): void {
  console.log(`CodexPro MCP stdio server

Usage:
  codexpro-mcp --root /path/to/repo [--allow-root /path]
  codexpro-mcp --version
  codexpro-mcp --help

Most users should run: codexpro start`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--version") || argv.includes("-v") || argv[0] === "version") {
    console.log(CODEXPRO_VERSION);
    return;
  }
  if (argv.includes("--help") || argv[0] === "help") {
    printHelp();
    return;
  }

  process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN ??= "1";
  const config = loadConfig();
  const needsSessionContext =
    (config.policyEngineMode ?? "legacy") !== "legacy" ||
    (config.fileTransactions === "atomic" && config.writeMode !== "off");
  const policySessionContextSource = needsSessionContext
    ? createStdioPolicySessionSource({
        sessionId: randomUUID(),
        scopes: policyIdentityScopes(config)
      })
    : undefined;
  const server = createProductionCodexProServer(config, { policySessionContextSource });
  const transport = new StdioServerTransport();
  await connectProductionCodexProServer(server, transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
