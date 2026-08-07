/**
 * FENCE for the FLAT-RATE line (Cause 3, Law 50: blanks block, zeros confirm-and-carry). A line
 * DECLARED a flat rate is a ZERO (does not block Send); an UNDECLARED line with no LEM rows is still a
 * BLANK (still blocks). The declaration must survive the save round trip, and Send and Accept must
 * never disagree about it.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/flat-rate-fence.test.mjs
 */
import assert from "node:assert/strict";
import { buildLineGateFailures, classifyGateFailures } from "../lib/lem-detail.ts";
import { sendGateFailures } from "../lib/quote-lifecycle.ts";
import { serializeEppLine } from "../lib/epp-line.ts";

const CATS = {
  laborRates: [{ id: "op", role: "Operator" }],
  equipmentRates: [], materialRates: [], miscRates: [],
  getLaborCostPerHour: () => 0, getEquipmentCostPerHour: () => 0,
  getMaterialCostPerUnit: () => 0, getMiscCostPerUnit: () => 0,
};
const gate = (line) => buildLineGateFailures(line, CATS, line.description || "Line");

const undeclaredEmpty = { id: "u", description: "Prep Work" };                 // no LEM rows, NOT declared flat
const declaredFlat = { id: "f", description: "Paving", flatRate: true };        // no LEM rows, DECLARED flat
const blankRow = { id: "b", description: "Blank", laborEntries: [{ rateId: "op", hours: undefined }] };

// ── M1 — an UNDECLARED no-LEM line still BLOCKS (must stay true) ───────────────────────────────
{
  const { blocking } = classifyGateFailures([gate(undeclaredEmpty)].filter(Boolean));
  assert.equal(blocking.length, 1, "an UNDECLARED line with no LEM rows must still BLOCK — a naked blank line cannot be sent (Law 50)");
}

// ── M2 — a DECLARED flat line is a ZERO, not a blank: routed to zeros, not blocking ────────────
{
  const f = gate(declaredFlat);
  assert.equal(f.noEntries, false, "a declared flat line is not 'noEntries' — it is a zero");
  assert.equal(f.flatRate, true, "a declared flat line carries the flatRate flag so the confirm section can name it");
  assert.equal(f.issues.length, 0, "a declared flat line has no issues");
  const { blocking, zeros } = classifyGateFailures([f]);
  assert.equal(blocking.length, 0, "a DECLARED flat line must NOT block — the user said there is no labor, equipment, or material behind it");
  assert.equal(zeros.length, 1, "a declared flat line is routed to zeros (confirm-and-carry), so it can be sent");
}

// ── M3 — the declaration survives the save round trip (serializeEppLine) ───────────────────────
{
  const saved = serializeEppLine({ id: "f", description: "Paving", quantity: 100, unitPrice: 2.5, flatRate: true });
  assert.equal(saved.flatRate, true, "serializeEppLine must carry flatRate through save — otherwise the flat declaration does not survive reopen and the line blocks again");
}

// ── M4 — Send and Accept classify a flat line IDENTICALLY (one rule, no divergence) ────────────
{
  const flatQuote = { quoteType: "EPP", eppLineItems: [declaredFlat, blankRow] };
  const send = sendGateFailures(flatQuote, CATS);
  // The Accept path gathers through the SAME rule (buildLineGateFailures + classifyGateFailures).
  const acceptFailures = flatQuote.eppLineItems.map((it, i) => buildLineGateFailures(it, CATS, it.description || `Line ${i + 1}`)).filter(Boolean);
  const accept = classifyGateFailures(acceptFailures);

  const ids = (arr) => arr.map((z) => z.lineId).sort();
  assert.deepEqual(ids(send.zeros), ids(accept.zeros),
    "Send and Accept must classify flat lines IDENTICALLY — a flat line in one path's confirm but not the other means the two have diverged (one-fact-two-homes on the gate)");
  assert.deepEqual(ids(send.blocking), ids(accept.blocking),
    "Send and Accept must agree on blockers too — the flat line must be a zero on BOTH paths, the blank a blocker on BOTH");
}

console.log("PASS: flat-rate — undeclared no-LEM still BLOCKS; declared flat is a zero (not blocking); survives save; Send and Accept agree");

