import {
  persistedV2ContractVersion,
  type CodexGPTConfig,
  type ToolContractVersion
} from "../config.js";
import { contractIncludesV2, contractIncludesV4 } from "./contracts/catalog.js";
import type { PathGuard, Workspace, WorkspaceManager } from "../guard.js";
import {
  AuditError,
  auditQueryFilterDigest,
  auditQueryFilterDigestV3,
  auditQueryFilterDigestV4,
  queryAuditEventsInputV2Schema,
  queryAuditEventsInputV3Schema,
  queryAuditEventsInputV4Schema,
  queryAuditEventsV2,
  queryAuditEventsV3,
  type AuditQueryHandlerV2,
  type AuditQueryHandlerV3
} from "../audit/index.js";
import {
  UndoChangeSetError,
  deriveChangeSetOwnerBinding,
  type UndoChangeSetService
} from "../changesets/undo.js";
import { attachPendingWorkspaceMutation } from "../mutations/runtime.js";
import type { MutationToolResult } from "../mutations/types.js";
import type { MovePathsService } from "../moves/service.js";
import { describeAuditResource, describeFilesystemBatchResource } from "../policy/resources.js";
import type { PolicySessionContextSource } from "../policy/identity.js";
import type { ToolResourceResolver } from "../policy/integration.js";
import { TransactionError } from "../transactions/types.js";
import {
  createMovePathsFailure,
  movePathsInputV1Schema,
  movePathsOutputShape
} from "./schemas/movePaths.js";
import {
  createUndoChangeSetFailure,
  createUndoChangeSetSuccess,
  undoChangeSetInputV2Schema,
  undoChangeSetOutputShape,
  type UndoChangeSetErrorCode
} from "./schemas/undoChangeSet.js";
import {
  createQueryAuditEventsFailure,
  createQueryAuditEventsFailureV3,
  createQueryAuditEventsSuccess,
  createQueryAuditEventsSuccessV3,
  queryAuditEventsOutputShape,
  queryAuditEventsOutputShapeV3
} from "./schemas/queryAuditEvents.js";

export interface Phase3DServerDependencies {
  movePathsService?: Pick<MovePathsService, "prepare">;
  auditQueryHandler?: AuditQueryHandlerV2;
  auditQueryHandlerV3?: AuditQueryHandlerV3;
  policySessionContextSource?: PolicySessionContextSource;
  changeSetOwnerBindingKey?: Buffer;
  undoChangeSetService?: Pick<UndoChangeSetService, "prepare" | "describeResource">;
}

export type Phase3DToolHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

export type Phase3DToolRegistrar = (
  name: "query_audit_events" | "undo_change_set" | "move_paths",
  options: Record<string, unknown>,
  handler: Phase3DToolHandler
) => void;

export interface CreatePhase3DResourceResolverInput {
  workspaces: WorkspaceManager;
  guard: PathGuard;
  dependencies: Phase3DServerDependencies;
  toolContractVersion?: ToolContractVersion;
}

export interface CreatePhase3DServerIntegrationInput extends CreatePhase3DResourceResolverInput {
  config: CodexGPTConfig;
  policyRevision(): string;
}

export interface Phase3DServerIntegration {
  resourceResolver: ToolResourceResolver;
  registerTools(register: Phase3DToolRegistrar): void;
}

function ownerBinding(dependencies: Phase3DServerDependencies): string {
  if (!dependencies.policySessionContextSource || !dependencies.changeSetOwnerBindingKey) {
    throw new Error("Contract V2 owner binding is unavailable.");
  }
  return deriveChangeSetOwnerBinding(
    dependencies.policySessionContextSource,
    dependencies.changeSetOwnerBindingKey
  );
}

function workspaceFor(workspaces: WorkspaceManager, workspaceId: unknown): Workspace {
  if (typeof workspaceId !== "string" || !workspaceId.trim()) {
    throw new Error("Workspace ID is invalid.");
  }
  return workspaces.getWorkspace(workspaceId);
}

function toolResult(
  structuredContent: Record<string, unknown>,
  text: string,
  isError = false
): MutationToolResult {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text", text }],
    structuredContent
  };
}

function undoErrorCode(error: unknown): UndoChangeSetErrorCode {
  if (error instanceof UndoChangeSetError) return error.code;
  if (error instanceof AuditError) {
    return error.code === "AUDIT_INTEGRITY_FAILURE"
      ? "AUDIT_INTEGRITY_FAILURE"
      : "AUDIT_UNAVAILABLE";
  }
  if (error instanceof TransactionError) {
    const direct = new Set<UndoChangeSetErrorCode>([
      "TRANSACTION_BUSY",
      "ATOMIC_BACKEND_UNAVAILABLE",
      "TRANSACTION_FAILED",
      "ROLLBACK_FAILED",
      "TRANSACTION_RECOVERY_REQUIRED"
    ]);
    if (direct.has(error.code as UndoChangeSetErrorCode)) {
      return error.code as UndoChangeSetErrorCode;
    }
    if (error.code === "FILE_VERSION_CONFLICT" || error.code === "TRANSACTION_PRECONDITION_FAILED") {
      return "UNDO_CONFLICT";
    }
  }
  return "INTERNAL_ERROR";
}

