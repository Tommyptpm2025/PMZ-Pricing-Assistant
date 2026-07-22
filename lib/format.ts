// Shared currency formatters — single source of truth.
// formatMoney: "$1,234.56" (2 decimals, thousands separators)
// formatWhole: "1,234"     (0 decimals, thousands separators)
// Mirrors the long-standing per-file helpers so call sites can migrate to one import.

// Non-finite input renders $0.00, never "$∞" or "$NaN". Same principle as the Golden Formula
// gavel (Jul 22, 2026): corrupt data renders honest, never nonsense. `isFinite` covers the
// undefined/null/NaN cases too — Number(undefined) is NaN, Number(null) is 0.
export function formatMoney(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || !Number.isFinite(Number(amount))) return "$0.00";
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted}`;
}

export function formatWhole(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "0";
  return Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
