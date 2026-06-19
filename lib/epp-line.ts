/**
 * Pure EPP bid-line value helpers — the SINGLE source of truth for an EPP line's
 * customer price and the quote's total revenue. The worksheet display and the save
 * path both go through these so they can never diverge again (that divergence — the
 * worksheet showing entered line totals while save persisted a cost-derived recompute
 * — silently zeroed manually-priced lines on Save).
 */

export interface EppBidLine {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

/**
 * The persisted customer-facing line item for an EPP bid line. The unit price is the
 * price shown/entered in the worksheet (item.unitPrice) — NOT a cost-derived recompute —
 * so manually-entered prices survive Save -> reload -> Duplicate with their real numbers.
 */
export function serializeEppLine(item: {
  id: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
}): EppBidLine {
  return {
    id: item.id,
    description: item.description || "",
    quantity: item.quantity || 0,
    unit: item.unit || "",
    unitPrice: item.unitPrice || 0,
  };
}

/** One line's total = quantity × unit price (the value shown in the worksheet). */
export function eppLineTotal(line: { quantity?: number; unitPrice?: number }): number {
  return (line.quantity || 0) * (line.unitPrice || 0);
}

/**
 * Total EPP revenue = sum of entered line totals. Used by BOTH the live worksheet total
 * and the saved quote's totalRevenue, so the Quotes list always matches the worksheet.
 */
export function eppTotalRevenue(lines: Array<{ quantity?: number; unitPrice?: number }>): number {
  return lines.reduce((sum, l) => sum + eppLineTotal(l), 0);
}
