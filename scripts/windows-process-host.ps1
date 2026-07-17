Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$sourcePath = [System.IO.Path]::Combine($scriptRoot, 'windows-process-host.cs')
$protocolPath = [System.IO.Path]::Combine($scriptRoot, 'windows-process-host-protocol-v1.json')
$manifestPath = [System.IO.Path]::Combine($scriptRoot, 'windows-process-host-manifest.json')

if (-not [System.IO.File]::Exists($sourcePath)) {
    [Console]::Error.WriteLine('HOST_SOURCE_MISSING')
    exit 2
}
if (-not [System.IO.File]::Exists($protocolPath)) {
    [Console]::Error.WriteLine('HOST_PROTOCOL_MISSING')
    exit 2
}
if (-not [System.IO.File]::Exists($manifestPath)) {
    [Console]::Error.WriteLine('HOST_MANIFEST_MISSING')
    exit 2
}

$protocol = [System.IO.File]::ReadAllText($protocolPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
if ($protocol.name -ne 'CXP4' -or $protocol.version -ne 1 -or $protocol.headerLength -ne 64 -or $protocol.maxFramePayloadBytes -ne 65536) {
    [Console]::Error.WriteLine('HOST_PROTOCOL_CONSTANT_MISMATCH')
    exit 2
}
$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$sourceDigest = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
$protocolDigest = (Get-FileHash -LiteralPath $protocolPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($manifest.protocolName -ne 'CXP4' -or $manifest.protocolVersion -ne 1 -or $manifest.headerLength -ne 64 -or
    $manifest.productionCSharpSha256 -ne $sourceDigest -or $manifest.protocolSha256 -ne $protocolDigest) {
    [Console]::Error.WriteLine('HOST_MANIFEST_IDENTITY_MISMATCH')
    exit 2
}

try {
    Add-Type -Path $sourcePath -ReferencedAssemblies @('System.Web.Extensions') -ErrorAction Stop | Out-Null
} catch {
    [Console]::Error.WriteLine('HOST_COMPILE_FAILED')
    exit 2
}
[CodexPro.Phase4.ProcessHost]::Run()
