# Interphase Maintenance Archive — Part 14

This is the active continuation after Part 13 closed at STEP-543. Append new maintenance records here; do not rewrite closed volumes.

## 2026-09-01 — STEP-544: Next-launch tool-mode control

**Status:** completed locally under the owner's explicit request for browser-managed tool-call mode. This slice saves one local workspace-profile selector only. It does not start, stop, restart, deploy, publish, stage, commit, push, rebind OAuth, alter a root, alter a grant, alter a Tunnel, or mutate the currently running runtime.

**Goal:** let the authenticated loopback control page choose the next launch's visible tool surface (`minimal`, `standard`, or `full`) without asking the owner to enter a PowerShell command and without treating a saved preference as live authority.

**Files changed:** `src/http/localAdminSettings.ts`; `src/http/localAdminApp.ts`; `src/http.ts`; `test/local-admin-settings.test.mjs`; `test/phase-8-auth-ui.test.mjs`; `Memory.md`; and this archive. The STEP-543 overview and closed Part 13 remain intact.

**Implementation and user impact:** the new settings service reads the current workspace profile and exposes a bounded snapshot containing tool mode, safe profile path, and whether it differs from the running mode. A CSRF- and Origin-protected `/api/settings/tool-mode` endpoint accepts only the three exact modes. The browser labels the change as “next launch,” shows its pending effect, and never claims that the existing process has changed. The local UI remains hidden unless a valid owner session is present.

**OAuth preservation:** an initially tempting reuse of the Legacy settings serializer was rejected because it omits OAuth deployment selectors. `profileWithToolMode` now removes only the read-only `profilePath` view field and replaces only `toolMode`; every existing OAuth auth route, hostname, tunnel ownership marker, issuer/resource pair, credential provider, and opaque state reference survives the write. The dedicated regression freezes that property.

**Verification:** `npm run build` passed. `npm run test:focused -- test/phase-8-auth-ui.test.mjs test/local-admin-settings.test.mjs` passed 2/2, covering the authenticated settings endpoint, invalid-mode rejection, and OAuth selector preservation. A first build failed with TypeScript `TS7006` because the new service method parameter lacked an explicit type; the bounded annotation corrected it before the passing build. `npm run policy:check`, `git diff --check`, and the scoped added-line credential scan remain required after this documentation record.

**Risks, rollback, and next action:** saved profile changes take effect only after a later intentional runtime restart, and a future independent lifecycle host must report saved-versus-running state explicitly. Roll back by removing the settings service, endpoint, UI section, and the two focused assertions; do not modify OAuth deployment data. Next, create the separate loopback lifecycle host with a read-only status contract before exposing any start/stop/restart operation. Root expansion/default-root changes and execution-profile settings remain separately bounded work.

## 2026-09-01 — STEP-545: Independent loopback lifecycle host foundation

**Status:** completed locally under the owner's instruction to execute the next Local Control Plane step. The host is a separate process and a read-only observation surface. It neither starts nor terminates an MCP Runtime, changes a workspace root, modifies OAuth, or changes any external service.

**Goal:** establish and test the structural fact required for reliable lifecycle control: the browser control plane must remain available when the Runtime is absent, stopped, or later restarted.

**Files changed:** `src/control/lifecycleStatus.ts`; `src/controlHost.ts`; `src/http/lifecycleControlApp.ts`; `src/http/loopbackAdminSecurity.ts`; `src/http/localAdminApp.ts`; `scripts/codexgpt-entry.mjs`; `test/lifecycle-control-app.test.mjs`; the daily-operation guide; `Memory.md`; and this archive.

**Implementation and user impact:** `codexgpt control --root <workspace> [--port 8791]` now launches a loopback-only control process separate from the Runtime. It prints a short-lived bootstrap URL, exchanges it for the existing HttpOnly/SameSite local session, and serves an authenticated status page. The status source returns only the workspace, safe mode selectors from any runtime connection record, and an intentionally conservative state: `not_observed` or `external_runtime_observed`. It never claims ownership of an independently launched process and has no start/stop/restart endpoint. The host is not exposed through Cloudflare or any public listener.

**Security and design:** the new host shares the reviewed exact-Host, loopback-peer, no-store, CSP, bootstrap-session, and CSRF-capable primitives with the OAuth local admin page. The common primitives were extracted rather than copied so both local pages retain one implementation of their Host and peer checks. The bootstrap URL is intentionally not written to project files or documentation; it is short-lived and must be handled as a local credential. No runtime endpoint, OAuth audit, credential store, profile mutation, or process tree is touched by status reads.

