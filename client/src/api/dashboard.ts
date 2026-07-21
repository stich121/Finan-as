import { api } from "../lib/api";

export interface DashboardSummary {
  totalBalance: number;
  income: number;
  expense: number;
  net: number;
  spendingByCategory: { categoryId: string; categoryName: string; color: string; total: number }[];
}

export interface MonthlyTrendPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export const dashboardApi = {
  summary: (month: string) => api.get<DashboardSummary>("/dashboard/summary", { params: { month } }).then((r) => r.data),
  trend: (months = 6) => api.get<MonthlyTrendPoint[]>("/dashboard/trend", { params: { months } }).then((r) => r.data),
};
