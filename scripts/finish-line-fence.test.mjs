/**
 * FENCE for CLOSING THE LOOP — the finish-line bridge and change orders on the customer document.
 *
 * Two halves of one cause: work that is finished in the field should reach the invoice by itself, and
 * the extras the customer already agreed to should appear on the paper they get.
 *
 *   1. THE BRIDGE — completing a job advances its linked quote to Ready to Invoice, STAMPED as caused
 *      by the completion. Forward only: reopening never walks it back. Already at or past Ready to
 *      Invoice → nothing changes.
 *   2. THE DOCUMENT — a QUOTED change order prints as its own line after the bid lines, description
 *      and price, and the total includes it. A pending, declined or converted one NEVER prints.
 *
 * Every number is HAND-CALCULATED and written as a literal. A fence that computes its expectation
 * with the same formula the code uses proves only that the code agrees with itself.
 *
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/finish-line-fence.test.mjs
 */
import assert from "node:assert/strict";
import {
  advanceQuoteOnJobCompletion,
  quoteAdvancesOnJobCompletion,
  lastAutomaticStatusChange,
  ADVANCES_ON_JOB_COMPLETION,
} from "../lib/quote-lifecycle.ts";
import { STATUS_ORDER, STATUS_CAUSE_LABELS } from "../lib/pmz-types.ts";
import {
  createChangeOrder,
  changeOrderDocumentLines,
  changeOrderDocumentTotal,
  changeOrderDocumentDescription,
  changeOrderDocumentTitle,
  changeOrderDocumentDate,
  cleanResourceName,
  isPrintableChangeOrder,
  decideChangeOrder,
} from "../lib/change-orders.ts";
import { buildQuoteDocument } from "../lib/quote-document.ts";

// ── FIXTURES ──────────────────────────────────────────────────────────────────────────────────────
const COMPLETED_AT = "2026-08-06T21:00:00.000Z";
const CREATED_AT = "2026-07-01T00:00:00.000Z";

const quoteAt = (status) => ({
  id: "q_1",
  quoteType: "EPP",
  jobName: "Elm Street",
  status,
  locked: true,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  statusHistory: [{ status, at: CREATED_AT }],
  totalRevenue: 18750,
  eppLineItems: [],
});

// ── 1 — THE FINISH-LINE BRIDGE ────────────────────────────────────────────────────────────────────
// Work Order Active is the ordinary case: the crew finishes, the quote is ready to bill.
const active = quoteAt("In Progress");
const advanced = advanceQuoteOnJobCompletion(active, COMPLETED_AT);
assert.equal(advanced.status, "Ready to Invoice", "completing the job advances a Work Order Active quote to Ready to Invoice");
assert.equal(advanced.statusHistory.length, 2, "…appending exactly one history entry");
assert.deepEqual(
  advanced.statusHistory[1],
  { status: "Ready to Invoice", at: COMPLETED_AT, cause: "job-completion" },
  "…STAMPED as caused by the job's completion, with the timestamp — never presented as somebody's decision"
);
assert.equal(
  STATUS_CAUSE_LABELS["job-completion"],
  "advanced by job completion",
  "…and the stamp reads in plain words on screen"
);
assert.deepEqual(
  lastAutomaticStatusChange(advanced),
  { cause: "job-completion", at: COMPLETED_AT, status: "Ready to Invoice" },
  "the surface that announces it reads the cause off the trail — one reader, not a re-derivation"
);
assert.equal(advanced.updatedAt, COMPLETED_AT, "the record is stamped as updated at the completion");
assert.equal(active.status, "In Progress", "the INPUT quote is never mutated — the bridge returns a new record");
assert.equal(active.statusHistory.length, 1, "…and its history is untouched");

// MONEY IS NOT THE BRIDGE'S BUSINESS. It moves a status and nothing else.
assert.equal(advanced.totalRevenue, 18750, "the bid total is untouched by the advance");
assert.equal(advanced.jobName, "Elm Street", "…as is every other field on the record");

// The other accepted-side rungs advance too — a JUMP, not a walk. The finish line is the same
// wherever the record had got to, and no history the business never lived through is invented.
for (const from of ["Approved", "Scheduled", "In Progress"]) {
  const out = advanceQuoteOnJobCompletion(quoteAt(from), COMPLETED_AT);
  assert.equal(out.status, "Ready to Invoice", `${from} advances to Ready to Invoice on job completion`);
  assert.equal(out.statusHistory.length, 2, `…in ONE entry, not a rung-by-rung walk (${from})`);
  assert.equal(quoteAdvancesOnJobCompletion(from), true, `${from} is on the advancing list`);
}
assert.deepEqual(
  ADVANCES_ON_JOB_COMPLETION,
  ["Approved", "Scheduled", "In Progress"],
  "exactly the accepted-side statuses that are still behind the invoice"
);

