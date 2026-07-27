import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDedicatedTunnelConfig } from "../dist/auth/cloudflareConfig.js";
import { saveWorkspaceProfile } from "../dist/profileStore.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runDoctor(root, home) {
  return spawnSync(process.execPath, [path.join(projectRoot, "scripts", "oauth-admin.mjs"), "doctor", "--root", root], {
    cwd: projectRoot,
    env: { ...process.env, CODEXGPT_HOME: home, CODEXGPT_AUTH_MODE: "oauth" },
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000
  });
}

test("OAuth doctor rejects a runnable but unverified managed cloudflared", (t) => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-doctor-")));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-auth-doctor-home-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  const configPath = path.join(home, "oauth", "tunnels", "config.yml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const credentialsFile = path.join(home, "11111111-2222-4333-8444-555555555555.json");
  fs.writeFileSync(configPath, createDedicatedTunnelConfig({
    tunnelId: "11111111-2222-4333-8444-555555555555",
    credentialsFile,
    hostname: "mcp.example.com",
    publicPort: 17877
  }));
  const fakeBinary = path.join(home, "bin", "cloudflared.exe");
  fs.mkdirSync(path.dirname(fakeBinary), { recursive: true });
  fs.writeFileSync(fakeBinary, "not-cloudflared");

  process.env.CODEXGPT_HOME = home;
  try {
    saveWorkspaceProfile(root, {
      authMode: "oauth",
      tunnel: "cloudflare-named",
      hostname: "mcp.example.com",
      tunnelName: "codexgpt-test",
      tunnelOwner: "codexgpt",
      cloudflareConfig: configPath,
      port: "17877",
      localAdminPort: "17878",
      oauthIssuer: "https://mcp.example.com",
      oauthResource: "https://mcp.example.com/mcp",
      oauthCredentialProvider: "windows-dpapi-current-user",
      oauthStateRef: "state_0123456789abcdef0123456789abcdef"
    });
  } finally {
    delete process.env.CODEXGPT_HOME;
  }

  const result = runDoctor(root, home);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL Managed cloudflared/);
  assert.match(result.stdout, /OK\s+Tunnel ingress/);
  assert.match(result.stdout, /WARN OAuth runtime/);
  assert.equal(result.stdout.includes(credentialsFile), false);
});

test("top-level doctor delegates OAuth checks for OAuth profiles", () => {
  const source = fs.readFileSync(path.join(projectRoot, "scripts", "doctor.mjs"), "utf8");
  assert.match(source, /savedProfileUsesOAuth\(\)/);
  assert.match(source, /oauth-admin\.mjs/);
  assert.match(source, /oauthStatus === 0/);
});
