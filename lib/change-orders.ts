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
 * CREATION produces exactly two of these: 'quoted' (at or under the ceiling — the foreman may quote
 * it on the spot) or 'pending_approval' (over the ceiling — priced identically, but held for the
 * salesperson or boss).
 *
 * THE APPROVAL DESK produces the rest, and only from 'pending_approval' (see decideChangeOrder):
 *   • 'quoted'             — APPROVE & RELEASE. The foreman may now quote the SAME price he was shown.
 *   • 'declined'           — DECLINE. A reason is REQUIRED; the why is part of the record.
 *   • 'converted_to_quote' — MAKE THIS A QUOTED ADDITION. A FLAG, not an automation: the change order
 *                            stays in history labeled so, and the work is priced properly through the
 *                            Pricer as new scope. Nothing here mints a quote.
 *
 * 'approved' is the legacy member of this union and is NEVER produced: an approved change order is a
 * QUOTED one — that is the whole point of "approve & release" — and a second word for the same state
 * would let two surfaces disagree about whether the foreman may quote. It stays in the type only so
 * any record written before this lane existed still parses.
 */
export type ChangeOrderStatus =
  | 'quoted'
  | 'pending_approval'
  | 'approved'
  | 'declined'
  | 'converted_to_quote';

/** A resource the foreman added. COST FACTS ONLY — no margin, no price, ever, on a line. */
export interface ChangeOrderLine {
  id: string;
  description: string;
  qty: number;
  rate: number;   // break-even cost per unit (the PMZ stored-rate rule: no overhead, no profit)
  cost: number;   // qty × rate, rounded to the cent AS THE VALUE so the line ties out on screen
}

/**
 * What leadership did with a held change order, and who did it.
 *
 * The stamp is the same shape for all three decisions on purpose: one place to read "who decided
 * what, when, and why", so a decline can never be a quieter record than an approval. `decidedBy` IS
 * the approver on an approve (the ruling's "approvedBy") — one field, because a second name for the
 * same fact is how two surfaces start disagreeing about who signed.
 */
export type ChangeOrderDecisionAction = 'approve' | 'decline' | 'convert';

