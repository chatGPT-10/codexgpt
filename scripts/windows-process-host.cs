// Production Phase 4 native host; promoted unchanged from the Gate N proof.
using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

namespace CodexGPT.Phase4
{
    public static class ProcessHost
    {
        private const ushort ProtocolVersion = 1;
        private const ushort HeaderLength = 64;
        private const int TagOffset = 48;
        private const int TagLength = 16;
        private const int MaxPayload = 65536;
        private const int MaxHelloPayload = 4096;
        private const int MaxFramedInputBytes = 131072;
        private const int MaxFramedOutputBytes = 16777216;
        private const int MaxArguments = 512;
        private const int MaxArgumentTotalBytes = 65536;
        private const int MaxOneShotTimeoutMs = 120000;
        private const ushort Hello = 0x01;
        private const ushort HelloAck = 0x02;
        private const ushort RequestJson = 0x10;
        private const ushort ResponseJson = 0x11;
        private const ushort EventJson = 0x12;
        private const ushort Output = 0x20;
        private const ushort Input = 0x21;
        private const ushort Credit = 0x22;
        private const ushort Cancel = 0x23;
        private const ushort Fatal = 0x7f;
        private const ushort FlagStderr = 0x0001;
        private const ushort FlagEof = 0x0002;

        private const uint StartfUseStdHandles = 0x00000100;
        private const uint ExtendedStartupInfoPresent = 0x00080000;
        private const uint CreateSuspended = 0x00000004;
        private const uint CreateUnicodeEnvironment = 0x00000400;
        private const uint CreateNoWindow = 0x08000000;
        private const uint HandleFlagInherit = 0x00000001;
        private const uint JobObjectLimitKillOnJobClose = 0x00002000;
        private const uint JobObjectLimitActiveProcess = 0x00000008;
        private const int JobObjectExtendedLimitInformation = 9;
        private static readonly IntPtr ProcThreadAttributeHandleList = new IntPtr(0x00020002);
        private static readonly IntPtr ProcThreadAttributeJobList = new IntPtr(0x0002000D);
        private static readonly IntPtr ProcThreadAttributePseudoConsole = new IntPtr(0x00020016);
        private const uint GenericRead = 0x80000000;
        private const uint FileShareRead = 0x00000001;
        private const uint OpenExisting = 3;
        private const uint FileAttributeNormal = 0x00000080;
        private const uint WaitObject0 = 0;
        private const uint WaitTimeout = 258;
        private const uint Infinite = 0xffffffff;
        private const int StdInputHandle = -10;
        private const int StdOutputHandle = -11;
        private const int StdErrorHandle = -12;
        private const int ErrorBrokenPipe = 109;
        private const int ErrorNoData = 232;

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer
        {
            MaxJsonLength = MaxPayload,
            RecursionLimit = 16
        };

        private static class HostLifetime
        {
            private static readonly ConcurrentDictionary<long, IntPtr> ActiveJobs = new ConcurrentDictionary<long, IntPtr>();
            private static long nextJobId;
            private static int watchdogStarted;

            public static long RegisterJob(IntPtr job)
            {
                long id = Interlocked.Increment(ref nextJobId);
                if (!ActiveJobs.TryAdd(id, job)) throw new InvalidOperationException("JOB_REGISTRATION_FAILED");
                return id;
            }

            public static void ReleaseJob(long id, ref IntPtr job)
            {
                IntPtr registered;
                ActiveJobs.TryRemove(id, out registered);
                if (job != IntPtr.Zero && job != new IntPtr(-1)) CloseHandle(job);
                job = IntPtr.Zero;
            }

            public static void StartInputWatchdog()
            {
                if (Interlocked.Exchange(ref watchdogStarted, 1) != 0) return;
                IntPtr input = GetStdHandle(StdInputHandle);
                Thread watchdog = new Thread(() =>
                {
                    while (true)
                    {
                        uint available;
                        bool readable = PeekNamedPipe(input, IntPtr.Zero, 0, IntPtr.Zero, out available, IntPtr.Zero);
                        if (!readable)
                        {
                            int error = Marshal.GetLastWin32Error();
                            if (error == ErrorBrokenPipe || error == ErrorNoData)
                            {
                                foreach (KeyValuePair<long, IntPtr> entry in ActiveJobs)
                                {
                                    IntPtr handle;
                                    if (ActiveJobs.TryRemove(entry.Key, out handle) && handle != IntPtr.Zero && handle != new IntPtr(-1))
                                        CloseHandle(handle);
                                }
                                Environment.Exit(0);
                            }
                        }
                        Thread.Sleep(50);
                    }
                });
                watchdog.IsBackground = true;
                watchdog.Name = "CXP4 stdin lifetime watchdog";
                watchdog.Start();
            }
        }

        private sealed class Frame
        {
            public ushort Kind;
            public ushort Flags;
            public uint Sequence;
            public byte[] RequestId;
            public ulong ProcessGeneration;
            public byte[] Payload;
            public int FrameBytes;
        }

        private sealed class BoundedReadResult
        {
            public byte[] Bytes;
            public long TotalBytes;
            public long DroppedBytes;
            public bool Truncated;
        }

        private sealed class ProcessRunResult
        {
            public bool Ok;
            public string Code;
            public uint ExitCode;
            public bool TimedOut;
            public int ProcessId;
            public bool JobAssignedAtCreation;
            public bool ExactHandleList;
            public bool ImageIdentityVerified;
            public uint VolumeSerial;
            public ulong FileIndex;
            public uint NumberOfLinks;
            public byte[] Stdout;
            public byte[] Stderr;
            public long StdoutTotalBytes;
            public long StderrTotalBytes;
            public long StdoutDroppedBytes;
            public long StderrDroppedBytes;
            public bool StdoutTruncated;
            public bool StderrTruncated;
            public long ElapsedMilliseconds;
        }

        private sealed class FramedRunOutcome
        {
            public ProcessRunResult Run;
            public string ErrorCode;
        }

        private sealed class PersistentProcessState
        {
            public readonly object Sync = new object();
            public string Handle;
            public IntPtr ProcessHandle;
            public IntPtr JobHandle;
            public long JobRegistration;
            public FileStream Stdin;
            public MemoryStream Stdout = new MemoryStream();
            public MemoryStream Stderr = new MemoryStream();
            public ManualResetEventSlim Changed = new ManualResetEventSlim(false);
            public bool Running = true;
            public uint ExitCode;
            public string Reason = "running";
            public bool StdinClosed;
            public bool StdoutClosed;
            public bool StderrClosed;
        }

        private static readonly ConcurrentDictionary<string, PersistentProcessState> PersistentProcesses = new ConcurrentDictionary<string, PersistentProcessState>();

        public static void Run()
        {
            Stream input = Console.OpenStandardInput();
            Stream output = Console.OpenStandardOutput();
            byte[] nodeToHostKey = ReadExact(input, 32, false);
            byte[] hostToNodeKey = ReadExact(input, 32, false);
            if (nodeToHostKey == null || hostToNodeKey == null) return;
            HostLifetime.StartInputWatchdog();
            uint incomingSequence = 1;
            uint outgoingSequence = 1;
            try
            {
                while (true)
                {
                    Frame frame = ReadFrame(input, nodeToHostKey, incomingSequence);
                    if (frame == null) return;
                    incomingSequence++;
                    if (incomingSequence == 0) throw new InvalidDataException("SEQUENCE_EXHAUSTED");
                    if (frame.Kind == Hello)
                    {
                        Dictionary<string, object> hello = ParseStrictObject(frame.Payload);
                        RequireExactKeys(hello, new string[] { "schemaVersion", "protocolVersion", "nonce" });
                        if (ToInt(hello["schemaVersion"], "schemaVersion") != 1 || ToInt(hello["protocolVersion"], "protocolVersion") != 1)
                            throw new InvalidDataException("HELLO_VERSION_MISMATCH");
                        string nonce = RequireSafeNonce(hello["nonce"]);
                        Dictionary<string, object> response = new Dictionary<string, object>();
                        response["schemaVersion"] = 1;
                        response["protocolVersion"] = 1;
                        response["nonce"] = nonce;
                        response["host"] = "windows-powershell-csharp-spike";
                        response["rawStandardStreams"] = true;
                        WriteJsonFrame(output, hostToNodeKey, ref outgoingSequence, HelloAck, frame.RequestId, 0, response);
                        continue;
                    }
                    if (frame.Kind != RequestJson) throw new InvalidDataException("DIRECTION_INVALID_FRAME");
                    Dictionary<string, object> request = ParseStrictObject(frame.Payload);
                    bool framed = request.ContainsKey("stream");
                    RequireExactKeys(request, framed
                        ? new string[] { "schemaVersion", "operation", "input", "stream" }
                        : new string[] { "schemaVersion", "operation", "input" });
                    if (ToInt(request["schemaVersion"], "schemaVersion") != 1) throw new InvalidDataException("REQUEST_VERSION_MISMATCH");
                    string operation = RequireBoundedString(request["operation"], "operation", 1, 80);
                    Dictionary<string, object> requestInput = AsObject(request["input"], "input");
                    if (framed)
                    {
                        HandleFramedRequest(
                            input,
                            output,
                            nodeToHostKey,
                            hostToNodeKey,
                            ref incomingSequence,
                            ref outgoingSequence,
                            frame,
                            operation,
                            requestInput,
                            AsObject(request["stream"], "stream"));
                        continue;
                    }
                    Dictionary<string, object> result;
                    try
                    {
                        result = Dispatch(operation, requestInput);
                    }
                    catch (Exception error)
                    {
                        result = ErrorResult(SafeErrorCode(error));
                    }
                    WriteJsonFrame(output, hostToNodeKey, ref outgoingSequence, ResponseJson, frame.RequestId, 0, result);
                }
            }
            catch (Exception error)
            {
                try
                {
                    Dictionary<string, object> fatal = new Dictionary<string, object>();
                    fatal["schemaVersion"] = 1;
                    fatal["code"] = SafeErrorCode(error);
                    WriteJsonFrame(output, hostToNodeKey, ref outgoingSequence, Fatal, new byte[16], 0, fatal);
                }
                catch { }
            }
        }

        private static void HandleFramedRequest(
            Stream input,
            Stream output,
            byte[] nodeToHostKey,
            byte[] hostToNodeKey,
            ref uint incomingSequence,
            ref uint outgoingSequence,
            Frame requestFrame,
            string operation,
            Dictionary<string, object> requestInput,
            Dictionary<string, object> stream)
        {
            RequireExactKeys(stream, new string[] { "version", "inputBytes", "output" });
            if (ToInt(stream["version"], "version") != 1) throw new InvalidDataException("STREAM_VERSION_MISMATCH");
            int inputLength = ToBoundedInt(stream["inputBytes"], "inputBytes", 0, MaxFramedInputBytes);
            if (RequireBoundedString(stream["output"], "output", 6, 6) != "frames") throw new InvalidDataException("STREAM_OUTPUT_INVALID");
            WriteCredit(output, hostToNodeKey, ref outgoingSequence, requestFrame.RequestId, requestFrame.FrameBytes);
            byte[] streamedInput = ReadFramedInput(
                input,
                output,
                nodeToHostKey,
                hostToNodeKey,
                ref incomingSequence,
                ref outgoingSequence,
                requestFrame.RequestId,
                inputLength);
            using (ManualResetEvent cancel = new ManualResetEvent(false))
            {
                Task<FramedRunOutcome> work = Task.Run(() =>
                {
                    try
                    {
                        return new FramedRunOutcome { Run = RunFramedOperation(operation, requestInput, streamedInput, cancel) };
                    }
                    catch (Exception error)
                    {
                        return new FramedRunOutcome { ErrorCode = SafeErrorCode(error) };
                    }
                });
                Task<Frame> controlRead = StartFrameRead(input, nodeToHostKey, incomingSequence);
                bool canceled = false;
                while (!work.Wait(10))
                {
                    if (!controlRead.IsCompleted) continue;
                    Frame control = CompleteControlRead(controlRead, ref incomingSequence);
                    if (HandleInterleavedRequest(control, output, hostToNodeKey, ref outgoingSequence, requestFrame.RequestId))
                    {
                        controlRead = StartFrameRead(input, nodeToHostKey, incomingSequence);
                        continue;
                    }
                    ValidateCorrelatedControl(control, requestFrame.RequestId);
                    if (control.Kind != Cancel) throw new InvalidDataException("DIRECTION_INVALID_FRAME");
                    cancel.Set();
                    canceled = true;
                    break;
                }
                if (!canceled && controlRead.IsCompleted)
                {
                    Frame control = CompleteControlRead(controlRead, ref incomingSequence);
                    while (HandleInterleavedRequest(control, output, hostToNodeKey, ref outgoingSequence, requestFrame.RequestId))
                    {
                        controlRead = StartFrameRead(input, nodeToHostKey, incomingSequence);
                        if (!controlRead.IsCompleted)
                        {
                            control = null;
                            break;
                        }
                        control = CompleteControlRead(controlRead, ref incomingSequence);
                    }
                    if (control != null)
                    {
                        ValidateCorrelatedControl(control, requestFrame.RequestId);
                        if (control.Kind == Cancel)
                        {
                            cancel.Set();
                            canceled = true;
                        }
                        else throw new InvalidDataException("DIRECTION_INVALID_FRAME");
                    }
                }
                if (canceled)
                {
                    if (!work.Wait(10000)) throw new InvalidDataException("REQUEST_CANCEL_FAILED");
                    Dictionary<string, object> canceledResult = ErrorResult("REQUEST_CANCELLED");
                    canceledResult["streamTransport"] = "framed_v1";
                    WriteJsonFrame(output, hostToNodeKey, ref outgoingSequence, ResponseJson, requestFrame.RequestId, 0, canceledResult);
                    return;
                }
                FramedRunOutcome outcome = work.Result;
                byte[] stdout = outcome.Run == null ? new byte[0] : outcome.Run.Stdout;
                byte[] stderr = outcome.Run == null ? new byte[0] : outcome.Run.Stderr;
                if (!WriteFramedOutput(
                    input,
                    output,
                    nodeToHostKey,
                    hostToNodeKey,
                    ref incomingSequence,
                    ref outgoingSequence,
                    requestFrame.RequestId,
                    stdout,
                    stderr,
                    cancel,
                    ref controlRead))
                {
                    Dictionary<string, object> canceledResult = ErrorResult("REQUEST_CANCELLED");
                    canceledResult["streamTransport"] = "framed_v1";
                    WriteJsonFrame(output, hostToNodeKey, ref outgoingSequence, ResponseJson, requestFrame.RequestId, 0, canceledResult);
                    return;
                }
                Dictionary<string, object> result = outcome.Run == null
                    ? ErrorResult(outcome.ErrorCode ?? "HOST_REQUEST_FAILED")
                    : RunResult(outcome.Run, false);
                result["streamTransport"] = "framed_v1";
                if (outcome.Run == null)
                {
                    result["stdoutTotalBytes"] = 0L;
                    result["stderrTotalBytes"] = 0L;
                    result["stdoutDroppedBytes"] = 0L;
                    result["stderrDroppedBytes"] = 0L;
                    result["stdoutTruncated"] = false;
                    result["stderrTruncated"] = false;
                }
                WriteJsonFrame(output, hostToNodeKey, ref outgoingSequence, ResponseJson, requestFrame.RequestId, 0, result);
            }
        }

