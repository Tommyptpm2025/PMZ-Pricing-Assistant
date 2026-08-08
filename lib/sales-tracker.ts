import type { QuoteStatus } from "./pmz-types";
import type { Person } from "./people";
import type { SalesGoal } from "./sales-goals";

/**
 * SALES TRACKER — the ONE home for tracker math (SALES-TRACKER-SPEC.md). PURE: no storage, no React.
 * Callers pass data in. "A view, not a ledger" — every row derives from a saved quote (Law 9); nothing
 * here is entered or stored.
 *
 *   deriveTrackerRows(quotes, people) — one row per NON-DRAFT quote. Draft quotes are excluded from
 *     everything (gaveled: never presented, dead information). Attribution resolves by Person id;
 *     legacy name-string quotes show that name; unattributed shows a dash.
 *   statusBucket(status) — the SINGLE home of the status→bucket mapping (three buckets). Draft → null.
 *   computeScoreboard(rows) — per work type AND all-up: win/loss ratios by DOLLARS and by COUNT,
 *     accepted GP, blended margin. All derived; every division guarded against a zero denominator.
 *   computeScorecard(rows, goals, people, year) — the goals-vs-actuals scorecard grid, BY WORK TYPE
 *     (gaveled), per salesperson and both-direction totals. Three blocks per cell: GOALS (the boss's
 *     entered targets, Law 82), BOOKED (wins sold), PERFORMED (recognized money). Every division
 *     guarded — this grid is incapable of the source workbook's #DIV/0! by construction. See
 *     computeScorecard for the scoping law.
 */

export type TrackerBucket = "BID" | "ACCEPTED" | "LOST";

// The SINGLE status→bucket map. BID = sent, awaiting an answer. ACCEPTED = accepted and everything
// after it (won is won, whatever stage the job is at now). LOST = declined or lost. Draft → null
// (excluded from the tracker entirely). Every stored QuoteStatus is covered exactly once.
const STATUS_BUCKET: Record<QuoteStatus, TrackerBucket | null> = {
  "Draft": null,               // excluded — never presented, dead information
  "Ready for Approval": "BID", // label "Sent for Acceptance" — out with the customer
  "Approved": "ACCEPTED",      // label "Accepted"
  "Scheduled": "ACCEPTED",
  "In Progress": "ACCEPTED",   // label "Work Order Active"
  "Ready to Invoice": "ACCEPTED",
  "Invoiced": "ACCEPTED",
  "Paid": "ACCEPTED",
  "Completed": "ACCEPTED",     // legacy/terminal — a won, finished job
  "Declined": "LOST",          // gaveled: declined counts as lost
  "Lost": "LOST",
};

export function statusBucket(status: QuoteStatus): TrackerBucket | null {
  return STATUS_BUCKET[status] ?? null;
}

// Quote fields the tracker reads. SavedQuote is assignable to this (extra fields ignored); the actuals
// and objection are optional because they arrive later in the job's life.
export interface TrackerQuoteInput {
  id: string;
  status: QuoteStatus;
  createdAt?: string;
  updatedAt?: string;
  jobName?: string;
  customerId?: string;
  customerName?: string;
  customer?: string;
  workType?: string;
  workTypeId?: string;
  totalRevenue?: number;      // frozen bid amount (Law 56)
  grossProfitDollars?: number;
  grossProfitPercent?: number;
  salespersonId?: string;
  salesperson?: string;       // legacy name string (display only)
  decisionNote?: string;
  // Job actuals inputs (Law 9 — actuals come from the JOB). The call site joins the quote to its job
  // and passes the job's recorded actual COST + whether that cost data is complete. Actual REVENUE is
  // the frozen accepted bid (totalRevenue above) plus approved change orders, recognized here by status
  // (see deriveTrackerRows). changeOrderRevenue joins this sum when the change-order lane is built.
  actualCost?: number;
  actualCostComplete?: boolean;
  // RELEASED change-order money on this quote (quoted-or-beyond only — Law 83). Revenue joins the
  // recognized actual revenue above and the COST joins the recognized cost subtraction — together or
  // not at all (see the recognition rule below). The GP is carried at the parent's FROZEN margin. All
  // three are resolved at the call site from lib/change-orders (releasedTotalsByQuote), never here.
  changeOrderRevenue?: number;
  changeOrderCost?: number;
  changeOrderGpDollars?: number;
  // Loss capture.
  objection?: string;
}

