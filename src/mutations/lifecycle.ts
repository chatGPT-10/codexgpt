import { AsyncLocalStorage } from "node:async_hooks";

interface ToolCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

interface RegisteredToolEntry {
  handler: (args: Record<string, unknown>, extra?: unknown) => ToolCallResult | Promise<ToolCallResult>;
  enabled?: boolean;
}

interface ServerWithRegisteredTools {
  _registeredTools: Record<string, RegisteredToolEntry>;
}

const LIFECYCLE_WRAPPED_HANDLER = Symbol("codexpro.lifecycle.wrapped-handler");
const installedServers = new WeakSet<object>();

export type MutationLifecycleState = "accepting" | "quiescing" | "disposed";

export class MutationLifecycleUnavailableError extends Error {
  constructor() {
    super("CodexPro is shutting down and cannot accept another tool invocation.");
    this.name = "MutationLifecycleUnavailableError";
  }
}

export class ServerMutationLifecycle {
  private readonly invocation = new AsyncLocalStorage<true>();
  private stateValue: MutationLifecycleState = "accepting";
  private activeValue = 0;
  private exclusivePending = 0;
  private exclusiveTail: Promise<void> = Promise.resolve();
  private activeZeroWaiters: Array<() => void> = [];
  private exclusiveClearWaiters: Array<() => void> = [];
  private drainWaiters: Array<() => void> = [];

  state(): MutationLifecycleState {
    return this.stateValue;
  }

  activeCount(): number {
    return this.activeValue;
  }

  isDrained(): boolean {
    return this.activeValue === 0 && this.exclusivePending === 0;
  }

  quiesce(): void {
    if (this.stateValue === "accepting") this.stateValue = "quiescing";
  }

  markDisposed(): void {
    if (!this.isDrained()) {
      throw new Error("Cannot dispose a lifecycle with accepted tool invocations.");
    }
    this.stateValue = "disposed";
  }

  drain(): Promise<void> {
    if (this.isDrained()) return Promise.resolve();
    return new Promise((resolve) => this.drainWaiters.push(resolve));
  }

  private notifyStateChange(): void {
    if (this.activeValue === 0 && this.activeZeroWaiters.length > 0) {
      const waiters = this.activeZeroWaiters;
      this.activeZeroWaiters = [];
      for (const resolve of waiters) resolve();
    }
    if (this.exclusivePending === 0 && this.exclusiveClearWaiters.length > 0) {
      const waiters = this.exclusiveClearWaiters;
      this.exclusiveClearWaiters = [];
      for (const resolve of waiters) resolve();
    }
    if (this.isDrained() && this.drainWaiters.length > 0) {
      const waiters = this.drainWaiters;
      this.drainWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  private waitForActiveZero(): Promise<void> {
    if (this.activeValue === 0) return Promise.resolve();
    return new Promise((resolve) => this.activeZeroWaiters.push(resolve));
  }

  private waitForExclusiveClear(): Promise<void> {
    if (this.exclusivePending === 0) return Promise.resolve();
    return new Promise((resolve) => this.exclusiveClearWaiters.push(resolve));
  }

  async run<T>(action: () => T | Promise<T>): Promise<T> {
    if (this.invocation.getStore()) return action();
    if (this.stateValue !== "accepting") throw new MutationLifecycleUnavailableError();
    if (this.exclusivePending > 0) {
      await this.waitForExclusiveClear();
      if (this.stateValue !== "accepting") throw new MutationLifecycleUnavailableError();
    }
    this.activeValue += 1;
    return this.invocation.run(true, async () => {
      try {
        return await action();
      } finally {
        this.activeValue -= 1;
        this.notifyStateChange();
      }
    });
  }

  async runExclusive<T>(action: () => T | Promise<T>): Promise<T> {
    if (this.invocation.getStore()) return action();
    if (this.stateValue !== "accepting") throw new MutationLifecycleUnavailableError();

    this.exclusivePending += 1;
    let releaseTurn!: () => void;
    const previousTurn = this.exclusiveTail;
    this.exclusiveTail = new Promise<void>((resolve) => { releaseTurn = resolve; });
    let active = false;
    try {
      await previousTurn;
      await this.waitForActiveZero();
      this.activeValue += 1;
      active = true;
      return await this.invocation.run(true, action);
    } finally {
      if (active) this.activeValue -= 1;
      this.exclusivePending -= 1;
      releaseTurn();
      this.notifyStateChange();
    }
  }
}

function unavailableResult(): ToolCallResult {
  return {
    isError: true,
    content: [{
      type: "text",
      text: "CodexPro is shutting down and cannot accept another tool invocation."
    }]
  };
}

export function installServerMutationLifecycle(
  server: unknown,
  lifecycle: ServerMutationLifecycle
): void {
  const candidate = server as Partial<ServerWithRegisteredTools>;
  const tools = candidate._registeredTools;
  if (!tools || typeof tools !== "object") {
    throw new Error("CodexPro server does not expose a registered-tool map for lifecycle installation.");
  }
  if (installedServers.has(server as object)) {
    throw new Error("Server mutation lifecycle is already installed.");
  }
  for (const [toolName, entry] of Object.entries(tools)) {
    const registered = entry.handler as RegisteredToolEntry["handler"] & {
      [LIFECYCLE_WRAPPED_HANDLER]?: true;
    };
    if (entry.enabled === false || registered[LIFECYCLE_WRAPPED_HANDLER] === true) continue;
    const original = registered;
    entry.handler = async (args, extra) => {
      try {
        const invoke = () => original(args, extra);
        return await (toolName === "close_workspace"
          ? lifecycle.runExclusive(invoke)
          : lifecycle.run(invoke));
      } catch (error) {
        if (error instanceof MutationLifecycleUnavailableError) return unavailableResult();
        throw error;
      }
    };
    Object.defineProperty(entry.handler, LIFECYCLE_WRAPPED_HANDLER, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
  installedServers.add(server as object);
}
