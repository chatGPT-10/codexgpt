import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const englishGuides = [
  "README.md",
  "FAQ.md",
  "DOMAIN_SETUP.md",
  "docs/index.html"
];

const chineseGuides = [
  "README_ZH.md",
  "FAQ_ZH.md",
  "docs/zh.html"
];

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertNoStaticBearerSetup(path, text) {
  assert.doesNotMatch(
    text,
    /Authentication:\s*Bearer token\s*\/\s*Custom Header/i,
    `${path} must not claim ChatGPT Web supports manual static Bearer setup`
  );
  assert.doesNotMatch(
    text,
    /(?:configure|配置)[^\n<]{0,160}Authorization:\s*Bearer/i,
    `${path} must not instruct ChatGPT users to configure a static Bearer header`
  );
  assert.doesNotMatch(
    text,
    /(?:connector(?:'s)?[^\n.]{0,120}Bearer credential|Bearer 凭据)/i,
    `${path} must not instruct ChatGPT users to synchronize a static Bearer credential`
  );
}

test("public authentication guides document the personal query-token flow and URL-secret risks", () => {
  for (const path of englishGuides) {
    const text = read(path);
    assertNoStaticBearerSetup(path, text);
    assert.match(text, /Authentication:\s*(?:No Authentication(?:\s*\/\s*None)?|None)/i, `${path} must document the ChatGPT authentication selection`);
    assert.match(text, /(?:query-token|query token|URL-token|codexpro_token)/i, `${path} must identify the URL credential flow`);
    for (const term of ["browser history", "clipboard", "screenshots", "logs", "copied links"]) {
      assert.match(text, new RegExp(term, "i"), `${path} must warn about ${term}`);
    }
  }

  for (const path of chineseGuides) {
    const text = read(path);
    assertNoStaticBearerSetup(path, text);
    assert.match(text, /Authentication:\s*(?:No Authentication(?:\s*\/\s*None)?|None)/i, `${path} 必须说明 ChatGPT 的认证选项`);
    assert.match(text, /(?:query-token|query token|URL-token|codexpro_token)/i, `${path} 必须说明 URL 凭据流程`);
    for (const term of ["浏览器历史", "剪贴板", "截图", "日志", "复制的链接"]) {
      assert.match(text, new RegExp(term), `${path} 必须警告：${term}`);
    }
  }
});

test("active security rules describe query-token compatibility without static Bearer claims", () => {
  const agents = read("AGENTS.md");
  const security = read("SECURITY.md");

  assert.doesNotMatch(agents, /Default CLI guidance must use Bearer authentication/i);
  assert.doesNotMatch(security, /token-free Server URL with Bearer guidance by default/i);

  for (const [path, text] of [["AGENTS.md", agents], ["SECURITY.md", security]]) {
    assert.match(text, /personal[^\n]{0,120}query-token|query-token[^\n]{0,120}personal/i, `${path} must scope query-token use to the personal compatibility flow`);
    for (const term of ["browser history", "clipboard", "screenshots", "logs", "copied links"]) {
      assert.match(text, new RegExp(term, "i"), `${path} must record the ${term} exposure risk`);
    }
  }

  assert.match(security, /Bearer[^\n]{0,160}compatible clients|compatible clients[^\n]{0,160}Bearer/i, "SECURITY.md must preserve server-side Bearer support for compatible clients");
});

test("example environment does not disable the supported personal CLI flow by default", () => {
  const example = read("config.example.env");
  assert.doesNotMatch(
    example,
    /^CODEXPRO_ALLOW_QUERY_TOKEN=0$/m,
    "config.example.env must not explicitly disable the supported public CLI query-token flow"
  );
  assert.match(example, /^# CODEXPRO_ALLOW_QUERY_TOKEN=0$/m);
  assert.match(example, /supported public CLI[^\n]{0,160}query-token/i);
});

test("runtime query-token warning explains URL exposure without recommending static Bearer", () => {
  const httpSource = read("src/http.ts");
  assert.doesNotMatch(httpSource, /Prefer Authorization:\s*Bearer/i);
  assert.match(httpSource, /browser history/i);
  assert.match(httpSource, /clipboard/i);
  assert.match(httpSource, /screenshots/i);
  assert.match(httpSource, /logs/i);
  assert.match(httpSource, /copied links/i);
});

test("explicit Bearer opt-out is described only for compatible non-ChatGPT clients", () => {
  const shim = read("scripts/connector-auth-output-shim.cjs");
  assert.doesNotMatch(shim, /open ChatGPT[^\n]{0,200}Bearer/i);
  assert.doesNotMatch(shim, /In ChatGPT[^\n]{0,200}Bearer/i);
  assert.match(shim, /compatible MCP client/i);
  assert.match(shim, /not ChatGPT Web/i);
});
