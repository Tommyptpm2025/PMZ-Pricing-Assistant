"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calculator, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { BUCKET_COLORS, COUNTDOWN_UNCOVERED } from "@/lib/pmz-types";
import { PnlOrganizer } from "@/components/PnlOrganizer";
import { salesFromInvoiced } from "@/lib/qualifying";

const STORAGE_KEY = "pmz_overhead_chart";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

// Phase 1: overhead is born in the P&L Organizer. Every overhead edit stamps the chart as
// Organizer-sourced, so the Boss View honestly reads "from your P&L Organizer".
function markOrganized(c: OverheadChart): OverheadChart {
  return { ...c, source: "pnl-organizer", sourceAppliedAt: new Date().toISOString() };
}

// Every line carries a Fixed/Variable tag — muscle-memory education, not analysis.
// Fixed: "costs you whether you do a dollar of work or a million." Variable: "no work, no cost."
type CostBehavior = "Fixed" | "Variable";

interface OverheadItem {
  id: string;
  category: string;
  amount: number;
  behavior: CostBehavior;
}

interface OverheadChart {
  items: OverheadItem[];
  monthlyRevenue: number;
  monthlyCogs: number;
  billableHours: number;
  notes: string;
  // Provenance (F2 Step 2, additive/optional): where the current numbers came from.
  // Absent ⇒ treated as "manual". Set to "pnl-organizer" only by an explicit handoff apply;
  // any hand-edit reverts it to "manual".
  source?: "manual" | "pnl-organizer";
  sourceAppliedAt?: string;
}

// Standard construction contractor overhead categories — now SUGGESTIONS (tap-to-add in the
// P&L Organizer), not a fixed pre-filled list (Phase 1). Nothing is seeded with make-believe amounts.
const SUGGESTED_OVERHEAD_CATEGORIES: string[] = [
  "Office Salaries & Wages",
  "Rent / Lease (Office)",
  "Utilities (Office)",
  "Insurance (General & Admin)",
  "Office Supplies & Equipment",
  "Marketing & Advertising",
  "Professional Fees (Legal, Accounting)",
  "Vehicle Expenses (Admin)",
  "Depreciation (Office Assets)",
  "Software & Subscriptions",
  "Training & Education",
  "Miscellaneous Overhead",
];

// A fresh chart is empty — overhead is entered in the Organizer; revenue/COGS are earned from
// invoiced quotes; billable hours starts at 0. No seeded numbers.
const DEFAULT_CHART: OverheadChart = {
  items: [],
  monthlyRevenue: 0,
  monthlyCogs: 0,
  billableHours: 0,
  notes: "",
};

