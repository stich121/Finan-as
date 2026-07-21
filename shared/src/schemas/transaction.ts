import { z } from "zod";
import { TRANSACTION_TYPES } from "../enums.js";

export const createTransactionSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  type: z.enum(TRANSACTION_TYPES),
  amount: z.number().finite().refine((v) => v !== 0, "O valor não pode ser zero"),
  date: z.coerce.date(),
  description: z.string().trim().min(1, "Informe uma descrição").max(255),
  payee: z.string().trim().max(255).optional(),
  memo: z.string().trim().max(500).optional(),
  tagIds: z.array(z.string()).optional(),
  transferAccountId: z.string().nullable().optional(),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = createTransactionSchema.partial();
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const bulkCategorizeSchema = z.object({
  transactionIds: z.array(z.string()).min(1),
  categoryId: z.string().nullable(),
  createRule: z.boolean().optional(),
});
export type BulkCategorizeInput = z.infer<typeof bulkCategorizeSchema>;

export const transactionFilterSchema = z.object({
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().max(255).optional(),
  uncategorizedOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type TransactionFilterInput = z.infer<typeof transactionFilterSchema>;