// ALREADY AT OR PAST THE LINE → NOTHING CHANGES. A late completion must never drag a paid quote back.
for (const from of ["Ready to Invoice", "Invoiced", "Paid"]) {
  assert.equal(
    advanceQuoteOnJobCompletion(quoteAt(from), COMPLETED_AT),
    null,
    `a quote already at ${from} is NOT touched by a job completion — never walked backward to be re-advanced`
  );
  assert.equal(quoteAdvancesOnJobCompletion(from), false, `${from} is past the finish line`);
}
// Unaccepted or dead quotes are left alone — a job on one is a data problem, not an invoice.
for (const from of ["Draft", "Ready for Approval", "Declined", "Lost"]) {
  assert.equal(
    advanceQuoteOnJobCompletion(quoteAt(from), COMPLETED_AT),
    null,
    `a ${from} quote is never advanced by a job completion — the bridge is accepted-side only`
  );
}
// Every status in the lifecycle is decided one way or the other — no status falls through unconsidered.
for (const st of STATUS_ORDER) {
  const out = advanceQuoteOnJobCompletion(quoteAt(st), COMPLETED_AT);
  assert.equal(
    out === null,
    !quoteAdvancesOnJobCompletion(st),
    `${st}: the predicate and the transform agree — one rule, no second opinion`
  );
}

// REOPENING DOES NOT WALK IT BACK. There is deliberately no reverse to call: a backward move is a
// human decision (the lifecycle-guard doctrine). Proved against the module's actual API, not its
// prose — nothing exported here can be handed a reopen and move a quote backward.
const lifecycle = await import("../lib/quote-lifecycle.ts");
assert.deepEqual(
  Object.keys(lifecycle).filter((k) => /reopen|regress|revert|rollback|undo/i.test(k)),
  [],
  "the lifecycle module exports NO reverse transition — reopening a job has nothing to call, so it can only leave the quote where it is"
);
// And the one bridge that exists only ever moves toward the invoice, never away from it.
for (const st of STATUS_ORDER) {
  const out = advanceQuoteOnJobCompletion(quoteAt(st), COMPLETED_AT);
  if (out) {
    assert.ok(
      STATUS_ORDER.indexOf(out.status) > STATUS_ORDER.indexOf(st),
      `${st} → ${out.status}: the bridge only ever moves a quote FORWARD in the lifecycle`
    );
  }
}
console.log("PASS: finish-line bridge — completing a job advances an accepted-side quote (Approved / Scheduled / Work Order Active) straight to Ready to Invoice in ONE stamped entry marked 'job-completion'; a quote already at or past Ready to Invoice is untouched, an unaccepted one is never advanced, money is never altered, and there is no reverse path for a reopen to take");

// ── 2 — CHANGE ORDERS ON THE CUSTOMER DOCUMENT ────────────────────────────────────────────────────
// HAND-CALC: $1,000 cost at the parent's 20% margin prices at $1,250.00 (1000 ÷ 0.8).
let seq = 0;
const ids = () => `co_${++seq}`;
const AT = "2026-08-05T14:30:00.000Z";
const co = (over = {}) =>
  createChangeOrder(
    {
      jobId: "job_1",
      quoteId: "q_1",
      foremanId: "p_foreman",
      parentMarginPct: 20,
      lines: [{ description: "Extra base course", qty: 1, rate: 1000 }],
      ceiling: 1500,
      ...over,
    },
    () => AT,
    ids
  );

seq = 0;
const quoted = co();
assert.equal(quoted.status, "quoted", "a $1,000-cost change order is inside the ceiling and is QUOTED");
assert.equal(quoted.priceCharged, 1250.0, "…priced at $1,250.00 (hand-calc: 1000 ÷ 0.8)");
assert.equal(isPrintableChangeOrder(quoted), true, "a QUOTED change order prints");

// THE TITLE says what it is and when — a change order is a second conversation, held on a date.
assert.equal(changeOrderDocumentTitle(quoted), "Change Order — 8/5/2026", "each order is titled with its date");
assert.equal(changeOrderDocumentDate("2026-08-05T14:30:00.000Z"), "8/5/2026", "the date is read off the ISO stamp, calendar-stable");
assert.equal(changeOrderDocumentDate("2026-12-25T00:00:00.000Z"), "12/25/2026", "…two-digit months and days lose their leading zeros");
assert.equal(changeOrderDocumentTitle({ createdAt: "" }), "Change Order", "an unreadable stamp still titles the line — never 'Change Order — undefined'");

