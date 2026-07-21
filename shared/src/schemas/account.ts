import { z } from "zod";
import { ACCOUNT_TYPES } from "../enums.js";

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(120),
  type: z.enum(ACCOUNT_TYPES),
  institution: z.string().trim().max(120).optional(),
  initialBalance: z.number().finite().default(0),
  color: z.string().trim().max(20).optional(),
  archived: z.boolean().optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = createAccountSchema.partial();
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const adjustBalanceSchema = z.object({
  newBalance: z.number().finite(),
  note: z.string().trim().max(255).optional(),
});
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
