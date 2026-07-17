/**
 * FENCE-REGRESSION SUITE for the Profit Pipeline (Build F, Rev 4).
 * Proves — before and after the board refactor — that:
 *   1. The BOTH GATES are byte-identical to the pre-build sets (facts gate + money gate).
 *   2. `Completed` is explicitly in the Realized / phase-4 (money) set.
 *   3. The Money Map per-job math is byte-identical to the former Overview inline formula.
 *   4. The pipeline rollup produces correct per-phase subtotals.
 *   5. The RECONCILIATION INVARIANT holds: realized value === salesFromInvoiced().revenue
 *      (the same number the Boss View shows — the accountant tie-out).
 *   6. The IRON GUARD holds: the rollup exposes per-phase subtotals ONLY — no grand total that
 *      sums PLANNING and CONFIRMED dollars.
 * Run: node --import ./scripts/ts-ext-register.mjs scripts/pipeline-fence.test.mjs
 *   (the --import hook lets plain node resolve pipeline.ts's extensionless value import of
 *    qualifying.ts — one-birthplace derivation; the app resolves it via Next/tsc bundler mode.)
 *
 * (.mjs so tsc's "**\/*.ts" include doesn't pull it in; Node strips the imported .ts types.)
 */
import assert from "node:assert/strict";
import { REALIZED_STATUSES, salesFromInvoiced } from "../lib/qualifying.ts";
import {
  CONFIRMED_STATUSES,
  DEAD_STATUSES,
  PIPELINE_PHASES,
  tierOf,
  rollupPipeline,
  realizedRoll,
  confirmedJobs,
  moneyMapForJob,
} from "../lib/pipeline.ts";

const sortedMembers = (set) => [...set].sort();

// ── 1 & 2 — BOTH GATES byte-identical; Completed in the money set ────────────────────────────
// The pre-build facts gate was a local const on app/page.tsx (line 72). Frozen reference here:
const OLD_MAP_CONFIRMED = new Set(["Ready to Invoice", "Invoiced", "Paid", "Completed"]);
const OLD_REALIZED = new Set(["Invoiced", "Paid", "Completed"]);

assert.deepEqual(sortedMembers(CONFIRMED_STATUSES), sortedMembers(OLD_MAP_CONFIRMED),
  "FACTS gate byte-identical to the former app/page.tsx MAP_CONFIRMED_STATUSES");
assert.deepEqual(sortedMembers(REALIZED_STATUSES), sortedMembers(OLD_REALIZED),
  "MONEY gate byte-identical to the locked REALIZED_STATUSES");
assert.ok(REALIZED_STATUSES.has("Completed"), "Completed IS in the Realized / money set (ruling)");

// Facts gate = money gate PLUS exactly "Ready to Invoice" — the two-gate law made literal.
for (const s of REALIZED_STATUSES) assert.ok(CONFIRMED_STATUSES.has(s), `facts gate contains ${s}`);
assert.ok(CONFIRMED_STATUSES.has("Ready to Invoice"), "facts gate adds Ready to Invoice");
assert.equal(CONFIRMED_STATUSES.size, REALIZED_STATUSES.size + 1, "facts gate = money gate + one status");

// Realized phase def lists all three money statuses explicitly (counted-means-visible in the spec).
const realizedDef = PIPELINE_PHASES.find((p) => p.key === "realized");
assert.deepEqual([...realizedDef.statuses].sort(), ["Completed", "Invoiced", "Paid"],
  "Realized phase explicitly lists Invoiced + Paid + Completed");

// Tier law: CONFIRMED at Ready-to-Invoice+, PLANNING below it.
assert.equal(tierOf("Ready to Invoice"), "CONFIRMED");
assert.equal(tierOf("Invoiced"), "CONFIRMED");
assert.equal(tierOf("Completed"), "CONFIRMED");
assert.equal(tierOf("In Progress"), "PLANNING");
assert.equal(tierOf("Approved"), "PLANNING");
assert.equal(tierOf("Draft"), "PLANNING");

