/**
 * FENCE for IDENTITY INTO THE PRICER — both halves of the handoff a saved quote makes when it is
 * opened in the Project Pricer.
 *
 * THE REGRESSION OF RECORD: a quote showing "Scott Sinnott" in the Quotes list opened in the Pricer
 * with an EMPTY salesperson picker and the "legacy name — reselect from the roster" hint, and an
 * EMPTY customer picker while the list printed the customer's name happily. Two different faults with
 * one shape: the pickers are keyed by ID, and the ids were not arriving.
 *
 *   1 — SALESPERSON (lib/people.ts resolveSalespersonFromHandoff / showsLegacySalespersonHint):
 *       an id preselects and is NEVER dropped; a name-only record adopts the id of the exactly-one
 *       pickable person of that name; ambiguous / unknown / inactive adopt nothing; the hint shows in
 *       exactly one state — no id AND no exact-match name.
 *   2 — CUSTOMER (lib/customer-resolve.ts): an id preselects with the registry's canonical name.
 *   3 — CUSTOMER BACKFILL (lib/customer-attribution.ts) — claim the history, customer edition:
 *       exact and case/whitespace-variant names are claimed; unknown and ambiguous are skipped and
 *       counted; an existing customerId is NEVER overwritten; money is byte-identical; runs once.
 *
 * PURE (no localStorage): every assertion calls the real exported function, not a model of it.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/customer-identity-fence.test.mjs
 */
import assert from "node:assert/strict";
import { resolveSalespersonFromHandoff, showsLegacySalespersonHint } from "../lib/people.ts";
import { resolveCustomerFromHandoff } from "../lib/customer-resolve.ts";
import { backfillCustomerIds, planCustomerBackfill } from "../lib/customer-attribution.ts";

// ── 1 — SALESPERSON: THE ID MUST SURVIVE THE HANDOFF ──────────────────────────────────────────────
// Roster: Scott is active and sells. Dana is on the roster but INACTIVE. Two Morgans share a name.
// Pat is active but is not a salesperson (estimator only).
const person = (id, name, extra = {}) => ({
  id, name, roles: ["salesperson"], active: true, createdAt: "2026-01-01", ...extra,
});
const ROSTER = [
  person("p_scott", "Scott Sinnott"),
  person("p_dana", "Dana Reyes", { active: false }),
  person("p_m1", "Morgan Lee"),
  person("p_m2", "morgan lee"),
  person("p_pat", "Pat Quinn", { roles: ["estimator"] }),
];

// THE LIVE REPRO: the quote as the Quotes page hands it over, WITH its roster id. Before the fix this
// field never left the Quotes page at all — openQuote copied the name and dropped the id.
const scottById = resolveSalespersonFromHandoff(
  { salesperson: "Scott Sinnott", salespersonId: "p_scott" },
  ROSTER
);
assert.equal(scottById.salespersonId, "p_scott", "a quote carrying a roster id PRESELECTS that person in the picker");
assert.equal(scottById.salesperson, "Scott Sinnott", "…and displays the roster's canonical name");
assert.equal(showsLegacySalespersonHint(scottById), false, "an attributed quote NEVER shows the legacy hint");

// A stored id is never dropped, even when the person is gone or has gone inactive — dropping it would
// silently re-attribute the quote on the next save.
const inactiveById = resolveSalespersonFromHandoff({ salesperson: "Dana Reyes", salespersonId: "p_dana" }, ROSTER);
assert.equal(inactiveById.salespersonId, "p_dana", "an INACTIVE person's stored id is kept — attribution already recorded stays recorded");
const goneById = resolveSalespersonFromHandoff({ salesperson: "Old Hand", salespersonId: "p_deleted" }, ROSTER);
assert.equal(goneById.salespersonId, "p_deleted", "an id no longer on the roster is still not dropped");
assert.equal(goneById.salesperson, "Old Hand", "…and its stored name is what we can still show");
assert.equal(showsLegacySalespersonHint(goneById), false, "a record WITH an id is never called legacy, findable or not");

// No id + an exact roster name → adopt that id. Case and whitespace variants still match.
const adopted = resolveSalespersonFromHandoff({ salesperson: "  scott sinnott " }, ROSTER);
assert.equal(adopted.salespersonId, "p_scott", "a name-only record adopts the id of the exactly-one pickable person of that name");
assert.equal(adopted.salesperson, "Scott Sinnott", "…and takes the roster's canonical spelling");
assert.equal(showsLegacySalespersonHint(adopted), false, "an adopted record is no longer legacy — no hint");

