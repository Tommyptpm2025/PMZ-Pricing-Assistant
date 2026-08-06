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
  appliedChangeOrderCeiling,
  effectiveChangeOrderCeiling,
  decideChangeOrder,
  decideChangeOrderInList,
  canDecideChangeOrder,
  isChangeOrderLocked,
  pendingChangeOrders,
  changeOrderApprovers,
  DEFAULT_CHANGE_ORDER_CEILING,
  CHANGE_ORDERS_KEY,
} from "../lib/change-orders.ts";
import { personOnTheSpotLimit, normalizePerson, authorityChangeSentence } from "../lib/people.ts";
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

// ── 5 — THE FOREMAN'S OWN AUTHORITY: THE LAYERED CEILING ──────────────────────────────────────────
// AUTHORITY BELONGS TO THE PERSON, NOT THE JOB (owner's ruling, 2026-08-06). A foreman may carry his
// own on-the-spot limit on his roster record; when he does it OVERRIDES the company default — up or
// down — on EVERY job he runs. When he does not, the company number applies, unchanged.
//
// THE LITERAL CASES, hand-stated: Tim's $5,000 against a company $1,500 → a $4,000-COST change order
// quotes ON THE SPOT for TIM (the same order is held for the man with no personal limit).
assert.deepEqual(
  appliedChangeOrderCeiling(5000, 1500),
  { amount: 5000, source: "foreman" },
  "the FOREMAN's $5,000 authority overrides the company's $1,500 — and the reader says WHOSE limit applied"
);
assert.equal(effectiveChangeOrderCeiling(5000, 1500), 5000, "…the amount agrees");
assert.equal(
  changeOrderStatusForCost(4000, effectiveChangeOrderCeiling(5000, 1500)),
  "quoted",
  "foreman 5000 / company 1500: a $4,000-COST change order QUOTES ON THE SPOT for THAT foreman"
);
// MUTATION TARGET (c): make the reader ignore the personal limit and this same order is held at 1500.
assert.equal(
  changeOrderStatusForCost(4000, effectiveChangeOrderCeiling(undefined, 1500)),
  "pending_approval",
  "…the very same $4,000 order IS HELD for a foreman with NO personal limit — which is exactly what authority-follows-the-man changes"
);
assert.deepEqual(
  appliedChangeOrderCeiling(undefined, 1500),
  { amount: 1500, source: "company" },
  "NO personal limit → the COMPANY default applies, and says so"
);
assert.deepEqual(appliedChangeOrderCeiling(null, 1500), { amount: 1500, source: "company" }, "null is not a limit — company");
assert.deepEqual(appliedChangeOrderCeiling(NaN, 1500), { amount: 1500, source: "company" }, "NaN is not a limit — company");
assert.deepEqual(appliedChangeOrderCeiling(-10, 1500), { amount: 1500, source: "company" }, "a negative is not a limit — company");
assert.deepEqual(
  appliedChangeOrderCeiling(0, 1500),
  { amount: 0, source: "foreman" },
  "an EXPLICIT 0 IS a ceiling — a foreman may be held to calling in every single time, on purpose"
);
assert.equal(
  changeOrderStatusForCost(0.01, effectiveChangeOrderCeiling(0, 1500)),
  "pending_approval",
  "…and under a personal ceiling of 0 even a one-cent change order is held"
);
// A tightened personal limit works the same way in the other direction.
assert.deepEqual(appliedChangeOrderCeiling(500, 1500), { amount: 500, source: "foreman" }, "a personal limit BELOW the company default also wins");
assert.equal(changeOrderStatusForCost(600, effectiveChangeOrderCeiling(500, 1500)), "pending_approval", "…$600 is held for a $500 foreman");

