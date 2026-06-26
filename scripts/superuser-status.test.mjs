/**
 * Behavior check for the super-user status override (Jump-to + Back). Verifies the lock
 * rule (real isStatusLocked) and the reverse-flow predecessor chain (real STATUS_FLOW),
 * and that a jump + a back-step both produce a persistable record (status, lock, history).
 * Run: node scripts/superuser-status.test.mjs
 *
 * Imports pmz-types.ts directly (no runtime deps). The status transform below mirrors
 * lib/quote-lifecycle.ts applyStatusChange + the superUserSetStatus lock override exactly.
 */
import assert from "node:assert/strict";
import { STATUS_FLOW, isStatusLocked } from "../lib/pmz-types.ts";

const ALL = Object.keys(STATUS_FLOW);

// Mirror of the Back button's predecessor logic (reverse of STATUS_FLOW). Skips Declined's
// recovery back-routes so Back follows only the linear spine (matches the Quotes-page statusBack).
function statusBack(status) {
  for (const s of ALL) {
    if (s === "Declined") continue;
    if ((STATUS_FLOW[s] || []).includes(status)) return s;
  }
  return null;
}

// Mirror of superUserSetStatus: append statusHistory, then lock = isStatusLocked(chosen).
function jump(quote, to, nowIso = "2026-02-02T00:00:00.000Z") {
  const existing = Array.isArray(quote.statusHistory) && quote.statusHistory.length > 0
    ? quote.statusHistory
    : [{ status: quote.status, at: quote.createdAt || nowIso }];
  return {
    ...quote,
    status: to,
    locked: isStatusLocked(to),
    statusHistory: [...existing, { status: to, at: nowIso }],
    updatedAt: nowIso,
  };
}

const base = {
  id: "q1", status: "Draft", locked: false,
  statusHistory: [{ status: "Draft", at: "2026-01-01T00:00:00.000Z" }],
  createdAt: "2026-01-01T00:00:00.000Z",
};

// --- JUMP forward to a locked status ---
const jumped = jump(base, "Invoiced");
assert.equal(jumped.status, "Invoiced", "jump sets the chosen status");
assert.equal(jumped.locked, true, "Invoiced is locked");
assert.equal(jumped.statusHistory.length, 2, "history appended");
assert.equal(jumped.statusHistory.at(-1).status, "Invoiced");

// --- JUMP backward clears the lock to match the chosen status ---
const toDraft = jump(jumped, "Draft");
assert.equal(toDraft.status, "Draft");
assert.equal(toDraft.locked, false, "lock follows the chosen status, even jumping backward");

// --- Back predecessor chain matches the corrected lifecycle exactly ---
// Draft → Sent for Acceptance → Accepted → Scheduled → Work Order Active → Ready to Invoice →
// Invoiced → Paid, with Declined branching off Sent for Acceptance.
assert.equal(statusBack("Paid"), "Invoiced");
assert.equal(statusBack("Invoiced"), "Ready to Invoice");
assert.equal(statusBack("Ready to Invoice"), "In Progress");
assert.equal(statusBack("In Progress"), "Scheduled");
assert.equal(statusBack("Scheduled"), "Approved");
assert.equal(statusBack("Approved"), "Ready for Approval");
assert.equal(statusBack("Ready for Approval"), "Draft");
assert.equal(statusBack("Declined"), "Ready for Approval");
assert.equal(statusBack("Draft"), null, "Draft has no predecessor (Back hidden)");

// --- A back-step persists through the same path ---
const approved = jump(base, "Approved");
assert.equal(approved.locked, true, "Approved is locked");
const stepped = jump(approved, statusBack("Approved")); // -> Ready for Approval
assert.equal(stepped.status, "Ready for Approval");
assert.equal(stepped.locked, false, "Ready for Approval is not locked");
assert.equal(stepped.statusHistory.at(-1).status, "Ready for Approval", "back-step appends history");

console.log("PASS: super-user jump + back-step — status set, lock rule, history append, predecessor chain");
