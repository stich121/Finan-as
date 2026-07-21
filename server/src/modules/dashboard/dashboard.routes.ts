import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/require-auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { badRequest } from "../../lib/http-error.js";
import * as service from "./dashboard.service.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const month = monthSchema.safeParse(req.query.month);
    if (!month.success) throw badRequest("Informe o mês no formato AAAA-MM");
    res.json(await service.getSummary(req.userId!, month.data));
  }),
);

dashboardRouter.get(
  "/trend",
  asyncHandler(async (req, res) => {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
    res.json(await service.getMonthlyTrend(req.userId!, months));
  }),
);
