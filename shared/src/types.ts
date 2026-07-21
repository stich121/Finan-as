import type {
  AccountType,
  CategoryKind,
  RecurrenceFrequency,
  RuleMatchField,
  RuleMatchType,
  TransactionType,
} from "./enums.js";

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  institution: string | null;
  balance: number;
  color: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  color: string;
  icon: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  userId: string;
  name: string;
  color: string;
}

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: number;
  date: string;
  description: string;
  payee: string | null;
  memo: string | null;
  fitId: string | null;
  transferAccountId: string | null;
  transferGroupId: string | null;
  source: "MANUAL" | "OFX";
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRule {
  id: string;
  userId: string;
  categoryId: string;
  matchField: RuleMatchField;
  matchType: RuleMatchType;
  pattern: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
}

export interface Budget {
  id: string;
  userId: string;
  categoryId: string;
  month: string;
  amount: number;
  spent?: number;
}

export interface RecurringTransaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: number;
  description: string;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  autoPost: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