function safeWorkspaceId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 160
    ? value
    : undefined;
}

const PHASE_3D_RESOURCE_TOOLS = new Set([
  "query_audit_events",
  "undo_change_set",
  "move_paths"
]);

export function composePhase3DResourceResolver(
  base: ToolResourceResolver | undefined,
  phase3d: ToolResourceResolver
): ToolResourceResolver {
  return {
    describe(toolName, args) {
      if (PHASE_3D_RESOURCE_TOOLS.has(toolName)) {
        return phase3d.describe(toolName, args);
      }
      if (!base) {
        throw new Error("Policy resource resolver does not support this tool.");
      }
      return base.describe(toolName, args);
    }
  };
}

export function createPhase3DResourceResolver(
  input: CreatePhase3DResourceResolverInput
): ToolResourceResolver {
  const { workspaces, guard, dependencies, toolContractVersion = 2 } = input;
  return {
    describe(toolName, args) {
      if (toolName === "query_audit_events") {
        const filterDigest = contractIncludesV4(toolContractVersion)
          ? auditQueryFilterDigestV4(queryAuditEventsInputV4Schema.parse(args))
          : toolContractVersion === 3
            ? auditQueryFilterDigestV3(queryAuditEventsInputV3Schema.parse(args))
            : auditQueryFilterDigest(queryAuditEventsInputV2Schema.parse(args));
        return {
          resource: describeAuditResource({
            workspaceId: null,
            filterDigest
          })
        };
      }

      const workspace = workspaceFor(workspaces, args.workspace_id);
      if (toolName === "move_paths") {
        const parsed = movePathsInputV1Schema.parse(args);
        return {
          resource: describeFilesystemBatchResource({
            workspace,
            guard,
            operation: "move",
            entries: parsed.moves.map((move) => ({
              sourcePath: move.source,
              destinationPath: move.destination
            }))
          }),
          requiredCapabilities: [{ name: "filesystemWriteBoundary", minimum: "brokered" }]
        };
      }

      if (toolName === "undo_change_set") {
        if (!dependencies.undoChangeSetService) {
          throw new Error("Undo change-set resource service is unavailable.");
        }
        const parsed = undoChangeSetInputV2Schema.parse(args);
        return {
          resource: dependencies.undoChangeSetService.describeResource({
            workspace,
            changeSetId: parsed.change_set_id,
            ownerBinding: ownerBinding(dependencies)
          }),
          requiredCapabilities: [{ name: "filesystemWriteBoundary", minimum: "brokered" }]
        };
      }

      throw new Error("Contract V2 resource resolver received an unsupported tool.");
    }
  };
}

