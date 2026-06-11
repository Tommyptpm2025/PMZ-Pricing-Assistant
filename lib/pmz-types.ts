export type Bucket = "direct" | "indirect";

export interface Customer {
  id: string;
  name: string;                    // Company or contact name
  contactName?: string;            // Primary contact person
  email?: string;
  phone?: string;
  website?: string;
  billingAddress?: {
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
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

export interface SavedQuote {
  id: string;
  quoteType: "EPP" | "Full";
  jobName: string;
  customerId: string;
  workTypeId: string;
  salesperson: string;
  status: "Draft" | "ReadyForApproval" | "Approved" | "Declined";
  locked: boolean;

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
