import { z } from "zod";

export const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Formato esperado: AAAA-MM"),
  amount: z.number().finite().positive("Informe um valor maior que zero"),
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = z.object({
  amount: z.number().finite().positive(),
});
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
