// Reads the Work Types PLANNING inputs the amended overhead law (Law 55, Jul 23 2026) consumes:
// the Planned Annual Overhead pool + owner-set weights + owner-set Target Revenue per work type
// (pmz_work_type_planning_v1), and the set of work type names (pmz_work_types_v2). Pure IO — the
// rate math lives in lib/pipeline.ts (plannedOverheadRate), which this feeds.

import type { OverheadPlanning } from "./pipeline";

const PLANNING_KEY = "pmz_work_type_planning_v1";
const WORK_TYPES_KEY = "pmz_work_types_v2";

export function readOverheadPlanning(): OverheadPlanning {
  let pool = 0;
  let weights: Record<string, number> = {};
  let targetRevenues: Record<string, number> = {};
  let workTypeNames: string[] = [];
  try {
    const raw = localStorage.getItem(PLANNING_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.annualOverhead === "number") pool = p.annualOverhead;
      if (p?.weights && typeof p.weights === "object") weights = p.weights;
      if (p?.targetRevenues && typeof p.targetRevenues === "object") targetRevenues = p.targetRevenues;
    }
  } catch {}
  try {
    const raw = localStorage.getItem(WORK_TYPES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.workTypes)) {
        workTypeNames = parsed.workTypes.map((w: any) => w?.name).filter((n: any): n is string => typeof n === "string");
      }
    }
  } catch {}
  return { pool, weights, targetRevenues, workTypeNames };
}