**Verification:** `npm run build` passed after correcting strict literal typing in the status source. `npm run test:focused -- test/phase-8-auth-ui.test.mjs test/local-admin-settings.test.mjs test/lifecycle-control-app.test.mjs test/cli-hostname-propagation.test.mjs` passed 4/4. The focused lifecycle test proves exact loopback Host rejection, unauthenticated status rejection, one-time bootstrap exchange, HttpOnly/SameSite session cookie, CSP, and authenticated read-only status projection. `node dist/controlHost.js --help` and `node scripts/codexgpt-entry.mjs control --help` both printed the same expected usage. `npm run policy:check` passed; `git diff --check` found no whitespace error beyond informational LF-to-CRLF notices.

**Risks, rollback, and next action:** this host itself still needs a foreground launch and does not solve automatic Windows startup; Task Scheduler/service installation remains separately gated. A saved runtime connection can be stale, so it is deliberately an observation rather than liveness proof. Roll back by removing the new host, app, status source, CLI branch, shared helper extraction, focused test, and guide section. Next, define an owned-child lifecycle journal and exact PID/creation-time verification before exposing a start action; only then can a later stop/restart action target a controller-owned Runtime.

## 2026-09-01 — STEP-546: Runtime ownership journal

**Status:** completed locally as the prerequisite for a later lifecycle mutation. No Runtime child was launched, stopped, restarted, or adopted in this step, and no OAuth, profile, Tunnel, DNS, App, service, commit, or push state changed.

**Goal:** make future lifecycle actions prove that a target Runtime belongs to this exact control-host instance, rather than accepting a PID or a stale state file as authority.

**Files changed:** `src/control/runtimeOwnership.ts`; `src/control/lifecycleStatus.ts`; `src/controlHost.ts`; `test/runtime-ownership.test.mjs`; `test/lifecycle-control-app.test.mjs`; `Memory.md`; and this archive.

**Implementation and boundary:** the atomic per-workspace journal records a random controller instance ID, canonical workspace root, PID, process creation time, state, and bounded timestamps. A record is `owned_running` only when both its controller ID and a fresh creation-time lookup match. A restarted control host, a reused PID, missing liveness evidence, or a different controller ID becomes `foreign_or_stale`. The read-only page surfaces this exact ownership classification, but still exposes no lifecycle mutation. It neither adopts an observed external Runtime nor provides an API that could terminate it.

**Verification:** `npm run build` passed after adding the explicit service callback parameter type required by strict TypeScript. `npm run test:focused -- test/runtime-ownership.test.mjs test/lifecycle-control-app.test.mjs test/phase-8-auth-ui.test.mjs test/local-admin-settings.test.mjs` passed 4/4. The ownership test proves initial absence, same-controller exact-creation ownership, post-host-restart rejection, PID reuse rejection, and stale-identity rejection.

**Risks, rollback, and next action:** this is a journal and verification boundary, not an actual child-process supervisor. It cannot make an external process safe to stop. Roll back by removing the ownership module, host/status wiring, and tests; leave existing Runtime and OAuth state intact. Next, add a controller-owned child launcher that records identity only after successful acquisition and preserves a truthful `starting|running|failed` state before wiring the first authenticated start button.

## 2026-09-01 — STEP-547: Controlled Runtime child manager

**Status:** completed locally as a child-lifecycle foundation. The manager is not reachable from the browser yet, so no actual Runtime was spawned, stopped, or restarted.

**Goal:** bind a future launched Runtime child to the ownership journal immediately after exact PID identity acquisition, while preserving the truthful distinction between “spawned” and “ready.”

**Files changed:** `src/control/runtimeChildManager.ts`; `src/control/runtimeOwnership.ts`; `src/control/lifecycleStatus.ts`; `test/runtime-child-manager.test.mjs`; `test/runtime-ownership.test.mjs`; `Memory.md`; and this archive.

**Implementation and boundary:** the manager accepts only a controller-owned child handle, verifies a positive PID and fresh process creation time, then records `owned_starting`. It registers the exit listener before identity persistence and reconciles an exit racing the record write, so a short-lived child cannot remain falsely shown as starting. The ownership store can later transition only an exact owned child to `owned_running` after health verification, or to `exited` with its bounded exit code. It still cannot adopt an external process, and it has no HTTP route or stop primitive.

**Verification:** `npm run build` passed after strict TypeScript narrowed the optional child PID and required explicit callback types. `npm run test:focused -- test/runtime-ownership.test.mjs test/runtime-child-manager.test.mjs test/lifecycle-control-app.test.mjs test/phase-8-auth-ui.test.mjs test/local-admin-settings.test.mjs` passed 5/5. The new regression proves an exact child begins `owned_starting`, follows its own exit to `exited`, and remains distinct from controller restart/PID-reuse cases.

