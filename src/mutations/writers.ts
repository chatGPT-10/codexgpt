import type { MutationProjectionInput } from "./types.js";

export function preserveMutationResult<T extends object>(
  input: MutationProjectionInput<T>
): T {
  return input.result;
}
