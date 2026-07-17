export type WindowsBackendKindV1 = "argv" | "powershell" | "bash";
export type WindowsBackendSourceV1 =
  | "reviewed_explicit"
  | "powershell_core_verified_location"
  | "windows_builtin"
  | "git_bash_verified_location";

export interface WindowsExecutableBindingV1 {
  schemaVersion: 1;
  backendId: string;
  backendVersion: string;
  kind: WindowsBackendKindV1;
  source: WindowsBackendSourceV1;
  path: string;
  realPath: string;
  sha256: string;
  identity: string;
}

export interface ReviewedExplicitBackendV1 {
  path: string;
  sha256: string;
  kind: WindowsBackendKindV1;
  backendId: string;
  backendVersion?: string;
}

export type CommandSpecV1 =
  | { kind: "argv"; executable: string; args?: string[] }
  | { kind: "powershell"; script: string; edition?: "auto" | "core" | "windows" }
  | { kind: "bash"; script: string };

export interface CompiledWindowsHostCommandV1 {
  request: {
    operation: "run" | "run_powershell";
    input: Record<string, unknown>;
  };
  spawnArgv: readonly string[];
  authorization: {
    backendId: string;
    backendVersion: string;
    backendIdentity: string;
    effectiveEnvironment: Readonly<Record<string, string>>;
    cwd: string;
    deadlineMs: number;
  };
}

export interface WindowsHostManifestV1 {
  schemaVersion: 1;
  protocolName: "CXP4";
  protocolVersion: 1;
  headerLength: 64;
  nativeFactoryClass: string;
  productionPowerShell: string;
  productionCSharp: string;
  conPtyWorker: string;
  protocolAuthority: string;
  productionPowerShellSha256: string;
  productionCSharpSha256: string;
  conPtyWorkerSha256: string;
  protocolSha256: string;
  bootstrapSecretTransport: "private_parent_stdin";
  hostStdout: "protocol_only";
  hostStderr: "bounded_safe_codes";
}