**Risks, rollback, and next action:** a spawned child has not yet passed a Runtime health check, so the manager deliberately does not call it running. Roll back by removing the child manager and restoring the earlier ownership schema/test expectation; do not touch external Runtime or OAuth data. Next, implement a bounded local health gate and only then expose the first CSRF-protected Start Runtime button; stop/restart remain deferred until the full owned-tree shutdown contract is tested.

## 2026-09-01 — STEP-548: Authenticated owned Runtime controls

**Status:** completed locally under the owner's instruction to continue the browser-control implementation. This step adds no service installation, deployment, OAuth/profile/root mutation, commit, push, or external Runtime action; focused tests use fakes and no real Runtime was launched.

**Goal:** allow the local owner to start a Runtime from the independent control page only when it can be truthfully health-verified, and to stop only the exact process tree that this same control-host instance started.

**Files changed:** `src/controlHost.ts`; `src/control/runtimeChildManager.ts`; `src/control/runtimeOwnership.ts`; `src/http/lifecycleControlApp.ts`; `test/runtime-child-manager.test.mjs`; `test/lifecycle-control-app.test.mjs`; the daily-operation guide; `Memory.md`; and this archive.

**Implementation and security boundary:** `POST /api/runtime/start` and `POST /api/runtime/stop` require the existing exact-loopback peer/Host checks, owner session, same-origin request, and CSRF token. Start launches the supported public entry for the configured root, records it only after exact Windows PID creation-time verification, and waits at most 15 seconds for local `/healthz`; only HTTP 200 may promote `owned_starting` to `owned_running`. Stop requires the same controller's retained child handle plus fresh ownership identity, then uses Windows `taskkill /T` on that exact owned PID. It records `exited` only after the terminate helper confirms that PID is gone. A foreign, stale, restarted-host, or PID-reused record cannot be adopted or stopped. Restart remains unavailable.

**User impact:** after launching `codexgpt control --root <workspace>`, the authenticated browser page now provides Start and Stop Runtime without asking the owner to type the Runtime start command. A health timeout is shown as non-ready rather than a false success. The control host remains a foreground local process and is not a Windows service or automatic-start mechanism.

**Verification:** `npm run build` passed. `npm run test:focused -- test/runtime-ownership.test.mjs test/runtime-child-manager.test.mjs test/lifecycle-control-app.test.mjs test/phase-8-auth-ui.test.mjs test/local-admin-settings.test.mjs` passed 7/7, covering unauthenticated/CSRF denial, authenticated Start/Stop wiring, strict child identity, health promotion, normal exit, and confirmation-based stop after the process becomes unobservable. `npm run policy:check`, `git diff --check`, scoped credential scan, and intended-file review follow this record.

**Risks, rollback, and next action:** Start may leave a child in `owned_starting` when the local health endpoint does not become ready; Stop remains available only while the same control-host instance retains that child, otherwise the state fails closed. Roll back by removing the lifecycle routes/UI, Windows launch/terminate hooks, and ownership child-manager additions; do not target an external process. Next, design and test an explicit restart transaction that stops, confirms exit, starts, health-checks, and reports each stage without widening authority; root and permission changes remain separate security work.

## 2026-09-01 — STEP-549: Serialized owned Runtime restart

**Status:** completed locally under the owner's instruction to execute the next browser-control step. No real Runtime, OAuth, profile/root, Tunnel, DNS, App, service, commit, push, or release state was changed.

**Goal:** expose a browser Restart action only as one fail-closed lifecycle transaction: confirm stop of the exact owned child, then create a fresh child and report it running only after a new local health check.

**Files changed:** `src/control/runtimeChildManager.ts`; `src/control/lifecycleStatus.ts`; `src/http/lifecycleControlApp.ts`; `src/http/localAdminApp.ts`; `test/runtime-child-manager.test.mjs`; `test/lifecycle-control-app.test.mjs`; the daily-operation guide; `Memory.md`; and this archive.

**Implementation and security boundary:** the child manager now serializes `start|stop|restart`. A duplicate concurrent Start joins the same start operation, while any conflicting lifecycle request fails with `CONTROL_RUNTIME_OPERATION_IN_PROGRESS`; this prevents two browser requests from creating competing children. Restart calls the existing exact-owned stop helper, which verifies termination, before launching a new child through the existing PID-creation-time and local-health gate. The loopback page and its `/api/runtime/restart` endpoint require the same authenticated session, exact Origin, and CSRF token as Start/Stop. The status contract now explicitly says `start_stop_restart_owned_only`. The OAuth runtime's own admin page is corrected to say lifecycle belongs to the independent host, rather than presenting stale unavailable text.

