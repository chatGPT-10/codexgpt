# CodexPro Implementation Memory

This file is the append-only implementation journal for the personal CodexPro fork.

Do not store secrets, complete tokens, private keys, or sensitive source contents here.

---

## 2026-07-11 — STEP-000: Current-state audit

**Status:** Completed

**Goal:** Understand the existing CodexPro architecture, security boundaries, Windows compatibility, Cloudflare workflow, testing baseline, and major capability gaps before changing implementation code.

**Files changed:** none during the audit

**Implementation summary:**

- Opened the configured workspace at `D:\Dev\codexpro`.
- Confirmed package version `0.28.6`, branch `main`, and an initially clean Git state.
- Inspected the repository tree and primary files including:
  - `README.md`
  - `package.json`
  - `src/server.ts`
  - `src/http.ts`
  - `src/config.ts`
  - `src/guard.ts`
  - `src/fsOps.ts`
  - `src/bashOps.ts`
  - `src/searchOps.ts`
  - `src/workspaceOps.ts`
  - `src/capabilitiesOps.ts`
  - `src/analysis/*`
  - `src/redact.ts`
  - `scripts/smoke.mjs`
  - `scripts/http-smoke.mjs`
  - `.github/workflows/ci.yml`
  - `SECURITY.md`
  - `DOMAIN_SETUP.md`
- Confirmed that MCP tools have input schemas but no precise declared `outputSchema`.
- Confirmed preliminary multi-workspace support with remaining implicit default-workspace behavior.
- Confirmed that current built-in analysis is lexical/regex based and that no semantic provider is registered.
- Confirmed that the safe shell mode is a policy filter, not an OS sandbox.
- Confirmed that current CI runs only on Ubuntu.
- Confirmed that query-parameter Token authentication remains part of the primary HTTP workflow.

**Verification commands:**

```text
CodexPro read/search/tree/show_changes operations
Attempted: npm run build through the current CodexPro bash tool
```

**Verification results:**

- Repository inspection completed successfully.
- Initial Git state was clean.
- The build command did not start. The tool returned `spawn bash ENOENT` because the selected Bash backend was unavailable on the Windows machine.
- This result does not establish that the TypeScript build fails.

**Decisions made:**

- Keep CodexPro as the base project.
- Treat DevSpace as the primary workflow reference.
- Treat Serena as an optional semantic provider.
- Treat Desktop Commander as a process-session interface reference.
- Preserve native Windows as the primary platform.
- Keep Cloudflare as DNS/TLS/Tunnel only and avoid a third-party hosted relay.
- Use incremental refactoring rather than a rewrite.

**Risks or limitations:**

- Build and smoke tests remain unverified on the audited Windows environment until a usable shell backend is available.
- Audit conclusions are based on the inspected repository version and must be revised when architecture changes.

**Rollback method:** Not applicable; no repository file was changed during the audit.

**Next step:** Store the project mission, audit conclusions, architecture decisions, and complete roadmap in root `AGENTS.md`; create this implementation journal.

---

## 2026-07-11 — STEP-001: Establish project instructions and persistent implementation memory

**Status:** Completed

**Goal:** Make the agreed target, audit conclusions, security rules, implementation roadmap, and progress-recording protocol available inside the repository for ChatGPT, Codex, and other local implementation agents.

**Files changed:**

- `AGENTS.md` — created
- `Memory.md` — created

**Implementation summary:**

- Read `AGENTS.example.md` and confirmed it was only a minimal generic template.
- Created root `AGENTS.md` containing:
  - project mission and target network path;
  - Windows-native and self-hosted constraints;
  - mandatory small-step workflow;
  - mandatory `Memory.md` update protocol;
  - audited architecture and findings;
  - DevSpace, Serena, and Desktop Commander adoption rules;
  - target module architecture;
  - workspace, authentication, shell, and semantic-provider decisions;
  - target tool groups;
  - output and error contract;
  - Phase 0 through Phase 9 implementation roadmap;
  - verification, rollback, and compatibility rules;
  - current stopping point before Phase 0.5 implementation.
- Created `Memory.md` as an append-only implementation journal and recorded STEP-000 and STEP-001.

**Verification commands:**

```text
CodexPro write AGENTS.md
CodexPro write Memory.md
CodexPro show_changes
```

**Verification results:**

- Both files were created successfully.
- `AGENTS.md` was written as a new root instruction file.
- `codexpro_self_test` completed with 0 failed checks; write, Pro-context, and Bash probes were intentionally skipped.
- Final `show_changes` reported exactly two untracked files: `AGENTS.md` and `Memory.md`.
- No implementation source file or unrelated repository file was modified.

**Decisions made:**

- `Memory.md` is the canonical append-only progress record.
- A meaningful implementation step is not considered complete until verification is recorded in `Memory.md`.
- Historical corrections must be appended rather than silently rewriting prior entries.
- Phase 0.5 implementation remains paused until explicitly approved.

**Risks or limitations:**

- `AGENTS.md` is comprehensive and intentionally long; future restructuring may split stable architecture documentation from operational instructions, but only after preserving an authoritative index and migration history.
- The current CodexPro server loaded the workspace before `AGENTS.md` existed. A new workspace/session may be needed before automatic AGENTS discovery reflects the new file.

**Rollback method:**

- Remove `AGENTS.md` and `Memory.md` to return to the pre-documentation repository state.
- No source behavior or runtime configuration is affected by this documentation-only step.

**Next step:** Review the exact Git diff for `AGENTS.md` and `Memory.md`, confirm no unrelated changes, and then wait for approval before starting Phase 0.5 implementation.

---

## 2026-07-11 — STEP-002: Add Windows CI baseline

**Status:** Completed

**Goal:** Add continuous Windows build coverage without changing runtime behavior.

**Files changed:**

- `.github/workflows/ci.yml`
- `Memory.md`

**Implementation summary:**

- Split CI into explicit Ubuntu and Windows jobs.
- Added Node.js 20 and Node.js 24 matrices to both operating systems.
- Kept the complete smoke suite on Ubuntu.
- Added a Windows-compatible baseline consisting of install, TypeScript build, doctor smoke, settings smoke, and package-content validation.
- Kept `fail-fast: false` so one platform/version result does not hide the others.

**Verification commands:**

```text
CodexPro show_changes path=.github/workflows/ci.yml
Manual GitHub Actions YAML structure review
```

**Verification results:**

- The scoped diff contains only the intended CI workflow change.
- The workflow now advertises four combinations: Ubuntu/Node 20, Ubuntu/Node 24, Windows/Node 20, and Windows/Node 24.
- Local execution was not possible through the current CodexPro shell because the Windows server still lacks an available Bash backend.
- The actual Windows and Ubuntu CI results remain pending until the workflow is run by GitHub Actions.

**Decisions made:**

- Retain Node 20 temporarily as a compatibility target because `package.json` currently allows Node `>=20`.
- Add Node 24 as the current LTS target.
- Do not run the complete existing smoke suite on Windows until Bash-dependent cases are split by capability.

**Risks or limitations:**

- Node 20 is already end-of-life and should be removed or explicitly downgraded to best-effort compatibility in a later version-policy decision.
- The selected Windows smoke scripts have not yet been observed on GitHub's Windows runner.
- This step does not add Windows path-policy unit tests; that is the next independent step.

**Rollback method:**

- Revert `.github/workflows/ci.yml` to the single Ubuntu/Node 20 job.

**Next step:** Add focused `node:test` coverage for Windows path-policy edge cases without changing production behavior.

---

## 2026-07-11 — STEP-003: Harden Windows path policy

**Status:** Completed with environment-blocked runtime verification

**Goal:** Prevent Windows-specific path forms from bypassing blocked paths or escaping the intended workspace boundary.

**Files changed:**

- `src/guard.ts`
- `test/path-policy.test.mjs`
- `.github/workflows/ci.yml`
- `Memory.md`

**Implementation summary:**

- Added a pure `assertSafePathInput` pre-resolution check.
- Rejected null bytes on all platforms.
- On Windows, rejected device namespace paths, UNC paths, drive-relative paths, NTFS alternate data streams, reserved device names, and path segments ending in a dot or space.
- Applied the syntax check before opening a workspace and before resolving a workspace path.
- Made blocked-glob matching case-insensitive only on Windows.
- Added deterministic `node:test` coverage that can exercise Windows matching rules even on a non-Windows runner.
- Added a Windows-only cross-drive resolution test.
- Added the path-policy test to both Ubuntu and Windows CI jobs.

**Verification commands:**

```text
CodexPro read src/guard.ts
CodexPro show_changes path=src/guard.ts
CodexPro read test/path-policy.test.mjs
CodexPro show_changes path=test/path-policy.test.mjs
Expected CI command: node --test test/path-policy.test.mjs
```

**Verification results:**

- Static review confirms the new checks run before path resolution.
- The production diff is limited to path-policy behavior in `src/guard.ts`.
- The test file covers case variants, device paths, UNC, ADS, reserved names, trailing dots/spaces, normal Windows paths, Linux compatibility, and cross-drive escape.
- Local build and test execution remain blocked because the current CodexPro Windows shell backend attempts to spawn Bash and returns `spawn bash ENOENT`.
- Actual test pass/fail status remains pending GitHub Actions or a native Windows shell backend.

**Decisions made:**

- Reject UNC paths for this personal local-workspace product rather than attempting to secure network shares in Phase 0.5.
- Keep Linux path syntax unchanged.
- Use an injectable platform value in `PathGuard` only for deterministic policy tests; runtime defaults to `process.platform`.

**Risks or limitations:**

- Windows path canonicalization has many edge cases; CI execution is still required before claiming full coverage.
- This change does not yet address time-of-check/time-of-use races around junction replacement.
- It does not provide an OS sandbox.

**Rollback method:**

- Revert `src/guard.ts`, remove `test/path-policy.test.mjs`, and remove the path-policy test steps from CI.

**Next step:** Harden the HTTP entry point with allowed Host and Origin policies while preserving Bearer-header authentication.

---

## 2026-07-11 — STEP-004: Harden HTTP Host, Origin, and legacy query authentication

**Status:** Completed with environment-blocked runtime verification

**Goal:** Reduce DNS rebinding, Host-header, cross-origin, and URL-credential exposure risks while preserving a controlled migration path for existing connectors.

**Files changed:**

- `src/config.ts`
- `src/http.ts`
- `src/server.ts`
- `config.example.env`
- `test/http-security.test.mjs`
- `scripts/http-smoke-compat.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `Memory.md`

**Implementation summary:**

- Added `allowedHosts`, `allowedOrigins`, and `allowQueryToken` to the runtime configuration.
- Added exact Host normalization and allowlisting, including local loopback defaults and public-hostname environment hints.
- Added strict Origin handling: requests without Origin remain valid for server-side MCP clients; requests with Origin must be same-origin or explicitly listed.
- Replaced unrestricted CORS with reflected CORS only after the Origin policy passes.
- Added `nosniff`, no-referrer, frame denial, and restricted browser-permission response headers.
- Made URL query authentication unable to authorize direct HTTP requests by default.
- Kept an explicit compatibility switch and temporary tunnel-mode fallback so current remote connector workflows are not silently broken.
- Added a startup warning whenever URL query compatibility is active.
- Exposed the non-secret policy state through `server_config`.
- Added a cross-platform HTTP security test covering Bearer authentication, default query rejection, compatibility mode, Host rejection, Origin rejection, allowed origins, response headers, and request-log credential redaction.
- Added a wrapper for the legacy HTTP smoke suite because its fixture file is protected by secret-content write rules.

**Verification commands:**

```text
CodexPro read/show_changes src/config.ts
CodexPro read/show_changes src/http.ts
CodexPro show_changes workspace
Attempted: npm run build
Expected CI command: node --test test/http-security.test.mjs
```

**Verification results:**

- Scoped diffs contain the intended configuration and HTTP policy changes.
- Request logging continues to use `req.path`, not the query string.
- The dedicated test generates credentials at runtime and asserts they do not appear in stderr.
- The existing HTTP smoke suite is run through an explicit compatibility wrapper.
- `npm run build` did not start; the current tool again returned `spawn bash ENOENT`.
- Build and runtime test results remain pending CI or a native Windows shell backend.

**Decisions made:**

- Host matching is exact and case-normalized; wildcard public hosts are not introduced in this phase.
- Loopback hosts remain allowed for local health checks and administration.
- Direct HTTP starts default to Header-based authentication.
- Tunnel mode temporarily defaults to legacy query compatibility; `CODEXPRO_ALLOW_QUERY_TOKEN=0` overrides it.
- A named Cloudflare hostname should be provided through `CODEXPRO_ALLOWED_HOSTS` or an existing public-hostname environment variable.

**Risks or limitations:**

- Quick Cloudflare tunnel hostnames are dynamic; a future CLI integration should update the allowlist after tunnel discovery instead of relying on broad patterns.
- The current browser admin page does not yet have a header-based login flow, so disabling query compatibility changes its authenticated-browser UX.
- OAuth and scoped credentials remain Phase 8 work.
- Runtime validation is still pending.

**Rollback method:**

- Revert the configuration and HTTP middleware changes, remove `test/http-security.test.mjs` and the compatibility wrapper, and restore the previous HTTP smoke command.

**Next step:** Improve doctor diagnostics so Windows reports the unavailable Bash backend before a verification command is attempted.

---

## 2026-07-11 — STEP-005: Add Bash availability diagnostics

**Status:** Completed with environment-blocked runtime verification

**Goal:** Detect an unavailable Bash backend before a verification command is spawned and provide actionable Windows guidance.

**Files changed:**

- `src/bashOps.ts`
- `src/server.ts`
- `scripts/doctor.mjs`
- `test/doctor-shell.test.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `Memory.md`

**Implementation summary:**

- Added a reusable Bash availability probe.
- Made the Bash MCP tool fail with a clear CodexPro error before attempting `spawn` when Bash is unavailable.
- Added Bash availability to `server_config` and `codexpro_self_test`.
- Added a standalone Doctor preflight wrapper used by `npm run doctor`.
- Added Windows-specific guidance to install Git Bash or temporarily use `--no-bash` until the PowerShell backend is implemented.
- Added deterministic tests for an unavailable Bash command and Bash-disabled mode.
- Added Doctor shell tests to Ubuntu and Windows CI jobs.

**Verification commands:**

```text
CodexPro read/show_changes src/bashOps.ts
CodexPro show_changes scripts/doctor.mjs
Expected CI command: node --test test/doctor-shell.test.mjs
Expected local command after build: npm run doctor
```

**Verification results:**

- Static review confirms the availability probe runs before workspace command execution.
- `npm run doctor` now routes through the preflight wrapper.
- The existing `codexpro doctor` implementation could not be modified directly because its source file contains intentional secret-shaped test/configuration code and CodexPro correctly blocked the edit.
- The MCP self-test and Bash tool still receive the same preflight information through `src/bashOps.ts` and `src/server.ts`.
- Runtime test execution remains pending CI because the current running CodexPro build still uses the old Bash-only executor and cannot rebuild itself.

**Decisions made:**

- Do not bypass CodexPro's secret-content write protection to edit the large CLI file.
- Use `npm run doctor` as the safe enhanced Doctor entry point for this phase.
- Defer the native PowerShell executor to Phase 4; this step only diagnoses availability.

**Risks or limitations:**

- The globally installed `codexpro doctor` command still uses the original internal Doctor until a later safe CLI refactor or a rebuilt package adopts the wrapper as its public entry point.
- Availability only proves that an executable can be located; it does not prove that every Bash command will work.
- Runtime verification is pending.

**Rollback method:**

- Revert `src/bashOps.ts` and `src/server.ts`, remove the Doctor wrapper and test, restore the original package Doctor script, and remove the CI test steps.

**Next step:** Pin and checksum-verify automatic Cloudflared downloads, then add an explicit upgrade path.

---

## 2026-07-11 — STEP-006: Add verified Cloudflared installation

**Status:** Completed with environment-blocked runtime verification

**Goal:** Prevent repository-managed Cloudflared startup from executing an unverified floating release download.

**Files changed:**

- `scripts/cloudflared-release.mjs`
- `scripts/cloudflared-installer.mjs`
- `scripts/codexpro-entry.mjs`
- `test/cloudflared-installer.test.mjs`
- `CLOUDFLARED_VERIFIED_INSTALL.md`
- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`
- `Memory.md`

**Implementation summary:**

- Pinned Cloudflared release `2026.7.1`.
- Recorded official SHA-256 values for all platform assets already supported by CodexPro.
- Replaced floating `releases/latest` usage in the public execution path with an exact release URL.
- Added a 100 MiB response limit enforced while streaming the download.
- Added SHA-256 verification before extraction or execution.
- Added staged installation, version verification, backup, rollback, and cleanup.
- Added installed-file hash verification for directly distributed Windows and Linux binaries.
- Added `install`, `ensure`, `status`, and `upgrade` commands.
- Added a public `codexpro` entry wrapper that routes Cloudflare starts through the verified installer and appends `--no-install-cloudflared` before calling the legacy internal CLI.
- Routed the public `doctor` command through the enhanced Doctor wrapper, resolving the public-command limitation recorded in STEP-005.
- Routed all repository `connect:*` scripts through the safe public entry.
- Added unit tests for the pinned URL, Windows checksum, manifest digest format, platform selection, SHA-256 rejection, and entry routing.
- Added a standalone verified-install guide and included it in the package contents.

**Verification commands:**

```text
CodexPro read scripts/cloudflared-release.mjs
CodexPro show_changes scripts/cloudflared-installer.mjs
CodexPro read package.json
Expected CI command: node --test test/cloudflared-installer.test.mjs
Expected install command: npm run cloudflared:install
Expected upgrade command: npm run cloudflared:upgrade
```

**Verification results:**

- Static review confirms the public package binary points to `scripts/codexpro-entry.mjs`.
- The public entry invokes the verified installer for default, `start`, stable, and explicit Cloudflare tunnel starts.
- Explicit manual Cloudflared paths and `--no-install-cloudflared` remain supported.
- Package lock metadata matches the new public binary entry.
- Official release `2026.7.1` and its SHA-256 list were verified against Cloudflare's GitHub release page on 2026-07-11.
- Runtime download and install were not executed because they would make a network and local executable change; unit and CI validation remain pending.
- Local Node test execution remains blocked by the currently running Bash-only CodexPro build.

**Decisions made:**

- The normal public command must not call the legacy unverified auto-installer.
- The legacy large CLI file remains as an internal compatibility implementation because CodexPro's secret-content guard correctly prevents editing it.
- Direct invocation of `node scripts/codexpro.mjs` is considered an internal legacy path; the supported entry is `codexpro` or `scripts/codexpro-entry.mjs`.
- Upgrading means reviewing and changing the pinned version and every checksum, then running `npm run cloudflared:upgrade`; it never means following a floating latest URL.

**Risks or limitations:**

- A real download/install test has not been run on Windows or macOS.
- macOS release archives are checksum-verified before extraction, but later status checks rely on reported version because the release page publishes the archive digest rather than the extracted binary digest.
- A `start` command whose saved profile later selects a non-Cloudflare tunnel may perform an unnecessary `ensure`; it does not use the unverified downloader.
- The old internal CLI downloader still exists for direct internal-script invocation and should be removed during a future safe CLI decomposition.

**Rollback method:**

- Restore the package binary to `scripts/codexpro.mjs`, remove the verified installer, release manifest, entry wrapper, tests, and guide, and restore the old connect scripts.

**Next step:** Perform the complete Phase 0.5 diff review and record which acceptance checks are implemented, pending CI, or intentionally deferred.

---

## 2026-07-11 — STEP-007: Phase 0.5 implementation review

**Status:** Implementation complete; runtime validation pending

**Goal:** Review the complete Phase 0.5 change set, identify remaining verification gaps, and stop before an unapproved system installation or remote Git operation.

**Files changed:**

- `.github/workflows/ci.yml`
- `config.example.env`
- `package.json`
- `package-lock.json`
- `src/bashOps.ts`
- `src/config.ts`
- `src/guard.ts`
- `src/http.ts`
- `src/server.ts`
- `AGENTS.md`
- `Memory.md`
- `CLOUDFLARED_VERIFIED_INSTALL.md`
- `scripts/cloudflared-installer.mjs`
- `scripts/cloudflared-release.mjs`
- `scripts/codexpro-entry.mjs`
- `scripts/doctor.mjs`
- `scripts/http-smoke-compat.mjs`
- `test/path-policy.test.mjs`
- `test/http-security.test.mjs`
- `test/doctor-shell.test.mjs`
- `test/cloudflared-installer.test.mjs`

**Implementation summary:**

- Added Ubuntu and Windows CI matrices for Node.js 20 and 24.
- Added focused security tests for Windows paths, HTTP entry policy, shell diagnostics, and verified Cloudflared installation.
- Hardened Windows path syntax and case handling.
- Added Junction, dangling symlink, and cross-drive escape tests.
- Added Host and Origin allowlists, security headers, and controlled query-authentication compatibility.
- Added pre-execution Bash diagnostics and enhanced public Doctor routing.
- Added a pinned and checksum-verified Cloudflared installer and safe public CLI entry.
- Preserved the existing source architecture and deferred larger refactors to later phases.

**Verification commands:**

```text
CodexPro show_changes
Attempted: npm run build
CI definitions:
  npm ci
  npm run build
  node --test test/path-policy.test.mjs
  node --test test/http-security.test.mjs
  node --test test/doctor-shell.test.mjs
  node --test test/cloudflared-installer.test.mjs
  npm run smoke (Ubuntu)
  Windows-compatible smoke scripts
  npm pack --dry-run
