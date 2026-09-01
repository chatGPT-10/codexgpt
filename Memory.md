# CodexGPT Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-09-01; branch `codex/tool-execution-pipeline-slice1` is at `9ab6425`, synchronized with its matching remote, while the uncommitted Local Control Plane work is recorded below. Public release remains `codexgpt@1.0.4`.
- Historical Phase 1–8 Core/releases and roadmap P1–P5 are closed locally; exact implementation and verification history is archived.

## Approved execution boundary

P1–P5 local closure was explicitly authorized for this GitHub handoff and is now committed and pushed to `origin/codex/tool-execution-pipeline-slice1`. The separately authorized OAuth security reset and ChatGPT App relink are now complete: the published `codexgpt-Windows-v2` App made a real, read-only `open_current_workspace` then `git_status` call against `D:\Dev\codexgpt`. No Web-efficiency metric, package/release publication, commit, or push is implied. The `NGROK_DOMAIN` warning/retention decision remains open and must preserve STEP-531 value/fingerprint parity; other network, credential, service, sandbox/egress, deferred-phase, and external-state work remains separately gated.

The owner explicitly authorized an incremental browser-admin product: an independent loopback Local Control Plane may manage exact additional workspace roots with path review and typed confirmation, persist safe next-launch permission presets, and start/stop/restart an exact controller-owned Runtime after identity/health checks. OAuth default-root rebinding and `full_access` privilege escalation remain separately bounded.

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
- The Local Control Plane's admin UI remains exact-loopback, bootstrap-session, HttpOnly/SameSite, Origin/CSRF protected. Its first overview shows only sanitized effective configuration; it does not treat display as a policy override or expose a public/Tunnel management route.
- The Local Control Plane may mutate only a narrow next-launch `toolMode` profile selector at this stage. It preserves the complete OAuth profile by construction and labels the saved/current distinction; changing allowed roots, default OAuth root, execution profiles, or lifecycle state is not inferred from that capability.
- `codexgpt control --root <workspace>` starts a separate `127.0.0.1:8791` host with an ephemeral bootstrap session. Status never adopts an external Runtime; its authenticated Start action launches only a child it owns, verifies PID creation time, and waits for local `/healthz` before `owned_running`.
- The lifecycle journal binds a Runtime record to one random controller ID plus exact PID creation time. Different controller instances and PID-reuse/stale observations fail closed as `foreign_or_stale`; no control endpoint can adopt or terminate such a record.
- A controller-owned child begins as `owned_starting`, never falsely `owned_running`; health failure remains starting and a child exit converts its exact journal to `exited`. Stop verifies exact current ownership before tree termination; restart serializes stop-confirmation, fresh spawn, and health promotion.
- Browser workspace settings persist separately from OAuth profiles: only existing local directories may be added after canonical review plus exact typed confirmation; the configured OAuth root is immutable. `read_only|edit|run_safe` map to next-launch tool/write/Safe-Bash selectors while retaining `executionProfile=off`.

## Verification evidence

- Historical Phase 3–8 and release/runtime evidence is archived; `1.0.4` exact-head CI `30373608845` and release-alignment CI `30471674322` passed. The STEP-490–494 benchmark archive keeps incomplete Web efficiency fields unscored.
- STEP-516–526 close persistent-process hardening and explainable configuration/profile provenance. Their focused, managed Node 20/24, build, smoke, policy, and security gates passed without changing authority or tool counts.
- STEP-527–532 reconcile active configuration/network documentation, preserve exact legacy-input provenance/value parity, and index all archive volumes. Detailed per-step counts and the unresolved `NGROK_DOMAIN` choice remain in Part 11/12.
- P1–P5 and the authorized GitHub handoff are closed with managed dual-Node gates; exact run IDs, detailed implementation, and the Web read-only acceptance are retained in the linked archives.
- STEP-543–550 Local Control Plane: build, Policy, diff, and focused local-admin/lifecycle/ownership/child tests pass; the latest ten-test set verifies session+CSRF lifecycle/settings requests, exact process identity, typed workspace admission, safe permission presets, serial action rejection, exit, and health-gated `owned_running`.

## Known limitations

