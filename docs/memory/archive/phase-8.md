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

## 2026-07-26 — STEP-444: Revalidate Task 8A3 and reopen the implementation boundary

**Status:** Task 8A3 is not complete. The public/local Express app factories and their narrow tests exist, but the supported OAuth production startup path cannot reach a usable two-listener state. Task 8A4 remains blocked.

**Goal:** Independently verify the prior Task 8A3 completion claim against the reviewed plan, production entry path, negative security boundaries, and managed Node 20/24 rather than accepting app-factory unit tests as runtime evidence.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-8.md`

No runtime source, test, dependency, credential, profile, tunnel, DNS, ChatGPT App, staged index, commit, push, or deployment state was changed. Disposable `.ai-bridge/a3-*-verify-*` profile fixtures were removed after execution.

**Confirmed implementation:**

- `src/http/publicApp.ts` and `src/http/localAdminApp.ts` are separate Express factories.
- Public owner/admin paths return `404`; forwarded Host is not trusted; public root/health use `no-store`; metadata is serialized once per app construction with the frozen 60-second cache headers; `/mcp` returns the stable unavailable response.
- Listener configuration requires distinct loopback ports.
- Existing legacy HTTP/security/local-control focused regressions still pass.

**Blocking defects:**

1. `src/http.ts` performs the legacy `CODEXGPT_HTTP_TOKEN` requirement before the OAuth branch. A disposable direct OAuth launch of `dist/http.js` exits with `CODEXGPT_HTTP_TOKEN is required for this HTTP binding` before either listener starts.
2. `scripts/codexgpt.mjs` always creates a legacy static token unless `--no-auth` is used. Both states conflict with `assertHttpAuthModeCompatibility()` in OAuth mode, so the supported `scripts/codexgpt-entry.mjs start` path cannot correctly launch OAuth.
3. The launcher probes `http://127.0.0.1:<public-port>/healthz` without the configured OAuth Host header, while the public app correctly requires the exact saved hostname. The supported-entry disposable run timed out without reaching healthy state.
4. The launcher checks only the public port and has no local-admin port availability or status URL model.
5. Task 8A3 requires pre-serialized metadata/JWKS plus the exact public-safe 32-active/64-queued/600-per-minute boundary. `src/http/publicApp.ts` has no `/jwks` route and no admission/rate limiter.
6. `OwnerAdminService` is only a `{ kind: "local-control-cli" }` tag and is not implemented by or connected to the existing current-user local-control adapter.
7. The Task 8A3 tests instantiate app factories directly. They do not exercise `loadConfig()`, `src/http.ts`, the public entry, both bound ports, launcher health, shutdown, runtime status, or Cloudflare ingress exclusion.

**Exact verification and results:**

- `npm run build` passed.
- `npm run test:focused -- test/phase-8-listener-separation.test.mjs test/phase-8-public-health.test.mjs test/http-security.test.mjs test/process-local-control-cli.test.mjs test/local-control-protocol.test.mjs test/phase-7-http-reconnect-preview.test.mjs` passed 19/19.
- Managed toolchain status at `C:\Users\Administrator\AppData\Local\CodexPro\toolchains` reported Node `20.20.2` and `24.15.0` ready.
- Managed Node 20 and 24 each passed the five Task 8A3 app-factory tests and `npm run build`.
- Disposable direct `dist/http.js` OAuth launch failed with exit code 1 at the legacy HTTP-token precheck.
- Disposable supported `codexgpt-entry start --tunnel none` did not become healthy and was terminated by the bounded 12-second test timeout; no test listener remained and all disposable fixtures were removed.
- `npm run policy:check` passed.
- `git diff --check` passed with only the repository's existing LF-to-CRLF informational warnings.

**Decision:** Passing app-factory tests is necessary but not sufficient evidence of physical listener separation. Closure requires a supported-entry integration test that proves both loopback sockets bind, public Host behavior works through the launcher probe, local-admin is unreachable through public routing, shutdown closes both sockets, and no legacy credential mode is introduced.

