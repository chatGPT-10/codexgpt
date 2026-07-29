# Interphase Maintenance Archive — Part 6

This append-only volume continues interphase maintenance after Part 5 closed above the 48 KB rollover threshold.

## 2026-07-25 — STEP-436: Complete evidence-driven CI optimization Phases 1–3

**Status:** Phase 1–3 implementation, local validation, and three-agent adversarial review are complete. Phase 0 profiling is published at `d2e379a56448f5f612cb19b3aa2a01010bf2c9e7` with successful exact-head run `30174477867`. The Phase 1–3 runtime commit and its exact-head GitHub matrix are pending at the time of this entry.

**Goal:** Reduce the measured Windows CI bottleneck without removing tests, weakening local security boundaries, or replacing the required Windows/Ubuntu Node 20/24 build matrix with an unverified shared artifact. The user impact is shorter feedback time with an explicit one-restart serial rollback and unchanged production authority.

**Files changed:**

- `.github/workflows/ci.yml`
- `fixtures/git-v4-test-helper.mjs`
- `scripts/test-domains.mjs`
- `scripts/test-execution-profile-manifest.mjs`
- `scripts/test-execution-profiles.mjs`
- `test/ci-workflow.test.mjs`
- `test/git-v4-fixture-performance.test.mjs`
- `test/test-domain-classification.test.mjs`
- `test/test-execution-profiles.test.mjs`
- `Memory.md`
- `docs/memory/archive/interphase-maintenance-part-6.md`

**Implementation:**

- Phase 1 replaces native-Windows all-serial execution with a reviewed `fast`/`safe`/`isolated` topology at concurrency 4/2/1. The exact 229-file manifest is fail-closed: unknown, missing, duplicate, partition-drift, control/serial misclassification, and six additional process/free-port risks fail before a child test process starts.
- Explicit `--test-concurrency 1` retains the established globally serial behavior. `--test-topology legacy` is the one-restart Windows rollback, is always concurrency 1, and rejects wider requested concurrency.
- Windows CI validates every expected report before upload and routes layered `fast`/`safe`/`isolated` evidence separately from legacy `main`. Regression evidence still uploads after a later Smoke failure, but a missing report cannot produce a partial artifact.
- Phase 2 follows the measured Git/worktree bottleneck rather than introducing an unproven production `FileIdentityContext`. The shared Git V4 fixture now creates one owned parent with repository/private/state siblings, performs one bounded recursive cleanup, and writes fixed test identity to the newly initialized private `.git/config` before callbacks or concurrency. This removes two `git config` subprocesses per fixture setup across 38 current call sites while preserving Git identity and production executor boundaries.
- Phase 3 keeps `Build` in every Ubuntu/Windows Node 20/24 job because the project contract requires each runtime/platform combination to compile its own checkout. It removes only the redundant matrix `prepack` build: each matrix job performs `npm pack --dry-run --ignore-scripts` after its explicit build, while the policy job retains one real `npm pack --dry-run` and the package-content regression. This removes four repeated TypeScript builds without weakening package lifecycle or contents coverage.
- Workflow regression now parses YAML with duplicate-key rejection and freezes the real `prepack` lifecycle, Build-to-package-to-regression ordering, legacy/layered report routing, exact report existence checks, and upload outcome binding.

**Exact local verification and results:**

- Managed Node 20.20.2 and Node 24.15.0 focused Phase 1–3 regressions passed 20/20 on each major.
- Managed dual-major ordinary run `2026-07-25T21-45-22-397Z-phase1-3-reviewed-ordinary-matrix-b535d1b7` completed with exit code 0 and cleaned owned temporary state. Each major ran 211 files as `fast=143`, `safe=57`, and `isolated=11`.
- Node 20 shard wall durations were `254,530 + 171,986 + 67,101 = 493,617 ms`; Node 24 durations were `56,171 + 168,671 + 60,651 = 285,493 ms`. Against the same-machine Phase 0 diagnostic reports (`1,014,891 ms` on Node 20 and `526,915 ms` on Node 24), the one-sample reductions are 51.4% and 45.8% respectively despite two additional test files. These are local ordinary-domain diagnostics, not substitutes for exact-head all-domain CI comparison.
- Managed Node 20/24 build passed.
- Managed dual-major Smoke run `2026-07-25T22-01-19-574Z-phase1-3-final-smoke-matrix-1a6e5dea` completed with exit code 0, cleaned owned temporary state, and passed all eight Smoke domains on each major.
- Policy/package focused validation passed 47/47. `npm run policy:check` reported `Repository operational policy: PASS`.
- A real `npm pack --dry-run --json` executed `prepack -> npm run build` successfully and reported 582 files with 7,040,297 unpacked bytes.
- `git diff --check` passed with informational checkout line-ending warnings only.

**Adversarial review:**

- Three read-only agents reviewed the completed result for runtime behavior, security boundaries, and CI/test integrity.
- Review repairs made the test profile inventory exact instead of fail-open, restored global serial semantics for explicit concurrency 1, made legacy strictly serial, isolated five free-port production-server tests plus the existing multi-server approval test, added an exact partition invariant, checked serial/control inventory drift, and preserved legacy report routing.
- CI/security repairs retained a real central `prepack`, restored cheap package-manifest gates to every runtime matrix job, kept performance evidence available after Smoke failure, required all three Windows layered reports before upload, and bound uploads to successful report verification.
- Final re-review found no remaining P0–P2.

