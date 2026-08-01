import { useState, useEffect, useCallback } from 'react';

/**
 * SALES GOALS — the ONE home for sales goals (SALES-TRACKER-SPEC.md "Three Scorecards";
 * COMPANY-ROSTER-AND-ROLES.md). Persisted under 'pmz_sales_goals_v1'. SSR-safe (no window at module
 * load), safe JSON.
 *
 * A goal is ENTERED by the boss — Law 82, "PMZ Informs, the Owner Decides." Goals are NEVER derived,
 * NEVER auto-adjusted, NEVER inferred from actuals. The software surfaces the number the owner set and
 * nothing else; whether to raise, hold, or cut a target is the owner's judgment call, made outside the
 * software. This store therefore only reads back and writes what the boss typed.
 *
 * One goal per (year, salespersonId, workTypeId): a sales-dollar target and a margin-percent target for
 * that person, that work type, that year. The grid runs BY WORK TYPE (gaveled). Identity is by id on
 * every axis — salespersonId and workTypeId, never a hand-typed name string (the source workbook's
 * silent filter bugs become impossible by construction; SALES-TRACKER-SPEC.md "Fences").
 *
 * The pure core (goalsForYear / findGoal / upsertGoal / goalsForSalesperson / normalizeGoal) carries no
 * localStorage and is unit-tested directly by scripts/sales-tracker-fence.test.mjs. The hook +
 * load/save bind it to storage, mirroring the company-settings / people sync pattern (load on mount,
 * react to 'storage' + a custom update event).
 *
 * Do not use this key anywhere else: 'pmz_sales_goals_v1'
 */

export interface SalesGoal {
  year: number;
  salespersonId: string;
  workTypeId: string;
  goalSalesDollars: number; // the boss's sales-dollar target for this person × work type × year
  goalMarginPct: number;    // the boss's margin-percent target (whole percent, e.g. 25 = 25%)
}

export const SALES_GOALS_KEY = 'pmz_sales_goals_v1';
export const SALES_GOALS_EVENT = 'pmz-sales-goals-updated';

// The unique key of a goal cell — (year, salespersonId, workTypeId). Two goals with the same triple are
// the same cell; upsert replaces rather than duplicates.
function goalKey(year: number, salespersonId: string, workTypeId: string): string {
  return `${year}::${salespersonId}::${workTypeId}`;
}

// ── PURE CORE (no localStorage — the fence tests these directly) ─────────────────────────────────

// Defensive shape-normalize of one raw record into a SalesGoal. Returns null when the record can't be a
// real goal cell (no id on either axis, non-finite numbers). Goals are entered, so a malformed record is
// dropped rather than coerced to a misleading zero-dollar / zero-percent goal.
export function normalizeGoal(raw: any): SalesGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const salespersonId = typeof raw.salespersonId === 'string' ? raw.salespersonId.trim() : '';
  const workTypeId = typeof raw.workTypeId === 'string' ? raw.workTypeId.trim() : '';
  const year = Number(raw.year);
  const goalSalesDollars = Number(raw.goalSalesDollars);
  const goalMarginPct = Number(raw.goalMarginPct);
  if (!salespersonId || !workTypeId) return null;
  if (!Number.isFinite(year) || !Number.isFinite(goalSalesDollars) || !Number.isFinite(goalMarginPct)) return null;
  return { year, salespersonId, workTypeId, goalSalesDollars, goalMarginPct };
}

// Every goal set for a given year (all salespeople, all work types).
export function goalsForYear(goals: SalesGoal[], year: number): SalesGoal[] {
  return (goals || []).filter((g) => g.year === year);
}

// The single goal for one cell, or null when the boss has not set one. Null — never a fabricated
// zero-dollar goal — so the scorecard can show a dash and never score against a phantom target.
export function findGoal(
  goals: SalesGoal[],
  year: number,
  salespersonId: string,
  workTypeId: string
): SalesGoal | null {
  const key = goalKey(year, salespersonId, workTypeId);
  return (goals || []).find((g) => goalKey(g.year, g.salespersonId, g.workTypeId) === key) ?? null;
}

// Enter (or re-enter) one goal cell. Replaces the existing goal for the same (year, salespersonId,
// workTypeId) triple in place; appends when the cell is new. Never duplicates a cell.
export function upsertGoal(goals: SalesGoal[], goal: SalesGoal): SalesGoal[] {
  const key = goalKey(goal.year, goal.salespersonId, goal.workTypeId);
  let replaced = false;
  const next = (goals || []).map((g) => {
    if (goalKey(g.year, g.salespersonId, g.workTypeId) === key) {
      replaced = true;
      return goal;
    }
    return g;
  });
  return replaced ? next : [...next, goal];
}

// Every goal set for one salesperson (all years, all work types) — the salesperson-scorecard's own
// book. Callers scope to a year with goalsForYear when they need one year.
export function goalsForSalesperson(goals: SalesGoal[], salespersonId: string): SalesGoal[] {
  return (goals || []).filter((g) => g.salespersonId === salespersonId);
}

// ── LOCALSTORAGE BINDING ─────────────────────────────────────────────────────────────────────────

export function loadGoals(): SalesGoal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SALES_GOALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => normalizeGoal(r)).filter((g): g is SalesGoal => g !== null);
  } catch {
    return [];
  }
}

export function saveGoals(goals: SalesGoal[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SALES_GOALS_KEY, JSON.stringify(goals));
    window.dispatchEvent(new CustomEvent(SALES_GOALS_EVENT));
  } catch {
    // storage full / private mode / quota — fail silently (consistent with other PMZ storage)
  }
}

/**
 * Live-synced sales-goals hook. Reads on mount and re-reads on cross-tab 'storage' events and same-tab
 * SALES_GOALS_EVENT, so a boss's goals-entry edit propagates to any open scorecard without a reload.
 * `upsert` writes one cell through the pure upsertGoal, then persists + broadcasts.
 */
export function useSalesGoals() {
  const [goals, setGoals] = useState<SalesGoal[]>([]);

  const load = useCallback(() => {
    setGoals(loadGoals());
  }, []);

  useEffect(() => {
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === SALES_GOALS_KEY) load();
    };
    const onCustom = () => load();
    window.addEventListener('storage', onStorage);
    window.addEventListener(SALES_GOALS_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SALES_GOALS_EVENT, onCustom as EventListener);
    };
  }, [load]);

  const upsert = (goal: SalesGoal) => {
    const next = upsertGoal(goals, goal);
    setGoals(next);
    saveGoals(next);
  };

  return { goals, upsert, reload: load };
}
