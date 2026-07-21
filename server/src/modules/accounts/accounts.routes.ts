import { Router } from "express";
import { adjustBalanceSchema, createAccountSchema, updateAccountSchema } from "@financas/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import * as service from "./accounts.service.js";

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

accountsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const includeArchived = req.query.includeArchived === "true";
    res.json(await service.listAccounts(req.userId!, includeArchived));
  }),
);

accountsRouter.post(
  "/",
  validateBody(createAccountSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createAccount(req.userId!, req.body));
  }),
);

accountsRouter.patch(
  "/:id",
  validateBody(updateAccountSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateAccount(req.userId!, req.params.id, req.body));
  }),
);

accountsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await service.deleteAccount(req.userId!, req.params.id);
    res.status(204).end();
  }),
);

accountsRouter.post(
  "/:id/adjust-balance",
  validateBody(adjustBalanceSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.adjustBalance(req.userId!, req.params.id, req.body));
  }),
);
