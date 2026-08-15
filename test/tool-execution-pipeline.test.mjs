import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  ToolExecutionPipeline,
  ToolPipelineDeniedError,
  ToolPipelineProtocolError
} = await tsImport("../src/tools/executionPipeline.ts", import.meta.url);
const { readTextFile } = await tsImport("../src/fsOps.ts", import.meta.url);
const { PathGuard } = await tsImport("../src/guard.ts", import.meta.url);
const { toolExecutionPipelineForGuard } = await tsImport(
  "../src/tools/executionPipelineScope.ts",
  import.meta.url
);

test("tool execution pipeline preserves the fixed stage order", async () => {
  const order = [];
  const pipeline = new ToolExecutionPipeline();

  pipeline.usePre(() => {
    order.push("pre");
    return { kind: "allow" };
  });
  pipeline.useGuard(() => {
    order.push("guard");
    return undefined;
  });
  pipeline.useAround(async (_execution, next) => {
    order.push("around:before");
    const value = await next();
    order.push("around:after");
    return `${value}:around`;
  });
  pipeline.usePost((_execution, outcome) => {
    order.push("post");
    assert.deepEqual(outcome, { ok: true, value: "body:around" });
    return { kind: "accept" };
  });
  pipeline.observe((_execution, outcome) => {
    order.push("observe");
    assert.deepEqual(outcome, { ok: true, value: "body:around:final" });
  });

  const result = await pipeline.execute({
    toolName: "read",
    arguments: { path: "README.md" },
    body: () => {
      order.push("body");
      return "body";
    },
    finalize: (_execution, outcome) => {
      order.push("finalize");
      assert.deepEqual(outcome, { ok: true, value: "body:around" });
      return { ok: true, value: "body:around:final" };
    }
  });

  assert.equal(result, "body:around:final");
  assert.deepEqual(order, [
    "pre",
    "guard",
    "around:before",
    "body",
    "around:after",
    "post",
    "finalize",
    "observe"
  ]);
});

test("monotonic guard denial skips dispatch but still reaches post, finalize, and observation", async () => {
  const order = [];
  const pipeline = new ToolExecutionPipeline();

  pipeline.usePre(() => {
    order.push("pre");
    return { kind: "allow" };
  });
  pipeline.useGuard(() => {
    order.push("guard:deny");
    return "workspace policy denied the call";
  });
  pipeline.useGuard(() => {
    order.push("guard:must-not-run");
    return undefined;
  });
  pipeline.useAround(async (_execution, next) => {
    order.push("around:must-not-run");
    return next();
  });
  pipeline.usePost((_execution, outcome) => {
    order.push("post");
    assert.equal(outcome.ok, false);
    return { kind: "accept" };
  });
  pipeline.observe((_execution, outcome) => {
    order.push("observe");
    assert.equal(outcome.ok, false);
  });

  await assert.rejects(
    () => pipeline.execute({
      toolName: "write",
      arguments: { path: "README.md" },
      body: () => {
        order.push("body:must-not-run");
        return "unexpected";
      },
      finalize: (_execution, outcome) => {
        order.push("finalize");
        return outcome;
      }
    }),
    (error) => {
      assert.ok(error instanceof ToolPipelineDeniedError);
      assert.equal(error.code, "TOOL_PIPELINE_DENIED");
      assert.equal(error.stage, "guard");
      assert.match(error.message, /workspace policy denied the call/);
      return true;
    }
  );

  assert.deepEqual(order, ["pre", "guard:deny", "post", "finalize", "observe"]);
});

test("finalizer cannot reopen a denied execution", async () => {
  let bodyRan = false;
  let observed;
  const pipeline = new ToolExecutionPipeline();

  pipeline.useGuard(() => "hard policy denied the call");
  pipeline.observe((_execution, outcome) => {
    observed = outcome;
  });

  await assert.rejects(
    () => pipeline.execute({
      toolName: "write",
      arguments: {},
      body: () => {
        bodyRan = true;
        return "unexpected";
      },
      finalize: () => ({ ok: true, value: "bypass" })
    }),
    (error) => {
      assert.ok(error instanceof ToolPipelineProtocolError);
      assert.equal(error.code, "TOOL_PIPELINE_PROTOCOL_ERROR");
      assert.match(error.message, /cannot change success or failure classification/i);
      return true;
    }
  );

  assert.equal(bodyRan, false);
  assert.equal(observed.ok, false);
});