// THE LIMIT IS READ OFF THE ACTING FOREMAN — the same $4,000 order, two different men, two outcomes.
const TIM = { id: "p_tim", name: "Tim", roles: ["foreman"], active: true, onTheSpotLimitDollars: 5000, createdAt: AT };
const NEW_MAN = { id: "p_new", name: "New Man", roles: ["foreman"], active: true, createdAt: AT };
const crew = [TIM, NEW_MAN];
assert.equal(personOnTheSpotLimit(crew, "p_tim"), 5000, "Tim's authority is read off HIS roster record");
assert.equal(personOnTheSpotLimit(crew, "p_new"), undefined, "the new man carries none of his own");
assert.equal(personOnTheSpotLimit(crew, "p_nobody"), undefined, "an unknown id carries none — never a guessed one");
assert.equal(
  changeOrderStatusForCost(4000, effectiveChangeOrderCeiling(personOnTheSpotLimit(crew, "p_tim"), 1500)),
  "quoted",
  "TIM quotes the $4,000 change order on the spot"
);
assert.equal(
  changeOrderStatusForCost(4000, effectiveChangeOrderCeiling(personOnTheSpotLimit(crew, "p_new"), 1500)),
  "pending_approval",
  "…and the NEW MAN's identical $4,000 change order is held. Trust follows the man, not the job."
);
// A malformed stored authority is NO authority — the fallback is the company default, the safe way.
assert.equal(normalizePerson({ name: "Bad", onTheSpotLimitDollars: "2500" }).onTheSpotLimitDollars, undefined, "a STRING authority is not a limit — company default");
assert.equal(normalizePerson({ name: "Bad", onTheSpotLimitDollars: -5 }).onTheSpotLimitDollars, undefined, "a negative authority is not a limit");
assert.equal(normalizePerson({ name: "Good", onTheSpotLimitDollars: 2500 }).onTheSpotLimitDollars, 2500, "a real number survives the load");
assert.equal(normalizePerson({ name: "Held", onTheSpotLimitDollars: 0 }).onTheSpotLimitDollars, 0, "…and so does an explicit 0");

// Creation honors the layered number, because the page hands it THIS foreman's resolved amount.
seq = 0;
const timsOrder = make({
  foremanId: "p_tim",
  ceiling: effectiveChangeOrderCeiling(personOnTheSpotLimit(crew, "p_tim"), 1500),
  lines: [{ description: "Extra day", qty: 1, rate: 4000 }],
});
assert.equal(timsOrder.status, "quoted", "a $4,000 change order written by Tim saves as QUOTED");
assert.equal(timsOrder.priceCharged, 5000.0, "…priced at the parent margin as always: 4000 ÷ 0.8 = $5,000.00");
seq = 0;
const newMansOrder = make({
  foremanId: "p_new",
  ceiling: effectiveChangeOrderCeiling(personOnTheSpotLimit(crew, "p_new"), 1500),
  lines: [{ description: "Extra day", qty: 1, rate: 4000 }],
});
assert.equal(newMansOrder.status, "pending_approval", "the identical order written by the new man is HELD");
assert.equal(newMansOrder.priceCharged, 5000.0, "…and is priced IDENTICALLY. Only the authority differs — never the money.");

// CHANGING IT IS A PERMISSION CHANGE, and the roster confirms it in plain words.
assert.equal(
  authorityChangeSentence("Tim", undefined, 2500),
  "Set Tim's on-the-spot authority to $2,500?",
  "granting authority is confirmed by name and amount — the sentence the roster actually shows"
);
assert.equal(authorityChangeSentence("Tim", 2500, 5000), "Set Tim's on-the-spot authority to $5,000?", "…and so is raising it");
assert.equal(authorityChangeSentence("Tim", 2500, 0), "Set Tim's on-the-spot authority to $0?", "…and holding him to calling in every time");
assert.equal(
  authorityChangeSentence("Tim", 2500, undefined),
  "Remove Tim's own on-the-spot authority and fall back to the company limit?",
  "…and taking it away says exactly that"
);
assert.equal(authorityChangeSentence("Tim", 2500, 2500), null, "an unchanged authority asks for NO confirmation — no ceremony over nothing");
assert.equal(authorityChangeSentence("Tim", undefined, undefined), null, "…nor does leaving a man on the company default");
assert.equal(authorityChangeSentence("Tim", 2500, -1), "Remove Tim's own on-the-spot authority and fall back to the company limit?", "a malformed new value is no authority, and is confirmed as the removal it is");
console.log("PASS: on-the-spot authority follows the FOREMAN — his own limit overrides the company default in the ONE layered reader (Tim's 5000 over company 1500 lets his $4,000 order quote on the spot while the same order from a man with no personal limit is held, priced identically), a malformed stored limit falls back to the company, and changing it is confirmed as the permission change it is");

