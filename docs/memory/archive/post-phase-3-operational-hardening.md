# Post-Phase 3 Operational Hardening

## STEP-307 - Convert Phase 3D operational lessons into enforceable repository policy

**Date:** 2026-07-15  
**Status:** Implemented and locally verified; unstaged, uncommitted, and unpushed.  
**Scope:** Phase 3D P0/P1 prevention rules, CI operations, Windows GitHub CLI discovery, exact-head closure, connector-safe long tasks, pinned Node reproduction, mutation review identity, deterministic filesystem fixtures, and bounded large-file reads.

### Problem statement

The Phase 3D publication and adversarial repair cycle exposed four operational classes that could not remain narrative-only knowledge:

1. native Windows GitHub CLI authentication depended on user-profile and keyring configuration paths that the isolated child environment did not consistently inherit;
2. CI diagnosis required too many API, HTML, and full-log fallbacks, while complete failed logs could exceed the connector response budget;
3. recording the final successful CI run in a new repository commit recursively created another exact HEAD that itself required CI;
4. long regression, Smoke, handoff, signal, and process-tree tasks could outlive a connector 502, leaving duplicate or orphaned test trees and contaminating later results.

A separate read-cap question was also resolved from first principles: the connector must be able to scan a larger text file for an explicit line range, but increasing the amount returned in one tool response is not a valid fix for a control-channel 502.

### Repository-enforced solution

#### Bounded CLI environment and GitHub diagnostics

