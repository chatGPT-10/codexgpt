# Changelog

## Unreleased

- No changes yet.

## 1.0.0 - 2026-07-27

- Released the first stable CodexGPT version after completing Phase 8 OAuth Core through Tasks 8A1–8A9, live Gate G8-U Journeys U2–U7, local Gate G8-X, and exact-head Ubuntu/Windows Node 20/24 CI: Windows DPAPI CurrentUser protection, versioned atomic auth state, physically separated public/local listeners, constrained public-client DCR with PKCE S256 and resource binding, strict ES256 access tokens, authenticated rotating opaque refresh families, durable replay/revoke/expiry handling, request-local OAuth policy identity, exact tool scopes and step-up, supported setup/local administration/recovery, two-App Legacy/OAuth rollback, fail-early dedicated-Tunnel ownership enforcement, and live restart/revoke/relink/recovery/rollback/Tunnel-boundary acceptance. U6 retains the explicit deleted-Legacy-App evidence substitution.
- Added Phase 7 Core behind explicit `standard` Contract V5: one zero-setup JavaScript/TypeScript `semantic` tool for definitions, references, one-file diagnostics, and complete rename previews; a bounded owned worker using TypeScript 5.9.3; honest lexical fallback; single-use `semantic_preview_id` application through the existing approval/atomic transaction/audit/change-set/undo path; local status/disable commands; and exact V1/V2/V3/V4 compatibility. Serena and direct LSP remain unimplemented, unbundled post-Core extensions.
- Fixed two cached-App acceptance defects: overlong installed Skill summaries are now omitted instead of collapsing `codexgpt_inventory`, and ambiguous rename requests in partial repositories return bounded candidates before the complete-coverage write gate, without creating a preview or modifying files.
- Fixed source-checkout CLI help so it consistently routes users through the supported `scripts/codexgpt-entry.mjs` public entry, with a runtime regression that also binds the published `codexgpt` bin mapping.
- Added Phase 6 project guidance: normal `standard` mode now returns bounded root and target `AGENTS.md` context, discovers target-scoped workspace Skills with lazy body/resource loading, requires context refresh before mutation and subtree switches, and keeps scripts, dependencies, user/plugin Skills, and all permission changes explicit. Omitted guidance defaults to ready `standard`; explicit `legacy` remains the rollback, while omitted minimal mode preserves the exact legacy projection because `codex_context` is unavailable there.
- Fixed Phase 6 exact-head cross-platform failures by normalizing Windows-style guidance targets on every host, rereading the same bounded handle to detect same-size in-place edits, and promptly retrying failed detached-run lease renewals without extending lease authority.
- Aligned detached-run flood and finalization regression deadlines with the production worker-lease boundary plus bounded publication grace, so CI load cannot fail a still-observable runner because of shorter test-only timeouts.
- Kept detached workers alive until authoritative result publication by retaining the lease-renewal timer as a referenced lifecycle handle and clearing it only after terminal evidence is written.
- Stabilized the final Windows runner completion tests by polling the production state machine without repeatedly spawning the status CLI and by waiting through the production worker-lease boundary before declaring observational result publication late.
- Retried asynchronous atomic JSON replacement for bounded transient Windows sharing conflicts, preventing authoritative detached-run result publication from silently failing and later appearing stale under CI pressure.
- Kept the initial detached-run worker lease observational so a permanently blocked first lease write cannot abort task execution, cleanup, retention, or authoritative result publication; added deterministic coverage that preserves the task's real exit code.
- Kept detached-run worker leases renewable under Node 24 CI filesystem pressure by publishing the small observational lease through a synchronous atomic replacement with bounded retries for transient Windows sharing violations, while preserving asynchronous result publication, temporary-state cleanup, retention, and exact mutation inventory review.
- Fixed Linux global CLI launches through npm-created symlinks, disabled in-place Cloudflared self-updates for managed tunnel processes, and stopped public startup logs from automatically echoing credential-bearing Server URLs when clipboard integration is unavailable.
- **Breaking:** Renamed every canonical package, CLI, environment-variable, local-state, MCP-tool, source-path, test, and active-documentation surface to CodexGPT. Existing installations must adopt the new package, commands, variables, and state paths.