// ── 6 — THE APPROVAL DESK ─────────────────────────────────────────────────────────────────────────
// Three doors out of 'pending_approval', and only out of 'pending_approval'. A decision moves STATUS
// and never money.
const DECIDED_AT = "2026-08-06T16:45:00.000Z";
const held = () => {
  seq = 0;
  return make({ ceiling: 1500, lines: [{ description: "Rock excavation", qty: 1, rate: 4000 }] });
};
const beforeHeld = held();
assert.equal(beforeHeld.status, "pending_approval", "a $4,000-cost order over a $1,500 ceiling starts HELD");
assert.equal(beforeHeld.priceCharged, 5000.0, "…priced at $5,000.00 (4000 ÷ 0.8) while it waits");
assert.equal(beforeHeld.decision, undefined, "…and carries no decision until somebody makes one");
assert.equal(canDecideChangeOrder(beforeHeld), true, "a held order is decidable");
assert.equal(isChangeOrderLocked(beforeHeld), false, "…and is the ONLY state that is not locked");

// APPROVE & RELEASE → 'quoted'. The foreman may now quote the SAME price he was shown.
const approved = decideChangeOrder(beforeHeld, { action: "approve", decidedBy: "p_sales", note: "Called the owner, he's good for it." }, () => DECIDED_AT);
assert.equal(approved.status, "quoted", "APPROVE & RELEASE moves the order to QUOTED — the foreman may now quote it");
assert.equal(approved.decision.action, "approve", "…stamped as an approval");
assert.equal(approved.decision.decidedBy, "p_sales", "…with the approver's roster id (the ruling's approvedBy)");
assert.equal(approved.decision.decidedAt, DECIDED_AT, "…and the timestamp");
assert.equal(approved.decision.note, "Called the owner, he's good for it.", "…and the optional note when one was given");
assert.equal(isChangeOrderLocked(approved), true, "an approved order is LOCKED — no edits after a decision");

// MONEY IS BYTE-IDENTICAL ACROSS EVERY TRANSITION. Approving is agreeing to the number already
// computed — a decision that could reprice would be a second price path (Law 56) wearing a signature.
const moneyOf = (co) => JSON.stringify({ totalCost: co.totalCost, priceCharged: co.priceCharged, parentMarginPct: co.parentMarginPct, autoPriced: co.autoPriced, lines: co.lines });
const declined = decideChangeOrder(beforeHeld, { action: "decline", decidedBy: "p_boss", reason: "Customer never authorized the extra depth." }, () => DECIDED_AT);
const converted = decideChangeOrder(beforeHeld, { action: "convert", decidedBy: "p_boss", note: "Price it properly through the Pricer as new scope." }, () => DECIDED_AT);
for (const [label, after] of [["approve", approved], ["decline", declined], ["convert", converted]]) {
  assert.equal(moneyOf(after), moneyOf(beforeHeld), `${label}: the priced money is BYTE-IDENTICAL to what it was while held — status moved, money did not`);
  assert.equal(after.priceCharged, 5000.0, `${label}: still exactly $5,000.00`);
  assert.equal(after.parentMarginPct, 20, `${label}: the frozen parent margin is untouched`);
  assert.equal(after.foremanId, "p_foreman", `${label}: the origin stamp survives the decision`);
  assert.equal(after.createdAt, AT, `${label}: …including when the foreman wrote it`);
}
assert.equal(beforeHeld.status, "pending_approval", "the INPUT record is never mutated — a decision returns a new one");

// DECLINE → 'declined', reason REQUIRED (the why discipline, kept searchable in the record).
assert.equal(declined.status, "declined", "DECLINE moves the order to DECLINED");
assert.equal(declined.decision.reason, "Customer never authorized the extra depth.", "…carrying the REASON in the record");
assert.throws(
  () => decideChangeOrder(beforeHeld, { action: "decline", decidedBy: "p_boss" }, () => DECIDED_AT),
  /reason/i,
  "a decline with NO reason throws — the why is the record"
);
assert.throws(
  () => decideChangeOrder(beforeHeld, { action: "decline", decidedBy: "p_boss", reason: "   " }, () => DECIDED_AT),
  /reason/i,
  "…and whitespace is not a reason"
);

// MAKE THIS A QUOTED ADDITION → a FLAG, not an automation. Nothing here mints a quote.
assert.equal(converted.status, "converted_to_quote", "CONVERT labels the order as a quoted addition and leaves it in history");
assert.equal(converted.decision.action, "convert", "…stamped as the conversion it was");
assert.equal(converted.decision.decidedBy, "p_boss", "…by a named person");
assert.equal(converted.decision.note, "Price it properly through the Pricer as new scope.", "…with the note directing where the work gets priced");
assert.equal(converted.lines.length, 1, "the change order KEEPS its resources — it is history, not a deleted record");

