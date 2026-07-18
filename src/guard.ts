import fs from "node:fs";
import { createHash, randomBytes as nodeRandomBytes, randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { minimatch } from "minimatch";
import type { CodexProConfig } from "./config.js";
import { expandHome } from "./config.js";
import { ProtectedRootPolicy } from "./access/protectedRoots.js";

export interface Workspace {
  id: string;
  root: string;
  openedAt: string;
  accessClass?: "confirmed_root" | "task_worktree";
  access?: "read_only" | "read_write";
  leaseId?: string;
  idleExpiresAt?: string;
  absoluteExpiresAt?: string;
}

export interface PolicyPathFacts {
  absPath: string;
  relPath: string;
  comparisonKey: string;
  targetExists: boolean;
  existingParent: string;
  existingParentIdentity: string;
  unresolvedSuffix: string[];
}

export class CodexProError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexProError";
  }
}

export function isSubpath(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function normalizeRelPath(relPath: string): string {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized === "") return ".";
  return normalized;
}

const WINDOWS_RESERVED_BASENAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const RESERVED_TRANSACTION_PREFIX = ".codexpro-txn-";

export function isReservedTransactionRelativePath(
  relPath: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const segments = normalizeRelPath(relPath)
    .replace(/^\.\//, "")
    .split("/")
    .filter(Boolean);
  return segments.some((segment) => {
    const compared = platform === "win32" ? segment.toLocaleLowerCase("en-US") : segment;
    return compared.startsWith(RESERVED_TRANSACTION_PREFIX);
  });
}

export function assertSafePathInput(inputPath: string, platform: NodeJS.Platform = process.platform): void {
  if (inputPath.includes("\0")) {
    throw new CodexProError("Path contains a null byte.");
  }
  if (platform !== "win32") return;

  const normalized = inputPath.replace(/\//g, "\\");
  if (/^\\\\[?.]\\/.test(normalized)) {
    throw new CodexProError(`Windows device paths are not allowed: ${inputPath}`);
  }
  if (/^\\\\/.test(normalized)) {
    throw new CodexProError(`UNC paths are not allowed: ${inputPath}`);
  }
  if (/^[A-Za-z]:(?!\\)/.test(normalized)) {
    throw new CodexProError(`Drive-relative Windows paths are not allowed: ${inputPath}`);
  }

  const withoutDrive = /^[A-Za-z]:/.test(normalized) ? normalized.slice(2) : normalized;
  if (withoutDrive.includes(":")) {
    throw new CodexProError(`NTFS alternate data stream paths are not allowed: ${inputPath}`);
  }

  for (const segment of withoutDrive.split(/\\+/).filter(Boolean)) {
    if (segment === "." || segment === "..") continue;
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      throw new CodexProError(`Windows path segments may not end with a dot or space: ${inputPath}`);
    }
    const basename = segment.split(".", 1)[0];
    if (WINDOWS_RESERVED_BASENAME.test(basename)) {
      throw new CodexProError(`Windows reserved device name is not allowed: ${inputPath}`);
    }
  }
}

export function displayPath(absPath: string, root: string): string {
  const rel = path.relative(root, absPath) || ".";
  return normalizeRelPath(rel);
}

function normalizeWorkspaceIdentityPath(root: string, platform: NodeJS.Platform): string {
  const normalized = root.replace(/\\/g, "/").normalize("NFC").replace(/\/+$/, "");
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function workspaceKeyForRoot(
  realRoot: string,
  platform: NodeJS.Platform = process.platform
): string {
  const normalized = normalizeWorkspaceIdentityPath(realRoot, platform);
  return `wk_${createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
}

function maybeRealpath(existingPath: string): string | undefined {
  try {
    return fs.realpathSync.native(existingPath);
  } catch {
    return undefined;
  }
}

function closestExistingParent(absPath: string): string {
  let current = path.resolve(absPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

type WorkspaceRevocationReason = "closed" | "expired" | "transport_closed" | "policy_revision_changed";

interface WorkspaceRecord {
  workspace: Workspace;
  key: string;
  expiresAtMs: number;
  transportSessionId: string;
  identityBinding: string;
  policyRevision: string | null;
}

interface WorkspaceTombstone {
  workspaceId: string;
  revokedAt: string;
  reason: WorkspaceRevocationReason;
}

export interface WorkspaceManagerOptions {
  transportSessionId?: () => string;
  identityBinding?: string;
  policyRevision?: () => string | null | undefined;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  maxTombstones?: number;
  beforeWorkspaceUse?: (canonicalRoot: string) => void;
  confirmedRoots?: {
    getWorkspace(id: string): Workspace;
    listWorkspaces(): Workspace[];
    closeWorkspace(id: string): ClosedWorkspace | null;
  };
  taskWorktrees?: {
    getWorkspace(id: string): Workspace;
    listWorkspaces(): Workspace[];
    closeWorkspace(id: string): ClosedWorkspace | null;
  };
}

export interface ClosedWorkspace {
  workspaceId: string;
  closedAt: string;
  state: "closed";
}

export class WorkspaceManager {
  private readonly records = new Map<string, WorkspaceRecord>();
  private readonly workspaceIdsByKey = new Map<string, string>();
  private readonly tombstones = new Map<string, WorkspaceTombstone>();
  private readonly transportSessionId: () => string;
  private readonly identityBinding: string;
  private readonly policyRevision: () => string | null;
  private readonly now: () => number;
  private readonly randomBytes: (size: number) => Buffer;
  private readonly beforeWorkspaceUse: (canonicalRoot: string) => void;
  private readonly ttlMs: number;
  private readonly maxTombstones: number;
  private readonly confirmedRoots?: WorkspaceManagerOptions["confirmedRoots"];
  private readonly taskWorktrees?: WorkspaceManagerOptions["taskWorktrees"];

  constructor(
    private readonly config: CodexProConfig,
    options: WorkspaceManagerOptions = {}
  ) {
    const fallbackSessionId = `local-${randomUUID()}`;
    this.transportSessionId = options.transportSessionId ?? (() => fallbackSessionId);
    this.identityBinding = options.identityBinding?.trim() || `local-${randomUUID()}`;
    this.policyRevision = () => options.policyRevision?.() ?? null;
    this.now = options.now ?? Date.now;
    this.randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.beforeWorkspaceUse = options.beforeWorkspaceUse ?? (() => undefined);
    this.ttlMs = Math.max(
      60_000,
      Math.min(24 * 60 * 60_000, config.workspaceTtlMs ?? config.httpSessionTtlMs ?? 30 * 60_000)
    );
    this.maxTombstones = Math.max(16, Math.min(4096, options.maxTombstones ?? 256));
    this.confirmedRoots = options.confirmedRoots;
    this.taskWorktrees = options.taskWorktrees;
  }

  defaultWorkspace(): Workspace {
    return this.openWorkspace(this.config.defaultRoot);
  }

  openWorkspace(rootInput?: string): Workspace {
    this.pruneExpired();
    const requested = rootInput?.trim() ? expandHome(rootInput.trim()) : this.config.defaultRoot;
    assertSafePathInput(requested);
    const resolved = path.resolve(requested);
    if (!fs.existsSync(resolved)) {
      throw new CodexProError(`Workspace root does not exist: ${resolved}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new CodexProError(`Workspace root is not a directory: ${resolved}`);
    }
    const realRoot = fs.realpathSync.native(resolved);
    const allowed = this.config.allowedRoots.some((allowedRoot) => isSubpath(realRoot, allowedRoot));
    if (!allowed) {
      throw new CodexProError(
        `Workspace root is outside allowed roots: ${realRoot}\nAllowed roots:\n${this.config.allowedRoots.map((r) => `- ${r}`).join("\n")}`
      );
    }

    this.beforeWorkspaceUse(realRoot);
    const key = workspaceKeyForRoot(realRoot);
    const existingId = this.workspaceIdsByKey.get(key);
    if (existingId) {
      const existing = this.records.get(existingId);
      if (existing && this.recordMatchesCurrentBinding(existing)) {
        return this.touch(existing);
      }
      if (existing) this.revokeRecord(existing, "policy_revision_changed");
    }

    const now = this.now();
    const id = this.nextWorkspaceId();
    const workspace: Workspace = {
      id,
      root: realRoot,
      openedAt: new Date(now).toISOString()
    };
    const record: WorkspaceRecord = {
      workspace,
      key,
      expiresAtMs: now + this.ttlMs,
      transportSessionId: this.currentTransportSessionId(),
      identityBinding: this.identityBinding,
      policyRevision: this.policyRevision()
    };
    this.records.set(id, record);
    this.workspaceIdsByKey.set(key, id);
    return { ...workspace };
  }

  getWorkspace(id: string): Workspace {
    if (typeof id !== "string" || !id.trim()) {
      throw new CodexProError("workspace_id is required. Call open_workspace first.");
    }
    this.pruneExpired();
    const record = this.records.get(id);
    if (!record) {
      try {
        const confirmed = this.confirmedRoots?.getWorkspace(id);
        if (confirmed) return { ...confirmed };
      } catch {
        // Preserve the same opaque not-found result for stale or foreign handles.
      }
      try {
        const task = this.taskWorktrees?.getWorkspace(id);
        if (task) return { ...task };
      } catch {
        // Preserve the same opaque not-found result for stale or foreign handles.
      }
    }
    if (!record || !this.recordMatchesCurrentBinding(record)) {
      if (record) this.revokeRecord(record, "policy_revision_changed");
      throw new CodexProError(`Unknown workspace_id: ${id}. Call open_workspace first.`);
    }
    this.beforeWorkspaceUse(record.workspace.root);
    return this.touch(record);
  }

  resolveWorkspace(id?: string): Workspace {
    return typeof id === "string" && id.trim() ? this.getWorkspace(id.trim()) : this.defaultWorkspace();
  }

  closeWorkspace(id: string): ClosedWorkspace {
    if (typeof id !== "string" || !id.trim()) {
      throw new CodexProError("workspace_id is required. Call open_workspace first.");
    }
    this.pruneExpired();
    const record = this.records.get(id);
    if (!record) {
      try {
        const closed = this.confirmedRoots?.closeWorkspace(id);
        if (closed) return closed;
      } catch {
        // Preserve the same opaque not-found result for stale or foreign handles.
      }
      try {
        const closed = this.taskWorktrees?.closeWorkspace(id);
        if (closed) return closed;
      } catch {
        // Preserve the same opaque not-found result for stale or foreign handles.
      }
    }
    if (!record || !this.recordMatchesCurrentBinding(record)) {
      if (record) this.revokeRecord(record, "policy_revision_changed");
      throw new CodexProError(`Unknown workspace_id: ${id}. Call open_workspace first.`);
    }
    const closedAt = new Date(this.now()).toISOString();
    this.revokeRecord(record, "closed", closedAt);
    return { workspaceId: id, closedAt, state: "closed" };
  }

  listWorkspaces(): Workspace[] {
    this.pruneExpired();
    const configured = [...this.records.values()]
      .filter((record) => this.recordMatchesCurrentBinding(record))
      .map((record) => ({ ...record.workspace }));
    let confirmed: Workspace[] = [];
    try { confirmed = this.confirmedRoots?.listWorkspaces().map((workspace) => ({ ...workspace })) ?? []; } catch { }
    let tasks: Workspace[] = [];
    try { tasks = this.taskWorktrees?.listWorkspaces().map((workspace) => ({ ...workspace })) ?? []; } catch { }
    return [...configured, ...confirmed, ...tasks];
  }

  revokeAll(reason: WorkspaceRevocationReason = "transport_closed"): void {
    const revokedAt = new Date(this.now()).toISOString();
    for (const record of [...this.records.values()]) {
      this.revokeRecord(record, reason, revokedAt);
    }
    try {
      for (const workspace of this.confirmedRoots?.listWorkspaces() ?? []) {
        this.confirmedRoots?.closeWorkspace(workspace.id);
      }
    } catch { }
    try {
      for (const workspace of this.taskWorktrees?.listWorkspaces() ?? []) {
        this.taskWorktrees?.closeWorkspace(workspace.id);
      }
    } catch { }
  }

  revokeForPolicyRevision(activePolicyRevision: string): void {
    const revokedAt = new Date(this.now()).toISOString();
    for (const record of [...this.records.values()]) {
      if (record.policyRevision === activePolicyRevision) continue;
      this.revokeRecord(record, "policy_revision_changed", revokedAt);
    }
  }

  private touch(record: WorkspaceRecord): Workspace {
    record.expiresAtMs = this.now() + this.ttlMs;
    return { ...record.workspace };
  }

  private currentTransportSessionId(): string {
    const sessionId = this.transportSessionId().trim();
    if (!sessionId || sessionId === "pending") {
      throw new CodexProError("Workspace transport session is unavailable.");
    }
    return sessionId;
  }

  private recordMatchesCurrentBinding(record: WorkspaceRecord): boolean {
    return record.transportSessionId === this.currentTransportSessionId() &&
      record.identityBinding === this.identityBinding &&
      record.policyRevision === this.policyRevision();
  }

  private nextWorkspaceId(): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bytes = this.randomBytes(16);
      if (!Buffer.isBuffer(bytes) || bytes.length !== 16) {
        throw new CodexProError("Workspace id generator returned an invalid value.");
      }
      const id = `ws_${bytes.toString("hex")}`;
      if (!this.records.has(id) && !this.tombstones.has(id)) return id;
    }
    throw new CodexProError("Workspace id generation failed.");
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const record of [...this.records.values()]) {
      if (record.expiresAtMs <= now) {
        this.revokeRecord(record, "expired", new Date(now).toISOString());
      }
    }
  }

  private revokeRecord(
    record: WorkspaceRecord,
    reason: WorkspaceRevocationReason,
    revokedAt = new Date(this.now()).toISOString()
  ): void {
    this.records.delete(record.workspace.id);
    if (this.workspaceIdsByKey.get(record.key) === record.workspace.id) {
      this.workspaceIdsByKey.delete(record.key);
    }
    this.tombstones.set(record.workspace.id, {
      workspaceId: record.workspace.id,
      revokedAt,
      reason
    });
    while (this.tombstones.size > this.maxTombstones) {
      const oldest = this.tombstones.keys().next().value;
      if (typeof oldest !== "string") break;
      this.tombstones.delete(oldest);
    }
  }
}

