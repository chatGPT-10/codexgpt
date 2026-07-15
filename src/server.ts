import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  assertFileTransactionConfiguration,
  assertToolContractConfiguration,
  type CodexProConfig
} from "./config.js";
import {
  createDefaultTransactionRecoveryCoordinator,
  TransactionError,
  type TransactionRecoveryHook
} from "./transactions/index.js";
import {
  attachPendingWorkspaceMutation,
  pendingWorkspaceMutation,
  attachPreparedBatchMutation,
  attachPreparedPatchMutation,
  attachPreparedFileMutation,
  type WorkspaceMutationRuntime
} from "./mutations/index.js";
import { PatchPlanError, prepareWorkspacePatch } from "./patchOps.js";
import { AuditError } from "./audit/types.js";
import { WorkspaceManager, PathGuard, CodexProError, type Workspace } from "./guard.js";
import {
  repoTree,
  readTextFile,
  textScanByteLimit,
  prepareWriteTextFile,
  prepareEditTextFile,
  writeTextFile,
  editTextFile,
  type ReadFileResult,
  type TreeOptions,
  type TreeResult,
  type WriteFileResult,
  type EditFileResult
} from "./fsOps.js";
import { searchWorkspace, type SearchOptions, type SearchResult } from "./searchOps.js";
import { probeBashAvailability, runBash, type BashResult } from "./bashOps.js";
import { gitDiff, gitDiffStatus, gitLog, gitStatus } from "./gitOps.js";
import {
  readAiBridgeContext,
  readHandoffContext,
  readHandoffLimits,
  readHandoffRunState,
  readWaitForHandoffArtifacts,
  waitForHandoffLimits,
  readCodexContext,
  resolveCodexContextTarget,
  workspaceSummary,
  type CodexContext,
  type CodexContextTargetKind,
  type HandoffRunStateReadResult,
  type ReadHandoffContextResult,
  type ReadHandoffLimits,
  type WaitForHandoffArtifactReadResult,
  type WaitForHandoffLimits,
  type WorkspaceSummary
} from "./workspaceOps.js";
import {
  ProContextOperationError,
  buildProContext,
  capProContextUtf8,
  exportPreparedProContext,
  prepareProContextMutation,
  prepareProContextRequest,
  preflightProContextOutput,
  type PreparedProContextOutput,
  type PreparedProContextRequest,
  type ProContextExportResult
} from "./proContext.js";
import {
  HandoffOperationError,
  prepareAgentHandoffRequest,
  preflightAgentHandoffOutput,
  writePreparedAgentHandoff,
  prepareAgentHandoffMutation,
  type AgentHandoffProviderContext,
  type HandoffWriteResult
} from "./handoffOps.js";
import {
  codexproInventory,
  loadSkill,
  LoadSkillError,
  type CodexProInventoryResult,
  type LoadedSkill,
  type SkillInventoryItem
} from "./capabilitiesOps.js";
import {
  CODEX_SESSION_READ_FILE_LIMIT,
  CODEX_SESSION_SCAN_DEPTH_LIMIT,
  CODEX_SESSION_SCAN_FILE_LIMIT,
  CodexSessionReadOperationError,
  codexSessionDirectory,
  codexSessionRoots,
  isCodexSessionReadOperationError,
  listCodexSessions,
  readCodexSession,
  type CodexSessionListResult,
  type CodexSessionReadResult
} from "./codexSessions.js";
import { TOOL_CARD_LEGACY_URIS, TOOL_CARD_MIME_TYPE, TOOL_CARD_URI, toolCardWidgetHtml } from "./toolCardWidget.js";
import { hasSecretValue, redactSensitiveText, redactStructured } from "./redact.js";
import { inspectWorkspace, invalidateWorkspaceAnalysis, reviewWorkspaceChanges } from "./analysis/index.js";
import type { ChangeAnalysis, WorkspaceAnalysis } from "./analysis/types.js";
import {
  CodexProSelfTestInternalError,
  buildCodexProSelfTestData,
  codexproSelfTestFailureText,
  codexproSelfTestHumanText,
  defaultCodexProSelfTestProvider,
  prepareAtomicCodexProSelfTest,
  normalizeCodexProSelfTestRequest,
  safeCodexProSelfTestWorkspaceId,
  type CodexProSelfTestProvider
} from "./selfTestOps.js";
import {
  CODEXPRO_SELF_TEST_ERROR_MESSAGES,
  codexproSelfTestOutputShape,
  createCodexProSelfTestFailure,
  createCodexProSelfTestSuccess
} from "./tools/schemas/codexproSelfTest.js";
import {
  createServerConfigFailure,
  createServerConfigSuccess,
  serverConfigDataSchema,
  serverConfigOutputShape,
  type ServerConfigData
} from "./tools/schemas/serverConfig.js";
import {
  TREE_ERROR_MESSAGES,
  createTreeFailure,
  createTreeSuccess,
  treeDataSchema,
  treeOutputShape,
  type TreeFailureInput
} from "./tools/schemas/tree.js";
import {
  READ_ERROR_MESSAGES,
  createReadFailure,
  createReadSuccess,
  readDataSchema,
  readOutputShape,
  type ReadFailureInput
} from "./tools/schemas/read.js";
import {
  GIT_STATUS_ERROR_MESSAGES,
  createGitStatusFailure,
  createGitStatusSuccess,
  gitStatusDataSchema,
  gitStatusOutputShape,
  type GitStatusFailureInput
} from "./tools/schemas/gitStatus.js";
import {
  GIT_DIFF_ERROR_MESSAGES,
  createGitDiffFailure,
  createGitDiffSuccess,
  gitDiffDataSchema,
  gitDiffOutputShape,
  type GitDiffFailureInput
} from "./tools/schemas/gitDiff.js";
import {
  SHOW_CHANGES_ANALYSIS_WARNING,
  SHOW_CHANGES_ERROR_MESSAGES,
  createShowChangesFailure,
  createShowChangesSuccess,
  showChangesAnalysisSchema,
  showChangesDataSchema,
  showChangesOutputShape,
  type ShowChangesAnalysis,
  type ShowChangesFailureInput
} from "./tools/schemas/showChanges.js";
import {
  SEARCH_ANALYSIS_DISABLED_WARNING,
  SEARCH_ANALYSIS_UNAVAILABLE_WARNING,
  SEARCH_ERROR_MESSAGES,
  createSearchFailure,
  createSearchSuccess,
  searchAnalysisSchema,
  searchDataSchema,
  searchMatchSchema,
  searchOutputShape,
  type SearchAnalysis,
  type SearchFailureInput,
  type SearchWarning
} from "./tools/schemas/search.js";
import {
  WRITE_ERROR_MESSAGES,
  WRITE_TRANSACTION_ERROR_MESSAGES,
  createWriteFailure,
  createWriteSuccess,
  createWriteSuccessV2,
  createWriteTransactionFailureV2,
  writeDataSchema,
  writeOutputShape,
  writeOutputShapeV2,
  type WriteTransactionErrorCode,
  type WriteFailureInput
} from "./tools/schemas/write.js";
import {
  EDIT_ERROR_MESSAGES,
  EDIT_TRANSACTION_ERROR_MESSAGES,
  createEditFailure,
  createEditSuccess,
  createEditSuccessV2,
  createEditTransactionFailureV2,
  editDataSchema,
  editOutputShape,
  editOutputShapeV2,
  type EditTransactionErrorCode,
  type EditFailureInput
} from "./tools/schemas/edit.js";
import {
  APPLY_PATCH_ERROR_MESSAGES,
  APPLY_PATCH_TRANSACTION_ERROR_MESSAGES,
  applyPatchDataSchema,
  applyPatchOutputShape,
  applyPatchOutputShapeV2,
  createApplyPatchFailure,
  createApplyPatchSuccess,
  createApplyPatchSuccessV2,
  createApplyPatchTransactionFailureV2,
  type ApplyPatchFailureInput
} from "./tools/schemas/applyPatch.js";
import {
  BASH_ERROR_MESSAGES,
  bashDataSchema,
  bashOutputShape,
  createBashFailure,
  createBashSuccess,
  type BashFailureInput
} from "./tools/schemas/bash.js";
import {
  OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES,
  createOpenCurrentWorkspaceFailure,
  createOpenCurrentWorkspaceSuccess,
  openCurrentWorkspaceDataSchema,
  openCurrentWorkspaceOutputShape,
  type OpenCurrentWorkspaceFailureInput
} from "./tools/schemas/openCurrentWorkspace.js";
import {
  OPEN_WORKSPACE_ERROR_MESSAGES,
  createOpenWorkspaceFailure,
  createOpenWorkspaceSuccess,
  openWorkspaceDataSchema,
  openWorkspaceOutputShape,
  type OpenWorkspaceFailureInput,
  type OpenWorkspaceRootSource
} from "./tools/schemas/openWorkspace.js";
import {
  WORKSPACE_SNAPSHOT_ERROR_MESSAGES,
  createWorkspaceSnapshotFailure,
  createWorkspaceSnapshotSuccess,
  workspaceSnapshotDataSchema,
  workspaceSnapshotOutputShape,
  type WorkspaceSnapshotFailureInput
} from "./tools/schemas/workspaceSnapshot.js";
import {
  LIST_WORKSPACES_ERROR_MESSAGES,
  createListWorkspacesFailure,
  createListWorkspacesSuccess,
  listWorkspacesDataSchema,
  listWorkspacesOutputShape,
  type ListWorkspacesFailureInput
} from "./tools/schemas/listWorkspaces.js";
import {
  CLOSE_WORKSPACE_ERROR_MESSAGES,
  closeWorkspaceOutputShape,
  createCloseWorkspaceFailure,
  createCloseWorkspaceSuccess,
  type CloseWorkspaceFailureInput
} from "./tools/schemas/closeWorkspace.js";
import {
  INSPECT_WORKSPACE_ERROR_MESSAGES,
  INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING,
  createInspectWorkspaceFailure,
  createInspectWorkspaceSuccess,
  inspectWorkspaceDataSchema,
  inspectWorkspaceOutputShape,
  inspectWorkspaceProviderSchema,
  type InspectWorkspaceFailureInput,
  type InspectWorkspaceProviderResult
} from "./tools/schemas/inspectWorkspace.js";
import {
  CODEXPRO_INVENTORY_ERROR_MESSAGES,
  CODEXPRO_INVENTORY_MCP_SERVER_LIMIT,
  codexproInventoryDataSchema,
  codexproInventoryOutputShape,
  createCodexProInventoryFailure,
  createCodexProInventorySuccess,
  type CodexProInventoryData,
  type CodexProInventoryFailureInput
} from "./tools/schemas/codexproInventory.js";
import {
  LOAD_SKILL_ERROR_MESSAGES,
  createLoadSkillFailure,
  createLoadSkillSuccess,
  loadSkillDataSchema,
  loadSkillOutputShape,
  loadSkillSelectorPathSource,
  loadSkillSelectorSchema,
  loadSkillSkillSchema,
  type LoadSkillData,
  type LoadSkillFailureInput,
  type LoadSkillSelector
} from "./tools/schemas/loadSkill.js";
import {
  READ_HANDOFF_ARTIFACT_DEFINITIONS,
  READ_HANDOFF_ERROR_MESSAGES,
  createReadHandoffFailure,
  createReadHandoffSuccess,
  readHandoffArtifactKindSchema,
  readHandoffContextDirSchema,
  readHandoffDataSchema,
  readHandoffLineCount,
  readHandoffOutputShape,
  readHandoffUnavailableSchema,
  type ReadHandoffData,
  type ReadHandoffFailureInput
} from "./tools/schemas/readHandoff.js";
import {
  WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS,
  WAIT_FOR_HANDOFF_ERROR_MESSAGES,
  createWaitForHandoffFailure,
  createWaitForHandoffSuccess,
  waitForHandoffArtifactKindSchema,
  waitForHandoffDataSchema,
  waitForHandoffLineCount,
  waitForHandoffOutputShape,
  waitForHandoffRunSchema,
  waitForHandoffRunStateSchema,
  waitForHandoffUnavailableSchema,
  type WaitForHandoffArtifact,
  type WaitForHandoffArtifactKind,
  type WaitForHandoffData,
  type WaitForHandoffFailureInput,
  type WaitForHandoffRun,
  type WaitForHandoffUnavailable
} from "./tools/schemas/waitForHandoff.js";
import {
  CODEX_CONTEXT_ERROR_MESSAGES,
  CODEX_CONTEXT_TRUNCATION_MARKER,
  codexContextDataSchema,
  codexContextOutputShape,
  codexContextPreview,
  codexContextSourcePathSchema,
  codexContextTargetPathSchema,
  codexContextUnavailableSchema,
  createCodexContextFailure,
  createCodexContextSuccess,
  type CodexContextData,
  type CodexContextFailureInput
} from "./tools/schemas/codexContext.js";
import {
  EXPORT_PRO_CONTEXT_BUNDLE_TRUNCATION_MARKER,
  EXPORT_PRO_CONTEXT_DIFF_TRUNCATION_MARKER,
  EXPORT_PRO_CONTEXT_ERROR_MESSAGES,
  createExportProContextFailure,
  createExportProContextSuccess,
  exportProContextAiUnavailableSchema,
  exportProContextDataSchema,
  exportProContextGlobSchema,
  exportProContextOutputShape,
  exportProContextPathSchema,
  exportProContextSkippedSchema,
  type ExportProContextData,
  type ExportProContextFailureInput
} from "./tools/schemas/exportProContext.js";
import {
  HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX,
  HANDOFF_TO_AGENT_ERROR_MESSAGES,
  createHandoffToAgentFailure,
  createHandoffToAgentSuccess,
  handoffToAgentDataSchema,
  handoffToAgentOutputShape,
  handoffToAgentPathSchema,
  type HandoffToAgentData,
  type HandoffToAgentFailureInput
} from "./tools/schemas/handoffToAgent.js";
import {
  HANDOFF_TO_CODEX_ERROR_MESSAGES,
  createHandoffToCodexFailure,
  createHandoffToCodexSuccess,
  handoffToCodexDataSchema,
  handoffToCodexOutputShape,
  type HandoffToCodexData,
  type HandoffToCodexFailureInput
} from "./tools/schemas/handoffToCodex.js";
import {
  CODEX_SESSIONS_ERROR_MESSAGES,
  codexSessionsOutputShape,
  codexSessionsSessionSchema,
  createCodexSessionsFailure,
  createCodexSessionsSuccess,
  type CodexSessionsData,
  type CodexSessionsFailureInput
} from "./tools/schemas/codexSessions.js";
import {
  READ_CODEX_SESSION_ERROR_MESSAGES,
  createReadCodexSessionFailure,
  createReadCodexSessionSuccess,
  readCodexSessionDataSchema,
  readCodexSessionMessageSchema,
  readCodexSessionOutputShape,
  type ReadCodexSessionData,
  type ReadCodexSessionFailureInput
} from "./tools/schemas/readCodexSession.js";

const STRUCTURED_STRING_MAX_CHARS = 30_000;

function errorText(error: unknown): string {
  if (error instanceof Error) return redactSensitiveText(`${error.name}: ${error.message}`);
  return redactSensitiveText(String(error));
}

const TREE_WINDOWS_RESERVED_SEGMENT = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

function cleanTreeDetail(value: unknown, maxLength: number, fallback: string): string {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, maxLength);
}

function safeTreeWorkspaceIdDetail(value: unknown): string {
  return cleanTreeDetail(value, 160, "[workspace id omitted]");
}

function treePathLooksUnsafeForDetails(value: string): boolean {
  const windows = value.replace(/\//g, "\\");
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return true;
  if (/^\\\\/.test(windows) || /^[A-Za-z]:/.test(windows)) return true;
  if (windows.includes(":")) return true;

  return windows
    .split(/\\+/)
    .filter(Boolean)
    .some((segment) =>
      segment !== "." &&
      segment !== ".." &&
      (segment.endsWith(".") ||
        segment.endsWith(" ") ||
        TREE_WINDOWS_RESERVED_SEGMENT.test(segment))
    );
}

function safeTreePathDetail(value: unknown): string {
  const raw = String(value ?? ".");
  if (treePathLooksUnsafeForDetails(raw)) return "[unsafe path omitted]";
  return cleanTreeDetail(raw, 240, "[path omitted]");
}

function safeApplyPatchPathDetail(value: unknown): string {
  const raw = String(value ?? ".");
  const segments = raw.replace(/\\/g, "/").split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return "[unsafe path omitted]";
  }
  return safeTreePathDetail(raw);
}

function safeBashWorkspaceIdDetail(value: unknown): string {
  return safeTreeWorkspaceIdDetail(value);
}

function safeBashSessionDetail(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(text)
    ? text
    : "session-id-omitted";
}

function safeBashPathDetail(value: unknown): string {
  const raw = String(value ?? ".");
  const segments = raw.replace(/\\/g, "/").split("/");
  if (segments.some((segment) => segment === "..")) {
    return "[unsafe path omitted]";
  }
  return safeTreePathDetail(raw);
}

const BASH_OUTSIDE_PATH_PREFIXES = [
  "Path contains a null byte.",
  "Path escapes workspace root:",
  "Path resolves outside workspace root through a symlink:",
  "Windows device paths are not allowed:",
  "UNC paths are not allowed:",
  "Drive-relative Windows paths are not allowed:",
  "NTFS alternate data stream paths are not allowed:",
  "Windows path segments may not end with a dot or space:",
  "Windows reserved device name is not allowed:"
] as const;

function nodeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

type WorkspaceSnapshotSummaryOptions = {
  includeTree: true;
  maxDepth: number;
  maxEntries: number;
  includeSkills: boolean;
  includeGlobalSkills: boolean;
};

const workspaceSnapshotProviderSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1)
}).strict();

const workspaceSnapshotProviderCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

const workspaceSnapshotSummaryProviderResultSchema = z.object({
  text: z.string().min(1),
  workspaceId: z.string().min(1),
  root: z.string().min(1),
  agentsLoaded: z.boolean(),
  agentsPath: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)),
  skillInventory: z.array(workspaceSnapshotProviderSkillSchema),
  skillCounts: workspaceSnapshotProviderCountsSchema,
  tree: z.string().min(1),
  gitStatus: z.string().min(1)
}).strict();

const workspaceSnapshotAiProviderResultSchema = z.object({
  text: z.string(),
  files: z.array(z.string().min(1))
}).strict();

const listWorkspacesProviderItemSchema = z.object({
  id: z.string().min(1),
  root: z.string().min(1),
  openedAt: z.string().min(1)
}).strict();

const listWorkspacesProviderResultSchema = z.array(listWorkspacesProviderItemSchema);

const codexproInventoryProviderSkillSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string()
}).strict();

const codexproInventoryProviderMcpServerSchema = z.object({
  name: z.string(),
  source: z.enum([
    "user codex config",
    "workspace config",
    "workspace cursor config",
    "user cursor config"
  ])
}).strict();

const codexproInventoryProviderResultSchema = z.object({
  skills: z.array(codexproInventoryProviderSkillSchema).max(500),
  skillsTruncated: z.boolean(),
  mcpServers: z.array(codexproInventoryProviderMcpServerSchema)
    .max(CODEXPRO_INVENTORY_MCP_SERVER_LIMIT),
  mcpServersTruncated: z.boolean()
}).strict();

const loadSkillProviderResultSchema = z.object({
  skill: codexproInventoryProviderSkillSchema,
  text: z.string().max(200_000),
  bytes: z.number().int().min(0).max(100_000),
  totalBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  truncated: z.boolean(),
  discoveryTruncated: z.boolean()
}).strict().superRefine((value, context) => {
  const decodedBytes = Buffer.byteLength(value.text, "utf8");
  if (decodedBytes > value.bytes * 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Decoded Skill text cannot exceed the maximum UTF-8 replacement expansion."
    });
  }
});

const codexSessionsProviderResultSchema = z.object({
  codex_dir: z.string().min(1).max(4096),
  roots: z.array(z.string().min(1).max(4096)).length(2),
  scan_file_limit: z.literal(CODEX_SESSION_SCAN_FILE_LIMIT),
  scan_depth_limit: z.literal(CODEX_SESSION_SCAN_DEPTH_LIMIT),
  scanned_file_count: z.number().int().min(0).max(CODEX_SESSION_SCAN_FILE_LIMIT),
  indexed_session_count: z.number().int().min(0).max(CODEX_SESSION_SCAN_FILE_LIMIT),
  excluded_file_count: z.number().int().min(0).max(CODEX_SESSION_SCAN_FILE_LIMIT),
  duplicate_file_count: z.number().int().min(0).max(CODEX_SESSION_SCAN_FILE_LIMIT),
  sessions: z.array(codexSessionsSessionSchema).max(200),
  total_found: z.number().int().min(0).max(CODEX_SESSION_SCAN_FILE_LIMIT),
  discovery_truncated: z.boolean()
}).strict();

const readCodexSessionProviderResultSchema = z.object({
  codex_dir: z.string().min(1).max(4096),
  roots: z.array(z.string().min(1).max(4096)).length(2),
  selection: z.enum(["session_id", "source_path", "both"]),
  requested_session_id: z.string().nullable(),
  requested_source_path: z.string().nullable(),
  max_messages: z.number().int().min(1).max(400),
  max_total_bytes: z.number().int().min(4_000).max(400_000),
  max_source_file_bytes: z.literal(CODEX_SESSION_READ_FILE_LIMIT),
  source_file_bytes: z.number().int().min(0).max(CODEX_SESSION_READ_FILE_LIMIT),
  session: codexSessionsSessionSchema,
  messages: z.array(readCodexSessionMessageSchema).max(400),
  truncation_reason: z.enum(["message_limit", "byte_limit"]).nullable()
}).strict();

const readHandoffProviderArtifactSchema = z.object({
  path: z.string().min(1).max(512),
  kind: readHandoffArtifactKindSchema,
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  lineCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  text: z.string().max(2_000_000)
}).strict().superRefine((value, context) => {
  if (value.lineCount !== readHandoffLineCount(value.text)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lineCount"],
      message: "Provider lineCount must match the complete decoded artifact."
    });
  }
  const decodedBytes = Buffer.byteLength(value.text, "utf8");
  if (decodedBytes > value.bytes * 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Provider text exceeds the maximum UTF-8 replacement expansion."
    });
  }
  if ((value.bytes === 0) !== (value.text === "")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Provider source bytes and empty-body state must agree."
    });
  }
});

const readHandoffProviderResultSchema = z.object({
  contextDir: readHandoffContextDirSchema,
  contextExists: z.boolean(),
  artifacts: z.array(readHandoffProviderArtifactSchema).max(7),
  unavailable: z.array(readHandoffUnavailableSchema).max(7)
}).strict();

const waitForHandoffStateProviderResultSchema = z.object({
  stateFile: z.string().min(1).max(512),
  present: z.boolean(),
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  text: z.string().max(200_000).nullable()
}).strict().superRefine((value, context) => {
  if (!value.present) {
    if (value.bytes !== null || value.text !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["present"],
        message: "Missing state must not include bytes or text."
      });
    }
    return;
  }
  if (value.bytes === null || value.text === null || value.bytes !== Buffer.byteLength(value.text, "utf8")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bytes"],
      message: "Present state bytes must match the complete UTF-8 text."
    });
  }
});

const waitForHandoffSourceIdentifierSchema = z.string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value, "Identifier cannot have surrounding whitespace.")
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Identifier must be one line.");

const waitForHandoffSourceStateSchema = z.object({
  version: z.literal(1),
  state: waitForHandoffRunStateSchema,
  iteration: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  plan_hash: waitForHandoffSourceIdentifierSchema,
  started_at: z.string().datetime({ offset: true }),
  finished_at: z.string().datetime({ offset: true }).nullable().optional(),
  updated_at: z.string().datetime({ offset: true }).nullable().optional(),
  executor: waitForHandoffSourceIdentifierSchema,
  model: z.string()
    .min(1)
    .max(512)
    .refine((value) => value.trim() === value, "Model cannot have surrounding whitespace.")
    .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Model must be one line.")
    .nullable()
    .optional(),
  exit_code: z.number().int().min(-2_147_483_648).max(2_147_483_647).nullable().optional(),
  timed_out: z.boolean().optional(),
  duration_ms: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional()
}).passthrough();

const waitForHandoffProviderArtifactSchema = z.object({
  path: z.string().min(1).max(512),
  kind: waitForHandoffArtifactKindSchema,
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  lineCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  text: z.string().max(200_000)
}).strict().superRefine((value, context) => {
  if (value.lineCount !== waitForHandoffLineCount(value.text)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lineCount"],
      message: "Provider lineCount must match the complete decoded artifact."
    });
  }
  if (Buffer.byteLength(value.text, "utf8") > value.bytes * 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Provider text exceeds the maximum UTF-8 replacement expansion."
    });
  }
  if ((value.bytes === 0) !== (value.text === "")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Provider source bytes and empty-body state must agree."
    });
  }
});

const waitForHandoffArtifactsProviderResultSchema = z.object({
  contextDir: readHandoffContextDirSchema,
  requestedKinds: z.array(waitForHandoffArtifactKindSchema).min(1).max(4),
  artifacts: z.array(waitForHandoffProviderArtifactSchema).max(4),
  unavailable: z.array(waitForHandoffUnavailableSchema).max(4)
}).strict();

const codexContextProviderResultSchema = z.object({
  text: z.string(),
  workspaceId: z.string().min(1).max(160),
  root: z.string().min(1),
  targetPath: codexContextTargetPathSchema,
  targetKind: z.enum(["file", "directory", "missing"]),
  agentsFiles: z.array(codexContextSourcePathSchema).max(256),
  aiContextExists: z.boolean().nullable(),
  aiContextFiles: z.array(codexContextSourcePathSchema).max(7),
  unavailableSources: z.array(codexContextUnavailableSchema).max(263),
  gitStatus: z.string().optional(),
  gitDiff: z.string().optional()
}).strict();

const exportProContextProviderResultSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  root: z.string().min(1),
  path: exportProContextPathSchema,
  title: z.string().min(1).max(200).refine(
    (value) => value.trim() === value && !/[\r\n\u0000-\u001f\u007f]/.test(value),
    "Export title must be one bounded line."
  ),
  selectedPaths: z.array(exportProContextPathSchema).max(80),
  extraGlobs: z.array(exportProContextGlobSchema).max(32),
  includeImportantFiles: z.boolean(),
  includeChangedFiles: z.boolean(),
  includeDiff: z.boolean(),
  includeAiBridge: z.boolean(),
  maxDepth: z.number().int().min(1).max(6),
  maxFiles: z.number().int().min(1).max(80),
  maxFileBytes: z.number().int().min(1_000).max(250_000),
  maxDiffBytes: z.number().int().min(1_000).max(2_000_000),
  maxTotalBytes: z.number().int().min(1_000).max(2_000_000),
  changedFileCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  candidateCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  omittedCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  filesIncluded: z.array(exportProContextPathSchema).max(80),
  filesSkipped: z.array(exportProContextSkippedSchema).max(80),
  aiContextFiles: z.array(exportProContextPathSchema).max(7),
  aiContextUnavailable: z.array(exportProContextAiUnavailableSchema).max(7),
  createdContextFiles: z.array(exportProContextPathSchema).max(9),
  existed: z.boolean(),
  sourceMarkdown: z.string().max(32_000_000),
  markdown: z.string().max(2_000_000),
  sourceBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  bytes: z.number().int().min(0).max(2_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  diffTruncated: z.boolean(),
  bundleTruncated: z.boolean(),
  truncated: z.boolean(),
  outputLimited: z.boolean(),
  redacted: z.boolean()
}).strict();

const handoffToAgentProviderResultSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  root: z.string().min(1).max(32_000),
  agent: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  agentName: z.string().min(1).max(80),
  model: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(120),
  updatedAt: z.string().datetime({ offset: true }),
  appendRequested: z.boolean(),
  appendApplied: z.boolean(),
  maxWriteBytes: z.number().int().min(1).max(32_000_000),
  planPath: handoffToAgentPathSchema,
  statusPath: handoffToAgentPathSchema,
  legacyCodexStatusPath: handoffToAgentPathSchema,
  diffPath: handoffToAgentPathSchema,
  logPath: handoffToAgentPathSchema,
  executionLogPath: handoffToAgentPathSchema,
  createdContextFiles: z.array(handoffToAgentPathSchema).max(9),
  planFileExistedBefore: z.boolean(),
  priorPlanAvailable: z.boolean(),
  previousText: z.string().max(32_000_000),
  previousBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  finalPlan: z.string().min(1).max(32_000_000),
  planBytes: z.number().int().min(1).max(32_000_000),
  planSha256: z.string().regex(/^[a-f0-9]{64}$/),
  additions: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  deletions: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  changed: z.boolean(),
  diff: z.string().min(1).max(60_100),
  diffBytes: z.number().int().min(1).max(240_400),
  diffTruncated: z.boolean(),
  loggedPaths: z.array(handoffToAgentPathSchema).length(2),
  event: z.string().min(1).max(100_000),
  eventBytes: z.number().int().min(1).max(100_000),
  eventSha256: z.string().regex(/^[a-f0-9]{64}$/),
  prompt: z.string().min(1).max(20_000),
  promptBytes: z.number().int().min(1).max(80_000)
}).strict();

