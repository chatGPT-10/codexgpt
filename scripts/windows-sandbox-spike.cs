using System;
using System.CodeDom.Compiler;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.CSharp;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

namespace CodexGPT.Phase4
{
    public static class SandboxSpike
    {
        private const uint CreateSuspended = 0x00000004;
        private const uint CreateUnicodeEnvironment = 0x00000400;
        private const uint CreateNoWindow = 0x08000000;
        private const uint ExtendedStartupInfoPresent = 0x00080000;
        private const uint WaitObject0 = 0;
        private const uint WaitTimeout = 258;
        private const uint JobObjectLimitKillOnJobClose = 0x00002000;
        private const uint JobObjectLimitActiveProcess = 0x00000008;
        private const int JobObjectBasicAccountingInformation = 1;
        private const int JobObjectExtendedLimitInformation = 9;
        private const int TokenRestrictedSids = 11;
        private const int TokenElevation = 20;
        private const int TokenIntegrityLevel = 25;
        private const int TokenIsAppContainer = 29;
        private const int TokenCapabilities = 30;
        private const int TokenAppContainerSid = 31;
        private const int TokenIsLessPrivilegedAppContainer = 46;
        private const uint TokenQuery = 0x0008;
        private const uint GenericWrite = 0x40000000;
        private const uint FileShareReadWrite = 0x00000003;
        private const uint OpenExisting = 3;
        private const uint ProcessCreationAllApplicationPackagesOptOut = 1;
        private const int ErrorAlreadyExistsHresult = unchecked((int)0x800700B7);
        private const int ErrorFileNotFoundHresult = unchecked((int)0x80070002);
        private static readonly IntPtr ProcThreadAttributeSecurityCapabilities = new IntPtr(0x00020009);
        private static readonly IntPtr ProcThreadAttributeJobList = new IntPtr(0x0002000D);
        private static readonly IntPtr ProcThreadAttributeAllApplicationPackagesPolicy = new IntPtr(0x0002000F);

        private static readonly string[] IsolationKeys = new[]
        {
            "liveWorkspace", "userProfile", "codexState", "browserState", "credentialState",
            "protectedRegistry", "unrelatedProcess", "unrelatedToken", "unrelatedSection",
            "approvalControlIpc", "controlIpc", "auditIpc", "namedObject", "globalObject", "mailslot",
            "rawPhysicalDevice", "rawVolume", "wmiBroker", "serviceBroker", "schedulerBroker", "comBroker",
            "tcpIpv4Loopback", "tcpIpv6Loopback", "tcpIpv4Private", "tcpIpv4LinkLocal", "tcpIpv4Public",
            "tcpIpv6LinkLocal", "tcpIpv6Public", "udpIpv4Loopback", "udpIpv6Loopback", "udpIpv4Private",
            "udpIpv4LinkLocal", "udpIpv4Public", "udpIpv4Multicast", "udpIpv6LinkLocal", "udpIpv6Public",
            "udpIpv6Multicast", "dnsUdp", "dohHttps", "directHttp", "proxyHttp"
        };

        private static readonly HashSet<string> NetworkIsolationKeys = new HashSet<string>(StringComparer.Ordinal)
        {
            "tcpIpv4Loopback", "tcpIpv6Loopback", "tcpIpv4Private", "tcpIpv4LinkLocal", "tcpIpv4Public",
            "tcpIpv6LinkLocal", "tcpIpv6Public", "udpIpv4Loopback", "udpIpv6Loopback", "udpIpv4Private",
            "udpIpv4LinkLocal", "udpIpv4Public", "udpIpv4Multicast", "udpIpv6LinkLocal", "udpIpv6Public",
            "udpIpv6Multicast", "dnsUdp", "dohHttps", "directHttp", "proxyHttp"
        };

        private static readonly string[] PositiveProbeKeys = new[]
        {
            "liveWorkspace", "userProfile", "codexState", "browserState", "credentialState",
            "protectedRegistry", "unrelatedProcess", "unrelatedToken", "unrelatedSection",
            "approvalControlIpc", "controlIpc", "auditIpc", "namedObject", "globalObject", "mailslot",
            "rawPhysicalDevice", "rawVolume", "wmiBroker", "serviceBroker", "schedulerBroker", "comBroker",
            "tcpIpv4Loopback", "tcpIpv6Loopback", "udpIpv4Loopback", "udpIpv6Loopback",
            "dnsUdp", "dohHttps", "directHttp", "proxyHttp"
        };

        private static readonly string[] PositiveControlKeys = new[]
        {
            "hostLiveWorkspace", "hostUserProfile", "hostCodexState", "hostBrowserState", "hostCredentialState",
            "hostProtectedRegistry", "hostUnrelatedProcess", "hostUnrelatedToken", "hostUnrelatedSection",
            "hostApprovalControlIpc", "hostControlIpc", "hostAuditIpc", "hostNamedObject", "hostGlobalObject",
            "hostMailslot", "hostWmiBroker", "hostServiceBroker", "hostSchedulerBroker", "hostComBroker",
            "hostTcpIpv4Loopback", "hostTcpIpv6Loopback", "hostTcpIpv4Private", "hostTcpIpv4LinkLocal",
            "hostTcpIpv4Public", "hostTcpIpv6LinkLocal", "hostTcpIpv6Public", "hostUdpIpv4Loopback",
            "hostUdpIpv6Loopback", "hostUdpIpv4Private", "hostUdpIpv4LinkLocal", "hostUdpIpv4Public",
            "hostUdpIpv4Multicast", "hostUdpIpv6LinkLocal", "hostUdpIpv6Public", "hostUdpIpv6Multicast",
            "hostDnsUdp", "hostDohHttps", "hostDirectHttp", "hostProxyHttp", "powershellStarted"
        };

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
        private struct TOKEN_APPCONTAINER_INFORMATION
        {
            public IntPtr TokenAppContainer;
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
            public uint dwFlags;
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

        [StructLayout(LayoutKind.Sequential)]
        private struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
        {
            public long TotalUserTime;
            public long TotalKernelTime;
            public long ThisPeriodTotalUserTime;
            public long ThisPeriodTotalKernelTime;
            public uint TotalPageFaultCount;
            public uint TotalProcesses;
            public uint ActiveProcesses;
            public uint TotalTerminatedProcesses;
        }

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

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out SafeFileHandle tokenHandle);

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
        private static extern IntPtr GetCurrentProcess();

