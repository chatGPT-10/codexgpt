export type ToolRuntimeStage =
  | "authorization"
  | "workspace"
  | "policy"
  | "approval"
  | "execute"
  | "audit"
  | "render";

export type CanonicalToolResult<T = unknown> =
  | Readonly<{
      ok: true;
      value: T;
      durationMs: number;
      failedStage: null;
    }>
  | Readonly<{
      ok: false;
      error: unknown;
      durationMs: number;
      failedStage: ToolRuntimeStage;
    }>;

export interface CanonicalToolResultRenderer<T, R> {
  success(value: T, meta: { durationMs: number; failedStage: null }): R | Promise<R>;
  failure(error: unknown, meta: { durationMs: number; failedStage: ToolRuntimeStage }): R | Promise<R>;
}

function boundedDuration(durationMs: number): number {
  return Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs)) : 0;
}

export function canonicalToolSuccess<T>(value: T, durationMs: number): CanonicalToolResult<T> {
  return Object.freeze({
    ok: true as const,
    value,
    durationMs: boundedDuration(durationMs),
    failedStage: null
  });
}

export function canonicalToolFailure(
  error: unknown,
  durationMs: number,
  failedStage: ToolRuntimeStage
): CanonicalToolResult<never> {
  return Object.freeze({
    ok: false as const,
    error,
    durationMs: boundedDuration(durationMs),
    failedStage
  });
}

export async function renderCanonicalToolResult<T, R>(
  result: CanonicalToolResult<T>,
  renderer: CanonicalToolResultRenderer<T, R>
): Promise<R> {
  return result.ok
    ? renderer.success(result.value, { durationMs: result.durationMs, failedStage: null })
    : renderer.failure(result.error, {
        durationMs: result.durationMs,
        failedStage: result.failedStage
      });
}
