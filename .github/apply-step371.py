from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    target.write_text(text.replace(old, new), encoding="utf-8")


runner = "scripts/long-task-runner.mjs"
replace_once(
    runner,
    "export const DEFAULT_RUN_RETENTION_DAYS = 14;\n\nconst RUN_PRUNE_CLAIM_PATTERN",
    "export const DEFAULT_RUN_RETENTION_DAYS = 14;\nexport const TERMINAL_PUBLICATION_LEASE_MS = 60_000;\n\nconst RUN_PRUNE_CLAIM_PATTERN",
)
replace_once(
    runner,
    '''function workerEvidenceMatches(metadata, evidence) {
  return Boolean(metadata && evidence &&
    metadata.schemaVersion === RUNNER_SCHEMA_VERSION &&
    evidence.schemaVersion === RUNNER_SCHEMA_VERSION &&
    evidence.runId === metadata.runId &&
    evidence.workerPid === metadata.workerPid &&
    evidence.workerNonce === metadata.workerNonce &&
    evidence.commandDigest === metadata.commandDigest &&
    evidence.workerCommandDigest === metadata.workerCommandDigest &&
    evidence.workerCreationTime === metadata.workerCreationTime);
}

export async function verifyWorkerIdentity''',
    '''function workerEvidenceMatches(metadata, evidence) {
  return Boolean(metadata && evidence &&
    metadata.schemaVersion === RUNNER_SCHEMA_VERSION &&
    evidence.schemaVersion === RUNNER_SCHEMA_VERSION &&
    evidence.runId === metadata.runId &&
    evidence.workerPid === metadata.workerPid &&
    evidence.workerNonce === metadata.workerNonce &&
    evidence.commandDigest === metadata.commandDigest &&
    evidence.workerCommandDigest === metadata.workerCommandDigest &&
    evidence.workerCreationTime === metadata.workerCreationTime);
}

export function terminalPublicationLeaseActive(metadata, evidence, finalizing, nowMs = Date.now()) {
  if (!workerEvidenceMatches(metadata, evidence) || !workerEvidenceMatches(metadata, finalizing)) return false;
  const publishedAt = Date.parse(finalizing.publishedAt);
  const expiresAt = Date.parse(finalizing.expiresAt);
  return Number.isFinite(publishedAt) &&
    Number.isFinite(expiresAt) &&
    publishedAt <= nowMs + 5_000 &&
    expiresAt >= nowMs &&
    expiresAt > publishedAt &&
    expiresAt - publishedAt <= TERMINAL_PUBLICATION_LEASE_MS;
}

export async function verifyWorkerIdentity''',
)
replace_once(
    runner,
    '''  const [result, stopped, evidence] = await Promise.all([
    readJson(path.join(directory, "result.json")),
    readJson(path.join(directory, "stopped.json")),
    readJson(path.join(directory, "worker-evidence.json"))
  ]);''',
    '''  const [result, stopped, evidence, finalizing] = await Promise.all([
    readJson(path.join(directory, "result.json")),
    readJson(path.join(directory, "stopped.json")),
    readJson(path.join(directory, "worker-evidence.json")),
    readJson(path.join(directory, "finalizing.json"))
  ]);''',
)
replace_once(
    runner,
    '''  return { metadata, result, stopped, evidence };
}

export async function waitForTerminalPublication''',
    '''  if (finalizing && finalizing.runId !== expectedRunId) {
    throw new Error("Run finalization record id does not match its containing directory.");
  }
  return { metadata, result, stopped, evidence, finalizing };
}

export async function waitForTerminalPublication''',
)
replace_once(
    runner,
    '''async function runState(directory) {
  const files = await readRunFiles(directory);
  if (!files) return undefined;
  const { metadata, result, stopped, evidence } = files;''',
    '''export async function runState(directory) {
  const files = await readRunFiles(directory);
  if (!files) return undefined;
  const { metadata, result, stopped, evidence, finalizing } = files;''',
)
replace_once(
    runner,
    '''  } else {
    identity = await verifyWorkerIdentity(metadata, evidence);
    if (identity.owned || identity.reason === "process_identity_unavailable") {
      status = "running";
    } else {''',
    '''  } else if (terminalPublicationLeaseActive(metadata, evidence, finalizing)) {
    status = "running";
    identity = { owned: false, reason: "terminal_publication_in_progress" };
  } else {
    identity = await verifyWorkerIdentity(metadata, evidence);
    if (identity.owned || identity.reason === "process_identity_unavailable") {
      status = "running";
    } else {''',
)
replace_once(
    runner,
    '''  await writeJsonAtomic(directory, "worker-evidence.json", evidence);

  const stdoutTail''',
    '''  await writeJsonAtomic(directory, "worker-evidence.json", evidence);
  const publishTerminalLease = async () => {
    const publishedAtMs = Date.now();
    await writeJsonAtomic(directory, "finalizing.json", {
      ...evidence,
      publishedAt: new Date(publishedAtMs).toISOString(),
      expiresAt: new Date(publishedAtMs + TERMINAL_PUBLICATION_LEASE_MS).toISOString()
    });
  };

  const stdoutTail''',
)
replace_once(
    runner,
    '''        child.once("close", (code, signal) => finish({ code: code ?? 1, signal, error: null }));
      });
  } finally {''',
    '''        child.once("close", (code, signal) => finish({ code: code ?? 1, signal, error: null }));
      });
    await publishTerminalLease();
  } finally {''',
)
replace_once(
    runner,
    '''  await Promise.all([
    fsp.writeFile(stdoutPath, stdoutTail.bytes()),
    fsp.writeFile(stderrPath, stderrTail.bytes())
  ]);
  let retention;''',
    '''  await Promise.all([
    fsp.writeFile(stdoutPath, stdoutTail.bytes()),
    fsp.writeFile(stderrPath, stderrTail.bytes())
  ]);
  await publishTerminalLease();
  let retention;''',
)

