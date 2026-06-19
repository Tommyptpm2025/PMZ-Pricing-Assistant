export type Bucket = "direct" | "indirect";

export interface Customer {
  id: string;
  name: string;                    // Company or contact name
  contactName?: string;            // Primary contact person
  title?: string;                  // Title / Role
  phone?: string;
  mobile?: string;
  email?: string;
  preferredContact?: "Phone" | "Email" | "Text";
  website?: string;
  billingAddress?: {
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  jobSiteAddress?: {
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    latitude?: number;
    longitude?: number;
    accessNotes?: string;
  };
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

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
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

// Full lifecycle a quote/job can move through, in forward order.
export type QuoteStatus =
  | "Draft"
  | "Ready for Approval"
  | "Approved"
  | "Declined"
  | "In Progress"
  | "Completed"
  | "Ready to Invoice"
  | "Invoiced"
  | "Paid";

// One entry per status change, appended in order. `at` is an ISO timestamp string.
export interface StatusHistoryEntry {
  status: QuoteStatus;
  at: string;
}

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

  eppLineItems: LineItem[];
  proLemItems: LemItem[];

  targetGpPercent: number;
  targetGpSource: { workTypeId: string; pricingTierId: string };

  totalRevenue: number;
  directCogsDollars: number;
  indirectCogsDollars: number;
  grossProfitDollars: number;
  grossProfitPercent: number;

  createdAt: Date;
  updatedAt: Date;
}

// Legal forward transitions. The UI may only advance a quote to one of the
// statuses listed for its current status. "Declined" and "Paid" are terminal.
export const STATUS_FLOW: Record<QuoteStatus, QuoteStatus[]> = {
  "Draft": ["Ready for Approval"],
  "Ready for Approval": ["Approved", "Declined"],
  "Approved": ["In Progress"],
  "In Progress": ["Completed"],
  "Completed": ["Ready to Invoice"],
  "Ready to Invoice": ["Invoiced"],
  "Invoiced": ["Paid"],
  "Declined": [],
  "Paid": [],
};

// Statuses at which the bid snapshot is frozen. `locked` becomes true when a
// quote reaches "Approved" and stays true for every status after it, through
// "Paid". "Declined" does not lock.
export const LOCKED_STATUSES: QuoteStatus[] = [
  "Approved",
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
