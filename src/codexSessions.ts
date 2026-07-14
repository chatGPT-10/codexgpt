import { type Dirent } from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import type { CodexProConfig } from "./config.js";
import { CodexProError } from "./guard.js";
import { redactSensitiveText } from "./redact.js";
import {
  compareCodexSessions,
  type CodexSessionsSession
} from "./tools/schemas/codexSessions.js";
import {
  READ_CODEX_SESSION_MESSAGE_TRUNCATION_MARKER,
  type ReadCodexSessionMessage
} from "./tools/schemas/readCodexSession.js";

const CODEX_IDE_CONTEXT_PREFIX = "# Context from my IDE setup:";
const CODEX_REQUEST_MARKER = "my request for codex";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const META_HEAD_BYTES = 64 * 1024;
const META_TAIL_BYTES = 64 * 1024;
export const CODEX_SESSION_SCAN_FILE_LIMIT = 3000 as const;
export const CODEX_SESSION_SCAN_DEPTH_LIMIT = 6 as const;
export const CODEX_SESSION_READ_FILE_LIMIT = 20_000_000 as const;

export type CodexSessionMeta = CodexSessionsSession;

export type CodexSessionMessage = ReadCodexSessionMessage;

export interface CodexSessionListResult {
  codex_dir: string;
  roots: string[];
  scan_file_limit: number;
  scan_depth_limit: number;
  scanned_file_count: number;
  indexed_session_count: number;
  excluded_file_count: number;
  duplicate_file_count: number;
  sessions: CodexSessionMeta[];
  total_found: number;
  discovery_truncated: boolean;
}

export interface CodexSessionReadResult {
  codex_dir: string;
  roots: [string, string];
  selection: "session_id" | "source_path" | "both";
  requested_session_id: string | null;
  requested_source_path: string | null;
  max_messages: number;
  max_total_bytes: number;
  max_source_file_bytes: typeof CODEX_SESSION_READ_FILE_LIMIT;
  source_file_bytes: number;
  session: CodexSessionMeta;
  messages: CodexSessionMessage[];
  truncation_reason: "message_limit" | "byte_limit" | null;
  readonly content_bytes: number;
  readonly redacted_message_count: number;
  readonly truncated_message_count: number;
  readonly truncated: boolean;
  readonly text: string;
}

export type CodexSessionReadOperationCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_RESOLUTION_INCOMPLETE"
  | "SOURCE_PATH_OUTSIDE_ROOTS"
  | "SESSION_ID_MISMATCH"
  | "SESSION_FILE_TOO_LARGE"
  | "SESSION_READ_FAILED";

const CODEX_SESSION_READ_OPERATION_ERROR = Symbol.for(
  "codexpro.CodexSessionReadOperationError"
);

export class CodexSessionReadOperationError extends Error {
  constructor(
    public readonly code: CodexSessionReadOperationCode,
    public readonly details: Record<string, unknown>
  ) {
    super(code);
    this.name = "CodexSessionReadOperationError";
    Object.defineProperty(this, CODEX_SESSION_READ_OPERATION_ERROR, {
      value: true
    });
  }
}

export function isCodexSessionReadOperationError(
  error: unknown
): error is CodexSessionReadOperationError {
  return error instanceof CodexSessionReadOperationError || (
    typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[CODEX_SESSION_READ_OPERATION_ERROR] === true
  );
}

export function codexSessionDirectory(config: CodexProConfig): string {
  return path.resolve(config.codexDir || path.join(os.homedir(), ".codex"));
}

export function codexSessionRoots(config: CodexProConfig): [string, string] {
  const root = codexSessionDirectory(config);
  return [path.join(root, "sessions"), path.join(root, "archived_sessions")];
}

function ensureEnabled(config: CodexProConfig, read = false): void {
  if (config.codexSessions === "off") {
    throw new CodexProError("Codex session tools are disabled. Start with --codex-sessions metadata or --codex-sessions read to opt in.");
  }
  if (read && config.codexSessions !== "read") {
    throw new CodexProError("Reading Codex session transcripts is disabled. Start with --codex-sessions read to opt in.");
  }
}

