import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./lib/auth-store";
import { refreshAccessToken } from "./lib/api";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { LoginPage } from "./modules/auth/LoginPage";
import { RegisterPage } from "./modules/auth/RegisterPage";
import { DashboardPage } from "./modules/dashboard/DashboardPage";
import { AccountsPage } from "./modules/accounts/AccountsPage";
import { CategoriesPage } from "./modules/categories/CategoriesPage";
import { TransactionsPage } from "./modules/transactions/TransactionsPage";
import { OfxImportPage } from "./modules/ofx-import/OfxImportPage";
import { RulesPage } from "./modules/rules/RulesPage";
import { BudgetsPage } from "./modules/budgets/BudgetsPage";
import { RecurringPage } from "./modules/recurring/RecurringPage";
import { SettingsPage } from "./modules/settings/SettingsPage";

export default function App() {
  const initializing = useAuthStore((s) => s.initializing);
  const setInitializing = useAuthStore((s) => s.setInitializing);

  useEffect(() => {
    refreshAccessToken().finally(() => setInitializing(false));
  }, [setInitializing]);

  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Carregando...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/transactions/import" element={<OfxImportPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
