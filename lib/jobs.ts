/**
 * PMZ Pricing Assistant — Jobs & Variance (Foreman actuals tracking)
 *
 * Job records are created by "Accepting" a Quote from Project Pricer.
 * The "Recipe" = planned LEM quantities captured at quote time.
 * Foreman enters Actuals (quantities used).
 * Variance Report compares planned vs actual at completion.
 * Data feeds learning loop for future bids.
 */

import type { Customer } from "./pmz-types";

export type LEMType = "labor" | "equipment" | "material";

/**
 * Intake context for the crew, snapshotted onto the Job at creation time so later edits to the
 * Customer don't silently change a job already in the field.
 *
 * Single-site for now (a Customer has one jobSiteAddress). A later step moves Customers to
 * many-sites-per-customer — but a Job is always at ONE site, so that change swaps how the site
 * is chosen at create time, not this snapshot shape. Keep it that way.
 */
export interface JobSite {
  address?: string;     // formatted single-line site address (distinct from billing)
  latitude?: number;
  longitude?: number;
  accessNotes?: string; // access / delivery instructions for the crew
}

export interface BidItemSnapshot {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

// --- Cost-stripped recipe snapshot (Foreman Work Order) -----------------------------------
//
// What the foreman actually works from: the planned recipe grouped per bid line and per crew,
// with NO cost/rate/$ anywhere on the model. Snapshotted at accept time so later rate or quote
// edits never change a work order already in the field. The foreman enters actualQty per row.

export interface JobRecipeRow {
  id: string;             // stable, generated at snapshot time
  name: string;           // role / asset / material name
  plannedQty: number;     // hours for labor/equipment, qty for material/misc
  unit: string;           // "hrs" | "Ton" | "SF" | …
  actualQty: number | null; // null = not yet entered by the foreman
}

export interface JobRecipeSection {
  title: string;   // "Labor" | "Equipment" | "Material" | "Misc" | "Crew: <name>"
  isCrew: boolean;
  rows: JobRecipeRow[];
}

export interface JobRecipeLine {
  id: string;        // stable, generated at snapshot time
  lineId: string;    // matches the source BidItem id
  description: string; // bid line description
  sections: JobRecipeSection[];
}

// Reserved for Build G — Job carries an `attachments` array that is always [] for now.
export interface JobAttachment {
  id: string;
  name: string;
  addedAt: string;
}

export interface Job {
  id: string;
  createdAt: string;
  completedAt?: string;
  status: "open" | "completed";

  // The accepted quote this work order was created from. Optional (demo jobs have none);
  // used to keep "Create Work Order" idempotent — one job per accepted quote.
  quoteId?: string;

  // Quote snapshot (what was sold / bid)
  jobName: string;
  customerName?: string; // snapshotted for the foreman work order header
  workTypeName: string;
  salesperson: string;
  contractValue: number; // the revenue bid / grand total accepted
  bidItems: BidItemSnapshot[];

  // Cost-stripped recipe the Foreman Work Order renders from: grouped per bid line + per crew,
  // each row carrying its own actualQty. No cost/rate/$ on this structure (see types above).
  recipeLines: JobRecipeLine[];

  // OWNER-ONLY cost basis: recipeLines row id -> bid-time unit cost (the rate we bid). Populated at
  // accept time from the recipe drafts; NEVER rendered on the Foreman View (the zero-dollars law
  // stands). It exists so the owner Estimate-vs-Actual panel can value actual quantities at the
  // rate we bid (v-2). Legacy jobs created before this field have it absent/empty — the owner
  // variance degrades to "cost basis unavailable", never a fabricated $0.
  rowCostBasis: Record<string, number>;

  // Reserved for Build G — always [] for now.
  attachments: JobAttachment[];

  // Intake context snapshotted from the quote's customer at create time (see JobSite).
  jobSite?: JobSite;
  intakeNotes?: string; // job-level intake notes from the customer record (≠ foreman `notes` below)

