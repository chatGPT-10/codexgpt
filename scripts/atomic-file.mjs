import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

export async function writeJsonAtomicFile(targetPath, value, options = {}) {
  const target = path.resolve(targetPath);
  const temporary = `${target}.${process.pid}.${randomBytes(12).toString("hex")}.tmp`;
  const rename = options.rename ?? fsp.rename;
  const errors = [];
  let handle;
  let temporaryIdentity;
  try {
    handle = await fsp.open(temporary, "wx", 0o600);
    temporaryIdentity = await handle.stat({ bigint: true });
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } catch (error) {
    errors.push(error);
  }

  if (handle) {
    try {
      await handle.close();
    } catch (error) {
      errors.push(error);
    }
  }

  if (temporaryIdentity) {
    try {
      const current = await fsp.lstat(temporary, { bigint: true });
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        current.nlink !== 1n ||
        !sameIdentity(current, temporaryIdentity)
      ) {
        const error = new Error("ATOMIC_TEMP_IDENTITY_CHANGED");
        error.code = "ATOMIC_TEMP_IDENTITY_CHANGED";
        throw error;
      }
      await fsp.unlink(temporary);
    } catch (error) {
      if (error?.code !== "ENOENT") errors.push(error);
    }
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Atomic JSON write and cleanup failed.");
}
