type MaybePromise<T> = T | Promise<T>;

/**
 * Immutable cross-cutting identity for one tool execution.
 *
 * This foundation slice intentionally does not clone or deep-freeze arguments.
 * Existing MCP validation and domain services remain authoritative for argument
 * semantics; the pipeline only protects its own execution envelope.
 */
export interface ToolPipelineExecution {
  readonly toolName: string;
  readonly arguments: unknown;
  readonly signal?: AbortSignal;
}

/** Canonical execution outcome observed by post/final/final-observer stages. */
export type ToolPipelineOutcome<T = unknown> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: unknown }>;

/** Extensible policy may allow or deny, but may not rewrite call arguments. */
export type ToolPipelinePreDecision =
  | Readonly<{ kind: "allow" }>
  | Readonly<{ kind: "deny"; reason: string }>;

/** Post policy may preserve the result or fail the call closed. */
export type ToolPipelinePostDecision =
  | Readonly<{ kind: "accept" }>
  | Readonly<{ kind: "deny"; reason: string }>;

export type ToolPipelinePreHook = (
  execution: Readonly<ToolPipelineExecution>
) => MaybePromise<ToolPipelinePreDecision>;

/**
 * Monotonic owner guard. Returning a reason denies the call; no guard can
 * force-allow a call denied by another guard.
 */
export type ToolPipelineGuard = (
  execution: Readonly<ToolPipelineExecution>
) => string | undefined;

/** Around-dispatch middleware for timeout, retry, metrics, or replay. */
export type ToolPipelineAroundHook = (
  execution: Readonly<ToolPipelineExecution>,
  next: () => Promise<unknown>
) => MaybePromise<unknown>;

export type ToolPipelinePostHook = (
  execution: Readonly<ToolPipelineExecution>,
  outcome: ToolPipelineOutcome
) => MaybePromise<ToolPipelinePostDecision | void>;

/**
 * Tool-owned last boundary. It is intentionally synchronous, matching the DSH
 * content-finalizer idea while keeping asynchronous work inside dispatch/post.
 */
export type ToolPipelineFinalizer<T> = (
  execution: Readonly<ToolPipelineExecution>,
  outcome: ToolPipelineOutcome<T>
) => ToolPipelineOutcome<T>;

/** Observe the authoritative final outcome without an error channel into it. */
export type ToolPipelineObserver = (
  execution: Readonly<ToolPipelineExecution>,
  outcome: ToolPipelineOutcome
) => MaybePromise<void>;

export interface ToolPipelineRequest<T> {
  readonly toolName: string;
  readonly arguments: unknown;
  readonly signal?: AbortSignal;
  readonly body: (
    execution: Readonly<ToolPipelineExecution>
  ) => MaybePromise<T>;
  readonly finalize?: ToolPipelineFinalizer<T>;
}

export interface ToolExecutionPipelineOptions {
  /** Diagnostics only. Throwing here is contained like an observer failure. */
  readonly onObserverError?: (
    error: unknown,
    execution: Readonly<ToolPipelineExecution>
  ) => void;
}

export type ToolPipelineDenialStage = "pre" | "guard" | "post";

/** Stable internal failure for an explicit pipeline denial. */
export class ToolPipelineDeniedError extends Error {
  readonly code = "TOOL_PIPELINE_DENIED";

  constructor(
    readonly toolName: string,
    readonly stage: ToolPipelineDenialStage,
    readonly reason: string
  ) {
    super(`Tool execution denied during ${stage} for "${toolName}": ${reason}`);
    this.name = "ToolPipelineDeniedError";
  }
}

/** Fail-closed error for malformed extension-point output. */
export class ToolPipelineProtocolError extends Error {
  readonly code = "TOOL_PIPELINE_PROTOCOL_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ToolPipelineProtocolError";
  }
}

interface HookRegistration<T> {
  readonly hook: T;
}

function success<T>(value: T): ToolPipelineOutcome<T> {
  return Object.freeze({ ok: true as const, value });
}

