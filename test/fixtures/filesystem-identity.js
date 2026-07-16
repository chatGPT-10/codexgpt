import fsp from "node:fs/promises";

export function stableObjectIdentity(stat) {
  return { device: stat.dev, fileId: stat.ino };
}

export async function createDistinctReplacement(originalPath, replacementPath, contents) {
  await fsp.writeFile(replacementPath, contents);
  const [originalStat, replacementStat] = await Promise.all([
    fsp.stat(originalPath, { bigint: true }),
    fsp.stat(replacementPath, { bigint: true })
  ]);
  const originalIdentity = stableObjectIdentity(originalStat);
  const replacementIdentity = stableObjectIdentity(replacementStat);
  if (
    originalIdentity.device === replacementIdentity.device &&
    originalIdentity.fileId === replacementIdentity.fileId
  ) {
    throw new Error("Replacement fixture did not construct a distinct filesystem object identity.");
  }
  return { originalIdentity, replacementIdentity };
}
