import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  OWNED_TEMP_MARKER,
  OWNED_TEMP_PREFIX,
  createOwnedTempEnvironment,
  createOwnedTempRoot,
  createOwnedTempRootSync,
  sweepStaleOwnedTempRoots,
  sweepStaleOwnedTempRootsSync
} from "../scripts/owned-temp-root.mjs";

async function withBase(callback) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-owned-temp-test-"));
  try {
    await callback(base);
  } finally {
    await fs.rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

function waitForLine(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("child output timeout")), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const newline = output.indexOf("\n");
      if (newline >= 0) {
        clearTimeout(timer);
        resolve(output.slice(0, newline).trim());
      }
    });
  });
}

function waitForClose(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("close", resolve));
}

test("owned temporary roots carry a strict marker and remove their complete tree", async () => {
  await withBase(async (base) => {
    const owned = await createOwnedTempRoot("unit", { baseRoot: base });
    assert.equal(path.dirname(owned.path), await fs.realpath(base));
    const marker = JSON.parse(await fs.readFile(path.join(owned.path, OWNED_TEMP_MARKER), "utf8"));
    assert.deepEqual(marker, owned.marker);
    assert.equal(marker.pid, process.pid);
    await fs.mkdir(path.join(owned.path, "nested"));
    await fs.writeFile(path.join(owned.path, "nested", "payload.txt"), "ephemeral", "utf8");
    await owned.cleanup();
    await assert.rejects(() => fs.lstat(owned.path), { code: "ENOENT" });
    await owned.cleanup();
  });
});

test("the synchronous owned-root API uses the same exact marker and claim cleanup", async () => {
  await withBase(async (base) => {
    const owned = createOwnedTempRootSync("sync", { baseRoot: base, sweep: false });
    fsSync.writeFileSync(path.join(owned.path, "payload.txt"), "ephemeral", "utf8");
    assert.equal(sweepStaleOwnedTempRootsSync({ baseRoot: base }).active, 1);
    owned.cleanupSync();
    assert.equal(fsSync.existsSync(owned.path), false);
    owned.cleanupSync();
  });
});

test("concurrent cleanup calls share one removal and all complete successfully", async () => {
  await withBase(async (base) => {
    const owned = await createOwnedTempRoot("concurrent", { baseRoot: base });
    await fs.writeFile(path.join(owned.path, "payload.txt"), "ephemeral", "utf8");
    await Promise.all(Array.from({ length: 32 }, () => owned.cleanup()));
    await assert.rejects(() => fs.lstat(owned.path), { code: "ENOENT" });
    await owned.cleanup();
  });
});

test("cleanup claims the verified root before a late replacement can occupy its public path", async () => {
  await withBase(async (base) => {
    const owned = await createOwnedTempRoot("claim-race", { baseRoot: base });
    await fs.writeFile(path.join(owned.path, "owned.txt"), "owned", "utf8");
    const rename = fs.rename;
    let claimedPath;
    fs.rename = async (source, destination) => {
      await rename(source, destination);
      if (source === owned.path) {
        claimedPath = destination;
        await fs.mkdir(source);
        await fs.writeFile(path.join(source, "replacement.txt"), "preserve", "utf8");
      }
    };
    try {
      await owned.cleanup();
    } finally {
      fs.rename = rename;
    }
    assert.equal(await fs.readFile(path.join(owned.path, "replacement.txt"), "utf8"), "preserve");
    await assert.rejects(() => fs.lstat(claimedPath), { code: "ENOENT" });
  });
});

test("sweep preserves active, non-empty unmarked, and malformed candidates", async () => {
  await withBase(async (base) => {
    const active = await createOwnedTempRoot("active", { baseRoot: base });
    const unmarked = path.join(base, `${OWNED_TEMP_PREFIX}fake-999999-aaaaaaaaaaaaaaaa-abcdef`);
    const malformed = path.join(base, `${OWNED_TEMP_PREFIX}bad-999998-bbbbbbbbbbbbbbbb-abcdef`);
    await fs.mkdir(unmarked);
    await fs.mkdir(malformed);
    await fs.writeFile(path.join(unmarked, "foreign.txt"), "preserve", "utf8");
    await fs.writeFile(path.join(malformed, OWNED_TEMP_MARKER), "{}\n", "utf8");

    const result = await sweepStaleOwnedTempRoots({ baseRoot: base });
    assert.equal(result.active, 1);
    assert.equal(result.removed, 0);
    assert.equal(result.invalid, 2);
    await Promise.all([fs.lstat(active.path), fs.lstat(unmarked), fs.lstat(malformed)]);
    await active.cleanup();
  });
});

