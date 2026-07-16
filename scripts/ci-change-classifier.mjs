#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fsp from "node:fs/promises";

const argv = process.argv.slice(2);
function option(name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

const base = option("--base");
const head = option("--head") ?? "HEAD";
const output = option("--output") ?? process.env.GITHUB_OUTPUT;
const zeroSha = /^0{40}$/;

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout;
}

function isDocsOnlyPath(file) {
  return file === "AGENTS.md" ||
    file === "Memory.md" ||
    file === "CHANGELOG.md" ||
    file === "CONTRIBUTING.md" ||
    file === "FAQ.md" ||
    file === "FAQ_ZH.md" ||
    file === "README.md" ||
    file === "README_ZH.md" ||
    file === "SECURITY.md" ||
    file === "DOMAIN_SETUP.md" ||
    file === "PUBLIC_LAUNCH_CHECKLIST.md" ||
    file.startsWith("docs/") ||
    file.endsWith(".md");
}

let files;
if (!base || zeroSha.test(base)) {
  files = git(["diff-tree", "--no-commit-id", "--name-only", "-r", head]).split(/\r?\n/).filter(Boolean);
  if (files.length === 0) files = git(["ls-tree", "-r", "--name-only", head]).split(/\r?\n/).filter(Boolean);
} else {
  files = git(["diff", "--name-only", `${base}...${head}`]).split(/\r?\n/).filter(Boolean);
}

const docsOnly = files.length > 0 && files.every(isDocsOnlyPath);
const facts = {
  changed_files: files.length,
  docs_only: docsOnly,
  runtime: !docsOnly,
  files
};
const lines = [
  `changed_files=${facts.changed_files}`,
  `docs_only=${facts.docs_only}`,
  `runtime=${facts.runtime}`
].join("\n") + "\n";
if (output) await fsp.appendFile(output, lines, "utf8");
process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
