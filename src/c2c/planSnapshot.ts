import fs from "node:fs";
import path from "node:path";
import type { CodexGPTConfig } from "../config.js";
import { readGuidanceText } from "../guidance/safeTextReader.js";
import { formatMessage } from "./messages.js";
import type { C2CMessage } from "./types.js";
import { assertSecretFree, sessionError } from "./sessionSchema.js";
import { canonicalDirectory } from "./storagePaths.js";

export type PlanReadConfig = Pick<CodexGPTConfig, "blockedGlobs" | "maxReadBytes">;
export interface PlanSnapshot { readonly text: string; readonly sha256: string; readonly bytes: number; readonly taskId: string; readonly iteration: number }
export async function readPlanSnapshot(root: string, plan: Extract<C2CMessage, { state: "PLAN" }>, config: PlanReadConfig): Promise<PlanSnapshot> {
  try {
    formatMessage(plan);
    if (plan.state !== "PLAN" || !config || !Array.isArray(config.blockedGlobs) || config.blockedGlobs.some(g => typeof g !== "string") || !Number.isSafeInteger(config.maxReadBytes) || config.maxReadBytes < 1 || config.maxReadBytes > 8 * 1024 * 1024) return sessionError("PLAN_READ_FAILED");
    const canonicalRoot = canonicalDirectory(root);
    // Reject even internal aliases: the executor consumes this exact plan artifact.
    canonicalDirectory(path.join(canonicalRoot, ".ai-bridge"));
    if (fs.lstatSync(path.join(canonicalRoot, plan.planPath)).isSymbolicLink()) return sessionError("PLAN_READ_FAILED");
    const result = await readGuidanceText({ root: canonicalRoot, relativePath: ".ai-bridge/current-plan.md", maxBytes: config.maxReadBytes, blockedGlobs: config.blockedGlobs });
    if (!result.ok) return sessionError("PLAN_READ_FAILED");
    if (result.rawSha256 !== plan.planSha256 || result.sourceBytes !== plan.planBytes) return sessionError("PLAN_MISMATCH");
    assertSecretFree(result.text);
    return Object.freeze({ text: result.text, sha256: result.rawSha256, bytes: result.sourceBytes, taskId: plan.taskId, iteration: plan.iteration });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && ["SECRET_BLOCKED", "PLAN_MISMATCH"].includes(String(e.code))) throw e;
    return sessionError("PLAN_READ_FAILED");
  }
}
