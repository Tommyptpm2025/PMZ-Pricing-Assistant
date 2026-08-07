/**
 * FENCE for the WORK-ORDER RECIPE REFRESH (gaveled 2026-08-07, from the Front Lot repro).
 *
 * THE DEFECT: a job's recipe is snapshotted once at createJobFromQuote and never re-read, so a job
 * created while its quote's lines were still empty keeps an empty recipe forever — the foreman opens a
 * work order that names the line and lists nothing under it, while the quote behind it carries a full
 * priced recipe.
 *
 * THE RULE:
 *   • An UNTOUCHED job (no actual entered anywhere, still open, linked to a quote) may be refreshed
 *     from the quote's CURRENT lines — through the SAME stamping createJobFromQuote uses.
 *   • The moment ANY actual exists, or the job completes, the recipe is FROZEN and the refresh is
 *     refused by name. Those actuals were recorded against THOSE rows.
 *   • It is an OFFERED, STAMPED action — never a silent auto-sync. A recipe that rewrites itself under
 *     a working crew is a worse defect than the one it fixes.
 *
 * Every number is HAND-CALCULATED and written as a literal.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/recipe-refresh-fence.test.mjs
 */
import assert from "node:assert/strict";
import {
  createJobFromQuote,
  stampRecipeLines,
  refreshJobRecipe,
  planRecipeRefresh,
  jobHasAnyActual,
  updateRecipeRowActual,
  computeOwnerVariance,
  RECIPE_FROZEN_REASON,
  RECIPE_COMPLETE_REASON,
  RECIPE_NO_QUOTE_REASON,
} from "../lib/jobs.ts";
import { recipeLinesFromQuote } from "../lib/work-order-sweep.ts";
import { buildLineRecipeSections } from "../lib/lem-detail.ts";

const CATS = {
  laborRates: [{ id: "op", role: "Skid Steer Operator" }],
  equipmentRates: [{ id: "ss", description: "Skid Steer 75HP" }],
  materialRates: [{ id: "mix", description: '4" Asphalt Mix', unitOfMeasure: "Ton" }],
  miscRates: [],
  getLaborCostPerHour: () => 55,
  getEquipmentCostPerHour: () => 45,
  getMaterialCostPerUnit: () => 92.5,
  getMiscCostPerUnit: () => 0,
};

// Deterministic ids so a rebuilt recipe is assertable row by row.
let seq = 0;
const ids = () => `r_${++seq}`;
const AT = "2026-08-07T20:00:00.000Z";
const clock = () => AT;

// THE FRONT LOT SHAPE: the quote's line was EMPTY when the job was created…
const emptyLine = { id: "L1", description: "Front Lot Paving" };
// …and carries a full recipe now. HAND-CALC: 8 operator hrs, 6 skid hrs, 20 tons of mix.
const filledLine = {
  id: "L1",
  description: "Front Lot Paving",
  laborEntries: [{ rateId: "op", hours: 8 }],
  equipmentEntries: [{ rateId: "ss", hours: 6 }],
  materialEntries: [{ rateId: "mix", quantity: 20 }],
};

const draftsFor = (line) => recipeLinesFromQuote({ eppLineItems: [line] }, (it) => buildLineRecipeSections(it, CATS));

// ── 0 — THE TRACE, PINNED ─────────────────────────────────────────────────────────────────────────
// The recipe builder has NO flat-rate branch: an empty line yields no rows because it has no entries,
// full stop. (The flat-rate early return lives in buildLineGateFailures — the SEND GATE — and never
// touches the recipe.) Pinned so a future "flat lines should skip the recipe" edit has to face it.
// Proved BEHAVIORALLY rather than by reading the source: the same flag, two lines, opposite entry
// content — if the builder had a flat-rate branch the second assertion would return zero sections.
{
  assert.deepEqual(draftsFor(emptyLine)[0].sections, [], "an EMPTY line yields zero recipe sections — the Front Lot shape, caused by absent entries");
  assert.equal(
    draftsFor({ ...filledLine, flatRate: true })[0].sections.length,
    3,
    "…and a FLAT-RATE line WITH entries still yields all three sections: the recipe builder has NO flat-rate branch, so the flag can never be what blanked a recipe (that early return belongs to the send gate alone)"
  );
  assert.deepEqual(
    draftsFor({ ...emptyLine, flatRate: true })[0].sections,
    [],
    "…while a flat line with no entries yields nothing — for the same reason the plain empty line does"
  );
}

