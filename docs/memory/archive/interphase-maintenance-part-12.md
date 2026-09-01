# Interphase Maintenance Archive — Part 12

This append-only continuation starts with STEP-530 after Part 11 closed at its configured direct-read threshold. Do not rewrite prior volumes; append corrections as later entries.

## 2026-08-28 — STEP-530: preserve legacy hostname provenance

**Status:** completed

**Goal:** Keep `CODEXGPT_HOSTNAME` value-compatible with `CODEXGPT_PUBLIC_HOSTNAME` while preserving the winning legacy source through the supported public entry, so `config explain` and `doctor` can provide a value-free migration without changing runtime behavior or fingerprints.

**Files changed:** `scripts/codexgpt-entry.mjs`, `scripts/codexgpt.mjs`, `test/network-config-compatibility.test.mjs`, `CHANGELOG.md`, `README.md`, `README_ZH.md`, `FAQ.md`, `FAQ_ZH.md`, `config.example.env`, `docs/reviews/2026-08-28-network-configuration-compatibility-inventory.md`, `Memory.md`, and this archive.

**Implementation:**

- The public entry now leaves a winning `CODEXGPT_HOSTNAME` in its original environment slot instead of copying it to `CODEXGPT_PUBLIC_HOSTNAME`; CLI/profile/canonical precedence is unchanged.
- The owned configuration explanation classifies the selected legacy variable as compatibility provenance and supplies the exact value-free PowerShell migration `$env:CODEXGPT_PUBLIC_HOSTNAME = $env:CODEXGPT_HOSTNAME; Remove-Item Env:CODEXGPT_HOSTNAME`.
- Runtime hostname, allowed-Host set, resolved document, and public fingerprint remain identical to the canonical variable. Doctor warns only when the legacy input wins and never includes the hostname value.
- `NGROK_DOMAIN`, generic `HOST`/`PORT`, Tailscale setup behavior, authentication, tool manifests/counts, listeners, authority, profiles, and deployment remain unchanged.

**TDD and corrections:** The first focused run failed 2/3 because the public launcher still manufactured `CODEXGPT_PUBLIC_HOSTNAME`. The minimal launcher and explanation changes made the same test pass 3/3; the broader focused set then passed 57/57.

**Verification:**

- `npm run test:focused -- test/network-config-compatibility.test.mjs` — passed 3/3 after the expected RED failure.
- `npm run build` — passed.
- `npm run test:focused -- test/network-config-compatibility.test.mjs test/config-explain.test.mjs test/config-fingerprint.test.mjs test/doctor-start-config-parity.test.mjs test/doctor-shell.test.mjs test/cli-hostname-propagation.test.mjs test/cloudflared-installer.test.mjs test/auth-documentation.test.mjs test/public-cli-help.test.mjs test/test-execution-profiles.test.mjs test/package-contents.test.mjs` — passed 57/57.
- `node scripts/toolchain-manager.mjs matrix --major all --root C:\Users\Administrator\AppData\Local\CodexPro\toolchains -- node --test test/network-config-compatibility.test.mjs test/config-explain.test.mjs test/doctor-start-config-parity.test.mjs test/doctor-shell.test.mjs test/cli-hostname-propagation.test.mjs test/cloudflared-installer.test.mjs` — Node 20.20.2 passed 34/34; Node 24.15.0 passed 34/34.
- `node scripts/toolchain-manager.mjs matrix --major all --root C:\Users\Administrator\AppData\Local\CodexPro\toolchains -- npm run build` — both managed builds passed.
- `npm run task:run -- -- node scripts/http-smoke-compat.mjs` — passed.
- `npm run policy:check`, `git diff --check`, Markdown local-link scan, added-line secret scan, file-scope review, and memory/archive size checks — passed.

**Risks and limitations:** `CODEXGPT_HOSTNAME` remains accepted for the migration window without a fixed removal date. The warning is intentionally exposed through config explanation/doctor rather than normal startup. `NGROK_DOMAIN` remains provenance-collapsed and mode-ambiguous. No real ChatGPT Web benchmark/App refresh was rerun, per owner direction.

**Rollback:** Revert the two source hunks, the focused contract additions, and STEP-530 documentation/memory entries while retaining STEP-529. No configuration, credential, profile, deployment, commit, or external state requires rollback.

**Next approved action:** Preserve and classify `NGROK_DOMAIN` provenance without changing its current cross-mode value/fingerprint behavior. Keep generic `HOST`/`PORT` and Tailscale setup work separately gated.

## 2026-08-28 — STEP-531: preserve and classify NGROK_DOMAIN provenance

**Status:** completed

**Goal:** Stop the supported public entry from erasing a selected `NGROK_DOMAIN` source, expose its established ngrok-named but cross-mode semantics honestly, and preserve runtime values/fingerprints and all existing precedence without inventing an unapproved removal warning.

**Files changed:** `scripts/codexgpt-entry.mjs`, `scripts/codexgpt.mjs`, `scripts/config-explain.mjs`, `src/configResolver.ts`, `test/network-config-compatibility.test.mjs`, `CHANGELOG.md`, `README.md`, `README_ZH.md`, `FAQ.md`, `FAQ_ZH.md`, `config.example.env`, `docs/reviews/2026-08-28-network-configuration-compatibility-inventory.md`, `Memory.md`, and this archive.

**Implementation:**