// ══ CAUSE 4 — FLAT RATE AND REAL COSTS ARE MUTUALLY EXCLUSIVE (gaveled 2026-08-07) ════════════════
// The two states may never coexist SILENTLY. Entering a cost auto-unticks; ticking over costs takes a
// stated confirm and a stamp; a line that already carries both wears a visible badge.
import {
  costRowCount,
  costRows,
  hasRealCostRows,
  isFlatRateContradicted,
  flatRateBadge,
  planFlatRateTick,
  applyFlatRateTick,
  applyCostEntry,
  clearFlatRate,
  flatRateContradictions,
  COST_ENTRY_ANNOUNCEMENT,
  FLAT_RATE_SECTION_NOTICE,
} from "../lib/flat-rate.ts";

const AT = "2026-08-07T18:00:00.000Z";
const clock = () => AT;

// A line with real entered work: 8 operator hours, 4 tons of mix, and a blank row that is NOT a cost.
const costedLine = () => ({
  id: "L1",
  description: "Asphalt Paving",
  quantity: 100,
  unitPrice: 25,
  laborEntries: [{ rateId: "op", hours: 8 }, { rateId: "op", hours: 0 }],
  materialEntries: [{ rateId: "mix", quantity: 4 }, { rateId: "mix", quantity: undefined }],
});

// ── C4-1 — WHAT COUNTS AS A REAL COST ROW ────────────────────────────────────────────────────────
assert.equal(costRowCount(costedLine()), 2, "only rows with a quantity > 0 are real costs — 8 hours and 4 tons; the typed 0 and the blank are not");
assert.equal(hasRealCostRows(costedLine()), true, "…so the line has real costs");
assert.equal(costRowCount({ id: "x" }), 0, "a bare line has none");
assert.equal(costRowCount({ laborEntries: [{ hours: 0 }], materialEntries: [{ quantity: "" }] }), 0, "a typed zero and an empty string are NOT entered costs — same completeness test the gate uses");
assert.equal(costRowCount({ laborEntries: [{ hours: "5" }] }), 1, "a numeric STRING quantity still counts — stored data is not always typed");
assert.equal(costRowCount({ crewUsages: [{ crewId: "c1", hours: 6 }] }), 1, "a CREW on the line is labor and equipment by another name — it counts");
assert.deepEqual(
  costRows(costedLine()).map((r) => [r.catKey, r.idx, r.amount]),
  [["labor", 0, 8], ["material", 0, 4]],
  "each real row reports its panel coordinates, so the Pricer can point at the exact field"
);

// ── C4-2 — ENTERING A COST AUTO-UNTICKS FLAT RATE, AND SAYS SO ───────────────────────────────────
// MUTATION TARGET: let the cost land while flatRate stays silently ticked and these fail.
{
  const flatWithNewCost = { ...costedLine(), flatRate: true }; // the row has just been typed in
  const { next, plan } = applyCostEntry(flatWithNewCost, clock);
  assert.equal(plan.autoUnticked, true, "A COST ROW ENTERED ON A FLAT-RATE LINE AUTO-UNTICKS IT — the newest fact wins, because a person just typed it");
  assert.equal(next.flatRate, false, "…the declaration is actually cleared, not merely reported");
  assert.equal(
    plan.announcement,
    COST_ENTRY_ANNOUNCEMENT,
    "…and it is ANNOUNCED on screen — a silent untick is the same invisible decision in the other direction"
  );
  assert.equal(isFlatRateContradicted(next), false, "…leaving no contradiction behind");
  // MONEY UNTOUCHED: the entered work is exactly where it was.
  assert.deepEqual(next.laborEntries, flatWithNewCost.laborEntries, "the entered labor is untouched");
  assert.deepEqual(next.materialEntries, flatWithNewCost.materialEntries, "…and the material");
  assert.equal(next.unitPrice, 25, "…and the price on the line is not recomputed by this rule");
  assert.equal(flatWithNewCost.flatRate, true, "the INPUT line is never mutated");
}
{
  // A line that was never flat, or has no real costs, passes through untouched and silent.
  const plain = costedLine();
  const r1 = applyCostEntry(plain, clock);
  assert.equal(r1.next, plain, "a line that never declared flat rate is returned by the SAME reference — nothing happened");
  assert.equal(r1.plan.autoUnticked, false, "…and nothing is announced");
  const flatClean = { id: "L2", description: "Mobilization", flatRate: true };
  const r2 = applyCostEntry(flatClean, clock);
  assert.equal(r2.next.flatRate, true, "a flat line with NO real costs keeps its declaration");
  assert.equal(r2.plan.announcement, null, "…and says nothing, because nothing contradicts it");
}

