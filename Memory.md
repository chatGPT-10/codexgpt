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
- Phase 0.5 implementation and final local Windows review: complete.
- Complete Phase 0.5 change set: commit `82c24da` pushed to `origin/main`.
- Staged-diff review blocker: fixed, regression-tested, and included in the pushed commit.
- Phase 1: not started.

## Approved stopping point

Commit `82c24da` is on `origin/main`, workflows are enabled for the fork, and a records-only follow-up commit has been pushed to trigger CI. Do not stage, commit, push, or begin Phase 1 without further explicit approval. The next step is to verify all Ubuntu and Windows CI jobs from that records-only push; real external Cloudflare Tunnel validation remains separately required before Phase 0.5 can close.

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

## Remaining validation and limitations

- GitHub recognizes `.github/workflows/ci.yml` as an active workflow, but commit `82c24da` has no workflow run, no GitHub Actions check run, and the Actions page says there are no workflow runs yet.
- Real external Cloudflare Host forwarding remains unvalidated.
- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs are version-checked but are not re-hashed during later `ensure/status` operations.

## Open items

1. Verify all Ubuntu and Windows jobs triggered by the records-only push.
2. Validate the real external Cloudflare Tunnel Host forwarding path.
3. Only after both validations pass may Phase 0.5 close or Phase 1 begin.

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

## Archives

- [Phase 0 and Phase 0.5 — STEP-000 through STEP-056](docs/memory/archive/phase-0-and-0.5.md)

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
