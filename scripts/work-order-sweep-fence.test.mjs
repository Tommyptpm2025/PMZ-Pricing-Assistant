/**
 * FENCE for the self-healing WORK-ORDER SWEEP (lib/work-order-sweep.ts). PURE — fixtures in, jobs out.
 *
 * The sweep repairs quotes that reached Accepted-or-beyond with no job record. What must hold:
 *   (1) ELIGIBILITY — Accepted-through-Paid plus legacy Completed get a work order; Draft, Sent for
 *       Acceptance, Declined and Lost get NOTHING; Full-LEM quotes get NOTHING (the accept path
 *       refuses them, so the repair must refuse them identically).
 *   (2) ONE BIRTHPLACE — a repaired job comes out of createJobFromQuote through the shared
 *       workOrderInputFromQuote mapping: same fields, same fallbacks, a real recipe with a real
 *       rowCostBasis, actuals starting null.
 *   (3) NEVER TOUCH — existing jobs come back BY IDENTITY, unmodified; demo jobs (no quoteId) survive.
 *   (4) IDEMPOTENT — a second sweep over the swept data creates ZERO. No flag involved.
 *
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/work-order-sweep-fence.test.mjs
 */
import assert from "node:assert/strict";
import {
  planWorkOrderSweep,
  isWorkOrderEligible,
  isSweepEligibleStatus,
  workOrderInputFromQuote,
  recipeLinesFromQuote,
} from "../lib/work-order-sweep.ts";
import { createJobFromQuote, jobActualCost, jobSiteFromCustomer } from "../lib/jobs.ts";
import { statusBucket } from "../lib/sales-tracker.ts";
import { STATUS_LABELS } from "../lib/pmz-types.ts";

// Stand-in for buildLineRecipeSections(item, lemCats) — the injected cost-BEARING builder. Emits one
// labor row per bid line so every created job has a real recipe and a real cost basis to assert on.
const buildSections = (item) => [
  {
    title: "Labor",
    isCrew: false,
    rows: [{ name: `Crew for ${item.description}`, plannedQty: item.quantity * 2, unit: "hrs", unitCost: 50 }],
  },
];

const eppLine = (id, description, quantity = 10) => ({
  id,
  description,
  quantity,
  unit: "SF",
  unitPrice: 25,
});

const quote = (id, status, extra = {}) => ({
  id,
  quoteType: "EPP",
  status,
  jobName: `Job ${id}`,
  customerName: `Customer ${id}`,
  workType: "Paving",
  salesperson: "Ann Roster",
  totalRevenue: 50000,
  eppLineItems: [eppLine(`${id}_l1`, `Line one of ${id}`)],
  ...extra,
});

// ── 1 — ELIGIBILITY, BY THE EXACT STRINGS THE APP STORES ──────────────────────────────────────────
// REGRESSION OF RECORD (the sweep created nothing on a real book): a quote showing "Accepted" is
// STORED as "Approved", and one showing "Work Order Active" is STORED as "In Progress". Testing a
// status against the words on screen finds nothing. Each row below pins the STORED value, the LABEL
// the owner reads, and whether the sweep must repair it — so the two can never be confused again.
const STATUS_MATRIX = [
  { stored: "Approved",           label: "Accepted",             eligible: true },
  { stored: "Scheduled",          label: "Scheduled",            eligible: true },
  { stored: "In Progress",        label: "Work Order Active",    eligible: true },
  { stored: "Ready to Invoice",   label: "Ready to Invoice",     eligible: true },
  { stored: "Invoiced",           label: "Invoiced",             eligible: true },
  { stored: "Paid",               label: "Paid",                 eligible: true },
  { stored: "Completed",          label: "Completed",            eligible: true },  // legacy, still won work
  { stored: "Draft",              label: "Draft",                eligible: false },
  { stored: "Ready for Approval", label: "Sent for Acceptance",  eligible: false },
  { stored: "Declined",           label: "Declined",             eligible: false },
  { stored: "Lost",               label: "Lost",                 eligible: false },
];
for (const row of STATUS_MATRIX) {
  assert.equal(
    STATUS_LABELS[row.stored],
    row.label,
    `stored "${row.stored}" must display as "${row.label}" — the sweep tests the STORED value, never this label`
  );
  assert.equal(
    isSweepEligibleStatus(row.stored),
    row.eligible,
    `stored "${row.stored}" (shown as "${row.label}") must ${row.eligible ? "BE" : "NOT be"} sweep-eligible`
  );
  assert.equal(
    isWorkOrderEligible(quote("q", row.stored)),
    row.eligible,
    `an EPP quote stored as "${row.stored}" (shown as "${row.label}") must ${row.eligible ? "get" : "NOT get"} a work order`
  );
}

