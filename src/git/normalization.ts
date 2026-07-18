import type { GitRepositoryIdentity } from "./repositoryIdentity.js";
import type { GitCommandExecutor } from "./execution.js";

const UNSAFE_ATTRIBUTES = new Set([
  "crlf",
  "eol",
  "filter",
  "ident",
  "text",
  "working-tree-encoding"
]);

export async function assertRawGitNormalizationV4(input: {
  executor: GitCommandExecutor;
  repository: GitRepositoryIdentity;
  paths: readonly string[];
}): Promise<void> {
  const config = await input.executor.run(input.repository, [
    "config",
    "--no-includes",
    "--get-regexp",
    "^(core\\.autocrlf|core\\.eol|core\\.attributesfile)$"
  ], { stdoutLimitBytes: 4096 });
  if (config.timedOut || config.stdoutTruncated || config.stderrTruncated) {
    throw new Error("GIT_SCAN_LIMIT");
  }
  if (config.status !== 0 && config.status !== 1) throw new Error("GIT_STATE_CHANGED");
  if (config.status === 0) {
    for (const setting of config.stdout.toString("utf8").trim().split(/\r?\n/u)) {
      const [key, value = ""] = setting.trim().split(/\s+/, 2);
      if (
        key === "core.attributesfile" ||
        (key === "core.autocrlf" && !/^(false|input)$/iu.test(value)) ||
        (key === "core.eol" && !/^(native|lf)$/iu.test(value))
      ) throw new Error("GIT_NORMALIZATION_REQUIRED");
    }
  }
  for (let offset = 0; offset < input.paths.length; offset += 64) {
    const paths = input.paths.slice(offset, offset + 64);
    if (paths.length === 0) continue;
    const attributes = await input.executor.run(input.repository, [
      "check-attr", "-z", "--all", "--", ...paths
    ], { stdoutLimitBytes: 256 * 1024 });
    if (
      attributes.status !== 0 ||
      attributes.timedOut ||
      attributes.stdoutTruncated ||
      attributes.stderrTruncated
    ) throw new Error("GIT_STATE_CHANGED");
    const fields = attributes.stdout.toString("utf8").split("\0");
    if (fields.at(-1) === "") fields.pop();
    if (fields.length % 3 !== 0) throw new Error("GIT_STATE_CHANGED");
    for (let index = 0; index < fields.length; index += 3) {
      const attribute = fields[index + 1].toLocaleLowerCase("en-US");
      const value = fields[index + 2].toLocaleLowerCase("en-US");
      if (
        UNSAFE_ATTRIBUTES.has(attribute) &&
        value !== "unspecified" &&
        !(attribute === "text" && value === "unset")
      ) throw new Error("GIT_NORMALIZATION_REQUIRED");
    }
  }
}
