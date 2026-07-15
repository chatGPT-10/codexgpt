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
const workspace = {
  id: "ws_phase3d_child_crash",
  root: input.workspaceRoot,
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
  {
    recoveryCoordinator: recovery,
    faultInjector: {
      hit(point) {
        if (point === input.faultPoint) process.exit(86);
      }
    }
  }
);

async function directoryFact(relativePath) {
  const stat = await fsp.lstat(path.join(workspace.root, relativePath), { bigint: true });
  return {
    relativePath,
    objectIdentity: { device: stat.dev.toString(), fileId: stat.ino.toString() }
  };
}

try {
  const content = "alpha";
  const cleanup = input.mode === "cleanup";
  const participant = input.mode === "participant";
  const prepared = await engine.prepareMove({
    workspace,
    moves: [{
      source: cleanup ? "nested/deeper/b.txt" : "a.txt",
      destination: cleanup ? "a.txt" : "nested/deeper/b.txt",
      expectedSha256: createHash("sha256").update(content).digest("hex")
    }],
    createParents: !cleanup,
    removeEmptyDirectoriesAfterInstall: cleanup
      ? [await directoryFact("nested/deeper"), await directoryFact("nested")]
      : [],
    requiredParticipants: participant ? ["probe"] : [],
    participantReferences: participant ? { probe: "probe:marker" } : {}
  });
  const pending = await prepared.commit();
  if (participant) {
    await pending.commitParticipant("probe", async () => {
      await fsp.writeFile(input.markerPath, "present");
    });
  }
  await pending.finalize();
  process.exitCode = 0;
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
} finally {
  recovery.dispose();
  registry.dispose();
}
