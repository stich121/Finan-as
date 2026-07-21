import { Router } from "express";
import { createCategorySchema, updateCategorySchema } from "@financas/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import * as service from "./categories.service.js";

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const categories = await service.listCategories(req.userId!);
    res.json(categories);
  }),
);

categoriesRouter.post(
  "/",
  validateBody(createCategorySchema),
  asyncHandler(async (req, res) => {
    const category = await service.createCategory(req.userId!, req.body);
    res.status(201).json(category);
  }),
);

categoriesRouter.patch(
  "/:id",
  validateBody(updateCategorySchema),
  asyncHandler(async (req, res) => {
    const category = await service.updateCategory(req.userId!, req.params.id, req.body);
    res.json(category);
  }),
);

categoriesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await service.deleteCategory(req.userId!, req.params.id);
    res.status(204).end();
  }),
);
