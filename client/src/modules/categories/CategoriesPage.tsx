import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Category, CategoryKind } from "@financas/shared";
import { categoriesApi } from "../../api/categories";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list });
  const [modalOpen, setModalOpen] = useState(false);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("EXPENSE");
  const [parentId, setParentId] = useState("");
  const [color, setColor] = useState("#64748b");

  const createMutation = useMutation({
    mutationFn: () =>
      categoriesApi.create({ name, kind, parentId: parentId || null, color, icon: "tag" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setModalOpen(false);
      setName("");
      setParentId("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  const grouped = useMemo(() => {
    const roots = (categories ?? []).filter((c) => !c.parentId);
    const byParent = new Map<string, Category[]>();
    for (const c of categories ?? []) {
      if (c.parentId) {
        byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
      }
    }
    return { roots, byParent };
  }, [categories]);

  const parentOptions = (categories ?? []).filter((c) => !c.parentId && c.kind === kind);

  if (isLoading) return <p className="text-slate-500">Carregando...</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categorias</h1>
        <Button onClick={() => setModalOpen(true)}>Nova categoria</Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {(["EXPENSE", "INCOME"] as CategoryKind[]).map((k) => (
          <Card key={k}>
            <h2 className="mb-3 font-semibold">{k === "EXPENSE" ? "Despesas" : "Receitas"}</h2>
            <div className="space-y-3">
              {grouped.roots
                .filter((c) => c.kind === k)
                .map((root) => (
                  <div key={root.id}>
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: root.color }} />
                        {root.name}
                      </span>
                      <button
                        onClick={() => deleteMutation.mutate(root.id)}
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        Excluir
                      </button>
                    </div>
                    {grouped.byParent.get(root.id)?.length ? (
                      <div className="ml-4 mt-1 space-y-1">
                        {grouped.byParent.get(root.id)!.map((child) => (
                          <div
                            key={child.id}
                            className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: child.color }} />
                              {child.name}
                            </span>
                            <button
                              onClick={() => deleteMutation.mutate(child.id)}
                              className="text-xs text-slate-400 hover:text-red-600"
                            >
                              Excluir
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova categoria">
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
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as CategoryKind);
                setParentId("");
              }}
            >
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
            </Select>
          </div>
          <div>
            <Label>Categoria pai (opcional)</Label>
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Nenhuma (categoria principal)</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Cor</Label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full rounded" />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            Criar categoria
          </Button>
        </form>
      </Modal>
    </div>
  );
}
