import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { upgradeCodexProSupertool } from "../dist/codexproSupertool.js";
import * as codexpro from "../dist/tools/schemas/codexpro.js";
import { writeOutputSchemaV2 } from "../dist/tools/schemas/write.js";
import { editOutputSchemaV2 } from "../dist/tools/schemas/edit.js";
import { applyPatchOutputSchemaV2 } from "../dist/tools/schemas/applyPatch.js";
import {
  commandSpecV1Schema,
  createExecutionFailure,
  runCommandInputV1Schema,
  runCommandOutputSchema,
  startProcessInputV1Schema,
  writeProcessInputV1Schema
} from "../dist/tools/schemas/execution.js";
import { openFullAccessWorkspaceInputV1Schema } from "../dist/tools/schemas/openFullAccessWorkspace.js";

const V3_ADDITIONS = [
  "open_full_access_workspace",
  "run_command",
  "start_process",
  "read_process_output",
  "write_process_input",
  "interrupt_process",
  "terminate_process",
  "resize_process_terminal",
  "list_processes"
];

test("CodexPro V3 inherits every non-Bash V2 child and adds exactly nine actions", () => {
  assert.equal(codexpro.CANONICAL_CODEXPRO_CHILD_TOOLS_V3.length, 39);
  assert.equal(codexpro.CANONICAL_CODEXPRO_CHILD_TOOLS_V3.includes("bash"), false);
  assert.deepEqual(
    codexpro.CANONICAL_CODEXPRO_CHILD_TOOLS_V3.slice(0, 30),
    codexpro.CANONICAL_CODEXPRO_CHILD_TOOLS_V2.filter((name) => name !== "bash")
  );
  assert.deepEqual(codexpro.CANONICAL_CODEXPRO_CHILD_TOOLS_V3.slice(30), V3_ADDITIONS);
  assert.strictEqual(codexpro.canonicalCodexProChildTools(3), codexpro.CANONICAL_CODEXPRO_CHILD_TOOLS_V3);
});

test("V2 and V3 supertool schema maps retain atomic write/edit/apply_patch projections", () => {
  assert.strictEqual(codexpro.CODEXPRO_CHILD_OUTPUT_SCHEMAS_V2.write, writeOutputSchemaV2);
  assert.strictEqual(codexpro.CODEXPRO_CHILD_OUTPUT_SCHEMAS_V2.edit, editOutputSchemaV2);
  assert.strictEqual(codexpro.CODEXPRO_CHILD_OUTPUT_SCHEMAS_V2.apply_patch, applyPatchOutputSchemaV2);
  assert.strictEqual(codexpro.CODEXPRO_CHILD_OUTPUT_SCHEMAS_V3.write, writeOutputSchemaV2);
  assert.strictEqual(codexpro.CODEXPRO_CHILD_OUTPUT_SCHEMAS_V3.edit, editOutputSchemaV2);
  assert.strictEqual(codexpro.CODEXPRO_CHILD_OUTPUT_SCHEMAS_V3.apply_patch, applyPatchOutputSchemaV2);
});

test("V3 has one strict output schema for every canonical direct and supertool action", () => {
  assert.deepEqual(
    Object.keys(codexpro.CODEXPRO_CHILD_OUTPUT_SCHEMAS_V3).sort(),
    [...codexpro.CANONICAL_CODEXPRO_CHILD_TOOLS_V3].sort()
  );
  for (const name of V3_ADDITIONS) {
    assert.equal(typeof codexpro.CODEXPRO_CHILD_OUTPUT_SCHEMAS_V3[name]?.safeParse, "function", name);
    assert.equal(codexpro.resolveCodexProActionV3(name), name);
  }
  assert.equal(codexpro.resolveCodexProActionV3("bash"), null);
  assert.equal(codexpro.resolveCodexProActionV3("open"), "open_current_workspace");
});