        [DllImport("advapi32.dll")]
        private static extern IntPtr FreeSid(IntPtr sid);

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

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateJobObjectW(IntPtr securityAttributes, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetInformationJobObject(
            SafeFileHandle job,
            int informationClass,
            IntPtr information,
            uint informationLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool QueryInformationJobObject(
            SafeFileHandle job,
            int informationClass,
            IntPtr information,
            uint informationLength,
            out uint returnLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool TerminateJobObject(SafeFileHandle job, uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsProcessInJob(IntPtr process, SafeFileHandle job, out bool result);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint ResumeThread(IntPtr threadHandle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateMailslotW(
            string name,
            uint maxMessageSize,
            uint readTimeout,
            IntPtr securityAttributes);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateFileW(
            string fileName,
            uint desiredAccess,
            uint shareMode,
            IntPtr securityAttributes,
            uint creationDisposition,
            uint flagsAndAttributes,
            IntPtr templateFile);

        private sealed class NativeRunResult
        {
            public int ExitCode = -1;
            public bool ProcessExited;
            public bool JobEmpty;
            public bool InJob;
            public Dictionary<string, string> HostIdentity = new Dictionary<string, string>(StringComparer.Ordinal);
            public string Failure;
        }

        private sealed class ProbeObjects : IDisposable
        {
            public readonly string ApprovalPipeName;
            public readonly string ControlPipeName;
            public readonly string AuditPipeName;
            public readonly string MutexName;
            public readonly string GlobalMutexName;
            public readonly string SectionName;
            public readonly string MailslotPath;
            private NamedPipeServerStream approvalPipe;
            private NamedPipeServerStream controlPipe;
            private NamedPipeServerStream auditPipe;
            private Mutex localMutex;
            private Mutex globalMutex;
            private MemoryMappedFile section;
            private IntPtr mailslot = IntPtr.Zero;

            public ProbeObjects(string nonce)
            {
                ApprovalPipeName = "CodexGPT.Phase4.Sandbox.Approval." + nonce;
                ControlPipeName = "CodexGPT.Phase4.Sandbox.Control." + nonce;
                AuditPipeName = "CodexGPT.Phase4.Sandbox.Audit." + nonce;
                MutexName = "Local\\CodexGPT.Phase4.Sandbox." + nonce;
                GlobalMutexName = "Global\\CodexGPT.Phase4.Sandbox." + nonce;
                SectionName = "Local\\CodexGPT.Phase4.Sandbox.Section." + nonce;
                MailslotPath = "\\\\.\\mailslot\\CodexGPT.Phase4.Sandbox." + nonce;

                MutexSecurity mutexSecurity = OwnerOnlyMutexSecurity();
                bool created;
                localMutex = new Mutex(false, MutexName, out created, mutexSecurity);
                if (!created) throw new InvalidOperationException("LOCAL_MUTEX_COLLISION");
                globalMutex = new Mutex(false, GlobalMutexName, out created, mutexSecurity);
                if (!created) throw new InvalidOperationException("GLOBAL_MUTEX_COLLISION");
                section = MemoryMappedFile.CreateNew(SectionName, 4096);
                mailslot = CreateMailslotW(MailslotPath, 0, 1000, IntPtr.Zero);
                if (mailslot == new IntPtr(-1)) ThrowWin32("MAILSLOT_CREATE_FAILED");
                ResetPipes();
            }

            public void ResetPipes()
            {
                DisposePipes();
                approvalPipe = CreateOwnerOnlyPipe(ApprovalPipeName);
                controlPipe = CreateOwnerOnlyPipe(ControlPipeName);
                auditPipe = CreateOwnerOnlyPipe(AuditPipeName);
            }

            public void Dispose()
            {
                DisposePipes();
                if (section != null) section.Dispose();
                section = null;
                if (localMutex != null) localMutex.Dispose();
                localMutex = null;
                if (globalMutex != null) globalMutex.Dispose();
                globalMutex = null;
                if (mailslot != IntPtr.Zero && mailslot != new IntPtr(-1)) CloseHandle(mailslot);
                mailslot = IntPtr.Zero;
            }

            private void DisposePipes()
            {
                if (approvalPipe != null) approvalPipe.Dispose();
                if (controlPipe != null) controlPipe.Dispose();
                if (auditPipe != null) auditPipe.Dispose();
                approvalPipe = null;
                controlPipe = null;
                auditPipe = null;
            }
        }

        public static Dictionary<string, object> Run(
            string repositoryRoot,
            string fixtureDigest,
            string probeNonce,
            int ipv4Port,
            int ipv6Port,
            int udp4Port,
            int udp6Port,
            int parentPid,
            string userProfilePath,
            string codexStatePath,
            string browserStatePath,
            string credentialStatePath,
            string nodePath,
            string gitBashPath)
        {
            string nonce = ValidateProbeNonce(probeNonce);
            VerifyFixtureDigest(repositoryRoot, fixtureDigest);
            string profileName = "CodexGPT.Phase4.Sandbox." + nonce;
            string protectedRegistryPath = "Software\\Classes\\CodexGPT.Phase4B0." + nonce;
            string phaseRoot = Path.Combine(Path.GetTempPath(), "CodexGPT", "phase-4b0");
            string runRoot = Path.Combine(phaseRoot, nonce);
            string probeExecutable = Path.Combine(runRoot, "sandbox-attack-probe.exe");
            string configPath = Path.Combine(runRoot, "probe-config.txt");
            string positiveResultPath = Path.Combine(runRoot, "positive-result.txt");
            string restrictedResultPath = Path.Combine(runRoot, "restricted-result.txt");
            string crashResultPath = Path.Combine(runRoot, "crash-result.txt");
            IntPtr appContainerSid = IntPtr.Zero;
            bool profileCreated = false;
            bool profileDeleted = false;
            bool collisionRejected = false;
            bool normalProbeExited = false;
            bool crashProbeExited = false;
            bool partialSpawnRejected = false;
            bool jobsEmpty = true;
            bool namedObjectsClosed = false;
            bool privateTreeDeleted = false;
            bool privateRegistryDeleted = false;
            bool noResidualAclTargets = false;
            bool usedElevation = ReadCurrentElevation();
            string firstFailure = null;
            string profileSid = "";
            ProbeObjects probeObjects = null;
            Dictionary<string, string> restrictedLines = new Dictionary<string, string>(StringComparer.Ordinal);
            Dictionary<string, string> positiveLines = new Dictionary<string, string>(StringComparer.Ordinal);
            NativeRunResult restrictedRun = null;
            Dictionary<string, object> backends = DefaultBackends();
            string lpacStatus = "partial";

            try
            {
                Console.Error.WriteLine("phase4b0:prepare");
                Directory.CreateDirectory(runRoot);
                string attackSource = Path.Combine(repositoryRoot, "scripts", "windows-sandbox-attack-probe.cs");
                CompileProbe(attackSource, probeExecutable);
                CopyBackendFixtures(repositoryRoot, runRoot);

                int createResult = CreateAppContainerProfile(
                    profileName,
                    profileName,
                    "CodexGPT Phase 4B0 Gate S restricted identity",
                    IntPtr.Zero,
                    0,
                    out appContainerSid);
                if (createResult != 0) throw new InvalidOperationException("CREATE_APPCONTAINER_PROFILE_FAILED_" + createResult.ToString("X8"));
                profileCreated = true;
                SecurityIdentifier sandboxIdentity = new SecurityIdentifier(appContainerSid);
                profileSid = sandboxIdentity.Value;
                GrantRunTree(runRoot, sandboxIdentity);

                IntPtr collisionSid;
                int collisionResult = CreateAppContainerProfile(
                    profileName,
                    profileName,
                    "CodexGPT Phase 4B0 collision oracle",
                    IntPtr.Zero,
                    0,
                    out collisionSid);
                if (collisionSid != IntPtr.Zero) FreeSid(collisionSid);
                collisionRejected = collisionResult == ErrorAlreadyExistsHresult;
                if (!collisionRejected) RecordFailure(ref firstFailure, "PROFILE_COLLISION_NOT_REJECTED");

                probeObjects = new ProbeObjects(nonce);
                CreateProtectedRegistryKey(protectedRegistryPath);
                Dictionary<string, string> config = BuildProbeConfig(
                    repositoryRoot,
                    protectedRegistryPath,
                    parentPid,
                    userProfilePath,
                    codexStatePath,
                    browserStatePath,
                    credentialStatePath,
                    ipv4Port,
                    ipv6Port,
                    udp4Port,
                    udp6Port,
                    probeObjects);
                WriteConfig(configPath, config);

                Console.Error.WriteLine("phase4b0:positive-controls");
                foreach (string probeKey in PositiveProbeKeys)
                {
                    string resultPath = Path.Combine(runRoot, "positive-" + probeKey + ".txt");
                    try
                    {
                        int positiveExit = RunUnrestrictedProbe(probeExecutable, configPath, resultPath, runRoot, probeKey, 6000);
                        if (positiveExit == 0 && File.Exists(resultPath))
                        {
                            Dictionary<string, string> probeLines = ReadResultLines(resultPath);
                            string encoded;
                            if (probeLines.TryGetValue(probeKey, out encoded)) positiveLines[probeKey] = encoded;
                            else RecordFailure(ref firstFailure, "POSITIVE_CONTROL_RESULT_MISSING_" + probeKey.ToUpperInvariant());
                        }
                        else RecordFailure(ref firstFailure, "POSITIVE_CONTROL_PROCESS_FAILED_" + probeKey.ToUpperInvariant());
                    }
                    catch (Exception error)
                    {
                        RecordFailure(ref firstFailure, "POSITIVE_CONTROL_PROCESS_FAILED_" + probeKey.ToUpperInvariant() + "_" + NormalizeReason(error.Message));
                    }
                    finally
                    {
                        probeObjects.ResetPipes();
                    }
                }

                Console.Error.WriteLine("phase4b0:restricted-identity");
                string identityResultPath = Path.Combine(runRoot, "restricted-identity.txt");
                restrictedRun = RunRestricted(
                    probeExecutable,
                    new[] { "--mode", "identity", "--config", configPath, "--result", identityResultPath },
                    runRoot,
                    appContainerSid,
                    false,
                    6000);
                normalProbeExited = restrictedRun.ProcessExited && restrictedRun.ExitCode == 0 && File.Exists(identityResultPath);
                jobsEmpty = jobsEmpty && restrictedRun.JobEmpty;
                if (normalProbeExited) restrictedLines = ReadResultLines(identityResultPath);
                else RecordFailure(ref firstFailure, restrictedRun.Failure ?? "RESTRICTED_IDENTITY_FAILED");

                Console.Error.WriteLine("phase4b0:restricted-probes");
                foreach (string probeKey in IsolationKeys)
                {
                    string resultPath = Path.Combine(runRoot, "restricted-" + probeKey + ".txt");
                    try
                    {
                        NativeRunResult probeRun = RunRestricted(
                            probeExecutable,
                            new[] { "--mode", "probe", "--probe", probeKey, "--config", configPath, "--result", resultPath },
                            runRoot,
                            appContainerSid,
                            false,
                            6000);
                        jobsEmpty = jobsEmpty && probeRun.JobEmpty;
                        bool probeExited = probeRun.ProcessExited && probeRun.ExitCode == 0 && File.Exists(resultPath);
                        normalProbeExited = normalProbeExited && probeExited;
                        if (probeExited)
                        {
                            Dictionary<string, string> probeLines = ReadResultLines(resultPath);
                            string encoded;
                            if (probeLines.TryGetValue(probeKey, out encoded)) restrictedLines[probeKey] = encoded;
                            else
                            {
                                normalProbeExited = false;
                                RecordFailure(ref firstFailure, "RESTRICTED_PROBE_RESULT_MISSING_" + probeKey.ToUpperInvariant());
                            }
                        }
                        else RecordFailure(
                            ref firstFailure,
                            "RESTRICTED_PROBE_" + probeKey.ToUpperInvariant() + "_" +
                                NormalizeReason(probeRun.Failure ?? "PROCESS_FAILED"));
                    }
                    catch (Exception error)
                    {
                        normalProbeExited = false;
                        RecordFailure(ref firstFailure, "RESTRICTED_PROBE_FAILED_" + probeKey.ToUpperInvariant() + "_" + NormalizeReason(error.Message));
                    }
                }

                try
                {
                    Console.Error.WriteLine("phase4b0:lpac-identity");
                    string lpacResultPath = Path.Combine(runRoot, "lpac-result.txt");
                    NativeRunResult lpacRun = RunRestricted(
                        probeExecutable,
                        new[] { "--mode", "identity", "--config", configPath, "--result", lpacResultPath },
                        runRoot,
                        appContainerSid,
                        true,
                        10000);
                    jobsEmpty = jobsEmpty && lpacRun.JobEmpty;
                    if (lpacRun.ProcessExited && lpacRun.ExitCode == 0 && File.Exists(lpacResultPath))
                    {
                        Dictionary<string, string> lpacLines = ReadResultLines(lpacResultPath);
                        lpacStatus = ParseBool(lpacLines, "identity.isLpac") ? "proved" : "backend_incompatible";
                    }
                    else lpacStatus = "backend_incompatible";
                }
                catch
                {
                    lpacStatus = "backend_incompatible";
                }

                Console.Error.WriteLine("phase4b0:crash-cleanup");
                NativeRunResult crashRun = RunRestricted(
                    probeExecutable,
                    new[] { "--mode", "crash", "--config", configPath, "--result", crashResultPath },
                    runRoot,
                    appContainerSid,
                    false,
                    15000);
                int crashChildPid = ReadOptionalPid(crashResultPath);
                bool crashDescendantGone = crashChildPid > 0 && WaitForPidGone(crashChildPid, 5000);
                crashProbeExited = crashRun.ProcessExited && crashRun.ExitCode == 73 && crashRun.JobEmpty && crashDescendantGone;
                jobsEmpty = jobsEmpty && crashRun.JobEmpty;
                if (!crashProbeExited) RecordFailure(ref firstFailure, "CRASH_CLEANUP_NOT_PROVED");

                Console.Error.WriteLine("phase4b0:partial-spawn-cleanup");
                partialSpawnRejected = ProvePartialSpawnCleanup(probeExecutable, configPath, runRoot, appContainerSid);
                if (!partialSpawnRejected) RecordFailure(ref firstFailure, "PARTIAL_SPAWN_CLEANUP_NOT_PROVED");

                Console.Error.WriteLine("phase4b0:backends");
                backends = ProbeBackends(runRoot, appContainerSid, nodePath, gitBashPath, ref jobsEmpty);
            }
            catch (Exception error)
            {
                RecordFailure(ref firstFailure, "HOST_PROBE_FAILED_" + NormalizeReason(error.Message));
            }
            finally
            {
                Console.Error.WriteLine("phase4b0:cleanup");
                if (probeObjects != null)
                {
                    probeObjects.Dispose();
                    namedObjectsClosed = VerifyNamedObjectsClosed(probeObjects);
                }
                if (appContainerSid != IntPtr.Zero) FreeSid(appContainerSid);
                if (profileCreated)
                {
                    try { profileDeleted = DeleteAppContainerProfile(profileName) == 0; }
                    catch { profileDeleted = false; }
                }
                else profileDeleted = true;
                TryDeleteTree(runRoot);
                privateTreeDeleted = !Directory.Exists(runRoot);
                privateRegistryDeleted = DeleteProtectedRegistryKey(protectedRegistryPath);
                noResidualAclTargets = privateTreeDeleted && privateRegistryDeleted && profileDeleted;
                Console.Error.WriteLine("phase4b0:cleanup-complete");
            }

            Dictionary<string, object> identity = BuildIdentity(
                profileCreated,
                profileDeleted,
                collisionRejected,
                lpacStatus,
                profileSid,
                restrictedRun,
                restrictedLines);
            Dictionary<string, object> isolation = BuildIsolation(restrictedLines);
            Dictionary<string, object> positiveControls = BuildPositiveControls(positiveLines, backends);
            Dictionary<string, object> cleanup = new Dictionary<string, object>(StringComparer.Ordinal);
            cleanup["normalProbeExited"] = normalProbeExited;
            cleanup["crashProbeExited"] = crashProbeExited;
            cleanup["partialSpawnRejected"] = partialSpawnRejected;
            cleanup["jobEmpty"] = jobsEmpty;
            cleanup["profileDeleted"] = profileDeleted;
            cleanup["privateTreeDeleted"] = privateTreeDeleted;
            cleanup["privateRegistryDeleted"] = privateRegistryDeleted;
            cleanup["namedObjectsClosed"] = namedObjectsClosed;
            cleanup["noResidualAclTargets"] = noResidualAclTargets;
            cleanup["persistentSystemStateChanged"] = false;

            bool proved = Qualifies(usedElevation, identity, backends, isolation, positiveControls, cleanup);
            if (!proved && firstFailure == null)
            {
                firstFailure = FirstGateFailure(usedElevation, identity, backends, isolation, positiveControls, cleanup);
            }

            Dictionary<string, object> result = new Dictionary<string, object>(StringComparer.Ordinal);
            result["schemaVersion"] = 2;
            result["probeRevision"] = "phase-4b0-gate-s-v1";
            result["fixtureDigest"] = fixtureDigest;
            result["platform"] = "win32";
            result["windowsBuild"] = Environment.OSVersion.Version.Build.ToString();
            string processArchitecture = Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? "";
            result["architecture"] = processArchitecture.IndexOf("ARM64", StringComparison.OrdinalIgnoreCase) >= 0
                ? "arm64"
                : (Environment.Is64BitOperatingSystem ? "x64" : "x86");
            result["usedElevation"] = usedElevation;
            result["identity"] = identity;
            result["backends"] = backends;
            result["isolation"] = isolation;
            result["positiveControls"] = positiveControls;
            result["cleanup"] = cleanup;
            result["result"] = proved ? "proved" : "blocked";
            result["reason"] = proved ? null : firstFailure;
            return result;
        }

        private static void VerifyFixtureDigest(string repositoryRoot, string expectedDigest)
        {
            if (String.IsNullOrEmpty(expectedDigest) ||
                !Regex.IsMatch(expectedDigest, "\\A[a-f0-9]{64}\\z", RegexOptions.CultureInvariant))
            {
                throw new InvalidDataException("INVALID_FIXTURE_DIGEST");
            }
            string[] relativePaths = new[]
            {
                "scripts/windows-sandbox-spike.mjs",
                "scripts/windows-sandbox-spike.ps1",
                "scripts/windows-sandbox-cleanup.ps1",
                "scripts/windows-sandbox-spike.cs",
                "scripts/windows-sandbox-attack-probe.cs",
                "fixtures/sandbox-attacks/backend-powershell.ps1",
                "fixtures/sandbox-attacks/backend-node.mjs",
                "fixtures/sandbox-attacks/backend-git-bash.sh"
            };
            string actualDigest;
            using (MemoryStream content = new MemoryStream())
            {
                foreach (string relativePath in relativePaths)
                {
                    byte[] pathBytes = Encoding.UTF8.GetBytes(relativePath.Replace('\\', '/'));
                    content.Write(pathBytes, 0, pathBytes.Length);
                    content.WriteByte(0);
                    byte[] fileBytes = File.ReadAllBytes(Path.Combine(repositoryRoot, relativePath.Replace('/', Path.DirectorySeparatorChar)));
                    content.Write(fileBytes, 0, fileBytes.Length);
                    content.WriteByte(0);
                }
                content.Position = 0;
                using (SHA256 hash = SHA256.Create())
                {
                    actualDigest = BitConverter.ToString(hash.ComputeHash(content)).Replace("-", "").ToLowerInvariant();
                }
            }
            if (!String.Equals(actualDigest, expectedDigest, StringComparison.Ordinal))
            {
                throw new InvalidDataException("FIXTURE_DIGEST_MISMATCH");
            }
        }

        public static bool Cleanup(string probeNonce)
        {
            string nonce = ValidateProbeNonce(probeNonce);
            string profileName = "CodexGPT.Phase4.Sandbox." + nonce;
            string runRoot = Path.Combine(Path.GetTempPath(), "CodexGPT", "phase-4b0", nonce);
            string registryPath = "Software\\Classes\\CodexGPT.Phase4B0." + nonce;
            Stopwatch timer = Stopwatch.StartNew();
            do
            {
                int profileResult = DeleteAppContainerProfile(profileName);
                bool profileDeleted = profileResult == 0 || profileResult == ErrorFileNotFoundHresult;
                bool registryDeleted = DeleteProtectedRegistryKey(registryPath);
                TryDeleteTree(runRoot);
                if (profileDeleted && registryDeleted && !Directory.Exists(runRoot)) return true;
                Thread.Sleep(100);
            }
            while (timer.ElapsedMilliseconds < 5000);
            return false;
        }

        private static string ValidateProbeNonce(string probeNonce)
        {
            if (String.IsNullOrEmpty(probeNonce) ||
                !Regex.IsMatch(probeNonce, "\\A[a-f0-9]{32}\\z", RegexOptions.CultureInvariant))
            {
                throw new ArgumentException("INVALID_PROBE_NONCE", "probeNonce");
            }
            return probeNonce;
        }

        private static Dictionary<string, string> BuildProbeConfig(
            string repositoryRoot,
            string protectedRegistryPath,
            int parentPid,
            string userProfilePath,
            string codexStatePath,
            string browserStatePath,
            string credentialStatePath,
            int ipv4Port,
            int ipv6Port,
            int udp4Port,
            int udp6Port,
            ProbeObjects objects)
        {
            Dictionary<string, string> config = new Dictionary<string, string>(StringComparer.Ordinal);
            config["liveWorkspace"] = Path.Combine(repositoryRoot, "package.json");
            config["userProfile"] = userProfilePath;
            config["codexState"] = codexStatePath;
            config["browserState"] = browserStatePath;
            config["credentialState"] = credentialStatePath;
            config["protectedRegistry"] = protectedRegistryPath;
            config["parentPid"] = parentPid.ToString();
            config["sectionName"] = objects.SectionName;
            config["approvalPipe"] = objects.ApprovalPipeName;
            config["controlPipe"] = objects.ControlPipeName;
            config["auditPipe"] = objects.AuditPipeName;
            config["mutexName"] = objects.MutexName;
            config["globalMutexName"] = objects.GlobalMutexName;
            config["mailslotPath"] = objects.MailslotPath;
            string driveRoot = Path.GetPathRoot(repositoryRoot).TrimEnd('\\');
            config["rawVolume"] = "\\\\.\\" + driveRoot;
            config["tcp4Port"] = ipv4Port.ToString();
            config["tcp6Port"] = ipv6Port.ToString();
            config["udp4Port"] = udp4Port.ToString();
            config["udp6Port"] = udp6Port.ToString();
            return config;
        }

        private static void WriteConfig(string path, Dictionary<string, string> config)
        {
            List<string> lines = new List<string>();
            foreach (KeyValuePair<string, string> entry in config)
            {
                lines.Add(entry.Key + "=" + Convert.ToBase64String(Encoding.UTF8.GetBytes(entry.Value ?? "")));
            }
            File.WriteAllLines(path, lines.ToArray(), new UTF8Encoding(false));
        }

        private static void CompileProbe(string sourcePath, string outputPath)
        {
            if (!File.Exists(sourcePath)) throw new FileNotFoundException("SANDBOX_ATTACK_SOURCE_MISSING", sourcePath);
            using (CSharpCodeProvider provider = new CSharpCodeProvider())
            {
                CompilerParameters parameters = new CompilerParameters();
                parameters.GenerateExecutable = true;
                parameters.GenerateInMemory = false;
                parameters.IncludeDebugInformation = false;
                parameters.OutputAssembly = outputPath;
                parameters.CompilerOptions = "/target:exe /optimize+";
                parameters.ReferencedAssemblies.Add("System.dll");
                parameters.ReferencedAssemblies.Add("System.Core.dll");
                parameters.ReferencedAssemblies.Add("System.Security.dll");
                parameters.ReferencedAssemblies.Add("Microsoft.CSharp.dll");
                CompilerResults results = provider.CompileAssemblyFromFile(parameters, sourcePath);
                if (results.Errors.HasErrors)
                {
                    StringBuilder message = new StringBuilder("SANDBOX_ATTACK_COMPILE_FAILED");
                    foreach (CompilerError error in results.Errors)
                    {
                        if (!error.IsWarning) message.Append('_').Append(error.ErrorNumber).Append('_').Append(error.Line);
                    }
                    throw new InvalidOperationException(message.ToString());
                }
            }
        }

        private static void CopyBackendFixtures(string repositoryRoot, string runRoot)
        {
            string fixtureRoot = Path.Combine(repositoryRoot, "fixtures", "sandbox-attacks");
            foreach (string fileName in new[] { "backend-powershell.ps1", "backend-node.mjs", "backend-git-bash.sh" })
            {
                File.Copy(Path.Combine(fixtureRoot, fileName), Path.Combine(runRoot, fileName), true);
            }
        }

        private static int RunUnrestrictedProbe(string executable, string configPath, string resultPath, string cwd, string probeKey, int timeoutMs)
        {
            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = executable;
            start.Arguments = BuildCommandLineArguments(new[] { "--mode", "probe", "--probe", probeKey, "--config", configPath, "--result", resultPath });
            start.WorkingDirectory = cwd;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            BoundProcessEnvironment(start, cwd);
            using (Process process = Process.Start(start))
            {
                if (process == null) return -1;
                if (!process.WaitForExit(timeoutMs))
                {
                    process.Kill();
                    process.WaitForExit(5000);
                    return -2;
                }
                return process.ExitCode;
            }
        }

        private static void BoundProcessEnvironment(ProcessStartInfo start, string privateRoot)
        {
            string systemRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? "C:\\Windows";
            start.EnvironmentVariables.Clear();
            start.EnvironmentVariables["SystemDrive"] = Path.GetPathRoot(systemRoot).TrimEnd('\\');
            start.EnvironmentVariables["SystemRoot"] = systemRoot;
            start.EnvironmentVariables["WINDIR"] = systemRoot;
            start.EnvironmentVariables["ComSpec"] = Path.Combine(systemRoot, "System32", "cmd.exe");
            start.EnvironmentVariables["PATH"] = Path.Combine(systemRoot, "System32") + ";" + systemRoot;
            start.EnvironmentVariables["PATHEXT"] = ".COM;.EXE;.BAT;.CMD";
            start.EnvironmentVariables["TEMP"] = privateRoot;
            start.EnvironmentVariables["TMP"] = privateRoot;
            start.EnvironmentVariables["USERPROFILE"] = privateRoot;
            start.EnvironmentVariables["APPDATA"] = Path.Combine(privateRoot, "AppData", "Roaming");
            start.EnvironmentVariables["LOCALAPPDATA"] = Path.Combine(privateRoot, "AppData", "Local");
        }

        private static Dictionary<string, object> ProbeBackends(
            string runRoot,
            IntPtr appContainerSid,
            string nodePath,
            string gitBashPath,
            ref bool jobsEmpty)
        {
            Dictionary<string, object> result = new Dictionary<string, object>(StringComparer.Ordinal);
            string systemRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? "C:\\Windows";
            string powershell = Path.Combine(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            string powershellOutput = Path.Combine(runRoot, "backend-powershell.out");
            NativeRunResult powershellRun = RunRestricted(
                powershell,
                new[]
                {
                    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                    "-File", Path.Combine(runRoot, "backend-powershell.ps1"),
                    "-OutputPath", powershellOutput
                },
                runRoot,
                appContainerSid,
                false,
                10000);
            jobsEmpty = jobsEmpty && powershellRun.JobEmpty;
            result["windowsPowerShell"] = BackendResult(
                powershellRun.ProcessExited && powershellRun.ExitCode == 0 && File.Exists(powershellOutput),
                powershellRun,
                "runtime_acl_unavailable");

            result["node"] = ProbeOptionalBackend(
                nodePath,
                new[] { Path.Combine(runRoot, "backend-node.mjs"), Path.Combine(runRoot, "backend-node.out") },
                Path.Combine(runRoot, "backend-node.out"),
                runRoot,
                appContainerSid,
                ref jobsEmpty);

            result["gitBash"] = ProbeOptionalBackend(
                gitBashPath,
                new[] { Path.Combine(runRoot, "backend-git-bash.sh"), Path.Combine(runRoot, "backend-git-bash.out") },
                Path.Combine(runRoot, "backend-git-bash.out"),
                runRoot,
                appContainerSid,
                ref jobsEmpty);
            return result;
        }

        private static Dictionary<string, object> ProbeOptionalBackend(
            string executable,
            string[] arguments,
            string outputPath,
            string runRoot,
            IntPtr appContainerSid,
            ref bool jobsEmpty)
        {
            if (String.IsNullOrWhiteSpace(executable) || !File.Exists(executable))
            {
                return BackendUnavailable("runtime_not_found", null);
            }
            try
            {
                NativeRunResult run = RunRestricted(executable, arguments, runRoot, appContainerSid, false, 10000);
                jobsEmpty = jobsEmpty && run.JobEmpty;
                return BackendResult(
                    run.ProcessExited && run.ExitCode == 0 && File.Exists(outputPath),
                    run,
                    "runtime_acl_unavailable");
            }
            catch (Exception error)
            {
                return BackendUnavailable("runtime_acl_unavailable_" + NormalizeReason(error.Message), null);
            }
        }

        private static Dictionary<string, object> BackendResult(bool proved, NativeRunResult run, string unavailableClassification)
        {
            Dictionary<string, object> result = new Dictionary<string, object>(StringComparer.Ordinal);
            result["status"] = proved ? "proved" : "unavailable";
            result["classification"] = proved ? "exit_0" : (run.Failure ?? unavailableClassification);
            result["exitCode"] = run.ProcessExited ? (object)run.ExitCode : null;
            return result;
        }

        private static Dictionary<string, object> BackendUnavailable(string classification, object exitCode)
        {
            Dictionary<string, object> result = new Dictionary<string, object>(StringComparer.Ordinal);
            result["status"] = "unavailable";
            result["classification"] = classification;
            result["exitCode"] = exitCode;
            return result;
        }

        private static Dictionary<string, object> DefaultBackends()
        {
            Dictionary<string, object> result = new Dictionary<string, object>(StringComparer.Ordinal);
            result["windowsPowerShell"] = BackendUnavailable("not_run", null);
            result["node"] = BackendUnavailable("not_run", null);
            result["gitBash"] = BackendUnavailable("not_run", null);
            return result;
        }

        private static NativeRunResult RunRestricted(
            string executable,
            string[] arguments,
            string cwd,
            IntPtr appContainerSid,
            bool useLpac,
            int timeoutMs)
        {
            NativeRunResult result = new NativeRunResult();
            IntPtr attributeList = IntPtr.Zero;
            IntPtr securityCapabilitiesBuffer = IntPtr.Zero;
            IntPtr jobValue = IntPtr.Zero;
            IntPtr lpacPolicyBuffer = IntPtr.Zero;
            IntPtr environmentBlock = IntPtr.Zero;
            bool attributeListInitialized = false;
            PROCESS_INFORMATION processInformation = new PROCESS_INFORMATION();
            SafeFileHandle job = null;
            try
            {
                if (!File.Exists(executable)) throw new FileNotFoundException("SANDBOX_EXECUTABLE_MISSING", executable);
                job = CreateJobObjectW(IntPtr.Zero, null);
                if (job == null || job.IsInvalid) ThrowWin32("SANDBOX_JOB_CREATE_FAILED");
                ConfigureJob(job);

                SECURITY_CAPABILITIES securityCapabilities = new SECURITY_CAPABILITIES();
                securityCapabilities.AppContainerSid = appContainerSid;
                securityCapabilities.Capabilities = IntPtr.Zero;
                securityCapabilities.CapabilityCount = 0;
                int securityCapabilitiesSize = Marshal.SizeOf(typeof(SECURITY_CAPABILITIES));
                securityCapabilitiesBuffer = Marshal.AllocHGlobal(securityCapabilitiesSize);
                Marshal.StructureToPtr(securityCapabilities, securityCapabilitiesBuffer, false);

                int attributeCount = useLpac ? 3 : 2;
                IntPtr attributeListSize = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, attributeCount, 0, ref attributeListSize);
                if (attributeListSize == IntPtr.Zero) ThrowWin32("SANDBOX_ATTRIBUTE_SIZE_FAILED");
                attributeList = Marshal.AllocHGlobal(attributeListSize);
                if (!InitializeProcThreadAttributeList(attributeList, attributeCount, 0, ref attributeListSize))
                    ThrowWin32("SANDBOX_ATTRIBUTE_INIT_FAILED");
                attributeListInitialized = true;
                if (!UpdateProcThreadAttribute(
                    attributeList,
                    0,
                    ProcThreadAttributeSecurityCapabilities,
                    securityCapabilitiesBuffer,
                    new IntPtr(securityCapabilitiesSize),
                    IntPtr.Zero,
                    IntPtr.Zero)) ThrowWin32("SANDBOX_SECURITY_CAPABILITIES_FAILED");

                jobValue = Marshal.AllocHGlobal(IntPtr.Size);
                Marshal.WriteIntPtr(jobValue, job.DangerousGetHandle());
                if (!UpdateProcThreadAttribute(
                    attributeList,
                    0,
                    ProcThreadAttributeJobList,
                    jobValue,
                    new IntPtr(IntPtr.Size),
                    IntPtr.Zero,
                    IntPtr.Zero)) ThrowWin32("SANDBOX_JOB_LIST_FAILED");

                if (useLpac)
                {
                    lpacPolicyBuffer = Marshal.AllocHGlobal(sizeof(uint));
                    Marshal.WriteInt32(lpacPolicyBuffer, unchecked((int)ProcessCreationAllApplicationPackagesOptOut));
                    if (!UpdateProcThreadAttribute(
                        attributeList,
                        0,
                        ProcThreadAttributeAllApplicationPackagesPolicy,
                        lpacPolicyBuffer,
                        new IntPtr(sizeof(uint)),
                        IntPtr.Zero,
                        IntPtr.Zero)) ThrowWin32("SANDBOX_LPAC_POLICY_FAILED");
                }

                environmentBlock = BuildEnvironmentBlock(cwd);
                STARTUPINFOEX startupInfo = new STARTUPINFOEX();
                startupInfo.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                startupInfo.lpAttributeList = attributeList;
                StringBuilder commandLine = new StringBuilder(BuildCommandLine(executable, arguments));
                if (!CreateProcessW(
                    executable,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    ExtendedStartupInfoPresent | CreateSuspended | CreateNoWindow | CreateUnicodeEnvironment,
                    environmentBlock,
                    cwd,
                    ref startupInfo,
                    out processInformation)) ThrowWin32("SANDBOX_PROCESS_CREATE_FAILED");

                if (!IsProcessInJob(processInformation.hProcess, job, out result.InJob))
                    ThrowWin32("SANDBOX_JOB_VERIFY_FAILED");
                if (!result.InJob) throw new InvalidOperationException("SANDBOX_JOB_NOT_ASSIGNED_AT_CREATION");
                result.HostIdentity = ReadProcessIdentity(processInformation.hProcess, result.InJob);
                if (ResumeThread(processInformation.hThread) == 0xffffffff) ThrowWin32("SANDBOX_RESUME_FAILED");
                uint wait = WaitForSingleObject(processInformation.hProcess, (uint)timeoutMs);
                if (wait == WaitTimeout)
                {
                    TerminateJobObject(job, 92);
                    WaitForSingleObject(processInformation.hProcess, 5000);
                    result.Failure = "timeout";
                    result.ProcessExited = true;
                }
                else if (wait != WaitObject0)
                {
                    ThrowWin32("SANDBOX_PROCESS_WAIT_FAILED");
                }
                else result.ProcessExited = true;

                uint exitCode;
                if (result.ProcessExited && GetExitCodeProcess(processInformation.hProcess, out exitCode))
                    result.ExitCode = unchecked((int)exitCode);

                if (ReadActiveProcesses(job) > 0)
                {
                    TerminateJobObject(job, 93);
                }
                result.JobEmpty = WaitForJobEmpty(job, 5000);
                return result;
            }
            catch (Exception error)
            {
                result.Failure = NormalizeReason(error.Message);
                throw;
            }
            finally
            {
                if (job != null && !job.IsInvalid)
                {
                    try
                    {
                        if (ReadActiveProcesses(job) > 0)
                        {
                            TerminateJobObject(job, 94);
                            WaitForJobEmpty(job, 5000);
                        }
                    }
                    catch { }
                }
                if (processInformation.hThread != IntPtr.Zero) CloseHandle(processInformation.hThread);
                if (processInformation.hProcess != IntPtr.Zero) CloseHandle(processInformation.hProcess);
                if (attributeListInitialized) DeleteProcThreadAttributeList(attributeList);
                if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
                if (securityCapabilitiesBuffer != IntPtr.Zero) Marshal.FreeHGlobal(securityCapabilitiesBuffer);
                if (jobValue != IntPtr.Zero) Marshal.FreeHGlobal(jobValue);
                if (lpacPolicyBuffer != IntPtr.Zero) Marshal.FreeHGlobal(lpacPolicyBuffer);
                if (environmentBlock != IntPtr.Zero) Marshal.FreeHGlobal(environmentBlock);
                if (job != null) job.Dispose();
            }
        }

        private static bool ProvePartialSpawnCleanup(
            string executable,
            string configPath,
            string cwd,
            IntPtr appContainerSid)
        {
            IntPtr attributeList = IntPtr.Zero;
            IntPtr securityCapabilitiesBuffer = IntPtr.Zero;
            IntPtr jobValue = IntPtr.Zero;
            IntPtr environmentBlock = IntPtr.Zero;
            bool attributeListInitialized = false;
            PROCESS_INFORMATION processInformation = new PROCESS_INFORMATION();
            SafeFileHandle job = null;
            try
            {
                job = CreateJobObjectW(IntPtr.Zero, null);
                if (job == null || job.IsInvalid) ThrowWin32("PARTIAL_JOB_CREATE_FAILED");
                ConfigureJob(job);
                SECURITY_CAPABILITIES securityCapabilities = new SECURITY_CAPABILITIES();
                securityCapabilities.AppContainerSid = appContainerSid;
                int securityCapabilitiesSize = Marshal.SizeOf(typeof(SECURITY_CAPABILITIES));
                securityCapabilitiesBuffer = Marshal.AllocHGlobal(securityCapabilitiesSize);
                Marshal.StructureToPtr(securityCapabilities, securityCapabilitiesBuffer, false);
                jobValue = Marshal.AllocHGlobal(IntPtr.Size);
                Marshal.WriteIntPtr(jobValue, job.DangerousGetHandle());
                IntPtr attributeListSize = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref attributeListSize);
                if (attributeListSize == IntPtr.Zero) ThrowWin32("PARTIAL_ATTRIBUTE_SIZE_FAILED");
                attributeList = Marshal.AllocHGlobal(attributeListSize);
                if (!InitializeProcThreadAttributeList(attributeList, 2, 0, ref attributeListSize))
                    ThrowWin32("PARTIAL_ATTRIBUTE_INIT_FAILED");
                attributeListInitialized = true;
                if (!UpdateProcThreadAttribute(
                    attributeList,
                    0,
                    ProcThreadAttributeSecurityCapabilities,
                    securityCapabilitiesBuffer,
                    new IntPtr(securityCapabilitiesSize),
                    IntPtr.Zero,
                    IntPtr.Zero)) ThrowWin32("PARTIAL_SECURITY_CAPABILITIES_FAILED");
                if (!UpdateProcThreadAttribute(
                    attributeList,
                    0,
                    ProcThreadAttributeJobList,
                    jobValue,
                    new IntPtr(IntPtr.Size),
                    IntPtr.Zero,
                    IntPtr.Zero)) ThrowWin32("PARTIAL_JOB_LIST_FAILED");
                environmentBlock = BuildEnvironmentBlock(cwd);
                STARTUPINFOEX startupInfo = new STARTUPINFOEX();
                startupInfo.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                startupInfo.lpAttributeList = attributeList;
                string unusedResult = Path.Combine(cwd, "partial-spawn-result.txt");
                StringBuilder commandLine = new StringBuilder(BuildCommandLine(executable, new[]
                {
                    "--mode", "backend", "--config", configPath, "--result", unusedResult
                }));
                if (!CreateProcessW(
                    executable,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    ExtendedStartupInfoPresent | CreateSuspended | CreateNoWindow | CreateUnicodeEnvironment,
                    environmentBlock,
                    cwd,
                    ref startupInfo,
                    out processInformation)) ThrowWin32("PARTIAL_PROCESS_CREATE_FAILED");
                bool inJob;
                if (!IsProcessInJob(processInformation.hProcess, job, out inJob) || !inJob)
                    throw new InvalidOperationException("PARTIAL_JOB_NOT_ASSIGNED_AT_CREATION");
                if (!TerminateJobObject(job, 95)) ThrowWin32("PARTIAL_TERMINATE_FAILED");
                bool processGone = WaitForSingleObject(processInformation.hProcess, 5000) == WaitObject0;
                bool empty = WaitForJobEmpty(job, 5000);
                return processGone && empty && !File.Exists(unusedResult);
            }
            finally
            {
                if (processInformation.hThread != IntPtr.Zero) CloseHandle(processInformation.hThread);
                if (processInformation.hProcess != IntPtr.Zero) CloseHandle(processInformation.hProcess);
                if (attributeListInitialized) DeleteProcThreadAttributeList(attributeList);
                if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
                if (securityCapabilitiesBuffer != IntPtr.Zero) Marshal.FreeHGlobal(securityCapabilitiesBuffer);
                if (jobValue != IntPtr.Zero) Marshal.FreeHGlobal(jobValue);
                if (environmentBlock != IntPtr.Zero) Marshal.FreeHGlobal(environmentBlock);
                if (job != null) job.Dispose();
            }
        }

        private static void ConfigureJob(SafeFileHandle job)
        {
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose | JobObjectLimitActiveProcess;
            limits.BasicLimitInformation.ActiveProcessLimit = 8;
            int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.StructureToPtr(limits, buffer, false);
                if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, buffer, (uint)size))
                    ThrowWin32("SANDBOX_JOB_CONFIG_FAILED");
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static uint ReadActiveProcesses(SafeFileHandle job)
        {
            int size = Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION));
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try
            {
                uint returned;
                if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation, buffer, (uint)size, out returned))
                    ThrowWin32("SANDBOX_JOB_QUERY_FAILED");
                JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info =
                    (JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)Marshal.PtrToStructure(buffer, typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION));
                return info.ActiveProcesses;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static bool WaitForJobEmpty(SafeFileHandle job, int timeoutMs)
        {
            Stopwatch timer = Stopwatch.StartNew();
            while (timer.ElapsedMilliseconds < timeoutMs)
            {
                if (ReadActiveProcesses(job) == 0) return true;
                Thread.Sleep(25);
            }
            return ReadActiveProcesses(job) == 0;
        }

