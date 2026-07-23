import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function baseEnv(root) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === "string")),
    CODEXGPT_ROOT: root,
    CODEXGPT_ALLOWED_ROOTS: root,
    CODEXGPT_GUIDANCE_MODE: "standard",
    CODEXGPT_TOOL_MODE: "standard",
    CODEXGPT_BASH_MODE: "off",
    CODEXGPT_WRITE_MODE: "off",
    CODEXGPT_POLICY_ENGINE: "legacy",
    CODEXGPT_TOOL_CONTRACT_VERSION: "1",
    CODEXGPT_FILE_TRANSACTIONS: "legacy",
    CODEXGPT_ALLOW_NO_HTTP_TOKEN: "1",
    CODEXGPT_TUNNEL_MODE: "0"
  };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("No free port")));
    });
  });
}

function guidanceProjection(result) {
  const data = result.structuredContent.data;
  return {
    guidance_mode: data.guidance_mode,
    guidance_status: data.guidance_status,
    instructions: data.instruction_chain.map((item) => [item.path, item.text]),
    skills: data.skill_catalog.map((item) => [item.name, item.path])
  };
}

test("standard guidance agrees across STDIO and HTTP production transports", { timeout: 45_000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "phase6-transport-")));
  const skillDir = path.join(root, ".agents", "skills", "transport-check");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(root, "AGENTS.md"), "TRANSPORT RULES");
  await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: transport-check\ndescription: Verify transport parity\n---\nBody");

  let stdioClient;
  let httpClient;
  let child;
  try {
    stdioClient = new Client({ name: "phase6-stdio", version: "0" });
    const stdioTransport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve("dist/stdio.js")],
      cwd: process.cwd(),
      env: baseEnv(root),
      stderr: "pipe"
    });
    await stdioClient.connect(stdioTransport);
    const stdioResult = await stdioClient.callTool({ name: "open_current_workspace", arguments: {} });

    const port = await freePort();
    const token = randomBytes(32).toString("base64url");
    const env = {
      ...baseEnv(root),
      CODEXGPT_PORT: String(port),
      CODEXGPT_HOST: "127.0.0.1",
      CODEXGPT_HTTP_TOKEN: token,
      CODEXGPT_ALLOWED_HOSTS: "127.0.0.1,localhost"
    };
    child = spawn(process.execPath, ["dist/http.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`HTTP start timeout: ${stderr}`)), 15_000);
      const ready = () => {
        if (stderr.includes("HTTP MCP listening")) { clearTimeout(timeout); resolve(); }
      };
      child.stderr.on("data", ready);
      child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`HTTP exited ${code}: ${stderr}`)); });
      ready();
    });
    httpClient = new Client({ name: "phase6-http", version: "0" });
    const httpTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }
    });
    await httpClient.connect(httpTransport);
    const httpResult = await httpClient.callTool({ name: "open_current_workspace", arguments: {} });

    assert.deepEqual(guidanceProjection(httpResult), guidanceProjection(stdioResult));
  } finally {
    await Promise.allSettled([stdioClient?.close(), httpClient?.close()]);
    if (child && child.exitCode === null) child.kill("SIGTERM");
    await fs.rm(root, { recursive: true, force: true });
  }
});
