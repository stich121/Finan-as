import { Router } from "express";
import multer from "multer";
import { confirmOfxImportSchema } from "@financas/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { badRequest } from "../../lib/http-error.js";
import * as service from "./ofx.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const ofxRouter = Router();
ofxRouter.use(requireAuth);

ofxRouter.post(
  "/preview",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const accountId = req.body?.accountId as string | undefined;
    if (!accountId) throw badRequest("Informe a conta de destino");
    if (!req.file) throw badRequest("Envie um arquivo OFX/QFX");

    const result = await service.previewOfxImport(req.userId!, accountId, req.file.buffer);
    res.json(result);
  }),
);

ofxRouter.post(
  "/confirm",
  validateBody(confirmOfxImportSchema),
  asyncHandler(async (req, res) => {
    const result = await service.confirmOfxImport(req.userId!, req.body);
    res.json(result);
  }),
);
