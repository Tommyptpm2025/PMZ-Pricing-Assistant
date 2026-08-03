"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/people";
import { useSalesGoals, goalsForYear } from "@/lib/sales-goals";
import { useWorkTypes, resolveWorkTypeLabel } from "@/lib/work-types";
import { computeScorecard, type TrackerRow, type ScorecardCell } from "@/lib/sales-tracker";

/**
 * SCORECARD VIEW — goals vs booked vs performed, one screen, one question. All math is in
 * lib/sales-tracker.ts (computeScorecard); this only renders. Summary FIRST (company totals), then one
 * compact, expandable section per salesperson — each scored ONLY against their own goals, a dash where
 * no goal exists. Acceptance rates are NOT duplicated here; they live on the Bids & Jobs view.
 *
 * THREE BLOCKS, LAYERED NOT SMASHED: GOALS (what to sell) · BOOKED (what was sold) · PERFORMED (what
 * was earned). Delta $ and % to Goal stay anchored to BOOKED vs GOALS — that pair measures SELLING
 * performance and always has. There is deliberately NO second delta pair for performed: the two blocks
 * sitting side by side ARE the booked-vs-performed comparison, and a reader can subtract two aligned
 * columns without a third set of numbers competing for the same eye.
 */

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const money0 = (n: number | null) => (n == null ? "—" : money(n));
const pct1 = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const delta = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`);
const deltaClass = (n: number | null) =>
  n == null ? "text-muted-foreground" : n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";

const YEARS = [2025, 2026, 2027];

// SPACE: twelve columns beat nine, so the numeric columns are TIGHTENED rather than dropped — narrower
// gutters and a smaller numeric type size. Dollars keep full precision (no "$120K" rounding): on a money
// scorecard the exact number IS the product. The Table primitive already wraps in overflow-x-auto, so a
// narrow screen scrolls the grid inside its card instead of dropping a column or breaking the page.
const NUM = "px-1.5 py-2 text-right text-xs tabular-nums";
const NUM_HEAD = "px-1.5 text-right text-xs";
const GROUP_HEAD = "border-l px-1.5 text-center text-[11px] uppercase tracking-wide text-muted-foreground";

// The source workbook's three-column shape, used at EVERY altitude (company → work type → person) so the
// eye learns one format once: GOALS (Sales $ / Margin % / Margin $), then BOOKED (same three), then
// PERFORMED (same three), then Delta $ and % to Goal. Same header pattern, same order, every altitude.
// The vertical rules mark the four blocks.
function GroupedHead({ firstCol }: { firstCol: string }) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead rowSpan={2}>{firstCol}</TableHead>
        <TableHead colSpan={3} className={GROUP_HEAD}>Goals</TableHead>
        <TableHead colSpan={3} className={GROUP_HEAD}>Booked</TableHead>
        <TableHead colSpan={3} className={GROUP_HEAD} title="Recognized money: invoiced, paid, or completed jobs only. Margin appears only where the job's actual cost data is complete.">Performed</TableHead>
        <TableHead rowSpan={2} className={cn(NUM_HEAD, "border-l")} title="Booked sales minus goal sales — selling performance">Delta $</TableHead>
        <TableHead rowSpan={2} className={NUM_HEAD} title="Booked sales as a percent of goal sales — selling performance">% to Goal</TableHead>
      </TableRow>
      <TableRow>
        <TableHead className={cn(NUM_HEAD, "border-l")}>Sales $</TableHead>
        <TableHead className={NUM_HEAD}>Margin %</TableHead>
        <TableHead className={NUM_HEAD}>Margin $</TableHead>
        <TableHead className={cn(NUM_HEAD, "border-l")}>Sales $</TableHead>
        <TableHead className={NUM_HEAD}>Margin %</TableHead>
        <TableHead className={NUM_HEAD}>Margin $</TableHead>
        <TableHead className={cn(NUM_HEAD, "border-l")}>Sales $</TableHead>
        <TableHead className={NUM_HEAD}>Margin %</TableHead>
        <TableHead className={NUM_HEAD}>Margin $</TableHead>
      </TableRow>
    </TableHeader>
  );
}

// The eleven data cells of the shared shape for one ScorecardCell.
//   GOALS     — dashes when the boss set no goal for this cell (never 0%, never an error).
//   BOOKED    — always a real number; a won bid is a fact the moment it is accepted.
//   PERFORMED — dashes wherever the math handed back null, and those dashes MEAN something specific:
//               sales dashed = nothing recognized yet (an accepted-but-uninvoiced job shows under BOOKED
//               with PERFORMED blank); margin dashed with sales shown = recognized, but the job's actual
//               cost data is incomplete. Never a zero, never an estimate standing in for a fact.
//   DELTA / % — anchored to BOOKED vs GOALS, unchanged. Selling performance.
function CellCols({ c }: { c: ScorecardCell }) {
  const p = c.performed;
  // A cell can hold several recognized jobs where only some are fully costed. The margin is real but
  // covers only part of the cell — say so on hover rather than letting a partial margin read as a whole
  // one. No extra column: the coverage note costs zero width.
  const partial = p.jobCount > 0 && p.costedJobCount > 0 && p.costedJobCount < p.jobCount;
  const marginNote = partial
    ? `Margin covers ${p.costedJobCount} of ${p.jobCount} recognized jobs (${money(p.costedSalesDollars)} of ${money(p.salesDollars ?? 0)}) — the rest have incomplete cost data.`
    : p.jobCount > 0 && p.costedJobCount === 0
      ? "Recognized, but no job here has complete cost data yet — margin cannot be stated."
      : undefined;
  return (
    <>
      <TableCell className={cn(NUM, "border-l")}>{money0(c.goal?.salesDollars ?? null)}</TableCell>
      <TableCell className={NUM}>{pct1(c.goal?.marginPct ?? null)}</TableCell>
      <TableCell className={NUM}>{money0(c.goal?.marginDollars ?? null)}</TableCell>
      <TableCell className={cn(NUM, "border-l")}>{money(c.actual.salesDollars)}</TableCell>
      <TableCell className={NUM}>{pct1(c.actual.marginPct)}</TableCell>
      <TableCell className={NUM}>{money(c.actual.gpDollars)}</TableCell>
      <TableCell className={cn(NUM, "border-l")}>{money0(p.salesDollars)}</TableCell>
      <TableCell className={NUM} title={marginNote}>{pct1(p.marginPct)}</TableCell>
      <TableCell className={NUM} title={marginNote}>{money0(p.gpDollars)}</TableCell>
      <TableCell className={cn(NUM, "border-l", deltaClass(c.salesDeltaDollars))}>{delta(c.salesDeltaDollars)}</TableCell>
      <TableCell className={cn(NUM, "font-semibold")}>{pct1(c.salesPercentToGoal)}</TableCell>
    </>
  );
}

export function ScorecardView({ rows, people }: { rows: TrackerRow[]; people: Person[] }) {
  const { goals } = useSalesGoals();
  const { workTypes } = useWorkTypes();
  const [year, setYear] = React.useState(2026);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const nameByWorkTypeId = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const wt of workTypes) m.set(wt.id, wt.name);
    return m;
  }, [workTypes]);
  // Name-string history carried on the tracker rows (a saved quote's denormalized workType), keyed by
  // work-type id — the fallback for an id whose work type has since been renamed or retired. Only a
  // GENUINE name is captured: when a legacy row has no name, deriveTrackerRows sets workType = the id
  // (or "—"), so those are excluded — we never resurface a raw id as if it were a name.
  const historyNameByWorkTypeId = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (!r.workTypeId || m.has(r.workTypeId)) continue;
      if (r.workType && r.workType !== r.workTypeId && r.workType !== "—") m.set(r.workTypeId, r.workType);
    }
    return m;
  }, [rows]);
  // Never render a raw id to a human: live store name → retired name-string → "(unknown work type)".
  const wtLabel = (id: string) =>
    resolveWorkTypeLabel(id, (x) => nameByWorkTypeId.get(x), (x) => historyNameByWorkTypeId.get(x));

  const hasGoals = React.useMemo(() => goalsForYear(goals, year).length > 0, [goals, year]);
  const card = React.useMemo(() => computeScorecard(rows, goals, people, year), [rows, goals, people, year]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const YearPicker = (
    <select
      value={year}
      onChange={(e) => setYear(Number(e.target.value))}
      className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium"
      aria-label="Scorecard year"
    >
      {YEARS.map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  );

  if (!hasGoals) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Scorecard — {year}</h2>
            <p className="text-sm text-muted-foreground">Goals vs booked wins vs performed work.</p>
          </div>
          {YearPicker}
        </div>
        <Card className="card">
          <CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium">No goals set for {year} yet.</p>
            <p className="text-sm text-muted-foreground">
              Set them in{" "}
              <Link href="/goals-entry" className="text-primary underline-offset-2 hover:underline">Goals Entry</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const co = card.companyTotal;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Scorecard — {year}</h2>
          <p className="text-sm text-muted-foreground">
            Goals, booked wins (what was sold, GP frozen at bid), and performed work (what was recognized:
            invoiced, paid, or completed). Each salesperson scored against their own goals.
          </p>
        </div>
        {YearPicker}
      </div>

      {/* COMPANY BLOCK — "how is the year going": each work type in the three-column shape, rolled up
          to the bolded company Totals row. */}
      <Card className="card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Company — Goals vs Booked vs Performed</CardTitle>
          <CardDescription>
            Each work type&rsquo;s goals beside what was booked and what has actually been performed, rolled up
            to the company total. A dash under Performed means not yet recognized — never a zero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <GroupedHead firstCol="Work Type" />
            <TableBody>
              {card.workTypeIds.map((wtId) => (
                <TableRow key={wtId}>
                  <TableCell className="font-medium">{wtLabel(wtId)}</TableCell>
                  <CellCols c={card.byWorkType[wtId]} />
                </TableRow>
              ))}
              {/* Roll-up Totals row — bolded, like the workbook's Totals line */}
              <TableRow className="border-t-2 bg-muted/40 font-semibold">
                <TableCell>All work types</TableCell>
                <CellCols c={co} />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* One compact, expandable section per salesperson */}
      <Card className="card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">By Salesperson</CardTitle>
          <CardDescription>Compact by default — expand a name to see their work-type rows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {card.people.map((row) => {
            const isOpen = expanded.has(row.salespersonId);
            const t = row.total;
            return (
              <div key={row.salespersonId} className="rounded-lg border">
                {/* Compact summary line */}
                <button
                  onClick={() => toggle(row.salespersonId)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{row.salesperson}</span>
                  <span className="hidden sm:block text-xs text-muted-foreground">Goal {money0(t.goal?.salesDollars ?? null)}</span>
                  <span className="text-sm tabular-nums">Booked {money(t.actual.salesDollars)}</span>
                  <span className="hidden md:block text-xs text-muted-foreground tabular-nums">Performed {money0(t.performed.salesDollars)}</span>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums">{pct1(t.salesPercentToGoal)}</span>
                </button>

                {/* Expanded work-type rows — SAME three-column shape as the company block */}
                {isOpen && (
                  <div className="border-t px-2 pb-2 pt-1">
                    <Table>
                      <GroupedHead firstCol="Work Type" />
                      <TableBody>
                        {card.workTypeIds.map((wtId) => (
                          <TableRow key={wtId}>
                            <TableCell className="font-medium">{wtLabel(wtId)}</TableCell>
                            <CellCols c={row.byWorkType[wtId]} />
                          </TableRow>
                        ))}
                        {/* Person total — same shape, bolded */}
                        <TableRow className="border-t-2 bg-muted/40 font-semibold">
                          <TableCell>Total</TableCell>
                          <CellCols c={t} />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
