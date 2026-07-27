/**
 * FENCE for the Send-for-Acceptance gate (Law 50). The rule now lives at the TRANSITION, not on the
 * UI doors: lib/quote-lifecycle.ts is the single place a quote's status becomes "Ready for Approval"
 * (Sent for Acceptance), and that transition ALWAYS consults the send gate. A BLANK / no-entry LEM
 * detail refuses the transition; a TYPED ZERO carries (its confirm is an Accept concern).
 *
 * THREE PARTS:
 *   (1) BEHAVIORAL (pure rule) — sendBlockingFailures: blank blocks, zero passes.
 *   (2) BEHAVIORAL (the transition) — applyStatusChange toward Ready for Approval REFUSES a blank and
 *       ACCEPTS typed zeros; the gate is scoped to that one target (other transitions are untouched).
 *   (3) CHOKEPOINT (repo-wide) — no file OUTSIDE lib/quote-lifecycle.ts hand-builds the Ready for
 *       Approval status, so every path to Sent goes through the transition where the gate lives. This
 *       replaces the old four-name SEND_PATHS list: a list of doors can miss one; a chokepoint cannot.
 * Parts reading source prove WIRING, not runtime firing (that is the owner's eyes-on walk, Law 69).
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/send-gate-fence.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildLineGateFailures, classifyGateFailures } from "../lib/lem-detail.ts";
import { applyStatusChange, sendBlockingFailures } from "../lib/quote-lifecycle.ts";

const CATS = {
  laborRates: [{ id: "op", role: "Operator" }],
  equipmentRates: [], materialRates: [], miscRates: [],
  getLaborCostPerHour: () => 0, getEquipmentCostPerHour: () => 0,
  getMaterialCostPerUnit: () => 0, getMiscCostPerUnit: () => 0,
};

// ── 1 — BEHAVIORAL: the pure rule (sendBlockingFailures + classification) ──────────────────────
const sendDecision = (lines) =>
  classifyGateFailures(lines.map((it, i) => buildLineGateFailures(it, CATS, it.description || `Line ${i + 1}`)).filter(Boolean));
{
  const { blocking } = sendDecision([{ id: "b", description: "Blank", laborEntries: [{ rateId: "op", hours: undefined }] }]);
  assert.ok(blocking.length > 0, "a blank/missing hours BLOCKS — a price with no number behind it can't reach a customer");
}
{
  const { blocking, zeros } = sendDecision([{ id: "z", description: "Zero", laborEntries: [{ rateId: "op", hours: 0 }] }]);
  assert.equal(blocking.length, 0, "a typed zero does NOT block");
  assert.ok(zeros.length > 0, "the zero is a confirm-and-carry (Accept concern), not a Send blocker");
}
// sendBlockingFailures over a whole quote: EPP with a blank blocks; non-EPP never blocks.
assert.ok(sendBlockingFailures({ quoteType: "EPP", eppLineItems: [{ id: "b", description: "Blank", laborEntries: [{ rateId: "op", hours: undefined }] }] }, CATS).length > 0,
  "sendBlockingFailures flags a blank on an EPP quote");
assert.equal(sendBlockingFailures({ quoteType: "Full", eppLineItems: [] }, CATS).length, 0,
  "sendBlockingFailures never blocks a non-EPP quote (no LEM detail)");
console.log("PASS: send rule — a blank/no-entry BLOCKS; a typed zero PASSES; non-EPP never blocks");

// ── 2 — BEHAVIORAL: the TRANSITION refuses a blank and carries zeros, scoped to Ready for Approval ─
const mkQuote = (entries) => ({
  id: "q1", status: "Draft", quoteType: "EPP", createdAt: "2026-01-01T00:00:00Z",
  statusHistory: [{ status: "Draft", at: "2026-01-01T00:00:00Z" }],
  eppLineItems: [{ id: "l1", description: "Driveway", laborEntries: entries }],
});
{
  const res = applyStatusChange(mkQuote([{ rateId: "op", hours: undefined }]), "Ready for Approval", undefined, "2026-01-02T00:00:00Z");
  assert.equal(res.ok, false, "a blank REFUSES the transition into Sent for Acceptance");
  assert.ok(res.ok === false && res.blocking.length > 0, "the refusal carries the blocking failures for the panel");
}
{
  const res = applyStatusChange(mkQuote([{ rateId: "op", hours: 0 }]), "Ready for Approval", undefined, "2026-01-02T00:00:00Z");
  assert.equal(res.ok, true, "typed zeros CARRY — the transition into Sent is accepted (zeros are an Accept concern)");
  assert.equal(res.ok && res.quote.status, "Ready for Approval", "the accepted result carries the transitioned quote");
}
{
  const res = applyStatusChange(mkQuote([{ rateId: "op", hours: undefined }]), "Approved", undefined, "2026-01-02T00:00:00Z");
  assert.equal(res.ok, true, "the gate is SCOPED to Ready for Approval — a blank does not block other transitions (Approve/Decline/Advance/Lost/jump)");
}
console.log("PASS: transition — Ready for Approval refuses a blank, carries typed zeros; every other target is untouched");

// ── 3 — CHOKEPOINT (repo-wide): only lib/quote-lifecycle.ts turns a status INTO Ready for Approval ─
// The transition is the single door, and the gate lives inside it. Prove no file hand-builds that
// status (a `status: "Ready for Approval"` / `.status = "Ready for Approval"` write), which would
// bypass the transition and the gate with it. A door-list could omit a door; a chokepoint cannot.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const LIB_TRANSITION = join("lib", "quote-lifecycle.ts");
const HAND_BUILT = /(?:\.status\s*=\s*|\bstatus\s*:\s*)["']Ready for Approval["']/;
function tsFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
for (const abs of [...tsFiles(join(repoRoot, "app")), ...tsFiles(join(repoRoot, "lib"))]) {
  const rel = abs.slice(repoRoot.length).replace(/^[\\/]/, "");
  if (!HAND_BUILT.test(readFileSync(abs, "utf8"))) continue;
  assert.ok(
    rel.replace(/\\/g, "/").endsWith("lib/quote-lifecycle.ts"),
    `${rel} writes a quote's status to "Ready for Approval" directly, bypassing the transition in\n` +
      `  lib/quote-lifecycle.ts where the send gate lives — a blank could reach a customer through it.\n` +
      `  DECIDE: route the write through applyStatusChange / sendQuoteForAcceptance (it checks the gate).\n` +
      `  If a raw status write genuinely must live outside the lib, say why in your commit message.`
  );
}
// And prove the gate actually lives IN that transition (so the chokepoint is a GATED chokepoint):
const lib = readFileSync(join(repoRoot, LIB_TRANSITION), "utf8");
assert.ok(/newStatus === "Ready for Approval"/.test(lib) && /sendBlockingFailures/.test(lib),
  "the send gate must live in lib/quote-lifecycle.ts applyStatusChange — the Ready for Approval transition must consult sendBlockingFailures");
console.log("PASS: chokepoint — only lib/quote-lifecycle.ts persists Ready for Approval, and that transition always checks the gate");

// ── 4 — keep the accept-artifact guard: the Send button never disables on the accept block ────────
const quotesSrc = readFileSync(join(repoRoot, "app", "quotes", "page.tsx"), "utf8");
assert.ok(!quotesSrc.includes("disabled={gateBlockActive}"), "the Send button no longer disables on the accept-block artifact (gateBlockActive)");
console.log("PASS: the Send button no longer disables on gateBlockActive (enforcement is the gate, not a disabled control)");
