import { parseDocument } from "yaml";

export interface OpenAISkillMetadata {
  implicitInvocation: boolean;
  requirementsState: "none" | "declared_unverified";
}

export function parseOpenAISkillMetadata(text: string): OpenAISkillMetadata | null {
  if (Buffer.byteLength(text, "utf8") > 16_384) return null;
  try {
    const document = parseDocument(text, { schema: "core", customTags: [], strict: true, uniqueKeys: true });
    if (document.errors.length > 0 || document.warnings.some((warning) => warning.code === "TAG_RESOLVE_FAILED")) return null;
    const value = document.toJS({ maxAliasCount: 0 });
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const policy = raw.policy && typeof raw.policy === "object" && !Array.isArray(raw.policy)
      ? raw.policy as Record<string, unknown>
      : {};
    const implicit = policy.allow_implicit_invocation;
    if (implicit !== undefined && typeof implicit !== "boolean") return null;
    const dependencies = raw.dependencies;
    const requirementsState = dependencies && typeof dependencies === "object" && Object.keys(dependencies as object).length > 0
      ? "declared_unverified"
      : "none";
    return { implicitInvocation: implicit !== false, requirementsState };
  } catch {
    return null;
  }
}
