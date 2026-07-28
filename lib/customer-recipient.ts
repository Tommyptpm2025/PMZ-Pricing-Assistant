// The ONE decision for what the Send Quote dialog writes to the customer registry. PURE: no
// localStorage, no React. The RULE (gaveled Jul 27 2026): the customer is the COMPANY; the recipient
// is a PERSON, and a person is an ATTN/CONTACT, never an identity.
//
//   - existing customer  -> update the CONTACT only. The patch NEVER contains `name`: an existing
//                           company record can never be renamed from this dialog.
//   - new customer + a company name -> create a record named after the COMPANY (from the Pricer's
//                           CUSTOMER field), never the recipient, never a "New Customer" placeholder.
//   - new customer + NO company name -> BLOCK (Law 50): a person's name is not a company identity, so
//                           refuse to mint a record rather than guess one.

export interface RecipientInput {
  name: string;  // the Send dialog Recipient — a CONTACT person, NOT the company
  email: string;
  phone: string;
}
export interface ExistingCustomerContact {
  contactName?: string;
  email?: string;
  phone?: string;
}
export type RecipientWrite =
  | { action: "update"; patch: { contactName?: string; email?: string; phone?: string } }
  | { action: "create"; record: { name: string; contactName?: string; email?: string; phone?: string } }
  | { action: "block"; reason: string };

export function recipientCustomerWrite(
  existing: ExistingCustomerContact | null,
  companyName: string,
  recipient: RecipientInput,
): RecipientWrite {
  const company = (companyName || "").trim();
  const contactName = (recipient.name || "").trim();

  // Existing record: touch the CONTACT only. No `name` in the patch — never rename the company.
  if (existing) {
    return {
      action: "update",
      patch: {
        contactName: contactName || existing.contactName || undefined,
        email: recipient.email || existing.email || undefined,
        phone: recipient.phone || existing.phone || undefined,
      },
    };
  }

  // New customer but no company name to identify it — refuse. The recipient is a contact, not a company.
  if (!company) {
    return { action: "block", reason: "A new customer needs a company name — the recipient is a contact, not the company (Law 50)." };
  }

  // New customer named after the COMPANY (never the recipient, never a placeholder). Recipient -> contact.
  return {
    action: "create",
    record: {
      name: company,
      contactName: contactName || undefined,
      email: recipient.email || undefined,
      phone: recipient.phone || undefined,
    },
  };
}
