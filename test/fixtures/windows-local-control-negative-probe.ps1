param(
    [Parameter(Mandatory = $true)][ValidateSet('anonymous', 'low_integrity', 'appcontainer', 'owned_job')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$PipePath,
    [string]$OwnedJobName = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$sourcePath = [System.IO.Path]::Combine($PSScriptRoot, 'windows-local-control-negative-probe.cs')
if (-not [System.IO.File]::Exists($sourcePath)) {
    throw 'NEGATIVE_PROBE_SOURCE_MISSING'
}

Add-Type -Path $sourcePath -ReferencedAssemblies @('System.Web.Extensions', 'System.Security') -ErrorAction Stop | Out-Null
[Console]::Out.WriteLine([CodexPro.Phase4.Tests.LocalControlNegativeProbe]::Run($Mode, $PipePath, $OwnedJobName))
