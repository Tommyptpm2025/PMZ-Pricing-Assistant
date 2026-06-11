/**
 * PMZ Pricing Assistant — Quote & Job data types (data foundation only)
 * Pure TypeScript interfaces. No side effects.
 */

export interface QuoteLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number; // selling price to customer
}

export interface RealLEMItem {
  id: string;
  type: 'labor' | 'equipment' | 'material';
  profileId: string;
  description: string;
  quantity: number;
  unitCost: number;
}

export interface SavedQuote {
  id: string;
  jobName: string;
  customer: string;
  workType: string;
  salesperson: string;
  quoteType: "EPP" | "Full";
  eppLineItems: QuoteLineItem[];
  proLemItems: RealLEMItem[];
  targetMargin: number;
  totalRevenue: number;
  status: "Draft" | "Ready for Approval" | "Approved" | "Declined";
  locked: boolean;
  rateProfileSnapshot: {
    labor: number;
    equipment: number;
    material: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  quoteId: string;
  jobName: string;
  workType: string;
  lineItems: QuoteLineItem[];
  status: 'Open' | 'In Progress' | 'Complete';
  acceptedDate: string; // ISO string
  actuals?: any; // loose for now; will be expanded in later phases
}
