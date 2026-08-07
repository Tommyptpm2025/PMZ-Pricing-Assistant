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
import { deriveTrackerRows, computeScoreboard, computeScorecard, statusBucket } from "../lib/sales-tracker.ts";
import { upsertGoal, findGoal, goalsForYear, goalsForSalesperson } from "../lib/sales-goals.ts";

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
assert.deepEqual(atCompleted.actuals, { revenue: 40000, gpDollars: 8000, gpPercent: 20 }, "legacy Completed is realized money → recognizes actuals, same rules as Invoiced");
console.log("PASS: sales-tracker actuals — recognized at Invoiced+ (earned facts); GP only with complete cost; blank before Invoiced and on incomplete cost");

// ── 5 — SALES GOALS STORE (pure core) ────────────────────────────────────────────────────────────────
// Goals are ENTERED (Law 82). upsert replaces a cell in place (never duplicates); find returns null for
// an unset cell (never a fabricated zero goal); year/salesperson filters key by id.
let GOALS = [];
GOALS = upsertGoal(GOALS, { year: 2026, salespersonId: "p1", workTypeId: "wtA", goalSalesDollars: 100000, goalMarginPct: 25 });
GOALS = upsertGoal(GOALS, { year: 2026, salespersonId: "p1", workTypeId: "wtB", goalSalesDollars: 50000,  goalMarginPct: 20 });
GOALS = upsertGoal(GOALS, { year: 2026, salespersonId: "p2", workTypeId: "wtA", goalSalesDollars: 80000,  goalMarginPct: 30 });
// p2/wtB deliberately has NO goal.
GOALS = upsertGoal(GOALS, { year: 2025, salespersonId: "p1", workTypeId: "wtA", goalSalesDollars: 999999, goalMarginPct: 99 }); // other year — must never touch 2026
assert.equal(GOALS.length, 4, "four distinct goal cells stored");
GOALS = upsertGoal(GOALS, { year: 2026, salespersonId: "p1", workTypeId: "wtA", goalSalesDollars: 100000, goalMarginPct: 25 }); // re-enter same cell
assert.equal(GOALS.length, 4, "re-entering the SAME (year,person,workType) cell replaces in place — never duplicates");
assert.equal(findGoal(GOALS, 2026, "p2", "wtB"), null, "an unset cell is null (a dash), never a fabricated zero goal");
assert.equal(findGoal(GOALS, 2026, "p1", "wtA").goalSalesDollars, 100000, "a set cell finds by (year,person,workType) id");
assert.equal(goalsForYear(GOALS, 2026).length, 3, "goalsForYear 2026 excludes the 2025 goal");
assert.equal(goalsForSalesperson(GOALS, "p1").length, 3, "goalsForSalesperson lists p1's goals across years (2026 wtA + wtB, 2025 wtA)");
console.log("PASS: sales-goals store — upsert replaces a cell (no duplicates); unset cell is null; year & salesperson filters key by id");

