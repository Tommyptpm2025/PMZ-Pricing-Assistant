/**
 * FENCE for the customer handoff resolver (Cause 2 of the blank-dropdown defect). TWO guarantees:
 *   (1) BEHAVIORAL — the REAL resolveCustomerFromHandoff (not a model of it): id resolves to the
 *       registry's canonical name (drift disappears), orphan drops the dangling id and falls back to
 *       name, legacy name-match resolves, free-text keeps its name with no id.
 *   (2) STRUCTURAL/CHOKEPOINT — the openQuote blob carries customerId; both Pricer call sites pass a
 *       FRESHLY read registry (never the stale `customers` state); and the id-or-name recovery rule
 *       lives in exactly one file (lib/customer-resolve.ts) — no inline twin anywhere under app/ or lib/.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/customer-resolve-fence.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { resolveCustomerFromHandoff, resolveCustomerName, findCustomerRecord } from "../lib/customer-resolve.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const REGISTRY = [
  { id: "c1", name: "SBI Construction" },
  { id: "c2", name: "The Store" },
];

// ── 1 — BEHAVIORAL: call the real resolver ────────────────────────────────────────────────────
{
  // Drift in CASE: stored "SBI CONSTRUCTION", registry "SBI Construction", id present.
  const r = resolveCustomerFromHandoff({ customerId: "c1", customerName: "SBI CONSTRUCTION", customer: "SBI CONSTRUCTION" }, REGISTRY);
  assert.equal(r.customerId, "c1", "id resolves");
  assert.equal(r.customerName, "SBI Construction", "case drift → returns the registry's canonical name (this is what un-blanks the dropdown)");
}
{
  // Drift in PUNCTUATION: stored "SBI Construction, Inc.", id present.
  const r = resolveCustomerFromHandoff({ customerId: "c1", customerName: "SBI Construction, Inc." }, REGISTRY);
  assert.equal(r.customerId, "c1", "id resolves despite punctuation drift");
  assert.equal(r.customerName, "SBI Construction", "punctuation drift → canonical name");
}
{
  // ORPHAN: id present, no record matches it, name also not in registry.
  const r = resolveCustomerFromHandoff({ customerId: "deleted-99", customerName: "Ghost Co" }, REGISTRY);
  assert.equal(r.customerId, "", "ORPHAN drops the dangling id — a deleted customer's id must NOT survive the handoff");
  assert.equal(r.customerName, "Ghost Co", "ORPHAN falls back to the name (no silent blank)");
}
{
  // ORPHAN whose name DOES match a live record → re-homes by name, no dangling id.
  const r = resolveCustomerFromHandoff({ customerId: "deleted-99", customerName: "The Store" }, REGISTRY);
  assert.equal(r.customerId, "c2", "ORPHAN with a name match adopts the live record's id, not the dangling one");
  assert.equal(r.customerName, "The Store", "…and its canonical name");
}
{
  // LEGACY: no id, exact name match.
  const r = resolveCustomerFromHandoff({ customerId: "", customer: "The Store" }, REGISTRY);
  assert.equal(r.customerId, "c2", "no id + exact name match → adopts the registry id");
  assert.equal(r.customerName, "The Store", "…and canonical name");
}
{
  // FREE-TEXT: no id, no name match → keep the name, no id (their only recovery).
  const r = resolveCustomerFromHandoff({ customerId: "", customer: "Bob’s Garage" }, REGISTRY);
  assert.equal(r.customerId, "", "free-text customer never in the registry → no id");
  assert.equal(r.customerName, "Bob’s Garage", "…keeps the typed name");
}
console.log("PASS: customer resolver — id→canonical (drift gone), orphan drops the dangling id, legacy/free-text preserved");

// ── 1b — DISPLAY resolver (C3): resolveCustomerName is live-canonical by id, stored fallback ─────
{
  // id matches -> the registry's canonical name even when the stored name drifts (M2 target).
  assert.equal(resolveCustomerName({ customerId: "c1", customerName: "SBI CONSTRUCTION" }, REGISTRY), "SBI Construction",
    "resolveCustomerName: an id match returns the LIVE canonical name, not the quote's stored copy");
  // orphan id -> re-homes by name (no dangling id), so the name still shows.
  assert.equal(resolveCustomerName({ customerId: "gone", customerName: "The Store" }, REGISTRY), "The Store",
    "resolveCustomerName: an orphaned id re-homes by name");
  // no id, free-text never in the registry -> keep the stored name (M3 target).
  assert.equal(resolveCustomerName({ customerId: "", customer: "Bob’s Garage" }, REGISTRY), "Bob’s Garage",
    "resolveCustomerName: a free-text customer keeps its stored name (its only recovery)");
  // findCustomerRecord returns the FULL record by id (address/contact reach the doc).
  const rec = findCustomerRecord({ customerId: "c2" }, REGISTRY);
  assert.equal(rec && rec.id, "c2", "findCustomerRecord resolves the full record by id");
}
console.log("PASS: display resolver — resolveCustomerName live-canonical by id; findCustomerRecord is the one record-resolution primitive");

// ── 2 — STRUCTURAL + CHOKEPOINT ───────────────────────────────────────────────────────────────
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
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

// (a) the openQuote blob carries customerId.
assert.ok(
  read("app/quotes/page.tsx").includes("customerId: quote.customerId"),
  "the openQuote handoff blob (app/quotes/page.tsx) no longer carries customerId — the Pricer will fall back to name-matching and drift will blank the dropdown. Add `customerId: quote.customerId || \"\",`."
);

// (b) both Pricer call sites pass a FRESHLY read registry, never the stale `customers` state.
const pricer = read("app/project-pricer/page.tsx");
assert.ok(
  !pricer.includes("resolveCustomerFromHandoff(saved, customers)"),
  "a Pricer call site passes the STALE `customers` React state instead of a fresh read. On mount that state is EMPTY, so the id never matches and the drift silently blanks the dropdown. Pass freshCustomers."
);
assert.equal(
  (pricer.match(/resolveCustomerFromHandoff\(saved, freshCustomers\)/g) || []).length,
  2,
  "both Pricer call sites must pass a freshly read registry (freshCustomers) to resolveCustomerFromHandoff"
);

// (c) CHOKEPOINT — the id-or-name handoff recovery rule lives in exactly ONE file.
const files = [...tsFiles(join(repoRoot, "app")), ...tsFiles(join(repoRoot, "lib"))];
const defs = files.filter((f) => readFileSync(f, "utf8").includes("export function resolveCustomerFromHandoff"));
assert.equal(defs.length, 1, "resolveCustomerFromHandoff must be defined exactly once");
assert.ok(defs[0].replace(/\\/g, "/").endsWith("lib/customer-resolve.ts"), "…and its home is lib/customer-resolve.ts");
for (const abs of files) {
  const rel = abs.slice(repoRoot.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
  if (rel.endsWith("lib/customer-resolve.ts")) continue;
  const t = readFileSync(abs, "utf8");
  const inlineRecovery = /!\s*\w*[Cc]ustId\s*&&/.test(t) || t.includes("backward compat: lookup by name");
  assert.ok(
    !inlineRecovery,
    `${rel} carries the handoff customer-recovery rule inline (id → else name lookup). It must live ONLY in ` +
      `lib/customer-resolve.ts — call resolveCustomerFromHandoff(saved, freshCustomers) instead of re-implementing it.`
  );
}
console.log("PASS: customer resolver wiring — blob carries customerId, both call sites read fresh, recovery rule lives only in lib/customer-resolve.ts");

// ── 2b — DISPLAY wiring + chokepoint (C3) ─────────────────────────────────────────────────────
// Every human-facing customer name on the Quotes page resolves via resolveCustomerName (live-by-id).
const quotesSrc = read("app/quotes/page.tsx");
assert.equal(
  (quotesSrc.match(/resolveCustomerName\(/g) || []).length,
  4,
  "all FOUR customer-name displays on the Quotes page (list title, list cell, compact list, preview dialog) must render " +
    "via resolveCustomerName. A count != 4 means a display surface on app/quotes/page.tsx reverted to reading the quote's " +
    "STORED copy directly — every human-facing customer name must be live-canonical by id."
);
// CHOKEPOINT — the record-resolution primitive lives in exactly one file (currentCustomer folds into it).
const recordDefs = files.filter((f) => readFileSync(f, "utf8").includes("export function findCustomerRecord"));
assert.equal(recordDefs.length, 1, "findCustomerRecord (the id→name registry resolution) must be defined exactly once");
assert.ok(recordDefs[0].replace(/\\/g, "/").endsWith("lib/customer-resolve.ts"), "…and its home is lib/customer-resolve.ts");
assert.ok(
  !read("app/project-pricer/page.tsx").includes("customers.find((c: any) => c.id === id)"),
  "the currentCustomer memo must resolve through findCustomerRecord, not an inline id-or-name find (app/project-pricer/page.tsx)"
);
console.log("PASS: display wiring — all 4 Quotes-page names resolve live-by-id; the record-resolution rule lives only in lib/customer-resolve.ts");
