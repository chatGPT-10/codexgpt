import fs from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "../audit/canonicalJson.js";
import { AtomicJsonFileStore, manifestPathFor } from "./atomicStateFile.js";
import { deriveTransactionSubkey } from "./installation.js";
import { transactionManifestV2Schema } from "./schemas.js";
import { transactionWorkspaceStateDirectory } from "./stateRoot.js";
import { TransactionError, type DirectorySyncCapability, type TransactionManifestV2 } from "./types.js";

export class TransactionManifestV2Store {
  private readonly atomic: AtomicJsonFileStore<TransactionManifestV2>;
  private readonly key: Buffer;

  constructor(private readonly stateRoot: string, masterKey: Buffer) {
    this.atomic = new AtomicJsonFileStore(stateRoot, transactionManifestV2Schema);
    this.key = deriveTransactionSubkey(masterKey, "transaction-manifest-v2");
  }

  dispose(): void {
    this.key.fill(0);
  }

  private sign(manifest: Omit<TransactionManifestV2, "manifestMac"> | TransactionManifestV2): TransactionManifestV2 {
    const { manifestMac: _ignored, ...facts } = manifest as TransactionManifestV2;
    const manifestMac = createHmac("sha256", this.key)
      .update(canonicalJson(facts), "utf8")
      .digest("hex");
    return transactionManifestV2Schema.parse({ ...facts, manifestMac });
  }

  private verify(manifest: TransactionManifestV2): TransactionManifestV2 {
    const expected = this.sign(manifest).manifestMac;
    const actual = Buffer.from(manifest.manifestMac, "hex");
    const expectedBytes = Buffer.from(expected, "hex");
    if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction manifest authentication failed.");
    }
    return manifest;
  }

  read(workspaceStateKey: string, transactionId: string): TransactionManifestV2 {
    return this.verify(this.atomic.read(manifestPathFor(this.stateRoot, workspaceStateKey, transactionId)));
  }

  writeInitial(manifest: Omit<TransactionManifestV2, "manifestMac">): DirectorySyncCapability {
    if (manifest.generation !== 1 || manifest.state !== "preparing") {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Initial V2 transaction manifest must be generation 1 and preparing.");
    }
    const signed = this.sign(manifest);
    const file = manifestPathFor(this.stateRoot, signed.workspaceStateKey, signed.transactionId);
    if (fs.existsSync(file)) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Initial transaction manifest already exists.");
    }
    return this.atomic.write(file, signed);
  }

  writeNext(previous: TransactionManifestV2, next: Omit<TransactionManifestV2, "manifestMac"> | TransactionManifestV2): DirectorySyncCapability {
    const verifiedPrevious = this.verify(transactionManifestV2Schema.parse(previous));
    const signedNext = this.sign(next);
    if (
      signedNext.schemaVersion !== 2 ||
      signedNext.transactionId !== verifiedPrevious.transactionId ||
      signedNext.changeSetId !== verifiedPrevious.changeSetId ||
      signedNext.workspaceStateKey !== verifiedPrevious.workspaceStateKey ||
      signedNext.generation !== verifiedPrevious.generation + 1
    ) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "V2 transaction manifest transition is not monotonic.");
    }
    const persisted = this.read(verifiedPrevious.workspaceStateKey, verifiedPrevious.transactionId);
    if (persisted.generation !== verifiedPrevious.generation || persisted.manifestMac !== verifiedPrevious.manifestMac) {
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "V2 transaction manifest transition is stale.");
    }
    return this.atomic.write(
      manifestPathFor(this.stateRoot, signedNext.workspaceStateKey, signedNext.transactionId),
      signedNext
    );
  }

  list(workspaceStateKey: string): TransactionManifestV2[] {
    const directory = transactionWorkspaceStateDirectory(this.stateRoot, "transactions", workspaceStateKey);
    let names: string[];
    try {
      names = fs.readdirSync(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction manifest directory is unreadable.");
    }
    const result: TransactionManifestV2[] = [];
    for (const name of names.filter((value) => /^tx_[a-f0-9]{32}\.json$/.test(value)).sort()) {
      const file = path.join(directory, name);
      let version: unknown;
      try {
        version = JSON.parse(fs.readFileSync(file, "utf8")).schemaVersion;
      } catch {
        throw new TransactionError("TRANSACTION_STATE_CORRUPT", "Transaction manifest is unreadable.");
      }
      if (version !== 2) continue;
      result.push(this.verify(this.atomic.read(file)));
    }
    return result;
  }
}
