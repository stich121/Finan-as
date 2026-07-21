import type { CategoryKind } from "@financas/shared";

interface DefaultCategorySeed {
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  children?: { name: string; color?: string; icon?: string }[];
}

export const DEFAULT_CATEGORIES: DefaultCategorySeed[] = [
  {
    name: "Moradia",
    kind: "EXPENSE",
    color: "#f97316",
    icon: "home",
    children: [
      { name: "Aluguel" },
      { name: "Condomínio" },
      { name: "Energia" },
      { name: "Água" },
      { name: "Internet" },
      { name: "Gás" },
    ],
  },
  {
    name: "Alimentação",
    kind: "EXPENSE",
    color: "#22c55e",
    icon: "utensils",
    children: [{ name: "Supermercado" }, { name: "Restaurantes" }, { name: "Delivery" }],
  },
  {
    name: "Transporte",
    kind: "EXPENSE",
    color: "#0ea5e9",
    icon: "car",
    children: [
      { name: "Combustível" },
      { name: "Transporte público" },
      { name: "App de transporte" },
      { name: "Manutenção do veículo" },
    ],
  },
  {
    name: "Saúde",
    kind: "EXPENSE",
    color: "#ef4444",
    icon: "heart-pulse",
    children: [{ name: "Plano de saúde" }, { name: "Farmácia" }, { name: "Consultas" }],
  },
  { name: "Educação", kind: "EXPENSE", color: "#8b5cf6", icon: "graduation-cap" },
  {
    name: "Lazer",
    kind: "EXPENSE",
    color: "#ec4899",
    icon: "party-popper",
    children: [{ name: "Assinaturas e streaming" }, { name: "Viagens" }, { name: "Entretenimento" }],
  },
  {
    name: "Compras",
    kind: "EXPENSE",
    color: "#f59e0b",
    icon: "shopping-bag",
    children: [{ name: "Vestuário" }, { name: "Eletrônicos" }],
  },
  { name: "Dívidas e empréstimos", kind: "EXPENSE", color: "#64748b", icon: "credit-card" },
  { name: "Impostos e taxas", kind: "EXPENSE", color: "#78716c", icon: "receipt" },
  { name: "Outras despesas", kind: "EXPENSE", color: "#94a3b8", icon: "more-horizontal" },
  { name: "Salário", kind: "INCOME", color: "#16a34a", icon: "banknote" },
  { name: "Freelance", kind: "INCOME", color: "#059669", icon: "briefcase" },
  { name: "Investimentos", kind: "INCOME", color: "#0d9488", icon: "trending-up" },
  { name: "Reembolsos", kind: "INCOME", color: "#0891b2", icon: "rotate-ccw" },
  { name: "Outras receitas", kind: "INCOME", color: "#65a30d", icon: "plus-circle" },
];