- The public entry no longer copies a winning `NGROK_DOMAIN` into `CODEXGPT_PUBLIC_HOSTNAME`; runtime resolution still reads the original variable at the same precedence.
- Configuration explanation represents the selected source as compatibility provenance with `classification=mode-ambiguous`, `namedTunnelMode=ngrok`, and `effectiveScope=all-tunnel-modes`. Text output spells out the mismatch instead of presenting it as canonical.
- The compatibility source has `removeAfter=not scheduled` and no remediation metadata, so neither config explanation nor doctor creates an unapproved migration warning. New configuration guidance prefers `CODEXGPT_PUBLIC_HOSTNAME`.
- CLI, `CODEXGPT_PUBLIC_HOSTNAME`, and `CODEXGPT_HOSTNAME` precedence is unchanged. Generic `HOST`/`PORT`, Tailscale setup, authentication, profiles, tool counts/manifests, listeners, Tunnel/DNS, authority, and deployment are unchanged.

**TDD and corrections:** The first focused run passed the three existing tests and failed the new fourth test because the launcher still manufactured `CODEXGPT_PUBLIC_HOSTNAME` (`true !== false`). The minimal entry/explanation/type changes made the same suite pass 4/4. A first read-only range command also had a PowerShell `${p}` delimiter error; the corrected command changed no state.

**Verification:**

- `npm run test:focused -- test/network-config-compatibility.test.mjs` — expected RED 3/4, then passed 4/4.
- `npm run build` — passed.
- `npm run test:focused -- test/network-config-compatibility.test.mjs test/config-explain.test.mjs test/config-fingerprint.test.mjs test/config-resolver.test.mjs test/doctor-start-config-parity.test.mjs test/doctor-shell.test.mjs test/cli-hostname-propagation.test.mjs test/cloudflared-installer.test.mjs test/auth-documentation.test.mjs test/public-cli-help.test.mjs test/test-execution-profiles.test.mjs test/package-contents.test.mjs` — passed 76/76.
- `node scripts/toolchain-manager.mjs matrix --major all --root C:\Users\Administrator\AppData\Local\CodexPro\toolchains -- node --test test/network-config-compatibility.test.mjs test/config-explain.test.mjs test/config-resolver.test.mjs test/doctor-start-config-parity.test.mjs test/doctor-shell.test.mjs test/cli-hostname-propagation.test.mjs test/cloudflared-installer.test.mjs` — Node 20.20.2 passed 53/53; Node 24.15.0 passed 53/53.
- `node scripts/toolchain-manager.mjs matrix --major all --root C:\Users\Administrator\AppData\Local\CodexPro\toolchains -- npm run build` — both managed builds passed.
- `npm run task:run -- -- node scripts/http-smoke-compat.mjs` — passed.
- `npm run policy:check`, `git diff --check`, Markdown local-link scan, STEP-531 added-line secret scan, file-scope review, and memory/archive size checks — passed.

**Risks and limitations:** `NGROK_DOMAIN` remains effective outside ngrok mode because changing that behavior would break compatibility and fingerprints. The classification is descriptive, not a warning or removal schedule. No real ChatGPT Web benchmark/App refresh was rerun, per owner direction.

**Rollback:** Revert the four source hunks, the focused contract additions, and STEP-531 documentation/memory entries while retaining STEP-530. No configuration, profile, credential, deployment, commit, or external state requires rollback.

**Next approved action:** Decide whether `NGROK_DOMAIN` should receive a value-free migration warning to `CODEXGPT_PUBLIC_HOSTNAME` or remain indefinitely supported. Preserve STEP-531 cross-mode value/fingerprint parity; keep generic `HOST`/`PORT` and Tailscale setup separately gated.

## 2026-08-29 — STEP-532: knowledge and rule reconciliation

**Status:** completed

**Goal:** Reconcile the STEP-516–531 process/configuration work with the active human documentation, reduce hot-memory duplication, and mechanically audit the project's own documentation and rule contracts without changing product behavior or disturbing the existing working tree.

**Files changed:** `README.md`, `README_ZH.md`, `Memory.md`, new `docs/memory/archive/README.md`, and this archive. Files changed in product source: none.

**Documentation and memory changes:**

- Added the missing bilingual operator rule: `run_command` is only for a bounded command expected to exit; full-mode `start_process` owns servers/watchers/REPLs, ConPTY input, cursor-based reads, and explicit termination. Both remain unsandboxed `full_access`; positive output waits are bounded to 30 seconds and `eof=true` is immediate.
- Graduated the complete 44-volume archive map from `Memory.md` into `docs/memory/archive/README.md`. The hot index retains one complete-index pointer and the active Part 12 pointer; no archive was deleted, renamed, repartitioned, or rewritten.
- Compaction reduced `Memory.md` from 127 lines / 17,603 bytes to 85 lines / 13,165 bytes before this STEP-532 summary was added. `AGENTS.md` remains 184 lines / 15,078 bytes: near its soft size guide but composed of current hard boundaries rather than historical narration, so no rule was weakened for a size target.

**Rule and knowledge audit:**

- Mechanically enumerated and read 168 project Markdown files (4,765,226 characters before the new archive index), including 20 active/root documents; classified append-only archives, historical plans/specs, benchmark records, and ignored `.ai-bridge` evidence separately from active user documentation.
- All local Markdown targets resolved; the new archive index covers exactly all 44 volumes with no missing or dead target. All 32 explicit rule/reference paths and the required `build`, `policy:check`, `test:focused`, and `task:run` package scripts exist; the package bin still points to `scripts/codexgpt-entry.mjs`.
- Active documentation has no `today`/`yesterday`/`recently` or Chinese equivalent, no dated stale-open marker in `Memory.md`, and `.gitignore` retains `.env`/`.env.*`. Project rules make `AGENTS.md` authoritative and do not require `CLAUDE.md`, so none was created or linked.
- The Codex automatic memory registry was checked read-only and already describes STEP-531 accurately; no project-external memory or rule file was changed. Oversize historical archives/plans remain governed by their frozen/append-only boundaries and were not destructively split.