        private static Dictionary<string, string> ReadProcessIdentity(IntPtr processHandle, bool jobMember)
        {
            SafeFileHandle token;
            if (!OpenProcessToken(processHandle, TokenQuery, out token)) ThrowWin32("SANDBOX_TOKEN_OPEN_FAILED");
            using (token)
            {
                Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.Ordinal);
                result["identity.isAppContainer"] = (ReadTokenInt(token, TokenIsAppContainer) != 0).ToString().ToLowerInvariant();
                result["identity.isLpac"] = (TryReadTokenInt(token, TokenIsLessPrivilegedAppContainer) != 0).ToString().ToLowerInvariant();
                result["identity.integrityRid"] = ReadIntegrityRid(token).ToString();
                result["identity.capabilityCount"] = ReadTokenGroupCount(token, TokenCapabilities).ToString();
                result["identity.restrictedSidCount"] = ReadTokenGroupCount(token, TokenRestrictedSids).ToString();
                result["identity.appContainerSid"] = ReadAppContainerSid(token);
                result["identity.jobMember"] = jobMember.ToString().ToLowerInvariant();
                result["identity.elevated"] = (TryReadTokenInt(token, TokenElevation) != 0).ToString().ToLowerInvariant();
                return result;
            }
        }

        private static bool ReadCurrentElevation()
        {
            SafeFileHandle token;
            if (!OpenProcessToken(GetCurrentProcess(), TokenQuery, out token)) ThrowWin32("HOST_TOKEN_OPEN_FAILED");
            using (token) return TryReadTokenInt(token, TokenElevation) != 0;
        }

