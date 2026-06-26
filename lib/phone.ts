/**
 * PMZ Pricing Assistant — phone number formatting (app-wide single source).
 *
 * Locked format: xxx-xxx-xxxx. Dashes auto-insert as the user types, input is hard-capped at
 * 10 digits, and any non-digit (spaces, parens, country code, +) is stripped. No country code,
 * no parentheses. Wire EVERY phone input's onChange through this so the format is identical
 * everywhere.
 */
export function formatPhone(value: string): string {
  const d = (value || "").replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Shared placeholder so every phone field shows the same example. */
export const PHONE_PLACEHOLDER = "555-123-4567";
