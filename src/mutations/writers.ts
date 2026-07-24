import { createHash } from "node:crypto";
import type { TransactionResultV2 } from "../changesets/types.js";
import type {
  EditFileResult,
  PreparedFileMutation,
  PreparedWorkspaceTextBatch,
  WriteFileResult
} from "../fsOps.js";
import type { Workspace } from "../guard.js";
import type { PreparedWorkspacePatch } from "../patchOps.js";
import { attachPendingWorkspaceMutation, type WorkspaceMutationRuntime } from "./runtime.js";
import type { MutationProjectionInput } from "./types.js";

export function preserveMutationResult<T extends object>(
  input: MutationProjectionInput<T>
): T {
  return input.result;
}

export interface FileMutationContext {
  toolName: "write" | "edit";
  requestId: string | null;
  ownerBinding: string;
  policyRevision: string;
  contractVersion: 1 | 2 | 3;
  now?: () => number;
  retentionMs?: number;
}

export interface FileMutationPublicProjection<T extends object> {
  result: T;
  transaction: TransactionResultV2;
  beforeSha256: string | null;
}

export interface AttachPreparedFileMutationInput<T extends object> {
  runtime: Pick<WorkspaceMutationRuntime, "prepare">;
  workspace: Workspace;
  prepared: PreparedFileMutation<WriteFileResult | EditFileResult>;
  context: FileMutationContext;
  result: T;
  project?: (input: FileMutationPublicProjection<T>) => T;
  projectFailure?: (input: { result: T; error: unknown }) => T | null;
}

export interface PatchMutationContext {
  toolName: "apply_patch";
  requestId: string | null;
  ownerBinding: string;
  policyRevision: string;
  contractVersion: 1 | 2 | 3;
  now?: () => number;
  retentionMs?: number;
}

export interface PatchMutationFileProjection {
  path: string;
  before_sha256: string | null;
  after_sha256: string | null;
}

export interface PatchMutationPublicProjection<T extends object> {
  result: T;
  transaction: TransactionResultV2;
  files: PatchMutationFileProjection[];
}

export interface AttachPreparedPatchMutationInput<T extends object> {
  runtime: Pick<WorkspaceMutationRuntime, "prepare">;
  workspace: Workspace;
  prepared: PreparedWorkspacePatch;
  context: PatchMutationContext;
  result: T;
  project?: (input: PatchMutationPublicProjection<T>) => T;
  projectFailure?: (input: { result: T; error: unknown }) => T | null;
}

export interface BatchMutationContext {
  toolName: string;
  requestId: string | null;
  ownerBinding: string;
  policyRevision: string;
  contractVersion: 1 | 2 | 3;
  now?: () => number;
  retentionMs?: number;
  retainChangeSet?: boolean;
  semanticFactsDigest?: string;
  validateSemanticReservation?: () => void;
}

export interface BatchMutationFileProjection {
  path: string;
  before_sha256: string | null;
  after_sha256: string;
}

export interface BatchMutationPublicProjection<T extends object> {
  result: T;
  transaction: TransactionResultV2;
  files: BatchMutationFileProjection[];
}

export interface AttachPreparedBatchMutationInput<T extends object> {
  runtime: Pick<WorkspaceMutationRuntime, "prepare">;
  workspace: Workspace;
  prepared: PreparedWorkspaceTextBatch;
  context: BatchMutationContext;
  result: T;
  project?: (input: BatchMutationPublicProjection<T>) => T;
  projectFailure?: (input: { result: T; error: unknown }) => T | null;
}

function opaqueBlobId(changeSetId: string, operationId: string): string {
  return `blob_${createHash("sha256")
    .update(`${changeSetId}\0${operationId}`, "utf8")
    .digest("hex")
    .slice(0, 32)}`;
}

function validTimestamp(value: number, label: string): string {
  const timestamp = new Date(value).toISOString();
  if (timestamp === "Invalid Date") throw new Error(`${label} is invalid.`);
  return timestamp;
}

