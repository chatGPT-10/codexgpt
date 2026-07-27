using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace CodexGptCredentialHost
{
    public sealed class Request
    {
        public int schemaVersion { get; set; }
        public string protocolName { get; set; }
        public int protocolVersion { get; set; }
        public string operation { get; set; }
        public string provider { get; set; }
        public string purpose { get; set; }
        public string payloadBase64 { get; set; }
    }

    public sealed class Response
    {
        public int schemaVersion { get; set; }
        public string protocolName { get; set; }
        public int protocolVersion { get; set; }
        public bool ok { get; set; }
        public string provider { get; set; }
        public string payloadBase64 { get; set; }
        public string code { get; set; }
    }

    public static class CredentialHost
    {
        private const int MaxPlaintextBytes = 65536;
        private const int MaxProtectedBytes = 98304;
        private const int MaxFrameBytes = 196608;
        private const string ProtocolName = "CXDPAPI";
        private const string Provider = "windows-dpapi-current-user";

        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer
        {
            MaxJsonLength = MaxFrameBytes,
            RecursionLimit = 8
        };

        private static readonly HashSet<string> RequestFields = new HashSet<string>(StringComparer.Ordinal)
        {
            "schemaVersion",
            "protocolName",
            "protocolVersion",
            "operation",
            "provider",
            "purpose",
            "payloadBase64"
        };

        private static byte[] EntropyFor(string purpose)
        {
            if (purpose != "codexgpt-owner-v1" &&
                !System.Text.RegularExpressions.Regex.IsMatch(
                    purpose ?? String.Empty,
                    "^codexgpt-deployment-v1:binding_[a-f0-9]{32}:incarnation_[a-f0-9]{32}:(signing-key|refresh-pepper)$"))
            {
                throw new InvalidDataException("PURPOSE_INVALID");
            }
            using (var sha = SHA256.Create())
            {
                return sha.ComputeHash(Encoding.UTF8.GetBytes("codexgpt-dpapi-v1\0" + purpose));
            }
        }

        private static byte[] DecodePayload(string value, int maxBytes)
        {
            if (String.IsNullOrEmpty(value) || value.Length > MaxFrameBytes || value.Length % 4 != 0)
            {
                throw new InvalidDataException("PAYLOAD_INVALID");
            }
            byte[] payload;
            try
            {
                payload = Convert.FromBase64String(value);
            }
            catch (FormatException)
            {
                throw new InvalidDataException("PAYLOAD_INVALID");
            }
            if (payload.Length < 1 || payload.Length > maxBytes)
            {
                Array.Clear(payload, 0, payload.Length);
                throw new InvalidDataException("PAYLOAD_INVALID");
            }
            return payload;
        }

        private static Response Success(string payloadBase64)
        {
            return new Response
            {
                schemaVersion = 1,
                protocolName = ProtocolName,
                protocolVersion = 1,
                ok = true,
                provider = Provider,
                payloadBase64 = payloadBase64,
                code = null
            };
        }

        private static Response Failure(string code)
        {
            return new Response
            {
                schemaVersion = 1,
                protocolName = ProtocolName,
                protocolVersion = 1,
                ok = false,
                provider = Provider,
                payloadBase64 = null,
                code = code
            };
        }

        private static Response Execute(Request request)
        {
            if (request == null || request.schemaVersion != 1 || request.protocolName != ProtocolName ||
                request.protocolVersion != 1 || request.provider != Provider)
            {
                return Failure("REQUEST_INVALID");
            }

            if (request.operation == "probe-v1")
            {
                if (!String.IsNullOrEmpty(request.purpose) || !String.IsNullOrEmpty(request.payloadBase64))
                {
                    return Failure("REQUEST_INVALID");
                }
                byte[] probe = new byte[] { 0x43, 0x58, 0x44, 0x50, 0x41, 0x50, 0x49 };
                byte[] probeEntropy = null;
                byte[] protectedProbe = null;
                byte[] restoredProbe = null;
                try
                {
                    probeEntropy = EntropyFor("codexgpt-owner-v1");
                    protectedProbe = ProtectedData.Protect(probe, probeEntropy, DataProtectionScope.CurrentUser);
                    restoredProbe = ProtectedData.Unprotect(protectedProbe, probeEntropy, DataProtectionScope.CurrentUser);
                    if (restoredProbe.Length != probe.Length)
                    {
                        return Failure("DPAPI_PROBE_FAILED");
                    }
                    for (int index = 0; index < probe.Length; index += 1)
                    {
                        if (restoredProbe[index] != probe[index]) return Failure("DPAPI_PROBE_FAILED");
                    }
                    return Success(null);
                }
                catch (CryptographicException)
                {
                    return Failure("DPAPI_FAILED");
                }
                finally
                {
                    Array.Clear(probe, 0, probe.Length);
                    if (probeEntropy != null) Array.Clear(probeEntropy, 0, probeEntropy.Length);
                    if (protectedProbe != null) Array.Clear(protectedProbe, 0, protectedProbe.Length);
                    if (restoredProbe != null) Array.Clear(restoredProbe, 0, restoredProbe.Length);
                }
            }

            byte[] payload = null;
            byte[] entropy = null;
            byte[] result = null;
            try
            {
                entropy = EntropyFor(request.purpose);
                if (request.operation == "protect-v1")
                {
                    payload = DecodePayload(request.payloadBase64, MaxPlaintextBytes);
                    result = ProtectedData.Protect(payload, entropy, DataProtectionScope.CurrentUser);
                }
                else if (request.operation == "unprotect-v1")
                {
                    payload = DecodePayload(request.payloadBase64, MaxProtectedBytes);
                    result = ProtectedData.Unprotect(payload, entropy, DataProtectionScope.CurrentUser);
                }
                else
                {
                    return Failure("OPERATION_INVALID");
                }
                int resultLimit = request.operation == "protect-v1" ? MaxProtectedBytes : MaxPlaintextBytes;
                if (result.Length < 1 || result.Length > resultLimit)
                {
                    return Failure("RESULT_INVALID");
                }
                return Success(Convert.ToBase64String(result));
            }
            catch (CryptographicException)
            {
                return Failure("DPAPI_FAILED");
            }
            catch (InvalidDataException error)
            {
                return Failure(error.Message);
            }
            catch
            {
                return Failure("HOST_FAILED");
            }
            finally
            {
                if (payload != null) Array.Clear(payload, 0, payload.Length);
                if (entropy != null) Array.Clear(entropy, 0, entropy.Length);
                if (result != null) Array.Clear(result, 0, result.Length);
            }
        }

        public static void Run()
        {
            Response response;
            try
            {
                string input = Console.In.ReadToEnd();
                if (Encoding.UTF8.GetByteCount(input) > MaxFrameBytes)
                {
                    response = Failure("FRAME_TOO_LARGE");
                }
                else
                {
                    var fields = Serializer.Deserialize<Dictionary<string, object>>(input);
                    if (fields == null || fields.Count != RequestFields.Count)
                    {
                        response = Failure("REQUEST_INVALID");
                    }
                    else
                    {
                        foreach (string key in fields.Keys)
                        {
                            if (!RequestFields.Contains(key))
                            {
                                response = Failure("REQUEST_INVALID");
                                Console.Out.Write(Serializer.Serialize(response));
                                return;
                            }
                        }
                        var request = Serializer.Deserialize<Request>(input);
                        response = Execute(request);
                    }
                }
            }
            catch
            {
                response = Failure("REQUEST_INVALID");
            }
            Console.Out.Write(Serializer.Serialize(response));
        }
    }
}
