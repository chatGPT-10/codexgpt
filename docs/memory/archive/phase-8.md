# Phase 8 Archive

This append-only volume records Phase 8 OAuth/public-auth work. Runtime implementation has not started.

## 2026-07-26 — STEP-437: Complete the executable Phase 8 design and whole-project review

**Status:** The Phase 8 specification, executable TDD plan, adversarial review repairs, `openai/codex` comparison, and post-Phase-8 improvement plan are complete. This STEP is documentation-only. No runtime source, dependency, credential, DPAPI state, Cloudflare resource, ChatGPT App, scheduled task, deployment, staging, commit, or push was changed.

**Goal:** Turn Phase 8 from a security outline into an implementation-ready personal OAuth migration whose first priorities are runnable setup, practical daily use, and low-friction recovery, while preserving mandatory authentication, authorization, audit, rollback, and local-boundary guarantees. Then compare the whole project with a current exact `openai/codex` snapshot and produce a separately gated improvement sequence.

**Files changed by this STEP:**

- `docs/superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md`
- `docs/superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md`
- `docs/reviews/2026-07-26-openai-codex-project-review.md`
- `docs/superpowers/plans/2026-07-26-post-phase-8-project-improvement-plan.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-8.md`

**Phase 8 result:**

- The supported journey is one exact-root `auth setup --root <canonical-path>` flow. It creates or resumes only an owner-marked dedicated named Tunnel, writes a recovery journal before each external step, starts a candidate listener, verifies the external route, commits OAuth only after the probe, and normally leaves the verified candidate running in the foreground.
- The migration uses separate Legacy and OAuth ChatGPT Apps. Server rollback is one restart into `legacy`; client rollback selects the retained Legacy App. Returning to OAuth re-runs the same idempotent setup command and candidate probe rather than asking the owner to reconstruct state.
- The colocated authorization/resource server exposes only the reviewed root OAuth routes plus `/mcp`. Project-owned metadata, strict public-client DCR, exact ChatGPT redirects, PKCE S256, RFC 8707 resource binding, RFC 9207 issuer binding, short ES256 access JWTs, rotating opaque refresh tokens, and request-by-request bearer checks are frozen as contracts.
- Public and local-admin listeners are physically separate. The public root is a static safe help page; Tunnel ingress never routes the loopback admin listener. Bounds cover HTTP concurrency, reserved MCP capacity, ES256 verification, valid/invalid token caches, polling, metadata, and invalid-event aggregation.
- OAuth state separates a stable installation binding from a replaceable incarnation. DPAPI CurrentUser protects production long-lived secrets. Recovery creates and verifies a copy-on-write incarnation before atomically publishing its registry pointer; it keeps Tunnel ownership but invalidates old tokens and requires relinking.
- Authorization-code consumption, grant/family creation, and audit are one crash-safe transaction. Every refresh/revoke/replay/expiry/scope family mutation uses the same deployment-gate, sorted-family-lock, authoritative-reread/CAS order. The existing installation-wide MAC-chained audit becomes durable before a security-state success response.
- Scope challenges distinguish deployment-disabled capability, missing OAuth scope, and existing operation approval. Phase 8 adds no MCP tool, filesystem permission, process authority, or execution isolation.
- The plan is divided into G8-0 and Tasks 8A1–8A8 with RED/GREEN/refactor steps, exact files, narrow commands, managed Node 20/24 commands, detached ordinary/Smoke gates, real ChatGPT G8-U, rollback, and exact-head G8-X. G8-0 requires fresh explicit runtime and dependency authority.

**Whole-project review result:**

- The review is bound to CodexGPT runtime baseline `b4b041da32be7bfb133495fb30aa851d67d4f216` and upstream `openai/codex@20dafe201d91d4405eef05ecd1db0257f13a9ac8`, committed at `2026-07-25T19:28:57Z`.
- The highest-value sequence after Phase 8 is explainable configuration provenance, a read-only diagnostic foundation, current-user Windows background lifecycle, incremental server/CLI/tool-manifest modularization, and then full diagnostic bundles.
- State migration/recovery, feature lifecycle, supply-chain evidence, bounded telemetry, documentation indexing, test consolidation, and network egress policy are later measured work.
- Native isolation is conditional P2 work, not a default rewrite. A read-only feasibility gate must first identify a concrete untrusted-code need. The upstream remote registry/relay/auth path, unauthenticated exec server, Safe Bash, Task Scheduler, proxying, and same-user processes are not sandboxes and must not be copied as such.
- Every improvement is isolated into a reversible work package with dependencies, stopping gates, user impact, rollback, and a separate authorization boundary. The review does not authorize implementation.