        private static int ReadTokenInt(SafeFileHandle token, int informationClass)
        {
            IntPtr buffer = Marshal.AllocHGlobal(sizeof(int));
            try
            {
                int returned;
                if (!GetTokenInformation(token, informationClass, buffer, sizeof(int), out returned))
                    ThrowWin32("TOKEN_INT_FAILED");
                return Marshal.ReadInt32(buffer);
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static int TryReadTokenInt(SafeFileHandle token, int informationClass)
        {
            try { return ReadTokenInt(token, informationClass); }
            catch (InvalidOperationException error)
            {
                if (ExtractErrorCode(error.Message) == 87) return 0;
                throw;
            }
        }

        private static IntPtr ReadTokenBuffer(SafeFileHandle token, int informationClass)
        {
            int required;
            GetTokenInformation(token, informationClass, IntPtr.Zero, 0, out required);
            if (required <= 0) ThrowWin32("TOKEN_SIZE_FAILED");
            IntPtr buffer = Marshal.AllocHGlobal(required);
            if (!GetTokenInformation(token, informationClass, buffer, required, out required))
            {
                int code = Marshal.GetLastWin32Error();
                Marshal.FreeHGlobal(buffer);
                throw new InvalidOperationException("TOKEN_READ_FAILED_" + code.ToString());
            }
            return buffer;
        }

        private static int ReadIntegrityRid(SafeFileHandle token)
        {
            IntPtr buffer = ReadTokenBuffer(token, TokenIntegrityLevel);
            try
            {
                TOKEN_MANDATORY_LABEL label =
                    (TOKEN_MANDATORY_LABEL)Marshal.PtrToStructure(buffer, typeof(TOKEN_MANDATORY_LABEL));
                byte count = Marshal.ReadByte(GetSidSubAuthorityCount(label.Label.Sid));
                return Marshal.ReadInt32(GetSidSubAuthority(label.Label.Sid, (uint)(count - 1)));
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static int ReadTokenGroupCount(SafeFileHandle token, int informationClass)
        {
            IntPtr buffer = ReadTokenBuffer(token, informationClass);
            try { return Marshal.ReadInt32(buffer); }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static string ReadAppContainerSid(SafeFileHandle token)
        {
            IntPtr buffer = ReadTokenBuffer(token, TokenAppContainerSid);
            try
            {
                TOKEN_APPCONTAINER_INFORMATION info =
                    (TOKEN_APPCONTAINER_INFORMATION)Marshal.PtrToStructure(buffer, typeof(TOKEN_APPCONTAINER_INFORMATION));
                return info.TokenAppContainer == IntPtr.Zero ? "" : new SecurityIdentifier(info.TokenAppContainer).Value;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static IntPtr BuildEnvironmentBlock(string runRoot)
        {
            string systemRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? "C:\\Windows";
            SortedDictionary<string, string> values = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            values["SystemDrive"] = Path.GetPathRoot(systemRoot).TrimEnd('\\');
            values["SystemRoot"] = systemRoot;
            values["WINDIR"] = systemRoot;
            values["ComSpec"] = Path.Combine(systemRoot, "System32", "cmd.exe");
            values["PATH"] = Path.Combine(systemRoot, "System32") + ";" + systemRoot;
            values["PATHEXT"] = ".COM;.EXE;.BAT;.CMD";
            values["TEMP"] = runRoot;
            values["TMP"] = runRoot;
            values["HOME"] = runRoot;
            values["USERPROFILE"] = runRoot;
            values["APPDATA"] = Path.Combine(runRoot, "AppData", "Roaming");
            values["LOCALAPPDATA"] = Path.Combine(runRoot, "AppData", "Local");
            Directory.CreateDirectory(values["APPDATA"]);
            Directory.CreateDirectory(values["LOCALAPPDATA"]);
            StringBuilder block = new StringBuilder();
            foreach (KeyValuePair<string, string> entry in values)
            {
                block.Append(entry.Key).Append('=').Append(entry.Value).Append('\0');
            }
            block.Append('\0');
            byte[] bytes = Encoding.Unicode.GetBytes(block.ToString());
            IntPtr pointer = Marshal.AllocHGlobal(bytes.Length);
            Marshal.Copy(bytes, 0, pointer, bytes.Length);
            return pointer;
        }

        private static string BuildCommandLine(string executable, string[] arguments)
        {
            return QuoteArgument(executable) + (arguments.Length == 0 ? "" : " " + BuildCommandLineArguments(arguments));
        }

        private static string BuildCommandLineArguments(string[] arguments)
        {
            List<string> quoted = new List<string>();
            foreach (string argument in arguments) quoted.Add(QuoteArgument(argument));
            return String.Join(" ", quoted.ToArray());
        }

        private static string QuoteArgument(string value)
        {
            if (value == null) return "\"\"";
            StringBuilder result = new StringBuilder("\"");
            int backslashes = 0;
            foreach (char character in value)
            {
                if (character == '\\') backslashes++;
                else if (character == '"')
                {
                    result.Append('\\', backslashes * 2 + 1).Append('"');
                    backslashes = 0;
                }
                else
                {
                    result.Append('\\', backslashes).Append(character);
                    backslashes = 0;
                }
            }
            result.Append('\\', backslashes * 2).Append('"');
            return result.ToString();
        }

        private static Dictionary<string, string> ReadResultLines(string path)
        {
            Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string line in File.ReadAllLines(path, Encoding.UTF8))
            {
                int equals = line.IndexOf('=');
                if (equals > 0)
                {
                    string key = line.Substring(0, equals);
                    if (result.ContainsKey(key)) throw new InvalidDataException("DUPLICATE_IDENTITY_RESULT");
                    result[key] = line.Substring(equals + 1);
                    continue;
                }
                string[] parts = line.Split('|');
                if (parts.Length != 4 || result.ContainsKey(parts[0])) throw new InvalidDataException("INVALID_ATTACK_RESULT");
                result[parts[0]] = parts[1] + "|" + parts[2] + "|" + parts[3];
            }
            return result;
        }

        private static Dictionary<string, object> BuildIdentity(
            bool profileCreated,
            bool profileDeleted,
            bool collisionRejected,
            string lpacStatus,
            string expectedProfileSid,
            NativeRunResult restrictedRun,
            Dictionary<string, string> child)
        {
            Dictionary<string, object> identity = new Dictionary<string, object>(StringComparer.Ordinal);
            Dictionary<string, string> host = restrictedRun == null
                ? new Dictionary<string, string>(StringComparer.Ordinal)
                : restrictedRun.HostIdentity;
            bool hostAppContainer = ParseBool(host, "identity.isAppContainer");
            bool childAppContainer = ParseBool(child, "identity.isAppContainer");
            string hostSid = ReadString(host, "identity.appContainerSid");
            string childSid = ReadString(child, "identity.appContainerSid");
            bool appContainerSidMatches = !String.IsNullOrEmpty(expectedProfileSid) &&
                String.Equals(hostSid, expectedProfileSid, StringComparison.Ordinal) &&
                String.Equals(childSid, expectedProfileSid, StringComparison.Ordinal);
            bool agreement = appContainerSidMatches &&
                hostAppContainer == childAppContainer &&
                ParseInt(host, "identity.integrityRid") == ParseInt(child, "identity.integrityRid") &&
                ParseInt(host, "identity.capabilityCount") == ParseInt(child, "identity.capabilityCount") &&
                ParseInt(host, "identity.restrictedSidCount") == ParseInt(child, "identity.restrictedSidCount") &&
                ParseBool(host, "identity.jobMember") == ParseBool(child, "identity.jobMember") &&
                ParseBool(host, "identity.elevated") == ParseBool(child, "identity.elevated");
            identity["profileCreated"] = profileCreated;
            identity["profileDeleted"] = profileDeleted;
            identity["uniqueProfile"] = profileCreated && !String.IsNullOrEmpty(expectedProfileSid);
            identity["collisionRejected"] = collisionRejected;
            identity["isAppContainer"] = hostAppContainer && childAppContainer;
            identity["isLpac"] = false;
            identity["lpacStatus"] = lpacStatus;
            identity["appContainerSidMatches"] = appContainerSidMatches;
            identity["hostChildAgreement"] = agreement;
            identity["integrityRid"] = ParseInt(host, "identity.integrityRid");
            identity["capabilityCount"] = ParseInt(host, "identity.capabilityCount");
            identity["restrictedSidCount"] = ParseInt(host, "identity.restrictedSidCount");
            identity["jobMember"] = restrictedRun != null && restrictedRun.InJob && ParseBool(child, "identity.jobMember");
            return identity;
        }

        private static Dictionary<string, object> BuildIsolation(Dictionary<string, string> lines)
        {
            Dictionary<string, object> result = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (string key in IsolationKeys)
            {
                string encoded;
                if (!lines.TryGetValue(key, out encoded)) result[key] = IsolationResult("partial", "not_run", 0);
                else result[key] = ParseIsolationResult(encoded);
            }
            return result;
        }

        private static Dictionary<string, object> ParseIsolationResult(string encoded)
        {
            string[] parts = encoded.Split('|');
            int code;
            if (parts.Length != 3 || !Int32.TryParse(parts[2], out code))
                return IsolationResult("partial", "invalid_result", 0);
            return IsolationResult(parts[0], parts[1], code);
        }

        private static Dictionary<string, object> IsolationResult(string status, string classification, int code)
        {
            Dictionary<string, object> result = new Dictionary<string, object>(StringComparer.Ordinal);
            result["status"] = status;
            result["classification"] = classification;
            result["code"] = code;
            return result;
        }

        private static Dictionary<string, object> BuildPositiveControls(
            Dictionary<string, string> positiveLines,
            Dictionary<string, object> backends)
        {
            Dictionary<string, object> result = new Dictionary<string, object>(StringComparer.Ordinal);
            AddStrictPositive(result, positiveLines, "hostLiveWorkspace", "liveWorkspace");
            AddStrictPositive(result, positiveLines, "hostUserProfile", "userProfile");
            AddStrictPositive(result, positiveLines, "hostCodexState", "codexState");
            AddStrictPositive(result, positiveLines, "hostBrowserState", "browserState");
            AddStrictPositive(result, positiveLines, "hostCredentialState", "credentialState");
            AddStrictPositive(result, positiveLines, "hostProtectedRegistry", "protectedRegistry");
            AddStrictPositive(result, positiveLines, "hostUnrelatedProcess", "unrelatedProcess");
            AddStrictPositive(result, positiveLines, "hostUnrelatedToken", "unrelatedToken");
            AddStrictPositive(result, positiveLines, "hostUnrelatedSection", "unrelatedSection");
            AddStrictPositive(result, positiveLines, "hostApprovalControlIpc", "approvalControlIpc");
            AddStrictPositive(result, positiveLines, "hostControlIpc", "controlIpc");
            AddStrictPositive(result, positiveLines, "hostAuditIpc", "auditIpc");
            AddStrictPositive(result, positiveLines, "hostNamedObject", "namedObject");
            AddStrictPositive(result, positiveLines, "hostGlobalObject", "globalObject");
            AddStrictPositive(result, positiveLines, "hostMailslot", "mailslot");
            AddStrictPositive(result, positiveLines, "hostWmiBroker", "wmiBroker");
            AddStrictPositive(result, positiveLines, "hostServiceBroker", "serviceBroker");
            AddStrictPositive(result, positiveLines, "hostSchedulerBroker", "schedulerBroker");
            AddStrictPositive(result, positiveLines, "hostComBroker", "comBroker");
            // Remote destination reachability is not a stable positive control. Each remote class is bound
            // to an independently successful local protocol/family control; the restricted result itself
            // must still fail with exact WSAEACCES rather than timeout, refusal, or unreachable routing.
            AddStrictPositive(result, positiveLines, "hostTcpIpv4Loopback", "tcpIpv4Loopback");
            AddStrictPositive(result, positiveLines, "hostTcpIpv6Loopback", "tcpIpv6Loopback");
            AddStrictPositive(result, positiveLines, "hostTcpIpv4Private", "tcpIpv4Loopback");
            AddStrictPositive(result, positiveLines, "hostTcpIpv4LinkLocal", "tcpIpv4Loopback");
            AddStrictPositive(result, positiveLines, "hostTcpIpv4Public", "tcpIpv4Loopback");
            AddStrictPositive(result, positiveLines, "hostTcpIpv6LinkLocal", "tcpIpv6Loopback");
            AddStrictPositive(result, positiveLines, "hostTcpIpv6Public", "tcpIpv6Loopback");
            AddStrictPositive(result, positiveLines, "hostUdpIpv4Loopback", "udpIpv4Loopback");
            AddStrictPositive(result, positiveLines, "hostUdpIpv6Loopback", "udpIpv6Loopback");
            AddStrictPositive(result, positiveLines, "hostUdpIpv4Private", "udpIpv4Loopback");
            AddStrictPositive(result, positiveLines, "hostUdpIpv4LinkLocal", "udpIpv4Loopback");
            AddStrictPositive(result, positiveLines, "hostUdpIpv4Public", "udpIpv4Loopback");
            AddStrictPositive(result, positiveLines, "hostUdpIpv4Multicast", "udpIpv4Loopback");
            AddStrictPositive(result, positiveLines, "hostUdpIpv6LinkLocal", "udpIpv6Loopback");
            AddStrictPositive(result, positiveLines, "hostUdpIpv6Public", "udpIpv6Loopback");
            AddStrictPositive(result, positiveLines, "hostUdpIpv6Multicast", "udpIpv6Loopback");
            AddStrictPositive(result, positiveLines, "hostDnsUdp", "dnsUdp");
            AddStrictPositive(result, positiveLines, "hostDohHttps", "dohHttps");
            AddStrictPositive(result, positiveLines, "hostDirectHttp", "directHttp");
            AddStrictPositive(result, positiveLines, "hostProxyHttp", "proxyHttp");
            Dictionary<string, object> powershell = backends["windowsPowerShell"] as Dictionary<string, object>;
            result["powershellStarted"] = powershell != null && String.Equals(powershell["status"] as string, "proved", StringComparison.Ordinal);
            return result;
        }

        private static void AddStrictPositive(
            Dictionary<string, object> target,
            Dictionary<string, string> lines,
            string targetKey,
            string sourceKey)
        {
            target[targetKey] = ProbeStatus(lines, sourceKey) == "allowed";
        }

        private static string ProbeStatus(Dictionary<string, string> lines, string key)
        {
            string encoded;
            if (!lines.TryGetValue(key, out encoded)) return "missing";
            string[] parts = encoded.Split('|');
            return parts.Length == 3 ? parts[0] : "invalid";
        }

        private static bool Qualifies(
            bool usedElevation,
            Dictionary<string, object> identity,
            Dictionary<string, object> backends,
            Dictionary<string, object> isolation,
            Dictionary<string, object> positiveControls,
            Dictionary<string, object> cleanup)
        {
            if (usedElevation) return false;
            foreach (string key in new[]
            {
                "profileCreated", "profileDeleted", "uniqueProfile", "collisionRejected", "isAppContainer",
                "appContainerSidMatches", "hostChildAgreement", "jobMember"
            }) if (!ReadBool(identity, key)) return false;
            if (ReadBool(identity, "isLpac")) return false;
            string lpacStatus = identity["lpacStatus"] as string;
            if (lpacStatus != "proved") return false;
            if (ReadInt(identity, "integrityRid") < 0 || ReadInt(identity, "integrityRid") >= 0x2000) return false;
            if (ReadInt(identity, "capabilityCount") != 0 || ReadInt(identity, "restrictedSidCount") < 0) return false;
            Dictionary<string, object> powershell = backends["windowsPowerShell"] as Dictionary<string, object>;
            if (powershell == null || !String.Equals(powershell["status"] as string, "proved", StringComparison.Ordinal)) return false;
            foreach (string key in IsolationKeys)
            {
                Dictionary<string, object> value = isolation[key] as Dictionary<string, object>;
                if (value == null || !String.Equals(value["status"] as string, "denied", StringComparison.Ordinal)) return false;
                if (NetworkIsolationKeys.Contains(key) && !IsExactNetworkPolicyDenial(value)) return false;
            }
            foreach (string key in PositiveControlKeys) if (!ReadBool(positiveControls, key)) return false;
            foreach (string key in new[]
            {
                "normalProbeExited", "crashProbeExited", "partialSpawnRejected", "jobEmpty", "profileDeleted",
                "privateTreeDeleted", "privateRegistryDeleted", "namedObjectsClosed", "noResidualAclTargets"
            }) if (!ReadBool(cleanup, key)) return false;
            return !ReadBool(cleanup, "persistentSystemStateChanged");
        }

        private static string FirstGateFailure(
            bool usedElevation,
            Dictionary<string, object> identity,
            Dictionary<string, object> backends,
            Dictionary<string, object> isolation,
            Dictionary<string, object> positiveControls,
            Dictionary<string, object> cleanup)
        {
            if (usedElevation) return "ELEVATION_USED";
            foreach (string key in new[]
            {
                "profileCreated", "profileDeleted", "uniqueProfile", "collisionRejected", "isAppContainer",
                "appContainerSidMatches", "hostChildAgreement", "jobMember"
            }) if (!ReadBool(identity, key)) return "IDENTITY_" + key.ToUpperInvariant() + "_FAILED";
            if (ReadInt(identity, "integrityRid") < 0 || ReadInt(identity, "integrityRid") >= 0x2000) return "IDENTITY_INTEGRITY_INVALID";
            if (ReadInt(identity, "capabilityCount") != 0) return "IDENTITY_CAPABILITIES_PRESENT";
            Dictionary<string, object> powershell = backends["windowsPowerShell"] as Dictionary<string, object>;
            if (powershell == null || !String.Equals(powershell["status"] as string, "proved", StringComparison.Ordinal))
                return "WINDOWS_POWERSHELL_BACKEND_UNAVAILABLE";
            foreach (string key in IsolationKeys)
            {
                Dictionary<string, object> value = isolation[key] as Dictionary<string, object>;
                if (value == null || !String.Equals(value["status"] as string, "denied", StringComparison.Ordinal))
                    return "ISOLATION_" + key.ToUpperInvariant() + "_" + (value == null ? "MISSING" : ((string)value["status"]).ToUpperInvariant());
                if (NetworkIsolationKeys.Contains(key) && !IsExactNetworkPolicyDenial(value))
                    return "NETWORK_" + key.ToUpperInvariant() + "_NON_POLICY_DENIAL";
            }
            foreach (string key in PositiveControlKeys) if (!ReadBool(positiveControls, key)) return "POSITIVE_CONTROL_" + key.ToUpperInvariant() + "_FAILED";
            foreach (string key in new[]
            {
                "normalProbeExited", "crashProbeExited", "partialSpawnRejected", "jobEmpty", "profileDeleted",
                "privateTreeDeleted", "privateRegistryDeleted", "namedObjectsClosed", "noResidualAclTargets"
            }) if (!ReadBool(cleanup, key)) return "CLEANUP_" + key.ToUpperInvariant() + "_FAILED";
            if (ReadBool(cleanup, "persistentSystemStateChanged")) return "PERSISTENT_SYSTEM_STATE_CHANGED";
            return "SANDBOX_GATE_S_BLOCKED";
        }

        private static bool IsExactNetworkPolicyDenial(IDictionary<string, object> value)
        {
            return value != null &&
                String.Equals(value["status"] as string, "denied", StringComparison.Ordinal) &&
                String.Equals(value["classification"] as string, "wsaeacces", StringComparison.Ordinal) &&
                ReadInt(value, "code") == 10013;
        }

        private static bool ReadBool(IDictionary<string, object> values, string key)
        {
            return values.ContainsKey(key) && values[key] is bool && (bool)values[key];
        }

        private static int ReadInt(IDictionary<string, object> values, string key)
        {
            return values.ContainsKey(key) && values[key] is int ? (int)values[key] : -1;
        }

        private static string ReadString(IDictionary<string, string> values, string key)
        {
            string value;
            return values.TryGetValue(key, out value) ? value : "";
        }

        private static bool ParseBool(IDictionary<string, string> values, string key)
        {
            bool parsed;
            string value;
            return values.TryGetValue(key, out value) && Boolean.TryParse(value, out parsed) && parsed;
        }

        private static int ParseInt(IDictionary<string, string> values, string key)
        {
            int parsed;
            string value;
            return values.TryGetValue(key, out value) && Int32.TryParse(value, out parsed) ? parsed : -1;
        }

        private static MutexSecurity OwnerOnlyMutexSecurity()
        {
            SecurityIdentifier currentUser = WindowsIdentity.GetCurrent().User;
            MutexSecurity security = new MutexSecurity();
            security.SetOwner(currentUser);
            security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new MutexAccessRule(currentUser, MutexRights.FullControl, AccessControlType.Allow));
            return security;
        }

        private static NamedPipeServerStream CreateOwnerOnlyPipe(string name)
        {
            SecurityIdentifier currentUser = WindowsIdentity.GetCurrent().User;
            PipeSecurity security = new PipeSecurity();
            security.SetOwner(currentUser);
            security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new PipeAccessRule(currentUser, PipeAccessRights.FullControl, AccessControlType.Allow));
            return new NamedPipeServerStream(
                name,
                PipeDirection.InOut,
                1,
                PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous,
                4096,
                4096,
                security);
        }

        private static void CreateProtectedRegistryKey(string subKeyPath)
        {
            SecurityIdentifier currentUser = WindowsIdentity.GetCurrent().User;
            RegistrySecurity security = new RegistrySecurity();
            security.SetOwner(currentUser);
            security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new RegistryAccessRule(
                currentUser,
                RegistryRights.FullControl,
                InheritanceFlags.ContainerInherit,
                PropagationFlags.None,
                AccessControlType.Allow));
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(
                subKeyPath,
                RegistryKeyPermissionCheck.ReadWriteSubTree,
                security))
            {
                if (key == null) throw new InvalidOperationException("PROTECTED_REGISTRY_CREATE_FAILED");
                key.SetValue("Probe", "host-private-positive-control", RegistryValueKind.String);
            }
        }

        private static bool DeleteProtectedRegistryKey(string subKeyPath)
        {
            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(subKeyPath, false);
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(subKeyPath, false)) return key == null;
            }
            catch
            {
                return false;
            }
        }

