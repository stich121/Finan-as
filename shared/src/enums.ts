export const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH", "INVESTMENT"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CATEGORY_KIND = ["INCOME", "EXPENSE"] as const;
export type CategoryKind = (typeof CATEGORY_KIND)[number];

export const RULE_MATCH_FIELDS = ["DESCRIPTION", "PAYEE", "MEMO"] as const;
export type RuleMatchField = (typeof RULE_MATCH_FIELDS)[number];

export const RULE_MATCH_TYPES = ["CONTAINS", "STARTS_WITH", "REGEX", "EQUALS"] as const;
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];

export const RECURRENCE_FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const IMPORT_SOURCES = ["MANUAL", "OFX"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];
