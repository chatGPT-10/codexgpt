param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{32}$')][string]$ProbeNonce
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$sourcePath = Join-Path $PSScriptRoot "windows-sandbox-spike.cs"
if (-not [System.IO.File]::Exists($sourcePath)) {
  throw "SANDBOX_SPIKE_SOURCE_MISSING"
}

Add-Type -Path $sourcePath -ReferencedAssemblies @(
  "System.dll",
  "System.Core.dll",
  "System.Security.dll",
  "Microsoft.CSharp.dll"
)

if (-not [CodexPro.Phase4.SandboxSpike]::Cleanup($ProbeNonce)) {
  throw "SANDBOX_CLEANUP_FAILED"
}
