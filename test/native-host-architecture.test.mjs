import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptsRoot = path.join(repositoryRoot, "scripts");
const inventoryPath = path.join(scriptsRoot, "windows-native-api-inventory-v1.json");

const CSHARP_APIS = new Set([
  "CloseHandle",
  "ClosePseudoConsole",
  "CloseServiceHandle",
  "ConnectNamedPipe",
  "ConvertSecurityDescriptorToStringSecurityDescriptorW",
  "ConvertStringSecurityDescriptorToSecurityDescriptorW",
  "CreateAppContainerProfile",
  "CreateConPtyPipe",
  "CreateConPtyProcessW",
  "CreateFileW",
  "CreateMailslotW",
  "CreateJobObjectW",
  "CreateNamedPipeW",
  "CreatePipe",
  "CreateProcessW",
  "CreatePseudoConsoleSafe",
  "DeleteAppContainerProfile",
  "DeleteProcThreadAttributeList",
  "DisconnectNamedPipe",
  "FlushFileBuffers",
  "GetCurrentProcess",
  "GetCurrentThread",
  "GetExitCodeProcess",
  "GetFileInformationByHandle",
  "GetKernelObjectSecurity",
  "GetModuleHandleW",
  "GetNamedPipeClientProcessId",
  "GetProcAddress",
  "GetSidSubAuthority",
  "GetSidSubAuthorityCount",
  "GetStdHandle",
  "GetTokenInformation",
  "ImpersonateNamedPipeClient",
  "InitializeProcThreadAttributeList",
  "IsProcessInJob",
  "LocalFree",
  "OpenFileMappingW",
  "OpenProcess",
  "OpenSCManagerW",
  "OpenThreadToken",
  "PeekNamedPipe",
  "QueryFullProcessImageNameW",
  "ReadFile",
  "ResizePseudoConsole",
  "ResumeThread",
  "RevertToSelf",
  "SetHandleInformation",
  "SetInformationJobObject",
  "SetKernelObjectSecurity",
  "SetStdHandle",
  "TerminateJobObject",
  "TerminateProcess",
  "UpdateProcThreadAttribute",
  "WaitForSingleObject",
  "WriteFile"
]);

