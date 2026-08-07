/**
 * FENCE for THE EXTRAS LEDGER — the gaveled bonus ruling (Tom, 2026-08-07).
 *
 * EXTRAS BELONG TO THE COMPANY. A released change order is money the company earned because a crew was
 * already on site and the customer asked for more. It lands on COMPANY totals and NEVER on any
 * salesperson's personal scorecard row. The owner may credit somebody for it — from a visible pool, by
 * a person, outside the software (Law 82). PMZ keeps the ledger; it does not pre-make the decision.
 *
 *   1. RECOGNITION — a RELEASED change order joins a job's recognized actual revenue at Invoiced+
 *      (Law 83: contract = frozen bid + released extras). A pending one never does.
 *   2. THE SPLIT — company booked totals include a quoted change order; the salesperson's personal row
 *      is PROVEN byte-identical with that same order present.
 *   3. THE ROLL-UP — released extras grouped by foreman and by job, with declined/converted excluded
 *      from every money figure and reported only as counts.
 *
 * Every number is HAND-CALCULATED and written as a literal.
 *
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/extras-ledger-fence.test.mjs
 */
import assert from "node:assert/strict";
import {
  createChangeOrder,
  decideChangeOrder,
  changeOrderGpDollars,
  releasedTotalsByQuote,
  releasedTotalsForQuote,
  buildExtrasRollup,
  isReleasedChangeOrder,
} from "../lib/change-orders.ts";
import { deriveTrackerRows, computeScorecard } from "../lib/sales-tracker.ts";

// ── FIXTURES ──────────────────────────────────────────────────────────────────────────────────────
// HAND-CALC: $1,000 break-even cost at the parent's 20% frozen margin → 1000 ÷ 0.8 = $1,250.00 price,
// so GP = 1250 − 1000 = $250.00 — which is also 1250 × 20%. The two agree because the margin was
// applied once, at creation, and is only being read back here.
const AT = "2026-03-10T15:00:00.000Z";
let seq = 0;
const ids = () => `co_${++seq}`;
const co = (over = {}) =>
  createChangeOrder(
    {
      jobId: "job_1",
      quoteId: "q_1",
      foremanId: "p_tim",
      parentMarginPct: 20,
      lines: [{ description: "Extra base course", qty: 1, rate: 1000 }],
      ceiling: 1500,
      ...over,
    },
    () => AT,
    ids
  );

const PEOPLE = [
  { id: "p_sales", name: "Adam Sales", roles: ["salesperson"], active: true, createdAt: AT },
  { id: "p_tim", name: "Tim Foreman", roles: ["foreman"], active: true, createdAt: AT },
  { id: "p_dave", name: "Dave Foreman", roles: ["foreman"], active: true, createdAt: AT },
];

// ── 1 — GP AT THE FROZEN MARGIN ───────────────────────────────────────────────────────────────────
seq = 0;
const released = co();
assert.equal(released.status, "quoted", "a $1,000-cost order inside the ceiling is RELEASED on the spot");
assert.equal(released.priceCharged, 1250.0, "…priced at $1,250.00 (hand-calc: 1000 ÷ 0.8)");
assert.equal(changeOrderGpDollars(released), 250.0, "GP is price − cost = 1250 − 1000 = $250.00");
assert.equal(
  changeOrderGpDollars(released),
  Math.round(released.priceCharged * 0.2 * 100) / 100,
  "…which IS the parent's frozen 20% of the price — the margin was applied once and is only read back"
);
assert.equal(isReleasedChangeOrder(released), true, "a quoted order is released");

seq = 0;
const pending = co({ ceiling: 500, lines: [{ description: "Rock excavation", qty: 1, rate: 4000 }] });
assert.equal(pending.status, "pending_approval", "a $4,000-cost order over a $500 ceiling is HELD");
assert.equal(isReleasedChangeOrder(pending), false, "…and a held order is NOT released money");

