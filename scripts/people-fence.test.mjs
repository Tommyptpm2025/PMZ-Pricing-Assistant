/**
 * FENCE for the Company Roster / Person model (COMPANY-ROSTER-AND-ROLES.md; Law 9 One Birthplace).
 *   (1) MODEL       — ids stable + unique; deactivate goes INACTIVE (never removes); active-by-role
 *                     excludes inactive; the Law-50 attribution gate blocks a blank salespersonId
 *                     once an active salesperson exists.
 *   (2) MIGRATION   — imports both legacy registries (+ the legacy single estimator), every migrated
 *                     person gets the salesperson role, same-name duplicates merge to ONE id, active
 *                     flags preserved; and it NEVER runs once 'pmz_people_v1' already exists.
 *   (3) WIRING      — the quote carries an OPTIONAL salespersonId (survives a save/load round-trip;
 *                     legacy quotes without it still parse); saveQuote writes it and is guarded by
 *                     salespersonGateBlocks.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/people-fence.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  addPerson,
  updatePerson,
  deactivatePerson,
  listActiveByRole,
  migratePeople,
  planMigration,
  salespersonGateBlocks,
  backfillAttribution,
  planAttributionBackfill,
} from "../lib/people.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

// ── 1 — MODEL: ids, deactivate, roles, gate ──────────────────────────────────────────────────────
{
  // ids stable + unique
  const a = addPerson([], { name: "Ann" });
  const b = addPerson(a.people, { name: "Bob" });
  assert.ok(a.person.id && b.person.id, "every added person gets a non-empty id");
  assert.notEqual(a.person.id, b.person.id, "ids are unique across people");
  const renamed = updatePerson(b.people, a.person.id, { name: "Annie" });
  const annie = renamed.find((p) => p.name === "Annie");
  assert.equal(annie.id, a.person.id, "update preserves the id — the id is stable across edits");

  // deactivate goes INACTIVE, never removes (MUTATION TARGET)
  const one = addPerson([], { name: "Solo" }).people;
  const after = deactivatePerson(one, one[0].id);
  assert.equal(after.length, 1, "deactivate must NOT remove the person — departed people go inactive, never deleted");
  assert.equal(after[0].active, false, "deactivate sets active=false");
  assert.equal(after[0].id, one[0].id, "the id survives deactivation (stamped on history)");

  // list-active-by-role excludes inactive
  let ppl = addPerson([], { name: "Sal", roles: ["salesperson"] }).people;
  ppl = addPerson(ppl, { name: "Fred", roles: ["foreman"] }).people;
  ppl = deactivatePerson(ppl, ppl[0].id); // deactivate Sal
  assert.equal(listActiveByRole(ppl, "salesperson").length, 0, "an INACTIVE salesperson is excluded from active-by-role");
  assert.equal(listActiveByRole(ppl, "foreman").length, 1, "an active foreman is listed by role");

  // Law-50 attribution gate
  assert.equal(salespersonGateBlocks([], undefined), false, "no people → save allowed unattributed (as today)");
  const withSales = addPerson([], { name: "Ann", roles: ["salesperson"] }).people;
  assert.equal(salespersonGateBlocks(withSales, undefined), true, "active salesperson exists + blank id → BLOCK");
  assert.equal(salespersonGateBlocks(withSales, "   "), true, "whitespace-only id is still blank → BLOCK");
  assert.equal(salespersonGateBlocks(withSales, "p_1"), false, "a real id present → allowed");
  const inactiveOnly = deactivatePerson(withSales, withSales[0].id);
  assert.equal(salespersonGateBlocks(inactiveOnly, undefined), false, "only an INACTIVE salesperson → not required (as today)");
}
console.log("PASS: people model — ids stable + unique, deactivate goes inactive (never deletes), active-by-role excludes inactive, Law-50 gate");

// ── 2 — MIGRATION: consolidate both registries, merge same-name dupes, run once ───────────────────
{
  const salespeople = [
    { id: "s1", name: "Ann", active: true },
    { id: "s2", name: "Bob", active: false },
  ];
  const estimators = [
    { id: "e1", name: "ann", email: "ann@co.com", active: true }, // same person as Ann (case-insensitive)
    { id: "e2", name: "Cara", active: true },
  ];
  const legacyEstimator = { name: "Dave", title: "Sr Estimator" };

  const migrated = migratePeople(salespeople, estimators, legacyEstimator);
  assert.equal(migrated.length, 4, "Ann / Bob / Cara / Dave — the same-name Ann is merged, not doubled");

  const anns = migrated.filter((p) => p.name.toLowerCase() === "ann");
  assert.equal(anns.length, 1, "same-name duplicate merged to ONE person, ONE id");
  assert.equal(anns[0].id, "s1", "the first id wins on merge");
  assert.equal(anns[0].email, "ann@co.com", "missing email filled from the duplicate");

  assert.ok(migrated.every((p) => p.roles.includes("salesperson")), "every migrated person gets the salesperson role (estimator folds in)");
  assert.equal(migrated.find((p) => p.name === "Bob").active, false, "active flag preserved — Bob stays inactive");
  assert.equal(migrated.find((p) => p.name === "Dave").active, true, "the legacy single estimator is imported active");

  // never run twice
  const first = planMigration(null, { salespeople, estimators, legacyEstimator });
  assert.ok(Array.isArray(first) && first.length === 4, "first run (pmz_people_v1 absent) → migration produces the roster");
  assert.equal(planMigration("[]", { salespeople, estimators, legacyEstimator }), null, "pmz_people_v1 present (even empty []) → migration does NOT run again");
  assert.equal(planMigration('[{"id":"p1","name":"X"}]', { salespeople: [], estimators: [], legacyEstimator: null }), null, "any existing value blocks re-migration — never runs twice");
}
console.log("PASS: people migration — consolidates both registries + legacy estimator, all salesperson role, same-name merged to one id, runs once");

// ── 3 — WIRING: the quote carries salespersonId; save writes it; save is gated ────────────────────
{
  // round-trip + legacy tolerance (pure)
  const q = { id: "q1", salesperson: "Ann", salespersonId: "p_123" };
  const round = JSON.parse(JSON.stringify(q));
  assert.equal(round.salespersonId, "p_123", "salespersonId survives a save/load JSON round-trip");
  const legacyQuote = JSON.parse('{"id":"q0","salesperson":"Ann"}');
  assert.equal(legacyQuote.salespersonId, undefined, "a legacy quote without salespersonId still parses (field is optional)");

  // source-text wiring
  const types = read("lib/pmz-types.ts");
  assert.ok(/salespersonId\?:\s*string/.test(types), "SavedQuote carries an OPTIONAL salespersonId (Person-id attribution) in lib/pmz-types.ts");

  const pricer = read("app/project-pricer/page.tsx");
  assert.ok(pricer.includes("salespersonId: estimate.salespersonId"), "saveQuote writes salespersonId onto the quote record");
  assert.ok(pricer.includes("salespersonGateBlocks("), "the save path reads salespersonGateBlocks — blank blocks once an active salesperson exists (Law 50 spirit)");

  // ENFORCEMENT LIVE — the save-site gate is wired behind ROSTER_PICKER_ENABLED, now flipped ON (step 2).
  assert.ok(
    pricer.includes("ROSTER_PICKER_ENABLED && salespersonGateBlocks("),
    "enforcement must be gated behind ROSTER_PICKER_ENABLED at the save site — one switch controls it"
  );
  const people = read("lib/people.ts");
  assert.ok(
    /export const ROSTER_PICKER_ENABLED:\s*boolean\s*=\s*true/.test(people),
    "ROSTER_PICKER_ENABLED is true in step 2 — the roster picker is wired, so the attribution gate is LIVE"
  );
  // The picker stores the Person id (not the name string): the pricer resolves the selection to an id.
  assert.ok(
    pricer.includes("salespersonId: id"),
    "the roster picker must store salespersonId = the Person id (never the name string)"
  );

  // First-click validation: the Salesperson/Estimator requirement joins the same highlight group as
  // Job Name / Work Type (validationErrors keyed off the same gate), not only the Proceed-Anyway path.
  assert.ok(
    pricer.includes("errs.salesperson") && pricer.includes("salespersonGateBlocks(people, estimate.salespersonId)"),
    "the salesperson requirement must be part of validationErrors (first-click group), keyed off salespersonGateBlocks"
  );
  assert.ok(
    pricer.includes("saveAttempted && validationErrors.salesperson"),
    "the salesperson field must highlight on the FIRST Save click, alongside jobName/workType"
  );
}
console.log("PASS: people wiring — quote carries salespersonId (round-trips; legacy name still loads); saveQuote writes it; the gate is LIVE (ROSTER_PICKER_ENABLED=true), picker stores the id");

// ── 4 — LEGACY ATTRIBUTION BACKFILL: claim the history without touching money ──────────────────────
{
  // Roster: p1 unique; p2 unique; p3 & p4 SHARE a name (case-insensitively) → that name is ambiguous.
  const roster = [
    { id: "p1", name: "Ann Roster", roles: ["salesperson"], active: true, createdAt: "2026-01-01T00:00:00Z" },
    { id: "p2", name: "Bob Byrd", roles: ["salesperson"], active: true, createdAt: "2026-01-01T00:00:00Z" },
    { id: "p3", name: "Dup Name", roles: ["salesperson"], active: true, createdAt: "2026-01-01T00:00:00Z" },
    { id: "p4", name: "dup name", roles: ["salesperson"], active: false, createdAt: "2026-01-01T00:00:00Z" },
  ];

  // Quote-shaped records carrying MONEY fields, so we can prove nothing but attribution changes.
  const quotes = [
    { id: "q1", salesperson: "Ann Roster", totalRevenue: 10000, grossProfitDollars: 2500, status: "Approved", createdAt: "2026-03-01" }, // exact match → p1
    { id: "q2", salesperson: "  ann roster  ", totalRevenue: 20000, status: "Lost" },       // case + whitespace variant → p1
    { id: "q3", salesperson: "Nobody Here", totalRevenue: 30000 },                          // unknown → skipped
    { id: "q4", salesperson: "Dup Name", totalRevenue: 40000 },                             // ambiguous (p3/p4) → skipped
    { id: "q5", salesperson: "Ann Roster", salespersonId: "pX", totalRevenue: 50000 },       // ALREADY attributed → untouched
    { id: "q6", totalRevenue: 60000 },                                                      // no legacy name → not a candidate
  ];
  const before = JSON.parse(JSON.stringify(quotes)); // deep snapshot for byte-identical proof
  const { records: out, counts } = backfillAttribution(quotes, roster);

  // exact + case/whitespace matches get the id; the legacy NAME STRING stays for provenance
  assert.equal(out[0].salespersonId, "p1", "exact-name match gets the roster id");
  assert.equal(out[0].salesperson, "Ann Roster", "the legacy name string is kept in place (provenance)");
  assert.equal(out[1].salespersonId, "p1", "a case + whitespace variant still matches the same person");

  // unknown + ambiguous are skipped (never guessed)
  assert.equal(out[2].salespersonId, undefined, "an unknown name is skipped — no id written");
  assert.equal(out[3].salespersonId, undefined, "two people share the name → ambiguous → skipped, never guessed");

  // MUTATION TARGET: an already-attributed record is NEVER overwritten (its 'pX' survives, not 'p1').
  assert.equal(out[4].salespersonId, "pX", "an existing salespersonId is NEVER overwritten (kept 'pX', not reassigned to 'p1')");
  assert.equal(out[5].salespersonId, undefined, "a record with no legacy name is not a candidate — nothing written");

  // counts are inspectable: 2 matched, 1 ambiguous, 1 no-match (q6 has no name → counted in none)
  assert.deepEqual(counts, { matched: 2, ambiguousSkipped: 1, noMatchSkipped: 1 }, "counts: 2 matched, 1 ambiguous-skipped, 1 no-match-skipped");

  // BYTE-IDENTICAL: strip attribution, everything else (money, status, date, id) is unchanged
  const stripId = ({ salespersonId, ...rest }) => rest;
  for (let i = 0; i < quotes.length; i++) {
    assert.deepEqual(stripId(out[i]), stripId(before[i]), `record ${i}: every non-attribution field is byte-identical (money never touched)`);
  }
  // unchanged records are returned by the SAME reference; only matched ones are fresh copies
  assert.ok(out[2] === quotes[2] && out[3] === quotes[3] && out[4] === quotes[4] && out[5] === quotes[5], "skipped/untouched records are the same object reference — no needless rewrite");
  assert.ok(out[0] !== quotes[0] && out[1] !== quotes[1], "a matched record is a NEW object (input never mutated)");
  assert.equal(quotes[0].salespersonId, undefined, "the input array was not mutated in place");

  // planAttributionBackfill: combines both stores + the runs-once guard
  const jobs = [
    { id: "j1", salesperson: "BOB BYRD", contractValue: 99999 }, // case variant → p2
    { id: "j2", salesperson: "Ghost", contractValue: 1 },        // no match
  ];
  const plan = planAttributionBackfill(null, quotes, jobs, roster);
  assert.ok(plan !== null, "flag absent (null) → the backfill plan runs");
  assert.deepEqual(plan.byStore.quotes, { matched: 2, ambiguousSkipped: 1, noMatchSkipped: 1 }, "per-store quote counts");
  assert.deepEqual(plan.byStore.jobs, { matched: 1, ambiguousSkipped: 0, noMatchSkipped: 1 }, "per-store job counts (Bob matched by case-variant, Ghost skipped)");
  assert.deepEqual(plan.counts, { matched: 3, ambiguousSkipped: 1, noMatchSkipped: 2 }, "combined counts across both stores");
  assert.equal(plan.jobs[0].salespersonId, "p2", "a job record is attributed too");
  assert.equal(plan.quotes[4].salespersonId, "pX", "an already-attributed record stays untouched inside the plan as well");

  // runs-once guard: ANY existing flag value blocks a re-run (never twice)
  assert.equal(planAttributionBackfill('{"matched":3}', quotes, jobs, roster), null, "a present flag → the backfill NEVER runs again");
  assert.equal(planAttributionBackfill("", quotes, jobs, roster), null, "even an empty-string flag value blocks a re-run — presence is the guard");
}
console.log("PASS: people attribution backfill — exact/case/whitespace match gets the id; unknown & ambiguous skipped; existing id never overwritten; money byte-identical; runs once");
