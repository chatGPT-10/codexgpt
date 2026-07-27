import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const planPath = path.join(
  repositoryRoot,
  "docs",
  "superpowers",
  "plans",
  "2026-07-24-phase-8-oauth-and-public-auth.md"
);
const plan = fs.readFileSync(planPath, "utf8").replace(/\r\n/g, "\n");

function powershellBlocks(source) {
  return [...source.matchAll(/```powershell\n([\s\S]*?)```/g)].map((match) => match[1]);
}

function taskSection(source, task) {
  const marker = `## 12. Task ${task}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${task} section is missing`);
  const next = source.indexOf("\n## ", start + marker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

test("Task 8A8 declares its command-contract regression", () => {
  const section = taskSection(plan, "8A8");
  assert.match(
    section,
    /### Add[\s\S]*- `test\/phase-8-plan-command-contract\.test\.mjs`/,
    "Task 8A8 must declare the command-contract test before its verification commands depend on it"
  );
});

test("every literal test path in the Phase 8 runbook exists", () => {
  const references = new Set(
    [...plan.matchAll(/\btest\/[A-Za-z0-9._/-]+\.test\.mjs\b/g)].map((match) => match[0])
  );
  assert.ok(references.size > 0, "Phase 8 runbook must contain literal test references");
  const missing = [...references].filter((relativePath) => !fs.existsSync(path.join(repositoryRoot, relativePath)));
  assert.deepEqual(missing, [], `Missing runbook test paths:\n${missing.join("\n")}`);
});

test("Phase 8 verification commands build an explicit non-empty file list instead of shell-glob expansion", () => {
  const commands = powershellBlocks(plan).join("\n");
  assert.match(commands, /\$phase8TestFiles = @\(rg --files test -g 'phase-8-\*\.test\.mjs' \| Sort-Object\)/);
  assert.match(commands, /if \(\$phase8TestFiles\.Count -eq 0\) \{ throw 'No Phase 8 tests found\.' \}/);
  assert.match(commands, /npm run test:focused -- @phase8TestFiles/);
  assert.doesNotMatch(
    commands,
    /(?:node --test|npm run test:focused --)[^\r\n]*test[\\/]phase-8-\*\.test\.mjs/,
    "Shell expansion of Phase 8 test globs is not portable between PowerShell, cmd, and Bash"
  );
});

test("every managed-toolchain command binds the retained CodexPro toolchain root", () => {
  const lines = powershellBlocks(plan)
    .flatMap((block) => block.split("\n"))
    .map((line) => line.trim())
    .filter((line) => line.includes("scripts/toolchain-manager.mjs"));
  assert.ok(lines.length > 0, "Phase 8 runbook must contain managed-toolchain commands");
  for (const line of lines) {
    assert.match(
      line,
      /scripts\/toolchain-manager\.mjs (?:status|exec|matrix)\b[^\r\n]* --root \$phase8ToolchainRoot(?:\s|$)/,
      `Managed-toolchain command omits the explicit retained root: ${line}`
    );
  }
  assert.match(
    powershellBlocks(plan).join("\n"),
    /\$phase8ToolchainRoot = Join-Path \$env:LOCALAPPDATA 'CodexPro\\toolchains'/
  );
});

test("English and Chinese onboarding freeze the exact OAuth setup, approval, rollback, and return commands", () => {
  for (const relativePath of ["README.md", "README_ZH.md"]) {
    const source = fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
    assert.match(source, /codexgpt auth setup `[\s\S]*--root D:\\Dev\\your-repo `[\s\S]*--hostname mcp\.example\.com `[\s\S]*--tunnel-name codexgpt/);
    assert.match(source, /node \.\\scripts\\codexgpt-entry\.mjs auth setup/);
    assert.match(source, /https:\/\/mcp\.example\.com\/mcp/);
    assert.match(source, /codexgpt auth open --root D:\\Dev\\your-repo/);
    assert.match(source, /codexgpt auth rollback --root D:\\Dev\\your-repo/);
    assert.match(source, /codexgpt auth setup --root D:\\Dev\\your-repo/);
    assert.match(source, /127\.0\.0\.1:8787/);
    assert.match(source, /127\.0\.0\.1:8788/);
    assert.match(source, /Scan Tools/);
    assert.match(source, /G8-U/);
  }
});

test("Phase 8 security documentation preserves the physical and authority boundaries", () => {
  const security = fs.readFileSync(path.join(repositoryRoot, "SECURITY.md"), "utf8").replace(/\r\n/g, "\n");
  for (const required of [
    "Tasks 8A1–8A9",
    "separate loopback listener",
    "dedicated named Cloudflare Tunnel",
    "two separately retained ChatGPT Apps",
    "security resets",
    "Static ChatGPT Bearer setup",
    "Cloudflare Access",
    "mTLS",
    "same-user malware",
    "G8-U"
  ]) assert.match(security, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), required);
  assert.match(security, /OAuth mode forces query-token acceptance off/);
  assert.match(security, /Never route the OAuth local-admin port/);
});

test("Cloudflare OAuth instructions reject shared or unstable ingress and retain a no-mutation preflight", () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "CLOUDFLARED_VERIFIED_INSTALL.md"), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /rejects Quick Tunnels/);
  assert.match(source, /public ingress must target only `127\.0\.0\.1:8787`/);
  assert.match(source, /127\.0\.0\.1:8788[^\n]*must never appear in Cloudflare ingress/);
  assert.match(source, /--no-tunnel-changes/);
  assert.match(source, /owner marker binds the exact profile id/);
  assert.match(source, /profile switches to OAuth only after/);
});
