param(
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
[System.IO.File]::WriteAllText($OutputPath, "powershell-ok", [System.Text.UTF8Encoding]::new($false))
exit 0