export interface TrackerActuals {
  revenue: number;
  gpDollars: number | null;  // null when cost data is missing/incomplete — never negative-by-omission
  gpPercent: number | null;
}

// RULING (recorded at the join): a job's ACTUAL REVENUE = the frozen accepted bid (totalRevenue) plus
// released change orders, RECOGNIZED ONLY when the job is realized money — Invoiced, Paid, or legacy
// Completed (all three are the Qualifying Set, Law 2). Earlier statuses stay blank — never zero, never
// an estimate (earned facts, Law 38 spirit). ACTUAL GP = actual revenue − the job's actual recorded
// cost, computed ONLY when that cost data is complete; otherwise GP is blank.
//
// TOGETHER OR NOT AT ALL (gaveled 2026-08-07). A released change order's REVENUE and its COST enter
// recognition as one act. Its price joins actual revenue; its stored break-even totalCost joins the
// cost being subtracted. Letting the revenue in without the cost was the defect this ruling closes:
// it credited the company with the extra's whole price as profit, so every job that grew after the bid
// reported a better margin than it earned — and the more extras a job took, the more flattering the lie.
// The two numbers move together or the GP is not computed at all.
const REVENUE_RECOGNIZED: ReadonlySet<QuoteStatus> = new Set<QuoteStatus>(["Invoiced", "Paid", "Completed"]);

export interface TrackerRow {
  quoteId: string;
  date: string;
  jobName: string;
  customerId: string;
  customer: string;
  workType: string;     // denormalized work-type NAME (display)
  workTypeId: string;   // work-type ID — the join key for goals/scorecard ("" when a legacy row has none)
  bidAmount: number;    // frozen totalRevenue — the BID, and only the bid (Law 56/83)
  gpAtBid: number;      // gross profit $ at bid
  margin: number;       // gross profit % at bid
  // RELEASED extras on this job, carried BESIDE the bid and never folded into it (Law 83 — the bid is
  // frozen; the contract accretes). Company totals add these; a salesperson's personal row never does
  // — the gaveled bonus ruling, enforced in computeScorecard where the buckets part ways.
  changeOrderRevenue: number;
  changeOrderCost: number;
  changeOrderGp: number;
  salespersonId: string | null;
  salesperson: string;  // roster name (by id) · legacy name · "—" when unattributed
  status: QuoteStatus;
  bucket: TrackerBucket;
  actuals: TrackerActuals | null;
  objection: string | null;
}

const nonEmpty = (s: string | undefined | null): string => (s && s.trim() !== "" ? s : "");

export function deriveTrackerRows(quotes: TrackerQuoteInput[], people: Person[]): TrackerRow[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return (quotes || [])
    .map((q) => ({ q, bucket: statusBucket(q.status) }))
    .filter((x): x is { q: TrackerQuoteInput; bucket: TrackerBucket } => x.bucket !== null) // drafts (null) excluded
    .map(({ q, bucket }) => {
      const salespersonId = nonEmpty(q.salespersonId) || null;
      // id → roster name; fall back to the stored legacy name; else a dash.
      const salesperson = salespersonId
        ? (byId.get(salespersonId)?.name || nonEmpty(q.salesperson) || "—")
        : (nonEmpty(q.salesperson) || "—");
      // Actuals recognized only at Invoiced+ (earned facts). Revenue = frozen bid + approved change
      // orders. GP derived only when the job's actual cost data is complete; else GP is blank (null).
      let actuals: TrackerActuals | null = null;
      if (REVENUE_RECOGNIZED.has(q.status)) {
        const revenue = (q.totalRevenue ?? 0) + (q.changeOrderRevenue ?? 0);
        const costKnown = q.actualCostComplete === true && typeof q.actualCost === "number";
        // The extras' cost rides with the extras' revenue — the job's recorded cost covers the BID
        // work only (its recipe rows), so a change order's own break-even cost has to be added here or
        // the subtraction is missing money the company actually spent.
        const cost = (q.actualCost ?? 0) + (q.changeOrderCost ?? 0);
        const gpDollars = costKnown ? revenue - cost : null;
        const gpPercent = gpDollars !== null && revenue > 0 ? (gpDollars / revenue) * 100 : null;
        actuals = { revenue, gpDollars, gpPercent };
      }
      return {
        quoteId: q.id,
        date: nonEmpty(q.createdAt) || nonEmpty(q.updatedAt) || "",
        jobName: nonEmpty(q.jobName) || "—",
        customerId: nonEmpty(q.customerId),
        customer: nonEmpty(q.customerName) || nonEmpty(q.customer) || "—",
        workType: nonEmpty(q.workType) || nonEmpty(q.workTypeId) || "—",
        workTypeId: nonEmpty(q.workTypeId),
        bidAmount: q.totalRevenue ?? 0,
        gpAtBid: q.grossProfitDollars ?? 0,
        margin: q.grossProfitPercent ?? 0,
        changeOrderRevenue: q.changeOrderRevenue ?? 0,
        changeOrderCost: q.changeOrderCost ?? 0,
        changeOrderGp: q.changeOrderGpDollars ?? 0,
        salespersonId,
        salesperson,
        status: q.status,
        bucket,
        actuals,
        objection: bucket === "LOST" ? (nonEmpty(q.objection) || nonEmpty(q.decisionNote) || null) : null,
      };
    });
}

