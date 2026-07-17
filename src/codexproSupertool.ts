import { z } from "zod";
import type { ToolContractVersion } from "./config.js";
import { isPolicyToolFailure } from "./policy/integration.js";
import {
  CANONICAL_CODEXPRO_CHILD_TOOLS,
  CANONICAL_CODEXPRO_CHILD_TOOLS_V2,
  CANONICAL_CODEXPRO_CHILD_TOOLS_V3,
  CODEXPRO_ERROR_MESSAGES,
  codexproOutputShape,
  codexproOutputShapeV2,
  codexproOutputShapeV3,
  createCodexProFailure,
  createCodexProFailureV2,
  createCodexProFailureV3,
  createCodexProListActionsSuccess,
  createCodexProListActionsSuccessV2,
  createCodexProListActionsSuccessV3,
  resolveCodexProAction,
  resolveCodexProActionV2,
  resolveCodexProActionV3,
  wrapCodexProChildResult,
  wrapCodexProChildResultV2,
  wrapCodexProChildResultV3
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

type SupertoolFailureInput =
  | { code: "ACTION_NOT_AVAILABLE"; details: { action: unknown } }
  | {
      code: "ACTION_ARGUMENTS_INVALID" | "CHILD_RESULT_INVALID";
      details: { action: unknown; wrapped_tool: string };
    }
  | { code: "INTERNAL_ERROR"; details?: Record<string, never> };

type FailureFactory = (
  failure: SupertoolFailureInput,
  durationMs?: number
) => Record<string, unknown>;
type ListFactory = (actions: readonly string[], durationMs?: number) => Record<string, unknown>;
type ResolveFactory = (action: string) => string | null;
type WrapFactory = (
  action: string,
  wrappedTool: string,
  childStructuredContent: unknown
) => Record<string, unknown>;

interface SupertoolContract {
  canonicalTools: ReadonlySet<string>;
  outputSchema: z.ZodTypeAny;
  createFailure: FailureFactory;
  createList: ListFactory;
  resolve: ResolveFactory;
  wrap: WrapFactory;
}

const canonicalToolsV1 = new Set<string>(CANONICAL_CODEXPRO_CHILD_TOOLS);
const canonicalToolsV2 = new Set<string>(CANONICAL_CODEXPRO_CHILD_TOOLS_V2);
const canonicalToolsV3 = new Set<string>(CANONICAL_CODEXPRO_CHILD_TOOLS_V3);
const v2OnlyTools = new Set<string>(
  CANONICAL_CODEXPRO_CHILD_TOOLS_V2.filter((name) => !canonicalToolsV1.has(name))
);

const codexproInputSchema = z.object({
  action: z.string().min(1),
  args: z.record(z.unknown()).optional()
}).strict();

const codexproAdvertisedOutputSchema = z.object(codexproOutputShape).strict();
const codexproAdvertisedOutputSchemaV2 = z.object(codexproOutputShapeV2).strict();
const codexproAdvertisedOutputSchemaV3 = z.object(codexproOutputShapeV3).strict();

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function contractFor(
  tools: Record<string, RegisteredToolEntry>,
  requestedVersion?: ToolContractVersion
): SupertoolContract {
  const inferredV2 = Object.keys(tools).some((name) => v2OnlyTools.has(name));
  if (requestedVersion === 3) {
    return {
      canonicalTools: canonicalToolsV3,
      outputSchema: codexproAdvertisedOutputSchemaV3,
      createFailure: createCodexProFailureV3 as unknown as FailureFactory,
      createList: createCodexProListActionsSuccessV3 as unknown as ListFactory,
      resolve: resolveCodexProActionV3 as ResolveFactory,
      wrap: wrapCodexProChildResultV3 as unknown as WrapFactory
    };
  }
  const useV2 = requestedVersion === 2 || (requestedVersion === undefined && inferredV2);
  if (useV2) {
    return {
      canonicalTools: canonicalToolsV2,
      outputSchema: codexproAdvertisedOutputSchemaV2,
      createFailure: createCodexProFailureV2 as unknown as FailureFactory,
      createList: createCodexProListActionsSuccessV2 as unknown as ListFactory,
      resolve: resolveCodexProActionV2 as ResolveFactory,
      wrap: wrapCodexProChildResultV2 as unknown as WrapFactory
    };
  }
  return {
    canonicalTools: canonicalToolsV1,
    outputSchema: codexproAdvertisedOutputSchema,
    createFailure: createCodexProFailure as unknown as FailureFactory,
    createList: createCodexProListActionsSuccess as unknown as ListFactory,
    resolve: resolveCodexProAction as ResolveFactory,
    wrap: wrapCodexProChildResult as unknown as WrapFactory
  };
}

function wrapperFailureResult(
  contract: SupertoolContract,
  failure: SupertoolFailureInput,
  startedAt: number
): ToolCallResult {
  const structuredContent = contract.createFailure(failure, elapsedMs(startedAt));
  const error = structuredContent.error;
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "INTERNAL_ERROR";
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : CODEXPRO_ERROR_MESSAGES.INTERNAL_ERROR;
  return {
    content: [{
      type: "text",
      text: `CodexPro action failed.\nCode: ${code}\n${message}`
    }],
    structuredContent,
    isError: true
  };
}

function registeredCanonicalTools(
  tools: Record<string, RegisteredToolEntry>,
  canonicalTools: ReadonlySet<string>
): string[] {
  const names = Object.keys(tools).filter(
    (name) => name !== "codexpro" && tools[name]?.enabled !== false
  );
  for (const name of names) {
    if (!canonicalTools.has(name)) {
      throw new Error("Registered tool is outside the closed CodexPro child set.");
    }
  }
  return names.sort();
}

function stripLegacyWrapperFields(value: Record<string, unknown>): Record<string, unknown> {
  const {
    codexpro_super_action: _action,
    wrapped_tool: _wrappedTool,
    ...child
  } = value;
  return child;
}

function actionCount(structuredContent: Record<string, unknown>): number {
  const data = structuredContent.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return 0;
  const count = (data as Record<string, unknown>).action_count;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function actionNames(structuredContent: Record<string, unknown>): string[] {
  const data = structuredContent.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const actions = (data as Record<string, unknown>).actions;
  return Array.isArray(actions) && actions.every((value) => typeof value === "string")
    ? actions
    : [];
}

export function upgradeCodexProSupertool(
  server: unknown,
  contractVersion?: ToolContractVersion
): void {
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
  const contract = contractFor(tools, contractVersion);

  supertool.title = "CodexPro Supertool";
  supertool.description =
    "Stable closed-world wrapper for already-registered CodexPro tools. " +
    "Call list_actions first; aliases cannot bypass the current tool, write, Bash, analysis, or Codex Session gates.";
  supertool.inputSchema = codexproInputSchema;
  supertool.outputSchema = contract.outputSchema;
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
      return wrapperFailureResult(contract, {
        code: "ACTION_NOT_AVAILABLE",
        details: { action }
      }, startedAt);
    }

    if (action === "list_actions") {
      try {
        const structuredContent = contract.createList(
          registeredCanonicalTools(tools, contract.canonicalTools),
          elapsedMs(startedAt)
        );
        return {
          content: [{
            type: "text",
            text: `Available CodexPro actions (${actionCount(structuredContent)}):\n` +
              actionNames(structuredContent).join("\n")
          }],
          structuredContent
        };
      } catch {
        return wrapperFailureResult(contract, { code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
    }

    const wrappedTool = contract.resolve(action);
    const target = wrappedTool ? tools[wrappedTool] : undefined;
    if (!wrappedTool || !target || target.enabled === false) {
      return wrapperFailureResult(contract, {
        code: "ACTION_NOT_AVAILABLE",
        details: { action }
      }, startedAt);
    }

    const args = input.args ?? {};
    const parsedArgs = target.inputSchema.safeParse(args);
    if (!parsedArgs.success) {
      return wrapperFailureResult(contract, {
        code: "ACTION_ARGUMENTS_INVALID",
        details: { action, wrapped_tool: wrappedTool }
      }, startedAt);
    }

    let childResult: ToolCallResult;
    try {
      childResult = await target.handler(parsedArgs.data, extra);
    } catch {
      return wrapperFailureResult(contract, { code: "INTERNAL_ERROR", details: {} }, startedAt);
    }

    if (isPolicyToolFailure(childResult)) return childResult;

    try {
      const legacyStructured = childResult?.structuredContent;
      if (!legacyStructured || typeof legacyStructured !== "object" || Array.isArray(legacyStructured)) {
        throw new Error("Missing child structured content.");
      }
      const structuredContent = contract.wrap(
        action,
        wrappedTool,
        stripLegacyWrapperFields(legacyStructured)
      );
      return {
        ...childResult,
        structuredContent
      };
    } catch {
      return wrapperFailureResult(contract, {
        code: "CHILD_RESULT_INVALID",
        details: { action, wrapped_tool: wrappedTool }
      }, startedAt);
    }
  };
}