- Added cleanup-backed focused-test and local-task launchers, exact owned `TEMP`/`TMP`/`TMPDIR` isolation with stale-owner recovery, and bounded detached-run evidence retention. Cleanup removes only marker/identity-verified dead-owner roots and verified terminal evidence, and fails closed on malformed or incomplete state.
- Implemented Phase 3D locally: explicit contract V2 now projects the exact 31-tool universe, registering `move_paths` and `undo_change_set` in standard/full mode and `query_audit_events` in full mode, with direct/supertool parity, strict schemas, policy resources, authenticated Manifest/Change Set V2 state, participant-aware V1/V2 recovery, same-volume no-clobber move execution, conflict-checked move undo, and V1 remaining the exact 28-tool default.
- Hardened Phase 3D after adversarial review with syscall-boundary write-ahead recovery, stable parent/reparse-point revalidation, recoverable original-change-set reconciliation, service-level mutation quiesce/drain, deterministic child-process crash oracles, no-clobber external-writer handling, exact 64-item cycles, bounded Windows sharing retries, explicit EXDEV backend failures, and canonical-root multi-process locks.
- Fixed Windows Node 20 move execution by transferring the verified file-object handle from the original source name to its authenticated stage hard link immediately after source-name removal, preserving continuous identity proof without treating Node 20 `EPERM` results as missing paths.
- Completed Phase 3C production mutation migration: all supported workspace writers can run through the guarded atomic runtime under contract V1, with per-server production composition, required terminal audit, authenticated change-set publication, encrypted before-state retention, keyed owner binding, complete undo preflight/reverse transactions, exact V1 projections, and no fallback to direct writes. `legacy` remains the compatibility default; Phase 3D extends the shared runtime with durable participant reconciliation and public V2 activation.
- Restored GitHub CLI configuration and Windows OS-keyring discovery for the default narrowed Bash environment by preserving or deriving only `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, and `GH_CONFIG_DIR`; arbitrary parent variables, `GH_TOKEN`, and unrelated API credentials remain excluded unless `CODEXGPT_INHERIT_ENV=1` is explicitly enabled.
- Added the Phase 3A internal atomic-transaction kernel with strict external state manifests, installation-key separation, conservative cross-process workspace locks, exact-byte preconditions, same-volume hard-link staging and backups, participant-gated commit, synchronous rollback, persisted crash recovery before atomic-mode workspace reuse, and unconditional blocking of `.codexgpt-txn-*` artifacts. `legacy` remains the compatibility default; Phase 3C now supplies the production writer migration described above.
- Added the Phase 3B persistent local audit backend with strict authorization/execution/recovery/administrative events, canonical authenticated JSONL segments, conservative cross-process writer locking, recoverable final-tail quarantine, fail-closed non-tail integrity handling, UTC-date/size rotation, tombstone-before-delete retention, bounded authenticated queries, transaction-participant ordering, and an eighteenth `codexgpt_self_test` audit-readiness check. Phase 3C injects the production audit runtime when atomic or non-legacy Policy configuration requires it; Phase 3D exposes the bounded query adapter only in contract V2 full mode.
- Added the compiled local Policy Kernel with explicit `legacy`, `shadow`, and fail-closed `enforce` modes, strict Permission Profile V1 loading, transport-aware request identity, bounded session grants, deterministic resource descriptors, redacted audit facts, and capability-gated Shell/Process/Network decisions without claiming OAuth owner identity or full OS sandboxing.
- Replaced path-derived, process-shared workspace IDs with random session-scoped handles; added same-session reuse, cross-session isolation, sliding idle expiry, close and policy/transport revocation, strict core lookup with one-cycle session-local compatibility fallback, and the exact `close_workspace` lifecycle tool as the 28th canonical child action.
- Added the exact schema-v1 `codexgpt` supertool contract as a closed wrapper over the canonical direct child tools: nested sorted `list_actions`, eight fixed aliases, four stable redacted wrapper failures, exact child-input/output validation, direct invocation of the live registered target handler, preserved child `content`/`isError`/envelopes, effective mode/write/Bash/analysis/session gates from the live registration map, dedicated Tool Card output, fail-closed protected-Smoke and Stress compatibility loaders, and a safe no-op for the intentionally supertool-free connection-test surface.
- Added an exact schema-v1 `inspect_workspace` result contract with sixteen strict nested analysis fields, validated full-workspace provider identity/path/count/warning invariants, five stable redacted workspace/path/provider/internal failures, preserved scope/cap/cache semantics, nested Tool Card/supertool compatibility, and exact fail-closed protected Smoke migration without analysis-engine, workspace-lifecycle, or Phase 2 changes.
- Added an exact schema-v1 `list_workspaces` result contract with ordered strict `{ id, root, openedAt }` inventory records, derived count and uniqueness invariants, two stable redacted provider/internal failures, nested Tool Card/supertool compatibility, and one fail-closed in-memory protected HTTP Smoke migration without workspace-lifecycle or Phase 2 changes.
- Added an exact schema-v1 `workspace_snapshot` result contract with thirteen strict nested fields, validated workspace-summary and AI-context provider boundaries, four stable redacted failures, approved-only AI handoff filenames, nested Tool Card/supertool compatibility, fail-closed protected Smoke migration, and Windows `PATHEXT` restoration in the Smoke compatibility harness.
- Added an exact schema-v1 `open_workspace` result envelope with twelve strict nested workspace fields, seven stable redacted alias/path/root/open/internal failures, deterministic trimmed `root`/`path` alias handling, stage-separated root and summary validation, global-Skill request-scope enforcement, nested Tool Card/supertool compatibility, preserved deterministic workspace reuse and non-Git success, plus fail-closed in-memory main-Smoke and HTTP-Smoke compatibility loaders with bounded stack labels that keep protected test fixtures unchanged on disk.
- Added an exact schema-v1 `open_current_workspace` result envelope with twelve strict nested workspace fields, five stable redacted default-root/internal failures, validated workspace/root/AGENTS/skill/count/inclusion provider boundaries, nested Tool Card/supertool compatibility, and preserved non-Git workspace success plus recent-commit human summaries.

- Added an exact schema-v1 `bash` result envelope with eleven strict nested process fields, eleven stable redacted workspace/session/policy/backend/path/start failures, validated provider command/cwd/session identity, dedicated nested Tool Card/supertool output, preserved compact/full transcripts, and preserved non-zero exits as successful command-level verification results.
- Added an exact schema-v1 `apply_patch` result envelope with nine strict nested fields, twelve stable redacted workspace/path/input/policy/Git/patch failures, validated normalized provider path sets, cache-safe invalidation, dedicated nested Tool Card/supertool output, and preserved guarded non-atomic `git apply` behavior.
- Added an exact schema-v1 `edit` result envelope with strict nested replacement metadata, fourteen stable redacted workspace/path/file/replacement/policy/edit failures, validated provider and returned-path boundaries, dedicated nested Tool Card/supertool output, and preserved exact-match, diff, Unicode, and cache-invalidation behavior.
- Added an exact schema-v1 `write` result envelope with strict nested file metadata, stable redacted workspace/path/file/policy/write failures, safe provider validation, dedicated nested Tool Card/supertool output, and preserved create/overwrite/diff/cache-invalidation behavior.
- Added an exact schema-v1 `search` result envelope with strict lexical matches, stable redacted workspace/path/backend failures, exact optional structured analysis, fixed safe degradation warnings, nested Tool Card/supertool output, and preserved ripgrep/Node fallback behavior.
- Added an exact schema-v1 `show_changes` result envelope with strict Git/workspace/path failures, exact optional impact-analysis data, fixed safe analysis degradation, nested Tool Card/supertool output, and preserved staged/path/checkpoint/untracked-file behavior.
- Added an exact schema-v1 `git_diff` result envelope with strict success invariants, stable redacted Git/path failures, a dedicated nested-data tool card, and preserved staged/path/stats-only behavior; corrected native-Windows Stress fixtures so the full suite runs on Windows.
- Added bounded multi-language repository analysis, grouped search results, change-impact and test recommendations, `codexgpt inspect` / `codexgpt review` CLI commands, and compact opt-in tool cards.
- Added `codexgpt connection-test`, a read-only connector profile with no bash or tool cards, plus request-arrival logging and current ChatGPT Plugins troubleshooting.
- Added Tailscale Funnel as a saved tunnel/profile option, including `codexgpt tailscale --hostname ...`, launcher support, admin profile support, and settings smoke coverage.
- Added proxy-aware Cloudflare quick tunnels: when proxy env vars are set, CodexGPT requests quick-tunnel credentials through `curl --proxy`, runs `cloudflared` with a temporary credentials file, ignores Cloudflare API URLs, and cleans the credentials file after shutdown.
- Hardened Codex handoff execution on Windows by resolving spawnable Codex shims, asking Codex to read the plan file instead of argv-passing the whole plan, and recording git status in handoff artifacts.
- Added concise connector-creation troubleshooting to the English and Chinese FAQs.
- Bounded browser-facing tool-card structured payloads and binary-file text checks so CodexGPT emits less data without reducing normal tool-result or binary-detection quality.
- Allowed targeted line-range reads and search matches in text files slightly above `maxReadBytes`, while keeping full-file reads and very large scans bounded.
- Replaced the overlong README with a shorter install, tunnel, safety, RAM-boundary, and development guide.
- Added a guarded `apply_patch` MCP tool for unified-diff edits inside workspace write mode, with blocked-path and secret-content checks before patches are applied.
- Added last-shown review checkpoints to `show_changes`, so repeated unchanged reviews collapse while new workspace changes still produce a fresh diff.
- Fixed checkpoint-hit `show_changes` responses so repeated unchanged reviews report zero new diff stats instead of carrying stale addition/deletion counts.
- Scoped `apply_patch` result diffs to the applied patch, so unrelated dirty tracked files are not folded into the patch card.
- Hardened safe bash filtering, path canonicalization, binary-file checks, ripgrep truncation reporting, and supertool argument validation around edge-case bypasses found by stress testing.
- Redacted child tunnel process output before logging or surfacing startup failures so Cloudflare `TUNNEL_TOKEN` values cannot leak from failed named-tunnel launches.
- Kept `codex_sessions` metadata mode from returning transcript-tail summaries, skipped unreadable stale history files, and accepted source paths under symlink-resolved Codex history roots.
- Hardened search, context export, path blocking, skill loading, and change summaries around hidden files, colon-containing paths, `.env` descendants, large-file limits, user skills, and diff stats.
- Blocked raw newline and carriage-return command separators in safe bash mode before whitespace normalization, including through the stable `codexgpt` supertool wrapper.
- Corrected docs to describe Developer Mode account eligibility as broader than Plus/Pro while keeping the model/tool-surface limitation explicit.

## 0.28.6

- Added the stable `codexgpt` supertool wrapper for advanced connector-cache/custom workflows, while preserving tool/write/bash mode gates.
- Hardened direct HTTP auth defaults, local `--no-auth`, token redaction, search parsing, selected-path Pro exports, and handoff polling state.
- Added `npm run stress` to cover full-mode MCP behavior, supertool dispatch, skill caps, card payloads, search edge cases, Pro export, and handoff polling.
- Fixed CLI env precedence so `CODEXGPT_HOST` / `CODEXGPT_PORT` override generic `HOST` / `PORT`, preventing ambient process env from widening a launcher-validated bind.
- Normalized stable public hostnames in CLI settings/setup/start flows and accepted common `--flag=value` syntax.

- Made ChatGPT tool-card descriptor metadata opt-in with `CODEXGPT_TOOL_CARDS=1`, so default `tools/list` responses stay plain MCP and avoid fragile widget metadata during tool discovery.
- Added `codexgpt loop-handoff` for bounded local execute/review loops over `.ai-bridge/current-plan.md`, with a required local `--review-command`, `--max-iters`, dry-run preview, optional test command capture, and stop conditions for no diff, repeated diff, missing follow-up plans, reviewer errors, and human cancellation.
- Hardened `loop-handoff` external-command boundaries: commands are preflighted before execution, reviewer verdicts require explicit `CODEXGPT_REVIEW=...` assignment lines by default, and reviewer `PASS` no longer masks failed executor/test/reviewer commands unless the user opts into the supported override behavior.
- Fixed loop change detection so `--stop-if-no-files-changed` and `--stop-if-same-diff` compare each iteration against a pre-execution baseline and count unstaged diffs, staged diffs, and untracked file fingerprints outside `.ai-bridge`.
- Switched loop guard decisions to an uncapped git-state fingerprint instead of hashing or vetoing on the trimmed reviewer diff artifact.
- Kept handoff plan hashing on the handoff read-size budget instead of `--max-output-bytes`, so valid plans larger than captured output excerpts do not abort the loop after execution.
- Made loop change fingerprints content/status based instead of timestamp based, so repeated identical tracked-file writes stop as no new changes instead of looking different because of volatile mtimes.
- Normalized Git porcelain paths back to workspace-relative paths before loop clean-start filtering and change fingerprinting, with path-scoped status and untracked-file scans so nested workspaces inside larger Git repos are handled correctly.
- Bounded untracked file fingerprinting so symlinks are reported via `readlink` and regular files hash only a capped prefix instead of following arbitrary paths or reading entire generated artifacts.
- Tightened `--require-clean-git-start` so staged renames are treated as handoff-only only when both rename endpoints are inside `.ai-bridge`.
- Stopped reviewer `FAIL` and implicit review verdicts from continuing when the reviewer deletes, empties, or restores `.ai-bridge/current-plan.md` to the scaffold instead of writing a usable follow-up plan.
- Kept the autonomous handoff loop CLI-only and local-terminal-owned; it does not expose agent execution as a remote MCP tool, automate ChatGPT Web, approve product prompts, proxy models, or bypass limits.
- Extended handoff smoke coverage with a fake reviewer that fails once by writing a follow-up plan, then passes on the second local executor iteration, plus failed executor, failed reviewer, bare `PASS`, staged-only, untracked-file, bounded-untracked, dirty-baseline, repeated-identical-write, nested-workspace, nested-untracked-workspace, outside-untracked-nested-workspace, large-dirty-baseline, unavailable-diff-artifact, large-plan-over-output-cap, staged-rename, deleted-follow-up-plan, and implicit-deleted-plan cases.

## 0.28.5

- Added a compatibility alias for stale ChatGPT descriptors that still request `ui://widget/codexgpt-tool-card-v8.html`, while keeping `ui://widget/codexgpt-tool-card-v9.html` as the current advertised widget.
- Stopped advertising the `bash` MCP tool when `CODEXGPT_BASH_MODE=off` / `codexgpt start --no-bash` is active, so ChatGPT has less opportunity to attempt a shell tool call in no-bash sessions.
- Stopped advertising direct `write` and `edit` tools unless `CODEXGPT_WRITE_MODE=workspace`; handoff/off modes keep handoff planning tools available for bounded `.ai-bridge` plan files without exposing generic source edit actions.
- Added smoke coverage that compares `codexgpt_self_test` expected tools against the actually registered MCP tool set, so disabled tools cannot silently remain visible in ChatGPT's tool list.
- Tightened `CODEXGPT_CONTEXT_DIR` to workspace-relative hidden directories such as `.ai-bridge`, rejecting source/build/dependency/credential directories and absolute paths.
- Made saved profile handling stricter: non-agent modes cannot inherit `write=workspace`, relative tunnel config/token paths resolve from the workspace, and `settings set` refuses to persist raw Cloudflare tunnel tokens.
- Completed the local admin profile form for named Cloudflare/ngrok settings, including tunnel name, config paths, token-file path, and cloudflared auto-install preference.
- Fixed path-scoped `show_changes` so unrelated workspace status is not reported for a clean requested path.
- Kept duplicate `load_skill` matches ambiguous until the caller supplies the exact displayed skill path.
- Added `codexgpt_self_test`, a local-only diagnostic that checks modes, expected tools, safe bash policy, selected-only Pro context, and an optional `.ai-bridge/codexgpt-self-test.md` write/edit probe without touching source files.
- Upgraded ChatGPT cards to `ui://widget/codexgpt-tool-card-v9.html` and attached compact card metadata to every CodexGPT tool, with large git/tree/context/bash payloads folded or bounded instead of printed as a giant chat block.
- Added `include_important_files` and `include_changed_files` controls to `export_pro_context` plus CLI smoke coverage for exact selected-only bundles.
- Added a dedicated compact `server_config` renderer and accepted model-friendly aliases `workspace_snapshot.max_files` plus `git_diff.include_diff=false` to reduce avoidable retry/error loops in ChatGPT.
- Reconfirmed the compliance boundary in runtime diagnostics and docs: CodexGPT is a local workspace MCP bridge, not a model provider, model proxy, quota bypass, resale layer, or remote executor.
- Added `codexgpt start --no-bash` and documented that CodexGPT does not bind MCP bash to a Codex app conversation id.
- Added an optional bash session guard with `--bash-session <id> --require-bash-session`; guarded `bash` calls must include the matching `session_id` before any shell command runs.
- Made bash chat transcripts compact by default, with `--bash-transcript full` for the old raw stdout/stderr chat output.
- Added opt-in local Codex session discovery with `--codex-sessions metadata|read`, including session ids, titles, cwd paths, source files, resume commands, and bounded transcript reads only in explicit `read` mode.
- Added a token-protected local profile editor at `/admin/profile` and the setup page so users can save tunnel, hostname, port, mode, bash, Codex session, write/tool mode, widget origin, and tunnel config defaults for the next `codexgpt start` without exposing raw tokens in the browser.

