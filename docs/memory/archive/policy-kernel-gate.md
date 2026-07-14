# Policy Kernel Gate Archive

This archive begins after formal Phase 1 closure. It records the design-only Policy Kernel Gate and the transition into Phase 2A planning. The Gate passed on 2026-07-14; production implementation remains separately tracked task-by-task.

## STEP-248 — Write the Policy Kernel Gate design package

**Status:** Complete; written package approved on 2026-07-14

**Goal:** Convert the approved compiled-kernel Approach B into a complete, deterministic, migration-safe design package without changing Phase 1 production behavior or starting Phase 2 implementation.

**Files changed:**

- `docs/superpowers/specs/2026-07-14-policy-kernel-gate-design.md`
- `docs/superpowers/specs/2026-07-14-request-context-identity-adr.md`
- `docs/superpowers/specs/2026-07-14-permission-profile-v1-design.md`
- `docs/superpowers/specs/2026-07-14-windows-enforcement-threat-model.md`
- `Memory.md`
- `docs/memory/archive/policy-kernel-gate.md`

**Implementation summary:** Wrote the design-only Policy Kernel package around a repository-owned compiled immutable policy snapshot and pure deterministic evaluator. Separated Tool Surface, Policy, Approval, and Sandbox. Defined the effective-ceiling intersection, deterministic evaluation order, exact deny/approval/stale/enforcement errors, bounded provenance, redacted audit facts, Approval risk classes and grant binding, resource descriptor families, and reversible legacy/shadow/enforce migration. Defined one RequestIdentity/RequestContext model for STDIO, loopback, query-token, Bearer, and future OAuth without inventing human subjects for shared credentials. Defined Permission Profile V1 JSON storage, strict unknown-field handling, single-parent inheritance, defaults, Windows canonicalization, non-existent target handling, exact/subtree/deny-glob precedence, immutable hard policy, Git/Shell/Process/Network separation, and conservative migration from `toolMode`/`writeMode`/`bashMode`. Defined the native-Windows filesystem/process/registry/credential/network threat model, capability report, fail-closed integration, controlled spike harness, and security claims that remain prohibited. No source, test, dependency, runtime profile, public tool contract, or production behavior changed.

**Verification commands:**

- Node static self-review over the four exact design files: minimum size, required architecture markers, and no `TBD`/`TODO` placeholders.
- Targeted consistency search for scope names and stable policy/enforcement error names.
- `git diff --check`.
- Final `show_changes` review for exact changed-file scope and absence of production files.

**Verification results:** The static self-review passed for all four files: 15,816 bytes/383 lines for the gate design, 12,679 bytes/345 lines for the identity ADR, 18,169 bytes/512 lines for Permission Profile V1, and 17,039 bytes/444 lines for the Windows threat model. Required Policy, Approval, Sandbox, RequestContext, Permission Profile, and Windows markers were present, with no `TBD` or `TODO`. Consistency search confirmed the selected `shell:execute` and `git:remote-write` scope names and consistent `POLICY_CONTEXT_STALE` / `NETWORK_ENFORCEMENT_UNAVAILABLE` semantics; `POLICY_CONTEXT_INVALID` remains explicitly internal-only. `Memory.md` remained within protocol limits at 16,730 bytes and 135 lines. Final `git diff --check` passed with only the existing Windows working-copy LF-to-CRLF warning for `Memory.md`. Final `show_changes` reported exactly six documentation/memory files, no staged changes, and no production, test, dependency, package, or protected Smoke files.

**Decisions made:** Select compiled-kernel Approach B. Keep the policy evaluator pure and deterministic. Keep RuntimeProfile separate from PermissionProfile. Keep credentials out of RequestContext and derive only installation-local HMAC references. Use session-bound workspace handles in Phase 2B. Exclude positive filesystem globs from V1; use exact/subtree allows and deny-only globs. Treat deployment capabilities as part of the effective ceiling. Bind approvals to credential, transport session, workspace, policy revision, operation, resource fingerprint, input digest, risk class, and expiry. Treat arbitrary Shell as opaque and require demonstrated enforcement capabilities. Keep native Windows primary and WSL optional. Do not claim complete sandboxing, OAuth owner isolation, TOCTOU elimination, Job Object filesystem/network isolation, or domain-list network containment.