- Added `src/cliEnvironment.ts` as the common bounded child-environment constructor.
- Native Windows derives or preserves only the user/configuration paths needed for ordinary CLI and keyring discovery, including `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, and `GH_CONFIG_DIR`.
- GitHub diagnostic scripts remove inherited `CI` mode where interactive configuration discovery would otherwise be distorted.
- `GH_TOKEN` and `GITHUB_TOKEN` are deleted from the bounded environment; credentials are not copied from the parent process.
- `src/bashOps.ts` delegates its isolated environment construction to the same implementation, eliminating divergent Windows behavior.
- Added `scripts/exact-head-ci.mjs` for bounded `gh auth`, exact full-SHA run lookup, exact-run verification, and structured evidence.
- Added `scripts/ci-failure-summary.mjs` to stream only failed-step logs and retain the first TAP failure, assertion, expected/actual values, stack, and process-exit markers.

A live `gh auth status` through the bounded environment succeeded for account `chatGPT-10` using the Windows keyring. The exact-head verifier successfully bound closure commit `3a040647da1f443513ea8348cc3c02a0603ca9b0` to successful run `29443158835`. Evidence output was accepted only below ignored `.ai-bridge/ci-evidence/`. The compact failure reader was exercised against failed run `29437987007` and surfaced the first underlying assertion without returning the complete regression log.

#### Non-recursive exact-head closure

The closure protocol is now explicit and testable:

- a phase is closed by the closure commit SHA plus a successful exact-head run for that SHA;
- the run ID is external evidence and may be recorded below ignored `.ai-bridge/`, in a CI summary, or in the next normal repository change;
- a successful closure run must never create a follow-up repository commit whose only purpose is to record that run ID;
- `scripts/exact-head-ci.mjs --output` rejects destinations outside `.ai-bridge/` and emits `repositoryWriteRequired: false`.

This removes the infinite sequence in which each “final CI result” documentation commit creates a newer unverified HEAD.

#### Connector-safe long-task ownership

Added `scripts/long-task-runner.mjs` with:

- unique run IDs and per-run directories;
- worker and child PID records;
- exact command, working-directory, start, stop, and completion metadata;
- bounded stdout/stderr files plus structured result JSON;
- duplicate-kind rejection while a prior run is active;
- exact recorded process-tree termination only;
- explicit `running`, `completed`, `stopped`, and `orphaned` states;
- rejection of secret-looking command arguments before metadata is persisted.

Added `scripts/test-domains.mjs` as the authoritative test partition. Ordinary tests can run locally through the detached runner. The following connector-hostile tests are frozen as the control domain and fail closed in connector-backed local execution:

- `handoff-to-agent-contract.test.mjs`
- `handoff-to-codex-contract.test.mjs`
- `phase-3d-child-crash-oracle.test.mjs`
- `phase-3d-multiprocess-lock.test.mjs`
- `wait-for-handoff-contract.test.mjs`

The control or complete domain is allowed only in GitHub Actions or an independently proven native process domain. `test/test-domain-classification.test.mjs` proves that every discovered test belongs to exactly one domain and that the control list cannot drift silently.

A direct connector run of `handoff-to-agent-contract.test.mjs` reproduced a 502 and left duplicate process trees. Their exact command lines and parentage were identified, only the matching roots were terminated, and a subsequent query proved that no matching process remained. This demonstrated that the 502 was a process-control problem, not a single-file read-limit problem.

#### Pinned Windows Node toolchains and supply-chain records

Added `scripts/toolchains.json` and `scripts/toolchain-manager.mjs`:

- stable root: `%LOCALAPPDATA%\CodexPro\toolchains`;
- Node 20 pinned to `20.20.2`;
- Node 24 pinned to `24.15.0`;
- archives downloaded only from the official Node distribution;
- archive digests verified against official `SHASUMS256.txt` before extraction;
- local `manifest.json` records version, platform, source URLs, digest, install path, and verification time;
- `node`, `npm`, and npm-launched child scripts receive the exact pinned executable through `PATH`, `NODE`, `npm_node_execpath`, and `npm_execpath`.

Installed and verified records:

- Node 20 archive SHA-256: `dc3700fdd57a63eedb8fd7e3c7baaa32e6a740a1b904167ff4204bc68ed8bf77`;
- Node 24 archive SHA-256: `cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62`.

The former Temp-based Node 20 copy was not deleted in this work. It is no longer the authoritative retained runtime.

#### CI policy and compact failure evidence

Reworked `.github/workflows/ci.yml` into two layers:

- every commit runs a change classifier, Build, `npm run policy:check`, focused policy/workflow/reliability tests, and package-content verification;
- runtime, contract, script, test, configuration, package, workflow, and fixture changes run the complete Ubuntu/Windows Node 20/24 matrix;
- documentation-only changes use the policy path and do not repeat unrelated process-tree tests;
- Regression and Smoke run through `scripts/run-and-summarize.mjs`, which redacts token shapes, writes bounded logs, emits a compact failure summary, and preserves the real exit code;
- failed jobs upload bounded `.ai-bridge/ci-logs` artifacts with 14-day retention.

The workflow uses pinned official actions: checkout and setup-node v7, and upload-artifact v7.0.1. `test/ci-workflow.test.mjs` and `scripts/repository-policy.mjs` fail if the classification, policy dependency, runtime condition, compact summary wrapper, artifact upload, or required focused tests are removed.

#### Large-file ranged reads without larger connector responses

- Increased the default returned read budget from 180,000 to 250,000 bytes.
- Separated scanning capacity from response capacity: explicit line-range reads may scan text files up to an internal 8 MiB ceiling while the selected returned range remains bounded by `maxReadBytes`.
- Kept the output-response ceiling unchanged; increasing `maxOutputBytes` was rejected as a 502 workaround.
- Added a regression that creates a text file larger than 3 MiB and proves that line 2 can be returned inside a 1,000-byte response budget.
- Updated `config.example.env` and `AGENTS.md` to require explicit line ranges for large files.

The currently running connector was started with the former 180,000-byte configuration and correctly continued enforcing that startup snapshot. It rejected a 204,769-byte runner log before the service was restarted. The new 250,000-byte default and 8 MiB ranged scan take effect after rebuilding and restarting CodexPro.

#### Deterministic filesystem fixtures and semantic mutation review

- Added `test/fixtures/filesystem-identity.js`.
- Replacement fixtures now pre-create the replacement while the original exists and prove distinct BigInt `dev/ino` identity before installation.
- Tests no longer assume monotonically increasing or non-reused inode/file-index values.
- Mutation review identity now uses repository path, syscall type, and normalized semantic call digest. Line and column remain diagnostics only.
- Legacy reviewed entries are normalized during comparison, avoiding an unsafe one-time allowlist reset.
- Added a regression proving that inserting blank lines changes the diagnostic location but not the reviewed mutation identity.

#### Protected Smoke compatibility

`scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain protected and unchanged. Because the new default read cap makes the historic 190,000-byte existing-plan fixture valid, `scripts/smoke-platform-compat.mjs` now performs an exact one-match in-memory migration from 190,000 to 260,000 bytes. The compatibility source fails closed if the protected source drifts.