function failure(error: unknown): ToolPipelineOutcome<never> {
  return Object.freeze({ ok: false as const, error });
}

function nonEmptyReason(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolPipelineProtocolError(`${label} must provide a non-empty denial reason.`);
  }
  return value;
}

function normalizePreDecision(candidate: unknown): ToolPipelinePreDecision {
  if (typeof candidate !== "object" || candidate === null || !("kind" in candidate)) {
    throw new ToolPipelineProtocolError("Pre-execute hook returned an invalid decision.");
  }
  const kind = (candidate as { kind?: unknown }).kind;
  if (kind === "allow") return Object.freeze({ kind: "allow" as const });
  if (kind === "deny") {
    return Object.freeze({
      kind: "deny" as const,
      reason: nonEmptyReason((candidate as { reason?: unknown }).reason, "Pre-execute hook")
    });
  }
  throw new ToolPipelineProtocolError("Pre-execute hook returned an unknown decision kind.");
}

function normalizePostDecision(candidate: unknown): ToolPipelinePostDecision {
  if (candidate === undefined) return Object.freeze({ kind: "accept" as const });
  if (typeof candidate !== "object" || candidate === null || !("kind" in candidate)) {
    throw new ToolPipelineProtocolError("Post-execute hook returned an invalid decision.");
  }
  const kind = (candidate as { kind?: unknown }).kind;
  if (kind === "accept") return Object.freeze({ kind: "accept" as const });
  if (kind === "deny") {
    return Object.freeze({
      kind: "deny" as const,
      reason: nonEmptyReason((candidate as { reason?: unknown }).reason, "Post-execute hook")
    });
  }
  throw new ToolPipelineProtocolError("Post-execute hook returned an unknown decision kind.");
}

function normalizeOutcome<T>(candidate: unknown): ToolPipelineOutcome<T> {
  if (typeof candidate !== "object" || candidate === null || !("ok" in candidate)) {
    throw new ToolPipelineProtocolError("Tool finalizer returned an invalid outcome.");
  }
  const record = candidate as { ok?: unknown; value?: unknown; error?: unknown };
  if (record.ok === true && Object.hasOwn(candidate, "value")) {
    return success(record.value as T);
  }
  if (record.ok === false && Object.hasOwn(candidate, "error")) {
    return failure(record.error);
  }
  throw new ToolPipelineProtocolError("Tool finalizer returned an inconsistent outcome.");
}

/**
 * Minimal DSH-inspired execution pipeline for CodexGPT.
 *
 * Ordering is fixed:
 *   pre -> monotonic guards -> around/body -> post -> tool finalizer -> observe
 *
 * The class does not own OAuth, workspace authorization, path policy, audit, or
 * MCP schemas. Those existing CodexGPT security boundaries stay authoritative;
 * this is only the cross-cutting execution orchestration seam they can migrate
 * through incrementally.
 */
export class ToolExecutionPipeline {
  private readonly preHooks: HookRegistration<ToolPipelinePreHook>[] = [];
  private readonly guards: HookRegistration<ToolPipelineGuard>[] = [];
  private readonly aroundHooks: HookRegistration<ToolPipelineAroundHook>[] = [];
  private readonly postHooks: HookRegistration<ToolPipelinePostHook>[] = [];
  private readonly observers: HookRegistration<ToolPipelineObserver>[] = [];
  private readonly onObserverError?: ToolExecutionPipelineOptions["onObserverError"];

  constructor(options: ToolExecutionPipelineOptions = {}) {
    this.onObserverError = options.onObserverError;
  }

  usePre(hook: ToolPipelinePreHook): () => void {
    return this.register(this.preHooks, hook);
  }

  useGuard(guard: ToolPipelineGuard): () => void {
    return this.register(this.guards, guard);
  }

  useAround(hook: ToolPipelineAroundHook): () => void {
    return this.register(this.aroundHooks, hook);
  }

  usePost(hook: ToolPipelinePostHook): () => void {
    return this.register(this.postHooks, hook);
  }

