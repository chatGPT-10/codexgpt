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

## Manual installation

A manually installed Cloudflared binary may still be used by passing its path explicitly. Verify the binary against Cloudflare's official release checksum before use.
