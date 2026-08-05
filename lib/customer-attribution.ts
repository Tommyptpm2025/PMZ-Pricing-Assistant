import type { RegistryCustomer } from "./customer-resolve";

// ── CUSTOMER ATTRIBUTION BACKFILL (pure core) ──────────────────────────────────────────────────────
//
// CLAIM THE HISTORY, customer edition. Third in the same playbook as the salesperson backfill
// (lib/people.ts) and the work-type backfill (lib/work-types.ts). Records saved before the customer
// registry existed — or before the Pricer stamped an id on save — carry only a customer NAME STRING.
// Every surface that resolves a customer does it BY ID (lib/customer-resolve.ts), and the Pricer's
// Customer picker is keyed by the registry's own names, so a name-only record shows an EMPTY picker
// even while the Quotes list happily prints the stored string. This one-time backfill stamps the
// matching customer id onto those records so the picker can answer.
//
// The laws it holds:
//   • MONEY IS UNTOUCHABLE. Only `customerId` is ever written. Amount, GP, status, dates, the name
//     string itself — all pass through byte-identical (a changed record is a shallow copy; an
//     unchanged one is returned by the SAME reference).
//   • NEVER overwrite an existing customerId. A record already attributed is left exactly as-is —
//     including one whose id no longer resolves, because a stored id is a fact we did not witness
//     being wrong. (Re-pointing orphan ids is the work-type backfill's job, not this one's.)
//   • Write an id ONLY on an UNAMBIGUOUS match: the trimmed, case-insensitive name resolves to
//     EXACTLY ONE customer in the registry. Two customers share the name → ambiguous, skipped.
//   • NEVER INVENT A CUSTOMER. A name with no registry record is counted (noMatchSkipped) and left
//     alone. Minting a record from a quote's name string is how a contact person becomes a fake
//     company; the count is the report, not a new row.

// One-time flag + provenance record. Its mere presence — ANY value, including '' — means the
// backfill has run and must NEVER run again.
export const CUSTOMER_BACKFILL_KEY = 'pmz_customer_backfill_v1';

// A record the backfill can attribute. It reads ONLY these three fields; everything else is opaque
// and carried through untouched. Saved quotes denormalize the name onto `customer` (and, since the
// unified save, `customerName` too); jobs carry `customerName` only.
export interface CustomerAttributableRecord {
  customerId?: string;
  customer?: string;
  customerName?: string;
}

export interface CustomerAttributionCounts {
  matched: number;
  ambiguousSkipped: number;
  noMatchSkipped: number; // a real name that no customer in the registry carries — counted, never invented
}

const normalizeName = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

// normalized name → the ids of every registry customer with that name. length > 1 ⇒ ambiguous.
function registryNameIndex(customers: RegistryCustomer[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const c of customers || []) {
    const key = normalizeName(c.name);
    if (!key || !c.id) continue;
    const ids = idx.get(key);
    if (ids) ids.push(c.id);
    else idx.set(key, [c.id]);
  }
  return idx;
}

const hasCustomerId = (rec: CustomerAttributableRecord): boolean =>
  typeof rec.customerId === 'string' && rec.customerId.trim() !== '';

// Stamp the matching customer id onto each UNATTRIBUTED, name-carrying record. Returns a NEW array;
// never mutates the input.
export function backfillCustomerIds<T extends CustomerAttributableRecord>(
  records: T[],
  customers: RegistryCustomer[]
): { records: T[]; counts: CustomerAttributionCounts } {
  const idx = registryNameIndex(customers);
  let matched = 0;
  let ambiguousSkipped = 0;
  let noMatchSkipped = 0;
  const out = (records || []).map((rec) => {
    // GUARD: an already-attributed record is NEVER overwritten. (Mutation target — remove this and
    // the backfill clobbers existing customerIds, which the fence forbids.)
    if (hasCustomerId(rec)) return rec;
    const name = (rec.customerName ?? rec.customer ?? '').trim();
    if (name === '') return rec; // no name string → not a candidate at all
    const ids = idx.get(normalizeName(name)) ?? [];
    if (ids.length === 1) {
      matched++;
      return { ...rec, customerId: ids[0] }; // the name string stays in place, for provenance
    }
    if (ids.length > 1) {
      ambiguousSkipped++; // two customers share the name — never guess which
      return rec;
    }
    noMatchSkipped++; // a real name, but no customer in the registry carries it — LEFT ALONE
    return rec;
  });
  return { records: out, counts: { matched, ambiguousSkipped, noMatchSkipped } };
}