test("V3 command and root inputs are strict and never accept a generic command string", () => {
  assert.equal(commandSpecV1Schema.safeParse("npm test").success, false);
  assert.equal(commandSpecV1Schema.safeParse({ kind: "argv", executable: "npm", args: ["test"] }).success, true);
  assert.equal(commandSpecV1Schema.safeParse({ kind: "argv", executable: "tools\\runner.exe", args: [] }).success, false);
  assert.equal(commandSpecV1Schema.safeParse({ kind: "argv", executable: "C:\\tools\\runner.exe", args: [] }).success, true);
  assert.equal(commandSpecV1Schema.safeParse({ kind: "argv", executable: "npm", args: [], extra: true }).success, false);
  assert.equal(runCommandInputV1Schema.safeParse({
    command: { kind: "powershell", script: "Write-Output 'ok'", edition: "windows" },
    cwd: { kind: "workspace", path: "." },
    mode: "full_access"
  }).success, true);
  assert.equal(runCommandInputV1Schema.safeParse({ command: "Write-Output ok", mode: "full_access" }).success, false);
  assert.equal(startProcessInputV1Schema.safeParse({
    command: { kind: "argv", executable: "node", args: [] },
    cwd: { kind: "workspace" },
    mode: "workspace",
    terminal: "conpty",
    unknown: true
  }).success, false);
  assert.equal(writeProcessInputV1Schema.safeParse({
    process_id: `process_${"a".repeat(32)}`,
    data: "x",
    close: false
  }).success, true);
  assert.equal(openFullAccessWorkspaceInputV1Schema.safeParse({
    root: "D:\\work",
    access: "read_write",
    lease_ms: 600_000
  }).success, true);
  assert.equal(openFullAccessWorkspaceInputV1Schema.safeParse({
    root: "D:\\work",
    access: "read_write",
    lease_ms: 600_000,
    probe: true
  }).success, false);
});

test("V3 direct and supertool dispatch share one strict child schema handler and result projector", async () => {
  let targetCalls = 0;
  const failure = createExecutionFailure("run_command", "EXECUTION_PROFILE_DISABLED");
  const child = {
    content: [{ type: "text", text: "execution disabled" }],
    structuredContent: failure,
    isError: true
  };
  const fakeServer = {
    _registeredTools: {
      codexpro: {
        inputSchema: z.object({ action: z.string(), args: z.record(z.unknown()).optional() }).strict(),
        annotations: {},
        enabled: true,
        handler: async () => ({ structuredContent: {} })
      },
      run_command: {
        inputSchema: runCommandInputV1Schema,
        outputSchema: runCommandOutputSchema,
        enabled: true,
        handler: async () => {
          targetCalls += 1;
          return structuredClone(child);
        }
      }
    }
  };
  upgradeCodexProSupertool(fakeServer, 3);
  const args = {
    command: { kind: "argv", executable: "node", args: ["--version"] },
    cwd: { kind: "workspace" },
    mode: "full_access"
  };
  const direct = await fakeServer._registeredTools.run_command.handler(args);
  const wrapped = await fakeServer._registeredTools.codexpro.handler({ action: "run_command", args });
  assert.equal(targetCalls, 2);
  const {
    codexpro_super_action: _action,
    wrapped_tool: _tool,
    ...wrappedChild
  } = wrapped.structuredContent;
  assert.deepEqual(wrappedChild, direct.structuredContent);
  assert.equal(wrapped.structuredContent.codexpro_super_action, "run_command");
  assert.equal(wrapped.structuredContent.wrapped_tool, "run_command");

  const invalid = await fakeServer._registeredTools.codexpro.handler({
    action: "run_command",
    args: { ...args, unexpected: true }
  });
  assert.equal(invalid.structuredContent.error.code, "ACTION_ARGUMENTS_INVALID");
  assert.equal(targetCalls, 2);
  assert.equal(codexpro.resolveCodexProActionV3("full_access"), null);
});