```

**Verification results:**

Implemented but awaiting execution:

- Windows and Ubuntu CI jobs.
- Windows case-insensitive blocked-path tests.
- Device path, UNC, ADS, reserved-name, trailing-dot/space, Junction, dangling symlink, and cross-drive tests.
- Host and Origin rejection tests.
- Bearer-header and query-compatibility tests.
- Request-log credential-redaction test.
- Doctor shell tests.
- Cloudflared checksum and routing tests.

Statically confirmed:

- Only planned Phase 0.5 files plus the previously approved `AGENTS.md` and `Memory.md` are changed.
- No file is staged or committed.
- No remote push was performed.
- The supported public CLI and repository connection scripts no longer use the legacy unverified Cloudflared downloader.
- Query credentials are disabled by default for direct HTTP starts and remain available only through an explicit or tunnel-compatibility setting.

Environment-blocked:

- The final `npm run build` attempt again failed before command execution with `spawn bash ENOENT`.
- Therefore TypeScript compilation, unit tests, smoke tests, `git diff --check`, and package dry-run have not been executed locally.
- GitHub Actions has not run because no commit or push was authorized.

**Acceptance checklist state:**

```text
[IMPLEMENTED, PENDING CI] npm ci on Windows
[IMPLEMENTED, PENDING CI] npm run build on Windows
[IMPLEMENTED] Windows CI included
[IMPLEMENTED, PENDING CI] blocked-glob case tests
[IMPLEMENTED, PENDING CI] symlink and Junction tests
[IMPLEMENTED, PENDING CI] UNC, device path, ADS, reserved-name tests
[IMPLEMENTED, PENDING CI] disallowed Host returns 403
[IMPLEMENTED, PENDING CI] disallowed Origin returns 403
[IMPLEMENTED, PENDING CI] Bearer Header works
[IMPLEMENTED, PENDING CI] query credential is off by default
[IMPLEMENTED, PENDING CI] compatibility switch restores query authentication
[IMPLEMENTED, PENDING CI] request logs exclude credential values
[IMPLEMENTED, PENDING CI] Doctor detects unavailable Bash
[IMPLEMENTED, PENDING CI] Cloudflared checksum verification
[PENDING CI] original Ubuntu smoke does not regress
[STATICALLY CONFIRMED] Git workspace contains only intended changes
```

**Decisions made:**

- Phase 0.5 source implementation is complete enough for runtime validation.
- Do not begin Phase 1 before Phase 0.5 builds and tests pass.
- Do not install Git Bash, alter the system PATH, commit, or push without explicit user confirmation.

**Risks or limitations:**

- Static review cannot replace compilation and runtime tests.
- The current running CodexPro process does not contain the newly written shell diagnostics until the project is rebuilt and restarted.
- Node.js 20 remains in CI only for temporary compatibility even though it is end-of-life; Node.js 24 is the current LTS target.
- The large legacy CLI remains and should be decomposed later, but the supported package entry now wraps it safely.

**Rollback method:**

- Revert the Phase 0.5 files listed above. `AGENTS.md` and `Memory.md` may be retained independently as project documentation.

**Next step requiring confirmation:** Either install/configure Git Bash locally and run the full validation suite, or commit and push the branch so GitHub Actions performs the four-platform/version CI matrix.

---

## 2026-07-11 — STEP-008: Restore local Windows Bash execution and pass the TypeScript build

**Status:** Completed

**Goal:** Make the existing Bash-based CodexPro verification backend usable on the native Windows workstation and establish the first successful local Phase 0.5 build.

**Environment changes:**

- Installed Git for Windows manually because `winget` was unavailable.
- Confirmed Bash at `C:\Program Files\Git\bin\bash.exe`.
- Confirmed GNU Bash `5.3.15`.
- Added `C:\Program Files\Git\bin` to the Windows user `Path`.
- Added the portable Node.js directory to `~/.bashrc` for Git Bash.
- Confirmed Node.js `v24.15.0` and npm `11.18.0` inside Git Bash.
- Restarted CodexPro from a PowerShell process whose environment includes the Git Bash directory.

**Repository files changed:**

- `Memory.md`
- `node_modules` was recreated by `npm ci` and remains ignored by Git.

**Verification commands:**

```text
where.exe bash
bash --version
node -e "spawnSync('bash', ['--version'])"
CodexPro codexpro_self_test
npm ls typescript
npm ci
npm run build
```

**Verification results:**

- `where.exe bash` resolved to `C:\Program Files\Git\bin\bash.exe` after the environment was corrected.
- Node.js successfully spawned Bash with exit status `0`.
- CodexPro self-test completed with `0` failed checks; the remaining entries were expected warnings for full Bash mode and intentionally skipped probes.
- The first build attempt reached npm but failed because project dependencies had not yet been installed and `typescript` was absent.
- `npm ci` installed 112 packages, audited 113 packages, and reported 0 vulnerabilities.
- npm warned that the `esbuild@0.28.1` install script was not covered by the local `allowScripts` policy; this warning requires later review but did not block installation.
- `npm run build` completed successfully with TypeScript exit code `0`.

**Decisions made:**

- Keep Git Bash as the temporary Windows executor for Phase 0.5 validation.
- Do not start Phase 1 until all targeted Phase 0.5 tests, smoke tests, and package validation also pass.
- Do not commit or push yet.

**Risks or limitations:**

- CodexPro must be launched from a process that has inherited the corrected Windows `Path`; older PowerShell or terminal-host processes may still carry the previous environment.
- Native PowerShell execution remains deferred to Phase 4.
- The npm install-script warning for `esbuild` must be evaluated before treating dependency installation policy as fully resolved.

**Rollback method:**

- Remove `C:\Program Files\Git\bin` from the Windows user `Path` and uninstall Git for Windows if Bash is no longer desired.
- Remove the Node.js export from `~/.bashrc` if the portable Node location changes.
- Delete `node_modules` to undo the dependency installation without changing tracked source files.

**Next step:** Run `test/path-policy.test.mjs` as the first focused Phase 0.5 runtime test.

---

## 2026-07-11 — STEP-009: Validate the Windows path policy

**Status:** Completed

**Goal:** Execute the first focused Phase 0.5 runtime test and confirm that the Windows path-security implementation behaves as intended.

**Files changed:**

- `Memory.md`

**Implementation summary:**

- No source code was changed.
- Ran the dedicated Node test suite for Windows blocked-path matching, special path rejection, Junction and symlink escape prevention, and cross-drive handling.

**Verification commands:**

```text
node --test test/path-policy.test.mjs
```

**Verification results:**

- Exit code: `0`.
- Tests: 8.
- Passed: 8.
- Failed: 0.
- Confirmed case-insensitive blocked paths on Windows without changing non-Windows behavior.
- Confirmed rejection of Windows special path forms before resolution.
- Confirmed Junction and dangling-symlink write protections.
- Confirmed cross-drive paths cannot resolve inside a Windows workspace.

**Decisions made:**

- Treat the Phase 0.5 path-policy runtime validation as passed.
- Continue validating Phase 0.5 one focused test at a time.
- Do not begin Phase 1, commit, or push.

**Risks or limitations:**

- This test covers the dedicated path-policy suite only; HTTP security, Doctor diagnostics, Cloudflared verification, smoke tests, and package validation remain pending.

**Rollback method:**

- Revert this `Memory.md` entry. No source or environment change was made by this step.

**Next step:** Run `node --test test/http-security.test.mjs` only after continuing the validation sequence.

---

## 2026-07-11 — STEP-010: Validate HTTP security behavior

**Status:** Completed

**Goal:** Execute the second focused Phase 0.5 runtime test and confirm the HTTP Host, Origin, Bearer authentication, and legacy query compatibility policies.

**Files changed:**

- `Memory.md`

**Implementation summary:**

- No source code was changed.
- Ran the dedicated Node HTTP security test suite against the built project.
- Verified the secure defaults and the explicit migration compatibility settings.

**Verification commands:**

```text
node --test test/http-security.test.mjs
```

**Verification results:**

- Exit code: `0`.
- Tests: 2.
- Passed: 2.
- Failed: 0.
- Confirmed default rejection of URL query credentials.
- Confirmed rejection of untrusted Host and Origin values.
- Confirmed explicitly allowed origins are accepted.
- Confirmed the explicit legacy query compatibility setting restores the migration behavior.

**Decisions made:**

- Treat the Phase 0.5 HTTP security runtime validation as passed.
- Continue validating Phase 0.5 one focused test at a time.
- Do not begin Phase 1, commit, or push.

**Risks or limitations:**

- This focused suite does not replace the remaining Doctor, Cloudflared, smoke, and package validation steps.
- OAuth and scoped-token authorization remain later-phase work.

**Rollback method:**

- Revert this `Memory.md` entry. No source or environment change was made by this step.

**Next step:** Run `node --test test/doctor-shell.test.mjs` only after continuing the validation sequence.

---

## 2026-07-11 — STEP-011: Validate Doctor shell diagnostics

**Status:** Completed

**Goal:** Confirm that Doctor reports an unavailable Bash backend before execution and does not require Bash when Bash mode is disabled.

**Files changed:**

- `Memory.md`

**Implementation summary:**

- No source code was changed.
- Ran the dedicated Doctor shell diagnostic test suite.

**Verification commands:**

```text
node --test test/doctor-shell.test.mjs
```

**Verification results:**

- Exit code: `0`.
- Tests: 2.
- Passed: 2.
- Failed: 0.
- Confirmed Doctor detects an unavailable Bash executable before attempting command execution.
- Confirmed Bash mode `off` does not require a Bash executable.

**Decisions made:**

- Treat the Phase 0.5 Doctor shell runtime validation as passed.
- Continue automatically through the remaining approved validation sequence.
- Do not begin Phase 1, commit, or push.

**Risks or limitations:**

- This focused suite does not validate Cloudflared installation, the full smoke suite, or package contents.

**Rollback method:**

- Revert this `Memory.md` entry. No source or environment change was made by this step.

**Next step:** Run `node --test test/cloudflared-installer.test.mjs`.

---

## 2026-07-11 — STEP-012: Validate verified Cloudflared installation

**Status:** Completed

**Goal:** Confirm that repository-managed Cloudflared installation uses pinned release metadata, strict SHA-256 verification, supported platform selection, and the verified public entry path.

**Files changed:**

- `Memory.md`

**Implementation summary:**

- No source code was changed.
- Ran the dedicated verified Cloudflared installer test suite.

**Verification commands:**

```text
node --test test/cloudflared-installer.test.mjs
```

**Verification results:**

- Exit code: `0`.
- Tests: 5.
- Passed: 5.
- Failed: 0.
- Confirmed release metadata is pinned and does not use a floating `latest` URL.
- Confirmed every supported asset has a strict SHA-256 digest.
- Confirmed unsupported platform and architecture pairs are rejected.
- Confirmed the public CodexPro entry routes Cloudflare starts through the verified installer.
- Confirmed checksum verification accepts exact content and rejects mismatches.

**Decisions made:**

- Treat the Phase 0.5 Cloudflared installer runtime validation as passed.
- Continue to the full smoke suite.
- Do not begin Phase 1, commit, or push.

**Risks or limitations:**

- This unit suite does not download a live Cloudflared release from the network; it validates the pinned manifest, routing, selection, and checksum logic locally.

**Rollback method:**

- Revert this `Memory.md` entry. No source or environment change was made by this step.

**Next step:** Run `npm run smoke`.

---

## 2026-07-11 — STEP-013: Fix Windows smoke-suite compatibility

**Status:** Completed

**Goal:** Make the existing cross-platform smoke suites run reliably on native Windows with Git Bash, without weakening production path or credential protections.

**Files changed:**

- `scripts/analysis-smoke.mjs`
- `scripts/doctor.mjs`
- `scripts/doctor-smoke.mjs`
- `scripts/smoke-platform-compat.mjs`
- `scripts/settings-smoke-platform-compat.mjs`
- `scripts/execute-handoff-smoke-platform-compat.mjs`
- `scripts/windows-realpath-shim.cjs`
- `src/config.ts`
- `src/guard.ts`
- `test/analysis-smoke-entry.test.mjs`
- `test/config-realpath.test.mjs`
- `package.json`
- `Memory.md`

**Implementation summary:**

- Replaced URL pathname handling in `analysis-smoke.mjs` with `fileURLToPath()` so Windows drive letters are not duplicated as `D:\\D:\\...`.
- Standardized existing configured roots and Codex directories on `fs.realpathSync.native()` to prevent Windows 8.3 short paths and normal long paths from being treated as different directories.
- Kept the protected legacy smoke fixtures unchanged when CodexPro correctly blocked edits because they contain intentional secret-shaped test data.
- Added Windows-only smoke wrappers that normalize temporary-directory paths while preserving the original production behavior on non-Windows systems.
- Added a bounded Windows test shim that:
  - normalizes synchronous real paths;
  - runs Node shebang fixtures through the current Node executable;
  - resolves `.cmd` and `.bat` commands through `PATHEXT` and `cmd.exe`;
  - is removed from descendant environments so fake Cloudflared processes are not polluted.
- Enhanced the public Doctor wrapper to validate saved profile modes using the canonical workspace identity and to fall back to a direct Bash availability probe when `where` cannot parse a Git Bash-style inherited PATH.
- Added test-only Windows cleanup for runtime status and fake quick-tunnel credential files when Node force-terminates a child instead of delivering a POSIX-style `SIGTERM` callback.
- Added regression tests for analysis-smoke entry resolution and canonical root/Codex-directory handling.

**Material failures found and resolved:**

- Analysis smoke constructed `D:\\D:\\Dev\\codexpro\\dist\\config.js`.
- Workspace identity differed between `ADMINI~1` and `Administrator` path forms.
- Git Bash `pwd` output used `/c/...` while tests expected a Windows path.
- Relative `--codex-dir` and saved profile IDs used inconsistent path forms.
- Windows could not directly execute fake `.mjs`, shebang-only `curl`, or `codex.cmd` fixtures with `shell: false`.
- Windows force termination skipped POSIX cleanup handlers used by runtime-status and quick-tunnel credential tests.
- Handoff change fingerprinting ignored a real `app.txt` modification because Git returned a long top-level path while the workspace root used an 8.3 short path.

**Verification commands:**

```text
node --test test/analysis-smoke-entry.test.mjs
node --test test/config-realpath.test.mjs
node --test test/path-policy.test.mjs
node scripts/doctor-smoke.mjs
node scripts/settings-smoke-platform-compat.mjs
node scripts/execute-handoff-smoke-platform-compat.mjs
npm run build
npm run smoke
```

**Verification results:**

- The analysis-smoke regression test changed from failing to passing.
- The canonical-path regression suite passes 2 of 2 tests.
- The Windows path-policy suite still passes 8 of 8 tests after canonicalization changes.
- Doctor smoke passes.
- Settings smoke passes.
- Execute-handoff, watch-handoff, and loop-handoff smoke passes.
- The final complete `npm run smoke` run passes all eight sequential smoke sections with exit code `0`.

**Decisions made:**

- Keep production Windows path normalization in `src/config.ts` and `src/guard.ts`.
- Keep legacy secret-bearing fixtures unmodified; use narrowly scoped compatibility wrappers instead.
- Treat these wrappers as test infrastructure, not as the Phase 4 native PowerShell backend.
- Do not begin Phase 1, commit, or push during this step.

**Risks or limitations:**

- The compatibility shim exists to exercise Unix-oriented legacy fixtures on Windows and is not an operating-system sandbox.
- Native PowerShell execution and Windows process-tree management remain Phase 4 work.
- The large legacy CLI still duplicates some path and profile logic; later refactoring should move those responsibilities into shared modules.

**Rollback method:**

- Revert the listed smoke wrappers, regression tests, and localized canonical-path changes; restore the previous `package.json` smoke command.

**Next step:** Run the final package dry-run and a consolidated regression suite.

---

## 2026-07-11 — STEP-014: Complete local Phase 0.5 validation

**Status:** Completed

**Goal:** Complete all remaining approved Phase 0.5 local validation gates on the native Windows workstation.

**Files changed:**

- `Memory.md`

**Verification commands:**

```text
npm run smoke
npm pack --dry-run
node --test test/path-policy.test.mjs test/http-security.test.mjs test/doctor-shell.test.mjs test/cloudflared-installer.test.mjs test/analysis-smoke-entry.test.mjs test/config-realpath.test.mjs
CodexPro show_changes
```

**Verification results:**

- `npm run smoke`: exit code `0`.
- Sequential smoke sections passed:
  - analysis smoke;
  - analysis CLI smoke;
  - core MCP smoke;
  - HTTP smoke;
  - Pro CLI smoke;
  - Doctor smoke;
  - Settings smoke;
  - execute-handoff, watch-handoff, and loop-handoff smoke.
- `npm pack --dry-run`: exit code `0`.
- The prepack TypeScript build completed successfully.
- Dry-run package summary: 96 files, approximately 288.5 kB packed and 1.3 MB unpacked.
- Consolidated Node regression suite: 20 tests, 20 passed, 0 failed.
- The consolidated suite covers path policy, HTTP security, Doctor shell diagnostics, verified Cloudflared installation, analysis-smoke entry resolution, and canonical root/Codex-directory behavior.
- Git state remains unstaged.
- No commit was created and no remote push was performed.

**Acceptance checklist state:**

```text
[LOCAL PASS] npm ci on Windows
[LOCAL PASS] npm run build on Windows
[IMPLEMENTED] Windows CI included
[LOCAL PASS] blocked-glob case tests
[LOCAL PASS] symlink and Junction tests
[LOCAL PASS] UNC, device path, ADS, reserved-name tests
[LOCAL PASS] disallowed Host returns 403
[LOCAL PASS] disallowed Origin returns 403
[LOCAL PASS] Bearer Header works
[LOCAL PASS] query credential is off by default
[LOCAL PASS] compatibility switch restores query authentication
[LOCAL PASS] request logs exclude credential values
[LOCAL PASS] Doctor detects unavailable Bash
[LOCAL PASS] Cloudflared checksum verification
[LOCAL PASS] complete smoke suite
[LOCAL PASS] package dry-run
[CONFIRMED] Git workspace remains unstaged and uncommitted
[PENDING REMOTE RUN] GitHub Actions Windows and Ubuntu matrix
```

**Decisions made:**

- Treat the native Windows Phase 0.5 validation sequence as locally complete.
- Do not start Phase 1 automatically.
- Require explicit user approval before commit, push, or remote CI execution.

**Risks or limitations:**

- GitHub Actions has not run because the changes remain uncommitted and unpushed.
- The Cloudflared installer unit suite validates pinned metadata and checksum behavior locally but does not perform a live production download in this validation step.
- The previously recorded npm install-script policy warning for `esbuild@0.28.1` remains a separate review item.

**Rollback method:**

- Revert the Phase 0.5 implementation and compatibility files listed in earlier steps. No remote state needs rollback because nothing was committed or pushed.

**Next step:** Review the final diff, then decide whether to commit and push Phase 0.5 so the GitHub Actions matrix can run. Do not begin Phase 1 before that decision.

---

## 2026-07-11 — STEP-015: Synchronize the approved project stopping point

**Status:** Completed

**Goal:** Reconcile the project instructions with the verified Phase 0.5 state without changing source code or rewriting implementation history.

**Files changed:**

- `AGENTS.md`
- `Memory.md`

**Implementation summary:**

- Marked Phase 0.5 as locally complete on Windows.
- Recorded that the GitHub Actions Windows/Ubuntu matrix remains pending commit and push.
- Replaced the obsolete statement that Phase 0.5 had not started.
- Kept the prohibition on starting Phase 1 without explicit user approval.

**Verification commands:**

```text
CodexPro read AGENTS.md
CodexPro show_changes AGENTS.md
```

**Verification results:**

- The Phase 0.5 status and current stopping point now match `STEP-014`.
- No source, test, package, credential, commit, or remote state was changed.

**Decisions made:**

- Limit this neat-freak pass to one safe documentation synchronization step.
- Do not rewrite `Memory.md` because the repository protocol requires append-only history.

**Risks or limitations:**

- `AGENTS.md` remains above the neat-freak soft size target.
- `Memory.md` remains above the neat-freak 200-line / 25KB target; resolving this conflicts with the current append-only rule and requires a separate user-approved documentation design change.
- The untracked `=/npm-cache/` directory was not removed because deletion requires explicit confirmation.

**Rollback method:**

- Revert the two localized `AGENTS.md` status edits and remove this appended correction entry.

**Next step:** Decide whether to redesign the append-only memory protocol into a concise index plus archived history, or first review and commit Phase 0.5.
---

## 2026-07-11 — STEP-016: Migrate implementation memory to an index and phase archive

**Status:** Completed

**Goal:** Preserve the complete Phase 0 and Phase 0.5 implementation journal while replacing the oversized root memory file with a concise, high-signal index.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Copied the complete pre-migration root journal into the Phase 0 and Phase 0.5 archive without altering its existing text.
- Added this migration entry to the end of the archive.
- Replaced the root journal with a concise index containing the current state, active decisions, open items, recent step summaries, and archive links.
- Kept the root index below the neat-freak limits of 200 lines and 25 KB.
- Did not modify source code, tests, dependencies, credentials, Git staging, commits, or remote state.

**Verification commands:**

```text
node .ai-bridge/migrate-memory-index.mjs
CodexPro read Memory.md
CodexPro read docs/memory/archive/phase-0-and-0.5.md
CodexPro show_changes
```

**Verification results:**

- The archive begins with an exact byte-for-byte copy of the pre-migration `Memory.md` content.
- Pre-migration journal SHA-256: `b297808452af0cd49311e03f4365d0770a115a119e6db3eeb14966fadb3ad477`.
- Pre-migration journal size: 1089 lines and 45573 bytes.
- The new root index references the archive and records the current approved stopping point.

**Decisions made:**

- Use the root `Memory.md` as a concise, editable index rather than a complete execution log.
- Store complete step records in phase-based files under `docs/memory/archive/`.
- Keep archived history append-only; update the root index in place.
- Align `AGENTS.md` with this protocol in the next separate step.

**Risks or limitations:**

- Until `AGENTS.md` is updated, its old append-only root-memory wording conflicts with the newly approved index/archive structure.
- Remote GitHub Actions remains pending commit and push.
- The untracked `=/npm-cache/` directory remains untouched.

**Rollback method:**

- Restore `Memory.md` from the exact pre-migration content at the start of this archive and remove the archive file.

**Next step:** Update the `AGENTS.md` memory protocol so future agents edit the root index and append full records to the current phase archive.

---

## 2026-07-11 — STEP-017: Align the project memory protocol

**Status:** Completed

**Goal:** Make the project instructions match the approved two-layer memory structure.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Replaced the old rule that treated root `Memory.md` as the complete append-only journal.
- Defined root `Memory.md` as a concise editable index.
- Defined `docs/memory/archive/` as the location for complete append-only step records grouped by phase.
- Added root-index size targets and hard limits.
- Required every meaningful completed step to update both the root index and current phase archive.

**Verification commands:**

```text
CodexPro read AGENTS.md
CodexPro read Memory.md
CodexPro read docs/memory/archive/phase-0-and-0.5.md
CodexPro search for obsolete memory protocol wording
CodexPro show_changes
```

**Verification results:**

- The working-method rules and memory protocol now describe the same two-layer workflow.
- The root index remains below 150 lines and 18 KB.
- The Phase 0 and Phase 0.5 archive contains complete records through STEP-017.
- No source code, tests, dependencies, credentials, Git staging, commits, or remote state changed.

**Decisions made:**

- Root `Memory.md` is edited in place and kept concise.
- Phase archives remain append-only.
- A step is complete only when its full verification record is in the phase archive and its concise status is reflected in the root index.

**Risks or limitations:**

- `AGENTS.md` remains above the neat-freak soft size target and may need a separate future restructuring.
- Remote GitHub Actions remains pending commit and push.
- The untracked `=/npm-cache/` directory remains untouched.

**Rollback method:**

- Restore the previous Section 4 wording in `AGENTS.md`, remove this STEP-017 entry, and restore the prior root-index open items and recent-step list.

**Next step:** Review the complete Phase 0.5 diff, then decide whether to commit and push for remote CI validation.

### STEP-017 verification addendum

- The first inline Node verification command failed before evaluating the files because Bash interpreted Markdown backticks inside the command as command substitutions.
- The command was rewritten without backticks and rerun.
- Corrected verification result: exit code `0`; root index 79 lines and 3,698 bytes; STEP-017 present; obsolete root-journal wording absent.

---

## 2026-07-11 — STEP-018: Review the complete Phase 0.5 diff

**Status:** Completed; commit and push blocked by review findings

**Goal:** Review all tracked and untracked Phase 0.5 changes, rerun local verification, and determine whether the branch is safe to commit and push without beginning Phase 1.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

No feature or source file was modified during this review step.

**Implementation summary:**

- Reviewed the complete tracked diff and the new CLI, Doctor, Cloudflared installer, compatibility wrappers, tests, CI workflow, package manifest, project instructions, and memory files.
- Confirmed the pinned Cloudflared `2026.7.1` asset hashes match the official Cloudflare GitHub release checksums.
- Confirmed the referenced `actions/checkout@v7.0.0` and `actions/setup-node@v6.4.0` releases exist.
- Found three blocking integration defects:
  1. `scripts/codexpro.mjs` reads the saved/public hostname into `stableHostname` but does not pass it to the HTTP child as `CODEXPRO_PUBLIC_HOSTNAME` or `CODEXPRO_ALLOWED_HOSTS`. A normal profile-based named-tunnel launch therefore builds an allowlist containing only loopback hosts and can reject the public hostname with HTTP 403.
  2. `scripts/codexpro-entry.mjs` ensures the pinned Cloudflared installation but forwards only `--no-install-cloudflared`. The legacy resolver still checks PATH before `~/.codexpro/bin`, so an arbitrary PATH Cloudflared can be selected instead of the verified binary.
  3. Windows CI invokes `node scripts/settings-smoke.mjs` directly. A fresh local run fails with a Windows short-path versus canonical-path `ENOENT`; the platform compatibility wrapper exists but is not used by that CI step. CI also omits the complete regression suite and full Windows smoke command.
- Found one package-content issue: `npm pack --dry-run` includes `docs/memory/archive/phase-0-and-0.5.md`, so the internal implementation journal would be distributed in the npm package unless explicitly excluded or approved.
- Confirmed the untracked `=/npm-cache/` directory remains outside the intended change set and must not be staged.

**Verification commands:**

```text
CodexPro open_current_workspace
CodexPro read/search/show_changes across Phase 0.5 source, scripts, tests, CI, docs, and memory
npm run build
node --test test/*.test.mjs
npm run smoke
npm pack --dry-run
node --input-type=module -e <loadConfig tunnel-mode Host allowlist probe>
where.exe cloudflared
npm run cloudflared:status
node scripts/settings-smoke.mjs
Official GitHub release-page verification for Cloudflared and GitHub Actions versions
```

**Verification results:**

- `npm run build`: exit `0`.
- Complete regression suite: 20/20 passed, 0 failed, 0 skipped.
- Complete smoke suite: all 8 sequential sections passed.
- `npm pack --dry-run`: exit `0`; 97 files; the phase archive is included in the tarball.
- Tunnel-mode configuration probe without an explicitly propagated public hostname returned only `127.0.0.1`, `localhost`, and `::1` in `allowedHosts`.
- `where.exe cloudflared`: no PATH Cloudflared on the current machine.
- `npm run cloudflared:status`: pinned `2026.7.1` binary is not currently installed in `~/.codexpro/bin`.
- Direct Windows `node scripts/settings-smoke.mjs`: exit `1` with `ENOENT` caused by short-path/canonical-path mismatch.
- Existing green tests do not cover the saved-profile public-host propagation or exact verified-binary selection defects.

**Decisions made:**

- Do not stage, commit, or push the current Phase 0.5 diff.
- Do not begin Phase 1.
- Treat the hostname propagation, verified-binary selection, and Windows CI command defects as Phase 0.5 blockers.
- Treat package distribution of the memory archive as an explicit review decision before publication.
- Fix blockers in a separate small step, then rerun the full local verification and review the resulting diff.

**Risks or limitations:**

- The current machine does not have Cloudflared on PATH, so the PATH-precedence defect is a guarantee failure rather than a currently triggered local failure.
- No live Cloudflare named-tunnel request was sent during this review because the active local service and credentials were not disturbed.
- Remote GitHub Actions remains unexecuted.
- The `esbuild@0.28.1` npm install-script policy warning remains a separate open item.

**Rollback method:**

- Revert only the STEP-018 updates in `Memory.md` and remove this appended archive entry. No feature code, Git staging, commit, push, credential, or remote state was changed.

**Next step:** Fix only the three Phase 0.5 blockers and the package-content decision, then rerun build, all tests, full smoke, package dry-run, and final diff review before considering commit or push.

---

## 2026-07-11 — STEP-019: Propagate the saved public hostname into the HTTP Host allowlist

**Status:** Completed

**Goal:** Fix only the first STEP-018 blocker so a normal `codexpro start` using a saved named-tunnel profile authorizes the saved public hostname instead of rejecting it with HTTP 403.

**Files changed:**

- `scripts/codexpro-entry.mjs`
- `test/cli-hostname-propagation.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added a focused regression test for the profile-to-launch-environment-to-HTTP-configuration path.
- Verified the original behavior failed because a saved named-tunnel hostname did not reach `loadConfig().allowedHosts`.
- Added profile hostname resolution to the public CLI entry used by the package binary and `npm run connect*` commands.
- The entry now resolves `--hostname`, `--url`, existing public-hostname environment variables, or the saved workspace profile hostname and passes the resolved value as `CODEXPRO_PUBLIC_HOSTNAME` to the legacy CLI child.
- Kept profile ID calculation compatible with the legacy CLI by using the same canonical root and `fs.realpathSync` behavior.
- Exported `launchEnvironment()` so the regression test exercises the exact environment-building function used by the real entry path.
- Did not edit `scripts/codexpro.mjs` because CodexPro secret-content protection blocks edits to that file and project policy explicitly prohibits bypassing the protection.

**Verification commands:**

```text
node --test test/cli-hostname-propagation.test.mjs
npm run build
node --test test/*.test.mjs
npm run smoke
```

**Verification results:**

- Red test before the fix: the real named-tunnel launch reached the HTTP server but the saved public Host returned `403` instead of `200`.
- Focused regression after the fix: 1/1 passed.
- TypeScript build: exit `0`.
- Consolidated regression suite: 21/21 passed, 0 failed, 0 skipped.
- Complete smoke suite: all 8 sequential sections passed.
- No staging, commit, push, credential change, tunnel change, or Phase 1 work occurred.

**Decisions made:**

- Treat `scripts/codexpro-entry.mjs` as the supported public launch boundary for compatibility behavior that cannot safely be added to the protected legacy script in this step.
- Preserve explicit hostname and environment-variable precedence over the saved profile.
- Keep the change limited to Host allowlist propagation; do not combine it with the Cloudflared binary-selection blocker.

**Risks or limitations:**

- Direct internal invocation with `node scripts/codexpro.mjs ...` bypasses the public entry and therefore does not receive this compatibility propagation. Supported package commands and the `codexpro` binary use `codexpro-entry.mjs`.
- The test validates the exact profile/environment/configuration chain without opening the user's live Cloudflare tunnel or using stored credentials.
- The verified Cloudflared PATH-precedence blocker, Windows CI blocker, package-memory inclusion issue, npm install-script warning, and untracked `=/npm-cache/` directory remain unresolved.

**Rollback method:**

- Restore the previous `scripts/codexpro-entry.mjs`, remove `test/cli-hostname-propagation.test.mjs`, and revert the STEP-019 index/archive updates. No remote state requires rollback.

**Next step:** Fix only the verified Cloudflared binary-selection blocker so the public launcher passes the exact pinned binary path to the legacy CLI, then rerun focused and full verification. Do not begin Phase 1.

---

## 2026-07-11 — STEP-020: Force exact verified Cloudflared binary selection

**Status:** Completed

**Goal:** Fix only the second STEP-018 blocker so a verified Cloudflare launch cannot be redirected to an unrelated `cloudflared` executable found earlier on PATH.

**Files changed:**

- `scripts/codexpro-entry.mjs`
- `test/cloudflared-installer.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added a failing regression test requiring verified Cloudflare starts to pass an exact `--cloudflared` path to the legacy CLI.
- Added `verifiedCloudflaredPath()` to derive the repository-managed binary path under `CODEXPRO_HOME/bin` with platform-correct naming.
- Added `withVerifiedCloudflaredArgs()` to append both the exact `--cloudflared` path and `--no-install-cloudflared` after the pinned installer succeeds.
- Updated the public CLI launch path to use those arguments instead of forwarding only `--no-install-cloudflared`.
- The legacy resolver now enters its explicit-path branch and therefore cannot select a different PATH executable for verified starts.
- Explicit user-supplied `--cloudflared` behavior remains unchanged because such launches do not invoke the verified automatic installer path.

**Verification commands:**

```text
node --test test/cloudflared-installer.test.mjs
npm run build
node --test test/*.test.mjs
npm run smoke
npm pack --dry-run
```

**Verification results:**

- Red test before implementation: 5 tests passed and the new test failed because `withVerifiedCloudflaredArgs` was undefined.
- Focused Cloudflared suite after implementation: 6/6 passed.
- TypeScript build: exit `0`.
- Consolidated regression suite: 22/22 passed, 0 failed, 0 skipped.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; the package still exposes `scripts/codexpro-entry.mjs` through the existing `bin` mapping.
- No staging, commit, push, credential change, live tunnel change, deletion, or Phase 1 work occurred.

**Decisions made:**

- Pass the exact verified path as an explicit CLI option instead of modifying PATH ordering.
- Keep `--no-install-cloudflared` as a second defense so the protected legacy downloader cannot run.
- Keep manual explicit `--cloudflared` overrides available; the verified guarantee applies only when the public entry performs automatic verified installation.
- Do not combine this step with Windows CI or npm package-content changes.

**Risks or limitations:**

- Direct internal invocation of `scripts/codexpro.mjs` bypasses the verified public entry and retains legacy behavior. Published `codexpro` and `npm run connect*` commands use the public entry.
- The installer still needs network access when the pinned binary is absent.
- The Windows CI blocker, package-memory inclusion issue, npm install-script warning, and untracked `=/npm-cache/` directory remain unresolved.

**Rollback method:**

- Remove `verifiedCloudflaredPath()` and `withVerifiedCloudflaredArgs()`, restore the previous `--no-install-cloudflared`-only forwarding, remove the new regression test, and revert the STEP-020 memory updates.

**Next step:** Fix only the Windows CI workflow so it runs the compatibility wrappers or full smoke command and the complete regression suite. Do not begin Phase 1.

---

## 2026-07-11 — STEP-021: Run complete regression and smoke suites in cross-platform CI

**Status:** Completed locally; remote GitHub Actions not yet run

**Goal:** Fix only the third STEP-018 blocker so both Ubuntu and Windows GitHub Actions execute the complete regression suite and the platform-compatible full smoke suite.

**Files changed:**

- `.github/workflows/ci.yml`
- `test/ci-workflow.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added a failing static regression test for the CI workflow.
- The test requires both Ubuntu and Windows jobs to run `node --test test/*.test.mjs` and `npm run smoke`.
- The test also forbids direct Windows invocation of `node scripts/settings-smoke.mjs`, which bypasses the Windows realpath compatibility wrapper.
- Replaced the four manually selected test commands in both jobs with the complete regression-suite command.
- Replaced the Windows two-script smoke subset with `npm run smoke`, which already routes Windows-sensitive scripts through the platform compatibility wrappers.
- Kept the existing Node 20/24 matrices, build step, and `npm pack --dry-run` package-content check unchanged.

**Verification commands:**

```text
node --test test/ci-workflow.test.mjs
npm run build
node --test test/*.test.mjs
npm run smoke
npm pack --dry-run
```

**Verification results:**

- Red test before implementation: failed because Ubuntu lacked the complete regression command; Windows also contained the raw settings smoke command.
- Focused CI workflow regression after implementation: 1/1 passed.
- TypeScript build: exit `0`.
- Consolidated regression suite: 23/23 passed, 0 failed, 0 skipped.
- Complete smoke suite: all 8 sequential sections passed on the local Windows machine.
- Package dry-run: exit `0`.
- All three STEP-018 code/CI blockers are now fixed locally.
- No staging, commit, push, remote workflow run, credential change, deletion, or Phase 1 work occurred.

**Decisions made:**

- Use complete suite commands in CI rather than manually maintaining a list of selected tests.
- Use the existing `npm run smoke` compatibility entry on both platforms so Windows receives the required wrappers automatically.
- Keep package-content cleanup, npm install-script review, and cache-directory cleanup as separate steps.

**Risks or limitations:**

- GitHub Actions has not run remotely because the working tree remains uncommitted and unpushed.
- The npm tarball still includes `docs/memory/archive/phase-0-and-0.5.md`; this remains the next package-content decision.
- The `esbuild@0.28.1` install-script policy warning and untracked `=/npm-cache/` directory remain unresolved.

**Rollback method:**

- Restore the previous selected CI test steps and Windows smoke subset, remove `test/ci-workflow.test.mjs`, and revert the STEP-021 memory updates.

**Next step:** Resolve only the npm package-content decision by excluding `docs/memory/archive/` from the published tarball or explicitly approving its distribution, then rerun package verification. Do not begin Phase 1.

---

## 2026-07-11 — STEP-022: Exclude internal memory archives from the published npm package

**Status:** Completed

**Goal:** Fix only the package-content issue found in STEP-018 so the published npm tarball retains the documentation website but does not distribute the internal project memory archive.

**Files changed:**

- `package.json`
- `test/package-contents.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added a real package-content regression test using `npm pack --dry-run --json --ignore-scripts`.
- Verified the test failed before the fix because `docs/memory/archive/phase-0-and-0.5.md` appeared in the package file list.
- Replaced the broad `docs` entry in `package.json#files` with explicit top-level website asset patterns for HTML, JavaScript, CSS, and SVG files.
- Preserved all seven documentation website assets while excluding nested internal memory files.
- Made the regression test invoke the npm CLI directly through Node so Windows runs without `shell: true` or deprecation warnings.

**Verification commands:**

```text
node --test test/package-contents.test.mjs
npm run build
node --test test/*.test.mjs
npm run smoke
npm pack --dry-run
```

**Verification results:**

- Initial test harness attempt failed before npm execution because Node could not directly spawn `npm.cmd`; the harness was corrected and rerun.
- Correct red test: failed because the package still contained `docs/memory/`.
- Focused package-content regression after the fix: 1/1 passed without warnings.
- TypeScript build: exit `0`.
- Consolidated regression suite: 24/24 passed, 0 failed, 0 skipped.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; 96 files; package size approximately 289.0 kB; all documentation website assets retained; no `docs/memory/` entry present.
- No staging, commit, push, deletion, credential change, remote workflow run, or Phase 1 work occurred.

**Decisions made:**

- Exclude internal implementation memory from the public package rather than approve its distribution.
- Use positive top-level asset patterns instead of relying on a negative ignore rule against the broad `docs` inclusion.
- Keep the project memory files in the repository for local workflow continuity.
- Do not combine this step with the `esbuild` install-script review or cache-directory cleanup.

**Risks or limitations:**

- Future documentation website assets with a new extension or nested directory must be added explicitly to `package.json#files`.
- Remote GitHub Actions has not yet run because the working tree remains uncommitted and unpushed.
- The `esbuild@0.28.1` install-script policy warning and untracked `=/npm-cache/` directory remain unresolved.

**Rollback method:**

- Restore the broad `docs` package entry, remove `test/package-contents.test.mjs`, and revert the STEP-022 memory updates.

**Next step:** Review only the `esbuild@0.28.1` npm install-script policy warning, then handle the untracked `=/npm-cache/` directory and perform a final diff review. Do not begin Phase 1.

---

## 2026-07-11 — STEP-023: Review and pin the esbuild install-script approval

**Status:** Completed

**Goal:** Resolve only the npm install-script policy warning for `esbuild@0.28.1` without broadly allowing dependency scripts or changing unrelated dependencies.

**Files changed:**

- `package.json`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Investigation summary:**

- `npm explain esbuild` confirmed that `esbuild@0.28.1` is a development-only transitive dependency of `tsx@4.22.4`.
- The lockfile records one install script for esbuild: `postinstall: node install.js`.
- `npm ci` reproduced the exact policy warning and still completed with 0 vulnerabilities.
- `npm install-scripts ls` reported esbuild as the only package with an unreviewed install script.
- A dry-run approval request reported that it would add only `esbuild@0.28.1`; however, this npm version unexpectedly wrote the approval despite `--dry-run`. The resulting change was retained only after full verification.

**Implementation summary:**

- Added a pinned `allowScripts` entry for exactly `esbuild@0.28.1` in `package.json`.
- Did not add a wildcard, unversioned approval, or approval for any other dependency.
- Rebuilt esbuild with foreground scripts and observed the expected `postinstall: node install.js` execution.

**Verification commands:**

```text
npm explain esbuild
npm explore esbuild -- npm pkg get scripts
npm ci
npm install-scripts ls
npm install-scripts approve esbuild --dry-run --json
npm rebuild esbuild --foreground-scripts
npx --no-install esbuild --version
npx --no-install tsx --version
npm ci
npm run build
node --test test/*.test.mjs
npm run smoke
npm pack --dry-run
```

**Verification results:**

- Dependency chain: `tsx@4.22.4 -> esbuild@0.28.1`.
- Approved install script: only `esbuild@0.28.1`.
- `npm install-scripts ls`: no packages with unreviewed install scripts.
- esbuild rebuild: completed successfully and ran the expected postinstall command.
- esbuild executable: version `0.28.1`.
- tsx executable: version `4.22.4`.
- Fresh `npm ci`: completed without the prior allow-scripts warning and reported 0 vulnerabilities.
- TypeScript build: exit `0`.
- Consolidated regression suite: 24/24 passed, 0 failed, 0 skipped.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; 96 files; internal memory archive remained excluded.
- No staging, commit, push, deletion, credential change, remote workflow run, or Phase 1 work occurred.

**Decisions made:**

- Approve the script because it belongs to the pinned development dependency required by `tsx`, executes successfully, and the approval can be constrained to the exact installed version.
- Pin the approval to `esbuild@0.28.1` so a future version change requires explicit re-review.
- Do not use `--ignore-scripts`, because that would silently disable the dependency's expected installation verification and could break development tooling.
- Do not combine this step with cache-directory cleanup or final diff review.

**Risks or limitations:**

- A future `tsx` update may select a different esbuild version; npm should then warn again until the new version is reviewed.
- The observed `--dry-run` mutation differs from the command help text and should not be relied upon as non-mutating in this environment.
- The untracked `=/npm-cache/` directory remains the only cleanup item before final diff review.

**Rollback method:**

- Remove the `allowScripts` object from `package.json` and revert the STEP-023 memory updates. The warning will return on the next `npm ci`.

**Next step:** Clean only the untracked `=/npm-cache/` directory, then perform a final complete diff review before deciding whether to stage, commit, or push. Do not begin Phase 1.

---

## 2026-07-11 — STEP-024: Remove the accidental workspace npm cache directory

**Status:** Completed

**Goal:** Remove only the untracked `=/npm-cache/` directory before staging, without deleting project source files or changing build configuration.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Cleanup summary:**

- Inspected the `=/` tree before deletion.
- Confirmed its only top-level entry was `npm-cache`, containing npm `_cacache` data and log files rather than project source.
- Used an exact-path Node cleanup command that required the resolved target to equal `D:\\Dev\\codexpro\\=`.
- Required the directory contents to be exactly one entry named `npm-cache` before deletion.
- Removed the complete accidental `=/` directory recursively.

**Verification:**

- The cleanup command exited `0` and reported removal of `D:\\Dev\\codexpro\\=`.
- A fresh workspace change review no longer contained `?? =/`.
- All other modified and untracked Phase 0.5 project files remained present.
- No source, configuration, memory, test, credential, tunnel, or remote state was deleted.
- No staging, commit, push, remote workflow run, or Phase 1 work occurred.

**Decisions made:**

- Delete the accidental cache rather than add it to `.gitignore`, so unnecessary generated data does not remain inside the repository.
- Use bounded preconditions instead of an unrestricted recursive deletion command.
- Do not combine cleanup with final diff review, staging, commit, or push.

**Risks or limitations:**

- If a future npm command is configured with the same malformed cache path, the directory could be recreated and should be investigated separately.
- The complete Phase 0.5 diff still requires one final review before any staging or commit decision.

**Rollback method:**

- No rollback is needed for disposable npm cache data. npm can recreate cache content when required.

**Next step:** Perform only the final complete Phase 0.5 diff review, then decide whether the changes are ready to stage, commit, and push. Do not begin Phase 1.

---

## 2026-07-11 — STEP-025: Final complete Phase 0.5 diff review

**Status:** Review completed; not approved for staging or commit

**Goal:** Review the complete Phase 0.5 working tree against the implementation specification, inspect security-sensitive and platform-sensitive changes, rerun fresh verification, and decide whether the work is ready to stage.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Review scope:**

- Complete tracked and untracked working-tree inventory.
- Windows and Ubuntu CI workflow and its static regression test.
- Public CLI compatibility entry and saved-profile behavior.
- Verified Cloudflared release manifest, installer, binary replacement, and exact-path forwarding.
- Doctor wrapper and selected Bash backend handling.
- Windows path validation, canonical real paths, junctions, symbolic links, blocked globs, reserved paths, ADS, and cross-drive handling.
- HTTP Host and Origin policy, CORS, security headers, Bearer and query-token behavior, and request-log redaction.
- Windows smoke compatibility wrappers and realpath shim.
- npm package contents and install-script approval policy.
- Project instructions, memory protocol, and Phase 0.5 scope boundaries.

**Important findings:**

1. **Saved non-Cloudflare profiles are incorrectly forced through the Cloudflared installer.**
   - `scripts/codexpro-entry.mjs#requiresVerifiedCloudflared()` treats plain `codexpro start` as requiring Cloudflared before the saved profile is read.
   - The legacy CLI later resolves the effective tunnel from the saved profile and supports `none`, `ngrok`, and `tailscale`.
   - A saved non-Cloudflare profile can therefore fail offline during an unnecessary Cloudflared download before reaching its intended startup path.
   - Existing tests assert that an empty argument list requires Cloudflared and do not cover saved non-Cloudflare profiles.

2. **The Windows Node 20 CI regression command is defective.**
   - Both CI jobs use `node --test test/*.test.mjs`.
   - GitHub Actions uses PowerShell Core as the default Windows shell, so the command cannot rely on Bash glob expansion.
   - Direct Node 20 verification with the literal pattern failed with `Could not find ... test\\*.test.mjs`.
   - The documented directory form `node --test test` passed all 24 tests under Node 20.
   - The static workflow regression currently enforces the defective glob command instead of executing or validating the Node 20-compatible form.

3. **The Doctor wrapper ignores a saved profile's Bash mode during its preliminary shell check.**
   - `scripts/doctor.mjs#requestedBashMode()` reads only command-line arguments and environment variables, then defaults to `safe`.
   - The legacy Doctor correctly reads the saved profile afterward.
   - On a Windows machine without Bash, a profile saved with `bash: off` can therefore receive a false preliminary failure unless `--no-bash` is repeated explicitly.
   - Existing Doctor tests cover explicit `--no-bash` but not saved-profile inheritance.

**Minor finding:**

- `CLOUDFLARED_VERIFIED_INSTALL.md` states that verified starts pass `--no-install-cloudflared`; implementation now also passes the exact managed `--cloudflared` path and the documentation should state both.

**Reviewed decisions that remain intentional:**

- Direct HTTP starts default to Bearer authentication and reject query credentials.
- Tunnel starts temporarily retain query-token compatibility unless `CODEXPRO_ALLOW_QUERY_TOKEN=0` is set; this migration limitation was explicitly recorded earlier and is not treated as a newly introduced defect.
- Exact Host allowlisting, strict Origin handling, security headers, and request logging without query strings remain consistent with the approved Phase 0.5 design.
- The Cloudflared release is pinned with per-platform SHA-256 digests, bounded download size, version checking, staged replacement, and backup rollback.
- Windows path hardening and the associated path-policy coverage remain within Phase 0.5 scope.
- No Phase 1 architecture work, OAuth, native PowerShell backend, PTY, semantic-provider integration, or multi-workspace redesign was introduced.

**Verification commands:**

```text
git diff --check
npm ci
npm install-scripts ls
npm run build
node --test test/*.test.mjs
npm run smoke
npm pack --dry-run
npx --yes node@20 --test 'test/*.test.mjs'
npx --yes node@20 --test test
```

**Verification results:**

- `git diff --check`: exit `0`; only expected Windows LF-to-CRLF working-copy warnings were reported.
- Fresh `npm ci`: passed without install-script warnings; 0 vulnerabilities.
- Install-script review: no unreviewed scripts.
- TypeScript build: exit `0`.
- Local Node 24 consolidated suite: 24/24 passed, 0 failed, 0 skipped.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; 96 files; internal memory archive excluded.
- Node 20 with the literal CI glob: failed because the pattern was treated as a missing literal path.
- Node 20 with `node --test test`: 24/24 passed.
- Working tree remains unstaged, uncommitted, and unpushed.

**Decision:**

- Phase 0.5 is **not ready to stage or commit**.
- Passing current tests is insufficient because the three important defects are outside the covered cases or are encoded into the current static workflow test.
- Fix each blocker as a separate TDD step, rerun complete verification, and perform another final diff review before requesting staging approval.

**Risks or limitations:**

- Remote GitHub Actions has not run because no changes are committed or pushed.
- Until the saved-profile routing bug is fixed, offline local-only, ngrok, or Tailscale users may be blocked by an unnecessary Cloudflared installation attempt.
- Until the CI command is changed, the Windows Node 20 matrix entry is expected to fail before executing the test suite.
- Until Doctor inherits saved Bash mode, diagnostics can incorrectly report a missing Bash backend for a valid Bash-disabled profile.

**Rollback method:**

- Revert only the STEP-025 updates to `Memory.md` and this appended review record. No production code was changed during the review.

**Next step:** Fix only the saved-profile Cloudflared routing blocker with a failing regression test for saved `none`, `ngrok`, and `tailscale` profiles. Do not stage, commit, push, or begin Phase 1.

### Correction appended after final workspace-status verification

The first STEP-025 status check was incomplete because the accidental `=/npm-cache/` directory was recreated during the Node 20 `npx` verification. The archive record above remains unchanged; this correction supersedes its statements that the working tree had no regenerated cache and that only three important blockers remained.

**Additional evidence:**

```text
npm config get cache
npm config get userconfig
npm config get cache --location=global
npm config get userconfig --location=global
```

Results:

- Effective and global npm `cache`: `D:\\Dev\\codexpro\\=\\npm-cache`.
- Effective and global npm `userconfig`: `D:\\Dev\\codexpro\\=\\.npmrc`.
- Environment variables `npm_config_cache`, `NPM_CONFIG_CACHE`, and `npm_config_userconfig` were not set in the verification process.
- The regenerated `=/` tree contains npm cache data, logs, and the Node 20 `npx` installation.
- A fresh workspace status again reports `?? =/`.

**Corrected decision:**

- Four important blockers remain before staging: persistent external npm cache configuration, saved non-Cloudflare profile routing, Windows Node 20 CI command compatibility, and Doctor saved Bash-mode inheritance.
- The npm configuration is outside the repository and should be corrected as a separate explicit environment step before deleting `=/` again.
- The next step is therefore to correct only the external npm global `cache` and `userconfig` paths, verify their effective defaults, and then safely remove the regenerated `=/` directory. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-026: Neat-freak knowledge synchronization

**Status:** Completed

**Goal:** Reconcile the project rule and security documentation with the actual Phase 0.5 state and verified Cloudflared launch path without changing implementation code or external machine configuration.

**Files changed:**

- `AGENTS.md`
- `SECURITY.md`
- `CLOUDFLARED_VERIFIED_INSTALL.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Relabeled the original audit section in `AGENTS.md` as a historical baseline and changed its Ubuntu-only CI statement to past tense.
- Updated the Phase 0.5 status and approved stopping point in `AGENTS.md` to match the four blockers recorded by STEP-025.
- Updated the dedicated Cloudflared guide to state that verified starts pass both the exact managed `--cloudflared <path>` and `--no-install-cloudflared`.
- Replaced the stale latest-release/PATH resolution description in `SECURITY.md` with the supported pinned, SHA-256-verified managed-start flow.
- Clarified that direct invocation of `node scripts/codexpro.mjs` bypasses the verified public entry and is not the supported public launch path.
- Removed the completed Cloudflared documentation correction from the root open-item list.
- Added a deferred documentation-maintenance item for reducing the oversized `AGENTS.md` after Phase 0.5 closes.

**Verification commands:**

```text
node -e <knowledge-file size check>
node -e <stale wording and expected wording checks>
node -e <referenced Cloudflared files and package scripts checks>
git diff --check
```

**Verification results:**

- Old live-state wording for Ubuntu-only CI and Phase 0.5 completion is absent from active rule text.
- `AGENTS.md` contains the four current blockers and the correct next approved action.
- `CLOUDFLARED_VERIFIED_INSTALL.md` contains the exact managed-path forwarding behavior.
- `SECURITY.md` no longer describes a floating latest-release download as the supported public launch flow.
- Referenced files `scripts/cloudflared-release.mjs`, `scripts/cloudflared-installer.mjs`, `scripts/codexpro-entry.mjs`, and the phase archive exist.
- Package scripts `cloudflared:install`, `cloudflared:upgrade`, and `cloudflared:status` exist.
- `Memory.md`: 90 lines and 5,951 bytes before this archive append; below its 200-line/25-KB hard limit.
- `AGENTS.md`: 612 lines and 19,341 bytes; above the neat-freak soft target, so structural slimming remains deferred work.
- Phase archive: 1,792 lines and 82,056 bytes before this append; above the single-document soft target, but it remains append-only until phase closure.
- `git diff --check`: exit `0`; only existing Windows LF-to-CRLF warnings were reported.
- No build or runtime test was rerun because this step changed documentation and project memory only.
- No external npm configuration, source code, credentials, tunnel state, staging, commit, push, or Phase 1 work occurred.

**Decisions made:**

- Preserve the original audit findings as historical evidence rather than silently rewriting them into present-day claims.
- Keep `AGENTS.md` authoritative but defer its larger split until Phase 0.5 closes, because moving its roadmap and historical baseline is broader than this bounded synchronization step.
- Keep the current phase archive append-only despite exceeding the soft size target.
- Continue to treat the external npm configuration as the next blocker; documentation cleanup does not change that execution order.

**Risks or limitations:**

- `AGENTS.md` remains over the neat-freak soft size target and consumes more instruction attention than desired.
- The phase archive remains over the single-file soft target; a new archive should begin when Phase 0.5 closes.
- The four STEP-025 blockers remain unresolved, and `=/npm-cache/` remains present because its external configuration root cause was intentionally not modified here.

**Rollback method:**

- Revert the STEP-026 edits in `AGENTS.md`, `SECURITY.md`, `CLOUDFLARED_VERIFIED_INSTALL.md`, and `Memory.md`, then remove this appended archive entry.

**Next step:** Correct only the external npm global `cache` and `userconfig` paths, verify that npm no longer targets the repository, and safely remove the regenerated `=/` directory. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-027: npm HOME root-cause correction

**Status:** Environment correction completed; actual restarted-process verification remains pending.

**Goal:** Stop npm and npx from deriving cache and user-configuration paths inside the repository, correct the external environment root cause, and safely remove the regenerated `=/` directory without changing source code or beginning another blocker.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**External machine configuration changed:**

- User-level Windows environment variable `HOME` was set to `C:\Users\Administrator`, matching `USERPROFILE`.

**Implementation summary:**

- Reproduced the bad effective paths: npm resolved `cache` to `D:\Dev\codexpro\=\npm-cache` and `userconfig` to `D:\Dev\codexpro\=\.npmrc`.
- Confirmed that npm did not report explicit global overrides; instead, `npm config list --location=global` showed the effective HOME beneath the repository.
- Confirmed the direct process-level root cause: the running CodexPro process supplied `HOME="="`, while Windows user-level and machine-level HOME values were initially absent and `USERPROFILE` was `C:\Users\Administrator`.
- Tested the smallest hypothesis without persistence: temporarily supplying `HOME="$USERPROFILE"` moved npm `cache` to `C:\Users\Administrator\npm-cache` and `userconfig` to `C:\Users\Administrator\.npmrc`.
- Persisted the same value at Windows user scope rather than adding separate npm-specific cache and userconfig overrides.
- Verified that the persisted user HOME equals USERPROFILE.
- Removed `D:\Dev\codexpro\=` only after an exact-path guard confirmed the target basename was `=`, its parent was the repository root, and its only top-level entry was `npm-cache`.
- Confirmed through the workspace file tool that the `=/` path is absent.
- Did not modify production source, run package installation, stage, commit, push, or begin Phase 1.

**Verification commands:**

```text
npm config get cache --location=global
npm config get userconfig --location=global
npm config list --location=global
node -e <print HOME, USERPROFILE, HOMEDRIVE, HOMEPATH, and npm override variables>
powershell.exe -NoProfile -Command <read user, machine, and process HOME values>
HOME="$USERPROFILE" npm config get cache
HOME="$USERPROFILE" npm config get userconfig
powershell.exe -NoProfile -Command <persist HOME=USERPROFILE at user scope>
powershell.exe -NoProfile -Command <verify persisted user HOME equals USERPROFILE>
node -e <exact-path and top-level-content guarded removal of =>
CodexPro tree inspection for `=`
node -e <Memory.md size and stray `=` directory check>
git diff --check
CodexPro show_changes
```

**Verification results:**

- Initial effective global cache: `D:\Dev\codexpro\=\npm-cache`.
- Initial effective global userconfig: `D:\Dev\codexpro\=\.npmrc`.
- Initial running-process HOME: `=`.
- Initial Windows user HOME: absent.
- Initial Windows machine HOME: absent.
- Windows `USERPROFILE`: `C:\Users\Administrator`.
- Persisted Windows user HOME after correction: `C:\Users\Administrator`.
- Simulated new-process npm cache with corrected HOME: `C:\Users\Administrator\npm-cache`.
- Simulated new-process npm userconfig with corrected HOME: `C:\Users\Administrator\.npmrc`.
- Guarded removal completed with exit code `0`.
- Final workspace inspection reports `ENOENT` for `D:\Dev\codexpro\=`, confirming the accidental directory is absent.
- `Memory.md` is 95 lines and 6,746 bytes, below its 200-line/25-KB hard limit; the same check reported `strayEqualsDirectory: false`.
- `git diff --check` exited `0`; only the pre-existing Windows LF-to-CRLF working-copy warnings were reported.
- Final `show_changes` reported no `?? =/` entry and confirmed that no content is staged.
- No build or test suite was run because this step changed only external environment configuration and project memory.

**Decisions made:**

- Correct the shared HOME root cause instead of layering npm-specific cache and userconfig overrides on top of a malformed process environment.
- Keep the correction at user scope and leave machine scope unchanged.
- Do not claim the currently running CodexPro process is corrected: Windows processes retain their inherited environment until restarted.
- Stop after this single environment issue; the three source-code blockers remain separate future steps.

**Risks or limitations:**

- The currently running CodexPro server still reports `HOME="="`; any npm or npx command launched from it without an explicit HOME override could recreate repository-local state before restart.
- Actual activation must be verified after restarting CodexPro or its hosting terminal/process.
- The effective cache path under this portable Node/npm installation is `C:\Users\Administrator\npm-cache`; it is outside the repository but differs from the conventional `%LOCALAPPDATA%\npm-cache` location.
- Remote CI remains unrun because there is still no commit or push.

**Rollback method:**

- Remove the user-level HOME value with `[Environment]::SetEnvironmentVariable('HOME', $null, 'User')`, restart the hosting process, and revert the STEP-027 updates in `Memory.md` plus this appended archive entry.

**Next step:** Restart CodexPro so it inherits the corrected user-level HOME. Then verify the actual process HOME, npm `cache`, npm `userconfig`, and absence of `=/`. Do not address the saved-profile routing blocker until that activation check passes; do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-028: Restarted-process HOME verification

**Status:** Completed

**Goal:** Verify only whether the restarted CodexPro process inherited the corrected Windows user HOME value.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Opened the configured CodexPro workspace after restart.
- Printed the process-level `HOME` and `USERPROFILE` values through Node.js.
- Confirmed both values are `C:\Users\Administrator`.
- Did not run npm configuration checks, modify source code, stage, commit, push, or begin another blocker.

**Verification command:**

```text
node -e "console.log(JSON.stringify({HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE},null,2))"
```

**Verification result:**

- Exit code: `0`.
- `HOME`: `C:\Users\Administrator`.
- `USERPROFILE`: `C:\Users\Administrator`.
- The malformed inherited value `HOME="="` is no longer present in the restarted CodexPro process.
- Git Bash also created a normal user-profile `.bash_profile` loader because `.bashrc` existed without a login profile; this did not modify the repository.

**Decisions made:**

- Treat process-HOME activation as verified.
- Keep npm `cache`, npm `userconfig`, and `=/` absence checks as the next separate small step.

**Risks or limitations:**

- This step proves only environment inheritance. It does not yet prove npm resolves both paths outside the repository or that npm commands will not recreate `=/`.

**Rollback method:**

- No machine or source change was made in this step. Revert only the STEP-028 edits in `Memory.md` and remove this appended archive entry if the record must be rolled back.

**Next step:** Verify only npm `cache` and `userconfig` under the restarted process and confirm the repository-local `=/` directory remains absent. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-029: npm path activation verification

**Status:** Completed

**Goal:** Verify that the restarted CodexPro process now gives npm safe user-directory paths and does not recreate the repository-local `=/` directory.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Ran npm configuration checks from the restarted CodexPro process without any temporary HOME override.
- Confirmed npm `cache` resolves to `C:\Users\Administrator\npm-cache`.
- Confirmed npm `userconfig` resolves to `C:\Users\Administrator\.npmrc`.
- Confirmed the repository-local `=/` directory remains absent after both npm commands.
- Updated the root memory index to close the npm path blocker and make saved non-Cloudflare profile routing the next approved code step.
- An initial Bash one-line attempt to update `Memory.md` allowed shell command substitution inside Markdown backticks and partially changed the index. The file was immediately inspected and repaired using exact text-edit operations; no source file or external configuration was affected.
- Did not modify production source, stage, commit, push, or begin Phase 1.

**Verification commands:**

```text
npm config get cache
npm config get userconfig
node -e "const fs=require('node:fs');const exists=fs.existsSync('=');console.log(JSON.stringify({strayEqualsDirectory:exists},null,2));if(exists)process.exit(1);"
```

**Verification results:**

- npm cache command: exit `0`; result `C:\Users\Administrator\npm-cache`.
- npm userconfig command: exit `0`; result `C:\Users\Administrator\.npmrc`.
- Stray-directory check: exit `0`; `strayEqualsDirectory: false`.
- Both resolved paths are outside `D:\Dev\codexpro`.
- The original npm path pollution is no longer reproducible after restart.

**Decisions made:**

- Mark the external npm path blocker as resolved.
- Keep the portable Node/npm default cache location under the user profile because it is outside the repository and does not require an additional npm-specific override.
- Proceed next only with the saved `none`, `ngrok`, and `tailscale` profile routing blocker.

**Risks or limitations:**

- This verification does not address the remaining three source-code blockers.
- Remote Windows CI remains unrun because no changes are committed or pushed.
- Avoid embedding Markdown backticks inside Bash-delivered JavaScript edit commands; use the repository exact-edit tool for memory updates.

**Rollback method:**

- Revert only the STEP-029 edits in `Memory.md` and remove this appended archive entry. No source or machine configuration change was made in this step.

**Next step:** Fix only the saved non-Cloudflare profile routing blocker. Add failing regression coverage for saved `none`, `ngrok`, and `tailscale` profiles before changing implementation. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-030: Saved-profile Cloudflared routing

**Status:** Completed

**Goal:** Prevent the public CodexPro entry from installing or requiring Cloudflared when `codexpro start` inherits a saved `none`, `ngrok`, or `tailscale` profile, while preserving verified Cloudflared installation for Cloudflare modes.

**Files changed:**

- `scripts/codexpro-entry.mjs`
- `test/cloudflared-installer.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Traced the startup flow and confirmed the public entry called `requiresVerifiedCloudflared()` before the legacy CLI loaded the saved workspace profile.
- Added a real temporary profile-file regression test covering saved `none`, `ngrok`, and `tailscale` values.
- Verified the new test failed before implementation because a saved `none` profile returned `true` and would trigger the installer.
- Added bounded saved-profile tunnel resolution to the public entry using the same canonical root, profile ID, and `CODEXPRO_HOME/profiles` layout as the legacy CLI.
- The installation decision now resolves tunnel precedence as command-line `--tunnel`, `CODEXPRO_TUNNEL`, saved profile, then default `cloudflare`.
- Explicit `stable` continues to require verified Cloudflared; non-start subcommands retain their previous behavior.
- `--no-profile`, explicit `--no-install-cloudflared`, and explicit `--cloudflared` behavior remains unchanged.
- Made the pre-existing default-start assertions independent of the developer's real saved profile.
- Did not stage, commit, push, or begin Phase 1.

**Verification commands:**

```text
node --test test/cloudflared-installer.test.mjs
npx --yes node@20 --test test/cloudflared-installer.test.mjs
node --test test/*.test.mjs
npm run build
npm run smoke
node --test test
```

**Verification results:**

- TDD red phase: focused suite failed 1/7 with `saved none profile should not require Cloudflared`; actual `true`, expected `false`.
- TDD green phase on Node 24: focused suite passed 7/7.
- Focused suite on Node 20: passed 7/7.
- Consolidated local Node 24 suite: passed 25/25.
- TypeScript build: exit `0`.
- Complete smoke suite: all 8 sequential sections passed.
- `node --test test` failed on the current Node 24 because the directory was treated as a module path; no tests were executed by that command.
- The failed directory-form verification is new evidence for the separate CI command blocker and does not indicate a regression in this implementation.

**Decisions made:**

- Resolve the effective tunnel before invoking the verified installer instead of installing first and relying on the legacy CLI to correct routing later.
- Read only the bounded workspace profile selected by canonical root; malformed, missing, array, or root-mismatched profiles fall back to the default Cloudflare decision.
- Keep this step limited to saved-profile routing; do not alter CI or Doctor behavior here.
- Revise the next CI task: do not assume `node --test test` is cross-version compatible. Select and verify one command across Node 20, Node 24, Ubuntu shells, and Windows PowerShell.

**Risks or limitations:**

- Profile parsing logic is now present in both the public entry and legacy CLI; a later bounded refactor may centralize it, but that is outside this bug fix.
- Remote GitHub Actions remains unrun because no changes are committed or pushed.
- The separate Windows CI command and Doctor saved Bash-mode blockers remain unresolved.

**Rollback method:**

- Revert the STEP-030 changes in `scripts/codexpro-entry.mjs`, `test/cloudflared-installer.test.mjs`, and `Memory.md`, then remove this appended archive entry.

**Next step:** Fix only the CI test command. First identify a command that executes all tests under Node 20 and Node 24 without relying on shell glob expansion, then update the workflow and its static regression test. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-031: Cross-shell CI test discovery

**Status:** Completed

**Goal:** Replace the CI regression command that depended on shell glob expansion with one command that executes the complete Node test suite under Node 20 and Node 24 on both Ubuntu and Windows runners.

**Files changed:**

- `.github/workflows/ci.yml`
- `test/ci-workflow.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Reconfirmed the original defect: `node --test test/*.test.mjs` depends on shell expansion and therefore fails under the default Windows PowerShell shell on Node 20.
- Rejected `node --test test` because it passed under the tested Node 20 invocation but failed under the current Node 24 by treating `test` as a module path.
- Verified the shell-independent candidate `node --test`, which uses Node's built-in test discovery and requires no path expansion.
- Updated the static CI regression first so the old workflow failed with a clear assertion that both jobs must use exact `node --test` discovery.
- Changed only the Ubuntu and Windows `Regression Tests` steps from the glob command to `node --test`.
- Kept the existing Node 20/24 matrices, build, smoke, and package checks unchanged.
- Did not modify Doctor behavior, stage, commit, push, or begin Phase 1.

**Verification commands:**

```text
node --test test/ci-workflow.test.mjs
node --test
npx --yes node@20 --test
powershell.exe -NoProfile -EncodedCommand <run the current Node executable with --test in the repository and propagate its exit code>
npm run build
npm run smoke
npm pack --dry-run
git diff --check
```

**Verification results:**

- TDD red phase: the focused CI workflow test failed 0/1 against the old workflow with `Ubuntu CI must use Node test discovery without shell-expanded paths`.
- TDD green phase: the focused CI workflow test passed 1/1 after both workflow commands changed.
- Node 24 built-in discovery: 25/25 tests passed.
- Node 20 built-in discovery: 25/25 tests passed.
- Windows PowerShell invocation of the current Node executable with `--test`: 25/25 tests passed and exit code `0`.
- TypeScript build: exit `0`.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; 96 files; internal memory archive remained excluded.
- Final focused workflow regression rerun: 1/1 passed.
- `Memory.md`: 99 lines and 7,129 bytes; below its hard limits.
- Stray repository-local `=/` check: absent.
- `git diff --check`: exit `0`; only existing Windows LF-to-CRLF warnings were reported.
- Final unfiltered workspace status confirmed the Phase 0.5 changes remain unstaged, uncommitted, and unpushed.
- The local portable Node installation is not present on a fresh PowerShell PATH, so the PowerShell verification invoked its exact executable path. GitHub Actions `setup-node` supplies `node` on PATH for the actual runner.

**Decisions made:**

- Use `node --test` as the single CI regression command for all four matrix combinations.
- Prefer Node's own test discovery over shell-specific path expansion or a new wrapper script.
- Keep the static test strict enough to reject additional path arguments after `--test`.
- Leave remote GitHub Actions execution pending until the user approves staging, commit, and push.

**Risks or limitations:**

- Remote Ubuntu and Windows matrix jobs have not run because the work remains uncommitted and unpushed.
- Node's default test discovery is now part of the CI contract; new regression files must continue to follow Node's recognized test naming/location conventions.
- The Doctor saved Bash-mode inheritance defect remains the final code blocker before the next complete diff review.

**Rollback method:**

- Restore both workflow commands to their previous values, revert the assertion in `test/ci-workflow.test.mjs`, revert the STEP-031 `Memory.md` updates, and remove this appended archive entry.

**Next step:** Fix only `scripts/doctor.mjs` so its preliminary Bash availability check resolves the effective saved profile Bash mode before failing. Add a failing saved-profile regression test first. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-032: Doctor saved Bash-mode inheritance

**Status:** Completed

**Goal:** Prevent the Doctor wrapper from reporting a missing Bash executable when the effective saved workspace profile already sets `bash: off`.

**Files changed:**

- `scripts/doctor.mjs`
- `test/doctor-shell.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Traced the wrapper flow and confirmed `shellCheck()` ran before the saved-profile validation while `requestedBashMode()` read only command-line arguments and `CODEXPRO_BASH_MODE`, then defaulted to `safe`.
- Added a real temporary workspace profile regression test with `bash: off` and an intentionally missing Bash command.
- Verified the new test failed before implementation with status `1`, proving the preliminary check ignored the saved profile.
- Added bounded saved-profile Bash-mode resolution using the canonical workspace root, `CODEXPRO_HOME/profiles`, the existing profile ID algorithm, object validation, and root matching.
- The effective preliminary Bash-mode precedence is now explicit `--no-bash`, explicit `--bash`, `CODEXPRO_BASH_MODE`, saved profile, then default `safe`.
- `--no-profile` bypasses saved-profile inheritance.
- Stabilized the existing unavailable-Bash test by adding `--no-profile`, so it cannot depend on the developer machine's real saved profile.
- Did not alter the legacy Doctor implementation, other source behavior, staging, commits, pushes, or Phase 1.

**Verification commands:**

```text
node --test test/doctor-shell.test.mjs
npx --yes node@20 --test test/doctor-shell.test.mjs
node --test
npm run build
npm run smoke
npm pack --dry-run
```

**Verification results:**

- TDD red phase: focused Doctor suite passed 2/3 and failed the saved-profile test because status was `1` instead of `0`.
- TDD green phase on Node 24: focused Doctor suite passed 3/3.
- Focused Doctor suite on Node 20: passed 3/3.
- Consolidated Node 24 regression suite: passed 26/26.
- TypeScript build: exit `0`.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; 96 files; internal memory archive remained excluded.

**Decisions made:**

- Match the effective configuration precedence without changing the public CLI contract.
- Accept only saved Bash values `off`, `safe`, or `full` for the preliminary decision; malformed, missing, array, root-mismatched, or invalid profiles fall back safely.
- Keep this fix local to the Doctor wrapper rather than introducing a broader profile-module refactor during Phase 0.5.
- Treat all four blockers found by STEP-025 as resolved; require a fresh complete diff review before staging approval.

**Risks or limitations:**

- Profile path and parsing logic remains duplicated across the public entry, Doctor wrapper, and legacy CLI; consolidation is deferred because it would broaden this bug fix.
- Remote Ubuntu and Windows GitHub Actions remain unrun because no changes are committed or pushed.
- Completion of this step does not itself authorize staging, commit, push, or Phase 1.

**Rollback method:**

- Revert the STEP-032 changes in `scripts/doctor.mjs`, `test/doctor-shell.test.mjs`, and `Memory.md`, then remove this appended archive entry.

**Next step:** Perform a fresh final complete Phase 0.5 diff review and rerun the approved verification gates. Do not stage, commit, push, or begin Phase 1 until that review is complete and the user explicitly approves the next action.

---

## 2026-07-11 — STEP-033: Final Phase 0.5 diff review

**Status:** Completed; staging remains blocked

**Goal:** Review the complete unstaged Phase 0.5 implementation against its explicit security and Windows acceptance criteria, rerun all approved local verification gates from a fresh install, and decide whether the work is ready for staging.

**Files changed by this review step:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Review scope:**

- Reviewed the complete workspace change set, including 310 tracked-line additions and 39 tracked-line deletions plus all untracked Phase 0.5 scripts, tests, documentation, and memory files.
- Inspected Windows path canonicalization and blocked-path enforcement.
- Inspected HTTP Host, Origin, security-header, Bearer, and query-token behavior.
- Inspected the public entry wrapper, saved-profile routing, Doctor wrapper, CI matrices, package contents, Bash probing, and verified Cloudflared installation flow.
- Compared behavior with the Phase 0.5 acceptance rules in `AGENTS.md` and the implementation specification.
- Reproduced suspected defects with bounded local commands and temporary profiles; no production source was changed during the review.

**Confirmed staging blockers:**

1. **Query-token authentication is not disabled by default for tunnel launches.**
   - `loadConfig()` currently falls back from `CODEXPRO_ALLOW_QUERY_TOKEN` to `CODEXPRO_TUNNEL_MODE`.
   - Reproduction with `CODEXPRO_TUNNEL_MODE=1` and no explicit compatibility setting returned `allowQueryToken: true`.
   - Phase 0.5 acceptance requires query-token authentication to be off by default and available only through the explicit migration flag.
   - The focused HTTP security test covers local `CODEXPRO_TUNNEL_MODE=0` and explicit compatibility mode, but not the default tunnel-launch path.

2. **Documented `codexpro connection-test` bypasses the verified Cloudflared installer.**
   - The public entry returns `requiresVerifiedCloudflared=false` for `connection-test`.
   - The legacy CLI then converts `connection-test` into a read-only runtime profile but still uses its default Cloudflare tunnel.
   - Therefore this documented public command can reach the legacy Cloudflared resolution path without the managed `ensure` step or exact pinned binary forwarding.
   - Existing Cloudflared routing tests cover `start`, `stable`, saved non-Cloudflare profiles, and explicit overrides, but not `connection-test`.

3. **Full Doctor does not honor `--no-profile` during profile validation.**
   - The Bash-mode resolver respects `--no-profile`, but the full wrapper still calls `savedProfileCheck()` unconditionally.
   - A temporary invalid workspace profile remained visible to `doctor --no-profile`, producing `invalid saved value` output.
   - The current Doctor test uses `--no-profile` only with `--shell-check-only`, which exits before full saved-profile validation.

**Non-blocking review limitations and follow-up risks:**

- Direct Cloudflared assets are re-hashed during later `ensure/status`, but macOS archive installs are subsequently checked only by reported version because the manifest contains the archive digest rather than the extracted executable digest.
- Cloudflare quick-tunnel Host forwarding still requires real external validation. The local server now rejects unknown Host headers, while quick-tunnel hostnames are discovered only after the server starts and are not added to the allowlist in advance.
- Remote Ubuntu and Windows GitHub Actions remain unrun because the work is still uncommitted and unpushed.

**Fresh verification commands:**

```text
npm ci
npm run build
node --test
npx --yes node@20 --test
npm run smoke
npm pack --dry-run
npm install-scripts ls
git diff --check
```

**Fresh verification results:**

- `npm ci`: exit `0`; 112 packages installed; 0 vulnerabilities; no install-script warnings.
- TypeScript build: exit `0`.
- Node 24 regression suite: 26/26 passed.
- Node 20 regression suite: 26/26 passed.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; 96 files; website assets retained; internal memory archive excluded.
- Install-script review: no packages with unreviewed install scripts.
- `git diff --check`: exit `0`; only existing Windows LF-to-CRLF warnings were reported.
- Root memory remained below limits before this record: 100 lines and 7,351 bytes.
- Repository-local `=/` directory remained absent.
- Final workspace status remained unstaged, uncommitted, and unpushed.

**Decision:**

- Do not approve staging, commit, or push merely because all automated gates pass.
- Treat the three confirmed acceptance defects as blockers because they affect authentication defaults, verified binary routing, and an explicit `--no-profile` contract.
- Keep this step review-only. Fix each blocker separately with a failing regression test before implementation.
- Do not begin Phase 1.

**Rollback method:**

- Revert only the STEP-033 updates in `Memory.md` and remove this appended archive entry. No production source or machine configuration was changed during this review.

**Next step:** Fix only the query-token default. Require explicit `CODEXPRO_ALLOW_QUERY_TOKEN=1` even when `CODEXPRO_TUNNEL_MODE=1`, add a failing tunnel-mode regression first, and align migration-facing documentation. Do not address the other two blockers in the same step; do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-034: Neat-freak documentation synchronization

**Status:** Completed

**Goal:** Reconcile active project rules and Cloudflared security documentation with the STEP-033 review, remove stale live-state instructions, and preserve the existing code and Git state.

**Files changed:**

- `AGENTS.md`
- `SECURITY.md`
- `CLOUDFLARED_VERIFIED_INSTALL.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Loaded and followed the `neat-freak` skill.
- Read the complete `AGENTS.md` and `Memory.md`, enumerated the repository documentation, and searched all Markdown files for Phase 0.5, query-token, `connection-test`, verified-installer, and `--no-profile` references.
- Updated the active Phase 0.5 status in `AGENTS.md`: the four STEP-025 blockers are resolved, while the three STEP-033 blockers remain open.
- Replaced the stale approved action that still instructed npm HOME/cache cleanup with the current single next action: fix the query-token default.
- Narrowed the verified Cloudflared claim in `SECURITY.md` to the start paths that are actually covered and recorded `connection-test` as the known exception.
- Applied the same scope correction to `CLOUDFLARED_VERIFIED_INSTALL.md`.
- Preserved the append-only archive and updated the concise root memory index.
- Attempted to add the same warning to `README.md`; the project's secret-content guard rejected the edit because the file contains protected token examples. The guard was not bypassed. FAQ files contain the same protected token-oriented troubleshooting text and were therefore left unchanged.
- Did not change production code, tests, package metadata, machine configuration, or remote state.

**Verification commands and checks:**

```text
CodexPro tree/read/search across root Markdown and docs/memory
CodexPro read of final active-rule and security-document sections
CodexPro search for stale STEP-025/npm stopping-point wording and overbroad verified-installer claims
git diff --check
CodexPro show_changes
Memory.md line/byte and stray `=/` checks
```

**Verification results:**

- `AGENTS.md` current status and stopping point now match STEP-033 and `Memory.md`.
- `SECURITY.md` and `CLOUDFLARED_VERIFIED_INSTALL.md` no longer claim that every documented Cloudflare-related subcommand is routed through the verified installer.
- No production source file was modified in this step.
- `README.md`/FAQ synchronization remains deferred rather than bypassing secret-content protections.
- `Memory.md` remains below its 200-line/25-KB hard limit.
- `AGENTS.md` remains above its soft size target; the existing decision to split historical baseline and roadmap material after Phase 0.5 closes remains active.
- Working tree remains unstaged, uncommitted, and unpushed.

**Decisions made:**

- Keep active project rules authoritative and current even while the implementation is blocked.
- Prefer precise, bounded security claims over documenting a guarantee that the code does not yet provide.
- Do not rewrite historical archive entries; current corrections belong in new entries.
- Do not bypass secret-content controls for documentation cleanup.
- Defer the larger `AGENTS.md` split until Phase 0.5 closes, as previously decided.

**Risks or limitations:**

- `README.md`, `FAQ.md`, and `FAQ_ZH.md` still recommend `connection-test` without the verified-routing warning because protected token examples prevent safe direct editing through the current tool boundary.
- The three STEP-033 production blockers remain unchanged.
- Remote CI remains unrun.

**Rollback method:**

- Revert the STEP-034 edits in `AGENTS.md`, `SECURITY.md`, `CLOUDFLARED_VERIFIED_INSTALL.md`, and `Memory.md`, then remove this appended archive entry.

**Next step:** Fix only the query-token default with a failing tunnel-mode regression test first. Require explicit `CODEXPRO_ALLOW_QUERY_TOKEN=1`, then align migration documentation through an approved path. Do not address the other blockers in the same step; do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-035: Explicit query-token compatibility

**Status:** Completed; two STEP-033 blockers remain

**Goal:** Ensure tunnel mode does not implicitly enable URL query-token authentication. Query credentials must be accepted only when `CODEXPRO_ALLOW_QUERY_TOKEN=1` is explicitly configured, while Bearer authentication and the temporary compatibility path remain available.

**Files changed:**

- `src/config.ts`
- `test/http-security.test.mjs`
- `config.example.env`
- `SECURITY.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added a focused HTTP regression test for `CODEXPRO_TUNNEL_MODE=1` with no explicit query-token compatibility setting.
- Verified the new test failed against the previous implementation because a valid URL query credential returned HTTP `200` instead of the required `401`.
- Removed the fallback from `CODEXPRO_ALLOW_QUERY_TOKEN` to `CODEXPRO_TUNNEL_MODE`; the query-token setting now defaults directly to `false`.
- Preserved explicit legacy compatibility: `CODEXPRO_ALLOW_QUERY_TOKEN=1` still allows URL query credentials, and Bearer authentication remains valid regardless of tunnel mode.
- Updated the example configuration and security rules to state that query authentication is disabled by default for tunnel launches as well as direct HTTP starts.
- Updated active project state and the approved stopping point. The remaining blockers are verified Cloudflared routing for documented `connection-test` and full Doctor `--no-profile` behavior.
- Did not modify the protected `scripts/http-smoke.mjs` fixture. A direct run without the compatibility flag failed at its intentional URL-token expectation; the existing `scripts/http-smoke-compat.mjs` wrapper already sets the compatibility flag explicitly and the complete smoke suite passed through that approved path.
- Did not stage, commit, push, or begin Phase 1.

**Verification commands:**

```text
node --test test/http-security.test.mjs
npm run build
node --test test/http-security.test.mjs
node scripts/http-smoke.mjs
node --test
npx --yes node@20 --test
npm run smoke
npm pack --dry-run
npm install-scripts ls
git diff --check
```

**Verification results:**

- Red phase: the new tunnel-mode regression failed as expected with `200 !== 401`.
- TypeScript build: exit `0`.
- Green focused HTTP security suite: 3/3 passed.
- Direct unwrapped HTTP smoke: failed at the legacy URL-token expectation because no explicit compatibility flag was present; this confirmed the new default and did not modify files.
- Node 24 consolidated regression suite: 27/27 passed.
- Node 20 consolidated regression suite: 27/27 passed.
- Complete smoke suite: all 8 sequential sections passed through the explicit compatibility wrapper.
- Package dry-run: exit `0`; 96 files; website assets retained; internal memory archive excluded.
- Install-script review: no packages with unreviewed install scripts.
- `git diff --check`: exit `0`; only existing Windows LF-to-CRLF warnings were reported.

**Decisions made:**

- Tunnel selection and query-token compatibility are independent security decisions. Enabling a tunnel must not weaken the credential transport policy.
- Keep the compatibility switch explicit and temporary rather than inferring it from public connectivity.
- Keep protected smoke fixtures unchanged when the existing wrapper already expresses the required explicit compatibility setting.
- Continue Phase 0.5 one blocker at a time.

**Risks or limitations:**

- Existing README, FAQ, CLI output, and connection-test guidance still contain URL-token-oriented instructions. Broader connector UX migration is outside this single blocker fix and some files remain protected by secret-content controls.
- The documented `connection-test` verified-Cloudflared routing blocker and Doctor `--no-profile` blocker remain open.
- Remote GitHub Actions remain unrun because the work is uncommitted and unpushed.

**Rollback method:**

- Restore the previous `allowQueryToken` fallback in `src/config.ts`, remove the tunnel-mode regression test, revert the STEP-035 documentation and memory updates, and remove this appended archive entry. No machine configuration or remote state changed.

**Next step:** Fix only documented `codexpro connection-test` so its effective Cloudflare tunnel routes through the verified Cloudflared installer, with a failing focused regression first. Do not address Doctor `--no-profile` in the same step; do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-036: Verified `connection-test` Cloudflared routing

**Status:** Completed; one STEP-033 blocker remains

**Goal:** Route the documented `codexpro connection-test` command through the repository-managed, pinned, SHA-256-verified Cloudflared entry whenever its effective tunnel is `cloudflare` or `cloudflare-named`, without changing saved or explicit non-Cloudflare tunnel behavior.

**Files changed:**

- `scripts/codexpro-entry.mjs`
- `test/cloudflared-installer.test.mjs`
- `SECURITY.md`
- `CLOUDFLARED_VERIFIED_INSTALL.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added focused regression assertions for default `connection-test`, explicit `--tunnel none`, saved `cloudflare-named`, and saved `none`, `ngrok`, and `tailscale` profiles.
- Verified the new default and saved-Cloudflare assertions failed against the previous implementation because `requiresVerifiedCloudflared()` rejected every non-`start` subcommand except `stable`.
- Changed only the public entry decision boundary so `connection-test` and `start` share the existing effective Tunnel resolution order: explicit option, environment, saved profile, then the Cloudflare default.
- Preserved manual `--cloudflared` and `--no-install-cloudflared` overrides and preserved non-Cloudflare profile routing.
- Updated the verified-install documentation and security claims to include `connection-test` only when its effective Tunnel is Cloudflare.
- Updated the two-layer project memory and approved stopping point.
- Did not modify Doctor behavior, stage, commit, push, or begin Phase 1.

**Verification commands:**

```text
node --test test/cloudflared-installer.test.mjs
npm run build
node --test
npx --yes node@20 --test
npm run smoke
npm pack --dry-run
npm install-scripts ls
git diff --check
```

**Verification results:**

- Red phase: focused Cloudflared suite failed 2 assertions as expected; default `connection-test` and saved `cloudflare-named` both returned `false` instead of `true`.
- Green focused Cloudflared suite: 7/7 tests passed.
- TypeScript build: exit `0`.
- Node 24 consolidated regression suite: 27/27 passed.
- Node 20 consolidated regression suite: 27/27 passed.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; 96 files; website assets retained; internal memory archive excluded.
- Install-script review: no packages with unreviewed install scripts.
- `git diff --check`: exit `0`; only existing Windows LF-to-CRLF warnings were reported.

**Decisions made:**

- `connection-test` is a launch profile, not a separate Tunnel type; verified-binary routing must therefore depend on its effective Tunnel exactly as normal starts do.
- Saved `none`, `ngrok`, and `tailscale` profiles must not trigger Cloudflared installation merely because the subcommand is `connection-test`.
- Keep the fix localized to the public entry wrapper rather than duplicating Tunnel resolution inside the legacy CLI.
- Continue resolving Phase 0.5 blockers one at a time.

**Risks or limitations:**

- Full `codexpro doctor --no-profile` still validates a saved profile and remains the final STEP-033 staging blocker.
- macOS archive installs remain version-checked but are not re-hashed on later `ensure/status` because the manifest digest applies to the archive.
- Cloudflare quick-tunnel Host forwarding still requires real external validation.
- Remote GitHub Actions remain unrun because the work is uncommitted and unpushed.

**Rollback method:**

- Restore the previous `requiresVerifiedCloudflared()` subcommand check, remove the new `connection-test` assertions, revert STEP-036 documentation and memory updates, and remove this appended archive entry. No machine configuration or remote state changed.

**Next step:** Fix only full `codexpro doctor --no-profile` so saved-profile validation is skipped, with a failing full-path regression first. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-037: Full Doctor honors `--no-profile`

**Status:** Completed; all known STEP-033 blockers resolved

**Goal:** Ensure the complete `codexpro doctor --no-profile` path skips saved-profile parsing and validation, while normal Doctor runs continue to load valid saved settings and reject invalid saved values.

**Files changed:**

- `scripts/doctor.mjs`
- `test/doctor-shell.test.mjs`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added a full-path regression that creates an invalid saved workspace profile, runs Doctor with `--no-profile`, and requires a successful result without saved-profile validation errors.
- Verified the regression failed against the previous wrapper because `savedProfileCheck()` ran unconditionally and forced exit code `1`.
- Added one early return to `savedProfileCheck()` when `--no-profile` is present.
- Preserved saved-profile Bash inheritance for normal Doctor runs.
- Preserved normal invalid-profile rejection; the complete Doctor smoke still verifies that invalid saved Bash, write, and tool modes fail.
- Updated the project memory and approved stopping point. All known STEP-033 blockers are resolved, but staging remains disallowed until a fresh final complete Phase 0.5 diff review is performed.
- Did not stage, commit, push, or begin Phase 1.

**Verification commands:**

```text
node --test test/doctor-shell.test.mjs
npm run build
node --test
npx --yes node@20 --test
npm run smoke
npm pack --dry-run
npm install-scripts ls
git diff --check
```

**Verification results:**

- Red phase: focused Doctor suite passed 3 tests and failed the new full-path test as expected; Doctor returned exit code `1` instead of `0`.
- Green focused Doctor suite: 4/4 passed.
- TypeScript build: exit `0`.
- Node 24 consolidated regression suite: 28/28 passed.
- Node 20 consolidated regression suite: 28/28 passed.
- Complete smoke suite: all 8 sequential sections passed, including the normal invalid saved-profile rejection check.
- Package dry-run: exit `0`; 96 files; website assets retained; internal memory archive excluded.
- Install-script review: no packages with unreviewed install scripts.
- `git diff --check`: exit `0`; only existing Windows LF-to-CRLF warnings were reported.

**Decisions made:**

- `--no-profile` must consistently disable every saved-profile read or validation performed by the public Doctor wrapper and the legacy Doctor implementation.
- Skip only saved-profile validation; do not weaken explicit argument, environment, shell, port, build, or tunnel diagnostics.
- Keep normal saved-profile validation intact so malformed persisted configuration still fails visibly.
- Require one more fresh final complete diff review before staging despite all known blockers being resolved.

**Risks or limitations:**

- Remote Ubuntu and Windows GitHub Actions remain unrun because the work is uncommitted and unpushed.
- macOS archive installs remain version-checked but are not re-hashed on later `ensure/status` because the manifest digest applies to the archive.
- Cloudflare quick-tunnel Host forwarding still requires real external validation.

**Rollback method:**

- Remove the `--no-profile` early return in `savedProfileCheck()`, remove the full-path regression and STEP-037 memory updates, and remove this appended archive entry. No machine configuration or remote state changed.

**Next step:** Perform a fresh final complete Phase 0.5 diff review and rerun the approved verification gates. Do not stage, commit, push, or begin Phase 1 until that review decides the work is ready and the user explicitly approves the next action.

---

## 2026-07-11 — STEP-038: Fresh final Phase 0.5 diff review

**Status:** Completed; staging remains blocked by one newly confirmed integration defect

**Goal:** Review the complete unstaged Phase 0.5 change set after STEP-035 through STEP-037, rerun every approved local verification gate, verify the pinned Cloudflared manifest against the official release, and decide whether the work is ready for staging.

**Files changed by this review step:**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Review scope:**

- Reviewed the complete unstaged and untracked Phase 0.5 change set, including Windows and Ubuntu CI, package entry routing, platform smoke wrappers, Windows path policy, HTTP Host and Origin enforcement, Bearer and query authentication, Bash diagnostics, Doctor profile behavior, verified Cloudflared installation, package contents, tests, documentation, and project memory.
- Rechecked the three STEP-033 defects fixed by STEP-035 through STEP-037; their focused and consolidated regressions remain green.
- Compared the pinned Cloudflared `2026.7.1` platform asset names and SHA-256 values with Cloudflare's official GitHub release checksum list; all supported manifest entries matched.
- Ran a local end-to-end CLI authentication probe with a temporary profile home, temporary port, Bash disabled, writes disabled, and no tunnel. The probe did not expose the workspace publicly or persist source changes.
- Inspected the working tree after all checks and confirmed it remained unstaged, uncommitted, and unpushed.

**New staging blocker:**

1. **The default CLI connector URL and instructions contradict the default authentication policy.**
   - `src/config.ts` and `src/http.ts` now correctly disable query-token authentication unless `CODEXPRO_ALLOW_QUERY_TOKEN=1` is explicit.
   - `scripts/codexpro.mjs` still unconditionally appends `codexpro_token` to the displayed and copied Server URL whenever an HTTP token exists.
   - The same CLI output still instructs users to choose `Authentication: None`, including the `connection-test` guidance.
   - The end-to-end reproduction confirmed that the exact URL printed by the default CLI returned HTTP `401`, while the same server returned HTTP `200` with the valid `Authorization: Bearer` header.
   - Therefore the documented default launch path produces connection instructions that cannot authenticate successfully under the newly enforced secure default.
   - Existing tests do not catch this mismatch because the complete HTTP smoke suite runs through `scripts/http-smoke-compat.mjs`, which explicitly enables legacy query-token compatibility.

**Verification commands and checks:**

```text
npm ci
npm run build
node --test
npx --yes node@20 --test
npm run smoke
npm pack --dry-run
npm install-scripts ls
git diff --check
npm run cloudflared:status
where.exe cloudflared
local CLI authentication integration probe
secret-pattern scan of the workspace
complete diff and active-document review
```

**Verification results:**

- `npm ci`: exit `0`; 112 packages installed; 113 packages audited; 0 vulnerabilities.
- TypeScript build: exit `0`.
- Node 24 consolidated regression suite: 28/28 passed.
- Node 20 consolidated regression suite: 28/28 passed.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; 96 files; website assets retained; internal memory archives excluded.
- Install-script review: no packages with unreviewed install scripts.
- `git diff --check`: exit `0`; only existing Windows LF-to-CRLF warnings were reported.
- CLI authentication integration probe: printed query-token URL `401`; Bearer-authenticated health request `200`; output still instructed `Authentication: None`.
- The managed pinned Cloudflared binary is not currently installed in the user profile, and no system `cloudflared` executable was found. These were machine-state checks, not failed approved gates.
- Secret-pattern scanning found only existing synthetic redaction fixtures in smoke and stress scripts; no newly introduced real credential was identified.
- No additional confirmed acceptance blocker was found in the reviewed implementation.

**Decision:**

- Do not approve staging, commit, or push merely because every automated gate passes.
- Treat the default CLI connector-authentication mismatch as a staging blocker because it breaks the documented normal connection flow and conflicts directly with the Phase 0.5 query-token migration policy.
- Fix only this mismatch next, with a failing end-to-end regression before implementation.
- A query-token URL and `Authentication: None` guidance may appear only when `CODEXPRO_ALLOW_QUERY_TOKEN=1` is explicit. The default path must use Bearer-compatible output and instructions.
- Do not begin Phase 1.

**Non-blocking limitations and follow-up risks:**

- Remote Ubuntu and Windows GitHub Actions remain unrun because the work is uncommitted and unpushed.
- Cloudflare quick-tunnel Host forwarding still requires a real external validation run; the pinned managed binary is not currently installed on this machine.
- macOS archive installs are version-checked but are not re-hashed on later `ensure/status` because the pinned digest applies to the downloaded archive rather than the extracted executable.
- `AGENTS.md` remains above its soft size target; the previously approved split remains deferred until Phase 0.5 closes.

**Rollback method:**

- Revert only the STEP-038 updates in `AGENTS.md` and `Memory.md`, then remove this appended archive entry. No production source, test, package metadata, machine configuration, or remote state was changed by this review step.

**Next step:** Fix only the default connector-authentication mismatch. Add a failing integration regression proving that default output does not emit a query-token URL or instruct `Authentication: None`, while explicit `CODEXPRO_ALLOW_QUERY_TOKEN=1` retains the compatibility flow. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-039: Connector authentication output alignment

**Status:** Completed; STEP-038 staging blocker resolved

**Goal:** Align the supported public `codexpro` entry with the secure query-token policy so default launches emit and copy a token-free Server URL with Bearer guidance, while explicit `CODEXPRO_ALLOW_QUERY_TOKEN=1` retains the legacy URL-token and `Authentication: None` flow.

**Files changed:**

- `scripts/codexpro-entry.mjs`
- `scripts/connector-auth-output-shim.cjs`
- `test/connector-auth-output.test.mjs`
- `SECURITY.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added two end-to-end tests that launch the supported public entry on a temporary loopback port with a temporary profile home and no tunnel.
- Verified the red phase: the default-mode test failed because the CLI emitted a `codexpro_token` URL, while the explicit compatibility test passed.
- The protected legacy `scripts/codexpro.mjs` file could not be edited through CodexPro because its sensitive-content guard rejected the operation. The guard was not bypassed.
- Added a public-entry-only preload compatibility layer. It is injected only for connector launch commands when authentication is enabled and query-token compatibility is not explicit.
- The preload layer removes the legacy URL credential before the URL is displayed or copied, rewrites connector guidance to Bearer authentication, and restores the prior `NODE_OPTIONS` and temporary shim environment before the legacy CLI creates child processes.
- Explicit query-token compatibility and `--no-auth` bypass the preload layer and retain their intended existing behavior.
- Updated the active security documentation to state the default and compatibility output rules.
- Did not stage, commit, push, or begin Phase 1.

**Focused verification:**

```text
node --test test/connector-auth-output.test.mjs
```

- Red phase: 1/2 passed; the default output assertion failed on the emitted query-token URL.
- Green phase: 2/2 passed.
- Default mode: token-free Server URL, no `Authentication: None` guidance, Bearer guidance, query credential HTTP `401`, Bearer request HTTP `200`.
- Explicit compatibility mode: query-token Server URL, `Authentication: None` guidance, query credential HTTP `200`, Bearer request HTTP `200`.

**Decisions made:**

- Treat `scripts/codexpro-entry.mjs` as the supported public compatibility boundary; direct `node scripts/codexpro.mjs` invocation remains unsupported and bypasses entry-layer protections.
- Keep the compatibility flag behavior unchanged for existing connectors.
- Do not weaken the server default merely to preserve obsolete CLI output.
- Keep the preload narrowly scoped and regression-tested rather than bypassing sensitive-content protections.

**Risks or limitations:**

- The entry-layer guidance rewrite intentionally depends on stable legacy output strings; the integration tests will fail if upstream text changes without a corresponding compatibility update.
- Browser-only local status navigation cannot carry a Bearer header; the default primary key summary no longer advertises that shortcut. Explicit query-token compatibility retains the legacy browser flow.

**Rollback method:**

- Remove `scripts/connector-auth-output-shim.cjs` and `test/connector-auth-output.test.mjs`, restore the previous final launch environment call in `scripts/codexpro-entry.mjs`, and revert the STEP-039 documentation and memory updates.

**Next step:** Perform a new complete Phase 0.5 diff review and rerun all approved local gates. Do not stage, commit, push, or begin Phase 1 until the review is complete.

---

## 2026-07-11 — STEP-040: Final complete Phase 0.5 review after authentication fix

**Status:** Completed; no remaining local staging blocker

**Goal:** Re-review the complete Phase 0.5 change set after STEP-039 and rerun every approved local gate before deciding whether the work is ready for staging.

**Review scope:**

- Reviewed all tracked and untracked Phase 0.5 files covering CI, package entry routing, Windows path policy, HTTP Host and Origin enforcement, Bearer and query authentication, Bash diagnostics, Doctor profile handling, verified Cloudflared installation, platform smoke wrappers, package contents, documentation, tests, and two-layer memory.
- Re-reviewed the public-entry preload boundary, environment restoration, compatibility-flag bypass, `--no-auth` bypass, URL copy behavior, package inclusion, and end-to-end request behavior.
- Confirmed the protected legacy CLI was not modified and the sensitive-content guard was not bypassed.
- Ran a focused secret-pattern scan over all files added or changed by STEP-039; no credential-like literal was found.
- Ran the controlled CodexPro self-test without a write probe; it reported 0 failures and touched no files.

**Verification commands:**

```text
npm ci
npm run build
node --test
npx --yes node@20 --test
npm run smoke
npm pack --dry-run
npm install-scripts ls
git diff --check
node --test test/connector-auth-output.test.mjs
secret-pattern scan
CodexPro self-test without write probe
```

**Verification results:**

- `npm ci`: exit `0`; 112 packages installed; 113 packages audited; 0 vulnerabilities.
- TypeScript build: exit `0`.
- Node 24 consolidated regression suite: 30/30 passed.
- Node 20 consolidated regression suite: 30/30 passed.
- Connector authentication output suite: 2/2 passed in both runtimes.
- Complete smoke suite: all 8 sequential sections passed.
- Package dry-run: exit `0`; 97 files; the connector authentication shim is included; website assets remain included; internal memory archives remain excluded.
- Install-script review: no packages with unreviewed install scripts.
- `git diff --check`: exit `0`; only existing Windows LF-to-CRLF warnings were reported.
- Secret-pattern scan: 4 STEP-039 files checked; 0 matches.
- CodexPro self-test: 7 pass, 5 expected warnings, 0 failures, and no files touched.
- Working tree remains unstaged, uncommitted, and unpushed.

**Review decision:**

- No additional confirmed acceptance or local staging blocker was found.
- The Phase 0.5 change set is ready for staging after explicit user approval.
- Staging readiness does not close Phase 0.5 remotely. Ubuntu and Windows GitHub Actions and a real external Cloudflare tunnel validation must pass after commit and push.
- Do not begin Phase 1 before those remote validations are complete.

**Non-blocking limitations:**

- The managed pinned Cloudflared binary is not currently installed in the user profile, so real external quick-tunnel Host forwarding remains untested on this machine.
- Remote GitHub Actions remain unrun because the change set is not committed or pushed.
- macOS archive installs are version-checked but are not re-hashed on later `ensure/status` because the pinned digest applies to the downloaded archive.
- `AGENTS.md` remains above its soft size target; the approved split is deferred until Phase 0.5 closes.

**Rollback method:**

- Revert only STEP-040 updates in `AGENTS.md` and `Memory.md`, then remove this appended STEP-040 entry. STEP-039 production behavior and tests are independently revertible using the preceding rollback method.

**Next step:** Await explicit user approval before staging. After approval, stage only the reviewed Phase 0.5 change set; do not commit or push unless separately authorized, and do not begin Phase 1.

---

## 2026-07-11 — STEP-041: Neat-freak knowledge cleanup and documentation audit

**Status:** Completed; rule-file bloat resolved, new packaged-documentation blocker identified

**Goal:** Apply the `neat-freak` skill after STEP-040 so active project rules stay concise, stable architecture knowledge is moved to the appropriate documentation layer, current memory remains within loading limits, and user-facing documentation is checked against the implemented authentication behavior.

**Files changed:**

- `AGENTS.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Files audited but not changed because protected editing was blocked:**

- `README.md`
- `README_ZH.md`
- `FAQ.md`
- `FAQ_ZH.md`
- `DOMAIN_SETUP.md`

**Implementation summary:**

- Measured the active knowledge files before editing: `AGENTS.md` was 613 lines / 19,482 bytes, above the neat-freak soft limit; `Memory.md` was 122 lines / 11,712 bytes and remained within its preferred limits.
- Rewrote `AGENTS.md` as an active rule manual containing mission, Windows and security constraints, working method, two-layer memory protocol, current authentication and Cloudflared rules, Windows path rules, shell rules, documentation pointers, verification rules, rollback rules, and the current stopping point.
- Moved historical audit facts, reference-project analysis, target architecture, architecture decisions, target tool groups, output/error contract, and the Phase 0–9 roadmap into `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`.
- Preserved authority boundaries: `AGENTS.md` is active rules, `Memory.md` is current state, the phase archive is append-only history, and the new architecture document is a non-authorizing design reference.
- Audited user-facing Markdown for stale authentication instructions. `README*`, `FAQ*`, and `DOMAIN_SETUP.md` still describe query-token URLs and `Authentication: None` as the default even though STEP-039 changed the supported public entry to token-free URLs with Bearer guidance.
- Attempted an exact safe edit to `README.md`. CodexPro rejected the edit because the file contains secret-looking content. The protection was not bypassed, and none of the protected user documents were modified.
- Updated active rules and memory to treat the stale packaged authentication documentation as a staging blocker.
- Did not modify production code, stage, commit, push, or begin Phase 1.

**Verification commands and checks:**

```text
workspace tree and Markdown inventory
AGENTS.md full review
Memory.md active-state review
node size and required-path check
targeted Markdown searches for stale authentication guidance
targeted search for stale active stopping-point descriptions
targeted search for relative-time wording
git diff --check
workspace change review
```

**Verification results:**

- `AGENTS.md`: reduced to 178 lines / 8,358 bytes, below the approximately 300-line / 15 KB neat-freak soft target.
- `Memory.md`: 125 lines / 12,551 bytes, below the preferred 150-line / 18 KB target and hard limits.
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`: 505 lines / 14,573 bytes, below the 1,500-line soft limit for a single docs file.
- All paths referenced by the new `AGENTS.md` documentation map exist.
- Active rules and memory now agree that staging is blocked until packaged authentication documentation is corrected.
- No relative-time wording was found in `AGENTS.md`, `Memory.md`, or the new architecture/roadmap document.
- `git diff --check`: exit `0`; only existing LF-to-CRLF warnings were reported.
- A dedicated secret-pattern command was blocked by platform safety before execution. The new and rewritten documents were bounded and manually reviewed, and no credential value or private key was introduced.
- The stale authentication instructions remain present in five packaged documents; this is the intentionally recorded unresolved item.
- Working tree remains unstaged, uncommitted, and unpushed.

**Decisions made:**

- Keep `AGENTS.md` limited to rules that the next coding agent must see immediately.
- Store stable architecture and roadmap knowledge in a dedicated docs reference instead of repeating it in the always-loaded rule file.
- Treat user-facing setup instructions that contradict secure runtime behavior as a staging blocker, even when code tests pass.
- Do not bypass secret-content protections to edit protected documentation.

**Risks or limitations:**

- The packaged English and Chinese README/FAQ/domain guides remain misleading until an approved safe editing path is used.
- The new architecture document is intentionally not included in the npm package because `package.json` publishes only website assets from `docs/`; it is a repository-maintainer reference.
- Remote CI and external Cloudflare validation remain pending as before.

**Rollback method:**

- Restore the previous `AGENTS.md`, remove `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`, revert the STEP-041 root-memory updates, and remove this appended entry. No production source, machine configuration, Git staging state, or remote state changed.

**Next step:** Correct `README.md`, `README_ZH.md`, `FAQ.md`, `FAQ_ZH.md`, and `DOMAIN_SETUP.md` through an approved safe editing path without bypassing secret-content protections. Then rerun the complete Phase 0.5 diff review and all approved gates. Do not stage, commit, push, or begin Phase 1 before that review.

---

## 2026-07-11 — STEP-042: Packaged authentication documentation alignment

**Status:** Completed; STEP-041 documentation blocker resolved

**Goal:** Update the five packaged user guides so their setup, connector, connection-test, and stable-domain instructions match the secure runtime behavior implemented by STEP-039: token-free Server URLs and Bearer authentication by default, with URL-token and `Authentication: None` available only under explicit compatibility mode.

**Files changed:**

- `README.md`
- `README_ZH.md`
- `FAQ.md`
- `FAQ_ZH.md`
- `DOMAIN_SETUP.md`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Read the complete contents of all five user-facing documents before rewriting them.
- Used CodexPro full-file `write` operations rather than bypassing the secret-content guard. The rewritten files no longer contain query-token URL examples that previously triggered protected editing.
- Updated English and Chinese installation instructions to state that the supported public entry copies a token-free Server URL and prints the Bearer value separately.
- Updated ChatGPT Plugin field examples to use `Authentication: Bearer token / Custom Header` and `Authorization: Bearer <token>` for the default flow.
- Retained migration compatibility guidance only behind explicit `CODEXPRO_ALLOW_QUERY_TOKEN=1`, where URL-token output and `Authentication: No Authentication / None` remain valid.
- Updated connection-test troubleshooting so HTTP `401` means a missing, invalid, or mismatched Bearer credential in the default flow.
- Updated Tailscale, Cloudflare named-tunnel, and ngrok examples to show token-free `/mcp` endpoints.
- Added default Bearer/query-token compatibility statements to the safety sections.
- Updated active project rules and memory so the next action is a fresh complete Phase 0.5 review rather than staging.
- Did not change production code, stage, commit, push, or begin Phase 1.

**Verification commands and checks:**

```text
targeted search for stale query-token URL and default No Authentication wording
targeted search for remaining Authentication: None references
node documentation consistency check over all five files
node --test test/package-contents.test.mjs
npm pack --dry-run
git diff --check
```

**Verification results:**

- No `mcp?codexpro_token` URL example remains in the five documents.
- No stale statement remains claiming that the copied default URL already contains the private token.
- Every remaining `Authentication: None` or `No Authentication` reference is directly scoped to explicit `CODEXPRO_ALLOW_QUERY_TOKEN=1` compatibility mode.
- All five documents contain `Authorization: Bearer` guidance and the explicit compatibility flag.
- Package-content regression: 1/1 passed.
- `npm pack --dry-run`: exit `0`; TypeScript prepack build passed; 97 files; all five updated guides are included in the tarball; internal memory archives remain excluded.
- `git diff --check`: exit `0`; only existing LF-to-CRLF warnings were reported.
- Working tree remains unstaged, uncommitted, and unpushed.

**Decisions made:**

- Secure defaults must be shown first in all user documentation; compatibility behavior must be visibly conditional.
- Do not publish query-token URL examples even as placeholders when the normal flow is Bearer-based.
- Use full-file CodexPro writes as the approved safe path when exact edits are blocked by secret-content scanning and the resulting file removes the triggering secret-like example.
- A documentation-only fix does not replace the required final complete Phase 0.5 review.

**Risks or limitations:**

- The exact authentication option labels available in a ChatGPT UI may vary; the docs use `Bearer token / Custom Header` to describe the required behavior rather than relying on one UI label.
- Website HTML under `docs/` was not part of this five-file task and was not changed.
- Remote GitHub Actions and real external Cloudflare tunnel validation remain pending.

**Rollback method:**

- Restore the previous five user documents, revert the STEP-042 `AGENTS.md` and `Memory.md` updates, and remove this appended entry. No production source, machine configuration, Git staging state, or remote state changed.

**Next step:** Rerun the complete Phase 0.5 diff review and every approved local gate before any staging decision. Do not stage, commit, push, or begin Phase 1 until that review is complete.

---

## 2026-07-11 — STEP-043: Fresh complete Phase 0.5 review after documentation alignment

**Status:** Completed; all local automated gates passed, two staging blockers confirmed

**Goal:** Re-review the complete unstaged Phase 0.5 change set after STEP-042, rerun every approved local gate, verify published authentication guidance against current official OpenAI documentation, and decide whether the change set is ready for staging.

**Files changed by the review record:**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Production or user-document files changed by this review:** none

**Review scope:**

- Re-reviewed the complete tracked diff covering Windows CI, Windows path policy, HTTP Host/Origin/authentication security, Bash diagnostics, public entry routing, verified Cloudflared installation, Doctor behavior, platform smoke wrappers, package contents, and STEP-042 Markdown guidance.
- Re-read the untracked public entry, authentication-output shim, verified Cloudflared installer, and Doctor wrapper.
- Searched all published Markdown and website assets for authentication guidance.
- Checked the current official OpenAI Apps SDK connection and authentication documentation:
  - `https://developers.openai.com/apps-sdk/deploy/connect-chatgpt`
  - `https://developers.openai.com/apps-sdk/build/auth`

**Confirmed blockers:**

1. **Static Bearer guidance is not a validated ChatGPT authenticated-MCP flow.**
   - The official developer-mode connection page lists app name, description, and MCP server URL when creating the app; it does not document a field for manually entering a permanent Bearer token or arbitrary custom header.
   - The official authentication guide says an authenticated MCP server is expected to implement the MCP OAuth 2.1 flow, protected-resource metadata, authorization-server metadata, PKCE, and token validation. ChatGPT obtains the access token through that flow and then sends it as `Authorization: Bearer`.
   - Current CLI tests prove only that CodexPro can accept a Bearer header and print a token. They do not prove ChatGPT can be configured with that static token.
   - Therefore STEP-039/042 cannot be treated as a usable secure ChatGPT default without either a real current-UI validation that contradicts the official documented flow or a standards-compliant OAuth implementation.

2. **Published website pages still describe the obsolete default flow.**
   - `docs/index.html` still instructs users to select `No Authentication / None` in two places.
   - `docs/zh.html` still instructs users to select `No Authentication / None` and says the copied URL already contains the private token.
   - Both pages are included by `npm pack --dry-run`, so STEP-042 did not fully align published guidance.

**Verification commands and checks:**

```text
npm ci
npm run build
node --test
npx --yes node@20 --test
npm run smoke
node --test test/connector-auth-output.test.mjs test/http-security.test.mjs test/package-contents.test.mjs
npm pack --dry-run
npm install-scripts ls
CodexPro self-test without write probe
git diff --check
complete change review
published authentication-guidance search
official OpenAI Apps SDK documentation review
```

**Verification results:**

- `npm ci`: exit `0`; 112 packages installed; 113 audited; 0 vulnerabilities.
- TypeScript build: exit `0`.
- Node 24 consolidated regression suite: 30/30 passed.
- Node 20 consolidated regression suite: 30/30 passed.
- Complete Smoke suite: all 8 sequential sections passed.
- Focused authentication, HTTP security, and package suite: 6/6 passed.
- Package dry-run: exit `0`; 97 files; all five STEP-042 Markdown guides and both website pages are included; internal memory archives remain excluded.
- Install-script review: no packages with unreviewed install scripts.
- CodexPro self-test: 7 pass, 5 expected warnings, 0 failures, and no files touched.
- `git diff --check`: exit `0`; only existing LF-to-CRLF warnings were reported.
- Automated gates expose no code-level failure, but they do not test an authenticated connection from the actual ChatGPT client.
- Working tree remains unstaged, uncommitted, and unpushed.

**Review decision:**

- The Phase 0.5 change set is **not ready for staging**.
- Passing local tests do not override the unsupported-client integration finding or stale published website instructions.
- Authentication direction is now an explicit architecture decision, not a localized documentation fix.

**Decisions required before implementation continues:**

- Option A: pull standards-compliant OAuth 2.1 authentication into Phase 0.5 and keep query-token authentication compatibility-only.
- Option B: deliberately retain an explicit query-token compatibility flow for personal ChatGPT use until OAuth is implemented, document the URL-secret risk clearly, and avoid claiming that static Bearer can be configured in ChatGPT unless a current real-UI test proves it.

**Risks or limitations:**

- Option A expands Phase 0.5 scope and requires authorization-server design, metadata endpoints, PKCE-compatible client registration, scopes, token validation, and integration tests.
- Option B preserves current personal usability but keeps a credential in the connector URL and therefore has referrer, history, screenshot, clipboard, and logging exposure risks that must be mitigated and disclosed.
- Remote GitHub Actions and real external Cloudflare tunnel validation remain pending.

**Rollback method:**

- Revert only the STEP-043 changes in `AGENTS.md` and `Memory.md`, then remove this appended STEP-043 entry. No production behavior, tests, machine configuration, staging state, or remote state changed during this review.

**Next step:** Obtain the user's explicit authentication-direction decision. Implement only that decision as the next feature, update all CLI/tests/Markdown/website guidance together, then rerun the complete Phase 0.5 review and every approved gate. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-044: Authentication direction selected

**Status:** Decision recorded; no production implementation performed

**Decision:** Use explicit query-token compatibility for personal ChatGPT use during Phase 0.5. Defer standards-compliant OAuth 2.1 to a later phase.

**Required implementation boundary:**

- Remove unsupported static-Bearer setup guidance.
- Make the query-token flow explicit and limited to personal compatibility use.
- Align CLI output, authentication tests, five Markdown guides, `SECURITY.md`, `AGENTS.md`, `docs/index.html`, and `docs/zh.html`.
- Clearly disclose URL-secret exposure through browser history, clipboard, screenshots, referrers, logs, and copied connector URLs.
- Preserve the existing server-side Bearer support for compatible clients, but do not claim ChatGPT Web supports manual static-Bearer configuration.

**Files changed:** `AGENTS.md`, `Memory.md`, and this archive.

**Git state:** unstaged, uncommitted, and unpushed. Phase 1 remains unstarted.

**Next step:** Implement only the selected Option B compatibility flow, update the complete public guidance surface, and rerun the full Phase 0.5 review and all approved gates before staging.

---

## 2026-07-11 — STEP-045: Restore the public CLI personal query-token flow

**Status:** Completed; runtime portion of Option B implemented

**Goal:** Restore URL query-token authentication as the default personal ChatGPT connection flow for the supported public CLI, while preserving server-side Bearer support for compatible clients and retaining an explicit opt-out path.

**Files changed:**

- `scripts/codexpro-entry.mjs`
- `test/connector-auth-output.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added the new expected behavior to the end-to-end connector authentication test before changing production code.
- Confirmed the new test failed because the public CLI still emitted a token-free `/mcp` URL and static Bearer guidance.
- Updated the supported public entry so connector commands set `CODEXPRO_ALLOW_QUERY_TOKEN=1` when the variable is absent.
- Kept explicit configuration authoritative: `CODEXPRO_ALLOW_QUERY_TOKEN=0` still selects the existing token-free Bearer-client output path, and `CODEXPRO_ALLOW_QUERY_TOKEN=1` remains accepted.
- Left `src/config.ts` unchanged, so direct unsupported server launches still default query-token authentication to disabled; the personal compatibility default is limited to the supported public CLI entry.
- Preserved server-side Bearer acceptance in all modes.
- Did not update user documentation, website pages, stage, commit, push, or begin Phase 1.

**Verification commands:**

```text
node --test test/connector-auth-output.test.mjs
node --test test/connector-auth-output.test.mjs test/http-security.test.mjs
```

**Verification results:**

- RED verification: the updated default-flow regression failed as expected because the emitted Server URL lacked `codexpro_token`.
- GREEN verification: connector authentication tests passed 2/2.
- Focused authentication and HTTP security suite passed 5/5.
- The default supported public CLI flow now emits a URL-token Server URL, prints `Authentication: None`, accepts the query credential, and continues accepting Bearer headers.
- Existing direct HTTP security behavior remains unchanged: query credentials are rejected unless the compatibility setting is enabled.
- Full Node 20/24 regression, build, Smoke, package dry-run, and final diff review were not run in this step; they remain required after documentation alignment.

**Decisions made:**

- Scope the personal ChatGPT compatibility default to the supported public CLI rather than weakening the underlying server configuration default.
- Preserve explicit `CODEXPRO_ALLOW_QUERY_TOKEN=0` for advanced compatible clients that can supply a Bearer header.
- Keep the connector output shim temporarily because it still implements that explicit opt-out path.

**Risks or limitations:**

- The URL credential can be exposed through browser history, clipboard contents, screenshots, referrers, logs, and copied connector URLs. Public documentation has not yet been updated with these warnings.
- Query-token mode is a temporary personal compatibility path, not the long-term standards-based authentication design.
- The current narrow verification ran on local Node 24 only; the final approved gates must rerun Node 20 and Node 24.

**Rollback method:**

- Revert the `connectorAuthOutputEnvironment()` change, restore the previous default-flow test expectation, revert the STEP-045 root-memory edits, and remove this appended archive entry. No profile, token, staging state, commit, or remote state changed.

**Next step:** Update only the public authentication guidance surface: the five Markdown guides, `SECURITY.md`, `AGENTS.md`, `docs/index.html`, and `docs/zh.html`. Remove unsupported static-Bearer setup claims and add explicit URL-secret exposure warnings. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-11 — STEP-046: Authentication documentation alignment

**Status:** Completed; public guidance aligned with Option B

**Goal:** Align every active and published authentication guide with the Phase 0.5 personal ChatGPT query-token compatibility flow, remove unsupported manual static-Bearer setup claims, disclose URL-secret exposure risks, and add a regression that prevents the old guidance from returning.

**Files changed:**

- `README.md`
- `README_ZH.md`
- `FAQ.md`
- `FAQ_ZH.md`
- `DOMAIN_SETUP.md`
- `SECURITY.md`
- `AGENTS.md`
- `docs/index.html`
- `docs/zh.html`
- `test/auth-documentation.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Added a documentation consistency regression before changing the guides and confirmed that it failed on the old static-Bearer instructions.
- Updated the five Markdown guides and both website pages to instruct personal ChatGPT users to paste the complete credential-bearing Server URL and select `Authentication: None / No Authentication`.
- Removed claims that ChatGPT Web can be manually configured with a permanent static `Authorization: Bearer` header.
- Added explicit warnings that the complete URL may be exposed through browser history, clipboard contents, screenshots, logs, and copied links.
- Documented the query-token path as a temporary Phase 0.5 personal compatibility flow and kept OAuth 2.1 deferred.
- Preserved server-side Bearer support for compatible clients and documented `CODEXPRO_ALLOW_QUERY_TOKEN=0` as the explicit advanced-client opt-out.
- Updated active project rules and the root memory index so the next action is the final complete Phase 0.5 review.
- Two initial exact replacements in `docs/zh.html` did not match the file's text boundary; both were retried as smaller exact replacements without bypassing file protections.
- Did not change runtime code, stage, commit, push, or begin Phase 1.

**Verification commands and checks:**

```text
node --test test/auth-documentation.test.mjs
node --test test/auth-documentation.test.mjs test/connector-auth-output.test.mjs test/package-contents.test.mjs
targeted search across nine authentication guidance files
git diff --check
```

**Verification results:**

- RED verification: both new documentation tests failed on the existing static-Bearer guidance and missing URL-secret disclosures.
- GREEN verification: documentation consistency tests passed 2/2.
- Focused documentation, connector-output, and package-content suite passed 5/5.
- Targeted stale-guidance search returned no matches for static-Bearer setup labels, static-Bearer configuration instructions, the previous default-Bearer rule, or token-free URL claims.
- `git diff --check`: exit `0`; only existing LF-to-CRLF warnings were reported.
- The published package regression still confirms website assets are included and internal memory archives are excluded.
- Full Node 20/24 regression, build, Smoke, install-script review, self-test, and complete package dry-run remain for the next full review step.
- Working tree remains unstaged, uncommitted, and unpushed.

**Decisions made:**

- Public ChatGPT guidance must describe only the connection flow that the current personal deployment actually supports.
- URL-token risk warnings are mandatory wherever the user is instructed to create or troubleshoot the ChatGPT connection.
- Server-side Bearer support may remain, but it must be described as support for compatible clients rather than a ChatGPT Web configuration claim.
- Documentation consistency is enforced by an automated regression rather than relying only on manual review.

**Risks or limitations:**

- Query-token authentication still places a credential in a URL and remains less robust than a standards-compliant OAuth 2.1 deployment.
- Browser and intermediary behavior outside CodexPro cannot guarantee that a credential-bearing URL is never retained.
- The focused suite ran on local Node 24; Node 20 and the complete approved gates remain required before any staging decision.

**Rollback method:**

- Restore the previous nine guidance files, remove `test/auth-documentation.test.mjs`, revert the STEP-046 root-memory updates, and remove this appended archive entry. No profile, token, staging state, commit, or remote state changed.

**Next step:** Perform a fresh complete Phase 0.5 diff review and rerun every approved local gate. Do not stage, commit, push, or begin Phase 1.

---

## 2026-07-12 — STEP-047: Final complete Phase 0.5 local review

**Status:** Completed; every approved local gate passed

**Goal:** Perform a fresh review of the complete unstaged Phase 0.5 change set, resolve any remaining acceptance inconsistencies, rerun all approved Windows-local gates on Node 20 and Node 24, and establish the next explicit approval boundary without staging, committing, pushing, or starting Phase 1.

**Files changed during this review:**

- `FAQ.md`
- `FAQ_ZH.md`
- `config.example.env`
- `src/http.ts`
- `scripts/connector-auth-output-shim.cjs`
- `test/auth-documentation.test.mjs`
- `test/connector-auth-output.test.mjs`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation and review summary:**

- Ran the complete initial gate set and reviewed the full Phase 0.5 diff.
- Found two remaining public-authentication inconsistencies: the FAQ still told users to synchronize a connector Bearer credential, and `config.example.env` explicitly set `CODEXPRO_ALLOW_QUERY_TOKEN=0`, which would disable the selected public CLI personal flow when copied.
- Added failing documentation regressions, then replaced those instructions with complete credential-bearing URL guidance and made the example opt-out commented and advanced-client-only.
- Found that the runtime query-token warning still recommended Bearer authentication; replaced it with the required URL-secret exposure warning covering browser history, clipboard contents, screenshots, logs, and copied links.
- Found that the explicit query-token opt-out shim still opened ChatGPT and claimed static Bearer setup support. Restricted that output to compatible MCP clients, explicitly excluded ChatGPT Web, removed the open-ChatGPT shortcut from that mode, and added end-to-end coverage proving query credentials return `401` while Bearer remains `200`.
- The new explicit-opt-out test initially waited only for `Keys: Enter open`; after removing the ChatGPT shortcut, that readiness condition timed out. Updated the test to wait for both `CodexPro ready` and the generic `Keys:` footer, which covers all three output modes.
- CodexPro tool calls then returned repeated HTTP `502` responses. No repository test had failed; the user restarted CodexPro, after which the exact pending test fix and full verification resumed successfully.
- Reviewed static authentication matches after the fixes. Remaining old Bearer wording appears only in the append-only historical archive or negative regression assertions, not in active guidance or runtime instructions.
- Updated active rules and root memory to mark local review completion and require explicit approval before staging.
- Did not stage, commit, push, rewrite history, rotate credentials, or begin Phase 1.

**Verification commands and checks:**

```text
npm ci
npm run build
node --test
npx --yes node@20 --test
node --test test/auth-documentation.test.mjs test/connector-auth-output.test.mjs test/http-security.test.mjs test/package-contents.test.mjs
npm run smoke
npm pack --dry-run
npm install-scripts ls
npx esbuild --version
npx tsx --version
npm audit --audit-level=high
codexpro_self_test with write_probe=false and pro_context_probe=false
targeted static authentication search
git diff --check
show_changes
```

**Final verification results:**

- `npm ci`: passed; 112 packages installed and 0 vulnerabilities reported.
- Build: passed.
- Node 24 complete regression: 36/36 passed.
- Node 20 complete regression: 36/36 passed.
- Focused authentication, HTTP security, and package-content suite: 12/12 passed.
- Smoke: all 8 sequential sections passed.
- Package dry-run: passed; 97 files; package size approximately 292.0 kB; website assets and compatibility shim included; internal memory archives excluded.
- Install-script review: no packages with unreviewed install scripts.
- Tool versions: `esbuild 0.28.1`; `tsx 4.22.4` on Node `24.15.0`.
- npm audit: 0 vulnerabilities.
- CodexPro self-test: 7 pass, 0 fail, 5 expected warnings for standard mode, trusted full Bash, and skipped write/Pro-context probes; no files touched.
- Static authentication search: no active static-Bearer ChatGPT guidance; matches are limited to historical archive entries and negative test assertions.
- `git diff --check`: exit `0`; only existing LF-to-CRLF warnings.
- Working tree remains unstaged, uncommitted, and unpushed.

**Decisions made:**

- `CODEXPRO_ALLOW_QUERY_TOKEN=0` remains a supported explicit opt-out only for compatible clients that can send Bearer headers; it must not open ChatGPT or imply ChatGPT Web supports manual static-Bearer setup.
- The checked-in environment example must not silently override the supported public CLI personal query-token default.
- The final local review is complete, but staging remains an explicit user-approval boundary.
- Phase 0.5 cannot close until post-push Ubuntu and Windows CI plus a real external Cloudflare tunnel validation succeed.

**Risks or limitations:**

- The personal query-token flow still places a secret in the URL and remains a temporary compatibility path rather than OAuth 2.1.
- Remote GitHub Actions have not run because nothing has been committed or pushed.
- Real external Cloudflare Host forwarding remains unvalidated in this step.
- The managed pinned Cloudflared binary is not currently installed in the user profile.
- macOS archive installs remain version-checked but are not re-hashed during later `ensure/status` operations.

**Rollback method:**

- Revert the STEP-047 changes listed above, restore the previous test expectations and readiness condition, revert the STEP-047 root-memory and active-rule updates, and remove this appended archive entry. No staging state, commit, remote branch, profile, or credential changed.

**Next step:** Wait for explicit user approval before staging the complete Phase 0.5 change set. After staging, review the staged diff before any commit. Do not begin Phase 1.

---

## 2026-07-12 — STEP-048: Neat-freak knowledge cleanup

**Status:** Completed; documentation-only cleanup verified

**Goal:** Apply the `neat-freak` skill after the final Phase 0.5 local review, remove duplicated historical narration from active project memory and rules, verify documentation integrity, and preserve the existing staging boundary without changing runtime behavior.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation summary:**

- Loaded the installed `neat-freak` skill and followed its Windows adaptation and two-layer memory rules.
- Enumerated the repository root and `docs/` tree and measured the active rule, memory, README, architecture, and archive sizes.
- Confirmed `AGENTS.md` was already within its soft size limit and contained a clean rule-oriented structure, but its stopping-point paragraph still included STEP-specific historical narration.
- Replaced that historical sentence with a timeless current-state rule while preserving the exact staging, CI, Cloudflare, and Phase 1 boundaries.
- Rewrote `Memory.md` as a true concise index: current state, approved stopping point, active decisions, local verification, remaining limitations, open items, five recent steps, archive link, and maintenance protocol.
- Removed duplicated STEP-023 through STEP-043 narration and repeated validation history already preserved in the append-only phase archive.
- Reduced `Memory.md` from 125 lines / 13,387 bytes to 94 lines / 5,719 bytes.
- Preserved every active technical decision and the complete final STEP-047 verification evidence in concise form.
- Did not split or rename the 3,342-line phase archive because archive history is append-only and structural file moves require explicit approval. The file exceeds the skill's single-document soft limit but remains the authoritative Phase 0/0.5 record.
- Did not modify runtime code, tests, package contents, profiles, credentials, staging state, commits, or remotes.

**Verification commands and checks:**

```text
node -e <AGENTS.md and Memory.md size measurement>
node --test test/auth-documentation.test.mjs
node -e <relative Markdown link validation>
node -e <relative-time wording validation>
git diff --check
show_changes
```

**Verification results:**

- `AGENTS.md`: 180 lines / 8,740 bytes.
- `Memory.md`: 94 lines / 5,719 bytes, below the 150-line / 18 KB target and 200-line / 25 KB hard limits.
- Authentication documentation regression: 5/5 passed.
- All checked relative Markdown links resolve.
- No relative-time wording was found in the active Markdown files checked.
- `git diff --check`: exit `0`; only existing Windows LF-to-CRLF warnings.
- Working tree remains unstaged, uncommitted, and unpushed.

**Decisions made:**

- Active rule files must describe current constraints, not STEP-by-STEP history.
- Root memory remains an index; detailed implementation history belongs only in the append-only archive.
- The oversized combined Phase 0/0.5 archive is non-blocking for staging and should be closed at Phase 0.5 completion rather than destructively reorganized without approval.

**Risks or limitations:**

- The combined phase archive remains above the `neat-freak` single-document soft limit and is less convenient to navigate than separate Phase 0 and Phase 0.5 files.
- Splitting that archive would require a deliberate migration with link updates and explicit user approval.
- Remote CI and real external Cloudflare validation remain pending exactly as before.

**Rollback method:**

- Restore the previous `AGENTS.md` stopping-point sentence and the previous `Memory.md` contents, then remove this appended STEP-048 entry. No runtime, Git staging, commit, remote, profile, or credential state changed.

**Next step:** Wait for explicit approval before staging the complete Phase 0.5 change set. After staging, review the staged diff before any commit. Do not begin Phase 1.

## 2026-07-12 — STEP-049: Stage the complete Phase 0.5 change set

**Status:** Completed; staged only, with no commit or push

**Goal:** Execute the explicitly approved staging step for the complete reviewed Phase 0.5 change set while preserving the separate approval boundaries for commit, push, remote CI, external Cloudflare validation, and Phase 1.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`
- All previously reviewed Phase 0.5 implementation, test, CI, documentation, and packaging files were added to the Git index.

**Implementation summary:**

- Received explicit user approval to stage the complete Phase 0.5 change set.
- Ran `git add -A` from the repository root.
- Updated the concise memory index to record the new staged stopping point.
- Appended this complete STEP-049 record to the active Phase 0/0.5 archive.
- Re-staged the two memory files so the index and archive remain part of the same complete Phase 0.5 staged change set.
- Did not commit, push, rewrite history, rotate credentials, change profiles, expand access, run remote CI, or begin Phase 1.

**Verification commands and checks:**

```text
git add -A
git add Memory.md docs/memory/archive/phase-0-and-0.5.md
show_changes --staged
```

**Verification results:**

- The staging command exited successfully.
- Git reported only the known Windows LF-to-CRLF working-copy warnings.
- The complete Phase 0.5 change set, including this memory update, is staged.
- No commit or push was performed.

**Decisions made:**

- Staging approval does not imply commit or push approval.
- The next action is a staged-diff review; any commit or push still requires separate explicit approval.
- Phase 1 remains blocked until Phase 0.5 is committed, pushed, remotely validated on Ubuntu and Windows, and tested through the real external Cloudflare Tunnel.

**Risks or limitations:**

- Remote GitHub Actions and the real external Cloudflare Host forwarding path remain unvalidated because no commit or push has occurred.
- Credential-bearing URLs remain secrets and must not be exposed in screenshots, logs, clipboard history, or copied links.

**Rollback method:**

- Before any commit, unstage the complete change set with `git restore --staged .`; this would preserve all working-tree modifications. Do not run this rollback without explicit approval.

**Next step:** Review the complete staged Phase 0.5 diff. Do not commit or push without separate explicit approval. Do not begin Phase 1.

## 2026-07-12 — STEP-050: Review the complete staged Phase 0.5 diff

**Status:** Completed; one blocking issue found and reproduced

**Goal:** Review the complete staged Phase 0.5 change set before any commit, covering scope, runtime code, Windows path policy, HTTP authentication and Host/Origin controls, Cloudflared verification, public CLI routing, CI, tests, package contents, documentation consistency, and accidental secret exposure.

**Files changed:**

- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`
- No runtime or test file was modified during this review step.

**Review summary:**

- Confirmed the Git index contains the expected Phase 0.5 implementation, tests, CI, public documentation, package metadata, active rules, and memory records.
- The all-at-once staged diff exceeded the review tool buffer, so the diff was reviewed by functional module and individual file.
- Reviewed the security-sensitive changes in `src/http.ts`, `src/config.ts`, `src/guard.ts`, `src/bashOps.ts`, and `src/server.ts`.
- Reviewed the public CLI and verified Cloudflared installer path, including exact managed-binary forwarding and checksum/version controls.
- Reviewed the Windows/Ubuntu CI matrix, platform compatibility wrappers, all new regression tests, package inclusion rules, and authentication documentation tests.
- Ran targeted credential-pattern searches. No real CodexPro or Cloudflare credential was found; the only query-token-like matches were pre-existing redaction test fixtures in `scripts/smoke.mjs`.
- Found one blocking defect in `scripts/doctor.mjs`: it calculates the caller workspace but launches the legacy doctor with `cwd: projectRoot` without forwarding that calculated root. Consequently, `codexpro doctor` without explicit `--root` diagnoses the installed package/repository root instead of the caller's current workspace.

**Reproduction:**

```text
cwd: test
node ../scripts/doctor.mjs --no-profile --no-bash --tunnel none --port 57891
```

Observed doctor output:

```text
Workspace    D:\Dev\codexpro
```

Expected workspace:

```text
D:\Dev\codexpro\test
```

The command exited successfully, demonstrating that existing tests do not detect the incorrect workspace selection.

**Severity and decision:**

- Severity: blocking for commit because the new public doctor wrapper can validate the wrong workspace and wrong saved profile when invoked normally without `--root`.
- Do not commit or push the staged change set in its current form.
- The fix should preserve the caller workspace by forwarding the canonical root to the legacy doctor, preferably through `CODEXPRO_ROOT` or an explicit `--root`, while retaining the package-root location used to find built artifacts.
- Add a regression test that invokes the full doctor from a repository subdirectory without `--root` and asserts that the displayed workspace is that subdirectory.

**Verification performed:**

```text
show_changes --staged, grouped by file
node ../scripts/doctor.mjs --no-profile --no-bash --tunnel none --port 57891  (from test/)
credential-pattern searches for query tokens, HTTP tokens, and Cloudflare JWT-like tokens
```

**Risks or limitations:**

- The complete build and regression suites were already green before staging, but they cannot approve this diff because the missing caller-workspace regression case allows the defect to pass.
- Remote Ubuntu and Windows GitHub Actions and the real external Cloudflare forwarding path remain pending.

**Rollback method:**

- Restore only the STEP-050 memory edits if the review record must be removed. Do not unstage or discard the Phase 0.5 implementation without explicit approval.

**Next step:** Fix only the doctor workspace-propagation blocker, add its regression test, update memory, re-stage those files, and re-review. Do not commit, push, or begin Phase 1.

## 2026-07-12 — STEP-051: Fix Doctor caller-workspace propagation

**Status:** Completed; blocker fixed, regression-tested, re-staged, and re-reviewed

**Goal:** Fix the single blocking staged-diff review issue so the public `codexpro doctor` wrapper preserves the caller workspace when `--root` is omitted, without changing any unrelated Phase 0.5 behavior.

**Files changed:**

- `scripts/doctor.mjs`
- `test/doctor-shell.test.mjs`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Root cause:**

- The wrapper calculated the caller's canonical workspace before launching the legacy Doctor.
- It then changed the child working directory to the CodexPro package root so build artifacts could be found.
- Because the canonical caller root was not forwarded, the legacy Doctor fell back to the changed package-root working directory.

**TDD implementation:**

1. Added `full doctor preserves the caller workspace when --root is omitted`.
2. Ran the focused test and observed the expected failure: four tests passed and the new test reported `D:\Dev\codexpro` instead of `D:\Dev\codexpro\test`.
3. Made the minimal production change: pass `CODEXPRO_ROOT: canonicalRoot()` in the child environment while retaining `cwd: projectRoot` for package artifact discovery.
4. Re-ran the focused suite and obtained 5/5 passing tests.

**Verification results:**

```text
node --test test/doctor-shell.test.mjs
5 pass, 0 fail

node scripts/doctor-smoke.mjs
passed

node ../scripts/doctor.mjs --no-profile --no-bash --tunnel none --port 57891
(run from test/)
Workspace: D:\Dev\codexpro\test
exit 0

node --test
37 pass, 0 fail on Node 24

npx --yes node@20 --test
37 pass, 0 fail on Node 20

npm run smoke
8/8 sequential smoke sections passed
```

**Staged re-review:**

- The production diff is one environment-propagation line.
- The regression test exercises the real wrapper from a repository subdirectory without `--root`.
- Explicit `--root` still has CLI precedence inside the legacy Doctor.
- No unrelated runtime, authentication, path-policy, Cloudflare, package, profile, credential, commit, push, or Phase 1 change was made.

**Risks or limitations:**

- Remote Ubuntu and Windows CI still require a later approved push.
- Real external Cloudflare Host forwarding remains unvalidated.

**Rollback method:**

- Restore the previous `env: process.env` child launch and remove the new regression test. Do not perform rollback without explicit approval.

**Next step:** Wait for separate explicit approval before committing the complete staged Phase 0.5 change set. Do not push or begin Phase 1.

## 2026-07-12 — STEP-052: Create the local Phase 0.5 commit

**Status:** Completed locally; not pushed

**Goal:** Create one local commit containing the complete reviewed Phase 0.5 change set after explicit user approval, while preserving the separate approval boundary for push and all post-push validation.

**Files changed:**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`
- All previously staged Phase 0.5 implementation, test, CI, packaging, and documentation files are included in the same local commit.

**Commit summary:**

- Commit message: `feat: complete Phase 0.5 security baseline`
- Branch: `main`
- The initial commit attempt was rejected because no Git author identity was configured.
- Configured repository-local identity only: `chatGPT-10 <131769570+chatGPT-10@users.noreply.github.com>`, derived from the `origin` GitHub account and its official GitHub API account ID; global Git configuration was not changed.
- The commit includes the Doctor caller-workspace fix and its regression test.
- No push, credential rotation, profile change, history rewrite, Phase 1 work, or remote operation was performed.

**Pre-commit evidence:**

```text
node --test
37 pass, 0 fail on Node 24

npx --yes node@20 --test
37 pass, 0 fail on Node 20

npm run smoke
8/8 sequential smoke sections passed

git diff --check --cached
exit 0
```

**Decisions made:**

- The full Phase 0.5 work is intentionally committed as one reviewed baseline commit.
- Push still requires separate explicit approval.
- Remote Ubuntu/Windows CI and the real external Cloudflare Tunnel must pass before Phase 0.5 can close or Phase 1 can begin.

**Risks or limitations:**

- The local commit has not yet been validated by GitHub Actions.
- Real external Cloudflare Host forwarding remains unvalidated.
- Credential-bearing Server URLs remain password-equivalent secrets.

**Rollback method:**

- Before push, rollback would require an explicitly approved local Git operation. Do not amend, reset, revert, or rewrite history without approval.

**Next step:** Wait for separate explicit approval before pushing the local Phase 0.5 commit. Do not begin Phase 1.

## 2026-07-12 — STEP-053: Push the Phase 0.5 commit

**Status:** Completed; pushed to `origin/main`

**Goal:** Push the explicitly approved local Phase 0.5 commit to the configured GitHub remote while preserving the separate validation boundary for remote CI, the real external Cloudflare Tunnel, Phase 0.5 closure, and Phase 1.

**Pushed commit:**

- Commit: `82c24da52bc6c3419712fb3982fd9be3fb56f7de`
- Short commit: `82c24da`
- Branch: `main`
- Remote: `origin`
- Remote repository: `https://github.com/chatGPT-10/codexpro.git`

**Execution:**

```text
git push origin main
```

**Result:**

```text
7ed691e..82c24da  main -> main
```

- The push exited successfully.
- Local `main` and `origin/main` were synchronized immediately after the push.
- No force push, history rewrite, credential rotation, profile change, additional commit, or Phase 1 work was performed.

**Remaining validation:**

- Verify all Ubuntu and Windows GitHub Actions jobs for commit `82c24da`.
- Validate the real external Cloudflare Tunnel Host forwarding path.
- Phase 0.5 cannot close until both validations pass.

**Local recording state:**

- `AGENTS.md`, `Memory.md`, and this archive were updated locally after the push to record STEP-053.
- These post-push memory updates are intentionally left unstaged and uncommitted because no further staging or commit approval has been given.

**Next step:** Verify the GitHub Actions runs for commit `82c24da`. Do not stage, commit, push, close Phase 0.5, or begin Phase 1 without explicit approval.

## 2026-07-12 — STEP-054: Inspect remote GitHub Actions state

**Status:** Completed; CI validation blocked because no workflow run was created

**Goal:** Verify the Ubuntu and Windows GitHub Actions jobs for pushed commit `82c24da` without changing repository content or starting Phase 1.

**Evidence gathered from GitHub:**

- Remote `main` points to `82c24da52bc6c3419712fb3982fd9be3fb56f7de`.
- GitHub recognizes `.github/workflows/ci.yml` as workflow `CI` with state `active`.
- The workflow contains `push` on `main` and `pull_request` triggers.
- The repository is a public fork of `rebel0789/codexpro`.
- The Actions runs API returned zero workflow runs for commit `82c24da` and zero workflow runs for the repository overall.
- The commit has no GitHub Actions check runs.
- The public Actions page reports: `There are no workflow runs yet.`
- Other installed applications created empty queued check suites, but these are not GitHub Actions CI jobs and do not validate Ubuntu or Windows.

**Conclusion:**

- Remote CI did not run; this is not a passing or failing test result.
- The likely next prerequisite is enabling workflows for this fork in the GitHub Actions UI.
- After workflows are enabled, CI must be triggered and all four matrix jobs verified: Ubuntu Node 20, Ubuntu Node 24, Windows Node 20, and Windows Node 24.
- Because the current workflow has no `workflow_dispatch` trigger and no prior run exists to rerun, a later explicit decision may be required on how to trigger the first run after enabling Actions.

**Local recording state:**

- `AGENTS.md`, `Memory.md`, and this archive were updated locally.
- These records remain unstaged and uncommitted.
- No code, workflow, credential, profile, commit, push, or Phase 1 change was made during this inspection.

**Next step:** Enable workflows for the fork in the GitHub Actions page. Do not stage, commit, push, modify the workflow, or begin Phase 1 without explicit approval.

## 2026-07-12 — STEP-055: Confirm workflows enabled and reassess CI trigger

**Status:** Completed; workflows enabled, but no retroactive run was created

**Goal:** Confirm whether enabling workflows for the fork caused GitHub Actions to create a run for the already-pushed commit `82c24da`.

**Verification:**

- Queried the GitHub Actions runs API for commit `82c24da52bc6c3419712fb3982fd9be3fb56f7de` after workflows were enabled.
- The API still returned zero workflow runs.
- Therefore enabling workflows did not retroactively process the earlier push event.

**Trigger analysis:**

- The current workflow triggers on `push` to `main` and on `pull_request`.
- It does not define `workflow_dispatch`, so there is no manual **Run workflow** trigger.
- There is no prior run to rerun.
- A new approved push to `main` is therefore required to generate the first CI run unless the workflow is separately modified to add manual dispatch.

**Local recording state:**

- Updated `AGENTS.md`, `Memory.md`, and this archive.
- These updates remain unstaged and uncommitted.
- No workflow, source code, credential, profile, commit, push, or Phase 1 change was made.

**Next step:** Obtain explicit approval for a minimal new `main` push to trigger CI. Do not stage, commit, or push before that approval.

## 2026-07-12 — STEP-056: Records-only commit and push to trigger CI

**Status:** Completed; records-only follow-up pushed to `origin/main`

**Goal:** Trigger the first GitHub Actions run after workflows were enabled, while changing only project-state records and leaving all runtime, test, workflow, packaging, security, authentication, Cloudflare, and Phase 1 code untouched.

**Files included:**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Commit intent:**

- Record STEP-053 through STEP-056 accurately.
- Create a new `push` event on `main` because enabling workflows did not retroactively process commit `82c24da`.
- Trigger the existing CI matrix without adding `workflow_dispatch` or changing `.github/workflows/ci.yml`.

**Safety boundaries:**

- No source code, tests, CI workflow, package metadata, credentials, profiles, or Cloudflare configuration changed.
- No force push, amend, reset, history rewrite, or Phase 1 work was performed.
- The records-only commit and push were explicitly approved by the user.

**Next step:** Verify the GitHub Actions run and all four matrix jobs: Ubuntu Node 20, Ubuntu Node 24, Windows Node 20, and Windows Node 24. Real external Cloudflare Tunnel validation remains separately required before Phase 0.5 can close.

## 2026-07-12 — STEP-057: Check the in-progress CI run

**Status:** Partially complete; Windows passed, Ubuntu still running

**Goal:** Inspect GitHub Actions run `29181286011` and determine whether all four operating-system and Node-version matrix jobs completed successfully.

**Verified results:**

- Records-only commit: `6c9ba9dd9f95bbe27634f5ecef58f124ce872f19`.
- Repository: `chatGPT-10/codexgpt` after the GitHub repository rename.
- Windows / Node 20: completed successfully.
- Windows / Node 24: completed successfully.
- Both Windows jobs passed checkout, Node setup, install, build, regression tests, smoke tests, and package-content checks.

**Still in progress:**

- Ubuntu / Node 20 remained in `Regression Tests`.
- Ubuntu / Node 24 remained in `Regression Tests`.
- The overall workflow run remained `in_progress` with no conclusion.
- Multiple short polling checks produced the same state, so no final pass or failure was inferred.

**Log limitation:**

- The unauthenticated GitHub API exposed job and step states but rejected job-log download with HTTP 403 because repository-admin authentication is required.

**Local recording state:**

- Updated `Memory.md` and this archive locally.
- These records remain unstaged and uncommitted.
- No code, workflow, remote, credential, profile, commit, push, or Phase 1 change was made.

**Next step:** Check run `29181286011` again after the Ubuntu jobs finish. Do not claim CI success, stage, commit, push, validate Cloudflare, close Phase 0.5, or begin Phase 1 before the final result is available.

## 2026-07-12 — STEP-058: Diagnose the Ubuntu CI hang

**Status:** Diagnosed; CI run is stuck and requires cancellation plus a code/test fix

**Goal:** Determine whether the long-running Ubuntu jobs were merely slow or genuinely stuck, and identify the most likely process-level cause without modifying code or cancelling the run.

**Observed state:**

- GitHub Actions run: `29181286011`.
- Current observation time: `2026-07-12T06:53:13Z`.
- Run elapsed time: about 82 minutes.
- Windows / Node 20: completed successfully; its `Regression Tests` step took about 5 seconds.
- Windows / Node 24: completed successfully; its `Regression Tests` step took about 5 seconds.
- Ubuntu / Node 20: remained in `Regression Tests` since `2026-07-12T05:31:25Z`.
- Ubuntu / Node 24: remained in `Regression Tests` since `2026-07-12T05:31:26Z`.
- The overall run remained `in_progress`; no failure conclusion had been emitted.

**Root-cause trace:**

1. `test/connector-auth-output.test.mjs` starts `scripts/codexpro-entry.mjs` with piped stdout/stderr.
2. `scripts/codexpro-entry.mjs` invokes the legacy CLI using synchronous `spawnSync(..., { stdio: "inherit" })`.
3. The legacy CLI starts the MCP HTTP server as another child process.
4. Test cleanup calls `child.kill("SIGTERM")` only on the outer entry process.
5. On POSIX/Linux, terminating that outer process does not reliably terminate the synchronous child and MCP-server descendant process tree.
6. The surviving descendant can retain the inherited stdout/stderr pipes, preventing the Node test worker from exiting even though assertions have likely finished.
7. This explains why both Ubuntu Node versions hang at the same regression step while both Windows jobs pass quickly.

**Confidence:**

- The hang diagnosis is high confidence based on the 82-minute unchanged state, identical behavior on Ubuntu Node 20 and 24, fast Windows completion, and the verified wrapper/child/descendant process chain.
- The exact individual test output could not be downloaded through the unauthenticated API; GitHub returned HTTP 403 for job-log download because repository-admin authentication is required.

**Local recording state:**

- Updated `AGENTS.md`, `Memory.md`, and this archive locally.
- These changes remain unstaged and uncommitted.
- No code, workflow, remote, credential, profile, CI cancellation, commit, push, or Phase 1 work was performed.

**Next step:** After explicit approval, cancel run `29181286011`, add a regression-safe Linux process-tree cleanup fix, run focused and full local verification, then commit/push to trigger fresh CI. Real external Cloudflare Tunnel validation remains separately required.

## 2026-07-12 — STEP-059: Fix Linux regression-test process-tree cleanup

**Status:** Implemented and locally verified; fresh CI trigger pending push

**Goal:** Prevent Linux GitHub Actions regression tests from hanging after CLI assertions complete by terminating the complete spawned process tree rather than only the outer public-entry process.

**Files changed:**

- `test/connector-auth-output.test.mjs`
- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Implementation:**

- The CLI test process is now started with `detached: true` on POSIX platforms, creating a separate process group.
- Test cleanup sends `SIGTERM` to the negative process-group ID so the outer entry process, synchronous legacy CLI child, and MCP server descendant receive the signal together.
- If the process does not exit within three seconds, cleanup sends `SIGKILL` to the same process group.
- Windows retains direct child-process signaling and is not changed to detached process groups.
- Added direct unit coverage proving POSIX cleanup targets the negative process-group ID and Windows cleanup targets the child process.

**Verification:**

```text
node --test test/connector-auth-output.test.mjs
4 pass, 0 fail

node --test
38 pass, 0 fail on Node 24

npx --yes node@20 --test
38 pass, 0 fail on Node 20

npm run smoke
8/8 sequential smoke sections passed
```

**Environment limitation:**

- WSL is not installed and Docker is unavailable on the Windows development machine, so the actual POSIX process-group behavior cannot be executed locally.
- Fresh Ubuntu GitHub Actions is the required final Linux verification.

**CI cancellation limitation:**

- Automated cancellation was attempted but blocked because repository-admin GitHub authentication was not available to the execution tool.
- Stuck run `29181286011` therefore still requires manual cancellation through the GitHub Actions UI.

**Safety boundaries:**

- No runtime source, authentication, HTTP security, Cloudflare, package, profile, or Phase 1 behavior was modified.
- No workflow change, force push, history rewrite, or credential exposure occurred.

**Next step:** Commit and push these four files to trigger fresh CI, manually cancel run `29181286011`, then verify all Ubuntu and Windows jobs before proceeding to Cloudflare validation.

## 2026-07-12 — STEP-060: Push the Linux process-tree cleanup fix

**Status:** Completed; fresh CI triggered, old stuck run still active

**Goal:** Publish the verified Linux process-tree cleanup fix and trigger a fresh GitHub Actions matrix run without modifying runtime source or the CI workflow.

**Commit and push:**

- Commit: `da83f776d06eb3e8a995b27f97f80ffc1d8cd739`
- Message: `fix: clean up Linux test process trees`
- Files: `test/connector-auth-output.test.mjs`, `AGENTS.md`, `Memory.md`, and this archive.
- Push range: `6c9ba9d..da83f77` on `main`.
- GitHub again redirected the legacy repository URL to `https://github.com/chatGPT-10/codexgpt.git`; the local remote was not changed.

**Fresh CI:**

- New run: `29183635923`.
- Trigger: push of commit `da83f77`.
- Initial state: all four matrix jobs were running.

**Old run:**

- Run `29181286011` remained `in_progress` and unchanged.
- Automated cancellation could not be completed because the execution tool could not use repository-admin GitHub authentication.
- The old run still requires manual cancellation in the GitHub Actions UI.

**Local recording state:**

- Updated `AGENTS.md`, `Memory.md`, and this archive after the push.
- These post-push records remain unstaged and uncommitted.
- No additional code, workflow, credential, profile, remote, or Phase 1 change was made.

**Next step:** Manually cancel run `29181286011`, then inspect run `29183635923` until all Ubuntu and Windows jobs reach a final conclusion. Real external Cloudflare Tunnel validation remains separately required.

## 2026-07-12 — STEP-061: Verify fresh Ubuntu CI after the cleanup fix

**Status:** Ubuntu verification passed; Windows jobs still running

**Goal:** Confirm that commit `da83f77` resolves the Linux regression-test hang in real GitHub-hosted Ubuntu runners.

**Fresh CI run:**

- Run: `29183635923`.
- Commit: `da83f776d06eb3e8a995b27f97f80ffc1d8cd739`.
- Ubuntu / Node 20: completed successfully.
- Ubuntu / Node 24: completed successfully.
- Both Ubuntu jobs completed the regression, smoke, and package-content stages instead of hanging in `Regression Tests`.
- This provides direct Linux evidence that process-group cleanup fixed the original hang.

**Still pending at the stopping point:**

- Windows / Node 20 remained in `Smoke Test`.
- Windows / Node 24 remained in `Smoke Test`.
- The overall fresh run therefore remained `in_progress` with no final conclusion.

**Old run:**

- Run `29181286011` remained stuck and still requires manual cancellation in the GitHub Actions UI.

**Local recording state:**

- Updated `AGENTS.md`, `Memory.md`, and this archive locally.
- These records remain unstaged and uncommitted.
- No code, workflow, remote, credential, profile, commit, push, or Phase 1 change was made after the fix push.

**Next step:** Manually cancel old run `29181286011`, then recheck run `29183635923` for the final Windows results. Real external Cloudflare Tunnel validation remains separately required.

## 2026-07-12 — STEP-062: Complete fresh cross-platform CI verification

**Status:** Completed; all fresh CI jobs passed

**Goal:** Obtain the final result for CI run `29183635923` after the Linux process-tree cleanup fix.

**Final result:**

- Overall run status: `completed`.
- Overall conclusion: `success`.
- Ubuntu / Node 20: success.
- Ubuntu / Node 24: success.
- Windows / Node 20: success.
- Windows / Node 24: success.

**Conclusion:**

- The Linux regression-test hang is fixed in real GitHub-hosted Ubuntu runners.
- The process-tree cleanup change did not regress either Windows Node version.
- Remote Ubuntu and Windows CI is now an approved passed gate for Phase 0.5.

**Remaining items:**

- Old run `29181286011` remains stuck and requires manual cancellation in the GitHub Actions UI.
- Real external Cloudflare Tunnel Host forwarding remains unvalidated and is the remaining Phase 0.5 gate.
- Phase 1 must not begin until the tunnel validation passes and Phase 0.5 is explicitly closed.

**Local recording state:**

- Updated `AGENTS.md`, `Memory.md`, and this archive locally.
- These records remain unstaged and uncommitted.
- No code, workflow, remote, credential, profile, commit, push, or Phase 1 change was made after the successful CI result.

**Next step:** Manually cancel run `29181286011`, then perform the real external Cloudflare Tunnel validation. Do not stage, commit, push, close Phase 0.5, or begin Phase 1 without explicit approval.

## 2026-07-12 — STEP-063: Cancel the stale CI run

**Status:** Completed; stale run cancelled

**Goal:** Remove the obsolete stuck workflow run after the replacement run had already completed successfully.

**Verification:**

- Old run `29181286011`: `completed` with conclusion `cancelled`.
- Cancellation update time: `2026-07-12T07:14:42Z`.
- Fresh authoritative run `29183635923`: `completed` with conclusion `success`.
- The successful fresh run remains the valid Ubuntu/Windows Node 20/24 CI result for commit `da83f77`.

**Safety boundaries:**

- No code, workflow, remote, credential, profile, commit, push, or Phase 1 change was made.
- The cancellation affected only the obsolete stuck workflow run.

**Local recording state:**

- Updated `AGENTS.md`, `Memory.md`, and this archive locally.
- These records remain unstaged and uncommitted.

**Next step:** Validate the real external Cloudflare Tunnel Host forwarding path. Do not stage, commit, push, close Phase 0.5, or begin Phase 1 without explicit approval.

## 2026-07-12 — STEP-064: Validate the real external Cloudflare Host-forwarding path

**Status:** Completed; external Host-forwarding gate passed

**Goal:** Verify that the configured public hostname reaches the live CodexPro server through Cloudflare with the correct Host value, rather than stopping at DNS, TLS, Cloudflare, or the CodexPro Host allowlist.

**Active configuration:**

- Profile root: `D:\\Dev\\codexpro`.
- Local server: `127.0.0.1:8787`.
- Tunnel mode: `cloudflare-named`.
- Public hostname: `codexpro.drliang.uk`.
- Tunnel name: `codexpro-service-rotated-20260709`.
- Authentication: enabled; the saved token was not printed or exposed.

**Verification:**

1. Confirmed local TCP port `8787` was open.
2. Requested `https://codexpro.drliang.uk/healthz` without credentials.
3. Received HTTP `401 Unauthorized` with Cloudflare response evidence: `Server: cloudflare` and a `CF-Ray` header.
4. Confirmed the response body was CodexPro's `Unauthorized`, not a Cloudflare 404/502 or tunnel error.
5. Inspected `src/http.ts`: Host validation occurs before authentication. A rejected Host returns `403 Forbidden: Host is not allowed`; only an accepted Host proceeds to the authentication middleware that returns `401 Unauthorized` without a valid token.
6. Therefore the real public hostname passed DNS/TLS/Cloudflare forwarding and the CodexPro Host allowlist before reaching authentication.
7. The active `codexpro_windows` connector continued to serve authenticated tool calls during the validation.

**Security limitation:**

- Automated query-token and Bearer probes were intentionally not performed because the execution safety layer blocked commands or temporary scripts that read the saved token and made network requests.
- This did not prevent validation of the requested Host-forwarding gate: the observed `401` can only occur after Host validation succeeds in the verified middleware order.
- No token, credential-bearing URL, private key, or tunnel credential was printed, copied, or modified.

**Conclusion:**

- Real external Cloudflare Host forwarding: passed.
- Local validation: passed.
- Remote Ubuntu/Windows Node 20/24 CI: passed.
- All approved Phase 0.5 gates are now satisfied.
- Phase 0.5 is ready for an explicit closure decision but is not yet closed.

**Local recording state:**

- Updated `AGENTS.md`, `Memory.md`, and this archive locally.
- These records remain unstaged and uncommitted.
- No runtime code, workflow, remote, profile, credential, commit, push, Phase 0.5 closure, or Phase 1 work was performed.

**Next step:** Obtain explicit approval to close Phase 0.5 and commit/push the final records. Do not begin Phase 1 before Phase 0.5 is explicitly closed.

## 2026-07-12 — STEP-065: Formally close Phase 0.5

**Status:** Completed; Phase 0.5 closed

**Goal:** Formally close Phase 0.5 after every approved local, cross-platform CI, and real external Cloudflare Host-forwarding gate passed, then publish the final closure record without beginning Phase 1.

**Closure evidence:**

- Local Node 20 and Node 24 regression suites passed.
- Smoke suite passed all eight sequential sections.
- GitHub Actions run `29183635923` passed Ubuntu/Windows on Node 20/24.
- Stale run `29181286011` was manually cancelled and verified as `completed/cancelled`.
- Public `https://codexpro.drliang.uk/healthz` reached CodexPro through Cloudflare, passed Host validation, and returned the expected unauthenticated `401 Unauthorized`.
- No approved Phase 0.5 validation gate remains open.

**Decision:**

- Phase 0.5 is formally closed on 2026-07-12.
- The completed Phase 0.5 baseline must be preserved.
- OAuth 2.1 remains deferred.
- Phase 1 has not started and requires separate explicit approval.

**Files in the closure record:**

- `AGENTS.md`
- `Memory.md`
- `docs/memory/archive/phase-0-and-0.5.md`

**Safety boundaries:**

- No runtime code, tests, workflow, package metadata, remote, profile, token, tunnel credential, or access boundary changed.
- No Phase 1 planning or implementation was performed.

**Next step:** Stop. Do not begin Phase 1 or alter the closed Phase 0.5 baseline without separate explicit approval.