function isSubpath(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isStrictSubpath(child: string, parent: string): boolean {
  return path.relative(parent, child) !== "" && isSubpath(child, parent);
}

interface CodexSessionFileCandidate {
  path: string;
  storage: "active" | "archived";
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

interface CodexSessionFileCollection {
  files: CodexSessionFileCandidate[];
  truncated: boolean;
}

async function collectJsonlFiles(
  root: string,
  storage: "active" | "archived",
  collection: CodexSessionFileCollection,
  maxDepth: number,
  maxFiles: number,
  depth = 0
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) !== "ENOENT") collection.truncated = true;
    return;
  }
  entries.sort((left, right) =>
    left.name === right.name ? 0 : left.name < right.name ? -1 : 1
  );

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (collection.files.length >= maxFiles) {
      if (entry.isDirectory() || (entry.isFile() && entry.name.endsWith(".jsonl"))) {
        collection.truncated = true;
        return;
      }
      continue;
    }
    if (entry.isDirectory()) {
      if (depth >= maxDepth) {
        collection.truncated = true;
        continue;
      }
      await collectJsonlFiles(
        fullPath,
        storage,
        collection,
        maxDepth,
        maxFiles,
        depth + 1
      );
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      collection.files.push({ path: fullPath, storage });
    }
  }
}

async function readFileSlice(filePath: string, start: number, length: number): Promise<string> {
  if (length <= 0) return "";
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function splitJsonlLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.length > 0);
}

async function readHeadTailLines(filePath: string, headLimit: number, tailLimit: number): Promise<{ head: string[]; tail: string[] }> {
  const fileStat = await fsp.stat(filePath);
  const headLength = Math.min(fileStat.size, META_HEAD_BYTES);
  const tailOffset = Math.max(0, fileStat.size - META_TAIL_BYTES);
  const tailLength = fileStat.size - tailOffset;
  const [headText, tailText] = await Promise.all([
    readFileSlice(filePath, 0, headLength),
    tailOffset === 0 && tailLength === headLength ? Promise.resolve("") : readFileSlice(filePath, tailOffset, tailLength)
  ]);

  const headLines = splitJsonlLines(headText);
  if (headLength < fileStat.size && !headText.endsWith("\n")) headLines.pop();

  const tailSource = tailText
    ? tailOffset > 0
      ? tailText.slice(Math.max(0, tailText.indexOf("\n") + 1))
      : tailText
    : headText;
  const tailLines = splitJsonlLines(tailSource);

  return {
    head: headLines.slice(0, headLimit),
    tail: tailLines.slice(-tailLimit)
  };
}

function parseTimestamp(value: unknown): number | undefined {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text ?? "");
      return "";
    }).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object" && "text" in value) {
    return String((value as { text?: unknown }).text ?? "");
  }
  return "";
}

function truncate(text: string, max: number): string {
  const clean = text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function safeAbsoluteMetadataPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (
    value.length === 0 ||
    value.length > 4096 ||
    value.trim() !== value ||
    /[\r\n\u0000-\u001f\u007f]/.test(value) ||
    !path.isAbsolute(value)
  ) return undefined;
  return path.resolve(value);
}

function basename(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[\\/]+$/, "");
  const base = path.basename(cleaned);
  return base || undefined;
}

function codexRequestHeadingPayload(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("#")) return null;
  const heading = trimmed.replace(/^#+\s*/, "");
  const lowered = heading.toLowerCase();
  if (!lowered.startsWith(CODEX_REQUEST_MARKER)) return null;
  const suffix = heading.slice(CODEX_REQUEST_MARKER.length).trimStart();
  if (!suffix) return "";
  if (!/^[:：\-—]/.test(suffix)) return null;
  return suffix.replace(/^[:：\-—\s]+/, "").trim();
}

function extractCodexPromptFromIdeContext(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CODEX_IDE_CONTEXT_PREFIX)) return undefined;
  const lines = trimmed.replace(/\r\n/g, "\n").split("\n");
  let prompt: string | undefined;
  for (const [index, line] of lines.entries()) {
    const inline = codexRequestHeadingPayload(line);
    if (inline === null) continue;
    if (inline) {
      prompt = inline;
      continue;
    }
    const following = lines.slice(index + 1).join("\n").trim();
    prompt = following || undefined;
  }
  return prompt;
}

