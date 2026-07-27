import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { LocalAdminSessionManager } from "../dist/auth/localAdminSession.js";
import { loadConfig } from "../dist/config.js";
import { createLocalAdminApp } from "../dist/http/localAdminApp.js";
import { OAuthReadOnlyMcpRuntime } from "../dist/http/oauthMcpRuntime.js";
import {
  form,
  issueAuthorizationCode,
  registerApprovedClient,
  request,
  setupTokenRuntime,
  TEST_VERIFIER,
  testChallenge
} from "./phase-8-token-test-helpers.mjs";

function withEnv(changes, action) {
  const previous = new Map();
  for (const [name, value] of Object.entries(changes)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return action();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function configFor(workspaceRoot, stateHome, capabilities = {}) {
  return withEnv({
    CODEXGPT_HOME: stateHome,
    CODEXGPT_AUTH_MODE: "legacy",
    CODEXGPT_FILE_TRANSACTIONS: "legacy",
    CODEXGPT_AUDIT_MODE: "off",
    CODEXGPT_POLICY_ENGINE: "legacy",
    CODEXGPT_TOOL_CONTRACT_VERSION: "1",
    CODEXGPT_TOOL_MODE: "standard",
    CODEXGPT_SEMANTIC_MODE: "legacy",
    CODEXGPT_SEMANTIC_PROVIDER: undefined,
    CODEXGPT_CONNECTION_TEST: undefined
  }, () => loadConfig([
    "--root", workspaceRoot,
    "--allow-root", workspaceRoot,
    "--bash", capabilities.bash ?? "off",
    "--write", capabilities.write ?? "off"
  ]));
}

async function exchange(runtime, client, scopes) {
  const grant = await issueAuthorizationCode(runtime, client, scopes ? { scopes } : {});
  const response = await request(runtime, "/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({
      grant_type: "authorization_code",
      client_id: client.client_id,
      code: grant.code,
      code_verifier: grant.verifier,
      redirect_uri: grant.redirectUri,
      resource: runtime.identity.resource
    })
  });
  assert.equal(response.status, 200, response.text);
  return JSON.parse(response.text);
}

async function freeLoopbackPort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function loopbackRequest(port, host, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ?? "";
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method: options.method ?? "GET",
      headers: {
        Host: host,
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

function localControlResponse(code, changed, extra = {}) {
  return {
    schemaVersion: 3,
    contractVersion: 3,
    ok: true,
    code,
    changed,
    ...extra
  };
}

function rpcBody(method, id, params = {}) {
  return JSON.stringify({
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id }),
    method,
    params
  });
}

function rpcHeaders(accessToken, sessionId) {
  return {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
    ...(sessionId ? { "mcp-session-id": sessionId } : {})
  };
}

function parseRpc(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const data = trimmed.split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (data.length === 0) throw new Error(`No JSON-RPC data in response: ${text}`);
  return JSON.parse(data.at(-1));
}

test("authenticated OAuth MCP performs initialize and one read-only tool call with durable session binding", async () => {
  const runtime = await setupTokenRuntime({
    mcpFactory({ foundation, identity, enabledScopes }) {
      const config = configFor(
        foundation.workspaceRoot,
        path.join(foundation.stateRoot, "mcp-runtime")
      );
      return new OAuthReadOnlyMcpRuntime({
        config,
        identity,
        enabledScopes,
        localApprovalRuntimeV3: Object.freeze({ ownerControlOnly: true })
      });
    }
  });
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await exchange(runtime, client);
    const initialize = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token),
      body: rpcBody("initialize", 1, {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "phase-8-test", version: "1.0.0" }
      })
    });
    assert.equal(initialize.status, 200, initialize.text);
    const sessionId = initialize.headers["mcp-session-id"];
    assert.match(sessionId, /^[0-9a-f-]{36}$/i);
    const initializeResult = parseRpc(initialize.text);
    assert.equal(initializeResult.id, 1);
    assert.equal(initializeResult.result.protocolVersion, "2025-06-18");

    const initialized = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("notifications/initialized", undefined)
    });
    assert.ok([200, 202].includes(initialized.status), initialized.text);

    const list = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/list", 2)
    });
    assert.equal(list.status, 200, list.text);
    const listed = parseRpc(list.text);
    const toolNames = new Set(listed.result.tools.map((tool) => tool.name));
    assert.equal(toolNames.has("server_config"), true);
    const serverConfigTool = listed.result.tools.find((tool) => tool.name === "server_config");
    assert.deepEqual(serverConfigTool.securitySchemes, [{ type: "oauth2", scopes: ["codexgpt:read"] }]);
    assert.deepEqual(serverConfigTool._meta.securitySchemes, [{ type: "oauth2", scopes: ["codexgpt:read"] }]);
    for (const capabilityTool of ["write", "edit", "apply_patch"]) {
      const descriptor = listed.result.tools.find((tool) => tool.name === capabilityTool);
      assert.ok(descriptor, capabilityTool);
      assert.deepEqual(descriptor.securitySchemes, [{
        type: "oauth2",
        scopes: ["codexgpt:read", "codexgpt:write"]
      }]);
    }
    for (const forbidden of [
      "bash",
      "git_stage",
      "git_commit",
      "git_restore",
      "git_stash",
      "move_paths",
      "undo_change_set"
    ]) {
      assert.equal(toolNames.has(forbidden), false, forbidden);
    }

    const called = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/call", 3, { name: "server_config", arguments: {} })
    });
    assert.equal(called.status, 200, called.text);
    const result = parseRpc(called.text);
    assert.equal(result.id, 3);
    assert.equal(result.result.isError ?? false, false);
    assert.equal(JSON.stringify(result).includes(issued.access_token), false);
    assert.equal(runtime.mcp.sessionCount(), 1);

    const revoked = await request(runtime, "/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        client_id: client.client_id,
        token: issued.refresh_token,
        token_type_hint: "refresh_token"
      })
    });
    assert.equal(revoked.status, 200, revoked.text);
    const afterRevoke = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/list", 4)
    });
    assert.equal(afterRevoke.status, 401, afterRevoke.text);
    assert.match(afterRevoke.headers["www-authenticate"], /error="invalid_token"/);
  } finally {
    await runtime.close();
  }
});