## 0.28.4

- Made workspace cards compact by default, moving git details, discovered skills, and optional file tree output behind collapsible disclosure rows.
- Changed workspace open skill discovery to include workspace, user, and plugin skills by default while still exposing a focused `standard` tool surface.
- Added read-only `load_skill` so ChatGPT can load bounded `SKILL.md` instructions for discovered workspace, user, or plugin skills without exposing arbitrary path reads.
- Kept AGENTS detection in the workspace open result but stopped embedding the full AGENTS file in the open response; agents can read it explicitly when needed.
- Fixed setup propagation for `--widget-domain` and corrected workspace-card git status splitting for multi-file diffs.

## 0.28.3

- Added `CODEXGPT_WIDGET_DOMAIN` and the Apps SDK resource metadata keys `_meta.ui.domain` plus `_meta["openai/widgetDomain"]` so ChatGPT no longer reports that the widget domain is missing.
- Surfaced the widget domain in server config, HTTP status output, docs, env examples, and smoke tests.

## 0.28.2

- Moved ChatGPT visual cards from `bash` to the workspace open tools so the first call gives a compact project orientation instead of noisy terminal cards.
- Kept `bash` data-only for focused verification commands and strengthened server instructions to prefer `tree`, `search`, `read`, and `show_changes` for inspection/review.
- Upgraded the widget to v8 with a workspace summary renderer and a neutral waiting state instead of a stale-looking running card.