export default function OverheadProfitPage() {
  const [chart, setChart] = React.useState<OverheadChart>({ ...DEFAULT_CHART });
  const [activeTab, setActiveTab] = React.useState<'manual' | 'import'>('manual');

  // Earned Revenue / COGS (invoiced-tier) — the ONE birthplace, shared with the Boss View.
  const [quotes, setQuotes] = React.useState<any[]>([]);
  React.useEffect(() => {
    try { setQuotes(JSON.parse(localStorage.getItem("pmz_saved_quotes") || "[]")); } catch {}
  }, []);
  const invoiced = React.useMemo(() => salesFromInvoiced(quotes), [quotes]);

  // Load from localStorage
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: OverheadChart = JSON.parse(raw);
        if (parsed.items && parsed.items.length > 0) {
          // Backfill the behavior tag for charts saved before V/F tagging shipped.
          setChart({
            ...parsed,
            items: parsed.items.map((it) => ({ ...it, behavior: it.behavior ?? "Fixed" })),
          });
        }
      }
    } catch {}
  }, []);

  // Persist
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chart));
    } catch {}
  }, [chart]);

  // Live calculations
  const totalOverhead = React.useMemo(
    () => chart.items.reduce((sum, item) => sum + (item.amount || 0), 0),
    [chart.items]
  );
  const overheadPercentOfRevenue = React.useMemo(
    () => (invoiced.revenue > 0 ? Math.round((totalOverhead / invoiced.revenue) * 1000) / 10 : 0),
    [totalOverhead, invoiced.revenue]
  );
  const overheadPerBillableHour = React.useMemo(
    () => (chart.billableHours > 0 ? Math.round((totalOverhead / chart.billableHours) * 100) / 100 : 0),
    [totalOverhead, chart.billableHours]
  );
  // Five true numbers — Revenue/COGS earned from invoiced quotes; Overhead entered.
  const grossProfit = React.useMemo(() => invoiced.revenue - invoiced.cogs, [invoiced.revenue, invoiced.cogs]);
  const netProfit = React.useMemo(() => grossProfit - totalOverhead, [grossProfit, totalOverhead]);
  const overheadRemaining = React.useMemo(() => Math.max(0, totalOverhead - grossProfit), [totalOverhead, grossProfit]);

  // Persist earned Revenue/COGS into the chart's assumptions so downstream readers (e.g. the Money
  // Map's overhead allocation, which reads chart.monthlyRevenue) use earned numbers. Guarded against a
  // write loop. Supersedes the old hand-typed assumptions per the "one birthplace" law.
  React.useEffect(() => {
    setChart((prev) =>
      prev.monthlyRevenue === invoiced.revenue && prev.monthlyCogs === invoiced.cogs
        ? prev
        : { ...prev, monthlyRevenue: invoiced.revenue, monthlyCogs: invoiced.cogs }
    );
  }, [invoiced.revenue, invoiced.cogs]);

  // ==================== OVERHEAD ENTRY (the single door — driven by the P&L Organizer) ====================
  function addOverheadLine(category?: string) {
    const newItem: OverheadItem = { id: createId(), category: (category || "").trim(), amount: 0, behavior: "Fixed" };
    setChart((prev) => markOrganized({ ...prev, items: [...prev.items, newItem] }));
  }
  function updateItemAmount(id: string, newAmount: number) {
    setChart((prev) => markOrganized({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, amount: Math.max(0, Math.round(newAmount * 100) / 100) } : it)),
    }));
  }
  function updateItemCategory(id: string, newCategory: string) {
    setChart((prev) => markOrganized({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, category: newCategory } : it)),
    }));
  }
  function toggleItemBehavior(id: string) {
    setChart((prev) => markOrganized({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, behavior: it.behavior === "Fixed" ? "Variable" : "Fixed" } : it)),
    }));
  }
  function removeOverheadLine(id: string) {
    setChart((prev) => markOrganized({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
  }

  // Billable hours — the one editable field on the read-only ledger. Never changes overhead provenance.
  function updateBillableHours(value: number) {
    setChart((prev) => ({ ...prev, billableHours: Math.max(0, value) }));
  }

  // ==================== RENDER ====================
  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary mt-0.5">
            <Calculator className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Overhead &amp; Profit</h1>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-primary/40 text-primary">PILLAR 1</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              The detailed engine for true fixed overhead. High-level dashboard lives on the Overview.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs - exact same style */}
      <div className="flex items-center">
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 text-sm">
          <button
            onClick={() => setActiveTab('manual')}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 font-medium transition-all",
              activeTab === 'manual'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Manual Overhead
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 font-medium transition-all",
              activeTab === 'import'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            P&amp;L Organizer
          </button>
        </div>
      </div>

      {/* Manual Overhead tab - Focused on Detailed Drill-Down Only */}
      <div className={activeTab === 'manual' ? '' : 'hidden'}>

        {/* Overhead Ledger — read-only (Phase 1). Overhead is entered in the P&L Organizer;
            Revenue/COGS are earned from invoiced quotes; Billable Hours is the one field set here. */}
        <Card className="card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" /> Overhead Ledger (read-only)
            </CardTitle>
            <CardDescription>
              A read-only ledger of your overhead — edit it in the{" "}
              <button type="button" onClick={() => setActiveTab('import')} className="underline underline-offset-2 text-primary">P&amp;L Organizer</button>.
              Revenue and Cost of Goods are earned from your invoiced quotes. Billable Hours is yours to set here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Earned Revenue/COGS (read-only) + the one editable field: Billable Hours */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <Label className="text-sm font-medium">Monthly Revenue</Label>
                {invoiced.count > 0 ? (
                  <>
                    <div className="mt-1.5 text-lg font-semibold tabular-nums">{formatMoney(invoiced.revenue)}</div>
                    <div className="text-[11px] text-muted-foreground">from invoiced quotes</div>
                  </>
                ) : (
                  <div className="mt-1.5 text-sm text-muted-foreground">Invoice a quote to see this.</div>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">Monthly COGS</Label>
                {invoiced.count > 0 ? (
                  <>
                    <div className="mt-1.5 text-lg font-semibold tabular-nums">{formatMoney(invoiced.cogs)}</div>
                    <div className="text-[11px] text-muted-foreground">from invoiced quotes</div>
                  </>
                ) : (
                  <div className="mt-1.5 text-sm text-muted-foreground">Invoice a quote to see this.</div>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">Billable Hours</Label>
                <Input
                  type="number"
                  value={chart.billableHours || ""}
                  onChange={(e) => updateBillableHours(parseFloat(e.target.value) || 0)}
                  className="mt-1.5 font-semibold text-lg text-center"
                  placeholder="0"
                />
                <div className="text-[11px] text-muted-foreground">the one number you set here</div>
              </div>
            </div>

            {/* Read-only ledger table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[52%]">Category</TableHead>
                    <TableHead className="text-right">Monthly Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chart.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground py-4">
                        No overhead entered yet. Add it in the{" "}
                        <button type="button" onClick={() => setActiveTab('import')} className="underline underline-offset-2 text-primary">P&amp;L Organizer</button>.
                      </TableCell>
                    </TableRow>
                  ) : chart.items.map((item) => {
                    const percent = totalOverhead > 0 ? Math.round((item.amount / totalOverhead) * 1000) / 10 : 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              aria-label={`Cost type: ${item.behavior}`}
                              className={cn(
                                "shrink-0 grid place-items-center w-6 h-6 rounded text-xs font-bold border",
                                item.behavior === "Fixed"
                                  ? "border-border bg-muted text-muted-foreground"
                                  : "border-primary/40 bg-primary/10 text-primary"
                              )}
                            >
                              {item.behavior === "Fixed" ? "F" : "V"}
                            </span>
                            <span className="font-medium">{item.category || <span className="text-muted-foreground italic">(unnamed)</span>}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatMoney(item.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{percent.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Fixed/Variable legend */}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
              <span><span className="font-bold text-foreground">F</span> Fixed — costs you whether you do a dollar of work or a million</span>
              <span><span className="font-bold text-primary">V</span> Variable — no work, no cost</span>
            </div>

            {/* Live Summary */}
            <div className="mt-8 rounded-xl border bg-surface-2 p-5">
              <div className="text-sm font-semibold tracking-wider text-muted-foreground mb-3">OVERHEAD SUMMARY</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Total Monthly Overhead</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mt-1">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalOverhead)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Overhead % of Revenue</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mt-1 text-primary">
                    {overheadPercentOfRevenue.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Overhead per Billable Hour</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mt-1 text-primary">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(overheadPerBillableHour)}
                  </div>
                </div>
              </div>
            </div>

            {/* The Bottom Line — Your Five True Numbers */}
            <div className="mt-4 rounded-xl border bg-surface-2 p-5">
              <div className="text-sm font-semibold tracking-wider text-muted-foreground mb-3">THE BOTTOM LINE — YOUR FIVE TRUE NUMBERS</div>
              <div className="divide-y divide-border/60">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Money in (Revenue)</span>
                  <span className="text-lg font-semibold tabular-nums">{invoiced.count > 0 ? formatMoney(invoiced.revenue) : "—"}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">What the work cost (Cost of Goods)</span>
                  <span className="text-lg font-semibold tabular-nums">{invoiced.count > 0 ? formatMoney(invoiced.cogs) : "—"}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Left after the work (Gross Profit)</span>
                  <span className="text-lg font-semibold tabular-nums">{invoiced.count > 0 ? formatMoney(grossProfit) : "—"}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Running the Business (Overhead)</span>
                  <span className="text-lg font-semibold tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(totalOverhead)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium">What you actually keep (Net Profit)</span>
                  <span
                    className={cn("text-xl font-bold tabular-nums", invoiced.count > 0 && netProfit < 0 && "text-destructive")}
                    style={invoiced.count > 0 && netProfit >= 0 ? { color: BUCKET_COLORS["Net Profit"].fg } : undefined}
                  >
                    {invoiced.count > 0 ? formatMoney(netProfit) : "—"}
                  </span>
                </div>
              </div>

              {/* Overhead Recovery Countdown — needs earned sales AND entered overhead. */}
              {(() => {
                if (invoiced.count === 0) {
                  return (
                    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
                      <div className="text-xs font-semibold tracking-wider text-muted-foreground">OVERHEAD RECOVERY COUNTDOWN</div>
                      <div className="mt-1 text-lg font-medium text-muted-foreground">Invoice a quote to start the countdown.</div>
                    </div>
                  );
                }
                if (totalOverhead <= 0) {
                  return (
                    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
                      <div className="text-xs font-semibold tracking-wider text-muted-foreground">OVERHEAD RECOVERY COUNTDOWN</div>
                      <div className="mt-1 text-lg font-medium text-muted-foreground">Enter your overhead to start the countdown.</div>
                    </div>
                  );
                }
                const covered = overheadRemaining <= 0;
                const tone = covered ? BUCKET_COLORS["Net Profit"] : COUNTDOWN_UNCOVERED;
                return (
                  <div className="mt-4 rounded-lg border p-4" style={{ borderColor: tone.border, backgroundColor: tone.bg }}>
                    <div className="text-xs font-semibold tracking-wider" style={{ color: tone.fg }}>OVERHEAD RECOVERY COUNTDOWN</div>
                    <div className="mt-1 text-lg font-bold" style={{ color: tone.fg }}>
                      {covered ? "Overhead covered — every dollar after this is profit." : <>You need <span className="tabular-nums">{formatMoney(overheadRemaining)}</span> more to cover overhead.</>}
                    </div>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Organizer tab — the single door for overhead entry (controlled by this page) */}
      <div className={activeTab === 'import' ? '' : 'hidden'}>
        <PnlOrganizer
          overheadItems={chart.items}
          invoiced={invoiced}
          suggestions={SUGGESTED_OVERHEAD_CATEGORIES}
          onAdd={addOverheadLine}
          onEditAmount={updateItemAmount}
          onEditCategory={updateItemCategory}
          onToggleBehavior={toggleItemBehavior}
          onRemove={removeOverheadLine}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground max-w-prose mx-auto">
        True overhead separation only. These values feed directly into accurate job costing in the Project Pricer.
      </p>
    </div>
  );
}
