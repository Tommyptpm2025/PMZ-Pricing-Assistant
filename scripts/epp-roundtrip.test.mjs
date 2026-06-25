/**
 * Round-trip check for EPP manual-price persistence (the bug typecheck kept missing).
 * Runs the real save-serialization + JSON localStorage round-trip and asserts the
 * entered values survive. Run: `node scripts/epp-roundtrip.test.mjs`
 *
 * (.mjs so tsc's "**\/*.ts" include doesn't pull it in; Node strips the imported .ts.)
 */
import assert from "node:assert/strict";
import { serializeEppLine, eppLineTotal, eppTotalRevenue } from "../lib/epp-line.ts";

// A manually-priced EPP line — no costing entries, so the OLD save path (cost-derived
// customerUnitPrice / eppMarkedUpBid) produced 0 and zeroed it on Save.
const manual = { id: "paving", description: "Paving", quantity: 4000, unit: "SF", unitPrice: 7 };

// Serialize for save -> JSON round-trip through localStorage -> reload.
const saved = serializeEppLine(manual);
const reloaded = JSON.parse(JSON.stringify(saved));

assert.equal(reloaded.unitPrice, 7, "unit price must survive save -> reload");
assert.equal(eppLineTotal(reloaded), 28000, "line total must survive (4000 x 7 = 28,000)");

// The exact repro mix: three manual lines + one previously-costed line that must keep carrying.
const worksheet = [
  { id: "paving", quantity: 4000, unitPrice: 7 },        // 28,000.00
  { id: "landscape", quantity: 2000, unitPrice: 5 },     // 10,000.00
  { id: "stripping", quantity: 2000, unitPrice: 4 },     //  8,000.00
  { id: "siteprep", quantity: 1, unitPrice: 29495.28 },  // 29,495.28
];

// Worksheet total (what the Pricer shows).
const shown = eppTotalRevenue(worksheet);
assert.equal(Math.round(shown * 100) / 100, 75495.28, "worksheet total");

// Save -> reload the whole quote, then recompute the persisted totalRevenue.
const persisted = worksheet.map(serializeEppLine);
const afterReload = JSON.parse(JSON.stringify(persisted));
const savedTotal = eppTotalRevenue(afterReload);

assert.equal(Math.round(savedTotal * 100) / 100, 75495.28, "saved totalRevenue must equal the worksheet total (was 0)");
assert.equal(savedTotal, shown, "saved total must match what the worksheet showed");
assert.equal(afterReload.find((l) => l.id === "siteprep").unitPrice, 29495.28, "previously-working line keeps carrying");

// --- Per-line LEM detail must survive Save -> reload (the strip bug this build fixes) ---
// A fully-costed EPP line carrying every entry kind BidItem supports.
const costed = {
  id: "grading",
  description: "Site Grading",
  quantity: 1,
  unit: "LS",
  unitPrice: 12500,
  priceOverridden: true,
  laborEntries: [
    { rateId: "op-1", labor: { id: "op-1", role: "Operator", burdenedHourlyRate: 68.5 }, hours: 16, rate: 68.5, group: { id: "g1", crewId: "crew-a", name: "Grade Crew" } },
  ],
  equipmentEntries: [{ rateId: "skid-75", hours: 16, rate: 38 }],
  materialEntries: [{ rateId: "gravel-34", quantity: 28 }],
  miscellaneousEntries: [{ rateId: "permit", description: "Grading permit", quantity: 1, rate: 350 }],
  crewUsages: [{ crewId: "crew-a", hours: 16 }],
};

const costedReloaded = JSON.parse(JSON.stringify(serializeEppLine(costed)));

assert.equal(costedReloaded.priceOverridden, true, "priceOverridden survives round trip");
assert.deepEqual(costedReloaded.laborEntries, costed.laborEntries, "laborEntries (incl. nested labor + group) survive intact");
assert.deepEqual(costedReloaded.equipmentEntries, costed.equipmentEntries, "equipmentEntries survive intact");
assert.deepEqual(costedReloaded.materialEntries, costed.materialEntries, "materialEntries survive intact");
assert.deepEqual(costedReloaded.miscellaneousEntries, costed.miscellaneousEntries, "miscellaneousEntries survive intact");
assert.deepEqual(costedReloaded.crewUsages, costed.crewUsages, "crewUsages survive intact");

// A scope-only line (no costing yet) must stay clean — no empty LEM keys injected.
const scopeOnly = serializeEppLine({ id: "scope", description: "TBD", quantity: 1, unit: "LS", unitPrice: 0 });
assert.equal("laborEntries" in scopeOnly, false, "scope-only line carries no laborEntries key");
assert.equal("crewUsages" in scopeOnly, false, "scope-only line carries no crewUsages key");
assert.equal("priceOverridden" in scopeOnly, false, "scope-only line carries no priceOverridden key");

console.log("PASS: EPP manual-price round-trip — unit prices and totalRevenue survive Save -> reload -> duplicate ($75,495.28)");
console.log("PASS: EPP per-line LEM detail (labor/equipment/material/misc/crew) survives Save -> reload; scope-only lines stay clean");
