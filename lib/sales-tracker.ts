import type { QuoteStatus } from "./pmz-types";
import type { Person } from "./people";

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
  // Job actuals — present once the job produces them. RULING: actuals come from the JOB, not the quote
  // (Law 9 — born where work happens). Step 2's call site joins the quote to its job and passes these
  // in; a quote with no linked job has null actuals, shown honestly. Quotes never gain actual-cost fields.
  actualRevenue?: number;
  actualGpDollars?: number;
  actualGpPercent?: number;
  // Loss capture.
  objection?: string;
}

export interface TrackerActuals {
  revenue: number;
  gpDollars: number;
  gpPercent: number;
}

export interface TrackerRow {
  quoteId: string;
  date: string;
  jobName: string;
  customerId: string;
  customer: string;
  workType: string;
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
      const actuals: TrackerActuals | null =
        typeof q.actualRevenue === "number"
          ? { revenue: q.actualRevenue, gpDollars: q.actualGpDollars ?? 0, gpPercent: q.actualGpPercent ?? 0 }
          : null;
      return {
        quoteId: q.id,
        date: nonEmpty(q.createdAt) || nonEmpty(q.updatedAt) || "",
        jobName: nonEmpty(q.jobName) || "—",
        customerId: nonEmpty(q.customerId),
        customer: nonEmpty(q.customerName) || nonEmpty(q.customer) || "—",
        workType: nonEmpty(q.workType) || nonEmpty(q.workTypeId) || "—",
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