        private static byte[] ReadFramedInput(
            Stream input,
            Stream output,
            byte[] nodeToHostKey,
            byte[] hostToNodeKey,
            ref uint incomingSequence,
            ref uint outgoingSequence,
            byte[] requestId,
            int expectedLength)
        {
            using (MemoryStream collected = new MemoryStream(expectedLength))
            {
                bool eof = false;
                while (!eof)
                {
                    Frame frame = ReadFrame(input, nodeToHostKey, incomingSequence);
                    if (frame == null) throw new EndOfStreamException("TRUNCATED_INPUT");
                    IncrementSequence(ref incomingSequence);
                    if (frame.Kind != Input || frame.ProcessGeneration != 0 || !RequestIdsEqual(frame.RequestId, requestId)) {
                        throw new InvalidDataException("DIRECTION_INVALID_FRAME");
                    }
                    if (collected.Length + frame.Payload.Length > expectedLength) throw new InvalidDataException("INPUT_LENGTH_MISMATCH");
                    if (frame.Payload.Length > 0) collected.Write(frame.Payload, 0, frame.Payload.Length);
                    eof = (frame.Flags & FlagEof) != 0;
                    if (eof && collected.Length != expectedLength) throw new InvalidDataException("INPUT_LENGTH_MISMATCH");
                    WriteCredit(output, hostToNodeKey, ref outgoingSequence, requestId, frame.FrameBytes);
                }
                return collected.ToArray();
            }
        }

        private static ProcessRunResult RunFramedOperation(
            string operation,
            Dictionary<string, object> input,
            byte[] streamedInput,
            EventWaitHandle cancel)
        {
            if (operation == "run")
            {
                RequireExactKeys(input, new string[] { "executable", "arguments", "cwd", "environment", "timeoutMs", "stdoutLimitBytes", "stderrLimitBytes" });
                return RunOwnedProcess(
                    RequireAbsoluteFile(input["executable"]),
                    AsStringArray(input["arguments"], "arguments", MaxArguments, 8192),
                    RequireAbsoluteDirectory(input["cwd"]),
                    AsEnvironment(input["environment"]),
                    streamedInput,
                    ToBoundedInt(input["timeoutMs"], "timeoutMs", 1, MaxOneShotTimeoutMs),
                    ToBoundedInt(input["stdoutLimitBytes"], "stdoutLimitBytes", 1, MaxFramedOutputBytes),
                    ToBoundedInt(input["stderrLimitBytes"], "stderrLimitBytes", 1, MaxFramedOutputBytes),
                    cancel);
            }
            if (operation == "run_powershell")
            {
                RequireExactKeys(input, new string[] { "executable", "cwd", "environment", "timeoutMs", "stdoutLimitBytes", "stderrLimitBytes" });
                string script;
                try { script = new UTF8Encoding(false, true).GetString(streamedInput); }
                catch { throw new InvalidDataException("INVALID_SCRIPT_UTF8"); }
                string encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(PowerShellBootstrap()));
                return RunOwnedProcess(
                    RequireAbsoluteFile(input["executable"]),
                    new string[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded },
                    RequireAbsoluteDirectory(input["cwd"]),
                    AsEnvironment(input["environment"]),
                    Encoding.UTF8.GetBytes(script),
                    ToBoundedInt(input["timeoutMs"], "timeoutMs", 1, MaxOneShotTimeoutMs),
                    ToBoundedInt(input["stdoutLimitBytes"], "stdoutLimitBytes", 1, MaxFramedOutputBytes),
                    ToBoundedInt(input["stderrLimitBytes"], "stderrLimitBytes", 1, MaxFramedOutputBytes),
                    cancel);
            }
            throw new InvalidDataException("STREAM_OPERATION_UNSUPPORTED");
        }

        private static bool WriteFramedOutput(
            Stream input,
            Stream output,
            byte[] nodeToHostKey,
            byte[] hostToNodeKey,
            ref uint incomingSequence,
            ref uint outgoingSequence,
            byte[] requestId,
            byte[] stdout,
            byte[] stderr,
            EventWaitHandle cancel,
            ref Task<Frame> controlRead)
        {
            int remainingFrames = OutputFrameCount(stdout) + OutputFrameCount(stderr);
            byte[][] streams = new byte[][] { stdout, stderr };
            for (int streamIndex = 0; streamIndex < streams.Length; streamIndex++)
            {
                byte[] bytes = streams[streamIndex] ?? new byte[0];
                int offset = 0;
                bool sent = false;
                while (!sent || offset < bytes.Length)
                {
                    int count = Math.Min(MaxPayload, bytes.Length - offset);
                    byte[] payload = new byte[count];
                    if (count > 0) Buffer.BlockCopy(bytes, offset, payload, 0, count);
                    offset += count;
                    sent = true;
                    bool eof = offset == bytes.Length;
                    ushort flags = (ushort)(streamIndex == 1 ? FlagStderr : 0);
                    if (eof) flags = (ushort)(flags | FlagEof);
                    WriteFrame(output, hostToNodeKey, outgoingSequence, Output, flags, requestId, 0, payload);
                    IncrementSequence(ref outgoingSequence);
                    remainingFrames--;
                    Frame control = CompleteControlRead(controlRead, ref incomingSequence);
                    while (HandleInterleavedRequest(control, output, hostToNodeKey, ref outgoingSequence, requestId))
                    {
                        controlRead = StartFrameRead(input, nodeToHostKey, incomingSequence);
                        control = CompleteControlRead(controlRead, ref incomingSequence);
                    }
                    ValidateCorrelatedControl(control, requestId);
                    if (control.Kind == Cancel)
                    {
                        cancel.Set();
                        return false;
                    }
                    if (control.Kind != Credit || ReadCredit(control.Payload) != HeaderLength + payload.Length) {
                        throw new InvalidDataException("INVALID_CREDIT");
                    }
                    if (remainingFrames > 0) controlRead = StartFrameRead(input, nodeToHostKey, incomingSequence);
                }
            }
            return true;
        }

        private static int OutputFrameCount(byte[] bytes)
        {
            return bytes == null || bytes.Length == 0 ? 1 : (bytes.Length + MaxPayload - 1) / MaxPayload;
        }

        private static Task<Frame> StartFrameRead(Stream input, byte[] key, uint expectedSequence)
        {
            return Task.Run(() => ReadFrame(input, key, expectedSequence));
        }

        private static Frame CompleteControlRead(Task<Frame> read, ref uint incomingSequence)
        {
            Frame frame = read.Result;
            if (frame == null) throw new EndOfStreamException("TRUNCATED_CONTROL");
            IncrementSequence(ref incomingSequence);
            return frame;
        }

        private static void ValidateCorrelatedControl(Frame frame, byte[] requestId)
        {
            if (frame.ProcessGeneration != 0 || !RequestIdsEqual(frame.RequestId, requestId)) throw new InvalidDataException("CONTROL_CORRELATION_INVALID");
        }

        private static bool HandleInterleavedRequest(
            Frame frame,
            Stream output,
            byte[] hostToNodeKey,
            ref uint outgoingSequence,
            byte[] activeRequestId)
        {
            if (frame.Kind != RequestJson || RequestIdsEqual(frame.RequestId, activeRequestId)) return false;
            Dictionary<string, object> request = ParseStrictObject(frame.Payload);
            RequireExactKeys(request, new string[] { "schemaVersion", "operation", "input" });
            if (ToInt(request["schemaVersion"], "schemaVersion") != 1) throw new InvalidDataException("REQUEST_VERSION_MISMATCH");
            string operation = RequireBoundedString(request["operation"], "operation", 1, 80);
            Dictionary<string, object> requestInput = AsObject(request["input"], "input");
            Dictionary<string, object> result;
            try { result = Dispatch(operation, requestInput); }
            catch (Exception error) { result = ErrorResult(SafeErrorCode(error)); }
            WriteJsonFrame(output, hostToNodeKey, ref outgoingSequence, ResponseJson, frame.RequestId, 0, result);
            return true;
        }

        private static bool RequestIdsEqual(byte[] left, byte[] right)
        {
            return left != null && right != null && left.Length == 16 && right.Length == 16 && FixedEquals(left, 0, right, 0, 16);
        }

        private static void WriteCredit(Stream output, byte[] key, ref uint sequence, byte[] requestId, int bytes)
        {
            if (bytes < 1) throw new InvalidDataException("INVALID_CREDIT");
            byte[] payload = BitConverter.GetBytes((ulong)bytes);
            WriteFrame(output, key, sequence, Credit, 0, requestId, 0, payload);
            IncrementSequence(ref sequence);
        }

        private static long ReadCredit(byte[] payload)
        {
            if (payload == null || payload.Length != 8) throw new InvalidDataException("INVALID_CREDIT_LENGTH");
            ulong value = BitConverter.ToUInt64(payload, 0);
            if (value == 0 || value > Int64.MaxValue) throw new InvalidDataException("INVALID_CREDIT");
            return (long)value;
        }

        private static void IncrementSequence(ref uint sequence)
        {
            sequence++;
            if (sequence == 0) throw new InvalidDataException("SEQUENCE_EXHAUSTED");
        }

        private static Dictionary<string, object> Dispatch(string operation, Dictionary<string, object> input)
        {
            if (operation == "capabilities")
            {
                RequireExactKeys(input, new string[0]);
                bool parentInJob;
                if (!IsProcessInJob(GetCurrentProcess(), IntPtr.Zero, out parentInJob)) ThrowLastWin32("IS_PROCESS_IN_JOB_FAILED");
                Dictionary<string, object> response = SuccessResult();
                response["platform"] = "win32";
                response["architecture"] = Environment.Is64BitProcess ? "x64" : "x86";
                response["jobListAttribute"] = true;
                response["handleListAttribute"] = true;
                response["killOnJobClose"] = true;
                response["nativeMonotonicDeadline"] = true;
                response["conPtyApiPresent"] = HasProc("kernel32.dll", "CreatePseudoConsole") && HasProc("kernel32.dll", "ResizePseudoConsole") && HasProc("kernel32.dll", "ClosePseudoConsole");
                response["parentInJob"] = parentInJob;
                response["processTreeControl"] = "job_object_members_only";
                response["brokerEscapeResistance"] = "none";
                response["persistentHostChanges"] = false;
                return response;
            }
            if (operation == "run") return RunOperation(input, false);
            if (operation == "run_powershell") return RunOperation(input, true);
            if (operation == "start_persistent") return StartPersistent(input);
            if (operation == "start_conpty_worker") return StartConPtyWorker(input);
            if (operation == "poll_persistent") return PollPersistent(input);
            if (operation == "write_persistent") return WritePersistent(input);
            if (operation == "interrupt_persistent") return InterruptPersistent(input);
            if (operation == "terminate_persistent") return TerminatePersistent(input);
            if (operation == "conpty_probe") return RunConPtyProbe(input, false);
            if (operation == "conpty_close_hang_probe") return RunConPtyProbe(input, true);
            throw new InvalidDataException("UNKNOWN_OPERATION");
        }

        private static Dictionary<string, object> RunOperation(Dictionary<string, object> input, bool powerShell)
        {
            ProcessRunResult run = powerShell ? RunPowerShell(input) : RunExecutable(input);
            return RunResult(run, true);
        }

        private static Dictionary<string, object> RunResult(ProcessRunResult run, bool includeBase64)
        {
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["schemaVersion"] = 1;
            result["ok"] = run.Ok;
            result["code"] = run.Code;
            result["exitCode"] = (long)run.ExitCode;
            result["timedOut"] = run.TimedOut;
            result["processId"] = run.ProcessId;
            result["jobAssignedAtCreation"] = run.JobAssignedAtCreation;
            result["exactHandleList"] = run.ExactHandleList;
            result["imageIdentityVerified"] = run.ImageIdentityVerified;
            result["volumeSerial"] = (long)run.VolumeSerial;
            result["fileIndex"] = run.FileIndex.ToString();
            result["numberOfLinks"] = (long)run.NumberOfLinks;
            if (includeBase64)
            {
                result["stdoutBase64"] = Convert.ToBase64String(run.Stdout ?? new byte[0]);
                result["stderrBase64"] = Convert.ToBase64String(run.Stderr ?? new byte[0]);
            }
            result["stdoutTotalBytes"] = run.StdoutTotalBytes;
            result["stderrTotalBytes"] = run.StderrTotalBytes;
            result["stdoutDroppedBytes"] = run.StdoutDroppedBytes;
            result["stderrDroppedBytes"] = run.StderrDroppedBytes;
            result["stdoutTruncated"] = run.StdoutTruncated;
            result["stderrTruncated"] = run.StderrTruncated;
            result["elapsedMilliseconds"] = run.ElapsedMilliseconds;
            result["processTreeControl"] = "job_object_members_only";
            result["brokerEscapeResistance"] = "none";
            return result;
        }

