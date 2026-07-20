using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

namespace CodexGPT.Phase4
{
    public static class LocalControlSpike
    {
        private const uint PIPE_ACCESS_DUPLEX = 0x00000003;
        private const uint FILE_FLAG_FIRST_PIPE_INSTANCE = 0x00080000;
        private const uint PIPE_TYPE_MESSAGE = 0x00000004;
        private const uint PIPE_READMODE_MESSAGE = 0x00000002;
        private const uint PIPE_WAIT = 0x00000000;
        private const uint PIPE_REJECT_REMOTE_CLIENTS = 0x00000008;
        private const uint PIPE_UNLIMITED_INSTANCES = 255;
        private const uint ERROR_MORE_DATA = 234;
        private const uint ERROR_PIPE_CONNECTED = 535;
        private const uint TOKEN_QUERY = 0x0008;
        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        private const int TokenUser = 1;
        private const int TokenIntegrityLevel = 25;
        private const int TokenIsAppContainer = 29;
        private const int SECURITY_MANDATORY_MEDIUM_RID = 0x2000;
        private const int MAX_MESSAGE_BYTES = 65536;
        private const uint OWNER_SECURITY_INFORMATION = 0x00000001;
        private const uint GROUP_SECURITY_INFORMATION = 0x00000002;
        private const uint DACL_SECURITY_INFORMATION = 0x00000004;
        private const uint SACL_SECURITY_INFORMATION = 0x00000008;
        private const uint LABEL_SECURITY_INFORMATION = 0x00000010;

