import type { ToolContractVersion } from "../../config.js";
import { canonicalToolsForVersion, v2ToolsForProjection } from "./catalog.js";
import type { CanonicalToolV2, ToolContractProjectionInput } from "./types.js";

export interface RegistrationProjection extends ToolContractProjectionInput {
  registeredV1Tools: readonly string[];
}

export function projectedRegisteredTools(input: RegistrationProjection): readonly CanonicalToolV2[] {
  const canonical = canonicalToolsForVersion(input.version);
  const v1 = [...new Set(input.registeredV1Tools)];
  const invalid = v1.filter((name) => !canonical.includes(name as CanonicalToolV2));
  if (invalid.length) throw new Error(`Registration contains non-contract tools: ${invalid.join(",")}`);
  const additions = v2ToolsForProjection(input);
  return Object.freeze([...v1, ...additions] as CanonicalToolV2[]);
}

export function assertExactRegisteredToolUniverse(
  version: ToolContractVersion,
  registered: readonly string[]
): void {
  const expected = [...canonicalToolsForVersion(version)].sort();
  const actual = [...new Set(registered)].sort();
  if (registered.length !== actual.length || expected.length !== actual.length ||
      expected.some((name, index) => name !== actual[index])) {
    throw new Error(`Registered tool universe does not match contract V${version}.`);
  }
}
