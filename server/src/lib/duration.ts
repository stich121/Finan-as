const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Converte strings simples tipo "15m", "30d", "1h" para milissegundos. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
  if (!match) throw new Error(`Duração inválida: ${value}`);
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit.toLowerCase()];
}