**Adversarial review and repairs:**

- Independent reviewers inspected the completed drafts for protocol correctness, runnable commands, state/concurrency safety, UX/rollback, and project-wide prioritization.
- Command repairs made every supported setup/start/rollback path canonical-root exact, retained the existing managed toolchain root on every status/exec/matrix command, removed shell globs from Phase 8 test execution, and required the plan itself to have a permanent command-contract regression.
- Protocol repairs added exact PKCE verifier/challenge syntax, RFC 8707/9207 error and issuer behavior, public-client-only DCR rejection/ignore rules, revocation metadata, code-free bounded denial delivery, refresh scope semantics, cache behavior, and one safe root document.
- State repairs unified all refresh-family mutation ordering, made authorization-code exchange crash-safe, separated refresh envelope/store keys, eliminated finite replay tombstones, fixed binding/incarnation recovery semantics, and made audit persistence part of security-state success.
- Operational repairs added capacity reservations, crypto/polling/global limits, invalid-token fingerprint privacy, invalid-event aggregation, dedicated Tunnel ownership, foreground-success behavior, two-App rollback, idempotent return to OAuth, and explicit legacy-credential retention.
- Project-plan repairs kept configuration and manifest work pure, made diagnostics usable while the server is down, changed service updates to a recoverable short downtime, and gated Windows isolation behind evidence instead of treating the upstream exec server as a ready sandbox.

**Exact verification and results:**

- The managed toolchain status command used the retained exact `C:\Users\Administrator\AppData\Local\CodexPro\toolchains` root and reported Node `v20.20.2` and `v24.15.0` ready.
- The upstream sparse checkout resolved exact HEAD `20dafe201d91d4405eef05ecd1db0257f13a9ac8`, timestamp `2026-07-25T19:28:57Z`, and subject `Make the keymap action menu responsive (#35375)`. All 16 upstream blob/tree objects cited by the review exist at that SHA.
- The Phase 8 plan references 53 unique test files: all 22 inherited files exist, and all 31 absent files are explicitly declared as planned new tests. It contains 14 managed-toolchain status/exec/matrix commands; all 14 pass the exact retained-root contract.
- Final repository policy, local-link, fenced-block, trailing-whitespace, secret-pattern, and diff checks are recorded in the STEP-437 final-verification correction below.
- Runtime build, unit, Smoke, Cloudflare, OAuth exchange, DPAPI, and real ChatGPT tests were not run because runtime implementation and external-state mutation were outside this documentation-only authorization.

**Final primary-document SHA-256:**

- Phase 8 specification: `642a41e55988b05398b0f5ef95f7b9dd1c876309b217fe7305e09aa45e6ee031`
- Phase 8 TDD plan: `3ce38e47edeabaf51c0df10f9215341b2f1eca3f425d43ea713ce8964b394bfc`
- Whole-project review: `f0e8f4913fbc8112a38db7f2ab30586831af14771454ae3a79ba5b8f4d09d0a3`
- Post-Phase-8 improvement plan: `06d4218c4ac40d72f57b57939a718a85da1373d4eebf8523e30af8d4dfc0cf4d`

**Decisions, risks, and limitations:**

- “Runnable, practical, convenient” determines the shortest owner journey and automation order. It does not permit weakening identity, authorization, audit, resource bounds, or rollback because a convenient but forgeable public bridge is not usable.
- SDK route behavior, current ChatGPT OAuth compatibility, exact dependency versions/advisories, DPAPI behavior, Cloudflare ownership, and live redirect behavior can drift. G8-0 must refresh them before the first source/dependency edit.
- Phase 8 remains entirely unimplemented. Current public startup still uses the legacy query-token compatibility flow, and no statement in these documents is runtime evidence.
- The working tree contains pre-existing documentation changes outside this STEP. Staging must use an exact reviewed scope after new authorization; this STEP did not stage anything.

