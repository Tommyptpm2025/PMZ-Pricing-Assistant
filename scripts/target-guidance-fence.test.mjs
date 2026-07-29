/**
 * FENCE for the no-cost-basis TARGET GUIDANCE (Cause 3 Part 2). When a quote/line has no cost basis,
 * the strip must show a GOAL, explicitly labeled — never a measured profit it hasn't proven.
 *   (1) BEHAVIORAL — the REAL resolver (resolveTargetMargin) is LIVE by tier band ($10k Commercial
 *       Paving = 23%, $4k = 24%), and profitTargetAndCeiling agrees EXACTLY with the golden formula.
 *   (2) STRUCTURAL — the header renders "—" for Gross Profit with no cost basis (never revenue); the
 *       header and the per-line panel share ONE math home (profitTargetAndCeiling); the target
 *       treatment is gated on !hasCostBasis so a partial-cost quote never takes it (Law 5).
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/target-guidance-fence.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { resolveTargetMargin, profitTargetAndCeiling } from "../lib/target-guidance.ts";
import { goldenFormula } from "../lib/pricing.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const pricer = readFileSync(join(repoRoot, "app", "project-pricer", "page.tsx"), "utf8");

// The company's Commercial Paving annual-goal bands.
const CP = [
  { low: 0, high: 5000, targetGpPercent: 24 },
  { low: 5001, high: 15000, targetGpPercent: 23 },
  { low: 15001, high: 30000, targetGpPercent: 22 },
  { low: 30001, high: 75000, targetGpPercent: 20 },
  { low: 75001, high: 100000, targetGpPercent: 18 },
];

// ── 1 — BEHAVIORAL: live tier lookup + profit/ceiling agree with the golden formula ────────────
assert.equal(resolveTargetMargin(CP, 10000), 23, "$10,000 lands in the $5,001–$15,000 band → 23% (live, not hardcoded)");
assert.equal(resolveTargetMargin(CP, 4000), 24, "$4,000 lands in the $0–$5,000 band → 24% — the tier lookup must move with revenue, never a fixed 23%");
assert.equal(resolveTargetMargin(CP, 20000), 22, "$20,000 → 22% band");
{
  const { profitTarget, costCeiling } = profitTargetAndCeiling(10000, 23);
  assert.equal(profitTarget, 2300, "profit target = revenue × margin = 10000 × 0.23 = 2300");
  assert.equal(costCeiling, 7700, "cost ceiling = revenue − profit target = 10000 − 2300 = 7700");
  assert.ok(Math.abs(goldenFormula(costCeiling, 23) - 10000) < 0.01, "cross-check: goldenFormula(7700, 23) === 10000 (the two must agree exactly)");
}
{
  const { profitTarget, costCeiling } = profitTargetAndCeiling(4000, 24);
  assert.equal(profitTarget, 960, "the $4,000/24% case: profit target 960");
  assert.equal(costCeiling, 3040, "the $4,000/24% case: cost ceiling 3040");
  assert.ok(Math.abs(goldenFormula(costCeiling, 24) - 4000) < 0.01, "cross-check: goldenFormula(3040, 24) === 4000");
}
console.log("PASS: target guidance — resolveTargetMargin is live by band ($10k→23%, $4k→24%); profit/ceiling agree with the golden formula");

// ── 2 — STRUCTURAL: the strip tells the truth, one math home, no blend ─────────────────────────
// M2 — Gross Profit is "—" with no cost basis, never revenue.
assert.ok(
  pricer.includes('hasCostBasis ? formatMoney(eppGrossProfitDollars) : "—"'),
  "the header strip must render Gross Profit as \"—\" when there is no cost basis (never eppGrossProfitDollars, which equals revenue) — a claimed $10,000 profit on zero cost is the defect (app/project-pricer/page.tsx header strip)"
);
// M3 — header and per-line share the ONE profit/ceiling math home (both call profitTargetAndCeiling).
assert.equal(
  (pricer.match(/profitTargetAndCeiling\(/g) || []).length,
  2,
  "both the header strip AND the per-line panel must compute the goal via profitTargetAndCeiling — a second, inline calculation lets the per-line panel and the header DIVERGE on the same quote"
);
// M5 — the target treatment is gated on NO cost basis; a partial-cost quote must not take it (Law 5, No-Blending).
assert.ok(
  pricer.includes("const showTargetGuidance = !hasCostBasis"),
  "the target treatment must be gated on !hasCostBasis — a PARTIAL-cost quote (Planned Cost > 0) must keep real numbers, never a goal blended into a measured one (Law 5, No-Blending)"
);
// Wording guard (Cause 3 §6): the goal is explicitly LABELLED; the ceiling is stated as a target.
assert.ok(pricer.includes("Gross Profit Target:"), "the goal must carry the load-bearing word 'Target' — 'Gross Profit Target:'");
assert.ok(pricer.includes("To hit "), "the cost ceiling must be stated as a goal — 'To hit N%, your cost needs to land at or under …'");
console.log("PASS: target-guidance wiring — GP is '—' with no cost basis; header + per-line share one math home; partial-cost never takes the target treatment; the goal is labeled");
