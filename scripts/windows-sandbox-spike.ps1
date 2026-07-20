param(
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$FixtureDigest,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{32}$')][string]$ProbeNonce,
  [Parameter(Mandatory = $true)][int]$Ipv4Port,
  [Parameter(Mandatory = $true)][int]$Ipv6Port,
  [Parameter(Mandatory = $true)][int]$Udp4Port,
  [Parameter(Mandatory = $true)][int]$Udp6Port,
  [Parameter(Mandatory = $true)][int]$ParentPid,
  [Parameter(Mandatory = $true)][string]$UserProfilePath,
  [Parameter(Mandatory = $true)][string]$CodexStatePath,
  [Parameter(Mandatory = $true)][string]$BrowserStatePath,
  [Parameter(Mandatory = $true)][string]$CredentialStatePath,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [AllowEmptyString()][string]$GitBashPath = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$sourcePath = Join-Path $PSScriptRoot "windows-sandbox-spike.cs"
$attackSourcePath = Join-Path $PSScriptRoot "windows-sandbox-attack-probe.cs"
if (-not [System.IO.File]::Exists($sourcePath)) {
  throw "SANDBOX_SPIKE_SOURCE_MISSING"
}
if (-not [System.IO.File]::Exists($attackSourcePath)) {
  throw "SANDBOX_ATTACK_SOURCE_MISSING"
}

Add-Type -Path $sourcePath -ReferencedAssemblies @(
  "System.dll",
  "System.Core.dll",
  "System.Security.dll",
  "Microsoft.CSharp.dll"
)

$result = [CodexGPT.Phase4.SandboxSpike]::Run(
  $RepositoryRoot,
  $FixtureDigest,
  $ProbeNonce,
  $Ipv4Port,
  $Ipv6Port,
  $Udp4Port,
  $Udp6Port,
  $ParentPid,
  $UserProfilePath,
  $CodexStatePath,
  $BrowserStatePath,
  $CredentialStatePath,
  $NodePath,
  $GitBashPath
)
$result | ConvertTo-Json -Depth 16 -Compress
