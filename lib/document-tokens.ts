/**
 * PMZ Pricing Assistant — Document Token Registry (Build D).
 *
 * The single source of truth for the 41 document tokens across 8 groups. Tier A tokens
 * resolve from Company Settings (owner-sets-once); Tier B tokens resolve from per-quote
 * data assembled at export time.
 *
 *   {{group.key}}  — double-brace, optional inner whitespace ({{ group.key }} also works)
 *
 * resolveTokens() handles SCALAR tokens (the ones that appear inside T&C / Payment Terms
 * text). The REPEATING tokens (line_item.*, section.*) belong to the line-items table
 * renderer, not free text, and are intentionally left untouched here — they're registered
 * for completeness and for a future insert-token UI.
 */

import {
  type CompanySettings,
  computeAnnualInterest,
} from './company-settings';

export type TokenTier = 'A' | 'B';

export interface TokenDef {
  /** Full path used in text, e.g. "company.legal_name". */
  path: string;
  group: string;
  key: string;
  /** Human label for the insert-token / reference UI. */
  label: string;
  tier: TokenTier;
  /** Repeating tokens (line_item / section) are not scalar-resolvable in free text. */
  repeating?: boolean;
  /** lien.state_notice_text — surfaced with an "Attorney review required" amber warning. */
  attorneyReview?: boolean;
}

// --- The 41 tokens, grouped. Order here drives the reference UI order. ---
export const TOKEN_REGISTRY: TokenDef[] = [
  // Tier A — company
  { path: 'company.legal_name', group: 'company', key: 'legal_name', label: 'Legal Name', tier: 'A' },
  { path: 'company.short_name', group: 'company', key: 'short_name', label: 'Short Name', tier: 'A' },
  { path: 'company.website', group: 'company', key: 'website', label: 'Website', tier: 'A' },
  { path: 'company.phone', group: 'company', key: 'phone', label: 'Phone', tier: 'A' },
  { path: 'company.email', group: 'company', key: 'email', label: 'Email', tier: 'A' },
  { path: 'company.address', group: 'company', key: 'address', label: 'Address', tier: 'A' },
  { path: 'company.city_state_zip', group: 'company', key: 'city_state_zip', label: 'City, State ZIP', tier: 'A' },
  { path: 'company.year_founded', group: 'company', key: 'year_founded', label: 'Year Founded', tier: 'A' },
  { path: 'company.years_experience', group: 'company', key: 'years_experience', label: 'Years Experience', tier: 'A' },
  { path: 'company.payment_methods', group: 'company', key: 'payment_methods', label: 'Payment Methods', tier: 'A' },
  // Tier A — terms
  { path: 'terms.deposit_pct', group: 'terms', key: 'deposit_pct', label: 'Deposit %', tier: 'A' },
  { path: 'terms.balance_due_days', group: 'terms', key: 'balance_due_days', label: 'Balance Due (days)', tier: 'A' },
  { path: 'terms.late_interest_monthly_pct', group: 'terms', key: 'late_interest_monthly_pct', label: 'Late Interest % / month', tier: 'A' },
  { path: 'terms.late_interest_annual_pct', group: 'terms', key: 'late_interest_annual_pct', label: 'Late Interest % / year (auto: monthly × 12)', tier: 'A' },
  { path: 'terms.change_order_deposit_pct', group: 'terms', key: 'change_order_deposit_pct', label: 'Change Order Deposit %', tier: 'A' },
  { path: 'terms.cancellation_fee_pct', group: 'terms', key: 'cancellation_fee_pct', label: 'Cancellation Fee %', tier: 'A' },
  { path: 'terms.quote_validity_days', group: 'terms', key: 'quote_validity_days', label: 'Quote Validity (days)', tier: 'A' },
  // Tier A — lien
  { path: 'lien.state', group: 'lien', key: 'state', label: 'Lien State', tier: 'A' },
  { path: 'lien.state_notice_text', group: 'lien', key: 'state_notice_text', label: 'State Notice Text', tier: 'A', attorneyReview: true },
  { path: 'lien.withhold_days', group: 'lien', key: 'withhold_days', label: 'Lien Withhold (days)', tier: 'A' },
  // Tier A — legal
  { path: 'legal.utility_locator', group: 'legal', key: 'utility_locator', label: 'Utility Locator', tier: 'A' },
  // Tier A — process
  { path: 'process.cure_avoid_hours', group: 'process', key: 'cure_avoid_hours', label: 'Cure / Avoid (hours)', tier: 'A' },

  // Tier B — quote
  { path: 'quote.date', group: 'quote', key: 'date', label: 'Quote Date', tier: 'B' },
  { path: 'quote.number', group: 'quote', key: 'number', label: 'Quote Number', tier: 'B' },
  { path: 'quote.total', group: 'quote', key: 'total', label: 'Quote Total', tier: 'B' },
  // Tier B — estimator (the estimator SELECTED on the quote, from the Estimator Registry)
  { path: 'estimator.name', group: 'estimator', key: 'name', label: 'Estimator Name', tier: 'B' },
  { path: 'estimator.title', group: 'estimator', key: 'title', label: 'Estimator Title', tier: 'B' },
  { path: 'estimator.email', group: 'estimator', key: 'email', label: 'Estimator Email', tier: 'B' },
  { path: 'estimator.phone', group: 'estimator', key: 'phone', label: 'Estimator Phone', tier: 'B' },
  // Tier B — customer
  { path: 'customer.name', group: 'customer', key: 'name', label: 'Customer Name', tier: 'B' },
  { path: 'customer.address', group: 'customer', key: 'address', label: 'Customer Address', tier: 'B' },
  { path: 'customer.city_state_zip', group: 'customer', key: 'city_state_zip', label: 'Customer City, State ZIP', tier: 'B' },
  { path: 'customer.email', group: 'customer', key: 'email', label: 'Customer Email', tier: 'B' },
  { path: 'customer.phone', group: 'customer', key: 'phone', label: 'Customer Phone', tier: 'B' },
  // Tier B — project
  { path: 'project.name', group: 'project', key: 'name', label: 'Project Name', tier: 'B' },
  { path: 'project.address', group: 'project', key: 'address', label: 'Project Address', tier: 'B' },
  { path: 'project.city_state_zip', group: 'project', key: 'city_state_zip', label: 'Project City, State ZIP', tier: 'B' },
  // Tier B — line_item (repeating)
  { path: 'line_item.description', group: 'line_item', key: 'description', label: 'Line Item Description', tier: 'B', repeating: true },
  { path: 'line_item.amount', group: 'line_item', key: 'amount', label: 'Line Item Amount', tier: 'B', repeating: true },
  // Tier B — section (repeating)
  { path: 'section.label', group: 'section', key: 'label', label: 'Section Label', tier: 'B', repeating: true },
  { path: 'section.amount', group: 'section', key: 'amount', label: 'Section Amount', tier: 'B', repeating: true },
  // Tier B — acceptance
  { path: 'acceptance.signed_by', group: 'acceptance', key: 'signed_by', label: 'Signed By', tier: 'B' },
  { path: 'acceptance.date', group: 'acceptance', key: 'date', label: 'Acceptance Date', tier: 'B' },
];

