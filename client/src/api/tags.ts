import type { Tag, CreateTagInput } from "@financas/shared";
import { api } from "../lib/api";

export const tagsApi = {
  list: () => api.get<Tag[]>("/tags").then((r) => r.data),
  create: (input: CreateTagInput) => api.post<Tag>("/tags", input).then((r) => r.data),
  remove: (id: string) => api.delete(`/tags/${id}`),
};
