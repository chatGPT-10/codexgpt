import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import type { GitObjectFormat } from "./parsers.js";
import { gateRError } from "./durableState.js";

export type GitObjectPromotionTransition =
  | "promotion_planned"
  | "promoted"
  | "already_present"
  | "failed";

export interface GitObjectPromotionEvent {
  oid: string;
  transition: GitObjectPromotionTransition;
}

export interface GitObjectPromotionResult {
  oid: string;
  status: "promoted" | "already_present";
}

const MAX_OBJECTS = 4096;
const MAX_COMPRESSED_OBJECT_BYTES = 64 * 1024 * 1024;
const MAX_INFLATED_OBJECT_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_COMPRESSED_BYTES = 128 * 1024 * 1024;

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function oidPattern(format: GitObjectFormat): RegExp {
  return format === "sha1" ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/;
}

function objectPath(root: string, oid: string): string {
  const resolvedRoot = path.resolve(root);
  const file = path.join(resolvedRoot, oid.slice(0, 2), oid.slice(2));
  if (!isInside(file, resolvedRoot)) throw gateRError();
  return file;
}

async function assertRealDirectory(directory: string): Promise<void> {
  try {
    const lexical = await fsp.lstat(directory);
    if (!lexical.isDirectory() || lexical.isSymbolicLink()) throw gateRError();
  } catch {
    throw gateRError();
  }
}

async function ensureDirectChildDirectory(parent: string, child: string): Promise<void> {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  if (!isInside(resolvedChild, resolvedParent) || path.dirname(resolvedChild) !== resolvedParent) throw gateRError();
  await assertRealDirectory(resolvedParent);
  try {
    await fsp.mkdir(resolvedChild, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw gateRError();
  }
  await assertRealDirectory(resolvedParent);
  await assertRealDirectory(resolvedChild);
}

async function readLooseObject(file: string, containmentRoot: string): Promise<Buffer> {
  try {
    const resolvedRoot = path.resolve(containmentRoot);
    if (!isInside(path.resolve(file), resolvedRoot)) throw gateRError();
    await assertRealDirectory(resolvedRoot);
    await assertRealDirectory(path.dirname(file));
    const lexical = await fsp.lstat(file);
    if (!lexical.isFile() || lexical.isSymbolicLink() || lexical.nlink !== 1 || lexical.size < 2 || lexical.size > MAX_COMPRESSED_OBJECT_BYTES) {
      throw gateRError();
    }
    const handle = await fsp.open(file, "r");
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(MAX_COMPRESSED_OBJECT_BYTES)) throw gateRError();
      const compressed = await handle.readFile();
      const after = await handle.stat({ bigint: true });
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) throw gateRError();
      return compressed;
    } finally {
      await handle.close();
    }
  } catch {
    throw gateRError();
  }
}

function verifyLooseObject(compressed: Buffer, oid: string, format: GitObjectFormat): void {
  let inflated: Buffer;
  try {
    inflated = inflateSync(compressed, { maxOutputLength: MAX_INFLATED_OBJECT_BYTES });
  } catch {
    throw gateRError();
  }
  try {
    const nul = inflated.indexOf(0);
    if (nul < 6 || nul > 80) throw gateRError();
    const header = inflated.subarray(0, nul).toString("ascii");
    const match = /^(blob|tree|commit|tag) ([0-9]+)$/.exec(header);
    if (!match) throw gateRError();
    const declared = Number(match[2]);
    if (!Number.isSafeInteger(declared) || declared !== inflated.length - nul - 1) throw gateRError();
    if (createHash(format).update(inflated).digest("hex") !== oid) throw gateRError();
  } finally {
    inflated.fill(0);
  }
}

async function verifyExistingDestination(
  file: string,
  objectRoot: string,
  oid: string,
  format: GitObjectFormat
): Promise<void> {
  const compressed = await readLooseObject(file, objectRoot);
  try {
    verifyLooseObject(compressed, oid, format);
  } finally {
    compressed.fill(0);
  }
}

async function destinationExists(file: string): Promise<boolean> {
  try {
    await fsp.lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw gateRError();
  }
}

