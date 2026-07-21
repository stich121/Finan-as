import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dashboardApi } from "../../api/dashboard";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { currentMonth, formatMoney } from "../../lib/format";

export function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard-summary", month],
    queryFn: () => dashboardApi.summary(month),
  });
  const { data: trend } = useQuery({ queryKey: ["dashboard-trend"], queryFn: () => dashboardApi.trend(6) });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Painel</h1>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
      </div>

      {isLoading || !summary ? (
        <p className="text-slate-500">Carregando...</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-xs text-slate-500">Saldo total</p>
              <p className="text-2xl font-bold">{formatMoney(summary.totalBalance)}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Receitas do mês</p>
              <p className="text-2xl font-bold text-green-600">{formatMoney(summary.income)}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Despesas do mês</p>
              <p className="text-2xl font-bold text-red-600">{formatMoney(summary.expense)}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Resultado do mês</p>
              <p className={`text-2xl font-bold ${summary.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatMoney(summary.net)}
              </p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 font-semibold">Gastos por categoria</h2>
              {summary.spendingByCategory.length === 0 ? (
                <p className="text-sm text-slate-500">Sem despesas categorizadas neste mês.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={summary.spendingByCategory}
                      dataKey="total"
                      nameKey="categoryName"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {summary.spendingByCategory.map((entry) => (
                        <Cell key={entry.categoryId} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatMoney(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 font-semibold">Receita x despesa (6 meses)</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => formatMoney(v)} width={90} />
                  <Tooltip formatter={(value: number) => formatMoney(value)} />
                  <Legend />
                  <Bar dataKey="income" name="Receita" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Despesa" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
