# CodexGPT: Windows + Cloudflare Tunnel + Custom Domain

This guide describes the preferred self-hosted deployment for CodexGPT:

```text
ChatGPT
  -> HTTPS
mcp.example.com
  -> Cloudflare DNS / TLS / Tunnel
127.0.0.1:8787
  -> CodexGPT
  -> one local repository
```

The design does not require WSL or a third-party Remote MCP relay. Cloudflare provides DNS, TLS, and inbound tunnel transport only. Authorization and workspace policy remain enforced by CodexGPT on the Windows machine.

## Security properties

The recommended deployment has these properties:

- CodexGPT listens on `127.0.0.1`, not a LAN or public interface.
- `cloudflared` creates an outbound connection to Cloudflare.
- TCP port 8787 is not opened on the router or exposed directly through Windows Firewall.
- ChatGPT uses a stable HTTPS hostname such as `mcp.example.com`.
- The `/mcp` endpoint requires a CodexGPT token.
- The Cloudflare Tunnel credential and CodexGPT MCP token are separate secrets.
- The ingress configuration has a final deny rule.
- Logs and screenshots must not contain the complete tokenized Server URL.

Cloudflare Tunnel does not replace CodexGPT authorization, permission profiles, local approvals, or operating-system isolation. Safe Bash is a command filter, not a sandbox.

## Requirements

- A domain managed by Cloudflare DNS
- Windows 10 or Windows 11
- Node.js 20+
- CodexGPT installed globally
- `cloudflared` installed by CodexGPT or available on `PATH`

```powershell
npm install -g codexgpt
codexgpt install-cloudflared
codexgpt doctor
```

CodexGPT installs the verified `cloudflared.exe` under `%USERPROFILE%\.codexgpt\bin` for the supported default path.

## Option A: locally managed named tunnel

This path stores a tunnel credentials JSON file on the local machine.

### 1. Authenticate Cloudflare

```powershell
cloudflared tunnel login
```

A browser opens. Select the Cloudflare zone that contains your domain.

### 2. Create the tunnel

```powershell
cloudflared tunnel create codexgpt
```

Record the tunnel UUID printed by `cloudflared`.

### 3. Route DNS

```powershell
cloudflared tunnel route dns codexgpt mcp.example.com
```

Use a dedicated subdomain. Do not use the apex domain for the MCP endpoint.

### 4. Create the Cloudflare configuration

Create `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: YOUR-TUNNEL-UUID
credentials-file: C:\Users\YOUR-NAME\.cloudflared\YOUR-TUNNEL-UUID.json

ingress:
  - hostname: mcp.example.com
    service: http://127.0.0.1:8787
    originRequest:
      httpHostHeader: mcp.example.com
      connectTimeout: 10s
      noHappyEyeballs: false
  - service: http_status:404
```

The final `http_status:404` rule is mandatory. It prevents unmatched hostnames from being forwarded to the local service.

Validate the configuration:

```powershell
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://mcp.example.com/mcp
```

### 5. Start CodexGPT

Generate a long random CodexGPT token. One PowerShell option is:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$token = [Convert]::ToHexString($bytes).ToLowerInvariant()
```

Start the stable endpoint:

```powershell
codexgpt stable `
  --root D:\Dev\your-repo `
  --hostname mcp.example.com `
  --tunnel-name codexgpt `
  --cloudflare-config "$env:USERPROFILE\.cloudflared\config.yml" `
  --token $token `
  --bash safe
```

CodexGPT binds the origin to loopback by default. Do not pass `--host 0.0.0.0` for this deployment.

### 6. Add the connection to ChatGPT

CodexGPT attempts to copy a complete URL similar to the following, but keeps the credential-bearing URL out of startup logs by default:

```text
https://mcp.example.com/mcp?codexgpt_token=...
```

If clipboard integration is unavailable, press `u` in the CodexGPT terminal to display the secret URL explicitly.

In ChatGPT Developer Mode, create the Plugin/App connection with:

```text
Name: CodexGPT
Connection: Server URL
Server URL: paste the complete copied URL
Authentication: No Authentication / None
```

The current personal compatibility flow authenticates through the query credential in the complete Server URL. Do not remove the query string, share it, publish it, commit it, or place it in issue reports. Treat browser history, clipboard contents, screenshots, logs, and copied links as possible exposure paths.

## Option B: dashboard-managed tunnel token

Cloudflare can also provide a connector token from the dashboard. Store that token in a local file rather than a command line or saved CodexGPT profile.

Create the secret file:

```powershell
$dir = Join-Path $env:USERPROFILE ".codexgpt"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
notepad (Join-Path $dir "cloudflare-tunnel-token")
```

Put only the Cloudflare connector token in the file. Then start:

```powershell
codexgpt stable `
  --root D:\Dev\your-repo `
  --hostname mcp.example.com `
  --cloudflare-token-file "$env:USERPROFILE\.codexgpt\cloudflare-tunnel-token" `
  --token <long-random-codexgpt-token> `
  --bash safe
```

