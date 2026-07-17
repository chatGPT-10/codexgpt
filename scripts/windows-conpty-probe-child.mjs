#!/usr/bin/env node

const READY = "CXP4_CONPTY_READY";
const INPUT_ACK = "CXP4_INPUT_ACK";
const ETX_ACK = "CXP4_ETX_ACK";
const PROBE_TIMEOUT_MS = 20_000;

let buffered = Buffer.alloc(0);
let etxAcknowledged = false;
let exiting = false;

function writeLine(value) {
  process.stdout.write(`${value}\r\n`);
}

function acknowledgeEtx() {
  if (etxAcknowledged || exiting) return;
  etxAcknowledged = true;
  writeLine(ETX_ACK);
}

function fail(code) {
  if (exiting) return;
  exiting = true;
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
  process.stdin.pause();
}

function finish() {
  if (exiting) return;
  exiting = true;
  process.exitCode = etxAcknowledged ? 0 : 1;
  process.stdin.pause();
}

function consumeLines() {
  while (true) {
    const newline = buffered.indexOf(0x0a);
    if (newline < 0) return;
    const line = buffered.subarray(0, newline).toString("utf8").replace(/\r$/, "");
    buffered = buffered.subarray(newline + 1);
    if (line === "CXP4_INPUT") {
      writeLine(INPUT_ACK);
    } else if (line === "CXP4_EXIT") {
      finish();
      return;
    } else if (line.length > 0) {
      fail("CXP4_PROBE_COMMAND_INVALID");
      return;
    }
  }
}

process.on("SIGINT", acknowledgeEtx);
process.stdin.on("data", (chunk) => {
  if (exiting) return;
  const incoming = Buffer.from(chunk);
  const retained = [];
  for (const byte of incoming) {
    if (byte === 0x03) acknowledgeEtx();
    else retained.push(byte);
  }
  if (retained.length > 0) {
    buffered = Buffer.concat([buffered, Buffer.from(retained)]);
    if (buffered.length > 4096) return fail("CXP4_PROBE_INPUT_TOO_LARGE");
    consumeLines();
  }
});
process.stdin.on("end", () => {
  if (!exiting) fail("CXP4_PROBE_INPUT_CLOSED");
});
process.stdin.on("error", () => fail("CXP4_PROBE_INPUT_FAILED"));

if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
writeLine(READY);

const timeout = setTimeout(() => fail("CXP4_PROBE_TIMEOUT"), PROBE_TIMEOUT_MS);
timeout.unref?.();
