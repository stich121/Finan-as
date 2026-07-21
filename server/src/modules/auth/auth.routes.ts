import { Router } from "express";
import { loginSchema, registerSchema } from "@financas/shared";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { unauthorized } from "../../lib/http-error.js";
import { env } from "../../lib/env.js";
import * as service from "./auth.service.js";

export const authRouter = Router();

const REFRESH_COOKIE = "refresh_token";
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: service.REFRESH_COOKIE_MAX_AGE_MS,
};

authRouter.post(
  "/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken, ...rest } = await service.register(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.status(201).json(rest);
  }),
);

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken, ...rest } = await service.login(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json(rest);
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) throw unauthorized("Sessão expirada, faça login novamente");

    const { refreshToken, ...rest } = await service.refresh(rawToken);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json(rest);
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) await service.revoke(rawToken);
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await service.getProfile(req.userId!));
  }),
);
