import { goldenFormula } from './pricing';

/**
 * CHANGE ORDERS — the one home for the foreman's on-the-spot change-order record and its math.
 * Implements the gaveled ruling in COMPANY-ROSTER-AND-ROLES.md § "Foreman On-the-Spot Change Orders"
 * (Tom, 2026-07-31).
 *
 * The foreman enters RESOURCES (costs) ONLY and never sees a margin. PMZ prices the change order
 * automatically at the PARENT BID'S FROZEN MARGIN through the shared Golden Formula. The price is
 * read-only to the foreman — there is no second price path (Law 56).
 *
 * ── THE GAVELED LAW THIS FILE EXISTS TO HOLD ──────────────────────────────────────────────────────
 * A CHANGE ORDER NEVER RE-RESOLVES THE TIER. Not from its own size, not from the new combined job
 * total, not from anything. The parent's frozen margin is the ONLY margin, copied onto the record at
 * creation and never recomputed afterwards — so a later edit to the parent quote cannot retroactively
 * reprice work the customer was already quoted. `parentMarginPct` on the record is PROVENANCE: what
 * the margin WAS at the moment this change order was priced.
 *
 * That is also why this module never reads the parent quote itself. It takes the frozen margin as an
 * INPUT. A module that could look the margin up is a module that could look it up again.
 *
 * ── GAVELED: WHICH PARENT FIELD IS "THE FROZEN MARGIN" ────────────────────────────────────────────
 * GAVEL (Tom, 2026-08-05): the parent's frozen margin is `grossProfitPercent` — the AT-BID margin the
 * quote was actually priced at. NOT `targetGpPercent`, the target the work type's pricing tier
 * suggested. The reason is the law itself: THE EXTRA RIDES THE DEAL THAT WAS STRUCK, NOT THE TIER'S
 * SUGGESTION. Inheriting the tier's number would re-resolve the very thing a change order may never
 * re-resolve — and it would charge the customer at a margin their bid was never priced at.
 *
 * This module still takes the margin as an INPUT rather than reading the quote: a module that could
 * look the margin up is a module that could look it up again, and "never recomputed" is easier to
 * hold when there is nothing here to recompute from. The gavel binds the CALL SITE — see
 * CreateChangeOrderInput.parentMarginPct below.
 *
 * Storage: 'pmz_change_orders_v1' — its own key, following the existing store patterns.
 */

// ── RECORD ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Creation produces exactly two of these: 'quoted' (at or under the ceiling — the foreman may quote
 * it on the spot) or 'pending_approval' (over the ceiling — priced identically, but held for the
 * salesperson or boss). 'approved' / 'declined' are the later lane's terminal states; nothing in this
 * module ever produces them.
 */
export type ChangeOrderStatus = 'quoted' | 'pending_approval' | 'approved' | 'declined';

/** A resource the foreman added. COST FACTS ONLY — no margin, no price, ever, on a line. */
export interface ChangeOrderLine {
  id: string;
  description: string;
  qty: number;
  rate: number;   // break-even cost per unit (the PMZ stored-rate rule: no overhead, no profit)
  cost: number;   // qty × rate, rounded to the cent AS THE VALUE so the line ties out on screen
}

export interface ChangeOrder {
  id: string;
  jobId: string;
  quoteId?: string;          // the parent bid, when the job carries one (demo jobs do not)
  foremanId: string;         // roster Person id — picked, NEVER typed (beta = attribution, not logins)
  createdAt: string;         // ISO
  lines: ChangeOrderLine[];
  totalCost: number;         // sum of line costs, rounded to the cent
  priceCharged: number;      // goldenFormula(totalCost, parentMarginPct), rounded to the cent
  parentMarginPct: number;   // FROZEN copy from the parent at creation. Provenance. Never recomputed.
  autoPriced: true;          // structural: this money was computed, not typed by a human
  status: ChangeOrderStatus;
}

export const CHANGE_ORDERS_KEY = 'pmz_change_orders_v1';

/**
 * The default per-change-order ceiling in dollars, per the ruling. Tom's rationale: one hour of truck,
 * driver, a load of material, and a piece of equipment runs about $1,500.
 */
export const DEFAULT_CHANGE_ORDER_CEILING = 1500;

// Round to the cent as the VALUE (not just the display), so rate × qty equals the cost shown.
const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

// ── MATH ──────────────────────────────────────────────────────────────────────────────────────────

/** Total break-even cost of the entered resources. */
export function changeOrderTotalCost(lines: Array<{ qty: number; rate: number }>): number {
  return round2((lines || []).reduce((sum, l) => sum + round2((l?.qty || 0) * (l?.rate || 0)), 0));
}

/**
 * The customer price for a change order: the SHARED Golden Formula (lib/pricing.ts) applied to the
 * total cost at the PARENT's frozen margin. Never a local copy of the formula — one implementation,
 * one set of guards, one behavior at the edges (a margin of 0, 100, or a missing one falls back to
 * cost, i.e. break-even, rather than returning Infinity or NaN).
 *
 * `parentMarginPct` is an argument and not a lookup ON PURPOSE — see the gaveled law at the top.
 */
