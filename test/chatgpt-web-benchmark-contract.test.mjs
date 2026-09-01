import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const benchmarkUrl = new URL("../docs/benchmarks/chatgpt-web-e2e/benchmark.json", import.meta.url);
const runTemplateUrl = new URL("../docs/benchmarks/chatgpt-web-e2e/run-template.json", import.meta.url);
const baselineA1RunUrl = new URL("../docs/benchmarks/chatgpt-web-e2e/runs/2026-08-16-baseline-a1.json", import.meta.url);
const readmeUrl = new URL("../docs/benchmarks/chatgpt-web-e2e/README.md", import.meta.url);

const EXPECTED_METRICS = [
  "task_success",
  "wrong_tool_calls",
  "redundant_tool_calls",
  "total_tool_calls",
  "context_fetch_calls",
  "mutation_retries",
  "verification_completed"
];

const EXPECTED_PRIMARY_KPIS = [
  "task_success_rate",
  "wrong_tool_call_rate",
  "verification_completion_rate"
];

async function readJson(url) {
  return JSON.parse(await fs.readFile(url, "utf8"));
}

test("ChatGPT Web benchmark pins a controlled A/B comparison and exact metrics", async () => {
  const benchmark = await readJson(benchmarkUrl);

  assert.equal(benchmark.schema_version, 1);
  assert.equal(benchmark.target_workspace.ref, "c43ec8ecae9782598ebc9cf90d8df8cdde1035c1");
  assert.equal(benchmark.server_variants.baseline.ref, "c43ec8ecae9782598ebc9cf90d8df8cdde1035c1");
  assert.equal(benchmark.server_variants.candidate.ref, "8a3d5dd3012c7c152fb7eea2fdb3fb91465ebc7e");
  assert.equal(benchmark.shared_server_overlay.manifest, "successor-overlay.json");
  assert.equal(benchmark.shared_server_overlay.label, "step493-oauth-cross-transport-workspace-successor");
  assert.equal(benchmark.shared_server_overlay.applies_from_case, "A2");
  assert.match(benchmark.shared_server_overlay.rule, /exact same reviewed workspace-successor overlay/i);
  assert.deepEqual(benchmark.metrics, EXPECTED_METRICS);
  assert.deepEqual(benchmark.primary_kpis, EXPECTED_PRIMARY_KPIS);
  assert.match(benchmark.isolation_rule, /fresh disposable worktree/i);
  assert.match(benchmark.isolation_rule, /same target workspace ref/i);
  assert.match(benchmark.isolation_rule, /exact same reviewed shared_server_overlay/i);
});

test("ChatGPT Web benchmark requires an exact workspace bootstrap for every case", async () => {
  const benchmark = await readJson(benchmarkUrl);

  assert.deepEqual(benchmark.runtime_bootstrap, {
    tool: "open_workspace",
    target_root_placeholder: "{TARGET_ROOT}",
    case_prompt_placeholder: "{CASE_PROMPT}",
    required_for_every_case: true,
    require_workspace_id_for_followup: true,
    counts_as_context_fetch: true,
    instruction_template: "先调用 open_workspace 打开 {TARGET_ROOT}。后续本任务所有项目工具调用都必须显式使用返回的 workspace_id，不要使用默认 workspace。完成 workspace 绑定后，再执行下面的 benchmark task：\n\n{CASE_PROMPT}"
  });
});

