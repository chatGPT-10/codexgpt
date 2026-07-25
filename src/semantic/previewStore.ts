import { createHash, randomBytes } from "node:crypto";
import type { SemanticAuditFactsV1 } from "../audit/types.js";
import { createSemanticDiffPreview } from "./diffPreview.js";
import type { SemanticSourceSnapshot, SemanticTextEdit } from "./types.js";

export interface SemanticPreviewFile {
  snapshot: SemanticSourceSnapshot;
  edits: readonly SemanticTextEdit[];
  resultingText: string;
  resultingSha256: string;
}

export interface SemanticPreviewPlan {
  workspaceId: string;
  workspaceBindingDigest: string;
  workspaceAuthorityDigest: string;
  providerGeneration: number;
  providerFacts: {
    provider: string;
    engineVersion: string;
  };
  oldName: string;
  newName: string;
  files: readonly SemanticPreviewFile[];
}

interface StoredPreview {
  id: string;
  plan: SemanticPreviewPlan;
  holderWorkspaceId: string;
  manifestDigest: string;
  semanticFactsDigest: string;
  semanticAuditFacts: SemanticAuditFactsV1;
  createdMonotonicMs: number;
  expiresAtWallMs: number;
  state: "ready" | "reserved" | "consumed" | "burned";
  invocationId: string | null;
  bytes: number;
}

export class SemanticPreviewUnavailableError extends Error {
  readonly code = "SEMANTIC_PREVIEW_STALE";

  constructor() {
    super("Semantic preview is unavailable or stale. Create a fresh rename preview, then retry apply_patch once.");
    this.name = "SemanticPreviewUnavailableError";
  }
}

export function isSemanticPreviewUnavailableError(error: unknown): error is SemanticPreviewUnavailableError {
  return error instanceof SemanticPreviewUnavailableError;
}

export interface SemanticPreviewStoreOptions {
  ttlMs?: number;
  maxPerWorkspace?: number;
  maxTotalBytes?: number;
  monotonicNow?: () => number;
  wallNow?: () => number;
  random?: (size: number) => Buffer;
}

function stableManifest(plan: SemanticPreviewPlan): string {
  return JSON.stringify({
    workspaceId: plan.workspaceId,
    workspaceBindingDigest: plan.workspaceBindingDigest,
    workspaceAuthorityDigest: plan.workspaceAuthorityDigest,
    providerGeneration: plan.providerGeneration,
    providerFacts: plan.providerFacts,
    oldName: plan.oldName,
    newName: plan.newName,
    files: plan.files.map((file) => ({
      path: file.snapshot.relativePath,
      canonicalPathKey: file.snapshot.canonicalPathKey,
      canonicalParentPathKey: file.snapshot.canonicalParentPathKey,
      parentIdentity: file.snapshot.parentIdentity,
      identity: file.snapshot.stableIdentity,
      expectedSha256: file.snapshot.sha256,
      resultingSha256: file.resultingSha256,
      edits: file.edits.map((edit) => ({
        start: edit.start,
        length: edit.length,
        newText: edit.newText
      }))
    }))
  });
}

function immutablePlan(input: SemanticPreviewPlan): SemanticPreviewPlan {
  const editCount = input.files.reduce((total, file) => total + file.edits.length, 0);
  if (input.files.length < 1 || input.files.length > 64 || editCount < 1 || editCount > 5_000) {
    throw new Error("Semantic preview exceeds the atomic rename limit.");
  }
  return Object.freeze({
    workspaceId: input.workspaceId,
    workspaceBindingDigest: input.workspaceBindingDigest,
    workspaceAuthorityDigest: input.workspaceAuthorityDigest,
    providerGeneration: input.providerGeneration,
    providerFacts: Object.freeze({ ...input.providerFacts }),
    oldName: input.oldName,
    newName: input.newName,
    files: Object.freeze(input.files.map((file) => Object.freeze({
      snapshot: Object.freeze({
        ...file.snapshot,
        stableIdentity: Object.freeze({ ...file.snapshot.stableIdentity }),
        lineIndex: Object.freeze([...(file.snapshot.lineIndex ?? [])])
      }),
      edits: Object.freeze(file.edits.map((edit) => Object.freeze({ ...edit }))),
      resultingText: file.resultingText,
      resultingSha256: file.resultingSha256
    })))
  });
}