async function inventoryLooseObjects(root: string, format: GitObjectFormat): Promise<string[]> {
  const resolvedRoot = path.resolve(root);
  await assertRealDirectory(resolvedRoot);
  const prefixes = await fsp.readdir(resolvedRoot, { withFileTypes: true }).catch(() => {
    throw gateRError();
  });
  if (prefixes.length > 256) throw gateRError();
  const suffixPattern = format === "sha1" ? /^[a-f0-9]{38}$/u : /^[a-f0-9]{62}$/u;
  const objects: string[] = [];
  for (const prefix of prefixes.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!/^[a-f0-9]{2}$/u.test(prefix.name) || !prefix.isDirectory() || prefix.isSymbolicLink()) throw gateRError();
    const directory = path.join(resolvedRoot, prefix.name);
    await assertRealDirectory(directory);
    const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => {
      throw gateRError();
    });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!suffixPattern.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) throw gateRError();
      objects.push(`${prefix.name}${entry.name}`);
      if (objects.length > MAX_OBJECTS) throw gateRError();
    }
  }
  return objects;
}

export class GitObjectQuarantine {
  readonly #journal: (event: GitObjectPromotionEvent) => void | Promise<void>;

  constructor(options: {
    journal: (event: GitObjectPromotionEvent) => void | Promise<void>;
  }) {
    this.#journal = options.journal;
  }

  async promoteAll(input: {
    repository: { commonDir: string; objectFormat: GitObjectFormat };
    quarantineRoot: string;
  }): Promise<GitObjectPromotionResult[]> {
    const objects = await inventoryLooseObjects(input.quarantineRoot, input.repository.objectFormat);
    if (objects.length === 0) return [];
    return this.promote({
      ...input,
      objects: objects.map((oid) => ({ oid }))
    });
  }

  async promote(input: {
    repository: { commonDir: string; objectFormat: GitObjectFormat };
    quarantineRoot: string;
    objects: Array<{ oid: string }>;
  }): Promise<GitObjectPromotionResult[]> {
    if (!Array.isArray(input.objects) || input.objects.length < 1 || input.objects.length > MAX_OBJECTS) throw gateRError();
    const unique = new Set<string>();
    for (const object of input.objects) {
      if (!oidPattern(input.repository.objectFormat).test(object.oid) || unique.has(object.oid)) throw gateRError();
      unique.add(object.oid);
    }
    const commonDir = path.resolve(input.repository.commonDir);
    const quarantineRoot = path.resolve(input.quarantineRoot);
    if (commonDir === quarantineRoot) throw gateRError();
    await assertRealDirectory(commonDir);
    await assertRealDirectory(quarantineRoot);
    const objectRoot = path.join(commonDir, "objects");
    await ensureDirectChildDirectory(commonDir, objectRoot);
    const results: GitObjectPromotionResult[] = [];
    let totalCompressedBytes = 0;

    for (const object of input.objects) {
      const source = objectPath(quarantineRoot, object.oid);
      const destination = objectPath(objectRoot, object.oid);
      await this.#journal({ oid: object.oid, transition: "promotion_planned" });
      try {
        if (await destinationExists(destination)) {
          await verifyExistingDestination(destination, objectRoot, object.oid, input.repository.objectFormat);
          await this.#journal({ oid: object.oid, transition: "already_present" });
          results.push({ oid: object.oid, status: "already_present" });
          continue;
        }
        const compressed = await readLooseObject(source, quarantineRoot);
        try {
          totalCompressedBytes += compressed.length;
          if (totalCompressedBytes > MAX_TOTAL_COMPRESSED_BYTES) throw gateRError();
          verifyLooseObject(compressed, object.oid, input.repository.objectFormat);

          await ensureDirectChildDirectory(objectRoot, path.dirname(destination));
          let handle: fsp.FileHandle | null = null;
          try {
            handle = await fsp.open(destination, "wx", 0o444);
            await handle.writeFile(compressed);
            await handle.sync();
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") {
              await verifyExistingDestination(destination, objectRoot, object.oid, input.repository.objectFormat);
              await this.#journal({ oid: object.oid, transition: "already_present" });
              results.push({ oid: object.oid, status: "already_present" });
              continue;
            }
            try { await fsp.unlink(destination); } catch { }
            throw gateRError();
          } finally {
            await handle?.close().catch(() => {});
          }
          await verifyExistingDestination(destination, objectRoot, object.oid, input.repository.objectFormat);
          await this.#journal({ oid: object.oid, transition: "promoted" });
          results.push({ oid: object.oid, status: "promoted" });
        } finally {
          compressed.fill(0);
        }
      } catch (error) {
        await Promise.resolve(this.#journal({ oid: object.oid, transition: "failed" })).catch(() => {});
        throw error instanceof Error && error.message === "GIT_RECOVERY_REQUIRED" ? error : gateRError();
      }
    }
    return results;
  }
}
