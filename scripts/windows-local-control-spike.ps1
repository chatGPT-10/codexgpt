Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$sourcePath = [System.IO.Path]::Combine($scriptRoot, 'windows-local-control-spike.cs')
if (-not [System.IO.File]::Exists($sourcePath)) {
    [Console]::Error.WriteLine('LOCAL_CONTROL_SOURCE_MISSING')
    exit 2
}

$compileTempRoot = [System.IO.Path]::GetFullPath($env:TEMP)
$compileTempBefore = @{}
foreach ($entry in [System.IO.Directory]::EnumerateDirectories($compileTempRoot)) {
    $compileTempBefore[[System.IO.Path]::GetFullPath($entry)] = $true
}

Add-Type -Path $sourcePath -ReferencedAssemblies @('System.Web.Extensions', 'System.Security') -ErrorAction Stop | Out-Null

# Windows PowerShell's Add-Type may leave a per-compilation directory whose DACL
# explicitly denies the owner DELETE.  The local-control launcher deliberately
# points TEMP at its private state root, so leaving that directory behind would
# make the Gate-A0 cleanup claim false.  Repair and remove only directories that
# appeared during this exact fixed-source compilation.
foreach ($entry in [System.IO.Directory]::EnumerateDirectories($compileTempRoot)) {
    $fullEntry = [System.IO.Path]::GetFullPath($entry)
    if ($compileTempBefore.ContainsKey($fullEntry)) {
        continue
    }
    $security = New-Object System.Security.AccessControl.DirectorySecurity
    $security.SetSecurityDescriptorSddlForm('O:LAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;LA)')
    [System.IO.Directory]::SetAccessControl($fullEntry, $security)
    [System.IO.Directory]::Delete($fullEntry, $true)
}

[CodexPro.Phase4.LocalControlSpike]::Run()
