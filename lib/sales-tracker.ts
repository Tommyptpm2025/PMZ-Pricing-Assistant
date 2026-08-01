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
 *     (gaveled), per salesperson and both-direction totals. Goals are the boss's entered targets
 *     (Law 82); actuals are BOOKED wins. Every division guarded — this grid is incapable of the source
 *     workbook's #DIV/0! by construction. See computeScorecard for the scoping law.
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
  changeOrderRevenue?: number;
  // Loss capture.
  objection?: string;
}

export interface TrackerActuals {
  revenue: number;
  gpDollars: number | null;  // null when cost data is missing/incomplete — never negative-by-omission
  gpPercent: number | null;
}

// RULING (recorded at the join): a job's ACTUAL REVENUE = the frozen accepted bid (totalRevenue) plus
// approved change orders, RECOGNIZED ONLY when the job is realized money — Invoiced, Paid, or legacy
// Completed (all three are the Qualifying Set, Law 2). Earlier statuses stay blank — never zero, never
// an estimate (earned facts, Law 38 spirit). ACTUAL GP = actual revenue − the job's actual recorded
// cost, computed ONLY when that cost data is complete; otherwise GP is blank.
const REVENUE_RECOGNIZED: ReadonlySet<QuoteStatus> = new Set<QuoteStatus>(["Invoiced", "Paid", "Completed"]);

export interface TrackerRow {
  quoteId: string;
  date: string;
  jobName: string;
  customerId: string;
  customer: string;
  workType: string;     // denormalized work-type NAME (display)
  workTypeId: string;   // work-type ID — the join key for goals/scorecard ("" when a legacy row has none)
  bidAmount: number;    // frozen totalRevenue
  gpAtBid: number;      // gross profit $ at bid
  margin: number;       // gross profit % at bid
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
        const gpDollars = costKnown ? revenue - (q.actualCost as number) : null;
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

// ── SCORECARD — goals vs actuals, BY WORK TYPE ───────────────────────────────────────────────────────
//
// DEFINITION (read before touching the math): scorecard ACTUALS are BOOKED wins — what the salesperson
// SOLD. Sales dollars = the ACCEPTED-bucket bid amount (frozen totalRevenue, Law 56); GP is frozen at
// bid (gpAtBid). This is NOT the same as execution/recognition actuals — invoiced revenue and realized
// GP — which live on the tracker ROWS (TrackerRow.actuals) and on the scoreboard, NOT here. A win counts
// on the scorecard the moment it is accepted; how the job later executes is a different question.
//
// GOALS are the boss's entered targets (Law 82, PMZ Informs the Owner Decides) — never derived, never
// auto-adjusted. Goal margin dollars = goal sales dollars × goal margin percent.
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

// One cell of the grid: a (salesperson × work type) intersection, a person's total, a work-type total,
// or the company total. actual is always present (zeros when there are no wins) so the grid always
// renders; goal and every to-goal field are null when the boss set no goal for this cell.
export interface ScorecardCell {
  goal: ScorecardGoal | null;
  actual: ScorecardActual;
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

// Year of a tracker row's date (leading YYYY of the ISO string), or null when absent/unparseable — a
// row with no usable date can't be attributed to a scorecard year and is left out of it.
function rowYear(date: string): number | null {
  const m = /^(\d{4})/.exec(date || "");
  return m ? Number(m[1]) : null;
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

// Build one cell from a (possibly absent) goal and an actual. No goal → goal + every to-goal field is
// null (dash). Every division guarded: a zero denominator yields null, never NaN/Infinity, never 100%.
function buildCell(goal: GoalAgg | null, actual: ActualAgg): ScorecardCell {
  const actualMarginPct = actual.salesDollars > 0 ? (actual.gpDollars / actual.salesDollars) * 100 : null;
  const actualOut: ScorecardActual = {
    salesDollars: actual.salesDollars,
    gpDollars: actual.gpDollars,
    marginPct: actualMarginPct,
  };
  if (!goal) {
    return {
      goal: null,
      actual: actualOut,
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
    salesDeltaDollars: actual.salesDollars - goal.salesDollars,
    marginDeltaDollars: actual.gpDollars - goal.marginDollars,
    salesPercentToGoal: goal.salesDollars > 0 ? (actual.salesDollars / goal.salesDollars) * 100 : null,
    marginPercentToGoal: goal.marginDollars > 0 ? (actual.gpDollars / goal.marginDollars) * 100 : null,
  };
}

const EMPTY_ACTUAL: ActualAgg = { salesDollars: 0, gpDollars: 0 };

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

  // ── Actuals = BOOKED wins this year (ACCEPTED bucket only). A win with no salespersonId still counts
  // in the company + work-type totals (an honest company number) but belongs to no person row.
  const actualByCell = new Map<string, ActualAgg>();     // `${personId}::${wtId}`
  const actualByPerson = new Map<string, ActualAgg>();   // personId
  const actualByWorkType = new Map<string, ActualAgg>(); // wtId
  let actualCompany: ActualAgg = { salesDollars: 0, gpDollars: 0 };
  const actualPersonIds = new Set<string>();

  for (const r of rows || []) {
    if (r.bucket !== "ACCEPTED") continue;         // booked wins only
    if (rowYear(r.date) !== year) continue;        // scoped to the scorecard year
    const wtId = r.workTypeId || "";
    const agg: ActualAgg = { salesDollars: r.bidAmount || 0, gpDollars: r.gpAtBid || 0 };
    workTypeIds.add(wtId);
    addActual(actualByWorkType, wtId, agg);
    actualCompany = { salesDollars: actualCompany.salesDollars + agg.salesDollars, gpDollars: actualCompany.gpDollars + agg.gpDollars };
    if (r.salespersonId) {
      addActual(actualByCell, `${r.salespersonId}::${wtId}`, agg);
      addActual(actualByPerson, r.salespersonId, agg);
      actualPersonIds.add(r.salespersonId);
    }
  }

  // ── Row set: every active roster salesperson, plus anyone carrying a goal or a booked win this year
  // (an off-roster / departed id still gets scored on their own book). Sorted by resolved name, then id.
  const salespersonIds = new Set<string>();
  for (const p of people || []) if (p.active && p.roles.includes("salesperson")) salespersonIds.add(p.id);
  for (const id of goalPersonIds) salespersonIds.add(id);
  for (const id of actualPersonIds) salespersonIds.add(id);

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
        actualByCell.get(`${pid}::${wtId}`) ?? EMPTY_ACTUAL
      );
    }
    return {
      salespersonId: pid,
      salesperson: nameById.get(pid) || pid,
      byWorkType,
      total: buildCell(goalByPerson.get(pid) ?? null, actualByPerson.get(pid) ?? EMPTY_ACTUAL),
    };
  });

  const byWorkType: Record<string, ScorecardCell> = {};
  for (const wtId of sortedWorkTypeIds) {
    byWorkType[wtId] = buildCell(
      goalByWorkType.get(wtId) ?? null,
      actualByWorkType.get(wtId) ?? EMPTY_ACTUAL
    );
  }

  const companyTotal = buildCell(
    goalCompany.salesDollars > 0 || goalCompany.marginDollars > 0 ? goalCompany : null,
    actualCompany
  );

  return { year, workTypeIds: sortedWorkTypeIds, people: peopleRows, byWorkType, companyTotal };
}
