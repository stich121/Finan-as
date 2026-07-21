import type { RuleMatchField, RuleMatchType } from "@financas/shared";

export interface MatchableTransaction {
  description: string;
  payee?: string | null;
  memo?: string | null;
}

export interface MatchableRule {
  matchField: RuleMatchField;
  matchType: RuleMatchType;
  pattern: string;
  enabled: boolean;
}

function fieldValue(tx: MatchableTransaction, field: RuleMatchField): string {
  switch (field) {
    case "PAYEE":
      return tx.payee ?? "";
    case "MEMO":
      return tx.memo ?? "";
    case "DESCRIPTION":
    default:
      return tx.description ?? "";
  }
}

export function ruleMatches(rule: MatchableRule, tx: MatchableTransaction): boolean {
  if (!rule.enabled) return false;

  const value = fieldValue(tx, rule.matchField).toLocaleUpperCase("pt-BR");
  const pattern = rule.pattern.toLocaleUpperCase("pt-BR");
  if (!value) return false;

  switch (rule.matchType) {
    case "EQUALS":
      return value === pattern;
    case "STARTS_WITH":
      return value.startsWith(pattern);
    case "REGEX":
      try {
        return new RegExp(rule.pattern, "i").test(fieldValue(tx, rule.matchField));
      } catch {
        return false;
      }
    case "CONTAINS":
    default:
      return value.includes(pattern);
  }
}

/** Deriva um padrão "contains" razoável a partir do texto de uma transação para criar uma regra por aprendizado. */
export function extractPattern(text: string): string {
  return text.trim().slice(0, 60);
}
