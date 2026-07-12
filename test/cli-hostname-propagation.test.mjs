import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadConfig } from "../dist/config.js";
import { launchEnvironment } from "../scripts/codexpro-entry.mjs";

const ENV_KEYS = [
  "CODEXPRO_HOME",
  "CODEXPRO_ROOT",
  "CODEXPRO_ALLOWED_ROOTS",
  "CODEXPRO_HOST",
  "CODEXPRO_PUBLIC_HOSTNAME",
  "CODEXPRO_HOSTNAME",
  "NGROK_DOMAIN",
  "CODEXPRO_BASH_MODE",
  "CODEXPRO_WRITE_MODE",
  "CODEXPRO_TUNNEL_MODE"
];

function restoreEnvironment(previous) {
  for (const key of ENV_KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

test("saved named-tunnel hostname is propagated into the HTTP Host allowlist", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-hostname-root-"));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-hostname-home-"));
  const publicHostname = "saved-hostname.example.test";
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  try {
    const realRoot = fsSync.realpathSync(root);
    const profileId = createHash("sha256").update(realRoot).digest("hex").slice(0, 24);
    const profileDir = path.join(home, "profiles");
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(path.join(profileDir, `${profileId}.json`), JSON.stringify({
      version: 1,
      root: realRoot,
      tunnel: "cloudflare-named",
      hostname: publicHostname,
      tunnelName: "hostname-regression"
    }), "utf8");

    const baseEnv = {
      ...process.env,
      CODEXPRO_HOME: home,
      CODEXPRO_ROOT: realRoot,
      CODEXPRO_ALLOWED_ROOTS: realRoot,
      CODEXPRO_HOST: "127.0.0.1",
      CODEXPRO_BASH_MODE: "off",
      CODEXPRO_WRITE_MODE: "off",
      CODEXPRO_TUNNEL_MODE: "1"
    };
    delete baseEnv.CODEXPRO_PUBLIC_HOSTNAME;
    delete baseEnv.CODEXPRO_HOSTNAME;
    delete baseEnv.NGROK_DOMAIN;

    const childEnv = launchEnvironment(["start", "--root", realRoot], baseEnv);
    assert.equal(childEnv.CODEXPRO_PUBLIC_HOSTNAME, publicHostname);

    for (const key of ENV_KEYS) {
      if (childEnv[key] === undefined) delete process.env[key];
      else process.env[key] = childEnv[key];
    }
    const config = loadConfig(["--root", realRoot, "--bash", "off", "--write", "off"]);
    assert.ok(config.allowedHosts.includes(publicHostname));
  } finally {
    restoreEnvironment(previous);
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  }
});
