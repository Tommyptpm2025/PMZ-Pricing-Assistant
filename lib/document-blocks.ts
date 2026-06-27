import type { CompanySettings } from "./company-settings";

/**
 * PMZ Pricing Assistant — document prose blocks (Build D).
 * Tokenized text resolved at render time via resolveTokens (lib/document-tokens). The Payment
 * Terms paragraph is reused verbatim as section 1 of the full Terms & Conditions (Step 6).
 */

export const PAYMENT_TERMS_TEXT =
  "A deposit of {{terms.deposit_pct}}% of the total contract price is due when you accept this {{quote.label}}; we schedule and order materials once it's received. The remaining balance is due within {{terms.balance_due_days}} days of the final invoice. Past-due balances accrue interest at {{terms.late_interest_monthly_pct}}% per month ({{terms.late_interest_annual_pct}}% annually) until paid in full. Any change to the agreed scope of work requires a signed change order, and a non-refundable deposit of {{terms.change_order_deposit_pct}}% of the change order amount is due before that work begins. If you cancel after acceptance, your deposit is refunded less a {{terms.cancellation_fee_pct}}% fee covering scheduling and materials already committed on your behalf. Should collection or legal action become necessary to recover payment, you agree to cover the reasonable costs, including attorney's fees and court costs.";

/**
 * The terms fields the Payment Terms block depends on. When any is blank the block can't be
 * cleanly generated (it would leave gaps in the sentence), so the document shows an amber
 * "complete terms" warning instead of a half-blank paragraph (poka-yoke: never silently blank).
 */
export function paymentTermsComplete(company: CompanySettings | null | undefined): boolean {
  const t = company?.terms;
  if (!t) return false;
  return [
    t.deposit_pct,
    t.balance_due_days,
    t.late_interest_monthly_pct,
    t.change_order_deposit_pct,
    t.cancellation_fee_pct,
  ].every((v) => (v ?? "").toString().trim() !== "");
}

/** One section of the full Terms & Conditions block (Step 6). Bodies are tokenized prose. */
export interface TCSection {
  id: string;
  title: string;
  body: string;
  /** Lien notice — carries an amber "Attorney review required" badge (owner-facing, preview only). */
  attorneyReview?: boolean;
}

/**
 * The full Terms & Conditions, in order. Section 1 reuses the Payment Terms paragraph verbatim,
 * so it appears once on the document (the standalone Step 5 block is folded into this).
 */
export const TC_SECTIONS: TCSection[] = [
  { id: "payment", title: "Payment Terms", body: PAYMENT_TERMS_TEXT },
  {
    id: "change-orders",
    title: "Change Orders",
    body:
      "Any change, addition, or deletion to the scope of work is binding only when authorized in writing through a signed change order. A non-refundable deposit of {{terms.change_order_deposit_pct}}% of the change order amount is due at execution.",
  },
  {
    id: "cancellation",
    title: "Cancellation",
    body:
      "If the Customer cancels after acceptance, the deposit will be refunded less a cancellation fee of {{terms.cancellation_fee_pct}}% of the total contract price.",
  },
  {
    id: "liability",
    title: "Liability",
    body:
      "The Contractor is not responsible for damage to unmarked utilities, irrigation, or similar improvements. The Contractor's liability is limited to the total contract price.",
  },
  {
    id: "lien",
    title: "Lien Notice",
    body: "Under {{lien.state}} law... {{lien.state_notice_text}}",
    attorneyReview: true,
  },
  {
    id: "acceptance",
    title: "Acceptance",
    body: "This proposal is valid for {{terms.quote_validity_days}} days from the date issued.",
  },
];

