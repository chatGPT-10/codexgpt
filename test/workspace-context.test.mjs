import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const projectDetector = await tsImport("../src/context/projectDetector.ts", import.meta.url).catch(() => null);
const commandDetector = await tsImport("../src/context/commandDetector.ts", import.meta.url).catch(() => null);
const contextBudget = await tsImport("../src/context/contextBudget.ts", import.meta.url).catch(() => null);
const workspaceContext = await tsImport("../src/context/workspaceContext.ts", import.meta.url).catch(() => null);

async function withTempDir(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-workspace-context-"));
  try {
    return await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("P2 context modules expose the bounded workspace bootstrap surface", () => {
  assert.equal(typeof projectDetector?.detectProject, "function");
  assert.equal(typeof commandDetector?.detectCommands, "function");
  assert.equal(typeof contextBudget?.applyContextBudget, "function");
  assert.equal(typeof workspaceContext?.buildWorkspaceContextSnapshot, "function");
  assert.ok(workspaceContext?.workspaceContextSnapshotSchema);
});

test("project detection reports confirmed package metadata and script commands with exact sources", async () => {
  await withTempDir(async (root) => {
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
      packageManager: "npm@11.0.0",
      scripts: {
        build: "tsc -p tsconfig.json",
        test: "node --test",
        lint: "eslint .",
        typecheck: "tsc --noEmit"
      },
      devDependencies: { typescript: "^5.9.0" }
    }));
    await fs.writeFile(path.join(root, "tsconfig.json"), "{}");

    const detected = await projectDetector.detectProject({ root });
    assert.deepEqual(detected.manifests, ["package.json"]);
    assert.deepEqual(detected.packageManager, {
      value: "npm",
      source: "package.json:packageManager",
      confidence: "confirmed"
    });
    assert.ok(detected.languages.some((item) => item.value === "typescript" && item.source === "tsconfig.json" && item.confidence === "confirmed"));
    assert.deepEqual(detected.commands.build, [{
      value: "npm run build",
      source: "package.json:scripts.build",
      confidence: "confirmed"
    }]);
    assert.deepEqual(detected.commands.test, [{
      value: "npm run test",
      source: "package.json:scripts.test",
      confidence: "confirmed"
    }]);
    assert.deepEqual(detected.commands.lint, [{
      value: "npm run lint",
      source: "package.json:scripts.lint",
      confidence: "confirmed"
    }]);
    assert.deepEqual(detected.commands.typecheck, [{
      value: "npm run typecheck",
      source: "package.json:scripts.typecheck",
      confidence: "confirmed"
    }]);
  });
});

test("project detection labels lockfile and ecosystem defaults as inferred rather than confirmed", async () => {
  await withTempDir(async (root) => {
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));
    await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
    await fs.writeFile(path.join(root, "Cargo.toml"), "[package]\nname='demo'\nversion='0.1.0'\n");
    await fs.writeFile(path.join(root, "go.mod"), "module example.test/demo\n");

    const detected = await projectDetector.detectProject({ root });
    assert.deepEqual(detected.packageManager, {
      value: "pnpm",
      source: "pnpm-lock.yaml",
      confidence: "inferred"
    });
    assert.ok(detected.languages.some((item) => item.value === "rust" && item.source === "Cargo.toml"));
    assert.ok(detected.languages.some((item) => item.value === "go" && item.source === "go.mod"));
    assert.ok(detected.commands.build.some((item) => item.value === "cargo build" && item.confidence === "inferred"));
    assert.ok(detected.commands.test.some((item) => item.value === "go test ./..." && item.confidence === "inferred"));
  });
});

