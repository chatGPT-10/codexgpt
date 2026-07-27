import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import { tsImport } from "tsx/esm/api";

const {
  SDK_AUTH_CONTRACT_VERSION,
  authorizationHandler,
  createLookupOnlyClientStore,
  mcpAuthRouter,
  requireBearerAuth,
  revocationHandler,
  tokenHandler
} = await tsImport("../src/auth/index.ts", import.meta.url);

function packageJsonFor(specifier, expectedName) {
  let current = path.dirname(fileURLToPath(import.meta.resolve(specifier)));
  for (;;) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) {
      const document = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (document.name === expectedName) return document;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Unable to locate package.json for ${specifier}`);
    current = parent;
  }
}

test("the production MCP SDK and jose contracts are pinned exactly", () => {
  const packageJson = packageJsonFor("@modelcontextprotocol/sdk/server/auth/router.js", "@modelcontextprotocol/sdk");
  const rootPackage = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(packageJson.version, "1.29.0");
  assert.equal(SDK_AUTH_CONTRACT_VERSION, "1.29.0");
  assert.equal(rootPackage.dependencies["@modelcontextprotocol/sdk"], "1.29.0");
  assert.equal(rootPackage.dependencies.jose, "6.2.4");
  assert.equal(lock.packages[""].dependencies["@modelcontextprotocol/sdk"], "1.29.0");
  assert.equal(lock.packages[""].dependencies.jose, "6.2.4");
  assert.equal(lock.packages["node_modules/@modelcontextprotocol/sdk"].version, "1.29.0");
  assert.equal(lock.packages["node_modules/jose"].version, "6.2.4");
});

test("the exact SDK handler and middleware primitives remain available", () => {
  assert.equal(typeof mcpAuthRouter, "function");
  assert.equal(typeof authorizationHandler, "function");
  assert.equal(typeof tokenHandler, "function");
  assert.equal(typeof revocationHandler, "function");
  assert.equal(typeof requireBearerAuth, "function");
});

test("the SDK-facing client store is lookup-only and cannot enable SDK registration", async () => {
  const store = createLookupOnlyClientStore(async (clientId) => clientId === "known" ? { client_id: "known" } : undefined);
  assert.deepEqual(Object.keys(store), ["getClient"]);
  assert.equal(Object.hasOwn(store, "registerClient"), false);
  assert.deepEqual(await store.getClient("known"), { client_id: "known" });
  assert.equal(await store.getClient("missing"), undefined);
  assert.ok(Object.isFrozen(store));
});

test("lookup-only composition leaves the SDK registration endpoint unmounted", async () => {
  const provider = {
    clientsStore: createLookupOnlyClientStore(() => undefined),
    async authorize() {},
    async challengeForAuthorizationCode() { return "challenge"; },
    async exchangeAuthorizationCode() { return { access_token: "unused", token_type: "bearer" }; },
    async exchangeRefreshToken() { return { access_token: "unused", token_type: "bearer" }; },
    async verifyAccessToken() { return { token: "unused", clientId: "unused", scopes: [] }; },
    async revokeToken() {}
  };
  const app = express();
  app.use(mcpAuthRouter({ provider, issuerUrl: new URL("https://mcp.example.com") }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const status = await new Promise((resolve, reject) => {
      const request = http.request({
        host: "127.0.0.1",
        port: address.port,
        path: "/register",
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "2" }
      }, (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      });
      request.once("error", reject);
      request.end("{}");
    });
    assert.equal(status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("the SDK declaration continues to require root mounting and exposes provider/client-store contracts", () => {
  const routerUrl = import.meta.resolve("@modelcontextprotocol/sdk/server/auth/router.js");
  const authDir = path.dirname(fileURLToPath(routerUrl));
  const routerDeclaration = fs.readFileSync(path.join(authDir, "router.d.ts"), "utf8");
  const providerDeclaration = fs.readFileSync(path.join(authDir, "provider.d.ts"), "utf8");
  const clientsDeclaration = fs.readFileSync(path.join(authDir, "clients.d.ts"), "utf8");

  assert.match(routerDeclaration, /MUST be installed at the application root/);
  assert.match(routerDeclaration, /mcpAuthRouter/);
  assert.match(providerDeclaration, /interface OAuthServerProvider/);
  assert.match(providerDeclaration, /verifyAccessToken/);
  assert.match(clientsDeclaration, /interface OAuthRegisteredClientsStore/);
  assert.match(clientsDeclaration, /registerClient\?/);
});
