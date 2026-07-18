import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { z } from "zod";
import type { ProcessInstanceRegistry } from "../transactions/workspaceLock.js";
import { gateRError, gitStateDirectories } from "./durableState.js";

export type GitLockKind = "repository" | "worktree";

export interface GitLockEvent {
  action: "acquired" | "released";
  kind: GitLockKind;
  stateKey: string;
}

export interface GitLockDiagnosis {
  kind: GitLockKind;
  stateKey: string;
  status: "free" | "owned_live" | "foreign_or_stale" | "invalid";
}

export interface GitFileLockHandle {
  release(): Promise<void>;
}

interface GitLockOwnerV1 {
  schemaVersion: 1;
  lockToken: string;
  kind: GitLockKind;
  stateKey: string;
  operationId: string;
  instanceId: string;
  pid: number;
  processCreationTime: string;
  createdAt: string;
}

const ownerSchema: z.ZodType<GitLockOwnerV1> = z.object({
  schemaVersion: z.literal(1),
  lockToken: z.string().regex(/^glock_[a-f0-9]{32}$/),
  kind: z.enum(["repository", "worktree"]),
  stateKey: z.union([
    z.string().regex(/^grs_[a-f0-9]{32}$/),
    z.string().regex(/^gws_[a-f0-9]{32}$/)
  ]),
  operationId: z.string().regex(/^gop_[a-f0-9]{32}$/),
  instanceId: z.string().regex(/^instance_[a-f0-9]{32}$/),
  pid: z.number().int().positive().safe(),
  processCreationTime: z.string().min(1).max(160).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  createdAt: z.string().datetime({ offset: true })
}).strict().superRefine((value, context) => {
  if (value.kind === "repository" && !value.stateKey.startsWith("grs_")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stateKey"], message: "Repository locks require a repository key." });
  }
  if (value.kind === "worktree" && !value.stateKey.startsWith("gws_")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stateKey"], message: "Worktree locks require a worktree key." });
  }
});

function fixedWindowsEnvironment(): NodeJS.ProcessEnv {
  const drive = path.win32.parse(process.execPath).root.replace(/[\\/]$/, "") || "C:";
  const windows = path.win32.join(`${drive}\\`, "Windows");
  return {
    SystemDrive: drive,
    SystemRoot: windows,
    WINDIR: windows,
    ComSpec: path.win32.join(windows, "System32", "cmd.exe"),
    PATH: `${path.win32.join(windows, "System32")};${windows}`,
    PATHEXT: ".COM;.EXE;.BAT;.CMD"
  };
}

