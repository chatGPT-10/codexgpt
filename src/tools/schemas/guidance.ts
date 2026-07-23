import { z } from "zod";

export const guidanceDiagnosticSchema = z.object({
  status: z.enum(["warning", "unavailable"]),
  code: z.string().min(1).max(120),
  path: z.string().min(1).max(1024).nullable(),
  count: z.number().int().min(1).max(10_000),
  action: z.string().min(1).max(500)
}).strict();

export const guidanceInstructionFileSchema = z.object({
  path: z.string().min(1).max(1024),
  text: z.string().max(200_000),
  source_bytes: z.number().int().nonnegative(),
  returned_bytes: z.number().int().nonnegative(),
  redacted: z.boolean()
}).strict();

export const standardSkillCatalogEntrySchema = z.object({
  name: z.string().min(1).max(240),
  description: z.string().min(1).max(4_000),
  source: z.enum(["workspace", "user", "plugin", "other"]),
  path: z.string().min(1).max(2048),
  compatibility: z.string().min(1).max(1_000).nullable(),
  loadable: z.boolean(),
  implicit_eligible: z.boolean(),
  requirements_state: z.enum(["none", "declared_unverified"]),
  spec_compliant: z.boolean()
}).strict();

export const standardSkillScanSchema = z.object({
  candidate_count: z.number().int().nonnegative(),
  valid_count: z.number().int().nonnegative(),
  invalid_count: z.number().int().nonnegative(),
  scan_complete: z.boolean(),
  scan_truncated: z.boolean(),
  returned_truncated: z.boolean(),
  catalog_complete: z.boolean(),
  catalog_omitted_count: z.number().int().nonnegative(),
  descriptions_shortened: z.number().int().nonnegative(),
  catalog_chars: z.number().int().nonnegative(),
  ineligible_count: z.number().int().nonnegative()
}).strict();
