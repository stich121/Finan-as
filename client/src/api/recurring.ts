import type { CreateRecurringInput, RecurringTransaction, UpdateRecurringInput } from "@financas/shared";
import { api } from "../lib/api";

export const recurringApi = {
  list: () => api.get<RecurringTransaction[]>("/recurring").then((r) => r.data),
  create: (input: CreateRecurringInput) => api.post<RecurringTransaction>("/recurring", input).then((r) => r.data),
  update: (id: string, input: UpdateRecurringInput) =>
    api.patch<RecurringTransaction>(`/recurring/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/recurring/${id}`),
  postNow: (id: string) => api.post(`/recurring/${id}/post`),
};
