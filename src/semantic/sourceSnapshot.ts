import { readGuidanceText, type GuidanceReadFailureReason, type GuidanceReadOptions } from "../guidance/safeTextReader.js";
import { createLineIndex } from "./positions.js";
import type { SemanticSourceSnapshot } from "./types.js";

export type SemanticSourceFailureReason =
  | "SOURCE_BLOCKED"
  | "SOURCE_BOUNDARY_VIOLATION"
  | "SOURCE_MISSING"
  | "SOURCE_NOT_REGULAR"
  | "SOURCE_HARDLINK_UNSAFE"
  | "SOURCE_TOO_LARGE"
  | "SOURCE_NOT_TEXT"
  | "SOURCE_IDENTITY_CHANGED"
  | "SOURCE_FAILED";

export type SemanticSourceReadResult =
  | { ok: true; snapshot: SemanticSourceSnapshot }
  | { ok: false; path: string | null; reason: SemanticSourceFailureReason };

const FAILURE_MAP: Record<GuidanceReadFailureReason, SemanticSourceFailureReason> = {
  READ_BLOCKED: "SOURCE_BLOCKED",
  READ_BOUNDARY_VIOLATION: "SOURCE_BOUNDARY_VIOLATION",
  READ_MISSING: "SOURCE_MISSING",
  READ_NOT_REGULAR: "SOURCE_NOT_REGULAR",
  READ_HARDLINK_UNSAFE: "SOURCE_HARDLINK_UNSAFE",
  READ_TOO_LARGE: "SOURCE_TOO_LARGE",
  READ_NOT_TEXT: "SOURCE_NOT_TEXT",
  READ_IDENTITY_CHANGED: "SOURCE_IDENTITY_CHANGED",
  READ_FAILED: "SOURCE_FAILED"
};

export interface SemanticSourceReadOptions extends GuidanceReadOptions {}

export function detectSemanticLanguage(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".d.ts") || lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")) return "typescript";
  if (lower.endsWith(".tsx")) return "typescriptreact";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".jsx")) return "javascriptreact";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".py") || lower.endsWith(".pyi")) return "python";
  return "unknown";
}

export async function readSemanticSourceSnapshot(
  options: SemanticSourceReadOptions
): Promise<SemanticSourceReadResult> {
  const result = await readGuidanceText(options);
  if (!result.ok) {
    return { ok: false, path: result.path, reason: FAILURE_MAP[result.reason] };
  }
  const lineIndex = createLineIndex(result.text);
  const snapshot: SemanticSourceSnapshot = Object.freeze({
    relativePath: result.path.replace(/\\/gu, "/"),
    canonicalPathKey: process.platform === "win32"
      ? result.path.replace(/\\/gu, "/").toLocaleLowerCase("en-US")
      : result.path.replace(/\\/gu, "/"),
    canonicalParentPathKey: process.platform === "win32"
      ? result.canonicalParentPath.toLocaleLowerCase("en-US")
      : result.canonicalParentPath,
    parentIdentity: result.parentIdentity,
    language: detectSemanticLanguage(result.path),
    utf8Text: result.text,
    sha256: result.rawSha256,
    byteLength: result.sourceBytes,
    lineIndex: lineIndex.lineStarts,
    stableIdentity: Object.freeze({ ...result.identity })
  });
  return { ok: true, snapshot };
}
