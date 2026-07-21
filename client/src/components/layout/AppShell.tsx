import { NavLink, Outlet } from "react-router-dom";
import { useAuthStore } from "../../lib/auth-store";
import { authApi } from "../../api/auth";

const NAV_ITEMS = [
  { to: "/", label: "Painel", end: true },
  { to: "/transactions", label: "Transações" },
  { to: "/transactions/import", label: "Importar OFX" },
  { to: "/accounts", label: "Contas" },
  { to: "/categories", label: "Categorias" },
  { to: "/rules", label: "Regras" },
  { to: "/budgets", label: "Orçamento" },
  { to: "/recurring", label: "Recorrências" },
  { to: "/settings", label: "Configurações" },
];

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  async function handleLogout() {
    await authApi.logout();
    clear();
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:w-64 md:border-b-0 md:border-r">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-xl font-bold text-brand-600">Finanças</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 border-t border-slate-200 pt-4 text-sm dark:border-slate-800 md:mt-8">
          <p className="truncate px-2 text-slate-500">{user?.name}</p>
          <button
            onClick={handleLogout}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