Do not confuse the credentials:

```text
Cloudflare Tunnel credential  authorizes cloudflared to connect the machine to Cloudflare.
CodexGPT MCP token            authorizes requests reaching the local /mcp endpoint.
```

## Host-header and DNS-rebinding controls

Use all of these controls together:

1. Keep CodexGPT bound to `127.0.0.1`.
2. Configure one exact Cloudflare ingress hostname.
3. Add the final `http_status:404` ingress rule.
4. Set `originRequest.httpHostHeader` to the expected public hostname.
5. Do not create wildcard DNS records pointing at the tunnel.
6. Do not allow arbitrary user-supplied hostnames in wrapper scripts or saved profiles.
7. Keep the CodexGPT token mandatory even when Cloudflare Access is also used.

Cloudflare Access may be useful as an additional layer, but it must be tested against the ChatGPT connector flow before being made mandatory. It does not replace the CodexGPT token or local authorization.

## Token rotation

### Rotate the CodexGPT token

1. Stop CodexGPT.
2. Generate a new random token.
3. Restart CodexGPT with the new `--token` value.
4. Replace the complete Server URL in ChatGPT.
5. Remove the old URL from notes, browser history where practical, screenshots, clipboard managers, and shell history.

A stable hostname does not make the old token valid after rotation.

### Rotate the Cloudflare Tunnel credential

Rotate or recreate the tunnel credential through Cloudflare, update the local credentials JSON or token file, and restart `cloudflared`/CodexGPT. This does not rotate the CodexGPT MCP token.

## Logging rules

- Do not use the complete tokenized URL in documentation, screenshots, issues, PR descriptions, or shell transcripts.
- Prefer `codexgpt doctor` and redacted status output for diagnostics.
- Enable `--log-requests` only for bounded troubleshooting; supported output is redacted, but logs should still be treated as sensitive.
- Never enable shell tracing around commands containing tokens.
- Prefer token files for persistent Cloudflare connector credentials.
- Do not store raw tunnel tokens in workspace profiles or Git repositories.

## Windows Firewall and router

No inbound firewall or router rule is required. Confirm that port 8787 is loopback-only:

```powershell
Get-NetTCPConnection -LocalPort 8787 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

The expected local address is `127.0.0.1` or `::1`. A listener on `0.0.0.0`, a LAN address, or `[::]` is outside the recommended deployment.

## Verification

Run local diagnostics:

```powershell
codexgpt doctor
```

Check the tunnel:

```powershell
cloudflared tunnel info codexgpt
cloudflared tunnel ingress validate
```

Test the public health endpoint without printing the MCP token:

```powershell
Invoke-WebRequest https://mcp.example.com/healthz
```

Then use `codexgpt connection-test --root D:\Dev\your-repo` when ChatGPT cannot create or call the connection. Connection-test disables writes, Bash, and tool cards while preserving request-arrival diagnostics.

## Operational checklist

Before daily use:

- The intended repository path is correct.
- CodexGPT is bound to loopback.
- The named tunnel uses the exact hostname.
- The final ingress deny rule is present.
- The complete ChatGPT Server URL contains the current CodexGPT token.
- Bash mode matches the repository trust level.
- `--no-bash` is used for untrusted repositories.
- Advanced V3/V4 contracts are enabled only with their required policy, audit, permission-profile, and local-approval controls.

## Other URL modes

CodexGPT also supports:

```text
codexgpt start --tunnel cloudflare                 disposable quick tunnel
codexgpt ngrok --hostname name.ngrok-free.dev      stable ngrok hostname
codexgpt tailscale --hostname device.tailnet.ts.net
codexgpt start --tunnel none                       local-only HTTP
```

For the stated self-hosted Windows requirement, the named Cloudflare Tunnel with a custom subdomain is the preferred path.
