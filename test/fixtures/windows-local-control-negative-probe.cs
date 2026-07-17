using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

namespace CodexPro.Phase4.Tests
{
    public static class LocalControlNegativeProbe
    {
        private const uint GENERIC_READ = 0x80000000;
        private const uint GENERIC_WRITE = 0x40000000;
        private const uint OPEN_EXISTING = 3;
        private const uint JOB_OBJECT_ASSIGN_PROCESS = 0x0001;
        private const uint JOB_OBJECT_QUERY = 0x0004;
        private const uint CREATE_NO_WINDOW = 0x08000000;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const uint CREATE_SUSPENDED = 0x00000004;
        private const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
        private const uint WAIT_OBJECT_0 = 0;
        private const uint WAIT_TIMEOUT = 258;
        private static readonly IntPtr PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES = new IntPtr(0x00020009);
        private const uint TOKEN_ASSIGN_PRIMARY = 0x0001;
        private const uint TOKEN_DUPLICATE = 0x0002;
        private const uint TOKEN_IMPERSONATE = 0x0004;
        private const uint TOKEN_QUERY = 0x0008;
        private const uint TOKEN_ADJUST_DEFAULT = 0x0080;
        private const uint SE_GROUP_INTEGRITY = 0x00000020;
        private const int SecurityImpersonation = 2;
        private const int TokenImpersonation = 2;
        private const int TokenIntegrityLevel = 25;