export interface ScoreboardStats {
  bidCount: number;
  wonCount: number;
  lostCount: number;
  // RULING: win rate is DECIDED-ONLY — won / (won + lost) — with outstanding bids reported separately
  // (bidCount / bidDollars). The source workbook computed accepted / total-including-outstanding; PMZ
  // deliberately differs so an unanswered bid never drags the win rate down. Explained in the demo.
  winRateByCount: number;   // won / (won + lost); 0 when nothing is decided
  bidDollars: number;
  wonDollars: number;
  lostDollars: number;
  winRateByDollars: number; // wonDollars / (won + lost dollars); 0 when nothing is decided
  acceptedGpDollars: number;
  blendedMarginPercent: number; // acceptedGp / wonDollars * 100; 0 when no accepted revenue
}

export interface Scoreboard {
  all: ScoreboardStats;
  byWorkType: Record<string, ScoreboardStats>;
}

function sum(rows: TrackerRow[], pick: (r: TrackerRow) => number): number {
  return rows.reduce((acc, r) => acc + (pick(r) || 0), 0);
}

function statsFor(rows: TrackerRow[]): ScoreboardStats {
  const won = rows.filter((r) => r.bucket === "ACCEPTED");
  const lost = rows.filter((r) => r.bucket === "LOST");
  const bid = rows.filter((r) => r.bucket === "BID");

  const wonCount = won.length;
  const lostCount = lost.length;
  const decidedCount = wonCount + lostCount;

  const wonDollars = sum(won, (r) => r.bidAmount);
  const lostDollars = sum(lost, (r) => r.bidAmount);
  const bidDollars = sum(bid, (r) => r.bidAmount);
  const decidedDollars = wonDollars + lostDollars;

  const acceptedGpDollars = sum(won, (r) => r.gpAtBid);

  return {
    bidCount: bid.length,
    wonCount,
    lostCount,
    winRateByCount: decidedCount > 0 ? wonCount / decidedCount : 0,
    bidDollars,
    wonDollars,
    lostDollars,
    winRateByDollars: decidedDollars > 0 ? wonDollars / decidedDollars : 0,
    acceptedGpDollars,
    blendedMarginPercent: wonDollars > 0 ? (acceptedGpDollars / wonDollars) * 100 : 0,
  };
}

