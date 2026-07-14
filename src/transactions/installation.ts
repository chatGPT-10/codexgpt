import fs from "node:fs";
import path from "node:path";
import { createHmac, hkdfSync, randomBytes as nodeRandomBytes } from "node:crypto";
import { installationStateV1Schema } from "./schemas.js";
import {
  normalizeCanonicalWorkspaceRoot,
  transactionStateDirectories
} from "./stateRoot.js";
import {
  TransactionError,
  type InstallationStateV1
} from "./types.js";

export interface InstallationStateOptions {
  stateRoot: string;
  randomBytes?: (size: number) => Buffer;
  now?: () => number;
}

function syncDirectoryBestEffort(directory: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(directory, "r");
    fs.fsyncSync(fd);
  } catch {
    // Directory fsync is not supported uniformly, especially on Windows.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function parseInstallationState(text: string): InstallationStateV1 {
  try {
    return installationStateV1Schema.parse(JSON.parse(text));
  } catch {
    throw new TransactionError(
      "TRANSACTION_STATE_CORRUPT",
      "Persisted installation state is invalid."
    );
  }
}

function readInstallationState(file: string): InstallationStateV1 {
  try {
    return parseInstallationState(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof TransactionError) throw error;
    throw new TransactionError(
      "TRANSACTION_STATE_CORRUPT",
      "Persisted installation state could not be read."
    );
  }
}

export function loadOrCreateInstallationState(
  options: InstallationStateOptions
): InstallationStateV1 {
  const stateRoot = path.resolve(options.stateRoot);
  const directories = transactionStateDirectories(stateRoot);
  fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  for (const directory of [
    directories.instances,
    directories.workspaceLocks,
    directories.auditLocks,
    directories.transactions,
    directories.changesets,
    directories.audit
  ]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  try {
    return readInstallationState(directories.installationFile);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!(error instanceof TransactionError) && code !== "ENOENT") throw error;
    if (error instanceof TransactionError && fs.existsSync(directories.installationFile)) throw error;
  }

  const randomBytes = options.randomBytes ?? nodeRandomBytes;
  const installationIdBytes = randomBytes(16);
  const masterKeyBytes = randomBytes(32);
  if (installationIdBytes.length !== 16 || masterKeyBytes.length !== 32) {
    throw new TransactionError(
      "TRANSACTION_STATE_CORRUPT",
      "Installation random source returned an invalid length."
    );
  }
  const candidate: InstallationStateV1 = {
    schemaVersion: 1,
    installationId: `install_${installationIdBytes.toString("hex")}`,
    masterKeyBase64: masterKeyBytes.toString("base64"),
    createdAt: new Date((options.now ?? Date.now)()).toISOString()
  };
  installationStateV1Schema.parse(candidate);

  let fd: number | undefined;
  try {
    fd = fs.openSync(directories.installationFile, "wx", 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(candidate)}\n`, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    try {
      fs.chmodSync(directories.installationFile, 0o600);
    } catch {
      // Windows ACL semantics are outside the portable mode-bit contract.
    }
    syncDirectoryBestEffort(stateRoot);
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw new TransactionError(
        "TRANSACTION_STATE_CORRUPT",
        "Installation state could not be created."
      );
    }
  } finally {
    installationIdBytes.fill(0);
    masterKeyBytes.fill(0);
  }

  return readInstallationState(directories.installationFile);
}

export function deriveTransactionSubkey(masterKey: Buffer, label: string): Buffer {
  if (masterKey.length !== 32) {
    throw new TransactionError(
      "TRANSACTION_STATE_CORRUPT",
      "Installation master key has an invalid length."
    );
  }
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(label)) {
    throw new TransactionError(
      "TRANSACTION_PRECONDITION_FAILED",
      "Transaction subkey label is invalid."
    );
  }
  return Buffer.from(hkdfSync(
    "sha256",
    masterKey,
    Buffer.alloc(0),
    Buffer.from(`codexpro/phase3/${label}/v1`, "utf8"),
    32
  ));
}

export function workspaceStateKeyForRoot(
  canonicalRoot: string,
  masterKey: Buffer,
  platform: NodeJS.Platform = process.platform
): string {
  const key = deriveTransactionSubkey(masterKey, "workspace-state");
  try {
    const normalized = normalizeCanonicalWorkspaceRoot(canonicalRoot, platform);
    const digest = createHmac("sha256", key).update(normalized, "utf8").digest("hex");
    return `wsk_${digest.slice(0, 32)}`;
  } finally {
    key.fill(0);
  }
}

export function installationMasterKey(state: InstallationStateV1): Buffer {
  try {
    const parsed = installationStateV1Schema.parse(state);
    const key = Buffer.from(parsed.masterKeyBase64, "base64");
    if (key.length !== 32) throw new Error("invalid length");
    return key;
  } catch {
    throw new TransactionError(
      "TRANSACTION_STATE_CORRUPT",
      "Installation master key has an invalid length."
    );
  }
}