**Rollback:** Revert only this verification correction in `Memory.md` and this archive entry. No production or external state requires rollback.

**Only next action:** Complete Task 8A3 itself. Repair OAuth-aware launcher/config startup, both-port lifecycle/status, JWKS and frozen admission limits, real owner-service wiring, and add the supported-entry integration regression before beginning Task 8A4.

## 2026-07-26 — STEP-445: Complete corrected Task 8A3 physical listener separation

**Status:** Task 8A3 is complete locally after correcting every blocker identified by STEP-444. The supported public entry now reaches and owns two physically distinct loopback listeners in OAuth mode. Task 8A4 is the only next runtime action.

**Goal:** Make listener separation true at the production entry, process, state, socket, routing, lifecycle, and user-status layers—not only in isolated Express factories—while preserving legacy behavior and keeping OAuth MCP authorization unavailable.

**Files changed by this corrected slice:**

- `scripts/codexgpt-entry.mjs`
- `scripts/codexgpt.mjs`
- `src/config.ts`
- `src/http.ts`
- `src/http/publicApp.ts`
- `src/http/localAdminApp.ts`
- `src/http/securityHeaders.ts`
- `test/phase-8-auth-config.test.mjs`
- `test/phase-8-listener-separation.test.mjs`
- `test/phase-8-public-health.test.mjs`
- `test/phase-8-listener-runtime.test.mjs`
- active Phase 8 rule/plan/roadmap/memory files

The working tree also contains the already-authorized unstaged Tasks 8A1–8A2 files. No stage, commit, push, release, deployment, real credential migration, Cloudflare/DNS/Tunnel mutation, or real ChatGPT linking occurred.

**Implementation:**

- The public entry detects saved/profile-selected OAuth before applying legacy query-token output compatibility. OAuth launch explicitly carries `CODEXGPT_AUTH_MODE=oauth`, disables query/no-auth credentials, and never creates or prints a legacy static token.
- The launcher validates both loopback ports before spawn, probes public health with the exact configured OAuth Host using native HTTP rather than a fetch implementation that rewrites Host, probes local-admin health separately, writes the token-free local-admin status URL, and terminates the child on either probe failure.
- `src/http.ts` applies the legacy token prerequisite only to legacy mode. OAuth startup resolves the reviewed deployment configuration, opens the installation-wide persistent audit, probes Windows DPAPI CurrentUser, initializes or reuses the atomic deployment registry/state under the auth state root, and derives identity/JWKS from the persisted binding/incarnation/key revision instead of hard-coded identifiers.
- OAuth startup creates one current-user native local-control runtime and exposes it through a concrete `OwnerAdminService` adapter. The local browser app has only static status/health and no mutation route.
- Public and local-admin servers bind sequentially with explicit listen-error handling. If the second bind loses a race, the already-bound public server closes before startup fails. Shutdown is idempotent and closes both sockets, local control, auth-process evidence, audit, and process registries.
- The public app has exact configured-Host validation with `trust proxy=false`; forwarded Host is not authority. It exposes only protected-resource/authorization-server metadata, `/jwks`, static `/`, minimal `/healthz`, and the stable unavailable `/mcp` stub. Owner/admin/setup routes are physically absent.
- Metadata and JWKS are pre-serialized per deployment state revision with `public, max-age=60, must-revalidate` and credential-free CORS. Root, health, overflow, and MCP-unavailable responses are `no-store`.
- The frozen public-safe admission boundary is active: 32 active, 64 queued, and 600 requests/minute per process/deployment. Overflow returns bounded `429` plus `Retry-After: 1`; no per-request durable audit is connected to this path.
- Cloudflare launcher paths continue to target only `localBase` (the public port); `localAdminBase` is never passed to cloudflared.
- OAuth CLI messaging no longer describes the URL as secret or instructs `Authentication: None`; it accurately reports that discovery is ready while MCP authorization remains unavailable in Task 8A3.

