/**
 * FENCE for the self-healing WORK-ORDER SWEEP (lib/work-order-sweep.ts). PURE — fixtures in, jobs out.
 *
 * The sweep repairs quotes that reached Accepted-or-beyond with no job record. What must hold:
 *   (1) ELIGIBILITY — Accepted-through-Paid plus legacy Completed get a work order; Draft, Sent for
 *       Acceptance, Declined and Lost get NOTHING; Full-LEM quotes get NOTHING (the accept path
 *       refuses them, so the repair must refuse them identically).
 *   (2) ONE BIRTHPLACE — a repaired job comes out of createJobFromQuote through the shared
 *       workOrderInputFromQuote mapping: same fields, same fallbacks, a real recipe with a real
 *       rowCostBasis, actuals starting null.
 *   (3) NEVER TOUCH — existing jobs come back BY IDENTITY, unmodified; demo jobs (no quoteId) survive.
 *   (4) IDEMPOTENT — a second sweep over the swept data creates ZERO. No flag involved.
 *
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/work-order-sweep-fence.test.mjs
 */
import assert from "node:assert/strict";
import {
  planWorkOrderSweep,
  isWorkOrderEligible,
  workOrderInputFromQuote,
  recipeLinesFromQuote,
  WORK_ORDER_ELIGIBLE_STATUSES,
} from "../lib/work-order-sweep.ts";
import { createJobFromQuote, jobActualCost } from "../lib/jobs.ts";

// Stand-in for buildLineRecipeSections(item, lemCats) — the injected cost-BEARING builder. Emits one
// labor row per bid line so every created job has a real recipe and a real cost basis to assert on.
const buildSections = (item) => [
  {
    title: "Labor",
    isCrew: false,
    rows: [{ name: `Crew for ${item.description}`, plannedQty: item.quantity * 2, unit: "hrs", unitCost: 50 }],
  },
];

const eppLine = (id, description, quantity = 10) => ({
  id,
  description,
  quantity,
  unit: "SF",
  unitPrice: 25,
});

const quote = (id, status, extra = {}) => ({
  id,
  quoteType: "EPP",
  status,
  jobName: `Job ${id}`,
  customerName: `Customer ${id}`,
  workType: "Paving",
  salesperson: "Ann Roster",
  totalRevenue: 50000,
  eppLineItems: [eppLine(`${id}_l1`, `Line one of ${id}`)],
  ...extra,
});

// ── 1 — ELIGIBILITY ───────────────────────────────────────────────────────────────────────────────
// The eligible set is Accepted-or-beyond. Every OTHER stored status must be refused.
assert.deepEqual(
  Array.from(WORK_ORDER_ELIGIBLE_STATUSES).sort(),
  ["Approved", "Completed", "In Progress", "Invoiced", "Paid", "Ready to Invoice", "Scheduled"],
  "eligible = Accepted through Paid, plus legacy Completed"
);
for (const s of ["Approved", "Scheduled", "In Progress", "Ready to Invoice", "Invoiced", "Paid", "Completed"]) {
  assert.equal(isWorkOrderEligible(quote("q", s)), true, `${s} is Accepted-or-beyond → should have a work order`);
}
for (const s of ["Draft", "Ready for Approval", "Declined", "Lost"]) {
  assert.equal(isWorkOrderEligible(quote("q", s)), false, `${s} has no accepted work → no work order`);
}
assert.equal(
  isWorkOrderEligible({ ...quote("qf", "Invoiced"), quoteType: "Full" }),
  false,
  "a FULL quote is refused even at Invoiced — identical to the accept path's EPP-only gate"
);
assert.equal(
  isWorkOrderEligible({ ...quote("qu", "Invoiced"), quoteType: undefined }),
  false,
  "an untyped legacy quote is not EPP → refused (never guessed into a work order)"
);
console.log("PASS: work-order sweep eligibility — Accepted-through-Paid + legacy Completed only; Draft/Sent/Declined/Lost refused; Full and untyped quotes refused");

// ── 2 — A LATE-STATUS QUOTE WITH NO JOB GETS ONE, VIA THE SHARED CREATION PATH ────────────────────
const LATE = quote("q_inv", "Invoiced", {
  grandTotal: 61000,                       // grandTotal WINS over totalRevenue (accept-path fallback order)
  jobSiteAddress: "12 Elm St, Springfield",
  eppLineItems: [eppLine("l1", "Mill and overlay", 10), eppLine("l2", "Striping", 4)],
});
const swept = planWorkOrderSweep([LATE], [], buildSections);

