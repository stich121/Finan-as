import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecurrenceFrequency, TransactionType } from "@financas/shared";
import { recurringApi } from "../../api/recurring";
import { accountsApi } from "../../api/accounts";
import { categoriesApi } from "../../api/categories";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { formatDate, formatMoney } from "../../lib/format";

const FREQ_LABELS: Record<RecurrenceFrequency, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};

export function RecurringPage() {
  const queryClient = useQueryClient();
  const { data: recurring, isLoading } = useQuery({ queryKey: ["recurring"], queryFn: recurringApi.list });
  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: () => accountsApi.list() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list });
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));

  const [modalOpen, setModalOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("MONTHLY");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const createMutation = useMutation({
    mutationFn: () =>
      recurringApi.create({
        accountId,
        categoryId: categoryId || undefined,
        type,
        amount: Number(amount),
        description,
        frequency,
        startDate: new Date(startDate),
        autoPost: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      setModalOpen(false);
      setDescription("");
      setAmount("");
    },
  });

  const postMutation = useMutation({
    mutationFn: (id: string) => recurringApi.postNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => recurringApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring"] }),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transações recorrentes</h1>
        <Button onClick={() => setModalOpen(true)}>Nova recorrência</Button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Carregando...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recurring?.map((r) => (
            <Card key={r.id}>
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="font-semibold">{r.description}</p>
                  <p className="text-xs text-slate-500">
                    {accountMap.get(r.accountId)?.name} · {FREQ_LABELS[r.frequency]}
                  </p>
                  {r.categoryId && <p className="text-xs text-slate-400">{categoryMap.get(r.categoryId)?.name}</p>}
                </div>
                <span className={`font-semibold ${r.type === "EXPENSE" ? "text-red-600" : "text-green-600"}`}>
                  {formatMoney(r.amount)}
                </span>
              </div>
              <p className="text-xs text-slate-500">Próxima: {formatDate(r.nextRunDate)}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="text-xs" onClick={() => postMutation.mutate(r.id)}>
                  Lançar agora
                </Button>
                <Button variant="ghost" className="text-xs" onClick={() => deleteMutation.mutate(r.id)}>
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
          {recurring?.length === 0 && <p className="text-slate-500">Nenhuma recorrência cadastrada.</p>}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova recorrência">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-2">
            {(["EXPENSE", "INCOME"] as TransactionType[]).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setType(t)}
                className={`rounded-lg border px-2 py-1.5 text-sm font-medium ${
                  type === t
                    ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/40"
                    : "border-slate-200 text-slate-500 dark:border-slate-700"
                }`}
              >
                {t === "EXPENSE" ? "Despesa" : "Receita"}
              </button>
            ))}
          </div>
          <div>
            <Label>Conta</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              <option value="" disabled>
                Selecione
              </option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Categoria (opcional)</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories?.filter((c) => c.kind === (type === "EXPENSE" ? "EXPENSE" : "INCOME")).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <Label>Frequência</Label>
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}>
                {Object.entries(FREQ_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Data de início</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            Criar recorrência
          </Button>
        </form>
      </Modal>
    </div>
  );
}
