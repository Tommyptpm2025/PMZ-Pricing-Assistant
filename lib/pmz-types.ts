export type Bucket = "direct" | "indirect";

export interface Customer {
  id: string;
  name: string;                    // Company or contact name
  contactName?: string;            // Primary contact person
  title?: string;                  // Title / Role
  isDecisionMaker?: boolean;       // Is the contact the decision-maker?
  signsOff?: string;               // Who actually signs (when contact is not the decision-maker)
  phone?: string;
  mobile?: string;
  email?: string;
  preferredContact?: "Phone" | "Mobile" | "Email" | "Text";
  bestTimeToReach?: string;          // 24-hour "HHMM" (e.g. "0930"); legacy values may be text
  website?: string;
  // The actual decision-maker / point of contact, captured when the primary contact is NOT the
  // decision-maker. A distinct fact from the primary contact (the export keeps them separate).
  decisionMakerContact?: {
    name?: string;
    title?: string;
    phone?: string;
    mobile?: string;
    email?: string;
    preferredContact?: "Phone" | "Mobile" | "Email" | "Text";
  };
  // Legacy: a generic "alternate contact" from an earlier iteration. No longer written; values are
  // migrated into decisionMakerContact on edit. Kept optional so old records still type-check.
  altContact?: {
    name?: string;
    title?: string;
    phone?: string;
    mobile?: string;
    email?: string;
    preferredContact?: "Phone" | "Mobile" | "Email" | "Text";
  };
  billingAddress?: {
    street?: string;
    street2?: string;
    city?: string;
    state?: string;                // full name (CRM export matches on the name)
    stateCode?: string;            // 2-letter code
    zip?: string;
    country?: string;              // full name
    countryCode?: string;          // 2-letter ISO code
  };
  jobSiteAddress?: {
    street?: string;
    street2?: string;
    city?: string;
    state?: string;                // full name
    stateCode?: string;            // 2-letter code
    zip?: string;
    country?: string;              // full name
    countryCode?: string;          // 2-letter ISO code
    latitude?: number;
    longitude?: number;
    accessNotes?: string;
  };
  paymentTerms?: "Due on receipt" | "Net 15" | "Net 30" | "Net 60" | "COD";
  apContact?: string;              // AP / billing contact if different
  externalIds?: {
    odoo?: string;
    quickbooks?: string;
    sage?: string;
  };
  tags?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Type for Customer selector state (for dropdowns, search, etc. in Project Pricer and future Customers tab)
export interface CustomerSelectorState {
  selectedCustomerId: string | null;
  searchQuery: string;
  isOpen: boolean;
}

export interface LaborRate {
  id: string;
  role: string;
  baseWage: number;

  // Direct burden (bucket: direct)
  payrollTaxPercent: number;
  ptoPercent: number;
  workersCompPer100: number;
  generalLiabilityPer1000Hrs: number;
  fixedFringesPerHour: number;

  // Indirect burden (bucket: indirect)
  supervisionPercent: number;

  // Utilization
  downtimePercent: number;
  perDiemPerHour?: number;

  workTypeTags: string[];
  updatedAt: Date;
}

export interface EquipmentYear {
  year: number;
  estimatedHours: number;
  actualHours?: number;
  closed?: boolean;
  depreciationTarget?: number;
  ownershipTarget?: number;
  operatingTarget?: number;
}

export interface EquipmentRate {
  id: string;
  name: string;
  assetTag?: string;
  category?: string;

  depreciation: {
    inServiceDate: Date;
    endOfLifeDate: Date;
    purchaseValue: number;
    salvageValue: number;
  };

  ownershipAnnual: {
    insurance: number;
    taxLicense: number;
    interestFinancing: number;
    miscStorageTransport: number;
    other: number;
  };

  operatingAnnual: {
    maintenanceRepairs: number;
    fuelEnergy: number;
    wearItems: number;
    other?: number;
  };

