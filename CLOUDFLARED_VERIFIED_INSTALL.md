# Verified Cloudflared Installation

CodexGPT's repository-managed Cloudflare start paths use a pinned, SHA-256-verified Cloudflared binary. This includes default/start, `stable`, explicit Cloudflare tunnel starts, and `connection-test` whenever its effective tunnel is `cloudflare` or `cloudflare-named`.

## Install

```bash
npm run cloudflared:install
```

The installer:

1. selects the exact platform asset from `scripts/cloudflared-release.mjs`;
2. downloads the pinned release URL rather than `releases/latest`;
3. rejects downloads larger than 100 MiB;
4. verifies the official SHA-256 digest before extraction or execution;
5. checks the Cloudflared version output;
6. stages the new binary and preserves the old binary as a rollback backup until replacement succeeds.

The installed path is:

```text
~/.codexgpt/bin/cloudflared
```

On Windows it is:

```text
%USERPROFILE%\.codexgpt\bin\cloudflared.exe
```

## Status

```bash
npm run cloudflared:status
```

For directly distributed binary assets, status verification checks both the pinned SHA-256 digest and the reported version.

## Upgrade

```bash
npm run cloudflared:upgrade
```

`upgrade` reinstalls the version pinned in `scripts/cloudflared-release.mjs`. Updating to a new upstream release requires a reviewed source change that updates the version and every platform checksum from Cloudflare's official release page. Do not switch the installer back to a floating `latest` URL.

## Start CodexGPT with Cloudflare

```bash
npm run connect:cloudflare
npm run connect:chatgpt
npm run connect:stable -- --hostname mcp.example.com
```

These scripts run the verified installer in `ensure` mode first, then pass both the exact managed `--cloudflared <path>` and `--no-install-cloudflared` to CodexGPT. Tunnel child processes also receive `--no-autoupdate`, so Cloudflared cannot replace the reviewed pinned binary in place. This prevents a different binary from being selected through `PATH`, prevents fallback to the legacy unverified automatic downloader, and keeps version changes bound to the reviewed release manifest.

Cloudflared may still report that a newer upstream version exists. For the managed binary, that warning is informational; update the pin and checksums through a reviewed source change instead of allowing in-place self-update.

## Phase 8 OAuth named-Tunnel setup

OAuth uses one stable issuer/resource identity, so the supported path rejects Quick Tunnels and requires a dedicated named Tunnel. The public ingress must target only `127.0.0.1:8787`; the separate owner-admin listener on `127.0.0.1:8788` must never appear in Cloudflare ingress.

```powershell
codexgpt auth setup `
  --root D:\Dev\your-repo `
  --hostname mcp.example.com `
  --tunnel-name codexgpt
```

The command first verifies the managed Cloudflared binary and local ports, initializes DPAPI-protected candidate state, then either validates an existing dedicated config/owner marker or prints the exact Cloudflare changes. It does not silently adopt a Tunnel by name. Provisioning requires explicit `--provision-tunnel` approval; `--no-tunnel-changes` performs local checks and prints the remaining owner commands without changing Cloudflare.

The generated dedicated config has one hostname ingress followed by `http_status:404`. Its companion owner marker binds the exact profile id, OAuth binding id, Tunnel id/name, and hostname. A copied config, reused shared Tunnel, changed hostname, ambiguous name, missing marker, extra ingress, remotely exposed local-admin port, or ownership mismatch fails closed.

Setup writes a resumable local journal and starts a candidate OAuth service. The workspace profile switches to OAuth only after the external HTTPS surface returns consistent protected-resource metadata, authorization-server metadata, the active ES256 public key, and authenticated-MCP health. Until that probe passes, the existing Legacy App remains the rollback path.

Rollback changes only the local profile and preserves the Tunnel route and OAuth authority records:

```powershell
codexgpt auth rollback --root D:\Dev\your-repo
codexgpt start --root D:\Dev\your-repo
```

Returning to OAuth is idempotent and revalidates the saved owner marker/config/public surface:

```powershell
codexgpt auth setup --root D:\Dev\your-repo
```

Do not place Cloudflare Access, an interactive Access login, or mTLS in front of this Core OAuth route unless a later compatibility gate explicitly validates the complete ChatGPT OAuth/DCR/MCP flow. Those controls are not part of the Phase 8 Core claim.

## Manual installation

A manually installed Cloudflared binary may still be used by passing its path explicitly. Verify the binary against Cloudflare's official release checksum before use.
