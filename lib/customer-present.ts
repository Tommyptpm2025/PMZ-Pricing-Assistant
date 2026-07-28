// The ONE rule for "is this quote's customer blank?" PURE: no localStorage, no React. Used by BOTH the
// Save-time validation display AND the Send-time gate, so the two can never disagree about whether a
// quote has a customer.
//
// A customer is PRESENT when a company name is entered (non-whitespace) OR a registry customer is
// selected by id — an id-selected customer counts even if the free-text box is not what supplies the
// name. Whitespace-only is blank (Law 50: blanks block). Trim before testing.
export function customerIsBlank(ref: { customerName?: string; customerId?: string }): boolean {
  return !(ref.customerName || "").trim() && !(ref.customerId || "").trim();
}