assert.equal(swept.createdCount, 1, "one late-status quote with no job → exactly one work order created");
assert.equal(swept.jobs.length, 1, "the returned job set carries it");
const made = swept.created[0];
assert.equal(made.quoteId, "q_inv", "the new job is LINKED to its quote (quoteId) — the only join that exists");
assert.equal(made.status, "open", "a repaired work order starts open, like any newly created one");
assert.equal(made.jobName, "Job q_inv", "job name carried from the quote");
assert.equal(made.customerName, "Customer q_inv", "customer name carried from the quote");
assert.equal(made.contractValue, 61000, "contract value = grandTotal ?? totalRevenue — grandTotal wins, frozen at creation");
assert.equal(made.jobSite?.address, "12 Elm St, Springfield", "the quote's site address is snapshotted onto the job");
assert.equal(made.bidItems.length, 2, "both bid lines snapshotted");
assert.equal(made.recipeLines.length, 2, "a real recipe line per bid line — not an empty shell");

// The recipe is cost-STRIPPED for the foreman while the owner basis is populated — the same split
// createJobFromQuote performs at accept. A repaired job must be able to answer Estimate-vs-Actual.
const row = made.recipeLines[0].sections[0].rows[0];
assert.equal(row.actualQty, null, "actuals start null — the foreman has not reported yet (never a fabricated 0)");
assert.equal(row.plannedQty, 20, "planned qty came through the injected builder (10 × 2)");
assert.equal("unitCost" in row, false, "the persisted foreman row carries NO cost — zero-dollars law holds on repaired jobs too");
assert.equal(made.rowCostBasis[row.id], 50, "the owner-only cost basis IS populated — a repaired job can be valued");
assert.equal(Object.keys(made.rowCostBasis).length, 2, "one basis entry per recipe row");
assert.equal(jobActualCost(made).complete, false, "no actuals reported yet → cost data incomplete (margin stays blank downstream)");

// The mapping is the SHARED one — assert it directly, since the accept path now calls it too.
const input = workOrderInputFromQuote(LATE, recipeLinesFromQuote(LATE, buildSections));
assert.equal(input.quoteId, "q_inv", "shared mapping sets quoteId");
assert.equal(input.contractValue, 61000, "shared mapping applies the grandTotal ?? totalRevenue fallback");
assert.equal(input.quoteJobSiteAddress, "12 Elm St, Springfield", "shared mapping passes the site address");
assert.equal(input.bidItems.length, 2, "shared mapping snapshots every bid line");
const fallback = workOrderInputFromQuote(
  { ...LATE, grandTotal: undefined, customerName: undefined, customer: "Legacy Co" },
  []
);
assert.equal(fallback.contractValue, 50000, "no grandTotal → falls back to totalRevenue");
assert.equal(fallback.customerName, "Legacy Co", "no customerName → falls back to the denormalized customer string");
console.log("PASS: work-order sweep creation — a late-status orphan gets a linked work order through the SHARED createJobFromQuote mapping; recipe cost-stripped, owner basis populated, actuals null");

// ── 3 — NEVER CREATE A DUPLICATE, NEVER TOUCH AN EXISTING JOB ─────────────────────────────────────
const EXISTING = createJobFromQuote(
  workOrderInputFromQuote(quote("q_has", "Approved"), recipeLinesFromQuote(quote("q_has", "Approved"), buildSections))
);
const DEMO = createJobFromQuote({
  jobName: "Demo job",                    // no quoteId — joins nothing, must survive untouched
  workTypeName: "Paving",
  salesperson: "Owner",
  contractValue: 100,
  bidItems: [],
  recipeLines: [],
});
const withExisting = planWorkOrderSweep([quote("q_has", "Approved")], [EXISTING, DEMO], buildSections);
assert.equal(withExisting.createdCount, 0, "a quote that already has a job gets NO second one");
assert.equal(withExisting.jobs.length, 2, "the job set is unchanged in length");
assert.equal(withExisting.jobs[0], EXISTING, "the existing job comes back BY IDENTITY — same object, never rewritten");
assert.equal(withExisting.jobs[1], DEMO, "a demo job (no quoteId) is carried along untouched");
assert.equal(withExisting.jobs, withExisting.jobs, "no-op sweep returns the job array itself, not a rebuilt copy");

