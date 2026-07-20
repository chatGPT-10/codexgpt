param(
  [Parameter(Mandatory = $true)][string]$Probe,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$ExpectedAppContainerSid = "",
  [int]$ParentPid = 0,
  [string]$PathValue = "",
  [string]$NameValue = "",
  [string]$HostValue = "",
  [int]$Port = 0
)

$ErrorActionPreference = "Stop"

function Write-ProbeResult([ordered]$Values) {
  $lines = foreach ($entry in $Values.GetEnumerator()) {
    $value = [string]$entry.Value
    if ($value.Contains("`r") -or $value.Contains("`n")) {
      throw "PROBE_RESULT_MULTILINE_VALUE"
    }
    "{0}={1}" -f $entry.Key, $value
  }
  [System.IO.File]::WriteAllLines($OutputPath, $lines, [System.Text.Encoding]::UTF8)
}

function Root-Exception([Exception]$Exception) {
  $current = $Exception
  while ($null -ne $current.InnerException) {
    $current = $current.InnerException
  }
  return $current
}

function Classify-Exception([Exception]$Exception) {
  $root = Root-Exception $Exception
  $hresult = [uint32]$root.HResult
  $win32 = [int]($hresult -band 0xffff)
  if ($root -is [System.Net.Sockets.SocketException]) {
    $socketCode = [int]$root.NativeErrorCode
    if ($socketCode -eq 10013) {
      return [ordered]@{ classification = "policy_denied"; code = "WSAEACCES" }
    }
    if ($socketCode -eq 10060) {
      return [ordered]@{ classification = "timeout"; code = "WSAETIMEDOUT" }
    }
    return [ordered]@{ classification = "network_error"; code = "WSA_$socketCode" }
  }
  if ($root -is [System.UnauthorizedAccessException] -or
      $root -is [System.Security.SecurityException] -or
      $win32 -eq 5) {
    return [ordered]@{ classification = "access_denied"; code = "ERROR_ACCESS_DENIED" }
  }
  if ($root -is [System.IO.FileNotFoundException] -or
      $root -is [System.IO.DirectoryNotFoundException] -or
      $root -is [System.Threading.WaitHandleCannotBeOpenedException] -or
      $win32 -eq 2 -or $win32 -eq 3) {
    return [ordered]@{ classification = "namespace_isolated"; code = "OBJECT_NOT_VISIBLE" }
  }
  if ($root -is [System.TimeoutException]) {
    return [ordered]@{ classification = "timeout"; code = "TIMEOUT" }
  }
  return [ordered]@{ classification = "error"; code = ("HRESULT_{0:X8}" -f $hresult) }
}

