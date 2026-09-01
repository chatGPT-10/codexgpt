import { readRuntimeConnection } from "../profileStore.js";
import type { RuntimeOwnershipSupervisor } from "./runtimeOwnership.js";

export type ObservedRuntimeState = "not_observed" | "external_runtime_observed";

export interface LifecycleStatusSnapshot {
  readonly controlPlane: "independent_loopback";
  readonly workspaceRoot: string;
  readonly runtimeState: ObservedRuntimeState;
  readonly observedRuntime: {
    readonly tunnel: string | null;
    readonly toolMode: string | null;
    readonly writeMode: string | null;
    readonly authMode: string | null;
  } | null;
  readonly lifecycleActions: "start_stop_restart_owned_only";
  readonly ownedRuntimeState: "none" | "owned_starting" | "owned_running" | "foreign_or_stale" | "exited";
}

export interface LifecycleStatusSource {
  snapshot(): Promise<LifecycleStatusSnapshot>;
}

function boundedValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 80 ? normalized : null;
}

export function createLifecycleStatusSource(
  workspaceRoot: string,
  ownership?: RuntimeOwnershipSupervisor
): LifecycleStatusSource {
  return Object.freeze({
    snapshot: async (): Promise<LifecycleStatusSnapshot> => {
      const runtime = readRuntimeConnection(workspaceRoot);
      const owned = ownership ? await ownership.snapshot() : { state: "none" as const, pid: null };
      const observed = Object.keys(runtime).length > 0;
      return {
        controlPlane: "independent_loopback",
        workspaceRoot,
        runtimeState: observed ? "external_runtime_observed" : "not_observed",
        observedRuntime: observed
          ? {
              tunnel: boundedValue(runtime.tunnel),
              toolMode: boundedValue(runtime.toolMode),
              writeMode: boundedValue(runtime.write),
              authMode: null
            }
          : null,
        lifecycleActions: "start_stop_restart_owned_only",
        ownedRuntimeState: owned.state
      };
    }
  });
}
