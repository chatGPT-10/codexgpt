import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { ConfirmedRootFileGuard } = await tsImport("./fixtures/full-access-imports.ts", import.meta.url);

test("confirmed-root ordinary files require one stable link", async () => {
  let facts = { volumeSerial: "v1", fileId: "f1", numberOfLinks: 2, kind: "file" };
  const guard = new ConfirmedRootFileGuard({ inspectFile: async () => ({ ...facts }) });
  const omitted = await guard.inspectForRead("C:\\Data\\linked.txt");
  assert.deepEqual(omitted, { allowed: false, omissionCode: "PROTECTED_OR_LINKED_ENTRY", omitted: 1 });
  await assert.rejects(guard.bindForMutation("C:\\Data\\linked.txt"), /hard link/i);

  facts = { ...facts, numberOfLinks: 1 };
  const binding = await guard.bindForMutation("C:\\Data\\file.txt");
  facts = { ...facts, fileId: "replacement" };
  await assert.rejects(guard.revalidate(binding), /identity drift/i);
});
