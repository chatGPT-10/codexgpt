import { z } from "zod";
import { parseStrictJsonObject } from "../process/windowsHostProtocol.js";
import { C2CSessionStore, type SessionStoreOptions } from "./sessionStore.js";
import { C2CSessionError, conversationSchema, executionReport, type C2CSession } from "./sessionSchema.js";
import { C2CProtocolError, parseMessage } from "./protocol.js";
import { formatMessage } from "./messages.js";
import { taskIdSchema, type C2CMessage } from "./types.js";
import { transition, type TaskState } from "./stateMachine.js";
import { inspectReply, type BrowserBaseline } from "./browserExchange.js";
import { loadConfig } from "../config.js";
import { checkSummarySchema, C2CEvidenceError } from "./executionEvidence.js";
import type { PlanSnapshot } from "./planSnapshot.js";

export const MAX_CLI_REQUEST_BYTES = 65_536;
const revision = z.number().int().positive().safe();
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("begin"), expectedRevision: revision.nullable(), input: z.object({ taskId: taskIdSchema, workspaceId: z.string(), originalGoal: z.string(), conversation: conversationSchema }).strict() }).strict(),
  z.object({ action: z.literal("prepare-init"), taskId: taskIdSchema, revision }).strict(),
  z.object({ action: z.literal("execution-start"), taskId: taskIdSchema, revision }).strict(),
  z.object({ action: z.literal("execution-finish"), taskId: taskIdSchema, revision, checks: z.array(checkSummarySchema).min(1).max(32) }).strict(),
  z.object({ action: z.literal("prepare-executed"), taskId: taskIdSchema, revision }).strict(),
  z.object({ action: z.literal("receive"), taskId: taskIdSchema, revision, wire: z.string() }).strict(),
  z.object({ action: z.literal("observe"), taskId: taskIdSchema, revision, baseline: z.unknown(), snapshot: z.unknown() }).strict()
]);
type Result = { ok: true; session: C2CSession | null; wire?: string; planSnapshot?: PlanSnapshot; report?: string; observation?: "waiting" | "complete" } | { ok: false; error: string };

/** Context comes from persisted state; wire text never chooses the expected iteration. */
export function parseIncomingMessage(task: TaskState, wire: string): C2CMessage {
  for (const expectedIteration of [task.iteration, task.iteration + 1]) {
    try {
      const message = parseMessage(wire, { taskId: task.taskId, expectedIteration });
      if (task.state === "EXECUTED_SENT" && message.state === "PLAN") throw new C2CProtocolError();
      transition(task, { type: "RECEIVE", message });
      return message;
    } catch { /* Only these two bounded contexts are eligible. */ }
  }
  throw new C2CProtocolError();
}

export async function executeSessionRequest(root: string, bytes: Buffer, options: SessionStoreOptions = {}): Promise<Result> {
  try {
    const request = requestSchema.parse(parseStrictJsonObject(bytes, { maxBytes: MAX_CLI_REQUEST_BYTES, maxDepth: 6, maxKeys: 128, maxStringLength: 32768 }));
    const store = new C2CSessionStore(root, options);
    if (request.action === "status") return { ok: true, session: store.load() };
    if (request.action === "begin") return { ok: true, session: await store.begin(request.input, request.expectedRevision) };
    const current = store.resume(request.taskId);
    if (current.revision !== request.revision) throw new C2CSessionError("REVISION_CONFLICT");
    if (request.action === "execution-start") {
      const started = await store.startExecution(request.revision, request.taskId, loadConfig(["--root", root]), true);
      return { ok: true, ...started };
    }
    if (request.action === "execution-finish") {
      const session = await store.finishExecution(request.revision, request.taskId, request.checks, loadConfig(["--root", root]));
      return { ok: true, session, report: executionReport(session) };
    }
    if (request.action === "prepare-executed") {
      const session = await store.prepareExecuted(request.revision, request.taskId, loadConfig(["--root", root]), executionReport(current));
      return { ok: true, session, wire: formatMessage(session.task.execution!) };
    }
    if (request.action === "observe") {
      const baseline = request.baseline as BrowserBaseline;
      if (!["INIT_SENT", "EXECUTED_SENT"].includes(current.task.state) || !baseline || current.conversation.chatUrl !== baseline.chatUrl) throw new C2CSessionError("INVALID_OBSERVATION");
      for (const expectedIteration of [current.task.iteration, current.task.iteration + 1]) {
        let reply;
        try { reply = inspectReply(request.snapshot, baseline, { taskId: current.task.taskId, expectedIteration }); }
        catch { continue; }
        if (reply.status === "waiting") return { ok: true, session: current, observation: "waiting" };
        const allowed = current.task.state === "INIT_SENT" ? ["PLAN", "BLOCKED", "ERROR"] : ["DONE", "BLOCKED", "ERROR"];
        if (!allowed.includes(reply.message.state)) break;
        assertReview(current, reply.message);
        const session = await store.advance(request.revision, request.taskId, { type: "RECEIVE", message: reply.message });
        return { ok: true, session, observation: "complete" };
      }
      throw new C2CSessionError("INVALID_OBSERVATION");
    }
    if (request.action === "prepare-init") {
      const message = { protocol: 1 as const, state: "INIT" as const, taskId: current.task.taskId, iteration: 0 as const, workspaceId: current.workspaceId, goal: current.checkpoint.originalGoal };
      const wire = formatMessage(message);
      // Durable at-most-once reservation, not proof of browser delivery. Never regenerate on retry.
      const session = await store.advance(request.revision, request.taskId, { type: "SEND_INIT", message });
      return { ok: true, session, wire };
    }
    const message = parseIncomingMessage(current.task, request.wire);
    assertReview(current, message);
    return { ok: true, session: await store.advance(request.revision, request.taskId, { type: "RECEIVE", message }) };
  } catch (error) {
    return { ok: false, error: error instanceof C2CSessionError || error instanceof C2CProtocolError || error instanceof C2CEvidenceError ? error.code : "INVALID_REQUEST" };
  }
}

function assertReview(session: C2CSession, message: C2CMessage): void {
  if (message.state !== "DONE") return;
  const checks = session.executionRecord?.checks;
  if (!checks?.some(c => c.status === "passed") || checks.some(c => !["passed", "skipped"].includes(c.status))) throw new C2CSessionError("CHECKS_NOT_PASSED");
}

export async function runSessionCli(args: string[]): Promise<void> {
  let result: Result;
  try {
    if (args.length !== 2 || args[0] !== "--root" || !args[1]) throw new Error();
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_CLI_REQUEST_BYTES) throw new Error();
      chunks.push(bytes);
    }
    result = await executeSessionRequest(args[1], Buffer.concat(chunks));
  } catch { result = { ok: false, error: "INVALID_REQUEST" }; }
  const output = JSON.stringify(result);
  // Session storage is bounded; this additionally bounds the JSON envelope and INIT wire.
  if (Buffer.byteLength(output) > 131072) result = { ok: false, error: "OUTPUT_TOO_LARGE" };
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode = result.ok ? 0 : 1;
}