function titleCandidateFromUserMessage(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("# AGENTS.md") || trimmed.startsWith("<environment_context>")) return undefined;
  if (trimmed.startsWith(CODEX_IDE_CONTEXT_PREFIX)) return extractCodexPromptFromIdeContext(trimmed);
  return trimmed;
}

function inferSessionIdFromFilename(filePath: string): string | undefined {
  const match = path.basename(filePath).match(UUID_RE);
  return match?.[0]?.toLowerCase();
}

function normalizeSessionId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return UUID_RE.test(normalized) && normalized.length === 36
    ? normalized
    : undefined;
}

function parseJsonLine(line: string): any | undefined {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function isSubagentSource(payload: any): boolean {
  return Boolean(payload?.source && typeof payload.source === "object" && "subagent" in payload.source);
}

async function parseSessionMeta(
  filePath: string,
  storage: "active" | "archived"
): Promise<CodexSessionMeta | undefined> {
  const { head, tail } = await readHeadTailLines(filePath, 16, 48);
  let sessionId: string | undefined;
  let projectDir: string | undefined;
  let createdAt: number | undefined;
  let firstUserMessage: string | undefined;

  for (const line of head) {
    const value = parseJsonLine(line);
    if (!value) continue;
    createdAt ??= parseTimestamp(value.timestamp);
    if (value.type === "session_meta" && value.payload) {
      if (isSubagentSource(value.payload)) return undefined;
      sessionId ??= normalizeSessionId(
        value.payload.id ?? value.payload.session_id ?? value.payload.sessionId
      );
      projectDir ??= safeAbsoluteMetadataPath(
        value.payload.cwd ?? value.payload.project_dir ?? value.payload.projectDir
      );
      createdAt ??= parseTimestamp(value.payload.timestamp);
    }
    if (!firstUserMessage && value.type === "response_item" && value.payload?.type === "message" && value.payload?.role === "user") {
      const text = extractText(value.payload.content);
      firstUserMessage = titleCandidateFromUserMessage(text);
    }
  }

  let lastActiveAt: number | undefined;
  for (const line of [...tail].reverse()) {
    const value = parseJsonLine(line);
    if (!value) continue;
    lastActiveAt ??= parseTimestamp(value.timestamp);
    if (lastActiveAt) break;
  }

  const id = sessionId ?? inferSessionIdFromFilename(filePath);
  if (!id) return undefined;
  const titleSource = firstUserMessage ?? basename(projectDir);
  const title = titleSource ? truncate(titleSource, 96) : undefined;
  const sourcePath = path.resolve(filePath);
  if (sourcePath.length > 4096) return undefined;

  return {
    provider_id: "codex",
    session_id: id,
    storage,
    title: title ?? null,
    project_dir: projectDir ?? null,
    created_at: createdAt ?? null,
    last_active_at: lastActiveAt ?? null,
    source_path: sourcePath,
    resume_command: `codex resume ${id}`
  };
}

interface CodexSessionIndex {
  sessions: CodexSessionMeta[];
  scannedFileCount: number;
  indexedSessionCount: number;
  excludedFileCount: number;
  duplicateFileCount: number;
  discoveryTruncated: boolean;
}

async function collectSessionMetas(
  config: CodexProConfig,
  scanFileLimit: number = CODEX_SESSION_SCAN_FILE_LIMIT,
  scanDepthLimit: number = CODEX_SESSION_SCAN_DEPTH_LIMIT
): Promise<CodexSessionIndex> {
  const collection: CodexSessionFileCollection = { files: [], truncated: false };
  const roots = codexSessionRoots(config);
  for (const [index, root] of roots.entries()) {
    await collectJsonlFiles(
      root,
      index === 0 ? "active" : "archived",
      collection,
      scanDepthLimit,
      scanFileLimit
    );
  }

  const parsedSessions: CodexSessionMeta[] = [];
  let excludedFileCount = 0;
  for (const candidate of collection.files) {
    const meta = await parseSessionMeta(candidate.path, candidate.storage)
      .catch(() => undefined);
    if (meta) parsedSessions.push(meta);
    else excludedFileCount += 1;
  }
  parsedSessions.sort(compareCodexSessions);

  const sessions: CodexSessionMeta[] = [];
  const seenIds = new Set<string>();
  let duplicateFileCount = 0;
  for (const session of parsedSessions) {
    if (seenIds.has(session.session_id)) {
      duplicateFileCount += 1;
      continue;
    }
    seenIds.add(session.session_id);
    sessions.push(session);
  }

  return {
    sessions,
    scannedFileCount: collection.files.length,
    indexedSessionCount: sessions.length,
    excludedFileCount,
    duplicateFileCount,
    discoveryTruncated: collection.truncated
  };
}

export async function listCodexSessions(
  config: CodexProConfig,
  options: {
    maxSessions?: number;
    query?: string;
    scanFileLimit?: number;
    scanDepthLimit?: number;
  } = {}
): Promise<CodexSessionListResult> {
  ensureEnabled(config);
  const roots = codexSessionRoots(config);
  const scanFileLimit = Math.max(
    1,
    Math.min(
      Number.isSafeInteger(options.scanFileLimit)
        ? Number(options.scanFileLimit)
        : CODEX_SESSION_SCAN_FILE_LIMIT,
      CODEX_SESSION_SCAN_FILE_LIMIT
    )
  );
  const scanDepthLimit = Math.max(
    0,
    Math.min(
      Number.isSafeInteger(options.scanDepthLimit)
        ? Number(options.scanDepthLimit)
        : CODEX_SESSION_SCAN_DEPTH_LIMIT,
      CODEX_SESSION_SCAN_DEPTH_LIMIT
    )
  );
  const index = await collectSessionMetas(config, scanFileLimit, scanDepthLimit);

  const query = options.query?.trim().toLowerCase();
  const filtered = query
    ? index.sessions.filter((session) => [
        session.session_id,
        session.title,
        session.project_dir,
        session.source_path
      ].filter(Boolean).join("\n").toLowerCase().includes(query))
    : index.sessions;

  const maxSessions = Math.max(1, Math.min(Number(options.maxSessions ?? 30), 200));
  return {
    codex_dir: codexSessionDirectory(config),
    roots,
    scan_file_limit: scanFileLimit,
    scan_depth_limit: scanDepthLimit,
    scanned_file_count: index.scannedFileCount,
    indexed_session_count: index.indexedSessionCount,
    excluded_file_count: index.excludedFileCount,
    duplicate_file_count: index.duplicateFileCount,
    sessions: filtered.slice(0, maxSessions),
    total_found: filtered.length,
    discovery_truncated: index.discoveryTruncated
  };
}

interface ResolvedCodexSessionSource {
  session: CodexSessionMeta;
  readPath: string;
}

export interface ReadCodexSessionOptions {
  sessionId?: string;
  sourcePath?: string;
  maxMessages?: number;
  maxTotalBytes?: number;
  scanFileLimit?: number;
  scanDepthLimit?: number;
}

function readOperationError(
  code: CodexSessionReadOperationCode,
  details: Record<string, unknown> = {}
): CodexSessionReadOperationError {
  return new CodexSessionReadOperationError(code, details);
}

async function canonicalHistoryRoots(
  config: CodexProConfig
): Promise<[string, string]> {
  const roots = codexSessionRoots(config);
  const canonical: string[] = [];
  for (const root of roots) {
    try {
      canonical.push(await fsp.realpath(root));
    } catch (error) {
      if (errorCode(error) === "ENOENT") canonical.push(path.resolve(root));
      else throw readOperationError("SESSION_READ_FAILED");
    }
  }
  return [canonical[0]!, canonical[1]!];
}

async function canonicalSessionReadPath(
  sourcePath: string,
  root: string,
  selector: "session_id" | "source_path"
): Promise<string> {
  let canonical: string;
  try {
    canonical = await fsp.realpath(sourcePath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw readOperationError("SESSION_NOT_FOUND", { selector });
    }
    throw readOperationError("SESSION_READ_FAILED");
  }
  if (!isStrictSubpath(canonical, root)) {
    throw readOperationError("SOURCE_PATH_OUTSIDE_ROOTS");
  }
  return canonical;
}

async function resolveSessionSource(
  config: CodexProConfig,
  sessionId: string | undefined,
  sourcePath: string | undefined,
  scanFileLimit: number,
  scanDepthLimit: number
): Promise<ResolvedCodexSessionSource> {
  ensureEnabled(config, true);
  const lexicalRoots = codexSessionRoots(config);
  const canonicalRoots = await canonicalHistoryRoots(config);

  if (sourcePath) {
    const rootIndex = lexicalRoots.findIndex((root) =>
      isStrictSubpath(sourcePath, root)
    );
    if (rootIndex < 0) {
      throw readOperationError("SOURCE_PATH_OUTSIDE_ROOTS");
    }
    const readPath = await canonicalSessionReadPath(
      sourcePath,
      canonicalRoots[rootIndex]!,
      "source_path"
    );
    let meta: CodexSessionMeta | undefined;
    try {
      meta = await parseSessionMeta(
        sourcePath,
        rootIndex === 0 ? "active" : "archived"
      );
    } catch {
      throw readOperationError("SESSION_READ_FAILED");
    }
    if (!meta) throw readOperationError("SESSION_READ_FAILED");
    if (sessionId && meta.session_id !== sessionId) {
      throw readOperationError("SESSION_ID_MISMATCH");
    }
    return { session: meta, readPath };
  }

  if (!sessionId) throw new CodexProError("session_id or source_path is required.");
  const index = await collectSessionMetas(
    config,
    scanFileLimit,
    scanDepthLimit
  );
  const match = index.sessions.find((session) => session.session_id === sessionId);
  if (!match) {
    if (index.discoveryTruncated) {
      throw readOperationError("SESSION_RESOLUTION_INCOMPLETE", {
        selector: "session_id"
      });
    }
    throw readOperationError("SESSION_NOT_FOUND", { selector: "session_id" });
  }
  const rootIndex = match.storage === "active" ? 0 : 1;
  const readPath = await canonicalSessionReadPath(
    match.source_path,
    canonicalRoots[rootIndex]!,
    "session_id"
  ).catch((error) => {
    if (
      error instanceof CodexSessionReadOperationError &&
      error.code === "SESSION_NOT_FOUND"
    ) {
      throw readOperationError("SESSION_READ_FAILED");
    }
    throw error;
  });
  return { session: match, readPath };
}

function normalizeTranscriptContent(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ");
}

function normalizedTranscriptRole(value: unknown): CodexSessionMessage["role"] {
  return value === "user" ||
    value === "assistant" ||
    value === "developer" ||
    value === "system" ||
    value === "tool"
    ? value
    : "unknown";
}

function normalizedToolName(value: unknown): string {
  const normalized = normalizeTranscriptContent(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  return truncate(normalized || "unknown", 80);
}

interface ExtractedTranscriptEvent {
  kind: CodexSessionMessage["kind"];
  role: CodexSessionMessage["role"];
  timestamp: number | null;
  content: string;
  redacted: boolean;
}

function extractTranscriptEvent(value: any): ExtractedTranscriptEvent | undefined {
  if (value?.type !== "response_item" || !value.payload) return undefined;
  const payload = value.payload;
  let kind: CodexSessionMessage["kind"];
  let role: CodexSessionMessage["role"];
  let rawContent: string;
  if (payload.type === "message") {
    kind = "message";
    role = normalizedTranscriptRole(payload.role);
    rawContent = extractText(payload.content);
  } else if (payload.type === "function_call") {
    kind = "function_call";
    role = "assistant";
    rawContent = `[Tool: ${normalizedToolName(payload.name)}]`;
  } else if (payload.type === "function_call_output") {
    kind = "function_call_output";
    role = "tool";
    rawContent = String(payload.output ?? "");
  } else {
    return undefined;
  }

  const normalized = normalizeTranscriptContent(rawContent);
  if (!normalized.trim()) return undefined;
  const content = redactSensitiveText(normalized);
  return {
    kind,
    role,
    timestamp: parseTimestamp(value.timestamp) ?? null,
    content,
    redacted: content !== normalized
  };
}

function cappedTranscriptPrefix(
  text: string,
  maxBytes: number
): string | undefined {
  const markerBytes = Buffer.byteLength(
    READ_CODEX_SESSION_MESSAGE_TRUNCATION_MARKER,
    "utf8"
  );
  const budget = maxBytes - markerBytes;
  if (budget <= 0) return undefined;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    let end = middle;
    if (
      end > 0 &&
      end < text.length &&
      /[\uD800-\uDBFF]/.test(text[end - 1]!)
    ) end -= 1;
    if (Buffer.byteLength(text.slice(0, end), "utf8") <= budget) low = middle;
    else high = middle - 1;
  }

  let end = low;
  if (
    end > 0 &&
    end < text.length &&
    /[\uD800-\uDBFF]/.test(text[end - 1]!)
  ) end -= 1;
  while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > budget) {
    end -= 1;
    if (end > 0 && /[\uDC00-\uDFFF]/.test(text[end]!)) end -= 1;
  }
  if (end <= 0) return undefined;
  return `${text.slice(0, end)}${READ_CODEX_SESSION_MESSAGE_TRUNCATION_MARKER}`;
}

