/**
 * FENCE for the Send-for-Acceptance gate (Law 50, Jul 26 2026). A BLANK / no-entry LEM detail
 * BLOCKS a price from reaching a customer; a TYPED ZERO does NOT block at Send (its confirm is an
 * Accept concern). A quote can reach "Sent for Acceptance" by FOUR doors — Send, Re-send, Advance,
 * and a super-user Jump — and EVERY one must route through the single sendGateBlocks helper.
 *
 * THREE PARTS:
 *   (1) BEHAVIORAL — pins the Send decision itself (the pure rule): blank → block, zero → pass.
 *   (2) ENUMERATION — the closed list of functions that transition a quote to Sent. Reads source and
 *       asserts EVERY one calls sendGateBlocks. This is the fence's source of truth; it is meant to
 *       be edited deliberately when a door is added.
 *   (3) CLOSURE — pins how many times the two status-transition mechanisms are CALLED, so a NEW
 *       transition path can't appear unnoticed. When it trips it TELLS you which decision to make.
 * Parts 2–3 read source: they prove the WIRING is present, not that the gate fires in React at
 * runtime — that is the owner's eyes-on walk (Law 69).
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/send-gate-fence.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildLineGateFailures, classifyGateFailures } from "../lib/lem-detail.ts";

const CATS = {
  laborRates: [{ id: "op", role: "Operator" }],
  equipmentRates: [], materialRates: [], miscRates: [],
  getLaborCostPerHour: () => 0, getEquipmentCostPerHour: () => 0,
  getMaterialCostPerUnit: () => 0, getMiscCostPerUnit: () => 0,
};
// The Send decision over a quote's bid lines: block on `.blocking` (blanks/no-entries); zeros pass.
const sendDecision = (lines) =>
  classifyGateFailures(lines.map((it, i) => buildLineGateFailures(it, CATS, it.description || `Line ${i + 1}`)).filter(Boolean));

// ── 1 — BEHAVIORAL: blanks block Send, zeros pass Send ───────────────────────────────────────
{
  const { blocking } = sendDecision([{ id: "b", description: "Blank", laborEntries: [{ rateId: "op", hours: undefined }] }]);
  assert.ok(blocking.length > 0, "Send BLOCKS a blank/missing hours — a price with no number behind it can't reach a customer");
}
{
  const { blocking, zeros } = sendDecision([{ id: "z", description: "Zero", laborEntries: [{ rateId: "op", hours: 0 }] }]);
  assert.equal(blocking.length, 0, "Send does NOT block a typed zero");
  assert.ok(zeros.length > 0, "the zero is a confirm-and-carry (Accept concern), not a Send blocker");
}
{
  const { blocking, zeros } = sendDecision([{ id: "ok", description: "OK", laborEntries: [{ rateId: "op", hours: 8 }] }]);
  assert.equal(blocking.length, 0, "a positive quantity does not block Send");
  assert.equal(zeros.length, 0, "and is not a zero");
}
{
  const { blocking } = sendDecision([
    { id: "z", description: "Zero", laborEntries: [{ rateId: "op", hours: 0 }] },
    { id: "b", description: "Blank", laborEntries: [{ rateId: "op", hours: undefined }] },
  ]);
  assert.ok(blocking.length > 0, "any blank blocks Send even alongside acceptable zeros");
}
console.log("PASS: Send decision — a blank/no-entry BLOCKS; a typed zero PASSES (its confirm is an Accept concern)");

const src = readFileSync(fileURLToPath(new URL("../app/quotes/page.tsx", import.meta.url)), "utf8");
const bodyOf = (name) => {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf("\n  function ", start + 1);
  return start < 0 ? "" : src.slice(start, end > start ? end : start + 2500);
};

// ── 2 — ENUMERATION: every door to Sent routes through the ONE gate ───────────────────────────
// SEND_PATHS is the COMPLETE set of functions in app/quotes/page.tsx that transition a quote to
// "Ready for Approval" (display label: Sent for Acceptance). EVERY one must call sendGateBlocks so a
// blank can't reach a customer by ANY door — Send, Re-send, Advance, or a super-user Jump. When you
// add a new path to Sent, add its function name here AND gate it. This list is edited deliberately.
const SEND_PATHS = ["sendForAcceptance", "resendDeclined", "confirmAdvance", "superUserSetStatus"];
for (const fn of SEND_PATHS) {
  assert.ok(
    bodyOf(fn).includes("sendGateBlocks"),
    `${fn} transitions a quote to Sent for Acceptance but does NOT route through sendGateBlocks — ` +
      `a blank could reach a customer through it. Gate it (Law 50), or remove it from SEND_PATHS if it no longer sends.`
  );
}
assert.ok(!src.includes("disabled={gateBlockActive}"), "the Send button no longer disables on the accept-block artifact (gateBlockActive)");
console.log("PASS: enumeration — all four doors to Sent (Send / Re-send / Advance / super-user Jump) route through sendGateBlocks; the Send button no longer disables on gateBlockActive");

// ── 3 — CLOSURE: no NEW transition path can reach Sent unnoticed ──────────────────────────────
// The two mechanisms that change a quote's status are the local applyStatusChange wrapper and the
// direct libApplyStatusChange transform. We pin how many times each is CALLED. Add (or remove) a
// status-transition call anywhere in app/quotes/page.tsx and these counts change — and this fence
// fails ON PURPOSE, because it can't tell whether the new call reaches a customer.
//
// This is a DECISION, not a number to bump on reflex. When it trips, do ONE of these:
//   • If the new call CAN reach "Ready for Approval" (Sent for Acceptance): gate it with
//     sendGateBlocks and add its function to SEND_PATHS above. A blank must never reach a customer.
//   • If it CANNOT reach "Ready for Approval": update the expected count below AND say so in your
//     commit message (e.g. "new Paid→Archived transition, cannot reach Sent, count 4→5").
// A count bumped without that sentence in the commit message has stopped guarding anything.
const decisionMsg = (mechanism, actual, expected) =>
  `\n  A status-transition call was added or removed (${mechanism}: found ${actual}, this fence expects ${expected}).` +
  `\n  DECIDE — don't just re-number:` +
  `\n    • If the new call CAN reach "Ready for Approval" (Sent for Acceptance): gate it with sendGateBlocks` +
  `\n      and add its function to SEND_PATHS. A blank must never reach a customer (Law 50).` +
  `\n    • If it CANNOT reach "Ready for Approval": update the expected count here AND say why in your commit message.` +
  `\n  This count is a decision record, not a formality.\n`;
const wrapperCalls = (src.match(/(?<!lib)(?<!function )applyStatusChange\(/g) || []).length;
const libCalls = (src.match(/libApplyStatusChange\(/g) || []).length;
assert.equal(wrapperCalls, 4, decisionMsg("applyStatusChange wrapper", wrapperCalls, 4));
assert.equal(libCalls, 4, decisionMsg("libApplyStatusChange transform", libCalls, 4));
console.log("PASS: closure — status-transition call sites accounted for (wrapper 4, lib 4); a new path trips this fence with a decision, not a number");
