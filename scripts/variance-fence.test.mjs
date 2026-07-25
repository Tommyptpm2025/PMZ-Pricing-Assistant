/**
 * FENCE-REGRESSION SUITE for the owner Estimate-vs-Actual variance (v-1 / v-2, Jul 23 2026).
 *
 * Proves, over the REAL bridge (bid line → buildLineRecipeSections → createJobFromQuote →
 * computeOwnerVariance), the four invariants the variance view lives or dies by:
 *   1. Planned $ ties to the bid line: plannedQty × the bid-time unit cost.
 *   2. Actual $ = actualQty × the bid-time unitCost SNAPSHOT (rowCostBasis) — the rate we bid,
 *      never a re-resolved live rate (v-2).
 *   3. A null actualQty stays OUT of the dollar math — it is "not yet reported", never a
 *      fabricated $0 (the Book's no-fabricated-confirmation rule).
 *   4. Gap = actual − planned, like-for-like over the REPORTED rows only.
 * Plus: legacy jobs (no rowCostBasis) degrade to { available: false }, never a fabricated total.
 *
 * The bridge is exercised for real, not mocked: the cost basis is peeled from the same recipe
 * draft the foreman rows are stamped from, so this fence fails if the join ever breaks.
 *
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/variance-fence.test.mjs
 * (.mjs so tsc's "**\/*.ts" include doesn't pull it in; Node strips the imported .ts types.)
 */
import assert from "node:assert/strict";
import { buildLineRecipeSections } from "../lib/lem-detail.ts";
import { createJobFromQuote, updateRecipeRowActual, computeOwnerVariance, backfillRowCostBasis } from "../lib/jobs.ts";

const round2 = (n) => Math.round(n * 100) / 100;

// Rate catalogs resolve to 0 — every entry below carries an explicit `rate`, so the bid-time
// unit cost is deterministic and independent of any store.
const CATS = {
  laborRates: [{ id: "op", role: "Operator" }],
  equipmentRates: [{ id: "sk", description: "Skid Steer" }],
  materialRates: [{ id: "gr", description: "Gravel", unitOfMeasure: "Ton" }],
  miscRates: [{ id: "pm", description: "Permit", unitOfMeasure: "" }],
  getLaborCostPerHour: () => 0,
  getEquipmentCostPerHour: () => 0,
  getMaterialCostPerUnit: () => 0,
  getMiscCostPerUnit: () => 0,
};

// One EPP bid line with all four LEM categories. Explicit rates = known bid-time unit costs.
const ITEM = {
  id: "b1",
  description: "Asphalt Patch",
  quantity: 1,
  unit: "LS",
  unitPrice: 10000,
  laborEntries: [{ rateId: "op", hours: 10, rate: 85 }],        // planned 10 hrs @ 85 = 850
  equipmentEntries: [{ rateId: "sk", hours: 8, rate: 40 }],     // planned  8 hrs @ 40 = 320
  materialEntries: [{ rateId: "gr", quantity: 30, rate: 35 }],  // planned 30 Ton @ 35 = 1050
  miscellaneousEntries: [{ rateId: "pm", quantity: 1, rate: 200 }], // planned 1 @ 200 = 200
};

function buildJob() {
  return createJobFromQuote({
    quoteId: "q1",
    jobName: "Elm Street",
    workTypeName: "Paving",
    salesperson: "Owner",
    contractValue: 10000,
    bidItems: [{ id: "b1", description: "Asphalt Patch", quantity: 1, unit: "LS", unitPrice: 10000 }],
    recipeLines: [{ lineId: "b1", description: "Asphalt Patch", sections: buildLineRecipeSections(ITEM, CATS) }],
  });
}

// Locate a row by its resolved name (row ids are minted inside createJobFromQuote).
function rowIdByName(job, name) {
  for (const line of job.recipeLines)
    for (const section of line.sections)
      for (const row of section.rows)
        if (row.name === name) return row.id;
  throw new Error(`row not found: ${name}`);
}

// ── 1 — the cost basis lives OFF the foreman rows, ON the owner map ───────────────────────────
{
  const job = buildJob();
  // The persisted foreman rows carry NO cost/rate/$ — the zero-dollars law, structurally.
  for (const line of job.recipeLines)
    for (const section of line.sections)
      for (const row of section.rows) {
        assert.ok(!("unitCost" in row) && !("rate" in row) && !("cost" in row),
          "foreman recipe row carries no cost/rate/$");
        assert.equal(row.actualQty, null, "every row starts null — not yet reported");
      }
  // The owner cost basis has one entry per row, non-empty.
  assert.equal(Object.keys(job.rowCostBasis).length, 4, "rowCostBasis has one entry per recipe row");
}

