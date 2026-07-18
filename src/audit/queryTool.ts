import { createHash } from "node:crypto";
import { canonicalJson } from "./canonicalJson.js";
import {
  queryAuditEventsInputV2Schema,
  queryAuditEventsResultV2Schema,
  queryAuditEventsInputV3Schema,
  queryAuditEventsResultV3Schema,
  queryAuditEventsInputV4Schema,
  queryAuditEventsResultV4Schema
} from "./schemas.js";
import type { PersistentAuditStore } from "./store.js";
import {
  AuditError,
  type QueryAuditEventsInputV2,
  type QueryAuditEventsResultV2,
  type QueryAuditEventsInputV3,
  type QueryAuditEventsResultV3,
  type QueryAuditEventsInputV4,
  type QueryAuditEventsResultV4
} from "./types.js";

export type AuditQueryHandlerV2 = (
  input: QueryAuditEventsInputV2
) => Promise<QueryAuditEventsResultV2>;

export type AuditQueryHandlerV3 = (
  input: QueryAuditEventsInputV3
) => Promise<QueryAuditEventsResultV3>;

export type AuditQueryHandlerV4 = (
  input: QueryAuditEventsInputV4
) => Promise<QueryAuditEventsResultV4>;

export function auditQueryFilterDigest(input: QueryAuditEventsInputV2): string {
  const parsed = queryAuditEventsInputV2Schema.parse(input);
  const sorted = <T extends string>(values: T[] | undefined): T[] | null =>
    values ? [...values].sort() : null;
  return createHash("sha256").update(canonicalJson({
    startTime: parsed.startTime ?? null,
    endTime: parsed.endTime ?? null,
    limit: parsed.limit ?? 50,
    eventTypes: sorted(parsed.eventTypes),
    toolNames: sorted(parsed.toolNames),
    requestIds: sorted(parsed.requestIds),
    changeSetIds: sorted(parsed.changeSetIds),
    workspaceRefs: sorted(parsed.workspaceRefs),
    statuses: sorted(parsed.statuses)
  }), "utf8").digest("hex");
}

export function auditQueryFilterDigestV3(input: QueryAuditEventsInputV3): string {
  const parsed = queryAuditEventsInputV3Schema.parse(input);
  const sorted = <T extends string>(values: T[] | undefined): T[] | null =>
    values ? [...values].sort() : null;
  return createHash("sha256")
    .update("audit-query-v3\0", "utf8")
    .update(canonicalJson({
      projectionVersion: 3,
      startTime: parsed.startTime ?? null,
      endTime: parsed.endTime ?? null,
      limit: parsed.limit ?? 50,
      eventTypes: sorted(parsed.eventTypes),
      toolNames: sorted(parsed.toolNames),
      requestIds: sorted(parsed.requestIds),
      changeSetIds: sorted(parsed.changeSetIds),
      workspaceRefs: sorted(parsed.workspaceRefs),
      statuses: sorted(parsed.statuses)
    }), "utf8")
    .digest("hex");
}

export function auditQueryFilterDigestV4(input: unknown): string {
  const parsed = queryAuditEventsInputV4Schema.parse(input);
  const sorted = <T extends string>(values: T[] | undefined): T[] | null =>
    values ? [...values].sort() : null;
  return createHash("sha256")
    .update("audit-query-v4\0", "utf8")
    .update(canonicalJson({
      projectionVersion: 4,
      startTime: parsed.startTime ?? null,
      endTime: parsed.endTime ?? null,
      limit: parsed.limit ?? 50,
      eventTypes: sorted(parsed.eventTypes),
      toolNames: sorted(parsed.toolNames),
      requestIds: sorted(parsed.requestIds),
      repositoryIds: sorted(parsed.repositoryIds),
      taskWorktreeIds: sorted(parsed.taskWorktreeIds),
      resultCodes: sorted(parsed.resultCodes)
    }), "utf8")
    .digest("hex");
}

export function createAuditQueryHandler(store: PersistentAuditStore): AuditQueryHandlerV2 {
  return async (input) => {
    const result = await store.query(input);
    await store.recordQuery(result.filterDigest, result.records.length);
    return result;
  };
}

export function createAuditQueryHandlerV3(store: PersistentAuditStore): AuditQueryHandlerV3 {
  return async (input) => {
    const result = await store.queryV3(input);
    await store.recordQuery(result.filterDigest, result.records.length);
    return result;
  };
}

export function createAuditQueryHandlerV4(store: PersistentAuditStore): AuditQueryHandlerV4 {
  return async (input) => {
    const result = await store.queryV4(input);
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

export async function queryAuditEventsV3(
  handler: AuditQueryHandlerV3,
  input: unknown
): Promise<QueryAuditEventsResultV3> {
  const parsed = queryAuditEventsInputV3Schema.safeParse(input);
  if (!parsed.success) {
    throw new AuditError("AUDIT_RANGE_INVALID", "Audit query input is invalid.");
  }
  return queryAuditEventsResultV3Schema.parse(await handler(parsed.data));
}

export async function queryAuditEventsV4(
  handler: AuditQueryHandlerV4,
  input: unknown
): Promise<QueryAuditEventsResultV4> {
  const parsed = queryAuditEventsInputV4Schema.safeParse(input);
  if (!parsed.success) {
    throw new AuditError(
      input && typeof input === "object" && "cursor" in input
        ? "AUDIT_CURSOR_INVALID"
        : "AUDIT_RANGE_INVALID",
      "Audit query input is invalid."
    );
  }
  return queryAuditEventsResultV4Schema.parse(await handler(parsed.data));
}

export function createDirectAuditQueryAdapterV3(
  handler: AuditQueryHandlerV3
): (input: unknown) => Promise<QueryAuditEventsResultV3> {
  return (input) => queryAuditEventsV3(handler, input);
}

export function createSupertoolAuditQueryAdapterV3(
  handler: AuditQueryHandlerV3
): (input: unknown) => Promise<QueryAuditEventsResultV3> {
  return (input) => queryAuditEventsV3(handler, input);
}

export function createDirectAuditQueryAdapterV4(
  handler: AuditQueryHandlerV4
): (input: unknown) => Promise<QueryAuditEventsResultV4> {
  return (input) => queryAuditEventsV4(handler, input);
}

export function createSupertoolAuditQueryAdapterV4(
  handler: AuditQueryHandlerV4
): (input: unknown) => Promise<QueryAuditEventsResultV4> {
  return (input) => queryAuditEventsV4(handler, input);
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
