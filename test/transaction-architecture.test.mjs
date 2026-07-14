import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as transactions from "../dist/transactions/index.js";
import { CANONICAL_CODEXPRO_CHILD_TOOLS } from "../dist/tools/schemas/codexpro.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const transactionRoot = path.join(repositoryRoot, "src", "transactions");

async function read(relativePath) {
  return fs.readFile(path.join(repositoryRoot, relativePath), "utf8");
}

const EXPECTED_RUNTIME_EXPORTS = [
  "AtomicJsonFileStore",
  "AtomicTransactionEngine",
  "AtomicWorkspaceFs",
  "ProcessInstanceRegistry",
  "TransactionError",
  "TransactionManifestStore",
  "TransactionRecoveryCoordinator",
  "WorkspaceLockHandle",
  "WorkspaceMutationLock",
  "changeSetIdSchema",
  "classifyProcessLiveness",
  "createDefaultTransactionRecoveryCoordinator",
  "deriveTransactionSubkey",
  "fileIdentitySchema",
  "fileMetadataV1Schema",
  "installationIdSchema",
  "installationMasterKey",
  "installationStateV1Schema",
  "loadOrCreateInstallationState",
  "lockTokenSchema",
  "manifestPathFor",
  "normalizeCanonicalWorkspaceRoot",
  "operationIdSchema",
  "processInstanceIdSchema",
  "processInstanceRecordV1Schema",
  "recoveryActionForState",
  "resolveTransactionStateRoot",
  "sha256Schema",
  "transactionIdSchema",
  "transactionManifestV1Schema",
  "transactionOperationV1Schema",
  "transactionRelativePathSchema",
  "transactionStateDirectories",
  "transactionWorkspaceStateDirectory",
  "workspaceLockOwnerV1Schema",
  "workspaceStateKeyForRoot",
  "workspaceStateKeySchema"
].sort();

test("transaction barrel exposes the exact closed runtime API", () => {
  assert.deepEqual(Object.keys(transactions).sort(), EXPECTED_RUNTIME_EXPORTS);
});

test("transaction modules have no shell Git network or worktree dependencies", async () => {
  const files = (await fs.readdir(transactionRoot))
    .filter((name) => name.endsWith(".ts"))
    .sort();
  assert.deepEqual(files, [
    "atomicFs.ts",
    "atomicStateFile.ts",
    "engine.ts",
    "index.ts",
    "installation.ts",
    "recovery.ts",
    "schemas.ts",
    "stateRoot.ts",
    "types.ts",
    "workspaceLock.ts"
  ]);
  for (const name of files) {
    const source = await fs.readFile(path.join(transactionRoot, name), "utf8");
    for (const forbidden of [
      /gitOps/i,
      /bashOps/i,
      /child_process/,
      /powershell/i,
      /worktree/i,
      /node:(?:http|https|net|tls|dgram)/,
      /\bfetch\s*\(/
    ]) {
      assert.doesNotMatch(source, forbidden, `${name} contains ${forbidden}`);
    }
  }
});

test("reserved artifacts are blocked unconditionally and manifests exclude sensitive payload fields", async () => {
  const guard = await read("src/guard.ts");
  assert.match(guard, /RESERVED_TRANSACTION_PREFIX\s*=\s*["']\.codexpro-txn-["']/);
  assert.match(guard, /isReservedTransactionRelativePath\(rel, this\.platform\)/);

  const types = await read("src/transactions/types.ts");
  const manifest = types.slice(
    types.indexOf("export interface TransactionManifestV1"),
    types.indexOf("export type TransactionRequestOperationV1")
  );
  const schemas = await read("src/transactions/schemas.ts");
  const manifestSchema = schemas.slice(
    schemas.indexOf("export const transactionManifestV1Schema"),
    schemas.indexOf("export const installationStateV1Schema")
  );
  for (const field of [
    "workspaceRoot",
    "content",
    "diff",
    "authorization",
    "cookie",
    "privateKey",
    "masterKeyBase64"
  ]) {
    assert.doesNotMatch(manifest, new RegExp(`\\b${field}\\b`, "i"));
    assert.doesNotMatch(manifestSchema, new RegExp(`\\b${field}\\b`, "i"));
  }
});

test("protected smoke sources and the canonical public tool count remain exact", async () => {
  const smoke = await read("scripts/smoke.mjs");
  const httpSmoke = await read("scripts/http-smoke.mjs");
  assert.equal(createHash("sha256").update(smoke).digest("hex"), "9839e0bc2c040936add6094f362b7b9337981f4875aa61f6c3d0cbe5874f71ef");
  assert.equal(createHash("sha256").update(httpSmoke).digest("hex"), "00234c1659b2cec775ed04f0907d94d9ee3f3a3dba2a0495da12901f43befc6a");
  assert.equal(CANONICAL_CODEXPRO_CHILD_TOOLS.length, 28);
  assert.equal(new Set(CANONICAL_CODEXPRO_CHILD_TOOLS).size, 28);
});
