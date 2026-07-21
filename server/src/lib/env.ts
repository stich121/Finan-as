import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL não configurada"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET muito curto"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET muito curto"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Configuração de ambiente inválida:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
