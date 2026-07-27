import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const windowsOnly = process.platform === "win32" ? test : test.skip;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function request(port, requestPath, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      headers: { Host: host }
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
    req.end();
  });
}

async function waitFor(check, timeoutMs = 20_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      return await check();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError ?? new Error("Timed out");
}

async function stopTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000))
  ]);
  if (!exited && child.pid) {
    try {
      execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } catch {}
  }
}

function writeOAuthProfile(home, root, publicPort, localAdminPort) {
  const profileId = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const profileDirectory = path.join(home, "profiles");
  fs.mkdirSync(profileDirectory, { recursive: true });
  fs.writeFileSync(path.join(profileDirectory, `${profileId}.json`), `${JSON.stringify({
    version: 2,
    root,
    authMode: "oauth",
    tunnel: "cloudflare-named",
    hostname: "mcp.example.com",
    tunnelName: "codexgpt-a3-test",
    tunnelOwner: "codexgpt",
    port: String(publicPort),
    localAdminPort: String(localAdminPort),
    oauthIssuer: "https://mcp.example.com",
    oauthResource: "https://mcp.example.com/mcp",
    oauthCredentialProvider: "windows-dpapi-current-user",
    oauthStateRef: "state_A234567890abcdef",
    write: "off",
    bash: "off",
    toolMode: "minimal"
  }, null, 2)}\n`);
  return profileId;
}

