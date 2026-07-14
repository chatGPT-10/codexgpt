import {
  queryAuditEventsInputV2Schema,
  queryAuditEventsResultV2Schema
} from "./schemas.js";
import type { PersistentAuditStore } from "./store.js";
import {
  AuditError,
  type QueryAuditEventsInputV2,
  type QueryAuditEventsResultV2
} from "./types.js";

export type AuditQueryHandlerV2 = (
  input: QueryAuditEventsInputV2
) => Promise<QueryAuditEventsResultV2>;

export function createAuditQueryHandler(store: PersistentAuditStore): AuditQueryHandlerV2 {
  return async (input) => {
    const result = await store.query(input);
    await store.recordQuery(result.filterDigest, result.records.length);
    return result;
  };
}

export async function queryAuditEventsV2(
  handler: AuditQueryHandlerV2,
  input: unknown
): Promise<QueryAuditEventsResultV2> {
  const parsed = queryAuditEventsInputV2Schema.safeParse(input);
  if (!parsed.success) {
    throw new AuditError("AUDIT_RANGE_INVALID", "Audit query input is invalid.");
  }
  return queryAuditEventsResultV2Schema.parse(await handler(parsed.data));
}

export function createDirectAuditQueryAdapterV2(
  handler: AuditQueryHandlerV2
): (input: unknown) => Promise<QueryAuditEventsResultV2> {
  return (input) => queryAuditEventsV2(handler, input);
}

export function createSupertoolAuditQueryAdapterV2(
  handler: AuditQueryHandlerV2
): (input: unknown) => Promise<QueryAuditEventsResultV2> {
  return (input) => queryAuditEventsV2(handler, input);
}