## 0.28.1

- Added `CODEXGPT_TOOL_MODE=minimal|standard|full`, with `standard` as the default focused ChatGPT tool surface and `full` preserving the previous advanced toolbox.
- Added `show_changes` as a review-oriented visual card for git status, diff stats, and optional diff while keeping raw `git_diff` data-only.
- Upgraded the ChatGPT widget to v7 with compact bash execution summaries, review cards, and cleaner handoff cards.
- Allowed `open_workspace` to accept `path` as an alias for `root` to reduce client argument mismatch failures.
- Allowed safe package scripts with colon suffixes such as `npm run build:clients` for build/test verification.
- Surfaced tool mode in server config, local status, workspace/context exports, launcher output, setup profiles, and docs.

## 0.28.0

- Added `codexgpt execute-handoff` as an opt-in local executor for `.ai-bridge/current-plan.md`.
- Added `codexgpt watch-handoff` as an opt-in local watcher that executes new handoff plans by content hash without exposing execution as a remote MCP tool.
- Added built-in local adapters for `opencode`, `pi`, and `codex`, plus a restricted `--command` template path for custom agents.
- Added `--dry-run`, `--yes`, timeout handling, stdout/stderr capture, `agent-status.md`, `implementation-diff.patch`, and `execution-log.jsonl` output.
- Kept `handoff_to_agent` planning-only; local execution is not exposed as a remote MCP tool.
- Fixed Windows release-gate coverage for symlink-escape smoke tests, Bash lookup, and custom executor paths containing spaces.
- Added smoke coverage for dry-run previews, custom command validation, execution status, diff collection, duplicate watch-plan skipping, and structured execution logging.
- Clarified that CodexGPT is an official Developer Mode/MCP workflow, not a rate-limit bypass or model access provider.

