# Phase 3 — Atomic Transactions, Persistent Audit, Mutator Migration, and Move Acceptance — Volume 2

This archive is append-only. It continues Phase 3 after Volume 1 crossed its direct-read threshold at STEP-277. Do not store secrets, file bodies, complete tokens, private keys, credential-bearing URLs, or sensitive absolute paths.

## STEP-278 — Close the Phase 3A/3B CI repair gate

**Status:** Complete as a closure reconciliation step; this documentation head is ready for the authorized scoped commit and exact-head CI.

**Goal:** Record immutable replacement CI evidence for the Phase 3A/3B repair, open the required continuation archive volume, and establish the verified baseline for Phase 3C planning.

**Files changed:** `AGENTS.md`; `Memory.md`; `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; this new continuation archive. Production source changed: none.

**Implementation summary:** Confirmed local `main`, `origin/main`, and GitHub Actions run `29369658101` all point to STEP-277 implementation commit `88bd4b9`. The repair closes all three observed Phase 3A/3B CI causes: child fixture discovery, platform-dependent protected-source hashes, and partial first-open installation-state visibility. Volume 1 is left unchanged after STEP-277 and this file becomes the active Phase 3 archive.

**Verification commands:** `gh run watch 29369658101 -R chatGPT-10/codexgpt --exit-status --interval 10`; `gh run view 29369658101 -R chatGPT-10/codexgpt --json conclusion,status,headSha,url,jobs`; `git status --short --branch`; `git rev-parse HEAD`; `git rev-parse origin/main`; documentation link, stale-state, size, whitespace, secret-signature, and scope checks.

**Verification results:** Run `29369658101` completed successfully for Ubuntu Node 20, Ubuntu Node 24, Windows Node 20, and Windows Node 24. Every job passed Checkout, Install, Build, Regression Tests, Smoke Test, and Check Package Contents. Both local and remote `main` resolved to `88bd4b9ff5f8ccec21abcd1ddf78d879302ddd8a`, and the working tree was clean before this closure reconciliation.

**Decisions made:** Treat Phase 3A/3B CI as closed only at the passing replacement head, not at any earlier failing publication. Keep contract V1, public legacy writers, and dormant persistent-audit registration unchanged until Phase 3C enables one coherent V2 snapshot. Start Phase 3C with a written TDD plan derived from the already-approved design rather than editing production code directly.

**Risks or limitations:** The closure documentation commit will create a new exact head and must itself pass CI before Phase 3C implementation begins. Phase 3C and Phase 3D remain unimplemented. No production deployment, credential operation, system policy, user workspace, or audit evidence was changed by this closure step.

**Rollback method:** Revert only the STEP-278 documentation, rule, memory, and plan reconciliation. Do not revert the passing STEP-277 implementation or rewrite Volume 1.

**Next step:** Commit and push the STEP-278 documentation closure, require its exact-head CI to pass, then read the approved Phase 3C specification in full and write the detailed RED/GREEN implementation plan before production changes.

## STEP-279 — Plan Phase 3C mutator migration and undo

**Status:** Complete; ready for the authorized scoped documentation commit and exact-head CI.

**Goal:** Verify the Phase 3A/3B closure head, resolve the cross-slice contract V2 sequencing conflict, inventory current workspace writers, and produce an executable TDD plan for Phase 3C.

**Files changed:** `AGENTS.md`; `Memory.md`; `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; `docs/superpowers/plans/2026-07-14-phase-3c-mutator-migration-and-undo.md`; this archive.

**Implementation summary:** Confirmed closure commit `953e080` passed exact-head GitHub Actions run `29370073046` on Ubuntu/Windows Node 20/24. Read the approved Phase 3C and 3D designs together and found a real ordering conflict: Phase 3C defines exact V2 as 31 tools including `move_paths`, while Phase 3D owns `move_paths`. Chose the fail-closed correction: Phase 3C migrates all writers and prepares runtime/query/undo/versioned schemas, but public contract 2 remains unavailable until Phase 3D implements `move_paths` and activates the coherent 31-tool snapshot. Inventoried direct workspace primitives in `src/fsOps.ts`, `src/handoffOps.ts`, `src/proContext.ts`, `scripts/pro-apply.mjs`, and supported `.ai-bridge` paths in `scripts/codexpro.mjs`; separated transaction/audit/app-state/installer primitives. Wrote a ten-task RED/GREEN plan with per-part review, neat-freak, publication, and exact-head CI gates.

**Verification commands:** `gh run view 29370073046 -R chatGPT-10/codexgpt --json conclusion,status,headSha,jobs,url`; `rg` searches over the Phase 3C/3D designs, master plan, schemas, registration, and every low-level filesystem primitive in `src/` and shipped scripts; plan placeholder/checkbox/path scan; Markdown relative-link audit; `git diff --check`; secret-signature scan; intended-file review.

**Verification results:** Closure run `29370073046` succeeded for all four OS/Node jobs and every Build, Regression, Smoke, and Package step. The writer inventory found the expected legacy workspace write sites and the separately classified application-state/audit/transaction/installer sites. The plan covers version selection, encrypted change sets, the commit handshake, write/edit, patch, bridge/handoff/Pro-context/probe/CLI writers, the static closure gate, undo, production runtime injection, and Phase 3C acceptance. No production source changed in this planning step.

**Decisions made:** Do not advertise a partial V2 and do not use a placeholder `move_paths` handler. Keep V1 as the only constructible public contract after Phase 3C; make V2 construction fail with a bounded incomplete-capability error until Phase 3D. Preserve the user-authorized per-part scoped stage, English commit, push, and exact-head CI flow.

**Risks or limitations:** Phase 3C remains unimplemented. The plan introduces a deliberate clarification to the approved rollout sequence but does not weaken either design's final 31-tool acceptance. The exact implementation may discover additional supported workspace writers; the static closure gate treats each as a blocker rather than silently excluding it.

**Rollback method:** Revert only the STEP-279 plan and documentation reconciliation. Do not rewrite the approved specifications, closed archives, or passing Phase 3A/3B implementation history.

**Next step:** Publish this planning step, require exact-head CI, then execute Phase 3C Task 1 with a focused RED test before production code.