  years: EquipmentYear[];
  updatedAt: Date;
}

export interface MaterialRate {
  id: string;
  name: string;
  unit: string;
  baseCostPerUnit: number;
  freightPerUnit: number;
  supplier?: string;
  notes?: string;
  wasteFactorPercent?: number;
  updatedAt: Date;
}

export interface PricingTier {
  id: string;
  low: number;
  high: number | null;
  targetGpPercent: number;
}

export interface WorkType {
  id: string;
  name: string;
  pricingTiers: PricingTier[];
  overheadAllocationDriver?: "fieldHours" | "revenue" | "directCost";
  description?: string;
}

// Per-line LEM detail carried by an EPP bid line (the unified line model's costing detail).
// Field names mirror the Project Pricer's BidItem so a line round-trips through save without remapping.
export interface LaborEntry {
  rateId?: string;
  labor?: { id: string; role: string; burdenedHourlyRate: number };
  hours?: number;
  rate?: number;
  group?: { id: string; crewId: string; name: string };
}
export interface EquipmentEntry {
  rateId?: string;
  hours?: number;
  rate?: number;
  group?: { id: string; crewId: string; name: string };
}
export interface MaterialEntry {
  rateId?: string;
  quantity?: number;
}
export interface MiscEntry {
  rateId?: string;
  description?: string;
  quantity?: number;
  rate?: number;
}
export interface CrewUsage {
  crewId: string;
  hours?: number;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  // Per-line LEM detail (EPP). Optional: a scope-only line may have none yet.
  priceOverridden?: boolean;
  laborEntries?: LaborEntry[];
  equipmentEntries?: EquipmentEntry[];
  materialEntries?: MaterialEntry[];
  miscellaneousEntries?: MiscEntry[];
  crewUsages?: CrewUsage[];
}

export interface LemItem {
  id: string;
  resourceType: "labor" | "equipment" | "material";
  rateId: string;
  label: string;
  quantity: number;
  frozenUnitCost: number;
  bucket: Bucket;
}

// Full lifecycle a quote/job can move through, in forward order. STORED values are stable: the
// display labels live in STATUS_LABELS. "Scheduled" sits between Accepted (Approved) and Work
// Order Active (In Progress). "Completed" is RETIRED from the active flow but kept in the union so
// any quote persisted under the old lifecycle still type-checks and renders.
export type QuoteStatus =
  | "Draft"
  | "Ready for Approval"
  | "Approved"
  | "Declined"
  | "Scheduled"
  | "In Progress"
  | "Ready to Invoice"
  | "Invoiced"
  | "Paid"
  | "Completed"; // legacy — no longer part of the forward flow

// One entry per status change, appended in order. `at` is an ISO timestamp string.
export interface StatusHistoryEntry {
  status: QuoteStatus;
  at: string;
}

// Single source of truth for a persisted quote record ('pmz_saved_quotes').
// This merges the two historical SavedQuote definitions (this one + the former
// lib/quote-job-types.ts one) into one type. Field names and the on-disk JSON
// shape are unchanged; legacy/divergent fields are kept as optional so the type
// fully describes every persisted record without altering storage.
export interface SavedQuote {
  id: string;
  quoteType: "EPP" | "Full";
  jobName: string;
  customerId: string;
  workTypeId: string;
  salesperson: string;
  status: QuoteStatus;
  locked: boolean;

  // Ordered audit trail of status changes. Initialized with the current status
  // when a quote is first saved; one entry appended on every status change.
  statusHistory: StatusHistoryEntry[];

  // Acceptance-workflow fields (set as a quote moves through the lifecycle).
  sentAt?: string;        // when the bid was sent for acceptance (ISO)
  decidedAt?: string;     // when the customer's decision was recorded (ISO)
  decisionNote?: string;  // optional short note saved with the decision

  eppLineItems: LineItem[];
  proLemItems: LemItem[];

  targetGpPercent: number;
  targetGpSource: { workTypeId: string; pricingTierId: string };

  totalRevenue: number;
  directCogsDollars: number;
  indirectCogsDollars: number;
  grossProfitDollars: number;
  grossProfitPercent: number;

  // Fields merged from the legacy quote-job-types.SavedQuote so this one type
  // describes the whole persisted record. Optional because not every writer
  // populates them (the storage format itself is unchanged).
  customer: string;             // denormalized customer name (quote-storage path)
  workType: string;             // denormalized work-type name (quote-storage path)
  targetMargin?: number;        // legacy alias for targetGpPercent
  rateProfileSnapshot?: { labor: number; equipment: number; material: number };
  quoteNumber?: string;
  termsText?: string | null;

