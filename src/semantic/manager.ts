import { createHash, randomUUID } from "node:crypto";
import { redactSensitiveText } from "../redact.js";
import type { CodexGPTConfig } from "../config.js";
import type { PathGuard, Workspace, WorkspaceManager } from "../guard.js";
import { DEFAULT_SEMANTIC_BUDGETS } from "./budgets.js";
import {
  createTypeScriptWorkerClient,
  type SemanticWorkerHealthRegistry,
  type TypeScriptWorkerClient
} from "./builtin/typescriptProvider.js";
import { loadTypeScriptLibraryAssets } from "./builtin/typescriptAssets.js";
import { semanticCoreStatus } from "./status.js";
import { createLineIndex, publicPositionToOffset } from "./positions.js";
import {
  SemanticPreviewStore,
  SemanticPreviewUnavailableError,
  type SemanticPreviewPlan
} from "./previewStore.js";
import {
  revalidateSemanticProject,
  revalidateSemanticSnapshots,
  resolveSemanticProject,
  type SemanticProject
} from "./projectResolver.js";
import type {
  SemanticDiagnostic,
  SemanticLocation,
  SemanticSourceSnapshot,
  SemanticTextEdit
} from "./types.js";

type SemanticLocator =
  | { kind: "position"; path: string; line: number; column: number }
  | { kind: "symbol"; symbol: string; path_hint?: string };

export type SemanticManagerRequest =
  | { operation: "definition" | "references"; locator: SemanticLocator; include_declaration?: boolean; max_results?: number }
  | { operation: "diagnostics"; path: string; severity?: string; max_results?: number }
  | { operation: "rename_preview"; locator: SemanticLocator; new_name: string; max_preview_chars?: number };

function locationForOffset(snapshot: SemanticSourceSnapshot, start: number, length: number): SemanticLocation {
  const index = createLineIndex(snapshot.utf8Text);
  const startPosition = (() => {
    const before = snapshot.utf8Text.slice(0, start);
    const lines = before.split("\n");
    return { line: lines.length, column: [...lines[lines.length - 1].replace(/^\uFEFF/u, "")].length + 1 };
  })();
  const endPosition = (() => {
    const before = snapshot.utf8Text.slice(0, start + length);
    const lines = before.split("\n");
    return { line: lines.length, column: [...lines[lines.length - 1].replace(/^\uFEFF/u, "")].length + 1 };
  })();
  publicPositionToOffset(index, startPosition);
  publicPositionToOffset(index, endPosition);
  const lineStart = snapshot.utf8Text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEnd = snapshot.utf8Text.indexOf("\n", start);
  return {
    path: snapshot.relativePath,
    range: { start: startPosition, end: endPosition },
    preview: snapshot.utf8Text.slice(lineStart, lineEnd === -1 ? snapshot.utf8Text.length : lineEnd).replace(/\r$/u, "").trim().slice(0, 400)
  };
}

function declarationCandidates(
  snapshots: readonly SemanticSourceSnapshot[],
  symbol: string,
  pathHint?: string
): { candidates: SemanticLocation[]; omitted: number } {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const patterns = [
    new RegExp(`\\b(?:function|class|interface|type|enum|namespace|module)\\s+(${escaped})\\b`, "gu"),
    new RegExp(`\\b(?:const|let|var)\\s+(${escaped})\\b`, "gu")
  ];
  const candidates: SemanticLocation[] = [];
  for (const snapshot of snapshots) {
    if (pathHint && snapshot.relativePath !== pathHint && !snapshot.relativePath.startsWith(`${pathHint.replace(/\/$/u, "")}/`)) continue;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of snapshot.utf8Text.matchAll(pattern)) {
        const full = match[0];
        const local = full.lastIndexOf(symbol);
        candidates.push(locationForOffset(snapshot, (match.index ?? 0) + local, symbol.length));
      }
    }
  }
  const unique = new Map(candidates.map((candidate) => [
    `${candidate.path}:${candidate.range.start.line}:${candidate.range.start.column}`,
    candidate
  ]));
  const complete = [...unique.values()];
  return { candidates: complete.slice(0, 50), omitted: Math.max(0, complete.length - 50) };
}

function isSemanticRequestError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  return /Invalid public position|Target source is unavailable|requested TypeScript identifier is invalid|selected symbol cannot be renamed|requested rename would create invalid TypeScript or JavaScript syntax/i.test(error.message);
}