// THE DESCRIPTION is the work in plain words — resource names, with the count when there is one.
assert.equal(changeOrderDocumentDescription(quoted), "Extra base course", "the printed description is the work in plain words");
assert.equal(
  changeOrderDocumentDescription({ lines: [{ description: "Flagger", qty: 8 }, { description: "Truck", qty: 1 }] }),
  "Flagger (8), Truck",
  "…with the count when there is more than one, and no count when there is exactly one"
);
assert.equal(
  changeOrderDocumentDescription({ lines: [] }),
  "Additional work authorized on site",
  "a change order with no lines still says what it is rather than leaving a bare price"
);

// NO CATALOG ARTIFACTS REACH THE CUSTOMER. "(Copy)" is a mark about our filing, not about the work.
assert.equal(cleanResourceName("Skid Steer 75HP (Copy)"), "Skid Steer 75HP", "a trailing (Copy) is stripped");
assert.equal(cleanResourceName("Skid Steer 75HP (copy 2)"), "Skid Steer 75HP", "…numbered and lower-case too");
assert.equal(cleanResourceName("Gravel Base [Copy]"), "Gravel Base", "…in square brackets");
assert.equal(cleanResourceName("Gravel Base - Copy"), "Gravel Base", "…as a dashed suffix");
assert.equal(cleanResourceName("Gravel Base – Copy 3"), "Gravel Base", "…with an en dash and a number");
assert.equal(cleanResourceName("Traffic Control Truck Copy"), "Traffic Control Truck", "…and as a bare trailing word");
assert.equal(cleanResourceName('3/4" Gravel Base'), '3/4" Gravel Base', "a real name is NEVER rewritten — only the artifact goes");
assert.equal(cleanResourceName("Copy Machine Rental"), "Copy Machine Rental", "…and a legitimate 'Copy' inside a name survives untouched");
assert.equal(
  changeOrderDocumentDescription({ lines: [{ description: "Skid Steer 75HP (Copy)", qty: 4 }, { description: "Laborer - Copy", qty: 1 }] }),
  "Skid Steer 75HP (4), Laborer",
  "the description a customer reads carries no catalog artifacts at all"
);

// THE PRINTED LINE CARRIES FIVE FIELDS. Not a cost, not a rate, not a margin — nowhere to put one.
const printed = changeOrderDocumentLines([quoted], "q_1");
assert.deepEqual(
  printed,
  [{ id: "co_2", title: "Change Order — 8/5/2026", description: "Extra base course", amount: 1250.0, at: AT }],
  "the customer line is id, title, plain words, the QUOTED PRICE and the stamp — nothing else exists on the shape"
);
assert.deepEqual(
  Object.keys(printed[0]).sort(),
  ["amount", "at", "description", "id", "title"],
  "STRUCTURAL: no cost, rate, margin or resource math can ride along — there are only these five keys"
);
assert.equal(changeOrderDocumentTotal(printed), 1250.0, "the printed lines add $1,250.00 to the document");

// WHAT NEVER PRINTS.
seq = 0;
const pending = co({ ceiling: 500, lines: [{ description: "Rock excavation", qty: 1, rate: 4000 }] });
assert.equal(pending.status, "pending_approval", "a $4,000-cost order over a $500 ceiling is HELD");
// MUTATION TARGET: let pending_approval print and this is the assertion that fails.
assert.equal(
  isPrintableChangeOrder(pending),
  false,
  "A PENDING CHANGE ORDER NEVER PRINTS — nobody has agreed to it, and billing for work still waiting on an internal signature is the mistake this rule exists to prevent"
);
assert.deepEqual(changeOrderDocumentLines([pending], "q_1"), [], "…so it produces no customer line at all");
const declined = decideChangeOrder(pending, { action: "decline", decidedBy: "p_boss", reason: "Not authorized." }, () => AT);
assert.equal(isPrintableChangeOrder(declined), false, "a DECLINED change order never prints — it was refused; it is history, not an amount owed");
const converted = decideChangeOrder(pending, { action: "convert", decidedBy: "p_boss" }, () => AT);
assert.equal(isPrintableChangeOrder(converted), false, "a CONVERTED change order never prints here — it is being priced as new scope, and printing it would bill the same work twice");
assert.deepEqual(
  changeOrderDocumentLines([pending, declined, converted], "q_1"),
  [],
  "none of the three unagreed states reaches the customer document"
);
// An APPROVED & RELEASED order prints — it is a quoted one, and says so.
const released = decideChangeOrder(pending, { action: "approve", decidedBy: "p_sales" }, () => AT);
assert.equal(released.status, "quoted", "approve & release lands on QUOTED");
assert.equal(isPrintableChangeOrder(released), true, "…and a released change order prints");
assert.equal(released.priceCharged, 5000.0, "…at the price it always had (hand-calc: 4000 ÷ 0.8 = $5,000.00)");