**Rollback:** Revert only the STEP-437 documentation and memory changes. No user configuration, credential, OAuth client, Tunnel, DNS route, scheduled task, workspace, audit store, dependency, or runtime state requires rollback.

**Next action:** Obtain fresh explicit G8-0 authority. Then refresh current protocol/ChatGPT/SDK/dependency facts, prove the baseline and RED tests, and implement Task 8A1 only. Do not start post-Phase-8 improvements, credential migration, Cloudflare mutation, staging, commit, push, release, or deployment under this record.

### STEP-437 final verification — 2026-07-26T09:24:16+02:00

- `npm run policy:check` completed with exit code 0 and `Repository operational policy: PASS`.
- A bounded Markdown audit checked 81 repository-relative links across the nine STEP-437 rule/memory/design/review/plan files; zero were broken.
- All nine files had balanced fenced code blocks, zero trailing-whitespace hits, and zero matches for the bounded private-key, GitHub token, OpenAI-style key, JWT Bearer, Cloudflare-token-assignment, and non-placeholder client-secret patterns.
- `git diff --check` completed with exit code 0. Git emitted only informational LF-to-CRLF checkout warnings for tracked Markdown files.
- `Memory.md` is 129 lines and 17,609 bytes, below its 150-line/18-KB practical limits.
- Recomputed primary-document SHA-256 values exactly matched those recorded above.
- The final working tree remained intentionally unstaged:

```text
## codex/ci-performance-phase1-3...origin/codex/ci-performance-phase1-3
 M AGENTS.md
 M Memory.md
 M README.md
 M README_ZH.md
 M docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md
 M docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md
 M docs/memory/archive/interphase-maintenance-part-5.md
 M docs/memory/archive/interphase-maintenance-part-6.md
 M docs/memory/archive/phase-7-part-3.md
 M docs/superpowers/plans/2026-07-23-phase-7-semantic-providers.md
?? docs/memory/archive/phase-8.md
?? docs/reviews/
?? docs/superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md
?? docs/superpowers/plans/2026-07-26-post-phase-8-project-improvement-plan.md
?? docs/superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md
```

The README, older archive, and Phase 7 plan modifications shown above pre-existed this STEP and were preserved without further edits. No staging, commit, push, release, deployment, runtime test, or external-state mutation was performed.

## 2026-07-26 — STEP-438: Reconcile public authentication status and knowledge boundaries

**Status:** Documentation and project-record cleanup complete; no runtime work started.

**Goal:** Make public user guidance state the exact current authentication reality—query-token compatibility is supported today, while OAuth has a completed Phase 8 design/TDD plan but no runtime—without implying a feature is available or asking users to guess an unsupported configuration.

**Files changed:**

- `README.md`
- `README_ZH.md`
- `FAQ.md`
- `FAQ_ZH.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-8.md`

**Implementation:**

- English and Chinese README/FAQ text now distinguishes implementation-ready OAuth design from unimplemented OAuth runtime, preserves the current query-token flow, and explicitly rejects manual OAuth/static-Bearer improvisation.
- Removed the Chinese README's time-sensitive assertion about eligible account plans. Availability now defers to the current ChatGPT UI, workspace settings, and rollout.
- Compressed `AGENTS.md` from 22,619 bytes/215 lines to below its 15-KB soft size target while retaining policy-enforced markers, exact safety boundaries, and links to the authoritative paired specifications/plans.
- Compressed `Memory.md` from 17,609 bytes/129 lines by retaining current decisions and pointing detailed mechanisms to `AGENTS.md`, paired documents, and archives.

**Verification:**

- Repository-wide Markdown audit found 135 files and checked 104 repository-relative links; none were broken.
- `node scripts/codexgpt-entry.mjs --help` exited 0 and contained every README-documented setup/start/semantic command.
- `.gitignore` retains `.env` and `.env.*` protections.
- `npm run policy:check` passed after restoring the exact markers required by the repository policy.
- The first command-help validator incorrectly matched an array rather than joined text and reported five false missing commands; the corrected validator returned zero missing commands. This was a validation-script mistake, not a product defect.