export function applySemanticEdits(snapshot: SemanticSourceSnapshot, edits: readonly SemanticTextEdit[]): string {
  const sorted = [...edits].sort((left, right) => right.start - left.start || right.length - left.length);
  let previousStart = snapshot.utf8Text.length + 1;
  let text = snapshot.utf8Text;
  for (const edit of sorted) {
    if (
      !Number.isSafeInteger(edit.start) ||
      !Number.isSafeInteger(edit.length) ||
      edit.start < 0 ||
      edit.length < 0 ||
      edit.start + edit.length > snapshot.utf8Text.length ||
      edit.start + edit.length > previousStart
    ) {
      throw new Error("Semantic Provider returned overlapping or invalid edits.");
    }
    previousStart = edit.start;
    text = `${text.slice(0, edit.start)}${edit.newText}${text.slice(edit.start + edit.length)}`;
  }
  return text;
}

export class SemanticProviderManager {
  readonly previews: SemanticPreviewStore;
  private readonly worker: TypeScriptWorkerClient;
  private readonly disposal = new Set<Promise<void>>();
  private readonly revokedWorkspaces = new Set<string>();
  private readonly activeCancellations = new Map<string, Set<() => void>>();
  private readonly projectCache = new Map<string, {
    bindingDigest: string;
    project: Promise<SemanticProject>;
  }>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly config: CodexGPTConfig,
    private readonly guard: PathGuard,
    private readonly workspaces: WorkspaceManager,
    options: {
      worker?: TypeScriptWorkerClient;
      previews?: SemanticPreviewStore;
      workerHealth?: SemanticWorkerHealthRegistry;
    } = {}
  ) {
    this.worker = options.worker ?? createTypeScriptWorkerClient({
      timeoutMs: DEFAULT_SEMANTIC_BUDGETS.workerTimeoutMs,
      maxQueue: DEFAULT_SEMANTIC_BUDGETS.maxQueue,
      maxResponseBytes: DEFAULT_SEMANTIC_BUDGETS.maxWorkerResponseBytes,
      healthRegistry: options.workerHealth
    });
    this.previews = options.previews ?? new SemanticPreviewStore();
    this.unsubscribe = this.workspaces.onWorkspaceRevoked(({ id, reason }) => {
      this.revokedWorkspaces.add(id);
      if (reason !== "transport_closed") this.previews.invalidateWorkspace(id);
      this.projectCache.delete(id);
      this.worker.cancelScope?.(id);
      for (const cancel of this.activeCancellations.get(id) ?? []) cancel();
      this.activeCancellations.delete(id);
    });
  }

  async execute(workspace: Workspace, request: SemanticManagerRequest): Promise<any> {
    if (this.config.semanticProvider === "none") {
      return this.envelope(request.operation, "unknown", "none", "unsupported", "lexical", {
        locations: []
      }, 0, false, "Enable builtin semantics locally and restart.", "PROVIDER_DISABLED");
    }
    const requiredPath = request.operation === "diagnostics"
      ? this.guard.resolve(workspace, request.path).relPath
      : request.locator.kind === "position"
        ? this.guard.resolve(workspace, request.locator.path).relPath
        : request.locator.path_hint
          ? this.guard.resolve(workspace, request.locator.path_hint).relPath
          : undefined;
    const includeDependencies = !(request.operation === "definition" && request.locator.kind === "symbol");
    const project = await this.resolveProject(
      workspace,
      requiredPath,
      includeDependencies
    );
    if (this.revokedWorkspaces.has(workspace.id)) {
      throw new Error("Semantic workspace is unavailable.");
    }
    const byPath = new Map(project.snapshots.map((snapshot) => [snapshot.relativePath, snapshot]));
    const hintedSnapshot = requiredPath ? byPath.get(requiredPath) : undefined;
    if (
      request.operation !== "diagnostics" &&
      request.locator.kind === "symbol" &&
      hintedSnapshot &&
      !["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(hintedSnapshot.language)
    ) {
      return this.lexicalFallback(project.snapshots, request, hintedSnapshot);
    }
    const target = request.operation === "diagnostics"
      ? { path: requiredPath!, line: 1, column: 1 }
      : request.locator.kind === "position"
        ? { path: requiredPath!, line: request.locator.line, column: request.locator.column }
        : this.resolveSymbol(project.snapshots, request.locator.symbol, requiredPath);
    if ("candidates" in target && target.candidates.length === 0) {
      return this.envelope(request.operation, "typescript", "builtin-typescript", "ready", "semantic", {
        locations: []
      }, project.omittedCount, project.partial || project.dependencyPartial, "Use a path and position, or verify the symbol spelling.", "SYMBOL_NOT_FOUND");
    }
    if ("candidates" in target) {
      return this.envelope(request.operation, "typescript", "builtin-typescript", "ready", "semantic", {
        candidates: target.candidates,
        needs_disambiguation: true
      }, project.omittedCount + target.omitted, project.partial || project.dependencyPartial || target.omitted > 0, "Choose one candidate path and position.", "NEEDS_DISAMBIGUATION");
    }
    if (request.operation === "rename_preview" && (project.partial || project.dependencyPartial)) {
      throw new Error("Semantic rename requires complete project coverage; no preview was created.");
    }
    const targetSnapshot = byPath.get(target.path);
    if (!targetSnapshot) throw new Error("Semantic target source is unavailable.");
    if (!["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(targetSnapshot.language)) {
      return this.lexicalFallback(project.snapshots, request, targetSnapshot);
    }
    const workspaceCompilerSnapshots = project.snapshots
      .filter((snapshot) => ["typescript", "typescriptreact", "javascript", "javascriptreact", "json"].includes(snapshot.language));
    const selectedSnapshots = request.operation === "definition" && request.locator.kind === "symbol"
      ? [targetSnapshot]
      : workspaceCompilerSnapshots;
    const libraryAssets = request.operation === "diagnostics"
      ? await loadTypeScriptLibraryAssets()
      : null;
    const files = [
      ...selectedSnapshots.map((snapshot) => ({ path: snapshot.relativePath, text: snapshot.utf8Text })),
      ...(libraryAssets?.files ?? [])
    ];
    const healthScopeId = this.workspaces.workspaceAuthorityDigest(workspace.id);
    let response: any;
    try {
      response = await this.workspaceRequest(workspace.id, healthScopeId, {
          operation: request.operation,
          files,
          target,
          includeDeclaration: request.operation === "references" ? request.include_declaration !== false : undefined,
          newName: request.operation === "rename_preview" ? request.new_name : undefined
        });
    } catch (error) {
      if (isSemanticRequestError(error)) throw error;
      const status = this.worker.status(healthScopeId);
      const emptyResult = request.operation === "diagnostics"
        ? { diagnostics: [] }
        : { locations: [] };
      return {
        ...this.envelope(
          request.operation,
          targetSnapshot.language,
          "builtin-typescript",
          status.state === "cooldown" ? "cooldown" : "unavailable",
          "semantic",
          emptyResult,
          0,
          false,
          status.retryAfterMs > 0
            ? `Retry after ${status.retryAfterMs} ms; ordinary search and read remain available.`
            : "Inspect server_config semanticState, then retry once; ordinary search and read remain available.",
          status.state === "cooldown" ? "WORKER_COOLDOWN" : "WORKER_UNAVAILABLE"
        ),
        ...(status.retryAfterMs > 0 ? { retry_after_ms: status.retryAfterMs } : {})
      };
    }
    if (!await revalidateSemanticSnapshots(this.config, workspace, selectedSnapshots)) {
      this.projectCache.delete(workspace.id);
      throw new Error("Semantic source changed during analysis.");
    }
    if (request.operation === "rename_preview") {
      return this.renameEnvelope(workspace, project.snapshots, request, response);
    }
    const limit = Math.min(request.max_results ?? DEFAULT_SEMANTIC_BUDGETS.maxResults, DEFAULT_SEMANTIC_BUDGETS.maxResults);
    if (request.operation === "diagnostics") {
      let diagnostics = this.normalizeDiagnostics(response.diagnostics, byPath);
      if (request.severity) diagnostics = diagnostics.filter((diagnostic) => diagnostic.severity === request.severity);
      const omitted = Math.max(0, diagnostics.length - limit) + project.omittedCount;
      return this.envelope(request.operation, targetSnapshot.language, "builtin-typescript", "ready", "semantic", {
        diagnostics: diagnostics.slice(0, limit)
      }, omitted, omitted > 0, "Continue with the returned diagnostics.");
    }
    const locations = this.normalizeLocations(response.locations, byPath);
    const omitted = Math.max(0, locations.length - limit) + project.omittedCount;
    return this.envelope(request.operation, targetSnapshot.language, "builtin-typescript", "ready", "semantic", {
      locations: locations.slice(0, limit)
    }, omitted, omitted > 0, "Continue with the returned semantic locations.");
  }

  async dispose(): Promise<void> {
    this.unsubscribe();
    for (const cancellations of this.activeCancellations.values()) {
      for (const cancel of cancellations) cancel();
    }
    this.activeCancellations.clear();
    this.projectCache.clear();
    await this.worker.dispose();
    await Promise.allSettled([...this.disposal]);
  }

  private workspaceRequest(
    workspaceId: string,
    healthScopeId: string,
    request: Omit<Parameters<TypeScriptWorkerClient["request"]>[0], "scopeId" | "healthScopeId">
  ): Promise<any> {
    if (this.revokedWorkspaces.has(workspaceId)) {
      return Promise.reject(new Error("Semantic workspace is unavailable."));
    }
    return new Promise((resolve, reject) => {
      const cancellations = this.activeCancellations.get(workspaceId) ?? new Set<() => void>();
      let settled = false;
      const cancel = () => {
        if (settled) return;
        settled = true;
        cancellations.delete(cancel);
        reject(new Error("Semantic workspace is unavailable."));
      };
      cancellations.add(cancel);
      this.activeCancellations.set(workspaceId, cancellations);
      void this.worker.request({ ...request, scopeId: workspaceId, healthScopeId }).then(
        (value) => {
          if (settled) return;
          settled = true;
          cancellations.delete(cancel);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          cancellations.delete(cancel);
          reject(error);
        }
      );
    });
  }

  resolvePreview(id: string, workspaceId?: string) {
    let workspace: Workspace;
    try {
      workspace = this.workspaces.resolveWorkspace(workspaceId);
    } catch {
      throw new SemanticPreviewUnavailableError();
    }
    const resolved = this.previews.resolve(id);
    if (resolved.plan.workspaceAuthorityDigest !== this.workspaces.workspaceAuthorityDigest(workspace.id)) {
      throw new SemanticPreviewUnavailableError();
    }
    return this.previews.adopt(
      id,
      workspace.id,
      resolved.plan.workspaceAuthorityDigest
    );
  }

  reservePreview(id: string, invocationId: string, workspaceId?: string) {
    const resolved = this.resolvePreview(id, workspaceId);
    const plan = this.previews.reserve(id, invocationId, resolved.workspaceId);
    return { ...resolved, plan };
  }

  invalidateWorkspace(workspaceId: string): void {
    this.projectCache.delete(workspaceId);
    this.previews.invalidateWorkspace(workspaceId);
  }

  runtimeStatus() {
    const configured = semanticCoreStatus(this.config.semanticProvider);
    const worker = this.worker.status();
    if (configured.state !== "ready") return { ...configured, retryAfterMs: 0 };
    if (worker.state === "cooldown") {
      return {
        ...configured,
        state: "cooldown" as const,
        nextAction: `Retry after ${worker.retryAfterMs} ms; ordinary tools remain available.`,
        retryAfterMs: worker.retryAfterMs
      };
    }
    if (worker.state === "unavailable" || worker.state === "disposed") {
      return {
        ...configured,
        state: "unavailable" as const,
        nextAction: "Restart CodexGPT if one retry does not recover the owned worker.",
        retryAfterMs: 0
      };
    }
    return { ...configured, retryAfterMs: 0 };
  }

  private async resolveProject(
    workspace: Workspace,
    requiredPath?: string,
    includeDependencies = true
  ): Promise<SemanticProject> {
    const bindingDigest = this.workspaces.workspaceBindingDigest(workspace.id);
    const cached = this.projectCache.get(workspace.id);
    if (cached && cached.bindingDigest === bindingDigest) {
      const project = await cached.project;
      if (!requiredPath || project.snapshots.some((snapshot) => snapshot.relativePath === requiredPath)) {
        const revalidated = await revalidateSemanticProject(this.config, workspace, project, {
          requiredPath,
          includeDependencies
        });
        if (revalidated) {
          this.projectCache.set(workspace.id, {
            bindingDigest,
            project: Promise.resolve(revalidated)
          });
          return revalidated;
        }
      }
    }
    const project = resolveSemanticProject(this.config, workspace, { requiredPath });
    this.projectCache.set(workspace.id, {
      bindingDigest,
      project
    });
    try {
      return await project;
    } catch (error) {
      this.projectCache.delete(workspace.id);
      throw error;
    }
  }

  assertReservation(id: string, invocationId: string, workspaceId: string): SemanticPreviewPlan {
    const plan = this.previews.assertReserved(id, invocationId, workspaceId);
    if (plan.workspaceAuthorityDigest !== this.workspaces.workspaceAuthorityDigest(workspaceId)) {
      this.previews.burn(id, invocationId);
      throw new SemanticPreviewUnavailableError();
    }
    return plan;
  }

  private resolveSymbol(snapshots: readonly SemanticSourceSnapshot[], symbol: string, pathHint?: string) {
    const resolved = declarationCandidates(snapshots, symbol, pathHint);
    if (resolved.candidates.length !== 1 || resolved.omitted > 0) return resolved;
    return {
      path: resolved.candidates[0].path,
      line: resolved.candidates[0].range.start.line,
      column: resolved.candidates[0].range.start.column
    };
  }

  private normalizeLocations(locations: any[], byPath: Map<string, SemanticSourceSnapshot>): SemanticLocation[] {
    if (!Array.isArray(locations)) throw new Error("Semantic Provider returned malformed locations.");
    return locations.map((location) => {
      const snapshot = byPath.get(String(location.path));
      if (!snapshot) throw new Error("Semantic Provider returned a path outside the authorized project.");
      const index = createLineIndex(snapshot.utf8Text);
      const start = publicPositionToOffset(index, location.range.start);
      const end = publicPositionToOffset(index, location.range.end);
      if (start > end) throw new Error("Semantic Provider returned an inverted range.");
      return {
        path: snapshot.relativePath,
        range: location.range,
        preview: redactSensitiveText(String(location.preview ?? "").replace(/[\r\n]+/gu, " ").slice(0, 400)),
        ...(location.declaration === undefined ? {} : { declaration: Boolean(location.declaration) })
      };
    });
  }

  private normalizeDiagnostics(diagnostics: any[], byPath: Map<string, SemanticSourceSnapshot>): SemanticDiagnostic[] {
    if (!Array.isArray(diagnostics)) throw new Error("Semantic Provider returned malformed diagnostics.");
    return diagnostics.map((diagnostic) => {
      const snapshot = byPath.get(String(diagnostic.path));
      if (!snapshot) throw new Error("Semantic Provider returned a diagnostic outside the authorized project.");
      const index = createLineIndex(snapshot.utf8Text);
      const start = publicPositionToOffset(index, diagnostic.range.start);
      const end = publicPositionToOffset(index, diagnostic.range.end);
      if (start > end) throw new Error("Semantic Provider returned an inverted diagnostic range.");
      return {
        path: snapshot.relativePath,
        range: diagnostic.range,
        severity: diagnostic.severity,
        code: String(diagnostic.code).slice(0, 80),
        message: redactSensitiveText(String(diagnostic.message).replace(/[\r\n]+/gu, " ").slice(0, 1_000))
      };
    });
  }

  private renameEnvelope(
    workspace: Workspace,
    snapshots: readonly SemanticSourceSnapshot[],
    request: Extract<SemanticManagerRequest, { operation: "rename_preview" }>,
    response: any
  ) {
    const byPath = new Map(snapshots.map((snapshot) => [snapshot.relativePath, snapshot]));
    if (!Array.isArray(response.edits) || response.edits.length < 1) throw new Error("Semantic rename returned no complete edits.");
    if (response.edits.length > 5_000) throw new Error("Semantic rename exceeded the edit limit.");
    const grouped = new Map<string, SemanticTextEdit[]>();
    for (const raw of response.edits) {
      const snapshot = byPath.get(String(raw.path));
      if (!snapshot) throw new Error("Semantic rename returned an outside path.");
      if (snapshot.relativePath.replace(/\\/gu, "/").startsWith("node_modules/")) {
        throw new Error("Semantic rename returned a dependency path.");
      }
      const edit: SemanticTextEdit = {
        path: snapshot.relativePath,
        start: Number(raw.start),
        length: Number(raw.length),
        newText: String(raw.newText)
      };
      if (edit.newText.length > 512 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(edit.newText)) {
        throw new Error("Semantic Provider returned an invalid edit payload.");
      }
      const current = grouped.get(snapshot.relativePath) ?? [];
      current.push(edit);
      grouped.set(snapshot.relativePath, current);
    }
    const files = [...grouped].map(([relativePath, edits]) => {
      const snapshot = byPath.get(relativePath)!;
      const ordered = [...edits].sort((left, right) => left.start - right.start || left.length - right.length);
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        if (
          current.start < previous.start + previous.length ||
          (current.start === previous.start && (current.length === 0 || previous.length === 0))
        ) {
          throw new Error("Semantic Provider returned overlapping or duplicate edits.");
        }
      }
      const resultingText = applySemanticEdits(snapshot, edits);
      return {
        snapshot,
        edits: Object.freeze(edits),
        resultingText,
        resultingSha256: createHash("sha256").update(resultingText, "utf8").digest("hex")
      };
    });
    const plan: SemanticPreviewPlan = Object.freeze({
      workspaceId: workspace.id,
      workspaceBindingDigest: this.workspaces.workspaceBindingDigest(workspace.id),
      workspaceAuthorityDigest: this.workspaces.workspaceAuthorityDigest(workspace.id),
      providerGeneration: this.worker.generation,
      providerFacts: Object.freeze({
        provider: String(response.provider),
        engineVersion: String(response.engineVersion)
      }),
      oldName: String(response.oldName),
      newName: request.new_name,
      files: Object.freeze(files)
    });
    const publicPreview = this.previews.create(
      plan,
      request.max_preview_chars ?? DEFAULT_SEMANTIC_BUDGETS.maxPreviewChars
    );
    return this.envelope("rename_preview", "typescript", "builtin-typescript", "ready", "semantic", publicPreview, 0, false, "Review the preview, then apply the opaque preview id exactly once.");
  }

  private lexicalFallback(
    snapshots: readonly SemanticSourceSnapshot[],
    request: SemanticManagerRequest,
    target: SemanticSourceSnapshot
  ) {
    if (request.operation === "diagnostics" || request.operation === "rename_preview") {
      return this.envelope(request.operation, target.language, "builtin-lexical", "unsupported", "lexical",
        request.operation === "diagnostics" ? { diagnostics: [] } : { locations: [] },
        0, false, "Use text search or configure a reviewed semantic Provider.", "CAPABILITY_UNSUPPORTED");
    }
    const symbol = request.locator.kind === "symbol"
      ? request.locator.symbol
      : (() => {
          const index = createLineIndex(target.utf8Text);
          const offset = publicPositionToOffset(index, { line: request.locator.line, column: request.locator.column });
          const match = target.utf8Text.slice(offset).match(/^[\p{L}\p{N}_$]+/u);
          return match?.[0] ?? "";
        })();
    const locations: SemanticLocation[] = [];
    if (symbol) {
      const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const pattern = new RegExp(`\\b${escaped}\\b`, "gu");
      for (const snapshot of snapshots) {
        for (const match of snapshot.utf8Text.matchAll(pattern)) {
          locations.push(locationForOffset(snapshot, match.index ?? 0, symbol.length));
          if (locations.length >= DEFAULT_SEMANTIC_BUDGETS.maxResults) break;
        }
      }
    }
    return this.envelope(request.operation, target.language, "builtin-lexical", "fallback", "lexical", {
      locations
    }, 0, false, "Treat these as lexical candidates and verify before editing.", "SEMANTIC_UNSUPPORTED");
  }

  private envelope(
    capability: SemanticManagerRequest["operation"],
    language: string,
    actualProvider: "builtin-typescript" | "builtin-lexical" | "none",
    state: "ready" | "fallback" | "unsupported" | "cooldown" | "unavailable",
    quality: "semantic" | "lexical",
    result: any,
    omittedCount: number,
    partial: boolean,
    nextAction: string,
    reasonCode?: string
  ) {
    return {
      requested_provider: this.config.semanticProvider,
      actual_provider: actualProvider,
      state,
      capability,
      language,
      partial,
      omitted_count: omittedCount,
      returned_count: Array.isArray(result.locations)
        ? result.locations.length
        : Array.isArray(result.diagnostics)
          ? result.diagnostics.length
          : Array.isArray(result.candidates)
            ? result.candidates.length
            : typeof result.edit_count === "number"
              ? result.edit_count
              : 0,
      result_quality: quality,
      next_action: nextAction,
      ...(reasonCode ? { reason_code: reasonCode } : {}),
      result
    };
  }
}

export function semanticInvocationId(): string {
  return `semantic-${randomUUID()}`;
}
