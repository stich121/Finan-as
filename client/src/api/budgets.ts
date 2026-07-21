import type { CreateBudgetInput, UpdateBudgetInput } from "@financas/shared";
import { api } from "../lib/api";

export interface BudgetWithSpent {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  month: string;
  amount: number;
  spent: number;
}

export const budgetsApi = {
  list: (month: string) => api.get<BudgetWithSpent[]>("/budgets", { params: { month } }).then((r) => r.data),
  upsert: (input: CreateBudgetInput) => api.post("/budgets", input).then((r) => r.data),
  update: (id: string, input: UpdateBudgetInput) => api.patch(`/budgets/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/budgets/${id}`),
};