**TDD and failure evidence:**

- The first supported-entry regression failed with `ECONNREFUSED`, proving that app-factory tests had not exercised production startup.
- After the credential-mode fixes, the same test exposed a second defect: Node fetch did not preserve the configured Host override and the launcher timed out on `403 Forbidden: Host is not allowed`. Replacing that probe with native HTTP fixed the authority mismatch without weakening Host validation.
- The inherited Phase 7 lifecycle architecture test then failed because OAuth introduced a second textual `LocalApprovalRuntimeV3.start` construction. A single shared factory restored one lifecycle construction boundary rather than weakening the regression.
- The inherited A1 config test still expected permanent `OAUTH_RUNTIME_UNAVAILABLE`; it was updated to accept listener-only OAuth configuration while retaining exact mixed-credential and malformed-local-port failures.

**Exact verification and results:**

- Current Node `npm run build`: pass.
- Current affected listener/legacy/Phase-7 suite: 24/24 pass.
- Current auth-state/metadata/DPAPI/mutation/native architecture suite: 50/50 pass.
- Current public-entry/cloudflared/connector-output suite: 15/15 pass.
- Final current runtime slice: 3/3 pass, including supported-entry dual bind/restart, second-bind race rollback, and launcher local-port precheck.
- Managed Node `20.20.2` and `24.15.0`: each passed the 24-test affected listener/legacy/Phase-7 suite before the final race regression; each then passed the final 11-test A3 slice including that regression.
- Managed Node `20.20.2` and `24.15.0`: build pass on both.
- Supported-entry runtime evidence proves: exact public Host probing, two distinct loopback sockets, persisted JWKS equality across restart, available current-user local-control channel, token-free output/status, public absence of owner routes, local absence of browser mutation routes, and closure of both sockets.
- Direct-runtime race evidence proves a local-admin `EADDRINUSE` after public bind closes the public socket before process failure.
- `npm run policy:check`: `Repository operational policy: PASS`.
- `git diff --check`: pass; only repository-standard LF-to-CRLF informational warnings.
- Bounded secret-pattern scan: zero private-key/GitHub/OpenAI/Cloudflare assignment matches.
- `Memory.md`: 126 lines / 17,480 bytes, below practical limits before this archive append; this archive remains below the 48-KB rollover threshold.

**Adversarial review:**

- Security review attempted public owner-route access, forwarded-Host substitution, CORS crossover, token/query fallback, unsafe health disclosure, and Cloudflare local-admin routing; all fail closed or remain absent.
- Correctness review exercised first start, restart with the same persisted JWK revision, both-port shutdown, pre-spawn conflict, post-public-bind conflict, and inherited lifecycle architecture; all pass.
- Compatibility/UX review reran legacy auth/output, HTTP security, Phase 7 reconnect/undo, local-control CLI, public help, Cloudflared integrity, and managed Node builds; no inherited behavior regression remains. No external multi-agent provider was available in this workspace, so these were performed as independent adversarial passes against the completed result.

**Known limits:** DCR, authorization pending/approval state, codes, access/refresh tokens, revoke, browser owner sessions, authorized `/mcp`, setup orchestration, and live ChatGPT/Cloudflare acceptance are not part of 8A3 and remain unavailable. The public `/mcp` response is intentionally `503 OAUTH_RUNTIME_UNAVAILABLE`.

**Rollback:** Revert the STEP-445 runtime/tests/status changes. Existing OAuth state is versioned evidence and must not be deleted automatically; legacy mode remains the explicit no-deletion rollback. No external resource requires rollback.

**Only next action:** Task 8A4. Implement constrained DCR, PKCE authorization, and local owner approval while keeping production token exchange unavailable until Task 8A5.

