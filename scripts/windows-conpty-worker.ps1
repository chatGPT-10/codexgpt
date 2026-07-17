param(
    [switch]$SimulateCloseHang,
    [switch]$Persistent,
    [string]$NodeExecutable,
    [string]$ProbeScript
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$sourcePath = [System.IO.Path]::Combine($scriptRoot, 'windows-process-host.cs')
if (-not [System.IO.File]::Exists($sourcePath)) {
    [Console]::Error.WriteLine('CONPTY_WORKER_SOURCE_MISSING')
    exit 2
}

Add-Type -Path $sourcePath -ReferencedAssemblies @('System.Web.Extensions') -ErrorAction Stop | Out-Null
if ($Persistent.IsPresent) {
    [CodexPro.Phase4.ProcessHost]::RunConPtyPersistentWorker()
    exit [Environment]::ExitCode
}
[CodexPro.Phase4.ProcessHost]::RunConPtyWorker($SimulateCloseHang.IsPresent, $NodeExecutable, $ProbeScript)
exit [Environment]::ExitCode
