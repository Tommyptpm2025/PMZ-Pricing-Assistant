// The ONE home for resolving a customer against the registry. PURE: reads no localStorage, touches no
// React — the caller passes a FRESHLY read registry in. Pure so it can be unit-tested for real (the
// fence calls THESE functions, not a model), and so any staleness bug lives at the call site, not here.
//
// The rule (gaveled Jul 27 2026): LIVE-CANONICAL BY ID. A customer's display name is the registry
// record's name, matched by customerId. The stored name on the quote is a denormalized CACHE, used
// only as a fallback when there is no id (a free-text customer who was never in the registry). One
// resolution rule, composed everywhere — no second copy.

export interface HandoffCustomerFields {
  customerId?: string;
  customerName?: string;
  customer?: string;
}
export interface RegistryCustomer {
  id: string;
  name?: string;
}
export interface ResolvedCustomer {
  customerId: string;
  customerName: string;
}

// THE resolution primitive: which registry record is this customer? By id first, then by
// (case-insensitive) name — otherwise nothing (a free-text customer never in the registry). Generic so
// callers keep the full record (addresses, contact, …), not just id/name.
export function findCustomerRecord<T extends RegistryCustomer>(
  ref: HandoffCustomerFields,
  customers: T[],
): T | null {
  const id = ref.customerId || "";
  const name = (ref.customerName || ref.customer || "").trim().toLowerCase();
  return (
    (id ? customers.find((c) => c.id === id) : undefined) ||
    (name ? customers.find((c) => (c.name || "").trim().toLowerCase() === name) : undefined) ||
    null
  );
}

// The Edit-in-Pricer / Send handoff resolution (C2): returns { customerId, customerName }. id + match
// -> resolve by id, return the registry's CANONICAL name (drift disappears). Orphan (id, no record) or
// no id -> name lookup; a name match adopts that record (no dangling id); no match -> keep the stored
// name with no id (free-text keeps its only recovery).
export function resolveCustomerFromHandoff(
  saved: HandoffCustomerFields,
  customers: RegistryCustomer[],
): ResolvedCustomer {
  const rec = findCustomerRecord(saved, customers);
  if (rec) return { customerId: rec.id, customerName: rec.name || "" };
  return { customerId: "", customerName: saved.customerName || saved.customer || "" };
}

// The DISPLAY name for any surface that shows a customer to a human: LIVE-canonical by id, stored name
// only as the free-text fallback. Every screen composes THIS — no screen reads the stored copy directly.
export function resolveCustomerName(ref: HandoffCustomerFields, customers: RegistryCustomer[]): string {
  return resolveCustomerFromHandoff(ref, customers).customerName;
}
