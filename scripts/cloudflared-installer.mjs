import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CLOUDFLARED_RELEASE,
  cloudflaredAsset,
  cloudflaredReleaseUrl
} from "./cloudflared-release.mjs";

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

export function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function assertSha256(buffer, expected, label = "download") {
  const actual = sha256Buffer(buffer);
  if (actual !== expected.toLowerCase()) {
    throw new Error(`SHA-256 verification failed for ${label}. Expected ${expected}, received ${actual}.`);
  }
  return actual;
}

function codexProHome() {
  const configured = process.env.CODEXPRO_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), ".codexpro");
}

function binaryName() {
  return process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
}

function installPath() {
  return path.join(codexProHome(), "bin", binaryName());
}

function findFile(root, fileName) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) return fullPath;
    if (entry.isDirectory()) {
      const nested = findFile(fullPath, fileName);
      if (nested) return nested;
    }
  }
  return "";
}

function cloudflaredVersion(binaryPath) {
  const result = spawnSync(binaryPath, ["--version"], {
    encoding: "utf8",
    shell: false,
    timeout: 15000,
    windowsHide: true
  });
  if (result.error || result.status !== 0) return "";
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function verifiedInstalledVersion(binaryPath) {
  if (!fs.existsSync(binaryPath)) return "";
  const asset = cloudflaredAsset();
  if (!asset.archive) {
    const stat = fs.statSync(binaryPath);
    if (!stat.isFile() || stat.size > MAX_DOWNLOAD_BYTES) return "";
    const installedDigest = sha256Buffer(fs.readFileSync(binaryPath));
    if (installedDigest !== asset.sha256) return "";
  }
  const output = cloudflaredVersion(binaryPath);
  return output.includes(CLOUDFLARED_RELEASE.version) ? output : "";
}

async function downloadVerifiedAsset(asset, tempRoot) {
  const url = cloudflaredReleaseUrl(asset);
  console.error(`[codexpro] Downloading pinned cloudflared ${CLOUDFLARED_RELEASE.version}: ${asset.file}`);
  const response = await fetch(url, { headers: { "user-agent": "codexpro-verified-installer" } });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Refusing cloudflared download larger than ${MAX_DOWNLOAD_BYTES} bytes.`);
  }
  if (!response.body) throw new Error(`Cloudflared download returned no response body: ${url}`);
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of response.body) {
    const bufferChunk = Buffer.from(chunk);
    receivedBytes += bufferChunk.byteLength;
    if (receivedBytes > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Refusing cloudflared download larger than ${MAX_DOWNLOAD_BYTES} bytes.`);
    }
    chunks.push(bufferChunk);
  }
  const buffer = Buffer.concat(chunks, receivedBytes);
  const digest = assertSha256(buffer, asset.sha256, asset.file);
  const downloadedPath = path.join(tempRoot, asset.file);
  fs.writeFileSync(downloadedPath, buffer, { mode: 0o700 });
  console.error(`[codexpro] Verified SHA-256: ${digest}`);
  return downloadedPath;
}

function extractExecutable(asset, downloadedPath, tempRoot) {
  if (!asset.archive) return downloadedPath;
  const extractDir = path.join(tempRoot, "extract");
  fs.mkdirSync(extractDir, { recursive: true });
  const result = spawnSync("tar", ["-xzf", downloadedPath, "-C", extractDir], {
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Failed to extract ${asset.file}: ${result.stderr || result.stdout || result.error?.message || result.status}`);
  }
  const extracted = findFile(extractDir, "cloudflared");
  if (!extracted) throw new Error(`Could not find cloudflared inside ${asset.file}.`);
  return extracted;
}

function replaceInstalledBinary(sourcePath, destination) {
  const binDir = path.dirname(destination);
  fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });
  const staged = path.join(binDir, `.${process.pid}.new-${binaryName()}`);
  const backup = path.join(binDir, `.backup-${binaryName()}`);
  fs.rmSync(staged, { force: true });
  fs.copyFileSync(sourcePath, staged);
  if (process.platform !== "win32") fs.chmodSync(staged, 0o755);

  const versionOutput = cloudflaredVersion(staged);
  if (!versionOutput.includes(CLOUDFLARED_RELEASE.version)) {
    fs.rmSync(staged, { force: true });
    throw new Error(
      `Verified file did not report cloudflared ${CLOUDFLARED_RELEASE.version}. ` +
      `Reported: ${versionOutput || "no version output"}`
    );
  }

  fs.rmSync(backup, { force: true });
  const hadExisting = fs.existsSync(destination);
  try {
    if (hadExisting) fs.renameSync(destination, backup);
    fs.renameSync(staged, destination);
    fs.rmSync(backup, { force: true });
  } catch (error) {
    fs.rmSync(staged, { force: true });
    if (hadExisting && fs.existsSync(backup) && !fs.existsSync(destination)) {
      fs.renameSync(backup, destination);
    }
    throw error;
  }
  return versionOutput;
}

export async function installVerifiedCloudflared({ ensureOnly = false } = {}) {
  const destination = installPath();
  const installed = verifiedInstalledVersion(destination);
  if (installed && ensureOnly) {
    console.error(`[codexpro] Verified cloudflared already installed: ${installed}`);
    return destination;
  }

  const asset = cloudflaredAsset();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexpro-cloudflared-verified-"));
  try {
    const downloaded = await downloadVerifiedAsset(asset, tempRoot);
    const executable = extractExecutable(asset, downloaded, tempRoot);
    const versionOutput = replaceInstalledBinary(executable, destination);
    console.error(`[codexpro] Installed verified cloudflared: ${versionOutput}`);
    console.error(`[codexpro] Path: ${destination}`);
    return destination;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const command = process.argv[2] || "ensure";
  if (command === "status") {
    const destination = installPath();
    const installed = verifiedInstalledVersion(destination);
    if (!installed) {
      console.error(`[codexpro] Pinned cloudflared ${CLOUDFLARED_RELEASE.version} is not installed at ${destination}.`);
      process.exitCode = 1;
      return;
    }
    console.log(installed);
    return;
  }
  if (command === "ensure") {
    await installVerifiedCloudflared({ ensureOnly: true });
    return;
  }
  if (command === "install" || command === "upgrade") {
    await installVerifiedCloudflared({ ensureOnly: false });
    return;
  }
  throw new Error("Usage: node scripts/cloudflared-installer.mjs [ensure|install|upgrade|status]");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(`[codexpro] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
