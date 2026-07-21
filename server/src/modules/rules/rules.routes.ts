import { Router } from "express";
import { createRuleSchema, updateRuleSchema } from "@financas/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import * as service from "./rules.service.js";

export const rulesRouter = Router();
rulesRouter.use(requireAuth);

rulesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await service.listRules(req.userId!));
  }),
);

rulesRouter.post(
  "/",
  validateBody(createRuleSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createRule(req.userId!, req.body));
  }),
);

rulesRouter.patch(
  "/:id",
  validateBody(updateRuleSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateRule(req.userId!, req.params.id, req.body));
  }),
);

rulesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await service.deleteRule(req.userId!, req.params.id);
    res.status(204).end();
  }),
);
