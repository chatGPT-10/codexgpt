import type { PathGuard } from "../guard.js";
import { ToolExecutionPipeline } from "./executionPipeline.js";

const pipelinesByGuard = new WeakMap<PathGuard, ToolExecutionPipeline>();

/**
 * Return the execution pipeline owned by one server's PathGuard instance.
 *
 * createCodexGPTServer creates one PathGuard per server, so using it as the
 * WeakMap owner keeps hooks isolated between server instances without adding
 * global mutable state or changing the public server dependency contract.
 */
export function toolExecutionPipelineForGuard(guard: PathGuard): ToolExecutionPipeline {
  let pipeline = pipelinesByGuard.get(guard);
  if (pipeline === undefined) {
    pipeline = new ToolExecutionPipeline();
    pipelinesByGuard.set(guard, pipeline);
  }
  return pipeline;
}
