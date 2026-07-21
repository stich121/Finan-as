import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TransactionType } from "@financas/shared";
import { transactionsApi } from "../../api/transactions";
import { accountsApi } from "../../api/accounts";
import { categoriesApi } from "../../api/categories";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { formatDate, formatMoney } from "../../lib/format";
import { NewTransactionForm } from "./NewTransactionForm";

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<TransactionType | "">("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const filters = useMemo(
    () => ({
      page,
      pageSize: 25,
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      type: type || undefined,
      search: search || undefined,
    }),
    [page, accountId, categoryId, type, search],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => transactionsApi.list(filters),
  });
  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: () => accountsApi.list() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list });

  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));

  const categorizeMutation = useMutation({
    mutationFn: ({ id, newCategoryId }: { id: string; newCategoryId: string }) =>
      transactionsApi.categorize(id, newCategoryId, true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transactionsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });

  const bulkMutation = useMutation({
    mutationFn: (newCategoryId: string) =>
      transactionsApi.bulkCategorize({ transactionIds: selected, categoryId: newCategoryId, createRule: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setSelected([]);
    },
  });

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transações</h1>
        <Button onClick={() => setModalOpen(true)}>Nova transação</Button>
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Buscar descrição..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Todas as contas</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value as TransactionType | "")}>
            <option value="">Todos os tipos</option>
            <option value="INCOME">Receita</option>
            <option value="EXPENSE">Despesa</option>
            <option value="TRANSFER">Transferência</option>
          </Select>
        </div>
      </Card>

      {selected.length > 0 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm">{selected.length} selecionada(s)</span>
          <Select
            className="max-w-xs"
            onChange={(e) => {
              if (e.target.value) bulkMutation.mutate(e.target.value);
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Categorizar como...
            </option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Card>
      )}

      <Card className="overflow-x-auto">
        {isLoading ? (
          <p className="text-slate-500">Carregando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
                <th className="w-8 py-2"></th>
                <th className="py-2">Data</th>
                <th className="py-2">Descrição</th>
                <th className="py-2">Conta</th>
                <th className="py-2">Categoria</th>
                <th className="py-2 text-right">Valor</th>
                <th className="w-16 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((tx) => (
                <tr key={tx.id} className="border-b border-slate-100 dark:border-slate-800/50">
                  <td className="py-2">
                    <input type="checkbox" checked={selected.includes(tx.id)} onChange={() => toggleSelected(tx.id)} />
                  </td>
                  <td className="py-2 text-slate-500">{formatDate(tx.date)}</td>
                  <td className="py-2">
                    <p className="font-medium">{tx.description}</p>
                    {tx.memo && <p className="text-xs text-slate-400">{tx.memo}</p>}
                  </td>
                  <td className="py-2 text-slate-500">{accountMap.get(tx.accountId)?.name ?? "-"}</td>
                  <td className="py-2">
                    <Select
                      value={tx.categoryId ?? ""}
                      onChange={(e) => categorizeMutation.mutate({ id: tx.id, newCategoryId: e.target.value })}
                      className="!py-1 text-xs"
                    >
                      <option value="">Sem categoria</option>
                      {categories?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td
                    className={`py-2 text-right font-medium ${tx.amount < 0 ? "text-red-600" : "text-green-600"}`}
                  >
                    {formatMoney(tx.amount)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => deleteMutation.mutate(tx.id)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && data.total > data.pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-slate-500">
              Página {page} de {Math.ceil(data.total / data.pageSize)}
            </span>
            <Button
              variant="secondary"
              disabled={page * data.pageSize >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova transação">
        <NewTransactionForm
          onDone={() => {
            setModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
          }}
        />
      </Modal>
    </div>
  );
}
