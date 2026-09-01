import type { PathGuard } from "../guard.js";
import { ToolExecutionPipeline } from "./executionPipeline.js";

const PIPELINE_SLOT = Symbol.for("codexgpt.internal.toolExecutionPipeline.v1");

/**
 * Return the execution pipeline owned by one server's PathGuard instance.
 *
 * createCodexGPTServer creates one PathGuard per server. Store the pipeline on
 * that owner rather than in module-local state so equivalent ESM/TS loader
 * identities converge on the same per-server pipeline. The symbol slot is
 * non-enumerable and immutable; no process-wide pipeline singleton is created.
 */
export function toolExecutionPipelineForGuard(guard: PathGuard): ToolExecutionPipeline {
  const existing = Reflect.get(guard, PIPELINE_SLOT) as ToolExecutionPipeline | undefined;
  if (existing !== undefined) return existing;

  const pipeline = new ToolExecutionPipeline();
  Object.defineProperty(guard, PIPELINE_SLOT, {
    value: pipeline,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return pipeline;
}