// The three states that adopt NOTHING — and are therefore the ONLY states that show the hint.
const ambiguous = resolveSalespersonFromHandoff({ salesperson: "Morgan Lee" }, ROSTER);
assert.equal(ambiguous.salespersonId, "", "two pickable people share the name → ambiguous → never guessed");
assert.equal(showsLegacySalespersonHint(ambiguous), true, "…so the legacy hint stands");
const unknown = resolveSalespersonFromHandoff({ salesperson: "Nobody Here" }, ROSTER);
assert.equal(unknown.salespersonId, "", "a name no one on the roster carries adopts nothing");
assert.equal(showsLegacySalespersonHint(unknown), true, "…and shows the hint (the record TRULY has no id and no match)");
const notPickable = resolveSalespersonFromHandoff({ salesperson: "Pat Quinn" }, ROSTER);
assert.equal(notPickable.salespersonId, "", "a name matching someone the picker does not offer adopts nothing — an adopted id must always render");
const inactiveByName = resolveSalespersonFromHandoff({ salesperson: "Dana Reyes" }, ROSTER);
assert.equal(inactiveByName.salespersonId, "", "an INACTIVE person is not pickable, so a name-only record does not adopt them");
assert.equal(showsLegacySalespersonHint(inactiveByName), true, "…and the hint is the honest state");

// An empty record is not "legacy" — it is blank. The hint must not appear on a fresh quote.
const blank = resolveSalespersonFromHandoff({}, ROSTER);
assert.deepEqual(blank, { salespersonId: "", salesperson: "" }, "no id and no name resolves to nothing at all");
assert.equal(showsLegacySalespersonHint(blank), false, "a blank salesperson shows NO hint — there is no legacy name to report");
assert.equal(resolveSalespersonFromHandoff({ salesperson: "Scott Sinnott" }, []).salespersonId, "", "an EMPTY roster adopts nothing (and never throws)");
console.log("PASS: salesperson handoff — a roster id preselects and is never dropped (inactive or deleted); an exact pickable name is adopted (case/space-insensitive); ambiguous, unknown, inactive and non-salesperson names adopt nothing; the legacy hint appears in exactly that state and never on a blank quote");

// ── 2 — CUSTOMER: THE ID MUST PRESELECT, THE NAME IS ONLY A FALLBACK ──────────────────────────────
const REGISTRY = [
  { id: "c_sbi", name: "SBI CONSTRUCTION" },
  { id: "c_dp", name: "Downtown Plaza LLC" },
  { id: "c_dupA", name: "Apex Group" },
  { id: "c_dupB", name: "apex group" },
];
const byId = resolveCustomerFromHandoff({ customerId: "c_sbi", customer: "S.B.I. Constr. (stale copy)" }, REGISTRY);
assert.equal(byId.customerId, "c_sbi", "a quote carrying a customerId PRESELECTS that customer");
assert.equal(byId.customerName, "SBI CONSTRUCTION", "…under the registry's LIVE name, not the quote's stale copy");
const byName = resolveCustomerFromHandoff({ customer: "sbi construction" }, REGISTRY);
assert.equal(byName.customerId, "c_sbi", "a name-only quote still resolves by (case-insensitive) name");
const freeText = resolveCustomerFromHandoff({ customer: "Never Registered LLC" }, REGISTRY);
assert.deepEqual(freeText, { customerId: "", customerName: "Never Registered LLC" }, "a name in no registry keeps its string and gets no id — never invented");
console.log("PASS: customer handoff — a customerId preselects under the registry's live name; a name-only record resolves by name; an unregistered name keeps its string with no id");

