import type { z } from "zod";
import type { ToolContractVersion } from "../../config.js";
import { canonicalToolsForVersion } from "./catalog.js";
import type { CanonicalTool } from "./types.js";

export type ContractSchemaMap = Readonly<Partial<Record<CanonicalTool, z.ZodTypeAny>>>;

export function assertCompleteContractSchemaMap(
  version: ToolContractVersion,
  schemas: ContractSchemaMap
): void {
  const expected = canonicalToolsForVersion(version);
  const actual = Object.keys(schemas).sort();
  const missing = expected.filter((name) => !(name in schemas));
  const extra = actual.filter((name) => !expected.includes(name as CanonicalTool));
  if (missing.length || extra.length) {
    throw new Error(`Contract schema map mismatch: missing=${missing.join(",")}; extra=${extra.join(",")}`);
  }
}
