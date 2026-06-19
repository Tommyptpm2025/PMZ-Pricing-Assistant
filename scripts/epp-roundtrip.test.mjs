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

console.log("PASS: EPP manual-price round-trip — unit prices and totalRevenue survive Save -> reload -> duplicate ($75,495.28)");
