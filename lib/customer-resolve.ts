// The ONE home for recovering a customer from an Edit-in-Pricer / Send handoff blob. PURE: it reads
// no localStorage and touches no React — the caller passes a FRESHLY read customer registry and gets
// back the resolved { customerId, customerName }. Pure so it can be unit-tested for real (the fence
// calls THIS function, not a model of it), and so the staleness bug lives at the call site, never here.
//
// Resolution order (Law of the customer handoff, gaveled Jul 27 2026):
//   1. id present AND a record matches it  -> resolve by id; return the registry's CANONICAL name.
//      This is what makes case/punctuation drift ("SBI CONSTRUCTION" vs "SBI Construction") disappear:
//      the dropdown is keyed by name, so we must hand back the exact registry spelling.
//   2. id present but NO record matches (ORPHAN, e.g. the customer was deleted) -> fall back to the
//      name lookup, exactly as an id-less quote would. Do NOT retain the dangling id.
//   3. no id -> exact name lookup. A record match adopts its id + canonical name; otherwise the name
//      is kept as-is with no id (a free-text customer who was never in the registry keeps their only
//      recovery).

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

export function resolveCustomerFromHandoff(
  saved: HandoffCustomerFields,
  customers: RegistryCustomer[],
): ResolvedCustomer {
  const id = saved.customerId || "";
  const name = saved.customerName || saved.customer || "";

  // 1. Resolve by id → canonical registry name (kills drift). 2. Orphan id falls through to name.
  if (id) {
    const byId = customers.find((c) => c.id === id);
    if (byId) return { customerId: byId.id, customerName: byId.name || "" };
  }

  // 3. Name lookup (id-less, or orphan fallback). Exact match adopts the registry id + canonical name.
  if (name) {
    const byName = customers.find((c) => c.name === name);
    if (byName) return { customerId: byName.id, customerName: byName.name || "" };
  }

  // Free-text customer never in the registry: keep the name, no id — the only recovery they have.
  return { customerId: "", customerName: name };
}
