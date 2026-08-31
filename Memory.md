# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-08-31; branch `codex/tool-execution-pipeline-slice1` is at `731adb7b808b8bc7810a50f875f297674983eca3`, 16 commits ahead of fetched `origin/main` `c43ec8ecae9782598ebc9cf90d8df8cdde1035c1`, and is synchronized with `origin/codex/tool-execution-pipeline-slice1`. Public release remains `codexgpt@1.0.4`.
- Historical Phase 1–8 Core/releases and roadmap P1–P5 are closed locally; exact implementation and verification history is archived.

## Approved execution boundary

P1–P5 local closure was explicitly authorized for this GitHub handoff and is now committed and pushed to `origin/codex/tool-execution-pipeline-slice1`; no App refresh, deployment, package/release publication, or Web-efficiency claim was performed. The `NGROK_DOMAIN` warning/retention decision remains open and must preserve STEP-531 value/fingerprint parity; other network, credential, service, sandbox/egress, deferred-phase, and external-state work remains separately gated.

## Active decisions and constraints

- `AGENTS.md` Section 5 and paired phase documents are the detailed rule sources; this index retains only their current operational conclusions.
- CodexGPT remains self-hosted: Cloudflare supplies only DNS/TLS/Tunnel while authentication, Host/Origin, path enforcement, and secrets stay local. Native Windows is primary; Git Bash is temporary, and PowerShell support is required.
- The supported public entry is `scripts/codexgpt-entry.mjs`. Legacy mode retains the secret query-token compatibility App; OAuth mode uses a separate App with a token-free URL and forces query-token acceptance off. Manual static-Bearer setup for ChatGPT Web is not claimed.
- V1/V2/V3/V4/V5 remain exactly 28/31/39/51/52. `full_access` is ambient authority, never isolation; `workspace`, Gate S, and Tasks 4B0–4B6 remain unavailable/deferred.
- Configured-root `workspace_id` values are random opaque, owner/grant/policy-bound capabilities shared only inside one deployment runtime. Rotation/refresh continuity and fail-closed invalidation remain as documented; restart clears them, explicit misses never default, and `session_local` remains rollback.
- Use the retained managed Node `v20.20.2`/`v24.15.0` root `%LOCALAPPDATA%\CodexPro\toolchains\`. `test-domains` is authoritative; ordinary runs are detached, control/all need CI or an independent terminal, and cleanup stops/deletes only exact owned evidence.
- `inheritEnv=false` keeps only bounded Windows paths; arbitrary tokens stay out of children. Runtime-relevant publication requires the exact-head Ubuntu/Windows Node 20/24 matrix and `npm run policy:check` before staging.
- Phase 6 guidance grants no authority. Phase 7 Core is the owned JS/TS semantic provider with same-handle reads, honest fallback, server-owned rename plans, and no sandbox claim; Serena/LSP remain separately authorized extensions.
- Phase 8 retains strict colocated OAuth, DPAPI CurrentUser, separated public/local listeners, dedicated-Tunnel setup, two-App rollback/recovery, and no new execution authority. Its exact setup, protocol, security, and acceptance boundaries remain in the paired Phase 8 spec/plan and archives.
- After OAuth, prioritize configuration provenance, offline diagnostics, current-user Windows background lifecycle, incremental server/CLI/tool-manifest modularization, then full diagnostics. Native isolation remains a separately gated conditional follow-up after a concrete untrusted-code need and a read-only feasibility go decision.
- ChatGPT Web claims use `docs/benchmarks/chatgpt-web-e2e/`; both refs require the exact successor overlay, and incomplete UI/tool traces remain unscored.
- P1 owns one immutable definition per direct tool and one server-scoped execution coordinator. Every registered call traverses authorization, workspace resolution, Policy/approval, execution, audit, and one renderer; the retained PathGuard pipeline is a lower-level read/tree/search compatibility hook, not an alternate MCP registration or Policy path.
- P2 owns one deterministic `WorkspaceContextSnapshot` assembled from root manifests, script/lock evidence, existing Git/Guidance state, and current tool capabilities. Every detected command carries `source` plus `confirmed|inferred`; the model-facing snapshot is capped at 12,000 serialized characters, omits instruction/Skill bodies, and keeps `codex_context`, `load_skill`, `tree`, and `git_diff` lazy. Standard open results add this field; explicit `guidanceMode=legacy` remains the wire rollback.
- P3 keeps 52 direct V5 tools by adding `semantic(operation=navigate)` and a V5-only `navigate_code -> semantic` supertool alias. Definition/reference/implementation prefer the owned TypeScript provider and use fresh labelled lexical fallback when needed; text/file route directly to bounded lexical discovery; diagnostics never invent a lexical substitute. Every normalized result exposes actual provider, detailed quality, fallback, and truncation.
- P4 keeps the exact direct-tool universe by adding V5 `verify_change` only as a wrapper-owned composite action. Committed V5 mutations return owner-bound workflow next-state without executing commands; explicit verification accepts only confirmed P2 check categories and reuses the registered `full_access` `run_command` Policy/approval/audit path. Standard tool mode can expose this finite path, but execution profile and local approval remain authoritative; a linked whole-workspace `show_changes` review is required for completion, and readiness additionally requires passing checks.
- P5 keeps the existing process kernel and exact tool universe. V5 process successes use canonical `state=starting|running|exited|failed|terminated` plus a value-equal `status` migration alias; V3/V4 payloads remain exact. A persistent record stays `starting` until backend handle acquisition and required start audit complete, and startup revoke/close joins and terminates any subsequently acquired owned handle. Existing cursor/wait/quota/Job-tree/Policy/approval/audit and ambient-authority boundaries remain unchanged.

## Verification evidence

- Historical Phase 3–8 and release/runtime evidence is archived; `1.0.4` exact-head CI `30373608845` and release-alignment CI `30471674322` passed. The STEP-490–494 benchmark archive keeps incomplete Web efficiency fields unscored.
- STEP-516–526 close persistent-process hardening and explainable configuration/profile provenance. Their focused, managed Node 20/24, build, smoke, policy, and security gates passed without changing authority or tool counts.
- STEP-527–532 reconcile active configuration/network documentation, preserve exact legacy-input provenance/value parity, and index all archive volumes. Detailed per-step counts and the unresolved `NGROK_DOMAIN` choice remain in Part 11/12.
- STEP-533 completes P1 with four `src/tools/runtime/` components, one MCP registration gateway, fixed seven-stage ordering, canonical result rendering, explicit V5 selection metadata, and positive/negative descriptions for 12 overlapping tools. Final managed ordinary run `2026-08-29T16-07-06-878Z-p1-final-ordinary-r4-f81d01ac` passed Node 20/24 fast 1211/1212 (1 platform skip), safe 299/300 (1 platform skip), and isolated 68/68 on each; smoke run `2026-08-29T21-20-27-581Z-p1-final-smoke-1b71a342`, both builds, policy, package contents, and the final 22/22 P1/documentation closure set passed.
- STEP-534 synchronizes the P1 selection contract into both READMEs, `design.md`, and the unreleased changelog; reconciles this index and the Codex automatic-memory correction channel; and revalidates 169 Markdown files, 44 archive volumes, 28 rule paths, the four required package scripts, policy, diff, credentials, and the 22/22 P1/documentation contract set.
- STEP-535 adds `src/context/{workspaceContext,projectDetector,commandDetector,contextBudget}.ts`, projects its bounded snapshot from both standard open tools, changes `open_workspace` tree discovery to opt-in, and preserves exact tool counts/authority plus legacy rollback. Final managed ordinary run `2026-08-30T07-44-04-387Z-p2-final-ordinary-r4-9dc8a074` passed Node 20/24 fast 1218/1219 (1 platform skip), safe 299/300 (1 platform skip), and isolated 68/68 on each; smoke run `2026-08-30T12-11-24-080Z-p2-final-smoke-e07d16ce`, both builds, policy, package contents, and documentation/rule checks passed.
- STEP-536 removes stale routine `server_config`/tree preambles from the shipped ChatGPT and public golden prompts, aligns Chinese/design guidance with P2's body-free model projection, compacts this index from 16,671 to below 13,000 bytes, and revalidates P2/documentation contracts plus the full project knowledge/rule inventory. The authorized Codex-memory correction request is `D:\Codex\home\memories\extensions\ad_hoc\notes\20260830-153655-codexgpt-p2-closure.md`.
- STEP-537 adds the strict navigation service/schema, additive semantic route, and V5 alias while preserving exact direct-tool counts and old wire/authority contracts. Managed focused passed 67/67 on Node 20/24; final ordinary run `2026-08-30T20-30-06-358Z-p3-final-ordinary-r2-35339e54` passed fast 1235/1236 (1 platform skip), safe 299/300 (1 platform skip), and isolated 68/68 on each; smoke run `2026-08-30T20-48-47-747Z-p3-final-smoke-683b726e`, both builds, package, Policy, diff, credential, documentation, and scope gates passed.
- STEP-538/539 close P4 with strict workflow schemas/service, V5 mutation next-state, composite-only confirmed verification, and an exact five-item whole-diff review checklist while preserving all direct counts, older wire contracts, and execution gates. Final frozen-tree ordinary run `2026-08-31T12-19-26-448Z-p4-final-ordinary-r3-1146656d` passed Node 20/24 fast 1243/1244 (1 platform skip), safe 299/300 (1 platform skip), and isolated 68/68 on each; final smoke run `2026-08-31T12-42-59-759Z-p4-final-smoke-r2-b896f209` passed every smoke category on both majors with complete output, empty stderr, and cleaned temporary state.
- STEP-540 reconciles P4 knowledge and rules without source changes: active guidance now distinguishes standard tool-mode visibility from the required `full_access` execution profile, `SECURITY.md` states the trusted-code boundary, `AGENTS.md` closes roadmap P1–P4 locally, one stale relative-time phrase was removed, and the authorized Codex-memory correction request is `D:\Codex\home\memories\extensions\ad_hoc\notes\20260831-153000-codexgpt-p4-closure.md`. Build, 45/45 focused knowledge/contracts, Policy, diff, UTF-8/link, credential, archive, staging, and size gates passed.
- STEP-541 closes P5 with additive V5 process schemas, truthful `starting -> running` publication, startup join/termination, and model/user guidance while preserving V3/V4 and `28/31/39/51/52`. Managed focused passed 104/104 on each Node major; final ordinary run `2026-08-31T18-14-07-141Z-p5-final-ordinary-r1-ea022307` passed fast 1249/1250 (1 platform skip), safe 299/300 (1 platform skip), and isolated 68/68 on both; final smoke run `2026-08-31T18-35-08-867Z-p5-final-smoke-r2-2a73d195` passed all eight categories on both with empty stderr. Both builds, 117/117 broader focused, package, Policy, diff, credentials, and staging gates passed.
- User-authorized GitHub handoff commit `731adb7b808b8bc7810a50f875f297674983eca3` was pushed by ordinary fast-forward to `origin/codex/tool-execution-pipeline-slice1`; post-push refs match and the working tree is clean. No force push, merge, App refresh, deployment, release publication, or Web-efficiency claim was performed.

## Known limitations

- Phase 8's documented U6 substitution proves current rollback, not deleted-App identity continuity. DPAPI remains Windows CurrentUser-only; recovery requires security reset and has no plaintext/non-Windows fallback.
- Phase 2A has no user-facing approval issuance surface. OAuth configured-root capabilities can cross transport rotation only inside one deployment runtime and do not survive restart; pending browser authorization stays process-ephemeral.
- External processes remain outside the workspace lock, and profile replacement has no OS-wide writer lock or absolute power-loss durability despite identity/backup/recovery preconditions.
- `config explain --json` covers effective runtime keys and public launcher-input provenance only; internal unmigrated fields do not claim invented origins.
- C5 covers selected legacy HTTP token, root, and hostname inputs. `NGROK_DOMAIN` provenance is preserved as mode-ambiguous but its warning/retention policy is undecided; generic `HOST`/`PORT` remain direct-runtime-only and Tailscale remains setup-only.
- Environment narrowing is defense in depth, not credential isolation; Safe Bash timeout may leave Windows descendants. `full_access`, confirmed roots, ConPTY, managed worktrees, and external Providers remain ambient-authority mechanisms, not sandboxes.
- Atomic `apply_patch` supports bounded UTF-8 create/replace/delete only; Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- Cached-App migration requires one explicit **Scan Tools** refresh or recreation; transparent refresh is not claimed. U6 proved this by creating a V4 51-tool App before switching the same endpoint to V5.
- Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. `npm audit` has zero high/critical findings and two moderate transitive findings in the current MCP SDK compatibility line.
- P4 verification/review state is server-local and does not survive restart; durable change sets remain the filesystem rollback authority. Failed checks make the workflow terminal but not ready, and invalid explicit review linkage leaves the diff result valid while reporting that the workflow was not updated.
- The owner did not authorize a new P0/Web rerun for P1–P5. Historical matched task success did not regress, but the published branch has no complete fresh UI/tool trace; `wrong_tool_calls`, `redundant_tool_calls`, and `total_tool_calls` therefore remain unscored and no efficiency reduction is claimed.

## Open items

1. Decide whether `NGROK_DOMAIN` receives a value-free migration warning to `CODEXGPT_PUBLIC_HOSTNAME` or remains indefinitely supported; preserve its cross-mode value/fingerprint contract either way. Any fresh App/Web efficiency run requires separate authorization.
2. Delete the remaining Cloudflare DNS record `codexpro-oauth.drliang.uk` only under its separate approval; reviewed background lifecycle, native isolation, Serena/LSP, Tasks 4B1–4B6, credential migration, and toolchain-root migration also remain gated.
3. The earlier 20-minute `1.0.4` normal-use acceptance remains separate from benchmark scoring; if disconnects recur, inspect authenticated local diagnostics before changing any ceiling.

## Recent summaries

- **STEP-540 — P4 knowledge and rule closure:** corrected the tool-mode/execution-profile distinction, added the missing security boundary, synchronized project and Codex memory, and re-audited every docs Markdown plus rules, links, credentials, archives, and sizes without changing product behavior.
- **STEP-541 — P5 long-task/process experience:** V5 exposes one truthful process lifecycle, startup closure can no longer miss a late handle, incremental cursor/wait and owned-tree cleanup stay on the retained kernel, and the complete dual-Node ordinary/smoke/package/policy gates passed.
- **P1–P5 GitHub handoff:** after the dual-Node P5 gates passed, the reviewed closure was committed as `731adb7` and pushed to the matching GitHub branch without force or merge.

## Archives

- [Complete archive volume index](docs/memory/archive/README.md)
- [Active interphase maintenance Part 13 — STEP-538 onward](docs/memory/archive/interphase-maintenance-part-13.md)

## Memory maintenance protocol

- Keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. At or above 48 KB (80% of the 60 KB direct-read limit), close the volume and start the next numbered continuation.
- `AGENTS.md` is authoritative for the complete protocol.
