// The ONE qualifying set + sales rollup for realized performance — invoiced-is-terminal.
// Shared single source of truth: the Boss View (Revenue/COGS/Gross), the P&L Organizer's
// read-only Revenue/COGS, and anywhere else "earned sales" is shown all read from here.
// The set MEMBERSHIP is a locked convention — do not add/remove statuses without a ruling.
export const REALIZED_STATUSES = new Set<string>(["Invoiced", "Paid", "Completed"]);

export function qualifyingQuotes(quotes: unknown): any[] {
  return Array.isArray(quotes) ? quotes.filter((q: any) => REALIZED_STATUSES.has(q?.status)) : [];
}

// Earned Revenue / COGS from invoiced-tier quotes, with the Direct/Indirect breakdown.
// `count` is the number of qualifying quotes (0 ⇒ show the instructive empty state).
export function salesFromInvoiced(quotes: unknown): {
  revenue: number;
  cogs: number;
  directCogs: number;
  indirectCogs: number;
  count: number;
} {
  const q = qualifyingQuotes(quotes);
  const directCogs = q.reduce((s, x) => s + (Number(x.directCogsDollars) || 0), 0);
  const indirectCogs = q.reduce((s, x) => s + (Number(x.indirectCogsDollars) || 0), 0);
  const revenue = q.reduce((s, x) => s + (Number(x.totalRevenue) || 0), 0);
  return { revenue, cogs: directCogs + indirectCogs, directCogs, indirectCogs, count: q.length };
}
