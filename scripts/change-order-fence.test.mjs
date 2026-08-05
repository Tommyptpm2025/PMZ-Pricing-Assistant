/**
 * FENCE for CHANGE-ORDER MATH (lib/change-orders.ts) — the foreman's on-the-spot change order,
 * per the gaveled ruling in COMPANY-ROSTER-AND-ROLES.md § "Foreman On-the-Spot Change Orders".
 *
 * Every number below is HAND-CALCULATED and written as a literal. A fence that computes its own
 * expectation with the same formula the code uses proves only that the code agrees with itself.
 *
 *   • PRICING at the parent's FROZEN margin through the SHARED Golden Formula: $1,000 cost at 20%
 *     prices at $1,250.00 (1000 ÷ 0.8). The formula is imported from lib/pricing.ts, never re-typed.
 *   • THE GAVELED LAW: a change order NEVER re-resolves the tier — not from its own size, not from
 *     the new combined job total. The parent's frozen margin is the only margin.
 *   • FROZEN MEANS FROZEN: the margin is copied at creation and a later parent edit cannot move it.
 *   • CEILING: at or under → 'quoted' (the foreman may quote on the spot); over → 'pending_approval',
 *     priced identically. $1,500.00 exactly is UNDER. $1,500.01 is over.
 *   • ORIGIN STAMP IS STRUCTURAL: no foreman id, no change order — it throws.
 *
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/change-order-fence.test.mjs
 */
import assert from "node:assert/strict";
import {
  createChangeOrder,
  priceChangeOrder,
  changeOrderTotalCost,
  changeOrderStatusForCost,
  isWithinChangeOrderCeiling,
  changeOrdersForJob,
  DEFAULT_CHANGE_ORDER_CEILING,
  CHANGE_ORDERS_KEY,
} from "../lib/change-orders.ts";
import { goldenFormula } from "../lib/pricing.ts";
import { changeOrderCeiling, EMPTY_COMPANY_SETTINGS } from "../lib/company-settings.ts";

// Deterministic clock + ids so the record is assertable byte for byte.
const AT = "2026-08-05T14:30:00.000Z";
let seq = 0;
const ids = () => `co_${++seq}`;
const make = (over = {}) =>
  createChangeOrder(
    {
      jobId: "job_1",
      quoteId: "q_1",
      foremanId: "p_foreman",
      parentMarginPct: 20,
      lines: [{ description: "Extra base course", qty: 1, rate: 1000 }],
      ...over,
    },
    () => AT,
    ids
  );

// ── 1 — PRICING AT THE PARENT'S FROZEN MARGIN ─────────────────────────────────────────────────────
// HAND-CALC: $1,000 break-even cost at a 20% parent margin → 1000 ÷ (1 − 0.20) = 1000 ÷ 0.8 = $1,250.00
assert.equal(priceChangeOrder(1000, 20), 1250.0, "$1,000 cost at a 20% parent margin prices at $1,250.00 (hand-calc: 1000 ÷ 0.8)");
seq = 0;
const co = make();
assert.equal(co.totalCost, 1000, "total cost is the sum of the entered resource costs");
assert.equal(co.priceCharged, 1250.0, "the RECORD carries that same $1,250.00 — one formula, one answer");
assert.equal(co.parentMarginPct, 20, "the parent's margin is copied onto the record");
assert.equal(co.autoPriced, true, "auto-priced is structural — this money was computed, never typed");

// THE SHARED FORMULA, NOT A LOCAL COPY. If lib/change-orders.ts ever grows its own cost ÷ (1 − m/100),
// these agree today and drift the day pricing.ts's guards change. Pinned across the guarded edges:
for (const [cost, margin] of [[1000, 20], [2500, 33.3], [7, 45], [1000, 0], [1000, 100], [1000, -5]]) {
  assert.equal(
    priceChangeOrder(cost, margin),
    Math.round(goldenFormula(cost, margin) * 100) / 100,
    `priceChangeOrder(${cost}, ${margin}) IS the imported goldenFormula — including its out-of-domain fallback to cost`
  );
}
// The guarded edges themselves, spelled out: a broken margin can never invent revenue.
assert.equal(priceChangeOrder(1000, 0), 1000, "a 0% margin prices at break-even cost — never Infinity, never NaN");
assert.equal(priceChangeOrder(1000, 100), 1000, "a 100% margin falls back to cost (the shared guard), not Infinity");

