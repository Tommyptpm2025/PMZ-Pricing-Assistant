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
import { setJobOnTheSpotLimit } from "../lib/jobs.ts";
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

// ── 5 — PER-JOB AUTHORITY: THE LAYERED CEILING ────────────────────────────────────────────────────
// A job may carry its OWN on-the-spot authority, set by leadership. When it does it OVERRIDES the
// company default — up or down. When it does not, the company number applies, unchanged.
//
// THE LITERAL CASES, hand-stated: job $5,000 over a company $1,500 → a $4,000-COST change order
// quotes ON THE SPOT (it would have been held under the company number). No job limit → company.
assert.deepEqual(
  appliedChangeOrderCeiling(5000, 1500),
  { amount: 5000, source: "job" },
  "the JOB's $5,000 authority overrides the company's $1,500 — and the reader says WHICH limit applied"
);
assert.equal(effectiveChangeOrderCeiling(5000, 1500), 5000, "…the amount agrees");
assert.equal(
  changeOrderStatusForCost(4000, effectiveChangeOrderCeiling(5000, 1500)),
  "quoted",
  "job 5000 / company 1500: a $4,000-COST change order QUOTES ON THE SPOT under the job's authority"
);
// MUTATION TARGET (c): drop the job layer and this same order is held under the company's $1,500.
assert.equal(
  changeOrderStatusForCost(4000, 1500),
  "pending_approval",
  "…the very same $4,000 order WOULD be held at the company's $1,500 — which is exactly what the per-job authority changes"
);
assert.deepEqual(
  appliedChangeOrderCeiling(undefined, 1500),
  { amount: 1500, source: "company" },
  "NO job limit → the COMPANY default applies, and says so"
);
assert.deepEqual(appliedChangeOrderCeiling(null, 1500), { amount: 1500, source: "company" }, "null is not a limit — company");
assert.deepEqual(appliedChangeOrderCeiling(NaN, 1500), { amount: 1500, source: "company" }, "NaN is not a limit — company");
assert.deepEqual(appliedChangeOrderCeiling(-10, 1500), { amount: 1500, source: "company" }, "a negative is not a limit — company");
assert.deepEqual(
  appliedChangeOrderCeiling(0, 1500),
  { amount: 0, source: "job" },
  "an EXPLICIT 0 on the job IS a ceiling — leadership may hold every change order on this one job on purpose"
);
assert.equal(
  changeOrderStatusForCost(0.01, effectiveChangeOrderCeiling(0, 1500)),
  "pending_approval",
  "…and under a job ceiling of 0 even a one-cent change order is held"
);
// A tightened job limit works the same way in the other direction.
assert.deepEqual(appliedChangeOrderCeiling(500, 1500), { amount: 500, source: "job" }, "a job limit BELOW the company default also wins");
assert.equal(changeOrderStatusForCost(600, effectiveChangeOrderCeiling(500, 1500)), "pending_approval", "…$600 is held on a $500 job");
// Creation honors the layered number, because the page hands it the resolved amount.
seq = 0;
const onBigJob = make({ ceiling: effectiveChangeOrderCeiling(5000, 1500), lines: [{ description: "Extra day", qty: 1, rate: 4000 }] });
assert.equal(onBigJob.status, "quoted", "a $4,000 change order minted on the $5,000 job saves as QUOTED");
assert.equal(onBigJob.priceCharged, 5000.0, "…priced at the parent margin as always: 4000 ÷ 0.8 = $5,000.00");

