import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { LocalAdminSessionManager } from "../dist/auth/localAdminSession.js";
import { createLocalAdminApp } from "../dist/http/localAdminApp.js";

function request(port, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? Buffer.from(options.body) : null;
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method: options.method ?? "GET",
      headers: {
        Host: options.host ?? `127.0.0.1:${port}`,
        ...(body ? { "content-type": "application/json", "content-length": String(body.length) } : {}),
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
    if (body) req.write(body);
    req.end();
  });
}

function response(overrides = {}) {
  return {
    schemaVersion: 3,
    contractVersion: 3,
    serverId: "a".repeat(32),
    ok: true,
    code: "CONTROL_OK",
    sequence: 0,
    approvals: [],
    processes: [],
    grantId: null,
    changed: false,
    ...overrides
  };
}

test("local admin UI requires fragment bootstrap, cookie, Origin, and CSRF", async (t) => {
  const sessions = new LocalAdminSessionManager();
  let approved = "";
  const service = {
    kind: "local-control-cli",
    isAvailable: () => true,
    issueBootstrap: () => "",
    listAuthorizations: async () => response({ oauthAuthorizations: [{
      pendingId: `pending_${"A".repeat(22)}`,
      correlationCode: "ABCD-EFGH",
      canonicalRoot: "D:\\Dev\\target",
      clientLabel: "ChatGPT",
      clientRef: `clientref_${"b".repeat(32)}`,
      redirectHost: "chatgpt.com",
      redirectPath: "/connector_platform_oauth_redirect",
      scopes: ["codexgpt:read"],
      scopesMatchCurrentConfiguration: true,
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }] }),
    approveAuthorization: async (id) => { approved = id; return response({ code: "OAUTH_AUTHORIZATION_APPROVED", changed: true }); },
    denyAuthorization: async () => response(),
    listClients: async () => response({ oauthClients: [] }),
    revokeClient: async () => response(),
    listGrants: async () => response({ oauthGrants: [] }),
    revokeGrant: async () => response(),
    revokeOwnerGrants: async () => response()
  };
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  server.removeAllListeners("request");
  server.on("request", createLocalAdminApp({ ownerAdminService: service, sessions, origin }));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const root = await request(port, "/");
  assert.equal(root.status, 200);
  assert.match(root.headers["content-security-policy"], /default-src 'none'/);
  assert.equal(root.text.includes("bootstrap="), false);

  const adminScript = await request(port, "/admin.js");
  assert.equal(adminScript.status, 200);
  assert.match(adminScript.headers["content-type"], /^(?:text|application)\/javascript\b/);
  assert.equal(adminScript.headers["x-content-type-options"], "nosniff");

  const unauthorized = await request(port, "/api/status");
  assert.equal(unauthorized.status, 401);

  const bootstrap = sessions.issueBootstrap({ origin });
  const exchanged = await request(port, "/session/bootstrap", {
    method: "POST",
    body: JSON.stringify({ bootstrap: bootstrap.token }),
    headers: { Origin: origin }
  });
  assert.equal(exchanged.status, 200, exchanged.text);
  const cookie = exchanged.headers["set-cookie"][0].split(";")[0];
  assert.match(exchanged.headers["set-cookie"][0], /HttpOnly/);
  assert.match(exchanged.headers["set-cookie"][0], /SameSite=Strict/);
  assert.equal(exchanged.headers["set-cookie"][0].includes("Secure"), false);
  const csrf = JSON.parse(exchanged.text).csrfToken;

  const status = await request(port, "/api/status", { headers: { Cookie: cookie } });
  assert.equal(status.status, 200, status.text);
  assert.equal(JSON.parse(status.text).authorizations[0].correlationCode, "ABCD-EFGH");

  const pendingId = `pending_${"A".repeat(22)}`;
  const noCsrf = await request(port, `/api/authorizations/${pendingId}/approve`, {
    method: "POST",
    body: "{}",
    headers: { Cookie: cookie, Origin: origin }
  });
  assert.equal(noCsrf.status, 403);

  const approve = await request(port, `/api/authorizations/${pendingId}/approve`, {
    method: "POST",
    body: "{}",
    headers: { Cookie: cookie, Origin: origin, "x-codexgpt-csrf": csrf }
  });
  assert.equal(approve.status, 200, approve.text);
  assert.equal(approved, pendingId);

  const wrongHost = await request(port, "/healthz", { host: "mcp.example.com" });
  assert.equal(wrongHost.status, 403);
});
