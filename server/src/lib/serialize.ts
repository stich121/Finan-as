import type { Decimal } from "@prisma/client/runtime/library";

export function toNumber(value: Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}
