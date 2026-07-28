/**
 * FENCE for the Send Quote recipient write (Cause 1). The customer is the COMPANY; the recipient is a
 * PERSON — a CONTACT, never an identity. TWO guarantees:
 *   (1) BEHAVIORAL — the REAL recipientCustomerWrite: an existing record is never renamed (the patch
 *       has no `name`); a new record is named after the COMPANY, never the recipient; a company-less
 *       new customer is blocked (Law 50).
 *   (2) STRUCTURAL/CHOKEPOINT — the Send dialog never writes the recipient into the company identity
 *       (setSelectedCustomerName(sendName)); the decision lives in exactly one file; no "New Customer"
 *       placeholder identity remains.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/customer-recipient-fence.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { recipientCustomerWrite } from "../lib/customer-recipient.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");
const RECIP = { name: "Teddy Spins", email: "teddy@wow.com", phone: "555-0100" };

// ── 1 — BEHAVIORAL: the real decision ─────────────────────────────────────────────────────────
{
  // EXISTING customer -> update the CONTACT only; NEVER a name (M3 target).
  const w = recipientCustomerWrite({ contactName: "old contact", email: "", phone: "" }, "World of Wheels L.L.C.", RECIP);
  assert.equal(w.action, "update", "existing customer -> update");
  assert.ok(
    !Object.prototype.hasOwnProperty.call(w.patch, "name"),
    "the update patch must NEVER contain `name` — an existing customer record cannot be renamed from the Send dialog"
  );
  assert.equal(w.patch.contactName, "Teddy Spins", "the recipient becomes the CONTACT on the existing record");
}
{
  // NEW customer + company -> named after the COMPANY, never the person (M2 target).
  const w = recipientCustomerWrite(null, "World of Wheels", RECIP);
  assert.equal(w.action, "create", "new customer + company -> create");
  assert.equal(w.record.name, "World of Wheels", "a new record is named after the COMPANY (from the CUSTOMER field)");
  assert.notEqual(w.record.name, RECIP.name, "a new record is NEVER named after the recipient — a person is not a company identity");
  assert.equal(w.record.contactName, "Teddy Spins", "the recipient is the CONTACT on the new record");
}
{
  // NEW customer, NO company name -> block; never mint a person-named or placeholder record.
  const w = recipientCustomerWrite(null, "   ", RECIP);
  assert.equal(w.action, "block", "new customer with no company name -> BLOCK, not a person-named or 'New Customer' record");
}
console.log("PASS: recipient write — existing never renamed; new named after the COMPANY not the person; company-less new blocked");

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
const pricer = read("app/project-pricer/page.tsx");

// M1 — the recipient must NEVER be written into the company identity.
assert.ok(
  !pricer.includes("setSelectedCustomerName(sendName)"),
  "the Send dialog writes the recipient into selectedCustomerName — the COMPANY identity, which flows to the quote's " +
    "customer / customerName / customerDetails.name. The recipient is a CONTACT, never the company. (app/project-pricer/page.tsx)"
);
// No "New Customer" placeholder identity survives anywhere.
assert.ok(
  !pricer.includes('"New Customer"'),
  "a 'New Customer' placeholder is being minted as a company identity — route the write through recipientCustomerWrite, which " +
    "blocks a company-less new customer instead of guessing a name. (app/project-pricer/page.tsx)"
);
// CHOKEPOINT — the recipient-write decision lives in exactly one file.
const files = [...tsFiles(join(repoRoot, "app")), ...tsFiles(join(repoRoot, "lib"))];
const defs = files.filter((f) => readFileSync(f, "utf8").includes("export function recipientCustomerWrite"));
assert.equal(defs.length, 1, "recipientCustomerWrite must be defined exactly once");
assert.ok(defs[0].replace(/\\/g, "/").endsWith("lib/customer-recipient.ts"), "…and its home is lib/customer-recipient.ts");
assert.ok(pricer.includes("recipientCustomerWrite("), "saveRecipientToCustomer must route the write through recipientCustomerWrite");
console.log("PASS: recipient write wiring — no recipient→identity leak, no 'New Customer' placeholder, decision lives only in lib/customer-recipient.ts");