**User impact:** the independent local page can now restart a healthy or still-starting Runtime with one click. During an action, Start, Stop, and Restart are disabled. If stop confirmation or the new health check fails, the transaction does not claim a successful restart, and the owner sees the returned lifecycle/error state.

**Verification:** an initial focused test run exposed a test-only timing race (`releaseHealth is not a function`): the concurrent request was made before the async health gate had been entered. The regression now explicitly waits for that gate, rather than weakening the manager. `npm run build` and `npm run test:focused -- test/runtime-ownership.test.mjs test/runtime-child-manager.test.mjs test/lifecycle-control-app.test.mjs test/phase-8-auth-ui.test.mjs test/local-admin-settings.test.mjs` are required after this record. The new regression covers exact stop followed by fresh child/health promotion and a conflicting Stop while Start is pending; the HTTP test checks authenticated Restart wiring and the rendered button. Policy, diff, credential scan, intended-file review, and documentation update remain required for closure.

**Risks, rollback, and next action:** Restart intentionally does not adopt an externally started Runtime or recover ownership after a control-host restart. A failed new health check may leave the newly owned child in `owned_starting`, where the same host can still Stop it. Roll back by removing Restart from the manager, route, page, status contract, and focused tests; leave Start/Stop's established ownership constraints unchanged. Next, separately design browser workspace/root and permission changes; they must not silently widen allowed roots, alter the OAuth configured root, or turn a saved selector into live authority.

## 2026-09-01 — STEP-550: Browser workspace access and safe tool-permission presets

**Status:** completed locally under the owner's explicit authorization to finish browser workspace and permission management. No Runtime, profile OAuth selector, default OAuth root, Tunnel, DNS, App, service, commit, push, or release state was changed during this implementation/test step.

**Goal:** remove routine PowerShell edits from adding/removing a precisely scoped additional project root and selecting next-launch tool permissions, without making the current OAuth App's configured root mutable or presenting `full_access` as a harmless browser option.

**Files changed:** `src/control/workspaceControlSettings.ts`; `src/controlHost.ts`; `src/http/lifecycleControlApp.ts`; `test/workspace-control-settings.test.mjs`; `test/lifecycle-control-app.test.mjs`; the daily-operation guide; `Memory.md`; and this archive.

**Implementation and security boundary:** a separate atomic control-host settings record is keyed to the immutable OAuth workspace root. It stores no credential or OAuth material. Adding a root requires a real existing local directory, rejects UNC/device/volume-root/ambiguous paths, resolves native realpath, previews the result, and then requires the owner to type that exact canonical path before persistence. The base root cannot be removed; additional roots are supplied only when the control host later launches its owned Runtime. The browser does not rebind OAuth: after Restart, ChatGPT must call `open_workspace` for an added root and use its returned `workspace_id`. The three next-launch presets are `read_only` (minimal/off/off), `edit` (standard/workspace/off), and `run_safe` (full/workspace/safe); all retain `executionProfile=off`, so they do not claim to enable or sandbox `full_access`.

**User impact:** the independent control page now lists allowed roots, supports review/add/remove for extra directories, and explains their next-launch effect. It also presents clear permission choices and their actual tool/write/Safe-Bash outcome. Start and Restart materialize these saved settings, while a currently running Runtime remains unchanged until restart.

**Verification:** `npm run build` passed. `npm run test:focused -- test/workspace-control-settings.test.mjs test/lifecycle-control-app.test.mjs test/runtime-child-manager.test.mjs test/runtime-ownership.test.mjs test/phase-8-auth-ui.test.mjs test/local-admin-settings.test.mjs` passed 10/10. Coverage includes exact path confirmation, base-root retention, preset projection, UI controls, owner-session/CSRF denial of workspace preview, authenticated preview, and existing lifecycle/OAuth regressions. `npm run policy:check`, `git diff --check`, scoped credential scan, and intended-file review follow this record.

**Risks, rollback, and next action:** an added root is an explicit increase in what the next Runtime may read/write under its selected preset, so the UI's two-step confirmation is not a substitute for selecting only trusted projects. A control-host restart fails closed against Runtime ownership. Roll back by removing the settings record/service, lifecycle-page settings endpoints/UI, host launch arguments, and focused tests; existing Runtime/OAuth data is untouched. A distinct project default root requires its own separately reviewed OAuth deployment rather than reuse of this App; native `full_access` remains separately gated.