export async function attachPreparedBatchMutation<T extends object>(
  input: AttachPreparedBatchMutationInput<T>
): Promise<T> {
  if (input.prepared.operations.length < 1) {
    throw new Error("Prepared workspace batch must contain at least one operation.");
  }
  const now = input.context.now ?? Date.now;
  const createdAtMs = now();
  const retentionMs = input.context.retentionMs ?? 24 * 60 * 60 * 1_000;
  if (!Number.isSafeInteger(retentionMs) || retentionMs <= 0) {
    throw new Error("Change-set retention is invalid.");
  }
  const retainChangeSet = input.context.retainChangeSet !== false;
  const createdAt = validTimestamp(createdAtMs, "Change-set creation time");
  const expiresAt = validTimestamp(createdAtMs + retentionMs, "Change-set expiry time");
  const files = input.prepared.operations.map((prepared) => ({
    path: prepared.path,
    before_sha256: prepared.before.sha256,
    after_sha256: prepared.afterSha256
  }));
  const beforeState = input.prepared.operations.every((prepared) => prepared.before.exists)
    ? "present" as const
    : input.prepared.operations.every((prepared) => !prepared.before.exists)
      ? "absent" as const
      : "mixed" as const;

  const pending = await input.runtime.prepare<T>({
    transaction: {
      workspace: input.workspace,
      operations: input.prepared.operations.map((prepared) => prepared.operation),
      ...(input.context.semanticFactsDigest === undefined
        ? {}
        : { semanticFactsDigest: input.context.semanticFactsDigest })
    },
    ...(input.context.validateSemanticReservation
      ? { validateLifecycle: input.context.validateSemanticReservation }
      : {}),
    changeSet: ({ transactionId, changeSetId, workspaceStateKey }) => {
      const entries = input.prepared.operations.map((prepared) => {
        const before = prepared.before;
        const blobId = retainChangeSet && before.exists
          ? opaqueBlobId(changeSetId, prepared.operation.operationId)
          : null;
        return {
          manifest: {
            operationId: prepared.operation.operationId,
            kind: prepared.operation.kind,
            relativePath: prepared.operation.relativePath,
            destinationRelativePath: null,
            before: before.exists
              ? {
                  exists: true as const,
                  sha256: before.sha256,
                  bytes: before.bytes?.length ?? 0,
                  metadata: before.metadata
                }
              : {
                  exists: false as const,
                  sha256: null,
                  bytes: 0,
                  metadata: null
                },
            after: {
              exists: true as const,
              sha256: prepared.afterSha256,
              bytes: prepared.operation.bytes.length
            },
            blobId
          },
          blob: blobId && before.bytes && before.sha256
            ? {
                blobId,
                operationId: prepared.operation.operationId,
                beforeSha256: before.sha256,
                plaintext: Buffer.from(before.bytes)
              }
            : null
        };
      });
      const blobs = entries.flatMap((entry) => entry.blob ? [entry.blob] : []);
      const plaintextBytes = blobs.reduce((total, blob) => total + blob.plaintext.length, 0);
      return {
        manifest: {
          schemaVersion: 1,
          changeSetId,
          transactionId,
          workspaceStateKey,
          generation: 1,
          createdAt,
          updatedAt: createdAt,
          expiresAt,
          toolName: input.context.toolName,
          requestId: input.context.requestId,
          ownerBinding: input.context.ownerBinding,
          policyRevision: input.context.policyRevision,
          contractVersion: input.context.contractVersion,
          state: "active" as const,
          undoSupported: retainChangeSet,
          undoReason: retainChangeSet ? null : "retention_disabled" as const,
          operations: entries.map((entry) => entry.manifest),
          plaintextBytes,
          ciphertextBytes: plaintextBytes + blobs.length * 37,
          revertsChangeSetId: null
        },
        blobs
      };
    },
    project: ({ result, committed, changeSet }) => {
      if (!input.project) return result;
      return input.project({
        result,
        files,
        transaction: {
          change_set_id: committed.changeSetId,
          transaction_id: committed.transactionId,
          before_state: beforeState,
          operation_count: committed.operationCount,
          undo_supported: changeSet.undoSupported,
          committed_at: committed.committedAt
        }
      });
    },
    projectFailure: input.projectFailure
  });
  return attachPendingWorkspaceMutation(input.result, pending);
}

