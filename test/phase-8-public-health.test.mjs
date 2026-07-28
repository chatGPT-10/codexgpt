import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { once } from "node:events";
import express from "express";
import {
  createPublicAdmissionMiddleware,
  createPublicOAuthApp
} from "../dist/http/publicApp.js";
import { OAuthTokenEndpointDiagnostics } from "../dist/auth/rateLimits.js";

const publicJwks = [{
  kty: "EC",
  crv: "P-256",
  x: "A".repeat(43),
  y: "B".repeat(43),
  kid: "kid_0123456789abcdef0123456789abcdef",
  alg: "ES256",
  use: "sig"
}];

const app = createPublicOAuthApp({
  identity: {
    issuer: "https://mcp.example.com",
    resource: "https://mcp.example.com/mcp",
    hostname: "mcp.example.com",
    profileId: "0123456789abcdef01234567",
    bindingId: "B00000000000000000000001",
    incarnationId: "I00000000000000000000002",
    recoveryEpoch: "R00000000000000000000003"
  },
  enabledScopes: ["codexgpt:read"],
  publicJwks
});

async function withServer(serverApp, fn) {
  const server = serverApp.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await fn(address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function request(port, path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers: { Host: "mcp.example.com" } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("public metadata and JWKS are pre-serialized with the exact cache contract", async () => {
  await withServer(app, async (port) => {
    for (const route of ["/.well-known/oauth-authorization-server", "/jwks"]) {
      const first = await request(port, route);
      const second = await request(port, route);
      assert.equal(first.status, 200);
      assert.equal(first.text, second.text);
      assert.equal(first.headers["cache-control"], "public, max-age=60, must-revalidate");
      assert.equal(first.headers["access-control-allow-origin"], "*");
    }
    assert.deepEqual(JSON.parse((await request(port, "/jwks")).text), { keys: publicJwks });
  });
});

test("public root is the static resource-documentation page and health discloses only safe state", async () => {
  await withServer(app, async (port) => {
    const root = await request(port, "/");
    const health = await request(port, "/healthz");
    assert.equal(root.headers["cache-control"], "no-store");
    assert.match(root.text, /CodexGPT OAuth resource/);
    assert.match(root.text, /oauth-protected-resource\/mcp/);
    assert.match(root.text, /RFC 9207 issuer binding/);
    assert.match(root.text, /unknown extension fields/);
    assert.match(root.text, /Public work limits/);
    assert.match(root.text, /invalid_grant/);
    assert.match(root.text, /separate loopback local-admin listener/);
    assert.doesNotMatch(root.text, /authenticated read-only MCP access/);
    assert.equal(health.headers["cache-control"], "no-store");
    assert.deepEqual(Object.keys(JSON.parse(health.text)).sort(), ["authMode", "mcpAvailable", "name", "ok"]);
  });
});

test("public MCP remains unavailable in Task 8A3", async () => {
  await withServer(app, async (port) => {
    const response = await request(port, "/mcp", "POST");
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(response.text), { error: "OAUTH_RUNTIME_UNAVAILABLE" });
    assert.equal(response.headers["cache-control"], "no-store");
  });
});

test("public admission bounds active, queued, and per-minute work", async () => {
  const bounded = express();
  bounded.use(createPublicAdmissionMiddleware({ active: 1, queued: 1, perMinute: 3 }));
  const held = [];
  bounded.get("/hold", (_req, res) => held.push(res));
  bounded.get("/fast", (_req, res) => res.json({ ok: true }));

  await withServer(bounded, async (port) => {
    const first = request(port, "/hold");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = request(port, "/fast");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const overflow = await request(port, "/fast");
    assert.equal(overflow.status, 429);
    assert.equal(overflow.headers["retry-after"], "1");
    held.shift().json({ released: true });
    assert.equal((await first).status, 200);
    assert.equal((await second).status, 200);
    const rateLimited = await request(port, "/fast");
    assert.equal(rateLimited.status, 429);
  });
});

test("public admission records a credential-free reason when it rejects /token", async () => {
  const diagnostics = new OAuthTokenEndpointDiagnostics();
  const bounded = express();
  bounded.use(
    createPublicAdmissionMiddleware(
      { active: 1, queued: 0, perMinute: 1 },
      diagnostics
    )
  );
  bounded.post("/token", (_req, res) => res.json({ ok: true }));

  await withServer(bounded, async (port) => {
    assert.equal((await request(port, "/token", "POST")).status, 200);
    assert.equal((await request(port, "/token", "POST")).status, 429);
  });
  assert.equal(
    diagnostics.snapshot().entries.find(
      (entry) => entry.reason === "public_admission_limit"
    )?.count,
    1
  );
});

test("public admission reserves active, queued, and rate capacity for exact /mcp", async () => {
  const bounded = express();
  bounded.use(createPublicAdmissionMiddleware({
    active: 2,
    queued: 2,
    reservedMcpActive: 1,
    reservedMcpQueued: 1,
    perMinute: 2
  }));
  const heldGeneral = [];
  const heldMcp = [];
  bounded.get("/hold", (_req, res) => heldGeneral.push(res));
  bounded.get("/mcp", (_req, res) => heldMcp.push(res));
  bounded.get("/fast", (_req, res) => res.json({ ok: true }));

  await withServer(bounded, async (port) => {
    const first = request(port, "/hold");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const queued = request(port, "/fast");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const generalOverflow = await request(port, "/fast");
    assert.equal(generalOverflow.status, 429);

    const mcp = request(port, "/mcp");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(heldMcp.length, 1);
    heldMcp.shift().json({ mcp: true });
    assert.equal((await mcp).status, 200);

    heldGeneral.shift().json({ released: true });
    assert.equal((await first).status, 200);
    assert.equal((await queued).status, 200);
  });
});
