import { createJobFromQuote, type CreateJobInput, type Job } from "./jobs";
import type { QuoteStatus } from "./pmz-types";

/**
 * WORK-ORDER SWEEP — self-healing repair for quotes that reached Accepted-or-beyond without a job
 * record. PURE: no storage, no React. Callers pass data in.
 *
 * RULING (why this exists and what it is NOT): create-at-accept remains the BIRTH path. A job record
 * is born when a quote is accepted (app/quotes/page.tsx — recordDecision / the super-user jump). This
 * sweep does not add a second birthplace; it REPAIRS the population that predates that path or that
 * reached a late status by some other route (imported quotes, super-user jumps past Approved, quotes
 * accepted before work-order creation existed). Every job it makes comes out of the SAME
 * createJobFromQuote call the accept path uses, fed by the SAME mapping (workOrderInputFromQuote
 * below) — reused, not copied, so the two can never drift apart.
 *
 * IDEMPOTENT BY CONSTRUCTION — no flag, no ran-once key. The condition IS the absence of a job with
 * quoteId = quote.id, so a second run over the swept data finds nothing to do. That is deliberately
 * unlike the one-shot backfills (people attribution, work-type re-pointing), which need a flag
 * because their condition is erased by their own success. This one's condition is self-evident, so
 * a flag would only be another thing that can go stale or burn early.
 *
 * NEVER: creates a duplicate · touches an existing job record (existing objects come back by
 * identity) · modifies the quote in any way (this module cannot — it takes quotes as read-only input
 * and returns only jobs).
 */

// Statuses at which a work order legitimately SHOULD exist: Accepted and everything after it, plus
// the retired legacy "Completed" (a won, finished job — it is realized work and wants its record).
//
// Deliberately NOT the same list as WORK_ORDER_STATUSES in app/quotes/page.tsx. That one answers a
// display question — "may we show the work-order indicator for this quote" — and excludes the legacy
// Completed status. This one answers "should this quote HAVE a work order," which includes it. Two
// different questions; keeping them separate stops a display tweak from silently changing what the
// sweep creates.
export const WORK_ORDER_ELIGIBLE_STATUSES: ReadonlySet<QuoteStatus> = new Set<QuoteStatus>([
  "Approved",         // label "Accepted" — the birth point of the accept path
  "Scheduled",
  "In Progress",
  "Ready to Invoice",
  "Invoiced",
  "Paid",
  "Completed",        // legacy/terminal — a won, finished job
]);

// The quote fields the sweep reads. SavedQuote is assignable to this (extra fields ignored). Every
// field is exactly the one the accept path reads for the same purpose — see workOrderInputFromQuote.
export interface SweepQuoteInput {
  id: string;
  quoteType?: "EPP" | "Full";
  status: QuoteStatus;
  jobName?: string;
  customerName?: string;
  customer?: string;
  workType?: string;
  salesperson?: string;
  grandTotal?: number;
  totalRevenue?: number;
  jobSiteAddress?: string;
  customerDetails?: { jobSiteAddress?: string };
  eppLineItems?: Array<{
    id: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }>;
}

// Builds the cost-BEARING recipe sections for one bid line. Injected rather than imported because
// resolving a row's bid-time unit cost needs the live rate catalogs (a React store); keeping it a
// parameter is what lets this module stay pure and lets the fence drive it with fixtures.
export type RecipeSectionBuilder = (item: unknown) => CreateJobInput["recipeLines"][number]["sections"];

/**
 * Per-line recipe drafts for a quote — the shape createJobFromQuote peels unitCost out of. Shared by
 * the accept path and the sweep so a change to how a quote becomes a recipe lands in both at once.
 */
export function recipeLinesFromQuote(
  quote: SweepQuoteInput,
  buildSections: RecipeSectionBuilder
): CreateJobInput["recipeLines"] {
  return (quote.eppLineItems || []).map((it) => ({
    lineId: it.id,
    description: it.description,
    sections: buildSections(it),
  }));
}

/**
 * The ONE quote → CreateJobInput mapping. Both the accept path and the sweep call this, so a job
 * created by repair is indistinguishable from one created at accept — same fields, same fallbacks,
 * same frozen contract value.
 */
export function workOrderInputFromQuote(
  quote: SweepQuoteInput,
  recipeLines: CreateJobInput["recipeLines"]
): CreateJobInput {
  return {
    quoteId: quote.id,
    jobName: quote.jobName || "",
    customerName: quote.customerName || quote.customer || undefined,
    workTypeName: quote.workType || "",
    salesperson: quote.salesperson || "",
    contractValue: quote.grandTotal ?? quote.totalRevenue ?? 0,
    bidItems: (quote.eppLineItems || []).map((it) => ({
      id: it.id,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
    })),
    recipeLines,
    quoteJobSiteAddress: quote.jobSiteAddress || quote.customerDetails?.jobSiteAddress,
  };
}

/**
 * Is this quote one that SHOULD have a work order? EPP only — Full-LEM quotes never get a job
 * record, exactly as the accept path refuses them (`if (quote.quoteType !== "EPP") return false`).
 * A Draft, a quote still out for acceptance, a Declined or a Lost quote is not eligible: it has no
 * accepted work to run. The status gate is the eligible set above.
 */
export function isWorkOrderEligible(quote: SweepQuoteInput): boolean {
  if (quote.quoteType !== "EPP") return false;
  return WORK_ORDER_ELIGIBLE_STATUSES.has(quote.status);
}

export interface WorkOrderSweepPlan {
  jobs: Job[];        // existing jobs (BY IDENTITY, untouched) followed by any newly created ones
  created: Job[];     // only the new records — empty when there was nothing to repair
  createdCount: number;
}

/**
 * Plan the sweep: one new job for every eligible quote that has none, built through the existing
 * creation path. Existing jobs are passed through by reference — this never rewrites, reorders, or
 * re-stamps a record that already exists, including demo jobs (no quoteId) which match nothing and
 * are simply carried along.
 */
export function planWorkOrderSweep(
  quotes: SweepQuoteInput[],
  jobs: Job[],
  buildSections: RecipeSectionBuilder
): WorkOrderSweepPlan {
  const existing = jobs || [];
  // Every quote id that already owns a work order. Demo jobs carry no quoteId and join nothing.
  const claimed = new Set<string>();
  for (const j of existing) if (j.quoteId) claimed.add(j.quoteId);

  const created: Job[] = [];
  for (const q of quotes || []) {
    if (!isWorkOrderEligible(q)) continue;
    if (claimed.has(q.id)) continue;          // already has one — absence of the job IS the condition
    const recipeLines = recipeLinesFromQuote(q, buildSections);
    created.push(createJobFromQuote(workOrderInputFromQuote(q, recipeLines)));
    claimed.add(q.id);                        // guard duplicate quote ids within a single sweep
  }

  return { jobs: created.length > 0 ? [...existing, ...created] : existing, created, createdCount: created.length };
}