// THE STAMP IS STRUCTURAL — no approver, no decision.
// MUTATION TARGET (d): allow an approve without an approver id and this throw is the fence that fails.
assert.throws(
  () => decideChangeOrder(beforeHeld, { action: "approve", decidedBy: "" }, () => DECIDED_AT),
  /approver|person who made it/i,
  "APPROVE WITHOUT AN APPROVER ID THROWS — a release nobody signed is not a decision"
);
assert.throws(
  () => decideChangeOrder(beforeHeld, { action: "approve", decidedBy: "   " }, () => DECIDED_AT),
  /approver|person who made it/i,
  "whitespace is not an approver"
);
assert.throws(
  () => decideChangeOrder(beforeHeld, { action: "convert", decidedBy: "" }, () => DECIDED_AT),
  /approver|person who made it/i,
  "…and a conversion needs a name too"
);

// A DECIDED ORDER IS CLOSED. No second decision, from any door, ever overwrites the first.
for (const [label, decided] of [["approved", approved], ["declined", declined], ["converted", converted]]) {
  for (const action of ["approve", "decline", "convert"]) {
    assert.throws(
      () => decideChangeOrder(decided, { action, decidedBy: "p_boss", reason: "changed my mind" }, () => DECIDED_AT),
      /already|waiting for approval/i,
      `an ${label} change order REFUSES a later '${action}' — history that can be re-decided is not history`
    );
  }
}
// A born-quoted order (under the ceiling) was never at the desk and cannot be decided either.
seq = 0;
const bornQuoted = make();
assert.equal(bornQuoted.status, "quoted", "a $1,000 order under the ceiling is born quoted");
assert.equal(canDecideChangeOrder(bornQuoted), false, "…and is not a pending decision");
assert.equal(isChangeOrderLocked(bornQuoted), true, "…it is locked like every non-held order");
assert.throws(() => decideChangeOrder(bornQuoted, { action: "approve", decidedBy: "p_boss" }, () => DECIDED_AT), /already|waiting for approval/i, "…so approving it throws");

// The list-level applier: one record changes, every other passes through BY REFERENCE.
const otherCo = (() => { seq = 20; return make({ jobId: "job_9", lines: [{ description: "Other job", qty: 1, rate: 100 }] }); })();
const list = [beforeHeld, otherCo];
const afterList = decideChangeOrderInList(list, beforeHeld.id, { action: "approve", decidedBy: "p_sales" }, () => DECIDED_AT);
assert.equal(afterList[0].status, "quoted", "the targeted change order is decided in the list");
assert.equal(afterList[1], otherCo, "every OTHER change order passes through by the same reference — untouched");
assert.equal(moneyOf(afterList[0]), moneyOf(beforeHeld), "…and the decided one's money is byte-identical through the list path too");
assert.throws(
  () => decideChangeOrderInList(list, "co_nope", { action: "approve", decidedBy: "p_sales" }, () => DECIDED_AT),
  /no longer in the record/i,
  "deciding a change order that isn't there throws rather than silently doing nothing"
);
assert.deepEqual(
  pendingChangeOrders([beforeHeld, approved, declined, converted, bornQuoted], "job_1").map((c) => c.status),
  ["pending_approval"],
  "the desk's queue is the HELD orders on that job — never the decided ones"
);
console.log("PASS: change-order approval desk — approve releases to QUOTED, decline requires a reason, convert flags a quoted addition and keeps it in history; every decision is stamped who+when and THROWS without an approver id; a decided order refuses every later transition; and across all three doors the priced money is byte-identical");

