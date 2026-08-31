export type SemanticCapability = "definition" | "references" | "diagnostics" | "rename_preview" | "navigate";
export type SemanticProviderSelection = "builtin" | "none";
export type SemanticActualProvider =
  | "builtin-typescript"
  | "builtin-lexical"
  | "ripgrep"
  | "node"
  | "builtin-file-index"
  | "none";
export type SemanticState = "ready" | "fallback" | "unsupported" | "cooldown" | "unavailable";
export type SemanticResultQuality = "semantic" | "lexical";

export interface SemanticPublicPosition {
  line: number;
  column: number;
}

export interface SemanticPublicRange {
  start: SemanticPublicPosition;
  end: SemanticPublicPosition;
}

export interface StableSemanticFileIdentity {
  dev: string;
  ino: string;
  nlink: number;
}

export interface SemanticSourceSnapshot {
  relativePath: string;
  canonicalPathKey: string;
  canonicalParentPathKey: string;
  parentIdentity: string;
  language: string;
  utf8Text: string;
  sha256: string;
  byteLength: number;
  lineIndex: readonly number[];
  stableIdentity: StableSemanticFileIdentity;
}

export interface SemanticLocation {
  path: string;
  range: SemanticPublicRange;
  preview: string;
  declaration?: boolean;
}

export interface SemanticDiagnostic {
  path: string;
  range: SemanticPublicRange;
  severity: "error" | "warning" | "information" | "hint";
  code: string;
  message: string;
}

export interface SemanticTextEdit {
  path: string;
  start: number;
  length: number;
  newText: string;
}

export interface SemanticEnvelope<T> {
  requested_provider: SemanticProviderSelection;
  actual_provider: SemanticActualProvider;
  state: SemanticState;
  capability: SemanticCapability;
  language: string;
  partial: boolean;
  omitted_count: number;
  returned_count: number;
  result_quality: SemanticResultQuality;
  next_action: string;
  reason_code?: string;
  retry_after_ms?: number;
  result: T;
}
