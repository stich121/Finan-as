import { z } from "zod";
import { CATEGORY_KIND } from "../enums.js";

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
  kind: z.enum(CATEGORY_KIND),
  parentId: z.string().nullable().optional(),
  color: z.string().trim().max(20).default("#64748b"),
  icon: z.string().trim().max(40).default("tag"),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
