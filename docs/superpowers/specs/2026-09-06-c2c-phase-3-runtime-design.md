# C2C Phase 3 — Safe Runtime Profile

Date: 2026-09-06. Scope: the owner's explicit Phase 3 request, following local Gate 2. Source: the latest detailed C2C roadmap in conversation `6a9a74a0-c920-83eb-bf4b-b65891aecfd1`, section 7. This is implementation authorization, not permission to replace the active deployment or change credentials.

## Launch contract

The supported public command is `codexgpt c2c start [--root <workspace>] [connection options]`. The entry layer validates a closed set of connection options, converts the command to existing `start`, and supplies transient constraints: `mode=handoff`, `write=handoff`, `bash=off`, `toolMode=standard`, `codexSessions=off`. It also pins `executionProfile=off`, `executionDependencies=off`, `gitMode=read`, `gitIntegrations=off`, and `contextDir=.ai-bridge` so inherited environment settings cannot restore independent execution/Git capabilities or redirect the plan directory.

`CODEXGPT_C2C_RUNTIME=1` selects a server capability ceiling; it is not a connector mode, tool mode, persisted profile field, or new MCP contract version. The marker accepts exactly `0|1` (absent means disabled). Config loading and server construction reject inconsistent effective safety settings. Normal launches and `--mode handoff` retain their behavior. Existing semantic/guidance/contract selection and its required dependencies remain authoritative; C2C does not silently enable V5 or weaken its gates.

Explicit conflicting safety options, unknown flags, positional subcommands, profile-saving and installer actions fail before launch. Existing root/auth/host/tunnel inputs are forwarded through the supported entry's verified Cloudflared and authentication-output protections. The saved profile is read but never rewritten by C2C; first-run setup is skipped. No OAuth grant/root/schema migration occurs. The usual startup may create its existing runtime/audit state; this is not a no-side-effects preview. `--print-env-only --tunnel none` is available for bounded configuration inspection and does not prove a running server.

## Server ceiling and stale clients

The existing combination is insufficient: standard mode omits `handoff_to_codex` and legacy `git_diff`, OAuth retains generic write registrations, and later contracts advertise execution/Git actions independently of Bash. Therefore `src/c2c/runtimeProfile.ts` owns an explicit closed allowlist applied both to the tool inventory projection and actual registration. Existing version, analysis, connection-test and OAuth authorization filters still apply. The full catalog is used only to discover version-available definitions before intersecting this ceiling; the effective `toolMode` stays `standard`.

Allowed names are: `codexgpt`, `server_config`, `codexgpt_inventory`, `list_workspaces`, `open_current_workspace`, `open_workspace`, `close_workspace`, `workspace_snapshot`, `inspect_workspace`, `tree`, `search`, `read`, `git_status`, `git_diff`, `show_changes`, `read_handoff`, `wait_for_handoff`, `codex_context`, `load_skill`, `handoff_to_codex`, and version-available `semantic`. Unlisted future tools are denied by default.

Unregistered direct calls fail at the MCP dispatcher. Wrapper canonical names and aliases resolve only to registered handlers. The V5 composite `verify_change` has an additional explicit hard rejection, even if a handler is supplied; its workflow action list is empty in C2C. Both the direct server and production wrapper composition preserve this restriction. Ordinary V5 still returns its original single workflow action, and V1–V5 canonical tool universes remain `28/31/39/51/52`.

`handoff_to_codex` is the only exposed workspace-content writing tool. It reuses the existing bounded `.ai-bridge` plan, scaffold, status/log and diff artifact behavior, path confinement, secret checks, and selected atomic/audit machinery. It does not execute a local agent. Read/review tools can maintain their existing internal metadata; C2C does not claim zero internal state writes or OS isolation. Schema changes add truthful `standard` success values for the newly available handoff and legacy context tools while retaining `full` and all envelope fields.

The existing Policy remains authoritative: an enforce-mode configuration without a matching grant can return `APPROVAL_REQUIRED` for plan writing. C2C does not automatically approve it, change the saved permission profile, or fall back to legacy Policy. Production verification checks both successful atomic/audited handoff under existing legacy Policy and unchanged approval refusal under enforce Policy.

## Validation and rollout

Gate 3 requires actual server-call evidence of denied source writes, denied shell/Git mutations, successful plan creation and real Git diff, plus stale direct/alias rejection. Add configuration/profile precedence, invalid flag, secret/path and V5 workflow tests; run managed Node 20/24 build, focused adjacent contracts, production atomic checks and existing MCP smoke. Keep mock wrapper evidence distinct from production evidence and Web/OAuth integration.

Rollback removes only the new C2C launcher/ceiling and additive schema/test/document changes, leaving saved profiles, sessions, audit records and existing dirty work intact. Starting ordinary `codexgpt start` removes this extra ceiling and restores that profile's own authority; it is an explicit operational choice, not an automatic fallback. Deploying C2C to an existing App endpoint and refreshing its tools is separate from this local implementation. Phase 4 Browser/Skill work is not included.