test("ChatGPT Web benchmark contains two fixed tasks for each A-I category", async () => {
  const benchmark = await readJson(benchmarkUrl);

  assert.equal(benchmark.cases.length, 18);
  const ids = benchmark.cases.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const category of "ABCDEFGHI") {
    const cases = benchmark.cases.filter((entry) => entry.category === category);
    assert.equal(cases.length, 2, `category ${category}`);
  }

  for (const entry of benchmark.cases) {
    assert.match(entry.id, /^[A-I][12]$/);
    assert.equal(typeof entry.title, "string");
    assert.ok(entry.title.length > 0);
    assert.equal(typeof entry.prompt, "string");
    assert.ok(entry.prompt.length > 20);
    assert.ok(["read_only", "mutation", "process", "rollback"].includes(entry.task_type));
    assert.equal(typeof entry.setup, "string");
    assert.ok(entry.setup.length > 0);
    assert.ok(Array.isArray(entry.success_criteria));
    assert.ok(entry.success_criteria.length >= 2);
    assert.ok(Array.isArray(entry.preferred_tool_intents));
    assert.ok(Array.isArray(entry.avoid_tool_intents));
    if (entry.task_type === "mutation" || entry.task_type === "rollback") {
      assert.equal(entry.verification_required, true);
    }
  }
});

test("run template records every metric without inventing uncollected evidence", async () => {
  const template = await readJson(runTemplateUrl);

  assert.equal(template.schema_version, 1);
  assert.equal(template.status, "not_run");
  assert.equal(template.server_ref, null);
  assert.equal(template.target_workspace_ref, "c43ec8ecae9782598ebc9cf90d8df8cdde1035c1");
  assert.equal(template.case_results.length, 18);

  for (const result of template.case_results) {
    assert.match(result.case_id, /^[A-I][12]$/);
    assert.equal(result.target_workspace_root, null);
    assert.equal(result.workspace_bootstrap_completed, null);
    for (const metric of EXPECTED_METRICS) {
      assert.ok(Object.hasOwn(result.metrics, metric), `${result.case_id} missing ${metric}`);
      assert.equal(result.metrics[metric], null);
    }
    assert.equal(result.notes, "");
    assert.deepEqual(result.tool_calls, []);
  }
});

test("real baseline A1 evidence records the observed workspace-handle failure without fabricating KPI completion", async () => {
  const run = await readJson(baselineA1RunUrl);

  assert.equal(run.schema_version, 1);
  assert.equal(run.status, "blocked");
  assert.equal(run.server_variant, "baseline");
  assert.equal(run.server_ref, "c43ec8ecae9782598ebc9cf90d8df8cdde1035c1");
  assert.equal(run.target_workspace_ref, "c43ec8ecae9782598ebc9cf90d8df8cdde1035c1");
  assert.equal(run.case_result.case_id, "A1");
  assert.equal(run.case_result.workspace_bootstrap_completed, false);
  assert.deepEqual(run.case_result.metrics, {
    task_success: false,
    wrong_tool_calls: 0,
    redundant_tool_calls: 1,
    total_tool_calls: 3,
    context_fetch_calls: 1,
    mutation_retries: 0,
    verification_completed: null
  });
  assert.equal(run.case_result.tool_calls.length, 3);
  assert.equal(run.case_result.tool_calls[0].tool, "open_workspace");
  assert.equal(run.case_result.tool_calls[1].outcome, "WORKSPACE_NOT_FOUND");
  assert.equal(run.case_result.tool_calls[2].redundant, true);
  assert.equal(run.case_result.failure_domain, "workspace_handle_persistence_transport_session_binding");
  assert.match(run.campaign_decision, /Do not continue to A2 or candidate/i);
});

test("benchmark documentation defines scoring denominators and the runtime evidence boundary", async () => {
  const readme = await fs.readFile(readmeUrl, "utf8");

  assert.match(readme, /Task Success Rate/i);
  assert.match(readme, /Wrong Tool Call Rate/i);
  assert.match(readme, /Verification Completion Rate/i);
  assert.match(readme, /wrong_tool_calls\s*\/\s*total_tool_calls/i);
  assert.match(readme, /exact `--allow-root/i);
  assert.match(readme, /open_workspace.*\{TARGET_ROOT\}/i);
  assert.match(readme, /workspace_id/i);
  assert.match(readme, /context_fetch_calls/i);
  assert.match(readme, /blocked after baseline A1/i);
  assert.match(readme, /runs\/2026-08-16-baseline-a1\.json/i);
  assert.match(readme, /workspace_handle_persistence_transport_session_binding/i);
});
