import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeGitPatchText } from "../dist/redact.js";
import { GitStateTokenService } from "../dist/git/stateToken.js";
import {
  assertGitCapabilityEvidence,
  createGitCapabilityEvidence
} from "../dist/git/capabilities.js";

const COMPLETE_STATE = Object.freeze({
  schemaVersion: 1,
  repositoryId: `repo_${"a".repeat(32)}`,
  workspaceId: "workspace_1",
  contextFingerprint: "context-fingerprint",
  capabilityRevision: "b".repeat(64),
  repositoryFingerprint: "c".repeat(64),
  headDigest: "d".repeat(64),
  indexDigest: "e".repeat(64),
  worktreeDigest: "f".repeat(64),
  ignoredDigest: "1".repeat(64),
  attributesDigest: "2".repeat(64),
  scopeDigest: "3".repeat(64),
  resultDigest: "4".repeat(64),
  complete: true
});

test("Git patch sanitization removes credentials and terminal/bidi injection before retention", () => {
  const secret = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
  const raw = [
    "diff --git a/file.txt b/file.txt",
    "--- a/file.txt",
    "+++ b/file.txt",
    `+TOKEN=${secret}`,
    "+normal",
    "+escape\u001b[31mred",
    "+bidi\u202evalue"
  ].join("\n");
  const result = sanitizeGitPatchText(raw, 1_000_000);
  assert.equal(result.text.includes(secret), false);
  assert.equal(result.text.includes("\u001b"), false);
  assert.equal(result.text.includes("\u202e"), false);
  assert.equal(result.text.includes("[REDACTED_SECRET]"), true);
  assert.equal(result.secretRedacted, true);
  assert.equal(result.unsafeControlsNeutralized, true);
  assert.equal(result.truncated, false);
});

test("Git patch sanitization truncates on UTF-8 boundaries with an explicit fact", () => {
  const result = sanitizeGitPatchText("a😀b😀c", 7);
  assert.equal(Buffer.byteLength(result.text, "utf8") <= 7, true);
  assert.equal(result.truncated, true);
  assert.doesNotThrow(() => Buffer.from(result.text, "utf8").toString("utf8"));
});

test("Git capability evidence is branded and cannot be forged by matching public fields", () => {
  const executable = Object.freeze({
    schemaVersion: 1,
    realPath: "C:\\Program Files\\Git\\cmd\\git.exe",
    sha256: "a".repeat(64),
    identity: `sha256:${"a".repeat(64)}:dev:1:ino:2`,
    dev: "1",
    ino: "2",
    size: "3",
    mtimeNs: "4"
  });
  const evidence = createGitCapabilityEvidence({
    executable,
    version: "git version 2.55.0.windows.2",
    hostManifestRevision: "b".repeat(64),
    implementationRevision: "c".repeat(64)
  });
  assert.equal(assertGitCapabilityEvidence(evidence), evidence);
  assert.throws(
    () => assertGitCapabilityEvidence({ ...evidence }),
    /GIT_CAPABILITY_UNAVAILABLE/
  );
});

test("state tokens are opaque, context-bound, expiring, tamper-evident, and unavailable for incomplete state", () => {
  let now = 1_700_000_000_000;
  const service = new GitStateTokenService({
    key: Buffer.alloc(32, 7),
    now: () => now,
    ttlMs: 30_000
  });
  const token = service.mint(COMPLETE_STATE);
  assert.match(token, /^gst_[A-Za-z0-9_-]+$/);
  assert.equal(token.includes(COMPLETE_STATE.repositoryId), false);
  const expectation = {
    repositoryId: COMPLETE_STATE.repositoryId,
    workspaceId: COMPLETE_STATE.workspaceId,
    contextFingerprint: COMPLETE_STATE.contextFingerprint,
    capabilityRevision: COMPLETE_STATE.capabilityRevision,
    repositoryFingerprint: COMPLETE_STATE.repositoryFingerprint,
    headDigest: COMPLETE_STATE.headDigest,
    indexDigest: COMPLETE_STATE.indexDigest,
    worktreeDigest: COMPLETE_STATE.worktreeDigest,
    ignoredDigest: COMPLETE_STATE.ignoredDigest,
    attributesDigest: COMPLETE_STATE.attributesDigest,
    scopeDigest: COMPLETE_STATE.scopeDigest,
    resultDigest: COMPLETE_STATE.resultDigest
  };
  assert.deepEqual(service.verify(token, expectation), COMPLETE_STATE);
  assert.throws(() => service.verify(token, {
    ...expectation,
    headDigest: "0".repeat(64)
  }), /GIT_STATE_TOKEN_INVALID/);

  assert.throws(() => service.verify(token, {
    ...expectation,
    contextFingerprint: "foreign-context"
  }), /GIT_STATE_TOKEN_INVALID/);
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.throws(() => service.verify(tampered, expectation), /GIT_STATE_TOKEN_INVALID/);

  now += 31_000;
  assert.throws(() => service.verify(token, expectation), /GIT_STATE_TOKEN_INVALID/);
  assert.throws(() => service.mint({ ...COMPLETE_STATE, complete: false }), /GIT_STATE_INCOMPLETE/);
  service.dispose();
});