## 2026-07-26 — STEP-446: Complete Task 8A4 constrained DCR and local owner authorization

**Status:** Task 8A4 is complete locally. The supported OAuth listener now provides constrained public-client registration, exact PKCE authorization, current-user local approval/denial, and cookie-bound one-use authorization-code delivery. Production access/refresh token exchange, revoke semantics, bearer resource middleware, and authorized `/mcp` remain intentionally unavailable until Task 8A5.

**Authority and boundary:** The owner explicitly instructed `@Devspace 执行Task 8A4`. Work stayed inside `D:\Dev\codexpro` and built on the authorized unstaged Tasks 8A1–8A3 tree. No Cloudflare/DNS/Tunnel object, real ChatGPT App, real credential, service, staged index, commit, push, release, or deployment was changed.

**Implementation:**

- Added a project-owned bounded DCR parser and durable client store. It accepts only one exact current ChatGPT callback shape or the documented legacy callback, issues a random 256-bit public client ID with no secret, freezes the Core response/grant/auth/scope ceiling, rejects duplicate/security-sensitive metadata, bounds JSON bytes/depth/property count, expires only unapproved clients, and enforces exact 32-unapproved/16-approved capacity.
- Added current-user local client listing/revocation so capacity failures have a real recovery path. Revoked/expired client rows stop consuming capacity while durable audit evidence remains; approved clients have no artificial expiry.
- Added an exact GET/POST authorization guard with bounded query/form parsing, duplicate decoded-parameter rejection, exact client/redirect/resource/scope/state validation, PKCE `S256`, direct-versus-redirect OAuth error boundaries, RFC 9207 `iss`, no client authentication, and ignored bounded unknown extensions.
- Added process-ephemeral pending authorization and code stores. Pending requests are five-minute, browser-cookie-bound, capped at 32/deployment and 4/client, and expose only safe correlation facts to the existing current-user local-control channel. Approval, denial, expiry, continue, and code consumption are serialized; terminal delivery and authorization codes are sixty-second and one-use.
- Authorization codes are never stored in plaintext. The runtime stores keyed HMAC hashes and binds consumption to exact client, redirect, resource, PKCE challenge, and scopes.
- Public waiting/status/continue responses use `no-store`, `no-referrer`, `nosniff`, `frame-ancestors 'none'`, no third-party assets, and a host-only `__Host-` HttpOnly/Secure/SameSite=Lax cookie. Unknown, cross-cookie, duplicate, late, and alternate-route requests are non-oracular.
- Mounted the pinned SDK auth router only behind project-owned exact route/content-type/rate/error guards and a lookup-only client view. Project-owned `/register`, metadata, and stubs prevent the SDK's broader secret-client registration or metadata defaults from becoming reachable.
- `/token` and `/revoke` return stable no-store `503 OAUTH_TOKEN_RUNTIME_UNAVAILABLE`; `/mcp` remains unavailable. No incomplete provider method is invoked.
- Public admission now freezes 64 active/128 queued with 16 active and 32 queued reserved for exact `/mcp`; non-MCP polling and rate work cannot consume the reserved lane.
- Extended the installation-wide MAC-chained audit transitions for client and authorization state. Registration, approval, denial, expiry, and code publication audit before capability/state publication; audit failure returns a bounded local recovery action and leaves no pending/code success.
- Extended structured/text redaction for OAuth codes, state, access/refresh tokens, client secrets, PKCE verifiers, bootstrap material, DPAPI-protected values, and private JWK members while preserving public JWK fields.
- Added exact local-control operations and CLI commands for `oauth-authorizations list|approve|deny` and `oauth-clients list|revoke`. Terminal output escapes untrusted metadata; browser/public routes cannot mutate owner decisions.
- Added the new Phase 8 tests to the repository's reviewed Windows execution-profile inventory after the ordinary gate correctly detected profile drift.

**Primary files:**

