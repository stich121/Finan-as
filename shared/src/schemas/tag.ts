import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().max(20).default("#64748b"),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;
