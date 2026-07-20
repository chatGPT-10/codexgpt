import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../dist/config.js";
import {
  CONTRACT_V1_CHILD_TOOLS,
  CONTRACT_V2_CHILD_TOOLS,
  canonicalToolsForVersion,
  v2ToolsForProjection
} from "../dist/tools/contracts/index.js";
import {
  MOVE_PATHS_ERROR_MESSAGES,
  createMovePathsFailure,
  createMovePathsSuccess,
  movePathsInputV1Schema,
  movePathsOutputSchema
} from "../dist/tools/schemas/movePaths.js";

function withEnv(changes, action) {
  const previous = new Map();
  for (const [name, value] of Object.entries(changes)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return action();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function config(changes = {}) {
  return withEnv({
    CODEXGPT_MOVE_MAX_FILE_BYTES: undefined,
    CODEXGPT_MOVE_MAX_TOTAL_BYTES: undefined,
    CODEXGPT_MOVE_HASH_CONCURRENCY: undefined,
    ...changes
  }, () => loadConfig(["--bash", "off"]));
}

test("versioned catalog keeps the exact 28/31 universes immutable", () => {
  assert.equal(CONTRACT_V1_CHILD_TOOLS.length, 28);
  assert.equal(CONTRACT_V2_CHILD_TOOLS.length, 31);
  assert.equal(new Set(CONTRACT_V1_CHILD_TOOLS).size, 28);
  assert.equal(new Set(CONTRACT_V2_CHILD_TOOLS).size, 31);
  assert.strictEqual(canonicalToolsForVersion(1), CONTRACT_V1_CHILD_TOOLS);
  assert.strictEqual(canonicalToolsForVersion(2), CONTRACT_V2_CHILD_TOOLS);
  assert.equal(Object.isFrozen(CONTRACT_V1_CHILD_TOOLS), true);
  assert.equal(Object.isFrozen(CONTRACT_V2_CHILD_TOOLS), true);
});

test("V2 additions have exact mode and connection-test projections", () => {
  assert.deepEqual(v2ToolsForProjection({ version: 1, mode: "full", connectionTest: false }), []);
  assert.deepEqual(v2ToolsForProjection({ version: 2, mode: "minimal", connectionTest: false }), []);
  assert.deepEqual(v2ToolsForProjection({ version: 2, mode: "standard", connectionTest: false }), [
    "undo_change_set",
    "move_paths"
  ]);
  assert.deepEqual(v2ToolsForProjection({ version: 2, mode: "full", connectionTest: false }), [
    "query_audit_events",
    "undo_change_set",
    "move_paths"
  ]);
  assert.deepEqual(v2ToolsForProjection({ version: 2, mode: "full", connectionTest: true }), []);
});

test("move limits default exactly and reject malformed or out-of-range values", () => {
  const defaults = config();
  assert.equal(defaults.moveMaxFileBytes, 64 * 1024 * 1024);
  assert.equal(defaults.moveMaxTotalBytes, 256 * 1024 * 1024);
  assert.equal(defaults.moveHashConcurrency, 4);

  const custom = config({
    CODEXGPT_MOVE_MAX_FILE_BYTES: "1234",
    CODEXGPT_MOVE_MAX_TOTAL_BYTES: "5678",
    CODEXGPT_MOVE_HASH_CONCURRENCY: "2"
  });
  assert.equal(custom.moveMaxFileBytes, 1234);
  assert.equal(custom.moveMaxTotalBytes, 5678);
  assert.equal(custom.moveHashConcurrency, 2);

  assert.throws(() => config({ CODEXGPT_MOVE_MAX_FILE_BYTES: "1.5" }), /must be an integer/);
  assert.throws(() => config({ CODEXGPT_MOVE_MAX_TOTAL_BYTES: "0" }), /must be an integer/);
  assert.throws(() => config({ CODEXGPT_MOVE_HASH_CONCURRENCY: "17" }), /must be an integer/);
});

test("move input contract is strict, bounded, hash-guarded, and rejects ADS syntax", () => {
  const valid = {
    workspace_id: "ws_test",
    moves: [{ source: "a.txt", destination: "nested/b.txt", expected_sha256: "a".repeat(64) }]
  };
  assert.equal(movePathsInputV1Schema.parse(valid).moves.length, 1);
  assert.equal(movePathsInputV1Schema.safeParse({ ...valid, extra: true }).success, false);
  assert.equal(movePathsInputV1Schema.safeParse({ ...valid, moves: [] }).success, false);
  assert.equal(movePathsInputV1Schema.safeParse({
    ...valid,
    moves: Array.from({ length: 65 }, (_, index) => ({
      source: `s${index}.txt`, destination: `d${index}.txt`, expected_sha256: "a".repeat(64)
    }))
  }).success, false);
  assert.equal(movePathsInputV1Schema.safeParse({
    ...valid,
    moves: [{ source: "a.txt:stream", destination: "b.txt", expected_sha256: "a".repeat(64) }]
  }).success, false);
  assert.equal(movePathsInputV1Schema.safeParse({
    ...valid,
    moves: [{ source: "a.txt", destination: "b.txt", expected_sha256: "A".repeat(64) }]
  }).success, false);
});

test("move output keeps caller order and enforces preview/transaction and byte invariants", () => {
  const moves = [
    { source: "b.txt", destination: "c.txt", sha256: "b".repeat(64), bytes: 3 },
    { source: "a.txt", destination: "b.txt", sha256: "a".repeat(64), bytes: 5 }
  ];
  const preview = createMovePathsSuccess({
    workspace_id: "ws_test",
    root: "C:\\repo",
    preview: true,
    moves,
    created_directories: [],
    total_files: 2,
    total_bytes: 8,
    transaction: null
  });
  assert.deepEqual(preview.data.moves, moves);
  assert.equal(movePathsOutputSchema.safeParse(preview).success, true);
  assert.equal(movePathsOutputSchema.safeParse({
    ...preview,
    data: { ...preview.data, total_bytes: 9 }
  }).success, false);
});

test("move failures use closed messages, retryability, and bounded relative details", () => {
  for (const code of Object.keys(MOVE_PATHS_ERROR_MESSAGES)) {
    const result = createMovePathsFailure(code, { workspace_id: "ws_test", move_count: 1 });
    assert.equal(result.error.message, MOVE_PATHS_ERROR_MESSAGES[code]);
    assert.equal(movePathsOutputSchema.safeParse(result).success, true);
    assert.equal(JSON.stringify(result).includes(".codexgpt-txn-"), false);
  }
  assert.equal(createMovePathsFailure("TRANSACTION_BUSY").error.retryable, true);
  assert.equal(createMovePathsFailure("AUDIT_UNAVAILABLE").error.retryable, true);
  assert.equal(createMovePathsFailure("TRANSACTION_FAILED").error.retryable, true);
  assert.equal(createMovePathsFailure("TARGET_EXISTS").error.retryable, false);
});
