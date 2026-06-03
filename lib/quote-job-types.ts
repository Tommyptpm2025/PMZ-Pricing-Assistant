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

export interface SavedQuote {
  id: string;
  jobName: string;
  workType: string;
  lineItems: QuoteLineItem[];
  targetMarginPercent: number;
  totalRevenue: number;
  status: 'Draft' | 'Accepted';
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
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