// ── 2 — PLANNED $ ties to the bid line; nothing reported yet ─────────────────────────────────
{
  const job = buildJob();
  const v = computeOwnerVariance(job);
  assert.ok(v.available, "a job with a cost basis is available");
  assert.equal(v.plannedTotal, 850 + 320 + 1050 + 200, "planned total = Σ plannedQty × bid-time unit cost");
  assert.equal(v.plannedTotal, 2420, "planned total ties to the fixture");
  // Nothing reported: actual side is empty, gap is 0 over zero reported rows, no fabrication.
  assert.equal(v.anyReported, false, "no actuals yet → nothing reported");
  assert.equal(v.actualReported, 0, "actualReported is 0 only because ZERO rows are reported (not a fabricated valuation)");
  assert.equal(v.reportedCount, 0, "reportedCount 0");
  assert.equal(v.totalRows, 4, "totalRows 4");
  // Every row's actualCost is null (not 0) until the foreman reports it.
  for (const line of v.lines)
    for (const row of line.rows)
      assert.equal(row.actualCost, null, `${row.name}: actualCost is null until reported — never a fabricated 0`);
}

// ── 3 — ACTUAL $ = actualQty × bid-time basis; nulls stay OUT; gap is like-for-like ──────────
{
  let job = buildJob();
  // Foreman reports labor (12 hrs) and material (33 Ton); equipment + misc left blank (null).
  job = updateRecipeRowActual([job], job.id, rowIdByName(job, "Operator"), 12)[0];
  job = updateRecipeRowActual([job], job.id, rowIdByName(job, "Gravel"), 33)[0];

  const v = computeOwnerVariance(job);
  const rows = Object.fromEntries(v.lines[0].rows.map((r) => [r.name, r]));

  // Reported rows: actual $ = actualQty × the SNAPSHOT rate (not a live rate).
  assert.equal(rows["Operator"].actualCost, 12 * 85, "labor actual $ = actualQty × bid-time rate");
  assert.equal(rows["Gravel"].actualCost, 33 * 35, "material actual $ = actualQty × bid-time rate");
  assert.equal(rows["Operator"].reported, true, "labor is reported");
  assert.equal(rows["Gravel"].reported, true, "material is reported");

  // Unreported rows: null stays null, excluded from every dollar total. NEVER $0.
  assert.equal(rows["Skid Steer"].actualCost, null, "equipment unreported → actualCost null, not 0");
  assert.equal(rows["Permit"].actualCost, null, "misc unreported → actualCost null, not 0");
  assert.equal(rows["Skid Steer"].reported, false, "equipment not reported");
  assert.equal(rows["Permit"].reported, false, "misc not reported");

  // Totals: only the two reported rows contribute.
  assert.equal(v.reportedCount, 2, "2 of 4 reported");
  assert.equal(v.fullyReported, false, "not fully reported");
  assert.equal(v.actualReported, 12 * 85 + 33 * 35, "actualReported sums ONLY reported rows");
  assert.equal(v.actualReported, 1020 + 1155, "actualReported = 2175");

  // Gap is like-for-like: planned of the REPORTED rows only (850 + 1050), not the full 2420.
  assert.equal(v.plannedReported, 850 + 1050, "plannedReported = planned of the reported rows only");
  assert.equal(v.gap, v.actualReported - v.plannedReported, "gap = actualReported − plannedReported");
  assert.equal(v.gap, 2175 - 1900, "gap = 275 (drift on reported work, valued at bid rates)");
  // The full plan is NOT used as the gap baseline — that would show a phantom shortfall.
  assert.notEqual(v.gap, v.actualReported - v.plannedTotal, "gap must NOT compare partial actual to the full plan");
}

// ── 4 — full report: plannedReported collapses to plannedTotal, gap is the true full gap ─────
{
  let job = buildJob();
  job = updateRecipeRowActual([job], job.id, rowIdByName(job, "Operator"), 10)[0];     // on plan
  job = updateRecipeRowActual([job], job.id, rowIdByName(job, "Skid Steer"), 9)[0];    // +1 hr over
  job = updateRecipeRowActual([job], job.id, rowIdByName(job, "Gravel"), 30)[0];       // on plan
  job = updateRecipeRowActual([job], job.id, rowIdByName(job, "Permit"), 1)[0];        // on plan

  const v = computeOwnerVariance(job);
  assert.equal(v.fullyReported, true, "all four reported");
  assert.equal(v.plannedReported, v.plannedTotal, "fully reported → plannedReported === plannedTotal");
  assert.equal(v.actualReported, 10 * 85 + 9 * 40 + 30 * 35 + 1 * 200, "actual total across all rows");
  assert.equal(v.gap, 40, "only the equipment overran: +1 hr × 40 = +40");
}

