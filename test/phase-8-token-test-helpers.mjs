import { createHash } from "node:crypto";
import http from "node:http";
import { once } from "node:events";
import { createPublicOAuthApp } from "../dist/http/publicApp.js";
import { createFoundation } from "./phase-8-auth-test-helpers.mjs";

export const TEST_VERIFIER = "v".repeat(64);

export function testChallenge(verifier = TEST_VERIFIER) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export async function setupTokenRuntime(options = {}) {
  const foundation = createFoundation(options.foundationOptions);
  const initialized = await foundation.coordinator.initialize(foundation.configuration);
  const identity = foundation.auth.createOAuthDeploymentIdentity({
    issuer: initialized.state.issuer,
    resource: initialized.state.resource,
    hostname: initialized.state.hostname,
    profileId: initialized.state.profileId,
    bindingId: initialized.state.bindingId,
    incarnationId: initialized.state.incarnationId,
    recoveryEpoch: initialized.state.recoveryEpoch
  });
  const enabledScopes = options.enabledScopes ?? ["codexgpt:read"];
  const clients = new foundation.auth.OAuthClientStore({
    store: foundation.store,
    locks: foundation.locks,
    bindingId: initialized.state.bindingId,
    incarnationId: initialized.state.incarnationId,
    now: options.now
  });
  const authorizations = new foundation.auth.AuthorizationStore({
    identity,
    canonicalRoot: initialized.state.canonicalRoot,
    enabledScopes,
    clients,
    audit: options.authorizationAudit ?? { append(event) { foundation.events.push(structuredClone(event)); } },
    now: options.now
  });
  const grants = new foundation.auth.OAuthGrantStore({
    store: foundation.store,
    locks: foundation.locks,
    bindingId: initialized.state.bindingId,
    incarnationId: initialized.state.incarnationId,
    ownerRef: initialized.state.ownerRef,
    resource: initialized.state.resource,
    now: options.now
  });
  const tokens = await foundation.auth.OAuthTokenService.create({
    identity,
    ownerSubject: initialized.ownerSubject,
    ownerRef: initialized.state.ownerRef,
    state: initialized.state,
    store: foundation.store,
    keyManager: foundation.keyManager,
    grants,
    now: options.now
  });
  const provider = new foundation.auth.CodexOAuthProvider(identity, clients, authorizations, tokens);
  const mcp = options.mcpFactory
    ? await options.mcpFactory({ foundation, initialized, identity, enabledScopes, clients, authorizations, grants, tokens, provider })
    : options.mcp;
  let server;
  let port;
  if (options.app !== false) {
    const app = createPublicOAuthApp({
      identity,
      enabledScopes,
      publicJwks: [initialized.state.activePublicJwk],
      allowedOrigins: options.allowedOrigins,
      now: options.now,
      oauthRuntime: { clients, authorizations, tokens, mcp }
    });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    port = server.address().port;
  }
  return {
    foundation,
    initialized,
    identity,
    enabledScopes,
    clients,
    authorizations,
    grants,
    tokens,
    provider,
    mcp,
    port,
    async close() {
      if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await mcp?.close?.();
      tokens.dispose();
      foundation.cleanup();
    }
  };
}

export async function registerApprovedClient(runtime, overrides = {}) {
  const client = await runtime.clients.register({
    redirectUri: overrides.redirectUri ?? "https://chatgpt.com/connector/oauth/callback_12345678",
    clientName: overrides.clientName ?? "ChatGPT",
    clientUri: null,
    logoUri: null,
    tosUri: null,
    policyUri: null,
    contacts: [],
    softwareId: null,
    softwareVersion: null,
    requestedScopes: runtime.enabledScopes
  });
  await runtime.clients.markApproved(client.client_id);
  return client;
}

export async function issueAuthorizationCode(runtime, client, overrides = {}) {
  const verifier = overrides.verifier ?? TEST_VERIFIER;
  const created = await runtime.authorizations.create({
    clientId: client.client_id,
    redirectUri: client.redirect_uris[0],
    state: overrides.state ?? "state_12345678",
    resource: runtime.identity.resource,
    scopes: overrides.scopes ?? runtime.enabledScopes,
    codeChallenge: testChallenge(verifier)
  });
  await runtime.authorizations.approve(created.pendingId);
  const continued = await runtime.authorizations.continue(created.pendingId, created.browserBinding);
  const code = new URL(continued.location).searchParams.get("code");
  if (!code) throw new Error("Authorization code was not created.");
  return { code, verifier, redirectUri: client.redirect_uris[0] };
}

export function request(runtime, path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ?? "";
    const req = http.request({
      host: "127.0.0.1",
      port: runtime.port,
      path,
      method: options.method ?? "GET",
      headers: {
        Host: "mcp.example.com",
        ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
        ...(options.headers ?? {})
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

export function form(values) {
  return new URLSearchParams(values).toString();
}
