import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { LocalAdminSessionManager } from "../dist/auth/localAdminSession.js";
import { createLifecycleControlApp } from "../dist/http/lifecycleControlApp.js";

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

test("independent lifecycle control app requires authenticated session and CSRF before runtime start", async (t) => {
  const sessions = new LocalAdminSessionManager();
  let starts = 0;
  const workspaceSettings = {
    workspaceRoot: "D:\\Dev\\target",
    allowedRoots: ["D:\\Dev\\target"],
    permissionMode: "read_only",
    effectiveToolMode: "minimal",
    effectiveWriteMode: "off",
    effectiveBashMode: "off",
    executionProfile: "off"
  };
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  server.removeAllListeners("request");
  server.on("request", createLifecycleControlApp({
    sessions,
    origin,
    statusSource: {
      snapshot: async () => ({
        controlPlane: "independent_loopback",
        workspaceRoot: "D:\\Dev\\target",
        runtimeState: "external_runtime_observed",
        observedRuntime: { tunnel: "cloudflare-named", toolMode: "standard", writeMode: "workspace", authMode: "oauth" },
        lifecycleActions: "start_stop_restart_owned_only",
        ownedRuntimeState: "none"
      })
    },
    runtimeControl: {
      start: async () => {
        starts += 1;
        return { state: "owned_running", pid: 4242 };
      },
      stop: async () => ({ state: "exited", pid: 4242 }),
      restart: async () => ({ state: "owned_running", pid: 4343 })
    },
    workspaceSettings: {
      snapshot: () => workspaceSettings,
      previewRoot: (root) => ({ root, alreadyAllowed: false, confirmation: root }),
      addRoot: () => workspaceSettings,
      removeRoot: () => workspaceSettings,
      setPermissionMode: () => workspaceSettings
    }
  }));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const root = await request(port, "/");
  assert.equal(root.status, 200);
  assert.match(root.headers["content-security-policy"], /default-src 'none'/);
  assert.match(root.text, /INDEPENDENT LOOPBACK CONTROL PLANE/);
  assert.match(root.text, /Start Runtime/);
  assert.match(root.text, /Stop Runtime/);
  assert.match(root.text, /Restart Runtime/);
  assert.match(root.text, /Workspace access/);
  assert.match(root.text, /Run safe commands/);
  assert.equal((await request(port, "/api/status")).status, 401);
  assert.equal((await request(port, "/healthz", { host: "mcp.example.com" })).status, 403);

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

  const status = await request(port, "/api/status", { headers: { Cookie: cookie } });
  assert.equal(status.status, 200, status.text);
  assert.deepEqual(JSON.parse(status.text), {
    controlPlane: "independent_loopback",
    workspaceRoot: "D:\\Dev\\target",
    runtimeState: "external_runtime_observed",
    observedRuntime: { tunnel: "cloudflare-named", toolMode: "standard", writeMode: "workspace", authMode: "oauth" },
    lifecycleActions: "start_stop_restart_owned_only",
    ownedRuntimeState: "none",
    workspaceSettings
  });
  assert.equal((await request(port, "/api/runtime/start", {
    method: "POST",
    body: "{}",
    headers: { Origin: origin, Cookie: cookie }
  })).status, 403);
  assert.equal((await request(port, "/api/workspaces/preview", {
    method: "POST",
    body: JSON.stringify({ root: "D:\\Dev\\another" }),
    headers: { Origin: origin, Cookie: cookie }
  })).status, 403);
  const preview = await request(port, "/api/workspaces/preview", {
    method: "POST",
    body: JSON.stringify({ root: "D:\\Dev\\another" }),
    headers: { Origin: origin, Cookie: cookie, "x-codexgpt-csrf": JSON.parse(exchanged.text).csrfToken }
  });
  assert.equal(preview.status, 200, preview.text);
  assert.deepEqual(JSON.parse(preview.text), { root: "D:\\Dev\\another", alreadyAllowed: false, confirmation: "D:\\Dev\\another" });
  const started = await request(port, "/api/runtime/start", {
    method: "POST",
    body: "{}",
    headers: { Origin: origin, Cookie: cookie, "x-codexgpt-csrf": JSON.parse(exchanged.text).csrfToken }
  });
  assert.equal(started.status, 200, started.text);
  assert.deepEqual(JSON.parse(started.text), { state: "owned_running", pid: 4242 });
  assert.equal(starts, 1);
  const stopped = await request(port, "/api/runtime/stop", {
    method: "POST",
    body: "{}",
    headers: { Origin: origin, Cookie: cookie, "x-codexgpt-csrf": JSON.parse(exchanged.text).csrfToken }
  });
  assert.equal(stopped.status, 200, stopped.text);
  assert.deepEqual(JSON.parse(stopped.text), { state: "exited", pid: 4242 });
  const restarted = await request(port, "/api/runtime/restart", {
    method: "POST",
    body: "{}",
    headers: { Origin: origin, Cookie: cookie, "x-codexgpt-csrf": JSON.parse(exchanged.text).csrfToken }
  });
  assert.equal(restarted.status, 200, restarted.text);
  assert.deepEqual(JSON.parse(restarted.text), { state: "owned_running", pid: 4343 });
});
