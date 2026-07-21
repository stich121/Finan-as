import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

export const validateBody = (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
  req.body = schema.parse(req.body);
  next();
};

export const validateQuery = (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
  req.query = schema.parse(req.query);
  next();
};