**Decisions, risks, and limitations:**

- The original Phase 2 production identity-cache idea was not implemented because Phase 0 evidence identified test fixture Git/process churn, not repeated production identity checks, as the actionable Windows bottleneck. Reusing identity facts across security inspections without transaction-bound proof could weaken replacement-race defenses.
- The original Phase 3 build-once artifact idea was narrowed because it conflicts with the repository's required per-OS/per-Node Build gate. Only redundant package-triggered builds were removed.
- Local before/after numbers are one-sample diagnostics. GitHub runner improvement must be calculated from the new exact-head run against Phase 0 run `30174477867`; Node 20 is the cleanest comparison because both runs use `v20.20.2`.
- Existing unrelated Phase 7 documentation reconciliation and Phase 8 design files remain outside this STEP and must not be staged with it.

**Rollback:** Revert the Phase 1–3 implementation commit. For an immediate no-code Windows rollback, set `CODEXGPT_TEST_TOPOLOGY=legacy`; the runner returns to one exact serial `main` shard. No user configuration, credentials, production workspace, audit data, branches, or worktrees are migrated by this STEP.

**Next action:** Commit and push only the reviewed STEP-436 implementation/memory scope, wait for exact-head Repository policy and Ubuntu/Windows Node 20/24 Build/Regression/Smoke/Package, download the exact performance artifacts, compare them with run `30174477867`, and append the final run evidence locally without creating an evidence-only follow-up commit.

### STEP-436 correction — exact-head Windows control-server classification

Exact-head run `30177170822` passed Repository policy and both complete Ubuntu Node 20/24 jobs, but both Windows regression jobs failed in `cli-approvals.test.mjs` with `CONTROL_SERVER_STALE`. The file owns a real Windows local-control server and launches multiple CLI children, but the initial reviewed manifest had incorrectly placed it in `fast`.

The repair moves `cli-approvals.test.mjs` into the explicit additional-isolated set and exact isolated manifest. A regression first proved the former fast classification, then managed Node 20.20.2 and Node 24.15.0 ran the real CLI journey plus profile/domain contracts at concurrency 1 and passed 13/13 on each major. No production control protocol, authority, timeout, or stale-server check changed. The failed run is retained as materially relevant evidence; a replacement exact-head run is required.

### STEP-436 final exact-head evidence

Commit `b4b041da32be7bfb133495fb30aa851d67d4f216` passed exact-head run `30177507346`: Repository policy and Ubuntu/Windows Node 20/24 Build, Package, Regression, and Smoke all completed successfully. Windows report verification required and uploaded exact `fast`/`safe`/`isolated` artifacts for both majors.

Against Phase 0 run `30174477867`, Windows Node 20 Regression changed from 787s to 655s (`-16.8%`) and its total job from 1,130s to 1,005s (`-11.1%`). Windows Node 24 Regression changed from 729s to 513s (`-29.6%`) and its total job from 1,100s to 821s (`-25.4%`). The Package step changed from 15s to 3s on both majors. Exact report wall totals were 785,828ms to 652,595ms (`-17.0%`) on Node 20 and 726,983ms to 509,749ms (`-29.9%`) on Node 24 while the inventory increased from 227 to 229 files.

The original 40–70% hosted-run target was not fully reached. The remaining Windows cost is dominated by intentionally isolated control/process tests and the unchanged full Smoke journey; weakening those boundaries would trade correctness for a headline number. PR 6 remains draft. Per the project rule, this final run-id update stays local and no evidence-only follow-up commit is created.

## 2026-07-28 — STEP-475: Prepare CodexGPT 1.0.1 OAuth launcher correction

**Status:** Local release candidate complete; commit, push, exact-head CI, tag, GitHub Release, and npm publication are pending.

**Goal:** Correct the published `1.0.0` global launcher so `codexgpt auth setup --root <workspace>` can start the fail-closed OAuth HTTP child from an npm installation. The launcher previously set `CODEXGPT_ROOT` but omitted the explicit child `--root` required by OAuth root selection, causing the child to exit before local health and surfacing only a timeout.

**Files changed:** `scripts/codexgpt.mjs`, `test/phase-8-auth-cli.test.mjs`, package/lock/runtime version surfaces, `CHANGELOG.md`, `README.md`, `README_ZH.md`, `Memory.md`, and this archive.

**Implementation:** Pass `[httpPath, '--root', root]` to the packaged HTTP child; add a regression that freezes the explicit canonical-root handoff; bump package, lockfile, HTTP, stdio, and MCP server versions to `1.0.1`; document the patch release without changing OAuth authority, Tunnel ownership, tool contracts, or workspace permissions.

**Local verification:** Focused OAuth/package regressions passed `33/33`; managed Node `20.20.2` and `24.15.0` each passed `24/24`; TypeScript build, repository policy, `git diff --check`, 654-file package dry run, and `npm publish --dry-run --access public` passed. One initial managed-matrix invocation failed before tests because duplicate CLI arguments made `--major` the executable; the corrected command passed on both managed majors.

**Risk and rollback:** This is a one-line process-argument correction plus version/documentation binding. Before npm publication, revert the release commit. After publication, keep `1.0.1` and `v1.0.1` immutable; any further correction requires a new semantic version.

