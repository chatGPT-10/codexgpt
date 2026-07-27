import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../dist/config.js";
import { createCodexGPTServer } from "../dist/server.js";

const identity = Object.freeze({
  issuer: "https://mcp.example.com",
  resource: "https://mcp.example.com/mcp",
  hostname: "mcp.example.com",
  profileId: "0123456789abcdef01234567",
  bindingId: "binding_0123456789abcdef",
  incarnationId: "incarnation_0123456789abcdef",
  recoveryEpoch: "recovery_0123456789abcdef"
});

const policyIdentity = Object.freeze({
  schemaVersion: 2,
  kind: "oauth_subject",
  authenticationMode: "oauth2",
  credentialRef: "cred_abcdefghijklmnopqrstuvwx23",
  credentialRevision: "oauth_grant_revision_1",
  subject: "oauth-owner-subject",
  ownerId: "owner_0123456789abcdef0123456789abcdef",
  tokenId: "token_0123456789abcdef",
  clientRef: "clientref_0123456789abcdef",
  scopes: [
    "workspace:open",
    "filesystem:read",
    "filesystem:write",
    "git:read",
    "audit:read",
    "shell:verify",
    "shell:execute"
  ],
  assuranceLevel: "strong"
});

const policySessionContextSource = Object.freeze({
  transportKind: "streamable_http",
  transportSessionId: () => "session_0123456789abcdef",
  identity: policyIdentity,
  currentIdentity: () => policyIdentity
});

function oauthDependencies(enabledScopes) {
  return {
    policySessionContextSource,
    oauthToolSecurity: { identity, enabledScopes }
  };
}

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

function configFor(root, home) {
  return withEnv({
    CODEXGPT_HOME: home,
    CODEXGPT_AUTH_MODE: "legacy",
    CODEXGPT_FILE_TRANSACTIONS: "legacy",
    CODEXGPT_AUDIT_MODE: "off",
    CODEXGPT_POLICY_ENGINE: "legacy",
    CODEXGPT_TOOL_CONTRACT_VERSION: "1",
    CODEXGPT_TOOL_MODE: "full",
    CODEXGPT_SEMANTIC_MODE: "legacy",
    CODEXGPT_SEMANTIC_PROVIDER: undefined,
    CODEXGPT_CONNECTION_TEST: undefined
  }, () => ({
    ...loadConfig([
      "--root", root,
      "--allow-root", root,
      "--bash", "full",
      "--write", "workspace"
    ]),
    authMode: "oauth"
  }));
}

function schemes(tool) {
  return {
    top: tool.securitySchemes,
    compat: tool._meta?.securitySchemes
  };
}

test("OAuth tool security fails closed without a request-local policy identity source", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-oauth-tool-source-"));
  try {
    const config = configFor(base, path.join(base, "home"));
    assert.throws(() => createCodexGPTServer(config, {
      oauthToolSecurity: { identity, enabledScopes: ["codexgpt:read"] }
    }), /request-local policy identity source/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("OAuth mode advertises exact minimum scopes in both tool metadata locations without changing names or order", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-oauth-tool-metadata-"));
  try {
    const config = configFor(base, path.join(base, "home"));
    const legacy = createCodexGPTServer({ ...config, authMode: "legacy" });
    const oauth = createCodexGPTServer(config, oauthDependencies([
      "codexgpt:read",
      "codexgpt:write",
      "codexgpt:execute"
    ]));
    const legacyTools = legacy._registeredTools;
    const oauthTools = oauth._registeredTools;
    assert.deepEqual(Object.keys(oauthTools), Object.keys(legacyTools));

    assert.deepEqual(schemes(oauthTools.read), {
      top: [{ type: "oauth2", scopes: ["codexgpt:read"] }],
      compat: [{ type: "oauth2", scopes: ["codexgpt:read"] }]
    });
    assert.deepEqual(schemes(oauthTools.write), {
      top: [{ type: "oauth2", scopes: ["codexgpt:read", "codexgpt:write"] }],
      compat: [{ type: "oauth2", scopes: ["codexgpt:read", "codexgpt:write"] }]
    });
    assert.deepEqual(schemes(oauthTools.bash), {
      top: [{ type: "oauth2", scopes: ["codexgpt:read", "codexgpt:execute"] }],
      compat: [{ type: "oauth2", scopes: ["codexgpt:read", "codexgpt:execute"] }]
    });
    assert.deepEqual(schemes(oauthTools.codexgpt_self_test), {
      top: [{ type: "oauth2", scopes: ["codexgpt:read", "codexgpt:write", "codexgpt:execute"] }],
      compat: [{ type: "oauth2", scopes: ["codexgpt:read", "codexgpt:write", "codexgpt:execute"] }]
    });

    assert.deepEqual(schemes(legacyTools.read), {
      top: [{ type: "noauth" }],
      compat: [{ type: "noauth" }]
    });
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("changing enabled OAuth scopes does not change tool descriptors or require a tool rescan", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-oauth-tool-scope-change-"));
  try {
    const config = configFor(base, path.join(base, "home"));
    const readOnly = createCodexGPTServer(config, oauthDependencies(["codexgpt:read"]));
    const expanded = createCodexGPTServer(config, oauthDependencies([
      "codexgpt:read",
      "codexgpt:write",
      "codexgpt:execute"
    ]));
    assert.deepEqual(Object.keys(readOnly._registeredTools), Object.keys(expanded._registeredTools));
    for (const name of Object.keys(readOnly._registeredTools)) {
      assert.deepEqual(
        readOnly._registeredTools[name].securitySchemes,
        expanded._registeredTools[name].securitySchemes,
        name
      );
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
