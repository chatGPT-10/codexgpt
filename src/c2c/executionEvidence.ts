import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import { readGuidanceText, normalizeGuidancePathInput } from "../guidance/safeTextReader.js";
import { hasSecretValue } from "../redact.js";
import type { PlanReadConfig } from "./planSnapshot.js";
import { resolveGitExecutable, verifyGitExecutableBinding } from "../git/capabilities.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
// Local fingerprint scan ceiling, independent of connector text-response limits.
export const MAX_EVIDENCE_FILE_BYTES = 524_288;
const entrySchema = z.object({
  path: z.string().min(1).max(1024),
  status: z.string().length(2),
  sha256: hash.nullable(),
  indexSha256: hash,
  // Optional keeps already-persisted pre-publication sessions readable. New
  // captures bind per-path worktree mode/blob metadata as well as file bytes.
  worktreeDiffSha256: hash.optional()
}).strict();
export const gitBaselineSchema = z.object({
  head: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u).nullable(),
  statusSha256: hash, diffSha256: hash, preexistingDirty: z.boolean(), files: z.array(entrySchema).max(128)
}).strict();
export type GitBaseline = z.infer<typeof gitBaselineSchema>;
const safeText = (max: number) => z.string().min(1).max(max).refine(s => Buffer.byteLength(s) <= max && !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\p{Cf}\p{Cs}]/u.test(s) && !hasSecretValue(s));
export const checkSummarySchema = z.object({
  name: safeText(256), status: z.enum(["passed", "failed", "not_run", "blocked", "skipped"]), summary: safeText(2048)
}).strict();
export type CheckSummary = z.infer<typeof checkSummarySchema>;
export class C2CEvidenceError extends Error {
  constructor(public readonly code = "GIT_EVIDENCE_FAILED") { super("C2C Git evidence capture failed"); this.name = "C2CEvidenceError"; }
}
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
function reject(code?: string): never { throw new C2CEvidenceError(code); }
function decode(bytes: Buffer): string { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
function git(executable: string, root: string, args: string[], allowMissing = false): Buffer | null {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (["path", "systemroot", "windir", "comspec", "pathext", "temp", "tmp"].includes(key.toLowerCase())) env[key] = value;
  }
  // Git for Windows understands /dev/null; Node's device path \\.\nul is not a Git config path.
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", LC_ALL: "C" });
  const fixed = ["core.fsmonitor=false", "core.hooksPath=/dev/null", "core.untrackedCache=false", "core.askPass=", "credential.helper=", "diff.external=", "gc.auto=0", "maintenance.auto=false", "protocol.allow=never", "protocol.file.allow=never"];
  const result = spawnSync(executable, ["--no-pager", ...fixed.flatMap(v => ["-c", v]), "-C", root, ...args], {
    env, windowsHide: true, timeout: 10_000, maxBuffer: 262_144, encoding: "buffer"
  });
  if (allowMissing && result.status === 1 && !result.error) return null;
  if (result.error || result.status !== 0) return reject();
  return result.stdout;
}
const scope = ["--", ".", ":(exclude).ai-bridge", ":(exclude).ai-bridge/**"];
function metadata(executable: string, root: string) {
  const headBytes = git(executable, root, ["rev-parse", "--verify", "--quiet", "HEAD"], true);
  const head = headBytes ? decode(headBytes).trim() : null;
  const status = git(executable, root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames", ...scope])!;
  // This is a hash of raw diff metadata, never a stored patch or command output.
  const work = git(executable, root, ["diff", "--raw", "--no-abbrev", "--no-ext-diff", "--no-textconv", "--no-renames", ...scope])!;
  const index = git(executable, root, ["diff", "--cached", "--raw", "--no-abbrev", "--no-ext-diff", "--no-textconv", "--no-renames", ...scope])!;
  return { head, status, statusSha256: digest(status), diffSha256: digest(Buffer.concat([work, Buffer.from([0]), index])) };
}
/** Read-only, bounded evidence of dirty paths; unrelated pre-existing dirty files
 * remain distinguishable. This is not a repository-wide OS snapshot or attribution proof. */
export async function captureGitBaseline(root: string, config: PlanReadConfig): Promise<GitBaseline> {
  try {
    const binding = await resolveGitExecutable();
    const executable = binding.realPath;
    const canonical = fs.realpathSync.native(root);
    // Refuse integrations before any command that might run a clean/process
    // filter. Includes/worktree config are rejected rather than followed.
    const integrations = git(executable, root, ["config", "--local", "--no-includes", "--name-only", "--get-regexp", "^(filter\\.|include\\.|includeif\\.|extensions\\.worktreeconfig$|remote\\..*\\.promisor$)"], true);
    if (integrations) return reject("GIT_INTEGRATION_REQUIRED");
    const top = fs.realpathSync.native(decode(git(executable, root, ["rev-parse", "--show-toplevel"])!).trim());
    if (top !== canonical) return reject();
    if (decode(git(executable, root, ["ls-files", "--stage", "-z"])!).split("\0").some(row => row.startsWith("160000 "))) return reject("GIT_INTEGRATION_REQUIRED");
    const before = metadata(executable, root);
    const rows = decode(before.status).split("\0").filter(Boolean);
    if (rows.length > 128) return reject("EVIDENCE_PATH_LIMIT");
    const files: GitBaseline["files"] = [];
    const seen = new Set<string>();
    let total = 0;
    for (const row of rows) {
      if (row.length < 4 || row[2] !== " ") return reject();
      const relative = row.slice(3);
      const key = process.platform === "win32" ? relative.toLowerCase() : relative;
      if (seen.has(key)) return reject();
      seen.add(key);
      if (normalizeGuidancePathInput(relative) !== relative || /[\u0000-\u001f\u007f-\u009f\p{Cf}\p{Cs}]/u.test(relative) || relative.startsWith(".ai-bridge/") || relative === ".ai-bridge") return reject();
      const status = row.slice(0, 2);
      if (!/^[ MADRCU?!]{2}$/u.test(status) || status.includes("U")) return reject();
      const staged = git(executable, root, ["ls-files", "--stage", "-z", "--", `:(literal)${relative}`])!;
      const worktreeDiff = git(executable, root, ["diff", "--raw", "--no-abbrev", "--no-ext-diff", "--no-textconv", "--no-renames", "--", `:(literal)${relative}`])!;
      let sha256: string | null = null;
      const result = await readGuidanceText({ root: canonical, relativePath: relative, maxBytes: MAX_EVIDENCE_FILE_BYTES, blockedGlobs: config.blockedGlobs });
      if (result.ok) {
        // Only the same-handle reader's raw digest is retained. Source text,
        // including security-test fixtures, is never stored or returned here.
        sha256 = result.rawSha256; total += result.sourceBytes;
        if (total > 4 * 1024 * 1024) return reject();
      } else if (result.reason !== "READ_MISSING" || !status.includes("D")) return reject(`EVIDENCE_${result.reason}`);
      files.push({ path: relative, status, sha256, indexSha256: digest(staged), worktreeDiffSha256: digest(worktreeDiff) });
    }
    const after = metadata(executable, root);
    await verifyGitExecutableBinding(binding);
    if (before.head !== after.head || before.statusSha256 !== after.statusSha256 || before.diffSha256 !== after.diffSha256) return reject();
    const baseline = gitBaselineSchema.parse({ head: before.head, statusSha256: before.statusSha256, diffSha256: before.diffSha256, preexistingDirty: files.length > 0, files: files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) });
    if (Buffer.byteLength(JSON.stringify(baseline)) > 24_000) return reject();
    return baseline;
  } catch (error) { if (error instanceof C2CEvidenceError) throw error; return reject(); }
}
export function changedPaths(before: GitBaseline, after: GitBaseline): string[] {
  const a = new Map(before.files.map(f => [f.path, JSON.stringify(f)]));
  const b = new Map(after.files.map(f => [f.path, JSON.stringify(f)]));
  return [...new Set([...a.keys(), ...b.keys()])].filter(p => a.get(p) !== b.get(p)).sort();
}
