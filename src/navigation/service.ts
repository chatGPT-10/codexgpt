import path from "node:path";
import type { CodexGPTConfig } from "../config.js";
import type { PathGuard, Workspace } from "../guard.js";
import { listFiles } from "../fsOps.js";
import { redactSensitiveText } from "../redact.js";
import { searchWorkspace } from "../searchOps.js";
import type { SemanticProviderManager } from "../semantic/manager.js";
import type {
  NavigationFileProvider,
  NavigationIntent,
  NavigationMatch,
  NavigationProvider,
  NavigationQuality,
  NavigationRequest,
  NavigationResult,
  NavigationSearchProvider
} from "./types.js";

const DEFAULT_NAVIGATION_RESULTS = 40;
const MAX_NAVIGATION_RESULTS = 200;
const MAX_NAVIGATION_FILES = 20_000;

interface NavigationServiceOptions {
  search?: NavigationSearchProvider;
  listFiles?: NavigationFileProvider;
}

interface NavigationEnvelope {
  requested_provider: "builtin" | "none";
  actual_provider: NavigationProvider;
  state: "ready" | "fallback" | "unsupported" | "cooldown" | "unavailable";
  capability: "navigate";
  language: string;
  partial: boolean;
  omitted_count: number;
  returned_count: number;
  result_quality: "semantic" | "lexical";
  next_action: string;
  reason_code?: string;
  result: NavigationResult;
}

function safePreview(value: unknown): string {
  return redactSensitiveText(String(value ?? "").replace(/[\r\n]+/gu, " ").trim()).slice(0, 400);
}

function safeQuery(value: string | undefined): string {
  return redactSensitiveText(String(value ?? "").replace(/[\r\n]+/gu, " ").trim()).slice(0, 500);
}

function reasonForError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /source|changed|identity/iu.test(message)
    ? "SEMANTIC_SOURCE_CHANGED"
    : "SEMANTIC_ERROR";
}

function navigationLimit(config: Pick<CodexGPTConfig, "maxSearchResults">, request: NavigationRequest): number {
  return Math.max(1, Math.min(
    request.max_results ?? DEFAULT_NAVIGATION_RESULTS,
    config.maxSearchResults,
    MAX_NAVIGATION_RESULTS
  ));
}

function locationMatches(
  intent: Exclude<NavigationIntent, "text" | "file" | "diagnostics">,
  query: string,
  locations: readonly any[],
  kind: NavigationMatch["kind"] = intent
): NavigationMatch[] {
  return locations.map((location) => ({
    path: String(location.path),
    line: Number(location.range.start.line),
    column: Number(location.range.start.column),
    kind,
    symbol: query,
    preview: safePreview(location.preview),
    ...(location.declaration === undefined ? {} : { declaration: Boolean(location.declaration) })
  }));
}

export class NavigationService {
  private readonly searchProvider: NavigationSearchProvider;
  private readonly fileProvider: NavigationFileProvider;

  constructor(
    private readonly config: CodexGPTConfig,
    private readonly guard: PathGuard,
    private readonly semantic: Pick<SemanticProviderManager, "execute">,
    options: NavigationServiceOptions = {}
  ) {
    this.searchProvider = options.search ?? searchWorkspace;
    this.fileProvider = options.listFiles ?? listFiles;
  }

  async execute(workspace: Workspace, request: NavigationRequest): Promise<NavigationEnvelope> {
    if (request.intent === "text") return this.lexical(workspace, request, false);
    if (request.intent === "file") return this.files(workspace, request);
    if (request.intent === "diagnostics") return this.diagnostics(workspace, request);
    return this.code(workspace, request);
  }