**Decisions, risks, and rollback:**

- Public docs use the current supported path, not a promised future authentication path. This prevents a user from creating a broken ChatGPT connection from an unreleased OAuth design.
- Rule compression removes duplicated detail only. `AGENTS.md` still directs agents to exact phase docs; those paired documents remain the mechanism source of truth.
- Roll back by reverting only these documentation/memory changes. No credentials, profiles, Tunnel/DNS, state, dependency, or runtime artifacts changed.

**Next action:** Keep Phase 8 runtime gated by fresh G8-0 authority. Do not treat this documentation cleanup as authorization for OAuth, DPAPI, Cloudflare, ChatGPT linking, dependency, service, sandbox, release, or Git publication work.

### STEP-438 verification correction — 2026-07-26

**Status:** Final documentation and rule verification passed.

**Why this correction exists:** The first cleanup pass compressed root rules too aggressively and made public UI wording conditional in a way that no longer satisfied the existing authentication-documentation contract. The adversarial review also identified omitted Phase 4/5 and documentation-CI gate details. The contract and boundaries were restored without any runtime change.

**Exact verification and results:**

- `npm run test:focused -- test/auth-documentation.test.mjs` initially failed 1/6 because `README.md` no longer contained the required `Authentication: No Authentication / None` selection. Restoring that exact selection and adding the conditional qualifier after it produced 6/6 pass, 0 fail.
- `npm run policy:check` passed with exit code 0 and `Repository operational policy: PASS` after restoring the required policy/phase markers.
- `node scripts/codexgpt-entry.mjs --help` exited 0. A joined-output check found zero missing README-documented commands: `setup`, `start`, `semantic use builtin`, `semantic status`, and `semantic disable`.
- `rg --files -g '*.md' -g '!node_modules/**' -g '!.git/**'` enumerated 135 Markdown files. The PowerShell local-link resolver checked 104 repository-relative links with `Test-Path`; zero were broken. Its first version treated root-level documents as having an empty parent and reported false failures; resolving that parent as `.` produced the final result.
- Scoped checks over `AGENTS.md`, `Memory.md`, both README/FAQ language pairs, and this archive returned zero trailing-whitespace, unbalanced-fence, and bounded secret-pattern matches. `git diff --check` passed; Git emitted only LF-to-CRLF warnings.
- Final sizes before archive append: `AGENTS.md` 14,999 bytes/183 lines; `Memory.md` 15,374 bytes/119 lines; this Phase 8 archive 14,578 bytes, below the 48-KB rollover threshold.

**Boundary confirmation:** No source, runtime, dependency, credential, Cloudflare/DNS/Tunnel, ChatGPT, service, staging, commit, push, deployment, or other external state changed. Existing unrelated working-tree changes remain unstaged and preserved.

## 2026-07-26 — STEP-439: Execute the local G8-0 freeze and stop at unresolved gate conditions

**Status:** G8-0 local verification and dependency/protocol freeze evidence completed; the gate is `environment-blocked`, so Task 8A1 did not start.

**Authority and scope:** The owner instructed `@Devspace 开始执行phase8的任务`. This authorizes Phase 8 Core runtime/source work, exact production dependency work, Windows DPAPI helper work, and disposable local credential tests. It does not authorize Cloudflare/DNS/Tunnel mutation, real ChatGPT linking, real credential migration, staging, commit, push, publication, release, or deployment.

**Base and clean-scope evidence:**

- Exact checkout head remained `b4b041da32be7bfb133495fb30aa851d67d4f216` on `codex/ci-performance-phase1-3`.
- The checkout already contained the documented unstaged STEP-437/438 Phase 8 documentation work plus older README, interphase, and Phase 7 documentation changes. Their paths and status were captured before execution and preserved.
- Because some pre-existing unstaged files are outside Phase 8 scope, the plan's clean/reconciled-base precondition is not fully satisfied. No runtime source or package edit was started under that ambiguity.

**Protocol snapshot — 2026-07-26:**

