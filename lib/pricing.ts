// The Golden Formula — ONE implementation, shared by every surface that recommends a price.
//
// Price that yields `marginPct` gross margin on a break-even `cost`:  cost ÷ (1 − margin).
// Stored rates are true break-even cost (no overhead, no profit, no markup), so this is the
// markup step and nothing else.
//
// GAVELED Jul 22, 2026 (Tom): the shared Golden Formula never returns NaN, Infinity, or a
// negative price. Out-of-domain input falls back to cost (break-even). Corrupt data renders
// honest, never nonsense. Previously six unshared copies disagreed at exactly these edges —
// two guarded the margin range, four did not, so a stored margin of 100 produced Infinity and
// a missing one produced NaN.
//
// This is OWNER-FACING COACHING ONLY. Law 56: the customer document prints the QUOTED price,
// never a recommendation — see lib/quote-document.ts and quote-document-fence.test.mjs.
//
// Callers keep their own rounding and their own out-of-range fallback where those differ:
// the per-line target guidance (project-pricer) falls back to 0, NOT cost, because a missing
// target must never coach a break-even sale.

/** Golden Formula: the price at which `cost` earns `marginPct` gross margin. */
export function goldenFormula(cost: number, marginPct: number): number {
  if (!Number.isFinite(cost)) return 0;
  if (!Number.isFinite(marginPct)) return cost;
  return marginPct > 0 && marginPct < 100 ? cost / (1 - marginPct / 100) : cost;
}
