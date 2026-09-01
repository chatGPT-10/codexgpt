import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertBenchmarkCheckout,
  assertExactOverlayState,
  ensureSharedNodeModules,
  startInvocation
} from "../scripts/chatgpt-web-benchmark-runtime.mjs";

async function tempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writePackageIdentity(root, version = "same") {
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "codexgpt-benchmark", version }), "utf8");
  await fs.writeFile(path.join(root, "package-lock.json"), JSON.stringify({ name: "codexgpt-benchmark", lockfileVersion: 3, marker: version }), "utf8");
}

test("benchmark checkout requires exact package identity before dependencies may be shared", async () => {
  const sourceRoot = await tempDir("codexgpt-benchmark-source-");
  const checkoutRoot = await tempDir("codexgpt-benchmark-checkout-");
  try {
    await writePackageIdentity(sourceRoot, "same");
    await writePackageIdentity(checkoutRoot, "same");
    await fs.mkdir(path.join(sourceRoot, "node_modules"));

    const accepted = await assertBenchmarkCheckout({
      sourceRoot,
      checkoutRoot,
      expectedSha: "a".repeat(40),
      resolveHead: async () => "a".repeat(40),
      assertClean: async () => {}
    });
    assert.equal(accepted.head, "a".repeat(40));
    assert.equal(accepted.packageIdentityMatches, true);

    await fs.writeFile(path.join(checkoutRoot, "package-lock.json"), "different", "utf8");
    await assert.rejects(
      () => assertBenchmarkCheckout({
        sourceRoot,
        checkoutRoot,
        expectedSha: "a".repeat(40),
        resolveHead: async () => "a".repeat(40)
      }),
      /package-lock\.json.*does not match/i
    );
  } finally {
    await fs.rm(sourceRoot, { recursive: true, force: true });
    await fs.rm(checkoutRoot, { recursive: true, force: true });
  }
});

test("exact successor overlay accepts only the reviewed unstaged path and hash set", async () => {
  const checkoutRoot = await tempDir("codexgpt-benchmark-overlay-");
  try {
    await fs.mkdir(path.join(checkoutRoot, "src", "workspace"), { recursive: true });
    await fs.writeFile(path.join(checkoutRoot, "src", "config.ts"), "config-v2\n", "utf8");
    await fs.writeFile(path.join(checkoutRoot, "src", "workspace", "capabilityRegistry.ts"), "registry-v1\n", "utf8");
    const overlay = {
      schemaVersion: 1,
      label: "step493-test",
      entries: [
        {
          path: "src/config.ts",
          status: "modified",
          sha256: "ba38d1fa1f713cc6f8ee9e7bead514c246aaff315ab6e97f6b0caeada8849665"
        },
        {
          path: "src/workspace/capabilityRegistry.ts",
          status: "untracked",
          sha256: "410b7d58946f51505f471a52ef05b2cd743200df72460dc6d190d809370d19a4"
        }
      ]
    };

    const accepted = await assertExactOverlayState({
      checkoutRoot,
      expectedOverlay: overlay,
      statusText: " M src/config.ts\n?? src/workspace/capabilityRegistry.ts"
    });
    assert.equal(accepted.label, "step493-test");
    assert.equal(accepted.entries.length, 2);

    await assert.rejects(
      () => assertExactOverlayState({
        checkoutRoot,
        expectedOverlay: overlay,
        statusText: "M  src/config.ts\n?? src/workspace/capabilityRegistry.ts"
      }),
      /staged changes/i
    );
    await assert.rejects(
      () => assertExactOverlayState({
        checkoutRoot,
        expectedOverlay: overlay,
        statusText: " M src/config.ts\n?? src/workspace/capabilityRegistry.ts\n?? src/extra.ts"
      }),
      /exact reviewed overlay/i
    );
    await fs.writeFile(path.join(checkoutRoot, "src", "config.ts"), "drift\n", "utf8");
    await assert.rejects(
      () => assertExactOverlayState({
        checkoutRoot,
        expectedOverlay: overlay,
        statusText: " M src/config.ts\n?? src/workspace/capabilityRegistry.ts"
      }),
      /digest mismatch/i
    );
  } finally {
    await fs.rm(checkoutRoot, { recursive: true, force: true });
  }
});

