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
import { Calculator, Plus, RotateCcw, ArrowUp, ArrowDown, Trash2, Save, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { BUCKET_COLORS, COUNTDOWN_UNCOVERED } from "@/lib/pmz-types";
import { PnlOrganizer } from "@/components/PnlOrganizer";
import { computeSummary, bucketTotal, type PnlWorksheet } from "@/lib/pnl-worksheet";

const STORAGE_KEY = "pmz_overhead_chart";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

// Any hand-edit to the chart's numbers/lines marks it manually sourced — provenance reverts to
// "manual" so the Boss View honestly says "from your Overhead chart" once you've touched it.
function markManual(c: OverheadChart): OverheadChart {
  return { ...c, source: "manual", sourceAppliedAt: undefined };
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

// Standard construction contractor overhead categories (overhead is largely Fixed by nature;
// Tom flips the variable ones — that tagging is the muscle-memory exercise).
const DEFAULT_CATEGORIES: { category: string }[] = [
  { category: "Office Salaries & Wages" },
  { category: "Rent / Lease (Office)" },
  { category: "Utilities (Office)" },
  { category: "Insurance (General & Admin)" },
  { category: "Office Supplies & Equipment" },
  { category: "Marketing & Advertising" },
  { category: "Professional Fees (Legal, Accounting)" },
  { category: "Vehicle Expenses (Admin)" },
  { category: "Depreciation (Office Assets)" },
  { category: "Software & Subscriptions" },
  { category: "Training & Education" },
  { category: "Miscellaneous Overhead" },
];

const DEFAULT_CHART: OverheadChart = {
  items: DEFAULT_CATEGORIES.map((cat, index) => ({
    id: createId(),
    category: cat.category,
    amount: [12500, 4200, 1850, 3100, 950, 2800, 1650, 1450, 980, 1250, 650, 1200][index] || 1000,
    behavior: "Fixed" as CostBehavior,
  })),
  monthlyRevenue: 185000,
  monthlyCogs: 112000,
  billableHours: 1420,
  notes: "Q1 2026 assumptions. Fuel costs trending +8%. Review insurance renewal in June.",
};

export default function OverheadProfitPage() {
  const [chart, setChart] = React.useState<OverheadChart>({ ...DEFAULT_CHART });
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<'manual' | 'import'>('manual');
  const [justSaved, setJustSaved] = React.useState(false);

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
  const totalOverhead = React.useMemo(() => {
    return chart.items.reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [chart.items]);

  const overheadPercentOfRevenue = React.useMemo(() => {
    if (!chart.monthlyRevenue || chart.monthlyRevenue === 0) return 0;
    return Math.round((totalOverhead / chart.monthlyRevenue) * 1000) / 10;
  }, [totalOverhead, chart.monthlyRevenue]);

  const overheadPerBillableHour = React.useMemo(() => {
    if (!chart.billableHours || chart.billableHours === 0) return 0;
    return Math.round((totalOverhead / chart.billableHours) * 100) / 100;
  }, [totalOverhead, chart.billableHours]);

  // The five true numbers (Goal 2) — all derived from the existing chart, no new fields.
  const grossProfit = React.useMemo(
    () => chart.monthlyRevenue - chart.monthlyCogs,
    [chart.monthlyRevenue, chart.monthlyCogs]
  );
  const netProfit = React.useMemo(() => grossProfit - totalOverhead, [grossProfit, totalOverhead]);
  // Overhead Recovery Countdown: gross profit "recovers" overhead; the remainder counts to zero.
  // When it hits zero, every dollar after is net profit.
  const overheadRemaining = React.useMemo(
    () => Math.max(0, totalOverhead - grossProfit),
    [totalOverhead, grossProfit]
  );

  // ==================== ACTIONS ====================
  function updateItemAmount(id: string, newAmount: number) {
    setChart((prev) => markManual({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, amount: Math.max(0, Math.round(newAmount * 100) / 100) } : item
      ),
    }));
  }

  function updateItemCategory(id: string, newCategory: string) {
    setChart((prev) => markManual({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, category: newCategory } : item
      ),
    }));
  }

  function toggleItemBehavior(id: string) {
    setChart((prev) => markManual({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id
          ? { ...item, behavior: item.behavior === "Fixed" ? "Variable" : "Fixed" }
          : item
      ),
    }));
  }

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;

    const newItem: OverheadItem = {
      id: createId(),
      category: name,
      amount: 0,
      behavior: "Fixed",
    };

    setChart((prev) => markManual({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setNewCategoryName("");
  }

  function removeCategory(id: string) {
    setChart((prev) => markManual({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  }

  function moveItem(index: number, direction: number) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= chart.items.length) return;

    const newItems = [...chart.items];
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];

    setChart((prev) => markManual({
      ...prev,
      items: newItems,
    }));
  }

  function saveChart() {
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  }

  function resetToDefaults() {
    setChart({ ...DEFAULT_CHART });
    setNewCategoryName("");
    setJustSaved(false);
  }

  function updateAssumption(field: "monthlyRevenue" | "monthlyCogs" | "billableHours", value: number) {
    setChart((prev) => markManual({
      ...prev,
      [field]: Math.max(0, value),
    }));
  }

  function updateNotes(newNotes: string) {
    setChart((prev) => ({
      ...prev,
      notes: newNotes,
    }));
  }

  // ==================== F2 STEP 2 — OVERHEAD HANDOFF (one-way, explicit) ====================
  // The P&L Organizer requests an apply; we confirm (naming exactly what's replaced), then map the
  // worksheet's Overhead-bucket lines into the chart items and revenue/COGS assumptions. billableHours
  // and notes are preserved. Provenance is stamped "pnl-organizer". Nothing flows without this action.
  const [applyRequest, setApplyRequest] = React.useState<PnlWorksheet | null>(null);

  // Called by the Organizer's "Use these as my Overhead chart" button. The button is disabled when the
  // worksheet's overhead total is 0, so a real chart can never be wiped by an empty Organizer.
  function requestApply(ws: PnlWorksheet) {
    if (bucketTotal(ws, "Overhead") <= 0) return; // extra guard even if the button somehow fires
    setApplyRequest(ws);
  }

  // Download the current chart as a dated JSON backup before replacing it.
  function exportCurrentChart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || JSON.stringify(chart);
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pmz-overhead-chart-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {}
  }

  function confirmApply() {
    const ws = applyRequest;
    if (!ws) return;
    const summary = computeSummary(ws);
    const overheadLines = ws.lines.filter((l) => l.bucket === "Overhead");
    setChart((prev) => ({
      ...prev,                                   // preserve billableHours + notes
      items: overheadLines.map((l) => ({
        id: createId(),
        category: l.label.trim() || "Untitled overhead",
        amount: Math.max(0, Math.round((l.amount || 0) * 100) / 100),
        behavior: l.behavior,
      })),
      monthlyRevenue: Math.max(0, ws.revenue || 0),
      monthlyCogs: Math.max(0, summary.costOfGoods),
      source: "pnl-organizer",
      sourceAppliedAt: new Date().toISOString(),
    }));
    setApplyRequest(null);
    setActiveTab("manual"); // reveal the now-populated chart
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
        <Button variant="outline" size="sm" onClick={resetToDefaults} className="self-start sm:self-auto">
          <RotateCcw className="mr-2 h-4 w-4" /> Reset to Standard
        </Button>
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

        {/* Detailed Chart of Accounts - The core editor (Pillar 1) */}
        <Card className="card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Detailed Chart of Accounts</CardTitle>
                <CardDescription>
                  Enter your actual fixed overhead costs. Add, remove, or reorder categories as needed. This powers the Boss View on the Overview.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveChart} size="sm" variant="default">
                  <Save className="mr-2 h-4 w-4" /> Save Chart of Accounts
                </Button>
                <Button onClick={resetToDefaults} size="sm" variant="outline">
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Assumptions (kept for the detailed view) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <Label className="text-sm font-medium">Monthly Revenue</Label>
                <CurrencyInput
                  value={chart.monthlyRevenue}
                  onChange={(v) => updateAssumption("monthlyRevenue", v)}
                  className="mt-1.5 font-semibold"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Monthly COGS (Direct)</Label>
                <CurrencyInput
                  value={chart.monthlyCogs}
                  onChange={(v) => updateAssumption("monthlyCogs", v)}
                  className="mt-1.5 font-semibold"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Billable Hours (from Rate Builders)</Label>
                <Input
                  type="number"
                  value={chart.billableHours}
                  onChange={(e) => updateAssumption("billableHours", parseFloat(e.target.value) || 0)}
                  className="mt-1.5 font-semibold text-lg text-center"
                />
              </div>
            </div>

            {/* The Editable Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[42%]">Category</TableHead>
                    <TableHead className="text-right">Monthly Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chart.items.map((item, index) => {
                    const percent = totalOverhead > 0 ? Math.round((item.amount / totalOverhead) * 1000) / 10 : 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleItemBehavior(item.id)}
                              title={
                                item.behavior === "Fixed"
                                  ? "Fixed: costs you whether you do a dollar of work or a million. Click to change."
                                  : "Variable: no work, no cost. Click to change."
                              }
                              aria-label={`Cost type: ${item.behavior}. Click to toggle.`}
                              className={cn(
                                "shrink-0 grid place-items-center w-6 h-6 rounded text-xs font-bold border transition-colors",
                                item.behavior === "Fixed"
                                  ? "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                                  : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                              )}
                            >
                              {item.behavior === "Fixed" ? "F" : "V"}
                            </button>
                            <Input
                              value={item.category}
                              onChange={(e) => updateItemCategory(item.id, e.target.value)}
                              className="border-0 bg-transparent p-0 h-auto font-medium focus-visible:ring-1"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <CurrencyInput
                            value={item.amount}
                            onChange={(v) => updateItemAmount(item.id, v)}
                            wrapperClassName="h-9"
                            className="font-medium text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {percent.toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => moveItem(index, 1)} disabled={index === chart.items.length - 1}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => removeCategory(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Fixed/Variable legend — plain-language definitions live in the UI */}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
              <span><span className="font-bold text-foreground">F</span> Fixed — costs you whether you do a dollar of work or a million</span>
              <span><span className="font-bold text-primary">V</span> Variable — no work, no cost</span>
            </div>

            {/* Add new */}
            <div className="flex gap-2 mt-4">
              <Input
                placeholder="New overhead category (e.g. Recruiting)"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
                className="flex-1"
              />
              <Button onClick={addCategory} disabled={!newCategoryName.trim()}>
                <Plus className="mr-2 h-4 w-4" /> Add Category
              </Button>
            </div>

            {/* Live Summary (kept inside detailed for context) */}
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

            {/* The Bottom Line — Your Five True Numbers (Goal 2) */}
            <div className="mt-4 rounded-xl border bg-surface-2 p-5">
              <div className="text-sm font-semibold tracking-wider text-muted-foreground mb-3">THE BOTTOM LINE — YOUR FIVE TRUE NUMBERS</div>
              <div className="divide-y divide-border/60">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Money in (Revenue)</span>
                  <span className="text-lg font-semibold tabular-nums">{formatMoney(chart.monthlyRevenue)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">What the work cost (Cost of Goods)</span>
                  <span className="text-lg font-semibold tabular-nums">{formatMoney(chart.monthlyCogs)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Left after the work (Gross Profit)</span>
                  <span className="text-lg font-semibold tabular-nums">{formatMoney(grossProfit)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm" style={{ color: BUCKET_COLORS["Overhead"].fg }}>Running the Business (Overhead)</span>
                  <span className="text-lg font-semibold tabular-nums" style={{ color: BUCKET_COLORS["Overhead"].fg }}>{formatMoney(totalOverhead)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium">What you actually keep (Net Profit)</span>
                  <span
                    className={cn("text-xl font-bold tabular-nums", netProfit < 0 && "text-destructive")}
                    style={netProfit >= 0 ? { color: BUCKET_COLORS["Net Profit"].fg } : undefined}
                  >
                    {formatMoney(netProfit)}
                  </span>
                </div>
              </div>

              {/* Overhead Recovery Countdown — three states, computed from the live five numbers.
                  Empty (no overhead entered): NEUTRAL/muted — green must be EARNED, never shown on a
                  blank slate. Short: amber warning (COUNTDOWN_UNCOVERED). Covered: green (Net Profit). */}
              {(() => {
                // No real overhead yet → neutral prompt, short-circuit before any green/amber verdict.
                if (totalOverhead <= 0) {
                  return (
                    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
                      <div className="text-xs font-semibold tracking-wider text-muted-foreground">
                        OVERHEAD RECOVERY COUNTDOWN
                      </div>
                      <div className="mt-1 text-lg font-medium text-muted-foreground">
                        Enter your overhead to start the countdown.
                      </div>
                    </div>
                  );
                }
                const covered = overheadRemaining <= 0;
                const tone = covered ? BUCKET_COLORS["Net Profit"] : COUNTDOWN_UNCOVERED;
                return (
                  <div
                    className="mt-4 rounded-lg border p-4"
                    style={{ borderColor: tone.border, backgroundColor: tone.bg }}
                  >
                    <div className="text-xs font-semibold tracking-wider" style={{ color: tone.fg }}>
                      OVERHEAD RECOVERY COUNTDOWN
                    </div>
                    <div className="mt-1 text-lg font-bold" style={{ color: tone.fg }}>
                      {covered ? (
                        "Overhead covered — every dollar after this is profit."
                      ) : (
                        <>You need <span className="tabular-nums">{formatMoney(overheadRemaining)}</span> more to cover overhead.</>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Notes */}
            <div className="mt-4">
              <Label className="text-sm font-medium">Monthly Notes &amp; Trends</Label>
              <textarea
                value={chart.notes}
                onChange={(e) => updateNotes(e.target.value)}
                className="mt-1.5 w-full min-h-[82px] rounded-md border border-input bg-background p-3 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Notes for this month’s overhead (one-time items, seasonal changes, etc.)"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Saved with your chart for future monthly comparisons.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Organizer tab — manual entry + the five true numbers (Build F2) */}
      <div className={activeTab === 'import' ? '' : 'hidden'}>
        <PnlOrganizer onRequestApply={requestApply} />
      </div>

      <p className="text-center text-xs text-muted-foreground max-w-prose mx-auto">
        True overhead separation only. These values feed directly into accurate job costing in the Project Pricer.
      </p>

      {/* Overhead handoff — confirm dialog. Names EXACTLY what's replaced (line count + $ total),
          same standard as the delete confirms; offers a backup export first. */}
      <Dialog open={!!applyRequest} onOpenChange={(open) => !open && setApplyRequest(null)}>
        <DialogContent>
          {applyRequest && (() => {
            const inLines = applyRequest.lines.filter((l) => l.bucket === "Overhead");
            const inTotal = bucketTotal(applyRequest, "Overhead");
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Replace your Overhead chart with the P&amp;L Organizer’s numbers?</DialogTitle>
                  <DialogDescription>
                    This replaces your current Overhead chart — <strong>{chart.items.length} {chart.items.length === 1 ? "line" : "lines"}, {formatMoney(totalOverhead)} total</strong> — with the
                    Organizer’s overhead: <strong>{inLines.length} {inLines.length === 1 ? "line" : "lines"}, {formatMoney(inTotal)}</strong>. Revenue and Cost of Goods are updated too;
                    billable hours and notes are kept. This can’t be undone — export a backup first.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="sm:justify-between gap-2">
                  <Button variant="outline" onClick={exportCurrentChart}>
                    <Download className="mr-2 h-4 w-4" /> Export current chart
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setApplyRequest(null)}>Cancel</Button>
                    <Button variant="destructive" onClick={confirmApply}>Replace chart</Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
