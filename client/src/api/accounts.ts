import type { Account, AdjustBalanceInput, CreateAccountInput, UpdateAccountInput } from "@financas/shared";
import { api } from "../lib/api";

export const accountsApi = {
  list: (includeArchived = false) =>
    api.get<Account[]>("/accounts", { params: { includeArchived } }).then((r) => r.data),
  create: (input: CreateAccountInput) => api.post<Account>("/accounts", input).then((r) => r.data),
  update: (id: string, input: UpdateAccountInput) => api.patch<Account>(`/accounts/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/accounts/${id}`),
  adjustBalance: (id: string, input: AdjustBalanceInput) =>
    api.post<Account>(`/accounts/${id}/adjust-balance`, input).then((r) => r.data),
};
