/**
 * PMZ Pricing Assistant — Quote & Job data types (data foundation only)
 * Pure TypeScript interfaces. No side effects.
 */

// SavedQuote now lives in lib/pmz-types.ts (single source of truth). Re-exported
// here so existing `from './quote-job-types'` imports keep resolving.
export type { SavedQuote } from './pmz-types';

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
