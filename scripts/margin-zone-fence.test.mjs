/**
 * FENCE for THE MARGIN ZONE — the tachometer's pure math (Profit Margin Zone, the brand itself).
 *
 * ONE QUESTION: are we in the zone? The needle is the BOOKED blended margin; the zone is a BAND around
 * the boss's blended target. This fence pins:
 *   • the band edges, stated in PERCENTAGE POINTS, and the exactly-on-target / exactly-on-each-edge cases
 *   • both sides reading as out-of-zone — below and above are equally "not where you said you'd be"
 *   • every blended derivation guarded: no goals ⇒ an honest DASH, never 0% and never Infinity
 *   • the overhead gauge refusing to invent a denominator
 *
 * Every number is HAND-CALCULATED and written as a literal.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/margin-zone-fence.test.mjs
 */
import assert from "node:assert/strict";
import {
  MARGIN_ZONE_HALF_WIDTH_POINTS,
  GAUGE_MIN_PCT,
  GAUGE_MAX_PCT,
  marginZone,
  classifyMargin,
  blendedMarginPct,
  gaugeFraction,
  zoneReadout,
  performedReadout,
  overheadCoverage,
} from "../lib/margin-zone.ts";
import { deriveTrackerRows, computeScorecard, computeScoreboard, rowsForYear } from "../lib/sales-tracker.ts";

// ── 1 — THE BAND ─────────────────────────────────────────────────────────────────────────────────
// HAND-CALC: a 25% target with a ±2-point half-width gives a 23.0%–27.0% zone.
assert.equal(MARGIN_ZONE_HALF_WIDTH_POINTS, 2, "the band's half-width is stated ONCE, in percentage points");
const z25 = marginZone(25);
assert.deepEqual(z25, { targetPct: 25, lowPct: 23, highPct: 27 }, "a 25% target zones 23.0%–27.0%");
assert.deepEqual(marginZone(40), { targetPct: 40, lowPct: 38, highPct: 42 }, "…and a 40% target zones 38.0%–42.0% — the SAME width, because points mean the same thing at every target");
assert.deepEqual(marginZone(10), { targetPct: 10, lowPct: 8, highPct: 12 }, "…as does a 10% target (a relative band would have made this one 1 point wide)");
// The half-width is a parameter so a ruling can move it without touching a component.
assert.deepEqual(marginZone(25, 5), { targetPct: 25, lowPct: 20, highPct: 30 }, "the half-width is injectable — a future ruling changes one number");

// NO TARGET, NO ZONE. Never a band drawn around zero.
assert.equal(marginZone(null), null, "no target → NO zone; the page must say so rather than band a zero");
assert.equal(marginZone(undefined), null, "…undefined too");
assert.equal(marginZone(0), null, "…and a 0% target is not a target");
assert.equal(marginZone(NaN), null, "…nor is NaN");
assert.equal(marginZone(-5), null, "…nor a negative");

// ── 2 — CLASSIFICATION, INCLUDING EVERY EDGE ────────────────────────────────────────────────────
assert.equal(classifyMargin(25, z25), "in", "EXACTLY ON TARGET is in the zone");
// MUTATION TARGET: shift an edge by a point and these two flip to out-of-zone.
assert.equal(classifyMargin(23, z25), "in", "EXACTLY ON THE LOW EDGE (23.0%) is IN — the boundary belongs to the thing it bounds");
assert.equal(classifyMargin(27, z25), "in", "EXACTLY ON THE HIGH EDGE (27.0%) is IN — same rule, other side");
assert.equal(classifyMargin(22.9, z25), "below", "a tenth under the low edge is BELOW");
assert.equal(classifyMargin(27.1, z25), "above", "a tenth over the high edge is ABOVE");
assert.equal(classifyMargin(24, z25), "in", "inside the band is in");
assert.equal(classifyMargin(26, z25), "in", "…from either direction");
assert.equal(classifyMargin(12, z25), "below", "well under is below");
assert.equal(classifyMargin(38, z25), "above", "well over is above — BOTH SIDES ARE OUT: too low is buying work, too high may be pricing out of work, and this function ranks neither");
assert.equal(classifyMargin(0, z25), "below", "a zero margin is below the zone, not 'no reading'");
assert.equal(classifyMargin(-4, z25), "below", "…and a negative margin is below it too");
// Nulls stay nulls.
assert.equal(classifyMargin(24, null), null, "no zone → no classification");
assert.equal(classifyMargin(null, z25), null, "no margin → no classification");
assert.equal(classifyMargin(NaN, z25), null, "NaN is not a position on the dial");
console.log("PASS: margin zone band — ±2 percentage points either side of the boss's blended target (25% → 23.0%–27.0%, same width at 10% and 40%); exactly-on-target and exactly-on-each-edge are IN; a tenth outside either edge is out, and below and above are ranked equally; no target yields no zone rather than a band around zero");

