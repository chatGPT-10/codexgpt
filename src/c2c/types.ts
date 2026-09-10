import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const PREFIX = "[CODEXGPT-C2C]";
export const MAX_MESSAGE_BYTES = 16_384;
export const WEB_STATES = ["INIT", "PLAN", "EXECUTED", "DONE", "BLOCKED", "ERROR", "HANDOFF"] as const;
export const LOCAL_STATES = ["IDLE", "INIT_SENT", "PLAN_RECEIVED", "EXECUTING", "EXECUTED_LOCAL", "EXECUTED_SENT", "DONE", "BLOCKED", "RECOVERY_REQUIRED", "ERROR"] as const;
export const taskIdSchema = z.string().regex(/^c2c_[A-Za-z0-9_-]{1,96}$/u);
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const text = z.string().min(1).max(MAX_MESSAGE_BYTES);
const common = { protocol: z.literal(PROTOCOL_VERSION), taskId: taskIdSchema, iteration: integer };
export const messageSchema = z.discriminatedUnion("state", [
  z.object({ ...common, state: z.literal("INIT"), iteration: z.literal(0), workspaceId: identifier, goal: text }).strict(),
  z.object({ ...common, state: z.literal("PLAN"), iteration: integer.min(1), planPath: z.literal(".ai-bridge/current-plan.md"), planSha256: sha256, planBytes: integer.min(1) }).strict(),
  z.object({ ...common, state: z.literal("EXECUTED"), iteration: integer.min(1), executionId: z.string().regex(/^exec_[A-Za-z0-9_-]{1,96}$/u), planSha256: sha256, changedFiles: integer, checks: z.literal("recorded") }).strict(),
  z.object({ ...common, state: z.literal("DONE"), iteration: integer.min(1), summary: text }).strict(),
  z.object({ ...common, state: z.literal("BLOCKED"), reason: text, needs: text }).strict(),
  z.object({ ...common, state: z.literal("ERROR"), reason: text }).strict(),
  z.object({ ...common, state: z.literal("HANDOFF"), originalGoal: text, progress: text, currentState: z.enum(LOCAL_STATES), knownIssues: text, nextExpectedStep: text }).strict()
]);
export type C2CMessage = z.infer<typeof messageSchema>;
export type WebState = C2CMessage["state"];
export type LocalState = typeof LOCAL_STATES[number];
export type WaitingFor = "NONE" | "CHATGPT_PLAN" | "CODEX_EXECUTION" | "CHATGPT_REVIEW" | "USER";
export interface MessageContext { taskId: string; expectedIteration: number }

// This table defines serialization only. Runtime schemas remain the authority.
export const FIELD_LAYOUT = {
  INIT: [["WORKSPACE_ID", "workspaceId", "scalar"], ["GOAL", "goal", "body"]],
  PLAN: [["PLAN_PATH", "planPath", "scalar"], ["PLAN_SHA256", "planSha256", "scalar"], ["PLAN_BYTES", "planBytes", "number"]],
  EXECUTED: [["EXECUTION_ID", "executionId", "scalar"], ["PLAN_SHA256", "planSha256", "scalar"], ["CHANGED_FILES", "changedFiles", "number"], ["CHECKS", "checks", "scalar"]],
  DONE: [["SUMMARY", "summary", "body"]],
  BLOCKED: [["REASON", "reason", "body"], ["NEEDS", "needs", "body"]],
  ERROR: [["REASON", "reason", "body"]],
  HANDOFF: [["ORIGINAL_GOAL", "originalGoal", "body"], ["PROGRESS", "progress", "body"], ["CURRENT_STATE", "currentState", "scalar"], ["KNOWN_ISSUES", "knownIssues", "body"], ["NEXT_EXPECTED_STEP", "nextExpectedStep", "body"]]
} as const satisfies Record<WebState, readonly (readonly [string, string, "scalar" | "number" | "body"])[]>;
