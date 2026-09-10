# C2C Phase 4 — Skill and browser exchange

Date: 2026-09-07. Authorized scope: the owner's Phase 4 request following local Gate 3. The latest detailed roadmap in task `6a9a74a0-c920-83eb-bf4b-b65891aecfd1`, section 8, defines Skill/browser orchestration and a separate Brain prompt. Historical Windows execution Phase 4 is unrelated.

## Deliverable

Repository `skill/` provides the C2C entry and lazy protocol, project-instruction and browser-workflow references. `C2C_CHATGPT_PROMPT.md` defines planning/review independently of the existing coding-agent prompt. Local `c2c session --root <absolute-root>` provides a bounded JSON stdin bridge to the existing session store, parser and reducer. It does not start an executor or change runtime profiles.

The supported host IAB is the browser surface. Acquire it according to its currently available Skill/documentation, retain one tab, validate its provider identity and exact session conversation URL, and inspect only bounded DOM turns after the submitted user message. No cookie/storage access, private browser profile control, screenshots as polling, transcript synchronization or substituted external browser.

The host performs DOM interactions. `src/c2c/browserExchange.ts` validates their bounded observations and supports bounded polling with an injected read/wait port. It does not bundle a browser backend or authenticate fabricated adapter observations. Unknown/error DOM, stale provider or URL, missing submitted turn, extra turns, replay, quoted/fenced protocol and mismatched task/iteration fail closed. The protocol parser and reducer remain authoritative; the Skill cannot grant an execution transition.

## Sending and uncertainty

`prepare-init` commits `SEND_INIT` through revision-CAS before exposing the wire. In this bridge `INIT_SENT` therefore means reserved for one attempt, not confirmed remote delivery. A losing concurrent caller gets no wire. If a crash or output failure follows reservation, inspect the existing conversation; do not reserve or send again. This conservative at-most-once attempt can lose a message and intentionally requires later recovery rather than duplicate execution. Existing state schema is unchanged.

After sending once, obtain the user-turn ID and the prior assistant ID from fresh visible DOM. Poll the same tab. A polling budget exhaustion means pending, preserves local state, and never resends. A completed reply is validated and CAS-applied once. No automatic resume/rerun, chat replacement, HANDOFF sending or executor integration belongs to this phase. Stop at `PLAN_RECEIVED`; Phase 5 owns the single implementation/review loop.

## Verification boundary

TDD covers message attribution, partial generation, wrong provider/URL/task, ambiguous or duplicate assistant replies, pending without sends, CAS-before-wire and rejection after reservation/restart. Managed Node 20/24 builds, focused affected tests, existing MCP smoke, policy and diff checks provide local code evidence. Fresh host IAB evidence is separate: cached plugin files and Phase 0's historical tab checks do not establish current browser availability or a real Phase 4 roundtrip.

The npm package list/release, global Skill installation, runtime deployment, App refresh, OAuth, Tunnel and credentials remain unchanged. Roll back only the additive Phase 4 files, entry routing and inventory entries; retain all existing dirty work, sessions, profiles and audit state.
