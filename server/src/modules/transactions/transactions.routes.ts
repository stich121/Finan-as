import { Router } from "express";
import {
  bulkCategorizeSchema,
  categorizeFeedbackSchema,
  createTransactionSchema,
  transactionFilterSchema,
  updateTransactionSchema,
} from "@financas/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import * as service from "./transactions.service.js";

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

transactionsRouter.get(
  "/",
  validateQuery(transactionFilterSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.listTransactions(req.userId!, req.query as never));
  }),
);

transactionsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await service.getTransaction(req.userId!, req.params.id));
  }),
);

transactionsRouter.post(
  "/",
  validateBody(createTransactionSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createTransaction(req.userId!, req.body));
  }),
);

transactionsRouter.patch(
  "/:id",
  validateBody(updateTransactionSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateTransaction(req.userId!, req.params.id, req.body));
  }),
);

transactionsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await service.deleteTransaction(req.userId!, req.params.id);
    res.status(204).end();
  }),
);

transactionsRouter.post(
  "/bulk-categorize",
  validateBody(bulkCategorizeSchema),
  asyncHandler(async (req, res) => {
    await service.bulkCategorize(req.userId!, req.body);
    res.status(204).end();
  }),
);

transactionsRouter.post(
  "/:id/categorize",
  validateBody(categorizeFeedbackSchema.omit({ transactionId: true })),
  asyncHandler(async (req, res) => {
    const { categoryId, createRule } = req.body;
    res.json(await service.categorizeWithFeedback(req.userId!, req.params.id, categoryId, createRule));
  }),
);