test("benchmark checkout uses exact overlay validation instead of clean-check fallback", async () => {
  const sourceRoot = await tempDir("codexgpt-benchmark-source-");
  const checkoutRoot = await tempDir("codexgpt-benchmark-checkout-");
  try {
    await writePackageIdentity(sourceRoot);
    await writePackageIdentity(checkoutRoot);
    await fs.mkdir(path.join(sourceRoot, "node_modules"));
    await fs.mkdir(path.join(checkoutRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(checkoutRoot, "src", "config.ts"), "config-v2\n", "utf8");
    const expectedOverlay = {
      schemaVersion: 1,
      label: "step493-test",
      entries: [{
        path: "src/config.ts",
        status: "modified",
        sha256: "ba38d1fa1f713cc6f8ee9e7bead514c246aaff315ab6e97f6b0caeada8849665"
      }]
    };

    const accepted = await assertBenchmarkCheckout({
      sourceRoot,
      checkoutRoot,
      expectedSha: "a".repeat(40),
      expectedOverlay,
      resolveHead: async () => "a".repeat(40),
      assertClean: async () => assert.fail("clean fallback must not run for an exact overlay"),
      readStatus: async () => " M src/config.ts"
    });
    assert.equal(accepted.overlay?.label, "step493-test");
  } finally {
    await fs.rm(sourceRoot, { recursive: true, force: true });
    await fs.rm(checkoutRoot, { recursive: true, force: true });
  }
});

test("benchmark checkout rejects a ref mismatch before creating runtime state", async () => {
  const sourceRoot = await tempDir("codexgpt-benchmark-source-");
  const checkoutRoot = await tempDir("codexgpt-benchmark-checkout-");
  try {
    await writePackageIdentity(sourceRoot);
    await writePackageIdentity(checkoutRoot);
    await fs.mkdir(path.join(sourceRoot, "node_modules"));

    await assert.rejects(
      () => assertBenchmarkCheckout({
        sourceRoot,
        checkoutRoot,
        expectedSha: "a".repeat(40),
        resolveHead: async () => "b".repeat(40)
      }),
      /expected.*aaaaaaaa.*actual.*bbbbbbbb/i
    );
  } finally {
    await fs.rm(sourceRoot, { recursive: true, force: true });
    await fs.rm(checkoutRoot, { recursive: true, force: true });
  }
});

test("shared node_modules link is idempotent and refuses an unrelated existing path", async (context) => {
  const sourceRoot = await tempDir("codexgpt-benchmark-source-");
  const checkoutRoot = await tempDir("codexgpt-benchmark-checkout-");
  try {
    const sourceModules = path.join(sourceRoot, "node_modules");
    await fs.mkdir(sourceModules);

    try {
      const first = await ensureSharedNodeModules({ sourceRoot, checkoutRoot });
      assert.equal(first.created, true);
      assert.equal(await fs.realpath(path.join(checkoutRoot, "node_modules")), await fs.realpath(sourceModules));

      const second = await ensureSharedNodeModules({ sourceRoot, checkoutRoot });
      assert.equal(second.created, false);
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        context.skip(`link creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    await fs.rm(path.join(checkoutRoot, "node_modules"), { recursive: true, force: true });
    await fs.mkdir(path.join(checkoutRoot, "node_modules"));
    await assert.rejects(
      () => ensureSharedNodeModules({ sourceRoot, checkoutRoot }),
      /already exists.*not the approved shared dependency root/i
    );
  } finally {
    await fs.rm(sourceRoot, { recursive: true, force: true });
    await fs.rm(checkoutRoot, { recursive: true, force: true });
  }
});

test("start invocation keeps the saved profile root while authorizing exactly one benchmark target", () => {
  const invocation = startInvocation({
    checkoutRoot: "C:\\bench\\server",
    profileRoot: "D:\\Codex\\profile-root",
    targetRoot: "C:\\bench\\target-A1",
    cloudflaredPath: "C:\\Users\\Noah\\.codexgpt\\bin\\cloudflared.exe",
    nodePath: "C:\\node\\node.exe"
  });

  assert.equal(invocation.command, "C:\\node\\node.exe");
  assert.deepEqual(invocation.args, [
    "C:\\bench\\server\\scripts\\codexgpt-entry.mjs",
    "start",
    "--root",
    "D:\\Codex\\profile-root",
    "--allow-root",
    "C:\\bench\\target-A1",
    "--no-copy-url",
    "--cloudflared",
    "C:\\Users\\Noah\\.codexgpt\\bin\\cloudflared.exe",
    "--no-install-cloudflared"
  ]);
  assert.equal(invocation.args.filter((value) => value === "--allow-root").length, 1);
});