function Invoke-IdentityProbe {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
public static class CodexGPTSandboxChildIdentity {
  private const uint TOKEN_QUERY = 0x0008;
  private const int TokenRestrictedSids = 11;
  private const int TokenIntegrityLevel = 25;
  private const int TokenIsAppContainer = 29;
  private const int TokenCapabilities = 30;
  private const int TokenAppContainerSid = 31;
  [StructLayout(LayoutKind.Sequential)] private struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential)] private struct TOKEN_MANDATORY_LABEL { public SID_AND_ATTRIBUTES Label; }
  [StructLayout(LayoutKind.Sequential)] private struct TOKEN_APPCONTAINER_INFORMATION { public IntPtr TokenAppContainer; }
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
  [DllImport("advapi32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetTokenInformation(IntPtr token, int informationClass, IntPtr information, int length, out int returned);
  [DllImport("advapi32.dll", SetLastError=true)] private static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
  [DllImport("advapi32.dll", SetLastError=true)] private static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
  [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseHandle(IntPtr handle);
  private static IntPtr ReadBuffer(IntPtr token, int informationClass) {
    int required; GetTokenInformation(token, informationClass, IntPtr.Zero, 0, out required);
    if (required <= 0) throw new InvalidOperationException("CHILD_TOKEN_SIZE_FAILED_" + Marshal.GetLastWin32Error());
    IntPtr buffer = Marshal.AllocHGlobal(required);
    if (!GetTokenInformation(token, informationClass, buffer, required, out required)) { Marshal.FreeHGlobal(buffer); throw new InvalidOperationException("CHILD_TOKEN_READ_FAILED_" + Marshal.GetLastWin32Error()); }
    return buffer;
  }
  private static int ReadInt(IntPtr token, int informationClass) { IntPtr buffer = Marshal.AllocHGlobal(4); try { int returned; if (!GetTokenInformation(token, informationClass, buffer, 4, out returned)) throw new InvalidOperationException("CHILD_TOKEN_INT_FAILED_" + Marshal.GetLastWin32Error()); return Marshal.ReadInt32(buffer); } finally { Marshal.FreeHGlobal(buffer); } }
  private static int ReadGroupCount(IntPtr token, int informationClass) { IntPtr buffer = ReadBuffer(token, informationClass); try { return Marshal.ReadInt32(buffer); } finally { Marshal.FreeHGlobal(buffer); } }
  private static int ReadIntegrityRid(IntPtr token) { IntPtr buffer = ReadBuffer(token, TokenIntegrityLevel); try { TOKEN_MANDATORY_LABEL label = (TOKEN_MANDATORY_LABEL)Marshal.PtrToStructure(buffer, typeof(TOKEN_MANDATORY_LABEL)); byte count = Marshal.ReadByte(GetSidSubAuthorityCount(label.Label.Sid)); return Marshal.ReadInt32(GetSidSubAuthority(label.Label.Sid, (uint)(count - 1))); } finally { Marshal.FreeHGlobal(buffer); } }
  private static string ReadAppContainerSid(IntPtr token) { IntPtr buffer = ReadBuffer(token, TokenAppContainerSid); try { TOKEN_APPCONTAINER_INFORMATION info = (TOKEN_APPCONTAINER_INFORMATION)Marshal.PtrToStructure(buffer, typeof(TOKEN_APPCONTAINER_INFORMATION)); return info.TokenAppContainer == IntPtr.Zero ? "" : new SecurityIdentifier(info.TokenAppContainer).Value; } finally { Marshal.FreeHGlobal(buffer); } }
  public static string[] Read() {
    IntPtr token;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, out token)) throw new InvalidOperationException("CHILD_TOKEN_OPEN_FAILED_" + Marshal.GetLastWin32Error());
    try {
      bool inJob; if (!IsProcessInJob(GetCurrentProcess(), IntPtr.Zero, out inJob)) throw new InvalidOperationException("CHILD_JOB_QUERY_FAILED_" + Marshal.GetLastWin32Error());
      return new[] { (ReadInt(token, TokenIsAppContainer) != 0).ToString(), ReadAppContainerSid(token), ReadIntegrityRid(token).ToString(), ReadGroupCount(token, TokenCapabilities).ToString(), ReadGroupCount(token, TokenRestrictedSids).ToString(), inJob.ToString() };
    } finally { CloseHandle(token); }
  }
}
"@
  $identity = [CodexGPTSandboxChildIdentity]::Read()
  Write-ProbeResult ([ordered]@{
    status = "identity"
    classification = "identity"
    code = "OK"
    childIsAppContainer = $identity[0].ToLowerInvariant()
    childAppContainerSidMatches = ([string]::Equals($identity[1], $ExpectedAppContainerSid, [StringComparison]::Ordinal)).ToString().ToLowerInvariant()
    childIntegrityRid = $identity[2]
    childCapabilityCount = $identity[3]
    childRestrictedSidCount = $identity[4]
    childJobMember = $identity[5].ToLowerInvariant()
  })
}

