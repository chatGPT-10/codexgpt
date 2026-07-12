import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const guardModuleUrl = pathToFileURL(path.join(process.cwd(), "dist", "guard.js")).href;
const { assertSafePathInput, PathGuard } = await import(guardModuleUrl);
const bs = String.fromCharCode(92);

const blockedOnlyConfig = {
  blockedGlobs: [
    ".git",
    ".git/**",
    "**/.git/**",
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    "dist",
    "dist/**",
    "**/dist/**"
  ]
};

test("Windows blocked paths are matched case-insensitively", () => {
  const guard = new PathGuard(blockedOnlyConfig, "win32");

  assert.equal(guard.isBlockedRelativePath(".ENV"), true);
  assert.equal(guard.isBlockedRelativePath("src/.GIT/config"), true);
  assert.equal(guard.isBlockedRelativePath("DIST/output.js"), true);
  assert.equal(guard.isBlockedRelativePath("src/index.ts"), false);
});

test("non-Windows blocked path matching remains case-sensitive", () => {
  const guard = new PathGuard(blockedOnlyConfig, "linux");

  assert.equal(guard.isBlockedRelativePath(".env"), true);
  assert.equal(guard.isBlockedRelativePath(".ENV"), false);
});

test("Windows special path forms are rejected before resolution", () => {
  const rejected = [
    `${bs}${bs}?${bs}C:${bs}repo${bs}file.txt`,
    `${bs}${bs}.${bs}C:${bs}repo${bs}file.txt`,
    `${bs}${bs}server${bs}share${bs}file.txt`,
    "//server/share/file.txt",
    `C:relative${bs}file.txt`,
    "file.txt:secret",
    `folder${bs}name.`,
    `folder${bs}name `,
    "CON",
    "con.txt",
    `folder${bs}LPT1.log`,
    `bad\0name`
  ];

  for (const candidate of rejected) {
    assert.throws(
      () => assertSafePathInput(candidate, "win32"),
      undefined,
      `expected Windows path to be rejected: ${JSON.stringify(candidate)}`
    );
  }
});

test("normal Windows paths remain valid", () => {
  const accepted = [
    `C:${bs}repo${bs}src${bs}file.ts`,
    `src${bs}file.ts`,
    `..${bs}sibling${bs}file.ts`,
    "."
  ];

  for (const candidate of accepted) {
    assert.doesNotThrow(() => assertSafePathInput(candidate, "win32"));
  }
});

test("Windows-only syntax restrictions do not change Linux path syntax", () => {
  assert.doesNotThrow(() => assertSafePathInput("file.txt:stream", "linux"));
  assert.doesNotThrow(() => assertSafePathInput("folder/name.", "linux"));
});

test("Windows junctions cannot escape the workspace for reads or writes", { skip: process.platform !== "win32" }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-junction-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-junction-outside-"));
  const link = path.join(root, "outside-junction");
  await fs.writeFile(path.join(outside, "secret.txt"), "outside", "utf8");
  try {
    try {
      await fs.symlink(outside, link, "junction");
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("Windows runner does not permit junction creation");
        return;
      }
      throw error;
    }

    const workspace = { id: "ws_junction", root, openedAt: new Date().toISOString() };
    const guard = new PathGuard(blockedOnlyConfig, "win32");
    assert.throws(() => guard.resolve(workspace, "outside-junction/secret.txt"), /outside workspace root|symlink/i);
    assert.throws(() => guard.resolve(workspace, "outside-junction/new.txt", { forWrite: true }), /outside the workspace|escapes workspace root/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("Windows dangling symlink write targets are rejected", { skip: process.platform !== "win32" }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-dangling-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-dangling-outside-"));
  const link = path.join(root, "dangling.txt");
  try {
    try {
      await fs.symlink(path.join(outside, "future.txt"), link, "file");
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("Windows runner does not permit symbolic link creation");
        return;
      }
      throw error;
    }

    const workspace = { id: "ws_dangling", root, openedAt: new Date().toISOString() };
    const guard = new PathGuard(blockedOnlyConfig, "win32");
    assert.throws(() => guard.resolve(workspace, "dangling.txt", { forWrite: true }), /write through a symlink/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("cross-drive paths cannot resolve inside a Windows workspace", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-path-policy-"));
  try {
    const rootDrive = path.parse(root).root.slice(0, 1).toUpperCase();
    const otherDrive = rootDrive === "Z" ? "Y" : "Z";
    const workspace = { id: "ws_path_policy", root, openedAt: new Date().toISOString() };
    const guard = new PathGuard(blockedOnlyConfig, "win32");

    assert.throws(
      () => guard.resolve(workspace, `${otherDrive}:${bs}outside${bs}file.txt`),
      /escapes workspace root/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