// ── Seed: one quote in every phase + a dead lane ─────────────────────────────────────────────
const seed = [
  { id: "d", status: "Draft", totalRevenue: 1000, directCogsDollars: 400, indirectCogsDollars: 100 },
  { id: "s", status: "Ready for Approval", totalRevenue: 2000, directCogsDollars: 800, indirectCogsDollars: 200 },
  { id: "a", status: "Approved", totalRevenue: 3000, directCogsDollars: 1200, indirectCogsDollars: 300 },
  { id: "sc", status: "Scheduled", totalRevenue: 4000, directCogsDollars: 1600, indirectCogsDollars: 400 },
  { id: "ip", status: "In Progress", totalRevenue: 5000, directCogsDollars: 2000, indirectCogsDollars: 500 },
  { id: "rti", status: "Ready to Invoice", totalRevenue: 6000, directCogsDollars: 2400, indirectCogsDollars: 600 },
  { id: "inv", status: "Invoiced", totalRevenue: 7000, directCogsDollars: 2800, indirectCogsDollars: 700 },
  { id: "pd", status: "Paid", totalRevenue: 8000, directCogsDollars: 3200, indirectCogsDollars: 800 },
  { id: "cp", status: "Completed", totalRevenue: 9000, directCogsDollars: 3600, indirectCogsDollars: 900 },
  { id: "dec", status: "Declined", totalRevenue: 1234, directCogsDollars: 0, indirectCogsDollars: 0 },
  { id: "lost", status: "Lost", totalRevenue: 5678, directCogsDollars: 0, indirectCogsDollars: 0 },
];

// ── 4 — Rollup per-phase subtotals ───────────────────────────────────────────────────────────
const roll = rollupPipeline(seed);
const byKey = Object.fromEntries(roll.phases.map((p) => [p.key, p]));

assert.deepEqual(
  { count: byKey.bidding.count, value: byKey.bidding.value, direct: byKey.bidding.directCogs, indirect: byKey.bidding.indirectCogs, gross: byKey.bidding.gross },
  { count: 2, value: 3000, direct: 1200, indirect: 300, gross: 1500 }, "Bidding phase rollup");
assert.deepEqual(
  { count: byKey.production.count, value: byKey.production.value, direct: byKey.production.directCogs, indirect: byKey.production.indirectCogs, gross: byKey.production.gross },
  { count: 3, value: 12000, direct: 4800, indirect: 1200, gross: 6000 }, "Won·In-Production phase rollup");
assert.deepEqual(
  { count: byKey.ready.count, value: byKey.ready.value, direct: byKey.ready.directCogs, indirect: byKey.ready.indirectCogs, gross: byKey.ready.gross },
  { count: 1, value: 6000, direct: 2400, indirect: 600, gross: 3000 }, "Ready-to-Invoice phase rollup");
assert.deepEqual(
  { count: byKey.realized.count, value: byKey.realized.value, direct: byKey.realized.directCogs, indirect: byKey.realized.indirectCogs, gross: byKey.realized.gross },
  { count: 3, value: 24000, direct: 9600, indirect: 2400, gross: 12000 }, "Realized phase rollup");
assert.equal(roll.dead.count, 2, "dead lane counts Declined + Lost");

// Vocabulary law: only phases 3–4 may say "Revenue"; phases 1–2 never do.
assert.ok(!/revenue/i.test(byKey.bidding.moneyLabel), "Bidding label never says revenue");
assert.ok(!/revenue/i.test(byKey.production.moneyLabel), "Production label never says revenue");
assert.match(byKey.ready.moneyLabel, /Revenue/, "Ready-to-Invoice label uses Revenue (RtI+)");
assert.match(byKey.realized.moneyLabel, /Revenue/, "Realized label uses Revenue");

// ── 5 — RECONCILIATION INVARIANT (verified assertion) ────────────────────────────────────────
const invoiced = salesFromInvoiced(seed);
assert.equal(realizedRoll(seed).value, invoiced.revenue,
  "RECONCILE: pipeline realized value === salesFromInvoiced().revenue (the Boss View number)");
assert.equal(realizedRoll(seed).value, 24000, "realized value ties to the seed (7000+8000+9000)");
assert.equal(byKey.realized.directCogs + byKey.realized.indirectCogs, invoiced.cogs,
  "RECONCILE: realized direct+indirect === salesFromInvoiced().cogs");

// ── 6 — IRON GUARD: per-phase subtotals only; NO grand total ─────────────────────────────────
assert.deepEqual(Object.keys(roll).sort(), ["dead", "phases"],
  "rollup exposes only { phases, dead } — no grand-total field");
