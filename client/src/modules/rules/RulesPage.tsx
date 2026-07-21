import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RuleMatchField, RuleMatchType } from "@financas/shared";
import { rulesApi } from "../../api/rules";
import { categoriesApi } from "../../api/categories";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";

const FIELD_LABELS: Record<RuleMatchField, string> = {
  DESCRIPTION: "Descrição",
  PAYEE: "Beneficiário",
  MEMO: "Memo",
};

const TYPE_LABELS: Record<RuleMatchType, string> = {
  CONTAINS: "contém",
  STARTS_WITH: "começa com",
  EQUALS: "é igual a",
  REGEX: "expressão regular",
};

export function RulesPage() {
  const queryClient = useQueryClient();
  const { data: rules, isLoading } = useQuery({ queryKey: ["rules"], queryFn: rulesApi.list });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list });
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));

  const [modalOpen, setModalOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [matchField, setMatchField] = useState<RuleMatchField>("DESCRIPTION");
  const [matchType, setMatchType] = useState<RuleMatchType>("CONTAINS");
  const [pattern, setPattern] = useState("");
  const [priority, setPriority] = useState("100");

  const createMutation = useMutation({
    mutationFn: () =>
      rulesApi.create({ categoryId, matchField, matchType, pattern, priority: Number(priority), enabled: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setModalOpen(false);
      setPattern("");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => rulesApi.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rulesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Regras de categorização</h1>
        <Button onClick={() => setModalOpen(true)}>Nova regra</Button>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Regras com prioridade maior são avaliadas primeiro. Quando você recategoriza uma transação manualmente, uma
        regra é criada automaticamente com prioridade alta.
      </p>

      <Card className="overflow-x-auto">
        {isLoading ? (
          <p className="text-slate-500">Carregando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
                <th className="py-2">Condição</th>
                <th className="py-2">Categoria</th>
                <th className="py-2">Prioridade</th>
                <th className="py-2">Ativa</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rules?.map((rule) => (
                <tr key={rule.id} className="border-b border-slate-100 dark:border-slate-800/50">
                  <td className="py-2">
                    {FIELD_LABELS[rule.matchField]} {TYPE_LABELS[rule.matchType]} <strong>"{rule.pattern}"</strong>
                  </td>
                  <td className="py-2">{categoryMap.get(rule.categoryId)?.name ?? "-"}</td>
                  <td className="py-2 text-slate-500">{rule.priority}</td>
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => toggleMutation.mutate({ id: rule.id, enabled: e.target.checked })}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => deleteMutation.mutate(rule.id)} className="text-xs text-slate-400 hover:text-red-600">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova regra">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label>Campo</Label>
            <Select value={matchField} onChange={(e) => setMatchField(e.target.value as RuleMatchField)}>
              {Object.entries(FIELD_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Condição</Label>
            <Select value={matchType} onChange={(e) => setMatchType(e.target.value as RuleMatchType)}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Padrão</Label>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} required placeholder="Ex: UBER" />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="" disabled>
                Selecione
              </option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Prioridade (0-1000, maior = avaliada primeiro)</Label>
            <Input type="number" min="0" max="1000" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            Criar regra
          </Button>
        </form>
      </Modal>
    </div>
  );
}
