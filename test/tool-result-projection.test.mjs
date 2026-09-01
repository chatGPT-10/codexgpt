import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  canonicalToolFailure,
  canonicalToolSuccess,
  renderCanonicalToolResult
} = await tsImport("../src/tools/runtime/result.ts", import.meta.url);

test("canonical success is rendered once without changing its classification", async () => {
  const value = { content: [{ type: "text", text: "ok" }], structuredContent: { ok: true } };
  const outcome = canonicalToolSuccess(value, 12);
  let renders = 0;
  const rendered = await renderCanonicalToolResult(outcome, {
    success(result, meta) {
      renders += 1;
      assert.equal(meta.durationMs, 12);
      return { ...result, duration: meta.durationMs };
    },
    failure() {
      throw new Error("failure renderer must not run");
    }
  });

  assert.equal(renders, 1);
  assert.equal(rendered.duration, 12);
  assert.equal(Object.isFrozen(outcome), true);
});

test("canonical failure uses only the failure renderer and preserves the original error", async () => {
  const error = new Error("boom");
  const outcome = canonicalToolFailure(error, 7, "execute");
  const rendered = await renderCanonicalToolResult(outcome, {
    success() {
      throw new Error("success renderer must not run");
    },
    failure(cause, meta) {
      assert.equal(cause, error);
      assert.equal(meta.durationMs, 7);
      assert.equal(meta.failedStage, "execute");
      return { isError: true, message: cause.message };
    }
  });

  assert.deepEqual(rendered, { isError: true, message: "boom" });
});
