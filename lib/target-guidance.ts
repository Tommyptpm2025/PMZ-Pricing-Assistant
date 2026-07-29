// Target-margin guidance for the no-cost-basis case (Cause 3 Part 2). PURE — no React, no localStorage.
// These are the ONE home for two facts so the header strip and the per-line panel can never disagree,
// and so the tier lookup can be unit-tested live:
//
//   resolveTargetMargin  — the tier-band lookup (the SINGLE resolver; the Pricer's getTargetMarginForSize
//                          now delegates here). Live from the tier table by size; never a hardcoded %.
//   profitTargetAndCeiling — profit target = revenue × margin; cost ceiling = revenue − profit target.
//                          By construction goldenFormula(ceiling, margin) === revenue (see the fence).

export interface Tier {
  low?: number | null;
  high?: number | null;
  targetGpPercent: number;
}

// The band's target GP% for a given size (revenue or cost). size 0 falls to the first band; a size past
// the last band clamps to the last. Empty tiers → 0 (no target; the caller shows no target line).
export function resolveTargetMargin(tiers: Tier[], size: number): number {
  if (!tiers || tiers.length === 0) return 0;
  if (size === 0) return tiers[0].targetGpPercent;
  for (const t of tiers) {
    const low = t.low ?? 0;
    const high = t.high ?? Infinity;
    if (size >= low && size <= high) return t.targetGpPercent;
  }
  return tiers[tiers.length - 1].targetGpPercent;
}

// Profit target and the cost ceiling that hits it, for a given revenue and target margin %.
export function profitTargetAndCeiling(revenue: number, marginPct: number): { profitTarget: number; costCeiling: number } {
  const profitTarget = revenue * (marginPct / 100);
  return { profitTarget, costCeiling: revenue - profitTarget };
}