/** Tokens grouped, in registry order — for the Company Setup reference / insert UI. */
export function tokensByGroup(): Record<string, TokenDef[]> {
  return TOKEN_REGISTRY.reduce((acc, t) => {
    (acc[t.group] ||= []).push(t);
    return acc;
  }, {} as Record<string, TokenDef[]>);
}

/**
 * Tier B context, assembled at export time from quote + customer data. All fields optional;
 * a missing field resolves its token to ''. Repeating groups (line_item/section) are not
 * part of this scalar context.
 */
export interface QuoteTokenContext {
  quote?: { date?: string; number?: string; total?: string };
  estimator?: { name?: string; title?: string; email?: string; phone?: string };
  customer?: { name?: string; address?: string; city_state_zip?: string; email?: string; phone?: string };
  project?: { name?: string; address?: string; city_state_zip?: string };
  acceptance?: { signed_by?: string; date?: string };
}

/** Build the flat path → value map from Tier A settings + Tier B context. */
export function buildTokenValues(
  company: CompanySettings | null | undefined,
  quote: QuoteTokenContext | null | undefined
): Record<string, string> {
  const c = company;
  const q = quote || {};
  const values: Record<string, string> = {};

  if (c) {
    (Object.keys(c) as (keyof CompanySettings)[]).forEach((group) => {
      const obj = c[group] as Record<string, string>;
      Object.keys(obj).forEach((key) => {
        values[`${group}.${key}`] = obj[key] ?? '';
      });
    });
    // Derived: annual interest = monthly × 12 (never stored).
    values['terms.late_interest_annual_pct'] = computeAnnualInterest(c.terms.late_interest_monthly_pct);
  }

  const assign = (group: string, obj: Record<string, any> | undefined) => {
    if (!obj) return;
    Object.keys(obj).forEach((key) => {
      if (obj[key] != null) values[`${group}.${key}`] = String(obj[key]);
    });
  };
  assign('quote', q.quote);
  assign('estimator', q.estimator);
  assign('customer', q.customer);
  assign('project', q.project);
  assign('acceptance', q.acceptance);

  return values;
}

const TOKEN_RE = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/gi;

/**
 * Replace {{group.key}} tokens in `text` with resolved values.
 *
 * - Known token with a value → the value.
 * - Known token, empty value → '' (the token disappears cleanly).
 * - Unknown / repeating token → left as the literal {{...}} so the author spots it in the
 *   preview and fixes it (poka-yoke: never silently drop something we can't resolve).
 */
export function resolveTokens(
  text: string | null | undefined,
  sources: { company?: CompanySettings | null; quote?: QuoteTokenContext | null }
): string {
  if (!text) return '';
  const values = buildTokenValues(sources.company, sources.quote);
  return text.replace(TOKEN_RE, (match, path: string) => {
    const p = path.toLowerCase();
    return Object.prototype.hasOwnProperty.call(values, p) ? values[p] : match;
  });
}