        private static ProcessRunResult RunPowerShell(Dictionary<string, object> input)
        {
            RequireExactKeys(input, new string[] { "executable", "script", "cwd", "environment", "timeoutMs", "stdoutLimitBytes", "stderrLimitBytes" });
            string script = RequireBoundedString(input["script"], "script", 0, 65536);
            string executable = RequireAbsoluteFile(input["executable"]);
            string bootstrap = "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::InputEncoding=New-Object Text.UTF8Encoding($false);[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$t=[Console]::In.ReadToEnd();$global:LASTEXITCODE=$null;$f=';$__cxp4_ok=$?;$__cxp4_native=$LASTEXITCODE;if($null -ne $__cxp4_native){exit $__cxp4_native};if($__cxp4_ok){exit 0}else{exit 1}';try{$s=[ScriptBlock]::Create($t+[Environment]::NewLine+$f);. $s;exit 0}catch{exit 1}";
            string encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(bootstrap));
            string[] arguments = new string[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded };
            return RunOwnedProcess(
                executable,
                arguments,
                RequireAbsoluteDirectory(input["cwd"]),
                AsEnvironment(input["environment"]),
                Encoding.UTF8.GetBytes(script),
                ToBoundedInt(input["timeoutMs"], "timeoutMs", 1, MaxOneShotTimeoutMs),
                ToBoundedInt(input["stdoutLimitBytes"], "stdoutLimitBytes", 1, 1048576),
                ToBoundedInt(input["stderrLimitBytes"], "stderrLimitBytes", 1, 1048576));
        }

        private static string PowerShellBootstrap()
        {
            return "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::InputEncoding=New-Object Text.UTF8Encoding($false);[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$t=[Console]::In.ReadToEnd();$global:LASTEXITCODE=$null;$f=';$__cxp4_ok=$?;$__cxp4_native=$LASTEXITCODE;if($null -ne $__cxp4_native){exit $__cxp4_native};if($__cxp4_ok){exit 0}else{exit 1}';try{$s=[ScriptBlock]::Create($t+[Environment]::NewLine+$f);. $s;exit 0}catch{exit 1}";
        }

        private static string NewPersistentHandle()
        {
            byte[] bytes = new byte[16];
            using (RandomNumberGenerator random = RandomNumberGenerator.Create()) random.GetBytes(bytes);
            StringBuilder value = new StringBuilder("native_");
            for (int index = 0; index < bytes.Length; index++) value.Append(bytes[index].ToString("x2"));
            return value.ToString();
        }

        private static Dictionary<string, object> StartPersistent(Dictionary<string, object> input)
        {
            string operation = RequireBoundedString(input["commandOperation"], "commandOperation", 1, 32);
            string executable;
            string[] arguments;
            byte[] initialInput;
            if (operation == "run_powershell")
            {
                RequireExactKeys(input, new string[] { "commandOperation", "executable", "script", "cwd", "environment", "timeoutMs", "stdoutLimitBytes", "stderrLimitBytes", "lifetimeMs" });
                string script = RequireBoundedString(input["script"], "script", 0, 65536);
                executable = RequireAbsoluteFile(input["executable"]);
                string encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(PowerShellBootstrap()));
                arguments = new string[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded };
                initialInput = Encoding.UTF8.GetBytes(script);
            }
            else if (operation == "run")
            {
                RequireExactKeys(input, new string[] { "commandOperation", "executable", "arguments", "cwd", "environment", "stdinBase64", "timeoutMs", "stdoutLimitBytes", "stderrLimitBytes", "lifetimeMs" });
                executable = RequireAbsoluteFile(input["executable"]);
                arguments = AsStringArray(input["arguments"], "arguments", 512, 8192);
                try { initialInput = Convert.FromBase64String(RequireBoundedString(input["stdinBase64"], "stdinBase64", 0, 131072)); }
                catch { throw new InvalidDataException("INVALID_STDIN_BASE64"); }
            }
            else throw new InvalidDataException("PERSISTENT_COMMAND_INVALID");
            PersistentProcessState state = StartPersistentOwnedProcess(executable, arguments, RequireAbsoluteDirectory(input["cwd"]), AsEnvironment(input["environment"]), initialInput, operation == "run_powershell", ToBoundedInt(input["lifetimeMs"], "lifetimeMs", 1, 7200000));
            if (!PersistentProcesses.TryAdd(state.Handle, state)) { ClosePersistentState(state, "host_collision"); throw new InvalidDataException("PERSISTENT_HANDLE_COLLISION"); }
            Dictionary<string, object> result = SuccessResult();
            result["processHandle"] = state.Handle;
            result["jobAssignedAtCreation"] = true;
            result["exactHandleList"] = true;
            result["processTreeControl"] = "job_object_members_only";
            result["brokerEscapeResistance"] = "none";
            return result;
        }

        private static Dictionary<string, object> StartConPtyWorker(Dictionary<string, object> input)
        {
            RequireExactKeys(input, new string[] { "workerInputBase64", "lifetimeMs" });
            if (!HasProc("kernel32.dll", "CreatePseudoConsole") || !HasProc("kernel32.dll", "ResizePseudoConsole") || !HasProc("kernel32.dll", "ClosePseudoConsole"))
                return ErrorResult("CONPTY_UNAVAILABLE");
            byte[] workerInput;
            try { workerInput = Convert.FromBase64String(RequireBoundedString(input["workerInputBase64"], "workerInputBase64", 1, 131072)); }
            catch { throw new InvalidDataException("INVALID_INPUT_BASE64"); }
            string systemRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? "C:\\Windows";
            string executable = Path.Combine(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            string workerScript = Path.Combine(Directory.GetCurrentDirectory(), "scripts", "windows-conpty-worker.ps1");
            if (!File.Exists(workerScript)) return ErrorResult("CONPTY_WORKER_MISSING");
            string[] arguments = new string[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", workerScript, "-Persistent" };
            PersistentProcessState state = StartPersistentOwnedProcess(
                executable,
                arguments,
                Directory.GetCurrentDirectory(),
                AsEnvironment(new Dictionary<string, object>()),
                workerInput,
                false,
                ToBoundedInt(input["lifetimeMs"], "lifetimeMs", 1, 7200000));
            if (!PersistentProcesses.TryAdd(state.Handle, state)) { ClosePersistentState(state, "host_collision"); throw new InvalidDataException("PERSISTENT_HANDLE_COLLISION"); }
            Dictionary<string, object> result = SuccessResult();
            result["processHandle"] = state.Handle;
            result["jobAssignedAtCreation"] = true;
            result["exactHandleList"] = true;
            result["processTreeControl"] = "job_object_members_only";
            result["brokerEscapeResistance"] = "none";
            result["isolatedConPtyWorker"] = true;
            return result;
        }

        private static PersistentProcessState RequirePersistent(Dictionary<string, object> input, string[] keys)
        {
            RequireExactKeys(input, keys);
            string handle = RequireBoundedString(input["processHandle"], "processHandle", 39, 39);
            PersistentProcessState state;
            if (!PersistentProcesses.TryGetValue(handle, out state)) throw new InvalidDataException("PROCESS_NOT_FOUND");
            return state;
        }

        private static Dictionary<string, object> PollPersistent(Dictionary<string, object> input)
        {
            PersistentProcessState state = RequirePersistent(input, new string[] { "processHandle", "waitMs" });
            int wait = ToBoundedInt(input["waitMs"], "waitMs", 0, 1000);
            if (wait > 0) state.Changed.Wait(wait);
            byte[] stdout;
            byte[] stderr;
            bool running;
            uint exitCode;
            string reason;
            lock (state.Sync)
            {
                stdout = state.Stdout.ToArray(); state.Stdout.SetLength(0);
                stderr = state.Stderr.ToArray(); state.Stderr.SetLength(0);
                running = state.Running || !state.StdoutClosed || !state.StderrClosed; exitCode = state.ExitCode; reason = state.Reason; state.Changed.Reset();
            }
            Dictionary<string, object> result = SuccessResult();
            result["running"] = running;
            result["exitCode"] = running ? null : (object)(long)exitCode;
            result["reason"] = reason;
            result["stdoutBase64"] = Convert.ToBase64String(stdout);
            result["stderrBase64"] = Convert.ToBase64String(stderr);
            if (!running)
            {
                PersistentProcessState removed;
                if (PersistentProcesses.TryRemove(state.Handle, out removed)) DisposePersistentState(removed);
            }
            return result;
        }

        private static Dictionary<string, object> WritePersistent(Dictionary<string, object> input)
        {
            PersistentProcessState state = RequirePersistent(input, new string[] { "processHandle", "dataBase64", "close" });
            byte[] data;
            try { data = Convert.FromBase64String(RequireBoundedString(input["dataBase64"], "dataBase64", 0, 131072)); }
            catch { throw new InvalidDataException("INVALID_INPUT_BASE64"); }
            if (!(input["close"] is bool)) throw new InvalidDataException("INVALID_close");
            bool close = (bool)input["close"];
            lock (state.Sync)
            {
                if (!state.Running || state.StdinClosed) throw new InvalidDataException("PROCESS_NOT_FOUND");
                if (data.Length > 0) { state.Stdin.Write(data, 0, data.Length); state.Stdin.Flush(); }
                if (close) { state.Stdin.Dispose(); state.StdinClosed = true; }
            }
            return SuccessResult();
        }

        private static Dictionary<string, object> InterruptPersistent(Dictionary<string, object> input)
        {
            PersistentProcessState state = RequirePersistent(input, new string[] { "processHandle" });
            Dictionary<string, object> result = SuccessResult();
            result["delivered"] = false;
            result["code"] = "INTERRUPT_UNSUPPORTED";
            return result;
        }

        private static Dictionary<string, object> TerminatePersistent(Dictionary<string, object> input)
        {
            PersistentProcessState state = RequirePersistent(input, new string[] { "processHandle" });
            ClosePersistentState(state, "user_terminated");
            PersistentProcessState removed;
            if (PersistentProcesses.TryRemove(state.Handle, out removed)) DisposePersistentState(removed);
            Dictionary<string, object> result = SuccessResult(); result["changed"] = true; return result;
        }

        private static void AppendPersistent(PersistentProcessState state, bool stderr, byte[] buffer, int count)
        {
            lock (state.Sync)
            {
                MemoryStream target = stderr ? state.Stderr : state.Stdout;
                if (target.Length + count > 1048576) { ClosePersistentState(state, "output_limit_exceeded"); return; }
                target.Write(buffer, 0, count); state.Changed.Set();
            }
        }

        private static void ReadPersistent(PersistentProcessState state, Stream stream, bool stderr)
        {
            using (stream)
            {
                byte[] buffer = new byte[8192];
                while (true) { int count; try { count = stream.Read(buffer, 0, buffer.Length); } catch { break; } if (count <= 0) break; AppendPersistent(state, stderr, buffer, count); }
            }
            lock (state.Sync)
            {
                if (stderr) state.StderrClosed = true; else state.StdoutClosed = true;
                state.Changed.Set();
            }
        }

        private static void ClosePersistentState(PersistentProcessState state, string reason)
        {
            lock (state.Sync)
            {
                if (!state.Running) return;
                state.Reason = reason;
                HostLifetime.ReleaseJob(state.JobRegistration, ref state.JobHandle);
                WaitForSingleObject(state.ProcessHandle, 10000);
                uint exitCode; if (GetExitCodeProcess(state.ProcessHandle, out exitCode)) state.ExitCode = exitCode;
                state.Running = false;
                try { if (!state.StdinClosed) state.Stdin.Dispose(); } catch { }
                state.StdinClosed = true; state.Changed.Set();
            }
        }

        private static void DisposePersistentState(PersistentProcessState state)
        {
            ClosePersistentState(state, state.Reason == "running" ? "cleanup" : state.Reason);
            if (state.ProcessHandle != IntPtr.Zero) { CloseHandle(state.ProcessHandle); state.ProcessHandle = IntPtr.Zero; }
            try { state.Stdin.Dispose(); } catch { }
            state.Changed.Dispose(); state.Stdout.Dispose(); state.Stderr.Dispose();
        }

        private static ProcessRunResult RunExecutable(Dictionary<string, object> input)
        {
            RequireExactKeys(input, new string[] { "executable", "arguments", "cwd", "environment", "stdinBase64", "timeoutMs", "stdoutLimitBytes", "stderrLimitBytes" });
            string executable = RequireAbsoluteFile(input["executable"]);
            string[] arguments = AsStringArray(input["arguments"], "arguments", MaxArguments, 8192);
            byte[] stdin;
            try { stdin = Convert.FromBase64String(RequireBoundedString(input["stdinBase64"], "stdinBase64", 0, 131072)); }
            catch { throw new InvalidDataException("INVALID_STDIN_BASE64"); }
            return RunOwnedProcess(
                executable,
                arguments,
                RequireAbsoluteDirectory(input["cwd"]),
                AsEnvironment(input["environment"]),
                stdin,
                ToBoundedInt(input["timeoutMs"], "timeoutMs", 1, MaxOneShotTimeoutMs),
                ToBoundedInt(input["stdoutLimitBytes"], "stdoutLimitBytes", 1, 1048576),
                ToBoundedInt(input["stderrLimitBytes"], "stderrLimitBytes", 1, 1048576));
        }

        private static Dictionary<string, object> RunConPtyProbe(Dictionary<string, object> input, bool simulateCloseHang)
        {
            RequireExactKeys(input, new string[] { "nodeExecutable", "probeScript" });
            string nodeExecutable = RequireAbsoluteFile(input["nodeExecutable"]);
            string probeScript = RequireAbsoluteFile(input["probeScript"]);
            string expectedProbe = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "scripts", "windows-conpty-probe-child.mjs"));
            if (!String.Equals(probeScript, expectedProbe, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("CONPTY_PROBE_IDENTITY_MISMATCH");
            string systemRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? "C:\\Windows";
            string executable = Path.Combine(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            string workerScript = Path.Combine(Directory.GetCurrentDirectory(), "scripts", "windows-conpty-worker.ps1");
            if (!File.Exists(workerScript)) return ErrorResult("CONPTY_WORKER_MISSING");
            string[] workerArguments = simulateCloseHang
                ? new string[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", workerScript, "-SimulateCloseHang", "-NodeExecutable", nodeExecutable, "-ProbeScript", probeScript }
                : new string[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", workerScript, "-NodeExecutable", nodeExecutable, "-ProbeScript", probeScript };
            ProcessRunResult worker = RunOwnedProcess(
                executable,
                workerArguments,
                Directory.GetCurrentDirectory(),
                AsEnvironment(new Dictionary<string, object>()),
                new byte[0],
                60000,
                32768,
                4096);
            if (simulateCloseHang && !worker.Ok && worker.StdoutTotalBytes == 0)
            {
                Dictionary<string, object> fatalClose = ErrorResult("HOST_FATAL_CONPTY_CLOSE");
                fatalClose["workerExitCode"] = (long)worker.ExitCode;
                fatalClose["workerTimedOut"] = worker.TimedOut;
                fatalClose["workerJobAssignedAtCreation"] = worker.JobAssignedAtCreation;
                fatalClose["workerExactHandleList"] = worker.ExactHandleList;
                fatalClose["workerImageIdentityVerified"] = worker.ImageIdentityVerified;
                fatalClose["workerElapsedMilliseconds"] = worker.ElapsedMilliseconds;
                return fatalClose;
            }
            Dictionary<string, object> result;
            try { result = ParseStrictObject(worker.Stdout ?? new byte[0]); }
            catch
            {
                Dictionary<string, object> invalid = ErrorResult("CONPTY_WORKER_INVALID_RESPONSE");
                invalid["workerStdoutBytes"] = worker.StdoutTotalBytes;
                invalid["workerStderrBytes"] = worker.StderrTotalBytes;
                return invalid;
            }
            if (!worker.Ok)
            {
                Dictionary<string, object> failed = ErrorResult("CONPTY_WORKER_FAILED");
                failed["workerCode"] = result.ContainsKey("code") ? Convert.ToString(result["code"]) : "CONPTY_WORKER_ERROR";
                failed["workerExitCode"] = (long)worker.ExitCode;
                failed["workerTimedOut"] = worker.TimedOut;
                failed["workerJobAssignedAtCreation"] = worker.JobAssignedAtCreation;
                failed["workerExactHandleList"] = worker.ExactHandleList;
                failed["workerImageIdentityVerified"] = worker.ImageIdentityVerified;
                if (result.ContainsKey("conPtyCreated")) failed["conPtyCreated"] = result["conPtyCreated"];
                if (result.ContainsKey("resized")) failed["resized"] = result["resized"];
                if (result.ContainsKey("etxDelivered")) failed["etxDelivered"] = result["etxDelivered"];
                if (result.ContainsKey("outputContainsReady")) failed["outputContainsReady"] = result["outputContainsReady"];
                if (result.ContainsKey("outputContainsInputAck")) failed["outputContainsInputAck"] = result["outputContainsInputAck"];
                if (result.ContainsKey("outputContainsEtxAck")) failed["outputContainsEtxAck"] = result["outputContainsEtxAck"];
                if (result.ContainsKey("exitCode")) failed["exitCode"] = result["exitCode"];
                if (result.ContainsKey("timedOut")) failed["timedOut"] = result["timedOut"];
                if (result.ContainsKey("workerInOwnedJob")) failed["workerInOwnedJob"] = result["workerInOwnedJob"];
                if (result.ContainsKey("targetInInheritedJobAtCreation")) failed["targetInInheritedJobAtCreation"] = result["targetInInheritedJobAtCreation"];
                if (result.ContainsKey("closeDurationMs")) failed["closeDurationMs"] = result["closeDurationMs"];
                if (result.ContainsKey("closeDeadlineMs")) failed["closeDeadlineMs"] = result["closeDeadlineMs"];
                return failed;
            }
            result["workerJobAssignedAtCreation"] = worker.JobAssignedAtCreation;
            result["workerExactHandleList"] = worker.ExactHandleList;
            result["workerImageIdentityVerified"] = worker.ImageIdentityVerified;
            result["workerVolumeSerial"] = (long)worker.VolumeSerial;
            result["workerFileIndex"] = worker.FileIndex.ToString();
            result["workerElapsedMilliseconds"] = worker.ElapsedMilliseconds;
            result["jobOwnershipMode"] = "job_list_worker_inheritance_before_resume";
            return result;
        }

        public static void RunConPtyWorker(bool simulateCloseHang, string nodeExecutable, string probeScript)
        {
            Dictionary<string, object> result;
            try { result = RunConPtyWorkerCore(simulateCloseHang, nodeExecutable, probeScript); }
            catch (Exception error) { result = ErrorResult(SafeErrorCode(error)); }
            Console.Out.WriteLine(Json.Serialize(result));
            Console.Out.Flush();
            Environment.ExitCode = result.ContainsKey("ok") && Convert.ToBoolean(result["ok"]) ? 0 : 1;
        }

        private static readonly object ConPtyWorkerOutputSync = new object();

        private static void EmitConPtyWorkerEvent(Dictionary<string, object> value)
        {
            lock (ConPtyWorkerOutputSync)
            {
                Console.Out.WriteLine(Json.Serialize(value));
                Console.Out.Flush();
            }
        }

        private static void EmitConPtyWorkerResponse(string requestId, bool ok, string code)
        {
            Dictionary<string, object> response = new Dictionary<string, object>();
            response["schemaVersion"] = 1;
            response["type"] = "response";
            response["requestId"] = requestId;
            response["ok"] = ok;
            response["code"] = code;
            EmitConPtyWorkerEvent(response);
        }

        public static void RunConPtyPersistentWorker()
        {
            try
            {
                RunConPtyPersistentWorkerCore();
                Environment.ExitCode = 0;
            }
            catch (Exception error)
            {
                Dictionary<string, object> failed = new Dictionary<string, object>();
                failed["schemaVersion"] = 1;
                failed["type"] = "exit";
                failed["exitCode"] = null;
                failed["reason"] = "worker_failed";
                failed["code"] = SafeErrorCode(error);
                EmitConPtyWorkerEvent(failed);
                Environment.ExitCode = 1;
            }
        }

        private static void RunConPtyPersistentWorkerCore()
        {
            if (!HasProc("kernel32.dll", "CreatePseudoConsole") || !HasProc("kernel32.dll", "ResizePseudoConsole") || !HasProc("kernel32.dll", "ClosePseudoConsole"))
                throw new InvalidDataException("CONPTY_UNAVAILABLE");
            StreamReader protocolInput = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false), false, 4096, true);
            string firstLine = protocolInput.ReadLine();
            if (String.IsNullOrEmpty(firstLine) || Encoding.UTF8.GetByteCount(firstLine) > 131072) throw new InvalidDataException("CONPTY_WORKER_START_INVALID");
            Dictionary<string, object> start = ParseStrictObject(Encoding.UTF8.GetBytes(firstLine));
            RequireExactKeys(start, new string[] { "schemaVersion", "operation", "executable", "arguments", "cwd", "environment", "initialInputBase64", "columns", "rows", "controlPipe", "controlKey" });
            if (ToInt(start["schemaVersion"], "schemaVersion") != 1 || RequireBoundedString(start["operation"], "operation", 5, 5) != "start")
                throw new InvalidDataException("CONPTY_WORKER_START_INVALID");
            string executable = RequireAbsoluteFile(start["executable"]);
            string[] arguments = AsStringArray(start["arguments"], "arguments", 512, 8192);
            string cwd = RequireAbsoluteDirectory(start["cwd"]);
            SortedDictionary<string, string> environment = AsEnvironment(start["environment"]);
            byte[] initialInput;
            try { initialInput = Convert.FromBase64String(RequireBoundedString(start["initialInputBase64"], "initialInputBase64", 0, 131072)); }
            catch { throw new InvalidDataException("INVALID_INPUT_BASE64"); }
            short columns = checked((short)ToBoundedInt(start["columns"], "columns", 1, 500));
            short rows = checked((short)ToBoundedInt(start["rows"], "rows", 1, 500));
            string controlPipeName = RequireSafeNonce(start["controlPipe"]);
            string controlKey = RequireSafeNonce(start["controlKey"]);

            IntPtr pseudoConsole = IntPtr.Zero;
            SafeFileHandle inputRead = null;
            SafeFileHandle inputWrite = null;
            SafeFileHandle outputRead = null;
            SafeFileHandle outputWrite = null;
            IntPtr attributeList = IntPtr.Zero;
            IntPtr environmentPointer = IntPtr.Zero;
            PROCESS_INFORMATION processInfo = new PROCESS_INFORMATION();
            FileStream terminalInput = null;
            Task outputTask = null;
            BlockingCollection<string> commands = new BlockingCollection<string>(64);
            NamedPipeServerStream controlPipe = null;
            try
            {
                bool workerInJob;
                if (!IsProcessInJob(GetCurrentProcess(), IntPtr.Zero, out workerInJob)) ThrowLastWin32("CONPTY_WORKER_JOB_QUERY_FAILED");
                if (!workerInJob) throw new InvalidDataException("CONPTY_WORKER_NOT_JOB_OWNED");
                controlPipe = new NamedPipeServerStream(controlPipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 4096, 4096);
                Dictionary<string, object> controlReady = new Dictionary<string, object>();
                controlReady["schemaVersion"] = 1; controlReady["type"] = "control_ready"; controlReady["controlPipe"] = controlPipeName;
                EmitConPtyWorkerEvent(controlReady);
                controlPipe.WaitForConnection();
                if (!CreateConPtyPipe(out inputRead, out inputWrite, IntPtr.Zero, 0)) ThrowLastWin32("CONPTY_INPUT_PIPE_FAILED");
                if (!CreateConPtyPipe(out outputRead, out outputWrite, IntPtr.Zero, 0)) ThrowLastWin32("CONPTY_OUTPUT_PIPE_FAILED");
                COORD initialSize = new COORD { X = columns, Y = rows };
                int createResult = CreatePseudoConsoleSafe(initialSize, inputRead, outputWrite, 0, out pseudoConsole);
                if (createResult < 0 || pseudoConsole == IntPtr.Zero) throw new InvalidDataException("CONPTY_CREATE_FAILED");

                IntPtr attributeBytes = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeBytes);
                if (attributeBytes == IntPtr.Zero) ThrowLastWin32("CONPTY_ATTRIBUTE_SIZE_FAILED");
                attributeList = Marshal.AllocHGlobal(attributeBytes);
                if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeBytes)) ThrowLastWin32("CONPTY_ATTRIBUTE_INIT_FAILED");
                if (!UpdateProcThreadAttribute(attributeList, 0, ProcThreadAttributePseudoConsole, pseudoConsole, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero))
                    ThrowLastWin32("CONPTY_ATTRIBUTE_FAILED");

                STARTUPINFOEX startup = new STARTUPINFOEX();
                startup.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                startup.lpAttributeList = attributeList;
                SECURITY_ATTRIBUTES processAttributes = new SECURITY_ATTRIBUTES(); processAttributes.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                SECURITY_ATTRIBUTES threadAttributes = new SECURITY_ATTRIBUTES(); threadAttributes.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                byte[] environmentBytes = Encoding.Unicode.GetBytes(BuildEnvironmentBlock(environment));
                environmentPointer = Marshal.AllocHGlobal(environmentBytes.Length);
                Marshal.Copy(environmentBytes, 0, environmentPointer, environmentBytes.Length);
                string commandLine = BuildCommandLine(executable, arguments);
                IntPtr savedStdInput = GetStdHandle(StdInputHandle);
                IntPtr savedStdOutput = GetStdHandle(StdOutputHandle);
                IntPtr savedStdError = GetStdHandle(StdErrorHandle);
                bool created;
                if (!SetStdHandle(StdInputHandle, IntPtr.Zero) ||
                    !SetStdHandle(StdOutputHandle, IntPtr.Zero) ||
                    !SetStdHandle(StdErrorHandle, IntPtr.Zero))
                    ThrowLastWin32("CONPTY_STANDARD_HANDLE_DETACH_FAILED");
                try
                {
                    created = CreateConPtyProcessW(executable, commandLine, ref processAttributes, ref threadAttributes, false, ExtendedStartupInfoPresent | CreateUnicodeEnvironment, environmentPointer, cwd, ref startup, out processInfo);
                }
                finally
                {
                    SetStdHandle(StdInputHandle, savedStdInput);
                    SetStdHandle(StdOutputHandle, savedStdOutput);
                    SetStdHandle(StdErrorHandle, savedStdError);
                }
                if (!created) ThrowLastWin32("CONPTY_CREATE_PROCESS_FAILED");
                CloseIfValid(ref processInfo.hThread);
                inputRead.Dispose(); inputRead = null;
                outputWrite.Dispose(); outputWrite = null;

                bool targetInJob;
                if (!IsProcessInJob(processInfo.hProcess, IntPtr.Zero, out targetInJob)) ThrowLastWin32("CONPTY_JOB_MEMBERSHIP_QUERY_FAILED");
                if (!targetInJob) throw new InvalidDataException("CONPTY_TARGET_NOT_JOB_OWNED_BEFORE_RESUME");
                StringBuilder imagePath = new StringBuilder(32768); int imagePathLength = imagePath.Capacity;
                if (!QueryFullProcessImageNameW(processInfo.hProcess, 0, imagePath, ref imagePathLength)) ThrowLastWin32("IMAGE_QUERY_FAILED");
                if (!String.Equals(Path.GetFullPath(imagePath.ToString()), Path.GetFullPath(executable), StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("IMAGE_IDENTITY_MISMATCH");

                terminalInput = new FileStream(inputWrite, FileAccess.Write, 4096, false); inputWrite = null;
                FileStream terminalOutput = new FileStream(outputRead, FileAccess.Read, 4096, false); outputRead = null;
                outputTask = Task.Run(() =>
                {
                    using (terminalOutput)
                    {
                        byte[] buffer = new byte[8192];
                        while (true)
                        {
                            int count;
                            try { count = terminalOutput.Read(buffer, 0, buffer.Length); } catch { break; }
                            if (count <= 0) break;
                            byte[] chunk = new byte[count]; Buffer.BlockCopy(buffer, 0, chunk, 0, count);
                            Dictionary<string, object> output = new Dictionary<string, object>();
                            output["schemaVersion"] = 1; output["type"] = "output"; output["dataBase64"] = Convert.ToBase64String(chunk);
                            EmitConPtyWorkerEvent(output);
                        }
                    }
                });
                Task.Run(() =>
                {
                    StreamReader controlReader = new StreamReader(controlPipe, new UTF8Encoding(false), false, 4096, true);
                    try
                    {
                        string line;
                        while ((line = controlReader.ReadLine()) != null) commands.Add(line);
                    }
                    finally { commands.CompleteAdding(); }
                });

                Dictionary<string, object> ready = new Dictionary<string, object>();
                ready["schemaVersion"] = 1; ready["type"] = "ready"; ready["targetInInheritedJobAtCreation"] = true; ready["imageIdentityVerified"] = true;
                EmitConPtyWorkerEvent(ready);
                if (initialInput.Length > 0) { terminalInput.Write(initialInput, 0, initialInput.Length); terminalInput.Flush(); }

                string reason = "natural_exit";
                while (WaitForSingleObject(processInfo.hProcess, 0) == WaitTimeout)
                {
                    string line;
                    if (!commands.TryTake(out line, 100))
                    {
                        if (commands.IsCompleted) { reason = "transport_closed"; TerminateProcess(processInfo.hProcess, 0xC000013A); break; }
                        continue;
                    }
                    Dictionary<string, object> command = ParseStrictObject(Encoding.UTF8.GetBytes(line));
                    string operation = RequireBoundedString(command["operation"], "operation", 1, 32);
                    string requestId = RequireSafeNonce(command["requestId"]);
                    if (RequireSafeNonce(command["controlKey"]) != controlKey) throw new InvalidDataException("CONPTY_CONTROL_AUTH_FAILED");
                    if (operation == "input")
                    {
                        RequireExactKeys(command, new string[] { "schemaVersion", "operation", "requestId", "controlKey", "dataBase64", "close" });
                        byte[] data;
                        try { data = Convert.FromBase64String(RequireBoundedString(command["dataBase64"], "dataBase64", 0, 131072)); }
                        catch { throw new InvalidDataException("INVALID_INPUT_BASE64"); }
                        if (!(command["close"] is bool)) throw new InvalidDataException("INVALID_close");
                        if (terminalInput == null) { EmitConPtyWorkerResponse(requestId, false, "PROCESS_NOT_FOUND"); continue; }
                        if (data.Length > 0) { terminalInput.Write(data, 0, data.Length); terminalInput.Flush(); }
                        if ((bool)command["close"]) { terminalInput.Dispose(); terminalInput = null; }
                        EmitConPtyWorkerResponse(requestId, true, "INPUT_DELIVERED");
                    }
                    else if (operation == "resize")
                    {
                        RequireExactKeys(command, new string[] { "schemaVersion", "operation", "requestId", "controlKey", "columns", "rows" });
                        COORD size = new COORD {
                            X = checked((short)ToBoundedInt(command["columns"], "columns", 1, 500)),
                            Y = checked((short)ToBoundedInt(command["rows"], "rows", 1, 500))
                        };
                        if (ResizePseudoConsole(pseudoConsole, size) < 0) throw new InvalidDataException("CONPTY_RESIZE_FAILED");
                        EmitConPtyWorkerResponse(requestId, true, "RESIZED");
                    }
                    else if (operation == "interrupt")
                    {
                        RequireExactKeys(command, new string[] { "schemaVersion", "operation", "requestId", "controlKey" });
                        if (terminalInput == null) { EmitConPtyWorkerResponse(requestId, false, "PROCESS_NOT_FOUND"); continue; }
                        terminalInput.WriteByte(0x03); terminalInput.Flush();
                        EmitConPtyWorkerResponse(requestId, true, "INTERRUPT_DELIVERED");
                    }
                    else
                    {
                        RequireExactKeys(command, new string[] { "schemaVersion", "operation", "requestId", "controlKey" });
                        EmitConPtyWorkerResponse(requestId, false, "UNKNOWN_OPERATION");
                    }
                }
                if (WaitForSingleObject(processInfo.hProcess, 10000) != WaitObject0) throw new InvalidDataException("CONPTY_PROCESS_TERMINATE_TIMEOUT");
                uint exitCode;
                if (!GetExitCodeProcess(processInfo.hProcess, out exitCode)) ThrowLastWin32("CONPTY_EXIT_CODE_FAILED");
                if (terminalInput != null) { terminalInput.Dispose(); terminalInput = null; }
                ClosePseudoConsoleWithDeadline(ref pseudoConsole, false);
                if (outputTask != null && !outputTask.Wait(10000)) throw new InvalidDataException("CONPTY_OUTPUT_DRAIN_TIMEOUT");
                Dictionary<string, object> exited = new Dictionary<string, object>();
                exited["schemaVersion"] = 1; exited["type"] = "exit"; exited["exitCode"] = (long)exitCode; exited["reason"] = reason;
                EmitConPtyWorkerEvent(exited);
            }
            finally
            {
                if (terminalInput != null) terminalInput.Dispose();
                if (processInfo.hProcess != IntPtr.Zero && WaitForSingleObject(processInfo.hProcess, 0) == WaitTimeout) TerminateProcess(processInfo.hProcess, 0xC000013A);
                CloseIfValid(ref processInfo.hThread); CloseIfValid(ref processInfo.hProcess);
                if (inputRead != null) inputRead.Dispose(); if (inputWrite != null) inputWrite.Dispose();
                if (outputRead != null) outputRead.Dispose(); if (outputWrite != null) outputWrite.Dispose();
                if (pseudoConsole != IntPtr.Zero) ClosePseudoConsoleWithDeadline(ref pseudoConsole, false);
                if (attributeList != IntPtr.Zero) { DeleteProcThreadAttributeList(attributeList); Marshal.FreeHGlobal(attributeList); }
                if (environmentPointer != IntPtr.Zero) Marshal.FreeHGlobal(environmentPointer);
                if (controlPipe != null) controlPipe.Dispose();
                commands.Dispose();
            }
        }

        private static Dictionary<string, object> RunConPtyWorkerCore(bool simulateCloseHang, string requestedNodeExecutable, string requestedProbeScript)
        {
            if (!HasProc("kernel32.dll", "CreatePseudoConsole") || !HasProc("kernel32.dll", "ResizePseudoConsole") || !HasProc("kernel32.dll", "ClosePseudoConsole"))
                return ErrorResult("CONPTY_UNAVAILABLE");
            string executable = Path.GetFullPath(requestedNodeExecutable ?? String.Empty);
            string probeScript = Path.GetFullPath(requestedProbeScript ?? String.Empty);
            string expectedProbe = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "scripts", "windows-conpty-probe-child.mjs"));
            if (!File.Exists(executable) || !File.Exists(probeScript) || !String.Equals(probeScript, expectedProbe, StringComparison.OrdinalIgnoreCase))
                return ErrorResult("CONPTY_PROBE_IDENTITY_MISMATCH");

            IntPtr pseudoConsole = IntPtr.Zero;
            SafeFileHandle inputRead = null;
            SafeFileHandle inputWrite = null;
            SafeFileHandle outputRead = null;
            SafeFileHandle outputWrite = null;
            IntPtr attributeList = IntPtr.Zero;
            PROCESS_INFORMATION processInfo = new PROCESS_INFORMATION();
            Task<BoundedReadResult> outputTask = null;
            Stopwatch totalTimer = Stopwatch.StartNew();
            long closeDuration = 0;
            bool resized = false;
            bool etxDelivered = false;
            try
            {
                bool workerInJob;
                if (!IsProcessInJob(GetCurrentProcess(), IntPtr.Zero, out workerInJob)) ThrowLastWin32("CONPTY_WORKER_JOB_QUERY_FAILED");
                if (!workerInJob) throw new InvalidDataException("CONPTY_WORKER_NOT_JOB_OWNED");

                if (!CreateConPtyPipe(out inputRead, out inputWrite, IntPtr.Zero, 0)) ThrowLastWin32("CONPTY_INPUT_PIPE_FAILED");
                if (!CreateConPtyPipe(out outputRead, out outputWrite, IntPtr.Zero, 0)) ThrowLastWin32("CONPTY_OUTPUT_PIPE_FAILED");

                COORD initialSize = new COORD { X = 80, Y = 25 };
                int createResult = CreatePseudoConsoleSafe(initialSize, inputRead, outputWrite, 0, out pseudoConsole);
                if (createResult < 0) throw new InvalidDataException("CONPTY_CREATE_FAILED");
                if (pseudoConsole == IntPtr.Zero) throw new InvalidDataException("CONPTY_ZERO_HANDLE");

                IntPtr attributeBytes = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeBytes);
                if (attributeBytes == IntPtr.Zero) ThrowLastWin32("CONPTY_ATTRIBUTE_SIZE_FAILED");
                attributeList = Marshal.AllocHGlobal(attributeBytes);
                if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeBytes)) ThrowLastWin32("CONPTY_ATTRIBUTE_INIT_FAILED");
                if (!UpdateProcThreadAttribute(attributeList, 0, ProcThreadAttributePseudoConsole, pseudoConsole, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero))
                    ThrowLastWin32("CONPTY_ATTRIBUTE_FAILED");

                STARTUPINFOEX startup = new STARTUPINFOEX();
                startup.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                startup.lpAttributeList = attributeList;
                string commandLine = BuildCommandLine(executable, new string[] { probeScript });
                SECURITY_ATTRIBUTES processAttributes = new SECURITY_ATTRIBUTES();
                processAttributes.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                SECURITY_ATTRIBUTES threadAttributes = new SECURITY_ATTRIBUTES();
                threadAttributes.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                IntPtr savedStdInput = GetStdHandle(StdInputHandle);
                IntPtr savedStdOutput = GetStdHandle(StdOutputHandle);
                IntPtr savedStdError = GetStdHandle(StdErrorHandle);
                bool created;
                if (!SetStdHandle(StdInputHandle, IntPtr.Zero) ||
                    !SetStdHandle(StdOutputHandle, IntPtr.Zero) ||
                    !SetStdHandle(StdErrorHandle, IntPtr.Zero))
                    ThrowLastWin32("CONPTY_STANDARD_HANDLE_DETACH_FAILED");
                try
                {
                    created = CreateConPtyProcessW(
                        null,
                        commandLine,
                        ref processAttributes,
                        ref threadAttributes,
                        false,
                        ExtendedStartupInfoPresent,
                        IntPtr.Zero,
                        null,
                        ref startup,
                        out processInfo);
                }
                finally
                {
                    SetStdHandle(StdInputHandle, savedStdInput);
                    SetStdHandle(StdOutputHandle, savedStdOutput);
                    SetStdHandle(StdErrorHandle, savedStdError);
                }
                if (!created) ThrowLastWin32("CONPTY_CREATE_PROCESS_FAILED");
                inputRead.Dispose();
                inputRead = null;
                outputWrite.Dispose();
                outputWrite = null;

                bool targetInInheritedJob;
                if (!IsProcessInJob(processInfo.hProcess, IntPtr.Zero, out targetInInheritedJob)) ThrowLastWin32("CONPTY_JOB_MEMBERSHIP_QUERY_FAILED");
                if (!targetInInheritedJob) throw new InvalidDataException("CONPTY_TARGET_NOT_JOB_OWNED_BEFORE_RESUME");

                FileStream outputStream = new FileStream(outputRead, FileAccess.Read, 4096, false);
                outputRead = null;
                outputTask = Task.Run(() => ReadBounded(outputStream, 16384));
                CloseIfValid(ref processInfo.hThread);
                using (FileStream inputStream = new FileStream(inputWrite, FileAccess.Write, 4096, false))
                {
                    inputWrite = null;
                    byte[] interactiveCommands = Encoding.UTF8.GetBytes("CXP4_INPUT\r\n");
                    inputStream.Write(interactiveCommands, 0, interactiveCommands.Length);
                    inputStream.Flush();
                    Thread.Sleep(500);
                    COORD resizedSize = new COORD { X = 100, Y = 30 };
                    int resizeResult = ResizePseudoConsole(pseudoConsole, resizedSize);
                    if (resizeResult < 0) throw new InvalidDataException("CONPTY_RESIZE_FAILED");
                    resized = true;
                    inputStream.WriteByte(0x03);
                    inputStream.Flush();
                    etxDelivered = true;
                    Thread.Sleep(1000);
                    byte[] exitCommand = Encoding.UTF8.GetBytes("CXP4_EXIT\r\n");
                    inputStream.Write(exitCommand, 0, exitCommand.Length);
                    inputStream.Flush();
                }

                uint wait = WaitForSingleObject(processInfo.hProcess, 10000);
                bool timedOut = wait == WaitTimeout;
                if (timedOut)
                {
                    if (!TerminateProcess(processInfo.hProcess, 0xC000013A)) ThrowLastWin32("CONPTY_PROCESS_TERMINATE_FAILED");
                    if (WaitForSingleObject(processInfo.hProcess, 10000) != WaitObject0) throw new InvalidDataException("CONPTY_PROCESS_TERMINATE_TIMEOUT");
                }
                else if (wait != WaitObject0) ThrowLastWin32("CONPTY_PROCESS_WAIT_FAILED");
                uint exitCode;
                if (!GetExitCodeProcess(processInfo.hProcess, out exitCode)) ThrowLastWin32("CONPTY_EXIT_CODE_FAILED");

                closeDuration = ClosePseudoConsoleWithDeadline(ref pseudoConsole, simulateCloseHang);
                if (!outputTask.Wait(10000)) throw new InvalidDataException("CONPTY_OUTPUT_DRAIN_TIMEOUT");
                BoundedReadResult output = outputTask.Result;
                string outputText = Encoding.UTF8.GetString(output.Bytes);
                bool outputContainsReady = outputText.IndexOf("CXP4_CONPTY_READY", StringComparison.Ordinal) >= 0;
                bool outputContainsInputAck = outputText.IndexOf("CXP4_INPUT_ACK", StringComparison.Ordinal) >= 0;
                bool outputContainsEtxAck = outputText.IndexOf("CXP4_ETX_ACK", StringComparison.Ordinal) >= 0;
                const uint StatusControlCExit = 0xC000013A;
                bool expectedExit = exitCode == 0 || exitCode == StatusControlCExit;
                bool evidenceOk = !timedOut && expectedExit && outputContainsReady && outputContainsInputAck && outputContainsEtxAck;
                totalTimer.Stop();
                Dictionary<string, object> result = evidenceOk ? SuccessResult() : ErrorResult(timedOut ? "CONPTY_PROCESS_TIMED_OUT" : "CONPTY_EVIDENCE_MISMATCH");
                if (evidenceOk) result["code"] = "CONPTY_PROBE_OK";
                result["conPtyCreated"] = true;
                result["resized"] = resized;
                result["etxDelivered"] = etxDelivered;
                result["outputContainsReady"] = outputContainsReady;
                result["outputContainsInputAck"] = outputContainsInputAck;
                result["outputContainsEtxAck"] = outputContainsEtxAck;
                result["outputBase64"] = Convert.ToBase64String(output.Bytes);
                result["outputTotalBytes"] = output.TotalBytes;
                result["outputDroppedBytes"] = output.DroppedBytes;
                result["outputTruncated"] = output.Truncated;
                result["exitCode"] = (long)exitCode;
                result["timedOut"] = timedOut;
                result["workerInOwnedJob"] = workerInJob;
                result["targetInInheritedJobAtCreation"] = targetInInheritedJob;
                result["targetCreatedSuspended"] = false;
                result["jobAssignedAtCreation"] = targetInInheritedJob;
                result["closeDurationMs"] = closeDuration;
                result["closeDeadlineMs"] = 5000;
                result["elapsedMilliseconds"] = totalTimer.ElapsedMilliseconds;
                return result;
            }
            finally
            {
                CloseIfValid(ref processInfo.hThread);
                CloseIfValid(ref processInfo.hProcess);
                if (inputRead != null) inputRead.Dispose();
                if (inputWrite != null) inputWrite.Dispose();
                if (outputRead != null) outputRead.Dispose();
                if (outputWrite != null) outputWrite.Dispose();
                if (pseudoConsole != IntPtr.Zero) ClosePseudoConsoleWithDeadline(ref pseudoConsole, false);
                if (attributeList != IntPtr.Zero)
                {
                    DeleteProcThreadAttributeList(attributeList);
                    Marshal.FreeHGlobal(attributeList);
                }
            }
        }

        private static long ClosePseudoConsoleWithDeadline(ref IntPtr pseudoConsole, bool simulateCloseHang)
        {
            IntPtr handle = pseudoConsole;
            pseudoConsole = IntPtr.Zero;
            if (handle == IntPtr.Zero) return 0;
            Stopwatch timer = Stopwatch.StartNew();
            Task closeTask = Task.Run(() =>
            {
                if (simulateCloseHang) Thread.Sleep(Timeout.Infinite);
                else ClosePseudoConsole(handle);
            });
            if (!closeTask.Wait(5000)) Environment.FailFast("HOST_FATAL_CONPTY_CLOSE");
            timer.Stop();
            return timer.ElapsedMilliseconds;
        }

        private static PersistentProcessState StartPersistentOwnedProcess(string executable, string[] arguments, string cwd, SortedDictionary<string, string> environment, byte[] initialInput, bool closeInitialInput, int lifetimeMs)
        {
            IntPtr executableHandle = IntPtr.Zero; IntPtr job = IntPtr.Zero; long jobRegistration = 0; IntPtr attributeList = IntPtr.Zero; IntPtr jobValue = IntPtr.Zero; IntPtr handleValues = IntPtr.Zero; IntPtr environmentPointer = IntPtr.Zero;
            IntPtr stdinRead = IntPtr.Zero; IntPtr stdinWrite = IntPtr.Zero; IntPtr stdoutRead = IntPtr.Zero; IntPtr stdoutWrite = IntPtr.Zero; IntPtr stderrRead = IntPtr.Zero; IntPtr stderrWrite = IntPtr.Zero; PROCESS_INFORMATION processInfo = new PROCESS_INFORMATION();
            bool transferred = false;
            try
            {
                executableHandle = CreateFileW(executable, GenericRead, FileShareRead, IntPtr.Zero, OpenExisting, FileAttributeNormal, IntPtr.Zero); if (executableHandle == new IntPtr(-1)) ThrowLastWin32("EXECUTABLE_OPEN_FAILED");
                SECURITY_ATTRIBUTES attributes = new SECURITY_ATTRIBUTES(); attributes.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); attributes.bInheritHandle = 1;
                if (!CreatePipe(out stdinRead, out stdinWrite, ref attributes, 0)) ThrowLastWin32("STDIN_PIPE_FAILED");
                if (!CreatePipe(out stdoutRead, out stdoutWrite, ref attributes, 0)) ThrowLastWin32("STDOUT_PIPE_FAILED");
                if (!CreatePipe(out stderrRead, out stderrWrite, ref attributes, 0)) ThrowLastWin32("STDERR_PIPE_FAILED");
                if (!SetHandleInformation(stdinWrite, HandleFlagInherit, 0) || !SetHandleInformation(stdoutRead, HandleFlagInherit, 0) || !SetHandleInformation(stderrRead, HandleFlagInherit, 0)) ThrowLastWin32("PIPE_INHERITANCE_FAILED");
                job = CreateJobObjectW(IntPtr.Zero, null); if (job == IntPtr.Zero) ThrowLastWin32("JOB_CREATE_FAILED");
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION(); limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose | JobObjectLimitActiveProcess; limits.BasicLimitInformation.ActiveProcessLimit = 64;
                int limitsSize = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION)); IntPtr limitsPointer = Marshal.AllocHGlobal(limitsSize);
                try { Marshal.StructureToPtr(limits, limitsPointer, false); if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, limitsPointer, (uint)limitsSize)) ThrowLastWin32("JOB_LIMIT_FAILED"); } finally { Marshal.FreeHGlobal(limitsPointer); }
                jobRegistration = HostLifetime.RegisterJob(job);
                IntPtr attributeBytes = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref attributeBytes); if (attributeBytes == IntPtr.Zero) ThrowLastWin32("ATTRIBUTE_SIZE_FAILED");
                attributeList = Marshal.AllocHGlobal(attributeBytes); if (!InitializeProcThreadAttributeList(attributeList, 2, 0, ref attributeBytes)) ThrowLastWin32("ATTRIBUTE_INIT_FAILED");
                jobValue = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobValue, job); if (!UpdateProcThreadAttribute(attributeList, 0, ProcThreadAttributeJobList, jobValue, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero)) ThrowLastWin32("JOB_LIST_ATTRIBUTE_FAILED");
                handleValues = Marshal.AllocHGlobal(IntPtr.Size * 3); Marshal.WriteIntPtr(handleValues, 0, stdinRead); Marshal.WriteIntPtr(handleValues, IntPtr.Size, stdoutWrite); Marshal.WriteIntPtr(handleValues, IntPtr.Size * 2, stderrWrite);
                if (!UpdateProcThreadAttribute(attributeList, 0, ProcThreadAttributeHandleList, handleValues, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero)) ThrowLastWin32("HANDLE_LIST_ATTRIBUTE_FAILED");
                STARTUPINFOEX startup = new STARTUPINFOEX(); startup.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.StartupInfo.dwFlags = unchecked((int)StartfUseStdHandles); startup.StartupInfo.hStdInput = stdinRead; startup.StartupInfo.hStdOutput = stdoutWrite; startup.StartupInfo.hStdError = stderrWrite; startup.lpAttributeList = attributeList;
                StringBuilder mutableCommandLine = new StringBuilder(BuildCommandLine(executable, arguments)); byte[] environmentBytes = Encoding.Unicode.GetBytes(BuildEnvironmentBlock(environment)); environmentPointer = Marshal.AllocHGlobal(environmentBytes.Length); Marshal.Copy(environmentBytes, 0, environmentPointer, environmentBytes.Length);
                if (!CreateProcessW(executable, mutableCommandLine, IntPtr.Zero, IntPtr.Zero, true, ExtendedStartupInfoPresent | CreateUnicodeEnvironment | CreateNoWindow, environmentPointer, cwd, ref startup, out processInfo)) ThrowLastWin32("CREATE_PROCESS_FAILED");
                CloseIfValid(ref stdinRead); CloseIfValid(ref stdoutWrite); CloseIfValid(ref stderrWrite); CloseIfValid(ref processInfo.hThread);
                bool inExactJob; if (!IsProcessInJob(processInfo.hProcess, job, out inExactJob)) ThrowLastWin32("JOB_MEMBERSHIP_QUERY_FAILED"); if (!inExactJob) throw new InvalidDataException("JOB_NOT_ASSIGNED_AT_CREATION");
                StringBuilder imagePath = new StringBuilder(32768); int imagePathLength = imagePath.Capacity; if (!QueryFullProcessImageNameW(processInfo.hProcess, 0, imagePath, ref imagePathLength)) ThrowLastWin32("IMAGE_QUERY_FAILED"); if (!String.Equals(Path.GetFullPath(imagePath.ToString()), Path.GetFullPath(executable), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("IMAGE_IDENTITY_MISMATCH");
                PersistentProcessState state = new PersistentProcessState(); state.Handle = NewPersistentHandle(); state.ProcessHandle = processInfo.hProcess; processInfo.hProcess = IntPtr.Zero; state.JobHandle = job; job = IntPtr.Zero; state.JobRegistration = jobRegistration; jobRegistration = 0;
                state.Stdin = new FileStream(new SafeFileHandle(stdinWrite, true), FileAccess.Write, 4096, false); stdinWrite = IntPtr.Zero;
                FileStream stdoutStream = new FileStream(new SafeFileHandle(stdoutRead, true), FileAccess.Read, 4096, false); stdoutRead = IntPtr.Zero; FileStream stderrStream = new FileStream(new SafeFileHandle(stderrRead, true), FileAccess.Read, 4096, false); stderrRead = IntPtr.Zero;
                if (initialInput.Length > 0) { state.Stdin.Write(initialInput, 0, initialInput.Length); state.Stdin.Flush(); }
                if (closeInitialInput) { state.Stdin.Dispose(); state.StdinClosed = true; }
                Task.Run(() => ReadPersistent(state, stdoutStream, false)); Task.Run(() => ReadPersistent(state, stderrStream, true));
                Task.Run(() =>
                {
                    uint wait = WaitForSingleObject(state.ProcessHandle, (uint)lifetimeMs);
                    if (wait == WaitTimeout) ClosePersistentState(state, "expired");
                    else if (wait == WaitObject0)
                    {
                        lock (state.Sync)
                        {
                            if (state.Running) { uint code; if (GetExitCodeProcess(state.ProcessHandle, out code)) state.ExitCode = code; state.Reason = "natural_exit"; state.Running = false; HostLifetime.ReleaseJob(state.JobRegistration, ref state.JobHandle); state.Changed.Set(); }
                        }
                    }
                    else ClosePersistentState(state, "host_wait_failed");
                });
                transferred = true; return state;
            }
            finally
            {
                CloseIfValid(ref processInfo.hThread); CloseIfValid(ref processInfo.hProcess); CloseIfValid(ref stdinRead); CloseIfValid(ref stdinWrite); CloseIfValid(ref stdoutRead); CloseIfValid(ref stdoutWrite); CloseIfValid(ref stderrRead); CloseIfValid(ref stderrWrite);
                if (!transferred) HostLifetime.ReleaseJob(jobRegistration, ref job);
                if (attributeList != IntPtr.Zero) { DeleteProcThreadAttributeList(attributeList); Marshal.FreeHGlobal(attributeList); }
                if (jobValue != IntPtr.Zero) Marshal.FreeHGlobal(jobValue); if (handleValues != IntPtr.Zero) Marshal.FreeHGlobal(handleValues); if (environmentPointer != IntPtr.Zero) Marshal.FreeHGlobal(environmentPointer); if (executableHandle != IntPtr.Zero && executableHandle != new IntPtr(-1)) CloseHandle(executableHandle);
            }
        }

        private static ProcessRunResult RunOwnedProcess(string executable, string[] arguments, string cwd, SortedDictionary<string, string> environment, byte[] stdinBytes, int timeoutMs, int stdoutLimit, int stderrLimit)
        {
            return RunOwnedProcess(executable, arguments, cwd, environment, stdinBytes, timeoutMs, stdoutLimit, stderrLimit, null);
        }

        private static ProcessRunResult RunOwnedProcess(string executable, string[] arguments, string cwd, SortedDictionary<string, string> environment, byte[] stdinBytes, int timeoutMs, int stdoutLimit, int stderrLimit, EventWaitHandle cancel)
        {
            Stopwatch timer = Stopwatch.StartNew();
            IntPtr executableHandle = IntPtr.Zero;
            IntPtr job = IntPtr.Zero;
            long jobRegistration = 0;
            IntPtr attributeList = IntPtr.Zero;
            IntPtr jobValue = IntPtr.Zero;
            IntPtr handleValues = IntPtr.Zero;
            IntPtr environmentPointer = IntPtr.Zero;
            IntPtr stdinRead = IntPtr.Zero;
            IntPtr stdinWrite = IntPtr.Zero;
            IntPtr stdoutRead = IntPtr.Zero;
            IntPtr stdoutWrite = IntPtr.Zero;
            IntPtr stderrRead = IntPtr.Zero;
            IntPtr stderrWrite = IntPtr.Zero;
            PROCESS_INFORMATION processInfo = new PROCESS_INFORMATION();
            Task<BoundedReadResult> stdoutTask = null;
            Task<BoundedReadResult> stderrTask = null;
            try
            {
                executableHandle = CreateFileW(executable, GenericRead, FileShareRead, IntPtr.Zero, OpenExisting, FileAttributeNormal, IntPtr.Zero);
                if (executableHandle == new IntPtr(-1)) ThrowLastWin32("EXECUTABLE_OPEN_FAILED");
                BY_HANDLE_FILE_INFORMATION fileInfo;
                if (!GetFileInformationByHandle(executableHandle, out fileInfo)) ThrowLastWin32("EXECUTABLE_IDENTITY_FAILED");

                SECURITY_ATTRIBUTES attributes = new SECURITY_ATTRIBUTES();
                attributes.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                attributes.bInheritHandle = 1;
                if (!CreatePipe(out stdinRead, out stdinWrite, ref attributes, 0)) ThrowLastWin32("STDIN_PIPE_FAILED");
                if (!CreatePipe(out stdoutRead, out stdoutWrite, ref attributes, 0)) ThrowLastWin32("STDOUT_PIPE_FAILED");
                if (!CreatePipe(out stderrRead, out stderrWrite, ref attributes, 0)) ThrowLastWin32("STDERR_PIPE_FAILED");
                if (!SetHandleInformation(stdinWrite, HandleFlagInherit, 0) || !SetHandleInformation(stdoutRead, HandleFlagInherit, 0) || !SetHandleInformation(stderrRead, HandleFlagInherit, 0))
                    ThrowLastWin32("PIPE_INHERITANCE_FAILED");

                job = CreateJobObjectW(IntPtr.Zero, null);
                if (job == IntPtr.Zero) ThrowLastWin32("JOB_CREATE_FAILED");
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose | JobObjectLimitActiveProcess;
                limits.BasicLimitInformation.ActiveProcessLimit = 64;
                int limitsSize = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr limitsPointer = Marshal.AllocHGlobal(limitsSize);
                try
                {
                    Marshal.StructureToPtr(limits, limitsPointer, false);
                    if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, limitsPointer, (uint)limitsSize)) ThrowLastWin32("JOB_LIMIT_FAILED");
                }
                finally { Marshal.FreeHGlobal(limitsPointer); }
                jobRegistration = HostLifetime.RegisterJob(job);

                IntPtr attributeBytes = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref attributeBytes);
                if (attributeBytes == IntPtr.Zero) ThrowLastWin32("ATTRIBUTE_SIZE_FAILED");
                attributeList = Marshal.AllocHGlobal(attributeBytes);
                if (!InitializeProcThreadAttributeList(attributeList, 2, 0, ref attributeBytes)) ThrowLastWin32("ATTRIBUTE_INIT_FAILED");
                jobValue = Marshal.AllocHGlobal(IntPtr.Size);
                Marshal.WriteIntPtr(jobValue, job);
                if (!UpdateProcThreadAttribute(attributeList, 0, ProcThreadAttributeJobList, jobValue, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero))
                    ThrowLastWin32("JOB_LIST_ATTRIBUTE_FAILED");
                handleValues = Marshal.AllocHGlobal(IntPtr.Size * 3);
                Marshal.WriteIntPtr(handleValues, 0, stdinRead);
                Marshal.WriteIntPtr(handleValues, IntPtr.Size, stdoutWrite);
                Marshal.WriteIntPtr(handleValues, IntPtr.Size * 2, stderrWrite);
                if (!UpdateProcThreadAttribute(attributeList, 0, ProcThreadAttributeHandleList, handleValues, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero))
                    ThrowLastWin32("HANDLE_LIST_ATTRIBUTE_FAILED");

                STARTUPINFOEX startup = new STARTUPINFOEX();
                startup.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                startup.StartupInfo.dwFlags = unchecked((int)StartfUseStdHandles);
                startup.StartupInfo.hStdInput = stdinRead;
                startup.StartupInfo.hStdOutput = stdoutWrite;
                startup.StartupInfo.hStdError = stderrWrite;
                startup.lpAttributeList = attributeList;
                string commandLine = BuildCommandLine(executable, arguments);
                StringBuilder mutableCommandLine = new StringBuilder(commandLine);
                string environmentBlock = BuildEnvironmentBlock(environment);
                byte[] environmentBytes = Encoding.Unicode.GetBytes(environmentBlock);
                environmentPointer = Marshal.AllocHGlobal(environmentBytes.Length);
                Marshal.Copy(environmentBytes, 0, environmentPointer, environmentBytes.Length);
                bool created = CreateProcessW(
                    executable,
                    mutableCommandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    true,
                    ExtendedStartupInfoPresent | CreateUnicodeEnvironment | CreateNoWindow,
                    environmentPointer,
                    cwd,
                    ref startup,
                    out processInfo);
                if (!created) ThrowLastWin32("CREATE_PROCESS_FAILED");

                CloseIfValid(ref stdinRead);
                CloseIfValid(ref stdoutWrite);
                CloseIfValid(ref stderrWrite);

                bool inExactJob;
                if (!IsProcessInJob(processInfo.hProcess, job, out inExactJob)) ThrowLastWin32("JOB_MEMBERSHIP_QUERY_FAILED");
                if (!inExactJob) throw new InvalidDataException("JOB_NOT_ASSIGNED_AT_CREATION");
                StringBuilder imagePath = new StringBuilder(32768);
                int imagePathLength = imagePath.Capacity;
                if (!QueryFullProcessImageNameW(processInfo.hProcess, 0, imagePath, ref imagePathLength)) ThrowLastWin32("IMAGE_QUERY_FAILED");
                string actualImage = Path.GetFullPath(imagePath.ToString());
                string expectedImage = Path.GetFullPath(executable);
                if (!String.Equals(actualImage, expectedImage, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("IMAGE_IDENTITY_MISMATCH");

                FileStream stdoutStream = new FileStream(new SafeFileHandle(stdoutRead, true), FileAccess.Read, 4096, false);
                stdoutRead = IntPtr.Zero;
                FileStream stderrStream = new FileStream(new SafeFileHandle(stderrRead, true), FileAccess.Read, 4096, false);
                stderrRead = IntPtr.Zero;
                stdoutTask = Task.Run(() => ReadBounded(stdoutStream, stdoutLimit));
                stderrTask = Task.Run(() => ReadBounded(stderrStream, stderrLimit));

                using (FileStream stdinStream = new FileStream(new SafeFileHandle(stdinWrite, true), FileAccess.Write, 4096, false))
                {
                    stdinWrite = IntPtr.Zero;
                    if (stdinBytes.Length > 0) stdinStream.Write(stdinBytes, 0, stdinBytes.Length);
                    stdinStream.Flush();
                }

                bool timedOut = false;
                bool canceled = false;
                while (true)
                {
                    if (cancel != null && cancel.WaitOne(0))
                    {
                        canceled = true;
                        break;
                    }
                    long remaining = timeoutMs - timer.ElapsedMilliseconds;
                    if (remaining <= 0)
                    {
                        timedOut = true;
                        break;
                    }
                    uint wait = WaitForSingleObject(processInfo.hProcess, (uint)Math.Min(remaining, 25));
                    if (wait == WaitObject0) break;
                    if (wait != WaitTimeout) ThrowLastWin32("PROCESS_WAIT_FAILED");
                }
                if (timedOut || canceled)
                {
                    HostLifetime.ReleaseJob(jobRegistration, ref job);
                    WaitForSingleObject(processInfo.hProcess, 10000);
                }
                uint exitCode;
                if (!GetExitCodeProcess(processInfo.hProcess, out exitCode)) ThrowLastWin32("EXIT_CODE_FAILED");
                if (!timedOut && !canceled) HostLifetime.ReleaseJob(jobRegistration, ref job);
                Task.WaitAll(new Task[] { stdoutTask, stderrTask }, 10000);
                BoundedReadResult stdout = stdoutTask.Result;
                BoundedReadResult stderr = stderrTask.Result;
                timer.Stop();
                return new ProcessRunResult
                {
                    Ok = !timedOut && !canceled && exitCode == 0,
                    Code = canceled ? "REQUEST_CANCELLED" : timedOut ? "PROCESS_TIMED_OUT" : "PROCESS_EXITED",
                    ExitCode = exitCode,
                    TimedOut = timedOut,
                    ProcessId = processInfo.dwProcessId,
                    JobAssignedAtCreation = true,
                    ExactHandleList = true,
                    ImageIdentityVerified = true,
                    VolumeSerial = fileInfo.dwVolumeSerialNumber,
                    FileIndex = ((ulong)fileInfo.nFileIndexHigh << 32) | fileInfo.nFileIndexLow,
                    NumberOfLinks = fileInfo.nNumberOfLinks,
                    Stdout = stdout.Bytes,
                    Stderr = stderr.Bytes,
                    StdoutTotalBytes = stdout.TotalBytes,
                    StderrTotalBytes = stderr.TotalBytes,
                    StdoutDroppedBytes = stdout.DroppedBytes,
                    StderrDroppedBytes = stderr.DroppedBytes,
                    StdoutTruncated = stdout.Truncated,
                    StderrTruncated = stderr.Truncated,
                    ElapsedMilliseconds = timer.ElapsedMilliseconds
                };
            }
            finally
            {
                CloseIfValid(ref processInfo.hThread);
                CloseIfValid(ref processInfo.hProcess);
                CloseIfValid(ref stdinRead);
                CloseIfValid(ref stdinWrite);
                CloseIfValid(ref stdoutRead);
                CloseIfValid(ref stdoutWrite);
                CloseIfValid(ref stderrRead);
                CloseIfValid(ref stderrWrite);
                HostLifetime.ReleaseJob(jobRegistration, ref job);
                if (attributeList != IntPtr.Zero)
                {
                    DeleteProcThreadAttributeList(attributeList);
                    Marshal.FreeHGlobal(attributeList);
                }
                if (jobValue != IntPtr.Zero) Marshal.FreeHGlobal(jobValue);
                if (handleValues != IntPtr.Zero) Marshal.FreeHGlobal(handleValues);
                if (environmentPointer != IntPtr.Zero) Marshal.FreeHGlobal(environmentPointer);
                if (executableHandle != IntPtr.Zero && executableHandle != new IntPtr(-1)) CloseHandle(executableHandle);
            }
        }

        private static BoundedReadResult ReadBounded(Stream stream, int limit)
        {
            return ReadBounded(stream, limit, null, null);
        }

        private static BoundedReadResult ReadBounded(Stream stream, int limit, byte[] marker, EventWaitHandle markerSeen)
        {
            using (stream)
            {
                byte[] buffer = new byte[8192];
                Queue<byte[]> chunks = new Queue<byte[]>();
                int retained = 0;
                long total = 0;
                int markerIndex = 0;
                while (true)
                {
                    int read = stream.Read(buffer, 0, buffer.Length);
                    if (read == 0) break;
                    total += read;
                    if (marker != null && markerSeen != null && !markerSeen.WaitOne(0))
                    {
                        for (int index = 0; index < read; index++)
                        {
                            if (buffer[index] == marker[markerIndex])
                            {
                                markerIndex++;
                                if (markerIndex == marker.Length)
                                {
                                    markerSeen.Set();
                                    break;
                                }
                            }
                            else
                            {
                                markerIndex = buffer[index] == marker[0] ? 1 : 0;
                            }
                        }
                    }
                    byte[] copy = new byte[read];
                    Buffer.BlockCopy(buffer, 0, copy, 0, read);
                    chunks.Enqueue(copy);
                    retained += read;
                    while (retained > limit && chunks.Count > 0)
                    {
                        byte[] first = chunks.Dequeue();
                        int excess = retained - limit;
                        if (first.Length > excess)
                        {
                            byte[] remainder = new byte[first.Length - excess];
                            Buffer.BlockCopy(first, excess, remainder, 0, remainder.Length);
                            chunks.Enqueue(remainder);
                            Queue<byte[]> reordered = new Queue<byte[]>();
                            reordered.Enqueue(remainder);
                            while (chunks.Count > 0)
                            {
                                byte[] item = chunks.Dequeue();
                                if (!Object.ReferenceEquals(item, remainder)) reordered.Enqueue(item);
                            }
                            chunks = reordered;
                            retained -= excess;
                            break;
                        }
                        retained -= first.Length;
                    }
                }
                byte[] result = new byte[retained];
                int offset = 0;
                foreach (byte[] chunk in chunks)
                {
                    Buffer.BlockCopy(chunk, 0, result, offset, chunk.Length);
                    offset += chunk.Length;
                }
                return new BoundedReadResult
                {
                    Bytes = result,
                    TotalBytes = total,
                    DroppedBytes = total - retained,
                    Truncated = total > retained
                };
            }
        }

        private static Dictionary<string, object> SuccessResult()
        {
            Dictionary<string, object> value = new Dictionary<string, object>();
            value["schemaVersion"] = 1;
            value["ok"] = true;
            value["code"] = "OK";
            return value;
        }

        private static Dictionary<string, object> ErrorResult(string code)
        {
            Dictionary<string, object> value = new Dictionary<string, object>();
            value["schemaVersion"] = 1;
            value["ok"] = false;
            value["code"] = code;
            return value;
        }

        private static void WriteJsonFrame(Stream output, byte[] key, ref uint sequence, ushort kind, byte[] requestId, ulong generation, Dictionary<string, object> value)
        {
            byte[] payload = new UTF8Encoding(false, true).GetBytes(Json.Serialize(value));
            WriteFrame(output, key, sequence, kind, 0, requestId, generation, payload);
            sequence++;
            if (sequence == 0) throw new InvalidDataException("SEQUENCE_EXHAUSTED");
        }

        private static Frame ReadFrame(Stream input, byte[] key, uint expectedSequence)
        {
            byte[] header = ReadExact(input, HeaderLength, true);
            if (header == null) return null;
            if (header[0] != 0x43 || header[1] != 0x58 || header[2] != 0x50 || header[3] != 0x34) throw new InvalidDataException("BAD_MAGIC");
            if (BitConverter.ToUInt16(header, 4) != ProtocolVersion) throw new InvalidDataException("BAD_VERSION");
            if (BitConverter.ToUInt16(header, 6) != HeaderLength) throw new InvalidDataException("BAD_HEADER_LENGTH");
            ushort kind = BitConverter.ToUInt16(header, 8);
            ushort flags = BitConverter.ToUInt16(header, 10);
            uint sequence = BitConverter.ToUInt32(header, 12);
            if (sequence != expectedSequence) throw new InvalidDataException(sequence < expectedSequence ? "DUPLICATE_SEQUENCE" : "OUT_OF_ORDER_SEQUENCE");
            if (!IsKnownKind(kind)) throw new InvalidDataException("UNKNOWN_FRAME_KIND");
            if ((flags & ~AllowedFlags(kind)) != 0) throw new InvalidDataException("INVALID_FLAGS");
            uint payloadLength = BitConverter.ToUInt32(header, 40);
            if (payloadLength > MaxPayload) throw new InvalidDataException("FRAME_TOO_LARGE");
            if ((kind == Hello || kind == HelloAck) && payloadLength > MaxHelloPayload) throw new InvalidDataException("HELLO_TOO_LARGE");
            if (BitConverter.ToUInt32(header, 44) != 0) throw new InvalidDataException("NONZERO_RESERVED");
            if (kind == Credit && payloadLength != 8) throw new InvalidDataException("INVALID_CREDIT_LENGTH");
            if (kind == Cancel && payloadLength != 0) throw new InvalidDataException("INVALID_CANCEL_LENGTH");
            byte[] payload = ReadExact(input, checked((int)payloadLength), false) ?? new byte[0];
            byte[] expectedTag = ComputeTag(key, header, payload);
            if (!FixedEquals(expectedTag, 0, header, TagOffset, TagLength)) throw new InvalidDataException("BAD_AUTH_TAG");
            byte[] requestId = new byte[16];
            Buffer.BlockCopy(header, 16, requestId, 0, 16);
            return new Frame
            {
                Kind = kind,
                Flags = flags,
                Sequence = sequence,
                RequestId = requestId,
                ProcessGeneration = BitConverter.ToUInt64(header, 32),
                Payload = payload,
                FrameBytes = HeaderLength + payload.Length
            };
        }

        private static void WriteFrame(Stream output, byte[] key, uint sequence, ushort kind, ushort flags, byte[] requestId, ulong generation, byte[] payload)
        {
            if (payload.Length > MaxPayload) throw new InvalidDataException("FRAME_TOO_LARGE");
            byte[] header = new byte[HeaderLength];
            header[0] = 0x43; header[1] = 0x58; header[2] = 0x50; header[3] = 0x34;
            WriteUInt16(header, 4, ProtocolVersion);
            WriteUInt16(header, 6, HeaderLength);
            WriteUInt16(header, 8, kind);
            WriteUInt16(header, 10, flags);
            WriteUInt32(header, 12, sequence);
            Buffer.BlockCopy(requestId, 0, header, 16, 16);
            WriteUInt64(header, 32, generation);
            WriteUInt32(header, 40, (uint)payload.Length);
            byte[] tag = ComputeTag(key, header, payload);
            Buffer.BlockCopy(tag, 0, header, TagOffset, TagLength);
            output.Write(header, 0, header.Length);
            if (payload.Length > 0) output.Write(payload, 0, payload.Length);
            output.Flush();
        }

        private static byte[] ComputeTag(byte[] key, byte[] header, byte[] payload)
        {
            using (HMACSHA256 hmac = new HMACSHA256(key))
            {
                byte[] covered = new byte[TagOffset + payload.Length];
                Buffer.BlockCopy(header, 0, covered, 0, TagOffset);
                if (payload.Length > 0) Buffer.BlockCopy(payload, 0, covered, TagOffset, payload.Length);
                byte[] full = hmac.ComputeHash(covered);
                byte[] tag = new byte[TagLength];
                Buffer.BlockCopy(full, 0, tag, 0, TagLength);
                return tag;
            }
        }

        private static bool FixedEquals(byte[] left, int leftOffset, byte[] right, int rightOffset, int length)
        {
            int difference = 0;
            for (int index = 0; index < length; index++) difference |= left[leftOffset + index] ^ right[rightOffset + index];
            return difference == 0;
        }

        private static Dictionary<string, object> ParseStrictObject(byte[] payload)
        {
            string text;
            try { text = new UTF8Encoding(false, true).GetString(payload); }
            catch { throw new InvalidDataException("INVALID_UTF8"); }
            JsonDuplicateKeyDetector.Validate(text, 16, 256, 16384);
            object parsed;
            try { parsed = Json.DeserializeObject(text); }
            catch { throw new InvalidDataException("INVALID_JSON"); }
            Dictionary<string, object> value = parsed as Dictionary<string, object>;
            if (value == null) throw new InvalidDataException("JSON_OBJECT_REQUIRED");
            return value;
        }

        private static class JsonDuplicateKeyDetector
        {
            private sealed class Context
            {
                public bool Object;
                public HashSet<string> Keys;
            }

            public static void Validate(string text, int maxDepth, int maxKeys, int maxStringLength)
            {
                Stack<Context> stack = new Stack<Context>();
                int totalKeys = 0;
                for (int index = 0; index < text.Length; index++)
                {
                    char current = text[index];
                    if (current == '"')
                    {
                        int start = index;
                        bool escaped = false;
                        index++;
                        while (index < text.Length)
                        {
                            char character = text[index];
                            if (escaped) escaped = false;
                            else if (character == '\\') escaped = true;
                            else if (character == '"') break;
                            index++;
                        }
                        if (index >= text.Length) throw new InvalidDataException("INVALID_JSON");
                        string literal = text.Substring(start, index - start + 1);
                        string value;
                        try { value = Json.Deserialize<string>(literal); }
                        catch { throw new InvalidDataException("INVALID_JSON"); }
                        if (value.Length > maxStringLength) throw new InvalidDataException("JSON_STRING_TOO_LONG");
                        int cursor = index + 1;
                        while (cursor < text.Length && Char.IsWhiteSpace(text[cursor])) cursor++;
                        if (cursor < text.Length && text[cursor] == ':')
                        {
                            if (stack.Count == 0 || !stack.Peek().Object) throw new InvalidDataException("INVALID_JSON");
                            if (!stack.Peek().Keys.Add(value)) throw new InvalidDataException("DUPLICATE_JSON_KEY");
                            totalKeys++;
                            if (totalKeys > maxKeys) throw new InvalidDataException("JSON_TOO_MANY_KEYS");
                        }
                    }
                    else if (current == '{')
                    {
                        stack.Push(new Context { Object = true, Keys = new HashSet<string>(StringComparer.Ordinal) });
                        if (stack.Count > maxDepth) throw new InvalidDataException("JSON_TOO_DEEP");
                    }
                    else if (current == '[')
                    {
                        stack.Push(new Context { Object = false, Keys = null });
                        if (stack.Count > maxDepth) throw new InvalidDataException("JSON_TOO_DEEP");
                    }
                    else if (current == '}' || current == ']')
                    {
                        if (stack.Count == 0) throw new InvalidDataException("INVALID_JSON");
                        Context context = stack.Pop();
                        if ((current == '}') != context.Object) throw new InvalidDataException("INVALID_JSON");
                    }
                }
                if (stack.Count != 0) throw new InvalidDataException("INVALID_JSON");
            }
        }

        private static Dictionary<string, object> AsObject(object value, string name)
        {
            Dictionary<string, object> result = value as Dictionary<string, object>;
            if (result == null) throw new InvalidDataException("INVALID_" + name.ToUpperInvariant());
            return result;
        }

        private static SortedDictionary<string, string> AsEnvironment(object value)
        {
            Dictionary<string, object> source = AsObject(value, "environment");
            if (source.Count > 64) throw new InvalidDataException("ENVIRONMENT_TOO_LARGE");
            SortedDictionary<string, string> result = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (KeyValuePair<string, object> entry in source)
            {
                if (String.IsNullOrEmpty(entry.Key) || entry.Key.Length > 128 || entry.Key.IndexOf('=') >= 0 || entry.Key.IndexOf('\0') >= 0)
                    throw new InvalidDataException("INVALID_ENVIRONMENT_KEY");
                if (result.ContainsKey(entry.Key)) throw new InvalidDataException("DUPLICATE_ENVIRONMENT_KEY");
                result.Add(entry.Key, RequireBoundedString(entry.Value, "environmentValue", 0, 32768));
            }
            string systemRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? "C:\\Windows";
            string systemDriveRoot = Path.GetPathRoot(systemRoot);
            string systemDrive = systemDriveRoot.TrimEnd('\\');
            result["SystemDrive"] = systemDrive;
            result["SystemRoot"] = systemRoot;
            result["WINDIR"] = systemRoot;
            result["ProgramData"] = Path.Combine(systemDriveRoot, "ProgramData");
            result["ComSpec"] = Path.Combine(systemRoot, "System32", "cmd.exe");
            result["PATH"] = Path.Combine(systemRoot, "System32") + ";" + systemRoot;
            result["PATHEXT"] = ".COM;.EXE;.BAT;.CMD";
            return result;
        }

        private static string BuildEnvironmentBlock(SortedDictionary<string, string> environment)
        {
            StringBuilder block = new StringBuilder();
            foreach (KeyValuePair<string, string> entry in environment)
            {
                block.Append(entry.Key).Append('=').Append(entry.Value).Append('\0');
            }
            block.Append('\0');
            return block.ToString();
        }

        private static string[] AsStringArray(object value, string name, int maxItems, int maxStringLength)
        {
            IList array = value as IList;
            if (array == null || array.Count > maxItems) throw new InvalidDataException("INVALID_" + name.ToUpperInvariant());
            string[] result = new string[array.Count];
            int totalBytes = 0;
            for (int index = 0; index < array.Count; index++)
            {
                result[index] = RequireBoundedString(array[index], name, 0, maxStringLength);
                totalBytes = checked(totalBytes + Encoding.UTF8.GetByteCount(result[index]));
                if (totalBytes > MaxArgumentTotalBytes) throw new InvalidDataException("INVALID_" + name.ToUpperInvariant());
            }
            return result;
        }

        private static string RequireAbsoluteFile(object value)
        {
            string candidate = RequireBoundedString(value, "executable", 1, 32768);
            if (!Path.IsPathRooted(candidate) || !File.Exists(candidate)) throw new InvalidDataException("INVALID_EXECUTABLE_PATH");
            return Path.GetFullPath(candidate);
        }

        private static string RequireAbsoluteDirectory(object value)
        {
            string candidate = RequireBoundedString(value, "cwd", 1, 32768);
            if (!Path.IsPathRooted(candidate) || !Directory.Exists(candidate)) throw new InvalidDataException("INVALID_CWD");
            return Path.GetFullPath(candidate);
        }

        private static string RequireSafeNonce(object value)
        {
            string nonce = RequireBoundedString(value, "nonce", 64, 64);
            for (int index = 0; index < nonce.Length; index++)
            {
                char character = nonce[index];
                bool hex = (character >= '0' && character <= '9') || (character >= 'a' && character <= 'f');
                if (!hex) throw new InvalidDataException("INVALID_NONCE");
            }
            return nonce;
        }

        private static string RequireBoundedString(object value, string name, int minimum, int maximum)
        {
            string result = value as string;
            if (result == null || result.Length < minimum || result.Length > maximum || result.IndexOf('\0') >= 0)
                throw new InvalidDataException("INVALID_" + name.ToUpperInvariant());
            return result;
        }

        private static int ToInt(object value, string name)
        {
            try { return Convert.ToInt32(value); }
            catch { throw new InvalidDataException("INVALID_" + name.ToUpperInvariant()); }
        }

        private static int ToBoundedInt(object value, string name, int minimum, int maximum)
        {
            int result = ToInt(value, name);
            if (result < minimum || result > maximum) throw new InvalidDataException("INVALID_" + name.ToUpperInvariant());
            return result;
        }

        private static void RequireExactKeys(Dictionary<string, object> value, string[] keys)
        {
            HashSet<string> expected = new HashSet<string>(keys, StringComparer.Ordinal);
            if (value.Count != expected.Count) throw new InvalidDataException("UNKNOWN_JSON_FIELD");
            foreach (string key in value.Keys) if (!expected.Contains(key)) throw new InvalidDataException("UNKNOWN_JSON_FIELD");
        }

        private static string BuildCommandLine(string executable, string[] arguments)
        {
            StringBuilder command = new StringBuilder();
            command.Append(QuoteArgument(executable));
            foreach (string argument in arguments) command.Append(' ').Append(QuoteArgument(argument));
            return command.ToString();
        }

        private static string QuoteArgument(string value)
        {
            if (value.Length > 0 && value.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0) return value;
            StringBuilder result = new StringBuilder();
            result.Append('"');
            int backslashes = 0;
            foreach (char character in value)
            {
                if (character == '\\') { backslashes++; continue; }
                if (character == '"')
                {
                    result.Append('\\', backslashes * 2 + 1).Append('"');
                    backslashes = 0;
                    continue;
                }
                result.Append('\\', backslashes).Append(character);
                backslashes = 0;
            }
            result.Append('\\', backslashes * 2).Append('"');
            return result.ToString();
        }

        private static string SafeErrorCode(Exception error)
        {
            string message = error.Message ?? "HOST_ERROR";
            int separator = message.IndexOf(':');
            string candidate = separator >= 0 ? message.Substring(0, separator) : message;
            StringBuilder safe = new StringBuilder();
            foreach (char character in candidate.ToUpperInvariant())
            {
                if ((character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character == '_') safe.Append(character);
            }
            return safe.Length == 0 || safe.Length > 80 ? "HOST_ERROR" : safe.ToString();
        }

        private static bool IsKnownKind(ushort kind)
        {
            return kind == Hello || kind == HelloAck || kind == RequestJson || kind == ResponseJson || kind == EventJson || kind == Output || kind == Input || kind == Credit || kind == Cancel || kind == Fatal;
        }

        private static ushort AllowedFlags(ushort kind)
        {
            if (kind == Output) return FlagStderr | FlagEof;
            if (kind == Input) return FlagEof;
            return 0;
        }

        private static bool HasProc(string moduleName, string procName)
        {
            IntPtr module = GetModuleHandleW(moduleName);
            return module != IntPtr.Zero && GetProcAddress(module, procName) != IntPtr.Zero;
        }

        private static byte[] ReadExact(Stream stream, int length, bool allowCleanEof)
        {
            byte[] result = new byte[length];
            int offset = 0;
            while (offset < length)
            {
                int read = stream.Read(result, offset, length - offset);
                if (read == 0)
                {
                    if (offset == 0 && allowCleanEof) return null;
                    throw new EndOfStreamException("TRUNCATED_FRAME");
                }
                offset += read;
            }
            return result;
        }

        private static void WriteUInt16(byte[] buffer, int offset, ushort value) { Buffer.BlockCopy(BitConverter.GetBytes(value), 0, buffer, offset, 2); }
        private static void WriteUInt32(byte[] buffer, int offset, uint value) { Buffer.BlockCopy(BitConverter.GetBytes(value), 0, buffer, offset, 4); }
        private static void WriteUInt64(byte[] buffer, int offset, ulong value) { Buffer.BlockCopy(BitConverter.GetBytes(value), 0, buffer, offset, 8); }

        private static void ThrowLastWin32(string code) { throw new Win32Exception(Marshal.GetLastWin32Error(), code); }

        private static void CloseIfValid(ref IntPtr handle)
        {
            if (handle != IntPtr.Zero && handle != new IntPtr(-1)) CloseHandle(handle);
            handle = IntPtr.Zero;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct COORD
        {
            public short X;
            public short Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct SECURITY_ATTRIBUTES
        {
            public int nLength;
            public IntPtr lpSecurityDescriptor;
            public int bInheritHandle;
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

        [StructLayout(LayoutKind.Sequential)]
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
            public int dwProcessId;
            public int dwThreadId;
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
            public long Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
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
        private struct FILETIME
        {
            public uint dwLowDateTime;
            public uint dwHighDateTime;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct BY_HANDLE_FILE_INFORMATION
        {
            public uint dwFileAttributes;
            public FILETIME ftCreationTime;
            public FILETIME ftLastAccessTime;
            public FILETIME ftLastWriteTime;
            public uint dwVolumeSerialNumber;
            public uint nFileSizeHigh;
            public uint nFileSizeLow;
            public uint nNumberOfLinks;
            public uint nFileIndexHigh;
            public uint nFileIndexLow;
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateJobObjectW(IntPtr jobAttributes, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetInformationJobObject(IntPtr job, int informationClass, IntPtr information, uint informationLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool InitializeProcThreadAttributeList(IntPtr attributeList, int attributeCount, uint flags, ref IntPtr size);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UpdateProcThreadAttribute(IntPtr attributeList, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previousValue, IntPtr returnSize);

        [DllImport("kernel32.dll")]
        private static extern void DeleteProcThreadAttributeList(IntPtr attributeList);

        [DllImport("kernel32.dll", EntryPoint = "CreatePseudoConsole", SetLastError = true)]
        private static extern int CreatePseudoConsoleSafe(COORD size, SafeFileHandle input, SafeFileHandle output, uint flags, out IntPtr pseudoConsole);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern int ResizePseudoConsole(IntPtr pseudoConsole, COORD size);

        [DllImport("kernel32.dll")]
        private static extern void ClosePseudoConsole(IntPtr pseudoConsole);

        [DllImport("kernel32.dll", EntryPoint = "CreateProcessW", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CreateConPtyProcessW(string applicationName, string commandLine, ref SECURITY_ATTRIBUTES processAttributes, ref SECURITY_ATTRIBUTES threadAttributes, [MarshalAs(UnmanagedType.Bool)] bool inheritHandles, uint creationFlags, IntPtr environment, string currentDirectory, [In] ref STARTUPINFOEX startupInfo, out PROCESS_INFORMATION processInformation);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CreateProcessW(string applicationName, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, [MarshalAs(UnmanagedType.Bool)] bool inheritHandles, uint creationFlags, IntPtr environment, string currentDirectory, ref STARTUPINFOEX startupInfo, out PROCESS_INFORMATION processInformation);

        [DllImport("kernel32.dll", EntryPoint = "CreatePipe", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CreateConPtyPipe(out SafeFileHandle readPipe, out SafeFileHandle writePipe, IntPtr pipeAttributes, uint size);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CreatePipe(out IntPtr readPipe, out IntPtr writePipe, ref SECURITY_ATTRIBUTES pipeAttributes, uint size);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsProcessInJob(IntPtr process, IntPtr job, [MarshalAs(UnmanagedType.Bool)] out bool result);

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint ResumeThread(IntPtr thread);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool TerminateProcess(IntPtr process, uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder executableName, ref int size);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateFileW(string filename, uint desiredAccess, uint shareMode, IntPtr securityAttributes, uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandle(IntPtr file, out BY_HANDLE_FILE_INFORMATION information);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetStdHandle(int standardHandle);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetStdHandle(int standardHandle, IntPtr handle);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool PeekNamedPipe(IntPtr pipe, IntPtr buffer, uint bufferSize, IntPtr bytesRead, out uint totalBytesAvailable, IntPtr bytesLeftThisMessage);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr GetModuleHandleW(string moduleName);

        [DllImport("kernel32.dll", CharSet = CharSet.Ansi)]
        private static extern IntPtr GetProcAddress(IntPtr module, string procName);
    }
}