export function createPhase3DServerIntegration(
  input: CreatePhase3DServerIntegrationInput
): Phase3DServerIntegration {
  const { config, workspaces, dependencies } = input;
  const resourceResolver = createPhase3DResourceResolver({
    ...input,
    toolContractVersion: config.toolContractVersion
  });

  function registerTools(register: Phase3DToolRegistrar): void {
    const contractVersion = config.toolContractVersion;
    if (!contractIncludesV2(contractVersion) || config.connectionTest || config.toolMode === "minimal") {
      return;
    }
    const persistedContractVersion = persistedV2ContractVersion(contractVersion);

    if (!dependencies.undoChangeSetService || !dependencies.movePathsService) {
      throw new Error("Contract V2 mutation services are unavailable.");
    }

    register("undo_change_set", {
      title: "Undo Change Set",
      description: "Preview or atomically reverse one authenticated change set after complete conflict checks.",
      inputSchema: undoChangeSetInputV2Schema,
      outputSchema: undoChangeSetOutputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      },
      _meta: {
        "openai/toolInvocation/invoking": "Checking and reversing the change set...",
        "openai/toolInvocation/invoked": "Change-set undo complete"
      }
    }, async (args) => {
      const startedAt = Date.now();
      const parsed = undoChangeSetInputV2Schema.safeParse(args);
      if (!parsed.success) {
        const structured = createUndoChangeSetFailure("INTERNAL_ERROR", {}, Date.now() - startedAt);
        return toolResult(structured as unknown as Record<string, unknown>, structured.error?.message ?? "Undo failed.", true);
      }
      let workspace: Workspace;
      try {
        workspace = workspaceFor(workspaces, parsed.data.workspace_id);
      } catch {
        const structured = createUndoChangeSetFailure("WORKSPACE_NOT_FOUND", {
          workspace_id: parsed.data.workspace_id,
          change_set_id: parsed.data.change_set_id
        }, Date.now() - startedAt);
        return toolResult(structured as unknown as Record<string, unknown>, structured.error?.message ?? "Undo failed.", true);
      }
      try {
        const prepared = await dependencies.undoChangeSetService!.prepare({
          workspace,
          changeSetId: parsed.data.change_set_id,
          ownerBinding: ownerBinding(dependencies),
          policyRevision: input.policyRevision(),
          requestId: null,
          preview: parsed.data.preview ?? false,
          contractVersion: persistedContractVersion
        });
        const structured = createUndoChangeSetSuccess({
          workspace_id: prepared.workspaceId,
          preview: prepared.preview,
          change_set_id: prepared.changeSetId,
          reverts_change_set_id: prepared.revertsChangeSetId,
          operation_count: prepared.operationCount,
          operations: prepared.operations,
          undo_supported: false
        }, Date.now() - startedAt);
        const result = toolResult(
          structured as unknown as Record<string, unknown>,
          prepared.preview
            ? `Undo preview validated ${prepared.operationCount} operation(s).`
            : `Prepared atomic undo of ${prepared.operationCount} operation(s).`
        );
        return prepared.pending
          ? attachPendingWorkspaceMutation(result, prepared.pending)
          : result;
      } catch (error) {
        const structured = createUndoChangeSetFailure(undoErrorCode(error), {
          workspace_id: parsed.data.workspace_id,
          change_set_id: parsed.data.change_set_id
        }, Date.now() - startedAt);
        return toolResult(structured as unknown as Record<string, unknown>, structured.error?.message ?? "Undo failed.", true);
      }
    });

    register("move_paths", {
      title: "Move Paths",
      description: "Preview or atomically move up to 64 ordinary files within one workspace using same-volume hard-link transactions.",
      inputSchema: movePathsInputV1Schema,
      outputSchema: movePathsOutputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      },
      _meta: {
        "openai/toolInvocation/invoking": "Validating and moving paths...",
        "openai/toolInvocation/invoked": "Path move complete"
      }
    }, async (args) => {
      const parsed = movePathsInputV1Schema.safeParse(args);
      if (!parsed.success) {
        const structured = createMovePathsFailure("INVALID_ARGUMENT", {
          workspace_id: safeWorkspaceId(args.workspace_id),
          move_count: Array.isArray(args.moves) ? Math.min(args.moves.length, 64) : 0
        });
        return toolResult(structured as unknown as Record<string, unknown>, structured.error?.message ?? "Move failed.", true);
      }
      let workspace: Workspace;
      try {
        workspace = workspaceFor(workspaces, parsed.data.workspace_id);
      } catch {
        const structured = createMovePathsFailure("WORKSPACE_NOT_FOUND", {
          workspace_id: parsed.data.workspace_id,
          move_count: parsed.data.moves.length
        });
        return toolResult(structured as unknown as Record<string, unknown>, structured.error?.message ?? "Move failed.", true);
      }
      return dependencies.movePathsService!.prepare({
        workspace,
        moves: parsed.data.moves.map((move) => ({
          source: move.source,
          destination: move.destination,
          expectedSha256: move.expected_sha256
        })),
        createParents: parsed.data.create_parents ?? false,
        preview: parsed.data.preview ?? false,
        requestId: null,
        ownerBinding: ownerBinding(dependencies),
        policyRevision: input.policyRevision(),
        contractVersion: persistedContractVersion
      });
    });

    if (config.toolMode === "full" && !contractIncludesV4(contractVersion)) {
      const v3 = contractVersion === 3;
      if (v3 ? !dependencies.auditQueryHandlerV3 : !dependencies.auditQueryHandler) {
        throw new Error(`Contract V${contractVersion} audit query service is unavailable.`);
      }
      register("query_audit_events", {
        title: "Query Audit Events",
        description: "Query the authenticated installation audit log with bounded filters and cursor pagination.",
        inputSchema: v3 ? queryAuditEventsInputV3Schema : queryAuditEventsInputV2Schema,
        outputSchema: v3 ? queryAuditEventsOutputShapeV3 : queryAuditEventsOutputShape,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        },
        _meta: {
          "openai/toolInvocation/invoking": "Querying authenticated audit events...",
          "openai/toolInvocation/invoked": "Audit query complete"
        }
      }, async (args) => {
        const startedAt = Date.now();
        try {
          const page = v3
            ? await queryAuditEventsV3(dependencies.auditQueryHandlerV3!, args)
            : await queryAuditEventsV2(dependencies.auditQueryHandler!, args);
          const structured = v3
            ? createQueryAuditEventsSuccessV3(page as Awaited<ReturnType<AuditQueryHandlerV3>>, Date.now() - startedAt)
            : createQueryAuditEventsSuccess(page as Awaited<ReturnType<AuditQueryHandlerV2>>, Date.now() - startedAt);
          return toolResult(
            structured as unknown as Record<string, unknown>,
            `Returned ${page.records.length} authenticated audit event(s).`
          );
        } catch (error) {
          const code = error instanceof AuditError ? error.code : "INTERNAL_ERROR";
          const structured = v3
            ? createQueryAuditEventsFailureV3(code, Date.now() - startedAt)
            : createQueryAuditEventsFailure(code, Date.now() - startedAt);
          return toolResult(
            structured as unknown as Record<string, unknown>,
            structured.error?.message ?? "Audit query failed.",
            true
          );
        }
      });
    }
  }

  return { resourceResolver, registerTools };
}