// ── 7 — WHO MAY DECIDE ────────────────────────────────────────────────────────────────────────────
// YOUR DEAL, YOUR SIGNATURE — OR THE BOSS'S. The job's own salesperson and the bosses. Nobody else:
// a PEER SALESPERSON has no authority over someone else's deal, a foreman never signs his own change
// order, and the accountant reads the money without changing it.
const roster = [
  { id: "p1", name: "Zoe Boss", roles: ["boss"], active: true },
  { id: "p2", name: "Adam Sales", roles: ["salesperson"], active: true },
  { id: "p3", name: "Frank Foreman", roles: ["foreman"], active: true },
  { id: "p4", name: "Nina Numbers", roles: ["accountant"], active: true },
  { id: "p5", name: "Gone Boss", roles: ["boss"], active: false },
  { id: "p6", name: "Mia Multi", roles: ["foreman", "salesperson"], active: true },
];
// THE TIGHTENED RULE, stated as its own case: with no job salesperson resolved, ONLY bosses remain.
assert.deepEqual(
  changeOrderApprovers(roster).map((p) => p.id),
  ["p1"],
  "with no job salesperson resolved, the ONLY approvers are the bosses"
);
// MUTATION TARGET (e): loosen this to "anyone holding the salesperson role" and these two flip.
assert.equal(
  changeOrderApprovers(roster, { id: "p2" }).some((p) => p.id === "p6"),
  false,
  "A PEER SALESPERSON IS REJECTED — Mia holds the salesperson role but this is not her deal, and holding the role is not authority over someone else's margin"
);
assert.equal(
  changeOrderApprovers(roster).some((p) => p.id === "p2"),
  false,
  "…and a salesperson who is not THIS job's salesperson is not offered either, boss role or nothing"
);
assert.equal(changeOrderApprovers(roster).some((p) => p.id === "p3"), false, "a FOREMAN is never an approver — he does not sign his own change order");
assert.equal(changeOrderApprovers(roster).some((p) => p.id === "p4"), false, "the accountant reads the money and changes nothing — not an approver");
assert.equal(changeOrderApprovers(roster).some((p) => p.id === "p5"), false, "a departed boss is not pickable");

// The job's own salesperson is offered, and offered FIRST — their deal, their signature.
assert.deepEqual(
  changeOrderApprovers(roster, { id: "p2" }).map((p) => p.id),
  ["p2", "p1"],
  "THE JOB'S OWN SALESPERSON FIRST, then the boss — the escalation path is a BOSS, never the nearest available peer"
);
assert.deepEqual(
  changeOrderApprovers(roster, { name: "  adam sales  " }).map((p) => p.id),
  ["p2", "p1"],
  "…resolved by trimmed, case-insensitive NAME when the job carries only a name string"
);
assert.deepEqual(
  changeOrderApprovers(roster, { id: "p6" }).map((p) => p.id),
  ["p6", "p1"],
  "…and Mia IS an approver on the job SHE sold — the rule is whose deal it is, not who she is"
);
assert.deepEqual(
  changeOrderApprovers(roster, { id: "p3" }).map((p) => p.id),
  ["p1"],
  "a job 'salesperson' id that belongs to a FOREMAN resolves to nobody — a stale name can never let him approve his own change order"
);
assert.deepEqual(
  changeOrderApprovers(roster, { name: "Gone Boss" }).map((p) => p.id),
  ["p1"],
  "an inactive person is never resolved as the job's salesperson"
);
// An owner who is both the boss and the salesperson on his own bid appears ONCE, at the top.
const soloOwner = [{ id: "o1", name: "Tom Owner", roles: ["salesperson", "boss"], active: true }];
assert.deepEqual(
  changeOrderApprovers(soloOwner, { id: "o1" }).map((p) => p.id),
  ["o1"],
  "the one-person company's owner is his own approver — listed ONCE, never twice"
);
const twins = [
  { id: "t1", name: "Sam Twin", roles: ["salesperson"], active: true },
  { id: "t2", name: "Sam Twin", roles: ["salesperson"], active: true },
  { id: "t3", name: "Ada Boss", roles: ["boss"], active: true },
];
assert.deepEqual(
  changeOrderApprovers(twins, { name: "Sam Twin" }).map((p) => p.id),
  ["t3"],
  "two salespeople share the name → NEITHER is resolved and only the boss may decide. A skip never guesses; a wrong guess hands someone else's deal to the wrong signature"
);
assert.deepEqual(changeOrderApprovers([]).map((p) => p.id), [], "an empty roster has no approvers — the desk says so rather than inventing one");
assert.deepEqual(roster.map((p) => p.id), ["p1", "p2", "p3", "p4", "p5", "p6"], "the roster passed in is never reordered — the list is built, not sorted in place");
console.log("PASS: change-order approvers — ONLY the job's own salesperson (listed first, resolved by id or unambiguous name) and the bosses; a peer salesperson is rejected outright, as are the foreman, the accountant and anyone inactive, and a dual-role owner appears exactly once");
