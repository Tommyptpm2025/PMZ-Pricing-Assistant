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
 * SCORECARD VIEW — goals vs BOOKED actuals, one screen, one question. All math is in
 * lib/sales-tracker.ts (computeScorecard); this only renders. Summary FIRST (company totals), then one
 * compact, expandable section per salesperson — each scored ONLY against their own goals, a dash where
 * no goal exists. Acceptance rates are NOT duplicated here; they live on the Bids & Jobs view.
 */

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const money0 = (n: number | null) => (n == null ? "—" : money(n));
const pct1 = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const delta = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`);
const deltaClass = (n: number | null) =>
  n == null ? "text-muted-foreground" : n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";

const YEARS = [2025, 2026, 2027];

// The source workbook's three-column shape, used at EVERY altitude (company → work type → person) so
// the eye learns one format once: GOALS (Sales $ / Margin % / Margin $) beside BOOKED (same three),
// then Delta $ and % to Goal. The vertical rules mark the Goals / Booked / to-Goal blocks.
function GroupedHead({ firstCol }: { firstCol: string }) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead rowSpan={2}>{firstCol}</TableHead>
        <TableHead colSpan={3} className="border-l text-center text-[11px] uppercase tracking-wide text-muted-foreground">Goals</TableHead>
        <TableHead colSpan={3} className="border-l text-center text-[11px] uppercase tracking-wide text-muted-foreground">Booked</TableHead>
        <TableHead rowSpan={2} className="border-l text-right">Delta $</TableHead>
        <TableHead rowSpan={2} className="text-right">% to Goal</TableHead>
      </TableRow>
      <TableRow>
        <TableHead className="border-l text-right">Sales $</TableHead>
        <TableHead className="text-right">Margin %</TableHead>
        <TableHead className="text-right">Margin $</TableHead>
        <TableHead className="border-l text-right">Sales $</TableHead>
        <TableHead className="text-right">Margin %</TableHead>
        <TableHead className="text-right">Margin $</TableHead>
      </TableRow>
    </TableHeader>
  );
}

// The eight data cells of the shared shape for one ScorecardCell. Goal side dashes when no goal exists
// (never 0%, never an error); the Booked side is always a real number.
function CellCols({ c }: { c: ScorecardCell }) {
  return (
    <>
      <TableCell className="border-l text-right tabular-nums">{money0(c.goal?.salesDollars ?? null)}</TableCell>
      <TableCell className="text-right tabular-nums">{pct1(c.goal?.marginPct ?? null)}</TableCell>
      <TableCell className="text-right tabular-nums">{money0(c.goal?.marginDollars ?? null)}</TableCell>
      <TableCell className="border-l text-right tabular-nums">{money(c.actual.salesDollars)}</TableCell>
      <TableCell className="text-right tabular-nums">{pct1(c.actual.marginPct)}</TableCell>
      <TableCell className="text-right tabular-nums">{money(c.actual.gpDollars)}</TableCell>
      <TableCell className={cn("border-l text-right tabular-nums", deltaClass(c.salesDeltaDollars))}>{delta(c.salesDeltaDollars)}</TableCell>
      <TableCell className="text-right tabular-nums font-semibold">{pct1(c.salesPercentToGoal)}</TableCell>
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
            <p className="text-sm text-muted-foreground">Goals vs booked wins. Set at bid, GP frozen.</p>
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
            Goals vs booked wins (what was sold, GP frozen at bid). Each salesperson scored against their own goals.
          </p>
        </div>
        {YearPicker}
      </div>

      {/* COMPANY BLOCK — "how is the year going": each work type in the three-column shape, rolled up
          to the bolded company Totals row. */}
      <Card className="card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Company — Goals vs Booked</CardTitle>
          <CardDescription>Each work type&rsquo;s goals beside what was booked, rolled up to the company total.</CardDescription>
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