test("OAuth read-only deployment keeps write descriptors and returns a local-profile denial", async () => {
  const runtime = await setupTokenRuntime({
    enabledScopes: ["codexgpt:read"],
    mcpFactory({ foundation, identity, enabledScopes }) {
      return new OAuthReadOnlyMcpRuntime({
        config: {
          ...configFor(
            foundation.workspaceRoot,
            path.join(foundation.stateRoot, "mcp-runtime"),
            { write: "off" }
          ),
          authMode: "oauth"
        },
        identity,
        enabledScopes
      });
    }
  });
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await exchange(runtime, client, ["codexgpt:read"]);
    const initialize = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token),
      body: rpcBody("initialize", 1, {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "phase-8-disabled-capability-test", version: "1.0.0" }
      })
    });
    assert.equal(initialize.status, 200, initialize.text);
    const sessionId = initialize.headers["mcp-session-id"];
    await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("notifications/initialized", undefined)
    });

    const list = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/list", 2)
    })).text);
    assert.ok(list.result.tools.find((tool) => tool.name === "write"));

    const opened = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/call", 3, { name: "open_current_workspace", arguments: {} })
    })).text);
    const workspaceId = opened.result.structuredContent.data.workspace_id;
    const write = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/call", 4, {
        name: "write",
        arguments: { workspace_id: workspaceId, path: "scope-disabled.txt", content: "blocked\n" }
      })
    })).text);
    assert.equal(write.result.isError, true);
    assert.match(write.result.content[0].text, /local profile/i);
    assert.equal(write.result._meta, undefined);
    assert.equal(fs.existsSync(path.join(runtime.foundation.workspaceRoot, "scope-disabled.txt")), false);
  } finally {
    await runtime.close();
  }
});

test("per-tool scope failure returns a normal MCP challenge without changing tool discovery", async () => {
  const runtime = await setupTokenRuntime({
    enabledScopes: ["codexgpt:read", "codexgpt:write"],
    mcpFactory({ foundation, identity, enabledScopes }) {
      return new OAuthReadOnlyMcpRuntime({
        config: configFor(
          foundation.workspaceRoot,
          path.join(foundation.stateRoot, "mcp-runtime"),
          { write: "workspace" }
        ),
        identity,
        enabledScopes
      });
    }
  });
  try {
    const client = await registerApprovedClient(runtime);
    const issued = await exchange(runtime, client, ["codexgpt:read"]);
    const initialize = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token),
      body: rpcBody("initialize", 1, {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "phase-8-step-up-test", version: "1.0.0" }
      })
    });
    assert.equal(initialize.status, 200, initialize.text);
    const sessionId = initialize.headers["mcp-session-id"];
    await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("notifications/initialized", undefined)
    });

    const list = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/list", 2)
    })).text);
    const writeTool = list.result.tools.find((tool) => tool.name === "write");
    assert.ok(writeTool);
    assert.deepEqual(writeTool.securitySchemes, [{
      type: "oauth2",
      scopes: ["codexgpt:read", "codexgpt:write"]
    }]);

    const opened = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/call", 3, { name: "open_current_workspace", arguments: {} })
    })).text);
    const workspaceId = opened.result.structuredContent.data.workspace_id;
    const write = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/call", 4, {
        name: "write",
        arguments: { workspace_id: workspaceId, path: "scope-step-up.txt", content: "blocked\n" }
      })
    })).text);
    assert.equal(write.result.isError, true);
    assert.equal(write.result.content[0].text, "Reconnect to allow this capability.");
    const challenge = write.result._meta["mcp/www_authenticate"][0];
    assert.match(challenge, /error="insufficient_scope"/);
    assert.match(challenge, /scope="codexgpt:read codexgpt:write"/);
    assert.equal(challenge.includes(issued.access_token), false);
    assert.equal(fs.existsSync(path.join(runtime.foundation.workspaceRoot, "scope-step-up.txt")), false);
  } finally {
    await runtime.close();
  }
});

