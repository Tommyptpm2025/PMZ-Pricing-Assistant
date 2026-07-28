/**
 * FENCE for the blank-customer send gate (Law 50: blanks block). A quote with no customer must not be
 * sent. TWO guarantees:
 *   (1) BEHAVIORAL — the REAL customerIsBlank: empty/whitespace name with no id is blank; a company name
 *       is present; a registry customer selected by id is present even with an empty name box.
 *   (2) STRUCTURAL/CHOKEPOINT — handleConfirmSend blocks a blank customer through the send-block
 *       mechanism; the rule is defined exactly once and BOTH the validation display and the Send gate
 *       read it (no second copy).
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/customer-present-fence.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { customerIsBlank } from "../lib/customer-present.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

// ── 1 — BEHAVIORAL: the real rule ─────────────────────────────────────────────────────────────
assert.equal(customerIsBlank({ customerName: "", customerId: "" }), true, "empty name + no id → blank");
assert.equal(customerIsBlank({}), true, "missing fields → blank");
assert.equal(customerIsBlank({ customerName: "   ", customerId: "" }), true, "whitespace-only name is BLANK (trim before testing)");
assert.equal(customerIsBlank({ customerName: "World of Wheels" }), false, "a company name → present");
assert.equal(customerIsBlank({ customerName: "", customerId: "cust_123" }), false, "a customer selected by id is PRESENT even with an empty name box");
console.log("PASS: customer-present rule — empty/whitespace with no id is blank; a company name or an id-selected customer is present");

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

// M1 — the Send handler must refuse a blank customer via the send-block mechanism.
assert.ok(
  pricer.includes("customerMissing: true"),
  "handleConfirmSend has NO blank-customer guard — a quote can be SENT with an empty CUSTOMER (empty customer / customerName / " +
    "customerDetails.name and a blank CUSTOMER block on the PDF the customer receives). Restore " +
    "`if (customerIsBlank(estimate)) { setSendBlock({ failures: [], customerMissing: true }); return; }` in handleConfirmSend."
);

// CHOKEPOINT — one home for the rule; both the validation display and the Send gate read it.
const files = [...tsFiles(join(repoRoot, "app")), ...tsFiles(join(repoRoot, "lib"))];
const defs = files.filter((f) => readFileSync(f, "utf8").includes("export function customerIsBlank"));
assert.equal(defs.length, 1, "customerIsBlank must be defined exactly once");
assert.ok(defs[0].replace(/\\/g, "/").endsWith("lib/customer-present.ts"), "…and its home is lib/customer-present.ts");
assert.ok(
  !pricer.includes('customerName.trim() === ""'),
  "the inline 'customer is blank' check must be gone — both the Save-time validation display and the Send gate read customerIsBlank (one rule, one home)"
);
assert.ok(
  (pricer.match(/customerIsBlank\(estimate\)/g) || []).length >= 2,
  "both the validation display AND the Send gate must call customerIsBlank(estimate) — the two must never disagree about whether a quote has a customer"
);
console.log("PASS: blank-customer send gate wiring — Send blocks a blank customer via the send-block panel; one rule read by both the display and the gate");