export async function attachPreparedFileMutation<T extends object>(
  input: AttachPreparedFileMutationInput<T>
): Promise<T> {
  const now = input.context.now ?? Date.now;
  const createdAtMs = now();
  const retentionMs = input.context.retentionMs ?? 24 * 60 * 60 * 1_000;
  if (!Number.isSafeInteger(retentionMs) || retentionMs <= 0) {
    throw new Error("Change-set retention is invalid.");
  }
  const createdAt = validTimestamp(createdAtMs, "Change-set creation time");
  const expiresAt = validTimestamp(createdAtMs + retentionMs, "Change-set expiry time");
  const before = input.prepared.before;
  const afterBytes = input.prepared.operation.bytes;
  const afterSha256 = createHash("sha256").update(afterBytes).digest("hex");

  const pending = await input.runtime.prepare<T>({
    transaction: {
      workspace: input.workspace,
      operations: [input.prepared.operation]
    },
    changeSet: ({ transactionId, changeSetId, workspaceStateKey }) => {
      const blobId = before.exists
        ? opaqueBlobId(changeSetId, input.prepared.operation.operationId)
        : null;
      const plaintextBytes = before.bytes?.length ?? 0;
      return {
        manifest: {
          schemaVersion: 1,
          changeSetId,
          transactionId,
          workspaceStateKey,
          generation: 1,
          createdAt,
          updatedAt: createdAt,
          expiresAt,
          toolName: input.context.toolName,
          requestId: input.context.requestId,
          ownerBinding: input.context.ownerBinding,
          policyRevision: input.context.policyRevision,
          contractVersion: input.context.contractVersion,
          state: "active",
          undoSupported: true,
          undoReason: null,
          operations: [{
            operationId: input.prepared.operation.operationId,
            kind: input.prepared.operation.kind,
            relativePath: input.prepared.operation.relativePath,
            destinationRelativePath: null,
            before: before.exists
              ? {
                  exists: true,
                  sha256: before.sha256,
                  bytes: plaintextBytes,
                  metadata: before.metadata
                }
              : {
                  exists: false,
                  sha256: null,
                  bytes: 0,
                  metadata: null
                },
            after: {
              exists: true,
              sha256: afterSha256,
              bytes: afterBytes.length
            },
            blobId
          }],
          plaintextBytes,
          ciphertextBytes: plaintextBytes + (blobId ? 37 : 0),
          revertsChangeSetId: null
        },
        blobs: blobId && before.bytes && before.sha256
          ? [{
              blobId,
              operationId: input.prepared.operation.operationId,
              beforeSha256: before.sha256,
              plaintext: Buffer.from(before.bytes)
            }]
          : []
      };
    },
    project: ({ result, committed, changeSet }) => {
      if (!input.project) return result;
      return input.project({
        result,
        beforeSha256: before.sha256,
        transaction: {
          change_set_id: committed.changeSetId,
          transaction_id: committed.transactionId,
          before_state: before.exists ? "present" : "absent",
          operation_count: committed.operationCount,
          undo_supported: changeSet.undoSupported,
          committed_at: committed.committedAt
        }
      });
    },
    projectFailure: input.projectFailure
  });
  return attachPendingWorkspaceMutation(input.result, pending);
}