test("sweep removes an exact empty root abandoned before its marker was written", async () => {
  await withBase(async (base) => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      windowsHide: true,
      stdio: "ignore"
    });
    const abandonedPid = child.pid;
    assert.ok(Number.isInteger(abandonedPid));
    assert.equal(child.kill("SIGKILL"), true);
    await waitForClose(child);
    const abandoned = path.join(
      base,
      `${OWNED_TEMP_PREFIX}marker-gap-${abandonedPid}-1111111111111111-abcdef`
    );
    await fs.mkdir(abandoned);

    const result = await sweepStaleOwnedTempRoots({ baseRoot: base });
    assert.equal(result.removed, 1);
    await assert.rejects(() => fs.lstat(abandoned), { code: "ENOENT" });
  });
});

test("sweep distinguishes a reused live PID from the exact process creation identity", async () => {
  await withBase(async (base) => {
    const nonce = "2222222222222222";
    const rootName = `${OWNED_TEMP_PREFIX}pid-reuse-${process.pid}-${nonce}-abcdef`;
    const candidate = path.join(base, rootName);
    await fs.mkdir(candidate);
    await fs.writeFile(path.join(candidate, OWNED_TEMP_MARKER), `${JSON.stringify({
      schemaVersion: 1,
      kind: "codexgpt-owned-temp",
      purpose: "pid-reuse",
      rootName,
      pid: process.pid,
      nonce,
      processStartedAt: "mismatched-process-identity",
      createdAt: new Date(Date.now() - 60_000).toISOString()
    })}\n`, "utf8");

    const result = await sweepStaleOwnedTempRoots({ baseRoot: base });
    assert.equal(result.removed, 1);
    await assert.rejects(() => fs.lstat(candidate), { code: "ENOENT" });
  });
});

test("bounded sweeps rotate past an active lexical prefix instead of starving stale roots", async () => {
  await withBase(async (base) => {
    const active = await createOwnedTempRoot("aaa-active", { baseRoot: base, sweep: false });
    const helperUrl = pathToFileURL(path.resolve("scripts", "owned-temp-root.mjs")).href;
    const source = [
      `import { createOwnedTempRoot } from ${JSON.stringify(helperUrl)};`,
      `const one = await createOwnedTempRoot("zzz-stale", { baseRoot: ${JSON.stringify(base)}, sweep: false });`,
      `const two = await createOwnedTempRoot("zzz-stale", { baseRoot: ${JSON.stringify(base)}, sweep: false });`,
      "process.stdout.write(`${one.path}\\0${two.path}\\n`);",
      "setInterval(() => {}, 1000);"
    ].join("\n");
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
      cwd: path.resolve("."),
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const abandoned = (await waitForLine(child)).split("\0");
    assert.equal(abandoned.length, 2);
    assert.equal(child.kill("SIGKILL"), true);
    await waitForClose(child);

    let removed = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await sweepStaleOwnedTempRoots({ baseRoot: base, limit: 1 });
      assert.equal(result.scanned, 1);
      removed += result.removed;
    }
    assert.ok(removed >= 1);
    assert.ok((await Promise.all(abandoned.map((candidate) =>
      fs.lstat(candidate).then(() => true, (error) => error.code !== "ENOENT")
    ))).includes(false));
    await active.cleanup();
  });
});

test("the next owner removes an exact marked root left by a force-terminated process", async () => {
  await withBase(async (base) => {
    const helperUrl = pathToFileURL(path.resolve("scripts", "owned-temp-root.mjs")).href;
    const source = [
      `import { createOwnedTempRoot } from ${JSON.stringify(helperUrl)};`,
      `const owned = await createOwnedTempRoot("crash-child", { baseRoot: ${JSON.stringify(base)}, sweep: false });`,
      "process.stdout.write(`${owned.path}\\n`);",
      "setInterval(() => {}, 1000);"
    ].join("\n");
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
      cwd: path.resolve("."),
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const abandoned = await waitForLine(child);
    assert.equal((await fs.lstat(abandoned)).isDirectory(), true);
    assert.equal(child.kill("SIGKILL"), true);
    await waitForClose(child);

    const result = await sweepStaleOwnedTempRoots({ baseRoot: base });
    assert.equal(result.removed, 1);
    await assert.rejects(() => fs.lstat(abandoned), { code: "ENOENT" });
  });
});

