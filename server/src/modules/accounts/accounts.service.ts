import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { toNumber } from "../../lib/serialize.js";
import type { AdjustBalanceInput, CreateAccountInput, UpdateAccountInput } from "@financas/shared";
import type { Account as PrismaAccount } from "@prisma/client";

function toAccount(row: PrismaAccount) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    institution: row.institution,
    balance: toNumber(row.balance),
    color: row.color,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAccounts(userId: string, includeArchived = false) {
  const rows = await prisma.account.findMany({
    where: { userId, ...(includeArchived ? {} : { archived: false }) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toAccount);
}

export async function createAccount(userId: string, input: CreateAccountInput) {
  const row = await prisma.account.create({
    data: {
      userId,
      name: input.name,
      type: input.type,
      institution: input.institution ?? null,
      balance: input.initialBalance,
      color: input.color ?? null,
    },
  });
  return toAccount(row);
}

async function findOwnedAccount(userId: string, id: string) {
  const account = await prisma.account.findFirst({ where: { id, userId } });
  if (!account) throw notFound("Conta não encontrada");
  return account;
}

export async function updateAccount(userId: string, id: string, input: UpdateAccountInput) {
  await findOwnedAccount(userId, id);
  const row = await prisma.account.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      institution: input.institution,
      color: input.color,
      archived: input.archived,
    },
  });
  return toAccount(row);
}

export async function deleteAccount(userId: string, id: string) {
  await findOwnedAccount(userId, id);
  await prisma.account.delete({ where: { id } });
}

export async function adjustBalance(userId: string, id: string, input: AdjustBalanceInput) {
  const account = await findOwnedAccount(userId, id);
  const currentBalance = toNumber(account.balance);
  const diff = Number((input.newBalance - currentBalance).toFixed(2));

  if (diff !== 0) {
    await prisma.$transaction([
      prisma.account.update({ where: { id }, data: { balance: input.newBalance } }),
      prisma.transaction.create({
        data: {
          userId,
          accountId: id,
          type: diff > 0 ? "INCOME" : "EXPENSE",
          amount: diff,
          date: new Date(),
          description: input.note?.trim() || "Ajuste de saldo",
          source: "MANUAL",
        },
      }),
    ]);
  }

  const updated = await prisma.account.findUniqueOrThrow({ where: { id } });
  return toAccount(updated);
}