- Current MCP authorization authority is the 2025-11-25 specification: protected-resource metadata is mandatory for protected HTTP resources; `resource` is mandatory on authorization and token requests; bearer credentials belong in every HTTP request header and never in the URI; invalid tokens use `401`, insufficient scope uses `403`; public clients require PKCE `S256`; DCR remains an allowed compatibility/fallback mechanism.
- Current official OpenAI guidance still uses Settings/Workspace Settings → Apps → Create, authentication selection, OAuth completion, and Scan Tools. Official current app-template guidance shows the exact callback shape `https://chatgpt.com/connector/oauth/<callback_id>` and requires exact matching without a trailing slash.
- `@modelcontextprotocol/sdk@1.29.0` requires its OAuth router at the application root and fixes authorization/token/registration/revocation paths at `/authorize`, `/token`, `/register`, and `/revoke`. Its generated metadata advertises `client_secret_post` plus `none`; its built-in registration handler uses generic JSON parsing, open CORS, and can issue client secrets. The reviewed project-owned metadata/registration composition therefore remains necessary.
- Current official documentation does not prove ChatGPT's live acceptance of RFC 9207 `iss`, strict DCR, or the planned wait/status/continue cookie-navigation flow. Real ChatGPT linking was outside this authority and was not run. This is the second unresolved G8-0 condition.

**Exact dependency freeze:**

- Candidate versions remain `@modelcontextprotocol/sdk@1.29.0` and direct `jose@6.2.4`; both are MIT and require Node 18 or newer.
- SDK tarball: 572,539 bytes packed, 4,268,166 bytes unpacked, 677 entries, SHA-1 `79786d8b525e269de850ac82b1f1f757f3915f44`, integrity `sha512-zo37mZA9hJWpULgkRpowewez1y6ML5GsXJPY8FI0tBBCd77HEvza4jDqRKOXgHNn867PVGCyTdzqpz0izu5ZjQ==`.
- `jose` tarball: 50,059 bytes packed, 257,393 bytes unpacked, 88 entries, SHA-1 `69de7346761cd04942c659e524d988feb16a4a6e`, integrity `sha512-N8acGzVsQy6M/fjFcxtysNc4Q379TcM5dM/qKkNtsHFji88yANnXTr7BLeP75iPnFwBfQzM/jg2BZ9+HZrHCZA==`.
- `npm audit signatures` verified registry signatures for 113 packages and attestations for 11. Neither candidate adds an install-time lifecycle script.
- `npm audit --omit=dev` reported zero high/critical and two moderate findings, both from the SDK's `@hono/node-server` static-file path on Windows (`GHSA-frvp-7c67-39w9`). CodexGPT does not use that static-serving path, but the advisory remains an explicit accepted dependency risk for later pinning; it was not silently suppressed.
- No package version was changed because G8-0 did not exit.

**Baseline verification:**

- Retained toolchain root resolved to `C:\Users\Administrator\AppData\Local\CodexPro\toolchains`; Node `20.20.2` and `24.15.0` were already ready.
- Current and managed Node 20/24 focused inherited baselines each reported 77 tests, 76 pass, 1 platform skip, 0 fail.
- Current and managed Node 20/24 builds passed. Repository policy and `git diff --check` passed; only informational LF-to-CRLF warnings were emitted.
- `npm pack --dry-run --json` passed after prepack/build: `codexgpt@0.28.6`, 1,271,523 bytes packed, 7,041,750 bytes unpacked, 582 entries.
- Detached run `2026-07-26T08-45-07-943Z-phase8-g8-0-smoke-matrix-fb43daca` completed with exit code 0. Node 20 and Node 24 each passed analysis, analysis CLI, core, HTTP, Pro CLI, doctor, settings, and handoff Smoke; owned temporary state was cleaned.

**Baseline test repair:**

- A direct Windows diagnostic exposed that `fs.promises.realpath()` can return the long user path while the product uses `fs.realpathSync()` and receives the 8.3 path. The settings Smoke helper therefore computed a different profile/runtime hash from the product outside the compatibility shim.
- `scripts/settings-smoke.mjs` now uses the product's synchronous realpath contract for profile, runtime, policy-path, and ngrok-path expectations. It also handles direct Windows forced `SIGTERM` honestly: Windows may terminate before Node cleanup, so only the exact test-owned stale record for the closed PID is accepted and removed. The supported Windows compatibility wrapper still proves its stronger cleanup simulation.
- Managed Node 20 and 24 `settings-smoke-platform-compat.mjs` passed after the repair, followed by the complete dual-major Smoke matrix above.