// ── C4-3 — TICKING OVER EXISTING COSTS TAKES A STATED CONFIRM, AND A STAMP ───────────────────────
{
  const clean = { id: "L2", description: "Mobilization" };
  const cleanPlan = planFlatRateTick(clean, 0);
  assert.equal(cleanPlan.requiresConfirm, false, "ticking flat rate on a line with NO costs needs no confirm — there is nothing to contradict");
  assert.equal(cleanPlan.message, null, "…and no sentence to show");
  const ticked = applyFlatRateTick(clean, clock);
  assert.equal(ticked.flatRate, true, "…it just ticks");
  assert.equal(ticked.flatRateAcknowledgedAt, undefined, "…with NO acknowledgement stamp — nothing was acknowledged");

  // HAND-CALC: the caller's own per-line cost is $1,240.00; the confirm must NAME it.
  const plan = planFlatRateTick(costedLine(), 1240);
  assert.equal(plan.requiresConfirm, true, "TICKING FLAT RATE ON A LINE THAT HAS COSTS REQUIRES A STATED CONFIRM");
  assert.equal(plan.costRowCount, 2, "…which knows how many rows are at stake");
  assert.equal(
    plan.message,
    "This line has $1,240.00 of entered costs. Flat rate will IGNORE them in pricing. Keep the costs but mark flat rate?",
    "…and NAMES THE MONEY — 'this line has costs' is a shrug; the dollar figure is a decision"
  );

  const confirmed = applyFlatRateTick(costedLine(), clock);
  assert.equal(confirmed.flatRate, true, "confirming ticks the line");
  assert.equal(confirmed.flatRateAcknowledgedAt, AT, "…STAMPED with when it was knowingly acknowledged");
  assert.equal(confirmed.flatRateAcknowledgedRows, 2, "…and with how many rows were set aside");
  // KEEP THE COSTS. Deleting somebody's typed facts to resolve a flag is a worse answer than a
  // labelled contradiction.
  assert.deepEqual(confirmed.laborEntries, costedLine().laborEntries, "the entered labor is KEPT, exactly as typed");
  assert.deepEqual(confirmed.materialEntries, costedLine().materialEntries, "…and the material — 'keep the costs but mark flat rate' means keep them");
  assert.equal(confirmed.unitPrice, 25, "…and no price moved");

  // Unticking drops the declaration and its stamp together.
  const untickd = clearFlatRate(confirmed);
  assert.equal(untickd.flatRate, false, "unticking clears the declaration");
  assert.equal(untickd.flatRateAcknowledgedAt, undefined, "…and the stamp goes with it — there is nothing left to have acknowledged");
  assert.equal(untickd.flatRateAcknowledgedRows, undefined, "…both fields");
  assert.deepEqual(untickd.laborEntries, costedLine().laborEntries, "…and the costs are STILL untouched");
}

// ── C4-4 — THE CONTRADICTION BADGE (existing data, never rewritten) ──────────────────────────────
{
  const legacy = { ...costedLine(), flatRate: true }; // written before this rule existed
  assert.equal(isFlatRateContradicted(legacy), true, "a line carrying BOTH states is contradicted");
  assert.equal(flatRateBadge(legacy), "flat rate — 2 cost rows ignored", "…and wears a VISIBLE badge counting them, instead of hiding it");
  assert.equal(
    flatRateBadge({ flatRate: true, laborEntries: [{ hours: 3 }] }),
    "flat rate — 1 cost row ignored",
    "…singular when there is one row (it is read by a person, not a parser)"
  );
  assert.equal(flatRateBadge({ flatRate: true }), null, "a clean flat line wears NO badge");
  assert.equal(flatRateBadge(costedLine()), null, "…and neither does a costed line that never declared flat rate");
  assert.equal(
    flatRateBadge({ ...legacy, laborEntries: [{ rateId: "op", hours: 8 }, { rateId: "op", hours: 2 }] }),
    "flat rate — 3 cost rows ignored",
    "the badge counts what is on the line TODAY, not what the stamp remembers — costs added after the acknowledgement still show"
  );
  // NOTHING IS REWRITTEN. Reading a legacy line does not repair it.
  const before = JSON.stringify(legacy);
  flatRateBadge(legacy);
  isFlatRateContradicted(legacy);
  flatRateContradictions([legacy]);
  assert.equal(JSON.stringify(legacy), before, "existing data is ANNOUNCED, never silently repaired — a silent repair is another invisible decision");
}

