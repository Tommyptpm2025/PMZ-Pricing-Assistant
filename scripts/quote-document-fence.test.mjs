/**
 * FENCE-REGRESSION SUITE for the customer document price path (Law 56).
 * Proves that the rendered customer document total === the persisted totalRevenue:
 *   1. BEHAVIORAL — the document's line math (buildQuoteData's mapping) run over persisted-quote
 *      fixtures: manual line totals, overridden unit prices, cents, a NO-COST quote (the $0 defect
 *      shape), scope-only and empty quotes. Printed total must equal the saved total, exactly.
 *   2. REGRESSION — the two owner-walk cases (Jul 20) that exposed the defect: a no-cost quote
 *      that printed $0, and a quote priced above target that printed the recommendation.
 *   3. STRUCTURAL — buildQuoteData must not reach for the cost-derived Golden Formula
 *      (customerUnitPrice) or presentation rounding (roundToQuote), and the customer document
 *      components must not render money through the whole-dollar formatter.
 * Run: node scripts/quote-document-fence.test.mjs
 *
 * WHY A SOURCE CHECK: buildQuoteData is a closure inside app/project-pricer/page.tsx (it closes
 * over estimate/customer/rate state) and cannot be imported. The behavioral half exercises the
 * REAL lib/epp-line helpers it delegates to; the structural half pins the call sites so the
 * cost-derived path cannot be reintroduced without failing here. See BACKEND-HANDOFF.md §10.2.
 *
 * (.mjs so tsc's "**\/*.ts" include doesn't pull it in; Node strips the imported .ts types.)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serializeEppLine, eppLineTotal, eppTotalRevenue } from "../lib/epp-line.ts";

const repoFile = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

// ── The document line mapping, exactly as buildQuoteData builds it (page.tsx:1986-2004) ──────
// unitPrice is taken AS PERSISTED; lineTotal and the grand total come from lib/epp-line — the
// same helpers the worksheet total (:1017-1019) and the save path (:1662) use.
function buildDocument(bidItems) {
  const lineItems = bidItems.map((item) => ({
    description: item.description || "—",
    qty: Number(item.quantity || 0),
    unit: item.unit || "",
    unitPrice: Number(item.unitPrice || 0),
    lineTotal: eppLineTotal(item),
  }));
  return { lineItems, total: eppTotalRevenue(bidItems) };
}

// The persisted total, produced by the real save path: serialize each line, then sum.
function persistedTotal(bidItems) {
  return eppTotalRevenue(bidItems.map(serializeEppLine));
}

const round2 = (n) => Math.round(n * 100) / 100;

// ── 1 — BEHAVIORAL: printed === persisted across every priced shape ──────────────────────────
const FIXTURES = [
  {
    name: "manual prices, NO costing entered (the $0 defect shape)",
    lines: [
      { id: "paving",    description: "Paving",    quantity: 4000, unit: "SF", unitPrice: 7 },
      { id: "landscape", description: "Landscape", quantity: 2000, unit: "SF", unitPrice: 5 },
      { id: "stripping", description: "Stripping", quantity: 2000, unit: "SF", unitPrice: 4 },
      { id: "siteprep",  description: "Site Prep", quantity: 1,    unit: "LS", unitPrice: 29495.28 },
    ],
    expected: 75495.28,
  },
  {
    name: "directly-entered line totals (unitPrice back-computed at entry)",
    // Entry sets unitPrice = enteredTotal / qty and flags priceOverridden (page.tsx:2588-2589).
    lines: [
      { id: "a", description: "Laydown Area", quantity: 1, unit: "LS", unitPrice: 24880, priceOverridden: true },
      { id: "b", description: "Parking Area", quantity: 1, unit: "LS", unitPrice: 13000, priceOverridden: true },
    ],
    expected: 37880,
  },
  {
    name: "overridden unit price on a costed line",
    lines: [
      { id: "g", description: "Site Grading", quantity: 1, unit: "LS", unitPrice: 12500, priceOverridden: true,
        laborEntries: [{ rateId: "op-1", hours: 16, rate: 68.5 }],
        equipmentEntries: [{ rateId: "skid-75", hours: 16, rate: 38 }] },
    ],
    expected: 12500,
  },
  {
    name: "cents — no presentation rounding anywhere",
    lines: [
      { id: "c1", description: "Sealcoat", quantity: 3,   unit: "EA", unitPrice: 33.33 },
      { id: "c2", description: "Crack Fill", quantity: 7, unit: "LF", unitPrice: 1234.56 / 7 },
    ],
    expected: round2(99.99 + 1234.56),
  },
  {
    name: "fractional quantity × fractional rate",
    lines: [{ id: "f", description: "Grading", quantity: 2.5, unit: "HR", unitPrice: 137.77 }],
    expected: 344.425,
  },
  {
    name: "scope-only line (no price yet)",
    lines: [{ id: "s", description: "TBD", quantity: 1, unit: "LS", unitPrice: 0 }],
    expected: 0,
  },
  {
    name: "empty quote",
    lines: [],
    expected: 0,
  },
];

for (const f of FIXTURES) {
  const doc = buildDocument(f.lines);
  const saved = persistedTotal(f.lines);

  // THE FENCE: what the customer document prints is what the system persisted.
  assert.equal(doc.total, saved, `${f.name}: printed total === persisted totalRevenue`);
  assert.equal(round2(doc.total), round2(f.expected), `${f.name}: total ties to the fixture`);

  // The printed document foots: the TOTAL is the sum of the printed line totals.
  const sumOfLines = doc.lineItems.reduce((s, li) => s + li.lineTotal, 0);
  assert.equal(sumOfLines, doc.total, `${f.name}: document foots (Σ line totals === TOTAL)`);

  // Every printed unit price is the persisted unit price — never a recomputed one.
  f.lines.forEach((line, i) => {
    assert.equal(doc.lineItems[i].unitPrice, Number(line.unitPrice || 0),
      `${f.name}: line ${line.id} prints its persisted unit price`);
    assert.equal(doc.lineItems[i].lineTotal, (line.quantity || 0) * (line.unitPrice || 0),
      `${f.name}: line ${line.id} total === qty × persisted unit price`);
  });

  // Survives the save → reload round trip (the document is built from reloaded quotes too).
  const reloaded = JSON.parse(JSON.stringify(f.lines.map(serializeEppLine)));
  assert.equal(buildDocument(reloaded).total, doc.total, `${f.name}: total survives save → reload`);
}

// ── 2 — REGRESSION: the two owner-walk cases (Tom, Jul 20) ───────────────────────────────────
// The defect printed a COST-DERIVED Golden Formula recommendation instead of the quoted price.
const goldenFormula = (cost, marginPct) =>
  marginPct > 0 && marginPct < 100 ? cost / (1 - marginPct / 100) : cost;

// Case 1 "Parking Lot Addition": no costs → recommendation is 0 → the document printed $0.
const case1 = FIXTURES[0].lines;
assert.equal(goldenFormula(0, 20), 0, "case 1: the old cost-derived path yields 0 on a no-cost quote");
assert.equal(buildDocument(case1).total, 75495.28, "case 1: the document now prints the QUOTED $75,495.28");
assert.notEqual(buildDocument(case1).total, 0, "case 1: a no-cost quote must never print $0");

// Case 2 "Laydown/Parking Area": priced ABOVE target; the document printed the recommendation.
const case2 = FIXTURES[1].lines;
assert.equal(Math.round(goldenFormula(28324.49, 20)), 35406,
  "case 2: the old cost-derived path yields the $35,406 recommendation");
assert.equal(buildDocument(case2).total, 37880, "case 2: the document now prints the QUOTED $37,880.00");
assert.notEqual(Math.round(buildDocument(case2).total), 35406,
  "case 2: the document must never print the recommendation");

// ── 3 — STRUCTURAL: the cost-derived path cannot come back unnoticed ─────────────────────────
const pricerSrc = repoFile("app/project-pricer/page.tsx");
const startIdx = pricerSrc.indexOf("const buildQuoteData");
const endIdx = pricerSrc.indexOf("const validationErrors");
assert.ok(startIdx > 0, "buildQuoteData found in app/project-pricer/page.tsx");
assert.ok(endIdx > startIdx, "buildQuoteData end anchor (validationErrors) found");
const buildQuoteDataSrc = pricerSrc.slice(startIdx, endIdx);

assert.ok(!buildQuoteDataSrc.includes("customerUnitPrice"),
  "buildQuoteData must NOT use customerUnitPrice — the Golden Formula recommendation is owner-facing coaching only");
assert.ok(!buildQuoteDataSrc.includes("roundToQuote"),
  "buildQuoteData must NOT apply presentation rounding — printed === persisted");
assert.ok(buildQuoteDataSrc.includes("eppLineTotal"),
  "buildQuoteData builds line totals through lib/epp-line (one price path)");
assert.ok(buildQuoteDataSrc.includes("eppTotalRevenue"),
  "buildQuoteData builds the grand total through lib/epp-line (one price path)");

// The customer document components must not render money through the whole-dollar formatter.
for (const rel of ["components/QuotePreview.tsx", "components/QuotePdfDocument.tsx"]) {
  const src = repoFile(rel);
  assert.ok(!src.includes("formatWhole(lt)"),
    `${rel}: line totals print to the cent, not whole dollars`);
  assert.ok(!src.includes("formatWhole(grandTotal)"),
    `${rel}: the TOTAL prints to the cent, not whole dollars`);
}

console.log("PASS: printed total === persisted totalRevenue across manual, overridden, cents, no-cost, scope-only and empty quotes");
console.log("PASS: owner-walk regressions pinned — a no-cost quote never prints $0; a quote never prints its recommendation");
console.log("PASS: structural — buildQuoteData routes through lib/epp-line, never customerUnitPrice/roundToQuote; documents print to the cent");
