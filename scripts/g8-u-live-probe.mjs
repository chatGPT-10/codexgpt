#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const entry = path.join(projectRoot, "scripts", "codexgpt-entry.mjs");
const root = "D:\\Dev\\codexpro";
const base = "https://codexpro-oauth.drliang.uk";
const resource = `${base}/mcp`;
const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";
const scopes = "codexgpt:read codexgpt:write codexgpt:execute";

function safeText(value) {
  return String(value)
    .replace(/("(?:access_token|refresh_token|code)"\s*:\s*")[^"]+("?)/gi, "$1<redacted>$2")
    .replace(/([?&](?:code|access_token|refresh_token)=)[^&\s]+/gi, "$1<redacted>")
    .slice(0, 2000);
}

async function expectStatus(stage, response, expected) {
  if (response.status === expected) return response;
  const body = await response.text().catch(() => "");
  throw new Error(`${stage}: HTTP ${response.status}: ${safeText(body)}`);
}

function form(values) {
  return new URLSearchParams(values).toString();
}

function rpcHeaders(accessToken, sessionId = "") {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(sessionId ? { "mcp-session-id": sessionId } : {})
  };
}

function parseRpc(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const data = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .find(Boolean);
  if (!data) throw new Error(`MCP response was not JSON or SSE: ${safeText(trimmed)}`);
  return JSON.parse(data);
}

function runOwnerCommand(args) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Owner command failed: ${safeText(result.stderr || result.stdout || result.error?.message)}`);
  }
  return String(result.stdout ?? "").trim();
}

let clientId = "";
let refreshToken = "";
let stage = "register";
try {
  const registration = await expectStatus(stage, await fetch(`${base}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      client_name: "ChatGPT G8-U live probe",
      scope: scopes
    })
  }), 201);
  const client = await registration.json();
  clientId = client.client_id;

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  const state = `g8u_${randomBytes(16).toString("hex")}`;
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    resource,
    scope: scopes,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  stage = "authorize";
  const authorize = await expectStatus(stage, await fetch(`${base}/authorize?${query}`, {
    redirect: "manual"
  }), 200);
  const cookie = authorize.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  const waiting = await authorize.text();
  const pendingId = waiting.match(/const id="([^"]+)"/)?.[1] ?? "";
  const correlationCode = waiting.match(/Correlation code: <strong>([^<]+)</)?.[1] ?? "";
  if (!cookie || !pendingId || !correlationCode) throw new Error("authorize: waiting page did not contain the bounded approval state");

  stage = "approve";
  runOwnerCommand(["auth", "approve", correlationCode, "--root", root]);

  stage = "continue";
  const continued = await expectStatus(stage, await fetch(`${base}/authorize/continue/${encodeURIComponent(pendingId)}`, {
    headers: { cookie },
    redirect: "manual"
  }), 302);
  const callback = new URL(continued.headers.get("location") ?? "");
  if (callback.searchParams.get("state") !== state) throw new Error("continue: state mismatch");
  if (callback.searchParams.get("iss") !== base) throw new Error("continue: issuer mismatch");
  const code = callback.searchParams.get("code") ?? "";
  if (!code) throw new Error("continue: authorization code missing");

  stage = "token";
  const tokenResponse = await expectStatus(stage, await fetch(`${base}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource
    })
  }), 200);
  const tokens = await tokenResponse.json();
  const accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") throw new Error("token: token response incomplete");

  stage = "initialize";
  const initializeResponse = await fetch(resource, {
    method: "POST",
    headers: rpcHeaders(accessToken),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "g8-u-live-probe", version: "1.0.0" }
      }
    })
  });
  const initializeText = await initializeResponse.text();
  if (initializeResponse.status !== 200) {
    throw new Error(`initialize: HTTP ${initializeResponse.status}: ${safeText(initializeText)}`);
  }
  const initialized = parseRpc(initializeText);
  if (initialized.error) throw new Error(`initialize: RPC error ${safeText(JSON.stringify(initialized.error))}`);
  const sessionId = initializeResponse.headers.get("mcp-session-id") ?? "";
  if (!sessionId) throw new Error("initialize: MCP session id missing");

  stage = "initialized-notification";
  const notificationResponse = await fetch(resource, {
    method: "POST",
    headers: rpcHeaders(accessToken, sessionId),
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
  });
  if (notificationResponse.status !== 202 && notificationResponse.status !== 200) {
    throw new Error(`initialized-notification: HTTP ${notificationResponse.status}: ${safeText(await notificationResponse.text())}`);
  }

  stage = "tools-list";
  const toolsResponse = await fetch(resource, {
    method: "POST",
    headers: rpcHeaders(accessToken, sessionId),
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  });
  const toolsText = await toolsResponse.text();
  if (toolsResponse.status !== 200) throw new Error(`tools-list: HTTP ${toolsResponse.status}: ${safeText(toolsText)}`);
  const tools = parseRpc(toolsText);
  if (tools.error) throw new Error(`tools-list: RPC error ${safeText(JSON.stringify(tools.error))}`);
  const count = Array.isArray(tools.result?.tools) ? tools.result.tools.length : -1;
  if (count < 1) throw new Error("tools-list: no tools returned");

  console.log(JSON.stringify({ result: "PASS", initializeProtocol: initialized.result?.protocolVersion, toolCount: count }));
} catch (error) {
  console.error(JSON.stringify({ result: "FAIL", stage, error: safeText(error instanceof Error ? error.message : error) }));
  process.exitCode = 1;
} finally {
  if (clientId && refreshToken) {
    await fetch(`${base}/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ client_id: clientId, token: refreshToken, token_type_hint: "refresh_token" })
    }).catch(() => undefined);
  }
  if (clientId) {
    try {
      runOwnerCommand(["auth", "client", "remove", clientId, "--root", root]);
    } catch (error) {
      console.error(JSON.stringify({ result: "CLEANUP_FAILED", error: safeText(error instanceof Error ? error.message : error) }));
      process.exitCode = 1;
    }
  }
}