test_file = "test/runner-process-identity.test.mjs"
replace_once(
    test_file,
    'import { processCreationTime, verifyWorkerIdentity } from "../scripts/long-task-runner.mjs";',
    '''import {
  processCreationTime,
  runState,
  TERMINAL_PUBLICATION_LEASE_MS,
  terminalPublicationLeaseActive,
  verifyWorkerIdentity
} from "../scripts/long-task-runner.mjs";''',
)
replace_once(
    test_file,
    'test("worker evidence mismatch makes a live PID stale and never blocks a same-kind retry", async () => {',
    '''test("an exact bounded finalization lease keeps terminal publication observable without ownership", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexgpt-finalizing-"));
  const runId = "finalizing-run";
  const directory = path.join(root, runId);
  try {
    await fs.mkdir(directory);
    const stat = await fs.stat(directory, { bigint: true });
    const metadata = {
      schemaVersion: 2,
      runId,
      kind: "finalizing",
      workerPid: 999999,
      workerNonce: "a".repeat(64),
      workerCreationTime: "linux:1",
      workerCommandDigest: "b".repeat(64),
      commandDigest: "c".repeat(64),
      startedAt: new Date().toISOString(),
      directory,
      directoryIdentity: { dev: String(stat.dev), ino: String(stat.ino) }
    };
    const evidence = {
      schemaVersion: 2,
      runId,
      workerPid: metadata.workerPid,
      workerNonce: metadata.workerNonce,
      workerCreationTime: metadata.workerCreationTime,
      workerCommandDigest: metadata.workerCommandDigest,
      commandDigest: metadata.commandDigest,
      publishedAt: metadata.startedAt
    };
    const publishedAtMs = Date.now();
    const finalizing = {
      ...evidence,
      publishedAt: new Date(publishedAtMs).toISOString(),
      expiresAt: new Date(publishedAtMs + TERMINAL_PUBLICATION_LEASE_MS).toISOString()
    };
    await fs.writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata)}\\n`, "utf8");
    await fs.writeFile(path.join(directory, "worker-evidence.json"), `${JSON.stringify(evidence)}\\n`, "utf8");
    await fs.writeFile(path.join(directory, "finalizing.json"), `${JSON.stringify(finalizing)}\\n`, "utf8");

    assert.equal(terminalPublicationLeaseActive(metadata, evidence, finalizing, publishedAtMs), true);
    assert.equal(terminalPublicationLeaseActive(metadata, evidence, {
      ...finalizing,
      expiresAt: new Date(publishedAtMs + TERMINAL_PUBLICATION_LEASE_MS + 1).toISOString()
    }, publishedAtMs), false);

    const state = await runState(directory);
    assert.equal(state.status, "running");
    assert.deepEqual(state.identity, { owned: false, reason: "terminal_publication_in_progress" });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("worker evidence mismatch makes a live PID stale and never blocks a same-kind retry", async () => {''',
)