// ── 3 — BLENDED MARGIN: GUARDED EVERY WAY ───────────────────────────────────────────────────────
// HAND-CALC: $30,000 GP on $120,000 sales = 25.0%.
assert.equal(blendedMarginPct(30000, 120000), 25, "blended margin = 30,000 ÷ 120,000 = 25.0%");
assert.equal(blendedMarginPct(0, 120000), 0, "a REAL zero margin on real sales IS 0% — a measured answer, not a blank");
assert.equal(blendedMarginPct(-6000, 120000), -5, "…and a loss reads negative: −6,000 ÷ 120,000 = −5.0%");
// THE DASH CASES — never 0%, never Infinity, never NaN.
assert.equal(blendedMarginPct(30000, 0), null, "NO SALES → null (a dash). Never 0%, which would claim a measured margin of nothing; never Infinity");
assert.equal(blendedMarginPct(30000, null), null, "…missing sales → null");
assert.equal(blendedMarginPct(null, 120000), null, "…missing GP → null");
assert.equal(blendedMarginPct(30000, -1), null, "…negative sales are not a denominator");
assert.equal(blendedMarginPct(NaN, 120000), null, "…NaN in, null out");
assert.equal(blendedMarginPct(30000, NaN), null, "…either side");
assert.ok(Number.isFinite(blendedMarginPct(1, 0.0001)), "a tiny but real denominator still divides — the guard is on zero, not on smallness");

// ── 4 — THE DIAL SCALE ──────────────────────────────────────────────────────────────────────────
assert.equal(GAUGE_MIN_PCT, 0, "the face starts at 0%");
assert.equal(GAUGE_MAX_PCT, 50, "…and ends at 50% — FIXED, so the needle means the same thing week to week");
assert.equal(gaugeFraction(0), 0, "0% sits at the start of the face");
assert.equal(gaugeFraction(25), 0.5, "25% sits at the middle (hand-calc: 25 ÷ 50)");
assert.equal(gaugeFraction(50), 1, "50% sits at the end");
assert.equal(gaugeFraction(12.5), 0.25, "…and 12.5% a quarter of the way");
assert.equal(gaugeFraction(80), 1, "a margin past the face CLAMPS to the end — the readout still states the true number, so nothing is hidden");
assert.equal(gaugeFraction(-10), 0, "…and a negative clamps to the start");
assert.equal(gaugeFraction(null), null, "no value → no needle");

// ── 5 — THE READOUT: FACTS, NEVER ADVICE (Law 82) ───────────────────────────────────────────────
assert.equal(
  zoneReadout(24, z25, 2026),
  "Booked margin 24.0% is IN the zone (23.0%–27.0%, around a 25.0% target).",
  "in-zone names the band so the reader can check the claim"
);
assert.equal(
  zoneReadout(18, z25, 2026),
  "Booked margin 18.0% is 5.0 points below the zone (23.0%–27.0%, around a 25.0% target).",
  "below states the distance in points (hand-calc: 23.0 − 18.0 = 5.0)"
);
assert.equal(
  zoneReadout(31, z25, 2026),
  "Booked margin 31.0% is 4.0 points above the zone (23.0%–27.0%, around a 25.0% target).",
  "…and above the same way (hand-calc: 31.0 − 27.0 = 4.0)"
);
assert.equal(
  zoneReadout(24, z25, 2026).includes("1.0 points"),
  false,
  "the singular is handled — no '1.0 points' anywhere"
);
assert.equal(
  zoneReadout(22, z25, 2026),
  "Booked margin 22.0% is 1.0 point below the zone (23.0%–27.0%, around a 25.0% target).",
  "…one point reads as 'point'"
);
assert.equal(
  zoneReadout(null, null, 2026),
  "No margin goals entered for 2026 — there is no zone to read against yet.",
  "NO GOALS: an honest sentence naming the year, not a dial reading against zero"
);
assert.equal(
  zoneReadout(null, z25, 2026),
  "No won work booked in 2026 yet. The zone is 23.0%–27.0%, around a 25.0% target.",
  "…and a zone with nothing booked says exactly that"
);
// LAW 82 — the readout advises nothing.
for (const text of [zoneReadout(18, z25, 2026), zoneReadout(31, z25, 2026), zoneReadout(24, z25, 2026)]) {
  for (const word of ["should", "consider", "recommend", "need to", "must ", "try ", "!"]) {
    assert.equal(text.toLowerCase().includes(word), false, `the readout states where the needle sits and gives NO advice — found "${word}" in: ${text}`);
  }
}
assert.equal(performedReadout(25, 21), "Performed margin 21.0% — 4.0 points under what was sold.", "the performed mark states the gap as fact (hand-calc: 25.0 − 21.0 = 4.0)");
assert.equal(performedReadout(25, 28), "Performed margin 28.0% — 3.0 points above what was sold.", "…in either direction");
assert.equal(performedReadout(25, 25), "Performed margin 25.0% — level with what was sold.", "…and level when they match");
assert.equal(performedReadout(25, null), "Nothing recognized yet this year — no performed margin to compare.", "…nothing recognized says so");
console.log("PASS: margin-zone readout — plain statements of where the needle sits, naming the band and the distance in points (singular handled), with an honest sentence when there are no goals or nothing booked, and no 'should' / 'consider' / 'recommend' anywhere (Law 82)");

