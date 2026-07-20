#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomicFile } from "./atomic-file.mjs";
import { createOwnedTempRoot } from "./owned-temp-root.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(await fsp.readFile(path.join(scriptDir, "toolchains.json"), "utf8"));
const argv = process.argv.slice(2);
const action = argv[0] ?? "status";

function option(name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

function fail(message, detail, code = 1) {
  console.error(message);
  if (detail) console.error(detail);
  process.exit(code);
}

function stableRoot() {
  if (option("--root")) return path.resolve(option("--root"));
  if (process.platform !== "win32") fail("The pinned local toolchain manager currently supports native Windows only.");
  const localAppData = process.env.LOCALAPPDATA?.trim()
    ? process.env.LOCALAPPDATA
    : process.env.USERPROFILE
      ? path.win32.join(process.env.USERPROFILE, "AppData", "Local")
      : undefined;
  if (!localAppData) fail("LOCALAPPDATA or USERPROFILE is required to locate the stable toolchain root.");
  return path.join(localAppData, "CodexGPT", "toolchains");
}

function requestedMajors() {
  const value = String(option("--major", "all"));
  if (value === "all") return Object.keys(spec.toolchains);
  if (!spec.toolchains[value]) fail(`Unknown Node major ${value}; expected ${Object.keys(spec.toolchains).join(", ")}.`, undefined, 2);
  return [value];
}

function toolchainPaths(root, major) {
  const entry = spec.toolchains[major];
  const directoryName = entry.archive.replace(/\.zip$/i, "");
  const directory = path.join(root, directoryName);
  return {
    entry,
    directory,
    node: path.join(directory, "node.exe"),
    npmCli: path.join(directory, "node_modules", "npm", "bin", "npm-cli.js")
  };
}

function runVersion(nodePath) {
  const result = spawnSync(nodePath, ["--version"], { encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

async function hashFile(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${url}`);
  const file = fs.createWriteStream(destination, { flags: "wx" });
  await new Promise(async (resolve, reject) => {
    file.on("error", reject);
    try {
      for await (const chunk of response.body) {
        if (!file.write(chunk)) await new Promise((drain) => file.once("drain", drain));
      }
      file.end(resolve);
    } catch (error) {
      file.destroy();
      reject(error);
    }
  });
}

function expectedDigest(shasumsText, archive) {
  const line = shasumsText.split(/\r?\n/).find((candidate) => candidate.trim().endsWith(`  ${archive}`));
  if (!line) throw new Error(`Official SHASUMS256.txt does not contain ${archive}.`);
  const digest = line.trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{64}$/i.test(digest)) throw new Error(`Invalid official SHA-256 entry for ${archive}.`);
  return digest.toLowerCase();
}

function extractZip(archive, destination) {
  const quotePowerShellLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const script = `Expand-Archive -LiteralPath ${quotePowerShellLiteral(archive)} -DestinationPath ${quotePowerShellLiteral(destination)} -Force`;
  const command = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    script
  ];
  const result = spawnSync("powershell.exe", command, { encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`PowerShell Expand-Archive failed: ${result.stderr || result.stdout}`);
}

async function readManifest(root) {
  try {
    return JSON.parse(await fsp.readFile(path.join(root, "manifest.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, installations: {} };
    throw error;
  }
}

async function writeManifest(root, manifest) {
  await writeJsonAtomicFile(path.join(root, "manifest.json"), manifest);
}

async function installMajor(root, major) {
  const { entry, directory, node } = toolchainPaths(root, major);
  const existing = runVersion(node);
  if (existing === `v${entry.version}`) return { major, status: "present", version: existing, directory };
  if (await fsp.stat(directory).then(() => true, () => false)) {
    fail(`Refusing to overwrite mismatched toolchain directory ${directory}. Relocate it manually before retrying.`);
  }

  await fsp.mkdir(root, { recursive: true });
  const ownedTemp = await createOwnedTempRoot(`node-${major}`);
  const tempRoot = ownedTemp.path;
  const archivePath = path.join(tempRoot, entry.archive);
  const shasumsUrl = `${spec.distribution}/v${entry.version}/${entry.shasums}`;
  const archiveUrl = `${spec.distribution}/v${entry.version}/${entry.archive}`;
  try {
    const shasumsResponse = await fetch(shasumsUrl, { redirect: "follow" });
    if (!shasumsResponse.ok) throw new Error(`Download failed (${shasumsResponse.status}) for ${shasumsUrl}`);
    const shasumsText = await shasumsResponse.text();
    const officialSha256 = expectedDigest(shasumsText, entry.archive);
    await download(archiveUrl, archivePath);
    const archiveSha256 = await hashFile(archivePath);
    if (archiveSha256 !== officialSha256) {
      throw new Error(`SHA-256 mismatch for ${entry.archive}: expected ${officialSha256}, received ${archiveSha256}.`);
    }

    const extractRoot = path.join(tempRoot, "extract");
    await fsp.mkdir(extractRoot);
    extractZip(archivePath, extractRoot);
    const extracted = path.join(extractRoot, entry.archive.replace(/\.zip$/i, ""));
    const extractedVersion = runVersion(path.join(extracted, "node.exe"));
    if (extractedVersion !== `v${entry.version}`) throw new Error(`Extracted runtime reported ${extractedVersion ?? "no version"}.`);
    await fsp.rename(extracted, directory);

    const manifest = await readManifest(root);
    manifest.schemaVersion = 1;
    manifest.installations ??= {};
    manifest.installations[major] = {
      tool: "node",
      major: Number(major),
      version: entry.version,
      platform: entry.platform,
      source: "official-node-distribution",
      archive: entry.archive,
      archiveUrl,
      shasumsUrl,
      archiveSha256,
      installedPath: directory,
      nodeExecutable: node,
      verifiedAt: new Date().toISOString()
    };
    await writeManifest(root, manifest);
    return { major, status: "installed", version: extractedVersion, directory, archiveSha256 };
  } finally {
    await ownedTemp.cleanup();
  }
}

async function status(root) {
  const manifest = await readManifest(root);
  return {
    schemaVersion: 1,
    root,
    manifestPath: path.join(root, "manifest.json"),
    toolchains: Object.fromEntries(Object.keys(spec.toolchains).map((major) => {
      const paths = toolchainPaths(root, major);
      const reported = runVersion(paths.node);
      const record = manifest.installations?.[major] ?? null;
      return [major, {
        expectedVersion: `v${paths.entry.version}`,
        reportedVersion: reported ?? null,
        ready: reported === `v${paths.entry.version}` && record?.archiveSha256?.length === 64,
        directory: paths.directory,
        supplyChainRecord: record
      }];
    }))
  };
}

function execution(root, major, command) {
  const paths = toolchainPaths(root, major);
  if (runVersion(paths.node) !== `v${paths.entry.version}`) fail(`Node ${major} is not ready. Run toolchain:ensure first.`);
  const [program, ...programArgs] = command;
  if (!program) fail("Missing command after --.", undefined, 2);
  const env = {
    ...process.env,
    PATH: `${paths.directory}${path.delimiter}${process.env.PATH ?? ""}`,
    NODE: paths.node,
    npm_node_execpath: paths.node
  };
  if (program === "node") return { executable: paths.node, args: programArgs, env };
  if (program === "npm") {
    return {
      executable: paths.node,
      args: [paths.npmCli, ...programArgs],
      env: { ...env, npm_execpath: paths.npmCli }
    };
  }
  return { executable: program, args: programArgs, env };
}

async function runOne(root, major, command) {
  const selected = execution(root, major, command);
  const child = spawn(selected.executable, selected.args, {
    cwd: process.cwd(),
    env: selected.env ?? process.env,
    shell: false,
    windowsHide: true,
    stdio: "inherit"
  });
  return await new Promise((resolve) => {
    child.once("error", (error) => {
      console.error(error.stack ?? error.message);
      resolve(127);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
}

const root = stableRoot();
if (action === "status") {
  console.log(JSON.stringify(await status(root), null, 2));
} else if (action === "ensure") {
  const results = [];
  for (const major of requestedMajors()) results.push(await installMajor(root, major));
  console.log(JSON.stringify({ root, results }, null, 2));
} else if (action === "exec" || action === "matrix") {
  const separator = argv.indexOf("--");
  if (separator === -1 || separator === argv.length - 1) fail(`${action} requires -- <command> [args...].`, undefined, 2);
  const command = argv.slice(separator + 1);
  const majors = action === "matrix" ? requestedMajors() : [String(option("--major"))];
  if (majors.some((major) => !spec.toolchains[major])) fail("exec requires --major 20 or --major 24.", undefined, 2);
  for (const major of majors) {
    console.log(`\n=== Node ${major} (${spec.toolchains[major].version}) ===`);
    const code = await runOne(root, major, command);
    if (code !== 0) process.exit(code);
  }
} else {
  fail("Usage: node scripts/toolchain-manager.mjs <status|ensure|exec|matrix> [--major 20|24|all] [--root <dir>] [-- <command> ...]", undefined, 2);
}