export function computeScoreboard(rows: TrackerRow[]): Scoreboard {
  const groups = new Map<string, TrackerRow[]>();
  for (const r of rows) {
    const key = r.workType || "—";
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const byWorkType: Record<string, ScoreboardStats> = {};
  for (const [key, rs] of groups) byWorkType[key] = statsFor(rs);
  return { all: statsFor(rows), byWorkType };
}

// ── SCORECARD — goals vs booked vs performed, BY WORK TYPE ───────────────────────────────────────────
//
// DEFINITION (read before touching the math): every cell carries THREE blocks, answering three different
// questions. Never blend them.
//
//   GOALS     — what the boss said to sell. Entered targets (Law 82, PMZ Informs the Owner Decides):
//               never derived, never auto-adjusted. Goal margin dollars = goal sales × goal margin %.
//   BOOKED    — what the salesperson SOLD. Sales dollars = the ACCEPTED-bucket bid amount (frozen
//               totalRevenue, Law 56); GP is frozen at bid (gpAtBid). A win counts the MOMENT it is
//               accepted — how the job later executes is not this column's question.
//   PERFORMED — what the company actually EARNED. Recognized revenue and realized GP, straight off
//               TrackerRow.actuals — the ONE home of the recognition rule (Invoiced / Paid / legacy
//               Completed only; GP only where the job's actual cost data is complete). Nothing is
//               re-derived here; if the recognition rule ever changes it changes in deriveTrackerRows
//               and this column follows.
//
// THE POINT OF TWO ACTUAL COLUMNS: a job that is booked but not yet recognized contributes to BOOKED and
// NOT to PERFORMED. Booked $300k / performed $180k is not an error — it is the answer to "how much of
// what he sold has the company actually earned?" Any change that makes an unrecognized win show up in
// PERFORMED destroys that question. The fence mutation-proves exactly this.
//
// CRITICAL SCOPING LAW: a salesperson's row is scored against THAT PERSON'S goals only. Company totals
// use the SUM of the individual goals. One person is NEVER scored against a company-wide goal — the
// predecessor software did exactly that and made every personal percent-to-goal meaningless.
//
// EVERY division is guarded. Where no goal is set, the goal and every to-goal comparison render null
// (a dash on screen) — never zero, never 100%, never an error. The source workbook printed #DIV/0! in
// these exact cells; this grid cannot, by construction.

export interface ScorecardGoal {
  salesDollars: number;
  marginPct: number | null;   // blended = marginDollars / salesDollars; null when salesDollars is 0
  marginDollars: number;      // salesDollars × marginPct (the product — see marginDollarsOf)
}

export interface ScorecardActual {
  salesDollars: number;       // BOOKED wins: sum of ACCEPTED-bucket bid amounts
  gpDollars: number;          // GP frozen at bid (the actual margin dollars)
  marginPct: number | null;   // gpDollars / salesDollars; null when no booked sales
}

// PERFORMED — recognized money, aggregated from TrackerRow.actuals. NOTHING here is an estimate and
// nothing is zero-by-omission:
//   salesDollars — recognized revenue (frozen bid + approved change orders, per the recognition rule).
//                  NULL when this cell has recognized nothing yet — a dash, not "$0". (BOOKED shows a
//                  real 0 against a real goal; PERFORMED shows blank, because "not earned yet" and
//                  "earned nothing" are different statements and only the first is knowable here.)
//   gpDollars    — realized GP summed over ONLY the recognized jobs whose actual cost data is complete.
//                  NULL when no job in the cell has complete cost. A half-costed cell reports the GP it
//                  can stand behind, never a total inflated by uncosted jobs counted at zero cost.
//   marginPct    — gpDollars ÷ costedSalesDollars. The denominator is the COSTED slice, not all
//                  recognized sales, so the percent ties out against the dollars it was computed from.
//   costedSalesDollars / jobCount / costedJobCount — the coverage facts. When costedJobCount < jobCount
//                  the margin covers only part of the cell; the display uses this to say so rather than
//                  letting a partial margin read as a whole one.
export interface ScorecardPerformed {
  salesDollars: number | null;
  gpDollars: number | null;
  marginPct: number | null;
  costedSalesDollars: number;  // the revenue the GP was computed against (the marginPct denominator)
  jobCount: number;            // recognized jobs in this cell
  costedJobCount: number;      // of those, the ones with complete actual cost data
}

// One cell of the grid: a (salesperson × work type) intersection, a person's total, a work-type total,
// or the company total. actual (BOOKED) is always present (zeros when there are no wins) so the grid
// always renders; goal and every to-goal field are null when the boss set no goal for this cell;
// performed carries nulls where nothing has been recognized/costed.
export interface ScorecardCell {
  goal: ScorecardGoal | null;
  actual: ScorecardActual;
  performed: ScorecardPerformed;
  salesDeltaDollars: number | null;    // actual.salesDollars − goal.salesDollars
  marginDeltaDollars: number | null;   // actual.gpDollars − goal.marginDollars
  salesPercentToGoal: number | null;   // actual.salesDollars / goal.salesDollars × 100
  marginPercentToGoal: number | null;  // actual.gpDollars / goal.marginDollars × 100
}

export interface ScorecardPersonRow {
  salespersonId: string;
  salesperson: string;                         // resolved roster name (by id), or the id when off-roster
  byWorkType: Record<string, ScorecardCell>;   // keyed by workTypeId
  total: ScorecardCell;                        // this person across all work types
}

export interface Scorecard {
  year: number;
  workTypeIds: string[];                        // columns present (union of goals + booked wins), sorted
  people: ScorecardPersonRow[];                 // rows, sorted by resolved name then id
  byWorkType: Record<string, ScorecardCell>;    // company total per work type (SUM of individual goals)
  companyTotal: ScorecardCell;                  // grand total
}

// Goal margin dollars = sales dollars × margin percent. THE PRODUCT. The mutation fence flips this ×
// to + and must fail naming margin dollars. Percent is a whole number (25 = 25%), so ÷100 here.
function marginDollarsOf(salesDollars: number, marginPct: number): number {
  return salesDollars * (marginPct / 100);
}

interface GoalAgg { salesDollars: number; marginDollars: number }
interface ActualAgg { salesDollars: number; gpDollars: number }
interface PerformedAgg {
  salesDollars: number;
  costedSalesDollars: number;
  gpDollars: number;
  jobCount: number;
  costedJobCount: number;
}

// Year of a tracker row's date (leading YYYY of the ISO string), or null when absent/unparseable — a
// row with no usable date can't be attributed to a scorecard year and is left out of it.
function rowYear(date: string): number | null {
  const m = /^(\d{4})/.exec(date || "");
  return m ? Number(m[1]) : null;
}

/**
 * The rows belonging to one scorecard year. Exported so a caller that needs a year-scoped SCOREBOARD
 * (computeScoreboard takes no year) uses the SAME year rule the scorecard does, instead of writing a
 * second date filter that could drift from it. A row with no usable date belongs to no year and is
 * excluded — the same treatment it already gets inside computeScorecard.
 */
export function rowsForYear(rows: TrackerRow[], year: number): TrackerRow[] {
  return (rows || []).filter((r) => rowYear(r.date) === year);
}

const addGoal = (m: Map<string, GoalAgg>, key: string, g: GoalAgg) => {
  const cur = m.get(key);
  if (cur) { cur.salesDollars += g.salesDollars; cur.marginDollars += g.marginDollars; }
  else m.set(key, { salesDollars: g.salesDollars, marginDollars: g.marginDollars });
};
const addActual = (m: Map<string, ActualAgg>, key: string, a: ActualAgg) => {
  const cur = m.get(key);
  if (cur) { cur.salesDollars += a.salesDollars; cur.gpDollars += a.gpDollars; }
  else m.set(key, { salesDollars: a.salesDollars, gpDollars: a.gpDollars });
};
const addPerformed = (m: Map<string, PerformedAgg>, key: string, p: PerformedAgg) => {
  const cur = m.get(key);
  if (cur) {
    cur.salesDollars += p.salesDollars;
    cur.costedSalesDollars += p.costedSalesDollars;
    cur.gpDollars += p.gpDollars;
    cur.jobCount += p.jobCount;
    cur.costedJobCount += p.costedJobCount;
  } else m.set(key, { ...p });
};

// PERFORMED block from its aggregate. Counts — not dollars — decide blank vs. a number, so a genuinely
// recognized $0 job is still a number while a cell that recognized nothing stays blank. Division guarded.
function buildPerformed(p: PerformedAgg): ScorecardPerformed {
  const gpDollars = p.costedJobCount > 0 ? p.gpDollars : null;
  return {
    salesDollars: p.jobCount > 0 ? p.salesDollars : null,
    gpDollars,
    marginPct: gpDollars !== null && p.costedSalesDollars > 0 ? (gpDollars / p.costedSalesDollars) * 100 : null,
    costedSalesDollars: p.costedSalesDollars,
    jobCount: p.jobCount,
    costedJobCount: p.costedJobCount,
  };
}

// Build one cell from a (possibly absent) goal, the booked actual, and the performed aggregate. No goal
// → goal + every to-goal field is null (dash). Every division guarded: a zero denominator yields null,
// never NaN/Infinity, never 100%. To-goal comparisons measure BOOKED against goal — performed is
// reported beside them, never substituted into them.
function buildCell(goal: GoalAgg | null, actual: ActualAgg, performed: PerformedAgg): ScorecardCell {
  const actualMarginPct = actual.salesDollars > 0 ? (actual.gpDollars / actual.salesDollars) * 100 : null;
  const actualOut: ScorecardActual = {
    salesDollars: actual.salesDollars,
    gpDollars: actual.gpDollars,
    marginPct: actualMarginPct,
  };
  const performedOut = buildPerformed(performed);
  if (!goal) {
    return {
      goal: null,
      actual: actualOut,
      performed: performedOut,
      salesDeltaDollars: null,
      marginDeltaDollars: null,
      salesPercentToGoal: null,
      marginPercentToGoal: null,
    };
  }
  const goalMarginPct = goal.salesDollars > 0 ? (goal.marginDollars / goal.salesDollars) * 100 : null;
  return {
    goal: { salesDollars: goal.salesDollars, marginPct: goalMarginPct, marginDollars: goal.marginDollars },
    actual: actualOut,
    performed: performedOut,
    salesDeltaDollars: actual.salesDollars - goal.salesDollars,
    marginDeltaDollars: actual.gpDollars - goal.marginDollars,
    salesPercentToGoal: goal.salesDollars > 0 ? (actual.salesDollars / goal.salesDollars) * 100 : null,
    marginPercentToGoal: goal.marginDollars > 0 ? (actual.gpDollars / goal.marginDollars) * 100 : null,
  };
}

const EMPTY_ACTUAL: ActualAgg = { salesDollars: 0, gpDollars: 0 };
const EMPTY_PERFORMED: PerformedAgg = { salesDollars: 0, costedSalesDollars: 0, gpDollars: 0, jobCount: 0, costedJobCount: 0 };

export function computeScorecard(
  rows: TrackerRow[],
  goals: SalesGoal[],
  people: Person[],
  year: number
): Scorecard {
  const nameById = new Map((people || []).map((p) => [p.id, p.name]));

  // ── Goals for this year → per (person × workType), per person, per workType (company), grand total.
  // Company totals accumulate the SAME per-cell goal into the wider buckets — so a company work-type
  // total is exactly the SUM of the individual salespeople's goals for that work type (scoping law).
  const goalByCell = new Map<string, GoalAgg>();     // `${personId}::${wtId}`
  const goalByPerson = new Map<string, GoalAgg>();   // personId
  const goalByWorkType = new Map<string, GoalAgg>(); // wtId
  let goalCompany: GoalAgg = { salesDollars: 0, marginDollars: 0 };
  const goalPersonIds = new Set<string>();
  const workTypeIds = new Set<string>();

  for (const g of goals || []) {
    if (g.year !== year) continue;
    const agg: GoalAgg = { salesDollars: g.goalSalesDollars, marginDollars: marginDollarsOf(g.goalSalesDollars, g.goalMarginPct) };
    addGoal(goalByCell, `${g.salespersonId}::${g.workTypeId}`, agg);
    addGoal(goalByPerson, g.salespersonId, agg);
    addGoal(goalByWorkType, g.workTypeId, agg);
    goalCompany = { salesDollars: goalCompany.salesDollars + agg.salesDollars, marginDollars: goalCompany.marginDollars + agg.marginDollars };
    goalPersonIds.add(g.salespersonId);
    workTypeIds.add(g.workTypeId);
  }

  // ── BOOKED = wins this year (ACCEPTED bucket only). A win with no salespersonId still counts in the
  // company + work-type totals (an honest company number) but belongs to no person row.
  const actualByCell = new Map<string, ActualAgg>();     // `${personId}::${wtId}`
  const actualByPerson = new Map<string, ActualAgg>();   // personId
  const actualByWorkType = new Map<string, ActualAgg>(); // wtId
  let actualCompany: ActualAgg = { salesDollars: 0, gpDollars: 0 };
  const actualPersonIds = new Set<string>();

  for (const r of rows || []) {
    if (r.bucket !== "ACCEPTED") continue;         // booked wins only
    if (rowYear(r.date) !== year) continue;        // scoped to the scorecard year
    const wtId = r.workTypeId || "";

    // ── THE GAVELED BONUS RULING (Tom, 2026-08-07) — WHERE THE BUCKETS PART WAYS ────────────────────
    // EXTRAS BELONG TO THE COMPANY, NOT TO A SALESPERSON. Two aggregates are built from one row:
    //
    //   companyAgg — the bid PLUS its released change orders. What the company booked.
    //   personAgg  — the bid ALONE. What this salesperson sold.
    //
    // A change order is money the company earned because a crew was already on site with the right
    // iron and the customer asked for more. Nobody closed it as a sale. Crediting it to the person who
    // sold the parent bid would inflate a personal number against a personal goal for work they did
    // not do — and, worse, would quietly pre-make a decision the gavel reserves for the owner: extras
    // are credited from a VISIBLE POOL, by a person, outside the software (Law 82). The Extras roll-up
    // is that pool; this split is what keeps it a pool instead of an automatic payout.
    //
    // RULED AND RE-RULED (Tom, 2026-08-07, confirmed on review the same day): extras appear on NO
    // personal row — NOT Booked, NOT Performed. Both exclusions below are DECIDED, not accidental, and
    // not an oversight from a build that only got round to one of them. A future reader finding that a
    // salesperson's Booked and Performed both omit extras is looking at the ruling, not a bug.
    //
    // IF YOU ARE HERE TO "FIX" A SALESPERSON'S TOTAL NOT MATCHING THE COMPANY TOTAL: that gap is the
    // extras, and it is the ruling working. The fence mutation-proves this exact line — credit the
    // change order to personAgg and it fails by name.
    const companyAgg: ActualAgg = {
      salesDollars: (r.bidAmount || 0) + (r.changeOrderRevenue || 0),
      gpDollars: (r.gpAtBid || 0) + (r.changeOrderGp || 0),
    };
    const personAgg: ActualAgg = { salesDollars: r.bidAmount || 0, gpDollars: r.gpAtBid || 0 };

    workTypeIds.add(wtId);
    addActual(actualByWorkType, wtId, companyAgg);
    actualCompany = {
      salesDollars: actualCompany.salesDollars + companyAgg.salesDollars,
      gpDollars: actualCompany.gpDollars + companyAgg.gpDollars,
    };
    if (r.salespersonId) {
      addActual(actualByCell, `${r.salespersonId}::${wtId}`, personAgg);
      addActual(actualByPerson, r.salespersonId, personAgg);
      actualPersonIds.add(r.salespersonId);
    }
  }

  // ── PERFORMED = recognized money this year. The gate is `r.actuals` — a row carries actuals ONLY when
  // deriveTrackerRows recognized it (Invoiced / Paid / legacy Completed). That is the one home of the
  // rule and it is NOT restated here: no status list, no bucket test, no fallback to the bid. A booked
  // win that has not been recognized has null actuals, is skipped by this loop, and therefore appears in
  // BOOKED and not in PERFORMED — which is the whole point of the two columns.
  const performedByCell = new Map<string, PerformedAgg>();     // `${personId}::${wtId}`
  const performedByPerson = new Map<string, PerformedAgg>();   // personId
  const performedByWorkType = new Map<string, PerformedAgg>(); // wtId
  let performedCompany: PerformedAgg = { ...EMPTY_PERFORMED };
  const performedPersonIds = new Set<string>();

  for (const r of rows || []) {
    const a = r.actuals;
    if (!a) continue;                              // not recognized — BOOKED only, never PERFORMED
    if (rowYear(r.date) !== year) continue;        // scoped to the scorecard year, same as booked
    const wtId = r.workTypeId || "";
    // GP counts only where the job's actual cost data is complete — deriveTrackerRows already nulls
    // gpDollars otherwise, so an incomplete job contributes its revenue and NOTHING to the margin.
    const costed = a.gpDollars !== null;
    const revenue = a.revenue || 0;

    // THE SAME BONUS RULING APPLIES HERE. `a.revenue` is the recognized bid PLUS its released change
    // orders (deriveTrackerRows, the one home of that sum) — so a personal PERFORMED cell would pick
    // up extras money through the back door if it used it unchanged. It does not.
    //
    //   companyAgg — recognized revenue as it stands: bid + released extras. The company earned it.
    //   personAgg  — the same figures with the extras REMOVED, leaving exactly the recognized frozen
    //                bid and the GP the bid itself earned. Both subtractions are exact, not estimates:
    //                a.revenue was built as totalRevenue + changeOrderRevenue, so taking
    //                changeOrderRevenue back off returns the bid; and a.gpDollars was built as
    //                (bid + coRevenue) − (bidCost + coCost), so taking the extras' GP back off leaves
    //                bid − bidCost. Removing the GP — not the revenue — is what keeps the person's
    //                margin honest now that the extras' cost is in the company subtraction.
    const coRevenue = r.changeOrderRevenue || 0;
    const coGp = r.changeOrderGp || 0;
    const personRevenue = revenue - coRevenue;
    const companyAgg: PerformedAgg = {
      salesDollars: revenue,
      costedSalesDollars: costed ? revenue : 0,
      gpDollars: costed ? (a.gpDollars as number) : 0,
      jobCount: 1,
      costedJobCount: costed ? 1 : 0,
    };
    const personAgg: PerformedAgg = {
      salesDollars: personRevenue,
      costedSalesDollars: costed ? personRevenue : 0,
      gpDollars: costed ? (a.gpDollars as number) - coGp : 0,
      jobCount: 1,
      costedJobCount: costed ? 1 : 0,
    };

    workTypeIds.add(wtId);
    addPerformed(performedByWorkType, wtId, companyAgg);
    performedCompany = {
      salesDollars: performedCompany.salesDollars + companyAgg.salesDollars,
      costedSalesDollars: performedCompany.costedSalesDollars + companyAgg.costedSalesDollars,
      gpDollars: performedCompany.gpDollars + companyAgg.gpDollars,
      jobCount: performedCompany.jobCount + companyAgg.jobCount,
      costedJobCount: performedCompany.costedJobCount + companyAgg.costedJobCount,
    };
    if (r.salespersonId) {
      addPerformed(performedByCell, `${r.salespersonId}::${wtId}`, personAgg);
      addPerformed(performedByPerson, r.salespersonId, personAgg);
      performedPersonIds.add(r.salespersonId);
    }
  }

  // ── Row set: every active roster salesperson, plus anyone carrying a goal or a booked win this year
  // (an off-roster / departed id still gets scored on their own book). Sorted by resolved name, then id.
  const salespersonIds = new Set<string>();
  for (const p of people || []) if (p.active && p.roles.includes("salesperson")) salespersonIds.add(p.id);
  for (const id of goalPersonIds) salespersonIds.add(id);
  for (const id of actualPersonIds) salespersonIds.add(id);
  for (const id of performedPersonIds) salespersonIds.add(id); // (a subset of actualPersonIds — kept explicit)

  const sortedWorkTypeIds = Array.from(workTypeIds).sort();
  const sortedPersonIds = Array.from(salespersonIds).sort((a, b) => {
    const na = (nameById.get(a) || a).toLowerCase();
    const nb = (nameById.get(b) || b).toLowerCase();
    return na < nb ? -1 : na > nb ? 1 : (a < b ? -1 : a > b ? 1 : 0);
  });

  const peopleRows: ScorecardPersonRow[] = sortedPersonIds.map((pid) => {
    const byWorkType: Record<string, ScorecardCell> = {};
    for (const wtId of sortedWorkTypeIds) {
      byWorkType[wtId] = buildCell(
        goalByCell.get(`${pid}::${wtId}`) ?? null,
        actualByCell.get(`${pid}::${wtId}`) ?? EMPTY_ACTUAL,
        performedByCell.get(`${pid}::${wtId}`) ?? EMPTY_PERFORMED
      );
    }
    return {
      salespersonId: pid,
      salesperson: nameById.get(pid) || pid,
      byWorkType,
      total: buildCell(
        goalByPerson.get(pid) ?? null,
        actualByPerson.get(pid) ?? EMPTY_ACTUAL,
        performedByPerson.get(pid) ?? EMPTY_PERFORMED
      ),
    };
  });

  const byWorkType: Record<string, ScorecardCell> = {};
  for (const wtId of sortedWorkTypeIds) {
    byWorkType[wtId] = buildCell(
      goalByWorkType.get(wtId) ?? null,
      actualByWorkType.get(wtId) ?? EMPTY_ACTUAL,
      performedByWorkType.get(wtId) ?? EMPTY_PERFORMED
    );
  }

  const companyTotal = buildCell(
    goalCompany.salesDollars > 0 || goalCompany.marginDollars > 0 ? goalCompany : null,
    actualCompany,
    performedCompany
  );

  return { year, workTypeIds: sortedWorkTypeIds, people: peopleRows, byWorkType, companyTotal };
}
