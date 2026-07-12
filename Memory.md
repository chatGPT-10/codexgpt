# CodexPro Memory Index

This is the concise project-memory index. Complete implementation records are stored in phase archives under `docs/memory/archive/`.

Do not store secrets, complete tokens, private keys, or sensitive source contents here or in the archives.

## Current state

- Date: 2026-07-12.
- Repository: `D:\Dev\codexpro`.
- Branch: `main`.
- Package: `codexpro@0.28.6`.
- Primary platform: native Windows.
- Phase 0: complete.
- Phase 0.5: formally closed on 2026-07-12 after all approved local, remote CI, and real external Cloudflare gates passed.
- Final Phase 0.5 runtime fix: commit `da83f77` pushed to `origin/main` and verified by successful cross-platform CI run `29183635923`.
- Stale CI run `29181286011`: manually cancelled after the replacement run passed.
- Phase 1: not started.

## Approved stopping point

Phase 0.5 is formally closed. All approved local, Ubuntu/Windows CI, and real external Cloudflare Host-forwarding gates passed. Public `https://codexpro.drliang.uk/healthz` reached CodexPro through Cloudflare and passed Host validation before returning the expected authentication-layer `401 Unauthorized`. Phase 1 has not started. Do not begin Phase 1, alter the completed Phase 0.5 baseline, or create further commits/pushes without separate explicit approval.

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

## Phase 0.5 local validation

- `npm ci`: passed; 112 packages installed and 0 vulnerabilities reported.
- `npm audit --audit-level=high`: passed with 0 vulnerabilities.
- Build: passed after the final authentication-alignment changes.
- Complete regression suite after the Doctor fix: 37/37 passed on local Node 24 and 37/37 passed on local Node 20.
- Focused authentication, HTTP security, and package-content suite: 12/12 passed.
- Complete Smoke suite: all 8 sequential sections passed.
- `npm pack --dry-run`: passed with 97 files; website assets and the compatibility shim are included; internal memory archives are excluded.
- Install-script review: no packages with unreviewed install scripts; only `esbuild@0.28.1` is approved.
- Tool verification: `esbuild 0.28.1` and `tsx 4.22.4` execute successfully.
- CodexPro self-test: 7 pass, 0 fail; remaining warnings are expected for standard mode, trusted full Bash, and skipped write/Pro-context probes.
- Authentication static search found no active ChatGPT static-Bearer guidance.
- `git diff --check`: passed; only existing Windows LF-to-CRLF warnings were reported.
- npm HOME remains corrected to `C:\Users\Administrator`; npm cache and userconfig stay outside the repository.
- The pinned Cloudflared `2026.7.1` asset names and SHA-256 values match the reviewed official checksum list.

## Closed-gate evidence and known limitations

- No Phase 0.5 validation gates remain.
- Fresh CI run `29183635923` passed all Ubuntu/Windows Node 20/24 jobs; old run `29181286011` was manually cancelled and is now `completed/cancelled`.
- Real external Cloudflare Host forwarding is validated: the public hostname reached CodexPro through Cloudflare and passed Host validation before returning the expected unauthenticated `401`.
- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.

## Open items

1. Phase 0.5 is closed; preserve the completed baseline.
2. Do not begin Phase 1 without separate explicit approval.
3. When Phase 1 is approved, start with planning only and add one feature at a time.

## Recent steps