export class PathGuard {
  private readonly protectedRoots: ProtectedRootPolicy;
  private readonly confirmedFileBindings = new Map<string, { dev: string; ino: string; nlink: number }>();

  constructor(
    private readonly config: Pick<CodexProConfig, "blockedGlobs">,
    private readonly platform: NodeJS.Platform = process.platform
  ) {
    this.protectedRoots = new ProtectedRootPolicy({ platform });
  }

  isBlockedRelativePath(relPath: string): boolean {
    const rel = normalizeRelPath(relPath).replace(/^\.\//, "");
    if (isReservedTransactionRelativePath(rel, this.platform)) return true;
    if (!rel || rel === ".") return false;
    return this.config.blockedGlobs.some((glob) =>
      minimatch(rel, glob, { dot: true, nocase: this.platform === "win32", matchBase: false }) ||
      minimatch(path.basename(rel), glob, { dot: true, nocase: this.platform === "win32", matchBase: true })
    );
  }

  assertNotBlocked(relPath: string): void {
    if (this.isBlockedRelativePath(relPath)) {
      throw new CodexProError(`Path is blocked by safety rules: ${relPath}`);
    }
  }

  resolve(workspace: Workspace, inputPath = ".", options: { forWrite?: boolean } = {}): { absPath: string; relPath: string } {
    if (workspace.accessClass === "confirmed_root" && options.forWrite && workspace.access !== "read_write") {
      throw new CodexProError("Confirmed-root workspace is read-only.");
    }
    assertSafePathInput(inputPath || ".", this.platform);
    const expanded = expandHome(inputPath || ".");
    const candidate = path.isAbsolute(expanded) ? expanded : path.join(workspace.root, expanded);
    let absPath = path.resolve(candidate);
    const realTarget = maybeRealpath(absPath);
    let relPath = displayPath(absPath, workspace.root);

    if (workspace.accessClass === "confirmed_root" && this.protectedRoots.classify(absPath).blocked) {
      throw new CodexProError("Path is protected from confirmed-root access.");
    }

    if (!isSubpath(absPath, workspace.root)) {
      if (realTarget && isSubpath(realTarget, workspace.root)) {
        absPath = realTarget;
        relPath = displayPath(realTarget, workspace.root);
      } else if (options.forWrite) {
        const parent = closestExistingParent(path.dirname(absPath));
        const realParent = maybeRealpath(parent);
        if (!realParent || !isSubpath(realParent, workspace.root)) {
          throw new CodexProError(`Path escapes workspace root: ${inputPath}`);
        }
        absPath = path.resolve(realParent, path.relative(parent, absPath));
        relPath = displayPath(absPath, workspace.root);
      } else {
        throw new CodexProError(`Path escapes workspace root: ${inputPath}`);
      }
    }

    this.assertNotBlocked(relPath);

    if (realTarget) {
      if (!isSubpath(realTarget, workspace.root)) {
        throw new CodexProError(`Path resolves outside workspace root through a symlink: ${inputPath}`);
      }
      const realRel = displayPath(realTarget, workspace.root);
      this.assertNotBlocked(realRel);
      if (workspace.accessClass === "confirmed_root") {
        if (this.protectedRoots.classify(realTarget).blocked) {
          throw new CodexProError("Resolved path is protected from confirmed-root access.");
        }
        const targetStat = fs.statSync(realTarget, { bigint: true });
        if (targetStat.isFile() && targetStat.nlink !== 1n) {
          throw new CodexProError("Confirmed-root ordinary files must have exactly one hard link.");
        }
        if (targetStat.isFile()) {
          this.confirmedFileBindings.set(realTarget, {
            dev: targetStat.dev.toString(),
            ino: targetStat.ino.toString(),
            nlink: Number(targetStat.nlink)
          });
        }
      }
    }

    if (options.forWrite) {
      try {
        if (fs.lstatSync(absPath).isSymbolicLink()) {
          throw new CodexProError(`Refusing to write through a symlink: ${inputPath}`);
        }
      } catch (error) {
        if (error instanceof CodexProError) throw error;
      }
      const parent = closestExistingParent(path.dirname(absPath));
      const realParent = maybeRealpath(parent);
      if (realParent && !isSubpath(realParent, workspace.root)) {
        throw new CodexProError(`Write path resolves through a parent outside the workspace: ${inputPath}`);
      }
      if (realParent) {
        const realParentRel = displayPath(realParent, workspace.root);
        this.assertNotBlocked(realParentRel);
        if (workspace.accessClass === "confirmed_root" && this.protectedRoots.classify(realParent).blocked) {
          throw new CodexProError("Write parent is protected from confirmed-root access.");
        }
      }
    }

    return { absPath, relPath };
  }

  resolvePolicyFacts(
    workspace: Workspace,
    inputPath = ".",
    options: { forWrite?: boolean } = {}
  ): PolicyPathFacts {
    const resolved = this.resolve(workspace, inputPath, options);
    const realTarget = maybeRealpath(resolved.absPath);
    const targetAbsPath = realTarget ?? resolved.absPath;
    const targetExists = Boolean(realTarget);
    const existingParentCandidate = targetExists
      ? path.dirname(targetAbsPath)
      : closestExistingParent(path.dirname(resolved.absPath));
    const existingParent = maybeRealpath(existingParentCandidate);
    if (!existingParent || !isSubpath(existingParent, workspace.root)) {
      throw new CodexProError(`Path parent is outside the workspace: ${inputPath}`);
    }
    const parentStat = fs.statSync(existingParent);
    const parentIdentityPayload = `${existingParent}\0${parentStat.dev}\0${parentStat.ino}`;
    const existingParentIdentity = `parent_${createHash("sha256").update(parentIdentityPayload).digest("hex").slice(0, 24)}`;
    const canonicalRelPath = displayPath(targetAbsPath, workspace.root);
    const normalizedRelPath = normalizeRelPath(canonicalRelPath).normalize("NFC");
    const comparisonKey = this.platform === "win32"
      ? normalizedRelPath.toLocaleLowerCase("en-US")
      : normalizedRelPath;
    const unresolvedSuffix = targetExists
      ? []
      : normalizeRelPath(path.relative(existingParent, resolved.absPath))
          .split("/")
          .filter((segment) => segment && segment !== ".");

    for (const segment of unresolvedSuffix) {
      assertSafePathInput(segment, this.platform);
      if (segment === "..") {
        throw new CodexProError(`Path escapes workspace root: ${inputPath}`);
      }
    }

    return {
      absPath: targetAbsPath,
      relPath: normalizedRelPath,
      comparisonKey,
      targetExists,
      existingParent,
      existingParentIdentity,
      unresolvedSuffix
    };
  }

  async assertTextFile(absPath: string, maxBytes: number): Promise<void> {
    const stat = await fsp.stat(absPath);
    const confirmed = this.confirmedFileBindings.get(absPath);
    if (confirmed && (
      String(stat.dev) !== confirmed.dev ||
      String(stat.ino) !== confirmed.ino ||
      stat.nlink !== confirmed.nlink ||
      stat.nlink !== 1
    )) {
      throw new CodexProError("Confirmed-root file identity or link count changed before access.");
    }
    if (!stat.isFile()) {
      throw new CodexProError(`Not a file: ${absPath}`);
    }
    if (stat.size > maxBytes) {
      throw new CodexProError(`File is too large (${stat.size} bytes). Limit: ${maxBytes} bytes.`);
    }
    if (stat.size === 0) return;
    const handle = await fsp.open(absPath, "r");
    try {
      const sample = Buffer.alloc(Math.min(64 * 1024, stat.size));
      let offset = 0;
      while (offset < stat.size) {
        const { bytesRead } = await handle.read(sample, 0, sample.length, offset);
        if (bytesRead === 0) break;
        if (sample.subarray(0, bytesRead).includes(0)) {
          throw new CodexProError("Refusing to read binary file.");
        }
        offset += bytesRead;
      }
    } finally {
      await handle.close();
    }
  }
}

export function userHome(): string {
  return os.homedir();
}