**Adversarial review:** The gate was reviewed against its own stop conditions rather than treating successful local tests as implementation authority. The review found no basis to absorb unrelated dirty files or claim unobserved ChatGPT behavior. Therefore exact dependency pins, OAuth source files, DPAPI helpers, and Task 8A1 tests remain untouched.

**Rollback:** Revert only `scripts/settings-smoke.mjs` and this STEP-439 record. No dependency, credential, profile, application state, Tunnel/DNS, ChatGPT App, service, staged index, commit, or remote state requires rollback.

**Only next action:** Reconcile to an exact clean implementation base and explicitly authorize/run the live current-ChatGPT RFC 9207/DCR/cookie-navigation compatibility check. Then close G8-0 and begin Task 8A1 only.

## 2026-07-26 — STEP-440: Correct the Phase 8 gate order and create the clean checkpoint

**Status:** Reviewed reconciliation complete. This checkpoint closes G8-0 and makes Task 8A1 the only next runtime action.

**Authority:** The owner explicitly authorized整理当前已审查变更、修正 Phase 8 门禁顺序，并创建一个本地 checkpoint commit. The authority includes staging and one local commit for the reviewed tree. It excludes push, publication, release, deployment, Cloudflare/DNS/Tunnel mutation, real ChatGPT linking, and real credential migration.

**First-principles correction:** A live ChatGPT test cannot precede implementation of the OAuth endpoints it must exercise. The previous G8-0 wording therefore created a circular precondition: runtime work was forbidden until live RFC 9207/DCR/cookie-navigation acceptance, but no compatible runtime existed to test. The corrected sequence is:

1. G8-0 freezes standards, SDK behavior, current documented platform expectations, bounded constants, dependency candidates, and local baselines.
2. Tasks 8A1–8A5 create the contract-tested OAuth vertical slice without external mutation.
3. G8-U becomes the first live compatibility gate and fail-closes on DCR, RFC 9207 `iss`, redirect, or cookie/navigation incompatibility.

The design still requires exact RFC 9207 issuer binding, constrained public-client DCR, strict redirect matching, and host-only one-use browser binding. No security requirement was weakened to resolve the ordering defect.

**Dependency sequencing correction:** G8-0 approves the exact `@modelcontextprotocol/sdk@1.29.0` and direct `jose@6.2.4` candidates from the recorded registry/license/advisory review. Task 8A1 applies those exact no-range pins as its first package change before any import. This removes the second circularity in which G8-0 claimed to precede every package edit while also requiring package metadata to be edited inside the gate.

**Checkpoint scope:** The checkpoint contains the already reviewed STEP-437/438 design, plan, project review, public-document reconciliation, archive/rule/index updates, the STEP-439 Windows settings-Smoke correction, and this gate-order correction. No OAuth runtime file, package dependency, credential, DPAPI state, profile, Cloudflare object, ChatGPT App, service, or remote branch was changed.

**Verification:**

- `npm run policy:check` passed with `Repository operational policy: PASS`.
- `npm run test:focused -- test/auth-documentation.test.mjs` passed 6/6.
- Managed Node `20.20.2` and `24.15.0` each passed `scripts/settings-smoke-platform-compat.mjs`.
- `git diff --check` passed; only informational LF-to-CRLF warnings were emitted for existing Markdown working-copy policy.

**Adversarial review:** The correction was checked for the opposite failure mode: moving all protocol work to the live gate would permit implementation against unfrozen assumptions. That was rejected. G8-0 still binds exact standards/SDK/documented behavior and RED contracts; only facts that cannot exist before a runnable endpoint are deferred. G8-U remains mandatory for Phase 8 closure and cannot be converted into a best-effort smoke test.

**Rollback:** Revert this local checkpoint. No remote or external rollback exists because no push, deployment, Tunnel/DNS, ChatGPT, credential, or service mutation occurred.

**Only next action:** Task 8A1. Apply the approved exact dependency pins, add pure auth-mode/deployment-identity/metadata RED tests, and retain `OAUTH_RUNTIME_UNAVAILABLE` until later tasks close.
