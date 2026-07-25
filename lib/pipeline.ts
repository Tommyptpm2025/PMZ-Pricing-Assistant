// The Profit Pipeline — the ONE birthplace for pipeline phase membership, the facts gate, and the
// per-phase rollup. See BUILD-F-PIPELINE-SPEC.md (Rev 4, addendum of record).
//
// Laws enforced here (untouchable):
//  • Two-gate law — facts at Ready to Invoice, money at Invoiced. The FACTS gate (CONFIRMED_STATUSES)
//    is exactly the MONEY gate (REALIZED_STATUSES) PLUS "Ready to Invoice".
//  • One birthplace — the money gate is IMPORTED from lib/qualifying (never redefined); the Overview
//    Money Map imports the facts gate from HERE instead of declaring a local const.
//  • No blending / iron guard — the rollup exposes PER-PHASE subtotals only. There is NO grand total
//    field, and PLANNING and CONFIRMED dollars are never summed together.
//  • Vocabulary law — the word "Revenue" is reserved for Ready-to-Invoice+ (phases 3–4). PLANNING
//    phases (1–2) carry "bid value" / "contract value" money labels, never "revenue".
import { REALIZED_STATUSES } from "./qualifying";
import type { QuoteStatus } from "./pmz-types";

// FACTS GATE (foreman-confirmed — Ready to Invoice or beyond). Single home. The Overview Money Map
// imports this. By construction it is the money gate plus exactly one status: "Ready to Invoice".
export const CONFIRMED_STATUSES = new Set<string>(["Ready to Invoice", ...REALIZED_STATUSES]);

/** Tier of a stored status: CONFIRMED at Ready-to-Invoice+, PLANNING below it. */
export type PipelineTier = "PLANNING" | "CONFIRMED";
export function tierOf(status: string): PipelineTier {
  return CONFIRMED_STATUSES.has(status) ? "CONFIRMED" : "PLANNING";
}

// The four forward phases, in order. `moneyLabel` obeys the vocabulary law: only phases 3–4 say
// "Revenue". Declined / Lost are the dead lane — not a forward phase, never summed (see rollup).
export interface PipelinePhaseDef {
  key: "bidding" | "production" | "ready" | "realized";
  label: string;
  tier: PipelineTier;
  statuses: QuoteStatus[];
  moneyLabel: string;   // vocabulary-law-compliant label for this phase's dollar figure
  source: string;       // "every number names its source"
}

export const PIPELINE_PHASES: PipelinePhaseDef[] = [
  {
    key: "bidding",
    label: "Draft · Sent for Acceptance",
    tier: "PLANNING",
    statuses: ["Draft", "Ready for Approval"],
    moneyLabel: "bid value",
    source: "from your bids",
  },
  {
    key: "production",
    label: "Accepted · Scheduled · Work Order Active",
    tier: "PLANNING",
    statuses: ["Approved", "Scheduled", "In Progress"],
    moneyLabel: "contract value",
    source: "contracted work",
  },
  {
    key: "ready",
    label: "Ready to Invoice",
    tier: "CONFIRMED",
    statuses: ["Ready to Invoice"],
    moneyLabel: "Revenue · contracted, awaiting invoice",
    source: "foreman-confirmed",
  },
  {
    key: "realized",
    label: "Invoiced · Paid · Completed",
    tier: "CONFIRMED",
    // Explicitly Invoiced + Paid + Completed (legacy). Completed is realized money and must count.
    statuses: ["Invoiced", "Paid", "Completed"],
    moneyLabel: "Revenue · realized",
    source: "from invoiced quotes",
  },
];

// The dead lane — quotes written off. Counted (for visibility) but NEVER summed into the pipeline.
export const DEAD_STATUSES = new Set<string>(["Declined", "Lost"]);

// A single job surfaced under its phase (drill-down, Story A). Minimal projection — the rollup
// already holds these quote objects; this is exactly them, not a re-filter (counted-means-visible).
// `value` is totalRevenue; its LABEL is governed by the phase's moneyLabel (vocab law) and never
// says "Revenue" for a PLANNING phase or the dead lane at render.
export interface PhaseJob {
  id: string;
  name: string;
  value: number;
  status: string;
}

