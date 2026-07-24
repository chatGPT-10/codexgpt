import type { SemanticPublicPosition, SemanticPublicRange } from "./types.js";

export interface SemanticLineIndex {
  readonly text: string;
  readonly lineStarts: readonly number[];
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid public ${name} position.`);
  }
}

export function createLineIndex(text: string): SemanticLineIndex {
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 0x0a) lineStarts.push(index + 1);
  }
  return Object.freeze({
    text,
    lineStarts: Object.freeze(lineStarts)
  });
}

function lineContentEnd(index: SemanticLineIndex, lineIndex: number): number {
  const start = index.lineStarts[lineIndex];
  const next = index.lineStarts[lineIndex + 1] ?? index.text.length;
  let end = next;
  if (end > start && index.text.charCodeAt(end - 1) === 0x0a) end -= 1;
  if (end > start && index.text.charCodeAt(end - 1) === 0x0d) end -= 1;
  return end;
}

function visibleLineText(index: SemanticLineIndex, lineIndex: number): { text: string; offset: number } {
  const start = index.lineStarts[lineIndex];
  const end = lineContentEnd(index, lineIndex);
  const bomBytes = lineIndex === 0 && index.text.charCodeAt(start) === 0xfeff ? 1 : 0;
  return { text: index.text.slice(start + bomBytes, end), offset: start + bomBytes };
}

export function publicPositionToOffset(
  index: SemanticLineIndex,
  position: SemanticPublicPosition
): number {
  assertSafeInteger(position.line, "line");
  assertSafeInteger(position.column, "column");
  const lineIndex = position.line - 1;
  if (lineIndex >= index.lineStarts.length) throw new Error("Invalid public line position.");
  const visible = visibleLineText(index, lineIndex);
  const codePoints = [...visible.text];
  if (position.column > codePoints.length + 1) throw new Error("Invalid public column position.");
  const prefix = codePoints.slice(0, position.column - 1).join("");
  return visible.offset + prefix.length;
}

export function offsetToPublicPosition(
  index: SemanticLineIndex,
  offset: number
): SemanticPublicPosition {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > index.text.length) {
    throw new Error("Invalid semantic offset position.");
  }
  let low = 0;
  let high = index.lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (index.lineStarts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  const end = lineContentEnd(index, lineIndex);
  if (offset > end) throw new Error("Offset lands inside a line ending.");
  const visible = visibleLineText(index, lineIndex);
  if (offset < visible.offset) {
    return { line: lineIndex + 1, column: 1 };
  }
  if (offset > 0 && offset < index.text.length) {
    const previous = index.text.charCodeAt(offset - 1);
    const current = index.text.charCodeAt(offset);
    if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) {
      throw new Error("Offset splits a Unicode code point.");
    }
  }
  const prefix = index.text.slice(visible.offset, offset);
  return { line: lineIndex + 1, column: [...prefix].length + 1 };
}

export function offsetsToPublicRange(
  index: SemanticLineIndex,
  start: number,
  length: number
): SemanticPublicRange {
  if (!Number.isSafeInteger(length) || length < 0 || start + length > index.text.length) {
    throw new Error("Invalid semantic range.");
  }
  return {
    start: offsetToPublicPosition(index, start),
    end: offsetToPublicPosition(index, start + length)
  };
}
