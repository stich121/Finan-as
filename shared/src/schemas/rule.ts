import { z } from "zod";
import { RULE_MATCH_FIELDS, RULE_MATCH_TYPES } from "../enums.js";

export const createRuleSchema = z.object({
  categoryId: z.string().min(1),
  matchField: z.enum(RULE_MATCH_FIELDS).default("DESCRIPTION"),
  matchType: z.enum(RULE_MATCH_TYPES).default("CONTAINS"),
  pattern: z.string().trim().min(1, "Informe um padrão").max(255),
  priority: z.number().int().min(0).max(1000).default(100),
  enabled: z.boolean().default(true),
});
export type CreateRuleInput = z.infer<typeof createRuleSchema>;

export const updateRuleSchema = createRuleSchema.partial();
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

export const categorizeFeedbackSchema = z.object({
  transactionId: z.string().min(1),
  categoryId: z.string().min(1),
  createRule: z.boolean().default(false),
});
export type CategorizeFeedbackInput = z.infer<typeof categorizeFeedbackSchema>;
