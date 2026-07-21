import { z } from "zod";
import { RECURRENCE_FREQUENCIES, TRANSACTION_TYPES } from "../enums.js";

export const createRecurringSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  type: z.enum(TRANSACTION_TYPES),
  amount: z.number().finite().refine((v) => v !== 0, "O valor não pode ser zero"),
  description: z.string().trim().min(1).max(255),
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  autoPost: z.boolean().default(false),
});
export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;

export const updateRecurringSchema = createRecurringSchema.partial();
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;