## 0.27.2

- Added `handoff_to_agent` for file-based handoffs to Codex, OpenCode, Pi, or custom local implementation agents without executing local commands.
- Extended `.ai-bridge` with generic `agent-status.md`, `implementation-diff.patch`, and `execution-log.jsonl` files.
- Updated `read_handoff`, `codex_context`, Pro apply logging, docs, and smoke coverage for generic agent handoffs.
- Fixed secret detection so benign env-var references like `process.env.TOKEN` are not blocked or redacted as literal secrets.
- Shell-quoted generated agent command hints so model names cannot inject extra shell tokens.
- Bounded append-mode handoff reads with the configured text-file size guard.

## 0.27.1

- Fail closed when HTTP MCP auth is required but `CODEXGPT_HTTP_TOKEN` is missing, including public tunnel mode and non-loopback binds.
- Block additional safe-bash bypass paths for absolute paths, parent paths, environment expansion, sensitive paths, and `find` write/action flags.
- Added smoke coverage for the missing-token HTTP startup failure and safe-bash blocked command cases.

## 0.27.0

- Kept terminal startup focused on only the connector URL and essential controls; usage prompts now belong in README/docs only.
- Made `git_diff` data-only instead of a widget-rendered tool. This reduces noisy ChatGPT cards and avoids template fetch failures for empty/no-op diffs.
- Kept visual cards scoped to high-signal outputs: source writes, exact edits, Pro context exports, and Codex handoffs.
- Updated smoke coverage so routine inspection tools stay compact.

