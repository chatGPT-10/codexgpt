import type { ToolContractVersion } from "../../config.js";
import { canonicalToolsForVersion, v2ToolsForProjection } from "./catalog.js";
import { v3ToolsForProjection } from "./v3.js";
import { v4ToolsForProjection } from "./v4.js";
import { v5ToolsForProjection } from "./v5.js";
import type { CanonicalTool, ToolContractProjectionInput } from "./types.js";

export interface RegistrationProjection extends ToolContractProjectionInput {
  registeredV1Tools: readonly string[];
}

export function projectedRegisteredTools(input: RegistrationProjection): readonly CanonicalTool[] {
  const canonical = canonicalToolsForVersion(input.version);
  const v1 = [...new Set(input.registeredV1Tools)];
  const invalid = v1.filter((name) => !canonical.includes(name as CanonicalTool));
  if (invalid.length) throw new Error(`Registration contains non-contract tools: ${invalid.join(",")}`);
  const additions = [
    ...v2ToolsForProjection(input),
    ...v3ToolsForProjection(input),
    ...v4ToolsForProjection(input),
    ...v5ToolsForProjection(input)
  ];
  return Object.freeze([...v1, ...additions] as CanonicalTool[]);
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
