import { prisma } from "../../lib/prisma.js";
import { toNumber } from "../../lib/serialize.js";

function monthRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, mon - 1, 1));
  const to = new Date(Date.UTC(year, mon, 0));
  return { from, to };
}

export async function getSummary(userId: string, month: string) {
  const { from, to } = monthRange(month);

  const [accounts, monthTx, spendingByCategory] = await Promise.all([
    prisma.account.findMany({ where: { userId, archived: false } }),
    prisma.transaction.findMany({ where: { userId, date: { gte: from, lte: to } } }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "EXPENSE", date: { gte: from, lte: to }, categoryId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const totalBalance = accounts.reduce((sum, a) => sum + toNumber(a.balance), 0);
  const income = monthTx.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + toNumber(t.amount), 0);
  const expense = monthTx
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + Math.abs(toNumber(t.amount)), 0);

  const categoryIds = spendingByCategory.map((s) => s.categoryId).filter((id): id is string => !!id);
  const categories = await prisma.category.findMany({ where: { id: { in: categoryIds } } });
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const spending = spendingByCategory
    .filter((s) => s.categoryId)
    .map((s) => ({
      categoryId: s.categoryId!,
      categoryName: categoryMap.get(s.categoryId!)?.name ?? "Sem categoria",
      color: categoryMap.get(s.categoryId!)?.color ?? "#94a3b8",
      total: Math.abs(toNumber(s._sum.amount)),
    }))
    .sort((a, b) => b.total - a.total);

  return { totalBalance, income, expense, net: income - expense, spendingByCategory: spending };
}

export async function getMonthlyTrend(userId: string, months: number) {
  const now = new Date();
  const results = [];

  for (let i = months - 1; i >= 0; i--) {
    const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, "0")}`;
    const { from, to } = monthRange(month);

    const tx = await prisma.transaction.findMany({
      where: { userId, date: { gte: from, lte: to }, type: { in: ["INCOME", "EXPENSE"] } },
    });
    const income = tx.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + toNumber(t.amount), 0);
    const expense = tx.filter((t) => t.type === "EXPENSE").reduce((sum, t) => sum + Math.abs(toNumber(t.amount)), 0);

    results.push({ month, income, expense, net: income - expense });
  }

  return results;
}