## 0.26.0

- Removed prompt management from the terminal control panel.
- Removed the `s` hotkey and all launcher-side suggested prompt generation.
- Kept usage prompts and workflow examples in documentation instead of runtime UI.

## 0.25.0

- Simplified the ready screen so startup shows one compact status block instead of a long boxed next-step panel.
- Reduced visible controls to the common actions: open ChatGPT, copy URL, open status, copy prompt, help, and quit.
- Changed the `s` control to copy the suggested ChatGPT prompt instead of printing the full prompt repeatedly.
- Cleaned up saved setup list formatting so reused ngrok/Cloudflare profiles are easier to scan in narrow terminals.

## 0.24.0

- Added `codexgpt settings list` to show all saved workspace tunnel profiles.
- Added `codexgpt settings use` and `--from-root` to copy a saved setup from one workspace to another.
- Improved first-run `codexgpt start` behavior: if the current workspace has no settings but other saved setups exist, CodexGPT shows them as a numbered list so users can reuse an existing ngrok or Cloudflare setup instead of retyping hostnames.
- Expanded settings smoke coverage for profile listing and reuse.

## 0.23.0

- Added a compact first-run tunnel picker to `codexgpt start` when no workspace settings exist, so users can choose Cloudflare quick, ngrok, Cloudflare stable, or local mode without running the full setup wizard.
- Added `codexgpt settings` with `show`, `set`, and `delete --yes` actions for persistent per-workspace tunnel preferences.
- Persisted the selected tunnel provider, hostname, port, mode, and CodexGPT token until the user changes or deletes the workspace settings.
- Added `scripts/settings-smoke.mjs` and included it in `npm run smoke`.

