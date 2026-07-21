import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { TransactionType } from "@financas/shared";
import { transactionsApi } from "../../api/transactions";
import { accountsApi } from "../../api/accounts";
import { categoriesApi } from "../../api/categories";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";

export function NewTransactionForm({ onDone }: { onDone: () => void }) {
  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: () => accountsApi.list() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list });

  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [payee, setPayee] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      transactionsApi.create({
        accountId,
        type,
        amount: Number(amount),
        date: new Date(date),
        description,
        payee: payee || undefined,
        categoryId: type === "TRANSFER" ? undefined : categoryId || undefined,
        transferAccountId: type === "TRANSFER" ? transferAccountId : undefined,
      }),
    onSuccess: onDone,
  });

  const filteredCategories = (categories ?? []).filter((c) => c.kind === (type === "EXPENSE" ? "EXPENSE" : "INCOME"));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createMutation.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-3 gap-2">
        {(["EXPENSE", "INCOME", "TRANSFER"] as TransactionType[]).map((t) => (
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
            {t === "EXPENSE" ? "Despesa" : t === "INCOME" ? "Receita" : "Transferência"}
          </button>
        ))}
      </div>

      <div>
        <Label>Conta {type === "TRANSFER" ? "de origem" : ""}</Label>
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

      {type === "TRANSFER" && (
        <div>
          <Label>Conta de destino</Label>
          <Select value={transferAccountId} onChange={(e) => setTransferAccountId(e.target.value)} required>
            <option value="" disabled>
              Selecione
            </option>
            {accounts?.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Valor</Label>
          <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <Label>Data</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>

      <div>
        <Label>Descrição</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
      </div>

      <div>
        <Label>Beneficiário/Pagador (opcional)</Label>
        <Input value={payee} onChange={(e) => setPayee(e.target.value)} />
      </div>

      {type !== "TRANSFER" && (
        <div>
          <Label>Categoria (opcional, sugerimos automaticamente se deixar em branco)</Label>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Categorizar automaticamente</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={createMutation.isPending}>
        Salvar
      </Button>
    </form>
  );
}
