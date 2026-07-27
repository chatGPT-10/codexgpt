import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { once } from "node:events";
import { createPublicOAuthApp } from "../dist/http/publicApp.js";
import { LocalAdminSessionManager } from "../dist/auth/localAdminSession.js";
import { createLocalAdminApp } from "../dist/http/localAdminApp.js";

const publicJwks = [{
  kty: "EC",
  crv: "P-256",
  x: "A".repeat(43),
  y: "B".repeat(43),
  kid: "kid_0123456789abcdef0123456789abcdef",
  alg: "ES256",
  use: "sig"
}];

const identity = {
  issuer: "https://mcp.example.com",
  resource: "https://mcp.example.com/mcp",
  hostname: "mcp.example.com",
  profileId: "0123456789abcdef01234567",
  bindingId: "B00000000000000000000001",
  incarnationId: "I00000000000000000000002",
  recoveryEpoch: "R00000000000000000000003"
};

async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await fn(address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function withServerFactory(factory, fn) {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.on("request", factory(address.port));
  try {
    await fn(address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function rawRequest(port, lines) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const chunks = [];
    socket.on("connect", () => socket.write(`${lines.join("\r\n")}\r\n\r\n`));
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      const match = /^HTTP\/1\.1 (\d{3})/.exec(text);
      resolve({ status: match ? Number(match[1]) : 0, text });
    });
    socket.on("error", reject);
  });
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path,
      method: options.method ?? "GET",
      headers: { Host: options.host ?? "mcp.example.com", ...(options.headers ?? {}) }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("public OAuth router physically excludes owner routes", async () => {
  await withServer(createPublicOAuthApp({ identity, enabledScopes: ["codexgpt:read"], publicJwks }), async (port) => {
    for (const route of ["/setup", "/admin/profile", "/owner/approve", "/local/revoke", "/keys/rotate"]) {
      const response = await request(port, route);
      assert.equal(response.status, 404, route);
    }
    const health = await request(port, "/healthz");
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.text), { ok: true, name: "CodexGPT", authMode: "oauth", mcpAvailable: false });
    assert.equal(health.headers["cache-control"], "no-store");
  });
});

test("public authority ignores forwarded host", async () => {
  await withServer(createPublicOAuthApp({ identity, enabledScopes: ["codexgpt:read"], publicJwks }), async (port) => {
    const response = await request(port, "/healthz", { host: "evil.example", headers: { "X-Forwarded-Host": "mcp.example.com" } });
    assert.equal(response.status, 403);
  });
});

test("public and local listeners reject duplicate Host authority", async () => {
  await withServer(createPublicOAuthApp({ identity, enabledScopes: ["codexgpt:read"], publicJwks }), async (port) => {
    const response = await rawRequest(port, [
      "GET /healthz HTTP/1.1",
      "Host: mcp.example.com",
      "Host: evil.example",
      "Connection: close"
    ]);
    assert.equal(response.status, 403, response.text);
  });

  await withServerFactory((port) => createLocalAdminApp({
    ownerAdminService: {
      kind: "local-control-cli",
      isAvailable: () => true,
      issueBootstrap: () => "",
      listAuthorizations: async () => ({ oauthAuthorizations: [] }),
      approveAuthorization: async () => ({}),
      denyAuthorization: async () => ({}),
      listClients: async () => ({ oauthClients: [] }),
      revokeClient: async () => ({}),
      listGrants: async () => ({ oauthGrants: [] }),
      revokeGrant: async () => ({}),
      revokeOwnerGrants: async () => ({})
    },
    sessions: new LocalAdminSessionManager(),
    origin: `http://127.0.0.1:${port}`
  }), async (port) => {
    const response = await rawRequest(port, [
      "GET /healthz HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      "Host: evil.example",
      "Connection: close"
    ]);
    assert.equal(response.status, 403, response.text);
  });
});

test("local admin router exposes only the reviewed session-protected browser API", async () => {
  await withServerFactory((port) => createLocalAdminApp({
    ownerAdminService: {
      kind: "local-control-cli",
      isAvailable: () => true,
      issueBootstrap: () => "",
      listAuthorizations: async () => ({ oauthAuthorizations: [] }),
      approveAuthorization: async () => ({}),
      denyAuthorization: async () => ({}),
      listClients: async () => ({ oauthClients: [] }),
      revokeClient: async () => ({}),
      listGrants: async () => ({ oauthGrants: [] }),
      revokeGrant: async () => ({}),
      revokeOwnerGrants: async () => ({})
    },
    sessions: new LocalAdminSessionManager(),
    origin: `http://127.0.0.1:${port}`
  }), async (port) => {
    const legacy = await request(port, "/owner/approve", { method: "POST", host: `127.0.0.1:${port}` });
    assert.equal(legacy.status, 404);
    const protectedMutation = await request(port, "/api/grants/revoke-all", { method: "POST", host: `127.0.0.1:${port}` });
    assert.equal(protectedMutation.status, 403);
    const health = await request(port, "/healthz", { host: `127.0.0.1:${port}` });
    assert.equal(JSON.parse(health.text).ownerChannelAvailable, true);
    assert.equal(health.headers["access-control-allow-origin"], undefined);
  });
});

test("Cloudflare ingress targets only the public listener", () => {
  const launcher = fs.readFileSync(new URL("../scripts/codexgpt.mjs", import.meta.url), "utf8");
  assert.match(launcher, /cloudflaredTunnelArgs\('--url', localBase\)/);
  assert.match(launcher, /cloudflaredArgs\.push\('run', '--url', localBase\)/);
  assert.doesNotMatch(launcher, /cloudflaredTunnelArgs\([^\n]*localAdminBase/);
  assert.doesNotMatch(launcher, /cloudflaredArgs\.push\([^\n]*localAdminBase/);
});
