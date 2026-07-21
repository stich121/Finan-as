import type { Category, CreateCategoryInput, UpdateCategoryInput } from "@financas/shared";
import { api } from "../lib/api";

export const categoriesApi = {
  list: () => api.get<Category[]>("/categories").then((r) => r.data),
  create: (input: CreateCategoryInput) => api.post<Category>("/categories", input).then((r) => r.data),
  update: (id: string, input: UpdateCategoryInput) =>
    api.patch<Category>(`/categories/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/categories/${id}`),
};
