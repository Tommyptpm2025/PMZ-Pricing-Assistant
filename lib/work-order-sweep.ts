import { createJobFromQuote, loadJobs, saveJobs, type CreateJobInput, type Job } from "./jobs";
import { statusBucket } from "./sales-tracker";
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

// A quote SHOULD have a work order exactly when the tracker's status→bucket map puts it in the
// ACCEPTED bucket. DERIVED, never hand-listed: lib/sales-tracker.ts owns status semantics ("won is
// won, whatever stage the job is at now"), and a hand-copied set here could silently drift out of
// step with it — which is exactly how a status gets left out and the repair door never opens.
//
// Note for anyone reading a bug report: the STORED values are the QuoteStatus union ("Approved",
// "In Progress"); the words on screen are the STATUS_LABELS display names ("Accepted", "Work Order
// Active"). Never test a status against what the UI shows. The fence pins both sides of that map.
export function isSweepEligibleStatus(status: QuoteStatus): boolean {
  return statusBucket(status) === "ACCEPTED";
}

// The quote fields the sweep reads. SavedQuote is assignable to this (extra fields ignored). Every
// field is exactly the one the accept path reads for the same purpose — see workOrderInputFromQuote.
export interface SweepQuoteInput {
  id: string;
  quoteType?: "EPP" | "Full";
  status: QuoteStatus;
  jobName?: string;
  customerName?: string;
  customer?: string;
  customerId?: string;
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
    customerId: quote.customerId || undefined,
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
  return isSweepEligibleStatus(quote.status);
}

// Why a sweep created nothing. A repair that no-ops must be able to SAY why — the first version
// logged only on success, so "created nothing" and "never ran" looked identical from the console.
export interface WorkOrderSweepCounts {
  examined: number;      // quotes handed to the sweep
  eligible: number;      // …that are EPP and in the ACCEPTED bucket
  alreadyServed: number; // …that already own a job record (the healthy steady state)
  skippedNotEpp: number; // …refused for being Full/untyped
  skippedStatus: number; // …refused for not being Accepted-or-beyond
}

export interface WorkOrderSweepPlan {
  jobs: Job[];        // existing jobs (BY IDENTITY, untouched) followed by any newly created ones
  created: Job[];     // only the new records — empty when there was nothing to repair
  createdCount: number;
  counts: WorkOrderSweepCounts;
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
  const counts: WorkOrderSweepCounts = {
    examined: 0, eligible: 0, alreadyServed: 0, skippedNotEpp: 0, skippedStatus: 0,
  };
  for (const q of quotes || []) {
    counts.examined++;
    if (q.quoteType !== "EPP") { counts.skippedNotEpp++; continue; }
    if (!isSweepEligibleStatus(q.status)) { counts.skippedStatus++; continue; }
    counts.eligible++;
    if (claimed.has(q.id)) { counts.alreadyServed++; continue; } // absence of the job IS the condition
    const recipeLines = recipeLinesFromQuote(q, buildSections);
    created.push(createJobFromQuote(workOrderInputFromQuote(q, recipeLines)));
    claimed.add(q.id);                        // guard duplicate quote ids within a single sweep
  }

  return {
    jobs: created.length > 0 ? [...existing, ...created] : existing,
    created,
    createdCount: created.length,
    counts,
  };
}

// ── THE INVOCATION ────────────────────────────────────────────────────────────────────────────────
//
// THE DEFECT THIS EXISTS TO END: the sweep was fence-proved and still never ran. Its only caller was
// an effect on the Quotes page gated behind a "wait one effect pass for the rate catalogs" counter
// whose second pass depended on four arrays owned by ANOTHER hook changing identity — a condition the
// sweep neither controls nor can observe. Worse, the LOG LIVED INSIDE THAT GATE: an early return
// printed nothing, so "the repair ran and found nothing" and "the repair never ran" produced the
// identical empty console. The tripwire was inside the trap.
//
// So the invocation moved here, and the rules are now structural:
//   • ONE ENTRY POINT, called by every surface that reads jobs — never a copy of this body in a page.
//   • IT ALWAYS RUNS. No pass counter, no readiness gate, no precondition on any React state.
//   • IT ALWAYS LOGS, exactly once per call, on every path including failure. A MISSING
//     "[work-order-sweep] ran:" line can now only ever mean the function was NOT CALLED — which makes
//     an absent log a real diagnosis instead of an ambiguity.
//
// Idempotent by construction (absence of the job IS the condition), so calling it from two pages, or
// twice on one page, costs nothing and can never double-create.
//
// On the rate catalogs: they are a FALLBACK, never a precondition. Saved LEM entries carry their own
// bid-time `rate` and buildLineRecipeSections prefers it; a row with no stored rate and no catalog
// takes a 0 cost basis, which backfillRowCostBasis later fills at re-accept (it only ever fills a
// MISSING basis). A repair that happens with an imperfect basis beats a repair that never happens —
// that trade was already gaveled when the "rates must be non-empty" gate came out.

const SAVED_QUOTES_KEY = "pmz_saved_quotes";

function readSavedQuotes(): SweepQuoteInput[] {
  try {
    const raw = localStorage.getItem(SAVED_QUOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Run the self-healing work-order sweep against the live stores. Returns the plan it carried out, or
 * null if it could not run at all (no localStorage / a thrown read) — and SAYS which, every time.
 */
export function runWorkOrderSweep(buildSections: RecipeSectionBuilder): WorkOrderSweepPlan | null {
  if (typeof localStorage === "undefined") return null; // server render — not a run, nothing to say
  try {
    const plan = planWorkOrderSweep(readSavedQuotes(), loadJobs(), buildSections);
    if (plan.createdCount > 0) saveJobs(plan.jobs);
    const c = plan.counts;
    // UNCONDITIONAL. Every call prints exactly one of these two lines.
    if (plan.createdCount > 0) {
      console.log(
        `[work-order-sweep] ran: created ${plan.createdCount} missing work order${plan.createdCount === 1 ? "" : "s"} ` +
          `(${c.examined} quotes checked, ${c.eligible} accepted-or-later, ${c.alreadyServed} already had one).`
      );
    } else {
      console.log(
        `[work-order-sweep] ran: nothing to do (${c.examined} quotes checked, all have jobs or are ineligible — ` +
          `${c.eligible} accepted-or-later of which ${c.alreadyServed} already have one, ${c.skippedNotEpp} not EPP, ${c.skippedStatus} not yet accepted).`
      );
    }
    return plan;
  } catch (e) {
    console.error("[work-order-sweep] ran: FAILED — no work orders were created", e);
    return null;
  }
}
