import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

const { defineTool } = await tsImport("../src/tools/runtime/definition.ts", import.meta.url);
const { ToolExecutionCoordinator, ToolRuntimePipeline, ToolRuntimeStageError } = await tsImport(
  "../src/tools/runtime/pipeline.ts",
  import.meta.url
);

function definition(order) {
  return defineTool({
    name: "read",
    category: "inspect",
    intent: "Read one known file.",
    useWhen: ["Path is known."],
    doNotUseWhen: ["Path is unknown."],
    inputSchema: z.object({ workspace_id: z.string(), path: z.string() }).strict(),
    outputSchema: z.object({ text: z.string() }).strict(),
    mutability: "read",
    execution: "parallel",
    workspace: "required",
    handler: async (input, context) => {
      order.push("execute");
      assert.equal(context.workspace.root, "D:/repo");
      return { text: input.path };
    }
  });
}

test("runtime pipeline cannot bypass authorization, workspace, policy, approval, execute, audit, or render", async () => {
  const order = [];
  const pipeline = new ToolRuntimePipeline({
    authorize: async () => order.push("authorization"),
    resolveWorkspace: async () => {
      order.push("workspace");
      return { id: "workspace-1", root: "D:/repo" };
    },
    policy: async (_context, next) => {
      order.push("policy");
      return next();
    },
    approve: async () => order.push("approval"),
    audit: async (_context, outcome) => {
      order.push("audit");
      assert.equal(outcome.ok, true);
    },
    render: async (_context, outcome) => {
      order.push("render");
      return outcome.ok ? outcome.value : { error: String(outcome.error) };
    }
  });

  const result = await pipeline.execute(definition(order), {
    workspace_id: "workspace-1",
    path: "README.md"
  });

  assert.deepEqual(result, { text: "README.md" });
  assert.deepEqual(order, [
    "authorization",
    "workspace",
    "policy",
    "approval",
    "execute",
    "audit",
    "render"
  ]);
});

test("authorization denial fails closed before workspace and execution", async () => {
  const order = [];
  const pipeline = new ToolRuntimePipeline({
    authorize: async () => {
      order.push("authorization");
      throw new Error("scope denied");
    },
    resolveWorkspace: async () => {
      order.push("workspace");
      return {};
    },
    policy: async (_context, next) => next(),
    approve: async () => order.push("approval"),
    audit: async (_context, outcome) => {
      order.push("audit");
      assert.equal(outcome.ok, false);
    },
    render: async (_context, outcome) => {
      order.push("render");
      throw outcome.error;
    }
  });

  await assert.rejects(
    () => pipeline.execute(definition(order), { workspace_id: "workspace-1", path: "README.md" }),
    (error) => error instanceof ToolRuntimeStageError && error.stage === "authorization"
  );
  assert.deepEqual(order, ["authorization", "audit", "render"]);
});

test("one server coordinator serializes exclusive definitions", async () => {
  const coordinator = new ToolExecutionCoordinator();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const adapters = {
    authorize: async () => undefined,
    resolveWorkspace: async () => undefined,
    policy: async (_context, next) => next(),
    approve: async () => undefined,
    audit: async () => undefined,
    render: async (_context, outcome) => outcome.ok ? outcome.value : Promise.reject(outcome.error)
  };
  const pipeline = new ToolRuntimePipeline(adapters, coordinator);
  const makeDefinition = (name, gate) => defineTool({
    name,
    category: "mutate",
    intent: `Execute ${name}.`,
    useWhen: [`${name} is required.`],
    doNotUseWhen: ["A read-only operation is sufficient."],
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ name: z.string() }).strict(),
    mutability: "write",
    execution: "exclusive",
    workspace: "none",
    handler: async () => {
      events.push(`${name}:start`);
      await gate;
      events.push(`${name}:end`);
      return { name };
    }
  });

  const first = pipeline.execute(makeDefinition("first", firstGate), {});
  await new Promise((resolve) => setImmediate(resolve));
  const second = pipeline.execute(makeDefinition("second", Promise.resolve()), {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});

test("an aborted call reaches audit and render but never policy or execute", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  const order = [];
  const pipeline = new ToolRuntimePipeline({
    authorize: async () => order.push("authorization"),
    resolveWorkspace: async () => undefined,
    policy: async (_context, next) => {
      order.push("policy");
      return next();
    },
    approve: async () => order.push("approval"),
    audit: async (_context, outcome) => {
      order.push("audit");
      assert.equal(outcome.ok, false);
    },
    render: async (_context, outcome) => {
      order.push("render");
      throw outcome.error;
    }
  });

  await assert.rejects(
    () => pipeline.execute(definition(order), { workspace_id: "workspace-1", path: "README.md" }, { signal: controller.signal }),
    (error) => error instanceof ToolRuntimeStageError && error.stage === "authorization"
  );
  assert.deepEqual(order, ["audit", "render"]);
});