interface LoadedSessionMessages {
  sourceFileBytes: number;
  messages: CodexSessionMessage[];
  truncationReason: "message_limit" | "byte_limit" | null;
}

async function loadSessionMessages(
  filePath: string,
  expectedSessionId: string,
  maxMessages: number,
  maxTotalBytes: number
): Promise<LoadedSessionMessages> {
  let handle: Awaited<ReturnType<typeof fsp.open>> | undefined;
  let stream: ReturnType<NonNullable<typeof handle>["createReadStream"]> | undefined;
  let reader: ReturnType<typeof createInterface> | undefined;
  try {
    handle = await fsp.open(filePath, "r");
    const stat = await handle.stat();
    if (!stat.isFile()) throw readOperationError("SESSION_READ_FAILED");
    if (stat.size > CODEX_SESSION_READ_FILE_LIMIT) {
      throw readOperationError("SESSION_FILE_TOO_LARGE", {
        max_source_file_bytes: CODEX_SESSION_READ_FILE_LIMIT
      });
    }

    const messages: CodexSessionMessage[] = [];
    let usedBytes = 0;
    let truncationReason: LoadedSessionMessages["truncationReason"] = null;
    if (stat.size === 0) {
      return { sourceFileBytes: 0, messages, truncationReason };
    }

    stream = handle.createReadStream({
      encoding: "utf8",
      start: 0,
      end: stat.size - 1,
      autoClose: false
    });
    reader = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of reader) {
      const value = parseJsonLine(line);
      if (value?.type === "session_meta" && value.payload) {
        const observedSessionId = normalizeSessionId(
          value.payload.id ?? value.payload.session_id ?? value.payload.sessionId
        );
        if (observedSessionId && observedSessionId !== expectedSessionId) {
          throw readOperationError("SESSION_READ_FAILED");
        }
      }
      const event = extractTranscriptEvent(value);
      if (!event) continue;
      if (messages.length >= maxMessages) {
        truncationReason = "message_limit";
        break;
      }

      const remainingBytes = maxTotalBytes - usedBytes;
      const completeBytes = Buffer.byteLength(event.content, "utf8");
      if (completeBytes <= remainingBytes) {
        messages.push({
          ordinal: messages.length + 1,
          kind: event.kind,
          role: event.role,
          timestamp: event.timestamp,
          content: event.content,
          bytes: completeBytes,
          redacted: event.redacted,
          truncated: false
        });
        usedBytes += completeBytes;
        continue;
      }

      const partial = cappedTranscriptPrefix(event.content, remainingBytes);
      if (partial) {
        const partialBytes = Buffer.byteLength(partial, "utf8");
        messages.push({
          ordinal: messages.length + 1,
          kind: event.kind,
          role: event.role,
          timestamp: event.timestamp,
          content: partial,
          bytes: partialBytes,
          redacted: event.redacted,
          truncated: true
        });
      }
      truncationReason = "byte_limit";
      break;
    }

    return {
      sourceFileBytes: stat.size,
      messages,
      truncationReason
    };
  } catch (error) {
    if (error instanceof CodexSessionReadOperationError) throw error;
    throw readOperationError("SESSION_READ_FAILED");
  } finally {
    reader?.close();
    stream?.destroy();
    await handle?.close().catch(() => undefined);
  }
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.max(minimum, Math.min(Number(value), maximum));
}

