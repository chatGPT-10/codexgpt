import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  profilePathForRoot,
  readWorkspaceProfile,
  saveWorkspaceProfile
} = await tsImport("../src/profileStore.ts", import.meta.url);

const launcher = path.resolve("scripts", "codexgpt.mjs");

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "codexgpt-profile-schema-"));
  const home = path.join(base, "home");
  const root = fs.realpathSync.native(fs.mkdirSync(path.join(base, "workspace"), { recursive: true }));
  const environment = { CODEXGPT_HOME: home };
  return {
    base,
    home,
    root,
    environment,
    profilePath: profilePathForRoot(root, environment, root)
  };
}

function writeProfile(item, payload) {
  fs.mkdirSync(path.dirname(item.profilePath), { recursive: true });
  fs.writeFileSync(item.profilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function assertProfileError(action, expectedPath, expectedCode = "WORKSPACE_PROFILE_INVALID") {
  assert.throws(action, (error) => {
    assert.equal(error?.code, expectedCode);
    assert.equal(error?.jsonPath, expectedPath);
    assert.match(error?.message ?? "", /saved workspace profile/i);
    assert.match(error?.remediation ?? "", /settings delete|edit the saved profile/i);
    assert.doesNotMatch(error?.message ?? "", /synthetic-profile-secret/);
    return true;
  });
}

test("saved profiles accept reviewed v1/v2 documents and writes normalize to v2", () => {
  const item = fixture();
  try {
    writeProfile(item, {
      version: 1,
      root: item.root,
      updatedAt: new Date().toISOString(),
      tunnel: "none",
      port: "8787",
      mode: "agent",
      bash: "off",
      write: "off",
      widgetDomain: "https://widgets.example.com/"
    });
    assert.equal(readWorkspaceProfile(item.root, item.environment, item.root).version, 1);

    const previousHome = process.env.CODEXGPT_HOME;
    process.env.CODEXGPT_HOME = item.home;
    try {
      saveWorkspaceProfile(item.root, {
        tunnel: "none",
        port: "8787",
        mode: "agent",
        bash: "off",
        write: "off"
      });
    } finally {
      if (previousHome === undefined) delete process.env.CODEXGPT_HOME;
      else process.env.CODEXGPT_HOME = previousHome;
    }
    assert.equal(JSON.parse(fs.readFileSync(item.profilePath, "utf8")).version, 2);
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("saved profile reads reject malformed JSON, non-objects, root mismatch, and unknown fields", () => {
  const item = fixture();
  try {
    fs.mkdirSync(path.dirname(item.profilePath), { recursive: true });
    fs.writeFileSync(item.profilePath, "{ not-json\n", "utf8");
    assertProfileError(
      () => readWorkspaceProfile(item.root, item.environment, item.root),
      "$"
    );

    fs.writeFileSync(item.profilePath, "[]\n", "utf8");
    assertProfileError(
      () => readWorkspaceProfile(item.root, item.environment, item.root),
      "$"
    );

    writeProfile(item, { version: 2, root: `${item.root}-other` });
    assertProfileError(
      () => readWorkspaceProfile(item.root, item.environment, item.root),
      "$.root"
    );

    writeProfile(item, {
      version: 2,
      root: item.root,
      toolCard: "synthetic-profile-secret"
    });
    assert.throws(() => readWorkspaceProfile(item.root, item.environment, item.root), (error) => {
      assert.equal(error?.code, "WORKSPACE_PROFILE_INVALID");
      assert.equal(error?.jsonPath, "$.toolCard");
      assert.match(error?.message ?? "", /Did you mean \$\.toolCards\?/);
      assert.doesNotMatch(error?.message ?? "", /synthetic-profile-secret/);
      return true;
    });

    writeProfile(item, { version: 3, root: item.root });
    assertProfileError(
      () => readWorkspaceProfile(item.root, item.environment, item.root),
      "$.version"
    );

    writeProfile(item, { version: 2, root: item.root, updatedAt: "yesterday" });
    assertProfileError(
      () => readWorkspaceProfile(item.root, item.environment, item.root),
      "$.updatedAt"
    );
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("saved profile schema rejects invalid types, ranges, choices, paths, URLs, and identifiers", () => {
  const item = fixture();
  const previousHome = process.env.CODEXGPT_HOME;
  process.env.CODEXGPT_HOME = item.home;
  try {
    for (const [field, value] of [
      ["port", "70000"],
      ["toolCards", "yes"],
      ["mode", "operator"],
      ["cloudflareConfig", "relative.yml"],
      ["widgetDomain", "http://widgets.example.com"],
      ["permissionProfile", "../escape"]
    ]) {
      assertProfileError(
        () => saveWorkspaceProfile(item.root, {
          tunnel: "none",
          token: "synthetic-profile-secret",
          [field]: value
        }),
        `$.${field}`
      );
    }
    assert.equal(fs.existsSync(path.join(item.home, "profiles")), false, "invalid saves must not create profile state");
  } finally {
    if (previousHome === undefined) delete process.env.CODEXGPT_HOME;
    else process.env.CODEXGPT_HOME = previousHome;
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("saved profile schema rejects incomplete or contradictory combinations", () => {
  const item = fixture();
  const previousHome = process.env.CODEXGPT_HOME;
  process.env.CODEXGPT_HOME = item.home;
  try {
    assertProfileError(
      () => saveWorkspaceProfile(item.root, { requireBashSession: true }),
      "$.requireBashSession"
    );
    assertProfileError(
      () => saveWorkspaceProfile(item.root, {
        tunnel: "cloudflare-named",
        hostname: "mcp.example.com"
      }),
      "$.tunnelName"
    );
    assertProfileError(
      () => saveWorkspaceProfile(item.root, {
        authMode: "oauth",
        tunnel: "cloudflare-named",
        hostname: "mcp.example.com",
        tunnelName: "codexgpt-test",
        tunnelOwner: "codexgpt",
        port: "8787",
        localAdminPort: "8787",
        oauthIssuer: "https://mcp.example.com",
        oauthResource: "https://mcp.example.com/mcp",
        oauthCredentialProvider: "windows-dpapi-current-user",
        oauthStateRef: "state_0123456789abcdef"
      }),
      "$.localAdminPort",
      "OAUTH_DEPLOYMENT_INVALID"
    );
  } finally {
    if (previousHome === undefined) delete process.env.CODEXGPT_HOME;
    else process.env.CODEXGPT_HOME = previousHome;
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});

test("public CLI rejects an invalid saved profile before consuming it", () => {
  const item = fixture();
  try {
    const profileId = createHash("sha256").update(item.root).digest("hex").slice(0, 24);
    const profilePath = path.join(item.home, "profiles", `${profileId}.json`);
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(profilePath, `${JSON.stringify({
      version: 1,
      root: item.root,
      tunnel: "none",
      port: "8787",
      toolCard: "synthetic-profile-secret"
    })}\n`);

    const result = spawnSync(process.execPath, [
      launcher,
      "start",
      "--root", item.root,
      "--tunnel", "none",
      "--no-auth",
      "--bash", "off",
      "--write", "off",
      "--print-env-only"
    ], {
      cwd: path.resolve("."),
      env: { ...process.env, CODEXGPT_HOME: item.home, NO_COLOR: "1" },
      encoding: "utf8"
    });

    assert.equal(result.status, 1, result.stdout || result.stderr);
    assert.match(result.stderr, /WORKSPACE_PROFILE_INVALID|saved workspace profile/i);
    assert.match(result.stderr, /\$\.toolCard/);
    assert.match(result.stderr, /Did you mean \$\.toolCards\?/);
    assert.match(result.stderr, /settings delete|edit the saved profile/i);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /synthetic-profile-secret/);
  } finally {
    fs.rmSync(item.base, { recursive: true, force: true });
  }
});
