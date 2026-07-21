import type { CategoryRule, CreateRuleInput, UpdateRuleInput } from "@financas/shared";
import { api } from "../lib/api";

export const rulesApi = {
  list: () => api.get<CategoryRule[]>("/rules").then((r) => r.data),
  create: (input: CreateRuleInput) => api.post<CategoryRule>("/rules", input).then((r) => r.data),
  update: (id: string, input: UpdateRuleInput) => api.patch<CategoryRule>(`/rules/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/rules/${id}`),
};
