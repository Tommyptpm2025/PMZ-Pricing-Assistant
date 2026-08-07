/**
 * FLAT RATE vs REAL COSTS — mutually exclusive, and made so here (Cause 4, gaveled 2026-08-07).
 *
 * ── THE CONTRADICTION THIS MODULE EXISTS TO END ───────────────────────────────────────────────────
 * "This line is a flat rate — there is no labor, equipment, or material behind it" and a line carrying
 * eight hours of operator and four tons of mix are two statements about the same line, and one of them
 * is false. Until now the tick and the cost rows could both be set, quietly: the flag routed the line
 * past the send gate as a declared zero while the cost rows sat underneath it, real, entered by
 * somebody, and ignored by every price on the page.
 *
 * That is the worst shape a record can take — not wrong, but wrong INVISIBLY. The owner who ticked it
 * believes there are no costs; the estimator who typed them believes they are in the price; both are
 * looking at the same line.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────────────────────────────
 * The two states may never coexist SILENTLY. Three doors, all of them loud:
 *   • Entering a cost row on a flat-rate line AUTO-UNTICKS it, and says so on screen. The newest fact
 *     wins, because somebody just typed it; the stale declaration does not get to swallow it.
 *   • Ticking flat rate on a line that already HAS cost rows requires a stated confirm naming the
 *     dollars that will be ignored — and when confirmed, STAMPS the acknowledgement onto the line.
 *   • A line that already carries both (data written before this rule existed) wears a visible badge —
 *     "flat rate — N cost rows ignored" — instead of hiding the contradiction. Nothing is rewritten:
 *     old records are announced, not silently repaired, because a silent repair is another invisible
 *     decision and this module exists to stop those.
 *
 * ── WHAT THIS MODULE NEVER TOUCHES ────────────────────────────────────────────────────────────────
 * MONEY. The flat-rate flag governs PRINTING and GATING, never a stored figure. Nothing here computes,
 * rounds or writes a cost, a price or a margin; the cost rows it counts are left exactly where they
 * are, values intact, even when a confirm says they will be ignored. `costDollars` is supplied BY THE
 * CALLER (the Pricer's own lineBreakEvenCost) precisely so this file has no pricing of its own to
 * disagree with the worksheet.
 */

export type CostCatKey = "labor" | "equipment" | "material" | "misc" | "crew";

/** One entered cost row that actually carries a quantity — the coordinates the Pricer can scroll to. */
export interface CostRowRef {
  catKey: CostCatKey;
  idx: number;
  /** hours for labor/equipment/crew, quantity for material/misc. Always > 0 on a returned row. */
  amount: number;
}

// A row counts as REAL only when its quantity resolves to a finite number greater than zero. A blank,
// a zero, an empty string and a non-numeric string are all "not entered" — the same completeness test
// buildLineGateFailures uses, so the gate and this rule can never disagree about what a cost row is.
const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : NaN;
};
const real = (v: unknown): boolean => toNum(v) > 0;

/**
 * Every entered cost row on a line, in panel order. Crew usages count: a crew on a line is labor and
 * equipment by another name, and a flat-rate line carrying one is exactly as contradicted.
 */
export function costRows(item: any): CostRowRef[] {
  const out: CostRowRef[] = [];
  const scan = (rows: any[] | undefined, catKey: CostCatKey, field: "hours" | "quantity") => {
    (rows || []).forEach((e, idx) => {
      if (real(e?.[field])) out.push({ catKey, idx, amount: toNum(e[field]) });
    });
  };
  scan(item?.laborEntries, "labor", "hours");
  scan(item?.equipmentEntries, "equipment", "hours");
  scan(item?.materialEntries, "material", "quantity");
  scan(item?.miscellaneousEntries, "misc", "quantity");
  scan(item?.crewUsages, "crew", "hours");
  return out;
}

export function costRowCount(item: any): number {
  return costRows(item).length;
}

export function hasRealCostRows(item: any): boolean {
  return costRows(item).length > 0;
}

/** The forbidden shape: declared flat AND carrying entered costs. */
export function isFlatRateContradicted(item: any): boolean {
  return !!item?.flatRate && hasRealCostRows(item);
}

/**
 * The badge a contradicted line wears, or null when there is nothing to announce. Computed LIVE from
 * the current rows rather than read from the stamp, so a line whose costs changed after the
 * acknowledgement still reports what is actually on it today.
 */
export function flatRateBadge(item: any): string | null {
  const n = costRowCount(item);
  if (!item?.flatRate || n === 0) return null;
  return `flat rate — ${n} cost row${n === 1 ? "" : "s"} ignored`;
}

/** The plain sentence shown while flat rate is ticked, in place of the cost panels. */
export const FLAT_RATE_SECTION_NOTICE = "This line is flat rate — untick to add real costs.";

