import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { renderToolDescription, toolSelectionContract } = await tsImport(
  "../src/tools/runtime/definition.ts",
  import.meta.url
);

const EXPECTATIONS = Object.freeze({
  read: ["exact file/path is already known", "file/path is unknown"],
  write: ["new file or a complete known-file replacement", "existing content must be preserved"],
  tree: ["unknown filename or directory", "exact text"],
  search: ["exact text", "semantic definitions or references"],
  semantic: ["definitions, references", "exact text"],
  workspace_snapshot: ["git status, recent commits", "deep repository topology"],
  inspect_workspace: ["languages, project types", "exact files/text"],
  codex_context: ["target-specific agents instructions", "broad repository map"],
  edit: ["small, exact single-file replacement", "multiple locations or files"],
  apply_patch: ["multiple locations or files atomically", "small, exact single-file replacement"],
  run_command: ["bounded command expected to terminate", "persistent or interactive"],
  start_process: ["persistent or interactive", "bounded command expected to terminate"]
});

test("overlapping tools expose explicit positive and negative routing guidance", () => {
  for (const [name, [usePhrase, avoidPhrase]] of Object.entries(EXPECTATIONS)) {
    const contract = toolSelectionContract(name);
    const description = renderToolDescription(name, "Base capability.");
    assert.ok(contract.useWhen.some((line) => line.toLowerCase().includes(usePhrase)), `${name} useWhen`);
    assert.ok(contract.doNotUseWhen.some((line) => line.toLowerCase().includes(avoidPhrase)), `${name} doNotUseWhen`);
    assert.match(description, /Use when:/);
    assert.match(description, /Do not use when:/);
    assert.ok(description.includes(contract.useWhen[0]));
    assert.ok(description.includes(contract.doNotUseWhen[0]));
  }
});
