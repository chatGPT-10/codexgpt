import { redactSensitiveText } from "../redact.js";
import type { SemanticTextEdit } from "./types.js";

function lineForOffset(text: string, offset: number): number {
  let line = 0;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

export function createSemanticDiffPreview(
  files: readonly { path: string; before: string; after: string; edits: readonly SemanticTextEdit[] }[],
  maxChars: number
): { text: string; truncated: boolean; omittedChars: number } {
  const complete = files.map((file) => {
    const beforeLines = file.before.split(/\r?\n/u);
    const afterLines = file.after.split(/\r?\n/u);
    const changedLines = [...new Set(file.edits.map((edit) => lineForOffset(file.before, edit.start)))].sort((a, b) => a - b);
    const hunks = changedLines.map((line) => {
      const start = Math.max(0, line - 1);
      const end = Math.min(beforeLines.length, line + 2);
      const afterEnd = Math.min(afterLines.length, line + 2);
      return [
        `@@ -${start + 1},${end - start} +${start + 1},${afterEnd - start} @@`,
        ...beforeLines.slice(start, end).map((value) => `-${value}`),
        ...afterLines.slice(start, afterEnd).map((value) => `+${value}`)
      ].join("\n");
    });
    return [`--- a/${file.path}`, `+++ b/${file.path}`, ...hunks].join("\n");
  }).join("\n");
  const redacted = redactSensitiveText(complete);
  if (redacted.length <= maxChars) return { text: redacted, truncated: false, omittedChars: 0 };
  return {
    text: redacted.slice(0, maxChars),
    truncated: true,
    omittedChars: redacted.length - maxChars
  };
}