// ── TICKING FLAT RATE ─────────────────────────────────────────────────────────────────────────────

export interface FlatRateTickPlan {
  /** True when the line already carries entered costs — the confirm must be shown and answered. */
  requiresConfirm: boolean;
  costRowCount: number;
  costDollars: number;
  /** The stated confirm, naming the dollars. Null when there is nothing to confirm. */
  message: string | null;
}

/**
 * What ticking flat rate on this line means right now. `costDollars` comes from the caller's own
 * per-line cost function — this module never prices anything.
 *
 * The confirm NAMES THE MONEY on purpose. "This line has costs" is a shrug; "$1,240.00 of entered
 * costs will be IGNORED in pricing" is a decision somebody has to actually make.
 */
export function planFlatRateTick(item: any, costDollars: number): FlatRateTickPlan {
  const n = costRowCount(item);
  if (n === 0) {
    return { requiresConfirm: false, costRowCount: 0, costDollars: 0, message: null };
  }
  const dollars = Number.isFinite(costDollars) ? costDollars : 0;
  const money = `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return {
    requiresConfirm: true,
    costRowCount: n,
    costDollars: dollars,
    message:
      `This line has ${money} of entered costs. ` +
      `Flat rate will IGNORE them in pricing. Keep the costs but mark flat rate?`,
  };
}

/**
 * Tick flat rate. When the line carries costs the acknowledgement is STAMPED — who ran the confirm is
 * not asked (this is an estimating choice, not a permission), but WHEN and HOW MANY rows were knowingly
 * set aside are recorded, so a contradiction that survives is one somebody chose on a date.
 *
 * THE COST ROWS ARE NOT TOUCHED. "Keep the costs but mark flat rate" means exactly that: the entered
 * work stays on the record, unpriced but not deleted, because deleting somebody's typed facts to
 * resolve a flag is a far worse answer than carrying a labelled contradiction.
 */
export function applyFlatRateTick(item: any, now: () => string = () => new Date().toISOString()): any {
  const n = costRowCount(item);
  if (n === 0) {
    // Clean tick — no contradiction, so no stamp. Any stale stamp is cleared with it.
    const { flatRateAcknowledgedAt, flatRateAcknowledgedRows, ...rest } = item || {};
    return { ...rest, flatRate: true };
  }
  return { ...item, flatRate: true, flatRateAcknowledgedAt: now(), flatRateAcknowledgedRows: n };
}

/** Untick flat rate — always clean, and it drops the acknowledgement with the declaration. */
export function clearFlatRate(item: any): any {
  const { flatRateAcknowledgedAt, flatRateAcknowledgedRows, ...rest } = item || {};
  return { ...rest, flatRate: false };
}

// ── ENTERING A COST ON A FLAT-RATE LINE ───────────────────────────────────────────────────────────

export const COST_ENTRY_ANNOUNCEMENT =
  "Flat rate unticked — this line has entered costs now, so it prices from them.";

export interface CostEntryPlan {
  /** True when this entry contradicts a live flat-rate declaration and has cleared it. */
  autoUnticked: boolean;
  announcement: string | null;
}

/**
 * What happens when a real cost row lands on this line. If flat rate is ticked, it comes off — the
 * newest fact wins, because a person just typed it, and a stale declaration must never be allowed to
 * silently swallow entered work.
 *
 * `next` is the line as it should now be stored. Call this with the line ALREADY carrying its new row.
 */
export function applyCostEntry(
  item: any,
  now: () => string = () => new Date().toISOString()
): { next: any; plan: CostEntryPlan } {
  if (!item?.flatRate || !hasRealCostRows(item)) {
    return { next: item, plan: { autoUnticked: false, announcement: null } };
  }
  return {
    next: clearFlatRate(item),
    plan: { autoUnticked: true, announcement: COST_ENTRY_ANNOUNCEMENT },
  };
}

// ── ACROSS A WHOLE ESTIMATE ───────────────────────────────────────────────────────────────────────

export interface FlatRateContradiction {
  lineId: string;
  description: string;
  costRowCount: number;
  acknowledgedAt?: string;
}

/**
 * Every line that currently declares flat rate AND carries costs. Feeds the send flow's FIRST moment
 * of truth: this notice belongs beside the other gates on the first Save/Send click, never appearing
 * for the first time after the recipient step — a contradiction discovered at the last door is a
 * contradiction the owner has already stopped thinking about.
 */
export function flatRateContradictions(items: any[]): FlatRateContradiction[] {
  return (items || [])
    .filter((it) => isFlatRateContradicted(it))
    .map((it) => ({
      lineId: it?.id || "",
      description: it?.description || "Untitled line",
      costRowCount: costRowCount(it),
      ...(it?.flatRateAcknowledgedAt ? { acknowledgedAt: it.flatRateAcknowledgedAt } : {}),
    }));
}
