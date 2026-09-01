# Design - CodexGPT

A locked product-system note for CodexGPT docs and the local admin surface.
Every redesign should keep the same trust story: ChatGPT can act through a
token-protected local MCP bridge, while configured roots, locally confirmed
roots, trusted-code process execution, writes, Codex history, and handoff
execution remain visibly separate user choices.

## Genre

modern-minimal developer tool

## Positioning

Use ChatGPT like your local coding agent.

CodexGPT should explain itself in this order:

1. Install the CLI.
2. Run setup inside one repo.
3. Paste the copied Server URL into ChatGPT Developer Mode.
4. Let ChatGPT inspect, edit, verify, or hand off work inside that workspace.
5. Offer confirmed roots and **Full access (ask first)** only as advanced,
   explicitly approved choices for trusted local code.
6. Keep the safety boundary visible: it is a local bridge, not a quota bypass,
   model proxy, hosted SaaS, DLP system, or OS sandbox.

## Macrostructure Family

- Marketing/docs pages: left-led product workbench with a visible three-step
  path, trust boundary, and reference sections below.
- Local admin pages: compact control surface with connection profile first,
  live runtime guardrails second, CLI-only controls below, and raw paths
  visually secondary.
- Content pages: long-document reference with short setup recipes first and
  detailed options after.

## Theme

- Paper: near-white blue
- Ink: deep neutral blue-black
- Accent: Codex blue
- Accent use: links, primary actions, selected tabs, status highlights
- Avoid: orange/amber, purple gradients, fake terminal/browser frames, invented
  metrics, and decorative glow.

## Typography

- Display: Geist-like system sans, heavy weight, normal style.
- Body: system sans, normal style.
- Mono: system monospace for commands, paths, tool names, and IDs only.
- Headings stay compact. Hero copy should be short enough to read in one scan.

## Spacing

Use a 4-point rhythm. Dense admin controls can use row dividers and grouped
fieldsets. Marketing sections can breathe, but the first viewport must still
show installation and trust details.

## Motion

No cinematic motion. Use hover, active press, copy confirmation, and reduced
motion support. Animate transform and opacity only.

## Copy Rules

- Say what CodexGPT does, then say what it does not do.
- Keep `configured_roots`, `confirmed_roots`, trusted-code `full_access`, and
  unavailable `workspace` visually and verbally distinct.
- Keep typed local Git, managed task worktrees, and unrestricted processes
  visually distinct. A Git capsule is not a sandbox, and a task worktree is
  workflow isolation rather than process or credential isolation. Gate X must
  be described as four fixed typed operations only: private-index stage,
  shadow-directory commit, quarantined object-only merge, and private checkout;
  it never accepts caller-selected Git commands or remote/credential/force/config
  mutation and still runs with ambient current-user full access and no isolation.
- Describe task removal as checkout/registration removal with branch, commit,
  private-stash, and audit retention. Never label it branch deletion.
- Separate merge review/candidate checks from live-target execution and show
  the second approval/CAS boundary.
- Label ambient execution **Full access (ask first)** and state that it has no
  filesystem, credential, registry, broker, device, or network isolation.
- Describe Job Objects as member lifetime control and ConPTY as terminal I/O;
  never call either one a sandbox.
