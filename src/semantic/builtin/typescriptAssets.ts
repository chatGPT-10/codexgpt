import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fsp from "node:fs/promises";
import path from "node:path";
import { readGuidanceText } from "../../guidance/safeTextReader.js";

export interface TypeScriptLibraryAsset {
  path: string;
  text: string;
  asset: true;
}

export interface TypeScriptLibraryAssets {
  files: readonly TypeScriptLibraryAsset[];
  manifestDigest: string;
  totalBytes: number;
}

let cached: Promise<TypeScriptLibraryAssets> | null = null;
const EXPECTED_TYPESCRIPT_VERSION = "5.9.3";
const EXPECTED_LIBRARY_MANIFEST = "sha256:6cc3a81e068c391ef34085a60ee458dca099a46bbc376c2606c97a525d7a70bb";

export function loadTypeScriptLibraryAssets(): Promise<TypeScriptLibraryAssets> {
  cached ??= (async () => {
    const require = createRequire(import.meta.url);
    const packageRoot = path.dirname(require.resolve("typescript/package.json"));
    const packageMetadata = await readGuidanceText({
      root: packageRoot,
      relativePath: "package.json",
      maxBytes: 256 * 1024,
      blockedGlobs: []
    });
    if (!packageMetadata.ok) throw new Error("TypeScript package metadata is unavailable.");
    const packageVersion = JSON.parse(packageMetadata.text) as { version?: unknown };
    if (packageVersion.version !== EXPECTED_TYPESCRIPT_VERSION) {
      throw new Error("TypeScript package version does not match the reviewed engine.");
    }
    const libraryRoot = path.join(packageRoot, "lib");
    const entries = (await fsp.readdir(libraryRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^lib(?:\.[a-z0-9_-]+)*\.d\.ts$/u.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    if (entries.length < 1 || entries.length > 256) {
      throw new Error("TypeScript standard-library asset inventory is invalid.");
    }
    const files: TypeScriptLibraryAsset[] = [];
    let totalBytes = 0;
    const manifest = createHash("sha256").update("codexgpt.typescript.assets.v1\0", "utf8");
    for (const name of entries) {
      const read = await readGuidanceText({
        root: libraryRoot,
        relativePath: name,
        maxBytes: 2 * 1024 * 1024,
        blockedGlobs: []
      });
      if (!read.ok) throw new Error("TypeScript standard-library asset is unavailable.");
      totalBytes += read.sourceBytes;
      if (totalBytes > 16 * 1024 * 1024) {
        throw new Error("TypeScript standard-library assets exceed the byte limit.");
      }
      const digest = createHash("sha256").update(read.text, "utf8").digest("hex");
      manifest.update(name, "utf8").update("\0").update(digest, "utf8").update("\0");
      files.push(Object.freeze({ path: name, text: read.text, asset: true as const }));
    }
    const manifestDigest = `sha256:${manifest.digest("hex")}`;
    if (manifestDigest !== EXPECTED_LIBRARY_MANIFEST) {
      throw new Error("TypeScript standard-library manifest does not match the reviewed engine.");
    }
    return Object.freeze({
      files: Object.freeze(files),
      manifestDigest,
      totalBytes
    });
  })().catch((error) => {
    cached = null;
    throw error;
  });
  return cached;
}
