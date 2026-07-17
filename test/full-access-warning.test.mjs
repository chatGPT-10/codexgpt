import assert from "node:assert/strict";
import test from "node:test";
import { tsImport } from "tsx/esm/api";

const { fullAccessWarning } = await tsImport("./fixtures/full-access-imports.ts", import.meta.url);

test("confirmed-root warning does not claim process isolation", () => {
  const warning = fullAccessWarning("read_write");
  assert.match(warning, /local confirmation/i);
  assert.match(warning, /does not sandbox|not a sandbox/i);
  assert.match(warning, /process/i);
});
