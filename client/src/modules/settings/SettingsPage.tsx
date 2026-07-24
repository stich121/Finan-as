import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ThemePreference } from "../../lib/theme";
import { applyTheme, getStoredTheme } from "../../lib/theme";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Input";
import { useAuthStore } from "../../lib/auth-store";
import { authApi } from "../../api/auth";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Automático" },
];

export function SettingsPage() {
  const [theme, setTheme] = useState<ThemePreference>(getStoredTheme());
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(value: ThemePreference) {
    setTheme(value);
    applyTheme(value);
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("A confirmação não bate com a nova senha");
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      clear();
      navigate("/login", { state: { passwordChanged: true } });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Não foi possível trocar a senha");
    } finally {
      setLoading(false);
    }
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

      <Card className="mb-4">
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

      <Card>
        <h2 className="mb-3 font-semibold">Trocar senha</h2>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <Label>Senha atual</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Nova senha</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <Label>Confirmar nova senha</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Trocar senha"}
          </Button>
          <p className="text-xs text-slate-500">
            Depois de trocar, você vai precisar entrar novamente com a nova senha.
          </p>
        </form>
      </Card>
    </div>
  );
}
