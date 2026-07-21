import { Router } from "express";
import { createTagSchema } from "@financas/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";

export const tagsRouter = Router();
tagsRouter.use(requireAuth);

tagsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tags = await prisma.tag.findMany({ where: { userId: req.userId! }, orderBy: { name: "asc" } });
    res.json(tags);
  }),
);

tagsRouter.post(
  "/",
  validateBody(createTagSchema),
  asyncHandler(async (req, res) => {
    const tag = await prisma.tag.create({ data: { userId: req.userId!, ...req.body } });
    res.status(201).json(tag);
  }),
);

tagsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.tag.findFirst({ where: { id: req.params.id, userId: req.userId! } });
    if (!existing) throw notFound("Tag não encontrada");
    await prisma.tag.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);