// ── 6 — SCORECARD (goals vs BOOKED wins, BY WORK TYPE; hand-calculated literals) ───────────────────────
// Two salespeople (Ann=p1, Bob=p2) × two work types (wtA, wtB). Goals above: p1/wtA, p1/wtB, p2/wtA set;
// p2/wtB missing. Wins below (ACCEPTED, dated 2026). A LOST row, a BID row, and a 2025 win are seeded to
// prove ONLY accepted-bucket wins in THIS year count.
const SC_PEOPLE = [
  { id: "p1", name: "Ann Ant", roles: ["salesperson"], active: true, createdAt: "2026-01-01T00:00:00Z" },
  { id: "p2", name: "Bob Bee", roles: ["salesperson"], active: true, createdAt: "2026-01-01T00:00:00Z" },
];
const SC_QUOTES = [
  // p1/wtA — one booked win: sold 120000, GP 30000 (25%)
  { id: "w1", status: "Approved", createdAt: "2026-03-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 120000, grossProfitDollars: 30000 },
  // p1/wtB — NO win at all
  // p2/wtA — sold 80000, GP 20000 (25%)
  { id: "w2", status: "Approved", createdAt: "2026-04-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p2", totalRevenue: 80000,  grossProfitDollars: 20000 },
  // p2/wtB — sold 40000, GP 8000 (20%), but the boss set NO goal for this cell
  { id: "w3", status: "Approved", createdAt: "2026-05-01T00:00:00Z", workTypeId: "wtB", salespersonId: "p2", totalRevenue: 40000,  grossProfitDollars: 8000 },
  // NOISE that must NOT count toward booked wins:
  { id: "n_lost", status: "Lost",              createdAt: "2026-03-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 999999, grossProfitDollars: 500000 }, // lost
  { id: "n_bid",  status: "Ready for Approval", createdAt: "2026-03-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 888888, grossProfitDollars: 400000 }, // outstanding bid
  { id: "n_2025", status: "Approved",           createdAt: "2025-03-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 777777, grossProfitDollars: 300000 }, // wrong year
];
const scRows = deriveTrackerRows(SC_QUOTES, SC_PEOPLE);
const card = computeScorecard(scRows, GOALS, SC_PEOPLE, 2026);

// grid shape
assert.deepEqual(card.workTypeIds, ["wtA", "wtB"], "columns are the work-type IDs present, sorted");
assert.deepEqual(card.people.map((r) => r.salespersonId), ["p1", "p2"], "rows are the salespeople, sorted by name (Ann, Bob)");
const ann = card.people.find((r) => r.salespersonId === "p1");
const bob = card.people.find((r) => r.salespersonId === "p2");

// ---- MUTATION TARGET: goal margin dollars = sales × percent ----
// p1/wtA: 100000 × 25% = 25000. Flipping × to + in marginDollarsOf yields 100000 + 0.25 = 100000.25 and
// this exact assertion FAILS, naming margin dollars.
assert.equal(ann.byWorkType["wtA"].goal.marginDollars, 25000, "p1/wtA goal margin dollars = sales × percent = 100000 × 25% = 25000");
assert.equal(ann.byWorkType["wtB"].goal.marginDollars, 10000, "p1/wtB goal margin dollars = 50000 × 20% = 10000");
assert.equal(bob.byWorkType["wtA"].goal.marginDollars, 24000, "p2/wtA goal margin dollars = 80000 × 30% = 24000");

// p1/wtA — goal set, win present
assert.equal(ann.byWorkType["wtA"].actual.salesDollars, 120000, "p1/wtA booked sales = the accepted bid (120000) — LOST/BID/2025 noise excluded");
assert.equal(ann.byWorkType["wtA"].actual.gpDollars, 30000, "p1/wtA booked GP frozen at bid = 30000");
near(ann.byWorkType["wtA"].actual.marginPct, 25, "p1/wtA actual margin % = 30000/120000 = 25%");
assert.equal(ann.byWorkType["wtA"].salesDeltaDollars, 20000, "p1/wtA sales delta = 120000 − 100000");
assert.equal(ann.byWorkType["wtA"].marginDeltaDollars, 5000, "p1/wtA margin-$ delta = 30000 − 25000");
near(ann.byWorkType["wtA"].salesPercentToGoal, 120, "p1/wtA percent-to-goal (sales) = 120000/100000 = 120%");
near(ann.byWorkType["wtA"].marginPercentToGoal, 120, "p1/wtA percent-to-goal (margin$) = 30000/25000 = 120%");

// p1/wtB — goal set, NO win → genuine zeros against a real goal (0%, NOT null, NOT 100%)
assert.equal(ann.byWorkType["wtB"].actual.salesDollars, 0, "p1/wtB has no win → booked sales 0");
assert.equal(ann.byWorkType["wtB"].actual.marginPct, null, "p1/wtB no booked sales → actual margin % is null (no 0-division)");
assert.equal(ann.byWorkType["wtB"].salesDeltaDollars, -50000, "p1/wtB sales delta = 0 − 50000");
assert.equal(ann.byWorkType["wtB"].salesPercentToGoal, 0, "p1/wtB percent-to-goal = 0/50000 = 0% (a real goal missed, not a blank)");

// p2/wtB — NO goal but a real win → EVERY to-goal field null (never 100%, never #DIV/0!)
assert.equal(bob.byWorkType["wtB"].goal, null, "p2/wtB has no goal → goal is null");
assert.equal(bob.byWorkType["wtB"].actual.salesDollars, 40000, "p2/wtB win still shows its actual (40000)");
assert.equal(bob.byWorkType["wtB"].salesDeltaDollars, null, "p2/wtB no goal → sales delta null (not the actual, not zero)");
assert.equal(bob.byWorkType["wtB"].salesPercentToGoal, null, "p2/wtB no goal → percent-to-goal null — NEVER 100%, NEVER an error");
assert.equal(bob.byWorkType["wtB"].marginPercentToGoal, null, "p2/wtB no goal → margin percent-to-goal null");

// p2/wtA — goal set, win present, margin under goal
near(bob.byWorkType["wtA"].marginPercentToGoal, (20000 / 24000) * 100, "p2/wtA margin percent-to-goal = 20000/24000");
assert.equal(bob.byWorkType["wtA"].salesPercentToGoal, 100, "p2/wtA sales percent-to-goal = 80000/80000 = 100%");

// SCOPING LAW: each person scored against THEIR OWN goals only. Ann's total goal is 150000 (100000+50000);
// her percent-to-goal is 120000/150000 = 80%. If the code wrongly scored her against the COMPANY goal
// (230000) this would be ~52.17% — this literal catches that leak.
near(ann.total.salesPercentToGoal, 80, "p1 TOTAL percent-to-goal = 120000 / 150000 (p1's OWN goal) = 80% — not scored against the company goal");
assert.equal(ann.total.goal.salesDollars, 150000, "p1 total goal = SUM of p1's own cells (100000 + 50000)");
assert.equal(bob.total.goal.salesDollars, 80000, "p2 total goal = SUM of p2's own set cells (80000 only — wtB has no goal)");
near(bob.total.salesPercentToGoal, 150, "p2 TOTAL percent-to-goal = 120000 booked / 80000 goal = 150% (his own book)");

// COMPANY per-work-type totals = SUM of the individual goals (scoping law), all wins for actuals
assert.equal(card.byWorkType["wtA"].goal.salesDollars, 180000, "company wtA goal = p1(100000)+p2(80000) — SUM of individual goals");
assert.equal(card.byWorkType["wtA"].goal.marginDollars, 49000, "company wtA goal margin$ = 25000 + 24000");
assert.equal(card.byWorkType["wtA"].actual.salesDollars, 200000, "company wtA booked sales = 120000 + 80000");
near(card.byWorkType["wtA"].salesPercentToGoal, (200000 / 180000) * 100, "company wtA percent-to-goal = 200000/180000");
assert.equal(card.byWorkType["wtB"].goal.salesDollars, 50000, "company wtB goal = p1(50000) only (p2 unset) — SUM of individual goals");

// GRAND TOTAL
assert.equal(card.companyTotal.goal.salesDollars, 230000, "company total goal = 180000 + 50000");
assert.equal(card.companyTotal.goal.marginDollars, 59000, "company total goal margin$ = 49000 + 10000");
assert.equal(card.companyTotal.actual.salesDollars, 240000, "company total booked sales = 200000 + 40000 (includes the ungoaled p2/wtB win)");
assert.equal(card.companyTotal.actual.gpDollars, 58000, "company total booked GP = 50000 + 8000");
assert.equal(card.companyTotal.salesDeltaDollars, 10000, "company total sales delta = 240000 − 230000");
near(card.companyTotal.salesPercentToGoal, (240000 / 230000) * 100, "company total percent-to-goal = 240000/230000");

// A scorecard over NO goals and NO rows must not divide by zero anywhere.
const emptyCard = computeScorecard([], [], SC_PEOPLE, 2026);
assert.equal(emptyCard.companyTotal.goal, null, "no goals → company goal null, never a zero-dollar phantom");
assert.equal(emptyCard.companyTotal.salesPercentToGoal, null, "no goal → company percent-to-goal null, never NaN/100%");
assert.equal(emptyCard.people.length, 2, "roster salespeople still appear as (empty) rows");
assert.equal(emptyCard.people[0].total.actual.salesDollars, 0, "an empty row shows zero actuals, not a crash");
console.log("PASS: sales-tracker scorecard — goals×booked-wins by work type; margin$ = sales×%; missing-goal cells null (never 100%/#DIV/0!); each person scored on their OWN goals; totals both directions; zero guarded");

// ── 7 — SCORECARD *PERFORMED* BLOCK (recognized money, beside BOOKED) ──────────────────────────────────
// BOOKED answers "what did he sell"; PERFORMED answers "what has the company actually earned". A job that
// is booked but NOT yet recognized belongs to BOOKED only. Recognition is NOT restated in the scorecard —
// it is inherited from TrackerRow.actuals (Invoiced / Paid / legacy Completed; GP only on complete cost).
// Fixtures, all 2026, Ann=p1 / Bob=p2, work types wtA / wtB:
//   pf1  Ann wtA  Invoiced, complete cost   bid 100000 gpAtBid 25000 | cost 70000  → performed 100000, GP 30000 (30%)
//   pf2  Ann wtA  Approved, NOT invoiced    bid  60000 gpAtBid 15000               → BOOKED ONLY, performed nothing
//   pf3  Ann wtB  Invoiced, INCOMPLETE cost bid  50000 gpAtBid 12500               → performed 50000, GP null
//   pf4  Bob wtA  legacy Completed + CO     bid 80000 gpAtBid 20000 | released CO 5000 rev / 4000 cost /
//                                          1000 GP, job cost 63750 → company performed 85000, GP 17250| CO 5000, cost 63750 → performed 85000, GP 21250 (25%)
//   pf5  Bob wtB  Approved, NOT invoiced    bid  40000 gpAtBid 10000               → BOOKED ONLY, performed nothing
const PF_QUOTES = [
  { id: "pf1", status: "Invoiced",  createdAt: "2026-02-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 100000, grossProfitDollars: 25000, actualCost: 70000, actualCostComplete: true },
  { id: "pf2", status: "Approved",  createdAt: "2026-03-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 60000,  grossProfitDollars: 15000 },
  { id: "pf3", status: "Invoiced",  createdAt: "2026-04-01T00:00:00Z", workTypeId: "wtB", salespersonId: "p1", totalRevenue: 50000,  grossProfitDollars: 12500, actualCost: 38000, actualCostComplete: false },
  { id: "pf4", status: "Completed", createdAt: "2026-05-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p2", totalRevenue: 80000,  grossProfitDollars: 20000, changeOrderRevenue: 5000, changeOrderCost: 4000, changeOrderGpDollars: 1000, actualCost: 63750, actualCostComplete: true },
  { id: "pf5", status: "Approved",  createdAt: "2026-06-01T00:00:00Z", workTypeId: "wtB", salespersonId: "p2", totalRevenue: 40000,  grossProfitDollars: 10000 },
  // NOISE that must never reach PERFORMED:
  { id: "pfn_2025", status: "Invoiced", createdAt: "2025-07-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 999999, grossProfitDollars: 111111, actualCost: 1, actualCostComplete: true }, // wrong year
  { id: "pfn_lost", status: "Lost",     createdAt: "2026-07-01T00:00:00Z", workTypeId: "wtA", salespersonId: "p1", totalRevenue: 888888, grossProfitDollars: 222222, actualCost: 1, actualCostComplete: true }, // lost — never recognized
];
const pfRows = deriveTrackerRows(PF_QUOTES, SC_PEOPLE);
const pcard = computeScorecard(pfRows, GOALS, SC_PEOPLE, 2026);
const annP = pcard.people.find((r) => r.salespersonId === "p1");
const bobP = pcard.people.find((r) => r.salespersonId === "p2");

// ---- Invoiced + complete cost: appears in BOTH columns, with DIFFERENT numbers ----
assert.equal(annP.byWorkType["wtA"].actual.salesDollars, 160000, "Ann/wtA BOOKED sales = pf1 100000 + pf2 60000 (both accepted wins)");
assert.equal(annP.byWorkType["wtA"].actual.gpDollars, 40000, "Ann/wtA BOOKED GP frozen at bid = 25000 + 15000");
// ---- MUTATION TARGET: PERFORMED must exclude the booked-but-unrecognized job ----
// Making PERFORMED fall back to the bid for ACCEPTED rows yields 160000 here and this assertion FAILS,
// naming pf2 — the Approved-but-not-invoiced job that belongs to BOOKED only.
assert.equal(annP.byWorkType["wtA"].performed.salesDollars, 100000, "Ann/wtA PERFORMED sales = pf1 (Invoiced) 100000 ONLY — pf2 is Accepted-but-not-invoiced: BOOKED, never PERFORMED");
assert.equal(annP.byWorkType["wtA"].performed.gpDollars, 30000, "Ann/wtA PERFORMED GP = recognized revenue 100000 − complete actual cost 70000 = 30000 (NOT the 25000 booked at bid)");
near(annP.byWorkType["wtA"].performed.marginPct, 30, "Ann/wtA PERFORMED margin = 30000/100000 = 30% — the job earned better than the 25% it was sold at");
assert.equal(annP.byWorkType["wtA"].performed.jobCount, 1, "Ann/wtA recognized exactly one job");
assert.equal(annP.byWorkType["wtA"].performed.costedJobCount, 1, "Ann/wtA that one job has complete cost data");

// ---- Accepted but not invoiced, standing ALONE: BOOKED shows, PERFORMED is blank (never zero) ----
assert.equal(bobP.byWorkType["wtB"].actual.salesDollars, 40000, "Bob/wtB BOOKED sales = pf5 40000 — an accepted win counts the moment it is accepted");
assert.equal(bobP.byWorkType["wtB"].performed.salesDollars, null, "Bob/wtB PERFORMED sales null — pf5 was never invoiced, so nothing is earned: a DASH, never $0");
assert.equal(bobP.byWorkType["wtB"].performed.gpDollars, null, "Bob/wtB PERFORMED GP null — nothing recognized to compute margin from");
assert.equal(bobP.byWorkType["wtB"].performed.marginPct, null, "Bob/wtB PERFORMED margin null — never NaN, never 0%");
assert.equal(bobP.byWorkType["wtB"].performed.jobCount, 0, "Bob/wtB recognized no jobs");

// ---- Invoiced with INCOMPLETE cost: sales recognized, margin blank ----
assert.equal(annP.byWorkType["wtB"].performed.salesDollars, 50000, "Ann/wtB PERFORMED sales = 50000 — revenue IS recognized at Invoiced even with incomplete cost data");
assert.equal(annP.byWorkType["wtB"].performed.gpDollars, null, "Ann/wtB PERFORMED GP null — cost data incomplete: blank, never an estimate, never negative-by-omission");
assert.equal(annP.byWorkType["wtB"].performed.marginPct, null, "Ann/wtB PERFORMED margin null — no GP to divide");
assert.equal(annP.byWorkType["wtB"].performed.costedSalesDollars, 0, "Ann/wtB no costed revenue backs a margin");
assert.equal(annP.byWorkType["wtB"].performed.jobCount, 1, "Ann/wtB recognized one job (revenue counted)...");
assert.equal(annP.byWorkType["wtB"].performed.costedJobCount, 0, "...of which none carries complete cost — the coverage gap is reported, not hidden");

// ---- Legacy Completed is realized money. THE EXTRA IS COMPANY MONEY, NOT BOB'S ----
// AMENDED 2026-08-07 by the gaveled bonus ruling. This cell previously read 85000 / 21250 / 25%,
// crediting pf4's $5,000 change order to Bob's PERSONAL performed row. Extras belong to the COMPANY —
// see the ruling comment in computeScorecard. Bob's row is now the recognized frozen bid alone; the
// company rows further down still carry the full 85000, and the difference between them IS the extra.
assert.equal(bobP.byWorkType["wtA"].actual.salesDollars, 80000, "Bob/wtA BOOKED sales = the frozen bid 80000 — the change order is NOT his booked revenue");
assert.equal(bobP.byWorkType["wtA"].performed.salesDollars, 80000, "Bob/wtA PERFORMED sales = the recognized BID 80000 — the $5,000 extra is company money and never reaches a personal row");
assert.equal(bobP.byWorkType["wtA"].performed.gpDollars, 16250, "Bob/wtA PERFORMED GP = bid 80000 − actual cost 63750 = 16250");
near(bobP.byWorkType["wtA"].performed.marginPct, 20.3125, "Bob/wtA PERFORMED margin = 16250/80000 = 20.3125%");

// ---- Person totals ----
assert.equal(annP.total.actual.salesDollars, 210000, "Ann TOTAL BOOKED = 100000 + 60000 + 50000");
assert.equal(annP.total.performed.salesDollars, 150000, "Ann TOTAL PERFORMED = pf1 100000 + pf3 50000 — pf2 never recognized");
assert.equal(annP.total.performed.gpDollars, 30000, "Ann TOTAL PERFORMED GP = pf1 only (pf3's cost is incomplete)");
assert.equal(annP.total.performed.costedSalesDollars, 100000, "Ann's margin denominator is the COSTED slice (100000), not all recognized sales (150000)");
near(annP.total.performed.marginPct, 30, "Ann TOTAL PERFORMED margin = 30000/100000 = 30% — ties out to the dollars it was computed from, NOT 30000/150000");
assert.equal(annP.total.performed.jobCount, 2, "Ann recognized 2 jobs...");
assert.equal(annP.total.performed.costedJobCount, 1, "...1 of them fully costed — the margin covers part of the total, and says so");
assert.equal(bobP.total.performed.salesDollars, 80000, "Bob TOTAL PERFORMED = pf4's BID only (pf5 not invoiced; the extra is the company's)");
near(bobP.total.performed.marginPct, 20.3125, "Bob TOTAL PERFORMED margin = 16250/80000 = 20.3125%");

// ---- Both-direction totals: work type and company ----
assert.equal(pcard.byWorkType["wtA"].performed.salesDollars, 185000, "company wtA PERFORMED = pf1 100000 + pf4 85000");
assert.equal(pcard.byWorkType["wtA"].performed.gpDollars, 47250, "company wtA PERFORMED GP = 30000 + pf4's 17250 (85000 revenue − 63750 job cost − 4000 extra cost)");
assert.equal(pcard.byWorkType["wtB"].performed.salesDollars, 50000, "company wtB PERFORMED = pf3 only (pf5 unrecognized)");
assert.equal(pcard.byWorkType["wtB"].performed.gpDollars, null, "company wtB PERFORMED GP null — its only recognized job has incomplete cost");
assert.equal(pcard.companyTotal.actual.salesDollars, 335000, "company TOTAL BOOKED = 330000 of bids + pf4's 5000 released change order — COMPANY booked includes extras (gaveled 2026-08-07)");
assert.equal(
  pcard.companyTotal.actual.salesDollars - (annP.total.actual.salesDollars + bobP.total.actual.salesDollars),
  5000,
  "…and the company total EXCEEDS the sum of the personal rows by EXACTLY the extras. That gap is the ruling working, not a reconciliation bug."
);
assert.equal(pcard.companyTotal.performed.salesDollars, 235000, "company TOTAL PERFORMED = 100000 + 50000 + 85000 — 2025 and LOST noise excluded");
assert.equal(pcard.companyTotal.performed.gpDollars, 47250, "company TOTAL PERFORMED GP = 30000 + 17250 — the extra's 4000 cost recognizes with its 5000 revenue (gaveled 2026-08-07)");
assert.equal(pcard.companyTotal.performed.costedSalesDollars, 185000, "company margin denominator = the costed slice 185000, not 235000");
near(pcard.companyTotal.performed.marginPct, (47250 / 185000) * 100, "company TOTAL PERFORMED margin = 47250/185000");
assert.equal(pcard.companyTotal.performed.jobCount, 3, "3 recognized jobs company-wide (the 2025 Invoiced job is a different year)");
assert.equal(pcard.companyTotal.performed.costedJobCount, 2, "2 of the 3 fully costed");
assert.ok(
  pcard.companyTotal.performed.salesDollars < pcard.companyTotal.actual.salesDollars,
  "PERFORMED trails BOOKED while work is in flight — that gap is the answer to a real question, not an error"
);

// ---- A cell with NO goal still reports performed; an empty scorecard divides by nothing ----
assert.equal(bobP.byWorkType["wtB"].goal, null, "Bob/wtB has no goal (unchanged by the performed block)");
const emptyPerf = computeScorecard([], [], SC_PEOPLE, 2026).companyTotal.performed;
assert.equal(emptyPerf.salesDollars, null, "no rows → company PERFORMED sales null, never a phantom $0");
assert.equal(emptyPerf.marginPct, null, "no rows → company PERFORMED margin null, never NaN/Infinity");
assert.equal(emptyPerf.jobCount, 0, "no rows → no recognized jobs");
console.log("PASS: sales-tracker scorecard PERFORMED — recognized money beside booked (Invoiced/Paid/legacy Completed only, inherited from row actuals); booked-not-invoiced never performs; GP only on complete cost with the margin tied to its costed denominator; released change orders join COMPANY performed revenue while personal rows carry the recognized bid alone (gaveled bonus ruling, 2026-08-07); totals both directions; blanks never zeros");
