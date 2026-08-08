/**
 * THE MARGIN ZONE — the pure math behind the tachometer (Profit Margin Zone, the brand itself).
 *
 * ONE QUESTION: are we in the zone? The needle is the BOOKED blended margin on won work; the zone is
 * the company's blended TARGET margin from the boss's entered goals. Everything here is pure and
 * fence-proved so a ruling can move the band without hunting through a component.
 *
 * ── WHAT THIS MODULE DOES NOT DO ──────────────────────────────────────────────────────────────────
 * It gives no advice, fires no trigger, and adjusts nothing (Law 82 — PMZ Informs, the Owner Decides).
 * It reports WHERE THE NEEDLE SITS in plain words. Whether a margin below the zone means "buying work
 * on purpose" or "leaving money on the table", and whether one above it means "priced right" or
 * "pricing ourselves out", is the owner's judgment, made outside the software.
 *
 * It also derives NO money of its own. Blended margins are computed from dollar pairs the tracker
 * already produced (computeScorecard's companyTotal) — this file divides two numbers it was handed and
 * guards the denominator, nothing more.
 */

// ── THE BAND ──────────────────────────────────────────────────────────────────────────────────────
//
// The zone is a BAND, not a line: a target hit to the decimal is not what "in the zone" means to
// anybody running a company. Its half-width is stated ONCE, here, in PERCENTAGE POINTS.
//
// WHY POINTS AND NOT A PERCENTAGE OF THE TARGET: a relative band changes what it means at different
// targets — ±10% of a 40-point target is 4 points wide, of a 10-point target is 1 point. A contractor
// talks in points ("we bid it at twenty-five"), so the band is stated in the same unit the owner
// thinks in, and it means the same thing on every work type.
//
// TWO POINTS EITHER SIDE is the opening ruling, not a discovery: it is the smallest band that survives
// ordinary bid-to-bid variation without reading as noise. Change this constant and the whole page,
// its readout and its fence move together.
export const MARGIN_ZONE_HALF_WIDTH_POINTS = 2;

export interface MarginZone {
  targetPct: number;
  lowPct: number;
  highPct: number;
}

/**
 * The band around a target. Null when there is no target to build one from — no goals entered means
 * NO ZONE, which the page must say out loud rather than drawing a band around zero.
 */
export function marginZone(
  targetPct: number | null | undefined,
  halfWidthPoints: number = MARGIN_ZONE_HALF_WIDTH_POINTS
): MarginZone | null {
  if (typeof targetPct !== "number" || !Number.isFinite(targetPct) || targetPct <= 0) return null;
  return {
    targetPct,
    lowPct: targetPct - halfWidthPoints,
    highPct: targetPct + halfWidthPoints,
  };
}

/**
 * Where a margin sits relative to the band.
 *
 * THE EDGES ARE INCLUSIVE: exactly on an edge is IN the zone. Same rule the change-order ceiling
 * holds ("at or below is inside it") — the boundary value itself belongs to the thing it bounds, and a
 * needle landing precisely on 23.0% of a 23–27 band has not fallen out of it.
 *
 * BOTH SIDES ARE OUT. Below the zone and above it are equally "not where you said you'd be"; this
 * function ranks neither as better. That judgment is the owner's.
 */
export type ZonePosition = "below" | "in" | "above";

export function classifyMargin(
  actualPct: number | null | undefined,
  zone: MarginZone | null
): ZonePosition | null {
  if (!zone) return null;
  if (typeof actualPct !== "number" || !Number.isFinite(actualPct)) return null;
  if (actualPct < zone.lowPct) return "below";
  if (actualPct > zone.highPct) return "above";
  return "in";
}

// ── BLENDED MARGIN ────────────────────────────────────────────────────────────────────────────────

/**
 * GP ÷ sales, as a percent. NULL when the denominator is zero, negative or missing — an honest dash.
 * Never 0% (which claims a measured margin of nothing) and never Infinity/NaN. The dollars come from
 * the tracker's own aggregates; this only divides them.
 */
export function blendedMarginPct(
  gpDollars: number | null | undefined,
  salesDollars: number | null | undefined
): number | null {
  if (typeof gpDollars !== "number" || !Number.isFinite(gpDollars)) return null;
  if (typeof salesDollars !== "number" || !Number.isFinite(salesDollars) || salesDollars <= 0) return null;
  return (gpDollars / salesDollars) * 100;
}