- Phase 8's documented U6 substitution proves current rollback, not deleted-App identity continuity. DPAPI remains Windows CurrentUser-only; recovery requires security reset and has no plaintext/non-Windows fallback.
- Phase 2A has no user-facing approval issuance surface. OAuth configured-root capabilities can cross transport rotation only inside one deployment runtime and do not survive restart; pending browser authorization stays process-ephemeral.
- External processes remain outside the workspace lock, and profile replacement has no OS-wide writer lock or absolute power-loss durability despite identity/backup/recovery preconditions.
- `config explain --json` covers effective runtime keys and public launcher-input provenance only; internal unmigrated fields do not claim invented origins.
- C5 covers selected legacy HTTP token, root, and hostname inputs. `NGROK_DOMAIN` provenance is preserved as mode-ambiguous but its warning/retention policy is undecided; generic `HOST`/`PORT` remain direct-runtime-only and Tailscale remains setup-only.
- Environment narrowing is defense in depth, not credential isolation; Safe Bash timeout may leave Windows descendants. `full_access`, confirmed roots, ConPTY, managed worktrees, and external Providers remain ambient-authority mechanisms, not sandboxes.
- Atomic `apply_patch` supports bounded UTF-8 create/replace/delete only; Native-Windows Stress retains the established POSIX-only multi-colon filename skip.
- Cached-App migration requires one explicit **Scan Tools** refresh or recreation; transparent refresh is not claimed. U6 proved this by creating a V4 51-tool App before switching the same endpoint to V5.
- Large partial dependency graphs remain read-only/quality-labeled and rename fails closed. The STEP-542 root overrides pin the four vulnerable production transitive packages to patched versions; `npm audit --omit=dev` is now zero vulnerabilities.
- P4 verification/review state is server-local and does not survive restart; durable change sets remain the filesystem rollback authority. Failed checks make the workflow terminal but not ready, and invalid explicit review linkage leaves the diff result valid while reporting that the workflow was not updated.
- The Web trace proves connectivity and a representative read-only workspace call, but it is not the benchmark protocol: `wrong_tool_calls`, `redundant_tool_calls`, and `total_tool_calls` remain unscored and no efficiency reduction is claimed.
- The legacy cached `codexgpt-Windows-233` draft remains untouched. The active published replacement is `codexgpt-Windows-v2`; renaming it or deleting the legacy draft would be a separate destructive App-management decision.
- The registry rejects cross-root reuse. The authorized rebind moved `codexgpt.drliang.uk` to `D:\Dev\codexgpt`, revoked old authority, and left Cloudflare unchanged; the replacement App then reauthorized successfully.
- The independent control host can start/stop/restart only its exact owned child after local health/identity checks. A visual browser check still requires a deliberately launched local host and is not claimed by focused HTTP/UI tests.
- The browser can add/remove reviewed additional roots only for the next control-host launch; it cannot silently alter the OAuth default root, `full_access` execution profile, or Policy. ChatGPT opens an added project with `open_workspace` and a fresh capability after restart.

## Open items

1. Decide whether `NGROK_DOMAIN` receives a value-free migration warning to `CODEXGPT_PUBLIC_HOSTNAME` or remains indefinitely supported; preserve its cross-mode value/fingerprint contract either way. Any benchmark-grade App/Web efficiency run requires separate authorization.
2. Delete the remaining Cloudflare DNS record `codexpro-oauth.drliang.uk` only under its separate approval; reviewed background lifecycle, native isolation, Serena/LSP, Tasks 4B1–4B6, credential migration, and toolchain-root migration also remain gated.
3. The earlier 20-minute `1.0.4` normal-use acceptance remains separate from benchmark scoring; if disconnects recur, inspect authenticated local diagnostics before changing any ceiling.
4. If a second project's own OAuth default root is required, create a separately reviewed profile/App/hostname; do not repurpose the existing OAuth deployment. Preserve the effective-capability intersection.

## Recent summaries

- **STEP-543–550 — Local Control Plane:** authenticated overview; independent loopback host; exact ownership journal/child manager; browser Start/Stop/Restart; reviewed additional workspace roots; and safe next-launch tool/write/Safe-Bash presets. OAuth-default-root changes and `full_access` remain unavailable.

## Archives

- [Complete archive volume index](docs/memory/archive/README.md)
- [Closed interphase maintenance Part 13 — STEP-538 through STEP-543](docs/memory/archive/interphase-maintenance-part-13.md)
- [Active interphase maintenance Part 14 — next maintenance step](docs/memory/archive/interphase-maintenance-part-14.md)

## Memory maintenance protocol

- Keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only. At or above 48 KB (80% of the 60 KB direct-read limit), close the volume and start the next numbered continuation.
- `AGENTS.md` is authoritative for the complete protocol.
