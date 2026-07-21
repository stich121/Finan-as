import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import { toNumber } from "../../lib/serialize.js";
import * as rulesService from "../rules/rules.service.js";
import { newTokenId } from "../../lib/hash-token.js";
import type {
  BulkCategorizeInput,
  CreateTransactionInput,
  TransactionFilterInput,
  UpdateTransactionInput,
} from "@financas/shared";
import type { Prisma, Transaction as PrismaTransaction, Tag } from "@prisma/client";

type TxWithRelations = PrismaTransaction & { tags: Tag[] };

function toTransaction(row: TxWithRelations) {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    categoryId: row.categoryId,
    type: row.type,
    amount: toNumber(row.amount),
    date: row.date.toISOString().slice(0, 10),
    description: row.description,
    payee: row.payee,
    memo: row.memo,
    fitId: row.fitId,
    transferAccountId: row.transferAccountId,
    transferGroupId: row.transferGroupId,
    source: row.source,
    tags: row.tags.map((t) => ({ id: t.id, userId: t.userId, name: t.name, color: t.color })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureOwnedAccount(userId: string, accountId: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw notFound("Conta não encontrada");
  return account;
}

async function ensureOwnedCategory(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) throw notFound("Categoria não encontrada");
}

async function ensureOwnedTags(userId: string, tagIds: string[] | undefined) {
  if (!tagIds?.length) return [];
  const tags = await prisma.tag.findMany({ where: { id: { in: tagIds }, userId } });
  if (tags.length !== tagIds.length) throw notFound("Alguma tag informada não foi encontrada");
  return tags;
}

export async function listTransactions(userId: string, filters: TransactionFilterInput) {
  const where: Prisma.TransactionWhereInput = { userId };
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.type) where.type = filters.type;
  if (filters.uncategorizedOnly) where.categoryId = null;
  if (filters.from || filters.to) {
    where.date = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.search) {
    where.OR = [
      { description: { contains: filters.search } },
      { payee: { contains: filters.search } },
      { memo: { contains: filters.search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { tags: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: items.map(toTransaction),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export async function getTransaction(userId: string, id: string) {
  const row = await prisma.transaction.findFirst({ where: { id, userId }, include: { tags: true } });
  if (!row) throw notFound("Transação não encontrada");
  return toTransaction(row);
}

function signedAmount(type: "INCOME" | "EXPENSE" | "TRANSFER", magnitude: number) {
  return type === "EXPENSE" ? -magnitude : magnitude;
}

export async function createTransaction(userId: string, input: CreateTransactionInput) {
  const account = await ensureOwnedAccount(userId, input.accountId);
  await ensureOwnedCategory(userId, input.categoryId);
  const tags = await ensureOwnedTags(userId, input.tagIds);
  const magnitude = Math.abs(input.amount);

  let categoryId = input.categoryId ?? null;
  if (!categoryId && input.type !== "TRANSFER") {
    categoryId = await rulesService.suggestCategory(userId, {
      description: input.description,
      payee: input.payee,
      memo: input.memo,
    });
  }

  if (input.type === "TRANSFER") {
    if (!input.transferAccountId) throw badRequest("Informe a conta de destino da transferência");
    const destAccount = await ensureOwnedAccount(userId, input.transferAccountId);
    if (destAccount.id === account.id) throw badRequest("A conta de origem e destino não podem ser iguais");

    const groupId = newTokenId();
    const [outLeg] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          accountId: account.id,
          type: "TRANSFER",
          amount: -magnitude,
          date: input.date,
          description: input.description,
          payee: input.payee,
          memo: input.memo,
          transferAccountId: destAccount.id,
          transferGroupId: groupId,
          tags: { connect: tags.map((t) => ({ id: t.id })) },
        },
        include: { tags: true },
      }),
      prisma.transaction.create({
        data: {
          userId,
          accountId: destAccount.id,
          type: "TRANSFER",
          amount: magnitude,
          date: input.date,
          description: input.description,
          payee: input.payee,
          memo: input.memo,
          transferAccountId: account.id,
          transferGroupId: groupId,
        },
      }),
      prisma.account.update({ where: { id: account.id }, data: { balance: { decrement: magnitude } } }),
      prisma.account.update({ where: { id: destAccount.id }, data: { balance: { increment: magnitude } } }),
    ]);
    return toTransaction(outLeg);
  }

  const amount = signedAmount(input.type, magnitude);
  const [row] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId,
        type: input.type,
        amount,
        date: input.date,
        description: input.description,
        payee: input.payee,
        memo: input.memo,
        tags: { connect: tags.map((t) => ({ id: t.id })) },
      },
      include: { tags: true },
    }),
    prisma.account.update({ where: { id: account.id }, data: { balance: { increment: amount } } }),
  ]);
  return toTransaction(row);
}

