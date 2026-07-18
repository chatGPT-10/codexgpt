import { z } from "zod";
import {
  queryAuditEventsInputV2Schema,
  queryAuditEventsResultV2Schema,
  queryAuditEventsInputV3Schema,
  queryAuditEventsResultV3Schema,
  queryAuditEventsInputV4Schema,
  queryAuditEventsResultV4Schema
} from "../../audit/schemas.js";
import type {
  AuditErrorCode,
  QueryAuditEventsResultV2,
  QueryAuditEventsResultV3
} from "../../audit/types.js";
import { createToolMeta, toolMetaSchema } from "./common.js";

export const queryAuditEventsInputSchema = queryAuditEventsInputV2Schema;
export const queryAuditEventsDataSchema = queryAuditEventsResultV2Schema;
export const queryAuditEventsInputSchemaV3 = queryAuditEventsInputV3Schema;
export const queryAuditEventsDataSchemaV3 = queryAuditEventsResultV3Schema;
export const queryAuditEventsInputSchemaV4 = queryAuditEventsInputV4Schema;
export const queryAuditEventsDataSchemaV4 = queryAuditEventsResultV4Schema;

export const QUERY_AUDIT_EVENTS_ERROR_MESSAGES = Object.freeze({
  AUDIT_ACCESS_DENIED: "Audit access was denied.",
  AUDIT_RANGE_INVALID: "The audit query range or filters are invalid.",
  AUDIT_CURSOR_INVALID: "The audit query cursor is invalid or expired.",
  AUDIT_BUSY: "The audit store is busy. Retry after the active writer completes.",
  AUDIT_UNAVAILABLE: "The persistent audit store is unavailable.",
  AUDIT_INTEGRITY_FAILURE: "Persistent audit integrity verification failed.",
  AUDIT_RECORD_INVALID: "Persistent audit evidence is invalid.",
  INTERNAL_ERROR: "The audit query could not be completed because of an internal error."
} satisfies Record<AuditErrorCode, string>);

const retryableByCode: Readonly<Record<AuditErrorCode, boolean>> = Object.freeze({
  AUDIT_ACCESS_DENIED: false,
  AUDIT_RANGE_INVALID: false,
  AUDIT_CURSOR_INVALID: false,
  AUDIT_BUSY: true,
  AUDIT_UNAVAILABLE: true,
  AUDIT_INTEGRITY_FAILURE: false,
  AUDIT_RECORD_INVALID: false,
  INTERNAL_ERROR: false
});

const auditQueryErrorCodeSchema = z.enum(
  Object.keys(QUERY_AUDIT_EVENTS_ERROR_MESSAGES) as [AuditErrorCode, ...AuditErrorCode[]]
);

export const queryAuditEventsErrorSchema = z.object({
  code: auditQueryErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.object({}).strict()
}).strict().superRefine((value, context) => {
  if (value.message !== QUERY_AUDIT_EVENTS_ERROR_MESSAGES[value.code]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["message"],
      message: "Audit query error message is not canonical."
    });
  }
  if (value.retryable !== retryableByCode[value.code]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["retryable"],
      message: "Audit query retryability is not canonical."
    });
  }
});

export const queryAuditEventsOutputShape = {
  codexpro_tool: z.literal("query_audit_events"),
  codexpro_title: z.literal("Query Audit Events"),
  ok: z.boolean(),
  data: queryAuditEventsDataSchema.nullable(),
  error: queryAuditEventsErrorSchema.nullable(),
  meta: toolMetaSchema
};

const queryAuditEventsOutputBaseSchema = z.object(queryAuditEventsOutputShape).strict();

export const queryAuditEventsOutputSchema = queryAuditEventsOutputBaseSchema.superRefine(
  (value, context) => {
    if (value.ok) {
      if (value.data === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data"],
          message: "Successful audit queries require data."
        });
      }
      if (value.error !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "Successful audit queries require no error."
        });
      }
      return;
    }
    if (value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "Failed audit queries cannot return data."
      });
    }
    if (value.error === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed audit queries require an error."
      });
    }
  }
);

export type QueryAuditEventsStructuredResult = z.infer<typeof queryAuditEventsOutputBaseSchema>;