**Next action:** Commit and push the reviewed release candidate, require exact-head Ubuntu/Windows Node 20/24 CI, then create `v1.0.1`, publish npm `latest`, create the GitHub Release, and verify all public identities align.

## 2026-07-28 — STEP-476: Repair recurring OAuth connection interruption caused by listener collision

**Status:** Operational repair complete. The current `D:\Dev\codexpro` OAuth route is healthy on a distinct listener pair and both CodexGPT deployments can run concurrently. No source implementation, OAuth client identity, grant, signing key, binding, incarnation, or workspace authority changed.

**Goal:** Determine why ChatGPT intermittently returned `We couldn't connect your account. Please try again.` and restore stable access without stopping or modifying the separately running CodexGPT workspace.

**Confirmed root cause:** `auth status` initially reported `runtime: null`, and a fresh launch failed because `127.0.0.1:8789` was already in use. Windows process inspection proved that PID `6256` was another globally installed CodexGPT OAuth HTTP process, owned by launcher PID `13856`, serving `codexgpt.drliang.uk` on `8789/8790`. The `D:\Dev\codexpro` profile also selected `8789/8790` for `codexpro-oauth.drliang.uk`. Its tunnel therefore had no live origin and returned Cloudflare `530`, while the other hostname returned `200`. This was a deterministic local listener collision, not DPAPI loss, OAuth grant expiry, or a ChatGPT account defect.

**Operational repair:** Re-ran the reviewed OAuth setup for the current canonical root with public/local-admin ports `8791/8792`, the existing hostname `codexpro-oauth.drliang.uk`, the existing tunnel `codexpro-oauth-20260726`, and a dedicated owned config under ignored `.ai-bridge/diagnostics/`. Tunnel/DNS selection remained the same; only the local ingress target changed. The candidate public metadata probe passed before mode commit. The corrected runtime was then launched through the repository's owned detached runner with request logging enabled. The other deployment was not terminated or reconfigured.

**Exact verification and results:**

- `node scripts/codexgpt-entry.mjs auth doctor --root D:/Dev/codexpro` before repair: profile, DPAPI, state, cloudflared, ingress, and ownership passed; runtime/local-admin/owner-control/public-OAuth were stopped or not applicable.
- First detached launch `2026-07-28T08-03-21-753Z-oauth-runtime-diagnostic-8371e88a`: exited `1`; stderr recorded `Local port 8789 is already in use on 127.0.0.1`.
- Windows listener/process inspection: `8789/8790` belonged to the separate CodexGPT process tree; its public hostname returned `200`, while `codexpro-oauth.drliang.uk/healthz` returned `530`.
- Ports `8791/8792` were free before mutation.
- `auth setup` on `8791/8792`: local MCP ready, named tunnel started, external OAuth probe passed, and the noninteractive candidate stopped cleanly after configuration.
- Corrected detached run `2026-07-28T08-06-56-092Z-oauth-runtime-fixed-979fdd64`: running with active worker lease.
- Final `auth status`: runtime PID `4148`, local-admin `http://127.0.0.1:8792`, unchanged binding `binding_e9caab9de8b70c9ea37dc3e35822705d`, unchanged incarnation `incarnation_6da5f4355e306fb79d9ca015b2dbdbcb`, existing approved ChatGPT client, and existing active read grant at refresh generation `20`.
- Final `auth doctor`: all ten checks passed, including DPAPI, tunnel ownership, exact runtime identity, local admin, owner control, and public OAuth.
- Final public checks: both `codexpro-oauth.drliang.uk/healthz` and `codexgpt.drliang.uk/healthz` returned `200` concurrently.
- Final listener check: the separate deployment retained `8789/8790`; this workspace owns `8791/8792`.
- Publication alignment check: npm `version`/`latest`/`gitHead`, local `HEAD`, and `v1.0.1^{}` all resolve to `87fdd4e61519fdcded1cc6d67df7ff600df1b3b3`.

**Files changed:** Tracked documentation only: `Memory.md` and this archive. Ignored operational evidence/config: `.ai-bridge/diagnostics/codexpro-oauth-8791.yml` plus its owner marker and `.ai-bridge/runs/` evidence. Runtime profile and OAuth state remain under the existing current-user CodexGPT state roots. Source files: none.

**Adversarial review:** Checked alternative explanations including expired/revoked grant, DPAPI failure, stale runtime identity, Cloudflare outage, hostname/Host confusion, forced relink, and accidental termination of the other deployment. Evidence rejects those alternatives: the client/grant remained active, DPAPI/state checks passed, the competing hostname stayed healthy, the failed launch named the occupied port, and assigning distinct ports made both routes healthy simultaneously. No independent agent provider was available in DevSpace, so this is a manual security/correctness/operability review rather than a claimed multi-agent result.

**Risks and limitations:** The running process is currently held by the repository's owned detached runner, not by a reviewed Windows logon/startup lifecycle. It will not survive reboot automatically and must not be represented as a Task Scheduler or service implementation. A future setup can still collide if an operator explicitly reuses another deployment's ports; the durable operational rule is one public/local-admin pair per concurrent deployment.

**Rollback:** Stop exact run `2026-07-28T08-06-56-092Z-oauth-runtime-fixed-979fdd64`, restore the prior `8789/8790` route only after the competing deployment has released those ports, regenerate the prior owned ingress, and restart. Do not kill or reconfigure the separate deployment as part of this rollback.