## 0.22.0

- Added the v5 Apps SDK widget resource at `ui://widget/codexgpt-tool-card-v5.html` with cleaner pending states and more polished diff/search/code cards.
- Added a token-protected local admin dashboard at `/` and `/setup` for workspace, mode, allowed-root, setup, profile, and ChatGPT connection visibility.
- Added the terminal `o` control to open the local admin dashboard while CodexGPT is running.
- Updated HTTP smoke coverage to verify the onboarding page and v5 widget resource.

## 0.21.0

- Added `codexgpt doctor` as a read-only setup diagnostic for Node, build artifacts, workspace profiles, port availability, tunnel prerequisites, clipboard support, and browser-open support.
- Added `scripts/doctor-smoke.mjs` and included it in `npm run smoke`.
- Added `PUBLIC_LAUNCH_CHECKLIST.md` with release gates, ChatGPT Developer Mode golden prompts, security checks, onboarding expectations, and current non-goals.
- Added `npm run doctor` and included the public launch checklist in the npm package surface.

## 0.20.0

- Made `codexgpt setup` prompts clearer with a dim "Enter to proceed with default" hint before each defaulted input.
- Simplified the ready screen: the Server URL is described as already copied, and Enter is clearly labeled as opening ChatGPT connector settings.
- Added saved-profile hints so ngrok/Cloudflare stable setups tell users that future launches from the same workspace only need `codexgpt start`.
- Added a local port preflight with clear guidance for running two repositories at the same time.
- Documented the multi-repo rule: each concurrent repo needs its own local port, and stable public tunnels need separate hostnames.

## 0.19.0

- Added per-workspace saved profiles under `~/.codexgpt/profiles/`.
- `codexgpt setup` now saves tunnel provider, hostname, port, mode, and a generated reusable CodexGPT auth token by default.
- `codexgpt start` now loads the saved profile for the current workspace unless `--no-profile` is passed.
- Added `--save-config`, `--no-save-config`, and `--no-profile` launcher flags.

## 0.18.0

- Added ngrok as a first-class tunnel mode with `codexgpt ngrok --hostname <domain>` and `--tunnel ngrok`.
- Added ngrok support to the interactive `codexgpt setup` public URL choices.
- Added ngrok executable/config resolution with clear setup errors for missing auth or unavailable domains.
- Documented reserved ngrok domains as a stable ChatGPT connector URL option.

## 0.17.0

- Added `codexgpt setup` / `codexgpt onboard` as an interactive onboarding wizard for workspace, port, mode, and public URL strategy.
- Reworked the launcher startup and ready screens into compact framed panels with status lines instead of long setup text.
- Added `npm run connect:setup` for source checkouts.
- Documented the guided onboarding path next to the one-command `codexgpt start` flow.

## 0.16.0

- Reworked the widget pre-result state so in-progress tool calls show a compact running card instead of raw placeholder JSON.
- Added `codexgpt stable` and `--stable` as shortcuts for Cloudflare named-tunnel mode.
- Added `codexgpt stable-help` and friendlier missing-hostname guidance for fixed ChatGPT app URLs.
- Updated setup docs around stable URLs for users who cannot edit an existing ChatGPT app connector URL.