test("project detection covers Python, Maven, Gradle, and CMake root manifests without recursive scanning", async () => {
  await withTempDir(async (root) => {
    await fs.writeFile(path.join(root, "pyproject.toml"), "[project]\nname='demo'\n");
    await fs.writeFile(path.join(root, "pom.xml"), "<project />\n");
    await fs.writeFile(path.join(root, "build.gradle.kts"), "plugins { java }\n");
    await fs.writeFile(path.join(root, "gradlew.bat"), "@echo off\n");
    await fs.writeFile(path.join(root, "CMakeLists.txt"), "project(demo)\n");

    const detected = await projectDetector.detectProject({ root });
    assert.deepEqual(detected.manifests, ["pyproject.toml", "pom.xml", "build.gradle.kts", "CMakeLists.txt"]);
    assert.ok(detected.languages.some((item) => item.value === "python" && item.source === "pyproject.toml"));
    assert.ok(detected.languages.some((item) => item.value === "java" && item.source === "pom.xml"));
    assert.ok(detected.languages.some((item) => item.value === "c-cpp" && item.source === "CMakeLists.txt"));
    assert.ok(detected.commands.build.some((item) => item.value === "python -m build"));
    assert.ok(detected.commands.build.some((item) => item.value === "mvn package"));
    assert.ok(detected.commands.build.some((item) => item.value === ".\\gradlew.bat build"));
    assert.ok(detected.commands.build.some((item) => item.value === "cmake --build build"));
    assert.ok(detected.commands.test.some((item) => item.value === "ctest --test-dir build"));
    assert.ok(Object.values(detected.commands).flat().every((item) => item.confidence === "inferred"));
  });
});

test("context budget keeps the snapshot deterministic and inside its serialized character ceiling", () => {
  const draft = {
    workspace: { id: "ws_test", root: "D:\\Dev\\example", platform: "win32" },
    project: { manifests: [], languages: [], package_manager: null, commands: { build: [], test: [], lint: [], typecheck: [] } },
    git: { available: true, branch: "main", dirty: false, modified_files: 0, source: "git_status" },
    guidance: {
      instruction_files: Array.from({ length: 80 }, (_, index) => `nested/${index}/AGENTS.md`),
      available_skills: Array.from({ length: 120 }, (_, index) => ({
        name: `skill-${String(index).padStart(3, "0")}`,
        description: "x".repeat(300),
        source: "workspace",
        applicability: "implicit"
      })),
      detail_tools: ["codex_context", "load_skill"]
    },
    capabilities: { semantic: "available", persistent_process: "available" }
  };

  const first = contextBudget.applyContextBudget(draft, { maxChars: 1_800, maxSkills: 100, maxInstructionFiles: 50 });
  const second = contextBudget.applyContextBudget(draft, { maxChars: 1_800, maxSkills: 100, maxInstructionFiles: 50 });
  assert.deepEqual(first, second);
  assert.ok(JSON.stringify(first).length <= 1_800);
  assert.equal(first.budget.max_chars, 1_800);
  assert.equal(first.budget.truncated, true);
  assert.ok(first.budget.omitted_instruction_files > 0);
  assert.ok(first.budget.omitted_skills > 0);
  assert.equal("text" in first.guidance.instruction_files, false);
});

test("workspace snapshot parses git status and exposes lazy guidance plus capability availability", async () => {
  await withTempDir(async (root) => {
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { build: "tsc", test: "node --test" } }));
    const snapshot = await workspaceContext.buildWorkspaceContextSnapshot({
      workspace: { id: "ws_0123456789abcdef", root },
      platform: "win32",
      gitStatus: "## feature/p2...origin/feature/p2 [ahead 1]\n M src/server.ts\n?? test/new.test.mjs",
      instructionFiles: ["AGENTS.md"],
      skills: [{
        name: "workspace-skill",
        description: "Use for workspace checks.",
        source: "workspace",
        applicability: "implicit"
      }],
      capabilities: { semantic: true, persistentProcess: false }
    });

    const parsed = workspaceContext.workspaceContextSnapshotSchema.parse(snapshot);
    assert.equal(parsed.workspace.platform, "win32");
    assert.equal(parsed.git.available, true);
    assert.equal(parsed.git.branch, "feature/p2");
    assert.equal(parsed.git.dirty, true);
    assert.equal(parsed.git.modified_files, 2);
    assert.deepEqual(parsed.guidance.instruction_files, ["AGENTS.md"]);
    assert.equal(parsed.guidance.available_skills[0].description, "Use for workspace checks.");
    assert.deepEqual(parsed.guidance.detail_tools, ["codex_context", "load_skill", "tree", "git_diff"]);
    assert.equal(parsed.capabilities.semantic, "available");
    assert.equal(parsed.capabilities.persistent_process, "unavailable");
  });
});