// SETTING IT IS STAMPED, and touches nothing else on the job.
const JOB_AT = "2026-08-06T09:15:00.000Z";
const baseJob = {
  id: "job_1",
  createdAt: "2026-07-01T00:00:00.000Z",
  status: "open",
  jobName: "Elm Street",
  contractValue: 18750,
  bidItems: [{ id: "b1", description: "Paving", quantity: 1, unit: "LS", unitPrice: 18750 }],
  recipeLines: [],
  rowCostBasis: { r1: 41.67 },
  attachments: [],
  notes: "",
};
const other = { ...baseJob, id: "job_2" };
const setList = setJobOnTheSpotLimit([baseJob, other], "job_1", 5000, "p_boss", () => JOB_AT);
assert.equal(setList[0].onTheSpotLimitDollars, 5000, "the job carries its own on-the-spot authority");
assert.equal(setList[0].onTheSpotLimitSetBy, "p_boss", "…stamped with WHO set it");
assert.equal(setList[0].onTheSpotLimitSetAt, JOB_AT, "…and WHEN");
assert.equal(setList[1], other, "every other job is returned by the SAME reference — untouched");
assert.equal(setList[0].contractValue, 18750, "MONEY UNTOUCHED: the contract value is unchanged");
assert.deepEqual(setList[0].bidItems, baseJob.bidItems, "…the bid items are unchanged");
assert.deepEqual(setList[0].rowCostBasis, baseJob.rowCostBasis, "…and the owner cost basis is unchanged");
assert.equal(baseJob.onTheSpotLimitDollars, undefined, "the input job was NOT mutated");
// Clearing falls back to the company default — and still records who cleared it.
const cleared = setJobOnTheSpotLimit(setList, "job_1", null, "p_boss2", () => JOB_AT);
assert.equal(cleared[0].onTheSpotLimitDollars, undefined, "clearing removes the job's override");
assert.equal(cleared[0].onTheSpotLimitSetBy, "p_boss2", "…and stamps who took it away");
assert.deepEqual(
  appliedChangeOrderCeiling(cleared[0].onTheSpotLimitDollars, 1500),
  { amount: 1500, source: "company" },
  "…so the job falls back to the company default"
);
assert.equal(
  setJobOnTheSpotLimit(setList, "job_1", 0, "p_boss", () => JOB_AT)[0].onTheSpotLimitDollars,
  0,
  "an explicit 0 is STORED as 0 — never collapsed to 'unset', which would hand back authority just taken away"
);
assert.throws(
  () => setJobOnTheSpotLimit([baseJob], "job_1", 5000, "  ", () => JOB_AT),
  /leadership decision/i,
  "setting a job's authority WITHOUT a person throws — an anonymous change to how much a foreman may commit is not a decision"
);
console.log("PASS: per-job on-the-spot authority — a job's own limit overrides the company default in the ONE layered reader (job 5000 over company 1500 lets a $4,000 order quote on the spot; no job limit falls back to company; an explicit 0 holds everything), setting or clearing it is stamped who+when, and no other field on the job — money included — is touched");

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
// Salespeople and bosses only — and the job's own salesperson FIRST, because they priced the deal
// this extra rides on. Foremen never appear: the man who wrote the change order does not sign it.
const roster = [
  { id: "p1", name: "Zoe Boss", roles: ["boss"], active: true },
  { id: "p2", name: "Adam Sales", roles: ["salesperson"], active: true },
  { id: "p3", name: "Frank Foreman", roles: ["foreman"], active: true },
  { id: "p4", name: "Nina Numbers", roles: ["accountant"], active: true },
  { id: "p5", name: "Gone Salesperson", roles: ["salesperson"], active: false },
  { id: "p6", name: "Mia Multi", roles: ["foreman", "salesperson"], active: true },
];
assert.deepEqual(
  changeOrderApprovers(roster).map((p) => p.id),
  ["p2", "p6", "p1"],
  "eligible = ACTIVE salespeople and bosses, alphabetical (Adam, Mia, Zoe) — a foreman-and-salesperson qualifies on the salesperson role"
);
assert.equal(changeOrderApprovers(roster).some((p) => p.id === "p3"), false, "a plain FOREMAN is never an approver — he does not sign his own change order");
assert.equal(changeOrderApprovers(roster).some((p) => p.id === "p4"), false, "the accountant reads the money and changes nothing — not an approver");
assert.equal(changeOrderApprovers(roster).some((p) => p.id === "p5"), false, "a departed salesperson is not pickable");
assert.deepEqual(
  changeOrderApprovers(roster, { id: "p1" }).map((p) => p.id),
  ["p1", "p2", "p6"],
  "THE JOB'S OWN SALESPERSON IS LISTED FIRST when the job carries their id"
);
assert.deepEqual(
  changeOrderApprovers(roster, { name: "  adam sales  " }).map((p) => p.id),
  ["p2", "p6", "p1"],
  "…and by trimmed, case-insensitive NAME when the job only carries a name string"
);
assert.deepEqual(
  changeOrderApprovers(roster, { id: "p3" }).map((p) => p.id),
  ["p2", "p6", "p1"],
  "a job salesperson who isn't eligible promotes NOBODY — it never adds an ineligible person to the list"
);
const twins = [
  { id: "t1", name: "Sam Twin", roles: ["salesperson"], active: true },
  { id: "t2", name: "Sam Twin", roles: ["boss"], active: true },
  { id: "t3", name: "Ada First", roles: ["salesperson"], active: true },
];
assert.deepEqual(
  changeOrderApprovers(twins, { name: "Sam Twin" }).map((p) => p.id),
  ["t3", "t1", "t2"],
  "two people share the name → NOBODY is promoted. A skip never guesses; being un-promoted costs a sort position, a wrong guess puts the wrong name on money"
);
assert.deepEqual(changeOrderApprovers([]).map((p) => p.id), [], "an empty roster has no approvers — the desk says so rather than inventing one");
console.log("PASS: change-order approvers — only ACTIVE salespeople and bosses may decide (never the foreman, never the accountant), the job's own salesperson is listed first by id or by unambiguous name, and a shared name promotes nobody");