        [StructLayout(LayoutKind.Sequential)]
        private struct SECURITY_ATTRIBUTES
        {
            public int nLength;
            public IntPtr lpSecurityDescriptor;
            [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct SID_AND_ATTRIBUTES
        {
            public IntPtr Sid;
            public uint Attributes;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct TOKEN_USER_STRUCT
        {
            public SID_AND_ATTRIBUTES User;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct TOKEN_MANDATORY_LABEL_STRUCT
        {
            public SID_AND_ATTRIBUTES Label;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateNamedPipeW(
            string lpName,
            uint dwOpenMode,
            uint dwPipeMode,
            uint nMaxInstances,
            uint nOutBufferSize,
            uint nInBufferSize,
            uint nDefaultTimeOut,
            ref SECURITY_ATTRIBUTES lpSecurityAttributes);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ConnectNamedPipe(SafeFileHandle hNamedPipe, IntPtr lpOverlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DisconnectNamedPipe(SafeFileHandle hNamedPipe);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool FlushFileBuffers(SafeFileHandle hFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ReadFile(SafeFileHandle hFile, byte[] buffer, uint bytesToRead, out uint bytesRead, IntPtr overlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool WriteFile(SafeFileHandle hFile, byte[] buffer, uint bytesToWrite, out uint bytesWritten, IntPtr overlapped);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(
            string stringSecurityDescriptor,
            uint stringSDRevision,
            out IntPtr securityDescriptor,
            out uint securityDescriptorSize);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ConvertSecurityDescriptorToStringSecurityDescriptorW(
            IntPtr securityDescriptor,
            uint requestedStringSDRevision,
            uint securityInformation,
            out IntPtr stringSecurityDescriptor,
            out uint stringSecurityDescriptorLength);

        [DllImport("kernel32.dll")]
        private static extern IntPtr LocalFree(IntPtr memory);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetKernelObjectSecurity(
            SafeFileHandle handle,
            uint requestedInformation,
            byte[] securityDescriptor,
            uint length,
            out uint lengthNeeded);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetKernelObjectSecurity(
            SafeFileHandle handle,
            uint securityInformation,
            IntPtr securityDescriptor);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ImpersonateNamedPipeClient(SafeFileHandle namedPipeHandle);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool RevertToSelf();

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool OpenThreadToken(IntPtr threadHandle, uint desiredAccess, bool openAsSelf, out SafeFileHandle tokenHandle);

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentThread();

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

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetNamedPipeClientProcessId(SafeFileHandle pipe, out uint clientProcessId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern SafeFileHandle OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateJobObjectW(IntPtr jobAttributes, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsProcessInJob(SafeFileHandle processHandle, IntPtr jobHandle, out bool result);

        private sealed class Bootstrap
        {
            public int schemaVersion { get; set; }
            public string serverId { get; set; }
            public string nonce { get; set; }
            public string bootstrapKey { get; set; }
            public string stateRoot { get; set; }
        }

        private sealed class ClientEvidence
        {
            public uint clientPid { get; set; }
            public string userSid { get; set; }
            public int integrityRid { get; set; }
            public bool isAppContainer { get; set; }
            public bool inAnyJob { get; set; }
            public bool inOwnedJob { get; set; }
            public string ownedJobCheck { get; set; }
            public bool accepted { get; set; }
            public string rejectionCode { get; set; }
        }

        private sealed class DescriptorEvidence
        {
            public string ownerDaclSddl { get; set; }
            public int systemAclRevision { get; set; }
            public int systemAclAceCount { get; set; }
            public int mandatoryLabelAceCount { get; set; }
            public string mandatoryLabelSid { get; set; }
            public uint mandatoryPolicyMask { get; set; }
            public bool mediumNoWriteUp { get; set; }
        }

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MAX_MESSAGE_BYTES, RecursionLimit = 16 };

        public static void Run()
        {
            Bootstrap bootstrap = ReadBootstrap();
            ValidateBootstrap(bootstrap);
            byte[] key = Convert.FromBase64String(bootstrap.bootstrapKey);
            if (key.Length != 32) Fail("LOCAL_CONTROL_KEY_INVALID");
            string currentSid = WindowsIdentity.GetCurrent().User.Value;
            string pipeName = "codexgpt-control-" + bootstrap.serverId;
            string pipePath = "\\\\.\\pipe\\" + pipeName;
            string ownedJobName = "Local\\codexgpt-control-owned-" + bootstrap.serverId;
            string stateRoot = Path.GetFullPath(bootstrap.stateRoot);
            string statePath = Path.Combine(stateRoot, bootstrap.serverId + ".json");
            PrepareStateRoot(stateRoot, currentSid);

            IntPtr descriptor = IntPtr.Zero;
            SafeFileHandle pipe = null;
            SafeFileHandle ownedJob = null;
            try
            {
                ownedJob = CreateJobObjectW(IntPtr.Zero, ownedJobName);
                if (ownedJob == null || ownedJob.IsInvalid) Win32Fail("LOCAL_CONTROL_OWNED_JOB_CREATE_FAILED");
                string requestedPipeSddl = "O:" + currentSid + "G:" + currentSid + "D:P(A;;GA;;;SY)(A;;GA;;;" + currentSid + ")S:(ML;;NW;;;ME)";
                uint descriptorSize;
                if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(requestedPipeSddl, 1, out descriptor, out descriptorSize)) Win32Fail("LOCAL_CONTROL_DESCRIPTOR_CREATE_FAILED");
                SECURITY_ATTRIBUTES securityAttributes = new SECURITY_ATTRIBUTES();
                securityAttributes.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                securityAttributes.lpSecurityDescriptor = descriptor;
                securityAttributes.bInheritHandle = false;
                pipe = CreateNamedPipeW(
                    pipePath,
                    PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
                    PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                    PIPE_UNLIMITED_INSTANCES,
                    MAX_MESSAGE_BYTES,
                    MAX_MESSAGE_BYTES,
                    5000,
                    ref securityAttributes);
                if (pipe == null || pipe.IsInvalid) Win32Fail("LOCAL_CONTROL_PIPE_CREATE_FAILED");
                if (!SetKernelObjectSecurity(pipe, LABEL_SECURITY_INFORMATION, descriptor)) Win32Fail("LOCAL_CONTROL_LABEL_SET_FAILED");

                DescriptorEvidence actualPipeDescriptor = ReadKernelObjectDescriptor(pipe);
                string stateRootSddl = Directory.GetAccessControl(stateRoot, AccessControlSections.Owner | AccessControlSections.Access).GetSecurityDescriptorSddlForm(AccessControlSections.Owner | AccessControlSections.Access);
                string processCreationTime = Process.GetCurrentProcess().StartTime.ToUniversalTime().ToString("O");
                Dictionary<string, object> state = new Dictionary<string, object>();
                state["schemaVersion"] = 1;
                state["serverId"] = bootstrap.serverId;
                state["nonce"] = bootstrap.nonce;
                state["keyDigest"] = Hex(SHA256.Create().ComputeHash(key));
                state["pid"] = Process.GetCurrentProcess().Id;
                state["processCreationTime"] = processCreationTime;
                state["pipePath"] = pipePath;
                state["ownedJobName"] = ownedJobName;
                state["pipeOwnerSid"] = currentSid;
                state["pipeSddl"] = actualPipeDescriptor.ownerDaclSddl;
                state["pipeDescriptor"] = actualPipeDescriptor;
                state["stateRootSddl"] = stateRootSddl;
                state["pipeRejectRemoteClients"] = true;
                WriteStateFile(statePath, Json.Serialize(state), currentSid);
                string stateFileSddl = File.GetAccessControl(statePath, AccessControlSections.Owner | AccessControlSections.Access).GetSecurityDescriptorSddlForm(AccessControlSections.Owner | AccessControlSections.Access);

                Dictionary<string, object> ready = new Dictionary<string, object>();
                ready["schemaVersion"] = 1;
                ready["code"] = "CONTROL_READY";
                ready["serverId"] = bootstrap.serverId;
                ready["nonce"] = bootstrap.nonce;
                ready["pid"] = Process.GetCurrentProcess().Id;
                ready["processCreationTime"] = processCreationTime;
                ready["pipePath"] = pipePath;
                ready["ownedJobName"] = ownedJobName;
                ready["pipeSddl"] = actualPipeDescriptor.ownerDaclSddl;
                ready["pipeDescriptor"] = actualPipeDescriptor;
                ready["stateRootSddl"] = stateRootSddl;
                ready["stateFileSddl"] = stateFileSddl;
                ready["pipeRejectRemoteClients"] = true;
                Console.Out.WriteLine(Json.Serialize(ready));
                Console.Out.Flush();

                bool stop = false;
                while (!stop)
                {
                    bool connected = ConnectNamedPipe(pipe, IntPtr.Zero);
                    if (!connected && Marshal.GetLastWin32Error() != ERROR_PIPE_CONNECTED) Win32Fail("LOCAL_CONTROL_CONNECT_FAILED");
                    try
                    {
                        byte[] requestHeader = ReadExact(pipe, 4);
                        ClientEvidence evidence = InspectClient(pipe, currentSid, ownedJob);
                        if (!evidence.accepted) throw new InvalidOperationException(evidence.rejectionCode);
                        Dictionary<string, object> request = ReadMessage(pipe, requestHeader);
                        Dictionary<string, object> response = HandleRequest(request, evidence, bootstrap, key, actualPipeDescriptor, stateRootSddl, stateFileSddl);
                        WriteMessage(pipe, response);
                        object operation;
                        stop = response.ContainsKey("ok") && (bool)response["ok"] && request.TryGetValue("operation", out operation) && Convert.ToString(operation) == "shutdown";
                        FlushFileBuffers(pipe);
                    }
                    catch (Exception error)
                    {
                        Dictionary<string, object> response = new Dictionary<string, object>();
                        response["schemaVersion"] = 1;
                        response["ok"] = false;
                        response["code"] = SafeCode(error.Message);
                        try
                        {
                            WriteMessage(pipe, response);
                            FlushFileBuffers(pipe);
                        }
                        catch { }
                    }
                    finally
                    {
                        DisconnectNamedPipe(pipe);
                    }
                }
            }
            finally
            {
                if (pipe != null) pipe.Dispose();
                if (ownedJob != null) ownedJob.Dispose();
                if (descriptor != IntPtr.Zero) LocalFree(descriptor);
                TryDelete(statePath);
                TryDeleteDirectory(stateRoot);
                Array.Clear(key, 0, key.Length);
            }
        }

        private static Bootstrap ReadBootstrap()
        {
            string line = Console.In.ReadLine();
            if (String.IsNullOrWhiteSpace(line) || line.Length > MAX_MESSAGE_BYTES) Fail("LOCAL_CONTROL_BOOTSTRAP_INVALID");
            Bootstrap value = Json.Deserialize<Bootstrap>(line);
            if (value == null) Fail("LOCAL_CONTROL_BOOTSTRAP_INVALID");
            return value;
        }

        private static void ValidateBootstrap(Bootstrap value)
        {
            if (value.schemaVersion != 1 || !IsHex(value.serverId, 32) || !IsHex(value.nonce, 64) || String.IsNullOrWhiteSpace(value.bootstrapKey) || String.IsNullOrWhiteSpace(value.stateRoot)) Fail("LOCAL_CONTROL_BOOTSTRAP_INVALID");
        }

        private static void PrepareStateRoot(string root, string sidText)
        {
            Directory.CreateDirectory(root);
            SecurityIdentifier sid = new SecurityIdentifier(sidText);
            SecurityIdentifier system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
            DirectorySecurity security = new DirectorySecurity();
            security.SetOwner(sid);
            security.SetAccessRuleProtection(true, false);
            InheritanceFlags inheritance = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
            security.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, inheritance, PropagationFlags.None, AccessControlType.Allow));
            security.AddAccessRule(new FileSystemAccessRule(system, FileSystemRights.FullControl, inheritance, PropagationFlags.None, AccessControlType.Allow));
            Directory.SetAccessControl(root, security);
        }

        private static void WriteStateFile(string file, string content, string sidText)
        {
            byte[] bytes = new UTF8Encoding(false).GetBytes(content + "\n");
            using (FileStream stream = new FileStream(file, FileMode.CreateNew, FileAccess.Write, FileShare.Read, 4096, FileOptions.WriteThrough))
            {
                stream.Write(bytes, 0, bytes.Length);
                stream.Flush(true);
            }
            SecurityIdentifier sid = new SecurityIdentifier(sidText);
            SecurityIdentifier system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
            FileSecurity security = new FileSecurity();
            security.SetOwner(sid);
            security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, AccessControlType.Allow));
            security.AddAccessRule(new FileSystemAccessRule(system, FileSystemRights.FullControl, AccessControlType.Allow));
            File.SetAccessControl(file, security);
        }

        private static string ConvertDescriptorToSddl(IntPtr descriptor, uint info)
        {
            IntPtr text = IntPtr.Zero;
            uint length;
            if (!ConvertSecurityDescriptorToStringSecurityDescriptorW(descriptor, 1, info, out text, out length)) Win32Fail("LOCAL_CONTROL_DESCRIPTOR_STRING_FAILED");
            try
            {
                return Marshal.PtrToStringUni(text) ?? String.Empty;
            }
            finally
            {
                if (text != IntPtr.Zero) LocalFree(text);
            }
        }

        private static DescriptorEvidence ReadKernelObjectDescriptor(SafeFileHandle handle)
        {
            uint basicInfo = OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION;
            byte[] basicBytes = ReadKernelObjectSecurityBytes(handle, basicInfo);
            byte[] labelBytes = ReadKernelObjectSecurityBytes(handle, LABEL_SECURITY_INFORMATION);
            IntPtr descriptor = Marshal.AllocHGlobal(basicBytes.Length);
            try
            {
                Marshal.Copy(basicBytes, 0, descriptor, basicBytes.Length);
                DescriptorEvidence evidence = new DescriptorEvidence();
                evidence.ownerDaclSddl = ConvertDescriptorToSddl(descriptor, basicInfo);
                ParseMandatoryLabel(labelBytes, evidence);
                return evidence;
            }
            finally
            {
                Marshal.FreeHGlobal(descriptor);
            }
        }

        private static byte[] ReadKernelObjectSecurityBytes(SafeFileHandle handle, uint information)
        {
            uint needed;
            GetKernelObjectSecurity(handle, information, null, 0, out needed);
            if (needed == 0) Win32Fail("LOCAL_CONTROL_DESCRIPTOR_READ_FAILED");
            byte[] bytes = new byte[needed];
            if (!GetKernelObjectSecurity(handle, information, bytes, needed, out needed)) Win32Fail("LOCAL_CONTROL_DESCRIPTOR_READ_FAILED");
            return bytes;
        }

        private static void ParseMandatoryLabel(byte[] descriptor, DescriptorEvidence evidence)
        {
            if (descriptor.Length < 20) Fail("LOCAL_CONTROL_DESCRIPTOR_INVALID");
            int saclOffset = checked((int)BitConverter.ToUInt32(descriptor, 12));
            if (saclOffset == 0) return;
            if (saclOffset < 0 || saclOffset + 8 > descriptor.Length) Fail("LOCAL_CONTROL_DESCRIPTOR_INVALID");
            evidence.systemAclRevision = descriptor[saclOffset];
            int aclSize = BitConverter.ToUInt16(descriptor, saclOffset + 2);
            evidence.systemAclAceCount = BitConverter.ToUInt16(descriptor, saclOffset + 4);
            if (aclSize < 8 || saclOffset + aclSize > descriptor.Length) Fail("LOCAL_CONTROL_DESCRIPTOR_INVALID");
            int cursor = saclOffset + 8;
            for (int index = 0; index < evidence.systemAclAceCount; index++)
            {
                if (cursor + 4 > saclOffset + aclSize) Fail("LOCAL_CONTROL_DESCRIPTOR_INVALID");
                byte aceType = descriptor[cursor];
                int aceSize = BitConverter.ToUInt16(descriptor, cursor + 2);
                if (aceSize < 4 || cursor + aceSize > saclOffset + aclSize) Fail("LOCAL_CONTROL_DESCRIPTOR_INVALID");
                if (aceType == 0x11)
                {
                    if (aceSize < 16) Fail("LOCAL_CONTROL_DESCRIPTOR_INVALID");
                    evidence.mandatoryLabelAceCount += 1;
                    evidence.mandatoryPolicyMask = BitConverter.ToUInt32(descriptor, cursor + 4);
                    GCHandle pinned = GCHandle.Alloc(descriptor, GCHandleType.Pinned);
                    try
                    {
                        IntPtr sidPointer = IntPtr.Add(pinned.AddrOfPinnedObject(), cursor + 8);
                        evidence.mandatoryLabelSid = new SecurityIdentifier(sidPointer).Value;
                    }
                    finally
                    {
                        pinned.Free();
                    }
                }
                cursor += aceSize;
            }
            evidence.mediumNoWriteUp = evidence.mandatoryLabelAceCount == 1 && evidence.mandatoryLabelSid == "S-1-16-8192" && (evidence.mandatoryPolicyMask & 0x1) == 0x1;
        }

        private static ClientEvidence InspectClient(SafeFileHandle pipe, string expectedSid, SafeFileHandle ownedJob)
        {
            ClientEvidence evidence = new ClientEvidence();
            uint clientPid;
            if (!GetNamedPipeClientProcessId(pipe, out clientPid)) Win32Fail("LOCAL_CONTROL_CLIENT_PID_UNAVAILABLE");
            evidence.clientPid = clientPid;
            SafeFileHandle process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, clientPid);
            if (process == null || process.IsInvalid) Win32Fail("LOCAL_CONTROL_CLIENT_PROCESS_UNAVAILABLE");
            using (process)
            {
                bool inJob;
                if (!IsProcessInJob(process, IntPtr.Zero, out inJob)) Win32Fail("LOCAL_CONTROL_ANY_JOB_CHECK_FAILED");
                evidence.inAnyJob = inJob;
                bool inOwnedJob;
                if (!IsProcessInJob(process, ownedJob.DangerousGetHandle(), out inOwnedJob)) Win32Fail("LOCAL_CONTROL_OWNED_JOB_CHECK_FAILED");
                evidence.inOwnedJob = inOwnedJob;
                evidence.ownedJobCheck = inOwnedJob ? "member" : "not_member";
            }
            if (!ImpersonateNamedPipeClient(pipe)) Win32Fail("LOCAL_CONTROL_IMPERSONATION_FAILED");
            try
            {
                SafeFileHandle token;
                if (!OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, true, out token)) Win32Fail("LOCAL_CONTROL_CLIENT_TOKEN_FAILED");
                using (token)
                {
                    evidence.userSid = ReadTokenUserSid(token);
                    evidence.integrityRid = ReadIntegrityRid(token);
                    evidence.isAppContainer = ReadTokenInt(token, TokenIsAppContainer) != 0;
                }
            }
            finally
            {
                RevertToSelf();
            }
            if (evidence.inOwnedJob) evidence.rejectionCode = "CONTROL_OWNED_JOB_CLIENT";
            else if (!String.Equals(evidence.userSid, expectedSid, StringComparison.OrdinalIgnoreCase)) evidence.rejectionCode = "CONTROL_WRONG_USER";
            else if (evidence.integrityRid < SECURITY_MANDATORY_MEDIUM_RID) evidence.rejectionCode = "CONTROL_LOW_INTEGRITY";
            else if (evidence.isAppContainer) evidence.rejectionCode = "CONTROL_APPCONTAINER_REJECTED";
            evidence.accepted = evidence.rejectionCode == null;
            return evidence;
        }

        private static string ReadTokenUserSid(SafeFileHandle token)
        {
            IntPtr buffer = ReadTokenBuffer(token, TokenUser);
            try
            {
                TOKEN_USER_STRUCT value = (TOKEN_USER_STRUCT)Marshal.PtrToStructure(buffer, typeof(TOKEN_USER_STRUCT));
                return new SecurityIdentifier(value.User.Sid).Value;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static int ReadIntegrityRid(SafeFileHandle token)
        {
            IntPtr buffer = ReadTokenBuffer(token, TokenIntegrityLevel);
            try
            {
                TOKEN_MANDATORY_LABEL_STRUCT value = (TOKEN_MANDATORY_LABEL_STRUCT)Marshal.PtrToStructure(buffer, typeof(TOKEN_MANDATORY_LABEL_STRUCT));
                byte count = Marshal.ReadByte(GetSidSubAuthorityCount(value.Label.Sid));
                return Marshal.ReadInt32(GetSidSubAuthority(value.Label.Sid, (uint)(count - 1)));
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static int ReadTokenInt(SafeFileHandle token, int informationClass)
        {
            IntPtr buffer = ReadTokenBuffer(token, informationClass);
            try { return Marshal.ReadInt32(buffer); }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private static IntPtr ReadTokenBuffer(SafeFileHandle token, int informationClass)
        {
            int needed;
            GetTokenInformation(token, informationClass, IntPtr.Zero, 0, out needed);
            if (needed <= 0) Win32Fail("LOCAL_CONTROL_TOKEN_INFO_FAILED");
            IntPtr buffer = Marshal.AllocHGlobal(needed);
            if (!GetTokenInformation(token, informationClass, buffer, needed, out needed))
            {
                Marshal.FreeHGlobal(buffer);
                Win32Fail("LOCAL_CONTROL_TOKEN_INFO_FAILED");
            }
            return buffer;
        }

        private static Dictionary<string, object> HandleRequest(Dictionary<string, object> request, ClientEvidence evidence, Bootstrap bootstrap, byte[] key, DescriptorEvidence pipeDescriptor, string rootSddl, string fileSddl)
        {
            if (!evidence.accepted) throw new InvalidOperationException(evidence.rejectionCode);
            string requestId = RequireString(request, "requestId", 32, true);
            object schemaRaw;
            if (!request.TryGetValue("schemaVersion", out schemaRaw) || Convert.ToInt32(schemaRaw) != 1) Fail("CONTROL_REQUEST_INVALID");
            if (!String.Equals(RequireString(request, "serverId", 32, true), bootstrap.serverId, StringComparison.Ordinal)) Fail("CONTROL_SERVER_MISMATCH");
            if (!String.Equals(RequireString(request, "nonce", 64, true), bootstrap.nonce, StringComparison.Ordinal)) Fail("CONTROL_NONCE_MISMATCH");
            string operation = RequireString(request, "operation", 64, false);
            if (operation == "bootstrap")
            {
                Dictionary<string, object> bootstrapResponse = new Dictionary<string, object>();
                bootstrapResponse["schemaVersion"] = 1;
                bootstrapResponse["ok"] = true;
                bootstrapResponse["code"] = "CONTROL_BOOTSTRAP";
                bootstrapResponse["serverId"] = bootstrap.serverId;
                bootstrapResponse["nonce"] = bootstrap.nonce;
                bootstrapResponse["bootstrapKey"] = Convert.ToBase64String(key);
                bootstrapResponse["bootstrapKeyTransport"] = "private_local_pipe";
                return bootstrapResponse;
            }
            byte[] supplied;
            try { supplied = Convert.FromBase64String(RequireString(request, "bootstrapKey", 128, false)); }
            catch { Fail("CONTROL_KEY_MISMATCH"); return null; }
            if (!FixedEquals(key, supplied)) Fail("CONTROL_KEY_MISMATCH");
            if (operation == "dispatch") return ForwardToParent(request, requestId, bootstrap.serverId);
            if (operation != "ping" && operation != "describe" && operation != "shutdown") Fail("CONTROL_OPERATION_UNKNOWN");
            Dictionary<string, object> response = new Dictionary<string, object>();
            response["schemaVersion"] = 1;
            response["ok"] = true;
            response["code"] = operation == "shutdown" ? "CONTROL_SHUTDOWN" : "CONTROL_OK";
            response["serverId"] = bootstrap.serverId;
            response["nonce"] = bootstrap.nonce;
            response["client"] = evidence;
            if (operation == "describe")
            {
                response["pipeSddl"] = pipeDescriptor.ownerDaclSddl;
                response["pipeDescriptor"] = pipeDescriptor;
                response["stateRootSddl"] = rootSddl;
                response["stateFileSddl"] = fileSddl;
                response["pipeRejectRemoteClients"] = true;
                response["bootstrapKeyTransport"] = "private_parent_stdin";
            }
            return response;
        }

        private static Dictionary<string, object> ForwardToParent(Dictionary<string, object> request, string requestId, string serverId)
        {
            object input;
            if (!request.TryGetValue("input", out input) || !(input is Dictionary<string, object>)) Fail("CONTROL_REQUEST_INVALID");
            Dictionary<string, object> forwarded = new Dictionary<string, object>();
            forwarded["schemaVersion"] = 1;
            forwarded["code"] = "CONTROL_DISPATCH";
            forwarded["requestId"] = requestId;
            forwarded["serverId"] = serverId;
            forwarded["request"] = input;
            string serialized = Json.Serialize(forwarded);
            if (new UTF8Encoding(false).GetByteCount(serialized) > MAX_MESSAGE_BYTES) Fail("CONTROL_REQUEST_TOO_LARGE");
            Console.Out.WriteLine(serialized);
            Console.Out.Flush();

            string line = Console.In.ReadLine();
            if (String.IsNullOrWhiteSpace(line) || new UTF8Encoding(false).GetByteCount(line) > MAX_MESSAGE_BYTES) Fail("CONTROL_PARENT_RESPONSE_INVALID");
            Dictionary<string, object> parent = Json.Deserialize<Dictionary<string, object>>(line);
            object schemaRaw;
            if (parent == null || !parent.TryGetValue("schemaVersion", out schemaRaw) || Convert.ToInt32(schemaRaw) != 1) Fail("CONTROL_PARENT_RESPONSE_INVALID");
            if (!String.Equals(RequireString(parent, "code", 64, false), "CONTROL_DISPATCH_RESULT", StringComparison.Ordinal)) Fail("CONTROL_PARENT_RESPONSE_INVALID");
            if (!String.Equals(RequireString(parent, "requestId", 32, true), requestId, StringComparison.Ordinal)) Fail("CONTROL_PARENT_RESPONSE_MISMATCH");
            object response;
            if (!parent.TryGetValue("response", out response) || !(response is Dictionary<string, object>)) Fail("CONTROL_PARENT_RESPONSE_INVALID");
            return (Dictionary<string, object>)response;
        }

        private static Dictionary<string, object> ReadMessage(SafeFileHandle pipe, byte[] header)
        {
            int length = BitConverter.ToInt32(header, 0);
            if (length <= 0 || length > MAX_MESSAGE_BYTES) Fail("CONTROL_REQUEST_TOO_LARGE");
            string json = new UTF8Encoding(false, true).GetString(ReadExact(pipe, length));
            Dictionary<string, object> value = Json.Deserialize<Dictionary<string, object>>(json);
            if (value == null) Fail("CONTROL_REQUEST_INVALID");
            return value;
        }

        private static void WriteMessage(SafeFileHandle pipe, Dictionary<string, object> value)
        {
            byte[] payload = new UTF8Encoding(false).GetBytes(Json.Serialize(value));
            if (payload.Length > MAX_MESSAGE_BYTES) Fail("CONTROL_RESPONSE_TOO_LARGE");
            byte[] frame = new byte[4 + payload.Length];
            Buffer.BlockCopy(BitConverter.GetBytes(payload.Length), 0, frame, 0, 4);
            Buffer.BlockCopy(payload, 0, frame, 4, payload.Length);
            int offset = 0;
            while (offset < frame.Length)
            {
                byte[] slice = new byte[frame.Length - offset];
                Buffer.BlockCopy(frame, offset, slice, 0, slice.Length);
                uint written;
                if (!WriteFile(pipe, slice, (uint)slice.Length, out written, IntPtr.Zero) || written == 0) Win32Fail("CONTROL_WRITE_FAILED");
                offset += (int)written;
            }
        }

        private static byte[] ReadExact(SafeFileHandle pipe, int length)
        {
            byte[] result = new byte[length];
            int offset = 0;
            while (offset < length)
            {
                byte[] chunk = new byte[length - offset];
                uint read;
                bool ok = ReadFile(pipe, chunk, (uint)chunk.Length, out read, IntPtr.Zero);
                int error = ok ? 0 : Marshal.GetLastWin32Error();
                if ((!ok && error != ERROR_MORE_DATA) || read == 0) Win32Fail("CONTROL_READ_FAILED");
                Buffer.BlockCopy(chunk, 0, result, offset, (int)read);
                offset += (int)read;
            }
            return result;
        }

        private static string RequireString(Dictionary<string, object> value, string key, int maximum, bool hex)
        {
            object raw;
            if (!value.TryGetValue(key, out raw)) Fail("CONTROL_REQUEST_INVALID");
            string text = Convert.ToString(raw);
            if (String.IsNullOrEmpty(text) || text.Length > maximum || (hex && !IsHex(text, text.Length))) Fail("CONTROL_REQUEST_INVALID");
            return text;
        }

        private static bool FixedEquals(byte[] left, byte[] right)
        {
            int difference = left.Length ^ right.Length;
            int maximum = Math.Max(left.Length, right.Length);
            for (int index = 0; index < maximum; index++)
            {
                byte a = index < left.Length ? left[index] : (byte)0;
                byte b = index < right.Length ? right[index] : (byte)0;
                difference |= a ^ b;
            }
            return difference == 0;
        }

        private static bool IsHex(string text, int length)
        {
            if (text == null || text.Length != length) return false;
            for (int index = 0; index < text.Length; index++)
            {
                char value = text[index];
                bool valid = (value >= '0' && value <= '9') || (value >= 'a' && value <= 'f') || (value >= 'A' && value <= 'F');
                if (!valid) return false;
            }
            return true;
        }

        private static string Hex(byte[] bytes)
        {
            StringBuilder output = new StringBuilder(bytes.Length * 2);
            for (int index = 0; index < bytes.Length; index++) output.Append(bytes[index].ToString("x2"));
            return output.ToString();
        }

        private static string SafeCode(string value)
        {
            if (String.IsNullOrEmpty(value)) return "LOCAL_CONTROL_FAILED";
            for (int index = 0; index < value.Length; index++)
            {
                char current = value[index];
                if (!(current == '_' || (current >= 'A' && current <= 'Z') || (current >= '0' && current <= '9'))) return "LOCAL_CONTROL_FAILED";
            }
            return value.Length <= 64 ? value : "LOCAL_CONTROL_FAILED";
        }

        private static void TryDelete(string file)
        {
            try { if (!String.IsNullOrEmpty(file) && File.Exists(file)) File.Delete(file); } catch { }
        }

        private static void TryDeleteDirectory(string directory)
        {
            try { if (!String.IsNullOrEmpty(directory) && Directory.Exists(directory) && Directory.GetFileSystemEntries(directory).Length == 0) Directory.Delete(directory); } catch { }
        }

        private static void Fail(string code) { throw new InvalidOperationException(code); }

        private static void Win32Fail(string code)
        {
            throw new InvalidOperationException(code + "_WIN32_" + Marshal.GetLastWin32Error().ToString());
        }
    }
}
