import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { toNumber } from "../../lib/serialize.js";
import type { CreateRecurringInput, UpdateRecurringInput } from "@financas/shared";
import type { RecurrenceFrequency } from "@financas/shared";

function addInterval(date: Date, frequency: RecurrenceFrequency): Date {
  const next = new Date(date);
  switch (frequency) {
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "BIWEEKLY":
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case "MONTHLY":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "YEARLY":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }
  return next;
}

function toRecurring(row: {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: string;
  amount: unknown;
  description: string;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  nextRunDate: Date;
  autoPost: boolean;
}) {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    categoryId: row.categoryId,
    type: row.type,
    amount: toNumber(row.amount as never),
    description: row.description,
    frequency: row.frequency,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    nextRunDate: row.nextRunDate.toISOString().slice(0, 10),
    autoPost: row.autoPost,
  };
}

export async function listRecurring(userId: string) {
  const rows = await prisma.recurringTransaction.findMany({ where: { userId }, orderBy: { nextRunDate: "asc" } });
  return rows.map(toRecurring);
}

export async function createRecurring(userId: string, input: CreateRecurringInput) {
  const account = await prisma.account.findFirst({ where: { id: input.accountId, userId } });
  if (!account) throw notFound("Conta não encontrada");

  const row = await prisma.recurringTransaction.create({
    data: {
      userId,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      amount: Math.abs(input.amount),
      description: input.description,
      frequency: input.frequency,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      nextRunDate: input.startDate,
      autoPost: input.autoPost,
    },
  });
  return toRecurring(row);
}

export async function updateRecurring(userId: string, id: string, input: UpdateRecurringInput) {
  const existing = await prisma.recurringTransaction.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Recorrência não encontrada");

  const row = await prisma.recurringTransaction.update({
    where: { id },
    data: {
      categoryId: input.categoryId,
      type: input.type,
      amount: input.amount !== undefined ? Math.abs(input.amount) : undefined,
      description: input.description,
      frequency: input.frequency,
      startDate: input.startDate,
      endDate: input.endDate,
      autoPost: input.autoPost,
    },
  });
  return toRecurring(row);
}

export async function deleteRecurring(userId: string, id: string) {
  const existing = await prisma.recurringTransaction.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Recorrência não encontrada");
  await prisma.recurringTransaction.delete({ where: { id } });
}

/** Lança manualmente a próxima ocorrência de uma recorrência como transação real e avança a data. */
export async function postNextOccurrence(userId: string, id: string) {
  const recurring = await prisma.recurringTransaction.findFirst({ where: { id, userId } });
  if (!recurring) throw notFound("Recorrência não encontrada");

  const signedAmount = recurring.type === "EXPENSE" ? -toNumber(recurring.amount) : toNumber(recurring.amount);

  const [transaction] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId,
        accountId: recurring.accountId,
        categoryId: recurring.categoryId,
        type: recurring.type,
        amount: signedAmount,
        date: recurring.nextRunDate,
        description: recurring.description,
        source: "MANUAL",
      },
    }),
    prisma.account.update({ where: { id: recurring.accountId }, data: { balance: { increment: signedAmount } } }),
    prisma.recurringTransaction.update({
      where: { id },
      data: { nextRunDate: addInterval(recurring.nextRunDate, recurring.frequency) },
    }),
  ]);

  return transaction;
}