// ── 5 — a null actualQty NEVER dollarizes, even after being set then cleared ──────────────────
{
  let job = buildJob();
  job = updateRecipeRowActual([job], job.id, rowIdByName(job, "Operator"), 12)[0];
  job = updateRecipeRowActual([job], job.id, rowIdByName(job, "Operator"), null)[0]; // clear back to unreported
  const v = computeOwnerVariance(job);
  const labor = v.lines[0].rows.find((r) => r.name === "Operator");
  assert.equal(labor.actualQty, null, "cleared row is null again");
  assert.equal(labor.actualCost, null, "cleared row contributes null, not 0");
  assert.equal(v.reportedCount, 0, "cleared → nothing reported");
}

// ── 6 — legacy job (no cost basis) degrades honestly ─────────────────────────────────────────
{
  const job = buildJob();
  const legacy = { ...job, rowCostBasis: {} }; // predates the bridge
  const v = computeOwnerVariance(legacy);
  assert.equal(v.available, false, "no cost basis → available:false, never a fabricated total");
}

// ── 7 — backfill: a legacy job (no basis) gets one on re-accept; a present basis is never touched ──
const FRESH = [{ lineId: "b1", sections: buildLineRecipeSections(ITEM, CATS) }];
{
  // A job created before rowCostBasis existed: strip it to empty (the "unavailable" shape).
  const legacy = { ...buildJob(), rowCostBasis: {} };
  assert.equal(computeOwnerVariance(legacy).available, false, "legacy job reads unavailable before backfill");

  const filled = backfillRowCostBasis(legacy, FRESH);
  const v = computeOwnerVariance(filled);
  assert.equal(v.available, true, "backfill enables variance on a legacy job");
  assert.equal(v.plannedTotal, 2420, "backfilled basis reproduces the bid-time planned total");
  // Every row got its bid-time unit cost back, keyed to the EXISTING (frozen) row ids.
  for (const line of v.lines)
    for (const row of line.rows)
      assert.ok(row.unitCost > 0, `${row.name}: backfilled a real unit cost`);
}
{
  // Frozen-snapshot law: a job that ALREADY has a basis must never be overwritten, even if the
  // fresh costs differ (e.g. rates moved since accept).
  const withBasis = buildJob(); // has a real basis from createJobFromQuote
  const bumped = [{ lineId: "b1", sections: buildLineRecipeSections(
    { ...ITEM, laborEntries: [{ rateId: "op", hours: 10, rate: 999 }] }, CATS) }];
  const result = backfillRowCostBasis(withBasis, bumped);
  assert.equal(result, withBasis, "a present basis is returned untouched (never overwritten)");
}
{
  // No fabricated numbers: a row that doesn't match a fresh draft (name/unit diverged) gets no
  // basis rather than a wrong one.
  const legacy = { ...buildJob(), rowCostBasis: {} };
  const mismatched = [{ lineId: "b1", sections: [{ title: "Labor", isCrew: false,
    rows: [{ name: "DIFFERENT", plannedQty: 10, unit: "hrs", unitCost: 85 }] }] }];
  const filled = backfillRowCostBasis(legacy, mismatched);
  // The first labor row's name won't match "DIFFERENT" → left unset; others have no fresh line → unset.
  const laborRow = filled.recipeLines[0].sections[0].rows[0];
  assert.equal(filled.rowCostBasis[laborRow.id], undefined, "a name-mismatched row is left unset, not mis-valued");
}

console.log("PASS: planned $ ties to bid lines; actual $ = actualQty × bid-time basis; gap = actual − planned (reported, like-for-like)");
console.log("PASS: null actualQty stays OUT of dollar math — 'not yet reported', never a fabricated $0; cleared rows revert to null");
console.log("PASS: cost basis lives off the foreman rows (zero-dollars law); legacy jobs degrade to 'unavailable'");
console.log("PASS: backfill fills a MISSING basis on re-accept (variance enabled), never overwrites a present one, never mis-values a mismatched row");