// Per-quote join used by the tracker.
assert.deepEqual(
  releasedTotalsForQuote([released, pending], "q_1"),
  { count: 1, revenue: 1250.0, cost: 1000.0, gpDollars: 250.0 },
  "the per-quote join counts the RELEASED order only: $1,250.00 revenue, $1,000.00 cost, $250.00 GP — revenue and cost travel together"
);
assert.deepEqual(
  releasedTotalsForQuote([pending], "q_1"),
  { count: 0, revenue: 0, cost: 0, gpDollars: 0 },
  "a quote whose only extra is held has zeros — never a null a caller has to guard"
);
seq = 0;
const otherQuote = co({ quoteId: "q_2", jobId: "job_2", foremanId: "p_dave" });
const byQuote = releasedTotalsByQuote([released, otherQuote, pending]);
assert.equal(byQuote.get("q_1").revenue, 1250.0, "extras are keyed to their own parent quote");
assert.equal(byQuote.get("q_2").revenue, 1250.0, "…and another quote's extra never crosses over");
console.log("PASS: extras money — a released change order carries GP at the parent's FROZEN margin (price 1,250.00 − cost 1,000.00 = 250.00, exactly 20% of the price), the per-quote join counts released orders only, and a held one contributes nothing");

// ── 2 — RECOGNITION: A RELEASED EXTRA JOINS ACTUAL REVENUE AT INVOICED+ ───────────────────────────
// HAND-CALC: an $80,000 bid, invoiced, with a $1,250.00 released extra → actual revenue $81,250.00.
// Actual cost $63,750 complete → actual GP = 81,250 − 63,750 = $17,500.00.
const quote = (over = {}) => ({
  id: "q_1",
  status: "Invoiced",
  createdAt: "2026-03-01T00:00:00Z",
  jobName: "Elm Street",
  workTypeId: "wtA",
  salespersonId: "p_sales",
  totalRevenue: 80000,
  grossProfitDollars: 20000,
  grossProfitPercent: 25,
  actualCost: 63750,
  actualCostComplete: true,
  ...over,
});

const withExtra = deriveTrackerRows([quote({ changeOrderRevenue: 1250, changeOrderCost: 1000, changeOrderGpDollars: 250 })], PEOPLE)[0];
assert.equal(withExtra.actuals.revenue, 81250.0, "recognized actual revenue = frozen bid 80,000 + released extra 1,250 = $81,250.00 (Law 83)");
assert.equal(withExtra.actuals.gpDollars, 16500.0, "…and actual GP = 81,250 − (63,750 bid cost + 1,000 extra cost) = $16,500.00");
assert.equal(withExtra.changeOrderCost, 1000.0, "…the extra brought its own cost into the subtraction");
assert.equal(withExtra.bidAmount, 80000, "THE BID IS UNTOUCHED — the extra stands beside it, never inside it");
assert.equal(withExtra.changeOrderRevenue, 1250.0, "…the extra is carried on the row, separately and visibly");
assert.equal(withExtra.changeOrderGp, 250.0, "…with its GP at the frozen margin");

const noExtra = deriveTrackerRows([quote()], PEOPLE)[0];
assert.equal(noExtra.actuals.revenue, 80000, "a job with no extras recognizes the bid alone — unchanged from before this lane");
assert.equal(noExtra.changeOrderRevenue, 0, "…and carries zero extras, never undefined");

// A PENDING extra never reaches recognized revenue — the call site passes only released totals, and
// this proves the join is what feeds it: zero in, bid out.
const heldOnly = deriveTrackerRows([quote({ changeOrderRevenue: 0, changeOrderCost: 0, changeOrderGpDollars: 0 })], PEOPLE)[0];
assert.equal(heldOnly.actuals.revenue, 80000, "a job whose only change order is PENDING recognizes the bid alone — held work is not revenue");

// BLANK STAYS BLANK BEFORE RECOGNITION. An extra cannot drag an unrecognized job into PERFORMED.
for (const st of ["Approved", "Scheduled", "In Progress", "Ready to Invoice"]) {
  const early = deriveTrackerRows([quote({ status: st, changeOrderRevenue: 1250, changeOrderGpDollars: 250 })], PEOPLE)[0];
  assert.equal(early.actuals, null, `${st}: not yet recognized — actuals stay BLANK even with a released extra present`);
  assert.equal(early.changeOrderRevenue, 1250.0, `…though the extra is still carried on the row (${st})`);
}
console.log("PASS: extras recognition — a RELEASED change order joins recognized actual revenue at Invoiced+ (80,000 bid + 1,250 extra = 81,250.00, GP 16,500.00 after its own 1,000 cost) while the frozen bid stays 80,000; a pending one contributes nothing; and before recognition the actuals stay blank with the extra present");