// ── 3 — CUSTOMER BACKFILL: CLAIM THE HISTORY, CUSTOMER EDITION ────────────────────────────────────
// Quote/job-shaped records carrying MONEY, so we can prove nothing but customerId ever changes.
const records = [
  { id: "q1", customerId: "", customer: "SBI CONSTRUCTION", totalRevenue: 41000, grossProfitDollars: 9000, status: "Approved", createdAt: "2026-06-10" }, // exact → c_sbi
  { id: "q2", customerName: "  downtown plaza llc  ", totalRevenue: 20000, status: "Lost" },      // case + whitespace variant → c_dp
  { id: "q3", customer: "Never Registered LLC", totalRevenue: 30000 },                            // not in the registry → counted, LEFT ALONE
  { id: "q4", customer: "Apex Group", totalRevenue: 40000 },                                      // two customers share the name → ambiguous
  { id: "q5", customerId: "c_dp", customer: "SBI CONSTRUCTION", totalRevenue: 50000 },            // already attributed → NEVER overwritten
  { id: "q6", totalRevenue: 60000 },                                                              // no name at all → not a candidate
  { id: "j1", customerName: "SBI CONSTRUCTION", jobName: "Downtown Plaza", contractValue: 41000 },// a JOB claims by name too
];
const before = JSON.parse(JSON.stringify(records));
const { records: out, counts } = backfillCustomerIds(records, REGISTRY);

assert.equal(out[0].customerId, "c_sbi", "an exact customer-name match claims the registry id");
assert.equal(out[0].customer, "SBI CONSTRUCTION", "…and the name string stays in place, for provenance");
assert.equal(out[1].customerId, "c_dp", "a case + whitespace name variant still matches");
assert.equal(out[2].customerId, undefined, "a name NOT in pmz_customers is left alone — no customer is ever invented");
assert.equal(out[3].customerId, undefined, "two customers share the name → ambiguous → skipped, never guessed");
assert.equal(out[6].customerId, "c_sbi", "a job record claims its customer by name on the same rule");

// MUTATION TARGET: an already-attributed record is NEVER overwritten. Delete the hasCustomerId guard
// in backfillCustomerIds and q5's "c_dp" becomes "c_sbi" — this is the assertion that catches it.
assert.equal(out[4].customerId, "c_dp", "a record that ALREADY has a customerId is NEVER overwritten — even when its name points somewhere else");
assert.equal(out[5].customerId, undefined, "a record with no name is not a candidate at all");

assert.deepEqual(counts, { matched: 3, ambiguousSkipped: 1, noMatchSkipped: 1 }, "counts: 3 claimed, 1 ambiguous-skipped, 1 named-but-unknown (inspectable, never invented)");

// BYTE-IDENTICAL: strip customerId and every other field — money above all — is unchanged.
const stripId = ({ customerId, ...rest }) => rest;
for (let i = 0; i < records.length; i++) {
  assert.deepEqual(stripId(out[i]), stripId(before[i]), `record ${i}: every non-customerId field is byte-identical (money never touched)`);
}
assert.ok(out[2] === records[2] && out[3] === records[3] && out[4] === records[4] && out[5] === records[5], "skipped/untouched records are the SAME object reference — no needless rewrite");
assert.ok(out[0] !== records[0] && out[1] !== records[1], "a claimed record is a NEW object (the input is never mutated)");
assert.equal(records[0].customerId, "", "the input array was not mutated in place");
console.log("PASS: customer backfill — exact and case/whitespace name matches claim the registry id on quotes AND jobs; unknown and ambiguous names are skipped with inspectable counts and no customer invented; an existing customerId is never overwritten; money byte-identical");

// planCustomerBackfill: combined counts across both stores + the runs-once guard.
const quotesIn = records.slice(0, 6);
const jobsIn = [records[6]];
const plan = planCustomerBackfill(null, quotesIn, jobsIn, REGISTRY);
assert.ok(plan !== null, "flag absent (null) → the backfill plan runs");
assert.deepEqual(plan.byStore.quotes, { matched: 2, ambiguousSkipped: 1, noMatchSkipped: 1 }, "quote-store counts are reported on their own");
assert.deepEqual(plan.byStore.jobs, { matched: 1, ambiguousSkipped: 0, noMatchSkipped: 0 }, "job-store counts are reported on their own");
assert.deepEqual(plan.counts, { matched: 3, ambiguousSkipped: 1, noMatchSkipped: 1 }, "combined counts sum both stores");
assert.equal(plan.quotes[0].customerId, "c_sbi", "the plan claims the orphan quote");
assert.equal(plan.jobs[0].customerId, "c_sbi", "…and the orphan job");
assert.equal(planCustomerBackfill('{"matched":3}', quotesIn, jobsIn, REGISTRY), null, "a present flag → the backfill NEVER runs again");
assert.equal(planCustomerBackfill("", quotesIn, jobsIn, REGISTRY), null, "even an empty-string flag value blocks a re-run — presence is the guard");
console.log("PASS: customer backfill plan — per-store and combined counts; runs-once guard honored (any flag value blocks a re-run)");
