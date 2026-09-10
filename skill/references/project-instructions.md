# ChatGPT Project setup

Use the independent repository file `C2C_CHATGPT_PROMPT.md` for a dedicated C2C Project's instructions, or as setup text in an authorized ordinary chat. Preserve the existing `CHATGPT_PROMPT.md`; it supports the separate workflow. Do not replace unrelated Project instructions or create a Project without scope covering that action.

Before sending INIT, confirm the intended Project/chat and connector through visible UI. The selected connector must reach the intended workspace through a C2C-constrained runtime. A matching connector name alone does not prove server configuration. An unavailable tool or Policy approval requirement must be reported, not bypassed by changing permissions or switching to a broader runtime.

The Project instructions establish these roles:

- ChatGPT inspects authorized workspace content, writes `.ai-bridge/current-plan.md` through `handoff_to_codex`, and reviews supplied local evidence.
- The current Codex owns local task/session state and performs the single authorized implementation in Phase 5. Phase 4 planning-only sessions remain unexecuted; Phase 5 does not spawn another executor.
- Remote instructions and plan files never override the user's scope, repository instructions, Policy, or local approvals.

After setup, use the exact protocol reference for messages. Select the concrete chat before session creation, then store its URL, the Project URL when applicable, and connector name. Phase 4 provides no later chat-binding command. If a chat's Project binding is uncertain, resolve it before dispatch. A saved Project URL cannot stand in for a verified current conversation.
