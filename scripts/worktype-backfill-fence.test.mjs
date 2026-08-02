/**
 * FENCE for the WORK-TYPE ATTRIBUTION BACKFILL (lib/work-types.ts) — claim the history, work-type
 * edition. Mirrors the salesperson attribution fence. PURE math (no localStorage).
 *   • an ORPHAN id + exact name match is re-pointed to the LIVE id and keeps the old id in
 *     workTypeIdLegacy; a case/whitespace name variant still matches;
 *   • an unknown name is skipped; two live work types with the SAME name = ambiguous, skipped;
 *   • a record already on a LIVE id is untouched; a record with no orphan id / no name is left alone;
 *   • every non-work-type field is byte-identical (money never touched); the runs-once guard holds.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/worktype-backfill-fence.test.mjs
 */
import assert from "node:assert/strict";
import { backfillWorkTypeIds, planWorkTypeBackfill } from "../lib/work-types.ts";

// Current work-types store: wt_res / wt_seal unique; wt_dupA & wt_dupB SHARE a name (case-insensitively)
// → that name is ambiguous and must never be guessed.
const live = [
  { id: "wt_res", name: "Residential Paving" },
  { id: "wt_seal", name: "Sealcoating" },
  { id: "wt_dupA", name: "Site Work" },
  { id: "wt_dupB", name: "site work" },
];

// Quote-shaped records carrying MONEY fields, so we can prove nothing but work-type attribution changes.
const quotes = [
  { id: "q1", workTypeId: "old_res_123", workType: "Residential Paving", totalRevenue: 10000, grossProfitDollars: 2500, status: "Approved", createdAt: "2026-03-01" }, // orphan + exact → wt_res
  { id: "q2", workTypeId: "old_seal_9", workType: "  sealcoating  ", totalRevenue: 20000, status: "Lost" },  // case + whitespace variant → wt_seal
  { id: "q3", workTypeId: "old_x", workType: "Excavation", totalRevenue: 30000 },                            // unknown name → skipped
  { id: "q4", workTypeId: "old_sw", workType: "Site Work", totalRevenue: 40000 },                            // ambiguous (dupA/dupB) → skipped
  { id: "q5", workTypeId: "wt_res", workType: "Residential Paving", totalRevenue: 50000 },                   // already a LIVE id → untouched
  { id: "q6", workTypeId: "old_noname", totalRevenue: 60000 },                                               // orphan id, no name → left alone
  { id: "q7", workTypeId: "", workType: "Residential Paving", totalRevenue: 70000 },                         // empty id (Unassigned) → not a candidate
];
const before = JSON.parse(JSON.stringify(quotes)); // deep snapshot for the byte-identical proof
const { records: out, counts } = backfillWorkTypeIds(quotes, live);

// orphan + exact match → re-pointed to the live id; OLD id preserved; the name string stays
assert.equal(out[0].workTypeId, "wt_res", "orphan id + exact name match is re-pointed to the current work type's id");
assert.equal(out[0].workTypeIdLegacy, "old_res_123", "the old orphan id is preserved as workTypeIdLegacy (provenance)");
assert.equal(out[0].workType, "Residential Paving", "the work-type name string is kept in place");
assert.equal(out[1].workTypeId, "wt_seal", "a case + whitespace name variant still matches the live work type");
assert.equal(out[1].workTypeIdLegacy, "old_seal_9", "the variant match also preserves its old id");

// unknown + ambiguous are skipped (never guessed), old id untouched, no legacy stamp
assert.equal(out[2].workTypeId, "old_x", "an unknown name leaves the orphan id as-is");
assert.equal(out[2].workTypeIdLegacy, undefined, "a skipped record gets no legacy stamp");
assert.equal(out[3].workTypeId, "old_sw", "two live work types share the name → ambiguous → skipped, never guessed");

// MUTATION TARGET: a record already on a LIVE work type is NEVER rewritten.
assert.equal(out[4].workTypeId, "wt_res", "a live-id record keeps its id");
assert.equal(out[4].workTypeIdLegacy, undefined, "a record already on a LIVE work type is NEVER rewritten — no legacy stamp, untouched");

// orphan id with no name, and an empty (Unassigned) id — both left exactly alone
assert.equal(out[5].workTypeId, "old_noname", "an orphan id with no name string cannot be matched — left alone");
assert.equal(out[6].workTypeId, "", "an empty (Unassigned) id is not a candidate — left alone");

// counts are inspectable: 2 matched, 1 ambiguous, 1 no-match (q6/q7 uncounted — not candidates)
assert.deepEqual(counts, { matched: 2, ambiguousSkipped: 1, noMatchSkipped: 1 }, "counts: 2 matched, 1 ambiguous-skipped, 1 no-match-skipped");

// BYTE-IDENTICAL: strip the work-type attribution, everything else (money, status, date, id) is unchanged
const stripWt = ({ workTypeId, workTypeIdLegacy, ...rest }) => rest;
for (let i = 0; i < quotes.length; i++) {
  assert.deepEqual(stripWt(out[i]), stripWt(before[i]), `record ${i}: every non-work-type field is byte-identical (money never touched)`);
}
// unchanged records are returned by the SAME reference; only matched ones are fresh copies
assert.ok(out[2] === quotes[2] && out[3] === quotes[3] && out[4] === quotes[4] && out[5] === quotes[5] && out[6] === quotes[6], "skipped/untouched records are the same object reference — no needless rewrite");
assert.ok(out[0] !== quotes[0] && out[1] !== quotes[1], "a re-pointed record is a NEW object (input never mutated)");
assert.equal(quotes[0].workTypeId, "old_res_123", "the input array was not mutated in place");
assert.equal(quotes[0].workTypeIdLegacy, undefined, "the input record gained no field in place");
console.log("PASS: worktype backfill — orphan+exact match re-points & keeps legacy id; case/whitespace matches; unknown & ambiguous skipped; live-id untouched; money byte-identical");

// planWorkTypeBackfill: combined counts + the runs-once guard
const plan = planWorkTypeBackfill(null, quotes, live);
assert.ok(plan !== null, "flag absent (null) → the backfill plan runs");
assert.deepEqual(plan.counts, { matched: 2, ambiguousSkipped: 1, noMatchSkipped: 1 }, "plan counts match the pure backfill");
assert.equal(plan.quotes[0].workTypeId, "wt_res", "the plan re-points the orphan record");
assert.equal(plan.quotes[0].workTypeIdLegacy, "old_res_123", "the plan preserves the old id");
assert.equal(planWorkTypeBackfill('{"matched":2}', quotes, live), null, "a present flag → the backfill NEVER runs again");
assert.equal(planWorkTypeBackfill("", quotes, live), null, "even an empty-string flag value blocks a re-run — presence is the guard");
console.log("PASS: worktype backfill plan — combined counts; runs-once guard honored (any flag value blocks a re-run)");