function Invoke-Action {
  switch ($Probe) {
    "live-workspace" { [void][System.IO.File]::ReadAllText($PathValue) }
    "user-profile" { [void][System.IO.File]::ReadAllText($PathValue) }
    "codex-state" { [void][System.IO.File]::ReadAllText($PathValue) }
    "browser-state" { [void][System.IO.File]::ReadAllText($PathValue) }
    "credential-state" { [void][System.IO.File]::ReadAllText($PathValue) }
    "protected-registry" { [void](Get-ItemProperty -LiteralPath $PathValue -ErrorAction Stop) }
    "unrelated-process" { [void](Get-Process -Id $ParentPid -ErrorAction Stop).MainModule.FileName }
    "unrelated-token" {
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CodexGPTSandboxTokenProbe {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("advapi32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool CloseHandle(IntPtr handle);
}
"@
      $process = [CodexGPTSandboxTokenProbe]::OpenProcess(0x1000, $false, $ParentPid)
      if ($process -eq [IntPtr]::Zero) { throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
      try {
        $token = [IntPtr]::Zero
        if (-not [CodexGPTSandboxTokenProbe]::OpenProcessToken($process, 0x0008, [ref]$token)) {
          throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
        }
        [void][CodexGPTSandboxTokenProbe]::CloseHandle($token)
      } finally {
        [void][CodexGPTSandboxTokenProbe]::CloseHandle($process)
      }
    }
    "unrelated-section" {
      $section = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting($NameValue)
      $section.Dispose()
    }
    "control-ipc" { Invoke-NamedPipe $NameValue }
    "approval-ipc" { Invoke-NamedPipe $NameValue }
    "audit-ipc" { Invoke-NamedPipe $NameValue }
    "global-mutex" { $mutex = [Threading.Mutex]::OpenExisting($NameValue); $mutex.Dispose() }
    "global-section" { $section = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting($NameValue); $section.Dispose() }
    "mailslot" { $stream = [System.IO.File]::Open($PathValue, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite); $stream.Dispose() }
    "raw-device" { $stream = [System.IO.File]::Open("\\.\PhysicalDrive0", [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite); $stream.Dispose() }
    "raw-volume" { $stream = [System.IO.File]::Open($PathValue, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite); $stream.Dispose() }
    "wmi-broker" { [void](Get-WmiObject Win32_OperatingSystem -ErrorAction Stop) }
    "service-broker" { [void](Get-Service -Name EventLog -ErrorAction Stop) }
    "scheduler-broker" { $scheduler = New-Object -ComObject Schedule.Service; $scheduler.Connect() }
    "com-broker" { $shell = New-Object -ComObject WScript.Shell; [void]$shell.ExpandEnvironmentStrings("%WINDIR%") }
    "tcp" { Invoke-Tcp $HostValue $Port }
    "udp" { Invoke-Udp $HostValue $Port }
    "dns" { [void][System.Net.Dns]::GetHostAddresses($HostValue) }
    "doh" { Invoke-Http $HostValue $null }
    "proxy" { Invoke-Http $HostValue $NameValue }
    "crash-tree" {
      $child = Start-Process -FilePath (Join-Path $env:SystemRoot "System32\cmd.exe") -ArgumentList "/d", "/s", "/c", "ping 127.0.0.1 -n 30 >nul" -WindowStyle Hidden -PassThru
      [System.IO.File]::WriteAllText(($OutputPath + ".childpid"), [string]$child.Id, [System.Text.Encoding]::ASCII)
      [Environment]::FailFast("CODEXGPT_SANDBOX_CRASH_PROBE")
    }
    default { throw "UNKNOWN_SANDBOX_PROBE_$Probe" }
  }
}

function Invoke-NamedPipe([string]$Name) {
  $pipe = [System.IO.Pipes.NamedPipeClientStream]::new(".", $Name, [System.IO.Pipes.PipeDirection]::InOut)
  try { $pipe.Connect(1000) } finally { $pipe.Dispose() }
}

function Invoke-Tcp([string]$HostName, [int]$TargetPort) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect($HostName, $TargetPort, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(2000)) { throw [TimeoutException]::new("TCP_TIMEOUT") }
    $client.EndConnect($async)
  } finally { $client.Dispose() }
}

function Invoke-Udp([string]$HostName, [int]$TargetPort) {
  $client = [System.Net.Sockets.UdpClient]::new()
  try {
    $client.Connect($HostName, $TargetPort)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("sandbox-probe")
    [void]$client.Send($bytes, $bytes.Length)
  } finally { $client.Dispose() }
}

function Invoke-Http([string]$Url, [string]$ProxyUrl) {
  $request = [System.Net.HttpWebRequest]::Create($Url)
  $request.Timeout = 2500
  $request.ReadWriteTimeout = 2500
  if ($ProxyUrl.Length -gt 0) {
    $request.Proxy = [System.Net.WebProxy]::new($ProxyUrl, $true)
  }
  $response = $request.GetResponse()
  $response.Dispose()
}

if ($Probe -eq "identity") {
  Invoke-IdentityProbe
  exit 0
}

try {
  Invoke-Action
  Write-ProbeResult ([ordered]@{ status = "allowed"; classification = "allowed"; code = "OK" })
} catch {
  $classification = Classify-Exception $_.Exception
  Write-ProbeResult ([ordered]@{ status = "denied"; classification = $classification.classification; code = $classification.code })
}