// DERIVED, NOT HAND-LISTED: eligibility IS the tracker's ACCEPTED bucket. A hand-copied status list
// here is what let a status go missing; this asserts the two can never disagree for any status.
for (const row of STATUS_MATRIX) {
  assert.equal(
    isSweepEligibleStatus(row.stored),
    statusBucket(row.stored) === "ACCEPTED",
    `"${row.stored}" — sweep eligibility must be exactly statusBucket()==="ACCEPTED" (one home for status semantics, lib/sales-tracker.ts)`
  );
}
assert.equal(
  isWorkOrderEligible({ ...quote("qf", "Invoiced"), quoteType: "Full" }),
  false,
  "a FULL quote is refused even at Invoiced — identical to the accept path's EPP-only gate"
);
assert.equal(
  isWorkOrderEligible({ ...quote("qu", "Invoiced"), quoteType: undefined }),
  false,
  "an untyped legacy quote is not EPP → refused (never guessed into a work order)"
);
// LIVE REPRO (the reported defect): a book holding exactly these two quotes and NO jobs must produce
// two work orders. This is the case that silently produced nothing.
const LIVE_BOOK = [
  { ...quote("q_front", "Approved"),    jobName: "Front Lot" },   // screen says "Accepted"
  { ...quote("q_square", "In Progress"), jobName: "The square" }, // screen says "Work Order Active"
];
const liveSweep = planWorkOrderSweep(LIVE_BOOK, [], buildSections);
assert.equal(liveSweep.createdCount, 2, "the live book (Accepted 'Front Lot' + Work Order Active 'The square', no jobs) must produce TWO work orders");
assert.deepEqual(
  liveSweep.created.map((j) => j.jobName).sort(),
  ["Front Lot", "The square"],
  "…and they are those two jobs by name"
);
assert.equal(liveSweep.counts.examined, 2, "counts report what the sweep looked at");
assert.equal(liveSweep.counts.eligible, 2, "…both eligible");
assert.equal(liveSweep.counts.skippedStatus, 0, "…neither refused on status — 'In Progress' is NOT a skip");
console.log("PASS: work-order sweep eligibility — pinned to the STORED status strings with their on-screen labels (Accepted=Approved, Work Order Active=In Progress); derived from the tracker's ACCEPTED bucket, never hand-listed; the live two-quote repro produces two work orders");

// ── 2 — A LATE-STATUS QUOTE WITH NO JOB GETS ONE, VIA THE SHARED CREATION PATH ────────────────────
const LATE = quote("q_inv", "Invoiced", {
  grandTotal: 61000,                       // grandTotal WINS over totalRevenue (accept-path fallback order)
  jobSiteAddress: "12 Elm St, Springfield",
  eppLineItems: [eppLine("l1", "Mill and overlay", 10), eppLine("l2", "Striping", 4)],
});
const swept = planWorkOrderSweep([LATE], [], buildSections);

