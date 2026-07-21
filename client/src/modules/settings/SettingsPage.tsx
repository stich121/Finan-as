import { useState } from "react";
import type { ThemePreference } from "../../lib/theme";
import { applyTheme, getStoredTheme } from "../../lib/theme";
import { Card } from "../../components/ui/Card";
import { useAuthStore } from "../../lib/auth-store";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Automático" },
];

export function SettingsPage() {
  const [theme, setTheme] = useState<ThemePreference>(getStoredTheme());
  const user = useAuthStore((s) => s.user);

  function handleChange(value: ThemePreference) {
    setTheme(value);
    applyTheme(value);
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Configurações</h1>

      <Card className="mb-4">
        <h2 className="mb-1 font-semibold">Conta</h2>
        <p className="text-sm text-slate-500">{user?.name}</p>
        <p className="text-sm text-slate-500">{user?.email}</p>
        <p className="mt-1 text-sm text-slate-500">Moeda: {user?.currency}</p>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Tema</h2>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleChange(opt.value)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                theme === opt.value
                  ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/40"
                  : "border-slate-200 text-slate-500 dark:border-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
