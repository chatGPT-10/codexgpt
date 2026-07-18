import assert from "node:assert/strict";
import test from "node:test";
import {
  parseGitBatchCheck,
  parseGitBatchObjects,
  parseGitNumstatZ,
  parseGitRawDiffZ,
  parseGitStatusPorcelainV2,
  sanitizeGitPublicOneLine
} from "../dist/git/parsers.js";

const OID_A = "a".repeat(40);
const OID_B = "b".repeat(40);

function bytes(...records) {
  return Buffer.from(records.join("\0") + "\0", "utf8");
}

test("status porcelain v2 parses branch, ordinary, rename, unmerged, untracked, ignored, unicode, and embedded whitespace", () => {
  const input = bytes(
    `# branch.oid ${OID_A}`,
    "# branch.head main",
    `1 .M N... 100644 100644 100644 ${OID_A} ${OID_A} src/space name.txt`,
    `2 R. S... 100644 100644 100644 ${OID_A} ${OID_B} R100 src/new\tname.txt`,
    "src/old\nname.txt",
    `u UU N... 100644 100644 100644 100644 ${OID_A} ${OID_B} ${OID_A} conflict.txt`,
    "? 新文件.txt",
    "! build/cache.bin"
  );

  const parsed = parseGitStatusPorcelainV2(input, "sha1");
  assert.deepEqual(parsed.head, { kind: "branch", oid: OID_A, ref: "refs/heads/main" });
  assert.equal(parsed.entries.length, 4);
  assert.deepEqual(parsed.entries[0], {
    path: "src/space name.txt",
    oldPath: null,
    index: "unmodified",
    worktree: "modified",
    submodule: false,
    ignored: false
  });
  assert.deepEqual(parsed.entries[1], {
    path: "src/new\tname.txt",
    oldPath: "src/old\nname.txt",
    index: "renamed",
    worktree: "unmodified",
    submodule: true,
    ignored: false
  });
  assert.equal(parsed.entries[2].index, "unmerged");
  assert.equal(parsed.entries[2].worktree, "unmerged");
  assert.equal(parsed.entries[3].worktree, "untracked");
  assert.deepEqual(parsed.ignoredPaths, ["build/cache.bin"]);
});

test("status porcelain v2 recognizes detached and unborn SHA-256 heads", () => {
  const detached = parseGitStatusPorcelainV2(bytes(
    `# branch.oid ${"c".repeat(64)}`,
    "# branch.head (detached)"
  ), "sha256");
  assert.deepEqual(detached.head, { kind: "detached", oid: "c".repeat(64), ref: null });

  const unborn = parseGitStatusPorcelainV2(bytes(
    "# branch.oid (initial)",
    "# branch.head topic"
  ), "sha256");
  assert.deepEqual(unborn.head, { kind: "unborn", oid: null, ref: "refs/heads/topic" });
});

test("raw and numstat NUL parsers preserve rename/copy and binary facts", () => {
  const raw = parseGitRawDiffZ(bytes(
    `:100644 100644 ${OID_A} ${OID_B} M`,
    "plain.txt",
    `:100644 100644 ${OID_A} ${OID_B} R100`,
    "old name.txt",
    "new name.txt",
    `:100644 100644 ${OID_A} ${OID_B} C090`,
    "source.txt",
    "copy.txt"
  ), "sha1");
  assert.deepEqual(raw.map((entry) => [entry.change, entry.oldPath, entry.path]), [
    ["modified", null, "plain.txt"],
    ["renamed", "old name.txt", "new name.txt"],
    ["copied", "source.txt", "copy.txt"]
  ]);

  const stats = parseGitNumstatZ(bytes(
    "3\t2\tplain.txt",
    "-\t-\tbinary.dat",
    "4\t1\t",
    "old name.txt",
    "new name.txt"
  ));
  assert.deepEqual(stats, [
    { path: "plain.txt", oldPath: null, binary: false, additions: 3, deletions: 2 },
    { path: "binary.dat", oldPath: null, binary: true, additions: null, deletions: null },
    { path: "new name.txt", oldPath: "old name.txt", binary: false, additions: 4, deletions: 1 }
  ]);
});

test("cat-file batch parsers enforce declared object types, sizes, order, and binary boundaries", () => {
  const checks = parseGitBatchCheck(Buffer.from(`${OID_A} blob 5\n${OID_B} commit 4\n`, "utf8"), "sha1");
  assert.deepEqual(checks, [
    { oid: OID_A, type: "blob", size: 5 },
    { oid: OID_B, type: "commit", size: 4 }
  ]);
  const batch = Buffer.concat([
    Buffer.from(`${OID_A} blob 5\n`, "utf8"),
    Buffer.from([0x61, 0x00, 0x62, 0x0a, 0x63]),
    Buffer.from(`\n${OID_B} commit 4\nbody\n`, "utf8")
  ]);
  const objects = parseGitBatchObjects(batch, checks, "sha1");
  assert.equal(objects[0].content.equals(Buffer.from([0x61, 0x00, 0x62, 0x0a, 0x63])), true);
  assert.equal(objects[1].content.toString("utf8"), "body");
  assert.throws(() => parseGitBatchObjects(batch.subarray(0, -1), checks, "sha1"), /GIT_OUTPUT_INVALID/);
});

test("parsers reject invalid UTF-8, malformed OIDs, incomplete rename records, and unsafe public text", () => {
  assert.throws(() => parseGitStatusPorcelainV2(Buffer.from([0xff, 0x00]), "sha1"), /GIT_OUTPUT_INVALID/);
  assert.throws(() => parseGitStatusPorcelainV2(bytes("# branch.oid abc", "# branch.head main"), "sha1"), /GIT_OUTPUT_INVALID/);
  assert.throws(() => parseGitRawDiffZ(bytes(`:100644 100644 ${OID_A} ${OID_B} R100`, "old.txt"), "sha1"), /GIT_OUTPUT_INVALID/);
  assert.equal(sanitizeGitPublicOneLine("normal subject", 240), "normal subject");
  assert.equal(sanitizeGitPublicOneLine("bad\u001b[31m", 240), null);
  assert.equal(sanitizeGitPublicOneLine("bidi\u202evalue", 240), null);
  assert.equal(sanitizeGitPublicOneLine("TOKEN=abcdefghijklmnopqrstuvwxyz123456", 240), null);
});