// ── C4-5 — THE SEND FLOW'S FIRST MOMENT OF TRUTH ────────────────────────────────────────────────
{
  const contradicted = { ...costedLine(), flatRate: true, flatRateAcknowledgedAt: AT };
  const cleanFlat = { id: "L2", description: "Mobilization", flatRate: true };
  const found = flatRateContradictions([contradicted, cleanFlat, costedLine()]);
  assert.equal(found.length, 1, "only the CONTRADICTED line is reported to the send flow");
  assert.deepEqual(
    found[0],
    { lineId: "L1", description: "Asphalt Paving", costRowCount: 2, acknowledgedAt: AT },
    "…named, counted, and carrying its acknowledgement date"
  );
  assert.deepEqual(flatRateContradictions([]), [], "an estimate with no contradictions reports none");
  assert.deepEqual(flatRateContradictions([cleanFlat]), [], "…and a clean flat-rate line is not a contradiction");

  // A CLEAN FLAT LINE STILL SENDS CLEAN — this rule adds no new blocker to the old behavior.
  const { blocking, zeros } = sendGateFailures({ quoteType: "EPP", eppLineItems: [cleanFlat] }, CATS);
  assert.equal(blocking.length, 0, "a flat-rate line with no costs still does NOT block the send");
  assert.equal(zeros.length, 1, "…it is still a confirm-and-carry zero, exactly as before Cause 4");
  assert.equal(zeros[0].flatRate, true, "…still flagged as the flat line it is");
}

// ── C4-6 — PRICING MATH IS UNTOUCHED IN EVERY CASE ──────────────────────────────────────────────
// The flag governs PRINTING and GATING, never a stored figure. Whatever this module does to a line,
// its persisted money comes through byte-identical.
{
  const money = (l) => JSON.stringify({ quantity: l.quantity, unitPrice: l.unitPrice, laborEntries: l.laborEntries, materialEntries: l.materialEntries });
  const start = { ...costedLine(), flatRate: true };
  const snapshot = money(start);
  assert.equal(money(applyFlatRateTick(costedLine(), clock)), money(costedLine()), "ticking flat rate moves no money");
  assert.equal(money(applyCostEntry(start, clock).next), snapshot, "auto-unticking moves no money");
  assert.equal(money(clearFlatRate(start)), snapshot, "unticking moves no money");
  // …and the saved shape still carries both the declaration and its stamp.
  const saved = serializeEppLine(applyFlatRateTick(costedLine(), clock));
  assert.equal(saved.flatRate, true, "the declaration survives save");
  assert.equal(saved.flatRateAcknowledgedAt, AT, "…and so does the acknowledgement stamp");
  assert.equal(saved.flatRateAcknowledgedRows, 2, "…with the row count");
  assert.equal(saved.unitPrice, 25, "…and the money is what it always was");
  assert.equal(serializeEppLine(costedLine()).flatRateAcknowledgedAt, undefined, "a clean line carries no stamp key at all");
}

assert.equal(FLAT_RATE_SECTION_NOTICE, "This line is flat rate — untick to add real costs.", "the one line shown in place of the cost panels while flat rate is ticked");
console.log("PASS: Cause 4 — flat rate and real costs are mutually exclusive: entering a cost AUTO-UNTICKS with an announcement, ticking over $1,240.00 of costs takes a stated confirm and stamps the acknowledgement (keeping every entered row), existing contradictions wear a live 'flat rate — N cost rows ignored' badge and are never rewritten, a clean flat line still sends clean, and no path moves one cent of money");