// ── 6 — THE OVERHEAD GAUGE: NEVER A FABRICATED DENOMINATOR ──────────────────────────────────────
// HAND-CALC: $180,000 GP against $240,000 annual overhead = 75% of the way, $60,000 still uncovered.
assert.deepEqual(
  overheadCoverage(180000, 240000),
  { annualOverhead: 240000, gpEarned: 180000, fraction: 0.75, covered: false, remaining: 60000 },
  "180,000 GP against 240,000 overhead = 75% covered, 60,000 remaining"
);
assert.deepEqual(
  overheadCoverage(240000, 240000),
  { annualOverhead: 240000, gpEarned: 240000, fraction: 1, covered: true, remaining: 0 },
  "EXACTLY at the crossover is COVERED — the boundary belongs to the thing it bounds, same rule as the band edges"
);
const past = overheadCoverage(300000, 240000);
assert.equal(past.covered, true, "past the crossover is covered");
assert.equal(past.fraction, 1, "…the fill clamps at full");
assert.equal(past.remaining, 0, "…and nothing remains — never a negative 'remaining'");
assert.equal(overheadCoverage(0, 240000).fraction, 0, "no GP yet is an empty gauge against a real denominator");
assert.equal(overheadCoverage(-5000, 240000).fraction, 0, "…and a loss clamps to empty rather than reading below zero");
// THE REFUSALS — no annual overhead means NO GAUGE.
assert.equal(overheadCoverage(180000, 0), null, "NO ANNUAL OVERHEAD ENTERED → null. The page renders an empty state naming what is missing");
assert.equal(overheadCoverage(180000, null), null, "…missing → null");
assert.equal(overheadCoverage(180000, undefined), null, "…undefined → null");
assert.equal(overheadCoverage(180000, NaN), null, "…NaN → null");
assert.equal(overheadCoverage(180000, -1), null, "…and a negative overhead is not a denominator. Multiplying a MONTHLY chart by twelve to manufacture a year would be exactly the fabricated denominator this refuses");