  private async code(
    workspace: Workspace,
    request: NavigationRequest
  ): Promise<NavigationEnvelope> {
    const query = request.query ?? "";
    const intent = request.intent as "definition" | "references" | "implementation";
    const semanticRequest = intent === "references"
      ? {
          operation: "references" as const,
          locator: {
            kind: "symbol" as const,
            symbol: query,
            ...(request.path ? { path_hint: request.path } : {})
          },
          include_declaration: request.include_declaration,
          max_results: navigationLimit(this.config, request)
        }
      : {
          operation: "definition" as const,
          locator: {
            kind: "symbol" as const,
            symbol: query,
            ...(request.path ? { path_hint: request.path } : {})
          },
          max_results: navigationLimit(this.config, request)
        };
    let semanticResult: any;
    try {
      semanticResult = await this.semantic.execute(workspace, semanticRequest);
    } catch (error) {
      return this.lexical(workspace, request, true, reasonForError(error));
    }

    const result = semanticResult?.result ?? {};
    if (semanticResult?.result_quality === "lexical" && Array.isArray(result.locations) && result.locations.length > 0) {
      return this.envelope({
        request,
        actualProvider: semanticResult.actual_provider === "builtin-lexical" ? "builtin-lexical" : "none",
        state: "fallback",
        language: String(semanticResult.language ?? "unknown"),
        quality: "lexical_fallback",
        fallback: true,
        matches: locationMatches(intent, query, result.locations),
        truncated: Boolean(semanticResult.partial),
        omittedCount: Number(semanticResult.omitted_count ?? 0),
        reasonCode: semanticResult.reason_code ?? "SEMANTIC_UNSUPPORTED",
        nextAction: "Treat these as lexical candidates and verify the exact target before editing."
      });
    }

    if (semanticResult?.state === "ready" && semanticResult?.result_quality === "semantic") {
      if (Array.isArray(result.candidates) && result.candidates.length > 0) {
        return this.envelope({
          request,
          actualProvider: "builtin-typescript",
          state: "ready",
          language: String(semanticResult.language ?? "typescript"),
          quality: "semantic",
          fallback: false,
          matches: locationMatches(intent, query, result.candidates, "candidate"),
          truncated: Boolean(semanticResult.partial),
          omittedCount: Number(semanticResult.omitted_count ?? 0),
          reasonCode: semanticResult.reason_code,
          nextAction: "Choose one candidate path, then read its exact range."
        });
      }
      if (Array.isArray(result.locations) && result.locations.length > 0) {
        return this.envelope({
          request,
          actualProvider: "builtin-typescript",
          state: "ready",
          language: String(semanticResult.language ?? "typescript"),
          quality: "semantic",
          fallback: false,
          matches: locationMatches(intent, query, result.locations),
          truncated: Boolean(semanticResult.partial),
          omittedCount: Number(semanticResult.omitted_count ?? 0),
          reasonCode: semanticResult.reason_code,
          nextAction: "Read the exact returned range before reasoning or editing."
        });
      }
    }

    return this.lexical(
      workspace,
      request,
      true,
      String(semanticResult?.reason_code ?? "SEMANTIC_NO_RESULT")
    );
  }

  private async diagnostics(workspace: Workspace, request: NavigationRequest): Promise<NavigationEnvelope> {
    let semanticResult: any;
    try {
      semanticResult = await this.semantic.execute(workspace, {
        operation: "diagnostics",
        path: request.path!,
        severity: request.severity,
        max_results: navigationLimit(this.config, request)
      });
    } catch (error) {
      return this.unavailableDiagnostics(request, reasonForError(error));
    }
    const diagnostics = semanticResult?.result?.diagnostics;
    if (semanticResult?.state !== "ready" || semanticResult?.result_quality !== "semantic" || !Array.isArray(diagnostics)) {
      return this.unavailableDiagnostics(
        request,
        String(semanticResult?.reason_code ?? "SEMANTIC_UNAVAILABLE"),
        semanticResult?.state === "cooldown" ? "cooldown" : "unavailable",
        semanticResult?.actual_provider === "builtin-typescript" ? "builtin-typescript" : "none"
      );
    }
    const matches: NavigationMatch[] = diagnostics.map((diagnostic: any) => ({
      path: String(diagnostic.path),
      line: Number(diagnostic.range.start.line),
      column: Number(diagnostic.range.start.column),
      kind: "diagnostics",
      preview: safePreview(diagnostic.message),
      severity: diagnostic.severity,
      code: String(diagnostic.code).slice(0, 80)
    }));
    return this.envelope({
      request,
      actualProvider: "builtin-typescript",
      state: "ready",
      language: String(semanticResult.language ?? "typescript"),
      quality: "semantic",
      fallback: false,
      matches,
      truncated: Boolean(semanticResult.partial),
      omittedCount: Number(semanticResult.omitted_count ?? 0),
      reasonCode: semanticResult.reason_code,
      nextAction: "Read the exact diagnostic range before changing code."
    });
  }

  private unavailableDiagnostics(
    request: NavigationRequest,
    reasonCode: string,
    state: "cooldown" | "unavailable" = "unavailable",
    actualProvider: NavigationProvider = "none"
  ): NavigationEnvelope {
    return this.envelope({
      request,
      actualProvider,
      state,
      language: "unknown",
      quality: "unavailable",
      fallback: false,
      matches: [],
      truncated: false,
      omittedCount: 0,
      reasonCode,
      nextAction: "Restore the owned semantic provider or run the project diagnostic command; lexical matches are not diagnostics."
    });
  }

