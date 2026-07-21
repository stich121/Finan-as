import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { budgetsApi } from "../../api/budgets";
import { categoriesApi } from "../../api/categories";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { currentMonth, formatMoney } from "../../lib/format";

export function BudgetsPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");

  const { data: budgets, isLoading } = useQuery({ queryKey: ["budgets", month], queryFn: () => budgetsApi.list(month) });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list });
  const expenseCategories = (categories ?? []).filter((c) => c.kind === "EXPENSE");

  const upsertMutation = useMutation({
    mutationFn: () => budgetsApi.upsert({ categoryId, month, amount: Number(amount) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets", month] });
      setModalOpen(false);
      setAmount("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => budgetsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["budgets", month] }),
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Orçamento</h1>
        <div className="flex items-center gap-3">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          <Button onClick={() => setModalOpen(true)}>Definir orçamento</Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Carregando...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {budgets?.map((b) => {
            const pct = b.amount > 0 ? Math.min((b.spent / b.amount) * 100, 100) : 0;
            const over = b.spent > b.amount;
            return (
              <Card key={b.id}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.categoryColor }} />
                    {b.categoryName}
                  </span>
                  <button onClick={() => deleteMutation.mutate(b.id)} className="text-xs text-slate-400 hover:text-red-600">
                    Excluir
                  </button>
                </div>
                <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full ${over ? "bg-red-500" : "bg-brand-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className={`text-sm ${over ? "text-red-600" : "text-slate-500"}`}>
                  {formatMoney(b.spent)} de {formatMoney(b.amount)}
                </p>
              </Card>
            );
          })}
          {budgets?.length === 0 && <p className="text-slate-500">Nenhum orçamento definido para este mês.</p>}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Definir orçamento">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            upsertMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label>Categoria</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="" disabled>
                Selecione
              </option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Valor mensal</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={upsertMutation.isPending}>
            Salvar
          </Button>
        </form>
      </Modal>
    </div>
  );
}
