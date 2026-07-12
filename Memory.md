# CodexPro Memory Index

This is the concise project-memory index. Complete implementation and maintenance records are stored under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-12.
- Workspace: `D:\Dev\codexpro`.
- Branch: `main`.
- Package: `codexpro@0.28.6`.
- GitHub repository: `chatGPT-10/codexgpt`.
- Local `origin` fetch and push URLs use `https://github.com/chatGPT-10/codexgpt.git`.
- Primary platform: native Windows.
- Phase 0: complete.
- Phase 0.5: formally closed on 2026-07-12.
- Phase 1: not started.

## Approved stopping point

Phase 0.5 is closed and `main` is clean and synchronized with `origin/main` at `6dc359e`. The repository is ready for Phase 1 planning, but Phase 1 has not started. Separate explicit approval is required; the first approved action must be planning only, followed by creation of the Phase 1 archive before implementation. Do not alter the closed Phase 0.5 baseline, stage, commit, or push without explicit approval.

## Active decisions and constraints

- Keep CodexPro self-hosted; Cloudflare is used only for DNS, TLS, and Tunnel.
- Native Windows is the primary platform; WSL must not become mandatory.
- Git Bash is the temporary Windows execution backend; native PowerShell remains planned work.
- Safe Bash is a policy filter, not an operating-system sandbox.
- `scripts/codexpro-entry.mjs` is the supported public CLI entry; direct `scripts/codexpro.mjs` launch is unsupported.
- The supported public CLI defaults to the personal ChatGPT query-token compatibility flow when `CODEXPRO_ALLOW_QUERY_TOKEN` is unset.
- Treat the complete credential-bearing Server URL as a secret because it may leak through browser history, clipboard contents, screenshots, logs, and copied links.
- `CODEXPRO_ALLOW_QUERY_TOKEN=0` is only for compatible non-ChatGPT clients that can send Bearer headers.
- Server-side Bearer support remains, but documentation must not claim ChatGPT Web supports manual static-Bearer configuration.
- OAuth 2.1 is deferred to a later phase.
- Supported Cloudflare starts must use the pinned verified managed binary path.
- Do not bypass secret-content protections or weaken workspace/path boundaries.
- Do not stage, commit, push, rewrite history, rotate credentials, or expand access without explicit approval.

## Final Phase 0.5 evidence

- Baseline commit: `82c24da` (`feat: complete Phase 0.5 security baseline`).
- Linux process-tree fix: `da83f77` (`fix: clean up Linux test process trees`).
- Closure record: `73d7f8f` (`docs: close Phase 0.5`).
- Local Node 24 regression: 38/38 passed.
- Local Node 20 regression: 38/38 passed.
- Smoke: 8/8 sequential sections passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm pack --dry-run`: 97 files; internal memory archives excluded.
- CodexPro self-test: 7 pass, 0 fail.
- Runtime-fix CI run `29183635923`: Ubuntu/Windows Node 20/24 all passed.
- Closure-record CI run `29184298290`: Ubuntu/Windows Node 20/24 all passed.
- Stale CI run `29181286011`: manually cancelled after the replacement run passed.
- External Cloudflare validation: the public hostname reached CodexPro through Cloudflare, passed Host validation, and returned the expected unauthenticated `401`.

## Known limitations

- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.

## Open items

1. Await explicit approval to begin Phase 1 planning.
2. After approval, create `docs/memory/archive/phase-1.md` and define the first single-feature implementation plan.
3. Do not modify source code or the closed Phase 0.5 baseline until that plan is reviewed and approved.

## Recent summaries

- **STEP-068 — Documentation diff review:** reviewed the complete change set, found no blocker, confirmed only documentation/rules/memory files changed, and re-ran the focused 6/6 documentation tests plus the diff check.
- **STEP-069 — Stage reviewed documentation:** staged all 12 reviewed documentation, rule, website, and memory paths after explicit approval.
- **STEP-070 — Commit post-Phase 0.5 documentation:** created local commit `7b9c0fe` (`docs: reconcile post-Phase 0.5 documentation`) after explicit approval.
- **STEP-071 — Push documentation reconciliation:** pushed through record commit `6dc359e`; local `main`, `origin/main`, and remote `HEAD` were synchronized.
- **STEP-072 — Phase 1 readiness cleanup:** used `neat-freak` to confirm the roadmap already defines Phase 1, condensed the active next action, and marked the repository ready for planning but not started.

## Archives

- [Closed Phase 0 and Phase 0.5 history — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)
- [Interphase maintenance — STEP-066 onward](docs/memory/archive/interphase-maintenance.md)

Archive integrity for the pre-migration journal:

- Lines: 1089
- Bytes: 45573
- SHA-256: `b297808452af0cd49311e03f4365d0770a115a119e6db3eeb14966fadb3ad477`

## Memory maintenance protocol

- Edit root `Memory.md` in place; keep only current state, active decisions, final evidence, limitations, open items, recent summaries, and archive links.
- Keep this file at or below 150 lines and 18 KB when practical; 200 lines and 25 KB are hard limits.
- Phase archives are append-only and close when their phase closes.
- Create the next phase archive only when that phase begins.
- Record between-phase work in `docs/memory/archive/interphase-maintenance.md`.
- Every meaningful completed step must update this index and append the active archive.
- `AGENTS.md` is authoritative for the complete memory protocol.
