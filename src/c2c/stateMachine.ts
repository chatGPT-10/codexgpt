import { z } from "zod";
import { LOCAL_STATES, messageSchema, taskIdSchema, type C2CMessage, type LocalState, type WaitingFor } from "./types.js";
import { formatMessage } from "./messages.js";

export class C2CTransitionError extends Error {
  constructor() { super("C2C transition rejected"); this.name = "C2CTransitionError"; }
}
export interface TaskState {
  taskId: string;
  state: LocalState;
  iteration: number;
  waitingFor: WaitingFor;
  plan: Extract<C2CMessage, { state: "PLAN" }> | null;
  execution: Extract<C2CMessage, { state: "EXECUTED" }> | null;
}
export type TaskEvent =
  | { type: "SEND_INIT" | "RECEIVE" | "COMPLETE_EXECUTION" | "SEND_EXECUTED"; message: C2CMessage }
  | { type: "START_EXECUTION" | "FAIL" | "REQUIRE_RECOVERY" };
const waiting: Record<LocalState, WaitingFor> = {
  IDLE: "NONE", INIT_SENT: "CHATGPT_PLAN", PLAN_RECEIVED: "CODEX_EXECUTION", EXECUTING: "CODEX_EXECUTION",
  EXECUTED_LOCAL: "NONE", EXECUTED_SENT: "CHATGPT_REVIEW", DONE: "NONE", BLOCKED: "USER", RECOVERY_REQUIRED: "USER", ERROR: "USER"
};
const snapshotSchema = z.object({
  taskId: taskIdSchema, state: z.enum(LOCAL_STATES), iteration: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  waitingFor: z.enum(["NONE", "CHATGPT_PLAN", "CODEX_EXECUTION", "CHATGPT_REVIEW", "USER"]),
  plan: messageSchema.nullable(), execution: messageSchema.nullable()
}).strict();
const eventSchema = z.union([
  z.object({ type: z.enum(["SEND_INIT", "RECEIVE", "COMPLETE_EXECUTION", "SEND_EXECUTED"]), message: messageSchema }).strict(),
  z.object({ type: z.enum(["START_EXECUTION", "FAIL", "REQUIRE_RECOVERY"]) }).strict()
]);
function reject(): never { throw new C2CTransitionError(); }
export function validateTaskState(value: TaskState): TaskState {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) return reject();
  const s = parsed.data;
  if (s.waitingFor !== waiting[s.state]) return reject();
  for (const message of [s.plan, s.execution]) {
    if (message) {
      formatMessage(message);
      if (message.taskId !== s.taskId || message.iteration !== s.iteration) return reject();
    }
  }
  if (s.plan && s.plan.state !== "PLAN" || s.execution && s.execution.state !== "EXECUTED") return reject();
  const plan = s.plan as TaskState["plan"];
  const execution = s.execution as TaskState["execution"];
  if ((s.iteration === 0) !== (plan === null) || execution && (!plan || execution.planSha256 !== plan.planSha256)) return reject();
  if (["IDLE", "INIT_SENT"].includes(s.state) && s.iteration !== 0) return reject();
  if (["PLAN_RECEIVED", "EXECUTING"].includes(s.state) && (!plan || execution)) return reject();
  if (["EXECUTED_LOCAL", "EXECUTED_SENT", "DONE"].includes(s.state) && !execution) return reject();
  return { ...s, plan, execution };
}
export function createTask(taskId: string): TaskState {
  if (!taskIdSchema.safeParse(taskId).success) return reject();
  return { taskId, state: "IDLE", iteration: 0, waitingFor: "NONE", plan: null, execution: null };
}
/** Pure reducer: validates observations, never sends, executes, persists or retries. */
export function transition(current: TaskState, input: TaskEvent): TaskState {
  try {
    const s = validateTaskState(current);
    const checked = eventSchema.safeParse(input);
    if (!checked.success) return reject();
    const event = checked.data;
    if (["DONE", "BLOCKED", "ERROR", "RECOVERY_REQUIRED"].includes(s.state)) return reject();
    let target: LocalState;
    if (event.type === "FAIL" || event.type === "REQUIRE_RECOVERY") {
      if (s.state === "IDLE") return reject();
      target = event.type === "FAIL" ? "ERROR" : "RECOVERY_REQUIRED";
    } else if (event.type === "START_EXECUTION") {
      if (s.state !== "PLAN_RECEIVED") return reject();
      target = "EXECUTING";
    } else if ("message" in event) {
      const m = event.message;
      formatMessage(m);
      if (m.taskId !== s.taskId) return reject();
      if (event.type === "SEND_INIT") {
        if (s.state !== "IDLE" || m.state !== "INIT") return reject();
        target = "INIT_SENT";
      } else if (event.type === "RECEIVE") {
        if (s.state !== "INIT_SENT" && s.state !== "EXECUTED_SENT") return reject();
        if (m.state === "PLAN") {
          if (m.iteration !== s.iteration + 1) return reject();
          s.iteration = m.iteration; s.plan = m; s.execution = null;
          target = "PLAN_RECEIVED";
        } else {
          if (m.iteration !== s.iteration) return reject();
          if (m.state === "DONE" && s.state === "EXECUTED_SENT") target = "DONE";
          else if (m.state === "BLOCKED" || m.state === "ERROR") target = m.state;
          else return reject();
        }
      } else {
        if (m.state !== "EXECUTED" || m.iteration !== s.iteration || m.planSha256 !== s.plan?.planSha256) return reject();
        if (event.type === "COMPLETE_EXECUTION") {
          if (s.state !== "EXECUTING") return reject();
          s.execution = m; target = "EXECUTED_LOCAL";
        } else {
          if (s.state !== "EXECUTED_LOCAL" || !s.execution || formatMessage(s.execution) !== formatMessage(m)) return reject();
          target = "EXECUTED_SENT";
        }
      }
    } else return reject();
    return validateTaskState({ ...s, state: target, waitingFor: waiting[target] });
  } catch { return reject(); }
}