export async function updateTransaction(userId: string, id: string, input: UpdateTransactionInput) {
  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Transação não encontrada");
  if (existing.transferGroupId) {
    throw badRequest("Transferências não podem ser editadas; exclua e crie uma nova");
  }

  await ensureOwnedCategory(userId, input.categoryId);
  const tags = input.tagIds !== undefined ? await ensureOwnedTags(userId, input.tagIds) : undefined;

  const nextType = input.type ?? existing.type;
  const nextMagnitude = input.amount !== undefined ? Math.abs(input.amount) : Math.abs(toNumber(existing.amount));
  const nextAmount = signedAmount(nextType as "INCOME" | "EXPENSE", nextMagnitude);
  const balanceDiff = Number((nextAmount - toNumber(existing.amount)).toFixed(2));

  const [row] = await prisma.$transaction([
    prisma.transaction.update({
      where: { id },
      data: {
        categoryId: input.categoryId,
        type: input.type,
        amount: nextAmount,
        date: input.date,
        description: input.description,
        payee: input.payee,
        memo: input.memo,
        ...(tags ? { tags: { set: tags.map((t) => ({ id: t.id })) } } : {}),
      },
      include: { tags: true },
    }),
    ...(balanceDiff !== 0
      ? [prisma.account.update({ where: { id: existing.accountId }, data: { balance: { increment: balanceDiff } } })]
      : []),
  ]);
  return toTransaction(row);
}

export async function deleteTransaction(userId: string, id: string) {
  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Transação não encontrada");

  if (existing.transferGroupId) {
    const legs = await prisma.transaction.findMany({ where: { transferGroupId: existing.transferGroupId, userId } });
    await prisma.$transaction([
      ...legs.map((leg) =>
        prisma.account.update({ where: { id: leg.accountId }, data: { balance: { decrement: toNumber(leg.amount) } } }),
      ),
      prisma.transaction.deleteMany({ where: { transferGroupId: existing.transferGroupId, userId } }),
    ]);
    return;
  }

  await prisma.$transaction([
    prisma.account.update({
      where: { id: existing.accountId },
      data: { balance: { decrement: toNumber(existing.amount) } },
    }),
    prisma.transaction.delete({ where: { id } }),
  ]);
}

export async function bulkCategorize(userId: string, input: BulkCategorizeInput) {
  await ensureOwnedCategory(userId, input.categoryId);
  const owned = await prisma.transaction.findMany({ where: { id: { in: input.transactionIds }, userId } });
  if (owned.length !== input.transactionIds.length) throw notFound("Alguma transação informada não foi encontrada");

  await prisma.transaction.updateMany({
    where: { id: { in: input.transactionIds }, userId },
    data: { categoryId: input.categoryId },
  });

  if (input.createRule && input.categoryId && owned[0]) {
    await rulesService.learnFromCorrection(userId, input.categoryId, {
      description: owned[0].description,
      payee: owned[0].payee,
      memo: owned[0].memo,
    });
  }
}

export async function categorizeWithFeedback(userId: string, id: string, categoryId: string, createRule: boolean) {
  await ensureOwnedCategory(userId, categoryId);
  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Transação não encontrada");

  const row = await prisma.transaction.update({ where: { id }, data: { categoryId }, include: { tags: true } });

  if (createRule) {
    await rulesService.learnFromCorrection(userId, categoryId, {
      description: existing.description,
      payee: existing.payee,
      memo: existing.memo,
    });
  }

  return toTransaction(row);
}