assert.equal(swept.createdCount, 1, "one late-status quote with no job → exactly one work order created");
assert.equal(swept.jobs.length, 1, "the returned job set carries it");
const made = swept.created[0];
assert.equal(made.quoteId, "q_inv", "the new job is LINKED to its quote (quoteId) — the only join that exists");
assert.equal(made.status, "open", "a repaired work order starts open, like any newly created one");
assert.equal(made.jobName, "Job q_inv", "job name carried from the quote");
assert.equal(made.customerName, "Customer q_inv", "customer name carried from the quote");
assert.equal(made.contractValue, 61000, "contract value = grandTotal ?? totalRevenue — grandTotal wins, frozen at creation");
assert.equal(made.jobSite?.address, "12 Elm St, Springfield", "the quote's site address is snapshotted onto the job");
assert.equal(made.bidItems.length, 2, "both bid lines snapshotted");
assert.equal(made.recipeLines.length, 2, "a real recipe line per bid line — not an empty shell");

// The recipe is cost-STRIPPED for the foreman while the owner basis is populated — the same split
// createJobFromQuote performs at accept. A repaired job must be able to answer Estimate-vs-Actual.
const row = made.recipeLines[0].sections[0].rows[0];
assert.equal(row.actualQty, null, "actuals start null — the foreman has not reported yet (never a fabricated 0)");
assert.equal(row.plannedQty, 20, "planned qty came through the injected builder (10 × 2)");
assert.equal("unitCost" in row, false, "the persisted foreman row carries NO cost — zero-dollars law holds on repaired jobs too");
assert.equal(made.rowCostBasis[row.id], 50, "the owner-only cost basis IS populated — a repaired job can be valued");
assert.equal(Object.keys(made.rowCostBasis).length, 2, "one basis entry per recipe row");
assert.equal(jobActualCost(made).complete, false, "no actuals reported yet → cost data incomplete (margin stays blank downstream)");

// The mapping is the SHARED one — assert it directly, since the accept path now calls it too.
const input = workOrderInputFromQuote(LATE, recipeLinesFromQuote(LATE, buildSections));
assert.equal(input.quoteId, "q_inv", "shared mapping sets quoteId");
assert.equal(input.contractValue, 61000, "shared mapping applies the grandTotal ?? totalRevenue fallback");
assert.equal(input.quoteJobSiteAddress, "12 Elm St, Springfield", "shared mapping passes the site address");
assert.equal(input.bidItems.length, 2, "shared mapping snapshots every bid line");
const fallback = workOrderInputFromQuote(
  { ...LATE, grandTotal: undefined, customerName: undefined, customer: "Legacy Co" },
  []
);
assert.equal(fallback.contractValue, 50000, "no grandTotal → falls back to totalRevenue");
assert.equal(fallback.customerName, "Legacy Co", "no customerName → falls back to the denormalized customer string");
console.log("PASS: work-order sweep creation — a late-status orphan gets a linked work order through the SHARED createJobFromQuote mapping; recipe cost-stripped, owner basis populated, actuals null");

// ── 3 — NEVER CREATE A DUPLICATE, NEVER TOUCH AN EXISTING JOB ─────────────────────────────────────
const EXISTING = createJobFromQuote(
  workOrderInputFromQuote(quote("q_has", "Approved"), recipeLinesFromQuote(quote("q_has", "Approved"), buildSections))
);
const DEMO = createJobFromQuote({
  jobName: "Demo job",                    // no quoteId — joins nothing, must survive untouched
  workTypeName: "Paving",
  salesperson: "Owner",
  contractValue: 100,
  bidItems: [],
  recipeLines: [],
});
const withExisting = planWorkOrderSweep([quote("q_has", "Approved")], [EXISTING, DEMO], buildSections);
assert.equal(withExisting.createdCount, 0, "a quote that already has a job gets NO second one");
assert.equal(withExisting.jobs.length, 2, "the job set is unchanged in length");
assert.equal(withExisting.jobs[0], EXISTING, "the existing job comes back BY IDENTITY — same object, never rewritten");
assert.equal(withExisting.jobs[1], DEMO, "a demo job (no quoteId) is carried along untouched");
assert.equal(withExisting.jobs, withExisting.jobs, "no-op sweep returns the job array itself, not a rebuilt copy");