function legacyReadText(result: CodexSessionReadResult): string {
  const transcript = result.messages.map((message) => {
    const when = message.timestamp !== null
      ? ` ${new Date(message.timestamp).toISOString()}`
      : "";
    return `### ${message.role}${when}\n\n${message.content}`;
  }).join("\n\n");
  return [
    "# Codex Session",
    "",
    `Session: ${result.session.session_id}`,
    result.session.title ? `Title: ${result.session.title}` : "",
    result.session.project_dir ? `CWD: ${result.session.project_dir}` : "",
    `Source: ${result.session.source_path}`,
    `Resume: ${result.session.resume_command}`,
    result.truncated ? "Transcript truncated by configured limits." : "",
    "",
    "## Transcript",
    "",
    transcript || "No readable transcript messages found."
  ].filter((line) => line !== "").join("\n");
}

function attachLegacyReadAccessors(
  value: Omit<
    CodexSessionReadResult,
    | "content_bytes"
    | "redacted_message_count"
    | "truncated_message_count"
    | "truncated"
    | "text"
  >
): CodexSessionReadResult {
  const prototype = Object.create(null) as object;
  Object.defineProperties(prototype, {
    content_bytes: {
      get(this: CodexSessionReadResult) {
        return this.messages.reduce((total, message) => total + message.bytes, 0);
      }
    },
    redacted_message_count: {
      get(this: CodexSessionReadResult) {
        return this.messages.filter((message) => message.redacted).length;
      }
    },
    truncated_message_count: {
      get(this: CodexSessionReadResult) {
        return this.messages.filter((message) => message.truncated).length;
      }
    },
    truncated: {
      get(this: CodexSessionReadResult) {
        return this.truncation_reason !== null;
      }
    },
    text: {
      get(this: CodexSessionReadResult) {
        return legacyReadText(this);
      }
    }
  });
  return Object.assign(Object.create(prototype), value) as CodexSessionReadResult;
}

