import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authConfigurationError } from "./errors.js";
import {
  MAX_CREDENTIAL_PAYLOAD_BYTES,
  OAUTH_CREDENTIAL_PROVIDER,
  assertCredentialPayload,
  assertCredentialPurpose,
  assertProtectedCredential,
  type CredentialPurpose,
  type CredentialStore
} from "./credentialStore.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDirectory, "..", "..");
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_FRAME_BYTES = 192 * 1024;

interface WindowsCredentialManifestV1 {
  schemaVersion: 1;
  protocolName: "CXDPAPI";
  protocolVersion: 1;
  provider: typeof OAUTH_CREDENTIAL_PROVIDER;
  scope: "CurrentUser";
  productionPowerShell: "scripts/windows-credential-host.ps1";
  productionCSharp: "scripts/windows-credential-host.cs";
  protocolAuthority: "scripts/windows-credential-host-protocol-v1.json";
  secretTransport: "stdin-stdout-pipes";
  hostStdout: "protocol-only";
  hostStderr: "empty";
  productionPowerShellSha256: string;
  productionCSharpSha256: string;
  protocolSha256: string;
}

export interface WindowsDpapiDependencies {
  platform?: NodeJS.Platform;
  scriptsRoot?: string;
  timeoutMs?: number;
  run?: (
    command: string,
    args: readonly string[],
    options: SpawnSyncOptionsWithStringEncoding
  ) => SpawnSyncReturns<string>;
}

function fail(message: string, code: "OAUTH_CREDENTIAL_PROVIDER_UNAVAILABLE" | "OAUTH_CREDENTIAL_PROVIDER_FAILURE" = "OAUTH_CREDENTIAL_PROVIDER_FAILURE"): never {
  throw authConfigurationError(code, message);
}

