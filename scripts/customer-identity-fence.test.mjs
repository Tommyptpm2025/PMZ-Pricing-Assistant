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
import { createJobFromQuote } from "../lib/jobs.ts";
import { workOrderInputFromQuote } from "../lib/work-order-sweep.ts";
import { suggestCustomerMatches, significantWords } from "../lib/customer-suggest.ts";

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

// ── 4 — THE JOB STAMPS customerId AT BIRTH ────────────────────────────────────────────────────────
// Ruling: the job is a SNAPSHOT taken at accept, and the customer's id belongs in it. A name string
// alone can only ever be re-matched by guessing later — which is what the backfill above exists to
// clean up, and what a birth-path stamp stops needing. Tested through workOrderInputFromQuote, the
// ONE quote→job mapping both the accept path and the repair sweep feed createJobFromQuote from, so
// this proves the stamp for BOTH doors at once.
const acceptedQuote = {
  id: "q_born", quoteType: "EPP", status: "Approved",
  jobName: "Downtown Plaza", customer: "SBI CONSTRUCTION", customerId: "c_sbi",
  workType: "Paving", salesperson: "Scott Sinnott", grandTotal: 41000,
  eppLineItems: [{ id: "l1", description: "Mill and overlay", quantity: 10, unit: "TON", unitPrice: 400 }],
};
const bornWithId = createJobFromQuote(workOrderInputFromQuote(acceptedQuote, []));
assert.equal(bornWithId.customerId, "c_sbi", "a job created from a quote WITH a customerId carries that id — the snapshot is complete");
assert.equal(bornWithId.customerName, "SBI CONSTRUCTION", "…alongside the name, which is still snapshotted for the foreman header");

// A free-text customer (never in the registry) has no id to carry — the job must show NONE, not "".
const { customerId: _dropped, ...freeTextQuote } = acceptedQuote;
const bornWithout = createJobFromQuote(workOrderInputFromQuote({ ...freeTextQuote, id: "q_free" }, []));
assert.equal(bornWithout.customerId, undefined, "a job created from a quote WITHOUT a customerId carries none — never an empty string, never invented");
assert.equal(bornWithout.customerName, "SBI CONSTRUCTION", "…and the name still travels, so the work order still says who it is for");
assert.equal(
  createJobFromQuote(workOrderInputFromQuote({ ...acceptedQuote, customerId: "   " }, [])).customerId,
  undefined,
  "a whitespace-only id is not an id — it is absent"
);
console.log("PASS: job birth — createJobFromQuote stamps the quote's customerId onto the new job through the shared accept/sweep mapping; a quote with no id yields a job with none (never blank, never guessed)");

// ── 5 — NEAR-MATCH SUGGESTIONS: RANKED OPTIONS, NEVER A GUESS ─────────────────────────────────────
// Law 82 in a pure function. The resolve panel may OFFER; only a human may CHOOSE. These cases pin
// both halves: the ranking is real and explainable, and nothing in the result says "this one".
const SUGGEST_BOOK = [
  { id: "c_sbi_llc", name: "SBI Construction LLC" },   // shares BOTH significant words
  { id: "c_sbi_paving", name: "SBI Paving" },          // shares SBI
  { id: "c_generic", name: "Riverside Construction" }, // shares CONSTRUCTION
  { id: "c_none", name: "Zenith Holdings" },           // shares nothing significant
  { id: "c_llc_only", name: "Marlow LLC" },            // shares ONLY "LLC" — which means nothing
];

// Word splitting: legal forms and filler carry no identity and must never earn a rank.
assert.deepEqual(significantWords("SBI Construction LLC"), ["sbi", "construction"], "legal forms (LLC) are not significant words");
assert.deepEqual(significantWords("The A. B. Company & Co"), ["b"], "filler, initials-of-one-letter aside, and legal forms drop out");
assert.deepEqual(significantWords("Acme  acme ACME"), ["acme"], "repeated words count once");
assert.deepEqual(significantWords("   "), [], "a blank name has no words");

const ranked = suggestCustomerMatches("SBI CONSTRUCTION", SUGGEST_BOOK);
assert.deepEqual(
  ranked.map((s) => s.id),
  ["c_sbi_llc", "c_generic", "c_sbi_paving"],
  "EXACT-WORD OVERLAP RANKS FIRST: two shared words beat one; the one-word matches follow, tie-broken by NAME (deterministic — the same input always renders the same list, and no invisible 'this word is rarer' judgement decides the order)"
);
assert.deepEqual(ranked[0].sharedWords, ["sbi", "construction"], "the shared words are returned so the panel can SHOW why a suggestion is offered");
assert.deepEqual(ranked[1].sharedWords, ["construction"], "a one-word match reports the one word it shares");
assert.deepEqual(ranked[2].sharedWords, ["sbi"], "…and so does the next");
assert.ok(!ranked.some((s) => s.id === "c_none"), "a customer sharing NO significant word is not a suggestion at all");
assert.ok(!ranked.some((s) => s.id === "c_llc_only"), "sharing only a legal form (LLC) is not a match — it would rank every company in the book");

// NO MATCH RETURNS EMPTY — never the alphabetical top of the registry dressed up as a suggestion.
assert.deepEqual(suggestCustomerMatches("Nordic Wharf", SUGGEST_BOOK), [], "a name sharing nothing returns an EMPTY list");
assert.deepEqual(suggestCustomerMatches("", SUGGEST_BOOK), [], "a blank name suggests nothing");
assert.deepEqual(suggestCustomerMatches("LLC", SUGGEST_BOOK), [], "a name made only of legal forms suggests nothing");
assert.deepEqual(suggestCustomerMatches("SBI", []), [], "an empty registry suggests nothing (and never throws)");
assert.equal(suggestCustomerMatches("SBI CONSTRUCTION", SUGGEST_BOOK, 1).length, 1, "the limit caps the list");

// MUTATION TARGET — Law 82. The result is a list of OPTIONS. Nothing in it may mark one as chosen,
// applied, or best: make suggestCustomerMatches auto-select its top suggestion (stamp autoApply /
// selected / isBestMatch on it, or return {best}) and THESE assertions fail by name.
assert.ok(Array.isArray(ranked), "suggestions are a plain ranked LIST — never an object wrapping a chosen one");
const OFFERED_KEYS = ["id", "name", "sharedWords"];
for (const s of ranked) {
  assert.deepEqual(
    Object.keys(s).sort(),
    OFFERED_KEYS.slice().sort(),
    "a suggestion carries ONLY id/name/sharedWords — no autoApply, no selected, no isBestMatch: the system never guesses which customer a name means (Law 82)"
  );
}
// Even when exactly ONE customer matches — the most tempting case to auto-apply — it stays an option.
const soleMatch = suggestCustomerMatches("Riverside", SUGGEST_BOOK);
assert.equal(soleMatch.length, 1, "one customer shares a word with 'Riverside'");
assert.deepEqual(
  Object.keys(soleMatch[0]).sort(),
  OFFERED_KEYS.slice().sort(),
  "a SOLE suggestion is still just an option — a single candidate is not permission to choose it"
);
console.log("PASS: customer near-match suggestions — exact-word overlap ranks first with the shared words shown; legal forms never earn a rank; no match returns EMPTY; the result is always ranked options with no auto-apply/best-match flag, even when only one candidate exists");