  // Denormalized snapshot fields written by the Project Pricer save path, kept so
  // this one type fully describes the persisted record (storage format unchanged).
  customerName?: string;
  billingAddress?: string;
  jobSiteAddress?: string;
  customerDetails?: { id?: string; name?: string; billingAddress?: string; jobSiteAddress?: string };
  grossProfitAmount?: number;
  grandTotal?: number;

  createdAt: string;            // ISO timestamp (persisted format)
  updatedAt: string;            // ISO timestamp (persisted format)
}

// Legal transitions. The UI may only move a quote to one of the statuses listed for its current
// status. The happy path is Draft → Sent for Acceptance → Accepted → Scheduled → Work Order
// Active → Ready to Invoice → Invoiced → Paid. "Declined" branches off Sent for Acceptance and
// back-routes to Draft (revise & resubmit) or Sent for Acceptance (re-send). "Paid" is terminal.
// "Completed" is a retired legacy status (terminal here); use the super-user jump to move one.
export const STATUS_FLOW: Record<QuoteStatus, QuoteStatus[]> = {
  "Draft": ["Ready for Approval"],
  "Ready for Approval": ["Approved", "Declined"],
  "Approved": ["Scheduled"],
  "Declined": ["Draft", "Ready for Approval"],
  "Scheduled": ["In Progress"],
  "In Progress": ["Ready to Invoice"],
  "Ready to Invoice": ["Invoiced"],
  "Invoiced": ["Paid"],
  "Paid": [],
  "Completed": [], // legacy/terminal — out of the active flow
};

// The lifecycle statuses in canonical display order — the single source of truth for ordering
// status UI (filter chips, super-user jump menu, predecessor lookup). Excludes the retired
// "Completed" so it never appears in pickers; a legacy quote still renders via STATUS_LABELS.
export const STATUS_ORDER: QuoteStatus[] = [
  "Draft",
  "Ready for Approval",
  "Approved",
  "Declined",
  "Scheduled",
  "In Progress",
  "Ready to Invoice",
  "Invoiced",
  "Paid",
];

// Statuses at which the bid snapshot is frozen. `locked` becomes true when a
// quote reaches "Approved" and stays true for every status after it, through
// "Paid". "Declined" does not lock.
export const LOCKED_STATUSES: QuoteStatus[] = [
  "Approved",
  "Scheduled",
  "In Progress",
  "Completed",
  "Ready to Invoice",
  "Invoiced",
  "Paid",
];

/** Whether a given status should hold `locked === true` (frozen bid snapshot). */
export function isStatusLocked(status: QuoteStatus): boolean {
  return LOCKED_STATUSES.includes(status);
}

// Human-facing labels for the lifecycle. The STORED QuoteStatus values (persisted in
// pmz_saved_quotes — `status` and every statusHistory entry) are STABLE and must never be
// renamed; only these display labels change. Render badges, dropdowns, and dialogs through
// this map so the lifecycle vocabulary lives in one place.
export const STATUS_LABELS: Record<QuoteStatus, string> = {
  "Draft": "Draft",
  "Ready for Approval": "Sent for Acceptance",
  "Approved": "Accepted",
  "Declined": "Declined",
  "Scheduled": "Scheduled",
  "In Progress": "Work Order Active",
  "Ready to Invoice": "Ready to Invoice",
  "Invoiced": "Invoiced",
  "Paid": "Paid",
  "Completed": "Completed", // legacy
};

/** Human-facing label for a stored lifecycle status (falls back to the raw value). */
export function statusLabel(status: QuoteStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Whole days elapsed since the most recent statusHistory entry's `at`. */
export function getDaysInCurrentStatus(quote: SavedQuote): number {
  const history = quote.statusHistory;
  if (!history || history.length === 0) return 0;
  const last = history[history.length - 1];
  const since = new Date(last.at).getTime();
  if (Number.isNaN(since)) return 0;
  const elapsedMs = Date.now() - since;
  return Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
}