export interface PhaseRoll {
  key: PipelinePhaseDef["key"];
  label: string;
  tier: PipelineTier;
  moneyLabel: string;
  source: string;
  statuses: QuoteStatus[];
  count: number;
  value: number;         // Σ totalRevenue for this phase (label governed by moneyLabel / vocab law)
  directCogs: number;
  indirectCogs: number;
  gross: number;         // value − direct − indirect (per-phase aggregate)
  jobs: PhaseJob[];      // the jobs behind the count — surfaced for drill-down (counted-means-visible)
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// The jobs behind a count, as minimal projections. Reuses the quote objects the rollup already
// filtered — one birthplace, no second pass.
function toPhaseJob(q: any): PhaseJob {
  const name = (typeof q?.jobName === "string" && q.jobName.trim())
    || q?.customerName || q?.customer || "Untitled";
  return { id: String(q?.id ?? ""), name, value: num(q?.totalRevenue), status: String(q?.status ?? "") };
}

/** Roll one phase up from the raw quotes. Per-phase subtotals only — no cross-phase math. */
function rollPhase(def: PipelinePhaseDef, quotes: any[]): PhaseRoll {
  const set = new Set<string>(def.statuses);
  const inPhase = quotes.filter((q) => set.has(q?.status));
  const value = inPhase.reduce((s, q) => s + num(q?.totalRevenue), 0);
  const directCogs = inPhase.reduce((s, q) => s + num(q?.directCogsDollars), 0);
  const indirectCogs = inPhase.reduce((s, q) => s + num(q?.indirectCogsDollars), 0);
  return {
    key: def.key,
    label: def.label,
    tier: def.tier,
    moneyLabel: def.moneyLabel,
    source: def.source,
    statuses: def.statuses,
    count: inPhase.length,
    value,
    directCogs,
    indirectCogs,
    gross: value - directCogs - indirectCogs,
    jobs: inPhase.map(toPhaseJob),
  };
}

// The accumulator. Returns per-phase rolls + a dead-lane COUNT only. Deliberately NO grand total:
// the iron guard forbids any field that sums PLANNING and CONFIRMED dollars together.
export interface PipelineRollup {
  phases: PhaseRoll[];
  dead: { count: number; jobs: PhaseJob[] };
}

export function rollupPipeline(quotes: unknown): PipelineRollup {
  const list = Array.isArray(quotes) ? quotes : [];
  const deadList = list.filter((q: any) => DEAD_STATUSES.has(q?.status));
  return {
    phases: PIPELINE_PHASES.map((def) => rollPhase(def, list)),
    dead: { count: deadList.length, jobs: deadList.map(toPhaseJob) },
  };
}

/** The Realized (phase-4) roll — the ONLY money. Its `value` is the reconciliation anchor: it must
 *  equal salesFromInvoiced(quotes).revenue and the Boss View revenue (one birthplace). */
export function realizedRoll(quotes: unknown): PhaseRoll {
  return rollPhase(PIPELINE_PHASES[3], Array.isArray(quotes) ? quotes : []);
}

// ── Money Map, per confirmed job ─────────────────────────────────────────────────────────────
// The confirmed jobs the Money Map picker offers, in stored order (default selection = the last =
// latest, matching the pre-picker behavior). CONFIRMED-only — the Money Map goes dark until a
// foreman-confirmed job exists, and the picker must not reopen that door to PLANNING jobs.
export function confirmedJobs(quotes: unknown): any[] {
  return (Array.isArray(quotes) ? quotes : []).filter((q: any) => CONFIRMED_STATUSES.has(q?.status));
}

export interface MoneyMapSnapshot {
  revenue: number;
  directCogs: number; directPercent: number;
  indirectCogs: number; indirectPercent: number;
  grossProfit: number; grossPercent: number;
  overhead: number; overheadPercent: number;
  netProfit: number; netPercent: number;
  // Law 55 (amended Jul 23, 2026): overhead is now a planned-rate allocation, not the old ratio.
  // When no planned overhead rate exists for the job's work type, overhead cannot be computed — the
  // rung renders an instructive empty state, and net (which depends on overhead) is unknown too.
  overheadAvailable: boolean;
  overheadRateLabel: string | null; // "at your planned overhead rate (X%)" when available, else null
}

// The Work Types planning inputs the amended overhead law reads (from pmz_work_type_planning_v1 +
// pmz_work_types_v2). See lib/overhead-planning.ts readOverheadPlanning().
export interface OverheadPlanning {
  pool: number;                            // Planned Annual Overhead
  weights: Record<string, number>;         // owner-set weight per work type NAME (default 1)
  targetRevenues: Record<string, number>;  // owner-set Target Revenue per work type NAME
  workTypeNames: string[];                 // the defined work type names
}

// LAW 55/51/52 — AMENDED Jul 23, 2026 (gaveled). A work type's PLANNED OVERHEAD RATE = its
// allocated overhead ÷ its target revenue. Allocated_i = pool × (targetRev_i·w_i) / Σ(targetRev_j·w_j),
// so rate_i = pool·w_i / Σ(targetRev_j·w_j). The OLD chart ÷ invoiced-revenue ratio is SUPERSEDED.
// Returns null — never the old ratio, never a fake 0, never a blowup — when the rate cannot be
// computed honestly: no pool, no target revenue for this work type, or no allocation base. The
// caller renders the empty state ("Set your Planned Annual Overhead in Work Types to allocate
// overhead"). Chart data is NOT consulted; the Overhead & Profit chart is now a ledger only.
export function plannedOverheadRate(
  workTypeName: string | null | undefined,
  planning: OverheadPlanning | null | undefined
): number | null {
  if (!planning || !workTypeName) return null;
  const pool = num(planning.pool);
  if (pool <= 0) return null;
  const w = (n: string) => {
    const x = planning.weights?.[n];
    return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 1;
  };
  const tr = (n: string) => {
    const x = num(planning.targetRevenues?.[n]);
    return x > 0 ? x : 0;
  };
  const target = tr(workTypeName);
  if (target <= 0) return null; // no target revenue for this work type → cannot allocate honestly
  // Ensure this work type is part of the distribution base even if it's missing from the list.
  const names = planning.workTypeNames?.includes(workTypeName)
    ? planning.workTypeNames
    : [...(planning.workTypeNames || []), workTypeName];
  const denom = names.reduce((s, n) => s + tr(n) * w(n), 0);
  if (denom <= 0) return null;
  const allocated = pool * ((target * w(workTypeName)) / denom);
  return allocated / target; // = pool·w / denom
}

// Map a single job to the profit ladder. Overhead is the job revenue × its work type's PLANNED
// overhead rate (Law 55 as amended). `overheadRate` is that rate (a fraction) or null when it can't
// be computed — in which case overhead and net are marked unavailable (empty state), never a fake 0.
export function moneyMapForJob(job: any, overheadRate: number | null): MoneyMapSnapshot {
  const rev = num(job?.totalRevenue);
  const directCogs = num(job?.directCogsDollars);
  const indirectCogs = num(job?.indirectCogsDollars);
  const overheadAvailable = overheadRate != null && Number.isFinite(overheadRate) && overheadRate >= 0;
  const overhead = overheadAvailable ? Math.round(rev * (overheadRate as number)) : 0;
  const grossProfit = rev - directCogs - indirectCogs;
  const netProfit = grossProfit - overhead;
  const pct = (n: number) => (rev > 0 ? Math.round((n / rev) * 1000) / 10 : 0);
  return {
    revenue: rev,
    directCogs, directPercent: pct(directCogs),
    indirectCogs, indirectPercent: pct(indirectCogs),
    grossProfit, grossPercent: pct(grossProfit),
    overhead, overheadPercent: pct(overhead),
    netProfit, netPercent: pct(netProfit),
    overheadAvailable,
    overheadRateLabel: overheadAvailable
      ? `at your planned overhead rate (${((overheadRate as number) * 100).toFixed(1)}%)`
      : null,
  };
}
