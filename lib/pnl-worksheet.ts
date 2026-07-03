// P&L Organizer worksheet — the manual-entry data set for Build F (Goal 1 & 2).
// This is a WORKSHEET, deliberately separate from the Overhead & Profit chart
// (pmz_overhead_chart). A prospect's P&L entered here must never overwrite Tom's
// own overhead chart; the F2 handoff is the one explicit bridge between them.
// Diagnostic only — nothing here multiplies onto cost to build a price (Rule M-1).

export type PnlBucket = "Direct COGS" | "Indirect COGS" | "Overhead";
export type CostBehavior = "Fixed" | "Variable";

export interface PnlLine {
  id: string;
  label: string;
  amount: number;
  bucket: PnlBucket;
  behavior: CostBehavior;
}

export interface PnlWorksheet {
  revenue: number;
  lines: PnlLine[];
}

// The five true numbers (+ the countdown value), derived — never stored.
export interface PnlSummary {
  revenue: number;
  directCogs: number;
  indirectCogs: number;
  costOfGoods: number; // direct + indirect
  grossProfit: number; // revenue − costOfGoods
  overhead: number;
  netProfit: number; // grossProfit − overhead
  overheadRemaining: number; // max(0, overhead − grossProfit); 0 ⇒ covered
}

export const PNL_WORKSHEET_KEY = "pmz_pnl_worksheet_v1";

function createId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function newLine(bucket: PnlBucket): PnlLine {
  return { id: createId(), label: "", amount: 0, bucket, behavior: "Fixed" };
}

// A fresh worksheet with one starter line per bucket so the structure is visible.
export function emptyWorksheet(): PnlWorksheet {
  return {
    revenue: 0,
    lines: [newLine("Direct COGS"), newLine("Indirect COGS"), newLine("Overhead")],
  };
}

export function loadWorksheet(): PnlWorksheet {
  if (typeof window === "undefined") return emptyWorksheet();
  try {
    const raw = window.localStorage.getItem(PNL_WORKSHEET_KEY);
    if (!raw) return emptyWorksheet();
    const parsed = JSON.parse(raw) as PnlWorksheet;
    if (!parsed || !Array.isArray(parsed.lines)) return emptyWorksheet();
    return {
      revenue: typeof parsed.revenue === "number" ? parsed.revenue : 0,
      lines: parsed.lines.map((l) => ({
        id: l.id || createId(),
        label: l.label || "",
        amount: typeof l.amount === "number" ? l.amount : 0,
        bucket: l.bucket,
        behavior: l.behavior === "Variable" ? "Variable" : "Fixed",
      })),
    };
  } catch {
    return emptyWorksheet();
  }
}

export function saveWorksheet(w: PnlWorksheet): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PNL_WORKSHEET_KEY, JSON.stringify(w));
  } catch {}
}

export function bucketTotal(w: PnlWorksheet, bucket: PnlBucket): number {
  return w.lines.filter((l) => l.bucket === bucket).reduce((s, l) => s + (l.amount || 0), 0);
}

export function computeSummary(w: PnlWorksheet): PnlSummary {
  const directCogs = bucketTotal(w, "Direct COGS");
  const indirectCogs = bucketTotal(w, "Indirect COGS");
  const overhead = bucketTotal(w, "Overhead");
  const revenue = w.revenue || 0;
  const costOfGoods = directCogs + indirectCogs;
  const grossProfit = revenue - costOfGoods;
  const netProfit = grossProfit - overhead;
  const overheadRemaining = Math.max(0, overhead - grossProfit);
  return { revenue, directCogs, indirectCogs, costOfGoods, grossProfit, overhead, netProfit, overheadRemaining };
}
