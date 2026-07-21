import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes.js";
import { accountsRouter } from "../modules/accounts/accounts.routes.js";
import { categoriesRouter } from "../modules/categories/categories.routes.js";
import { transactionsRouter } from "../modules/transactions/transactions.routes.js";
import { rulesRouter } from "../modules/rules/rules.routes.js";
import { ofxRouter } from "../modules/ofx/ofx.routes.js";
import { tagsRouter } from "../modules/tags/tags.routes.js";
import { budgetsRouter } from "../modules/budgets/budgets.routes.js";
import { recurringRouter } from "../modules/recurring/recurring.routes.js";
import { dashboardRouter } from "../modules/dashboard/dashboard.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ status: "ok" }));

apiRouter.use("/auth", authRouter);
apiRouter.use("/accounts", accountsRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/transactions", transactionsRouter);
apiRouter.use("/rules", rulesRouter);
apiRouter.use("/ofx", ofxRouter);
apiRouter.use("/tags", tagsRouter);
apiRouter.use("/budgets", budgetsRouter);
apiRouter.use("/recurring", recurringRouter);
apiRouter.use("/dashboard", dashboardRouter);