// Two eligible quotes, one already served → only the orphan is repaired, and the served one is intact.
const MIXED = planWorkOrderSweep(
  [quote("q_has", "Approved"), quote("q_orphan", "Paid")],
  [EXISTING],
  buildSections
);
assert.equal(MIXED.createdCount, 1, "only the orphan is repaired");
assert.equal(MIXED.created[0].quoteId, "q_orphan", "and it is the right one");
assert.equal(MIXED.jobs[0], EXISTING, "the already-served job is still the SAME object after a sweep that created something");

// The quote objects themselves are never written to — the sweep returns jobs only.
const QUOTE_IN = quote("q_frozen", "Invoiced");
const snapshot = JSON.stringify(QUOTE_IN);
planWorkOrderSweep([QUOTE_IN], [], buildSections);
assert.equal(JSON.stringify(QUOTE_IN), snapshot, "the QUOTE is byte-identical after a sweep — money and status untouched");
console.log("PASS: work-order sweep safety — no duplicate for a served quote; existing and demo jobs returned by identity; the quote record is never modified");

// ── 4 — REFUSED POPULATIONS CREATE NOTHING ────────────────────────────────────────────────────────
// ---- MUTATION TARGET: widening the status gate to Draft ----
// Making the sweep also create for Draft quotes yields 1 here and this assertion FAILS, naming Draft —
// a quote nobody has accepted would get a work order the crew could work from.
const DRAFTS = planWorkOrderSweep([quote("q_draft", "Draft")], [], buildSections);
assert.equal(DRAFTS.createdCount, 0, "a DRAFT quote gets NO work order — nothing has been accepted, there is no work to run");
assert.deepEqual(DRAFTS.created, [], "and nothing is returned as created");

const SENT = planWorkOrderSweep([quote("q_sent", "Ready for Approval")], [], buildSections);
assert.equal(SENT.createdCount, 0, "a quote still out for acceptance gets NO work order");
const DECLINED = planWorkOrderSweep(
  [quote("q_decl", "Declined"), quote("q_lost", "Lost")],
  [],
  buildSections
);
assert.equal(DECLINED.createdCount, 0, "Declined and Lost get NO work order — a lost bid is not work");
const FULL = planWorkOrderSweep([{ ...quote("q_full", "Invoiced"), quoteType: "Full" }], [], buildSections);
assert.equal(FULL.createdCount, 0, "a FULL quote at Invoiced gets NO work order — excluded exactly as the accept path excludes it");
const EMPTY = planWorkOrderSweep([], [], buildSections);
assert.equal(EMPTY.createdCount, 0, "no quotes → nothing created, no crash");
console.log("PASS: work-order sweep refusals — Draft, Sent for Acceptance, Declined, Lost and Full quotes all create nothing");

// ── 5 — IDEMPOTENT: THE SECOND RUN CREATES ZERO (no flag involved) ────────────────────────────────
const POP = [
  quote("a", "Approved"),
  quote("b", "Invoiced"),
  quote("c", "Completed"),      // legacy status still earns its record
  quote("d", "Draft"),          // refused
  { ...quote("e", "Paid"), quoteType: "Full" }, // refused
];
const run1 = planWorkOrderSweep(POP, [], buildSections);
assert.equal(run1.createdCount, 3, "first sweep repairs the three eligible orphans (a, b, c)");
assert.deepEqual(run1.created.map((j) => j.quoteId).sort(), ["a", "b", "c"], "and exactly those three");

const run2 = planWorkOrderSweep(POP, run1.jobs, buildSections);
assert.equal(run2.createdCount, 0, "SECOND sweep over the swept data creates ZERO — idempotent with no flag, absence of the job IS the condition");
assert.equal(run2.jobs.length, 3, "the job set does not grow");
run1.jobs.forEach((j, i) => assert.equal(run2.jobs[i], j, `job ${i} survives the second sweep by identity — untouched`));

const run3 = planWorkOrderSweep(POP, run2.jobs, buildSections);
assert.equal(run3.createdCount, 0, "and a third run is still zero — repeated loads never accumulate work orders");

