import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { CodexGPTHome, profileIdForRoot } from "../profileStore.js";
import { isSubpath } from "../guard.js";
import { parseStrictJsonObject } from "../process/windowsHostProtocol.js";
import { AtomicJsonFileStore, type AtomicStateDependencies } from "../transactions/atomicStateFile.js";
import { createTask, transition, type TaskEvent } from "./stateMachine.js";
import { taskIdSchema } from "./types.js";
import { readPlanSnapshot, type PlanReadConfig, type PlanSnapshot } from "./planSnapshot.js";
import { MAX_SESSION_BYTES, C2CSessionError, sessionError, validateSession, sessionSchema, checkpointSchema, conversationSchema, executionReport, type C2CSession, type Checkpoint } from "./sessionSchema.js";
import { canonicalDirectory, ensureDirectory, safeAbsolute, objectIdentity, readStateBytes, pathKey } from "./storagePaths.js";
import { captureGitBaseline, changedPaths, checkSummarySchema, type CheckSummary } from "./executionEvidence.js";
import { readGuidanceText } from "../guidance/safeTextReader.js";

export { C2CSessionError } from "./sessionSchema.js";
export interface SessionStoreOptions {
  home?: string;
  testHooks?: { beforeCommit?: () => void; syncDirectory?: AtomicStateDependencies["syncDirectory"] };
}
const beginSchema = z.object({
  taskId: taskIdSchema, workspaceId: z.string(), originalGoal: z.string(), conversation: conversationSchema
}).strict();
type BeginInput = z.infer<typeof beginSchema>;
export class C2CSessionStore {
  readonly workspaceRoot: string;
  readonly filePath: string;
  private readonly directory: string;
  private readonly rootIdentity: string;
  private directoryIdentity: string | null = null;
  private readonly options: SessionStoreOptions;
  private lockOwner: { path: string; identity: string; bytes: Buffer } | null = null;

