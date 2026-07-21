import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OfxPreviewResult } from "@financas/shared";
import { ofxApi } from "../../api/ofx";
import { accountsApi } from "../../api/accounts";
import { categoriesApi } from "../../api/categories";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Label, Select } from "../../components/ui/Input";
import { formatDate, formatMoney } from "../../lib/format";

export function OfxImportPage() {
  const queryClient = useQueryClient();
  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: () => accountsApi.list() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list });
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));

  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState<OfxPreviewResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useMutation({
    mutationFn: (file: File) => ofxApi.preview(accountId, file),
    onSuccess: (result) => {
      setPreview(result);
      setSelected(new Set(result.transactions.filter((t) => !t.isDuplicate).map((t) => t.fitId)));
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      ofxApi.confirm({ stagingId: preview!.stagingId, accountId, fitIds: [...selected] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setPreview(null);
      setSelected(new Set());
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  function toggle(fitId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fitId)) next.delete(fitId);
      else next.add(fitId);
      return next;
    });
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Importar extrato OFX</h1>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Conta de destino</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Selecione a conta</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Arquivo OFX/QFX</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ofx,.qfx"
              disabled={!accountId}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) previewMutation.mutate(file);
              }}
              className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
            />
          </div>
        </div>
        {previewMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {(previewMutation.error as any)?.response?.data?.message ?? "Erro ao ler o arquivo"}
          </p>
        )}
      </Card>

      {preview && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-semibold">{preview.transactions.length} transações encontradas</p>
              <p className="text-xs text-slate-500">
                {selected.size} selecionadas para importar ·{" "}
                {preview.transactions.filter((t) => t.isDuplicate).length} possíveis duplicatas
              </p>
            </div>
            <Button onClick={() => confirmMutation.mutate()} disabled={selected.size === 0 || confirmMutation.isPending}>
              Confirmar importação
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
                  <th className="w-8 py-2"></th>
                  <th className="py-2">Data</th>
                  <th className="py-2">Descrição</th>
                  <th className="py-2">Categoria sugerida</th>
                  <th className="py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {preview.transactions.map((t) => (
                  <tr
                    key={t.fitId}
                    className={`border-b border-slate-100 dark:border-slate-800/50 ${t.isDuplicate ? "opacity-50" : ""}`}
                  >
                    <td className="py-2">
                      <input type="checkbox" checked={selected.has(t.fitId)} onChange={() => toggle(t.fitId)} />
                    </td>
                    <td className="py-2 text-slate-500">{formatDate(t.date)}</td>
                    <td className="py-2">
                      {t.description}
                      {t.isDuplicate && <span className="ml-2 text-xs text-amber-600">(já existe)</span>}
                    </td>
                    <td className="py-2 text-slate-500">
                      {t.suggestedCategoryId ? categoryMap.get(t.suggestedCategoryId)?.name : "—"}
                    </td>
                    <td className={`py-2 text-right font-medium ${t.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                      {formatMoney(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {confirmMutation.data && (
        <p className="mt-4 text-sm text-green-600">
          {confirmMutation.data.imported} transações importadas
          {confirmMutation.data.skippedDuplicates > 0 && `, ${confirmMutation.data.skippedDuplicates} duplicatas ignoradas`}.
        </p>
      )}
    </div>
  );
}