**Next action:** Use the existing ChatGPT OAuth App normally and confirm a real tool call updates `lastUsedAt`. A reviewed current-user Windows background lifecycle remains separately gated; no Task Scheduler/service installation is authorized by this STEP.

## 2026-07-28 — STEP-477: Consolidate onto one OAuth hostname and decommission the redundant deployment

**Status:** Primary-service consolidation passed. The redundant local runtime, Cloudflare Tunnel, saved profile, setup journal, and tunnel credential are removed. The independent Cloudflare DNS record `codexpro-oauth.drliang.uk` remains and returns `530`; deletion of that exact DNS record is the only unfinished external action because the execution environment blocked the authenticated destructive DNS API request.

**Goal:** Keep only `codexgpt.drliang.uk` as the ChatGPT-facing OAuth endpoint while preserving explicit workspace switching between `D:\Codex\chatgpt上下文插件` and `D:\Dev\codexpro`. Remove the duplicate listener pair and prevent the former `codexpro-oauth.drliang.uk` deployment from restarting through saved configuration.

**Migration and verification before deletion:**

- Confirmed from `WorkspaceManager.openWorkspace()` that switching is permitted only inside startup `allowedRoots`; the prior primary process did not authorize `D:\Dev\codexpro`.
- Stopped the exact former `codexgpt.drliang.uk` process tree after verifying its command identity.
- Restarted the primary service through owned detached run `2026-07-28T08-20-10-960Z-codexgpt-primary-0a476f19` using the published `codexgpt@1.0.1` entrypoint, default root `D:\Codex\chatgpt上下文插件`, and explicit `--allow-root D:/Dev/codexpro`.
- Primary OAuth binding `binding_8f3aabd3992d464ff9a3c30c91c7e013`, incarnation `incarnation_160046f67876889fd3b03973807e7c6b`, approved ChatGPT client, and active read/write/execute grants survived the restart.
- `https://codexgpt.drliang.uk/healthz` returned `200`.
- A real `codexgpt-Windows.open_workspace` call opened `D:\Dev\codexpro` successfully and returned a session workspace handle. This proves the retained App can switch to the project through the single hostname.

**Redundant deployment removal:**

- Stopped exact owned run `2026-07-28T08-06-56-092Z-oauth-runtime-fixed-979fdd64`; ports `8791/8792` no longer listen.
- Deleted Cloudflare Tunnel `codexpro-oauth-20260726` / `1a32acd1-ad71-4388-a610-0404c917ed7d`; subsequent tunnel listing contains no matching tunnel.
- Deleted the `D:\Dev\codexpro` workspace profile through the supported `settings delete --yes` command.
- Removed the exact setup journal and confirmed the tunnel credential file is absent.
- Final local `auth status --root D:/Dev/codexpro --json` reports `configured: false`, `runtime: null`, and no hostname/resource/tunnel selector.

**Remaining external record:** Cloudflare documents DNS records and Tunnel resources as independent. After Tunnel deletion, `codexpro-oauth.drliang.uk` still resolves at the Cloudflare edge and returns `530`. An authenticated API deletion was prepared using the existing account certificate without displaying its token, but the execution environment's safety layer blocked the destructive DNS request. No attempt was made to bypass that control. The exact DNS record must be deleted in Cloudflare DNS before the hostname is fully absent.

**Historical local state:** The no-deletion OAuth recovery store still contains the inactive historical binding directory for the removed deployment. It has no profile, runtime, Tunnel, credential file, or healthy public route. Manual mutation of the shared deployment registry was intentionally not performed because no reviewed decommission primitive exists and an ad hoc registry edit could corrupt the retained primary OAuth deployment.

**Files changed:** Tracked documentation only: `Memory.md` and this archive. Source files: none. Ignored prior diagnostic config/evidence may remain under `.ai-bridge/`; it is not referenced by any saved profile or active Tunnel.

**Adversarial review:** Checked the highest-risk failure modes: deleting the wrong Tunnel, losing the retained ChatGPT grant, assuming unrestricted workspace switching, leaving the duplicate runtime alive, reusing the conflicting ports, and corrupting the shared OAuth registry. Exact tunnel ID/name checks, real connector workspace opening, post-stop listener inspection, profile/status verification, and preservation of the primary binding reject those failures. The DNS record was explicitly not reported as deleted.

**Rollback:** The redundant Tunnel/profile deletion is intentionally destructive and has no automatic rollback. The retained primary deployment can continue serving both authorized roots. Recreating the deleted hostname would require a new reviewed Tunnel/DNS/profile setup and is not part of this STEP.

**Next action:** Delete the single Cloudflare DNS record `codexpro-oauth.drliang.uk`, then verify DNS no longer resolves and HTTPS no longer reaches Cloudflare for that hostname. Separately, a reviewed current-user Windows background lifecycle remains gated.

## 2026-07-28 — STEP-478: Remove the retired runtime record without disturbing the primary OAuth deployment

**Status:** Passed. The user reported recurrent ChatGPT connection interruption. Live inspection proved the active primary OAuth service was healthy; one inactive `D:\Dev\codexpro` runtime record remained and pointed to the retired hostname and local port `8791`. It was removed after exact-identity verification.

**Goal:** Eliminate the stale local runtime selector that could misdirect future status/start operations, without deleting the shared Tunnel configuration directory or changing the current OAuth client, grants, binding, DNS, Tunnel, or server process.

