"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PercentInput } from "@/components/ui/percent-input";
import { Target } from "lucide-react";
import { usePeople, listActiveByRole } from "@/lib/people";
import { useWorkTypes } from "@/lib/work-types";
import { useSalesGoals, saveGoals, goalsForYear, findGoal, type SalesGoal } from "@/lib/sales-goals";

// The page renders; goal math + storage live in lib/sales-goals.ts. Goals are ENTERED here by the boss
// and nowhere else (Law 82 — PMZ Informs, the Owner Decides): no auto-adjustment, no enforcement, no
// triggers. This screen's one job is entry — reading performance is the Scorecard's job, a different
// screen, because the predecessor software smashed both onto one scroll.

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const pct = (n: number) => `${(n || 0).toFixed(1)}%`;
const marginDollars = (sales: number, marginPct: number) => sales * (marginPct / 100);

const YEARS = [2025, 2026, 2027];

export default function GoalsEntryPage() {
  const { people } = usePeople();
  const { workTypes } = useWorkTypes();
  const { goals } = useSalesGoals();
  const [year, setYear] = React.useState(2026);

  // Latest goals for write handlers (avoids a stale closure while typing across a cell's two inputs).
  const goalsRef = React.useRef<SalesGoal[]>(goals);
  goalsRef.current = goals;

  const salespeople = React.useMemo(() => listActiveByRole(people, "salesperson"), [people]);

  // Write one cell. A cell with BOTH targets cleared to zero is removed — an untyped cell never becomes
  // a phantom $0 goal (that's why we build the next array here rather than blind-upsert every blur).
  const writeCell = React.useCallback(
    (salespersonId: string, workTypeId: string, sales: number, marginPct: number) => {
      const filtered = goalsRef.current.filter(
        (g) => !(g.year === year && g.salespersonId === salespersonId && g.workTypeId === workTypeId)
      );
      const next =
        sales > 0 || marginPct > 0
          ? [...filtered, { year, salespersonId, workTypeId, goalSalesDollars: sales, goalMarginPct: marginPct }]
          : filtered;
      saveGoals(next);
    },
    [year]
  );

  // Context line: what the assignments add up to for the year (dollars + blended margin), so the boss
  // can see the total they're committing to. Derived, never stored, never a target of its own.
  const yearGoals = React.useMemo(() => goalsForYear(goals, year), [goals, year]);
  const assigned = React.useMemo(() => {
    const totalSales = yearGoals.reduce((s, g) => s + g.goalSalesDollars, 0);
    const totalMargin = yearGoals.reduce((s, g) => s + marginDollars(g.goalSalesDollars, g.goalMarginPct), 0);
    return {
      count: yearGoals.length,
      totalSales,
      totalMargin,
      blendedPct: totalSales > 0 ? (totalMargin / totalSales) * 100 : null,
    };
  }, [yearGoals]);

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary mt-0.5">
            <Target className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.02em]">Goals Entry</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              Set each salesperson&rsquo;s sales-dollar and margin targets by work type. You set them; PMZ
              never adjusts or enforces them — see how the year is going on the{" "}
              <Link href="/sales-tracker" className="text-primary underline-offset-2 hover:underline">
                Scorecard
              </Link>
              .
            </p>
          </div>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="self-start rounded-md border border-input bg-background px-3 py-2 text-sm font-medium"
          aria-label="Goal year"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Context line — what the assignments add up to */}
      <Card className="card">
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-2 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Assigned sales — {year}</div>
            <div className="text-2xl font-semibold tabular-nums">{money(assigned.totalSales)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Blended margin target</div>
            <div className="text-2xl font-semibold tabular-nums">{assigned.blendedPct == null ? "—" : pct(assigned.blendedPct)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Target margin $</div>
            <div className="text-2xl font-semibold tabular-nums">{money(assigned.totalMargin)}</div>
          </div>
          <div className="text-sm text-muted-foreground">
            {assigned.count} goal{assigned.count === 1 ? "" : "s"} assigned across {salespeople.length} salesperson
            {salespeople.length === 1 ? "" : "s"}
          </div>
        </CardContent>
      </Card>

      {/* Empty states, in plain language */}
      {salespeople.length === 0 ? (
        <Card className="card">
          <CardContent className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium">No salespeople on the roster yet.</p>
            <p className="text-sm text-muted-foreground">
              Add a salesperson in{" "}
              <Link href="/company-setup" className="text-primary underline-offset-2 hover:underline">Company Setup</Link>{" "}
              first — goals are set per person.
            </p>
          </CardContent>
        </Card>
      ) : workTypes.length === 0 ? (
        <Card className="card">
          <CardContent className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium">No work types yet.</p>
            <p className="text-sm text-muted-foreground">
              Add work types on the{" "}
              <Link href="/work-types" className="text-primary underline-offset-2 hover:underline">Work Types</Link>{" "}
              page — goals are set by work type.
            </p>
          </CardContent>
        </Card>
      ) : (
        // One card per salesperson: their grid of work types × (sales $, margin %). Stacked so the boss
        // enters one person's book at a time — the "salespeople × work types" grid, kept scannable.
        salespeople.map((sp) => {
          let personSales = 0;
          let personMargin = 0;
          for (const wt of workTypes) {
            const g = findGoal(goals, year, sp.id, wt.id);
            if (g) {
              personSales += g.goalSalesDollars;
              personMargin += marginDollars(g.goalSalesDollars, g.goalMarginPct);
            }
          }
          const personBlended = personSales > 0 ? (personMargin / personSales) * 100 : null;
          return (
            <Card key={sp.id} className="card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{sp.name}</CardTitle>
                <CardDescription>Sales-dollar and margin target per work type for {year}.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Work Type</TableHead>
                        <TableHead className="w-[180px]">Goal Sales $</TableHead>
                        <TableHead className="w-[140px]">Goal Margin %</TableHead>
                        <TableHead className="text-right">Goal Margin $</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workTypes.map((wt) => {
                        const g = findGoal(goals, year, sp.id, wt.id);
                        const sales = g?.goalSalesDollars ?? 0;
                        const mPct = g?.goalMarginPct ?? 0;
                        return (
                          <TableRow key={wt.id}>
                            <TableCell className="font-medium">{wt.name}</TableCell>
                            <TableCell>
                              <CurrencyInput
                                value={sales}
                                placeholder="0"
                                wrapperClassName="h-9"
                                onChange={(v) =>
                                  writeCell(sp.id, wt.id, v, findGoal(goalsRef.current, year, sp.id, wt.id)?.goalMarginPct ?? 0)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <PercentInput
                                value={mPct}
                                placeholder="0"
                                wrapperClassName="h-9"
                                onChange={(v) =>
                                  writeCell(sp.id, wt.id, findGoal(goalsRef.current, year, sp.id, wt.id)?.goalSalesDollars ?? 0, v)
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {sales > 0 && mPct > 0 ? money(marginDollars(sales, mPct)) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="border-t-2 bg-muted/40 font-semibold">
                        <TableCell>Assigned to {sp.name.split(" ")[0]}</TableCell>
                        <TableCell className="tabular-nums pl-3">{money(personSales)}</TableCell>
                        <TableCell className="tabular-nums pl-3">{personBlended == null ? "—" : pct(personBlended)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(personMargin)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