// Line costs tie out to the cent AS THE VALUE (rate × qty = the cost shown).
seq = 0;
const multi = make({
  lines: [
    { description: "Truck + driver", qty: 1.5, rate: 145.55 },   // 218.325 → 218.33
    { description: "Base material", qty: 12, rate: 41.67 },      // 500.04
  ],
});
assert.equal(multi.lines[0].cost, 218.33, "a line cost is qty × rate rounded to the cent AS THE VALUE");
assert.equal(multi.lines[1].cost, 500.04, "…and so is the next");
assert.equal(multi.totalCost, 718.37, "the total is the sum of the rounded line costs (218.33 + 500.04)");
assert.equal(changeOrderTotalCost([{ qty: 1.5, rate: 145.55 }, { qty: 12, rate: 41.67 }]), 718.37, "the pure total agrees");
console.log("PASS: change-order pricing — $1,000 at a 20% parent margin prices at $1,250.00; the price comes from the SHARED goldenFormula (guarded edges included), never a local copy; line costs round to the cent as the value and tie out to the total");

// ── 2 — THE GAVELED LAW: THE TIER IS NEVER RE-RESOLVED ────────────────────────────────────────────
// A change order is priced at the PARENT's margin — not its own size, not the combined job total.
// A tiny $200 add-on and a $9,000 one on the same parent both price at 20%.
seq = 0;
const small = make({ lines: [{ description: "One pallet", qty: 1, rate: 200 }] });
seq = 0;
const large = make({ lines: [{ description: "Full day crew", qty: 1, rate: 9000 }] });
assert.equal(small.parentMarginPct, 20, "a small change order still carries the PARENT's margin");
assert.equal(large.parentMarginPct, 20, "a large one carries the SAME parent margin — size never re-resolves the tier");
assert.equal(small.priceCharged, 250.0, "hand-calc: 200 ÷ 0.8 = $250.00");
assert.equal(large.priceCharged, 11250.0, "hand-calc: 9000 ÷ 0.8 = $11,250.00 — NOT a bigger-job tier");
// MUTATION TARGET (a): price from the frozen parent margin, never from a combined total. If pricing
// re-resolved a margin from (parent contract + this change order), these literals move.
assert.equal(
  make({ parentMarginPct: 20, lines: [{ description: "x", qty: 1, rate: 1000 }] }).priceCharged,
  1250.0,
  "PRICED FROM THE FROZEN PARENT MARGIN ONLY — a margin re-resolved from the combined job total is the gaveled law being broken"
);

// FROZEN MEANS FROZEN: the record copies the margin, it does not hold a reference to the parent.
const parentQuote = { id: "q_1", margin: 20 };
seq = 0;
const beforeEdit = make({ parentMarginPct: parentQuote.margin });
parentQuote.margin = 45; // the owner re-prices the parent bid AFTER the change order was quoted
assert.equal(beforeEdit.parentMarginPct, 20, "a later parent edit does NOT move the frozen margin already on the record");
assert.equal(beforeEdit.priceCharged, 1250.0, "…so the price the customer was quoted cannot be retroactively changed");
console.log("PASS: change-order margin law — the parent's FROZEN margin is the only margin: size never re-resolves the tier, the combined job total never re-resolves it, and a later parent edit can never reprice work already quoted");

// ── 3 — THE CEILING ───────────────────────────────────────────────────────────────────────────────
// "At or below" the ceiling the foreman may quote on the spot; above it, the change order is held.
assert.equal(DEFAULT_CHANGE_ORDER_CEILING, 1500, "the ruling's default ceiling is $1,500");
assert.equal(isWithinChangeOrderCeiling(1500.0, 1500), true, "EXACTLY at the ceiling counts as UNDER it");
assert.equal(isWithinChangeOrderCeiling(1500.01, 1500), false, "one cent over is over");
assert.equal(changeOrderStatusForCost(1499.99, 1500), "quoted", "under → the foreman quotes on the spot");
assert.equal(changeOrderStatusForCost(1500.0, 1500), "quoted", "AT the ceiling → still quoted (the boundary dollar is quotable)");
// MUTATION TARGET (b): break this comparison and $1,500.01 quotes on the spot.
assert.equal(changeOrderStatusForCost(1500.01, 1500), "pending_approval", "ONE CENT OVER the ceiling is HELD for the salesperson or boss — never quoted on the spot");