const POWERSHELL_APIS = Object.freeze([
  Object.freeze({ api: "Add-Type", pattern: /\bAdd-Type\b/g }),
  Object.freeze({ api: "ConvertFrom-Json", pattern: /\bConvertFrom-Json\b/g }),
  Object.freeze({ api: "System.IO.File.Exists", pattern: /\[System\.IO\.File\]::Exists\s*\(/g }),
  Object.freeze({ api: "System.IO.File.ReadAllText", pattern: /\[System\.IO\.File\]::ReadAllText\s*\(/g }),
  Object.freeze({ api: "LocalControlSpike.Run", pattern: /\[CodexPro\.Phase4\.LocalControlSpike\]::Run\s*\(/g }),
  Object.freeze({ api: "ProcessHost.Run", pattern: /\[CodexPro\.Phase4\.ProcessHost\]::Run\s*\(/g }),
  Object.freeze({ api: "ProcessHost.RunConPtyPersistentWorker", pattern: /\[CodexPro\.Phase4\.ProcessHost\]::RunConPtyPersistentWorker\s*\(/g }),
  Object.freeze({ api: "ProcessHost.RunConPtyWorker", pattern: /\[CodexPro\.Phase4\.ProcessHost\]::RunConPtyWorker\s*\(/g }),
  Object.freeze({ api: "SandboxSpike.Cleanup", pattern: /\[CodexPro\.Phase4\.SandboxSpike\]::Cleanup\s*\(/g }),
  Object.freeze({ api: "SandboxSpike.Run", pattern: /\[CodexPro\.Phase4\.SandboxSpike\]::Run\s*\(/g })
]);

function canonicalRelativePath(file) {
  return path.relative(repositoryRoot, file).split(path.sep).join("/");
}

async function nativeSourceFiles() {
  const files = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && (entry.name.endsWith(".cs") || entry.name.endsWith(".ps1"))) files.push(target);
    }
  }
  await visit(scriptsRoot);
  return files.sort((left, right) => canonicalRelativePath(left).localeCompare(canonicalRelativePath(right)));
}

function lineNumber(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (source.charCodeAt(index) === 10) line += 1;
  return line;
}

function semanticDigest(language, kind, api, source) {
  return createHash("sha256")
    .update(`${language}\n${kind}\n${api}\n${source.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim()}`)
    .digest("hex")
    .slice(0, 16);
}

function maskCSharp(source) {
  const output = source.split("");
  let state = "code";
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (current === "/" && next === "/") {
        output[index] = output[index + 1] = " ";
        index += 1;
        state = "line-comment";
      } else if (current === "/" && next === "*") {
        output[index] = output[index + 1] = " ";
        index += 1;
        state = "block-comment";
      } else if (current === "@" && next === '"') {
        output[index] = output[index + 1] = " ";
        index += 1;
        state = "verbatim-string";
      } else if (current === '"') {
        output[index] = " ";
        state = "string";
      } else if (current === "'") {
        output[index] = " ";
        state = "char";
      }
    } else if (state === "line-comment") {
      if (current === "\n") state = "code";
      else output[index] = " ";
    } else if (state === "block-comment") {
      if (current === "*" && next === "/") {
        output[index] = output[index + 1] = " ";
        index += 1;
        state = "code";
      } else if (current !== "\n") output[index] = " ";
    } else if (state === "verbatim-string") {
      if (current === '"' && next === '"') {
        output[index] = output[index + 1] = " ";
        index += 1;
      } else if (current === '"') {
        output[index] = " ";
        state = "code";
      } else if (current !== "\n") output[index] = " ";
    } else {
      if (current === "\\") {
        output[index] = " ";
        if (index + 1 < source.length) output[++index] = " ";
      } else if ((state === "string" && current === '"') || (state === "char" && current === "'")) {
        output[index] = " ";
        state = "code";
      } else if (current !== "\n") output[index] = " ";
    }
  }
  return output.join("");
}

function balancedCallEnd(masked, openOffset) {
  let depth = 0;
  for (let index = openOffset; index < masked.length; index += 1) {
    if (masked[index] === "(") depth += 1;
    else if (masked[index] === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error(`Unbalanced native API expression at offset ${openOffset}`);
}

function csharpInventory(relativePath, source) {
  const masked = maskCSharp(source);
  const entries = [];
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  for (const match of masked.matchAll(pattern)) {
    const api = match[1];
    if (!CSHARP_APIS.has(api)) continue;
    const start = match.index;
    const openOffset = masked.indexOf("(", start + api.length);
    const end = balancedCallEnd(masked, openOffset);
    const delimiter = Math.max(masked.lastIndexOf(";", start), masked.lastIndexOf("{", start), masked.lastIndexOf("}", start));
    const prefix = masked.slice(delimiter + 1, start);
    const kind = /\bextern\b/.test(prefix) ? "declaration" : "call";
    const expression = source.slice(start, end);
    entries.push({
      path: relativePath,
      language: "csharp",
      kind,
      api,
      digest: semanticDigest("csharp", kind, api, expression),
      line: lineNumber(source, start)
    });
  }
  return entries;
}

function powershellInventory(relativePath, source) {
  const entries = [];
  for (const { api, pattern } of POWERSHELL_APIS) {
    for (const match of source.matchAll(pattern)) {
      const lineStart = source.lastIndexOf("\n", match.index) + 1;
      const lineEnd = source.indexOf("\n", match.index);
      const expression = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim();
      entries.push({
        path: relativePath,
        language: "powershell",
        kind: "loader-call",
        api,
        digest: semanticDigest("powershell", "loader-call", api, expression),
        line: lineNumber(source, match.index)
      });
    }
  }
  return entries;
}

async function actualInventory() {
  const files = await nativeSourceFiles();
  const entries = [];
  for (const file of files) {
    const relativePath = canonicalRelativePath(file);
    const source = (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
    entries.push(...(relativePath.endsWith(".cs") ? csharpInventory(relativePath, source) : powershellInventory(relativePath, source)));
  }
  entries.sort((left, right) =>
    left.path.localeCompare(right.path) || left.line - right.line || left.api.localeCompare(right.api) || left.kind.localeCompare(right.kind));
  return { files: files.map(canonicalRelativePath), entries };
}

function inventoryDigest(entries) {
  const canonical = entries.map(({ line, ...entry }) => entry);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function actualApiNames(entries) {
  return [...new Set(entries.map((entry) => `${entry.language}:${entry.api}`))].sort();
}

test("every shipped C#/PowerShell native-host operation has an exact semantic review identity", async () => {
  const actual = await actualInventory();
  const digest = inventoryDigest(actual.entries);
  const apiNames = actualApiNames(actual.entries);
  let reviewed;
  try {
    reviewed = JSON.parse(await fs.readFile(inventoryPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    assert.fail(`Missing scripts/windows-native-api-inventory-v1.json. Actual inventory authority:\n${JSON.stringify({
      schemaVersion: 1,
      reviewedFiles: actual.files,
      entryCount: actual.entries.length,
      inventoryDigest: digest,
      apiPurposes: Object.fromEntries(apiNames.map((api) => [api, "REVIEW_REQUIRED"]))
    }, null, 2)}`);
  }

  assert.equal(reviewed.schemaVersion, 1);
  assert.deepEqual(reviewed.reviewedFiles, actual.files, "Native source file scope drifted; no directory or pattern exemption is allowed");
  assert.equal(reviewed.entryCount, actual.entries.length, "Native operation count drifted");
  assert.equal(reviewed.inventoryDigest, digest, `Native semantic inventory drifted:\n${JSON.stringify(actual.entries, null, 2)}`);
  assert.deepEqual(Object.keys(reviewed.apiPurposes).sort(), apiNames, "Native API review scope drifted");
  for (const [api, purpose] of Object.entries(reviewed.apiPurposes)) {
    assert.equal(typeof purpose, "string", `${api} must have a purpose`);
    assert.ok(purpose.length > 0 && purpose !== "REVIEW_REQUIRED", `${api} must be reviewed`);
  }
});

test("production native host keeps fixed package-root bootstrap without adding an independent public binary", async () => {
  const nodeHost = await fs.readFile(path.join(repositoryRoot, "src", "process", "windowsHostClient.ts"), "utf8");
  const powerShellHost = await fs.readFile(path.join(scriptsRoot, "windows-process-host.ps1"), "utf8");
  const conPtyWorker = await fs.readFile(path.join(scriptsRoot, "windows-conpty-worker.ps1"), "utf8");
  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  assert.match(nodeHost, /-NoLogo[\s\S]*-NoProfile[\s\S]*-NonInteractive/);
  assert.match(nodeHost, /windows-process-host-manifest\.json/);
  assert.match(powerShellHost, /windows-process-host\.cs/);
  assert.match(powerShellHost, /windows-process-host-protocol-v1\.json/);
  assert.match(conPtyWorker, /windows-process-host\.cs/);
  assert.equal(Object.keys(packageJson.bin).some((name) => /process|shell|terminal|conpty/i.test(name)), false);
});