assert.equal(roll.total, undefined, "no `total` field");
assert.equal(roll.grandTotal, undefined, "no `grandTotal` field");
assert.equal(roll.value, undefined, "no top-level `value` field");
// Prove PLANNING and CONFIRMED are never co-mingled: the two tiers hold disjoint status sets.
const planningStatuses = new Set(roll.phases.filter((p) => p.tier === "PLANNING").flatMap((p) => p.statuses));
const confirmedStatuses = new Set(roll.phases.filter((p) => p.tier === "CONFIRMED").flatMap((p) => p.statuses));
for (const s of planningStatuses) assert.ok(!confirmedStatuses.has(s), `${s} is PLANNING-only, never CONFIRMED`);

// ── 3 — Money Map math byte-identical to the FORMER Overview inline formula ───────────────────
// Frozen reference: the exact pre-build moneyMapSnapshot arithmetic (app/page.tsx, lines ~211-238).
function oldMoneyMap(latest, chart) {
  const rev = Number(latest?.totalRevenue) || 0;
  const directCogs = Number(latest?.directCogsDollars) || 0;
  const indirectCogs = Number(latest?.indirectCogsDollars) || 0;
  const totalOverhead = chart && Array.isArray(chart.items)
    ? chart.items.reduce((s, it) => s + (Number(it.amount) || 0), 0) : 0;
  const overheadRate = chart && chart.monthlyRevenue > 0 ? totalOverhead / chart.monthlyRevenue : 0;
  const overhead = Math.round(rev * overheadRate);
  const grossProfit = rev - directCogs - indirectCogs;
  const netProfit = grossProfit - overhead;
  const pct = (n) => (rev > 0 ? Math.round((n / rev) * 1000) / 10 : 0);
  return {
    revenue: rev,
    directCogs, directPercent: pct(directCogs),
    indirectCogs, indirectPercent: pct(indirectCogs),
    grossProfit, grossPercent: pct(grossProfit),
    overhead, overheadPercent: pct(overhead),
    netProfit, netPercent: pct(netProfit),
  };
}

const chartA = { items: [{ amount: 5000 }, { amount: 5000 }], monthlyRevenue: 100000 }; // rate 0.10
const chartB = { items: [{ amount: 12345.67 }], monthlyRevenue: 250000 };               // odd rate
const charts = [chartA, chartB, null, { items: [], monthlyRevenue: 0 }];

// Every confirmed (rev>0) seed job × every chart shape must match the frozen formula exactly.
for (const job of confirmedJobs(seed)) {
  for (const chart of charts) {
    assert.deepEqual(moneyMapForJob(job, chart), oldMoneyMap(job, chart),
      `Money Map byte-identical for job ${job.id} (rev ${job.totalRevenue})`);
  }
}

// rev=0 guard: no divide-by-zero / NaN; caller gates `confirmed` on rev>0 so this snapshot is
// never displayed, but the math must stay clean.
const zero = moneyMapForJob({ totalRevenue: 0, directCogsDollars: 500, indirectCogsDollars: 250 }, chartA);
assert.equal(zero.revenue, 0);
for (const k of ["directPercent", "indirectPercent", "grossPercent", "overheadPercent", "netPercent"]) {
  assert.equal(zero[k], 0, `${k} guards to 0 when revenue is 0 (no NaN)`);
}

// Picker default = latest confirmed job (last in stored order), matching pre-picker behavior.
const confirmed = confirmedJobs(seed);
assert.deepEqual(confirmed.map((j) => j.id), ["rti", "inv", "pd", "cp"], "confirmed jobs, in stored order");
assert.equal(confirmed[confirmed.length - 1].id, "cp", "default selection = latest confirmed job");

// Empty inputs — instructive-empty territory, never a crash.
assert.equal(rollupPipeline(null).phases.length, 4, "rollup handles null quotes");
assert.equal(realizedRoll(undefined).value, 0, "realized value 0 on empty");
assert.deepEqual(confirmedJobs("nonsense"), [], "confirmedJobs tolerates junk input");

console.log("PASS: Profit Pipeline fence — both gates byte-identical, Completed in money set, Money Map port byte-identical");
console.log("PASS: rollup per-phase subtotals, vocabulary law, reconciliation invariant (realized === salesFromInvoiced), iron guard (no grand total)");
