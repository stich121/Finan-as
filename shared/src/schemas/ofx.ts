import { z } from "zod";

export const stagedOfxTransactionSchema = z.object({
  fitId: z.string(),
  date: z.coerce.date(),
  amount: z.number().finite(),
  type: z.string(),
  description: z.string(),
  payee: z.string().optional(),
  memo: z.string().optional(),
  checkNumber: z.string().optional(),
  isDuplicate: z.boolean().default(false),
  suggestedCategoryId: z.string().nullable().optional(),
});
export type StagedOfxTransaction = z.infer<typeof stagedOfxTransactionSchema>;

export const ofxPreviewResultSchema = z.object({
  stagingId: z.string(),
  accountId: z.string(),
  bankAccountId: z.string().optional(),
  currency: z.string().optional(),
  statementStart: z.coerce.date().optional(),
  statementEnd: z.coerce.date().optional(),
  transactions: z.array(stagedOfxTransactionSchema),
});
export type OfxPreviewResult = z.infer<typeof ofxPreviewResultSchema>;

export const confirmOfxImportSchema = z.object({
  stagingId: z.string().min(1),
  accountId: z.string().min(1),
  fitIds: z.array(z.string()).min(1),
});
export type ConfirmOfxImportInput = z.infer<typeof confirmOfxImportSchema>;
