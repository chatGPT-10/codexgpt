import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

test("V5 startup and doctor provide one honest cached-App migration action", () => {
  const launcher = fs.readFileSync("scripts/codexgpt.mjs", "utf8");
  assert.match(launcher, /52 tools/);
  assert.match(launcher, /Scan Tools once or recreate the App/);
  assert.doesNotMatch(launcher, /transparent(?:ly)? refresh/i);
});