export function createQueryAuditEventsSuccess(
  data: QueryAuditEventsResultV2,
  durationMs = 0
): QueryAuditEventsStructuredResult {
  return queryAuditEventsOutputSchema.parse({
    codexpro_tool: "query_audit_events",
    codexpro_title: "Query Audit Events",
    ok: true,
    data,
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createQueryAuditEventsFailure(
  code: AuditErrorCode,
  durationMs = 0
): QueryAuditEventsStructuredResult {
  return queryAuditEventsOutputSchema.parse({
    codexpro_tool: "query_audit_events",
    codexpro_title: "Query Audit Events",
    ok: false,
    data: null,
    error: {
      code,
      message: QUERY_AUDIT_EVENTS_ERROR_MESSAGES[code],
      retryable: retryableByCode[code],
      details: {}
    },
    meta: createToolMeta(durationMs)
  });
}

export const queryAuditEventsOutputShapeV3 = {
  codexpro_tool: z.literal("query_audit_events"),
  codexpro_title: z.literal("Query Audit Events"),
  ok: z.boolean(),
  data: queryAuditEventsDataSchemaV3.nullable(),
  error: queryAuditEventsErrorSchema.nullable(),
  meta: toolMetaSchema
};

const queryAuditEventsOutputBaseSchemaV3 = z.object(queryAuditEventsOutputShapeV3).strict();

export const queryAuditEventsOutputSchemaV3 = queryAuditEventsOutputBaseSchemaV3.superRefine(
  (value, context) => {
    if (value.ok && (value.data === null || value.error !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Successful V3 audit queries require data and no error." });
    }
    if (!value.ok && (value.data !== null || value.error === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Failed V3 audit queries require an error and no data." });
    }
  }
);

export type QueryAuditEventsStructuredResultV3 = z.infer<typeof queryAuditEventsOutputBaseSchemaV3>;

export function createQueryAuditEventsSuccessV3(
  data: QueryAuditEventsResultV3,
  durationMs = 0
): QueryAuditEventsStructuredResultV3 {
  return queryAuditEventsOutputSchemaV3.parse({
    codexpro_tool: "query_audit_events",
    codexpro_title: "Query Audit Events",
    ok: true,
    data,
    error: null,
    meta: createToolMeta(durationMs)
  });
}

export function createQueryAuditEventsFailureV3(
  code: AuditErrorCode,
  durationMs = 0
): QueryAuditEventsStructuredResultV3 {
  return queryAuditEventsOutputSchemaV3.parse({
    codexpro_tool: "query_audit_events",
    codexpro_title: "Query Audit Events",
    ok: false,
    data: null,
    error: {
      code,
      message: QUERY_AUDIT_EVENTS_ERROR_MESSAGES[code],
      retryable: retryableByCode[code],
      details: {}
    },
    meta: createToolMeta(durationMs)
  });
}

export const queryAuditEventsOutputShapeV4 = {
  codexpro_tool: z.literal("query_audit_events"),
  codexpro_title: z.literal("Query Audit Events"),
  ok: z.boolean(),
  data: queryAuditEventsDataSchemaV4.nullable(),
  error: queryAuditEventsErrorSchema.nullable(),
  meta: toolMetaSchema
};

const queryAuditEventsOutputBaseSchemaV4 = z.object(queryAuditEventsOutputShapeV4).strict();

export const queryAuditEventsOutputSchemaV4 = queryAuditEventsOutputBaseSchemaV4.superRefine(
  (value, context) => {
    if (value.ok && (value.data === null || value.error !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Successful V4 audit queries require data and no error." });
    }
    if (!value.ok && (value.data !== null || value.error === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Failed V4 audit queries require an error and no data." });
    }
  }
);

export function createQueryAuditEventsUnavailableV4(durationMs = 0) {
  return queryAuditEventsOutputSchemaV4.parse({
    codexpro_tool: "query_audit_events",
    codexpro_title: "Query Audit Events",
    ok: false,
    data: null,
    error: {
      code: "AUDIT_UNAVAILABLE",
      message: QUERY_AUDIT_EVENTS_ERROR_MESSAGES.AUDIT_UNAVAILABLE,
      retryable: true,
      details: {}
    },
    meta: createToolMeta(durationMs)
  });
}