// ── THE DIAL SCALE ────────────────────────────────────────────────────────────────────────────────
//
// The face runs 0–50 points. Fixed rather than fitted to the data, so the needle means the same thing
// week to week — a dial that rescales itself is a dial you cannot read at a glance. Values outside the
// face clamp to its ends (and the readout still states the true number, so nothing is hidden).
export const GAUGE_MIN_PCT = 0;
export const GAUGE_MAX_PCT = 50;

/** A margin's position on the face, 0..1. Clamped. Null in, null out. */
export function gaugeFraction(pct: number | null | undefined): number | null {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  const span = GAUGE_MAX_PCT - GAUGE_MIN_PCT;
  const raw = (pct - GAUGE_MIN_PCT) / span;
  return Math.min(1, Math.max(0, raw));
}

// ── THE READOUT ───────────────────────────────────────────────────────────────────────────────────

const pt = (n: number): string => `${n.toFixed(1)}%`;
const points = (n: number): string => {
  const abs = Math.abs(n);
  return `${abs.toFixed(1)} ${abs === 1 ? "point" : "points"}`;
};

/**
 * Where the needle sits, in plain words and nothing more. STATEMENTS OF FACT ONLY — no "consider",
 * no "you should", no exclamation. The band is always named so the reader can check the claim.
 */
export function zoneReadout(
  actualPct: number | null,
  zone: MarginZone | null,
  year: number
): string {
  if (!zone) {
    return `No margin goals entered for ${year} — there is no zone to read against yet.`;
  }
  const band = `${pt(zone.lowPct)}–${pt(zone.highPct)}, around a ${pt(zone.targetPct)} target`;
  if (actualPct === null) {
    return `No won work booked in ${year} yet. The zone is ${band}.`;
  }
  const position = classifyMargin(actualPct, zone);
  if (position === "in") return `Booked margin ${pt(actualPct)} is IN the zone (${band}).`;
  if (position === "below") {
    return `Booked margin ${pt(actualPct)} is ${points(zone.lowPct - actualPct)} below the zone (${band}).`;
  }
  return `Booked margin ${pt(actualPct)} is ${points(actualPct - zone.highPct)} above the zone (${band}).`;
}

/** The second mark: what was executed against what was sold. Fact, not verdict. */
export function performedReadout(bookedPct: number | null, performedPct: number | null): string {
  if (performedPct === null) return "Nothing recognized yet this year — no performed margin to compare.";
  if (bookedPct === null) return `Performed margin ${pt(performedPct)}.`;
  const gap = performedPct - bookedPct;
  if (Math.abs(gap) < 0.05) return `Performed margin ${pt(performedPct)} — level with what was sold.`;
  const dir = gap > 0 ? "above" : "under";
  return `Performed margin ${pt(performedPct)} — ${points(gap)} ${dir} what was sold.`;
}

// ── THE OVERHEAD GAUGE ────────────────────────────────────────────────────────────────────────────
//
// Gross profit earned this year against the year's overhead. A linear fill with the crossover — the
// point where GP has covered overhead and the next dollar is profit — marked on it.
//
// THE DENOMINATOR IS NEVER FABRICATED. No annual overhead figure entered means NO GAUGE: an empty
// state naming what is missing. Multiplying a monthly chart by twelve to manufacture a year would be
// exactly the make-believe number the No-Blending Law forbids.

export interface OverheadCoverage {
  annualOverhead: number;
  gpEarned: number;
  /** 0..1 of the way to covering the year's overhead. Clamped at 1 once covered. */
  fraction: number;
  covered: boolean;
  /** What is still uncovered; 0 once covered. Never negative. */
  remaining: number;
}

export function overheadCoverage(
  gpEarned: number | null | undefined,
  annualOverhead: number | null | undefined
): OverheadCoverage | null {
  if (typeof annualOverhead !== "number" || !Number.isFinite(annualOverhead) || annualOverhead <= 0) {
    return null; // no honest denominator — the caller renders the empty state
  }
  const gp = typeof gpEarned === "number" && Number.isFinite(gpEarned) ? gpEarned : 0;
  const remaining = Math.max(0, annualOverhead - gp);
  return {
    annualOverhead,
    gpEarned: gp,
    fraction: Math.min(1, Math.max(0, gp / annualOverhead)),
    covered: gp >= annualOverhead,
    remaining,
  };
}
