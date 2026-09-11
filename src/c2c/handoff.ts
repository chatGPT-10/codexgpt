import { validateSession, sessionError, type C2CSession } from "./sessionSchema.js";
import { formatMessage } from "./messages.js";
import type { C2CMessage } from "./types.js";

/** A checkpoint projection, never a transcript or a recovery transition. */
export function buildHandoff(value: C2CSession): Extract<C2CMessage, { state: "HANDOFF" }> {
  const s = validateSession(value);
  if (s.endedAt || s.task.state === "DONE") return sessionError("TASK_ENDED");
  const message: Extract<C2CMessage, { state: "HANDOFF" }> = {
    protocol: 1, state: "HANDOFF", taskId: s.task.taskId, iteration: s.task.iteration,
    originalGoal: s.checkpoint.originalGoal, progress: s.checkpoint.completedSubtasks || "None recorded",
    currentState: s.task.state, knownIssues: s.checkpoint.knownIssues || "None recorded",
    nextExpectedStep: s.checkpoint.nextExpectedStep || "Inspect the saved checkpoint"
  };
  formatMessage(message);
  return message;
}