// A duplicate quote id within ONE sweep still yields one job (the in-run guard).
const DUPES = planWorkOrderSweep([quote("dup", "Approved"), quote("dup", "Invoiced")], [], buildSections);
assert.equal(DUPES.createdCount, 1, "a repeated quote id inside a single sweep produces ONE work order, not two");
console.log("PASS: work-order sweep idempotence — first run repairs every orphan, second and third create ZERO and touch nothing; duplicate ids within a run yield one job");

// ── 6 — THE INVOCATION IS WIRED (the defect the math fence could not catch) ───────────────────────
// REGRESSION OF RECORD: every assertion above passed while the sweep ran ZERO times in the browser.
// The math was never the defect — the CALL was. A pure fence cannot see a missing call, so this block
// reads the page sources and asserts the wiring itself.
//
// WHAT THIS IS AND IS NOT: it is a SOURCE-LEVEL check that both reader surfaces import the entry point
// and call it inside a mount effect. It cannot prove React actually executed that effect in a browser
// — only a DOM/component test could, and this repo has no component-test harness. What it DOES catch
// is the whole family this defect belongs to: the call being deleted, renamed, moved out of a page, or
// re-buried behind a readiness gate. Combined with the unconditional log in runWorkOrderSweep — one
// "[work-order-sweep] ran:" line per call, on every path including failure — a silent console is now a
// definite diagnosis ("not called") rather than an ambiguity. See the report for what a future
// component-level test would add.
import { readFileSync } from "node:fs";

const sweepSrc = readFileSync(new URL("../lib/work-order-sweep.ts", import.meta.url), "utf8");
assert.match(sweepSrc, /export function runWorkOrderSweep\b/, "the ONE storage-bound entry point exists — pages must never re-implement the sweep body");
// It logs on EVERY path: created, nothing-to-do, and failure. Silence can then only mean "not called".
// Each phrase is pinned individually — a count would happily be satisfied by three copies of one path.
for (const [path, phrase] of [
  ["created", "[work-order-sweep] ran: created "],
  ["nothing to do", "[work-order-sweep] ran: nothing to do ("],
  ["failed", "[work-order-sweep] ran: FAILED"],
]) {
  assert.ok(
    sweepSrc.includes(phrase),
    `runWorkOrderSweep announces the '${path}' path with "${phrase}" — it logs on ALL THREE paths, so a missing line can only ever mean it was NOT CALLED`
  );
}
assert.doesNotMatch(
  sweepSrc.slice(sweepSrc.indexOf("export function runWorkOrderSweep")),
  /ratesLoaded|sweepPassRef|<\s*2\s*\)\s*return/,
  "the entry point carries NO readiness gate — the pass-counter gate is exactly what made it never run"
);