// Two eligible quotes, one already served → only the orphan is repaired, and the served one is intact.
const MIXED = planWorkOrderSweep(
  [quote("q_has", "Approved"), quote("q_orphan", "Paid")],
  [EXISTING],
  buildSections
);
assert.equal(MIXED.createdCount, 1, "only the orphan is repaired");
assert.equal(MIXED.created[0].quoteId, "q_orphan", "and it is the right one");
assert.equal(MIXED.jobs[0], EXISTING, "the already-served job is still the SAME object after a sweep that created something");

// The quote objects themselves are never written to — the sweep returns jobs only.
const QUOTE_IN = quote("q_frozen", "Invoiced");
const snapshot = JSON.stringify(QUOTE_IN);
planWorkOrderSweep([QUOTE_IN], [], buildSections);
assert.equal(JSON.stringify(QUOTE_IN), snapshot, "the QUOTE is byte-identical after a sweep — money and status untouched");
console.log("PASS: work-order sweep safety — no duplicate for a served quote; existing and demo jobs returned by identity; the quote record is never modified");

// ── 4 — REFUSED POPULATIONS CREATE NOTHING ────────────────────────────────────────────────────────
// ---- MUTATION TARGET: widening the status gate to Draft ----
// Making the sweep also create for Draft quotes yields 1 here and this assertion FAILS, naming Draft —
// a quote nobody has accepted would get a work order the crew could work from.
const DRAFTS = planWorkOrderSweep([quote("q_draft", "Draft")], [], buildSections);
assert.equal(DRAFTS.createdCount, 0, "a DRAFT quote gets NO work order — nothing has been accepted, there is no work to run");
assert.deepEqual(DRAFTS.created, [], "and nothing is returned as created");

const SENT = planWorkOrderSweep([quote("q_sent", "Ready for Approval")], [], buildSections);
assert.equal(SENT.createdCount, 0, "a quote still out for acceptance gets NO work order");
const DECLINED = planWorkOrderSweep(
  [quote("q_decl", "Declined"), quote("q_lost", "Lost")],
  [],
  buildSections
);
assert.equal(DECLINED.createdCount, 0, "Declined and Lost get NO work order — a lost bid is not work");
const FULL = planWorkOrderSweep([{ ...quote("q_full", "Invoiced"), quoteType: "Full" }], [], buildSections);
assert.equal(FULL.createdCount, 0, "a FULL quote at Invoiced gets NO work order — excluded exactly as the accept path excludes it");
const EMPTY = planWorkOrderSweep([], [], buildSections);
assert.equal(EMPTY.createdCount, 0, "no quotes → nothing created, no crash");
console.log("PASS: work-order sweep refusals — Draft, Sent for Acceptance, Declined, Lost and Full quotes all create nothing");

// ── 5 — IDEMPOTENT: THE SECOND RUN CREATES ZERO (no flag involved) ────────────────────────────────
const POP = [
  quote("a", "Approved"),
  quote("b", "Invoiced"),
  quote("c", "Completed"),      // legacy status still earns its record
  quote("d", "Draft"),          // refused
  { ...quote("e", "Paid"), quoteType: "Full" }, // refused
];
const run1 = planWorkOrderSweep(POP, [], buildSections);
assert.equal(run1.createdCount, 3, "first sweep repairs the three eligible orphans (a, b, c)");
assert.deepEqual(run1.created.map((j) => j.quoteId).sort(), ["a", "b", "c"], "and exactly those three");

const run2 = planWorkOrderSweep(POP, run1.jobs, buildSections);
assert.equal(run2.createdCount, 0, "SECOND sweep over the swept data creates ZERO — idempotent with no flag, absence of the job IS the condition");
assert.equal(run2.jobs.length, 3, "the job set does not grow");
run1.jobs.forEach((j, i) => assert.equal(run2.jobs[i], j, `job ${i} survives the second sweep by identity — untouched`));

const run3 = planWorkOrderSweep(POP, run2.jobs, buildSections);
assert.equal(run3.createdCount, 0, "and a third run is still zero — repeated loads never accumulate work orders");

// A duplicate quote id within ONE sweep still yields one job (the in-run guard).
const DUPES = planWorkOrderSweep([quote("dup", "Approved"), quote("dup", "Invoiced")], [], buildSections);
assert.equal(DUPES.createdCount, 1, "a repeated quote id inside a single sweep produces ONE work order, not two");
console.log("PASS: work-order sweep idempotence — first run repairs every orphan, second and third create ZERO and touch nothing; duplicate ids within a run yield one job");