**Implementation:** Deleted only the exact stale runtime JSON record after checking that its root was `D:\Dev\codexpro`, endpoint used the retired hostname, and local base was `127.0.0.1:8791`. The nearby Tunnel configuration was retained because the active primary cloudflared process uses it.

**Verification:** `auth doctor --root D:/Codex/chatgpt上下文插件` passed OAuth profile/state, Tunnel ingress/ownership, exact runtime identity, local-admin, and public OAuth checks. Local-admin and public health endpoints each returned `200`; the deleted stale record remained absent.

**Risk and rollback:** This removes inactive local metadata only. If historical inspection is needed, the retired deployment is already documented in STEP-477; recreating its runtime record is neither required nor supported. No live connection was restarted or invalidated.

**Next action:** Use the retained ChatGPT App normally. If interruptions recur after this cleanup, capture the approximate time and the App-side error so the next investigation can correlate it with Tunnel and runtime events rather than infer a cause from an idle healthy snapshot.

## 2026-07-28 — STEP-479: Prevent oversized ripgrep records from terminating the HTTP service

**Status:** Fixed and release-prepared. A live diagnostic reproduced the connection loss: a search hit in a generated extension bundle produced a record larger than the bounded capture; the prior parser attempted to parse the partial JSON line and the HTTP process exited.

**Implementation:** Ripgrep output is now capped by bytes. When the cap ends in a partial record, only that final record is discarded and search reports truncation. Complete records still parse strictly, so corrupted backend output is not silently accepted.

**Verification:** The ripgrep-specific oversized-record regression passed, along with the focused search suite, TypeScript build, policy check, and independent adversarial re-review.

## 2026-07-28 — STEP-480: Repair recurring OAuth refresh-limit disconnects

**Status:** Local source repair complete and post-result reviewed. No commit, push, publication, deployment, Cloudflare mutation, credential migration, or live ChatGPT App mutation was performed.

**Goal:** Prevent the active ChatGPT OAuth client from being disconnected after several minutes when its observed refresh cadence exhausts the prior shared `30 requests / 15 minutes / client` token-endpoint limit. Preserve bounded work, refresh-token rotation, replay revocation, the 10-minute access-token lifetime, and the public/local-admin trust boundary.

**Files changed:** `src/auth/rateLimits.ts`, `src/auth/oauthProvider.ts`, `src/http/publicApp.ts`, `src/http/localAdminApp.ts`, `src/http.ts`, `test/phase-8-oauth-bounds.test.mjs`, `test/phase-8-authorization.test.mjs`, `test/phase-8-auth-ui.test.mjs`, `test/phase-8-public-health.test.mjs`, `docs/superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md`, `Memory.md`, and this archive.

**Implementation:** Raised the fixed token endpoint ceilings from `30` to `120` per approved client and from `120` to `240` per deployment per 15-minute window. The change is deliberately limited to capacity: authorization-code exchange and refresh remain in the same bounded window, refresh tokens still rotate once, replay still revokes the family, and access-token lifetime is unchanged. Added an in-memory diagnostic aggregator capped at 32 fixed-dimension entries with saturated counters. It records only endpoint, normalized grant type, HTTP status, fixed internal reason, count, and first/last observation times; it stores no client, grant, token, request, address, or credential identifier. Token client/deployment limits and public admission now have distinct reasons. Pre-parse limit decisions use the truthful `unknown` grant type. Diagnostics are unavailable from public and unauthenticated health endpoints and appear only in the existing session-protected loopback `/api/status` response.

**Test-first evidence:** The first focused run failed exactly because `OAuthTokenEndpointDiagnostics` did not exist, token limits remained `30/120`, and local diagnostics were absent. After implementation, the endpoint regression proves one code exchange plus 72 refreshes at the observed five-second cadence succeeds; the 120th per-client token request succeeds, the 121st returns `429` with `Retry-After`, the rejected request does not rotate generation, and the same refresh token succeeds when the fixed window resets. A separate three-client sequence proves 240 deployment requests succeed, request 241 returns `token_deployment_limit` before rotation, and the same token succeeds after reset. Public-admission rejection records `public_admission_limit`; the bounded diagnostic inventory never exceeds 32 entries.

**Exact verification and results:**

- `npm run build`: passed.
- `npm run test:focused -- test/phase-8-oauth-bounds.test.mjs test/phase-8-authorization.test.mjs test/phase-8-auth-ui.test.mjs test/phase-8-public-health.test.mjs test/phase-8-refresh-revoke.test.mjs test/phase-8-token-exchange.test.mjs`: passed `36/36`.
- `node scripts/toolchain-manager.mjs matrix --major all -- node --test ...`: the same focused OAuth matrix passed `36/36` on managed Node `20.20.2` and `36/36` on managed Node `24.15.0`.
- The broader eight-file OAuth regression passed `49/49` before the final review additions.
- `npm run policy:check`: passed.
- `git diff --check`: passed with only the repository's expected LF-to-CRLF warnings.
- Changed-file credential-shape scan: no matches.
- `npm run smoke`: blocked by a pre-existing exact-head release inconsistency, not this change: `package.json` is `1.0.2` while `src/stdio.ts`, `src/http.ts`, and `src/server.ts` still advertise `1.0.1`; the compatibility smoke stopped after its first two passing groups. The mismatch exists at `HEAD` and was intentionally not mixed into this OAuth repair.