function sha256File(file: string): string {
  const stat = fs.statSync(file);
  if (!stat.isFile()) fail("Windows credential helper manifest references a non-file.");
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function parseManifest(value: unknown): WindowsCredentialManifestV1 {
  const manifest = value as Partial<WindowsCredentialManifestV1>;
  const digest = /^[a-f0-9]{64}$/;
  if (
    !manifest || typeof manifest !== "object" ||
    manifest.schemaVersion !== 1 || manifest.protocolName !== "CXDPAPI" || manifest.protocolVersion !== 1 ||
    manifest.provider !== OAUTH_CREDENTIAL_PROVIDER || manifest.scope !== "CurrentUser" ||
    manifest.productionPowerShell !== "scripts/windows-credential-host.ps1" ||
    manifest.productionCSharp !== "scripts/windows-credential-host.cs" ||
    manifest.protocolAuthority !== "scripts/windows-credential-host-protocol-v1.json" ||
    manifest.secretTransport !== "stdin-stdout-pipes" || manifest.hostStdout !== "protocol-only" ||
    manifest.hostStderr !== "empty" ||
    !digest.test(String(manifest.productionPowerShellSha256)) ||
    !digest.test(String(manifest.productionCSharpSha256)) ||
    !digest.test(String(manifest.protocolSha256))
  ) {
    fail("Windows credential helper manifest is invalid.");
  }
  return Object.freeze({ ...manifest }) as WindowsCredentialManifestV1;
}

export function loadAndVerifyWindowsCredentialManifest(scriptsRootInput = path.join(packageRoot, "scripts")): Readonly<{
  manifest: WindowsCredentialManifestV1;
  scriptsRoot: string;
  powerShellSource: string;
}> {
  const requested = path.resolve(scriptsRootInput);
  const scriptsRoot = fs.realpathSync.native(requested);
  if (scriptsRoot.toLocaleLowerCase("en-US") !== requested.toLocaleLowerCase("en-US")) {
    fail("Windows credential helper scripts root is not canonical.");
  }
  const manifestPath = path.join(scriptsRoot, "windows-credential-host-manifest.json");
  const manifest = parseManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
  const files = {
    powerShellSource: path.join(scriptsRoot, path.basename(manifest.productionPowerShell)),
    csharpSource: path.join(scriptsRoot, path.basename(manifest.productionCSharp)),
    protocolAuthority: path.join(scriptsRoot, path.basename(manifest.protocolAuthority))
  };
  for (const file of [manifestPath, files.powerShellSource, files.csharpSource, files.protocolAuthority]) {
    const real = fs.realpathSync.native(file);
    if (
      path.dirname(real).toLocaleLowerCase("en-US") !== scriptsRoot.toLocaleLowerCase("en-US") ||
      real.toLocaleLowerCase("en-US") !== file.toLocaleLowerCase("en-US")
    ) {
      fail("Windows credential helper path escaped its reviewed scripts root.");
    }
  }
  if (
    sha256File(files.powerShellSource) !== manifest.productionPowerShellSha256 ||
    sha256File(files.csharpSource) !== manifest.productionCSharpSha256 ||
    sha256File(files.protocolAuthority) !== manifest.protocolSha256
  ) {
    fail("Windows credential helper manifest is stale.");
  }
  return Object.freeze({ manifest, scriptsRoot, powerShellSource: files.powerShellSource });
}

function fixedWindowsEnvironment(): { powershell: string; env: NodeJS.ProcessEnv } {
  const drive = path.parse(process.execPath).root.replace(/[\\/]$/, "");
  const windows = path.join(`${drive}\\`, "Windows");
  return {
    powershell: path.join(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    env: {
      SystemDrive: drive,
      SystemRoot: windows,
      WINDIR: windows,
      ComSpec: path.join(windows, "System32", "cmd.exe"),
      PATH: `${path.join(windows, "System32")};${windows}`,
      PATHEXT: ".COM;.EXE;.BAT;.CMD"
    }
  };
}

function strictResponse(stdout: string): {
  ok: boolean;
  provider: typeof OAUTH_CREDENTIAL_PROVIDER;
  payloadBase64: string | null;
  code: string | null;
} {
  if (Buffer.byteLength(stdout, "utf8") > MAX_FRAME_BYTES) fail("Windows credential helper response exceeded its bound.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    fail("Windows credential helper returned malformed protocol output.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("Windows credential helper response is invalid.");
  const value = parsed as Record<string, unknown>;
  const keys = Object.keys(value).sort().join("\0");
  if (keys !== "code\0ok\0payloadBase64\0protocolName\0protocolVersion\0provider\0schemaVersion") {
    fail("Windows credential helper response contains unexpected fields.");
  }
  if (
    value.schemaVersion !== 1 || value.protocolName !== "CXDPAPI" || value.protocolVersion !== 1 ||
    value.provider !== OAUTH_CREDENTIAL_PROVIDER || typeof value.ok !== "boolean" ||
    (value.payloadBase64 !== null && typeof value.payloadBase64 !== "string") ||
    (value.code !== null && typeof value.code !== "string")
  ) {
    fail("Windows credential helper response violates the fixed protocol.");
  }
  return value as ReturnType<typeof strictResponse>;
}

export function createProductionCredentialStore(
  dependencies: WindowsDpapiDependencies = {}
): WindowsDpapiCredentialStore {
  return new WindowsDpapiCredentialStore(dependencies);
}

export class WindowsDpapiCredentialStore implements CredentialStore {
  readonly provider = OAUTH_CREDENTIAL_PROVIDER;
  readonly #verified: ReturnType<typeof loadAndVerifyWindowsCredentialManifest>;
  readonly #timeoutMs: number;
  readonly #run: NonNullable<WindowsDpapiDependencies["run"]>;

  constructor(dependencies: WindowsDpapiDependencies = {}) {
    if ((dependencies.platform ?? process.platform) !== "win32") {
      fail("Windows DPAPI CurrentUser credentials are unavailable on this platform.", "OAUTH_CREDENTIAL_PROVIDER_UNAVAILABLE");
    }
    this.#verified = loadAndVerifyWindowsCredentialManifest(dependencies.scriptsRoot);
    this.#timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 100 || this.#timeoutMs > 60_000) {
      fail("Windows credential helper timeout is invalid.");
    }
    this.#run = dependencies.run ?? ((command, args, options) => spawnSync(command, args, options));
  }

  async probe(): Promise<void> {
    this.#invoke("probe-v1", null, null);
  }

  async protect(plaintext: Uint8Array, purpose: CredentialPurpose): Promise<string> {
    assertCredentialPurpose(purpose);
    assertCredentialPayload(plaintext);
    const payload = Buffer.from(plaintext);
    try {
      const result = this.#invoke("protect-v1", purpose, payload.toString("base64"));
      assertProtectedCredential(result);
      return result;
    } finally {
      payload.fill(0);
    }
  }

  async unprotect(protectedValue: string, purpose: CredentialPurpose): Promise<Uint8Array> {
    assertCredentialPurpose(purpose);
    assertProtectedCredential(protectedValue);
    const result = this.#invoke("unprotect-v1", purpose, protectedValue);
    assertProtectedCredential(result);
    const decoded = Buffer.from(result, "base64");
    if (decoded.length < 1 || decoded.length > MAX_CREDENTIAL_PAYLOAD_BYTES) {
      decoded.fill(0);
      fail("Windows credential helper returned an invalid plaintext size.");
    }
    return decoded;
  }

  #invoke(operation: "protect-v1" | "unprotect-v1" | "probe-v1", purpose: CredentialPurpose | null, payloadBase64: string | null): string {
    const request = JSON.stringify({
      schemaVersion: 1,
      protocolName: "CXDPAPI",
      protocolVersion: 1,
      operation,
      provider: OAUTH_CREDENTIAL_PROVIDER,
      purpose,
      payloadBase64
    });
    if (Buffer.byteLength(request, "utf8") > MAX_FRAME_BYTES) fail("Windows credential helper request exceeded its bound.");
    const fixed = fixedWindowsEnvironment();
    const result = this.#run(
      fixed.powershell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this.#verified.powerShellSource],
      {
        cwd: packageRoot,
        env: fixed.env,
        encoding: "utf8",
        input: request,
        timeout: this.#timeoutMs,
        maxBuffer: MAX_FRAME_BYTES,
        windowsHide: true,
        shell: false
      }
    );
    if (result.error || result.signal || result.status !== 0) fail("Windows credential helper failed closed.");
    if (result.stderr !== "") fail("Windows credential helper wrote unexpected stderr output.");
    const response = strictResponse(result.stdout);
    if (!response.ok || response.code !== null) fail("Windows credential helper rejected the operation.");
    if (operation === "probe-v1") {
      if (response.payloadBase64 !== null) fail("Windows credential helper probe returned unexpected data.");
      return "";
    }
    if (typeof response.payloadBase64 !== "string") fail("Windows credential helper omitted its bounded result.");
    return response.payloadBase64;
  }
}
