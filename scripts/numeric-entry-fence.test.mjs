/**
 * FENCE for the numeric input layer (Law 50, Jul 25 2026). parseNumericEntry is the ONE birthplace
 * for parsing a numeric text field: a BLANK and GARBAGE both return undefined (the LEM Gate blocks
 * them); a typed "0" returns 0 (the gate confirm-and-carries it). This is a BEHAVIORAL pin of the
 * pure function — no new toolchain — plus a cheap source check that the six LEM inputs use it.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/numeric-entry-fence.test.mjs
 * (.mjs so tsc's "**\/*.ts" include doesn't pull it in; Node strips the imported .ts types.)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseNumericEntry } from "../lib/numeric-entry.ts";

// ── Behavioral: the rule itself ──────────────────────────────────────────────────────────────
assert.equal(parseNumericEntry(""), undefined, 'empty string → undefined (blank — no answer)');
assert.equal(parseNumericEntry("   "), undefined, "whitespace-only → undefined");
assert.equal(parseNumericEntry("0"), 0, '"0" → 0 (a true answer — confirm-and-carry)');
assert.equal(parseNumericEntry("abc"), undefined, '"abc" → undefined (garbage is not a zero)');
assert.equal(parseNumericEntry("-5"), 0, '"-5" → 0 (negatives floor to 0)');
assert.equal(parseNumericEntry("3.5"), 3.5, '"3.5" → 3.5');
console.log('PASS: parseNumericEntry — blank/garbage → undefined; "0" → 0; negatives floor; reals pass');

// ── Source: the six LEM inputs no longer coerce a zero to blank, nor parse the raw event ──────
const pricer = readFileSync(fileURLToPath(new URL("../app/project-pricer/page.tsx", import.meta.url)), "utf8");
assert.ok(!pricer.includes('entry.hours || ""'), 'Labor/Equipment Hours bindings use ?? "" (a stored 0 renders 0)');
assert.ok(!pricer.includes('entry.quantity || ""'), 'Material/Misc Qty bindings use ?? ""');
assert.ok(!pricer.includes('x.e.hours || ""'), 'crew Hours bindings use ?? ""');
assert.ok(!pricer.includes("parseFloat(ev.target.value)"), "crew Hours handlers parse via parseNumericEntry, not raw parseFloat");
assert.ok(pricer.includes("parseNumericEntry("), "the six LEM handlers route through parseNumericEntry");
// The bid-quantity handler deliberately still parses raw (STOPPED per RULING 3 — its consumers
// assume a number and would NaN on undefined). Pin that EXACTLY ONE such site remains, so no LEM
// handler regresses back to it.
assert.equal((pricer.match(/parseFloat\(e\.target\.value\)/g) || []).length, 1,
  "only the bid-quantity handler retains raw parseFloat (STOPPED, RULING 3); no LEM handler does");
console.log('PASS: source — the six LEM inputs bind ?? "" and parse via parseNumericEntry; only the STOPPED bid quantity retains raw parseFloat');