        private static void GrantRunTree(string runRoot, SecurityIdentifier sandboxIdentity)
        {
            DirectorySecurity security = new DirectoryInfo(runRoot).GetAccessControl();
            security.AddAccessRule(new FileSystemAccessRule(
                sandboxIdentity,
                FileSystemRights.Modify | FileSystemRights.ReadAndExecute | FileSystemRights.Synchronize,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow));
            new DirectoryInfo(runRoot).SetAccessControl(security);
        }

        private static bool VerifyNamedObjectsClosed(ProbeObjects objects)
        {
            bool mutexClosed = CannotOpenMutex(objects.MutexName) && CannotOpenMutex(objects.GlobalMutexName);
            bool sectionClosed = CannotOpenSection(objects.SectionName);
            bool pipesClosed = CannotConnectPipe(objects.ApprovalPipeName) &&
                CannotConnectPipe(objects.ControlPipeName) &&
                CannotConnectPipe(objects.AuditPipeName);
            bool mailslotClosed = CannotOpenMailslot(objects.MailslotPath);
            return mutexClosed && sectionClosed && pipesClosed && mailslotClosed;
        }

        private static bool CannotOpenMutex(string name)
        {
            try
            {
                using (Mutex mutex = Mutex.OpenExisting(name)) return false;
            }
            catch (WaitHandleCannotBeOpenedException) { return true; }
            catch (UnauthorizedAccessException) { return false; }
        }

