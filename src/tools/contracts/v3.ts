import type { ToolContractProjectionInput } from "./types.js";
import type {
  CanonicalToolV3Addition,
  ToolContractDescriptor
} from "./types.js";

export const CONTRACT_V3_ADDITIONS = Object.freeze([
  "open_full_access_workspace",
  "run_command",
  "start_process",
  "read_process_output",
  "write_process_input",
  "interrupt_process",
  "terminate_process",
  "resize_process_terminal",
  "list_processes"
] as const satisfies readonly CanonicalToolV3Addition[]);

const V3_DESCRIPTORS = Object.freeze({
  open_full_access_workspace: Object.freeze({
    name: "open_full_access_workspace",
    introducedIn: 3,
    modes: Object.freeze(["full"] as const),
    connectionTest: false
  }),
  run_command: Object.freeze({
    name: "run_command",
    introducedIn: 3,
    modes: Object.freeze(["standard", "full"] as const),
    connectionTest: false
  }),
  start_process: Object.freeze({
    name: "start_process",
    introducedIn: 3,
    modes: Object.freeze(["full"] as const),
    connectionTest: false
  }),
  read_process_output: Object.freeze({
    name: "read_process_output",
    introducedIn: 3,
    modes: Object.freeze(["standard", "full"] as const),
    connectionTest: false
  }),
  write_process_input: Object.freeze({
    name: "write_process_input",
    introducedIn: 3,
    modes: Object.freeze(["full"] as const),
    connectionTest: false
  }),
  interrupt_process: Object.freeze({
    name: "interrupt_process",
    introducedIn: 3,
    modes: Object.freeze(["full"] as const),
    connectionTest: false
  }),
  terminate_process: Object.freeze({
    name: "terminate_process",
    introducedIn: 3,
    modes: Object.freeze(["full"] as const),
    connectionTest: false
  }),
  resize_process_terminal: Object.freeze({
    name: "resize_process_terminal",
    introducedIn: 3,
    modes: Object.freeze(["full"] as const),
    connectionTest: false
  }),
  list_processes: Object.freeze({
    name: "list_processes",
    introducedIn: 3,
    modes: Object.freeze(["full"] as const),
    connectionTest: false
  })
} satisfies Record<CanonicalToolV3Addition, ToolContractDescriptor>);

export function v3ToolsForProjection(
  input: ToolContractProjectionInput
): readonly CanonicalToolV3Addition[] {
  if (input.version !== 3 || input.connectionTest) return Object.freeze([]);
  return Object.freeze(CONTRACT_V3_ADDITIONS.filter((name) =>
    (V3_DESCRIPTORS[name].modes as readonly string[]).includes(input.mode)
  ));
}

export function v3ContractDescriptor(name: CanonicalToolV3Addition): ToolContractDescriptor {
  return V3_DESCRIPTORS[name];
}
