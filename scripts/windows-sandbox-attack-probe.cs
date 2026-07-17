using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.IO.Pipes;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

namespace CodexPro.Phase4
{
    internal static class SandboxAttackProbe
    {
        private const uint ProcessQueryLimitedInformation = 0x1000;
        private const uint TokenQuery = 0x0008;
        private const uint GenericRead = 0x80000000;
        private const uint GenericWrite = 0x40000000;
        private const uint FileShareReadWrite = 0x00000003;
        private const uint OpenExisting = 3;
        private const uint ScManagerConnect = 0x0001;
        private const uint ServiceQueryStatus = 0x0004;
        private const int ScStatusProcessInfo = 0;
        private const int TokenRestrictedSids = 11;
        private const int TokenElevation = 20;
        private const int TokenIntegrityLevel = 25;
        private const int TokenIsAppContainer = 29;
        private const int TokenCapabilities = 30;
        private const int TokenAppContainerSid = 31;
        private const int TokenIsLessPrivilegedAppContainer = 46;
        private const int ErrorFileNotFound = 2;
        private const int ErrorPathNotFound = 3;
        private const int ErrorAccessDenied = 5;
        private const int Wsaeacces = 10013;

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
        private struct SERVICE_STATUS_PROCESS
        {
            public uint ServiceType;
            public uint CurrentState;
            public uint ControlsAccepted;
            public uint Win32ExitCode;
            public uint ServiceSpecificExitCode;
            public uint CheckPoint;
            public uint WaitHint;
            public uint ProcessId;
            public uint ServiceFlags;
        }

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, int processId);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr OpenFileMappingW(uint desiredAccess, bool inheritHandle, string name);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateFileW(
            string fileName,
            uint desiredAccess,
            uint shareMode,
            IntPtr securityAttributes,
            uint creationDisposition,
            uint flagsAndAttributes,
            IntPtr templateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out SafeFileHandle tokenHandle);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr OpenSCManagerW(string machineName, string databaseName, uint desiredAccess);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr OpenServiceW(IntPtr managerHandle, string serviceName, uint desiredAccess);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool QueryServiceStatusEx(
            IntPtr serviceHandle,
            int informationLevel,
            IntPtr buffer,
            int bufferSize,
            out int bytesNeeded);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseServiceHandle(IntPtr serviceHandle);

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

        private sealed class ProbeResult
        {
            public string Status;
            public string Classification;
            public int Code;

            public ProbeResult(string status, string classification, int code)
            {
                Status = status;
                Classification = classification;
                Code = code;
            }

            public string Encode(string key)
            {
                return key + "|" + Status + "|" + Classification + "|" + Code.ToString();
            }
        }

