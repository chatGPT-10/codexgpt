import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedTextArtifact,
  OUTPUT_REDACTION_CAPABILITY,
  trimUtf8Bytes
} from "../scripts/output-bounds.mjs";

test("public output metadata describes known-pattern best effort rather than DLP", () => {
  assert.equal(OUTPUT_REDACTION_CAPABILITY, "best_effort_known_patterns");
});

test("trimUtf8Bytes limits the final UTF-8 payload including its truncation marker", () => {
  const maxBytes = 128;
  const result = trimUtf8Bytes("x".repeat(4096), maxBytes);

  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.text, "utf8") <= maxBytes);
  assert.match(result.text, /\[output truncated to 128 bytes\]$/);
});

test("trimUtf8Bytes does not split a multibyte UTF-8 character", () => {
  const maxBytes = 96;
  const result = trimUtf8Bytes("安全".repeat(512), maxBytes);

  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.text, "utf8") <= maxBytes);
  assert.equal(result.text.includes("�"), false);
});

test("boundedTextArtifact contains an oversized failure detail within the caller limit", () => {
  const maxBytes = 4000;
  const artifact = boundedTextArtifact(
    "# git changes unavailable",
    "captured git output ".repeat(100_000),
    maxBytes
  );

  assert.ok(Buffer.byteLength(artifact, "utf8") <= maxBytes);
  assert.match(artifact, /^# git changes unavailable/);
  assert.match(artifact, /\[output truncated to 4000 bytes\]$/);
});
