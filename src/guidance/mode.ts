export type GuidanceMode = "legacy" | "standard";
export type GuidanceReadiness = "not_ready" | "preview" | "ready";

// Phase 6A6 changes this single constant after every standard-mode gate passes.
export const DEFAULT_GUIDANCE_MODE: GuidanceMode = "standard";
export const STANDARD_GUIDANCE_READINESS: GuidanceReadiness = "ready";

export function resolveGuidanceMode(value: string | undefined): GuidanceMode {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return DEFAULT_GUIDANCE_MODE;
  if (normalized === "legacy" || normalized === "standard") return normalized;
  throw new Error("CODEXGPT_GUIDANCE_MODE must be legacy or standard.");
}

export function guidanceReadiness(mode: GuidanceMode): GuidanceReadiness {
  return mode === "standard" ? STANDARD_GUIDANCE_READINESS : "not_ready";
}

export function guidanceRuntimeState(mode: GuidanceMode): {
  mode: GuidanceMode;
  readiness: GuidanceReadiness;
} {
  return { mode, readiness: guidanceReadiness(mode) };
}