export function priceChangeOrder(totalCost: number, parentMarginPct: number): number {
  return round2(goldenFormula(totalCost, parentMarginPct));
}

/**
 * Is this change order inside the foreman's on-the-spot authority?
 *
 * AT OR UNDER the ceiling is inside it — the ruling says "at or below", so the boundary dollar itself
 * is quotable. Strictly above it is held.
 *
 * GAVELED (Tom, 2026-08-05): THE CEILING CAPS COST, NOT PRICE — it limits the bundle of RESOURCES a
 * foreman may commit on the spot, which is what the $1,500 was sized against in the first place (one
 * hour of truck, driver, a load of material, and a machine). Cost is also the only number the foreman
 * ever enters or sees the size of, so the limit is stated in the units the person under it works in.
 */
export function isWithinChangeOrderCeiling(totalCost: number, ceiling: number): boolean {
  return totalCost <= ceiling;
}

/** The creation status implied by the ceiling. Priced identically either way — only the hold differs. */
export function changeOrderStatusForCost(totalCost: number, ceiling: number): ChangeOrderStatus {
  return isWithinChangeOrderCeiling(totalCost, ceiling) ? 'quoted' : 'pending_approval';
}

// ── CREATION ──────────────────────────────────────────────────────────────────────────────────────

export interface CreateChangeOrderInput {
  jobId: string;
  quoteId?: string;
  foremanId: string;
  /**
   * The parent's FROZEN margin, supplied by the caller.
   *
   * GAVELED (Tom, 2026-08-05) — step 2's screen passes the parent quote's `grossProfitPercent`, the
   * AT-BID margin. Never `targetGpPercent`: the extra rides the deal that was struck, not the tier's
   * suggestion, and inheriting the tier's number would re-resolve exactly what the law forbids.
   */
  parentMarginPct: number;
  lines: Array<{ description: string; qty: number; rate: number }>;
  /** Owner-set ceiling; defaults to the ruling's $1,500 when not supplied. */
  ceiling?: number;
}

function createId(): string {
  return Math.random().toString(36).slice(2, 11);
}

/**
 * Mint a change order. The ORIGIN STAMP IS STRUCTURAL, not decoration: foremanId, jobId, createdAt
 * and autoPriced are all required, because these extras are typically high-margin work and must stay
 * LABELED in history — they can never blend invisibly into year-end derivation (Law 5). A change
 * order that cannot say who added it and on which job is not a record, so this throws rather than
 * minting an unattributable one.
 */
export function createChangeOrder(
  input: CreateChangeOrderInput,
  now: () => string = () => new Date().toISOString(),
  idFactory: () => string = createId
): ChangeOrder {
  const foremanId = (input.foremanId || '').trim();
  if (!foremanId) {
    throw new Error(
      'A change order needs a foreman id — every change order is attributed to a person on the roster, picked and never typed.'
    );
  }
  const jobId = (input.jobId || '').trim();
  if (!jobId) {
    throw new Error('A change order needs the job it belongs to — the origin stamp is structural.');
  }

  const lines: ChangeOrderLine[] = (input.lines || []).map((l) => ({
    id: idFactory(),
    description: l.description,
    qty: l.qty,
    rate: l.rate,
    cost: round2((l.qty || 0) * (l.rate || 0)),
  }));
  const totalCost = changeOrderTotalCost(lines);
  const ceiling = Number.isFinite(input.ceiling as number)
    ? (input.ceiling as number)
    : DEFAULT_CHANGE_ORDER_CEILING;

  return {
    id: idFactory(),
    jobId,
    ...(input.quoteId ? { quoteId: input.quoteId } : {}),
    foremanId,
    createdAt: now(),
    lines,
    totalCost,
    // FROZEN AT CREATION. Copied, not looked up; and once here, never recomputed — a later edit to
    // the parent quote can never reprice work the customer has already been quoted.
    parentMarginPct: input.parentMarginPct,
    priceCharged: priceChangeOrder(totalCost, input.parentMarginPct),
    autoPriced: true,
    status: changeOrderStatusForCost(totalCost, ceiling),
  };
}

// ── STORAGE ───────────────────────────────────────────────────────────────────────────────────────

export function loadChangeOrders(): ChangeOrder[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CHANGE_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChangeOrders(list: ChangeOrder[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CHANGE_ORDERS_KEY, JSON.stringify(list));
  } catch {
    // storage full / private mode / quota — consistent with the other PMZ stores
  }
}

/** Every change order on a job, oldest first (creation order). */
export function changeOrdersForJob(list: ChangeOrder[], jobId: string): ChangeOrder[] {
  return (list || []).filter((co) => co.jobId === jobId);
}