// ── 7 — THE WHOLE DIAL, OVER THE REAL TRACKER READERS ───────────────────────────────────────────
// One home: the dial reads computeScorecard's companyTotal and computeScoreboard — no second math.
// HAND-CALC: two accepted 2026 quotes, 100,000 @ 25,000 GP and 60,000 @ 11,000 GP.
//   booked sales 160,000 · booked GP 36,000 · blended 22.5% → BELOW a 23.0–27.0 zone.
//   goals: 120,000 @ 25% (30,000) + 80,000 @ 25% (20,000) = 200,000 / 50,000 → blended target 25.0%.
const PEOPLE = [{ id: "p1", name: "Ann", roles: ["salesperson"], active: true, createdAt: "2026-01-01T00:00:00Z" }];
const QUOTES = [
  { id: "q1", status: "Approved", createdAt: "2026-02-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 100000, grossProfitDollars: 25000 },
  { id: "q2", status: "Invoiced", createdAt: "2026-03-01T00:00:00Z", workTypeId: "wtB", salespersonId: "p1", totalRevenue: 60000, grossProfitDollars: 11000, actualCost: 46000, actualCostComplete: true },
  { id: "q3", status: "Lost", createdAt: "2026-04-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 40000, grossProfitDollars: 10000 },
  { id: "qOld", status: "Approved", createdAt: "2025-05-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 999999, grossProfitDollars: 500000 }, // wrong year — must never reach the dial
];
const GOALS = [
  { year: 2026, salespersonId: "p1", workTypeId: "wtA", goalSalesDollars: 120000, goalMarginPct: 25 },
  { year: 2026, salespersonId: "p1", workTypeId: "wtB", goalSalesDollars: 80000, goalMarginPct: 25 },
];
const rows = deriveTrackerRows(QUOTES, PEOPLE);
const card = computeScorecard(rows, GOALS, PEOPLE, 2026);

const targetPct = blendedMarginPct(card.companyTotal.goal.marginDollars, card.companyTotal.goal.salesDollars);
assert.equal(card.companyTotal.goal.salesDollars, 200000, "the company target is the SUM of the entered goals: 120,000 + 80,000");
assert.equal(card.companyTotal.goal.marginDollars, 50000, "…and 30,000 + 20,000 of goal margin dollars");
assert.equal(targetPct, 25, "…blending to a 25.0% company target (hand-calc: 50,000 ÷ 200,000)");

const bookedPct = blendedMarginPct(card.companyTotal.actual.gpDollars, card.companyTotal.actual.salesDollars);
assert.equal(card.companyTotal.actual.salesDollars, 160000, "booked sales = 100,000 + 60,000 (the LOST quote and the 2025 one are not won work this year)");
assert.equal(card.companyTotal.actual.gpDollars, 36000, "…booked GP = 25,000 + 11,000");
assert.equal(bookedPct, 22.5, "…blending to 22.5% (hand-calc: 36,000 ÷ 160,000)");

const zone = marginZone(targetPct);
assert.deepEqual(zone, { targetPct: 25, lowPct: 23, highPct: 27 }, "the zone comes from the boss's blended target");
assert.equal(classifyMargin(bookedPct, zone), "below", "22.5% sits BELOW a 23.0–27.0 zone — half a point under the low edge");
assert.equal(
  zoneReadout(bookedPct, zone, 2026),
  "Booked margin 22.5% is 0.5 points below the zone (23.0%–27.0%, around a 25.0% target).",
  "…and the readout says exactly that"
);

// PERFORMED: only q2 is recognized. HAND-CALC: 60,000 revenue − 46,000 actual cost = 14,000 → 23.3%.
const performedPct = blendedMarginPct(card.companyTotal.performed.gpDollars, card.companyTotal.performed.costedSalesDollars);
assert.equal(card.companyTotal.performed.salesDollars, 60000, "performed sales = the ONE recognized quote");
assert.equal(card.companyTotal.performed.gpDollars, 14000, "…performed GP = 60,000 − 46,000");
assert.equal(Math.round(performedPct * 10) / 10, 23.3, "…blending to 23.3% (hand-calc: 14,000 ÷ 60,000)");
assert.equal(classifyMargin(performedPct, zone), "in", "the performed mark lands IN the zone while the booked needle sits below it — the gap IS the story");

// WIN RATE, year-scoped through the SAME year rule the scorecard uses (rowsForYear), never a second filter.
const yearRows = rowsForYear(rows, 2026);
assert.equal(yearRows.length, 3, "2026 has three tracker rows — the 2025 quote is excluded by the shared year rule");
const sb = computeScoreboard(yearRows);
assert.equal(sb.all.wonDollars, 160000, "won dollars this year = 100,000 + 60,000");
assert.equal(sb.all.lostDollars, 40000, "lost dollars = 40,000");
assert.equal(sb.all.winRateByDollars, 0.8, "win rate by DOLLARS = 160,000 ÷ 200,000 = 0.80 (hand-calc)");
assert.equal(sb.all.wonCount, 2, "…won count 2");
assert.equal(sb.all.lostCount, 1, "…lost count 1");
assert.equal(Math.round(sb.all.winRateByCount * 1000) / 1000, 0.667, "…win rate by COUNT = 2 ÷ 3 = 0.667");
assert.equal(computeScoreboard(rows).all.wonDollars, 1159999, "…and WITHOUT the year filter the 2025 quote leaks in (160,000 + 999,999) — which is why the dial scopes first");

// NO GOALS AT ALL — the honest dash, end to end.
const noGoals = computeScorecard(rows, [], PEOPLE, 2026);
assert.equal(noGoals.companyTotal.goal, null, "no goals entered → the company goal cell is null");
assert.equal(blendedMarginPct(noGoals.companyTotal.goal?.marginDollars, noGoals.companyTotal.goal?.salesDollars), null, "…so the blended target is a DASH, never 0% and never Infinity");
assert.equal(marginZone(null), null, "…there is no zone");
assert.equal(classifyMargin(22.5, marginZone(null)), null, "…and no classification to make");
assert.equal(zoneReadout(22.5, marginZone(null), 2026), "No margin goals entered for 2026 — there is no zone to read against yet.", "…the page says so plainly");
console.log("PASS: the tachometer over the real readers — the zone is the boss's blended target from computeScorecard's companyTotal (200,000 / 50,000 → 25.0%), the needle is booked blended margin (160,000 / 36,000 → 22.5%, BELOW the band by 0.5 points), the performed mark reads 23.3% from the one recognized job, win rate is year-scoped through the shared rowsForYear rule (0.80 by dollars, 2 of 3 by count), and with no goals every derivation is an honest dash");
