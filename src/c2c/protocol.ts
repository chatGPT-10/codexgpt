import { FIELD_LAYOUT, MAX_MESSAGE_BYTES, PREFIX, messageSchema, taskIdSchema, type C2CMessage, type MessageContext, type WebState } from "./types.js";

export class C2CProtocolError extends Error {
  constructor(public readonly code: "INVALID_MESSAGE" | "MESSAGE_TOO_LARGE" | "CONTEXT_MISMATCH" = "INVALID_MESSAGE") {
    super(`C2C protocol rejected: ${code}`);
    this.name = "C2CProtocolError";
  }
}

export function normalizeWire(value: unknown): string {
  if (typeof value !== "string") throw new C2CProtocolError();
  if (value.length > MAX_MESSAGE_BYTES || Buffer.byteLength(value, "utf8") > MAX_MESSAGE_BYTES) throw new C2CProtocolError("MESSAGE_TOO_LARGE");
  const text = value.replaceAll("\r\n", "\n");
  // Reject unpaired surrogates, C0/C1, bidi and invisible format controls.
  if (/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\p{Cf}\p{Cs}\u2028\u2029]/u.test(text)) throw new C2CProtocolError();
  return text;
}

function numeric(value: string): number {
  if (!/^(0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new C2CProtocolError();
  return Number(value);
}

/** Parse ONE trusted-source assistant message, never a page/transcript search. */
export function parseMessage(value: unknown, context: MessageContext): C2CMessage {
  if (!context || !taskIdSchema.safeParse(context.taskId).success || !Number.isSafeInteger(context.expectedIteration) || context.expectedIteration < 0) throw new C2CProtocolError("CONTEXT_MISMATCH");
  const text = normalizeWire(value);
  if (!text.startsWith(PREFIX + "\n") || text.indexOf(PREFIX, PREFIX.length) !== -1) throw new C2CProtocolError();
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const raw = new Map<string, string>();
  let bodyKey: string | null = null;
  for (const line of lines.slice(1)) {
    if (line === "") {
      if (bodyKey) raw.set(bodyKey, raw.get(bodyKey) + "\n");
      continue;
    }
    const match = /^([A-Z][A-Z0-9_]*):(?: (.+))?$/u.exec(line);
    if (match) {
      const [, key, content] = match;
      if (raw.has(key)) throw new C2CProtocolError();
      raw.set(key, content ?? "");
      bodyKey = content === undefined ? key : null;
    } else {
      if (!bodyKey || /^\s*(?:>|`|~|[A-Z][A-Z0-9_]*\s*:)/u.test(line)) throw new C2CProtocolError();
      raw.set(bodyKey, raw.get(bodyKey) + line + "\n");
    }
  }
  const state = raw.get("STATE") as WebState;
  if (!Object.hasOwn(FIELD_LAYOUT, state)) throw new C2CProtocolError();
  const layout: readonly (readonly [string, string, string])[] = [
    ["PROTOCOL", "protocol", "number"], ["STATE", "state", "scalar"],
    ["TASK_ID", "taskId", "scalar"], ["ITERATION", "iteration", "number"], ...FIELD_LAYOUT[state]
  ];
  if (raw.size !== layout.length) throw new C2CProtocolError();
  const result: Record<string, unknown> = {};
  for (const [header, property, kind] of layout) {
    const content = raw.get(header);
    if (content === undefined) throw new C2CProtocolError();
    if (kind !== "body" && (content.includes("\n") || content.trim() !== content)) throw new C2CProtocolError();
    result[property] = kind === "number" ? numeric(content) : kind === "body" ? content.replace(/\n+$/u, "") : content;
    if (typeof result[property] === "string" && !(result[property] as string).trim()) throw new C2CProtocolError();
    if (kind === "body" && (result[property] as string).split("\n").some(line => /^\s*(?:>|`|~|[A-Z][A-Z0-9_]*\s*:)/u.test(line))) throw new C2CProtocolError();
  }
  const parsed = messageSchema.safeParse(result);
  if (!parsed.success) throw new C2CProtocolError();
  if (parsed.data.taskId !== context.taskId || parsed.data.iteration !== context.expectedIteration) throw new C2CProtocolError("CONTEXT_MISMATCH");
  return parsed.data;
}
