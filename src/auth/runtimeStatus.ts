import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AtomicJsonFileStore } from "../transactions/atomicStateFile.js";

export const OAuthRuntimeStatusV1Schema = z.object({
  schemaVersion: z.literal(1),
  profileId: z.string().regex(/^[a-f0-9]{24}$/),
  canonicalRoot: z.string().min(1).max(32768),
  bindingId: z.string().regex(/^binding_[a-f0-9]{32}$/),
  incarnationId: z.string().regex(/^incarnation_[a-f0-9]{32}$/),
  serverId: z.string().regex(/^[a-f0-9]{32}$/),
  pid: z.number().int().positive().safe(),
  processCreationTime: z.string().datetime({ offset: true }),
  localAdminOrigin: z.string().regex(/^http:\/\/127\.0\.0\.1:\d{1,5}$/),
  startedAt: z.string().datetime({ offset: true })
}).strict();

export type OAuthRuntimeStatusV1 = z.infer<typeof OAuthRuntimeStatusV1Schema>;

function runtimeDirectory(oauthStateRoot: string): string {
  return path.join(path.resolve(oauthStateRoot), "runtime", "profiles");
}

export function oauthRuntimeStatusPath(oauthStateRoot: string, profileId: string): string {
  if (!/^[a-f0-9]{24}$/.test(profileId)) throw new Error("OAUTH_RUNTIME_STATUS_INVALID");
  return path.join(runtimeDirectory(oauthStateRoot), `${profileId}.json`);
}

export function writeOAuthRuntimeStatus(
  oauthStateRoot: string,
  value: OAuthRuntimeStatusV1
): string {
  const parsed = OAuthRuntimeStatusV1Schema.parse(value);
  const filePath = oauthRuntimeStatusPath(oauthStateRoot, parsed.profileId);
  const store = new AtomicJsonFileStore(path.resolve(oauthStateRoot), OAuthRuntimeStatusV1Schema);
  store.write(filePath, parsed);
  return filePath;
}

export function readOAuthRuntimeStatus(
  oauthStateRoot: string,
  profileId: string
): OAuthRuntimeStatusV1 | null {
  const filePath = oauthRuntimeStatusPath(oauthStateRoot, profileId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const store = new AtomicJsonFileStore(path.resolve(oauthStateRoot), OAuthRuntimeStatusV1Schema);
    return store.read(filePath);
  } catch {
    return null;
  }
}

export function removeOAuthRuntimeStatus(
  oauthStateRoot: string,
  profileId: string,
  expected: { pid: number; serverId: string }
): boolean {
  const current = readOAuthRuntimeStatus(oauthStateRoot, profileId);
  if (!current || current.pid !== expected.pid || current.serverId !== expected.serverId) return false;
  fs.rmSync(oauthRuntimeStatusPath(oauthStateRoot, profileId), { force: true });
  return true;
}