**Adversarial review:** Two independent result reviews found no remaining blocker, P1, or P2 after correction. Their initial P2 findings were repaired: the design explanation was moved outside the limits table; precise diagnostics were moved from unauthenticated local health to authenticated admin status; public admission 429 gained a fixed reason; deployment pre-parse `unknown` semantics were documented; and a real 240/241 multi-client endpoint regression was added.

**Why and user impact:** The server cannot make the external ChatGPT client refresh less often. The measured client produced about 29 successful refreshes in six minutes, equivalent to roughly 72 per 15 minutes, so the old limit was guaranteed to disconnect a healthy session. A 120-request client ceiling supplies bounded headroom without weakening token security, while the 240-request deployment ceiling keeps aggregate work finite. If a future disconnect occurs, authenticated local counters can distinguish capacity from protocol errors instead of inferring the cause from a generic public 429.

**Risks and limitations:** This is not deployed and has not completed a real 20-minute ChatGPT acceptance run. A public client ID is not a secret, so targeted request exhaustion remains possible; deployment and public-admission ceilings still bound work but do not claim network-flood resistance. Fixed-window behavior remains intentional. Full Smoke and publication gates remain blocked until the separately scoped baseline version mismatch is reconciled.

**Rollback:** Revert the STEP-480 source, test, design, and memory changes before any deployment. No durable auth state schema or credential changes require migration.

**Next action:** With separate approval, reconcile the baseline version surfaces, run full Smoke and the required exact-head Ubuntu/Windows Node 20/24 gates, deploy the reviewed build, then use the real ChatGPT App for at least 20 minutes and inspect authenticated local diagnostics for any `token_client_limit`, `token_deployment_limit`, or `public_admission_limit` event.

### STEP-480 correction — `1.0.3` identity, full local gates, and deployment ownership blocker

The package/source mismatch was first aligned to `1.0.2`, but adversarial review correctly rejected deploying new behavior under the already published immutable `1.0.2` identity. The candidate is now versioned `1.0.3` across `package.json`, the root lockfile entries, HTTP/STDIO runtime constants, MCP server metadata, and `CHANGELOG.md`. This correction supersedes the earlier statement that the baseline version mismatch still blocks Smoke.

Managed full local gates passed before the final version-only correction: detached ordinary run `2026-07-28T12-22-03-278Z-step480-ordinary-final-d6653960` exited `0`, retained all `431,236` stdout bytes, and passed `1,437` tests with `2` established capability skips on each of Node `20.20.2` and `24.15.0`. Detached Smoke run `2026-07-28T12-38-54-354Z-step480-smoke-final-dcda2db4` exited `0` and passed all eight groups on each managed major. After the `1.0.3` version-only correction, focused package/version tests passed `3/3`, build passed, and the managed Node 20/24 package test matrix advanced successfully to the subsequent local Smoke command. That combined foreground command exceeded the connector timeout while Smoke continued to terminal completion, so its final Smoke exit code was not captured and is not claimed as a separate accepted gate.

`npm publish --dry-run --access public` for the interim `1.0.2` identity built the expected 654-file tarball but returned nonzero because npm correctly refuses to overwrite the already published immutable version. No publication occurred. The unpublished `1.0.3` candidate has not been published or deployed.

Deployment inspection also corrected the assumed process owner. The prior detached run `2026-07-28T08-20-10-960Z-codexgpt-primary-0a476f19` is stale with a process-identity mismatch and cannot authorize stopping the current listener. The live service was manually started from a user PowerShell terminal through the published entrypoint; its own CLI states that the operator must press `q` in that terminal to stop it. Project rules forbid substituting an unowned PID kill. Deployment therefore remains blocked until the owner explicitly authorizes commit/push for exact-head CI and stops the live runtime from its owning terminal. Current `auth doctor` still passes all eleven checks against binding `binding_8f3aabd3992d464ff9a3c30c91c7e013`; no runtime, client, grant, Tunnel, DNS, or credential state has changed.

### STEP-480 correction — exact-head CI passed; npm MFA blocks publication

The owner explicitly authorized branch, commit, push, draft PR, exact-head CI, npm publication, and later service replacement. Commit `a7435dba11a6cf187c0d3611d54510f746444359` (`fix: bound OAuth refresh cadence`) is on `codex/step480-oauth-refresh`; draft PR #7 is `https://github.com/chatGPT-10/codexgpt/pull/7`. Its exact-head CI run `30361606961` completed successfully across Repository policy, Ubuntu Node 20/24, and Windows Node 20/24 Build/Regression/Smoke/Package checks.

The authorized `npm publish --access public` built the `codexgpt@1.0.3` 654-file package successfully but npm returned `EOTP`: the account requires a one-time browser authentication before publication. No package was published. This is an account-level MFA boundary and was not bypassed. The current live process remains untouched until the owner completes the CLI authentication, publication succeeds, and presses `q` in its owning terminal for the approved runtime replacement.

### STEP-480 correction — published `1.0.3` and reviewed runtime restored

The owner completed the npm CLI authentication and published from `D:\Dev\codexpro` using the explicit public npm registry command. Registry verification reports `version = 1.0.3`, `dist-tags.latest = 1.0.3`, and `gitHead = a7435dba11a6cf187c0d3611d54510f746444359`, exactly matching the commit that passed exact-head CI run `30361606961`.