  constructor(root: string, options: SessionStoreOptions = {}) {
    this.workspaceRoot = canonicalDirectory(safeAbsolute(root));
    this.rootIdentity = objectIdentity(fs.statSync(this.workspaceRoot, { bigint: true }));
    this.options = options;
    const home = safeAbsolute(options.home ?? CodexGPTHome());
    this.directory = path.join(home, "c2c", "sessions");
    if (isSubpath(this.directory, this.workspaceRoot)) sessionError("STATE_PATH_UNSAFE");
    // Native realpath resolves casing and 8.3 aliases before reusing the profile key.
    this.filePath = path.join(this.directory, `${profileIdForRoot(this.workspaceRoot)}.json`);
    this.ensure(false);
  }
  private ensure(create: boolean): boolean {
    if (canonicalDirectory(this.workspaceRoot) !== this.workspaceRoot || objectIdentity(fs.statSync(this.workspaceRoot, { bigint: true })) !== this.rootIdentity) return sessionError("WORKSPACE_MISMATCH");
    if (!ensureDirectory(this.directory, create)) {
      if (this.directoryIdentity) return sessionError("STATE_PATH_UNSAFE");
      return false;
    }
    const identity = objectIdentity(fs.statSync(this.directory, { bigint: true }));
    if (this.directoryIdentity && this.directoryIdentity !== identity) return sessionError("STATE_PATH_UNSAFE");
    this.directoryIdentity = identity;
    return true;
  }
  load(): C2CSession | null {
    try {
      if (!this.ensure(false)) return null;
      const bytes = readStateBytes(this.filePath, MAX_SESSION_BYTES);
      if (!bytes) return null;
      const parsed = validateSession(parseStrictJsonObject(bytes, { maxBytes: MAX_SESSION_BYTES, maxDepth: 8, maxKeys: 4096, maxStringLength: 32768 }));
      if (pathKey(parsed.workspaceRoot) !== pathKey(this.workspaceRoot) || parsed.workspaceIdentity !== this.rootIdentity) return sessionError("WORKSPACE_MISMATCH");
      this.ensure(false);
      return parsed;
    } catch (e) { if (e instanceof C2CSessionError) throw e; return sessionError("SESSION_INVALID"); }
  }
  resume(taskId: string): C2CSession {
    const s = this.load();
    if (!s || s.task.taskId !== taskId) return sessionError("TASK_MISMATCH");
    // Recovery is observational. In particular, EXECUTING never becomes executable again here.
    return s;
  }
  private async locked<T>(operation: () => Promise<T> | T): Promise<T> {
    this.ensure(true);
    const lock = `${this.filePath}.lock`;
    let fd: number;
    try { fd = fs.openSync(lock, "wx", 0o600); }
    catch (e) { return sessionError((e as NodeJS.ErrnoException).code === "EEXIST" ? "SESSION_LOCKED" : "STATE_PATH_UNSAFE"); }
    const identity = objectIdentity(fs.fstatSync(fd, { bigint: true }));
    const owner = Buffer.from(JSON.stringify({ pid: process.pid, nonce: randomBytes(16).toString("hex") }));
    try {
      fs.writeFileSync(fd, owner); fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    this.lockOwner = { path: lock, identity, bytes: owner };
    try { return await operation(); }
    finally {
      try { this.assertLock(); fs.unlinkSync(lock); }
      finally { this.lockOwner = null; }
    }
  }
  private assertLock(): void {
    this.ensure(false);
    const owner = this.lockOwner;
    if (!owner) return sessionError("SESSION_LOCK_CHANGED");
    const current = readStateBytes(owner.path, 1024);
    if (!current?.equals(owner.bytes) || objectIdentity(fs.lstatSync(owner.path, { bigint: true })) !== owner.identity) sessionError("SESSION_LOCK_CHANGED");
  }
  private current(revision: number, taskId: string): C2CSession {
    const s = this.load();
    if (!s || !Number.isSafeInteger(revision) || revision !== s.revision) return sessionError("REVISION_CONFLICT");
    if (s.task.taskId !== taskId) return sessionError("TASK_MISMATCH");
    if (s.endedAt) return sessionError("TASK_ENDED");
    return s;
  }
  private save(next: C2CSession, previous: C2CSession | null): C2CSession {
    const validated = validateSession(next);
    // Reject a state the bounded loader could not read before replacing the previous checkpoint.
    parseStrictJsonObject(Buffer.from(JSON.stringify(validated)), { maxBytes: MAX_SESSION_BYTES, maxDepth: 8, maxKeys: 4096, maxStringLength: 32768 });
    const expected = previous === null ? null : JSON.stringify(previous);
    const dependencies = AtomicJsonFileStore.defaultDependencies();
    const originalOpen = dependencies.openSync;
    const originalRename = dependencies.renameSync;
    let tempIdentity: string | undefined;
    let precommitError: C2CSessionError | undefined;
    dependencies.openSync = (file, flags, mode) => {
      this.ensure(false);
      if (path.dirname(file) !== this.directory || flags !== "wx") return sessionError("STATE_PATH_UNSAFE");
      const fd = originalOpen(file, flags, mode);
      tempIdentity = objectIdentity(fs.fstatSync(fd, { bigint: true }));
      return fd;
    };
    dependencies.renameSync = (from, to) => {
      try {
        this.options.testHooks?.beforeCommit?.();
        this.assertLock();
        const persisted = this.load();
        if ((persisted === null ? null : JSON.stringify(persisted)) !== expected) return sessionError("REVISION_CONFLICT");
        const stat = fs.lstatSync(from, { bigint: true });
        if (to !== this.filePath || path.dirname(from) !== this.directory || stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n || objectIdentity(stat) !== tempIdentity) return sessionError("STATE_PATH_UNSAFE");
        originalRename(from, to);
      } catch (e) { if (e instanceof C2CSessionError) precommitError = e; throw e; }
    };
    if (this.options.testHooks?.syncDirectory) dependencies.syncDirectory = this.options.testHooks.syncDirectory;
    try {
      const atomic = new AtomicJsonFileStore(this.directory, sessionSchema, dependencies);
      const capability = atomic.write(this.filePath, validated);
      if (capability === "failed") return sessionError("COMMIT_UNCERTAIN");
      const actual = this.load();
      if (JSON.stringify(actual) !== JSON.stringify(validated)) return sessionError("COMMIT_UNCERTAIN");
      return validated;
    } catch (e) {
      if (precommitError) throw precommitError;
      if (e instanceof C2CSessionError) throw e;
      return sessionError("SESSION_WRITE_FAILED");
    }
  }
  async begin(input: BeginInput, expectedRevision: number | null = null): Promise<C2CSession> {
    const checked = beginSchema.safeParse(input);
    if (!checked.success) return sessionError("SESSION_INVALID");
    const initial = validateSession({ version: 1, revision: 1, workspaceRoot: this.workspaceRoot, workspaceIdentity: this.rootIdentity,
      workspaceId: checked.data.workspaceId, conversation: checked.data.conversation, task: createTask(checked.data.taskId),
      checkpoint: { originalGoal: checked.data.originalGoal, completedSubtasks: "", knownIssues: "", nextExpectedStep: "" }, endedAt: null, savedAt: new Date().toISOString() });
    return this.locked(() => {
      const existing = this.load();
      if (existing && expectedRevision === null) return sessionError("SESSION_CONFLICT");
      if (existing ? expectedRevision !== existing.revision : expectedRevision !== null) return sessionError("REVISION_CONFLICT");
      if (existing && existing.task.state !== "DONE" && existing.endedAt === null) return sessionError("TASK_CONFLICT");
      if (existing?.task.taskId === initial.task.taskId) return sessionError("TASK_CONFLICT");
      return this.save({ ...initial, revision: (existing?.revision ?? 0) + 1 }, existing);
    });
  }
  async advance(revision: number, taskId: string, event: TaskEvent): Promise<C2CSession> {
    if (event?.type === "START_EXECUTION") return sessionError("PLAN_VERIFICATION_REQUIRED");
    return this.locked(() => {
      const s = this.current(revision, taskId);
      if (s.executionRecord && event.type === "COMPLETE_EXECUTION") return sessionError("EXECUTION_EVIDENCE_REQUIRED");
      if (s.executionRecord && event.type === "SEND_EXECUTED") return sessionError("EXECUTION_REPORT_REQUIRED");
      if (s.executionRecord && event.type === "RECEIVE" && event.message.state === "PLAN") return sessionError("SINGLE_ITERATION_ONLY");
      if (s.executionRecord && event.type === "RECEIVE" && event.message.state === "DONE") {
        const checks = s.executionRecord.checks;
        if (!checks?.some(c => c.status === "passed") || checks.some(c => !["passed", "skipped"].includes(c.status))) return sessionError("CHECKS_NOT_PASSED");
      }
      if (event?.type === "SEND_INIT" && (event.message.state !== "INIT" || event.message.workspaceId !== s.workspaceId || event.message.goal !== s.checkpoint.originalGoal)) return sessionError("INVALID_TRANSITION");
      let task;
      try { task = transition(s.task, event); } catch { return sessionError("INVALID_TRANSITION"); }
      return this.save({ ...s, task, revision: s.revision + 1, savedAt: new Date().toISOString() }, s);
    });
  }
  async startExecution(revision: number, taskId: string, config: PlanReadConfig, recordEvidence: boolean): Promise<{ session: C2CSession; planSnapshot: PlanSnapshot }> {
    return this.locked(async () => {
      const s = this.current(revision, taskId);
      if (s.task.state !== "PLAN_RECEIVED" || !s.task.plan) return sessionError("INVALID_TRANSITION");
      if (recordEvidence && s.task.iteration !== 1) return sessionError("SINGLE_ITERATION_ONLY");
      const planSnapshot = await readPlanSnapshot(this.workspaceRoot, s.task.plan, config);
      const executionRecord = recordEvidence ? {
        executionId: `exec_${randomBytes(16).toString("hex")}`, planSha256: planSnapshot.sha256,
        baseline: await captureGitBaseline(this.workspaceRoot, config)
      } : undefined;
      const task = transition(s.task, { type: "START_EXECUTION" });
      if (recordEvidence && Buffer.byteLength(JSON.stringify({ session: { ...s, task, executionRecord }, planSnapshot })) > 120_000) return sessionError("OUTPUT_TOO_LARGE");
      const session = this.save({ ...s, ...(executionRecord ? { executionRecord } : {}), task, revision: s.revision + 1, savedAt: new Date().toISOString() }, s);
      return { session, planSnapshot };
    });
  }
  async finishExecution(revision: number, taskId: string, checks: CheckSummary[], config: PlanReadConfig): Promise<C2CSession> {
    const checked = z.array(checkSummarySchema).min(1).max(32).parse(checks);
    return this.locked(async () => {
      const s = this.current(revision, taskId);
      const record = s.executionRecord;
      if (s.task.state !== "EXECUTING" || !record) return sessionError("INVALID_TRANSITION");
      const final = await captureGitBaseline(this.workspaceRoot, config);
      if (final.head !== record.baseline.head) return sessionError("GIT_HEAD_CHANGED");
      const paths = changedPaths(record.baseline, final);
      const message = { protocol: 1 as const, state: "EXECUTED" as const, taskId, iteration: s.task.iteration,
        executionId: record.executionId, planSha256: record.planSha256, changedFiles: paths.length, checks: "recorded" as const };
      const task = transition(s.task, { type: "COMPLETE_EXECUTION", message });
      const next = validateSession({ ...s, task, executionRecord: { ...record, final, changedPaths: paths, checks: checked },
        revision: s.revision + 1, savedAt: new Date().toISOString() });
      if (Buffer.byteLength(JSON.stringify({ ok: true, session: next, report: executionReport(next) })) > 120_000) return sessionError("OUTPUT_TOO_LARGE");
      return this.save(next, s);
    });
  }
  async prepareExecuted(revision: number, taskId: string, config: PlanReadConfig, expectedReport: string): Promise<C2CSession> {
    return this.locked(async () => {
      const s = this.current(revision, taskId);
      if (s.task.state !== "EXECUTED_LOCAL" || !s.task.execution || !s.executionRecord?.final) return sessionError("INVALID_TRANSITION");
      if (expectedReport !== executionReport(s)) return sessionError("EXECUTION_REPORT_REQUIRED");
      const actual = await captureGitBaseline(this.workspaceRoot, config);
      if (JSON.stringify(actual) !== JSON.stringify(s.executionRecord.final)) return sessionError("EXECUTION_DRIFT");
      const report = await readGuidanceText({ root: this.workspaceRoot, relativePath: ".ai-bridge/agent-status.md", maxBytes: config.maxReadBytes, blockedGlobs: config.blockedGlobs });
      if (!report.ok || report.text !== expectedReport) return sessionError("EXECUTION_REPORT_REQUIRED");
      const task = transition(s.task, { type: "SEND_EXECUTED", message: s.task.execution });
      return this.save({ ...s, task, revision: s.revision + 1, savedAt: new Date().toISOString() }, s);
    });
  }
  async checkpoint(revision: number, taskId: string, patch: Partial<Omit<Checkpoint, "originalGoal">>): Promise<C2CSession> {
    const checked = checkpointSchema.omit({ originalGoal: true }).partial().safeParse(patch);
    if (!checked.success) return sessionError("SESSION_INVALID");
    return this.locked(() => {
      const s = this.current(revision, taskId);
      return this.save({ ...s, checkpoint: { ...s.checkpoint, ...checked.data }, revision: s.revision + 1, savedAt: new Date().toISOString() }, s);
    });
  }
  async endTask(revision: number, taskId: string, confirmation: string): Promise<C2CSession> {
    if (confirmation !== taskId) return sessionError("CONFIRMATION_REQUIRED");
    return this.locked(() => {
      const s = this.current(revision, taskId);
      const now = new Date().toISOString();
      return this.save({ ...s, endedAt: now, savedAt: now, revision: s.revision + 1 }, s);
    });
  }
}