        private static bool CannotOpenSection(string name)
        {
            try
            {
                using (MemoryMappedFile section = MemoryMappedFile.OpenExisting(name)) return false;
            }
            catch (FileNotFoundException) { return true; }
            catch (UnauthorizedAccessException) { return false; }
        }

        private static bool CannotConnectPipe(string name)
        {
            try
            {
                using (NamedPipeClientStream client = new NamedPipeClientStream(".", name, PipeDirection.InOut))
                {
                    client.Connect(100);
                    return false;
                }
            }
            catch (TimeoutException) { return true; }
            catch (IOException) { return true; }
        }

        private static bool CannotOpenMailslot(string path)
        {
            IntPtr handle = CreateFileW(path, GenericWrite, FileShareReadWrite, IntPtr.Zero, OpenExisting, 0, IntPtr.Zero);
            if (handle == new IntPtr(-1)) return true;
            CloseHandle(handle);
            return false;
        }

        private static int ReadOptionalPid(string path)
        {
            try
            {
                int pid;
                return File.Exists(path) && Int32.TryParse(File.ReadAllText(path, Encoding.UTF8).Trim(), out pid) ? pid : 0;
            }
            catch { return 0; }
        }

        private static bool WaitForPidGone(int pid, int timeoutMs)
        {
            Stopwatch timer = Stopwatch.StartNew();
            while (timer.ElapsedMilliseconds < timeoutMs)
            {
                try
                {
                    using (Process process = Process.GetProcessById(pid))
                    {
                        if (process.HasExited) return true;
                    }
                }
                catch (ArgumentException) { return true; }
                catch (InvalidOperationException) { return true; }
                Thread.Sleep(25);
            }
            try
            {
                using (Process process = Process.GetProcessById(pid)) return process.HasExited;
            }
            catch { return true; }
        }

        private static void RecordFailure(ref string firstFailure, string value)
        {
            if (firstFailure == null) firstFailure = value;
        }

        private static int ExtractErrorCode(string message)
        {
            if (String.IsNullOrWhiteSpace(message)) return -1;
            int separator = message.LastIndexOf('_');
            int parsed;
            return separator >= 0 && Int32.TryParse(message.Substring(separator + 1), out parsed) ? parsed : -1;
        }

        private static string NormalizeReason(string value)
        {
            if (String.IsNullOrWhiteSpace(value)) return "UNKNOWN";
            int newline = value.IndexOfAny(new[] { '\r', '\n', ':' });
            if (newline >= 0) value = value.Substring(0, newline);
            value = value.Replace(' ', '_').Replace('\\', '_').Replace('/', '_');
            return value.Length > 120 ? value.Substring(0, 120) : value;
        }

        private static void TryDeleteTree(string root)
        {
            try { if (Directory.Exists(root)) Directory.Delete(root, true); }
            catch { }
        }

        private static void ThrowWin32(string code)
        {
            throw new InvalidOperationException(code + "_" + Marshal.GetLastWin32Error().ToString());
        }
    }
}