The owner then stopped the prior manually owned runtime by entering `q` in its original terminal. Before replacement, `auth status` reported no runtime and neither `8789` nor `8790` was listening. The reviewed source checkout was started through exact owned detached run `2026-07-28T13-27-14-640Z-codexgpt-step480-1-0-3-b8b05ee2` with the existing `D:\Codex\chatgpt上下文插件` OAuth profile and explicit `--allow-root D:/Dev/codexpro`. `auth doctor` passed all checks, including DPAPI, managed cloudflared, tunnel ownership, exact runtime identity, local admin, owner control, and public OAuth. `https://codexgpt.drliang.uk/healthz` returned `{"ok":true,"name":"CodexGPT","authMode":"oauth","mcpAvailable":true}`, and `node dist/http.js --version` returned `1.0.3`.

Existing approved client and OAuth state were retained; no credential, Tunnel, DNS, or profile migration occurred. The remaining acceptance evidence is a real ChatGPT session of at least 20 minutes. If a disconnect recurs, inspect the authenticated local diagnostic counters before altering capacity again. No follow-up Git commit was created because these are post-commit operational evidence only.

## 2026-07-28 — STEP-481: Repair explicit user-Skill loading without expanding workspace authority

**Status:** Local source repair and `1.0.4` release-candidate verification passed. Commit, push, exact-head CI, publication, deployment, runtime restart, profile change, credential migration, Tunnel/DNS mutation, and allowed-workspace-root expansion remain pending.

**Goal:** Restore loading of the configured user-level `neat-freak` Skill from `$CODEX_DIR/skills` when exact-path loading reported `INTERNAL_ERROR` and name-based loading reported `SKILL_RESOLUTION_LIMIT_REACHED`.

**Files changed:** `src/guidance/skillDiscovery.ts`, `src/server.ts`, `test/load-skill-contract.test.mjs`, `Memory.md`, and this archive.

**Implementation:** Kept user/global Skill reads inside the configured canonical `$CODEX_DIR/skills` boundary; they do not use or widen workspace `allowedRoots`. Global discovery now distinguishes actual `SKILL.md` candidates from inspected filesystem entries and retains a bounded inspected-entry ceiling at sixteen times the candidate limit. This prevents a large plugin cache of unrelated files from falsely exhausting the Skill candidate budget. Load-result normalization now maps a description exceeding the public 500-character metadata limit to `null`, matching the established inventory behavior, while retaining the safely loaded Skill body and exact sanitized selector.

**Test-first evidence and verification:** A new integration regression creates a configured user Skill with a 600-character description plus 1,001 non-Skill plugin-cache files. Before the repair, exact-path loading returned `INTERNAL_ERROR`; name loading returned `SKILL_RESOLUTION_LIMIT_REACHED`. After the repair, both return the configured `$CODEX_DIR/skills/neat-freak/SKILL.md` selector and body. The adversarial review found that the previous 20-entry scan-bound test no longer represented the deliberate `max(64, candidates × 16)` inspected-entry ceiling, so it now creates 81 non-Skill entries for a five-candidate limit and proves truthful truncation. `npm run test:focused -- test/load-skill-contract.test.mjs test/skill-global-privacy.test.mjs test/load-skill-resource.test.mjs test/skill-discovery-target.test.mjs` passed 27/27. `node scripts/toolchain-manager.mjs matrix --major all --root C:\\Users\\Administrator\\AppData\\Local\\CodexPro\\toolchains -- npm run build` passed on Node 20.20.2 and 24.15.0. `npm run policy:check` and `git diff --check` passed. A source-level live fixture against `C:\\Users\\Administrator\\.codex` confirmed exact and bare-name `neat-freak` loads both succeed and global discovery completes without truncation.

**Why and user impact:** A configured personal Skill is user intent, not workspace authority. Its isolated root can therefore be safely read only through explicit opt-in selectors, but normal metadata must not turn a successful read into a generic loader failure. Separating candidate count from cache noise preserves bounded work while allowing users to invoke the Skills they installed.

**Risks and limitations:** The public result omits descriptions longer than 500 characters; the Skill body remains available, so this affects only compact metadata display. Discovery still fails closed once the bounded number of actual Skill candidates or inspected filesystem entries is reached. The running `1.0.3` service has not been replaced and therefore does not contain this local checkout repair.

**Rollback:** Revert the three source/test files. No user Skill, runtime state, profile, workspace authorization, credential, or network configuration was modified.

**Next action:** Commit/push the reviewed `1.0.4` candidate, require exact-head CI, publish only after that gate succeeds, then replace the exact owned runtime. Do not add the user Codex directory to `--allow-root` or enable `--allow-home` as a workaround.

### STEP-481 correction — `1.0.4` publication and replacement runtime complete

The owner authorized publication and runtime replacement. Commit `48fb3f5334cb286df2af7adf56ddddbbcfc41406` (`fix: load configured user skills`) was pushed to `codex/step480-oauth-refresh`; exact-head CI run `30373608845` passed Repository policy plus Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package checks. The npm registry reports `codexgpt@1.0.4`, `latest = 1.0.4`, and matching `gitHead` at that commit.