export class SemanticPreviewStore {
  private readonly previews = new Map<string, StoredPreview>();
  private readonly ttlMs: number;
  private readonly maxPerWorkspace: number;
  private readonly maxTotalBytes: number;
  private readonly monotonicNow: () => number;
  private readonly wallNow: () => number;
  private readonly random: (size: number) => Buffer;

  constructor(options: SemanticPreviewStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 15 * 60_000;
    this.maxPerWorkspace = options.maxPerWorkspace ?? 20;
    this.maxTotalBytes = options.maxTotalBytes ?? 16 * 1024 * 1024;
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.wallNow = options.wallNow ?? Date.now;
    this.random = options.random ?? randomBytes;
  }

  create(plan: SemanticPreviewPlan, maxPreviewChars: number) {
    plan = immutablePlan(plan);
    const manifest = stableManifest(plan);
    const bytes = Buffer.byteLength(manifest, "utf8") + plan.files.reduce(
      (total, file) => total +
        Buffer.byteLength(file.snapshot.utf8Text, "utf8") +
        Buffer.byteLength(file.resultingText, "utf8") +
        file.edits.reduce((editTotal, edit) => editTotal + Buffer.byteLength(edit.newText, "utf8") + 32, 0),
      0
    );
    if (bytes > this.maxTotalBytes) throw new Error("Semantic preview is too large.");
    this.evict(plan.workspaceAuthorityDigest, bytes);
    let id = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidate = `sp_${this.random(24).toString("base64url")}`;
      if (!this.previews.has(candidate)) {
        id = candidate;
        break;
      }
    }
    if (!id) throw new Error("Semantic preview identity generation failed.");
    const manifestDigest = createHash("sha256").update(manifest, "utf8").digest("hex");
    const semanticFactsDigest = `sha256:${createHash("sha256")
      .update("codexgpt.semantic.rename.apply.v1\0", "utf8")
      .update(manifestDigest, "utf8")
      .digest("hex")}`;
    const semanticAuditFacts: SemanticAuditFactsV1 = Object.freeze({
      schemaVersion: 1,
      semanticFactsDigest,
      manifestDigest,
      provider: "builtin-typescript",
      engineVersion: plan.providerFacts.engineVersion,
      providerGeneration: plan.providerGeneration,
      workspaceBindingDigest: plan.workspaceBindingDigest,
      affectedFileCount: plan.files.length,
      editCount: plan.files.reduce((total, file) => total + file.edits.length, 0),
      totalAfterBytes: plan.files.reduce((total, file) => total + Buffer.byteLength(file.resultingText, "utf8"), 0),
      files: plan.files.map((file) => Object.freeze({
        pathFingerprint: createHash("sha256").update(file.snapshot.canonicalPathKey, "utf8").digest("hex"),
        expectedSha256: file.snapshot.sha256,
        resultingSha256: file.resultingSha256
      }))
    });
    const createdMonotonicMs = this.monotonicNow();
    const preview: StoredPreview = {
      id,
      plan,
      holderWorkspaceId: plan.workspaceId,
      manifestDigest,
      semanticFactsDigest,
      semanticAuditFacts,
      createdMonotonicMs,
      expiresAtWallMs: this.wallNow() + this.ttlMs,
      state: "ready",
      invocationId: null,
      bytes
    };
    this.previews.set(id, preview);
    const diff = createSemanticDiffPreview(
      plan.files.map((file) => ({
        path: file.snapshot.relativePath,
        before: file.snapshot.utf8Text,
        after: file.resultingText,
        edits: file.edits
      })),
      maxPreviewChars
    );
    return {
      preview_id: id,
      expires_in_seconds: Math.floor(this.ttlMs / 1_000),
      old_name: plan.oldName,
      new_name: plan.newName,
      manifest_digest: manifestDigest,
      affected_file_count: plan.files.length,
      edit_count: plan.files.reduce((total, file) => total + file.edits.length, 0),
      files: plan.files.map((file) => ({ path: file.snapshot.relativePath, edit_count: file.edits.length })),
      diff_preview: diff.text,
      preview_truncated: diff.truncated,
      omitted_preview_chars: diff.omittedChars
    };
  }

  resolve(id: string, workspaceId?: string): Readonly<{
    plan: SemanticPreviewPlan;
    workspaceId: string;
    manifestDigest: string;
    semanticFactsDigest: string;
    semanticAuditFacts: SemanticAuditFactsV1;
  }> {
    const preview = this.lookup(id, workspaceId);
    if (preview.state !== "ready") throw new SemanticPreviewUnavailableError();
    return this.resolved(preview);
  }

  adopt(id: string, workspaceId: string, workspaceAuthorityDigest: string) {
    const preview = this.lookup(id);
    if (
      preview.state !== "ready" ||
      preview.plan.workspaceAuthorityDigest !== workspaceAuthorityDigest
    ) {
      throw new SemanticPreviewUnavailableError();
    }
    preview.holderWorkspaceId = workspaceId;
    return this.resolved(preview);
  }

  reserve(id: string, invocationId: string, workspaceId?: string): SemanticPreviewPlan {
    const preview = this.lookup(id, workspaceId);
    if (preview.state !== "ready") throw new SemanticPreviewUnavailableError();
    preview.state = "reserved";
    preview.invocationId = invocationId;
    return preview.plan;
  }

  assertReserved(
    id: string,
    invocationId: string,
    workspaceId: string
  ): SemanticPreviewPlan {
    const preview = this.lookup(id, workspaceId);
    if (
      preview.state !== "reserved" ||
      preview.invocationId !== invocationId
    ) {
      throw new SemanticPreviewUnavailableError();
    }
    return preview.plan;
  }

  consume(id: string, invocationId: string): void {
    const preview = this.previews.get(id);
    if (!preview || preview.state !== "reserved" || preview.invocationId !== invocationId) return;
    preview.state = "consumed";
    this.previews.delete(id);
  }

  burn(id: string, invocationId?: string): void {
    const preview = this.previews.get(id);
    if (!preview) return;
    if (preview.state === "consumed") return;
    if (invocationId && preview.invocationId && preview.invocationId !== invocationId) return;
    preview.state = "burned";
    this.previews.delete(id);
  }

  invalidateWorkspace(workspaceId: string): void {
    for (const [id, preview] of this.previews) {
      if (preview.holderWorkspaceId === workspaceId) this.previews.delete(id);
    }
  }

  invalidatePaths(workspaceId: string, paths: readonly string[]): void {
    const keys = new Set(paths.map((value) => {
      const normalized = value.replace(/\\/gu, "/");
      return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
    }));
    for (const [id, preview] of this.previews) {
      if (preview.holderWorkspaceId !== workspaceId) continue;
      if (preview.plan.files.some((file) => {
        const relativePath = process.platform === "win32"
          ? file.snapshot.relativePath.toLocaleLowerCase("en-US")
          : file.snapshot.relativePath;
        return keys.has(relativePath);
      })) this.previews.delete(id);
    }
  }

  private resolved(preview: StoredPreview) {
    return {
      plan: preview.plan,
      workspaceId: preview.holderWorkspaceId,
      manifestDigest: preview.manifestDigest,
      semanticFactsDigest: preview.semanticFactsDigest,
      semanticAuditFacts: preview.semanticAuditFacts
    } as const;
  }

  private lookup(id: string, workspaceId?: string): StoredPreview {
    const preview = this.previews.get(id);
    if (!preview || (workspaceId !== undefined && preview.holderWorkspaceId !== workspaceId)) {
      throw new SemanticPreviewUnavailableError();
    }
    if (this.monotonicNow() - preview.createdMonotonicMs >= this.ttlMs) {
      preview.state = "burned";
      this.previews.delete(id);
      throw new SemanticPreviewUnavailableError();
    }
    return preview;
  }

  private evict(workspaceAuthorityDigest: string, incomingBytes: number): void {
    const unused = [...this.previews.values()].filter((preview) => preview.state === "ready");
    const workspacePreviews = [...this.previews.values()]
      .filter((preview) => preview.plan.workspaceAuthorityDigest === workspaceAuthorityDigest);
    const workspaceUnused = workspacePreviews.filter((preview) => preview.state === "ready");
    let workspaceCount = workspacePreviews.length;
    while (workspaceCount >= this.maxPerWorkspace && workspaceUnused.length > 0) {
      const oldest = workspaceUnused.shift();
      if (oldest) {
        this.previews.delete(oldest.id);
        workspaceCount -= 1;
      }
    }
    if (workspaceCount >= this.maxPerWorkspace) {
      throw new Error("Semantic preview workspace storage is full.");
    }
    let total = [...this.previews.values()].reduce((sum, preview) => sum + preview.bytes, 0);
    for (const oldest of unused) {
      if (total + incomingBytes <= this.maxTotalBytes) break;
      this.previews.delete(oldest.id);
      total -= oldest.bytes;
    }
    if (total + incomingBytes > this.maxTotalBytes) throw new Error("Semantic preview storage is full.");
  }
}