## 0.15.0

- Changed `codexgpt start` to default to agent mode with workspace writes enabled.
- Added `--mode agent`, `--mode handoff`, `--mode pro`, plus shortcut flags `--agent`, `--handoff`, and `--pro-planning`.
- Reworked the terminal startup panel to copy the Server URL, hide long setup details by default, and expose details through controls.
- Updated the default suggested ChatGPT prompt so ChatGPT edits/writes/verifies directly instead of creating a handoff plan.
- Kept handoff and Pro-context workflows as explicit modes for planning-only use.

## 0.14.0

- Added cross-platform `cloudflared` bootstrap for macOS, Windows, and Linux.
- CodexGPT now reuses `cloudflared` from PATH first, then `~/.codexgpt/bin`, then downloads the official Cloudflare release into `~/.codexgpt/bin` when needed.
- Changed `--install-cloudflared` to force a user-local reinstall instead of using Homebrew.
- Added `codexgpt install-cloudflared` for stable-domain setup without starting the MCP server.
- Kept `--no-install-cloudflared` as the opt-out for locked-down or manually managed machines.
- Updated setup docs with OS-specific notes for clipboard, browser opening, and Cloudflare Tunnel.

## 0.13.0

- Added an interactive CodexGPT terminal control panel after startup.
- Added Enter-to-open ChatGPT connector settings, `c` to copy URL, `p` to print app fields, `s` to print the suggested prompt, and `q` to stop.
- Quieted local MCP and Cloudflare logs by default so startup reads like a product flow.
- Made macOS/Homebrew `cloudflared` installation automatic by default when missing.
- Added `--no-install-cloudflared` to opt out of automatic installation.
- Changed the default user-facing start command to `npx codexgpt@latest start`.

## 0.12.0

- Added clipboard-first `CodexGPT Start` flow for ChatGPT Developer Mode.
- Public HTTPS connector URLs are copied automatically when clipboard support is available.
- Added `--open-chatgpt`, `--copy-url`, and `--no-copy-url` launcher flags.
- Added opt-in `--install-cloudflared` for macOS/Homebrew users.
- Added `npm run connect:chatgpt` for source checkouts.
- Updated README setup path around one command: `npx codexgpt@latest start --open-chatgpt`.

## 0.11.0

- Renamed the package, CLI, app labels, widget metadata, and environment variables to CodexGPT.
- Removed the duplicate CLI binary entry from `package.json`.
- Added `DOMAIN_SETUP.md` with Namecheap, Cloudflare, stable tunnel, and future hosted-relay guidance.
- Changed the generated model fallback bundle title to `CodexGPT Context Bundle`.
- Regenerated build output and package lock metadata for the CodexGPT package name.

## 0.10.0

- Prepared the project for public open-source use.
- Added npm package metadata, keywords, engine requirements, public package files, and `prepack`.
- Added `codexgpt` as a package-name binary so `npx codexgpt@latest ...` works.
- Added `codexgpt pro-bundle` and `codexgpt pro-apply` CLI subcommands.
- Added `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md`.
- Removed local runtime reports from the public package surface.
- Reworked docs to avoid private local paths and product-specific model claims.

## 0.9.0

- Added stable Cloudflare named-tunnel mode with `--tunnel cloudflare-named`.
- Added `npm run connect:stable`.
- Added support for existing tunnel names, Cloudflare dashboard tunnel tokens, token files, and cloudflared config files.
- Added stable-host health checks before printing the ChatGPT connector URL.

## 0.8.2

- Fixed duplicate `AGENTS.md` loading on case-insensitive filesystems.
- Kept `codex_context` data-only so it does not create noisy widget cards.

## 0.8.1

- Added `codex_context` for AGENTS-style instructions, `.ai-bridge` handoff files, git status, and optional git diff.

## 0.8.0

- Made widget rendering quieter by attaching visual cards only to high-signal change tools.
- Added request and tool-call logging without printing prompts, file contents, or tokens.

## 0.7.0

- Reworked the Apps SDK widget into compact developer cards.
- Kept widget CSP strict with no external fetches, fonts, scripts, images, or iframes.

## 0.6.0

- Added CSP metadata for ChatGPT Developer Mode widget rendering.
- Added `codexgpt_inventory` for sanitized skill and MCP server names.

## 0.5.0

- Added Apps SDK widget resources for selected tool outputs.

## 0.4.x

- Added `export_pro_context`.
- Added terminal helpers for creating and applying planning-context bundles.
- Added `open_current_workspace` for safer first calls from ChatGPT.