// ── 1 — THE REBUILD ──────────────────────────────────────────────────────────────────────────────
// A job created from the EMPTY line: named, and listing nothing. Exactly the reported defect.
const stale = createJobFromQuote({
  quoteId: "q_1",
  jobName: "Front Lot",
  workTypeName: "Paving",
  salesperson: "Owner",
  contractValue: 20000,
  bidItems: [{ id: "L1", description: "Front Lot Paving", quantity: 1, unit: "LS", unitPrice: 20000 }],
  recipeLines: draftsFor(emptyLine),
});
assert.equal(stale.recipeLines.length, 1, "the stale job carries its bid LINE…");
assert.deepEqual(stale.recipeLines[0].sections, [], "…with NO recipe rows under it — the defect, reproduced");
assert.deepEqual(stale.rowCostBasis, {}, "…and no cost basis at all");

seq = 0;
const refreshed = refreshJobRecipe([stale], stale.id, draftsFor(filledLine), "p_boss", clock, ids)[0];
assert.equal(refreshed.recipeLines.length, 1, "the refreshed job still has one line");
const sections = refreshed.recipeLines[0].sections;
assert.deepEqual(
  sections.map((s) => s.title),
  ["Labor", "Equipment", "Material"],
  "…now carrying the quote's CURRENT sections, in the builder's own order"
);
assert.deepEqual(
  sections.flatMap((s) => s.rows).map((r) => [r.name, r.plannedQty, r.unit, r.actualQty]),
  [
    ["Skid Steer Operator", 8, "hrs", null],
    ["Skid Steer 75HP", 6, "hrs", null],
    ['4" Asphalt Mix', 20, "Ton", null],
  ],
  "…row by row, with planned quantities from the quote and every actual starting UNENTERED (null, never 0)"
);
// HAND-CALC: the owner cost basis is peeled per row — 55/hr, 45/hr, 92.50/Ton.
assert.deepEqual(
  sections.flatMap((s) => s.rows).map((r) => refreshed.rowCostBasis[r.id]),
  [55, 45, 92.5],
  "…and every row's bid-time unit cost is peeled into the owner-only basis, exactly as at creation"
);
// The variance panel can now value the job — it could not before.
assert.equal(computeOwnerVariance(stale).available, false, "before the refresh the owner variance reads 'unavailable' (no basis)");
assert.equal(computeOwnerVariance(refreshed).available, true, "…after it, the panel can value the job");
// HAND-CALC: planned cost = 8×55 + 6×45 + 20×92.50 = 440 + 270 + 1,850 = $2,560.00
assert.equal(computeOwnerVariance(refreshed).plannedTotal, 2560, "…at a planned cost of 8×55 + 6×45 + 20×92.50 = $2,560.00");

// THE STAMP.
assert.equal(refreshed.recipeRefreshedAt, AT, "the refresh is STAMPED with when");
assert.equal(refreshed.recipeRefreshedBy, "p_boss", "…and by whom — an offered action, not a silent sync");
assert.throws(
  () => refreshJobRecipe([stale], stale.id, draftsFor(filledLine), "   ", clock, ids),
  /stated decision/i,
  "a refresh with nobody attached throws — it is a decision, and decisions carry names"
);

// MONEY AND IDENTITY UNTOUCHED.
assert.equal(refreshed.contractValue, 20000, "MONEY UNTOUCHED: the contract value is unchanged");
assert.deepEqual(refreshed.bidItems, stale.bidItems, "…the bid items are unchanged");
assert.equal(refreshed.id, stale.id, "…it is the same work order, not a new one");
assert.equal(refreshed.status, "open", "…still open");
assert.equal(refreshed.createdAt, stale.createdAt, "…created when it was created");
assert.deepEqual(stale.recipeLines[0].sections, [], "the INPUT job is never mutated");
const other = createJobFromQuote({ quoteId: "q_2", jobName: "Other", workTypeName: "Paving", salesperson: "Owner", contractValue: 1, bidItems: [], recipeLines: [] });
assert.equal(refreshJobRecipe([stale, other], stale.id, draftsFor(filledLine), "p_boss", clock, ids)[1], other, "every OTHER job is returned by the SAME reference");

// ── 2 — ONE HOME: THE REBUILD USES THE SHARED STAMPING ──────────────────────────────────────────
// A refreshed recipe must be indistinguishable from one snapshotted at accept. Proved by running both
// paths over the same drafts with the same id factory and comparing the RESULT, not the source text.
{
  seq = 0;
  const viaCreate = createJobFromQuote({
    quoteId: "q_1", jobName: "Front Lot", workTypeName: "Paving", salesperson: "Owner",
    contractValue: 20000, bidItems: [], recipeLines: draftsFor(filledLine),
  });
  seq = 0;
  const viaStamp = stampRecipeLines(draftsFor(filledLine), ids);
  const shape = (lines) => JSON.stringify(lines.map((l) => l.sections.map((s) => [s.title, s.isCrew, s.rows.map((r) => [r.name, r.plannedQty, r.unit, r.actualQty])])));
  assert.equal(shape(viaCreate.recipeLines), shape(viaStamp.recipeLines), "creation and refresh produce the IDENTICAL recipe shape — one builder, one stamping, no second copy to drift");
  assert.deepEqual(Object.values(viaStamp.rowCostBasis), [55, 45, 92.5], "…and the same peeled cost basis");
}