seq = 0;
const atCeiling = make({ lines: [{ description: "At the line", qty: 1, rate: 1500 }] });
assert.equal(atCeiling.status, "quoted", "a $1,500.00 change order saves as quoted");
assert.equal(atCeiling.priceCharged, 1875.0, "…priced at the parent margin all the same: 1500 ÷ 0.8 = $1,875.00");
seq = 0;
const overCeiling = make({ lines: [{ description: "One cent over", qty: 1, rate: 1500.01 }] });
assert.equal(overCeiling.status, "pending_approval", "a $1,500.01 change order is HELD");
assert.equal(overCeiling.priceCharged, 1875.01, "…and is priced IDENTICALLY while it waits (1500.01 ÷ 0.8 = 1875.0125 → $1,875.01). Only the hold differs.");
assert.equal(overCeiling.autoPriced, true, "a held change order is still auto-priced — no second price path (Law 56)");

// An owner-set ceiling overrides the default; a blank one falls back to it and is NEVER zero.
seq = 0;
assert.equal(make({ ceiling: 500, lines: [{ description: "x", qty: 1, rate: 600 }] }).status, "pending_approval", "an owner-set $500 ceiling holds a $600 change order");
assert.equal(changeOrderCeiling(EMPTY_COMPANY_SETTINGS), 1500, "an UNSET ceiling in company settings is the $1,500 default — never 0, which would hold everything");
assert.equal(changeOrderCeiling({ limits: { change_order_ceiling_dollars: "2500" } }), 2500, "a stored ceiling is read from company settings");
assert.equal(changeOrderCeiling({ limits: { change_order_ceiling_dollars: "  " } }), 1500, "whitespace is not a ceiling — default");
assert.equal(changeOrderCeiling({ limits: { change_order_ceiling_dollars: "abc" } }), 1500, "a non-numeric ceiling falls back to the default");
assert.equal(changeOrderCeiling({ limits: { change_order_ceiling_dollars: "-10" } }), 1500, "a negative ceiling is not a ceiling — default");
assert.equal(changeOrderCeiling({ limits: { change_order_ceiling_dollars: "0" } }), 0, "an EXPLICIT zero is honored — the owner may hold every change order on purpose");
console.log("PASS: change-order ceiling — $1,500.00 exactly is quotable and $1,500.01 is held; a held order is priced identically (only the hold differs); an owner-set ceiling wins and a blank one falls back to $1,500, never silently 0");

// ── 4 — THE ORIGIN STAMP IS STRUCTURAL ────────────────────────────────────────────────────────────
// These extras are typically high-margin work and must stay LABELED in history — never blending
// invisibly into year-end derivation (Law 5). A record that cannot say who and where is refused.
assert.throws(
  () => make({ foremanId: "" }),
  /foreman id/i,
  "creation WITHOUT a foremanId throws — every change order is attributed to a person on the roster"
);
assert.throws(() => make({ foremanId: "   " }), /foreman id/i, "whitespace is not an id");
assert.throws(() => make({ jobId: "" }), /job/i, "creation without a jobId throws — the origin stamp is structural");
seq = 0;
const stamped = make();
assert.equal(stamped.foremanId, "p_foreman", "the foreman id is stamped on the record");
assert.equal(stamped.jobId, "job_1", "…with the job");
assert.equal(stamped.quoteId, "q_1", "…and the parent bid when there is one");
assert.equal(stamped.createdAt, AT, "…and the timestamp");
assert.equal(stamped.status, "quoted", "a $1,000 change order is inside the default ceiling");
assert.equal(CHANGE_ORDERS_KEY, "pmz_change_orders_v1", "change orders live in their own store key");
seq = 0;
const noQuote = createChangeOrder(
  { jobId: "job_2", foremanId: "p_foreman", parentMarginPct: 20, lines: [] },
  () => AT,
  ids
);
assert.equal("quoteId" in noQuote, false, "a job with no parent bid (a demo job) carries no quoteId key at all — never an empty string");
assert.equal(noQuote.totalCost, 0, "an empty change order costs nothing");
assert.equal(noQuote.priceCharged, 0, "…and prices at nothing — never NaN");
assert.deepEqual(
  changeOrdersForJob([stamped, noQuote], "job_1").map((c) => c.jobId),
  ["job_1"],
  "change orders are looked up by their job"
);
console.log("PASS: change-order origin stamp — foreman id, job, timestamp and auto-priced are all required; creation without a foreman id or a job THROWS rather than minting an unattributable record; the store key is pmz_change_orders_v1");
