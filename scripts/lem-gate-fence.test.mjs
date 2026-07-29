/**
 * FENCE for the LEM Gate — Law 50, AMENDED Jul 25, 2026 (gaveled).
 * Typed zeros confirm-and-carry; blanks and no-entries still hard-block; confirming is permission
 * to proceed, NOT a cost basis (Earned Green stays unreachable this way).
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/lem-gate-fence.test.mjs
 * (.mjs so tsc's "**\/*.ts" include doesn't pull it in; Node strips the imported .ts types.)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildLineGateFailures, classifyGateFailures } from "../lib/lem-detail.ts";

const CATS = {
  laborRates: [{ id: "op", role: "Operator" }],
  equipmentRates: [{ id: "sk", description: "Skid Steer" }],
  materialRates: [{ id: "gr", description: "Gravel", unitOfMeasure: "Ton" }],
  miscRates: [],
  getLaborCostPerHour: () => 0, getEquipmentCostPerHour: () => 0,
  getMaterialCostPerUnit: () => 0, getMiscCostPerUnit: () => 0,
};
const gate = (item) => { const f = buildLineGateFailures(item, CATS, item.description || "Line"); return f ? [f] : []; };

const zeroLine  = { id: "z", description: "Zero line",  laborEntries: [{ rateId: "op", hours: 0 }] };
const blankLine = { id: "b", description: "Blank line", laborEntries: [{ rateId: "op", hours: undefined }] };
const emptyLine = { id: "e", description: "Empty line" };                       // no LEM entries at all
const mixedLine = { id: "m", description: "Mixed line", laborEntries: [{ rateId: "op", hours: 0 }], materialEntries: [{ rateId: "gr", quantity: undefined }] };
const cleanLine = { id: "ok", description: "OK line",   laborEntries: [{ rateId: "op", hours: 8 }] };

// ── 1 — the classifier split: zeros confirm, blanks / no-entries block ────────────────────────
{
  const { blocking, zeros } = classifyGateFailures(gate(zeroLine));
  assert.equal(zeros.length, 1, "a TYPED-ZERO line is confirmable (zeros)");
  assert.equal(blocking.length, 0, "a typed-zero line does NOT block");
  assert.ok(zeros[0].issues.every((i) => i.isZero), "its issues are all typed zeros");
}
{
  const { blocking, zeros } = classifyGateFailures(gate(blankLine));
  assert.equal(blocking.length, 1, "a BLANK (missing) quantity still BLOCKS — absence is not an answer");
  assert.equal(zeros.length, 0, "a blank is NEVER routed to confirm-and-carry (Earned Green from the other side)");
}
{
  const { blocking } = classifyGateFailures(gate(emptyLine));
  assert.equal(blocking.length, 1, "an UNDECLARED line with NO LEM entries still BLOCKS");
}
{
  // Cause 3: the SAME empty line, DECLARED a flat rate, is a zero — not a blank. It does NOT block.
  const flatLine = { id: "flat", description: "Flat line", flatRate: true };
  const { blocking, zeros } = classifyGateFailures(gate(flatLine));
  assert.equal(blocking.length, 0, "a DECLARED flat line does NOT block (Cause 3) — the user declared no labor/equipment/material");
  assert.equal(zeros.length, 1, "a declared flat line is routed to zeros — confirm-and-carry, not blocking");
}
{
  const { blocking, zeros } = classifyGateFailures(gate(mixedLine));
  assert.equal(blocking.length, 1, "a line with a zero AND a blank BLOCKS (the blank must be answered first)");
  assert.equal(zeros.length, 0, "the mixed line is not confirmable while a blank remains");
}

// ── 2 — a zero CARRIES when confirmed ────────────────────────────────────────────────────────
// The zero classifies as confirmable (not blocking), so the accept path proceeds once confirmed.
{
  const { blocking, zeros } = classifyGateFailures(gate(zeroLine));
  assert.equal(blocking.length, 0, "nothing blocks — acceptance can proceed on confirmation");
  assert.equal(zeros.length, 1, "the zero is offered as confirm-and-carry, naming the field");
}

// ── 3 — a zero still WARNS; it never passes silently ─────────────────────────────────────────
{
  assert.equal(gate(zeroLine).length, 1, "a zero is always FLAGGED by the gate — never a silent clean pass");
  assert.equal(gate(cleanLine).length, 0, "a positive quantity is a clean pass (control)");
}

// ── 4 — Earned Green: confirming a zero is NOT a cost basis (structural) ──────────────────────
// hasCostBasis must derive from eppPlannedCost ALONE; the Pricer cost path must never read the
// confirmation. Mutation — wiring zeroConfirmation into the cost basis — reintroduces the word here.
const pricerSrc = readFileSync(fileURLToPath(new URL("../app/project-pricer/page.tsx", import.meta.url)), "utf8");
assert.ok(pricerSrc.includes("const hasCostBasis = eppPlannedCost > 0;"),
  "hasCostBasis is derived from eppPlannedCost ALONE — confirming a zero can never set a cost basis");
assert.ok(!pricerSrc.includes("zeroConfirmation"),
  "the Pricer's cost path never reads zeroConfirmation (permission to proceed is not evidence of cost)");

// ── 5 — the confirmation is PERSISTED (distinguishable on the record later) ───────────────────
const quotesSrc = readFileSync(fileURLToPath(new URL("../app/quotes/page.tsx", import.meta.url)), "utf8");
assert.ok(quotesSrc.includes("buildZeroConfirmation") && /applyStatusChange\([^)]*[\s\S]*?zeroConfirmation/.test(quotesSrc),
  "the accept path persists zeroConfirmation on the quote via applyStatusChange (confirmed zero is on the record)");

console.log("PASS: LEM Gate — typed zeros confirm-and-carry; blanks and no-entries still block; a mixed line blocks");
console.log("PASS: a zero is always flagged (never a silent pass) and carries only on confirmation");
console.log("PASS: Earned Green holds — confirming a zero never sets a cost basis; the confirmation is persisted");