- Describe project guidance as bounded root-to-target context: workspace open exposes instruction paths and bounded Skill metadata while retaining root guidance only in structured compatibility fields; target context is refreshed before mutation and after subtree switches, and at most one matching target Skill is loaded lazily. Guidance, Skill metadata, bodies, resources, scripts, and declared dependencies never grant authority or execute automatically.
- Treat workspace open as the single bootstrap interaction. Its model-facing `context_snapshot` must stay deterministic and bounded, distinguish confirmed manifest/script facts from inferred ecosystem defaults, summarize Git without a diff, expose instruction paths and Skill metadata without bodies, and point to `codex_context`, `load_skill`, `tree`, and `git_diff` for lazy detail. Do not make `server_config`, inventory, or a tree scan routine prerequisites for the first useful code action.
- Treat tool descriptions as interaction design, not implementation labels. Route ordinary code location through `semantic(operation=navigate)` or V5 `codexgpt(action=navigate_code)` so the server, rather than the model, chooses owned semantics, lexical fallback, or bounded file discovery. Keep raw `tree` for requested hierarchy and raw `search` for requested lexical occurrences. Keep mutation/process boundaries explicit: `write` for whole-file replacement, `edit` for one exact replacement, `apply_patch` for coordinated multi-location changes, `run_command` for finite work, and full-mode `start_process` for persistent or interactive work. Selection guidance never grants authority or bypasses approval.
- Describe Phase 7/P3 semantic navigation by user goals: find a definition, references, implementation, text, filename, or diagnostic; inspect one file's diagnostics; or preview a rename. Every normalized navigation result must expose the actual Provider, `result_quality`, detailed quality, fallback, and truncation. Never present lexical fallback as semantic certainty, and never manufacture lexical diagnostics.
- Treat P4 as an explicit change workflow, not new execution authority. Committed V5 mutations return owner-bound next-state; `verify_change` accepts check categories rather than commands and reuses the existing `run_command` pipeline only after an explicit request with an eligible `full_access` execution profile. Do not conflate that execution profile with full tool mode: standard tool mode already exposes finite `run_command`, while local Policy and approval remain authoritative. `show_changes(change_set_id=...)` links a whole-workspace diff review for unexpected files, formatting, generated artifacts, dependency changes, and accidental deletion. Completion means verification reached a real terminal result and the diff was inspected; readiness additionally requires passing checks. V1-V4 and the exact V5 direct-tool count remain unchanged.
- Treat P5 as an additive process-experience contract over the existing Windows execution kernel. V5 `state` is the canonical `starting | running | exited | failed | terminated` lifecycle and `status` is an equal compatibility alias; older V3/V4 wire shapes remain exact. A persistent record is `starting` until backend handle acquisition plus required start audit complete, and close/revoke must join and terminate a handle that arrives during startup. Keep the existing bounded `output.next_cursor` loop, cancellable `wait_ms`, Job-tree ownership, quota/retention, and ambient-authority warning rather than adding a second process runtime.
- Keep rename preview, approval, and apply visually distinct. A rename preview is a bounded review artifact, not permission; only V5 `apply_patch` may consume its opaque `semantic_preview_id` through the existing atomic mutation and undo path.
- State that builtin semantic analysis is zero-setup for JavaScript/TypeScript but the owned worker still has current-user ambient access. Serena and direct LSP remain unimplemented, unbundled extensions until separately approved.
- Distinguish authentication status precisely: Phase 8 Core through Task 8A9 is verified. Authorized live G8-U is accepted through Journeys U2 scope/descriptor, U3 restart/refresh, U4 revoke/relink, U5 negative/recovery, U6 rollback/return, and U7 Tunnel boundary; STEP-470 accepted local G8-X through post-repair managed Node 20/24 ordinary and protected Smoke. U6 closed with a documented evidence substitution because the original Legacy App was deleted: a recreated Legacy App proved current rollback compatibility, exact setup restored OAuth, and the existing OAuth App proved return continuity; continuity of the deleted Legacy App identity is not claimed. U7 proved fail-early byte-preserving shared/unowned config refusal, public-loopback-only ingress, local-admin exclusion, and fail-closed Host/forwarded-header handling. The Phase 8 closure passed exact-head CI at `55b2b5664aae322ec992968a41c87a289fb75282` / `30274857996` and was published in `1.0.0`. Never convert synthetic, local, or partial live evidence into a substitute for those closure gates.
- Present OAuth setup as one exact-root command, a token-free public URL, and a separate loopback approval step. Show the public `127.0.0.1:8787` and local-admin `127.0.0.1:8788` boundaries explicitly; never depict the local-admin listener behind Cloudflare.
- Migration UI and docs must show two retained Apps: one Legacy query-token App and one OAuth App. Service restart does not switch the ChatGPT-selected App. Profiles retain separate credential-free Legacy/OAuth routes; rollback switches the complete active route, preserves OAuth state, and requires choosing the retained Legacy App; return-to-OAuth revalidates the saved dedicated Tunnel.
- Describe recovery restore/reinitialize as a forced security reset and relink, never as restoration of prior token authority. Label CurrentUser DPAPI as protection against offline/profile-external disclosure, not same-user malware isolation.
- Manual static Bearer is only for compatible clients that can send the header; never present it as a supported ChatGPT Web configuration. Cloudflare Access, mTLS, DPoP, multi-owner tenancy, OIDC/ID-token behavior, and OS isolation are also outside the Phase 8 Core claim.
- Do not claim permanent ChatGPT memory. Say repo-backed context files.
- Do not imply CodexGPT unlocks models, bypasses limits, automates approval
  gates, or provides secure human-presence proof after same-user code runs.
- Never present the reserved `workspace` profile or retained Gate S probe as a
  usable sandbox. Unavailable means unavailable; no fallback to `full_access`.
- Do not expose raw local paths as marketing proof. Local admin can show them
  because it is token-protected and opened by the local user.

## Shared Components

- Primary action: blue filled button.
- Secondary action: white button with blue border.
- Trust boundary: compact list or table near setup.
- Commands: real text blocks with copy buttons, no fake terminal chrome.
- Admin panels: white surfaces, 1px blue-gray rules, no nested-card clutter.