**Verification:**

- `npm run test:focused -- test/auth-documentation.test.mjs test/public-cli-help.test.mjs test/package-contents.test.mjs` — passed 10/10.
- `npm run policy:check` — passed.
- `git diff --check` — passed apart from informational existing LF-to-CRLF warnings.
- Full project Markdown local-link scan — 169 files, zero broken targets.
- Rule/reference, archive-index completeness, active relative-time, stale-open-item, added-line secret-pattern, staged-scope, and size checks — passed.

**Risks and limitations:** This is a documentation/memory-only reconciliation; it does not rerun ChatGPT Web, refresh an App, change the STEP-531 `NGROK_DOMAIN` decision boundary, or add runtime evidence. Historical large plans and archives are intentionally left intact because current project rules prohibit repartitioning closed volumes.

**Rollback:** Restore the two README additions, expand the archive links back into `Memory.md`, remove the new archive index only with explicit destructive authorization, and append an archive correction rather than rewriting this record. No source, configuration, credential, profile, deployment, commit, or external state requires rollback.

**Next approved action:** Decide whether `NGROK_DOMAIN` should receive a value-free migration warning to `CODEXGPT_PUBLIC_HOSTNAME` or remain indefinitely supported. Preserve STEP-531 cross-mode value/fingerprint parity; keep generic `HOST`/`PORT` and Tailscale setup separately gated.

## 2026-08-29 — STEP-533: complete P1 unified tool definition and execution pipeline

**Status:** completed locally under the owner's explicit instruction to finish P1 and not rerun P0/ChatGPT Web.

**Goal:** Reduce model tool-selection ambiguity without deleting tools or changing V1–V5 authority by giving every direct tool one immutable definition and one fixed cross-cutting execution path, then rewrite the overlapping tool descriptions that directly influence ChatGPT selection.