  // Optional free text — foreman's post-job notes (entered in the Foreman View)
  notes?: string;
}

export const JOBS_STORAGE_KEY = "pmz_jobs_v1";

export function createId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function loadJobs(): Job[] {
  try {
    const raw = localStorage.getItem(JOBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveJobs(jobs: Job[]): void {
  try {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // ignore storage errors
  }
}

// Single-line site address from a structured address-ish object. Mirrors the Pricer/PDF address
// formatting (street, city, state, zip) but collapsed to one line for the work order.
function formatSiteAddressLine(
  a:
    | { street?: string; street2?: string; city?: string; state?: string; stateCode?: string; zip?: string }
    | null
    | undefined
): string | undefined {
  if (!a) return undefined;
  const line1 = [a.street, a.street2].filter((s) => s && s.trim()).join(", ");
  const region = [a.city, a.state || a.stateCode].filter((s) => s && String(s).trim()).join(", ");
  const tail = [region, a.zip].filter((s) => s && String(s).trim()).join(" ").trim();
  const full = [line1, tail].filter((s) => s && s.trim()).join(", ").trim();
  return full || undefined;
}

/**
 * Build a JobSite snapshot from the linked Customer's jobSiteAddress (preferred — it carries GPS +
 * access notes), falling back to the quote's denormalized site string for the address only.
 * Returns undefined when there's nothing usable, so callers can store `jobSite` only when real.
 *
 * This is the one place that "pulls" site context from a Customer — the many-sites rework later
 * only has to change what gets passed in here, not the Job shape or the Foreman View.
 */
export function jobSiteFromCustomer(
  customer: Pick<Customer, "jobSiteAddress"> | null | undefined,
  fallbackAddress?: string
): JobSite | undefined {
  const site = customer?.jobSiteAddress;
  const address = formatSiteAddressLine(site) || (fallbackAddress?.trim() || undefined);
  const latitude = site?.latitude;
  const longitude = site?.longitude;
  const accessNotes = site?.accessNotes?.trim() || undefined;
  if (!address && latitude == null && longitude == null && !accessNotes) return undefined;
  return { address, latitude, longitude, accessNotes };
}

export interface CreateJobInput {
  quoteId?: string;
  jobName: string;
  customerName?: string;
  workTypeName: string;
  salesperson: string;
  contractValue: number;
  bidItems: BidItemSnapshot[];
  // Cost-BEARING per-line recipe drafts (from buildLineRecipeSections) — stamped with stable ids
  // here. Structurally matches RecipeSectionDraft/RecipeRowDraft from lib/lem-detail (kept inline
  // so the model file stays decoupled from the resolver). Each row's `unitCost` is peeled into the
  // owner-only rowCostBasis; the persisted foreman row is built WITHOUT it (cost-stripped).
  recipeLines: Array<{
    lineId: string;
    description: string;
    sections: Array<{
      title: string;
      isCrew: boolean;
      rows: Array<{ name: string; plannedQty: number; unit: string; unitCost: number }>;
    }>;
  }>;
  // Intake context source — snapshotted onto the job at create time. Pass the linked Customer
  // record (preferred: carries GPS + access notes + free-text notes) and/or the quote's
  // denormalized site string (quote.customerDetails?.jobSiteAddress / quote.jobSiteAddress).
  customer?: Pick<Customer, "jobSiteAddress" | "notes"> | null;
  quoteJobSiteAddress?: string;
}

export function createJobFromQuote(input: CreateJobInput): Job {
  const now = new Date().toISOString();

  // Stamp stable ids onto every recipe line + row; actuals start null (not yet entered). As each
  // row id is minted, peel the draft's bid-time unitCost into the owner-only rowCostBasis and build
  // the persisted foreman row WITHOUT cost (the Foreman View stays zero-dollars by construction).
  const rowCostBasis: Record<string, number> = {};
  const recipeLines: JobRecipeLine[] = input.recipeLines.map((line) => ({
    id: createId(),
    lineId: line.lineId,
    description: line.description,
    sections: line.sections.map((section) => ({
      title: section.title,
      isCrew: section.isCrew,
      rows: section.rows.map((row) => {
        const id = createId();
        rowCostBasis[id] = Math.max(0, row.unitCost || 0);
        return {
          id,
          name: row.name,
          plannedQty: Math.max(0, row.plannedQty),
          unit: row.unit,
          actualQty: null,
        };
      }),
    })),
  }));

  // Snapshot intake context from the customer/quote at the moment the job is created.
  const jobSite = jobSiteFromCustomer(input.customer, input.quoteJobSiteAddress);
  const intakeNotes = input.customer?.notes?.trim() || undefined;

  return {
    id: createId(),
    createdAt: now,
    status: "open",
    quoteId: input.quoteId,
    jobName: input.jobName.trim() || "Untitled Job",
    customerName: input.customerName?.trim() || undefined,
    workTypeName: input.workTypeName,
    salesperson: input.salesperson,
    contractValue: Math.max(0, input.contractValue),
    bidItems: input.bidItems.map((b) => ({ ...b })),
    recipeLines,
    rowCostBasis,
    attachments: [],
    jobSite,
    intakeNotes,
    notes: "",
  };
}

// Foreman actuals entry against the cost-stripped recipe: set one row's actualQty by row id.
// Pass null to clear a row back to "not yet entered"; negatives are floored to 0.
export function updateRecipeRowActual(
  jobs: Job[],
  jobId: string,
  rowId: string,
  actualQty: number | null
): Job[] {
  return jobs.map((job) => {
    if (job.id !== jobId) return job;
    return {
      ...job,
      recipeLines: (job.recipeLines || []).map((line) => ({
        ...line,
        sections: line.sections.map((section) => ({
          ...section,
          rows: section.rows.map((row) =>
            row.id === rowId
              ? { ...row, actualQty: actualQty == null ? null : Math.max(0, actualQty) }
              : row
          ),
        })),
      })),
    };
  });
}

export function setJobNotes(jobs: Job[], jobId: string, notes: string): Job[] {
  return jobs.map((job) =>
    job.id === jobId ? { ...job, notes } : job
  );
}

export function completeJob(jobs: Job[], jobId: string): Job[] {
  const now = new Date().toISOString();
  return jobs.map((job) =>
    job.id === jobId && job.status !== "completed"
      ? { ...job, status: "completed" as const, completedAt: now }
      : job
  );
}

export function reopenJob(jobs: Job[], jobId: string): Job[] {
  return jobs.map((job) =>
    job.id === jobId && job.status === "completed"
      ? { ...job, status: "open" as const, completedAt: undefined }
      : job
  );
}

export function deleteJob(jobs: Job[], jobId: string): Job[] {
  return jobs.filter((j) => j.id !== jobId);
}

// ── Owner Estimate-vs-Actual variance ────────────────────────────────────────────────────────
//
// OWNER-ONLY. Values the foreman's actual quantities (recipeLines[].actualQty) at the BID-TIME
// unit cost snapshot (rowCostBasis) — the number answers "what did the drift cost us at the rates
// we bid" (v-2), NOT what rates later moved to.
//
// Two invariants this engine exists to hold, both from the Book:
//   1. A null actualQty means "not yet reported by the foreman" and is EXCLUDED from actual $ —
//      never valued as $0. Collapsing null→0 would fabricate a foreman's confirmation.
//   2. Actual $ is valued at rowCostBasis (bid-time), never a re-resolved live rate.
// The gap is computed like-for-like: actual minus planned over the REPORTED rows only, so a
// partially-reported job never shows a misleading shortfall against the full plan.

export interface OwnerVarianceRow {
  rowId: string;
  name: string;
  unit: string;
  plannedQty: number;
  actualQty: number | null;   // null = not yet reported
  unitCost: number;           // bid-time basis
  plannedCost: number;        // plannedQty × unitCost
  actualCost: number | null;  // actualQty × unitCost, or null when not reported (never fabricated 0)
  reported: boolean;
}

export interface OwnerVarianceLine {
  lineId: string;
  description: string;
  rows: OwnerVarianceRow[];
  plannedTotal: number;       // over ALL rows (planned is always known)
  plannedReported: number;    // over reported rows only (for like-for-like gap)
  actualReported: number;     // over reported rows only
  gap: number;                // actualReported − plannedReported (drift on reported work; +over/−under)
  reportedCount: number;
  totalRows: number;
  fullyReported: boolean;
  anyReported: boolean;
}

export type OwnerVariance =
  | { available: false }      // legacy job: no rowCostBasis — cannot value actuals honestly
  | {
      available: true;
      lines: OwnerVarianceLine[];
      plannedTotal: number;
      plannedReported: number;
      actualReported: number;
      gap: number;
      reportedCount: number;
      totalRows: number;
      fullyReported: boolean;
      anyReported: boolean;
    };

export function computeOwnerVariance(job: Job): OwnerVariance {
  const basis = job.rowCostBasis;
  // Legacy jobs (created before the cost basis existed) cannot be valued without fabricating.
  if (!basis || Object.keys(basis).length === 0) return { available: false };

  const lines: OwnerVarianceLine[] = (job.recipeLines || []).map((line) => {
    const rows: OwnerVarianceRow[] = line.sections.flatMap((section) =>
      section.rows.map((row) => {
        const unitCost = basis[row.id] ?? 0;
        const reported = row.actualQty != null;
        const plannedCost = row.plannedQty * unitCost;
        return {
          rowId: row.id,
          name: row.name,
          unit: row.unit,
          plannedQty: row.plannedQty,
          actualQty: row.actualQty,
          unitCost,
          plannedCost,
          // null stays null — an unreported row contributes NOTHING to actual $ (never a fake 0).
          actualCost: reported ? (row.actualQty as number) * unitCost : null,
          reported,
        };
      })
    );
    const reportedRows = rows.filter((r) => r.reported);
    const plannedTotal = rows.reduce((s, r) => s + r.plannedCost, 0);
    const plannedReported = reportedRows.reduce((s, r) => s + r.plannedCost, 0);
    const actualReported = reportedRows.reduce((s, r) => s + (r.actualCost as number), 0);
    return {
      lineId: line.lineId,
      description: line.description,
      rows,
      plannedTotal,
      plannedReported,
      actualReported,
      gap: actualReported - plannedReported,
      reportedCount: reportedRows.length,
      totalRows: rows.length,
      fullyReported: rows.length > 0 && reportedRows.length === rows.length,
      anyReported: reportedRows.length > 0,
    };
  });

  const plannedTotal = lines.reduce((s, l) => s + l.plannedTotal, 0);
  const plannedReported = lines.reduce((s, l) => s + l.plannedReported, 0);
  const actualReported = lines.reduce((s, l) => s + l.actualReported, 0);
  const totalRows = lines.reduce((s, l) => s + l.totalRows, 0);
  const reportedCount = lines.reduce((s, l) => s + l.reportedCount, 0);
  return {
    available: true,
    lines,
    plannedTotal,
    plannedReported,
    actualReported,
    gap: actualReported - plannedReported,
    reportedCount,
    totalRows,
    fullyReported: totalRows > 0 && reportedCount === totalRows,
    anyReported: reportedCount > 0,
  };
}