test("post policy can fail closed after a successful body", async () => {
  const order = [];
  const pipeline = new ToolExecutionPipeline();

  pipeline.usePost((_execution, outcome) => {
    order.push("post");
    assert.deepEqual(outcome, { ok: true, value: 42 });
    return { kind: "deny", reason: "result policy rejected the output" };
  });
  pipeline.observe((_execution, outcome) => {
    order.push("observe");
    assert.equal(outcome.ok, false);
  });

  await assert.rejects(
    () => pipeline.execute({
      toolName: "inspect_workspace",
      arguments: {},
      body: () => {
        order.push("body");
        return 42;
      },
      finalize: (_execution, outcome) => {
        order.push("finalize");
        assert.equal(outcome.ok, false);
        return outcome;
      }
    }),
    (error) => {
      assert.ok(error instanceof ToolPipelineDeniedError);
      assert.equal(error.stage, "post");
      return true;
    }
  );

  assert.deepEqual(order, ["body", "post", "finalize", "observe"]);
});

test("observer failures are contained and cannot change the tool result", async () => {
  const observerErrors = [];
  const pipeline = new ToolExecutionPipeline({
    onObserverError(error, execution) {
      observerErrors.push({ error, toolName: execution.toolName });
    }
  });

  pipeline.observe(() => {
    throw new Error("observer failed");
  });
  pipeline.observe((_execution, outcome) => {
    assert.deepEqual(outcome, { ok: true, value: "ok" });
  });

  const result = await pipeline.execute({
    toolName: "tree",
    arguments: {},
    body: () => "ok"
  });

  assert.equal(result, "ok");
  assert.equal(observerErrors.length, 1);
  assert.equal(observerErrors[0].toolName, "tree");
  assert.match(observerErrors[0].error.message, /observer failed/);
});

test("registration disposers affect future calls without mutating an in-flight snapshot", async () => {
  const seen = [];
  const pipeline = new ToolExecutionPipeline();
  let releaseFirst;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const gate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const disposeFirst = pipeline.usePre(async () => {
    seen.push("first");
    markStarted();
    await gate;
    return { kind: "allow" };
  });

  const inFlight = pipeline.execute({
    toolName: "read",
    arguments: {},
    body: () => "first-call"
  });

  await started;
  const disposeLate = pipeline.usePre(() => {
    seen.push("late");
    return { kind: "allow" };
  });
  disposeFirst();
  releaseFirst();

  assert.equal(await inFlight, "first-call");
  assert.deepEqual(seen, ["first"]);

  assert.equal(await pipeline.execute({
    toolName: "read",
    arguments: {},
    body: () => "second-call"
  }), "second-call");
  assert.deepEqual(seen, ["first", "late"]);

  disposeLate();
  assert.equal(await pipeline.execute({
    toolName: "read",
    arguments: {},
    body: () => "third-call"
  }), "third-call");
  assert.deepEqual(seen, ["first", "late"]);
});

test("read filesystem execution crosses the PathGuard-scoped pipeline without changing read semantics", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-read-pipeline-"));
  const root = await fs.realpath(temp);
  const workspace = {
    id: "ws_read_pipeline_contract",
    root,
    openedAt: new Date(0).toISOString()
  };
  const guard = new PathGuard({ blockedGlobs: [] });
  const pipeline = toolExecutionPipelineForGuard(guard);
  const seen = [];
  const dispose = pipeline.usePre((execution) => {
    seen.push({
      toolName: execution.toolName,
      arguments: execution.arguments
    });
    return { kind: "allow" };
  });

  try {
    await fs.writeFile(path.join(root, "sample.txt"), "alpha\nbeta\ngamma\n", "utf8");
    const result = await readTextFile(
      { maxReadBytes: 1024 },
      guard,
      workspace,
      "sample.txt",
      { startLine: 2, endLine: 3, maxBytes: 1024 }
    );

    assert.deepEqual(result, {
      path: "sample.txt",
      text: "2 | beta\n3 | gamma",
      startLine: 2,
      endLine: 3,
      totalLines: 4,
      bytes: 17,
      sha256: result.sha256,
      truncated: true
    });
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(seen, [
      {
        toolName: "read",
        arguments: {
          workspace_id: workspace.id,
          path: "sample.txt",
          start_line: 2,
          end_line: 3,
          max_bytes: 1024
        }
      }
    ]);
  } finally {
    dispose();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
