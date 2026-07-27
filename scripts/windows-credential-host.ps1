$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$sourcePath = Join-Path $PSScriptRoot 'windows-credential-host.cs'
$protocolPath = Join-Path $PSScriptRoot 'windows-credential-host-protocol-v1.json'

if (-not [System.IO.File]::Exists($sourcePath) -or -not [System.IO.File]::Exists($protocolPath)) {
    throw 'CREDENTIAL_HOST_SOURCE_MISSING'
}

$protocol = [System.IO.File]::ReadAllText($protocolPath) | ConvertFrom-Json
if ($protocol.schemaVersion -ne 1 -or
    $protocol.protocolName -ne 'CXDPAPI' -or
    $protocol.protocolVersion -ne 1 -or
    $protocol.provider -ne 'windows-dpapi-current-user' -or
    $protocol.scope -ne 'CurrentUser' -or
    (@($protocol.operations) -join ',') -ne 'protect-v1,unprotect-v1,probe-v1' -or
    $protocol.maxPlaintextBytes -ne 65536 -or
    $protocol.maxProtectedBytes -ne 98304 -or
    $protocol.maxFrameBytes -ne 196608 -or
    $protocol.secretTransport -ne 'stdin-stdout-pipes') {
    throw 'CREDENTIAL_HOST_PROTOCOL_INVALID'
}

Add-Type -Path $sourcePath -ReferencedAssemblies @('System.Web.Extensions', 'System.Security') -ErrorAction Stop | Out-Null
[CodexGptCredentialHost.CredentialHost]::Run()
