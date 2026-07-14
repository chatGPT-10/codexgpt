import { z } from "zod";
import { isPolicyToolFailure } from "./policy/integration.js";
import {
  CANONICAL_CODEXPRO_CHILD_TOOLS,
  CODEXPRO_ERROR_MESSAGES,
  codexproOutputShape,
  createCodexProFailure,
  createCodexProListActionsSuccess,
  resolveCodexProAction,
  wrapCodexProChildResult,
  type CanonicalCodexProChildTool
} from "./tools/schemas/codexpro.js";

interface ToolCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

interface RegisteredToolEntry {
  title?: string;
  description?: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  annotations?: Record<string, unknown>;
  handler: (args: Record<string, unknown>, extra?: unknown) => ToolCallResult | Promise<ToolCallResult>;
  enabled?: boolean;
}

interface ServerWithRegisteredTools {
  _registeredTools: Record<string, RegisteredToolEntry>;
}

const canonicalTools = new Set<string>(CANONICAL_CODEXPRO_CHILD_TOOLS);

const codexproInputSchema = z.object({
  action: z.string().min(1),
  args: z.record(z.unknown()).optional()
}).strict();

const codexproAdvertisedOutputSchema = z.object(codexproOutputShape).strict();

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function wrapperFailureResult(
  failure: Parameters<typeof createCodexProFailure>[0],
  startedAt: number
): ToolCallResult {
  const structuredContent = createCodexProFailure(failure, elapsedMs(startedAt));
  const code = structuredContent.error?.code ?? "INTERNAL_ERROR";
  const message = structuredContent.error?.message ?? CODEXPRO_ERROR_MESSAGES.INTERNAL_ERROR;
  return {
    content: [{
      type: "text",
      text: `CodexPro action failed.\nCode: ${code}\n${message}`
    }],
    structuredContent,
    isError: true
  };
}

function registeredCanonicalTools(tools: Record<string, RegisteredToolEntry>): CanonicalCodexProChildTool[] {
  const names = Object.keys(tools).filter(
    (name) => name !== "codexpro" && tools[name]?.enabled !== false
  );
  for (const name of names) {
    if (!canonicalTools.has(name)) {
      throw new Error("Registered tool is outside the closed CodexPro child set.");
    }
  }
  return names.sort() as CanonicalCodexProChildTool[];
}

function stripLegacyWrapperFields(value: Record<string, unknown>): Record<string, unknown> {
  const {
    codexpro_super_action: _action,
    wrapped_tool: _wrappedTool,
    ...child
  } = value;
  return child;
}

export function upgradeCodexProSupertool(server: unknown): void {
  const candidate = server as Partial<ServerWithRegisteredTools>;
  const tools = candidate._registeredTools;
  if (!tools || typeof tools !== "object") {
    throw new Error("CodexPro server does not expose a registered-tool map.");
  }
  const supertool = tools.codexpro;
  if (!supertool) return;
  if (typeof supertool.handler !== "function") {
    throw new Error("CodexPro supertool registration is unavailable.");
  }

  supertool.title = "CodexPro Supertool";
  supertool.description =
    "Stable closed-world wrapper for already-registered CodexPro tools. " +
    "Call list_actions first; aliases cannot bypass the current tool, write, Bash, analysis, or Codex Session gates.";
  supertool.inputSchema = codexproInputSchema;
  supertool.outputSchema = codexproAdvertisedOutputSchema;
  supertool.annotations = {
    ...(supertool.annotations ?? {}),
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false
  };

  supertool.handler = async (input, extra) => {
    const startedAt = Date.now();
    const action = input.action;
    if (typeof action !== "string") {
      return wrapperFailureResult({
        code: "ACTION_NOT_AVAILABLE",
        details: { action }
      }, startedAt);
    }

    if (action === "list_actions") {
      try {
        const structuredContent = createCodexProListActionsSuccess(
          registeredCanonicalTools(tools),
          elapsedMs(startedAt)
        );
        return {
          content: [{
            type: "text",
            text: `Available CodexPro actions (${structuredContent.data?.action_count ?? 0}):\n` +
              `${(structuredContent.data?.actions as string[] | undefined)?.join("\n") ?? ""}`
          }],
          structuredContent
        };
      } catch {
        return wrapperFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
    }

    const wrappedTool = resolveCodexProAction(action);
    const target = wrappedTool ? tools[wrappedTool] : undefined;
    if (!wrappedTool || !target || target.enabled === false) {
      return wrapperFailureResult({
        code: "ACTION_NOT_AVAILABLE",
        details: { action }
      }, startedAt);
    }

    const args = input.args ?? {};
    const parsedArgs = target.inputSchema.safeParse(args);
    if (!parsedArgs.success) {
      return wrapperFailureResult({
        code: "ACTION_ARGUMENTS_INVALID",
        details: { action, wrapped_tool: wrappedTool }
      }, startedAt);
    }

    let childResult: ToolCallResult;
    try {
      childResult = await target.handler(parsedArgs.data, extra);
    } catch {
      return wrapperFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
    }

    if (isPolicyToolFailure(childResult)) return childResult;

    try {
      const legacyStructured = childResult?.structuredContent;
      if (!legacyStructured || typeof legacyStructured !== "object" || Array.isArray(legacyStructured)) {
        throw new Error("Missing child structured content.");
      }
      const structuredContent = wrapCodexProChildResult(
        action,
        wrappedTool,
        stripLegacyWrapperFields(legacyStructured)
      );
      return {
        ...childResult,
        structuredContent
      };
    } catch {
      return wrapperFailureResult({
        code: "CHILD_RESULT_INVALID",
        details: { action, wrapped_tool: wrappedTool }
      }, startedAt);
    }
  };
}
