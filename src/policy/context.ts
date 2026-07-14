import { requestContextV1Schema } from "./schemas.js";
import type { PolicySessionContextSource } from "./identity.js";
import type { RequestContextV1 } from "./types.js";

export interface PolicyRequestState {
  requestId: string;
  workspaceId: string | null;
  runtimeProfileId: string;
  permissionProfileId: string;
  policyRevision: string;
  sessionGrantRevision: string;
  receivedAt: string;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function createRequestContext(
  source: PolicySessionContextSource,
  state: PolicyRequestState
): RequestContextV1 {
  const transportSessionId = source.transportSessionId().trim();
  if (!transportSessionId || transportSessionId === "pending") {
    throw new Error("Policy transport session is not established.");
  }
  const context = requestContextV1Schema.parse({
    schemaVersion: 1,
    requestId: state.requestId,
    transportKind: source.transportKind,
    transportSessionId,
    identity: structuredClone(source.identity),
    workspaceId: state.workspaceId,
    runtimeProfileId: state.runtimeProfileId,
    permissionProfileId: state.permissionProfileId,
    policyRevision: state.policyRevision,
    sessionGrantRevision: state.sessionGrantRevision,
    receivedAt: state.receivedAt
  });
  return deepFreeze(context);
}
