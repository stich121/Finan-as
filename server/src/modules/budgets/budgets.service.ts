import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { toNumber } from "../../lib/serialize.js";
import type { CreateBudgetInput, UpdateBudgetInput } from "@financas/shared";

function monthRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, mon - 1, 1));
  const to = new Date(Date.UTC(year, mon, 0));
  return { from, to };
}

export async function listBudgets(userId: string, month: string) {
  const { from, to } = monthRange(month);
  const budgets = await prisma.budget.findMany({ where: { userId, month }, include: { category: true } });

  const spentByCategory = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, type: "EXPENSE", date: { gte: from, lte: to }, categoryId: { not: null } },
    _sum: { amount: true },
  });
  const spentMap = new Map(spentByCategory.map((s) => [s.categoryId, Math.abs(toNumber(s._sum.amount))]));

  return budgets.map((b) => ({
    id: b.id,
    userId: b.userId,
    categoryId: b.categoryId,
    categoryName: b.category.name,
    categoryColor: b.category.color,
    month: b.month,
    amount: toNumber(b.amount),
    spent: spentMap.get(b.categoryId) ?? 0,
  }));
}

export async function upsertBudget(userId: string, input: CreateBudgetInput) {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
  if (!category) throw notFound("Categoria não encontrada");

  const budget = await prisma.budget.upsert({
    where: { userId_categoryId_month: { userId, categoryId: input.categoryId, month: input.month } },
    create: { userId, categoryId: input.categoryId, month: input.month, amount: input.amount },
    update: { amount: input.amount },
  });
  return { id: budget.id, categoryId: budget.categoryId, month: budget.month, amount: toNumber(budget.amount) };
}

export async function updateBudget(userId: string, id: string, input: UpdateBudgetInput) {
  const existing = await prisma.budget.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Orçamento não encontrado");
  const budget = await prisma.budget.update({ where: { id }, data: { amount: input.amount } });
  return { id: budget.id, categoryId: budget.categoryId, month: budget.month, amount: toNumber(budget.amount) };
}

export async function deleteBudget(userId: string, id: string) {
  const existing = await prisma.budget.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Orçamento não encontrado");
  await prisma.budget.delete({ where: { id } });
}
