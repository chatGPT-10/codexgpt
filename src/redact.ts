const OPENAI_SECRET_PATTERN = /\bsk-[A-Za-z0-9_-]{10,}\b/g;
const COMMON_TOKEN_PATTERN = /\b(?:sk-ant-[A-Za-z0-9_-]{10,}|gh[opsru]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9_-]{20,})\b/g;
const BEARER_TOKEN_PATTERN = /\b(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi;
const CLI_TOKEN_PATTERN = /((?:\bngrok\s+config\s+add-authtoken|\bcloudflared\s+service\s+install|--(?:token|access-token|auth-token|api[_-]?key|authtoken))(?:=|\s+))[A-Za-z0-9._~+/=-]{8,}/gi;
const QUERY_TOKEN_PATTERN = /([?&](?:codexpro_token|token|access_token|auth_token|api[_-]?key)=)[^&\s"'`<>]{8,}/gi;
const CODEXPRO_TOKEN_ASSIGNMENT_PATTERN = /\b(codexpro_token\s*=\s*)(?:"[^"\r\n]{8,512}"|'[^'\r\n]{8,512}'|`[^`\r\n]{8,512}`|[A-Za-z0-9_./+=-]{8,512})/gi;
const CODEXPRO_TOKEN_FIELD_PATTERN = /(["']?codexpro_token["']?\s*:\s*)(?:"[^"\r\n]{8,512}"|'[^'\r\n]{8,512}'|`[^`\r\n]{8,512}`|[A-Za-z0-9_./+=-]{8,512})/gi;
const SECRET_ASSIGNMENT_PATTERN = /\b[A-Za-z0-9_]{0,64}(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)[A-Za-z0-9_]{0,64}\s*=\s*(?:"[^"\r\n]{12,512}"|'[^'\r\n]{12,512}'|`[^`\r\n]{12,512}`|[A-Za-z0-9_./+=-]{20,512})/gi;
const SECRET_FIELD_PATTERN = /(["']?[A-Za-z0-9_]{0,64}(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)[A-Za-z0-9_]{0,64}["']?\s*:\s*)(?:"[^"\r\n]{12,512}"|'[^'\r\n]{12,512}'|`[^`\r\n]{12,512}`|[A-Za-z0-9_./+=-]{20,512})/gi;
const SECRET_PATTERNS = [OPENAI_SECRET_PATTERN, COMMON_TOKEN_PATTERN, BEARER_TOKEN_PATTERN, CLI_TOKEN_PATTERN, QUERY_TOKEN_PATTERN, CODEXPRO_TOKEN_ASSIGNMENT_PATTERN, CODEXPRO_TOKEN_FIELD_PATTERN, SECRET_ASSIGNMENT_PATTERN, SECRET_FIELD_PATTERN];
const GIT_PATCH_FORBIDDEN_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

export interface SanitizedGitPatch {
  text: string;
  truncated: boolean;
  secretRedacted: boolean;
  unsafeControlsNeutralized: boolean;
}

export { OUTPUT_REDACTION_CAPABILITY, StreamingRedactor } from "./process/streamingRedactor.js";

export function hasSecretValue(text: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (!isPlaceholderSecret(match[0])) return true;
    }
  }
  return false;
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(CODEXPRO_TOKEN_ASSIGNMENT_PATTERN, (_match, prefix) => `${prefix}[REDACTED_SECRET]`)
    .replace(CODEXPRO_TOKEN_FIELD_PATTERN, (_match, prefix) => `${prefix}[REDACTED_SECRET]`)
    .replace(CLI_TOKEN_PATTERN, (match, prefix) => isPlaceholderSecret(match) ? match : `${prefix}[REDACTED_SECRET]`)
    .replace(SECRET_ASSIGNMENT_PATTERN, (match) => isPlaceholderSecret(match) ? match : redactSecretAssignment(match))
    .replace(SECRET_FIELD_PATTERN, (match, prefix) => isPlaceholderSecret(match) ? match : `${prefix}[REDACTED_SECRET]`)
    .replace(BEARER_TOKEN_PATTERN, (_match, prefix) => `${prefix}[REDACTED_SECRET]`)
    .replace(QUERY_TOKEN_PATTERN, (_match, prefix) => `${prefix}[REDACTED_SECRET]`)
    .replace(OPENAI_SECRET_PATTERN, (match) => isPlaceholderSecret(match) ? match : "[REDACTED_SECRET]")
    .replace(COMMON_TOKEN_PATTERN, (match) => isPlaceholderSecret(match) ? match : "[REDACTED_SECRET]");
}

export function redactStructured<T>(value: T, depth = 0): T {
  if (depth > 8) return value;
  if (typeof value === "string") return redactSensitiveText(value) as T;
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactStructured(item, depth + 1)) as T;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = redactStructured(item, depth + 1);
  }
  return out as T;
}

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("[redacted_secret]") ||
    normalized.includes("replace-me") ||
    normalized.includes("replace-with-long-random-token") ||
    normalized.includes("keep-this-codexpro-token-stable") ||
    normalized.includes("keep-this-stable-token") ||
    normalized.includes("your-ngrok-token") ||
    normalized.includes("your-token") ||
    normalized.includes("your-api-key-here") ||
    normalized.includes("<openai_api_key>") ||
    normalized.includes("process.env.") ||
    normalized.includes("import.meta.env.") ||
    normalized.includes("os.environ") ||
    normalized.includes("getenv(") ||
    normalized === "sk-..." ||
    normalized.endsWith("=sk-...")
  );
}

function redactSecretAssignment(value: string): string {
  const index = value.indexOf("=");
  if (index < 0) return "[REDACTED_SECRET]";
  return `${value.slice(0, index).trimEnd()}= [REDACTED_SECRET]`;
}

function truncateUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length <= maxBytes) return { text: value, truncated: false };
  let end = Math.max(0, maxBytes);
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end -= 1;
  return { text: encoded.subarray(0, end).toString("utf8"), truncated: true };
}

export function sanitizeGitPatchText(text: string, maxBytes: number): SanitizedGitPatch {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("GIT_SCAN_LIMIT");
  const normalized = text.replace(/\r\n?/g, "\n");
  const unsafeControlsNeutralized = GIT_PATCH_FORBIDDEN_CONTROL_PATTERN.test(normalized);
  GIT_PATCH_FORBIDDEN_CONTROL_PATTERN.lastIndex = 0;
  const neutralized = normalized.replace(GIT_PATCH_FORBIDDEN_CONTROL_PATTERN, "�");
  const redacted = redactSensitiveText(neutralized);
  const secretRedacted = redacted !== neutralized;
  const bounded = truncateUtf8(redacted, maxBytes);
  return {
    text: bounded.text,
    truncated: bounded.truncated,
    secretRedacted,
    unsafeControlsNeutralized
  };
}