export interface ChangeOrderDecision {
  action: ChangeOrderDecisionAction;
  decidedBy: string;   // roster Person id — picked from salesperson/boss, NEVER typed
  decidedAt: string;   // ISO
  /** Optional on approve and convert. On a convert this is where "price it as new scope" is said. */
  note?: string;
  /** REQUIRED on a decline — the why discipline. Stored as text so it stays searchable in history. */
  reason?: string;
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
  /** Present once leadership has ruled. Absent means nobody has decided anything yet. */
  decision?: ChangeOrderDecision;
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

// ── THE LAYERED CEILING ───────────────────────────────────────────────────────────────────────────
//
// A job may carry its OWN on-the-spot authority, set by leadership on that job's detail. When it does,
// it OVERRIDES the company default — up or down. The big airport job trusts the foreman with $5,000;
// the tight little repave trusts him with $500; everything else runs on the company number.
//
// There is exactly ONE reader, and it returns WHICH limit applied along with the amount, because the
// sentence the foreman reads must name the limit he actually hit. A reader that returned only a number
// would leave every surface free to guess at the wording — and "over the $1,500 limit" shown to a man
// working under a $5,000 job limit is a lie told by omission.
//
// "Set" means a finite, non-negative number. An EXPLICIT 0 on the job is honored — leadership may hold
// every change order on this one job on purpose — exactly as an explicit 0 is honored in company
// settings. Blank, negative, NaN and undefined are all "not set", and fall through to the company.

export interface AppliedCeiling {
  amount: number;
  /** 'job' when this job's own authority applied; 'company' when the company default did. */
  source: 'job' | 'company';
}

export function appliedChangeOrderCeiling(
  jobLimitDollars: number | null | undefined,
  companyCeiling: number
): AppliedCeiling {
  const n = typeof jobLimitDollars === 'number' ? jobLimitDollars : NaN;
  if (Number.isFinite(n) && n >= 0) return { amount: n, source: 'job' };
  return { amount: companyCeiling, source: 'company' };
}

/** The dollar amount of the layered ceiling, for callers that only need the number. */
export function effectiveChangeOrderCeiling(
  jobLimitDollars: number | null | undefined,
  companyCeiling: number
): number {
  return appliedChangeOrderCeiling(jobLimitDollars, companyCeiling).amount;
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

// ── THE APPROVAL DESK ─────────────────────────────────────────────────────────────────────────────
//
// What leadership does with a change order the ceiling held. Three doors, one door at a time, and the
// door only opens from 'pending_approval'.
//
// ── THE LAW THIS SECTION EXISTS TO HOLD ───────────────────────────────────────────────────────────
// A DECISION MOVES STATUS. IT NEVER MOVES MONEY. totalCost, priceCharged, parentMarginPct and every
// line come through byte-identical — the price the foreman was shown while it waited is the price he
// quotes when it is released. There is no re-pricing on approval, because approving is agreeing to
// the number that was already computed; a decision that could change the price would be a second
// price path (Law 56) wearing a signature.
//
// A DECIDED ORDER IS CLOSED. Approve, decline or convert and this record is done — no second decision
// can overwrite the first, and nothing edits it afterwards. That is why every transition reads the
// CURRENT status and refuses anything that is not 'pending_approval': history that can be re-decided
// is not history.
//
// THE STAMP IS STRUCTURAL, as it is at creation. No approver id, no decision — it throws rather than
// recording an unattributable ruling. A decline additionally requires a REASON: the one place the
// business learns why the extra was refused, and useless if it can be left blank.

/** Only a change order still waiting on leadership can be decided. */
export function canDecideChangeOrder(co: Pick<ChangeOrder, 'status'>): boolean {
  return co.status === 'pending_approval';
}

/**
 * Locked = no edits, ever again. Everything except a held order: a born-quoted change order was never
 * editable, and a decided one is closed. The screen reads THIS predicate rather than re-listing the
 * statuses, so "locks after a decision" cannot drift between the fence and the button.
 */
export function isChangeOrderLocked(co: Pick<ChangeOrder, 'status'>): boolean {
  return co.status !== 'pending_approval';
}

const STATUS_AFTER: Record<ChangeOrderDecisionAction, ChangeOrderStatus> = {
  approve: 'quoted',            // released — the foreman may now quote the price he was already shown
  decline: 'declined',
  convert: 'converted_to_quote',
};

export interface DecideChangeOrderInput {
  action: ChangeOrderDecisionAction;
  /** Roster Person id of the approver — a salesperson or boss, PICKED from the list, never typed. */
  decidedBy: string;
  note?: string;
  /** Required when action is 'decline'. */
  reason?: string;
}

/**
 * Rule on one held change order. Returns a NEW record; never mutates the input.
 *
 * Throws — rather than silently no-op'ing — on every refusal, because each one is a real mistake at a
 * desk where money changes hands: deciding an already-decided order, signing nothing, or declining
 * without saying why. A muted failure here would read to leadership as a decision that stuck.
 */
export function decideChangeOrder(
  co: ChangeOrder,
  input: DecideChangeOrderInput,
  now: () => string = () => new Date().toISOString()
): ChangeOrder {
  if (!canDecideChangeOrder(co)) {
    throw new Error(
      `Only a change order waiting for approval can be decided — this one is already ${co.status.replace(/_/g, ' ')}. A decided change order is closed.`
    );
  }
  const decidedBy = (input.decidedBy || '').trim();
  if (!decidedBy) {
    throw new Error(
      'A change-order decision needs the person who made it — pick the approver from the salespeople and bosses on the roster.'
    );
  }
  const reason = (input.reason || '').trim();
  if (input.action === 'decline' && !reason) {
    throw new Error(
      'A declined change order needs a reason — the why is the record. Say what was wrong with it so the next one can be right.'
    );
  }
  const note = (input.note || '').trim();

  const decision: ChangeOrderDecision = {
    action: input.action,
    decidedBy,
    decidedAt: now(),
    ...(note ? { note } : {}),
    ...(reason ? { reason } : {}),
  };

  // Spread FIRST, then overwrite exactly two keys. Every money field — totalCost, priceCharged,
  // parentMarginPct, lines — rides through untouched by construction, not by care.
  return { ...co, status: STATUS_AFTER[input.action], decision };
}

/** Decide one change order inside the stored list. Every other record passes through by reference. */
export function decideChangeOrderInList(
  list: ChangeOrder[],
  changeOrderId: string,
  input: DecideChangeOrderInput,
  now: () => string = () => new Date().toISOString()
): ChangeOrder[] {
  let found = false;
  const out = (list || []).map((co) => {
    if (co.id !== changeOrderId) return co;
    found = true;
    return decideChangeOrder(co, input, now);
  });
  if (!found) throw new Error('That change order is no longer in the record — nothing was decided.');
  return out;
}

/** Every change order on a job still waiting on leadership. */
export function pendingChangeOrders(list: ChangeOrder[], jobId: string): ChangeOrder[] {
  return changeOrdersForJob(list, jobId).filter(canDecideChangeOrder);
}

// ── WHO MAY DECIDE ────────────────────────────────────────────────────────────────────────────────
//
// The salespeople and bosses on the roster — the two roles the ruling puts over an on-the-spot limit
// — and THE JOB'S OWN SALESPERSON FIRST, because they are the one who priced the deal this extra
// rides on and the person the foreman actually calls.
//
// Deliberately structural (`{ id, name, roles, active }`) rather than importing the Person type: this
// module prices and rules on money and has no business depending on the roster's storage. Foremen are
// absent from this list on purpose — the man who wrote the change order does not sign it.

export interface ApproverCandidate {
  id: string;
  name: string;
  roles: string[];
  active: boolean;
}

const APPROVER_ROLES = ['salesperson', 'boss'];

export function changeOrderApprovers<T extends ApproverCandidate>(
  people: T[],
  jobSalesperson?: { id?: string; name?: string }
): T[] {
  const eligible = (people || []).filter(
    (p) => p && p.active && Array.isArray(p.roles) && p.roles.some((r) => APPROVER_ROLES.includes(r))
  );

  // WHO IS "the job's own salesperson". By id when the job carries one. Otherwise by exact trimmed,
  // case-insensitive name — and only when EXACTLY ONE eligible person answers to it. Two people share
  // the name and nobody is promoted: a skip never guesses (the same rule the attribution backfill
  // holds). Being un-promoted costs a sort position; being guessed wrong puts the wrong name on money.
  const wantedId = (jobSalesperson?.id || '').trim();
  const wantedName = (jobSalesperson?.name || '').trim().toLowerCase();
  let ownId = '';
  if (wantedId && eligible.some((p) => p.id === wantedId)) {
    ownId = wantedId;
  } else if (wantedName) {
    const byName = eligible.filter((p) => (p.name || '').trim().toLowerCase() === wantedName);
    if (byName.length === 1) ownId = byName[0].id;
  }

  return eligible
    .slice()
    .sort((a, b) => {
      const ra = a.id === ownId ? 0 : 1;
      const rb = b.id === ownId ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return (a.name || '').localeCompare(b.name || '');
    });
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
