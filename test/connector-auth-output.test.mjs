import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => port ? resolve(port) : reject(new Error("No free port available")));
    });
  });
}

function request(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers
    }, (res) => {
      res.resume();
      res.once("end", () => resolve(res.statusCode));
    });
    req.once("error", reject);
    req.end();
  });
}

async function startCli({ allowQueryToken, disableQueryToken = false }) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-connector-auth-home-"));
  const port = await freePort();
  const token = randomBytes(24).toString("hex");
  const env = { ...process.env, CODEXPRO_HOME: home };
  if (allowQueryToken) env.CODEXPRO_ALLOW_QUERY_TOKEN = "1";
  else if (disableQueryToken) env.CODEXPRO_ALLOW_QUERY_TOKEN = "0";
  else delete env.CODEXPRO_ALLOW_QUERY_TOKEN;

  const child = spawn(process.execPath, [
    "scripts/codexpro-entry.mjs",
    "start",
    "--no-profile",
    "--root", process.cwd(),
    "--tunnel", "none",
    "--port", String(port),
    "--token", token,
    "--no-bash",
    "--write", "off",
    "--tool-mode", "minimal",
    "--no-copy-url"
  ], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for CLI readiness\nstdout:\n${stdout}\nstderr:\n${stderr}`)), 15000);
    const check = () => {
      if (stdout.includes("CodexPro ready") && stdout.includes("Keys:")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", check);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`CLI exited before readiness: ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
    check();
  });

  const readyOutput = stdout.slice(stdout.lastIndexOf("CodexPro ready"));
  const urls = readyOutput.match(/http:\/\/127\.0\.0\.1:\d+\/mcp(?:\?[^\s]+)?/g) ?? [];
  const serverUrl = urls.at(-1);
  assert.ok(serverUrl, `CLI output did not contain a Server URL\n${readyOutput}`);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    token,
    serverUrl,
    readyOutput,
    async close() {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      await fs.rm(home, { recursive: true, force: true });
    }
  };
}

test("default public CLI output uses the personal ChatGPT query-token flow", async () => {
  const cli = await startCli({ allowQueryToken: false });
  try {
    assert.match(cli.serverUrl, /[?&]codexpro_token=/);
    assert.match(cli.readyOutput, /Authentication:\s*(?:No Authentication(?:\s*\/\s*None)?|None)/i);
    assert.doesNotMatch(cli.readyOutput, /Authorization:\s*Bearer/i);

    const queryStatus = await request(`${cli.baseUrl}/healthz?codexpro_token=${encodeURIComponent(cli.token)}`);
    const bearerStatus = await request(`${cli.baseUrl}/healthz`, { authorization: `Bearer ${cli.token}` });
    assert.equal(queryStatus, 200);
    assert.equal(bearerStatus, 200);
  } finally {
    await cli.close();
  }
});

test("explicit query-token compatibility retains URL-token and Authentication None guidance", async () => {
  const cli = await startCli({ allowQueryToken: true });
  try {
    assert.match(cli.serverUrl, /[?&]codexpro_token=/);
    assert.match(cli.readyOutput, /Authentication:\s*(?:No Authentication(?:\s*\/\s*None)?|None)/i);

    const queryStatus = await request(`${cli.baseUrl}/healthz?codexpro_token=${encodeURIComponent(cli.token)}`);
    const bearerStatus = await request(`${cli.baseUrl}/healthz`, { authorization: `Bearer ${cli.token}` });
    assert.equal(queryStatus, 200);
    assert.equal(bearerStatus, 200);
  } finally {
    await cli.close();
  }
});

test("explicit query-token opt-out describes Bearer only for compatible non-ChatGPT clients", async () => {
  const cli = await startCli({ allowQueryToken: false, disableQueryToken: true });
  try {
    assert.equal(cli.serverUrl, `${cli.baseUrl}/mcp`);
    assert.match(cli.readyOutput, /compatible MCP client/i);
    assert.match(cli.readyOutput, /not ChatGPT Web/i);
    assert.doesNotMatch(cli.readyOutput, /open ChatGPT[^\n]{0,200}Bearer/i);

    const queryStatus = await request(`${cli.baseUrl}/healthz?codexpro_token=${encodeURIComponent(cli.token)}`);
    const bearerStatus = await request(`${cli.baseUrl}/healthz`, { authorization: `Bearer ${cli.token}` });
    assert.equal(queryStatus, 401);
    assert.equal(bearerStatus, 200);
  } finally {
    await cli.close();
  }
});
