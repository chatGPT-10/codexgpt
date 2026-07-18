import { spawnSync } from "node:child_process";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { CodexProError, PathGuard } from "./guard.js";
import { redactSensitiveText } from "./redact.js";
import type { GitDiffDataV4, GitLogDataV4, GitStatusDataV4 } from "./git/readService.js";

function runGit(workspace: Workspace, args: string[], maxOutputBytes: number): string {
  const result = spawnSync("git", args, {
    cwd: workspace.root,
    encoding: "utf8",
    maxBuffer: maxOutputBytes,
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (result.error) {
    return `git unavailable or failed: ${result.error.message}`;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "";
    const stdout = result.stdout?.trim() || "";
    return stderr || stdout || `git exited with status ${result.status}`;
  }
  return redactSensitiveText(result.stdout.trim() || "(no output)");
}

function isGitFailure(output: string): boolean {
  const trimmed = output.trim().toLowerCase();
  return (
    trimmed.startsWith("fatal:") ||
    trimmed.startsWith("error:") ||
    trimmed.startsWith("git unavailable or failed:") ||
    trimmed.startsWith("git exited with status") ||
    trimmed.startsWith("usage: git ") ||
    trimmed.includes("not a git repository")
  );
}

function outputLines(output: string): string[] {
  return output.trim() === "(no output)" ? [] : output.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function gitStatus(config: CodexProConfig, workspace: Workspace, guard?: PathGuard, filePath?: string, staged = false): string {
  const args = staged
    ? ["-c", "core.quotepath=false", "diff", "--cached", "--name-status"]
    : ["-c", "core.quotepath=false", "status", "--short", "--branch"];
  if (filePath?.trim()) {
    if (!guard) return "path-scoped git status requires a path guard";
    const resolved = guard.resolve(workspace, filePath);
    args.push("--", resolved.relPath);
  }
  return runGit(workspace, args, config.maxOutputBytes);
}

export function gitDiff(config: CodexProConfig, guard: PathGuard, workspace: Workspace, filePath?: string, staged = false): string {
  const args = ["diff", "--no-color", "--no-ext-diff", "--no-textconv"];
  if (staged) args.push("--staged");
  if (filePath?.trim()) {
    const resolved = guard.resolve(workspace, filePath);
    args.push("--", resolved.relPath);
  }
  return runGit(workspace, args, config.maxOutputBytes);
}

export function gitDiffStatus(config: CodexProConfig, guard: PathGuard, workspace: Workspace, filePath?: string, staged = false): string {
  const args = ["diff", "--name-status"];
  if (staged) args.push("--staged");
  const untrackedArgs = ["ls-files", "--others", "--exclude-standard"];
  if (filePath?.trim()) {
    const resolved = guard.resolve(workspace, filePath);
    args.push("--", resolved.relPath);
    untrackedArgs.push("--", resolved.relPath);
  }
  const diffStatus = runGit(workspace, args, config.maxOutputBytes);
  if (staged || isGitFailure(diffStatus)) return diffStatus;
  const untracked = runGit(workspace, untrackedArgs, config.maxOutputBytes);
  if (isGitFailure(untracked)) return diffStatus;
  const lines = [...outputLines(diffStatus), ...outputLines(untracked).map((line) => `?? ${line}`)];
  return lines.length ? lines.join("\n") : "(no output)";
}

export function gitLog(config: CodexProConfig, workspace: Workspace, maxCount = 8): string {
  const count = Math.max(1, Math.min(Math.floor(maxCount), 30));
  return runGit(workspace, ["log", `--max-count=${count}`, "--oneline", "--decorate"], config.maxOutputBytes);
}

function shortStatusCode(value: string): string {
  switch (value) {
    case "unmodified": return " ";
    case "added": return "A";
    case "modified": return "M";
    case "deleted": return "D";
    case "renamed": return "R";
    case "copied": return "C";
    case "type_changed": return "T";
    case "unmerged": return "U";
    default: return "?";
  }
}

export function projectGitStatusV4ToLegacy(
  data: GitStatusDataV4,
  options: { staged?: boolean; includeBranch?: boolean; currentBranchName?: string | null } = {}
): string {
  const lines: string[] = [];
  if (options.includeBranch !== false) {
    if (data.head.kind === "detached") lines.push(`## HEAD (detached at ${data.head.oid.slice(0, 12)})`);
    else if (data.head.kind === "unborn") lines.push(`## No commits yet on ${options.currentBranchName ?? "[branch omitted]"}`);
    else lines.push(`## ${options.currentBranchName ?? "[branch omitted]"}`);
  }
  for (const entry of data.entries) {
    if (options.staged && entry.index === "unmodified") continue;
    if (!options.staged && entry.index === "unmodified" && entry.worktree === "unmodified") continue;
    if (!options.staged && entry.worktree === "untracked") {
      lines.push(`?? ${entry.path}`);
      continue;
    }
    const renderedPath = entry.old_path ? `${entry.old_path} -> ${entry.path}` : entry.path;
    const index = shortStatusCode(entry.index);
    const worktree = options.staged ? " " : shortStatusCode(entry.worktree);
    lines.push(`${index}${worktree} ${renderedPath}`);
  }
  return lines.length > 0 ? lines.join("\n") : "(no output)";
}

export function projectGitDiffStatusV4ToLegacy(data: GitDiffDataV4): string {
  const code = (change: GitDiffDataV4["changes"][number]["change"]): string => {
    switch (change) {
      case "added": return "A";
      case "modified": return "M";
      case "deleted": return "D";
      case "renamed": return "R";
      case "copied": return "C";
      case "type_changed": return "T";
      case "unmerged": return "U";
    }
  };
  const lines = data.changes.map((entry) =>
    entry.old_path ? `${code(entry.change)}\t${entry.old_path}\t${entry.path}` : `${code(entry.change)}\t${entry.path}`
  );
  return lines.length > 0 ? lines.join("\n") : "(no output)";
}

export function projectGitDiffV4ToLegacy(data: GitDiffDataV4): string {
  return data.patch_included && data.patch.trim() ? data.patch : "(no output)";
}

export function projectGitLogV4ToLegacy(data: GitLogDataV4): string {
  const lines = data.commits.map((commit) => {
    const subject = commit.subject ?? "[subject omitted]";
    return `${commit.oid.slice(0, 12)} ${subject}`;
  });
  if (data.truncated) lines.push("...[history truncated]");
  return lines.length > 0 ? lines.join("\n") : "(no output)";
}

export function assertGitCleanEnoughForWrite(_workspace: Workspace): void {
  // Reserved for future policy hooks. The first version allows writes and returns diffs.
  return;
}