export async function attachPreparedPatchMutation<T extends object>(
  input: AttachPreparedPatchMutationInput<T>
): Promise<T> {
  const now = input.context.now ?? Date.now;
  const createdAtMs = now();
  const retentionMs = input.context.retentionMs ?? 24 * 60 * 60 * 1_000;
  if (!Number.isSafeInteger(retentionMs) || retentionMs <= 0) {
    throw new Error("Change-set retention is invalid.");
  }
  const createdAt = validTimestamp(createdAtMs, "Change-set creation time");
  const expiresAt = validTimestamp(createdAtMs + retentionMs, "Change-set expiry time");
  const files = input.prepared.operations.map((prepared) => ({
    path: prepared.path,
    before_sha256: prepared.before.sha256,
    after_sha256: prepared.afterSha256
  }));
  const beforeState = input.prepared.operations.every((prepared) => prepared.before.exists)
    ? "present" as const
    : input.prepared.operations.every((prepared) => !prepared.before.exists)
      ? "absent" as const
      : "mixed" as const;

  const pending = await input.runtime.prepare<T>({
    transaction: {
      workspace: input.workspace,
      operations: input.prepared.operations.map((prepared) => prepared.operation)
    },
    changeSet: ({ transactionId, changeSetId, workspaceStateKey }) => {
      const operationEntries = input.prepared.operations.map((prepared) => {
        const before = prepared.before;
        const blobId = before.exists
          ? opaqueBlobId(changeSetId, prepared.operation.operationId)
          : null;
        const afterBytes = prepared.operation.kind === "create" || prepared.operation.kind === "replace"
          ? prepared.operation.bytes.length
          : 0;
        return {
          manifest: {
            operationId: prepared.operation.operationId,
            kind: prepared.operation.kind,
            relativePath: prepared.operation.relativePath,
            destinationRelativePath: null,
            before: before.exists
              ? {
                  exists: true,
                  sha256: before.sha256,
                  bytes: before.bytes?.length ?? 0,
                  metadata: before.metadata
                }
              : {
                  exists: false,
                  sha256: null,
                  bytes: 0,
                  metadata: null
                },
            after: prepared.operation.kind === "delete"
              ? { exists: false, sha256: null, bytes: 0 }
              : {
                  exists: true,
                  sha256: prepared.afterSha256,
                  bytes: afterBytes
                },
            blobId
          },
          blob: blobId && before.bytes && before.sha256
            ? {
                blobId,
                operationId: prepared.operation.operationId,
                beforeSha256: before.sha256,
                plaintext: Buffer.from(before.bytes)
              }
            : null
        };
      });
      const plaintextBytes = operationEntries.reduce(
        (total, entry) => total + (entry.blob?.plaintext.length ?? 0),
        0
      );
      const blobs = operationEntries.flatMap((entry) => entry.blob ? [entry.blob] : []);
      return {
        manifest: {
          schemaVersion: 1,
          changeSetId,
          transactionId,
          workspaceStateKey,
          generation: 1,
          createdAt,
          updatedAt: createdAt,
          expiresAt,
          toolName: input.context.toolName,
          requestId: input.context.requestId,
          ownerBinding: input.context.ownerBinding,
          policyRevision: input.context.policyRevision,
          contractVersion: input.context.contractVersion,
          state: "active",
          undoSupported: true,
          undoReason: null,
          operations: operationEntries.map((entry) => entry.manifest),
          plaintextBytes,
          ciphertextBytes: plaintextBytes + blobs.length * 37,
          revertsChangeSetId: null
        },
        blobs
      };
    },
    project: ({ result, committed, changeSet }) => {
      if (!input.project) return result;
      return input.project({
        result,
        files,
        transaction: {
          change_set_id: committed.changeSetId,
          transaction_id: committed.transactionId,
          before_state: beforeState,
          operation_count: committed.operationCount,
          undo_supported: changeSet.undoSupported,
          committed_at: committed.committedAt
        }
      });
    },
    projectFailure: input.projectFailure
  });
  return attachPendingWorkspaceMutation(input.result, pending);
}