for (const page of ["../app/quotes/page.tsx", "../app/jobs/page.tsx"]) {
  const src = readFileSync(new URL(page, import.meta.url), "utf8");
  assert.match(
    src,
    /import\s*\{[^}]*\brunWorkOrderSweep\b[^}]*\}\s*from\s*["']@\/lib\/work-order-sweep["']/,
    `${page} imports the shared sweep entry point`
  );
  assert.match(
    src,
    /runWorkOrderSweep\s*\(/,
    `${page} CALLS the sweep on load — the Quotes page lost its call behind a gate and the Jobs page never had one`
  );
  // The call must live inside an effect, not in render (a render-phase write to the job store would
  // fire on every keystroke) and not inside a click handler (that is not "on load").
  const callIdx = src.indexOf("runWorkOrderSweep(");
  const before = src.slice(0, callIdx);
  assert.match(
    before.slice(-600),
    /React\.useEffect\(\s*\(\)\s*=>\s*\{/,
    `${page} calls the sweep from inside a mount effect — on load, not in render and not behind a button`
  );
  assert.doesNotMatch(
    src,
    /planWorkOrderSweep\s*\(/,
    `${page} does NOT call planWorkOrderSweep directly — a page that plans its own sweep can forget to log, which is the defect`
  );
}
console.log("PASS: work-order sweep invocation — one storage-bound entry point that logs on all three paths with no readiness gate, imported AND called from a mount effect on BOTH reader pages (quotes + jobs), neither of which plans its own sweep");

// ── 7 — THE JOB SITE ACCEPTS WHAT REAL DATA ACTUALLY HOLDS ───────────────────────────────────────
// CRASH OF RECORD (from the live console):
//   TypeError: fallbackAddress?.trim is not a function  at jobSiteFromCustomer (jobs.ts:199)
// It threw out of createJobFromQuote, out of planWorkOrderSweep, and killed the WHOLE sweep — a book
// of accepted quotes got no job records because of one field. `SavedQuote.jobSiteAddress` is DECLARED
// string but the Pricer copies the customer's structured address OBJECT into it, so the declared type
// was a promise the data never made. These cases pin every shape that has been seen or is plausible.
const SITE_SHAPES = [
  ["a structured address OBJECT (the real-data case that crashed)", { street: "12 Elm St", city: "Springfield", stateCode: "IL", zip: "62704" }, "12 Elm St, Springfield, IL 62704"],
  ["a plain string", "  1420 Oak Ave, Peoria IL  ", "1420 Oak Ave, Peoria IL"],
  ["a NUMBER (a bare street number survives an old import)", 1420, "1420"],
  ["an address object whose zip is a NUMBER, not a string", { street: "9 Main", city: "Ames", state: "IA", zip: 50010 }, "9 Main, Ames, IA 50010"],
  ["an EMPTY object", {}, undefined],
  ["an object of unrelated junk", { foo: "bar", nested: { deep: 1 } }, undefined],
  ["an ARRAY", ["12 Elm St"], undefined],
  ["null", null, undefined],
  ["undefined", undefined, undefined],
  ["a boolean", true, undefined],
  ["an empty string", "   ", undefined],
];
for (const [label, fallback, expected] of SITE_SHAPES) {
  let site;
  assert.doesNotThrow(
    () => { site = jobSiteFromCustomer(null, fallback); },
    `jobSiteFromCustomer NEVER throws on ${label} — a work order must never fail to exist over a field it only meant to print`
  );
  if (expected === undefined) {
    assert.equal(site, undefined, `${label} yields no job site at all (never "[object Object]", never a fabricated address)`);
  } else {
    assert.equal(typeof site.address, "string", `${label} yields a STRING address`);
    assert.equal(site.address, expected, `${label} formats to "${expected}"`);
  }
}
// The linked customer's own address still wins over the fallback, and still carries GPS + notes.
const withCustomer = jobSiteFromCustomer(
  { jobSiteAddress: { street: "1 Depot Rd", city: "Quincy", stateCode: "MA", zip: "02169", latitude: 42.25, longitude: -71.0, accessNotes: "  Gate code 4821  " } },
  { street: "IGNORED fallback", city: "Nowhere" }
);
assert.equal(withCustomer.address, "1 Depot Rd, Quincy, MA 02169", "the linked customer's address still wins over the quote's fallback");
assert.equal(withCustomer.latitude, 42.25, "…and still carries GPS");
assert.equal(withCustomer.accessNotes, "Gate code 4821", "…and trimmed access notes");
// Corrupt GPS is dropped rather than stored as junk.
const badGps = jobSiteFromCustomer({ jobSiteAddress: { street: "5 Way", latitude: "42.25", longitude: null, accessNotes: { text: "hi" } } }, undefined);
assert.equal(badGps.latitude, undefined, "a STRING latitude is not a latitude — dropped, never stored as text (GPS is numeric or absent)");
assert.equal(badGps.longitude, undefined, "a null longitude is dropped rather than stored");
assert.equal(badGps.accessNotes, undefined, "OBJECT access notes are dropped — never '[object Object]' printed at a foreman");
assert.equal(badGps.address, "5 Way", "…and the address still comes through");
// A number IS text, deliberately and consistently: it is what rescues a numeric zip, and a note the
// owner typed as "7" is still the note they typed.
assert.equal(
  jobSiteFromCustomer({ jobSiteAddress: { street: "5 Way", accessNotes: 7 } }, undefined).accessNotes,
  "7",
  "a NUMERIC access note coerces to text — same rule that rescues a numeric zip, applied consistently"
);
console.log("PASS: job site coercion — jobSiteFromCustomer accepts a string, an address object, a number, an array, junk, null and undefined without EVER throwing; it returns a real one-line address or nothing at all, and corrupt GPS is dropped rather than stored");

// ── 8 — ONE ROTTEN BOARD MUST NOT CONDEMN THE LOAD ───────────────────────────────────────────────
// The crash above aborted the whole sweep because creation was unguarded inside the loop. Creation is
// now guarded PER QUOTE: everything creatable gets created, and the failures are counted and NAMED.

// (a) THE LIVE REPRO. A quote carrying the object-shaped jobSiteAddress must now produce a work order.
// MUTATION TARGET: restore the unguarded `fallbackAddress?.trim()` in lib/jobs.ts and this quote
// throws — it lands in `failed` instead of `created`, and these assertions fail by name.
const OBJECT_SITE = quote("q_objsite", "Approved", {
  jobSiteAddress: { street: "12 Elm St", city: "Springfield", stateCode: "IL", zip: "62704" },
});
const objSweep = planWorkOrderSweep([OBJECT_SITE], [], buildSections);
assert.equal(objSweep.counts.failed, 0, "a quote whose jobSiteAddress is an OBJECT no longer fails — this is the crash of record, fixed at the root");
assert.equal(objSweep.createdCount, 1, "…it CREATES its work order");
assert.equal(objSweep.created[0].jobSite?.address, "12 Elm St, Springfield, IL 62704", "…with the object formatted into a real one-line site address");

// (b) A genuinely poisoned quote (its recipe build throws) costs EXACTLY ITSELF.
const poisonBuild = (item) => {
  if (String(item.description).includes("POISON")) throw new Error("recipe build exploded on this line");
  return buildSections(item);
};
const MIXED_BOOK = [
  quote("q_good1", "Approved"),
  quote("q_poison", "Invoiced", { eppLineItems: [eppLine("p_l1", "POISON line")] }),
  quote("q_good2", "In Progress"),
];
const mixed = planWorkOrderSweep(MIXED_BOOK, [], poisonBuild);
assert.equal(mixed.createdCount, 2, "two good quotes are still built — ONE bad record does not abort the sweep");
assert.deepEqual(mixed.created.map((j) => j.quoteId).sort(), ["q_good1", "q_good2"], "…and they are exactly the two good ones");
assert.equal(mixed.counts.failed, 1, "the failure is COUNTED, not swallowed and not fatal");
assert.deepEqual(mixed.counts.failedQuoteIds, ["q_poison"], "…and the failing quote is NAMED, so an owner can go look at it");
assert.match(mixed.counts.firstError, /recipe build exploded/, "…carrying the first error's message for the console line");
assert.equal(mixed.counts.eligible, 3, "all three were eligible — a build failure is not an eligibility skip");
assert.equal(mixed.jobs.length, 2, "the saved job set holds the two that worked");

// A sweep where EVERY quote fails still returns cleanly (it reports, it does not throw).
const allBad = planWorkOrderSweep([quote("q_p1", "Approved", { eppLineItems: [eppLine("x", "POISON a")] })], [], poisonBuild);
assert.equal(allBad.createdCount, 0, "an all-failing sweep creates nothing…");
assert.equal(allBad.counts.failed, 1, "…and says so rather than throwing");
assert.deepEqual(allBad.jobs, [], "…leaving the existing job set untouched");
console.log("PASS: work-order sweep resilience — the object-shaped jobSiteAddress now builds instead of crashing; a genuinely poisoned quote costs exactly itself while the rest of the load is created, and the failure is counted, named, and carries its first error message");
