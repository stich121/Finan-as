import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { conflict, unauthorized } from "../../lib/http-error.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";
import { hashToken, newTokenId } from "../../lib/hash-token.js";
import { parseDurationMs } from "../../lib/duration.js";
import { env } from "../../lib/env.js";
import type { LoginInput, RegisterInput } from "@financas/shared";
import { createDefaultCategoriesForUser } from "../categories/categories.service.js";
import { createDefaultRulesForUser } from "../rules/rules.service.js";

const REFRESH_TTL_MS = parseDurationMs(env.REFRESH_TOKEN_TTL);

function toAuthUser(user: { id: string; name: string; email: string; currency: string; theme: string }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    currency: user.currency,
    theme: user.theme as "light" | "dark" | "system",
  };
}

async function issueTokenPair(userId: string, email: string) {
  const accessToken = signAccessToken({ sub: userId, email });
  const jti = newTokenId();
  const refreshToken = signRefreshToken({ sub: userId, jti });

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("Já existe uma conta com este e-mail");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash },
  });

  await createDefaultCategoriesForUser(user.id);
  await createDefaultRulesForUser(user.id);

  const tokens = await issueTokenPair(user.id, user.email);
  return { user: toAuthUser(user), ...tokens };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw unauthorized("E-mail ou senha inválidos");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw unauthorized("E-mail ou senha inválidos");

  const tokens = await issueTokenPair(user.id, user.email);
  return { user: toAuthUser(user), ...tokens };
}

export async function refresh(rawToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw unauthorized("Sessão expirada, faça login novamente");
  }

  const tokenHash = hashToken(rawToken);
  const stored = await prisma.refreshToken.findFirst({
    where: { userId: payload.sub, tokenHash, revokedAt: null },
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw unauthorized("Sessão expirada, faça login novamente");
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
  const tokens = await issueTokenPair(user.id, user.email);
  return { user: toAuthUser(user), ...tokens };
}

export async function revoke(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toAuthUser(user);
}

export const REFRESH_COOKIE_MAX_AGE_MS = REFRESH_TTL_MS;
