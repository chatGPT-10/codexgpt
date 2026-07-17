import path from "node:path";
import { processHostError } from "./windowsHostProtocol.js";
import type { CommandSpecV1, CompiledWindowsHostCommandV1, WindowsExecutableBindingV1 } from "./types.js";

const MAX_SCRIPT_BYTES = 32 * 1024;
const MAX_ARGUMENTS = 512;
const MAX_ARGUMENT_BYTES = 8 * 1024;
const MAX_ARGUMENT_TOTAL_BYTES = 64 * 1024;
const MAX_ENVIRONMENT_ENTRIES = 64;
const MAX_ENVIRONMENT_TOTAL_BYTES = 16 * 1024;

function validateEnvironment(input: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const entries = Object.entries(input);
  if (entries.length > MAX_ENVIRONMENT_ENTRIES) throw processHostError("COMMAND_ENVIRONMENT_TOO_LARGE");
  const seen = new Set<string>();
  let total = 0;
  const output: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!key || key.includes("=") || key.includes("\0") || value.includes("\0")) throw processHostError("COMMAND_ENVIRONMENT_INVALID");
    const canonical = key.toLocaleUpperCase("en-US");
    if (seen.has(canonical)) throw processHostError("COMMAND_ENVIRONMENT_DUPLICATE");
    seen.add(canonical);
    total += Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8");
    if (total > MAX_ENVIRONMENT_TOTAL_BYTES) throw processHostError("COMMAND_ENVIRONMENT_TOO_LARGE");
    output[key] = value;
  }
  return Object.freeze(output);
}

function validateArguments(args: readonly string[]): readonly string[] {
  if (args.length > MAX_ARGUMENTS) throw processHostError("COMMAND_ARGUMENTS_TOO_LARGE");
  let total = 0;
  for (const argument of args) {
    if (argument.includes("\0")) throw processHostError("COMMAND_ARGUMENT_INVALID");
    const bytes = Buffer.byteLength(argument, "utf8");
    if (bytes > MAX_ARGUMENT_BYTES) throw processHostError("COMMAND_ARGUMENT_TOO_LARGE");
    total += bytes;
  }
  if (total > MAX_ARGUMENT_TOTAL_BYTES) throw processHostError("COMMAND_ARGUMENTS_TOO_LARGE");
  return Object.freeze([...args]);
}

export function compileCommandForWindowsHost(input: {
  command: CommandSpecV1;
  backend: WindowsExecutableBindingV1;
  cwd: string;
  environment: Readonly<Record<string, string>>;
  deadlineMs: number;
}): CompiledWindowsHostCommandV1 {
  if (!Number.isSafeInteger(input.deadlineMs) || input.deadlineMs < 1 || input.deadlineMs > 600_000) throw processHostError("COMMAND_DEADLINE_INVALID");
  const cwd = path.resolve(input.cwd);
  const environment = validateEnvironment(input.environment);
  const authorization = Object.freeze({ backendId: input.backend.backendId, backendVersion: input.backend.backendVersion, backendIdentity: input.backend.identity, effectiveEnvironment: environment, cwd, deadlineMs: input.deadlineMs });
  if (input.command.kind === "argv") {
    if (input.backend.kind !== "argv") throw processHostError("BACKEND_STALE");
    const executable = path.resolve(input.command.executable);
    if (executable.toLocaleLowerCase("en-US") !== input.backend.realPath.toLocaleLowerCase("en-US")) throw processHostError("BACKEND_STALE");
    const args = validateArguments(input.command.args ?? []);
    return Object.freeze({ request: { operation: "run" as const, input: { executable, arguments: args, cwd, environment, stdinBase64: "", timeoutMs: input.deadlineMs, stdoutLimitBytes: 1_048_576, stderrLimitBytes: 1_048_576 } }, spawnArgv: Object.freeze([executable, ...args]), authorization });
  }
  if (input.command.kind === "powershell") {
    if (input.backend.kind !== "powershell") throw processHostError("BACKEND_STALE");
    if (Buffer.byteLength(input.command.script, "utf8") > MAX_SCRIPT_BYTES || input.command.script.includes("\0")) throw processHostError("COMMAND_SCRIPT_TOO_LARGE");
    const spawnArgv = Object.freeze([input.backend.realPath, "-NoLogo", "-NoProfile", "-NonInteractive"]);
    return Object.freeze({ request: { operation: "run_powershell" as const, input: { executable: input.backend.realPath, script: input.command.script, cwd, environment, timeoutMs: input.deadlineMs, stdoutLimitBytes: 1_048_576, stderrLimitBytes: 1_048_576 } }, spawnArgv, authorization });
  }
  throw processHostError("BACKEND_UNAVAILABLE", "Bash production compilation is unavailable until its exact backend path is bound by the native host.");
}
