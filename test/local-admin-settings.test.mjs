import assert from "node:assert/strict";
import test from "node:test";

import { profileWithToolMode } from "../dist/http/localAdminSettings.js";

test("next-launch tool mode preserves OAuth deployment selectors", () => {
  const profile = {
    profilePath: "D:\\CodexGPT\\profiles\\target.json",
    authMode: "oauth",
    tunnel: "cloudflare-named",
    hostname: "mcp.example.com",
    tunnelName: "codexgpt-test",
    tunnelOwner: "codexgpt",
    port: "17877",
    localAdminPort: "17878",
    oauthIssuer: "https://mcp.example.com",
    oauthResource: "https://mcp.example.com/mcp",
    oauthCredentialProvider: "windows-dpapi-current-user",
    oauthStateRef: "state_0123456789abcdef0123456789abcdef",
    toolMode: "standard"
  };
  const updated = profileWithToolMode(profile, "full");
  assert.equal(updated.profilePath, undefined);
  assert.equal(updated.toolMode, "full");
  for (const key of [
    "authMode", "tunnel", "hostname", "tunnelName", "tunnelOwner", "port", "localAdminPort",
    "oauthIssuer", "oauthResource", "oauthCredentialProvider", "oauthStateRef"
  ]) assert.equal(updated[key], profile[key], key);
});
