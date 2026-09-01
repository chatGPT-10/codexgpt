# Network Configuration Compatibility Inventory

Date: 2026-08-28
Status: STEP-528 inventory plus STEP-529–531 compatibility repairs
Scope: supported public CLI planning versus the direct runtime resolver

## Conclusion

The historical network inputs are not one interchangeable compatibility group. STEP-529 repaired `CODEBASE_BRIDGE_REPO_ROOT` public-entry parity, STEP-530 preserved `CODEXGPT_HOSTNAME` compatibility provenance, and STEP-531 preserved `NGROK_DOMAIN` without changing effective values/fingerprints. The last input is now explicitly mode-ambiguous because its ngrok-specific name has established cross-mode behavior. No removal or migration warning is scheduled until that ambiguity receives a separate compatibility decision.

## Observed matrix

| Input | Direct runtime | Supported public entry | Provenance | Decision |
| --- | --- | --- | --- | --- |
| `--root` / `CODEXGPT_ROOT` | Canonical | Canonical | Preserved | Keep canonical. |
| `CODEBASE_BRIDGE_REPO_ROOT` | Selects the same root as `CODEXGPT_ROOT` | Selects the same workspace and saved profile only when CLI/canonical root is absent | Preserved as compatibility; `config explain` and doctor emit one value-free migration command | Migration-compatible after STEP-529; retain for the migration window. |
| `--host` / `CODEXGPT_HOST` | Canonical | Canonical | Preserved | Keep canonical. |
| `HOST` | Used as a lower-priority direct-runtime fallback | Ignored by the public planner, which publishes canonical `CODEXGPT_HOST` | Not projected by `config explain` | Generic process variable, not a supported public alias. Do not advertise or deprecate as equivalent. |
| `--port` / `CODEXGPT_PORT` | Canonical | Canonical | Preserved | Keep canonical. |
| `PORT` | Used as a lower-priority direct-runtime fallback | Ignored by the public planner, which publishes canonical `CODEXGPT_PORT` | Not projected by `config explain` | Generic process variable, not a supported public alias. Do not advertise or deprecate as equivalent. |
| `--hostname` | Canonical stable-hostname CLI input | Canonical | Preserved as `--hostname` | Keep canonical. |
| `--url` | Not a direct-runtime input | Same selected hostname and runtime fingerprint as `--hostname` | Preserved as `--url` | Retain as an intentional CLI convenience alias. |
| `CODEXGPT_PUBLIC_HOSTNAME` | Canonical Host-allowlist hint | Canonical | Preserved | Keep canonical. |
| `CODEXGPT_HOSTNAME` | Same Host-allowlist value | Same selected hostname and runtime fingerprint | Preserved as compatibility; warning command contains variable names only | Migration-compatible after STEP-530; retain for the migration window. |
| `NGROK_DOMAIN` | Same Host-allowlist value | Same selected hostname and runtime fingerprint, even outside ngrok mode | Preserved as mode-ambiguous compatibility, with no diagnostic | Retain cross-mode behavior after STEP-531; new configuration should use `CODEXGPT_PUBLIC_HOSTNAME`, but warning/removal remains a separate decision. |
| `TAILSCALE_FUNNEL_HOSTNAME` | Not read by the HTTP runtime | Used by interactive setup defaults only; ignored by normal public start | Not projected by `config explain` | Setup-only input, not a public-start alias. Do not claim equivalence. |
| saved profile `hostname` | Loaded through the selected canonical root | Used after CLI/environment hostname inputs | Preserved with profile path and JSON path | Keep as the saved canonical source. |

## Gate

`test/network-config-compatibility.test.mjs` executes the supported public entry and the direct runtime resolver against isolated temporary roots. It freezes both positive equivalence and deliberate non-equivalence:

- compatibility root: direct runtime and public entry yes, with CLI/canonical precedence and compatibility provenance preserved;
- generic host/port: direct runtime yes, public entry no;
- `CODEXGPT_HOSTNAME`: public runtime/fingerprint yes, compatibility provenance and value-free migration diagnostic preserved;
- `NGROK_DOMAIN`: public runtime/fingerprint yes in both `none` and `ngrok` modes, original provenance and mode-ambiguous classification preserved, no warning scheduled;
- `TAILSCALE_FUNNEL_HOSTNAME`: normal public start no;
- `--url`: public value equivalence with CLI provenance retained.

The test is included in the Windows fast execution profile so future parity changes require an explicit contract update.

## Next bounded action

Decide separately whether `NGROK_DOMAIN` should receive a value-free migration warning to `CODEXGPT_PUBLIC_HOSTNAME` or remain an indefinitely supported legacy input. That decision must retain the STEP-531 cross-mode value/fingerprint contract. Generic `HOST`/`PORT` and Tailscale setup behavior remain separate decisions.

STEP-528 changed no runtime input behavior. STEP-529 changes only legacy-root selection/diagnostics. STEP-530 changes only hostname source preservation/diagnostics. STEP-531 changes only `NGROK_DOMAIN` source preservation/classification; none changes effective network configuration, root authority, profiles, credentials, listeners, Tunnel, DNS, or deployment state.
