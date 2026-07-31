/**
 * FENCE for the Sales Tracker derivation layer (SALES-TRACKER-SPEC.md). PURE math.
 *   (1) BUCKETS   — every non-draft quote lands in exactly one of {BID, ACCEPTED, LOST}; the three
 *                   buckets sum to the total; DRAFT is excluded everywhere.
 *   (2) ROWS      — attribution resolves by id (roster name), legacy name string, or a dash; actuals
 *                   appear only when present; objection appears only on LOST rows.
 *   (3) SCOREBOARD— win/loss ratios by DOLLARS and by COUNT, accepted GP, blended margin, per work type
 *                   and all-up, matched to hand-calculated literals; zero denominators guarded.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/sales-tracker-fence.test.mjs
 */
import assert from "node:assert/strict";
import { deriveTrackerRows, computeScoreboard, statusBucket } from "../lib/sales-tracker.ts";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, expected ${b})`);

const PEOPLE = [
  { id: "p1", name: "Ann Roster", email: undefined, phone: undefined, roles: ["salesperson"], active: true, createdAt: "2026-01-01T00:00:00Z" },
];

// One quote per lifecycle status, plus a DRAFT that must never appear. Amounts chosen so the all-up
// ratios are clean: wonDollars 150000, lostDollars 50000 → win-by-$ = 0.75; acceptedGp 30000 → blended 20%.
const QUOTES = [
  { id: "q_draft",   status: "Draft",             totalRevenue: 5000,  grossProfitDollars: 1000, workType: "Paving" },              // EXCLUDED
  { id: "q_bid",     status: "Ready for Approval", totalRevenue: 10000, grossProfitDollars: 2000, grossProfitPercent: 20, workType: "Paving",   salespersonId: "p1" },
  { id: "q_appr",    status: "Approved",           totalRevenue: 20000, grossProfitDollars: 5000, workType: "Paving",   salespersonId: "p1" },
  { id: "q_sched",   status: "Scheduled",          totalRevenue: 30000, grossProfitDollars: 6000, workType: "Paving",   salesperson: "Legacy Sam" }, // legacy name, no id
  { id: "q_prog",    status: "In Progress",        totalRevenue: 15000, grossProfitDollars: 3000, workType: "Sealcoat" },                            // unattributed
  { id: "q_rti",     status: "Ready to Invoice",   totalRevenue: 25000, grossProfitDollars: 5000, workType: "Sealcoat" },
  { id: "q_inv",     status: "Invoiced",           totalRevenue: 40000, grossProfitDollars: 8000, workType: "Sealcoat", actualCost: 32000, actualCostComplete: true }, // Invoiced → actuals recognized
  { id: "q_paid",    status: "Paid",               totalRevenue: 12000, grossProfitDollars: 2000, workType: "Sealcoat", salespersonId: "p_ghost", salesperson: "Ghost Name" }, // id not in roster → fallback name
  { id: "q_comp",    status: "Completed",          totalRevenue: 8000,  grossProfitDollars: 1000, workType: "Sealcoat" },
  { id: "q_decl",    status: "Declined",           totalRevenue: 20000, grossProfitDollars: 4000, workType: "Paving",   decisionNote: "price" },     // LOST, objection via decisionNote
  { id: "q_lost",    status: "Lost",               totalRevenue: 30000, grossProfitDollars: 6000, workType: "Sealcoat", objection: "competitor" },
];

const rows = deriveTrackerRows(QUOTES, PEOPLE);
const byId = (id) => rows.find((r) => r.quoteId === id);

// ── 1 — BUCKETS ───────────────────────────────────────────────────────────────────────────────────
assert.equal(rows.length, 10, "11 quotes minus the 1 draft = 10 tracker rows");
assert.ok(!rows.some((r) => r.quoteId === "q_draft"), "the DRAFT quote is excluded from the rows entirely");
assert.ok(rows.every((r) => ["BID", "ACCEPTED", "LOST"].includes(r.bucket)), "every row is in exactly one of the three buckets");

const bid = rows.filter((r) => r.bucket === "BID").length;
const acc = rows.filter((r) => r.bucket === "ACCEPTED").length;
const lost = rows.filter((r) => r.bucket === "LOST").length;
assert.equal(bid, 1, "BID: Ready for Approval only");
assert.equal(acc, 7, "ACCEPTED: Approved, Scheduled, In Progress, Ready to Invoice, Invoiced, Paid, Completed");
assert.equal(lost, 2, "LOST: both Declined and Lost land in LOST");
assert.equal(bid + acc + lost, rows.length, "the three buckets sum to the total — no row lost or double-counted");
assert.equal(statusBucket("Draft"), null, "Draft maps to null (excluded), never a bucket");
console.log("PASS: sales-tracker buckets — every non-draft lands in exactly one bucket; three buckets sum to the total; drafts excluded");

// ── 2 — ROWS: attribution, actuals, objection ───────────────────────────────────────────────────────
assert.equal(byId("q_bid").salespersonId, "p1", "an id-attributed quote keeps its id");
assert.equal(byId("q_bid").salesperson, "Ann Roster", "id resolves to the roster display name");
assert.equal(byId("q_sched").salespersonId, null, "a legacy name-string quote has no id");
assert.equal(byId("q_sched").salesperson, "Legacy Sam", "a legacy name-string quote shows that name");
assert.equal(byId("q_prog").salesperson, "—", "an unattributed quote shows a dash");
assert.equal(byId("q_paid").salesperson, "Ghost Name", "an id not on the roster falls back to the stored name");
assert.equal(byId("q_bid").bidAmount, 10000, "bid amount is the frozen totalRevenue");
assert.deepEqual(byId("q_inv").actuals, { revenue: 40000, gpDollars: 8000, gpPercent: 20 }, "Invoiced row: actual revenue = frozen bid; GP = revenue − complete cost");
assert.equal(byId("q_appr").actuals, null, "an Approved (pre-Invoiced) quote has null actuals — never fabricated");
assert.equal(byId("q_decl").objection, "price", "a LOST row surfaces its objection (from decisionNote)");
assert.equal(byId("q_lost").objection, "competitor", "a LOST row surfaces its explicit objection");
assert.equal(byId("q_appr").objection, null, "a non-LOST row carries no objection");
console.log("PASS: sales-tracker rows — attribution by id / legacy name / dash; actuals only when present; objection only on LOST");

// ── 3 — SCOREBOARD (hand-calculated literals) ────────────────────────────────────────────────────────
const sb = computeScoreboard(rows);

assert.equal(sb.all.wonCount, 7, "won count");
assert.equal(sb.all.lostCount, 2, "lost count");
assert.equal(sb.all.bidCount, 1, "bid (outstanding) count");
assert.equal(sb.all.wonDollars, 150000, "won dollars = 20000+30000+15000+25000+40000+12000+8000");
assert.equal(sb.all.lostDollars, 50000, "lost dollars = 20000+30000");
assert.equal(sb.all.bidDollars, 10000, "bid dollars");
assert.equal(sb.all.acceptedGpDollars, 30000, "accepted GP = 5000+6000+3000+5000+8000+2000+1000");
assert.equal(sb.all.winRateByDollars, 0.75, "win-by-DOLLARS = 150000 / (150000+50000) = 0.75");
near(sb.all.winRateByCount, 7 / 9, "win-by-COUNT = 7 / (7+2)");
near(sb.all.blendedMarginPercent, 20, "blended margin = 30000 / 150000 * 100 = 20%");

// per work type — the groups partition the all-up totals
assert.deepEqual(Object.keys(sb.byWorkType).sort(), ["Paving", "Sealcoat"], "grouped by work type");
assert.equal(sb.byWorkType["Paving"].wonCount, 2, "Paving wins: Approved + Scheduled");
assert.equal(sb.byWorkType["Paving"].lostCount, 1, "Paving losses: Declined");
assert.equal(
  sb.byWorkType["Paving"].wonCount + sb.byWorkType["Sealcoat"].wonCount,
  sb.all.wonCount,
  "per-work-type won counts partition the all-up won count"
);

// zero-denominator guards — empty input must not divide by zero
const empty = computeScoreboard([]);
assert.equal(empty.all.winRateByCount, 0, "no decided bids → win-by-count 0, not NaN");
assert.equal(empty.all.winRateByDollars, 0, "no decided dollars → win-by-$ 0, not NaN");
assert.equal(empty.all.blendedMarginPercent, 0, "no accepted revenue → blended margin 0, not NaN/Infinity");
console.log("PASS: sales-tracker scoreboard — dollar & count win rates, accepted GP, blended margin match hand-calc; per-work-type partitions; zero guarded");

// ── 4 — ACTUALS RECOGNITION (ruling: earned facts at Invoiced+) ─────────────────────────────────────
const base = { id: "j", totalRevenue: 40000, actualCost: 32000, actualCostComplete: true };
const atInvoiced = deriveTrackerRows([{ ...base, status: "Invoiced" }], [])[0];
assert.deepEqual(atInvoiced.actuals, { revenue: 40000, gpDollars: 8000, gpPercent: 20 }, "Invoiced → actual revenue = frozen bid; GP = revenue − complete cost");
const atEarlier = deriveTrackerRows([{ ...base, status: "Ready to Invoice" }], [])[0];
assert.equal(atEarlier.actuals, null, "the SAME job before Invoiced → actuals blank (null), never zero or an estimate");
const atPaid = deriveTrackerRows([{ ...base, status: "Paid" }], [])[0];
assert.equal(atPaid.actuals.revenue, 40000, "Paid (beyond Invoiced) also recognizes actual revenue");
const incompleteCost = deriveTrackerRows([{ id: "j2", status: "Invoiced", totalRevenue: 40000, actualCostComplete: false }], [])[0];
assert.equal(incompleteCost.actuals.revenue, 40000, "revenue is recognized at Invoiced even when cost data is incomplete");
assert.equal(incompleteCost.actuals.gpDollars, null, "incomplete cost data → GP blank (null), not negative-by-omission");
const atCompleted = deriveTrackerRows([{ ...base, status: "Completed" }], [])[0];
assert.equal(atCompleted.actuals, null, "legacy Completed is NOT named by the ruling → left unrecognized (flagged)");
console.log("PASS: sales-tracker actuals — recognized at Invoiced+ (earned facts); GP only with complete cost; blank before Invoiced and on incomplete cost");
