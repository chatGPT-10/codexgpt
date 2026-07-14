import { z } from "zod";
import {
  changeSetIdSchema,
  transactionIdSchema
} from "../../transactions/schemas.js";
import type { TransactionResultV2 } from "../../changesets/types.js";

export const transactionResultV2Schema = z.object({
  change_set_id: changeSetIdSchema,
  transaction_id: transactionIdSchema,
  before_state: z.enum(["absent", "present", "mixed"]),
  operation_count: z.number().int().min(1).max(1_000),
  undo_supported: z.boolean(),
  committed_at: z.string().datetime({ offset: true })
}).strict() as z.ZodType<TransactionResultV2>;
