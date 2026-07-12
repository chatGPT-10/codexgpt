import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const {
  SHOW_CHANGES_ANALYSIS_WARNING,
  SHOW_CHANGES_ERROR_MESSAGES,
  createShowChangesFailure,
  createShowChangesSuccess,
  showChangesOutputSchema
} = await tsImport("../src/tools/schemas/showChanges.ts", import.meta.url);

function exactAnalysis(overrides = {}) {
  return {
    schema_version: 1,
    changed_paths: ["src/server.ts"],
    affected_areas: ["src"],
    dependent_files: [
      {
        path: "src/http.ts",
        confidence: "strong",
        reasons: ["imports changed file"]
      }
    ],
    related_tests: [
      {
        path: "test/show-changes-contract.test.mjs",
        confidence: "exact",
        reasons: ["direct contract test"]
      }
    ],
    risk_signals: [
      {
        id: "public-api",
        label: "Public API",
        confidence: "strong",
        paths: ["src/server.ts"],
        reasons: ["public tool contract changed"]
      }
    ],
    recommended_commands: [
      {
        command: "npm test",
        source: "package.json",
        reasons: ["project test script"]
      }
    ],
    coverage: {
      inventoryFiles: 100,
      analyzedFiles: 90,
      scannedBytes: 100000,
      symbolCount: 200,
      relationshipCount: 300,
      truncated: false,
      warnings: []
    },
    warnings: [],
    cache: {
      hit: false,
      key: "analysis-cache-key"
    },
    ...overrides
  };
}

function changedShowChangesData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "workspace changes",
    status: "## main...origin/main\n M src/server.ts",
    changed_files: [" M src/server.ts"],
    staged: false,
    include_diff: true,
    additions: 1,
    deletions: 0,
    changed: true,
    diff: [
      "diff --git a/src/server.ts b/src/server.ts",
      "--- a/src/server.ts",
      "+++ b/src/server.ts",
      "@@ -1 +1,2 @@",
      " alpha",
      "+beta"
    ].join("\n"),
    review_since: "last_shown",
    review_marked: true,
    review_checkpoint_hit: false,
    analysis: null,
    ...overrides
  };
}

function cleanShowChangesData(overrides = {}) {
  return {
    workspace_id: "ws_0123456789abcdef",
    root: "D:\\Dev\\codexpro",
    path: "workspace changes",
    status: "## main...origin/main",
    changed_files: [],
    staged: false,
    include_diff: true,
    additions: 0,
    deletions: 0,
    changed: false,
    diff: "",
    review_since: "last_shown",
    review_marked: true,
    review_checkpoint_hit: false,
    analysis: null,
    ...overrides
  };
}

function checkpointHitData(overrides = {}) {
  return cleanShowChangesData({
    status: "## main...origin/main\n M src/server.ts",
    review_checkpoint_hit: true,
    ...overrides
  });
}

const failureCases = [
  {
    code: "WORKSPACE_NOT_FOUND",
    details: { workspace_id: "ws_missing" },
    message: "The requested workspace is not available. Open the workspace before retrying."
  },
  {
    code: "PATH_OUTSIDE_WORKSPACE",
    details: { path: "../outside" },
    message: "The requested path is outside the permitted workspace boundary."
  },
  {
    code: "PATH_BLOCKED",
    details: { path: ".git/config" },
    message: "The requested path is blocked by safety rules."
  },
  {
    code: "GIT_NOT_REPOSITORY",
    details: {},
    message: "The workspace is not a Git repository."
  },
  {
    code: "GIT_UNAVAILABLE",
    details: {},
    message: "Git is not available to review this workspace."
  },
  {
    code: "GIT_COMMAND_FAILED",
    details: {},
    message: "Git could not review the workspace changes."
  },
  {
    code: "INTERNAL_ERROR",
    details: {},
    message: "The workspace changes could not be reviewed because of an internal error."
  }
];

test("show_changes success constructor produces the strict schema-v1 envelope", () => {
  const cases = [
    changedShowChangesData(),
    cleanShowChangesData(),
    checkpointHitData(),
    changedShowChangesData({
      include_diff: false,
      diff: "",
      review_marked: false
    }),
    changedShowChangesData({
      status: "## main...origin/main\n?? new.txt",
      changed_files: ["?? new.txt"],
      additions: 0,
      deletions: 0,
      diff: ""
    }),
    changedShowChangesData({
      additions: 0,
      deletions: 0,
      diff: "diff --git a/demo.txt b/demo.txt\nold mode 100644\nnew mode 100755"
    }),
    changedShowChangesData({ analysis: exactAnalysis() })
  ];

  for (const expectedData of cases) {
    const parsed = showChangesOutputSchema.parse(
      createShowChangesSuccess(expectedData, 7)
    );

    assert.deepEqual(Object.keys(parsed).sort(), [
      "codexpro_title",
      "codexpro_tool",
      "data",
      "error",
      "meta",
      "ok"
    ]);
    assert.equal(parsed.codexpro_tool, "show_changes");
    assert.equal(parsed.codexpro_title, "Show Changes");
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, expectedData);
    assert.equal(parsed.error, null);
    assert.equal("status_error" in parsed, false);
    assert.equal("diff_error" in parsed, false);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 7,
      warnings: []
    });
  }
});