// ── 3 — THE FREEZE: REFUSED ONCE AN ACTUAL EXISTS ───────────────────────────────────────────────
// MUTATION TARGET: allow the refresh once an actual is present and these fail. Those actuals were
// recorded against THOSE rows; swapping the rows under them silently re-points real field
// measurements at work they were never taken for.
{
  seq = 0;
  const working = refreshJobRecipe([stale], stale.id, draftsFor(filledLine), "p_boss", clock, ids)[0];
  const firstRowId = working.recipeLines[0].sections[0].rows[0].id;
  assert.equal(jobHasAnyActual(working), false, "a freshly refreshed job has no actuals yet");
  assert.equal(planRecipeRefresh(working).allowed, true, "…so it may still be refreshed again");

  const touched = updateRecipeRowActual([working], working.id, firstRowId, 7)[0];
  assert.equal(jobHasAnyActual(touched), true, "ONE entered number is enough — the foreman has started reporting");
  assert.deepEqual(
    planRecipeRefresh(touched),
    { allowed: false, reason: RECIPE_FROZEN_REASON },
    "…and the recipe is FROZEN, with the reason the work order actually shows"
  );
  assert.equal(
    RECIPE_FROZEN_REASON,
    "Actuals have been entered — the recipe is frozen. Reopen or start a new work order if the scope changed.",
    "…in exactly these words"
  );
  assert.throws(
    () => refreshJobRecipe([touched], touched.id, draftsFor(emptyLine), "p_boss", clock, ids),
    /Actuals have been entered/i,
    "REFRESHING A JOB WITH AN ENTERED ACTUAL THROWS — a refused refresh must never look like it worked"
  );
  // A zero is an entered actual. It is a foreman's answer, not an absence.
  const zeroed = updateRecipeRowActual([working], working.id, firstRowId, 0)[0];
  assert.equal(jobHasAnyActual(zeroed), true, "a TYPED ZERO is an entered actual — a true answer, not a blank");
  assert.equal(planRecipeRefresh(zeroed).allowed, false, "…so it freezes the recipe too");
  // Clearing the row back to null reopens the window — nothing has been reported after all.
  const cleared = updateRecipeRowActual([touched], touched.id, firstRowId, null)[0];
  assert.equal(jobHasAnyActual(cleared), false, "clearing the last actual back to 'not entered' reopens the window");
  assert.equal(planRecipeRefresh(cleared).allowed, true, "…and the refresh is available again");
}

// ── 4 — REFUSED WHEN COMPLETE, AND WHEN THERE IS NO QUOTE ───────────────────────────────────────
{
  const done = { ...stale, status: "completed" };
  assert.deepEqual(planRecipeRefresh(done), { allowed: false, reason: RECIPE_COMPLETE_REASON }, "a COMPLETE job's recipe is frozen");
  assert.throws(() => refreshJobRecipe([done], done.id, draftsFor(filledLine), "p_boss", clock, ids), /complete/i, "…and refreshing it throws");
  const demo = { ...stale, quoteId: undefined };
  assert.deepEqual(planRecipeRefresh(demo), { allowed: false, reason: RECIPE_NO_QUOTE_REASON }, "a job with no linked bid has no quote to refresh FROM");
  assert.throws(() => refreshJobRecipe([demo], demo.id, draftsFor(filledLine), "p_boss", clock, ids), /isn.t linked to a bid/i, "…and says so rather than rebuilding from nothing");
  assert.throws(() => refreshJobRecipe([stale], "no_such_job", draftsFor(filledLine), "p_boss", clock, ids), /no longer on file/i, "refreshing a job that isn't there throws rather than silently doing nothing");
}

console.log("PASS: work-order recipe refresh — an UNTOUCHED job rebuilds its recipe from the quote's current lines through the SAME stamping as creation (8 hrs / 6 hrs / 20 Ton, basis 55 / 45 / 92.50, planned $2,560.00) and is stamped who+when; one entered actual — a typed zero included — freezes it by name, as does completion and a missing quote; no money on the job is altered, and the recipe builder has no flat-rate branch to blame");
