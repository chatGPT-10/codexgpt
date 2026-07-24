import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("Phase 7 Core public documentation states the exact semantic journey and boundaries", () => {
  const readme = read("README.md");
  const readmeZh = read("README_ZH.md");
  const security = read("SECURITY.md");
  const design = read("design.md");
  const changelog = read("CHANGELOG.md");

  for (const [path, text] of [["README.md", readme], ["README_ZH.md", readmeZh]]) {
    assert.match(text, /zero[- ]setup|无需额外设置|零配置/i, `${path} must state the builtin no-setup journey`);
    assert.match(text, /definition[^\n]{0,160}references[^\n]{0,160}diagnostics|定义[^\n]{0,160}引用[^\n]{0,160}诊断/i, `${path} must name the read-only semantic operations`);
    assert.match(text, /rename_preview|重命名预览/i, `${path} must document rename preview`);
    assert.match(text, /semantic_preview_id/i, `${path} must document the apply branch`);
    assert.match(text, /codexgpt semantic status --verbose/i, `${path} must document the detailed status command`);
    assert.match(text, /codexgpt semantic disable/i, `${path} must document one-restart rollback`);
    assert.match(text, /Scan Tools|扫描工具/i, `${path} must document cached-App migration`);
    assert.match(text, /Serena[^\n]{0,220}(not bundled|unimplemented|未捆绑|未实现)|LSP[^\n]{0,220}(not bundled|unimplemented|未捆绑|未实现)/i, `${path} must not imply optional Providers are bundled`);
  }

  assert.match(security, /Contract V5 Semantic Core Boundaries/);
  assert.match(security, /same-handle[^\n]{0,220}nlink[^\n]{0,80}1/i);
  assert.match(security, /Provider[^\n]{0,220}(cannot|does not)[^\n]{0,120}(grant|write|mutat)/i);
  assert.match(security, /semanticFactsDigest/);
  assert.match(security, /execution_isolation[^\n]{0,120}none/i);

  assert.match(design, /semantic navigation/i);
  assert.match(design, /result_quality/);
  assert.match(design, /rename preview/i);

  assert.match(changelog, /Phase 7 Core/);
  assert.match(changelog, /Contract V5/);
  assert.match(changelog, /TypeScript 5\.9\.3/);
});
