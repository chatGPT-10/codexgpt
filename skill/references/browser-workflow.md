# Browser conversation workflow

## Bind the conversation

Discover and use the host's available Codex In-app Browser interface and its documented DOM/interaction operations. Read the currently available browser Skill when the host exposes one; a cached Skill file is not evidence that its browser tools are enabled. Keep one tab for this session. Inspect the current visible URL and conversation identity after navigation and after reacquiring a browser handle; short tab IDs alone are not stable identity. Browser lifecycle retention is best effort, not a guarantee across application restart.

Use an existing authorized ChatGPT chat or Project. Supported persisted URLs are HTTPS `chatgpt.com` conversation URLs, and Project URLs shaped `/g/g-p-…/project`; a Project chat must belong to the intended Project. Do not infer a Project association from a title alone. Select the concrete chat URL before beginning either mode. Although the session schema permits a null Project chat URL, Phase 4 has no chat-binding command and cannot exchange messages with that incomplete binding.

Read visible DOM only. Do not access cookies, localStorage, sessionStorage, browser profiles, hidden authentication state, internal APIs, or account tokens. Login, account restrictions, absent host tools, an unavailable connector, or unclear conversation identity are explicit prerequisites to resolve; do not work around them using another browser or credentials.

Confirm the selected connector and effective C2C capability ceiling before exchanging plans. `c2c start` starts a runtime; it does not attach a ChatGPT connector, refresh an App, configure a Project, or open a browser. Do not replace a running deployment merely because its connector is not C2C-ready.

## Send and observe

Prepare canonical wire from local session data through `prepare-init`, which reserves INIT_SENT with revision-CAS before returning wire. This reservation does not prove delivery and cannot be retried as permission to resend. Check that the bound tab is still at the intended conversation and that the composer is stable and empty. Fill once, inspect the composer text, and submit once. Capture visible evidence of the submitted user message. If the tool times out or the response is uncertain, inspect the same tab; never resend automatically. A crash between reservation and submission also requires reconciliation.

Identify the new assistant message following that exact submitted message. Record the submitted user-turn ID and preceding assistant ID as the baseline. Wait for generation to finish before reading its whole body. Exclude prior replies, user text, tool cards, quoted examples, and global page/transcript matches. Poll bounded DOM observations, not screenshots or full transcript synchronization. Maintain a bounded observation interval; a loading indicator or a timeout is not an ERROR from ChatGPT and does not prove non-delivery. Preserve the unresolved state and report the concrete observation needed to resume.

Pass the complete assistant body unchanged to the strict local parser with the bound task and expected iteration. Validate the state transition. Malformed, stale, duplicate, wrong-task and wrong-iteration messages do not advance the session. Never extract a plausible protocol substring from otherwise invalid content. The current receive interface accepts the PLAN wire; it does not read or verify the artifact. The existing `readPlanSnapshot` integrity check is required before later execution and remains separate from this exchange.

At PLAN_RECEIVED, protocol acceptance alone leaves artifact integrity unverified. Historical Phase 4 stops here. For an authorized Phase 5 goal, continue through [execution-workflow.md](execution-workflow.md); an earlier planning-only goal does not become executable merely because Phase 5 is available.

## Resume

Reload the persisted session and compare its workspace, task, revision, conversation and current state to fresh observations. Revision conflicts, corrupt sessions, missing tabs and uncertain delivery require reconciliation; do not overwrite the session or use a new task to hide the conflict. Checkpoint text retains the original goal, completed subtasks, known issues and next expected step without copying secrets or a full transcript.

HANDOFF is informational context for a separately authorized continuation. It does not change the reducer state, authorize automatic chat creation or message replay, or prove that an interrupted execution did not run. Keep future execution recovery separate from browser reconnection.

## Local CLI boundary

Invoke `codexgpt c2c session --root <absolute-workspace>` with one bounded strict JSON request on standard input. A source-checkout contributor may equivalently invoke `node <checkout>/scripts/codexgpt-entry.mjs c2c session --root <absolute-workspace>`. Construct JSON using a serializer and pipe it as data; do not interpolate goal/message text into shell code. Inspect `ok` and the process exit status before using output. Preserve the returned revision for the next compare-and-swap request.

The initial request is `{"action":"status"}`. Create a session only when its status and the user's scope permit it, using `action: "begin"`, `input: {taskId, workspaceId, originalGoal, conversation}`, and `expectedRevision: null` for an absent session. An existing completed/ended session requires its exact revision and a fresh task ID. `conversation` uses either `{mode: "chat", projectUrl: null, chatUrl, connectorName}` or `{mode: "project", projectUrl, chatUrl, connectorName}`. Both require a concrete chat URL for this workflow. Populate every identifier and URL from actual bindings.

Reserve INIT with `{action: "prepare-init", taskId, revision}`. The successful response supplies `session` and `wire`; send that exact wire once using the browser workflow above. A persisted INIT_SENT alone is insufficient to reconstruct a safe automatic retry.

Use the browser observation interface for browser-derived replies, with the baseline and snapshot taken from the same verified tab. A waiting observation is read-only; a completed observation validates the message and receive transition before saving it, without verifying plan artifact bytes. Raw `receive` is a trusted manual-input boundary, not a substitute for browser message provenance. The injectable browser exchange driver needs a host adapter implementing those observations; its deterministic tests do not provide or prove a live browser backend.

Submit `{action: "observe", taskId, revision, baseline, snapshot}`. The baseline contains exactly `{tabId, providerId, chatUrl, lastAssistantId, userMessageId}`; `lastAssistantId` may be null when there was no previous assistant turn. The snapshot contains exactly `{tabId, providerId, chatUrl, generating, error, messages}`. Populate `messages` with the submitted user turn and its following assistant turn only, each `{id, role, text}`; roles are `user` or `assistant`. Read IDs and generation/error indicators through the host's documented visible DOM APIs; do not invent IDs or infer completion from unchanged text. If those facts cannot be established, stop observation and report the missing evidence.

Fresh ChatGPT UI checks on 2026-09-07 exposed `data-turn-id` on the section surrounding each visible message heading, and `data-message-author-role`/`data-message-id` on its content container. Treat these as observed examples, not permanent selectors: rediscover through the current DOM when the UI changes. Exclude tool cards, response buttons and collapsed-text controls from the body. Reject fenced/code-block representations rather than stripping their wrapper to manufacture a bare reply.

The composer may represent each line as a paragraph, so its rendered `innerText` can contain extra blank lines. Inspect the actual DOM paragraph/line structure before submission; compare a lossless plain-text projection to the reserved wire. Do not blindly remove whitespace from received messages. After submission, verify the user message once to establish delivery and its turn ID. New chats may briefly use `/c/WEB:...`; wait for the concrete UUID conversation URL before binding a session. Mark the tab for continuation each turn when required by the host; retention is not permanent. A missing tab or a lost runtime is not permission to resend an INIT reservation.

`observe` requires INIT_SENT or EXECUTED_SENT and an exact session chat URL match. Results use `{ok: true, session, observation: "waiting"|"complete"}`; failures use `{ok: false, error}` and nonzero exit. Persist the returned revision in working context. Poll at roughly five-second intervals for at most 55 seconds per batch, report ongoing progress, then inspect again without sending. A pending batch is not a protocol error or a completed task.

After `prepare-executed`, use the same single-send procedure with a fresh baseline for that exact EXECUTED user turn. In EXECUTED_SENT, observe accepts only DONE, BLOCKED or ERROR. A second PLAN is rejected even if it is otherwise protocol-valid. Reservation and unknown delivery are never permission to resend.