        private static int Main(string[] args)
        {
            try
            {
                Dictionary<string, string> options = ParseOptions(args);
                string mode = Required(options, "mode");
                string resultPath = Required(options, "result");
                Dictionary<string, string> config = ReadConfig(Required(options, "config"));
                if (String.Equals(mode, "crash", StringComparison.Ordinal))
                {
                    ProcessStartInfo descendantStart = new ProcessStartInfo();
                    descendantStart.FileName = Path.Combine(Environment.GetEnvironmentVariable("SystemRoot") ?? "C:\\Windows", "System32", "cmd.exe");
                    descendantStart.Arguments = "/d /s /c \"ping 127.0.0.1 -n 30 >nul\"";
                    descendantStart.UseShellExecute = false;
                    descendantStart.CreateNoWindow = true;
                    using (Process descendant = Process.Start(descendantStart))
                    {
                        if (descendant == null) throw new InvalidOperationException("CRASH_DESCENDANT_START_FAILED");
                        File.WriteAllText(resultPath, descendant.Id.ToString(), new UTF8Encoding(false));
                    }
                    Environment.Exit(73);
                    return 73;
                }
                if (String.Equals(mode, "backend", StringComparison.Ordinal))
                {
                    File.WriteAllText(resultPath, "backend-ok", new UTF8Encoding(false));
                    return 0;
                }
                if (!String.Equals(mode, "probe", StringComparison.Ordinal) &&
                    !String.Equals(mode, "identity", StringComparison.Ordinal)) throw new InvalidDataException("INVALID_MODE");
                List<string> lines = new List<string>();
                WriteIdentity(lines);
                if (String.Equals(mode, "probe", StringComparison.Ordinal))
                {
                    RunAttackMatrix(config, lines, Required(options, "probe"));
                }
                File.WriteAllLines(resultPath, lines.ToArray(), new UTF8Encoding(false));
                return 0;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error.GetType().Name + ":" + error.Message);
                return 91;
            }
        }

        private static Dictionary<string, string> ParseOptions(string[] args)
        {
            Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.Ordinal);
            for (int index = 0; index < args.Length; index += 2)
            {
                if (index + 1 >= args.Length || !args[index].StartsWith("--", StringComparison.Ordinal)) throw new InvalidDataException("INVALID_ARGUMENTS");
                result.Add(args[index].Substring(2), args[index + 1]);
            }
            return result;
        }

        private static string Required(Dictionary<string, string> values, string key)
        {
            string value;
            if (!values.TryGetValue(key, out value) || String.IsNullOrWhiteSpace(value)) throw new InvalidDataException("MISSING_" + key.ToUpperInvariant());
            return value;
        }

        private static Dictionary<string, string> ReadConfig(string path)
        {
            Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string line in File.ReadAllLines(path, Encoding.UTF8))
            {
                int separator = line.IndexOf('=');
                if (separator <= 0) throw new InvalidDataException("INVALID_CONFIG");
                string key = line.Substring(0, separator);
                string value = Encoding.UTF8.GetString(Convert.FromBase64String(line.Substring(separator + 1)));
                result.Add(key, value);
            }
            return result;
        }

        private static void WriteIdentity(List<string> lines)
        {
            SafeFileHandle token;
            if (!OpenProcessToken(GetCurrentProcess(), TokenQuery, out token)) throw new Win32Exception(Marshal.GetLastWin32Error());
            using (token)
            {
                bool inJob;
                if (!IsProcessInJob(GetCurrentProcess(), IntPtr.Zero, out inJob)) throw new Win32Exception(Marshal.GetLastWin32Error());
                lines.Add("identity.isAppContainer=" + (ReadTokenInt(token, TokenIsAppContainer) != 0 ? "true" : "false"));
                lines.Add("identity.isLpac=" + (TryReadTokenInt(token, TokenIsLessPrivilegedAppContainer) != 0 ? "true" : "false"));
                lines.Add("identity.integrityRid=" + ReadIntegrityRid(token).ToString());
                lines.Add("identity.capabilityCount=" + ReadTokenGroupCount(token, TokenCapabilities).ToString());
                lines.Add("identity.restrictedSidCount=" + ReadTokenGroupCount(token, TokenRestrictedSids).ToString());
                lines.Add("identity.appContainerSid=" + ReadAppContainerSid(token));
                lines.Add("identity.jobMember=" + (inJob ? "true" : "false"));
                lines.Add("identity.elevated=" + (TryReadTokenInt(token, TokenElevation) != 0 ? "true" : "false"));
            }
        }

        private static void RunAttackMatrix(Dictionary<string, string> config, List<string> lines, string requestedProbe)
        {
            int initialCount = lines.Count;
            AddRequested(lines, requestedProbe, "liveWorkspace", delegate { File.ReadAllText(Required(config, "liveWorkspace")); });
            AddRequested(lines, requestedProbe, "userProfile", delegate { Directory.GetFileSystemEntries(Required(config, "userProfile")); });
            AddRequested(lines, requestedProbe, "codexState", delegate { Directory.GetFileSystemEntries(Required(config, "codexState")); });
            AddRequested(lines, requestedProbe, "browserState", delegate { Directory.GetFileSystemEntries(Required(config, "browserState")); });
            AddRequested(lines, requestedProbe, "credentialState", delegate { Directory.GetFileSystemEntries(Required(config, "credentialState")); });
            AddRequested(lines, requestedProbe, "protectedRegistry", delegate
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(Required(config, "protectedRegistry"), false))
                {
                    if (key == null) throw new IOException("REGISTRY_KEY_UNAVAILABLE");
                    key.GetValueNames();
                }
            });
            AddRequested(lines, requestedProbe, "unrelatedProcess", delegate
            {
                IntPtr handle = OpenProcess(ProcessQueryLimitedInformation, false, Int32.Parse(Required(config, "parentPid")));
                if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                CloseHandle(handle);
            });
            AddRequested(lines, requestedProbe, "unrelatedToken", delegate
            {
                IntPtr process = OpenProcess(ProcessQueryLimitedInformation, false, Int32.Parse(Required(config, "parentPid")));
                if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                try
                {
                    SafeFileHandle token;
                    if (!OpenProcessToken(process, TokenQuery, out token)) throw new Win32Exception(Marshal.GetLastWin32Error());
                    token.Dispose();
                }
                finally { CloseHandle(process); }
            });
            AddRequested(lines, requestedProbe, "unrelatedSection", delegate
            {
                IntPtr handle = OpenFileMappingW(GenericRead, false, Required(config, "sectionName"));
                if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                CloseHandle(handle);
            });
            AddRequested(lines, requestedProbe, "approvalControlIpc", delegate { ConnectPipe(Required(config, "approvalPipe")); });
            AddRequested(lines, requestedProbe, "controlIpc", delegate { ConnectPipe(Required(config, "controlPipe")); });
            AddRequested(lines, requestedProbe, "auditIpc", delegate { ConnectPipe(Required(config, "auditPipe")); });
            AddRequested(lines, requestedProbe, "namedObject", delegate
            {
                using (Mutex mutex = Mutex.OpenExisting(Required(config, "mutexName"))) { }
            });
            AddRequested(lines, requestedProbe, "globalObject", delegate
            {
                using (Mutex mutex = Mutex.OpenExisting(Required(config, "globalMutexName"))) { }
            });
            AddRequested(lines, requestedProbe, "mailslot", delegate { OpenRawWrite(Required(config, "mailslotPath")); });
            AddRequested(lines, requestedProbe, "rawPhysicalDevice", delegate { OpenRaw("\\\\.\\PhysicalDrive0"); });
            AddRequested(lines, requestedProbe, "rawVolume", delegate { OpenRaw(Required(config, "rawVolume")); });
            AddRequested(lines, requestedProbe, "wmiBroker", delegate
            {
                Type type = Type.GetTypeFromProgID("WbemScripting.SWbemLocator");
                if (type == null) throw new COMException("WMI_COM_UNAVAILABLE");
                dynamic locator = Activator.CreateInstance(type);
                dynamic services = locator.ConnectServer(".", "root\\cimv2");
                object ignored = services.Security_;
                Marshal.FinalReleaseComObject(services);
                Marshal.FinalReleaseComObject(locator);
            }, 1000);
            AddRequested(lines, requestedProbe, "serviceBroker", delegate
            {
                IntPtr manager = OpenSCManagerW(null, null, ScManagerConnect);
                if (manager == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                try
                {
                    IntPtr service = OpenServiceW(manager, "EventLog", ServiceQueryStatus);
                    if (service == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                    try
                    {
                        int size = Marshal.SizeOf(typeof(SERVICE_STATUS_PROCESS));
                        IntPtr buffer = Marshal.AllocHGlobal(size);
                        try
                        {
                            int needed;
                            if (!QueryServiceStatusEx(service, ScStatusProcessInfo, buffer, size, out needed))
                                throw new Win32Exception(Marshal.GetLastWin32Error());
                        }
                        finally { Marshal.FreeHGlobal(buffer); }
                    }
                    finally { CloseServiceHandle(service); }
                }
                finally { CloseServiceHandle(manager); }
            });
            AddRequested(lines, requestedProbe, "schedulerBroker", delegate
            {
                Type type = Type.GetTypeFromProgID("Schedule.Service");
                if (type == null) throw new COMException("SCHEDULER_COM_UNAVAILABLE");
                dynamic scheduler = Activator.CreateInstance(type);
                scheduler.Connect();
                Marshal.FinalReleaseComObject(scheduler);
            }, 1000);
            AddRequested(lines, requestedProbe, "comBroker", delegate
            {
                Type type = Type.GetTypeFromProgID("WScript.Shell");
                if (type == null) throw new COMException("COM_UNAVAILABLE");
                dynamic shell = Activator.CreateInstance(type);
                string ignored = shell.ExpandEnvironmentStrings("%WINDIR%");
                Marshal.FinalReleaseComObject(shell);
            }, 1000);

            int tcp4Port = Int32.Parse(Required(config, "tcp4Port"));
            int tcp6Port = Int32.Parse(Required(config, "tcp6Port"));
            int udp4Port = Int32.Parse(Required(config, "udp4Port"));
            int udp6Port = Int32.Parse(Required(config, "udp6Port"));
            AddRequested(lines, requestedProbe, "tcpIpv4Loopback", delegate { TcpConnect("127.0.0.1", tcp4Port, AddressFamily.InterNetwork); });
            AddRequested(lines, requestedProbe, "tcpIpv6Loopback", delegate { TcpConnect("::1", tcp6Port, AddressFamily.InterNetworkV6); });
            AddRequested(lines, requestedProbe, "tcpIpv4Private", delegate { TcpConnect("10.255.255.1", 9, AddressFamily.InterNetwork); });
            AddRequested(lines, requestedProbe, "tcpIpv4LinkLocal", delegate { TcpConnect("169.254.254.254", 9, AddressFamily.InterNetwork); });
            AddRequested(lines, requestedProbe, "tcpIpv4Public", delegate { TcpConnect("1.1.1.1", 443, AddressFamily.InterNetwork); });
            AddRequested(lines, requestedProbe, "tcpIpv6LinkLocal", delegate { TcpConnect("fe80::1", 9, AddressFamily.InterNetworkV6); });
            AddRequested(lines, requestedProbe, "tcpIpv6Public", delegate { TcpConnect("2606:4700:4700::1111", 443, AddressFamily.InterNetworkV6); });
            AddRequested(lines, requestedProbe, "udpIpv4Loopback", delegate { UdpRoundTrip("127.0.0.1", udp4Port, AddressFamily.InterNetwork, false); });
            AddRequested(lines, requestedProbe, "udpIpv6Loopback", delegate { UdpRoundTrip("::1", udp6Port, AddressFamily.InterNetworkV6, false); });
            AddRequested(lines, requestedProbe, "udpIpv4Private", delegate { UdpRoundTrip("10.255.255.1", 9, AddressFamily.InterNetwork, false); });
            AddRequested(lines, requestedProbe, "udpIpv4LinkLocal", delegate { UdpRoundTrip("169.254.254.254", 9, AddressFamily.InterNetwork, false); });
            AddRequested(lines, requestedProbe, "udpIpv4Public", delegate { UdpRoundTrip("1.1.1.1", 53, AddressFamily.InterNetwork, true); });
            AddRequested(lines, requestedProbe, "udpIpv4Multicast", delegate { UdpRoundTrip("239.255.255.250", 1900, AddressFamily.InterNetwork, false); });
            AddRequested(lines, requestedProbe, "udpIpv6LinkLocal", delegate { UdpRoundTrip("fe80::1", 9, AddressFamily.InterNetworkV6, false); });
            AddRequested(lines, requestedProbe, "udpIpv6Public", delegate { UdpRoundTrip("2606:4700:4700::1111", 53, AddressFamily.InterNetworkV6, true); });
            AddRequested(lines, requestedProbe, "udpIpv6Multicast", delegate { UdpRoundTrip("ff02::1", 9, AddressFamily.InterNetworkV6, false); });
            AddRequested(lines, requestedProbe, "dnsUdp", delegate { Dns.GetHostAddresses("example.com"); }, 1000);
            AddRequested(lines, requestedProbe, "dohHttps", delegate { HttpGet("https://cloudflare-dns.com/dns-query?name=example.com&type=A", null); }, 1500);
            AddRequested(lines, requestedProbe, "directHttp", delegate { HttpGet("http://127.0.0.1:" + tcp4Port.ToString() + "/", null); }, 1000);
            AddRequested(lines, requestedProbe, "proxyHttp", delegate
            {
                HttpGet("http://example.invalid/", new WebProxy("http://127.0.0.1:" + tcp4Port.ToString()));
            }, 1500);
            if (lines.Count == initialCount) throw new InvalidDataException("UNKNOWN_PROBE_" + requestedProbe);
        }

        private static void AddRequested(List<string> lines, string requestedProbe, string key, Action action)
        {
            AddRequested(lines, requestedProbe, key, action, 0);
        }

        private static void AddRequested(List<string> lines, string requestedProbe, string key, Action action, int ignoredTimeoutMs)
        {
            if (!String.Equals(requestedProbe, key, StringComparison.Ordinal)) return;
            lines.Add(Attempt(action).Encode(key));
        }

        private static ProbeResult Attempt(Action action)
        {
            try
            {
                action();
                return new ProbeResult("allowed", "success", 0);
            }
            catch (Exception error)
            {
                Exception captured = Unwrap(error);
                int code = ErrorCode(captured);
                if (captured is TimeoutException || code == 10060) return new ProbeResult("partial", "timeout", code);
                if (IsPolicyDenial(captured, code)) return new ProbeResult("denied", Classification(captured, code), code);
                return new ProbeResult("non_policy_failure", Classification(captured, code), code);
            }
        }

        private static Exception Unwrap(Exception error)
        {
            AggregateException aggregate = error as AggregateException;
            if (aggregate != null && aggregate.InnerExceptions.Count == 1) return Unwrap(aggregate.InnerExceptions[0]);
            return error.InnerException ?? error;
        }

        private static int ErrorCode(Exception error)
        {
            Win32Exception win32 = error as Win32Exception;
            if (win32 != null) return win32.NativeErrorCode;
            SocketException socket = error as SocketException;
            if (socket != null) return socket.ErrorCode;
            COMException com = error as COMException;
            if (com != null) return com.ErrorCode;
            return error.HResult;
        }

        private static bool IsPolicyDenial(Exception error, int code)
        {
            return error is UnauthorizedAccessException ||
                error is SecurityException ||
                error is FileNotFoundException ||
                error is DirectoryNotFoundException ||
                error is WaitHandleCannotBeOpenedException ||
                code == ErrorFileNotFound ||
                code == ErrorPathNotFound ||
                code == ErrorAccessDenied ||
                code == Wsaeacces ||
                code == unchecked((int)0x80070005);
        }

        private static string Classification(Exception error, int code)
        {
            if (error is SocketException) return code == Wsaeacces ? "wsaeacces" : "socket_error";
            if (error is UnauthorizedAccessException || error is SecurityException) return "managed_access_denied";
            if (error is FileNotFoundException || error is DirectoryNotFoundException || error is WaitHandleCannotBeOpenedException ||
                code == ErrorFileNotFound || code == ErrorPathNotFound) return "namespace_isolated";
            if (code == ErrorAccessDenied || code == unchecked((int)0x80070005)) return "win32_access_denied";
            if (error is COMException) return "com_error";
            if (error is IOException) return "io_error";
            return error.GetType().Name.ToLowerInvariant();
        }

        private static void ConnectPipe(string name)
        {
            using (NamedPipeClientStream client = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.None))
            {
                client.Connect(750);
            }
        }

        private static void OpenRaw(string path)
        {
            IntPtr handle = CreateFileW(path, GenericRead, FileShareReadWrite, IntPtr.Zero, OpenExisting, 0, IntPtr.Zero);
            if (handle == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
            CloseHandle(handle);
        }

        private static void OpenRawWrite(string path)
        {
            IntPtr handle = CreateFileW(path, GenericWrite, FileShareReadWrite, IntPtr.Zero, OpenExisting, 0, IntPtr.Zero);
            if (handle == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
            CloseHandle(handle);
        }

        private static void TcpConnect(string host, int port, AddressFamily family)
        {
            using (Socket socket = new Socket(family, SocketType.Stream, ProtocolType.Tcp))
            {
                IAsyncResult result = socket.BeginConnect(host, port, null, null);
                if (!result.AsyncWaitHandle.WaitOne(1500)) throw new TimeoutException("TCP_CONNECT_TIMEOUT");
                socket.EndConnect(result);
            }
        }

        private static void UdpRoundTrip(string host, int port, AddressFamily family, bool dnsQuery)
        {
            using (Socket socket = new Socket(family, SocketType.Dgram, ProtocolType.Udp))
            {
                socket.Connect(new IPEndPoint(IPAddress.Parse(host), port));
                byte[] payload = dnsQuery ? BuildDnsQuery() : Encoding.UTF8.GetBytes("sandbox-probe");
                int sent = socket.Send(payload);
                if (sent != payload.Length) throw new IOException("UDP_PARTIAL_SEND");
            }
        }

        private static byte[] BuildDnsQuery()
        {
            return new byte[]
            {
                0x43, 0x50, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x07, (byte)'e', (byte)'x', (byte)'a',
                (byte)'m', (byte)'p', (byte)'l', (byte)'e', 0x03, (byte)'c', (byte)'o',
                (byte)'m', 0x00, 0x00, 0x01, 0x00, 0x01
            };
        }

        private static void HttpGet(string url, IWebProxy proxy)
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.Timeout = 3500;
            request.ReadWriteTimeout = 3500;
            request.Proxy = proxy;
            request.Accept = "application/dns-json";
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (Stream stream = response.GetResponseStream())
            {
                if (stream != null) stream.ReadByte();
            }
        }

        private static int ReadTokenInt(SafeFileHandle token, int informationClass)
        {
            IntPtr buffer = Marshal.AllocHGlobal(sizeof(int));
            try
            {
                int returned;
                if (!GetTokenInformation(token, informationClass, buffer, sizeof(int), out returned)) throw new Win32Exception(Marshal.GetLastWin32Error());
                return Marshal.ReadInt32(buffer);
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static int TryReadTokenInt(SafeFileHandle token, int informationClass)
        {
            try { return ReadTokenInt(token, informationClass); }
            catch (Win32Exception error)
            {
                if (error.NativeErrorCode == 87) return 0;
                throw;
            }
        }

        private static IntPtr ReadTokenBuffer(SafeFileHandle token, int informationClass)
        {
            int required;
            GetTokenInformation(token, informationClass, IntPtr.Zero, 0, out required);
            if (required <= 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            IntPtr buffer = Marshal.AllocHGlobal(required);
            if (!GetTokenInformation(token, informationClass, buffer, required, out required))
            {
                int code = Marshal.GetLastWin32Error();
                Marshal.FreeHGlobal(buffer);
                throw new Win32Exception(code);
            }
            return buffer;
        }

        private static int ReadIntegrityRid(SafeFileHandle token)
        {
            IntPtr buffer = ReadTokenBuffer(token, TokenIntegrityLevel);
            try
            {
                TOKEN_MANDATORY_LABEL label = (TOKEN_MANDATORY_LABEL)Marshal.PtrToStructure(buffer, typeof(TOKEN_MANDATORY_LABEL));
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
                TOKEN_APPCONTAINER_INFORMATION info = (TOKEN_APPCONTAINER_INFORMATION)Marshal.PtrToStructure(buffer, typeof(TOKEN_APPCONTAINER_INFORMATION));
                return info.TokenAppContainer == IntPtr.Zero ? "" : new SecurityIdentifier(info.TokenAppContainer).Value;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
    }
}
