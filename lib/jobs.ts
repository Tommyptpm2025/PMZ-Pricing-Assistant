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

export interface JobLEMItem {
  id: string;
  type: LEMType;
  description: string;
  plannedQty: number;
  unitCost: number; // captured at accept time from profile rates
}

export interface BidItemSnapshot {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface Job {
  id: string;
  createdAt: string;
  completedAt?: string;
  status: "open" | "completed";

  // Quote snapshot (what was sold / bid)
  jobName: string;
  workTypeName: string;
  salesperson: string;
  contractValue: number; // the revenue bid / grand total accepted
  bidItems: BidItemSnapshot[];

  // The "Recipe" — planned LEM quantities (what foreman sees)
  recipe: JobLEMItem[];

  // Actuals entered by foreman: map of recipe item id -> actual quantity used
  actuals: Record<string, number>;

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
  jobName: string;
  workTypeName: string;
  salesperson: string;
  contractValue: number;
  bidItems: BidItemSnapshot[];
  recipe: Array<{
    type: LEMType;
    description: string;
    quantity: number;
    unitCost: number;
  }>;
  // Intake context source — snapshotted onto the job at create time. Pass the linked Customer
  // record (preferred: carries GPS + access notes + free-text notes) and/or the quote's
  // denormalized site string (quote.customerDetails?.jobSiteAddress / quote.jobSiteAddress).
  customer?: Pick<Customer, "jobSiteAddress" | "notes"> | null;
  quoteJobSiteAddress?: string;
}

export function createJobFromQuote(input: CreateJobInput): Job {
  const now = new Date().toISOString();
  const recipe: JobLEMItem[] = input.recipe.map((r) => ({
    id: createId(),
    type: r.type,
    description: r.description,
    plannedQty: Math.max(0, r.quantity),
    unitCost: Math.max(0, r.unitCost),
  }));

  const actuals: Record<string, number> = {};
  recipe.forEach((item) => {
    actuals[item.id] = 0;
  });

  // Snapshot intake context from the customer/quote at the moment the job is created.
  const jobSite = jobSiteFromCustomer(input.customer, input.quoteJobSiteAddress);
  const intakeNotes = input.customer?.notes?.trim() || undefined;

  return {
    id: createId(),
    createdAt: now,
    status: "open",
    jobName: input.jobName.trim() || "Untitled Job",
    workTypeName: input.workTypeName,
    salesperson: input.salesperson,
    contractValue: Math.max(0, input.contractValue),
    bidItems: input.bidItems.map((b) => ({ ...b })),
    recipe,
    actuals,
    jobSite,
    intakeNotes,
    notes: "",
  };
}

export function updateJobActual(jobs: Job[], jobId: string, recipeItemId: string, actualQty: number): Job[] {
  return jobs.map((job) =>
    job.id === jobId
      ? {
          ...job,
          actuals: {
            ...job.actuals,
            [recipeItemId]: Math.max(0, actualQty),
          },
        }
      : job
  );
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

// Variance helpers for reports
export interface VarianceLine {
  id: string;
  type: LEMType;
  description: string;
  plannedQty: number;
  actualQty: number;
  unitCost: number;
  plannedCost: number;
  actualCost: number;
  qtyDelta: number;
  costDelta: number;
  costVariancePct: number; // (act - plan)/plan *100 , handle 0
}

export function computeVariance(job: Job): VarianceLine[] {
  return job.recipe.map((item) => {
    const actualQty = job.actuals[item.id] ?? 0;
    const plannedCost = item.plannedQty * item.unitCost;
    const actualCost = actualQty * item.unitCost;
    const qtyDelta = actualQty - item.plannedQty;
    const costDelta = actualCost - plannedCost;
    const costVariancePct = plannedCost > 0 ? (costDelta / plannedCost) * 100 : 0;
    return {
      id: item.id,
      type: item.type,
      description: item.description,
      plannedQty: item.plannedQty,
      actualQty,
      unitCost: item.unitCost,
      plannedCost,
      actualCost,
      qtyDelta,
      costDelta,
      costVariancePct,
    };
  });
}

export function summarizeVariance(lines: VarianceLine[]) {
  const plannedTotal = lines.reduce((s, l) => s + l.plannedCost, 0);
  const actualTotal = lines.reduce((s, l) => s + l.actualCost, 0);
  const delta = actualTotal - plannedTotal;
  const variancePct = plannedTotal > 0 ? (delta / plannedTotal) * 100 : 0;
  return { plannedTotal, actualTotal, delta, variancePct };
}