test("show_changes success constructor preserves only the fixed analysis warning", () => {
  const parsed = showChangesOutputSchema.parse(
    createShowChangesSuccess(
      changedShowChangesData(),
      4,
      [SHOW_CHANGES_ANALYSIS_WARNING]
    )
  );

  assert.deepEqual(parsed.meta, {
    schemaVersion: 1,
    durationMs: 4,
    warnings: [
      "Change analysis was unavailable; Git review data is still complete."
    ]
  });
});

test("show_changes failure constructor produces each approved strict error", () => {
  for (const expected of failureCases) {
    const parsed = showChangesOutputSchema.parse(
      createShowChangesFailure(
        { code: expected.code, details: expected.details },
        3
      )
    );

    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.deepEqual(parsed.error, {
      code: expected.code,
      message: expected.message,
      retryable: false,
      details: expected.details
    });
    assert.equal(SHOW_CHANGES_ERROR_MESSAGES[expected.code], expected.message);
    assert.deepEqual(parsed.meta, {
      schemaVersion: 1,
      durationMs: 3,
      warnings: []
    });
  }
});

test("show_changes schema rejects unknown, legacy, malformed analysis, and invalid review states", () => {
  const changed = createShowChangesSuccess(changedShowChangesData(), 0);
  const clean = createShowChangesSuccess(cleanShowChangesData(), 0);
  const checkpoint = createShowChangesSuccess(checkpointHitData(), 0);
  const statsOnly = createShowChangesSuccess(
    changedShowChangesData({
      include_diff: false,
      diff: "",
      review_marked: false
    }),
    0
  );

  assert.throws(() => showChangesOutputSchema.parse({ ...changed, extra: true }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: { ...changed.data, status_error: "legacy" }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: { ...changed.data, diff_error: "legacy" }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: { ...changed.data, additions: -1 }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...clean,
    data: { ...clean.data, changed_files: [" M demo.txt"] }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...clean,
    data: { ...clean.data, additions: 1 }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...statsOnly,
    data: { ...statsOnly.data, diff: "raw diff" }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...statsOnly,
    data: { ...statsOnly.data, review_marked: true }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...statsOnly,
    data: { ...statsOnly.data, review_checkpoint_hit: true }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...checkpoint,
    data: { ...checkpoint.data, review_since: "workspace" }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...checkpoint,
    data: { ...checkpoint.data, changed: true }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...checkpoint,
    data: { ...checkpoint.data, analysis: exactAnalysis() }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: { ...changed.data, changed: false }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...clean,
    data: { ...clean.data, analysis: exactAnalysis() }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: {
      ...changed.data,
      analysis: exactAnalysis({
        dependent_files: [{
          path: "src/http.ts",
          confidence: "guess",
          reasons: []
        }]
      })
    }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: {
      ...changed.data,
      analysis: exactAnalysis({
        risk_signals: [{
          id: "unknown-risk",
          label: "Unknown",
          confidence: "strong",
          paths: [],
          reasons: []
        }]
      })
    }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: {
      ...changed.data,
      analysis: exactAnalysis({
        coverage: { ...exactAnalysis().coverage, extra: true }
      })
    }
  }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...changed,
    data: {
      ...changed.data,
      analysis: exactAnalysis({ cache: { hit: false } })
    }
  }));
});

test("show_changes schema rejects inconsistent success and failure envelope states", () => {
  const success = createShowChangesSuccess(changedShowChangesData(), 0);
  const failure = createShowChangesFailure(
    { code: "INTERNAL_ERROR", details: {} },
    0
  );

  assert.throws(() => showChangesOutputSchema.parse({ ...success, data: null }));
  assert.throws(() => showChangesOutputSchema.parse({ ...success, error: failure.error }));
  assert.throws(() => showChangesOutputSchema.parse({
    ...failure,
    data: cleanShowChangesData()
  }));
  assert.throws(() => showChangesOutputSchema.parse({ ...failure, error: null }));
});