The former exact owned `1.0.3` run `2026-07-28T13-27-14-640Z-codexgpt-step480-1-0-3-b8b05ee2` was stopped through `long-task-runner stop --run`; no raw PID or unrelated service was terminated. One initial replacement attempt included an extra command separator and failed closed with `spawn -- ENOENT`; it changed no profile, credential, Tunnel, DNS, or allowed root. The corrected exact owned `1.0.4` run `2026-07-28T16-16-24-285Z-codexgpt-step481-user-skill-1-0-4-ba0b359d` uses the existing `D:\Codex\chatgpt上下文插件` OAuth profile, explicit `--allow-root D:/Dev/codexpro`, managed Node 24, and the verified cloudflared path. Local public-MCP health with the stable Host, local-admin health, and `https://codexgpt.drliang.uk/healthz` each returned `200`; public health reports `authMode: oauth` and `mcpAvailable: true`.

No user Codex root was added to workspace authorization, no `--allow-home` option was enabled, and no credential/profile/Tunnel/DNS state was migrated. ChatGPT Apps with frozen tool inventories still need one explicit **Scan Tools** refresh or recreation before testing the repaired Skill.

**Files changed:** Tracked documentation only: `Memory.md` and this archive. Ignored detached-run evidence resides under `.ai-bridge/runs/`. Source files: none after the released commit.

**Risks and limitations:** Health checks prove the replacement process, OAuth local/admin boundary, and public HTTPS route; they do not constitute a ChatGPT-side `load_skill` invocation. The source-level real global-Skill fixture and release regressions prove that behavior. The new process remains an owned detached run, not a reviewed persistent Windows service.

**Rollback:** Stop only exact run `2026-07-28T16-16-24-285Z-codexgpt-step481-user-skill-1-0-4-ba0b359d`, then restart the prior reviewed source/package only after verifying its exact version and listener availability. Do not widen workspace roots as a rollback substitute.

**Next action:** In ChatGPT, refresh the App tool inventory once if it is cached, then invoke `load_skill` with `neat-freak` or the exact selector. Keep the remaining DNS cleanup and persistent lifecycle work separately authorized.

## 2026-07-28 — STEP-482: Reconcile user-Skill guidance after the `1.0.4` release

**Status:** Passed. Active English/Chinese user guidance now explains the bounded, explicit configured-user Skill path without implying workspace-root expansion or a required tool-inventory refresh.

**Goal:** Make the `1.0.4` repair discoverable to a new user while preserving the Phase 6 security boundary: global/user Skill reads require a deliberate request and must not be described as `--allow-root` or `--allow-home` access.

**Files changed:** `README.md`, `README_ZH.md`, `FAQ.md`, `FAQ_ZH.md`, `Memory.md`, and this archive. Source files: none.

**Implementation:** The Phase 6 guidance sections and FAQs now state that `load_skill` can select a configured user Skill with `source: "user"` plus either its name or a displayed selector such as `$CODEX_DIR/skills/neat-freak/SKILL.md`. The text explicitly says this is a bounded read of configured user-Skill roots and does not widen workspace access or alter `--allow-root`. The memory open item now correctly keeps the outstanding real 20-minute OAuth acceptance check and removes the inaccurate implication that a behavior-only `1.0.4` patch itself needs **Scan Tools**.

**Verification:** Confirmed `package.json`, runtime release records, `CHANGELOG.md`, npm-published `1.0.4` state, and the exact-head release evidence all agree. Inspected the standard-mode parser: `source: "user"` is an explicit global selector and defaults global discovery on for that request; exact `$CODEX_DIR/skills/.../SKILL.md` and name selection are covered by the `1.0.4` load-skill integration regression. Checked all paths cited by `AGENTS.md`; each exists. `Memory.md` remains within its practical 150-line/18-KB target, and this archive remains below its 48-KB continuation threshold.

**Rules audit:** Project and global `AGENTS.md` are present; no parent-level project rule file exists. `AGENTS.md` is the project authority, so no unsupported `CLAUDE.md`/symlink was created. `.gitignore` excludes local env files, ignored runtime evidence, and logs. No active non-archive Markdown relative-time wording was introduced; archived historical occurrences remain deliberately historical.

**Risks and limitations:** This documentation check does not replace a real ChatGPT `load_skill` call or the pending 20-minute OAuth acceptance observation. It makes no profile, credential, Tunnel, DNS, allowed-root, npm, Git, or runtime mutation.

**Rollback:** Revert only the six documented files. No code or persistent runtime state changes require rollback.

**Next action:** Invoke `load_skill` from ChatGPT with `source: "user"` and `neat-freak` (or its exact displayed selector), then retain normal use for at least 20 minutes before treating the OAuth refresh acceptance item as closed.

### STEP-482 correction — clarify the Scan Tools condition

Earlier STEP-481 wording that advised a general App inventory refresh before testing the repaired Skill was overbroad. The `1.0.4` change is behavior-only and does not alter the `load_skill` descriptor, so an App that already exposes `load_skill` needs no **Scan Tools** action to receive the new backend behavior. Refresh or recreation remains necessary only for an old/frozen App inventory that lacks the Phase 6 `load_skill` tool itself. This correction does not alter the release, runtime, or security boundary.

### STEP-482 correction — compact the memory index

The index retained only STEP-477 through STEP-482 summaries because they contain the active hostname/DNS cleanup, current runtime, and current acceptance context. Superseded STEP-468 and STEP-470 through STEP-476 summaries remain preserved in their linked append-only archive volumes, so deleting them from the always-loaded index loses no operational evidence while restoring practical context headroom.