  observe(observer: ToolPipelineObserver): () => void {
    return this.register(this.observers, observer);
  }

  async execute<T>(request: ToolPipelineRequest<T>): Promise<T> {
    if (typeof request.toolName !== "string" || request.toolName.trim().length === 0) {
      throw new ToolPipelineProtocolError("toolName must be a non-empty string.");
    }

    const execution = Object.freeze({
      toolName: request.toolName,
      arguments: request.arguments,
      ...(request.signal !== undefined ? { signal: request.signal } : {})
    }) satisfies Readonly<ToolPipelineExecution>;

    // A call owns one stable extension snapshot. Registration/disposal affects
    // later calls and cannot splice policy into the middle of an in-flight one.
    const preHooks = this.snapshot(this.preHooks);
    const guards = this.snapshot(this.guards);
    const aroundHooks = this.snapshot(this.aroundHooks);
    const postHooks = this.snapshot(this.postHooks);
    const observers = this.snapshot(this.observers);

    let outcome: ToolPipelineOutcome<T>;
    try {
      for (const hook of preHooks) {
        const decision = normalizePreDecision(await hook(execution));
        if (decision.kind === "deny") {
          throw new ToolPipelineDeniedError(
            execution.toolName,
            "pre",
            decision.reason
          );
        }
      }

      for (const guard of guards) {
        const reason = guard(execution);
        if (reason !== undefined) {
          throw new ToolPipelineDeniedError(
            execution.toolName,
            "guard",
            nonEmptyReason(reason, "Tool guard")
          );
        }
      }

      outcome = success(await this.dispatch(execution, request.body, aroundHooks));
    } catch (error) {
      outcome = failure(error);
    }

    for (const hook of postHooks) {
      try {
        const decision = normalizePostDecision(await hook(execution, outcome));
        if (decision.kind === "deny") {
          outcome = failure(new ToolPipelineDeniedError(
            execution.toolName,
            "post",
            decision.reason
          ));
          break;
        }
      } catch (error) {
        outcome = failure(error);
        break;
      }
    }

    if (request.finalize !== undefined) {
      try {
        outcome = normalizeOutcome<T>(request.finalize(execution, outcome));
      } catch (error) {
        outcome = failure(error);
      }
    }

    this.notify(observers, execution, outcome);

    if (outcome.ok) return outcome.value;
    throw outcome.error;
  }

  private async dispatch<T>(
    execution: Readonly<ToolPipelineExecution>,
    body: ToolPipelineRequest<T>["body"],
    aroundHooks: readonly ToolPipelineAroundHook[]
  ): Promise<T> {
    let next: () => Promise<unknown> = () => Promise.resolve(body(execution));
    for (let index = aroundHooks.length - 1; index >= 0; index -= 1) {
      const hook = aroundHooks[index];
      const downstream = next;
      next = () => Promise.resolve(hook(execution, downstream));
    }
    return (await next()) as T;
  }

  private notify(
    observers: readonly ToolPipelineObserver[],
    execution: Readonly<ToolPipelineExecution>,
    outcome: ToolPipelineOutcome
  ): void {
    for (const observer of observers) {
      try {
        const returned = observer(execution, outcome);
        void Promise.resolve(returned).catch((error: unknown) => {
          this.reportObserverError(error, execution);
        });
      } catch (error) {
        this.reportObserverError(error, execution);
      }
    }
  }

  private reportObserverError(
    error: unknown,
    execution: Readonly<ToolPipelineExecution>
  ): void {
    try {
      this.onObserverError?.(error, execution);
    } catch {
      // Observation is diagnostics-only and must never alter the tool outcome.
    }
  }

  private register<T>(list: HookRegistration<T>[], hook: T): () => void {
    const registration = { hook } satisfies HookRegistration<T>;
    list.push(registration);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const index = list.indexOf(registration);
      if (index !== -1) list.splice(index, 1);
    };
  }

  private snapshot<T>(list: readonly HookRegistration<T>[]): T[] {
    return list.map((registration) => registration.hook);
  }
}