export async function readCodexSession(
  config: CodexProConfig,
  options: ReadCodexSessionOptions = {}
): Promise<CodexSessionReadResult> {
  const sessionId = typeof options.sessionId === "string"
    ? options.sessionId
    : undefined;
  const sourcePath = typeof options.sourcePath === "string"
    ? options.sourcePath
    : undefined;
  const selection = sessionId && sourcePath
    ? "both"
    : sourcePath
      ? "source_path"
      : "session_id";
  const maxMessages = boundedInteger(options.maxMessages, 80, 1, 400);
  const maxTotalBytes = boundedInteger(
    options.maxTotalBytes,
    80_000,
    4_000,
    400_000
  );
  const scanFileLimit = boundedInteger(
    options.scanFileLimit,
    CODEX_SESSION_SCAN_FILE_LIMIT,
    1,
    CODEX_SESSION_SCAN_FILE_LIMIT
  );
  const scanDepthLimit = boundedInteger(
    options.scanDepthLimit,
    CODEX_SESSION_SCAN_DEPTH_LIMIT,
    0,
    CODEX_SESSION_SCAN_DEPTH_LIMIT
  );
  const resolved = await resolveSessionSource(
    config,
    sessionId,
    sourcePath,
    scanFileLimit,
    scanDepthLimit
  );
  const loaded = await loadSessionMessages(
    resolved.readPath,
    resolved.session.session_id,
    maxMessages,
    maxTotalBytes
  );

  return attachLegacyReadAccessors({
    codex_dir: codexSessionDirectory(config),
    roots: codexSessionRoots(config),
    selection,
    requested_session_id: sessionId ?? null,
    requested_source_path: sourcePath ?? null,
    max_messages: maxMessages,
    max_total_bytes: maxTotalBytes,
    max_source_file_bytes: CODEX_SESSION_READ_FILE_LIMIT,
    source_file_bytes: loaded.sourceFileBytes,
    session: resolved.session,
    messages: loaded.messages,
    truncation_reason: loaded.truncationReason
  });
}
