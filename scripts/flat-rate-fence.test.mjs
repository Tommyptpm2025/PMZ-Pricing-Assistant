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