- **STEP-044 — Authentication direction:** selected the personal query-token compatibility flow for Phase 0.5 and deferred OAuth 2.1.
- **STEP-045 — Public CLI restoration:** restored the supported default URL-token flow while preserving explicit Bearer-client opt-out.
- **STEP-046 — Documentation alignment:** aligned all public guides and website pages and added URL-secret exposure warnings.
- **STEP-047 — Final local review:** fixed the remaining authentication consistency issues and passed every approved local gate.
- **STEP-048 — Neat-freak cleanup:** removed duplicated historical narration from the active memory index and rule stopping point; no runtime behavior changed.
- **STEP-049 — Phase 0.5 staging:** staged the complete reviewed Phase 0.5 change set with explicit approval; no commit or push was performed.
- **STEP-050 — Staged-diff review:** reviewed the staged change set and reproduced one blocker: public doctor calls without `--root` diagnose the package root instead of the caller workspace.
- **STEP-051 — Doctor workspace fix:** added a failing regression test, propagated the canonical caller root into the legacy Doctor, passed 37/37 regressions and Smoke 8/8, and re-staged the fix.
- **STEP-052 — Local Phase 0.5 commit:** committed the complete reviewed Phase 0.5 change set locally on `main`; no push was performed.
- **STEP-053 — Push Phase 0.5:** pushed commit `82c24da` to `origin/main`; remote CI and real external Cloudflare validation remain pending.
- **STEP-054 — Remote CI inspection:** confirmed the workflow is active but no Actions run/check was created; the repository is a fork and its Actions page reports no workflow runs yet.
- **STEP-055 — Fork workflows enabled:** confirmed enabling workflows did not retroactively create a run for commit `82c24da`; a new approved `main` push is required to trigger CI.
- **STEP-056 — Records-only CI trigger:** committed and pushed only `AGENTS.md`, `Memory.md`, and the Phase 0.5 archive to trigger the first GitHub Actions run after workflows were enabled.
- **STEP-057 — CI status check:** Windows Node 20 and 24 completed successfully; Ubuntu Node 20 and 24 remained in progress at `Regression Tests`, so no final CI conclusion was recorded.
- **STEP-058 — Ubuntu CI hang diagnosis:** confirmed both Ubuntu jobs were stuck for about 82 minutes and traced the likely cause to Linux process-tree cleanup: the test terminates the outer `codexpro-entry.mjs` process while its synchronous legacy CLI child and MCP server descendant can remain alive holding inherited pipes.
- **STEP-059 — Linux test process-tree fix:** made the CLI test a separate POSIX process group, terminates the whole group with `SIGTERM`/`SIGKILL`, added direct cleanup-logic coverage, and passed Node 20/24 regression 38/38 plus Smoke 8/8 before pushing fresh CI.
- **STEP-060 — Push Linux cleanup fix:** pushed commit `da83f77`, which triggered fresh CI run `29183635923`; old run `29181286011` still requires manual cancellation.
- **STEP-061 — Fresh Ubuntu CI verification:** Ubuntu Node 20 and 24 completed successfully in run `29183635923`, confirming the Linux regression-test hang is fixed; Windows Node 20 and 24 remained in Smoke at the stopping point.
- **STEP-062 — Fresh CI complete:** run `29183635923` completed successfully across Ubuntu/Windows and Node 20/24; the remaining Phase 0.5 gate is real external Cloudflare Tunnel validation, while old run `29181286011` still needs manual cancellation.
- **STEP-063 — Cancel stale CI run:** manually cancelled run `29181286011` and verified it is `completed/cancelled`; fresh successful run `29183635923` remains the authoritative CI result.
- **STEP-064 — External Cloudflare validation:** confirmed `codexpro.drliang.uk` resolves through Cloudflare to CodexPro at local port 8787; the public `/healthz` request passed Host validation and returned the expected unauthenticated `401`, so all Phase 0.5 gates are satisfied.
- **STEP-065 — Close Phase 0.5:** formally closed Phase 0.5 after all approved gates passed and committed/pushed the final closure records; Phase 1 remains unstarted.

## Archives

- [Phase 0 and Phase 0.5 — STEP-000 through STEP-065](docs/memory/archive/phase-0-and-0.5.md)

Archive integrity for the pre-migration journal:

- Lines: 1089
- Bytes: 45573
- SHA-256: `b297808452af0cd49311e03f4365d0770a115a119e6db3eeb14966fadb3ad477`

## Memory maintenance protocol

- Root `Memory.md`: edit in place; keep only current state, active decisions, validation, open items, recent summaries, and archive links.
- Target size: no more than 150 lines and 18 KB; hard maximum 200 lines and 25 KB.
- Phase archives: append complete step records; do not silently rewrite existing history.
- At phase completion, close the current archive and create the next phase archive.
- Every meaningful completed step must update this index and append the active phase archive.
- `AGENTS.md` is authoritative for the complete two-layer protocol.
