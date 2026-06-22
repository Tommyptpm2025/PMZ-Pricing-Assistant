/**
 * Customer completeness — the two-tier required model. Company Name is the only HARD requirement
 * (gates save). These fields are "required-for-complete": the record saves fine but is flagged
 * incomplete until they're present. Pure logic, reused by the saved list and the edit highlight.
 */
import type { Customer } from "./pmz-types";

// Field keys that map a missing item back to a form field (for amber-outline highlighting).
// Note: Company Name and Contact Name are HARD-required (they gate save), so they are not part
// of the completeness set — by the time a record exists, both are guaranteed present.
export type RequiredKey =
  | "jobStreet" | "jobCity" | "jobState" | "jobZip"
  | "billingStreet" | "billingCity" | "billingState" | "billingZip" | "billingCountry";

export interface Completeness {
  complete: boolean;
  missing: RequiredKey[];   // form-field keys still needed
  count: number;            // how many are missing
}

export function customerCompleteness(c: Customer): Completeness {
  const job = c.jobSiteAddress || {};
  const bill = c.billingAddress || {};
  const missing: RequiredKey[] = [];

  // Job Site
  if (!job.street?.trim()) missing.push("jobStreet");
  if (!job.city?.trim()) missing.push("jobCity");
  if (!(job.state || job.stateCode)) missing.push("jobState");
  if (!job.zip?.trim()) missing.push("jobZip");
  // Billing
  if (!bill.street?.trim()) missing.push("billingStreet");
  if (!bill.city?.trim()) missing.push("billingCity");
  if (!(bill.state || bill.stateCode)) missing.push("billingState");
  if (!bill.zip?.trim()) missing.push("billingZip");
  if (!(bill.country || bill.countryCode)) missing.push("billingCountry");

  return { complete: missing.length === 0, missing, count: missing.length };
}
