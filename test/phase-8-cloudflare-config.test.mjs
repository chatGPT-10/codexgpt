import assert from "node:assert/strict";
import test from "node:test";

import {
  createDedicatedTunnelConfig,
  validateDedicatedTunnelConfig
} from "../dist/auth/cloudflareConfig.js";

test("dedicated OAuth ingress targets only the public loopback listener", () => {
  const text = createDedicatedTunnelConfig({
    tunnelId: "11111111-2222-4333-8444-555555555555",
    credentialsFile: "C:\\Users\\Noah\\.cloudflared\\11111111-2222-4333-8444-555555555555.json",
    hostname: "mcp.example.com",
    publicPort: 8787
  });

  assert.match(text, /tunnel: 11111111-2222-4333-8444-555555555555/);
  assert.match(text, /hostname: mcp\.example\.com/);
  assert.match(text, /service: http:\/\/127\.0\.0\.1:8787/);
  assert.match(text, /service: http_status:404/);

  const result = validateDedicatedTunnelConfig(text, {
    tunnelId: "11111111-2222-4333-8444-555555555555",
    hostname: "mcp.example.com",
    publicPort: 8787,
    localAdminPort: 8788
  });
  assert.equal(result.ok, true);
  assert.equal(result.digest.startsWith("sha256:"), true);
});

test("dedicated OAuth ingress rejects mismatched credentials and self-update drift", () => {
  const wrongCredential = `tunnel: 11111111-2222-4333-8444-555555555555\ncredentials-file: C:\\\\Users\\\\Noah\\\\.cloudflared\\\\aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.json\ningress:\n  - hostname: mcp.example.com\n    service: http://127.0.0.1:8787\n  - service: http_status:404\n`;
  assert.throws(() => validateDedicatedTunnelConfig(wrongCredential, {
    tunnelId: "11111111-2222-4333-8444-555555555555",
    hostname: "mcp.example.com",
    publicPort: 8787,
    localAdminPort: 8788
  }), /AUTH_TUNNEL_CREDENTIALS_INVALID/);

  const selfUpdate = `tunnel: 11111111-2222-4333-8444-555555555555\ncredentials-file: C:\\\\Users\\\\Noah\\\\.cloudflared\\\\11111111-2222-4333-8444-555555555555.json\nno-autoupdate: false\ningress:\n  - hostname: mcp.example.com\n    service: http://127.0.0.1:8787\n  - service: http_status:404\n`;
  assert.throws(() => validateDedicatedTunnelConfig(selfUpdate, {
    tunnelId: "11111111-2222-4333-8444-555555555555",
    hostname: "mcp.example.com",
    publicPort: 8787,
    localAdminPort: 8788
  }), /AUTH_TUNNEL_CONFIG_INVALID/);
});

test("dedicated OAuth ingress rejects shared routes and local-admin exposure", () => {
  const shared = `tunnel: 11111111-2222-4333-8444-555555555555\ncredentials-file: C:\\\\Users\\\\Noah\\\\.cloudflared\\\\11111111-2222-4333-8444-555555555555.json\ningress:\n  - hostname: other.example.com\n    service: http://127.0.0.1:9000\n  - hostname: mcp.example.com\n    service: http://127.0.0.1:8787\n  - service: http_status:404\n`;
  assert.throws(() => validateDedicatedTunnelConfig(shared, {
    tunnelId: "11111111-2222-4333-8444-555555555555",
    hostname: "mcp.example.com",
    publicPort: 8787,
    localAdminPort: 8788
  }), /AUTH_TUNNEL_SHARED_CONFIG/);

  const admin = `tunnel: 11111111-2222-4333-8444-555555555555\ncredentials-file: C:\\\\Users\\\\Noah\\\\.cloudflared\\\\11111111-2222-4333-8444-555555555555.json\ningress:\n  - hostname: mcp.example.com\n    service: http://127.0.0.1:8788\n  - service: http_status:404\n`;
  assert.throws(() => validateDedicatedTunnelConfig(admin, {
    tunnelId: "11111111-2222-4333-8444-555555555555",
    hostname: "mcp.example.com",
    publicPort: 8787,
    localAdminPort: 8788
  }), /AUTH_TUNNEL_ADMIN_EXPOSED|AUTH_TUNNEL_INGRESS_INVALID/);
});
