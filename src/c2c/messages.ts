import { FIELD_LAYOUT, PREFIX, messageSchema, type C2CMessage } from "./types.js";
import { C2CProtocolError, normalizeWire, parseMessage } from "./protocol.js";

/** Canonical bare wire; rejects unsupported fields and ambiguous body syntax. */
export function formatMessage(value: C2CMessage): string {
  const parsed = messageSchema.safeParse(value);
  if (!parsed.success) throw new C2CProtocolError();
  const message = parsed.data;
  const lines = [PREFIX, `PROTOCOL: ${message.protocol}`, `STATE: ${message.state}`, `TASK_ID: ${message.taskId}`, `ITERATION: ${message.iteration}`];
  const fields = message as unknown as Record<string, unknown>;
  for (const [header, key, kind] of FIELD_LAYOUT[message.state]) {
    const content = String(fields[key]);
    if (kind === "body") {
      if (content !== content.trim() || content.includes(PREFIX) || content.split("\n").some(line => /^\s*(?:>|`|~|[A-Z][A-Z0-9_]*\s*:)/u.test(line))) throw new C2CProtocolError();
      lines.push("", `${header}:`, content);
    } else lines.push(`${header}: ${content}`);
  }
  const wire = lines.join("\n");
  normalizeWire(wire);
  const roundtrip = parseMessage(wire, { taskId: message.taskId, expectedIteration: message.iteration });
  if (JSON.stringify(roundtrip) !== JSON.stringify(message)) throw new C2CProtocolError();
  return wire;
}
