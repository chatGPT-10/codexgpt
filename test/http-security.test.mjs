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

function request(url, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.once("error", reject);
    req.end();
  });
}

async function startServer(overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-http-security-"));
  const port = await freePort();
  const credential = randomBytes(32).toString("base64url");
  const env = {
    ...process.env,
    CODEXGPT_ROOT: root,
    CODEXGPT_ALLOWED_ROOTS: root,
    CODEXGPT_HOST: "127.0.0.1",
    CODEXGPT_PORT: String(port),
    CODEXGPT_HTTP_TOKEN: credential,
    CODEXGPT_ALLOWED_HOSTS: "127.0.0.1,localhost,mcp.example.test",
    CODEXGPT_BASH_MODE: "off",
    CODEXGPT_WRITE_MODE: "off",
    CODEXGPT_TOOL_MODE: "minimal",
    CODEXGPT_LOG_REQUESTS: "1",
    CODEXGPT_TUNNEL_MODE: "0",
    ...overrides
  };
  delete env.HOST;
  delete env.PORT;
  if (!("CODEXGPT_ALLOW_QUERY_TOKEN" in overrides)) delete env.CODEXGPT_ALLOW_QUERY_TOKEN;
  if (!("CODEXGPT_ALLOWED_ORIGINS" in overrides)) delete env.CODEXGPT_ALLOWED_ORIGINS;

  const child = spawn(process.execPath, ["dist/http.js"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for HTTP server\n${stderr}`)), 15000);
    const check = () => {
      if (stderr.includes("HTTP MCP listening")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stderr.on("data", check);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`HTTP server exited before listening: ${code}\n${stderr}`));
    });
    check();
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    credential,
    stderr: () => stderr,
    async close() {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      await fs.rm(root, { recursive: true, force: true });
    }
  };
}

test("HTTP security defaults reject query credentials and untrusted hosts/origins", async () => {
  const server = await startServer();
  try {
    const queryOnly = await request(`${server.baseUrl}/healthz?codexgpt_token=${encodeURIComponent(server.credential)}`);
    assert.equal(queryOnly.status, 401);

    const authorized = await request(`${server.baseUrl}/healthz`, {
      headers: { authorization: `Bearer ${server.credential}` }
    });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers["x-content-type-options"], "nosniff");
    assert.equal(authorized.headers["referrer-policy"], "no-referrer");
    assert.equal(authorized.headers["x-frame-options"], "DENY");

    const badHost = await request(`${server.baseUrl}/healthz`, {
      headers: { authorization: `Bearer ${server.credential}`, host: "evil.example" }
    });
    assert.equal(badHost.status, 403);

    const allowedPublicHost = await request(`${server.baseUrl}/healthz`, {
      headers: { authorization: `Bearer ${server.credential}`, host: "mcp.example.test" }
    });
    assert.equal(allowedPublicHost.status, 200);

    const badOrigin = await request(`${server.baseUrl}/healthz`, {
      headers: { authorization: `Bearer ${server.credential}`, origin: "https://evil.example" }
    });
    assert.equal(badOrigin.status, 403);

    const sameOrigin = server.baseUrl;
    const allowedSameOrigin = await request(`${server.baseUrl}/healthz`, {
      headers: { authorization: `Bearer ${server.credential}`, origin: sameOrigin }
    });
    assert.equal(allowedSameOrigin.status, 200);
    assert.equal(allowedSameOrigin.headers["access-control-allow-origin"], sameOrigin);

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(server.stderr().includes(server.credential), false);
    assert.match(server.stderr(), /GET \/healthz/);
  } finally {
    await server.close();
  }
});

test("tunnel mode still rejects query credentials unless explicitly enabled", async () => {
  const server = await startServer({
    CODEXGPT_TUNNEL_MODE: "1"
  });
  try {
    const queryOnly = await request(`${server.baseUrl}/healthz?codexgpt_token=${encodeURIComponent(server.credential)}`);
    assert.equal(queryOnly.status, 401);

    const authorized = await request(`${server.baseUrl}/healthz`, {
      headers: { authorization: `Bearer ${server.credential}` }
    });
    assert.equal(authorized.status, 200);
  } finally {
    await server.close();
  }
});

test("explicit origin and legacy query compatibility settings are honored", async () => {
  const server = await startServer({
    CODEXGPT_ALLOW_QUERY_TOKEN: "1",
    CODEXGPT_ALLOWED_ORIGINS: "https://client.example"
  });
  try {
    const legacyQuery = await request(`${server.baseUrl}/healthz?codexgpt_token=${encodeURIComponent(server.credential)}`);
    assert.equal(legacyQuery.status, 200);

    const configuredOrigin = await request(`${server.baseUrl}/healthz`, {
      headers: {
        authorization: `Bearer ${server.credential}`,
        origin: "https://client.example"
      }
    });
    assert.equal(configuredOrigin.status, 200);
    assert.equal(configuredOrigin.headers["access-control-allow-origin"], "https://client.example");
  } finally {
    await server.close();
  }
});
