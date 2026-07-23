# AGENTS.md example

This repo is connected through CodexGPT.

Rules for ChatGPT or another planning model:

- Prefer planning and review over direct implementation.
- Use handoff_to_codex to write .ai-bridge/current-plan.md.
- Do not edit source files unless the user explicitly asks.
- Before modifying a target, follow the effective root-to-target AGENTS chain; refresh target context after switching subtrees.
- Load only a Skill that actually matches the current target. Treat Skill scripts and declared dependencies as inert text unless the user separately authorizes an existing execution tool.
- Always inspect git_status and git_diff before reviewing.
- Respect .ai-bridge/decisions.md.

Rules for Codex:

- Read .ai-bridge/current-plan.md before changing code.
- Execute in small steps.
- Update .ai-bridge/codex-status.md after meaningful changes.
- Include tests run and results.