- New: `src/auth/clientStore.ts`, `src/auth/authorizationStore.ts`, `src/auth/oauthProvider.ts`, `src/auth/ownerApproval.ts`, `src/auth/rateLimits.ts`.
- Runtime/control: `src/http.ts`, `src/http/publicApp.ts`, auth state/audit/error/index modules, local-control schemas/server/client/runtime, `scripts/codexgpt.mjs`, and `src/redact.ts`.
- Tests: new DCR/authorization/owner/bounds suites plus auth-audit, listener/public admission, SDK contract, redaction, approval-display, and execution-profile regressions.

**Failure evidence and repairs:**

- The first authorization integration run exposed that the project guard was mounted with the wrong Express-relative path assumption; the exact root guard was corrected and the protocol test passed.
- Adversarial review found that retained revoked rows could permanently consume DCR capacity. Registration now prunes revoked and expired unapproved rows while audit evidence remains durable.
- Review found that authorization polling could consume all public admission and starve future MCP traffic. Exact `/mcp` active/queue capacity is now reserved and tested.
- Review found insufficient redaction for OAuth `code/state`, refresh/client-secret/verifier/bootstrap values, DPAPI blobs, and private JWK members. Text and structured redaction now cover those contexts without redacting ordinary non-OAuth `state` fields.
- The first full ordinary gate failed closed with `TEST_PROFILE_INVENTORY_DRIFT` for seven Phase 8 test files. The manifest now classifies bounded suites as `fast` and the listener runtime as `isolated`; inventory and domain-contract tests pass.

**Verification:**

- Current Node final build and focused post-repair slice: 33/33 pass.
- Current complete Phase 8/auth/listener integration slice: 83/83 pass.
- Managed Node `20.20.2` and `24.15.0`: build passes on both; the exact A4 matrix passes 47/47 on each major.
- Authoritative ordinary execution profiles after inventory repair: `fast`, `safe`, and all non-control `isolated` tests each exit 0. The aggregate `npm run test:ordinary` request exceeded the Devspace 300-second transport window and returned a 502 twice, so closure relies on the same reviewed profile shards run separately rather than treating the transport failure as a product result.
- `npm run policy:check`: `Repository operational policy: PASS`.
- `npm pack --dry-run --json`: pass; package includes the new compiled auth/runtime modules and updated CLI.
- Final `git diff --check`: pass; only expected Git LF-to-CRLF working-copy warnings are emitted. The working tree remains intentionally unstaged with the cumulative authorized Tasks 8A1–8A4 source, tests, and documentation; no stage/commit/push occurred.

**Adversarial review:** Security, state/race, resource-exhaustion, compatibility, and operator-recovery passes were performed independently against the final implementation. No external multi-agent provider was available in this Devspace workspace. The review retained strict redirect/resource/PKCE/owner boundaries, removed one unused owner-rendering helper, hardened durable redirect schema validation, and did not widen token or MCP authority.

**Known limits:** This is not yet a usable ChatGPT MCP connection. Task 8A5 must add access/refresh tokens, revoke/replay behavior, bearer verification, resource middleware, and the first authenticated read-only MCP request. G8-U still must prove current live ChatGPT DCR, RFC 9207 issuer, and cookie-navigation compatibility before Phase 8 closure.

**Rollback:** Revert only the STEP-446 source/test/documentation changes. Existing versioned auth state and audit evidence must not be deleted automatically. Legacy mode remains the explicit no-deletion server rollback; no external resource requires rollback.

**Only next action:** Task 8A5. Implement signed access tokens, rotating opaque refresh tokens, exact resource middleware, revoke/replay handling, and the first authenticated read-only MCP path. Keep live ChatGPT/Cloudflare work, staging, commit, push, release, and deployment separately gated.

**Volume closure:** Phase 8 Volume 1 closes at STEP-446 before the 48-KB rollover threshold. STEP-447 and later entries continue in `phase-8-part-2.md`; this volume remains append-only.
