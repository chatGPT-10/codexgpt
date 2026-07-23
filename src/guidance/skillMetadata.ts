import { parseDocument } from "yaml";
import { redactSensitiveText } from "../redact.js";

const MAX_FRONTMATTER_BYTES = 16_384;
const MAX_NAME_CHARS = 240;
const MAX_DESCRIPTION_CHARS = 4_000;
const MAX_OPTIONAL_CHARS = 1_000;
const MAX_DEPTH = 8;
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;
const SPEC_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string;
}

export type SkillMetadataResult =
  | {
      ok: true;
      metadata: SkillMetadata;
      metadataRedacted: boolean;
      specCompliant: boolean;
      legacyParse: boolean;
      warnings: string[];
    }
  | {
      ok: false;
      code: "SKILL_METADATA_INVALID";
      warnings: string[];
    };

function frontmatter(text: string): string | null {
  const source = text.startsWith("\ufeff") ? text.slice(1) : text;
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) return null;
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match?.[1] ?? null;
}

function depth(value: unknown, current = 0): number {
  if (current > MAX_DEPTH) return current;
  if (!value || typeof value !== "object") return current;
  let maximum = current + 1;
  const children: unknown[] = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  for (const child of children) maximum = Math.max(maximum, depth(child, current + 1));
  return maximum;
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) return undefined;
  return normalized;
}

function sanitize(value: string): { value: string; redacted: boolean } {
  const safe = redactSensitiveText(value);
  return { value: safe, redacted: safe !== value };
}

export function parseSkillMetadata(
  text: string,
  options: { directoryName: string; legacy?: boolean }
): SkillMetadataResult {
  const source = frontmatter(text);
  if (source === null || Buffer.byteLength(source, "utf8") > MAX_FRONTMATTER_BYTES) {
    return { ok: false, code: "SKILL_METADATA_INVALID", warnings: [] };
  }
  let value: unknown;
  try {
    const document = parseDocument(source, {
      schema: "core",
      customTags: [],
      strict: true,
      uniqueKeys: true
    });
    if (document.errors.length > 0 || document.warnings.some((warning) => warning.code === "TAG_RESOLVE_FAILED")) {
      return { ok: false, code: "SKILL_METADATA_INVALID", warnings: [] };
    }
    value = document.toJS({ maxAliasCount: 0 });
  } catch {
    return { ok: false, code: "SKILL_METADATA_INVALID", warnings: [] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || depth(value) > MAX_DEPTH) {
    return { ok: false, code: "SKILL_METADATA_INVALID", warnings: [] };
  }
  const raw = value as Record<string, unknown>;
  const rawName = boundedString(raw.name, MAX_NAME_CHARS);
  const rawDescription = boundedString(raw.description, MAX_DESCRIPTION_CHARS);
  if (!rawName || !rawDescription || !SAFE_NAME.test(rawName)) {
    return { ok: false, code: "SKILL_METADATA_INVALID", warnings: [] };
  }

  const warnings: string[] = [];
  const specCompliant = rawName.length <= 64 && SPEC_NAME.test(rawName) && rawName === options.directoryName;
  if (!specCompliant) warnings.push("SKILL_METADATA_COMPATIBILITY_WARNING");
  const name = sanitize(rawName);
  const description = sanitize(rawDescription);
  let metadataRedacted = name.redacted || description.redacted;
  const metadata: SkillMetadata = { name: name.value, description: description.value };

  for (const [inputKey, outputKey] of [["license", "license"], ["compatibility", "compatibility"], ["allowed-tools", "allowedTools"]] as const) {
    if (!(inputKey in raw)) continue;
    const item = boundedString(raw[inputKey], MAX_OPTIONAL_CHARS);
    if (!item) {
      warnings.push("SKILL_METADATA_COMPATIBILITY_WARNING");
      continue;
    }
    const sanitized = sanitize(item);
    metadataRedacted ||= sanitized.redacted;
    metadata[outputKey] = sanitized.value;
  }

  if ("metadata" in raw) {
    if (!raw.metadata || typeof raw.metadata !== "object" || Array.isArray(raw.metadata)) {
      warnings.push("SKILL_METADATA_COMPATIBILITY_WARNING");
    } else {
      const entries = Object.entries(raw.metadata as Record<string, unknown>);
      if (entries.length > 32 || entries.some(([key, item]) => !boundedString(key, 120) || !boundedString(item, 500))) {
        warnings.push("SKILL_METADATA_COMPATIBILITY_WARNING");
      } else {
        metadata.metadata = Object.fromEntries(entries.map(([key, item]) => [key, String(item)]));
      }
    }
  }

  return {
    ok: true,
    metadata,
    metadataRedacted,
    specCompliant,
    legacyParse: options.legacy === true,
    warnings: [...new Set(warnings)]
  };
}