**Risks or limitations:** This step is design evidence only. It does not prove an enforceable Windows sandbox, eliminate junction/symlink races, bind workspaces to sessions, create reliable audit persistence, or implement approval UI and revocation. Shared query/Bearer credentials remain lower-assurance identities until Phase 8. The Windows spike may conclude that some required capabilities are unavailable; affected operations must then remain disabled or return an enforcement-unavailable error.

**Rollback method:** Revert the four specification files, this archive file, and the corresponding `Memory.md` edits through an ordinary new commit if the design record is rejected. No production rollback is needed because no production behavior changed. Do not reset or rewrite `main`, reopen Phase 1 contracts, or delete prior archive history.

**Next step:** Final written approval was received on 2026-07-14. Proceed to STEP-249 and create the detailed Phase 2A implementation plan before touching production code.

## STEP-249 — Pass the Policy Kernel Gate and write the Phase 2A implementation plan

**Status:** Complete; Phase 2A implementation not started

**Goal:** Record final written-spec approval, pass the design-only Gate, and convert the approved architecture into an executable, task-by-task Phase 2A TDD plan without changing production behavior.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/memory/archive/policy-kernel-gate.md`
- `docs/superpowers/specs/2026-07-14-policy-kernel-gate-design.md`
- `docs/superpowers/specs/2026-07-14-request-context-identity-adr.md`
- `docs/superpowers/specs/2026-07-14-permission-profile-v1-design.md`
- `docs/superpowers/specs/2026-07-14-windows-enforcement-threat-model.md`
- `docs/superpowers/plans/2026-07-14-phase-2a-policy-kernel-implementation.md`

**Implementation summary:** Marked all four Gate specifications approved and completed every master-plan Gate acceptance item. Wrote a twelve-task Phase 2A implementation plan covering strict V1 types/Schemas, profile storage and inheritance, resource normalization, immutable hard policy, pure deterministic evaluation, bounded approvals and grants, installation-local credential references, RequestContext/RequestIdentity, conservative legacy/shadow/enforce migration, capability reports, redacted audit facts, registered-tool and supertool integration, HTTP/STDIO identity wiring, safe diagnostics, a controlled Windows capability spike, documentation, full verification, rollback, and publication checkpoints. The plan preserves the twenty-eight Phase 1 output schemas by returning cross-cutting policy refusals as bounded MCP tool errors before the existing structured envelopes. It keeps `legacy` as the migration-cycle default, makes `shadow` observational only, and makes `enforce` fail closed. No `src/`, `test/`, script behavior, dependency, runtime profile, package, or protected Smoke file was changed in this step.

**Verification commands:**

- Node static plan self-review for required header, twelve tasks, checkbox steps, no `TBD`/`TODO`, required policy markers, and exact plan path.
- Targeted consistency search across the four specifications, plan, master plan, AGENTS, and Memory for Gate status and Phase 2A plan references.
- `git diff --check`.
- `Memory.md` size/line limit check.
- Final `show_changes` exact-scope review.

**Verification results:** The Phase 2A plan static self-review passed at 61,870 bytes, 1,542 lines, twelve sequential tasks, and eighty-four checkbox steps. The plan contained the required header, sub-skill handoff, `legacy`/`shadow`/`enforce` migration modes, RequestContext/RequestIdentity, Permission Profile, stable sandbox/network errors, and final `git diff --check`, with no `TBD`, `TODO`, `implement later`, `fill in`, or `similar to Task` markers. Consistency search found the approved Gate status in all four specifications and synchronized Phase 2A plan references in AGENTS, Memory, the master plan, and this archive. `Memory.md` remained within protocol limits at 16,885 bytes and 136 lines. `git diff --check` passed with only Windows working-copy LF-to-CRLF warnings for AGENTS, Memory, and the master plan. Final scope review reported exactly nine documentation/memory files, no staged changes, and no production, test, script, dependency, package, runtime-profile, or protected Smoke files.

**Decisions made:** The design-only Gate is formally passed. Phase 2A uses the twelve-task plan at `docs/superpowers/plans/2026-07-14-phase-2a-policy-kernel-implementation.md`. The implementation starts from strict schemas and pure components, then integrates once at the registered-tool boundary. Policy refusals do not reopen every Phase 1 output schema. `legacy` remains default for one migration cycle; `shadow` cannot change execution; `enforce` is opt-in and fail closed. Staging, commits, pushes, destructive operations, system-policy changes, candidate sandbox installation, credential migration, OAuth 2.1, Git remote writes, and Phase 6–9 remain independently gated.

**Risks or limitations:** The plan is not implementation evidence. It does not prove Policy Kernel behavior, Windows sandboxing, transport identity wiring, approval revocation, audit persistence, or migration compatibility. The proposed MCP policy-error path must be proven by RED/GREEN integration tests before adoption. The Windows spike may report unavailable capabilities, which must remain disabled rather than silently degraded.

**Rollback method:** Revert this plan and status synchronization through an ordinary new commit if the plan is rejected. Restore the Gate specifications to approved design records rather than deleting them. No production rollback is required because no production behavior changed.

**Next step:** Begin Phase 2A Task 1 using the plan's TDD sequence. Do not stage, commit, push, install sandbox candidates, or perform system-policy changes without the required explicit approval.

## STEP-250 — Implement and locally accept Phase 2A

**Status:** Complete locally; unstaged and unpublished

**Goal:** Execute all twelve approved Phase 2A tasks through RED/GREEN TDD, integrate the Policy Kernel without reopening the twenty-eight Phase 1 envelopes, pass every local acceptance gate, and stop before staging, commit, push, or Phase 2B.

**Files changed:**

- New Policy modules under `src/policy/`: `types.ts`, `schemas.ts`, `profileStore.ts`, `resources.ts`, `hardPolicy.ts`, `evaluator.ts`, `approval.ts`, `identity.ts`, `context.ts`, `compat.ts`, `enforcement.ts`, `audit.ts`, `toolPolicy.ts`, `integration.ts`, `transport.ts`, and `runtime.ts`.
- New Policy tests: `test/policy-schema.test.mjs`, `policy-profile-store.test.mjs`, `policy-resources.test.mjs`, `policy-evaluator.test.mjs`, `policy-approval.test.mjs`, `policy-identity-context.test.mjs`, `policy-compat.test.mjs`, `policy-enforcement-audit.test.mjs`, `policy-integration.test.mjs`, `policy-transport.test.mjs`, and `policy-windows-spike.test.mjs`.
- Integration updates: `src/config.ts`, `src/profileStore.ts`, `src/guard.ts`, `src/server.ts`, `src/codexproSupertool.ts`, `src/http.ts`, `src/stdio.ts`, `src/selfTestOps.ts`, `src/tools/schemas/serverConfig.ts`, `src/tools/schemas/codexproSelfTest.ts`, and `src/toolCardWidget.ts`.
- Controlled probe and compatibility updates: `scripts/policy-windows-spike.mjs` and `scripts/stress-contract-compat.mjs`; protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remained unchanged.
- Contract updates: `test/server-config-contract.test.mjs` and `test/codexpro-self-test-contract.test.mjs`.
- Migration/security documentation and state: `config.example.env`, `README.md`, `README_ZH.md`, `SECURITY.md`, `FAQ.md`, `FAQ_ZH.md`, the Phase 2A plan, `AGENTS.md`, `Memory.md`, the master plan, and this archive.

**Implementation summary:** Added strict V1 schemas and types for Permission Profiles, RequestIdentity/RequestContext, resource descriptors, decisions, grants, audit events, and capability reports. Added local profile loading with exact IDs, 256 KiB bounds, no symlinked documents, single-parent inheritance, maximum depth eight, cycle detection, source hashes, deterministic defaults, normalized-selector conflict rejection, and immutable compilation. Added platform-aware filesystem facts without weakening existing `PathGuard`, plus deterministic Git, opaque Shell, Process, and Network descriptors and fingerprints. Added immutable hard policy, deterministic profile specificity, scope/profile/capability/grant intersection, stable provenance, and fail-closed errors. Added bounded R1/R2/R3 grants with R4 unapprovable, installation-local domain-separated HMAC credential references, transport-aware immutable contexts, conservative compatibility compilation, honest capability reports, and redacted in-memory audit facts.

Integrated one explicit policy definition for each of the 27 canonical direct tools and wrapped the registered direct handlers once; the supertool continues to invoke the same wrapped child, so aliases cannot widen policy. Cross-cutting Policy refusals are bounded MCP tool errors with no `structuredContent`, preserving every Phase 1 schema. `legacy` remains default, `shadow` records only redacted comparisons, and `enforce` is authoritative and fail closed. STDIO uses one process-lifetime local identity; HTTP records only the accepted `loopback_none`, `query_token`, or `bearer` mode and creates one session-bound safe identity without retaining request credentials. Server Config and Tool Cards expose only safe policy/profile/revision/backend summaries. Self-test expands from twelve to seventeen fixed checks by appending policy schema/profile/revision/identity/enforcement checks. The Windows spike uses temporary synthetic fixtures only and never installs or modifies host policy.

**TDD and defects resolved:** Every task began with an expected RED for missing modules or contract fields. During Task 7, a shell-based edit accidentally damaged the `RuntimeConnection` interface; it was detected before downstream tests and restored exactly before proceeding. During Task 9, adjacent tests exposed that legacy callers omit the new policy mode; the server boundary was corrected to treat `undefined` as `legacy`. TypeScript then exposed an incorrect type-predicate narrowing in the policy-failure brand helper; it was changed to a boolean check without changing runtime behavior. During Task 10, enforce-mode read was initially denied because a more-specific root write rule incorrectly cancelled compatibility default-read access; evaluator semantics were corrected so a write rule can satisfy a read only when the explicit profile default is already `read`, while default-deny profiles remain narrow. A first integration-test write was correctly blocked by the existing secret-shape guard and was rewritten with a non-credential sensitive marker. One `show_changes` call incorrectly reported a clean tree; native `git status --short` immediately confirmed all changes remained present and unstaged, so native Git evidence is authoritative. One combined static secret-regex command was blocked by the platform safety layer and did not run; the repository's existing secret-shape regression tests passed inside the complete 526-test suite.

**Verification commands:**

- Focused Policy tests covering all eleven new Policy suites.
- Adjacent path, HTTP security, server-config, supertool, self-test, file, Git, and Bash contract suites.
- `node --test test/*.test.mjs`.
- `npm run build`.
- `npm run smoke`.
- `npm run stress`.
- `node scripts/policy-windows-spike.mjs`.
- `npm pack --dry-run --json` with explicit internal-file exclusion and required Policy artifact checks.
- `git diff --check`.
- Exact protected-source diff check for `scripts/smoke.mjs` and `scripts/http-smoke.mjs`.
- Recursive Policy placeholder scan and exact 27-tool definition count.
- Native `git status --short` and `git log -1 --oneline` for unstaged scope and HEAD evidence.

**Verification results:** Policy focused tests reported 69 pass, 0 fail, and 1 platform-conditional skip across 70 tests. Adjacent security/contracts passed 149/149. The complete suite reported 525 pass, 0 fail, and 1 platform-conditional skip across 526 tests. TypeScript Build passed. All eight Smoke sections passed: analysis, analysis CLI, main, HTTP, Pro CLI, doctor, settings, and execute/watch/loop handoff. Native-Windows Stress passed. The synthetic Windows spike exited successfully, reported every unproved isolation capability as `none`, and reported `persistentHostChanges=false`. Package dry-run contained 195 files with unpacked size 2,753,864 bytes, included `dist/policy/runtime.js` and `scripts/policy-windows-spike.mjs`, and excluded AGENTS, Memory, and the Policy archive. `git diff --check`, protected Smoke source checks, placeholder checks, and the 27-tool closed mapping check passed. The plan contains 84 checked steps and zero unchecked steps. HEAD remained `1f2dc0c`; all implementation and documentation changes remain unstaged.

**Decisions made:** Keep `legacy` as the migration-cycle default. Treat `shadow` as observational only and `enforce` as restrictive security validation until later approval surfaces and stronger sandbox backends exist. Do not add Policy codes to all Phase 1 tool schemas. Keep approval grants process-local and expose no approval-management MCP tool in 2A. Keep audit events process-local until Phase 3. Treat Node-hosted file operations as brokered only; do not infer Process, Network, Credential, Registry, or revocation capabilities. Preserve static query/Bearer credentials as shared-secret identities with no human subject. Keep Phase 2B workspace ownership, expiry, cross-session isolation, and revocation separate.

**Risks or limitations:** Phase 2A has no user-facing approval issuance path, so bounded-risk writes can stop at `APPROVAL_REQUIRED`. Arbitrary Shell and Process operations remain unavailable in enforce mode when required OS isolation is unproved. The Windows spike is evidence collection, not a production sandbox. Filesystem TOCTOU is reduced but not eliminated. Audit persistence, OAuth-grade ownership, workspace lifecycle isolation, persistent processes, network enforcement, and Git remote writes remain outside this phase. Local success does not replace exact-head Ubuntu/Windows Node 20/24 CI after publication.

**Rollback method:** Before publication, discard only the Phase 2A working-tree changes after explicit user approval. After publication, revert through ordinary new commits. Runtime rollback is limited to reviewed `legacy`, the generated compatibility profile, or a narrower read-only profile; invalid Policy configuration must never fall through to unguarded execution. Do not delete user profiles, credentials, grants, audit facts, or prior archives as part of rollback.

**Next step:** Await the user's decision on staging, commit, push, and exact-head CI. Keep all current changes unstaged and do not begin Phase 2B.

## STEP-251 — Reconcile the Phase 2A knowledge base

**Status:** Complete; documentation-only cleanup, unstaged and unpublished

**Goal:** Apply the `neat-freak` knowledge cleanup after Phase 2A local acceptance: remove historical narration from active rule files, shrink the root memory index, align user-facing Policy state paths, verify active references against the implementation, and preserve all production behavior and publication gates.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `FAQ.md`
- `FAQ_ZH.md`
- `docs/memory/archive/policy-kernel-gate.md`

**Implementation summary:** Reduced `AGENTS.md` to active coding rules and one concise stopping-point boundary, moving detailed phase history back to the master plan and archives. Updated its documentation map to include the Policy Kernel archive and Phase 2A plan. Re-edited `Memory.md` as an index rather than a duplicate implementation log: removed old failed-run narration, per-slice mechanics, redundant CI history, and tool-by-tool limitations already retained in Phase 1 archives; kept current state, active Policy boundaries, final evidence, cross-cutting limitations, the publication decision, and archive links. Added STEP-251 to recent summaries. Completed the user-facing local-state map in both FAQs by documenting `~/.codexpro/runtime/`, `~/.codexpro/permissions/`, and the private installation-local `~/.codexpro/policy/identity-hmac.key`, including the warning that replacing the key changes future credential references. No production source, tests, configuration behavior, dependencies, package metadata, protected Smoke source, or runtime state changed in this cleanup.

**Verification commands:**

- `node --test test/auth-documentation.test.mjs`.
- Node structural reconciliation check for AGENTS/Memory byte and line limits, all `Memory.md` Markdown links, authoritative Policy document pointers, FAQ state paths, config/example environment-variable parity, identity-key path parity, and absence of stale active Phase 2A status text.
- Targeted active-document searches for stale Phase 2A “not started” language and relative-time wording.
- Final `git diff --check`.
- Final `show_changes` review confirming the complete working tree remains unstaged.

**Verification results:** Authentication/documentation contracts passed 5/5. Structural reconciliation passed with `AGENTS.md` at 11,307 bytes and 193 lines, and `Memory.md` at 8,858 bytes and 95 lines; before this cleanup they were 12,180 bytes/196 lines and 17,731 bytes/140 lines respectively. Every root-memory Markdown link resolved, the master plan, Policy archive, and Phase 2A plan pointers existed, both FAQs matched the implemented runtime/permissions/identity-key paths, `CODEXPRO_POLICY_ENGINE` and `CODEXPRO_PERMISSION_PROFILE` matched `src/config.ts`, and no active project document still described Phase 2A as unstarted. The only search hit for the word “最近” was the semantic phrase “最近事务” in a future undo acceptance criterion, not a relative-date status. Final whitespace and unstaged-scope results are recorded by the closing verification for this step.

**Decisions made:** `AGENTS.md` remains a rule manual, not a phase changelog. `Memory.md` remains a bounded current-state index, while detailed implementation mechanics and failed attempts stay in append-only archives and paired specs/plans. User-facing storage documentation must describe all active Policy state families, but must not expose credential contents or imply that the HMAC key is portable identity. Historical specification statements such as the original twelve-check self-test contract remain unchanged because they accurately describe closed Phase 1 design history; the active docs and runtime now state seventeen checks.

**Risks or limitations:** This cleanup does not replace exact-head CI or publish Phase 2A. The Policy archive remains append-only and will continue to grow; its volume must be checked after future STEP entries. The root index intentionally omits many tool-local limitations, so agents must follow its archive pointers when modifying those tools. No project-external Codex memory or global configuration was changed.

**Rollback method:** Revert only the STEP-251 edits through an ordinary new commit after publication, or discard these five documentation-file changes before publication only with explicit user approval. Do not rewrite prior archive entries, delete the Policy archive, or restore duplicated historical narration to `AGENTS.md` or `Memory.md`.

**Next step:** Await the user's decision on staging, commit, push, and exact-head CI. Keep Phase 2B closed until that decision.

## STEP-252 — Repair the Ubuntu exact-head regression

**Status:** Local repair complete; replacement exact-head CI pending

**Goal:** Publish Phase 2A, inspect the first exact-head four-job matrix, fix any cross-platform defect without weakening production policy behavior, and keep Phase 2B closed until a replacement Ubuntu/Windows Node 20/24 matrix passes.

**Published implementation:** Commit `e6798b6` (`Implement Phase 2A policy kernel`) pushed all 57 approved files to `main`. The working tree was clean after push.

**Initial exact-head result:** GitHub Actions run `29325407247` targeted full SHA `e6798b6890de4276c2d28895a6359129e10578eb`. Windows / Node 20 and Windows / Node 24 passed Build, Regression Tests, Smoke Test, and Check Package Contents. Ubuntu / Node 20 and Ubuntu / Node 24 both passed setup, install, and Build, then failed Regression Tests; their later Smoke and package steps were correctly skipped. The symmetric Linux-only failure excluded a Node-version-specific defect.

**Root cause:** `test/policy-resources.test.mjs` instantiated `PathGuard(config, "win32")` while the actual process ran on Ubuntu. `PathGuard` intentionally uses the host `node:path` implementation for filesystem resolution. On Linux, the test input `SRC\\File.ts` is a single filename containing a backslash rather than a Windows path separator, so the asserted canonical `relativePath` could never equal `src/File.ts`. Production resource normalization was not defective; the test mixed simulated policy semantics with a real filesystem parser from a different platform.

**Repair:** Keep the filesystem guard on `process.platform`, resolve the real existing `src/File.ts`, and pass `platform: "win32"` only to the resource comparison-key normalizer. Assert that the filesystem descriptor preserves canonical `relativePath` while producing lowercase `comparisonKey`. Test slash conversion and case folding separately through `describeGitResource`, which normalizes path strings without touching the host filesystem. No production source, schema, package, dependency, or protected Smoke file changed.

**Files changed:**

- `test/policy-resources.test.mjs`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/policy-kernel-gate.md`

**Local verification:**

- Focused resource tests: 7/7 pass.
- Complete regression: 525 pass, 0 fail, 1 Windows platform skip across 526 tests.
- TypeScript Build: pass.
- All eight Smoke sections: pass.
- The earlier pre-publication Stress and 195-file package dry-run remained valid because the repair changes only a test and project records; replacement exact-head CI remains authoritative for cross-platform closure.

**Decision:** Preserve the failed run as evidence. Do not rerun the same SHA or skip the Linux assertion. Publish an ordinary test-only repair commit, require a fresh exact-head four-job matrix, then record formal Phase 2A closure separately.

**Rollback:** Revert the repair commit through an ordinary new commit. Do not rewrite `e6798b6`, delete failed-run evidence, weaken path-policy production code, or make Ubuntu tests conditional merely to obtain a green matrix.

**Next step:** Stage and publish this test-only repair, check the exact replacement SHA on Ubuntu/Windows Node 20/24, and keep Phase 2B closed until all four jobs pass.