        [StructLayout(LayoutKind.Sequential)]
        private struct SID_AND_ATTRIBUTES
        {
            public IntPtr Sid;
            public uint Attributes;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct TOKEN_MANDATORY_LABEL
        {
            public SID_AND_ATTRIBUTES Label;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct SECURITY_CAPABILITIES
        {
            public IntPtr AppContainerSid;
            public IntPtr Capabilities;
            public int CapabilityCount;
            public int Reserved;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFOEX
        {
            public STARTUPINFO StartupInfo;
            public IntPtr lpAttributeList;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int processId;
            public int threadId;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFileW(
            string fileName,
            uint desiredAccess,
            uint shareMode,
            IntPtr securityAttributes,
            uint creationDisposition,
            uint flagsAndAttributes,
            IntPtr templateFile);

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentThread();

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ImpersonateAnonymousToken(IntPtr threadHandle);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool RevertToSelf();

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out SafeFileHandle tokenHandle);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DuplicateTokenEx(
            SafeFileHandle existingToken,
            uint desiredAccess,
            IntPtr tokenAttributes,
            int impersonationLevel,
            int tokenType,
            out SafeFileHandle newToken);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetTokenInformation(
            SafeFileHandle tokenHandle,
            int tokenInformationClass,
            IntPtr tokenInformation,
            int tokenInformationLength);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetThreadToken(IntPtr thread, SafeFileHandle token);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ConvertStringSidToSidW(string stringSid, out IntPtr sid);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern int GetLengthSid(IntPtr sid);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetTokenInformation(
            SafeFileHandle tokenHandle,
            int tokenInformationClass,
            IntPtr tokenInformation,
            int tokenInformationLength,
            out int returnLength);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern IntPtr GetSidSubAuthority(IntPtr sid, uint subAuthority);

        [DllImport("kernel32.dll")]
        private static extern IntPtr LocalFree(IntPtr memory);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle OpenJobObjectW(uint desiredAccess, bool inheritHandle, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool AssignProcessToJobObject(SafeFileHandle job, IntPtr process);

        [DllImport("advapi32.dll")]
        private static extern IntPtr FreeSid(IntPtr sid);

        [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
        private static extern int CreateAppContainerProfile(
            string appContainerName,
            string displayName,
            string description,
            IntPtr capabilities,
            int capabilityCount,
            out IntPtr appContainerSid);

        [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
        private static extern int DeleteAppContainerProfile(string appContainerName);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool InitializeProcThreadAttributeList(
            IntPtr attributeList,
            int attributeCount,
            int flags,
            ref IntPtr size);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UpdateProcThreadAttribute(
            IntPtr attributeList,
            uint flags,
            IntPtr attribute,
            IntPtr value,
            IntPtr size,
            IntPtr previousValue,
            IntPtr returnSize);

        [DllImport("kernel32.dll")]
        private static extern void DeleteProcThreadAttributeList(IntPtr attributeList);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CreateProcessW(
            string applicationName,
            StringBuilder commandLine,
            IntPtr processAttributes,
            IntPtr threadAttributes,
            bool inheritHandles,
            uint creationFlags,
            IntPtr environment,
            string currentDirectory,
            ref STARTUPINFOEX startupInfo,
            out PROCESS_INFORMATION processInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint ResumeThread(IntPtr threadHandle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool TerminateProcess(IntPtr process, uint exitCode);

        [DllImport("kernel32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr handle);

        public static string Run(string mode, string pipePath, string ownedJobName)
        {
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["schemaVersion"] = 1;
            result["mode"] = mode;
            result["pipePath"] = pipePath;
            result["ownedJobName"] = ownedJobName;
            try
            {
                if (mode == "anonymous") RunAnonymous(pipePath, result);
                else if (mode == "low_integrity") RunLowIntegrity(pipePath, result);
                else if (mode == "appcontainer") RunAppContainer(pipePath, result);
                else if (mode == "owned_job") RunOwnedJob(pipePath, ownedJobName, result);
                else throw new InvalidOperationException("UNKNOWN_PROBE_MODE");
                result["probeCompleted"] = true;
            }
            catch (Exception error)
            {
                result["probeCompleted"] = false;
                result["probeError"] = error.Message;
            }
            return new JavaScriptSerializer().Serialize(result);
        }

        private static void RunAnonymous(string pipePath, Dictionary<string, object> result)
        {
            if (!ImpersonateAnonymousToken(GetCurrentThread())) ThrowWin32("IMPERSONATE_ANONYMOUS_FAILED");
            try
            {
                using (SafeFileHandle handle = TryOpen(pipePath, result))
                {
                    result["opened"] = handle != null && !handle.IsInvalid;
                }
            }
            finally
            {
                RevertToSelf();
            }
        }

        private static void RunLowIntegrity(string pipePath, Dictionary<string, object> result)
        {
            SafeFileHandle processToken;
            if (!OpenProcessToken(GetCurrentProcess(), TOKEN_DUPLICATE | TOKEN_QUERY, out processToken)) ThrowWin32("OPEN_PROCESS_TOKEN_FAILED");
            using (processToken)
            {
                SafeFileHandle lowToken;
                uint access = TOKEN_QUERY | TOKEN_IMPERSONATE | TOKEN_ADJUST_DEFAULT | TOKEN_ASSIGN_PRIMARY;
                if (!DuplicateTokenEx(processToken, access, IntPtr.Zero, SecurityImpersonation, TokenImpersonation, out lowToken)) ThrowWin32("DUPLICATE_TOKEN_FAILED");
                using (lowToken)
                {
                    SetLowIntegrity(lowToken);
                    result["integrityRid"] = ReadIntegrityRid(lowToken);
                    if (!SetThreadToken(IntPtr.Zero, lowToken)) ThrowWin32("SET_THREAD_TOKEN_FAILED");
                    try
                    {
                        using (SafeFileHandle handle = TryOpen(pipePath, result))
                        {
                            result["opened"] = handle != null && !handle.IsInvalid;
                        }
                    }
                    finally
                    {
                        RevertToSelf();
                    }
                }
            }
        }

        private static void RunOwnedJob(string pipePath, string ownedJobName, Dictionary<string, object> result)
        {
            if (String.IsNullOrWhiteSpace(ownedJobName)) throw new InvalidOperationException("OWNED_JOB_NAME_MISSING");
            const string pipePrefix = "\\\\.\\pipe\\";
            if (!pipePath.StartsWith(pipePrefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("OWNED_JOB_PIPE_PATH_INVALID");
            string pipeName = pipePath.Substring(pipePrefix.Length).Replace("'", "''");
            PROCESS_INFORMATION processInformation = new PROCESS_INFORMATION();
            IntPtr environmentBlock = IntPtr.Zero;
            using (SafeFileHandle job = OpenJobObjectW(JOB_OBJECT_ASSIGN_PROCESS | JOB_OBJECT_QUERY, false, ownedJobName))
            {
                if (job == null || job.IsInvalid) ThrowWin32("OPEN_OWNED_JOB_FAILED");
                try
                {
                    string systemRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? "C:\\Windows";
                    string powershell = Path.Combine(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
                    environmentBlock = BuildEnvironmentBlock(systemRoot);
                    string script = "$c=90;try{$p=New-Object -TypeName System.IO.Pipes.NamedPipeClientStream -ArgumentList '.', '" + pipeName + "', ([System.IO.Pipes.PipeDirection]::InOut);$p.Connect(5000);$h=[BitConverter]::GetBytes([int]2);$p.Write($h,0,4);$p.Flush();$b=New-Object byte[] 4;$o=0;while($o -lt 4){$n=$p.Read($b,$o,4-$o);if($n -le 0){exit 91};$o+=$n};$l=[BitConverter]::ToInt32($b,0);if($l -le 0 -or $l -gt 65536){exit 92};$d=New-Object byte[] $l;$o=0;while($o -lt $l){$n=$p.Read($d,$o,$l-$o);if($n -le 0){exit 91};$o+=$n};$j=([Text.Encoding]::UTF8.GetString($d)|ConvertFrom-Json);if($j.ok -eq $false -and $j.code -eq 'CONTROL_OWNED_JOB_CLIENT'){$c=42}else{$c=93}}catch{$c=89};exit $c";
                    string encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
                    StringBuilder commandLine = new StringBuilder("\"" + powershell + "\" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + encoded);
                    STARTUPINFOEX startupInfo = new STARTUPINFOEX();
                    startupInfo.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                    if (!CreateProcessW(
                        powershell,
                        commandLine,
                        IntPtr.Zero,
                        IntPtr.Zero,
                        false,
                        CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT,
                        environmentBlock,
                        Path.GetDirectoryName(powershell),
                        ref startupInfo,
                        out processInformation)) ThrowWin32("CREATE_OWNED_JOB_CLIENT_FAILED");
                    result["processCreated"] = true;
                    result["processId"] = processInformation.processId;
                    if (!AssignProcessToJobObject(job, processInformation.hProcess)) ThrowWin32("ASSIGN_OWNED_JOB_FAILED");
                    result["assignedToOwnedJob"] = true;
                    uint resume = ResumeThread(processInformation.hThread);
                    if (resume == UInt32.MaxValue) ThrowWin32("RESUME_OWNED_JOB_CLIENT_FAILED");
                    uint wait = WaitForSingleObject(processInformation.hProcess, 15000);
                    if (wait == WAIT_TIMEOUT)
                    {
                        TerminateProcess(processInformation.hProcess, 88);
                        WaitForSingleObject(processInformation.hProcess, 5000);
                        throw new InvalidOperationException("OWNED_JOB_CLIENT_TIMEOUT");
                    }
                    if (wait != WAIT_OBJECT_0) ThrowWin32("OWNED_JOB_CLIENT_WAIT_FAILED");
                    uint exitCode;
                    if (!GetExitCodeProcess(processInformation.hProcess, out exitCode)) ThrowWin32("OWNED_JOB_CLIENT_EXIT_CODE_FAILED");
                    result["childExitCode"] = exitCode;
                    result["opened"] = exitCode == 42;
                    result["serverCode"] = exitCode == 42 ? "CONTROL_OWNED_JOB_CLIENT" : null;
                }
                finally
                {
                    if (processInformation.hThread != IntPtr.Zero) CloseHandle(processInformation.hThread);
                    if (processInformation.hProcess != IntPtr.Zero) CloseHandle(processInformation.hProcess);
                    if (environmentBlock != IntPtr.Zero) Marshal.FreeHGlobal(environmentBlock);
                }
            }
        }

        private static byte[] ReadManagedExact(Stream stream, int length)
        {
            byte[] result = new byte[length];
            int offset = 0;
            while (offset < length)
            {
                int read = stream.Read(result, offset, length - offset);
                if (read <= 0) throw new EndOfStreamException("OWNED_JOB_RESPONSE_TRUNCATED");
                offset += read;
            }
            return result;
        }

        private static void RunAppContainer(string pipePath, Dictionary<string, object> result)
        {
            const string pipePrefix = "\\\\.\\pipe\\";
            if (!pipePath.StartsWith(pipePrefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("APPCONTAINER_PIPE_PATH_INVALID");
            string pipeName = pipePath.Substring(pipePrefix.Length).Replace("'", "''");
            string profileName = "CodexPro.Phase4." + Guid.NewGuid().ToString("N");
            IntPtr appContainerSid = IntPtr.Zero;
            IntPtr attributeList = IntPtr.Zero;
            IntPtr capabilitiesBuffer = IntPtr.Zero;
            IntPtr environmentBlock = IntPtr.Zero;
            bool attributeListInitialized = false;
            bool profileCreated = false;
            PROCESS_INFORMATION processInformation = new PROCESS_INFORMATION();
            try
            {
                int createProfileResult = CreateAppContainerProfile(profileName, profileName, "CodexPro Phase 4 Gate A0 probe", IntPtr.Zero, 0, out appContainerSid);
                result["createProfileHresult"] = createProfileResult;
                if (createProfileResult < 0) throw new InvalidOperationException("CREATE_APPCONTAINER_PROFILE_FAILED_HRESULT_" + createProfileResult.ToString("X8"));
                profileCreated = true;
                result["appContainerSid"] = new SecurityIdentifier(appContainerSid).Value;

                SECURITY_CAPABILITIES capabilities = new SECURITY_CAPABILITIES();
                capabilities.AppContainerSid = appContainerSid;
                capabilities.Capabilities = IntPtr.Zero;
                capabilities.CapabilityCount = 0;
                capabilities.Reserved = 0;
                int capabilitiesSize = Marshal.SizeOf(typeof(SECURITY_CAPABILITIES));
                capabilitiesBuffer = Marshal.AllocHGlobal(capabilitiesSize);
                Marshal.StructureToPtr(capabilities, capabilitiesBuffer, false);

                IntPtr attributeListSize = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeListSize);
                if (attributeListSize == IntPtr.Zero) ThrowWin32("APPCONTAINER_ATTRIBUTE_SIZE_FAILED");
                attributeList = Marshal.AllocHGlobal(attributeListSize);
                if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeListSize)) ThrowWin32("APPCONTAINER_ATTRIBUTE_INIT_FAILED");
                attributeListInitialized = true;
                if (!UpdateProcThreadAttribute(
                    attributeList,
                    0,
                    PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
                    capabilitiesBuffer,
                    new IntPtr(capabilitiesSize),
                    IntPtr.Zero,
                    IntPtr.Zero)) ThrowWin32("APPCONTAINER_ATTRIBUTE_UPDATE_FAILED");

                string systemRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? "C:\\Windows";
                string powershell = Path.Combine(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
                environmentBlock = BuildEnvironmentBlock(systemRoot);
                string script = "$c=90;try{$p=New-Object -TypeName System.IO.Pipes.NamedPipeClientStream -ArgumentList '.', '" + pipeName + "', ([System.IO.Pipes.PipeDirection]::InOut);$p.Connect(3000);$c=42}catch [System.UnauthorizedAccessException]{$c=5}catch{$c=89};Start-Sleep -Milliseconds 1000;exit $c";
                string encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
                StringBuilder commandLine = new StringBuilder("\"" + powershell + "\" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + encoded);
                STARTUPINFOEX startupInfo = new STARTUPINFOEX();
                startupInfo.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                startupInfo.lpAttributeList = attributeList;
                if (!CreateProcessW(
                    powershell,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
                    environmentBlock,
                    Path.GetDirectoryName(powershell),
                    ref startupInfo,
                    out processInformation)) ThrowWin32("CREATE_APPCONTAINER_PROCESS_FAILED");
                result["processCreated"] = true;
                result["processId"] = processInformation.processId;

                SafeFileHandle childToken;
                if (!OpenProcessToken(processInformation.hProcess, TOKEN_QUERY, out childToken)) ThrowWin32("OPEN_APPCONTAINER_TOKEN_FAILED");
                using (childToken)
                {
                    result["isAppContainer"] = ReadTokenInt(childToken, 29) != 0;
                    result["integrityRid"] = ReadIntegrityRid(childToken);
                }

                uint wait = WaitForSingleObject(processInformation.hProcess, 15000);
                if (wait == WAIT_TIMEOUT)
                {
                    TerminateProcess(processInformation.hProcess, 88);
                    WaitForSingleObject(processInformation.hProcess, 5000);
                    throw new InvalidOperationException("APPCONTAINER_PROCESS_TIMEOUT");
                }
                if (wait != WAIT_OBJECT_0) ThrowWin32("APPCONTAINER_PROCESS_WAIT_FAILED");
                uint exitCode;
                if (!GetExitCodeProcess(processInformation.hProcess, out exitCode)) ThrowWin32("APPCONTAINER_EXIT_CODE_FAILED");
                result["childExitCode"] = exitCode;
            }
            finally
            {
                if (processInformation.hThread != IntPtr.Zero) CloseHandle(processInformation.hThread);
                if (processInformation.hProcess != IntPtr.Zero) CloseHandle(processInformation.hProcess);
                if (attributeListInitialized) DeleteProcThreadAttributeList(attributeList);
                if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
                if (capabilitiesBuffer != IntPtr.Zero) Marshal.FreeHGlobal(capabilitiesBuffer);
                if (environmentBlock != IntPtr.Zero) Marshal.FreeHGlobal(environmentBlock);
                if (appContainerSid != IntPtr.Zero) FreeSid(appContainerSid);
                if (profileCreated) result["deleteProfileHresult"] = DeleteAppContainerProfile(profileName);
            }
        }

        private static IntPtr BuildEnvironmentBlock(string systemRoot)
        {
            SortedDictionary<string, string> variables = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
            {
                string key = Convert.ToString(entry.Key);
                string value = Convert.ToString(entry.Value);
                if (!String.IsNullOrEmpty(key) && !key.StartsWith("=", StringComparison.Ordinal) && value != null) variables[key] = value;
            }
            string userProfile = Environment.GetEnvironmentVariable("USERPROFILE") ?? Path.Combine(Path.GetPathRoot(systemRoot), "Users", "Default");
            string localAppData = Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? Path.Combine(userProfile, "AppData", "Local");
            string root = Path.GetPathRoot(userProfile) ?? Path.GetPathRoot(systemRoot);
            SetDefault(variables, "SystemRoot", systemRoot);
            SetDefault(variables, "WINDIR", systemRoot);
            SetDefault(variables, "SystemDrive", root == null ? "C:" : root.TrimEnd('\\'));
            SetDefault(variables, "ComSpec", Path.Combine(systemRoot, "System32", "cmd.exe"));
            SetDefault(variables, "PATH", Path.Combine(systemRoot, "System32") + ";" + systemRoot);
            SetDefault(variables, "USERPROFILE", userProfile);
            SetDefault(variables, "LOCALAPPDATA", localAppData);
            SetDefault(variables, "APPDATA", Path.Combine(userProfile, "AppData", "Roaming"));
            SetDefault(variables, "TEMP", Path.Combine(localAppData, "Temp"));
            SetDefault(variables, "TMP", Path.Combine(localAppData, "Temp"));
            if (!String.IsNullOrEmpty(root))
            {
                SetDefault(variables, "HOMEDRIVE", root.TrimEnd('\\'));
                SetDefault(variables, "HOMEPATH", userProfile.Substring(root.Length - 1));
            }
            StringBuilder block = new StringBuilder();
            foreach (KeyValuePair<string, string> pair in variables)
            {
                block.Append(pair.Key).Append('=').Append(pair.Value).Append('\0');
            }
            block.Append('\0');
            byte[] bytes = Encoding.Unicode.GetBytes(block.ToString());
            IntPtr pointer = Marshal.AllocHGlobal(bytes.Length);
            Marshal.Copy(bytes, 0, pointer, bytes.Length);
            return pointer;
        }

        private static void SetDefault(IDictionary<string, string> variables, string key, string value)
        {
            if (!variables.ContainsKey(key) || String.IsNullOrEmpty(variables[key])) variables[key] = value;
        }

        private static SafeFileHandle TryOpen(string pipePath, Dictionary<string, object> result)
        {
            SafeFileHandle handle = CreateFileW(pipePath, GENERIC_READ | GENERIC_WRITE, 0, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            int error = handle == null || handle.IsInvalid ? Marshal.GetLastWin32Error() : 0;
            result["win32Error"] = error;
            return handle;
        }

        private static void SetLowIntegrity(SafeFileHandle token)
        {
            IntPtr sid = IntPtr.Zero;
            IntPtr labelBuffer = IntPtr.Zero;
            try
            {
                if (!ConvertStringSidToSidW("S-1-16-4096", out sid)) ThrowWin32("LOW_SID_CREATE_FAILED");
                TOKEN_MANDATORY_LABEL label = new TOKEN_MANDATORY_LABEL();
                label.Label.Sid = sid;
                label.Label.Attributes = SE_GROUP_INTEGRITY;
                int structSize = Marshal.SizeOf(typeof(TOKEN_MANDATORY_LABEL));
                labelBuffer = Marshal.AllocHGlobal(structSize);
                Marshal.StructureToPtr(label, labelBuffer, false);
                int length = checked(structSize + GetLengthSid(sid));
                if (!SetTokenInformation(token, TokenIntegrityLevel, labelBuffer, length)) ThrowWin32("SET_LOW_INTEGRITY_FAILED");
            }
            finally
            {
                if (labelBuffer != IntPtr.Zero) Marshal.FreeHGlobal(labelBuffer);
                if (sid != IntPtr.Zero) LocalFree(sid);
            }
        }

        private static int ReadIntegrityRid(SafeFileHandle token)
        {
            int needed;
            GetTokenInformation(token, TokenIntegrityLevel, IntPtr.Zero, 0, out needed);
            if (needed <= 0) ThrowWin32("READ_INTEGRITY_SIZE_FAILED");
            IntPtr buffer = Marshal.AllocHGlobal(needed);
            try
            {
                if (!GetTokenInformation(token, TokenIntegrityLevel, buffer, needed, out needed)) ThrowWin32("READ_INTEGRITY_FAILED");
                TOKEN_MANDATORY_LABEL label = (TOKEN_MANDATORY_LABEL)Marshal.PtrToStructure(buffer, typeof(TOKEN_MANDATORY_LABEL));
                byte count = Marshal.ReadByte(GetSidSubAuthorityCount(label.Label.Sid));
                return Marshal.ReadInt32(GetSidSubAuthority(label.Label.Sid, (uint)(count - 1)));
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }

        private static int ReadTokenInt(SafeFileHandle token, int informationClass)
        {
            IntPtr buffer = Marshal.AllocHGlobal(sizeof(int));
            try
            {
                int needed;
                if (!GetTokenInformation(token, informationClass, buffer, sizeof(int), out needed)) ThrowWin32("READ_TOKEN_INT_FAILED");
                return Marshal.ReadInt32(buffer);
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }

        private static void ThrowWin32(string code)
        {
            throw new InvalidOperationException(code + "_WIN32_" + Marshal.GetLastWin32Error().ToString());
        }
    }
}
