import { prisma } from "../../lib/prisma.js";
import { conflict, notFound } from "../../lib/http-error.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "@financas/shared";
import { DEFAULT_CATEGORIES } from "./default-categories.js";
import { newTokenId } from "../../lib/hash-token.js";
import type { Category as PrismaCategory, Prisma } from "@prisma/client";

function toCategory(row: PrismaCategory) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    kind: row.kind,
    parentId: row.parentId,
    color: row.color,
    icon: row.icon,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCategories(userId: string) {
  const rows = await prisma.category.findMany({
    where: { userId },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });
  return rows.map(toCategory);
}

export async function createCategory(userId: string, input: CreateCategoryInput) {
  if (input.parentId) {
    const parent = await prisma.category.findFirst({ where: { id: input.parentId, userId } });
    if (!parent) throw notFound("Categoria pai não encontrada");
  }

  const row = await prisma.category.create({
    data: {
      userId,
      name: input.name,
      kind: input.kind,
      parentId: input.parentId ?? null,
      color: input.color,
      icon: input.icon,
    },
  });
  return toCategory(row);
}

export async function updateCategory(userId: string, id: string, input: UpdateCategoryInput) {
  const existing = await prisma.category.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Categoria não encontrada");

  if (input.parentId && input.parentId === id) {
    throw conflict("Uma categoria não pode ser pai dela mesma");
  }

  const row = await prisma.category.update({
    where: { id },
    data: {
      name: input.name,
      kind: input.kind,
      parentId: input.parentId,
      color: input.color,
      icon: input.icon,
    },
  });
  return toCategory(row);
}

export async function deleteCategory(userId: string, id: string) {
  const existing = await prisma.category.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Categoria não encontrada");
  await prisma.category.delete({ where: { id } });
}

/**
 * Gera os ids das categorias no cliente (em vez de usar o @default(cuid()) do banco) para
 * poder inserir pais e filhos em uma única chamada createMany — o banco é remoto (Hostinger),
 * então dezenas de creates sequenciais em uma transação interativa estouram o timeout padrão.
 */
export async function createDefaultCategoriesForUser(userId: string) {
  const rows: Prisma.CategoryCreateManyInput[] = [];

  for (const parent of DEFAULT_CATEGORIES) {
    const parentId = newTokenId();
    rows.push({
      id: parentId,
      userId,
      name: parent.name,
      kind: parent.kind,
      color: parent.color,
      icon: parent.icon,
    });

    for (const child of parent.children ?? []) {
      rows.push({
        id: newTokenId(),
        userId,
        name: child.name,
        kind: parent.kind,
        parentId,
        color: child.color ?? parent.color,
        icon: child.icon ?? parent.icon,
      });
    }
  }

  await prisma.category.createMany({ data: rows });
}