test("the next owner recovers a claimed root left between rename and removal", async () => {
  await withBase(async (base) => {
    const helperUrl = pathToFileURL(path.resolve("scripts", "owned-temp-root.mjs")).href;
    const source = [
      `import { createOwnedTempRoot } from ${JSON.stringify(helperUrl)};`,
      `const owned = await createOwnedTempRoot("claim-crash", { baseRoot: ${JSON.stringify(base)}, sweep: false });`,
      "process.stdout.write(`${owned.path}\\n`);",
      "setInterval(() => {}, 1000);"
    ].join("\n");
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
      cwd: path.resolve("."),
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const original = await waitForLine(child);
    assert.equal(child.kill("SIGKILL"), true);
    await waitForClose(child);
    const claimed = `${original}.claim-${"3".repeat(32)}`;
    await fs.rename(original, claimed);

    const result = await sweepStaleOwnedTempRoots({ baseRoot: base });
    assert.equal(result.removed, 1);
    await assert.rejects(() => fs.lstat(claimed), { code: "ENOENT" });
  });
});

test("owned child environments keep the ownership marker outside child TEMP", async () => {
  await withBase(async (base) => {
    const owned = await createOwnedTempEnvironment("child-env", {
      baseRoot: base,
      hostEnvironment: { PRESERVED: "yes" }
    });
    assert.equal(path.dirname(owned.tempPath), owned.rootPath);
    assert.equal(owned.environment.TEMP, owned.tempPath);
    assert.equal(owned.environment.TMP, owned.tempPath);
    assert.equal(owned.environment.TMPDIR, owned.tempPath);
    assert.equal(owned.environment.PRESERVED, "yes");
    const child = spawn(process.execPath, ["-e", [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "if (process.env.TEMP !== process.env.TMP || process.env.TEMP !== process.env.TMPDIR) process.exit(8);",
      "fs.writeFileSync(path.join(process.env.TEMP, 'child.txt'), 'temporary');",
      "fs.rmSync(process.env.TEMP, { recursive: true, force: true });",
      "process.exit(7);"
    ].join("\n")], {
      env: owned.environment,
      shell: false,
      windowsHide: true,
      stdio: "ignore"
    });
    const exitCode = await new Promise((resolve) => child.once("close", resolve));
    assert.equal(exitCode, 7);
    assert.equal((await fs.lstat(path.join(owned.rootPath, OWNED_TEMP_MARKER))).isFile(), true);
    await owned.cleanup();
    await assert.rejects(() => fs.lstat(owned.rootPath), { code: "ENOENT" });
  });
});

test("nested owned child environments reuse one canonical base instead of nesting TEMP roots", async () => {
  await withBase(async (base) => {
    const outer = await createOwnedTempEnvironment("outer-env", {
      baseRoot: base,
      sweep: false
    });
    let inner;
    try {
      const originalBase = process.env.CODEXGPT_OWNED_TEMP_BASE;
      process.env.CODEXGPT_OWNED_TEMP_BASE = outer.environment.CODEXGPT_OWNED_TEMP_BASE;
      try {
        inner = await createOwnedTempEnvironment("inner-env", {
          hostEnvironment: outer.environment,
          sweep: false
        });
      } finally {
        if (originalBase === undefined) delete process.env.CODEXGPT_OWNED_TEMP_BASE;
        else process.env.CODEXGPT_OWNED_TEMP_BASE = originalBase;
      }
      assert.equal(path.dirname(outer.rootPath), await fs.realpath(base));
      assert.equal(path.dirname(inner.rootPath), await fs.realpath(base));
      assert.equal(inner.rootPath.startsWith(`${outer.tempPath}${path.sep}`), false);
      assert.equal(inner.environment.CODEXGPT_OWNED_TEMP_BASE, await fs.realpath(base));
    } finally {
      await inner?.cleanup();
      await outer.cleanup();
    }
    assert.deepEqual(await fs.readdir(base), []);
  });
});

test("official ordinary/control and smoke launchers use the shared child TEMP environment", async () => {
  const [domains, smoke, packageJson] = await Promise.all([
    fs.readFile("scripts/test-domains.mjs", "utf8"),
    fs.readFile("scripts/run-smoke.mjs", "utf8"),
    fs.readFile("package.json", "utf8").then(JSON.parse)
  ]);
  assert.match(domains, /env:\s*suiteTemp\.environment/u);
  assert.match(smoke, /runScript\(script,\s*suiteTemp\.environment\)/u);
  for (const source of [domains, smoke]) {
    assert.match(source, /createOwnedTempEnvironment/u);
    assert.match(source, /finally\s*\{/u);
    assert.match(source, /\.cleanup\(\)/u);
  }
  assert.equal(packageJson.scripts.smoke, "node scripts/run-smoke.mjs");
});
