export type AcceptedHttpAuthenticationMode = "loopback_none" | "query_token" | "bearer";

export function acceptedAuthenticationMode(input: {
  authConfigured: boolean;
  bearerMatched: boolean;
  queryMatched: boolean;
}): AcceptedHttpAuthenticationMode {
  if (!input.authConfigured) return "loopback_none";
  if (input.bearerMatched) return "bearer";
  if (input.queryMatched) return "query_token";
  throw new Error("The HTTP request is not authenticated.");
}