export async function defaultProcessCreationTime(pid: number): Promise<string | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (process.platform === "win32") {
    const environment = fixedWindowsEnvironment();
    const powershell = path.win32.join(environment.SystemRoot!, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const result = spawnSync(powershell, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$p=Get-Process -Id ${pid} -ErrorAction Stop;[Console]::Out.Write($p.StartTime.ToUniversalTime().ToString('O'))`
    ], {
      encoding: "utf8",
      env: environment,
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 8_192
    });
    const value = result.status === 0 ? result.stdout.trim() : "";
    return value || null;
  }
  if (process.platform === "linux") {
    try {
      const [stat, bootId] = await Promise.all([
        fsp.readFile(`/proc/${pid}/stat`, "utf8"),
        fsp.readFile("/proc/sys/kernel/random/boot_id", "utf8")
      ]);
      const close = stat.lastIndexOf(")");
      if (close < 0) return null;
      const fields = stat.slice(close + 2).trim().split(/\s+/);
      const startTicks = fields[19];
      if (!startTicks || !/^\d+$/.test(startTicks)) return null;
      return `${bootId.trim()}:${startTicks}`;
    } catch {
      return null;
    }
  }
  return null;
}

async function writeExclusiveJson(file: string, value: unknown): Promise<void> {
  let handle: fsp.FileHandle | null = null;
  try {
    handle = await fsp.open(file, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
  } catch {
    throw gateRError();
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function readOwner(directory: string): Promise<GitLockOwnerV1> {
  try {
    const file = path.join(directory, "owner.json");
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) throw gateRError();
    return ownerSchema.parse(JSON.parse(await fsp.readFile(file, "utf8")));
  } catch {
    throw gateRError();
  }
}

class OwnedGitLock {
  #released = false;

  constructor(
    readonly directory: string,
    readonly owner: GitLockOwnerV1,
    private readonly onLockEvent: (event: GitLockEvent) => void
  ) {}

  async release(): Promise<void> {
    if (this.#released) return;
    const current = await readOwner(this.directory);
    if (
      current.lockToken !== this.owner.lockToken ||
      current.instanceId !== this.owner.instanceId ||
      current.pid !== this.owner.pid ||
      current.processCreationTime !== this.owner.processCreationTime ||
      current.operationId !== this.owner.operationId
    ) throw gateRError();
    const releaseDirectory = `${this.directory}.release-${this.owner.lockToken.slice(6, 22)}`;
    try {
      await fsp.rename(this.directory, releaseDirectory);
      await fsp.rm(releaseDirectory, { recursive: true, force: false });
    } catch {
      throw gateRError();
    }
    this.#released = true;
    this.onLockEvent({ action: "released", kind: this.owner.kind, stateKey: this.owner.stateKey });
  }
}

export class GitLockHandle {
  #released = false;

  constructor(
    private readonly locks: OwnedGitLock[],
    private readonly fileLocks: GitFileLockHandle | null = null
  ) {}

  async release(): Promise<void> {
    if (this.#released) return;
    if (this.fileLocks) await this.fileLocks.release();
    for (const lock of [...this.locks].reverse()) await lock.release();
    this.#released = true;
  }
}

export class GitLockManager {
  readonly #stateRoot: string;
  readonly #registry: ProcessInstanceRegistry;
  readonly #processCreationTime: (pid: number) => Promise<string | null>;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #onLockEvent: (event: GitLockEvent) => void;

  constructor(options: {
    stateRoot: string;
    registry: ProcessInstanceRegistry;
    processCreationTime?: (pid: number) => Promise<string | null>;
    now?: () => number;
    randomBytes?: (size: number) => Buffer;
    onLockEvent?: (event: GitLockEvent) => void;
  }) {
    this.#stateRoot = path.resolve(options.stateRoot);
    this.#registry = options.registry;
    this.#processCreationTime = options.processCreationTime ?? defaultProcessCreationTime;
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.#onLockEvent = options.onLockEvent ?? (() => {});
  }

  lockDirectory(kind: GitLockKind, stateKey: string): string {
    const directories = gitStateDirectories(this.#stateRoot);
    if (kind === "repository" && /^grs_[a-f0-9]{32}$/.test(stateKey)) {
      return path.join(directories.repositoryLocks, `${stateKey}.lock`);
    }
    if (kind === "worktree" && /^gws_[a-f0-9]{32}$/.test(stateKey)) {
      return path.join(directories.worktreeLocks, `${stateKey}.lock`);
    }
    throw gateRError();
  }

  async diagnose(input: {
    repositoryStateKey: string;
    worktreeStateKeys?: string[];
  }): Promise<GitLockDiagnosis[]> {
    const requested: Array<{ kind: GitLockKind; stateKey: string }> = [
      { kind: "repository", stateKey: input.repositoryStateKey },
      ...[...(input.worktreeStateKeys ?? [])].sort().map((stateKey) => ({ kind: "worktree" as const, stateKey }))
    ];
    const output: GitLockDiagnosis[] = [];
    for (const item of requested) {
      const directory = this.lockDirectory(item.kind, item.stateKey);
      try {
        await fsp.access(directory, fs.constants.F_OK);
      } catch {
        output.push({ ...item, status: "free" });
        continue;
      }
      let owner: GitLockOwnerV1;
      try {
        owner = await readOwner(directory);
      } catch {
        output.push({ ...item, status: "invalid" });
        continue;
      }
      const liveCreationTime = await this.#processCreationTime(owner.pid);
      const exactRegistry = this.#registry.isVerifiable(owner.instanceId, owner.pid);
      const ownedLive = exactRegistry && liveCreationTime !== null && liveCreationTime === owner.processCreationTime;
      output.push({ ...item, status: ownedLive ? "owned_live" : "foreign_or_stale" });
    }
    return output;
  }

  async acquire(input: {
    operationId: string;
    repositoryStateKey: string;
    worktreeStateKeys?: string[];
    acquireFileLocks?: () => Promise<GitFileLockHandle>;
  }): Promise<GitLockHandle> {
    if (!/^gop_[a-f0-9]{32}$/.test(input.operationId)) throw gateRError();
    const worktrees = [...new Set(input.worktreeStateKeys ?? [])].sort();
    const requested: Array<{ kind: GitLockKind; stateKey: string }> = [
      { kind: "repository", stateKey: input.repositoryStateKey },
      ...worktrees.map((stateKey) => ({ kind: "worktree" as const, stateKey }))
    ];
    const currentCreationTime = await this.#processCreationTime(this.#registry.record.pid);
    if (!currentCreationTime) throw gateRError();
    const acquired: OwnedGitLock[] = [];
    try {
      for (const item of requested) {
        acquired.push(await this.#acquireOne(item.kind, item.stateKey, input.operationId, currentCreationTime));
      }
      const fileLocks = input.acquireFileLocks ? await input.acquireFileLocks() : null;
      if (fileLocks && typeof fileLocks.release !== "function") throw gateRError();
      return new GitLockHandle(acquired, fileLocks);
    } catch (error) {
      for (const lock of [...acquired].reverse()) await lock.release().catch(() => {});
      throw error;
    }
  }

  async #acquireOne(
    kind: GitLockKind,
    stateKey: string,
    operationId: string,
    processCreationTime: string
  ): Promise<OwnedGitLock> {
    const directory = this.lockDirectory(kind, stateKey);
    await fsp.mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
    try {
      await fsp.mkdir(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw gateRError();
      const diagnosis = (await this.diagnose({
        repositoryStateKey: kind === "repository" ? stateKey : `grs_${"0".repeat(32)}`,
        worktreeStateKeys: kind === "worktree" ? [stateKey] : []
      })).find((entry) => entry.kind === kind && entry.stateKey === stateKey);
      if (diagnosis?.status === "owned_live") throw gateRError("GIT_OPERATION_BUSY");
      throw gateRError();
    }
    const random = this.#randomBytes(16);
    if (!Buffer.isBuffer(random) || random.length !== 16) {
      await fsp.rmdir(directory).catch(() => {});
      throw gateRError();
    }
    const owner = ownerSchema.parse({
      schemaVersion: 1,
      lockToken: `glock_${random.toString("hex")}`,
      kind,
      stateKey,
      operationId,
      instanceId: this.#registry.record.instanceId,
      pid: this.#registry.record.pid,
      processCreationTime,
      createdAt: new Date(this.#now()).toISOString()
    });
    random.fill(0);
    try {
      await writeExclusiveJson(path.join(directory, "owner.json"), owner);
    } catch {
      await fsp.rmdir(directory).catch(() => {});
      throw gateRError();
    }
    this.#onLockEvent({ action: "acquired", kind, stateKey });
    return new OwnedGitLock(directory, owner, this.#onLockEvent);
  }
}
