import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { StreamingRedactor, OUTPUT_REDACTION_CAPABILITY } = await tsImport("../fixtures/ts-imports/process-output-imports.ts", import.meta.url);
const { redactSensitiveText, redactStructured } = await tsImport("../src/redact.ts", import.meta.url);

test("known bearer prefix split at every byte boundary is redacted before output", () => {
  const source = Buffer.from("before Authorization: Bearer abcdefghijklmnop after", "utf8");
  for (let split = 1; split < source.length; split += 1) {
    const redactor = new StreamingRedactor();
    const output = Buffer.concat([redactor.write(source.subarray(0, split)), redactor.write(source.subarray(split)), redactor.end()]).toString("utf8");
    assert.equal(output, "before Authorization: Bearer [REDACTED_SECRET] after", `split ${split}`);
  }
});

test("unbounded tokens and missing terminators use fixed candidate memory and flush at EOF", () => {
  const redactor = new StreamingRedactor({ candidateLimit: 128 });
  let output = "";
  output += redactor.write(Buffer.from("sk-" + "a".repeat(10))).toString();
  for (let i = 0; i < 1000; i += 1) output += redactor.write(Buffer.from("a".repeat(100))).toString();
  output += redactor.end().toString();
  assert.equal(output, "[REDACTED_SECRET]");
  assert.ok(redactor.bufferedBytes() <= 128);
});

test("UTF-8 splits, invalid bytes, ANSI, and log-injection controls are deterministic", () => {
  const redactor = new StreamingRedactor();
  const euro = Buffer.from("€", "utf8");
  const output = Buffer.concat([
    redactor.write(euro.subarray(0, 1)),
    redactor.write(euro.subarray(1)),
    redactor.write(Buffer.from([0xff, 0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x0d])),
    redactor.end()
  ]).toString("utf8");
  assert.match(output, /^€�/);
  assert.doesNotMatch(output, /\u001b|\r/);
  assert.equal(OUTPUT_REDACTION_CAPABILITY, "best_effort_known_patterns");
});

test("OAuth query, response, bootstrap, DPAPI, and private JWK material is redacted", () => {
  const text = redactSensitiveText(
    "https://mcp.example.com/callback?code=secret-code&state=secret-state&refresh_token=refresh-value " +
    '{"access_token":"access-value","code_verifier":"verifier-value","bootstrap_key":"bootstrap-value"}'
  );
  for (const secret of ["secret-code", "secret-state", "refresh-value", "access-value", "verifier-value", "bootstrap-value"]) {
    assert.equal(text.includes(secret), false, secret);
  }

  const structured = redactStructured({
    response_type: "code",
    code: "authorization-code",
    state: "opaque-state",
    access_token: "access-token",
    protectedSigningPrivateJwk: "dpapi-blob",
    jwk: { kty: "EC", crv: "P-256", x: "public-x", y: "public-y", d: "private-d" },
    ordinary: { state: "healthy" }
  });
  assert.equal(structured.code, "[REDACTED_SECRET]");
  assert.equal(structured.state, "[REDACTED_SECRET]");
  assert.equal(structured.access_token, "[REDACTED_SECRET]");
  assert.equal(structured.protectedSigningPrivateJwk, "[REDACTED_SECRET]");
  assert.equal(structured.jwk.d, "[REDACTED_SECRET]");
  assert.equal(structured.jwk.x, "public-x");
  assert.equal(structured.ordinary.state, "healthy");
});
