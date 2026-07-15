import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { PathGuard } from "../dist/guard.js";
import {
  AtomicTransactionEngine,
  ProcessInstanceRegistry,
  createDefaultTransactionRecoveryCoordinator
} from "../dist/transactions/index.js";

const input = JSON.parse(process.argv[2] ?? "{}");
const config = {
  blockedGlobs: [],
  maxWriteBytes: 1024 * 1024,
  moveMaxFileBytes: 64 * 1024 * 1024,
  moveMaxTotalBytes: 256 * 1024 * 1024,
  moveHashConcurrency: 4
};
const canonicalWorkspaceRoot = await fsp.realpath(input.workspaceRoot);
const workspace = {
  id: `ws_move_lock_${input.mode}`,
  root: canonicalWorkspaceRoot,
  openedAt: "2026-07-15T00:00:00.000Z"
};
const registry = new ProcessInstanceRegistry(input.stateRoot);
const recovery = createDefaultTransactionRecoveryCoordinator(config, {
  stateRoot: input.stateRoot,
  registry
});
const engine = new AtomicTransactionEngine(
  config,
  new PathGuard(config),
  input.stateRoot,
  registry,
  { recoveryCoordinator: recovery }
);

async function waitFor(file, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fsp.stat(file);
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${path.basename(file)}.`);
}

try {
  const prepared = await engine.prepareMove({
    workspace,
    moves: [{
      source: "a.txt",
      destination: "b.txt",
      expectedSha256: createHash("sha256").update("alpha").digest("hex")
    }],
    createParents: false,
    requiredParticipants: [],
    participantReferences: {}
  });
  if (input.mode === "contender") {
    await prepared.rollback("contender_unexpectedly_acquired");
    process.exitCode = 2;
  } else {
    await fsp.writeFile(input.readyPath, "ready");
    await waitFor(input.releasePath);
    const pending = await prepared.commit();
    await pending.finalize();
    process.exitCode = 0;
  }
} catch (error) {
  if (input.mode === "contender" && error?.code === "TRANSACTION_BUSY") {
    process.stdout.write(JSON.stringify({ code: error.code }));
    process.exitCode = 73;
  } else {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  }
} finally {
  recovery.dispose();
  registry.dispose();
}
