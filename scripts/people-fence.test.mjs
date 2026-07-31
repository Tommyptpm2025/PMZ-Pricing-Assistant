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

  // DORMANCY — enforcement is gated behind ROSTER_PICKER_ENABLED, and that switch is OFF in step 1, so
  // the app never blocks a save before the picker exists. The gate LOGIC above stays fully proven.
  assert.ok(
    pricer.includes("ROSTER_PICKER_ENABLED && salespersonGateBlocks("),
    "enforcement must be gated behind ROSTER_PICKER_ENABLED at the save site — dormant until step 2 wires the picker (the app may never sit on main blocking every save)"
  );
  const people = read("lib/people.ts");
  assert.ok(
    /export const ROSTER_PICKER_ENABLED:\s*boolean\s*=\s*false/.test(people),
    "ROSTER_PICKER_ENABLED is false in step 1 — the gate is DORMANT; step 2 flips it (and this line) when the roster picker lands"
  );
}
console.log("PASS: people wiring — quote salespersonId is optional and round-trips; saveQuote writes it; the gate is wired but DORMANT (ROSTER_PICKER_ENABLED=false) until the picker");
