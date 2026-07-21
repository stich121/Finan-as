import { Router } from "express";
import { z } from "zod";
import { createBudgetSchema, updateBudgetSchema } from "@financas/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { badRequest } from "../../lib/http-error.js";
import * as service from "./budgets.service.js";

export const budgetsRouter = Router();
budgetsRouter.use(requireAuth);

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

budgetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const month = monthSchema.safeParse(req.query.month);
    if (!month.success) throw badRequest("Informe o mês no formato AAAA-MM");
    res.json(await service.listBudgets(req.userId!, month.data));
  }),
);

budgetsRouter.post(
  "/",
  validateBody(createBudgetSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.upsertBudget(req.userId!, req.body));
  }),
);

budgetsRouter.patch(
  "/:id",
  validateBody(updateBudgetSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateBudget(req.userId!, req.params.id, req.body));
  }),
);

budgetsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await service.deleteBudget(req.userId!, req.params.id);
    res.status(204).end();
  }),
);