export interface CustomerBackfillPlan {
  quotes: CustomerAttributableRecord[];
  jobs: CustomerAttributableRecord[];
  counts: CustomerAttributionCounts;                                          // combined totals
  byStore: { quotes: CustomerAttributionCounts; jobs: CustomerAttributionCounts };
}

// Decide the backfill purely: if the flag key already holds ANY value, NEVER run again (return null).
// Only on a truly absent flag (null) do we produce the attributed record arrays + inspectable counts.
export function planCustomerBackfill(
  existingFlagRaw: string | null,
  quotes: CustomerAttributableRecord[],
  jobs: CustomerAttributableRecord[],
  customers: RegistryCustomer[]
): CustomerBackfillPlan | null {
  if (existingFlagRaw !== null) return null; // flag present (even '') → already ran, never twice
  const q = backfillCustomerIds(quotes, customers);
  const j = backfillCustomerIds(jobs, customers);
  return {
    quotes: q.records,
    jobs: j.records,
    counts: {
      matched: q.counts.matched + j.counts.matched,
      ambiguousSkipped: q.counts.ambiguousSkipped + j.counts.ambiguousSkipped,
      noMatchSkipped: q.counts.noMatchSkipped + j.counts.noMatchSkipped,
    },
    byStore: { quotes: q.counts, jobs: j.counts },
  };
}

// ── STORAGE BINDING ────────────────────────────────────────────────────────────────────────────────

const SAVED_QUOTES_KEY = 'pmz_saved_quotes';
const JOBS_KEY = 'pmz_jobs_v1'; // mirrors lib/jobs.ts JOBS_STORAGE_KEY (kept local so this stays decoupled)

function readRecordArray(key: string): CustomerAttributableRecord[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Run the customer backfill ONCE, guarded by CUSTOMER_BACKFILL_KEY.
//
// DEFERS while the registry is empty. This is the work-type backfill's lesson, learned the hard way:
// a one-shot flag burned on a load where there was nothing to match against orphans every record
// forever. It runs on the first load that actually has customers.
//
// Idempotent even if the flag write fails — the per-record guard skips already-attributed records —
// so a re-run can never double-attribute or clobber. A store is rewritten only when it actually
// gained an attribution; the flag always records the summary so the numbers stay inspectable later.
// MONEY UNTOUCHED: only customerId is ever written back.
export function runCustomerBackfillIfNeeded(customers: RegistryCustomer[]): void {
  if (typeof localStorage === 'undefined') return;
  if (!customers || customers.length === 0) return; // defer until the registry exists
  let flag: string | null;
  try {
    flag = localStorage.getItem(CUSTOMER_BACKFILL_KEY);
  } catch {
    return;
  }
  const quotes = readRecordArray(SAVED_QUOTES_KEY);
  const jobs = readRecordArray(JOBS_KEY);
  const plan = planCustomerBackfill(flag, quotes, jobs, customers);
  if (plan === null) return; // flag present → already ran
  try {
    if (plan.byStore.quotes.matched > 0) localStorage.setItem(SAVED_QUOTES_KEY, JSON.stringify(plan.quotes));
  } catch {
    // storage error — leave the store; the per-record guard keeps a later re-run safe
  }
  try {
    if (plan.byStore.jobs.matched > 0) localStorage.setItem(JOBS_KEY, JSON.stringify(plan.jobs));
  } catch {
    // storage error — as above
  }
  try {
    localStorage.setItem(
      CUSTOMER_BACKFILL_KEY,
      JSON.stringify({
        ranAt: new Date().toISOString(),
        matched: plan.counts.matched,
        ambiguousSkipped: plan.counts.ambiguousSkipped,
        noMatchSkipped: plan.counts.noMatchSkipped, // named customers NOT in the registry — none invented
        byStore: plan.byStore,
      })
    );
  } catch {
    // couldn't record the flag — the backfill still ran; the guard makes a re-run harmless
  }
  if (plan.counts.matched > 0 || plan.counts.ambiguousSkipped > 0 || plan.counts.noMatchSkipped > 0) {
    // A repair that no-ops must be able to say why (the work-order-sweep lesson). Silence here would
    // make "nothing needed it" and "it never ran" look identical.
    console.log(
      `[customer-backfill] Claimed ${plan.counts.matched} record(s) by customer name; ` +
        `${plan.counts.ambiguousSkipped} ambiguous and ${plan.counts.noMatchSkipped} not in the customer list — both left alone (no customer was invented).`
    );
  }
}