The first dual-version Smoke rerun also found that the Node 20 npm entry launched child scripts under the system Node 24. The toolchain manager now sets exact npm child-runtime variables, and a live process query confirmed that the handoff Smoke executable was the managed Node 20.20.2 binary before the matrix advanced to managed Node 24.15.0.

### Enforced entry points

`package.json` now exposes:

- `policy:check`
- `ci:classify`
- `ci:failure-summary`
- `ci:exact-head`
- `task:runner`
- `toolchain:status`
- `toolchain:ensure`
- `toolchain:matrix`
- `test:ordinary`
- `test:control-domain`

`AGENTS.md` requires these paths before staging and forbids using a larger synchronous connector response as a substitute for runner ownership.

### Final local evidence

- Managed Node 20.20.2 and Node 24.15.0 both report ready with supply-chain records.
- Final ordinary-domain dual-version runner `2026-07-15T20-41-46-896Z-ordinary-regression-node-matrix-final-9e0eeab1` completed with exit code 0.
- Final eight-section dual-version Smoke runner `2026-07-15T20-53-21-455Z-smoke-node-matrix-final-2-33eb9eef` completed with exit code 0.
- Node 20 and Node 24 Build both passed through the managed npm runtime.
- Final affected cross-version gate passed 73/73 on Node 20 and 73/73 on Node 24, including Windows GitHub environment, runner lifecycle, read bounds, semantic mutation review, CI workflow, test-domain partition, package contents, V1/V2 wire fingerprints, and Phase 3D move behavior.
- `npm pack --dry-run` passed with 319 files, approximately 742.9 kB packed and 4.0 MB unpacked.
- `npm run policy:check` passed after the runtime and Smoke fixes.

### Publication boundary

The base maintenance batch was published as commit `8153db2ab123d6845a51aa4d4242d6759a601124`. Its first exact-head CI run exposed a Windows-only command-launch defect described in STEP-308. The repair is published as a normal follow-up change; successful exact-head evidence remains external and must not trigger another commit solely to write the run ID into repository memory.

## STEP-308 - Repair Windows CI command launch without enabling a shell

**Date:** 2026-07-16
**Status:** Implemented and locally verified; exact-head success evidence is intentionally external.
**Scope:** `scripts/run-and-summarize.mjs`, `test/operational-reliability.test.mjs`, and current-memory reconciliation.

### Failure evidence

Exact-head run `29471013791` for commit `8153db2ab123d6845a51aa4d4242d6759a601124` completed with failure only in Windows Node 20 and Windows Node 24. The compact failed-step reader identified the same first error in both jobs:

- `Error: spawn EINVAL`
- call site: `scripts/run-and-summarize.mjs`
- Node runtimes: `v20.20.2` and `v24.18.0`

Ubuntu and repository-policy paths did not expose this platform-specific launch defect.

### Root cause

The wrapper translated `npm` into `npm.cmd` and then called `spawn(..., { shell: false })`. On Windows, `.cmd` is a command-script format interpreted by `cmd.exe`; it is not a native executable that Node can launch directly with shell execution disabled. The local Git Bash environment had not reproduced the GitHub-hosted runner behavior, so the original focused test covered redaction and exit propagation but not an actual npm launch on Windows.

### Repair

The wrapper continues to use `shell: false`. For Windows `npm` and `npx` commands, it now:

1. resolves `npm-cli.js` or `npx-cli.js` from the active `npm_execpath` directory or the active Node installation;
2. launches that CLI through the current `process.execPath`;
3. preserves the exact argument array without shell parsing;
4. fails explicitly with exit code 127 if the CLI cannot be resolved.

This keeps the pinned Node runtime authoritative and avoids command-string quoting or shell-injection ambiguity.

### Regression and verification

A Windows-only regression now runs the summary wrapper with `npm --version`, requires a successful exit, and verifies the bounded log. The managed toolchain matrix passed 13/13 focused tests under Node 20.20.2 and 13/13 under Node 24.15.0, including CI workflow, semantic mutation review, runner lifecycle, redaction, exact npm launch, and toolchain status. `npm run policy:check` also passed.

### Closure rule

The repair receives one exact-head CI run for its own commit. A successful result is stored through ignored `.ai-bridge` evidence and reported externally; no repository commit is created solely to record that successful run ID.
