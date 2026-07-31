// Target-margin guidance for the no-cost-basis case (Cause 3 Part 2). PURE — no React, no localStorage.
// These are the ONE home for two facts so the header strip and the per-line panel can never disagree,
// and so the tier lookup can be unit-tested live:
//
//   resolveTargetTier   — the tier-band lookup: the SINGLE home of the band comparisons. Returns the
//                          matched tier + its index. resolveTargetMargin and the save path's tier id
//                          both read from it — one set of comparisons, thin readers on top.
//   resolveTargetMargin  — the band's target GP% for a size (a thin reader over resolveTargetTier).
//                          Live from the tier table by size; never a hardcoded %.
//   profitTargetAndCeiling — profit target = revenue × margin; cost ceiling = revenue − profit target.
//                          By construction goldenFormula(ceiling, margin) === revenue (see the fence).

export interface Tier {
  low?: number | null;
  high?: number | null;
  targetGpPercent: number;
}

export interface TierMatch {
  tier: Tier;
  index: number;
}

// The matched tier for a given size — the SINGLE home of the band comparisons. size 0 falls to the
// first band; a size past the last band clamps to the last; empty tiers → null (no tier). Returns the
// tier AND its index so a caller can read the margin or the tier id off one resolution.
export function resolveTargetTier(tiers: Tier[], size: number): TierMatch | null {
  if (!tiers || tiers.length === 0) return null;
  if (size === 0) return { tier: tiers[0], index: 0 };
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const low = t.low ?? 0;
    const high = t.high ?? Infinity;
    if (size >= low && size <= high) return { tier: t, index: i };
  }
  return { tier: tiers[tiers.length - 1], index: tiers.length - 1 };
}

// The band's target GP% for a given size — a thin reader over resolveTargetTier. Empty tiers → 0
// (no target; the caller shows no target line).
export function resolveTargetMargin(tiers: Tier[], size: number): number {
  const match = resolveTargetTier(tiers, size);
  return match ? match.tier.targetGpPercent : 0;
}

// Profit target and the cost ceiling that hits it, for a given revenue and target margin %.
export function profitTargetAndCeiling(revenue: number, marginPct: number): { profitTarget: number; costCeiling: number } {
  const profitTarget = revenue * (marginPct / 100);
  return { profitTarget, costCeiling: revenue - profitTarget };
}
