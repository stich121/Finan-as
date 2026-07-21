import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./lib/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/error-handler.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, "public");

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", apiRouter);

  // Em produção o bundle vem acompanhado de uma pasta "public" (build do client) — ausente em dev.
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  app.use(errorHandler);

  return app;
}
