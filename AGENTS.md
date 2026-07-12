# CodexPro Personal Fork — Project Instructions

## 1. Mission

This repository is the user's personal CodexPro fork. Evolve it incrementally into a Windows-native, security-first, self-hosted local development bridge for ChatGPT.

Target network path:

```text
ChatGPT web
  -> HTTPS
mcp.<user-domain>
  -> Cloudflare DNS/TLS/Tunnel
127.0.0.1:8787
  -> customized CodexPro
  -> explicitly authorized local workspaces
```

The implementation must remain self-hosted. Cloudflare is used only for DNS, TLS, and Tunnel. Do not introduce a dependency on a project-operated Remote MCP relay unless the user explicitly changes this decision.

## 2. Environment and hard constraints

- Primary platform: native Windows.
- Do not make WSL mandatory.
- PowerShell support is a core requirement.
- Git Bash is the temporary Windows execution backend; Bash may remain optional.
- Prefer Cloudflare Tunnel bound to `127.0.0.1`; do not expose a local inbound port directly.
- Enforce security boundaries locally, not only at Cloudflare.
- Never leak tokens in logs, diffs, generated documentation, test fixtures, or URLs shown unnecessarily.
- Safe Bash is a policy filter, not an operating-system sandbox.
- Project build and test commands execute repository code with the current user's permissions.

## 3. Working method

- Work in small, reviewable, reversible steps.
- Implement or change one feature at a time.
- Prefer localized changes over broad rewrites.
- Do not mix unrelated refactors, formatting, and feature work.
- Before implementation, inspect relevant source, tests, configuration, project rules, memory, and Git state.
- Use test-driven development for behavior changes and bug fixes.
- Verify with fresh command output before claiming completion.
- Use explicit assumptions; do not present unverified security properties as guarantees.
- Do not bypass CodexPro secret-content protections.
- Pause for user confirmation before architecture changes, irreversible operations, credential migration, access expansion, staging, commits, pushes, destructive Git actions, or history rewrites.

## 4. Memory protocol

The repository uses two memory layers:

- Root `Memory.md` is a concise editable index containing current state, active decisions, open items, recent step summaries, and archive links.
- `docs/memory/archive/` contains complete append-only implementation records grouped by phase.

After every meaningful completed step:

1. Append a dated full entry to the current phase archive.
2. Update `Memory.md` in place.
3. Record exact verification commands and results.
4. Record risks, limitations, rollback, and the next approved action.

Archive entry fields:

```text
Step ID and title
Status
Goal
Files changed
Implementation summary
Verification commands
Verification results
Decisions made
Risks or limitations
Rollback method
Next step
```

Memory rules:

- Keep `Memory.md` at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only; do not silently rewrite archived history.
- Append corrections to archived facts as new correction entries.
- At phase completion, close the current archive and create the next phase archive.
- Record materially relevant failed attempts and their causes.
- Do not store secrets, complete tokens, private keys, or sensitive file contents.
- Keep paths repository-relative unless an absolute path is necessary to explain an environment problem.
- If no source file changed, record `Files changed: none`.

## 5. Active technical rules

### 5.1 Public entry and authentication

- `scripts/codexpro-entry.mjs` is the supported public CLI entry.
- Direct `node scripts/codexpro.mjs` invocation bypasses entry-layer protections and is not the supported public launch path.
- During Phase 0.5, the supported public CLI uses the personal query-token compatibility flow for ChatGPT Web when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset.
- The CLI may print and copy the credential-bearing Server URL for that flow and must instruct `Authentication: None / No Authentication`.
- Treat the URL as a secret: it may leak through browser history, clipboard contents, screenshots, logs, and copied links.
- `CODEXPRO_ALLOW_QUERY_TOKEN=0` explicitly disables URL credentials for advanced compatible clients that can send an `Authorization: Bearer` header.
- Server-side Bearer support remains available for compatible clients, but documentation must not claim ChatGPT Web supports manual static-Bearer configuration.
- OAuth 2.1 is the later standards-based direction; do not start it during Phase 0.5.
- Non-loopback and tunnel modes must fail closed without authentication unless an explicit reviewed override exists.
- Host and Origin checks must run locally.

