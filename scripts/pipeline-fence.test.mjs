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
import { REALIZED_STATUSES, salesFromInvoiced, qualifyingQuotes } from "../lib/qualifying.ts";
import {
  CONFIRMED_STATUSES,
  DEAD_STATUSES,
  PIPELINE_PHASES,
  tierOf,
  rollupPipeline,
  realizedRoll,
  confirmedJobs,
  moneyMapForJob,
  plannedOverheadRate,
} from "../lib/pipeline.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { netProfitColors, NET_LOSS_COLORS, BUCKET_COLORS } from "../lib/pmz-types.ts";

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

// ── Story A — drill-down: each phase carries the JOBS behind its count (counted-means-visible) ──
for (const p of roll.phases) assert.equal(p.jobs.length, p.count, `${p.key}: jobs.length === count`);
assert.deepEqual(byKey.bidding.jobs.map((j) => j.id).sort(), ["d", "s"], "Bidding jobs list");
assert.deepEqual(byKey.production.jobs.map((j) => j.id).sort(), ["a", "ip", "sc"], "Production jobs list");
assert.deepEqual(byKey.ready.jobs.map((j) => j.id), ["rti"], "Ready-to-Invoice jobs list");
assert.deepEqual(byKey.realized.jobs.map((j) => j.id).sort(), ["cp", "inv", "pd"], "Realized jobs list");
// List-level reconciliation: realized jobs === the qualifying (invoiced-tier) members, by id — the
// drill-down can never show a job the earned-sales total didn't count, or vice versa.
assert.deepEqual(
  realizedRoll(seed).jobs.map((j) => j.id).sort(),
  qualifyingQuotes(seed).map((q) => q.id).sort(),
  "RECONCILE: realized jobs === qualifyingQuotes members");
// PhaseJob projection carries the job's own value (drill-down row content).
assert.equal(byKey.realized.jobs.find((j) => j.id === "cp").value, 9000, "PhaseJob.value === totalRevenue");
// Dead lane lists its jobs (they route to PLANNING Analyze — never to the Map).
assert.equal(roll.dead.jobs.length, 2, "dead lane jobs listed");
assert.deepEqual(roll.dead.jobs.map((j) => j.id).sort(), ["dec", "lost"], "dead lane jobs list");

// ── Color law — Net Profit green ONLY when kept (>= 0); a loss renders destructive-red. The Analyze
// ladder (hero + rung 6, both tiers) and the Boss View share this SSOT (netProfitColors). ─────────
assert.deepEqual(netProfitColors(1500), BUCKET_COLORS["Net Profit"], "positive net → green");
assert.deepEqual(netProfitColors(0), BUCKET_COLORS["Net Profit"], "zero net → green (not a loss)");
assert.deepEqual(netProfitColors(-500), NET_LOSS_COLORS, "negative net → destructive-red (never green on a loss)");
assert.notEqual(NET_LOSS_COLORS.fg, BUCKET_COLORS["Net Profit"].fg, "loss red is not the kept-money green");

// ── 3 — Money Map overhead: the AMENDED Law 55/51/52 planned-rate allocation ──────────────────
// SUPERSEDED, gaveled Jul 23 2026: overhead = jobRevenue × (chart total ÷ invoiced revenue).
// NEW LAW: overhead = jobRevenue × the work type's PLANNED overhead rate, where
//   rate(wt) = allocated_overhead(wt) ÷ target_revenue(wt) = pool·w(wt) / Σ(targetRev_j·w_j).
// The overhead chart is NO LONGER consulted for per-job allocation.
const round4 = (n) => Math.round(n * 10000) / 10000;

// Planning fixture: pool $200k; two work types; equal weights; target revenues 800k / 200k.
const PLANNING = {
  pool: 200000,
  weights: {},                                       // both default to 1.0
  targetRevenues: { Paving: 800000, Sealcoat: 200000 },
  workTypeNames: ["Paving", "Sealcoat"],
};
// denom = 800000·1 + 200000·1 = 1,000,000.  Paving allocated = 200000×(800000/1e6)=160000,
// rate = 160000/800000 = 0.20.  Sealcoat allocated = 40000, rate = 40000/200000 = 0.20.
const rPaving = plannedOverheadRate("Paving", PLANNING);
const rSeal = plannedOverheadRate("Sealcoat", PLANNING);
assert.equal(round4(rPaving), 0.2, "Paving planned overhead rate = allocated ÷ target = 20%");
assert.equal(round4(rSeal), 0.2, "Sealcoat planned overhead rate = 20%");

// Owner weight is honored: a higher weight raises that work type's rate.
const wRate = plannedOverheadRate("Paving", { ...PLANNING, weights: { Paving: 3 } });
assert.ok(wRate > rPaving, "a higher owner weight raises that work type's overhead rate");

// moneyMapForJob applies the rate to job revenue — overhead = rev × rate, net = gross − overhead.
const pjob = { totalRevenue: 37755, directCogsDollars: 20000, indirectCogsDollars: 8000, workType: "Paving" };
const snap = moneyMapForJob(pjob, rPaving);
assert.equal(snap.overhead, Math.round(37755 * 0.2), "overhead = job revenue × planned rate");
assert.equal(snap.overhead, 7551, "overhead ties: 37755 × 20% = $7,551");
assert.equal(snap.overheadAvailable, true, "rate present → overhead available");
assert.equal(snap.overheadRateLabel, "at your planned overhead rate (20.0%)", "rung carries the source label");
assert.equal(snap.netProfit, snap.grossProfit - snap.overhead, "net = gross − planned overhead");