function startSupportedEntry(home, root, publicPort) {
  const child = spawn(process.execPath, [
    path.resolve("scripts", "codexgpt-entry.mjs"),
    "start",
    "--root", root,
    "--tunnel", "none",
    "--port", String(publicPort),
    "--bash", "off",
    "--write", "off",
    "--tool-mode", "minimal"
  ], {
    cwd: root,
    env: {
      ...process.env,
      CODEXGPT_HOME: home,
      CODEXGPT_SEMANTIC_MODE: "legacy",
      CODEXGPT_POLICY_ENGINE: "legacy"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  return { child, output: () => output };
}

async function waitForListeners(publicPort, localAdminPort, output) {
  const publicHealth = await waitFor(async () => {
    const response = await request(publicPort, "/healthz", "mcp.example.com");
    assert.equal(response.status, 200, output());
    return response;
  });
  const localHealth = await waitFor(async () => {
    const response = await request(localAdminPort, "/healthz", `127.0.0.1:${localAdminPort}`);
    assert.equal(response.status, 200, output());
    return response;
  });
  return { publicHealth, localHealth };
}

windowsOnly("supported entry starts, persists, and stops physically separated OAuth listeners", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-a3-runtime-"));
  const root = fs.realpathSync.native(process.cwd());
  const publicPort = await freePort();
  let localAdminPort = await freePort();
  while (localAdminPort === publicPort) localAdminPort = await freePort();
  const profileId = writeOAuthProfile(home, root, publicPort, localAdminPort);
  const children = [];
  t.after(async () => {
    for (const entry of children) await stopTree(entry.child);
    fs.rmSync(home, { recursive: true, force: true });
  });

  const first = startSupportedEntry(home, root, publicPort);
  children.push(first);
  const firstListeners = await waitForListeners(publicPort, localAdminPort, first.output);
  assert.deepEqual(JSON.parse(firstListeners.publicHealth.text), {
    ok: true,
    name: "CodexGPT",
    authMode: "oauth",
    mcpAvailable: true
  });
  assert.deepEqual(JSON.parse(firstListeners.localHealth.text), {
    ok: true,
    name: "CodexGPT local admin",
    ownerChannel: "local-control-cli",
    ownerChannelAvailable: true
  });
  const firstJwks = await request(publicPort, "/jwks", "mcp.example.com");
  assert.equal(firstJwks.status, 200);
  assert.equal(JSON.parse(firstJwks.text).keys.length, 1);

  const runtimeDirectory = path.join(home, "runtime");
  const runtime = await waitFor(() => {
    const files = fs.existsSync(runtimeDirectory)
      ? fs.readdirSync(runtimeDirectory).filter((name) => name.endsWith(".json"))
      : [];
    if (files.length !== 1) throw new Error(`runtime files=${files.join(",")}\n${first.output()}`);
    assert.equal(files[0], `${profileId}.json`);
    return JSON.parse(fs.readFileSync(path.join(runtimeDirectory, files[0]), "utf8"));
  });
  assert.equal(runtime.localBase, `http://127.0.0.1:${publicPort}`);
  assert.equal(runtime.localStatusUrl, "", "OAuth local admin must be opened only through one-time local-control bootstrap");
  assert.equal(first.output().includes("codexgpt_token="), false);
  assert.equal(first.output().includes("Authorization: Bearer"), false);

  const publicAdmin = await request(publicPort, "/admin/profile", "mcp.example.com");
  assert.equal(publicAdmin.status, 404);
  const localAdminMutation = await request(localAdminPort, "/owner/approve", `127.0.0.1:${localAdminPort}`);
  assert.equal(localAdminMutation.status, 404);

  await stopTree(first.child);
  await waitFor(async () => {
    await assert.rejects(request(publicPort, "/healthz", "mcp.example.com"));
    await assert.rejects(request(localAdminPort, "/healthz", `127.0.0.1:${localAdminPort}`));
    return true;
  }, 5_000);

  const second = startSupportedEntry(home, root, publicPort);
  children.push(second);
  await waitForListeners(publicPort, localAdminPort, second.output);
  const secondJwks = await request(publicPort, "/jwks", "mcp.example.com");
  assert.equal(secondJwks.text, firstJwks.text, "restart must reuse the persisted signing-key revision");
  await stopTree(second.child);
});

windowsOnly("direct runtime closes the public listener when local-admin bind loses the race", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-a3-bind-race-"));
  const root = fs.realpathSync.native(process.cwd());
  const publicPort = await freePort();
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", resolve);
  });
  const localAdminPort = blocker.address().port;
  writeOAuthProfile(home, root, publicPort, localAdminPort);
  const child = spawn(process.execPath, [path.resolve("dist", "http.js")], {
    cwd: root,
    env: {
      ...process.env,
      CODEXGPT_HOME: home,
      CODEXGPT_ROOT: root,
      CODEXGPT_AUTH_MODE: "oauth",
      CODEXGPT_HOST: "127.0.0.1",
      CODEXGPT_PORT: String(publicPort),
      CODEXGPT_ALLOW_QUERY_TOKEN: "0",
      CODEXGPT_ALLOW_NO_HTTP_TOKEN: "0",
      CODEXGPT_SEMANTIC_MODE: "legacy",
      CODEXGPT_BASH_MODE: "off",
      CODEXGPT_WRITE_MODE: "off",
      CODEXGPT_TOOL_MODE: "minimal",
      CODEXGPT_POLICY_ENGINE: "legacy"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  t.after(async () => {
    await stopTree(child);
    await new Promise((resolve) => blocker.close(() => resolve()));
    fs.rmSync(home, { recursive: true, force: true });
  });

  const exit = await Promise.race([
    new Promise((resolve) => child.once("exit", (code) => resolve(code))),
    new Promise((_, reject) => setTimeout(() => reject(new Error(output)), 15_000))
  ]);
  assert.notEqual(exit, 0);
  assert.match(output, /EADDRINUSE|address already in use/i);
  await assert.rejects(request(publicPort, "/healthz", "mcp.example.com"));
});

windowsOnly("occupied local-admin port fails before the public listener is exposed", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-a3-port-conflict-"));
  const root = fs.realpathSync.native(process.cwd());
  const publicPort = await freePort();
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", resolve);
  });
  const localAdminPort = blocker.address().port;
  writeOAuthProfile(home, root, publicPort, localAdminPort);
  t.after(async () => {
    await new Promise((resolve) => blocker.close(() => resolve()));
    fs.rmSync(home, { recursive: true, force: true });
  });

  const run = startSupportedEntry(home, root, publicPort);
  t.after(async () => stopTree(run.child));
  const exit = await Promise.race([
    new Promise((resolve) => run.child.once("exit", (code) => resolve(code))),
    new Promise((_, reject) => setTimeout(() => reject(new Error(run.output())), 10_000))
  ]);
  assert.notEqual(exit, 0);
  assert.match(run.output(), new RegExp(`Local port ${localAdminPort} is already in use`));
  await assert.rejects(request(publicPort, "/healthz", "mcp.example.com"));
});
