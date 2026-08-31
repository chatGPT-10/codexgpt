import type { SearchOptions, SearchResult } from "../searchOps.js";
import type { PathGuard, Workspace } from "../guard.js";
import type { CodexGPTConfig } from "../config.js";

export type NavigationIntent =
  | "definition"
  | "references"
  | "implementation"
  | "text"
  | "file"
  | "diagnostics";

export type NavigationProvider =
  | "builtin-typescript"
  | "builtin-lexical"
  | "ripgrep"
  | "node"
  | "builtin-file-index"
  | "none";

export type NavigationQuality = "semantic" | "lexical" | "lexical_fallback" | "unavailable";

export interface NavigationRequest {
  intent: NavigationIntent;
  query?: string;
  path?: string;
  severity?: "error" | "warning" | "information" | "hint";
  include_declaration?: boolean;
  max_results?: number;
  workspace_id?: string;
}

export interface NavigationMatch {
  path: string;
  line: number;
  column?: number;
  kind: NavigationIntent | "candidate";
  symbol?: string;
  preview: string;
  declaration?: boolean;
  severity?: "error" | "warning" | "information" | "hint";
  code?: string;
}

export interface NavigationResult {
  intent: NavigationIntent;
  query: string;
  matches: NavigationMatch[];
  provider: NavigationProvider;
  quality: NavigationQuality;
  fallback: boolean;
  truncated: boolean;
}

export type NavigationSearchProvider = (
  config: CodexGPTConfig,
  guard: PathGuard,
  workspace: Workspace,
  options: Partial<SearchOptions>
) => Promise<SearchResult>;

export type NavigationFileProvider = (
  guard: PathGuard,
  workspace: Workspace,
  options: { root?: string; glob?: string; includeHidden?: boolean; maxFiles: number }
) => Promise<string[]>;
