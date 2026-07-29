# Interphase Maintenance Archive — Part 7

Append-only continuation for maintenance after Phase 8 Core. Part 6 is closed and remains unchanged.

## 2026-07-29 — STEP-483: Audit incomplete GitHub release alignment through `1.0.4`

**Status:** Local reconciliation passed; GitHub publication repair is pending.

**Goal:** Explain why npm reports `codexgpt@1.0.4` while GitHub presents older source/release state, identify every stale active release surface, and prevent a future npm-only publication from being described as a complete public release.

**Files changed:** `AGENTS.md`, `PUBLIC_LAUNCH_CHECKLIST.md`, `Memory.md`, `README.md`, `README_ZH.md`, `FAQ.md`, `FAQ_ZH.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/index.html`, `docs/zh.html`, `docs/superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md`, this archive, plus the pre-existing append-only STEP-482 entry in `docs/memory/archive/interphase-maintenance-part-6.md`. Source/runtime files: none.

**Findings:** npm `latest` is `1.0.4`. The immutable npm `gitHead` values are `0e595bd60855f8af59515a57c3312128497f5942` for `1.0.2`, `a7435dba11a6cf187c0d3611d54510f746444359` for `1.0.3`, and `48fb3f5334cb286df2af7adf56ddddbbcfc41406` for `1.0.4`. GitHub is split three ways: default `main` points to the `1.0.2` package commit but its runtime version surfaces and README still report `1.0.1`; GitHub Latest Release is `v1.0.1`; npm latest is `1.0.4`. PR 7 contains the `1.0.3` and `1.0.4` commits but remains draft and its title/body describe only `1.0.3`. Remote tags and GitHub Releases exist only through `v1.0.1`. The `1.0.2` commit's only CI run, `30352571177`, failed Repository policy and matrix jobs because its package/lock were `1.0.2` while HTTP, STDIO, and MCP server runtime identities remained `1.0.1`. The mismatch is a split publication workflow plus a historical incomplete `1.0.2` gate, not an npm registry error.

**Implementation:** Updated the current authority, implementation-plan phase table/status, bilingual README source-checkout labels, bilingual FAQ authentication status, the controlling Phase 8 specification's source-checkout label, and the packaged bilingual website to the verified `1.0.4` npm/runtime state while recording the incomplete GitHub alignment honestly. The website now presents token-free OAuth as the recommended public path and labels query-token as password-equivalent Legacy compatibility. Expanded the public launch checklist so a release is incomplete until npm `latest`/`gitHead`, exact-head CI, default-branch ancestry, an annotated exact tag that project policy forbids moving, a public GitHub Release, and active version documentation all agree. The checklist now requires quoting peeled tag refs on PowerShell, separately inspecting GitHub Latest, and recording an incompletely gated historical npm version as superseded rather than rewriting it as successful. Started this continuation volume before Part 6 crossed its practical direct-read threshold.

**Verification:** Fresh read-only checks used `npm view`, `git ls-remote`, `gh release list`, `gh pr view 7`, `gh run list`, local Git history/status, and repository-wide active-document version searches. No tag, Release, PR state, branch, credential, runtime, Tunnel, DNS, or npm state was changed in this local step.

**Risk and rollback:** The documentation currently exposes the unresolved GitHub state instead of claiming closure. Revert only this bounded documentation reconciliation if its facts are wrong. Do not move or delete any published npm version or existing release tag; project policy, rather than a GitHub immutability control, preserves those identities.

**Next action:** After explicit Git publication approval, update PR 7's title/body to cover both `1.0.3` and `1.0.4`, commit the reviewed documentation, push it, and require fresh exact-head CI. Because `main` is currently unprotected and squash/rebase would change the npm source SHAs, merge with a merge commit only, then verify `a7435dba11a6cf187c0d3611d54510f746444359` and `48fb3f5334cb286df2af7adf56ddddbbcfc41406` are ancestors of `main`. Create annotated tags at all three exact npm `gitHead` commits; run `gh release create v1.0.2 --verify-tag --latest=false` with explicit superseded/failed-gate notes, run `gh release create v1.0.3 --verify-tag --latest=false`, then run `gh release create v1.0.4 --verify-tag --latest`. Re-run the complete public-state audit before claiming closure.

## 2026-07-29 — STEP-484: Close GitHub release alignment through `1.0.4`

**Status:** Complete.

**Goal:** Repair the split npm/GitHub publication state without rewriting any published source identity, disclose the incomplete historical `1.0.2` gate, and make GitHub present `1.0.4` as the current release.

**Files changed:** `Memory.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, `docs/superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md`, and this archive. Source/runtime files: none.

**Implementation:** Committed the STEP-482/483 documentation reconciliation as `359c45eb7059eaacfe63933b783f310f75a58e8f`, updated PR 7 to cover both `1.0.3` and `1.0.4`, passed its exact-head CI run `30470350580`, and merged with merge commit `b0b169d2f58eee3dc18cd82cb744f1a2f1c21c55` so the immutable npm source commits remained ancestors of `main`. Merge-head CI run `30471674322` passed Repository policy and the complete Ubuntu/Windows Node 20/24 matrix. Created annotated tags `v1.0.2`, `v1.0.3`, and `v1.0.4` peeled respectively to npm `gitHead` values `0e595bd60855f8af59515a57c3312128497f5942`, `a7435dba11a6cf187c0d3611d54510f746444359`, and `48fb3f5334cb286df2af7adf56ddddbbcfc41406`. Published matching GitHub Releases, marked `1.0.2` as superseded with its failed CI/runtime-version mismatch disclosed, and set `v1.0.4` as GitHub Latest.

**Verification:** `npm view codexgpt version dist-tags gitHead --json` returned `1.0.4`/`latest`/`48fb3f5334cb286df2af7adf56ddddbbcfc41406`; per-version `npm view` matched all three source SHAs. `git ls-remote` showed `main` at `b0b169d2f58eee3dc18cd82cb744f1a2f1c21c55` and each peeled tag at its npm `gitHead`. `gh release list --limit 10`, `gh release view`, and `gh api repos/chatGPT-10/codexgpt/releases/latest` confirmed public non-draft Releases through `v1.0.4`, exact release notes, and Latest `v1.0.4`. `git show origin/main:package.json`, README inspection, and runtime grep confirmed `1.0.4` on `main`.

**Decisions:** Published npm commits are preserved as exact historical identities; merge, not squash/rebase, is required when bringing them onto `main`. A historical npm artifact with a failed gate is documented rather than deleted or reclassified as successful. Project policy continues to forbid moving or deleting release tags even though GitHub release immutability is not enabled.

**Risk and rollback:** Tags, Releases, and npm artifacts are public historical records and must not be rewritten or deleted. If current documentation is inaccurate, correct it with a new commit and append-only archive correction. This step changes no runtime, Tunnel, DNS, credential, workspace authority, or installed package.

**Next action:** No further implementation or deployment is authorized by this closure. The owner may separately choose the next reviewed post-Phase-8 item; the remaining real 20-minute `1.0.4` App acceptance check and already isolated DNS-record deletion remain open.
