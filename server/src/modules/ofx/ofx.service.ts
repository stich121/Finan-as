import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import { newTokenId } from "../../lib/hash-token.js";
import { parseOfx, type RawOfxStatement } from "./parser.js";
import * as rulesService from "../rules/rules.service.js";
import type { ConfirmOfxImportInput, OfxPreviewResult } from "@financas/shared";

interface StagingEntry {
  userId: string;
  accountId: string;
  statement: RawOfxStatement;
  expiresAt: number;
}

const STAGING_TTL_MS = 30 * 60 * 1000;
const stagingStore = new Map<string, StagingEntry>();

function pruneExpired() {
  const now = Date.now();
  for (const [id, entry] of stagingStore) {
    if (entry.expiresAt < now) stagingStore.delete(id);
  }
}

export async function previewOfxImport(userId: string, accountId: string, buffer: Buffer): Promise<OfxPreviewResult> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw notFound("Conta não encontrada");

  let statements: RawOfxStatement[];
  try {
    statements = parseOfx(buffer);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Não foi possível ler o arquivo OFX");
  }

  const statement = statements[0];
  const fitIds = statement.transactions.map((t) => t.fitId);
  const existing = await prisma.transaction.findMany({
    where: { accountId, fitId: { in: fitIds } },
    select: { fitId: true },
  });
  const existingFitIds = new Set(existing.map((e) => e.fitId));

  pruneExpired();
  const stagingId = newTokenId();
  stagingStore.set(stagingId, { userId, accountId, statement, expiresAt: Date.now() + STAGING_TTL_MS });

  const rules = await rulesService.listActiveRulesSorted(userId);
  const transactions = statement.transactions.map((t) => ({
    fitId: t.fitId,
    date: t.date,
    amount: t.amount,
    type: t.type,
    description: t.description,
    payee: t.payee,
    memo: t.memo,
    checkNumber: t.checkNumber,
    isDuplicate: existingFitIds.has(t.fitId),
    suggestedCategoryId: rulesService.matchCategory(rules, {
      description: t.description,
      payee: t.payee,
      memo: t.memo,
    }),
  }));

  return {
    stagingId,
    accountId,
    bankAccountId: statement.bankAccountId,
    currency: statement.currency,
    statementStart: statement.statementStart ?? undefined,
    statementEnd: statement.statementEnd ?? undefined,
    transactions,
  };
}

export async function confirmOfxImport(userId: string, input: ConfirmOfxImportInput) {
  pruneExpired();
  const entry = stagingStore.get(input.stagingId);
  if (!entry || entry.userId !== userId || entry.accountId !== input.accountId) {
    throw badRequest("Pré-visualização de importação expirada. Envie o arquivo novamente.");
  }

  const account = await prisma.account.findFirst({ where: { id: input.accountId, userId } });
  if (!account) throw notFound("Conta não encontrada");

  const wanted = new Set(input.fitIds);
  const toImport = entry.statement.transactions.filter((t) => wanted.has(t.fitId));
  if (toImport.length === 0) {
    throw badRequest("Nenhuma transação selecionada para importar");
  }

  const existing = await prisma.transaction.findMany({
    where: { accountId: input.accountId, fitId: { in: [...wanted] } },
    select: { fitId: true },
  });
  const existingFitIds = new Set(existing.map((e) => e.fitId));
  const fresh = toImport.filter((t) => !existingFitIds.has(t.fitId));

  const rules = await rulesService.listActiveRulesSorted(userId);
  let totalDelta = 0;
  const rows = fresh.map((t) => {
    totalDelta += t.amount;
    return {
      id: newTokenId(),
      userId,
      accountId: input.accountId,
      categoryId: rulesService.matchCategory(rules, { description: t.description, payee: t.payee, memo: t.memo }),
      type: (t.amount >= 0 ? "INCOME" : "EXPENSE") as "INCOME" | "EXPENSE",
      amount: t.amount,
      date: t.date,
      description: t.description,
      payee: t.payee,
      memo: t.memo,
      fitId: t.fitId,
      source: "OFX" as const,
    };
  });

  if (rows.length > 0) {
    await prisma.transaction.createMany({ data: rows });
    await prisma.account.update({ where: { id: input.accountId }, data: { balance: { increment: totalDelta } } });
  }

  stagingStore.delete(input.stagingId);

  return { imported: rows.length, skippedDuplicates: toImport.length - fresh.length };
}
