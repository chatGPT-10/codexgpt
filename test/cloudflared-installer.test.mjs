import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  CLOUDFLARED_RELEASE,
  cloudflaredAsset,
  cloudflaredReleaseUrl
} from "../scripts/cloudflared-release.mjs";
import { assertSha256, sha256Buffer } from "../scripts/cloudflared-installer.mjs";
import * as codexgptEntry from "../scripts/codexgpt-entry.mjs";

const { requiresVerifiedCloudflared } = codexgptEntry;

test("cloudflared release manifest is pinned and does not use a latest URL", () => {
  assert.equal(CLOUDFLARED_RELEASE.version, "2026.7.1");
  const asset = cloudflaredAsset("win32", "x64");
  const url = cloudflaredReleaseUrl(asset);

  assert.equal(asset.file, "cloudflared-windows-amd64.exe");
  assert.equal(asset.sha256, "ccb0756de288d3c2c076d19764ca53e0849a10f2dd9c23f8656ac42bdeb45001");
  assert.match(url, /releases\/download\/2026\.7\.1\/cloudflared-windows-amd64\.exe$/);
  assert.equal(url.includes("/latest/"), false);
});

test("all supported release assets contain strict SHA-256 digests", () => {
  for (const [key, asset] of Object.entries(CLOUDFLARED_RELEASE.assets)) {
    assert.match(asset.sha256, /^[0-9a-f]{64}$/, `${key} has an invalid digest`);
    assert.ok(asset.file.startsWith("cloudflared-"), `${key} has an unexpected filename`);
  }
});

test("asset selection rejects unsupported platform and architecture pairs", () => {
  assert.equal(cloudflaredAsset("linux", "x64").file, "cloudflared-linux-amd64");
  assert.equal(cloudflaredAsset("darwin", "arm64").archive, true);
  assert.throws(() => cloudflaredAsset("win32", "arm64"), /not supported/);
});

test("public CodexGPT entry routes Cloudflare starts through the verified installer", () => {
  assert.equal(requiresVerifiedCloudflared(["--no-profile"]), true);
  assert.equal(requiresVerifiedCloudflared(["start", "--no-profile"]), true);
  assert.equal(requiresVerifiedCloudflared(["stable"]), true);
  assert.equal(requiresVerifiedCloudflared(["start", "--tunnel", "cloudflare-named"]), true);
  assert.equal(requiresVerifiedCloudflared(["start", "--tunnel", "none"]), false);
  assert.equal(requiresVerifiedCloudflared(["connection-test", "--no-profile"]), true);
  assert.equal(requiresVerifiedCloudflared(["connection-test", "--tunnel", "none"]), false);
  assert.equal(requiresVerifiedCloudflared(["ngrok"]), false);
  assert.equal(requiresVerifiedCloudflared(["doctor"]), false);
  assert.equal(requiresVerifiedCloudflared(["start", "--no-install-cloudflared"]), false);
  assert.equal(requiresVerifiedCloudflared(["start", "--cloudflared", "C:/Tools/cloudflared.exe"]), false);
});

test("saved non-Cloudflare profiles skip the verified Cloudflared installer", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-entry-root-"));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-entry-home-"));

  try {
    const realRoot = fsSync.realpathSync(root);
    const profileId = createHash("sha256").update(realRoot).digest("hex").slice(0, 24);
    const profileDir = path.join(home, "profiles");
    const profilePath = path.join(profileDir, `${profileId}.json`);
    await fs.mkdir(profileDir, { recursive: true });

    assert.equal(
      requiresVerifiedCloudflared(["start", "--root", realRoot], { CODEXGPT_HOME: home }),
      true,
      "a start without a saved profile should default to Cloudflare"
    );

    await fs.writeFile(profilePath, JSON.stringify({
      version: 1,
      root: realRoot,
      tunnel: "cloudflare-named"
    }), "utf8");
    assert.equal(
      requiresVerifiedCloudflared(["connection-test", "--root", realRoot], { CODEXGPT_HOME: home }),
      true,
      "connection-test should use a saved Cloudflare tunnel"
    );

    for (const tunnel of ["none", "ngrok", "tailscale"]) {
      await fs.writeFile(profilePath, JSON.stringify({
        version: 1,
        root: realRoot,
        tunnel
      }), "utf8");

      assert.equal(
        requiresVerifiedCloudflared(["start", "--root", realRoot], { CODEXGPT_HOME: home }),
        false,
        `saved ${tunnel} profile should not require Cloudflared`
      );
      assert.equal(
        requiresVerifiedCloudflared(["connection-test", "--root", realRoot], { CODEXGPT_HOME: home }),
        false,
        `connection-test with saved ${tunnel} profile should not require Cloudflared`
      );
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("verified Cloudflared starts pass the exact pinned binary path to the legacy CLI", () => {
  assert.equal(typeof codexgptEntry.withVerifiedCloudflaredArgs, "function");
  const forwarded = codexgptEntry.withVerifiedCloudflaredArgs(
    ["start", "--tunnel", "cloudflare-named"],
    { CODEXGPT_HOME: "C:/Users/test/.codexgpt" },
    "win32"
  );

  assert.deepEqual(forwarded, [
    "start",
    "--tunnel",
    "cloudflare-named",
    "--cloudflared",
    "C:\\Users\\test\\.codexgpt\\bin\\cloudflared.exe",
    "--no-install-cloudflared"
  ]);
});

test("SHA-256 verification accepts exact content and rejects mismatches", () => {
  const buffer = Buffer.from("verified cloudflared fixture", "utf8");
  const digest = sha256Buffer(buffer);

  assert.equal(assertSha256(buffer, digest, "fixture"), digest);
  assert.throws(
    () => assertSha256(buffer, "0".repeat(64), "fixture"),
    /SHA-256 verification failed/
  );
});

test("public CLI entry executes through an npm-style symlink", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-cli-symlink-"));
  const shimPath = path.join(tempRoot, "codexgpt");
  const entryPath = path.resolve("scripts", "codexgpt-entry.mjs");
  const packageVersion = JSON.parse(await fs.readFile(path.resolve("package.json"), "utf8")).version;

  try {
    try {
      await fs.symlink(entryPath, shimPath, process.platform === "win32" ? "file" : undefined);
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
        t.skip(`symlinks unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    const entry = await import("../scripts/codexgpt-entry.mjs");
    assert.equal(entry.isMainInvocation(pathToFileURL(entryPath).href, shimPath), true);

    const result = spawnSync(process.execPath, [shimPath, "--version"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false
    });

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), packageVersion);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("managed cloudflared tunnel arguments disable self-update", async () => {
  const installer = await import("../scripts/cloudflared-installer.mjs");
  assert.equal(typeof installer.cloudflaredTunnelArgs, "function");
  assert.deepEqual(
    installer.cloudflaredTunnelArgs("--config", "/tmp/config.yml", "run", "codexgpt"),
    ["tunnel", "--no-autoupdate", "--config", "/tmp/config.yml", "run", "codexgpt"]
  );
});