// ── 2b — TOGETHER OR NOT AT ALL: THE EXTRA'S COST JOINS ITS REVENUE ──────────────────────────────
// Gaveled 2026-08-07. A released change order's price joins recognized revenue and its stored
// break-even totalCost joins the recognized cost subtraction, as ONE act. Otherwise the company is
// credited with the extra's whole price as profit, and every job that grew after the bid reports a
// better margin than it earned.
//
// HAND-CALC: bid $10,000 / actual cost $8,000, plus a released extra priced $1,250 costing $1,000.
//   performed revenue = 10,000 + 1,250 = $11,250.00
//   performed cost    =  8,000 + 1,000 = $9,000.00
//   performed GP      = 11,250 − 9,000 = $2,250.00   ← the truth
//   (the defect this closes reported 11,250 − 8,000 = $3,250.00 — the extra's cost never subtracted)
const truthQuote = (over = {}) => ({
  id: "q_t",
  status: "Invoiced",
  createdAt: "2026-03-01T00:00:00Z",
  workTypeId: "wtA",
  salespersonId: "p_sales",
  totalRevenue: 10000,
  grossProfitDollars: 2000,
  actualCost: 8000,
  actualCostComplete: true,
  changeOrderRevenue: 1250,
  changeOrderCost: 1000,
  changeOrderGpDollars: 250,
  ...over,
});
const truthRow = deriveTrackerRows([truthQuote()], PEOPLE)[0];
assert.equal(truthRow.actuals.revenue, 11250.0, "performed revenue = bid 10,000 + released extra 1,250 = $11,250.00");
// MUTATION TARGET: drop changeOrderCost from the subtraction and this reads 3,250.00.
assert.equal(
  truthRow.actuals.gpDollars,
  2250.0,
  "PERFORMED GP = 11,250 − (8,000 bid cost + 1,000 EXTRA COST) = $2,250.00 — NOT $3,250.00. The extra's cost recognizes with its revenue, together or not at all."
);
assert.notEqual(truthRow.actuals.gpDollars, 3250.0, "…and is never the overstated figure the missing cost produced");
assert.equal(truthRow.changeOrderCost, 1000.0, "the extra's cost is carried on the row, visibly");
assert.equal(Math.round(truthRow.actuals.gpPercent * 10000) / 10000, 20.0, "…margin = 2,250/11,250 = 20.0000%, the margin the work actually earned");

// The company sees the true GP; the person sees the BID's own GP. Both are correct answers to
// different questions, and the difference between them is exactly the extra's GP.
const truthCard = computeScorecard(deriveTrackerRows([truthQuote()], PEOPLE), [], PEOPLE, 2026);
const truthPerson = truthCard.people.find((p) => p.salespersonId === "p_sales");
assert.equal(truthCard.companyTotal.performed.gpDollars, 2250.0, "company PERFORMED GP = $2,250.00 — revenue and cost both include the extra");
assert.equal(truthPerson.total.performed.gpDollars, 2000.0, "…the salesperson's PERFORMED GP = bid 10,000 − bid cost 8,000 = $2,000.00");
assert.equal(
  truthCard.companyTotal.performed.gpDollars - truthPerson.total.performed.gpDollars,
  250.0,
  "…and the gap is EXACTLY the extra's GP at the frozen margin (1,250 − 1,000), not its price"
);

// A job with no extras is unaffected in every direction.
const cleanRow = deriveTrackerRows([truthQuote({ changeOrderRevenue: 0, changeOrderCost: 0, changeOrderGpDollars: 0 })], PEOPLE)[0];
assert.equal(cleanRow.actuals.revenue, 10000, "no extras → performed revenue is the bid");
assert.equal(cleanRow.actuals.gpDollars, 2000.0, "…and performed GP = 10,000 − 8,000 = $2,000.00, untouched by this ruling");

// Incomplete cost still blanks the GP — the extra's cost cannot conjure a margin from a job whose own
// cost is unknown. Blank, never an estimate.
const uncosted = deriveTrackerRows([truthQuote({ actualCostComplete: false })], PEOPLE)[0];
assert.equal(uncosted.actuals.revenue, 11250.0, "revenue is still recognized with incomplete cost data");
assert.equal(uncosted.actuals.gpDollars, null, "…but GP stays BLANK — an extra's known cost never rescues a job whose own cost is unknown");
console.log("PASS: extras cost recognition — a released change order's COST joins the subtraction exactly when its revenue joins recognition (bid 10,000/cost 8,000 + extra 1,250/cost 1,000 at Invoiced → revenue $11,250.00, GP $2,250.00, never the overstated $3,250.00); the company/personal GP gap is exactly the extra's frozen-margin GP; and incomplete job cost still blanks the margin");

