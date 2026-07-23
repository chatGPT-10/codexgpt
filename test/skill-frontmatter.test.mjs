import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const metadata = await tsImport("../src/guidance/skillMetadata.ts", import.meta.url).catch(() => null);

test("standard Skill YAML supports ordinary YAML scalars and bounded optional fields", () => {
  assert.ok(metadata);
  const parsed = metadata.parseSkillMetadata(
    "\ufeff---\nname: build-check\ndescription: >\n  Run build and\n  focused checks.\nlicense: MIT\ncompatibility: Windows and Linux\nmetadata:\n  owner: local\nallowed-tools: read_file\n---\n# Body\n",
    { directoryName: "build-check" }
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.metadata.name, "build-check");
  assert.equal(parsed.metadata.description, "Run build and focused checks.");
  assert.equal(parsed.metadata.license, "MIT");
  assert.equal(parsed.metadata.compatibility, "Windows and Linux");
  assert.equal(parsed.metadata.allowedTools, "read_file");
  assert.equal(parsed.legacyParse, false);
});

test("invalid YAML or missing core fields is skipped while cosmetic names warn and load", () => {
  assert.ok(metadata);
  assert.equal(metadata.parseSkillMetadata("---\nname: [\n---", { directoryName: "x" }).ok, false);
  assert.equal(metadata.parseSkillMetadata("---\nname: x\n---\n", { directoryName: "x" }).ok, false);
  const cosmetic = metadata.parseSkillMetadata("---\nname: Build_Check\ndescription: usable\n---\n", { directoryName: "other" });
  assert.equal(cosmetic.ok, true);
  assert.equal(cosmetic.specCompliant, false);
  assert.ok(cosmetic.warnings.includes("SKILL_METADATA_COMPATIBILITY_WARNING"));
});

test("aliases, custom tags, unsafe names, deep input, and oversized metadata fail closed", () => {
  assert.ok(metadata);
  assert.equal(metadata.parseSkillMetadata("---\nname: x\ndescription: &d hello\nmetadata:\n  copy: *d\n---\n", { directoryName: "x" }).ok, false);
  assert.equal(metadata.parseSkillMetadata("---\nname: ../x\ndescription: nope\n---\n", { directoryName: "x" }).ok, false);
  assert.equal(metadata.parseSkillMetadata("---\nname: x\ndescription: !unsafe value\n---\n", { directoryName: "x" }).ok, false);
  assert.equal(metadata.parseSkillMetadata(`---\nname: x\ndescription: ${"a".repeat(5000)}\n---\n`, { directoryName: "x" }).ok, false);
});

test("automatic metadata is one-line sanitized and secret-redacted", () => {
  assert.ok(metadata);
  const parsed = metadata.parseSkillMetadata("---\nname: safe\ndescription: 'Use API_TOKEN=abcdefghijklmnopqrstuvwxyz123456'\n---\n", { directoryName: "safe" });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.metadata.description.includes("abcdefghijklmnopqrstuvwxyz123456"), false);
  assert.equal(parsed.metadataRedacted, true);
});