// EMPTY STATE — no rate: never the old ratio, never a fake $0, never a blowup. overhead 0 +
// flagged unavailable (the rung renders the instructive message); net stays finite (no NaN).
for (const [label, planning, wt] of [
  ["no pool", { ...PLANNING, pool: 0 }, "Paving"],
  ["no target revenue for this type", { ...PLANNING, targetRevenues: {} }, "Paving"],
  ["unknown work type", PLANNING, "Excavation"],
  ["null planning", null, "Paving"],
]) {
  const rate = plannedOverheadRate(wt, planning);
  assert.equal(rate, null, `${label}: rate is null (never a number)`);
  const s = moneyMapForJob(pjob, rate);
  assert.equal(s.overheadAvailable, false, `${label}: overhead unavailable → empty state`);
  assert.equal(s.overhead, 0, `${label}: overhead is 0, not a fabricated allocation`);
  assert.equal(s.overheadRateLabel, null, `${label}: no source label when unavailable`);
  assert.ok(Number.isFinite(s.netProfit), `${label}: net stays finite — no NaN, no blowup`);
}

// REVERT-TO-OLD-RATIO GUARD (structural): moneyMapForJob must NOT consult the overhead chart's
// invoiced-revenue ratio. Its body must not reference `monthlyRevenue` or sum `chart.items`.
const pipelineSrc = readFileSync(fileURLToPath(new URL("../lib/pipeline.ts", import.meta.url)), "utf8");
const mmStart = pipelineSrc.indexOf("export function moneyMapForJob");
const mmBody = pipelineSrc.slice(mmStart, pipelineSrc.indexOf("\n}", mmStart));
assert.ok(mmStart > 0, "moneyMapForJob found");
assert.ok(!mmBody.includes("monthlyRevenue"), "moneyMapForJob must NOT reference monthlyRevenue (old ratio superseded)");
assert.ok(!mmBody.includes("chart.items"), "moneyMapForJob must NOT sum chart.items (chart is a ledger only now)");

// rev=0 guard: clean, no NaN, even with a real rate.
const zero = moneyMapForJob({ totalRevenue: 0, directCogsDollars: 500, indirectCogsDollars: 250 }, 0.2);
assert.equal(zero.revenue, 0);
for (const k of ["directPercent", "indirectPercent", "grossPercent", "overheadPercent", "netPercent"]) {
  assert.equal(zero[k], 0, `${k} guards to 0 when revenue is 0 (no NaN)`);
}

// ── 3b — ONE BIRTHPLACE (v0.2.2 Law 9): the Overview and the ladder's rate read the SAME source ─
// Target Revenue is born ONLY in the persisted store (pmz_work_type_planning_v1.targetRevenues).
// There must be no display-only demo fallback that lets the Overview show a target the rate can't
// see (the Church Backlot break). Structural — the fallback lived inside a React component.
const repoFile = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
const wtSrc = repoFile("app/work-types/page.tsx");
const ohSrc = repoFile("lib/overhead-planning.ts");
assert.ok(wtSrc.includes("targetRevenue: plannedTargetRevenues[wt.name]"),
  "Overview reads Target Revenue from the persisted plannedTargetRevenues");
assert.ok(!wtSrc.includes("?? actual.targetRevenue"),
  "Overview must NOT fall back to demo target revenue — reintroducing the display fallback FAILS here (One Birthplace)");
assert.ok(wtSrc.includes("setPlannedTargetRevenues(Object.fromEntries(demoPerformance"),
  "demo targets are seeded INTO the store on the explicit Reset All Demo Data action (not silently on load)");
assert.ok(ohSrc.includes("p.targetRevenues"),
  "the ladder's readOverheadPlanning reads targetRevenues from the SAME persisted store");

// Picker default = latest confirmed job (last in stored order), matching pre-picker behavior.
const confirmed = confirmedJobs(seed);
assert.deepEqual(confirmed.map((j) => j.id), ["rti", "inv", "pd", "cp"], "confirmed jobs, in stored order");
assert.equal(confirmed[confirmed.length - 1].id, "cp", "default selection = latest confirmed job");

// Empty inputs — instructive-empty territory, never a crash.
assert.equal(rollupPipeline(null).phases.length, 4, "rollup handles null quotes");
assert.equal(realizedRoll(undefined).value, 0, "realized value 0 on empty");
assert.deepEqual(confirmedJobs("nonsense"), [], "confirmedJobs tolerates junk input");

console.log("PASS: Profit Pipeline fence — both gates byte-identical, Completed in money set; overhead = job revenue × planned rate (Law 55 amended), old chart÷invoiced ratio superseded + structurally barred");
console.log("PASS: rollup per-phase subtotals, vocabulary law, reconciliation invariant (realized === salesFromInvoiced), iron guard (no grand total)");
console.log("PASS: drill-down — each phase lists the jobs behind its count; realized jobs === qualifyingQuotes members; dead lane lists its jobs");
console.log("PASS: color law — Net Profit green when kept, destructive-red on a loss (netProfitColors SSOT)");