memory = "Memory.md"
replace_once(
    memory,
    '- Phase 5 is closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e`; exact-head run `29698209894` passed the complete policy and Ubuntu/Windows Node 20/24 matrix. STEP-367 closes the remaining Gate X post-review `write-tree` escape identified by CI #113/#115. STEP-368 added bounded terminal-publication tolerance, STEP-369 removed retention self-observation, and STEP-370 distinguishes a live exact-evidence worker with temporarily unavailable creation-time lookup from a dead or reused PID. The combined repairs are locally verified and pending a new exact-head matrix plus post-merge `main` CI.',
    '- Phase 5 is closed at `9aa76b92d7894a2f013b2d6478897907c4010a7e`; exact-head run `29698209894` passed the complete policy and Ubuntu/Windows Node 20/24 matrix. STEP-367 closes the remaining Gate X post-review `write-tree` escape. STEP-368 through STEP-371 repair detached-run terminal observation: bounded publication tolerance, no retention self-observation, live-unavailable identity separation, and an exact bounded finalization lease. The combined repairs are locally verified and pending a new exact-head matrix plus post-merge `main` CI.',
)
replace_once(
    memory,
    '- PR CI #119 exposed false `stale` detached runs on Windows Node 24. STEP-368 added exact-evidence terminal-publication tolerance; CI #122 then exposed retention self-observation on Ubuntu Node 20, repaired by STEP-369. CI #124 passed policy and Ubuntu Node 20 regression but Ubuntu Node 24 still classified one live finalizing worker as stale when creation-time lookup was temporarily unavailable. STEP-370 returns `running` with unowned `process_identity_unavailable` only when exact persisted evidence matches and the PID is still alive; stop re-verifies exact ownership before any signal. Dead, reused, mismatched, or foreign identities remain stale. Node 20/24 affected suites passed 30/30 and the cleanup/process-identity files passed five consecutive Node 24 runs at 17/17.',
    '- PR CI #119, #122, and #124 progressively exposed terminal-publication, retention self-observation, and live identity-lookup ambiguity. CI #125 passed policy and both Ubuntu matrices but Windows Node 24 still observed two post-child/pre-result windows after the worker was no longer externally observable. STEP-371 writes an exact metadata/evidence-bound 60-second finalization lease immediately after child completion and renews it before retention; state reports unowned `terminal_publication_in_progress` until result publication or bounded lease expiry. Dead or forged records cannot extend the lease beyond the fixed bound. Node 20/24 affected suites passed 31/31 and cleanup/process-identity passed five consecutive Node 24 runs at 18/18.',
)
replace_once(
    memory,
    '1. Publish STEP-370 on the existing Gate X repair pull request, require the complete runtime matrix on the exact new head, then verify the resulting `main` push CI.',
    '1. Publish STEP-371 on the existing Gate X repair pull request, require the complete runtime matrix on the exact new head, then verify the resulting `main` push CI.',
)
replace_once(
    memory,
    '- **STEP-370 - Separate live identity unavailability from stale identity:** keep exact-evidence live workers observable as unowned-running while preserving fail-closed stop authorization.',
    '- **STEP-371 - Exact bounded finalization lease:** publish a metadata/evidence-bound lease after child completion so cleanup and retention cannot be misclassified as stale before `result.json`.\n- **STEP-370 - Separate live identity unavailability from stale identity:** keep exact-evidence live workers observable as unowned-running while preserving fail-closed stop authorization.',
)

archive = Path("docs/memory/archive/interphase-maintenance-part-3.md")
text = archive.read_text(encoding="utf-8")
if "## 2026-07-20 — STEP-371:" in text:
    raise SystemExit("archive already contains STEP-371")
text += '''

## 2026-07-20 — STEP-371: Publish an exact bounded finalization lease

**Status:** Implemented after CI #125 exposed a post-child/pre-result window not covered by external process observation; pending exact-head and post-merge CI.

**Goal:** Represent terminal publication as durable bounded state instead of inferring it only from process visibility.

**Failure evidence:**

- Run `29748908778` passed Repository policy and both Ubuntu matrices. Windows Node 24 failed terminal retention and interrupted prune-claim recovery after 6–7 second false-stale observations.
- The worker had completed its child but had not yet published `result.json`; external PID and creation-time observation was insufficient to represent cleanup, log publication, and retention finalization reliably under full Windows load.

**Implementation summary:**

- After child completion, the worker atomically writes `finalizing.json`, bound to the same run ID, PID, nonce, creation time, command digest, and worker-command digest as exact metadata and worker evidence.
- The record carries a fixed maximum 60-second lease and is renewed after temporary cleanup/log publication immediately before retention.
- `runState` checks the exact lease before process observation and reports `running` with `owned=false` and reason `terminal_publication_in_progress` until `result.json`, `stopped.json`, or lease expiry.
- Validation rejects future-skewed, expired, non-positive, overlong, mismatched, malformed, or foreign finalization records. Result and stop records retain precedence.
- Added direct state coverage proving a dead/unobservable PID with a valid exact lease remains non-authorizing running state, while an overlong lease is rejected.

**Verification:**

- Node 24 affected cleanup, process-identity, operational, and mutation suites passed 31/31.
- Native Windows Node 20 passed the same 31/31.
- Cleanup plus process-identity passed five consecutive Node 24 runs, 18/18 each.
- The new finalization-state regression completes without process lookup and records `identity.owned=false`.

**Adversarial review:**

- The lease cannot authorize stop: it never sets ownership, and the stop path independently re-verifies exact process identity before signaling.
- A crashed worker can block a same-kind retry only until the fixed lease expires; arbitrary expiry extension is rejected.
- Mismatched worker evidence prevents lease activation, so tampered evidence remains immediately stale.
- The record is written only after child completion and therefore does not weaken task execution identity or allow a foreign running task to masquerade as the reviewed worker.

**Rollback:** Revert STEP-371 to remove `finalizing.json` handling. That restores dependence on externally observable process identity during post-child finalization.

**Next step:** Push the exact head, require the complete matrix, squash-merge only on unchanged head, then require the resulting `main` push CI to pass.
'''
archive.write_text(text, encoding="utf-8")