// SCOPED TO THIS QUOTE. Another job's change order can never appear on this customer's paper.
seq = 0;
const otherQuote = co({ quoteId: "q_2", jobId: "job_2" });
assert.deepEqual(
  changeOrderDocumentLines([quoted, otherQuote], "q_1").map((l) => l.id),
  ["co_2"],
  "only THIS quote's change orders print — another customer's extra can never cross over"
);
assert.deepEqual(changeOrderDocumentLines([quoted], ""), [], "an unsaved estimate has no quote id and prints no change orders");
assert.deepEqual(changeOrderDocumentLines([quoted], undefined), [], "…and neither does an undefined one");

// ── THE REAL DOCUMENT MAPPING ─────────────────────────────────────────────────────────────────────
// HAND-CALC: one bid line, 10 × $500.00 = $5,000.00. Plus the $1,250.00 change order = $6,250.00.
const LEM_CATS = {
  laborRates: [], equipmentRates: [], materialRates: [], miscRates: [],
  getLaborCostPerHour: () => 0, getEquipmentCostPerHour: () => 0,
  getMaterialCostPerUnit: () => 0, getMiscCostPerUnit: () => 0,
};
const buildDoc = (changeOrders) =>
  buildQuoteDocument(
    { id: "q_1", bidItems: [{ description: "Asphalt paving", quantity: 10, unit: "SY", unitPrice: 500 }] },
    {
      estimate: { bidItems: [] },
      currentCustomer: null,
      estimators: [],
      lemCats: LEM_CATS,
      grossProfit: 0,
      now: new Date(2026, 7, 6),
      quoteNumber: "1234567",
      ...(changeOrders ? { changeOrders } : {}),
    }
  );

// A QUOTE WITH NO CHANGE ORDERS RENDERS EXACTLY AS IT ALWAYS DID — no empty section, no strip, no
// three-row story. The absence of change orders must be invisible, not merely harmless.
const plain = buildDoc(null);
assert.equal(plain.lineItems.length, 1, "with no change orders the document is exactly the bid");
assert.equal(plain.total, 5000.0, "…and totals the bid alone: 10 × $500.00 = $5,000.00");
assert.equal(plain.changeOrderTotal, 0, "…with nothing added");
assert.deepEqual(plain.changeOrders, [], "…an EMPTY section list, so no renderer can draw a heading over nothing");
assert.equal(plain.hasChangeOrders, false, "…and the one flag both renderers read says: tell the plain TOTAL story");
assert.equal(plain.bidTotal, plain.total, "…bid total and document total are the same number when nothing was added");

seq = 0;
const withCo = buildDoc([co(), co({ quoteId: "q_2" })]);
// THE BID TABLE IS UNTOUCHED. A change order is never mixed in among the signed lines.
assert.equal(withCo.lineItems.length, 1, "the BID table still holds ONLY the bid line — change orders are never crammed into it");
assert.equal(withCo.lineItems[0].description, "Asphalt paving", "…the original contract reads exactly as it was signed");
// THE SECTION, one row per order.
assert.equal(withCo.hasChangeOrders, true, "the document says it has a change-order section to draw");
assert.equal(withCo.changeOrders.length, 1, "…with one row per printable order (the other quote's is not ours)");
assert.equal(withCo.changeOrders[0].title, "Change Order — 8/5/2026", "…titled with what it is and when");
assert.equal(withCo.changeOrders[0].description, "Extra base course", "…described in plain words");
assert.equal(withCo.changeOrders[0].amount, 1250.0, "…and carrying the QUOTED price for the Line Total column");
// THE MONEY STORY: three labeled numbers, hand-calculated.
assert.equal(withCo.bidTotal, 5000.0, "ORIGINAL CONTRACT: the BID total still equals the persisted bid exactly (Law 56)");
assert.equal(withCo.changeOrderTotal, 1250.0, "CHANGE ORDERS: counted separately, never folded into the bid");
assert.equal(withCo.total, 6250.0, "CONTRACT TOTAL: 5,000.00 + 1,250.00 = $6,250.00");
assert.equal(withCo.tokenContext.quote.total, "$6,250.00", "the quote-total token prints the contract total the customer owes");
assert.deepEqual(
  withCo.tokenContext.lineItems.map((l) => l.amount),
  ["$5,000.00"],
  "the repeating line-item tokens stay the BID lines — the change orders are a section, not bid items"
);