### 5.2 Cloudflared

- Supported Cloudflare start paths use the pinned verified installer and exact managed binary path.
- Verify the pinned SHA-256 digest and reported version before installation.
- Do not allow a different `cloudflared` from `PATH` to replace the verified managed binary implicitly.
- Explicit `--cloudflared <path>` remains a manual override.
- Cloudflare quick-tunnel Host forwarding is not considered validated until a real external check passes.

### 5.3 Windows paths

- Canonicalize allowed roots and workspace paths with native realpath behavior.
- Windows blocked-path matching is case-insensitive.
- Reject Windows device paths, UNC paths, drive-relative paths, NTFS alternate data streams, reserved device names, trailing dot/space segments, and cross-drive escapes.
- Reject symlink or junction escapes for reads and writes.
- Never weaken blocked secret-file rules to make a test or edit easier.

### 5.4 Shell execution

- Git Bash is temporary; native PowerShell remains planned work.
- Doctor must report an unavailable required Bash backend before a Bash tool call fails.
- A saved profile with `bash: off` must not require Bash.
- `doctor --no-profile` must skip every saved-profile read and validation.
- Full Bash is for trusted local repositories only.

### 5.5 External references

- DevSpace is the primary workflow reference.
- Serena is an optional semantic-provider reference.
- Desktop Commander is a process-management reference.
- External designs must not bypass workspace, permission, path, authentication, or edit-policy boundaries.
- Before copying external source, verify license and attribution requirements. Prefer design-level reimplementation.

## 6. Documentation map

- `Memory.md` — current state and next action.
- `docs/memory/archive/phase-0-and-0.5.md` — full Phase 0 and Phase 0.5 history.
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md` — historical audit baseline, reference projects, target architecture, tool groups, contracts, and Phase 0–9 roadmap.
- `SECURITY.md` — active security guidance and public-entry rules.
- `CLOUDFLARED_VERIFIED_INSTALL.md` — pinned Cloudflared installation and routing policy.
- `design.md` — UI and documentation visual design rules.
- `README.md` / `README_ZH.md` — user-facing setup and usage.

Do not duplicate long architecture descriptions, historical narratives, or step logs in this file. Update the appropriate document and keep only rules required for the next coding session here.

## 7. Verification rules

For every implementation step:

1. Inspect current Git changes.
2. Run the narrowest relevant regression first.
3. Run build or typecheck when the backend is available.
4. Run the relevant smoke suite.
5. Run `git diff --check` or an equivalent dedicated check.
6. Confirm no secret-looking values were introduced.
7. Confirm only intended files changed.
8. Update `Memory.md` and append the phase archive entry.

Distinguish clearly between:

- passed;
- failed because of code;
- not run;
- blocked by environment;
- skipped by platform capability.

## 8. Rollback and compatibility

- Use feature flags for migrations that affect existing connectors.
- Keep deprecated configuration readable for at least one migration period.
- Avoid schema-breaking changes without a version and compatibility path.
- Keep each step independently reversible where practical.
- Never delete user configuration, profiles, tokens, branches, worktrees, or audit data without explicit confirmation.

## 9. Current approved stopping point

Phase 0.5 has passed the approved local gates. Records-only commit `6c9ba9d` exposed a Linux regression-test hang in CI run `29181286011`; the process-tree cleanup fix has now passed local Node 20/24 regression and Smoke verification and is being pushed for fresh CI. OAuth 2.1 remains deferred.

Do not stage, commit, push, alter CI, or begin Phase 1 without explicit approval. The stuck run still requires manual cancellation in GitHub because automated cancellation could not access repository-admin authentication. The next action is to verify the fresh Ubuntu and Windows CI jobs. Real external Cloudflare Tunnel validation remains separately required before Phase 0.5 can close.
