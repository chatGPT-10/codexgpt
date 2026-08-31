import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

const { defineTool, toolSelectionContract } = await tsImport(
  "../src/tools/runtime/definition.ts",
  import.meta.url
);
const { ToolDefinitionRegistry } = await tsImport(
  "../src/tools/runtime/registry.ts",
  import.meta.url
);
const { canonicalToolsForVersion } = await tsImport(
  "../src/tools/contracts/catalog.ts",
  import.meta.url
);

function readDefinition() {
  return defineTool({
    name: "read",
    category: "inspect",
    intent: "Read one known text file or exact line range.",
    useWhen: ["The exact workspace-relative file path is already known."],
    doNotUseWhen: ["A filename or location still needs to be discovered."],
    inputSchema: z.object({ path: z.string().min(1) }).strict(),
    outputSchema: z.object({ text: z.string() }).strict(),
    mutability: "read",
    execution: "parallel",
    workspace: "optional",
    handler: async (input) => ({ text: input.path })
  });
}

test("tool definitions and their routing guidance are immutable", () => {
  const definition = readDefinition();
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(Object.isFrozen(definition.useWhen), true);
  assert.equal(Object.isFrozen(definition.doNotUseWhen), true);
  assert.throws(() => definition.useWhen.push("mutate"), TypeError);
  assert.throws(() => {
    definition.intent = "changed";
  }, TypeError);
});

test("registry rejects duplicate names and returns one stable definition", () => {
  const registry = new ToolDefinitionRegistry();
  const definition = readDefinition();
  registry.register(definition);

  assert.equal(registry.require("read"), definition);
  assert.deepEqual(registry.names(), ["read"]);
  assert.throws(() => registry.register(readDefinition()), /already registered/i);
  assert.throws(() => registry.require("missing"), /not registered/i);
});

test("every V5 child tool has explicit model-selection guidance", () => {
  const tools = canonicalToolsForVersion(5);
  assert.equal(tools.length, 52);
  for (const name of tools) {
    const selection = toolSelectionContract(name);
    assert.equal(selection.name, name);
    assert.ok(selection.intent.length > 0, `${name} intent`);
    assert.ok(selection.useWhen.length > 0, `${name} useWhen`);
    assert.ok(selection.doNotUseWhen.length > 0, `${name} doNotUseWhen`);
    assert.ok(["inspect", "navigate", "mutate", "verify", "process", "git", "admin"].includes(selection.category));
    assert.ok(["read", "write"].includes(selection.mutability));
    assert.ok(["parallel", "exclusive"].includes(selection.execution));
  }
});

test("server source has one MCP tool registration gateway and no Policy installation bypass", async () => {
  const source = await fs.readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.equal((source.match(/\.registerTool\(/g) ?? []).length, 1);
  assert.equal(source.includes("installPolicyKernel(server"), false);
  assert.match(source, /registerToolCompat\(/);
  assert.match(source, /executeWithPolicyKernel\(/);
});

test("P1 runtime stays locally owned and does not introduce Cordis", async () => {
  const packageSource = await fs.readFile(new URL("../package.json", import.meta.url), "utf8");
  const runtimeSources = await Promise.all([
    "definition.ts",
    "registry.ts",
    "pipeline.ts",
    "result.ts"
  ].map((name) => fs.readFile(new URL(`../src/tools/runtime/${name}`, import.meta.url), "utf8")));
  assert.doesNotMatch(packageSource, /["']cordis["']/i);
  for (const source of runtimeSources) assert.doesNotMatch(source, /from\s+["']cordis["']/i);
});
