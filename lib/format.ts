// Shared currency formatters — single source of truth.
// formatMoney: "$1,234.56" (2 decimals, thousands separators)
// formatWhole: "1,234"     (0 decimals, thousands separators)
// Mirrors the long-standing per-file helpers so call sites can migrate to one import.

export function formatMoney(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "$0.00";
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
