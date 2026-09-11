import { z } from "zod";
import { parseMessage } from "./protocol.js";
import { MAX_MESSAGE_BYTES, type C2CMessage, type MessageContext } from "./types.js";
import { assertSecretFree, conversationSchema } from "./sessionSchema.js";

const id = z.string().min(1).max(256);
const bindingSchema = z.object({ tabId: id, providerId: id, chatUrl: z.string().max(512) }).strict();
const baselineSchema = bindingSchema.extend({ lastAssistantId: id.nullable(), userMessageId: id }).strict();
const snapshotSchema = bindingSchema.extend({
  generating: z.boolean(), error: z.boolean(),
  messages: z.array(z.object({ id, role: z.enum(["user", "assistant"]), text: z.string().max(MAX_MESSAGE_BYTES) }).strict()).max(4)
}).strict();
export type BrowserBaseline = z.infer<typeof baselineSchema>;
export type BrowserSnapshot = z.infer<typeof snapshotSchema>;
export type Reply = { status: "waiting" } | { status: "complete"; wire: string; message: C2CMessage };
export class C2CBrowserError extends Error {
  constructor() { super("C2C browser observation rejected; inspect the bound conversation without resending"); this.name = "C2CBrowserError"; }
}
function reject(): never { throw new C2CBrowserError(); }

/** Only bounded DOM observations, never full transcripts or page scripts. The host
 * adapter supplies visible turn IDs and generation status from fresh DOM evidence.
 * This validator does not authenticate an arbitrary caller's claimed DOM data. */
export function inspectReply(value: unknown, binding: BrowserBaseline, context: MessageContext): Reply {
  try {
    const s = snapshotSchema.parse(value);
    const b = baselineSchema.parse(binding);
    conversationSchema.parse({ mode: "chat", projectUrl: null, chatUrl: b.chatUrl, connectorName: "browser" });
    if (s.tabId !== b.tabId || s.providerId !== b.providerId || s.chatUrl !== b.chatUrl || s.error) return reject();
    if (new Set(s.messages.map(m => m.id)).size !== s.messages.length) return reject();
    const sent = s.messages.findIndex(m => m.id === b.userMessageId && m.role === "user");
    if (sent < 0) return reject();
    const replies = s.messages.slice(sent + 1);
    if (replies.some(m => m.role !== "assistant" || m.id === b.lastAssistantId) || replies.length > 1) return reject();
    if (s.generating || replies.length === 0) return { status: "waiting" };
    const wire = replies[0]!.text;
    assertSecretFree(wire);
    const message = parseMessage(wire, context);
    if (!["PLAN", "DONE", "BLOCKED", "ERROR"].includes(message.state)) return reject();
    return { status: "complete", wire, message };
  } catch { return reject(); }
}

/** A timeout is observational. There is deliberately no send/retry operation. */
export async function pollReply(
  port: { read(): Promise<unknown>; wait(ms: number): Promise<void> },
  binding: BrowserBaseline, context: MessageContext,
  options: { attempts?: number; intervalMs?: number } = {}
): Promise<Exclude<Reply, { status: "waiting" }> | { status: "pending" }> {
  const attempts = options.attempts ?? 6;
  const intervalMs = options.intervalMs ?? 5000;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 12 || !Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 5000 || (attempts - 1) * intervalMs > 55000) return reject();
  for (let index = 0; index < attempts; index++) {
    const result = inspectReply(await port.read(), binding, context);
    if (result.status === "complete") return result;
    if (index + 1 < attempts) await port.wait(intervalMs);
  }
  return { status: "pending" };
}
