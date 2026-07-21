import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import type { CreateRuleInput, UpdateRuleInput } from "@financas/shared";
import type { CategoryRule as PrismaRule } from "@prisma/client";
import { ruleMatches, extractPattern, type MatchableTransaction } from "./matcher.js";
import { DEFAULT_RULES } from "./default-rules.js";

function toRule(row: PrismaRule) {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    matchField: row.matchField,
    matchType: row.matchType,
    pattern: row.pattern,
    priority: row.priority,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listRules(userId: string) {
  const rows = await prisma.categoryRule.findMany({
    where: { userId },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(toRule);
}

export async function createRule(userId: string, input: CreateRuleInput) {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
  if (!category) throw notFound("Categoria não encontrada");

  const row = await prisma.categoryRule.create({
    data: {
      userId,
      categoryId: input.categoryId,
      matchField: input.matchField,
      matchType: input.matchType,
      pattern: input.pattern,
      priority: input.priority,
      enabled: input.enabled,
    },
  });
  return toRule(row);
}

export async function updateRule(userId: string, id: string, input: UpdateRuleInput) {
  const existing = await prisma.categoryRule.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Regra não encontrada");

  const row = await prisma.categoryRule.update({ where: { id }, data: input });
  return toRule(row);
}

export async function deleteRule(userId: string, id: string) {
  const existing = await prisma.categoryRule.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Regra não encontrada");
  await prisma.categoryRule.delete({ where: { id } });
}

export async function listActiveRulesSorted(userId: string) {
  return prisma.categoryRule.findMany({
    where: { userId, enabled: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
}

/** Retorna o categoryId sugerido pela primeira regra habilitada que casar, respeitando prioridade. */
export function matchCategory(rules: PrismaRule[], tx: MatchableTransaction): string | null {
  const match = rules.find((rule) => ruleMatches(rule, tx));
  return match?.categoryId ?? null;
}

/** Retorna o categoryId sugerido pela primeira regra habilitada que casar, respeitando prioridade. */
export async function suggestCategory(userId: string, tx: MatchableTransaction): Promise<string | null> {
  const rules = await listActiveRulesSorted(userId);
  return matchCategory(rules, tx);
}

/**
 * Aplica o loop de aprendizado: quando o usuário recategoriza manualmente uma transação,
 * cria (ou atualiza) uma regra "contains" baseada no texto da transação para automatizar
 * futuras categorizações semelhantes.
 */
export async function learnFromCorrection(userId: string, categoryId: string, tx: MatchableTransaction) {
  const source = tx.payee?.trim() || tx.description.trim();
  const pattern = extractPattern(source);
  if (!pattern) return;

  const existing = await prisma.categoryRule.findFirst({
    where: { userId, matchField: "DESCRIPTION", matchType: "CONTAINS", pattern },
  });

  if (existing) {
    await prisma.categoryRule.update({ where: { id: existing.id }, data: { categoryId } });
  } else {
    await prisma.categoryRule.create({
      data: {
        userId,
        categoryId,
        matchField: "DESCRIPTION",
        matchType: "CONTAINS",
        pattern,
        priority: 200,
        enabled: true,
      },
    });
  }
}

export async function createDefaultRulesForUser(userId: string) {
  const categories = await prisma.category.findMany({ where: { userId } });
  const byName = new Map(categories.map((c) => [c.name, c.id]));

  const data = DEFAULT_RULES.filter((r) => byName.has(r.categoryName)).map((r) => ({
    userId,
    categoryId: byName.get(r.categoryName)!,
    matchField: "DESCRIPTION" as const,
    matchType: "CONTAINS" as const,
    pattern: r.pattern,
    priority: 50,
    enabled: true,
  }));

  if (data.length) {
    await prisma.categoryRule.createMany({ data });
  }
}
