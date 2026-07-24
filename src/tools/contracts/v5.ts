import type {
  CanonicalToolV5Addition,
  ToolContractDescriptor,
  ToolContractProjectionInput
} from "./types.js";

export const CONTRACT_V5_ADDITIONS = Object.freeze([
  "semantic"
] as const satisfies readonly CanonicalToolV5Addition[]);

const V5_DESCRIPTORS = Object.freeze({
  semantic: Object.freeze({
    name: "semantic",
    introducedIn: 5,
    modes: Object.freeze(["standard", "full"] as const),
    connectionTest: false
  })
} satisfies Record<CanonicalToolV5Addition, ToolContractDescriptor>);

export function v5ToolsForProjection(
  input: ToolContractProjectionInput
): readonly CanonicalToolV5Addition[] {
  if (input.version !== 5 || input.connectionTest) return Object.freeze([]);
  return Object.freeze(CONTRACT_V5_ADDITIONS.filter((name) =>
    (V5_DESCRIPTORS[name].modes as readonly string[]).includes(input.mode)
  ));
}

export function v5ContractDescriptor(name: CanonicalToolV5Addition): ToolContractDescriptor {
  return V5_DESCRIPTORS[name];
}
