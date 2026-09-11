import { z } from "zod";
import { hasSecretValue } from "../redact.js";
import { validateTaskState, type TaskState } from "./stateMachine.js";
import { messageSchema, LOCAL_STATES } from "./types.js";
import { gitBaselineSchema, checkSummarySchema } from "./executionEvidence.js";

export const MAX_SESSION_BYTES = 65_536;
export class C2CSessionError extends Error {
  constructor(public readonly code: string) { super(`C2C session rejected: ${code}`); this.name = "C2CSessionError"; }
}
export function sessionError(code: string): never { throw new C2CSessionError(code); }
export function assertSecretFree(text: string): void {
  if (hasSecretValue(text) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(text)) sessionError("SECRET_BLOCKED");
}
const narrative = (bytes: number) => z.string().max(bytes).refine(s => Buffer.byteLength(s) <= bytes && !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\p{Cf}\p{Cs}]/u.test(s));
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u);
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const projectSegment = "g-p-[A-Za-z0-9-]{1,128}";
const projectUrl = z.string().regex(new RegExp(`^https://chatgpt\\.com/g/${projectSegment}/project$`, "u"));
const chatUrl = z.string().regex(new RegExp(`^https://chatgpt\\.com/(?:g/${projectSegment}/)?c/${uuid}$`, "u"));
export const conversationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("chat"), projectUrl: z.null(), chatUrl, connectorName: narrative(256).refine(s => s.trim().length > 0) }).strict(),
  z.object({ mode: z.literal("project"), projectUrl, chatUrl: chatUrl.nullable(), connectorName: narrative(256).refine(s => s.trim().length > 0) }).strict()
]).superRefine((v, ctx) => {
  if (v.mode === "project" && v.chatUrl?.includes("/g/") && v.chatUrl.split("/c/")[0] !== v.projectUrl.slice(0, -8)) {
    ctx.addIssue({ code: "custom", message: "Project binding mismatch" });
  }
});
export const checkpointSchema = z.object({
  originalGoal: narrative(8192).refine(s => s.trim().length > 0), completedSubtasks: narrative(2048), knownIssues: narrative(2048), nextExpectedStep: narrative(2048)
}).strict();
const taskSchema = z.object({
  taskId: z.string(), state: z.enum(LOCAL_STATES), iteration: z.number(), waitingFor: z.enum(["NONE", "CHATGPT_PLAN", "CODEX_EXECUTION", "CHATGPT_REVIEW", "USER"]),
  plan: messageSchema.nullable(), execution: messageSchema.nullable()
}).strict().transform((value, ctx): TaskState => {
  try { return validateTaskState(value as TaskState); }
  catch { ctx.addIssue({ code: "custom", message: "Invalid task checkpoint" }); return z.NEVER; }
});
export const sessionSchema = z.object({
  version: z.literal(1), revision: z.number().int().positive().safe(),
  workspaceRoot: z.string().min(1).max(32768), workspaceIdentity: z.string().regex(/^\d+:\d+$/u), workspaceId: id,
  conversation: conversationSchema, task: taskSchema, checkpoint: checkpointSchema,
  executionRecord: z.object({
    executionId: z.string().regex(/^exec_[A-Za-z0-9_-]{1,96}$/u),
    planSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    baseline: gitBaselineSchema,
    final: gitBaselineSchema.optional(),
    changedPaths: z.array(z.string().max(1024)).max(256).optional(),
    checks: z.array(checkSummarySchema).min(1).max(32).optional()
  }).strict().optional(),
  endedAt: z.string().datetime().nullable(), savedAt: z.string().datetime()
}).strict();
export type C2CSession = z.infer<typeof sessionSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export function executionReport(session: C2CSession): string {
  if (!session.executionRecord?.final) return sessionError("EXECUTION_EVIDENCE_REQUIRED");
  return "# C2C execution evidence\n\n" + JSON.stringify({ taskId: session.task.taskId, iteration: session.task.iteration, ...session.executionRecord }, null, 2) + "\n";
}
export function validateSession(value: unknown): C2CSession {
  const result = sessionSchema.safeParse(value);
  if (!result.success) return sessionError("SESSION_INVALID");
  const record = result.data.executionRecord;
  if (record) {
    const task = result.data.task;
    if (record.planSha256 !== task.plan?.planSha256 || task.iteration !== 1) return sessionError("SESSION_INVALID");
    if (task.execution) {
      if (!record.final || !record.checks || !record.changedPaths || task.execution.executionId !== record.executionId || task.execution.changedFiles !== record.changedPaths.length) return sessionError("SESSION_INVALID");
    } else if (record.final || record.checks || record.changedPaths) return sessionError("SESSION_INVALID");
  }
  const text = JSON.stringify(result.data);
  if (Buffer.byteLength(text + "\n") > MAX_SESSION_BYTES) return sessionError("SESSION_INVALID");
  // Inspect leaf strings too: JSON escaping must not conceal token assignments.
  const scan = (v: unknown): void => {
    if (typeof v === "string") assertSecretFree(v);
    else if (v && typeof v === "object") Object.values(v).forEach(scan);
  };
  scan(result.data);
  return result.data;
}