// NO PRESENTATION ROUNDING SURVIVES THE ADDITION (Law 56). A bid whose lines total to a sub-cent
// amount prints EXACTLY that, with or without a change order riding on it. This is the regression an
// earlier draft of the grand-total line caused: it rounded the sum to the cent and turned a persisted
// $344.425 into a printed $344.43.
const subCentBid = (changeOrders) =>
  buildQuoteDocument(
    { id: "q_1", bidItems: [{ description: "Fractional", quantity: 12.5, unit: "SY", unitPrice: 27.554 }] },
    {
      estimate: { bidItems: [] },
      currentCustomer: null,
      estimators: [],
      lemCats: LEM_CATS,
      grossProfit: 0,
      now: new Date(2026, 7, 6),
      quoteNumber: "1234567",
      ...(changeOrders ? { changeOrders } : {}),
    }
  );
// HAND-CALC: 12.5 × 27.554 = 344.425 — three decimal places, and they must survive to the paper.
// Asserted as "is 344.425 and is NOT the cent-rounded 344.43" rather than as an exact ===, because
// the true binary product is 344.42499999999995: the claim being fenced is that NOTHING here rounds,
// and an === against a decimal literal would be testing IEEE-754, not the price path.
const CENT_ROUNDED_BID = 344.43;
const plainSubCent = subCentBid(null).total;
assert.notEqual(plainSubCent, CENT_ROUNDED_BID, "a sub-cent bid total is NOT rounded up to the cent for printing");
assert.ok(Math.abs(plainSubCent - 344.425) < 1e-9, "…it prints the persisted 344.425 — the printed total IS the persisted one");
seq = 0;
const subCentWithCo = subCentBid([co()]);
assert.ok(Math.abs(subCentWithCo.bidTotal - 344.425) < 1e-9, "…the bid half stays exact when a change order is added");
assert.notEqual(subCentWithCo.total, 1594.43, "…and adding a change order does not sneak the rounding back in");
assert.ok(
  Math.abs(subCentWithCo.total - 1594.425) < 1e-9,
  "…the grand total keeps the sub-cent precision: 344.425 + 1,250.00 = $1,594.425"
);

// A held change order changes NOTHING about the document — not the lines, not the total.
seq = 0;
const withPending = buildDoc([co({ ceiling: 500, lines: [{ description: "Rock excavation", qty: 1, rate: 4000 }] })]);
assert.equal(withPending.lineItems.length, 1, "a PENDING change order adds no line to the customer document");
assert.equal(withPending.total, 5000.0, "…and does not move the total by one cent");
assert.equal(withPending.changeOrderTotal, 0, "…contributing nothing at all");
assert.deepEqual(withPending.changeOrders, [], "…and no section row");
assert.equal(
  withPending.hasChangeOrders,
  false,
  "…so a quote whose ONLY change order is unapproved prints the plain TOTAL — no empty CHANGE ORDERS heading, no three-row story implying money that was never agreed"
);

// MONEY BYTE-IDENTICAL THROUGH ALL OF IT: printing never touches the record it read.
seq = 0;
const beforePrint = co();
const snapshot = JSON.stringify(beforePrint);
buildDoc([beforePrint]);
changeOrderDocumentLines([beforePrint], "q_1");
assert.equal(JSON.stringify(beforePrint), snapshot, "the change-order record is BYTE-IDENTICAL after being printed — the document is a reader, never a writer");
assert.equal(beforePrint.priceCharged, 1250.0, "…its price is exactly what it was");
console.log("PASS: change orders on the customer document — QUOTED orders form their OWN titled section after the untouched bid lines, each titled 'Change Order — 8/5/2026' with a plain-words description carrying no catalog artifacts ('(Copy)' stripped, real names never rewritten), and the money story reads Original Contract $5,000.00 / Change Orders $1,250.00 / CONTRACT TOTAL $6,250.00; a quote with none renders exactly as before (no section, no flag, no subtotal rows); pending, declined and converted orders never print; another quote's orders never cross over; and the record is byte-identical after printing");