function codexproInventoryFailureText(failure: CodexProInventoryFailureInput): string {
  return [
    "# CodexPro Inventory Error",
    "",
    `Code: ${failure.code}`,
    CODEXPRO_INVENTORY_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function codexproInventorySkillCounts(
  skills: CodexProInventoryData["skills"]
): CodexProInventoryData["skill_counts"] {
  const counts = { total: skills.length, workspace: 0, user: 0, plugin: 0, other: 0 };
  for (const skill of skills) counts[skill.source] += 1;
  return counts;
}

function codexproInventorySuccessText(data: CodexProInventoryData): string {
  const skillLines = data.skills.length
    ? data.skills.map((skill) =>
        `- ${skill.name} [${skill.source}]${skill.description ? ` - ${skill.description}` : ""}`
      )
    : ["- none discovered"];
  const mcpLines = data.mcp_servers.length
    ? data.mcp_servers.map((server) => `- ${server.name} (${server.source})`)
    : ["- none discovered"];
  return [
    "# CodexPro Inventory",
    "",
    `Workspace: ${data.root}`,
    `Bash mode: ${data.bash_mode}`,
    `Write mode: ${data.write_mode}`,
    `Tool mode: ${data.tool_mode}`,
    `Global Skills: ${data.include_global_skills ? "included" : "workspace only"}`,
    `MCP servers: ${data.include_mcp_servers ? "included" : "excluded"}`,
    `Skill limit: ${data.max_skills}`,
    "",
    "## Skill summary",
    "",
    `Total returned: ${data.skill_count}`,
    `Workspace: ${data.skill_counts.workspace}`,
    `User: ${data.skill_counts.user}`,
    `Plugin: ${data.skill_counts.plugin}`,
    `Other: ${data.skill_counts.other}`,
    ...(data.skills_truncated ? ["Result limited: more Skills are available."] : []),
    "",
    ...skillLines,
    "",
    "## MCP servers",
    "",
    `Total returned: ${data.mcp_server_count}`,
    ...(data.mcp_servers_truncated ? ["Result limited: more MCP server names are configured."] : []),
    "",
    ...mcpLines
  ].join("\n");
}

interface NormalizedLoadSkillRequest {
  selector: LoadSkillSelector;
  options: LoadSkillProviderContext["options"];
}

function loadSkillSourceMatchesPath(
  source: SkillInventoryItem["source"],
  pathSource: SkillInventoryItem["source"]
): boolean {
  return source === pathSource ||
    ((source === "user" || source === "plugin") && pathSource === "user");
}

function normalizeLoadSkillRequest(
  args: Record<string, unknown>
): NormalizedLoadSkillRequest | LoadSkillFailureInput {
  const name = String(args.name ?? "").trim();
  if (!name || name.length > 240 || /[\r\n\u0000-\u001f\u007f]/.test(name)) {
    return {
      code: "INVALID_SKILL_SELECTOR",
      details: { field: "name", reason: "unsafe_name" }
    };
  }

  const source = args.source as SkillInventoryItem["source"] | undefined;
  const requestedPath = typeof args.path === "string" ? args.path.trim() : undefined;
  let pathSource: SkillInventoryItem["source"] | undefined;
  if (requestedPath !== undefined) {
    pathSource = loadSkillSelectorPathSource(requestedPath);
    if (!requestedPath || !pathSource) {
      return {
        code: "INVALID_SKILL_SELECTOR",
        details: { field: "path", reason: "unsafe_path" }
      };
    }
    if (source && !loadSkillSourceMatchesPath(source, pathSource)) {
      return {
        code: "INVALID_SKILL_SELECTOR",
        details: { field: "path", reason: "source_path_mismatch" }
      };
    }
  }

  const selector = loadSkillSelectorSchema.parse({
    name,
    source: source ?? null,
    path: requestedPath ?? null
  });
  const includeGlobalDefault = source !== "workspace" && pathSource !== "workspace";
  const includeGlobal = parseBool(args.include_global_skills, includeGlobalDefault);
  const maxSkills = limitInt(args.max_skills, 500, 1, 500);
  const maxBytes = limitInt(args.max_bytes, 40_000, 1_000, 100_000);

  return {
    selector,
    options: {
      name,
      source,
      path: requestedPath,
      includeGlobal,
      maxSkills,
      maxBytes
    }
  };
}

function normalizeLoadSkillItem(value: SkillInventoryItem): LoadSkillData["skill"] {
  return loadSkillSkillSchema.parse({
    name: value.name,
    description: value.description ?? null,
    source: value.source,
    path: value.path
  });
}

const LOAD_SKILL_DOMAIN_ERROR_CODES = new Set<LoadSkillError["code"]>([
  "SKILL_NOT_FOUND",
  "SKILL_AMBIGUOUS",
  "SKILL_RESOLUTION_LIMIT_REACHED",
  "SKILL_BOUNDARY_VIOLATION",
  "SKILL_READ_FAILED"
]);

function recognizedLoadSkillError(error: unknown): LoadSkillError | undefined {
  if (error instanceof LoadSkillError) return error;
  if (!(error instanceof Error) || error.name !== "LoadSkillError") return undefined;
  const candidate = error as Error & {
    code?: unknown;
    context?: unknown;
  };
  if (
    typeof candidate.code !== "string" ||
    !LOAD_SKILL_DOMAIN_ERROR_CODES.has(candidate.code as LoadSkillError["code"]) ||
    !candidate.context ||
    typeof candidate.context !== "object" ||
    Array.isArray(candidate.context)
  ) {
    return undefined;
  }
  return candidate as LoadSkillError;
}

function classifyLoadSkillProviderFailure(
  error: unknown,
  request: NormalizedLoadSkillRequest
): LoadSkillFailureInput {
  const domainError = recognizedLoadSkillError(error);
  if (!domainError) {
    return { code: "INTERNAL_ERROR", details: {} };
  }

  if (domainError.code === "SKILL_NOT_FOUND" || domainError.code === "SKILL_RESOLUTION_LIMIT_REACHED") {
    return {
      code: domainError.code,
      details: {
        selector: request.selector,
        include_global_skills: request.options.includeGlobal,
        max_skills: request.options.maxSkills
      }
    };
  }

  if (domainError.code === "SKILL_AMBIGUOUS") {
    try {
      const candidates = (domainError.context.candidates ?? []).map(normalizeLoadSkillItem);
      if (candidates.length < 2 || candidates.length > 8) {
        return { code: "INTERNAL_ERROR", details: {} };
      }
      const candidatesTruncated = domainError.context.candidatesTruncated === true;
      if (candidatesTruncated && candidates.length !== 8) {
        return { code: "INTERNAL_ERROR", details: {} };
      }
      return {
        code: "SKILL_AMBIGUOUS",
        details: {
          selector: request.selector,
          candidates,
          candidates_truncated: candidatesTruncated,
          resolution_truncated: domainError.context.discoveryTruncated === true
        }
      };
    } catch {
      return { code: "INTERNAL_ERROR", details: {} };
    }
  }

  if (domainError.code === "SKILL_BOUNDARY_VIOLATION" || domainError.code === "SKILL_READ_FAILED") {
    try {
      if (!domainError.context.skill) return { code: "INTERNAL_ERROR", details: {} };
      return {
        code: domainError.code,
        details: { skill: normalizeLoadSkillItem(domainError.context.skill) }
      };
    } catch {
      return { code: "INTERNAL_ERROR", details: {} };
    }
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

function loadSkillFailureText(failure: LoadSkillFailureInput): string {
  const lines = [
    "# Load Skill Error",
    "",
    `Code: ${failure.code}`,
    LOAD_SKILL_ERROR_MESSAGES[failure.code]
  ];
  if (failure.code === "SKILL_AMBIGUOUS") {
    lines.push("", `Multiple skills named ${failure.details.selector.name} were found. Pass an exact source and path.`);
  } else if (failure.code === "SKILL_NOT_FOUND") {
    lines.push("", `Skill not found: ${failure.details.selector.name}`);
  }
  return lines.join("\n");
}

function loadSkillFailureResult(failure: LoadSkillFailureInput, startedAt: number): any {
  return {
    ...textResult(
      loadSkillFailureText(failure),
      createLoadSkillFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}

function readHandoffFailureText(failure: ReadHandoffFailureInput): string {
  return [
    "# Read Handoff Error",
    "",
    `Code: ${failure.code}`,
    READ_HANDOFF_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function readHandoffFailureResult(failure: ReadHandoffFailureInput, startedAt: number): any {
  return {
    ...textResult(
      readHandoffFailureText(failure),
      createReadHandoffFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}

function readHandoffSuccessText(data: ReadHandoffData): string {
  const lines = [
    "# Read Handoff",
    "",
    `Workspace: ${data.workspace_id}`,
    `Root: ${data.root}`,
    `Context directory: ${data.context_dir}`,
    `Context exists: ${data.context_exists ? "yes" : "no"}`,
    `Readable artifacts: ${data.file_count}`,
    `Unavailable artifacts: ${data.unavailable_count}`,
    `Loaded bytes: ${data.loaded_bytes}/${data.max_total_bytes}`,
    `Per-file limit: ${data.max_file_bytes}`
  ];

  if (!data.context_exists) {
    lines.push(
      "",
      "No handoff context exists yet. Use handoff_to_agent or handoff_to_codex when a plan is ready."
    );
    return lines.join("\n");
  }

  if (data.unavailable.length > 0) {
    lines.push(
      "",
      "## Unavailable artifacts",
      "",
      ...data.unavailable.map((item) =>
        `- ${item.path}: ${item.reason}${item.bytes === null ? "" : ` (${item.bytes} bytes)`}`
      )
    );
  }
  for (const artifact of data.artifacts) {
    lines.push(
      "",
      `## ${artifact.path}`,
      "",
      `Kind: ${artifact.kind}; source bytes: ${artifact.bytes}; returned bytes: ${artifact.returned_bytes}; lines: ${artifact.line_count}; redacted: ${artifact.redacted ? "yes" : "no"}`,
      "",
      artifact.text
    );
  }
  return lines.join("\n");
}

function waitForHandoffFailureText(failure: WaitForHandoffFailureInput): string {
  return [
    "# Wait For Handoff Error",
    "",
    `Code: ${failure.code}`,
    WAIT_FOR_HANDOFF_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function waitForHandoffFailureResult(failure: WaitForHandoffFailureInput, startedAt: number): any {
  return {
    ...textResult(
      waitForHandoffFailureText(failure),
      createWaitForHandoffFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}

function codexContextFailureText(failure: CodexContextFailureInput): string {
  return [
    "# Codex Context Error",
    "",
    `Code: ${failure.code}`,
    CODEX_CONTEXT_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function codexContextFailureResult(failure: CodexContextFailureInput, startedAt: number): any {
  return {
    ...textResult(
      codexContextFailureText(failure),
      createCodexContextFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}

function classifyCodexContextTargetFailure(error: unknown): CodexContextFailureInput {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Path is blocked by safety rules:")) {
    return { code: "TARGET_PATH_BLOCKED", details: { source: "target_path" } };
  }
  const outsidePrefixes = [
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Write path resolves through a parent outside the workspace:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];
  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return { code: "TARGET_PATH_OUTSIDE_WORKSPACE", details: { source: "target_path" } };
  }
  return { code: "TARGET_PATH_INVALID", details: { source: "target_path" } };
}

function exportProContextFailureText(failure: ExportProContextFailureInput): string {
  return [
    "# Export Pro Context Error",
    "",
    `Code: ${failure.code}`,
    EXPORT_PRO_CONTEXT_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function exportProContextFailureResult(failure: ExportProContextFailureInput, startedAt: number): any {
  return {
    ...textResult(
      exportProContextFailureText(failure),
      createExportProContextFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}

function exportProContextSuccessText(data: ExportProContextData): string {
  return [
    "# Export Pro Context",
    "",
    `Wrote ${data.path}.`,
    `Bytes: ${data.bytes}`,
    `SHA-256: ${data.sha256}`,
    `Files included: ${data.file_count}`,
    `Files skipped: ${data.skipped_count}`,
    `Candidates omitted: ${data.omitted_count}`,
    `AI context files: ${data.ai_context_file_count}`,
    `Scaffold files created: ${data.created_context_file_count}`,
    `Replaced existing export: ${data.existed ? "yes" : "no"}`,
    `Output limited: ${data.output_limited ? "yes" : "no"}`,
    `Redacted: ${data.redacted ? "yes" : "no"}`,
    "",
    `Paste ${data.path} into a high-context planning model when MCP tools are unavailable, then save the returned plan with codexpro pro-apply.`
  ].join("\n");
}

function handoffToAgentFailureText(failure: HandoffToAgentFailureInput): string {
  return [
    "# Handoff To Agent Error",
    "",
    `Code: ${failure.code}`,
    HANDOFF_TO_AGENT_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function handoffToAgentFailureResult(failure: HandoffToAgentFailureInput, startedAt: number): any {
  return {
    ...textResult(
      handoffToAgentFailureText(failure),
      createHandoffToAgentFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}

function handoffToAgentSuccessText(data: HandoffToAgentData): string {
  const diffPreview = previewText(data.diff, 50, 12_000);
  return [
    "# Handoff To Agent",
    "",
    `Agent: ${data.agent_name} (${data.agent})`,
    ...(data.model ? [`Model: ${data.model}`] : []),
    `Wrote ${data.plan_path}.`,
    `Plan SHA-256: ${data.plan_sha256}`,
    `Append: ${data.append_applied ? "applied" : data.append_requested ? "requested; new plan created" : "not requested"}`,
    `Status path: ${data.status_path}`,
    `Diff path: ${data.diff_path}`,
    `Logs: ${data.log_path}, ${data.execution_log_path}`,
    `Diff stats: +${data.additions} -${data.deletions}`,
    "",
    "Agent prompt:",
    "",
    "```text",
    data.prompt,
    "```",
    ...(diffPreview ? ["", "```diff", diffPreview, "```"] : [])
  ].join("\n");
}

function handoffToCodexFailureText(failure: HandoffToCodexFailureInput): string {
  return [
    "# Handoff To Codex Error",
    "",
    `Code: ${failure.code}`,
    HANDOFF_TO_CODEX_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function handoffToCodexFailureResult(failure: HandoffToCodexFailureInput, startedAt: number): any {
  return {
    ...textResult(
      handoffToCodexFailureText(failure),
      createHandoffToCodexFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}

function handoffToCodexSuccessText(data: HandoffToCodexData): string {
  const diffPreview = previewText(data.diff, 50, 12_000);
  return [
    "# Handoff To Codex",
    "",
    `Wrote ${data.plan_path}.`,
    `Plan SHA-256: ${data.plan_sha256}`,
    `Append: ${data.append_applied ? "applied" : data.append_requested ? "requested; new plan created" : "not requested"}`,
    `Status path: ${data.status_path}`,
    `Diff path: ${data.diff_path}`,
    `Logs: ${data.log_path}, ${data.execution_log_path}`,
    `Diff stats: +${data.additions} -${data.deletions}`,
    "",
    "Codex prompt:",
    "",
    "```text",
    data.prompt,
    "```",
    ...(diffPreview ? ["", "```diff", diffPreview, "```"] : [])
  ].join("\n");
}

interface NormalizedCodexSessionsRequest {
  maxSessions: number;
  query?: string;
}

function normalizeCodexSessionsRequest(
  args: Record<string, unknown>
): NormalizedCodexSessionsRequest {
  const maxSessions = typeof args.max_sessions === "number"
    ? args.max_sessions
    : 30;
  const normalizedQuery = typeof args.query === "string"
    ? args.query
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  return {
    maxSessions,
    ...(normalizedQuery ? { query: normalizedQuery } : {})
  };
}

function codexSessionMatchesQuery(
  session: CodexSessionsData["sessions"][number],
  query: string
): boolean {
  const haystack = [
    session.session_id,
    session.title,
    session.project_dir,
    session.source_path
  ].filter((value): value is string => typeof value === "string").join("\n");
  return haystack.toLowerCase().includes(query.toLowerCase());
}

function validateCodexSessionsProviderResult(
  config: CodexProConfig,
  request: NormalizedCodexSessionsRequest,
  rawResult: unknown
): CodexSessionsData {
  const result = codexSessionsProviderResultSchema.parse(rawResult);
  const expectedDirectory = codexSessionDirectory(config);
  const expectedRoots = codexSessionRoots(config);
  if (
    result.codex_dir !== expectedDirectory ||
    result.roots.some(
      (root, index) => root !== expectedRoots[index]!
    )
  ) {
    throw new CodexProError("Codex session Provider identity mismatch.");
  }
  if (
    request.query &&
    result.sessions.some(
      (session) => !codexSessionMatchesQuery(session, request.query!)
    )
  ) {
    throw new CodexProError("Codex session Provider query mismatch.");
  }
  if (config.codexSessions === "off") {
    throw new CodexProError("Codex session Provider used while disabled.");
  }

  const sessionCount = result.sessions.length;
  const resultsTruncated = result.total_found > sessionCount;
  return {
    codex_dir: result.codex_dir,
    roots: result.roots,
    codex_sessions_mode: config.codexSessions,
    tool_mode: config.toolMode,
    query: request.query ?? null,
    max_sessions: request.maxSessions,
    scan_file_limit: result.scan_file_limit,
    scan_depth_limit: result.scan_depth_limit,
    scanned_file_count: result.scanned_file_count,
    indexed_session_count: result.indexed_session_count,
    excluded_file_count: result.excluded_file_count,
    duplicate_file_count: result.duplicate_file_count,
    sessions: result.sessions,
    session_count: sessionCount,
    total_found: result.total_found,
    discovery_truncated: result.discovery_truncated,
    results_truncated: resultsTruncated,
    output_limited: result.discovery_truncated || resultsTruncated
  };
}

function codexSessionsFailureText(failure: CodexSessionsFailureInput): string {
  return [
    "# Codex Sessions Error",
    "",
    `Code: ${failure.code}`,
    CODEX_SESSIONS_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function codexSessionsFailureResult(
  failure: CodexSessionsFailureInput,
  startedAt: number
): any {
  return {
    ...textResult(
      codexSessionsFailureText(failure),
      createCodexSessionsFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}

function codexSessionsSuccessText(data: CodexSessionsData): string {
  const visibleSessions = data.sessions.slice(0, 30);
  const rows = visibleSessions.length
    ? visibleSessions.map((session) => [
        `- ${session.session_id}`,
        session.title ?? "(untitled)",
        session.storage,
        session.project_dir
          ? `cwd=${cleanOneLine(session.project_dir, "[path omitted]", 240)}`
          : "cwd=(unknown)",
        session.resume_command
      ].join(" | "))
    : ["- No Codex sessions found."];
  const hiddenCount = data.sessions.length - visibleSessions.length;
  return [
    "# Codex Sessions",
    "",
    `Codex dir: ${data.codex_dir}`,
    `Session mode: ${data.codex_sessions_mode}`,
    `Tool mode: ${data.tool_mode}`,
    `Query: ${data.query ?? "(none)"}`,
    `Scanned files: ${data.scanned_file_count}`,
    `Indexed sessions: ${data.indexed_session_count}`,
    `Excluded files: ${data.excluded_file_count}`,
    `Duplicate files: ${data.duplicate_file_count}`,
    `Matched sessions: ${data.total_found}`,
    `Returned sessions: ${data.session_count}`,
    `Output limited: ${data.output_limited ? "yes" : "no"}`,
    "",
    ...rows,
    ...(hiddenCount > 0
      ? ["", `${hiddenCount} additional sessions are available in structured data.`]
      : [])
  ].join("\n");
}

export interface NormalizedReadCodexSessionRequest {
  selection: "session_id" | "source_path" | "both";
  sessionId?: string;
  sourcePath?: string;
  maxMessages: number;
  maxTotalBytes: number;
}

type ReadCodexSessionRequestPreparation =
  | { ok: true; request: NormalizedReadCodexSessionRequest }
  | { ok: false; failure: ReadCodexSessionFailureInput };

function normalizeReadCodexSessionRequest(
  args: Record<string, unknown>
): ReadCodexSessionRequestPreparation {
  const sessionId = typeof args.session_id === "string"
    ? args.session_id
    : undefined;
  const sourcePath = typeof args.source_path === "string"
    ? args.source_path
    : undefined;
  if (!sessionId && !sourcePath) {
    return {
      ok: false,
      failure: {
        code: "REQUEST_INVALID",
        details: { reason: "selector_required" }
      }
    };
  }
  if (
    sessionId !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sessionId)
  ) {
    return {
      ok: false,
      failure: {
        code: "REQUEST_INVALID",
        details: { reason: "session_id_invalid" }
      }
    };
  }
  if (
    sourcePath !== undefined &&
    (
      sourcePath.length === 0 ||
      sourcePath.trim() !== sourcePath ||
      /[\r\n\u0000-\u001f\u007f]/.test(sourcePath) ||
      !path.isAbsolute(sourcePath) ||
      path.resolve(sourcePath) !== sourcePath
    )
  ) {
    return {
      ok: false,
      failure: {
        code: "REQUEST_INVALID",
        details: { reason: "source_path_invalid" }
      }
    };
  }

  const selection = sessionId && sourcePath
    ? "both"
    : sourcePath
      ? "source_path"
      : "session_id";
  return {
    ok: true,
    request: Object.freeze({
      selection,
      ...(sessionId ? { sessionId } : {}),
      ...(sourcePath ? { sourcePath } : {}),
      maxMessages: typeof args.max_messages === "number" ? args.max_messages : 80,
      maxTotalBytes: typeof args.max_total_bytes === "number"
        ? args.max_total_bytes
        : 80_000
    })
  };
}

function validateReadCodexSessionProviderResult(
  config: CodexProConfig,
  request: NormalizedReadCodexSessionRequest,
  rawResult: unknown
): ReadCodexSessionData {
  const result = readCodexSessionProviderResultSchema.parse(rawResult);
  if (hasSecretValue(JSON.stringify(result))) {
    throw new CodexProError("Codex transcript Provider returned sensitive identity data.");
  }
  const expectedDirectory = codexSessionDirectory(config);
  const expectedRoots = codexSessionRoots(config);
  if (
    config.codexSessions !== "read" ||
    result.codex_dir !== expectedDirectory ||
    result.roots.some((root, index) => root !== expectedRoots[index]!) ||
    result.selection !== request.selection ||
    result.requested_session_id !== (request.sessionId ?? null) ||
    result.requested_source_path !== (request.sourcePath ?? null) ||
    result.max_messages !== request.maxMessages ||
    result.max_total_bytes !== request.maxTotalBytes
  ) {
    throw new CodexProError("Codex transcript Provider identity mismatch.");
  }

  const contentBytes = result.messages.reduce(
    (total, message) => total + message.bytes,
    0
  );
  const redactedMessageCount = result.messages.filter(
    (message) => message.redacted
  ).length;
  const truncatedMessageCount = result.messages.filter(
    (message) => message.truncated
  ).length;
  const truncated = result.truncation_reason !== null;
  return readCodexSessionDataSchema.parse({
    codex_dir: result.codex_dir,
    roots: result.roots,
    codex_sessions_mode: "read",
    tool_mode: config.toolMode,
    selection: result.selection,
    requested_session_id: result.requested_session_id,
    requested_source_path: result.requested_source_path,
    max_messages: result.max_messages,
    max_total_bytes: result.max_total_bytes,
    max_source_file_bytes: result.max_source_file_bytes,
    source_file_bytes: result.source_file_bytes,
    session: result.session,
    messages: result.messages,
    message_count: result.messages.length,
    content_bytes: contentBytes,
    redacted_message_count: redactedMessageCount,
    truncated_message_count: truncatedMessageCount,
    truncated,
    truncation_reason: result.truncation_reason,
    output_limited: truncated
  });
}

function internalReadCodexSessionFailure(): ReadCodexSessionFailureInput {
  return { code: "INTERNAL_ERROR", details: {} };
}

function readCodexSessionOperationFailure(
  error: CodexSessionReadOperationError
): ReadCodexSessionFailureInput {
  const keys = Object.keys(error.details);
  if (error.code === "SESSION_NOT_FOUND") {
    const selector = error.details.selector;
    return keys.length === 1 &&
      (selector === "session_id" || selector === "source_path")
      ? { code: error.code, details: { selector } }
      : internalReadCodexSessionFailure();
  }
  if (error.code === "SESSION_RESOLUTION_INCOMPLETE") {
    return keys.length === 1 && error.details.selector === "session_id"
      ? { code: error.code, details: { selector: "session_id" } }
      : internalReadCodexSessionFailure();
  }
  if (error.code === "SESSION_FILE_TOO_LARGE") {
    return keys.length === 1 &&
      error.details.max_source_file_bytes === CODEX_SESSION_READ_FILE_LIMIT
      ? {
          code: error.code,
          details: { max_source_file_bytes: CODEX_SESSION_READ_FILE_LIMIT }
        }
      : internalReadCodexSessionFailure();
  }
  if (keys.length !== 0) return internalReadCodexSessionFailure();
  if (
    error.code === "SOURCE_PATH_OUTSIDE_ROOTS" ||
    error.code === "SESSION_ID_MISMATCH" ||
    error.code === "SESSION_READ_FAILED"
  ) {
    return { code: error.code, details: {} };
  }
  return internalReadCodexSessionFailure();
}

function readCodexSessionFailureText(
  failure: ReadCodexSessionFailureInput
): string {
  return [
    "# Codex Session Read Error",
    "",
    `Code: ${failure.code}`,
    READ_CODEX_SESSION_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function readCodexSessionFailureResult(
  failure: ReadCodexSessionFailureInput,
  startedAt: number
): any {
  return {
    ...textResult(
      readCodexSessionFailureText(failure),
      createReadCodexSessionFailure(failure, Date.now() - startedAt)
    ),
    isError: true
  };
}

function readCodexSessionSuccessText(data: ReadCodexSessionData): string {
  const transcript = data.messages.map((message) => {
    const when = message.timestamp !== null
      ? ` ${new Date(message.timestamp).toISOString()}`
      : "";
    return [
      `### ${message.ordinal}. ${message.role} (${message.kind})${when}`,
      "",
      message.content
    ].join("\n");
  }).join("\n\n");
  return [
    "# Codex Session",
    "",
    `Selection: ${data.selection}`,
    `Session: ${data.session.session_id}`,
    `Title: ${cleanOneLine(data.session.title, "(untitled)", 160)}`,
    `Source: ${data.session.source_path}`,
    `Source snapshot bytes: ${data.source_file_bytes}`,
    `Message limit: ${data.max_messages}`,
    `Content byte limit: ${data.max_total_bytes}`,
    `Returned messages: ${data.message_count}`,
    `Returned content bytes: ${data.content_bytes}`,
    `Redacted messages: ${data.redacted_message_count}`,
    `Truncated messages: ${data.truncated_message_count}`,
    `Truncation reason: ${data.truncation_reason ?? "none"}`,
    "",
    "## Transcript",
    "",
    transcript || "No readable transcript messages found."
  ].join("\n");
}

const HANDOFF_OPERATION_CODES = new Set([
  "REQUEST_INVALID",
  "OUTPUT_PATH_BLOCKED",
  "OUTPUT_PATH_OUTSIDE_WORKSPACE",
  "OUTPUT_PATH_INVALID",
  "EXISTING_PLAN_TOO_LARGE",
  "EXISTING_PLAN_NOT_TEXT",
  "EXISTING_PLAN_READ_FAILED",
  "PLAN_TOO_LARGE",
  "PLAN_SECRET_BLOCKED",
  "SCAFFOLD_WRITE_FAILED",
  "PLAN_WRITE_FAILED",
  "LOG_WRITE_FAILED",
  "HANDOFF_WRITE_FAILED"
]);

function recognizedHandoffOperationError(error: unknown): HandoffOperationError | undefined {
  if (error instanceof HandoffOperationError) return error;
  if (!(error instanceof Error) || error.name !== "HandoffOperationError") return undefined;
  const candidate = error as Error & { code?: unknown; source?: unknown };
  if (typeof candidate.code !== "string" || !HANDOFF_OPERATION_CODES.has(candidate.code)) return undefined;
  return candidate as HandoffOperationError;
}

function classifyHandoffOperationFailure(
  error: unknown,
  fallback: "HANDOFF_WRITE_FAILED" | "INTERNAL_ERROR"
): HandoffToAgentFailureInput {
  const domain = recognizedHandoffOperationError(error);
  if (!domain) return { code: fallback, details: {} };
  if (domain.code === "REQUEST_INVALID") {
    if (
      domain.source === "agent" ||
      domain.source === "agent_name" ||
      domain.source === "model" ||
      domain.source === "title" ||
      domain.source === "plan" ||
      domain.source === "append"
    ) {
      return { code: domain.code, details: { source: domain.source } };
    }
    return { code: "INTERNAL_ERROR", details: {} };
  }
  if (
    domain.code === "OUTPUT_PATH_BLOCKED" ||
    domain.code === "OUTPUT_PATH_OUTSIDE_WORKSPACE" ||
    domain.code === "OUTPUT_PATH_INVALID"
  ) {
    return { code: domain.code, details: { source: "context_dir" } };
  }
  if (
    domain.code === "EXISTING_PLAN_TOO_LARGE" ||
    domain.code === "EXISTING_PLAN_NOT_TEXT" ||
    domain.code === "EXISTING_PLAN_READ_FAILED" ||
    domain.code === "PLAN_TOO_LARGE" ||
    domain.code === "PLAN_SECRET_BLOCKED" ||
    domain.code === "SCAFFOLD_WRITE_FAILED" ||
    domain.code === "PLAN_WRITE_FAILED" ||
    domain.code === "LOG_WRITE_FAILED" ||
    domain.code === "HANDOFF_WRITE_FAILED"
  ) {
    return { code: domain.code, details: {} };
  }
  return { code: "INTERNAL_ERROR", details: {} };
}

function classifyHandoffToCodexOperationFailure(
  error: unknown,
  fallback: "HANDOFF_WRITE_FAILED" | "INTERNAL_ERROR"
): HandoffToCodexFailureInput {
  const failure = classifyHandoffOperationFailure(error, fallback);
  if (failure.code === "REQUEST_INVALID") {
    if (
      failure.details.source === "title" ||
      failure.details.source === "plan" ||
      failure.details.source === "append"
    ) {
      return failure as HandoffToCodexFailureInput;
    }
    return { code: "INTERNAL_ERROR", details: {} };
  }
  return failure as HandoffToCodexFailureInput;
}

async function readExactFileTail(absPath: string, byteCount: number): Promise<Buffer> {
  const stat = await fsp.stat(absPath);
  if (!stat.isFile() || stat.size < byteCount) throw new CodexProError("Handoff log tail is unavailable.");
  const buffer = Buffer.alloc(byteCount);
  const handle = await fsp.open(absPath, "r");
  try {
    let offset = 0;
    while (offset < byteCount) {
      const { bytesRead } = await handle.read(buffer, offset, byteCount - offset, stat.size - byteCount + offset);
      if (bytesRead === 0) throw new CodexProError("Handoff log tail ended unexpectedly.");
      offset += bytesRead;
    }
    return buffer;
  } finally {
    await handle.close();
  }
}

async function validateHandoffProviderResult(
  context: AgentHandoffProviderContext,
  rawResult: unknown
): Promise<HandoffWriteResult> {
  const { config, guard, workspace, request, output } = context;
  const result = handoffToAgentProviderResultSchema.parse(rawResult);
  const expectedLoggedPaths = [request.logPath, request.executionLogPath];
  if (
    result.workspaceId !== workspace.id ||
    result.root !== workspace.root ||
    result.agent !== request.agent ||
    result.agentName !== request.agentName ||
    result.model !== request.model ||
    result.title !== request.title ||
    result.updatedAt !== request.updatedAt ||
    result.appendRequested !== request.appendRequested ||
    result.appendApplied !== output.appendApplied ||
    result.maxWriteBytes !== config.maxWriteBytes ||
    result.planPath !== request.planPath ||
    result.statusPath !== request.statusPath ||
    result.legacyCodexStatusPath !== request.legacyCodexStatusPath ||
    result.diffPath !== request.diffPath ||
    result.logPath !== request.logPath ||
    result.executionLogPath !== request.executionLogPath ||
    !sameStringSequence(result.createdContextFiles, output.expectedCreatedContextFiles) ||
    result.planFileExistedBefore !== output.planFileExistedBefore ||
    result.priorPlanAvailable !== output.priorPlanAvailable ||
    result.previousText !== output.previousText ||
    result.previousBytes !== Buffer.byteLength(result.previousText, "utf8") ||
    result.previousBytes !== output.previousBytes ||
    result.finalPlan !== output.finalPlan ||
    result.planBytes !== Buffer.byteLength(result.finalPlan, "utf8") ||
    result.planBytes !== output.planBytes ||
    result.planSha256 !== createHash("sha256").update(result.finalPlan).digest("hex") ||
    result.planSha256 !== output.planSha256 ||
    result.additions !== output.diff.additions ||
    result.deletions !== output.diff.deletions ||
    result.changed !== output.diff.changed ||
    result.diff !== output.diff.diff ||
    result.diffBytes !== Buffer.byteLength(result.diff, "utf8") ||
    result.diffBytes !== output.diffBytes ||
    result.diffTruncated !== result.diff.endsWith(HANDOFF_TO_AGENT_DIFF_TRUNCATION_SUFFIX) ||
    result.diffTruncated !== output.diffTruncated ||
    !sameStringSequence(result.loggedPaths, expectedLoggedPaths) ||
    result.event !== output.event ||
    result.eventBytes !== Buffer.byteLength(result.event, "utf8") ||
    result.eventBytes !== output.eventBytes ||
    result.eventSha256 !== createHash("sha256").update(result.event).digest("hex") ||
    result.eventSha256 !== output.eventSha256 ||
    result.prompt !== request.prompt ||
    result.promptBytes !== Buffer.byteLength(result.prompt, "utf8")
  ) {
    throw new CodexProError("Handoff provider identity or integrity mismatch.");
  }

  const pending = pendingWorkspaceMutation(rawResult);
  if (!pending) {
    const planResolved = guard.resolve(workspace, result.planPath);
    await guard.assertTextFile(planResolved.absPath, config.maxWriteBytes);
    const planArtifact = await fsp.readFile(planResolved.absPath);
    if (
      planArtifact.byteLength !== result.planBytes ||
      !planArtifact.equals(Buffer.from(result.finalPlan, "utf8")) ||
      createHash("sha256").update(planArtifact).digest("hex") !== result.planSha256
    ) {
      throw new CodexProError("Handoff plan artifact integrity mismatch.");
    }

    for (const logPath of expectedLoggedPaths) {
      const resolved = guard.resolve(workspace, logPath);
      const tail = await readExactFileTail(resolved.absPath, result.eventBytes);
      if (
        !tail.equals(Buffer.from(result.event, "utf8")) ||
        createHash("sha256").update(tail).digest("hex") !== result.eventSha256
      ) {
        throw new CodexProError("Handoff log artifact integrity mismatch.");
      }
    }
  }

  return pending ? attachPendingWorkspaceMutation(result, pending) : result;
}

function carryPendingMutation<T extends object>(source: unknown, result: T): T {
  const pending = pendingWorkspaceMutation(source);
  return pending ? attachPendingWorkspaceMutation(result, pending) : result;
}

const PRO_CONTEXT_OPERATION_CODES = new Set([
  "REQUEST_INVALID",
  "SELECTION_PATH_BLOCKED",
  "SELECTION_PATH_OUTSIDE_WORKSPACE",
  "OUTPUT_PATH_BLOCKED",
  "OUTPUT_PATH_OUTSIDE_WORKSPACE",
  "CONTEXT_BUILD_FAILED",
  "CONTEXT_WRITE_FAILED"
]);

function recognizedProContextOperationError(error: unknown): ProContextOperationError | undefined {
  if (error instanceof ProContextOperationError) return error;
  if (!(error instanceof Error) || error.name !== "ProContextOperationError") return undefined;
  const candidate = error as Error & { code?: unknown; source?: unknown };
  if (typeof candidate.code !== "string" || !PRO_CONTEXT_OPERATION_CODES.has(candidate.code)) return undefined;
  return candidate as ProContextOperationError;
}

function classifyProContextOperationFailure(
  error: unknown,
  fallback: "CONTEXT_EXPORT_FAILED" | "INTERNAL_ERROR"
): ExportProContextFailureInput {
  const domain = recognizedProContextOperationError(error);
  if (!domain) return { code: fallback, details: {} };
  if (domain.code === "REQUEST_INVALID") {
    if (domain.source === "title" || domain.source === "selected_paths" || domain.source === "extra_globs") {
      return { code: domain.code, details: { source: domain.source } };
    }
    return { code: "INTERNAL_ERROR", details: {} };
  }
  if (domain.code === "SELECTION_PATH_BLOCKED" || domain.code === "SELECTION_PATH_OUTSIDE_WORKSPACE") {
    return { code: domain.code, details: { source: "selected_paths" } };
  }
  if (domain.code === "OUTPUT_PATH_BLOCKED" || domain.code === "OUTPUT_PATH_OUTSIDE_WORKSPACE") {
    return { code: domain.code, details: { source: "context_dir" } };
  }
  if (domain.code === "CONTEXT_BUILD_FAILED" || domain.code === "CONTEXT_WRITE_FAILED") {
    return { code: domain.code, details: {} };
  }
  return { code: "INTERNAL_ERROR", details: {} };
}

function sameStringSequence(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function normalizeWaitForHandoffRunText(text: string): WaitForHandoffRun {
  const source = waitForHandoffSourceStateSchema.parse(JSON.parse(text));
  const executor = redactSensitiveText(source.executor);
  const model = source.model === undefined || source.model === null
    ? null
    : redactSensitiveText(source.model);
  return waitForHandoffRunSchema.parse({
    version: source.version,
    state: source.state,
    iteration: source.iteration,
    plan_hash: source.plan_hash,
    started_at: source.started_at,
    finished_at: source.finished_at ?? null,
    updated_at: source.updated_at ?? null,
    executor,
    model,
    exit_code: source.exit_code ?? null,
    timed_out: source.timed_out ?? false,
    duration_ms: source.duration_ms ?? null,
    redacted: executor !== source.executor || model !== (source.model ?? null)
  });
}

function utf8Prefix(text: string, maxBytes: number): string {
  if (maxBytes <= 0 || text.length === 0) return "";
  let output = "";
  let bytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) break;
    output += character;
    bytes += characterBytes;
  }
  return output;
}

function boundedWaitExcerpt(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  const marker = "\n...[excerpt truncated]";
  const markerBytes = Buffer.byteLength(marker, "utf8");
  if (markerBytes >= maxBytes) {
    return { text: utf8Prefix(text, maxBytes), truncated: true };
  }
  return {
    text: `${utf8Prefix(text, maxBytes - markerBytes)}${marker}`,
    truncated: true
  };
}

function boundedCodexContext(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  const markerBytes = Buffer.byteLength(CODEX_CONTEXT_TRUNCATION_MARKER, "utf8");
  return {
    text: `${utf8Prefix(text, Math.max(0, maxBytes - markerBytes))}${CODEX_CONTEXT_TRUNCATION_MARKER}`,
    truncated: true
  };
}

function buildWaitForHandoffArtifacts(
  raw: z.infer<typeof waitForHandoffArtifactsProviderResultSchema>,
  requestedKinds: WaitForHandoffArtifactKind[],
  limits: WaitForHandoffLimits
): {
  artifacts: WaitForHandoffArtifact[];
  unavailable: WaitForHandoffUnavailable[];
  returnedBytes: number;
  outputLimited: boolean;
  redacted: boolean;
} {
  const rawArtifacts = new Map(raw.artifacts.map((artifact) => [artifact.kind, artifact]));
  const rawUnavailable = new Map(raw.unavailable.map((item) => [item.kind, item]));
  const artifacts: WaitForHandoffArtifact[] = [];
  const unavailable: WaitForHandoffUnavailable[] = [];
  let returnedBytes = 0;

  for (const definition of WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS) {
    if (!requestedKinds.includes(definition.kind)) continue;
    const source = rawArtifacts.get(definition.kind);
    if (!source) {
      const missing = rawUnavailable.get(definition.kind);
      if (missing) unavailable.push(missing);
      continue;
    }

    const remainingBytes = limits.maxTotalBytes - returnedBytes;
    if (remainingBytes <= 0) {
      unavailable.push({
        path: source.path,
        kind: source.kind,
        reason: "output_limit",
        bytes: source.bytes
      });
      continue;
    }

    let body = source.text;
    let selectionTruncated = false;
    if (definition.tailLines !== null) {
      const lines = source.text.split(/\r?\n/).filter(Boolean);
      selectionTruncated = lines.length > definition.tailLines;
      body = lines.slice(-definition.tailLines).join("\n");
    }
    const safeBody = redactSensitiveText(body);
    const redacted = safeBody !== body;
    const excerpt = boundedWaitExcerpt(
      safeBody,
      Math.min(definition.excerptBytes, remainingBytes)
    );
    const returned = Buffer.byteLength(excerpt.text, "utf8");
    artifacts.push({
      path: source.path,
      kind: source.kind,
      source_bytes: source.bytes,
      line_count: waitForHandoffLineCount(excerpt.text),
      returned_bytes: returned,
      truncated: selectionTruncated || excerpt.truncated,
      redacted,
      text: excerpt.text
    });
    returnedBytes += returned;
  }

  return {
    artifacts,
    unavailable,
    returnedBytes,
    outputLimited:
      artifacts.some((artifact) => artifact.truncated) ||
      unavailable.some((item) => item.reason === "too_large" || item.reason === "output_limit"),
    redacted: artifacts.some((artifact) => artifact.redacted)
  };
}

function waitForHandoffKindsAreInFixedOrder(
  items: ReadonlyArray<{ kind: WaitForHandoffArtifactKind }>
): boolean {
  let previousIndex = -1;
  for (const item of items) {
    const currentIndex = WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS.findIndex(
      (definition) => definition.kind === item.kind
    );
    if (currentIndex <= previousIndex) return false;
    previousIndex = currentIndex;
  }
  return true;
}

function waitForHandoffSuccessText(data: WaitForHandoffData): string {
  const summary = data.awaited_terminal
    ? `Matched terminal handoff run: ${data.state}.`
    : data.state_present
      ? "No matching terminal run was observed before the deadline."
      : `No handoff run state was found at ${data.state_file}.`;
  const lines = [
    "# Wait For Handoff",
    "",
    summary,
    "",
    `Workspace: ${data.workspace_id}`,
    `Root: ${data.root}`,
    `State file: ${data.state_file}`,
    `Wait outcome: ${data.wait_outcome}`,
    `Returned bytes: ${data.returned_bytes}/${data.max_total_bytes}`
  ];
  if (data.run) {
    lines.push(
      `Observed run: ${data.run.state}; iteration ${data.run.iteration}; exit ${data.run.exit_code ?? "null"}`,
      `Plan hash mismatch: ${data.plan_hash_mismatch ? "yes" : "no"}`,
      `Iteration stale: ${data.iteration_stale ? "yes" : "no"}`
    );
  }
  if (data.unavailable.length > 0) {
    lines.push(
      "",
      "## Unavailable artifacts",
      "",
      ...data.unavailable.map((item) =>
        `- ${item.path}: ${item.reason}${item.bytes === null ? "" : ` (${item.bytes} bytes)`}`
      )
    );
  }
  for (const artifact of data.artifacts) {
    lines.push(
      "",
      `## ${artifact.path}`,
      "",
      `Kind: ${artifact.kind}; source bytes: ${artifact.source_bytes}; returned bytes: ${artifact.returned_bytes}; lines: ${artifact.line_count}; truncated: ${artifact.truncated ? "yes" : "no"}; redacted: ${artifact.redacted ? "yes" : "no"}`,
      "",
      artifact.text
    );
  }
  return lines.join("\n");
}

const INSPECT_OUTSIDE_PATH_PREFIXES = [
  "Path contains a null byte.",
  "Path escapes workspace root:",
  "Path resolves outside workspace root through a symlink:",
  "Windows device paths are not allowed:",
  "UNC paths are not allowed:",
  "Drive-relative Windows paths are not allowed:",
  "NTFS alternate data stream paths are not allowed:",
  "Windows path segments may not end with a dot or space:",
  "Windows reserved device name is not allowed:"
] as const;

function safeInspectPathDetail(value: unknown): string {
  const raw = String(value ?? ".");
  if (raw !== ".") {
    const segments = raw.replace(/\\/g, "/").split("/");
    if (segments.some((segment) => segment === "." || segment === "..")) {
      return "[unsafe path omitted]";
    }
  }
  return safeTreePathDetail(raw);
}

function classifyInspectWorkspaceFailure(
  error: unknown,
  args: Record<string, unknown>
): InspectWorkspaceFailureInput {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }
  if (message.startsWith("Path is blocked by safety rules:")) {
    return {
      code: "PATH_BLOCKED",
      details: { path: safeInspectPathDetail(args.path ?? ".") }
    };
  }
  if (INSPECT_OUTSIDE_PATH_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      details: { path: safeInspectPathDetail(args.path ?? ".") }
    };
  }
  return { code: "INTERNAL_ERROR", details: {} };
}

function inspectWorkspaceFailureText(failure: InspectWorkspaceFailureInput): string {
  return [
    "# Inspect Workspace Error",
    "",
    `Code: ${failure.code}`,
    INSPECT_WORKSPACE_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function validateInspectProviderResult(
  result: InspectWorkspaceProviderResult,
  workspace: Workspace,
  guard: PathGuard
): InspectWorkspaceProviderResult {
  if (result.workspaceId !== workspace.id || result.root !== workspace.root) {
    throw new CodexProError("Invalid inspect provider workspace identity.");
  }

  const canonicalPath = (value: string): string => {
    const resolved = guard.resolve(workspace, value);
    const normalized = resolved.relPath.replace(/^\.\/?$/, ".");
    if (normalized !== value) {
      throw new CodexProError("Invalid inspect provider path normalization.");
    }
    return normalized;
  };

  const filePaths = new Set(result.files.map((file) => canonicalPath(file.path)));
  for (const entrypoint of result.entrypoints) {
    if (!filePaths.has(canonicalPath(entrypoint))) {
      throw new CodexProError("Invalid inspect provider entrypoint.");
    }
  }
  for (const importantFile of result.importantFiles) {
    if (!filePaths.has(canonicalPath(importantFile))) {
      throw new CodexProError("Invalid inspect provider important file.");
    }
  }
  for (const area of result.areas) canonicalPath(area.path);
  for (const symbol of result.symbols) {
    if (!filePaths.has(canonicalPath(symbol.path))) {
      throw new CodexProError("Invalid inspect provider symbol path.");
    }
  }
  for (const relationship of result.relationships) {
    if (!filePaths.has(canonicalPath(relationship.from)) ||
        !filePaths.has(canonicalPath(relationship.to))) {
      throw new CodexProError("Invalid inspect provider relationship path.");
    }
  }
  return result;
}

type WorkspaceSnapshotSummaryProviderResult = z.infer<
  typeof workspaceSnapshotSummaryProviderResultSchema
>;

type WorkspaceSnapshotAiProviderResult = z.infer<
  typeof workspaceSnapshotAiProviderResultSchema
>;

const WORKSPACE_SNAPSHOT_AI_CONTEXT_NAMES = [
  "current-plan.md",
  "agent-status.md",
  "implementation-diff.patch",
  "codex-status.md",
  "decisions.md",
  "open-questions.md",
  "execution-log.jsonl"
] as const;

type OpenCurrentWorkspaceSummaryOptions = {
  includeTree: boolean;
  maxDepth: number;
  includeSkills: boolean;
  includeGlobalSkills: boolean;
};

const openCurrentWorkspaceProviderSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1)
}).strict();

const openCurrentWorkspaceProviderCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

const openCurrentWorkspaceProviderResultSchema = z.object({
  text: z.string().min(1),
  workspaceId: z.string().min(1),
  root: z.string().min(1),
  agentsLoaded: z.boolean(),
  agentsPath: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)),
  skillInventory: z.array(openCurrentWorkspaceProviderSkillSchema),
  skillCounts: openCurrentWorkspaceProviderCountsSchema,
  tree: z.string().min(1).optional(),
  gitStatus: z.string().min(1)
}).strict();

type OpenCurrentWorkspaceProviderResult = z.infer<typeof openCurrentWorkspaceProviderResultSchema>;

function expectedOpenCurrentWorkspaceSkillCounts(
  inventory: OpenCurrentWorkspaceProviderResult["skillInventory"]
): OpenCurrentWorkspaceProviderResult["skillCounts"] {
  const counts = { total: inventory.length, workspace: 0, user: 0, plugin: 0, other: 0 };
  for (const skill of inventory) counts[skill.source] += 1;
  return counts;
}

function validateOpenCurrentWorkspaceProviderResult(
  result: OpenCurrentWorkspaceProviderResult,
  workspace: Workspace,
  guard: PathGuard,
  options: OpenCurrentWorkspaceSummaryOptions
): Array<{
  name: string;
  description: string | null;
  source: "workspace" | "user" | "plugin" | "other";
  path: string;
}> {
  if (result.workspaceId !== workspace.id) {
    throw new CodexProError("Open current workspace provider returned a mismatched workspace id.");
  }
  if (result.root !== workspace.root) {
    throw new CodexProError("Open current workspace provider returned a mismatched root.");
  }
  if (result.agentsLoaded !== Boolean(result.agentsPath)) {
    throw new CodexProError("Open current workspace provider returned inconsistent AGENTS state.");
  }
  if (result.agentsPath) {
    const resolvedAgents = guard.resolve(workspace, result.agentsPath);
    if (resolvedAgents.relPath !== result.agentsPath) {
      throw new CodexProError("Open current workspace provider returned a non-normalized AGENTS path.");
    }
  }

  const expectedNames = result.skillInventory.map((skill) => skill.name);
  if (
    expectedNames.length !== result.skills.length ||
    expectedNames.some((name, index) => result.skills[index] !== name)
  ) {
    throw new CodexProError("Open current workspace provider returned mismatched skill names.");
  }

  const expectedCounts = expectedOpenCurrentWorkspaceSkillCounts(result.skillInventory);
  for (const key of ["total", "workspace", "user", "plugin", "other"] as const) {
    if (result.skillCounts[key] !== expectedCounts[key]) {
      throw new CodexProError("Open current workspace provider returned mismatched skill counts.");
    }
  }

  if (!options.includeSkills && (result.skills.length || result.skillInventory.length || result.skillCounts.total)) {
    throw new CodexProError("Open current workspace provider returned skills when discovery was disabled.");
  }
  if (options.includeTree !== Boolean(result.tree)) {
    throw new CodexProError("Open current workspace provider returned inconsistent tree inclusion.");
  }

  return result.skillInventory.map((skill) => ({
    name: skill.name,
    description: skill.description ?? null,
    source: skill.source,
    path: skill.path
  }));
}

function classifyOpenCurrentWorkspaceFailure(error: unknown): OpenCurrentWorkspaceFailureInput {
  const message = error instanceof Error ? error.message : String(error);
  const filesystemCode = nodeErrorCode(error);
  const details = { source: "configured_default_root" } as const;

  if (message.startsWith("Workspace root does not exist:") || filesystemCode === "ENOENT") {
    return { code: "DEFAULT_ROOT_NOT_FOUND", details };
  }
  if (message.startsWith("Workspace root is not a directory:")) {
    return { code: "DEFAULT_ROOT_NOT_DIRECTORY", details };
  }
  if (message.startsWith("Workspace root is outside allowed roots:")) {
    return { code: "ROOT_NOT_ALLOWED", details };
  }
  if (filesystemCode === "EACCES" || filesystemCode === "EPERM" || filesystemCode === "EBUSY") {
    return { code: "WORKSPACE_OPEN_FAILED", details };
  }
  return { code: "INTERNAL_ERROR", details: {} };
}

type OpenWorkspaceSummaryOptions = {
  includeTree: boolean;
  maxDepth: number;
  maxEntries: number;
  includeSkills: boolean;
  includeGlobalSkills: boolean;
};

const openWorkspaceProviderSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1)
}).strict();

const openWorkspaceProviderCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  workspace: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  plugin: z.number().int().nonnegative(),
  other: z.number().int().nonnegative()
}).strict();

const openWorkspaceProviderResultSchema = z.object({
  text: z.string().min(1),
  workspaceId: z.string().min(1),
  root: z.string().min(1),
  agentsLoaded: z.boolean(),
  agentsPath: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)),
  skillInventory: z.array(openWorkspaceProviderSkillSchema),
  skillCounts: openWorkspaceProviderCountsSchema,
  tree: z.string().min(1).optional(),
  gitStatus: z.string().min(1)
}).strict();

type OpenWorkspaceProviderResult = z.infer<typeof openWorkspaceProviderResultSchema>;

function expectedOpenWorkspaceSkillCounts(
  inventory: OpenWorkspaceProviderResult["skillInventory"]
): OpenWorkspaceProviderResult["skillCounts"] {
  const counts = { total: inventory.length, workspace: 0, user: 0, plugin: 0, other: 0 };
  for (const skill of inventory) counts[skill.source] += 1;
  return counts;
}

function validateOpenWorkspaceProviderResult(
  result: OpenWorkspaceProviderResult,
  workspace: Workspace,
  guard: PathGuard,
  options: OpenWorkspaceSummaryOptions
): Array<{
  name: string;
  description: string | null;
  source: "workspace" | "user" | "plugin" | "other";
  path: string;
}> {
  if (result.workspaceId !== workspace.id) {
    throw new CodexProError("Open workspace provider returned a mismatched workspace id.");
  }
  if (result.root !== workspace.root) {
    throw new CodexProError("Open workspace provider returned a mismatched root.");
  }
  if (result.agentsLoaded !== Boolean(result.agentsPath)) {
    throw new CodexProError("Open workspace provider returned inconsistent AGENTS state.");
  }
  if (result.agentsPath) {
    const resolvedAgents = guard.resolve(workspace, result.agentsPath);
    if (resolvedAgents.relPath !== result.agentsPath) {
      throw new CodexProError("Open workspace provider returned a non-normalized AGENTS path.");
    }
  }

  const expectedNames = result.skillInventory.map((skill) => skill.name);
  if (
    expectedNames.length !== result.skills.length ||
    expectedNames.some((name, index) => result.skills[index] !== name)
  ) {
    throw new CodexProError("Open workspace provider returned mismatched skill names.");
  }

  const expectedCounts = expectedOpenWorkspaceSkillCounts(result.skillInventory);
  for (const key of ["total", "workspace", "user", "plugin", "other"] as const) {
    if (result.skillCounts[key] !== expectedCounts[key]) {
      throw new CodexProError("Open workspace provider returned mismatched skill counts.");
    }
  }

  if (!options.includeSkills && (result.skills.length || result.skillInventory.length || result.skillCounts.total)) {
    throw new CodexProError("Open workspace provider returned skills when discovery was disabled.");
  }
  if (
    options.includeSkills &&
    !options.includeGlobalSkills &&
    result.skillInventory.some((skill) => skill.source !== "workspace")
  ) {
    throw new CodexProError("Open workspace provider returned global skills when global discovery was disabled.");
  }
  if (options.includeTree !== Boolean(result.tree)) {
    throw new CodexProError("Open workspace provider returned inconsistent tree inclusion.");
  }

  return result.skillInventory.map((skill) => ({
    name: skill.name,
    description: skill.description ?? null,
    source: skill.source,
    path: skill.path
  }));
}

function expectedWorkspaceSnapshotSkillCounts(
  inventory: WorkspaceSnapshotSummaryProviderResult["skillInventory"]
): WorkspaceSnapshotSummaryProviderResult["skillCounts"] {
  const counts = {
    total: inventory.length,
    workspace: 0,
    user: 0,
    plugin: 0,
    other: 0
  };
  for (const skill of inventory) counts[skill.source] += 1;
  return counts;
}

function validateWorkspaceSnapshotSummary(
  result: WorkspaceSnapshotSummaryProviderResult,
  workspace: Workspace,
  guard: PathGuard,
  options: WorkspaceSnapshotSummaryOptions
): Array<{
  name: string;
  description: string | null;
  source: "workspace" | "user" | "plugin" | "other";
  path: string;
}> {
  if (result.workspaceId !== workspace.id) {
    throw new CodexProError("Workspace snapshot provider returned a mismatched workspace id.");
  }
  if (result.root !== workspace.root) {
    throw new CodexProError("Workspace snapshot provider returned a mismatched root.");
  }
  if (result.agentsLoaded !== Boolean(result.agentsPath)) {
    throw new CodexProError("Workspace snapshot provider returned inconsistent AGENTS state.");
  }
  if (result.agentsPath) {
    const resolvedAgents = guard.resolve(workspace, result.agentsPath);
    if (resolvedAgents.relPath !== result.agentsPath) {
      throw new CodexProError("Workspace snapshot provider returned a non-normalized AGENTS path.");
    }
  }

  const expectedNames = result.skillInventory.map((skill) => skill.name);
  if (
    expectedNames.length !== result.skills.length ||
    expectedNames.some((name, index) => result.skills[index] !== name)
  ) {
    throw new CodexProError("Workspace snapshot provider returned mismatched skill names.");
  }

  const expectedCounts = expectedWorkspaceSnapshotSkillCounts(result.skillInventory);
  for (const key of ["total", "workspace", "user", "plugin", "other"] as const) {
    if (result.skillCounts[key] !== expectedCounts[key]) {
      throw new CodexProError("Workspace snapshot provider returned mismatched skill counts.");
    }
  }

  if (
    !options.includeSkills &&
    (result.skills.length || result.skillInventory.length || result.skillCounts.total)
  ) {
    throw new CodexProError("Workspace snapshot provider returned skills when discovery was disabled.");
  }
  if (
    options.includeSkills &&
    !options.includeGlobalSkills &&
    result.skillInventory.some((skill) => skill.source !== "workspace")
  ) {
    throw new CodexProError("Workspace snapshot provider returned global skills when global discovery was disabled.");
  }

  return result.skillInventory.map((skill) => ({
    name: skill.name,
    description: skill.description ?? null,
    source: skill.source,
    path: skill.path
  }));
}

function validateWorkspaceSnapshotAiFiles(
  result: WorkspaceSnapshotAiProviderResult,
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace
): string[] {
  const approved = new Set(
    WORKSPACE_SNAPSHOT_AI_CONTEXT_NAMES.map((name) =>
      guard.resolve(workspace, `${config.contextDir}/${name}`).relPath
    )
  );
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const file of result.files) {
    const relPath = guard.resolve(workspace, file).relPath;
    if (!approved.has(relPath)) {
      throw new CodexProError("Workspace snapshot AI provider returned an unapproved context file.");
    }
    if (seen.has(relPath)) {
      throw new CodexProError("Workspace snapshot AI provider returned a duplicate context file.");
    }
    seen.add(relPath);
    normalized.push(relPath);
  }

  return normalized;
}

function classifyWorkspaceSnapshotWorkspaceFailure(
  args: Record<string, unknown>
): WorkspaceSnapshotFailureInput {
  return args.workspace_id
    ? {
        code: "WORKSPACE_NOT_FOUND",
        details: {
          source: "workspace_id",
          workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
        }
      }
    : {
        code: "WORKSPACE_NOT_FOUND",
        details: { source: "default_workspace", workspace_id: null }
      };
}

function workspaceSnapshotFailureText(failure: WorkspaceSnapshotFailureInput): string {
  return [
    "# Workspace Snapshot Error",
    "",
    `Code: ${failure.code}`,
    WORKSPACE_SNAPSHOT_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

function listWorkspacesFailureText(failure: ListWorkspacesFailureInput): string {
  return [
    "# List Workspaces Error",
    "",
    `Code: ${failure.code}`,
    LIST_WORKSPACES_ERROR_MESSAGES[failure.code]
  ].join("\n");
}

class OpenWorkspaceAliasConflictError extends CodexProError {
  constructor() {
    super("open_workspace root/path alias conflict");
  }
}

type OpenWorkspaceRootSelection = {
  requestedRoot?: string;
  source: OpenWorkspaceRootSource;
};

function resolveOpenWorkspaceRoot(args: Record<string, unknown>): OpenWorkspaceRootSelection {
  const root = typeof args.root === "string" ? args.root.trim() : "";
  const alias = typeof args.path === "string" ? args.path.trim() : "";
  if (root && alias && root !== alias) {
    throw new OpenWorkspaceAliasConflictError();
  }
  if (root) return { requestedRoot: root, source: "root" };
  if (alias) return { requestedRoot: alias, source: "path" };
  return { source: "configured_default_root" };
}

const OPEN_WORKSPACE_INVALID_PATH_PREFIXES = [
  "Path contains a null byte.",
  "Windows device paths are not allowed:",
  "UNC paths are not allowed:",
  "Drive-relative Windows paths are not allowed:",
  "NTFS alternate data stream paths are not allowed:",
  "Windows path segments may not end with a dot or space:",
  "Windows reserved device name is not allowed:"
] as const;

function classifyOpenWorkspaceRootFailure(
  error: unknown,
  source: OpenWorkspaceRootSource
): OpenWorkspaceFailureInput {
  if (error instanceof OpenWorkspaceAliasConflictError) {
    return { code: "ROOT_ALIAS_CONFLICT", details: { fields: ["root", "path"] } };
  }

  const message = error instanceof Error ? error.message : String(error);
  const filesystemCode = nodeErrorCode(error);
  const details = { source };

  if (OPEN_WORKSPACE_INVALID_PATH_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return { code: "ROOT_PATH_INVALID", details };
  }
  if (message.startsWith("Workspace root does not exist:") || filesystemCode === "ENOENT") {
    return { code: "ROOT_NOT_FOUND", details };
  }
  if (message.startsWith("Workspace root is not a directory:") || filesystemCode === "ENOTDIR") {
    return { code: "ROOT_NOT_DIRECTORY", details };
  }
  if (message.startsWith("Workspace root is outside allowed roots:")) {
    return { code: "ROOT_NOT_ALLOWED", details };
  }
  return { code: "WORKSPACE_OPEN_FAILED", details };
}

function classifyBashFailure(
  error: unknown,
  args: Record<string, unknown>,
  config: CodexProConfig
): BashFailureInput {
  const message = error instanceof Error ? error.message : String(error);
  const filesystemCode = nodeErrorCode(error);

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeBashWorkspaceIdDetail(args.workspace_id) }
    };
  }
  if (!String(args.command ?? "").trim() || message === "command is required.") {
    return {
      code: "INVALID_ARGUMENT",
      details: { argument: "command", reason: "empty" }
    };
  }
  if (message === "bash session guard is enabled but no server bash session id is configured.") {
    return {
      code: "BASH_SESSION_CONFIGURATION_INVALID",
      details: { reason: "missing_server_session_id" }
    };
  }
  if (message.startsWith("bash session id is required.")) {
    return {
      code: "BASH_SESSION_REQUIRED",
      details: { expected_session_id: safeBashSessionDetail(config.bashSessionId) }
    };
  }
  if (message.startsWith("bash session id mismatch.")) {
    return {
      code: "BASH_SESSION_MISMATCH",
      details: { expected_session_id: safeBashSessionDetail(config.bashSessionId) }
    };
  }
  if (message.startsWith("Command is blocked in CODEXPRO_BASH_MODE=safe:")) {
    return {
      code: "COMMAND_POLICY_DENIED",
      details: { reason: "blocked_pattern" }
    };
  }
  if (message.startsWith("Command is not in the safe bash allowlist:")) {
    return {
      code: "COMMAND_POLICY_DENIED",
      details: { reason: "not_allowlisted" }
    };
  }
  if (message.startsWith("Bash backend is unavailable.")) {
    return {
      code: "SHELL_BACKEND_UNAVAILABLE",
      details: { backend: "bash" }
    };
  }
  if (message.startsWith("Path is blocked by safety rules:")) {
    return {
      code: "PATH_BLOCKED",
      details: { path: safeBashPathDetail(args.cwd ?? ".") }
    };
  }
  if (BASH_OUTSIDE_PATH_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      details: { path: safeBashPathDetail(args.cwd ?? ".") }
    };
  }
  if (filesystemCode === "ENOENT" || filesystemCode === "EACCES" || filesystemCode === "EPERM") {
    return {
      code: "COMMAND_START_FAILED",
      details: { backend: "bash" }
    };
  }
  return { code: "INTERNAL_ERROR", details: {} };
}

function classifyTreeFailure(error: unknown, args: Record<string, unknown>): TreeFailureInput {
  const message = error instanceof Error ? error.message : String(error);

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  if (nodeErrorCode(error) === "ENOENT") {
    return {
      code: "FILE_NOT_FOUND",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }

  if (message.startsWith("Path is blocked by safety rules:")) {
    return {
      code: "PATH_BLOCKED",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }

  if (message.startsWith("Not a directory:")) {
    return {
      code: "NOT_A_DIRECTORY",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }

  const outsidePrefixes = [
    "Path contains a null byte.",
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];

  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      details: { path: safeTreePathDetail(args.path ?? ".") }
    };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

function effectiveReadMaxBytes(config: CodexProConfig, args: Record<string, unknown>): number {
  const requested = typeof args.max_bytes === "number" ? args.max_bytes : config.maxReadBytes;
  return Math.min(requested, config.maxReadBytes);
}

function classifyReadFailure(
  error: unknown,
  args: Record<string, unknown>,
  config: CodexProConfig
): ReadFailureInput {
  const message = error instanceof Error ? error.message : String(error);
  const pathDetail = safeTreePathDetail(args.path ?? "[path omitted]");

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  const filesystemCode = nodeErrorCode(error);
  if (filesystemCode === "ENOENT") {
    return { code: "FILE_NOT_FOUND", details: { path: pathDetail } };
  }

  if (message.startsWith("Path is blocked by safety rules:")) {
    return { code: "PATH_BLOCKED", details: { path: pathDetail } };
  }

  if (
    message.startsWith("Not a file:") ||
    filesystemCode === "EISDIR" ||
    filesystemCode === "ENOTDIR"
  ) {
    return { code: "NOT_A_FILE", details: { path: pathDetail } };
  }

  const hasRange = args.start_line !== undefined || args.end_line !== undefined;
  if (message.startsWith("File is too large (")) {
    return {
      code: "FILE_TOO_LARGE",
      details: {
        path: pathDetail,
        scope: "file",
        limit_bytes: hasRange ? textScanByteLimit(config) : effectiveReadMaxBytes(config, args)
      }
    };
  }

  if (message.startsWith("Selected line range is too large.")) {
    return {
      code: "FILE_TOO_LARGE",
      details: {
        path: pathDetail,
        scope: "selection",
        limit_bytes: effectiveReadMaxBytes(config, args)
      }
    };
  }

  if (message === "Refusing to read binary file.") {
    return { code: "FILE_NOT_TEXT", details: { path: pathDetail } };
  }

  if (
    message.startsWith("end_line (") &&
    message.includes("must be >= start_line (")
  ) {
    return {
      code: "INVALID_LINE_RANGE",
      details: {
        path: pathDetail,
        start_line: typeof args.start_line === "number" ? args.start_line : 1,
        end_line: typeof args.end_line === "number" ? args.end_line : null
      }
    };
  }

  const outsidePrefixes = [
    "Path contains a null byte.",
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];

  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return { code: "PATH_OUTSIDE_WORKSPACE", details: { path: pathDetail } };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

const writeProviderResultSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  existed: z.boolean(),
  diff: z.object({
    diff: z.string(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    changed: z.boolean()
  }).strict()
}).strict().superRefine((value, context) => {
  if (!value.diff.changed && (value.diff.additions !== 0 || value.diff.deletions !== 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["diff", "changed"],
      message: "Unchanged write results require zero diff statistics."
    });
  }
});

const editProviderResultSchema = z.object({
  path: z.string().min(1),
  replacements: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  diff: z.object({
    diff: z.string(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    changed: z.boolean()
  }).strict()
}).strict().superRefine((value, context) => {
  if (!value.diff.changed && (value.diff.additions !== 0 || value.diff.deletions !== 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["diff", "changed"],
      message: "Unchanged edit results require zero diff statistics."
    });
  }
});

const PUBLIC_MUTATION_FAILURE_CODES = new Set<WriteTransactionErrorCode>([
  "FILE_VERSION_CONFLICT",
  "TRANSACTION_BUSY",
  "ATOMIC_BACKEND_UNAVAILABLE",
  "AUDIT_UNAVAILABLE",
  "AUDIT_INTEGRITY_FAILURE",
  "TRANSACTION_FAILED",
  "ROLLBACK_FAILED",
  "TRANSACTION_RECOVERY_REQUIRED"
]);

function publicMutationFailureCode(error: unknown): WriteTransactionErrorCode | null {
  if (error instanceof AuditError) {
    return error.code === "AUDIT_UNAVAILABLE" || error.code === "AUDIT_INTEGRITY_FAILURE"
      ? error.code
      : "AUDIT_UNAVAILABLE";
  }
  if (!(error instanceof TransactionError)) return null;
  if (PUBLIC_MUTATION_FAILURE_CODES.has(error.code as WriteTransactionErrorCode)) {
    return error.code as WriteTransactionErrorCode;
  }
  return error.code === "TRANSACTION_STATE_CORRUPT"
    ? "TRANSACTION_RECOVERY_REQUIRED"
    : "TRANSACTION_FAILED";
}

function publicMutationFailurePath(error: unknown, fallback: unknown): string {
  const relativePath = error instanceof TransactionError
    ? error.safeDetails.relativePath
    : undefined;
  return safeTreePathDetail(typeof relativePath === "string" ? relativePath : fallback);
}

function resultDurationMs(result: unknown): number {
  const duration = (result as {
    structuredContent?: { meta?: { durationMs?: unknown } };
  })?.structuredContent?.meta?.durationMs;
  return typeof duration === "number" && Number.isFinite(duration) && duration >= 0
    ? duration
    : 0;
}

const applyPatchProviderResultSchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
  stdout: z.string(),
  stderr: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changed: z.literal(true),
  diff: z.string().min(1)
}).strict().superRefine((value, context) => {
  if (new Set(value.paths).size !== value.paths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paths"],
      message: "Patch provider paths must be unique."
    });
  }
});

const bashProviderResultSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1),
  exitCode: z.number().int().nonnegative().nullable(),
  signal: z.custom<NodeJS.Signals>((value) =>
    typeof value === "string" && value.length > 0 && value.length <= 64
  ).nullable(),
  durationMs: z.number().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  bashSessionId: z.string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    .optional()
}).strict();

function classifyWriteFailure(
  error: unknown,
  args: Record<string, unknown>,
  config: CodexProConfig
): WriteFailureInput {
  const message = error instanceof Error ? error.message : String(error);
  const pathDetail = safeTreePathDetail(args.path ?? "[path omitted]");

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  if (
    message.startsWith("Path is blocked by safety rules:") ||
    message.startsWith("Refusing to write through a symlink:")
  ) {
    return { code: "PATH_BLOCKED", details: { path: pathDetail } };
  }

  const outsidePrefixes = [
    "Path contains a null byte.",
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Write path resolves through a parent outside the workspace:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];

  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return { code: "PATH_OUTSIDE_WORKSPACE", details: { path: pathDetail } };
  }

  const filesystemCode = nodeErrorCode(error);
  if (
    message.startsWith("Not a file:") ||
    filesystemCode === "EISDIR" ||
    filesystemCode === "ENOTDIR"
  ) {
    return { code: "NOT_A_FILE", details: { path: pathDetail } };
  }

  if (message === "Refusing to read binary file.") {
    return { code: "FILE_NOT_TEXT", details: { path: pathDetail } };
  }

  if (message.startsWith("Write content is too large (")) {
    return {
      code: "FILE_TOO_LARGE",
      details: {
        path: pathDetail,
        scope: "content",
        limit_bytes: config.maxWriteBytes
      }
    };
  }

  if (message.startsWith("File is too large (")) {
    return {
      code: "FILE_TOO_LARGE",
      details: {
        path: pathDetail,
        scope: "existing_file",
        limit_bytes: Math.max(config.maxWriteBytes, config.maxReadBytes)
      }
    };
  }

  if (message.startsWith("Secret-looking content is blocked from write.")) {
    return { code: "SECRET_CONTENT_BLOCKED", details: { path: pathDetail } };
  }

  if (message.startsWith("File already exists and overwrite=false:")) {
    return { code: "FILE_ALREADY_EXISTS", details: { path: pathDetail } };
  }

  if (filesystemCode === "ENOENT" && args.create_dirs === false) {
    return { code: "PARENT_DIRECTORY_NOT_FOUND", details: { path: pathDetail } };
  }

  const writeFailureCodes = new Set([
    "EACCES",
    "EPERM",
    "EROFS",
    "ENOSPC",
    "EDQUOT",
    "EIO",
    "EMFILE",
    "ENFILE",
    "EBUSY",
    "ENOENT"
  ]);
  if (filesystemCode && writeFailureCodes.has(filesystemCode)) {
    return { code: "WRITE_FAILED", details: {} };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

function classifyEditFailure(
  error: unknown,
  args: Record<string, unknown>,
  config: CodexProConfig
): EditFailureInput {
  const message = error instanceof Error ? error.message : String(error);
  const pathDetail = safeTreePathDetail(args.path ?? "[path omitted]");

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  if (
    message.startsWith("Path is blocked by safety rules:") ||
    message.startsWith("Refusing to write through a symlink:")
  ) {
    return { code: "PATH_BLOCKED", details: { path: pathDetail } };
  }

  const outsidePrefixes = [
    "Path contains a null byte.",
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Write path resolves through a parent outside the workspace:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];

  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return { code: "PATH_OUTSIDE_WORKSPACE", details: { path: pathDetail } };
  }

  const filesystemCode = nodeErrorCode(error);
  if (filesystemCode === "ENOENT") {
    return { code: "FILE_NOT_FOUND", details: { path: pathDetail } };
  }

  if (
    message.startsWith("Not a file:") ||
    filesystemCode === "EISDIR" ||
    filesystemCode === "ENOTDIR"
  ) {
    return { code: "NOT_A_FILE", details: { path: pathDetail } };
  }

  if (message === "Refusing to read binary file.") {
    return { code: "FILE_NOT_TEXT", details: { path: pathDetail } };
  }

  if (message.startsWith("File is too large (")) {
    return {
      code: "FILE_TOO_LARGE",
      details: {
        path: pathDetail,
        scope: "existing_file",
        limit_bytes: Math.max(config.maxWriteBytes, config.maxReadBytes)
      }
    };
  }

  if (message.startsWith("Edited file would be too large (")) {
    return {
      code: "FILE_TOO_LARGE",
      details: {
        path: pathDetail,
        scope: "edited_file",
        limit_bytes: config.maxWriteBytes
      }
    };
  }

  if (message === "old_text must not be empty.") {
    return { code: "INVALID_ARGUMENT", details: { argument: "old_text" } };
  }

  if (message.startsWith("old_text was not found in ")) {
    return { code: "OLD_TEXT_NOT_FOUND", details: { path: pathDetail } };
  }

  const ambiguousMatch = /^old_text matched (\d+) times\./.exec(message);
  if (ambiguousMatch) {
    return {
      code: "OLD_TEXT_NOT_UNIQUE",
      details: { path: pathDetail, matches: Number.parseInt(ambiguousMatch[1], 10) }
    };
  }

  const replacementMismatch = /^Expected (\d+) replacements but would perform (\d+)\./.exec(message);
  if (replacementMismatch) {
    return {
      code: "REPLACEMENT_COUNT_MISMATCH",
      details: {
        path: pathDetail,
        expected: Number.parseInt(replacementMismatch[1], 10),
        actual: Number.parseInt(replacementMismatch[2], 10)
      }
    };
  }

  if (message.startsWith("Secret-looking content is blocked from edit.")) {
    return { code: "SECRET_CONTENT_BLOCKED", details: { path: pathDetail } };
  }

  const editFailureCodes = new Set([
    "EACCES",
    "EPERM",
    "EROFS",
    "ENOSPC",
    "EDQUOT",
    "EIO",
    "EMFILE",
    "ENFILE",
    "EBUSY"
  ]);
  if (filesystemCode && editFailureCodes.has(filesystemCode)) {
    return { code: "EDIT_FAILED", details: {} };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

function classifyApplyPatchFailure(
  error: unknown,
  args: Record<string, unknown>,
  config: CodexProConfig
): ApplyPatchFailureInput {
  const message = error instanceof Error ? error.message : String(error);

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  if (error instanceof ApplyPatchTargetError) {
    const targetMessage = error.targetCause instanceof Error
      ? error.targetCause.message
      : String(error.targetCause);
    const pathDetail = safeApplyPatchPathDetail(error.targetPath);
    if (
      targetMessage.startsWith("Path is blocked by safety rules:") ||
      targetMessage.startsWith("Refusing to write through a symlink:")
    ) {
      return { code: "PATH_BLOCKED", details: { path: pathDetail } };
    }

    const outsidePrefixes = [
      "Path contains a null byte.",
      "Path escapes workspace root:",
      "Path resolves outside workspace root through a symlink:",
      "Write path resolves through a parent outside the workspace:",
      "Windows device paths are not allowed:",
      "UNC paths are not allowed:",
      "Drive-relative Windows paths are not allowed:",
      "NTFS alternate data stream paths are not allowed:",
      "Windows path segments may not end with a dot or space:",
      "Windows reserved device name is not allowed:"
    ];
    if (outsidePrefixes.some((prefix) => targetMessage.startsWith(prefix))) {
      return { code: "PATH_OUTSIDE_WORKSPACE", details: { path: pathDetail } };
    }
    return { code: "INTERNAL_ERROR", details: {} };
  }

  if (message === "patch is required.") {
    return { code: "INVALID_ARGUMENT", details: { argument: "patch", reason: "empty" } };
  }
  if (message.startsWith("Patch is too large.")) {
    return { code: "PATCH_TOO_LARGE", details: { limit_bytes: config.maxWriteBytes } };
  }
  if (message.startsWith("Secret-looking content is blocked from apply_patch.")) {
    return { code: "SECRET_CONTENT_BLOCKED", details: {} };
  }
  if (message.startsWith("Symlink patches are blocked from apply_patch.")) {
    return { code: "SYMLINK_PATCH_BLOCKED", details: {} };
  }
  if (message === "Patch must include at least one file path.") {
    return { code: "PATCH_INVALID", details: { reason: "no_file_paths" } };
  }
  if (message.startsWith("Invalid quoted Git path:")) {
    return { code: "PATCH_INVALID", details: { reason: "invalid_path_encoding" } };
  }

  if (error instanceof ApplyPatchOperationError) {
    if (error.applyPatchFailureKind === "git_unavailable") {
      return { code: "GIT_UNAVAILABLE", details: {} };
    }
    if (error.applyPatchFailureKind === "check_failed") {
      return { code: "PATCH_CHECK_FAILED", details: {} };
    }
    return { code: "PATCH_APPLY_FAILED", details: {} };
  }

  if (error instanceof PatchPlanError) {
    return { code: "PATCH_CHECK_FAILED", details: {} };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

function classifySearchFailure(
  error: unknown,
  args: Record<string, unknown>
): SearchFailureInput {
  const message = error instanceof Error ? error.message : String(error);
  const pathDetail = safeTreePathDetail(args.path ?? ".");

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  if (nodeErrorCode(error) === "ENOENT") {
    return { code: "FILE_NOT_FOUND", details: { path: pathDetail } };
  }

  if (message.startsWith("Path is blocked by safety rules:")) {
    return { code: "PATH_BLOCKED", details: { path: pathDetail } };
  }

  const outsidePrefixes = [
    "Path contains a null byte.",
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];

  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return { code: "PATH_OUTSIDE_WORKSPACE", details: { path: pathDetail } };
  }

  if (message === "query is required.") {
    return { code: "INVALID_ARGUMENT", details: { argument: "query" } };
  }

  if (
    message.startsWith("Invalid regular expression:") ||
    /regex parse error|invalid regex|error parsing regexp|unterminated group/i.test(message)
  ) {
    return { code: "INVALID_ARGUMENT", details: { argument: "regex" } };
  }

  if (message.startsWith("regex search requires ripgrep.")) {
    return { code: "SEARCH_BACKEND_UNAVAILABLE", details: {} };
  }

  if (
    message.startsWith("ripgrep failed with exit code") ||
    message.startsWith("rg exited with status") ||
    message.startsWith("spawn rg")
  ) {
    return { code: "SEARCH_COMMAND_FAILED", details: {} };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

function structuredSearchRequested(args: Record<string, unknown>): boolean {
  return args.intent !== undefined || args.symbol !== undefined || args.include_tests !== undefined;
}

function normalizeSearchAnalysis(
  config: CodexProConfig,
  args: Record<string, unknown>,
  analysis: unknown
): { analysis: SearchAnalysis | null; warnings: SearchWarning[] } {
  if (!structuredSearchRequested(args)) return { analysis: null, warnings: [] };

  if (!config.analysisEnabled || (
    analysis &&
    typeof analysis === "object" &&
    "cache" in analysis &&
    (analysis as { cache?: { key?: unknown } }).cache?.key === "disabled"
  )) {
    return { analysis: null, warnings: [SEARCH_ANALYSIS_DISABLED_WARNING] };
  }

  if (!analysis || (
    typeof analysis === "object" &&
    "cache" in analysis &&
    (analysis as { cache?: { key?: unknown } }).cache?.key === "unavailable"
  )) {
    return { analysis: null, warnings: [SEARCH_ANALYSIS_UNAVAILABLE_WARNING] };
  }

  const parsed = searchAnalysisSchema.safeParse(analysis);
  return parsed.success
    ? { analysis: parsed.data, warnings: [] }
    : { analysis: null, warnings: [SEARCH_ANALYSIS_UNAVAILABLE_WARNING] };
}

function classifyGitStatusThrownFailure(
  error: unknown,
  args: Record<string, unknown>
): GitStatusFailureInput {
  const message = error instanceof Error ? error.message : String(error);

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  if (message.startsWith("Path is blocked by safety rules:")) {
    return {
      code: "PATH_BLOCKED",
      details: { path: safeTreePathDetail(args.path ?? "[path omitted]") }
    };
  }

  const outsidePrefixes = [
    "Path contains a null byte.",
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];

  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      details: { path: safeTreePathDetail(args.path ?? "[path omitted]") }
    };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

function classifyGitStatusOutputFailure(
  output: string
): GitStatusFailureInput | undefined {
  const trimmed = output.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes("not a git repository")) {
    return { code: "GIT_NOT_REPOSITORY", details: {} };
  }

  if (trimmed.startsWith("git unavailable or failed:")) {
    return /\bENOENT\b|not found/i.test(trimmed)
      ? { code: "GIT_UNAVAILABLE", details: {} }
      : { code: "GIT_COMMAND_FAILED", details: {} };
  }

  if (
    trimmed.startsWith("fatal:") ||
    trimmed.startsWith("error:") ||
    trimmed.startsWith("git exited with status") ||
    trimmed.startsWith("usage: git ")
  ) {
    return { code: "GIT_COMMAND_FAILED", details: {} };
  }

  return undefined;
}

function classifyGitDiffThrownFailure(
  error: unknown,
  args: Record<string, unknown>
): GitDiffFailureInput {
  const message = error instanceof Error ? error.message : String(error);

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  if (message.startsWith("Path is blocked by safety rules:")) {
    return {
      code: "PATH_BLOCKED",
      details: { path: safeTreePathDetail(args.path ?? "[path omitted]") }
    };
  }

  const outsidePrefixes = [
    "Path contains a null byte.",
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];

  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      details: { path: safeTreePathDetail(args.path ?? "[path omitted]") }
    };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

function classifyGitDiffOutputFailure(
  output: string
): GitDiffFailureInput | undefined {
  const trimmed = output.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes("not a git repository")) {
    return { code: "GIT_NOT_REPOSITORY", details: {} };
  }

  if (trimmed.startsWith("git unavailable or failed:")) {
    return /\bENOENT\b|not found/i.test(trimmed)
      ? { code: "GIT_UNAVAILABLE", details: {} }
      : { code: "GIT_COMMAND_FAILED", details: {} };
  }

  if (
    trimmed.startsWith("fatal:") ||
    trimmed.startsWith("error:") ||
    trimmed.startsWith("git exited with status") ||
    trimmed.startsWith("usage: git ")
  ) {
    return { code: "GIT_COMMAND_FAILED", details: {} };
  }

  return undefined;
}

function classifyShowChangesThrownFailure(
  error: unknown,
  args: Record<string, unknown>
): ShowChangesFailureInput {
  const message = error instanceof Error ? error.message : String(error);

  if (args.workspace_id && message.startsWith("Unknown workspace_id:")) {
    return {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id) }
    };
  }

  if (message.startsWith("Path is blocked by safety rules:")) {
    return {
      code: "PATH_BLOCKED",
      details: { path: safeTreePathDetail(args.path ?? "[path omitted]") }
    };
  }

  const outsidePrefixes = [
    "Path contains a null byte.",
    "Path escapes workspace root:",
    "Path resolves outside workspace root through a symlink:",
    "Windows device paths are not allowed:",
    "UNC paths are not allowed:",
    "Drive-relative Windows paths are not allowed:",
    "NTFS alternate data stream paths are not allowed:",
    "Windows path segments may not end with a dot or space:",
    "Windows reserved device name is not allowed:"
  ];

  if (outsidePrefixes.some((prefix) => message.startsWith(prefix))) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      details: { path: safeTreePathDetail(args.path ?? "[path omitted]") }
    };
  }

  return { code: "INTERNAL_ERROR", details: {} };
}

function classifyShowChangesStatusOutputFailure(
  output: string
): ShowChangesFailureInput | undefined {
  const failure = classifyGitStatusOutputFailure(output);
  return failure ? { code: failure.code, details: failure.details } as ShowChangesFailureInput : undefined;
}

function classifyShowChangesDiffOutputFailure(
  output: string
): ShowChangesFailureInput | undefined {
  const failure = classifyGitDiffOutputFailure(output);
  return failure ? { code: failure.code, details: failure.details } as ShowChangesFailureInput : undefined;
}

function compactStructuredContent<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length <= STRUCTURED_STRING_MAX_CHARS) return value as T;
    return `${value.slice(0, STRUCTURED_STRING_MAX_CHARS)}\n...[structured field truncated to ${STRUCTURED_STRING_MAX_CHARS} chars]` as T;
  }
  if (Array.isArray(value)) return value.map((item) => compactStructuredContent(item, depth + 1)) as T;
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = compactStructuredContent(item, depth + 1);
  }
  return out as T;
}

function textResult(text: string, structuredContent: Record<string, unknown> = {}, meta: Record<string, unknown> = {}): any {
  return {
    content: [{ type: "text", text: redactSensitiveText(text) }],
    structuredContent: redactStructured(structuredContent),
    _meta: meta
  };
}

function countTextLines(value: string | undefined): number {
  if (!value) return 0;
  return value.split(/\r?\n/).filter((line) => line.length > 0).length;
}

function bashTextResult(config: CodexProConfig, result: Awaited<ReturnType<typeof runBash>>): string {
  if (config.bashTranscript === "full") {
    return `# Bash\n\n\`\`\`bash\n$ ${result.command}\n\`\`\`\n\nCWD: ${result.cwd}\nExit: ${result.exitCode}${result.signal ? ` (${result.signal})` : ""}\nDuration: ${result.durationMs} ms\n\n## stdout\n\n\`\`\`text\n${result.stdout || ""}\n\`\`\`\n\n## stderr\n\n\`\`\`text\n${result.stderr || ""}\n\`\`\``;
  }

  const stdoutLines = countTextLines(result.stdout);
  const stderrLines = countTextLines(result.stderr);
  return [
    "# Bash",
    "",
    `\`${result.command}\``,
    "",
    `CWD: ${result.cwd}`,
    `Exit: ${result.exitCode}${result.signal ? ` (${result.signal})` : ""}`,
    `Duration: ${result.durationMs} ms`,
    `Output: stdout ${stdoutLines} line${stdoutLines === 1 ? "" : "s"}, stderr ${stderrLines} line${stderrLines === 1 ? "" : "s"}.`,
    "",
    "Raw stdout/stderr are in the structured CodexPro card. Start with `--bash-transcript full` to print raw output in chat."
  ].join("\n");
}

function errorResult(error: unknown): any {
  return {
    isError: true,
    content: [{ type: "text", text: errorText(error) }],
    structuredContent: { error: errorText(error) }
  };
}

function validateToolArgs(name: string, options: Record<string, unknown>, args: unknown): any {
  const inputSchema = options.inputSchema;
  if (!inputSchema || typeof inputSchema !== "object" || Array.isArray(inputSchema)) return args ?? {};
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(inputSchema)) {
    if (value && typeof (value as { safeParse?: unknown }).safeParse === "function") {
      shape[key] = value as z.ZodTypeAny;
    }
  }
  if (!Object.keys(shape).length) return {};
  const parsed = z.object(shape).safeParse(args ?? {});
  if (parsed.success) return parsed.data;
  const details = parsed.error.issues
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "arguments"}: ${issue.message}`)
    .join("; ");
  throw new CodexProError(`Invalid arguments for ${name}: ${details}`);
}

function tagToolResult(result: any, name: string, options: Record<string, unknown>): any {
  if (!result || typeof result !== "object") return result;
  const structured = result.structuredContent;
  const base =
    structured && typeof structured === "object" && !Array.isArray(structured)
      ? structured
      : {};
  const tagged = {
    codexpro_tool: name,
    codexpro_title: options.title ?? name,
    ...base
  };
  const meta = (options._meta as Record<string, unknown> | undefined) ?? {};
  const preserveStructuredContent = meta["codexpro/preserveStructuredContent"] === true;
  result.structuredContent =
    (meta.ui || meta["openai/outputTemplate"]) && !preserveStructuredContent
      ? compactStructuredContent(tagged)
      : tagged;
  return result;
}

function toolCardMeta(): Record<string, unknown> {
  return {
    ui: { resourceUri: TOOL_CARD_URI },
    "openai/outputTemplate": TOOL_CARD_URI
  };
}

const OPTIONAL_TOOL_CARD_META = [
  "ui",
  "openai/outputTemplate",
  "openai/toolInvocation/invoking",
  "openai/toolInvocation/invoked"
] as const;

function descriptorOptionsForConfig(config: CodexProConfig, options: Record<string, unknown>): Record<string, unknown> {
  if (config.toolCards) return options;
  const meta = { ...((options._meta as Record<string, unknown> | undefined) ?? {}) };
  for (const key of OPTIONAL_TOOL_CARD_META) delete meta[key];
  return { ...options, _meta: meta };
}

function toolCallLoggingEnabled(): boolean {
  return process.env.CODEXPRO_LOG_TOOL_CALLS === "1" || process.env.CODEXPRO_LOG_REQUESTS === "1";
}

function logToolCall(name: string, status: "ok" | "error", started: number): void {
  if (!toolCallLoggingEnabled()) return;
  console.error(`[CodexProTool] ${name} ${status} ${Date.now() - started}ms`);
}

function registerToolCardResource(server: McpServer, config: CodexProConfig): void {
  if (config.connectionTest) return;
  const s = server as any;
  if (typeof s.registerResource !== "function") {
    throw new Error("Unsupported MCP SDK: CodexPro widgets require registerResource.");
  }

  const registerUri = (uri: string, name: string): void => {
    s.registerResource(
      name,
      uri,
      {
        title: "CodexPro Tool Card",
        description: "Compact visual renderer for CodexPro workspace orientation, source changes, and handoffs.",
        mimeType: TOOL_CARD_MIME_TYPE
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: TOOL_CARD_MIME_TYPE,
            text: toolCardWidgetHtml,
            _meta: {
              ui: {
                prefersBorder: true,
                domain: config.widgetDomain,
                csp: {
                  connectDomains: [],
                  resourceDomains: []
                }
              },
              "openai/widgetDescription": "Renders CodexPro workspace orientation, diagnostics, file diffs, change reviews, terminal checks, Pro context exports, and handoff plans as compact developer cards with bounded previews.",
              "openai/widgetPrefersBorder": true,
              "openai/widgetDomain": config.widgetDomain,
              "openai/widgetCSP": {
                connect_domains: [],
                resource_domains: []
              }
            }
          }
        ]
      })
    );
  };

  registerUri(TOOL_CARD_URI, "codexpro-tool-card");
  for (const legacyUri of TOOL_CARD_LEGACY_URIS) {
    registerUri(legacyUri, `codexpro-tool-card-${legacyUri.match(/v\d+/)?.[0] ?? "legacy"}`);
  }
}

type CodexToolHandler = (args: any) => Promise<any> | any;

export interface TreeProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: TreeOptions;
}

export interface ReadProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  path: string;
  options: {
    startLine?: number;
    endLine?: number;
    maxBytes?: number;
  };
}

export interface WriteProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  path: string;
  content: string;
  options: {
    createDirs: boolean;
    overwrite: boolean;
  };
}

export interface EditProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  path: string;
  oldText: string;
  newText: string;
  options: {
    replaceAll: boolean;
    expectedReplacements?: number;
  };
}

export interface ApplyPatchProviderResult {
  paths: string[];
  stdout: string;
  stderr: string;
  additions: number;
  deletions: number;
  changed: true;
  diff: string;
}

export interface ApplyPatchProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  patch: string;
}

export interface OpenCurrentWorkspaceSummaryProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: OpenCurrentWorkspaceSummaryOptions;
}

export interface OpenWorkspaceSummaryProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: OpenWorkspaceSummaryOptions;
}

export interface WorkspaceSnapshotSummaryProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: WorkspaceSnapshotSummaryOptions;
}

export interface WorkspaceSnapshotAiContextProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
}

export interface BashProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  command: string;
  options: {
    cwd?: string;
    timeoutMs?: number;
    sessionId?: string;
  };
}

export interface SearchProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  options: Partial<SearchOptions>;
}

export interface GitStatusProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  path?: string;
}

export interface GitDiffProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  path?: string;
  staged: boolean;
}

export interface ShowChangesGitProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  path?: string;
  staged: boolean;
}

export interface ShowChangesAnalysisProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  changedPaths: string[];
}

export interface CodexProInventoryProviderContext {
  config: CodexProConfig;
  workspace: Workspace;
  options: {
    includeGlobalSkills: boolean;
    includeMcpServers: boolean;
    maxSkills: number;
  };
}

export interface LoadSkillProviderContext {
  config: CodexProConfig;
  workspace: Workspace;
  options: {
    name: string;
    source?: SkillInventoryItem["source"];
    path?: string;
    includeGlobal: boolean;
    maxSkills: number;
    maxBytes: number;
  };
}

export interface CodexSessionsProviderContext {
  config: CodexProConfig;
  options: {
    maxSessions: number;
    query?: string;
  };
}

export interface ReadCodexSessionProviderContext {
  config: CodexProConfig;
  request: NormalizedReadCodexSessionRequest;
}

export interface ReadHandoffProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  limits: ReadHandoffLimits;
}

export interface WaitForHandoffStateProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  maxStateBytes: number;
}

export interface WaitForHandoffArtifactsProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  requestedKinds: WaitForHandoffArtifactKind[];
  limits: Pick<WaitForHandoffLimits, "maxArtifactBytes" | "maxTotalBytes">;
}

export interface CodexContextProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  targetPath: string;
  targetKind: CodexContextTargetKind;
  includeAiBridge: boolean;
  includeGitStatus: boolean;
  includeGitDiff: boolean;
  maxAgentBytes: number;
}

export interface ExportProContextProviderContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  request: PreparedProContextRequest;
  output: PreparedProContextOutput;
}

export interface CodexProServerDependencies {
  serverConfigDataProvider?: () => ServerConfigData | Promise<ServerConfigData>;
  treeResultProvider?: (context: TreeProviderContext) => Promise<TreeResult>;
  readResultProvider?: (context: ReadProviderContext) => Promise<ReadFileResult>;
  writeResultProvider?: (context: WriteProviderContext) => Promise<WriteFileResult>;
  editResultProvider?: (context: EditProviderContext) => Promise<EditFileResult>;
  applyPatchResultProvider?: (
    context: ApplyPatchProviderContext
  ) => ApplyPatchProviderResult | Promise<ApplyPatchProviderResult>;
  openCurrentWorkspaceSummaryProvider?: (
    context: OpenCurrentWorkspaceSummaryProviderContext
  ) => WorkspaceSummary | Promise<WorkspaceSummary>;
  openWorkspaceProvider?: (root?: string) => Workspace;
  openWorkspaceSummaryProvider?: (
    context: OpenWorkspaceSummaryProviderContext
  ) => WorkspaceSummary | Promise<WorkspaceSummary>;
  workspaceSnapshotSummaryProvider?: (
    context: WorkspaceSnapshotSummaryProviderContext
  ) => WorkspaceSummary | Promise<WorkspaceSummary>;
  workspaceSnapshotAiContextProvider?: (
    context: WorkspaceSnapshotAiContextProviderContext
  ) => { text: string; files: string[] } | Promise<{ text: string; files: string[] }>;
  listWorkspacesProvider?: () => Workspace[] | Promise<Workspace[]>;
  inspectWorkspaceProvider?: (input: {
    config: CodexProConfig;
    guard: PathGuard;
    workspace: Workspace;
  }) => WorkspaceAnalysis | Promise<WorkspaceAnalysis>;
  codexproInventoryProvider?: (
    context: CodexProInventoryProviderContext
  ) => CodexProInventoryResult | Promise<CodexProInventoryResult>;
  loadSkillProvider?: (
    context: LoadSkillProviderContext
  ) => LoadedSkill | Promise<LoadedSkill>;
  codexSessionsProvider?: (
    context: CodexSessionsProviderContext
  ) => CodexSessionListResult | Promise<CodexSessionListResult>;
  readCodexSessionProvider?: (
    context: ReadCodexSessionProviderContext
  ) => CodexSessionReadResult | Promise<CodexSessionReadResult>;
  readHandoffProvider?: (
    context: ReadHandoffProviderContext
  ) => ReadHandoffContextResult | Promise<ReadHandoffContextResult>;
  waitForHandoffStateProvider?: (
    context: WaitForHandoffStateProviderContext
  ) => HandoffRunStateReadResult | Promise<HandoffRunStateReadResult>;
  waitForHandoffArtifactsProvider?: (
    context: WaitForHandoffArtifactsProviderContext
  ) => WaitForHandoffArtifactReadResult | Promise<WaitForHandoffArtifactReadResult>;
  codexContextProvider?: (
    context: CodexContextProviderContext
  ) => CodexContext | Promise<CodexContext>;
  exportProContextProvider?: (
    context: ExportProContextProviderContext
  ) => ProContextExportResult | Promise<ProContextExportResult>;
  handoffToAgentProvider?: (
    context: AgentHandoffProviderContext
  ) => HandoffWriteResult | Promise<HandoffWriteResult>;
  handoffToAgentNow?: () => string;
  handoffToCodexProvider?: (
    context: AgentHandoffProviderContext
  ) => HandoffWriteResult | Promise<HandoffWriteResult>;
  handoffToCodexNow?: () => string;
  waitForHandoffNow?: () => number;
  waitForHandoffSleep?: (milliseconds: number) => void | Promise<void>;
  bashResultProvider?: (
    context: BashProviderContext
  ) => BashResult | Promise<BashResult>;
  searchResultProvider?: (context: SearchProviderContext) => SearchResult | Promise<SearchResult>;
  gitStatusResultProvider?: (
    context: GitStatusProviderContext
  ) => string | Promise<string>;
  gitDiffResultProvider?: (
    context: GitDiffProviderContext
  ) => string | Promise<string>;
  showChangesStatusProvider?: (
    context: ShowChangesGitProviderContext
  ) => string | Promise<string>;
  showChangesDiffProvider?: (
    context: ShowChangesGitProviderContext
  ) => string | Promise<string>;
  showChangesAnalysisProvider?: (
    context: ShowChangesAnalysisProviderContext
  ) => ChangeAnalysis | Promise<ChangeAnalysis>;
  policyRuntime?: PolicyRuntime;
  policySessionContextSource?: PolicySessionContextSource;
  policyAuditSink?: (event: AuditEventV1) => void | Promise<void>;
  transactionRecoveryCoordinator?: TransactionRecoveryHook;
  workspaceMutationRuntime?: WorkspaceMutationRuntime;
  atomicMutationToolNames?: ReadonlySet<string>;
  undoChangeSetService?: UndoChangeSetService;
  changeSetOwnerBindingKey?: Buffer;
  toolResourceResolver?: ToolResourceResolver;
  persistentAuditRuntime?: Required<Pick<PolicyRuntime, "persistAuthorization" | "persistExecution">>;
}

const SUPERTOOL_NAME = "codexpro";
const SUPERTOOL_ACTION_ALIASES: Record<string, string> = {
  actions: "list_actions",
  config: "server_config",
  self_test: "codexpro_self_test",
  inventory: "codexpro_inventory",
  open: "open_current_workspace",
  snapshot: "workspace_snapshot",
  changes: "show_changes",
  handoff_poll: "wait_for_handoff",
  pro_export: "export_pro_context",
  agent_handoff: "handoff_to_agent",
  codex_handoff: "handoff_to_codex"
};

const registeredToolHandlersByServer = new WeakMap<object, Map<string, CodexToolHandler>>();

function rememberRegisteredToolHandler(server: McpServer, name: string, handler: CodexToolHandler): void {
  const key = server as object;
  const handlers = registeredToolHandlersByServer.get(key) ?? new Map<string, CodexToolHandler>();
  if (!registeredToolHandlersByServer.has(key)) registeredToolHandlersByServer.set(key, handlers);
  handlers.set(name, handler);
}

function registeredToolHandler(server: McpServer, name: string): CodexToolHandler | undefined {
  return registeredToolHandlersByServer.get(server as object)?.get(name);
}

function normalizeSupertoolAction(value: unknown): string {
  const raw = String(value ?? "list_actions").trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  return SUPERTOOL_ACTION_ALIASES[normalized] ?? normalized;
}


function isContextPath(config: CodexProConfig, relPath: string): boolean {
  const normalized = relPath.split(path.sep).join("/").replace(/^\.\//, "");
  const contextDir = config.contextDir.replace(/^\.\//, "").replace(/\/$/, "");
  return normalized === contextDir || normalized.startsWith(`${contextDir}/`);
}

function assertWriteToolAllowed(config: CodexProConfig, relPath: string): void {
  if (config.writeMode === "workspace") return;
  if (config.writeMode === "handoff" && isContextPath(config, relPath)) return;
  if (config.writeMode === "handoff") {
    throw new CodexProError(
      `Source writes are disabled because CODEXPRO_WRITE_MODE=handoff. ` +
        `Use handoff_to_agent or handoff_to_codex, or write/edit/apply_patch only inside ${config.contextDir}/.`
    );
  }
  throw new CodexProError("write/edit/apply_patch tools are disabled because CODEXPRO_WRITE_MODE=off. handoff_to_agent and handoff_to_codex are still available for planning.");
}

function attachStructuredDuration(result: any, durationMs: number): any {
  if (!result || typeof result !== "object") return result;
  const structured = result.structuredContent;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) return result;
  const meta = structured.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return result;

  result.structuredContent = {
    ...structured,
    meta: {
      ...meta,
      durationMs: Math.max(0, durationMs)
    }
  };
  return result;
}

interface ServerMutationRegistration {
  runtime: WorkspaceMutationRuntime;
  toolNames: ReadonlySet<string>;
}

const mutationRegistrationByServer = new WeakMap<object, ServerMutationRegistration>();

function registerToolCompat(
  server: McpServer,
  name: string,
  options: Record<string, unknown>,
  handler: (args: any) => Promise<any> | any
): CodexToolHandler {
  const mutationRegistration = mutationRegistrationByServer.get(server as object);
  const mutationAwareHandler: CodexToolHandler = mutationRegistration?.toolNames.has(name)
    ? (args) => mutationRegistration.runtime.invokeProvider({
        requiresMutation: name !== "codexpro_self_test",
        provider: () => handler(args)
      })
    : handler;
  const wrapped = async (args: any) => {
    const started = Date.now();
    try {
      const result = attachStructuredDuration(
        tagToolResult(await mutationAwareHandler(args ?? {}), name, options),
        Date.now() - started
      );
      logToolCall(name, result?.isError ? "error" : "ok", started);
      return result;
    } catch (error) {
      const result = attachStructuredDuration(
        tagToolResult(errorResult(error), name, options),
        Date.now() - started
      );
      logToolCall(name, "error", started);
      return result;
    }
  };

  const securitySchemes = [{ type: "noauth" }];
  const fullOptions: Record<string, unknown> = {
    securitySchemes,
    ...options,
    _meta: {
      securitySchemes,
      ...(options._meta as Record<string, unknown> | undefined)
    }
  };

  const s = server as any;
  if (typeof s.registerTool === "function") {
    s.registerTool(name, fullOptions, wrapped);
    return mutationAwareHandler;
  }

  if (typeof s.tool === "function") {
    s.tool(name, (fullOptions.description as string | undefined) ?? name, fullOptions.inputSchema ?? {}, wrapped);
    return mutationAwareHandler;
  }

  throw new Error("Unsupported MCP SDK: McpServer has neither registerTool nor tool.");
}

const MINIMAL_TOOL_NAMES = [
  SUPERTOOL_NAME,
  "server_config",
  "codexpro_self_test",
  "open_current_workspace",
  "open_workspace",
  "close_workspace",
  "read",
  "write",
  "edit",
  "apply_patch",
  "bash",
  "show_changes"
] as const;

const STANDARD_TOOL_NAMES = [
  ...MINIMAL_TOOL_NAMES,
  "inspect_workspace",
  "tree",
  "search",
  "load_skill",
  "read_handoff",
  "wait_for_handoff",
  "export_pro_context",
  "handoff_to_agent"
] as const;

const FULL_TOOL_NAMES = [
  SUPERTOOL_NAME,
  "server_config",
  "codexpro_self_test",
  "codexpro_inventory",
  "load_skill",
  "list_workspaces",
  "open_current_workspace",
  "open_workspace",
  "close_workspace",
  "workspace_snapshot",
  "inspect_workspace",
  "tree",
  "search",
  "read",
  "write",
  "edit",
  "apply_patch",
  "bash",
  "git_status",
  "git_diff",
  "show_changes",
  "read_handoff",
  "wait_for_handoff",
  "codex_context",
  "export_pro_context",
  "handoff_to_agent",
  "handoff_to_codex"
] as const;

const CONNECTION_TEST_HIDDEN_TOOLS = new Set<string>([
  SUPERTOOL_NAME,
  "codexpro_self_test",
  "close_workspace",
  "write",
  "edit",
  "apply_patch",
  "bash",
  "export_pro_context",
  "handoff_to_agent",
  "handoff_to_codex",
  "undo_change_set"
]);

function codexSessionToolNames(config: CodexProConfig): string[] {
  if (config.codexSessions === "off") return [];
  return config.codexSessions === "read"
    ? ["codex_sessions", "read_codex_session"]
    : ["codex_sessions"];
}

function toolNamesForMode(config: CodexProConfig): string[] {
  const names: string[] =
    config.toolMode === "full"
      ? [...FULL_TOOL_NAMES]
      : config.toolMode === "minimal"
        ? [...MINIMAL_TOOL_NAMES]
        : [...STANDARD_TOOL_NAMES];
  if (config.bashMode === "off") {
    const bashIndex = names.indexOf("bash");
    if (bashIndex !== -1) names.splice(bashIndex, 1);
  }
  if (config.writeMode !== "workspace") {
    for (const writeTool of ["write", "edit", "apply_patch"]) {
      const toolIndex = names.indexOf(writeTool);
      if (toolIndex !== -1) names.splice(toolIndex, 1);
    }
  }
  if (config.writeMode === "handoff" && !names.includes("handoff_to_agent")) names.push("handoff_to_agent");
  if (!config.analysisEnabled) {
    const analysisIndex = names.indexOf("inspect_workspace");
    if (analysisIndex !== -1) names.splice(analysisIndex, 1);
  }
  if (config.toolContractVersion === 2 && config.toolMode !== "minimal" && !names.includes("undo_change_set")) {
    names.push("undo_change_set");
  }
  if (config.connectionTest) {
    for (const hiddenTool of CONNECTION_TEST_HIDDEN_TOOLS) {
      const toolIndex = names.indexOf(hiddenTool);
      if (toolIndex !== -1) names.splice(toolIndex, 1);
    }
  }
  for (const name of codexSessionToolNames(config)) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

const MINIMAL_TOOLS = new Set<string>(MINIMAL_TOOL_NAMES);
const STANDARD_TOOLS = new Set<string>(STANDARD_TOOL_NAMES);
const registeredToolNamesByServer = new WeakMap<object, string[]>();

function rememberRegisteredTool(server: McpServer, name: string): void {
  const key = server as object;
  const names = registeredToolNamesByServer.get(key) ?? [];
  if (!registeredToolNamesByServer.has(key)) registeredToolNamesByServer.set(key, names);
  if (!names.includes(name)) names.push(name);
}

function registeredToolNames(server: McpServer): string[] {
  return [...(registeredToolNamesByServer.get(server as object) ?? [])];
}

function shouldRegisterTool(config: CodexProConfig, name: string): boolean {
  if (config.connectionTest && CONNECTION_TEST_HIDDEN_TOOLS.has(name)) return false;
  if (name === "undo_change_set") {
    return config.toolContractVersion === 2 && config.toolMode !== "minimal";
  }
  if (name === "bash" && config.bashMode === "off") return false;
  if ((name === "write" || name === "edit" || name === "apply_patch") && config.writeMode !== "workspace") return false;
  if (name === "codex_sessions") return config.codexSessions !== "off";
  if (name === "read_codex_session") return config.codexSessions === "read";
  if (name === "inspect_workspace" && !config.analysisEnabled) return false;
  if (name === "handoff_to_agent" && config.writeMode === "handoff") return true;
  if (config.toolMode === "full") return true;
  if (config.toolMode === "minimal") return MINIMAL_TOOLS.has(name);
  return STANDARD_TOOLS.has(name);
}

function registerCodexTool(
  config: CodexProConfig,
  server: McpServer,
  name: string,
  options: Record<string, unknown>,
  handler: CodexToolHandler
): void {
  if (!shouldRegisterTool(config, name)) return;
  const validatedHandler: CodexToolHandler = (args) => handler(validateToolArgs(name, options, args));
  const mutationAwareHandler = registerToolCompat(
    server,
    name,
    descriptorOptionsForConfig(config, options),
    validatedHandler
  );
  rememberRegisteredTool(server, name);
  rememberRegisteredToolHandler(server, name, mutationAwareHandler);
}

function serverInstructions(config: CodexProConfig): string {
  const editInstruction =
    config.connectionTest
      ? "4. Connection test mode is read-only. Write, patch, export, and handoff-writing tools are unavailable."
      : config.writeMode === "workspace"
      ? "4. Edit source files with write/edit/apply_patch. After edits, call show_changes once for git status, diff stats, and review diff."
      : config.writeMode === "handoff"
        ? "4. Source writes are disabled and generic write/edit/apply_patch tools are unavailable. Use handoff_to_agent/handoff_to_codex for plans."
        : "4. Write/edit/apply_patch tools are disabled. Do not attempt direct file writes; use handoff or context export workflows instead.";
  const bashInstruction =
    config.bashMode === "off"
      ? "5. Bash is disabled and the bash tool is unavailable. Do not attempt shell commands."
      : "5. Use bash only for meaningful verification commands such as npm test, npm run build, lint, typecheck, or an existing project script.";

  return [
    "CodexPro connects ChatGPT to one local development workspace.",
    "",
    "Preferred workflow:",
    "1. Start with open_current_workspace. Use open_workspace only when the user gives a different root or asks to switch folders.",
    "2. Follow any AGENTS.md-style instructions returned by the workspace open call before editing files.",
    "3. Inspect with tree, search, and read. Do not use bash for git status, git diff, cat, sed, grep, rg, find, ls, or file reading.",
    editInstruction,
    bashInstruction,
    "6. Keep tool calls minimal. Prefer one targeted search plus show_changes instead of repeated broad inspection calls.",
    config.codexSessions !== "off"
      ? `7. Codex session history access is enabled in ${config.codexSessions} mode. Use it only when the user asks for local Codex session history.`
      : "",
    config.requireBashSession && config.bashSessionId
      ? `8. Bash session guard is enabled. Every bash call must include session_id="${config.bashSessionId}".`
      : config.bashSessionId
        ? `8. Bash session label for this server is "${config.bashSessionId}".`
        : "",
    "",
    `Current modes: tool=${config.toolMode}, bash=${config.bashMode}, write=${config.writeMode}.`
  ].filter(Boolean).join("\n");
}

function limitInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return fallback;
  return ["1", "true", "yes", "y"].includes(String(value).toLowerCase());
}

function diffBlock(diff: string): string {
  return `\n\n\`\`\`diff\n${diff}\n\`\`\``;
}

function diffStats(diff: string): { additions: number; deletions: number; changed: boolean } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions, changed: Boolean(diff.trim()) };
}

const reviewCheckpoints = new Map<string, string>();

function reviewCheckpointKey(workspace: Workspace, options: { path?: string; staged: boolean }): string {
  return `${workspace.id}\0${options.path ?? ""}\0${options.staged ? "staged" : "unstaged"}`;
}

function reviewFingerprint(status: string, diff: string): string {
  return createHash("sha256").update(status).update("\0").update(diff).digest("hex");
}

async function untrackedReviewFingerprint(config: CodexProConfig, guard: PathGuard, workspace: Workspace, changedFiles: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const line of changedFiles) {
    const match = line.match(/^\?\?\s+(.+)$/);
    if (!match) continue;
    const relPath = match[1];
    hash.update(relPath).update("\0");
    try {
      const resolved = guard.resolve(workspace, relPath);
      const stat = await fsp.stat(resolved.absPath);
      hash.update(String(stat.size)).update("\0").update(String(Math.floor(stat.mtimeMs))).update("\0");
      if (stat.isFile() && stat.size <= config.maxReadBytes) {
        hash.update(await fsp.readFile(resolved.absPath));
      }
    } catch (error) {
      hash.update(errorText(error));
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

function normalizeGitOutput(output: string): string {
  return output.trim() === "(no output)" ? "" : output;
}

function decodeGitQuotedPath(pathText: string): string {
  const input = pathText.startsWith('"') && pathText.endsWith('"') ? pathText.slice(1, -1) : pathText;
  let decoded = "";
  let escapedBytes: number[] = [];
  const flushEscapedBytes = () => {
    if (!escapedBytes.length) return;
    decoded += Buffer.from(escapedBytes).toString("utf8");
    escapedBytes = [];
  };
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char !== "\\") {
      flushEscapedBytes();
      decoded += char;
      continue;
    }
    i += 1;
    const escaped = input[i];
    if (escaped === undefined) throw new CodexProError(`Invalid quoted Git path: ${pathText}`);
    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      for (let j = 0; j < 2 && i + 1 < input.length && /[0-7]/.test(input[i + 1]); j += 1) {
        i += 1;
        octal += input[i];
      }
      escapedBytes.push(Number.parseInt(octal, 8));
    } else {
      flushEscapedBytes();
      decoded += ({ a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" } as Record<string, string>)[escaped] ?? escaped;
    }
  }
  flushEscapedBytes();
  return decoded;
}

function stripPatchPathComponents(filePath: string, stripComponents: number): string {
  if (path.isAbsolute(filePath) || path.win32.isAbsolute(filePath)) return filePath;
  let stripped = filePath;
  for (let i = 0; i < stripComponents; i += 1) {
    const slash = stripped.indexOf("/");
    if (slash < 0) return stripped;
    stripped = stripped.slice(slash + 1);
  }
  return stripped;
}

function normalizePatchPath(rawPath: string, stripComponents = 1): string | undefined {
  const raw = rawPath.trim().split("\t")[0]?.trim();
  if (!raw || raw === "/dev/null") return undefined;
  const unquoted = raw.startsWith('"') && raw.endsWith('"') ? decodeGitQuotedPath(raw.slice(1, -1)) : raw;
  return stripPatchPathComponents(unquoted, stripComponents);
}

type ApplyPatchOperationFailureKind =
  | "git_unavailable"
  | "check_failed"
  | "apply_failed";

export class ApplyPatchOperationError extends CodexProError {
  constructor(
    public readonly applyPatchFailureKind: ApplyPatchOperationFailureKind
  ) {
    super(`apply_patch ${applyPatchFailureKind}`);
  }
}

class ApplyPatchTargetError extends CodexProError {
  constructor(
    public readonly targetPath: string,
    public readonly targetCause: unknown
  ) {
    super(targetCause instanceof Error ? targetCause.message : String(targetCause));
  }
}

function patchHasSymlinkMode(patch: string): boolean {
  return patch.split(/\r?\n/).some((line) => /^(?:new|old|deleted) file mode 120000\s*$/.test(line) || /^new mode 120000\s*$/.test(line) || /^old mode 120000\s*$/.test(line));
}

function patchTouchedPaths(patch: string): string[] {
  const paths = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      const normalized = normalizePatchPath(line.slice(4));
      if (normalized) paths.add(normalized);
    } else if (line.startsWith("rename from ") || line.startsWith("rename to ") || line.startsWith("copy from ") || line.startsWith("copy to ")) {
      const normalized = normalizePatchPath(line.replace(/^(?:rename|copy) (?:from|to) /, ""), 0);
      if (normalized) paths.add(normalized);
    }
  }
  return [...paths];
}

function validateApplyPatchInput(config: CodexProConfig, patch: string): string[] {
  if (!patch.trim()) throw new CodexProError("patch is required.");
  if (Buffer.byteLength(patch, "utf8") > config.maxWriteBytes) {
    throw new CodexProError(`Patch is too large. Limit: ${config.maxWriteBytes} bytes.`);
  }
  if (hasSecretValue(patch)) {
    throw new CodexProError("Secret-looking content is blocked from apply_patch. Use placeholders such as [REDACTED_SECRET].");
  }
  if (patchHasSymlinkMode(patch)) {
    throw new CodexProError("Symlink patches are blocked from apply_patch.");
  }

  const touchedPaths = patchTouchedPaths(patch);
  if (!touchedPaths.length) throw new CodexProError("Patch must include at least one file path.");
  return touchedPaths;
}

function applyWorkspacePatch(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  patch: string
): ApplyPatchProviderResult {
  const touchedPaths = validateApplyPatchInput(config, patch);
  const paths = [...new Set(touchedPaths.map((touchedPath) => {
    try {
      const resolved = guard.resolve(workspace, touchedPath, { forWrite: true });
      assertWriteToolAllowed(config, resolved.relPath);
      return resolved.relPath;
    } catch (error) {
      throw new ApplyPatchTargetError(touchedPath, error);
    }
  }))];

  const check = spawnSync("git", ["apply", "--check", "--whitespace=nowarn"], {
    cwd: workspace.root,
    input: patch,
    encoding: "utf8",
    maxBuffer: config.maxOutputBytes,
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (check.error) {
    if (nodeErrorCode(check.error) === "ENOENT") {
      throw new ApplyPatchOperationError("git_unavailable");
    }
    throw new ApplyPatchOperationError("check_failed");
  }
  if (check.status !== 0) {
    throw new ApplyPatchOperationError("check_failed");
  }

  const applied = spawnSync("git", ["apply", "--whitespace=nowarn"], {
    cwd: workspace.root,
    input: patch,
    encoding: "utf8",
    maxBuffer: config.maxOutputBytes,
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (applied.error) {
    if (nodeErrorCode(applied.error) === "ENOENT") {
      throw new ApplyPatchOperationError("git_unavailable");
    }
    throw new ApplyPatchOperationError("apply_failed");
  }
  if (applied.status !== 0) {
    throw new ApplyPatchOperationError("apply_failed");
  }

  const diff = redactSensitiveText(patch.trimEnd());
  const stats = diffStats(diff);
  return {
    paths,
    stdout: redactSensitiveText(applied.stdout?.trim() || ""),
    stderr: redactSensitiveText(applied.stderr?.trim() || ""),
    diff,
    additions: stats.additions,
    deletions: stats.deletions,
    changed: true
  };
}

function looksLikeGitError(output: string): boolean {
  const trimmed = output.trim();
  const lower = trimmed.toLowerCase();
  return (
    trimmed.startsWith("fatal:") ||
    trimmed.startsWith("error:") ||
    trimmed.startsWith("git unavailable or failed:") ||
    trimmed.startsWith("git exited with status") ||
    trimmed.startsWith("usage: git ") ||
    lower.includes("not a git repository")
  );
}

function previewText(value: string, maxLines = 40, maxChars = 12_000): string {
  const lines = value.replace(/\r\n/g, "\n").split("\n").slice(0, maxLines).join("\n");
  return lines.length > maxChars ? `${lines.slice(0, maxChars)}\n...[preview truncated]` : lines;
}

function changedStatusLines(status: string): string[] {
  return status
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "(no output)" && !line.startsWith("##"));
}

function changedPathsFromStatus(lines: string[]): string[] {
  const paths: string[] = [];
  for (const line of lines) {
    let raw: string;
    if (line.startsWith("?? ")) raw = line.slice(3).trim();
    else if (line.includes("\t")) raw = line.split("\t").pop()?.trim() ?? "";
    else if (/^.{2}\s/.test(line)) raw = line.slice(3).trim();
    else continue;
    if (raw.includes(" -> ")) raw = raw.split(" -> ").pop() ?? raw;
    const decoded = decodeGitQuotedPath(raw);
    if (decoded && !paths.includes(decoded)) paths.push(decoded);
  }
  return paths;
}

function cleanOneLine(value: unknown, fallback: string, maxLength = 120): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maxLength);
}

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, openWorldHint: false, destructiveHint: false };
const SESSION_READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: false };
const LOCAL_WRITE_ANNOTATIONS = { readOnlyHint: false, openWorldHint: false, destructiveHint: true, idempotentHint: false };
const BASH_ANNOTATIONS = { readOnlyHint: false, openWorldHint: true, destructiveHint: true, idempotentHint: false };
const HANDOFF_WRITE_ANNOTATIONS = { readOnlyHint: false, openWorldHint: false, destructiveHint: false, idempotentHint: false };

function workspaceIdentityBinding(source?: PolicySessionContextSource): string | undefined {
  if (!source) return undefined;
  return `identity_${createHash("sha256")
    .update(JSON.stringify(source.identity), "utf8")
    .digest("hex")
    .slice(0, 24)}`;
}

function changeSetOwnerBinding(
  source: PolicySessionContextSource | undefined,
  key: Buffer | undefined
): string {
  if (!source || !key) {
    throw new TransactionError(
      "ATOMIC_BACKEND_UNAVAILABLE",
      "Atomic change-set owner binding is unavailable."
    );
  }
  return deriveChangeSetOwnerBinding(source, key);
}

function mutationPolicyRevision(runtime?: PolicyRuntime): string {
  try {
    const revision = runtime?.diagnostics?.().policyRevision;
    return revision && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(revision)
      ? revision
      : "policy-unknown";
  } catch {
    return "policy-unknown";
  }
}

function classifyUndoChangeSetFailure(error: unknown): UndoChangeSetErrorCode {
  if (error instanceof UndoChangeSetError) return error.code;
  if (error instanceof AuditError) {
    return error.code === "AUDIT_INTEGRITY_FAILURE" ? "AUDIT_INTEGRITY_FAILURE" : "AUDIT_UNAVAILABLE";
  }
  if (error instanceof TransactionError) {
    if (error.code === "FILE_VERSION_CONFLICT" || error.code === "TRANSACTION_PRECONDITION_FAILED") {
      return "UNDO_CONFLICT";
    }
    if (
      error.code === "TRANSACTION_BUSY" ||
      error.code === "ATOMIC_BACKEND_UNAVAILABLE" ||
      error.code === "TRANSACTION_FAILED" ||
      error.code === "ROLLBACK_FAILED" ||
      error.code === "TRANSACTION_RECOVERY_REQUIRED"
    ) return error.code;
  }
  return "INTERNAL_ERROR";
}

function undoChangeSetFailureResult(
  error: unknown,
  args: { workspace_id?: string; change_set_id?: string },
  startedAt: number
): any {
  const code = classifyUndoChangeSetFailure(error);
  const details = code === "WORKSPACE_NOT_FOUND"
    ? { workspace_id: String(args.workspace_id ?? "").slice(0, 160) }
    : code === "CHANGE_SET_NOT_FOUND"
      ? { change_set_id: String(args.change_set_id ?? "") }
      : {};
  const structured = createUndoChangeSetFailure(code, details, Date.now() - startedAt);
  return {
    ...textResult(
      `Undo failed.\nCode: ${structured.error?.code ?? "INTERNAL_ERROR"}\n${structured.error?.message ?? "Undo failed."}`,
      structured
    ),
    isError: true
  };
}

function buildServerConfigData(
  config: CodexProConfig,
  server: McpServer,
  runtimeDiagnostics?: PolicyRuntimeDiagnostics
): ServerConfigData {
  const registeredTools = registeredToolNames(server);
  const baselineCapabilities = baselineNodeCapabilityReport(process.platform);
  const diagnostics = runtimeDiagnostics ?? {
    policyRevision: null,
    permissionProfileId: config.permissionProfileId ?? null,
    hardPolicyRevision: HARD_POLICY_REVISION,
    grantRevision: null,
    enforcement: {
      active: false,
      backendId: baselineCapabilities.backendId,
      evidenceRevision: baselineCapabilities.evidenceRevision,
      missingCapabilities: []
    }
  };
  return serverConfigDataSchema.parse({
    defaultRoot: config.defaultRoot,
    allowedRoots: config.allowedRoots,
    host: config.host,
    port: config.port,
    widgetDomain: config.widgetDomain,
    authEnabled: Boolean(config.authToken),
    allowedHosts: config.allowedHosts,
    allowedOrigins: config.allowedOrigins,
    allowQueryToken: config.allowQueryToken,
    bashMode: config.bashMode,
    bashAvailability: config.bashMode === "off" ? null : probeBashAvailability(),
    bashTranscript: config.bashTranscript,
    bashSessionId: config.bashSessionId ?? null,
    requireBashSession: config.requireBashSession,
    codexSessions: config.codexSessions,
    codexDir: config.codexDir,
    writeMode: config.writeMode,
    toolMode: config.toolMode,
    policyEngineMode: config.policyEngineMode ?? "legacy",
    permissionProfileId: diagnostics.permissionProfileId,
    policyRevision: diagnostics.policyRevision,
    hardPolicyRevision: diagnostics.hardPolicyRevision,
    grantRevision: diagnostics.grantRevision,
    enforcement: diagnostics.enforcement,
    toolCards: config.toolCards,
    connectionTest: config.connectionTest,
    analysisEnabled: config.analysisEnabled,
    analysisLimits: config.analysisLimits,
    inheritEnv: config.inheritEnv,
    contextDir: config.contextDir,
    maxReadBytes: config.maxReadBytes,
    maxWriteBytes: config.maxWriteBytes,
    maxOutputBytes: config.maxOutputBytes,
    maxSearchResults: config.maxSearchResults,
    blockedGlobs: config.blockedGlobs,
    registeredTools,
    registeredToolCount: registeredTools.length
  });
}

import { upgradeCodexProSupertool } from "./codexproSupertool.js";
import {
  installPolicyKernel,
  type PolicyRuntime,
  type PolicyRuntimeDiagnostics,
  type ToolResourceResolver
} from "./policy/integration.js";
import { baselineNodeCapabilityReport } from "./policy/enforcement.js";
import { HARD_POLICY_REVISION } from "./policy/hardPolicy.js";
import type { PolicySessionContextSource } from "./policy/identity.js";
import { createDefaultPolicyRuntime } from "./policy/runtime.js";
import type { AuditEventV1 } from "./policy/types.js";
import {
  deriveChangeSetOwnerBinding,
  UndoChangeSetError,
  type UndoChangeSetErrorCode,
  type UndoChangeSetService
} from "./changesets/undo.js";
import {
  createUndoChangeSetFailure,
  createUndoChangeSetSuccess,
  undoChangeSetInputV2Schema,
  undoChangeSetOutputShape,
  type UndoChangeSetData
} from "./tools/schemas/undoChangeSet.js";

export function createCodexProServer(
  config: CodexProConfig,
  dependencies: CodexProServerDependencies = {}
): McpServer {
  assertFileTransactionConfiguration(config, {
    workspaceMutatorsAtomic: Boolean(
      dependencies.workspaceMutationRuntime &&
      dependencies.changeSetOwnerBindingKey &&
      dependencies.persistentAuditRuntime
    )
  });
  assertToolContractConfiguration(config, {
    durableAuditAvailable: false,
    stateRootAvailable: false,
    movePathsAvailable: false
  });
  const transactionRecoveryCoordinator = config.fileTransactions === "atomic"
    ? dependencies.transactionRecoveryCoordinator ?? createDefaultTransactionRecoveryCoordinator(config)
    : undefined;
  let effectivePolicyRuntime: PolicyRuntime | undefined = dependencies.policyRuntime;
  const workspaces = new WorkspaceManager(config, {
    transportSessionId: dependencies.policySessionContextSource?.transportSessionId,
    identityBinding: workspaceIdentityBinding(dependencies.policySessionContextSource),
    policyRevision: () => {
      try {
        return effectivePolicyRuntime?.diagnostics?.().policyRevision ?? null;
      } catch {
        return null;
      }
    },
    beforeWorkspaceUse: transactionRecoveryCoordinator
      ? (canonicalRoot) => transactionRecoveryCoordinator.ensureWorkspaceReady(canonicalRoot)
      : undefined
  });
  const guard = new PathGuard(config);
  const policyEngineMode = config.policyEngineMode ?? "legacy";
  const toolResourceResolver: ToolResourceResolver | undefined = dependencies.undoChangeSetService || dependencies.toolResourceResolver
    ? {
        describe(toolName, args) {
          if (toolName === "undo_change_set") {
            if (!dependencies.undoChangeSetService) {
              throw new Error("Undo resource resolver is unavailable.");
            }
            const workspaceId = typeof args.workspace_id === "string" ? args.workspace_id : "";
            const changeSetId = typeof args.change_set_id === "string" ? args.change_set_id : "";
            const workspace = workspaces.getWorkspace(workspaceId);
            return {
              resource: dependencies.undoChangeSetService.describeResource({
                workspace,
                changeSetId,
                ownerBinding: changeSetOwnerBinding(
                  dependencies.policySessionContextSource,
                  dependencies.changeSetOwnerBindingKey
                )
              })
            };
          }
          if (!dependencies.toolResourceResolver) {
            throw new Error("Policy resource resolver does not support this tool.");
          }
          return dependencies.toolResourceResolver.describe(toolName, args);
        }
      }
    : undefined;
  const requiresAtomicAuditWrapper = config.fileTransactions === "atomic" && config.writeMode !== "off";
  const runtimePolicyConfig: CodexProConfig = requiresAtomicAuditWrapper && policyEngineMode === "legacy"
    ? { ...config, policyEngineMode: "shadow", auditMode: "required" }
    : config;
  effectivePolicyRuntime ??= (
    (policyEngineMode !== "legacy" || requiresAtomicAuditWrapper) && dependencies.policySessionContextSource
      ? createDefaultPolicyRuntime({
          config: runtimePolicyConfig,
          workspaces,
          guard,
          sessionSource: dependencies.policySessionContextSource,
          auditSink: dependencies.policyAuditSink,
          persistentAudit: dependencies.persistentAuditRuntime,
          resourceResolver: toolResourceResolver
        })
      : undefined
  );
  const server = new McpServer({ name: "CodexPro", version: "0.28.6" }, { instructions: serverInstructions(config) });
  if (dependencies.workspaceMutationRuntime) {
    mutationRegistrationByServer.set(server as object, {
      runtime: dependencies.workspaceMutationRuntime,
      toolNames: dependencies.atomicMutationToolNames ?? new Set<string>()
    });
  }
  const serverConfigDataProvider =
    dependencies.serverConfigDataProvider ??
    (() => buildServerConfigData(config, server, effectivePolicyRuntime?.diagnostics?.()));
  const treeResultProvider =
    dependencies.treeResultProvider ??
    ((context: TreeProviderContext) =>
      repoTree(context.config, context.guard, context.workspace, context.options));
  const readResultProvider =
    dependencies.readResultProvider ??
    ((context: ReadProviderContext) =>
      readTextFile(
        context.config,
        context.guard,
        context.workspace,
        context.path,
        context.options
      ));
  const writeResultProvider =
    dependencies.writeResultProvider ??
    ((context: WriteProviderContext) =>
      writeTextFile(
        context.config,
        context.guard,
        context.workspace,
        context.path,
        context.content,
        context.options
      ));
  const editResultProvider =
    dependencies.editResultProvider ??
    ((context: EditProviderContext) =>
      editTextFile(
        context.config,
        context.guard,
        context.workspace,
        context.path,
        context.oldText,
        context.newText,
        context.options
      ));
  const applyPatchResultProvider =
    dependencies.applyPatchResultProvider ??
    ((context: ApplyPatchProviderContext) =>
      applyWorkspacePatch(
        context.config,
        context.guard,
        context.workspace,
        context.patch
      ));
  const openCurrentWorkspaceSummaryProvider =
    dependencies.openCurrentWorkspaceSummaryProvider ??
    ((context: OpenCurrentWorkspaceSummaryProviderContext) =>
      workspaceSummary(context.config, context.guard, context.workspace, {
        ...context.options,
        bootstrapContext: false
      }));
  const openWorkspaceProvider =
    dependencies.openWorkspaceProvider ??
    ((root?: string) => workspaces.openWorkspace(root));
  const openWorkspaceSummaryProvider =
    dependencies.openWorkspaceSummaryProvider ??
    ((context: OpenWorkspaceSummaryProviderContext) =>
      workspaceSummary(context.config, context.guard, context.workspace, {
        ...context.options,
        bootstrapContext: false
      }));
  const workspaceSnapshotSummaryProvider =
    dependencies.workspaceSnapshotSummaryProvider ??
    ((context: WorkspaceSnapshotSummaryProviderContext) =>
      workspaceSummary(
        context.config,
        context.guard,
        context.workspace,
        context.options
      ));
  const workspaceSnapshotAiContextProvider =
    dependencies.workspaceSnapshotAiContextProvider ??
    ((context: WorkspaceSnapshotAiContextProviderContext) =>
      readAiBridgeContext(
        context.config,
        context.guard,
        context.workspace
      ));
  const listWorkspacesProvider =
    dependencies.listWorkspacesProvider ??
    (() => workspaces.listWorkspaces());
  const inspectWorkspaceProvider =
    dependencies.inspectWorkspaceProvider ??
    ((input: { config: CodexProConfig; guard: PathGuard; workspace: Workspace }) =>
      inspectWorkspace(input.config, input.guard, input.workspace));
  const codexproInventoryProvider =
    dependencies.codexproInventoryProvider ??
    ((context: CodexProInventoryProviderContext) =>
      codexproInventory(context.config, context.workspace, context.options));
  const loadSkillProvider =
    dependencies.loadSkillProvider ??
    ((context: LoadSkillProviderContext) =>
      loadSkill(context.workspace, context.options));
  const codexSessionsProvider =
    dependencies.codexSessionsProvider ??
    ((context: CodexSessionsProviderContext) =>
      listCodexSessions(context.config, context.options));
  const readCodexSessionProvider =
    dependencies.readCodexSessionProvider ??
    ((context: ReadCodexSessionProviderContext) =>
      readCodexSession(context.config, {
        sessionId: context.request.sessionId,
        sourcePath: context.request.sourcePath,
        maxMessages: context.request.maxMessages,
        maxTotalBytes: context.request.maxTotalBytes
      }));
  const readHandoffProvider =
    dependencies.readHandoffProvider ??
    ((context: ReadHandoffProviderContext) =>
      readHandoffContext(
        context.config,
        context.guard,
        context.workspace,
        context.limits
      ));
  const waitForHandoffStateProvider =
    dependencies.waitForHandoffStateProvider ??
    ((context: WaitForHandoffStateProviderContext) =>
      readHandoffRunState(
        context.config,
        context.guard,
        context.workspace,
        context.maxStateBytes
      ));
  const waitForHandoffArtifactsProvider =
    dependencies.waitForHandoffArtifactsProvider ??
    ((context: WaitForHandoffArtifactsProviderContext) =>
      readWaitForHandoffArtifacts(
        context.config,
        context.guard,
        context.workspace,
        context.requestedKinds,
        context.limits.maxArtifactBytes
      ));
  const codexContextProvider =
    dependencies.codexContextProvider ??
    ((context: CodexContextProviderContext) =>
      readCodexContext(context.config, context.guard, context.workspace, {
        targetPath: context.targetPath,
        targetKind: context.targetKind,
        includeAiBridge: context.includeAiBridge,
        includeGit: context.includeGitStatus,
        includeDiff: context.includeGitDiff,
        maxAgentBytes: context.maxAgentBytes
      }));
  const exportProContextProvider =
    dependencies.exportProContextProvider ??
    (async (context: ExportProContextProviderContext) => {
      if (config.fileTransactions !== "atomic") {
        return exportPreparedProContext(
          context.config,
          context.guard,
          context.workspace,
          context.request,
          context.output
        );
      }
      const runtime = dependencies.workspaceMutationRuntime;
      if (!runtime) throw new TransactionError("ATOMIC_BACKEND_UNAVAILABLE", "Atomic export runtime is unavailable.");
      const mutation = await prepareProContextMutation(
        context.config,
        context.guard,
        context.workspace,
        context.request,
        context.output
      );
      return attachPreparedBatchMutation({
        runtime,
        workspace: context.workspace,
        prepared: mutation.prepared,
        context: {
          toolName: "export_pro_context",
          requestId: null,
          ownerBinding: changeSetOwnerBinding(dependencies.policySessionContextSource, dependencies.changeSetOwnerBindingKey),
          policyRevision: mutationPolicyRevision(effectivePolicyRuntime),
          contractVersion: config.toolContractVersion,
          retentionMs: config.changeSetRetention.activeRetentionMs
        },
        result: mutation.result
      });
    });
  const handoffToAgentProvider =
    dependencies.handoffToAgentProvider ??
    (async (context: AgentHandoffProviderContext) => {
      if (config.fileTransactions !== "atomic") return writePreparedAgentHandoff(context);
      const runtime = dependencies.workspaceMutationRuntime;
      if (!runtime) throw new TransactionError("ATOMIC_BACKEND_UNAVAILABLE", "Atomic handoff runtime is unavailable.");
      const mutation = await prepareAgentHandoffMutation(context);
      return attachPreparedBatchMutation({
        runtime,
        workspace: context.workspace,
        prepared: mutation.prepared,
        context: {
          toolName: "handoff_to_agent",
          requestId: null,
          ownerBinding: changeSetOwnerBinding(dependencies.policySessionContextSource, dependencies.changeSetOwnerBindingKey),
          policyRevision: mutationPolicyRevision(effectivePolicyRuntime),
          contractVersion: config.toolContractVersion,
          retentionMs: config.changeSetRetention.activeRetentionMs
        },
        result: mutation.result
      });
    });
  const handoffToAgentNow = dependencies.handoffToAgentNow ?? (() => new Date().toISOString());
  const handoffToCodexProvider =
    dependencies.handoffToCodexProvider ??
    (async (context: AgentHandoffProviderContext) => {
      if (config.fileTransactions !== "atomic") return writePreparedAgentHandoff(context);
      const runtime = dependencies.workspaceMutationRuntime;
      if (!runtime) throw new TransactionError("ATOMIC_BACKEND_UNAVAILABLE", "Atomic handoff runtime is unavailable.");
      const mutation = await prepareAgentHandoffMutation(context);
      return attachPreparedBatchMutation({
        runtime,
        workspace: context.workspace,
        prepared: mutation.prepared,
        context: {
          toolName: "handoff_to_codex",
          requestId: null,
          ownerBinding: changeSetOwnerBinding(dependencies.policySessionContextSource, dependencies.changeSetOwnerBindingKey),
          policyRevision: mutationPolicyRevision(effectivePolicyRuntime),
          contractVersion: config.toolContractVersion,
          retentionMs: config.changeSetRetention.activeRetentionMs
        },
        result: mutation.result
      });
    });
  const handoffToCodexNow = dependencies.handoffToCodexNow ?? (() => new Date().toISOString());
  const waitForHandoffNow = dependencies.waitForHandoffNow ?? Date.now;
  const waitForHandoffSleep = dependencies.waitForHandoffSleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const bashResultProvider =
    dependencies.bashResultProvider ??
    ((context: BashProviderContext) =>
      runBash(
        context.config,
        context.guard,
        context.workspace,
        context.command,
        context.options
      ));
  const searchResultProvider =
    dependencies.searchResultProvider ??
    ((context: SearchProviderContext) =>
      searchWorkspace(
        context.config,
        context.guard,
        context.workspace,
        context.options
      ));
  const gitStatusResultProvider =
    dependencies.gitStatusResultProvider ??
    ((context: GitStatusProviderContext) =>
      gitStatus(
        context.config,
        context.workspace,
        context.guard,
        context.path
      ));
  const gitDiffResultProvider =
    dependencies.gitDiffResultProvider ??
    ((context: GitDiffProviderContext) =>
      gitDiff(
        context.config,
        context.guard,
        context.workspace,
        context.path,
        context.staged
      ));
  const showChangesStatusProvider =
    dependencies.showChangesStatusProvider ??
    ((context: ShowChangesGitProviderContext) =>
      gitDiffStatus(
        context.config,
        context.guard,
        context.workspace,
        context.path,
        context.staged
      ));
  const showChangesDiffProvider =
    dependencies.showChangesDiffProvider ??
    ((context: ShowChangesGitProviderContext) =>
      gitDiff(
        context.config,
        context.guard,
        context.workspace,
        context.path,
        context.staged
      ));
  const showChangesAnalysisProvider =
    dependencies.showChangesAnalysisProvider ??
    ((context: ShowChangesAnalysisProviderContext) =>
      reviewWorkspaceChanges(
        context.config,
        context.guard,
        context.workspace,
        { changedPaths: context.changedPaths }
      ));
  registeredToolNamesByServer.set(server as object, []);
  registerToolCardResource(server, config);

  registerCodexTool(
    config,
    server,
    SUPERTOOL_NAME,
    {
      title: "CodexPro Supertool",
      description:
        "Stable wrapper for advanced ChatGPT connector setups. Pass action plus args to call an already-registered CodexPro tool without changing the visible schema; it cannot call tools disabled by the current mode.",
      inputSchema: {
        action: z.string().optional().describe("Action or registered tool name. Use list_actions to see what this server mode allows."),
        args: z.record(z.any()).optional().describe("Arguments for the selected action. Same shape as the wrapped CodexPro tool.")
      },
      annotations: BASH_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Running CodexPro supertool action...",
        "openai/toolInvocation/invoked": "CodexPro supertool action complete"
      }
    },
    async (args) => {
      const action = normalizeSupertoolAction(args.action);
      const names = registeredToolNames(server).filter((name) => name !== SUPERTOOL_NAME);
      if (action === "list_actions" || action === "help") {
        const text = [
          "# CodexPro Supertool",
          "",
          "Use `codexpro` only when a stable wrapper is useful for ChatGPT connector caching or custom workflows. The explicit tools remain the preferred default because they give clearer descriptions and validation.",
          "",
          "## Available actions",
          "",
          names.length ? names.map((name) => `- ${name}`).join("\n") : "- none",
          "",
          "## Usage",
          "",
          "```json",
          JSON.stringify({ action: "search", args: { workspace_id: "ws_...", query: "needle", path: "src" } }, null, 2),
          "```"
        ].join("\n");
        return textResult(text, {
          actions: names,
          action_count: names.length,
          aliases: SUPERTOOL_ACTION_ALIASES,
          tool_mode: config.toolMode,
          bash_mode: config.bashMode,
          write_mode: config.writeMode
        });
      }

      if (action === SUPERTOOL_NAME) {
        throw new CodexProError("codexpro cannot call itself. Use action=list_actions to inspect available wrapped actions.");
      }

      const handler = registeredToolHandler(server, action);
      if (!handler) {
        throw new CodexProError(
          `CodexPro action is not available in the current mode: ${action}. ` +
            "Call codexpro with action=list_actions, or restart CodexPro with a broader tool mode if that action should be exposed."
        );
      }

      const childArgs =
        args.args && typeof args.args === "object" && !Array.isArray(args.args)
          ? args.args
          : {};
      let result: any;
      try {
        result = await handler(childArgs);
      } catch (error) {
        result = errorResult(error);
      }
      if (result && typeof result === "object") {
        const structured = result.structuredContent;
        result.structuredContent = {
          codexpro_tool: action,
          codexpro_title: action,
          codexpro_super_action: action,
          wrapped_tool: action,
          ...(structured && typeof structured === "object" && !Array.isArray(structured) ? structured : {})
        };
      }
      return result;
    }
  );

  registerCodexTool(
    config,
    server,
    "server_config",
    {
      title: "Server Config",
      description: "Show CodexPro server configuration, safety modes, limits, and blocked paths. Does not reveal auth tokens.",
      inputSchema: {},
      outputSchema: serverConfigOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Reading CodexPro server config...",
        "openai/toolInvocation/invoked": "CodexPro server config ready"
      }
    },
    async () => {
      try {
        const safeConfig = serverConfigDataSchema.parse(await serverConfigDataProvider());

        return textResult(
          `# CodexPro Server Config\n\n${JSON.stringify(safeConfig, null, 2)}`,
          createServerConfigSuccess(safeConfig)
        );
      } catch (error) {
        const message = errorText(error);
        return {
          ...textResult(message, createServerConfigFailure(message)),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "codexpro_self_test",
    {
      title: "CodexPro Self Test",
      description:
        "Run controlled local diagnostics only. The optional write/edit probe can touch only .ai-bridge/codexpro-self-test.md, Pro context is built in memory, and this tool does not execute agents or reveal secrets, command output, session ids, Skill names, MCP server names, or Git paths.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        write_probe: z.boolean().optional().describe("Create/edit only .ai-bridge/codexpro-self-test.md. Default: true."),
        bash_probe: z.boolean().optional().describe("Check Bash policy with safe local commands only. Default: true."),
        pro_context_probe: z.boolean().optional().describe("Build a selected-only Pro context bundle in memory without writing pro-context.md. Default: true."),
        include_global_skills: z.boolean().optional().describe("Include user/plugin Skill discovery in the inventory count. Default: true."),
        max_skills: z.number().int().min(1).max(120).optional().describe("Maximum Skills to inspect during the inventory check. Default: 40.")
      },
      outputSchema: codexproSelfTestOutputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Running CodexPro self-test...",
        "openai/toolInvocation/invoked": "CodexPro self-test complete"
      }
    },
    async (args) => {
      let workspace: Workspace;
      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch {
        const details = typeof args.workspace_id === "string"
          ? {
              source: "workspace_id" as const,
              workspace_id: safeCodexProSelfTestWorkspaceId(args.workspace_id)
            }
          : { source: "default_workspace" as const, workspace_id: null };
        const failure = createCodexProSelfTestFailure({
          code: "WORKSPACE_NOT_FOUND",
          details
        });
        return {
          ...textResult(
            codexproSelfTestFailureText(
              "WORKSPACE_NOT_FOUND",
              CODEXPRO_SELF_TEST_ERROR_MESSAGES.WORKSPACE_NOT_FOUND
            ),
            failure
          ),
          isError: true
        };
      }

      const request = normalizeCodexProSelfTestRequest(args);
      const expectedTools = [...toolNamesForMode(config)].sort();
      const registeredTools = [...registeredToolNames(server)].sort();
      const injectedProvider = (
        dependencies as CodexProServerDependencies & {
          codexproSelfTestProvider?: CodexProSelfTestProvider;
        }
      ).codexproSelfTestProvider;
      const provider: CodexProSelfTestProvider = injectedProvider ?? (
        config.fileTransactions !== "atomic"
          ? defaultCodexProSelfTestProvider
          : async (providerContext) => {
              const mutation = await prepareAtomicCodexProSelfTest(providerContext);
              if (!mutation.prepared) return mutation.result;
              const runtime = dependencies.workspaceMutationRuntime;
              if (!runtime) {
                throw new TransactionError(
                  "ATOMIC_BACKEND_UNAVAILABLE",
                  "Atomic self-test runtime is unavailable."
                );
              }
              return attachPreparedBatchMutation({
                runtime,
                workspace: providerContext.workspace,
                prepared: mutation.prepared,
                context: {
                  toolName: "codexpro_self_test",
                  requestId: null,
                  ownerBinding: changeSetOwnerBinding(dependencies.policySessionContextSource, dependencies.changeSetOwnerBindingKey),
                  policyRevision: mutationPolicyRevision(effectivePolicyRuntime),
                  contractVersion: config.toolContractVersion,
                  retentionMs: config.changeSetRetention.activeRetentionMs,
                  retainChangeSet: false
                },
                result: mutation.result
              });
            }
      );
      const context = {
        config,
        guard,
        workspace,
        request,
        expectedTools: [...expectedTools],
        registeredTools: [...registeredTools]
      };

      try {
        const facts = await provider(context);
        const data = buildCodexProSelfTestData(facts, context);
        return carryPendingMutation(
          facts,
          textResult(
            codexproSelfTestHumanText(data),
            createCodexProSelfTestSuccess(data)
          )
        );
      } catch (error) {
        const code = error instanceof CodexProSelfTestInternalError
          ? "INTERNAL_ERROR" as const
          : "SELF_TEST_EXECUTION_FAILED" as const;
        const failure = createCodexProSelfTestFailure({ code, details: {} });
        return {
          ...textResult(
            codexproSelfTestFailureText(code, CODEXPRO_SELF_TEST_ERROR_MESSAGES[code]),
            failure
          ),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "codexpro_inventory",
    {
      title: "CodexPro Inventory",
      description:
        "List CodexPro modes plus discovered skill names and configured MCP server names. Use this early when planning needs local agent capabilities.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        include_global_skills: z.boolean().optional().describe("Include user and plugin skill folders. Default: true."),
        include_mcp_servers: z.boolean().optional().describe("Include configured MCP server names from safe config files. Default: true."),
        max_skills: z.number().int().min(1).max(500).optional().describe("Maximum skills to list. Default: 120.")
      },
      outputSchema: codexproInventoryOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Reading CodexPro inventory...",
        "openai/toolInvocation/invoked": "CodexPro inventory ready"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;
      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failure: CodexProInventoryFailureInput = args.workspace_id && message.startsWith("Unknown workspace_id:")
          ? {
              code: "WORKSPACE_NOT_FOUND",
              details: {
                source: "workspace_id",
                workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
              }
            }
          : !args.workspace_id
            ? {
                code: "WORKSPACE_NOT_FOUND",
                details: { source: "default_workspace", workspace_id: null }
              }
            : { code: "INTERNAL_ERROR", details: {} };
        return {
          ...textResult(
            codexproInventoryFailureText(failure),
            createCodexProInventoryFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }

      const options = {
        includeGlobalSkills: parseBool(args.include_global_skills, true),
        includeMcpServers: parseBool(args.include_mcp_servers, true),
        maxSkills: limitInt(args.max_skills, 120, 1, 500)
      };

      let rawInventory: unknown;
      try {
        rawInventory = await codexproInventoryProvider({ config, workspace, options });
      } catch {
        const failure: CodexProInventoryFailureInput = {
          code: "INVENTORY_DISCOVERY_FAILED",
          details: {}
        };
        return {
          ...textResult(
            codexproInventoryFailureText(failure),
            createCodexProInventoryFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }

      try {
        const inventory = codexproInventoryProviderResultSchema.parse(rawInventory);
        const skills = inventory.skills.map((skill) => ({
          name: skill.name,
          description: skill.description ?? null,
          source: skill.source,
          path: skill.path
        }));
        const data = codexproInventoryDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          bash_mode: config.bashMode,
          write_mode: config.writeMode,
          tool_mode: config.toolMode,
          include_global_skills: options.includeGlobalSkills,
          include_mcp_servers: options.includeMcpServers,
          max_skills: options.maxSkills,
          mcp_server_limit: CODEXPRO_INVENTORY_MCP_SERVER_LIMIT,
          skills,
          skill_count: skills.length,
          skill_counts: codexproInventorySkillCounts(skills),
          skills_truncated: inventory.skillsTruncated,
          mcp_servers: inventory.mcpServers,
          mcp_server_count: inventory.mcpServers.length,
          mcp_servers_truncated: inventory.mcpServersTruncated
        });
        return textResult(
          codexproInventorySuccessText(data),
          createCodexProInventorySuccess(data, Date.now() - startedAt)
        );
      } catch {
        const failure: CodexProInventoryFailureInput = {
          code: "INTERNAL_ERROR",
          details: {}
        };
        return {
          ...textResult(
            codexproInventoryFailureText(failure),
            createCodexProInventoryFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "load_skill",
    {
      title: "Load Skill",
      description:
        "Load the bounded SKILL.md body for a discovered workspace, user, or plugin skill by name. Does not accept arbitrary paths; use after open_current_workspace/open_workspace shows skill_inventory.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        name: z.string().describe("Exact skill name from skill_inventory or codexpro_inventory."),
        source: z.enum(["workspace", "user", "plugin", "other"]).optional().describe("Optional source when multiple skills share a name."),
        path: z.string().optional().describe("Exact sanitized path from skill_inventory when name/source are still ambiguous."),
        include_global_skills: z.boolean().optional().describe("Also scan installed user/plugin skills. Default: auto when source/path is not workspace."),
        max_skills: z.number().int().min(1).max(500).optional().describe("Maximum skills to scan while resolving the requested skill. Default: 500."),
        max_bytes: z.number().int().min(1000).max(100000).optional().describe("Maximum bytes to return from SKILL.md. Default: 40000.")
      },
      outputSchema: loadSkillOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "codexpro/preserveStructuredContent": true,
        "openai/toolInvocation/invoking": "Loading skill instructions...",
        "openai/toolInvocation/invoked": "Skill instructions loaded"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let request: NormalizedLoadSkillRequest;
      try {
        const normalized = normalizeLoadSkillRequest(args);
        if ("code" in normalized) return loadSkillFailureResult(normalized, startedAt);
        request = normalized;
      } catch {
        return loadSkillFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }

      let workspace: Workspace;
      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch {
        const failure: LoadSkillFailureInput = args.workspace_id
          ? {
              code: "WORKSPACE_NOT_FOUND",
              details: {
                source: "workspace_id",
                workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
              }
            }
          : {
              code: "WORKSPACE_NOT_FOUND",
              details: { source: "default_workspace", workspace_id: null }
            };
        return loadSkillFailureResult(failure, startedAt);
      }

      let rawLoaded: unknown;
      try {
        rawLoaded = await loadSkillProvider({
          config,
          workspace,
          options: request.options
        });
      } catch (error) {
        return loadSkillFailureResult(
          classifyLoadSkillProviderFailure(error, request),
          startedAt
        );
      }

      try {
        const loaded = loadSkillProviderResultSchema.parse(rawLoaded);
        const skill = normalizeLoadSkillItem(loaded.skill);
        if (
          skill.name !== request.selector.name ||
          (request.selector.source !== null && skill.source !== request.selector.source) ||
          (request.selector.path !== null && skill.path !== request.selector.path) ||
          (!request.options.includeGlobal && skill.source !== "workspace")
        ) {
          throw new CodexProError("Load Skill provider returned a mismatched Skill identity.");
        }

        const safeText = redactSensitiveText(loaded.text);
        const data = loadSkillDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          selector: request.selector,
          skill,
          include_global_skills: request.options.includeGlobal,
          max_skills: request.options.maxSkills,
          max_bytes: request.options.maxBytes,
          bytes: loaded.bytes,
          returned_bytes: Buffer.byteLength(safeText, "utf8"),
          total_bytes: loaded.totalBytes,
          truncated: loaded.truncated,
          resolution_truncated: loaded.discoveryTruncated,
          redacted: safeText !== loaded.text,
          text: safeText
        });
        const status = [
          data.truncated ? "source truncated" : "source complete",
          data.redacted ? "secret-looking content redacted" : "no redaction"
        ].join(", ");
        const text = [
          "# Load Skill",
          "",
          `Name: ${data.skill.name}`,
          `Source: ${data.skill.source}`,
          `Path: ${data.skill.path}`,
          `Source bytes: ${data.bytes}/${data.total_bytes}`,
          `Returned bytes: ${data.returned_bytes}`,
          `Status: ${status}`,
          "",
          "## Instructions",
          "",
          data.text
        ].join("\n");
        return textResult(
          text,
          createLoadSkillSuccess(data, Date.now() - startedAt)
        );
      } catch {
        return loadSkillFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "list_workspaces",
    {
      title: "List Workspaces",
      description: "List currently opened CodexPro workspaces for this server/config.",
      inputSchema: {},
      outputSchema: listWorkspacesOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Listing CodexPro workspaces...",
        "openai/toolInvocation/invoked": "CodexPro workspaces listed"
      }
    },
    async () => {
      const startedAt = Date.now();
      let rawWorkspaces: unknown;

      try {
        rawWorkspaces = await listWorkspacesProvider();
      } catch {
        const failure: ListWorkspacesFailureInput = {
          code: "WORKSPACE_LIST_FAILED",
          details: {}
        };
        return {
          ...textResult(
            listWorkspacesFailureText(failure),
            createListWorkspacesFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }

      try {
        const current = listWorkspacesProviderResultSchema.parse(rawWorkspaces);
        const data = listWorkspacesDataSchema.parse({
          workspaces: current.map((workspace) => ({
            id: workspace.id,
            root: workspace.root,
            openedAt: workspace.openedAt
          })),
          count: current.length
        });
        const text = current.length
          ? current
              .map(
                (workspace) =>
                  `- ${workspace.id} — ${workspace.root} (opened ${workspace.openedAt})`
              )
              .join("\n")
          : "No workspaces opened on this CodexPro server/config yet. Call open_workspace first.";

        return textResult(
          text,
          createListWorkspacesSuccess(data, Date.now() - startedAt)
        );
      } catch {
        const failure: ListWorkspacesFailureInput = {
          code: "INTERNAL_ERROR",
          details: {}
        };
        return {
          ...textResult(
            listWorkspacesFailureText(failure),
            createListWorkspacesFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "close_workspace",
    {
      title: "Close Workspace",
      description: "Close one session-scoped workspace handle. The handle becomes unusable immediately; reopen the workspace to obtain a new workspace_id.",
      inputSchema: {
        workspace_id: z.string()
          .regex(/^ws_[0-9a-f]{32}$/)
          .describe("Opaque workspace handle returned by open_workspace or open_current_workspace.")
      },
      outputSchema: closeWorkspaceOutputShape,
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: true,
        idempotentHint: false
      },
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Closing CodexPro workspace...",
        "openai/toolInvocation/invoked": "CodexPro workspace closed"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      const workspaceId = safeTreeWorkspaceIdDetail(args.workspace_id);
      try {
        const closed = workspaces.closeWorkspace(args.workspace_id);
        const data = {
          workspace_id: closed.workspaceId,
          closed_at: closed.closedAt,
          state: closed.state
        } as const;
        return textResult(
          `# Close Workspace\n\nWorkspace handle closed: ${closed.workspaceId}`,
          createCloseWorkspaceSuccess(data, Date.now() - startedAt)
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const failure: CloseWorkspaceFailureInput =
          message.startsWith("Unknown workspace_id:") || message.startsWith("workspace_id is required")
            ? { code: "WORKSPACE_NOT_FOUND", details: { workspace_id: workspaceId } }
            : { code: "INTERNAL_ERROR", details: {} };
        const text = [
          "# Close Workspace Error",
          "",
          `Code: ${failure.code}`,
          CLOSE_WORKSPACE_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(text, createCloseWorkspaceFailure(failure, Date.now() - startedAt)),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "open_current_workspace",
    {
      title: "Open Current Workspace",
      description:
        "Use this once at the start to open the configured default workspace without accepting a path. Do not call open_workspace after this unless switching roots.",
      inputSchema: {
        include_tree: z.boolean().optional().describe("Include a compact file tree. Default: false for speed."),
        max_depth: z.number().int().min(1).max(8).optional().describe("Tree depth when include_tree=true. Default: 2."),
        include_skills: z.boolean().optional().describe("Discover skills by name/description. Default: false for speed."),
        include_global_skills: z.boolean().optional().describe("Also scan installed user/plugin skills when include_skills=true. Default: false.")
      },
      outputSchema: openCurrentWorkspaceOutputShape,
      annotations: SESSION_READ_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Opening current CodexPro workspace...",
        "openai/toolInvocation/invoked": "Current CodexPro workspace opened"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      try {
        const options: OpenCurrentWorkspaceSummaryOptions = {
          includeTree: parseBool(args.include_tree, false),
          maxDepth: limitInt(args.max_depth, 2, 1, 8),
          includeSkills: parseBool(args.include_skills, false),
          includeGlobalSkills: parseBool(args.include_global_skills, false)
        };
        const workspace = workspaces.defaultWorkspace();
        const summary = openCurrentWorkspaceProviderResultSchema.parse(
          await openCurrentWorkspaceSummaryProvider({ config, guard, workspace, options })
        );
        const normalizedInventory = validateOpenCurrentWorkspaceProviderResult(
          summary,
          workspace,
          guard,
          options
        );
        const data = openCurrentWorkspaceDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          agents_loaded: summary.agentsLoaded,
          agents_path: summary.agentsPath ?? null,
          skills: summary.skills,
          skill_inventory: normalizedInventory,
          skill_counts: summary.skillCounts,
          tree: summary.tree ?? null,
          git_status: summary.gitStatus,
          bash_mode: config.bashMode,
          write_mode: config.writeMode,
          tool_mode: config.toolMode
        });

        return textResult(
          summary.text,
          createOpenCurrentWorkspaceSuccess(data, Date.now() - startedAt)
        );
      } catch (error) {
        const failure = classifyOpenCurrentWorkspaceFailure(error);
        const text = [
          "# Open Current Workspace Error",
          "",
          `Code: ${failure.code}`,
          OPEN_CURRENT_WORKSPACE_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(
            text,
            createOpenCurrentWorkspaceFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "open_workspace",
    {
      title: "Open Workspace",
      description:
        "Open a local project directory as a CodexPro workspace. Returns a workspace_id plus git status, AGENTS.md, and a compact file tree.",
      inputSchema: {
        root: z.string().optional().describe("Project directory to open. Omit to use CODEXPRO_ROOT/current working directory. Supports ~/ paths."),
        path: z.string().optional().describe("Alias for root. Useful for clients that naturally send path instead of root."),
        include_tree: z.boolean().optional().describe("Include a compact file tree. Default: true."),
        max_depth: z.number().int().min(1).max(8).optional().describe("Tree depth. Default: 3."),
        max_files: z.number().int().min(1).max(3000).optional().describe("Alias for maximum tree entries. Default: 500."),
        include_skills: z.boolean().optional().describe("Discover skills by name/description. Default: false for speed."),
        include_global_skills: z.boolean().optional().describe("Also scan installed user/plugin skills when include_skills=true. Default: false."),
        bootstrap_context: z.boolean().optional().describe("Deprecated and ignored. Use handoff_to_agent to create .ai-bridge files.")
      },
      outputSchema: openWorkspaceOutputShape,
      annotations: SESSION_READ_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Opening CodexPro workspace...",
        "openai/toolInvocation/invoked": "CodexPro workspace opened"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;
      let source: OpenWorkspaceRootSource = "configured_default_root";

      try {
        const selection = resolveOpenWorkspaceRoot(args);
        source = selection.source;
        workspace = openWorkspaceProvider(selection.requestedRoot);
      } catch (error) {
        const failure = classifyOpenWorkspaceRootFailure(error, source);
        const text = [
          "# Open Workspace Error",
          "",
          `Code: ${failure.code}`,
          OPEN_WORKSPACE_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(text, createOpenWorkspaceFailure(failure, Date.now() - startedAt)),
          isError: true
        };
      }

      try {
        const options: OpenWorkspaceSummaryOptions = {
          includeTree: args.include_tree !== false,
          maxDepth: limitInt(args.max_depth, 3, 1, 8),
          maxEntries: limitInt(args.max_files, 500, 1, 3000),
          includeSkills: parseBool(args.include_skills, false),
          includeGlobalSkills: parseBool(args.include_global_skills, false)
        };
        const summary = openWorkspaceProviderResultSchema.parse(
          await openWorkspaceSummaryProvider({ config, guard, workspace, options })
        );
        const normalizedInventory = validateOpenWorkspaceProviderResult(
          summary,
          workspace,
          guard,
          options
        );
        const data = openWorkspaceDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          agents_loaded: summary.agentsLoaded,
          agents_path: summary.agentsPath ?? null,
          skills: summary.skills,
          skill_inventory: normalizedInventory,
          skill_counts: summary.skillCounts,
          tree: summary.tree ?? null,
          git_status: summary.gitStatus,
          bash_mode: config.bashMode,
          write_mode: config.writeMode,
          tool_mode: config.toolMode
        });

        return textResult(
          summary.text,
          createOpenWorkspaceSuccess(data, Date.now() - startedAt)
        );
      } catch {
        const failure: OpenWorkspaceFailureInput = { code: "INTERNAL_ERROR", details: {} };
        const text = [
          "# Open Workspace Error",
          "",
          `Code: ${failure.code}`,
          OPEN_WORKSPACE_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(text, createOpenWorkspaceFailure(failure, Date.now() - startedAt)),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "workspace_snapshot",
    {
      title: "Workspace Snapshot",
      description: "Return git status, recent commits, .ai-bridge context, and a compact tree for an opened workspace.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        max_depth: z.number().int().min(1).max(8).optional().describe("Tree depth. Default: 3."),
        max_files: z.number().int().min(1).max(3000).optional().describe("Alias for maximum tree entries. Default: 500."),
        include_skills: z.boolean().optional().describe("Discover repo-local skills. Default: false for speed."),
        include_global_skills: z.boolean().optional().describe("Also scan home-level skill folders when include_skills=true. Default: false.")
      },
      outputSchema: workspaceSnapshotOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Collecting workspace snapshot...",
        "openai/toolInvocation/invoked": "Workspace snapshot ready"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;

      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch {
        const failure = classifyWorkspaceSnapshotWorkspaceFailure(args);
        return {
          ...textResult(
            workspaceSnapshotFailureText(failure),
            createWorkspaceSnapshotFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }

      const options: WorkspaceSnapshotSummaryOptions = {
        includeTree: true,
        maxDepth: limitInt(args.max_depth, 3, 1, 8),
        maxEntries: limitInt(args.max_files, 500, 1, 3000),
        includeSkills: parseBool(args.include_skills, false),
        includeGlobalSkills: parseBool(args.include_global_skills, false)
      };

      let rawSummary: unknown;
      try {
        rawSummary = await workspaceSnapshotSummaryProvider({
          config,
          guard,
          workspace,
          options
        });
      } catch {
        const failure: WorkspaceSnapshotFailureInput = {
          code: "SNAPSHOT_SUMMARY_FAILED",
          details: {}
        };
        return {
          ...textResult(
            workspaceSnapshotFailureText(failure),
            createWorkspaceSnapshotFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }

      let summary: WorkspaceSnapshotSummaryProviderResult;
      let normalizedInventory: Array<{
        name: string;
        description: string | null;
        source: "workspace" | "user" | "plugin" | "other";
        path: string;
      }>;
      try {
        summary = workspaceSnapshotSummaryProviderResultSchema.parse(rawSummary);
        normalizedInventory = validateWorkspaceSnapshotSummary(
          summary,
          workspace,
          guard,
          options
        );
      } catch {
        const failure: WorkspaceSnapshotFailureInput = {
          code: "INTERNAL_ERROR",
          details: {}
        };
        return {
          ...textResult(
            workspaceSnapshotFailureText(failure),
            createWorkspaceSnapshotFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }

      let rawAi: unknown;
      try {
        rawAi = await workspaceSnapshotAiContextProvider({
          config,
          guard,
          workspace
        });
      } catch {
        const failure: WorkspaceSnapshotFailureInput = {
          code: "AI_CONTEXT_FAILED",
          details: {}
        };
        return {
          ...textResult(
            workspaceSnapshotFailureText(failure),
            createWorkspaceSnapshotFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }

      try {
        const ai = workspaceSnapshotAiProviderResultSchema.parse(rawAi);
        const aiContextFiles = validateWorkspaceSnapshotAiFiles(
          ai,
          config,
          guard,
          workspace
        );
        const data = workspaceSnapshotDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          agents_loaded: summary.agentsLoaded,
          agents_path: summary.agentsPath ?? null,
          skills: summary.skills,
          skill_inventory: normalizedInventory,
          skill_counts: summary.skillCounts,
          tree: summary.tree,
          git_status: summary.gitStatus,
          ai_context_files: aiContextFiles,
          bash_mode: config.bashMode,
          write_mode: config.writeMode,
          tool_mode: config.toolMode
        });
        const text = `${summary.text}\n\n## AI handoff context\n\n${ai.text}`;

        return textResult(
          text,
          createWorkspaceSnapshotSuccess(data, Date.now() - startedAt)
        );
      } catch {
        const failure: WorkspaceSnapshotFailureInput = {
          code: "INTERNAL_ERROR",
          details: {}
        };
        return {
          ...textResult(
            workspaceSnapshotFailureText(failure),
            createWorkspaceSnapshotFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "inspect_workspace",
    {
      title: "Inspect Workspace",
      description: "Build a bounded repository map with languages, project types, entrypoints, areas, symbols, relationships, and coverage warnings.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        path: z.string().optional().describe("Optional workspace-relative area to emphasize. Default: entire workspace."),
        max_files: z.number().int().min(1).max(100000).optional().describe("Maximum returned file records. Default: 300."),
        include_symbols: z.boolean().optional().describe("Include symbols in structured output. Default: true."),
        include_relationships: z.boolean().optional().describe("Include relationships in structured output. Default: true."),
        max_symbols: z.number().int().min(1).max(100000).optional().describe("Maximum returned symbols. Analysis remains bounded by server config."),
        max_relationships: z.number().int().min(1).max(250000).optional().describe("Maximum returned relationships. Analysis remains bounded by server config.")
      },
      outputSchema: inspectWorkspaceOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Inspecting workspace analysis...",
        "openai/toolInvocation/invoked": "Workspace analysis ready"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;
      let scopePath: string;

      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
        const requestedPath = typeof args.path === "string" && args.path.trim()
          ? args.path
          : ".";
        const resolved = guard.resolve(workspace, requestedPath);
        scopePath = resolved.relPath.replace(/^\.\/?$/, ".");
      } catch (error) {
        const failure = classifyInspectWorkspaceFailure(error, args);
        return {
          ...textResult(
            inspectWorkspaceFailureText(failure),
            createInspectWorkspaceFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }

      let rawAnalysis: unknown;
      try {
        rawAnalysis = await inspectWorkspaceProvider({ config, guard, workspace });
      } catch {
        const failure: InspectWorkspaceFailureInput = {
          code: "ANALYSIS_FAILED",
          details: {}
        };
        return {
          ...textResult(
            inspectWorkspaceFailureText(failure),
            createInspectWorkspaceFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }

      try {
        const analysis = validateInspectProviderResult(
          inspectWorkspaceProviderSchema.parse(rawAnalysis),
          workspace,
          guard
        );
        const inScope = (filePath: string) =>
          scopePath === "." ||
          filePath === scopePath ||
          filePath.startsWith(`${scopePath}/`);
        const areaInScope = (areaPath: string) =>
          scopePath === "." ||
          areaPath === "." ||
          inScope(areaPath) ||
          scopePath.startsWith(`${areaPath}/`);

        const fileLimit = config.toolCards
          ? 120
          : limitInt(args.max_files, 300, 1, config.analysisLimits.maxInventoryFiles);
        const symbolLimit = config.toolCards
          ? 80
          : limitInt(args.max_symbols, 500, 1, config.analysisLimits.maxSymbols);
        const relationshipLimit = config.toolCards
          ? 120
          : limitInt(args.max_relationships, 800, 1, config.analysisLimits.maxRelationships);

        const scopedFiles = analysis.files.filter((file) => inScope(file.path));
        const scopedSymbols = analysis.symbols.filter((symbol) => inScope(symbol.path));
        const scopedRelationships = analysis.relationships.filter(
          (relationship) => inScope(relationship.from) || inScope(relationship.to)
        );

        const files = scopedFiles.slice(0, fileLimit);
        const symbols = args.include_symbols === false
          ? []
          : scopedSymbols.slice(0, symbolLimit);
        const relationships = args.include_relationships === false
          ? []
          : scopedRelationships.slice(0, relationshipLimit);

        const outputLimited =
          files.length < scopedFiles.length ||
          (args.include_symbols !== false && symbols.length < scopedSymbols.length) ||
          (args.include_relationships !== false && relationships.length < scopedRelationships.length);
        const warnings = outputLimited
          ? [...analysis.warnings, INSPECT_WORKSPACE_OUTPUT_LIMIT_WARNING]
          : [...analysis.warnings];

        const data = inspectWorkspaceDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          path: scopePath,
          languages: analysis.languages,
          project_types: analysis.projectTypes,
          entrypoints: analysis.entrypoints.filter(inScope),
          important_files: analysis.importantFiles.filter(inScope),
          areas: analysis.areas.filter((area) => areaInScope(area.path)),
          files,
          symbols,
          relationships,
          coverage: analysis.coverage,
          warnings,
          output_limited: outputLimited,
          returned: {
            files: files.length,
            symbols: symbols.length,
            relationships: relationships.length
          },
          cache: analysis.cache
        });

        const text = [
          "# Workspace Analysis",
          "",
          `Workspace: ${workspace.root}`,
          `Scope: ${scopePath}`,
          `Projects: ${analysis.projectTypes.join(", ") || "unknown"}`,
          `Languages: ${analysis.languages.join(", ") || "unknown"}`,
          `Entrypoints: ${data.entrypoints.join(", ") || "none detected"}`,
          `Coverage: ${analysis.coverage.analyzedFiles}/${analysis.coverage.inventoryFiles} files analyzed, ${analysis.coverage.symbolCount} symbols, ${analysis.coverage.relationshipCount} relationships${analysis.coverage.truncated ? " (partial)" : ""}`,
          `Returned: ${files.length} files, ${symbols.length} symbols, ${relationships.length} relationships`,
          ...(warnings.length ? ["", "## Warnings", "", ...warnings.map((warning) => `- ${warning}`)] : [])
        ].join("\n");

        return textResult(
          text,
          createInspectWorkspaceSuccess(data, Date.now() - startedAt)
        );
      } catch {
        const failure: InspectWorkspaceFailureInput = {
          code: "INTERNAL_ERROR",
          details: {}
        };
        return {
          ...textResult(
            inspectWorkspaceFailureText(failure),
            createInspectWorkspaceFailure(failure, Date.now() - startedAt)
          ),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "tree",
    {
      title: "File Tree",
      description: "List files and directories inside the workspace, excluding blocked paths.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        path: z.string().optional().describe("Directory relative to workspace root. Default: ."),
        max_depth: z.number().int().min(1).max(12).optional().describe("Maximum depth. Default: 4."),
        include_hidden: z.boolean().optional().describe("Include dotfiles/dotfolders that are not blocked. Default: false."),
        max_entries: z.number().int().min(1).max(3000).optional().describe("Maximum entries. Default: 800.")
      },
      outputSchema: treeOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Listing workspace files...",
        "openai/toolInvocation/invoked": "Workspace files listed"
      }
    },
    async (args) => {
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const options: TreeOptions = {
          path: args.path ?? ".",
          maxDepth: limitInt(args.max_depth, 4, 1, 12),
          includeHidden: parseBool(args.include_hidden, false),
          maxEntries: limitInt(args.max_entries, 800, 1, 3000)
        };
        const result = await treeResultProvider({ config, guard, workspace, options });
        const data = treeDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          ...result
        });

        return textResult(result.text, createTreeSuccess(data));
      } catch (error) {
        const failure = classifyTreeFailure(error, args);
        const structured = createTreeFailure(failure);
        const text = [
          "# File Tree Error",
          "",
          `Code: ${failure.code}`,
          TREE_ERROR_MESSAGES[failure.code]
        ].join("\n");

        return {
          ...textResult(text, structured),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "search",
    {
      title: "Search Files",
      description: "Use this for targeted verification or code lookup. Prefer one specific final search instead of repeated broad verification searches.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        query: z.string().describe("Text or regex to search for."),
        regex: z.boolean().optional().describe("Treat query as a regular expression. Requires ripgrep. Default: false."),
        path: z.string().optional().describe("Directory or file relative to workspace root. Default: ."),
        glob: z.string().optional().describe("Optional glob, for example src/**/*.ts."),
        include_hidden: z.boolean().optional().describe("Include hidden files that are not blocked. Default: false."),
        max_results: z.number().int().min(1).max(2000).optional().describe("Maximum results. Default from config."),
        intent: z.enum(["auto", "text", "symbol", "references", "impact"]).optional().describe("Optional structured search intent. Omit for legacy lexical behavior."),
        symbol: z.string().optional().describe("Optional symbol query. Uses repository analysis and overrides query text."),
        include_tests: z.boolean().optional().describe("Include related tests in structured results. Default: false.")
      },
      outputSchema: searchOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Searching workspace...",
        "openai/toolInvocation/invoked": "Workspace search complete"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const options: Partial<SearchOptions> = {
          query: args.query,
          regex: parseBool(args.regex, false),
          root: args.path ?? ".",
          glob: args.glob,
          includeHidden: parseBool(args.include_hidden, false),
          maxResults: limitInt(args.max_results, config.maxSearchResults, 1, config.maxSearchResults),
          intent: args.intent,
          symbol: args.symbol,
          includeTests: args.include_tests === undefined ? undefined : parseBool(args.include_tests, false)
        };
        const rawResult: unknown = await searchResultProvider({ config, guard, workspace, options });
        if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) {
          throw new CodexProError("Invalid search provider result.");
        }
        const result = rawResult as Partial<SearchResult>;
        if (typeof result.text !== "string") throw new CodexProError("Invalid search provider text.");
        const matches = z.array(searchMatchSchema).parse(result.matches);
        const truncated = z.boolean().parse(result.truncated);
        const used = z.enum(["ripgrep", "node"]).parse(result.used);
        const normalizedAnalysis = normalizeSearchAnalysis(config, args, result.analysis);
        const analysis = normalizedAnalysis.analysis && config.toolCards
          ? searchAnalysisSchema.parse({
              ...normalizedAnalysis.analysis,
              groups: Object.fromEntries(
                Object.entries(normalizedAnalysis.analysis.groups)
                  .map(([name, groupMatches]) => [name, groupMatches.slice(0, 24)])
              ),
              matches: normalizedAnalysis.analysis.matches.slice(0, 80)
            })
          : normalizedAnalysis.analysis;
        const data = searchDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          matches,
          truncated,
          used,
          analysis
        });

        return textResult(
          result.text,
          createSearchSuccess(data, Date.now() - startedAt, normalizedAnalysis.warnings)
        );
      } catch (error) {
        const failure = classifySearchFailure(error, args);
        const structured = createSearchFailure(failure, Date.now() - startedAt);
        const text = [
          "# Search Files Error",
          "",
          `Code: ${failure.code}`,
          SEARCH_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(text, structured),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "read",
    {
      title: "Read File",
      description: "Read a specific text file with line numbers. Avoid rereading files after write/edit/apply_patch unless exact final content is needed.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        path: z.string().describe("File path relative to workspace root."),
        start_line: z.number().int().min(1).optional().describe("First line to read. Default: 1."),
        end_line: z.number().int().min(1).optional().describe("Last line to read. Default: end of file."),
        max_bytes: z.number().int().min(1000).max(2000000).optional().describe("Maximum file bytes. Capped by server config.")
      },
      outputSchema: readOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Reading file...",
        "openai/toolInvocation/invoked": "File read"
      }
    },
    async (args) => {
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const filePath = String(args.path ?? "");
        const options = {
          startLine: args.start_line,
          endLine: args.end_line,
          maxBytes: args.max_bytes
        };
        const result = await readResultProvider({
          config,
          guard,
          workspace,
          path: filePath,
          options
        });
        const data = readDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          ...result
        });
        const text = `# Read File\n\nPath: ${result.path}\nLines: ${result.startLine}-${result.endLine} of ${result.totalLines}\nBytes: ${result.bytes}\nSHA-256: ${result.sha256}\n\n\`\`\`text\n${result.text}\n\`\`\``;

        return textResult(text, createReadSuccess(data));
      } catch (error) {
        const failure = classifyReadFailure(error, args, config);
        const structured = createReadFailure(failure);
        const text = [
          "# Read File Error",
          "",
          `Code: ${failure.code}`,
          READ_ERROR_MESSAGES[failure.code]
        ].join("\n");

        return {
          ...textResult(text, structured),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "write",
    {
      title: "Write File",
      description: "Create or overwrite a meaningful text file inside the workspace. Returns a unified diff; do not create empty placeholder files.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        path: z.string().describe("File path relative to workspace root."),
        content: z.string().describe("Complete file contents to write."),
        create_dirs: z.boolean().optional().describe("Create parent directories if missing. Default: true."),
        overwrite: z.boolean().optional().describe("Allow overwriting existing files. Default: true."),
        ...(config.toolContractVersion === 2
          ? {
              expected_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
                .describe("Optional exact current-file SHA-256 precondition.")
            }
          : {})
      },
      outputSchema: config.toolContractVersion === 2 ? writeOutputShapeV2 : writeOutputShape,
      annotations: LOCAL_WRITE_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Writing file...",
        "openai/toolInvocation/invoked": "File written"
      }
    },
    async (args) => {
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const requestedPath = String(args.path ?? "");
        const content = String(args.content ?? "");
        const resolved = guard.resolve(workspace, requestedPath, { forWrite: true });
        assertWriteToolAllowed(config, resolved.relPath);
        const prepared = config.fileTransactions === "atomic"
          ? await prepareWriteTextFile(config, guard, workspace, requestedPath, content, {
              createDirs: args.create_dirs !== false,
              overwrite: args.overwrite !== false,
              expectedSha256: args.expected_sha256
            })
          : null;
        const result = writeProviderResultSchema.parse(
          prepared?.result ?? await writeResultProvider({
            config,
            guard,
            workspace,
            path: requestedPath,
            content,
            options: {
              createDirs: args.create_dirs !== false,
              overwrite: args.overwrite !== false
            }
          })
        );
        if (result.path !== resolved.relPath) {
          throw new CodexProError("Write provider returned a path that does not match the resolved target.");
        }
        const data = writeDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          path: result.path,
          existed: result.existed,
          bytes: result.bytes,
          sha256: result.sha256,
          additions: result.diff.additions,
          deletions: result.diff.deletions,
          diff: result.diff.diff
        });
        if (result.diff.changed) invalidateWorkspaceAnalysis(workspace.id);
        const text = `# Write File\n\nPath: ${result.path}\nExisted before: ${result.existed}\nBytes: ${result.bytes}\nSHA-256: ${result.sha256}\nDiff stats: +${result.diff.additions} -${result.diff.deletions}${diffBlock(result.diff.diff)}`;
        const response = textResult(text, createWriteSuccess(data));
        if (!prepared) return response;
        const runtime = dependencies.workspaceMutationRuntime;
        if (!runtime) {
          throw new TransactionError(
            "ATOMIC_BACKEND_UNAVAILABLE",
            "Atomic write runtime is unavailable."
          );
        }
        return attachPreparedFileMutation({
          runtime,
          workspace,
          prepared,
          context: {
            toolName: "write",
            requestId: null,
            ownerBinding: changeSetOwnerBinding(dependencies.policySessionContextSource, dependencies.changeSetOwnerBindingKey),
            policyRevision: mutationPolicyRevision(effectivePolicyRuntime),
            contractVersion: config.toolContractVersion,
            retentionMs: config.changeSetRetention.activeRetentionMs
          },
          result: response,
          project: config.toolContractVersion === 2
            ? ({ result: committedResult, transaction, beforeSha256 }) => ({
                ...committedResult,
                structuredContent: createWriteSuccessV2({
                  ...data,
                  transaction,
                  before_sha256: beforeSha256
                }, resultDurationMs(committedResult))
              })
            : undefined,
          projectFailure: ({ result: failedResult, error }) => {
            const durationMs = resultDurationMs(failedResult);
            if (config.toolContractVersion === 2) {
              const code = publicMutationFailureCode(error) ?? "TRANSACTION_FAILED";
              const structured = createWriteTransactionFailureV2({
                code,
                details: code === "FILE_VERSION_CONFLICT" ? { path: data.path } : {}
              }, durationMs);
              return {
                ...failedResult,
                ...textResult(
                  `# Write File Error\n\nCode: ${code}\n${WRITE_TRANSACTION_ERROR_MESSAGES[code]}`,
                  structured
                ),
                isError: true
              };
            }
            return {
              ...failedResult,
              ...textResult(
                `# Write File Error\n\nCode: WRITE_FAILED\n${WRITE_ERROR_MESSAGES.WRITE_FAILED}`,
                createWriteFailure({ code: "WRITE_FAILED", details: {} }, durationMs)
              ),
              isError: true
            };
          }
        });
      } catch (error) {
        if (config.toolContractVersion === 2) {
          const code = publicMutationFailureCode(error);
          if (code) {
            const requestedPath = publicMutationFailurePath(error, args.path ?? "[path omitted]");
            const structured = createWriteTransactionFailureV2({
              code,
              details: code === "FILE_VERSION_CONFLICT" ? { path: requestedPath } : {}
            });
            return {
              ...textResult(
                `# Write File Error\n\nCode: ${code}\n${WRITE_TRANSACTION_ERROR_MESSAGES[code]}`,
                structured
              ),
              isError: true
            };
          }
        }
        const failure = classifyWriteFailure(error, args, config);
        const structured = createWriteFailure(failure);
        const text = [
          "# Write File Error",
          "",
          `Code: ${failure.code}`,
          WRITE_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(text, structured),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "edit",
    {
      title: "Edit File",
      description: "Apply a targeted exact text replacement inside a workspace text file. Returns a unified diff.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        path: z.string().describe("File path relative to workspace root."),
        old_text: z.string().describe("Exact text to replace. Must match once unless replace_all=true."),
        new_text: z.string().describe("Replacement text."),
        replace_all: z.boolean().optional().describe("Replace all occurrences. Default: false."),
        expected_replacements: z.number().int().min(1).optional().describe("Fail if actual replacement count differs."),
        ...(config.toolContractVersion === 2
          ? {
              expected_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
                .describe("Optional exact current-file SHA-256 precondition.")
            }
          : {})
      },
      outputSchema: config.toolContractVersion === 2 ? editOutputShapeV2 : editOutputShape,
      annotations: LOCAL_WRITE_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Editing file...",
        "openai/toolInvocation/invoked": "File edited"
      }
    },
    async (args) => {
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const requestedPath = String(args.path ?? "");
        const oldText = String(args.old_text ?? "");
        const newText = String(args.new_text ?? "");
        const resolved = guard.resolve(workspace, requestedPath, { forWrite: true });
        assertWriteToolAllowed(config, resolved.relPath);
        const prepared = config.fileTransactions === "atomic"
          ? await prepareEditTextFile(config, guard, workspace, requestedPath, oldText, newText, {
              replaceAll: parseBool(args.replace_all, false),
              expectedReplacements: args.expected_replacements,
              expectedSha256: args.expected_sha256
            })
          : null;
        const result = editProviderResultSchema.parse(
          prepared?.result ?? await editResultProvider({
            config,
            guard,
            workspace,
            path: requestedPath,
            oldText,
            newText,
            options: {
              replaceAll: parseBool(args.replace_all, false),
              expectedReplacements: args.expected_replacements
            }
          })
        );
        if (result.path !== resolved.relPath) {
          throw new CodexProError("Edit provider returned a path that does not match the resolved target.");
        }
        const data = editDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          path: result.path,
          replacements: result.replacements,
          bytes: result.bytes,
          sha256: result.sha256,
          additions: result.diff.additions,
          deletions: result.diff.deletions,
          diff: result.diff.diff
        });
        if (result.diff.changed) invalidateWorkspaceAnalysis(workspace.id);
        const text = `# Edit File\n\nPath: ${result.path}\nReplacements: ${result.replacements}\nBytes: ${result.bytes}\nSHA-256: ${result.sha256}\nDiff stats: +${result.diff.additions} -${result.diff.deletions}${diffBlock(result.diff.diff)}`;
        const response = textResult(text, createEditSuccess(data));
        if (!prepared) return response;
        const runtime = dependencies.workspaceMutationRuntime;
        if (!runtime) {
          throw new TransactionError(
            "ATOMIC_BACKEND_UNAVAILABLE",
            "Atomic edit runtime is unavailable."
          );
        }
        return attachPreparedFileMutation({
          runtime,
          workspace,
          prepared,
          context: {
            toolName: "edit",
            requestId: null,
            ownerBinding: changeSetOwnerBinding(dependencies.policySessionContextSource, dependencies.changeSetOwnerBindingKey),
            policyRevision: mutationPolicyRevision(effectivePolicyRuntime),
            contractVersion: config.toolContractVersion,
            retentionMs: config.changeSetRetention.activeRetentionMs
          },
          result: response,
          project: config.toolContractVersion === 2
            ? ({ result: committedResult, transaction, beforeSha256 }) => ({
                ...committedResult,
                structuredContent: createEditSuccessV2({
                  ...data,
                  transaction,
                  before_sha256: beforeSha256 ?? data.sha256
                }, resultDurationMs(committedResult))
              })
            : undefined,
          projectFailure: ({ result: failedResult, error }) => {
            const durationMs = resultDurationMs(failedResult);
            if (config.toolContractVersion === 2) {
              const code = (publicMutationFailureCode(error) ?? "TRANSACTION_FAILED") as EditTransactionErrorCode;
              const structured = createEditTransactionFailureV2({
                code,
                details: code === "FILE_VERSION_CONFLICT" ? { path: data.path } : {}
              }, durationMs);
              return {
                ...failedResult,
                ...textResult(
                  `# Edit File Error\n\nCode: ${code}\n${EDIT_TRANSACTION_ERROR_MESSAGES[code]}`,
                  structured
                ),
                isError: true
              };
            }
            return {
              ...failedResult,
              ...textResult(
                `# Edit File Error\n\nCode: EDIT_FAILED\n${EDIT_ERROR_MESSAGES.EDIT_FAILED}`,
                createEditFailure({ code: "EDIT_FAILED", details: {} }, durationMs)
              ),
              isError: true
            };
          }
        });
      } catch (error) {
        if (config.toolContractVersion === 2) {
          const code = publicMutationFailureCode(error) as EditTransactionErrorCode | null;
          if (code) {
            const requestedPath = publicMutationFailurePath(error, args.path ?? "[path omitted]");
            const structured = createEditTransactionFailureV2({
              code,
              details: code === "FILE_VERSION_CONFLICT" ? { path: requestedPath } : {}
            });
            return {
              ...textResult(
                `# Edit File Error\n\nCode: ${code}\n${EDIT_TRANSACTION_ERROR_MESSAGES[code]}`,
                structured
              ),
              isError: true
            };
          }
        }
        const failure = classifyEditFailure(error, args, config);
        const structured = createEditFailure(failure);
        const text = [
          "# Edit File Error",
          "",
          `Code: ${failure.code}`,
          EDIT_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(text, structured),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "apply_patch",
    {
      title: "Apply Patch",
      description:
        "Apply one unified diff patch inside the workspace. Paths are validated before applying. Prefer edit for tiny replacements and apply_patch for multi-file diffs.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        patch: z.string().describe("Unified diff patch to apply. File paths must stay inside the workspace and avoid blocked paths."),
        ...(config.toolContractVersion === 2
          ? {
              expected_files: z.record(
                z.string().min(1).max(240),
                z.string().regex(/^[a-f0-9]{64}$/).nullable()
              ).refine((value) => Object.keys(value).length <= 1_000, "expected_files exceeds the file limit.")
                .optional()
                .describe("Optional touched-file SHA-256 or null-absence preconditions.")
            }
          : {})
      },
      outputSchema: config.toolContractVersion === 2 ? applyPatchOutputShapeV2 : applyPatchOutputShape,
      annotations: LOCAL_WRITE_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Applying patch...",
        "openai/toolInvocation/invoked": "Patch applied"
      }
    },
    async (args) => {
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const patch = String(args.patch ?? "");
        const touchedPaths = validateApplyPatchInput(config, patch);
        const expectedPaths = [...new Set(touchedPaths.map((touchedPath) => {
          try {
            const resolved = guard.resolve(workspace, touchedPath, { forWrite: true });
            assertWriteToolAllowed(config, resolved.relPath);
            return resolved.relPath;
          } catch (error) {
            throw new ApplyPatchTargetError(touchedPath, error);
          }
        }))];

        const prepared = config.fileTransactions === "atomic"
          ? await prepareWorkspacePatch(config, guard, workspace, patch, {
              expectedFiles: args.expected_files
            })
          : null;

        const result = applyPatchProviderResultSchema.parse(
          prepared?.result ?? await applyPatchResultProvider({ config, guard, workspace, patch })
        );

        let normalizedReturnedPaths: string[];
        try {
          normalizedReturnedPaths = result.paths.map((returnedPath) => {
            const resolved = guard.resolve(workspace, returnedPath, { forWrite: true });
            assertWriteToolAllowed(config, resolved.relPath);
            if (returnedPath !== resolved.relPath) {
              throw new CodexProError("Apply patch provider returned a non-normalized path.");
            }
            return resolved.relPath;
          });
        } catch {
          throw new CodexProError("Apply patch provider returned an unsafe or non-normalized path.");
        }

        const expectedSet = new Set(expectedPaths);
        const returnedSet = new Set(normalizedReturnedPaths);
        if (
          expectedSet.size !== returnedSet.size ||
          Array.from(expectedSet).some((value) => !returnedSet.has(value))
        ) {
          throw new CodexProError("Apply patch provider returned a mismatched path set.");
        }

        const data = applyPatchDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          paths: normalizedReturnedPaths,
          stdout: result.stdout,
          stderr: result.stderr,
          additions: result.additions,
          deletions: result.deletions,
          changed: result.changed,
          diff: result.diff
        });

        const text = [
          "# Apply Patch",
          "",
          `Paths: ${normalizedReturnedPaths.join(", ")}`,
          `Diff stats: +${result.additions} -${result.deletions}`,
          result.stderr ? `stderr: ${result.stderr}` : "",
          diffBlock(result.diff)
        ].filter(Boolean).join("\n");
        const response = textResult(text, createApplyPatchSuccess(data));
        if (!prepared) {
          invalidateWorkspaceAnalysis(workspace.id);
          return response;
        }
        const runtime = dependencies.workspaceMutationRuntime;
        if (!runtime) {
          throw new TransactionError(
            "ATOMIC_BACKEND_UNAVAILABLE",
            "Atomic apply_patch runtime is unavailable."
          );
        }
        return attachPreparedPatchMutation({
          runtime,
          workspace,
          prepared,
          context: {
            toolName: "apply_patch",
            requestId: null,
            ownerBinding: changeSetOwnerBinding(dependencies.policySessionContextSource, dependencies.changeSetOwnerBindingKey),
            policyRevision: mutationPolicyRevision(effectivePolicyRuntime),
            contractVersion: config.toolContractVersion,
            retentionMs: config.changeSetRetention.activeRetentionMs
          },
          result: response,
          project: ({ result: committedResult, transaction, files }) => {
            invalidateWorkspaceAnalysis(workspace.id);
            if (config.toolContractVersion === 1) return committedResult;
            return {
              ...committedResult,
              structuredContent: createApplyPatchSuccessV2({
                ...data,
                transaction,
                files
              }, resultDurationMs(committedResult))
            };
          },
          projectFailure: ({ result: failedResult, error }) => {
            const durationMs = resultDurationMs(failedResult);
            if (config.toolContractVersion === 2) {
              const code = publicMutationFailureCode(error) ?? "TRANSACTION_FAILED";
              const conflictPath = publicMutationFailurePath(error, expectedPaths[0] ?? "[path omitted]");
              const structured = createApplyPatchTransactionFailureV2({
                code,
                details: code === "FILE_VERSION_CONFLICT" ? { path: conflictPath } : {}
              }, durationMs);
              return {
                ...failedResult,
                ...textResult(
                  `# Apply Patch Error\n\nCode: ${code}\n${APPLY_PATCH_TRANSACTION_ERROR_MESSAGES[code]}`,
                  structured
                ),
                isError: true
              };
            }
            return {
              ...failedResult,
              ...textResult(
                `# Apply Patch Error\n\nCode: PATCH_APPLY_FAILED\n${APPLY_PATCH_ERROR_MESSAGES.PATCH_APPLY_FAILED}`,
                createApplyPatchFailure({ code: "PATCH_APPLY_FAILED", details: {} }, durationMs)
              ),
              isError: true
            };
          }
        });
      } catch (error) {
        if (config.toolContractVersion === 2) {
          const code = publicMutationFailureCode(error);
          if (code) {
            const conflictPath = publicMutationFailurePath(error, "[path omitted]");
            const structured = createApplyPatchTransactionFailureV2({
              code,
              details: code === "FILE_VERSION_CONFLICT" ? { path: conflictPath } : {}
            });
            return {
              ...textResult(
                `# Apply Patch Error\n\nCode: ${code}\n${APPLY_PATCH_TRANSACTION_ERROR_MESSAGES[code]}`,
                structured
              ),
              isError: true
            };
          }
        }
        const failure = classifyApplyPatchFailure(error, args, config);
        const structured = createApplyPatchFailure(failure);
        const text = [
          "# Apply Patch Error",
          "",
          `Code: ${failure.code}`,
          APPLY_PATCH_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(text, structured),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "bash",
    {
      title: "Bash",
      description:
        "Run one allowlisted verification command in the workspace, such as tests, build, lint, typecheck, or a project script. Do not use for git status/diff or file inspection; use show_changes, tree, search, and read instead. Do not chain commands with &&, pipes, redirects, or shell file readers.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        command: z.string().describe("Command to run."),
        session_id: z.string().optional().describe(config.requireBashSession && config.bashSessionId ? `Required bash session id for this server: ${config.bashSessionId}.` : "Optional bash session id. If configured on the server, a provided value must match it."),
        cwd: z.string().optional().describe("Working directory relative to workspace root. Default: ."),
        timeout_ms: z.number().int().min(1000).max(180000).optional().describe("Timeout in milliseconds. Default: 30000.")
      },
      outputSchema: bashOutputShape,
      annotations: BASH_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Running bash command...",
        "openai/toolInvocation/invoked": "Bash command finished"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const command = String(args.command ?? "");
        const requestedCwd = typeof args.cwd === "string" ? args.cwd : undefined;
        const providerResult = bashProviderResultSchema.parse(
          await bashResultProvider({
            config,
            guard,
            workspace,
            command,
            options: {
              cwd: requestedCwd,
              timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : undefined,
              sessionId: typeof args.session_id === "string" ? args.session_id : undefined
            }
          })
        );
        const resolvedCwd = guard.resolve(workspace, requestedCwd ?? ".");
        const expectedCwd = path.relative(workspace.root, resolvedCwd.absPath) || ".";

        if (providerResult.command !== command) {
          throw new CodexProError("Bash provider returned a mismatched command.");
        }
        if (providerResult.cwd !== expectedCwd) {
          throw new CodexProError("Bash provider returned a mismatched working directory.");
        }
        if (config.bashSessionId) {
          if (providerResult.bashSessionId !== config.bashSessionId) {
            throw new CodexProError("Bash provider returned a mismatched session id.");
          }
        } else if (providerResult.bashSessionId !== undefined) {
          throw new CodexProError("Bash provider returned an unexpected session id.");
        }

        const data = bashDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          command: providerResult.command,
          cwd: providerResult.cwd,
          exitCode: providerResult.exitCode,
          signal: providerResult.signal,
          durationMs: providerResult.durationMs,
          stdout: providerResult.stdout,
          stderr: providerResult.stderr,
          truncated: providerResult.truncated,
          bash_session_id: providerResult.bashSessionId ?? null
        });

        return textResult(
          bashTextResult(config, providerResult),
          createBashSuccess(data, Date.now() - startedAt)
        );
      } catch (error) {
        const failure = classifyBashFailure(error, args, config);
        const text = [
          "# Bash Error",
          "",
          `Code: ${failure.code}`,
          BASH_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(text, createBashFailure(failure, Date.now() - startedAt)),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "git_status",
    {
      title: "Git Status",
      description: "Show git branch and changed files for the workspace.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        path: z.string().optional().describe("Optional file path relative to workspace root.")
      },
      outputSchema: gitStatusOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Reading git status...",
        "openai/toolInvocation/invoked": "Git status ready"
      }
    },
    async (args) => {
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const scopedPath = typeof args.path === "string" ? args.path : undefined;
        const status = await gitStatusResultProvider({
          config,
          guard,
          workspace,
          path: scopedPath
        });

        if (typeof status !== "string") {
          throw new CodexProError("git_status provider returned a non-string result.");
        }

        const outputFailure = classifyGitStatusOutputFailure(status);
        if (outputFailure) {
          const structured = createGitStatusFailure(outputFailure);
          const text = [
            "# Git Status Error",
            "",
            `Code: ${outputFailure.code}`,
            GIT_STATUS_ERROR_MESSAGES[outputFailure.code]
          ].join("\n");

          return {
            ...textResult(text, structured),
            isError: true
          };
        }

        const changedFiles = changedStatusLines(status);
        const data = gitStatusDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          path: args.path ?? "workspace status",
          status,
          changed_files: changedFiles,
          changed: changedFiles.length > 0
        });

        return textResult(status, createGitStatusSuccess(data));
      } catch (error) {
        const failure = classifyGitStatusThrownFailure(error, args);
        const structured = createGitStatusFailure(failure);
        const text = [
          "# Git Status Error",
          "",
          `Code: ${failure.code}`,
          GIT_STATUS_ERROR_MESSAGES[failure.code]
        ].join("\n");

        return {
          ...textResult(text, structured),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "git_diff",
    {
      title: "Git Diff",
      description: "Show current unstaged or staged git diff, optionally scoped to a file.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        path: z.string().optional().describe("Optional file path relative to workspace root."),
        staged: z.boolean().optional().describe("Show staged diff. Default: false."),
        include_diff: z.boolean().optional().describe("Include the raw unified diff in the response. Default: true. Set false for stats-only checks.")
      },
      outputSchema: gitDiffOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Reading git diff...",
        "openai/toolInvocation/invoked": "Git diff ready"
      }
    },
    async (args) => {
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const staged = parseBool(args.staged, false);
        const includeDiff = parseBool(args.include_diff, true);
        const providerResult = await gitDiffResultProvider({
          config,
          guard,
          workspace,
          path: typeof args.path === "string" ? args.path : undefined,
          staged
        });

        if (typeof providerResult !== "string") {
          throw new CodexProError("git_diff provider returned a non-string result.");
        }

        const rawDiff = normalizeGitOutput(providerResult);
        const outputFailure = classifyGitDiffOutputFailure(rawDiff);
        if (outputFailure) {
          const structured = createGitDiffFailure(outputFailure);
          const text = [
            "# Git Diff Error",
            "",
            `Code: ${outputFailure.code}`,
            GIT_DIFF_ERROR_MESSAGES[outputFailure.code]
          ].join("\n");

          return {
            ...textResult(text, structured),
            isError: true
          };
        }

        const stats = diffStats(rawDiff);
        const data = gitDiffDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          path: args.path ?? "workspace diff",
          staged,
          include_diff: includeDiff,
          additions: stats.additions,
          deletions: stats.deletions,
          changed: stats.changed,
          diff: includeDiff ? rawDiff : ""
        });
        const text = includeDiff
          ? rawDiff
          : [
              "# Git Diff",
              "",
              `Workspace: ${workspace.root}`,
              `Path: ${args.path ?? "workspace diff"}`,
              `Staged: ${staged}`,
              `Diff stats: +${stats.additions} -${stats.deletions}`,
              "",
              "Raw diff omitted by include_diff=false."
            ].join("\n");

        return textResult(text, createGitDiffSuccess(data));
      } catch (error) {
        const failure = classifyGitDiffThrownFailure(error, args);
        const structured = createGitDiffFailure(failure);
        const text = [
          "# Git Diff Error",
          "",
          `Code: ${failure.code}`,
          GIT_DIFF_ERROR_MESSAGES[failure.code]
        ].join("\n");

        return {
          ...textResult(text, structured),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "show_changes",
    {
      title: "Show Changes",
      description: "Summarize the current workspace changes in one review-oriented result with git status, diff stats, and optional diff. Use this instead of bash git status, bash git diff, git_status, or git_diff when reviewing work.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        path: z.string().optional().describe("Optional file path relative to workspace root."),
        staged: z.boolean().optional().describe("Show staged diff. Default: false."),
        include_diff: z.boolean().optional().describe("Include the unified diff. Default: true."),
        since: z.enum(["last_shown", "workspace"]).optional().describe("Use last_shown to suppress unchanged repeated reviews. Default: last_shown."),
        mark_reviewed: z.boolean().optional().describe("Update the last-shown review checkpoint after this call. Default: true.")
      },
      outputSchema: showChangesOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "openai/toolInvocation/invoking": "Summarizing workspace changes...",
        "openai/toolInvocation/invoked": "Workspace changes summarized"
      }
    },
    async (args) => {
      try {
        const workspace = workspaces.resolveWorkspace(args.workspace_id);
        const scopedPath = typeof args.path === "string" ? args.path : undefined;
        const staged = parseBool(args.staged, false);
        const includeDiff = parseBool(args.include_diff, true);
        const since = args.since === "workspace" ? "workspace" : "last_shown";
        const markReviewed = parseBool(args.mark_reviewed, true);
        const normalizedScopedPath = scopedPath?.trim()
          ? guard.resolve(workspace, scopedPath).relPath
          : undefined;
        const providerContext: ShowChangesGitProviderContext = {
          config,
          guard,
          workspace,
          path: normalizedScopedPath,
          staged
        };

        const statusProviderResult = await showChangesStatusProvider(providerContext);
        if (typeof statusProviderResult !== "string") {
          throw new CodexProError("show_changes status provider returned a non-string result.");
        }
        const status = normalizeGitOutput(statusProviderResult);
        const statusFailure = classifyShowChangesStatusOutputFailure(status);
        if (statusFailure) {
          const text = [
            "# Show Changes Error",
            "",
            `Code: ${statusFailure.code}`,
            SHOW_CHANGES_ERROR_MESSAGES[statusFailure.code]
          ].join("\n");
          return {
            ...textResult(text, createShowChangesFailure(statusFailure)),
            isError: true
          };
        }

        const diffProviderResult = await showChangesDiffProvider(providerContext);
        if (typeof diffProviderResult !== "string") {
          throw new CodexProError("show_changes diff provider returned a non-string result.");
        }
        const diff = normalizeGitOutput(diffProviderResult);
        const diffFailure = classifyShowChangesDiffOutputFailure(diff);
        if (diffFailure) {
          const text = [
            "# Show Changes Error",
            "",
            `Code: ${diffFailure.code}`,
            SHOW_CHANGES_ERROR_MESSAGES[diffFailure.code]
          ].join("\n");
          return {
            ...textResult(text, createShowChangesFailure(diffFailure)),
            isError: true
          };
        }

        const stats = diffStats(diff);
        const changedFiles = changedStatusLines(status);
        const untrackedFingerprint = await untrackedReviewFingerprint(
          config,
          guard,
          workspace,
          changedFiles
        );
        const checkpointKey = reviewCheckpointKey(workspace, {
          path: normalizedScopedPath,
          staged
        });
        const fingerprint = reviewFingerprint(status, `${diff}\0${untrackedFingerprint}`);
        const checkpointHit = includeDiff &&
          since === "last_shown" &&
          reviewCheckpoints.get(checkpointKey) === fingerprint;
        const checkpointWritten = markReviewed && includeDiff;
        if (checkpointWritten) reviewCheckpoints.set(checkpointKey, fingerprint);

        const responseDiff = checkpointHit ? "" : includeDiff ? diff : "";
        const responseStats = checkpointHit
          ? { additions: 0, deletions: 0, changed: false }
          : stats;
        const responseChangedFiles = checkpointHit ? [] : changedFiles;
        const responseChanged = !checkpointHit &&
          (changedFiles.length > 0 || responseStats.changed);
        const changedPaths = changedPathsFromStatus(changedFiles);
        let analysis: ShowChangesAnalysis | null = null;
        let warnings: Array<typeof SHOW_CHANGES_ANALYSIS_WARNING> = [];

        if (config.analysisEnabled && changedPaths.length && !checkpointHit) {
          try {
            const impact = await showChangesAnalysisProvider({
              config,
              guard,
              workspace,
              changedPaths
            });
            analysis = showChangesAnalysisSchema.parse({
              schema_version: impact.schemaVersion,
              changed_paths: impact.changedPaths,
              affected_areas: impact.affectedAreas,
              dependent_files: impact.dependentFiles,
              related_tests: impact.relatedTests,
              risk_signals: impact.riskSignals,
              recommended_commands: impact.recommendedCommands,
              coverage: impact.coverage,
              warnings: impact.warnings,
              cache: impact.cache
            });
          } catch {
            analysis = null;
            warnings = [SHOW_CHANGES_ANALYSIS_WARNING];
          }
        }

        const changedText = checkpointHit
          ? "- No changes since last shown review."
          : changedFiles.length
            ? changedFiles.map((line) => `- ${line}`).join("\n")
            : "- No changed files.";
        const diffText = checkpointHit
          ? "\n\nNo new diff since last shown review."
          : includeDiff
            ? diff
              ? diffBlock(diff)
              : "\n\nNo diff output."
            : "\n\nDiff omitted by request.";
        const analysisText = analysis
          ? `\n\n## Analysis\n\nAffected areas: ${analysis.affected_areas.join(", ") || "none"}\nRisks: ${analysis.risk_signals.map((risk) => risk.label).filter(Boolean).join(", ") || "none"}\nRelated tests: ${analysis.related_tests.map((file) => file.path).filter(Boolean).join(", ") || "none"}`
          : "";
        const text = `# Show Changes\n\nWorkspace: ${workspace.root}\n\n## Changed\n\n${changedText}\n\n## Diff stats\n\n+${responseStats.additions} -${responseStats.deletions}${diffText}${analysisText}`;
        const data = showChangesDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          path: args.path ?? "workspace changes",
          status,
          changed_files: responseChangedFiles,
          staged,
          include_diff: includeDiff,
          additions: responseStats.additions,
          deletions: responseStats.deletions,
          changed: responseChanged,
          diff: responseDiff,
          review_since: since,
          review_marked: checkpointWritten,
          review_checkpoint_hit: checkpointHit,
          analysis
        });

        return textResult(
          text,
          createShowChangesSuccess(data, 0, warnings)
        );
      } catch (error) {
        const failure = classifyShowChangesThrownFailure(error, args);
        const text = [
          "# Show Changes Error",
          "",
          `Code: ${failure.code}`,
          SHOW_CHANGES_ERROR_MESSAGES[failure.code]
        ].join("\n");
        return {
          ...textResult(text, createShowChangesFailure(failure)),
          isError: true
        };
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "read_handoff",
    {
      title: "Read Handoff",
      description: "Read the shared .ai-bridge planning files used for ChatGPT-to-agent coordination.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace.")
      },
      outputSchema: readHandoffOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "codexpro/preserveStructuredContent": true,
        "openai/toolInvocation/invoking": "Reading agent handoff context...",
        "openai/toolInvocation/invoked": "Agent handoff context ready"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;
      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch {
        const failure: ReadHandoffFailureInput = args.workspace_id
          ? {
              code: "WORKSPACE_NOT_FOUND",
              details: {
                source: "workspace_id",
                workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
              }
            }
          : {
              code: "WORKSPACE_NOT_FOUND",
              details: { source: "default_workspace", workspace_id: null }
            };
        return readHandoffFailureResult(failure, startedAt);
      }

      const limits = readHandoffLimits(config);
      let rawContext: unknown;
      try {
        rawContext = await readHandoffProvider({ config, guard, workspace, limits });
      } catch {
        return readHandoffFailureResult({
          code: "HANDOFF_READ_FAILED",
          details: { context_dir: config.contextDir }
        }, startedAt);
      }

      try {
        const context = readHandoffProviderResultSchema.parse(rawContext);
        if (context.contextDir !== config.contextDir) {
          throw new CodexProError("Handoff provider returned a mismatched context directory.");
        }
        const artifacts = context.artifacts.map((artifact) => {
          const safeText = redactSensitiveText(artifact.text);
          return {
            path: artifact.path,
            kind: artifact.kind,
            bytes: artifact.bytes,
            line_count: artifact.lineCount,
            returned_bytes: Buffer.byteLength(safeText, "utf8"),
            redacted: safeText !== artifact.text,
            text: safeText
          };
        });
        const loadedBytes = artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
        const returnedBytes = artifacts.reduce((sum, artifact) => sum + artifact.returned_bytes, 0);
        const data = readHandoffDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          context_dir: context.contextDir,
          context_exists: context.contextExists,
          max_file_bytes: limits.maxFileBytes,
          max_total_bytes: limits.maxTotalBytes,
          artifacts,
          files: artifacts.map((artifact) => artifact.path),
          file_count: artifacts.length,
          unavailable: context.unavailable,
          unavailable_count: context.unavailable.length,
          loaded_bytes: loadedBytes,
          returned_bytes: returnedBytes,
          output_limited: context.unavailable.some((item) =>
            item.reason === "too_large" || item.reason === "output_limit"
          ),
          redacted: artifacts.some((artifact) => artifact.redacted)
        });
        return textResult(
          readHandoffSuccessText(data),
          createReadHandoffSuccess(data, Date.now() - startedAt)
        );
      } catch {
        return readHandoffFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "wait_for_handoff",
    {
      title: "Wait For Handoff",
      description:
        "Read-only long-poll of the local handoff run state so ChatGPT can stay the planner/reviewer while a local executor runs. Reads .ai-bridge/handoff-run-state.json and returns the run status plus status/diff/log/test excerpts. It never starts processes or runs shell commands; it only observes local handoff state written by execute-handoff/watch-handoff/loop-handoff.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        plan_hash: z.string()
          .trim()
          .min(1)
          .max(256)
          .refine((value) => !/[\r\n\u0000-\u001f\u007f]/.test(value), "Plan hash must be one line.")
          .optional()
          .describe("Expected current-plan.md hash. If set, only a terminal run with this plan_hash counts as completed."),
        since_iteration: z.number().int().min(0).optional().describe("Only treat a run with iteration greater than this as the awaited completion."),
        max_wait_seconds: z.number().int().min(1).max(60).optional().describe("Maximum seconds to long-poll before returning the current state. Default: 20."),
        poll_ms: z.number().int().min(250).max(5000).optional().describe("Poll interval in milliseconds. Default: 1000."),
        include_diff: z.boolean().optional().describe("Include the implementation diff excerpt when completed. Default: true."),
        include_log_excerpt: z.boolean().optional().describe("Include the tail of execution-log.jsonl when completed. Default: true."),
        include_tests: z.boolean().optional().describe("Include the loop-tests.txt excerpt when completed. Default: true.")
      },
      outputSchema: waitForHandoffOutputShape,
      annotations: { ...READ_ONLY_ANNOTATIONS, idempotentHint: false },
      _meta: {
        ...toolCardMeta(),
        "codexpro/preserveStructuredContent": true,
        "openai/toolInvocation/invoking": "Waiting for local handoff result...",
        "openai/toolInvocation/invoked": "Local handoff state ready"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;
      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch {
        const failure: WaitForHandoffFailureInput = args.workspace_id
          ? {
              code: "WORKSPACE_NOT_FOUND",
              details: {
                source: "workspace_id",
                workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
              }
            }
          : {
              code: "WORKSPACE_NOT_FOUND",
              details: { source: "default_workspace", workspace_id: null }
            };
        return waitForHandoffFailureResult(failure, startedAt);
      }

      const maxWaitSeconds = limitInt(args.max_wait_seconds, 20, 1, 60);
      const pollMs = limitInt(args.poll_ms, 1000, 250, 5000);
      const includeDiff = parseBool(args.include_diff, true);
      const includeLog = parseBool(args.include_log_excerpt, true);
      const includeTests = parseBool(args.include_tests, true);
      const expectedPlanHash =
        typeof args.plan_hash === "string" && args.plan_hash.trim() ? args.plan_hash.trim() : undefined;
      const sinceIteration =
        Number.isFinite(Number(args.since_iteration)) && args.since_iteration !== undefined
          ? Math.floor(Number(args.since_iteration))
          : undefined;
      const limits = waitForHandoffLimits(config);
      const stateFile = `${config.contextDir}/handoff-run-state.json`;
      const artifactPaths = {
        status: `${config.contextDir}/agent-status.md`,
        diff: `${config.contextDir}/implementation-diff.patch`,
        log: `${config.contextDir}/execution-log.jsonl`,
        tests: `${config.contextDir}/loop-tests.txt`
      } as const;
      const requestedKinds: WaitForHandoffArtifactKind[] = ["status"];
      if (includeDiff) requestedKinds.push("diff");
      if (includeLog) requestedKinds.push("log");
      if (includeTests) requestedKinds.push("tests");

      const isMatchingTerminal = (run: WaitForHandoffRun | null): boolean => Boolean(
        run &&
        run.state !== "running" &&
        (!expectedPlanHash || run.plan_hash === expectedPlanHash) &&
        (sinceIteration === undefined || run.iteration > sinceIteration)
      );

      const initialNow = waitForHandoffNow();
      if (!Number.isFinite(initialNow)) {
        return waitForHandoffFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
      const waitBudgetMs = maxWaitSeconds * 1_000;
      const deadline = initialNow + waitBudgetMs;
      if (!Number.isFinite(deadline)) {
        return waitForHandoffFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
      let remainingScheduledSleepBudgetMs = waitBudgetMs;
      let run: WaitForHandoffRun | null = null;
      for (;;) {
        let rawObservation: unknown;
        try {
          rawObservation = await waitForHandoffStateProvider({
            config,
            guard,
            workspace,
            maxStateBytes: limits.maxStateBytes
          });
        } catch {
          return waitForHandoffFailureResult({
            code: "HANDOFF_STATE_READ_FAILED",
            details: { context_dir: config.contextDir, state_file: stateFile }
          }, startedAt);
        }

        let observation: z.infer<typeof waitForHandoffStateProviderResultSchema>;
        try {
          observation = waitForHandoffStateProviderResultSchema.parse(rawObservation);
          if (
            observation.stateFile !== stateFile ||
            (observation.bytes !== null && observation.bytes > limits.maxStateBytes)
          ) {
            throw new CodexProError("Handoff state provider identity or bounds mismatch.");
          }
        } catch {
          return waitForHandoffFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
        }

        if (observation.present) {
          try {
            run = normalizeWaitForHandoffRunText(observation.text as string);
          } catch {
            return waitForHandoffFailureResult({
              code: "HANDOFF_STATE_INVALID",
              details: { state_file: stateFile }
            }, startedAt);
          }
        } else {
          run = null;
        }

        if (isMatchingTerminal(run)) break;
        if (remainingScheduledSleepBudgetMs <= 0) break;
        const currentNow = waitForHandoffNow();
        if (!Number.isFinite(currentNow)) {
          return waitForHandoffFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
        }
        const remaining = Math.min(
          deadline - currentNow,
          remainingScheduledSleepBudgetMs
        );
        if (remaining <= 0) break;
        const sleepMilliseconds = Math.min(pollMs, remaining);
        try {
          await waitForHandoffSleep(sleepMilliseconds);
        } catch {
          return waitForHandoffFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
        }
        remainingScheduledSleepBudgetMs = Math.max(
          0,
          remainingScheduledSleepBudgetMs - sleepMilliseconds
        );
      }

      const awaitedTerminal = isMatchingTerminal(run);
      let builtArtifacts = {
        artifacts: [] as WaitForHandoffArtifact[],
        unavailable: [] as WaitForHandoffUnavailable[],
        returnedBytes: 0,
        outputLimited: false,
        redacted: false
      };

      if (awaitedTerminal) {
        let rawArtifacts: unknown;
        try {
          rawArtifacts = await waitForHandoffArtifactsProvider({
            config,
            guard,
            workspace,
            requestedKinds,
            limits: {
              maxArtifactBytes: limits.maxArtifactBytes,
              maxTotalBytes: limits.maxTotalBytes
            }
          });
        } catch {
          return waitForHandoffFailureResult({
            code: "HANDOFF_ARTIFACT_READ_FAILED",
            details: { context_dir: config.contextDir }
          }, startedAt);
        }

        try {
          const providerResult = waitForHandoffArtifactsProviderResultSchema.parse(rawArtifacts);
          if (
            providerResult.contextDir !== config.contextDir ||
            providerResult.requestedKinds.length !== requestedKinds.length ||
            providerResult.requestedKinds.some((kind, index) => kind !== requestedKinds[index])
          ) {
            throw new CodexProError("Handoff artifact provider request identity mismatch.");
          }
          const expectedByKind = new Map(
            WAIT_FOR_HANDOFF_ARTIFACT_DEFINITIONS.map((definition) => [
              definition.kind,
              `${config.contextDir}/${definition.name}`
            ])
          );
          const identities = [...providerResult.artifacts, ...providerResult.unavailable];
          if (
            identities.length !== requestedKinds.length ||
            new Set(identities.map((item) => item.kind)).size !== identities.length ||
            requestedKinds.some((kind) => !identities.some((item) => item.kind === kind)) ||
            identities.some((item) =>
              !requestedKinds.includes(item.kind) || expectedByKind.get(item.kind) !== item.path
            ) ||
            !waitForHandoffKindsAreInFixedOrder(providerResult.artifacts) ||
            !waitForHandoffKindsAreInFixedOrder(providerResult.unavailable) ||
            providerResult.artifacts.some((artifact) => artifact.bytes > limits.maxArtifactBytes)
          ) {
            throw new CodexProError("Handoff artifact provider coverage or bounds mismatch.");
          }
          builtArtifacts = buildWaitForHandoffArtifacts(providerResult, requestedKinds, limits);
        } catch {
          return waitForHandoffFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
        }
      }

      try {
        const planHashMismatch = Boolean(expectedPlanHash && run && run.plan_hash !== expectedPlanHash);
        const iterationStale = Boolean(sinceIteration !== undefined && run && run.iteration <= sinceIteration);
        const data = waitForHandoffDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          context_dir: config.contextDir,
          state_file: stateFile,
          artifact_paths: artifactPaths,
          state_present: run !== null,
          state: awaitedTerminal ? run?.state : run ? "running" : "unknown",
          wait_outcome: awaitedTerminal ? "matched_terminal" : "deadline",
          awaited_terminal: awaitedTerminal,
          awaited_completed: awaitedTerminal && run?.state === "completed",
          succeeded: awaitedTerminal && run?.state === "completed",
          expected_plan_hash: expectedPlanHash ?? null,
          since_iteration: sinceIteration ?? null,
          plan_hash_mismatch: planHashMismatch,
          iteration_stale: iterationStale,
          max_wait_seconds: maxWaitSeconds,
          poll_ms: pollMs,
          next_poll_after_seconds: awaitedTerminal ? null : Math.max(1, Math.ceil(pollMs / 1_000)),
          max_state_bytes: limits.maxStateBytes,
          max_artifact_bytes: limits.maxArtifactBytes,
          max_total_bytes: limits.maxTotalBytes,
          run,
          requested_artifacts: requestedKinds,
          artifacts: builtArtifacts.artifacts,
          artifact_count: builtArtifacts.artifacts.length,
          unavailable: builtArtifacts.unavailable,
          unavailable_count: builtArtifacts.unavailable.length,
          returned_bytes: builtArtifacts.returnedBytes,
          output_limited: builtArtifacts.outputLimited,
          redacted: Boolean(run?.redacted) || builtArtifacts.redacted
        });
        return textResult(
          waitForHandoffSuccessText(data),
          createWaitForHandoffSuccess(data, Date.now() - startedAt)
        );
      } catch {
        return waitForHandoffFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "codex_context",
    {
      title: "Codex Context",
      description:
        "Load Codex-style workspace context in one call: AGENTS instructions for a target path, .ai-bridge handoff files, and optional git status/diff.",
      inputSchema: {
        workspace_id: z.string().optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        target_path: z.string().optional().describe("Workspace-relative file or directory whose AGENTS instruction chain should be loaded. Default: ."),
        include_ai_bridge: z.boolean().optional().describe("Include .ai-bridge plan, agent status, diff, decisions, questions, and execution log. Default: true."),
        include_git: z.boolean().optional().describe("Include git status. Default: true."),
        include_diff: z.boolean().optional().describe("Include full git diff. Default: false for speed/noise."),
        max_agent_bytes: z.number().int().min(1000).max(200000).optional().describe("Maximum bytes per AGENTS file. Default: 60000.")
      },
      outputSchema: codexContextOutputShape,
      annotations: { ...READ_ONLY_ANNOTATIONS, idempotentHint: false },
      _meta: {
        ...toolCardMeta(),
        "codexpro/preserveStructuredContent": true,
        "openai/toolInvocation/invoking": "Loading Codex context...",
        "openai/toolInvocation/invoked": "Codex context ready"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;
      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch {
        const failure: CodexContextFailureInput = args.workspace_id
          ? {
              code: "WORKSPACE_NOT_FOUND",
              details: {
                source: "workspace_id",
                workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
              }
            }
          : {
              code: "WORKSPACE_NOT_FOUND",
              details: { source: "default_workspace", workspace_id: null }
            };
        return codexContextFailureResult(failure, startedAt);
      }

      let target: { targetPath: string; targetKind: CodexContextTargetKind };
      try {
        target = await resolveCodexContextTarget(guard, workspace, args.target_path ?? ".");
      } catch (error) {
        return codexContextFailureResult(classifyCodexContextTargetFailure(error), startedAt);
      }

      const includeAiBridge = parseBool(args.include_ai_bridge, true);
      const includeGitStatus = parseBool(args.include_git, true);
      const includeGitDiff = parseBool(args.include_diff, false);
      const maxAgentBytes = Math.min(
        limitInt(args.max_agent_bytes, 60_000, 1_000, 200_000),
        config.maxReadBytes
      );

      let rawContext: unknown;
      try {
        rawContext = await codexContextProvider({
          config,
          guard,
          workspace,
          targetPath: target.targetPath,
          targetKind: target.targetKind,
          includeAiBridge,
          includeGitStatus,
          includeGitDiff,
          maxAgentBytes
        });
      } catch {
        return codexContextFailureResult({
          code: "CONTEXT_READ_FAILED",
          details: { target_path: target.targetPath }
        }, startedAt);
      }

      try {
        const context = codexContextProviderResultSchema.parse(rawContext);
        const expectedAiPaths = READ_HANDOFF_ARTIFACT_DEFINITIONS.map(
          (definition) => `${config.contextDir}/${definition.name}`
        );
        const providerAiPaths = [
          ...context.aiContextFiles,
          ...context.unavailableSources
            .filter((item) => item.source === "ai_bridge")
            .map((item) => item.path)
        ];
        const aiPathsMatchConfiguredDirectory = providerAiPaths.every((item) => expectedAiPaths.includes(item));
        const aiCoverageMatches = context.aiContextExists !== true || (
          providerAiPaths.length === expectedAiPaths.length &&
          new Set(providerAiPaths).size === expectedAiPaths.length &&
          expectedAiPaths.every((item) => providerAiPaths.includes(item))
        );
        const expectedTextPrefix = [
          "# Codex Context",
          "",
          `Workspace: ${workspace.id}`,
          `Root: ${workspace.root}`,
          `Target path: ${target.targetPath}`,
          `Bash mode: ${config.bashMode}`,
          `Write mode: ${config.writeMode}`,
          `Tool mode: ${config.toolMode}`,
          "",
          "## AGENTS Instructions",
          ""
        ].join("\n");
        const hasAiFrame = context.text.includes("\n\n## AI Bridge Context\n\n");
        const hasRequestedGitFrames =
          (!includeGitStatus || context.text.includes("\n\n## Git Status\n\n")) &&
          (!includeGitDiff || context.text.includes("\n\n## Git Diff\n\n"));
        if (
          context.workspaceId !== workspace.id ||
          context.root !== workspace.root ||
          context.targetPath !== target.targetPath ||
          context.targetKind !== target.targetKind ||
          !context.text.startsWith(expectedTextPrefix) ||
          !hasAiFrame ||
          !hasRequestedGitFrames ||
          !aiPathsMatchConfiguredDirectory ||
          !aiCoverageMatches ||
          (context.gitStatus !== undefined) !== includeGitStatus ||
          (context.gitDiff !== undefined) !== includeGitDiff
        ) {
          throw new CodexProError("Codex context provider identity or requested source presence mismatch.");
        }

        const safeContext = redactSensitiveText(context.text);
        const sourceBytes = Buffer.byteLength(safeContext, "utf8");
        const bounded = boundedCodexContext(safeContext, config.maxOutputBytes);
        const contextBytes = Buffer.byteLength(bounded.text, "utf8");
        const data = codexContextDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          target_path: target.targetPath,
          target_kind: target.targetKind,
          tool_mode: config.toolMode,
          write_mode: config.writeMode,
          bash_mode: config.bashMode,
          include_ai_bridge: includeAiBridge,
          include_git_status: includeGitStatus,
          include_git_diff: includeGitDiff,
          max_agent_bytes: maxAgentBytes,
          max_total_bytes: config.maxOutputBytes,
          agents_files: context.agentsFiles,
          agents_count: context.agentsFiles.length,
          ai_context_exists: context.aiContextExists,
          ai_context_files: context.aiContextFiles,
          ai_context_count: context.aiContextFiles.length,
          unavailable_sources: context.unavailableSources,
          unavailable_count: context.unavailableSources.length,
          included_git_status: context.gitStatus !== undefined,
          included_git_diff: context.gitDiff !== undefined,
          context: bounded.text,
          context_source_bytes: sourceBytes,
          context_bytes: contextBytes,
          preview: codexContextPreview(bounded.text),
          truncated: bounded.truncated,
          output_limited: bounded.truncated || context.unavailableSources.some((item) =>
            item.reason === "too_large" || item.reason === "output_limit"
          ),
          redacted: safeContext !== context.text
        });
        return textResult(
          data.context,
          createCodexContextSuccess(data, Date.now() - startedAt)
        );
      } catch {
        return codexContextFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "export_pro_context",
    {
      title: "Export Pro Context",
      description:
        "Create .ai-bridge/pro-context.md with repo tree, git state, selected files, and handoff context for high-context ChatGPT planning without live MCP tool calls.",
      inputSchema: {
        workspace_id: z.string().max(160).optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        title: z.string().max(200).optional().describe("Single-line Markdown title for the context bundle."),
        selected_paths: z.array(z.string().min(1).max(240)).max(80).optional().describe("Specific workspace-relative files to include."),
        extra_globs: z.array(z.string().min(1).max(240)).max(32).optional().describe("Additional workspace-relative glob patterns to include, for example src/**/*.ts."),
        include_important_files: z.boolean().optional().describe("Auto-include important root config/docs such as AGENTS.md, README.md, and package.json. Default: true."),
        include_changed_files: z.boolean().optional().describe("Auto-include currently changed files from git status. Default: true."),
        include_diff: z.boolean().optional().describe("Include the current git diff. Default: true."),
        include_ai_bridge: z.boolean().optional().describe("Include existing .ai-bridge planning files. Default: true."),
        max_depth: z.number().int().min(1).max(6).optional().describe("Repository tree depth. Default: 3."),
        max_files: z.number().int().min(1).max(80).optional().describe("Maximum file contents to include. Default: 24."),
        max_file_bytes: z.number().int().min(1000).max(250000).optional().describe("Maximum bytes per included file. Default: 60000."),
        max_total_bytes: z.number().int().min(20000).max(2000000).optional().describe("Maximum bytes in the generated bundle.")
      },
      outputSchema: exportProContextOutputShape,
      annotations: HANDOFF_WRITE_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "codexpro/preserveStructuredContent": true,
        "openai/toolInvocation/invoking": "Exporting Pro context...",
        "openai/toolInvocation/invoked": "Pro context exported"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;
      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch {
        const failure: ExportProContextFailureInput = args.workspace_id
          ? {
              code: "WORKSPACE_NOT_FOUND",
              details: {
                source: "workspace_id",
                workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
              }
            }
          : {
              code: "WORKSPACE_NOT_FOUND",
              details: { source: "default_workspace", workspace_id: null }
            };
        return exportProContextFailureResult(failure, startedAt);
      }

      let request: PreparedProContextRequest;
      try {
        request = await prepareProContextRequest(config, guard, workspace, {
          title: args.title,
          selectedPaths: args.selected_paths,
          extraGlobs: args.extra_globs,
          includeImportantFiles: args.include_important_files,
          includeChangedFiles: args.include_changed_files,
          includeDiff: args.include_diff,
          includeAiBridge: args.include_ai_bridge,
          maxDepth: args.max_depth,
          maxFiles: args.max_files,
          maxFileBytes: args.max_file_bytes,
          maxTotalBytes: args.max_total_bytes
        });
      } catch (error) {
        return exportProContextFailureResult(
          classifyProContextOperationFailure(error, "INTERNAL_ERROR"),
          startedAt
        );
      }

      let output: PreparedProContextOutput;
      try {
        output = await preflightProContextOutput(config, guard, workspace, request);
      } catch (error) {
        return exportProContextFailureResult(
          classifyProContextOperationFailure(error, "INTERNAL_ERROR"),
          startedAt
        );
      }

      let rawResult: unknown;
      try {
        rawResult = await exportProContextProvider({ config, guard, workspace, request, output });
      } catch (error) {
        return exportProContextFailureResult(
          classifyProContextOperationFailure(error, "CONTEXT_EXPORT_FAILED"),
          startedAt
        );
      }

      try {
        const result = exportProContextProviderResultSchema.parse(rawResult);
        const expectedTitle = redactSensitiveText(request.title);
        const expectedBounded = capProContextUtf8(
          result.sourceMarkdown,
          request.maxTotalBytes,
          EXPORT_PRO_CONTEXT_BUNDLE_TRUNCATION_MARKER
        );
        const expectedBytes = Buffer.byteLength(result.markdown, "utf8");
        const expectedSourceBytes = Buffer.byteLength(result.sourceMarkdown, "utf8");
        const expectedSha256 = createHash("sha256").update(result.markdown).digest("hex");
        if (
          result.workspaceId !== workspace.id ||
          result.root !== workspace.root ||
          result.path !== output.path ||
          result.title !== expectedTitle ||
          !sameStringSequence(result.selectedPaths, request.selectedPaths) ||
          !sameStringSequence(result.extraGlobs, request.extraGlobs) ||
          result.includeImportantFiles !== request.includeImportantFiles ||
          result.includeChangedFiles !== request.includeChangedFiles ||
          result.includeDiff !== request.includeDiff ||
          result.includeAiBridge !== request.includeAiBridge ||
          result.maxDepth !== request.maxDepth ||
          result.maxFiles !== request.maxFiles ||
          result.maxFileBytes !== request.maxFileBytes ||
          result.maxDiffBytes !== request.maxDiffBytes ||
          result.maxTotalBytes !== request.maxTotalBytes ||
          result.sourceBytes !== expectedSourceBytes ||
          result.bytes !== expectedBytes ||
          result.sha256 !== expectedSha256 ||
          result.markdown !== expectedBounded.text ||
          result.bundleTruncated !== expectedBounded.truncated ||
          result.truncated !== (result.diffTruncated || result.bundleTruncated) ||
          !result.sourceMarkdown.startsWith(`# ${result.title}\n`) ||
          (result.diffTruncated && !result.sourceMarkdown.includes(EXPORT_PRO_CONTEXT_DIFF_TRUNCATION_MARKER)) ||
          hasSecretValue(result.sourceMarkdown) ||
          hasSecretValue(result.markdown)
        ) {
          throw new CodexProError("Export provider identity, framing, or integrity mismatch.");
        }

        const data = exportProContextDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          path: result.path,
          tool_mode: config.toolMode,
          write_mode: config.writeMode,
          bash_mode: config.bashMode,
          title: result.title,
          include_important_files: result.includeImportantFiles,
          include_changed_files: result.includeChangedFiles,
          include_diff: result.includeDiff,
          include_ai_bridge: result.includeAiBridge,
          max_depth: result.maxDepth,
          max_files: result.maxFiles,
          max_file_bytes: result.maxFileBytes,
          max_diff_bytes: result.maxDiffBytes,
          max_total_bytes: result.maxTotalBytes,
          selected_paths: result.selectedPaths,
          selected_count: result.selectedPaths.length,
          extra_globs: result.extraGlobs,
          extra_glob_count: result.extraGlobs.length,
          changed_file_count: result.changedFileCount,
          candidate_count: result.candidateCount,
          omitted_count: result.omittedCount,
          files_included: result.filesIncluded,
          file_count: result.filesIncluded.length,
          files_skipped: result.filesSkipped,
          skipped_count: result.filesSkipped.length,
          ai_context_files: result.aiContextFiles,
          ai_context_file_count: result.aiContextFiles.length,
          ai_context_unavailable: result.aiContextUnavailable,
          ai_context_unavailable_count: result.aiContextUnavailable.length,
          created_context_files: result.createdContextFiles,
          created_context_file_count: result.createdContextFiles.length,
          existed: result.existed,
          source_bytes: result.sourceBytes,
          bytes: result.bytes,
          sha256: result.sha256,
          diff_truncated: result.diffTruncated,
          bundle_truncated: result.bundleTruncated,
          truncated: result.truncated,
          output_limited: result.outputLimited,
          redacted: result.redacted
        });
        if (!pendingWorkspaceMutation(rawResult)) {
          const artifactPath = guard.resolve(workspace, output.path);
          if (artifactPath.relPath !== output.path) {
            throw new CodexProError("Export artifact path mismatch.");
          }
          await guard.assertTextFile(
            artifactPath.absPath,
            Math.max(config.maxWriteBytes, config.maxReadBytes)
          );
          const artifact = await fsp.readFile(artifactPath.absPath);
          if (
            artifact.byteLength !== result.bytes ||
            createHash("sha256").update(artifact).digest("hex") !== result.sha256 ||
            artifact.toString("utf8") !== result.markdown
          ) {
            throw new CodexProError("Export artifact integrity mismatch.");
          }
        }
        return carryPendingMutation(
          rawResult,
          textResult(
            exportProContextSuccessText(data),
            createExportProContextSuccess(data, Date.now() - startedAt)
          )
        );
      } catch {
        return exportProContextFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
    }
  );

  if (config.codexSessions !== "off") {
    registerCodexTool(
      config,
      server,
      "codex_sessions",
      {
        title: "Codex Sessions",
        description:
          "Opt-in, read-only local Codex session history browser. Lists metadata from the user's configured Codex session JSONL files without reading full transcripts.",
        inputSchema: {
          max_sessions: z.number().int().min(1).max(200).optional().describe("Maximum sessions to return. Default: 30."),
          query: z.string().max(500).optional().describe("Optional case-insensitive search over session id, title, cwd, and source path.")
        },
        outputSchema: codexSessionsOutputShape,
        annotations: READ_ONLY_ANNOTATIONS,
        _meta: {
          ...toolCardMeta(),
          "openai/toolInvocation/invoking": "Listing local Codex sessions...",
          "openai/toolInvocation/invoked": "Codex sessions ready"
        }
      },
      async (args) => {
        const startedAt = Date.now();
        const request = normalizeCodexSessionsRequest(args);
        let rawResult: unknown;
        try {
          rawResult = await codexSessionsProvider({
            config,
            options: {
              maxSessions: request.maxSessions,
              ...(request.query ? { query: request.query } : {})
            }
          });
        } catch {
          return codexSessionsFailureResult(
            { code: "SESSION_INDEX_FAILED", details: {} },
            startedAt
          );
        }

        try {
          const data = validateCodexSessionsProviderResult(config, request, rawResult);
          return textResult(
            codexSessionsSuccessText(data),
            createCodexSessionsSuccess(data, Date.now() - startedAt)
          );
        } catch {
          return codexSessionsFailureResult(
            { code: "INTERNAL_ERROR", details: {} },
            startedAt
          );
        }
      }
    );

    if (config.codexSessions === "read") {
      registerCodexTool(
        config,
        server,
        "read_codex_session",
        {
          title: "Read Codex Session",
          description:
            "Opt-in, read-only local Codex transcript reader. Requires --codex-sessions read and returns a bounded transcript from a local Codex session JSONL file.",
          inputSchema: {
            session_id: z.string().max(128).optional().describe("Codex session id from codex_sessions."),
            source_path: z.string().max(4096).optional().describe("Source path from codex_sessions. Must be inside the configured Codex session roots."),
            max_messages: z.number().int().min(1).max(400).optional().describe("Maximum transcript messages. Default: 80."),
            max_total_bytes: z.number().int().min(4000).max(400000).optional().describe("Maximum transcript content bytes. Default: 80000.")
          },
          outputSchema: readCodexSessionOutputShape,
          annotations: READ_ONLY_ANNOTATIONS,
          _meta: {
            ...toolCardMeta(),
            "codexpro/preserveStructuredContent": true,
            "openai/toolInvocation/invoking": "Reading local Codex session...",
            "openai/toolInvocation/invoked": "Codex session read"
          }
        },
        async (args) => {
          const startedAt = Date.now();
          const prepared = normalizeReadCodexSessionRequest(args);
          if (!prepared.ok) {
            return readCodexSessionFailureResult(prepared.failure, startedAt);
          }

          let rawResult: unknown;
          try {
            rawResult = await readCodexSessionProvider({
              config,
              request: prepared.request
            });
          } catch (error) {
            const failure = isCodexSessionReadOperationError(error)
              ? readCodexSessionOperationFailure(error)
              : { code: "SESSION_READ_FAILED" as const, details: {} };
            return readCodexSessionFailureResult(failure, startedAt);
          }

          try {
            const data = validateReadCodexSessionProviderResult(
              config,
              prepared.request,
              rawResult
            );
            return textResult(
              readCodexSessionSuccessText(data),
              createReadCodexSessionSuccess(data, Date.now() - startedAt)
            );
          } catch {
            return readCodexSessionFailureResult(
              internalReadCodexSessionFailure(),
              startedAt
            );
          }
        }
      );
    }
  }

  registerCodexTool(
    config,
    server,
    "handoff_to_agent",
    {
      title: "Handoff To Agent",
      description:
        "Write .ai-bridge/current-plan.md for Codex, OpenCode, Pi, or another local implementation agent. This only creates handoff files; it does not execute local agent commands.",
      inputSchema: {
        workspace_id: z.string().max(160).optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        agent: z.string().max(256).optional().describe("Target agent id, for example codex, opencode, pi, or custom. Default: custom."),
        agent_name: z.string().max(1_000).optional().describe("Human-readable agent name for custom agents; normalized value is limited to 80 characters."),
        model: z.string().max(1_000).optional().describe("Optional model identifier; normalized value is limited to 120 characters."),
        title: z.string().max(1_000).optional().describe("Short task title; normalized value is limited to 120 characters."),
        plan: z.string().describe("Detailed implementation plan for the local agent."),
        append: z.boolean().optional().describe("Append to existing current-plan.md instead of overwriting. Default: false.")
      },
      outputSchema: handoffToAgentOutputShape,
      annotations: HANDOFF_WRITE_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "codexpro/preserveStructuredContent": true,
        "openai/toolInvocation/invoking": "Writing agent handoff plan...",
        "openai/toolInvocation/invoked": "Agent handoff plan written"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;
      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch {
        const failure: HandoffToAgentFailureInput = args.workspace_id
          ? {
              code: "WORKSPACE_NOT_FOUND",
              details: {
                source: "workspace_id",
                workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
              }
            }
          : {
              code: "WORKSPACE_NOT_FOUND",
              details: { source: "default_workspace", workspace_id: null }
            };
        return handoffToAgentFailureResult(failure, startedAt);
      }

      let request: ReturnType<typeof prepareAgentHandoffRequest>;
      try {
        request = prepareAgentHandoffRequest(config, workspace, {
          agent: args.agent,
          agentName: args.agent_name,
          model: args.model,
          title: args.title,
          plan: args.plan,
          append: parseBool(args.append, false),
          eventName: "handoff_to_agent",
          updatedAt: handoffToAgentNow()
        });
      } catch (error) {
        return handoffToAgentFailureResult(
          classifyHandoffOperationFailure(error, "INTERNAL_ERROR"),
          startedAt
        );
      }

      let output: Awaited<ReturnType<typeof preflightAgentHandoffOutput>>;
      try {
        output = await preflightAgentHandoffOutput(config, guard, workspace, request);
      } catch (error) {
        return handoffToAgentFailureResult(
          classifyHandoffOperationFailure(error, "INTERNAL_ERROR"),
          startedAt
        );
      }

      let rawResult: unknown;
      try {
        rawResult = await handoffToAgentProvider({ config, guard, workspace, request, output });
      } catch (error) {
        return handoffToAgentFailureResult(
          classifyHandoffOperationFailure(error, "HANDOFF_WRITE_FAILED"),
          startedAt
        );
      }

      try {
        const result = await validateHandoffProviderResult(
          { config, guard, workspace, request, output },
          rawResult
        );

        const data = handoffToAgentDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          tool_mode: config.toolMode,
          write_mode: config.writeMode,
          agent: result.agent,
          agent_name: result.agentName,
          model: result.model ?? null,
          title: result.title,
          updated_at: result.updatedAt,
          append_requested: result.appendRequested,
          append_applied: result.appendApplied,
          max_write_bytes: result.maxWriteBytes,
          plan_path: result.planPath,
          status_path: result.statusPath,
          diff_path: result.diffPath,
          log_path: result.logPath,
          execution_log_path: result.executionLogPath,
          created_context_files: result.createdContextFiles,
          created_context_file_count: result.createdContextFiles.length,
          plan_file_existed_before: result.planFileExistedBefore,
          prior_plan_available: result.priorPlanAvailable,
          previous_bytes: result.previousBytes,
          plan_bytes: result.planBytes,
          plan_sha256: result.planSha256,
          additions: result.additions,
          deletions: result.deletions,
          changed: result.changed,
          diff: result.diff,
          diff_bytes: result.diffBytes,
          diff_truncated: result.diffTruncated,
          logged_paths: result.loggedPaths,
          logged_count: result.loggedPaths.length,
          event_bytes: result.eventBytes,
          event_sha256: result.eventSha256,
          prompt: result.prompt,
          prompt_bytes: result.promptBytes
        });
        return carryPendingMutation(
          result,
          textResult(
            handoffToAgentSuccessText(data),
            createHandoffToAgentSuccess(data, Date.now() - startedAt)
          )
        );
      } catch {
        return handoffToAgentFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
    }
  );

  registerCodexTool(
    config,
    server,
    "handoff_to_codex",
    {
      title: "Handoff To Codex",
      description:
        "Write the fixed .ai-bridge/current-plan.md handoff for Codex. This only creates handoff files; it does not execute Codex.",
      inputSchema: {
        workspace_id: z.string().max(160).optional().describe("Workspace id from open_workspace. Omit to use default workspace."),
        title: z.string().max(1_000).optional().describe("Short task title; normalized value is limited to 120 characters."),
        plan: z.string().describe("Detailed implementation plan for Codex."),
        append: z.boolean().optional().describe("Append to existing current-plan.md instead of overwriting. Default: false.")
      },
      outputSchema: handoffToCodexOutputShape,
      annotations: HANDOFF_WRITE_ANNOTATIONS,
      _meta: {
        ...toolCardMeta(),
        "codexpro/preserveStructuredContent": true,
        "openai/toolInvocation/invoking": "Writing Codex handoff plan...",
        "openai/toolInvocation/invoked": "Codex handoff plan written"
      }
    },
    async (args) => {
      const startedAt = Date.now();
      let workspace: Workspace;
      try {
        workspace = workspaces.resolveWorkspace(args.workspace_id);
      } catch {
        const failure: HandoffToCodexFailureInput = args.workspace_id
          ? {
              code: "WORKSPACE_NOT_FOUND",
              details: {
                source: "workspace_id",
                workspace_id: safeTreeWorkspaceIdDetail(args.workspace_id)
              }
            }
          : {
              code: "WORKSPACE_NOT_FOUND",
              details: { source: "default_workspace", workspace_id: null }
            };
        return handoffToCodexFailureResult(failure, startedAt);
      }

      let request: ReturnType<typeof prepareAgentHandoffRequest>;
      try {
        const title = typeof args.title === "string" && args.title.trim()
          ? args.title
          : "Codex implementation plan";
        request = prepareAgentHandoffRequest(config, workspace, {
          agent: "codex",
          agentName: "Codex",
          title,
          plan: args.plan,
          append: parseBool(args.append, false),
          eventName: "handoff_to_codex",
          updatedAt: handoffToCodexNow()
        });
      } catch (error) {
        return handoffToCodexFailureResult(
          classifyHandoffToCodexOperationFailure(error, "INTERNAL_ERROR"),
          startedAt
        );
      }

      let output: Awaited<ReturnType<typeof preflightAgentHandoffOutput>>;
      try {
        output = await preflightAgentHandoffOutput(config, guard, workspace, request);
      } catch (error) {
        return handoffToCodexFailureResult(
          classifyHandoffToCodexOperationFailure(error, "INTERNAL_ERROR"),
          startedAt
        );
      }

      const providerContext = { config, guard, workspace, request, output };
      let rawResult: unknown;
      try {
        rawResult = await handoffToCodexProvider(providerContext);
      } catch (error) {
        return handoffToCodexFailureResult(
          classifyHandoffToCodexOperationFailure(error, "HANDOFF_WRITE_FAILED"),
          startedAt
        );
      }

      try {
        const result = await validateHandoffProviderResult(providerContext, rawResult);
        const data = handoffToCodexDataSchema.parse({
          workspace_id: workspace.id,
          root: workspace.root,
          tool_mode: config.toolMode,
          write_mode: config.writeMode,
          agent: result.agent,
          agent_name: result.agentName,
          model: result.model ?? null,
          title: result.title,
          updated_at: result.updatedAt,
          append_requested: result.appendRequested,
          append_applied: result.appendApplied,
          max_write_bytes: result.maxWriteBytes,
          plan_path: result.planPath,
          status_path: result.statusPath,
          diff_path: result.diffPath,
          log_path: result.logPath,
          execution_log_path: result.executionLogPath,
          created_context_files: result.createdContextFiles,
          created_context_file_count: result.createdContextFiles.length,
          plan_file_existed_before: result.planFileExistedBefore,
          prior_plan_available: result.priorPlanAvailable,
          previous_bytes: result.previousBytes,
          plan_bytes: result.planBytes,
          plan_sha256: result.planSha256,
          additions: result.additions,
          deletions: result.deletions,
          changed: result.changed,
          diff: result.diff,
          diff_bytes: result.diffBytes,
          diff_truncated: result.diffTruncated,
          logged_paths: result.loggedPaths,
          logged_count: result.loggedPaths.length,
          event_bytes: result.eventBytes,
          event_sha256: result.eventSha256,
          prompt: result.prompt,
          prompt_bytes: result.promptBytes
        });
        return carryPendingMutation(
          result,
          textResult(
            handoffToCodexSuccessText(data),
            createHandoffToCodexSuccess(data, Date.now() - startedAt)
          )
        );
      } catch {
        return handoffToCodexFailureResult({ code: "INTERNAL_ERROR", details: {} }, startedAt);
      }
    }
  );

  if (config.toolContractVersion === 2) {
    registerCodexTool(
      config,
      server,
      "undo_change_set",
      {
        title: "Undo Change Set",
        description:
          "Preview or atomically reverse one owner-bound change set. The complete current state must still match; there is no force or overwrite option.",
        inputSchema: undoChangeSetInputV2Schema.shape,
        outputSchema: undoChangeSetOutputShape,
        annotations: LOCAL_WRITE_ANNOTATIONS,
        _meta: {
          ...toolCardMeta(),
          "codexpro/preserveStructuredContent": true,
          "openai/toolInvocation/invoking": "Validating change set undo...",
          "openai/toolInvocation/invoked": "Change set undo complete"
        }
      },
      async (args) => {
        const startedAt = Date.now();
        let workspace: Workspace;
        try {
          workspace = workspaces.getWorkspace(args.workspace_id);
        } catch {
          return undoChangeSetFailureResult(
            new UndoChangeSetError("WORKSPACE_NOT_FOUND", "Workspace was not found."),
            args,
            startedAt
          );
        }
        if (!dependencies.undoChangeSetService) {
          return undoChangeSetFailureResult(
            new UndoChangeSetError("ATOMIC_BACKEND_UNAVAILABLE", "Undo runtime is unavailable."),
            args,
            startedAt
          );
        }
        let prepared;
        try {
          prepared = await dependencies.undoChangeSetService.prepare({
            workspace,
            changeSetId: args.change_set_id,
            ownerBinding: changeSetOwnerBinding(
              dependencies.policySessionContextSource,
              dependencies.changeSetOwnerBindingKey
            ),
            policyRevision: mutationPolicyRevision(effectivePolicyRuntime),
            requestId: null,
            preview: args.preview === true,
            projectFailure: ({ error }) => undoChangeSetFailureResult(error, args, startedAt)
          });
        } catch (error) {
          return undoChangeSetFailureResult(error, args, startedAt);
        }
        const data: UndoChangeSetData = {
          workspace_id: prepared.workspaceId,
          preview: prepared.preview,
          change_set_id: prepared.changeSetId,
          reverts_change_set_id: prepared.revertsChangeSetId,
          operation_count: prepared.operationCount,
          operations: prepared.operations,
          undo_supported: false
        };
        const structured = createUndoChangeSetSuccess(data, Date.now() - startedAt);
        const result = textResult(
          prepared.preview
            ? `Undo preview validated ${prepared.operationCount} operation(s); no files or state were changed.`
            : `Undid ${prepared.operationCount} operation(s) in one audited reverse transaction.`,
          structured
        );
        return prepared.pending
          ? attachPendingWorkspaceMutation(result, prepared.pending)
          : result;
      }
    );
  }

  upgradeCodexProSupertool(server);
  if ((policyEngineMode !== "legacy" || requiresAtomicAuditWrapper) && !effectivePolicyRuntime) {
    throw new Error("Policy Kernel runtime is required for shadow, enforce, or writable atomic audit mode.");
  }
  if (effectivePolicyRuntime) installPolicyKernel(server, effectivePolicyRuntime);
  return server;
}