// ── 3 — THE SPLIT: COMPANY YES, PERSONAL NEVER ───────────────────────────────────────────────────
// The SAME quote, scored twice: once with its released extra, once without. The company numbers move
// by exactly the extra. The salesperson's personal row must not move by one cent.
const YEAR = 2026;
const rowsWithout = deriveTrackerRows([quote()], PEOPLE);
const rowsWith = deriveTrackerRows([quote({ changeOrderRevenue: 1250, changeOrderCost: 1000, changeOrderGpDollars: 250 })], PEOPLE);
const cardWithout = computeScorecard(rowsWithout, [], PEOPLE, YEAR);
const cardWith = computeScorecard(rowsWith, [], PEOPLE, YEAR);

// COMPANY BOOKED includes the extra, from the moment it is quoted.
assert.equal(cardWithout.companyTotal.actual.salesDollars, 80000, "company booked without the extra: $80,000");
assert.equal(cardWith.companyTotal.actual.salesDollars, 81250.0, "COMPANY BOOKED INCLUDES THE EXTRA: 80,000 + 1,250 = $81,250.00");
assert.equal(cardWithout.companyTotal.actual.gpDollars, 20000, "company booked GP without the extra: $20,000");
assert.equal(cardWith.companyTotal.actual.gpDollars, 20250.0, "…and WITH it: 20,000 + 250 = $20,250.00, at the frozen parent margin");
assert.equal(cardWith.byWorkType["wtA"].actual.salesDollars, 81250.0, "the company work-type total carries it too");

// THE PERSONAL ROW IS UNMOVED — proven whole-object, not field by field, so a future field cannot
// quietly start carrying extras money without this failing.
const personOf = (card) => card.people.find((p) => p.salespersonId === "p_sales");
assert.equal(personOf(cardWith).total.actual.salesDollars, 80000, "THE SALESPERSON'S BOOKED SALES ARE THE BID ALONE — $80,000, extra or no extra");
assert.equal(personOf(cardWith).total.actual.gpDollars, 20000, "…and their booked GP is the bid's GP alone — $20,000");
// MUTATION TARGET: credit the change order to the person's booked row and this deepEqual fails.
assert.deepEqual(
  personOf(cardWith).total,
  personOf(cardWithout).total,
  "A SALESPERSON'S PERSONAL ROW IS BYTE-IDENTICAL WITH THE CHANGE ORDER PRESENT — extras belong to the COMPANY, and crediting them to the person who sold the parent bid would inflate a personal number against a personal goal for work they did not sell (gaveled ruling, Tom 2026-08-07)"
);
assert.deepEqual(
  personOf(cardWith).byWorkType["wtA"],
  personOf(cardWithout).byWorkType["wtA"],
  "…and so is their per-work-type cell"
);
// PERFORMED, the same law: recognized extras are company money, never personal.
assert.equal(cardWith.companyTotal.performed.salesDollars, 81250.0, "company PERFORMED includes the recognized extra: $81,250.00");
assert.equal(personOf(cardWith).total.performed.salesDollars, 80000, "…while the salesperson's PERFORMED is the recognized BID alone: $80,000");
assert.equal(personOf(cardWith).total.performed.gpDollars, 16250.0, "…and their performed GP is bid − actual cost = 80,000 − 63,750 = $16,250.00");
assert.equal(cardWith.companyTotal.performed.gpDollars, 16500.0, "…where the company GP is 81,250 − (63,750 + 1,000 extra cost) = $16,500.00");
// The gap between company and personal is exactly the extras. That gap is the ruling working.
assert.equal(
  cardWith.companyTotal.actual.salesDollars - personOf(cardWith).total.actual.salesDollars,
  1250.0,
  "the company-vs-personal gap is EXACTLY the extras — not a reconciliation bug, the ruling itself"
);
console.log("PASS: the bonus ruling — company booked and performed totals include released extras (80,000 → 81,250.00 sales, 20,000 → 20,250.00 booked GP) while the salesperson's personal row is byte-identical with the same change order present; the company-vs-personal gap is exactly the extras");

