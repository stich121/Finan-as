import type {
  BulkCategorizeInput,
  CreateTransactionInput,
  PaginatedResult,
  Transaction,
  TransactionFilterInput,
  UpdateTransactionInput,
} from "@financas/shared";
import { api } from "../lib/api";

export const transactionsApi = {
  list: (filters: Partial<TransactionFilterInput>) =>
    api.get<PaginatedResult<Transaction>>("/transactions", { params: filters }).then((r) => r.data),
  get: (id: string) => api.get<Transaction>(`/transactions/${id}`).then((r) => r.data),
  create: (input: CreateTransactionInput) => api.post<Transaction>("/transactions", input).then((r) => r.data),
  update: (id: string, input: UpdateTransactionInput) =>
    api.patch<Transaction>(`/transactions/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/transactions/${id}`),
  bulkCategorize: (input: BulkCategorizeInput) => api.post("/transactions/bulk-categorize", input),
  categorize: (id: string, categoryId: string, createRule: boolean) =>
    api.post<Transaction>(`/transactions/${id}/categorize`, { categoryId, createRule }).then((r) => r.data),
};