**Files changed:** new `src/tools/runtime/definition.ts`, `src/tools/runtime/registry.ts`, `src/tools/runtime/pipeline.ts`, and `src/tools/runtime/result.ts`; `src/server.ts`; `src/policy/integration.ts`; `src/semantic/projectResolver.ts`; `src/semantic/builtin/typescriptWorker.ts`; `scripts/test-execution-profile-manifest.mjs`; new `test/tool-definition-registry.test.mjs`, `test/tool-pipeline-order.test.mjs`, `test/tool-result-projection.test.mjs`, and `test/tool-description-contract.test.mjs`; `test/phase-4a-integration.test.mjs`; `test/phase-5-v4-inherited-contract.test.mjs`; `test/phase-7-v5-runtime-inheritance.test.mjs`; `test/phase-7-repository-acceptance.test.mjs`; `test/production-runtime-integration.test.mjs`; `test/search-contract.test.mjs`; `test/transaction-architecture.test.mjs`; `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; `Memory.md`; and this archive. The pre-existing `scripts/http-smoke.mjs` working-tree change was not altered; only its protected expected SHA was synchronized after the full suite exposed the stale snapshot.

**Implementation:**

- Added the exact P1 runtime layout. `ToolDefinition` owns name/category/intent/positive and negative routing/schema/mutability/execution/workspace/handler facts; definitions and routing arrays are frozen. The per-server registry rejects duplicates and contains exactly one definition for each registered direct tool.
- Collapsed MCP registration to one `registerToolCompat` gateway. Every direct call and closed-world supertool child now traverses the same server-scoped authorization → workspace → Policy → approval → execute → audit → render sequence. OAuth denials preserve their existing MCP challenge; the existing Policy Kernel remains the authoritative approval/persistent-audit implementation; cancellation is checked before every authority/execute boundary; write/exclusive calls share one coordinator; audit and exactly one renderer observe every terminal result.
- Preserved the exact V1–V5 child universes `28/31/39/51/52`, existing input/output wire schemas, OAuth scopes, direct/supertool payload hashes, mutation participants, and public error projection. Phase 3D registration now uses the same gateway without double-wrapping its already prepared mutation.
- Added positive/negative MCP guidance for `read`, `write`, `tree`, `search`, `semantic`, `workspace_snapshot`, `inspect_workspace`, `codex_context`, `edit`, `apply_patch`, `run_command`, and `start_process`. Exact lexical discovery stays `search`, unknown path discovery stays `tree`, semantic navigation stays `semantic`, whole-file replacement stays `write`, exact replacement stays `edit`, multi-location atomic mutation stays `apply_patch`, finite commands stay `run_command`, and persistent/interactive work stays `start_process`.
- Kept the earlier PathGuard-owned hook pipeline as a lower-level read/tree/search compatibility seam. It is nested below the new runtime and is not an alternate MCP registration, OAuth, Policy, audit, or rendering path. No Cordis dependency or remote framework was introduced.
- The final ordinary gate exposed a real Node 20 Phase 7 diagnostics regression as the repository grew: intentionally partial dependency projects were rebuilt on every call, and diagnostics rooted the TypeScript program at every unrelated repository file. Partial projects now revalidate every cached source/dependency snapshot while remaining explicitly partial; diagnostics retains every virtual snapshot for imports but roots the program only at the target plus dependency declarations. The fixed 5-second worker timeout and 1/2-second strict/ordinary warm thresholds were not enlarged, complete dependency inventories still detect additions, and rename remains fail-closed on partial coverage.

**TDD and verification:**

- The four required P1 tests first failed with `ERR_MODULE_NOT_FOUND`, then passed after the runtime components were added. Final P1/production focused set passed 29/29; Policy/OAuth/workspace/mutation/audit focused regressions passed 78/78; Node 20 Phase 7 definition/reference/diagnostics and cache contracts passed 21/21.
- Managed ordinary run `2026-08-29T16-07-06-878Z-p1-final-ordinary-r4-f81d01ac` completed with exit code 0 and no `not ok`: Node 20.20.2 and Node 24.15.0 each passed fast 1211/1212 with one established platform skip, safe 299/300 with one established platform skip, and isolated 68/68. Output was complete and temporary state was cleaned.
- Managed smoke run `2026-08-29T21-20-27-581Z-p1-final-smoke-1b71a342` completed with exit code 0 on both Node majors: analysis, analysis CLI, base, HTTP, Pro CLI, doctor, settings, and execute/watch/loop handoff smoke all passed; temporary state was cleaned.
- Managed Node 20/24 `npm run build`, `npm run policy:check`, and `npm pack --dry-run --json` passed. The package inventory contains 676 files and all four compiled `dist/tools/runtime/*.js` artifacts.
- Contract snapshots prove only model-facing descriptors changed: direct and supertool call payload hashes stayed identical. Source gates prove one MCP registration call, no server-level Policy installation bypass, every V5 child has selection metadata, the required stage order cannot be bypassed, exclusive calls serialize, cancellation skips Policy/execute, every result renders once, and package/runtime sources contain no Cordis dependency.

**Decisions:** P1 is closed as a local implementation step. No tool was removed; no authority, deployment, credential, network, App, release, commit, or push changed. The semantic optimization is included because the full required Node 20 ordinary gate demonstrated a code-level user-visible `unavailable` result; the fix preserves the existing time/security bounds instead of weakening its test.

**Risks and limitations:** The owner explicitly removed a new P0/Web rerun from scope. Historical matched task success did not regress, but this new working tree has no complete fresh ChatGPT UI/tool trace, so `wrong_tool_calls`, `redundant_tool_calls`, and `total_tool_calls` remain unscored; no P1 efficiency reduction is claimed. Compatibility handlers still own some stable workspace/error/domain-result construction after the central pre-resolution stage; future migration may consume more of `ToolExecutionContext`, but there is already only one public registration/authority/audit/render path. The existing dirty working tree remains uncommitted and contains earlier STEP-516–532 work.

**Rollback:** Revert the four runtime files, the `src/server.ts`/Policy integration, description/hash/test-manifest changes, and the two bounded semantic cache/root changes; restore the prior protected smoke SHA and append an archive correction. No App, runtime deployment, profile, credential, branch, commit, remote, or external service requires rollback.

**Next approved action:** none beyond P1. P2/P3/P4, Web/App refresh, deployment, publication, commit/push, and the existing `NGROK_DOMAIN` warning/retention decision remain separately gated.

**Verification addendum:** After the final knowledge/rule wording, the four required P1 contracts plus the documentation/package contracts passed 22/22. `npm run policy:check`, `git diff --check`, the 169-file Markdown local-link scan, P1 credential-pattern/Cordis scans, package-script/public-entry checks, archive-order check, and memory/archive size checks passed. No files are staged. This adds no scope or behavioral change.

## 2026-08-30 — STEP-534: reconcile P1 documentation, project rules, and agent memory

**Status:** completed

**Goal:** Make the completed P1 tool-selection and execution architecture discoverable to users, designers, future agents, and the changelog; remove the stale Codex-memory status; and mechanically re-audit the workspace's documentation and rule contracts without changing product behavior or disturbing the existing dirty working tree.

**Files changed:** `CHANGELOG.md`, `README.md`, `README_ZH.md`, `design.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `Memory.md`, and this archive. One project-external Codex memory-correction request was added at `D:\Codex\home\memories\extensions\ad_hoc\notes\20260830-074851-codexgpt-p1-closure.md` as required by the automatic-memory write boundary. Files changed in product source: none.

**Documentation and memory changes:**

- Added the completed P1 architecture to the unreleased changelog: one immutable definition per registered direct tool, one direct/supertool execution path, positive/negative selection guidance, and unchanged V1–V5 wire/authority compatibility.
- Added the concrete user routing contract to both READMEs: `tree` versus `search` versus `semantic`, `write` versus `edit` versus `apply_patch`, and finite `run_command` versus full-mode persistent/interactive `start_process`. The wording explicitly says selection guidance grants no authority and bypasses no approval.
- Added the same routing boundary to `design.md` as interaction design rather than implementation trivia. The master plan review date now records this 2026-08-30 reconciliation; its stage/order/authorization content did not change.
- Updated the hot project-memory index in place, kept P1 mechanics in the authoritative plan/archive, and replaced the oldest recent-summary item instead of growing the list. The Codex automatic-memory entry initially said P1 was partial and an obsolete ordinary run was active; the authorized ad-hoc correction was consumed, and the current read-only registry now records STEP-533 success with the exact final ordinary/smoke evidence and the unscored Web-efficiency boundary. The automatic registry was not edited directly.

**Rule and knowledge audit:**

- Mechanically enumerated and read all 169 project Markdown files. All local links resolve; the archive index covers all 44 implementation volumes exactly, and the active Part 12 headings remain ordered STEP-530 through STEP-534.
- All 28 explicitly checked rule/document paths exist. The required `build`, `policy:check`, `test:focused`, and `task:run` scripts exist; the package bin still targets `scripts/codexgpt-entry.mjs`; `.gitignore` still contains both `.env` and `.env.*`.
- Live source still has one `.registerTool(` call and no server-level `installPolicyKernel(server` bypass. The focused P1 contracts independently freeze all V5 selection metadata, stage ordering, result projection, Cordis absence, and public registration compatibility.
- Active documentation has no relative-time terms or dated stale-open markers. The only automated stale-P1 text match was the accurate `Memory.md` sentence saying P1 is complete while P2/P3/P4 remain gated; no active project document still presents P1 as partial or blocked.
- Added-line credential-pattern scan found zero hits. No file is staged. `AGENTS.md` remains authoritative and does not require `CLAUDE.md`, so no duplicate rule file or symlink was created.

**Verification:**

- `npm run test:focused -- test/tool-definition-registry.test.mjs test/tool-pipeline-order.test.mjs test/tool-result-projection.test.mjs test/tool-description-contract.test.mjs test/auth-documentation.test.mjs test/public-cli-help.test.mjs test/package-contents.test.mjs` — passed 22/22.
- `npm run policy:check` — passed.
- `git diff --check` — passed with informational existing LF-to-CRLF warnings only.
- Full 169-file Markdown local-link scan, 44-volume archive-index completeness, 28-path rule-reference scan, four-script/public-entry checks, active relative-time and dated-open-item scans, source registration/bypass checks, added-line credential scan, staged-scope check, and memory/archive size checks — passed.
- Final sizes: `AGENTS.md` 184 lines / 15,078 bytes; `Memory.md` 91 lines / 15,685 bytes; master plan 1,381 lines / 84,988 bytes; active Part 12 178 lines / 26,325 bytes before this correction. All remain within their applicable hard/split limits; `AGENTS.md` and the master plan are near their generic soft guides but contain active rules/current authority rather than safe-to-delete history.
- One read-only PowerShell audit command initially used `$file:` inside an interpolated string and failed at parse time; the corrected `${file}:` form completed without changing state.

**Decisions:** Treat model-facing tool descriptions as user experience and keep their stable selection boundaries in `design.md` and the bilingual user guide. Keep detailed runtime mechanics and evidence in the master plan/archive rather than adding history to `AGENTS.md`. Keep frozen plans, specs, benchmark records, and closed archive volumes unchanged.

**Risks and limitations:** This is documentation, project-memory, and memory-correction maintenance only. It does not rerun ChatGPT Web, refresh an App, change a tool descriptor, alter authority, resolve the `NGROK_DOMAIN` decision, deploy, publish, commit, or push. The P1 Web-efficiency metrics remain unscored exactly as recorded in STEP-533.

**Rollback:** Revert the five active-document edits and the project-memory update, then append an archive correction rather than rewriting this record. The project-external correction request can be superseded by a later correction note; no runtime, configuration, profile, credential, App, deployment, branch, commit, or remote state changed.

**Next approved action:** none. P2/P3/P4, App/Web refresh, deployment, publication, commit/push, and the existing `NGROK_DOMAIN` warning/retention decision remain separately gated.

## 2026-08-30 — STEP-535: complete P2 bounded workspace bootstrap

**Status:** completed locally under the owner's explicit instruction to execute P2 through completion without another P0/ChatGPT Web rerun.

**Goal:** Give the model one short, stable, evidence-labelled workspace bootstrap result immediately after opening a workspace, while keeping full trees, diffs, instruction bodies, and Skill bodies lazy and preserving every existing authority boundary and rollback path.

**Files changed:** new `src/context/workspaceContext.ts`, `src/context/projectDetector.ts`, `src/context/commandDetector.ts`, and `src/context/contextBudget.ts`; `src/server.ts`; `src/tools/schemas/openWorkspace.ts`; `src/tools/schemas/openCurrentWorkspace.ts`; new `test/workspace-context.test.mjs`; `test/open-workspace-contract.test.mjs`; `test/phase-6-root-bootstrap.test.mjs`; `test/phase-6-standard-projection.test.mjs`; `test/production-runtime-integration.test.mjs`; `scripts/test-execution-profile-manifest.mjs`; `README.md`; `README_ZH.md`; `design.md`; `CHANGELOG.md`; `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`; `Memory.md`; and this archive. Earlier STEP-516–534 dirty-worktree changes were preserved and not reclassified as P2.

**Implementation:**

- Added a strict `WorkspaceContextSnapshot` containing project type, languages, package manager, build/test/lint/typecheck commands, Git summary, instruction-file paths, bounded Skill name/description/source/applicability metadata, capability availability, lazy detail-tool names, and explicit budget accounting.
- Root detection reads only fixed manifest/support candidates: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `CMakeLists.txt`, package-manager lockfiles, and TypeScript config evidence. It does not recursively enumerate the repository. Production reads reuse the workspace PathGuard and same-handle bounded text reader rather than creating a bypass.
- Every command and detected project fact carries an exact evidence source and `confirmed|inferred` confidence. Package scripts are confirmed from their exact `package.json` field; ecosystem defaults are labelled inferred rather than presented as discovered facts.
- The deterministic serialized snapshot is capped at 12,000 characters and separately caps instruction paths, Skill entries, and descriptions while reporting truncation and omitted counts. It contains no instruction or Skill body, full tree, or diff. `codex_context`, `load_skill`, `tree`, and `git_diff` remain the explicit detail tools.
- Standard `open_workspace` and `open_current_workspace` now include the snapshot in their strict structured results and render its bounded model-facing projection. Existing structured guidance compatibility remains available, but its body is not repeated in the model text. `open_workspace` tree discovery is opt-in by default. Explicit `guidanceMode=legacy` retains the previous schema/projection as rollback.
- Preserved V1–V5 counts `28/31/39/51/52`, scopes, Policy/approval/audit execution, workspace capability semantics, mutation inventory, and deployment state. The four expected V1 descriptor digests changed only because the two open-tool descriptions/default-tree input guidance changed; their tool-call payload contracts did not gain authority.

**TDD and verification:**

- The initial P2 RED run failed 0/5 with `ERR_MODULE_NOT_FOUND` for the four required context modules. The implemented context/unit and open integration contracts then passed; the final focused open/P2 set passed 51/51, the broader local closure set passed 85/85, and the selected managed Node 20.20.2/24.15.0 focused set passed 62/62 on each.
- The first detached ordinary attempt `2026-08-30T07-21-39-730Z-p2-final-ordinary-db91f67a` correctly failed closed because the new test was absent from the execution-profile inventory. After registration, the second attempt `2026-08-30T07-27-21-331Z-p2-final-ordinary-r2-2bdf488b` exposed one stale Phase 6 assertion expecting the instruction body in model text; structured compatibility still retained the body, so the assertion was corrected to require its omission only from the bounded projection.
- A third run `2026-08-30T07-34-49-209Z-p2-final-ordinary-r3-899aec41` passed current Node 24 but was not accepted as the required matrix because `--major all` had been supplied to the domain script instead of the toolchain manager. No code changed because of that invocation error. The correct managed run `2026-08-30T07-44-04-387Z-p2-final-ordinary-r4-9dc8a074` completed with exit code 0: Node 20.20.2 and Node 24.15.0 each passed fast 1218/1219 with one established platform skip, safe 299/300 with one established platform skip, and isolated 68/68. Its 477,113-byte stdout was complete, stderr was empty, and temporary state was cleaned.
- Managed smoke run `2026-08-30T12-11-24-080Z-p2-final-smoke-e07d16ce` completed with exit code 0 on both Node majors: analysis, analysis CLI, base, HTTP, Pro CLI, doctor, settings, and execute/watch/loop handoff smoke all passed; output was complete, stderr was empty, and temporary state was cleaned.
- Managed Node 20/24 `npm run build` passed. `npm pack --dry-run --json` passed with 684 files and contains all four `dist/context/*.js` modules plus sourcemaps. `npm run policy:check`, `git diff --check`, the added-line credential-pattern scan, and the nonignored 150-file/120-local-link Markdown scan passed. No file is staged.

**Rule and knowledge audit:** The bilingual READMEs, design, changelog, master plan, hot memory index, and this append-only archive now agree on the P2 user contract and its rollback. `AGENTS.md`, `Memory.md`, `.env`/`.env.*` ignores, public entry, package scripts, archive order, and referenced active paths remain present. Final pre-entry sizes were `AGENTS.md` 15,078 bytes, `Memory.md` 16,433 bytes, and active Part 12 26,752 bytes; the hot memory and archive remain below their hard/split limits. `AGENTS.md` remains authoritative and does not require a duplicate `CLAUDE.md`.

**Decisions:** P2 is closed as a local implementation step. One open call now supplies the bounded bootstrap facts required to choose a first useful operation, but this contract is not claimed as measured Web tool-call reduction. P3 remains separately gated. No App, tool scan, deployment, credential, network, release, commit, push, or external service changed.

**Risks and limitations:** The owner explicitly excluded a new P0/Web run. The repository proves the snapshot content, budget, lazy-body boundary, and runtime compatibility, but the current working tree has no complete fresh ChatGPT UI/tool trace. `wrong_tool_calls`, `redundant_tool_calls`, and `total_tool_calls` therefore remain unscored, and no P2 efficiency percentage is claimed. Root-manifest heuristics intentionally prefer bounded deterministic evidence over recursive discovery; unusual build systems may require the advertised lazy detail tools.

**Rollback:** Revert the four context modules, standard open schema/projection/default-tree changes, descriptor snapshots, test-inventory entry, P2 tests, and P2 documentation; restore the previous standard open projection or select explicit `guidanceMode=legacy`; append an archive correction rather than rewriting this entry. No App, runtime deployment, profile, credential, branch, commit, remote, or external service requires rollback.

**Next approved action:** none beyond P2. P3/P4, a fresh App/Web efficiency run, deployment, publication, commit/push, and the existing `NGROK_DOMAIN` warning/retention decision remain separately gated.

## 2026-08-30 — STEP-536: reconcile P2 knowledge, prompts, rules, and Codex memory

**Status:** completed as documentation, project-memory, automatic-memory correction, and rule reconciliation; product source behavior is unchanged from STEP-535.

**Goal:** Make every active model/user guidance surface describe the completed P2 single-open bootstrap accurately, remove duplicated historical weight from the hot memory index, synchronize the Codex automatic-memory correction channel, and mechanically audit the complete project knowledge/rule surface without disturbing the intentional STEP-516–535 working tree.

**Files changed:** `CHATGPT_PROMPT.md`, `PUBLIC_LAUNCH_CHECKLIST.md`, `README_ZH.md`, `design.md`, `Memory.md`, and this archive. Product source files changed: none. The explicitly authorized project-external correction request is `D:\Codex\home\memories\extensions\ad_hoc\notes\20260830-153655-codexgpt-p2-closure.md`; the machine-generated Codex memory registry was not edited directly.

**Documentation and memory changes:**

- Removed the stale instruction to call `server_config` before every `open_current_workspace` from the shipped ChatGPT prompt and public golden prompt. Both now start with one open, consume `context_snapshot`, reserve configuration/self-test for diagnosis, and request tree/diff/body detail only when needed.
- Updated the shipped ChatGPT prompt to use the P1 routing contract: `tree` for unknown paths, `search` for exact text, `semantic` for definitions/references, `write`/`edit`/`apply_patch` by mutation shape, `run_command` for finite verification, and full-mode `start_process` for persistent/interactive work.
- Corrected the Chinese README and `design.md` so the model-facing snapshot exposes instruction paths and bounded Skill metadata without bodies. Existing structured compatibility fields may retain root guidance, while target bodies remain lazy through `codex_context`/`load_skill`.
- Compacted `Memory.md` from 93 lines / 16,671 bytes to a conclusion-and-pointer index below 13,000 bytes. Repeated STEP-527–532 verification narratives and overlapping limitations were merged; exact per-step facts remain in Parts 11/12 and closed phase volumes. The ambiguous phrase “native isolation is conditional P2 work” was replaced with a separately gated conditional-follow-up statement so it cannot be confused with the completed P2 workspace bootstrap.
- Submitted one ad-hoc Codex-memory correction request recording STEP-535/536 closure, exact ordinary/smoke evidence, the unscored Web-efficiency boundary, and continued P3/P4 gating. No machine-generated memory file was changed directly.

**Rule and knowledge audit:**

- Mechanically enumerated and UTF-8-read all 150 tracked/nonignored Markdown files (4,850,528 bytes). All 120 local links resolve and no replacement characters were found. The archive index covers all 44 implementation volumes exactly, with no dead or missing entry.
- All 32 explicitly checked rule/document paths exist. The package public bin remains `scripts/codexgpt-entry.mjs`; `build`, `policy:check`, `test:focused`, and `task:run` exist; `.gitignore` contains both `.env` and `.env.*`; no file is staged.
- The project rule hierarchy is unambiguous: project `AGENTS.md` plus the global Codex instructions are authoritative; no parent override exists; project rules do not require `CLAUDE.md`, so none was created or linked.
- Five frozen/closed documents exceed the Skill's generic 1,500-line soft guide: two append-only historical archive volumes and three approved implementation plans. Project rules prohibit repartitioning closed volumes, and frozen plans remain review evidence; they were left unchanged and must continue to be read by explicit ranges.
- The only active relative-time match is a historical audit sentence quoting prohibited terms. The dated “still unauthorized” master-plan statement is a current approval boundary, not an expired scheduled task. No stale open item was reclassified as completed.

**Verification:**

- `npm run test:focused -- test/workspace-context.test.mjs test/phase-6-root-bootstrap.test.mjs test/phase-6-standard-projection.test.mjs test/tool-description-contract.test.mjs test/auth-documentation.test.mjs test/public-cli-help.test.mjs test/package-contents.test.mjs` — passed 31/31.
- `npm run policy:check` — passed.
- `git diff --check`, added-line credential-pattern scan, P2 prompt/body wording scan, complete Markdown link/UTF-8 scan, archive-index completeness, rule-path/package-script/public-entry checks, relative-time/open-item scan, size checks, and staged-scope check — passed. Existing LF-to-CRLF warnings remain informational.

**Decisions:** Treat the shipped ChatGPT prompt and release golden prompt as first-class P2 interaction documentation, not incidental examples. Keep stable system mechanics in README/design, detailed evidence in the append-only archive, and only current conclusions plus pointers in `Memory.md`. Do not rewrite frozen specs/plans merely because newer behavior is documented by STEP-535/536.

**Risks and limitations:** This reconciliation does not rerun ChatGPT Web, refresh an App, deploy, publish, change authority, alter tool counts, decide the `NGROK_DOMAIN` policy, commit, or push. The working tree remains intentionally dirty with reviewed STEP-516–536 changes. The five oversized frozen/closed documents remain above a generic soft guide because project immutability rules take precedence; no current direct-read ceiling was enlarged.

**Rollback:** Restore the four active guidance edits and the prior hot-memory wording, append an archive correction rather than rewriting this entry, and supersede the ad-hoc Codex correction with a later correction note. No runtime, App, profile, credential, network, branch, commit, remote, or external service requires rollback.

**Next approved action:** none. P3/P4, App/Web refresh, runtime deployment, publication, commit/push, credentials, network changes, and the `NGROK_DOMAIN` warning/retention choice remain separately gated.

## 2026-08-30 — STEP-537: complete P3 unified code navigation

**Status:** completed locally under the owner's explicit instruction to execute P3 through completion. No App refresh, Web run, deployment, publication, staging, commit, push, credential, network, or other external-state action was authorized or performed.

**Goal:** Give the model one bounded code-navigation request for definition, references, implementation, text, file, or diagnostics; let the server select owned semantics, lexical search, or file discovery; and expose the actual Provider, evidence quality, fallback, and truncation without weakening any existing authority or compatibility boundary.

**Files changed:** new `src/navigation/types.ts`, `src/navigation/service.ts`, `src/tools/schemas/navigation.ts`, `fixtures/ts-imports/navigation-contract-imports.ts`, `test/navigation-service.test.mjs`, `test/navigation-contract.test.mjs`, `docs/superpowers/specs/2026-08-30-p3-unified-code-navigation-design.md`, and `docs/superpowers/plans/2026-08-30-p3-unified-code-navigation.md`; `src/semantic/types.ts`, `src/tools/schemas/semantic.ts`, `src/tools/schemas/codexgpt.ts`, `src/codexgptSupertool.ts`, `src/tools/runtime/definition.ts`, `src/server.ts`, `scripts/test-execution-profile-manifest.mjs`, the affected Phase 7/search/runtime compatibility tests, `README.md`, `README_ZH.md`, `design.md`, `CHATGPT_PROMPT.md`, `CHANGELOG.md`, `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`, `Memory.md`, and this archive. Earlier STEP-516–536 dirty-worktree changes were preserved and not reclassified as P3.

**Implementation:**

- Added a strict `NavigationService` and public request/result/match schemas. The six intents share a normalized result with mandatory `provider`, detailed `quality`, `fallback`, and `truncated`; matches are redacted and bounded to 200 results, 240-character paths, 200-character symbols, and 400-character previews.
- Added the compatible V5 `semantic(operation="navigate")` route rather than a 53rd direct tool. The `navigate_code` supertool alias is V5-only, injects exactly `operation=navigate`, rejects attempts to redirect it to rename or another semantic operation, and invokes the already registered semantic handler through the same P1 authorization -> workspace -> Policy/approval -> execution -> audit -> render path.
- Definition and references prefer the owned TypeScript provider. `implementation` intentionally uses its definition capability because the current owned engine has no separate implementation operation, while preserving `kind=implementation` in the public result. Disabled, unavailable, crashed, stale, unsupported, or empty semantic work degrades only to a fresh PathGuard-scoped lexical search labelled `lexical_fallback`; lexical evidence is never presented as semantic certainty.
- Text routes directly to bounded lexical search. File lookup uses stable case-insensitive PathGuard-scoped enumeration capped at 20,000 paths. Diagnostics use owned semantics and return labelled unavailability when that Provider cannot answer; no lexical diagnostic is invented.
- Preserved the legacy semantic definition/references/diagnostics/rename inputs and result envelopes, search behavior, mutation inventory, same-handle/rename/apply contracts, OAuth scopes, and exact direct-tool counts V1/V2/V3/V4/V5 `28/31/39/51/52`. Earlier descriptors remain exact; the intentional navigation metadata is confined to V5 semantic/supertool selection guidance.

**TDD and failed attempts:**

- Initial RED was 0/2 with the expected missing `src/navigation/service.ts` and navigation schema modules. The implemented focused navigation set finished at 17/17, including TypeScript definitions/references, Python and mixed-repository fallback, unavailable/crash/stale states, diagnostics, direct text/file routing, large/truncated/overlong results, strict schemas, exact counts, older-version rejection, and a real mixed temporary fixture.
- A broad concurrent local run passed 146/148. One failure was a real V1 descriptor regression caused by accidentally applying P3 wording outside V5; read/tree/search wording and the pre-V5 supertool description were restored, after which the exact V1 snapshots passed. The other was only the existing Phase 7 warm-definition timing threshold under concurrent pressure; the same performance acceptance passed independently without a code relaxation.
- The first final ordinary run `2026-08-30T20-18-04-345Z-p3-final-ordinary-af237e59` was stopped by exact owned run ID after its Node 20 navigation contract consumed sustained CPU. Reproduction proved direct `src/server.ts` import completed in 1.6 seconds while repeated `tsx` API imports of its dependency graph before/after the server triggered pathological duplicate transforms. One test-only import barrel under `fixtures/ts-imports/` reduced the exact Node 20 contract to a 1.6-second 4/4 pass; runtime source behavior did not change for this correction. The stopped run is not completion evidence.
- An initial high-confidence credential scan used an insufficient boundary around `sk-` and reported `task-worktree` filenames plus existing synthetic redaction fixtures. The corrected boundary-aware P3 scope scan found zero high-confidence credential patterns and did not expose or modify any real credential.

**Final verification:**

- Managed Node 20.20.2/24.15.0 focused navigation, production-runtime, Phase 7, search, definition, description, and pipeline matrix passed 67/67 on each major.
- Detached ordinary run `2026-08-30T20-30-06-358Z-p3-final-ordinary-r2-35339e54` completed with exit code 0. On both Node majors, fast passed 1235/1236 with one established platform skip, safe passed 299/300 with one established platform skip, and isolated passed 68/68. Stdout was complete at 482,254 bytes with zero dropped bytes, stderr was empty, and owned temporary state was cleaned.
- Detached smoke run `2026-08-30T20-48-47-747Z-p3-final-smoke-683b726e` completed with exit code 0 on both Node majors. Analysis, analysis CLI, base, HTTP, Pro CLI, doctor, settings, and execute/watch/loop handoff smoke passed; its 714-byte stdout was complete, stderr was empty, and owned temporary state was cleaned.
- Managed Node 20/24 `npm run build` passed. `npm pack --dry-run --json` passed with 690 files and contains `dist/navigation/service.js`, `dist/navigation/types.js`, and `dist/tools/schemas/navigation.js`; the test-only import barrel is correctly excluded from the package.
- `npm run policy:check`, `git diff --check`, final focused documentation/package contracts, exact count/alias/one-registration checks, boundary-aware P3 credential scan, nonignored Markdown UTF-8/local-link scan, archive-index coverage, staged-scope check, and memory/archive size checks passed. No file is staged.

**Decisions:** Close P3 without adding direct tool surface area: the user-visible gain is one request that survives Provider uncertainty, while the compatibility cost is confined to an additive V5 semantic operation and documented supertool alias. Keep Provider selection server-owned and evidence-labelled; do not ask the user to choose a Provider and do not infer semantic certainty from lexical matches.

**Risks and limitations:** The owner did not authorize a fresh ChatGPT Web run. Unit/integration evidence proves routing, normalization, compatibility, and failure labeling but does not prove fewer live Web calls. `wrong_tool_calls`, `redundant_tool_calls`, and `total_tool_calls` remain unscored, and no efficiency percentage is claimed. `implementation` is definition-backed until the owned Provider gains a distinct implementation capability. File discovery intentionally caps its authorized enumeration at 20,000 paths. Cached Apps still need a separately authorized **Scan Tools** refresh or recreation before new semantic input metadata is visible.

**Rollback:** Remove the navigation service/schema and V5 alias; remove `navigate` from the semantic strict/descriptor/result unions; restore the prior V5 semantic/supertool selection wording and prompt/docs; remove the two tests, test import barrel, and execution-profile entries; append an archive correction rather than rewriting this entry. Existing legacy semantic/search behavior, direct-tool counts, deployment, profiles, credentials, Apps, branch, commits, remotes, and external services require no rollback.

**Next approved action:** none beyond P3. P4, fresh App/Web evidence, runtime deployment, publication, staging/commit/push, credentials, network changes, external Providers, deferred phases, and the `NGROK_DOMAIN` warning/retention decision remain separately gated.
