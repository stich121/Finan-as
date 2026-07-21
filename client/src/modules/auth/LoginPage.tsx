import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../lib/auth-store";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, accessToken } = await authApi.login({ email, password });
      setSession(user, accessToken);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold text-brand-600">Finanças</h1>
        <p className="mb-6 text-sm text-slate-500">Entre na sua conta</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label>Senha</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Não tem conta?{" "}
          <Link to="/register" className="font-medium text-brand-600">
            Cadastre-se
          </Link>
        </p>
      </Card>
    </div>
  );
}
