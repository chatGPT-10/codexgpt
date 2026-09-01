import type { ToolDefinition, ToolExecutionContext } from "./definition.js";
import {
  canonicalToolFailure,
  canonicalToolSuccess,
  type CanonicalToolResult,
  type ToolRuntimeStage
} from "./result.js";

type MaybePromise<T> = T | Promise<T>;

export class ToolRuntimeStageError extends Error {
  readonly code = "TOOL_RUNTIME_STAGE_FAILED";

  constructor(readonly stage: ToolRuntimeStage, readonly cause: unknown) {
    super(`Tool runtime stage failed: ${stage}`, { cause });
    this.name = "ToolRuntimeStageError";
  }
}

export interface ToolRuntimePipelineAdapters<TWorkspace = unknown, TRendered = unknown> {
  authorize(context: ToolExecutionContext<TWorkspace> & { definition: ToolDefinition<any, any, TWorkspace>; input: unknown }): MaybePromise<void>;
  resolveWorkspace(context: ToolExecutionContext<TWorkspace> & { definition: ToolDefinition<any, any, TWorkspace>; input: unknown }): MaybePromise<TWorkspace | undefined>;
  policy(
    context: ToolExecutionContext<TWorkspace> & { definition: ToolDefinition<any, any, TWorkspace>; input: unknown },
    next: () => Promise<unknown>
  ): MaybePromise<unknown>;
  approve(context: ToolExecutionContext<TWorkspace> & { definition: ToolDefinition<any, any, TWorkspace>; input: unknown }): MaybePromise<void>;
  audit(
    context: ToolExecutionContext<TWorkspace> & { definition: ToolDefinition<any, any, TWorkspace>; input: unknown },
    outcome: CanonicalToolResult
  ): MaybePromise<void>;
  render<T>(
    context: ToolExecutionContext<TWorkspace> & { definition: ToolDefinition<any, any, TWorkspace>; input: unknown },
    outcome: CanonicalToolResult<T>
  ): MaybePromise<TRendered>;
}

interface ExecuteOptions {
  readonly signal?: AbortSignal;
  readonly extra?: unknown;
}

export class ToolExecutionCoordinator {
  private exclusiveTail: Promise<void> = Promise.resolve();

  async run<T>(mode: "parallel" | "exclusive", task: () => Promise<T>): Promise<T> {
    if (mode === "parallel") return task();
    const predecessor = this.exclusiveTail;
    let release!: () => void;
    this.exclusiveTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await predecessor;
    try {
      return await task();
    } finally {
      release();
    }
  }
}

function stageError(stage: ToolRuntimeStage, error: unknown): ToolRuntimeStageError {
  return error instanceof ToolRuntimeStageError ? error : new ToolRuntimeStageError(stage, error);
}

export class ToolRuntimePipeline<TWorkspace = unknown, TRendered = unknown> {
  constructor(
    private readonly adapters: ToolRuntimePipelineAdapters<TWorkspace, TRendered>,
    private readonly coordinator = new ToolExecutionCoordinator()
  ) {}

  async execute<I, O>(
    definition: ToolDefinition<I, O, TWorkspace>,
    rawInput: unknown,
    options: ExecuteOptions = {}
  ): Promise<TRendered> {
    const startedAt = Date.now();
    let failedStage: ToolRuntimeStage = "authorization";
    let context = Object.freeze({
      definition,
      input: rawInput,
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
      ...(options.extra !== undefined ? { extra: options.extra } : {})
    }) as ToolExecutionContext<TWorkspace> & {
      definition: ToolDefinition<I, O, TWorkspace>;
      input: unknown;
    };
    let outcome: CanonicalToolResult<O>;

    try {
      options.signal?.throwIfAborted();
      failedStage = "authorization";
      await this.adapters.authorize(context);

      options.signal?.throwIfAborted();
      failedStage = "workspace";
      const workspace = definition.workspace === "none"
        ? undefined
        : await this.adapters.resolveWorkspace(context);
      if (definition.workspace === "required" && workspace === undefined) {
        throw new Error(`Tool ${definition.name} requires a workspace.`);
      }
      context = Object.freeze({
        ...context,
        ...(workspace !== undefined ? { workspace } : {})
      });

      options.signal?.throwIfAborted();
      const value = await this.coordinator.run(definition.execution, async () => {
        options.signal?.throwIfAborted();
        failedStage = "policy";
        return this.adapters.policy(context, async () => {
          options.signal?.throwIfAborted();
          failedStage = "approval";
          await this.adapters.approve(context);

          options.signal?.throwIfAborted();
          failedStage = "execute";
          const parsed = definition.inputSchema.parse(rawInput);
          const executed = await definition.handler(parsed, context);
          return definition.outputSchema.parse(executed);
        });
      });
      outcome = canonicalToolSuccess(value as O, Date.now() - startedAt);
    } catch (error) {
      outcome = canonicalToolFailure(stageError(failedStage, error), Date.now() - startedAt, failedStage);
    }

    try {
      await this.adapters.audit(context, outcome);
    } catch (error) {
      if (outcome.ok) {
        outcome = canonicalToolFailure(stageError("audit", error), Date.now() - startedAt, "audit");
      }
    }

    return this.adapters.render(context, outcome);
  }
}

export { ToolRuntimePipeline as ToolExecutionPipeline };