// ── 4 — THE ROLL-UP ──────────────────────────────────────────────────────────────────────────────
// HAND-CALC: Tim writes two released extras — 1,250.00 and 625.00 (500 cost ÷ 0.8) — for 1,875.00
// revenue and 375.00 GP. Dave writes one, 1,250.00 / 250.00. Company total 3,125.00 / 625.00.
seq = 0;
const timA = co();                                                                   // 1,250.00 / 250.00
const timB = co({ lines: [{ description: "Haul-off", qty: 1, rate: 500 }] });         //   625.00 / 125.00
const daveA = co({ jobId: "job_2", quoteId: "q_2", foremanId: "p_dave" });            // 1,250.00 / 250.00
seq = 0;
const held = co({ ceiling: 100, lines: [{ description: "Held work", qty: 1, rate: 900 }] });
const refused = decideChangeOrder(held, { action: "decline", decidedBy: "p_boss", reason: "Not authorized." }, () => AT);
const movedToPricer = decideChangeOrder(held, { action: "convert", decidedBy: "p_boss" }, () => AT);

const names = {
  personName: (id) => PEOPLE.find((p) => p.id === id)?.name || id,
  jobName: (id) => ({ job_1: "Elm Street", job_2: "Oak Avenue" })[id] || id,
};
const rollup = buildExtrasRollup([timA, timB, daveA, held, refused, movedToPricer], names);

assert.deepEqual(
  rollup.totals,
  { count: 3, revenue: 3125.0, cost: 2500.0, gpDollars: 625.0 },
  "the ledger totals the RELEASED extras only: 3 orders, 1,250 + 625 + 1,250 = $3,125.00, GP 250 + 125 + 250 = $625.00"
);
assert.deepEqual(
  rollup.byForeman.map((g) => [g.label, g.count, g.revenue, g.gpDollars]),
  [
    ["Tim Foreman", 2, 1875.0, 375.0],
    ["Dave Foreman", 1, 1250.0, 250.0],
  ],
  "BY FOREMAN, biggest first: Tim's two extras total $1,875.00 / $375.00; Dave's one totals $1,250.00 / $250.00"
);
assert.deepEqual(
  rollup.byJob.map((g) => [g.label, g.count, g.revenue, g.gpDollars]),
  [
    ["Elm Street", 2, 1875.0, 375.0],
    ["Oak Avenue", 1, 1250.0, 250.0],
  ],
  "BY JOB, the same money grouped the other way — and the two groupings sum to the same total"
);
assert.equal(
  rollup.byForeman.reduce((s, g) => s + g.revenue, 0),
  rollup.byJob.reduce((s, g) => s + g.revenue, 0),
  "…which is the arithmetic guarantee that neither grouping drops or double-counts an extra"
);
assert.equal(rollup.byForeman[0].firstAt, AT, "each group carries its date range");
assert.equal(rollup.byForeman[0].lastAt, AT, "…both ends");

// THE UNAGREED ONES ARE COUNTS, NEVER MONEY.
assert.deepEqual(
  rollup.notCounted,
  { pending: 1, declined: 1, converted: 1 },
  "held, refused and moved-to-the-Pricer orders are reported as COUNTS"
);
assert.equal(
  rollup.byForeman.reduce((s, g) => s + g.count, 0),
  3,
  "…and appear in NO group — a pending extra is not revenue waiting to be claimed"
);
assert.equal(rollup.totals.revenue, 3125.0, "…and move the money not one cent");

// An unattributed extra still appears — the ledger never loses money it cannot name.
seq = 0;
const orphan = { ...co(), foremanId: "" };
const orphanRollup = buildExtrasRollup([orphan], names);
assert.equal(orphanRollup.totals.revenue, 1250.0, "an extra with no foreman id is still counted in the money");
assert.equal(orphanRollup.byForeman[0].key, "unattributed", "…and is grouped as unattributed rather than dropped");
assert.deepEqual(buildExtrasRollup([], names).totals, { count: 0, revenue: 0, cost: 0, gpDollars: 0 }, "an empty ledger is zeros, not blanks");
console.log("PASS: the extras roll-up — released extras group BY FOREMAN (Tim 2 / $1,875.00 / $375.00, Dave 1 / $1,250.00 / $250.00) and BY JOB to the same $3,125.00 total; pending, declined and converted orders appear only as counts and never touch the money; an unattributed extra is grouped, never dropped");
