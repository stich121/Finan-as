import { Router } from "express";
import { createRecurringSchema, updateRecurringSchema } from "@financas/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import * as service from "./recurring.service.js";

export const recurringRouter = Router();
recurringRouter.use(requireAuth);

recurringRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await service.listRecurring(req.userId!));
  }),
);

recurringRouter.post(
  "/",
  validateBody(createRecurringSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createRecurring(req.userId!, req.body));
  }),
);

recurringRouter.patch(
  "/:id",
  validateBody(updateRecurringSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateRecurring(req.userId!, req.params.id, req.body));
  }),
);

recurringRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await service.deleteRecurring(req.userId!, req.params.id);
    res.status(204).end();
  }),
);

recurringRouter.post(
  "/:id/post",
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.postNextOccurrence(req.userId!, req.params.id));
  }),
);
