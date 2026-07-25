# Interphase Maintenance Archive — Part 6

This append-only volume continues interphase maintenance after Part 5 closed above the 48 KB rollover threshold.

## 2026-07-25 — STEP-436: Complete evidence-driven CI optimization Phases 1–3

**Status:** Phase 1–3 implementation, local validation, and three-agent adversarial review are complete. Phase 0 profiling is published at `d2e379a56448f5f612cb19b3aa2a01010bf2c9e7` with successful exact-head run `30174477867`. The Phase 1–3 runtime commit and its exact-head GitHub matrix are pending at the time of this entry.

**Goal:** Reduce the measured Windows CI bottleneck without removing tests, weakening local security boundaries, or replacing the required Windows/Ubuntu Node 20/24 build matrix with an unverified shared artifact. The user impact is shorter feedback time with an explicit one-restart serial rollback and unchanged production authority.

**Files changed:**

- `.github/workflows/ci.yml`
- `fixtures/git-v4-test-helper.mjs`
- `scripts/test-domains.mjs`
- `scripts/test-execution-profile-manifest.mjs`
- `scripts/test-execution-profiles.mjs`
- `test/ci-workflow.test.mjs`
- `test/git-v4-fixture-performance.test.mjs`
- `test/test-domain-classification.test.mjs`
- `test/test-execution-profiles.test.mjs`
- `Memory.md`
- `docs/memory/archive/interphase-maintenance-part-6.md`

**Implementation:**

- Phase 1 replaces native-Windows all-serial execution with a reviewed `fast`/`safe`/`isolated` topology at concurrency 4/2/1. The exact 229-file manifest is fail-closed: unknown, missing, duplicate, partition-drift, control/serial misclassification, and six additional process/free-port risks fail before a child test process starts.
- Explicit `--test-concurrency 1` retains the established globally serial behavior. `--test-topology legacy` is the one-restart Windows rollback, is always concurrency 1, and rejects wider requested concurrency.
- Windows CI validates every expected report before upload and routes layered `fast`/`safe`/`isolated` evidence separately from legacy `main`. Regression evidence still uploads after a later Smoke failure, but a missing report cannot produce a partial artifact.
- Phase 2 follows the measured Git/worktree bottleneck rather than introducing an unproven production `FileIdentityContext`. The shared Git V4 fixture now creates one owned parent with repository/private/state siblings, performs one bounded recursive cleanup, and writes fixed test identity to the newly initialized private `.git/config` before callbacks or concurrency. This removes two `git config` subprocesses per fixture setup across 38 current call sites while preserving Git identity and production executor boundaries.
- Phase 3 keeps `Build` in every Ubuntu/Windows Node 20/24 job because the project contract requires each runtime/platform combination to compile its own checkout. It removes only the redundant matrix `prepack` build: each matrix job performs `npm pack --dry-run --ignore-scripts` after its explicit build, while the policy job retains one real `npm pack --dry-run` and the package-content regression. This removes four repeated TypeScript builds without weakening package lifecycle or contents coverage.
- Workflow regression now parses YAML with duplicate-key rejection and freezes the real `prepack` lifecycle, Build-to-package-to-regression ordering, legacy/layered report routing, exact report existence checks, and upload outcome binding.

**Exact local verification and results:**

- Managed Node 20.20.2 and Node 24.15.0 focused Phase 1–3 regressions passed 20/20 on each major.
- Managed dual-major ordinary run `2026-07-25T21-45-22-397Z-phase1-3-reviewed-ordinary-matrix-b535d1b7` completed with exit code 0 and cleaned owned temporary state. Each major ran 211 files as `fast=143`, `safe=57`, and `isolated=11`.
- Node 20 shard wall durations were `254,530 + 171,986 + 67,101 = 493,617 ms`; Node 24 durations were `56,171 + 168,671 + 60,651 = 285,493 ms`. Against the same-machine Phase 0 diagnostic reports (`1,014,891 ms` on Node 20 and `526,915 ms` on Node 24), the one-sample reductions are 51.4% and 45.8% respectively despite two additional test files. These are local ordinary-domain diagnostics, not substitutes for exact-head all-domain CI comparison.
- Managed Node 20/24 build passed.
- Managed dual-major Smoke run `2026-07-25T22-01-19-574Z-phase1-3-final-smoke-matrix-1a6e5dea` completed with exit code 0, cleaned owned temporary state, and passed all eight Smoke domains on each major.
- Policy/package focused validation passed 47/47. `npm run policy:check` reported `Repository operational policy: PASS`.
- A real `npm pack --dry-run --json` executed `prepack -> npm run build` successfully and reported 582 files with 7,040,297 unpacked bytes.
- `git diff --check` passed with informational checkout line-ending warnings only.

**Adversarial review:**

- Three read-only agents reviewed the completed result for runtime behavior, security boundaries, and CI/test integrity.
- Review repairs made the test profile inventory exact instead of fail-open, restored global serial semantics for explicit concurrency 1, made legacy strictly serial, isolated five free-port production-server tests plus the existing multi-server approval test, added an exact partition invariant, checked serial/control inventory drift, and preserved legacy report routing.
- CI/security repairs retained a real central `prepack`, restored cheap package-manifest gates to every runtime matrix job, kept performance evidence available after Smoke failure, required all three Windows layered reports before upload, and bound uploads to successful report verification.
- Final re-review found no remaining P0–P2.

**Decisions, risks, and limitations:**

- The original Phase 2 production identity-cache idea was not implemented because Phase 0 evidence identified test fixture Git/process churn, not repeated production identity checks, as the actionable Windows bottleneck. Reusing identity facts across security inspections without transaction-bound proof could weaken replacement-race defenses.
- The original Phase 3 build-once artifact idea was narrowed because it conflicts with the repository's required per-OS/per-Node Build gate. Only redundant package-triggered builds were removed.
- Local before/after numbers are one-sample diagnostics. GitHub runner improvement must be calculated from the new exact-head run against Phase 0 run `30174477867`; Node 20 is the cleanest comparison because both runs use `v20.20.2`.
- Existing unrelated Phase 7 documentation reconciliation and Phase 8 design files remain outside this STEP and must not be staged with it.

**Rollback:** Revert the Phase 1–3 implementation commit. For an immediate no-code Windows rollback, set `CODEXGPT_TEST_TOPOLOGY=legacy`; the runner returns to one exact serial `main` shard. No user configuration, credentials, production workspace, audit data, branches, or worktrees are migrated by this STEP.

**Next action:** Commit and push only the reviewed STEP-436 implementation/memory scope, wait for exact-head Repository policy and Ubuntu/Windows Node 20/24 Build/Regression/Smoke/Package, download the exact performance artifacts, compare them with run `30174477867`, and append the final run evidence locally without creating an evidence-only follow-up commit.

### STEP-436 correction — exact-head Windows control-server classification

Exact-head run `30177170822` passed Repository policy and both complete Ubuntu Node 20/24 jobs, but both Windows regression jobs failed in `cli-approvals.test.mjs` with `CONTROL_SERVER_STALE`. The file owns a real Windows local-control server and launches multiple CLI children, but the initial reviewed manifest had incorrectly placed it in `fast`.

The repair moves `cli-approvals.test.mjs` into the explicit additional-isolated set and exact isolated manifest. A regression first proved the former fast classification, then managed Node 20.20.2 and Node 24.15.0 ran the real CLI journey plus profile/domain contracts at concurrency 1 and passed 13/13 on each major. No production control protocol, authority, timeout, or stale-server check changed. The failed run is retained as materially relevant evidence; a replacement exact-head run is required.
