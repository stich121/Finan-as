import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountType } from "@financas/shared";
import { accountsApi } from "../../api/accounts";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { formatMoney } from "../../lib/format";

const TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CREDIT_CARD: "Cartão de crédito",
  CASH: "Dinheiro",
  INVESTMENT: "Investimentos",
};

export function AccountsPage() {
  const queryClient = useQueryClient();
  const { data: accounts, isLoading } = useQuery({ queryKey: ["accounts"], queryFn: () => accountsApi.list() });
  const [modalOpen, setModalOpen] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("CHECKING");
  const [institution, setInstitution] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");

  const createMutation = useMutation({
    mutationFn: () =>
      accountsApi.create({ name, type, institution: institution || undefined, initialBalance: Number(initialBalance) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setModalOpen(false);
      setName("");
      setInstitution("");
      setInitialBalance("0");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => accountsApi.update(id, { archived: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const [newBalance, setNewBalance] = useState("");
  const adjustMutation = useMutation({
    mutationFn: (id: string) => accountsApi.adjustBalance(id, { newBalance: Number(newBalance) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setAdjustingId(null);
      setNewBalance("");
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contas</h1>
        <Button onClick={() => setModalOpen(true)}>Nova conta</Button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Carregando...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts?.map((account) => (
            <Card key={account.id}>
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="font-semibold">{account.name}</p>
                  <p className="text-xs text-slate-500">{TYPE_LABELS[account.type]}</p>
                  {account.institution && <p className="text-xs text-slate-400">{account.institution}</p>}
                </div>
              </div>
              <p
                className={`text-xl font-bold ${account.balance < 0 ? "text-red-600" : "text-slate-900 dark:text-slate-100"}`}
              >
                {formatMoney(account.balance)}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => setAdjustingId(account.id)} className="text-xs">
                  Ajustar saldo
                </Button>
                <Button variant="ghost" onClick={() => archiveMutation.mutate(account.id)} className="text-xs">
                  Arquivar
                </Button>
              </div>
            </Card>
          ))}
          {accounts?.length === 0 && <p className="text-slate-500">Nenhuma conta cadastrada ainda.</p>}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova conta">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Instituição (opcional)</Label>
            <Input value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </div>
          <div>
            <Label>Saldo inicial</Label>
            <Input type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            Criar conta
          </Button>
        </form>
      </Modal>

      <Modal open={!!adjustingId} onClose={() => setAdjustingId(null)} title="Ajustar saldo">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (adjustingId) adjustMutation.mutate(adjustingId);
          }}
          className="space-y-4"
        >
          <div>
            <Label>Novo saldo</Label>
            <Input type="number" step="0.01" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} required />
          </div>
          <p className="text-xs text-slate-500">
            Uma transação de ajuste será criada automaticamente para refletir a diferença.
          </p>
          <Button type="submit" className="w-full" disabled={adjustMutation.isPending}>
            Confirmar
          </Button>
        </form>
      </Modal>
    </div>
  );
}