  private async lexical(
    workspace: Workspace,
    request: NavigationRequest,
    fallback: boolean,
    reasonCode?: string
  ): Promise<NavigationEnvelope> {
    const query = request.query ?? "";
    let result;
    try {
      result = await this.searchProvider(this.config, this.guard, workspace, {
        query,
        regex: false,
        root: request.path ?? ".",
        includeHidden: false,
        maxResults: navigationLimit(this.config, request),
        ...(request.intent === "references"
          ? { intent: "references" as const, symbol: query }
          : request.intent === "definition" || request.intent === "implementation"
            ? { intent: "symbol" as const, symbol: query }
            : { intent: "text" as const })
      });
    } catch {
      return this.envelope({
        request,
        actualProvider: "none",
        state: "unavailable",
        language: "unknown",
        quality: "unavailable",
        fallback: false,
        matches: [],
        truncated: false,
        omittedCount: 0,
        reasonCode: "LEXICAL_UNAVAILABLE",
        nextAction: "Restore the bounded search backend, then retry the same navigation request."
      });
    }
    const kind: NavigationMatch["kind"] = request.intent === "implementation"
      ? "implementation"
      : request.intent;
    const lexicalMatches = Array.isArray(result.analysis?.matches) && result.analysis.matches.length > 0
      ? result.analysis.matches
      : result.matches;
    const matches: NavigationMatch[] = lexicalMatches.map((match) => ({
      path: match.path,
      line: match.line,
      kind,
      ...(request.intent === "definition" || request.intent === "references" || request.intent === "implementation"
        ? { symbol: query }
        : {}),
      preview: safePreview(match.text)
    }));
    return this.envelope({
      request,
      actualProvider: result.used,
      state: fallback ? "fallback" : "ready",
      language: "unknown",
      quality: fallback ? "lexical_fallback" : "lexical",
      fallback,
      matches,
      truncated: result.truncated || Boolean(result.analysis?.coverage?.truncated),
      omittedCount: 0,
      reasonCode,
      nextAction: fallback
        ? "Treat these as lexical candidates and verify the exact target before editing."
        : "Read the exact returned range if more context is needed."
    });
  }

  private async files(workspace: Workspace, request: NavigationRequest): Promise<NavigationEnvelope> {
    const root = (request.path ?? ".").replace(/\\/gu, "/").replace(/^\.\//u, "").replace(/\/$/u, "");
    let files: string[];
    try {
      files = await this.fileProvider(this.guard, workspace, {
        root: request.path ?? ".",
        includeHidden: false,
        maxFiles: MAX_NAVIGATION_FILES
      });
    } catch {
      return this.envelope({
        request,
        actualProvider: "none",
        state: "unavailable",
        language: "unknown",
        quality: "unavailable",
        fallback: false,
        matches: [],
        truncated: false,
        omittedCount: 0,
        reasonCode: "FILE_INDEX_UNAVAILABLE",
        nextAction: "Verify the workspace-relative path, then retry bounded file discovery."
      });
    }
    const needle = (request.query ?? "").toLocaleLowerCase("en-US");
    const filtered = files
      .map((file) => file.replace(/\\/gu, "/"))
      .filter((file) => root === "." || root === "" || file === root || file.startsWith(`${root}/`))
      .filter((file) => file.toLocaleLowerCase("en-US").includes(needle) || path.posix.basename(file).toLocaleLowerCase("en-US").includes(needle))
      .sort((left, right) => left.localeCompare(right, "en-US"));
    const limit = navigationLimit(this.config, request);
    const matches: NavigationMatch[] = filtered.slice(0, limit).map((file) => ({
      path: file,
      line: 1,
      kind: "file",
      preview: file
    }));
    return this.envelope({
      request,
      actualProvider: "builtin-file-index",
      state: "ready",
      language: "unknown",
      quality: "lexical",
      fallback: false,
      matches,
      truncated: filtered.length > limit || files.length >= MAX_NAVIGATION_FILES,
      omittedCount: Math.max(0, filtered.length - matches.length),
      nextAction: "Read the selected file or request a semantic definition/reference lookup inside it."
    });
  }

  private envelope(input: {
    request: NavigationRequest;
    actualProvider: NavigationProvider;
    state: NavigationEnvelope["state"];
    language: string;
    quality: NavigationQuality;
    fallback: boolean;
    matches: NavigationMatch[];
    truncated: boolean;
    omittedCount: number;
    nextAction: string;
    reasonCode?: string;
  }): NavigationEnvelope {
    const limit = navigationLimit(this.config, input.request);
    const boundedMatches = input.matches.filter((match) => (
      match.path.length <= 240 &&
      Number.isSafeInteger(match.line) &&
      match.line > 0 &&
      (match.column === undefined || (Number.isSafeInteger(match.column) && match.column > 0)) &&
      (match.symbol === undefined || match.symbol.length <= 200)
    ));
    const matches = boundedMatches.slice(0, limit);
    const locallyOmitted = Math.max(0, input.matches.length - matches.length);
    const truncated = input.truncated || locallyOmitted > 0;
    const result: NavigationResult = {
      intent: input.request.intent,
      query: safeQuery(input.request.query),
      matches,
      provider: input.actualProvider,
      quality: input.quality,
      fallback: input.fallback,
      truncated
    };
    return {
      requested_provider: this.config.semanticProvider,
      actual_provider: input.actualProvider,
      state: input.state,
      capability: "navigate",
      language: input.language,
      partial: truncated,
      omitted_count: Math.max(0, input.omittedCount + locallyOmitted),
      returned_count: result.matches.length,
      result_quality: input.quality === "semantic" ? "semantic" : "lexical",
      next_action: input.nextAction,
      ...(input.reasonCode ? { reason_code: input.reasonCode.slice(0, 80) } : {}),
      result
    };
  }
}
