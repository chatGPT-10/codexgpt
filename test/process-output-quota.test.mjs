import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { OutputQuotaManager } = await tsImport("../fixtures/ts-imports/process-output-imports.ts", import.meta.url);

test("server/session/process/terminal caps and reservations are independent", () => {
  const quota = new OutputQuotaManager({ maxServerProcesses: 2, maxSessionProcesses: 1, maxServerRecords: 2, maxSessionRecords: 1, maxServerOutputBytes: 10, maxProcessOutputBytes: 6, sessionOutputReservationBytes: 0 });
  const a = quota.reserveProcess("session-a", "process-a");
  assert.throws(() => quota.reserveProcess("session-a", "process-b"), /session/i);
  const b = quota.reserveProcess("session-b", "process-b");
  assert.throws(() => quota.reserveProcess("session-c", "process-c"), /server/i);
  assert.equal(quota.claimOutput("process-a", 6), true);
  assert.equal(quota.claimOutput("process-b", 5), false);
  a.release();
  b.release();
});

test("session output reservations prevent an earlier session from starving another", () => {
  const quota = new OutputQuotaManager({ maxServerProcesses: 2, maxSessionProcesses: 1, maxServerOutputBytes: 10, maxProcessOutputBytes: 10, sessionOutputReservationBytes: 3 });
  quota.reserveProcess("session-a", "process-a");
  quota.reserveProcess("session-b", "process-b");
  assert.equal(quota.claimOutput("process-a", 8), false);
  assert.equal(quota.claimOutput("process-a", 7), true);
  assert.equal(quota.claimOutput("process-b", 3), true);
});

test("noisy producer overflow terminates only that producer", () => {
  const terminated = [];
  const quota = new OutputQuotaManager({ maxServerOutputBytes: 100, maxProcessOutputBytes: 4, onOutputOverflow: (id) => terminated.push(id) });
  quota.reserveProcess("session-a", "process-a");
  quota.reserveProcess("session-b", "process-b");
  assert.equal(quota.claimOutput("process-a", 5), false);
  assert.equal(quota.claimOutput("process-b", 4), true);
  assert.deepEqual(terminated, ["process-a"]);
});