test("complete synthetic OAuth operator journey covers DCR, local approval, read/write/execute, revoke, and relink", async () => {
  const runtime = await setupTokenRuntime({
    enabledScopes: ["codexgpt:read", "codexgpt:write", "codexgpt:execute"],
    mcpFactory({ foundation, identity, enabledScopes }) {
      return new OAuthReadOnlyMcpRuntime({
        config: configFor(
          foundation.workspaceRoot,
          path.join(foundation.stateRoot, "mcp-runtime"),
          { write: "workspace", bash: "safe" }
        ),
        identity,
        enabledScopes
      });
    }
  });
  let localServer;
  try {
    const localPort = await freeLoopbackPort();
    assert.notEqual(localPort, runtime.port);
    const localOrigin = `http://127.0.0.1:${localPort}`;
    const localHost = `127.0.0.1:${localPort}`;
    const sessions = new LocalAdminSessionManager();
    const ownerAdminService = {
      kind: "local-control-cli",
      isAvailable: () => true,
      issueBootstrap: () => sessions.issueBootstrap({ origin: localOrigin }).url,
      listAuthorizations: async () => localControlResponse(
        "OAUTH_AUTHORIZATIONS_LISTED",
        false,
        { oauthAuthorizations: await runtime.authorizations.listSafe() }
      ),
      approveAuthorization: async (pendingId) => {
        const changed = await runtime.authorizations.approve(pendingId);
        return localControlResponse(changed ? "OAUTH_AUTHORIZATION_APPROVED" : "OAUTH_AUTHORIZATION_NOT_FOUND", changed);
      },
      denyAuthorization: async (pendingId) => {
        const changed = await runtime.authorizations.deny(pendingId);
        return localControlResponse(changed ? "OAUTH_AUTHORIZATION_DENIED" : "OAUTH_AUTHORIZATION_NOT_FOUND", changed);
      },
      listClients: async () => localControlResponse(
        "OAUTH_CLIENTS_LISTED",
        false,
        { oauthClients: runtime.clients.listSafe() }
      ),
      revokeClient: async () => localControlResponse("OAUTH_CLIENT_NOT_FOUND", false),
      listGrants: async () => localControlResponse(
        "OAUTH_GRANTS_LISTED",
        false,
        { oauthGrants: runtime.grants.listSafe() }
      ),
      revokeGrant: async () => localControlResponse("OAUTH_GRANT_NOT_FOUND", false),
      revokeOwnerGrants: async () => localControlResponse("OAUTH_OWNER_GRANTS_UNCHANGED", false)
    };
    const localApp = createLocalAdminApp({ ownerAdminService, sessions, origin: localOrigin });
    localServer = localApp.listen(localPort, "127.0.0.1");
    await once(localServer, "listening");
    const localHealth = await loopbackRequest(localPort, localHost, "/healthz");
    assert.equal(localHealth.status, 200, localHealth.text);
    assert.equal(JSON.parse(localHealth.text).ownerChannelAvailable, true);

    const resourceMetadata = await request(runtime, "/.well-known/oauth-protected-resource/mcp");
    assert.equal(resourceMetadata.status, 200, resourceMetadata.text);
    assert.equal(JSON.parse(resourceMetadata.text).resource, runtime.identity.resource);
    const authorizationMetadata = await request(runtime, "/.well-known/oauth-authorization-server");
    assert.equal(authorizationMetadata.status, 200, authorizationMetadata.text);
    assert.deepEqual(JSON.parse(authorizationMetadata.text).grant_types_supported, ["authorization_code", "refresh_token"]);
    const documentation = await request(runtime, "/");
    assert.equal(documentation.status, 200, documentation.text);
    assert.match(documentation.text, /authenticated MCP access/);

    const registeredResponse = await request(runtime, "/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: ["https://chatgpt.com/connector/oauth/callback_12345678"],
        client_name: "ChatGPT synthetic journey",
        scope: "codexgpt:read codexgpt:write codexgpt:execute",
        ignored_extension: { safe: true }
      })
    });
    assert.equal(registeredResponse.status, 201, registeredResponse.text);
    const client = JSON.parse(registeredResponse.text);
    assert.equal(client.client_secret, undefined);
    assert.equal(client.ignored_extension, undefined);

    const authorizeQuery = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      state: "state_complete_journey",
      resource: runtime.identity.resource,
      scope: runtime.enabledScopes.join(" "),
      code_challenge: testChallenge(TEST_VERIFIER),
      code_challenge_method: "S256"
    });
    const startedAuthorization = await request(runtime, `/authorize?${authorizeQuery}`);
    assert.equal(startedAuthorization.status, 200, startedAuthorization.text);
    const browserCookie = startedAuthorization.headers["set-cookie"]?.[0]?.split(";", 1)[0];
    assert.ok(browserCookie);
    const [pending] = await runtime.authorizations.listSafe();
    assert.ok(pending);

    const bootstrap = sessions.issueBootstrap({ origin: localOrigin });
    const bootstrapResponse = await loopbackRequest(localPort, localHost, "/session/bootstrap", {
      method: "POST",
      headers: {
        Origin: localOrigin,
        "content-type": "application/json"
      },
      body: JSON.stringify({ bootstrap: bootstrap.token })
    });
    assert.equal(bootstrapResponse.status, 200, bootstrapResponse.text);
    const adminCookie = bootstrapResponse.headers["set-cookie"]?.[0]?.split(";", 1)[0];
    assert.ok(adminCookie);
    const { csrfToken } = JSON.parse(bootstrapResponse.text);
    const localStatus = await loopbackRequest(localPort, localHost, "/api/status", {
      headers: { Cookie: adminCookie }
    });
    assert.equal(localStatus.status, 200, localStatus.text);
    assert.equal(JSON.parse(localStatus.text).authorizations[0].pendingId, pending.pendingId);
    const approved = await loopbackRequest(
      localPort,
      localHost,
      `/api/authorizations/${pending.pendingId}/approve`,
      {
        method: "POST",
        headers: {
          Cookie: adminCookie,
          Origin: localOrigin,
          "content-type": "application/json",
          "x-codexgpt-csrf": csrfToken
        },
        body: "{}"
      }
    );
    assert.equal(approved.status, 200, approved.text);
    assert.equal(JSON.parse(approved.text).changed, true);

    const continued = await request(runtime, `/authorize/continue/${pending.pendingId}`, {
      headers: { Cookie: browserCookie }
    });
    assert.equal(continued.status, 302, continued.text);
    const callback = new URL(continued.headers.location);
    assert.equal(callback.searchParams.get("state"), "state_complete_journey");
    assert.equal(callback.searchParams.get("iss"), runtime.identity.issuer);
    const code = callback.searchParams.get("code");
    assert.ok(code);
    const tokenResponse = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code,
        code_verifier: TEST_VERIFIER,
        redirect_uri: client.redirect_uris[0],
        resource: runtime.identity.resource
      })
    });
    assert.equal(tokenResponse.status, 200, tokenResponse.text);
    const issued = JSON.parse(tokenResponse.text);
    const initialize = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token),
      body: rpcBody("initialize", 1, {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "phase-8-complete-journey", version: "1.0.0" }
      })
    });
    assert.equal(initialize.status, 200, initialize.text);
    const sessionId = initialize.headers["mcp-session-id"];
    await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("notifications/initialized", undefined)
    });

    const listed = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/list", 2)
    })).text);
    for (const name of ["server_config", "open_current_workspace", "write", "bash"]) {
      assert.ok(listed.result.tools.some((tool) => tool.name === name), name);
    }

    const read = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/call", 3, { name: "server_config", arguments: {} })
    })).text);
    assert.equal(read.result.isError ?? false, false);

    const opened = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/call", 4, { name: "open_current_workspace", arguments: {} })
    })).text);
    const workspaceId = opened.result.structuredContent.data.workspace_id;
    const write = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/call", 5, {
        name: "write",
        arguments: {
          workspace_id: workspaceId,
          path: "phase-8-complete-journey.txt",
          content: "oauth journey\n"
        }
      })
    })).text);
    assert.equal(write.result.isError ?? false, false, JSON.stringify(write));
    assert.equal(fs.readFileSync(path.join(runtime.foundation.workspaceRoot, "phase-8-complete-journey.txt"), "utf8"), "oauth journey\n");

    const execute = parseRpc((await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/call", 6, {
        name: "bash",
        arguments: { workspace_id: workspaceId, command: "pwd" }
      })
    })).text);
    assert.equal(execute.result.isError ?? false, false, JSON.stringify(execute));
    assert.equal(JSON.stringify(execute).includes(issued.access_token), false);
    assert.equal(JSON.stringify(execute).includes(issued.refresh_token), false);

    const revoked = await request(runtime, "/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        client_id: client.client_id,
        token: issued.refresh_token,
        token_type_hint: "refresh_token"
      })
    });
    assert.equal(revoked.status, 200, revoked.text);
    const rejected = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token, sessionId),
      body: rpcBody("tools/list", 7)
    });
    assert.equal(rejected.status, 401, rejected.text);

    const relinked = await exchange(runtime, client, ["codexgpt:read"]);
    const relinkInitialize = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(relinked.access_token),
      body: rpcBody("initialize", 8, {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "phase-8-relinked", version: "1.0.0" }
      })
    });
    assert.equal(relinkInitialize.status, 200, relinkInitialize.text);
    assert.notEqual(relinked.refresh_token, issued.refresh_token);
  } finally {
    if (localServer) {
      await new Promise((resolve, reject) => localServer.close((error) => error ? reject(error) : resolve()));
    }
    await runtime.close();
  }
});

