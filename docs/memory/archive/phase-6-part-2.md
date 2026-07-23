# Phase 6 Archive — Part 2

Continuation of [Phase 6 Volume 1](phase-6.md), which closed after STEP-400 reached the archive read-size threshold.

## 2026-07-23 — STEP-401: Close Phase 6 on the exact published head

**Status:** Complete. Phase 6 is formally closed at published head `31631676fe254962a9a4f14d6e025e3edba82b8d` by exact-head CI run `30033293444`.

**Goal:** Bind the final Windows regression repair to one exact published SHA and require every repository policy, platform, runtime, regression, Smoke, and package gate to succeed before closing the phase.

**Files changed:** `AGENTS.md`, `Memory.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, and `docs/memory/archive/phase-6-part-2.md`. These closure-record updates remain local and are not an evidence-only follow-up commit.

**Implementation and publication:**

- Staged only `test/runner-process-identity.test.mjs`, `test/task-cleanup-lifecycle.test.mjs`, and the STEP-400 Phase 6 archive entry. Separately owned Phase 7 design and mixed project-record changes remained outside the staging boundary.
- Created English commit `31631676fe254962a9a4f14d6e025e3edba82b8d` (`test: stabilize Windows runner completion waits`) and pushed it normally to `origin/main`.
- Bound the resulting CI run to the exact 40-character SHA with `scripts/exact-head-ci.mjs`; no repository write was required to verify the result.

**Exact verification and results:**

- `npm run ci:exact-head -- find --head 31631676fe254962a9a4f14d6e025e3edba82b8d --output .ai-bridge/phase6-step400-exact-head-find.json` found run `30033293444`.
- `npm run ci:exact-head -- verify --head 31631676fe254962a9a4f14d6e025e3edba82b8d --run 30033293444 --output .ai-bridge/phase6-step400-exact-head-verify.json` passed with terminal `completed/success`.
- `Classify changes`: success.
- `Repository policy`: success.
- `Ubuntu / Node 20`: success, including Build, Regression, Smoke, and Package.
- `Ubuntu / Node 24`: success, including Build, Regression, Smoke, and Package.
- `Windows / Node 20`: success, including Build, Regression, Smoke, and Package.
- `Windows / Node 24`: success, including Build, Regression, Smoke, and Package.
- The exact-head helper reported `repositoryWriteRequired: false`.

**Decisions and user impact:**

- Phase 6 is closed because the real user journey, default activation, local dual-major gates, and the complete exact published matrix all passed. This is no longer a local-only or partial result.
- Users now receive root/target AGENTS guidance and target-scoped Skill discovery in the omitted/default `standard` mode. Explicit `CODEXGPT_GUIDANCE_MODE=legacy` remains the one-restart rollback.
- Apps with a frozen pre-Phase-6 tool snapshot still require one **Scan Tools** refresh or recreation. Transparent refresh is not claimed.
- Phase 6 closure authority is exhausted. It does not authorize Phase 7 runtime, dependencies, Provider installation, staging, commit, push, release, or deployment.

**Risks and limitations:**

- Guidance and Skills do not grant authority and do not create OS isolation. Existing workspace, path, secret, Policy, Approval, Audit, and ambient-process limitations remain.
- The deleted pre-Phase-6 App still prevents empirical reuse testing of that exact frozen snapshot; the explicit refresh/recreation contract remains the supported path.
- The five previously recorded unrelated production dependency advisories were not introduced or resolved by Phase 6.

**Rollback:** Set `CODEXGPT_GUIDANCE_MODE=legacy` and restart the same published binary. Do not rewrite history, weaken same-handle reads, or remove user AGENTS/Skill content as rollback.

**Next step:** Obtain fresh authorization before any Phase 7 Core runtime or exact TypeScript dependency work. Phase 7B Serena and Phase 7C LSP remain separately gated extensions.