test("MCP sessions accept same-grant refresh tokens but reject cross-client and cross-grant reuse", async () => {
  const runtime = await setupTokenRuntime({
    mcpFactory({ foundation, identity, enabledScopes }) {
      return new OAuthReadOnlyMcpRuntime({
        config: configFor(foundation.workspaceRoot, path.join(foundation.stateRoot, "mcp-runtime")),
        identity,
        enabledScopes
      });
    }
  });
  try {
    const client = await registerApprovedClient(runtime);
    const other = await registerApprovedClient(runtime, {
      redirectUri: "https://chatgpt.com/connector/oauth/callback_87654321"
    });
    const issued = await exchange(runtime, client);
    const initialize = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(issued.access_token),
      body: rpcBody("initialize", 1, {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "phase-8-test", version: "1.0.0" }
      })
    });
    assert.equal(initialize.status, 200, initialize.text);
    const sessionId = initialize.headers["mcp-session-id"];
    const initialVerified = await runtime.tokens.verifyAccessToken(issued.access_token);
    const sessionRequest = { rawHeaders: ["Mcp-Session-Id", sessionId] };
    assert.equal(runtime.mcp.isEstablishedSession(sessionRequest, initialVerified.fingerprint), true);
    assert.equal(runtime.mcp.isEstablishedSession({
      rawHeaders: ["Mcp-Session-Id", sessionId, "Mcp-Session-Id", sessionId]
    }, initialVerified.fingerprint), false);

    const duplicateSession = await request(runtime, "/mcp", {
      method: "POST",
      headers: {
        ...rpcHeaders(issued.access_token),
        "mcp-session-id": [sessionId, sessionId]
      },
      body: rpcBody("tools/list", 2)
    });
    assert.equal(duplicateSession.status, 400, duplicateSession.text);
    assert.equal(parseRpc(duplicateSession.text).error.message, "Bad Request: invalid MCP session id");

    const refreshedResponse = await request(runtime, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        grant_type: "refresh_token",
        client_id: client.client_id,
        refresh_token: issued.refresh_token,
        resource: runtime.identity.resource
      })
    });
    assert.equal(refreshedResponse.status, 200, refreshedResponse.text);
    const refreshed = JSON.parse(refreshedResponse.text);
    const refreshedVerified = await runtime.tokens.verifyAccessToken(refreshed.access_token);
    assert.equal(runtime.mcp.isEstablishedSession(sessionRequest, refreshedVerified.fingerprint), false);
    const sameGrant = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(refreshed.access_token, sessionId),
      body: rpcBody("tools/list", 3)
    });
    assert.equal(sameGrant.status, 200, sameGrant.text);
    assert.equal(runtime.mcp.isEstablishedSession(sessionRequest, refreshedVerified.fingerprint), true);

    const otherIssued = await exchange(runtime, other);
    const crossClient = await request(runtime, "/mcp", {
      method: "POST",
      headers: rpcHeaders(otherIssued.access_token, sessionId),
      body: rpcBody("tools/list", 4)
    });
    assert.equal(crossClient.status, 404, crossClient.text);
    assert.equal(parseRpc(crossClient.text).error.message, "Session not found");
  } finally {
    await runtime.close();
  }
});
